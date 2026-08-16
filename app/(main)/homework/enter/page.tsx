import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import HomeworkEnterClient from './HomeworkEnterClient'
import {
  classIdFromSearchParams,
  fetchStudentsForScope,
  resolveServerScope,
} from '@/lib/utils/serverScope'

export default async function HomeworkEnterPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch students
  // Phase 5: roster scoped to the active class via student_enrollments,
  // falling back to legacy teacher_id scoping for pre-V2 accounts.
  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)
  const students = await fetchStudentsForScope(scope)

  // The letterhead for the printable score sheet.
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('teacher_id', user.id)
    .maybeSingle()

  return (
    <HomeworkEnterClient
      initialStudents={students || []}
      settings={settings || null}
      // Already validated against this teacher's own assignments above, so the
      // client can hand it straight back to `getScores`/`saveScores` — which
      // validate it again — and the marks are read from the same class the
      // roster came from. `null` means the legacy `teacher_id` path.
      scopeClassId={scope.mode === 'v2' ? scope.classId : null}
    />
  )
}
