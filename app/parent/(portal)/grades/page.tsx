import { childIdFromSearchParams, getChildScores, resolveActiveChild } from '../../queries'
import GradesClient from './GradesClient'
import { STANDARD_SUBJECT_LABELS } from '../../subjects'
import { resolveStudentGradingContext } from '@/lib/utils/serverScope'
import { DEFAULT_SCHEME_CONFIG } from '@/lib/grading/scheme'

export default async function ParentGradesPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { child } = await resolveActiveChild(await childIdFromSearchParams(searchParams))

  // The reader is a parent: there is no teacher assignment and no active class
  // selection, so the grading context is resolved from the *child's own
  // enrolment*. Once per page, not once per period.
  const [scores, grading] = await Promise.all([
    child ? getChildScores(child.student.id) : Promise.resolve([]),
    child
      ? resolveStudentGradingContext(child.student.id)
      : Promise.resolve(null),
  ])

  return (
    <GradesClient
      scores={scores}
      childName={child?.student.name_kh ?? ''}
      subjectLabels={STANDARD_SUBJECT_LABELS}
      scheme={grading?.scheme ?? DEFAULT_SCHEME_CONFIG}
      maxByColumn={grading?.maxByColumn ?? {}}
    />
  )
}
