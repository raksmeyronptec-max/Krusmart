'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult, AttendanceRecord } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { resolveServerScope } from '@/lib/utils/serverScope'
import type { QueryScope } from '@/lib/utils/queryFilter'
import { auditLog, auditLogBatch } from '@/lib/audit/log'

/** Shown whenever a write is refused because the day is closed. */
const LOCKED_MESSAGE = 'ថ្ងៃនេះត្រូវបានចាក់សោ។ សូមដោះសោជាមុនសិន ដើម្បីកែប្រែវត្តមាន។'

/**
 * Is this day closed to edits?
 *
 * Checked server-side on every write rather than only in the UI: the client can
 * be stale — another teacher on the same class may have locked the day since
 * the page loaded — and a register that silently accepts an edit it was not
 * allowed to make is worse than one that refuses.
 *
 * The two scopes are queried separately because a legacy row has a NULL
 * `class_id`, and `.eq('class_id', null)` is not how PostgREST expresses IS NULL.
 */
async function isDateLocked(
    supabase: Awaited<ReturnType<typeof createClient>>,
    scope: QueryScope,
    date: string,
): Promise<boolean> {
    let query = supabase.from('attendance_locks').select('id').eq('date', date)

    query = scope.mode === 'v2'
        ? query.eq('class_id', scope.classId)
        : query.is('class_id', null).eq('teacher_id', scope.teacherId)

    const { data, error } = await query.limit(1)
    if (error) {
        logger.error('Failed to check attendance lock:', error)
        // Fail open. A lock is an administrative convenience; a transient error
        // reading it must not make the register unwritable for the whole class.
        return false
    }
    return (data?.length ?? 0) > 0
}

export async function saveAttendance(studentId: string, date: string, status: string, reason: string = '', classId?: string): Promise<ActionResult> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Stamp the V2 columns so new marks join the class structure.
    const scope = await resolveServerScope(user.id, classId)

    if (await isDateLocked(supabase, scope, date)) return { error: LOCKED_MESSAGE }

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

    if (await isDateLocked(supabase, scope, date)) return { error: LOCKED_MESSAGE }

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

/**
 * Which of the given dates are closed.
 *
 * Returns a plain array rather than a Set because this crosses the server/client
 * boundary, and a Set does not survive serialisation.
 */
export async function getLockedDates(dates: string[], classId?: string): Promise<string[]> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user || dates.length === 0) return []

    const scope = await resolveServerScope(user.id, classId)

    let query = supabase.from('attendance_locks').select('date').in('date', dates)

    query = scope.mode === 'v2'
        ? query.eq('class_id', scope.classId)
        : query.is('class_id', null).eq('teacher_id', scope.teacherId)

    const { data, error } = await query
    if (error) {
        logger.error('Failed to load attendance locks:', error)
        return []
    }

    return (data ?? []).map((r) => r.date as string)
}

/**
 * Close a day, or reopen it.
 *
 * Locking is a DELETE/INSERT pair rather than a boolean column — the table has
 * no editable state, so an absent row *is* "unlocked". That also means the
 * unique index does the deduplication for us and two teachers racing to lock
 * the same day cannot create two rows.
 */
export async function setDateLock(date: string, locked: boolean, classId?: string): Promise<ActionResult> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const scope = await resolveServerScope(user.id, classId)

    if (locked) {
        // `teacher_id` is set only on the legacy path. Stamping it in V2 as well
        // would make the row match both the class predicate and the legacy one,
        // so a teacher would see a duplicate lock after switching class.
        // Annotated rather than inferred: without it TypeScript narrows the
        // first branch to `class_id: string` and rejects the legacy branch's null.
        const row: {
            class_id: string | null
            teacher_id: string | null
            date: string
            locked_by: string
        } = scope.mode === 'v2'
            ? { class_id: scope.classId, teacher_id: null, date, locked_by: user.id }
            : { class_id: null, teacher_id: scope.teacherId, date, locked_by: user.id }

        const { error } = await supabase
            .from('attendance_locks')
            .upsert(row, {
                onConflict: scope.mode === 'v2' ? 'class_id, date' : 'teacher_id, date',
                ignoreDuplicates: true,
            })

        if (error) {
            logger.error(error)
            return { error: error.message }
        }
    } else {
        let query = supabase.from('attendance_locks').delete().eq('date', date)

        query = scope.mode === 'v2'
            ? query.eq('class_id', scope.classId)
            : query.is('class_id', null).eq('teacher_id', scope.teacherId)

        const { error } = await query
        if (error) {
            logger.error(error)
            return { error: error.message }
        }
    }

    await auditLog({
        action: locked ? 'attendance.locked' : 'attendance.unlocked',
        entityType: 'attendance_locks',
        entityId: date,
        actorId: user.id,
        newValue: { date, locked },
        metadata: scope.mode === 'v2' ? { class_id: scope.classId } : undefined,
    })

    revalidatePath('/attendance/layout')
    revalidatePath('/attendance/monthly')
    return { success: true }
}
