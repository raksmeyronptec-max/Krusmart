import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ScoreAnalyseClient from './ScoreAnalyseClient'
import { logger } from '@/lib/utils/logger'
import { FALLBACK_ACADEMIC_YEAR } from '@/lib/constants/academic'

export default async function ScoreAnalysePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch settings to get default academic year
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

  // Fetch attendance
  const { data: attendanceData } = await supabase
    .from('attendance')
    .select('*')
    .eq('teacher_id', user.id)

  // Fetch scores for the year
  const { data: scoresData } = await supabase
    .from('scores')
    .select('*')
    .eq('teacher_id', user.id)
    .like('score_period', `%-${academicYear}%`)

  return (
    <ScoreAnalyseClient 
      initialStudents={students || []} 
      attendanceData={attendanceData || []}
      scoresData={scoresData || []}
      academicYear={academicYear}
    />
  )
}
