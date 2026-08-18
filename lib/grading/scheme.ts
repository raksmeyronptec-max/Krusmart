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

/** How subjects combine into an average — design §3.2. */
export type SchemeWeighting = 'simple' | 'coefficient'

/**
 * The national coefficient base: ៥០ ពិន្ទុ = មេគុណ ១.
 *
 * One exported constant, because the same "divide by 50" must never be typed
 * twice — the design stores no coefficient column precisely so a stored value
 * and a derived one cannot drift, and two literals would reopen that door.
 */
export const NATIONAL_COEFFICIENT_UNIT = 50

/** Stored in `grading_schemes.config`. */
export interface GradingSchemeConfig {
  /**
   * The scale the scheme's *average* is expressed on: 10 for primary, 50 for
   * secondary. Band `min`s are anchored to this — a band is a fraction of
   * `maxScore`, which is what lets one scheme grade subjects marked out of
   * 125 or 75 (see `bandThreshold`).
   */
  maxScore: number
  /** At or above this counts as a pass, on the `maxScore` scale. */
  passMark: number
  /** Ordered high → low. The first band containing a score wins. */
  bands: GradeBand[]
  /**
   * `simple` — plain mean, the primary path; every subject weighs the same.
   * `coefficient` — secondary: a subject weighs `maxScore ÷ coefficientUnit`,
   * so the average of full marks lands exactly on `coefficientUnit`.
   * Absent means `simple`, which is what every scheme seeded before this
   * field existed must keep meaning.
   */
  weighting?: SchemeWeighting
  /** Coefficient base for `weighting: 'coefficient'`. Defaults to the national ៥០. */
  coefficientUnit?: number
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

/**
 * The secondary ladder — same percentage rungs (90/80/70/60/50), different
 * Khmer descriptors, shifted one step against primary per the MoEYS reference
 * the design cites (§3.3ខ): what primary calls ល្អណាស់ at A, secondary calls
 * ល្អប្រសើរ, and so on down.
 *
 * The average scale is /៥០ because that is what `coefficientAverage` produces
 * when every subject scores full marks: Σ(max) ÷ Σ(max÷50) = 50. Band mins are
 * the doc's verified thresholds for a /50 scale — floor(50 × 0.9) = 45, etc.
 *
 * Like `DEFAULT_SCHEME_CONFIG` this is the seed for *new* schemes, not a live
 * setting; per-level rows in `grading_schemes.config` override it.
 */
export const SECONDARY_SCHEME_CONFIG: GradingSchemeConfig = {
  maxScore: 50,
  passMark: 25,
  weighting: 'coefficient',
  coefficientUnit: NATIONAL_COEFFICIENT_UNIT,
  bands: [
    { letter: 'A', min: 45, max: 50, label: 'ល្អប្រសើរ' },
    { letter: 'B', min: 40, max: 44.99, label: 'ល្អណាស់' },
    { letter: 'C', min: 35, max: 39.99, label: 'ល្អ' },
    { letter: 'D', min: 30, max: 34.99, label: 'ល្អបង្គួរ' },
    { letter: 'E', min: 25, max: 29.99, label: 'មធ្យម' },
    { letter: 'F', min: 0, max: 24.99, label: 'ខ្សោយ' },
  ],
}

/**
 * The weight one subject carries in a coefficient-weighted average.
 *
 * Derived, never stored — `coefficient = maxScore ÷ coefficientUnit` (design
 * §3.2), so a subject marked /125 counts 2.5 and one marked /25 counts 0.5.
 * Under `simple` weighting every subject weighs 1, which is what makes this
 * safe to call unconditionally.
 */
export function coefficientOf(
  maxScore: number,
  config: GradingSchemeConfig = DEFAULT_SCHEME_CONFIG,
): number {
  if (config.weighting !== 'coefficient') return 1
  const unit = config.coefficientUnit ?? NATIONAL_COEFFICIENT_UNIT
  return unit > 0 ? maxScore / unit : 1
}

/**
 * A band's threshold re-expressed on another scale.
 *
 * The design's verified tables (§3.3ក) are all `floor(scale × fraction)`:
 * A on /125 is 112 (not 112.5, not 113), on /75 it is 67. `floor` is the
 * documented rounding — a mark of 112/125 *is* an A even though 112/125 is
 * 89.6%, because the printed threshold a Cambodian teacher compares against
 * says 112.
 *
 * When the scale *is* the scheme's own, the band min is returned untouched:
 * flooring there would silently move a custom band like `min: 8.5` down to 8,
 * changing results for schemes already in the database.
 */
export function bandThreshold(
  min: number,
  scale: number,
  config: GradingSchemeConfig = DEFAULT_SCHEME_CONFIG,
): number {
  if (scale === config.maxScore) return min
  return Math.floor((scale * min) / config.maxScore)
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
  /**
   * The scale `average` is expressed on, when it is not the scheme's own —
   * a per-subject mark out of 75 graded against a /50 scheme, say. Thresholds
   * are then the floor-converted ones from `bandThreshold`, matching the
   * printed tables teachers actually hold. Omitted, behaviour is exactly what
   * it always was.
   */
  scale: number = config.maxScore,
): GradeResult | null {
  if (average === null || average === undefined || !Number.isFinite(average)) return null

  const ordered = [...config.bands].sort((a, b) => b.min - a.min)
  const band =
    ordered.find((b) => average >= bandThreshold(b.min, scale, config)) ??
    ordered[ordered.length - 1]

  return {
    letter: band.letter,
    label: band.label,
    passed: average >= bandThreshold(config.passMark, scale, config),
  }
}

/** Just the letter — the shape the existing clients expect. */
export function letterFor(
  average: number | null | undefined,
  config: GradingSchemeConfig = DEFAULT_SCHEME_CONFIG,
  scale?: number,
): string {
  return gradeFor(average, config, scale)?.letter ?? '-'
}

/** Just the Khmer descriptor. */
export function descriptorFor(
  average: number | null | undefined,
  config: GradingSchemeConfig = DEFAULT_SCHEME_CONFIG,
  scale?: number,
): string {
  return gradeFor(average, config, scale)?.label ?? '-'
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

/** One subject's mark feeding a coefficient-weighted average. */
export interface CoefficientEntry {
  score: number | null | undefined
  /** The subject's full mark, from its template row. */
  maxScore: number
}

/**
 * The secondary average: `Σពិន្ទុ ÷ Σមេគុណ` (design §3.2).
 *
 * No manual normalising — a pupil with full marks in every subject scores
 * Σ(max) ÷ Σ(max÷50) = 50, so the result lands on the `/coefficientUnit`
 * scale by construction. Unmarked subjects are skipped along with their
 * coefficients, same rule as `weightedAverage`: not-yet-assessed is not zero.
 *
 * Under `simple` weighting this degrades to the plain mean (`coefficientOf`
 * returns 1 for every subject), so one call site can serve both levels.
 *
 * Returns `null` when nothing has been marked.
 */
export function coefficientAverage(
  entries: CoefficientEntry[],
  config: GradingSchemeConfig = DEFAULT_SCHEME_CONFIG,
): number | null {
  let sum = 0
  let totalCoefficient = 0

  for (const e of entries) {
    if (e.score === null || e.score === undefined || !Number.isFinite(e.score)) continue
    sum += e.score
    totalCoefficient += coefficientOf(e.maxScore, config)
  }

  if (totalCoefficient === 0) return null
  return Math.round((sum / totalCoefficient) * 100) / 100
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
    // Anything unrecognised falls back to `simple` — the only value that
    // existed before this field, so old configs keep meaning what they meant.
    weighting: c.weighting === 'coefficient' ? 'coefficient' : 'simple',
    coefficientUnit:
      typeof c.coefficientUnit === 'number' && c.coefficientUnit > 0
        ? c.coefficientUnit
        : undefined,
    typeWeights: c.typeWeights,
  }
}
