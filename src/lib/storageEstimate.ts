export interface StorageEstimateInfo {
  readonly usage: number
  readonly quota: number
}

export async function estimateStorage(): Promise<StorageEstimateInfo | null> {
  if (!navigator.storage?.estimate) return null
  const { usage = 0, quota = 0 } = await navigator.storage.estimate()
  return { usage, quota }
}

export async function requestPersistentStorage(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false
}
