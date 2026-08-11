import type {
  SuanbaoLocalCalendarEvent,
  SuanbaoPomodoroSession,
  SuanbaoReminder,
  SuanbaoTodoItem,
} from '@shared/types/suanbao'
import type { SuanbaoRepository } from './repositories/SuanbaoRepository'

const id = () => crypto.randomUUID().replaceAll('-', '_')

export class SuanbaoTodoService {
  constructor(private readonly repository: SuanbaoRepository) {}

  async create(title: string, dueAt?: number, now = Date.now()) {
    const normalized = title.trim()
    if (!normalized) throw new Error('Todo title is required')
    const todo: SuanbaoTodoItem = { id: id(), title: normalized, completed: false, dueAt, createdAt: now, updatedAt: now }
    await this.repository.saveTodo(todo)
    return todo
  }

  list() {
    return this.repository.listTodos()
  }

  async update(id_: string, updates: Partial<Pick<SuanbaoTodoItem, 'title' | 'completed' | 'dueAt'>>, now = Date.now()) {
    const current = await this.repository.getTodo(id_)
    if (!current) return null
    const title = updates.title === undefined ? current.title : updates.title.trim()
    if (!title) throw new Error('Todo title is required')
    const updated = { ...current, ...updates, title, updatedAt: now }
    await this.repository.saveTodo(updated)
    return updated
  }

  delete(id_: string) {
    return this.repository.deleteTodo(id_)
  }
}

export class SuanbaoCalendarService {
  constructor(private readonly repository: SuanbaoRepository) {}

  async create(input: Omit<SuanbaoLocalCalendarEvent, 'id' | 'createdAt' | 'updatedAt'>, now = Date.now()) {
    const title = input.title.trim()
    if (!title) throw new Error('Calendar event title is required')
    if (!Number.isFinite(input.startsAt) || !Number.isFinite(input.endsAt) || input.endsAt <= input.startsAt) {
      throw new Error('Calendar event end must be after start')
    }
    const event: SuanbaoLocalCalendarEvent = { ...input, id: id(), title, createdAt: now, updatedAt: now }
    await this.repository.saveCalendarEvent(event)
    return event
  }

  list(range?: { from: number; to: number }) {
    return this.repository.listCalendarEvents(range)
  }

  async update(id_: string, updates: Partial<Pick<SuanbaoLocalCalendarEvent, 'title' | 'startsAt' | 'endsAt' | 'timezone' | 'notes'>>, now = Date.now()) {
    const current = await this.repository.getCalendarEvent(id_)
    if (!current) return null
    const updated = { ...current, ...updates, updatedAt: now }
    if (!updated.title.trim() || updated.endsAt <= updated.startsAt) throw new Error('Invalid calendar event')
    await this.repository.saveCalendarEvent(updated)
    return updated
  }

  delete(id_: string) {
    return this.repository.deleteCalendarEvent(id_)
  }
}

export class SuanbaoPomodoroService {
  constructor(private readonly repository: SuanbaoRepository) {}

  async start(durationMs: number, now = Date.now()) {
    if (!Number.isFinite(durationMs) || durationMs < 60_000 || durationMs > 10_800_000) {
      throw new Error('Pomodoro duration must be between 1 and 180 minutes')
    }
    const active = await this.repository.getActivePomodoro()
    if (active) throw new Error('A pomodoro is already active')
    const session: SuanbaoPomodoroSession = {
      id: id(),
      phase: 'work',
      status: 'running',
      durationMs,
      startedAt: now,
      endsAt: now + durationMs,
      completedWorkCycles: 0,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    }
    await this.repository.savePomodoro(session)
    return session
  }

  async pause(id_: string, now = Date.now()) {
    const session = await this.repository.getPomodoro(id_)
    if (!session || session.status !== 'running' || !session.endsAt) return null
    const updated: SuanbaoPomodoroSession = {
      ...session,
      status: 'paused',
      remainingMs: Math.max(0, session.endsAt - now),
      startedAt: undefined,
      endsAt: undefined,
      updatedAt: now,
      revision: session.revision + 1,
    }
    await this.repository.savePomodoro(updated)
    return updated
  }

