import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import { ACADEMIC_MONTH_IDS, MONTH_LABEL_BY_ID } from '@/lib/constants/months'
import { simpleAverage, type GradingSchemeConfig } from '@/lib/grading/scheme'
import { studentAverage } from '@/lib/scores/aggregate'
import { resolveStudentGradingContext } from '@/lib/utils/serverScope'
import { scoreNumericValue } from '@/lib/utils/score-value'
import { subjectLabel } from '@/lib/constants/subjects'
import { logger } from '@/lib/utils/logger'
import type { AttendanceRecord, Score, Student } from '@/lib/types'

/**
 * Everything the student detail view shows, in one round of queries.
 *
 * Until now a teacher could see a pupil only as a row: one line in the roster,
 * one column in the score grid, one cell on the attendance sheet. Answering
 * "how is this child doing?" meant opening four screens and holding the answer
 * in their head. This assembles the same records the existing screens read —
 * no new tables, no new columns — around a single student.
 *
 * ACCESS
 * The student is fetched with `.eq('teacher_id', user.id)` on top of RLS, the
 * app-wide convention. A student id that belongs to another teacher returns
 * `null` here and a 404 upstream, so the route cannot be used to probe for
 * rows the caller may not read.
 */

export interface SubjectAverage {
  subject: string
  label: string
  average: number | null
  /** How many months carry a mark for this subject. */
  entries: number
  /** The subject's full mark, so the page colours and scales against it. */
  max: number
}

export interface MonthAverage {
  id: string
  label: string
  average: number | null
}

export interface AttendanceSummary {
  present: number
  excused: number
  absent: number
  total: number
  /** Present + excused over total, or null when nothing has been recorded. */
  rate: number | null
  /** Most recent marks first, capped — a log, not the full year. */
  recent: AttendanceRecord[]
}

/**
 * One homework mark.
 *
 * `scores.subject` holds `hw_<dayOfMonth>` and `score_period` holds
 * `${academicYear}_${monthId}`, so the readable form has to be reassembled
 * from both — `subjectLabel('hw_12')` would just echo the key back.
 */
export interface HomeworkMark {
  /** Khmer month name from the period, e.g. `វិច្ឆិកា`. */
  month: string
  /** Day of month parsed out of `hw_<n>`; null if the key is malformed. */
  day: number | null
  value: number | null
}

export interface StudentDetail {
  student: Student
  academicYear: string
  attendance: AttendanceSummary
  subjects: SubjectAverage[]
  months: MonthAverage[]
  overallAverage: number | null
  /** The pupil's grading scheme — the page grades and colours with it. */
  scheme: GradingSchemeConfig
  /** Homework marks for the year, in academic-month then day order. */
  homework: HomeworkMark[]
}

const RECENT_LIMIT = 12

