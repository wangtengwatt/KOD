import { describe, expect, it } from 'vitest'
import {
  deriveTrustedTradingCapability,
  marketV2CapabilitiesSchema,
  marketV2InstrumentCatalogSchema,
  marketV2InstrumentSchema,
  marketV2PriceSchema,
  marketV2SnapshotSchema,
  marketV2StreamEventSchema,
} from './marketV2Contracts'

function capabilities(overrides: Record<string, unknown> = {}) {
  return {
    history: true,
    stream: true,
    tradeTape: false,
    supplyDepth: false,
    twoSidedOrderBook: false,
    sequencedOrderBook: false,
    comparison: true,
    termStructure: false,
    tradeEntry: false,
    standardizedContracts: false,
    matchingEngine: false,
    positions: false,
    riskControls: false,
    clearing: false,
    settlement: false,
    ...overrides,
  }
}

function instrument(overrides: Record<string, unknown> = {}) {
  return {
    instrumentId: 'gpu-ref:h100:global:vast-ai',
    marketKind: 'GPU_RENTAL_REFERENCE',
    displayName: 'H100 全球参考价',
    gpuModel: 'H100',
    region: 'GLOBAL',
    runtime: null,
    delivery: 'ON_DEMAND',
    currency: 'USD',
    priceUnit: 'USD_PER_GPU_HOUR',
    dataMode: 'REFERENCE_QUOTE',
    capabilities: capabilities(),
    ...overrides,
  }
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '2.0',
    instrumentId: 'gpu-ref:h100:global:vast-ai',
    sequence: 12_887,
    status: 'OK',
    dataMode: 'REFERENCE_QUOTE',
    price: { value: '2.1500', currency: 'USD', unit: 'USD_PER_GPU_HOUR' },
    convertedPrices: [
      {
        value: '15.4200',
        currency: 'CNY',
        unit: 'CNY_PER_GPU_HOUR',
        rateVersion: 'usd-cny:2026-08-21T08:00:00Z',
      },
    ],
    sampleSize: 31,
    change24h: null,
    observedAt: '2026-08-21T07:59:40Z',
    receivedAt: '2026-08-21T07:59:41Z',
    generatedAt: '2026-08-21T08:00:00Z',
    lastSuccessAt: '2026-08-21T07:59:41Z',
    provenance: {
      sourceId: 'VAST_AI',
      sourceLabel: 'Vast.ai',
      method: 'MEDIAN_AVAILABLE',
      sourceUrl: 'https://cloud.vast.ai/',
    },
    ...overrides,
  }
}

function streamEvent(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '2.0',
    eventId: 'evt_01J5',
    eventType: 'QUOTE_UPDATED',
    instrumentId: 'gpu-ref:h100:global:vast-ai',
    sequence: 12_888,
    observedAt: '2026-08-21T08:00:05Z',
    generatedAt: '2026-08-21T08:00:06Z',
    payload: {
      status: 'OK',
      dataMode: 'REFERENCE_QUOTE',
      price: { value: '2.1600', currency: 'USD', unit: 'USD_PER_GPU_HOUR' },
      sampleSize: 32,
    },
    ...overrides,
  }
}

describe('market v2 instruments', () => {
  it('parses the PRD instrument and catalog contract', () => {
    const parsed = marketV2InstrumentCatalogSchema.parse({
      schemaVersion: '2.0',
      generatedAt: '2026-08-21T08:00:00Z',
      instruments: [instrument()],
    })
    expect(parsed.instruments[0].instrumentId).toBe('gpu-ref:h100:global:vast-ai')
    expect(parsed.instruments[0].capabilities.history).toBe(true)
  })

  it('defaults every missing capability to false, including when the entire object is absent', () => {
    const parsed = marketV2InstrumentSchema.parse(instrument({ capabilities: undefined }))
    expect(Object.values(parsed.capabilities).every((value) => value === false)).toBe(true)
  })

  it('drops an unknown capability rather than treating it as trusted', () => {
    const parsed = marketV2CapabilitiesSchema.parse({ futureTrading: true })
    expect(parsed).not.toHaveProperty('futureTrading')
    expect(Object.values(parsed).every((value) => value === false)).toBe(true)
  })

  it('rejects an instrument whose currency contradicts its price unit', () => {
    expect(marketV2InstrumentSchema.safeParse(instrument({ currency: 'CNY' })).success).toBe(false)
  })

  it.each(['1.9', '3.0', '2026.1', 'v2'])('rejects an unsupported or malformed schema version: %s', (schemaVersion) => {
    expect(
      marketV2InstrumentCatalogSchema.safeParse({
        schemaVersion,
        generatedAt: '2026-08-21T08:00:00Z',
        instruments: [instrument()],
      }).success
    ).toBe(false)
  })
})

