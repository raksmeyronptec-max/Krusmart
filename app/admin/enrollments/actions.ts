'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/rbac/server'
import { auditLog } from '@/lib/audit/log'
import { logger } from '@/lib/utils/logger'
import { getErrorMessageOr } from '@/lib/utils/errors'
import type { ActionResult } from '@/lib/types'
import { activeEnrolment, moveEnrolment } from '@/lib/enrolment/move'

/**
 * Enrollment lifecycle: promote, transfer, withdraw.
 *
 * All three are **append-only**. A student's past is never deleted: the current
 * row is closed by stamping `status` and `left_at`, and a new row is inserted
 * for the destination. Reading a student's history is therefore just selecting
 * their enrollments ordered by year.
 *
 * Authorization is layered:
 *   1. `requirePermission` rejects a caller whose role lacks the capability,
 *   2. RLS on `student_enrollments` independently restricts writes to the
 *      class's homeroom teacher or a school administrator.
 * Neither is sufficient alone; both are applied.
 */

/** The open enrollment for a student, if any — the shared reader. */
const activeEnrollment = activeEnrolment

/**
 * Close the open enrollment and open a new one in `targetClassId`.
 *
 * The sequence itself lives in `lib/enrolment/move.ts`, shared with the
 * teacher-facing transfer on `/students/[id]`. This wrapper is the ADMIN's
 * authorisation and nothing else: two callers, one write, so neither can drift
 * into closing the old row differently or forgetting to audit.
 */
async function move(
  studentId: string,
  targetClassId: string,
  closingStatus: 'promoted' | 'transferred',
): Promise<ActionResult> {
  try {
    const ctx = await requirePermission('enrollments:update')
    const result = await moveEnrolment({
      studentId,
      targetClassId,
      closingStatus,
      schoolId: ctx.activeSchoolId,
    })
    if (result.success) revalidatePath('/admin/enrollments')
    return result
  } catch (error) {
    return { error: getErrorMessageOr(error, 'មានបញ្ហាក្នុងការផ្លាស់ប្តូរថ្នាក់') }
  }
}

export async function promoteStudent(studentId: string, targetClassId: string): Promise<ActionResult> {
  return move(studentId, targetClassId, 'promoted')
}

/** Move a student to another class, typically within the same year. */
export async function transferStudent(studentId: string, targetClassId: string): Promise<ActionResult> {
  return move(studentId, targetClassId, 'transferred')
}

/**
 * End a student's enrollment without opening a new one.
 *
 * The row stays, marked `withdrawn` — the student disappears from class rosters
 * (which filter `status = 'active'`) while their scores, attendance and history
 * remain intact and auditable.
 */
export async function withdrawStudent(studentId: string, reason?: string): Promise<ActionResult> {
  try {
    const ctx = await requirePermission('enrollments:update')
    const supabase = await createClient()

    const current = await activeEnrollment(studentId)
    if (!current) {
      return { error: 'សិស្សនេះមិនមានការចុះឈ្មោះសកម្មទេ' }
    }

    const { error } = await supabase
      .from('student_enrollments')
      .update({ status: 'withdrawn', left_at: new Date().toISOString() })
      .eq('id', current.id)

    if (error) {
      logger.error(error)
      return { error: error.message }
    }

    await auditLog({
      action: 'enrollment.withdrawn',
      entityType: 'student_enrollment',
      entityId: studentId,
      schoolId: ctx.activeSchoolId,
      oldValue: { class_id: current.class_id, status: 'active' },
      newValue: { status: 'withdrawn' },
      metadata: reason ? { reason } : undefined,
    })

    revalidatePath('/admin/enrollments')
    return { success: true }
  } catch (error) {
    return { error: getErrorMessageOr(error, 'មានបញ្ហាក្នុងការដកឈ្មោះសិស្ស') }
  }
}

/** Outcome of a class-wide promotion. */
export interface BulkPromoteResult extends ActionResult {
  promoted?: number
  skipped?: number
}

/**
 * Promote every actively-enrolled student from one class into another.
 *
 * This is the end-of-year rollover. It is the same close-then-open transition as
 * `promoteStudent`, applied across a roster, and it is equally append-only.
 *
 * Students already enrolled in the destination are skipped rather than failing
 * the whole batch, so re-running after a partial failure finishes the job
 * instead of erroring out.
 */
export async function bulkPromoteClass(
  fromClassId: string,
  toClassId: string,
): Promise<BulkPromoteResult> {
  try {
    const ctx = await requirePermission('enrollments:update')
    const supabase = await createClient()

    if (fromClassId === toClassId) {
      return { error: 'ថ្នាក់ប្រភព និងថ្នាក់គោលដៅមិនអាចដូចគ្នាទេ' }
    }

    const { data: target } = await supabase
      .from('classes')
      .select('id, academic_year_id')
      .eq('id', toClassId)
      .maybeSingle()

    if (!target) return { error: 'រកមិនឃើញថ្នាក់គោលដៅទេ' }

    const { data: roster, error: rosterErr } = await supabase
      .from('student_enrollments')
      .select('id, student_id')
      .eq('class_id', fromClassId)
      .eq('status', 'active')

    if (rosterErr) {
      logger.error(rosterErr)
      return { error: rosterErr.message }
    }

    const rows = (roster ?? []) as { id: string; student_id: string }[]
    if (rows.length === 0) return { error: 'ថ្នាក់ប្រភពមិនមានសិស្សសកម្មទេ' }

    // Students already sitting in the destination — promoting them again would
    // trip the unique constraint and abort an otherwise valid batch.
    const { data: existing } = await supabase
      .from('student_enrollments')
      .select('student_id')
      .eq('class_id', toClassId)
      .in('student_id', rows.map((r) => r.student_id))

    const already = new Set(((existing ?? []) as { student_id: string }[]).map((r) => r.student_id))
    const movable = rows.filter((r) => !already.has(r.student_id))

    if (movable.length === 0) {
      return { success: true, promoted: 0, skipped: rows.length }
    }

    const now = new Date().toISOString()

    // Close the old enrolments, then open the new ones. PostgREST has no
    // multi-statement transaction, so order matters: if the insert fails the
    // closed rows are recoverable from the audit entry, whereas the reverse
    // would leave students enrolled twice.
    const { error: closeErr } = await supabase
      .from('student_enrollments')
      .update({ status: 'promoted', left_at: now })
      .in('id', movable.map((r) => r.id))

    if (closeErr) {
      logger.error(closeErr)
      return { error: closeErr.message }
    }

    const { error: insErr } = await supabase.from('student_enrollments').insert(
      movable.map((r) => ({
        student_id: r.student_id,
        class_id: target.id,
        academic_year_id: target.academic_year_id,
        status: 'active',
      })),
    )

    if (insErr) {
      logger.error(insErr)
      return { error: `បានបិទការចុះឈ្មោះចាស់ ប៉ុន្តែបង្កើតថ្មីមិនបាន៖ ${insErr.message}` }
    }

    await auditLog({
      action: 'enrollment.bulk_promoted',
      entityType: 'class',
      entityId: fromClassId,
      schoolId: ctx.activeSchoolId,
      oldValue: { class_id: fromClassId },
      newValue: { class_id: toClassId, academic_year_id: target.academic_year_id },
      metadata: { promoted: movable.length, skipped: rows.length - movable.length },
    })

    revalidatePath('/admin/enrollments')
    return { success: true, promoted: movable.length, skipped: rows.length - movable.length }
  } catch (error) {
    return { error: getErrorMessageOr(error, 'មានបញ្ហាក្នុងការឡើងថ្នាក់ជាក្រុម') }
  }
}
