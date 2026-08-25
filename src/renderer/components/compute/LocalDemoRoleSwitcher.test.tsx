// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LocalDemoSession } from '@/packages/computeCenter'

const mocks = vi.hoisted(() => ({
  getLocalDemoCapability: vi.fn(),
  switchLocalDemoRole: vi.fn(),
}))

vi.mock('@/packages/computeCenter', () => ({
  getLocalDemoCapability: mocks.getLocalDemoCapability,
  switchLocalDemoRole: mocks.switchLocalDemoRole,
}))

import { LocalDemoRoleSwitcher } from './LocalDemoRoleSwitcher'

const session = (accountId: string): LocalDemoSession => ({
  token: `token-${accountId}`,
  accountId,
  expiresAt: '2026-08-25T13:10:00Z',
})

function renderSwitcher(origin: string, onSession = vi.fn()) {
  return {
    onSession,
    ...render(
      <MantineProvider>
        <LocalDemoRoleSwitcher apiOrigin={origin} onSession={onSession} />
      </MantineProvider>
    ),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getLocalDemoCapability.mockResolvedValue({ enabled: true, roles: ['ADMIN', 'HOSTING_TENANT', 'GPU_BUYER'] })
  mocks.switchLocalDemoRole.mockResolvedValue(session('9007199254740993001'))
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('renders local roles only after a strict affirmative capability on an exact HTTP loopback origin', async () => {
  renderSwitcher('http://localhost:8080')

  expect(await screen.findByRole('group', { name: '本地演示角色' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '管理员' })).toBeTruthy()

  cleanup()
  renderSwitcher('https://localhost:8080')
  await waitFor(() => expect(mocks.getLocalDemoCapability).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole('group', { name: '本地演示角色' })).toBeNull()

  cleanup()
  renderSwitcher('http://localhost:8080@remote.example')
  expect(screen.queryByRole('group', { name: '本地演示角色' })).toBeNull()

  cleanup()
  mocks.getLocalDemoCapability.mockResolvedValue({ enabled: false, roles: [] })
  renderSwitcher('http://127.0.0.1:8080')
  await waitFor(() => expect(mocks.getLocalDemoCapability).toHaveBeenCalledTimes(2))
  expect(screen.queryByRole('group', { name: '本地演示角色' })).toBeNull()
})

it('keeps the latest role request authoritative when an earlier role response arrives late', async () => {
  let resolveAdmin: ((value: LocalDemoSession) => void) | undefined
  let resolveBuyer: ((value: LocalDemoSession) => void) | undefined
  mocks.switchLocalDemoRole.mockImplementation(
    (role: string) =>
      new Promise<LocalDemoSession>((resolve) => {
        if (role === 'ADMIN') resolveAdmin = resolve
        if (role === 'GPU_BUYER') resolveBuyer = resolve
      })
  )
  const { onSession } = renderSwitcher('http://[::1]:8080')

  fireEvent.click(await screen.findByRole('button', { name: '管理员' }))
  fireEvent.click(screen.getByRole('button', { name: '管理员' }))
  fireEvent.click(screen.getByRole('button', { name: 'GPU 买家' }))
  resolveBuyer?.(session('9007199254740993002'))
  await waitFor(() => expect(onSession).toHaveBeenCalledWith(session('9007199254740993002')))

  resolveAdmin?.(session('9007199254740993001'))
  await waitFor(() => expect(onSession).toHaveBeenCalledTimes(1))
})

it('allows retry after a session error without preserving an obsolete role result', async () => {
  mocks.switchLocalDemoRole
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(session('9007199254740993003'))
  const { onSession } = renderSwitcher('http://127.0.0.1:8080')

  fireEvent.click(await screen.findByRole('button', { name: '托管租户' }))
  expect(await screen.findByText('offline')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '托管租户' }))

  await waitFor(() => expect(onSession).toHaveBeenCalledWith(session('9007199254740993003')))
})

it('reports a timed-out session request and permits a retry', async () => {
  mocks.switchLocalDemoRole
    .mockImplementationOnce(
      (_: string, signal: AbortSignal) =>
        new Promise<LocalDemoSession>((_, reject) =>
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        )
    )
    .mockResolvedValueOnce(session('9007199254740993004'))
  const { onSession } = renderSwitcher('http://localhost:8080')
  await screen.findByRole('button', { name: '管理员' })

  vi.useFakeTimers()
  try {
    fireEvent.click(screen.getByRole('button', { name: '管理员' }))
    await act(async () => {
      vi.advanceTimersByTime(15_000)
      await Promise.resolve()
    })
    expect(screen.getByText('演示角色切换超时，请重试')).toBeTruthy()
  } finally {
    vi.useRealTimers()
  }

  fireEvent.click(screen.getByRole('button', { name: '管理员' }))
  await waitFor(() => expect(onSession).toHaveBeenCalledWith(session('9007199254740993004')))
})
