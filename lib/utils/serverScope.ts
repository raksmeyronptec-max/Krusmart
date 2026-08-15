import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { QueryScope } from '@/lib/utils/queryFilter'
import { CLASS_PARAM } from './scopeParam'
import type { Student, TeacherAssignment } from '@/lib/types'

/**
 * Server-side counterpart to `lib/utils/queryFilter`.
 *
 * `TeacherContext` is client state, so a server component cannot read which
 * class is selected. The selection therefore travels in the URL as `?class=`,
 * which the switcher writes and this module reads — that keeps the server-
 * rendered data and the client context in agreement, and makes a class view
 * shareable and bookmarkable.
 *
 * The requested id is always validated against the caller's own assignments;
 * a forged `?class=` cannot widen access.
 */

export { CLASS_PARAM } from './scopeParam'

/**
 * Decide how to scope this request.
 *
 * Falls back to legacy `teacher_id` scoping whenever the teacher has no
 * assignments — which is every pre-V2 account — so untouched features keep
 * working exactly as before.
 */
export async function resolveServerScope(
  userId: string,
  requestedClassId?: string,
): Promise<QueryScope> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('teacher_assignments')
    .select('id, teacher_id, class_id, subject_id, academic_year_id, is_homeroom, status')
    .eq('teacher_id', userId)
    .eq('status', 'active')

  const assignments = (data ?? []) as TeacherAssignment[]
  if (assignments.length === 0) {
    return { mode: 'legacy', teacherId: userId }
  }

  // Honour the request only if the teacher actually holds that class.
  const requested = requestedClassId
    ? assignments.find((a) => a.class_id === requestedClassId)
    : undefined

  // Otherwise prefer the homeroom assignment, then the first.
  const chosen = requested ?? assignments.find((a) => a.is_homeroom) ?? assignments[0]

  return {
    mode: 'v2',
    teacherId: userId,
    classId: chosen.class_id,
    academicYearId: chosen.academic_year_id,
  }
}

/**
 * Read `?class=` out of a page's `searchParams`.
 * Next.js 16 passes `searchParams` as a promise.
 */
export async function classIdFromSearchParams(
  searchParams?: Promise<Record<string, string | string[] | undefined>>,
): Promise<string | undefined> {
  if (!searchParams) return undefined
  const params = await searchParams
  const raw = params[CLASS_PARAM]
  return Array.isArray(raw) ? raw[0] : raw
}

/**
 * The roster for a scope, in the app's established display order.
 *
 * In v2 the roster comes from `student_enrollments`, not `students.teacher_id`:
 * that indirection is the point of the migration, since a student can sit in
 * different classes across years.
 *
 * Scoping differs by mode, on purpose:
 *
 *   legacy — `teacher_id` is the only boundary there is.
 *   v2     — the *class* is the boundary. `teacher_id` is deliberately NOT
 *            applied to this read: a subject teacher legitimately sees students
 *            another teacher created, and filtering on ownership would return an
 *            empty roster (migration 00006 widens the matching RLS policy).
 *            Writes keep the `teacher_id` guard — see `actions.ts`.
 */
export async function fetchStudentsForScope(scope: QueryScope): Promise<Student[]> {
  const supabase = await createClient()

  let query = supabase.from('students').select('*')

  if (scope.mode === 'legacy') {
    query = query.eq('teacher_id', scope.teacherId)
  }

  if (scope.mode === 'v2') {
    let enrolled = supabase
      .from('student_enrollments')
      .select('student_id')
    // Not `.eq('status','active')`: once a year ends, its enrolments are stamped
    // `promoted` or `transferred`, so filtering on active would make every past
    // class render an empty roster. Anyone who sat in the class that year counts;
    // only `withdrawn` is excluded.
      .eq('class_id', scope.classId)
      .neq('status', 'withdrawn')

    if (scope.academicYearId) {
      enrolled = enrolled.eq('academic_year_id', scope.academicYearId)
    }

    const { data: rows } = await enrolled
    const ids = (rows ?? []).map((r) => r.student_id)

    // No enrolments for this class means an empty roster, not "show everything".
    if (ids.length === 0) return []

    query = query.in('id', ids)
  }

  const { data } = await query
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  return (data ?? []) as Student[]
}

/**
 * Student ids making up the scope's roster, or `null` in legacy mode meaning
 * "there is no class — filter by `teacher_id` instead".
 *
 * Score reads use this rather than `teacher_id`: under migration 00007 a teacher
 * assigned to a class may read every subject's marks for it, including those a
 * colleague entered. Filtering on ownership would hide exactly those rows.
 */
export async function rosterIdsForScope(scope: QueryScope): Promise<string[] | null> {
  if (scope.mode === 'legacy') return null

  const supabase = await createClient()

  let q = supabase
    .from('student_enrollments')
    .select('student_id')
    .eq('class_id', scope.classId)
    // See fetchStudentsForScope: past years carry promoted/transferred rows.
    .neq('status', 'withdrawn')

  if (scope.academicYearId) q = q.eq('academic_year_id', scope.academicYearId)

  const { data } = await q
  return (data ?? []).map((r) => r.student_id)
}
