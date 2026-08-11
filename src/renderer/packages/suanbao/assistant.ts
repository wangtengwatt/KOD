import type {
  SuanbaoAction,
  SuanbaoConfirmation,
  SuanbaoLocalCalendarEvent,
  SuanbaoOperation,
  SuanbaoPomodoroSession,
  SuanbaoReminder,
  SuanbaoTodoItem,
} from '@shared/types/suanbao'
import { canTransitionSuanbaoOperation } from '@shared/types/suanbao'
import {
  advancePomodoro,
  createPomodoroSession,
  pausePomodoro,
  recoverPomodoro,
  resumePomodoro,
  stopPomodoro,
} from './pomodoro'
import type { SuanbaoRepository } from './repositories/SuanbaoRepository'
import type { SuanbaoReminderScheduler } from './scheduler'

const createId = () => crypto.randomUUID().replaceAll('-', '_')

export interface SuanbaoExecutionResult {
  operation: SuanbaoOperation
  entity: SuanbaoTodoItem | SuanbaoReminder | SuanbaoPomodoroSession | SuanbaoLocalCalendarEvent
  message: string
}

const assertTitle = (title: string) => {
  const value = title.trim()
  if (!value) throw new Error('SUANBAO_TITLE_REQUIRED')
  return value
}

export class SuanbaoAssistantService {
  private readonly executions = new Map<string, Promise<SuanbaoExecutionResult>>()

  constructor(
    private readonly repository: SuanbaoRepository,
    private readonly scheduler?: SuanbaoReminderScheduler,
    private readonly now: () => number = Date.now
  ) {}

  async initialize() {
    await this.repository.initialize()
    await this.recoverPomodoro()
    await this.scheduler?.start()
  }

  async close() {
    await this.scheduler?.stop()
  }

  async prepareConfirmation(confirmation: SuanbaoConfirmation) {
    await this.repository.initialize()
    const existing = await this.repository.getOperation(confirmation.operationId)
    if (existing) return existing
    const duplicate = await this.repository.getOperationByIdempotencyKey(confirmation.idempotencyKey)
    if (duplicate) return duplicate
    const now = this.now()
    const operation: SuanbaoOperation = {
      id: confirmation.operationId,
      command: { type: 'confirm', operationId: confirmation.operationId },
      action: confirmation.action,
      idempotencyKey: confirmation.idempotencyKey,
      status: 'awaiting-confirmation',
      createdAt: now,
      updatedAt: now,
    }
    await this.repository.saveOperation(operation)
    return operation
  }

  getLatestAwaitingOperation() {
    return this.repository.getLatestAwaitingOperation()
  }

  async cancelConfirmation(operationId: string) {
    const operation = await this.requireOperation(operationId)
    if (operation.status === 'cancelled') return operation
    if (!canTransitionSuanbaoOperation(operation.status, 'cancelled')) {
      throw new Error(`SUANBAO_OPERATION_CANNOT_CANCEL:${operation.status}`)
    }
    const cancelled = { ...operation, status: 'cancelled' as const, updatedAt: this.now() }
    await this.repository.saveOperation(cancelled)
    return cancelled
  }

  confirm(operationId: string) {
    let execution = this.executions.get(operationId)
    if (!execution) {
      execution = this.execute(operationId).finally(() => this.executions.delete(operationId))
      this.executions.set(operationId, execution)
    }
    return execution
  }

  private async execute(operationId: string): Promise<SuanbaoExecutionResult> {
    let operation = await this.requireOperation(operationId)
    if (operation.status === 'succeeded') return this.resultFor(operation)
    if (!operation.action) throw new Error('SUANBAO_OPERATION_ACTION_MISSING')
    const action = operation.action
    if (!canTransitionSuanbaoOperation(operation.status, 'running')) {
      throw new Error(`SUANBAO_OPERATION_CANNOT_RUN:${operation.status}`)
    }
    operation = { ...operation, status: 'running', updatedAt: this.now(), errorCode: undefined }
    await this.repository.saveOperation(operation)
    try {
      const entity = await this.createEntity(action)
      const completed = await this.repository.executeOperation(operation, entity)
      if ('triggerAt' in entity) await this.scheduler?.reconcile()
      return { operation: completed, entity, message: this.successMessage(action) }
    } catch (reason) {
      const failed: SuanbaoOperation = {
        ...operation,
        status: 'failed',
        updatedAt: this.now(),
        errorCode: reason instanceof Error ? reason.message : 'SUANBAO_EXECUTION_FAILED',
      }
      await this.repository.saveOperation(failed)
      throw reason
    }
  }

