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

  // The stranded-onboarding signature (see migration 00018): the class has no
  // enrolments at all, yet students still exist under this teacher's
  // `teacher_id` — a roster the v2 read cannot see. Only probed when the v2
  // roster came back empty, so the extra count query costs nothing in the
  // ordinary case; the banner it drives is opt-in recovery, never a silent fix.
  let legacyRecoverableCount = 0
  if (scope.mode === 'v2' && students.length === 0) {
    const { count } = await supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', user.id)
    legacyRecoverableCount = count ?? 0
  }

  // `key` resets the client component's local roster state when the class
  // changes — React's documented alternative to a prop-syncing effect. The
  // recoverable flag is part of the key for the same reason: the client holds
  // the roster in state, so after a successful recovery the refreshed server
  // data must remount it, or the just-restored students would not appear
  // until a manual reload.
  return (
    <StudentTableClient
      key={`${scope.mode === 'v2' ? scope.classId : 'legacy'}:${legacyRecoverableCount > 0 ? 'recoverable' : 'ok'}`}
      initialStudents={students}
      legacyRecoverableCount={legacyRecoverableCount}
    />
  )
}
