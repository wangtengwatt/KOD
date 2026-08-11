import { createMessage, type Language, type Message, SessionSettingsSchema } from '@shared/types'
import type { SuanbaoActivity } from '@shared/types/suanbao'
import { createModel } from '@/adapters'
import { generateText } from '@/packages/model-calls'
import { settingsStore } from '@/stores/settingsStore'

export interface SuanbaoConversationMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: number
}

const MAX_MEMORY_MESSAGES = 24
const controllers = new Map<string, AbortController>()
let memory: SuanbaoConversationMessage[] = []
let activity: SuanbaoActivity = { state: 'idle' }
const listeners = new Set<(activity: SuanbaoActivity) => void>()

const publish = (next: SuanbaoActivity) => {
  activity = next
  for (const listener of listeners) listener(activity)
}

const rolePrompt = (language: Language) => `You are Suanbao, KOD's restrained and friendly garlic companion.
Reply in ${language}. Keep bubble replies concise (normally under 160 Chinese characters or equivalent).
Never claim that a reminder, todo, calendar event, or timer was created unless a deterministic service confirms it.
For complex work, give a short summary and suggest opening KOD. Do not invent weather or calendar facts.`

const toModelMessages = (language: Language, input: string): Message[] => [
  createMessage('system', rolePrompt(language)),
  ...memory.map((item) => createMessage(item.role, item.text)),
  createMessage('user', input),
]

const extractText = (result: Awaited<ReturnType<typeof generateText>>) =>
  result.contentParts
    ?.filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
    .replace(/<think>.*?<\/think>/gs, '')
    .trim() ?? ''

export const suanbaoConversationService = {
  getActivity: () => activity,
  getMemory: () => [...memory],
  subscribe(listener: (next: SuanbaoActivity) => void) {
    listeners.add(listener)
    listener(activity)
    return () => listeners.delete(listener)
  },
  clear() {
    memory = []
    publish({ state: 'idle' })
  },
  async send(input: string): Promise<{ operationId: string; text: string }> {
    const operationId = crypto.randomUUID().replaceAll('-', '_')
    const controller = new AbortController()
    controllers.set(operationId, controller)
    publish({ state: 'thinking', operationId })

    try {
      const globalSettings = settingsStore.getState().getSettings()
      const model = await createModel(SessionSettingsSchema.parse(globalSettings))
      if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      const result = await generateText(model, toModelMessages(globalSettings.language, input))
      if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      const text = extractText(result) || '我暂时没有生成有效回复，请换一种说法试试。'
      const now = Date.now()
      const userMessage: SuanbaoConversationMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text: input,
        createdAt: now,
      }
      const assistantMessage: SuanbaoConversationMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text,
        createdAt: Date.now(),
      }
      memory = [...memory, userMessage, assistantMessage].slice(-MAX_MEMORY_MESSAGES)
      publish({ state: 'success', operationId, message: text })
      return { operationId, text }
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        publish({ state: 'idle' })
        throw error
      }
      publish({ state: 'error', operationId, message: error instanceof Error ? error.message : String(error) })
      throw error
    } finally {
      controllers.delete(operationId)
    }
  },
  cancel(operationId: string) {
    controllers.get(operationId)?.abort()
    controllers.delete(operationId)
    publish({ state: 'idle' })
  },
}
