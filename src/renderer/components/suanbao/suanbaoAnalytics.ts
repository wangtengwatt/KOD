import { trackingEvent } from '@/packages/event'

export const SUANBAO_ANALYTICS_ACTIONS = [
  'explain_code',
  'analyze_error',
  'continue_recent',
  'new_chat',
  'cancel',
  'hide',
  'settings',
  'open_chat',
] as const

export type SuanbaoAnalyticsAction = (typeof SUANBAO_ANALYTICS_ACTIONS)[number]

export function trackSuanbaoAction(action: SuanbaoAnalyticsAction): void {
  trackingEvent('suanbao_action', { action })
}
