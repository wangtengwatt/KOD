// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ComputeAccount, PlatformSkuAdmin } from '@/packages/computeCenter'

const mocks = vi.hoisted(() => ({
  getComputeAccount: vi.fn(),
  getComputeConfig: vi.fn(),
  listComputeProducts: vi.fn(),
  getComputeAdminOverview: vi.fn(),
  listAdminIdentities: vi.fn(),
  listAdminNodes: vi.fn(),
  listAdminSuppliers: vi.fn(),
  listAdminProducts: vi.fn(),
  listAdminTransfers: vi.fn(),
  listAdminReservations: vi.fn(),
  listAdminUpstreams: vi.fn(),
  listAdminSuspendedProxyKeys: vi.fn(),
  listAdminPlatformSkus: vi.fn(),
  platformGetStoreValue: vi.fn(),
  platformSetStoreValue: vi.fn(),
}))

const auth = vi.hoisted(() => {
  type AuthState = { accessToken: string; refreshToken: string; accountId: string; loginEmail: string }
  const state: AuthState = {
    accessToken: 'admin-access',
    refreshToken: 'admin-refresh',
    accountId: '100',
    loginEmail: 'admin@kod.test',
  }
  const listeners = new Set<() => void>()
  return {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
})

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const original = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...original,
    createFileRoute: () => (options: Record<string, unknown>) => ({ ...options, useSearch: () => ({}) }),
    useNavigate: () => vi.fn(),
  }
})

vi.mock('@/hooks/useScreenChange', () => ({ useIsSmallScreen: () => false }))
vi.mock('@/stores/authInfoStore', async () => {
  const { useSyncExternalStore } = await import('react')
  return {
    authInfoStore: {
      getState: auth.getState,
      subscribe: (
        selector: (state: ReturnType<typeof auth.getState>) => unknown,
        listener: (next: unknown, previous: unknown) => void
      ) => {
        let previous = selector(auth.getState())
        return auth.subscribe(() => {
          const next = selector(auth.getState())
          listener(next, previous)
          previous = next
        })
      },
    },
    useAuthInfoStore: (selector: (state: ReturnType<typeof auth.getState>) => unknown) =>
      useSyncExternalStore(auth.subscribe, () => selector(auth.getState())),
  }
})

vi.mock('@/platform', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/platform')>()
  return {
    ...original,
    default: {
      ...original.default,
      type: 'desktop',
      getStoreValue: mocks.platformGetStoreValue,
      setStoreValue: mocks.platformSetStoreValue,
      getPlatform: vi.fn().mockResolvedValue('win32'),
      isFullscreen: vi.fn().mockResolvedValue(false),
    },
  }
})

vi.mock('@/packages/computeCenter', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/packages/computeCenter')>()
  return {
    ...original,
    getComputeAccount: mocks.getComputeAccount,
    getComputeConfig: mocks.getComputeConfig,
    listComputeProducts: mocks.listComputeProducts,
    getComputeAdminOverview: mocks.getComputeAdminOverview,
    listAdminIdentities: mocks.listAdminIdentities,
    listAdminNodes: mocks.listAdminNodes,
    listAdminSuppliers: mocks.listAdminSuppliers,
    listAdminProducts: mocks.listAdminProducts,
    listAdminTransfers: mocks.listAdminTransfers,
    listAdminReservations: mocks.listAdminReservations,
    listAdminUpstreams: mocks.listAdminUpstreams,
    listAdminSuspendedProxyKeys: mocks.listAdminSuspendedProxyKeys,
    listAdminPlatformSkus: mocks.listAdminPlatformSkus,
  }
})

import { ComputeCenterPage } from '../compute-center'

