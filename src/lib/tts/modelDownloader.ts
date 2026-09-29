import { openDB, type IDBPDatabase } from 'idb'
import { MODEL_FILES, type ModelFile } from './modelRegistry'

const DB_NAME = 'tts-models'
const STORE_NAME = 'files'
const PROGRESS_KEY = 'download-progress'

interface ProgressState {
  done: number
  total: number
  etaSeconds: number | null
}

let dbPromise: Promise<IDBPDatabase> | null = null

async function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME)
        }
      },
    })
  }
  return dbPromise
}

export async function saveProgress(done: number, total: number, etaSeconds: number | null): Promise<void> {
  const database = await db()
  await database.put(STORE_NAME, { done, total, etaSeconds }, PROGRESS_KEY)
}

export async function loadProgress(): Promise<ProgressState | null> {
  const database = await db()
  return database.get(STORE_NAME, PROGRESS_KEY)
}

export async function clearProgress(): Promise<void> {
  const database = await db()
  await database.delete(STORE_NAME, PROGRESS_KEY)
}

export async function downloadModel(
  onProgress: (done: number, total: number, etaSeconds: number | null) => void,
): Promise<void> {
  const database = await db()
  let downloadedBytes = 0
  const startTime = Date.now()

  for (const file of MODEL_FILES) {
    const response = await fetch(file.url)
    if (!response.ok) throw new Error(`دانلود ${file.name} ناموفق بود: ${response.status}`)
    const blob = await response.blob()
    await database.put(STORE_NAME, blob, file.name)
    downloadedBytes += file.size
    const elapsedSeconds = (Date.now() - startTime) / 1000
    const speed = downloadedBytes / elapsedSeconds
    const remainingBytes = TOTAL_SIZE - downloadedBytes
    const etaSeconds = speed > 0 ? Math.ceil(remainingBytes / speed) : null
    onProgress(downloadedBytes, TOTAL_SIZE, etaSeconds)
    await saveProgress(downloadedBytes, TOTAL_SIZE, etaSeconds)
  }
}

export async function getModelBlob(name: string): Promise<Blob | null> {
  const database = await db()
  return database.get(STORE_NAME, name)
}

export async function allModelsCached(): Promise<boolean> {
  const database = await db()
  const tx = database.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  for (const file of MODEL_FILES) {
    const blob = await store.get(file.name)
    if (!blob) return false
  }
  return true
}
