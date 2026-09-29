export interface Segment {
  readonly audio: Float32Array
  readonly gap: number
}

export function concatFloat32(parts: readonly Float32Array[]): Float32Array {
  const output = new Float32Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

export function rms(values: Float32Array): number {
  if (values.length === 0) return 0
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i] * values[i]
  return Math.sqrt(sum / values.length)
}

function peak(values: Float32Array): number {
  let maximum = 0
  for (let i = 0; i < values.length; i++) maximum = Math.max(maximum, Math.abs(values[i]))
  return maximum
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function ramp(index: number, length: number, rising: boolean): number {
  const position = length > 1 ? index / (length - 1) : 0
  return rising ? position : 1 - position
}

function fadeIn(values: Float32Array, length: number): void {
  for (let i = 0; i < length; i++) values[i] *= ramp(i, length, true)
}

function fadeOut(values: Float32Array, length: number): void {
  const start = values.length - length
  for (let i = 0; i < length; i++) values[start + i] *= ramp(i, length, false)
}

function windowMean(values: Float32Array, size: number): Float32Array {
  const length = values.length
  const cumulative = new Float64Array(length + 1)
  for (let i = 0; i < length; i++) cumulative[i + 1] = cumulative[i] + values[i]
  const start = (size - 1) >> 1
  const output = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const k = start + i
    const low = Math.max(k - size + 1, 0)
    const high = Math.min(k + 1, length)
    output[i] = (cumulative[high] - cumulative[low]) / size
  }
  return output
}

export function deadAirRegions(
  audio: Float32Array,
  sampleRate: number,
  relFloor = 0.03,
  windowSeconds = 0.25,
  density = 0.9,
): Array<[number, number]> {
  const level = rms(audio)
  if (level < 1e-6 || audio.length < 3) return []
  const threshold = relFloor * level
  const quiet = new Float32Array(audio.length)
  for (let i = 0; i < audio.length; i++) quiet[i] = Math.abs(audio[i]) < threshold ? 1 : 0
  const dense = windowMean(quiet, Math.max(1, Math.floor(windowSeconds * sampleRate)))

  const merged: Array<[number, number]> = []
  let i = 0
  while (i < audio.length) {
    if (dense[i] < density) {
      i++
      continue
    }
    let end = i
    while (end < audio.length && dense[end] >= density) end++
    let from = i
    let to = end
    while (from > 0 && quiet[from - 1]) from--
    while (to < audio.length && quiet[to]) to++
    const last = merged[merged.length - 1]
    if (last && from <= last[1]) last[1] = Math.max(last[1], to)
    else merged.push([from, to])
    i = end
  }
  return merged
}

export function speechBounds(
  audio: Float32Array,
  sampleRate: number,
  relFloor = 0.03,
  headKeep = 0.02,
  tailKeep = 0.06,
  minRun = 0.03,
): [number, number] {
  const level = rms(audio)
  if (level < 1e-6) return [0, audio.length]
  const threshold = relFloor * level
  const loud = new Float32Array(audio.length)
  for (let i = 0; i < audio.length; i++) loud[i] = Math.abs(audio[i]) >= threshold ? 1 : 0
  const dense = windowMean(loud, 2 * Math.max(1, Math.floor(minRun * sampleRate)))
  let first = -1
  let last = -1
  for (let i = 0; i < dense.length; i++) {
    if (dense[i] >= 0.6) {
      if (first < 0) first = i
      last = i
    }
  }
  if (first < 0) return [0, audio.length]
  return [
    Math.max(0, first - Math.floor(headKeep * sampleRate)),
    Math.min(audio.length, last + Math.floor(tailKeep * sampleRate)),
  ]
}

export function solidFraction(speech: Float32Array, sampleRate: number, floor = 0.05, windowSeconds = 0.04): number {
  if (speech.length < 3) return 1
  const size = Math.max(1, Math.floor(windowSeconds * sampleRate))
  const windows = Math.floor(speech.length / size)
  if (windows === 0) return 1
  let solid = 0
  for (let i = 0; i < windows; i++) {
    if (rms(speech.subarray(i * size, (i + 1) * size)) >= floor) solid++
  }
  return solid / windows
}

export function compressPauses(
  audio: Float32Array,
  sampleRate: number,
  maxPause = 0.38,
  keep = 0.28,
  relFloor = 0.03,
): Float32Array {
  const regions = deadAirRegions(audio, sampleRate, relFloor).filter(([from, to]) => to - from > Math.floor(maxPause * sampleRate))
  if (regions.length === 0) return audio
  const fade = Math.max(1, Math.floor(0.008 * sampleRate))
  const parts: Float32Array[] = []
  let position = 0
  for (const [from, to] of regions) {
    parts.push(audio.subarray(position, from))
    const segment = audio.slice(from, Math.min(from + Math.floor(keep * sampleRate), to))
    if (segment.length > 2 * fade) fadeOut(segment, fade)
    parts.push(segment)
    const next = audio.slice(to, to + fade)
    if (next.length === fade) fadeIn(next, fade)
    parts.push(next)
    position = to + fade
  }
  parts.push(audio.subarray(position))
  return concatFloat32(parts)
}

