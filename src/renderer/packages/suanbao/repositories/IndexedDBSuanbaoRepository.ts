import type {
  SuanbaoLocalCalendarEvent,
  SuanbaoOperation,
  SuanbaoPomodoroSession,
  SuanbaoReminder,
  SuanbaoTodoItem,
} from '@shared/types/suanbao'
import { getAccountDBName } from '@/storage/accountKey'
import { entityStoreName, type SuanbaoEntity, type SuanbaoRepository } from './SuanbaoRepository'

const STORES = ['operations', 'todos', 'reminders', 'pomodoros', 'local-calendar-events'] as const
type StoreName = (typeof STORES)[number]

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const transactionDone = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
  })

export class IndexedDBSuanbaoRepository implements SuanbaoRepository {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null
  readonly databaseName: string

  constructor(accountKey: string) {
    this.databaseName = getAccountDBName('kod-suanbao', accountKey)
  }

  initialize() {
    if (!this.initPromise) {
      this.initPromise = this.open().catch((error) => {
        this.initPromise = null
        throw error
      })
    }
    return this.initPromise
  }

  private open() {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        this.db.onversionchange = () => {
          this.db?.close()
          this.db = null
          this.initPromise = null
        }
        resolve()
      }
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('operations')) {
          const operations = db.createObjectStore('operations', { keyPath: 'id' })
          operations.createIndex('status', 'status')
          operations.createIndex('updatedAt', 'updatedAt')
          operations.createIndex('idempotencyKey', 'idempotencyKey', { unique: true })
        }
        if (!db.objectStoreNames.contains('todos')) {
          const todos = db.createObjectStore('todos', { keyPath: 'id' })
          todos.createIndex('completed', 'completed')
          todos.createIndex('updatedAt', 'updatedAt')
        }
        if (!db.objectStoreNames.contains('reminders')) {
          const reminders = db.createObjectStore('reminders', { keyPath: 'id' })
          reminders.createIndex('status', 'status')
          reminders.createIndex('triggerAt', 'triggerAt')
        }
        if (!db.objectStoreNames.contains('pomodoros')) {
          const pomodoros = db.createObjectStore('pomodoros', { keyPath: 'id' })
          pomodoros.createIndex('status', 'status')
          pomodoros.createIndex('updatedAt', 'updatedAt')
        }
        if (!db.objectStoreNames.contains('local-calendar-events')) {
          const calendar = db.createObjectStore('local-calendar-events', { keyPath: 'id' })
          calendar.createIndex('startsAt', 'startsAt')
          calendar.createIndex('endsAt', 'endsAt')
        }
      }
    })
  }

  private async transaction(name: StoreName, mode: IDBTransactionMode) {
    await this.initialize()
    if (!this.db) throw new Error('Suanbao database not initialized')
    return this.db.transaction(name, mode)
  }

  private async get<T>(name: StoreName, id: string) {
    const transaction = await this.transaction(name, 'readonly')
    const value = await requestResult(transaction.objectStore(name).get(id))
    return (value as T | undefined) ?? null
  }

  private async put<T>(name: StoreName, value: T) {
    const transaction = await this.transaction(name, 'readwrite')
    transaction.objectStore(name).put(value)
    await transactionDone(transaction)
  }

  private async remove(name: StoreName, id: string) {
    const transaction = await this.transaction(name, 'readwrite')
    transaction.objectStore(name).delete(id)
    await transactionDone(transaction)
  }

  private async list<T>(name: StoreName) {
    const transaction = await this.transaction(name, 'readonly')
    return requestResult(transaction.objectStore(name).getAll()) as Promise<T[]>
  }

  async close() {
    this.db?.close()
    this.db = null
    this.initPromise = null
  }

  getOperation(id: string) {
    return this.get<SuanbaoOperation>('operations', id)
  }
  async getOperationByIdempotencyKey(key: string) {
    const transaction = await this.transaction('operations', 'readonly')
    const value = await requestResult(transaction.objectStore('operations').index('idempotencyKey').get(key))
    return (value as SuanbaoOperation | undefined) ?? null
  }
  async getLatestAwaitingOperation() {
    const operations = await this.list<SuanbaoOperation>('operations')
    return (
      operations
        .filter((operation) => operation.status === 'awaiting-confirmation')
        .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
    )
  }
  saveOperation(operation: SuanbaoOperation) {
    return this.put('operations', operation)
  }

  async executeOperation(operation: SuanbaoOperation, entity: SuanbaoEntity) {
    const duplicate = operation.idempotencyKey
      ? await this.getOperationByIdempotencyKey(operation.idempotencyKey)
      : null
    if (duplicate?.status === 'succeeded') return duplicate

    await this.initialize()
    if (!this.db) throw new Error('Suanbao database not initialized')
    const target = entityStoreName(entity) as StoreName
    const transaction = this.db.transaction(['operations', target], 'readwrite')
    const operations = transaction.objectStore('operations')
    const completed: SuanbaoOperation = {
      ...operation,
      status: 'succeeded',
      resultEntityId: entity.id,
      updatedAt: Date.now(),
    }
    transaction.objectStore(target).put(entity)
    operations.put(completed)
    try {
      await transactionDone(transaction)
      return completed
    } catch (error) {
      if (operation.idempotencyKey) {
        const existing = await this.getOperationByIdempotencyKey(operation.idempotencyKey)
        if (existing?.status === 'succeeded') return existing
      }
      throw error
    }
  }

  async listTodos() {
    return (await this.list<SuanbaoTodoItem>('todos')).sort((a, b) => b.updatedAt - a.updatedAt)
  }
  getTodo(id: string) {
    return this.get<SuanbaoTodoItem>('todos', id)
  }
  saveTodo(todo: SuanbaoTodoItem) {
    return this.put('todos', todo)
  }
  deleteTodo(id: string) {
    return this.remove('todos', id)
  }

  async listReminders() {
    return (await this.list<SuanbaoReminder>('reminders')).sort((a, b) => a.triggerAt - b.triggerAt)
  }
  async listScheduledReminders(before = Number.POSITIVE_INFINITY) {
    return (await this.listReminders()).filter(
      (reminder) => reminder.status === 'scheduled' && reminder.triggerAt <= before
    )
  }
  getReminder(id: string) {
    return this.get<SuanbaoReminder>('reminders', id)
  }
  saveReminder(reminder: SuanbaoReminder) {
    return this.put('reminders', reminder)
  }
  deleteReminder(id: string) {
    return this.remove('reminders', id)
  }

  async listPomodoros() {
    return (await this.list<SuanbaoPomodoroSession>('pomodoros')).sort((a, b) => b.updatedAt - a.updatedAt)
  }
  getPomodoro(id: string) {
    return this.get<SuanbaoPomodoroSession>('pomodoros', id)
  }
  async getActivePomodoro() {
    return (await this.listPomodoros()).find((item) => item.status === 'running' || item.status === 'paused') ?? null
  }
  savePomodoro(session: SuanbaoPomodoroSession) {
    return this.put('pomodoros', session)
  }

  async listCalendarEvents(range?: { from: number; to: number }) {
    return (await this.list<SuanbaoLocalCalendarEvent>('local-calendar-events'))
      .filter((event) => !range || (event.startsAt < range.to && event.endsAt > range.from))
      .sort((a, b) => a.startsAt - b.startsAt)
  }
  getCalendarEvent(id: string) {
    return this.get<SuanbaoLocalCalendarEvent>('local-calendar-events', id)
  }
  saveCalendarEvent(event: SuanbaoLocalCalendarEvent) {
    return this.put('local-calendar-events', event)
  }
  deleteCalendarEvent(id: string) {
    return this.remove('local-calendar-events', id)
  }

  async clearAll() {
    await this.initialize()
    if (!this.db) throw new Error('Suanbao database not initialized')
    const transaction = this.db.transaction([...STORES], 'readwrite')
    for (const name of STORES) transaction.objectStore(name).clear()
    await transactionDone(transaction)
  }

  async deleteDatabase() {
    await this.close()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.databaseName)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Suanbao database deletion blocked'))
    })
  }
}
