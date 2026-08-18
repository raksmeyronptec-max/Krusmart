import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LevelClient } from './LevelClient'

export const metadata = { title: 'ជ្រើសរើសកម្រិតសិក្សា | KruSmart' }

/**
 * Step 2 — education level (§8).
 *
 * Each step checks its own prerequisite rather than deferring to the layout,
 * which cannot redirect into its own tree without looping. Here that means: no
 * school, no level to attach one to.
 */
export default async function LevelPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.school_id) redirect('/onboarding/organisation')

  return <LevelClient />
}
