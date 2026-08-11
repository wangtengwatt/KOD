import { createMessage } from '@shared/types'
import { getDefaultStore } from 'jotai'
import { navigateToSettings } from '@/modals/Settings'
import { router } from '@/router'
import { currentSessionIdAtom } from '@/stores/atoms/sessionAtoms'
import * as chatStore from '@/stores/chatStore'
import { modifyMessage } from '@/stores/session/messages'
import { createEmpty, submitNewUserMessage, switchCurrentSession } from '@/stores/sessionActions'
import { cancelTaskGeneration } from '@/stores/taskSessionActions'
import { taskSessionStore } from '@/stores/taskSessionStore'
import { buildSuanbaoPrompt, type SuanbaoPromptKind } from './suanbaoPrompts'

export { buildSuanbaoPrompt, type SuanbaoPromptKind } from './suanbaoPrompts'

export async function startSuanbaoMessage(input: string): Promise<string> {
  const content = input.trim()
  if (!content) throw new Error('Enter a message first.')
  const session = await createEmpty('chat')
  await submitNewUserMessage(session.id, {
    newUserMsg: createMessage('user', content),
    needGenerating: true,
  })
  return session.id
}

export function startSuanbaoPrompt(kind: SuanbaoPromptKind, input: string): Promise<string> {
  return startSuanbaoMessage(buildSuanbaoPrompt(kind, input))
}

export async function continueRecentChat(): Promise<string | null> {
  const persistedId = getDefaultStore().get(currentSessionIdAtom)
  if (persistedId) {
    const persisted = await chatStore.getSession(persistedId)
    if (persisted && (persisted.type === 'chat' || persisted.type === undefined)) {
      switchCurrentSession(persistedId)
      return persistedId
    }
  }

  const sessions = await chatStore.listSessionsMeta()
  const recent = sessions.find((session) => session.type === 'chat' || session.type === undefined)
  if (!recent) return null
  const validRecent = await chatStore.getSession(recent.id)
  if (!validRecent) return null
  switchCurrentSession(recent.id)
  return recent.id
}

export async function startNewChat(): Promise<void> {
  getDefaultStore().set(currentSessionIdAtom, null)
  await router.navigate({ to: '/' })
}

export async function cancelChatGeneration(sessionId: string): Promise<boolean> {
  const session = await chatStore.getSession(sessionId)
  const message = session?.messages.findLast((item) => item.generating)
  if (!message) return false
  message.cancel?.()
  await modifyMessage(sessionId, { ...message, generating: false, cancel: undefined }, true)
  return true
}

export async function cancelSuanbaoAction(route: { pathname: string; chatSessionId?: string | null }): Promise<void> {
  if (route.pathname.startsWith('/task')) {
    const routeTaskId = route.pathname.startsWith('/task/') ? route.pathname.slice('/task/'.length) : null
    await cancelTaskGeneration(routeTaskId || taskSessionStore.getState().currentTaskId || undefined)
    return
  }
  if (route.chatSessionId) await cancelChatGeneration(route.chatSessionId)
}

export function openSuanbaoSettings(): void {
  navigateToSettings('/suanbao')
}
