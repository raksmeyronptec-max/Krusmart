import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PosterSplitterClient from './PosterSplitterClient'

export const metadata = { title: 'បំបែកសន្លឹក Poster' }

export default async function PosterSplitterPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // No data to fetch: the image never leaves the browser.
    return <PosterSplitterClient />
}
