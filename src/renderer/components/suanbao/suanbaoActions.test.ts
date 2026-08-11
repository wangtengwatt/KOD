import { createMessage } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  atomValue: null as string | null,
  setAtom: vi.fn(),
  getSession: vi.fn(),
  listSessionsMeta: vi.fn(),
  switchCurrentSession: vi.fn(),
  modifyMessage: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('jotai', () => ({ getDefaultStore: () => ({ get: () => mocks.atomValue, set: mocks.setAtom }) }))
vi.mock('@/stores/atoms/sessionAtoms', () => ({ currentSessionIdAtom: {} }))
vi.mock('@/stores/chatStore', () => ({ getSession: mocks.getSession, listSessionsMeta: mocks.listSessionsMeta }))
vi.mock('@/stores/session/messages', () => ({ modifyMessage: mocks.modifyMessage }))
vi.mock('@/stores/sessionActions', () => ({
  createEmpty: vi.fn(),
  submitNewUserMessage: vi.fn(),
  switchCurrentSession: mocks.switchCurrentSession,
}))
vi.mock('@/stores/taskSessionActions', () => ({ cancelTaskGeneration: vi.fn() }))
vi.mock('@/stores/taskSessionStore', () => ({ taskSessionStore: { getState: () => ({ currentTaskId: null }) } }))
vi.mock('@/router', () => ({ router: { navigate: mocks.navigate } }))
vi.mock('@/modals/Settings', () => ({ navigateToSettings: vi.fn() }))

import { buildSuanbaoPrompt, cancelChatGeneration, continueRecentChat, startNewChat } from './suanbaoActions'

describe('Suanbao actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.atomValue = null
    mocks.navigate.mockResolvedValue(undefined)
  })

  it('builds explicit code and error prompts without losing input', () => {
    expect(buildSuanbaoPrompt('explain-code', 'const value = 1')).toContain('const value = 1')
    expect(buildSuanbaoPrompt('analyze-error', 'TypeError: nope')).toContain('TypeError: nope')
  })

  it('rejects empty action input', () => {
    expect(() => buildSuanbaoPrompt('explain-code', '  ')).toThrow('Enter code or an error message first.')
  })

  it('continues the validated persisted session before recent metadata', async () => {
    mocks.atomValue = 'persisted'
    mocks.getSession.mockResolvedValue({ id: 'persisted', type: 'chat' })
    expect(await continueRecentChat()).toBe('persisted')
    expect(mocks.listSessionsMeta).not.toHaveBeenCalled()
    expect(mocks.switchCurrentSession).toHaveBeenCalledWith('persisted')
  })

  it('falls back to validated recent metadata when persisted session is invalid', async () => {
    mocks.atomValue = 'missing'
    mocks.getSession.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'recent', type: 'chat' })
    mocks.listSessionsMeta.mockResolvedValue([{ id: 'recent', type: 'chat' }])
    expect(await continueRecentChat()).toBe('recent')
    expect(mocks.switchCurrentSession).toHaveBeenCalledWith('recent')
  })

  it('starts a new chat by clearing selection and navigating home without persistence', async () => {
    await startNewChat()
    expect(mocks.setAtom).toHaveBeenCalledWith(expect.anything(), null)
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/' })
  })

  it('cancels and clears active chat generation', async () => {
    const cancel = vi.fn()
    const message = { ...createMessage('assistant', ''), generating: true, cancel }
    mocks.getSession.mockResolvedValue({ id: 'chat', messages: [message] })
    expect(await cancelChatGeneration('chat')).toBe(true)
    expect(cancel).toHaveBeenCalled()
    expect(mocks.modifyMessage).toHaveBeenCalledWith(
      'chat',
      expect.objectContaining({ generating: false, cancel: undefined }),
      true
    )
  })
})
