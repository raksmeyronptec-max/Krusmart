'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/utils/logger'
import { resolveServerScope } from '@/lib/utils/serverScope'
import type { ActionResult } from '@/lib/types'
import { auditLog, auditLogBatch } from '@/lib/audit/log'

export async function deleteStudent(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Scoping by id + teacher_id is already exact; the class adds nothing here.
  const { error } = await supabase
    .from('students')
    .delete()
    .eq('id', id)
    .eq('teacher_id', user.id)

  if (error) {
    logger.error(error)
    return { error: error.message }
  }

  await auditLog({
    action: 'student.deleted', entityType: 'student', entityId: id, actorId: user.id,
  })

  revalidatePath('/student-list')
  return { success: true }
}

/**
 * Delete every student **in the active class**.
 *
 * The class scope is not cosmetic. Before V2 a teacher had exactly one class, so
 * "delete all" and "delete this class" were the same statement. Now that a
 * teacher can hold several, an unscoped `.eq('teacher_id', …)` would wipe their
 * other classes' rosters from a button labelled for this one.
 *
 * `classId` comes from the client's active assignment and is validated against
 * the caller's own assignments inside `resolveServerScope`.
 */
export async function deleteAllStudents(classId?: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Unauthorized' }
  }

  const scope = await resolveServerScope(user.id, classId)

  let deletedCount = 0

  if (scope.mode === 'legacy') {
    // One teacher, one class: unchanged behaviour.
    const { data: removed, error } = await supabase
      .from('students').delete().eq('teacher_id', user.id).select('id')
    if (error) {
      logger.error(error)
      return { error: error.message }
    }
    deletedCount = removed?.length ?? 0
  } else {
    let enrolled = supabase
      .from('student_enrollments')
      .select('student_id')
      .eq('class_id', scope.classId)
      // Only currently-enrolled students; a withdrawn or promoted-out record
      // must not be swept up by "delete all" for this class.
      .eq('status', 'active')

    if (scope.academicYearId) {
      enrolled = enrolled.eq('academic_year_id', scope.academicYearId)
    }

    const { data: rows, error: enrolErr } = await enrolled
    if (enrolErr) {
      logger.error(enrolErr)
      return { error: enrolErr.message }
    }

    const ids = (rows ?? []).map((r) => r.student_id)
    if (ids.length === 0) return { success: true }

    // The delete keeps the owner guard: a subject teacher may read another
    // teacher's students but must not be able to remove them. Rows they do not
    // own simply are not deleted.
    const { data: removed, error } = await supabase
      .from('students')
      .delete()
      .in('id', ids)
      .eq('teacher_id', user.id)
      .select('id')

    if (error) {
      logger.error(error)
      return { error: error.message }
    }
    deletedCount = removed?.length ?? 0
  }

  await auditLogBatch('student.deleted', 'student', deletedCount, {
    scope: scope.mode, class_id: scope.mode === 'v2' ? scope.classId : null,
  }, user.id)

  revalidatePath('/student-list')
  return { success: true }
}

/**
 * Repair a roster stranded by the onboarding gap 00018 closes.
 *
 * A teacher who onboarded before the backfill existed holds a homeroom
 * assignment (so every read is v2-scoped) but zero enrolments — their students
 * still exist under `students.teacher_id` yet appear nowhere. This re-runs the
 * same `backfill_teacher_enrolments` RPC onboarding now calls, on the
 * teacher's explicit request from the banner on /student-list. Idempotent, so
 * a double-tap cannot double-enrol.
 */
export async function recoverLegacyRoster(
  classId?: string,
): Promise<ActionResult & { enrolled?: number }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Unauthorized' }
  }

  const scope = await resolveServerScope(user.id, classId)
  if (scope.mode === 'legacy') {
    // No assignment ⇒ the legacy path is already reading students.teacher_id;
    // there is nothing to recover into.
    return { success: true, enrolled: 0 }
  }

  const { data, error } = await supabase.rpc('backfill_teacher_enrolments', {
    p_class_id: scope.classId,
  })

  if (error) {
    logger.error(error)
    return { error: 'មិនអាចនាំសិស្សចូលថ្នាក់វិញបានទេ។ សូមព្យាយាមម្តងទៀត។' }
  }

  const enrolled = Number(data ?? 0)
  await auditLogBatch('enrollment.backfilled', 'student_enrollment', enrolled, {
    class_id: scope.classId, trigger: 'recovery',
  }, user.id)

  revalidatePath('/student-list')
  return { success: true, enrolled }
}

export async function saveStudentsOrder(orderedIds: string[]): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Ids come from the rendered roster, which is already class-scoped; the
  // teacher_id guard stops any id outside the caller's own rows being written.
  const promises = orderedIds.map((id, index) =>
    supabase.from('students').update({ order_index: index + 1 }).eq('id', id).eq('teacher_id', user.id)
  )

  const results = await Promise.all(promises)
  const hasError = results.some(r => r.error)

  if (hasError) {
    logger.error('Error saving order:', results.find(r => r.error)?.error)
    return { error: 'បរាជ័យក្នុងការរក្សាទុកលំដាប់ សូមប្រាកដថាអ្នកបានបង្កើត column "order_index" (int8) នៅក្នុង Table students នៃ Supabase!' }
  }

  await auditLogBatch('student.reordered', 'student', orderedIds.length, undefined, user.id)

  revalidatePath('/student-list')
  return { success: true }
}
