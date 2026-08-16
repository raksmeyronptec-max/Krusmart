import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import HomeworkSendClient from './HomeworkSendClient'
import { getAssignments } from './actions'

export default async function HomeworkSendPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetched here rather than from an effect so the list is on the first paint
  // instead of after a spinner. `getAssignments` is the same server action the
  // client calls to refresh, so the query, the `teacher_id` filter and RLS are
  // identical either way.
  const assignments = await getAssignments()

  return <HomeworkSendClient userId={user.id} initialAssignments={assignments} />
}
