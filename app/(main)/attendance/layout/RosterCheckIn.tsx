'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import {
  Check, Circle, X, Search, ListChecks, Loader2, CloudOff, RefreshCw, CheckCircle2, MessageSquareText,
} from 'lucide-react'

import { Button } from '@/components/ui/actions/Button'
import { BottomSheet } from '@/components/ui/overlay/BottomSheet'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { controlClass } from '@/components/ui/forms/fieldStyles'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { Student } from '@/lib/types'
import { ENTRY_MARKS, isAbsence, markFor, type AttendanceStatus } from '@/lib/attendance/status'
import {
  ROSTER_FILTERS, filterCounts, registerSummary, visibleRoster,
  type DayMarks, type RosterFilter,
} from '@/lib/attendance/register'

/**
 * Taking the register: everyone is here, then the exceptions.
 *
 * The daily flow this screen is built around:
 *
 *   open → the class and today are already chosen → ✓ មកទាំងអស់ → correct the
 *   two who are away → it is saved → done.
 *
 * So the list is the whole screen: a search box, five filter chips, one row per
 * pupil with three labelled 44px buttons, and a sticky bar holding the one
 * primary action until nothing is left to do. The seating plan and the 3D room
 * are other ways to write the same rows, offered from `lg` up; a teacher never
 * has to arrange a seat to take attendance.
 *
 * ── What a row promises ───────────────────────────────────────────────────
 *
 *   * A mark is painted the moment it is tapped (the parent applies it
 *     optimistically) and reverted if the save fails — never a mark on screen
 *     the database did not receive.
 *   * A failed row says so ON THE ROW, with a retry, rather than only in a
 *     toast that has gone by the time the teacher looks up.
 *   * Absent and ច្បាប់ open a compact sheet for the reason; the mark is
 *     already saved, so dismissing the sheet costs nothing.
 *   * Re-tapping a pupil's current mark never clears it — an accidental double
 *     tap must not erase the register. On an absence it opens the reason.
 *
 * The codes and labels come from `ENTRY_MARKS`: this is the only thing in the
 * product that WRITES a status, so what it calls each one is what every reader
 * has to mean by it. Only the glyph and the colour are local — a colour is a
 * property of this control, not of the mark, and it is never the only signal.
 */

export type MarkStatus = AttendanceStatus

/** How the day's writes are going, as one word for the whole register. */
export type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

/** A save that did not land, and the mark the teacher meant by it. */
export type FailedMark = { status: MarkStatus; note: string }

const TONE: Record<string, { icon: typeof Check; on: string; off: string }> = {
  P: {
    icon: Check,
    on: 'bg-success-solid text-success-on-solid border-success-solid',
    off: 'border-divider bg-bg-surface text-text-body hover:border-success hover:text-success',
  },
  L: {
    icon: Circle,
    on: 'bg-warning text-white border-warning',
    off: 'border-divider bg-bg-surface text-text-body hover:border-warning hover:text-warning-text',
  },
  A: {
    icon: X,
    on: 'bg-danger text-white border-danger',
    off: 'border-divider bg-bg-surface text-text-body hover:border-danger hover:text-danger-text',
  },
}

const MARKS = ENTRY_MARKS.map((m) => ({ code: m.code, label: m.label, ...TONE[m.code] }))

/** One-tap reasons. Free text is still offered beneath them. */
const QUICK_REASONS = ['ឈឺ', 'មានធុរៈគ្រួសារ', 'ភ្លៀងធ្លាក់', 'ផ្សេងៗ'] as const

/** Copy for a filter that matches nobody, by what was asked for. */
const EMPTY_FILTER: Record<RosterFilter, string> = {
  all: 'រកមិនឃើញសិស្ស',
  unmarked: 'សិស្សទាំងអស់បានសម្គាល់រួចហើយ',
  P: 'មិនទាន់មានសិស្សសម្គាល់ថាមក',
  L: 'គ្មានសិស្សសុំច្បាប់ថ្ងៃនេះ',
  A: 'គ្មានសិស្សអវត្តមានថ្ងៃនេះ',
  AP: 'គ្មានសិស្សសុំច្បាប់ថ្ងៃនេះ',
}

