import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export interface ModelInfo {
  readonly name: string
  readonly size: number
  readonly savedAt: number
}

interface ModelCacheDb extends DBSchema {
  blobs: { key: string; value: Blob }
  meta: { key: string; value: ModelInfo }
}

const DB_NAME = 'ai-tools-models'
const DB_VERSION = 1

class ModelCache {
  private dbPromise: Promise<IDBPDatabase<ModelCacheDb>> | null = null

  private getDb(): Promise<IDBPDatabase<ModelCacheDb>> {
    this.dbPromise ??= openDB<ModelCacheDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('blobs')
        db.createObjectStore('meta', { keyPath: 'name' })
      },
    })
    return this.dbPromise
  }

  async save(name: string, blob: Blob): Promise<void> {
    const db = await this.getDb()
    const tx = db.transaction(['blobs', 'meta'], 'readwrite')
    const info: ModelInfo = { name, size: blob.size, savedAt: Date.now() }
    await Promise.all([tx.objectStore('blobs').put(blob, name), tx.objectStore('meta').put(info), tx.done])
  }

  async load(name: string): Promise<Blob | null> {
    const db = await this.getDb()
    return (await db.get('blobs', name)) ?? null
  }

  async remove(name: string): Promise<void> {
    const db = await this.getDb()
    const tx = db.transaction(['blobs', 'meta'], 'readwrite')
    await Promise.all([tx.objectStore('blobs').delete(name), tx.objectStore('meta').delete(name), tx.done])
  }

  async list(): Promise<ModelInfo[]> {
    const db = await this.getDb()
    const items = await db.getAll('meta')
    return items.sort((a, b) => a.name.localeCompare(b.name))
  }
}

export const modelCache = new ModelCache()

export const saveModel = (name: string, blob: Blob): Promise<void> => modelCache.save(name, blob)
export const loadModel = (name: string): Promise<Blob | null> => modelCache.load(name)
export const deleteModel = (name: string): Promise<void> => modelCache.remove(name)
export const listModels = (): Promise<ModelInfo[]> => modelCache.list()
