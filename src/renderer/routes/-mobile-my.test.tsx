// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const account = vi.hoisted(() => ({ email: '', isLoggedIn: false }))
const clearAuthTokens = vi.hoisted(() => vi.fn())
const saveAuthTokens = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
    useNavigate: () => vi.fn(),
  }
})

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

vi.mock('@/components/layout/Page', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))

vi.mock('@/i18n/locales', () => ({ languageNameMap: { 'zh-Hans': '简体中文' }, languages: ['zh-Hans'] }))

vi.mock('@/stores/authInfoStore', () => ({
  useAuthInfoStore: (selector: (state: { loginEmail: string }) => unknown) => selector({ loginEmail: account.email }),
}))

vi.mock('@/stores/settingsStore', () => ({
  useLanguage: () => 'zh-Hans',
  useSettingsStore: (selector: (state: { setSettings: () => void }) => unknown) => selector({ setSettings: vi.fn() }),
}))

vi.mock('@/routes/settings/provider/chatbox-ai/-components/useAuthTokens', () => ({
  useAuthTokens: () => ({
    isLoggedIn: account.isLoggedIn,
    clearAuthTokens,
    saveAuthTokens,
  }),
}))

vi.mock('@/routes/settings/provider/chatbox-ai/-components/EmailCodeLoginModal', () => ({
  EmailCodeLoginModal: ({
    opened,
    onLoginSuccess,
  }: {
    opened: boolean
    onLoginSuccess: (tokens: { accessToken: string; refreshToken: string; email: string }) => void
  }) =>
    opened ? (
      <button
        type="button"
        onClick={() =>
          onLoginSuccess({ accessToken: 'new-access', refreshToken: 'new-refresh', email: 'new@kod.test' })
        }
      >
        Complete canonical login
      </button>
    ) : null,
}))

async function renderMobileMy() {
  const module = await import('./mobile-my')
  const MobileMyPage = (module as unknown as Record<string, React.ComponentType>).MobileMyPage
  expect(MobileMyPage, 'the mobile account page must expose its canonical UI for contract testing').toBeTypeOf(
    'function'
  )
  if (!MobileMyPage) return

  render(
    <MantineProvider>
      <MobileMyPage />
    </MantineProvider>
  )
}

describe('/mobile-my canonical account wiring', () => {
  beforeAll(() => {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
  })

  beforeEach(() => {
    account.email = ''
    account.isLoggedIn = false
    clearAuthTokens.mockClear()
    saveAuthTokens.mockClear()
  })

  it('opens canonical login and replaces account tokens on success', async () => {
    await renderMobileMy()
    fireEvent.click(screen.getByRole('button', { name: 'Login to KOD AI' }))
    fireEvent.click(screen.getByRole('button', { name: 'Complete canonical login' }))

    await waitFor(() => expect(saveAuthTokens).toHaveBeenCalledTimes(1))
    expect(clearAuthTokens).toHaveBeenCalledTimes(1)
    expect(saveAuthTokens).toHaveBeenCalledWith({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      email: 'new@kod.test',
    })
    expect(clearAuthTokens.mock.invocationCallOrder[0]).toBeLessThan(saveAuthTokens.mock.invocationCallOrder[0])
  })

  it('uses the same canonical login flow to switch a signed-in account', async () => {
    account.email = 'old@kod.test'
    account.isLoggedIn = true
    await renderMobileMy()

    fireEvent.click(screen.getByRole('button', { name: 'Switch account' }))

    expect(screen.getByRole('button', { name: 'Complete canonical login' })).toBeTruthy()
  })

  it('logs out only after explicit confirmation', async () => {
    account.email = 'user@kod.test'
    account.isLoggedIn = true
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    await renderMobileMy()

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(clearAuthTokens).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(clearAuthTokens).toHaveBeenCalledTimes(1)
    confirm.mockRestore()
  })
})
