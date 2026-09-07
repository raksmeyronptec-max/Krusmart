import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  classIdFromSearchParams,
  resolveClassTemplateContext,
  resolveServerScope,
} from '@/lib/utils/serverScope'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import { REPORT_CATEGORIES, type ReportCategory } from '@/lib/reporting/report-types'
import PrintCenterClient from './PrintCenterClient'

export const metadata = { title: 'មជ្ឈមណ្ឌលរបាយការណ៍ និងបោះពុម្ព' }

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

  /*
   * `?category=` opens the centre on one family.
   *
   * Read here and passed as a prop rather than through `useSearchParams` in the
   * client: this page already awaits `searchParams` for `?class=`, so the
   * category costs nothing, and a `useSearchParams` in `PrintCenterClient`
   * would drag a Suspense boundary onto a page that needs none.
   *
   * Validated against the catalogue — an unknown category opens the full list
   * rather than an empty screen, because a bad link should degrade to the index
   * and not to a dead end.
   */
  const params = (await searchParams) ?? {}
  const rawCategory = params.category
  const requested = Array.isArray(rawCategory) ? rawCategory[0] : rawCategory
  const initialCategory = REPORT_CATEGORIES.some((c) => c.id === requested)
    ? (requested as ReportCategory)
    : null

  // Class name and grade for the header (§6). Both are context, not report
  // data: the centre must not fetch a single mark to render itself (§33) — two
  // metadata rows, no scores, whatever the catalogue grows to.
  let className = ''
  let gradeNumber: number | null = null
  if (scope.mode === 'v2') {
    const [{ data }, context] = await Promise.all([
      supabase.from('classes').select('name').eq('id', scope.classId).maybeSingle(),
      resolveClassTemplateContext(scope.classId),
    ])
    className = data?.name ?? ''
    gradeNumber = context?.gradeNumber ?? null
  } else {
    // A pre-V2 account has no `classes` row, but it does have the class name it
    // prints on every sheet. Without this the context bar would read "—" for
    // exactly the teachers whose reports still work — and §6 asks the header to
    // name the class, not to expose which scoping path resolved it.
    const { data } = await supabase
      .from('settings')
      .select('class_name')
      .eq('teacher_id', user.id)
      .maybeSingle()
    className = data?.class_name ?? ''
  }

  return (
    <PrintCenterClient
      classId={scope.mode === 'v2' ? scope.classId : null}
      className={className}
      gradeNumber={gradeNumber}
      academicYear={getCurrentAcademicYear()}
      initialCategory={initialCategory}
    />
  )
}
