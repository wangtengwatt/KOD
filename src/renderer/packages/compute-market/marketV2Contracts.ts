import { z } from 'zod'
import { isTrustedMarketSourceUrl } from './marketIntelligence'

export const MARKET_V2_SCHEMA_MAJOR = 2

export const marketV2SchemaVersionSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)(?:\.(0|[1-9]\d*)){0,2}$/)
  .refine((version) => Number(version.split('.')[0]) === MARKET_V2_SCHEMA_MAJOR, {
    message: `Unsupported market schema major version; expected ${MARKET_V2_SCHEMA_MAJOR}`,
  })

export const marketV2UtcTimestampSchema = z.string().datetime()

export const marketV2MarketKindSchema = z.enum(['GPU_RENTAL_REFERENCE', 'CARD_HOUR_MARKET', 'MODEL_API_PRICE'])

export const marketV2DataModeSchema = z.enum([
  'REFERENCE_QUOTE',
  'PLATFORM_LISTING',
  'EXECUTED_TRADE',
  'OPERATIONAL_METRIC',
])

export const marketV2StatusSchema = z.enum(['OK', 'STALE', 'NO_QUOTE', 'UNAVAILABLE', 'UNCONFIGURED', 'BLOCKED'])

const MARKET_V2_PRICE_STATUSES = new Set(['OK', 'STALE'])

type MarketV2StatusPriceValue = {
  status: z.infer<typeof marketV2StatusSchema>
  price?: unknown | null
}

function hasMarketV2Price(value: MarketV2StatusPriceValue) {
  return value.price !== undefined && value.price !== null
}

function getMarketV2StatusPriceIssue(value: MarketV2StatusPriceValue) {
  const hasPrice = hasMarketV2Price(value)
  if (MARKET_V2_PRICE_STATUSES.has(value.status)) {
    return hasPrice ? null : 'Status OK or STALE requires a price'
  }
  return hasPrice ? `Status ${value.status} must not include a price` : null
}

export const marketV2CurrencySchema = z.enum(['USD', 'CNY', 'CARD_HOUR'])

export const marketV2PriceUnitSchema = z.enum([
  'USD_PER_GPU_HOUR',
  'CNY_PER_GPU_HOUR',
  'CARD_HOUR_PER_GPU_HOUR',
  'CNY_PER_CARD_HOUR',
  'CNY_PER_MILLION_INPUT_TOKENS',
  'CNY_PER_MILLION_OUTPUT_TOKENS',
])

const unsignedDecimalSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, {
  message: 'Expected a non-negative decimal string',
})

const signedDecimalSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/, {
  message: 'Expected a decimal string',
})

const unitCurrencyPairs = new Set([
  'USD\u0000USD_PER_GPU_HOUR',
  'CNY\u0000CNY_PER_GPU_HOUR',
  'CARD_HOUR\u0000CARD_HOUR_PER_GPU_HOUR',
  'CNY\u0000CNY_PER_CARD_HOUR',
  'CNY\u0000CNY_PER_MILLION_INPUT_TOKENS',
  'CNY\u0000CNY_PER_MILLION_OUTPUT_TOKENS',
])

export const marketV2PriceSchema = z
  .object({
    value: unsignedDecimalSchema,
    currency: marketV2CurrencySchema,
    unit: marketV2PriceUnitSchema,
  })
  .refine(({ currency, unit }) => unitCurrencyPairs.has(`${currency}\u0000${unit}`), {
    message: 'Currency does not match the declared price unit',
    path: ['unit'],
  })

export const marketV2ConvertedPriceSchema = z
  .object({
    value: unsignedDecimalSchema,
    currency: marketV2CurrencySchema,
    unit: marketV2PriceUnitSchema,
    rateVersion: z.string().trim().min(1),
    convertedAt: marketV2UtcTimestampSchema.optional(),
  })
  .refine(({ currency, unit }) => unitCurrencyPairs.has(`${currency}\u0000${unit}`), {
    message: 'Currency does not match the declared price unit',
    path: ['unit'],
  })

