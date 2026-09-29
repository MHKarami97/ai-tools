import { normalizeForModel } from './normalizeFa'
import { transliterateText, type OnnxG2P } from './g2p'
import type { SentencePieceModel } from './sentencepiece'

export const SENTENCE_GAP = 0.45
export const STRONG_GAP = 0.26
export const PHRASE_GAP = 0.16
export const CHUNK_GAP = 0.12
export const CHUNK_TOKENS = 18
export const CHUNK_HEADROOM = 2

export interface PlanItem {
  readonly phonemes: string
  readonly gap: number
}

const STRONG_LEADIN = [':', '؛', '\u2014', '\u2013']
const TEXT_PREPS = new Set(['برای', 'بدون', 'درباره', 'مثل'])
const TEXT_LIGHT_VERBS = new Set([
  'است', 'هست', 'هستم', 'هستی', 'هستیم', 'هستید', 'هستند',
  'بود', 'بودم', 'بودی', 'بودیم', 'بودید', 'بودند', 'باشد', 'باشند',
  'شد', 'شدم', 'شدی', 'شدیم', 'شدید', 'شدند', 'شود', 'شوند',
  'کرد', 'کردم', 'کردی', 'کردیم', 'کردید', 'کردند', 'کرده',
  'کنم', 'کنی', 'کند', 'کنیم', 'کنید', 'کنند',
  'داد', 'دادم', 'دادی', 'دادیم', 'دادید', 'دادند', 'داده',
  'بدهد', 'بدهند',
  'میشود', 'میشوند', 'میکند', 'میکنند', 'میکرد', 'میکردند',
  'میداد', 'میدادند', 'میدهد', 'میدهند',
  'دارد', 'دارم', 'داری', 'داریم', 'دارید', 'دارند', 'داشت',
  'میباشد', 'میباشند',
])
const EDGE_PUNCTUATION = new Set(Array.from('«»()"\'.,;:!?،؛-'))

export function splitSentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!؟])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function splitPhrases(sentence: string): string[] {
  return sentence
    .trim()
    .split(/(?<=[،؛:\u2014\u2013,;:)])\s+|\s+(?=\()/)
    .filter((part) => part.trim() && letterWords(part).length > 0)
}

function letterWords(phrase: string): string[] {
  return phrase.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word))
}

function endsWithStrong(phrase: string): boolean {
  const trimmed = phrase.trimEnd()
  return STRONG_LEADIN.some((mark) => trimmed.endsWith(mark))
}

async function mergeShortPhrases(
  phrases: string[],
  minWords: number,
  keepStandalone: (phrase: string) => Promise<boolean>,
): Promise<string[]> {
  const isProtected = async (phrase: string) => endsWithStrong(phrase) && (await keepStandalone(phrase))
  const output: string[] = []
  for (const phrase of phrases) {
    const last = output[output.length - 1]
    if (last !== undefined && letterWords(last).length < minWords && !(await isProtected(last))) {
      output[output.length - 1] = `${last} ${phrase}`
    } else {
      output.push(phrase)
    }
  }
  if (
    output.length >= 2 &&
    letterWords(output[output.length - 1]).length < minWords &&
    !(await isProtected(output[output.length - 2]))
  ) {
    const last = output.pop() as string
    output[output.length - 1] += ` ${last}`
  }
  return output
}

function splitLongPhrase(phrase: string, maxWords = 9): string[] {
  const words = phrase.split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return [phrase]
  let cut: number | null = null
  words.forEach((word, index) => {
    if (TEXT_PREPS.has(word) && index >= 4 && words.length - index >= 3) cut = index
  })
  if (cut === null) return [phrase]
  return [
    ...splitLongPhrase(words.slice(0, cut).join(' '), maxWords),
    ...splitLongPhrase(words.slice(cut).join(' '), maxWords),
  ]
}

function stripEdges(word: string): string {
  const chars = Array.from(word)
  let start = 0
  let end = chars.length
  while (start < end && EDGE_PUNCTUATION.has(chars[start])) start++
  while (end > start && EDGE_PUNCTUATION.has(chars[end - 1])) end--
  return chars.slice(start, end).join('')
}

function mergeLeadingLightVerbs(phrases: string[]): string[] {
  const output: string[] = []
  for (const phrase of phrases) {
    const words = letterWords(phrase)
    const key = words.length > 0 ? stripEdges(words[0]).replaceAll('\u200c', '') : ''
    if (output.length > 0 && (TEXT_LIGHT_VERBS.has(key) || key === 'را')) {
      output[output.length - 1] += ` ${phrase}`
    } else {
      output.push(phrase)
    }
  }
  return output
}

export function packPhrases(plan: readonly PlanItem[]): PlanItem[] {
  const groups: PlanItem[] = []
  for (const item of plan) {
    const last = groups[groups.length - 1]
    if (last && item.gap !== STRONG_GAP) groups[groups.length - 1] = { phonemes: `${last.phonemes} ${item.phonemes}`, gap: last.gap }
    else groups.push(item)
  }
  return groups
}

export class TextPlanner {
  constructor(
    private readonly g2p: OnnxG2P,
    private readonly tokenizer: SentencePieceModel,
  ) {}

  async planSentence(sentence: string): Promise<PlanItem[]> {
    const cache = new Map<string, boolean>()
    const isClean = async (phrase: string): Promise<boolean> => {
      const cached = cache.get(phrase)
      if (cached !== undefined) return cached
      const prepared = normalizeForModel(transliterateText(phrase)).replaceAll('؟', '').replaceAll('?', '').replaceAll(':', '')
      const wanted = letterWords(prepared).length
      const phonemes = await this.g2p.phonemise(phrase, true)
      const clean = phonemes.length > 0 && phonemes.split(/\s+/).filter(Boolean).length === wanted
      cache.set(phrase, clean)
      return clean
    }

    const merged = mergeLeadingLightVerbs(await mergeShortPhrases(splitPhrases(sentence), 2, isClean))
    const plan: PlanItem[] = []
    let previous: string | null = null
    for (const phrase of merged) {
      const phrasePhonemes = await this.g2p.phonemise(phrase, true)
      const fits =
        phrasePhonemes.length > 0 && this.tokenizer.encode(phrasePhonemes).length <= CHUNK_TOKENS + CHUNK_HEADROOM
      for (const part of fits ? [phrase] : splitLongPhrase(phrase)) {
        const phonemes = part === phrase ? phrasePhonemes : await this.g2p.phonemise(part, true)
        if (!phonemes) continue
        const strong = previous !== null && endsWithStrong(previous)
        plan.push({ phonemes, gap: strong ? STRONG_GAP : PHRASE_GAP })
        previous = part
      }
    }
    return plan
  }
}
