import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  accountId: '9223372036854775807',
  request: vi.fn(),
}))

vi.mock('../computeCenter', () => ({ computeMarketplaceRequest: mocks.request }))
vi.mock('@/stores/authInfoStore', () => ({
  authInfoStore: { getState: () => ({ accountId: mocks.accountId }) },
}))

import { getKaiMarketInference, kaiMarketInferenceViewSchema, refreshKaiMarketInference } from './kaiInference'

const ACCOUNT_ID = '9223372036854775807'
const CONTRACT_ID = 'contract/H100?region=cn&delivery=spot'
const FINGERPRINT = 'a'.repeat(64)
const REAL_TRADE_ID = 'trade-550e8400-e29b-41d4-a716-446655440000'

function lastSuccess(overrides: Record<string, unknown> = {}) {
  return {
    inferenceId: '9007199254740993123',
    fingerprint: FINGERPRINT,
    generatedAt: '2026-08-25T08:00:00Z',
    prediction: {
      model: 'Kai_distill_LM',
      text: 'dt_ns=6 event=TRADE side=BUY price=98002.50000000 quantity=0.10000000',
      nextEvent: {
        sequence: '9007199254740993124',
        event: 'TRADE',
        side: 'BUY',
        price: '98002.50000000',
        quantity: '0.10000000',
      },
    },
    pipeline: {
      status: 'AVAILABLE',
      model: 'Kai_distill_LM',
      text: 'risk analysis available',
    },
    ...overrides,
  }
}

function view(overrides: Record<string, unknown> = {}) {
  return {
    contractId: CONTRACT_ID,
    status: 'FRESH',
    fingerprint: FINGERPRINT,
    checkedAt: '2026-08-25T08:00:01Z',
    lastSuccess: lastSuccess(),
    verification: {
      status: 'MATCHED',
      inferenceId: '9007199254740993123',
      actualTradeId: REAL_TRADE_ID,
      actualSide: 'BUY',
      actualPrice: '98002.60000000',
      actualQuantity: '0.20000000',
      actualAt: '2026-08-25T08:00:30Z',
      directionMatched: true,
      priceError: '0.10000000',
    },
    ...overrides,
  }
}

