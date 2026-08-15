'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Settings } from 'lucide-react'
import { useParent } from './ParentContext'

/**
 * Fixed bottom navigation, matching the legacy portal: two destinations, the
 * active one tinted with the accent colour.
 *
 * `pb-safe` keeps it clear of the iOS home indicator.
 */
export function BottomNav() {
  const pathname = usePathname()
  const { t } = useParent()

  const items = [
    { href: '/parent/dashboard', icon: Home, label: t('nav_home') },
    { href: '/parent/settings', icon: Settings, label: t('nav_settings') },
  ]

  return (
    <nav
      aria-label={t('nav_home')}
      className="fixed bottom-0 left-0 z-40 w-full border-t px-6 pt-2 pb-safe backdrop-blur-lg"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--pp-bg-app) 95%, transparent)',
        borderColor: 'var(--pp-card-border)',
      }}
    >
      <div className="mx-auto flex max-w-md items-center justify-around">
        {items.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className="tap-target flex flex-1 flex-col items-center gap-1 rounded-xl py-1 outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500"
              style={{ color: active ? 'var(--pp-accent)' : 'var(--pp-text-muted)' }}
            >
              <item.icon className="h-6 w-6" aria-hidden="true" />
              <span className="text-[11px] font-semibold">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
