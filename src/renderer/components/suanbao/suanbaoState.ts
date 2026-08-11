import type { Message } from '@shared/types'

export type SuanbaoVisualState = 'idle' | 'thinking' | 'executing' | 'success' | 'error'

export function mapMessagesToSuanbaoState(messages?: Message[] | null): SuanbaoVisualState {
  const message = messages?.at(-1)
  if (!message || message.role !== 'assistant') return 'idle'
  if (message.error) return 'error'

  const toolCalls = message.contentParts.filter((part) => part.type === 'tool-call')
  if (message.generating) {
    return toolCalls.some((part) => part.state === 'call') ? 'executing' : 'thinking'
  }

  if (toolCalls.some((part) => part.state === 'error')) return 'error'
  return message.contentParts.length > 0 || message.finishReason ? 'success' : 'idle'
}

export function isSuanbaoBusyState(state: SuanbaoVisualState): boolean {
  return state === 'thinking' || state === 'executing'
}
