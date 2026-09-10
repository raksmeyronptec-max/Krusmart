import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'
import { logger } from '@/lib/utils/logger'
import type { ActionResult, StudentEnrollment } from '@/lib/types'

/**
 * Moving a pupil from one class to another — the write, without the permission.
 *
 * ── Why this is its own module ────────────────────────────────────────────
 *
 * The close-then-open sequence lived inside `app/admin/enrollments/actions.ts`,
 * reachable only through `requirePermission('enrollments:update')` behind the
 * admin console's `isSchoolAdmin` gate. That was right while a transfer was an
 * administrator's act — but a teacher who creates their own classes (00031)
 * and enrols pupils into them had no way to correct a misplacement, and the
 * pupil's class is their *enrolment*, not a field anyone can edit.
 *
 * The obvious way to give them one is to write the sequence again next to the
 * teacher's own permission check. That is how two paths that mean the same
 * thing come to differ — one of them forgetting to close the old row, or to
 * audit, or to handle the duplicate. So the sequence lives here once and the
 * two callers differ **only** in who they let through:
 *
 *   admin console   `requirePermission('enrollments:update')`
 *   teacher app     homeroom of the class being left AND of the class being
 *                   joined — which is exactly what RLS independently requires
 *
 * This module therefore performs NO authorisation of its own, and that is
 * deliberate rather than an omission: a shared write that quietly applied one
 * caller's rule would silently widen or narrow the other. Every caller must
 * check first. RLS remains the boundary underneath both.
 *
 * ── Append-only ───────────────────────────────────────────────────────────
 *
 * A pupil's past is never deleted. The open row is CLOSED by stamping `status`
 * and `left_at` — that row *is* the history entry for the year being left — and
 * a new row is inserted for the destination. Reading a pupil's history is then
 * just selecting their enrolments in order, which is what
 * `enrolmentHistory` does and why `/students/[id]` can show it.
 */

/** The open enrolment for a pupil, if any. */
export async function activeEnrolment(studentId: string): Promise<StudentEnrollment | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('student_enrollments')
    .select('*')
    .eq('student_id', studentId)
    .eq('status', 'active')
    .order('enrolled_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as StudentEnrollment | null) ?? null
}

export interface MoveEnrolmentInput {
  studentId: string
  targetClassId: string
  /**
   * How the row being left is stamped.
   *
   * The two differ only in intent — `promoted` moves a pupil into the next
   * academic year, `transferred` moves them sideways within one — so they share
   * this implementation and are told apart by the status that is recorded.
   */
  closingStatus: 'promoted' | 'transferred'
  /** Recorded on the audit entry when the caller has one. */
  schoolId?: string | null
}

/**
 * Close the pupil's open enrolment and open one in `targetClassId`.
 *
 * **Callers must authorise first.** See the module note.
 */
export async function moveEnrolment(input: MoveEnrolmentInput): Promise<ActionResult> {
  const { studentId, targetClassId, closingStatus, schoolId = null } = input
  const supabase = await createClient()

  const current = await activeEnrolment(studentId)

  // The destination class determines the new academic year — never the caller,
  // and never the row being left: a promotion crosses years by definition.
  const { data: targetClass, error: classErr } = await supabase
    .from('classes')
    .select('id, academic_year_id, name')
    .eq('id', targetClassId)
    .maybeSingle()

  if (classErr || !targetClass) {
    return { error: 'រកមិនឃើញថ្នាក់គោលដៅទេ' }
  }

  if (current?.class_id === targetClass.id) {
    return { error: 'សិស្សនេះស្ថិតនៅក្នុងថ្នាក់នេះរួចហើយ' }
  }

  // 1. Close the existing enrolment. Kept, not deleted.
  if (current) {
    const { data: closed, error } = await supabase
      .from('student_enrollments')
      .update({ status: closingStatus, left_at: new Date().toISOString() })
      .eq('id', current.id)
      .select('id')

    if (error) {
      logger.error(error)
      return { error: error.message }
    }
    /*
     * A policy-blocked UPDATE is zero rows affected, not an error. Without this
     * the pupil would be inserted into the destination while still openly
     * enrolled in the class they were supposed to leave — enrolled twice, and
     * reported as a success.
     */
    if (!closed || closed.length === 0) {
      return { error: 'មិនមានសិទ្ធិដកសិស្សចេញពីថ្នាក់ដើមទេ' }
    }
  }

  // 2. Open the new one. `ON CONFLICT` is not available through PostgREST, so a
  //    repeated submission is caught by the unique constraint and reported
  //    rather than silently duplicating.
  const { error: insErr } = await supabase.from('student_enrollments').insert({
    student_id: studentId,
    class_id: targetClass.id,
    academic_year_id: targetClass.academic_year_id,
    status: 'active',
  })

  if (insErr) {
    // 23505 = unique_violation: the pupil is already enrolled there.
    if (insErr.code === '23505') {
      return { error: 'សិស្សនេះមានការចុះឈ្មោះក្នុងថ្នាក់នេះរួចហើយ' }
    }
    logger.error(insErr)
    return { error: insErr.message }
  }

  await auditLog({
    action: closingStatus === 'promoted' ? 'enrollment.promoted' : 'enrollment.transferred',
    entityType: 'student_enrollment',
    entityId: studentId,
    schoolId,
    oldValue: current
      ? { class_id: current.class_id, academic_year_id: current.academic_year_id }
      : null,
    newValue: { class_id: targetClass.id, academic_year_id: targetClass.academic_year_id },
  })

  return { success: true }
}
