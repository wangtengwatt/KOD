// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SIMULATED_MARKET_DISCLOSURE } from '@/packages/compute-market/simulatedMarket'
import type {
  CardHourMarketStats,
  ComputeMarketPriceHistory,
  ComputeMarketPriceSnapshot,
} from '@/packages/computeCenter'
import { type MarketIntelligenceApi, MarketIntelligencePanel } from './MarketIntelligencePanel'

const platformMocks = vi.hoisted(() => ({ openLink: vi.fn() }))

vi.mock('@/platform', () => ({
  default: { openLink: platformMocks.openLink },
}))

const now = new Date().toISOString()

const baseSnapshot: ComputeMarketPriceSnapshot = {
  trackedModels: ['H100'],
  quotes: [
    {
      source: 'VAST_AI',
      sourceLabel: 'Vast.ai',
      gpuModel: 'H100',
      sourceUrl: 'https://vast.ai/pricing',
      status: 'OK',
      quoteType: 'MEDIAN_AVAILABLE',
      priceUsdPerGpuHour: 2.25,
      priceCnyPerGpuHour: 16.2,
      cardHoursPerGpuHour: 16.2,
      sampleSize: 12,
      sampledAt: now,
      lastAttemptAt: now,
      lastSuccessAt: now,
    },
  ],
  usdCnyRate: 7.2,
  cardHourCnyRate: 1,
  refreshIntervalSeconds: 5,
  historySampleSeconds: 60,
  historyRetentionDays: 30,
  generatedAt: now,
}

const baseHistory: ComputeMarketPriceHistory = {
  gpuModel: 'H100',
  range: '24h',
  usdCnyRate: 7.2,
  cardHourCnyRate: 1,
  points: [
    {
      source: 'VAST_AI',
      gpuModel: 'H100',
      quoteType: 'MEDIAN_AVAILABLE',
      priceUsdPerGpuHour: 2,
      priceCnyPerGpuHour: 14.4,
      cardHoursPerGpuHour: 14.4,
      sampleSize: 10,
      sampledAt: new Date(Date.now() - 60_000).toISOString(),
    },
  ],
}

const emptyCardStats: CardHourMarketStats = {
  standardInventory: 0,
  specificInventory: 0,
  volume24h: 0,
  recentTrades: [],
}

function createApi({
  snapshot = baseSnapshot,
  history = baseHistory,
  cardStats = emptyCardStats,
}: {
  snapshot?: ComputeMarketPriceSnapshot
  history?: ComputeMarketPriceHistory
  cardStats?: CardHourMarketStats
} = {}): MarketIntelligenceApi {
  return {
    getLatest: vi.fn(async () => snapshot),
    getHistory: vi.fn(async () => history),
    getCardStats: vi.fn(async () => cardStats),
  }
}

function renderPanel(
  api = createApi(),
  initialView: 'gpu-reference' | 'card-hours' = 'gpu-reference',
  enableAdvanced = false,
  simulationMode = false
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <MarketIntelligencePanel
          api={api}
          initialView={initialView}
          enableAdvanced={enableAdvanced}
          simulationMode={simulationMode}
        />
      </MantineProvider>
    </QueryClientProvider>
  )
  return { ...result, queryClient }
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
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

