/** biome-ignore-all lint/suspicious/useAwait: This test adapter intentionally mirrors the asynchronous repository contract. */
import type {
  SuanbaoLocalCalendarEvent,
  SuanbaoOperation,
  SuanbaoPomodoroSession,
  SuanbaoReminder,
  SuanbaoTodoItem,
} from '@shared/types/suanbao'
import { canTransitionSuanbaoOperation } from '@shared/types/suanbao'
import type { SuanbaoEntity, SuanbaoRepository } from './SuanbaoRepository'

const clone = <T>(value: T): T => structuredClone(value)

export class MemorySuanbaoRepository implements SuanbaoRepository {
  private operations = new Map<string, SuanbaoOperation>()
  private todos = new Map<string, SuanbaoTodoItem>()
  private reminders = new Map<string, SuanbaoReminder>()
  private pomodoros = new Map<string, SuanbaoPomodoroSession>()
  private calendarEvents = new Map<string, SuanbaoLocalCalendarEvent>()

  async initialize() {}
  async close() {}

  async getOperation(id: string) {
    const value = this.operations.get(id)
    return value ? clone(value) : null
  }

  async getOperationByIdempotencyKey(key: string) {
    const value = [...this.operations.values()].find((operation) => operation.idempotencyKey === key)
    return value ? clone(value) : null
  }

  async getLatestAwaitingOperation() {
    const value = [...this.operations.values()]
      .filter((operation) => operation.status === 'awaiting-confirmation')
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    return value ? clone(value) : null
  }

  async saveOperation(operation: SuanbaoOperation) {
    this.operations.set(operation.id, clone(operation))
  }

  async executeOperation(operation: SuanbaoOperation, entity: SuanbaoEntity) {
    const existing = this.operations.get(operation.id)
    if (existing?.status === 'succeeded') return clone(existing)
    if (existing && !canTransitionSuanbaoOperation(existing.status, 'running') && existing.status !== 'running') {
      throw new Error(`Cannot execute ${existing.status} operation`)
    }
    const duplicate = operation.idempotencyKey
      ? [...this.operations.values()].find(
          (item) => item.id !== operation.id && item.idempotencyKey === operation.idempotencyKey
        )
      : undefined
    if (duplicate) return clone(duplicate)

    if ('completedWorkCycles' in entity) this.pomodoros.set(entity.id, clone(entity))
    else if ('triggerAt' in entity) this.reminders.set(entity.id, clone(entity))
    else if ('completed' in entity) this.todos.set(entity.id, clone(entity))
    else this.calendarEvents.set(entity.id, clone(entity))

    const completed: SuanbaoOperation = {
      ...operation,
      status: 'succeeded',
      resultEntityId: entity.id,
      updatedAt: Date.now(),
    }
    this.operations.set(operation.id, completed)
    return clone(completed)
  }

  async listTodos() {
    return [...this.todos.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(clone)
  }
  async getTodo(id: string) {
    const value = this.todos.get(id)
    return value ? clone(value) : null
  }
  async saveTodo(todo: SuanbaoTodoItem) {
    this.todos.set(todo.id, clone(todo))
  }
  async deleteTodo(id: string) {
    this.todos.delete(id)
  }

  async listReminders() {
    return [...this.reminders.values()].sort((a, b) => a.triggerAt - b.triggerAt).map(clone)
  }
  async listScheduledReminders(before = Number.POSITIVE_INFINITY) {
    return [...this.reminders.values()]
      .filter((reminder) => reminder.status === 'scheduled' && reminder.triggerAt <= before)
      .sort((a, b) => a.triggerAt - b.triggerAt)
      .map(clone)
  }
  async getReminder(id: string) {
    const value = this.reminders.get(id)
    return value ? clone(value) : null
  }
  async saveReminder(reminder: SuanbaoReminder) {
    this.reminders.set(reminder.id, clone(reminder))
  }
  async deleteReminder(id: string) {
    this.reminders.delete(id)
  }

  async listPomodoros() {
    return [...this.pomodoros.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(clone)
  }
  async getPomodoro(id: string) {
    const value = this.pomodoros.get(id)
    return value ? clone(value) : null
  }
  async getActivePomodoro() {
    const value = [...this.pomodoros.values()]
      .filter((session) => session.status === 'running' || session.status === 'paused')
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    return value ? clone(value) : null
  }
  async savePomodoro(session: SuanbaoPomodoroSession) {
    this.pomodoros.set(session.id, clone(session))
  }

  async listCalendarEvents(range?: { from: number; to: number }) {
    return [...this.calendarEvents.values()]
      .filter((event) => !range || (event.startsAt < range.to && event.endsAt > range.from))
      .sort((a, b) => a.startsAt - b.startsAt)
      .map(clone)
  }
  async getCalendarEvent(id: string) {
    const value = this.calendarEvents.get(id)
    return value ? clone(value) : null
  }
  async saveCalendarEvent(event: SuanbaoLocalCalendarEvent) {
    this.calendarEvents.set(event.id, clone(event))
  }
  async deleteCalendarEvent(id: string) {
    this.calendarEvents.delete(id)
  }

  async clearAll() {
    this.operations.clear()
    this.todos.clear()
    this.reminders.clear()
    this.pomodoros.clear()
    this.calendarEvents.clear()
  }
  async deleteDatabase() {
    await this.clearAll()
  }
}
