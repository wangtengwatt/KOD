// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComputeAccount, PlatformServerLease, PlatformServerSku } from '@/packages/computeCenter'
import { authInfoStore } from '@/stores/authInfoStore'

const mocks = vi.hoisted(() => ({
  getComputeAccount: vi.fn(),
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
  monthlyRent: 30,
  platformSalePrice: 12,
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
  monthlyRent: 30,
  salePrice: 12,
  status: 'ACTIVE',
  autoRenew: true,
  startedAt: '2026-08-01T12:00:00',
  expiresAt: '2099-09-01T12:00:00',
  stoppingAt: null,
  releasedAt: null,
  renewalCount: 0,
} satisfies PlatformServerLease

const account = {
  userId: 7,
  redeemableCardHours: 90,
  withdrawableCardHours: 90,
  rewardCardHours: 50,
} as ComputeAccount

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
