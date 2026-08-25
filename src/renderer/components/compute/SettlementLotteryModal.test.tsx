// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LotteryDraw, LotteryEligibility } from '@/packages/computeCenter'
import { authInfoStore } from '@/stores/authInfoStore'

const mocks = vi.hoisted(() => ({
  drawLotteryEligibility: vi.fn(),
  uuidv4: vi.fn(),
}))

vi.mock('uuid', () => ({ v4: mocks.uuidv4 }))

vi.mock('@/packages/computeCenter', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/packages/computeCenter')>()
  return {
    ...original,
    drawLotteryEligibility: mocks.drawLotteryEligibility,
  }
})

import { SettlementLotteryModal } from './SettlementLotteryModal'

const gpuEligibility = {
  id: '9007199254740994101',
  beneficiaryUserId: '7',
  sourceType: 'GPU_RESERVATION',
  sourceId: '9007199254740994102',
  rewardBase: '12.000',
  status: 'PENDING',
  ruleVersion: 1,
  createdAt: '2026-08-25T12:00:00',
  drawnAt: null,
  dismissedAt: null,
} satisfies LotteryEligibility

const authoritativeDraw = {
  id: '9007199254740994201',
  eligibilityId: gpuEligibility.id,
  ruleVersion: 1,
  rateBasisPoints: 500,
  rewardAmount: '0.600',
  requestId: 'draw-request-1',
  rewardLedgerId: '9007199254740994202',
  drawnAt: '2026-08-25T12:01:00',
} satisfies LotteryDraw

