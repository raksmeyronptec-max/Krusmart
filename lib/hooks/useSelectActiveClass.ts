'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useActiveClass } from './useActiveClass'
import { CLASS_PARAM } from '@/lib/utils/scopeParam'

/**
 * Switch the class a teacher is working in.
 *
 * Extracted from `ClassContextSwitcher`, which was the only caller until
 * `/classroom` gained a per-class "set as active" button. Both write
 * the *same* two places, and that is the point — the failure this avoids is two
 * surfaces disagreeing about which class is selected, which is what a second
 * switcher with its own state would produce.
 *
 * Two writes, both necessary:
 *
 *   `setAssignmentId`  updates `TeacherContext`, which every client component
 *                      reads. It is React state, never `localStorage`, so two
 *                      tabs cannot disagree about which class is being edited.
 *   `?class=`          updates the URL, which every *server* component reads
 *                      through `resolveServerScope`. Without it the page would
 *                      keep rendering the previous class's data while the UI
 *                      claimed otherwise.
 *
 * Every other query parameter is carried across: a deep link into a filtered,
 * paged report must survive a class change. Nothing here is trusted —
 * `resolveServerScope` re-validates the id against the caller's own assignments
 * whatever the URL says.
 */
export function useSelectActiveClass(): (assignmentId: string) => void {
  const { assignments, setAssignmentId } = useActiveClass()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return useCallback(
    (assignmentId: string) => {
      setAssignmentId(assignmentId)

      const target = assignments.find((a) => a.id === assignmentId)
      if (!target) return

      const params = new URLSearchParams(searchParams.toString())
      params.set(CLASS_PARAM, target.class_id)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [assignments, pathname, router, searchParams, setAssignmentId],
  )
}
