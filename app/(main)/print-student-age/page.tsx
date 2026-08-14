import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PrintStudentAgeClient from './PrintStudentAgeClient'
import { logger } from '@/lib/utils/logger'
import { FALLBACK_ACADEMIC_YEAR } from '@/lib/constants/academic'

export default async function PrintStudentAgePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch settings
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('teacher_id', user.id)
    .single()
    
  const academicYear = settings?.academic_year || FALLBACK_ACADEMIC_YEAR

  // Fetch students
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
    <PrintStudentAgeClient 
      initialStudents={students || []} 
      settings={settings || {}}
      academicYear={academicYear}
    />
  )
}
