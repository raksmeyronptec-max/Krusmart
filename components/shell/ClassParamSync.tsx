'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

import { useTeacherContext } from '@/lib/context/TeacherContext'
import { CLASS_PARAM } from '@/lib/utils/scopeParam'

/**
 * Makes `?class=` flow back into the client's idea of the active class.
 *
 * The selection has always had two halves — `TeacherContext` for the client,
 * `?class=` for the server — but only one direction was wired:
 * `useSelectActiveClass` wrote both, and nothing read the URL back. So every
 * way into a class that did *not* go through the switcher arrived desynced:
 *
 *   a bookmark of `/score/enter?class=<៥ខ>`
 *   a link shared between two teachers
 *   `/classroom`'s per-class បញ្ជីសិស្ស · បញ្ចូលសិស្ស · មុខវិជ្ជា tools
 *   `/classroom/classes` and `/score/template`, which preserve the parameter
 *   across their redirects precisely so it would be honoured
 *
 * In every one of those the server rendered the requested class and the top-bar
 * chip named the *default* one. The data was right and the label was wrong,
 * which is the worse of the two failures: a teacher acts on the label.
 *
 * ── Why a component and not a line in the provider ─────────────────────────
 *
 * `useSearchParams` opts its tree into client rendering and Next.js refuses to
 * prerender a component containing one without a Suspense boundary. Putting it
 * in `TeacherContextProvider` would push that requirement onto the whole
 * `(main)` layout and therefore onto all ~30 features. Isolated here, the
 * boundary is three lines and costs the app nothing — the same reason
 * `ClassContextSwitcher` carries its own.
 *
 * Renders nothing. It is a wire, not a control.
 */
function ClassParamSyncInner() {
  const searchParams = useSearchParams()
  const teacher = useTeacherContext()

  const requested = searchParams.get(CLASS_PARAM)
  const sync = teacher?.syncFromClassId
  // Assignments arrive async; until they do there is nothing to match the id
  // against, so the effect has to re-run when they land rather than only on
  // the first navigation.
  const ready = teacher?.assignments.length ?? 0

  useEffect(() => {
    if (!sync || ready === 0) return
    sync(requested)
  }, [sync, requested, ready])

  return null
}

export function ClassParamSync() {
  return (
    <Suspense fallback={null}>
      <ClassParamSyncInner />
    </Suspense>
  )
}

export default ClassParamSync
