'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult, Score, ScoreInput } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { resolveServerScope, rosterIdsForScope } from '@/lib/utils/serverScope'
import { auditLogBatch } from '@/lib/audit/log'
import { splitScoreCell } from '@/lib/utils/score-value'

export async function getScores(scoreType: string, scorePeriod: string): Promise<Score[]> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // 00007: an assigned teacher reads all subjects for the class, so the
    // roster — not ownership — is the boundary. Legacy accounts keep teacher_id.
    const scope = await resolveServerScope(user.id)
    const rosterIds = await rosterIdsForScope(scope)

    let query = supabase
        .from('scores')
        .select('*')
        .eq('score_type', scoreType)
        .eq('score_period', scorePeriod)

    query = rosterIds ? query.in('student_id', rosterIds) : query.eq('teacher_id', user.id)

    const { data, error } = await query

    if (error) {
        logger.error(error)
        return []
    }

    return data || []
}

/**
 * `classId` is optional: when omitted the scope resolver falls back to the
 * teacher's homeroom assignment, which is correct for every single-class
 * account. Passing it explicitly matters once a teacher holds several classes.
 */
export async function saveScores(scoreType: string, scorePeriod: string, scoresData: ScoreInput[], classId?: string): Promise<ActionResult> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // scoresData is an array of objects: { student_id, subject, score_value }
    // We'll prepare upsert payload
    // Stamp the V2 columns so new rows join the class structure. Without this a
    // score saved today would carry no class_id and be invisible to any future
    // class-scoped read.
    const scope = await resolveServerScope(user.id, classId)
    const scopeCols = scope.mode === 'v2'
        ? { class_id: scope.classId, academic_year_id: scope.academicYearId }
        : {}

    // `splitScoreCell` decides which column the cell belongs in. This used to be
    // a bare `parseFloat`, which silently destroyed every behavioural rating:
    // parseFloat('ល្អ') is NaN, JSON.stringify turns NaN into null, and the row
    // was written as NULL with a 201 and a success toast. See migration 00012.
    const upsertPayload = scoresData.map(s => ({
        ...scopeCols,
        teacher_id: user.id,
        student_id: s.student_id,
        subject: s.subject,
        score_type: scoreType,
        score_period: scorePeriod,
        ...splitScoreCell(s.score_value),
        updated_at: new Date().toISOString()
    }))

    // The conflict target must include `teacher_id` and match the
    // `scores_owner_period_uniq` index from migration 00002. Without the owner
    // in the key, two teachers assigned to the same class+subject in V2 would
    // silently overwrite each other's marks. See AUDIT.md G-2.
    const { error } = await supabase
        .from('scores')
        .upsert(upsertPayload, {
            onConflict: 'teacher_id, student_id, subject, score_type, score_period'
        })

    if (error) {
        logger.error(error)
        return { error: error.message }
    }

    // One entry per save, not per cell: a teacher saving a grid of 30 students
    // x 7 subjects is a single deliberate act, and 210 rows would bury the trail.
    await auditLogBatch('score.updated', 'score', upsertPayload.length, {
        score_type: scoreType,
        score_period: scorePeriod,
        class_id: scope.mode === 'v2' ? scope.classId : null,
    }, user.id)

    revalidatePath('/score/enter')
    return { success: true }
}
