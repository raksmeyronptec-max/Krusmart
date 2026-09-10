/**
 * One student, one result — the aggregation every report surface shares.
 *
 * Before this module, five features (ranking, certificate, honor-roll,
 * parent-report, student-tracking) each carried a private copy of the same
 * loop: sum the marks over a private copy of the same 29-key subject list,
 * divide by the count, grade with the default /10 config. Five copies of one
 * denominator is how a certificate says A while the ranking says C.
 *
 * Now the pieces live once:
 *
 *   FALLBACK_NUMERIC_KEYS  the legacy primary denominators, verbatim
 *   numericColumnKeys()    the template-curriculum denominator
 *   studentAverage()       Σscore ÷ Σcoefficient via the shared engine —
 *                          the plain mean under the default scheme
 *   assignRanks()          the tie-sharing rank walk
 *
 * and every surface asks the same question the same way:
 *
 *   keys        = levelCurriculum ? numericColumnKeys(subjects) : FALLBACK…
 *   { average } = studentAverage(scores, keys, maxScoreByColumn(subjects), scheme)
 *   grade       = gradeFor(average, scheme)
 *
 * Pure and node-loadable — the cross-surface consistency harness runs exactly
 * this code, not a re-implementation of it.
 */

import { coefficientAverage, type GradingSchemeConfig } from '../grading/scheme.ts'
import type { EffectiveSubject } from './template.ts'

/**
 * The legacy primary denominators, exactly as the five surfaces and the
 * totals grid have always counted them: 29 monthly columns, 13 numeric
 * semester columns (the four behavioural `sem_eval_*` dropdowns are words,
 * never marks). The consistency harness locks these against the totals
 * grid's own column config, so the shared list cannot drift from the screen
 * teachers check against.
 */
export const FALLBACK_NUMERIC_KEYS: Record<'monthly' | 'semester', readonly string[]> = {
  monthly: [
    'kh_listen', 'kh_speak', 'kh_read', 'kh_write', 'kh_calligraphy', 'kh_recitation', 'kh_essay',
    'math_num', 'math_meas', 'math_geo', 'math_alg', 'math_stat',
    'sci_phy', 'sci_chem', 'sci_bio', 'sci_earth', 'sci_applied',
    'soc_ethic', 'soc_geo', 'soc_hist', 'soc_home',
    'pe_sport', 'health_hygiene', 'life_skill', 'foreign',
    'ex_oral', 'ex_att', 'ex_book', 'ex_hw',
  ],
  semester: [
    'sem_kh_reading', 'sem_kh_listening_speaking', 'sem_kh_dictation', 'sem_kh_essay',
    'sem_math', 'sem_science', 'sem_moral_civics', 'sem_geo', 'sem_hist', 'sem_home_arts',
    'sem_life_skills', 'sem_foreign', 'sem_sport',
  ],
}

/**
 * The numeric column ids of a resolved curriculum — the denominator for a
 * class on a level template (a grade-12 stream). Text-kind subjects and
 * dropdown columns are ratings, not marks, and stay out.
 */
export function numericColumnKeys(subjects: EffectiveSubject[]): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const subject of subjects) {
    if (subject.valueKind === 'text') continue
    for (const col of subject.columns) {
      if (col.type === 'select' || seen.has(col.id)) continue
      seen.add(col.id)
      keys.push(col.id)
    }
  }
  return keys
}

/**
 * WHICH COLUMNS COUNT — the one rule, for every surface that averages a period.
 *
 * ── Why this is a function and not an expression ──────────────────────────
 *
 * There are two curriculum worlds in this product and the denominator differs
 * between them:
 *
 *   level curriculum   the class resolves rows tagged with its level (00021,
 *                      00026, 00028 — every real primary or secondary class on
 *                      a migrated database). The denominator IS the resolved,
 *                      selection-narrowed curriculum.
 *
 *   untagged fallback  a pre-V2 account with no class, or a database where the
 *                      curriculum seeds have not run. `resolveTemplate` then
 *                      yields only 00016's fourteen untagged rows — SIXTEEN
 *                      numeric monthly columns, against the TWENTY-NINE this
 *                      application has always counted. Keying the denominator
 *                      off the template there silently stops counting `sci_*`,
 *                      `soc_*`, `pe_sport`, `health_hygiene`, `life_skill` and
 *                      `foreign` — subjects a legacy teacher has real marks
 *                      under. So the legacy list stays authoritative for the
 *                      legacy world.
 *
 * ── What it closes ────────────────────────────────────────────────────────
 *
 * `/ranking` and `/score/total` applied this gate; `resolveMonthlyClass` — which
 * backs `ranking_monthly`, `ranking_semester`, `ranking_annual` and every report
 * composed from them — did not, and averaged a legacy class over sixteen columns
 * while the screen beside it averaged over twenty-nine. Same class, same period,
 * two answers, which is the defect the shared layer exists to prevent. Phase 1
 * closed the *subject-set* half of that divergence and recorded this half as
 * deliberately deferred; this is it.
 *
 * `subjects` must already be narrowed by `applySelection` — this decides which
 * WORLD's denominator applies, never which subjects the class teaches.
 */
