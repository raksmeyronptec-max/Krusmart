'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { controlClass } from '@/components/ui/forms/fieldStyles'
import Select from '@/components/ui/forms/Select'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { Student } from '@/lib/types'

/**
 * Entering marks on a phone.
 *
 * The grid is right for a laptop — a teacher copying a column of marks off a
 * paper register wants every pupil visible at once. On a phone it is a table
 * dragged sideways with `<input>`s inside it, where the column you are typing
 * into scrolls out from under the keyboard.
 *
 * Same state, different shape: one card per pupil, each mark a labelled field.
 * Nothing is hidden and no value is stored differently — `onChange` is the same
 * handler the grid rows call, so a mark typed here and a mark typed there are
 * indistinguishable by the time they reach `saveScores`.
 */

/** Mirrors `SubjectColumn` in the parent; kept structural to avoid a cycle. */
export interface ScoreColumn {
  id: string
  label: string
  type?: string
  options?: string[]
}

export interface ScoreEntryCardsProps {
  students: Student[]
  columns: ScoreColumn[]
  values: Record<string, Record<string, string | number | null>>
  onChange: (studentId: string, columnId: string, value: string) => void
}

export function ScoreEntryCards({ students, columns, values, onChange }: ScoreEntryCardsProps) {
  const [query, setQuery] = useState('')

  const rowNumber = useMemo(
    () => new Map(students.map((s, i) => [s.id, i + 1])),
    [students],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) =>
      [s.name_kh, s.name_en, s.student_id].some((f) => String(f ?? '').toLowerCase().includes(q)),
    )
  }, [students, query])

  if (students.length === 0) {
    return <EmptyState title="មិនទាន់មានសិស្សក្នុងបញ្ជី" description="បន្ថែមសិស្សនៅទំព័របញ្ចូលព័ត៌មានសិស្សជាមុនសិន។" />
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ស្វែងរកឈ្មោះសិស្ស"
          aria-label="ស្វែងរកសិស្ស"
          className={controlClass(false, 'pl-9')}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState kind="filtered" title="រកមិនឃើញសិស្ស" description="សាកល្បងប្តូរពាក្យស្វែងរក។" />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((s) => (
            <li key={s.id} className="rounded-xl border border-divider bg-bg-surface p-4 shadow-sm">
              <p className="mb-3 flex items-baseline gap-2 font-bold text-text-heading">
                <span className="text-xs text-text-muted tabular-nums">{toKhmerNumber(rowNumber.get(s.id) ?? 0)}.</span>
                <span className="min-w-0 truncate">{s.name_kh || s.full_name}</span>
              </p>

              <div className="flex flex-col gap-3">
                {columns.map((col) => {
                  const id = `score-${s.id}-${col.id}`
                  const value = values[s.id]?.[col.id] ?? ''
                  return (
                    <div key={col.id} className="flex items-center gap-3">
                      <label htmlFor={id} className="min-w-0 flex-1 text-sm text-text-body">
                        {col.label}
                      </label>
                      {col.type === 'select' ? (
                        <Select
                          id={id}
                          value={String(value)}
                          onChange={(v) => onChange(s.id, col.id, v)}
                          options={col.options ?? []}
                          placeholder="—"
                          ariaLabel={`${col.label} — ${s.name_kh}`}
                          wrapperClassName="w-40 shrink-0"
                        />
                      ) : (
                        <input
                          id={id}
                          type="number"
                          step="0.01"
                          // `inputMode="decimal"` puts the numeric keypad up on a
                          // phone; `type=number` alone does not on every browser.
                          inputMode="decimal"
                          placeholder="—"
                          aria-label={`${col.label} — ${s.name_kh}`}
                          value={value}
                          onChange={(e) => onChange(s.id, col.id, e.target.value)}
                          className={controlClass(false, 'w-24 shrink-0 text-center font-bold text-brand')}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default ScoreEntryCards
