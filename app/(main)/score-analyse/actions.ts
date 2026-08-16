'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult, CognitiveAssessment } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { resolveServerScope, rosterIdsForScope } from '@/lib/utils/serverScope'
import { auditLog } from '@/lib/audit/log'

/** The four sliders, as submitted by the form. */
export interface CognitiveInput {
    knowing: number
    applying: number
    analyzing: number
    evaluating: number
}

/** Clamp to the column's CHECK range so a bad client cannot trigger a 23514. */
function clamp(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.min(100, Math.max(0, Math.round(value)))
}

/**
 * Every cognitive assessment in scope, keyed by student id.
 *
 * Scoped by `teacher_id` on top of RLS, matching the convention — and unlike
 * score reads, ownership *is* the right boundary here: this is one teacher's own
 * judgement of a pupil, not a shared mark, and two teachers on the same class
 * each keep their own row (see the UNIQUE in migration 00015).
 */
export async function getCognitiveAssessments(classId?: string): Promise<Record<string, CognitiveAssessment>> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return {}

    const scope = await resolveServerScope(user.id, classId)
    const rosterIds = await rosterIdsForScope(scope)

    let query = supabase
        .from('cognitive_assessments')
        .select('*')
        .eq('teacher_id', user.id)

    // In V2 the roster narrows the read to the class on screen; a legacy account
    // has no roster ids, and `teacher_id` alone is already the whole boundary.
    if (rosterIds) {
        if (rosterIds.length === 0) return {}
        query = query.in('student_id', rosterIds)
    }

    const { data, error } = await query

    if (error) {
        logger.error('Failed to load cognitive assessments:', error)
        return {}
    }

    return Object.fromEntries(
        ((data ?? []) as CognitiveAssessment[]).map((row) => [row.student_id, row]),
    )
}

/**
 * Save one pupil's ratings.
 *
 * Upserts on `(teacher_id, student_id)` — the table's unique key — so repeated
 * saves update in place rather than accumulating a row per adjustment.
 */
export async function saveCognitiveAssessment(
    studentId: string,
    input: CognitiveInput,
    classId?: string,
): Promise<ActionResult> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const scope = await resolveServerScope(user.id, classId)

    const { error } = await supabase
        .from('cognitive_assessments')
        .upsert({
            teacher_id: user.id,
            student_id: studentId,
            class_id: scope.mode === 'v2' ? scope.classId : null,
            academic_year_id: scope.mode === 'v2' ? scope.academicYearId : null,
            knowing: clamp(input.knowing),
            applying: clamp(input.applying),
            analyzing: clamp(input.analyzing),
            evaluating: clamp(input.evaluating),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'teacher_id, student_id' })

    if (error) {
        logger.error(error)
        return { error: error.message }
    }

    await auditLog({
        action: 'cognitive.updated',
        entityType: 'cognitive_assessments',
        entityId: studentId,
        actorId: user.id,
        newValue: { ...input },
        metadata: scope.mode === 'v2' ? { class_id: scope.classId } : undefined,
    })

    revalidatePath('/score-analyse')
    return { success: true }
}
