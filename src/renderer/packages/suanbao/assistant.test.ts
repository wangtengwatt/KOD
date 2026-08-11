import type { SuanbaoConfirmation } from '@shared/types/suanbao'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SuanbaoAssistantService } from './assistant'
import { MemorySuanbaoRepository } from './repositories/MemorySuanbaoRepository'
import { SuanbaoReminderScheduler } from './scheduler'

const confirmation = (overrides: Partial<SuanbaoConfirmation> = {}): SuanbaoConfirmation => ({
  id: 'confirmation_1',
  operationId: 'operation_1',
  kind: 'todo',
  title: '提交周报',
  fields: [{ label: '事项', value: '提交周报' }],
  idempotencyKey: 'idempotency_1',
  action: { kind: 'create-todo', title: '提交周报' },
  ...overrides,
})

describe('SuanbaoAssistantService', () => {
  let repository: MemorySuanbaoRepository
  let service: SuanbaoAssistantService

  beforeEach(() => {
    repository = new MemorySuanbaoRepository()
    service = new SuanbaoAssistantService(repository, undefined, () => 1_000)
  })

  it('persists and executes a confirmation once under concurrent clicks', async () => {
    await service.prepareConfirmation(confirmation())
    const [first, second] = await Promise.all([service.confirm('operation_1'), service.confirm('operation_1')])
    expect(first.operation.resultEntityId).toBe(second.operation.resultEntityId)
    expect(await repository.listTodos()).toHaveLength(1)
  })

  it('allows a later identical request with a new idempotency key', async () => {
    await service.prepareConfirmation(confirmation())
    await service.confirm('operation_1')
    await service.prepareConfirmation(
      confirmation({ id: 'confirmation_2', operationId: 'operation_2', idempotencyKey: 'idempotency_2' })
    )
    await service.confirm('operation_2')
    expect(await repository.listTodos()).toHaveLength(2)
  })

  it('supports todo CRUD', async () => {
    await service.prepareConfirmation(confirmation())
    const result = await service.confirm('operation_1')
    const updated = await service.updateTodo(result.entity.id, { title: '提交月报', completed: true })
    expect(updated).toMatchObject({ title: '提交月报', completed: true })
    await service.deleteTodo(updated.id)
    expect(await service.listTodos()).toEqual([])
  })

  it('persists reminder scheduling data and supports cancellation', async () => {
    const reminderConfirmation = confirmation({
      kind: 'reminder',
      action: {
        kind: 'create-reminder',
        title: '开会',
        triggerAt: 5_000,
        timezone: 'Asia/Shanghai',
        recurrence: 'daily',
      },
    })
    await service.prepareConfirmation(reminderConfirmation)
    const result = await service.confirm('operation_1')
    expect(result.entity).toMatchObject({
      triggerAt: 5_000,
      timezone: 'Asia/Shanghai',
      recurrence: 'daily',
      status: 'scheduled',
      revision: 1,
    })
    const cancelled = await service.cancelReminder(result.entity.id)
    expect(cancelled).toMatchObject({ status: 'cancelled', revision: 2 })
  })

  it('supports local calendar CRUD and validates ranges', async () => {
    const calendarConfirmation = confirmation({
      kind: 'local-calendar-event',
      action: {
        kind: 'create-local-calendar-event',
        title: '评审',
        startsAt: 2_000,
        endsAt: 3_000,
        timezone: 'UTC',
      },
    })
    await service.prepareConfirmation(calendarConfirmation)
    const result = await service.confirm('operation_1')
    expect(await service.listCalendarEvents({ from: 2_500, to: 4_000 })).toHaveLength(1)
    await expect(service.updateCalendarEvent(result.entity.id, { endsAt: 1_000 })).rejects.toThrow(
      'SUANBAO_INVALID_CALENDAR_RANGE'
    )
    await service.deleteCalendarEvent(result.entity.id)
    expect(await service.listCalendarEvents()).toEqual([])
  })
})

describe('SuanbaoReminderScheduler', () => {
  it('fires an overdue one-time reminder once', async () => {
    const repository = new MemorySuanbaoRepository()
    await repository.saveReminder({
      id: 'r1',
      title: '开会',
      triggerAt: 500,
      timezone: 'UTC',
      status: 'scheduled',
      createdAt: 0,
      updatedAt: 0,
      revision: 1,
    })
    const deliver = vi.fn()
    const scheduler = new SuanbaoReminderScheduler(repository, { deliver }, () => 1_000)
    await scheduler.reconcile()
    await scheduler.reconcile()
    expect(deliver).toHaveBeenCalledTimes(1)
    expect(await repository.getReminder('r1')).toMatchObject({ status: 'fired', firedAt: 1_000 })
  })

  it('advances recurring reminders beyond the current time', async () => {
    const repository = new MemorySuanbaoRepository()
    await repository.saveReminder({
      id: 'r1',
      title: '站会',
      triggerAt: 500,
      timezone: 'UTC',
      recurrence: 'daily',
      status: 'scheduled',
      createdAt: 0,
      updatedAt: 0,
      revision: 1,
    })
    const scheduler = new SuanbaoReminderScheduler(repository, undefined, () => 3 * 24 * 60 * 60_000)
    await scheduler.reconcile()
    const reminder = await repository.getReminder('r1')
    expect(reminder?.status).toBe('scheduled')
    expect(reminder?.triggerAt).toBeGreaterThan(3 * 24 * 60 * 60_000)
  })
})
