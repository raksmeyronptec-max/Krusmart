'use client'

import { Suspense, useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, ChevronRight, LayoutGrid, BookOpen } from 'lucide-react'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import { useActiveClass } from '@/lib/hooks/useActiveClass'
import { CLASS_PARAM } from '@/lib/utils/scopeParam'
import type { TeacherAssignmentDetail } from '@/lib/types'

/** `ឆ្នាំសិក្សា ២០២៥-២០២៦ › ១ក › គណិតវិទ្យា` */
function describe(a: TeacherAssignmentDetail): string {
  const parts = [a.academic_year_name, a.class_name]
  if (a.subject_name) parts.push(a.subject_name)
  return parts.filter(Boolean).join(' › ')
}

/**
 * Shows which class (and subject) the teacher is working in, and lets them
 * switch when they have more than one assignment.
 *
 * Three states, by design:
 *   - no assignments  → renders nothing. A pre-V2 account keeps the exact UI it
 *                       had; the feature pages fall back to `teacher_id` scoping.
 *   - one assignment  → a static label. No dropdown to dismiss, no click needed.
 *   - many            → a `SearchableSelect`, reusing the shared component.
 *
 * Selection lives in `TeacherContext`, never `localStorage`, so two tabs cannot
 * disagree about which class is being edited.
 */
function ClassContextSwitcherInner({ compact = false }: { compact?: boolean }) {
  const { assignments, assignment, setAssignmentId, hasMultiple, isLegacy, loading } =
    useActiveClass()

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  /**
   * Update the context *and* the URL.
   *
   * The URL half matters: server components read `?class=` to decide what to
   * fetch, so without it the page would keep rendering the previous class's
   * data while the switcher claimed otherwise.
   */
  const handleChange = useCallback(
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

  // Nothing to show for a legacy account, and nothing to flash while loading.
  if (loading || isLegacy || !assignment) return null

  if (!hasMultiple) {
    return (
      <div
        className={`flex items-center gap-1.5 rounded-full border border-divider bg-brand-100 px-3 py-1.5 text-brand-800 dark:border-divider dark:bg-bg-surface dark:text-brand-300 ${
          compact ? 'text-[11px]' : 'text-xs'
        }`}
        title={describe(assignment)}
      >
        <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="font-medium">{assignment.academic_year_name}</span>
        <ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
        <LayoutGrid className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="font-bold">{assignment.class_name}</span>
        {assignment.subject_name && (
          <>
            <ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
            <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="font-medium">{assignment.subject_name}</span>
          </>
        )}
      </div>
    )
  }

  return (
    <div className={compact ? 'w-full' : 'w-[280px]'}>
      <SearchableSelect
        ariaLabel="ជ្រើសរើសថ្នាក់ និងមុខវិជ្ជា"
        searchPlaceholder="ស្វែងរកថ្នាក់..."
        emptyMessage="រកមិនឃើញថ្នាក់"
        leadingIcon={<LayoutGrid className="h-4 w-4 text-brand" aria-hidden="true" />}
        value={assignment.id}
        onChange={handleChange}
        options={assignments.map((a) => ({
          value: a.id,
          label: describe(a),
          group: a.academic_year_name,
        }))}
      />
    </div>
  )
}

/**
 * `useSearchParams` opts a component into client-side rendering, and Next.js
 * refuses to prerender a page containing one without a Suspense boundary.
 * Because this switcher is rendered by `TopNav` in the (main) layout, that
 * requirement propagates to every page in the teacher app — so the boundary
 * lives here rather than at each of the ~26 call sites.
 *
 * The fallback is deliberately empty: the switcher already renders nothing for a
 * pre-V2 account, so a blank frame is the correct transient state.
 */
export function ClassContextSwitcher({ compact = false }: { compact?: boolean }) {
  return (
    <Suspense fallback={null}>
      <ClassContextSwitcherInner compact={compact} />
    </Suspense>
  )
}
