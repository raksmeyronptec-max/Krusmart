import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveAllAvailableRoles, homeRouteFor, resolveActor } from '@/lib/rbac/actor'
import { type LoginRole } from '@/lib/auth/role-config'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  
  // 'next' could be for password reset or a specific deep link.
  const next = searchParams.get('next')
  // 'role' could be passed from the OAuth login button
  const targetRole = searchParams.get('role') as LoginRole | null

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
