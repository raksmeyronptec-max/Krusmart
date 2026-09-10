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
import { tallyAttendance, type AttendanceTally } from '@/lib/attendance/status'

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

/**
 * Attendance tallies for the summary cards.
 *
 * ── What this used to say, and why it was wrong ───────────────────────────
 *
 * It counted `L` as **មកយឺត** — arrived late — and added it to the numerator:
 * `(present + late) / total`, under a comment explaining that the legacy portal
 * treated lateness as attending.
 *
 * `L` is not lateness. The only screen that writes it labels its own button
 * ច្បាប់ — absent WITH the school's permission — and the monthly register
 * prints it as "ច", the yearly sheet gives it a ច្ប column of its own, and the
 * printed parent report counts it under អវត្តមាន. So a pupil their teacher
 * recorded as away with permission was shown to their own parent as present and
 * on time, and lifted that child's attendance rate while doing it: the sheet
 * the teacher hands over and the portal the parent signs into stated different
 * numbers for the same days.
 *
 * The rule now comes from `lib/attendance/status.ts`, which the register, the
 * reports and this portal all read. The rate reads LOWER than it did for any
 * child with a ច្បាប់ day — that is the correction, not a regression.
 */
export interface AttendanceSummary extends AttendanceTally {
  /** Every row fetched, including any this application does not recognise. */
  total: number
}

export function summariseAttendance(records: AttendanceRecord[]): AttendanceSummary {
  return { ...tallyAttendance(records), total: records.length }
}
