import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { resolveActor } from '@/lib/rbac/actor'
import { OnboardingRail } from '@/components/onboarding/OnboardingRail'

export const metadata = { title: 'រៀបចំថ្នាក់រៀន | KruSmart' }

/**
 * Shell for first-time setup.
 *
 * Deliberately outside `(main)`: that layout mounts `AppShell`, whose sidebar
 * links to ~26 features that all need a roster. Showing a teacher a full
 * navigation tree over pages that cannot render is worse than showing them one
 * question at a time, so this tree has no sidebar, no top nav and no class
 * switcher — only the rail and a way out.
 *
 * The guard here only handles people who do not belong in onboarding at all. It
 * deliberately does *not* re-run `onboardingRedirect`: that function returns a
 * route inside this tree, so redirecting to it from the tree's own layout would
 * loop. Each step page checks its own prerequisite instead.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const actor = await resolveActor()

  if (!actor) redirect('/login')
  if (actor.kind === 'parent') redirect('/parent/dashboard')
  if (actor.kind === 'admin') redirect('/admin')
  // Setup is finished the moment a class is assigned.
  if (actor.hasAssignments) redirect('/dashboard')

  return (
    <main className="flex min-h-screen flex-col bg-bg-app">
      <header className="border-b border-divider bg-bg-surface">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="KruSmart" className="h-8 w-auto object-contain" />
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-text-muted transition-colors hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            ចាកចេញ
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
        <div className="mb-7">
          <OnboardingRail />
        </div>
        {children}
      </div>
    </main>
  )
}
