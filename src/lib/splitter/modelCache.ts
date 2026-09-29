const DB_NAME = 'voice-splitter-cache'
const DB_VERSION = 1
const STORE_NAME = 'models'
export const MODEL_CACHE_KEY = 'htdemucs_embedded-v1'

function openModelDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getCachedModel(): Promise<ArrayBuffer | null> {
  try {
    const db = await openModelDb()
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(MODEL_CACHE_KEY)
      request.onsuccess = () => resolve(request.result instanceof ArrayBuffer ? request.result : null)
      request.onerror = () => reject(request.error)
    })
  } catch {
    return null
  }
}

export async function cacheModel(buffer: ArrayBuffer): Promise<void> {
  try {
    const db = await openModelDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(buffer, MODEL_CACHE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Storage is optional; the in-memory model remains usable.
  }
}

export async function clearCachedModel(): Promise<void> {
  const db = await openModelDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(MODEL_CACHE_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
