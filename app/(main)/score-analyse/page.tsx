import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ScoreAnalyseClient from './ScoreAnalyseClient'
import { FALLBACK_ACADEMIC_YEAR } from '@/lib/constants/academic'
import {
  classIdFromSearchParams,
  fetchStudentsForScope,
  resolveServerScope,
} from '@/lib/utils/serverScope'

export default async function ScoreAnalysePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
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
  // Phase 5: roster scoped to the active class via student_enrollments,
  // falling back to legacy teacher_id scoping for pre-V2 accounts.
  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)
  const students = await fetchStudentsForScope(scope)

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
