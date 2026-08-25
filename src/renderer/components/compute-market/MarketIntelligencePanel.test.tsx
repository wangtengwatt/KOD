// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KaiMarketInferenceContract, KaiMarketInferenceView } from '@/packages/compute-market/kaiInference'
import { SIMULATED_MARKET_DISCLOSURE } from '@/packages/compute-market/simulatedMarket'
import type {
  CardHourMarketStats,
  ComputeMarketPriceHistory,
  ComputeMarketPriceSnapshot,
} from '@/packages/computeCenter'
import { type MarketInferenceApi, type MarketIntelligenceApi, MarketIntelligencePanel } from './MarketIntelligencePanel'

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

const ACCOUNT_A = 'account:9223372036854775807'
const ACCOUNT_B = 'email:other@example.com'
const CONTRACT_A = 'hk-h100-deepseek-v3-sglang-2026082517'
const CONTRACT_B = 'hk-h100-llama-3.3-70b-vllm-2026082517'

const realContracts: KaiMarketInferenceContract[] = [
  {
    contractId: 'hk-a100-qwen-vllm-2026082517',
    name: 'HK-A100-QWEN-VLLM-2026082517',
    model: 'qwen',
    gpuModel: 'A100',
    runtime: 'vllm',
    deliveryAt: '2026-08-25T17:00:00Z',
    status: 'trading',
  },
  {
    contractId: 'hk-h100-closed-vllm-2026082517',
    name: 'HK-H100-CLOSED-VLLM-2026082517',
    model: 'closed-model',
    gpuModel: 'H100',
    runtime: 'vllm',
    deliveryAt: '2026-08-25T17:00:00Z',
    status: 'closed',
  },
  {
    contractId: CONTRACT_A,
    name: 'HK-H100-DEEPSEEK-V3-SGLANG-2026082517',
    model: 'deepseek-v3',
    gpuModel: 'H100',
    runtime: 'sglang',
    deliveryAt: '2026-08-25T17:00:00Z',
    status: 'trading',
  },
  {
    contractId: CONTRACT_B,
    name: 'HK-H100-LLAMA-3.3-70B-VLLM-2026082517',
    model: 'llama-3.3-70b',
    gpuModel: 'H100',
    runtime: 'vllm',
    deliveryAt: '2026-08-25T17:00:00Z',
    status: 'trading',
  },
]

function inferenceView(contractId = CONTRACT_A, text = `prediction for ${contractId}`): KaiMarketInferenceView {
  const fingerprint = contractId === CONTRACT_B ? 'b'.repeat(64) : 'a'.repeat(64)
  return {
    contractId,
    status: 'FRESH',
    fingerprint,
    checkedAt: '2026-08-25T08:00:01Z',
    lastSuccess: {
      inferenceId: contractId === CONTRACT_B ? '9007199254740993124' : '9007199254740993123',
      fingerprint,
      generatedAt: '2026-08-25T08:00:00Z',
      prediction: {
        model: 'Kai_distill_LM',
        text,
        nextEvent: null,
      },
      pipeline: { status: 'INSUFFICIENT_ORDER_BOOK' },
    },
    verification: null,
  }
}

function createInferenceApi(): MarketInferenceApi {
  return {
    getContracts: vi.fn(async () => realContracts),
    getInference: vi.fn(async (contractId) => inferenceView(contractId)),
    refreshInference: vi.fn(async (contractId) => inferenceView(contractId)),
  }
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

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
}

