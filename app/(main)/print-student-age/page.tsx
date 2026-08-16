import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PrintStudentAgeClient from './PrintStudentAgeClient'
import { FALLBACK_ACADEMIC_YEAR } from '@/lib/constants/academic'
import {
  classIdFromSearchParams,
  fetchStudentsForScope,
  resolveServerScope,
} from '@/lib/utils/serverScope'
import { logger } from '@/lib/utils/logger'
import type { Student } from '@/lib/types'

export default async function PrintStudentAgePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch settings
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('teacher_id', user.id)
    .single()
    
  const academicYear = settings?.academic_year || FALLBACK_ACADEMIC_YEAR

  // Fetch students
  // Phase 5: roster scoped to the active class via student_enrollments,
  // falling back to legacy teacher_id scoping for pre-V2 accounts.
  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)
  const students = await fetchStudentsForScope(scope)

  const heights = await fetchHeights(supabase, user.id, students)

  return (
    <PrintStudentAgeClient
      initialStudents={students || []}
      settings={settings || {}}
      academicYear={academicYear}
      heights={heights}
    />
  )
}

/**
 * Latest recorded height per student, in centimetres.
 *
 * Height is not a `students` column — it is captured over time in the health
 * tracking book (`class_admin_entries`, `book = 'health_tracking'`), which is
 * where the legacy build read it from too.
 *
 * That book identifies a pupil by *typed name*, not by id, because a teacher
 * fills it in as a paper register. So the join here is on the Khmer name, and a
 * pupil whose name was typed differently simply has no height — which is the
 * same thing the legacy page did, and better than guessing at a fuzzy match.
 */
async function fetchHeights(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  students: Student[],
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('class_admin_entries')
    .select('entry_date, data')
    .eq('teacher_id', userId)
    .eq('book', 'health_tracking')
    // Oldest first, so a later row overwrites an earlier one below and the most
    // recent measurement wins without needing a per-student sort.
    .order('entry_date', { ascending: true, nullsFirst: true })

  if (error) {
    logger.error('Failed to load health entries:', error)
    return {}
  }

  const byName = new Map(
    students
      .map((s) => [(s.name_kh || s.full_name || '').trim(), s.id] as const)
      .filter(([name]) => name.length > 0),
  )

  const heights: Record<string, number> = {}

  for (const row of (data ?? []) as { data: Record<string, unknown> }[]) {
    const name = String(row.data?.student ?? '').trim()
    const studentId = byName.get(name)
    if (!studentId) continue

    const height = Number.parseFloat(String(row.data?.height ?? ''))
    // Guard the range rather than just NaN: a weight typed into the height
    // column would otherwise land on the scatter chart as a 30cm twelve-year-old.
    if (Number.isFinite(height) && height > 30 && height < 250) {
      heights[studentId] = height
    }
  }

  return heights
}
