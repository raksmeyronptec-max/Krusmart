// Relative, with the extension, so node can load this module directly.
import { assignRanks, monthIdFromPeriod, monthlyAveragesByStudent, studentAverage, type MonthlyMark } from './aggregate.ts'
import {
  SEM1_KEY, SEM2_KEY, buildAnnualResult, deriveSemesterAverages, storedAnnualValue,
  type AnnualResult, type ExamMark,
} from './annual.ts'
import type { GradingSchemeConfig } from '../grading/scheme.ts'
import type { ScoreScope } from './workspace.ts'

/**
 * One class, one period, ranked — the arithmetic three screens were each
 * writing for themselves.
 *
 * ── What was actually wrong ───────────────────────────────────────────────
 *
 * `/ranking`, `/honor-roll` and `/certificate` are three presentations of one
 * question: how did this class do in this period, and in what order. Each had
 * its own copy of the answer, and all three copies had the same defect in the
 * annual branch — two `parseFloat`s off `sem1_avg` / `sem2_avg` and a
 * hand-counted divisor. **Nothing in this application writes an annual row**,
 * so those keys are always empty and all three printed `0.00` beside every
 * pupil of every real class, ranked equal, while `/score/total` and the printed
 * annual sheets showed the real year.
 *
 * One bug written three times is not three bugs, it is one missing module.
 *
 * ── What this is and is not ───────────────────────────────────────────────
 *
 * PURE, and it invents no arithmetic of its own. Every figure is delegated:
 *
 *   monthly / semester   `studentAverage` — Σscore ÷ Σcoefficient under a
 *                        secondary scheme, the plain mean under the primary
 *                        default. Unchanged from what these screens showed.
 *   annual               `deriveSemesterAverages` then `buildAnnualResult` —
 *                        stored first, derived otherwise, the same pair
 *                        `/score/total`'s ឆ្នាំ tab and `resolveAnnualClass`
 *                        call.
 *   order                `assignRanks` — ties share a rank and the next rank
 *                        skips (1,2,2,4).
 *
 * It does NOT fetch. The three screens read slightly different sets of rows
 * (annual needs both semesters' exams and the year's months), and a builder
 * that owned the queries would have to own their differences too. They bring
 * the rows; this decides what the rows mean.
 */

/** A `scores` row, reduced to what a period result needs. */
export interface ScoreRowLike {
  student_id: string
  subject: string
  score_period?: string
  score_value?: number | string | null
  score_text?: string | null
}

export interface PeriodResultInput {
  /** Roster order is preserved in the output; ranking is computed separately. */
  studentIds: readonly string[]
  mode: ScoreScope
  academicYear: string
  /** The period's own rows — monthly, semester, or the stored annual sheet. */
  records: readonly ScoreRowLike[]
  /** Column ids that count toward the average for this mode. */
  numericKeys: readonly string[]
  /** Full mark per column for `mode` — the denominator weights. */
  maxByColumn: Record<string, number>
  scheme: GradingSchemeConfig

  // ---- annual only; ignored in the other two modes -----------------------
  /** `score_type='semester'` rows for each semester's exam. */
  sem1Exams?: readonly ScoreRowLike[]
  sem2Exams?: readonly ScoreRowLike[]
  /** Every `score_type='monthly'` row of the year, for the coursework half. */
  monthlyRecords?: readonly ScoreRowLike[]
  /** Full mark per column under the MONTHLY resolution, for those rows. */
  monthlyMaxByColumn?: Record<string, number>
  /** The class's own calendar split — never a compiled-in month list. */
  sem1Months?: readonly string[]
  sem2Months?: readonly string[]
}

export interface PeriodResult {
  studentId: string
  /** Raw marks keyed by column id, as the screens render them. */
  scores: Record<string, number | string | null>
  /** Σ of the counted marks. Presentation only — never the ranking value. */
  total: number
  /** The canonical average, or null when the pupil has no result at all. */
  average: number | null
  rank: number
  /** Only in annual mode: which source the year came from, and its status. */
  annual: AnnualResult | null
}

/**
 * The placing to print — or `null` when the pupil has no result to place.
 *
 * `rank` is an ORDERING POSITION and every pupil has one: `assignRanks` weighs a
 * null average as 0, which is what puts unmarked pupils last and lets a screen
 * sort a whole roster in one pass. A *placing* is a claim about performance, and
 * a pupil who was never marked has not placed anywhere — printing "៤" beside
 * them states a result they were not assessed for.
 *
 * The rule was written five times inside `report-data.ts`
 * (`average === null ? '' : toKhmerNumber(c.rank)`) and **nowhere on the
 * screens**, so `/ranking` printed a rank for every unmarked pupil while the
 * ranking sheet built from the same figures printed a blank — the two
 * disagreeing about who placed where, which is the defect
 * `buildPeriodResults` exists to prevent. It is a property of the result, so
 * it lives beside the result and every presentation reads the one copy.
 *
 * Structural parameter rather than `PeriodResult`: the resolvers rank their own
 * row shape, and this rule is about two fields, not about a type.
 */
