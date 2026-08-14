import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PrintStudentCodesClient from './PrintStudentCodesClient'

export default async function PrintStudentCodesPage() {
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
    <PrintStudentCodesClient 
      initialStudents={students || []} 
      teacherUid={user.id}
    />
  )
}
