export interface ThreadReport {
  readonly crossOriginIsolated: boolean
  readonly hardwareConcurrency: number | null
  readonly numThreads: number
  readonly simd: boolean
  readonly worker: boolean
  readonly sharedArrayBuffer: boolean
}

export function checkThreads(): ThreadReport {
  const hasShared = typeof SharedArrayBuffer !== 'undefined'
  return {
    crossOriginIsolated: window.crossOriginIsolated,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    numThreads: hasShared && window.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1,
    simd: 'WebAssembly' in window && typeof WebAssembly.validate === 'function'
      ? WebAssembly.validate(Uint8Array.of(0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, 0x00, 0x0b, 0x00))
      : false,
    worker: typeof Worker !== 'undefined',
    sharedArrayBuffer: hasShared,
  }
}
