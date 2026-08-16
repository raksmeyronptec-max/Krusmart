'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Printer, Search, Send, Sparkles, Sun, Users, X } from 'lucide-react'

import { Button } from '@/components/ui/actions/Button'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { Skeleton } from '@/components/ui/feedback/Skeleton'
import { notify } from '@/components/ui/feedback/notify'
import { useConfirm } from '@/components/ui/overlay/ConfirmDialog'
import { PageContainer } from '@/components/shell/PageContainer'
import { controlClass } from '@/components/ui/forms/fieldStyles'

import { getScores, saveScores } from '../../score/enter/actions'
import { useActiveClass } from '@/lib/hooks/useActiveClass'
import { DEFAULT_SCHEME_CONFIG } from '@/lib/grading/scheme'
import { MONTH_LABEL_BY_ID } from '@/lib/constants/months'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import { khmerWeekday } from '@/lib/constants/weekdays'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { getErrorMessageOr } from '@/lib/utils/errors'
import { logger } from '@/lib/utils/logger'

import { HomeworkEntryHeader } from './HomeworkEntryHeader'
import { HomeworkModeToggle, type HomeworkMode } from './HomeworkModeToggle'
import { HomeworkPeriodControls } from './HomeworkPeriodControls'
import { HomeworkBulkFill } from './HomeworkBulkFill'
import { HomeworkDailyRoster } from './HomeworkDailyRoster'
import { HomeworkMonthlyGrid } from './HomeworkMonthlyGrid'
import { HomeworkSaveBar, type SaveState } from './HomeworkSaveBar'
import { HomeworkPrintSheet } from './HomeworkPrintSheet'
import {
  defaultHomeworkSelection,
  homeworkCellSubject,
  homeworkCycleDays,
  homeworkPeriodKey,
  parseHomeworkCellDay,
} from './period'
import {
  cellKey,
  cycleProgress,
  dayProgress as dayProgressOf,
  markIssue,
  type HomeworkScores,
} from './scores'
import type { ScoreInput, Settings, Student } from '@/lib/types'

/**
 * បញ្ចូលពិន្ទុកិច្ចការផ្ទះ — the homework mark book.
 *
 * The screen is a *view* over the `scores` table, not a store of its own. Every
 * mark is written through the shared score actions with the conventions
 * `score_type = 'homework'`, `score_period = '<academicYear>_<monthId>'` and
 * `subject = 'hw_<dayOfMonth>'`, which `students/[id]` reads back — see
 * `period.ts`, where all three live.
 *
 * Three things drive the layout:
 *
 *  - Daily entry is the default because it is the daily job. One day, one
 *    column, one row per pupil, and Arrow/Enter walking down it.
 *  - Monthly review is a second mode over the *same loaded period*, so moving
 *    between them costs nothing and discards nothing.
 *  - Everything the teacher needs to trust the screen — which class, which
 *    cycle, how many marks are unsaved — is on screen at all times. The page
 *    this replaces displayed a permanent "cloud ready" badge and nothing else.
 *
 * Saving sends only the cells that changed. The previous version walked the
 * whole grid and re-upserted every mark already in the period, so correcting
 * one score in a fully-marked month rewrote around seven hundred rows and
 * logged all of them as a single audit entry of that size. `saveScores` upserts
 * exactly what it is given, so a two-mark correction is now a two-row write —
 * with the same conflict target and the same V2 `class_id` /
 * `academic_year_id` stamping as before.
 */

/** Marks are typed against the app's default ten-point scheme. */
const MAX_SCORE = DEFAULT_SCHEME_CONFIG.maxScore

export interface HomeworkEnterClientProps {
  initialStudents: Student[]
  settings: Settings | null
  /**
   * The class the server resolved from `?class=`, already validated against
   * this teacher's assignments. `null` for a pre-V2 account, which scopes by
   * `teacher_id` instead.
   */
  scopeClassId: string | null
}

