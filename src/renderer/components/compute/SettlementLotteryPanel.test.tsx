// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LotteryEligibility, LotteryHistory } from '@/packages/computeCenter'
import { authInfoStore } from '@/stores/authInfoStore'

const mocks = vi.hoisted(() => ({
  drawLotteryEligibility: vi.fn(),
  listLotteryEligibilities: vi.fn(),
  listLotteryHistory: vi.fn(),
  uuidv4: vi.fn(),
}))

vi.mock('uuid', () => ({ v4: mocks.uuidv4 }))

vi.mock('@/packages/computeCenter', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/packages/computeCenter')>()
  return {
    ...original,
    drawLotteryEligibility: mocks.drawLotteryEligibility,
    listLotteryEligibilities: mocks.listLotteryEligibilities,
    listLotteryHistory: mocks.listLotteryHistory,
  }
})

import { SettlementLotteryPanel } from './SettlementLotteryPanel'

const gpuEligibility = {
  id: '9007199254740995101',
  beneficiaryUserId: '7',
  sourceType: 'GPU_RESERVATION',
  sourceId: '9007199254740995102',
  rewardBase: '20.000',
  status: 'PENDING',
  ruleVersion: 1,
  createdAt: '2026-08-25T12:00:00',
  drawnAt: null,
  dismissedAt: null,
} satisfies LotteryEligibility

const hostingEligibility = {
  ...gpuEligibility,
  id: '9007199254740995201',
  sourceType: 'HOSTING_PERIOD',
  sourceId: '9007199254740995202',
  rewardBase: '30.000',
} satisfies LotteryEligibility

const history = {
  eligibilityId: '9007199254740995301',
  drawId: '9007199254740995302',
  sourceType: 'HOSTING_PERIOD',
  sourceId: '9007199254740995303',
  rewardBase: '40.000',
  rewardAmount: '1.200',
  rewardLedgerId: '9007199254740995304',
  ruleVersion: 1,
  rateBasisPoints: 300,
  drawnAt: '2026-08-25T13:00:00',
} satisfies LotteryHistory

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MantineProvider>
          <SettlementLotteryPanel />
        </MantineProvider>
      </QueryClientProvider>
    ),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mocks.uuidv4.mockReturnValue('draw-request-1')
  mocks.listLotteryEligibilities.mockResolvedValue([gpuEligibility, hostingEligibility])
  mocks.listLotteryHistory.mockResolvedValue([history])
  authInfoStore.setState({
    accessToken: 'account-a-access',
    refreshToken: 'account-a-refresh',
    accountId: '7',
    loginEmail: 'account-a@kod.test',
  })
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

describe('SettlementLotteryPanel', () => {
  it('shows pending GPU and hosting qualifications plus immutable draw history', async () => {
    renderPanel()

    expect(await screen.findByRole('heading', { name: '抽奖中心' })).toBeTruthy()
    await screen.findByRole('region', { name: `待领取 GPU 租赁订单 ${gpuEligibility.sourceId}` })
    expect(screen.getByText('待领取 2')).toBeTruthy()
    const gpuCard = screen.getByRole('region', { name: `待领取 GPU 租赁订单 ${gpuEligibility.sourceId}` })
    expect(within(gpuCard).getByText(gpuEligibility.id)).toBeTruthy()
    expect(within(gpuCard).getByText('奖励基数 20.000 卡时')).toBeTruthy()
    const hostingCard = screen.getByRole('region', { name: `待领取 卡时托管租期 ${hostingEligibility.sourceId}` })
    expect(within(hostingCard).getByText(hostingEligibility.id)).toBeTruthy()
    expect(within(hostingCard).getByText('奖励基数 30.000 卡时')).toBeTruthy()

    const historyRow = screen.getByRole('row', { name: new RegExp(history.sourceId) })
    expect(within(historyRow).getByText(history.drawId)).toBeTruthy()
    expect(within(historyRow).getByText('3%')).toBeTruthy()
    expect(within(historyRow).getByText('1.200')).toBeTruthy()
    expect(within(historyRow).getByText(history.rewardLedgerId)).toBeTruthy()
    expect(screen.getByText('奖励卡时不可回购成人民币')).toBeTruthy()
    expect(mocks.listLotteryEligibilities).toHaveBeenCalledWith('PENDING')
    expect(mocks.listLotteryHistory).toHaveBeenCalledTimes(1)
  })

  it('opens a pending qualification from the center and closing it keeps the qualification visible', async () => {
    renderPanel()

    const card = await screen.findByRole('region', { name: `待领取 GPU 租赁订单 ${gpuEligibility.sourceId}` })
    fireEvent.click(within(card).getByRole('button', { name: '立即抽奖' }))
    expect(await screen.findByRole('dialog', { name: '订单结算抽奖' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '关闭抽奖弹窗' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '订单结算抽奖' })).toBeNull())
    expect(screen.getByRole('region', { name: `待领取 GPU 租赁订单 ${gpuEligibility.sourceId}` })).toBeTruthy()
    expect(mocks.drawLotteryEligibility).not.toHaveBeenCalled()
  })

  it('shows explicit empty and failure states', async () => {
    mocks.listLotteryEligibilities.mockResolvedValue([])
    mocks.listLotteryHistory.mockRejectedValue(new Error('历史服务不可用'))
    renderPanel()

    expect(await screen.findByText('暂无待领取抽奖资格。')).toBeTruthy()
    expect(await screen.findByText('历史服务不可用')).toBeTruthy()
  })

  it('removes account-a pending rows and ignores their late response after switching to account b', async () => {
    let resolveAccountA: ((value: LotteryEligibility[]) => void) | undefined
    const accountAResponse = new Promise<LotteryEligibility[]>((resolve) => {
      resolveAccountA = resolve
    })
    const accountBEligibility = {
      ...hostingEligibility,
      id: '9007199254740995401',
      beneficiaryUserId: '8',
      sourceId: '9007199254740995402',
    }
    mocks.listLotteryEligibilities
      .mockImplementationOnce(() => accountAResponse)
      .mockResolvedValueOnce([accountBEligibility])
    renderPanel()
    await waitFor(() => expect(mocks.listLotteryEligibilities).toHaveBeenCalledTimes(1))

    act(() => {
      authInfoStore.setState({
        accessToken: 'account-b-access',
        refreshToken: 'account-b-refresh',
        accountId: '8',
        loginEmail: 'account-b@kod.test',
      })
    })

    expect(await screen.findByText(accountBEligibility.sourceId)).toBeTruthy()
    expect(screen.queryByText(gpuEligibility.sourceId)).toBeNull()

    await act(async () => {
      resolveAccountA?.([gpuEligibility])
      await accountAResponse
    })

    expect(screen.queryByText(gpuEligibility.sourceId)).toBeNull()
    expect(screen.getByText(accountBEligibility.sourceId)).toBeTruthy()
  })
})