export interface RosterCheckInProps {
  students: Student[]
  /** `studentId` → `{ status, note }` for the day on screen. */
  marks: DayMarks
  /** Rows whose save is in flight. */
  pendingIds: ReadonlySet<string>
  /** Rows whose last save failed, with what was meant. */
  failed: Readonly<Record<string, FailedMark>>
  saveState: SaveState
  /** The day is closed: the list is read-only and says so. */
  locked: boolean
  onMark: (studentId: string, status: MarkStatus, note: string) => Promise<{ error?: string }>
  onMarkAll: (status: MarkStatus) => Promise<{ error?: string }>
  onRetry: (studentId: string) => void
  /** Rendered in the completion panel — the "close the day" control. */
  completionAction?: React.ReactNode
  /** Rendered in the empty roster — where to add pupils. */
  emptyAction?: React.ReactNode
}

export function RosterCheckIn({
  students, marks, pendingIds, failed, saveState, locked,
  onMark, onMarkAll, onRetry, completionAction, emptyAction,
}: RosterCheckInProps) {
  const [query, setQuery] = useState('')
  // Typing stays instant on a phone keyboard; the list follows a beat behind.
  const deferredQuery = useDeferredValue(query)
  const [filter, setFilter] = useState<RosterFilter>('all')
  const [bulkBusy, setBulkBusy] = useState(false)
  // The pupil whose absence is being annotated, if any.
  const [noteFor, setNoteFor] = useState<{ student: Student; status: MarkStatus } | null>(null)
  const [noteDraft, setNoteDraft] = useState('')

  // Row numbers follow the roster, not the filtered view, so a teacher
  // searching for one pupil still sees the number they have on paper.
  const rowNumber = useMemo(() => new Map(students.map((s, i) => [s.id, i + 1])), [students])

  const summary = useMemo(() => registerSummary(students, marks), [students, marks])
  const counts = useMemo(() => filterCounts(students, marks), [students, marks])
  const visible = useMemo(
    () => visibleRoster(students, marks, filter, deferredQuery),
    [students, marks, filter, deferredQuery],
  )

  const openNote = (student: Student, status: MarkStatus) => {
    setNoteDraft(marks[student.id]?.note ?? '')
    setNoteFor({ student, status })
  }

  const mark = async (student: Student, status: MarkStatus) => {
    const current = marks[student.id]?.status
    if (current === status) {
      // Re-tapping an absence is how the reason is reached; re-tapping
      // present is a no-op, never a toggle back to unmarked.
      if (isAbsence(status)) openNote(student, status)
      return
    }
    // The note is carried across an absence → absence change and dropped on
    // the way to present, where it would describe nothing.
    const note = isAbsence(status) ? (marks[student.id]?.note ?? '') : ''
    const res = await onMark(student.id, status, note)
    // Ask for the reason once the mark has landed. If it did not, the row is
    // already saying so and a sheet on top of that would bury the message.
    if (!res.error && isAbsence(status)) openNote(student, status)
  }

  const submitNote = async () => {
    if (!noteFor) return
    const { student, status } = noteFor
    setNoteFor(null)
    await onMark(student.id, status, noteDraft.trim())
  }

  const markAll = async () => {
    setBulkBusy(true)
    await onMarkAll(ENTRY_MARKS[0].code)
    setBulkBusy(false)
    setFilter('all')
  }

  if (students.length === 0) {
    return (
      <EmptyState
        title="មិនទាន់មានសិស្សក្នុងថ្នាក់នេះ"
        description="បញ្ចូលសិស្សជាមុនសិន ទើបអាចចុះវត្តមានបាន។"
        action={emptyAction}
      />
    )
  }

  const failedCount = Object.keys(failed).length

  return (
    <div className="flex flex-col gap-3">
      {/* ── Search + filters ───────────────────────────────────────────── */}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ស្វែងរកសិស្ស (ឈ្មោះ ឬលេខសិស្ស)"
          aria-label="ស្វែងរកសិស្ស"
          className={controlClass(false, 'pl-9')}
        />
      </div>

      <div role="group" aria-label="ត្រងតាមវត្តមាន" className="flex flex-wrap gap-1.5">
        {ROSTER_FILTERS.map((f) => {
          const on = filter === f.id
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(f.id)}
              className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-bold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                on
                  ? 'border-brand bg-brand text-brand-contrast'
                  : 'border-divider bg-bg-surface text-text-body hover:border-brand/60'
              }`}
            >
              {f.label}
              <span className={`tabular-nums ${on ? 'opacity-90' : 'text-text-muted'}`}>
                {toKhmerNumber(counts[f.id])}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Done ───────────────────────────────────────────────────────── */}
      {summary.complete && failedCount === 0 && (
        <section
          aria-label="វត្តមានថ្ងៃនេះបានបញ្ចប់"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-text-heading">វត្តមានថ្ងៃនេះបានបញ្ចប់</p>
            <p className="text-xs text-text-muted tabular-nums">
              {toKhmerNumber(summary.total)} / {toKhmerNumber(summary.total)} នាក់
              {' · '}✓ មក {toKhmerNumber(summary.present)}
              {' · '}○ ច្បាប់ {toKhmerNumber(summary.excused)}
              {' · '}× អវត្តមាន {toKhmerNumber(summary.unexcused)}
            </p>
          </div>
          {completionAction}
        </section>
      )}

      {/* ── The roster ─────────────────────────────────────────────────── */}
      {visible.length === 0 ? (
        <EmptyState
          kind="filtered"
          title={deferredQuery ? 'រកមិនឃើញសិស្ស' : EMPTY_FILTER[filter]}
          description={deferredQuery ? 'សាកល្បងវាយឈ្មោះ ឬលេខសិស្សផ្សេង។' : undefined}
          action={
            (filter !== 'all' || deferredQuery) && (
              <Button variant="secondary" size="sm" printHidden={false} onClick={() => { setFilter('all'); setQuery('') }}>
                បង្ហាញទាំងអស់
              </Button>
            )
          }
        />
      ) : (
        <ul className="divide-y divide-divider overflow-hidden rounded-xl border border-divider bg-bg-surface">
          {visible.map((s) => {
            const current = marks[s.id]?.status
            const note = marks[s.id]?.note
            const away = isAbsence(current)
            const pending = pendingIds.has(s.id)
            const failure = failed[s.id]
            return (
              <li
                key={s.id}
                className={`flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3 ${failure ? 'bg-danger/5' : ''}`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span className="w-6 shrink-0 text-xs text-text-muted tabular-nums">
                    {toKhmerNumber(rowNumber.get(s.id) ?? 0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="kh-truncate block font-bold text-text-heading">{s.name_kh}</span>
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
                      <span className="shrink-0">{s.student_id || '—'}</span>
                      {away && !locked && (
                        <button
                          type="button"
                          onClick={() => openNote(s, current as MarkStatus)}
                          className="kh-truncate inline-flex min-w-0 items-center gap-1 rounded text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                        >
                          <MessageSquareText className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {note ? note : 'បន្ថែមមូលហេតុ'}
                        </button>
                      )}
                      {away && locked && note && <span className="kh-truncate">· {note}</span>}
                    </span>
                    {failure && (
                      <span role="alert" className="mt-1 flex flex-wrap items-center gap-2 text-xs text-danger-text">
                        <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
                        មិនទាន់បានធ្វើសមកាលកម្ម
                        <button
                          type="button"
                          onClick={() => onRetry(s.id)}
                          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-danger/40 px-2 font-bold hover:bg-danger/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                        >
                          <RefreshCw className="h-3 w-3" aria-hidden="true" />
                          ព្យាយាមម្តងទៀត
                        </button>
                      </span>
                    )}
                  </span>
                  {pending && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-muted" aria-label="កំពុងរក្សាទុក" />}
                </div>

                {/*
                  `role="group"` rather than a radio group: the three are a set,
                  but each is a button that writes immediately, and a teacher
                  arrowing between radios would fire three saves on the way.
                */}
                <div role="group" aria-label={`វត្តមានរបស់ ${s.name_kh}`} className="flex shrink-0 gap-1.5">
                  {MARKS.map((m) => {
                    const on = markFor(current)?.code === m.code
                    const Icon = m.icon
                    return (
                      <button
                        key={m.code}
                        type="button"
                        disabled={locked || pending}
                        aria-pressed={on}
                        onClick={() => mark(s, m.code)}
                        className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border-2 px-3 text-[13px] font-bold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:flex-none ${on ? m.on : m.off}`}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" strokeWidth={on ? 3 : 2} />
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

      {/* ── The one primary action, under the thumb until nothing is left ── */}
      {!locked && (!summary.complete || failedCount > 0 || saveState === 'saving') && (
        <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-20 flex items-center gap-3 rounded-xl border border-divider bg-bg-surface/95 p-2.5 shadow-lg backdrop-blur lg:bottom-4 print:hidden">
          <SaveStateLabel state={saveState} failedCount={failedCount} />
          {!summary.complete && (
            <Button
              variant="success"
              printHidden={false}
              onClick={markAll}
              loading={bulkBusy}
              icon={<ListChecks className="h-4 w-4" />}
              className="ml-auto"
            >
              មកទាំងអស់
              <span className="tabular-nums opacity-90">({toKhmerNumber(summary.unmarked)})</span>
            </Button>
          )}
        </div>
      )}

      {/* ── Reason ────────────────────────────────────────────────────── */}
      <BottomSheet
        open={noteFor !== null}
        onClose={() => setNoteFor(null)}
        title={noteFor ? `មូលហេតុ៖ ${noteFor.student.name_kh}` : 'មូលហេតុ'}
        description={noteFor ? `${markFor(noteFor.status)?.label ?? ''} · មិនចាំបាច់បំពេញក៏បាន` : undefined}
      >
        <div className="flex flex-col gap-3">
          <div role="group" aria-label="មូលហេតុរហ័ស" className="flex flex-wrap gap-1.5">
            {QUICK_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={noteDraft === r}
                onClick={() => setNoteDraft(r)}
                className={`min-h-9 rounded-full border px-3 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                  noteDraft === r ? 'border-brand bg-brand text-brand-contrast' : 'border-divider bg-bg-surface text-text-body hover:border-brand/60'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={2}
            aria-label="មូលហេតុ"
            placeholder="សរសេរមូលហេតុ..."
            className="w-full rounded-lg border border-divider bg-bg-surface p-3 text-sm text-text-heading outline-none focus:border-brand focus:ring-2 focus:ring-focus-ring/30"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" printHidden={false} onClick={() => setNoteFor(null)}>រំលង</Button>
            <Button printHidden={false} onClick={submitNote}>រក្សាទុក</Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}

/** The save state, in words and a glyph — never a colour alone. */
function SaveStateLabel({ state, failedCount }: { state: SaveState; failedCount: number }) {
  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-text-muted" role="status">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />កំពុងរក្សាទុក...
      </span>
    )
  }
  if (state === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-danger-text" role="status">
        <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
        រក្សាទុកមិនបាន {failedCount > 0 && `(${toKhmerNumber(failedCount)})`}
      </span>
    )
  }
  if (state === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-success" role="status">
        <Check className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={3} />បានរក្សាទុក
      </span>
    )
  }
  return <span className="text-xs text-text-muted">ចុចសម្គាល់ម្នាក់ៗ ឬ មកទាំងអស់</span>
}

export default RosterCheckIn
