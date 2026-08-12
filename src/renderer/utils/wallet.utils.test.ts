import { describe, expect, it } from 'vitest'
import { calculateDiscount, formatCny, formatTopupStatus, paymentMethodName } from './wallet.utils'

describe('wallet display helpers', () => {
  it('formats Chinese yuan with two decimals', () => expect(formatCny(12.5)).toBe('¥12.50'))
  it('calculates authoritative discount', () =>
    expect(calculateDiscount(100, '85')).toEqual({ actual: 85, rate: 0.15, saved: 15 }))
  it('maps known and unknown values', () => {
    expect(formatTopupStatus('pending')).toBe('待支付')
    expect(formatTopupStatus('other')).toBe('未知状态（other）')
    expect(paymentMethodName('alipay', '后端名称')).toBe('支付宝')
    expect(paymentMethodName('custom', '后端名称')).toBe('后端名称')
  })
})
