import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PrintStudentAgeClient from './PrintStudentAgeClient'

export default async function PrintStudentAgePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch settings
  let { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('teacher_id', user.id)
    .single()
    
  const academicYear = settings?.academic_year || '2023-2024'

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
    <PrintStudentAgeClient 
      initialStudents={students || []} 
      settings={settings || {}}
      academicYear={academicYear}
    />
  )
}
