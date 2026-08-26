// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KaiMarketInferenceView } from '@/packages/compute-market/kaiInference'
import { KaiMarketInferenceCard } from './KaiMarketInferenceCard'

const MODEL_ANSWER = 'dt_ns=6 event=TRADE side=BUY price=98002.50000000 quantity=0.10000000'

const successfulInference: NonNullable<KaiMarketInferenceView['lastSuccess']> = {
  inferenceId: '9007199254740993123',
  fingerprint: 'a'.repeat(64),
  generatedAt: '2026-08-25T08:00:00Z',
  prediction: {
    model: 'Kai_distill_LM',
    text: MODEL_ANSWER,
    nextEvent: {
      dtNs: '6',
      event: 'TRADE',
      side: 'BUY',
      price: '98002.50000000',
      quantity: '0.10000000',
    },
  },
  pipeline: {
    status: 'AVAILABLE',
    model: 'Kai_distill_LM',
    text: '真实买卖盘完整，风险敞口处于限制内。',
  },
}

const matchedVerification: NonNullable<KaiMarketInferenceView['verification']> = {
  status: 'MATCHED',
  inferenceId: '9007199254740993123',
  actualTradeId: 'trade-550e8400-e29b-41d4-a716-446655440000',
  actualSide: 'BUY',
  actualPrice: '98002.60000000',
  actualQuantity: '0.20000000',
  actualAt: '2026-08-25T08:00:30Z',
  directionMatched: true,
  priceError: '0.10000000',
}

const freshView: KaiMarketInferenceView = {
  contractId: 'contract-H100-cn',
  status: 'FRESH',
  fingerprint: 'a'.repeat(64),
  checkedAt: '2026-08-25T08:00:01Z',
  lastSuccess: successfulInference,
  verification: matchedVerification,
}

function renderCard(
  view: KaiMarketInferenceView = freshView,
  onRefresh: () => void | Promise<void> = vi.fn(),
  refreshing = false
) {
  return render(
    <MantineProvider>
      <KaiMarketInferenceCard view={view} onRefresh={onRefresh} refreshing={refreshing} />
    </MantineProvider>
  )
}

