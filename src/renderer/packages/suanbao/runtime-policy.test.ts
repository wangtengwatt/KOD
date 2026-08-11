import { describe, expect, it } from 'vitest'
import { reduceAnimationLevel, resolveSuanbaoRuntimePolicy } from './runtime-policy'

const enabledInput = {
  platformSupported: true,
  userEnabled: true,
  rolloutMatched: true,
  forceDisabled: false,
  runtimeCircuitBroken: false,
  requestedAnimation: 'full' as const,
  prefersReducedMotion: false,
  pageVisible: true,
}

describe('resolveSuanbaoRuntimePolicy', () => {
  it.each([
    ['unsupported platform', { platformSupported: false }, 'unsupported-platform'],
    ['user disabled', { userEnabled: false }, 'user-disabled'],
    ['remote force disabled', { forceDisabled: true }, 'force-disabled'],
    ['rollout missed', { rolloutMatched: false }, 'rollout-missed'],
    ['runtime circuit broken', { runtimeCircuitBroken: true }, 'runtime-error'],
  ] as const)('disables for %s', (_name, override, reason) => {
    expect(resolveSuanbaoRuntimePolicy({ ...enabledInput, ...override })).toEqual({
      enabled: false,
      animation: 'off',
      reason,
    })
  })

  it('respects reduced motion without changing the enabled state', () => {
    expect(resolveSuanbaoRuntimePolicy({ ...enabledInput, prefersReducedMotion: true })).toEqual({
      enabled: true,
      animation: 'reduced',
    })
  })

  it('does not upgrade a user-selected animation level', () => {
    expect(resolveSuanbaoRuntimePolicy({ ...enabledInput, requestedAnimation: 'off' }).animation).toBe('off')
    expect(reduceAnimationLevel('reduced', 'full')).toBe('reduced')
  })
})
