'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useParent } from './ParentContext'
import type { TranslationKey } from './i18n'

/**
 * Teal gradient header used by every inner portal page, matching the legacy
 * pages' `bg-header-green` band with a rounded bottom.
 */
export function PortalHeader({
  titleKey,
  subtitle,
  backHref = '/parent/dashboard',
}: {
  titleKey: TranslationKey
  subtitle?: string
  backHref?: string
}) {
  const { t } = useParent()

  return (
    <header className="relative z-20 rounded-b-[2rem] bg-header-green px-6 pb-6 pt-safe shadow-md">
      <div className="flex items-center gap-3 pt-2">
        <Link
          href={backHref}
          aria-label={t('back')}
          className="tap-target flex items-center justify-center rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="kh-moul text-lg text-white">{t(titleKey)}</h1>
          {subtitle && <p className="text-xs font-medium text-pp/90">{subtitle}</p>}
        </div>
      </div>
    </header>
  )
}

/** Shared empty state — also the "coming soon" badge for health and library. */
export function EmptyState({
  messageKey,
  descriptionKey,
  icon,
}: {
  messageKey: TranslationKey
  descriptionKey?: TranslationKey
  icon?: React.ReactNode
}) {
  const { t } = useParent()
  return (
    <div className="mx-4 mt-8 rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: 'var(--pp-card-border)' }}>
      {icon && <div className="mb-3 flex justify-center opacity-40">{icon}</div>}
      <p className="font-bold text-pp">{t(messageKey)}</p>
      {descriptionKey && <p className="mt-1 text-sm text-pp-muted">{t(descriptionKey)}</p>}
    </div>
  )
}

/** Label/value row used by the profile, family and card screens. */
export function InfoRow({ label, value }: { label: string; value?: string | null }) {
  const { t } = useParent()
  return (
    <div className="flex items-start justify-between gap-4 border-b py-3 last:border-0" style={{ borderColor: 'var(--pp-card-border)' }}>
      <span className="shrink-0 text-sm text-pp-muted">{label}</span>
      <span className="text-right text-sm font-semibold text-pp">
        {value?.trim() ? value : <span className="opacity-40">{t('not_set')}</span>}
      </span>
    </div>
  )
}
