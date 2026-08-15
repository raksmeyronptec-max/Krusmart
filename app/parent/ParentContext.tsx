'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { PARENT_LANG_KEY, t as translate, type Lang, type TranslationKey } from './i18n'

const THEME_KEY = 'krusmart_parent_theme'

interface ParentContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TranslationKey) => string
  dark: boolean
  setDark: (d: boolean) => void
}

const Ctx = createContext<ParentContextValue | null>(null)

/**
 * Language + theme for the portal, mirroring the legacy app's two settings.
 *
 * Both persist to localStorage because they are device preferences, not account
 * data — the legacy portal behaved the same way. Reads happen after mount to
 * avoid a hydration mismatch, so the first paint is always the Khmer/dark
 * default the majority of users get.
 */
export function ParentProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('km')
  const [dark, setDarkState] = useState(true)

  useEffect(() => {
    const storedLang = window.localStorage.getItem(PARENT_LANG_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is unavailable during SSR, so device preferences can only be restored after mount
    if (storedLang === 'km' || storedLang === 'en') setLangState(storedLang)
    const storedTheme = window.localStorage.getItem(THEME_KEY)
    if (storedTheme === 'light') setDarkState(false)
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    window.localStorage.setItem(PARENT_LANG_KEY, l)
  }, [])

  const setDark = useCallback((d: boolean) => {
    setDarkState(d)
    window.localStorage.setItem(THEME_KEY, d ? 'dark' : 'light')
  }, [])

  const value = useMemo<ParentContextValue>(
    () => ({ lang, setLang, dark, setDark, t: (key) => translate(lang, key) }),
    [lang, setLang, dark, setDark],
  )

  return (
    <div className={`parent-portal ${dark ? '' : 'pp-light'} min-h-screen font-kantumruy`}>
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
    </div>
  )
}

export function useParent(): ParentContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useParent must be used inside ParentProvider')
  return ctx
}