export function placing(r: { average: number | null; rank: number }): number | null {
  return r.average === null ? null : r.rank
}

/** `score_value` first, falling back to the Khmer-word column. */
function cellValue(row: ScoreRowLike): number | string | null {
  if (row.score_value !== null && row.score_value !== undefined) return row.score_value
  if (typeof row.score_text === 'string' && row.score_text !== '') return row.score_text
  return null
}

function numeric(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const v = Number(raw)
  return Number.isFinite(v) ? v : null
}

function examMarks(
  rows: readonly ScoreRowLike[],
  maxByColumn: Record<string, number>,
  scheme: GradingSchemeConfig,
): ExamMark[] {
  const out: ExamMark[] = []
  for (const r of rows) {
    const v = numeric(cellValue(r))
    if (v === null) continue
    out.push({ studentId: r.student_id, score: v, maxScore: maxByColumn[r.subject] ?? scheme.maxScore })
  }
  return out
}

/**
 * Build one period's results, in roster order, each carrying its rank.
 *
 * Roster order rather than rank order, deliberately: a marks register is read
 * down the register and a league table down the placings, and every one of
 * these screens sorts for itself afterwards. Handing back a pre-sorted list
 * would make the register the odd one out.
 *
 * An unmarked pupil gets `average: null` — never `0` — so a screen can choose
 * between printing a blank and printing `0.00` without the distinction having
 * already been thrown away. `assignRanks` weighs a null as 0, which is what
 * puts unmarked pupils last, sharing the final rank.
 */
export function buildPeriodResults(input: PeriodResultInput): PeriodResult[] {
  const {
    studentIds, mode, academicYear, records, numericKeys, maxByColumn, scheme,
  } = input

  // Marks indexed per pupil once, rather than filtering the row list per pupil
  // — that was an O(pupils × rows) scan in all three screens.
  const byStudent = new Map<string, Record<string, number | string | null>>()
  for (const row of records) {
    let bucket = byStudent.get(row.student_id)
    if (!bucket) {
      bucket = {}
      byStudent.set(row.student_id, bucket)
    }
    bucket[row.subject] = cellValue(row)
  }

  /*
   * The derived halves of the year, composed by the shared layer. Empty outside
   * annual mode, and empty until the extra reads land — in which case
   * `buildAnnualResult` falls through to the stored sheet, which is exactly the
   * behaviour these screens had before.
   */
  const derived = mode === 'annual'
    ? deriveSemesterAverages({
        studentIds,
        sem1Exams: examMarks(input.sem1Exams ?? [], maxByColumn, scheme),
        sem2Exams: examMarks(input.sem2Exams ?? [], maxByColumn, scheme),
        monthlyAverages: monthlyAveragesByStudent(
          (input.monthlyRecords ?? []).reduce<MonthlyMark[]>((acc, r) => {
            const v = numeric(cellValue(r))
            const monthId = r.score_period ? monthIdFromPeriod(r.score_period, academicYear) : null
            if (v !== null && monthId !== null) {
              acc.push({
                studentId: r.student_id,
                monthId,
                score: v,
                maxScore: (input.monthlyMaxByColumn ?? maxByColumn)[r.subject] ?? scheme.maxScore,
              })
            }
            return acc
          }, []),
          scheme,
        ),
        sem1Months: input.sem1Months ?? [],
        sem2Months: input.sem2Months ?? [],
        scheme,
      })
    : {}

  const results: PeriodResult[] = studentIds.map((studentId) => {
    const scores = byStudent.get(studentId) ?? {}

    if (mode === 'annual') {
      const annual = buildAnnualResult({
        sem1Stored: storedAnnualValue(scores[SEM1_KEY]),
        sem2Stored: storedAnnualValue(scores[SEM2_KEY]),
        sem1Derived: derived[studentId]?.sem1 ?? null,
        sem2Derived: derived[studentId]?.sem2 ?? null,
      }, scheme.passMark)

      return {
        studentId,
        scores,
        total: (annual.sem1.value ?? 0) + (annual.sem2.value ?? 0),
        average: annual.average,
        rank: 0,
        annual,
      }
    }

    const { average, total } = studentAverage(scores, numericKeys, maxByColumn, scheme)
    return { studentId, scores, total, average, rank: 0, annual: null }
  })

  // `assignRanks` sorts in place, so rank on a copy and leave `results` in
  // roster order — the same guard `report-data.ts` applies for the same reason.
  assignRanks([...results], (r) => r.average ?? 0, (r, rank) => { r.rank = rank })

  return results
}
