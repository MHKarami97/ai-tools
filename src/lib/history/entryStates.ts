import type { TrimSensitivity } from '@/lib/audio/silenceTrimmer'
import type { LyricWord, TimeRange } from '@/lib/lyrics/types'
import type { SynthesisMode } from '@/workers/protocol'

export type LyricVideoDraft = {
  rangeStart: number
  rangeEnd: number
  languageCode: string | null
  modelId: string
  profile: string
  words: readonly LyricWord[]
  lyricsText: string
  maxWordsPerLine: number
  transcribedRange: TimeRange | null
  sizePresetId: string
  customWidth: number
  customHeight: number
  fps: number
  fontId: string
  fontWeight: number
  fontScale: number
  animation: string
  textColor: string
  highlightColor: string
  showContext: boolean
  textShadow: boolean
  backgroundKind: string
  backgroundColor: string
  gradientFrom: string
  gradientTo: string
  gradientAngle: number
  imageDim: number
  resultInfo: string
}

export type SplitterEntryState = {
  ext: 'mp3' | 'wav'
  trimVocals: boolean
  trimInstrumental: boolean
  sensitivity: TrimSensitivity
  minSilenceSeconds: number
  trimStats: { vocals: number; instrumental: number }
  fileBytes: number
  video?: LyricVideoDraft
}

export type TtsEntryState = {
  text: string
  mode: SynthesisMode
  pace: number
}
