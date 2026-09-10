'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
    CalendarCheck, Award, CalendarDays, Bookmark, Clock, BookOpen,
    Mic, UserCheck, Book, Home, Save, Loader2, Search, Rows3, Grid3x3,
    CopyPlus, Users, ListChecks, Gauge, Sparkles, RotateCcw, Check, X,
    SlidersHorizontal, Lock,
} from 'lucide-react'

import { Button } from '@/components/ui/actions/Button'
import { Dialog } from '@/components/ui/overlay/Dialog'
import { useConfirm } from '@/components/ui/overlay/ConfirmDialog'
import { notify } from '@/components/ui/feedback/notify'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { Skeleton } from '@/components/ui/feedback/Skeleton'
import { PageContainer } from '@/components/shell/PageContainer'
import { ScoreWorkspaceHeader } from '@/components/score/ScoreWorkspaceHeader'
import { controlClass, fieldLabel, requiredMark } from '@/components/ui/forms/fieldStyles'
import Select from '@/components/ui/forms/Select'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import { ScoreEntryList } from './ScoreEntryList'
import { ScoreEntryGrid } from './ScoreEntryGrid'

import { getScores, saveScores } from './actions'
import { clampScoreCell, scoreCellValue, splitScoreCell } from '@/lib/utils/score-value'
import { rosterProgress, type MarkRow } from '@/lib/scores/completion'
import { formatMark, letterOrDash, numericCell, styleFor } from '@/lib/utils/score-band'
import { levelByKey, trackLabel } from '@/lib/onboarding/curriculum'
import { coefficientAverage, coefficientOf, simpleAverage, DEFAULT_SCHEME_CONFIG } from '@/lib/grading/scheme'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { MonthId } from '@/lib/constants/months'
import { DEFAULT_CALENDAR, periodForDate } from '@/lib/scores/calendar'
import { useScoreCalendar } from '@/lib/hooks/useScoreCalendar'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import { allColumnsFor, subjectConfigs, subjectTitle } from './subjectConfigs'
import { useScoreTemplate } from '@/lib/hooks/useScoreTemplate'
import { useActiveClass } from '@/lib/hooks/useActiveClass'
import {
    columnsFor, maxScoreByColumn, toSubjectOptions, type SubjectColumn,
} from '@/lib/scores/template'
import type { Score, ScoreInput, Student } from '@/lib/types'
import { useClassHref } from '@/lib/hooks/useClassHref'

/**
 * បញ្ចូលពិន្ទុសិស្ស — the score entry screen.
 *
 * Two things drive the design. First, a teacher enters twenty to forty marks in
 * one sitting, usually copying them off a paper register, so the fastest path
 * has to be the default: the grid, with the pupil column pinned and the arrow
 * keys walking down a column. Second, they are doing it between classes, so the
 * screen has to say at a glance how far through they are — hence the progress
 * pill in the header and the same figure in the footer bar.
 *
 * Marks are written through `saveScores`, which upserts only the cells it is
 * given. That is what makes the auto-save safe: a single changed cell is a
 * one-row upsert, not a rewrite of the class. The explicit Save still sends
 * everything loaded, preserving the previous behaviour for a teacher who turns
 * auto-save off.
 *
 * Note on the mode tabs: this page covers the two score types that live here,
 * `monthly` and `semester`. Homework marks are a different `score_type` on a
 * different period format and have their own screen, so they are linked to
 * rather than folded in — see `/homework/enter` and the note in CLAUDE.md.
 */

/** How long a cell sits untouched before auto-save picks it up. */
const AUTOSAVE_DELAY = 1200

type ScoreType = 'monthly' | 'semester'
type ViewMode = 'list' | 'grid'

const MODES: { id: ScoreType; label: string; icon: typeof CalendarCheck; accent: string }[] = [
    { id: 'monthly', label: 'ពិន្ទុប្រចាំខែ', icon: CalendarCheck, accent: 'bg-brand text-brand-contrast' },
    { id: 'semester', label: 'ពិន្ទុប្រចាំឆមាស', icon: Award, accent: 'bg-warning text-white' },
]

const QUICK_SUBJECTS = [
    { id: 'ex_oral', label: 'សំណួរផ្ទាល់មាត់', icon: Mic, tone: 'text-brand' },
    { id: 'ex_att', label: 'វត្តមាន', icon: UserCheck, tone: 'text-success' },
    { id: 'ex_book', label: 'សៀវភៅ', icon: Book, tone: 'text-brand-700' },
    { id: 'ex_hw', label: 'កិច្ចការផ្ទះ', icon: Home, tone: 'text-warning-text' },
] as const

const cellKey = (studentId: string, columnId: string) => `${studentId}:${columnId}`

