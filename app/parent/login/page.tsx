'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { GraduationCap, LogIn, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { t, type Lang } from '../i18n'

/**
 * Parent sign-in.
 *
 * Visually this is the legacy portal's login screen — full-bleed photo,
 * dark scrim, centred glass card, teal gradient button.
 *
 * The *credentials* differ deliberately. The legacy screen asked for a class
 * code plus a student ID, which is a shared secret: anyone holding the pair got
 * in as that family, and the pair is printed on cards handed to children. It is
 * also not implementable here without a service-role key, which this project
 * deliberately does not ship. Parents therefore sign in with their own Supabase
 * account, and `parent_students` decides which children they may see.
 */
export default function ParentLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  // The login screen renders before the provider, so it reads the language directly.
  const lang: Lang = 'km'
  const tr = (k: Parameters<typeof t>[1]) => t(lang, k)

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

      if (signInError) {
        setError(tr('login_error_default'))
        return
      }
      router.push('/parent/dashboard')
      router.refresh()
    })
  }

  return (
    <main
      className="parent-portal relative flex min-h-screen flex-col justify-center overflow-hidden bg-cover bg-center px-4 font-kantumruy"
      style={{
        backgroundImage:
          "url('https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=1080&auto=format&fit=crop')",
      }}
    >
      <div className="absolute inset-0 z-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative z-10 mx-auto w-full max-w-sm">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-header-green shadow-lg">
            <GraduationCap className="h-10 w-10 text-white" aria-hidden="true" />
          </div>
          <h1 className="kh-moul text-3xl text-white">{tr('auth_title')}</h1>
          <p className="mt-2 text-sm font-medium text-emerald-100/90">{tr('auth_subtitle')}</p>
        </header>

        <form
          onSubmit={handleLogin}
          className="space-y-4 rounded-3xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-md"
        >
          <div>
            <label htmlFor="pp-email" className="mb-1.5 block text-xs font-semibold text-emerald-100">
              {tr('email_label')}
            </label>
            <input
              id="pp-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={tr('email_placeholder')}
              className="tap-target w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-[16px] text-white outline-none transition placeholder:text-white/40 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30"
            />
          </div>

          <div>
            <label htmlFor="pp-password" className="mb-1.5 block text-xs font-semibold text-emerald-100">
              {tr('password_label')}
            </label>
            <input
              id="pp-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tr('password_placeholder')}
              className="tap-target w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-[16px] text-white outline-none transition placeholder:text-white/40 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30"
            />
          </div>

          {error && (
            <p role="alert" className="flex items-center gap-2 rounded-xl bg-red-500/20 p-3 text-sm font-bold text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="tap-target flex w-full items-center justify-center gap-2 rounded-xl bg-header-green py-3.5 font-bold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
            {pending ? tr('logging_in') : tr('login_btn')}
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-white/60">{tr('login_footer')}</p>
      </div>
    </main>
  )
}
