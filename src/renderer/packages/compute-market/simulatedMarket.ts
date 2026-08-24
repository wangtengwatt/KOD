import type {
  CardHourMarketStats,
  CardHourTrade,
  ComputeMarketPriceHistory,
  ComputeMarketPricePoint,
  ComputeMarketPriceQuote,
  ComputeMarketPriceSnapshot,
} from '../computeCenter'

export const DEFAULT_SIMULATED_MARKET_API_BASE = 'https://kod.kai.com/api/v1'
export const DEFAULT_SIMULATED_MARKET_ALLOWED_ORIGINS = ['https://kod.kai.com'] as const
export const SIMULATED_MARKET_DISCLOSURE =
  '本页行情、盘口、成交及方向均由模拟行情服务生成，仅用于产品演示，不构成真实市场或交易依据。'

export const SIMULATED_MARKET_REMOTE_ERROR_CODES = {
  invalidConfiguration: 'SIMULATED_MARKET_INVALID_CONFIGURATION',
  requestFailed: 'SIMULATED_MARKET_REQUEST_FAILED',
  emptyData: 'SIMULATED_MARKET_EMPTY_DATA',
} as const

export type SimulatedMarketRemoteErrorCode =
  (typeof SIMULATED_MARKET_REMOTE_ERROR_CODES)[keyof typeof SIMULATED_MARKET_REMOTE_ERROR_CODES]

const REMOTE_ERROR_MESSAGES: Record<SimulatedMarketRemoteErrorCode, string> = {
  SIMULATED_MARKET_INVALID_CONFIGURATION: 'Simulated market remote configuration is invalid',
  SIMULATED_MARKET_REQUEST_FAILED: 'Simulated market remote request failed',
  SIMULATED_MARKET_EMPTY_DATA: 'Simulated market remote returned no usable data',
}

export class SimulatedMarketRemoteError extends Error {
  readonly code: SimulatedMarketRemoteErrorCode

  constructor(code: SimulatedMarketRemoteErrorCode) {
    super(REMOTE_ERROR_MESSAGES[code])
    this.name = 'SimulatedMarketRemoteError'
    this.code = code
  }
}

/**
 * The current panel contract predates the compute-futures demo and names its
 * carrier fields `*PerGpuHour`. In this adapter those fields always carry a
 * price per one million tokens; consumers must render the metadata below
 * instead of the legacy GPU-hour label.
 */
export const SIMULATED_MARKET_DISPLAY_UNIT = {
  priceCurrency: 'CNY',
  priceUnit: 'MILLION_TOKENS',
  priceLabel: 'CNY / 百万 Token',
  quantityUnit: 'MILLION_TOKENS',
  quantityLabel: '百万 Token',
  tokenScale: 1_000_000,
  legacyPriceCarrier: 'priceCnyPerGpuHour',
  legacyQuantityCarrier: 'card-hour quantity fields',
} as const

const USD_CNY_RATE = 7.2
const CARD_HOUR_CNY_RATE = 1
const TOKENS_PER_DISPLAY_UNIT = SIMULATED_MARKET_DISPLAY_UNIT.tokenScale
const REMOTE_CACHE_MS = 1_000
const MAX_CONTRACTS = 8
const MAX_REMOTE_POINTS = 1_200
const MAX_REMOTE_TRADES = 40

const FALLBACK_MODELS = [
  { model: 'H100', cnyBase: 25.8 },
  { model: 'H200', cnyBase: 33.6 },
  { model: 'A100', cnyBase: 13.4 },
  { model: 'RTX 4090', cnyBase: 6.8 },
] as const

type MarketRange = ComputeMarketPriceHistory['range']
type SimulatedSource = ComputeMarketPriceQuote['source']

interface RemoteContract {
  id: string
  model: string
  gpuType: string
  runtime: string
  deliveryHour: string
}

interface RemoteKline {
  time: number
  close: number
}

interface RemoteTrade {
  id: string
  time: string
  price: number
  quantity: number
}

interface RemoteDashboard {
  contract: RemoteContract
  ticker: {
    lastPrice: number
    volume24h: number
    updatedAt: string
  }
  klines: RemoteKline[]
  recentTrades: RemoteTrade[]
  capacity: {
    total: number
    available: number
  }
  snapshotAt: string
}

