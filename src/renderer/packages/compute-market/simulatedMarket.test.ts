import { describe, expect, it, vi } from 'vitest'
import {
  createSimulatedMarketApi,
  DEFAULT_SIMULATED_MARKET_API_BASE,
  isSafeSimulatedMarketApiBase,
  SIMULATED_MARKET_DISCLOSURE,
  SIMULATED_MARKET_DISPLAY_UNIT,
  SIMULATED_MARKET_REMOTE_ERROR_CODES,
  SimulatedMarketRemoteError,
} from './simulatedMarket'

const NOW = Date.parse('2026-08-21T06:00:00.000Z')
const LOOPBACK_API_BASE = 'http://localhost:8088/api/v1'

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function remoteContract() {
  return {
    id: 'hk-h100-demo-vllm-2026082106',
    name: 'HK-H100-DEMO-VLLM-2026082106',
    model: 'demo-model',
    gpuType: 'H100',
    runtime: 'vllm',
    deliveryHour: '2026-08-21T06:00:00.000Z',
    status: 'trading',
  }
}

function remoteDashboard(lastPrice = 0.000025) {
  return {
    contract: remoteContract(),
    ticker: {
      contractId: remoteContract().id,
      lastPrice,
      change24h: 1.2,
      high24h: lastPrice * 1.02,
      low24h: lastPrice * 0.98,
      volume24h: 2_000_000,
      amount24h: 50,
      openInterest: 0,
      updatedAt: '2026-08-21T05:59:59.000Z',
    },
    klines: [
      { time: NOW - 60_000, open: 0.000024, close: 0.000024, low: 0.000023, high: 0.000025, volume: 1 },
      { time: NOW, open: lastPrice, close: lastPrice, low: lastPrice, high: lastPrice, volume: 1 },
    ],
    orderBook: { bids: [], asks: [], sequence: 1, updatedAt: '2026-08-21T05:59:59.000Z' },
    recentTrades: [
      {
        id: 'trade-1',
        time: '2026-08-21T05:59:58.000Z',
        price: lastPrice,
        quantity: 500_000,
        side: 'buy',
        amount: 12.5,
      },
    ],
    gainers: [],
    volumeRanks: [],
    usage: {},
    capacity: { total: 50_000_000, reserved: 30_000_000, used: 10_000_000, available: 20_000_000 },
    sla: {},
    incidents: [],
    snapshotAt: '2026-08-21T05:59:59.000Z',
  }
}

function remoteFetch(lastPrice = 0.000025) {
  return vi.fn((input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/contracts')) return Promise.resolve(jsonResponse([remoteContract()]))
    if (url.includes('/dashboard/')) return Promise.resolve(jsonResponse(remoteDashboard(lastPrice)))
    return Promise.resolve(new Response(null, { status: 404 }))
  })
}

