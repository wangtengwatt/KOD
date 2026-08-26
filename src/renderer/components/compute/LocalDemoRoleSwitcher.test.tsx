// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LocalDemoScenario, LocalDemoSession } from '@/packages/computeCenter'
import { authInfoStore } from '@/stores/authInfoStore'

const mocks = vi.hoisted(() => ({
  getLocalDemoCapability: vi.fn(),
  getLocalDemoScenario: vi.fn(),
  runLocalDemoScenario: vi.fn(),
  switchLocalDemoRole: vi.fn(),
}))

vi.mock('@/packages/computeCenter', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/packages/computeCenter')>()
  return {
    ...original,
    getLocalDemoCapability: mocks.getLocalDemoCapability,
    getLocalDemoScenario: mocks.getLocalDemoScenario,
    runLocalDemoScenario: mocks.runLocalDemoScenario,
    switchLocalDemoRole: mocks.switchLocalDemoRole,
  }
})

import { LocalDemoRoleSwitcher } from './LocalDemoRoleSwitcher'

const demoExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString()

const session = (accountId: string): LocalDemoSession => ({
  token: `token-${accountId}`,
  accountId,
  expiresAt: demoExpiresAt,
})

const initialScenario: LocalDemoScenario = {
  scenarioKey: 'kai-hosting-lottery-v1',
  stage: 'SETTLED',
  adminAccountId: '9007199254740993101',
  tenantAccountId: '9007199254740993102',
  buyerAccountId: '9007199254740993103',
  skuId: '9007199254740993104',
  leaseId: '9007199254740993105',
  productId: '9007199254740993106',
  reservationId: '9007199254740993107',
  buyerEligibilityId: '9007199254740993108',
  tenantEligibilityId: null,
  monthlyRentCardHours: '30.000',
  salePriceCardHours: '12.000',
  settledIncomeCardHours: '12.000',
  buyerRewardCardHours: '0.060',
  tenantRewardCardHours: '0.000',
  skuAvailableInventory: 0,
  reconciled: false,
}

const completedScenario: LocalDemoScenario = {
  ...initialScenario,
  stage: 'COMPLETED',
  tenantEligibilityId: '9007199254740993109',
  tenantRewardCardHours: '0.120',
  skuAvailableInventory: 1,
  reconciled: true,
}

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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getLocalDemoCapability.mockReset()
  mocks.getLocalDemoScenario.mockReset()
  mocks.runLocalDemoScenario.mockReset()
  mocks.switchLocalDemoRole.mockReset()
  authInfoStore.setState({
    accessToken: 'owner-a-access',
    refreshToken: 'owner-a-refresh',
    accountId: '9007199254740993001',
    loginEmail: 'owner-a@kod.test',
  })
  mocks.getLocalDemoCapability.mockResolvedValue({ enabled: true, roles: ['ADMIN', 'HOSTING_TENANT', 'GPU_BUYER'] })
  mocks.getLocalDemoScenario.mockResolvedValue(initialScenario)
  mocks.runLocalDemoScenario.mockResolvedValue(completedScenario)
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
  authInfoStore.getState().clearTokens()
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

  cleanup()
  mocks.getLocalDemoCapability.mockRejectedValue(new Error('unavailable'))
  renderSwitcher('http://[::1]:8080')
  await waitFor(() => expect(mocks.getLocalDemoCapability).toHaveBeenCalledTimes(3))
  expect(screen.queryByRole('group', { name: '本地演示角色' })).toBeNull()
})

