import type { ComputeMarketPricePoint, ComputeMarketPriceQuote, ComputeMarketPriceSource } from './computeCenter'

export const COMPUTE_MARKET_DEFAULT_REGION = 'ALL'
export const COMPUTE_MARKET_DEFAULT_RENTAL_TERM = 'HOURLY'
export const COMPUTE_MARKET_SOURCE_BUCKET_MILLISECONDS = 60_000
export const COMPUTE_MARKET_SOURCE_AGGREGATION_BASIS = 'LOWEST_AVAILABLE_CNY_PER_GPU_HOUR' as const

export interface ComputeMarketPriceDimensions {
  sourceLabel?: string
  canonicalModel?: string
  modelKey?: string
  sourceModel?: string
  vramMiB?: number
  formFactor?: string | null
  region?: string
  regionCode?: string
  regionLabel?: string
  rentalTerm?: string
  originalCurrency?: string
  originalPricePerGpuHour?: number
  availableGpuCount?: number
  providerUpdatedAt?: string
  providerId?: string
  providerName?: string
  providerCountry?: string
  externalOfferingId?: string
  availabilityStatus?: ComputeMarketPricePoint['availabilityStatus']
  aggregatedRegionCount?: number
  aggregatedRegionCodes?: string[]
  aggregationLabel?: string
  aggregationBasis?: typeof COMPUTE_MARKET_SOURCE_AGGREGATION_BASIS
  aggregationBucketStartedAt?: string
  aggregationBucketMilliseconds?: number
  aggregationSampleCount?: number
}

export type ComputeMarketComparisonPoint = Omit<
  ComputeMarketPricePoint,
  'quoteType' | 'priceUsdPerGpuHour' | 'priceCnyPerGpuHour' | 'cardHoursPerGpuHour' | 'sampleSize' | 'rentalTerm'
> &
  ComputeMarketPriceDimensions & {
    quoteType: ComputeMarketPricePoint['quoteType']
    priceUsdPerGpuHour?: number
    priceCnyPerGpuHour?: number
    cardHoursPerGpuHour?: number
    sampleSize?: number
  }

export type ComputeMarketComparisonQuote = Omit<ComputeMarketPriceQuote, 'rentalTerm'> & ComputeMarketPriceDimensions

export interface ComputeMarketPriceFilters {
  gpuModel?: string | null
  rentalTerm?: string | null
  regions?: readonly string[]
}

export interface ComputeMarketDimensionOption {
  value: string
  label: string
}

export interface ComputeMarketPriceSeries {
  key: string
  source: ComputeMarketPriceSource
  sourceLabel: string
  regionCode: string
  regionLabel: string
  rentalTerm: string
  quoteType: string
  points: ComputeMarketComparisonPoint[]
}

export interface ComputeMarketSourceAggregatePoint extends ComputeMarketComparisonPoint {
  /** 该时间桶在最终报价口径下参与最低价比较的去重地区数。 */
  aggregatedRegionCount: number
  /** 该时间桶在最终报价口径下参与比较的地区代码。 */
  aggregatedRegionCodes: string[]
  /** 该时间桶经状态与报价口径筛选后，实际参与最低价比较的报价记录数。 */
  aggregationSampleCount: number
  /** 便于图例和悬浮提示直接展示的聚合说明。 */
  aggregationLabel: string
  aggregationBasis: typeof COMPUTE_MARKET_SOURCE_AGGREGATION_BASIS
  aggregationBucketStartedAt: string
  aggregationBucketMilliseconds: number
}

export interface ComputeMarketSourcePriceSeries {
  key: string
  source: ComputeMarketPriceSource
  sourceLabel: string
  canonicalModel: string
  vramMiB?: number
  formFactor?: string | null
  rentalTerm: string
  points: ComputeMarketSourceAggregatePoint[]
}

export interface ComputeMarketSourceGroupingOptions {
  /** 默认按一分钟聚合同一网站在相近采样时间内返回的各地区报价。 */
  bucketMilliseconds?: number
}

export type ComputeMarketDimensionRecord = Pick<ComputeMarketPricePoint, 'source' | 'gpuModel'> &
  Partial<Pick<ComputeMarketPricePoint, 'quoteType' | 'sampledAt'>> &
  ComputeMarketPriceDimensions

