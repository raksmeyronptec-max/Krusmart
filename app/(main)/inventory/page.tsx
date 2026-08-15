import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InventoryClient from './InventoryClient'
import { listInventoryItems } from './actions'
import type { Settings } from '@/lib/types'

export default async function InventoryPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // The list is Supabase-backed since migration 00012; it used to be read from
    // `localStorage` after mount, which meant the printable sheet only existed on
    // the device that typed it.
    const [{ data: settings }, initialItems] = await Promise.all([
        supabase.from('settings').select('*').eq('teacher_id', user.id).maybeSingle(),
        listInventoryItems(),
    ])

    return <InventoryClient settings={(settings as Settings) ?? null} initialItems={initialItems} />
}
