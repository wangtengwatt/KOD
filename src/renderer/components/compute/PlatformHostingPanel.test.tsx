// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ComputeAccount,
  PlatformLeaseDetails,
  PlatformServerLease,
  PlatformServerSku,
} from '@/packages/computeCenter'
import { authInfoStore } from '@/stores/authInfoStore'

const mocks = vi.hoisted(() => ({
  getComputeAccount: vi.fn(),
  getPlatformLeaseDetails: vi.fn(),
  listCardHourRates: vi.fn(),
  listComputeProducts: vi.fn(),
  listHostedNodes: vi.fn(),
  listPlatformServerLeases: vi.fn(),
  listPlatformServerSkus: vi.fn(),
  rentPlatformServer: vi.fn(),
  setLeaseAutoRenew: vi.fn(),
  uuidv4: vi.fn(),
}))

vi.mock('uuid', () => ({ v4: mocks.uuidv4 }))

vi.mock('@/packages/computeCenter', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/packages/computeCenter')>()
  return {
    ...original,
    getComputeAccount: mocks.getComputeAccount,
    getPlatformLeaseDetails: mocks.getPlatformLeaseDetails,
    listCardHourRates: mocks.listCardHourRates,
    listComputeProducts: mocks.listComputeProducts,
    listPlatformServerLeases: mocks.listPlatformServerLeases,
    listPlatformServerSkus: mocks.listPlatformServerSkus,
    rentPlatformServer: mocks.rentPlatformServer,
    setLeaseAutoRenew: mocks.setLeaseAutoRenew,
  }
})

vi.mock('@/packages/computeMarketplace/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/packages/computeMarketplace/api')>()
  return { ...original, listHostedNodes: mocks.listHostedNodes }
})

import { CardHourBusiness } from './CardHourBusiness'
import { HostedComputePanel } from './HostedComputePanel'
import { PlatformHostingPanel } from './PlatformHostingPanel'

const sku = {
  id: '42',
  skuCode: 'GPU-HK-4090',
  name: '香港 RTX 4090 月租节点',
  description: '平台统一运维并自动上架',
  region: '香港',
  gpuModel: 'RTX 4090',
  gpuMemoryGb: 24,
  gpuCount: 2,
  cpuDescription: '32 vCPU',
  ramGb: 128,
  storageGb: 2048,
  networkDescription: '10 Gbps',
  monthlyRent: '30.000',
  platformSalePrice: '12.000',
  packageDurationHours: 24,
  deliveryDeadlineHours: 6,
  totalInventory: 4,
  availableInventory: 3,
  status: 'ACTIVE',
} satisfies PlatformServerSku

const lease = {
  id: '88',
  leaseNo: 'PL000088',
  userId: '7',
  skuId: '42',
  requestId: 'rent-request-existing',
  hostedNodeId: '1088',
  productId: '2088',
  monthlyRent: '30.000',
  salePrice: '12.000',
  status: 'ACTIVE',
  autoRenew: true,
  startedAt: '2026-08-01T12:00:00',
  expiresAt: '2099-09-01T12:00:00',
  stoppingAt: null,
  releasedAt: null,
  renewalCount: 0,
} satisfies PlatformServerLease

const account = {
  userId: '7',
  redeemableCardHours: 90,
  withdrawableCardHours: 90,
  rewardCardHours: 50,
} as unknown as ComputeAccount