export const marketV2CapabilitiesSchema = z.object({
  history: z.boolean().default(false),
  stream: z.boolean().default(false),
  tradeTape: z.boolean().default(false),
  supplyDepth: z.boolean().default(false),
  twoSidedOrderBook: z.boolean().default(false),
  sequencedOrderBook: z.boolean().default(false),
  comparison: z.boolean().default(false),
  termStructure: z.boolean().default(false),
  tradeEntry: z.boolean().default(false),
  standardizedContracts: z.boolean().default(false),
  matchingEngine: z.boolean().default(false),
  positions: z.boolean().default(false),
  riskControls: z.boolean().default(false),
  clearing: z.boolean().default(false),
  settlement: z.boolean().default(false),
})

export type MarketV2Capabilities = z.infer<typeof marketV2CapabilitiesSchema>

export const MARKET_V2_DISABLED_CAPABILITIES: MarketV2Capabilities = {
  history: false,
  stream: false,
  tradeTape: false,
  supplyDepth: false,
  twoSidedOrderBook: false,
  sequencedOrderBook: false,
  comparison: false,
  termStructure: false,
  tradeEntry: false,
  standardizedContracts: false,
  matchingEngine: false,
  positions: false,
  riskControls: false,
  clearing: false,
  settlement: false,
}

export function deriveTrustedTradingCapability(capabilities: MarketV2Capabilities) {
  return (
    capabilities.tradeEntry &&
    capabilities.standardizedContracts &&
    capabilities.twoSidedOrderBook &&
    capabilities.sequencedOrderBook &&
    capabilities.matchingEngine &&
    capabilities.positions &&
    capabilities.riskControls &&
    capabilities.clearing &&
    capabilities.settlement
  )
}

export const marketV2ProvenanceSchema = z.object({
  sourceId: z.string().trim().min(1).max(128),
  sourceLabel: z.string().trim().min(1).max(256),
  method: z.string().trim().min(1).max(128),
  sourceUrl: z
    .string()
    .url()
    .refine(isTrustedMarketSourceUrl, { message: 'Untrusted market source URL' })
    .optional()
    .nullable(),
})

export const marketV2InstrumentSchema = z
  .object({
    instrumentId: z.string().trim().min(1).max(256),
    marketKind: marketV2MarketKindSchema,
    displayName: z.string().trim().min(1).max(256),
    familyId: z.string().trim().min(1).max(256).optional(),
    gpuModel: z.string().trim().min(1).max(128).optional().nullable(),
    model: z.string().trim().min(1).max(256).optional().nullable(),
    region: z.string().trim().min(1).max(128),
    runtime: z.string().trim().min(1).max(128).optional().nullable(),
    delivery: z.string().trim().min(1).max(128),
    currency: marketV2CurrencySchema,
    priceUnit: marketV2PriceUnitSchema,
    dataMode: marketV2DataModeSchema,
    capabilities: marketV2CapabilitiesSchema.default(() => ({ ...MARKET_V2_DISABLED_CAPABILITIES })),
  })
  .refine(({ currency, priceUnit }) => unitCurrencyPairs.has(`${currency}\u0000${priceUnit}`), {
    message: 'Currency does not match the declared price unit',
    path: ['priceUnit'],
  })

export const marketV2InstrumentCatalogSchema = z.object({
  schemaVersion: marketV2SchemaVersionSchema,
  generatedAt: marketV2UtcTimestampSchema,
  instruments: z.array(marketV2InstrumentSchema),
})

