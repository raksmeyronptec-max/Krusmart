import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import ScoreCollectClient from './ScoreCollectClient'

export const metadata = { title: 'ការប្រមូលពិន្ទុ' }

/**
 * ការប្រមូលពិន្ទុ — the homeroom teacher's completion view.
 *
 * Everything is resolved in the client through the shared actions, which key
 * off the caller's own assignments; the page only guards the session. The
 * period pickers live in `useSearchParams`, hence the boundary.
 */
export default async function ScoreCollectPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <Suspense>
      <ScoreCollectClient />
    </Suspense>
  )
}
