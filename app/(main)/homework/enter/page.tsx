import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import HomeworkEnterClient from './HomeworkEnterClient'
import {
  classIdFromSearchParams,
  fetchStudentsForScope,
  resolveServerScope,
} from '@/lib/utils/serverScope'

export default async function HomeworkEnterPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch students
  // Phase 5: roster scoped to the active class via student_enrollments,
  // falling back to legacy teacher_id scoping for pre-V2 accounts.
  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)
  const students = await fetchStudentsForScope(scope)

  // The letterhead for the printable score sheet.
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('teacher_id', user.id)
    .maybeSingle()

  return (
    <HomeworkEnterClient initialStudents={students || []} settings={settings || null} />
  )
}
