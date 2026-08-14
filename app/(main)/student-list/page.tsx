import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StudentTableClient from './StudentTableClient'
import { logger } from '@/lib/utils/logger'

export default async function StudentListPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: students, error } = await supabase
    .from('students')
    .select('*')
    .eq('teacher_id', user.id)
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) {
    logger.error("Fetch Error:", error.message || error)
  }

  return (
    <StudentTableClient initialStudents={students || []} />
  )
}
