'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { resolveActor, homeRouteFor } from '@/lib/rbac/actor'

export async function loginWithEmail(email: string, password?: string) {
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

  // A parent signing in through the teacher login form still belongs in the
  // portal, not on the teacher dashboard.
  const actor = await resolveActor()
  redirect(homeRouteFor(actor?.kind ?? 'teacher'))
}

export async function registerWithEmail(email: string, password?: string) {
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
      // The user is already logged in (Confirm Email is OFF)
      return { success: true, verified: true }
  }

  return { success: true, verified: false, message: 'សូមពិនិត្យ Email របស់អ្នកដើម្បីយកលេខកូដមកផ្ទៀងផ្ទាត់។' }
}

export async function verifySignupOtp(email: string, token: string) {
  const supabase = await createClient()

  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'signup',
  })

  if (error) {
    return { error: error.message }
  }

  // Once verified, Supabase signs the user in; send them to their own app.
  const actor = await resolveActor()
  redirect(homeRouteFor(actor?.kind ?? 'teacher'))
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
