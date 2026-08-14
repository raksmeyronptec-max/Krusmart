import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NotificationsClient from './NotificationsClient'

export default async function NotificationsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch students for dropdown
  let { data: students, error } = await supabase
    .from('students')
    .select('id, khmer_name')
    .eq('teacher_id', user.id)
    .order('khmer_name', { ascending: true })

  if (error) {
    console.error(error)
    students = []
  }

  return (
    <NotificationsClient initialStudents={students || []} userId={user.id} />
  )
}
