import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveActor } from '@/lib/rbac/actor'
import { ParentProvider } from '../ParentContext'
import { BottomNav } from '../BottomNav'

/**
 * Portal shell.
 *
 * Closes AUDIT.md G-4: the previous portal authenticated nobody — `parent-login`
 * waited a second and redirected. Access now requires a real Supabase session,
 * checked on the server before any child renders, and every read underneath is
 * additionally scoped by RLS to the caller's own children.
 *
 * `/parent/login` lives outside this route group precisely so it is NOT wrapped
 * by this guard — nesting it here made the layout redirect the login page to
 * itself, an infinite loop.
 */
export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/parent/login')

  // The mirror of the guard in `app/(main)/layout.tsx`: an account with no
  // parent link has no children to show, so the portal would render an empty
  // shell. Send them to the app they belong to instead.
  const actor = await resolveActor()
  if (actor && actor.kind !== 'parent') redirect('/dashboard')

  return (
    <ParentProvider>
      <div className="flex min-h-screen flex-col pb-24">{children}</div>
      <BottomNav />
    </ParentProvider>
  )
}
