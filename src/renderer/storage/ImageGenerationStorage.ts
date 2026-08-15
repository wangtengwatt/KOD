import type { ImageGeneration, ImageGenerationPage } from '@shared/types'
import { getAccountDBName } from './accountKey'

const PAGE_SIZE = 20
const DB_NAME = 'chatbox-image-generation'
const STORE_NAME = 'records'

export interface ImageGenerationStorage {
  initialize(): Promise<void>
  create(record: ImageGeneration): Promise<void>
  update(id: string, updates: Partial<ImageGeneration>): Promise<ImageGeneration | null>
  getById(id: string): Promise<ImageGeneration | null>
  delete(id: string): Promise<void>
  getPage(cursor: number, limit?: number): Promise<ImageGenerationPage>
  getTotal(): Promise<number>
  deleteDatabase(): Promise<void>
}

/** In-memory fallback when IndexedDB is corrupted / unavailable (session-only). */
class MemoryImageGenerationStorage implements ImageGenerationStorage {
  private records = new Map<string, ImageGeneration>()

  async initialize(): Promise<void> {}

  async create(record: ImageGeneration): Promise<void> {
    this.records.set(record.id, record)
  }

  async update(id: string, updates: Partial<ImageGeneration>): Promise<ImageGeneration | null> {
    const existing = this.records.get(id)
    if (!existing) return null
    const updated = { ...existing, ...updates }
    this.records.set(id, updated)
    return updated
  }

  async getById(id: string): Promise<ImageGeneration | null> {
    return this.records.get(id) || null
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id)
  }

  async getPage(cursor: number = 0, limit: number = PAGE_SIZE): Promise<ImageGenerationPage> {
    const items = [...this.records.values()].sort((a, b) => b.createdAt - a.createdAt)
    const page = items.slice(cursor, cursor + limit)
    const nextCursor = cursor + page.length < items.length ? cursor + page.length : null
    return { items: page, nextCursor, total: items.length }
  }

  async getTotal(): Promise<number> {
    return this.records.size
  }

  async deleteDatabase(): Promise<void> {
    this.records.clear()
  }
}

export class IndexedDBImageGenerationStorage implements ImageGenerationStorage {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null
  private memoryFallback: MemoryImageGenerationStorage | null = null
  private accountKey: string | undefined

  constructor(accountKey?: string) {
    this.accountKey = accountKey
  }

  initialize(): Promise<void> {
    if (this.memoryFallback) {
      return this.memoryFallback.initialize()
    }
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this.openWithRecovery().catch((error) => {
      // Allow later retries / fall through to memory on subsequent ops
      this.initPromise = null
      this.db = null
      throw error
    })
    return this.initPromise
  }

  private async openWithRecovery(): Promise<void> {
    try {
      await this.openDatabase()
      return
    } catch (firstError) {
      console.warn('[ImageGenerationStorage] IndexedDB open failed, trying delete+reopen:', firstError)
    }

    try {
      await this.deleteDatabase()
      await this.openDatabase()
      return
    } catch (recoveryError) {
      console.warn(
        '[ImageGenerationStorage] IndexedDB recovery failed, falling back to in-memory storage:',
        recoveryError
      )
      this.db = null
      this.memoryFallback = new MemoryImageGenerationStorage()
      await this.memoryFallback.initialize()
    }
  }

  private openDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const dbName = getAccountDBName(DB_NAME, this.accountKey)
      const request = indexedDB.open(dbName, 1)

      request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'))

      request.onsuccess = () => {
        this.db = request.result
        this.db.onversionchange = () => {
          this.db?.close()
          this.db = null
          this.initPromise = null
        }
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('createdAt', 'createdAt', { unique: false })
        }
      }

      request.onblocked = () => {
        reject(new Error('IndexedDB open blocked'))
      }
    })
  }

  deleteDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close()
        this.db = null
      }
      const dbName = getAccountDBName(DB_NAME, this.accountKey)
      const request = indexedDB.deleteDatabase(dbName)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error || new Error('Failed to delete IndexedDB'))
      // Another connection may briefly block; treat as soft success and retry open
      request.onblocked = () => resolve()
    })
  }

  private async ensureReady(): Promise<ImageGenerationStorage | null> {
    await this.initialize()
    return this.memoryFallback
  }

  private getStore(mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) throw new Error('Database not initialized')
    const tx = this.db.transaction(STORE_NAME, mode)
    return tx.objectStore(STORE_NAME)
  }

  async create(record: ImageGeneration): Promise<void> {
    const fallback = await this.ensureReady()
    if (fallback) return fallback.create(record)

    return new Promise((resolve, reject) => {
      const store = this.getStore('readwrite')
      const request = store.add(record)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async update(id: string, updates: Partial<ImageGeneration>): Promise<ImageGeneration | null> {
    const fallback = await this.ensureReady()
    if (fallback) return fallback.update(id, updates)

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

  async getById(id: string): Promise<ImageGeneration | null> {
    const fallback = await this.ensureReady()
    if (fallback) return fallback.getById(id)

    return new Promise((resolve, reject) => {
      const store = this.getStore('readonly')
      const request = store.get(id)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  async delete(id: string): Promise<void> {
    const fallback = await this.ensureReady()
    if (fallback) return fallback.delete(id)

    return new Promise((resolve, reject) => {
      const store = this.getStore('readwrite')
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getPage(cursor: number = 0, limit: number = PAGE_SIZE): Promise<ImageGenerationPage> {
    const fallback = await this.ensureReady()
    if (fallback) return fallback.getPage(cursor, limit)

    const total = await this.getTotal()

    return new Promise((resolve, reject) => {
      const store = this.getStore('readonly')
      const index = store.index('createdAt')
      const items: ImageGeneration[] = []
      let skipped = 0

      const request = index.openCursor(null, 'prev')

      request.onsuccess = (event) => {
        const cursor_ = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (!cursor_) {
          const nextCursor = cursor + items.length < total ? cursor + items.length : null
          resolve({ items, nextCursor, total })
          return
        }

        if (skipped < cursor) {
          skipped++
          cursor_.continue()
          return
        }

        if (items.length < limit) {
          items.push(cursor_.value)
          cursor_.continue()
        } else {
          const nextCursor = cursor + items.length < total ? cursor + items.length : null
          resolve({ items, nextCursor, total })
        }
      }

      request.onerror = () => reject(request.error)
    })
  }

  async getTotal(): Promise<number> {
    const fallback = await this.ensureReady()
    if (fallback) return fallback.getTotal()

    return new Promise((resolve, reject) => {
      const store = this.getStore('readonly')
      const request = store.count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
}
