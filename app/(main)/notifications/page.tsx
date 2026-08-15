import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NotificationsClient from './NotificationsClient'
import {
  classIdFromSearchParams,
  fetchStudentsForScope,
  resolveServerScope,
} from '@/lib/utils/serverScope'

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Students for the recipient dropdown, scoped to the active class.
  // fetchStudentsForScope returns full rows; this page only reads id/name_kh.
  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)
  const students = (await fetchStudentsForScope(scope))
    .slice()
    .sort((a, b) => (a.name_kh || '').localeCompare(b.name_kh || '', 'km'))

  return (
    <NotificationsClient initialStudents={students || []} />
  )
}
