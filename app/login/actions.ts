'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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

  redirect('/dashboard')
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

  // Once verified, typically Supabase signs the user in.
  // We can redirect them to the dashboard.
  redirect('/dashboard')
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
