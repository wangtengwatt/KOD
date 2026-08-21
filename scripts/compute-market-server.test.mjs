import assert from 'node:assert/strict'
import test from 'node:test'

import {
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
  limitHistoryResponse,
  MAXIMUM_HISTORY_RETENTION_DAYS,
  MINIMUM_REFRESH_SECONDS,
  MINIMUM_HISTORY_RETENTION_DAYS,
  MODELS,
  marketRegionCode,
  normalizeHistoryRetentionDays,
  normalizeGetDeployingOffering,
  normalizeVastOffer,
  rangeMilliseconds,
  sameGetDeployingModel,
} from './compute-market-server.mjs'

const sampledAt = '2026-08-20T00:00:00.000Z'

function getDeployingOffering(overrides = {}) {
  const {
    provider: providerOverrides = {},
    configuration: configurationOverrides = {},
    pricing: pricingOverrides = {},
    status: statusOverrides = {},
    ...offeringOverrides
  } = overrides
  return {
    id: 'lambda-labs-gpu-1x-a100-pcie',
    external_id: 'gpu_1x_a100',
    ...offeringOverrides,
    provider: {
      id: 'lambda-labs',
      name: 'Lambda Labs',
      website: 'https://lambda.ai/',
      country: 'US',
      ...providerOverrides,
    },
    configuration: {
      gpu_model: 'nvidia-a100',
      gpu_count: 2,
      vram_per_gpu_gb: 40,
      interconnect: 'PCIe',
      ...configurationOverrides,
    },
    pricing: {
      currency: 'USD',
      billing_type: 'ON_DEMAND',
      hourly: 9.98,
      hourly_per_gpu: 1.25,
      monthly: 898.2,
      note: 'Pay as you go',
      ...pricingOverrides,
    },
    status: {
      availability: 'AVAILABLE',
      last_verified: '2026-08-19T23:45:00.000Z',
      ...statusOverrides,
    },
  }
}

test('normalizes a verified exact-spec Vast offer to a single-GPU hourly price', () => {
  const offer = normalizeVastOffer(
    {
      gpu_name: 'A100 PCIE',
      gpu_ram: 40960,
      num_gpus: 2,
      dph_total: 1.4,
      gpu_frac: 1,
      rentable: true,
      verification: 'verified',
      geolocation: 'Japan, JP',
      gpu_ids: [11, 12],
    },
    MODELS[0]
  )

  assert.equal(offer.pricePerGpuHour, 0.7)
  assert.deepEqual(offer.gpuIds, ['11', '12'])
  assert.equal(offer.geolocation, 'Japan, JP')
})

test('maps only confirmed Vast VRAM values to the canonical frontend specifications', () => {
  const cases = [
    { model: MODELS[0], vastVramMiB: 40960, canonicalVramMiB: 40960 },
    { model: MODELS[1], vastVramMiB: 32768, canonicalVramMiB: 32768 },
    { model: MODELS[2], vastVramMiB: 15360, canonicalVramMiB: 16384 },
  ]

  for (const { model, vastVramMiB, canonicalVramMiB } of cases) {
    const offer = {
      gpu_name: model.vastName,
      gpu_ram: vastVramMiB,
      num_gpus: 1,
      dph_total: 0.5,
      gpu_frac: 1,
      rentable: true,
      verification: 'verified',
      geolocation: 'Japan, JP',
    }
    assert.equal(normalizeVastOffer(offer, model)?.sourceVramMiB, vastVramMiB)
    assert.equal(normalizeVastOffer({ ...offer, gpu_ram: vastVramMiB + 1 }, model), undefined)

    const quote = buildVastQuotes([offer], undefined, undefined, sampledAt).find(
      (candidate) => candidate.modelKey === model.key && candidate.status === 'OK'
    )
    assert.equal(quote.vramMiB, canonicalVramMiB)
    assert.equal(quote.sourceVramMiB, vastVramMiB)
  }
})

test('rejects Vast offers with a different VRAM specification', () => {
  assert.equal(
    normalizeVastOffer(
      {
        gpu_name: 'A100 PCIE',
        gpu_ram: 81920,
        num_gpus: 1,
        dph_total: 0.5,
        rentable: true,
        verification: 'verified',
      },
      MODELS[0]
    ),
    undefined
  )
})

