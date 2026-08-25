import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: {
    accountId: '9223372036854775807' as string | null,
    loginEmail: 'user@example.com' as string | null,
    accessToken: 'access-a' as string | null,
    refreshToken: 'refresh-a' as string | null,
  },
  request: vi.fn(),
}))

vi.mock('../computeCenter', () => ({ computeMarketplaceRequest: mocks.request }))
vi.mock('@/stores/authInfoStore', () => ({
  authInfoStore: { getState: () => mocks.auth },
}))

import { getKaiMarketInference, kaiMarketInferenceViewSchema, refreshKaiMarketInference } from './kaiInference'

const ACCOUNT_ID = '9223372036854775807'
const ACCOUNT_IDENTITY = `account:${ACCOUNT_ID}`
const EMAIL_IDENTITY = 'email:user@example.com'
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
        dtNs: '6',
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
    mocks.request.mockReset()
    Object.assign(mocks.auth, {
      accountId: ACCOUNT_ID,
      loginEmail: 'user@example.com',
      accessToken: 'access-a',
      refreshToken: 'refresh-a',
    })
  })

  it('uses only bounded same-origin GET and POST routes with an encoded opaque contract ID and cancellation', async () => {
    mocks.request.mockResolvedValue(view())
    const getController = new AbortController()
    const refreshController = new AbortController()

    await getKaiMarketInference(CONTRACT_ID, ACCOUNT_IDENTITY, getController.signal)
    await refreshKaiMarketInference(CONTRACT_ID, ACCOUNT_IDENTITY, refreshController.signal)

    const encoded = encodeURIComponent(CONTRACT_ID)
    expect(mocks.request).toHaveBeenNthCalledWith(1, `/api/compute/market/inference?contractId=${encoded}`, {
      signal: getController.signal,
      timeout: 15_000,
    })
    expect(mocks.request).toHaveBeenNthCalledWith(2, `/api/compute/market/inference/refresh?contractId=${encoded}`, {
      method: 'POST',
      signal: refreshController.signal,
      timeout: 15_000,
    })
  })

  it('preserves 19-digit identifiers and fixed-point decimals as strings', () => {
    const parsed = kaiMarketInferenceViewSchema.parse(view())

    expect(parsed.lastSuccess?.inferenceId).toBe('9007199254740993123')
    expect(typeof parsed.lastSuccess?.inferenceId).toBe('string')
    expect(parsed.lastSuccess?.prediction.nextEvent?.dtNs).toBe('6')
    expect(parsed.lastSuccess?.prediction.nextEvent?.price).toBe('98002.50000000')
    expect(parsed.verification?.status).toBe('MATCHED')
    if (parsed.verification?.status !== 'MATCHED') throw new Error('expected completed verification')
    expect(parsed.verification.actualTradeId).toBe(REAL_TRADE_ID)
    expect(parsed.verification.priceError).toBe('0.10000000')
  })

  it('accepts a precision-26 signed price error without widening prices or accepting numbers', () => {
    const maximumPriceError = '999999999999999998.99999999'
    const parsed = kaiMarketInferenceViewSchema.parse({
      ...view(),
      verification: { ...view().verification, priceError: maximumPriceError },
    })

    expect(parsed.verification?.status).toBe('MATCHED')
    if (parsed.verification?.status !== 'MATCHED') throw new Error('expected completed verification')
    expect(parsed.verification.priceError).toBe(maximumPriceError)
    expect(typeof parsed.verification.priceError).toBe('string')

    for (const priceError of [1, '9999999999999999999.99999999']) {
      expect(
        kaiMarketInferenceViewSchema.safeParse({
          ...view(),
          verification: { ...view().verification, priceError },
        }).success
      ).toBe(false)
    }
    expect(
      kaiMarketInferenceViewSchema.safeParse({
        ...view(),
        verification: { ...view().verification, actualPrice: maximumPriceError },
      }).success
    ).toBe(false)
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
              nextEvent: { dtNs: '6', event: 'TRADE', side: 'BUY', price: 98002.5, quantity: '0.1' },
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

  it('maps the real dt_ns field without accepting a persistence attempt id or malformed integer', () => {
    const parsed = kaiMarketInferenceViewSchema.parse(view())

    expect(parsed.lastSuccess?.prediction.text).toContain('dt_ns=6 event=TRADE')
    expect(parsed.lastSuccess?.prediction.nextEvent).toEqual({
      dtNs: '6',
      event: 'TRADE',
      side: 'BUY',
      price: '98002.50000000',
      quantity: '0.10000000',
    })
    expect(
      kaiMarketInferenceViewSchema.safeParse(
        view({
          lastSuccess: lastSuccess({
            prediction: {
              model: 'Kai_distill_LM',
              text: 'dt_ns=6 event=TRADE side=BUY price=98002.5 quantity=0.1',
              nextEvent: {
                sequence: '9007199254740993124',
                event: 'TRADE',
                side: 'BUY',
                price: '98002.50000000',
                quantity: '0.10000000',
              },
            },
          }),
        })
      ).success
    ).toBe(false)
    expect(
      kaiMarketInferenceViewSchema.parse(
        view({
          lastSuccess: lastSuccess({
            prediction: {
              model: 'Kai_distill_LM',
              text: 'answer',
              nextEvent: { dtNs: '01', event: 'TRADE', side: 'BUY', price: '1.0', quantity: '1.0' },
            },
          }),
        })
      ).lastSuccess?.prediction.nextEvent?.dtNs
    ).toBe('01')
    for (const dtNs of [-1, '-1', '1.0', '', '1'.repeat(33), '１']) {
      expect(
        kaiMarketInferenceViewSchema.safeParse(
          view({
            lastSuccess: lastSuccess({
              prediction: {
                model: 'Kai_distill_LM',
                text: 'answer',
                nextEvent: { dtNs, event: 'TRADE', side: 'BUY', price: '1.0', quantity: '1.0' },
              },
            }),
          })
        ).success
      ).toBe(false)
    }
  })

  it('requires extraction failure to be explicit null and accepts an unverifiable real trade', () => {
    const parsed = kaiMarketInferenceViewSchema.parse(
      view({
        lastSuccess: lastSuccess({
          prediction: { model: 'Kai_distill_LM', text: 'unstructured answer', nextEvent: null },
        }),
        verification: {
          status: 'UNVERIFIABLE',
          inferenceId: '9007199254740993123',
          actualTradeId: REAL_TRADE_ID,
          actualSide: 'SELL',
          actualPrice: '98003.00000000',
          actualQuantity: '0.30000000',
          actualAt: '2026-08-25T08:00:30Z',
        },
      })
    )

    expect(parsed.lastSuccess?.prediction.nextEvent).toBeNull()
    expect(parsed.verification?.status).toBe('UNVERIFIABLE')
    expect(
      kaiMarketInferenceViewSchema.safeParse(
        view({
          lastSuccess: lastSuccess({
            prediction: { model: 'Kai_distill_LM', text: 'unstructured answer' },
          }),
        })
      ).success
    ).toBe(false)
  })

  it('rejects NUL in model names before displaying server content', () => {
    expect(
      kaiMarketInferenceViewSchema.safeParse(
        view({
          lastSuccess: lastSuccess({
            prediction: { model: 'Kai\u0000distill', text: 'answer', nextEvent: null },
          }),
        })
      ).success
    ).toBe(false)
  })

  it('returns an ordinary validation failure instead of throwing for a malformed identifier', () => {
    const malformed = view({ lastSuccess: lastSuccess({ inferenceId: 'not-an-id' }) })

    expect(() => kaiMarketInferenceViewSchema.safeParse(malformed)).not.toThrow()
    expect(kaiMarketInferenceViewSchema.safeParse(malformed).success).toBe(false)
  })

  it('accepts the project account and normalized email wallet identities', async () => {
    mocks.request.mockResolvedValue(view())

    await getKaiMarketInference(CONTRACT_ID, ACCOUNT_IDENTITY)
    Object.assign(mocks.auth, { accountId: null, loginEmail: '  User@Example.COM  ' })
    await getKaiMarketInference(CONTRACT_ID, EMAIL_IDENTITY)

    expect(mocks.request).toHaveBeenCalledTimes(2)
  })

  it('refuses a mismatched wallet identity before I/O and rejects a late account response after switching', async () => {
    await expect(getKaiMarketInference(CONTRACT_ID, 'account:9007199254740993123')).rejects.toThrow('账户已切换')
    expect(mocks.request).not.toHaveBeenCalled()

    let resolveResponse: ((value: unknown) => void) | undefined
    mocks.request.mockReturnValue(
      new Promise((resolve) => {
        resolveResponse = resolve
      })
    )
    const pending = getKaiMarketInference(CONTRACT_ID, ACCOUNT_IDENTITY)
    mocks.auth.accountId = '9007199254740993123'
    if (!resolveResponse) throw new Error('request resolver was not captured')
    resolveResponse(view())

    await expect(pending).rejects.toThrow('账户已切换')
  })

  it('rejects a late normalized-email response after the wallet identity changes', async () => {
    Object.assign(mocks.auth, { accountId: null, loginEmail: '  User@Example.COM  ' })
    let resolveResponse: ((value: unknown) => void) | undefined
    mocks.request.mockReturnValue(
      new Promise((resolve) => {
        resolveResponse = resolve
      })
    )

    const pending = getKaiMarketInference(CONTRACT_ID, EMAIL_IDENTITY)
    mocks.auth.loginEmail = 'other@example.com'
    if (!resolveResponse) throw new Error('request resolver was not captured')
    resolveResponse(view())

    await expect(pending).rejects.toThrow('账户已切换')
  })

  it('forwards AbortSignal so a hanging request can be cancelled', async () => {
    mocks.request.mockImplementation(
      (_path: string, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
        })
    )
    const controller = new AbortController()

    const pending = getKaiMarketInference(CONTRACT_ID, ACCOUNT_IDENTITY, controller.signal)
    controller.abort(new Error('cancelled by query'))

    await expect(pending).rejects.toThrow('cancelled by query')
  })
})
