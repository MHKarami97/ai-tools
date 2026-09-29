import * as ort from 'onnxruntime-web/webgpu'
import type { Backend, BackendPreference } from '@/workers/protocol'

export type ExternalData = ort.InferenceSession.SessionOptions['externalData']

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

export async function detectBackend(preference: BackendPreference): Promise<Backend> {
  return preference === 'auto' && (await hasWebGpu()) ? 'webgpu' : 'wasm'
}

export function createSession(
  model: Uint8Array,
  backend: Backend,
  externalData?: ExternalData,
): Promise<ort.InferenceSession> {
  return ort.InferenceSession.create(model, { executionProviders: [backend], externalData })
}

export async function withBackendFallback<T>(
  preference: BackendPreference,
  build: (backend: Backend) => Promise<T>,
): Promise<{ value: T; backend: Backend }> {
  if ((await detectBackend(preference)) === 'webgpu') {
    try {
      return { value: await build('webgpu'), backend: 'webgpu' }
    } catch {
      // WebGPU session creation failed; fall back to WASM below.
    }
  }
  return { value: await build('wasm'), backend: 'wasm' }
}
