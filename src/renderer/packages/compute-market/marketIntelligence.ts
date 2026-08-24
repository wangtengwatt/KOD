import type {
  CardHourMarketStats,
  CardHourTrade,
  ComputeMarketPriceHistory,
  ComputeMarketPricePoint,
  ComputeMarketPriceQuote,
  ComputeMarketPriceSnapshot,
} from '../computeCenter'

export const LIVE_REFRESH_MS = 5_000
export const HISTORY_REFRESH_MS = 60_000

const FRESH_FOR_MS = LIVE_REFRESH_MS * 2
const BLOCKED_AFTER_MS = HISTORY_REFRESH_MS
const FUTURE_TOLERANCE_MS = LIVE_REFRESH_MS

export type MarketCategory = 'GPU_REFERENCE' | 'CARD_HOUR' | 'MODEL_API'
export type MarketFreshness = 'FRESH' | 'STALE' | 'BLOCKED' | 'UNKNOWN'
export type MarketPriceUnit = 'GPU_HOUR' | 'CARD_HOUR' | 'MILLION_INPUT_TOKENS' | 'MILLION_OUTPUT_TOKENS'
export type MarketCurrency = 'USD' | 'CNY' | 'CARD_HOUR'
export type MarketDataProvenance = 'REAL' | 'SIMULATED' | 'UNKNOWN'

export interface MarketFreshnessInput {
  sampledAt?: string | null
  generatedAt?: string | null
  now?: string | number | Date
  freshForMs?: number
  blockedAfterMs?: number
  futureToleranceMs?: number
}

export interface MarketInstrumentIdentity {
  instrumentId: string
  category: MarketCategory
  familyId: string
  priceCurrency: MarketCurrency
  priceUnit: MarketPriceUnit
  provider?: string | null
  gpuModel?: string | null
  region?: string | null
  runtime?: string | null
  deliveryAt?: string | null
}

export interface MarketDeliveryNode extends MarketInstrumentIdentity {
  isReal: boolean
  deliveryAt: string
}

export interface MarketTradeEvidence {
  provenance: MarketDataProvenance
  count: number
}

export interface MarketOrderBookEvidence {
  provenance: MarketDataProvenance
  bidLevels: number
  askLevels: number
  sequenced: boolean
}

export interface MarketCapabilityEvidence {
  trades?: MarketTradeEvidence | null
  orderBook?: MarketOrderBookEvidence | null
  comparisonCandidates?: readonly MarketInstrumentIdentity[]
  deliveryNodes?: readonly MarketDeliveryNode[]
  standardizedContracts?: boolean
  matchingEngine?: MarketDataProvenance
  positions?: MarketDataProvenance
  riskControls?: MarketDataProvenance
  settlement?: MarketDataProvenance
}

export type MarketCapabilityRequirement =
  | 'REAL_TRADES'
  | 'TWO_SIDED_REAL_ORDER_BOOK'
  | 'SEQUENCED_ORDER_BOOK'
  | 'TWO_COMPARABLE_INSTRUMENTS'
  | 'TWO_REAL_SAME_FAMILY_DELIVERIES'
  | 'STANDARDIZED_CONTRACTS'
  | 'REAL_MATCHING_ENGINE'
  | 'REAL_POSITIONS'
  | 'REAL_RISK_CONTROLS'
  | 'REAL_SETTLEMENT'

export interface MarketCapabilityDecision {
  enabled: boolean
  missing: MarketCapabilityRequirement[]
}

export interface MarketCapabilityGate {
  p2: {
    recentTrades: MarketCapabilityDecision
    orderBook: MarketCapabilityDecision
    comparison: MarketCapabilityDecision
    termStructure: MarketCapabilityDecision
  }
  p3: {
    futuresTerminology: MarketCapabilityDecision
    openInterest: MarketCapabilityDecision
    trading: MarketCapabilityDecision
  }
}

