import type { SessionMetaPage, SessionMetaRecord } from '@shared/types'
import { getAccountDBName } from './accountKey'

const DB_NAME = 'chatbox-session-meta'
const STORE_NAME = 'records'
const DEFAULT_PAGE_SIZE = 50

export interface SessionMetaStorage {
  initialize(): Promise<void>
  create(record: SessionMetaRecord): Promise<void>
  createMany(records: SessionMetaRecord[]): Promise<void>
  update(id: string, updates: Partial<SessionMetaRecord>): Promise<SessionMetaRecord | null>
  getById(id: string): Promise<SessionMetaRecord | null>
  delete(id: string): Promise<void>
  deleteMany(ids: string[]): Promise<void>
  getAll(): Promise<SessionMetaRecord[]>
  getPage(cursor: number, limit?: number): Promise<SessionMetaPage>
  getTotal(): Promise<number>
  clear(): Promise<void>
  /** Delete the entire database (for account data cleanup on logout). */
  deleteDatabase(): Promise<void>
}

/**
 * Sort session meta records: starred first (by sortOrder desc), then non-starred (by sortOrder desc).
 * Filters out hidden sessions.
 */
export function sortSessionRecords(sessions: SessionMetaRecord[]): SessionMetaRecord[] {
  return sessions
    .filter((s) => !s.hidden)
    .sort((a, b) => {
      if (a.starred && !b.starred) return -1
      if (!a.starred && b.starred) return 1
      return b.sortOrder - a.sortOrder
    })
}

export class IndexedDBSessionMetaStorage implements SessionMetaStorage {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null
  private accountKey: string | undefined

  constructor(accountKey?: string) {
    this.accountKey = accountKey
  }

  initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise
    }
    this.initPromise = this.openDatabase()
    return this.initPromise
  }

  private openDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const dbName = getAccountDBName(DB_NAME, this.accountKey)
      const request = indexedDB.open(dbName, 1)

      request.onerror = () => reject(request.error)

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('sortOrder', 'sortOrder', { unique: false })
          store.createIndex('createdAt', 'createdAt', { unique: false })
        }
      }
    })
  }

  private getStore(mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) throw new Error('Database not initialized')
    const tx = this.db.transaction(STORE_NAME, mode)
    return tx.objectStore(STORE_NAME)
  }

  async create(record: SessionMetaRecord): Promise<void> {
    await this.initialize()
    return new Promise((resolve, reject) => {
      const store = this.getStore('readwrite')
      const request = store.add(record)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async createMany(records: SessionMetaRecord[]): Promise<void> {
    await this.initialize()
    if (records.length === 0) return
    return new Promise((resolve, reject) => {
      if (!this.db) throw new Error('Database not initialized')
      const tx = this.db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      for (const record of records) {
        store.put(record)
      }
    })
  }

  async update(id: string, updates: Partial<SessionMetaRecord>): Promise<SessionMetaRecord | null> {
    await this.initialize()
    const existing = await this.getById(id)
    if (!existing) return null

    const updated = { ...existing, ...updates }
    return new Promise((resolve, reject) => {
      const store = this.getStore('readwrite')
      const request = store.put(updated)
      request.onsuccess = () => resolve(updated)
      request.onerror = () => reject(request.error)
    })
  }

  async getById(id: string): Promise<SessionMetaRecord | null> {
    await this.initialize()
    return new Promise((resolve, reject) => {
      const store = this.getStore('readonly')
      const request = store.get(id)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  async delete(id: string): Promise<void> {
    await this.initialize()
    return new Promise((resolve, reject) => {
      const store = this.getStore('readwrite')
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async deleteMany(ids: string[]): Promise<void> {
    await this.initialize()
    if (ids.length === 0) return
    return new Promise((resolve, reject) => {
      if (!this.db) throw new Error('Database not initialized')
      const tx = this.db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      for (const id of ids) {
        store.delete(id)
      }
    })
  }

  async getAll(): Promise<SessionMetaRecord[]> {
    await this.initialize()
    return new Promise((resolve, reject) => {
      const store = this.getStore('readonly')
      const request = store.getAll()
      request.onsuccess = () => {
        const records = request.result as SessionMetaRecord[]
        resolve(sortSessionRecords(records))
      }
      request.onerror = () => reject(request.error)
    })
  }

  async getPage(cursor: number = 0, limit: number = DEFAULT_PAGE_SIZE): Promise<SessionMetaPage> {
    await this.initialize()
    const all = await this.getAll()
    const items = all.slice(cursor, cursor + limit)
    const nextCursor = cursor + items.length < all.length ? cursor + items.length : null
    return { items, nextCursor, total: all.length }
  }

  async getTotal(): Promise<number> {
    await this.initialize()
    return new Promise((resolve, reject) => {
      const store = this.getStore('readonly')
      const request = store.count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async clear(): Promise<void> {
    await this.initialize()
    return new Promise((resolve, reject) => {
      const store = this.getStore('readwrite')
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async deleteDatabase(): Promise<void> {
    // Close existing connection first
    if (this.db) {
      this.db.close()
      this.db = null
    }
    this.initPromise = null
    const dbName = getAccountDBName(DB_NAME, this.accountKey)
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => {
        console.warn(`Database deletion blocked for ${dbName}, retrying...`)
        // Retry once after a short delay
        setTimeout(() => {
          const retryRequest = indexedDB.deleteDatabase(dbName)
          retryRequest.onsuccess = () => resolve()
          retryRequest.onerror = () => reject(retryRequest.error)
        }, 1000)
      }
    })
  }
}
