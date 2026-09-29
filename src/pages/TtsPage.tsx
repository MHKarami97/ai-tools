import React, { useState, useEffect } from 'react'
import { TtsClient } from '@/lib/tts/client'
import { TtsPanel } from '@/components/TtsPanel'
import { downloadModel, loadProgress, clearProgress, allModelsCached, TOTAL_SIZE } from '@/lib/tts/modelDownloader'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatEta(seconds: number | null): string {
  if (seconds === null) return 'نامشخص'
  if (seconds < 60) return `${seconds} ثانیه`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}د و ${remaining}ث`
}

export function TtsPage() {
  const [client] = useState(() => new TtsClient())
  const [isCached, setIsCached] = useState<boolean | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; etaSeconds: number | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    allModelsCached().then((cached) => {
      if (mounted) setIsCached(cached)
    })
    loadProgress().then((state) => {
      if (mounted && state) setProgress(state)
    })
    return () => {
      mounted = false
    }
  }, [])

  const handleDownload = async () => {
    setIsDownloading(true)
    setError(null)
    try {
      await downloadModel((done, total, etaSeconds) => {
        setProgress({ done, total, etaSeconds })
      })
      setIsCached(true)
      await clearProgress()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsDownloading(false)
    }
  }

  const handleClearCache = async () => {
    const db = await import('idb').then((m) => m.openDB('tts-models', 1))
    const tx = db.transaction('files', 'readwrite')
    const store = tx.objectStore('files')
    await store.clear()
    setIsCached(false)
    setProgress(null)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">تبدیل متن به گفتار فارسی</h1>

      <div className="rounded border p-4">
        <h2 className="mb-2 text-lg font-semibold">وضعیت مدل</h2>
        {isCached === null ? (
          <p>در حال بررسی کش...</p>
        ) : isCached ? (
          <div className="space-y-2">
            <p className="text-green-700">مدل‌ها آماده هستند.</p>
            <button className="rounded bg-red-600 px-4 py-2 text-white" onClick={handleClearCache}>
              پاک کردن کش
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p>
              حجم مدل‌ها: {formatBytes(TOTAL_SIZE)}
              {progress && (
                <>
                  {' '}
                  ({formatBytes(progress.done)} دانلود شده)
                </>
              )}
            </p>
            {progress && (
              <div className="w-full rounded bg-gray-200">
                <div
                  className="h-2 rounded bg-blue-600"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
                <p className="text-sm">
                  {Math.round((progress.done / progress.total) * 100)}% - زمان باقی‌مانده: {formatEta(progress.etaSeconds)}
                </p>
              </div>
            )}
            <button
              className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
              onClick={handleDownload}
              disabled={isDownloading}
            >
              {isDownloading ? 'در حال دانلود...' : 'دانلود مدل‌ها'}
            </button>
            {error && <p className="text-red-600">خطا: {error}</p>}
          </div>
        )}
      </div>

      {isCached && <TtsPanel />}
    </div>
  )
}
