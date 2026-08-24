import { describe, expect, it } from 'vitest'
import type { CardHourTrade, ComputeMarketPricePoint, ComputeMarketPriceQuote } from '../computeCenter'
import {
  calculateMarketFreshness,
  canCompareMarketInstruments,
  evaluateMarketCapabilities,
  HISTORY_REFRESH_MS,
  isSameMarketFamily,
  isTrustedMarketSourceUrl,
  LIVE_REFRESH_MS,
  type MarketDeliveryNode,
  type MarketInstrumentIdentity,
  mergeMarketHistoryWithLatest,
  summarizeCompletedCardHourTrades,
} from './marketIntelligence'

const NOW = '2026-08-21T12:00:00.000Z'

function historyPoint(sampledAt: string, price: number, source: ComputeMarketPricePoint['source'] = 'VAST_AI') {
  return {
    source,
    gpuModel: 'NVIDIA H100',
    quoteType: 'MEDIAN_AVAILABLE',
    priceUsdPerGpuHour: price,
    priceCnyPerGpuHour: price * 7,
    cardHoursPerGpuHour: price * 7,
    sampleSize: 8,
    sampledAt,
  } satisfies ComputeMarketPricePoint
}

function latestQuote(overrides: Partial<ComputeMarketPriceQuote> = {}): ComputeMarketPriceQuote {
  return {
    source: 'VAST_AI',
    sourceLabel: 'Vast.ai',
    gpuModel: 'NVIDIA H100',
    sourceUrl: 'https://vast.ai',
    status: 'OK',
    quoteType: 'MEDIAN_AVAILABLE',
    priceUsdPerGpuHour: 3,
    priceCnyPerGpuHour: 21,
    cardHoursPerGpuHour: 21,
    sampleSize: 10,
    sampledAt: '2026-08-21T11:59:59.000Z',
    ...overrides,
  }
}

