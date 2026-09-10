import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import HomeworkSendClient from './HomeworkSendClient'
import { getAssignments } from './actions'
import { classIdFromSearchParams, resolveServerScope } from '@/lib/utils/serverScope'

export const metadata = { title: 'បញ្ជូនកិច្ចការទៅអាណាព្យាបាល' }

export default async function HomeworkSendPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  /*
   * Which class this screen publishes to.
   *
   * `/homework/send` was the last class-scoped workflow in the product with no
   * class at all (Phase 0, P0-2): it read `teacher_id` and nothing else, so a
   * teacher holding two classes saw one merged list and every assignment
   * reached both classes' parents. Migration 00032 gave the table a `class_id`;
   * this is where it is resolved.
   *
   * `resolveServerScope` validates the requested id against the caller's own
   * assignments, so a forged `?class=` resolves to their own default. A legacy
   * account resolves `mode: 'legacy'` and keeps the unscoped screen it had.
   */
  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)
  const scopeClassId = scope.mode === 'v2' ? scope.classId : null

  /*
   * Fetched here rather than from an effect so the list is on the first paint
   * instead of after a spinner. `getAssignments` is the same server action the
   * client calls to refresh, so the query, the scope resolution and RLS are
   * identical either way.
   */
  const assignments = await getAssignments(scopeClassId ?? undefined)

  return (
    <HomeworkSendClient
      userId={user.id}
      initialAssignments={assignments}
      scopeClassId={scopeClassId}
    />
  )
}
