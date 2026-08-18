import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveAllAvailableRoles, homeRouteFor, resolveActor } from '@/lib/rbac/actor'
import { onboardingRedirect } from '@/lib/onboarding/state'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  
  // 'next' could be for password reset or a specific deep link.
  const next = searchParams.get('next')
  // `?role=` may be present on the callback URL, and is deliberately not read.
  // Which workspace a user lands in is resolved from their data by
  // `resolveActor`, never from the button they happened to click — see the
  // note on `targetRole` in `app/login/actions.ts`.

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      if (next) {
        return NextResponse.redirect(`${origin}${next}`)
      }

      // No specific 'next', so run the role-aware routing logic for OAuth users
      const actor = await resolveActor()
      if (!actor) {
        return NextResponse.redirect(`${origin}/login`)
      }

      // Setup outranks workspace choice — the same rule routeAfterLogin
      // applies to password sign-ins. Without this, a brand-new Google teacher
      // (the level-first journey's main path) landed on /dashboard only for
      // the (main) layout to bounce them; the callback is where §7 wants the
      // decision made once, deterministically.
      const setupRoute = onboardingRedirect(actor)
      if (setupRoute) {
        return NextResponse.redirect(`${origin}${setupRoute}`)
      }

      const availableRoles = await resolveAllAvailableRoles()
      
      if (availableRoles.length > 1) {
        return NextResponse.redirect(`${origin}/login/choose-workspace`)
      }

      if (availableRoles.length === 1) {
        const singleRole = availableRoles[0]
        if (singleRole === 'parent') return NextResponse.redirect(`${origin}/parent/dashboard`)
        if (singleRole === 'owner' || singleRole === 'admin') return NextResponse.redirect(`${origin}/admin`)
        return NextResponse.redirect(`${origin}/dashboard`)
      }

      return NextResponse.redirect(`${origin}${homeRouteFor(actor.kind)}`)
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth-callback-failed`)
}