export type ComputeMarketGetDeployingVastComparisonReason =
  | 'OK'
  | 'MISSING_SOURCE'
  | 'STALE'
  | 'SPEC_MISMATCH'
  | 'INVALID_PRICE'

export interface ComputeMarketGetDeployingVastComparison {
  reason: ComputeMarketGetDeployingVastComparisonReason
  ratio?: number
  percentVsVast?: number
  getDeployingPriceCny?: number
  vastPriceCny?: number
}

export interface ComputeMarketSvgCoordinate {
  x: number
  y: number
}

const RENTAL_TERM_LABELS: Record<string, string> = {
  HOURLY: '按小时',
  PAYG: '按量计费',
  DAILY: '包日',
  WEEKLY: '包周',
  MONTHLY: '包月',
}

const RENTAL_TERM_ORDER = ['HOURLY', 'PAYG', 'DAILY', 'WEEKLY', 'MONTHLY']

function normalizedText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizedKey(value: unknown) {
  return normalizedText(value).toLocaleUpperCase('en-US')
}

function normalizedFormFactor(value: unknown) {
  const compact = normalizedKey(value).replace(/[^A-Z0-9]/g, '')
  if (!compact) return 'UNSPECIFIED'
  if (compact === 'PCIE' || compact === 'PCIEXPRESS') return 'PCIE'
  return compact
}

function finiteNonNegativeNumber(value: unknown) {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string' && !value.trim()) return undefined
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}

function timestampValue(value: string) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY
}