  async resume(id_: string, now = Date.now()) {
    const session = await this.repository.getPomodoro(id_)
    if (!session || session.status !== 'paused') return null
    const remainingMs = session.remainingMs ?? session.durationMs
    const updated: SuanbaoPomodoroSession = {
      ...session,
      status: 'running',
      startedAt: now,
      endsAt: now + remainingMs,
      remainingMs: undefined,
      updatedAt: now,
      revision: session.revision + 1,
    }
    await this.repository.savePomodoro(updated)
    return updated
  }

  async cancel(id_: string, now = Date.now()) {
    const session = await this.repository.getPomodoro(id_)
    if (!session || (session.status !== 'running' && session.status !== 'paused')) return null
    const updated: SuanbaoPomodoroSession = {
      ...session,
      status: 'cancelled',
      updatedAt: now,
      revision: session.revision + 1,
    }
    await this.repository.savePomodoro(updated)
    return updated
  }

  async reconcile(now = Date.now()) {
    const session = await this.repository.getActivePomodoro()
    if (!session || session.status !== 'running' || !session.endsAt || session.endsAt > now) return session
    const completed: SuanbaoPomodoroSession = {
      ...session,
      status: 'completed',
      completedAt: session.endsAt,
      completedWorkCycles: session.phase === 'work' ? session.completedWorkCycles + 1 : session.completedWorkCycles,
      updatedAt: now,
      revision: session.revision + 1,
    }
    await this.repository.savePomodoro(completed)
    return completed
  }
}

export interface SuanbaoReminderNotification {
  notify(reminder: SuanbaoReminder): Promise<void>
}

export class SuanbaoReminderService {
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly repository: SuanbaoRepository,
    private readonly notification: SuanbaoReminderNotification
  ) {}

  async create(input: Pick<SuanbaoReminder, 'title' | 'triggerAt' | 'timezone' | 'recurrence'>, now = Date.now()) {
    if (!input.title.trim() || !Number.isFinite(input.triggerAt)) throw new Error('Invalid reminder')
    const reminder: SuanbaoReminder = {
      ...input,
      id: id(),
      title: input.title.trim(),
      status: 'scheduled',
      createdAt: now,
      updatedAt: now,
      revision: 1,
    }
    await this.repository.saveReminder(reminder)
    await this.scheduleNext(now)
    return reminder
  }

  async cancel(id_: string, now = Date.now()) {
    const reminder = await this.repository.getReminder(id_)
    if (!reminder) return null
    const updated = { ...reminder, status: 'cancelled' as const, updatedAt: now, revision: reminder.revision + 1 }
    await this.repository.saveReminder(updated)
    await this.scheduleNext(now)
    return updated
  }

  async reconcile(now = Date.now()) {
    const reminders = await this.repository.listReminders()
    const due = reminders.filter((item) => item.status === 'scheduled' && item.triggerAt <= now)
    for (const reminder of due) {
      await this.notification.notify(reminder)
      if (reminder.recurrence) {
        const interval = reminder.recurrence === 'daily' ? 86_400_000 : 604_800_000
        let triggerAt = reminder.triggerAt
        while (triggerAt <= now) triggerAt += interval
        await this.repository.saveReminder({
          ...reminder,
          triggerAt,
          firedAt: now,
          updatedAt: now,
          revision: reminder.revision + 1,
        })
      } else {
        await this.repository.saveReminder({
          ...reminder,
          status: 'fired',
          firedAt: now,
          updatedAt: now,
          revision: reminder.revision + 1,
        })
      }
    }
    await this.scheduleNext(now)
    return due
  }

  async scheduleNext(now = Date.now()) {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const next = (await this.repository.listReminders()).find(
      (reminder) => reminder.status === 'scheduled' && reminder.triggerAt > now
    )
    if (!next) return
    const delay = Math.min(next.triggerAt - now, 2_147_000_000)
    this.timer = setTimeout(() => void this.reconcile(), delay)
  }

  stop() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
