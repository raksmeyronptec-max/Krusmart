import { childIdFromSearchParams, getChildAttendance, resolveActiveChild, summariseAttendance } from '../../queries'
import AttendanceClient from './AttendanceClient'

export default async function ParentAttendancePage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { child } = await resolveActiveChild(await childIdFromSearchParams(searchParams))
  const records = child ? await getChildAttendance(child.student.id) : []

  return (
    <AttendanceClient
      records={records}
      summary={summariseAttendance(records)}
      childName={child?.student.name_kh ?? ''}
    />
  )
}
