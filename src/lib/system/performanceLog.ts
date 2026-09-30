export type ToolId = 'splitter' | 'tts'

interface Sample {
  readonly mediaSeconds: number
  readonly elapsedMs: number
}

const STORAGE_KEY = 'ai-tools-performance'
const MAX_SAMPLES_PER_TOOL = 10
const MIN_MEDIA_SECONDS = 1

class PerformanceLog {
  record(tool: ToolId, mediaSeconds: number, elapsedMs: number): void {
    if (!Number.isFinite(mediaSeconds) || mediaSeconds < MIN_MEDIA_SECONDS || elapsedMs <= 0) return
    const all = this.load()
    const samples = [...(all[tool] ?? []), { mediaSeconds, elapsedMs }].slice(-MAX_SAMPLES_PER_TOOL)
    this.save({ ...all, [tool]: samples })
  }

  speedFactor(tool: ToolId): number | null {
    const samples = this.load()[tool] ?? []
    if (samples.length === 0) return null
    const ratios = samples.map((sample) => sample.elapsedMs / 1000 / sample.mediaSeconds).sort((a, b) => a - b)
    const middle = Math.floor(ratios.length / 2)
    return ratios.length % 2 === 1 ? ratios[middle] : (ratios[middle - 1] + ratios[middle]) / 2
  }

  estimateSeconds(tool: ToolId, mediaSeconds: number): number | null {
    const factor = this.speedFactor(tool)
    return factor === null ? null : factor * mediaSeconds
  }

  sampleCount(tool: ToolId): number {
    return (this.load()[tool] ?? []).length
  }

  private load(): Partial<Record<ToolId, Sample[]>> {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Record<ToolId, Sample[]>>
    } catch {
      return {}
    }
  }

  private save(value: Partial<Record<ToolId, Sample[]>>): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    } catch {
      // storage is optional
    }
  }
}

export const performanceLog = new PerformanceLog()
