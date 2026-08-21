import { describe, expect, it } from 'vitest'
import { findKodDeepLink, isKodDeepLink, parseDeepLink } from './deeplinks'

const sessionId = 'tp_demo_0123456789abcdefabcd'

describe('Kod deep links', () => {
  it('parses production and development Tinpay result links', () => {
    expect(parseDeepLink(`kod://tinpay/result?sessionId=${sessionId}`)).toEqual({
      type: 'tinpay-result',
      sessionId,
    })
    expect(parseDeepLink(`kod-dev://tinpay/result?sessionId=${sessionId}`)).toEqual({
      type: 'tinpay-result',
      sessionId,
    })
  })

  it('does not trust status or callback data from the deep link', () => {
    expect(parseDeepLink(`kod://tinpay/result?sessionId=${sessionId}&status=COMPLETED`)).toBeNull()
    expect(parseDeepLink(`kod://tinpay/result?sessionId=${sessionId}&callbackState=secret`)).toEqual({
      type: 'tinpay-result',
      sessionId,
    })
    expect(parseDeepLink(`kod://tinpay/result?sessionId=tp_demo_invalid`)).toBeNull()
  })

  it('rejects malformed, oversized, and mismatched links', () => {
    expect(parseDeepLink('https://tinpay.kai.com/result')).toBeNull()
    expect(parseDeepLink('kod://tinpay/other')).toBeNull()
    expect(parseDeepLink('kod://user@tinpay/result')).toBeNull()
    expect(parseDeepLink(`kod://tinpay/result?sessionId=${sessionId}#trusted=false`)).toBeNull()
    expect(isKodDeepLink(`kod://tinpay/result?value=${'a'.repeat(4096)}`)).toBe(false)
  })

  it('finds the same schemes for warm and cold starts', () => {
    expect(findKodDeepLink(['Kod.exe', `kod://tinpay/result?sessionId=${sessionId}`])).toContain('kod://tinpay')
    expect(findKodDeepLink(['electron.exe', '.', `kod-dev://tinpay/result?sessionId=${sessionId}`])).toContain(
      'kod-dev://tinpay'
    )
    expect(findKodDeepLink(['Kod.exe', 'chatbox://tinpay/result'])).toBeUndefined()
  })

  it('preserves existing allowlisted navigation links', () => {
    expect(parseDeepLink('kod://mcp/install?server=%7B%22name%22%3A%22demo%22%7D')).toEqual({
      type: 'navigate',
      path: '/settings/mcp?install=%7B%22name%22%3A%22demo%22%7D',
    })
  })

  it('opens a validated compute referral link without accepting extra fields', () => {
    const code = '0123456789abcdef0123456789abcdef'
    expect(parseDeepLink(`kod://compute/invite?code=${code}`)).toEqual({
      type: 'navigate',
      path: `/compute-center?invite=${code}`,
    })
    expect(parseDeepLink(`kod://compute/invite?code=${code}&inviter=admin`)).toBeNull()
    expect(parseDeepLink(`kod://compute/invite?code=${code}&code=${'f'.repeat(32)}`)).toBeNull()
    expect(parseDeepLink('kod://compute/invite?code=login-invite-code')).toBeNull()
  })
})