function renderModal(
  eligibility: LotteryEligibility | null = gpuEligibility,
  options: { opened?: boolean; onClose?: () => void; onDrawn?: (draw: LotteryDraw) => void } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <SettlementLotteryModal
          opened={options.opened ?? true}
          eligibility={eligibility}
          onClose={options.onClose ?? vi.fn()}
          onDrawn={options.onDrawn}
        />
      </MantineProvider>
    </QueryClientProvider>
  )
  return { queryClient, ...view }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mocks.uuidv4.mockReturnValue('draw-request-1')
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('SettlementLotteryModal', () => {
  it('shows the fixed wheel and closes without consuming the pending eligibility', () => {
    const onClose = vi.fn()
    renderModal(gpuEligibility, { onClose })

    expect(screen.getByRole('dialog', { name: '订单结算抽奖' })).toBeTruthy()
    for (const label of ['0.5%', '1%', '2%', '3%', '5%']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    expect(screen.getByText('GPU 租赁订单')).toBeTruthy()
    expect(screen.getByText(gpuEligibility.sourceId)).toBeTruthy()
    expect(screen.getByText('奖励基数 12.000 卡时')).toBeTruthy()
    expect(screen.getByText('奖励卡时不可回购成人民币')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '关闭抽奖弹窗' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mocks.drawLotteryEligibility).not.toHaveBeenCalled()
  })

  it('waits for the server result before landing and displays the exact authoritative reward', async () => {
    let resolveDraw: ((value: LotteryDraw) => void) | undefined
    const response = new Promise<LotteryDraw>((resolve) => {
      resolveDraw = resolve
    })
    mocks.drawLotteryEligibility.mockReturnValue(response)
    const onDrawn = vi.fn()
    const { queryClient } = renderModal(gpuEligibility, { onDrawn })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const drawButton = screen.getByRole('button', { name: '开始抽奖' })
    fireEvent.click(drawButton)
    fireEvent.click(drawButton)

    expect(mocks.drawLotteryEligibility).toHaveBeenCalledWith(
      gpuEligibility.id,
      'draw-request-1',
      expect.any(AbortSignal)
    )
    expect(mocks.drawLotteryEligibility).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('button', { name: '等待服务端确认中' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByLabelText('转盘结果 5%')).toBeNull()
    expect(screen.queryByText('获得奖励 0.600 卡时')).toBeNull()

    await act(async () => {
      resolveDraw?.(authoritativeDraw)
      await response
    })

    const landedWheel = await screen.findByLabelText('转盘结果 5%')
    expect(landedWheel.style.transform).toBe('rotate(756deg)')
    expect(screen.getByText('获得奖励 0.600 卡时')).toBeTruthy()
    expect(screen.getByText('奖励比例 5%')).toBeTruthy()
    expect(screen.getByText('奖励流水 ID 9007199254740994202')).toBeTruthy()
    expect(screen.getByText('已领取')).toBeTruthy()
    expect(screen.queryByText('待领取')).toBeNull()
    const resultStatus = screen.getByRole('status', { name: '抽奖结果：获得奖励 0.600 卡时' })
    expect(resultStatus.getAttribute('aria-live')).toBe('polite')
    await waitFor(() => expect(document.activeElement).toBe(resultStatus))
    await waitFor(() => expect(onDrawn).toHaveBeenCalledWith(authoritativeDraw))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['compute', 'account:7', 'lottery'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['wallet', 'account:7', 'card-time-account'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['compute', 'account:7', 'ledger'] })
  })

  it('ends a never-resolving draw at the deadline and restores a safe close path', async () => {
    mocks.drawLotteryEligibility.mockReturnValue(new Promise<LotteryDraw>(() => undefined))
    const onClose = vi.fn()
    renderModal(gpuEligibility, { onClose })
    vi.useFakeTimers()

    fireEvent.click(screen.getByRole('button', { name: '开始抽奖' }))
    const closeButton = screen.getByRole('button', { name: '关闭抽奖弹窗' }) as HTMLButtonElement
    expect(closeButton.disabled).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })

    expect(screen.getByText('抽奖服务响应超时，请稍后使用同一请求编号重试。')).toBeTruthy()
    expect(closeButton.disabled).toBe(false)
    fireEvent.click(closeButton)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mocks.drawLotteryEligibility).toHaveBeenCalledTimes(1)
    expect(mocks.drawLotteryEligibility).toHaveBeenCalledWith(
      gpuEligibility.id,
      'draw-request-1',
      expect.any(AbortSignal)
    )
  })

  it('reuses the same request id after an ambiguous failure and never rerolls locally', async () => {
    mocks.drawLotteryEligibility
      .mockRejectedValueOnce(new Error('网络超时，结果未知'))
      .mockResolvedValueOnce(authoritativeDraw)
    renderModal()

    fireEvent.click(screen.getByRole('button', { name: '开始抽奖' }))
    expect(await screen.findByText('网络超时，结果未知')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '重试抽奖' }))

    expect(await screen.findByText('获得奖励 0.600 卡时')).toBeTruthy()
    expect(mocks.drawLotteryEligibility).toHaveBeenCalledTimes(2)
    expect(mocks.drawLotteryEligibility).toHaveBeenNthCalledWith(
      1,
      gpuEligibility.id,
      'draw-request-1',
      expect.any(AbortSignal)
    )
    expect(mocks.drawLotteryEligibility).toHaveBeenNthCalledWith(
      2,
      gpuEligibility.id,
      'draw-request-1',
      expect.any(AbortSignal)
    )
    expect(mocks.uuidv4).toHaveBeenCalledTimes(1)
  })

  it.each([
    [
      'GPU_RESERVATION' as const,
      'GPU 租赁订单',
      '本次 GPU 租赁订单的可回购卡时结算贡献为 0，因此奖励基数为 0.000 卡时。',
    ],
    ['HOSTING_PERIOD' as const, '卡时托管租期', '本次卡时托管租期实际支付月租为 0，因此奖励基数为 0.000 卡时。'],
  ])('explains a zero %s reward base from its authoritative contribution', (sourceType, sourceLabel, explanation) => {
    renderModal({ ...gpuEligibility, rewardBase: '0.000', sourceType })

    expect(screen.getByText(explanation)).toBeTruthy()
    expect(screen.getByText(sourceLabel)).toBeTruthy()
  })

  it('drops an account-a late draw response after switching to account b', async () => {
    let resolveDraw: ((value: LotteryDraw) => void) | undefined
    const response = new Promise<LotteryDraw>((resolve) => {
      resolveDraw = resolve
    })
    mocks.drawLotteryEligibility.mockReturnValue(response)
    const onDrawn = vi.fn()
    const view = renderModal(gpuEligibility, { onDrawn })

    fireEvent.click(screen.getByRole('button', { name: '开始抽奖' }))
    const accountASignal = mocks.drawLotteryEligibility.mock.calls[0]?.[2] as AbortSignal
    expect(accountASignal.aborted).toBe(false)
    act(() => {
      authInfoStore.setState({
        accessToken: 'account-b-access',
        refreshToken: 'account-b-refresh',
        accountId: '8',
        loginEmail: 'account-b@kod.test',
      })
    })
    view.rerender(
      <QueryClientProvider client={view.queryClient}>
        <MantineProvider>
          <SettlementLotteryModal
            opened
            eligibility={{
              ...gpuEligibility,
              id: '9007199254740994301',
              beneficiaryUserId: '8',
              sourceId: '9007199254740994302',
            }}
            onClose={vi.fn()}
            onDrawn={onDrawn}
          />
        </MantineProvider>
      </QueryClientProvider>
    )

    expect(accountASignal.aborted).toBe(true)

    await act(async () => {
      resolveDraw?.(authoritativeDraw)
      await response
    })

    expect(screen.queryByText('获得奖励 0.600 卡时')).toBeNull()
    expect(onDrawn).not.toHaveBeenCalled()
    expect(screen.getByText('9007199254740994302')).toBeTruthy()
  })
})
