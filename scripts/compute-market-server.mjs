import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
loadLocalEnvironment(await readOptionalText(path.join(repositoryRoot, '.env.market.local')))

const HOST = process.env.KOD_MARKET_HOST || '127.0.0.1'
const PORT = positiveInteger(process.env.KOD_MARKET_PORT) || 8787
const MINIMUM_REFRESH_SECONDS = 15 * 60
const REFRESH_SECONDS = positiveInteger(process.env.KOD_MARKET_REFRESH_SECONDS) || 60
const GETDEPLOYING_CACHE_SECONDS = Math.max(
  MINIMUM_REFRESH_SECONDS,
  positiveInteger(process.env.KOD_MARKET_GETDEPLOYING_CACHE_SECONDS) || MINIMUM_REFRESH_SECONDS
)
const DEFAULT_HISTORY_RETENTION_DAYS = 365
const MINIMUM_HISTORY_RETENTION_DAYS = 30
const MAXIMUM_HISTORY_RETENTION_DAYS = 730
const HISTORY_RETENTION_DAYS = normalizeHistoryRetentionDays(process.env.KOD_MARKET_HISTORY_RETENTION_DAYS)
const HISTORY_PATH =
  process.env.KOD_MARKET_HISTORY_PATH || path.join(repositoryRoot, 'release', 'app', 'dist', 'compute-market-history.json')
const VAST_SEARCH_URL = 'https://console.vast.ai/api/v0/bundles/'
const VAST_SOURCE_URL = 'https://vast.ai/pricing'
const GETDEPLOYING_SOURCE_URL = 'https://getdeploying.com/gpus'
const GETDEPLOYING_OFFERS_URL = 'https://getdeploying.com/api/gpu-offerings'
const FRANKFURTER_URL = 'https://api.frankfurter.app/latest?from=USD&to=CNY'
const KOD_CONFIG_URL = 'https://kod.kai.com/api/compute/config'
const UPSTREAM_TIMEOUT_MS = 8_000

const MODELS = [
  {
    key: 'nvidia-a100-pcie-40gb',
    label: 'A100 PCIe 40GB',
    vastName: 'A100 PCIE',
    getDeployingSlug: 'nvidia-a100',
    vramGb: 40,
    vramMiB: 40960,
    vastVramMiB: 40960,
    formFactor: 'PCIE',
  },
  {
    key: 'nvidia-v100-32gb',
    label: 'V100 32GB',
    vastName: 'Tesla V100',
    getDeployingSlug: 'nvidia-v100',
    vramGb: 32,
    vramMiB: 32768,
    vastVramMiB: 32768,
    formFactor: null,
  },
  {
    key: 'nvidia-t4-16gb',
    label: 'Tesla T4 16GB',
    vastName: 'Tesla T4',
    getDeployingSlug: 'nvidia-t4',
    vramGb: 16,
    vramMiB: 16384,
    vastVramMiB: 15360,
    formFactor: null,
  },
]

const allowedOrigins = new Set([
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://127.0.0.1:1212',
  'http://localhost:1212',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
])
for (const origin of (process.env.KOD_MARKET_ALLOWED_ORIGINS || '').split(',')) {
  const normalized = origin.trim().replace(/\/$/, '')
  if (normalized) allowedOrigins.add(normalized)
}

let snapshotCache = null
let refreshPromise = null
let nextRefreshAt = 0
let historyPoints = await loadHistory()
let historyPersistPromise = null
let historyPersistPending = false
let usdCnyRateCache = { value: undefined, updatedAt: undefined, expiresAt: 0 }
let cardHourRateCache = { value: undefined, updatedAt: undefined, expiresAt: 0 }
let getDeployingOfferingsCache = { offerings: null, fetchedAt: null, expiresAt: 0 }
let getDeployingHealth = {
  status: process.env.GETDEPLOYING_API_KEY?.trim() ? 'configured' : 'unconfigured',
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: process.env.GETDEPLOYING_API_KEY?.trim()
    ? null
    : '需要在服务端配置 GETDEPLOYING_API_KEY。',
  offeringCount: null,
}

function loadLocalEnvironment(content) {
  if (!content) return
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator < 1) continue
    const name = trimmed.slice(0, separator).trim()
    if (!/^[A-Z][A-Z0-9_]*$/.test(name) || process.env[name] !== undefined) continue
    let value = trimmed.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[name] = value
  }
}

async function readOptionalText(filename) {
  try {
    return await readFile(filename, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return ''
    throw error
  }
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : undefined
}

function normalizeHistoryRetentionDays(value) {
  const configuredDays = positiveInteger(value) || DEFAULT_HISTORY_RETENTION_DAYS
  return Math.min(MAXIMUM_HISTORY_RETENTION_DAYS, Math.max(MINIMUM_HISTORY_RETENTION_DAYS, configuredDays))
}

function finiteNumber(value) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function safeErrorMessage(source) {
  return `${source} 实时接口暂时不可用，请稍后重试。`
}

class UpstreamHttpError extends Error {
  constructor(url, status) {
    super(`HTTP ${status} from ${new URL(url).host}`)
    this.name = 'UpstreamHttpError'
    this.status = status
  }
}

async function fetchJson(url, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'KOD-Compute-Market/1.0',
      ...(options.headers || {}),
    },
    signal: options.signal || AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })
  if (!response.ok) throw new UpstreamHttpError(url, response.status)
  return response.json()
}