export interface SimulatedMarketApi {
  readonly provenance: 'SIMULATED'
  readonly writesEnabled: false
  readonly displayUnit: typeof SIMULATED_MARKET_DISPLAY_UNIT
  getLatest: () => Promise<ComputeMarketPriceSnapshot>
  getHistory: (model: string, range: MarketRange) => Promise<ComputeMarketPriceHistory>
  getCardStats: () => Promise<CardHourMarketStats>
}

export interface SimulatedMarketOptions {
  apiBase?: string
  /** Exact HTTPS origins that may host the shared demo feed. */
  allowedOrigins?: readonly string[]
  allowLoopback?: boolean
  /** Never substitute per-device fallback data when the shared feed is required. */
  remoteRequired?: boolean
  fetchFn?: typeof globalThis.fetch
  now?: () => number
  requestTimeoutMs?: number
  seed?: number
}

interface RemoteCache {
  loadedAt: number
  dashboards: RemoteDashboard[]
}

export function isSafeSimulatedMarketApiBase(
  value: string,
  options: Pick<SimulatedMarketOptions, 'allowedOrigins' | 'allowLoopback'> = {}
) {
  if (!value || value !== value.trim()) return false
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLocaleLowerCase('en-US')
    const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
    const hasSafeShape =
      !url.username && !url.password && !url.search && !url.hash && normalizePath(url.pathname) === '/api/v1'
    if (!hasSafeShape) return false
    if (loopback) {
      return (options.allowLoopback ?? true) && url.protocol === 'http:' && url.port === '8088'
    }
    if (url.protocol !== 'https:') return false
    const allowedOrigins = new Set(
      (options.allowedOrigins ?? [])
        .map(normalizeAllowedHttpsOrigin)
        .filter((origin): origin is string => origin !== null)
    )
    return allowedOrigins.has(url.origin)
  } catch {
    return false
  }
}

export function createSimulatedMarketApi(options: SimulatedMarketOptions = {}): SimulatedMarketApi {
  const now = options.now ?? Date.now
  const fetchFn = options.fetchFn ?? globalThis.fetch
  const seed = Number.isFinite(options.seed) ? (options.seed as number) : 20_260_821
  const requestTimeoutMs = clamp(options.requestTimeoutMs ?? 1_500, 100, 10_000)
  const configuredBase = options.apiBase ?? DEFAULT_SIMULATED_MARKET_API_BASE
  const allowLoopback = options.allowLoopback ?? isLocalDemoRuntime()
  const remoteRequired = options.remoteRequired ?? true
  const apiBase = isSafeSimulatedMarketApiBase(configuredBase, {
    allowLoopback,
    allowedOrigins: options.allowedOrigins ?? DEFAULT_SIMULATED_MARKET_ALLOWED_ORIGINS,
  })
    ? configuredBase.replace(/\/$/, '')
    : null
  const smoothedPrices = new Map<string, { input: number; result: number }>()
  let remoteCache: RemoteCache | undefined
  let pendingRemote: Promise<RemoteDashboard[] | null> | undefined

  function loadRemoteDashboards() {
    if (!apiBase) {
      if (remoteRequired) throw new SimulatedMarketRemoteError(SIMULATED_MARKET_REMOTE_ERROR_CODES.invalidConfiguration)
      return null
    }
    if (typeof fetchFn !== 'function') {
      if (remoteRequired) throw new SimulatedMarketRemoteError(SIMULATED_MARKET_REMOTE_ERROR_CODES.requestFailed)
      return null
    }
    const currentTime = now()
    if (remoteCache && currentTime - remoteCache.loadedAt <= REMOTE_CACHE_MS) return remoteCache.dashboards
    if (pendingRemote) return pendingRemote

    pendingRemote = fetchRemoteDashboards(apiBase, fetchFn, requestTimeoutMs)
      .then((dashboards) => {
        if (dashboards?.length) remoteCache = { loadedAt: currentTime, dashboards }
        return dashboards
      })
      .catch((error: unknown) => {
        if (remoteRequired) throw normalizeRemoteError(error)
        return null
      })
      .finally(() => {
        pendingRemote = undefined
      })
    return pendingRemote
  }

  function smoothRemotePrice(key: string, next: number) {
    const previous = smoothedPrices.get(key)
    if (previous?.input === next) return previous.result
    if (previous === undefined || !Number.isFinite(previous.result)) {
      smoothedPrices.set(key, { input: next, result: next })
      return next
    }
    const maximumStep = Math.max(previous.result * 0.008, 0.01)
    const bounded = clamp(next, previous.result - maximumStep, previous.result + maximumStep)
    const smoothed = previous.result * 0.72 + bounded * 0.28
    smoothedPrices.set(key, { input: next, result: smoothed })
    return smoothed
  }

  return {
    provenance: 'SIMULATED',
    writesEnabled: false,
    displayUnit: SIMULATED_MARKET_DISPLAY_UNIT,
    async getLatest() {
      const generatedAt = new Date(now()).toISOString()
      const dashboards = await loadRemoteDashboards()
      return dashboards?.length
        ? latestFromRemote(dashboards, generatedAt, smoothRemotePrice)
        : latestFromFallback(generatedAt, seed)
    },
    async getHistory(model, range) {
      const currentTime = now()
      const dashboards = await loadRemoteDashboards()
      const remoteHistory = dashboards?.length
        ? historyFromRemote(dashboards, model, range, currentTime, smoothRemotePrice)
        : null
      if (remoteHistory?.points.length) return remoteHistory
      if (remoteRequired) throw new SimulatedMarketRemoteError(SIMULATED_MARKET_REMOTE_ERROR_CODES.emptyData)
      return historyFromFallback(model, range, currentTime, seed)
    },
    async getCardStats() {
      const currentTime = now()
      const dashboards = await loadRemoteDashboards()
      return dashboards?.length ? cardStatsFromRemote(dashboards) : cardStatsFromFallback(currentTime, seed)
    },
  }
}