export function periodDenominator(
  mode: 'monthly' | 'semester',
  subjects: EffectiveSubject[],
  levelCurriculum: boolean,
): readonly string[] {
  return levelCurriculum ? numericColumnKeys(subjects) : FALLBACK_NUMERIC_KEYS[mode]
}

export interface StudentPeriodResult {
  /** On the scheme's scale (/10 or /50), or null when nothing counted is marked. */
  average: number | null
  /** Raw sum of the counted marks — several surfaces display it. */
  total: number
  /** How many of the counted subjects carry a mark. */
  scored: number
}

/**
 * One student's average for one period.
 *
 * `scores` is the surface's subject→value map for the period; only `keys`
 * count, each weighted by its own full mark. Missing stays missing: an
 * unmarked subject drops out with its coefficient, never counted as zero —
 * the same rule everywhere, which is what makes §19 ("one student, one
 * result") a property instead of a hope.
 */
export function studentAverage(
  scores: Record<string, number | string | null | undefined>,
  keys: readonly string[],
  maxByColumn: Record<string, number>,
  scheme: GradingSchemeConfig,
): StudentPeriodResult {
  let total = 0
  let scored = 0
  const entries: { score: number | null; maxScore: number }[] = []

  for (const key of keys) {
    const raw = scores[key]
    if (raw === null || raw === undefined || raw === '') continue
    const value = Number(raw)
    if (!Number.isFinite(value)) continue
    total += value
    scored += 1
    entries.push({ score: value, maxScore: maxByColumn[key] ?? scheme.maxScore })
  }

  return { average: coefficientAverage(entries, scheme), total, scored }
}

/**
 * Ranks in place, ties sharing a rank — the walk four surfaces each had a
 * copy of. Sorts descending by the getter first.
 */
export function assignRanks<T>(
  items: T[],
  get: (item: T) => number,
  set: (item: T, rank: number) => void,
): void {
  items.sort((a, b) => get(b) - get(a))
  let rank = 1
  for (let i = 0; i < items.length; i++) {
    if (i > 0 && get(items[i]) < get(items[i - 1])) rank = i + 1
    set(items[i], rank)
  }
}

/**
 * One monthly mark, as it comes off a `score_type='monthly'` row.
 *
 * `maxScore` travels with it for the same reason it does everywhere else in
 * this layer: a class may mix denominators, and a mark divorced from its scale
 * cannot be weighted.
 */
export interface MonthlyMark {
  studentId: string
  /** The month half of `score_period` — `nov` out of `nov-2025-2026`. */
  monthId: string
  score: number
  maxScore: number
}

/**
 * Each pupil's average for each month: `studentId → monthId → average`.
 *
 * ── Why this is shared ─────────────────────────────────────────────────────
 *
 * It is the coursework half of every semester figure in the product, the trend
 * line on `/score/total`, and — through `deriveSemesterAverages` — half of
 * every annual result. It was written inside `/score/total`'s client component,
 * which is precisely why `/ranking` could not compose a year and invented one
 * off the always-empty stored keys instead.
 *
 * A month with no marks is **absent from the result**, never zero: "not yet
 * assessed" and "assessed at nothing" are different claims, and the difference
 * is what stops an unmarked month dragging a semester down.
 *
 * `coefficientAverage` is the mean, so a /10 primary month is a plain mean
 * (មេគុណ 1 per subject) and a /50 secondary one weighs by coefficient. That is
 * the same function every other average in this layer uses.
 */
export function monthlyAveragesByStudent(
  marks: readonly MonthlyMark[],
  scheme: GradingSchemeConfig,
): Record<string, Record<string, number>> {
  const acc: Record<string, Record<string, { score: number; maxScore: number }[]>> = {}
  for (const m of marks) {
    const forStudent = (acc[m.studentId] ??= {})
    ;(forStudent[m.monthId] ??= []).push({ score: m.score, maxScore: m.maxScore })
  }

  const out: Record<string, Record<string, number>> = {}
  for (const [sid, months] of Object.entries(acc)) {
    out[sid] = {}
    for (const [mid, entries] of Object.entries(months)) {
      const avg = coefficientAverage(entries, scheme)
      if (avg !== null) out[sid][mid] = avg
    }
  }
  return out
}

/**
 * The month half of a monthly `score_period`.
 *
 * `nov-2025-2026` → `nov`. Sliced from the right by the year's own length
 * rather than split on the first hyphen, because the academic year contains
 * two of its own. Returns `null` when the period does not end in the year
 * asked for, so a stray row cannot be filed under a month it does not belong
 * to.
 */
export function monthIdFromPeriod(scorePeriod: string, academicYear: string): string | null {
  const suffix = `-${academicYear}`
  if (!scorePeriod.endsWith(suffix)) return null
  const monthId = scorePeriod.slice(0, -suffix.length)
  return monthId.length > 0 ? monthId : null
}
