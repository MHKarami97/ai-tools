import { clearCachedModel, getCachedModel, MODEL_CACHE_KEY } from '@/lib/splitter/modelCache'
import { clearTtsModels, listTtsModels } from '@/lib/tts/modelDownloader'

export interface StoredModel {
  readonly name: string
  readonly size: number
}

export interface ModelGroup {
  readonly id: string
  readonly label: string
  readonly models: readonly StoredModel[]
  readonly totalSize: number
}

interface ModelSource {
  readonly id: string
  readonly label: string
  list(): Promise<StoredModel[]>
  clear(): Promise<void>
}

class TtsModelSource implements ModelSource {
  readonly id = 'tts'
  readonly label = 'مدل تبدیل متن به گفتار'

  list(): Promise<StoredModel[]> {
    return listTtsModels()
  }

  clear(): Promise<void> {
    return clearTtsModels()
  }
}

class SplitterModelSource implements ModelSource {
  readonly id = 'splitter'
  readonly label = 'مدل جداسازی صدا (Demucs)'

  async list(): Promise<StoredModel[]> {
    const buffer = await getCachedModel()
    return buffer ? [{ name: MODEL_CACHE_KEY, size: buffer.byteLength }] : []
  }

  clear(): Promise<void> {
    return clearCachedModel()
  }
}

export class ModelInventory {
  constructor(private readonly sources: readonly ModelSource[]) {}

  async snapshot(): Promise<ModelGroup[]> {
    return Promise.all(
      this.sources.map(async (source) => {
        const models = await source.list()
        return {
          id: source.id,
          label: source.label,
          models,
          totalSize: models.reduce((sum, model) => sum + model.size, 0),
        }
      }),
    )
  }

  async clear(id: string): Promise<void> {
    await this.sources.find((source) => source.id === id)?.clear()
  }
}

export const modelInventory = new ModelInventory([new TtsModelSource(), new SplitterModelSource()])
