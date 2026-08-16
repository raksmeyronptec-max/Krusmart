import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SubjectAnalysisClient from './SubjectAnalysisClient'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import {
  classIdFromSearchParams,
  fetchStudentsForScope,
  resolveServerScope,
} from '@/lib/utils/serverScope'

export const metadata = { title: 'វិភាគតាមមុខវិជ្ជា' }

export default async function SubjectAnalysisPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // The roster travels with the page so the per-student panel and the
  // top/bottom tables can show names. Marks still come through the
  // `getAllScoresByPeriod` / `getMonthlyScoresForYear` actions, which re-check
  // the session and apply the same scoping themselves.
  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)
  const students = await fetchStudentsForScope(scope)

  // The teacher's own year wins when they have set one; otherwise the year is
  // computed from today's date rather than pinned to a literal, which is what
  // this page used to do.
  const { data: settings } = await supabase
    .from('settings')
    .select('academic_year')
    .eq('teacher_id', user.id)
    .maybeSingle()

  return (
    <SubjectAnalysisClient
      students={students || []}
      defaultAcademicYear={settings?.academic_year || getCurrentAcademicYear()}
    />
  )
}
