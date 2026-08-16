'use client'

import { CalendarCheck, TableProperties } from 'lucide-react'

/**
 * Daily entry versus monthly review.
 *
 * Daily is the default and is listed first: it is the workflow a teacher runs
 * every day, and monthly is the one they run to check it. Switching costs
 * nothing — both modes read the same loaded period, so no mark is discarded by
 * moving between them and no confirmation is needed.
 */

export type HomeworkMode = 'daily' | 'monthly'

const MODES: { id: HomeworkMode; label: string; hint: string; icon: typeof CalendarCheck }[] = [
  { id: 'daily', label: 'បញ្ចូលប្រចាំថ្ងៃ', hint: 'បញ្ចូលពិន្ទុមួយថ្ងៃម្តង', icon: CalendarCheck },
  { id: 'monthly', label: 'ពិនិត្យប្រចាំខែ', hint: 'ពិនិត្យ និងកែពិន្ទុពេញវដ្ត', icon: TableProperties },
]

export function HomeworkModeToggle({
  mode,
  onChange,
}: {
  mode: HomeworkMode
  onChange: (mode: HomeworkMode) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="របៀបបញ្ចូលពិន្ទុ"
      className="inline-flex w-full gap-1 rounded-xl bg-paper p-1 sm:w-auto"
    >
      {MODES.map(({ id, label, hint, icon: Icon }) => {
        const active = mode === id
        return (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={active}
            title={hint}
            onClick={() => onChange(id)}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
              active
                ? 'bg-brand text-brand-contrast shadow-md'
                : 'text-text-muted hover:text-brand'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}

export default HomeworkModeToggle