export async function getStudentDetail(id: string): Promise<StudentDetail | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: studentRow, error } = await supabase
    .from('students')
    .select('*')
    .eq('id', id)
    .eq('teacher_id', user.id)
    .maybeSingle()

  if (error) logger.error(error)
  if (!studentRow) return null
  const student = studentRow as Student

  // The teacher's configured year, matching what `student-tracking` reads, so
  // the two screens never disagree about which year is on display.
  const { data: settings } = await supabase
    .from('settings')
    .select('academic_year')
    .eq('teacher_id', user.id)
    .maybeSingle()
  const academicYear: string = settings?.academic_year || getCurrentAcademicYear()

  // Two score queries, not one, because the two `score_period` formats do not
  // share a suffix: monthly marks end `-2025-2026`, homework marks are
  // `2025_11`. A single `like` filtered for the academic year would silently
  // drop every homework row, which is exactly the trap this file's sibling
  // features fall into.
  const [attendanceRes, monthlyRes, homeworkRes] = await Promise.all([
    supabase
      .from('attendance')
      .select('*')
      .eq('student_id', id)
      .eq('teacher_id', user.id)
      .order('date', { ascending: false }),
    supabase
      .from('scores')
      .select('*')
      .eq('student_id', id)
      .eq('teacher_id', user.id)
      .eq('score_type', 'monthly')
      .like('score_period', `%${academicYear}`),
    supabase
      .from('scores')
      .select('*')
      .eq('student_id', id)
      .eq('teacher_id', user.id)
      .eq('score_type', 'homework'),
  ])

  if (attendanceRes.error) logger.error(attendanceRes.error)
  if (monthlyRes.error) logger.error(monthlyRes.error)
  if (homeworkRes.error) logger.error(homeworkRes.error)

  const records = (attendanceRes.data ?? []) as AttendanceRecord[]
  const monthly = (monthlyRes.data ?? []) as Score[]

  // Homework periods are `${academicYear}_${monthId}` — `2025-2026_nov`. The
  // separator is an underscore where every other score type uses a hyphen, and
  // the left half is the whole academic year, not a calendar year, so the
  // prefix has to be the year string itself.
  const homeworkRows = ((homeworkRes.data ?? []) as Score[]).filter((s) =>
    s.score_period.startsWith(`${academicYear}_`),
  )

  const present = records.filter((r) => r.status === 'P').length
  const excused = records.filter((r) => r.status === 'L').length
  const absent = records.filter((r) => r.status === 'A').length
  const total = records.length

  const attendance: AttendanceSummary = {
    present,
    excused,
    absent,
    total,
    // `L` is ច្បាប់ — an authorised absence. It counts as attending here for the
    // same reason the dashboard counts it: the child is not truant.
    rate: total ? Math.round(((present + excused) / total) * 1000) / 10 : null,
    recent: records.slice(0, RECENT_LIMIT),
  }

  // Per subject, across the months that carry a mark.
  // The pupil's grading context, resolved once from their own enrolment — this
  // page is reached by id and may have no active class selection at all.
  const grading = await resolveStudentGradingContext(id)

  const bySubject = new Map<string, number[]>()
  // Per month: subject key → mark, so the month average can weigh each mark by
  // its subject's full mark rather than counting every column as equal.
  const byMonth = new Map<string, Record<string, number>>()

  for (const row of monthly) {
    const v = scoreNumericValue(row)
    if (v === null) continue
    bySubject.set(row.subject, [...(bySubject.get(row.subject) ?? []), v])
    // `score_period` is `${monthId}-${academicYear}`; the id is the first hyphen
    // -delimited segment, and the year contributes the rest.
    const monthId = row.score_period.split('-')[0]
    byMonth.set(monthId, { ...(byMonth.get(monthId) ?? {}), [row.subject]: v })
  }

  // A per-subject average is a mean of that subject's own marks across months,
  // so it stays on the subject's own scale — no weighting applies within one
  // subject, and none is introduced here.
  const subjects: SubjectAverage[] = [...bySubject.entries()]
    .map(([subject, values]) => ({
      subject,
      label: subjectLabel(subject),
      average: simpleAverage(values),
      entries: values.length,
      max: grading.maxByColumn[subject] ?? grading.scheme.maxScore,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'km'))

  // Academic-year order (Nov → Oct), and only the months that hold a mark —
  // twelve mostly-empty rows would bury the ones that matter.
  const months: MonthAverage[] = ACADEMIC_MONTH_IDS.filter((m) => byMonth.has(m)).map((m) => {
    const marks = byMonth.get(m) ?? {}
    return {
      id: m,
      label: MONTH_LABEL_BY_ID[m] ?? m,
      average: studentAverage(marks, Object.keys(marks), grading.maxByColumn, grading.scheme).average,
    }
  })

  // Average the month averages, not every raw mark: a month where six subjects
  // were entered should not outweigh one where two were.
  const overallAverage = simpleAverage(months.map((m) => m.average))

  const homework: HomeworkMark[] = homeworkRows
    .map((s) => {
      const monthId = s.score_period.split('_')[1] ?? ''
      const day = Number(s.subject.replace('hw_', ''))
      return {
        monthId,
        month: MONTH_LABEL_BY_ID[monthId] ?? monthId,
        day: Number.isFinite(day) ? day : null,
        value: scoreNumericValue(s),
      }
    })
    // Academic-year order (Nov → Oct), then by day within a month, so the list
    // reads the way the school year runs rather than alphabetically.
    .sort((a, b) => {
      const mi = ACADEMIC_MONTH_IDS.indexOf(a.monthId as (typeof ACADEMIC_MONTH_IDS)[number])
      const mj = ACADEMIC_MONTH_IDS.indexOf(b.monthId as (typeof ACADEMIC_MONTH_IDS)[number])
      return mi !== mj ? mi - mj : (a.day ?? 0) - (b.day ?? 0)
    })
    .map(({ month, day, value }) => ({ month, day, value }))

  return { student, academicYear, attendance, subjects, months, overallAverage, scheme: grading.scheme, homework }
}

/**
 * Roster neighbours, so the detail view can offer previous/next without the
 * teacher going back to the list between every pupil.
 *
 * Ordered the same way the roster's default sort is — `order_index` first,
 * `created_at` as the tiebreak for rows that predate it.
 */
export async function getRosterNeighbours(
  studentId: string,
): Promise<{ prev: Student | null; next: Student | null; position: number; total: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { prev: null, next: null, position: 0, total: 0 }

  const { data } = await supabase
    .from('students')
    .select('id, name_kh, student_id, order_index, created_at')
    .eq('teacher_id', user.id)
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  const roster = (data ?? []) as Student[]
  const i = roster.findIndex((s) => s.id === studentId)
  if (i === -1) return { prev: null, next: null, position: 0, total: roster.length }

  return {
    prev: i > 0 ? roster[i - 1] : null,
    next: i < roster.length - 1 ? roster[i + 1] : null,
    position: i + 1,
    total: roster.length,
  }
}
