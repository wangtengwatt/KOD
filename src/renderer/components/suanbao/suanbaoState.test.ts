import { createMessage, type Message } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { isSuanbaoBusyState, mapMessagesToSuanbaoState } from './suanbaoState'

function assistant(parts: Message['contentParts'] = []): Message {
  return { ...createMessage('assistant', ''), contentParts: parts }
}

describe('Suanbao state mapping', () => {
  it('maps idle and thinking states', () => {
    expect(mapMessagesToSuanbaoState()).toBe('idle')
    expect(mapMessagesToSuanbaoState([{ ...assistant(), generating: true }])).toBe('thinking')
  })

  it('maps active tool calls to executing', () => {
    const message = assistant([{ type: 'tool-call', state: 'call', toolCallId: '1', toolName: 'read', args: {} }])
    expect(mapMessagesToSuanbaoState([{ ...message, generating: true }])).toBe('executing')
  })

  it('maps terminal results and errors without mutating messages', () => {
    const success = assistant([{ type: 'text', text: 'done' }])
    const failure = { ...assistant(), error: 'failed' }
    expect(mapMessagesToSuanbaoState([success])).toBe('success')
    expect(mapMessagesToSuanbaoState([failure])).toBe('error')
    expect(isSuanbaoBusyState('success')).toBe(false)
  })
})
