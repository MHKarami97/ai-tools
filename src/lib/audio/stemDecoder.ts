export interface DecodedStem {
  readonly left: Float32Array
  readonly right: Float32Array
  readonly sampleRate: number
}

export class StemDecoder {
  async decode(blob: Blob, sampleRate: number): Promise<DecodedStem> {
    const context = new AudioContext({ sampleRate })
    try {
      const decoded = await context.decodeAudioData(await blob.arrayBuffer())
      const left = decoded.getChannelData(0).slice()
      const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1).slice() : left.slice()
      return { left, right, sampleRate: decoded.sampleRate }
    } finally {
      await context.close()
    }
  }
}

export const stemDecoder = new StemDecoder()
