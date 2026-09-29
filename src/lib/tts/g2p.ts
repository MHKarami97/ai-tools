import { ort } from '@/lib/ort/runtime'
import { normalizeForModel } from './normalizeFa'

const PAD = 0
const EOS = 1
const MAX_LENGTH = 512
const G2P_WINDOW_WORDS = 30
const ZWNJ = '\u200c'

const LATIN_DIGRAPHS: Record<string, string> = {
  sh: 'ش',
  ch: 'چ',
  th: 'ث',
  ph: 'ف',
  gh: 'غ',
  kh: 'خ',
  wh: 'و',
  ck: 'ک',
  qu: 'کو',
  oo: 'و',
  ee: 'ی',
  ea: 'ی',
  ou: 'او',
  au: 'او',
  ai: 'ای',
  ay: 'ای',
  ey: 'ای',
  oi: 'اوی',
  oy: 'اوی',
}

const LATIN_CHAR: Record<string, string> = {
  a: 'ا',
  b: 'ب',
  c: 'ک',
  d: 'د',
  e: '',
  f: 'ف',
  g: 'گ',
  h: 'ه',
  i: 'ی',
  j: 'ج',
  k: 'ک',
  l: 'ل',
  m: 'م',
  n: 'ن',
  o: 'او',
  p: 'پ',
  q: 'ق',
  r: 'ر',
  s: 'س',
  t: 'ت',
  u: 'و',
  v: 'و',
  w: 'و',
  x: 'کس',
  y: 'ی',
  z: 'ز',
}

const LETTER_NAMES: Record<string, string> = {
  a: 'ای',
  b: 'بی',
  c: 'سی',
  d: 'دی',
  e: 'ای',
  f: 'اف',
  g: 'جی',
  h: 'اچ',
  i: 'آی',
  j: 'جی',
  k: 'کی',
  l: 'ال',
  m: 'ام',
  n: 'ان',
  o: 'او',
  p: 'پی',
  q: 'کیو',
  r: 'آر',
  s: 'اس',
  t: 'تی',
  u: 'یو',
  v: 'وی',
  w: 'دبلیو',
  x: 'ایکس',
  y: 'وای',
  z: 'زد',
}

const LATIN_EXCEPTIONS: Record<string, string> = {
  echo: 'اکو',
  state: 'استیت',
  network: 'نت\u200cورک',
  windows: 'ویندوز',
  notebook: 'نوت\u200cبوک',
  photoshop: 'فتوشاپ',
  python: 'پایتون',
  recurrency: 'ریکارانسی',
}

const CLUSTER_START = new Set(Array.from('پتکبجچذژزصضثفگسش'))
const PHONEME_MAP: Record<string, string> = { '/': 'a', a: 'A', '@': '?', $: 'S', c: 'C' }
const PRON_FIX: Record<string, string> = { 'bo?d': 'ba?d' }
const G2P_CUT_WORDS = new Set(['و', 'یا', 'ولی', 'اما', 'که', 'زیرا', 'چون', 'پس', 'سپس', 'بنابراین', 'همچنین'])

function transliterateWord(word: string): string {
  if (word.replace(/^-+|-+$/g, '').includes('-')) {
    const parts = word.split('-').filter(Boolean)
    if (parts.length > 1) return parts.map(transliterateWord).join(' ')
  }
  const lower = word.toLowerCase()
  if (lower in LATIN_EXCEPTIONS) return LATIN_EXCEPTIONS[lower]
  if (/^[A-Z]{2,5}$/.test(word)) return Array.from(lower, (char) => LETTER_NAMES[char]).join(ZWNJ)

  const output: string[] = []
  for (let i = 0; i < lower.length; ) {
    const pair = lower.slice(i, i + 2)
    if (pair in LATIN_DIGRAPHS) {
      output.push(LATIN_DIGRAPHS[pair])
      i += 2
    } else {
      output.push(LATIN_CHAR[lower[i]] ?? '')
      i += 1
    }
  }
  let result = output.join('')
  if (result.length >= 2 && result[0] === 'س' && CLUSTER_START.has(result[1])) result = `ا${result}`
  return result || word
}

export function transliterateText(text: string): string {
  return text.replace(/[A-Za-z][A-Za-z'-]*/g, (match) => transliterateWord(match))
}

function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

function g2pWindows(text: string): string[] {
  const words = splitWords(text)
  if (words.length <= G2P_WINDOW_WORDS) return [text]
  let cut: number | null = null
  const end = Math.min(words.length - 4, G2P_WINDOW_WORDS - 3)
  for (let i = Math.floor(G2P_WINDOW_WORDS / 2); i < end; i++) {
    if (G2P_CUT_WORDS.has(words[i])) cut = i
  }
  const at = cut ?? Math.floor(G2P_WINDOW_WORDS / 2)
  return [...g2pWindows(words.slice(0, at).join(' ')), ...g2pWindows(words.slice(at).join(' '))]
}

function toPhonemes(text: string): string {
  return Array.from(text, (char) => PHONEME_MAP[char] ?? char).join('')
}

function argmax(values: Float32Array): number {
  let best = 0
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i
  return best
}

export class OnnxG2P {
  constructor(
    private readonly encoder: ort.InferenceSession,
    private readonly decoder: ort.InferenceSession,
  ) {}

  async phonemise(text: string, keepEzafe = false): Promise<string> {
    let prepared = normalizeForModel(transliterateText(text))
    prepared = prepared.replaceAll('؟', '').replaceAll('?', '').replaceAll(':', '')
    const decoded: string[] = []
    for (const window of g2pWindows(prepared)) decoded.push(await this.decodeGreedy(window))
    const output = splitWords(toPhonemes(decoded.join(' ')))
      .map((word) => PRON_FIX[word] ?? word)
      .join(' ')
    return keepEzafe ? output : output.replaceAll('1', '')
  }

  private async decodeGreedy(text: string): Promise<string> {
    const ids = Array.from(new TextEncoder().encode(text), (byte) => byte + 3)
    if (ids.length === 0) return ''
    const encoded = await this.encoder.run({
      input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
    })
    const hidden = encoded[this.encoder.outputNames[0]]

    const sequence = [PAD]
    for (let step = 0; step < MAX_LENGTH; step++) {
      const result = await this.decoder.run({
        decoder_input_ids: new ort.Tensor('int64', BigInt64Array.from(sequence, BigInt), [1, sequence.length]),
        encoder_hidden: hidden,
      })
      const logits = result[this.decoder.outputNames[0]]
      const vocabulary = logits.dims[2]
      const data = logits.data as Float32Array
      const next = argmax(data.subarray((sequence.length - 1) * vocabulary, sequence.length * vocabulary))
      if (next === EOS) break
      sequence.push(next)
    }
    const bytes = sequence.slice(1).filter((id) => id >= 3 && id <= 258).map((id) => id - 3)
    return new TextDecoder().decode(Uint8Array.from(bytes))
  }
}