export function stitch(segments: readonly Segment[], sampleRate: number): Float32Array {
  if (segments.length === 0) return new Float32Array(0)
  const target = median(segments.filter((segment) => segment.audio.length > 0).map((segment) => rms(segment.audio)))
  const fade = Math.max(1, Math.floor(0.008 * sampleRate))
  const parts: Float32Array[] = []
  for (const { audio, gap } of segments) {
    const level = rms(audio)
    const gain = level > 1e-6 && target > 1e-6 ? Math.min(2.5, Math.max(0.4, target / level)) : 1
    const scaled = audio.map((value) => value * gain)
    if (scaled.length > 2 * fade) {
      fadeIn(scaled, fade)
      fadeOut(scaled, fade)
    }
    if (gap > 0) parts.push(new Float32Array(Math.floor(gap * sampleRate)))
    parts.push(scaled)
  }
  const joined = concatFloat32(parts)
  const maximum = peak(joined)
  if (maximum > 0.98) {
    const scale = 0.98 / maximum
    for (let i = 0; i < joined.length; i++) joined[i] *= scale
  }
  return compressPauses(joined, sampleRate)
}

export function trimHotOnset(
  audio: Float32Array,
  sampleRate: number,
  headMs = 300,
  threshDb = 4,
  minKeepSeconds = 1.5,
): { audio: Float32Array; droppedMs: number } {
  const unchanged = { audio, droppedMs: 0 }
  if (audio.length < sampleRate) return unchanged
  const hop = Math.max(1, Math.floor(0.01 * sampleRate))
  const frameCount = Math.floor(audio.length / hop)
  const maximum = peak(audio)
  if (frameCount < 8 || maximum < 1e-6) return unchanged

  const frames = new Float64Array(frameCount)
  for (let i = 0; i < frameCount; i++) frames[i] = rms(audio.subarray(i * hop, (i + 1) * hop))
  const loudFrames: number[] = []
  let onset = -1
  for (let i = 0; i < frameCount; i++) {
    if (frames[i] > 0.02 * maximum) {
      loudFrames.push(frames[i])
      if (onset < 0) onset = i
    }
  }
  if (loudFrames.length === 0) return unchanged

  const typical = median(loudFrames)
  const attack = frames.subarray(onset, onset + Math.max(1, Math.floor(headMs / 10)))
  const loudEnough = typical * 10 ** (threshDb / 20)
  let attackSquares = 0
  let attackMax = 0
  for (const value of attack) {
    attackSquares += value * value
    attackMax = Math.max(attackMax, value)
  }
  const attackRms = Math.sqrt(attackSquares / attack.length)
  const hot = attackRms > loudEnough || (maximum >= 0.99 && attackMax > loudEnough)
  if (!hot) return unchanged

  const drop = onset * hop + Math.floor((headMs / 1000) * sampleRate)
  if (audio.length - drop < minKeepSeconds * sampleRate) return unchanged
  const trimmed = audio.slice(drop)
  const fade = Math.max(1, Math.floor(0.02 * sampleRate))
  if (trimmed.length > 2 * fade) fadeIn(trimmed, fade)
  return { audio: trimmed, droppedMs: Math.floor((drop * 1000) / sampleRate) }
}

/** WSOLA time stretch; speed > 1 shortens the audio. */
export function timeStretch(input: Float32Array, speed: number): Float32Array {
  if (Math.abs(speed - 1) < 0.03 || input.length === 0) return input
  const frame = 1024
  const hop = 256
  const tolerance = 256
  const padded = new Float32Array(input.length + frame + 2 * tolerance)
  padded.set(input, tolerance)
  const window = new Float32Array(frame)
  for (let i = 0; i < frame; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frame)

  const outputLength = Math.ceil(input.length / speed)
  const output = new Float32Array(outputLength + frame)
  const weights = new Float32Array(outputLength + frame)
  let previous = -1
  for (let k = 0; k * hop < outputLength; k++) {
    let position = tolerance + Math.round(k * hop * speed)
    if (previous >= 0) {
      const target = previous + hop
      let best = position
      let bestScore = -Infinity
      for (let d = -tolerance; d <= tolerance; d += 2) {
        const candidate = position + d
        if (candidate < 0 || candidate + frame > padded.length) continue
        let score = 0
        for (let i = 0; i < frame - hop; i += 4) score += padded[candidate + i] * padded[target + i]
        if (score > bestScore) {
          bestScore = score
          best = candidate
        }
      }
      position = best
    }
    position = Math.min(position, padded.length - frame)
    const start = k * hop
    for (let i = 0; i < frame; i++) {
      output[start + i] += padded[position + i] * window[i]
      weights[start + i] += window[i]
    }
    previous = position
  }

  const result = new Float32Array(outputLength)
  for (let i = 0; i < outputLength; i++) result[i] = weights[i] > 1e-3 ? output[i] / weights[i] : output[i]
  return result
}