function formatSvgCoordinate(value: number) {
  const rounded = Math.round(value * 1_000) / 1_000
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

function linearSvgPath(points: readonly ComputeMarketSvgCoordinate[]) {
  return points
    .map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${formatSvgCoordinate(x)} ${formatSvgCoordinate(y)}`)
    .join(' ')
}

function pchipEndpointSlope(firstWidth: number, secondWidth: number, firstSlope: number, secondSlope: number) {
  const candidate =
    ((2 * firstWidth + secondWidth) * firstSlope - firstWidth * secondSlope) / (firstWidth + secondWidth)
  if (Math.sign(candidate) !== Math.sign(firstSlope)) return 0
  if (Math.sign(firstSlope) !== Math.sign(secondSlope) && Math.abs(candidate) > Math.abs(3 * firstSlope)) {
    return 3 * firstSlope
  }
  return candidate
}

/**
 * 为按时间递增的行情坐标生成不制造局部极值的平滑 SVG 路径。
 *
 * 使用 PCHIP（分段三次 Hermite）斜率并转为三次 Bézier。每段控制点的纵坐标都会被限制在
 * 两个真实采样点之间，因此曲线不会越过端点价格。无效坐标返回空路径；横坐标重复或倒序时
 * 安全降级为折线，避免画出时间回环或虚构变化。
 */
export function buildComputeMarketMonotoneSvgPath(points: readonly ComputeMarketSvgCoordinate[]) {
  if (points.length === 0 || points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) {
    return ''
  }
  if (points.length === 1) return linearSvgPath(points)

  const widths = points.slice(1).map((point, index) => point.x - points[index].x)
  if (widths.some((width) => width <= 0)) return linearSvgPath(points)

  const secantSlopes = widths.map((width, index) => (points[index + 1].y - points[index].y) / width)
  if (points.length === 2) {
    const [{ x: startX, y: startY }, { x: endX, y: endY }] = points
    const width = widths[0]
    const slope = secantSlopes[0]
    return [
      `M ${formatSvgCoordinate(startX)} ${formatSvgCoordinate(startY)}`,
      `C ${formatSvgCoordinate(startX + width / 3)} ${formatSvgCoordinate(startY + (slope * width) / 3)}`,
      `${formatSvgCoordinate(endX - width / 3)} ${formatSvgCoordinate(endY - (slope * width) / 3)}`,
      `${formatSvgCoordinate(endX)} ${formatSvgCoordinate(endY)}`,
    ].join(' ')
  }

  const tangents = new Array<number>(points.length).fill(0)
  tangents[0] = pchipEndpointSlope(widths[0], widths[1], secantSlopes[0], secantSlopes[1])
  tangents[tangents.length - 1] = pchipEndpointSlope(
    widths[widths.length - 1],
    widths[widths.length - 2],
    secantSlopes[secantSlopes.length - 1],
    secantSlopes[secantSlopes.length - 2]
  )

  for (let index = 1; index < points.length - 1; index += 1) {
    const previousSlope = secantSlopes[index - 1]
    const nextSlope = secantSlopes[index]
    if (previousSlope === 0 || nextSlope === 0 || Math.sign(previousSlope) !== Math.sign(nextSlope)) {
      tangents[index] = 0
      continue
    }
    const previousWidth = widths[index - 1]
    const nextWidth = widths[index]
    const firstWeight = 2 * nextWidth + previousWidth
    const secondWeight = nextWidth + 2 * previousWidth
    tangents[index] = (firstWeight + secondWeight) / (firstWeight / previousSlope + secondWeight / nextSlope)
  }

  const commands = [`M ${formatSvgCoordinate(points[0].x)} ${formatSvgCoordinate(points[0].y)}`]
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    const width = widths[index]
    const minY = Math.min(start.y, end.y)
    const maxY = Math.max(start.y, end.y)
    const firstControlY = Math.min(maxY, Math.max(minY, start.y + (tangents[index] * width) / 3))
    const secondControlY = Math.min(maxY, Math.max(minY, end.y - (tangents[index + 1] * width) / 3))
    commands.push(
      `C ${formatSvgCoordinate(start.x + width / 3)} ${formatSvgCoordinate(firstControlY)} ` +
        `${formatSvgCoordinate(end.x - width / 3)} ${formatSvgCoordinate(secondControlY)} ` +
        `${formatSvgCoordinate(end.x)} ${formatSvgCoordinate(end.y)}`
    )
  }
  return commands.join(' ')
}

export function getComputeMarketRegionCode(record: ComputeMarketDimensionRecord) {
  return (
    normalizedText(record.regionCode) ||
    normalizedText(record.region) ||
    normalizedText(record.regionLabel) ||
    COMPUTE_MARKET_DEFAULT_REGION
  )
}

export function getComputeMarketRegionLabel(record: ComputeMarketDimensionRecord) {
  if (record.source === 'GETDEPLOYING') {
    const providerName = normalizedText(record.providerName)
    const providerCountry = normalizedText(record.providerCountry)
    if (providerName && providerCountry) return `${providerName}（总部：${providerCountry}）`
    if (providerName) return providerName
    if (providerCountry) return `供应商总部：${providerCountry}`
  }
  return (
    normalizedText(record.regionLabel) ||
    normalizedText(record.region) ||
    (getComputeMarketRegionCode(record) === COMPUTE_MARKET_DEFAULT_REGION
      ? '全市场'
      : getComputeMarketRegionCode(record))
  )
}

export function getComputeMarketRentalTerm(record: ComputeMarketDimensionRecord) {
  const value = normalizedKey(record.rentalTerm) || COMPUTE_MARKET_DEFAULT_RENTAL_TERM
  return value === 'PAYG' ? 'HOURLY' : value
}

export function getComputeMarketExactSpecKey(record: ComputeMarketDimensionRecord) {
  const canonicalModel =
    normalizedKey(record.canonicalModel) || normalizedKey(record.modelKey) || normalizedKey(record.gpuModel)
  const vramMiB = finiteNonNegativeNumber(record.vramMiB)
  if (!canonicalModel || vramMiB === undefined || vramMiB <= 0) return undefined

  return JSON.stringify([
    canonicalModel,
    vramMiB,
    normalizedFormFactor(record.formFactor),
    getComputeMarketRentalTerm(record),
  ])
}

export function areComputeMarketQuotesStrictlyComparable(
  left: ComputeMarketDimensionRecord,
  right: ComputeMarketDimensionRecord
) {
  const leftKey = getComputeMarketExactSpecKey(left)
  const rightKey = getComputeMarketExactSpecKey(right)
  return Boolean(
    leftKey &&
      rightKey &&
      leftKey === rightKey &&
      getComputeMarketRentalTerm(left) === 'HOURLY' &&
      getComputeMarketRentalTerm(right) === 'HOURLY'
  )
}

export function getComputeMarketDisplayCnyPrice(
  record: Pick<ComputeMarketComparisonPoint, 'priceCnyPerGpuHour' | 'priceUsdPerGpuHour'>,
  usdCnyRate?: number
) {
  const directPrice = finiteNonNegativeNumber(record.priceCnyPerGpuHour)
  if (directPrice !== undefined) return directPrice

  const usdPrice = finiteNonNegativeNumber(record.priceUsdPerGpuHour)
  const exchangeRate = finiteNonNegativeNumber(usdCnyRate)
  if (usdPrice === undefined || exchangeRate === undefined || exchangeRate === 0) return undefined
  return usdPrice * exchangeRate
}

export function compareGetDeployingAndVastPrices(
  getDeploying: ComputeMarketComparisonQuote | undefined,
  vast: ComputeMarketComparisonQuote | undefined,
  usdCnyRate?: number,
  options: { clientStale?: boolean } = {}
): ComputeMarketGetDeployingVastComparison {
  if (!getDeploying || !vast || getDeploying.source !== 'GETDEPLOYING' || vast.source !== 'VAST_AI') {
    return { reason: 'MISSING_SOURCE' }
  }
  if (options.clientStale || getDeploying.status === 'STALE' || vast.status === 'STALE') {
    return { reason: 'STALE' }
  }
  if (getDeploying.status !== 'OK' || vast.status !== 'OK') {
    return { reason: 'MISSING_SOURCE' }
  }
  if (!areComputeMarketQuotesStrictlyComparable(getDeploying, vast)) {
    return { reason: 'SPEC_MISMATCH' }
  }

  const getDeployingPriceCny = getComputeMarketDisplayCnyPrice(getDeploying, usdCnyRate)
  const vastPriceCny = getComputeMarketDisplayCnyPrice(vast, usdCnyRate)
  if (
    getDeployingPriceCny === undefined ||
    vastPriceCny === undefined ||
    !Number.isFinite(getDeployingPriceCny) ||
    !Number.isFinite(vastPriceCny) ||
    getDeployingPriceCny <= 0 ||
    vastPriceCny <= 0
  ) {
    return { reason: 'INVALID_PRICE' }
  }

  const ratio = getDeployingPriceCny / vastPriceCny
  return {
    reason: 'OK',
    ratio,
    percentVsVast: (ratio - 1) * 100,
    getDeployingPriceCny,
    vastPriceCny,
  }
}

export function sortComputeMarketPricePoints(
  points: readonly ComputeMarketComparisonPoint[]
): ComputeMarketComparisonPoint[] {
  return points
    .map((point, index) => ({ point, index }))
    .sort((left, right) => {
      const leftTimestamp = timestampValue(left.point.sampledAt)
      const rightTimestamp = timestampValue(right.point.sampledAt)
      if (leftTimestamp !== rightTimestamp) return leftTimestamp < rightTimestamp ? -1 : 1
      return left.index - right.index
    })
    .map(({ point }) => point)
}

export function filterComputeMarketPricePoints(
  points: readonly ComputeMarketComparisonPoint[],
  filters: ComputeMarketPriceFilters
) {
  const gpuModel = normalizedKey(filters.gpuModel)
  const rentalTerm = normalizedKey(filters.rentalTerm)
  const regions = new Set((filters.regions ?? []).map(normalizedKey).filter(Boolean))

  return sortComputeMarketPricePoints(
    points.filter((point) => {
      if (point.status && point.status !== 'OK' && point.status !== 'STALE') return false
      const pointModels = [point.canonicalModel, point.modelKey, point.gpuModel].map(normalizedKey).filter(Boolean)
      if (gpuModel && !pointModels.includes(gpuModel)) return false
      if (rentalTerm && getComputeMarketRentalTerm(point) !== rentalTerm) return false
      if (regions.size > 0 && !regions.has(normalizedKey(getComputeMarketRegionCode(point)))) return false
      return true
    })
  )
}

export function getComputeMarketPriceSeriesKey(record: ComputeMarketDimensionRecord) {
  return JSON.stringify([
    record.source,
    normalizedKey(record.canonicalModel) || normalizedKey(record.modelKey) || normalizedKey(record.gpuModel),
    normalizedKey(record.sourceModel),
    finiteNonNegativeNumber(record.vramMiB) ?? 'UNKNOWN_VRAM',
    normalizedKey(record.formFactor) || 'UNKNOWN_FORM_FACTOR',
    normalizedKey(getComputeMarketRegionCode(record)),
    getComputeMarketRentalTerm(record),
    normalizedKey(record.quoteType) || 'UNKNOWN',
  ])
}

export function groupComputeMarketPricePoints(
  points: readonly ComputeMarketComparisonPoint[]
): ComputeMarketPriceSeries[] {
  const groups = new Map<string, ComputeMarketPriceSeries>()

  for (const point of sortComputeMarketPricePoints(points)) {
    const key = getComputeMarketPriceSeriesKey(point)
    const current = groups.get(key)
    if (current) {
      current.points.push(point)
      continue
    }

    groups.set(key, {
      key,
      source: point.source,
      sourceLabel: normalizedText(point.sourceLabel) || point.source,
      regionCode: getComputeMarketRegionCode(point),
      regionLabel: getComputeMarketRegionLabel(point),
      rentalTerm: getComputeMarketRentalTerm(point),
      quoteType: normalizedText(point.quoteType) || 'UNKNOWN',
      points: [point],
    })
  }

  return Array.from(groups.values()).sort((left, right) =>
    [left.source, left.regionCode, left.rentalTerm, left.quoteType]
      .join('\u0000')
      .localeCompare([right.source, right.regionCode, right.rentalTerm, right.quoteType].join('\u0000'), 'zh-CN')
  )
}

function getComputeMarketCanonicalModel(record: ComputeMarketDimensionRecord) {
  return normalizedText(record.canonicalModel) || normalizedText(record.modelKey) || normalizedText(record.gpuModel)
}

function getComputeMarketSourceSeriesKey(record: ComputeMarketDimensionRecord) {
  return JSON.stringify([
    record.source,
    normalizedKey(getComputeMarketCanonicalModel(record)),
    finiteNonNegativeNumber(record.vramMiB) ?? 'UNKNOWN_VRAM',
    normalizedKey(record.formFactor) || 'UNKNOWN_FORM_FACTOR',
    getComputeMarketRentalTerm(record),
  ])
}

const SOURCE_QUOTE_TYPE_PRIORITY: Record<ComputeMarketPriceSource, readonly string[]> = {
  GETDEPLOYING: ['MIN_AVAILABLE', 'MEDIAN_AVAILABLE', 'VERIFIED_MIN', 'OFFICIAL_LIST', 'MEMBER_PRICE'],
  AUTODL: ['OFFICIAL_LIST', 'MEMBER_PRICE', 'MIN_AVAILABLE', 'VERIFIED_MIN', 'MEDIAN_AVAILABLE'],
  VAST_AI: ['VERIFIED_MIN', 'MIN_AVAILABLE', 'MEDIAN_AVAILABLE', 'OFFICIAL_LIST', 'MEMBER_PRICE'],
  AKAMAI: ['MIN_AVAILABLE', 'OFFICIAL_LIST', 'MEDIAN_AVAILABLE', 'VERIFIED_MIN', 'MEMBER_PRICE'],
}

const QUOTE_TYPE_AGGREGATION_LABELS: Record<string, string> = {
  MIN_AVAILABLE: '当前可租最低价',
  MEDIAN_AVAILABLE: '可租中位价',
  VERIFIED_MIN: '已验证最低价',
  OFFICIAL_LIST: '公开挂牌价',
  MEMBER_PRICE: '会员条件价',
}

function compareSourceQuoteTypes(source: ComputeMarketPriceSource, left: string, right: string) {
  const priority = SOURCE_QUOTE_TYPE_PRIORITY[source]
  const leftIndex = priority.indexOf(left)
  const rightIndex = priority.indexOf(right)
  if (leftIndex >= 0 || rightIndex >= 0) {
    if (leftIndex < 0) return 1
    if (rightIndex < 0) return -1
    return leftIndex - rightIndex
  }
  return left.localeCompare(right, 'en-US')
}

function computeMarketPointStatusPriority(point: ComputeMarketComparisonPoint) {
  if (point.status === 'OK') return 0
  if (!point.status) return 1
  return 2
}

interface ComputeMarketSourceBucketCandidate {
  point: ComputeMarketComparisonPoint
  priceCnyPerGpuHour: number
}

interface ComputeMarketSourceWorkingSeries extends Omit<ComputeMarketSourcePriceSeries, 'points'> {
  buckets: Map<number, ComputeMarketSourceBucketCandidate[]>
}

/**
 * 将行情聚合为每个网站一条曲线。
 *
 * 系列只按网站、规范型号/精确规格与租期拆分，不按地区或报价类型拆线。每个时间桶先按网站
 * 选择优先报价口径（GetDeploying 优先最低可用价，Vast.ai 优先已验证最低价），再在该口径下取
 * 各供应商或地区最低人民币/GPU·小时价。样本数统计状态与报价口径筛选后实际参与比较的记录；
 * 返回点保留获选报价的原始字段，供悬浮提示展示来源与条件。
 */
export function groupComputeMarketPricePointsBySource(
  points: readonly ComputeMarketComparisonPoint[],
  usdCnyRate?: number,
  options: ComputeMarketSourceGroupingOptions = {}
): ComputeMarketSourcePriceSeries[] {
  const configuredBucketMilliseconds = finiteNonNegativeNumber(options.bucketMilliseconds)
  const bucketMilliseconds =
    configuredBucketMilliseconds && configuredBucketMilliseconds >= 1
      ? Math.floor(configuredBucketMilliseconds)
      : COMPUTE_MARKET_SOURCE_BUCKET_MILLISECONDS
  const groups = new Map<string, ComputeMarketSourceWorkingSeries>()

  for (const point of filterComputeMarketPricePoints(points, {})) {
    const sampledAt = Date.parse(point.sampledAt)
    if (!Number.isFinite(sampledAt)) continue
    const priceCnyPerGpuHour = getComputeMarketDisplayCnyPrice(point, usdCnyRate)
    if (priceCnyPerGpuHour === undefined) continue

    const key = getComputeMarketSourceSeriesKey(point)
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        source: point.source,
        sourceLabel: normalizedText(point.sourceLabel) || point.source,
        canonicalModel: getComputeMarketCanonicalModel(point),
        vramMiB: finiteNonNegativeNumber(point.vramMiB),
        formFactor: point.formFactor,
        rentalTerm: getComputeMarketRentalTerm(point),
        buckets: new Map(),
      }
      groups.set(key, group)
    }

    const bucketStartedAt = Math.floor(sampledAt / bucketMilliseconds) * bucketMilliseconds
    const candidates = group.buckets.get(bucketStartedAt) ?? []
    candidates.push({ point, priceCnyPerGpuHour })
    group.buckets.set(bucketStartedAt, candidates)
  }

  return Array.from(groups.values())
    .map(({ buckets, ...group }) => {
      const points = Array.from(buckets.entries())
        .sort(([left], [right]) => left - right)
        .map(([bucketStartedAt, candidates]) => {
          const selectedStatusPriority = Math.min(
            ...candidates.map(({ point }) => computeMarketPointStatusPriority(point))
          )
          const currentStatusCandidates = candidates.filter(
            ({ point }) => computeMarketPointStatusPriority(point) === selectedStatusPriority
          )
          const selectedQuoteType = Array.from(
            new Set(currentStatusCandidates.map(({ point }) => normalizedKey(point.quoteType) || 'UNKNOWN'))
          ).sort((left, right) => compareSourceQuoteTypes(group.source, left, right))[0]
          const selectedCandidates = currentStatusCandidates.filter(
            ({ point }) => (normalizedKey(point.quoteType) || 'UNKNOWN') === selectedQuoteType
          )
          const representative = selectedCandidates.reduce((best, candidate) => {
            if (candidate.priceCnyPerGpuHour !== best.priceCnyPerGpuHour) {
              return candidate.priceCnyPerGpuHour < best.priceCnyPerGpuHour ? candidate : best
            }
            return timestampValue(candidate.point.sampledAt) < timestampValue(best.point.sampledAt) ? candidate : best
          })
          const aggregatedRegionCodes = Array.from(
            new Set(
              selectedCandidates.map(({ point }) =>
                group.source === 'GETDEPLOYING'
                  ? normalizedText(point.providerId) || getComputeMarketRegionCode(point)
                  : getComputeMarketRegionCode(point)
              )
            )
          ).sort((left, right) => left.localeCompare(right, 'en-US'))
          const aggregatedRegionCount = aggregatedRegionCodes.length
          const aggregationSampleCount = selectedCandidates.length
          const quoteTypeLabel = QUOTE_TYPE_AGGREGATION_LABELS[selectedQuoteType] ?? selectedQuoteType
          const aggregationScope = group.source === 'GETDEPLOYING' ? '家供应商' : '个地区'

          return {
            ...representative.point,
            priceCnyPerGpuHour: representative.priceCnyPerGpuHour,
            aggregatedRegionCount,
            aggregatedRegionCodes,
            aggregationSampleCount,
            aggregationLabel: `${quoteTypeLabel}口径 · ${aggregatedRegionCount} ${aggregationScope} · ${aggregationSampleCount} 个采样 · 区间最低人民币小时价`,
            aggregationBasis: COMPUTE_MARKET_SOURCE_AGGREGATION_BASIS,
            aggregationBucketStartedAt: new Date(bucketStartedAt).toISOString(),
            aggregationBucketMilliseconds: bucketMilliseconds,
          } satisfies ComputeMarketSourceAggregatePoint
        })

      return { ...group, points }
    })
    .sort((left, right) =>
      [left.source, left.canonicalModel, left.vramMiB ?? '', left.formFactor ?? '', left.rentalTerm]
        .join('\u0000')
        .localeCompare(
          [right.source, right.canonicalModel, right.vramMiB ?? '', right.formFactor ?? '', right.rentalTerm].join(
            '\u0000'
          ),
          'zh-CN'
        )
    )
}

function mergeDefinedPoint(
  existing: ComputeMarketComparisonPoint | undefined,
  incoming: ComputeMarketComparisonPoint
): ComputeMarketComparisonPoint {
  if (!existing) return incoming

  return {
    ...existing,
    ...Object.fromEntries(Object.entries(incoming).filter(([, value]) => value !== undefined)),
  } as unknown as ComputeMarketComparisonPoint
}

function quoteToPoint(quote: ComputeMarketComparisonQuote): ComputeMarketComparisonPoint | undefined {
  if (quote.status !== 'OK' && quote.status !== 'STALE') return undefined
  const sampledAt = normalizedText(quote.sampledAt) || normalizedText(quote.lastSuccessAt)
  if (!sampledAt) return undefined
  if (getComputeMarketDisplayCnyPrice(quote, 1) === undefined) return undefined

  return {
    source: quote.source,
    sourceLabel: quote.sourceLabel,
    gpuModel: quote.gpuModel,
    quoteType:
      quote.quoteType ??
      (quote.source === 'GETDEPLOYING'
        ? 'MIN_AVAILABLE'
        : quote.source === 'AUTODL'
          ? 'OFFICIAL_LIST'
          : 'MEDIAN_AVAILABLE'),
    status: quote.status,
    priceUsdPerGpuHour: quote.priceUsdPerGpuHour,
    priceCnyPerGpuHour: quote.priceCnyPerGpuHour,
    cardHoursPerGpuHour: quote.cardHoursPerGpuHour,
    sampleSize: quote.sampleSize,
    sampledAt,
    canonicalModel: quote.canonicalModel,
    modelKey: quote.modelKey,
    sourceModel: quote.sourceModel,
    vramMiB: quote.vramMiB,
    formFactor: quote.formFactor,
    region: quote.region,
    regionCode: quote.regionCode,
    regionLabel: quote.regionLabel,
    rentalTerm: quote.rentalTerm,
    originalCurrency: quote.originalCurrency,
    originalPricePerGpuHour: quote.originalPricePerGpuHour,
    originalBillingPrice: quote.originalBillingPrice,
    originalBillingUnit: quote.originalBillingUnit,
    medianPricePerGpuHour: quote.medianPricePerGpuHour,
    verifiedPricePerGpuHour: quote.verifiedPricePerGpuHour,
    availableGpuCount: quote.availableGpuCount,
    priceCondition: quote.priceCondition,
    providerUpdatedAt: quote.providerUpdatedAt,
    providerId: quote.providerId,
    providerName: quote.providerName,
    providerCountry: quote.providerCountry,
    externalOfferingId: quote.externalOfferingId,
    availabilityStatus: quote.availabilityStatus,
  }
}

function getComputeMarketPricePointKey(point: ComputeMarketComparisonPoint) {
  const sampledAt = timestampValue(point.sampledAt)
  return JSON.stringify([
    point.source,
    normalizedKey(point.canonicalModel) || normalizedKey(point.modelKey) || normalizedKey(point.gpuModel),
    normalizedKey(point.sourceModel),
    finiteNonNegativeNumber(point.vramMiB) ?? 'UNKNOWN_VRAM',
    normalizedKey(point.formFactor) || 'UNKNOWN_FORM_FACTOR',
    normalizedKey(getComputeMarketRegionCode(point)),
    normalizedKey(point.providerId) || 'UNKNOWN_PROVIDER',
    normalizedKey(point.externalOfferingId) || 'UNKNOWN_OFFERING',
    getComputeMarketRentalTerm(point),
    normalizedKey(point.quoteType) || 'UNKNOWN',
    Number.isFinite(sampledAt) ? sampledAt : point.sampledAt,
  ])
}

export function mergeComputeMarketPricePoints(
  historyPoints: readonly ComputeMarketComparisonPoint[] = [],
  liveQuotes: readonly ComputeMarketComparisonQuote[] = []
) {
  const pointsByKey = new Map<string, ComputeMarketComparisonPoint>()

  for (const point of historyPoints) {
    const key = getComputeMarketPricePointKey(point)
    pointsByKey.set(key, mergeDefinedPoint(pointsByKey.get(key), point))
  }

  for (const quote of liveQuotes) {
    const point = quoteToPoint(quote)
    if (!point) continue
    const key = getComputeMarketPricePointKey(point)
    pointsByKey.set(key, mergeDefinedPoint(pointsByKey.get(key), point))
  }

  return sortComputeMarketPricePoints(Array.from(pointsByKey.values()))
}

export function deriveComputeMarketRegions(
  records: readonly ComputeMarketDimensionRecord[]
): ComputeMarketDimensionOption[] {
  const options = new Map<string, ComputeMarketDimensionOption>()

  for (const record of records) {
    const value = getComputeMarketRegionCode(record)
    const key = normalizedKey(value)
    if (!options.has(key)) options.set(key, { value, label: getComputeMarketRegionLabel(record) })
  }

  return Array.from(options.values()).sort((left, right) => {
    if (left.value === COMPUTE_MARKET_DEFAULT_REGION) return -1
    if (right.value === COMPUTE_MARKET_DEFAULT_REGION) return 1
    return left.value.localeCompare(right.value, 'en-US')
  })
}

export function deriveComputeMarketRentalTerms(
  records: readonly ComputeMarketDimensionRecord[]
): ComputeMarketDimensionOption[] {
  const terms = new Set(records.map(getComputeMarketRentalTerm))
  return Array.from(terms)
    .map((value) => ({ value, label: RENTAL_TERM_LABELS[value] ?? value }))
    .sort((left, right) => {
      const leftIndex = RENTAL_TERM_ORDER.indexOf(left.value)
      const rightIndex = RENTAL_TERM_ORDER.indexOf(right.value)
      if (leftIndex >= 0 || rightIndex >= 0) {
        if (leftIndex < 0) return 1
        if (rightIndex < 0) return -1
        return leftIndex - rightIndex
      }
      return left.value.localeCompare(right.value, 'en-US')
    })
}
