export interface SplitterInput {
  readonly type: 'separate'
  readonly left: ArrayBuffer
  readonly right: ArrayBuffer
}

export interface SplitterModelProgress {
  readonly type: 'model-progress'
  readonly loaded: number
  readonly total: number
}

export interface SplitterProgress {
  readonly type: 'progress'
  readonly progress: number
  readonly currentSegment?: number
  readonly totalSegments?: number
}

export interface SplitterStatus {
  readonly type: 'status' | 'log'
  readonly message: string
  readonly phase?: string
}

export interface SplitterDone {
  readonly type: 'done'
  readonly sampleRate: number
  readonly vocalsLeft: ArrayBuffer
  readonly vocalsRight: ArrayBuffer
  readonly instrumentalLeft: ArrayBuffer
  readonly instrumentalRight: ArrayBuffer
}

export interface SplitterError {
  readonly type: 'error'
  readonly message: string
  readonly stack?: string
}

export type SplitterMessage =
  | SplitterModelProgress
  | SplitterProgress
  | SplitterStatus
  | SplitterDone
  | SplitterError
