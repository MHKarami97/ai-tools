export const DUMMY_SAMPLE_RATE = 24000
export const DUMMY_SAMPLES_PER_TOKEN = 2400

const FLOAT = 1
const INT64 = 7

class ProtoWriter {
  private readonly bytes: number[] = []

  private varint(value: number): void {
    let rest = value
    while (rest > 0x7f) {
      this.bytes.push((rest & 0x7f) | 0x80)
      rest = Math.floor(rest / 128)
    }
    this.bytes.push(rest)
  }

  private tag(field: number, wireType: number): void {
    this.varint((field << 3) | wireType)
  }

  int(field: number, value: number): this {
    this.tag(field, 0)
    this.varint(value)
    return this
  }

  raw(field: number, data: ArrayLike<number>): this {
    this.tag(field, 2)
    this.varint(data.length)
    for (let i = 0; i < data.length; i++) this.bytes.push(data[i])
    return this
  }

  string(field: number, value: string): this {
    return this.raw(field, new TextEncoder().encode(value))
  }

  message(field: number, writer: ProtoWriter): this {
    return this.raw(field, writer.toBytes())
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes)
  }
}

function tensor(name: string, dims: number[], dataType: number, data: Uint8Array): ProtoWriter {
  const writer = new ProtoWriter()
  dims.forEach((dim) => writer.int(1, dim))
  return writer.int(2, dataType).string(8, name).raw(9, data)
}

function node(opType: string, inputs: string[], outputs: string[], name: string): ProtoWriter {
  const writer = new ProtoWriter()
  inputs.forEach((input) => writer.string(1, input))
  outputs.forEach((output) => writer.string(2, output))
  return writer.string(3, name).string(4, opType)
}

function valueInfo(name: string, elemType: number, dims: (number | string)[]): ProtoWriter {
  const shape = new ProtoWriter()
  dims.forEach((dim) => {
    const dimension = new ProtoWriter()
    if (typeof dim === 'number') dimension.int(1, dim)
    else dimension.string(2, dim)
    shape.message(1, dimension)
  })
  const tensorType = new ProtoWriter().int(1, elemType).message(2, shape)
  const type = new ProtoWriter().message(1, tensorType)
  return new ProtoWriter().string(1, name).message(2, type)
}

function float32Bytes(values: Float32Array): Uint8Array {
  return new Uint8Array(values.buffer, values.byteOffset, values.byteLength)
}

/**
 * Builds a tiny ONNX model: audio = reshape(sin(freq[1,N,1] * phaseGrid[1,1,S]) * 0.2, [1,-1]).
 * It exists only to prove the worker + onnxruntime-web pipeline end to end.
 */
export function buildDummyTtsModel(): Uint8Array {
  const phaseGrid = new Float32Array(DUMMY_SAMPLES_PER_TOKEN)
  for (let i = 0; i < phaseGrid.length; i++) {
    phaseGrid[i] = (i / DUMMY_SAMPLE_RATE) * 2 * Math.PI
  }

  const graph = new ProtoWriter()
  graph.message(1, node('Mul', ['freq', 'phase_grid'], ['phase'], 'mul_phase'))
  graph.message(1, node('Sin', ['phase'], ['wave'], 'sin_wave'))
  graph.message(1, node('Mul', ['wave', 'amplitude'], ['scaled'], 'mul_amplitude'))
  graph.message(1, node('Reshape', ['scaled', 'flat_shape'], ['audio'], 'reshape_audio'))
  graph.string(2, 'dummy_tts')
  graph.message(5, tensor('phase_grid', [1, 1, DUMMY_SAMPLES_PER_TOKEN], FLOAT, float32Bytes(phaseGrid)))
  graph.message(5, tensor('amplitude', [], FLOAT, float32Bytes(new Float32Array([0.2]))))
  const flatShape = new BigInt64Array([1n, -1n])
  graph.message(5, tensor('flat_shape', [2], INT64, new Uint8Array(flatShape.buffer)))
  graph.message(11, valueInfo('freq', FLOAT, [1, 'N', 1]))
  graph.message(12, valueInfo('audio', FLOAT, [1, 'T']))

  const opset = new ProtoWriter().string(1, '').int(2, 13)
  return new ProtoWriter()
    .int(1, 8)
    .string(2, 'ai-tools')
    .message(7, graph)
    .message(8, opset)
    .toBytes()
}