describe('market v2 price and snapshot', () => {
  it('parses a complete PRD snapshot without converting decimal strings to binary floats', () => {
    const parsed = marketV2SnapshotSchema.parse(snapshot())
    expect(parsed.price?.value).toBe('2.1500')
    expect(typeof parsed.price?.value).toBe('string')
  })

  it.each(['-0.01', '+1.00', '1e3', ' 1.00', '01.00'])('rejects an unsafe price representation: %s', (value) => {
    expect(marketV2PriceSchema.safeParse({ value, currency: 'USD', unit: 'USD_PER_GPU_HOUR' }).success).toBe(false)
  })

  it('rejects a currency and unit mismatch', () => {
    expect(marketV2PriceSchema.safeParse({ value: '2.15', currency: 'CNY', unit: 'USD_PER_GPU_HOUR' }).success).toBe(
      false
    )
  })

  it('also validates currency and unit on converted prices', () => {
    const value = snapshot({
      convertedPrices: [
        { value: '15.42', currency: 'USD', unit: 'CNY_PER_GPU_HOUR', rateVersion: 'usd-cny:2026-08-21' },
      ],
    })
    expect(marketV2SnapshotSchema.safeParse(value).success).toBe(false)
  })

  it('rejects an unknown price unit instead of guessing', () => {
    expect(marketV2PriceSchema.safeParse({ value: '2.15', currency: 'USD', unit: 'PER_HOUR' }).success).toBe(false)
  })

  it.each(['not-a-date', '2026-02-31T08:00:00Z', '2026-08-21T08:00:00+08:00'])(
    'rejects an illegal UTC time: %s',
    (generatedAt) => {
      expect(marketV2SnapshotSchema.safeParse(snapshot({ generatedAt })).success).toBe(false)
    }
  )

  it('rejects a negative or fractional sequence', () => {
    expect(marketV2SnapshotSchema.safeParse(snapshot({ sequence: -1 })).success).toBe(false)
    expect(marketV2SnapshotSchema.safeParse(snapshot({ sequence: 1.5 })).success).toBe(false)
  })

  it('allows absent quote values for an explicit no-quote state without filling zero', () => {
    const value = snapshot({ status: 'NO_QUOTE', price: null, sampleSize: null, convertedPrices: [] })
    const parsed = marketV2SnapshotSchema.parse(value)
    expect(parsed.price).toBeNull()
    expect(parsed.sampleSize).toBeNull()
  })

  it.each([
    ['OK', undefined],
    ['OK', null],
    ['STALE', undefined],
    ['STALE', null],
  ])('rejects status %s without a price', (status, price) => {
    expect(marketV2SnapshotSchema.safeParse(snapshot({ status, price })).success).toBe(false)
  })

  it.each(['NO_QUOTE', 'UNAVAILABLE', 'UNCONFIGURED', 'BLOCKED'])(
    'rejects status %s when a price is present',
    (status) => {
      expect(marketV2SnapshotSchema.safeParse(snapshot({ status })).success).toBe(false)
    }
  )

  it.each(['NO_QUOTE', 'UNAVAILABLE', 'UNCONFIGURED', 'BLOCKED'])(
    'accepts status %s without fabricating a price',
    (status) => {
      const parsed = marketV2SnapshotSchema.parse(snapshot({ status, price: null, convertedPrices: [] }))
      expect(parsed.price).toBeNull()
    }
  )

  it('rejects provenance that points to an untrusted source', () => {
    const value = snapshot({
      provenance: {
        sourceId: 'UNKNOWN',
        sourceLabel: 'Unknown',
        method: 'SCRAPE',
        sourceUrl: 'https://vast.ai.attacker.example/redirect',
      },
    })
    expect(marketV2SnapshotSchema.safeParse(value).success).toBe(false)
  })
})

describe('trusted trading capability derivation', () => {
  const completeEvidence = {
    tradeEntry: true,
    standardizedContracts: true,
    twoSidedOrderBook: true,
    sequencedOrderBook: true,
    matchingEngine: true,
    positions: true,
    riskControls: true,
    clearing: true,
    settlement: true,
  }

  it('does not trust the server tradeEntry flag by itself', () => {
    const parsed = marketV2CapabilitiesSchema.parse({ tradeEntry: true })
    expect(deriveTrustedTradingCapability(parsed)).toBe(false)
  })

  it.each([
    'standardizedContracts',
    'twoSidedOrderBook',
    'sequencedOrderBook',
    'matchingEngine',
    'positions',
    'riskControls',
    'clearing',
    'settlement',
  ])('keeps trading disabled when %s evidence is missing', (missing) => {
    const parsed = marketV2CapabilitiesSchema.parse({ ...completeEvidence, [missing]: false })
    expect(deriveTrustedTradingCapability(parsed)).toBe(false)
  })

  it('allows trade entry only when the complete client-side evidence chain is true', () => {
    const parsed = marketV2CapabilitiesSchema.parse(completeEvidence)
    expect(deriveTrustedTradingCapability(parsed)).toBe(true)
  })
})

