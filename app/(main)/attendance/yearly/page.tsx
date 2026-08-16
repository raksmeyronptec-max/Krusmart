import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import YearlyAbsenceClient from './YearlyAbsenceClient'
import { getCurrentAcademicYear, resolveCalendarYear } from '@/lib/constants/academic'
import { MONTHS_BY_ACADEMIC_YEAR } from '@/lib/constants/months'
import {
  classIdFromSearchParams,
  fetchStudentsForScope,
  resolveServerScope,
} from '@/lib/utils/serverScope'
import { logger } from '@/lib/utils/logger'
import type { AttendanceRecord } from '@/lib/types'

export const metadata = { title: 'អវត្តមានប្រចាំឆ្នាំ' }

export default async function YearlyAbsencePage({
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

  const academicYear = settings?.academic_year || getCurrentAcademicYear()

  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)
  const students = await fetchStudentsForScope(scope)

  // The academic year spans two calendar years, so the range is bounded by the
  // first and last academic month rather than by a single year. Fetching a
  // bounded range keeps this to one request instead of twelve.
  const first = MONTHS_BY_ACADEMIC_YEAR[0]
  const last = MONTHS_BY_ACADEMIC_YEAR[MONTHS_BY_ACADEMIC_YEAR.length - 1]
  const from = `${resolveCalendarYear(academicYear, first.isNextYear)}-${first.num}-01`
  const toYear = resolveCalendarYear(academicYear, last.isNextYear)
  // Day 31 is a safe upper bound for a `lte` on an ISO date string: no real date
  // in that month sorts above it, and a non-existent 31st is never matched.
  const to = `${toYear}-${last.num}-31`

  const { data: attendance, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('teacher_id', user.id)
    .gte('date', from)
    .lte('date', to)

  if (error) logger.error('Failed to load attendance for yearly report:', error)

  return (
    <YearlyAbsenceClient
      students={students || []}
      attendance={(attendance || []) as AttendanceRecord[]}
      settings={settings || null}
      academicYear={academicYear}
    />
  )
}
