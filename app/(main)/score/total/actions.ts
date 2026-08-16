'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult, Score } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { getErrorMessage } from '@/lib/utils/errors'
import { resolveServerScope, rosterIdsForScope } from '@/lib/utils/serverScope'
import { requirePermission } from '@/lib/rbac/server'
import { auditLogBatch } from '@/lib/audit/log'

export async function getAllScoresByPeriod(scoreType: string, scorePeriod: string): Promise<Score[]> {
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

export async function getAnnualAverages(academicYear: string): Promise<Score[]> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // 00007: an assigned teacher reads all subjects for the class, so the
    // roster — not ownership — is the boundary. Legacy accounts keep teacher_id.
    const scope = await resolveServerScope(user.id)
    const rosterIds = await rosterIdsForScope(scope)

    // Fetch sem1 and sem2 averages from scores table (which might be stored specially, but the old code calculated it on the fly by getting all semester data)
    // Actually, old code calculated annual by fetching 'annual' from Firebase which stored sem1_avg and sem2_avg.
    // So if users save it, they save it as score_type='annual', score_period='annual-2025-2026'
    
    let query = supabase
        .from('scores')
        .select('*')
        .eq('score_type', 'annual')
        .eq('score_period', `annual-${academicYear}`)

    query = rosterIds ? query.in('student_id', rosterIds) : query.eq('teacher_id', user.id)

    const { data, error } = await query

    if (error) return []
    return data || []
}

/**
 * Every monthly mark for one academic year, in a single round trip.
 *
 * The subject-trend chart needs twelve months at once. Calling
 * `getAllScoresByPeriod` in a loop would be twelve sequential requests over a
 * classroom connection, so this matches on the period suffix instead.
 *
 * Monthly periods are `${month}-${academicYear}` — e.g. `jan-2025-2026` — so
 * the suffix is unambiguous. Homework periods use an underscore
 * (`2025-2026_jan`) and a different `score_type`, so they cannot collide.
 */
export async function getMonthlyScoresForYear(academicYear: string): Promise<Score[]> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const scope = await resolveServerScope(user.id)
    const rosterIds = await rosterIdsForScope(scope)

    let query = supabase
        .from('scores')
        .select('*')
        .eq('score_type', 'monthly')
        .like('score_period', `%-${academicYear}`)

    query = rosterIds ? query.in('student_id', rosterIds) : query.eq('teacher_id', user.id)

    const { data, error } = await query

    if (error) {
        logger.error(error)
        return []
    }

    return data || []
}

/**
 * Remove one period's marks for a set of pupils.
 *
 * Deliberately narrow: a `score_type` + `score_period` + explicit pupil list,
 * never "everything on screen". A teacher reaches for this after entering a
 * month against the wrong subject, and the blast radius should be the mistake,
 * not the term.
 *
 * `teacher_id` is filtered as well as the period even though RLS enforces it —
 * the same second-guard convention every other delete in this app follows. It
 * also means a teacher can only ever clear *their own* marks for a shared
 * class, which is exactly what the composite unique key implies.
 */
export async function clearScoresForStudents(
    scoreType: string,
    scorePeriod: string,
    studentIds: string[],
): Promise<ActionResult> {
    if (studentIds.length === 0) return { error: 'មិនទាន់បានជ្រើសរើសសិស្សទេ' }

    try {
        await requirePermission('scores:delete')
    } catch (e) {
        return { error: getErrorMessage(e) }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase
        .from('scores')
        .delete()
        .eq('teacher_id', user.id)
        .eq('score_type', scoreType)
        .eq('score_period', scorePeriod)
        .in('student_id', studentIds)

    if (error) {
        logger.error(error)
        return { error: error.message }
    }

    await auditLogBatch('score.deleted', 'score', studentIds.length, {
        score_type: scoreType,
        score_period: scorePeriod,
    }, user.id)

    revalidatePath('/score/total')
    return { success: true }
}
