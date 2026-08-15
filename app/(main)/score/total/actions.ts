'use server'

import { createClient } from '@/lib/supabase/server'
import type { Score } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { resolveServerScope, rosterIdsForScope } from '@/lib/utils/serverScope'

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
