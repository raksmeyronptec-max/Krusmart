'use client'

import Link from 'next/link'
import { CalendarCheck, CalendarRange, CalendarDays } from 'lucide-react'

import { useClassHref } from '@/lib/hooks/useClassHref'
import { otherAttendanceViews, type AttendanceViewId } from '@/lib/attendance/views'

/**
 * The lateral join between the three attendance screens.
 *
 * Renders the other two views as a quiet secondary row — never the one you are
 * on, and never as a primary action. On the register the primary action is
 * `មកទាំងអស់`; on the sheets it is `បោះពុម្ព`. This row is where you go
 * *afterwards*, so it is styled as a link chip and not as a button.
 *
 * `useClassHref` carries `?class=` across, so a teacher reviewing ៤ខ's month
 * returns to ៤ខ's register and not to their default class. Without it the
 * join would be worse than no join: the page would render, the numbers would
 * be real, and they would be another class's.
 *
 * `print:hidden` — this is screen chrome, and the A4 sheets it sits above
 * print their own letterhead.
 */
const ICONS: Record<AttendanceViewId, typeof CalendarCheck> = {
  register: CalendarCheck,
  monthly: CalendarDays,
  yearly: CalendarRange,
}

export function AttendanceViewNav({
  current,
  className = '',
}: {
  /** The screen rendering this. It is excluded from its own row. */
  current: AttendanceViewId
  className?: string
}) {
  const classHref = useClassHref()

  return (
    <nav aria-label="ទិដ្ឋភាពវត្តមាន" className={`flex flex-wrap items-center gap-2 print:hidden ${className}`}>
      {otherAttendanceViews(current).map((view) => {
        const Icon = ICONS[view.id]
        return (
          <Link
            key={view.id}
            href={classHref(view.href)}
            /*
             * The label is short enough to be a chip; the purpose is what a
             * screen reader announces, so "មើលប្រចាំខែ" is not heard bare.
             */
            aria-label={`${view.label} — ${view.purpose}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 text-[13px] font-bold text-text-body transition-colors hover:border-brand/60 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {view.label}
          </Link>
        )
      })}
    </nav>
  )
}

export default AttendanceViewNav
