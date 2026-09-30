import { Mp3Encoder } from '@breezystack/lamejs'
import type { Mp3Request, Mp3Response } from '@/lib/audio/mp3Protocol'

const BLOCK_SIZE = 1152
const PROGRESS_EVERY_BLOCKS = 200

function toInt16(samples: Float32Array): Int16Array {
  const output = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]))
    output[i] = value < 0 ? value * 0x8000 : value * 0x7fff
  }
  return output
}

function copyBytes(chunk: ArrayBufferView): Uint8Array {
  return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength).slice()
}

class Mp3Job {
  constructor(private readonly request: Mp3Request) {}

  run(onProgress: (fraction: number) => void): Blob {
    const { channels, sampleRate, kbps } = this.request
    const encoder = new Mp3Encoder(channels.length, sampleRate, kbps)
    const left = toInt16(channels[0])
    const right = channels.length > 1 ? toInt16(channels[1]) : null
    const parts: BlobPart[] = []

    for (let offset = 0, block = 0; offset < left.length; offset += BLOCK_SIZE, block += 1) {
      const end = offset + BLOCK_SIZE
      const chunk = right
        ? encoder.encodeBuffer(left.subarray(offset, end), right.subarray(offset, end))
        : encoder.encodeBuffer(left.subarray(offset, end))
      if (chunk.length > 0) parts.push(copyBytes(chunk))
      if (block % PROGRESS_EVERY_BLOCKS === 0) onProgress(offset / left.length)
    }

    const tail = encoder.flush()
    if (tail.length > 0) parts.push(copyBytes(tail))
    return new Blob(parts, { type: 'audio/mpeg' })
  }
}

function reply(message: Mp3Response): void {
  self.postMessage(message)
}

self.onmessage = (event: MessageEvent<Mp3Request>) => {
  try {
    const blob = new Mp3Job(event.data).run((fraction) => reply({ type: 'progress', fraction }))
    reply({ type: 'done', blob })
  } catch (error) {
    reply({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
