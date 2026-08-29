'use client'

import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/actions/Button'
import { Dialog } from '@/components/ui/overlay/Dialog'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { EffectiveSubject } from '@/lib/scores/template'

/**
 * Which components of a subject the class marks (§21).
 *
 * ភាសាខ្មែរ carries seven — ស្តាប់ និយាយ អាន សរសេរ អក្សរផ្ចង់ មេសូត្រ តែងសេចក្តី —
 * and a class that only marks four should enter four columns, not seven with
 * three left permanently blank.
 *
 * A component is a *column*, not a subject: the ids here are
 * `SubjectColumn.id`, which is what `scores.subject` stores. Turning one off
 * therefore removes a column from the grid and nothing else — every mark
 * already recorded under it stays in the table and keeps resolving on the
 * totals grid and on reports. The copy at the foot says so, because "will this
 * delete the marks I already entered?" is the only question a teacher actually
 * has here.
 *
 * At least one component must stay on. A subject with no columns is a row in
 * the grid with nowhere to type, so the confirm button disables rather than
 * letting the server reject it after a round trip.
 */
export function ComponentPicker({
  open,
  onClose,
  subject,
  enabledColumns,
  onSave,
  busy,
}: {
  open: boolean
  onClose: () => void
  /** The subject being configured; `null` while the dialog is closed. */
  subject: EffectiveSubject | null
  /** Currently enabled column ids, or `null` for "all of them". */
  enabledColumns: string[] | null
  onSave: (columnIds: string[]) => Promise<boolean>
  busy: boolean
}) {
  const allIds = useMemo(() => (subject?.columns ?? []).map((c) => c.id), [subject])
  const [picked, setPicked] = useState<Set<string>>(new Set())

  // Re-seed every time the dialog opens on a subject: the previous subject's
  // ticks must not carry over into this one. Keyed on the subject as well as
  // `open`, because the parent keeps this component mounted and swaps which
  // subject it points at.
  //
  // Adjusted during render rather than in an effect, so the correct boxes are
  // ticked in the first painted frame.
  const seedKey = open ? (subject?.subjectKey ?? '') : null
  const [seeded, setSeeded] = useState<string | null>(null)
  if (seedKey !== seeded) {
    setSeeded(seedKey)
    if (seedKey !== null) setPicked(new Set(enabledColumns ?? allIds))
  }

  if (!subject) return null

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const submit = async () => {
    if (picked.size === 0) return
    const ok = await onSave([...picked])
    if (ok) onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="ផ្នែករងនៃមុខវិជ្ជា"
      description={subject.labelKm}
      footer={
        <>
          <Button variant="secondary" printHidden={false} onClick={onClose}>
            បោះបង់
          </Button>
          <Button printHidden={false} onClick={submit} loading={busy} disabled={picked.size === 0}>
            រក្សាទុក
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-text-muted">
          ជ្រើសរើសផ្នែកដែលថ្នាក់នេះវាយតម្លៃ។ ផ្នែកដែលមិនបានជ្រើសនឹងមិនបង្ហាញក្នុងតារាងបញ្ចូលពិន្ទុទេ។
        </p>

        <ul className="rounded-lg border border-divider">
          {subject.columns.map((column) => {
            const inputId = `component-${column.id}`
            return (
              <li key={column.id} className="border-t border-divider first:border-t-0">
                <label
                  htmlFor={inputId}
                  className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2.5 transition hover:bg-paper"
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={picked.has(column.id)}
                    disabled={busy}
                    onChange={() => toggle(column.id)}
                    className="h-5 w-5 shrink-0 accent-[var(--color-brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  />
                  <span className="text-sm font-bold text-text-heading">{column.label}</span>
                  {column.type === 'select' && (
                    <span className="ml-auto text-[11px] text-text-muted">ជ្រើសរើសពាក្យ</span>
                  )}
                </label>
              </li>
            )
          })}
        </ul>

        <p className="text-[11px] text-text-muted">
          បានជ្រើស {toKhmerNumber(picked.size)} ក្នុងចំណោម {toKhmerNumber(subject.columns.length)}។
          ពិន្ទុដែលបានបញ្ចូលរួចមិនត្រូវបានលុបទេ — វានៅតែបង្ហាញក្នុងតារាងសរុប និងរបាយការណ៍។
        </p>
      </div>
    </Dialog>
  )
}