test('does not double-count the same Vast GPU ids across bundles', () => {
  const offers = [0.8, 0.7].map((price) => ({
    gpu_name: 'A100 PCIE',
    gpu_ram: 40960,
    num_gpus: 2,
    dph_total: price * 2,
    gpu_frac: 1,
    rentable: true,
    verification: 'verified',
    geolocation: 'Japan, JP',
    gpu_ids: [11, 12],
  }))
  const quote = buildVastQuotes(offers, 7, 1, sampledAt).find(
    (candidate) => candidate.modelKey === MODELS[0].key && candidate.status === 'OK'
  )

  assert.equal(quote.priceUsdPerGpuHour, 0.7)
  assert.ok(Math.abs(quote.priceCnyPerGpuHour - 4.9) < 1e-9)
  assert.equal(quote.availableGpuCount, 2)
  assert.equal(quote.regionCode, 'VAST:JAPAN-JP')
})

test('keeps Vast USD prices without inventing CNY or card-hour conversions when rates are unavailable', () => {
  const quotes = buildVastQuotes(
    [
      {
        gpu_name: 'A100 PCIE',
        gpu_ram: 40960,
        num_gpus: 1,
        dph_total: 0.7,
        gpu_frac: 1,
        rentable: true,
        verification: 'verified',
        geolocation: 'Japan, JP',
        gpu_ids: [11],
      },
    ],
    undefined,
    undefined,
    sampledAt
  )
  const quote = quotes.find((candidate) => candidate.status === 'OK')

  assert.equal(quote.priceUsdPerGpuHour, 0.7)
  assert.equal(quote.priceCnyPerGpuHour, undefined)
  assert.equal(quote.cardHoursPerGpuHour, undefined)
})

test('creates comma-safe stable region codes for URL filters', () => {
  assert.equal(marketRegionCode('VAST', 'Japan, JP'), 'VAST:JAPAN-JP')
  assert.equal(marketRegionCode('GETDEPLOYING', 'Lambda Labs'), 'GETDEPLOYING:LAMBDA-LABS')
})

test('maps a GetDeploying exact offer without treating total price or headquarters as inventory or region', () => {
  const offering = getDeployingOffering()
  assert.equal(sameGetDeployingModel(offering, MODELS[0]), true)

  const quotes = buildGetDeployingQuotes([offering], 7, 0.5, sampledAt)
  assert.equal(quotes.length, 1)
  const quote = quotes[0]

  assert.equal(quote.source, 'GETDEPLOYING')
  assert.equal(quote.sourceLabel, 'GetDeploying')
  assert.equal(quote.priceUsdPerGpuHour, 1.25)
  assert.equal(quote.priceCnyPerGpuHour, 8.75)
  assert.equal(quote.cardHoursPerGpuHour, 17.5)
  assert.equal(quote.originalBillingPrice, 1.25)
  assert.equal(quote.originalBillingUnit, 'HOUR')
  assert.equal(quote.availableGpuCount, undefined)
  assert.equal(quote.regionCode, 'GETDEPLOYING:lambda-labs')
  assert.equal(quote.regionLabel, 'Lambda Labs · 总部 US')
  assert.equal(quote.providerId, 'lambda-labs')
  assert.equal(quote.providerName, 'Lambda Labs')
  assert.equal(quote.providerCountry, 'US')
  assert.equal(quote.externalOfferingId, 'gpu_1x_a100')
  assert.equal(quote.availabilityStatus, 'AVAILABLE')
  assert.equal(quote.providerUpdatedAt, '2026-08-19T23:45:00.000Z')
  assert.notEqual(quote.providerUpdatedAt, sampledAt)
  assert.match(quote.priceCondition, /总部国家不代表机房地区/)
})

