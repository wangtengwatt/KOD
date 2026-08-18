// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const account = vi.hoisted(() => ({ email: '', isLoggedIn: false }))
const session = vi.hoisted(() => ({
  authenticated: false,
  account: null as null | {
    userId: number
    email: string
    roles: string[]
    accessTokenExpiresAt: number
  },
}))
const computeAccount = vi.hoisted(() => ({
  email: 'supplier@kod.test',
  roles: ['BUYER', 'SUPPLIER', 'ADMIN'],
  cnyBalance: 11083.77,
  availableCardHours: 12.5,
  frozenCardHours: 1.25,
  totalIncomeCny: 88.8,
  rentalIncome: 6,
  rentalIncomeCnyEquivalent: 6.012,
  gpuAssetCounts: { RUNNING: 7, PENDING: 2, PENDING_ACTION: 1 },
}))
const computeQueryState = vi.hoisted(() => ({
  mode: 'success' as 'success' | 'loading' | 'error',
  refetch: vi.fn(),
}))
const clearAuthTokens = vi.hoisted(() => vi.fn())
const saveAuthTokens = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const switchAuthTokens = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
    useNavigate: () => vi.fn(),
  }
})

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ enabled }: { enabled?: boolean }) => ({
    data: enabled && computeQueryState.mode === 'success' ? computeAccount : undefined,
    isFetching: false,
    isPending: Boolean(enabled && computeQueryState.mode === 'loading'),
    isError: Boolean(enabled && computeQueryState.mode === 'error'),
    error: computeQueryState.mode === 'error' ? new Error('offline') : null,
    refetch: computeQueryState.refetch,
  }),
}))

vi.mock('@/components/layout/Page', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))

vi.mock('@/i18n/locales', () => ({ languageNameMap: { 'zh-Hans': '简体中文' }, languages: ['zh-Hans'] }))

vi.mock('@/stores/authInfoStore', () => ({
  useAuthInfoStore: (selector: (state: { loginEmail: string }) => unknown) => selector({ loginEmail: account.email }),
}))

vi.mock('@/packages/session/accountSession', () => ({
  accountSessionService: {
    switchAccount: vi.fn(),
    logout: vi.fn(),
  },
  useAccountSessionSnapshot: () => session,
}))

vi.mock('@/packages/computeCenter', () => ({
  computeAccountQueryKey: ['compute', 'account'],
  getComputeAccount: vi.fn(),
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
    switchAccount: switchAuthTokens,
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
    session.authenticated = false
    session.account = null
    computeQueryState.mode = 'success'
    computeQueryState.refetch.mockClear()
    clearAuthTokens.mockClear()
    saveAuthTokens.mockClear()
    switchAuthTokens.mockClear()
  })

  it('shows the canonical account roles and the shared compute assets for the signed-in account', async () => {
    account.email = 'supplier@kod.test'
    account.isLoggedIn = true
    session.authenticated = true
    session.account = {
      userId: 29,
      email: 'supplier@kod.test',
      roles: ['BUYER', 'SUPPLIER', 'ADMIN'],
      accessTokenExpiresAt: Date.now() + 60_000,
    }

    await renderMobileMy()

    expect(screen.getByText('supplier@kod.test')).toBeTruthy()
    expect(screen.getByText('购买方')).toBeTruthy()
    expect(screen.getByText('已认证供应方')).toBeTruthy()
    expect(screen.getByText('算力管理员')).toBeTruthy()
    expect(screen.getByText('¥11,083.7700')).toBeTruthy()
    expect(screen.getByText('12.500 卡时')).toBeTruthy()
    expect(screen.getByText('运行中 GPU')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
  })

  it('shows a loading state instead of presenting missing assets as zero', async () => {
    session.authenticated = true
    session.account = {
      userId: 29,
      email: 'supplier@kod.test',
      roles: ['SUPPLIER'],
      accessTokenExpiresAt: Date.now() + 60_000,
    }
    computeQueryState.mode = 'loading'

    await renderMobileMy()

    expect(screen.getByText('正在同步资产与收益…')).toBeTruthy()
    expect(screen.queryByText('¥0.0000')).toBeNull()
  })

  it('shows a retryable error instead of presenting a failed asset sync as zero', async () => {
    session.authenticated = true
    session.account = {
      userId: 29,
      email: 'supplier@kod.test',
      roles: ['SUPPLIER'],
      accessTokenExpiresAt: Date.now() + 60_000,
    }
    computeQueryState.mode = 'error'

    await renderMobileMy()

    expect(screen.getByText('资产与收益同步失败，请检查网络后重试。')).toBeTruthy()
    expect(screen.queryByText('¥0.0000')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重新同步' }))
    expect(computeQueryState.refetch).toHaveBeenCalledOnce()
  })

  it('opens canonical login and replaces account tokens on success', async () => {
    await renderMobileMy()
    fireEvent.click(screen.getByRole('button', { name: 'Login to KOD AI' }))
    fireEvent.click(screen.getByRole('button', { name: 'Complete canonical login' }))

    await waitFor(() => expect(switchAuthTokens).toHaveBeenCalledTimes(1))
    expect(switchAuthTokens).toHaveBeenCalledWith({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      email: 'new@kod.test',
    })
    expect(clearAuthTokens).not.toHaveBeenCalled()
    expect(saveAuthTokens).not.toHaveBeenCalled()
  })

  it('uses the same canonical login flow to switch a signed-in account', async () => {
    account.email = 'old@kod.test'
    account.isLoggedIn = true
    session.authenticated = true
    session.account = {
      userId: 1,
      email: 'old@kod.test',
      roles: ['BUYER'],
      accessTokenExpiresAt: Date.now() + 60_000,
    }
    await renderMobileMy()

    fireEvent.click(screen.getByRole('button', { name: 'Switch account' }))

    expect(screen.getByRole('button', { name: 'Complete canonical login' })).toBeTruthy()
  })

  it('logs out only after explicit confirmation', async () => {
    account.email = 'user@kod.test'
    account.isLoggedIn = true
    session.authenticated = true
    session.account = {
      userId: 2,
      email: 'user@kod.test',
      roles: ['BUYER'],
      accessTokenExpiresAt: Date.now() + 60_000,
    }
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    await renderMobileMy()

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(clearAuthTokens).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(clearAuthTokens).toHaveBeenCalledTimes(1)
    confirm.mockRestore()
  })
})
