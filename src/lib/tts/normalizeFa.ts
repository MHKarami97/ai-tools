const ZWNJ = '\u200c'
const PERSIAN_LETTERS = 'آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی' + 'ئ'
const KEPT_PUNCT = '.،؛؟!:'
const ALLOWED = new Set<string>([...PERSIAN_LETTERS, ZWNJ, ...KEPT_PUNCT, ' '])
const MAX_NUMBER_DIGITS = 12
const JOIN = ' و '

export class NormalizationError extends Error {}

const CHAR_MAP = new Map<string, string>([
  ['ي', 'ی'],
  ['ى', 'ی'],
  ['ۍ', 'ی'],
  ['ې', 'ی'],
  ['ك', 'ک'],
  ['ڪ', 'ک'],
  ['ة', 'ه'],
  ['ۀ', 'ه'],
  ['أ', 'ا'],
  ['إ', 'ا'],
  ['ٱ', 'ا'],
  ['ٲ', 'ا'],
  ['ٳ', 'ا'],
  ['ؤ', 'و'],
  ['ۂ', 'ه'],
  ['ۃ', 'ه'],
  ['ء', ''],
  ['ـ', ''],
])

const DIGIT_MAP = new Map<string, string>()
for (let i = 0; i < 10; i++) {
  DIGIT_MAP.set(String.fromCharCode(0x06f0 + i), String(i))
  DIGIT_MAP.set(String.fromCharCode(0x0660 + i), String(i))
}

const PUNCT_MAP = new Map<string, string>([
  [',', '،'],
  ['?', '؟'],
  [';', '؛'],
  ['٬', ''],
  ['٫', '.'],
  ['…', '.'],
  ['»', ' '],
  ['«', ' '],
  ['\u201c', ' '],
  ['\u201d', ' '],
  ['\u2018', ' '],
  ['\u2019', ' '],
  ['\u0022', ' '],
  ['\u0027', ' '],
  ['`', ' '],
  ['(', ' '],
  [')', ' '],
  ['[', ' '],
  [']', ' '],
  ['{', ' '],
  ['}', ' '],
  ['\u2013', ' '],
  ['\u2014', ' '],
  ['\u2212', ' '],
  ['-', ' '],
  ['\u2010', ' '],
  ['/', ' '],
  ['\u005c', ' '],
  ['*', ' '],
  ['_', ' '],
  ['|', ' '],
  ['×', ' '],
  ['=', ' '],
  ['+', ' '],
])

const DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g
const INVISIBLES = /[\u200B\u200D-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00AD]/g

const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه']
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده']
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود']
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد']
const SCALES: ReadonlyArray<readonly [number, string]> = [
  [1e12, 'تریلیون'],
  [1e9, 'میلیارد'],
  [1e6, 'میلیون'],
  [1e3, 'هزار'],
]
const FRACTION_UNITS: Record<number, string> = { 1: 'دهم', 2: 'صدم', 3: 'هزارم' }

function translate(text: string, map: ReadonlyMap<string, string>): string {
  return Array.from(text, (char) => map.get(char) ?? char).join('')
}

function underThousand(value: number): string {
  const parts: string[] = []
  let rest = value
  if (rest >= 100) {
    parts.push(HUNDREDS[Math.floor(rest / 100)])
    rest %= 100
  }
  if (rest >= 20) {
    parts.push(TENS[Math.floor(rest / 10)])
    rest %= 10
  }
  if (rest >= 10 && rest < 20) {
    parts.push(TEENS[rest - 10])
    rest = 0
  }
  if (rest > 0) parts.push(ONES[rest])
  return parts.join(JOIN)
}

function numberToWords(value: number): string {
  if (value === 0) return 'صفر'
  const parts: string[] = []
  let rest = value
  for (const [scale, name] of SCALES) {
    if (rest >= scale) {
      const count = Math.floor(rest / scale)
      rest %= scale
      const head = count === 1 && scale === 1e3 ? '' : `${underThousand(count)} `
      parts.push(`${head}${name}`.trim())
    }
  }
  if (rest > 0) parts.push(underThousand(rest))
  return parts.join(JOIN)
}

function digitsOneByOne(digits: string): string {
  return Array.from(digits, (digit) => (digit === '0' ? 'صفر' : ONES[Number(digit)])).join(' ')
}

function numberTokenToWords(whole: string, fraction: string | undefined): string {
  if (whole.length > MAX_NUMBER_DIGITS || (whole.startsWith('0') && whole.length > 1)) {
    return ` ${digitsOneByOne(whole)}${fraction ? ` ${digitsOneByOne(fraction)}` : ''} `
  }
  let words = numberToWords(Number(whole.replace(/^0+/, '') || '0'))
  if (fraction) {
    const trimmed = fraction.replace(/0+$/, '')
    if (!trimmed) return ` ${words} `
    const unit = FRACTION_UNITS[trimmed.length]
    words += unit
      ? ` ممیز ${numberToWords(Number(trimmed))} ${unit}`
      : ` ممیز ${digitsOneByOne(trimmed)}`
  }
  return ` ${words} `
}

function numbersToWords(text: string): string {
  const withoutSeparators = text.replace(/(?<=[0-9]),(?=[0-9]{3}\b)/g, '')
  return withoutSeparators.replace(/([0-9]+)(?:\.([0-9]+))?/g, (_match, whole: string, fraction?: string) =>
    numberTokenToWords(whole, fraction),
  )
}

export function normalize(input: string): string {
  let text = input.normalize('NFC')
  text = text.replace(INVISIBLES, '').replace(DIACRITICS, '')
  text = translate(text, CHAR_MAP)
  text = translate(text, DIGIT_MAP)
  text = text.replaceAll('٬', '').replaceAll('٫', '.')
  text = text.replace(/[٪%]/g, ' درصد ')
  text = numbersToWords(text)
  text = translate(text, PUNCT_MAP)
  text = Array.from(text, (char) => (ALLOWED.has(char) ? char : ' ')).join('')
  text = text.replace(/\u200c+/g, ZWNJ)
  text = text.replace(/\s*\u200c\s*/g, (match) => (match.includes(' ') ? ' ' : ZWNJ))
  // The tail of this function was truncated in the source listing; the two steps below
  // follow its docstring (ZWNJ only between two letters, collapse whitespace).
  const strayZwnj = new RegExp(`(?<![${PERSIAN_LETTERS}])${ZWNJ}|${ZWNJ}(?![${PERSIAN_LETTERS}])`, 'g')
  text = text.replace(strayZwnj, '')
  return text.replace(/\s+/g, ' ').trim()
}

export function isPhonemic(text: string): boolean {
  const chars = Array.from(text)
  return !chars.some((char) => PERSIAN_LETTERS.includes(char)) && chars.some((char) => /[A-Za-z]/.test(char))
}

export function normalizeForModel(text: string): string {
  if (isPhonemic(text)) return text
  const output = normalize(text)
  if (text.trim() && !output.trim()) {
    throw new NormalizationError(`normalisation emptied the text: ${text.slice(0, 60)}`)
  }
  return output
}
