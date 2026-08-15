'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult, AttendanceRecord } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { resolveServerScope } from '@/lib/utils/serverScope'
import { auditLog } from '@/lib/audit/log'

export async function saveAttendance(studentId: string, date: string, status: string, reason: string = '', classId?: string): Promise<ActionResult> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Stamp the V2 columns so new marks join the class structure.
    const scope = await resolveServerScope(user.id, classId)
    const scopeCols = scope.mode === 'v2'
        ? { class_id: scope.classId, academic_year_id: scope.academicYearId }
        : {}

    // Upsert attendance record for the student on that date.
    // `teacher_id` is required: without it the row is created unowned, the RLS
    // policy (auth.uid() = teacher_id) hides it forever, and the Phase 2
    // backfill cannot map it to a class. See AUDIT.md G-1.
    const { error } = await supabase
        .from('attendance')
        .upsert({
            ...scopeCols,
            teacher_id: user.id,
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

    // Attendance is a per-tap upsert, so this logs one entry per mark. That is
    // the correct granularity here: an attendance change is exactly the kind of
    // single-record edit a principal may later need to trace.
    await auditLog({
        action: 'attendance.updated', entityType: 'attendance', entityId: studentId,
        actorId: user.id,
        newValue: { date, status, reason: reason || null },
        metadata: scope.mode === 'v2' ? { class_id: scope.classId } : undefined,
    })

    revalidatePath('/attendance/layout')
    return { success: true }
}

export async function getAttendanceForDate(date: string): Promise<AttendanceRecord[]> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // Scope by teacher on top of RLS, matching the convention everywhere else.
    // The earlier comment here claimed the live table had no `teacher_id`; it
    // does — parent-report/actions.ts has always filtered on it. See AUDIT.md G-1.
    const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('teacher_id', user.id)
        .eq('date', date)

    if (error) {
        logger.error(error)
        return []
    }

    return data || []
}