  private async resultFor(operation: SuanbaoOperation): Promise<SuanbaoExecutionResult> {
    if (!operation.resultEntityId || !operation.action) throw new Error('SUANBAO_OPERATION_RESULT_MISSING')
    const entity = await this.getEntity(operation.action, operation.resultEntityId)
    if (!entity) throw new Error('SUANBAO_OPERATION_ENTITY_MISSING')
    return { operation, entity, message: this.successMessage(operation.action) }
  }

  async create(action: SuanbaoAction) {
    const entity = await this.createEntity(action)
    switch (action.kind) {
      case 'create-todo':
        await this.repository.saveTodo(entity as SuanbaoTodoItem)
        break
      case 'create-reminder':
        await this.repository.saveReminder(entity as SuanbaoReminder)
        await this.scheduler?.reconcile()
        break
      case 'start-pomodoro':
        await this.repository.savePomodoro(entity as SuanbaoPomodoroSession)
        break
      case 'create-local-calendar-event':
        await this.repository.saveCalendarEvent(entity as SuanbaoLocalCalendarEvent)
        break
    }
    return entity
  }

  listPomodoros() {
    return this.repository.listPomodoros()
  }

  private async createEntity(action: SuanbaoAction) {
    const now = this.now()
    switch (action.kind) {
      case 'create-todo':
        return {
          id: createId(),
          title: assertTitle(action.title),
          completed: false,
          dueAt: action.dueAt,
          createdAt: now,
          updatedAt: now,
        } satisfies SuanbaoTodoItem
      case 'create-reminder':
        if (!Number.isFinite(action.triggerAt)) throw new Error('SUANBAO_INVALID_REMINDER_TIME')
        return {
          id: createId(),
          title: assertTitle(action.title),
          triggerAt: action.triggerAt,
          timezone: action.timezone,
          recurrence: action.recurrence,
          status: 'scheduled',
          createdAt: now,
          updatedAt: now,
          revision: 1,
        } satisfies SuanbaoReminder
      case 'start-pomodoro': {
        const current = await this.repository.getActivePomodoro()
        if (current) await this.repository.savePomodoro(stopPomodoro(current, now))
        return createPomodoroSession(createId(), action.durationMs, now)
      }
      case 'create-local-calendar-event':
        if (!Number.isFinite(action.startsAt) || !Number.isFinite(action.endsAt) || action.endsAt <= action.startsAt) {
          throw new Error('SUANBAO_INVALID_CALENDAR_RANGE')
        }
        return {
          id: createId(),
          title: assertTitle(action.title),
          startsAt: action.startsAt,
          endsAt: action.endsAt,
          timezone: action.timezone,
          notes: action.notes,
          createdAt: now,
          updatedAt: now,
        } satisfies SuanbaoLocalCalendarEvent
    }
  }

  private getEntity(action: SuanbaoAction, id: string) {
    switch (action.kind) {
      case 'create-todo':
        return this.repository.getTodo(id)
      case 'create-reminder':
        return this.repository.getReminder(id)
      case 'start-pomodoro':
        return this.repository.getPomodoro(id)
      case 'create-local-calendar-event':
        return this.repository.getCalendarEvent(id)
    }
  }

  private successMessage(action: SuanbaoAction) {
    switch (action.kind) {
      case 'create-todo':
        return `已创建待办：${action.title}`
      case 'create-reminder':
        return `已设置提醒：${action.title}`
      case 'start-pomodoro':
        return `番茄钟已开始：${Math.round(action.durationMs / 60_000)} 分钟`
      case 'create-local-calendar-event':
        return `已添加本地日程：${action.title}`
    }
  }

  private async requireOperation(id: string) {
    const operation = await this.repository.getOperation(id)
    if (!operation) throw new Error('SUANBAO_OPERATION_NOT_FOUND')
    return operation
  }

  listTodos() {
    return this.repository.listTodos()
  }
  getTodo(id: string) {
    return this.repository.getTodo(id)
  }
  async updateTodo(id: string, changes: { title?: string; dueAt?: number | null; completed?: boolean }) {
    const todo = await this.repository.getTodo(id)
    if (!todo) throw new Error('SUANBAO_TODO_NOT_FOUND')
    const updated: SuanbaoTodoItem = {
      ...todo,
      title: changes.title === undefined ? todo.title : assertTitle(changes.title),
      dueAt: changes.dueAt === null ? undefined : (changes.dueAt ?? todo.dueAt),
      completed: changes.completed ?? todo.completed,
      updatedAt: this.now(),
    }
    await this.repository.saveTodo(updated)
    return updated
  }
  deleteTodo(id: string) {
    return this.repository.deleteTodo(id)
  }

