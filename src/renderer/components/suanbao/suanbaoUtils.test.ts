import { describe, expect, it } from 'vitest'
import { clampNormalizedPosition, normalizedToPixels, pixelsToNormalized, shouldShowSuanbao } from './suanbaoUtils'

describe('Suanbao position utilities', () => {
  it('clamps invalid and out-of-range normalized coordinates', () => {
    expect(clampNormalizedPosition({ x: -2, y: 4 })).toEqual({ x: 0, y: 1 })
    expect(clampNormalizedPosition({ x: Number.NaN, y: Number.NaN })).toEqual({ x: 0.9, y: 0.78 })
  })

  it('round-trips safe positions through viewport pixels', () => {
    const bounds = { width: 1000, height: 700, petWidth: 100, petHeight: 120, margin: 10 }
    const normalized = { x: 0.25, y: 0.75 }
    const pixels = normalizedToPixels(normalized, bounds)
    expect(pixelsToNormalized(pixels, bounds)).toEqual(normalized)
  })

  it('only displays on approved content routes', () => {
    expect(shouldShowSuanbao('/', false)).toBe(true)
    expect(shouldShowSuanbao('/session/abc', false)).toBe(true)
    expect(shouldShowSuanbao('/task/abc', false)).toBe(true)
    expect(shouldShowSuanbao('/image-creator', false)).toBe(true)
    expect(shouldShowSuanbao('/copilots', false)).toBe(true)
    expect(shouldShowSuanbao('/settings/suanbao', false)).toBe(false)
    expect(shouldShowSuanbao('/', true)).toBe(false)
  })
})
