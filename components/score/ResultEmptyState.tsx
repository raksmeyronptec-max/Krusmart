'use client'

import Link from 'next/link'
import { ClipboardList } from 'lucide-react'

import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { useClassHref } from '@/lib/hooks/useClassHref'
import {
  RESULT_EMPTY_COPY,
  type ResultAvailability,
} from '@/lib/scores/resultAvailability'

/**
 * What a results screen shows when it has nothing to show.
 *
 * The presentation half of `lib/scores/resultAvailability.ts` — that module
 * decides WHICH state it is and what to say; this renders it. One component so
 * the seven results screens cannot drift into seven ways of saying "empty",
 * which is how `/ranking` came to say nothing at all while `/honor-roll` said
 * it in a toast that disappeared.
 *
 * Built on the shared `EmptyState`, not on a new card: that component is
 * already used on fifteen entry and management screens, and the results family
 * being the one group without it is exactly the gap this closes.
 *
 * The action carries the class, through `useClassHref` — a teacher told to go
 * and enter marks must land on the grid for the class they were just looking
 * at, not on their default one.
 */
export function ResultEmptyState({
  state,
  className = '',
}: {
  /** Never `'ready'` — a caller with a result renders the result. */
  state: Exclude<ResultAvailability, 'ready'>
  className?: string
}) {
  const classHref = useClassHref()
  const copy = RESULT_EMPTY_COPY[state]

  return (
    /*
      `role="status"`, so the reason reaches a screen reader when the screen
      changes under it — the results family carried no live region at all, so a
      teacher using one heard the sheet vanish and nothing take its place.
    */
    <div role="status" className={className}>
      <EmptyState
        icon={<ClipboardList className="h-6 w-6" aria-hidden="true" />}
        title={copy.title}
        description={copy.message}
        action={
          <Link
            href={classHref(copy.action.href)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-bold text-brand-contrast transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {copy.action.label}
          </Link>
        }
      />
    </div>
  )
}

export default ResultEmptyState
