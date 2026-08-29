/**
 * What a results page says about a class, derived from rows the table already
 * has.
 *
 * Pulled out of `ScoreTotalClient` and its analytics drawer for two reasons.
 * The drawer computed subject averages *per column* — "សមត្ថភាពស្តាប់ 8.4" —
 * which is a component, not a subject; §13 of the redesign asks for the subject
 * ("ភាសាខ្មែរ 8.72"), and those are different numbers whenever a subject has
 * more than one column. And nothing here touches React, so the arithmetic that
 * decides who is failing can be tested without rendering anything.
 *
 * Every function takes rows that are already filtered and columns that are
 * already narrowed to the class's template, so none of them repeats a scoping
 * or visibility decision made upstream.
 */

import type { GradingSchemeConfig } from '@/lib/grading/scheme'
import type { ColumnGroup, GridColumn, TotalledStudent } from '@/app/(main)/score/total/scoreTotalConfig'

/** Read a cell as a mark, or `null` when it holds nothing countable. */
export function markOf(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/** Marks recorded for one column across a set of pupils. */
function marksFor(rows: TotalledStudent[], column: GridColumn): number[] {
  if (column.isText) return []
  return rows
    .map((r) => markOf(r.scores[column.key]))
    .filter((v): v is number => v !== null)
}

// ------------------------------------------------------------------- subjects

/** How a class is doing in one subject of its template. */
export interface SubjectPerformance {
  /** The subject's heading — its `group_label`, e.g. `ភាសាខ្មែរ`. */
  name: string
  /** Mean of every mark recorded under the subject's columns. */
  average: number
  /** How many marks that mean is built from. */
  count: number
  /** Full mark, so the figure can be shown on its own scale. */
  maxScore: number
  /** The subject's components, weakest first — the "where exactly" of a low subject. */
  columns: { key: string; label: string; average: number; count: number }[]
}

/**
 * Class average per subject, strongest first.
 *
 * The subject average is the mean of every mark under it, not the mean of its
 * column means. Those differ whenever the columns carry different numbers of
 * marks, and the flat mean is the one that matches `computeRows` — which sums
 * marks and divides by how many there were. Two numbers on one screen that
 * disagree about the same class is worse than either being slightly cruder.
 *
 * Behavioural columns are excluded throughout: they hold Khmer words, and
 * `marksFor` returns nothing for them. A group made only of those disappears
 * rather than showing a meaningless 0.
 */
export function subjectPerformance(
  groups: ColumnGroup[],
  rows: TotalledStudent[],
  maxByColumn: Record<string, number> = {},
  fallbackMax = 10,
): SubjectPerformance[] {
  const out: SubjectPerformance[] = []

  for (const group of groups) {
    const all: number[] = []
    const columns: SubjectPerformance['columns'] = []
    let maxScore = 0

    for (const column of group.columns) {
      const marks = marksFor(rows, column)
      if (marks.length > 0) {
        columns.push({
          key: column.key,
          label: column.label,
          average: mean(marks),
          count: marks.length,
        })
        all.push(...marks)
      }
      maxScore = Math.max(maxScore, maxByColumn[column.key] ?? fallbackMax)
    }

    if (all.length === 0) continue

    out.push({
      name: group.name,
      average: mean(all),
      count: all.length,
      maxScore: maxScore || fallbackMax,
      columns: columns.sort((a, b) => a.average - b.average),
    })
  }

  return out.sort((a, b) => b.average / b.maxScore - a.average / a.maxScore)
}

function mean(values: number[]): number {
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
}

// ------------------------------------------------------------------ attention

/** A pupil the teacher should look at, and the reason. */
export interface AttentionStudent {
  student: TotalledStudent
  average: number
  /** The subject dragging them down, when one stands out. */
  weakestSubject: { name: string; average: number } | null
}

/**
 * Pupils below the pass mark, worst first.
 *
 * The threshold is `scheme.passMark` — never a constant. §14 is explicit about
 * this and it matters beyond tidiness: primary marks out of 10 and secondary
 * out of 50, so any hardcoded number is wrong for one of them.
 *
 * A pupil with no marks at all is *not* listed. Their average is 0, which would
 * put them at the top of a "needs help" list built naively, when what they
 * actually need is for someone to enter their marks — a different problem, and
 * one the "សិស្សមានពិន្ទុ" count on the summary already surfaces.
 */
export function attentionList(
  rows: TotalledStudent[],
  groups: ColumnGroup[],
  scheme: GradingSchemeConfig,
  maxByColumn: Record<string, number> = {},
): AttentionStudent[] {
  return rows
    .filter((r) => r.finalAverageForRank > 0 && r.finalAverageForRank < scheme.passMark)
    .map((student) => ({
      student,
      average: student.finalAverageForRank,
      weakestSubject: weakestSubjectFor(student, groups, maxByColumn, scheme.maxScore),
    }))
    .sort((a, b) => a.average - b.average)
}

/**
 * The subject one pupil is weakest in, as a share of its own full mark.
 *
 * Compared proportionally so a subject marked out of 100 does not always look
 * like the strong one beside a subject marked out of 10.
 */
function weakestSubjectFor(
  student: TotalledStudent,
  groups: ColumnGroup[],
  maxByColumn: Record<string, number>,
  fallbackMax: number,
): { name: string; average: number } | null {
  let worst: { name: string; average: number; ratio: number } | null = null

  for (const group of groups) {
    const marks: number[] = []
    let maxScore = 0
    for (const column of group.columns) {
      if (column.isText) continue
      const value = markOf(student.scores[column.key])
      if (value !== null) marks.push(value)
      maxScore = Math.max(maxScore, maxByColumn[column.key] ?? fallbackMax)
    }
    if (marks.length === 0) continue

    const average = mean(marks)
    const ratio = average / (maxScore || fallbackMax)
    if (!worst || ratio < worst.ratio) worst = { name: group.name, average, ratio }
  }

  return worst ? { name: worst.name, average: worst.average } : null
}

// -------------------------------------------------------------------- summary

/** The best average in the class, for the summary card. */
export function topPerformer(
  rows: TotalledStudent[],
): { student: TotalledStudent; average: number } | null {
  let best: { student: TotalledStudent; average: number } | null = null
  for (const row of rows) {
    if (row.finalAverageForRank <= 0) continue
    if (!best || row.finalAverageForRank > best.average) {
      best = { student: row, average: row.finalAverageForRank }
    }
  }
  return best
}

// ------------------------------------------------------------------- sorting

export type ResultSort = 'rank' | 'average_desc' | 'average_asc' | 'name'

export const RESULT_SORTS: { id: ResultSort; label: string }[] = [
  { id: 'rank', label: 'ចំណាត់ថ្នាក់' },
  { id: 'average_desc', label: 'មធ្យមភាគ ខ្ពស់ → ទាប' },
  { id: 'average_asc', label: 'មធ្យមភាគ ទាប → ខ្ពស់' },
  { id: 'name', label: 'ឈ្មោះ' },
]

/**
 * Order rows for the results table.
 *
 * `rank` keeps the roster order the table has always used rather than sorting
 * by rank number — the two agree for pupils who have marks, and roster order
 * keeps unmarked pupils where the teacher expects to find them instead of
 * dumping them all at the bottom.
 *
 * Sorting never mutates: the table re-sorts under a teacher who is typing, and
 * an in-place sort of the memoised rows would reorder the array the edit
 * handlers are indexing into.
 */
export function sortRows(
  rows: TotalledStudent[],
  sort: ResultSort,
  rowNumbers: Map<string, number>,
): TotalledStudent[] {
  const copy = [...rows]
  switch (sort) {
    case 'average_desc':
      return copy.sort((a, b) => b.finalAverageForRank - a.finalAverageForRank)
    case 'average_asc':
      return copy.sort((a, b) => a.finalAverageForRank - b.finalAverageForRank)
    case 'name':
      return copy.sort((a, b) =>
        String(a.name_kh ?? '').localeCompare(String(b.name_kh ?? ''), 'km'))
    case 'rank':
    default:
      return copy.sort(
        (a, b) => (rowNumbers.get(a.id) ?? 0) - (rowNumbers.get(b.id) ?? 0))
  }
}
