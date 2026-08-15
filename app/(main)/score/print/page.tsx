import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ScorePrintClient from './ScorePrintClient'
import { FALLBACK_ACADEMIC_YEAR } from '@/lib/constants/academic'
import {
  classIdFromSearchParams,
  fetchStudentsForScope,
  resolveServerScope,
} from '@/lib/utils/serverScope'
import type { Settings } from '@/lib/types'

export const metadata = { title: 'តារាងពិន្ទុ (ទម្រង់ក្រសួង)' }

/**
 * The MoEYS score sheet — `តារាងពិន្ទុតាមទម្រង់ក្រសួង`.
 *
 * A4 landscape, one row per student, with the ministry letterhead, the class
 * statistics block and the two signature panels the paper form carries. Scores
 * are fetched in the client so switching month or semester does not need a
 * round trip through the server component.
 */
export default async function ScorePrintPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('teacher_id', user.id)
    .maybeSingle()

  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)
  const students = await fetchStudentsForScope(scope)

  return (
    <ScorePrintClient
      initialStudents={students}
      settings={(settings as Settings) ?? null}
      academicYear={settings?.academic_year || FALLBACK_ACADEMIC_YEAR}
    />
  )
}
