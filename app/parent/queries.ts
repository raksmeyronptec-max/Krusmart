import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type {
  AttendanceRecord,
  HomeworkAssignment,
  Notification,
  Score,
  Settings,
  Student,
} from '@/lib/types'

/**
 * Reads for the parent portal.
 *
 * Every query here is scoped by RLS (migration 00010): a parent sees only the
 * children listed in `parent_students`, and has no write policy anywhere. These
 * helpers add no filtering of their own beyond picking the active child — the
 * database is the boundary, not this module.
 */

/** A child, plus the relationship recorded on the link row. */
export interface ChildSummary {
  student: Student
  relationship: string | null
  isPrimary: boolean
}

/** Every child linked to the signed-in parent. */
export async function getMyChildren(): Promise<ChildSummary[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('parent_students')
    .select('relationship, is_primary, students(*)')
    .order('is_primary', { ascending: false })

  return ((data ?? []) as unknown as {
    relationship: string | null
    is_primary: boolean
    students: Student | Student[] | null
  }[])
    .map((row) => {
      const student = Array.isArray(row.students) ? row.students[0] : row.students
      return student
        ? { student, relationship: row.relationship, isPrimary: row.is_primary }
        : null
    })
    .filter((c): c is ChildSummary => c !== null)
}

/**
 * The child a portal page should display.
 *
 * `?child=` selects among siblings; anything unrecognised falls back to the
 * first, so a stale or forged id shows the parent's own child rather than an
 * error. RLS means an id belonging to another family simply is not in the list.
 */
export async function resolveActiveChild(
  requestedId?: string,
): Promise<{ child: ChildSummary | null; children: ChildSummary[] }> {
  const children = await getMyChildren()
  const child =
    (requestedId ? children.find((c) => c.student.id === requestedId) : undefined) ??
    children[0] ??
    null
  return { child, children }
}

/** Read `?child=` out of a page's searchParams. */
export async function childIdFromSearchParams(
  searchParams?: Promise<Record<string, string | string[] | undefined>>,
): Promise<string | undefined> {
  if (!searchParams) return undefined
  const params = await searchParams
  const raw = params.child
  return Array.isArray(raw) ? raw[0] : raw
}

/** The teacher's `settings` row, for the school name shown in the header. */
export async function getSchoolSettings(teacherId: string): Promise<Settings | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('settings')
    .select('*')
    .eq('teacher_id', teacherId)
    .maybeSingle()
  return data ?? null
}

export async function getChildAttendance(studentId: string): Promise<AttendanceRecord[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('attendance')
    .select('*')
    .eq('student_id', studentId)
    .order('date', { ascending: false })
  return (data ?? []) as AttendanceRecord[]
}

export async function getChildScores(studentId: string): Promise<Score[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('scores')
    .select('*')
    .eq('student_id', studentId)
    .order('score_period', { ascending: false })
  return (data ?? []) as Score[]
}

/**
 * Homework set by the child's teacher.
 *
 * `homework_assignments` is keyed on `teacher_id`, not on the student, so RLS
 * matches via `is_teacher_of_my_child`. Nothing further is filtered here.
 */
export async function getChildHomework(): Promise<HomeworkAssignment[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('homework_assignments')
    .select('*')
    .order('due_date', { ascending: false })
    .limit(50)
  return (data ?? []) as HomeworkAssignment[]
}

export async function getChildNotifications(): Promise<Notification[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30)
  return (data ?? []) as Notification[]
}

/** Attendance tallies for the summary cards. */
export interface AttendanceSummary {
  present: number
  absent: number
  late: number
  permission: number
  total: number
  /** Percentage present, or null when nothing has been recorded. */
  rate: number | null
}

export function summariseAttendance(records: AttendanceRecord[]): AttendanceSummary {
  const count = (s: string) => records.filter((r) => r.status === s).length
  const present = count('P')
  const late = count('L')
  const absent = count('A')
  const permission = count('AP')
  const total = records.length
  return {
    present,
    absent,
    late,
    permission,
    total,
    // Late still counts as attending — the legacy portal treated it that way.
    rate: total ? Math.round(((present + late) / total) * 1000) / 10 : null,
  }
}
