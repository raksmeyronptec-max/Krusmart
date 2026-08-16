'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Dialog } from '@/components/ui/overlay/Dialog'
import { Button } from '@/components/ui/actions/Button'
import { controlClass, fieldLabel, requiredMark } from '@/components/ui/forms/fieldStyles'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { khmerWeekday } from '@/lib/constants/weekdays'
import type { HomeworkDay } from './period'

/**
 * Give the same mark to everyone on the list, for one day.
 *
 * The old control was a bare number box and a button labelled "ទាំងអស់" sitting
 * in the header — no statement of what "all" meant, no confirmation, and it
 * silently did nothing when the selected day was a Sunday. Here the sentence
 * the teacher reads before pressing Apply names the mark, the number of pupils
 * and the day, and the caller keeps a snapshot so the whole fill can be undone
 * before it is ever written.
 *
 * Nothing is saved by applying: the marks land in the grid as unsaved edits,
 * exactly as if they had been typed.
 */

export interface HomeworkBulkFillProps {
  open: boolean
  onClose: () => void
  /** The day being filled; `null` disables the dialog's apply path. */
  day: HomeworkDay | undefined
  /** Pupils currently listed — the fill never reaches beyond the visible list. */
  studentCount: number
  maxScore: number
  onApply: (value: string, onlyEmpty: boolean) => void
}

export function HomeworkBulkFill({
  open,
  onClose,
  day,
  studentCount,
  maxScore,
  onApply,
}: HomeworkBulkFillProps) {
  const [value, setValue] = useState('')
  const [onlyEmpty, setOnlyEmpty] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Reset each time it opens, so yesterday's mark is never pre-loaded into a
  // control that writes to thirty rows. Adjusted during render rather than in
  // an effect — React's own "resetting state when a prop changes" pattern —
  // which avoids a second render pass with the stale value on screen.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setValue('')
      setOnlyEmpty(true)
      setError(null)
    }
  }

  const blocked = !day || day.isSunday

  const submit = () => {
    if (blocked) return
    const trimmed = value.trim()
    if (trimmed === '') {
      setError('សូមបញ្ចូលពិន្ទុជាមុនសិន')
      return
    }
    const num = Number(trimmed)
    if (!Number.isFinite(num) || num < 0) {
      setError('ពិន្ទុត្រូវតែជាលេខ ហើយមិនតិចជាងសូន្យ')
      return
    }
    setError(null)
    onApply(trimmed, onlyEmpty)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="ផ្តល់ពិន្ទុដូចគ្នា"
      description={
        day
          ? `សម្រាប់ថ្ងៃទី ${toKhmerNumber(day.dayNum)} (${khmerWeekday(day.date)}) ប៉ុណ្ណោះ`
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" printHidden={false} onClick={onClose}>
            បោះបង់
          </Button>
          <Button
            printHidden={false}
            disabled={blocked}
            onClick={submit}
            icon={<Check className="h-4 w-4" />}
          >
            អនុវត្ត
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {blocked ? (
          <p className="rounded-lg bg-danger/10 px-3 py-2.5 text-sm font-bold text-danger">
            ថ្ងៃដែលបានជ្រើសរើសជាថ្ងៃអាទិត្យ។ មិនអាចផ្តល់ពិន្ទុកិច្ចការផ្ទះបានទេ។
          </p>
        ) : (
          <>
            <div>
              <label className={fieldLabel} htmlFor="hw-bulk-score">
                ពិន្ទុ <span className={requiredMark}>*</span>
              </label>
              <input
                id="hw-bulk-score"
                type="number"
                inputMode="decimal"
                min={0}
                max={maxScore}
                step="0.5"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value)
                  if (error) setError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    submit()
                  }
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'hw-bulk-error' : undefined}
                placeholder="ឧ. 8"
                className={controlClass(false, 'text-center text-xl font-bold')}
              />
              {error && (
                <p id="hw-bulk-error" role="alert" className="mt-1.5 text-xs font-bold text-danger">
                  {error}
                </p>
              )}
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-divider p-3">
              <input
                type="checkbox"
                checked={onlyEmpty}
                onChange={(e) => setOnlyEmpty(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
              />
              <span className="text-sm text-text-body">
                <span className="font-bold text-text-heading">តែសិស្សដែលមិនទាន់មានពិន្ទុ</span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  បើដោះធីក ពិន្ទុដែលបញ្ចូលរួចនឹងត្រូវសរសេរជាន់ពីលើ។
                </span>
              </span>
            </label>

            <p className="rounded-lg bg-paper px-3 py-2.5 text-sm text-text-body">
              នឹងផ្តល់ពិន្ទុ <strong>{value.trim() === '' ? '—' : value.trim()}</strong> ដល់សិស្ស{' '}
              <strong>{toKhmerNumber(studentCount)} នាក់</strong> ក្នុងបញ្ជីបច្ចុប្បន្ន សម្រាប់{' '}
              <strong>ថ្ងៃទី {day ? toKhmerNumber(day.dayNum) : '—'}</strong> ប៉ុណ្ណោះ។
              <span className="mt-1 block text-xs text-text-muted">
                មិនទាន់រក្សាទុកទេ — អ្នកអាចត្រឡប់វិញបាន មុនពេលចុច «រក្សាទុក»។
              </span>
            </p>
          </>
        )}
      </div>
    </Dialog>
  )
}

export default HomeworkBulkFill