export default function HomeworkEnterClient({
  initialStudents,
  settings,
  scopeClassId,
}: HomeworkEnterClientProps) {
  const [mode, setMode] = useState<HomeworkMode>('daily')

  // The clock cannot be read during render without risking a hydration
  // mismatch, so the real selection lands in an effect and `ready` holds the
  // first fetch back until it does — otherwise the screen would load November
  // and then immediately load the correct month.
  const [ready, setReady] = useState(false)
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear)
  const [monthId, setMonthId] = useState('nov')
  const [selectedDay, setSelectedDay] = useState(1)

  const [scores, setScores] = useState<HomeworkScores>({})
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  const [dirtyCells, setDirtyCells] = useState<Set<string>>(new Set())
  const [savedCells, setSavedCells] = useState<Set<string>>(new Set())
  const [liveMessage, setLiveMessage] = useState('')

  const [query, setQuery] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  /** Grid + dirty set as they were before the last bulk fill, for one undo. */
  const [undoSnapshot, setUndoSnapshot] = useState<{
    scores: HomeworkScores
    dirty: Set<string>
  } | null>(null)

  const { confirm, dialog } = useConfirm()
  const { assignments, assignment } = useActiveClass()

  // Mirrors of state that effects and timers must read *after* a render has
  // been scheduled but before it commits.
  const scoresRef = useRef<HomeworkScores>({})
  const dirtyRef = useRef<Set<string>>(new Set())
  const periodRef = useRef('')

  const period = homeworkPeriodKey(academicYear, monthId)

  // Mirrored rather than assigned during render: the class-change effect below
  // reads it, and writing a ref while rendering is not safe under concurrent
  // rendering. The period never changes in the same commit as the class, so the
  // mirror is always current by the time that effect runs.
  useEffect(() => {
    periodRef.current = period
  }, [period])

  // ------------------------------------------------------------ selection

  useEffect(() => {
    const start = defaultHomeworkSelection()
    /* eslint-disable react-hooks/set-state-in-effect -- derives from the current date, which is impure and cannot run during render */
    setAcademicYear(start.academicYear)
    setMonthId(start.monthId)
    setSelectedDay(start.dayNum)
    setReady(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  const academicYearOptions = useMemo(() => {
    const start = parseInt(getCurrentAcademicYear().split('-')[0], 10)
    return [-2, -1, 0, 1, 2].map((delta) => {
      const y = start + delta
      return { value: `${y}-${y + 1}`, label: `${toKhmerNumber(y)}-${toKhmerNumber(y + 1)}` }
    })
  }, [])

  const days = useMemo(() => homeworkCycleDays(academicYear, monthId), [academicYear, monthId])

  // A day carried over from the previous month may not exist in this cycle —
  // February has no 30th. Fall back to the first day rather than rendering an
  // empty column.
  const activeDay = useMemo(
    () => days.find((d) => d.dayNum === selectedDay) ?? days[0],
    [days, selectedDay],
  )

  useEffect(() => {
    if (days.length > 0 && !days.some((d) => d.dayNum === selectedDay)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- repairs an out-of-range selection after the cycle changes shape
      setSelectedDay(days[0].dayNum)
    }
  }, [days, selectedDay])

  // --------------------------------------------------------------- loading

  const loadScores = useCallback(async () => {
    setLoadState('loading')
    try {
      const rows = await getScores('homework', period, scopeClassId ?? undefined)

      const next: HomeworkScores = {}
      for (const row of rows) {
        const day = parseHomeworkCellDay(row.subject)
        if (day === null) continue
        if (!next[row.student_id]) next[row.student_id] = {}
        next[row.student_id][day] =
          row.score_value === null || row.score_value === undefined ? '' : String(row.score_value)
      }

      scoresRef.current = next
      dirtyRef.current = new Set()
      setScores(next)
      setDirtyCells(new Set())
      setSavedCells(new Set())
      setUndoSnapshot(null)
      setSaveState('idle')
      setSaveError(null)
      setLoadState('ready')
    } catch (error) {
      logger.error('Failed to load homework scores', error)
      setLoadState('error')
    }
  }, [period, scopeClassId])

  /**
   * Switching class in the top navigation replaces the roster underneath us.
   *
   * This effect is declared *before* the loader so it runs first in the same
   * commit and can still read the outgoing class's marks off the refs. They are
   * written against the class they were typed for — the id the server had
   * already validated — rather than being silently dropped or, worse, stamped
   * with the new class.
   */
  const previousScopeRef = useRef(scopeClassId)
  useEffect(() => {
    const previous = previousScopeRef.current
    if (previous === scopeClassId) return
    previousScopeRef.current = scopeClassId

    const pending = [...dirtyRef.current]
    if (pending.length === 0) return

    const payload = buildPayload(pending, scoresRef.current)
    dirtyRef.current = new Set()
    setDirtyCells(new Set())

    saveScores('homework', periodRef.current, payload, previous ?? undefined)
      .then((res) => {
        if (res.error) {
          notify.error(`ពិន្ទុថ្នាក់មុនរក្សាទុកមិនបានសម្រេច៖ ${res.error}`)
          return
        }
        notify.success(
          `បានរក្សាទុកពិន្ទុ ${toKhmerNumber(payload.length)} ប្រអប់ របស់ថ្នាក់មុនដោយស្វ័យប្រវត្តិ`,
        )
      })
      .catch((error) => {
        logger.error('Failed to flush homework marks on class change', error)
        notify.error('ពិន្ទុថ្នាក់មុនរក្សាទុកមិនបានសម្រេច')
      })
  }, [scopeClassId])

  useEffect(() => {
    if (!ready) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is set after await, not synchronously
    loadScores()
  }, [ready, loadScores])

  // A reload or a closed tab is the one navigation the browser lets us guard.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current.size === 0) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // ---------------------------------------------------------------- editing

  const handleChange = useCallback((studentId: string, dayNum: number, value: string) => {
    const key = cellKey(studentId, dayNum)

    dirtyRef.current.add(key)
    setDirtyCells(new Set(dirtyRef.current))
    setSavedCells((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    // A hand edit ends the bulk fill's undo window: restoring the snapshot from
    // here would also throw away the mark just typed.
    setUndoSnapshot(null)
    setSaveState((prev) => (prev === 'error' ? 'idle' : prev))

    setScores((prev) => {
      const next = { ...prev, [studentId]: { ...(prev[studentId] ?? {}), [dayNum]: value } }
      scoresRef.current = next
      return next
    })
  }, [])

  /**
   * Run something that will replace the loaded period.
   *
   * Only year and month go through here. Day and mode are views over marks that
   * are already in memory, so they never discard anything and never ask.
   */
  const switchPeriod = useCallback(
    async (apply: () => void) => {
      if (
        dirtyRef.current.size > 0 &&
        !(await confirm({
          title: 'ពិន្ទុមិនទាន់រក្សាទុក',
          message: `អ្នកបានបញ្ចូលពិន្ទុ ${toKhmerNumber(dirtyRef.current.size)} ប្រអប់ដែលមិនទាន់រក្សាទុក។ ប្តូរខែ ឬឆ្នាំសិក្សានឹងបាត់បង់ពិន្ទុទាំងនោះ។`,
          tone: 'warning',
          confirmLabel: 'បន្តដោយមិនរក្សាទុក',
        }))
      ) {
        return
      }
      dirtyRef.current = new Set()
      setDirtyCells(new Set())
      apply()
    },
    [confirm],
  )

  // ----------------------------------------------------------------- saving

  const handleSave = useCallback(async () => {
    const pending = [...dirtyRef.current]
    if (pending.length === 0) return

    setSaveState('saving')
    setSaveError(null)

    try {
      const payload = buildPayload(pending, scoresRef.current)
      const res = await saveScores('homework', period, payload, scopeClassId ?? undefined)

      if (res.error) {
        setSaveState('error')
        setSaveError(res.error)
        notify.error(`រក្សាទុកមិនបានសម្រេច៖ ${res.error}`)
        return
      }

      // Only the keys just written leave the pending set; anything typed while
      // the request was in flight stays queued for the next save.
      dirtyRef.current = new Set([...dirtyRef.current].filter((k) => !pending.includes(k)))
      setDirtyCells(new Set(dirtyRef.current))
      setSavedCells(new Set(pending))
      setUndoSnapshot(null)
      setSaveState('idle')
      notify.success(`បានរក្សាទុកពិន្ទុ ${toKhmerNumber(pending.length)} ប្រអប់`)
      setLiveMessage(`បានរក្សាទុកពិន្ទុ ${toKhmerNumber(pending.length)} ប្រអប់`)
    } catch (error) {
      logger.error('Failed to save homework scores', error)
      const message = getErrorMessageOr(error, 'មិនអាចភ្ជាប់ទៅម៉ាស៊ីនមេបានទេ')
      setSaveState('error')
      setSaveError(message)
      notify.error(`រក្សាទុកមិនបានសម្រេច៖ ${message}`)
    }
  }, [period, scopeClassId])

  // Ctrl/Cmd+S — the one shortcut a teacher mid-entry already knows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSave])

  const handleDiscard = useCallback(async () => {
    if (
      !(await confirm({
        title: 'បោះបង់ការកែប្រែ',
        message: `ពិន្ទុ ${toKhmerNumber(dirtyRef.current.size)} ប្រអប់ដែលមិនទាន់រក្សាទុកនឹងបាត់បង់ ហើយតារាងនឹងផ្ទុកឡើងវិញ។`,
        tone: 'warning',
        confirmLabel: 'បោះបង់ការកែប្រែ',
      }))
    ) {
      return
    }
    dirtyRef.current = new Set()
    setDirtyCells(new Set())
    loadScores()
  }, [confirm, loadScores])

  // ------------------------------------------------------------- bulk fill

  const visibleStudents = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return initialStudents
    return initialStudents.filter((s) =>
      [s.name_kh, s.name_en, s.student_id].some((f) => String(f ?? '').toLowerCase().includes(q)),
    )
  }, [initialStudents, query])

  const applyBulk = useCallback(
    (value: string, onlyEmpty: boolean) => {
      if (!activeDay || activeDay.isSunday) return

      setUndoSnapshot({ scores: scoresRef.current, dirty: new Set(dirtyRef.current) })

      const next: HomeworkScores = { ...scoresRef.current }
      let applied = 0

      for (const stu of visibleStudents) {
        const row = { ...(next[stu.id] ?? {}) }
        const current = row[activeDay.dayNum]
        if (onlyEmpty && current !== undefined && current !== '') continue
        row[activeDay.dayNum] = value
        next[stu.id] = row
        dirtyRef.current.add(cellKey(stu.id, activeDay.dayNum))
        applied += 1
      }

      scoresRef.current = next
      setScores(next)
      setDirtyCells(new Set(dirtyRef.current))
      setBulkOpen(false)

      if (applied === 0) {
        notify.info('សិស្សទាំងអស់មានពិន្ទុរួចហើយ — គ្មានអ្វីត្រូវផ្លាស់ប្តូរទេ')
        setUndoSnapshot(null)
        return
      }

      notify.success(
        `បានផ្តល់ពិន្ទុ ${value} ដល់សិស្ស ${toKhmerNumber(applied)} នាក់ — មិនទាន់រក្សាទុកទេ`,
      )
      setLiveMessage(`បានផ្តល់ពិន្ទុដល់សិស្ស ${toKhmerNumber(applied)} នាក់`)
    },
    [activeDay, visibleStudents],
  )

  const undoBulk = useCallback(() => {
    if (!undoSnapshot) return
    scoresRef.current = undoSnapshot.scores
    dirtyRef.current = new Set(undoSnapshot.dirty)
    setScores(undoSnapshot.scores)
    setDirtyCells(new Set(undoSnapshot.dirty))
    setUndoSnapshot(null)
    notify.success('បានត្រឡប់ការផ្តល់ពិន្ទុជាក្រុមវិញ')
  }, [undoSnapshot])

  // ------------------------------------------------------------ statistics

  const rowNumbers = useMemo(
    () => new Map(initialStudents.map((s, i) => [s.id, i + 1])),
    [initialStudents],
  )

  const studentIds = useMemo(() => initialStudents.map((s) => s.id), [initialStudents])

  const dayStats = useMemo(
    () => dayProgressOf(studentIds, scores, activeDay?.dayNum ?? -1),
    [studentIds, scores, activeDay],
  )

  const monthStats = useMemo(
    () => cycleProgress(studentIds, scores, days),
    [studentIds, scores, days],
  )

  /** Cells the teacher must fix, and cells that merely look unusual. */
  const issues = useMemo(() => {
    let errors = 0
    let warnings = 0
    for (const key of dirtyCells) {
      const sep = key.indexOf(':')
      const studentId = key.slice(0, sep)
      const dayNum = Number(key.slice(sep + 1))
      const issue = markIssue(scores[studentId]?.[dayNum], MAX_SCORE)
      if (issue?.level === 'error') errors += 1
      if (issue?.level === 'warning') warnings += 1
    }
    return { errors, warnings }
  }, [dirtyCells, scores])

  const femaleCount = initialStudents.filter(
    (s) => s.gender === 'ស្រី' || s.gender === 'F',
  ).length

  const monthLabel = MONTH_LABEL_BY_ID[monthId] ?? monthId
  const activeAssignment =
    assignments.find((a) => a.class_id === scopeClassId) ?? (scopeClassId ? null : assignment)

  // ---------------------------------------------------------------- render

  const hasStudents = initialStudents.length > 0
  const sundayBlocked = mode === 'daily' && activeDay?.isSunday === true

  return (
    <PageContainer>
      <style jsx global>{`
        /* The spin buttons steal the width a two-digit mark needs, and a
           teacher never nudges a homework score one unit at a time. */
        input[type='number']::-webkit-inner-spin-button,
        input[type='number']::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type='number'] {
          -moz-appearance: textfield;
        }

        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
        .hw-print-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 8.5pt;
        }
        .hw-print-table th,
        .hw-print-table td {
          border: 1px solid #444;
          padding: 1px 2px;
          text-align: center;
        }
        .hw-print-table th {
          background-color: #f1f5f9;
          font-weight: 700;
        }
        .hw-print-table .sun {
          background-color: #fff1f1;
        }
      `}</style>

      {/*
        The screen tool is `data-app-chrome`, which `globals.css` removes when
        printing — the entry grid scrolls sideways and carries sticky columns
        that print as overlapping ink. The A4 sheet below is what reaches paper,
        and it always shows the full month whichever mode is on screen.
      */}
      <div data-app-chrome>
        <HomeworkEntryHeader
          className={activeAssignment?.class_name ?? ''}
          academicYearName={activeAssignment?.academic_year_name ?? ''}
          academicYear={academicYear}
          monthLabel={monthLabel}
          days={days}
          dayProgress={dayStats}
          monthProgress={monthStats}
          studentCount={initialStudents.length}
          femaleCount={femaleCount}
        />

        {/* --------------------------------------------------- task toolbar */}
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-divider bg-bg-surface p-3 shadow-sm md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <HomeworkModeToggle mode={mode} onChange={setMode} />

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/homework/send"
                className="flex min-h-11 items-center gap-2 rounded-lg border border-divider bg-bg-surface px-4 text-[13px] font-bold text-text-body transition hover:border-brand-400 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <Send className="h-4 w-4" aria-hidden="true" /> បញ្ជូនកិច្ចការ
              </Link>
              <Button variant="secondary" printHidden={false} onClick={() => window.print()}>
                <Printer className="h-4 w-4" aria-hidden="true" /> បោះពុម្ព
              </Button>
            </div>
          </div>

          <HomeworkPeriodControls
            academicYear={academicYear}
            onAcademicYearChange={(v) => switchPeriod(() => setAcademicYear(v))}
            academicYearOptions={academicYearOptions}
            monthId={monthId}
            onMonthChange={(v) => switchPeriod(() => setMonthId(v))}
            showDayPicker={mode === 'daily'}
            days={days}
            selectedDay={activeDay?.dayNum ?? selectedDay}
            onDayChange={setSelectedDay}
          />

          <div className="flex flex-wrap items-center gap-2">
            {mode === 'daily' && (
              <Button
                size="sm"
                variant="secondary"
                printHidden={false}
                disabled={!hasStudents || sundayBlocked || loadState !== 'ready'}
                onClick={() => setBulkOpen(true)}
                title={
                  sundayBlocked
                    ? 'ថ្ងៃអាទិត្យមិនអនុញ្ញាតឱ្យបញ្ចូលពិន្ទុ'
                    : 'ផ្តល់ពិន្ទុតែមួយដល់សិស្សក្នុងបញ្ជី'
                }
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> ផ្តល់ពិន្ទុដូចគ្នា
              </Button>
            )}

            <div className="relative min-w-[180px] flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ស្វែងរកឈ្មោះសិស្ស"
                aria-label="ស្វែងរកសិស្ស"
                className={controlClass(false, 'pl-9')}
              />
            </div>
          </div>
        </div>

        {/* ------------------------------------------------- Sunday notice */}
        {sundayBlocked && activeDay && (
          <p
            role="status"
            className="mb-4 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
          >
            <Sun className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <span>
              <strong>{khmerWeekday(activeDay.date)} ទី {toKhmerNumber(activeDay.dayNum)}</strong> ជាថ្ងៃឈប់សម្រាក។
              ពិន្ទុកិច្ចការផ្ទះមិនត្រូវបានបញ្ចូលទេ។ សូមជ្រើសរើសថ្ងៃធ្វើការផ្សេង។
            </span>
          </p>
        )}

        {/* -------------------------------------------------------- content */}
        {loadState === 'loading' ? (
          <div className="flex flex-col gap-2.5" role="status" aria-busy="true">
            <span className="sr-only">កំពុងទាញយកពិន្ទុកិច្ចការផ្ទះ...</span>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : loadState === 'error' ? (
          <div className="rounded-xl border border-divider bg-bg-surface">
            <EmptyState
              kind="error"
              title="ទាញយកពិន្ទុមិនបានសម្រេច"
              description="ការតភ្ជាប់មានបញ្ហា។ ពិន្ទុដែលមានស្រាប់នៅតែសុវត្ថិភាព — សូមព្យាយាមម្តងទៀត។"
              action={
                <Button printHidden={false} onClick={loadScores}>
                  ព្យាយាមម្តងទៀត
                </Button>
              }
            />
          </div>
        ) : !hasStudents ? (
          <div className="rounded-xl border border-divider bg-bg-surface">
            <EmptyState
              title="មិនទាន់មានសិស្សក្នុងថ្នាក់នេះ"
              description="ចុះឈ្មោះសិស្សជាមុនសិន រួចត្រឡប់មកបញ្ចូលពិន្ទុកិច្ចការផ្ទះ។"
              action={
                <Link
                  href="/student-list"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-brand-contrast transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <Users className="h-4 w-4" aria-hidden="true" /> ចុះឈ្មោះសិស្ស
                </Link>
              }
            />
          </div>
        ) : visibleStudents.length === 0 ? (
          <div className="rounded-xl border border-divider bg-bg-surface">
            <EmptyState
              kind="filtered"
              title="រកមិនឃើញសិស្ស"
              description="គ្មានសិស្សត្រូវនឹងពាក្យស្វែងរកនេះទេ។"
              action={
                <Button variant="secondary" printHidden={false} onClick={() => setQuery('')}>
                  <X className="h-4 w-4" aria-hidden="true" /> សម្អាតការស្វែងរក
                </Button>
              }
            />
          </div>
        ) : mode === 'daily' && activeDay ? (
          <HomeworkDailyRoster
            students={visibleStudents}
            day={activeDay}
            scores={scores}
            onChange={handleChange}
            savedCells={savedCells}
            rowNumbers={rowNumbers}
            maxScore={MAX_SCORE}
          />
        ) : (
          <HomeworkMonthlyGrid
            students={visibleStudents}
            days={days}
            scores={scores}
            onChange={handleChange}
            savedCells={savedCells}
            rowNumbers={rowNumbers}
            maxScore={MAX_SCORE}
            onPickDay={(day) => {
              setSelectedDay(day)
              setMode('daily')
            }}
          />
        )}

        {hasStudents && loadState === 'ready' && (
          <HomeworkSaveBar
            state={saveState}
            dirtyCount={dirtyCells.size}
            errorCount={issues.errors}
            warningCount={issues.warnings}
            errorMessage={saveError}
            progress={mode === 'daily' ? dayStats : monthStats}
            progressLabel={mode === 'daily' ? 'បានបញ្ចូលថ្ងៃនេះ' : 'បំពេញពេញវដ្ត'}
            canUndo={undoSnapshot !== null}
            onUndo={undoBulk}
            onDiscard={handleDiscard}
            onSave={handleSave}
          />
        )}

        {/* Saves are announced without a toast per cell, for screen readers. */}
        <p className="sr-only" role="status" aria-live="polite">
          {liveMessage}
        </p>
      </div>

      <HomeworkPrintSheet
        students={initialStudents}
        days={days}
        scores={scores}
        settings={settings}
        academicYear={academicYear}
        monthLabel={monthLabel}
      />

      <HomeworkBulkFill
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        day={activeDay}
        studentCount={visibleStudents.length}
        maxScore={MAX_SCORE}
        onApply={applyBulk}
      />

      {dialog}
    </PageContainer>
  )
}

/**
 * Turn a set of `studentId:day` keys into the upsert payload.
 *
 * A blank cell is sent as `null` on purpose: that is how a mark is *removed*,
 * and it only happens for a cell the teacher actually cleared, because only
 * touched cells reach the pending set.
 */
function buildPayload(keys: string[], scores: HomeworkScores): ScoreInput[] {
  return keys.map((key) => {
    const sep = key.indexOf(':')
    const studentId = key.slice(0, sep)
    const dayNum = Number(key.slice(sep + 1))
    const raw = scores[studentId]?.[dayNum]

    return {
      student_id: studentId,
      subject: homeworkCellSubject(dayNum),
      score_value: raw === undefined || raw === '' ? null : raw,
    }
  })
}