describe('KAI market inference wire contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.accountId = ACCOUNT_ID
  })

  it('uses only the exact same-origin GET and POST routes with an encoded opaque contract ID', async () => {
    mocks.request.mockResolvedValue(view())

    await getKaiMarketInference(CONTRACT_ID, ACCOUNT_ID)
    await refreshKaiMarketInference(CONTRACT_ID, ACCOUNT_ID)

    const encoded = encodeURIComponent(CONTRACT_ID)
    expect(mocks.request).toHaveBeenNthCalledWith(1, `/api/compute/market/inference?contractId=${encoded}`)
    expect(mocks.request).toHaveBeenNthCalledWith(2, `/api/compute/market/inference/refresh?contractId=${encoded}`, {
      method: 'POST',
    })
  })

  it('preserves 19-digit identifiers and fixed-point decimals as strings', () => {
    const parsed = kaiMarketInferenceViewSchema.parse(view())

    expect(parsed.lastSuccess?.inferenceId).toBe('9007199254740993123')
    expect(typeof parsed.lastSuccess?.inferenceId).toBe('string')
    expect(parsed.lastSuccess?.prediction.nextEvent?.price).toBe('98002.50000000')
    expect(parsed.verification?.status).toBe('MATCHED')
    if (parsed.verification?.status !== 'MATCHED') throw new Error('expected completed verification')
    expect(parsed.verification.actualTradeId).toBe(REAL_TRADE_ID)
    expect(parsed.verification.priceError).toBe('0.10000000')
  })

  it('accepts an explicit cached success and an insufficient-real-order-book pipeline state', () => {
    const parsed = kaiMarketInferenceViewSchema.parse(
      view({
        status: 'CACHED',
        lastSuccess: lastSuccess({ pipeline: { status: 'INSUFFICIENT_ORDER_BOOK' } }),
        verification: { status: 'PENDING', inferenceId: '9007199254740993123' },
      })
    )

    expect(parsed.status).toBe('CACHED')
    expect(parsed.lastSuccess?.pipeline?.status).toBe('INSUFFICIENT_ORDER_BOOK')
    expect(parsed.verification?.status).toBe('PENDING')
  })

  it('retains the previous success when the current prediction service is unavailable', () => {
    const parsed = kaiMarketInferenceViewSchema.parse(
      view({
        status: 'UNAVAILABLE',
        fingerprint: 'b'.repeat(64),
        lastSuccess: lastSuccess(),
        verification: null,
      })
    )

    expect(parsed.status).toBe('UNAVAILABLE')
    expect(parsed.lastSuccess?.prediction.text).toContain('side=BUY')
  })

  it('allows a first-load unavailable state without inventing a prediction', () => {
    const parsed = kaiMarketInferenceViewSchema.parse(
      view({ status: 'UNAVAILABLE', fingerprint: null, lastSuccess: null, verification: null })
    )

    expect(parsed.lastSuccess).toBeNull()
    expect(parsed.fingerprint).toBeNull()
  })

  it('fails closed on numeric IDs/decimals, impossible success states, and upstream-shaped payloads', () => {
    expect(
      kaiMarketInferenceViewSchema.safeParse(view({ lastSuccess: lastSuccess({ inferenceId: 9_007_199_254_740_991 }) }))
        .success
    ).toBe(false)
    expect(
      kaiMarketInferenceViewSchema.safeParse(
        view({
          lastSuccess: lastSuccess({
            prediction: {
              model: 'Kai_distill_LM',
              text: 'answer',
              nextEvent: { sequence: '6', event: 'TRADE', side: 'BUY', price: 98002.5, quantity: '0.1' },
            },
          }),
        })
      ).success
    ).toBe(false)
    expect(
      kaiMarketInferenceViewSchema.safeParse(
        view({ status: 'FRESH', fingerprint: null, lastSuccess: null, verification: null })
      ).success
    ).toBe(false)
    expect(
      kaiMarketInferenceViewSchema.safeParse({
        model: 'Kai_distill_LM',
        mode: 'market',
        answer: 'BUY',
        latency_us: 1234,
      }).success
    ).toBe(false)
  })

  it('rejects unknown fields and malformed fixed-point values rather than normalizing them', () => {
    expect(kaiMarketInferenceViewSchema.safeParse({ ...view(), unexpected: true }).success).toBe(false)

    for (const priceError of ['1e3', '+1.0', '01.0', '1.', '.1', '0.123456789', '-0.00000000']) {
      expect(
        kaiMarketInferenceViewSchema.safeParse({
          ...view(),
          verification: { ...view().verification, priceError },
        }).success
      ).toBe(false)
    }
  })

  it('returns an ordinary validation failure instead of throwing for a malformed identifier', () => {
    const malformed = view({ lastSuccess: lastSuccess({ inferenceId: 'not-an-id' }) })

    expect(() => kaiMarketInferenceViewSchema.safeParse(malformed)).not.toThrow()
    expect(kaiMarketInferenceViewSchema.safeParse(malformed).success).toBe(false)
  })

  it('refuses a mismatched account before I/O and rejects a late response after the account changes', async () => {
    await expect(getKaiMarketInference(CONTRACT_ID, '9007199254740993123')).rejects.toThrow('账户已切换')
    expect(mocks.request).not.toHaveBeenCalled()

    let resolveResponse!: (value: unknown) => void
    mocks.request.mockReturnValue(
      new Promise((resolve) => {
        resolveResponse = resolve
      })
    )
    const pending = getKaiMarketInference(CONTRACT_ID, ACCOUNT_ID)
    mocks.accountId = '9007199254740993123'
    resolveResponse(view())

    await expect(pending).rejects.toThrow('账户已切换')
  })
})
