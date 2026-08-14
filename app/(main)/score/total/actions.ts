'use server'

import { createClient } from '@/lib/supabase/server'

export async function getAllScoresByPeriod(scoreType: string, scorePeriod: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
        .from('scores')
        .select('*')
        .eq('score_type', scoreType)
        .eq('score_period', scorePeriod)

    if (error) {
        console.error(error)
        return []
    }

    return data || []
}

export async function getAnnualAverages(academicYear: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // Fetch sem1 and sem2 averages from scores table (which might be stored specially, but the old code calculated it on the fly by getting all semester data)
    // Actually, old code calculated annual by fetching 'annual' from Firebase which stored sem1_avg and sem2_avg.
    // So if users save it, they save it as score_type='annual', score_period='annual-2025-2026'
    
    const { data, error } = await supabase
        .from('scores')
        .select('*')
        .eq('score_type', 'annual')
        .eq('score_period', `annual-${academicYear}`)

    if (error) return []
    return data || []
}