async function getUsdCnyRate() {
  if (Date.now() < usdCnyRateCache.expiresAt) return usdCnyRateCache
  try {
    const data = await fetchJson(FRANKFURTER_URL)
    const value = finiteNumber(data?.rates?.CNY)
    if (value && value > 0) {
      usdCnyRateCache = {
        value,
        updatedAt: typeof data?.date === 'string' ? `${data.date}T00:00:00.000Z` : new Date().toISOString(),
        expiresAt: Date.now() + 6 * 60 * 60_000,
      }
    }
  } catch (error) {
    console.warn(`[market] USD/CNY refresh failed: ${error.message}`)
  }
  return usdCnyRateCache
}

async function getCardHourRate() {
  if (Date.now() < cardHourRateCache.expiresAt) return cardHourRateCache
  try {
    const response = await fetchJson(KOD_CONFIG_URL)
    const value = finiteNumber(response?.data?.cardHourCnyRate)
    if (value && value > 0) {
      cardHourRateCache = { value, updatedAt: new Date().toISOString(), expiresAt: Date.now() + 10 * 60_000 }
    }
  } catch (error) {
    console.warn(`[market] card-hour rate refresh failed: ${error.message}`)
  }
  return cardHourRateCache
}

async function fetchVastOffers() {
  const headers = { 'Content-Type': 'application/json' }
  const token = (process.env.VAST_API_TOKEN || process.env.VAST_API_KEY)?.trim()
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetchJson(VAST_SEARCH_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      limit: 1000,
      type: 'ondemand',
      verified: { eq: true },
      rentable: { eq: true },
      rented: { eq: false },
      gpu_name: { in: MODELS.map((model) => model.vastName) },
      order: [['dph_total', 'asc']],
    }),
  })
  if (!Array.isArray(response?.offers)) throw new Error('Vast.ai response has no offers array')
  return response.offers
}

async function fetchGetDeployingOfferings({
  apiKey = process.env.GETDEPLOYING_API_KEY?.trim(),
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) throw new Error('GETDEPLOYING_API_KEY is not configured')
  const offerings = []
  const pageSize = 100
  for (let page = 1; page <= 100; page += 1) {
    const url = new URL(GETDEPLOYING_OFFERS_URL)
    url.searchParams.set('gpu_model', MODELS.map((model) => model.getDeployingSlug).join(','))
    url.searchParams.set('billing_type', 'ON_DEMAND')
    url.searchParams.set('availability', 'AVAILABLE')
    url.searchParams.set('sort', 'price_per_gpu_hour')
    url.searchParams.set('page', String(page))
    url.searchParams.set('page_size', String(pageSize))
    const response = await fetchJson(
      url,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      },
      fetchImpl
    )
    if (!Array.isArray(response?.data)) throw new Error('GetDeploying response has no data array')
    const responsePage = Number(response?.page)
    const pageCount = Number(response?.page_count)
    if (!Number.isInteger(responsePage) || responsePage !== page) {
      throw new Error(`GetDeploying response page mismatch: requested ${page}`)
    }
    if (!Number.isInteger(pageCount) || pageCount < 0) {
      throw new Error('GetDeploying response has invalid page_count')
    }
    if (pageCount > 100) {
      throw new Error(`GetDeploying response exceeds the safe pagination limit (${pageCount} pages)`)
    }
    offerings.push(...response.data)
    if (pageCount === 0 || page >= pageCount) break
  }
  return offerings
}

async function getCachedGetDeployingOfferings() {
  const now = Date.now()
  if (Array.isArray(getDeployingOfferingsCache.offerings) && now < getDeployingOfferingsCache.expiresAt) {
    return { ...getDeployingOfferingsCache, fromCache: true }
  }
  const offerings = await fetchGetDeployingOfferings()
  const fetchedAt = new Date().toISOString()
  getDeployingOfferingsCache = {
    offerings,
    fetchedAt,
    expiresAt: Date.now() + GETDEPLOYING_CACHE_SECONDS * 1000,
  }
  return { ...getDeployingOfferingsCache, fromCache: false }
}

