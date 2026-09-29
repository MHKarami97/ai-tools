export type NpyData = Float32Array | Float64Array | Int32Array | BigInt64Array | Uint8Array

export interface NpyArray {
  readonly dtype: string
  readonly shape: number[]
  readonly data: NpyData
}

const ZIP_END = 0x06054b50
const ZIP_CENTRAL = 0x02014b50
const ZIP64_MARKER = 0xffffffff
const textDecoder = new TextDecoder()

function typedArray(dtype: string, buffer: ArrayBuffer): NpyData {
  switch (dtype) {
    case '<f4':
      return new Float32Array(buffer)
    case '<f8':
      return new Float64Array(buffer)
    case '<i4':
      return new Int32Array(buffer)
    case '<i8':
      return new BigInt64Array(buffer)
    case '|b1':
      return new Uint8Array(buffer)
    default:
      throw new Error(`Unsupported .npy dtype: ${dtype}`)
  }
}

function parseNpy(bytes: Uint8Array): NpyArray {
  const magic = String.fromCharCode(...bytes.subarray(1, 6))
  if (bytes[0] !== 0x93 || magic !== 'NUMPY') throw new Error('Invalid .npy header')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const major = bytes[6]
  const headerLength = major === 1 ? view.getUint16(8, true) : view.getUint32(8, true)
  const headerStart = major === 1 ? 10 : 12
  const header = new TextDecoder('latin1').decode(bytes.subarray(headerStart, headerStart + headerLength))
  const dtype = /'descr':\s*'([^']+)'/.exec(header)?.[1]
  const fortran = /'fortran_order':\s*True/.test(header)
  const shapeText = /'shape':\s*\(([^)]*)\)/.exec(header)?.[1] ?? ''
  if (!dtype || fortran) throw new Error(`Unsupported .npy header: ${header}`)
  const shape = shapeText
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(Number)
  const payload = bytes.slice(headerStart + headerLength).buffer as ArrayBuffer
  return { dtype, shape, data: typedArray(dtype, payload) }
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function parseNpz(buffer: ArrayBuffer): Promise<Map<string, NpyArray>> {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let end = buffer.byteLength - 22
  while (end >= 0 && view.getUint32(end, true) !== ZIP_END) end--
  if (end < 0) throw new Error('Invalid npz archive')

  const entries = view.getUint16(end + 10, true)
  let cursor = view.getUint32(end + 16, true)
  const arrays = new Map<string, NpyArray>()

  for (let i = 0; i < entries; i++) {
    if (view.getUint32(cursor, true) !== ZIP_CENTRAL) throw new Error('Invalid npz central directory')
    const method = view.getUint16(cursor + 10, true)
    let compressedSize = view.getUint32(cursor + 20, true)
    const uncompressedRaw = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    let localOffset = view.getUint32(cursor + 42, true)
    const name = textDecoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))

    let extra = cursor + 46 + nameLength
    const extraEnd = extra + extraLength
    while (extra + 4 <= extraEnd) {
      const id = view.getUint16(extra, true)
      const size = view.getUint16(extra + 2, true)
      if (id === 1) {
        let field = extra + 4
        if (uncompressedRaw === ZIP64_MARKER) field += 8
        if (compressedSize === ZIP64_MARKER) {
          compressedSize = Number(view.getBigUint64(field, true))
          field += 8
        }
        if (localOffset === ZIP64_MARKER) localOffset = Number(view.getBigUint64(field, true))
      }
      extra += 4 + size
    }

    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
    const raw = bytes.subarray(dataStart, dataStart + compressedSize)
    const payload = method === 0 ? raw : method === 8 ? await inflateRaw(raw) : null
    if (!payload) throw new Error(`Unsupported npz compression method ${method}`)
    arrays.set(name.replace(/\.npy$/, ''), parseNpy(payload))
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return arrays
}