describe('market v2 stream events', () => {
  it('parses a valid incremental quote event', () => {
    const parsed = marketV2StreamEventSchema.parse(streamEvent())
    expect(parsed.eventId).toBe('evt_01J5')
    expect(parsed.sequence).toBe(12_888)
  })

  it('parses a valid executed trade only with the executed-trade data mode and a price', () => {
    const parsed = marketV2StreamEventSchema.parse(
      streamEvent({
        eventType: 'TRADE_EXECUTED',
        payload: {
          status: 'OK',
          dataMode: 'EXECUTED_TRADE',
          price: { value: '2.1700', currency: 'USD', unit: 'USD_PER_GPU_HOUR' },
        },
      })
    )
    expect(parsed.payload.dataMode).toBe('EXECUTED_TRADE')
    expect(parsed.payload.price?.value).toBe('2.1700')
  })

  it('rejects an executed trade using a non-trade data mode', () => {
    expect(
      marketV2StreamEventSchema.safeParse(
        streamEvent({
          eventType: 'TRADE_EXECUTED',
          payload: {
            status: 'OK',
            dataMode: 'REFERENCE_QUOTE',
            price: { value: '2.1700', currency: 'USD', unit: 'USD_PER_GPU_HOUR' },
          },
        })
      ).success
    ).toBe(false)
  })

  it('rejects an executed trade without a price even when its status normally permits no quote', () => {
    expect(
      marketV2StreamEventSchema.safeParse(
        streamEvent({
          eventType: 'TRADE_EXECUTED',
          payload: { status: 'NO_QUOTE', dataMode: 'EXECUTED_TRADE', price: null },
        })
      ).success
    ).toBe(false)
  })

  it('accepts a price-free heartbeat as a status-independent liveness signal', () => {
    const parsed = marketV2StreamEventSchema.parse(
      streamEvent({
        eventType: 'HEARTBEAT',
        payload: { status: 'OK', dataMode: 'OPERATIONAL_METRIC' },
      })
    )
    expect(parsed.payload.price).toBeUndefined()
  })

  it('rejects a heartbeat carrying a price', () => {
    expect(marketV2StreamEventSchema.safeParse(streamEvent({ eventType: 'HEARTBEAT' })).success).toBe(false)
  })

  it.each(['OK', 'STALE'])('rejects non-heartbeat status %s without a price', (status) => {
    expect(
      marketV2StreamEventSchema.safeParse(
        streamEvent({
          eventType: 'STATUS_UPDATED',
          payload: { status, dataMode: 'REFERENCE_QUOTE', price: null },
        })
      ).success
    ).toBe(false)
  })

  it.each(['NO_QUOTE', 'UNAVAILABLE', 'UNCONFIGURED', 'BLOCKED'])(
    'rejects non-heartbeat status %s when a price is present',
    (status) => {
      expect(
        marketV2StreamEventSchema.safeParse(
          streamEvent({
            eventType: 'STATUS_UPDATED',
            payload: {
              status,
              dataMode: 'REFERENCE_QUOTE',
              price: { value: '2.1600', currency: 'USD', unit: 'USD_PER_GPU_HOUR' },
            },
          })
        ).success
      ).toBe(false)
    }
  )

  it('accepts a non-heartbeat no-quote status without a price', () => {
    const parsed = marketV2StreamEventSchema.parse(
      streamEvent({
        eventType: 'STATUS_UPDATED',
        payload: { status: 'NO_QUOTE', dataMode: 'REFERENCE_QUOTE', price: null },
      })
    )
    expect(parsed.payload.price).toBeNull()
  })

  it.each([
    streamEvent({ schemaVersion: '3.0' }),
    streamEvent({ sequence: -1 }),
    streamEvent({ generatedAt: 'tomorrow' }),
    streamEvent({
      payload: {
        status: 'OK',
        dataMode: 'REFERENCE_QUOTE',
        price: { value: '-1', currency: 'USD', unit: 'USD_PER_GPU_HOUR' },
      },
    }),
    streamEvent({
      payload: {
        status: 'OK',
        dataMode: 'REFERENCE_QUOTE',
        price: { value: '1', currency: 'USD', unit: 'UNKNOWN_UNIT' },
      },
    }),
  ])('rejects an unsafe stream event', (event) => {
    expect(marketV2StreamEventSchema.safeParse(event).success).toBe(false)
  })
})
