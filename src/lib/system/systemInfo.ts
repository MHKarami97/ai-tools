export type GpuProblem = 'insecure-context' | 'api-missing' | 'no-adapter' | 'software-adapter' | 'error'

export interface GpuReport {
  readonly usable: boolean
  readonly problem: GpuProblem | null
  readonly vendor: string
  readonly architecture: string
  readonly description: string
}

export interface SystemReport {
  readonly cores: number | null
  readonly memoryGb: number | null
  readonly crossOriginIsolated: boolean
  readonly userAgent: string
  readonly webglRenderer: string | null
  readonly gpu: GpuReport
}

interface AdapterInfoLike {
  readonly vendor?: string
  readonly architecture?: string
  readonly device?: string
  readonly description?: string
  readonly isFallbackAdapter?: boolean
}

interface AdapterLike {
  readonly info?: AdapterInfoLike
  readonly isFallbackAdapter?: boolean
}

type ProbeNavigator = Navigator & {
  readonly gpu?: { requestAdapter(): Promise<AdapterLike | null> }
  readonly deviceMemory?: number
}

const SOFTWARE_ADAPTER_PATTERN = /swiftshader|llvmpipe|software/i

class SystemProbe {
  async collect(): Promise<SystemReport> {
    const nav = navigator as ProbeNavigator
    return {
      cores: nav.hardwareConcurrency ?? null,
      memoryGb: nav.deviceMemory ?? null,
      crossOriginIsolated: window.crossOriginIsolated,
      userAgent: nav.userAgent,
      webglRenderer: this.readWebglRenderer(),
      gpu: await this.probeGpu(nav),
    }
  }

  private async probeGpu(nav: ProbeNavigator): Promise<GpuReport> {
    if (!window.isSecureContext) return this.failed('insecure-context')
    if (!nav.gpu) return this.failed('api-missing')

    try {
      const adapter = await nav.gpu.requestAdapter()
      if (!adapter) return this.failed('no-adapter')

      const info = adapter.info ?? {}
      const identity = `${info.description ?? ''} ${info.device ?? ''} ${info.vendor ?? ''}`
      const isSoftware =
        (info.isFallbackAdapter ?? adapter.isFallbackAdapter ?? false) || SOFTWARE_ADAPTER_PATTERN.test(identity)

      return {
        usable: !isSoftware,
        problem: isSoftware ? 'software-adapter' : null,
        vendor: info.vendor ?? '',
        architecture: info.architecture ?? '',
        description: info.description ?? '',
      }
    } catch {
      return this.failed('error')
    }
  }

  private failed(problem: GpuProblem): GpuReport {
    return { usable: false, problem, vendor: '', architecture: '', description: '' }
  }

  private readWebglRenderer(): string | null {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl') as WebGLRenderingContext | null
    const extension = context?.getExtension('WEBGL_debug_renderer_info')
    if (!context || !extension) return null
    return String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL))
  }
}

export const systemProbe = new SystemProbe()
