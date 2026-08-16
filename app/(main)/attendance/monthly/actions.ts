'use server'

import { createClient } from '@/lib/supabase/server'
import type { AttendanceRecord, Settings } from '@/lib/types'
import { logger } from '@/lib/utils/logger'

export async function getMonthlyAttendance(year: number, month: number): Promise<AttendanceRecord[]> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // month is 0-indexed. So year-month-01 to the month's last day.
    //
    // `new Date(year, month + 1, 0)` is local midnight on the last day, and
    // `toISOString()` converts that to UTC — which in Phnom Penh (+07) rolls
    // back to the previous day. The 31st of every month was therefore excluded
    // from the sheet. Formatting the local parts avoids the round trip through
    // UTC entirely.
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    // Scope by teacher on top of RLS — this read was previously unscoped and
    // returned every school's attendance for the month. See AUDIT.md G-1.
    const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('teacher_id', user.id)
        .gte('date', startDate)
        .lte('date', endDate)

    if (error) {
        logger.error(error)
        return []
    }

    return data || []
}

export async function getTeacherSettings(): Promise<Settings | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('teacher_id', user.id)
        .single()
        
    if (error && error.code !== 'PGRST116') {
        logger.error(error)
    }
    
    return data || null
}