const account = {
  userId: '100',
  email: 'admin@kod.test',
  cnyBalance: 0,
  availableCardHours: 100,
  spendableCardHours: 100,
  redeemableCardHours: 100,
  rewardCardHours: 0,
  frozenCardHours: 0,
  lifetimeIncome: 0,
  lifetimeConsumption: 0,
  rentalIncome: 0,
  rentalIncomeCnyEquivalent: 0,
  commissionIncome: 0,
  pendingCommission: 0,
  totalIncomeCny: 0,
  invitedCount: 0,
  apiSalesIncome: 0,
  withdrawableCardHours: 100,
  supplierStatus: 'APPROVED',
  identityStatus: 'APPROVED',
  isAdmin: true,
  roles: ['BUYER', 'SUPPLIER', 'ADMIN'],
  deviceCounts: { PENDING: 0, DEPLOYING: 0, RUNNING: 0, PENDING_ACTION: 0 },
  gpuAssetCounts: {
    PENDING: 0,
    REJECTED: 0,
    RUNNING: 0,
    PENDING_DELIVERY: 0,
    ACTIVE_RENTAL: 0,
    PENDING_ACTION: 0,
    OFFLINE: 0,
  },
  cardHourCnyRate: 1,
  cardHourRedeemRate: 1,
  unitName: '卡时',
  currency: 'CNY',
  unreadNotifications: 0,
} satisfies ComputeAccount

const adminSku = {
  id: '9007199254740993123',
  skuCode: 'KAI-H100-SH-8',
  name: 'KAI 上海 H100 八卡服务器',
  description: '',
  region: '上海',
  gpuModel: 'H100',
  gpuMemoryGb: 80,
  gpuCount: 8,
  cpuDescription: '',
  ramGb: 0,
  storageGb: 0,
  networkDescription: '',
  monthlyRent: '1200.000',
  platformSalePrice: '24.000',
  packageDurationHours: 24,
  deliveryDeadlineHours: 12,
  totalInventory: 5,
  availableInventory: 3,
  allocatedInventory: 2,
  status: 'ACTIVE',
} satisfies PlatformSkuAdmin

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <ComputeCenterPage />
      </MantineProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getComputeAccount.mockResolvedValue(account)
  mocks.getComputeConfig.mockResolvedValue({
    cardHourCnyRate: 1,
    cardHourRedeemRate: 1,
    usdCnyRate: 7,
    unitName: '卡时',
    currency: 'CNY',
  })
  mocks.listComputeProducts.mockResolvedValue([])
  mocks.getComputeAdminOverview.mockResolvedValue(undefined)
  mocks.listAdminIdentities.mockResolvedValue([])
  mocks.listAdminNodes.mockResolvedValue([])
  mocks.listAdminSuppliers.mockResolvedValue([])
  mocks.listAdminProducts.mockResolvedValue([])
  mocks.listAdminTransfers.mockResolvedValue([])
  mocks.listAdminReservations.mockResolvedValue([])
  mocks.listAdminUpstreams.mockResolvedValue([])
  mocks.listAdminSuspendedProxyKeys.mockResolvedValue([])
  mocks.listAdminPlatformSkus.mockResolvedValue([adminSku])
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
  vi.unstubAllGlobals()
})

it('routes administrators to a dedicated platform server inventory subtab', async () => {
  renderPage()

  fireEvent.click(await screen.findByRole('button', { name: '进入算力管理后台' }))
  fireEvent.click(await screen.findByRole('tab', { name: '平台服务器库存' }))

  expect(await screen.findByRole('heading', { name: '平台服务器库存' })).toBeTruthy()
  expect(screen.getByText('KAI 上海 H100 八卡服务器')).toBeTruthy()
  expect(mocks.listAdminPlatformSkus).toHaveBeenCalledTimes(1)
})

it('does not expose the administrator workspace or inventory to a non-administrator', async () => {
  mocks.getComputeAccount.mockResolvedValue({ ...account, isAdmin: false, roles: ['BUYER'] })
  renderPage()

  expect(await screen.findByText('admin@kod.test')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '进入算力管理后台' })).toBeNull()
  expect(screen.queryByRole('tab', { name: '平台服务器库存' })).toBeNull()
  expect(mocks.listAdminPlatformSkus).not.toHaveBeenCalled()
})