const leaseDetails = {
  lease: {
    ...lease,
    monthlyRent: '30.000',
    salePrice: '12.000',
  },
  periods: [
    {
      id: '9007199254740993101',
      leaseId: lease.id,
      periodNo: 2,
      rentCardHours: '30.000',
      startedAt: '2026-08-25T12:00:00',
      endsAt: '2026-09-25T12:00:00',
      paymentLedgerId: '9007199254740993102',
      status: 'ACTIVE',
      completedAt: null,
    },
  ],
  incomeEvents: [
    {
      id: '9007199254740993201',
      leaseId: lease.id,
      reservationId: '9007199254740993202',
      productId: '9007199254740993203',
      orderId: '9007199254740993204',
      orderNo: 'ORDER-SETTLED-001',
      buyerUserId: '9007199254740993205',
      beneficiaryUserId: lease.userId,
      grossCardHours: '12.000',
      platformFeeCardHours: '1.200',
      netIncomeCardHours: '10.800',
      supplierIncomeLedgerId: '9007199254740993206',
      settlementStatus: 'SETTLED',
      serviceStartedAt: '2026-08-25T12:00:00',
      serviceEndedAt: '2026-08-25T13:00:00',
      settledAt: '2026-08-25T13:00:00',
    },
    {
      id: '9007199254740993301',
      leaseId: lease.id,
      reservationId: '9007199254740993302',
      productId: '9007199254740993303',
      orderId: '9007199254740993304',
      orderNo: 'ORDER-PENDING-002',
      buyerUserId: '9007199254740993305',
      beneficiaryUserId: lease.userId,
      grossCardHours: '6.000',
      platformFeeCardHours: '0.600',
      netIncomeCardHours: '5.400',
      supplierIncomeLedgerId: null,
      settlementStatus: 'PENDING',
      serviceStartedAt: '2026-08-26T12:00:00',
      serviceEndedAt: null,
      settledAt: null,
    },
  ],
  totalCost: '60.000',
  totalPendingIncome: '6.000',
  totalSettledIncome: '12.000',
  totalFee: '1.200',
  totalNetIncome: '10.800',
} satisfies PlatformLeaseDetails

