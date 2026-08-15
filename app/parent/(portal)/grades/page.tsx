import { childIdFromSearchParams, getChildScores, resolveActiveChild } from '../../queries'
import GradesClient from './GradesClient'
import { STANDARD_SUBJECT_LABELS } from '../../subjects'

export default async function ParentGradesPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { child } = await resolveActiveChild(await childIdFromSearchParams(searchParams))
  const scores = child ? await getChildScores(child.student.id) : []

  return (
    <GradesClient
      scores={scores}
      childName={child?.student.name_kh ?? ''}
      subjectLabels={STANDARD_SUBJECT_LABELS}
    />
  )
}
