import { CHUNK_HEADROOM, CHUNK_TOKENS } from './textPlanner'

const TAIL_MERGE_CAP = 19
const MIN_CHUNK_WORDS = 3
const MIN_CHUNK_TOKENS = 6
const RUNT_TAIL_TOKENS = 2
const LOOKBACK_LIGHT_VERB = 5
const LOOKBACK_PREP = 3

const PREPS = new Set(['?az', 'bA', 'dar', 'be', 'barAye', 'tA', 'ruye', 'bedune', 'vase'])
const FUNCTION_WORDS = new Set([
  'dar', 'be', '?az', 'tA', 'va', 'ke', 'bA', 'bedune',
  'age', 'vali', 'yA', 'barAye', 'vase', 'dAr', 'mi',
  'beture', 'besurate',
])
const CONJUNCTIONS = new Set(['va', 'yA', 'vali', 'amA', 'hattA', 'ke', 'rA'])
const LIGHT_VERBS = new Set([
  'miSavad', 'miSavand', 'miSavam', 'miSavid', 'miSavim',
  'Savad', 'Savand', 'Sod', 'Sodand', 'Sodan',
  'mikonad', 'mikonand', 'mikonam', 'mikonid', 'mikonim',
  'kard', 'karde', 'konad', 'konand',
  'dAd', 'dAde', 'dAdand', 'dAdam', 'dAdi', 'dAdim', 'dAdid',
  'dAhad', 'dAhand', 'midAd', 'midAdand',
  'dArad', 'dArand', 'dAsht', 'Ast', '?ast', 'bud', 'budand',
])

const words = (text: string): string[] => text.split(/\s+/).filter(Boolean)
const letterWordCount = (text: string): number => words(text).filter((word) => /[\p{L}\p{N}]/u.test(word)).length

export class PhonemeChunker {
  constructor(private readonly countTokens: (text: string) => number) {}

  chunk(phonemes: string, maxTokens = CHUNK_TOKENS): string[] {
    const list = words(phonemes)
    const pack = (slack: number): string[] => {
      let chunks = this.enforceBudget(this.fixBoundaries(this.packWords(list, maxTokens, slack)), maxTokens)
      if (chunks.length >= 2) {
        const last = chunks[chunks.length - 1]
        const previous = chunks[chunks.length - 2]
        if (this.countTokens(last) <= RUNT_TAIL_TOKENS && this.countTokens(`${previous} ${last}`) <= TAIL_MERGE_CAP) {
          chunks = [...chunks.slice(0, -2), `${previous} ${last}`]
        }
      }
      return chunks
    }

    let chunks = pack(CHUNK_HEADROOM)
    if (chunks.length >= 2) {
      const last = chunks[chunks.length - 1]
      if (letterWordCount(last) < MIN_CHUNK_WORDS || this.countTokens(last) < MIN_CHUNK_TOKENS) chunks = pack(0)
    }
    return chunks.map((chunk) => chunk.replaceAll('1', ''))
  }

  private packWords(list: string[], maxTokens: number, slack = CHUNK_HEADROOM): string[] {
    const chunks: string[] = []
    let current: string[] = []
    for (const word of list) {
      const tokens = this.countTokens([...current, word].join(' '))
      const over = current.length > 0 && tokens > maxTokens + slack
      const bound =
        (current.length > 0 && current[current.length - 1].endsWith('1')) || LIGHT_VERBS.has(word) || word === 'rA'

      if (over && !(bound && tokens <= maxTokens + CHUNK_HEADROOM)) {
        let cut = current.length
        for (let k = current.length - 1; k > Math.max(current.length - LOOKBACK_LIGHT_VERB, -1); k--) {
          if (LIGHT_VERBS.has(current[k]) || current[k] === 'rA') {
            cut = k + 1
            break
          }
        }
        if (cut === current.length) {
          for (let k = current.length - 1; k > Math.max(current.length - LOOKBACK_PREP, -1); k--) {
            if (PREPS.has(current[k]) && current.length - k <= 2) {
              cut = k
              break
            }
          }
        }
        if (cut >= MIN_CHUNK_WORDS && this.countTokens(current.slice(0, cut).join(' ')) >= MIN_CHUNK_TOKENS) {
          chunks.push(current.slice(0, cut).join(' '))
          current = current.slice(cut)
        } else {
          chunks.push(current.join(' '))
          current = []
        }
      }
      current = [...current, word]
    }
    if (current.length > 0) chunks.push(current.join(' '))
    return chunks
  }

  private fixBoundaries(input: string[], minWords = 3): string[] {
    const chunks = [...input]
    let i = 1
    while (i < chunks.length) {
      const previous = words(chunks[i - 1])
      const next = words(chunks[i])
      const last = previous[previous.length - 1]
      const leftBound =
        previous.length >= 2 &&
        (previous[previous.length - 2].endsWith('1') || LIGHT_VERBS.has(last) || last === 'rA')
      let bad = false
      if (previous.length > minWords) {
        if (last.endsWith('1')) bad = true
        else if (!leftBound && next.length > 0 && next[0].endsWith('1')) bad = true
        else if (!leftBound && FUNCTION_WORDS.has(last)) bad = true
        else if (!leftBound && next.length > 0 && CONJUNCTIONS.has(next[0])) bad = true
        else if (!leftBound && last.endsWith('e') && next.length > 0 && next[0].startsWith('?')) bad = true
      }
      if (bad) {
        chunks[i - 1] = previous.slice(0, -1).join(' ')
        chunks[i] = `${last} ${chunks[i]}`
      } else {
        i++
      }
    }
    return chunks
  }

  private enforceBudget(input: string[], maxTokens: number): string[] {
    let chunks = input
    for (let round = 0; round < 3; round++) {
      if (chunks.every((chunk) => this.countTokens(chunk) <= maxTokens + CHUNK_HEADROOM)) return chunks
      const repacked: string[] = []
      for (const chunk of chunks) {
        if (this.countTokens(chunk) <= maxTokens + CHUNK_HEADROOM) repacked.push(chunk)
        else repacked.push(...this.packWords(words(chunk), maxTokens))
      }
      chunks = this.fixBoundaries(repacked)
    }
    return chunks
  }
}
