// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ComputeAccount, ComputeGpuNode, PlatformServerSku } from '@/packages/computeCenter'

const mocks = vi.hoisted(() => ({
  getComputeAccount: vi.fn(),
  getComputeConfig: vi.fn(),
  getComputeIdentity: vi.fn(),
  getComputeSupplier: vi.fn(),
  listComputeProducts: vi.fn(),
  listPlatformServerLeases: vi.fn(),
  listPlatformServerSkus: vi.fn(),
  listSupplierNodes: vi.fn(),
  listSupplierProducts: vi.fn(),
}))

const auth = vi.hoisted(() => {
  type AuthState = { accessToken: string; refreshToken: string; loginEmail: string }
  let state: AuthState = {
    accessToken: 'test-token',
    refreshToken: 'test-refresh-token',
    loginEmail: 'member@example.com',
  }
  const listeners = new Set<() => void>()
  return {
    getState: () => state,
    setState: (next: AuthState) => {
      state = next
      listeners.forEach((listener) => listener())
    },
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
    createFileRoute: () => (options: Record<string, unknown>) => ({
      ...options,
      useSearch: () => ({}),
    }),
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
vi.mock('@/packages/computeCenter', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/packages/computeCenter')>()
  return {
    ...original,
    getComputeAccount: mocks.getComputeAccount,
    getComputeConfig: mocks.getComputeConfig,
    getComputeIdentity: mocks.getComputeIdentity,
    getComputeSupplier: mocks.getComputeSupplier,
    listComputeProducts: mocks.listComputeProducts,
    listPlatformServerLeases: mocks.listPlatformServerLeases,
    listPlatformServerSkus: mocks.listPlatformServerSkus,
    listSupplierNodes: mocks.listSupplierNodes,
    listSupplierProducts: mocks.listSupplierProducts,
  }
})

import { ComputeCenterPage } from '../compute-center'

const account = {
  userId: 7,
  email: 'member@example.com',
  cnyBalance: 0,
  availableCardHours: 100,
  spendableCardHours: 100,
  redeemableCardHours: 90,
  rewardCardHours: 10,
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
  withdrawableCardHours: 90,
  supplierStatus: 'NONE',
  identityStatus: 'NONE',
  isAdmin: false,
  roles: ['BUYER'],
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

const sku = {
  id: '42',
  skuCode: 'GPU-HK-4090',
  name: '香港 RTX 4090 月租节点',
  description: '',
  region: '香港',
  gpuModel: 'RTX 4090',
  gpuMemoryGb: 24,
  gpuCount: 2,
  cpuDescription: '32 vCPU',
  ramGb: 128,
  storageGb: 2048,
  networkDescription: '10 Gbps',
  monthlyRent: 30,
  platformSalePrice: 12,
  packageDurationHours: 24,
  deliveryDeadlineHours: 6,
  totalInventory: 4,
  availableInventory: 3,
  status: 'ACTIVE',
} satisfies PlatformServerSku

const supplierNodes = [
  {
    id: 200,
    supplierUserId: 7,
    nodeName: '用户自有 RTX 4090',
    region: '上海',
    gpuModel: 'RTX 4090',
    gpuMemoryGb: 24,
    gpuCount: 1,
    cpuDescription: '16 vCPU',
    ramGb: 64,
    storageGb: 1024,
    networkDescription: '1 Gbps',
    status: 'RUNNING',
    isTest: false,
    platformManaged: false,
    createTime: '2026-08-01T12:00:00',
  },
  {
    id: 1088,
    supplierUserId: 7,
    nodeName: '平台月租 RTX 4090',
    region: '香港',
    gpuModel: 'RTX 4090',
    gpuMemoryGb: 24,
    gpuCount: 2,
    cpuDescription: '32 vCPU',
    ramGb: 128,
    storageGb: 2048,
    networkDescription: '10 Gbps',
    status: 'RUNNING',
    isTest: false,
    platformManaged: true,
    createTime: '2026-08-01T12:00:00',
  },
] satisfies ComputeGpuNode[]

beforeEach(() => {
  vi.clearAllMocks()
  auth.setState({
    accessToken: 'test-token',
    refreshToken: 'test-refresh-token',
    loginEmail: 'member@example.com',
  })
  mocks.getComputeAccount.mockResolvedValue(account)
  mocks.getComputeIdentity.mockResolvedValue({ status: 'APPROVED', verificationType: 'REAL' })
  mocks.getComputeSupplier.mockResolvedValue({ status: 'APPROVED', displayName: 'Test supplier' })
  mocks.getComputeConfig.mockResolvedValue({
    cardHourCnyRate: 1,
    cardHourRedeemRate: 1,
    usdCnyRate: 7,
    unitName: '卡时',
    currency: 'CNY',
  })
  mocks.listComputeProducts.mockResolvedValue([])
  mocks.listPlatformServerSkus.mockResolvedValue([sku])
  mocks.listPlatformServerLeases.mockResolvedValue([])
  mocks.listSupplierNodes.mockResolvedValue(supplierNodes)
  mocks.listSupplierProducts.mockResolvedValue([])
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

it('opens card-hour hosting from the authenticated compute-center navigation', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <ComputeCenterPage />
      </MantineProvider>
    </QueryClientProvider>
  )

  fireEvent.click(await screen.findByRole('tab', { name: '卡时托管' }))

  expect((await screen.findAllByText('香港 RTX 4090 月租节点')).length).toBeGreaterThan(0)
  expect(screen.getByText('可回购卡时余额 90.000')).toBeTruthy()

  fireEvent.click(screen.getByRole('tab', { name: '我的设备' }))
  expect(await screen.findByText('租赁节点')).toBeTruthy()
  expect(screen.queryByText('托管节点')).toBeNull()

  fireEvent.click(screen.getByRole('tab', { name: '产品发布' }))
  fireEvent.click(await screen.findByRole('textbox', { name: '已审核 GPU 资源' }))
  expect(await screen.findByText(/用户自有 RTX 4090/)).toBeTruthy()
  expect(screen.queryByText(/平台月租 RTX 4090/)).toBeNull()
})

it('switches a mounted compute center to identity-scoped account data', async () => {
  mocks.getComputeAccount.mockImplementation(async () => ({
    ...account,
    email: auth.getState().loginEmail,
    availableCardHours: auth.getState().loginEmail === 'second@example.com' ? 25 : 100,
  }))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <ComputeCenterPage />
      </MantineProvider>
    </QueryClientProvider>
  )

  expect(await screen.findByText('member@example.com')).toBeTruthy()

  act(() => {
    auth.setState({
      accessToken: 'second-token',
      refreshToken: 'second-refresh-token',
      loginEmail: 'second@example.com',
    })
  })

  expect(await screen.findByText('second@example.com')).toBeTruthy()
  await waitFor(() => expect(screen.queryByText('member@example.com')).toBeNull())
  expect(queryClient.getQueryData(['compute', 'second@example.com', 'account'])).toEqual(
    expect.objectContaining({ email: 'second@example.com', availableCardHours: 25 })
  )
})