function median(values) {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function marketRegionCode(source, label) {
  const slug = String(label || 'ALL')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLocaleUpperCase('en-US')
  return `${source}:${slug || 'ALL'}`
}

function normalizeVastOffer(offer, model) {
  const gpuRam = finiteNumber(offer?.gpu_ram)
  const gpuCount = finiteNumber(offer?.num_gpus)
  const totalHourlyPrice = finiteNumber(offer?.dph_total)
  const gpuFraction = finiteNumber(offer?.gpu_frac) ?? 1
  if (
    offer?.gpu_name !== model.vastName ||
    gpuRam === undefined ||
    gpuRam !== model.vastVramMiB ||
    !gpuCount ||
    gpuCount <= 0 ||
    totalHourlyPrice === undefined ||
    totalHourlyPrice < 0 ||
    gpuFraction < 0.999 ||
    offer?.rentable !== true ||
    offer?.verification !== 'verified'
  ) {
    return undefined
  }
  const geolocation = typeof offer.geolocation === 'string' && offer.geolocation.trim() ? offer.geolocation.trim() : '全球'
  return {
    pricePerGpuHour: totalHourlyPrice / gpuCount,
    gpuCount,
    gpuIds: Array.isArray(offer?.gpu_ids) ? offer.gpu_ids.map(String) : [],
    geolocation,
    sourceVramMiB: gpuRam,
  }
}

function buildVastQuotes(offers, usdCnyRate, cardHourCnyRate, sampledAt) {
  const quotes = []
  for (const model of MODELS) {
    const normalizedOffers = offers.map((offer) => normalizeVastOffer(offer, model)).filter(Boolean)
    if (normalizedOffers.length === 0) {
      quotes.push(baseQuote('VAST_AI', model, sampledAt, {
        sourceLabel: 'Vast.ai',
        sourceModel: model.vastName,
        sourceUrl: VAST_SOURCE_URL,
        status: 'NO_QUOTE',
        quoteType: 'VERIFIED_MIN',
        regionCode: 'VAST:ALL',
        regionLabel: '全市场',
        errorMessage: '当前没有符合该精确规格的已验证可租实例。',
      }))
      continue
    }
    const byRegion = new Map()
    for (const offer of normalizedOffers) {
      const list = byRegion.get(offer.geolocation) || []
      list.push(offer)
      byRegion.set(offer.geolocation, list)
    }
    for (const [geolocation, regionOffers] of byRegion) {
      const prices = regionOffers.map((offer) => offer.pricePerGpuHour)
      const minimum = Math.min(...prices)
      const uniqueGpuIds = new Set(regionOffers.flatMap((offer) => offer.gpuIds))
      const availableGpuCount =
        uniqueGpuIds.size || Math.max(...regionOffers.map((offer) => offer.gpuCount), 0)
      quotes.push(baseQuote('VAST_AI', model, sampledAt, {
        sourceLabel: 'Vast.ai',
        sourceModel: model.vastName,
        sourceUrl: VAST_SOURCE_URL,
        status: 'OK',
        quoteType: 'VERIFIED_MIN',
        priceUsdPerGpuHour: minimum,
        priceCnyPerGpuHour: usdCnyRate === undefined ? undefined : minimum * usdCnyRate,
        cardHoursPerGpuHour:
          usdCnyRate === undefined || cardHourCnyRate === undefined
            ? undefined
            : (minimum * usdCnyRate) / cardHourCnyRate,
        sampleSize: regionOffers.length,
        rentalTerm: 'HOURLY',
        regionCode: marketRegionCode('VAST', geolocation),
        regionLabel: geolocation,
        originalCurrency: 'USD',
        originalPricePerGpuHour: minimum,
        originalBillingPrice: minimum,
        originalBillingUnit: 'HOUR',
        medianPricePerGpuHour: median(prices),
        verifiedPricePerGpuHour: minimum,
        availableGpuCount,
        sourceVramMiB: regionOffers[0].sourceVramMiB,
        priceCondition: '已验证、当前可租、按需实例',
        lastSuccessAt: sampledAt,
      }))
    }
  }
  return quotes
}

function normalizeGetDeployingFormFactor(value) {
  const normalized = String(value || '')
    .replace(/[^a-z0-9]/gi, '')
    .toLocaleUpperCase('en-US')
  if (normalized.startsWith('PCIE')) return 'PCIE'
  if (normalized.startsWith('SXM')) return 'SXM'
  if (normalized.startsWith('NVL')) return 'NVL'
  return normalized || undefined
}

function getDeployingFormFactor(configuration) {
  const explicit = normalizeGetDeployingFormFactor(configuration?.interconnect)
  if (explicit) return explicit
  const hasNoInterconnect = !String(configuration?.interconnect || '').trim()
  if (hasNoInterconnect && configuration?.interconnect_bandwidth_gbps == null) return 'PCIE'
  return undefined
}

function isVastProvider(provider) {
  const providerId = String(provider?.id || '').trim().toLocaleLowerCase('en-US')
  const providerName = String(provider?.name || '')
    .replace(/[^a-z0-9]/gi, '')
    .toLocaleLowerCase('en-US')
  return providerId === 'vast-ai' || providerId === 'vastai' || providerName === 'vastai'
}

function sameGetDeployingModel(offering, model) {
  const configuration = offering?.configuration
  const vramGb = finiteNumber(configuration?.vram_per_gpu_gb)
  if (configuration?.gpu_model !== model.getDeployingSlug || vramGb === undefined || vramGb !== model.vramGb) {
    return false
  }
  if (model.formFactor && getDeployingFormFactor(configuration) !== model.formFactor) {
    return false
  }
  return true
}

function stableGetDeployingId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeGetDeployingOffering(offering, model) {
  if (!sameGetDeployingModel(offering, model) || isVastProvider(offering?.provider)) return undefined
  if (offering?.pricing?.billing_type !== 'ON_DEMAND' || offering?.status?.availability !== 'AVAILABLE') {
    return undefined
  }
  if (offering?.pricing?.currency !== 'USD') return undefined
  const priceUsdPerGpuHour = finiteNumber(offering?.pricing?.hourly_per_gpu)
  const offeringId = stableGetDeployingId(offering?.id)
  const providerId = stableGetDeployingId(offering?.provider?.id)
  const providerName = String(offering?.provider?.name || '').trim()
  if (priceUsdPerGpuHour === undefined || priceUsdPerGpuHour < 0 || !offeringId || !providerId || !providerName) {
    return undefined
  }
  const providerCountry = String(offering?.provider?.country || '').trim() || null
  const externalOfferingId = String(offering?.external_id || '').trim() || null
  const providerUpdatedAt = String(offering?.status?.last_verified || '').trim() || undefined
  return {
    priceUsdPerGpuHour,
    offeringId,
    externalOfferingId,
    providerId,
    providerName,
    providerCountry,
    providerWebsite: String(offering?.provider?.website || '').trim() || null,
    providerUpdatedAt,
    availabilityStatus: 'AVAILABLE',
    sourceModel: offering.configuration.gpu_model,
    formFactor: getDeployingFormFactor(offering.configuration) || model.formFactor,
    gpuCount: finiteNumber(offering.configuration.gpu_count),
  }
}

function buildGetDeployingQuotes(offerings, usdCnyRate, cardHourCnyRate, sampledAt) {
  const quotes = []
  for (const model of MODELS) {
    const normalizedOfferings = []
    const seenOfferings = new Set()
    for (const offering of offerings) {
      const normalized = normalizeGetDeployingOffering(offering, model)
      if (!normalized) continue
      const uniqueKey = `${normalized.providerId}\u0000${normalized.offeringId}`
      if (seenOfferings.has(uniqueKey)) continue
      seenOfferings.add(uniqueKey)
      normalizedOfferings.push(normalized)
    }
    const prices = normalizedOfferings.map((offering) => offering.priceUsdPerGpuHour)
    const sampleSize = normalizedOfferings.length
    const medianPricePerGpuHour = median(prices)
    for (const normalized of normalizedOfferings) {
      const priceCnyPerGpuHour =
        usdCnyRate === undefined ? undefined : normalized.priceUsdPerGpuHour * usdCnyRate
      const headquarters = normalized.providerCountry
        ? `总部 ${normalized.providerCountry}`
        : '总部国家未提供'
      quotes.push(
        baseQuote('GETDEPLOYING', model, sampledAt, {
          sourceUrl: `${GETDEPLOYING_SOURCE_URL}/${model.getDeployingSlug}`,
          sourceModel: normalized.sourceModel,
          status: 'OK',
          quoteType: 'OFFICIAL_LIST',
          priceUsdPerGpuHour: normalized.priceUsdPerGpuHour,
          priceCnyPerGpuHour,
          cardHoursPerGpuHour:
            priceCnyPerGpuHour === undefined || cardHourCnyRate === undefined
              ? undefined
              : priceCnyPerGpuHour / cardHourCnyRate,
          sampleSize,
          rentalTerm: 'HOURLY',
          regionCode: `GETDEPLOYING:${normalized.providerId}`,
          regionLabel: `${normalized.providerName} · ${headquarters}`,
          originalCurrency: 'USD',
          originalPricePerGpuHour: normalized.priceUsdPerGpuHour,
          originalBillingPrice: normalized.priceUsdPerGpuHour,
          originalBillingUnit: 'HOUR',
          medianPricePerGpuHour,
          formFactor: normalized.formFactor,
          providerId: normalized.providerId,
          providerName: normalized.providerName,
          providerCountry: normalized.providerCountry,
          providerWebsite: normalized.providerWebsite,
          externalOfferingId: normalized.externalOfferingId,
          gpuCount: normalized.gpuCount,
          availabilityStatus: normalized.availabilityStatus,
          providerUpdatedAt: normalized.providerUpdatedAt,
          priceCondition: 'GetDeploying 标准化的 AVAILABLE 按需报价；供应商总部国家不代表机房地区',
          lastSuccessAt: sampledAt,
        })
      )
    }
  }
  return quotes
}

function baseQuote(source, model, sampledAt, overrides) {
  const getDeploying = source === 'GETDEPLOYING'
  return {
    source,
    sourceLabel: getDeploying ? 'GetDeploying' : 'Vast.ai',
    gpuModel: model.label,
    modelKey: model.key,
    sourceModel: getDeploying ? model.getDeployingSlug : model.vastName,
    vramMiB: model.vramMiB,
    formFactor: model.formFactor,
    rentalTerm: 'HOURLY',
    sampledAt,
    lastAttemptAt: sampledAt,
    ...overrides,
  }
}

function buildGetDeployingUnconfiguredQuotes(sampledAt) {
  return MODELS.map((model) =>
    baseQuote('GETDEPLOYING', model, sampledAt, {
      sourceUrl: `${GETDEPLOYING_SOURCE_URL}/${model.getDeployingSlug}`,
      status: 'UNCONFIGURED',
      quoteType: 'OFFICIAL_LIST',
      regionCode: 'GETDEPLOYING:ALL',
      regionLabel: 'GetDeploying · 供应商总部未加载',
      providerId: null,
      providerName: null,
      providerCountry: null,
      externalOfferingId: null,
      availabilityStatus: null,
      errorMessage: '需要在服务端配置 GETDEPLOYING_API_KEY 后才能获取 GetDeploying 报价。',
    })
  )
}

function getDeployingErrorMessage(error) {
  if (error?.status === 401) {
    return 'GetDeploying API 授权失败（HTTP 401），请检查 GETDEPLOYING_API_KEY 是否有效。'
  }
  if (error?.status === 403) {
    return 'GetDeploying API 授权失败（HTTP 403），请确认订阅已启用且 GETDEPLOYING_API_KEY 有访问权限。'
  }
  return 'GetDeploying API 暂时不可用，请稍后重试。'
}

function fallbackQuotes(source, previousQuotes, sampledAt, errorMessage) {
  if (previousQuotes.length > 0) {
    return previousQuotes.map((quote) => ({
      ...quote,
      status: quote.priceCnyPerGpuHour == null && quote.priceUsdPerGpuHour == null ? 'UNAVAILABLE' : 'STALE',
      lastAttemptAt: sampledAt,
      errorMessage,
    }))
  }
  const getDeploying = source === 'GETDEPLOYING'
  return MODELS.map((model) =>
    baseQuote(source, model, sampledAt, {
      sourceUrl: getDeploying ? `${GETDEPLOYING_SOURCE_URL}/${model.getDeployingSlug}` : VAST_SOURCE_URL,
      status: 'UNAVAILABLE',
      quoteType: getDeploying ? 'OFFICIAL_LIST' : 'VERIFIED_MIN',
      regionCode: `${source}:ALL`,
      regionLabel: getDeploying ? 'GetDeploying · 供应商总部未加载' : '全市场',
      ...(getDeploying
        ? {
            providerId: null,
            providerName: null,
            providerCountry: null,
            externalOfferingId: null,
            availabilityStatus: null,
          }
        : {}),
      errorMessage,
    })
  )
}

function buildAvailableRegions(quotes) {
  return quotes
    .filter((quote) => quote.status === 'OK' && quote.regionCode && quote.regionLabel)
    .map((quote) => ({ value: quote.regionCode, label: quote.regionLabel, source: quote.source }))
    .filter((option, index, options) => options.findIndex((other) => other.value === option.value) === index)
}

function quoteToPoint(quote) {
  const {
    sourceUrl: _sourceUrl,
    lastAttemptAt: _lastAttemptAt,
    lastSuccessAt: _lastSuccessAt,
    errorMessage: _errorMessage,
    ...point
  } = quote
  return point
}

function historyKey(point) {
  const minute = Math.floor(Date.parse(point.sampledAt) / 60_000)
  return JSON.stringify([
    point.source,
    point.modelKey || point.gpuModel,
    point.sourceModel,
    point.vramMiB,
    point.formFactor,
    point.regionCode,
    point.providerId,
    point.externalOfferingId,
    point.rentalTerm,
    point.quoteType,
    minute,
  ])
}

function historySeriesKey(point) {
  return JSON.stringify([
    point.source,
    point.modelKey || point.gpuModel,
    point.sourceModel,
    point.vramMiB,
    point.formFactor,
    point.regionCode,
    point.providerId,
    point.externalOfferingId,
    point.rentalTerm,
    point.quoteType,
  ])
}

function sampleEvenly(values, limit) {
  if (values.length <= limit) return values
  if (limit <= 1) return [values.at(-1)]
  return Array.from({ length: limit }, (_, index) => values[Math.round((index * (values.length - 1)) / (limit - 1))])
}

function compactHistory(points, now = Date.now()) {
  const cutoff = now - HISTORY_RETENTION_DAYS * 24 * 60 * 60_000
  const highResolutionCutoff = now - 24 * 60 * 60_000
  const bySeries = new Map()
  for (const point of points) {
    const sampledAt = Date.parse(point.sampledAt)
    if (!Number.isFinite(sampledAt) || sampledAt < cutoff) continue
    const key = historySeriesKey(point)
    const series = bySeries.get(key) || []
    series.push(point)
    bySeries.set(key, series)
  }

  const maximumTotalPoints = 50_000
  const maximumPointsPerSeries = Math.min(
    2_160,
    Math.max(2, Math.floor(maximumTotalPoints / Math.max(bySeries.size, 1)))
  )
  const compacted = []
  for (const series of bySeries.values()) {
    const buckets = new Map()
    for (const point of series.sort((left, right) => Date.parse(left.sampledAt) - Date.parse(right.sampledAt))) {
      const sampledAt = Date.parse(point.sampledAt)
      const bucketSize = sampledAt >= highResolutionCutoff ? 60_000 : 60 * 60_000
      buckets.set(Math.floor(sampledAt / bucketSize), point)
    }
    compacted.push(...sampleEvenly([...buckets.values()], maximumPointsPerSeries))
  }
  return compacted.sort((left, right) => Date.parse(left.sampledAt) - Date.parse(right.sampledAt))
}

function limitHistoryResponse(points, maximumTotalPoints = 10_000) {
  const bySeries = new Map()
  for (const point of points) {
    const key = historySeriesKey(point)
    const series = bySeries.get(key) || []
    series.push(point)
    bySeries.set(key, series)
  }
  const maximumPerSeries = Math.max(2, Math.floor(maximumTotalPoints / Math.max(bySeries.size, 1)))
  const sampled = []
  for (const series of bySeries.values()) {
    sampled.push(
      ...sampleEvenly(
        series.sort((left, right) => Date.parse(left.sampledAt) - Date.parse(right.sampledAt)),
        maximumPerSeries
      )
    )
  }
  return sampled.sort((left, right) => Date.parse(left.sampledAt) - Date.parse(right.sampledAt))
}

function appendHistory(quotes) {
  const cutoff = Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60_000
  const points = quotes
    .filter((quote) => (quote.status === 'OK' || quote.status === 'STALE') && Date.parse(quote.sampledAt) >= cutoff)
    .map(quoteToPoint)
  const unique = new Map(
    [...historyPoints, ...points]
      .filter((point) => Date.parse(point.sampledAt) >= cutoff)
      .map((point) => [historyKey(point), point])
  )
  historyPoints = compactHistory([...unique.values()])
  scheduleHistoryPersist()
}

async function loadHistory() {
  try {
    const parsed = JSON.parse(await readFile(HISTORY_PATH, 'utf8'))
    return Array.isArray(parsed)
      ? parsed.map((point) => ({
          ...point,
          regionCode:
            point?.source === 'VAST_AI'
              ? marketRegionCode('VAST', point.regionLabel || point.regionCode)
              : point?.regionCode,
        }))
      : []
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn(`[market] history load failed: ${error.message}`)
    return []
  }
}

async function persistHistory() {
  try {
    await mkdir(path.dirname(HISTORY_PATH), { recursive: true })
    const temporaryPath = `${HISTORY_PATH}.tmp`
    await writeFile(temporaryPath, JSON.stringify(historyPoints), 'utf8')
    try {
      await rename(temporaryPath, HISTORY_PATH)
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error?.code)) throw error
      await rm(HISTORY_PATH, { force: true })
      await rename(temporaryPath, HISTORY_PATH)
    }
  } catch (error) {
    console.warn(`[market] history persist failed: ${error.message}`)
  }
}

