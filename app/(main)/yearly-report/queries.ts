import 'server-only'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import {
  classIdFromSearchParams,
  fetchStudentsForScope,
  resolveServerScope,
  rosterIdsForScope,
} from '@/lib/utils/serverScope'
import { logger } from '@/lib/utils/logger'
import type { Score, Settings, Student } from '@/lib/types'

export interface AnnualReportData {
  students: Student[]
  annualScores: Score[]
  settings: Settings | null
  academicYear: string
}

/**
 * Roster, annual marks and letterhead for the yearly sub-reports.
 *
 * All three fetch exactly the same things, so the loader lives here rather than
 * being pasted into each page — and any change to the scoping rules lands on all
 * three at once.
 */
export async function loadAnnualReportData(
  searchParams?: Promise<Record<string, string | string[] | undefined>>,
): Promise<AnnualReportData> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('teacher_id', user.id)
    .maybeSingle()

  const academicYear = settings?.academic_year || getCurrentAcademicYear()

  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)
  const students = await fetchStudentsForScope(scope)

  // Scored by roster rather than ownership, per migration 00007: a teacher
  // assigned to the class reads every subject's marks for it, including those a
  // colleague entered. Legacy accounts fall back to `teacher_id`.
  const rosterIds = await rosterIdsForScope(scope)

  let query = supabase
    .from('scores')
    .select('*')
    .eq('score_type', 'annual')
    .eq('score_period', `annual-${academicYear}`)

  query = rosterIds ? query.in('student_id', rosterIds) : query.eq('teacher_id', user.id)

  const { data: annualScores, error } = await query
  if (error) logger.error('Failed to load annual scores:', error)

  return {
    students: students || [],
    annualScores: (annualScores || []) as Score[],
    settings: settings || null,
    academicYear,
  }
}

// Period-scoped reads for the subject-results breakdown go through
// `getAllScoresByPeriod` in `score/total/actions.ts` — it already applies
// exactly this scoping, and a second copy here would be one more thing to keep
// in step with migration 00007.
