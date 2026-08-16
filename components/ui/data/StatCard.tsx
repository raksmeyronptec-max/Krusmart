import Link from "next/link"
import type { LucideIcon } from "lucide-react"

/**
 * A single headline figure.
 *
 * The dashboard's job is to be read at a glance, so the number is the largest
 * thing in the card and everything else supports it. `tone` colours only the
 * icon chip — never the number itself, which stays on the heading colour so a
 * figure is legible regardless of what it means.
 */

export type StatTone = "brand" | "success" | "warning" | "danger" | "gold"

const TONES: Record<StatTone, string> = {
  brand: "bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-300",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  gold: "bg-gold/10 text-gold",
}

export interface StatCardProps {
  label: string
  /** Pre-formatted — the caller decides Khmer numerals, percentages, dashes. */
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: LucideIcon
  tone?: StatTone
  /** Makes the whole card a link to the surface it summarises. */
  href?: string
}

export function StatCard({ label, value, hint, icon: Icon, tone = "brand", href }: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-bold text-text-muted">{label}</p>
        {Icon && (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}>
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-text-heading tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </>
  )

  const shell =
    "rounded-xl border border-divider bg-bg-surface p-4 shadow-sm transition print:shadow-none"

  return href ? (
    <Link
      href={href}
      className={`${shell} block hover:border-brand-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring`}
    >
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  )
}

export default StatCard
