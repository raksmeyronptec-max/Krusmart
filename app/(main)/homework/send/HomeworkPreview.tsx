'use client'

import { CalendarClock, Eye } from 'lucide-react'
import { Badge } from '@/components/ui/feedback/Badge'
import { formatKhmerDate } from '@/lib/utils/date'
import { dueInfo } from './assignmentStatus'
import { subjectBadgeVariant } from './subjects'

/**
 * How the card will read in the parent portal.
 *
 * Built entirely from what is typed in the form — it makes no request, reads no
 * student or parent record, and knows nothing about who will see it. That is
 * the point: a preview that fetched anything would be a second, unaudited path
 * to parent data.
 *
 * The layout deliberately mirrors `parent/(portal)/homework/HomeworkClient` —
 * subject chip, title, instructions, photo, due date with the overdue colour —
 * so what the teacher checks here is what the parent gets. It is drawn with the
 * teacher app's tokens rather than the portal's `--pp-*` palette, which is
 * scoped to that route tree.
 */

export interface HomeworkPreviewProps {
  subject: string
  title: string
  description: string
  dueDate: string
  imageDataUrl: string | null
}

export function HomeworkPreview({
  subject,
  title,
  description,
  dueDate,
  imageDataUrl,
}: HomeworkPreviewProps) {
  const due = dueInfo(dueDate)

  return (
    <section aria-labelledby="hw-preview-heading" className="rounded-xl border border-divider bg-paper p-3">
      <h3
        id="hw-preview-heading"
        className="mb-2 flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-text-muted uppercase"
      >
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        មើលជាមុន — ទិដ្ឋភាពក្នុងកម្មវិធីអាណាព្យាបាល
      </h3>

      <div className="rounded-xl border border-divider bg-bg-surface p-3.5">
        <Badge variant={subjectBadgeVariant(subject)} size="sm">
          {subject || 'មុខវិជ្ជា'}
        </Badge>

        <p className="mt-2 truncate font-bold text-text-heading">
          {title || <span className="font-normal text-text-muted italic">ចំណងជើងកិច្ចការ</span>}
        </p>

        {description && (
          <p className="mt-1.5 line-clamp-4 text-sm whitespace-pre-wrap text-text-body">
            {description}
          </p>
        )}

        {imageDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- locally-read data URL; next/image cannot process one
          <img
            src={imageDataUrl}
            alt={title ? `រូបភាពសម្រាប់ ${title}` : 'រូបភាពកិច្ចការផ្ទះ'}
            className="mt-2.5 max-h-40 w-full rounded-lg border border-divider object-cover"
          />
        )}

        <p
          className={`mt-2.5 flex items-center gap-1.5 text-xs font-bold ${
            due?.bucket === 'overdue' ? 'text-danger' : 'text-text-muted'
          }`}
        >
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          ថ្ងៃផុតកំណត់៖ {dueDate ? formatKhmerDate(dueDate) : '—'}
          {due && <span className="font-normal">· {due.label}</span>}
        </p>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
        នេះជាគំរូតែប៉ុណ្ណោះ។ ទិន្នន័យអាណាព្យាបាល ឬសិស្ស មិនត្រូវបានទាញយកនៅទីនេះទេ។
      </p>
    </section>
  )
}

export default HomeworkPreview
