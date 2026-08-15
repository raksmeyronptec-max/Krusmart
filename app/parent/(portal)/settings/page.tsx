'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Moon, Sun, Languages, LogOut, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useParent } from '../../ParentContext'

/** Settings: theme and language, matching the legacy portal's two preferences. */
export default function ParentSettingsPage() {
  const { t, lang, setLang, dark, setDark } = useParent()
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const signOut = () => {
    startTransition(async () => {
      await createClient().auth.signOut()
      router.push('/parent/login')
      router.refresh()
    })
  }

  return (
    <>
      <header className="relative z-20 rounded-b-[2rem] bg-header-green px-6 pb-6 pt-safe shadow-md">
        <h1 className="kh-moul mb-2 mt-4 text-2xl text-white">{t('settings_title')}</h1>
      </header>

      <section className="space-y-4 px-4 py-6">
        <div className="rounded-2xl border bg-card-dark p-4" style={{ borderColor: 'var(--pp-card-border)' }}>
          <h2 className="mb-3 text-sm font-bold text-pp-muted">{t('preferences')}</h2>

          <button
            onClick={() => setDark(!dark)}
            className="tap-target flex w-full items-center justify-between rounded-xl px-1 py-3"
          >
            <span className="flex items-center gap-3">
              {dark ? <Moon className="h-5 w-5 text-indigo-400" /> : <Sun className="h-5 w-5 text-amber-400" />}
              <span className="text-left">
                <span className="block text-sm font-semibold text-pp">{t('theme')}</span>
                <span className="block text-xs text-pp-muted">
                  {dark ? t('dark_mode_active') : t('light_mode_active')}
                </span>
              </span>
            </span>
            <span
              className="relative h-6 w-11 rounded-full transition"
              style={{ backgroundColor: dark ? 'var(--pp-accent)' : 'var(--pp-card-border)' }}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${dark ? 'left-[22px]' : 'left-0.5'}`} />
            </span>
          </button>

          <div className="flex items-center justify-between border-t px-1 py-3" style={{ borderColor: 'var(--pp-card-border)' }}>
            <span className="flex items-center gap-3">
              <Languages className="h-5 w-5 text-emerald-400" />
              <span className="text-sm font-semibold text-pp">{t('language_label')}</span>
            </span>
            <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: 'var(--pp-card-border)' }}>
              {(['km', 'en'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className="rounded-lg px-3 py-1.5 text-xs font-bold transition"
                  style={lang === l ? { background: 'var(--pp-accent)', color: '#fff' } : { color: 'var(--pp-text-muted)' }}
                >
                  {l === 'km' ? 'ខ្មែរ' : 'EN'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card-dark p-4" style={{ borderColor: 'var(--pp-card-border)' }}>
          <h2 className="mb-3 text-sm font-bold text-pp-muted">{t('account_info')}</h2>
          <p className="mb-3 text-xs text-pp-muted">{t('logout_desc')}</p>
          <button
            onClick={signOut}
            disabled={pending}
            className="tap-target flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold text-white transition disabled:opacity-60"
            style={{ backgroundColor: 'var(--pp-danger)' }}
          >
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
            {t('logout_btn')}
          </button>
        </div>
      </section>
    </>
  )
}
