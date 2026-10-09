import { KIND_LABELS, STAGE_LABELS } from './historyLabels'
import type { HistorySummary } from './historyStore'

export class HistorySearch {
  private readonly haystacks = new WeakMap<HistorySummary, string>()

  normalize(text: string): string {
    return text
      .normalize('NFKC')
      .replace(/[\u064B-\u065F\u0670\u200C\u200D]/g, '')
      .replace(/\u064A/g, '\u06CC')
      .replace(/\u0643/g, '\u06A9')
      .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
      .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
      .toLowerCase()
      .trim()
  }

  filter(entries: readonly HistorySummary[], query: string): readonly HistorySummary[] {
    const tokens = this.normalize(query).split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return entries
    return entries.filter((entry) => {
      const haystack = this.haystackOf(entry)
      return tokens.every((token) => haystack.includes(token))
    })
  }

  private haystackOf(entry: HistorySummary): string {
    let cached = this.haystacks.get(entry)
    if (cached === undefined) {
      const stage = entry.stage ? STAGE_LABELS[entry.stage] : ''
      cached = this.normalize([entry.sourceName, ...entry.outputs, KIND_LABELS[entry.kind], stage].join(' '))
      this.haystacks.set(entry, cached)
    }
    return cached
  }
}

export const historySearch = new HistorySearch()
