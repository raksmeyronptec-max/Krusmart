import 'server-only'

import { createClient } from '@/lib/supabase/server'
import {
  classIdFromSearchParams,
  resolveServerGradingContext,
  fetchStudentsForScope,
  resolveServerScope,
  rosterIdsForScope,
} from '@/lib/utils/serverScope'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import { simpleAverage, type GradingSchemeConfig } from '@/lib/grading/scheme'
import { studentAverage } from '@/lib/scores/aggregate'
import { scoreNumericValue } from '@/lib/utils/score-value'
import { logger } from '@/lib/utils/logger'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { AttendanceRecord, HomeworkAssignment, Score } from '@/lib/types'

/**
 * What the dashboard needs to answer four questions:
 *
 *   What is happening today?      today's attendance
 *   What needs my attention?      absences, unmarked days, overdue homework
 *   How is my class performing?   the month's average and its grade
 *   What should I do next?        the quick actions the page offers
 *
 * Everything is derived from the existing tables through the existing scope
 * helpers — no new columns, no schema change, and the same `teacher_id` /
 * roster narrowing every other feature already applies on top of RLS.
 */

export interface DashboardStats {
  totalStudents: number
  female: number
  /** Null when nobody has been marked today — "not taken" is not "zero present". */
  todayPresent: number | null
  todayAbsent: number
  todayLate: number
  attendanceRate: number | null
  monthAverage: number | null
  /** The class's grading scheme — the page grades and labels with it. */
  scheme?: GradingSchemeConfig
  /** Students whose monthly average is below the scheme's pass mark. */
  strugglingCount: number
  openHomework: number
  academicYear: string
}

export interface AttentionItem {
  id: string
  severity: 'danger' | 'warning' | 'info'
  label: string
  href: string
}

function todayISO(): string {
  // The teacher's own day, not UTC — a 7am mark in Phnom Penh must not read as
  // yesterday.
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export async function getDashboardData(
  searchParams?: Promise<Record<string, string | string[] | undefined>>,
): Promise<{ stats: DashboardStats; attention: AttentionItem[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const academicYear = getCurrentAcademicYear()
  const empty: DashboardStats = {
    totalStudents: 0, female: 0, todayPresent: null, todayAbsent: 0, todayLate: 0,
    attendanceRate: null, monthAverage: null, strugglingCount: 0, openHomework: 0, academicYear,
  }
  if (!user) return { stats: empty, attention: [] }

  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)
  // One grading resolution for the whole page, in parallel with the roster.
  const [students, rosterIds, grading] = await Promise.all([
    fetchStudentsForScope(scope),
    rosterIdsForScope(scope),
    resolveServerGradingContext(user.id, requestedClassId),
  ])
  const ids = rosterIds ?? students.map((s) => s.id)

  const today = todayISO()

  // An empty roster would make `.in()` match nothing, so skip those round trips
  // entirely rather than firing queries that cannot return anything.
  const [attendanceRes, scoresRes, homeworkRes] = await Promise.all([
    ids.length
      ? supabase.from('attendance').select('student_id, status, date').eq('date', today).in('student_id', ids)
      : Promise.resolve({ data: [] as AttendanceRecord[], error: null }),
    ids.length
      ? supabase.from('scores').select('student_id, score_value, score_text, subject, score_period')
          .eq('score_type', 'monthly').like('score_period', `%${academicYear}`).in('student_id', ids)
      : Promise.resolve({ data: [] as Score[], error: null }),
    supabase.from('homework_assignments').select('id, due_date, status').eq('teacher_id', user.id),
  ])

  if (attendanceRes.error) logger.error(attendanceRes.error)
  if (scoresRes.error) logger.error(scoresRes.error)

  const attendance = (attendanceRes.data ?? []) as AttendanceRecord[]
  const scores = (scoresRes.data ?? []) as Score[]
  const homework = (homeworkRes.data ?? []) as HomeworkAssignment[]

  const marked = attendance.length
  const todayPresent = marked ? attendance.filter((a) => a.status === 'P').length : null
  const todayLate = attendance.filter((a) => a.status === 'L').length
  const todayAbsent = attendance.filter((a) => a.status === 'A').length

  // Late still counts as attending — the same rule the parent portal applies.
  const attendanceRate = marked
    ? Math.round((((todayPresent ?? 0) + todayLate) / marked) * 1000) / 10
    : null

  // Per student first, then across students: averaging every raw mark would let
  // a pupil with more subjects recorded weigh more than one with fewer.
  //
  // The grading context is resolved once for the whole page (above) and reused
  // for every pupil — the calculation is pure, so a class of forty costs one
  // resolution, not forty.
  const perStudent = new Map<string, Record<string, number>>()
  for (const row of scores) {
    const v = scoreNumericValue(row)
    if (v === null) continue
    const bucket = perStudent.get(row.student_id) ?? {}
    bucket[row.subject] = v
    perStudent.set(row.student_id, bucket)
  }
  const studentAverages = [...perStudent.values()]
    // Row-driven, as this tile has always been: whatever was marked counts,
    // now weighted by each subject's full mark so a secondary class averages
    // on /50 instead of being read as a /10 figure.
    .map((bucket) => studentAverage(bucket, Object.keys(bucket), grading.maxByColumn, grading.scheme).average)
    .filter((v): v is number => v !== null)
  const monthAverage = simpleAverage(studentAverages)
  const strugglingCount = studentAverages.filter((v) => v < grading.scheme.passMark).length

  const female = students.filter((s) => s.gender === 'ស្រី' || s.gender === 'Female').length
  const openHomework = homework.filter((h) => h.status !== 'closed').length

  const attention: AttentionItem[] = []
  if (students.length > 0 && marked === 0) {
    attention.push({
      id: 'no-attendance',
      severity: 'warning',
      label: 'មិនទាន់បានចុះវត្តមានសម្រាប់ថ្ងៃនេះទេ',
      href: '/attendance/layout',
    })
  }
  if (todayAbsent > 0) {
    attention.push({
      id: 'absent',
      severity: 'danger',
      label: `សិស្ស ${toKhmerNumber(todayAbsent)} នាក់អវត្តមានថ្ងៃនេះ`,
      href: '/attendance/monthly',
    })
  }
  if (strugglingCount > 0) {
    attention.push({
      id: 'struggling',
      severity: 'warning',
      label: `សិស្ស ${toKhmerNumber(strugglingCount)} នាក់មានមធ្យមភាគក្រោម ៥`,
      href: '/ranking',
    })
  }
  if (students.length === 0) {
    attention.push({
      id: 'no-students',
      severity: 'info',
      label: 'មិនទាន់មានសិស្សក្នុងបញ្ជី — បន្ថែមសិស្សដើម្បីចាប់ផ្តើម',
      href: '/enrollment',
    })
  }

  return {
    stats: {
      totalStudents: students.length,
      female,
      todayPresent,
      todayAbsent,
      todayLate,
      attendanceRate,
      monthAverage,
      scheme: grading.scheme,
      strugglingCount,
      openHomework,
      academicYear,
    },
    attention,
  }
}