describe('simulated market loopback boundary', () => {
  it.each([
    'http://localhost:8088/api/v1',
    'http://localhost:8088/api/v1/',
    'http://127.0.0.1:8088/api/v1',
    'http://[::1]:8088/api/v1',
  ])('allows the dedicated loopback feed: %s', (url) => {
    expect(isSafeSimulatedMarketApiBase(url)).toBe(true)
  })

  it.each([
    'https://localhost:8088/api/v1',
    'http://localhost:8000/api/v1',
    'http://localhost:8088/api/v2',
    'http://user:secret@localhost:8088/api/v1',
    'http://localhost.evil.example:8088/api/v1',
    'http://192.168.1.8:8088/api/v1',
    'http://localhost:8088/api/v1?redirect=https://evil.example',
    'http://localhost:8088/api/v1#evil',
    ' http://localhost:8088/api/v1',
  ])('rejects non-loopback or ambiguous feed configuration: %s', (url) => {
    expect(isSafeSimulatedMarketApiBase(url)).toBe(false)
  })

  it('allows only an exact explicitly trusted public HTTPS origin', () => {
    const options = { allowedOrigins: ['https://market.kod.example'] }

    expect(isSafeSimulatedMarketApiBase('https://market.kod.example/api/v1', options)).toBe(true)
    expect(isSafeSimulatedMarketApiBase('https://market.kod.example/api/v1/', options)).toBe(true)
    expect(isSafeSimulatedMarketApiBase('https://market.kod.example.evil.test/api/v1', options)).toBe(false)
    expect(isSafeSimulatedMarketApiBase('https://evil-market.kod.example/api/v1', options)).toBe(false)
    expect(isSafeSimulatedMarketApiBase('https://market.kod.example/api/v1?tenant=demo', options)).toBe(false)
    expect(isSafeSimulatedMarketApiBase('https://market.kod.example/api/v1#demo', options)).toBe(false)
    expect(isSafeSimulatedMarketApiBase('https://user:secret@market.kod.example/api/v1', options)).toBe(false)
    expect(isSafeSimulatedMarketApiBase('http://market.kod.example/api/v1', options)).toBe(false)
    expect(isSafeSimulatedMarketApiBase('https://market.kod.example/api/v1')).toBe(false)
  })

  it('does not turn malformed allowlist entries into host-wide permission', () => {
    expect(
      isSafeSimulatedMarketApiBase('https://market.kod.example/api/v1', {
        allowedOrigins: [
          'https://market.kod.example/other-path',
          'https://user:secret@market.kod.example',
          'http://market.kod.example',
        ],
      })
    ).toBe(false)
  })

  it('does not probe localhost when loopback access is disabled', async () => {
    const fetchFn = vi.fn()
    const api = createSimulatedMarketApi({
      apiBase: LOOPBACK_API_BASE,
      allowLoopback: false,
      remoteRequired: false,
      fetchFn: fetchFn as typeof fetch,
      now: () => NOW,
    })

    const snapshot = await api.getLatest()

    expect(fetchFn).not.toHaveBeenCalled()
    expect(snapshot.trackedModels).toContain('H100')
  })
})

