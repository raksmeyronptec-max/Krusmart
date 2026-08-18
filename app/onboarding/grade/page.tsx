import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GradeClient } from './GradeClient'

export const metadata = { title: 'ជ្រើសរើសថ្នាក់ | KruSmart' }

/**
 * Step 3 — grade (§9).
 *
 * The grades are read back from the rows step 2 seeded, filtered to the chosen
 * level, so §9's "do not show irrelevant grades" is enforced by the query
 * rather than by hiding options in the client.
 */
export default async function GradePage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>
}) {
  const { level } = await searchParams
  if (!level) redirect('/onboarding/level')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: levelRow }, { data: grades }] = await Promise.all([
    supabase.from('education_levels').select('id, name').eq('id', level).maybeSingle(),
    supabase
      .from('grades')
      .select('id, name, sort_order')
      .eq('education_level_id', level)
      .order('sort_order'),
  ])

  // An id that RLS hides, or a level from another school: send them back rather
  // than rendering an empty question.
  if (!levelRow) redirect('/onboarding/level')

  return <GradeClient levelName={levelRow.name} grades={grades ?? []} />
}