beforeEach(() => {
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

describe('KaiMarketInferenceCard', () => {
  it('labels a fresh server prediction, real-order-book analysis, and real verification without trade actions', () => {
    renderCard()

    expect(screen.getByRole('heading', { name: 'Kai AI 行情研判' })).toBeTruthy()
    expect(screen.getByText('实时成交序列已变化')).toBeTruthy()
    expect(screen.getByText('最新预测')).toBeTruthy()
    expect(screen.getByText('2026-08-25T08:00:00Z').getAttribute('datetime')).toBe('2026-08-25T08:00:00Z')
    expect(screen.getByText('2026-08-25T08:00:01Z').getAttribute('datetime')).toBe('2026-08-25T08:00:01Z')

    const prediction = screen.getByRole('region', { name: '模型预测结果' })
    expect(within(prediction).getByText('Kai_distill_LM')).toBeTruthy()
    expect(within(prediction).getByText(MODEL_ANSWER)).toBeTruthy()
    expect(within(prediction).getByText('模型预测下一事件')).toBeTruthy()
    expect(within(prediction).getByText(/dt_ns 6 · BUY · 价格 98002\.50000000 · 数量 0\.10000000/)).toBeTruthy()

    const pipeline = screen.getByRole('region', { name: '真实订单簿风险分析' })
    expect(within(pipeline).getByText('真实订单簿已确认')).toBeTruthy()
    expect(within(pipeline).getByText('真实买卖盘完整，风险敞口处于限制内。')).toBeTruthy()

    const verification = screen.getByRole('region', { name: '真实成交核验' })
    expect(within(verification).getByText('真实成交核验：已命中')).toBeTruthy()
    expect(within(verification).getByText(/trade-550e8400-e29b-41d4-a716-446655440000/)).toBeTruthy()
    expect(within(verification).getByText(/98002\.60000000/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /买入|卖出|下单|交易/ })).toBeNull()
  })

  it('renders precision-38 market values and precision-56 signed error without coercion', () => {
    const highPrice = '999999999999999999.999999999999999999'
    const highQuantity = '0.000000000000000001'
    const highError = `-${'9'.repeat(38)}.${'9'.repeat(18)}`
    renderCard({
      ...freshView,
      lastSuccess: {
        ...successfulInference,
        prediction: {
          ...successfulInference.prediction,
          nextEvent: {
            dtNs: '7',
            event: 'TRADE',
            side: 'SELL',
            price: highPrice,
            quantity: highQuantity,
          },
        },
      },
      verification: {
        ...matchedVerification,
        actualPrice: highPrice,
        actualQuantity: highQuantity,
        priceError: highError,
      },
    })

    const prediction = screen.getByRole('region', { name: '模型预测结果' })
    expect(
      within(prediction).getByText((content) => content.includes(highPrice) && content.includes(highQuantity))
    ).toBeTruthy()
    const verification = screen.getByRole('region', { name: '真实成交核验' })
    expect(
      within(verification).getByText((content) => content.includes(highPrice) && content.includes(highQuantity))
    ).toBeTruthy()
    expect(within(verification).getByText((content) => content.includes(highError))).toBeTruthy()
  })

  it('marks a cached prediction and refuses to invent pipeline output without both real book sides', () => {
    renderCard({
      ...freshView,
      status: 'CACHED',
      lastSuccess: {
        ...successfulInference,
        pipeline: { status: 'INSUFFICIENT_ORDER_BOOK' },
      },
      verification: { status: 'PENDING', inferenceId: '9007199254740993123' },
    })

    expect(screen.getByText('缓存预测')).toBeTruthy()
    expect(screen.getByText('当前展示最近一次成功研判')).toBeTruthy()
    expect(screen.queryByText('成交序列未变化，展示缓存结果')).toBeNull()
    expect(screen.getByText('真实订单簿数据不足，未生成风险分析')).toBeTruthy()
    expect(screen.queryByText(/best bid|best ask|最佳买价|最佳卖价/i)).toBeNull()
    expect(screen.getByText('等待下一笔真实成交核验')).toBeTruthy()
  })

  it('keeps the static disclaimer non-disruptive', () => {
    renderCard()

    const note = screen.getByRole('note')
    expect(note.textContent).toContain('不构成交易建议')
    expect(note.closest('[role="alert"]')).toBeNull()
  })

  it('announces refreshed state and verification changes politely', () => {
    renderCard()

    expect(within(screen.getByRole('status', { name: '研判状态' })).getByText('最新预测')).toBeTruthy()
    expect(
      within(screen.getByRole('region', { name: '真实成交核验' })).getByRole('status', {
        name: '真实成交核验状态',
      })
    ).toBeTruthy()
  })

  it('labels the displayed prediction and an older verification with their exact inference ids', () => {
    const previousInferenceId = '9007199254740993122'
    renderCard({
      ...freshView,
      verification: {
        ...matchedVerification,
        inferenceId: previousInferenceId,
      },
    })

    const prediction = screen.getByRole('region', { name: '模型预测结果' })
    expect(within(prediction).getByText(`预测 ID ${successfulInference.inferenceId}`)).toBeTruthy()
    const verification = screen.getByRole('region', { name: '真实成交核验' })
    expect(within(verification).getByText(`核验目标 ID ${previousInferenceId}`)).toBeTruthy()
    expect(within(verification).getByText('上一条预测核验')).toBeTruthy()
  })

  it('keeps the last success visible and marks it stale when the current service is unavailable', () => {
    renderCard({
      ...freshView,
      status: 'UNAVAILABLE',
      fingerprint: 'b'.repeat(64),
      checkedAt: '2026-08-25T08:01:01Z',
    })

    expect(screen.getByText('预测服务暂不可用')).toBeTruthy()
    expect(screen.getByText('已保留上一次成功预测')).toBeTruthy()
    expect(screen.getByText(MODEL_ANSWER)).toBeTruthy()
    expect(screen.getByText('上次成功时间')).toBeTruthy()
    expect(screen.getByText('2026-08-25T08:00:00Z')).toBeTruthy()
    expect(screen.getByText('2026-08-25T08:01:01Z')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows an honest first-load error and invokes only the supplied manual retry callback', () => {
    const onRefresh = vi.fn()
    renderCard(
      {
        ...freshView,
        status: 'UNAVAILABLE',
        fingerprint: null,
        lastSuccess: null,
        verification: null,
      },
      onRefresh
    )

    expect(screen.getByText('预测服务暂不可用')).toBeTruthy()
    expect(screen.getByText('尚无可显示的预测结果。')).toBeTruthy()
    expect(screen.queryByText(/本次刷新失败/)).toBeNull()
    expect(screen.queryByText(MODEL_ANSWER)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重试预测' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('renders backend pipeline unavailability without replacing it with local risk claims', () => {
    renderCard({
      ...freshView,
      status: 'CACHED',
      lastSuccess: {
        ...successfulInference,
        pipeline: { status: 'UNAVAILABLE' },
      },
    })

    expect(screen.getByText('风险分析服务暂不可用')).toBeTruthy()
    expect(screen.queryByText('真实订单簿已确认')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('distinguishes a missed real event from the model prediction', () => {
    renderCard({
      ...freshView,
      verification: {
        status: 'MISSED',
        inferenceId: '9007199254740993123',
        actualTradeId: 'trade-real-missed',
        actualSide: 'SELL',
        actualPrice: '97999.00000000',
        actualQuantity: '0.30000000',
        actualAt: '2026-08-25T08:00:30Z',
        directionMatched: false,
        priceError: '-3.50000000',
      },
    })

    expect(
      within(screen.getByRole('region', { name: '模型预测结果' })).getByText(/dt_ns 6 · BUY · 价格 98002\.50000000/)
    ).toBeTruthy()
    const verification = screen.getByRole('region', { name: '真实成交核验' })
    expect(within(verification).getByText('真实成交核验：未命中')).toBeTruthy()
    expect(within(verification).getByText(/SELL/)).toBeTruthy()
    expect(within(verification).getByText(/-3\.50000000/)).toBeTruthy()
  })

  it('shows a status-only unverifiable result without inventing an actual trade', () => {
    renderCard({
      ...freshView,
      verification: {
        status: 'UNVERIFIABLE',
        inferenceId: successfulInference.inferenceId,
      },
    })

    const verification = screen.getByRole('region', { name: '真实成交核验' })
    expect(within(verification).getByText('模型输出无法核验')).toBeTruthy()
    expect(within(verification).getByText(`核验目标 ID ${successfulInference.inferenceId}`)).toBeTruthy()
    expect(within(verification).queryByText(/真实成交已到达|真实成交 trade-/)).toBeNull()
  })

  it('wraps a long opaque real trade id without changing it', () => {
    const actualTradeId = `trade-${'opaque'.repeat(30)}`
    renderCard({
      ...freshView,
      verification: {
        ...matchedVerification,
        actualTradeId,
      },
    })

    const verification = screen.getByRole('region', { name: '真实成交核验' })
    const trade = within(verification).getByText((content) => content.includes(actualTradeId))
    expect(trade.style.overflowWrap).toBe('anywhere')
    expect(trade.textContent).toContain(actualTradeId)
  })
})
