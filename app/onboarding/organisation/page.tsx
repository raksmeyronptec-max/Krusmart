import { createClient } from '@/lib/supabase/server'
import { OrganisationClient } from './OrganisationClient'

export const metadata = { title: 'ជ្រើសរើសស្ថាប័ន | KruSmart' }

/**
 * Step 1 — the organisation (§7).
 *
 * Loads any school the teacher already belongs to so the screen can offer it
 * back instead of asking them to create a second one. §7 is explicit about
 * this: "Do not force teachers to recreate organisations."
 */
export default async function OrganisationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let existing: { id: string; name: string } | null = null

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.school_id) {
      const { data: school } = await supabase
        .from('schools')
        .select('id, name')
        .eq('id', profile.school_id)
        .maybeSingle()
      existing = school ?? null
    }
  }

  return <OrganisationClient existing={existing} />
}