function instrument(overrides: Partial<MarketInstrumentIdentity> = {}): MarketInstrumentIdentity {
  return {
    instrumentId: 'h100-september',
    category: 'GPU_REFERENCE',
    familyId: 'nvidia-h100-hk',
    priceCurrency: 'CNY',
    priceUnit: 'GPU_HOUR',
    provider: 'KOD',
    gpuModel: 'NVIDIA H100',
    region: 'HK',
    runtime: 'CUDA 12',
    deliveryAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

function deliveryNode(id: string, deliveryAt: string, overrides: Partial<MarketDeliveryNode> = {}): MarketDeliveryNode {
  return {
    ...instrument({ instrumentId: id, deliveryAt }),
    isReal: true,
    deliveryAt,
    ...overrides,
  }
}

function trade(overrides: Partial<CardHourTrade> = {}): CardHourTrade {
  return {
    id: 1,
    tradeNo: 'trade-1',
    marketType: 'IDLE_TRANSFER',
    assetType: 'SPECIFIC',
    gpuModel: 'NVIDIA H100',
    quantity: 2,
    unitPrice: 5,
    priceCurrency: 'CNY',
    totalPrice: 10,
    buyerFee: 0.1,
    sellerFee: 0.1,
    status: 'COMPLETED',
    completedAt: '2026-08-21T11:00:00.000Z',
    ...overrides,
  }
}

describe('market freshness', () => {
  it('uses the documented live and history refresh intervals', () => {
    expect(LIVE_REFRESH_MS).toBe(5_000)
    expect(HISTORY_REFRESH_MS).toBe(60_000)
  })

  it('moves through fresh, stale, and blocked at the exact boundaries', () => {
    expect(calculateMarketFreshness({ sampledAt: '2026-08-21T11:59:50.000Z', now: NOW })).toBe('FRESH')
    expect(calculateMarketFreshness({ sampledAt: '2026-08-21T11:59:49.999Z', now: NOW })).toBe('STALE')
    expect(calculateMarketFreshness({ sampledAt: '2026-08-21T11:59:00.000Z', now: NOW })).toBe('BLOCKED')
  })

  it('prefers sampledAt and falls back to generatedAt only when sampledAt is absent', () => {
    expect(
      calculateMarketFreshness({
        sampledAt: '2026-08-21T11:58:00.000Z',
        generatedAt: '2026-08-21T12:00:00.000Z',
        now: NOW,
      })
    ).toBe('BLOCKED')
    expect(calculateMarketFreshness({ generatedAt: '2026-08-21T11:59:55.000Z', now: NOW })).toBe('FRESH')
  })

  it('returns unknown for missing, malformed, or implausibly future timestamps', () => {
    expect(calculateMarketFreshness({ now: NOW })).toBe('UNKNOWN')
    expect(calculateMarketFreshness({ sampledAt: 'not-a-date', generatedAt: NOW, now: NOW })).toBe('UNKNOWN')
    expect(calculateMarketFreshness({ sampledAt: '2026-08-21T12:00:06.000Z', now: NOW })).toBe('UNKNOWN')
    expect(calculateMarketFreshness({ sampledAt: NOW, now: 'bad-now' })).toBe('UNKNOWN')
  })
})

describe('market history merging', () => {
  it('merges, de-duplicates by source/model/instant, sorts, and lets the latest quote replace a duplicate', () => {
    const original = [
      historyPoint('2026-08-21T11:59:58.000Z', 2),
      historyPoint('2026-08-21T11:59:57.000Z', 1),
      historyPoint('2026-08-21T11:59:58.000Z', 2.5),
    ]
    const merged = mergeMarketHistoryWithLatest(
      original,
      latestQuote({ sampledAt: '2026-08-21T11:59:58.000Z', priceUsdPerGpuHour: 4 })
    )

    expect(merged.map(({ sampledAt }) => sampledAt)).toEqual(['2026-08-21T11:59:57.000Z', '2026-08-21T11:59:58.000Z'])
    expect(merged[1].priceUsdPerGpuHour).toBe(4)
    expect(original[0].priceUsdPerGpuHour).toBe(2)
  })

  it('keeps equal-time points in stable source order and removes malformed runtime points', () => {
    const invalid = historyPoint('invalid', 99)
    const merged = mergeMarketHistoryWithLatest([
      historyPoint('2026-08-21T11:59:57.000Z', 1, 'AKAMAI'),
      historyPoint('2026-08-21T11:59:57.000Z', 2, 'VAST_AI'),
      invalid,
    ])
    expect(merged.map(({ source }) => source)).toEqual(['AKAMAI', 'VAST_AI'])
  })

  it('does not fabricate a point from a quote with missing values or no quote status', () => {
    expect(mergeMarketHistoryWithLatest([], latestQuote({ sampleSize: undefined }))).toEqual([])
    expect(mergeMarketHistoryWithLatest([], latestQuote({ status: 'NO_QUOTE' }))).toEqual([])
  })
})

describe('completed card-hour trades', () => {
  it('uses only exact COMPLETED facts, preserves the real list length, and never adds a side', () => {
    const summary = summarizeCompletedCardHourTrades([
      trade(),
      trade({ id: 2, tradeNo: 'trade-2', status: 'PENDING', quantity: 100, totalPrice: 500 }),
      trade({ id: 3, tradeNo: 'trade-3', status: 'completed' }),
    ])
    expect(summary.tradeCount).toBe(1)
    expect(summary.completedTrades).toHaveLength(1)
    expect(summary.completedTrades[0]).not.toHaveProperty('side')
    expect(summary.aggregates).toEqual([
      {
        assetType: 'SPECIFIC',
        gpuModel: 'NVIDIA H100',
        priceCurrency: 'CNY',
        tradeCount: 1,
        quantity: 2,
        notional: 10,
        volumeWeightedAveragePrice: 5,
      },
    ])
  })

  it('groups incompatible families and currencies instead of adding their values together', () => {
    const summary = summarizeCompletedCardHourTrades([
      trade(),
      trade({ id: 2, tradeNo: 'trade-2', gpuModel: 'NVIDIA A100', quantity: 3, unitPrice: 4, totalPrice: 12 }),
      trade({ id: 3, tradeNo: 'trade-3', priceCurrency: 'CARD_HOUR', quantity: 4, unitPrice: 2, totalPrice: 8 }),
    ])
    expect(summary.aggregates).toHaveLength(3)
  })

  it('returns no aggregate rather than a synthetic zero when completed numeric data is invalid', () => {
    const summary = summarizeCompletedCardHourTrades([trade({ quantity: Number.NaN })])
    expect(summary.tradeCount).toBe(0)
    expect(summary.aggregates).toEqual([])
  })
})

describe('market family comparison', () => {
  it('allows two distinct instruments in the same normalized family and unit', () => {
    const september = instrument()
    const october = instrument({
      instrumentId: 'h100-october',
      familyId: ' NVIDIA-H100-HK ',
      provider: 'kod',
      gpuModel: 'nvidia   h100',
      region: 'hk',
      runtime: 'cuda 12',
      deliveryAt: '2026-10-01T00:00:00.000Z',
    })
    expect(isSameMarketFamily(september, october)).toBe(true)
    expect(canCompareMarketInstruments([september, october])).toBe(true)
  })

  it('rejects a different family, unit, or duplicate instrument', () => {
    expect(isSameMarketFamily(instrument(), instrument({ familyId: 'a100-hk' }))).toBe(false)
    expect(isSameMarketFamily(instrument(), instrument({ priceUnit: 'CARD_HOUR' }))).toBe(false)
    expect(canCompareMarketInstruments([instrument(), instrument()])).toBe(false)
  })
})

describe('market capability gates', () => {
  const realDeliveries = [
    deliveryNode('h100-september', '2026-09-01T00:00:00.000Z'),
    deliveryNode('h100-october', '2026-10-01T00:00:00.000Z'),
  ]

  it('keeps P2 facts disabled for simulated, one-sided, or incomparable evidence', () => {
    const gate = evaluateMarketCapabilities({
      trades: { provenance: 'SIMULATED', count: 20 },
      orderBook: { provenance: 'REAL', bidLevels: 5, askLevels: 0, sequenced: true },
      comparisonCandidates: [instrument(), instrument({ instrumentId: 'a100', familyId: 'a100-hk' })],
      deliveryNodes: [
        realDeliveries[0],
        deliveryNode('a100-october', '2026-10-01T00:00:00.000Z', { familyId: 'a100-hk' }),
      ],
    })
    expect(gate.p2.recentTrades.enabled).toBe(false)
    expect(gate.p2.orderBook.enabled).toBe(false)
    expect(gate.p2.comparison.enabled).toBe(false)
    expect(gate.p2.termStructure.enabled).toBe(false)
  })

  it('enables P2 only when the required real evidence exists', () => {
    const gate = evaluateMarketCapabilities({
      trades: { provenance: 'REAL', count: 1 },
      orderBook: { provenance: 'REAL', bidLevels: 1, askLevels: 1, sequenced: true },
      comparisonCandidates: realDeliveries,
      deliveryNodes: realDeliveries,
    })
    expect(Object.values(gate.p2).every(({ enabled }) => enabled)).toBe(true)
  })

  it('keeps all P3 features closed without standardized contracts and real settlement infrastructure', () => {
    const gate = evaluateMarketCapabilities({
      trades: { provenance: 'REAL', count: 100 },
      orderBook: { provenance: 'REAL', bidLevels: 5, askLevels: 5, sequenced: true },
      deliveryNodes: realDeliveries,
      standardizedContracts: false,
      matchingEngine: 'SIMULATED',
      positions: 'UNKNOWN',
      riskControls: 'UNKNOWN',
      settlement: 'SIMULATED',
    })
    expect(gate.p3.futuresTerminology.enabled).toBe(false)
    expect(gate.p3.openInterest.enabled).toBe(false)
    expect(gate.p3.trading.enabled).toBe(false)
    expect(gate.p3.trading.missing).toContain('REAL_SETTLEMENT')
  })

  it('enables P3 only with the complete real-market evidence chain', () => {
    const gate = evaluateMarketCapabilities({
      trades: { provenance: 'REAL', count: 100 },
      orderBook: { provenance: 'REAL', bidLevels: 5, askLevels: 5, sequenced: true },
      deliveryNodes: realDeliveries,
      standardizedContracts: true,
      matchingEngine: 'REAL',
      positions: 'REAL',
      riskControls: 'REAL',
      settlement: 'REAL',
    })
    expect(Object.values(gate.p3).every(({ enabled }) => enabled)).toBe(true)
  })
})

describe('trusted market source URLs', () => {
  it.each([
    'https://vast.ai/',
    'https://console.vast.ai/offers',
    'https://akamai.com/',
    'https://cloud.akamai.com/products/cloud-computing',
    'https://docs.cloud.akamai.com/path',
    'https://www.linode.com/products/gpu/',
    'https://kod.kai.com/market/source',
    'https://prices.kod.kai.com/v2/quotes',
  ])('allows a trusted HTTPS source: %s', (url) => {
    expect(isTrustedMarketSourceUrl(url)).toBe(true)
  })

  it.each([
    'http://vast.ai',
    'https://user:password@vast.ai',
    'https://vast.ai.evil.example',
    'https://evil.example/?next=https://vast.ai',
    'https://notvast.ai',
    ' https://vast.ai',
    'not a url',
    '',
  ])('rejects an untrusted or ambiguous source: %s', (url) => {
    expect(isTrustedMarketSourceUrl(url)).toBe(false)
  })
})
