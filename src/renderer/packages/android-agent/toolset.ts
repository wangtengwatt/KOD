import { type ToolSet, tool } from 'ai'
import { z } from 'zod'
import { executeAndroidAgentAction } from './executor'

export const androidAgentInstructions = `
<android_agent>
You can inspect and operate only the active, user-started Android agent task. Read the UI immediately before each action.
Every mutating action requires fresh user approval. NEVER automatically send or submit any message or content, even if the
user's goal asks you to send it: you may only prepare text and must leave the final send/submit action to the user. Never attempt
payment, transfer, credentials, verification codes, password fields, files, photos, sharing, bulk messaging, arbitrary intents,
or shell commands. Never target outside the task's allowlisted package. Stop immediately if the foreground app changes.
</android_agent>
`

const selectorSchema = {
  text: z.string().optional(),
  description: z.string().optional(),
  viewId: z.string().optional(),
}

export const androidAgentToolSet: ToolSet = {
  android_read_ui: tool({
    description: 'Read a sanitized summary of the active Android task UI.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(150).optional() }),
    execute: ({ limit }) => executeAndroidAgentAction({ type: 'read', limit }),
  }),
  android_click: tool({
    description: 'Click exactly one non-sensitive element in the active Android task. Requires approval.',
    inputSchema: z.object(selectorSchema),
    execute: (selector) => executeAndroidAgentAction({ type: 'click', ...selector }),
  }),
  android_input_text: tool({
    description: 'Enter non-sensitive text into exactly one editable, non-password field. Requires approval.',
    inputSchema: z.object({ ...selectorSchema, value: z.string().min(1).max(500) }),
    execute: ({ value, ...selector }) => executeAndroidAgentAction({ type: 'input', value, ...selector }),
  }),
  android_scroll: tool({
    description: 'Scroll the active Android task UI. Requires approval.',
    inputSchema: z.object({ direction: z.enum(['forward', 'backward']) }),
    execute: ({ direction }) => executeAndroidAgentAction({ type: 'scroll', direction }),
  }),
  android_back: tool({
    description: 'Navigate back within the active Android task. Requires approval.',
    inputSchema: z.object({}),
    execute: () => executeAndroidAgentAction({ type: 'back' }),
  }),
}
