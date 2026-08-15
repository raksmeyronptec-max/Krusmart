import { childIdFromSearchParams, getSchoolSettings, resolveActiveChild } from '../../queries'
import StudentCardClient from './StudentCardClient'

export default async function ParentStudentCardPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { child } = await resolveActiveChild(await childIdFromSearchParams(searchParams))
  const settings = child ? await getSchoolSettings(child.student.teacher_id) : null
  return <StudentCardClient student={child?.student ?? null} settings={settings} />
}
