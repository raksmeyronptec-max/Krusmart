import 'server-only'

import { createClient } from '@/lib/supabase/server'
import {
  fetchClassSelection,
  fetchScoreTemplate,
  fetchStudentsForScope,
  resolveServerScope,
  rosterIdsForScope,
} from '@/lib/utils/serverScope'
import { resolveTemplate } from '@/lib/scores/template'
import { applySelection } from '@/lib/scores/selection'
import { assignRanks, numericColumnKeys, studentAverage } from '@/lib/scores/aggregate'
import { schemeForLevel } from '@/lib/grading/levelSchemes'
import { gradeFor } from '@/lib/grading/scheme'
import { scoreCellValue } from '@/lib/utils/score-value'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { MONTH_LABEL_BY_ID } from '@/lib/constants/months'
import { logger } from '@/lib/utils/logger'
import type { Score, Settings } from '@/lib/types'
import type { ReportPayload, ReportRow, ReportSubjectColumn } from './report-mapper'
import type { ReportType } from './report-types'

/**
 * Turning the database into a report payload.
 *
 * The one rule that makes this layer safe (§23): **the report layer is not a
 * source of truth.** It reads the same score template, the same class selection
 * and the same grading scheme the score screens read, through the same
 * `serverScope` helpers, and computes averages with the same `studentAverage`.
 * A number on a printed sheet that disagrees with the number on `/score/total`
 * would be the worst possible defect here, so there is no second calculation to
 * disagree with.
 *
 * Scoping is not re-implemented either (§18). `resolveServerScope` validates the
 * requested class against the caller's own assignments, so a forged `classId`
 * cannot widen access, and RLS refuses it independently at the database.
 */

/** What the caller asks for. `classId` is a request, never an authority. */
export interface ReportRequest {
  reportType: ReportType
  classId?: string
  academicYear: string
  /** `nov` for monthly, `sem1`/`sem2` for semester, the year itself otherwise. */
  period: string
}

/** A payload plus the counts the preview screen shows before generating (§15). */
export interface ResolvedReport {
  payload: ReportPayload
  summary: {
    studentCount: number
    subjectCount: number
    /** Class mean across pupils who have marks, or `null` when none do. */
    average: number | null
    periodLabel: string
    className: string
  }
}

/** The `scores.score_period` a monthly report reads. */
function monthlyPeriod(month: string, academicYear: string): string {
  return `${month}-${academicYear}`
}

/**
 * `score_monthly` — the representative report (§20).
 *
 * Chosen to be first because it exercises every hard part at once: class
 * scoping, the active score template, a variable number of subject columns, one
 * row per pupil, per-subject marks, derived totals and ranks, and the school
 * header. A report that clears this needs no new machinery.
 */
