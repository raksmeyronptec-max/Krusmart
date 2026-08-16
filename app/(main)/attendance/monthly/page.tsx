import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MonthlyAttendanceClient from './MonthlyAttendanceClient'
import { getMonthlyAttendance, getTeacherSettings } from './actions'
import {
  classIdFromSearchParams,
  fetchStudentsForScope,
  resolveServerScope,
} from '@/lib/utils/serverScope'

export default async function MonthlyAttendancePage({
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

  // The current month is chosen here rather than in the client, so both sides
  // agree on which sheet is being rendered and the marks below match it.
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  // The sheet's marks and the school's letterhead travel with the page.
  //
  // Both used to be fetched after mount, which meant the A4 preview rendered
  // with empty absence columns and blank school and teacher names, then filled
  // in. A teacher who pressed បោះពុម្ព during that window printed the empty
  // version — the failure is silent and ends up on paper.
  const [records, settings] = await Promise.all([
    getMonthlyAttendance(year, month),
    getTeacherSettings(),
  ])

  return (
    <MonthlyAttendanceClient
      key={scope.mode === 'v2' ? scope.classId : 'legacy'}
      initialStudents={students || []}
      initialYear={year}
      initialMonth={month}
      initialRecords={records}
      initialSettings={settings}
    />
  )
}
