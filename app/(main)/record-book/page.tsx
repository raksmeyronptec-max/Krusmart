import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RecordBookClient from './RecordBookClient'
import { FALLBACK_ACADEMIC_YEAR } from '@/lib/constants/academic'
import {
  classIdFromSearchParams,
  fetchStudentsForScope,
  resolveServerScope,
} from '@/lib/utils/serverScope'
import type { AttendanceRecord, Score, Settings } from '@/lib/types'

export const metadata = { title: 'សៀវភៅសិក្ខាគារិក' }

/**
 * សៀវភៅសិក្ខាគារិក — the student record book.
 *
 * One A4 landscape sheet per student, carrying the semester and annual results,
 * the absence tally and the behavioural assessment. The dashboard has linked to
 * `/record-book` all along, but the route did not exist, so the tile 404'd.
 */
export default async function RecordBookPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('teacher_id', user.id)
    .maybeSingle()

  const academicYear = settings?.academic_year || FALLBACK_ACADEMIC_YEAR

  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)
  const students = await fetchStudentsForScope(scope)

  const studentIds = students.map((s) => s.id)

  // Semester and annual rows only — the monthly grid is not printed here. An
  // empty roster would make `.in()` match nothing, so skip the round trip.
  const [scoresRes, attendanceRes] = await Promise.all([
    studentIds.length
      ? supabase
          .from('scores')
          .select('*')
          .in('student_id', studentIds)
          .in('score_type', ['semester', 'annual'])
          .like('score_period', `%${academicYear}%`)
      : Promise.resolve({ data: [] as Score[] }),
    studentIds.length
      ? supabase.from('attendance').select('*').in('student_id', studentIds)
      : Promise.resolve({ data: [] as AttendanceRecord[] }),
  ])

  return (
    <RecordBookClient
      students={students}
      scores={(scoresRes.data ?? []) as Score[]}
      attendance={(attendanceRes.data ?? []) as AttendanceRecord[]}
      settings={(settings as Settings) ?? null}
      academicYear={academicYear}
    />
  )
}
