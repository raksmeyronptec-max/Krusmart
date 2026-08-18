'use client'

import { Suspense, useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { LayoutGrid } from 'lucide-react'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import { useActiveClass } from '@/lib/hooks/useActiveClass'
import { CLASS_PARAM } from '@/lib/utils/scopeParam'
import type { TeacherAssignmentDetail } from '@/lib/types'

/** `២០២៥-២០២៦ › ១ក › គណិតវិទ្យា` */
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
 *   - one assignment  → a static chip. Deliberately *not* dressed as a control:
 *                       a caret that opens a menu with one item in it is a lie,
 *                       and the previous chip's problem was precisely that it
 *                       looked like something it was not. It is labelled instead,
 *                       so it reads as the context it is.
 *   - many            → `SearchableSelect`, which already carries everything an
 *                       explicit control owes the user: a visible caret,
 *                       `aria-haspopup="listbox"`, a live `aria-expanded`,
 *                       arrow-key and Home/End traversal, Escape-to-close with
 *                       focus returned to the trigger, and a filter field for a
 *                       teacher carrying eight classes. Hand-rolling a second
 *                       dropdown here would be a worse copy of it.
 *
 * Selection lives in `TeacherContext`, never `localStorage`, so two tabs cannot
 * disagree about which class is being edited.
 */
function ClassContextSwitcherInner({
  compact = false,
  frameClassName = '',
}: {
  compact?: boolean
  frameClassName?: string
}) {
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
   * data while the switcher claimed otherwise. Every other param is carried
   * across — a deep link into a filtered, paged report must survive a class
   * change, and `resolveServerScope` re-validates the id against the caller's
   * own assignments regardless of what the URL says.
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
      <div className={frameClassName}>
        <div
          className={`flex min-w-0 items-center gap-2 rounded-lg border border-divider bg-paper px-2.5 py-1 ${
            compact ? 'text-[11px]' : 'text-xs'
          }`}
          title={describe(assignment)}
        >
          <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
          <span className="shrink-0 text-text-body">ថ្នាក់បច្ចុប្បន្ន</span>
          <span className="kh-truncate font-bold text-text-heading">
            {describe(assignment)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={`${frameClassName} ${compact ? 'w-full' : 'w-[300px]'}`}>
      <SearchableSelect
        ariaLabel="ជ្រើសរើសថ្នាក់ និងមុខវិជ្ជា"
        searchPlaceholder="ស្វែងរកថ្នាក់..."
        emptyMessage="រកមិនឃើញថ្នាក់"
        leadingIcon={<LayoutGrid className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />}
        value={assignment.id}
        onChange={handleChange}
        className="h-9 rounded-lg px-2.5 text-xs font-bold"
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
export function ClassContextSwitcher({
  compact = false,
  frameClassName = '',
}: {
  compact?: boolean
  /**
   * Applied to the switcher's own root, and therefore only when it renders
   * something. A pre-V2 account would otherwise leave the caller's wrapper
   * behind as an empty bordered strip.
   */
  frameClassName?: string
}) {
  return (
    <Suspense fallback={null}>
      <ClassContextSwitcherInner compact={compact} frameClassName={frameClassName} />
    </Suspense>
  )
}
