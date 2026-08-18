import type { Metadata } from 'next'
import { ChooseLevelClient } from './ChooseLevelClient'

export const metadata: Metadata = { title: 'ជ្រើសរើសកម្រិតសិក្សា · KruSmart' }

/**
 * The first screen of the level-first onboarding journey — reached *before*
 * sign-in, so it is a public route (allow-listed in `lib/supabase/middleware`).
 *
 * Nothing is persisted here: there is no user yet. The choice rides to the
 * other side of Google OAuth in sessionStorage (`lib/onboarding/pendingLevel`)
 * and the level step of the signed-in wizard preselects from it. The signed-in
 * flow itself is unchanged — a teacher who never saw this screen loses nothing.
 */
export default function ChooseLevelPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-app px-4 py-8">
      <ChooseLevelClient />
    </main>
  )
}