function renderPanel(ui = <PlatformHostingPanel />) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MantineProvider>{ui}</MantineProvider>
      </QueryClientProvider>
    ),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.uuidv4.mockReset()
  sessionStorage.clear()
  localStorage.clear()
  mocks.getComputeAccount.mockResolvedValue(account)
  mocks.getPlatformLeaseDetails.mockResolvedValue(leaseDetails)
  mocks.listCardHourRates.mockResolvedValue([])
  mocks.listComputeProducts.mockResolvedValue([])
  mocks.listPlatformServerSkus.mockResolvedValue([sku])
  mocks.listPlatformServerLeases.mockResolvedValue([lease])
  mocks.listHostedNodes.mockResolvedValue([])
  mocks.rentPlatformServer.mockResolvedValue(lease)
  mocks.uuidv4.mockReturnValue('rent-request-1')
  mocks.setLeaseAutoRenew.mockImplementation(async (_leaseId: string, enabled: boolean) => ({
    ...lease,
    autoRenew: enabled,
  }))
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('PlatformHostingPanel', () => {
  it('lazy-loads exact hosting cost, current period, income totals, and immutable order logs', async () => {
    renderPanel()

    expect(await screen.findByText('租约 PL000088')).toBeTruthy()
    expect(mocks.getPlatformLeaseDetails).not.toHaveBeenCalled()
    expect(screen.queryByText('累计租赁成本 60.000 卡时')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '展开订单收益日志' }))

    await waitFor(() => expect(mocks.getPlatformLeaseDetails).toHaveBeenCalledWith('88'))
    const details = await screen.findByRole('region', { name: '租约 PL000088 成本与收益' })
    expect(within(details).getByRole('region', { name: '累计租赁成本 60.000 卡时' })).toBeTruthy()
    expect(within(details).getByText('本期租赁成本 30.000 卡时')).toBeTruthy()
    expect(within(details).getByText('第 2 期')).toBeTruthy()
    expect(within(details).getByText('周期状态：进行中（ACTIVE）')).toBeTruthy()
    expect(within(details).getByText('2026-08-25 12:00:00 至 2026-09-25 12:00:00')).toBeTruthy()
    expect(within(details).getByRole('region', { name: '待结算收入 6.000 卡时' })).toBeTruthy()
    expect(within(details).getByRole('region', { name: '已结算总额 12.000 卡时' })).toBeTruthy()
    expect(within(details).getByRole('region', { name: '平台服务费 1.200 卡时' })).toBeTruthy()
    expect(within(details).getByRole('region', { name: '净收益 10.800 卡时' })).toBeTruthy()

    const settledOrder = within(details).getByRole('row', { name: /ORDER-SETTLED-001/ })
    expect(within(settledOrder).getByText('9007199254740993204')).toBeTruthy()
    expect(within(settledOrder).getByText('9007199254740993203')).toBeTruthy()
    expect(within(settledOrder).getByText('2026-08-25 13:00:00')).toBeTruthy()
    expect(within(settledOrder).getByText('12.000')).toBeTruthy()
    expect(within(settledOrder).getByText('1.200')).toBeTruthy()
    expect(within(settledOrder).getByText('10.800')).toBeTruthy()

    const pendingOrder = within(details).getByRole('row', { name: /ORDER-PENDING-002/ })
    expect(within(pendingOrder).getByText('待结算')).toBeTruthy()
    expect(within(pendingOrder).getByText('9007199254740993304')).toBeTruthy()
    expect(within(pendingOrder).getByText('9007199254740993303')).toBeTruthy()
  })

  it('polls expanded lease details from pending to settled and stops after collapse', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const pendingEvent = leaseDetails.incomeEvents[1]
    const pendingDetails: PlatformLeaseDetails = {
      ...leaseDetails,
      incomeEvents: [pendingEvent],
      totalPendingIncome: '6.000',
      totalSettledIncome: '0.000',
      totalFee: '0.000',
      totalNetIncome: '0.000',
    }
    const settledDetails: PlatformLeaseDetails = {
      ...pendingDetails,
      incomeEvents: [
        {
          ...pendingEvent,
          supplierIncomeLedgerId: '9007199254740993306',
          settlementStatus: 'SETTLED',
          serviceEndedAt: '2026-08-26T13:00:00',
          settledAt: '2026-08-26T13:00:00',
        },
      ],
      totalPendingIncome: '0.000',
      totalSettledIncome: '6.000',
      totalFee: '0.600',
      totalNetIncome: '5.400',
    }
    mocks.getPlatformLeaseDetails.mockResolvedValueOnce(pendingDetails).mockResolvedValue(settledDetails)
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: '展开订单收益日志' }))
    const pendingRow = await screen.findByRole('row', { name: /ORDER-PENDING-002/ })
    expect(within(pendingRow).getByText('待结算')).toBeTruthy()

    await act(async () => vi.advanceTimersByTimeAsync(10_000))

    const settledRow = await screen.findByRole('row', { name: /ORDER-PENDING-002/ })
    expect(within(settledRow).getByText('已结算')).toBeTruthy()
    expect(screen.getByRole('region', { name: '已结算总额 6.000 卡时' })).toBeTruthy()
    expect(mocks.getPlatformLeaseDetails).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: '收起订单收益日志' }))
    await act(async () => vi.advanceTimersByTimeAsync(20_000))
    expect(mocks.getPlatformLeaseDetails).toHaveBeenCalledTimes(2)
  })

  it('renders lease list identifiers and long decimal strings without precision loss', async () => {
    mocks.listPlatformServerLeases.mockResolvedValue([
      {
        ...lease,
        id: '9007199254740993088',
        userId: '9007199254740993007',
        skuId: '9007199254740993042',
        hostedNodeId: '9007199254740993089',
        productId: '9007199254740993090',
        monthlyRent: '12345678901234567.890',
        salePrice: '0.010',
      },
    ])
    renderPanel()

    expect(await screen.findByText('月租：12345678901234567.890 卡时')).toBeTruthy()
    expect(screen.getByText('平台统一销售价：0.010 卡时')).toBeTruthy()
  })

  it('loads lease details after a failed request is retried successfully', async () => {
    mocks.getPlatformLeaseDetails
      .mockRejectedValueOnce(new Error('Temporary details outage'))
      .mockResolvedValueOnce(leaseDetails)
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: '展开订单收益日志' }))
    expect(await screen.findByText('Temporary details outage')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('ORDER-SETTLED-001')).toBeTruthy()
    expect(mocks.getPlatformLeaseDetails).toHaveBeenCalledTimes(2)
  })

  it('shows a clear empty state when an expanded lease has no order-income events', async () => {
    mocks.getPlatformLeaseDetails.mockResolvedValue({ ...leaseDetails, incomeEvents: [] })
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: '展开订单收益日志' }))

    expect(await screen.findByText('暂无订单收益记录。')).toBeTruthy()
  })

  it('removes account-a income rows and ignores its late detail response after switching to account b', async () => {
    authInfoStore.setState({
      accessToken: 'account-a-access',
      refreshToken: 'account-a-refresh',
      accountId: '7',
      loginEmail: 'account-a@kod.test',
    })
    let resolveAccountA: ((details: PlatformLeaseDetails) => void) | undefined
    const accountADetails = new Promise<PlatformLeaseDetails>((resolve) => {
      resolveAccountA = resolve
    })
    const accountBDetails = {
      ...leaseDetails,
      incomeEvents: [
        {
          ...leaseDetails.incomeEvents[0],
          id: '9007199254740993401',
          orderId: '9007199254740993402',
          orderNo: 'ORDER-ACCOUNT-B',
        },
      ],
    }
    mocks.getPlatformLeaseDetails.mockImplementationOnce(() => accountADetails).mockResolvedValueOnce(accountBDetails)
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: '展开订单收益日志' }))
    await waitFor(() => expect(mocks.getPlatformLeaseDetails).toHaveBeenCalledTimes(1))

    act(() =>
      authInfoStore.setState({
        accessToken: 'account-b-access',
        refreshToken: 'account-b-refresh',
        accountId: '8',
        loginEmail: 'account-b@kod.test',
      })
    )

    expect(await screen.findByRole('button', { name: '展开订单收益日志' })).toBeTruthy()
    expect(screen.queryByText('ORDER-ACCOUNT-A')).toBeNull()
    resolveAccountA?.({
      ...leaseDetails,
      incomeEvents: [{ ...leaseDetails.incomeEvents[0], orderNo: 'ORDER-ACCOUNT-A' }],
    })
    await act(async () => {
      await accountADetails
      await Promise.resolve()
    })
    expect(screen.queryByText('ORDER-ACCOUNT-A')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '展开订单收益日志' }))
    expect(await screen.findByText('ORDER-ACCOUNT-B')).toBeTruthy()
    expect(mocks.getPlatformLeaseDetails).toHaveBeenCalledTimes(2)
  })

  it('closes an account-owned checkout when the authenticated account changes in place', async () => {
    authInfoStore.setState({
      accessToken: 'account-a-access',
      refreshToken: 'account-a-refresh',
      loginEmail: 'account-a@kod.test',
    })
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: '租用一个月' }))
    expect(await screen.findByText('确认月租')).toBeTruthy()

    act(() =>
      authInfoStore.setState({
        accessToken: 'account-b-access',
        refreshToken: 'account-b-refresh',
        loginEmail: 'account-b@kod.test',
      })
    )

    await waitFor(() => expect(screen.queryByText('确认月租')).toBeNull())
    expect(mocks.rentPlatformServer).not.toHaveBeenCalled()
  })

  it('does not let an account-a rent callback close account-b checkout after an awaited refresh', async () => {
    authInfoStore.setState({
      accessToken: 'account-a-access',
      refreshToken: 'account-a-refresh',
      loginEmail: 'account-a@kod.test',
    })
    mocks.listPlatformServerLeases.mockResolvedValue([])
    let releaseRefresh: (() => void) | undefined
    const refreshBlocked = new Promise<void>((resolve) => {
      releaseRefresh = resolve
    })
    const { queryClient } = renderPanel()
    vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(() => refreshBlocked)

    fireEvent.click(await screen.findByRole('button', { name: '租用一个月' }))
    fireEvent.click(await screen.findByRole('button', { name: '确认租用' }))
    await waitFor(() => expect(queryClient.invalidateQueries).toHaveBeenCalled())

    act(() =>
      authInfoStore.setState({
        accessToken: 'account-b-access',
        refreshToken: 'account-b-refresh',
        loginEmail: 'account-b@kod.test',
      })
    )
    await waitFor(() => expect(screen.queryByText('确认月租')).toBeNull())
    fireEvent.click(await screen.findByRole('button', { name: '租用一个月' }))
    expect(await screen.findByText('确认月租')).toBeTruthy()

    releaseRefresh?.()
    await act(async () => {
      await refreshBlocked
      await Promise.resolve()
    })

    expect(screen.getByText('确认月租')).toBeTruthy()
    expect(screen.queryByText('月租成功，服务器已按平台统一价格上架')).toBeNull()
  })

  it('shows the server available redeemable balance instead of frozen redeemable hours', async () => {
    mocks.getComputeAccount.mockResolvedValue({
      ...account,
      redeemableCardHours: 90,
      withdrawableCardHours: 60,
      frozenCardHours: 30,
    })
    renderPanel()

    expect(await screen.findByText('可回购卡时余额 60.000')).toBeTruthy()
    expect(screen.queryByText('可回购卡时余额 90.000')).toBeNull()
  })

  it('shows server-authoritative SKU, redeemable balance, lease pricing, and renewal state', async () => {
    renderPanel()

    expect(await screen.findByText('RTX 4090 × 2 · 24GB')).toBeTruthy()
    expect(screen.getByText('香港')).toBeTruthy()
    expect(screen.getByText('库存 3 / 4')).toBeTruthy()
    expect(screen.getByText('月租 30.000 卡时')).toBeTruthy()
    expect(screen.getByText('平台统一销售价 12.000 卡时 / 24 小时')).toBeTruthy()
    expect(screen.getByText('可回购卡时余额 90.000')).toBeTruthy()
    expect(screen.getByText(/仅可回购卡时可支付月租/)).toBeTruthy()
    expect(screen.queryByText(/奖励卡时余额 50/)).toBeNull()
    expect(screen.queryByRole('textbox', { name: '销售价格' })).toBeNull()
    expect((screen.getByRole('switch', { name: '自动续租' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText(/当前租期剩余/)).toBeTruthy()
    expect(screen.getByText('接单状态：接单中')).toBeTruthy()
    expect(screen.getByText('市场状态：市场已上架')).toBeTruthy()
  })

  it('confirms rent with a stable request id and adopts the returned lease', async () => {
    mocks.listPlatformServerLeases.mockResolvedValue([])
    vi.stubGlobal('crypto', {})
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: '租用一个月' }))
    expect(await screen.findByText('确认月租')).toBeTruthy()
    expect(screen.getByText('将从可回购卡时余额扣除 30.000 卡时')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '确认租用' }))

    await waitFor(() => expect(mocks.rentPlatformServer).toHaveBeenCalledWith('42', 'rent-request-1'))
    expect(mocks.uuidv4).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('月租成功，服务器已按平台统一价格上架')).toBeTruthy()
  })

  it('leaves monthly-rent eligibility to the service instead of treating reward hours as redeemable', async () => {
    mocks.getComputeAccount.mockResolvedValue({
      ...account,
      availableCardHours: 100,
      spendableCardHours: 100,
      redeemableCardHours: 0,
      withdrawableCardHours: 0,
      rewardCardHours: 100,
    })
    mocks.listPlatformServerLeases.mockResolvedValue([])
    mocks.rentPlatformServer.mockRejectedValue(new Error('Redeemable card hours are insufficient'))
    renderPanel()

    const rent = await screen.findByRole('button', { name: '租用一个月' })
    expect(screen.getByText('可回购卡时余额 0.000')).toBeTruthy()
    expect(screen.queryByText('当前可回购卡时余额不足')).toBeNull()
    expect(rent.hasAttribute('disabled')).toBe(false)
    fireEvent.click(rent)
    fireEvent.click(await screen.findByRole('button', { name: '确认租用' }))
    await waitFor(() => expect(mocks.rentPlatformServer).toHaveBeenCalledWith('42', expect.any(String)))
    expect(screen.queryByText('月租成功，服务器已按平台统一价格上架')).toBeNull()
  })

  it('uses the mutation response for renewal and explains that disabling only affects the next term', async () => {
    renderPanel()

    fireEvent.click(await screen.findByRole('switch', { name: '自动续租' }))

    await waitFor(() => expect(mocks.setLeaseAutoRenew).toHaveBeenCalledWith('88', false))
    expect((screen.getByRole('switch', { name: '自动续租' }) as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText(/关闭只影响下一个租期，当前租期仍然有效/)).toBeTruthy()
    expect(screen.getByText(/到期停止接收新订单/)).toBeTruthy()
  })

  it('can re-enable renewal and uses the enabled state returned by the service', async () => {
    mocks.listPlatformServerLeases.mockResolvedValue([{ ...lease, autoRenew: false }])
    renderPanel()

    fireEvent.click(await screen.findByRole('switch', { name: '自动续租' }))

    await waitFor(() => expect(mocks.setLeaseAutoRenew).toHaveBeenCalledWith('88', true))
    expect((screen.getByRole('switch', { name: '自动续租' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText('已开启下期自动续租')).toBeTruthy()
  })

  it.each([
    [
      'STOPPING' as const,
      '清空预约中',
      '已停止接单',
      '租期已到期，正在履行存量订单；预约和争议全部清空后自动下架并释放服务器。',
    ],
    ['RELEASED' as const, '已释放', '已停止接单', '服务器已下架并释放回平台库存。'],
  ])('renders %s lease lifecycle from the service', async (status, leaseStatus, intake, explanation) => {
    mocks.listPlatformServerLeases.mockResolvedValue([
      {
        ...lease,
        status,
        autoRenew: false,
        stoppingAt: status === 'STOPPING' ? '2026-09-01T12:00:00' : '2026-09-01T12:00:00',
        releasedAt: status === 'RELEASED' ? '2026-09-02T12:00:00' : null,
      },
    ])
    renderPanel()

    expect(await screen.findByText(leaseStatus)).toBeTruthy()
    expect(screen.getByText(`接单状态：${intake}`)).toBeTruthy()
    expect(screen.getByText(explanation)).toBeTruthy()
    expect(screen.queryByRole('switch', { name: '自动续租' })).toBeNull()
  })

  it('polls leases and SKU inventory so release changes appear without leaving the page', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mocks.listPlatformServerLeases
      .mockResolvedValueOnce([lease])
      .mockResolvedValue([{ ...lease, status: 'RELEASED', autoRenew: false, releasedAt: '2026-09-02T12:00:00' }])
    mocks.listPlatformServerSkus
      .mockResolvedValueOnce([{ ...sku, availableInventory: 0 }])
      .mockResolvedValue([{ ...sku, availableInventory: 1 }])
    renderPanel()

    expect(await screen.findByText('租赁中')).toBeTruthy()
    expect(screen.getByRole('button', { name: '已售罄' })).toBeTruthy()
    await act(async () => vi.advanceTimersByTimeAsync(10_000))

    expect(await screen.findByText('已释放')).toBeTruthy()
    expect(screen.getByText('接单状态：已停止接单')).toBeTruthy()
    expect(screen.getByRole('button', { name: '租用一个月' })).toBeTruthy()
  })

  it('reconciles an ambiguous rent failure by the stable request id', async () => {
    const recoveredLease = { ...lease, requestId: 'rent-request-1' }
    mocks.listPlatformServerLeases.mockResolvedValueOnce([]).mockResolvedValue([recoveredLease])
    mocks.rentPlatformServer.mockRejectedValue(new Error('Request timed out'))
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: '租用一个月' }))
    fireEvent.click(await screen.findByRole('button', { name: '确认租用' }))

    expect(await screen.findByText('月租结果已从服务端确认，服务器已按平台统一价格上架')).toBeTruthy()
    expect(screen.getByText('租约 PL000088')).toBeTruthy()
    expect(screen.queryByText('Request timed out')).toBeNull()
    expect(mocks.listPlatformServerLeases).toHaveBeenCalledTimes(2)
    expect(mocks.rentPlatformServer).toHaveBeenCalledTimes(1)
  })

  it('does not reconcile a reused request id to a lease for another SKU', async () => {
    const wrongSkuLease = { ...lease, skuId: '99', requestId: 'rent-request-1' }
    mocks.listPlatformServerLeases.mockResolvedValueOnce([]).mockResolvedValue([wrongSkuLease])
    mocks.rentPlatformServer.mockRejectedValue(new Error('Request timed out'))
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: '租用一个月' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(await screen.findByRole('button', { name: '确认租用' }))

    expect(await within(dialog).findByText('Request timed out')).toBeTruthy()
    expect(screen.queryByText('月租结果已从服务端确认，服务器已按平台统一价格上架')).toBeNull()
  })

  it('reuses an unresolved request id after the checkout is closed and reopened', async () => {
    mocks.uuidv4.mockReturnValueOnce('unresolved-rent-key').mockReturnValueOnce('unsafe-new-key')
    mocks.listPlatformServerLeases.mockResolvedValue([])
    mocks.rentPlatformServer.mockRejectedValue(new Error('Request timed out'))
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: '租用一个月' }))
    fireEvent.click(await screen.findByRole('button', { name: '确认租用' }))
    expect(await within(screen.getByRole('dialog')).findByText('Request timed out')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    fireEvent.click(await screen.findByRole('button', { name: '租用一个月' }))
    fireEvent.click(await screen.findByRole('button', { name: '确认租用' }))
    await waitFor(() => expect(mocks.rentPlatformServer).toHaveBeenCalledTimes(2))

    expect(mocks.rentPlatformServer).toHaveBeenNthCalledWith(1, '42', 'unresolved-rent-key')
    expect(mocks.rentPlatformServer).toHaveBeenNthCalledWith(2, '42', 'unresolved-rent-key')
    expect(mocks.uuidv4).toHaveBeenCalledTimes(1)
  })

  it('persists unresolved request ids across remounts without sharing them between accounts', async () => {
    mocks.uuidv4
      .mockReturnValueOnce('account-a-rent-key')
      .mockReturnValueOnce('account-b-rent-key')
      .mockReturnValueOnce('unsafe-account-a-new-key')
    mocks.listPlatformServerLeases.mockResolvedValue([])
    mocks.rentPlatformServer.mockRejectedValue(new Error('Request timed out'))
    const accountA = renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: '租用一个月' }))
    fireEvent.click(await screen.findByRole('button', { name: '确认租用' }))
    await waitFor(() => expect(mocks.rentPlatformServer).toHaveBeenCalledTimes(1))
    accountA.unmount()

    mocks.getComputeAccount.mockResolvedValue({ ...account, userId: 8 })
    const accountB = renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: '租用一个月' }))
    fireEvent.click(await screen.findByRole('button', { name: '确认租用' }))
    await waitFor(() => expect(mocks.rentPlatformServer).toHaveBeenCalledTimes(2))
    accountB.unmount()

    mocks.getComputeAccount.mockResolvedValue(account)
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: '租用一个月' }))
    fireEvent.click(await screen.findByRole('button', { name: '确认租用' }))
    await waitFor(() => expect(mocks.rentPlatformServer).toHaveBeenCalledTimes(3))

    expect(mocks.rentPlatformServer).toHaveBeenNthCalledWith(1, '42', 'account-a-rent-key')
    expect(mocks.rentPlatformServer).toHaveBeenNthCalledWith(2, '42', 'account-b-rent-key')
    expect(mocks.rentPlatformServer).toHaveBeenNthCalledWith(3, '42', 'account-a-rent-key')
    expect(mocks.uuidv4).toHaveBeenCalledTimes(2)
  })

  it('surfaces the real backend mutation error without optimistic success', async () => {
    mocks.listPlatformServerLeases.mockResolvedValue([])
    mocks.rentPlatformServer.mockRejectedValue(new Error('Platform server SKU is sold out'))
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: '租用一个月' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(await screen.findByRole('button', { name: '确认租用' }))

    expect(await within(dialog).findByText('Platform server SKU is sold out')).toBeTruthy()
    expect(screen.queryByText('月租成功，服务器已按平台统一价格上架')).toBeNull()
  })
})