async function fetchRemoteDashboards(
  apiBase: string,
  fetchFn: typeof globalThis.fetch,
  requestTimeoutMs: number
): Promise<RemoteDashboard[]> {
  let contractsValue: unknown
  try {
    contractsValue = await getJson(`${apiBase}/contracts`, fetchFn, requestTimeoutMs)
  } catch {
    throw new SimulatedMarketRemoteError(SIMULATED_MARKET_REMOTE_ERROR_CODES.requestFailed)
  }
  const contracts = parseContracts(contractsValue)
  if (contracts.length === 0) throw new SimulatedMarketRemoteError(SIMULATED_MARKET_REMOTE_ERROR_CODES.emptyData)

  const results = await Promise.allSettled(
    contracts.slice(0, MAX_CONTRACTS).map(async (contract) => {
      const value = await getJson(`${apiBase}/dashboard/${encodeURIComponent(contract.id)}`, fetchFn, requestTimeoutMs)
      return parseDashboard(value)
    })
  )
  const dashboards = results
    .filter((result): result is PromiseFulfilledResult<RemoteDashboard | null> => result.status === 'fulfilled')
    .map(({ value }) => value)
    .filter((value): value is RemoteDashboard => value !== null)
    .sort((left, right) => left.contract.id.localeCompare(right.contract.id))
  if (dashboards.length) return dashboards
  if (results.some((result) => result.status === 'rejected')) {
    throw new SimulatedMarketRemoteError(SIMULATED_MARKET_REMOTE_ERROR_CODES.requestFailed)
  }
  throw new SimulatedMarketRemoteError(SIMULATED_MARKET_REMOTE_ERROR_CODES.emptyData)
}

