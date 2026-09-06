'use client'

import { Table2 } from 'lucide-react'

import { toKhmerNumber } from '@/lib/utils/khmer-num'

/**
 * What `/score/enter` will look like for the current choice.
 *
 * The old screen never showed this, and it is the question the whole page is
 * answering. A teacher toggling ភាសាខ្មែរ's seven skills is choosing *columns of
 * the entry grid*, but the list talks about subjects and components; the gap
 * between the two is where "ជួរឈរ ៧" stopped meaning anything.
 *
 * Read-only and deliberately not a real table: it is a picture of a header row,
 * not a second grid that could disagree with the first. The columns come from
 * `previewColumns` in `lib/scores/curriculum.ts`, which mirrors what
 * `applySelection` hands the grid — including the fallback where a class that
 * has configured nothing previews its whole curriculum, because that is what
 * its grid renders.
 *
 * Horizontally scrollable in its own box: a primary class marks thirty-odd
 * columns, and the page body must never scroll sideways.
 */
export function GridPreview({
  columns,
  configured,
}: {
  columns: { columnId: string; label: string; subjectLabel: string }[]
  /** False means the class has chosen nothing and is previewing everything. */
  configured: boolean
}) {
  return (
    <div className="mb-4 rounded-xl border border-divider bg-bg-surface p-3">
      <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-bold text-text-heading">
        <Table2 className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
        គំរូតារាងបញ្ចូលពិន្ទុ
        <span className="font-normal text-text-muted">
          {toKhmerNumber(columns.length)} ជួរ
        </span>
        {!configured && (
          <span className="font-normal text-text-muted">· កំពុងបង្ហាញកម្មវិធីសិក្សាទាំងមូល</span>
        )}
      </p>

      {columns.length === 0 ? (
        <p className="text-xs text-text-muted">មិនទាន់មានជួរណាមួយទេ។ បើកមុខវិជ្ជាយ៉ាងតិចមួយជាមុនសិន។</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex w-max items-stretch gap-px rounded-lg border border-divider bg-divider">
            <div className="flex min-w-28 flex-col justify-center bg-paper px-2.5 py-1.5">
              <span className="text-[11px] font-bold text-text-body">ឈ្មោះសិស្ស</span>
            </div>
            {columns.map((column) => (
              <div key={column.columnId} className="flex min-w-20 flex-col bg-paper px-2.5 py-1.5">
                {/*
                  The subject above the column, because a bare `អាន` says nothing
                  once seven subjects each contribute a column or two.
                */}
                <span className="truncate text-[10px] text-text-muted">{column.subjectLabel}</span>
                <span className="truncate text-[11px] font-bold text-text-body">{column.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
