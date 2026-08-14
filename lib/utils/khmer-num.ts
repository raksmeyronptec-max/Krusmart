/**
 * Khmer numeral conversion.
 *
 * Nine files each carried their own copy of this (four called `toKhmerNum`,
 * plus `toKh3`, two bare `khDigits` arrays and an inline reverse map). All of
 * them delegate here now.
 */

/** Khmer digits ០–៩, indexed by their Arabic value. */
export const KHMER_DIGITS = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'] as const

const ARABIC_BY_KHMER: Record<string, string> = Object.fromEntries(
  KHMER_DIGITS.map((digit, i) => [digit, String(i)]),
)

/**
 * Rewrite the Arabic digits in `value` as Khmer numerals, leaving every other
 * character untouched. `null` / `undefined` become `''`.
 */
export function toKhmerNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/[0-9]/g, (digit) => KHMER_DIGITS[Number(digit)])
}

/** The inverse of {@link toKhmerNumber}: Khmer numerals back to Arabic digits. */
export function fromKhmerNumber(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/[០-៩]/g, (digit) => ARABIC_BY_KHMER[digit] ?? digit)
}
