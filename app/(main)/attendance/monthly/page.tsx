import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MonthlyAttendanceClient from './MonthlyAttendanceClient'

export default async function MonthlyAttendancePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch students
  let { data: students, error } = await supabase
    .from('students')
    .select('*')
    .eq('teacher_id', user.id)
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) {
    console.error(error)
    students = []
  }

  return (
    <MonthlyAttendanceClient initialStudents={students || []} userId={user.id} />
  )
}
