import { openDB, type IDBPDatabase } from 'idb'
import { MODEL_FILES, type ModelFile } from './modelRegistry'

const DB_NAME = 'tts-models'
const STORE_NAME = 'files'

export interface DownloadProgress {
  readonly fileName: string
  readonly filesDone: number
  readonly fileCount: number
  readonly fraction: number
  readonly downloadedBytes: number
  readonly bytesPerSecond: number
}

export interface CachedModelFile {
  readonly name: string
  readonly size: number
}

class TtsModelStore {
  private dbPromise: Promise<IDBPDatabase> | null = null

  private open(): Promise<IDBPDatabase> {
    this.dbPromise ??= openDB(DB_NAME, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME)
        }
      },
    })
    return this.dbPromise
  }

  async get(name: string): Promise<Blob | undefined> {
    const database = await this.open()
    return database.get(STORE_NAME, name)
  }

  async put(name: string, blob: Blob): Promise<void> {
    const database = await this.open()
    await database.put(STORE_NAME, blob, name)
  }

  async has(name: string): Promise<boolean> {
    const database = await this.open()
    return (await database.getKey(STORE_NAME, name)) !== undefined
  }

  async clear(): Promise<void> {
    const database = await this.open()
    await database.clear(STORE_NAME)
  }

  async list(): Promise<CachedModelFile[]> {
    const database = await this.open()
    const entries: CachedModelFile[] = []
    for (const file of MODEL_FILES) {
      const value: unknown = await database.get(STORE_NAME, file.name)
      if (value instanceof Blob) entries.push({ name: file.name, size: value.size })
    }
    return entries
  }
}

const store = new TtsModelStore()

async function fetchFile(
  file: ModelFile,
  onProgress: (loaded: number, total: number | null) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await fetch(file.url, { signal })
  if (!response.ok) throw new Error(`دانلود ${file.name} ناموفق بود: HTTP ${response.status}`)

  const length = Number(response.headers.get('content-length'))
  const total = Number.isFinite(length) && length > 0 ? length : null

  if (!response.body) {
    const blob = await response.blob()
    onProgress(blob.size, total ?? blob.size)
    return blob
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    onProgress(loaded, total)
  }
  return new Blob(chunks as BlobPart[])
}

export async function downloadModel(
  onProgress: (state: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const startedAt = performance.now()
  const fileCount = MODEL_FILES.length
  let downloadedBytes = 0

  for (const [index, file] of MODEL_FILES.entries()) {
    if (await store.has(file.name)) continue

    const blob = await fetchFile(
      file,
      (loaded, total) => {
        const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001)
        onProgress({
          fileName: file.name,
          filesDone: index,
          fileCount,
          fraction: (index + (total ? loaded / total : 0)) / fileCount,
          downloadedBytes: downloadedBytes + loaded,
          bytesPerSecond: (downloadedBytes + loaded) / elapsedSeconds,
        })
      },
      signal,
    )
    await store.put(file.name, blob)
    downloadedBytes += blob.size
  }
}

export function getModelBlob(name: string): Promise<Blob | undefined> {
  return store.get(name)
}

export async function allModelsCached(): Promise<boolean> {
  for (const file of MODEL_FILES) {
    if (!(await store.has(file.name))) return false
  }
  return true
}

export function listTtsModels(): Promise<CachedModelFile[]> {
  return store.list()
}

export function clearTtsModels(): Promise<void> {
  return store.clear()
}
