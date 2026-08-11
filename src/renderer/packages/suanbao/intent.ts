import type { SuanbaoAction, SuanbaoConfirmation, SuanbaoRouteId } from '@shared/types/suanbao'

export type LocalSuanbaoIntent =
  | { type: 'navigate'; route: SuanbaoRouteId }
  | { type: 'set-visibility'; hidden: boolean }
  | { type: 'set-locked'; locked: boolean }
  | { type: 'confirmation'; confirmation: SuanbaoConfirmation }
  | { type: 'offline-reply'; text: string }

const createId = () => crypto.randomUUID().replaceAll('-', '_')

function confirmation(
  kind: SuanbaoConfirmation['kind'],
  title: string,
  fields: SuanbaoConfirmation['fields'],
  action: SuanbaoAction
) {
  const operationId = createId()
  return {
    type: 'confirmation' as const,
    confirmation: {
      id: createId(),
      operationId,
      kind,
      title,
      fields,
      idempotencyKey: createId(),
      action,
    },
  }
}

function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function parseLocalSuanbaoIntent(input: string, now = new Date()): LocalSuanbaoIntent | null {
  const text = input.trim()
  const normalized = text.toLowerCase()
  if (!text) return null

  if (/^(隐藏蒜宝|hide suanbao|hide)$/i.test(text)) return { type: 'set-visibility', hidden: true }
  if (/^(显示蒜宝|show suanbao|show)$/i.test(text)) return { type: 'set-visibility', hidden: false }
  if (/^(锁定蒜宝|锁定位置|lock suanbao)$/i.test(text)) return { type: 'set-locked', locked: true }
  if (/^(解锁蒜宝|解锁位置|unlock suanbao)$/i.test(text)) return { type: 'set-locked', locked: false }

  if (/(打开|前往).*(图片|生图)|open image/i.test(text)) return { type: 'navigate', route: 'image-creator' }
  if (/(打开|前往).*(任务)|open task/i.test(text)) return { type: 'navigate', route: 'task-home' }
  if (/(打开|前往).*(设置)|open settings/i.test(text)) return { type: 'navigate', route: 'suanbao-settings' }
  if (/(新建|新的).*(聊天|对话)|new chat/i.test(text)) return { type: 'navigate', route: 'new-chat' }

  const todo = text.match(/^(?:新增|添加|创建)?待办[：: ]+(.+)$/i) ?? text.match(/^todo[：: ]+(.+)$/i)
  if (todo?.[1]) {
    const title = todo[1].trim()
    return confirmation('todo', title, [{ label: '事项', value: title }], { kind: 'create-todo', title })
  }

  const pomodoro = text.match(/(?:开始|启动)?(?:一个)?(\d{1,3})?\s*分钟?番茄(?:钟)?/i)
  if (pomodoro) {
    const minutes = Math.min(180, Math.max(1, Number(pomodoro[1] || 25)))
    return confirmation('pomodoro', `开始 ${minutes} 分钟番茄钟`, [{ label: '时长', value: `${minutes} 分钟` }], {
      kind: 'start-pomodoro',
      durationMs: minutes * 60_000,
    })
  }

  const reminder = text.match(/(?:今天)?\s*(\d{1,2})[点:：](\d{1,2})?\s*(?:提醒我)?(.+)/)
  if (reminder) {
    const trigger = new Date(now)
    trigger.setHours(Number(reminder[1]), Number(reminder[2] || 0), 0, 0)
    if (trigger.getTime() <= now.getTime()) trigger.setDate(trigger.getDate() + 1)
    const title = reminder[3].trim()
    const triggerAt = trigger.getTime()
    const timezone = localTimezone()
    return confirmation(
      'reminder',
      title,
      [
        { label: '事项', value: title },
        { label: '时间', value: trigger.toISOString() },
      ],
      { kind: 'create-reminder', title, triggerAt, timezone }
    )
  }

  if (/^(你好|嗨|hi|hello|摸摸头|摸头)$/i.test(normalized)) {
    return { type: 'offline-reply', text: '我在呢。今天也一起把事情做得轻松一点吧。' }
  }

  return null
}
