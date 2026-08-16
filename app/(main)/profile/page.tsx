import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileClient from './ProfileClient'

export const metadata = { title: 'ព័ត៌មានគណនី' }

export default async function ProfilePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // `maybeSingle`, not `single`: a teacher who has never opened this page has no
  // `settings` row at all, and `single()` treats that as PGRST116 — an error
  // object plus null data — rather than as the ordinary empty case it is.
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('teacher_id', user.id)
    .maybeSingle()

  return <ProfileClient initialSettings={settings ?? null} />
}
