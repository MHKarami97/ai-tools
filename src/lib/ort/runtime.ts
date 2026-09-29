import * as ort from 'onnxruntime-web/webgpu'
import type { Backend } from '@/workers/protocol'

export interface SessionHandle {
  readonly session: ort.InferenceSession
  readonly backend: Backend
}

export { ort }

export function configureOrt(): void {
  ort.env.wasm.wasmPaths = new URL(`${import.meta.env.BASE_URL}ort/`, self.location.href).href
}

async function hasWebGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
  if (!gpu) return false
  try {
    return (await gpu.requestAdapter()) !== null
  } catch {
    return false
  }
}

export async function createSession(model: Uint8Array): Promise<SessionHandle> {
  if (await hasWebGpu()) {
    try {
      const session = await ort.InferenceSession.create(model, { executionProviders: ['webgpu'] })
      return { session, backend: 'webgpu' }
    } catch {
      // WebGPU session creation failed; fall back to WASM below.
    }
  }
  const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] })
  return { session, backend: 'wasm' }
}