function scheduleHistoryPersist() {
  historyPersistPending = true
  if (historyPersistPromise) return
  historyPersistPromise = (async () => {
    while (historyPersistPending) {
      historyPersistPending = false
      await persistHistory()
    }
  })().finally(() => {
    historyPersistPromise = null
  })
}

async function refreshSnapshot(force = false) {
  if (!force && snapshotCache && Date.now() < nextRefreshAt) return snapshotCache
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const sampledAt = new Date().toISOString()
    const getDeployingEnabled = Boolean(process.env.GETDEPLOYING_API_KEY?.trim())
    const [rates, vastResult, getDeployingResult] = await Promise.all([
      Promise.all([getUsdCnyRate(), getCardHourRate()]),
      fetchVastOffers().then(
        (offers) => ({ offers }),
        (error) => ({ error })
      ),
      getDeployingEnabled
        ? getCachedGetDeployingOfferings().then(
            (cache) => cache,
            (error) => ({ error })
          )
        : Promise.resolve({ offerings: undefined }),
    ])
    const [usdCnyRateResult, cardHourCnyRateResult] = rates
    const usdCnyRate = usdCnyRateResult.value
    const cardHourCnyRate = cardHourCnyRateResult.value
    const previousVast = snapshotCache?.quotes?.filter((quote) => quote.source === 'VAST_AI') || []
    let vastQuotes
    if (vastResult.error) {
      console.warn(`[market] Vast.ai refresh failed: ${vastResult.error.message}`)
      vastQuotes = fallbackQuotes('VAST_AI', previousVast, sampledAt, safeErrorMessage('Vast.ai'))
    } else {
      vastQuotes = buildVastQuotes(vastResult.offers, usdCnyRate, cardHourCnyRate, sampledAt)
    }

    const previousGetDeploying =
      snapshotCache?.quotes?.filter((quote) => quote.source === 'GETDEPLOYING') || []
    let getDeployingQuotes
    if (!getDeployingEnabled) {
      const message = '需要在服务端配置 GETDEPLOYING_API_KEY。'
      getDeployingHealth = {
        ...getDeployingHealth,
        status: 'unconfigured',
        lastError: message,
        offeringCount: null,
      }
      getDeployingQuotes = buildGetDeployingUnconfiguredQuotes(sampledAt)
    } else if (getDeployingResult.error) {
      const message = getDeployingErrorMessage(getDeployingResult.error)
      console.warn(`[market] GetDeploying refresh failed: ${getDeployingResult.error.message}`)
      getDeployingHealth = {
        ...getDeployingHealth,
        status: [401, 403].includes(getDeployingResult.error?.status)
          ? 'authorization_error'
          : 'upstream_error',
        lastAttemptAt: sampledAt,
        lastError: message,
        offeringCount: null,
      }
      getDeployingQuotes = fallbackQuotes('GETDEPLOYING', previousGetDeploying, sampledAt, message)
    } else {
      getDeployingQuotes = buildGetDeployingQuotes(
        getDeployingResult.offerings,
        usdCnyRate,
        cardHourCnyRate,
        getDeployingResult.fetchedAt
      )
      const noMatchingOffers = getDeployingQuotes.length === 0
      const noMatchingOffersMessage =
        'GetDeploying 当前未返回这三个精确规格的独立供应商 AVAILABLE 按需报价。'
      getDeployingHealth = {
        status: noMatchingOffers ? 'no_matching_offers' : 'ok',
        lastAttemptAt: getDeployingResult.fetchedAt,
        lastSuccessAt: getDeployingResult.fetchedAt,
        lastError: noMatchingOffers ? noMatchingOffersMessage : null,
        offeringCount: getDeployingQuotes.length,
      }
      if (noMatchingOffers) {
        getDeployingQuotes = fallbackQuotes(
          'GETDEPLOYING',
          previousGetDeploying,
          sampledAt,
          noMatchingOffersMessage
        )
      }
    }
    const quotes = [...getDeployingQuotes, ...vastQuotes]
    const availableRegions = buildAvailableRegions(quotes)

    snapshotCache = {
      trackedModels: MODELS.map((model) => model.key),
      quotes,
      usdCnyRate,
      cardHourCnyRate,
      usdCnyRateUpdatedAt: usdCnyRateResult.updatedAt,
      cardHourCnyRateUpdatedAt: cardHourCnyRateResult.updatedAt,
      refreshIntervalSeconds: REFRESH_SECONDS,
      historySampleSeconds: REFRESH_SECONDS,
      historyRetentionDays: HISTORY_RETENTION_DAYS,
      generatedAt: sampledAt,
      availableRegions,
      availableRentalTerms: ['HOURLY'],
    }
    nextRefreshAt = Date.now() + REFRESH_SECONDS * 1000
    appendHistory(quotes)
    return snapshotCache
  })().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

