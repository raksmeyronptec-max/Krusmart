import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  classIdFromSearchParams,
  resolveServerScope,
} from '@/lib/utils/serverScope'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import PrintCenterClient from './PrintCenterClient'

export const metadata = { title: 'មជ្ឈមណ្ឌលបោះពុម្ព' }

/**
 * មជ្ឈមណ្ឌលបោះពុម្ព — one place for every printable document.
 *
 * The reports themselves have been in the product for a long time, scattered
 * across four navigation modules and sixteen routes: a teacher looking for
 * "the yearly subject results" had to know it lived under របាយការណ៍ while the
 * ministry score sheet lived under ពិន្ទុ. This is the index that was missing,
 * not a rewrite of what it indexes — every card either generates through the
 * shared engine or opens the screen that already works (§27).
 *
 * The class is resolved server-side so the centre opens on the teacher's own
 * class; `?class=` is a request, validated by `resolveServerScope` against what
 * they actually hold.
 */
export default async function PrintCenterPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)

  let className = ''
  if (scope.mode === 'v2') {
    const { data } = await supabase
      .from('classes')
      .select('name')
      .eq('id', scope.classId)
      .maybeSingle()
    className = data?.name ?? ''
  }

  return (
    <PrintCenterClient
      classId={scope.mode === 'v2' ? scope.classId : null}
      className={className}
      academicYear={getCurrentAcademicYear()}
    />
  )
}
