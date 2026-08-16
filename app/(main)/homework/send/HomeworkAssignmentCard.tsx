'use client'

import { useState } from 'react'
import { AlertTriangle, CalendarClock, CalendarDays, Clock3, ImageIcon, Trash2, ZoomIn } from 'lucide-react'
import { Badge } from '@/components/ui/feedback/Badge'
import { Button } from '@/components/ui/actions/Button'
import { formatKhmerDate } from '@/lib/utils/date'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { dueInfo, type DueBucket } from './assignmentStatus'
import { subjectBadgeVariant } from './subjects'
import type { HomeworkAssignment } from '@/lib/types'

/**
 * One published assignment.
 *
 * The due state is carried by an icon, a word and a colour together — never by
 * colour alone, which on the old card was a single red date that meant nothing
 * in particular. `ImageIcon` marks a card that carries a photo even before the
 * thumbnail loads, so the row does not reflow when it arrives.
 *
 * Delete is a labelled button, not a bare red icon: on a list of near-identical
 * rows a 20px trash glyph is the easiest thing on the page to hit by accident,
 * and the action is not reversible.
 */

const DUE_TONE: Record<DueBucket, { variant: 'danger' | 'warning' | 'muted'; icon: typeof Clock3 }> = {
  overdue: { variant: 'danger', icon: AlertTriangle },
  today: { variant: 'warning', icon: Clock3 },
  upcoming: { variant: 'muted', icon: CalendarClock },
}

export interface HomeworkAssignmentCardProps {
  assignment: HomeworkAssignment
  onDelete: (assignment: HomeworkAssignment) => void
  onOpenImage: (assignment: HomeworkAssignment) => void
  deleting: boolean
}

export function HomeworkAssignmentCard({
  assignment,
  onDelete,
  onOpenImage,
  deleting,
}: HomeworkAssignmentCardProps) {
  const [expanded, setExpanded] = useState(false)
  const due = dueInfo(assignment.due_date)
  const tone = due ? DUE_TONE[due.bucket] : DUE_TONE.upcoming
  const DueIcon = tone.icon
  const long = (assignment.description?.length ?? 0) > 180

  return (
    <li className="rounded-xl border border-divider bg-bg-surface p-4 shadow-sm transition hover:border-brand-400 md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={subjectBadgeVariant(assignment.subject)} size="sm">
          {assignment.subject}
        </Badge>

        <Badge
          variant={tone.variant}
          size="sm"
          icon={<DueIcon className="h-3 w-3" aria-hidden="true" />}
        >
          {due?.label ?? 'គ្មានថ្ងៃផុតកំណត់'}
        </Badge>

        {assignment.image_url && (
          <Badge variant="muted" size="sm" icon={<ImageIcon className="h-3 w-3" aria-hidden="true" />}>
            មានរូបភាព
          </Badge>
        )}
      </div>

      <h3 className="mt-2 text-base leading-snug font-bold text-text-heading md:text-lg">
        {assignment.title}
      </h3>

      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
        <span className="flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          ផុតកំណត់៖ {formatKhmerDate(assignment.due_date)}
        </span>
        {assignment.created_at && (
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            ផ្សាយ៖ {formatKhmerDate(assignment.created_at.slice(0, 10))}
          </span>
        )}
      </p>

      {assignment.description ? (
        <>
          <p
            className={`mt-2 text-sm leading-relaxed whitespace-pre-wrap text-text-body ${
              long && !expanded ? 'line-clamp-3' : ''
            }`}
          >
            {assignment.description}
          </p>
          {long && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-1 text-xs font-bold text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {expanded ? 'បង្ហាញតិច' : 'អានបន្ថែម'}
            </button>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-text-muted italic">មិនមានការណែនាំលម្អិតទេ</p>
      )}

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        {assignment.image_url ? (
          <button
            type="button"
            onClick={() => onOpenImage(assignment)}
            aria-label={`ពង្រីករូបភាពសម្រាប់ ${assignment.title}`}
            className="group/img relative rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- teacher-uploaded remote image; next/image needs an allow-listed host */}
            <img
              src={assignment.image_url}
              alt=""
              className="h-20 w-auto rounded-lg border border-divider object-cover shadow-sm transition group-hover/img:opacity-90"
            />
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-brand-950/30 opacity-0 transition group-hover/img:opacity-100 group-focus-visible/img:opacity-100">
              <ZoomIn className="h-6 w-6 text-white" aria-hidden="true" />
            </span>
          </button>
        ) : (
          <span aria-hidden="true" />
        )}

        <Button
          variant="danger"
          size="sm"
          printHidden={false}
          onClick={() => onDelete(assignment)}
          disabled={deleting}
          aria-label={`លុបកិច្ចការ ${assignment.title}`}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" /> លុប
        </Button>
      </div>
    </li>
  )
}

/** Group heading with a count, used by the list. */
export function AssignmentGroupHeading({
  label,
  count,
  bucket,
}: {
  label: string
  count: number
  bucket: DueBucket
}) {
  const { variant, icon: Icon } = DUE_TONE[bucket]
  return (
    <h3 className="mt-1 flex items-center gap-2 text-sm font-bold text-text-heading">
      <Badge variant={variant} size="sm" icon={<Icon className="h-3 w-3" aria-hidden="true" />}>
        {label}
      </Badge>
      <span className="text-xs font-normal text-text-muted">
        {toKhmerNumber(count)} កិច្ចការ
      </span>
    </h3>
  )
}

export default HomeworkAssignmentCard