it('shows authoritative scenario state and keeps the idempotent run action single-flight', async () => {
  const pendingRun = deferred<LocalDemoScenario>()
  mocks.runLocalDemoScenario.mockImplementationOnce(() => pendingRun.promise)
  renderSwitcher('http://localhost:8080')

  expect(await screen.findByText('阶段：SETTLED')).toBeTruthy()
  expect(screen.getByText('reconciled: false')).toBeTruthy()
  expect(screen.getByText('月租 30.000 卡时')).toBeTruthy()
  expect(screen.getByText('销售价 12.000 卡时')).toBeTruthy()
  expect(screen.getByText('结算收入 12.000 卡时')).toBeTruthy()
  expect(screen.getByText('买家奖励 0.060 卡时')).toBeTruthy()
  expect(screen.getByText('租户奖励 0.000 卡时')).toBeTruthy()
  expect(screen.getByText('可用库存 0')).toBeTruthy()
  expect(document.body.textContent).toContain('lease 9007199254740993105')
  expect(document.body.textContent).toContain('buyer eligibility 9007199254740993108')

  const run = screen.getByRole('button', { name: '运行完整演示闭环' })
  fireEvent.click(run)
  fireEvent.click(run)
  expect(mocks.runLocalDemoScenario).toHaveBeenCalledTimes(1)

  await act(async () => pendingRun.resolve(completedScenario))
  expect(await screen.findByText('阶段：COMPLETED')).toBeTruthy()
  expect(screen.getByText('reconciled: true')).toBeTruthy()
  expect(screen.getByText('租户奖励 0.120 卡时')).toBeTruthy()
  expect(screen.getByText('可用库存 1')).toBeTruthy()
  expect(document.body.textContent).toContain('tenant eligibility 9007199254740993109')
})

it('does not reveal controls from a capability response owned by an earlier auth session', async () => {
  const firstCapability = deferred<{ enabled: boolean; roles: ['ADMIN'] }>()
  mocks.getLocalDemoCapability
    .mockImplementationOnce(() => firstCapability.promise)
    .mockResolvedValueOnce({ enabled: false, roles: [] })
  renderSwitcher('http://localhost:8080')
  await waitFor(() => expect(mocks.getLocalDemoCapability).toHaveBeenCalledTimes(1))

  act(() => {
    authInfoStore.setState({
      accessToken: 'owner-b-access',
      refreshToken: 'owner-b-refresh',
      accountId: '9007199254740993002',
      loginEmail: 'owner-b@kod.test',
    })
  })
  await waitFor(() => expect(mocks.getLocalDemoCapability).toHaveBeenCalledTimes(2))
  await act(async () => firstCapability.resolve({ enabled: true, roles: ['ADMIN'] }))

  expect(screen.queryByRole('group')).toBeNull()
})

it('does not reveal controls when the view leaves the local origin before capability resolves', async () => {
  const firstCapability = deferred<{ enabled: boolean; roles: ['ADMIN'] }>()
  mocks.getLocalDemoCapability.mockImplementationOnce(() => firstCapability.promise)
  const onSession = vi.fn()
  const view = renderSwitcher('http://localhost:8080', onSession)
  await waitFor(() => expect(mocks.getLocalDemoCapability).toHaveBeenCalledTimes(1))

  view.rerender(
    <MantineProvider>
      <LocalDemoRoleSwitcher apiOrigin="https://kod.example" onSession={onSession} />
    </MantineProvider>
  )
  await act(async () => firstCapability.resolve({ enabled: true, roles: ['ADMIN'] }))

  expect(mocks.getLocalDemoCapability).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('group')).toBeNull()
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

it('does not deliver a pending role session after the auth owner changes', async () => {
  const pendingRole = deferred<LocalDemoSession>()
  mocks.switchLocalDemoRole.mockImplementationOnce(() => pendingRole.promise)
  const { onSession } = renderSwitcher('http://localhost:8080')

  fireEvent.click(await screen.findByRole('button', { name: '管理员' }))
  await waitFor(() => expect(mocks.switchLocalDemoRole).toHaveBeenCalledTimes(1))
  act(() => {
    authInfoStore.setState({
      accessToken: 'owner-b-access',
      refreshToken: null,
      accountId: '9007199254740993999',
      loginEmail: null,
    })
  })
  await waitFor(() => expect(mocks.getLocalDemoCapability).toHaveBeenCalledTimes(2))
  await act(async () => {
    pendingRole.resolve(session('9007199254740993001'))
    await pendingRole.promise
  })

  expect(onSession).not.toHaveBeenCalled()
})

it('does not deliver a pending role session after the switcher unmounts', async () => {
  const pendingRole = deferred<LocalDemoSession>()
  mocks.switchLocalDemoRole.mockImplementationOnce(() => pendingRole.promise)
  const { onSession, unmount } = renderSwitcher('http://localhost:8080')

  fireEvent.click(await screen.findByRole('button', { name: '管理员' }))
  await waitFor(() => expect(mocks.switchLocalDemoRole).toHaveBeenCalledTimes(1))
  unmount()
  await act(async () => {
    pendingRole.resolve(session('9007199254740993001'))
    await pendingRole.promise
  })

  expect(onSession).not.toHaveBeenCalled()
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
