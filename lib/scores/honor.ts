/**
 * Who earns a place on the honour roll.
 *
 * READ THIS BEFORE TREATING THE DEFAULTS AS POLICY.
 *
 * The product has **no official honour criterion**. The only implementation
 * that existed — `/honor-roll` — ranks the class and takes `.slice(0, 5)`,
 * which is a property of its podium layout (five cards) rather than a stated
 * rule: change the layout to four cards and the "policy" changes with it. No
 * document in the repository defines honour, and no ministry file was supplied.
 *
 * So this module does NOT reproduce "top 5", for two reasons. It is not
 * criteria-based — a class where everyone fails still produces five honourees,
 * and a class where twenty pupils score 9.5 honours five of them. And a
 * position-based rule cannot be checked against anything: a teacher asking "why
 * is this pupil not on the list?" gets "someone else was fifth", which is not a
 * reason a parent can be given.
 *
 * Instead the criteria are **configurable, and their defaults are derived from
 * the grading scheme the class already uses** — never from a number typed here:
 *
 *   minAverage        the scheme's own `ល្អ`/B band minimum (8 on /10, 40 on
 *                     /50). Reading it from `scheme.bands` is what makes the
 *                     rule scale to secondary without a second constant, and
 *                     what stops it being a figure I chose.
 *   noFailingSubject  no marked subject below `scheme.passMark`. Also the
 *                     scheme's, also not invented.
 *
 * Both are PROVISIONAL. `HONOR_CRITERIA_PROVENANCE` is carried into the report
 * payload and printed on the document, so nobody mistakes the output for a
 * ministry-sanctioned honour roll. When a real rule arrives, it replaces
 * `defaultHonorCriteria` and nothing else changes.
 *
 * Pure — no server imports. The resolver and the verification scripts share it.
 */

import type { GradingSchemeConfig } from '../grading/scheme.ts'

/** Stated on the document and in the preview, so the rule is never mistaken for policy. */
export const HONOR_CRITERIA_PROVENANCE = 'derived' as const

/**
 * What a pupil must clear to be listed.
 *
 * Every threshold is on the scheme's own scale, so a criteria object is only
 * meaningful beside the scheme it was built from — which is why
 * `defaultHonorCriteria` takes one rather than exporting a constant.
 */
export interface HonorCriteria {
  /** Minimum overall average, on the scheme's scale. */
  minAverage: number
  /** Every marked subject must reach the pass mark. */
  noFailingSubject: boolean
  /** Minimum marked subjects; 0 accepts any pupil with an average at all. */
  minMarkedSubjects: number
  /** Khmer sentence describing the rule, for the preview and the document. */
  label: string
}

/**
 * The band a pupil must reach — the scheme's second-highest, `ល្អ` on primary.
 *
 * Second rather than top on purpose: `ល្អណាស់` (A, ≥9/10) is a threshold a
 * whole class can miss in a hard month, and an honour roll that is empty most
 * of the year is one nobody prints. `ល្អ` is the highest band a typical class
 * populates. That is a judgement about usefulness, not a rule — hence
 * provisional.
 */
function honorBandMinimum(scheme: GradingSchemeConfig): number {
  // `bands` is ordered high → low. Index 1 is the second-highest; a scheme with
  // a single band falls back to it, and an empty one to the pass mark.
  const band = scheme.bands[1] ?? scheme.bands[0]
  return band ? band.min : scheme.passMark
}

/** The provisional default criteria for a scheme. */
export function defaultHonorCriteria(scheme: GradingSchemeConfig): HonorCriteria {
  const minAverage = honorBandMinimum(scheme)
  return {
    minAverage,
    noFailingSubject: true,
    minMarkedSubjects: 1,
    label: `មធ្យមភាគចាប់ពី ${minAverage} ឡើងទៅ និងគ្មានមុខវិជ្ជាណាធ្លាក់`,
  }
}

/** One pupil's result, as the criteria need to see it. */
export interface HonorCandidate {
  /** The canonical average — never recomputed here (§4/§20). */
  average: number | null
  /** Marked subject values, keyed by column id. */
  scores: Record<string, number | string | null>
  /** The column ids this class's template actually assesses. */
  subjectKeys: readonly string[]
  /** Full mark per column, for judging a subject against the pass mark. */
  maxByColumn: Record<string, number>
}

/** Why a pupil did or did not make the list. */
export interface HonorVerdict {
  eligible: boolean
  /** Khmer reason when not eligible — the answer to "why not?". */
  reason: string | null
  /** Marked subjects counted. */
  markedSubjects: number
  /** Subjects below the pass mark, by column id. */
  failingSubjects: string[]
}

/**
 * Judge one pupil.
 *
 * Takes the average rather than computing it: §20 requires the honour figure
 * to be the canonical one, and the surest way to guarantee that is to make it
 * impossible for this module to produce a different number.
 *
 * A subject's pass mark scales with its own full mark — a subject out of 100
 * passes at 50 under a /10 scheme's half-way pass, not at 5 — so the comparison
 * is proportional rather than absolute.
 */
export function evaluateHonor(
  candidate: HonorCandidate,
  criteria: HonorCriteria,
  scheme: GradingSchemeConfig,
): HonorVerdict {
  const failing: string[] = []
  let marked = 0

  const passRatio = scheme.passMark / scheme.maxScore

  for (const key of candidate.subjectKeys) {
    const raw = candidate.scores[key]
    if (raw === null || raw === undefined || raw === '') continue
    const value = Number(raw)
    if (!Number.isFinite(value)) continue
    marked += 1
    const max = candidate.maxByColumn[key] ?? scheme.maxScore
    if (value < max * passRatio) failing.push(key)
  }

  if (candidate.average === null) {
    return { eligible: false, reason: 'មិនទាន់មានពិន្ទុ', markedSubjects: marked, failingSubjects: failing }
  }
  if (marked < criteria.minMarkedSubjects) {
    return { eligible: false, reason: 'មុខវិជ្ជាមានពិន្ទុមិនគ្រប់គ្រាន់', markedSubjects: marked, failingSubjects: failing }
  }
  if (candidate.average < criteria.minAverage) {
    return { eligible: false, reason: `មធ្យមភាគក្រោម ${criteria.minAverage}`, markedSubjects: marked, failingSubjects: failing }
  }
  if (criteria.noFailingSubject && failing.length > 0) {
    return { eligible: false, reason: 'មានមុខវិជ្ជាធ្លាក់', markedSubjects: marked, failingSubjects: failing }
  }

  return { eligible: true, reason: null, markedSubjects: marked, failingSubjects: failing }
}
