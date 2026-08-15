/**
 * Grading engine.
 *
 * Six feature clients each carried their own copy of the same A–F ladder
 * (`ranking`, `certificate`, `honor-roll`, `score/total`, `parent-report`,
 * `student-tracking`). They agreed — A≥9, B≥8, C≥7, D≥6, E≥5, F below — but
 * only by luck, and none of them could be configured per education level.
 *
 * This module is the single implementation. `DEFAULT_SCHEME_CONFIG` reproduces
 * that ladder exactly, so replacing the inline copies is behaviour-neutral.
 *
 * Pure and dependency-free: usable from server components, client components
 * and server actions alike.
 */

/** One band of a grading scale. `min` is inclusive, `max` is inclusive. */
export interface GradeBand {
  letter: string
  min: number
  max: number
  /** Khmer descriptor shown on reports and certificates, e.g. `ល្អណាស់`. */
  label: string
}

/** Stored in `grading_schemes.config`. */
export interface GradingSchemeConfig {
  /** Highest attainable raw score. Cambodian primary marks out of 10. */
  maxScore: number
  /** At or above this counts as a pass. */
  passMark: number
  /** Ordered high → low. The first band containing a score wins. */
  bands: GradeBand[]
  /**
   * Relative weight per assessment `type`, used by `weightedAverage`.
   * A type absent from this map defaults to the assessment's own `weight`.
   */
  typeWeights?: Record<string, number>
}

/**
 * The ladder the app has always used, out of 10.
 *
 * Changing these values changes every report, certificate and ranking in the
 * product — they are the defaults for a *new* scheme, not a live setting.
 */
export const DEFAULT_SCHEME_CONFIG: GradingSchemeConfig = {
  maxScore: 10,
  passMark: 5,
  bands: [
    { letter: 'A', min: 9, max: 10, label: 'ល្អណាស់' },
    { letter: 'B', min: 8, max: 8.99, label: 'ល្អ' },
    { letter: 'C', min: 7, max: 7.99, label: 'ល្អបង្គួរ' },
    { letter: 'D', min: 6, max: 6.99, label: 'មធ្យម' },
    { letter: 'E', min: 5, max: 5.99, label: 'ខ្សោយ' },
    { letter: 'F', min: 0, max: 4.99, label: 'ធ្លាក់' },
  ],
}

/** Result of grading one average. */
export interface GradeResult {
  letter: string
  label: string
  passed: boolean
}

/**
 * Grade an average against a scheme.
 *
 * Returns `null` for a missing or non-finite score so callers can render a dash
 * rather than a misleading `F` — a student with no marks has not failed.
 *
 * Bands are matched on `min` alone, walking high → low, which reproduces the
 * original `if (avg >= 9) … else if (avg >= 8) …` chain exactly. Using `max`
 * would misclassify a value in a gap such as 8.995.
 */
export function gradeFor(
  average: number | null | undefined,
  config: GradingSchemeConfig = DEFAULT_SCHEME_CONFIG,
): GradeResult | null {
  if (average === null || average === undefined || !Number.isFinite(average)) return null

  const ordered = [...config.bands].sort((a, b) => b.min - a.min)
  const band = ordered.find((b) => average >= b.min) ?? ordered[ordered.length - 1]

  return {
    letter: band.letter,
    label: band.label,
    passed: average >= config.passMark,
  }
}

/** Just the letter — the shape the existing clients expect. */
export function letterFor(
  average: number | null | undefined,
  config: GradingSchemeConfig = DEFAULT_SCHEME_CONFIG,
): string {
  return gradeFor(average, config)?.letter ?? '-'
}

/** Just the Khmer descriptor. */
export function descriptorFor(
  average: number | null | undefined,
  config: GradingSchemeConfig = DEFAULT_SCHEME_CONFIG,
): string {
  return gradeFor(average, config)?.label ?? '-'
}

/** One scored assessment feeding a weighted total. */
export interface WeightedEntry {
  score: number | null
  /** Denominator for this entry. Defaults to the scheme's `maxScore`. */
  maxScore?: number
  /** Relative weight. Defaults to 1. */
  weight?: number
  /** Assessment type, used to look up `config.typeWeights`. */
  type?: string
}

/**
 * Weighted average, normalised back onto the scheme's scale.
 *
 * Entries with a null score are skipped rather than counted as zero: an
 * unmarked assessment means "not yet assessed", and treating it as zero would
 * silently fail every student mid-term.
 *
 * Returns `null` when nothing has been marked yet.
 */
export function weightedAverage(
  entries: WeightedEntry[],
  config: GradingSchemeConfig = DEFAULT_SCHEME_CONFIG,
): number | null {
  let weighted = 0
  let totalWeight = 0

  for (const e of entries) {
    if (e.score === null || e.score === undefined || !Number.isFinite(e.score)) continue

    const max = e.maxScore && e.maxScore > 0 ? e.maxScore : config.maxScore
    const weight = config.typeWeights?.[e.type ?? ''] ?? e.weight ?? 1
    if (weight <= 0) continue

    // Normalise to 0-1 before weighting, so assessments marked out of 100 and
    // out of 10 can be combined in one total.
    weighted += (e.score / max) * weight
    totalWeight += weight
  }

  if (totalWeight === 0) return null

  return Math.round((weighted / totalWeight) * config.maxScore * 100) / 100
}

/** Plain mean of raw marks, rounded to 2dp — the legacy monthly/semester path. */
export function simpleAverage(scores: (number | null | undefined)[]): number | null {
  const valid = scores.filter((s): s is number => typeof s === 'number' && Number.isFinite(s))
  if (valid.length === 0) return null
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100
}

/** Narrow an unknown JSONB value from `grading_schemes.config` to a usable config. */
export function parseSchemeConfig(raw: unknown): GradingSchemeConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_SCHEME_CONFIG

  const c = raw as Partial<GradingSchemeConfig>
  if (!Array.isArray(c.bands) || c.bands.length === 0) return DEFAULT_SCHEME_CONFIG

  return {
    maxScore: typeof c.maxScore === 'number' ? c.maxScore : DEFAULT_SCHEME_CONFIG.maxScore,
    passMark: typeof c.passMark === 'number' ? c.passMark : DEFAULT_SCHEME_CONFIG.passMark,
    bands: c.bands,
    typeWeights: c.typeWeights,
  }
}