describe('MarketIntelligencePanel', () => {
  it('shows missing quotes explicitly and never converts them to a zero price', async () => {
    const snapshot: ComputeMarketPriceSnapshot = {
      ...baseSnapshot,
      quotes: [
        {
          source: 'VAST_AI',
          sourceLabel: 'Vast.ai',
          gpuModel: 'H100',
          sourceUrl: 'https://vast.ai/pricing',
          status: 'OK',
          priceUsdPerGpuHour: -2,
          sampleSize: 0,
          errorMessage: 'SQL connection refused at private-host.internal',
        },
      ],
    }
    renderPanel(createApi({ snapshot, history: { ...baseHistory, points: [] } }))

    await screen.findByText('暂无报价')
    expect(document.body.textContent).toContain('当前最低参考价')
    expect(document.body.textContent).not.toContain('$0.0000')
    expect(document.body.textContent).not.toContain('$-2.0000')
    expect(document.body.textContent).not.toContain('private-host.internal')
  })

  it('shows a clear GPU service error with a manual retry action', async () => {
    const api = createApi()
    api.getLatest = vi.fn(() => Promise.reject(new Error('行情接口 HTTP 500')))
    renderPanel(api)

    expect(await screen.findByText('GPU 行情服务暂不可用')).toBeTruthy()
    expect(screen.getByText('行情服务请求失败，请稍后重试。')).toBeTruthy()
    expect(document.body.textContent).not.toContain('行情接口 HTTP 500')
    const retry = screen.getByRole('button', { name: '手动重试' })
    fireEvent.click(retry)
    await waitFor(() => expect(api.getLatest).toHaveBeenCalledTimes(2))
  })

  it('reports a history-only failure and retries it without hiding the current quote', async () => {
    const api = createApi()
    api.getHistory = vi.fn(() => Promise.reject(new Error('历史接口 HTTP 500')))
    renderPanel(api)

    expect(await screen.findByText('历史行情暂不可用')).toBeTruthy()
    expect(screen.getAllByText('$2.2500').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '重试历史行情' }))
    await waitFor(() => expect(api.getHistory).toHaveBeenCalledTimes(2))
  })

  it('renders only completed card-hour trade facts and never exposes participant emails or a fake side', async () => {
    const cardStats: CardHourMarketStats = {
      standardInventory: 24,
      specificInventory: 8,
      volume24h: 3,
      recentTrades: [
        {
          id: 7,
          tradeNo: 'TRADE-PRIVATE-7',
          marketType: 'PRIMARY_SALE',
          assetType: 'SPECIFIC',
          gpuModel: 'H100',
          quantity: 3,
          unitPrice: 1.25,
          priceCurrency: 'CNY',
          totalPrice: 3.75,
          buyerFee: 0,
          sellerFee: 0,
          buyerEmail: 'buyer-private@example.com',
          sellerEmail: 'seller-private@example.com',
          status: 'COMPLETED',
          completedAt: now,
        },
        {
          id: 8,
          tradeNo: 'TRADE-PENDING-8',
          marketType: 'PRIMARY_SALE',
          assetType: 'STANDARD',
          quantity: 9,
          unitPrice: 1,
          priceCurrency: 'CNY',
          totalPrice: 9,
          buyerFee: 0,
          sellerFee: 0,
          buyerEmail: 'pending-buyer@example.com',
          sellerEmail: 'pending-seller@example.com',
          status: 'PENDING',
          completedAt: now,
        },
      ],
    }
    const { queryClient } = renderPanel(createApi({ cardStats }), 'card-hours', true)

    expect(await screen.findAllByText('3 卡时')).toHaveLength(2)
    expect(screen.getAllByText('H100').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toContain('buyer-private@example.com')
    expect(document.body.textContent).not.toContain('seller-private@example.com')
    expect(document.body.textContent).not.toContain('pending-buyer@example.com')
    expect(document.body.textContent).not.toContain('买入')
    expect(document.body.textContent).not.toContain('卖出')
    expect(document.body.textContent).not.toContain('9 卡时')
    expect(
      JSON.stringify(queryClient.getQueryData(['compute', 'market-intelligence', 'live', 'card-hour-stats']))
    ).not.toContain('example.com')
  })

  it('surfaces stale source status and disables an untrusted source URL', async () => {
    const snapshot: ComputeMarketPriceSnapshot = {
      ...baseSnapshot,
      quotes: [
        {
          ...baseSnapshot.quotes[0],
          status: 'STALE',
          sourceUrl: 'https://vast.ai.evil.example/phishing',
        },
      ],
    }
    renderPanel(createApi({ snapshot }))

    expect(await screen.findByText('数据延迟')).toBeTruthy()
    expect((screen.getByRole('button', { name: '来源链接不可用' }) as HTMLButtonElement).disabled).toBe(true)
    expect(platformMocks.openLink).not.toHaveBeenCalled()
  })

  it('opens the same live dashboard in a full-screen modal', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '全屏展示' }))

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText('算力实时行情 · 全屏展示')).toBeTruthy()
  })

  it('shows a truthful empty state when card-hour inventory and completed trades are zero', async () => {
    renderPanel(createApi(), 'card-hours', true)

    expect(await screen.findByText('当前暂无已完成成交')).toBeTruthy()
    expect(screen.getAllByText('0 卡时')).toHaveLength(3)
    expect(document.body.textContent).toContain('库存可以真实为 0')
  })

  it('marks cached quotes as cached data after a refresh failure', async () => {
    const api = createApi()
    const { queryClient } = renderPanel(api)
    expect((await screen.findAllByText('$2.2500')).length).toBeGreaterThan(0)

    api.getLatest = vi.fn(() => Promise.reject(new Error('refresh failed')))
    await queryClient.refetchQueries({ queryKey: ['compute', 'market-intelligence', 'live', 'latest'] })

    expect(await screen.findByText('缓存数据')).toBeTruthy()
    expect(screen.queryByText('数据正常')).toBeNull()
    expect(screen.getAllByText('$2.2500').length).toBeGreaterThan(0)
  })

  it('keeps the P2 trade tape hidden unless the advanced capability flag is enabled', async () => {
    renderPanel(createApi(), 'card-hours')

    expect(await screen.findByText('KOD 平台真实卡时行情')).toBeTruthy()
    expect(screen.queryByText('近期成交')).toBeNull()
  })

  it('uses contract units in simulation mode and discloses the simulator only at the page bottom', async () => {
    renderPanel(createApi(), 'gpu-reference', true, true)

    expect(await screen.findByText('算力合约行情')).toBeTruthy()
    await waitFor(() => expect(document.body.textContent).toContain('¥16.2000'))
    expect(screen.getByText('CNY / 百万 Token')).toBeTruthy()
    expect(screen.getByText(SIMULATED_MARKET_DISCLOSURE)).toBeTruthy()
    expect(document.body.textContent?.match(/模拟/g)).toHaveLength(1)
    expect(screen.queryByText('第三方参考行情')).toBeNull()
    expect(screen.queryByText('Vast.ai')).toBeNull()
    expect(screen.queryByText('Akamai')).toBeNull()
  })
})