describe('hosted compute naming', () => {
  it('calls ordinary user-owned node hosting 算力租赁', async () => {
    renderPanel(<HostedComputePanel busy={null} run={vi.fn()} />)

    expect(await screen.findByText('算力租赁如何工作')).toBeTruthy()
    expect(screen.getByText('尚无租赁节点，请先在“资源资质”提交并通过审核。')).toBeTruthy()
    expect(screen.queryByText(/算力托管/)).toBeNull()
  })

  it('reserves 卡时托管 for platform-server monthly rent', async () => {
    renderPanel(
      <CardHourBusiness account={account} isLoggedIn={false} busy={null} run={vi.fn()} runCardHourAction={vi.fn()} />
    )

    expect(await screen.findByText('卡时批次账本')).toBeTruthy()
    expect(screen.queryByText('卡时托管')).toBeNull()
  })

  it('keeps platform-managed nodes out of ordinary compute rental controls', async () => {
    mocks.listHostedNodes.mockResolvedValue([
      {
        id: 200,
        nodeName: '用户自有 RTX 4090',
        gpuModel: 'RTX 4090',
        gpuCount: 1,
        status: 'RUNNING',
        intakeStatus: 'ACCEPTING',
        canAcceptOrders: true,
        platformManaged: false,
      },
      {
        id: 1088,
        nodeName: '平台月租 RTX 4090',
        gpuModel: 'RTX 4090',
        gpuCount: 2,
        status: 'RUNNING',
        intakeStatus: 'ACCEPTING',
        canAcceptOrders: true,
        platformManaged: true,
      },
    ])
    renderPanel(<HostedComputePanel busy={null} run={vi.fn()} />)

    expect(await screen.findByText('用户自有 RTX 4090')).toBeTruthy()
    expect(screen.queryByText('平台月租 RTX 4090')).toBeNull()
    expect(screen.getAllByRole('button', { name: '申请下架' })).toHaveLength(1)
  })
})
