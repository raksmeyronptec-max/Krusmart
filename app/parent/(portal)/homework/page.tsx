import { childIdFromSearchParams, getChildHomework, resolveActiveChild } from '../../queries'
import HomeworkClient from './HomeworkClient'

export default async function ParentHomeworkPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { child } = await resolveActiveChild(await childIdFromSearchParams(searchParams))
  const assignments = await getChildHomework()
  return <HomeworkClient assignments={assignments} childName={child?.student.name_kh ?? ''} />
}
