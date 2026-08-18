import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClassClient } from './ClassClient'

export const metadata = { title: 'បង្កើតថ្នាក់ | KruSmart' }

interface GradeOption {
  id: string
  name: string
  sortOrder: number
  levelName: string
}

/**
 * Step 4 — create the class (§10).
 *
 * This page is deliberately self-sufficient rather than dependent on `?grade=`.
 * `onboardingRedirect` resumes an interrupted setup here with no parameters at
 * all — a teacher who created an organisation last week and closed the tab —
 * so the form loads every grade their school has and pre-selects the one they
 * just picked when there is one. Bouncing them back to step 2 to re-answer a
 * question already recorded in the database would be the wrong repair.
 */
export default async function ClassPage({
  searchParams,
}: {
  searchParams: Promise<{ grade?: string }>
}) {
  const { grade } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.school_id) redirect('/onboarding/organisation')

  const [{ data: gradeRows }, { data: years }] = await Promise.all([
    supabase
      .from('grades')
      .select('id, name, sort_order, education_levels!inner(id, name, school_id)')
      .eq('education_levels.school_id', profile.school_id)
      .order('sort_order'),
    supabase
      .from('academic_years')
      .select('id, name, is_active')
      .eq('school_id', profile.school_id)
      .order('name', { ascending: false }),
  ])

  const grades: GradeOption[] = (gradeRows ?? []).map((row) => {
    const rel = (row as { education_levels?: { name?: string } | { name?: string }[] }).education_levels
    const level = Array.isArray(rel) ? rel[0] : rel
    return {
      id: row.id as string,
      name: row.name as string,
      sortOrder: (row.sort_order as number) ?? 0,
      levelName: level?.name ?? '',
    }
  })

  // No grades means step 2 never ran for this school.
  if (grades.length === 0) redirect('/onboarding/level')

  const activeYear = years?.find((y) => y.is_active) ?? years?.[0] ?? null

  return (
    <ClassClient
      grades={grades}
      years={(years ?? []).map((y) => ({ id: y.id as string, name: y.name as string }))}
      initialGradeId={grades.some((g) => g.id === grade) ? grade! : grades[0].id}
      initialYearId={activeYear?.id ?? ''}
    />
  )
}
