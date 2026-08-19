import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StudentTrackingClient from './StudentTrackingClient'
import { FALLBACK_ACADEMIC_YEAR } from '@/lib/constants/academic'
import {
  classIdFromSearchParams,
  fetchStudentsForScope,
  resolveServerScope,
  rosterIdsForScope,
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
  const [students, rosterIds] = await Promise.all([
    fetchStudentsForScope(scope),
    rosterIdsForScope(scope),
  ])

  // Fetch scores for the year.
    // Aggregation reads the *class*, not the reader.
    //
    // `.eq('teacher_id', user.id)` is the convention on tables where that column
    // scopes ownership, and it is still what guards every score *write*. Reads
    // for aggregation are the documented exception (see the roster note in
    // `serverScope.ts`): a row's owner is the teacher who entered it, and in a
    // secondary class that is a different person for every subject. Filtering on
    // ownership here would silently drop every colleague's marks and quietly
    // divide by fewer subjects. Migration 00007's
    // `scores_select_own_or_assigned` is the real boundary, and it already
    // grants exactly this.
  let scoresQuery = supabase
    .from('scores')
    .select('*')
    .like('score_period', `%-${academicYear}%`)

  scoresQuery = rosterIds
    ? scoresQuery.in('student_id', rosterIds)
    // Legacy accounts have no roster to scope by, so ownership is the only
    // boundary there is — unchanged for them.
    : scoresQuery.eq('teacher_id', user.id)

  const { data: scoresData } = await scoresQuery

  return (
    <StudentTrackingClient 
      initialStudents={students || []}
      scoresData={scoresData || []}
      settings={settings || {}}
      academicYear={academicYear}
    />
  )
}
