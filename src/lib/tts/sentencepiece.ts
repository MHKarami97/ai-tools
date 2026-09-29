const MODEL_UNIGRAM = 1
const MODEL_BPE = 2
const TYPE_NORMAL = 1
const TYPE_UNKNOWN = 2
const TYPE_USER_DEFINED = 4
const TYPE_BYTE = 6
const SPACE_MARK = '\u2581'

interface Piece {
  readonly text: string
  readonly score: number
  readonly type: number
}

interface NormalizerOptions {
  addDummyPrefix: boolean
  removeExtraWhitespaces: boolean
  escapeWhitespaces: boolean
}

class ProtoReader {
  private position = 0

  constructor(private readonly bytes: Uint8Array) {}

  get done(): boolean {
    return this.position >= this.bytes.length
  }

  varint(): number {
    let result = 0
    let scale = 1
    for (;;) {
      const byte = this.bytes[this.position++]
      result += (byte & 0x7f) * scale
      if ((byte & 0x80) === 0) return result
      scale *= 128
    }
  }

  tag(): [number, number] {
    const value = this.varint()
    return [Math.floor(value / 8), value % 8]
  }

  bytesField(): Uint8Array {
    const length = this.varint()
    const slice = this.bytes.subarray(this.position, this.position + length)
    this.position += length
    return slice
  }

  float32(): number {
    const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.position, 4).getFloat32(0, true)
    this.position += 4
    return value
  }

  skip(wireType: number): void {
    if (wireType === 0) this.varint()
    else if (wireType === 1) this.position += 8
    else if (wireType === 2) this.bytesField()
    else if (wireType === 5) this.position += 4
    else throw new Error(`Unsupported protobuf wire type ${wireType}`)
  }
}

function parsePiece(bytes: Uint8Array): Piece {
  const reader = new ProtoReader(bytes)
  let text = ''
  let score = 0
  let type = TYPE_NORMAL
  while (!reader.done) {
    const [field, wire] = reader.tag()
    if (field === 1 && wire === 2) text = new TextDecoder().decode(reader.bytesField())
    else if (field === 2 && wire === 5) score = reader.float32()
    else if (field === 3 && wire === 0) type = reader.varint()
    else reader.skip(wire)
  }
  return { text, score, type }
}

function parseModelType(bytes: Uint8Array): number {
  const reader = new ProtoReader(bytes)
  let modelType = MODEL_UNIGRAM
  while (!reader.done) {
    const [field, wire] = reader.tag()
    if (field === 3 && wire === 0) modelType = reader.varint()
    else reader.skip(wire)
  }
  return modelType
}

function parseNormalizer(bytes: Uint8Array): Partial<NormalizerOptions> {
  const reader = new ProtoReader(bytes)
  const options: Partial<NormalizerOptions> = {}
  while (!reader.done) {
    const [field, wire] = reader.tag()
    if (field === 3 && wire === 0) options.addDummyPrefix = reader.varint() !== 0
    else if (field === 4 && wire === 0) options.removeExtraWhitespaces = reader.varint() !== 0
    else if (field === 5 && wire === 0) options.escapeWhitespaces = reader.varint() !== 0
    else reader.skip(wire)
  }
  return options
}

/**
 * Minimal SentencePiece encoder (unigram + BPE) for the ASCII phoneme vocabulary.
 * The precompiled normalization charsmap is intentionally not applied.
 */
export class SentencePieceModel {
  private readonly ids = new Map<string, number>()
  private readonly byteIds = new Map<number, number>()
  private readonly maxPieceLength: number
  private readonly unkId: number
  private readonly unkScore: number

  private constructor(
    private readonly pieces: readonly Piece[],
    private readonly modelType: number,
    private readonly options: NormalizerOptions,
  ) {
    let maxLength = 1
    let minScore = 0
    let unkId = 0
    pieces.forEach((piece, id) => {
      if (piece.type === TYPE_NORMAL || piece.type === TYPE_USER_DEFINED) {
        this.ids.set(piece.text, id)
        maxLength = Math.max(maxLength, Array.from(piece.text).length)
        if (piece.type === TYPE_NORMAL) minScore = Math.min(minScore, piece.score)
      } else if (piece.type === TYPE_UNKNOWN) {
        unkId = id
      } else if (piece.type === TYPE_BYTE) {
        const match = /^<0x([0-9A-Fa-f]{2})>$/.exec(piece.text)
        if (match) this.byteIds.set(parseInt(match[1], 16), id)
      }
    })
    this.maxPieceLength = maxLength
    this.unkId = unkId
    this.unkScore = minScore - 10
  }

