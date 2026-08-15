import { createClient } from '@/lib/supabase/server'
import { getAdminScope } from '../queries'
import { AdminPage, EmptyState, NoSchool } from '../AdminPage'
import EnrollmentsClient, { type StudentHistory, type ClassOption } from './EnrollmentsClient'
import BulkPromote from './BulkPromote'
import type { EnrollmentStatus } from '@/lib/types'

/**
 * Enrollment history and lifecycle for the whole school.
 *
 * Loads every student's enrollments — across all academic years, not just the
 * active one — so the history table can show where each student has been.
 */
export default async function AdminEnrollmentsPage() {
  const scope = await getAdminScope()
  if (!scope) return <NoSchool />

  const supabase = await createClient()

  const [{ data: students }, { data: enrollments }, { data: classes }] = await Promise.all([
    supabase
      .from('students')
      .select('id, name_kh, student_id, gender')
      .eq('school_id', scope.schoolId)
      .order('name_kh', { ascending: true }),
    supabase
      .from('student_enrollments')
      .select('id, student_id, class_id, academic_year_id, status, enrolled_at, left_at, classes(name), academic_years(name)')
      .order('enrolled_at', { ascending: false }),
    supabase
      .from('classes')
      .select('id, name, academic_year_id, academic_years(name)')
      .order('name', { ascending: true }),
  ])

  type Row = {
    id: string
    student_id: string
    class_id: string
    academic_year_id: string
    status: string
    enrolled_at: string
    left_at: string | null
    classes?: { name?: string } | { name?: string }[] | null
    academic_years?: { name?: string } | { name?: string }[] | null
  }
  const one = <T,>(r: T | T[] | null | undefined): T | undefined =>
    Array.isArray(r) ? r[0] : (r ?? undefined)

  const byStudent = new Map<string, StudentHistory['history']>()
  for (const raw of (enrollments ?? []) as Row[]) {
    const list = byStudent.get(raw.student_id) ?? []
    list.push({
      id: raw.id,
      className: one(raw.classes)?.name ?? '—',
      academicYearName: one(raw.academic_years)?.name ?? '—',
      status: raw.status as EnrollmentStatus,
      enrolledAt: raw.enrolled_at,
      leftAt: raw.left_at,
    })
    byStudent.set(raw.student_id, list)
  }

  const histories: StudentHistory[] = ((students ?? []) as {
    id: string; name_kh: string; student_id: string; gender: string
  }[]).map((s) => ({
    studentId: s.id,
    name: s.name_kh,
    code: s.student_id,
    gender: s.gender,
    history: byStudent.get(s.id) ?? [],
  }))

  const classOptions: ClassOption[] = ((classes ?? []) as {
    id: string; name: string; academic_years?: { name?: string } | { name?: string }[] | null
  }[]).map((c) => ({
    id: c.id,
    name: c.name,
    academicYearName: one(c.academic_years)?.name ?? '',
  }))

  return (
    <AdminPage
      title="ប្រវត្តិចុះឈ្មោះសិស្ស"
      description="តាមដានប្រវត្តិ និងគ្រប់គ្រងការឡើងថ្នាក់ ផ្ទេរថ្នាក់ និងដកឈ្មោះ"
    >
      <BulkPromote classes={classOptions} />

      {histories.length === 0 ? (
        <EmptyState message="មិនទាន់មានសិស្សក្នុងសាលានេះទេ" />
      ) : (
        <EnrollmentsClient students={histories} classes={classOptions} />
      )}
    </AdminPage>
  )
}
