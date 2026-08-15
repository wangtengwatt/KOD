import { describe, expect, it } from 'vitest'
import { assertPaymentUrl, parsePaymentHosts } from './payment-url'
describe('payment URL security', () => {
  it('uses API host only when no list is configured', () => {
    expect([...parsePaymentHosts('', 'https://kod.kai.com')]).toEqual(['kod.kai.com', 'mzf.mapay.cc'])
  })
  it('accepts configured HTTPS host', () => {
    expect(assertPaymentUrl('https://pay.example.com/order', new Set(['pay.example.com'])).hostname).toBe(
      'pay.example.com'
    )
  })
  it.each(['http://pay.example.com', 'javascript:alert(1)', 'file:///tmp/a', 'https://evil.example.com', 'https://mzf.mapay.cc.evil.example.com', 'https://mzf-mapay.cc'])(
    `rejects %s`,
    (url) => {
      expect(() => assertPaymentUrl(url, new Set(['pay.example.com']))).toThrow()
    }
  )
})
