'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult, AttendanceRecord } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { resolveServerScope } from '@/lib/utils/serverScope'
import { auditLog, auditLogBatch } from '@/lib/audit/log'

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

/**
 * Mark a whole roster in one round trip.
 *
 * "Everyone is here" is the commonest register a teacher takes, and doing it
 * seat by seat is thirty taps and thirty requests over a classroom's phone
 * signal. One upsert of thirty rows is one request, and — more importantly —
 * it either all lands or none of it does, so the register cannot end up half
 * written when the connection drops midway.
 *
 * Existing marks are overwritten, which is the point: this is the button a
 * teacher presses to set a baseline before correcting the two pupils who are
 * away. `reason` is cleared for the same reason a status change clears it —
 * a note about an absence is meaningless against a present mark.
 */
export async function saveAttendanceBulk(
    studentIds: string[],
    date: string,
    status: string,
    classId?: string,
): Promise<ActionResult> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }
    if (studentIds.length === 0) return { success: true }

    const scope = await resolveServerScope(user.id, classId)
    const scopeCols = scope.mode === 'v2'
        ? { class_id: scope.classId, academic_year_id: scope.academicYearId }
        : {}

    const { error } = await supabase
        .from('attendance')
        .upsert(
            studentIds.map((studentId) => ({
                ...scopeCols,
                teacher_id: user.id,
                student_id: studentId,
                date,
                status,
                reason: '',
            })),
            { onConflict: 'student_id, date' },
        )

    if (error) {
        logger.error(error)
        return { error: error.message }
    }

    // One entry for the batch, not one per pupil: a principal tracing a change
    // wants to see "the register was set for 2026-08-16", not thirty rows.
    await auditLogBatch('attendance.updated', 'attendance', studentIds.length, {
        date, status, class_id: scope.mode === 'v2' ? scope.classId : null,
    }, user.id)

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