function renderPanel(
  api = createApi(),
  initialView: 'gpu-reference' | 'card-hours' = 'gpu-reference',
  enableAdvanced = false,
  simulationMode = false,
  identity: string | null = null,
  inferenceApi = createInferenceApi(),
  queryClient = createTestQueryClient()
) {
  const panel = (nextIdentity: string | null) => (
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <MarketIntelligencePanel
          api={api}
          initialView={initialView}
          enableAdvanced={enableAdvanced}
          simulationMode={simulationMode}
          identity={nextIdentity}
          inferenceApi={inferenceApi}
        />
      </MantineProvider>
    </QueryClientProvider>
  )
  const result = render(panel(identity))
  return {
    ...result,
    queryClient,
    rerenderPanel: (nextIdentity: string | null) => result.rerender(panel(nextIdentity)),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
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

  it('selects the first trading real contract for the GPU model and scopes the inference query by identity and contract', async () => {
    const inferenceApi = createInferenceApi()
    const { queryClient } = renderPanel(createApi(), 'gpu-reference', false, false, ACCOUNT_A, inferenceApi)

    expect(await screen.findByText('Kai AI 行情研判')).toBeTruthy()
    await waitFor(() => expect(inferenceApi.getContracts).toHaveBeenCalledWith(ACCOUNT_A, expect.any(AbortSignal)))
    await waitFor(() =>
      expect(inferenceApi.getInference).toHaveBeenCalledWith(CONTRACT_A, ACCOUNT_A, expect.any(AbortSignal))
    )

    await new Promise((resolve) => setTimeout(resolve, 2))
    await queryClient.refetchQueries({ queryKey: ['compute', 'market-intelligence', 'live', 'latest'], exact: true })
    await waitFor(() =>
      expect(inferenceApi.refreshInference).toHaveBeenCalledWith(CONTRACT_A, ACCOUNT_A, expect.any(AbortSignal))
    )

    const selector = screen.getByRole('textbox', { name: '预测合约' }) as HTMLInputElement
    expect(selector.value).toContain('deepseek-v3')
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .some(({ queryKey }) => JSON.stringify(queryKey).includes(`${ACCOUNT_A}","contract","${CONTRACT_A}`))
    ).toBe(true)
  })

  it('keeps cached inference visible while backend refresh is pending or unavailable and retries only with POST refresh', async () => {
    const inferenceApi = createInferenceApi()
    let rejectRefresh: ((reason?: unknown) => void) | undefined
    inferenceApi.refreshInference = vi.fn(
      () =>
        new Promise<KaiMarketInferenceView>((_resolve, reject) => {
          rejectRefresh = reject
        })
    )
    const { queryClient } = renderPanel(createApi(), 'gpu-reference', false, false, ACCOUNT_A, inferenceApi)

    expect(await screen.findByText(`prediction for ${CONTRACT_A}`)).toBeTruthy()
    await new Promise((resolve) => setTimeout(resolve, 2))
    await queryClient.refetchQueries({ queryKey: ['compute', 'market-intelligence', 'live', 'latest'], exact: true })
    await waitFor(() => expect(inferenceApi.refreshInference).toHaveBeenCalledTimes(1))
    expect(screen.getAllByText('$2.2500').length).toBeGreaterThan(0)
    expect(screen.getByText(`prediction for ${CONTRACT_A}`)).toBeTruthy()

    rejectRefresh?.(new Error('private inference transport detail'))
    expect(await screen.findByText('预测服务暂不可用')).toBeTruthy()
    expect(document.body.textContent).not.toContain('private inference transport detail')
    expect(screen.getByText(`prediction for ${CONTRACT_A}`)).toBeTruthy()

    inferenceApi.refreshInference = vi.fn(async (contractId) => inferenceView(contractId))
    const inferenceReadsBeforeRetry = vi.mocked(inferenceApi.getInference).mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: '重新研判' }))
    await waitFor(() => expect(inferenceApi.refreshInference).toHaveBeenCalledTimes(1))
    expect(inferenceApi.getInference).toHaveBeenCalledTimes(inferenceReadsBeforeRetry)
    expect(queryClient.getQueryData(['compute', 'market-inference', ACCOUNT_A, 'contract', CONTRACT_A])).toBeTruthy()
  })

  it('keeps one owner-scoped refresh in flight across repeated quote ticks and applies its eventual result', async () => {
    const api = createApi()
    let resolveLatest: ((snapshot: ComputeMarketPriceSnapshot) => void) | undefined
    const pendingLatest = new Promise<ComputeMarketPriceSnapshot>((resolve) => {
      resolveLatest = resolve
    })
    api.getLatest = vi.fn(() => pendingLatest)
    const inferenceApi = createInferenceApi()
    let resolveRefresh: ((value: KaiMarketInferenceView) => void) | undefined
    const pendingRefresh = new Promise<KaiMarketInferenceView>((resolve) => {
      resolveRefresh = resolve
    })
    inferenceApi.refreshInference = vi.fn(() => pendingRefresh)
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(['compute', 'market-intelligence', 'live', 'latest'], baseSnapshot, {
      updatedAt: Date.now() - 10_000,
    })
    renderPanel(api, 'gpu-reference', false, false, ACCOUNT_A, inferenceApi, queryClient)

    expect(await screen.findByText(`prediction for ${CONTRACT_A}`)).toBeTruthy()
    expect(inferenceApi.refreshInference).not.toHaveBeenCalled()

    resolveLatest?.({ ...baseSnapshot, generatedAt: new Date().toISOString() })
    await waitFor(() => expect(inferenceApi.refreshInference).toHaveBeenCalledTimes(1))

    for (let index = 0; index < 4; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2))
      await queryClient.refetchQueries({ queryKey: ['compute', 'market-intelligence', 'live', 'latest'], exact: true })
    }

    await waitFor(() => expect(inferenceApi.refreshInference).toHaveBeenCalledTimes(1))
    resolveRefresh?.(inferenceView(CONTRACT_A, 'single flight result'))
    expect(await screen.findByText('single flight result')).toBeTruthy()
    expect(inferenceApi.refreshInference).toHaveBeenCalledTimes(1)
  })

  it('does not POST from a remounted cached quote and arms only after a newer successful quote', async () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(['compute', 'market-intelligence', 'live', 'latest'], baseSnapshot, {
      updatedAt: Date.now() - 10_000,
    })
    let resolveLatest: ((snapshot: ComputeMarketPriceSnapshot) => void) | undefined
    const api = createApi()
    api.getLatest = vi.fn(
      () =>
        new Promise<ComputeMarketPriceSnapshot>((resolve) => {
          resolveLatest = resolve
        })
    )
    const inferenceApi = createInferenceApi()
    renderPanel(api, 'gpu-reference', false, false, ACCOUNT_A, inferenceApi, queryClient)

    expect(await screen.findByText(`prediction for ${CONTRACT_A}`)).toBeTruthy()
    await waitFor(() => expect(api.getLatest).toHaveBeenCalledTimes(1))
    expect(inferenceApi.refreshInference).not.toHaveBeenCalled()

    resolveLatest?.({ ...baseSnapshot, generatedAt: new Date().toISOString() })
    await waitFor(() => expect(inferenceApi.refreshInference).toHaveBeenCalledTimes(1))
  })

  it('does not reuse a cached quote timestamp as a trigger after account or contract ownership changes', async () => {
    const api = createApi()
    const inferenceApi = createInferenceApi()
    inferenceApi.getInference = vi.fn(async (contractId, identity) =>
      inferenceView(contractId, `read ${identity} ${contractId}`)
    )
    inferenceApi.refreshInference = vi.fn(async (contractId, identity) =>
      inferenceView(contractId, `refresh ${identity} ${contractId}`)
    )
    const { queryClient, rerenderPanel } = renderPanel(api, 'gpu-reference', false, false, ACCOUNT_A, inferenceApi)

    expect(await screen.findByText(`read ${ACCOUNT_A} ${CONTRACT_A}`)).toBeTruthy()
    const initialRefreshCount = vi.mocked(inferenceApi.refreshInference).mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 2))
    await queryClient.refetchQueries({ queryKey: ['compute', 'market-intelligence', 'live', 'latest'], exact: true })
    await waitFor(() => expect(inferenceApi.refreshInference).toHaveBeenCalledTimes(initialRefreshCount + 1))

    rerenderPanel(ACCOUNT_B)
    expect(await screen.findByText(`read ${ACCOUNT_B} ${CONTRACT_A}`)).toBeTruthy()
    expect(inferenceApi.refreshInference).toHaveBeenCalledTimes(initialRefreshCount + 1)
    await new Promise((resolve) => setTimeout(resolve, 2))
    await queryClient.refetchQueries({ queryKey: ['compute', 'market-intelligence', 'live', 'latest'], exact: true })
    await waitFor(() => expect(inferenceApi.refreshInference).toHaveBeenCalledTimes(initialRefreshCount + 2))

    const selector = screen.getByRole('textbox', { name: '预测合约' })
    fireEvent.click(selector)
    fireEvent.click(await screen.findByRole('option', { name: /llama-3\.3-70b/ }))
    expect(await screen.findByText(`read ${ACCOUNT_B} ${CONTRACT_B}`)).toBeTruthy()
    expect(inferenceApi.refreshInference).toHaveBeenCalledTimes(initialRefreshCount + 2)
    await new Promise((resolve) => setTimeout(resolve, 2))
    await queryClient.refetchQueries({ queryKey: ['compute', 'market-intelligence', 'live', 'latest'], exact: true })
    await waitFor(() =>
      expect(inferenceApi.refreshInference).toHaveBeenLastCalledWith(CONTRACT_B, ACCOUNT_B, expect.any(AbortSignal))
    )
    expect(inferenceApi.refreshInference).toHaveBeenCalledTimes(initialRefreshCount + 3)
  })

  it('retains the selected contract and last prediction when a later directory refresh fails', async () => {
    const inferenceApi = createInferenceApi()
    const { queryClient } = renderPanel(createApi(), 'gpu-reference', false, false, ACCOUNT_A, inferenceApi)

    expect(await screen.findByText(`prediction for ${CONTRACT_A}`)).toBeTruthy()
    inferenceApi.getContracts = vi.fn(() => Promise.reject(new Error('directory refresh detail')))
    await queryClient.refetchQueries({
      queryKey: ['compute', 'market-inference', ACCOUNT_A, 'contracts', 'gpu-reference', 'H100'],
      exact: true,
    })

    expect(await screen.findByText('预测服务暂不可用')).toBeTruthy()
    expect(screen.getByText(`prediction for ${CONTRACT_A}`)).toBeTruthy()
    expect((screen.getByRole('textbox', { name: '预测合约' }) as HTMLInputElement).value).toContain('deepseek-v3')
    expect(document.body.textContent).not.toContain('directory refresh detail')
  })

  it('recovers a first inference read failure only through the backend refresh action', async () => {
    const inferenceApi = createInferenceApi()
    inferenceApi.getInference = vi.fn(() => Promise.reject(new Error('initial read detail')))
    inferenceApi.refreshInference = vi.fn(() => Promise.reject(new Error('automatic refresh detail')))
    renderPanel(createApi(), 'gpu-reference', false, false, ACCOUNT_A, inferenceApi)

    expect(await screen.findByText('预测服务暂不可用')).toBeTruthy()
    inferenceApi.refreshInference = vi.fn(async (contractId) => inferenceView(contractId, 'recovered by refresh'))
    const readCount = vi.mocked(inferenceApi.getInference).mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: '重试预测' }))

    expect(await screen.findByText('recovered by refresh')).toBeTruthy()
    expect(inferenceApi.refreshInference).toHaveBeenCalledTimes(1)
    expect(inferenceApi.getInference).toHaveBeenCalledTimes(readCount)
  })

  it('keeps actual quote failures independent and does not POST until a realtime quote refresh succeeds', async () => {
    const api = createApi()
    api.getLatest = vi.fn(() => Promise.reject(new Error('quote unavailable')))
    const inferenceApi = createInferenceApi()
    renderPanel(api, 'gpu-reference', false, false, ACCOUNT_A, inferenceApi)

    expect(await screen.findByText('GPU 行情服务暂不可用')).toBeTruthy()
    expect(await screen.findByText(`prediction for ${CONTRACT_A}`)).toBeTruthy()
    expect(screen.queryByText('预测服务暂不可用')).toBeNull()
    expect(inferenceApi.refreshInference).not.toHaveBeenCalled()
  })

  it('fails inference closed when contract discovery fails or has no contract for the selected GPU model', async () => {
    const failedDirectory = createInferenceApi()
    failedDirectory.getContracts = vi.fn(() => Promise.reject(new Error('upstream URL and token must stay private')))
    const first = renderPanel(createApi(), 'gpu-reference', false, false, ACCOUNT_A, failedDirectory)

    expect(await screen.findByText('预测服务暂不可用')).toBeTruthy()
    expect(screen.getAllByText('$2.2500').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toContain('upstream URL and token must stay private')
    expect(failedDirectory.getInference).not.toHaveBeenCalled()
    expect(failedDirectory.refreshInference).not.toHaveBeenCalled()
    first.unmount()

    const noMatch = createInferenceApi()
    noMatch.getContracts = vi.fn(async () => realContracts.filter(({ gpuModel }) => gpuModel === 'A100'))
    renderPanel(createApi(), 'gpu-reference', false, false, ACCOUNT_A, noMatch)

    expect(await screen.findByText('当前 GPU 型号暂无可用预测合约')).toBeTruthy()
    expect(noMatch.getInference).not.toHaveBeenCalled()
    expect(noMatch.refreshInference).not.toHaveBeenCalled()
  })

  it('retries an initial contract-directory failure and recovers without touching realtime quotes', async () => {
    const inferenceApi = createInferenceApi()
    inferenceApi.getContracts = vi
      .fn<MarketInferenceApi['getContracts']>()
      .mockRejectedValueOnce(new Error('private directory failure'))
      .mockResolvedValueOnce(realContracts)
    renderPanel(createApi(), 'gpu-reference', false, false, ACCOUNT_A, inferenceApi)

    expect(await screen.findByText('预测服务暂不可用')).toBeTruthy()
    expect(screen.getAllByText('$2.2500').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '重试预测合约' }))

    expect(await screen.findByText(`prediction for ${CONTRACT_A}`)).toBeTruthy()
    expect(inferenceApi.getContracts).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).not.toContain('private directory failure')
  })

  it('cancels a pending directory owner when the GPU model changes and ignores the late old result', async () => {
    const snapshot: ComputeMarketPriceSnapshot = {
      ...baseSnapshot,
      trackedModels: ['H100', 'A100'],
      quotes: [...baseSnapshot.quotes, { ...baseSnapshot.quotes[0], gpuModel: 'A100', priceUsdPerGpuHour: 1.75 }],
    }
    const inferenceApi = createInferenceApi()
    const directoryResolvers: Array<(contracts: KaiMarketInferenceContract[]) => void> = []
    const directorySignals: AbortSignal[] = []
    inferenceApi.getContracts = vi.fn(
      (_identity, signal) =>
        new Promise<KaiMarketInferenceContract[]>((resolve) => {
          directoryResolvers.push(resolve)
          if (signal) directorySignals.push(signal)
        })
    )
    renderPanel(createApi({ snapshot }), 'gpu-reference', false, false, ACCOUNT_A, inferenceApi)

    await waitFor(() => expect(inferenceApi.getContracts).toHaveBeenCalledTimes(1))
    const gpuSelector = screen.getByRole('textbox', { name: 'GPU 型号' })
    fireEvent.click(gpuSelector)
    fireEvent.click(await screen.findByRole('option', { name: 'A100' }))

    await waitFor(() => expect(inferenceApi.getContracts).toHaveBeenCalledTimes(2))
    expect(directorySignals[0]?.aborted).toBe(true)
    directoryResolvers[1]?.(realContracts)
    await waitFor(() =>
      expect(inferenceApi.getInference).toHaveBeenCalledWith(
        'hk-a100-qwen-vllm-2026082517',
        ACCOUNT_A,
        expect.any(AbortSignal)
      )
    )
    directoryResolvers[0]?.(realContracts.filter(({ gpuModel }) => gpuModel === 'H100'))
    await Promise.resolve()
    expect((screen.getByRole('textbox', { name: '预测合约' }) as HTMLInputElement).value).toContain('qwen')
  })

  it('cancels a pending contract directory when leaving the realtime view or unmounting', async () => {
    const inferenceApi = createInferenceApi()
    const signals: AbortSignal[] = []
    inferenceApi.getContracts = vi.fn(
      (_identity, signal) =>
        new Promise<KaiMarketInferenceContract[]>(() => {
          if (signal) signals.push(signal)
        })
    )
    const first = renderPanel(createApi(), 'gpu-reference', false, false, ACCOUNT_A, inferenceApi)

    await waitFor(() => expect(inferenceApi.getContracts).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('tab', { name: 'KOD 卡时行情' }))
    await waitFor(() => expect(signals[0]?.aborted).toBe(true))
    first.unmount()

    const second = renderPanel(createApi(), 'gpu-reference', false, false, ACCOUNT_A, inferenceApi)
    await waitFor(() => expect(inferenceApi.getContracts).toHaveBeenCalledTimes(2))
    second.unmount()
    expect(signals[1]?.aborted).toBe(true)
  })

  it('cancels and ignores an old contract response after the user selects another real contract', async () => {
    const inferenceApi = createInferenceApi()
    let resolveOld: ((view: KaiMarketInferenceView) => void) | undefined
    let oldSignal: AbortSignal | undefined
    inferenceApi.getInference = vi.fn((contractId, _identity, signal) => {
      if (contractId === CONTRACT_A) {
        oldSignal = signal
        return new Promise<KaiMarketInferenceView>((resolve) => {
          resolveOld = resolve
        })
      }
      return Promise.resolve(inferenceView(contractId, 'new contract prediction'))
    })
    renderPanel(createApi(), 'gpu-reference', false, false, ACCOUNT_A, inferenceApi)

    const selector = (await screen.findByRole('textbox', { name: '预测合约' })) as HTMLInputElement
    await waitFor(() => expect(selector.value).toContain('deepseek-v3'))
    fireEvent.click(selector)
    fireEvent.click(await screen.findByRole('option', { name: /llama-3\.3-70b/ }))

    expect(await screen.findByText('new contract prediction')).toBeTruthy()
    expect(oldSignal?.aborted).toBe(true)
    resolveOld?.(inferenceView(CONTRACT_A, 'late old contract prediction'))
    await Promise.resolve()
    expect(screen.queryByText('late old contract prediction')).toBeNull()
  })

  it('cancels and ignores an old account refresh after wallet identity changes', async () => {
    const inferenceApi = createInferenceApi()
    let resolveOldRefresh: ((view: KaiMarketInferenceView) => void) | undefined
    let oldRefreshSignal: AbortSignal | undefined
    inferenceApi.getInference = vi.fn(async (contractId, identity) =>
      inferenceView(contractId, `prediction for ${identity}`)
    )
    inferenceApi.refreshInference = vi.fn((contractId, identity, signal) => {
      if (identity === ACCOUNT_A) {
        oldRefreshSignal = signal
        return new Promise<KaiMarketInferenceView>((resolve) => {
          resolveOldRefresh = resolve
        })
      }
      return Promise.resolve(inferenceView(contractId, `refreshed prediction for ${identity}`))
    })
    const { queryClient, rerenderPanel } = renderPanel(
      createApi(),
      'gpu-reference',
      false,
      false,
      ACCOUNT_A,
      inferenceApi
    )

    expect(await screen.findByText(`prediction for ${ACCOUNT_A}`)).toBeTruthy()
    await new Promise((resolve) => setTimeout(resolve, 2))
    await queryClient.refetchQueries({ queryKey: ['compute', 'market-intelligence', 'live', 'latest'], exact: true })
    await waitFor(() =>
      expect(inferenceApi.refreshInference).toHaveBeenCalledWith(CONTRACT_A, ACCOUNT_A, oldRefreshSignal)
    )
    rerenderPanel(ACCOUNT_B)

    expect(await screen.findByText(`prediction for ${ACCOUNT_B}`)).toBeTruthy()
    expect(oldRefreshSignal?.aborted).toBe(true)
    resolveOldRefresh?.(inferenceView(CONTRACT_A, 'late old account prediction'))
    await Promise.resolve()
    expect(screen.queryByText('late old account prediction')).toBeNull()

    await new Promise((resolve) => setTimeout(resolve, 2))
    await queryClient.refetchQueries({ queryKey: ['compute', 'market-intelligence', 'live', 'latest'], exact: true })
    expect(await screen.findByText(`refreshed prediction for ${ACCOUNT_B}`)).toBeTruthy()
  })

  it('does not load inference without a wallet identity or in simulation mode', async () => {
    const signedOutApi = createInferenceApi()
    renderPanel(createApi(), 'gpu-reference', false, false, null, signedOutApi)
    await screen.findAllByText('$2.2500')
    expect(signedOutApi.getContracts).not.toHaveBeenCalled()
    cleanup()

    const simulatedApi = createInferenceApi()
    renderPanel(createApi(), 'gpu-reference', false, true, ACCOUNT_A, simulatedApi)
    await screen.findByText(SIMULATED_MARKET_DISCLOSURE)
    expect(simulatedApi.getContracts).not.toHaveBeenCalled()
  })
})
