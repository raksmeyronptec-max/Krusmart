import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InventoryClient from './InventoryClient'

export default async function InventoryPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch settings
  let { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('teacher_id', user.id)
    .single()

  return (
    <InventoryClient settings={settings || {}} />
  )
}