async function getJson(url: string, fetchFn: typeof globalThis.fetch, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchFn(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Simulated market feed returned HTTP ${response.status}`)
    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

function latestFromRemote(
  dashboards: RemoteDashboard[],
  generatedAt: string,
  smoothPrice: (key: string, next: number) => number
): ComputeMarketPriceSnapshot {
  const byModel = groupDashboardsByModel(dashboards)
  const quotes = [...byModel.entries()].flatMap(([gpuModel, modelDashboards]) =>
    remoteQuotesForModel(gpuModel, modelDashboards, generatedAt, smoothPrice)
  )

  return {
    trackedModels: [...byModel.keys()],
    quotes,
    usdCnyRate: USD_CNY_RATE,
    cardHourCnyRate: CARD_HOUR_CNY_RATE,
    refreshIntervalSeconds: 5,
    historySampleSeconds: 60,
    historyRetentionDays: 7,
    generatedAt,
  }
}

function remoteQuotesForModel(
  gpuModel: string,
  modelDashboards: RemoteDashboard[],
  generatedAt: string,
  smoothPrice: (key: string, next: number) => number
) {
  const selected = modelDashboards.slice(0, 2)
  const reference = selected[0]
  if (!reference) return []
  const referencePrice = reference.ticker.lastPrice * TOKENS_PER_DISPLAY_UNIT
  const benchmark = smoothPrice(`benchmark:${gpuModel}:${reference.contract.id}`, referencePrice)

  return selected.map((dashboard, index) => {
    const source = sourceAt(index)
    const candidatePrice = dashboard.ticker.lastPrice * TOKENS_PER_DISPLAY_UNIT
    const relativeDifference = Math.abs(candidatePrice / referencePrice - 1)
    // Source 0 is the normalized benchmark used by the panel's high/low
    // summary. Additional contracts retain a small positive comparison spread
    // so the displayed minimum can never come from a different history series.
    const comparisonSpread = index === 0 ? 0 : clamp(relativeDifference, 0.0015, 0.006)
    const cnyPrice = benchmark * (1 + comparisonSpread)
    const sampledAt = validTimestamp(dashboard.ticker.updatedAt) ?? validTimestamp(dashboard.snapshotAt) ?? generatedAt
    return createQuote({
      source,
      gpuModel,
      sourceLabel: `合约 ${index + 1} · ${dashboard.contract.model}/${dashboard.contract.runtime}`,
      cnyPrice,
      sampledAt,
      sampleSize: dashboard.recentTrades.length,
      stale: Date.parse(generatedAt) - Date.parse(sampledAt) > 60_000,
    })
  })
}

function latestFromFallback(generatedAt: string, seed: number): ComputeMarketPriceSnapshot {
  const timestamp = Date.parse(generatedAt)
  return {
    trackedModels: FALLBACK_MODELS.map(({ model }) => model),
    quotes: FALLBACK_MODELS.flatMap(({ model, cnyBase }) =>
      ([0, 1] as const).map((sourceIndex) =>
        createQuote({
          source: sourceAt(sourceIndex),
          gpuModel: model,
          sourceLabel: `行情源 ${sourceIndex + 1}`,
          cnyPrice: fallbackCnyPrice(model, cnyBase, sourceIndex, timestamp, seed),
          sampledAt: generatedAt,
          sampleSize: 12 + (stableHash(`${model}:${sourceIndex}:${seed}`) % 24),
          stale: false,
        })
      )
    ),
    usdCnyRate: USD_CNY_RATE,
    cardHourCnyRate: CARD_HOUR_CNY_RATE,
    refreshIntervalSeconds: 5,
    historySampleSeconds: 60,
    historyRetentionDays: 7,
    generatedAt,
  }
}

function createQuote({
  source,
  gpuModel,
  sourceLabel,
  cnyPrice,
  sampledAt,
  sampleSize,
  stale,
}: {
  source: SimulatedSource
  gpuModel: string
  sourceLabel: string
  cnyPrice: number
  sampledAt: string
  sampleSize: number
  stale: boolean
}): ComputeMarketPriceQuote {
  return {
    source,
    sourceLabel,
    gpuModel,
    sourceUrl: 'https://kod.kai.com/',
    status: stale ? 'STALE' : 'OK',
    quoteType: source === 'VAST_AI' ? 'MEDIAN_AVAILABLE' : 'OFFICIAL_LIST',
    priceUsdPerGpuHour: cnyPrice / USD_CNY_RATE,
    priceCnyPerGpuHour: cnyPrice,
    cardHoursPerGpuHour: cnyPrice / CARD_HOUR_CNY_RATE,
    sampleSize: Math.max(0, sampleSize),
    sampledAt,
    lastAttemptAt: sampledAt,
    lastSuccessAt: sampledAt,
  }
}

function historyFromRemote(
  dashboards: RemoteDashboard[],
  gpuModel: string,
  range: MarketRange,
  now: number,
  smoothPrice: (key: string, next: number) => number
): ComputeMarketPriceHistory | null {
  const matching = dashboards.filter(
    (dashboard) => normalizedModel(dashboard.contract.gpuType) === normalizedModel(gpuModel)
  )
  const cutoff = now - rangeDurationMs(range)
  const selected = matching.slice(0, 2)
  const quotes = remoteQuotesForModel(gpuModel, selected, new Date(now).toISOString(), smoothPrice)
  const points = selected.flatMap((dashboard, index) => {
    const source = sourceAt(index)
    const quote = quotes[index]
    const displayedPrice = quote?.priceCnyPerGpuHour
    const rawCurrentPrice = dashboard.ticker.lastPrice * TOKENS_PER_DISPLAY_UNIT
    const rebaseFactor = displayedPrice && rawCurrentPrice > 0 ? displayedPrice / rawCurrentPrice : 1
    const observedAt = quote?.sampledAt ? Date.parse(quote.sampledAt) : Number.NaN
    const upperBound = Number.isFinite(observedAt) ? Math.min(now + 60_000, observedAt) : now + 60_000
    const series = dashboard.klines
      .filter((point) => point.time >= cutoff && point.time <= upperBound)
      .slice(-MAX_REMOTE_POINTS)
      .map((point) =>
        createPoint(source, gpuModel, point.close * TOKENS_PER_DISPLAY_UNIT * rebaseFactor, point.time, 1)
      )
    if (displayedPrice && Number.isFinite(observedAt) && observedAt >= cutoff && observedAt <= now + 60_000) {
      const latestPoint = createPoint(source, gpuModel, displayedPrice, observedAt, quote.sampleSize ?? 0)
      const byTimestamp = new Map(series.map((point) => [point.sampledAt, point]))
      byTimestamp.set(latestPoint.sampledAt, latestPoint)
      return [...byTimestamp.values()]
    }
    return series
  })
  points.sort((left, right) => Date.parse(left.sampledAt) - Date.parse(right.sampledAt))
  return points.length
    ? { gpuModel, range, points, usdCnyRate: USD_CNY_RATE, cardHourCnyRate: CARD_HOUR_CNY_RATE }
    : null
}

function historyFromFallback(
  requestedModel: string,
  range: MarketRange,
  now: number,
  seed: number
): ComputeMarketPriceHistory {
  const selected = FALLBACK_MODELS.find(({ model }) => normalizedModel(model) === normalizedModel(requestedModel))
  const model = selected?.model ?? (requestedModel.trim() || 'H100')
  const cnyBase = selected?.cnyBase ?? 25.8
  const duration = rangeDurationMs(range)
  const minute = 60_000
  const step = Math.max(minute, Math.ceil(duration / (360 * minute)) * minute)
  const end = Math.floor(now / minute) * minute
  const start = end - duration
  const points: ComputeMarketPricePoint[] = []
  for (let timestamp = start; timestamp <= end; timestamp += step) {
    for (const sourceIndex of [0, 1] as const) {
      points.push(
        createPoint(
          sourceAt(sourceIndex),
          model,
          fallbackCnyPrice(model, cnyBase, sourceIndex, timestamp, seed),
          timestamp,
          12 + (stableHash(`${model}:${sourceIndex}:${seed}`) % 24)
        )
      )
    }
  }
  return { gpuModel: model, range, points, usdCnyRate: USD_CNY_RATE, cardHourCnyRate: CARD_HOUR_CNY_RATE }
}

function createPoint(
  source: SimulatedSource,
  gpuModel: string,
  cnyPrice: number,
  timestamp: number,
  sampleSize: number
): ComputeMarketPricePoint {
  return {
    source,
    gpuModel,
    quoteType: source === 'VAST_AI' ? 'MEDIAN_AVAILABLE' : 'OFFICIAL_LIST',
    priceUsdPerGpuHour: cnyPrice / USD_CNY_RATE,
    priceCnyPerGpuHour: cnyPrice,
    cardHoursPerGpuHour: cnyPrice / CARD_HOUR_CNY_RATE,
    sampleSize,
    sampledAt: new Date(timestamp).toISOString(),
  }
}

function cardStatsFromRemote(dashboards: RemoteDashboard[]): CardHourMarketStats {
  const standardInventory = dashboards.reduce((total, dashboard) => total + dashboard.capacity.total, 0) / 1_000_000
  const specificInventory = dashboards.reduce((total, dashboard) => total + dashboard.capacity.available, 0) / 1_000_000
  const volume24h = dashboards.reduce((total, dashboard) => total + dashboard.ticker.volume24h, 0) / 1_000_000
  const seen = new Set<string>()
  const recentTrades = dashboards
    .flatMap((dashboard) =>
      dashboard.recentTrades.map((trade) => remoteCardHourTrade(trade, dashboard.contract.gpuType))
    )
    .filter((trade) => {
      if (seen.has(trade.tradeNo)) return false
      seen.add(trade.tradeNo)
      return true
    })
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt))
    .slice(0, MAX_REMOTE_TRADES)
  return { standardInventory, specificInventory, volume24h, recentTrades }
}

function remoteCardHourTrade(trade: RemoteTrade, gpuModel: string): CardHourTrade {
  const quantity = trade.quantity / TOKENS_PER_DISPLAY_UNIT
  const unitPrice = trade.price * TOKENS_PER_DISPLAY_UNIT
  return {
    id: stableHash(trade.id),
    tradeNo: `SIM-${trade.id}`,
    marketType: 'IDLE_TRANSFER',
    assetType: 'SPECIFIC',
    gpuModel,
    quantity,
    unitPrice,
    priceCurrency: 'CNY',
    totalPrice: quantity * unitPrice,
    buyerFee: 0,
    sellerFee: 0,
    status: 'COMPLETED',
    completedAt: trade.time,
  }
}

function cardStatsFromFallback(now: number, seed: number): CardHourMarketStats {
  const hourWave = Math.sin(now / (45 * 60_000) + seed * 0.001)
  const standardInventory = round(168 + hourWave * 18, 3)
  const specificInventory = round(54 + Math.cos(now / (35 * 60_000) + seed * 0.002) * 9, 3)
  const recentTrades = Array.from({ length: 12 }, (_, index) => {
    const completedAt = now - index * 7 * 60_000
    const gpu = FALLBACK_MODELS[index % FALLBACK_MODELS.length]
    const quantity = round(0.5 + ((stableHash(`${seed}:${index}`) % 45) + 1) / 10, 3)
    const unitPrice = round(
      fallbackCnyPrice(gpu.model, gpu.cnyBase, index % 2, completedAt, seed) / Math.max(gpu.cnyBase, 1),
      4
    )
    return {
      id: stableHash(`fallback:${seed}:${index}`),
      tradeNo: `SIM-FALLBACK-${index + 1}`,
      marketType: 'IDLE_TRANSFER' as const,
      assetType: 'SPECIFIC' as const,
      gpuModel: gpu.model,
      quantity,
      unitPrice,
      priceCurrency: 'CNY' as const,
      totalPrice: round(quantity * unitPrice, 4),
      buyerFee: 0,
      sellerFee: 0,
      status: 'COMPLETED',
      completedAt: new Date(completedAt).toISOString(),
    }
  })
  const volume24h = round(recentTrades.reduce((total, trade) => total + trade.quantity, 0) * 8.4, 3)
  return { standardInventory, specificInventory, volume24h, recentTrades }
}

function parseContracts(value: unknown): RemoteContract[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!isRecord(item)) return null
      const id = nonEmptyString(item.id)
      const model = nonEmptyString(item.model)
      const gpuType = nonEmptyString(item.gpuType)
      const runtime = nonEmptyString(item.runtime)
      const deliveryHour = validTimestamp(item.deliveryHour)
      return id && model && gpuType && runtime && deliveryHour ? { id, model, gpuType, runtime, deliveryHour } : null
    })
    .filter((item): item is RemoteContract => item !== null)
    .sort((left, right) => left.id.localeCompare(right.id))
}

function parseDashboard(value: unknown): RemoteDashboard | null {
  if (!isRecord(value) || !isRecord(value.contract) || !isRecord(value.ticker) || !isRecord(value.capacity)) return null
  const contract = parseContracts([value.contract])[0]
  const lastPrice = positiveNumber(value.ticker.lastPrice)
  const volume24h = nonNegativeNumber(value.ticker.volume24h)
  const updatedAt = validTimestamp(value.ticker.updatedAt)
  const total = nonNegativeNumber(value.capacity.total)
  const available = nonNegativeNumber(value.capacity.available)
  const snapshotAt = validTimestamp(value.snapshotAt)
  if (
    !contract ||
    lastPrice === null ||
    volume24h === null ||
    !updatedAt ||
    total === null ||
    available === null ||
    !snapshotAt
  )
    return null

  const klines = (Array.isArray(value.klines) ? value.klines : [])
    .map(parseKline)
    .filter((item): item is RemoteKline => item !== null)
    .sort((left, right) => left.time - right.time)
    .slice(-MAX_REMOTE_POINTS)
  const recentTrades = (Array.isArray(value.recentTrades) ? value.recentTrades : [])
    .map(parseRemoteTrade)
    .filter((item): item is RemoteTrade => item !== null)
    .slice(0, MAX_REMOTE_TRADES)
  return {
    contract,
    ticker: { lastPrice, volume24h, updatedAt },
    klines,
    recentTrades,
    capacity: { total, available },
    snapshotAt,
  }
}

function parseKline(value: unknown): RemoteKline | null {
  if (!isRecord(value)) return null
  const time = positiveNumber(value.time)
  const close = positiveNumber(value.close)
  return time === null || close === null ? null : { time, close }
}

function parseRemoteTrade(value: unknown): RemoteTrade | null {
  if (!isRecord(value)) return null
  const id = nonEmptyString(value.id)
  const time = validTimestamp(value.time)
  const price = nonNegativeNumber(value.price)
  const quantity = positiveNumber(value.quantity)
  return id && time && price !== null && quantity !== null ? { id, time, price, quantity } : null
}

function groupDashboardsByModel(dashboards: RemoteDashboard[]) {
  const groups = new Map<string, RemoteDashboard[]>()
  for (const dashboard of dashboards) {
    const model = dashboard.contract.gpuType.trim()
    const current = groups.get(model) ?? []
    current.push(dashboard)
    groups.set(model, current)
  }
  return groups
}

function fallbackCnyPrice(model: string, base: number, sourceIndex: number, timestamp: number, seed: number) {
  const phase = (stableHash(`${model}:${seed}`) % 10_000) / 10_000
  const longWave = Math.sin(timestamp / (3.5 * 60 * 60_000) + phase * Math.PI * 2) * 0.035
  const mediumWave = Math.sin(timestamp / (28 * 60_000) + phase * 11) * 0.012
  const shortWave = Math.cos(timestamp / (7 * 60_000) + phase * 17) * 0.004
  const sourceSpread = sourceIndex === 0 ? -0.008 : 0.008
  return base * (1 + longWave + mediumWave + shortWave + sourceSpread)
}

function sourceAt(index: number): SimulatedSource {
  return index % 2 === 0 ? 'VAST_AI' : 'AKAMAI'
}

function rangeDurationMs(range: MarketRange) {
  switch (range) {
    case '1h':
      return 60 * 60_000
    case '6h':
      return 6 * 60 * 60_000
    case '7d':
      return 7 * 24 * 60 * 60_000
    default:
      return 24 * 60 * 60_000
  }
}

function isLocalDemoRuntime() {
  if (typeof window === 'undefined') return false
  if (window.location.protocol === 'file:') return true
  const hostname = window.location.hostname.toLocaleLowerCase('en-US')
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

function normalizePath(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/'
}

function normalizeAllowedHttpsOrigin(value: string) {
  if (!value || value !== value.trim()) return null
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      normalizePath(url.pathname) !== '/'
    )
      return null
    return url.origin
  } catch {
    return null
  }
}

function normalizeRemoteError(error: unknown) {
  return error instanceof SimulatedMarketRemoteError
    ? error
    : new SimulatedMarketRemoteError(SIMULATED_MARKET_REMOTE_ERROR_CODES.requestFailed)
}

function normalizedModel(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

function validTimestamp(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) return null
  return new Date(value).toISOString()
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 160) : null
}

function positiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function nonNegativeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stableHash(value: string) {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function round(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
