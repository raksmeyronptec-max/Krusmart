import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StudentTableClient from './StudentTableClient'
import {
  classIdFromSearchParams,
  fetchStudentsForScope,
  resolveServerScope,
} from '@/lib/utils/serverScope'

/**
 * Phase 5 — first feature migrated onto the V2 scope.
 *
 * The roster now comes from `student_enrollments` for the active class, with
 * `teacher_id` kept as a second filter. A teacher with no assignments resolves
 * to the legacy scope and gets exactly the query this page ran before, so
 * pre-V2 accounts are unaffected.
 *
 * The active class arrives as `?class=`, written by `ClassContextSwitcher`, and
 * is validated against the caller's own assignments inside `resolveServerScope`.
 */
export default async function StudentListPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)
  const students = await fetchStudentsForScope(scope)

  // `key` resets the client component's local roster state when the class
  // changes — React's documented alternative to a prop-syncing effect.
  return (
    <StudentTableClient
      key={scope.mode === 'v2' ? scope.classId : 'legacy'}
      initialStudents={students}
    />
  )
}
