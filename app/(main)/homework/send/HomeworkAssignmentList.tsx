'use client'

import { useMemo } from 'react'
import { FilePlus2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { Button } from '@/components/ui/actions/Button'
import { Skeleton } from '@/components/ui/feedback/Skeleton'
import { AssignmentGroupHeading, HomeworkAssignmentCard } from './HomeworkAssignmentCard'
import { BUCKET_LABELS, BUCKET_ORDER, dueInfo, parseDueDate, type DueBucket } from './assignmentStatus'
import type { HomeworkAssignment } from '@/lib/types'

/**
 * The teacher's published homework, grouped by what needs attention.
 *
 * Order is `today → upcoming → overdue`: the first two are what a teacher is
 * about to be asked about, and the third is history they occasionally correct.
 * Within a group, today and upcoming run soonest-first while overdue runs
 * most-recent-first — in both cases, nearest to now at the top.
 *
 * Groups with nothing in them are not drawn. An empty group heading reads as a
 * loading failure.
 */

export interface HomeworkAssignmentListProps {
  assignments: HomeworkAssignment[]
  loading: boolean
  /** True when the list is empty only because of the toolbar filters. */
  filtered: boolean
  onClearFilters: () => void
  onDelete: (assignment: HomeworkAssignment) => void
  onOpenImage: (assignment: HomeworkAssignment) => void
  deletingId: string | null
}

export function HomeworkAssignmentList({
  assignments,
  loading,
  filtered,
  onClearFilters,
  onDelete,
  onOpenImage,
  deletingId,
}: HomeworkAssignmentListProps) {
  const groups = useMemo(() => {
    const buckets: Record<DueBucket, HomeworkAssignment[]> = {
      today: [],
      upcoming: [],
      overdue: [],
    }

    for (const a of assignments) {
      const info = dueInfo(a.due_date)
      // A row with an unreadable due date still belongs somewhere the teacher
      // can see and delete it; `upcoming` is the neutral bucket.
      buckets[info?.bucket ?? 'upcoming'].push(a)
    }

    const byDate = (dir: 1 | -1) => (a: HomeworkAssignment, b: HomeworkAssignment) => {
      const da = parseDueDate(a.due_date)?.getTime() ?? 0
      const db = parseDueDate(b.due_date)?.getTime() ?? 0
      return (da - db) * dir
    }

    buckets.today.sort(byDate(1))
    buckets.upcoming.sort(byDate(1))
    buckets.overdue.sort(byDate(-1))

    return buckets
  }, [assignments])

  if (loading) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-busy="true">
        <span className="sr-only">កំពុងទាញយកកិច្ចការផ្ទះ...</span>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (assignments.length === 0) {
    return filtered ? (
      <EmptyState
        kind="filtered"
        title="រកមិនឃើញកិច្ចការ"
        description="គ្មានកិច្ចការត្រូវនឹងតម្រងបច្ចុប្បន្នទេ។"
        action={
          <Button variant="secondary" printHidden={false} onClick={onClearFilters}>
            សម្អាតតម្រង
          </Button>
        }
      />
    ) : (
      <EmptyState
        title="មិនទាន់មានកិច្ចការផ្ទះនៅឡើយទេ"
        description="កិច្ចការដែលអ្នកផ្សាយនឹងបង្ហាញនៅទីនេះ ហើយអាណាព្យាបាលនឹងឃើញវានៅក្នុងកម្មវិធីរបស់ពួកគាត់។"
        icon={<FilePlus2 className="h-6 w-6" aria-hidden="true" />}
      />
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {BUCKET_ORDER.map((bucket) => {
        const rows = groups[bucket]
        if (rows.length === 0) return null

        return (
          <section key={bucket} className="flex flex-col gap-2.5">
            <AssignmentGroupHeading
              label={BUCKET_LABELS[bucket]}
              count={rows.length}
              bucket={bucket}
            />
            <ul className="flex flex-col gap-3">
              {rows.map((a) => (
                <HomeworkAssignmentCard
                  key={a.id}
                  assignment={a}
                  onDelete={onDelete}
                  onOpenImage={onOpenImage}
                  deleting={deletingId === a.id}
                />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export default HomeworkAssignmentList