export async function resolveScoreMonthly(
  request: ReportRequest,
): Promise<ResolvedReport | { error: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'សូមចូលគណនីជាមុនសិន' }

  // Validated against the caller's own assignments — a forged id cannot widen.
  const scope = await resolveServerScope(user.id, request.classId)

  const [students, { rows: templateRows, context }, selection, rosterIds] =
    await Promise.all([
      fetchStudentsForScope(scope),
      fetchScoreTemplate(scope),
      fetchClassSelection(scope),
      rosterIdsForScope(scope),
    ])

  // The class's subjects — its template narrowed by what it teaches (00028),
  // never a static list (§12). Not narrowed by role: a printed class sheet
  // carries the class's whole curriculum whoever generates it.
  const effective = applySelection(
    resolveTemplate(templateRows, 'monthly', context),
    selection,
  )
  const scheme = schemeForLevel(context?.levelKey ?? null)

  const subjects: ReportSubjectColumn[] = effective.flatMap((subject) =>
    subject.valueKind === 'text'
      ? [] // behavioural ratings are words; they never enter a marks table
      : subject.columns.map((column) => ({
          key: column.id,
          label: column.label,
          maxScore: subject.maxScore,
        })),
  )

  // ------------------------------------------------------------- the marks
  const period = monthlyPeriod(request.period, request.academicYear)
  let query = supabase
    .from('scores')
    .select('student_id, subject, score_value, score_text')
    .eq('score_type', 'monthly')
    .eq('score_period', period)

  // Same roster rule the score screens use: v2 reads by enrolment, legacy by
  // teacher_id. Never a third scoping path.
  query = rosterIds ? query.in('student_id', rosterIds) : query.eq('teacher_id', scope.teacherId)

  const { data: scoreRows, error } = await query
  if (error) {
    logger.error('resolveScoreMonthly:', error)
    return { error: 'ទាញយកពិន្ទុមិនបានសម្រេច' }
  }

  const byStudent = new Map<string, Record<string, number | string | null>>()
  for (const row of (scoreRows ?? []) as Score[]) {
    const bucket = byStudent.get(row.student_id) ?? {}
    bucket[row.subject] = scoreCellValue(row)
    byStudent.set(row.student_id, bucket)
  }

  // --------------------------------------------------------- the arithmetic
  const maxByColumn = Object.fromEntries(subjects.map((s) => [s.key, s.maxScore]))
  const keys = numericColumnKeys(effective)

  const computed = students.map((student) => {
    const scores = byStudent.get(student.id) ?? {}
    const result = studentAverage(scores, keys, maxByColumn, scheme)
    return { student, scores, ...result, rank: 0 }
  })

  // `assignRanks` sorts in place, so rank on a copy and keep `computed` in
  // roster order — the printed sheet numbers pupils by the register, not by
  // how they placed, and re-ordering here would silently renumber the class.
  assignRanks([...computed], (r) => r.average ?? 0, (r, rank) => { r.rank = rank })

  // ------------------------------------------------------------- the header
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('teacher_id', user.id)
    .maybeSingle()
  const s = (settings as Settings | null) ?? {}

  let className = s.class_name ?? ''
  if (scope.mode === 'v2') {
    const { data } = await supabase
      .from('classes')
      .select('name')
      .eq('id', scope.classId)
      .maybeSingle()
    className = data?.name ?? className
  }

  const monthLabel = MONTH_LABEL_BY_ID[request.period] ?? request.period
  const periodLabel = `ខែ${monthLabel} ឆ្នាំសិក្សា ${request.academicYear}`

  const scored = computed.filter((c) => c.average !== null)
  const classAverage = scored.length
    ? scored.reduce((a, c) => a + (c.average ?? 0), 0) / scored.length
    : null

  const rows: ReportRow[] = computed.map((c, i) => {
    const average = c.average
    // Graded once: `gradeFor` is pure, but calling it twice also loses the
    // narrowing that proves `average` is non-null on both branches.
    const grade = average === null ? null : gradeFor(average, scheme)

    return {
    values: {
      'row.no': toKhmerNumber(i + 1),
      'row.name': c.student.name_kh || c.student.name_en || '',
      'row.gender': c.student.gender ?? '',
      'row.student_id': c.student.student_id ?? '',
      'row.total': c.total || null,
      'row.average': average === null ? null : Number(average.toFixed(2)),
      // `gradeFor` returns { letter, label, passed }; the sheet prints the
      // Khmer niddes label, and a separate token carries the letter.
      'row.grade': grade?.label ?? '',
      'row.letter': grade?.letter ?? '',
      'row.rank': average === null ? '' : toKhmerNumber(c.rank),
    },
    subjectValues: subjects.map((subject) => {
      const raw = c.scores[subject.key]
      if (raw === null || raw === undefined || raw === '') return null
      const value = Number(raw)
      return Number.isFinite(value) ? value : String(raw)
    }),
    }
  })

  return {
    payload: {
      scalars: {
        'school.name': s.school_name ?? '',
        'school.code': s.school_code ?? '',
        'school.unit1': s.management_unit_1 ?? '',
        'school.unit2': s.management_unit_2 ?? '',
        'class.name': className,
        'class.count': toKhmerNumber(students.length),
        'period.label': periodLabel,
        'period.month': monthLabel,
        'period.year': request.academicYear,
        'class.average': classAverage === null ? '' : Number(classAverage.toFixed(2)),
        'teacher.name': s.homeroom_teacher ?? s.teacher_name ?? '',
        'director.name': s.director_name ?? s.manager_name ?? '',
        'director.role': s.manager_role ?? 'នាយកសាលា',
        'province.date': s.province_for_date ?? s.province_date ?? '',
      },
      subjects,
      rows,
    },
    summary: {
      studentCount: students.length,
      subjectCount: subjects.length,
      average: classAverage,
      periodLabel,
      className,
    },
  }
}

/**
 * Dispatch to a report's resolver.
 *
 * One `switch`, and every unmigrated report falls through it with an honest
 * message rather than a half-built document. §27's incremental migration lives
 * here: a report moves onto the engine by gaining a case and flipping `engine`
 * in its definition, and nothing else in the product changes.
 */
export async function resolveReport(
  request: ReportRequest,
): Promise<ResolvedReport | { error: string }> {
  switch (request.reportType) {
    case 'score_monthly':
      return resolveScoreMonthly(request)
    default:
      return { error: 'របាយការណ៍នេះមិនទាន់ប្រើប្រព័ន្ធបង្កើតឯកសាររួមនៅឡើយទេ' }
  }
}
