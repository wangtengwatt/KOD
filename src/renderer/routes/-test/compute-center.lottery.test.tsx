// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ComputeAccount, LotteryEligibility } from '@/packages/computeCenter'
import { authInfoStore } from '@/stores/authInfoStore'

const mocks = vi.hoisted(() => ({
  drawLotteryEligibility: vi.fn(),
  getComputeAccount: vi.fn(),
  getComputeConfig: vi.fn(),
  listComputeProducts: vi.fn(),
  listLotteryEligibilities: vi.fn(),
  listLotteryHistory: vi.fn(),
  platformGetStoreValue: vi.fn(),
  platformSetStoreValue: vi.fn(),
  uuidv4: vi.fn(),
}))

vi.mock('uuid', () => ({ v4: mocks.uuidv4 }))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const original = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...original,
    createFileRoute: () => (options: Record<string, unknown>) => ({ ...options, useSearch: () => ({}) }),
    useNavigate: () => vi.fn(),
  }
})

vi.mock('@/hooks/useScreenChange', () => ({ useIsSmallScreen: () => false }))

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
    drawLotteryEligibility: mocks.drawLotteryEligibility,
    getComputeAccount: mocks.getComputeAccount,
    getComputeConfig: mocks.getComputeConfig,
    listComputeProducts: mocks.listComputeProducts,
    listLotteryEligibilities: mocks.listLotteryEligibilities,
    listLotteryHistory: mocks.listLotteryHistory,
  }
})

import { ComputeCenterPage } from '../compute-center'

const account = {
  userId: '7',
  email: 'buyer@kod.test',
  cnyBalance: 0,
  availableCardHours: 20,
  spendableCardHours: 20,
  redeemableCardHours: 20,
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
  withdrawableCardHours: 20,
  supplierStatus: null,
  identityStatus: null,
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
  unreadOrderMessages: 0,
} as unknown as ComputeAccount

const pending = [
  {
    id: '9007199254740996101',
    beneficiaryUserId: '7',
    sourceType: 'GPU_RESERVATION',
    sourceId: '9007199254740996102',
    rewardBase: '12.000',
    status: 'PENDING',
    ruleVersion: 1,
    createdAt: '2026-08-25T12:00:00',
    drawnAt: null,
    dismissedAt: null,
  },
  {
    id: '9007199254740996201',
    beneficiaryUserId: '7',
    sourceType: 'HOSTING_PERIOD',
    sourceId: '9007199254740996202',
    rewardBase: '30.000',
    status: 'PENDING',
    ruleVersion: 1,
    createdAt: '2026-08-25T13:00:00',
    drawnAt: null,
    dismissedAt: null,
  },
] satisfies LotteryEligibility[]

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
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
  localStorage.clear()
  authInfoStore.setState({
    accessToken: 'buyer-access',
    refreshToken: 'buyer-refresh',
    accountId: '7',
    loginEmail: 'buyer@kod.test',
  })
  mocks.uuidv4.mockReturnValue('draw-request-1')
  mocks.getComputeAccount.mockResolvedValue(account)
  mocks.getComputeConfig.mockResolvedValue({
    cardHourCnyRate: 1,
    cardHourRedeemRate: 1,
    usdCnyRate: 7,
    unitName: '卡时',
    currency: 'CNY',
  })
  mocks.listComputeProducts.mockResolvedValue([])
  mocks.listLotteryEligibilities.mockResolvedValue(pending)
  mocks.listLotteryHistory.mockResolvedValue([])
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

it('surfaces pending lottery eligibility at the top level and keeps a dismissed prompt in the center', async () => {
  renderPage()

  expect(await screen.findByRole('dialog', { name: '订单结算抽奖' })).toBeTruthy()
  const lotteryTab = screen.getByRole('tab', { name: /抽奖中心/ })
  expect(within(lotteryTab).getByText('2')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: '关闭抽奖弹窗' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '订单结算抽奖' })).toBeNull())
  expect(mocks.drawLotteryEligibility).not.toHaveBeenCalled()

  fireEvent.click(lotteryTab)

  expect(await screen.findByRole('heading', { name: '抽奖中心' })).toBeTruthy()
  expect(screen.getByText(pending[0].sourceId)).toBeTruthy()
  expect(screen.getByText(pending[1].sourceId)).toBeTruthy()
  expect(mocks.listLotteryEligibilities).toHaveBeenCalledWith('PENDING')
})
