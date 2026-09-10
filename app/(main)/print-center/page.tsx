import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  classIdFromSearchParams,
  resolveClassTemplateContext,
  resolveServerScope,
} from '@/lib/utils/serverScope'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import {
  isReportType,
  REPORT_CATEGORIES,
  reportDefinition,
  type ReportCategory,
  type ReportType,
} from '@/lib/reporting/report-types'
import { isMonthId } from '@/lib/constants/months'
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

  const params = (await searchParams) ?? {}
  const one = (key: string): string | undefined => {
    const raw = params[key]
    return Array.isArray(raw) ? raw[0] : raw
  }

  /*
   * `?report=` opens the centre ON that report's generation flow (Phase 13).
   *
   * The results screens are the reason it exists. A teacher who has just read
   * ខែធ្នូ's ranking wants ខែធ្នូ's ranking sheet, and making them arrive at the
   * index, pick the family, find the row and re-choose the month they were
   * already looking at is the "reconstruct what you were viewing" tax the
   * results→documents join exists to remove.
   *
   * A request, never an instruction: an unknown type, or one whose report
   * cannot currently produce a file, degrades to the family view rather than
   * opening a dialog over a row that would only say មិនទាន់មាន. The centre
   * decides what may be offered through `reportAvailability`, here as
   * everywhere — this parameter only says which row to start on.
   */
  const requestedReport = one('report')
  const initialReport: ReportType | null = isReportType(requestedReport) ? requestedReport : null

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
   * and not to a dead end. A `?report=` with no category falls back to that
   * report's own family, so one parameter is enough to arrive focused.
   */
  const requested = one('category')
  const initialCategory: ReportCategory | null =
    REPORT_CATEGORIES.some((c) => c.id === requested)
      ? (requested as ReportCategory)
      : initialReport
        ? (reportDefinition(initialReport)?.category ?? null)
        : null

  /*
   * The year the LINKING SCREEN was showing, not necessarily the current one.
   *
   * Without this the centre resolved `getCurrentAcademicYear()` unconditionally,
   * so a teacher reading last year's ranking and clicking through to print it
   * would have been handed this year's sheet — the same class of silent
   * mismatch `?class=` was introduced to close for the class.
   *
   * Shape-checked rather than looked up: academic years are not a table, and an
   * unparseable value falls back to the current year rather than to an error.
   */
  const requestedYear = one('year')
  const academicYear = /^\d{4}-\d{4}$/.test(requestedYear ?? '')
    ? (requestedYear as string)
    : getCurrentAcademicYear()

  // The period, in the two shapes the generation flow actually holds. Guarded
  // by the shared month guard rather than a local list, so the centre and the
  // score screens cannot disagree about what a month id is.
  const requestedMonth = one('month')
  const initialPeriod = requestedMonth && isMonthId(requestedMonth) ? requestedMonth : null
  const requestedSemester = one('semester')
  const initialSemester =
    requestedSemester === 'sem1' || requestedSemester === 'sem2' ? requestedSemester : null

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
      academicYear={academicYear}
      initialCategory={initialCategory}
      initialReport={initialReport}
      initialPeriod={initialPeriod}
      initialSemester={initialSemester}
    />
  )
}
