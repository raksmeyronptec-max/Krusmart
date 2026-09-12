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
 * the destination row is opened. Reading a pupil's history is then just
 * selecting their enrolments in order, which is what `enrolmentHistory` does and
 * why `/students/[id]` can show it.
 *
 * "Opened" is not always "inserted": `UNIQUE (student_id, class_id,
 * academic_year_id)` ignores `status`, so a pupil returning to a class they
 * already left this year has no second row available and the existing one is
 * revived instead. The full reasoning, and the one thing that costs, is at the
 * lookup in `moveEnrolment`.
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

  /*
   * Has this pupil been in the destination class before, THIS year?
   *
   * `UNIQUE (student_id, class_id, academic_year_id)` (00003) does not look at
   * `status`, so a closed row occupies the destination just as firmly as an
   * open one. A teacher who moves a pupil ៤ក → ៤ខ and then moves them back is
   * therefore inserting a row that already exists, and the insert is refused —
   * AFTER step 1 has already closed ៤ខ. Measured:
   *
   *     close ៤ខ : OK (1 row)
   *     open  ៤ក : 23505
   *     >>> the pupil now has 0 ACTIVE enrolment(s)
   *
   * which is the same orphaned pupil 00036 exists to prevent, reached by a
   * different road and available to every teacher including the pupil's
   * creator. So the destination is REVIVED when it is already there, and only
   * inserted when it is genuinely new.
   *
   * Reviving costs one thing and it is recorded here rather than discovered
   * later: the earlier stint's `left_at` is cleared, so a pupil who leaves a
   * class and returns within one academic year reads as having never left it.
   * Keeping both stints needs a second row, which that UNIQUE forbids — a
   * schema change, not a bug fix, and out of scope here.
   */
  const { data: priorAtTarget } = await supabase
    .from('student_enrollments')
    .select('id, status')
    .eq('student_id', studentId)
    .eq('class_id', targetClass.id)
    .eq('academic_year_id', targetClass.academic_year_id)
    .maybeSingle()

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

  /**
   * Put the pupil back where they were.
   *
   * Step 1 and step 2 are two PostgREST calls and therefore two committed
   * transactions — there is no `BEGIN` spanning them. Every early return below
   * step 1 must therefore undo it, or the pupil is left closed out of the class
   * they came from and enrolled in nothing: off every roster in the product,
   * and off it silently, because a roster read simply stops matching them.
   *
   * The reopen is authorised by the branch 00036 added — form master of a class
   * the pupil holds a row in, whatever its status — which is exactly the row
   * being reopened.
   */
  const restoreSource = async () => {
    if (!current) return
    const { error } = await supabase
      .from('student_enrollments')
      .update({ status: 'active', left_at: null })
      .eq('id', current.id)
    if (error) logger.error('moveEnrolment: could not restore the source enrolment', error)
  }

  // 2. Open the destination — revived if the pupil has been there this year,
  //    inserted if not.
  if (priorAtTarget) {
    const { data: revived, error: revErr } = await supabase
      .from('student_enrollments')
      .update({ status: 'active', left_at: null })
      .eq('id', priorAtTarget.id)
      .select('id')

    if (revErr) {
      logger.error(revErr)
      await restoreSource()
      return { error: revErr.message }
    }
    // Zero rows is a policy refusal, exactly as in step 1.
    if (!revived || revived.length === 0) {
      await restoreSource()
      return { error: 'មិនមានសិទ្ធិបញ្ចូលសិស្សទៅថ្នាក់នេះទេ' }
    }
  } else {
    const { error: insErr } = await supabase.from('student_enrollments').insert({
      student_id: studentId,
      class_id: targetClass.id,
      academic_year_id: targetClass.academic_year_id,
      status: 'active',
    })

    if (insErr) {
      await restoreSource()
      // 23505 = unique_violation. The read above means this is now a race —
      // a concurrent write put the pupil there between the two calls — rather
      // than the ordinary return-transfer it used to be.
      if (insErr.code === '23505') {
        return { error: 'សិស្សនេះមានការចុះឈ្មោះក្នុងថ្នាក់នេះរួចហើយ' }
      }
      logger.error(insErr)
      return { error: insErr.message }
    }
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