  listReminders() {
    return this.repository.listReminders()
  }
  getReminder(id: string) {
    return this.repository.getReminder(id)
  }
  async updateReminder(
    id: string,
    changes: Partial<Pick<SuanbaoReminder, 'title' | 'triggerAt' | 'timezone' | 'recurrence' | 'platformScheduleId'>>
  ) {
    const reminder = await this.repository.getReminder(id)
    if (!reminder) throw new Error('SUANBAO_REMINDER_NOT_FOUND')
    const triggerAt = changes.triggerAt ?? reminder.triggerAt
    const timezone = changes.timezone ?? reminder.timezone
    if (!Number.isFinite(triggerAt)) throw new Error('SUANBAO_INVALID_REMINDER_TIME')
    if (!timezone.trim()) throw new Error('SUANBAO_INVALID_TIMEZONE')
    const updated: SuanbaoReminder = {
      ...reminder,
      ...changes,
      title: changes.title === undefined ? reminder.title : assertTitle(changes.title),
      triggerAt,
      timezone,
      status: 'scheduled',
      firedAt: undefined,
      updatedAt: this.now(),
      revision: reminder.revision + 1,
    }
    await this.repository.saveReminder(updated)
    await this.scheduler?.reconcile()
    return updated
  }
  async cancelReminder(id: string) {
    const reminder = await this.repository.getReminder(id)
    if (!reminder) throw new Error('SUANBAO_REMINDER_NOT_FOUND')
    const cancelled: SuanbaoReminder = {
      ...reminder,
      status: 'cancelled',
      updatedAt: this.now(),
      revision: reminder.revision + 1,
    }
    await this.repository.saveReminder(cancelled)
    await this.scheduler?.reconcile()
    return cancelled
  }
  async deleteReminder(id: string) {
    await this.repository.deleteReminder(id)
    await this.scheduler?.reconcile()
  }

  listCalendarEvents(range?: { from: number; to: number }) {
    return this.repository.listCalendarEvents(range)
  }
  getCalendarEvent(id: string) {
    return this.repository.getCalendarEvent(id)
  }
  async updateCalendarEvent(
    id: string,
    changes: Partial<Pick<SuanbaoLocalCalendarEvent, 'title' | 'startsAt' | 'endsAt' | 'timezone' | 'notes'>>
  ) {
    const event = await this.repository.getCalendarEvent(id)
    if (!event) throw new Error('SUANBAO_CALENDAR_EVENT_NOT_FOUND')
    const updated = { ...event, ...changes, updatedAt: this.now() }
    updated.title = assertTitle(updated.title)
    if (!Number.isFinite(updated.startsAt) || !Number.isFinite(updated.endsAt) || updated.endsAt <= updated.startsAt) {
      throw new Error('SUANBAO_INVALID_CALENDAR_RANGE')
    }
    await this.repository.saveCalendarEvent(updated)
    return updated
  }
  deleteCalendarEvent(id: string) {
    return this.repository.deleteCalendarEvent(id)
  }

  async recoverPomodoro() {
    const active = await this.repository.getActivePomodoro()
    if (!active) return null
    const recovered = recoverPomodoro(active, this.now())
    if (recovered.revision !== active.revision) await this.repository.savePomodoro(recovered)
    return recovered
  }
  pausePomodoro() {
    return this.changeActivePomodoro((session) => pausePomodoro(session, this.now()))
  }
  resumePomodoro() {
    return this.changeActivePomodoro((session) => resumePomodoro(session, this.now()))
  }
  skipPomodoro() {
    return this.changeActivePomodoro((session) => advancePomodoro(session, this.now()))
  }
  stopPomodoro() {
    return this.changeActivePomodoro((session) => stopPomodoro(session, this.now()))
  }
  private async changeActivePomodoro(change: (session: SuanbaoPomodoroSession) => SuanbaoPomodoroSession) {
    const active = await this.repository.getActivePomodoro()
    if (!active) throw new Error('SUANBAO_POMODORO_NOT_FOUND')
    const updated = change(active)
    await this.repository.savePomodoro(updated)
    return updated
  }
}