function rangeMilliseconds(range) {
  return {
    '1h': 60 * 60_000,
    '6h': 6 * 60 * 60_000,
    '24h': 24 * 60 * 60_000,
    '7d': 7 * 24 * 60 * 60_000,
    '30d': 30 * 24 * 60 * 60_000,
    '90d': 90 * 24 * 60 * 60_000,
    '365d': 365 * 24 * 60 * 60_000,
  }[range]
}

function sameText(left, right) {
  return String(left || '').trim().toLocaleUpperCase('en-US') === String(right || '').trim().toLocaleUpperCase('en-US')
}

function filterMarketHistoryPoints(
  points,
  { model, range, rentalTerm = 'HOURLY', regions = [], vramMiB, formFactor, now = Date.now() }
) {
  const duration = rangeMilliseconds(range)
  if (!duration) throw new Error('不支持的历史时间范围')
  const cutoff = now - duration
  return points.filter(
    (point) =>
      Date.parse(point.sampledAt) >= cutoff &&
      [point.modelKey, point.gpuModel].some((value) => sameText(value, model)) &&
      sameText(point.rentalTerm || 'HOURLY', rentalTerm) &&
      (regions.length === 0 || regions.some((region) => sameText(region, point.regionCode))) &&
      (vramMiB === undefined || Math.abs(Number(point.vramMiB) - vramMiB) <= 512) &&
      (!formFactor || sameText(point.formFactor, formFactor))
  )
}

