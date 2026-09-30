import type { Mp3Request, Mp3Response } from './mp3Protocol'

export function encodeMp3(
  channels: readonly Float32Array[],
  sampleRate: number,
  kbps: number,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/mp3.worker.ts', import.meta.url), { type: 'module' })

    worker.onmessage = (event: MessageEvent<Mp3Response>) => {
      const message = event.data
      if (message.type === 'progress') {
        onProgress?.(message.fraction)
        return
      }
      worker.terminate()
      if (message.type === 'done') resolve(message.blob)
      else reject(new Error(message.message))
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'تبدیل به MP3 ناموفق بود'))
    }

    const copies = channels.map((channel) => channel.slice())
    const request: Mp3Request = { channels: copies, sampleRate, kbps }
    worker.postMessage(request, copies.map((channel) => channel.buffer as ArrayBuffer))
  })
}