export const marketV2SnapshotSchema = z
  .object({
    schemaVersion: marketV2SchemaVersionSchema,
    instrumentId: z.string().trim().min(1).max(256),
    sequence: z.number().int().nonnegative(),
    status: marketV2StatusSchema,
    dataMode: marketV2DataModeSchema,
    price: marketV2PriceSchema.optional().nullable(),
    convertedPrices: z.array(marketV2ConvertedPriceSchema).default([]),
    sampleSize: z.number().int().nonnegative().optional().nullable(),
    change24h: signedDecimalSchema.optional().nullable(),
    observedAt: marketV2UtcTimestampSchema.optional().nullable(),
    receivedAt: marketV2UtcTimestampSchema.optional().nullable(),
    generatedAt: marketV2UtcTimestampSchema,
    lastSuccessAt: marketV2UtcTimestampSchema.optional().nullable(),
    provenance: marketV2ProvenanceSchema,
  })
  .superRefine((value, context) => {
    const issue = getMarketV2StatusPriceIssue(value)
    if (issue) {
      context.addIssue({ code: 'custom', message: issue, path: ['price'] })
    }
  })

export const marketV2StreamEventTypeSchema = z.enum([
  'QUOTE_UPDATED',
  'STATUS_UPDATED',
  'TRADE_EXECUTED',
  'SUPPLY_DEPTH_UPDATED',
  'ORDER_BOOK_UPDATED',
  'HEARTBEAT',
])

export const marketV2StreamPayloadSchema = z.object({
  status: marketV2StatusSchema,
  dataMode: marketV2DataModeSchema,
  price: marketV2PriceSchema.optional().nullable(),
  sampleSize: z.number().int().nonnegative().optional().nullable(),
  capabilities: marketV2CapabilitiesSchema.optional(),
  provenance: marketV2ProvenanceSchema.optional(),
})

export const marketV2StreamEventSchema = z
  .object({
    schemaVersion: marketV2SchemaVersionSchema,
    eventId: z.string().trim().min(1).max(256),
    eventType: marketV2StreamEventTypeSchema,
    instrumentId: z.string().trim().min(1).max(256),
    sequence: z.number().int().nonnegative(),
    observedAt: marketV2UtcTimestampSchema,
    generatedAt: marketV2UtcTimestampSchema,
    payload: marketV2StreamPayloadSchema,
  })
  .superRefine((event, context) => {
    const hasPrice = hasMarketV2Price(event.payload)

    if (event.eventType === 'HEARTBEAT') {
      if (hasPrice) {
        context.addIssue({ code: 'custom', message: 'HEARTBEAT must not include a price', path: ['payload', 'price'] })
      }
      return
    }

    const statusPriceIssue = getMarketV2StatusPriceIssue(event.payload)
    if (statusPriceIssue) {
      context.addIssue({ code: 'custom', message: statusPriceIssue, path: ['payload', 'price'] })
    }

    if (event.eventType === 'TRADE_EXECUTED') {
      if (event.payload.dataMode !== 'EXECUTED_TRADE') {
        context.addIssue({
          code: 'custom',
          message: 'TRADE_EXECUTED requires dataMode EXECUTED_TRADE',
          path: ['payload', 'dataMode'],
        })
      }
      if (!hasPrice && !statusPriceIssue) {
        context.addIssue({ code: 'custom', message: 'TRADE_EXECUTED requires a price', path: ['payload', 'price'] })
      }
    }
  })

export type MarketV2MarketKind = z.infer<typeof marketV2MarketKindSchema>
export type MarketV2DataMode = z.infer<typeof marketV2DataModeSchema>
export type MarketV2Status = z.infer<typeof marketV2StatusSchema>
export type MarketV2Currency = z.infer<typeof marketV2CurrencySchema>
export type MarketV2PriceUnit = z.infer<typeof marketV2PriceUnitSchema>
export type MarketV2Price = z.infer<typeof marketV2PriceSchema>
export type MarketV2Provenance = z.infer<typeof marketV2ProvenanceSchema>
export type MarketV2Instrument = z.infer<typeof marketV2InstrumentSchema>
export type MarketV2InstrumentCatalog = z.infer<typeof marketV2InstrumentCatalogSchema>
export type MarketV2Snapshot = z.infer<typeof marketV2SnapshotSchema>
export type MarketV2StreamEvent = z.infer<typeof marketV2StreamEventSchema>