describe('required shared remote feed', () => {
  it('uses the KOD HTTPS endpoint as the adapter default', async () => {
    const fetchFn = remoteFetch()
    const api = createSimulatedMarketApi({ fetchFn: fetchFn as typeof fetch, now: () => NOW })

    await api.getLatest()

    expect(DEFAULT_SIMULATED_MARKET_API_BASE).toBe('https://kod.kai.com/api/v1')
    expect(fetchFn.mock.calls.every(([input]) => String(input).startsWith('https://kod.kai.com/api/v1/'))).toBe(true)
  })

  it('reads from an exactly allowlisted public HTTPS origin without credentials', async () => {
    const fetchFn = remoteFetch()
    const api = createSimulatedMarketApi({
      apiBase: 'https://market.kod.example/api/v1',
      allowedOrigins: ['https://market.kod.example'],
      allowLoopback: false,
      remoteRequired: true,
      fetchFn: fetchFn as typeof fetch,
      now: () => NOW,
    })

    const snapshot = await api.getLatest()

    expect(snapshot.trackedModels).toEqual(['H100'])
    for (const [input, init] of fetchFn.mock.calls) {
      expect(String(input).startsWith('https://market.kod.example/api/v1/')).toBe(true)
      expect(init).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error' })
    }
  })

  it.each(['getLatest', 'getHistory', 'getCardStats'] as const)(
    'rejects invalid configuration through %s instead of generating local data',
    async (method) => {
      const fetchFn = vi.fn()
      const api = createSimulatedMarketApi({
        apiBase: 'https://market.kod.example.evil.test/api/v1',
        allowedOrigins: ['https://market.kod.example'],
        allowLoopback: false,
        remoteRequired: true,
        fetchFn: fetchFn as typeof fetch,
        now: () => NOW,
      })
      const operation =
        method === 'getHistory'
          ? api.getHistory('H100', '1h')
          : method === 'getLatest'
            ? api.getLatest()
            : api.getCardStats()

      await expect(operation).rejects.toEqual(
        expect.objectContaining({
          name: 'SimulatedMarketRemoteError',
          code: SIMULATED_MARKET_REMOTE_ERROR_CODES.invalidConfiguration,
          message: 'Simulated market remote configuration is invalid',
        })
      )
      expect(fetchFn).not.toHaveBeenCalled()
    }
  )

  it('returns a stable request error and never falls back when the shared service is unavailable', async () => {
    const api = createSimulatedMarketApi({
      apiBase: 'https://market.kod.example/api/v1',
      allowedOrigins: ['https://market.kod.example'],
      allowLoopback: false,
      remoteRequired: true,
      fetchFn: vi.fn(() => Promise.reject(new TypeError('private network details'))) as typeof fetch,
      now: () => NOW,
    })

    await expect(api.getLatest()).rejects.toEqual(
      expect.objectContaining({
        name: 'SimulatedMarketRemoteError',
        code: SIMULATED_MARKET_REMOTE_ERROR_CODES.requestFailed,
        message: 'Simulated market remote request failed',
      })
    )
  })

  it.each([{ contracts: [] }, { contracts: [{}] }])(
    'returns a stable empty-data error for an unusable contract list: $contracts',
    async ({ contracts }) => {
      const fetchFn = vi.fn((input: string | URL | Request) => {
        if (String(input).endsWith('/contracts')) return Promise.resolve(jsonResponse(contracts))
        return Promise.resolve(jsonResponse(remoteDashboard()))
      })
      const api = createSimulatedMarketApi({
        apiBase: 'https://market.kod.example/api/v1',
        allowedOrigins: ['https://market.kod.example'],
        allowLoopback: false,
        remoteRequired: true,
        fetchFn: fetchFn as typeof fetch,
        now: () => NOW,
      })

      await expect(api.getLatest()).rejects.toEqual(
        expect.objectContaining({
          name: 'SimulatedMarketRemoteError',
          code: SIMULATED_MARKET_REMOTE_ERROR_CODES.emptyData,
          message: 'Simulated market remote returned no usable data',
        })
      )
    }
  )

  it('returns a stable empty-data error when contracts exist but every dashboard is unusable', async () => {
    const fetchFn = vi.fn((input: string | URL | Request) =>
      Promise.resolve(jsonResponse(String(input).endsWith('/contracts') ? [remoteContract()] : {}))
    )
    const api = createSimulatedMarketApi({
      apiBase: 'https://market.kod.example/api/v1',
      allowedOrigins: ['https://market.kod.example'],
      allowLoopback: false,
      remoteRequired: true,
      fetchFn: fetchFn as typeof fetch,
      now: () => NOW,
    })

    await expect(api.getLatest()).rejects.toMatchObject({
      code: SIMULATED_MARKET_REMOTE_ERROR_CODES.emptyData,
      message: 'Simulated market remote returned no usable data',
    })
  })

  it('preserves deterministic fallback for an empty optional feed', async () => {
    const api = createSimulatedMarketApi({
      apiBase: 'https://market.kod.example/api/v1',
      allowedOrigins: ['https://market.kod.example'],
      allowLoopback: false,
      remoteRequired: false,
      fetchFn: vi.fn(() => Promise.resolve(jsonResponse([]))) as typeof fetch,
      now: () => NOW,
      seed: 42,
    })

    const snapshot = await api.getLatest()

    expect(snapshot.trackedModels).toContain('H100')
    expect(snapshot.quotes[0]?.sourceLabel).toBe('行情源 1')
  })

  it('rejects a missing remote history series instead of substituting locally generated points', async () => {
    const api = createSimulatedMarketApi({
      apiBase: 'https://market.kod.example/api/v1',
      allowedOrigins: ['https://market.kod.example'],
      allowLoopback: false,
      remoteRequired: true,
      fetchFn: remoteFetch() as typeof fetch,
      now: () => NOW,
    })

    await expect(api.getHistory('H200', '1h')).rejects.toMatchObject({
      code: SIMULATED_MARKET_REMOTE_ERROR_CODES.emptyData,
      message: 'Simulated market remote returned no usable data',
    })
  })

  it('keeps history fallback for an optional feed without the requested model', async () => {
    const api = createSimulatedMarketApi({
      apiBase: 'https://market.kod.example/api/v1',
      allowedOrigins: ['https://market.kod.example'],
      allowLoopback: false,
      remoteRequired: false,
      fetchFn: remoteFetch() as typeof fetch,
      now: () => NOW,
      seed: 42,
    })

    const history = await api.getHistory('H200', '1h')

    expect(history.gpuModel).toBe('H200')
    expect(history.points.length).toBeGreaterThan(0)
  })

  it('exposes the stable typed remote error contract', () => {
    const error = new SimulatedMarketRemoteError(SIMULATED_MARKET_REMOTE_ERROR_CODES.requestFailed)
    expect(error).toMatchObject({
      name: 'SimulatedMarketRemoteError',
      code: 'SIMULATED_MARKET_REQUEST_FAILED',
      message: 'Simulated market remote request failed',
    })
  })
})