async function marketHistory(url) {
  const snapshot = await refreshSnapshot()
  const model = url.searchParams.get('model') || MODELS[0].key
  const range = url.searchParams.get('range') || '24h'
  const rentalTerm = url.searchParams.get('rentalTerm') || 'HOURLY'
  const regions = (url.searchParams.get('regions') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const vramMiB = finiteNumber(url.searchParams.get('vramMiB'))
  const formFactor = url.searchParams.get('formFactor')
  const points = filterMarketHistoryPoints(historyPoints, {
    model,
    range,
    rentalTerm,
    regions,
    vramMiB,
    formFactor,
  })
  return {
    gpuModel: model,
    range,
    points: limitHistoryResponse(points),
    usdCnyRate: snapshot.usdCnyRate,
    cardHourCnyRate: snapshot.cardHourCnyRate,
    usdCnyRateUpdatedAt: snapshot.usdCnyRateUpdatedAt,
    cardHourCnyRateUpdatedAt: snapshot.cardHourCnyRateUpdatedAt,
    rentalTerm,
    regions,
  }
}

function setCorsHeaders(request, response) {
  const origin = request.headers.origin
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function sendJson(response, status, body) {
  const content = JSON.stringify(body)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(content),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(content)
}

function buildMarketHealthData() {
  return {
    status: 'ok',
    vast: 'enabled',
    getDeploying: {
      configured: Boolean(process.env.GETDEPLOYING_API_KEY?.trim()),
      ...getDeployingHealth,
      configurationHint: process.env.GETDEPLOYING_API_KEY?.trim()
        ? null
        : '请在 companion 服务的 .env.market.local 中配置 GETDEPLOYING_API_KEY。',
    },
    refreshIntervalSeconds: REFRESH_SECONDS,
    minimumGetDeployingCacheSeconds: MINIMUM_REFRESH_SECONDS,
    getDeployingCacheSeconds: GETDEPLOYING_CACHE_SECONDS,
    getDeployingCacheExpiresAt:
      getDeployingOfferingsCache.expiresAt > 0 ? new Date(getDeployingOfferingsCache.expiresAt).toISOString() : null,
    cacheExpiresAt: nextRefreshAt > 0 ? new Date(nextRefreshAt).toISOString() : null,
    historyRetentionDays: HISTORY_RETENTION_DAYS,
    historyRetentionMinimumDays: MINIMUM_HISTORY_RETENTION_DAYS,
    historyRetentionMaximumDays: MAXIMUM_HISTORY_RETENTION_DAYS,
    supportedHistoryRanges: ['1h', '6h', '24h', '7d', '30d', '90d', '365d'],
    legacyAutoDlHistoryPoints: historyPoints.filter((point) => point?.source === 'AUTODL').length,
    historyPoints: historyPoints.length,
    generatedAt: snapshotCache?.generatedAt || null,
  }
}

async function handleRequest(request, response) {
  setCorsHeaders(request, response)
  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }
  if (request.method !== 'GET') {
    sendJson(response, 405, { code: 405, message: '仅支持 GET 请求', data: null })
    return
  }
  try {
    const url = new URL(request.url || '/', `http://${HOST}:${PORT}`)
    if (url.pathname === '/health') {
      sendJson(response, 200, {
        code: 0,
        message: 'success',
        data: buildMarketHealthData(),
      })
      return
    }
    if (url.pathname === '/api/compute/market-prices/latest') {
      sendJson(response, 200, { code: 0, message: 'success', data: await refreshSnapshot() })
      return
    }
    if (url.pathname === '/api/compute/market-prices/history') {
      sendJson(response, 200, { code: 0, message: 'success', data: await marketHistory(url) })
      return
    }
    sendJson(response, 404, { code: 404, message: '接口不存在', data: null })
  } catch (error) {
    console.error(`[market] request failed: ${error.message}`)
    sendJson(response, 500, { code: 500, message: '行情服务暂时不可用', data: null })
  }
}

export function startComputeMarketServer() {
  const server = createServer((request, response) => void handleRequest(request, response))
  server.listen(PORT, HOST, () => {
    console.log(`[market] KOD compute market API listening on http://${HOST}:${PORT}`)
    console.log(
      `[market] Vast.ai exact offers enabled; GetDeploying API ${
        process.env.GETDEPLOYING_API_KEY?.trim() ? 'configured' : 'not configured'
      }; market refresh ${REFRESH_SECONDS}s; GetDeploying cache ${GETDEPLOYING_CACHE_SECONDS}s`
    )
  })
  const timer = setInterval(() => void refreshSnapshot(true), REFRESH_SECONDS * 1000)
  timer.unref()
  void refreshSnapshot(true)
  return server
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startComputeMarketServer()
}

export {
  buildAvailableRegions,
  buildGetDeployingQuotes,
  buildGetDeployingUnconfiguredQuotes,
  buildMarketHealthData,
  buildVastQuotes,
  compactHistory,
  DEFAULT_HISTORY_RETENTION_DAYS,
  fallbackQuotes,
  fetchGetDeployingOfferings,
  filterMarketHistoryPoints,
  GETDEPLOYING_CACHE_SECONDS,
  getDeployingErrorMessage,
  HISTORY_RETENTION_DAYS,
  isVastProvider,
  limitHistoryResponse,
  marketRegionCode,
  MAXIMUM_HISTORY_RETENTION_DAYS,
  MINIMUM_REFRESH_SECONDS,
  MINIMUM_HISTORY_RETENTION_DAYS,
  MODELS,
  normalizeHistoryRetentionDays,
  normalizeGetDeployingOffering,
  normalizeVastOffer,
  rangeMilliseconds,
  sameGetDeployingModel,
}