test('strictly filters GetDeploying billing, availability, VRAM and available form factor locally', () => {
  const candidates = [
    getDeployingOffering({ configuration: { vram_per_gpu_gb: 80 } }),
    getDeployingOffering({ configuration: { interconnect: 'SXM4' } }),
    getDeployingOffering({ pricing: { billing_type: 'RESERVATION' } }),
    getDeployingOffering({ status: { availability: 'WAITLIST' } }),
    getDeployingOffering({ pricing: { currency: 'EUR' } }),
  ]
  assert.equal(sameGetDeployingModel(candidates[0], MODELS[0]), false)
  assert.equal(sameGetDeployingModel(candidates[1], MODELS[0]), false)
  assert.equal(buildGetDeployingQuotes(candidates, 7, 1, sampledAt).length, 0)

  const v100 = getDeployingOffering({
    id: 'provider-v100-32',
    configuration: { gpu_model: 'nvidia-v100', vram_per_gpu_gb: 32, interconnect: 'SXM2' },
  })
  const t4 = getDeployingOffering({
    id: 'provider-t4-16',
    configuration: { gpu_model: 'nvidia-t4', vram_per_gpu_gb: 16, interconnect: 'PCIe' },
  })
  assert.equal(normalizeGetDeployingOffering(v100, MODELS[1])?.formFactor, 'SXM')
  assert.equal(normalizeGetDeployingOffering(t4, MODELS[2])?.formFactor, 'PCIE')
  assert.equal(buildGetDeployingQuotes([t4], 7, 1, sampledAt)[0]?.vramMiB, 16384)

  const documentedPcieOnly = getDeployingOffering({
    configuration: { interconnect: null, interconnect_bandwidth_gbps: null },
  })
  const ambiguousMissingInterconnect = getDeployingOffering({
    configuration: { interconnect: '', interconnect_bandwidth_gbps: 600 },
  })
  assert.equal(sameGetDeployingModel(documentedPcieOnly, MODELS[0]), true)
  assert.equal(normalizeGetDeployingOffering(documentedPcieOnly, MODELS[0])?.formFactor, 'PCIE')
  assert.equal(sameGetDeployingModel(ambiguousMissingInterconnect, MODELS[0]), false)
})

test('excludes Vast.ai offers from the GetDeploying source to avoid self-comparison and double counting', () => {
  const vast = getDeployingOffering({
    id: 'vast-cheapest',
    provider: { id: 'vast-ai', name: 'Vast.ai', country: 'US' },
    pricing: { hourly_per_gpu: 0.01 },
  })
  const independent = getDeployingOffering()
  const secondIndependent = getDeployingOffering({
    id: 'lambda-labs-gpu-8x-a100-pcie',
    external_id: 'gpu_8x_a100',
    pricing: { hourly_per_gpu: 2.25 },
  })
  const quotes = buildGetDeployingQuotes([vast, independent, secondIndependent], 7, 1, sampledAt)

  assert.equal(quotes.length, 2)
  assert.ok(quotes.every((quote) => quote.providerId === 'lambda-labs'))
  assert.ok(quotes.every((quote) => quote.sampleSize === 2))
  assert.ok(quotes.every((quote) => quote.medianPricePerGpuHour === 1.75))
  assert.equal(quotes[0].priceUsdPerGpuHour, 1.25)
  assert.equal(buildAvailableRegions(quotes).length, 1)

  const history = compactHistory(quotes, Date.parse(sampledAt))
  assert.equal(history.length, 2)
  assert.deepEqual(
    history.map((point) => point.externalOfferingId).sort(),
    ['gpu_1x_a100', 'gpu_8x_a100']
  )
})

test('returns explicit UNCONFIGURED GetDeploying rows without an API key', () => {
  const quotes = buildGetDeployingUnconfiguredQuotes(sampledAt)
  assert.equal(quotes.length, MODELS.length)
  assert.ok(quotes.every((quote) => quote.source === 'GETDEPLOYING'))
  assert.ok(quotes.every((quote) => quote.status === 'UNCONFIGURED'))
  assert.ok(quotes.every((quote) => quote.errorMessage.includes('GETDEPLOYING_API_KEY')))
  assert.ok(quotes.every((quote) => quote.providerUpdatedAt === undefined))
})

