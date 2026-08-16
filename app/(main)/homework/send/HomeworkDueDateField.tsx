'use client'

import { AlertTriangle, CalendarClock } from 'lucide-react'
import { controlClass, fieldLabel, requiredMark } from '@/components/ui/forms/fieldStyles'
import { formatKhmerDate, toISODate } from '@/lib/utils/date'
import { khmerWeekday } from '@/lib/constants/weekdays'
import { isPastDate, parseDueDate } from './assignmentStatus'

/**
 * When the homework is due back.
 *
 * Two things the previous field did not do. It reads the chosen date back in
 * Khmer with its weekday, so a teacher can see they have picked a Sunday before
 * the parents do; and it says so when the date is already past instead of
 * accepting it silently. The warning does not block — a teacher recording work
 * that was due last week is doing something legitimate — but the composer asks
 * for confirmation before publishing it.
 *
 * The value is a bare `YYYY-MM-DD`, built and compared in local time. Anything
 * routed through `toISOString()` lands a day early west of Greenwich.
 */

export interface HomeworkDueDateFieldProps {
  value: string
  onChange: (value: string) => void
  id?: string
}

/** `n` days from today as `YYYY-MM-DD`, local. */
function offsetDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

const QUICK_DATES = [
  { label: 'ថ្ងៃនេះ', days: 0 },
  { label: 'ស្អែក', days: 1 },
  { label: 'សប្តាហ៍ក្រោយ', days: 7 },
]

export function HomeworkDueDateField({
  value,
  onChange,
  id = 'hw-due-date',
}: HomeworkDueDateFieldProps) {
  const parsed = parseDueDate(value)
  const past = value ? isPastDate(value) : false
  const describedBy = past ? `${id}-warning` : `${id}-summary`

  return (
    <div>
      <label className={fieldLabel} htmlFor={id}>
        ថ្ងៃផុតកំណត់ប្រគល់ <span className={requiredMark}>*</span>
      </label>

      <input
        id={id}
        type="date"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedBy}
        className={controlClass(past, past ? 'border-warning' : '')}
      />

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {QUICK_DATES.map((q) => {
          const target = offsetDate(q.days)
          const active = value === target
          return (
            <button
              key={q.label}
              type="button"
              onClick={() => onChange(target)}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1 text-[11px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                active
                  ? 'border-brand bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300'
                  : 'border-divider text-text-muted hover:border-brand-400 hover:text-brand'
              }`}
            >
              {q.label}
            </button>
          )
        })}
      </div>

      {past ? (
        <p
          id={`${id}-warning`}
          role="alert"
          className="mt-1.5 flex items-start gap-1.5 text-xs font-bold text-warning"
        >
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ថ្ងៃនេះកន្លងផុតទៅហើយ។ កិច្ចការនឹងបង្ហាញជា «ហួសកំណត់» ភ្លាមៗ។
        </p>
      ) : (
        <p id={`${id}-summary`} className="mt-1.5 flex items-center gap-1.5 text-xs text-text-muted">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {parsed ? (
            <>
              {khmerWeekday(parsed)} · {formatKhmerDate(value)}
            </>
          ) : (
            'សូមជ្រើសរើសថ្ងៃផុតកំណត់'
          )}
        </p>
      )}
    </div>
  )
}

export default HomeworkDueDateField
