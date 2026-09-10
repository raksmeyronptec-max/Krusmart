'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { activeEnrolment, moveEnrolment } from '@/lib/enrolment/move'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/lib/types'

/**
 * Moving a pupil between the teacher's OWN classes.
 *
 * ── The hole this fills ───────────────────────────────────────────────────
 *
 * 00031 lets a teacher of a school create a class and staff themselves onto it,
 * and `/enrollment` lets them enrol pupils into it. Nothing let them undo a
 * misplacement. A pupil's class is their *enrolment* — not `students.grade`,
 * which is free text and stale the moment anyone is promoted — so the only
 * remedy was to delete the pupil and enter them again, destroying every score
 * and attendance row attached to their id.
 *
 * The lifecycle actions existed the whole time, in `app/admin/enrollments/` —
 * behind `requirePermission('enrollments:update')` and the console's
 * `isSchoolAdmin` gate. A teacher who *joined* a school holds exactly `teacher`
 * (00022: "approval never grants admin"), so for them the console is not a
 * longer route to the feature; it is a closed door.
 *
 * ── Why no migration was needed ───────────────────────────────────────────
 *
 * `student_enrollments_write_assigned_or_admin` (00003) already grants FOR ALL
 * to the **homeroom** teacher of the row's class, alongside the administrator
 * branch. The database has permitted this operation since V2 was built; only
 * the application withheld it. So this action asserts exactly what RLS asserts,
 * rather than widening anything.
 *
 * ── The authorisation, and why it is checked here as well ─────────────────
 *
 *   leaving   homeroom of the pupil's current class — the same predicate the
 *             UPDATE is subject to.
 *   joining   homeroom of the destination — the same predicate the INSERT is
 *             subject to.
 *   no open enrolment   a legacy pupil belongs to whoever owns their row, so
 *             ownership stands in for the class that does not exist. Without
 *             this branch, "transfer a pupil with no enrolment into my class"
 *             would be a way to acquire one.
 *
 * RLS would refuse a violation anyway — but it refuses an UPDATE by returning
 * zero rows, not an error, and the failure a teacher deserves is a sentence in
 * Khmer rather than a success toast over an unchanged pupil.
 */

/** A class the teacher may move a pupil into: one they are form master of. */
export interface TransferTarget {
  classId: string
  className: string
  academicYearName: string
}

/** Is the caller the form master of this class? */
async function isHomeroomOf(userId: string, classId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('teacher_assignments')
    .select('id')
    .eq('teacher_id', userId)
    .eq('class_id', classId)
    .eq('status', 'active')
    .eq('is_homeroom', true)
    .limit(1)

  if (error) {
    // Fails CLOSED, unlike `resolveClassTeachingRole`. That one narrows what a
    // teacher may enter and must not lock them out of marking on a hiccup; this
    // one moves a child between classes, where the safe default is to refuse.
    logger.error('isHomeroomOf:', error)
    return false
  }
  return (data ?? []).length > 0
}

/**
 * The classes this teacher could move a pupil into.
 *
 * Homeroom rows only — a subject teacher holds no authority over a roster —
 * and the pupil's current class is dropped, because "move them to where they
 * already are" is not an option a picker should offer.
 */
export async function listTransferTargets(studentId: string): Promise<TransferTarget[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const current = await activeEnrolment(studentId)

  const { data, error } = await supabase
    .from('teacher_assignments')
    .select('class_id, classes(name), academic_years(name)')
    .eq('teacher_id', user.id)
    .eq('status', 'active')
    .eq('is_homeroom', true)

  if (error) {
    logger.error('listTransferTargets:', error)
    return []
  }

  /** PostgREST returns an embedded to-one relation as an object or a 1-element array. */
  const one = <T,>(rel: T | T[] | null | undefined): T | undefined =>
    Array.isArray(rel) ? rel[0] : (rel ?? undefined)

  const seen = new Set<string>()
  const targets: TransferTarget[] = []

  for (const row of data ?? []) {
    const classId = row.class_id as string
    if (!classId || classId === current?.class_id || seen.has(classId)) continue
    seen.add(classId)
    targets.push({
      classId,
      className: one(row.classes as { name?: string } | { name?: string }[])?.name ?? '',
      academicYearName:
        one(row.academic_years as { name?: string } | { name?: string }[])?.name ?? '',
    })
  }

  return targets.sort(
    (a, b) =>
      b.academicYearName.localeCompare(a.academicYearName) ||
      a.className.localeCompare(b.className, 'km'),
  )
}

/**
 * Move a pupil into one of the caller's own classes.
 *
 * Always `transferred`, never `promoted`: promotion is a year-end decision made
 * across a whole class from `/yearly-report`'s lists, and stamping one pupil's
 * history with it because a teacher fixed a typo would put a claim in the
 * record that nobody made.
 */
export async function transferStudentToMyClass(
  studentId: string,
  targetClassId: string,
): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'មិនមានសិទ្ធិ (Unauthorized)' }

  if (!(await isHomeroomOf(user.id, targetClassId))) {
    return { error: 'អ្នកអាចផ្ទេរសិស្សបានតែទៅថ្នាក់ដែលអ្នកជាគ្រូបន្ទុកថ្នាក់ប៉ុណ្ណោះ' }
  }

  const current = await activeEnrolment(studentId)

  if (current) {
    if (!(await isHomeroomOf(user.id, current.class_id))) {
      return { error: 'អ្នកមិនមែនជាគ្រូបន្ទុកថ្នាក់ដើមរបស់សិស្សនេះទេ' }
    }
  } else {
    // No open enrolment: a legacy pupil, who belongs to whoever owns their row.
    const { data: owned, error } = await supabase
      .from('students')
      .select('id')
      .eq('id', studentId)
      .eq('teacher_id', user.id)
      .maybeSingle()

    if (error) {
      logger.error('transferStudentToMyClass:', error)
      return { error: 'មានបញ្ហាក្នុងការពិនិត្យសិស្ស' }
    }
    if (!owned) return { error: 'អ្នកមិនមានសិទ្ធិផ្ទេរសិស្សនេះទេ' }
  }

  const result = await moveEnrolment({
    studentId,
    targetClassId,
    closingStatus: 'transferred',
  })

  if (result.success) {
    revalidatePath(`/students/${studentId}`)
    revalidatePath('/student-list')
  }
  return result
}
