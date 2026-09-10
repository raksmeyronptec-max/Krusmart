'use client'

import { useMemo, useState } from 'react'
import { Check, Clock, Search, UserRoundX, ListChecks, NotebookPen } from 'lucide-react'

import { Button } from '@/components/ui/actions/Button'
import { Dialog } from '@/components/ui/overlay/Dialog'
import { notify } from '@/components/ui/feedback/notify'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { controlClass } from '@/components/ui/forms/fieldStyles'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { Student } from '@/lib/types'
import { ENTRY_MARKS } from '@/lib/attendance/status'

/**
 * Taking the register on a phone.
 *
 * The seating plan is a desk tool: it is 600px wide at its narrowest, it has to
 * be configured before it is useful, and a mark is made by tapping a seat until
 * it cycles round to the status you wanted (present → excused → absent →
 * present). Standing in front of a class holding a phone, none of that works.
 *
 * This is the same data through a list: one row per pupil, three labelled
 * buttons, no cycling and no guessing which tap you are on. It is the default
 * below `lg` and available at every width, because a teacher who prefers it on
 * a laptop should not be forced into the seating plan either.
 *
 * The marks land in exactly the same `attendance` rows through the same
 * actions, so the monthly sheet, the parent portal and the student detail page
 * see no difference in where a mark came from.
 */

export type MarkStatus = 'P' | 'L' | 'A'

/**
 * The three marks, in the order a teacher thinks about them.
 *
 * The codes and their labels come from `ENTRY_MARKS` — this screen is the only
 * thing in the product that WRITES a status, so what it calls each one is what
 * every reader has to mean by it. It used to name them here, which is how the
 * parent portal came to show ច្បាប់ as មកយឺត. Only the colours are local,
 * because a colour is a property of this control and not of the mark.
 */
const TONE: Record<MarkStatus, { icon: typeof Check; on: string; off: string }> = {
  P: {
    icon: Check,
    on: 'bg-success text-white border-success',
    off: 'border-divider text-text-muted hover:border-success hover:text-success',
  },
  L: {
    icon: Clock,
    on: 'bg-warning text-white border-warning',
    off: 'border-divider text-text-muted hover:border-warning hover:text-warning-text',
  },
  A: {
    icon: UserRoundX,
    on: 'bg-danger text-white border-danger',
    off: 'border-divider text-text-muted hover:border-danger hover:text-danger',
  },
}

const MARKS = ENTRY_MARKS.map((m) => ({
  code: m.code as MarkStatus,
  label: m.label,
  ...TONE[m.code as MarkStatus],
}))

export interface RosterCheckInProps {
  students: Student[]
  /** `studentId` → `{ status, note }` for the day on screen. */
  marks: Record<string, { status: string; note: string }>
  onMark: (studentId: string, status: MarkStatus, note: string) => Promise<{ error?: string }>
  onMarkAll: (status: MarkStatus) => Promise<{ error?: string }>
}

