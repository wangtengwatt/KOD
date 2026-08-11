import 'fake-indexeddb/auto'
import type { SuanbaoOperation, SuanbaoTodoItem } from '@shared/types/suanbao'
import { afterEach, describe, expect, it } from 'vitest'
import { IndexedDBSuanbaoRepository } from './IndexedDBSuanbaoRepository'
import { MemorySuanbaoRepository } from './MemorySuanbaoRepository'
import type { SuanbaoRepository } from './SuanbaoRepository'

const operation = (id: string, key: string): SuanbaoOperation => ({
  id,
  command: { type: 'confirm', operationId: id },
  action: { kind: 'create-todo', title: '测试' },
  idempotencyKey: key,
  status: 'running',
  createdAt: 1,
  updatedAt: 1,
})

const todo = (id: string): SuanbaoTodoItem => ({
  id,
  title: '测试',
  completed: false,
  createdAt: 1,
  updatedAt: 1,
})

function repositoryContract(name: string, create: () => SuanbaoRepository) {
  describe(name, () => {
    let repository: SuanbaoRepository | null = null

    afterEach(async () => {
      await repository?.deleteDatabase()
      repository = null
    })

    it('provides CRUD and range queries', async () => {
      repository = create()
      await repository.initialize()
      await repository.saveTodo(todo('todo_1'))
      expect(await repository.getTodo('todo_1')).toMatchObject({ title: '测试' })
      await repository.saveReminder({
        id: 'reminder_1',
        title: '提醒',
        triggerAt: 100,
        timezone: 'UTC',
        status: 'scheduled',
        createdAt: 1,
        updatedAt: 1,
        revision: 1,
      })
      expect(await repository.listScheduledReminders(99)).toEqual([])
      expect(await repository.listScheduledReminders(100)).toHaveLength(1)
      await repository.saveCalendarEvent({
        id: 'event_1',
        title: '日程',
        startsAt: 100,
        endsAt: 200,
        timezone: 'UTC',
        createdAt: 1,
        updatedAt: 1,
      })
      expect(await repository.listCalendarEvents({ from: 150, to: 250 })).toHaveLength(1)
      await repository.deleteTodo('todo_1')
      expect(await repository.getTodo('todo_1')).toBeNull()
    })

    it('atomically records an entity result and replays the same operation', async () => {
      repository = create()
      await repository.initialize()
      await repository.saveOperation(operation('operation_1', 'key_1'))
      const first = await repository.executeOperation(operation('operation_1', 'key_1'), todo('todo_1'))
      const second = await repository.executeOperation(operation('operation_1', 'key_1'), todo('todo_2'))
      expect(second.resultEntityId).toBe(first.resultEntityId)
      expect(await repository.listTodos()).toHaveLength(1)
    })
  })
}

repositoryContract('MemorySuanbaoRepository', () => new MemorySuanbaoRepository())
repositoryContract(
  'IndexedDBSuanbaoRepository',
  () => new IndexedDBSuanbaoRepository(`test_${crypto.randomUUID().replaceAll('-', '_')}`)
)

// 第 5 周验证（arch §10.4）：不同 accountKey → 不同 IndexedDB 库，数据互不可见。
describe('IndexedDBSuanbaoRepository account isolation', () => {
  it('different accountKey → different DB (data not shared)', async () => {
    const keyA = `iso_a_${crypto.randomUUID().replaceAll('-', '_')}`
    const keyB = `iso_b_${crypto.randomUUID().replaceAll('-', '_')}`
    const repoA = new IndexedDBSuanbaoRepository(keyA)
    const repoB = new IndexedDBSuanbaoRepository(keyB)
    await repoA.initialize()
    await repoB.initialize()

    await repoA.saveTodo(todo('a_todo'))
    // A 看得到，B 看不到
    expect(await repoA.listTodos()).toHaveLength(1)
    expect(await repoB.listTodos()).toHaveLength(0)

    await repoB.saveTodo(todo('b_todo'))
    // 各自独立
    expect((await repoA.listTodos()).map((t) => t.id)).toEqual(['a_todo'])
    expect((await repoB.listTodos()).map((t) => t.id)).toEqual(['b_todo'])

    await repoA.deleteDatabase()
    await repoB.deleteDatabase()
  })
})

// 第 5 周验证（职责5·查询性能）：大数据量下 list/range 查询返回正确计数（索引/范围语义不退化）。
describe('IndexedDBSuanbaoRepository query volume', () => {
  it('returns correct counts and ranges at volume (500 records)', async () => {
    const repository = new IndexedDBSuanbaoRepository(`vol_${crypto.randomUUID().replaceAll('-', '_')}`)
    await repository.initialize()

    // 500 reminders: triggerAt = 0..499
    for (let i = 0; i < 500; i += 1) {
      await repository.saveReminder({
        id: `r_${i}`,
        title: `提醒${i}`,
        triggerAt: i,
        timezone: 'UTC',
        status: 'scheduled',
        createdAt: i,
        updatedAt: i,
        revision: 1,
      })
    }
    // 500 calendar events: startsAt = i*10, endsAt = i*10+5（均在 0..4995 内）
    for (let i = 0; i < 500; i += 1) {
      await repository.saveCalendarEvent({
        id: `e_${i}`,
        title: `日程${i}`,
        startsAt: i * 10,
        endsAt: i * 10 + 5,
        timezone: 'UTC',
        createdAt: i,
        updatedAt: i,
      })
    }

    // list 全量
    expect(await repository.listReminders()).toHaveLength(500)
    expect(await repository.listCalendarEvents()).toHaveLength(500)
    // 范围查询：triggerAt <= before（before=250 → 0..250 共 251 条）
    expect(await repository.listScheduledReminders(250)).toHaveLength(251)
    expect(await repository.listScheduledReminders(0)).toHaveLength(1)
    // 日程范围重叠：超大区间覆盖全部；无重叠区间返回 0
    expect(await repository.listCalendarEvents({ from: 0, to: 1_000_000 })).toHaveLength(500)
    expect(await repository.listCalendarEvents({ from: 100_000, to: 200_000 })).toHaveLength(0)

    await repository.deleteDatabase()
  })
})
