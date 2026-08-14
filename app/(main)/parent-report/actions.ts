'use server'

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'

export async function getStudentDataForYear(academicYear: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { scores: [], attendance: [] }

    // Fetch scores where the period ends with academicYear (e.g. nov-2025-2026, dec-2025-2026).
    // The column is `score_period`; filtering on `period` matched nothing and made
    // the whole report come back empty.
    const { data: scores, error: scoreErr } = await supabase
        .from('scores')
        .select('*')
        .eq('teacher_id', user.id)
        .like('score_period', `%-${academicYear}`)
        .eq('score_type', 'monthly')
        
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
