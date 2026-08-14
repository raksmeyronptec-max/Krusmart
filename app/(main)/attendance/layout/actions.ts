'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult, AttendanceRecord } from '@/lib/types'
import { logger } from '@/lib/utils/logger'

export async function saveAttendance(studentId: string, date: string, status: string, reason: string = ''): Promise<ActionResult> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Upsert attendance record for the student on that date
    const { error } = await supabase
        .from('attendance')
        .upsert({
            student_id: studentId,
            date: date,
            status: status,
            reason: reason
        }, {
            onConflict: 'student_id, date'
        })

    if (error) {
        logger.error(error)
        return { error: error.message }
    }

    revalidatePath('/attendance/layout')
    return { success: true }
}

export async function getAttendanceForDate(date: string): Promise<AttendanceRecord[]> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // Fetch all attendance for the specific date
    // We could filter by teacher_id or class_id depending on schema. 
    // Just select all for now since RLS handles teacher filtering, or if their schema uses class_id, we just get records for this date.
    // If their schema doesn't have teacher_id in attendance table, we just get by date.
    
    // Check if teacher_id exists in attendance table? The user's schema screenshot shows attendance table fields: id, student_id, date, status, reason, created_at. No teacher_id!
    // So we just query by date. 
    const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('date', date)

    if (error) {
        logger.error(error)
        return []
    }

    return data || []
}