export default function ScoreEnterClient({ initialStudents }: { initialStudents: Student[] }) {
    // Keeps the working class on the way out: a link from this screen to
    // another class-scoped screen must still be about the same class.
    const classHref = useClassHref()
    /**
     * The period is seeded from the URL so "កែពិន្ទុ" on the totals table lands
     * on the month it was looking at, and so a teacher can bookmark the screen
     * they enter marks on every week.
     */
    const searchParams = useSearchParams()

    const [scoreType, setScoreType] = useState<ScoreType>(
        () => (searchParams.get('mode') === 'semester' ? 'semester' : 'monthly'),
    )
    // Was hard-coded `'2025-2026'`, which silently became the wrong year every
    // November. The picker still offers the neighbouring years either side.
    const [academicYear, setAcademicYear] = useState(() => searchParams.get('year') || getCurrentAcademicYear())
    const [semester, setSemester] = useState(() => searchParams.get('semester') || 'sem1')
    // Was a fixed 'nov': a teacher opening the screen in July was silently on
    // last November. The default now follows today's date through the calendar
    // (INV-4) — still overridden by ?month= from a bookmark or កែពិន្ទុ. Seeded
    // from the default calendar because the class's own arrives async; the
    // derivation below re-maps once it does.
    const [selectedMonth, setSelectedMonth] = useState(
        () => searchParams.get('month') || periodForDate(DEFAULT_CALENDAR, new Date())?.key || 'nov',
    )
    const [selectedSubject, setSubject] = useState(() => searchParams.get('subject') || 'math_general')

    const [view, setView] = useState<ViewMode>('grid')
    /** Grid only: show the picked subject's columns, or every column of the month. */
    const [gridScope, setGridScope] = useState<'subject' | 'all'>('subject')
    const [query, setQuery] = useState('')

    const [scoresData, setScoresData] = useState<Record<string, Record<string, string | number | null>>>({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [autoSave, setAutoSave] = useState(true)

    /**
     * Marks typed but not yet written, keyed `studentId:columnId`.
     *
     * Held in a ref as well as state because the auto-save timer fires outside
     * React's render cycle and must see the newest set, not the one captured
     * when the timer was scheduled.
     */
    const [pendingCells, setPendingCells] = useState<Set<string>>(new Set())
    const [savedCells, setSavedCells] = useState<Set<string>>(new Set())
    const pendingRef = useRef<Set<string>>(new Set())
    const scoresRef = useRef(scoresData)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    /** Announced to screen readers after a background write. */
    const [liveMessage, setLiveMessage] = useState('')

    const { confirm, dialog } = useConfirm()

    // The subject list for the active class, resolved system < school < class
    // from `score_template_subjects` (migration 00016). Falls back to the
    // seeded national default while the class context resolves, so the picker
    // is never momentarily empty.
    // `mySubjects` — a subject teacher may only enter their own subjects. The
    // full template (`subjects`) is what aggregation weighs and is deliberately
    // not what this picker offers.
    const {
        mySubjects: templateSubjects, configured, role, context, scheme,
        loading: templateLoading,
    } = useScoreTemplate(scoreType)
    // The configuration screen is a server component, so the class it should
    // open on has to travel in the URL — client state cannot reach it.
    const { classId: activeClassId } = useActiveClass()
    /*
     * Every mark read and written on this screen is scoped by the class.
     *
     * `getScores`/`saveScores` have taken a `classId` since the multi-class
     * work, and their doc comments describe precisely the failure it prevents —
     * "the roster came from the requested `?class=` while the marks came from
     * the homeroom, so a subject class showed an empty grid". No call site here
     * ever passed it, so the parameter existed and the bug did too.
     *
     * `?? undefined` keeps a legacy account on `teacher_id` scoping, unchanged.
     */
    const scopeClassId = activeClassId ?? undefined

    /**
     * The class's period calendar (00029). The month picker offers its periods
     * — an absorbed month (មេសា after a មីនា-មេសា merge) is no longer a choice,
     * and a stale `?month=` naming one resolves to the period that absorbed
     * it, whose anchor is where those marks store (INV-1). A month in no
     * period at all falls back to today's period. Derived, not synced state —
     * the same pattern as `subject` below.
     */
    const { calendar } = useScoreCalendar()
    const activePeriod = useMemo(
        () =>
            calendar.find((p) => p.key === selectedMonth)
            ?? calendar.find((p) => p.members.includes(selectedMonth as MonthId))
            ?? periodForDate(calendar, new Date()),
        [calendar, selectedMonth],
    )
    const month = activePeriod?.key ?? selectedMonth

    /**
     * A locked period (§11.8) renders read-only. The UI is a courtesy — the
     * boundary is `saveScores`, which refuses the write however it is called.
     * Only monthly periods lock; the semester grid is untouched.
     */
    const periodLocked = scoreType === 'monthly' && (activePeriod?.locked ?? false)

    const scorePeriod = scoreType === 'monthly' ? `${month}-${academicYear}` : `${semester}-${academicYear}`

    useEffect(() => { scoresRef.current = scoresData }, [scoresData])

    // `history.replaceState` rather than the router: the server component reads
    // only `?class=`, so a navigation would refetch the roster to render the
    // very same list.
    useEffect(() => {
        const url = new URL(window.location.href)
        url.searchParams.set('mode', scoreType)
        url.searchParams.set('year', academicYear)
        url.searchParams.set('subject', selectedSubject)
        if (scoreType === 'monthly') {
            url.searchParams.set('month', month)
            url.searchParams.delete('semester')
        } else {
            url.searchParams.set('semester', semester)
            url.searchParams.delete('month')
        }
        window.history.replaceState(null, '', url)
    }, [scoreType, academicYear, month, semester, selectedSubject])

    // The current year plus one either side, so the list follows the calendar
    // instead of expiring — it used to be three hard-coded strings.
    const academicYearOptions = useMemo(() => {
        const start = parseInt(getCurrentAcademicYear().split('-')[0], 10)
        return [start - 1, start, start + 1].map((y) => `${y}-${y + 1}`)
    }, [])

    // Semester subjects are prefixed `sem_`. If the teacher switches score type
    // while a subject from the other set is picked, fall back to that set's
    // default. Derived during render — this used to be an effect that re-set state.
    const subject = scoreType === 'monthly' && selectedSubject.startsWith('sem_') ? 'math_general'
        : scoreType === 'semester' && !selectedSubject.startsWith('sem_') ? 'sem_math'
        : selectedSubject

    /**
     * Columns for the picked subject.
     *
     * The template is authoritative — that is what lets a school change a
     * subject's columns without a deploy. `subjectConfigs` still answers for
     * the keys the template does not carry: the group members the picker never
     * offered directly, the teacher's own custom subjects, and any database
     * where 00016 has not run. For the fourteen keys both define, the two are
     * identical by construction (see `scripts/verify-score-template.mts`).
     */
    const subjectCols: SubjectColumn[] = useMemo(
        () => columnsFor(templateSubjects, subject) ?? subjectConfigs[subject] ?? [],
        [subject, templateSubjects],
    )

    /**
     * Columns the template adds beyond this file's hand-built primary layout —
     * a teacher's own subjects among them, since 00027 moved those out of
     * `custom_subjects` and into the template at `scope='class'`.
     *
     * Deduplicated against the built-in list because the two overlap for every
     * key 00016 seeded from it.
     */
    const templateExtraCols = useMemo(() => {
        const known = new Set(allColumnsFor(scoreType).map(c => c.id))
        const extra: SubjectColumn[] = []
        for (const col of templateSubjects.flatMap(s => s.columns)) {
            if (known.has(col.id)) continue
            known.add(col.id)
            extra.push(col)
        }
        return extra
    }, [templateSubjects, scoreType])

    /**
     * Full mark per column, from the resolved template.
     *
     * `EffectiveSubject.maxScore` was being resolved and then thrown away: the
     * grid received `DEFAULT_SCHEME_CONFIG.maxScore` at every call site, so a
     * subject whose maximum a school had changed still accepted marks up to 10.
     * The default still answers for anything the template does not define — the
     * `subjectConfigs` fallback keys and the teacher's own custom subjects.
     */
    const maxScores = useMemo(() => maxScoreByColumn(templateSubjects), [templateSubjects])
    const maxScoreFor = useCallback(
        (columnId: string) => maxScores[columnId] ?? DEFAULT_SCHEME_CONFIG.maxScore,
        [maxScores],
    )

    /**
     * Every column of the "whole month" grid.
     *
     * Once the class has chosen its subjects, that choice decides this list
     * too — entering the month at once is the view the noise hurts most, and
     * thirty columns for a class that teaches eight is exactly what §11 is
     * about. An unconfigured class keeps the hand-built report-card layout
     * byte-identical, so nothing moves for an account that never opts in.
     */
    const allCols = useMemo(() => {
        if (!configured) return [...allColumnsFor(scoreType), ...templateExtraCols]

        const seen = new Set<string>()
        const out: SubjectColumn[] = []
        for (const col of templateSubjects.flatMap(s => s.columns)) {
            if (seen.has(col.id)) continue
            seen.add(col.id)
            out.push(col)
        }
        return out
    }, [configured, scoreType, templateExtraCols, templateSubjects])

    /** Columns the current view actually edits. */
    const cols: SubjectColumn[] = useMemo(() => {
        if (view === 'grid' && gridScope === 'all') return allCols
        return subjectCols
    }, [view, gridScope, allCols, subjectCols])

    /**
     * Subject list for the picker.
     *
     * Was a literal array here — the Cambodian primary curriculum compiled into
     * the product, which a lower-secondary school had no way to change. It now
     * comes from `score_template_subjects` via `useScoreTemplate`.
     *
     * The teacher's own subjects come from the same place since 00027 retired
     * `custom_subjects`: they are class-scope template rows, and they still
     * group under `មុខវិជ្ជាបន្ថែម` because that is the `group_label` both the
     * conversion and the add dialog below write. One source writes this list.
     */
    const subjectOptions = useMemo(() => toSubjectOptions(templateSubjects), [templateSubjects])

    // ---------------------------------------------------------------- loading

    const loadData = useCallback(async () => {
        setLoading(true)
        const records = await getScores(scoreType, scorePeriod, scopeClassId)

        const next: Record<string, Record<string, string | number | null>> = {}
        initialStudents.forEach(stu => { next[stu.id] = {} })

        records.forEach((r: Score) => {
            if (!next[r.student_id]) next[r.student_id] = {}
            // Behavioural ratings live in `score_text`, numeric marks in
            // `score_value`; the grid renders one cell either way.
            next[r.student_id][r.subject] = scoreCellValue(r)
        })

        setScoresData(next)
        scoresRef.current = next
        pendingRef.current = new Set()
        setPendingCells(new Set())
        setSavedCells(new Set())
        setLoading(false)
    }, [scoreType, scorePeriod, initialStudents, scopeClassId])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is set after await, not synchronously during the effect
        loadData()
    }, [loadData])

    // ----------------------------------------------------------------- saving

    /**
     * Write cells to the database.
     *
     * `keys` omitted means "everything loaded", which is what the Save button
     * has always sent. The auto-save passes just the cells it is responsible
     * for, so a background write can never resurrect a value the teacher
     * cleared in a different subject.
     */
    const persist = useCallback(async (keys?: string[]) => {
        const data = scoresRef.current
        const targets = keys ?? Object.entries(data).flatMap(([sid, row]) =>
            Object.keys(row).map(cid => cellKey(sid, cid)))
        if (targets.length === 0) return { ok: true, count: 0 }

        const payload: ScoreInput[] = targets.map(key => {
            const sep = key.indexOf(':')
            const student_id = key.slice(0, sep)
            const cid = key.slice(sep + 1)
            return { student_id, subject: cid, score_value: data[student_id]?.[cid] ?? null }
        })

        const res = await saveScores(scoreType, scorePeriod, payload, scopeClassId)
        if (res.error) {
            notify.error('បរាជ័យក្នុងការរក្សាទុកពិន្ទុ៖ ' + res.error)
            return { ok: false, count: 0 }
        }

        // Only the keys just written leave the pending set; anything typed while
        // the request was in flight stays queued for the next pass.
        pendingRef.current = new Set([...pendingRef.current].filter(k => !targets.includes(k)))
        setPendingCells(new Set(pendingRef.current))
        setSavedCells(new Set(targets))
        return { ok: true, count: targets.length }
    }, [scoreType, scorePeriod, scopeClassId])

    const flushPending = useCallback(async () => {
        if (timerRef.current) clearTimeout(timerRef.current)
        const keys = [...pendingRef.current]
        if (keys.length === 0) return true
        const res = await persist(keys)
        if (res.ok) setLiveMessage(`បានរក្សាទុកពិន្ទុ ${toKhmerNumber(res.count)} កោសិកា`)
        return res.ok
    }, [persist])

    const scheduleAutoSave = useCallback(() => {
        if (!autoSave) return
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => { flushPending() }, AUTOSAVE_DELAY)
    }, [autoSave, flushPending])

    // A pending timer must not outlive the screen.
    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

    const handleScoreChange = useCallback((studentId: string, columnId: string, value: string) => {
        // Every edit path flows through here — typing, paste, the selects —
        // so one guard covers them all. Bulk fill and copy write directly and
        // have their buttons disabled instead.
        if (periodLocked) return
        // The input's `max` attribute validates but does not filter — typing 11
        // in a /10 cell still delivers '11' here, so the cell snaps to 10 now.
        // Khmer ratings pass through the clamp untouched.
        const clamped = clampScoreCell(value, maxScoreFor(columnId))
        const key = cellKey(studentId, columnId)
        pendingRef.current.add(key)
        setPendingCells(new Set(pendingRef.current))
        setSavedCells(prev => {
            if (!prev.has(key)) return prev
            const next = new Set(prev)
            next.delete(key)
            return next
        })
        setScoresData(prev => {
            const next = { ...prev, [studentId]: { ...(prev[studentId] || {}), [columnId]: clamped } }
            scoresRef.current = next
            return next
        })
        scheduleAutoSave()
    }, [scheduleAutoSave, maxScoreFor, periodLocked])

    const dirty = pendingCells.size > 0

    /**
     * Run a control change that will discard the grid.
     *
     * With auto-save on there is nothing to lose, so the pending cells are
     * simply flushed first. With it off the teacher is asked, because changing
     * the month replaces `scoresData` wholesale and thirty typed marks would go
     * with it.
     */
    const switchTo = useCallback(async (apply: () => void) => {
        if (pendingRef.current.size > 0) {
            if (autoSave) {
                if (!(await flushPending())) return
            } else if (!(await confirm({
                title: 'ពិន្ទុមិនទាន់រក្សាទុក',
                message: 'អ្នកបានបញ្ចូលពិន្ទុដែលមិនទាន់រក្សាទុក។ ប្តូរទៅទិន្នន័យផ្សេងនឹងបាត់បង់ពិន្ទុទាំងនោះ។',
                tone: 'warning',
                confirmLabel: 'បន្ត​ដោយមិនរក្សាទុក',
            }))) return
        }
        pendingRef.current = new Set()
        setPendingCells(new Set())
        apply()
    }, [autoSave, confirm, flushPending])

    const handleSave = useCallback(async () => {
        if (periodLocked) {
            notify.error('វគ្គនេះបានចាក់សោ — មិនអាចរក្សាទុកពិន្ទុបានទេ')
            return
        }
        setSaving(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        const res = await persist()
        if (res.ok) {
            notify.success(`បានរក្សាទុកពិន្ទុសិស្ស ${toKhmerNumber(initialStudents.length)} នាក់`)
            setLiveMessage('បានរក្សាទុកពិន្ទុទាំងអស់')
        }
        setSaving(false)
    }, [persist, initialStudents.length, periodLocked])

    // Ctrl/Cmd+S saves without reaching for the mouse — the one shortcut a
    // teacher mid-entry is likely to already know.
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

    // ------------------------------------------------------------- statistics

    const visibleStudents = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return initialStudents
        return initialStudents.filter(s =>
            [s.name_kh, s.name_en, s.student_id].some(f => String(f ?? '').toLowerCase().includes(q)))
    }, [initialStudents, query])

    const rowNumbers = useMemo(
        () => new Map(initialStudents.map((s, i) => [s.id, i + 1])),
        [initialStudents],
    )

    /**
     * The grid's cells as `MarkRow`s, so the shared completion layer can read
     * them.
     *
     * Built from `scoresData` rather than from a fetch: this screen holds the
     * live grid including cells the teacher has typed but not yet saved, and a
     * progress figure that ignored unsaved work would tick *backwards* as they
     * typed. `splitScoreCell` is the same number-or-text rule `saveScores`
     * applies, so a cell counts here exactly when it would count once written.
     */
    const markRows = useMemo(() => {
        const rows: MarkRow[] = []
        for (const stu of initialStudents) {
            const byColumn = scoresData[stu.id]
            if (!byColumn) continue
            for (const col of cols) {
                const raw = byColumn[col.id]
                if (raw === null || raw === undefined || raw === '') continue
                rows.push({ student_id: stu.id, subject: col.id, ...splitScoreCell(raw) })
            }
        }
        return rows
    }, [cols, initialStudents, scoresData])

    /**
     * The subjects the grid is currently showing — one when a subject is picked,
     * all of the teacher's when the scope is `all`.
     *
     * `rosterProgress` unions across them; it never sums, because a pupil marked
     * in two subjects is one pupil.
     */
    const displayedSubjects = useMemo(() => {
        if (view === 'grid' && gridScope === 'all') return templateSubjects
        return templateSubjects.filter(s => s.subjectKey === subject)
    }, [view, gridScope, templateSubjects, subject])

    const stats = useMemo(() => {
        const numeric = cols.filter(c => c.type !== 'select')
        const averages: number[] = []

        for (const stu of initialStudents) {
            const entries = numeric.map(c => ({
                score: numericCell(scoresData[stu.id]?.[c.id]),
                maxScore: maxScoreFor(c.id),
            }))
            // Coefficient-weighted under a secondary scheme, the plain mean
            // under the default — one call, both worlds.
            const avg = coefficientAverage(entries, scheme)
            if (avg !== null) averages.push(avg)
        }

        /*
         * HOW FAR THROUGH — from the shared layer, not from this loop.
         *
         * It used to be counted right here: a pupil was "entered" when a numeric
         * cell in a non-`select` column had a value. `isMarked` counts
         * `score_text` too, because the `sem_eval_*` columns are Khmer words
         * (00012) — so a pupil carrying only a rating read as DONE on
         * `/score/collect` and the dashboard and as NOT STARTED here, on the one
         * screen the teacher is actually typing into.
         */
        const progress = rosterProgress(displayedSubjects, markRows, initialStudents.length)

        return {
            ...progress,
            // A mean of per-pupil averages that already sit on the scheme's scale.
            classAverage: simpleAverage(averages),
        }
    }, [cols, initialStudents, scoresData, maxScoreFor, scheme, displayedSubjects, markRows])

    // ----------------------------------------------------- copy last period

    // The previous PERIOD on the class's calendar, not the previous calendar
    // month: after a មីនា-មេសា merge, ឧសភា's predecessor is that merged period
    // and its marks live under the anchor 'mar' — walking MONTHS_BY_ACADEMIC_YEAR
    // would read the absorbed month's hidden cells instead.
    const previousPeriod = useMemo(() => {
        if (scoreType !== 'monthly') return null
        const index = calendar.findIndex(p => p.key === month)
        return index > 0 ? calendar[index - 1] : null
    }, [scoreType, month, calendar])

    const [copying, setCopying] = useState(false)

    /**
     * Seed this month from the last one.
     *
     * Only empty cells are filled: the button is a shortcut for "most of the
     * class scored the same as last month", not a way to overwrite marks
     * already entered. Nothing is written until the teacher saves — or until
     * auto-save picks the cells up, which is why they all enter the pending set.
     */
    const copyFromPreviousMonth = useCallback(async () => {
        if (!previousPeriod) return
        setCopying(true)
        try {
            const records = await getScores('monthly', `${previousPeriod.key}-${academicYear}`, scopeClassId)
            const wanted = new Set(cols.map(c => c.id))
            const next = { ...scoresRef.current }
            let filled = 0

            for (const r of records) {
                if (!wanted.has(r.subject)) continue
                const value = scoreCellValue(r)
                if (value === null || value === '') continue
                const row = { ...(next[r.student_id] ?? {}) }
                const current = row[r.subject]
                if (current !== undefined && current !== null && current !== '') continue
                // Last month's mark may exceed this month's maximum if the
                // template changed in between — clamp on the way in.
                row[r.subject] = clampScoreCell(String(value), maxScoreFor(r.subject))
                next[r.student_id] = row
                pendingRef.current.add(cellKey(r.student_id, r.subject))
                filled += 1
            }

            if (filled === 0) {
                notify.info(`គ្មានពិន្ទុពី${previousPeriod.labelKm}ដែលអាចចម្លងបាន`)
                return
            }

            scoresRef.current = next
            setScoresData(next)
            setPendingCells(new Set(pendingRef.current))
            notify.success(`បានចម្លងពិន្ទុ ${toKhmerNumber(filled)} កោសិកា`)
            scheduleAutoSave()
        } finally {
            setCopying(false)
        }
    }, [previousPeriod, academicYear, cols, scheduleAutoSave, maxScoreFor, scopeClassId])

    // ------------------------------------------------------------ bulk assign

    const [bulkOpen, setBulkOpen] = useState(false)
    const [bulkValue, setBulkValue] = useState('')
    const [bulkColumn, setBulkColumn] = useState('')
    const [bulkOnlyEmpty, setBulkOnlyEmpty] = useState(true)

    const openBulk = () => {
        setBulkColumn(cols[0]?.id ?? '')
        setBulkValue('')
        setBulkOpen(true)
    }

    const applyBulk = () => {
        const col = cols.find(c => c.id === bulkColumn)
        if (!col) return
        if (bulkValue.trim() === '') {
            notify.error('សូមបញ្ចូលពិន្ទុជាមុនសិន')
            return
        }

        const clamped = clampScoreCell(bulkValue, maxScoreFor(col.id))
        const next = { ...scoresRef.current }
        let applied = 0
        for (const stu of visibleStudents) {
            const row = { ...(next[stu.id] ?? {}) }
            const current = row[col.id]
            if (bulkOnlyEmpty && current !== undefined && current !== null && current !== '') continue
            row[col.id] = clamped
            next[stu.id] = row
            pendingRef.current.add(cellKey(stu.id, col.id))
            applied += 1
        }

        scoresRef.current = next
        setScoresData(next)
        setPendingCells(new Set(pendingRef.current))
        setBulkOpen(false)
        notify.success(`បានផ្តល់ពិន្ទុដល់សិស្ស ${toKhmerNumber(applied)} នាក់`)
        scheduleAutoSave()
    }

    /*
     * ── Subjects are not created from the entry screen ────────────────────
     *
     * This page carried a "បន្ថែមមុខវិជ្ជា" button beside the subject picker,
     * which minted a class-scope `score_template_subjects` row on the spot. It
     * worked, and it was the wrong place for it: a teacher part-way through
     * typing forty marks was one click from redefining what the class assesses,
     * and the same subject list is edited on `/score/subjects` — the product's
     * single configuration surface, which is why `/score/template` is already a
     * redirect to it.
     *
     * Two screens minting subjects is how they come to disagree about a class's
     * curriculum. Nothing was lost: `/score/subjects` owns
     * "បង្កើតមុខវិជ្ជាផ្ទាល់ខ្លួន", calls the same `addClassSubject`, and the
     * picker below links straight to it.
     */

    // ----------------------------------------------------------------- render

    const periodLabel = scoreType === 'monthly'
        ? `ខែ${activePeriod?.labelKm ?? month}`
        : semester === 'sem1' ? 'ឆមាសទី១' : 'ឆមាសទី២'

    const modeDescription = `បញ្ចូល${scoreType === 'monthly' ? 'ពិន្ទុប្រចាំខែ' : 'ពិន្ទុប្រចាំឆមាស'}សម្រាប់មុខវិជ្ជា${subjectTitle(subject)} ${periodLabel} ឆ្នាំសិក្សា ${academicYear}`

    /**
     * The class's curriculum context, said out loud (§24): a teacher must
     * never wonder which mental scale a page is on. Built from the resolved
     * context, not from any route hint.
     */
    const levelContextLabel = useMemo(() => {
        const level = context?.levelKey ? levelByKey(context.levelKey) : undefined
        if (!level) return null
        const parts = [level.name]
        if (context?.gradeNumber) parts.push(`ថ្នាក់ទី${toKhmerNumber(context.gradeNumber)}`)
        const track = trackLabel(context?.track)
        if (track) parts.push(track)
        return parts.join(' · ')
    }, [context])

    /**
     * What the selected subject is marked out of, and what it therefore
     * weighs. Shown only under a coefficient scheme — on the primary /10 scale
     * a coefficient would be a number that multiplies nothing (`simpleAverage`
     * is the engine there), and the maximum is the ambient 10 everyone knows.
     * Read-only by design: the coefficient is derived, never typed (§3.2).
     */
    const subjectScale = useMemo(() => {
        if (scheme.weighting !== 'coefficient') return null
        const effective = templateSubjects.find(s => s.subjectKey === subject)
        if (!effective) return null
        return { max: effective.maxScore, coefficient: coefficientOf(effective.maxScore, scheme) }
    }, [scheme, templateSubjects, subject])

    const hasStudents = initialStudents.length > 0
    const hasColumns = cols.length > 0

    /**
     * First-visit subject setup (§12).
     *
     * A class that has never chosen its subjects should be asked which ones it
     * teaches rather than handed a thirty-four-column grid — but only if that
     * question is still open. Two guards keep it from ever becoming a wall in
     * front of working data:
     *
     *   * `!hasAnyMarks` — a class already carrying marks for this period is a
     *     class that has been entering scores against the full list for a term.
     *     Interrupting it with a mandatory setup screen risks the year's data
     *     for a preference, so it gets the grid and a banner instead.
     *   * `dismissedSetup` — the teacher said "later". Local, not persisted:
     *     the question is cheap to re-ask next visit and a stored dismissal is
     *     a preference nobody can find again to undo.
     *
     * Once configured, this never renders again — configuration happens once,
     * entry happens all year (§13).
     */
    const [dismissedSetup, setDismissedSetup] = useState(false)

    const hasAnyMarks = useMemo(
        () => Object.values(scoresData).some(row =>
            Object.values(row).some(v => v !== null && v !== undefined && v !== '')),
        [scoresData],
    )

    const showSetup =
        !loading && !templateLoading && !configured && !dismissedSetup && !hasAnyMarks && hasStudents

    return (
        <PageContainer>
            <style jsx global>{`
                /* The spin buttons steal the width a two-digit mark needs, and a
                   teacher never nudges a score one unit at a time. */
                input[type=number]::-webkit-inner-spin-button,
                input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
                input[type=number] { -moz-appearance: textfield; }
            `}</style>

            {/*
              The workspace header — class, year, subject, period and the four
              doors, identical on every score screen. This page used to state
              the level and the subject but never the class it was writing
              marks against, which is the one fact a teacher holding two
              classes most needs before typing forty numbers.
            */}
            <ScoreWorkspaceHeader
                title="បញ្ចូលពិន្ទុសិស្ស"
                description="បញ្ចូលពិន្ទុសម្រាប់មុខវិជ្ជា និងវគ្គដែលបានជ្រើសរើស"
                academicYear={academicYear}
                selection={{
                    scope: scoreType,
                    monthLabel: activePeriod?.labelKm ?? null,
                    semester: semester === 'sem2' ? 'sem2' : 'sem1',
                }}
                monthId={month}
                subjectLabel={subjectTitle(subject)}
                levelLabel={levelContextLabel}
                notes={
                    /*
                      A subject teacher sees only their own subjects, so say why
                      — otherwise a missing subject reads as a bug rather than as
                      somebody else's responsibility.
                    */
                    !role.coversWholeClass ? (
                        <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-bold text-text-muted">
                            គ្រូមុខវិជ្ជា · បង្ហាញតែមុខវិជ្ជារបស់អ្នក
                        </span>
                    ) : null
                }
            />

            <section className="mb-4 rounded-xl border border-divider bg-bg-surface p-4 shadow-sm md:p-5">
                {/* --------------------------------------------- summary pills */}
                <div className="grid gap-2.5 sm:grid-cols-3">
                    <div className="flex items-center gap-3 rounded-lg bg-paper px-3 py-2.5">
                        <Users className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold text-text-muted">ចំនួនសិស្ស</p>
                            <p className="font-bold text-text-heading tabular-nums">
                                {toKhmerNumber(stats.total)} នាក់
                            </p>
                        </div>
                    </div>

                    <div className="rounded-lg bg-paper px-3 py-2.5">
                        <div className="flex items-center gap-3">
                            <ListChecks className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                            <div className="min-w-0">
                                <p className="text-[11px] font-bold text-text-muted">បានបញ្ចូល</p>
                                <p className="font-bold text-text-heading tabular-nums">
                                    {toKhmerNumber(stats.entered)}/{toKhmerNumber(stats.total)}
                                </p>
                            </div>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-divider">
                            <div
                                className="h-full rounded-full bg-success transition-all duration-300"
                                style={{ width: `${stats.percent}%` }}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-lg bg-paper px-3 py-2.5">
                        <Gauge className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold text-text-muted">មធ្យមភាគថ្នាក់</p>
                            <p className={`font-bold tabular-nums ${styleFor(stats.classAverage, scheme).text}`}>
                                {formatMark(stats.classAverage)}
                                <span className="ml-1.5 text-xs opacity-80">{letterOrDash(stats.classAverage, scheme)}</span>
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* --------------------------------------------------- mode tabs */}
            <div className="mb-4">
                <div
                    role="tablist"
                    aria-label="ប្រភេទពិន្ទុ"
                    className="inline-flex w-full gap-1 rounded-xl bg-paper p-1 sm:w-auto"
                >
                    {MODES.map(({ id, label, icon: Icon, accent }) => {
                        const active = scoreType === id
                        return (
                            <button
                                key={id}
                                role="tab"
                                type="button"
                                aria-selected={active}
                                onClick={() => switchTo(() => setScoreType(id))}
                                className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${active ? `${accent} shadow-md` : 'text-text-muted hover:text-brand'}`}
                            >
                                <Icon className="h-4 w-4" aria-hidden="true" />
                                {label}
                            </button>
                        )
                    })}
                    <Link
                        href={classHref("/homework/enter")}
                        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-bold text-text-muted transition hover:text-success focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                        <Home className="h-4 w-4" aria-hidden="true" />
                        កិច្ចការផ្ទះ
                    </Link>
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                    <span>{modeDescription}</span>
                    {subjectScale && (
                        <span className="font-bold text-text-body">
                            ពិន្ទុពេញ {toKhmerNumber(subjectScale.max)} · មេគុណ {subjectScale.coefficient}
                        </span>
                    )}
                </p>
            </div>

            {/* ------------------------------------------------- filter bar */}
            <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-divider bg-bg-app/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <Select
                        ariaLabel="ឆ្នាំសិក្សា"
                        value={academicYear}
                        onChange={(v) => switchTo(() => setAcademicYear(v))}
                        options={academicYearOptions}
                        leadingIcon={<CalendarDays />}
                    />

                    {scoreType === 'monthly' ? (
                        <Select
                            ariaLabel="វគ្គពិន្ទុ"
                            value={month}
                            onChange={(v) => switchTo(() => setSelectedMonth(v))}
                            // The class's periods, labels included: a merged
                            // period reads "មីនា-មេសា" and its absorbed month
                            // is not offered. The value stays the anchor key,
                            // so scorePeriod keeps its shape (INV-1).
                            options={calendar.map((p) => ({ value: p.key, label: p.labelKm }))}
                            leadingIcon={<Clock />}
                        />
                    ) : (
                        <Select
                            ariaLabel="ឆមាស"
                            value={semester}
                            onChange={(v) => switchTo(() => setSemester(v))}
                            options={[
                                { value: 'sem1', label: 'ឆមាសទី១' },
                                { value: 'sem2', label: 'ឆមាសទី២' },
                            ]}
                            leadingIcon={<Bookmark />}
                        />
                    )}

                    <div className="xl:col-span-2">
                        <SearchableSelect
                            ariaLabel="មុខវិជ្ជា"
                            placeholder="ជ្រើសរើសមុខវិជ្ជា..."
                            value={subject}
                            onChange={(v) => switchTo(() => setSubject(v))}
                            options={subjectOptions}
                            leadingIcon={<BookOpen />}
                        />
                    </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    {/*
                      The one way to change what this class assesses — adding a
                      subject included. See the note above `loadData` for why
                      the mint-a-subject dialog that used to sit here is gone.
                    */}
                    <Link
                        href={classHref("/score/subjects")}
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-divider bg-bg-surface px-3 text-xs font-bold text-text-body transition hover:border-brand-400 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:min-h-8"
                    >
                        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> មុខវិជ្ជាតាមថ្នាក់
                    </Link>

                    {scoreType === 'monthly' && (
                        <Button
                            size="sm"
                            variant="secondary"
                            printHidden={false}
                            loading={copying}
                            disabled={!previousPeriod || !hasColumns || periodLocked}
                            onClick={copyFromPreviousMonth}
                            title={previousPeriod
                                ? `ចម្លងពីខែ${previousPeriod.labelKm}`
                                : 'វគ្គនេះជាវគ្គដំបូងនៃឆ្នាំសិក្សា'}
                        >
                            <CopyPlus className="h-3.5 w-3.5" aria-hidden="true" /> ចម្លងពីខែមុន
                        </Button>
                    )}

                    <Button
                        size="sm"
                        variant="secondary"
                        printHidden={false}
                        disabled={!hasColumns || !hasStudents || periodLocked}
                        onClick={openBulk}
                    >
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> ផ្តល់ពិន្ទុដូចគ្នា
                    </Button>

                    <div className="relative min-w-[180px] flex-1">
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

                    {/* View toggle */}
                    <div className="flex rounded-lg bg-paper p-1" role="group" aria-label="ទម្រង់បង្ហាញ">
                        {([
                            { id: 'list' as const, label: 'បញ្ជី', icon: Rows3 },
                            { id: 'grid' as const, label: 'តារាង', icon: Grid3x3 },
                        ]).map(({ id, label, icon: Icon }) => (
                            <button
                                key={id}
                                type="button"
                                aria-pressed={view === id}
                                onClick={() => setView(id)}
                                className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${view === id ? 'bg-bg-surface text-brand shadow-sm' : 'text-text-muted hover:text-brand'}`}
                            >
                                <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
                            </button>
                        ))}
                    </div>
                </div>

                {view === 'grid' && (
                    <div className="mt-2 hidden flex-wrap items-center gap-2 lg:flex">
                        <span className="text-[11px] font-bold text-text-muted">ជួរឈរ៖</span>
                        {([
                            { id: 'subject' as const, label: subjectTitle(subject) },
                            { id: 'all' as const, label: 'គ្រប់មុខវិជ្ជា' },
                        ]).map(({ id, label }) => (
                            <button
                                key={id}
                                type="button"
                                aria-pressed={gridScope === id}
                                onClick={() => setGridScope(id)}
                                className={`rounded-full border px-3 py-1 text-[11px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${gridScope === id ? 'border-brand bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300' : 'border-divider text-text-muted hover:border-brand-400'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* ---------------------------------------------------- locked note */}
            {periodLocked && (
                <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-text-body">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden="true" />
                    <span>
                        <span className="font-bold">វគ្គ{activePeriod?.labelKm ?? ''} បានចាក់សោ</span> — ពិន្ទុមើលបានតែប៉ុណ្ណោះ។
                        ការដោះសោធ្វើដោយអ្នកគ្រប់គ្រងសាលា នៅ មុខវិជ្ជាតាមថ្នាក់ → វគ្គពិន្ទុ។
                    </span>
                </div>
            )}

            {/* -------------------------------------------- quick monthly jump */}
            {scoreType === 'monthly' && (
                <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
                    {QUICK_SUBJECTS.map(({ id, label, icon: Icon, tone }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => switchTo(() => setSubject(id))}
                            aria-pressed={subject === id}
                            className={`flex min-h-11 items-center gap-3 rounded-lg border p-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${subject === id ? 'border-brand bg-brand-100 dark:bg-brand-900/30' : 'border-divider bg-bg-surface hover:border-brand-400'}`}
                        >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-paper shadow-sm">
                                <Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />
                            </span>
                            <span className="min-w-0">
                                <span className="block text-[10px] font-bold text-text-muted uppercase">បញ្ចូលពិន្ទុ</span>
                                <span className="block truncate text-xs font-bold text-text-heading md:text-sm">{label}</span>
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* ------------------------------------------------------- content */}
            {loading ? (
                <div className="flex flex-col gap-2.5" role="status" aria-busy="true">
                    <span className="sr-only">កំពុងទាញយកទិន្នន័យ...</span>
                    {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full rounded-xl" />
                    ))}
                </div>
            ) : !hasStudents ? (
                <div className="rounded-xl border border-divider bg-bg-surface">
                    <EmptyState
                        title="មិនទាន់មានសិស្សក្នុងថ្នាក់នេះ"
                        description="ចុះឈ្មោះសិស្សជាមុនសិន រួចត្រឡប់មកបញ្ចូលពិន្ទុ។"
                        action={
                            <Link
                                href={classHref("/student-list")}
                                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-brand-contrast transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                            >
                                <Users className="h-4 w-4" aria-hidden="true" /> ចុះឈ្មោះសិស្ស
                            </Link>
                        }
                    />
                </div>
            ) : showSetup ? (
                /*
                  §12: the class has never chosen its subjects and has no marks
                  yet, so ask before showing a grid. Both routes out are real —
                  "choose" goes to the configuration screen, "later" drops
                  straight into the full grid, which is exactly the behaviour
                  every account had before this existed.
                */
                <div className="rounded-xl border border-divider bg-bg-surface">
                    <EmptyState
                        icon={<ListChecks className="h-6 w-6" aria-hidden="true" />}
                        title="សូមជ្រើសរើសមុខវិជ្ជាដែលអ្នកកំពុងបង្រៀន"
                        description="ថ្នាក់នេះមិនទាន់បានកំណត់មុខវិជ្ជាទេ។ ជ្រើសរើសម្តងគត់ រួចតារាងបញ្ចូលពិន្ទុនឹងបង្ហាញតែមុខវិជ្ជាដែលអ្នកបង្រៀន។"
                        action={
                            <div className="flex flex-wrap items-center justify-center gap-2">
                                <Link
                                    href={activeClassId ? `/score/subjects?class=${encodeURIComponent(activeClassId)}` : '/score/subjects'}
                                    className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-brand-contrast transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                >
                                    <ListChecks className="h-4 w-4" aria-hidden="true" /> ជ្រើសរើសមុខវិជ្ជា
                                </Link>
                                <Button variant="secondary" printHidden={false} onClick={() => setDismissedSetup(true)}>
                                    បញ្ចូលពិន្ទុមុនសិន
                                </Button>
                            </div>
                        }
                    />
                </div>
            ) : !hasColumns ? (
                <div className="rounded-xl border border-divider bg-bg-surface">
                    <EmptyState
                        kind="filtered"
                        title="សូមជ្រើសរើសមុខវិជ្ជាជាមុនសិន"
                        description="មុខវិជ្ជានេះមិនទាន់មានជួរឈរពិន្ទុទេ។ ជ្រើសរើសមុខវិជ្ជាផ្សេង ឬបន្ថែមមុខវិជ្ជាថ្មី។"
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
            ) : view === 'grid' ? (
                <>
                    {/* The grid is a laptop control: below `lg` the same state is
                        rendered as one card per pupil, because a table dragged
                        sideways puts the column being typed under the keyboard. */}
                    <div className="hidden lg:block">
                        <ScoreEntryGrid
                            students={visibleStudents}
                            columns={cols}
                            values={scoresData}
                            onChange={handleScoreChange}
                            savedCells={savedCells}
                            rowNumbers={rowNumbers}
                            maxScoreFor={maxScoreFor}
                            scheme={scheme}
                            readOnly={periodLocked}
                        />
                    </div>
                    <div className="lg:hidden">
                        <ScoreEntryList
                            students={visibleStudents}
                            columns={subjectCols}
                            values={scoresData}
                            onChange={handleScoreChange}
                            savedCells={savedCells}
                            rowNumbers={rowNumbers}
                            maxScoreFor={maxScoreFor}
                            scheme={scheme}
                            readOnly={periodLocked}
                        />
                    </div>
                </>
            ) : (
                <ScoreEntryList
                    students={visibleStudents}
                    columns={cols}
                    values={scoresData}
                    onChange={handleScoreChange}
                    savedCells={savedCells}
                    rowNumbers={rowNumbers}
                    maxScoreFor={maxScoreFor}
                    scheme={scheme}
                    readOnly={periodLocked}
                />
            )}

            {/* -------------------------------------------------- sticky footer */}
            <div className="sticky bottom-4 z-20 mt-5 flex flex-col gap-3 rounded-xl border border-divider bg-bg-surface p-3 shadow-lg lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-body">
                        {saving && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" aria-hidden="true" />}
                        <span className="font-bold">
                            បានបញ្ចូល {toKhmerNumber(stats.entered)}/{toKhmerNumber(stats.total)} នាក់
                        </span>
                        <span className="text-text-muted">
                            មធ្យមភាគថ្នាក់៖ <span className={styleFor(stats.classAverage, scheme).text}>{formatMark(stats.classAverage)}</span>
                        </span>
                        <span className={`text-xs font-bold ${dirty ? 'text-warning-text' : 'text-success'}`}>
                            {saving ? 'កំពុងរក្សាទុក...'
                                : dirty ? `មិនទាន់រក្សាទុក ${toKhmerNumber(pendingCells.size)} កោសិកា`
                                : 'បានរក្សាទុករួចរាល់'}
                        </span>
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-divider">
                        <div
                            className="h-full rounded-full bg-brand transition-all duration-300"
                            style={{ width: `${stats.percent}%` }}
                        />
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs font-bold text-text-muted">
                        <input
                            type="checkbox"
                            checked={autoSave}
                            onChange={(e) => setAutoSave(e.target.checked)}
                            className="h-4 w-4 accent-[var(--brand)]"
                        />
                        រក្សាទុកស្វ័យប្រវត្តិ
                    </label>

                    <Button
                        variant="secondary"
                        printHidden={false}
                        disabled={!dirty || saving}
                        onClick={async () => {
                            if (!(await confirm({
                                title: 'បោះបង់ការកែប្រែ',
                                message: 'ពិន្ទុដែលមិនទាន់រក្សាទុកនឹងបាត់បង់ ហើយតារាងនឹងផ្ទុកឡើងវិញ។',
                                tone: 'warning',
                                confirmLabel: 'បោះបង់ការកែប្រែ',
                            }))) return
                            if (timerRef.current) clearTimeout(timerRef.current)
                            pendingRef.current = new Set()
                            setPendingCells(new Set())
                            loadData()
                        }}
                    >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" /> បោះបង់
                    </Button>

                    <Button
                        variant="success"
                        size="lg"
                        printHidden={false}
                        onClick={handleSave}
                        loading={saving}
                        disabled={periodLocked}
                        icon={<Save className="h-5 w-5" />}
                    >
                        រក្សាទុកពិន្ទុ
                    </Button>
                </div>
            </div>

            {/* Auto-save is silent by design; a screen-reader user needs to be
                told the write happened, without a toast per cell. */}
            <p className="sr-only" role="status" aria-live="polite">{liveMessage}</p>

            {/* --------------------------------------------------- bulk dialog */}
            <Dialog
                open={bulkOpen}
                onClose={() => setBulkOpen(false)}
                title="ផ្តល់ពិន្ទុដូចគ្នា"
                description="ផ្តល់ពិន្ទុតែមួយដល់សិស្សទាំងអស់ក្នុងបញ្ជីបច្ចុប្បន្ន"
                footer={
                    <>
                        <Button variant="secondary" printHidden={false} onClick={() => setBulkOpen(false)}>បោះបង់</Button>
                        <Button printHidden={false} onClick={applyBulk} icon={<Check className="h-4 w-4" />}>អនុវត្ត</Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4">
                    {cols.length > 1 && (
                        <Select
                            label="ជួរឈរ"
                            value={bulkColumn}
                            onChange={setBulkColumn}
                            options={cols.map(c => ({ value: c.id, label: c.label }))}
                        />
                    )}

                    <div>
                        <label className={fieldLabel} htmlFor="bulk-score">
                            ពិន្ទុ <span className={requiredMark}>*</span>
                        </label>
                        {cols.find(c => c.id === bulkColumn)?.type === 'select' ? (
                            <Select
                                id="bulk-score"
                                value={bulkValue}
                                onChange={setBulkValue}
                                options={cols.find(c => c.id === bulkColumn)?.options ?? []}
                                placeholder="ជ្រើសរើស..."
                            />
                        ) : (
                            <input
                                id="bulk-score"
                                type="number"
                                min={0}
                                max={maxScoreFor(bulkColumn)}
                                step="0.25"
                                inputMode="decimal"
                                value={bulkValue}
                                onChange={(e) => setBulkValue(e.target.value)}
                                className={controlClass(false, 'text-center text-xl font-bold')}
                                placeholder="ឧ. 7.5"
                            />
                        )}
                    </div>

                    <label className="flex items-start gap-3 rounded-lg border border-divider p-3">
                        <input
                            type="checkbox"
                            checked={bulkOnlyEmpty}
                            onChange={(e) => setBulkOnlyEmpty(e.target.checked)}
                            className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
                        />
                        <span className="text-sm text-text-body">
                            <span className="font-bold text-text-heading">តែសិស្សដែលមិនទាន់មានពិន្ទុ</span>
                            <span className="mt-0.5 block text-xs text-text-muted">
                                បើដោះធីក ពិន្ទុដែលបញ្ចូលរួចនឹងត្រូវសរសេរជាន់ពីលើ។
                            </span>
                        </span>
                    </label>

                    <p className="text-xs text-text-muted">
                        នឹងអនុវត្តលើសិស្ស {toKhmerNumber(visibleStudents.length)} នាក់ក្នុងបញ្ជីបច្ចុប្បន្ន។
                    </p>
                </div>
            </Dialog>

            {dialog}
        </PageContainer>
    )
}
