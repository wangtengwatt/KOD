// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { authInfoStore } from '@/stores/authInfoStore'

const mocks = vi.hoisted(() => ({
  getComputeAccount: vi.fn(),
  getComputeConfig: vi.fn(),
  getLocalDemoCapability: vi.fn(),
  listComputeProducts: vi.fn(),
  listLotteryEligibilities: vi.fn(),
  platformGetStoreValue: vi.fn(),
  platformSetStoreValue: vi.fn(),
  switchLocalDemoRole: vi.fn(),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const original = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...original,
    createFileRoute: () => (options: Record<string, unknown>) => ({ ...options, useSearch: () => ({}) }),
    useNavigate: () => vi.fn(),
  }
})
vi.mock('@/hooks/useScreenChange', () => ({ useIsSmallScreen: () => false }))
vi.mock('@/packages/remote', () => ({ getKodApiOrigin: () => 'http://localhost:8080' }))
vi.mock('@/platform', () => ({
  default: {
    type: 'desktop',
    getStoreValue: mocks.platformGetStoreValue,
    setStoreValue: mocks.platformSetStoreValue,
    getPlatform: vi.fn().mockResolvedValue('win32'),
    isFullscreen: vi.fn().mockResolvedValue(false),
  },
}))
vi.mock('@/packages/computeCenter', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/packages/computeCenter')>()
  return {
    ...original,
    getComputeAccount: mocks.getComputeAccount,
    getComputeConfig: mocks.getComputeConfig,
    getLocalDemoCapability: mocks.getLocalDemoCapability,
    listComputeProducts: mocks.listComputeProducts,
    listLotteryEligibilities: mocks.listLotteryEligibilities,
    switchLocalDemoRole: mocks.switchLocalDemoRole,
  }
})

import { ComputeCenterPage } from '../compute-center'

function renderPage(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <ComputeCenterPage />
      </MantineProvider>
    </QueryClientProvider>
  )
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
  authInfoStore.setState({
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    accountId: '9007199254740993001',
    loginEmail: 'old@kod.test',
  })
  mocks.getComputeAccount.mockResolvedValue({
    userId: '9007199254740993001',
    email: 'old@kod.test',
    isAdmin: false,
    roles: ['BUYER'],
    unreadOrderMessages: 0,
    unreadNotifications: 0,
  })
  mocks.getComputeConfig.mockResolvedValue({
    cardHourCnyRate: 1,
    cardHourRedeemRate: 1,
    usdCnyRate: 7,
    unitName: '卡时',
    currency: 'CNY',
  })
  mocks.listComputeProducts.mockResolvedValue([])
  mocks.listLotteryEligibilities.mockResolvedValue([])
  mocks.getLocalDemoCapability.mockResolvedValue({ enabled: true, roles: ['ADMIN', 'HOSTING_TENANT', 'GPU_BUYER'] })
  mocks.switchLocalDemoRole.mockResolvedValue({
    token: 'buyer-access',
    accountId: '9007199254740993002',
    expiresAt: '2026-08-25T13:10:00Z',
  })
  mocks.platformGetStoreValue.mockResolvedValue(undefined)
  mocks.platformSetStoreValue.mockResolvedValue(undefined)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }
  )
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

it('atomically installs an access-only role session and clears prior compute, market, lottery, and wallet work', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['compute', 'account:9007199254740993001', 'lottery'], 'stale lottery')
  queryClient.setQueryData(['compute', 'market-prices', 'latest'], 'stale market')
  queryClient.setQueryData(['wallet', 'account:9007199254740993001', 'balance'], 'stale wallet')
  renderPage(queryClient)

  fireEvent.click(await screen.findByRole('button', { name: 'GPU 买家' }))
  await waitFor(() =>
    expect(authInfoStore.getState()).toMatchObject({
      accessToken: 'buyer-access',
      refreshToken: null,
      accountId: '9007199254740993002',
      loginEmail: null,
    })
  )

  expect(queryClient.getQueryData(['compute', 'account:9007199254740993001', 'lottery'])).toBeUndefined()
  expect(queryClient.getQueryData(['compute', 'market-prices', 'latest'])).toBeUndefined()
  expect(queryClient.getQueryData(['wallet', 'account:9007199254740993001', 'balance'])).toBeUndefined()
})

it('preserves an externally installed session and caches when an earlier role response arrives late', async () => {
  const lateRole = deferred<{ token: string; accountId: string; expiresAt: string }>()
  mocks.switchLocalDemoRole.mockImplementationOnce(() => lateRole.promise)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['compute', 'late-role-sentinel'], 'keep compute')
  queryClient.setQueryData(['wallet', 'late-role-sentinel'], 'keep wallet')
  renderPage(queryClient)

  fireEvent.click(await screen.findByRole('button', { name: 'GPU 买家' }))
  await waitFor(() => expect(mocks.switchLocalDemoRole).toHaveBeenCalledTimes(1))
  act(() => {
    authInfoStore.setState({
      accessToken: 'external-b-access',
      refreshToken: 'external-b-refresh',
      accountId: '9007199254740993999',
      loginEmail: 'external-b@kod.test',
    })
  })
  await waitFor(() => expect(mocks.getLocalDemoCapability).toHaveBeenCalledTimes(2))

  await act(async () => {
    lateRole.resolve({
      token: 'late-a-access',
      accountId: '9007199254740993002',
      expiresAt: '2026-08-25T13:10:00Z',
    })
    await lateRole.promise
  })

  expect(authInfoStore.getState()).toMatchObject({
    accessToken: 'external-b-access',
    refreshToken: 'external-b-refresh',
    accountId: '9007199254740993999',
    loginEmail: 'external-b@kod.test',
  })
  expect(queryClient.getQueryData(['compute', 'late-role-sentinel'])).toBe('keep compute')
  expect(queryClient.getQueryData(['wallet', 'late-role-sentinel'])).toBe('keep wallet')
})

it('leaves the prior auth session and caches intact when role switching fails', async () => {
  mocks.switchLocalDemoRole.mockRejectedValueOnce(new Error('role unavailable'))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['compute', 'failed-role-sentinel'], 'keep compute')
  queryClient.setQueryData(['wallet', 'failed-role-sentinel'], 'keep wallet')
  renderPage(queryClient)

  fireEvent.click(await screen.findByRole('button', { name: 'GPU 买家' }))
  expect(await screen.findByText('role unavailable')).toBeTruthy()

  expect(authInfoStore.getState()).toMatchObject({
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    accountId: '9007199254740993001',
    loginEmail: 'old@kod.test',
  })
  expect(queryClient.getQueryData(['compute', 'failed-role-sentinel'])).toBe('keep compute')
  expect(queryClient.getQueryData(['wallet', 'failed-role-sentinel'])).toBe('keep wallet')
})
