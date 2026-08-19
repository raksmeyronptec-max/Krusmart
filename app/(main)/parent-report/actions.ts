'use server'

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'
import { resolveServerScope, rosterIdsForScope } from '@/lib/utils/serverScope'

export async function getStudentDataForYear(academicYear: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { scores: [], attendance: [] }

    // Fetch scores where the period ends with academicYear (e.g. nov-2025-2026, dec-2025-2026).
    // The column is `score_period`; filtering on `period` matched nothing and made
    // the whole report come back empty.
    // Aggregation reads the *class*, not the reader.
    //
    // `.eq('teacher_id', user.id)` is the convention on tables where that column
    // scopes ownership, and it is still what guards every score *write*. Reads
    // for aggregation are the documented exception (see the roster note in
    // `serverScope.ts`): a row's owner is the teacher who entered it, and in a
    // secondary class that is a different person for every subject. Filtering on
    // ownership here would silently drop every colleague's marks and quietly
    // divide by fewer subjects. Migration 00007's
    // `scores_select_own_or_assigned` is the real boundary, and it already
    // grants exactly this.
    const scope = await resolveServerScope(user.id)
    const rosterIds = await rosterIdsForScope(scope)

    let scoreQuery = supabase
        .from('scores')
        .select('*')
        .like('score_period', `%-${academicYear}`)
        .eq('score_type', 'monthly')

    scoreQuery = rosterIds
        ? scoreQuery.in('student_id', rosterIds)
        : scoreQuery.eq('teacher_id', user.id)

    const { data: scores, error: scoreErr } = await scoreQuery
        
    if (scoreErr) logger.error("Error fetching scores:", scoreErr)

    // Fetch attendance for the academic year
    // Attendance dates typically follow YYYY-MM-DD. We can fetch all and filter in client
    // or we can fetch attendance and filter by user_id
    const { data: attendance, error: attErr } = await supabase
        .from('attendance')
        .select('*')
        .eq('teacher_id', user.id)

    if (attErr) logger.error("Error fetching attendance:", attErr)

    return { 
        scores: scores || [], 
        attendance: attendance || [] 
    }
}