export interface CardHourTradeAggregate {
  assetType: PublicCardHourTrade['assetType']
  gpuModel?: string
  priceCurrency: PublicCardHourTrade['priceCurrency']
  tradeCount: number
  quantity: number
  notional: number
  volumeWeightedAveragePrice: number
}

export interface CompletedCardHourTradeSummary {
  completedTrades: PublicCardHourTrade[]
  tradeCount: number
  latestTrade?: PublicCardHourTrade
  aggregates: CardHourTradeAggregate[]
}

export type PublicCardHourTrade = Pick<
  CardHourTrade,
  'id' | 'assetType' | 'gpuModel' | 'quantity' | 'unitPrice' | 'priceCurrency' | 'totalPrice' | 'status' | 'completedAt'
>

export interface PublicCardHourMarketStats extends Omit<CardHourMarketStats, 'recentTrades'> {
  recentTrades: PublicCardHourTrade[]
}

function parseTimestamp(value: string | number | Date | null | undefined) {
  if (value instanceof Date) {
    const parsed = value.getTime()
    return Number.isFinite(parsed) ? parsed : null
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveNumber(value: number | null | undefined): value is number {
  return isFiniteNumber(value) && value > 0
}

function isNonNegativeNumber(value: number | null | undefined): value is number {
  return isFiniteNumber(value) && value >= 0
}

function selectedSampleTime(input: MarketFreshnessInput) {
  if (typeof input.sampledAt === 'string' && input.sampledAt.trim()) return parseTimestamp(input.sampledAt)
  return parseTimestamp(input.generatedAt)
}

export function calculateMarketFreshness(input: MarketFreshnessInput): MarketFreshness {
  const sampledAt = selectedSampleTime(input)
  const now = input.now === undefined ? Date.now() : parseTimestamp(input.now)
  const freshForMs = input.freshForMs ?? FRESH_FOR_MS
  const blockedAfterMs = input.blockedAfterMs ?? BLOCKED_AFTER_MS
  const futureToleranceMs = input.futureToleranceMs ?? FUTURE_TOLERANCE_MS

  if (
    sampledAt === null ||
    now === null ||
    !Number.isFinite(freshForMs) ||
    !Number.isFinite(blockedAfterMs) ||
    !Number.isFinite(futureToleranceMs) ||
    freshForMs < 0 ||
    blockedAfterMs <= freshForMs ||
    futureToleranceMs < 0
  ) {
    return 'UNKNOWN'
  }

  const ageMs = now - sampledAt
  if (ageMs < -futureToleranceMs) return 'UNKNOWN'
  if (ageMs <= freshForMs) return 'FRESH'
  if (ageMs < blockedAfterMs) return 'STALE'
  return 'BLOCKED'
}

function isUsableHistoryPoint(point: ComputeMarketPricePoint) {
  return (
    parseTimestamp(point.sampledAt) !== null &&
    isPositiveNumber(point.priceUsdPerGpuHour) &&
    isPositiveNumber(point.priceCnyPerGpuHour) &&
    isPositiveNumber(point.cardHoursPerGpuHour) &&
    isNonNegativeNumber(point.sampleSize)
  )
}

function historyPointFromQuote(quote: ComputeMarketPriceQuote | null | undefined): ComputeMarketPricePoint | null {
  if (!quote || (quote.status !== 'OK' && quote.status !== 'STALE')) return null
  if (
    !quote.quoteType ||
    !quote.sampledAt ||
    parseTimestamp(quote.sampledAt) === null ||
    !isPositiveNumber(quote.priceUsdPerGpuHour) ||
    !isPositiveNumber(quote.priceCnyPerGpuHour) ||
    !isPositiveNumber(quote.cardHoursPerGpuHour) ||
    !isNonNegativeNumber(quote.sampleSize)
  ) {
    return null
  }

  return {
    source: quote.source,
    gpuModel: quote.gpuModel,
    quoteType: quote.quoteType,
    priceUsdPerGpuHour: quote.priceUsdPerGpuHour,
    priceCnyPerGpuHour: quote.priceCnyPerGpuHour,
    cardHoursPerGpuHour: quote.cardHoursPerGpuHour,
    sampleSize: quote.sampleSize,
    sampledAt: quote.sampledAt,
  }
}

const legacyQuoteStatuses = new Set<ComputeMarketPriceQuote['status']>([
  'OK',
  'STALE',
  'NO_QUOTE',
  'UNAVAILABLE',
  'UNCONFIGURED',
])

function sanitizeLegacyQuote(quote: ComputeMarketPriceQuote): ComputeMarketPriceQuote | null {
  if (quote.source !== 'VAST_AI' && quote.source !== 'AKAMAI') return null
  if (typeof quote.gpuModel !== 'string' || !quote.gpuModel.trim()) return null

  const declaredStatus = legacyQuoteStatuses.has(quote.status) ? quote.status : 'UNAVAILABLE'
  const hasUsablePrice =
    (declaredStatus === 'OK' || declaredStatus === 'STALE') && isPositiveNumber(quote.priceUsdPerGpuHour)
  const status =
    declaredStatus === 'OK' || declaredStatus === 'STALE'
      ? hasUsablePrice
        ? declaredStatus
        : 'NO_QUOTE'
      : declaredStatus
  const sampledAt = parseTimestamp(quote.sampledAt) === null ? undefined : quote.sampledAt
  const lastAttemptAt = parseTimestamp(quote.lastAttemptAt) === null ? undefined : quote.lastAttemptAt
  const lastSuccessAt = parseTimestamp(quote.lastSuccessAt) === null ? undefined : quote.lastSuccessAt

  return {
    source: quote.source,
    sourceLabel:
      typeof quote.sourceLabel === 'string' && quote.sourceLabel.trim()
        ? quote.sourceLabel.trim().slice(0, 128)
        : quote.source,
    gpuModel: quote.gpuModel.trim().slice(0, 128),
    sourceUrl: typeof quote.sourceUrl === 'string' ? quote.sourceUrl.trim() : '',
    status,
    ...(quote.quoteType === 'MEDIAN_AVAILABLE' || quote.quoteType === 'OFFICIAL_LIST'
      ? { quoteType: quote.quoteType }
      : {}),
    ...(hasUsablePrice ? { priceUsdPerGpuHour: quote.priceUsdPerGpuHour } : {}),
    ...(hasUsablePrice && isPositiveNumber(quote.priceCnyPerGpuHour)
      ? { priceCnyPerGpuHour: quote.priceCnyPerGpuHour }
      : {}),
    ...(hasUsablePrice && isPositiveNumber(quote.cardHoursPerGpuHour)
      ? { cardHoursPerGpuHour: quote.cardHoursPerGpuHour }
      : {}),
    ...(isNonNegativeNumber(quote.sampleSize) ? { sampleSize: quote.sampleSize } : {}),
    ...(sampledAt ? { sampledAt } : {}),
    ...(lastAttemptAt ? { lastAttemptAt } : {}),
    ...(lastSuccessAt ? { lastSuccessAt } : {}),
  }
}

export function sanitizeLegacyMarketSnapshot(snapshot: ComputeMarketPriceSnapshot): ComputeMarketPriceSnapshot {
  const trackedModels = Array.isArray(snapshot.trackedModels)
    ? [
        ...new Set(
          snapshot.trackedModels
            .filter((model): model is string => typeof model === 'string' && Boolean(model.trim()))
            .map((model) => model.trim().slice(0, 128))
        ),
      ]
    : []
  const quotes = Array.isArray(snapshot.quotes)
    ? snapshot.quotes.map(sanitizeLegacyQuote).filter((quote): quote is ComputeMarketPriceQuote => quote !== null)
    : []

  return {
    ...snapshot,
    trackedModels,
    quotes,
    generatedAt: parseTimestamp(snapshot.generatedAt) === null ? '' : snapshot.generatedAt,
  }
}

export function sanitizeLegacyMarketHistory(history: ComputeMarketPriceHistory): ComputeMarketPriceHistory {
  return {
    ...history,
    points: Array.isArray(history.points) ? history.points.filter(isUsableHistoryPoint) : [],
  }
}

function requireNonNegativeMetric(value: number, field: string) {
  if (!isNonNegativeNumber(value)) throw new Error(`Invalid public market metric: ${field}`)
  return value
}

export function sanitizePublicCardHourMarketStats(stats: CardHourMarketStats): PublicCardHourMarketStats {
  const recentTrades = (Array.isArray(stats.recentTrades) ? stats.recentTrades : [])
    .filter(
      (trade) =>
        trade.status === 'COMPLETED' &&
        parseTimestamp(trade.completedAt) !== null &&
        isPositiveNumber(trade.quantity) &&
        isNonNegativeNumber(trade.unitPrice) &&
        isNonNegativeNumber(trade.totalPrice) &&
        (trade.assetType === 'STANDARD' || trade.assetType === 'SPECIFIC') &&
        (trade.priceCurrency === 'CNY' || trade.priceCurrency === 'CARD_HOUR')
    )
    .map(
      (trade): PublicCardHourTrade => ({
        id: trade.id,
        assetType: trade.assetType,
        gpuModel: trade.gpuModel,
        quantity: trade.quantity,
        unitPrice: trade.unitPrice,
        priceCurrency: trade.priceCurrency,
        totalPrice: trade.totalPrice,
        status: 'COMPLETED',
        completedAt: trade.completedAt,
      })
    )

  return {
    standardInventory: requireNonNegativeMetric(stats.standardInventory, 'standardInventory'),
    specificInventory: requireNonNegativeMetric(stats.specificInventory, 'specificInventory'),
    volume24h: requireNonNegativeMetric(stats.volume24h, 'volume24h'),
    recentTrades,
  }
}

function historyPointKey(point: ComputeMarketPricePoint) {
  return `${point.source}\u0000${point.gpuModel}\u0000${parseTimestamp(point.sampledAt)}`
}

export function mergeMarketHistoryWithLatest(
  history: readonly ComputeMarketPricePoint[],
  latestQuote?: ComputeMarketPriceQuote | null
) {
  const indexed = history.filter(isUsableHistoryPoint).map((point, index) => ({ point, index }))
  const latestPoint = historyPointFromQuote(latestQuote)
  if (latestPoint) indexed.push({ point: latestPoint, index: indexed.length })

  const byIdentity = new Map<string, { point: ComputeMarketPricePoint; index: number }>()
  for (const entry of indexed) {
    const key = historyPointKey(entry.point)
    const previous = byIdentity.get(key)
    byIdentity.set(key, previous ? { point: entry.point, index: previous.index } : entry)
  }

  return [...byIdentity.values()]
    .sort((left, right) => {
      const timeDifference = (parseTimestamp(left.point.sampledAt) ?? 0) - (parseTimestamp(right.point.sampledAt) ?? 0)
      return timeDifference || left.index - right.index
    })
    .map(({ point }) => point)
}

function normalizedDimension(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

function normalizedInstrumentFamily(instrument: MarketInstrumentIdentity) {
  return [
    instrument.category,
    normalizedDimension(instrument.familyId),
    instrument.priceCurrency,
    instrument.priceUnit,
    normalizedDimension(instrument.provider),
    normalizedDimension(instrument.gpuModel),
    normalizedDimension(instrument.region),
    normalizedDimension(instrument.runtime),
  ].join('\u0000')
}

export function isSameMarketFamily(left: MarketInstrumentIdentity, right: MarketInstrumentIdentity) {
  if (!normalizedDimension(left.familyId) || !normalizedDimension(right.familyId)) return false
  return normalizedInstrumentFamily(left) === normalizedInstrumentFamily(right)
}

export function canCompareMarketInstruments(instruments: readonly MarketInstrumentIdentity[]) {
  if (instruments.length < 2) return false
  const uniqueIds = new Set(instruments.map(({ instrumentId }) => normalizedDimension(instrumentId)).filter(Boolean))
  if (uniqueIds.size < 2) return false
  return instruments.slice(1).every((instrument) => isSameMarketFamily(instruments[0], instrument))
}

function hasTwoRealSameFamilyDeliveries(nodes: readonly MarketDeliveryNode[]) {
  if (nodes.length < 2) return false
  const realNodes = nodes.filter((node) => node.isReal && parseTimestamp(node.deliveryAt) !== null)
  if (realNodes.length < 2) return false

  for (let anchorIndex = 0; anchorIndex < realNodes.length; anchorIndex += 1) {
    const anchor = realNodes[anchorIndex]
    const deliveryTimes = new Set<number>()
    for (const candidate of realNodes) {
      if (!isSameMarketFamily(anchor, candidate)) continue
      const deliveryTime = parseTimestamp(candidate.deliveryAt)
      if (deliveryTime !== null) deliveryTimes.add(deliveryTime)
    }
    if (deliveryTimes.size >= 2) return true
  }
  return false
}

function capabilityDecision(
  requirements: ReadonlyArray<[MarketCapabilityRequirement, boolean]>
): MarketCapabilityDecision {
  const missing = requirements.filter(([, satisfied]) => !satisfied).map(([requirement]) => requirement)
  return { enabled: missing.length === 0, missing }
}

export function evaluateMarketCapabilities(evidence: MarketCapabilityEvidence): MarketCapabilityGate {
  const hasRealTrades = evidence.trades?.provenance === 'REAL' && evidence.trades.count > 0
  const hasRealOrderBook = evidence.orderBook?.provenance === 'REAL'
  const hasTwoSidedOrderBook =
    hasRealOrderBook && (evidence.orderBook?.bidLevels ?? 0) > 0 && (evidence.orderBook?.askLevels ?? 0) > 0
  const hasSequencedOrderBook = evidence.orderBook?.sequenced === true
  const hasComparison = canCompareMarketInstruments(evidence.comparisonCandidates ?? [])
  const hasTermStructure = hasTwoRealSameFamilyDeliveries(evidence.deliveryNodes ?? [])
  const hasStandardizedContracts = evidence.standardizedContracts === true
  const hasRealMatchingEngine = evidence.matchingEngine === 'REAL'
  const hasRealPositions = evidence.positions === 'REAL'
  const hasRealRiskControls = evidence.riskControls === 'REAL'
  const hasRealSettlement = evidence.settlement === 'REAL'

  const recentTrades = capabilityDecision([['REAL_TRADES', hasRealTrades]])
  const orderBook = capabilityDecision([
    ['TWO_SIDED_REAL_ORDER_BOOK', hasTwoSidedOrderBook],
    ['SEQUENCED_ORDER_BOOK', hasSequencedOrderBook],
  ])
  const comparison = capabilityDecision([['TWO_COMPARABLE_INSTRUMENTS', hasComparison]])
  const termStructure = capabilityDecision([['TWO_REAL_SAME_FAMILY_DELIVERIES', hasTermStructure]])
  const futuresTerminology = capabilityDecision([
    ['STANDARDIZED_CONTRACTS', hasStandardizedContracts],
    ['TWO_REAL_SAME_FAMILY_DELIVERIES', hasTermStructure],
    ['REAL_SETTLEMENT', hasRealSettlement],
  ])
  const openInterest = capabilityDecision([
    ['STANDARDIZED_CONTRACTS', hasStandardizedContracts],
    ['REAL_POSITIONS', hasRealPositions],
    ['REAL_SETTLEMENT', hasRealSettlement],
  ])
  const trading = capabilityDecision([
    ['REAL_TRADES', hasRealTrades],
    ['TWO_SIDED_REAL_ORDER_BOOK', hasTwoSidedOrderBook],
    ['SEQUENCED_ORDER_BOOK', hasSequencedOrderBook],
    ['TWO_REAL_SAME_FAMILY_DELIVERIES', hasTermStructure],
    ['STANDARDIZED_CONTRACTS', hasStandardizedContracts],
    ['REAL_MATCHING_ENGINE', hasRealMatchingEngine],
    ['REAL_POSITIONS', hasRealPositions],
    ['REAL_RISK_CONTROLS', hasRealRiskControls],
    ['REAL_SETTLEMENT', hasRealSettlement],
  ])

  return {
    p2: { recentTrades, orderBook, comparison, termStructure },
    p3: { futuresTerminology, openInterest, trading },
  }
}

function cardHourFamilyKey(trade: PublicCardHourTrade) {
  return `${trade.assetType}\u0000${normalizedDimension(trade.gpuModel)}\u0000${trade.priceCurrency}`
}

function isAggregatableTrade(trade: PublicCardHourTrade) {
  return (
    Number.isFinite(trade.quantity) &&
    trade.quantity > 0 &&
    Number.isFinite(trade.unitPrice) &&
    trade.unitPrice >= 0 &&
    Number.isFinite(trade.totalPrice) &&
    trade.totalPrice >= 0
  )
}

export function summarizeCompletedCardHourTrades(
  trades: readonly PublicCardHourTrade[]
): CompletedCardHourTradeSummary {
  const completedTrades = trades.filter(
    (trade) => trade.status === 'COMPLETED' && parseTimestamp(trade.completedAt) !== null && isAggregatableTrade(trade)
  )
  const latestTrade = completedTrades.reduce<PublicCardHourTrade | undefined>((latest, trade) => {
    const tradeTime = parseTimestamp(trade.completedAt)
    if (tradeTime === null) return latest
    const latestTime = latest ? parseTimestamp(latest.completedAt) : null
    return latestTime === null || tradeTime > latestTime ? trade : latest
  }, undefined)

  const aggregateState = new Map<
    string,
    CardHourTradeAggregate & { weightedPrice: number; representativeModel?: string }
  >()
  for (const trade of completedTrades) {
    if (!isAggregatableTrade(trade)) continue
    const key = cardHourFamilyKey(trade)
    const current = aggregateState.get(key) ?? {
      assetType: trade.assetType,
      ...(trade.gpuModel?.trim() ? { representativeModel: trade.gpuModel.trim() } : {}),
      priceCurrency: trade.priceCurrency,
      tradeCount: 0,
      quantity: 0,
      notional: 0,
      weightedPrice: 0,
      volumeWeightedAveragePrice: 0,
    }
    current.tradeCount += 1
    current.quantity += trade.quantity
    current.notional += trade.totalPrice
    current.weightedPrice += trade.unitPrice * trade.quantity
    current.volumeWeightedAveragePrice = current.weightedPrice / current.quantity
    aggregateState.set(key, current)
  }

  const aggregates = [...aggregateState.values()].map(
    ({ weightedPrice: _weightedPrice, representativeModel, ...rest }) => ({
      ...rest,
      ...(representativeModel ? { gpuModel: representativeModel } : {}),
    })
  )

  return {
    completedTrades,
    tradeCount: completedTrades.length,
    ...(latestTrade ? { latestTrade } : {}),
    aggregates,
  }
}

const TRUSTED_MARKET_SOURCE_DOMAINS = ['vast.ai', 'akamai.com', 'linode.com', 'kod.kai.com'] as const

export function isTrustedMarketSourceUrl(url: string) {
  if (!url || url !== url.trim()) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false
    const hostname = parsed.hostname.toLocaleLowerCase('en-US').replace(/\.$/, '')
    return TRUSTED_MARKET_SOURCE_DOMAINS.some(
      (trustedDomain) => hostname === trustedDomain || hostname.endsWith(`.${trustedDomain}`)
    )
  } catch {
    return false
  }
}
