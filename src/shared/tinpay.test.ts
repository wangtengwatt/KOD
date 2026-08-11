import { describe, expect, it } from 'vitest'
import { isAllowedTinpayUrl, tinpayOpenRequestSchema, tinpayPageEventSchema, tinpaySessionIdSchema } from './tinpay'

const sessionId = 'tp_demo_0123456789abcdefabcd'

describe('Tinpay contracts', () => {
  it('accepts only the exact demo session id shape', () => {
    expect(tinpaySessionIdSchema.safeParse(sessionId).success).toBe(true)
    expect(tinpaySessionIdSchema.safeParse('tp_demo_0123456789ABCDEFabcd').success).toBe(false)
    expect(tinpaySessionIdSchema.safeParse('tp_live_0123456789abcdefabcd').success).toBe(false)
  })

  it('rejects unknown open request properties', () => {
    expect(
      tinpayOpenRequestSchema.safeParse({
        sessionId,
        checkoutUrl: 'https://tinpay.kai.com/checkout/demo',
        expiresAt: '2027-01-01T00:00:00.000Z',
        bearer: 'must-not-cross-ipc',
      }).success
    ).toBe(false)
  })

  it('enforces event-specific error payloads and strict fields', () => {
    const base = { version: '1.0', sessionId, timestamp: '2026-08-04T10:00:00.000Z' }
    expect(tinpayPageEventSchema.safeParse({ ...base, type: 'tinpay.completed', status: 'COMPLETED' }).success).toBe(
      true
    )
    expect(
      tinpayPageEventSchema.safeParse({
        ...base,
        type: 'tinpay.error',
        message: 'Camera unavailable',
        retryable: true,
      }).success
    ).toBe(true)
    expect(tinpayPageEventSchema.safeParse({ ...base, type: 'tinpay.error', extra: true }).success).toBe(false)
    expect(
      tinpayPageEventSchema.safeParse({ ...base, type: 'tinpay.completed', occurredAt: base.timestamp }).success
    ).toBe(false)
  })
})

describe('Tinpay URL policy', () => {
  it.each([
    'https://tinpay.kai.com',
    'https://tinpay.kai.com/',
    'https://tinpay.kai.com/checkout/session?opaque=value#step',
  ])('allows %s', (url) => {
    expect(isAllowedTinpayUrl(url)).toBe(true)
  })

  it.each([
    'http://tinpay.kai.com/checkout',
    'https://tinpay.kai.com:443/checkout',
    'https://user@tinpay.kai.com/checkout',
    'https://tinpay.kai.com.evil.test/checkout',
    'https://sub.tinpay.kai.com/checkout',
    'https://tinpay.kai.com@evil.test/checkout',
    'javascript:alert(1)',
    'file:///C:/checkout.html',
    'not a url',
  ])('rejects %s', (url) => {
    expect(isAllowedTinpayUrl(url)).toBe(false)
  })
})
