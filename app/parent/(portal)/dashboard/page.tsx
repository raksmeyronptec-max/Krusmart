import {
  childIdFromSearchParams, getChildNotifications, getSchoolSettings, resolveActiveChild,
} from '../../queries'
import DashboardClient from './DashboardClient'
import { getCurrentAcademicYear } from '@/lib/constants/academic'

export default async function ParentDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const requested = await childIdFromSearchParams(searchParams)
  const { child } = await resolveActiveChild(requested)

  // The school name lives on the teacher's settings row, which RLS exposes to a
  // parent only for their own child's teacher.
  const settings = child ? await getSchoolSettings(child.student.teacher_id) : null
  const notifications = await getChildNotifications()

  return (
    <DashboardClient
      student={child?.student ?? null}
      schoolName={settings?.school_name || 'សាលាបឋមសិក្សា'}
      academicYear={`ឆ្នាំសិក្សា ${settings?.academic_year || getCurrentAcademicYear()}`}
      notifications={notifications}
    />
  )
}
