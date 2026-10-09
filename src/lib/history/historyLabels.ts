import type { HistoryKind, HistoryStage } from './historyStore'

export const KIND_LABELS: Readonly<Record<HistoryKind, string>> = {
  splitter: 'جداسازی صدا',
  tts: 'تبدیل متن به گفتار',
}

export const STAGE_LABELS: Readonly<Record<HistoryStage, string>> = {
  separated: 'جداسازی انجام شد',
  lyrics: 'متن آهنگ آماده است',
  video: 'ویدئو ساخته شد',
  synthesized: 'گفتار ساخته شد',
}
