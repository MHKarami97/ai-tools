import type { LyricVideoDraft } from './entryStates'
import { historyStore, type HistoryStage } from './historyStore'

export interface LoadedLyricDraft {
  readonly draft: LyricVideoDraft | null
  readonly background: Blob | null
  readonly font: Blob | null
  readonly video: Blob | null
}

export type LyricAssetSlot = 'background' | 'font'

const STAGE_RANK: Readonly<Record<HistoryStage, number>> = {
  separated: 0,
  synthesized: 0,
  lyrics: 1,
  video: 2,
}

export class LyricDraftRepository {
  async load(entryId: number): Promise<LoadedLyricDraft> {
    const [entry, background, font, video] = await Promise.all([
      historyStore.get(entryId),
      historyStore.getBlob(entryId, 'background'),
      historyStore.getBlob(entryId, 'font'),
      historyStore.getBlob(entryId, 'video'),
    ])
    return {
      draft: (entry?.state?.video as LyricVideoDraft | undefined) ?? null,
      background: background ?? null,
      font: font ?? null,
      video: video ?? null,
    }
  }

  async save(entryId: number, draft: LyricVideoDraft, stage?: HistoryStage, video?: Blob): Promise<void> {
    const entry = await historyStore.get(entryId)
    if (!entry) return
    const current = STAGE_RANK[entry.stage ?? 'separated']
    const nextStage = stage && STAGE_RANK[stage] >= current ? stage : undefined
    await historyStore.update(entryId, { stage: nextStage, state: { video: draft } }, video ? { video } : {})
  }

  async saveAsset(entryId: number, slot: LyricAssetSlot, blob: Blob): Promise<void> {
    await historyStore.update(entryId, {}, { [slot]: blob })
  }
}

export const lyricDraftRepository = new LyricDraftRepository()
