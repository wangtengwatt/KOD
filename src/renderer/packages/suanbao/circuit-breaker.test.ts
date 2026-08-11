import { describe, expect, it } from 'vitest'
import { SuanbaoCircuitBreaker } from './circuit-breaker'

describe('SuanbaoCircuitBreaker', () => {
  it('breaks only after the configured number of failures in the time window', () => {
    let now = 0
    const breaker = new SuanbaoCircuitBreaker({ threshold: 3, windowMs: 1000, now: () => now })
    expect(breaker.recordFailure()).toBe(false)
    now = 400
    expect(breaker.recordFailure()).toBe(false)
    now = 800
    expect(breaker.recordFailure()).toBe(true)
  })

  it('forgets failures outside the time window and can be reset', () => {
    let now = 0
    const breaker = new SuanbaoCircuitBreaker({ threshold: 2, windowMs: 100, now: () => now })
    breaker.recordFailure()
    now = 101
    expect(breaker.recordFailure()).toBe(false)
    expect(breaker.isBroken()).toBe(false)
    breaker.recordFailure()
    expect(breaker.isBroken()).toBe(true)
    breaker.reset()
    expect(breaker.isBroken()).toBe(false)
  })
})
