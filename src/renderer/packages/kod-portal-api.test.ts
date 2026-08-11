import { describe, expect, it } from 'vitest'
import { isAllowedPaymentUrl } from './kod-portal-api'

describe('Kod Portal mobile contract', () => {
  it('only permits credential-free HTTPS payment URLs', () => {
    expect(isAllowedPaymentUrl('https://pay.example.com/order/1')).toBe(true)
    expect(isAllowedPaymentUrl('http://pay.example.com/order/1')).toBe(false)
    expect(isAllowedPaymentUrl('https://user:secret@pay.example.com/order/1')).toBe(false)
    expect(isAllowedPaymentUrl('javascript:alert(1)')).toBe(false)
  })
})
