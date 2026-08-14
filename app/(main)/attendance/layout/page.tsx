import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AttendanceLayoutClient from './AttendanceLayoutClient'
import { logger } from '@/lib/utils/logger'

export default async function AttendanceLayoutPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch students - handle both schemas (if teacher_id exists or not)
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('teacher_id', user.id)
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) {
    logger.error(error)
  }

  const students = data ?? []

  return (
    <AttendanceLayoutClient initialStudents={students || []} />
  )
}