  static parse(buffer: ArrayBuffer): SentencePieceModel {
    const reader = new ProtoReader(new Uint8Array(buffer))
    const pieces: Piece[] = []
    let modelType = MODEL_UNIGRAM
    const options: NormalizerOptions = { addDummyPrefix: true, removeExtraWhitespaces: true, escapeWhitespaces: true }
    while (!reader.done) {
      const [field, wire] = reader.tag()
      if (field === 1 && wire === 2) pieces.push(parsePiece(reader.bytesField()))
      else if (field === 2 && wire === 2) modelType = parseModelType(reader.bytesField())
      else if (field === 3 && wire === 2) Object.assign(options, parseNormalizer(reader.bytesField()))
      else reader.skip(wire)
    }
    if (modelType !== MODEL_UNIGRAM && modelType !== MODEL_BPE) {
      throw new Error(`Unsupported SentencePiece model type: ${modelType}`)
    }
    return new SentencePieceModel(pieces, modelType, options)
  }

  encode(text: string): number[] {
    let normalized = text
    if (this.options.removeExtraWhitespaces) normalized = normalized.replace(/\s+/g, ' ').trim()
    if (!normalized) return []
    if (this.options.addDummyPrefix) normalized = ` ${normalized}`
    if (this.options.escapeWhitespaces) normalized = normalized.replaceAll(' ', SPACE_MARK)
    const chars = Array.from(normalized)
    return this.modelType === MODEL_BPE ? this.encodeBpe(chars) : this.encodeUnigram(chars)
  }

  private encodeUnigram(chars: string[]): number[] {
    const length = chars.length
    const best = new Float64Array(length + 1).fill(-Infinity)
    const from = new Int32Array(length + 1).fill(-1)
    const pick = new Int32Array(length + 1).fill(-1)
    best[0] = 0

    for (let i = 0; i < length; i++) {
      if (best[i] === -Infinity) continue
      let piece = ''
      let hasSingle = false
      const limit = Math.min(length, i + this.maxPieceLength)
      for (let j = i; j < limit; j++) {
        piece += chars[j]
        const id = this.ids.get(piece)
        if (id === undefined) continue
        if (j === i) hasSingle = true
        const score = best[i] + this.pieces[id].score
        if (score > best[j + 1]) {
          best[j + 1] = score
          from[j + 1] = i
          pick[j + 1] = id
        }
      }
      if (!hasSingle) {
        const score = best[i] + this.unkScore
        if (score > best[i + 1]) {
          best[i + 1] = score
          from[i + 1] = i
          pick[i + 1] = -1
        }
      }
    }

    const segments: Array<[number, number, number]> = []
    for (let end = length; end > 0; ) {
      const start = from[end]
      segments.push([start, end, pick[end]])
      end = start
    }
    segments.reverse()

    const output: number[] = []
    for (const [start, end, id] of segments) {
      if (id >= 0) output.push(id)
      else this.pushUnknown(chars.slice(start, end).join(''), output)
    }
    return output
  }

  private encodeBpe(chars: string[]): number[] {
    let symbols = chars
    for (;;) {
      let bestIndex = -1
      let bestScore = -Infinity
      for (let i = 0; i < symbols.length - 1; i++) {
        const id = this.ids.get(symbols[i] + symbols[i + 1])
        if (id === undefined) continue
        const score = this.pieces[id].score
        if (score > bestScore) {
          bestScore = score
          bestIndex = i
        }
      }
      if (bestIndex < 0) break
      symbols = [
        ...symbols.slice(0, bestIndex),
        symbols[bestIndex] + symbols[bestIndex + 1],
        ...symbols.slice(bestIndex + 2),
      ]
    }
    const output: number[] = []
    for (const symbol of symbols) {
      const id = this.ids.get(symbol)
      if (id !== undefined) output.push(id)
      else this.pushUnknown(symbol, output)
    }
    return output
  }

  private pushUnknown(text: string, output: number[]): void {
    if (this.byteIds.size > 0) {
      for (const byte of new TextEncoder().encode(text)) output.push(this.byteIds.get(byte) ?? this.unkId)
    } else if (output[output.length - 1] !== this.unkId) {
      output.push(this.unkId)
    }
  }
}
