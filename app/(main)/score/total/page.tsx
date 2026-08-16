import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ScoreTotalClient from './ScoreTotalClient'
import {
  classIdFromSearchParams,
  fetchStudentsForScope,
  resolveServerScope,
} from '@/lib/utils/serverScope'
import type { Settings } from '@/lib/types'

export default async function ScoreTotalPage({
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

  // The print preview carries the school letterhead and the two signature
  // blocks; both come from `settings`, which is a teacher-owned row.
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('teacher_id', user.id)
    .maybeSingle()

  // `ScoreTotalClient` reads the period out of `useSearchParams`; the boundary
  // keeps that legal regardless of how this route is rendered.
  return (
    <Suspense>
      <ScoreTotalClient
        initialStudents={students || []}
        settings={(settings as Settings) ?? null}
      />
    </Suspense>
  )
}