test('fetches every GetDeploying page with server-side Bearer auth and restrictive upstream filters', async () => {
  const requests = []
  const fetchImpl = async (url, options) => {
    requests.push({ url: new URL(url), options })
    const page = Number(new URL(url).searchParams.get('page'))
    return new Response(
      JSON.stringify({
        page,
        page_size: 100,
        page_count: 2,
        total: 2,
        data: [getDeployingOffering({ id: `offer-${page}` })],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const offerings = await fetchGetDeployingOfferings({ apiKey: 'server-secret', fetchImpl })
  assert.equal(offerings.length, 2)
  assert.equal(requests.length, 2)
  for (const request of requests) {
    assert.equal(request.options.method, 'GET')
    assert.equal(request.options.headers.Authorization, 'Bearer server-secret')
    assert.equal(request.url.searchParams.get('billing_type'), 'ON_DEMAND')
    assert.equal(request.url.searchParams.get('availability'), 'AVAILABLE')
    assert.equal(request.url.searchParams.get('page_size'), '100')
    assert.deepEqual(request.url.searchParams.get('gpu_model')?.split(','), [
      'nvidia-a100',
      'nvidia-v100',
      'nvidia-t4',
    ])
  }

  await assert.rejects(
    fetchGetDeployingOfferings({
      apiKey: 'server-secret',
      fetchImpl: async () =>
        new Response(JSON.stringify({ page: 2, page_count: 2, data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    }),
    /page mismatch/
  )
  await assert.rejects(
    fetchGetDeployingOfferings({
      apiKey: 'server-secret',
      fetchImpl: async () =>
        new Response(JSON.stringify({ page: 1, page_count: 101, data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    }),
    /safe pagination limit/
  )
})

test('reports GetDeploying 401 and 403 responses as authorization errors without exposing the key', async () => {
  for (const status of [401, 403]) {
    await assert.rejects(
      fetchGetDeployingOfferings({
        apiKey: 'do-not-log-this-key',
        fetchImpl: async () => new Response('{}', { status }),
      }),
      (error) => {
        assert.equal(error.status, status)
        assert.doesNotMatch(error.message, /do-not-log-this-key/)
        assert.match(getDeployingErrorMessage(error), new RegExp(`HTTP ${status}`))
        return true
      }
    )
  }

  const fallback = fallbackQuotes(
    'GETDEPLOYING',
    buildGetDeployingUnconfiguredQuotes(sampledAt),
    '2026-08-20T00:01:00.000Z',
    'GetDeploying API 授权失败（HTTP 401）'
  )
  assert.ok(fallback.every((quote) => quote.status === 'UNAVAILABLE'))
  assert.ok(fallback.every((quote) => quote.errorMessage.includes('HTTP 401')))
})

test('enforces an independent GetDeploying cache of at least fifteen minutes', () => {
  assert.equal(MINIMUM_REFRESH_SECONDS, 15 * 60)
  assert.ok(GETDEPLOYING_CACHE_SECONDS >= MINIMUM_REFRESH_SECONDS)
})

test('keeps legacy AutoDL history isolated from new GetDeploying history', () => {
  const common = {
    modelKey: MODELS[0].key,
    gpuModel: MODELS[0].label,
    sourceModel: MODELS[0].getDeployingSlug,
    vramMiB: MODELS[0].vramMiB,
    formFactor: MODELS[0].formFactor,
    regionCode: 'legacy-or-current',
    rentalTerm: 'HOURLY',
    quoteType: 'OFFICIAL_LIST',
    sampledAt,
  }
  const compacted = compactHistory(
    [
      { ...common, source: 'AUTODL' },
      { ...common, source: 'GETDEPLOYING' },
    ],
    Date.parse(sampledAt)
  )
  assert.deepEqual(
    compacted.map((point) => point.source).sort(),
    ['AUTODL', 'GETDEPLOYING']
  )
})

test('accepts only supported history ranges', () => {
  assert.equal(rangeMilliseconds('1h'), 60 * 60_000)
  assert.equal(rangeMilliseconds('30d'), 30 * 24 * 60 * 60_000)
  assert.equal(rangeMilliseconds('90d'), 90 * 24 * 60 * 60_000)
  assert.equal(rangeMilliseconds('365d'), 365 * 24 * 60 * 60_000)
  assert.equal(rangeMilliseconds('366d'), undefined)
})

test('filters 90-day and 365-day history windows without backfilling missing dates', () => {
  const now = Date.parse(sampledAt)
  const point = (daysAgo) => ({
    source: 'VAST_AI',
    modelKey: MODELS[0].key,
    gpuModel: MODELS[0].label,
    sourceModel: MODELS[0].vastName,
    vramMiB: MODELS[0].vramMiB,
    formFactor: MODELS[0].formFactor,
    regionCode: 'VAST:JAPAN-JP',
    rentalTerm: 'HOURLY',
    quoteType: 'VERIFIED_MIN',
    sampledAt: new Date(now - daysAgo * 24 * 60 * 60_000).toISOString(),
  })
  const history = [point(89), point(91), point(364), point(366)]
  const filters = {
    model: MODELS[0].key,
    rentalTerm: 'HOURLY',
    regions: [],
    vramMiB: MODELS[0].vramMiB,
    formFactor: MODELS[0].formFactor,
    now,
  }

  assert.deepEqual(
    filterMarketHistoryPoints(history, { ...filters, range: '90d' }).map(({ sampledAt }) => sampledAt),
    [point(89).sampledAt]
  )
  assert.deepEqual(
    filterMarketHistoryPoints(history, { ...filters, range: '365d' }).map(({ sampledAt }) => sampledAt),
    [point(89).sampledAt, point(91).sampledAt, point(364).sampledAt]
  )
  assert.throws(() => filterMarketHistoryPoints(history, { ...filters, range: '366d' }), /不支持/)
})

test('defaults history retention to one year, clamps configuration, and reports the active value in health', () => {
  assert.equal(DEFAULT_HISTORY_RETENTION_DAYS, 365)
  assert.equal(MINIMUM_HISTORY_RETENTION_DAYS, 30)
  assert.equal(MAXIMUM_HISTORY_RETENTION_DAYS, 730)
  assert.equal(normalizeHistoryRetentionDays(undefined), 365)
  assert.equal(normalizeHistoryRetentionDays('invalid'), 365)
  assert.equal(normalizeHistoryRetentionDays('7'), MINIMUM_HISTORY_RETENTION_DAYS)
  assert.equal(normalizeHistoryRetentionDays('400'), 400)
  assert.equal(normalizeHistoryRetentionDays('9999'), MAXIMUM_HISTORY_RETENTION_DAYS)

  const health = buildMarketHealthData()
  assert.equal(health.historyRetentionDays, HISTORY_RETENTION_DAYS)
  assert.equal(health.historyRetentionMinimumDays, MINIMUM_HISTORY_RETENTION_DAYS)
  assert.equal(health.historyRetentionMaximumDays, MAXIMUM_HISTORY_RETENTION_DAYS)
  assert.deepEqual(health.supportedHistoryRanges, ['1h', '6h', '24h', '7d', '30d', '90d', '365d'])
})

test('retention compaction keeps only real samples inside the configured window', () => {
  const now = Date.parse(sampledAt)
  const common = {
    source: 'VAST_AI',
    modelKey: MODELS[0].key,
    gpuModel: MODELS[0].label,
    sourceModel: MODELS[0].vastName,
    vramMiB: MODELS[0].vramMiB,
    formFactor: MODELS[0].formFactor,
    regionCode: 'VAST:JAPAN-JP',
    rentalTerm: 'HOURLY',
    quoteType: 'VERIFIED_MIN',
  }
  const retained = {
    ...common,
    sampledAt: new Date(now - (HISTORY_RETENTION_DAYS - 1) * 24 * 60 * 60_000).toISOString(),
  }
  const expired = {
    ...common,
    sampledAt: new Date(now - (HISTORY_RETENTION_DAYS + 1) * 24 * 60 * 60_000).toISOString(),
  }

  assert.deepEqual(compactHistory([expired, retained], now), [retained])
})

test('keeps recent minute samples and downsamples older history per series', () => {
  const now = Date.parse(sampledAt)
  const points = Array.from({ length: 30 * 60 + 1 }, (_, index) => ({
    source: 'VAST_AI',
    modelKey: MODELS[0].key,
    gpuModel: MODELS[0].label,
    sourceModel: MODELS[0].vastName,
    vramMiB: MODELS[0].vramMiB,
    formFactor: MODELS[0].formFactor,
    regionCode: 'VAST:JAPAN-JP',
    rentalTerm: 'HOURLY',
    quoteType: 'VERIFIED_MIN',
    sampledAt: new Date(now - (30 * 60 - index) * 60_000).toISOString(),
  }))

  const compacted = compactHistory(points, now)
  assert.ok(compacted.length >= 24 * 60)
  assert.ok(compacted.length < 1_500)
  assert.equal(compacted.at(-1).sampledAt, sampledAt)
})

test('samples long history responses across the full requested range instead of taking only the tail', () => {
  const points = Array.from({ length: 1_001 }, (_, index) => ({
    source: 'VAST_AI',
    modelKey: MODELS[0].key,
    gpuModel: MODELS[0].label,
    sourceModel: MODELS[0].vastName,
    vramMiB: MODELS[0].vramMiB,
    formFactor: MODELS[0].formFactor,
    regionCode: 'VAST:JAPAN-JP',
    rentalTerm: 'HOURLY',
    quoteType: 'VERIFIED_MIN',
    sampledAt: new Date(index * 60_000).toISOString(),
  }))

  const sampled = limitHistoryResponse(points, 100)
  assert.equal(sampled.length, 100)
  assert.equal(sampled[0].sampledAt, points[0].sampledAt)
  assert.equal(sampled.at(-1).sampledAt, points.at(-1).sampledAt)
})
