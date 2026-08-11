import type { SuanbaoAnimationLevel } from '@shared/types/suanbao'

export interface SuanbaoRuntimePolicyInput {
  platformSupported: boolean
  userEnabled: boolean
  rolloutMatched: boolean
  forceDisabled: boolean
  runtimeCircuitBroken: boolean
  requestedAnimation: SuanbaoAnimationLevel
  prefersReducedMotion: boolean
  pageVisible: boolean
}

export interface SuanbaoRuntimePolicyDecision {
  enabled: boolean
  animation: SuanbaoAnimationLevel
  reason?: 'unsupported-platform' | 'user-disabled' | 'rollout-missed' | 'force-disabled' | 'runtime-error'
}

const ANIMATION_PRIORITY: Record<SuanbaoAnimationLevel, number> = {
  off: 0,
  reduced: 1,
  full: 2,
}

export function reduceAnimationLevel(
  requested: SuanbaoAnimationLevel,
  maximum: SuanbaoAnimationLevel
): SuanbaoAnimationLevel {
  return ANIMATION_PRIORITY[requested] <= ANIMATION_PRIORITY[maximum] ? requested : maximum
}

export function resolveSuanbaoRuntimePolicy(input: SuanbaoRuntimePolicyInput): SuanbaoRuntimePolicyDecision {
  if (!input.platformSupported) return { enabled: false, animation: 'off', reason: 'unsupported-platform' }
  if (!input.userEnabled) return { enabled: false, animation: 'off', reason: 'user-disabled' }
  if (input.forceDisabled) return { enabled: false, animation: 'off', reason: 'force-disabled' }
  if (!input.rolloutMatched) return { enabled: false, animation: 'off', reason: 'rollout-missed' }
  if (input.runtimeCircuitBroken) return { enabled: false, animation: 'off', reason: 'runtime-error' }

  const systemMaximum = input.prefersReducedMotion || !input.pageVisible ? 'reduced' : 'full'
  return {
    enabled: true,
    animation: reduceAnimationLevel(input.requestedAnimation, systemMaximum),
  }
}
