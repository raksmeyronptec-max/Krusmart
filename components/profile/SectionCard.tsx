'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

export interface SectionCardProps {
  /** Anchor id, so the mobile section nav can jump here. */
  id?: string
  title: string
  icon?: React.ReactNode
  /** Filled/total shown as a `៦/៩` badge; full sections turn green. */
  completion?: { filled: number; total: number }
  /** Collapsed-by-default for long, rarely edited blocks (civil servant). */
  collapsible?: boolean
  defaultOpen?: boolean
  children: React.ReactNode
}

/**
 * Card frame for one profile section: title row, completion badge, optional
 * disclosure. One component so every section reads identically and the badge
 * can never disagree with the field list that computed it.
 */
export default function SectionCard({
  id,
  title,
  icon,
  completion,
  collapsible = false,
  defaultOpen = true,
  children,
}: SectionCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()
  const complete = completion && completion.filled >= completion.total

  const badge = completion && (
    <span
      lang="km"
      className={`ml-auto inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${
        complete
          ? 'border-success/30 bg-success/10 text-success'
          : 'border-divider bg-paper text-text-muted'
      }`}
    >
      {toKhmerNumber(completion.filled)}/{toKhmerNumber(completion.total)}
    </span>
  )

  const header = (
    <>
      {icon && <span className="rounded-lg bg-brand-100 p-2 text-brand">{icon}</span>}
      <h3 lang="km" className="kh-moul text-base leading-[1.9] text-text-heading sm:text-lg">
        {title}
      </h3>
      {badge}
    </>
  )

  return (
    <section
      id={id}
      aria-label={title}
      className="scroll-mt-24 rounded-xl border border-divider bg-bg-surface shadow-sm"
    >
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
          className="tap-target flex w-full cursor-pointer items-center gap-2.5 rounded-xl p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:p-6"
        >
          {header}
          <ChevronDown
            aria-hidden
            className={`h-5 w-5 shrink-0 text-text-muted transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          />
        </button>
      ) : (
        <div className="flex items-center gap-2.5 p-5 pb-0 md:p-6 md:pb-0">{header}</div>
      )}

      <div id={bodyId} hidden={collapsible && !open} className="p-5 pt-4 md:p-6 md:pt-4">
        {children}
      </div>
    </section>
  )
}