describe('simulated market read-only adapter', () => {
  it('maps the running dashboard feed without any wallet, order, or credentialed request', async () => {
    const fetchFn = remoteFetch()
    const api = createSimulatedMarketApi({
      apiBase: LOOPBACK_API_BASE,
      allowLoopback: true,
      fetchFn: fetchFn as typeof fetch,
      now: () => NOW,
    })

    const snapshot = await api.getLatest()
    const history = await api.getHistory('H100', '1h')
    const cardStats = await api.getCardStats()

    expect(api.provenance).toBe('SIMULATED')
    expect(api.writesEnabled).toBe(false)
    expect(api.displayUnit).toBe(SIMULATED_MARKET_DISPLAY_UNIT)
    expect(api.displayUnit).toMatchObject({
      priceCurrency: 'CNY',
      priceUnit: 'MILLION_TOKENS',
      priceLabel: 'CNY / 百万 Token',
      tokenScale: 1_000_000,
      legacyPriceCarrier: 'priceCnyPerGpuHour',
    })
    expect(snapshot.trackedModels).toEqual(['H100'])
    expect(snapshot.quotes[0]).toMatchObject({
      sourceLabel: '合约 1 · demo-model/vllm',
      priceCnyPerGpuHour: 25,
      cardHoursPerGpuHour: 25,
      status: 'OK',
    })
    expect(snapshot.quotes.every(({ sourceLabel }) => !sourceLabel.includes('模拟'))).toBe(true)
    expect(history.points.map(({ priceCnyPerGpuHour }) => priceCnyPerGpuHour)).toEqual([24, 25])
    expect(cardStats).toMatchObject({ standardInventory: 50, specificInventory: 20, volume24h: 2 })
    expect(cardStats.recentTrades[0]).toMatchObject({
      assetType: 'SPECIFIC',
      quantity: 0.5,
      unitPrice: 25,
      totalPrice: 12.5,
      status: 'COMPLETED',
    })
    expect(cardStats.recentTrades[0]).not.toHaveProperty('buyerEmail')
    expect(cardStats.recentTrades[0]).not.toHaveProperty('sellerEmail')

    for (const [input, init] of fetchFn.mock.calls) {
      const url = String(input)
      expect(url.startsWith('http://localhost:8088/api/v1/')).toBe(true)
      expect(url).not.toMatch(/wallet|order|purchase|settle/i)
      expect(init).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error' })
    }
  })

  it('bounds a discontinuous remote tick before exposing it to the panel', async () => {
    let currentTime = NOW
    let lastPrice = 0.000025
    const fetchFn = vi.fn((input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/contracts')) return Promise.resolve(jsonResponse([remoteContract()]))
      return Promise.resolve(jsonResponse(remoteDashboard(lastPrice)))
    })
    const api = createSimulatedMarketApi({
      apiBase: LOOPBACK_API_BASE,
      allowLoopback: true,
      fetchFn: fetchFn as typeof fetch,
      now: () => currentTime,
    })

    const first = await api.getLatest()
    currentTime += 2_000
    lastPrice = 0.00005
    const second = await api.getLatest()
    const firstPrice = first.quotes[0].priceCnyPerGpuHour ?? 0
    const secondPrice = second.quotes[0].priceCnyPerGpuHour ?? 0

    expect(secondPrice).toBeGreaterThan(firstPrice)
    expect((secondPrice - firstPrice) / firstPrice).toBeLessThanOrEqual(0.008)
  })

  it('keeps displayed last, high, low, and change on the same normalized price series', async () => {
    const primaryContract = remoteContract()
    const secondaryContract = {
      ...remoteContract(),
      id: 'zz-h100-secondary-sglang-2026082106',
      model: 'secondary-model',
      runtime: 'sglang',
    }
    const primaryDashboard = {
      ...remoteDashboard(0.0000252),
      contract: primaryContract,
      klines: [
        { time: NOW - 60_000, open: 0.00002489, close: 0.00002489, low: 0.00002489, high: 0.00002489, volume: 1 },
        { time: NOW, open: 0.0000252, close: 0.0000252, low: 0.0000252, high: 0.0000252, volume: 1 },
      ],
    }
    const secondaryDashboard = {
      ...remoteDashboard(0.00002177),
      contract: secondaryContract,
      klines: [
        { time: NOW - 60_000, open: 0.0000215, close: 0.0000215, low: 0.0000215, high: 0.0000215, volume: 1 },
        { time: NOW, open: 0.00002177, close: 0.00002177, low: 0.00002177, high: 0.00002177, volume: 1 },
      ],
    }
    const fetchFn = vi.fn((input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/contracts')) return Promise.resolve(jsonResponse([primaryContract, secondaryContract]))
      return Promise.resolve(
        jsonResponse(url.includes(encodeURIComponent(secondaryContract.id)) ? secondaryDashboard : primaryDashboard)
      )
    })
    const api = createSimulatedMarketApi({
      apiBase: LOOPBACK_API_BASE,
      allowLoopback: true,
      fetchFn: fetchFn as typeof fetch,
      now: () => NOW,
    })

    const snapshot = await api.getLatest()
    const history = await api.getHistory('H100', '1h')
    const displayedLast = Math.min(
      ...snapshot.quotes.map((quote) => quote.priceCnyPerGpuHour ?? Number.POSITIVE_INFINITY)
    )
    const summarySource = snapshot.quotes[0].source
    const summaryPrices = history.points
      .filter((point) => point.source === summarySource)
      .map((point) => point.priceCnyPerGpuHour)
      .filter((price): price is number => typeof price === 'number' && Number.isFinite(price))
    const low = Math.min(...summaryPrices)
    const high = Math.max(...summaryPrices)
    const firstSummaryPrice = summaryPrices[0] ?? Number.NaN
    const changePercent = ((displayedLast - firstSummaryPrice) / firstSummaryPrice) * 100

    expect(snapshot.quotes).toHaveLength(2)
    expect(snapshot.quotes[0].priceCnyPerGpuHour).toBeLessThanOrEqual(snapshot.quotes[1].priceCnyPerGpuHour ?? 0)
    expect(displayedLast).toBeGreaterThanOrEqual(low)
    expect(displayedLast).toBeLessThanOrEqual(high)
    expect(Math.abs(changePercent)).toBeLessThan(5)

    for (const quote of snapshot.quotes) {
      const prices = history.points
        .filter((point) => point.source === quote.source)
        .map((point) => point.priceCnyPerGpuHour)
        .filter((price): price is number => typeof price === 'number' && Number.isFinite(price))
      const last = quote.priceCnyPerGpuHour ?? Number.NaN
      expect(last).toBeGreaterThanOrEqual(Math.min(...prices))
      expect(last).toBeLessThanOrEqual(Math.max(...prices))
    }
  })
})

