import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StudentTrackingClient from './StudentTrackingClient'
import { FALLBACK_ACADEMIC_YEAR } from '@/lib/constants/academic'
import {
  classIdFromSearchParams,
  fetchStudentsForScope,
  resolveServerScope,
} from '@/lib/utils/serverScope'

export default async function StudentTrackingPage({
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

  // Fetch scores for the year
  const { data: scoresData } = await supabase
    .from('scores')
    .select('*')
    .eq('teacher_id', user.id)
    .like('score_period', `%-${academicYear}%`)

  return (
    <StudentTrackingClient 
      initialStudents={students || []}
      scoresData={scoresData || []}
      settings={settings || {}}
      academicYear={academicYear}
    />
  )
}
