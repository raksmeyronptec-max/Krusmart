'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { resolveActor, resolveAllAvailableRoles, homeRouteFor } from '@/lib/rbac/actor'
import { onboardingRedirect } from '@/lib/onboarding/state'
import { type LoginRole } from '@/lib/auth/role-config'

/**
 * Where to send someone once they are signed in.
 *
 * `targetRole` is threaded in from the per-role login screens and then
 * deliberately ignored: those screens are presentation only — same credentials,
 * same roles — and the destination is resolved from the account's actual data
 * by `resolveActor`. Honouring the parameter would let the choice of login page
 * decide which workspace you reach, which is exactly the bug that let a parent
 * land on the teacher dashboard.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept in the signature so call sites stay honest about what they pass; see above
async function routeAfterLogin(targetRole?: LoginRole): Promise<string> {
  const actor = await resolveActor()
  if (!actor) return '/login'

  // Setup outranks workspace choice. A teacher who has not finished onboarding
  // has exactly one place to be, and `choose-workspace` would offer them a
  // teacher workspace that renders empty pages.
  const setupRoute = onboardingRedirect(actor)
  if (setupRoute) return setupRoute

  const availableRoles = await resolveAllAvailableRoles()

  // Rule: If > 1 workspace exists, redirect to `/login/choose-workspace`
  if (availableRoles.length > 1) {
    return `/login/choose-workspace`
  }

  // Rule: If 0 roles match or exactly 1 workspace exists
  if (availableRoles.length === 1) {
    const singleRole = availableRoles[0]
    
    // If they asked for a role but they only have one, and it's not the one they asked for,
    // we still route them to their single permitted workspace.
    // If they asked for 'parent', and their single role is 'parent', great.
    
    // Convert LoginRole to ActorKind where possible to use homeRouteFor
    if (singleRole === 'parent') return '/parent/dashboard'
    if (singleRole === 'owner' || singleRole === 'admin') return '/admin'
    return '/dashboard'
  }

  // Fallback if absolutely no roles (should be caught by legacy fallback in resolveAllAvailableRoles, but just in case)
  return homeRouteFor(actor.kind)
}

export async function loginWithEmail(email: string, password?: string, targetRole?: LoginRole) {
  const supabase = await createClient()
  
  if (!password) {
      return { error: 'សូមបញ្ចូលពាក្យសម្ងាត់!' }
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    return { error: error.message }
  }

  const targetRoute = await routeAfterLogin(targetRole)
  redirect(targetRoute)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `targetRole` is accepted for call-site symmetry and ignored; see routeAfterLogin
export async function registerWithEmail(email: string, password?: string, targetRole?: LoginRole) {
  const supabase = await createClient()
  
  if (!password) {
      return { error: 'សូមបញ្ចូលពាក្យសម្ងាត់!' }
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password
  })

  if (error) {
    return { error: error.message }
  }

  if (data?.session) {
      return { success: true, verified: true }
  }

  return { success: true, verified: false, message: 'សូមពិនិត្យ Email របស់អ្នកដើម្បីយកលេខកូដមកផ្ទៀងផ្ទាត់។' }
}

export async function verifySignupOtp(email: string, token: string, targetRole?: LoginRole) {
  const supabase = await createClient()

  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'signup',
  })

  if (error) {
    return { error: error.message }
  }

  const targetRoute = await routeAfterLogin(targetRole)
  redirect(targetRoute)
}

export async function resendOtp(email: string) {
  const supabase = await createClient()

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true, message: 'លេខកូដថ្មីត្រូវបានផ្ញើ! សូមពិនិត្យមើល Email របស់អ្នក។' }
}

export async function requestPasswordReset(email: string) {
  const supabase = await createClient()
  // Ensure the reset URL points back to our internal update-password route
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback?next=/login/update-password`,
  })

  if (error) {
    return { error: error.message }
  }
  return { success: true }
}

export async function updatePassword(password: string) {
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({
    password
  })

  if (error) {
    return { error: error.message }
  }

  const targetRoute = await routeAfterLogin()
  redirect(targetRoute)
}