export function RosterCheckIn({ students, marks, onMark, onMarkAll }: RosterCheckInProps) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  // The pupil whose absence is being annotated, if any.
  const [noteFor, setNoteFor] = useState<{ student: Student; status: MarkStatus } | null>(null)
  const [noteDraft, setNoteDraft] = useState('')

  // Row numbers must follow the roster, not the filtered view, so a teacher
  // searching for one pupil still sees the number they have on paper.
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

  const mark = async (student: Student, status: MarkStatus) => {
    // Re-tapping the mark a pupil already has is a no-op, not a toggle back to
    // unmarked — an accidental double tap must not erase the register.
    if (marks[student.id]?.status === status) return

    setBusy(student.id)
    const res = await onMark(student.id, status, '')
    setBusy(null)
    if (res.error) notify.error(`រក្សាទុកមិនបាន៖ ${student.name_kh}`)
  }

  const submitNote = async () => {
    if (!noteFor) return
    const { student, status } = noteFor
    setNoteFor(null)
    setBusy(student.id)
    const res = await onMark(student.id, status, noteDraft.trim())
    setBusy(null)
    if (res.error) notify.error(`រក្សាទុកមិនបាន៖ ${student.name_kh}`)
    else notify.success('បានរក្សាទុកមូលហេតុ')
  }

  const markAll = async () => {
    setBulkBusy(true)
    const id = notify.loading('កំពុងសម្គាល់វត្តមានទាំងអស់...')
    const res = await onMarkAll('P')
    setBulkBusy(false)
    notify.settle(id, !res.error, res.error ?? `បានសម្គាល់វត្តមាន ${toKhmerNumber(students.length)} នាក់`)
  }

  if (students.length === 0) {
    return <EmptyState title="មិនទាន់មានសិស្សក្នុងបញ្ជី" description="បន្ថែមសិស្សនៅទំព័របញ្ចូលព័ត៌មានសិស្សជាមុនសិន។" />
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The completion strip used to be here, and therefore only here. It is
          `RegisterTally`, above the view switcher, so the seating plan and the
          3D room answer "have I finished?" too. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
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
        <Button
          variant="success"
          printHidden={false}
          onClick={markAll}
          loading={bulkBusy}
          icon={<ListChecks className="h-4 w-4" />}
        >
          សម្គាល់វត្តមានទាំងអស់
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState kind="filtered" title="រកមិនឃើញសិស្ស" description="សាកល្បងប្តូរពាក្យស្វែងរក។" />
      ) : (
        <ul className="divide-y divide-divider overflow-hidden rounded-xl border border-divider bg-bg-surface">
          {visible.map((s) => {
            const current = marks[s.id]?.status
            const note = marks[s.id]?.note
            const away = current === 'L' || current === 'A'
            return (
              <li key={s.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span className="w-6 shrink-0 text-xs text-text-muted tabular-nums">
                    {toKhmerNumber(rowNumber.get(s.id) ?? 0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-text-heading">{s.name_kh}</span>
                    <span className="block truncate text-xs text-text-muted">
                      {s.student_id || '-'}
                      {note && <> · {note}</>}
                    </span>
                  </span>

                  {/*
                    Only offered once a pupil is marked away — a reason against
                    a present mark has nothing to describe, and the button would
                    be dead weight on every row.
                  */}
                  {away && (
                    <button
                      type="button"
                      onClick={() => { setNoteDraft(note ?? ''); setNoteFor({ student: s, status: current as MarkStatus }) }}
                      aria-label={`មូលហេតុរបស់ ${s.name_kh}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-divider text-text-muted transition hover:border-brand-400 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      <NotebookPen className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>

                {/*
                  `role="group"` rather than a radio group: the three are a set,
                  but each is a button that writes immediately, and a teacher
                  arrowing between radios would fire three saves on the way.
                */}
                <div role="group" aria-label={`វត្តមានរបស់ ${s.name_kh}`} className="flex shrink-0 gap-1.5">
                  {MARKS.map((m) => {
                    const on = current === m.code
                    const Icon = m.icon
                    return (
                      <button
                        key={m.code}
                        type="button"
                        disabled={busy === s.id}
                        aria-pressed={on}
                        onClick={() => mark(s, m.code)}
                        className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border-2 px-3 text-[13px] font-bold transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:flex-none ${on ? m.on : m.off}`}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        {m.label}
                      </button>
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog
        open={noteFor !== null}
        onClose={() => setNoteFor(null)}
        title={noteFor ? `មូលហេតុ៖ ${noteFor.student.name_kh}` : 'មូលហេតុ'}
        description="សរសេរមូលហេតុនៃការអវត្តមាន ដើម្បីបង្ហាញនៅក្នុងកំណត់ត្រា។"
        size="sm"
        footer={
          <>
            <Button variant="secondary" printHidden={false} onClick={() => setNoteFor(null)}>បោះបង់</Button>
            <Button printHidden={false} onClick={submitNote}>រក្សាទុក</Button>
          </>
        }
      >
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          rows={3}
          aria-label="មូលហេតុ"
          className="w-full rounded-lg border border-divider bg-bg-surface p-3 text-sm text-text-heading outline-none focus:border-brand focus:ring-2 focus:ring-focus-ring/30"
        />
      </Dialog>
    </div>
  )
}

export default RosterCheckIn
