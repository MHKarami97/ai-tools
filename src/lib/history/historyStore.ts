import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb'
import { ref } from 'vue'

export type HistoryKind = 'splitter' | 'tts'
export type HistoryStage = 'separated' | 'lyrics' | 'video' | 'synthesized'
export type HistoryState = Record<string, unknown>
export type BlobSlots = Readonly<Record<string, Blob | null>>

export interface HistorySummary {
  readonly id: number
  readonly kind: HistoryKind
  readonly createdAt: number
  readonly updatedAt: number
  readonly sourceName: string
  readonly outputs: readonly string[]
  readonly stage: HistoryStage | null
  readonly resumable: boolean
}

export interface HistoryEntry extends HistorySummary {
  readonly state: HistoryState | null
}

export interface NewHistoryEntry {
  readonly kind: HistoryKind
  readonly sourceName: string
  readonly outputs: readonly string[]
  readonly stage: HistoryStage
  readonly state: HistoryState
}

export interface HistoryPatch {
  readonly sourceName?: string
  readonly outputs?: readonly string[]
  readonly stage?: HistoryStage
  readonly state?: HistoryState
}

interface StoredEntry {
  id?: number
  kind: HistoryKind
  createdAt: number
  updatedAt?: number
  sourceName: string
  outputs: string[]
  stage?: HistoryStage | null
  state?: HistoryState | null
}

interface StoredBlob {
  entryId: number
  slot: string
  blob: Blob
}

interface HistoryDb extends DBSchema {
  entries: {
    key: number
    value: StoredEntry
    indexes: { 'by-kind': HistoryKind }
  }
  blobs: {
    key: string
    value: StoredBlob
    indexes: { 'by-entry': number }
  }
}

type HistoryTransaction = IDBPTransaction<HistoryDb, ['entries', 'blobs'], 'readwrite'>

const DB_NAME = 'ai-tools-history'
const DB_VERSION = 2
const ENTRIES = 'entries'
const BLOBS = 'blobs'

class HistoryStore {
  readonly version = ref(0)
  private dbPromise: Promise<IDBPDatabase<HistoryDb>> | null = null

  async add(entry: NewHistoryEntry, blobs: BlobSlots = {}): Promise<number> {
    const database = await this.open()
    const now = Date.now()
    const tx = database.transaction([ENTRIES, BLOBS], 'readwrite')
    const id = await tx.objectStore(ENTRIES).add({
      kind: entry.kind,
      sourceName: entry.sourceName,
      outputs: [...entry.outputs],
      stage: entry.stage,
      state: HistoryStore.toPlain(entry.state),
      createdAt: now,
      updatedAt: now,
    })
    await this.writeBlobs(tx, id, blobs)
    await tx.done
    this.version.value += 1
    return id
  }

  async update(id: number, patch: HistoryPatch, blobs: BlobSlots = {}): Promise<boolean> {
    const database = await this.open()
    const tx = database.transaction([ENTRIES, BLOBS], 'readwrite')
    const store = tx.objectStore(ENTRIES)
    const current = await store.get(id)
    if (!current) {
      await tx.done
      return false
    }
    await store.put({
      ...current,
      sourceName: patch.sourceName ?? current.sourceName,
      outputs: patch.outputs ? [...patch.outputs] : current.outputs,
      stage: patch.stage ?? current.stage ?? null,
      state: patch.state
        ? { ...(current.state ?? {}), ...HistoryStore.toPlain(patch.state) }
        : (current.state ?? null),
      updatedAt: Date.now(),
    })
    await this.writeBlobs(tx, id, blobs)
    await tx.done
    this.version.value += 1
    return true
  }

  async get(id: number): Promise<HistoryEntry | undefined> {
    const database = await this.open()
    const item = await database.get(ENTRIES, id)
    return item ? { ...HistoryStore.summarize(item), state: item.state ?? null } : undefined
  }

  async getBlob(id: number, slot: string): Promise<Blob | undefined> {
    const database = await this.open()
    const stored = await database.get(BLOBS, HistoryStore.blobKey(id, slot))
    return stored?.blob
  }

  async list(kind?: HistoryKind): Promise<HistorySummary[]> {
    const database = await this.open()
    const items = kind
      ? await database.getAllFromIndex(ENTRIES, 'by-kind', kind)
      : await database.getAll(ENTRIES)
    return items.map((item) => HistoryStore.summarize(item)).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async remove(id: number): Promise<void> {
    const database = await this.open()
    const tx = database.transaction([ENTRIES, BLOBS], 'readwrite')
    await this.deleteWithBlobs(tx, id)
    await tx.done
    this.version.value += 1
  }

  async clear(kind?: HistoryKind): Promise<void> {
    const database = await this.open()
    const tx = database.transaction([ENTRIES, BLOBS], 'readwrite')
    if (kind) {
      const ids = await tx.objectStore(ENTRIES).index('by-kind').getAllKeys(kind)
      await Promise.all(ids.map((id) => this.deleteWithBlobs(tx, id)))
    } else {
      await Promise.all([tx.objectStore(ENTRIES).clear(), tx.objectStore(BLOBS).clear()])
    }
    await tx.done
    this.version.value += 1
  }

  private async deleteWithBlobs(tx: HistoryTransaction, id: number): Promise<void> {
    const blobStore = tx.objectStore(BLOBS)
    const keys = await blobStore.index('by-entry').getAllKeys(id)
    await Promise.all([tx.objectStore(ENTRIES).delete(id), ...keys.map((key) => blobStore.delete(key))])
  }

  private async writeBlobs(tx: HistoryTransaction, id: number, blobs: BlobSlots): Promise<void> {
    const store = tx.objectStore(BLOBS)
    const writes = Object.entries(blobs).map(([slot, blob]) => {
      const key = HistoryStore.blobKey(id, slot)
      return blob ? store.put({ entryId: id, slot, blob }, key) : store.delete(key)
    })
    await Promise.all(writes)
  }

  private open(): Promise<IDBPDatabase<HistoryDb>> {
    this.dbPromise ??= openDB<HistoryDb>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          const entries = database.createObjectStore(ENTRIES, { keyPath: 'id', autoIncrement: true })
          entries.createIndex('by-kind', 'kind')
        }
        if (oldVersion < 2) {
          const blobs = database.createObjectStore(BLOBS)
          blobs.createIndex('by-entry', 'entryId')
        }
      },
    })
    return this.dbPromise
  }

  private static blobKey(id: number, slot: string): string {
    return `${id}:${slot}`
  }

  private static toPlain<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
  }

  private static summarize(item: StoredEntry): HistorySummary {
    return {
      id: item.id as number,
      kind: item.kind,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt ?? item.createdAt,
      sourceName: item.sourceName,
      outputs: item.outputs,
      stage: item.stage ?? null,
      resumable: item.state != null,
    }
  }
}

export const historyStore = new HistoryStore()
