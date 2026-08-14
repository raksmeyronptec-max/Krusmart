'use server'

import { createClient } from '@/lib/supabase/server'

export async function getMonthlyAttendance(year: number, month: number) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // month is 0-indexed. So year-month-01 to year-month-31.
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0] // last day of month

    const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)

    if (error) {
        console.error(error)
        return []
    }

    return data || []
}

export async function getTeacherSettings() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('teacher_id', user.id)
        .single()
        
    if (error && error.code !== 'PGRST116') {
        console.error(error)
    }
    
    return data || null
}
