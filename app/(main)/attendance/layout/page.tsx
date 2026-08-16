import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AttendanceLayoutClient from './AttendanceLayoutClient'
import {
  classIdFromSearchParams,
  fetchStudentsForScope,
  resolveServerScope,
} from '@/lib/utils/serverScope'
import { logger } from '@/lib/utils/logger'
import type { AttendanceRecord } from '@/lib/types'

/**
 * Today's date, in the teacher's own timezone.
 *
 * Computed on the server and handed to the client so the two cannot disagree:
 * if each worked it out independently, a server in UTC and a teacher in Phnom
 * Penh would name different days for the first seven hours of every morning,
 * and the register would arrive pre-filled from yesterday.
 */
function todayISO(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export default async function AttendanceLayoutPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Phase 5: roster scoped to the active class via student_enrollments,
  // falling back to legacy teacher_id scoping for pre-V2 accounts.
  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)
  const students = await fetchStudentsForScope(scope)

  // Today's marks travel with the page.
  //
  // They used to be fetched in an effect after mount, so the register painted
  // as entirely unmarked and then corrected itself — on a classroom connection,
  // long enough for a teacher to start marking pupils who were already marked.
  const date = todayISO()
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('teacher_id', user.id)
    .eq('date', date)

  if (error) logger.error(error)

  const initialAttendance = Object.fromEntries(
    ((data ?? []) as AttendanceRecord[]).map((r) => [
      r.student_id,
      { status: r.status, note: r.reason || '' },
    ]),
  )

  return (
    <AttendanceLayoutClient
      key={scope.mode === 'v2' ? scope.classId : 'legacy'}
      initialStudents={students || []}
      initialDate={date}
      initialAttendance={initialAttendance}
    />
  )
}