describe('deterministic fallback', () => {
  it('is repeatable for the same seed and clock, positive, sorted, and smooth over five seconds', async () => {
    let currentTime = NOW
    const fetchFn = vi.fn(() => Promise.reject(new TypeError('loopback offline')))
    const api = createSimulatedMarketApi({
      apiBase: LOOPBACK_API_BASE,
      allowLoopback: true,
      remoteRequired: false,
      fetchFn: fetchFn as typeof fetch,
      now: () => currentTime,
      seed: 42,
    })

    const first = await api.getLatest()
    const repeated = await api.getLatest()
    expect(repeated).toEqual(first)
    expect(first.quotes.every(({ sourceLabel }) => !sourceLabel.includes('模拟'))).toBe(true)

    currentTime += 5_000
    const next = await api.getLatest()
    const firstPrice = first.quotes[0].priceCnyPerGpuHour ?? 0
    const nextPrice = next.quotes[0].priceCnyPerGpuHour ?? 0
    expect(firstPrice).toBeGreaterThan(0)
    expect(Math.abs(nextPrice - firstPrice) / firstPrice).toBeLessThan(0.01)

    const history = await api.getHistory('H100', '24h')
    expect(history.points.length).toBeGreaterThan(100)
    expect(
      history.points.every((point) => typeof point.priceUsdPerGpuHour === 'number' && point.priceUsdPerGpuHour > 0)
    ).toBe(true)
    expect(history.points.map(({ sampledAt }) => sampledAt).sort()).toEqual(
      history.points.map(({ sampledAt }) => sampledAt)
    )
    expect(await api.getCardStats()).toEqual(await api.getCardStats())
    expect(SIMULATED_MARKET_DISCLOSURE).toBe(
      '本页行情、盘口、成交及方向均由模拟行情服务生成，仅用于产品演示，不构成真实市场或交易依据。'
    )
  })
})
