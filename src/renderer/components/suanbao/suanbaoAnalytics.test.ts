import { beforeEach, describe, expect, it, vi } from 'vitest'

const { trackingEvent } = vi.hoisted(() => ({ trackingEvent: vi.fn() }))
vi.mock('@/packages/event', () => ({ trackingEvent }))

import { SUANBAO_ANALYTICS_ACTIONS, trackSuanbaoAction } from './suanbaoAnalytics'

describe('Suanbao analytics', () => {
  beforeEach(() => trackingEvent.mockClear())

  it('exposes a fixed content-free action allowlist', () => {
    expect(SUANBAO_ANALYTICS_ACTIONS).toEqual([
      'explain_code',
      'analyze_error',
      'continue_recent',
      'new_chat',
      'cancel',
      'hide',
      'settings',
      'open_chat',
    ])
  })

  it('uses the consent-gated tracking wrapper with only an action', () => {
    trackSuanbaoAction('new_chat')
    expect(trackingEvent).toHaveBeenCalledWith('suanbao_action', { action: 'new_chat' })
  })
})
