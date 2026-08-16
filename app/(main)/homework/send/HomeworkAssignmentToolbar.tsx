'use client'

import { Search, X } from 'lucide-react'
import Select from '@/components/ui/forms/Select'
import { Button } from '@/components/ui/actions/Button'
import { controlClass } from '@/components/ui/forms/fieldStyles'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { BUCKET_LABELS, BUCKET_ORDER, type DueBucket } from './assignmentStatus'

/**
 * Finding one assignment among a term's worth of them.
 *
 * Every control here filters the list the teacher already holds — the rows were
 * fetched once, scoped to them by the server action and by RLS. Nothing in this
 * bar changes what is requested, so no filter can widen what is visible.
 */

export type BucketFilter = DueBucket | 'all'

export interface HomeworkAssignmentToolbarProps {
  total: number
  shown: number
  query: string
  onQueryChange: (value: string) => void
  subject: string
  onSubjectChange: (value: string) => void
  subjectOptions: string[]
  bucket: BucketFilter
  onBucketChange: (value: BucketFilter) => void
  counts: Record<DueBucket, number>
  onClear: () => void
}

export function HomeworkAssignmentToolbar({
  total,
  shown,
  query,
  onQueryChange,
  subject,
  onSubjectChange,
  subjectOptions,
  bucket,
  onBucketChange,
  counts,
  onClear,
}: HomeworkAssignmentToolbarProps) {
  const filtering = query.trim() !== '' || subject !== '' || bucket !== 'all'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-muted">
          {filtering ? (
            <>
              បង្ហាញ <strong className="text-text-heading">{toKhmerNumber(shown)}</strong> ក្នុងចំណោម{' '}
              {toKhmerNumber(total)} កិច្ចការ
            </>
          ) : (
            <>
              សរុប <strong className="text-text-heading">{toKhmerNumber(total)}</strong> កិច្ចការ
            </>
          )}
        </p>

        {filtering && (
          <Button variant="ghost" size="sm" printHidden={false} onClick={onClear}>
            <X className="h-3.5 w-3.5" aria-hidden="true" /> សម្អាតតម្រង
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="ស្វែងរកចំណងជើង ឬការណែនាំ"
            aria-label="ស្វែងរកកិច្ចការផ្ទះ"
            className={controlClass(false, 'pl-9')}
          />
        </div>

        <Select
          ariaLabel="តម្រងតាមមុខវិជ្ជា"
          value={subject}
          onChange={onSubjectChange}
          placeholder="មុខវិជ្ជាទាំងអស់"
          options={subjectOptions}
          wrapperClassName="min-w-[180px]"
        />
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="តម្រងតាមថ្ងៃផុតកំណត់">
        {(['all', ...BUCKET_ORDER] as BucketFilter[]).map((id) => {
          const active = bucket === id
          const label =
            id === 'all'
              ? `ទាំងអស់ (${toKhmerNumber(total)})`
              : `${BUCKET_LABELS[id]} (${toKhmerNumber(counts[id])})`

          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => onBucketChange(id)}
              className={`min-h-9 rounded-full border px-3 text-[11px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                active
                  ? 'border-brand bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300'
                  : 'border-divider text-text-muted hover:border-brand-400 hover:text-brand'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default HomeworkAssignmentToolbar
