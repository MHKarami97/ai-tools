import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { ref } from 'vue'

export type HistoryKind = 'splitter' | 'tts'

export interface HistoryEntry {
  readonly id: number
  readonly kind: HistoryKind
  readonly createdAt: number
  readonly sourceName: string
  readonly outputs: readonly string[]
}

export interface NewHistoryEntry {
  readonly kind: HistoryKind
  readonly sourceName: string
  readonly outputs: readonly string[]
}

interface StoredEntry {
  id?: number
  kind: HistoryKind
  createdAt: number
  sourceName: string
  outputs: string[]
}

interface HistoryDb extends DBSchema {
  entries: {
    key: number
    value: StoredEntry
    indexes: { 'by-kind': HistoryKind }
  }
}

const DB_NAME = 'ai-tools-history'
const STORE_NAME = 'entries'

class HistoryStore {
  readonly version = ref(0)
  private dbPromise: Promise<IDBPDatabase<HistoryDb>> | null = null

  async add(entry: NewHistoryEntry): Promise<void> {
    const database = await this.open()
    await database.add(STORE_NAME, {
      kind: entry.kind,
      sourceName: entry.sourceName,
      outputs: [...entry.outputs],
      createdAt: Date.now(),
    })
    this.version.value += 1
  }

  async list(kind: HistoryKind): Promise<HistoryEntry[]> {
    const database = await this.open()
    const items = await database.getAllFromIndex(STORE_NAME, 'by-kind', kind)
    return items
      .map((item) => ({ ...item, id: item.id as number }))
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  async remove(id: number): Promise<void> {
    const database = await this.open()
    await database.delete(STORE_NAME, id)
    this.version.value += 1
  }

  async clear(kind: HistoryKind): Promise<void> {
    const database = await this.open()
    const keys = await database.getAllKeysFromIndex(STORE_NAME, 'by-kind', kind)
    const tx = database.transaction(STORE_NAME, 'readwrite')
    await Promise.all([...keys.map((key) => tx.store.delete(key)), tx.done])
    this.version.value += 1
  }

  private open(): Promise<IDBPDatabase<HistoryDb>> {
    this.dbPromise ??= openDB<HistoryDb>(DB_NAME, 1, {
      upgrade(database) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
        store.createIndex('by-kind', 'kind')
      },
    })
    return this.dbPromise
  }
}

export const historyStore = new HistoryStore()
