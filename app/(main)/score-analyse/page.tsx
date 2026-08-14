import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ScoreAnalyseClient from './ScoreAnalyseClient'

export default async function ScoreAnalysePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch settings to get default academic year
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

  // Fetch attendance
  let { data: attendanceData } = await supabase
    .from('attendance')
    .select('*')
    .eq('teacher_id', user.id)

  // Fetch scores for the year
  let { data: scoresData } = await supabase
    .from('scores')
    .select('*')
    .eq('teacher_id', user.id)
    .eq('year', academicYear)

  return (
    <ScoreAnalyseClient 
      initialStudents={students || []} 
      attendanceData={attendanceData || []}
      scoresData={scoresData || []}
      academicYear={academicYear}
    />
  )
}
