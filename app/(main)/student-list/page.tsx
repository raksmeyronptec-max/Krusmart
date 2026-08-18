import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StudentTableClient from './StudentTableClient'
import {
  classIdFromSearchParams,
  countRecoverableLegacyStudents,
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

  // Students under this teacher's `teacher_id` with no enrolment row at all —
  // invisible to every v2 read. Probed on every load, not only when the
  // roster is empty: a failed enrol-compensation can orphan students while
  // the class still shows others. The banner it drives is opt-in recovery,
  // never a silent fix; see countRecoverableLegacyStudents for the predicate.
  const legacyRecoverableCount = await countRecoverableLegacyStudents(scope, user.id)

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
      recoverClassId={scope.mode === 'v2' ? scope.classId : undefined}
    />
  )
}
