'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
    CalendarCheck, Award, CalendarDays, Bookmark, Clock, BookOpen, FolderPlus,
    Mic, UserCheck, Book, Home, Save, Table2, Loader2, Search, Rows3, Grid3x3,
    CopyPlus, Users, ListChecks, Gauge, Sparkles, RotateCcw, Check, X, SlidersHorizontal,
} from 'lucide-react'

import { Button } from '@/components/ui/actions/Button'
import { Dialog } from '@/components/ui/overlay/Dialog'
import { useConfirm } from '@/components/ui/overlay/ConfirmDialog'
import { notify } from '@/components/ui/feedback/notify'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { Skeleton } from '@/components/ui/feedback/Skeleton'
import { PageContainer } from '@/components/shell/PageContainer'
import { controlClass, fieldLabel, requiredMark } from '@/components/ui/forms/fieldStyles'
import Select from '@/components/ui/forms/Select'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import { ScoreEntryList } from './ScoreEntryList'
import { ScoreEntryGrid } from './ScoreEntryGrid'

import { getScores, saveScores } from './actions'
import { createCustomSubject } from '@/app/(main)/score/custom-subjects/actions'
import { useCustomSubjects } from '@/lib/hooks/useCustomSubjects'
import { appliesTo } from '@/lib/storage/custom-subjects'
import { scoreCellValue } from '@/lib/utils/score-value'
import { formatMark, letterOrDash, numericCell, styleFor } from '@/lib/utils/score-band'
import { levelByKey, trackLabel } from '@/lib/onboarding/curriculum'
import { coefficientAverage, coefficientOf, simpleAverage, DEFAULT_SCHEME_CONFIG } from '@/lib/grading/scheme'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import {
    ACADEMIC_MONTH_OPTIONS_BY_ID, MONTHS_BY_ACADEMIC_YEAR, MONTH_LABEL_BY_ID,
} from '@/lib/constants/months'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import { allColumnsFor, subjectConfigs, subjectTitle } from './subjectConfigs'
import { useScoreTemplate } from '@/lib/hooks/useScoreTemplate'
import {
    columnsFor, maxScoreByColumn, toSubjectOptions, type SubjectColumn,
} from '@/lib/scores/template'
import type { CustomSubjectScope, Score, ScoreInput, Student } from '@/lib/types'

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
    { id: 'ex_hw', label: 'កិច្ចការផ្ទះ', icon: Home, tone: 'text-warning' },
] as const

const cellKey = (studentId: string, columnId: string) => `${studentId}:${columnId}`

export default function ScoreEnterClient({ initialStudents }: { initialStudents: Student[] }) {
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
    const [month, setMonth] = useState(() => searchParams.get('month') || 'nov')
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

    // Supabase-backed since migration 00012; the hook imports a browser's old
    // localStorage copy once, then reads from the database.
    const { subjects: customSubjects, reload: reloadCustomSubjects } = useCustomSubjects()

    // The subject list for the active class, resolved system < school < class
    // from `score_template_subjects` (migration 00016). Falls back to the
    // seeded national default while the class context resolves, so the picker
    // is never momentarily empty.
    const { subjects: templateSubjects, context, scheme } = useScoreTemplate(scoreType)

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

    // `subjectConfigs` is the grid's column lookup, keyed by picker value.
    useEffect(() => {
        customSubjects.forEach(s => { subjectConfigs[s.id] = s.columns })
    }, [customSubjects])

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
        // `subjectConfigs` is mutated by the effect above, so the custom-subject
        // list is the signal that a new key may now resolve.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [subject, customSubjects, templateSubjects],
    )

    const customCols = useMemo(
        () => customSubjects.filter(s => appliesTo(s, scoreType)).flatMap(s => s.columns),
        [customSubjects, scoreType],
    )

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

    /** Columns the current view actually edits. */
    const cols: SubjectColumn[] = useMemo(() => {
        if (view === 'grid' && gridScope === 'all') return [...allColumnsFor(scoreType), ...customCols]
        return subjectCols
    }, [view, gridScope, scoreType, customCols, subjectCols])

    /**
     * Subject list for the picker.
     *
     * Was a literal array here — the Cambodian primary curriculum compiled into
     * the product, which a lower-secondary school had no way to change. It now
     * comes from `score_template_subjects` via `useScoreTemplate`.
     *
     * The teacher's own subjects are still appended under `មុខវិជ្ជាបន្ថែម`
     * from `custom_subjects`; folding those into the template table is a later
     * phase, and doing it here would mean two sources writing the same list.
     */
    const subjectOptions = useMemo(() => {
        const base = toSubjectOptions(templateSubjects)

        const custom = customSubjects
            .filter(s => appliesTo(s, scoreType))
            .map(s => ({ value: s.id, label: s.name, group: 'មុខវិជ្ជាបន្ថែម' }))

        return [...base, ...custom]
    }, [templateSubjects, scoreType, customSubjects])

    // ---------------------------------------------------------------- loading

    const loadData = useCallback(async () => {
        setLoading(true)
        const records = await getScores(scoreType, scorePeriod)

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
    }, [scoreType, scorePeriod, initialStudents])

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

        const res = await saveScores(scoreType, scorePeriod, payload)
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
    }, [scoreType, scorePeriod])

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
            const next = { ...prev, [studentId]: { ...(prev[studentId] || {}), [columnId]: value } }
            scoresRef.current = next
            return next
        })
        scheduleAutoSave()
    }, [scheduleAutoSave])

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
        setSaving(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        const res = await persist()
        if (res.ok) {
            notify.success(`បានរក្សាទុកពិន្ទុសិស្ស ${toKhmerNumber(initialStudents.length)} នាក់`)
            setLiveMessage('បានរក្សាទុកពិន្ទុទាំងអស់')
        }
        setSaving(false)
    }, [persist, initialStudents.length])

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

    const stats = useMemo(() => {
        const numeric = cols.filter(c => c.type !== 'select')
        let entered = 0
        const averages: number[] = []

        for (const stu of initialStudents) {
            const entries = numeric.map(c => ({
                score: numericCell(scoresData[stu.id]?.[c.id]),
                maxScore: maxScoreFor(c.id),
            }))
            if (entries.some(e => e.score !== null)) entered += 1
            // Coefficient-weighted under a secondary scheme, the plain mean
            // under the default — one call, both worlds.
            const avg = coefficientAverage(entries, scheme)
            if (avg !== null) averages.push(avg)
        }

        return {
            total: initialStudents.length,
            entered,
            // A mean of per-pupil averages that already sit on the scheme's scale.
            classAverage: simpleAverage(averages),
            percent: initialStudents.length === 0 ? 0 : Math.round((entered / initialStudents.length) * 100),
        }
    }, [cols, initialStudents, scoresData, maxScoreFor, scheme])

    // ------------------------------------------------------ copy last month

    const previousMonth = useMemo(() => {
        if (scoreType !== 'monthly') return null
        const index = MONTHS_BY_ACADEMIC_YEAR.findIndex(m => m.id === month)
        return index > 0 ? MONTHS_BY_ACADEMIC_YEAR[index - 1] : null
    }, [scoreType, month])

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
        if (!previousMonth) return
        setCopying(true)
        try {
            const records = await getScores('monthly', `${previousMonth.id}-${academicYear}`)
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
                row[r.subject] = value
                next[r.student_id] = row
                pendingRef.current.add(cellKey(r.student_id, r.subject))
                filled += 1
            }

            if (filled === 0) {
                notify.info(`គ្មានពិន្ទុពី${MONTH_LABEL_BY_ID[previousMonth.id] ?? previousMonth.label}ដែលអាចចម្លងបាន`)
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
    }, [previousMonth, academicYear, cols, scheduleAutoSave])

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

        const next = { ...scoresRef.current }
        let applied = 0
        for (const stu of visibleStudents) {
            const row = { ...(next[stu.id] ?? {}) }
            const current = row[col.id]
            if (bulkOnlyEmpty && current !== undefined && current !== null && current !== '') continue
            row[col.id] = bulkValue
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

    // ------------------------------------------------------- custom subjects

    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [newSubName, setNewSubName] = useState('')
    const [newSubType, setNewSubType] = useState<CustomSubjectScope>('both')
    const [newSubCols, setNewSubCols] = useState('')

    const submitNewSubject = async () => {
        if (!newSubName.trim()) {
            notify.error('សូមបញ្ចូលឈ្មោះមុខវិជ្ជា')
            return
        }

        const id = 'custom_' + Date.now()
        let columns: { id: string; label: string; width: string }[] = []
        if (newSubCols.trim()) {
            const colNames = newSubCols.split(',').map(s => s.trim()).filter(Boolean)
            columns = colNames.map((n, i) => ({ id: `${id}_${i}`, label: n, width: '120px' }))
        } else {
            columns = [{ id: `${id}_0`, label: newSubName.trim(), width: '120px' }]
        }

        const res = await createCustomSubject(newSubName.trim(), newSubType, columns)
        if (res.error || !res.data) {
            notify.error(res.error ?? 'រក្សាទុកមុខវិជ្ជាមិនបានសម្រេច')
            return
        }

        // Key the column lookup by the row's real id — the local `id` above only
        // ever seeded the column ids, which the server stored verbatim.
        subjectConfigs[res.data.id] = res.data.columns
        await reloadCustomSubjects()

        setIsAddModalOpen(false)
        setSubject(res.data.id)
        notify.success('បានបន្ថែមមុខវិជ្ជាថ្មី')
    }

    // ----------------------------------------------------------------- render

    const periodLabel = scoreType === 'monthly'
        ? `ខែ${MONTH_LABEL_BY_ID[month] ?? month}`
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

    return (
        <PageContainer>
            <style jsx global>{`
                /* The spin buttons steal the width a two-digit mark needs, and a
                   teacher never nudges a score one unit at a time. */
                input[type=number]::-webkit-inner-spin-button,
                input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
                input[type=number] { -moz-appearance: textfield; }
            `}</style>

            {/* ------------------------------------------------------- hero */}
            <section className="mb-4 rounded-xl border border-divider bg-bg-surface p-4 shadow-sm md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="kh-moul text-lg text-brand md:text-xl">បញ្ចូលពិន្ទុសិស្ស</h1>
                        <p className="mt-1 text-sm text-text-muted">
                            បញ្ចូលពិន្ទុសម្រាប់មុខវិជ្ជា និងខែដែលបានជ្រើសរើស
                        </p>
                        {levelContextLabel && (
                            <p className="mt-2 inline-flex items-center rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-800 dark:bg-brand-900/40 dark:text-brand-300">
                                {levelContextLabel}
                            </p>
                        )}
                    </div>
                    <Link
                        href="/score/total"
                        className="flex min-h-11 items-center gap-2 rounded-lg border border-divider bg-bg-surface px-4 text-[13px] font-bold text-text-body transition hover:border-brand-400 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                        <Table2 className="h-4 w-4" aria-hidden="true" /> តារាងពិន្ទុសរុប
                    </Link>
                </div>

                {/* --------------------------------------------- summary pills */}
                <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
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
                        href="/homework/enter"
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
                            ariaLabel="ខែ"
                            value={month}
                            onChange={(v) => switchTo(() => setMonth(v))}
                            options={ACADEMIC_MONTH_OPTIONS_BY_ID}
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
                    <Button size="sm" variant="secondary" printHidden={false} onClick={() => setIsAddModalOpen(true)}>
                        <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" /> បន្ថែមមុខវិជ្ជា
                    </Button>

                    {/* The subject list itself is editable per class since the
                        template's class layer landed; this is the way in. */}
                    <Link
                        href="/score/subjects"
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
                            disabled={!previousMonth || !hasColumns}
                            onClick={copyFromPreviousMonth}
                            title={previousMonth
                                ? `ចម្លងពីខែ${MONTH_LABEL_BY_ID[previousMonth.id] ?? previousMonth.label}`
                                : 'ខែនេះជាខែដំបូងនៃឆ្នាំសិក្សា'}
                        >
                            <CopyPlus className="h-3.5 w-3.5" aria-hidden="true" /> ចម្លងពីខែមុន
                        </Button>
                    )}

                    <Button
                        size="sm"
                        variant="secondary"
                        printHidden={false}
                        disabled={!hasColumns || !hasStudents}
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
                                href="/student-list"
                                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-brand-contrast transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                            >
                                <Users className="h-4 w-4" aria-hidden="true" /> ចុះឈ្មោះសិស្ស
                            </Link>
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
                        <span className={`text-xs font-bold ${dirty ? 'text-warning' : 'text-success'}`}>
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

            {/*
              Add a custom subject. The previous overlay had no focus trap, no
              Escape handler and no accessible name — `Dialog` supplies all three,
              and rises from the bottom on a phone.
            */}
            <Dialog
                open={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                title="បន្ថែមមុខវិជ្ជាថ្មី"
                description="មុខវិជ្ជាថ្មីនឹងបង្ហាញនៅក្នុងបញ្ជីជ្រើសរើសមុខវិជ្ជា"
                footer={
                    <>
                        <Button variant="secondary" printHidden={false} onClick={() => setIsAddModalOpen(false)}>
                            បោះបង់
                        </Button>
                        <Button printHidden={false} onClick={submitNewSubject} icon={<Save className="h-4 w-4" />}>
                            រក្សាទុក
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4">
                    <div>
                        <label className={fieldLabel} htmlFor="new-subject-name">
                            ឈ្មោះមុខវិជ្ជា <span className={requiredMark}>*</span>
                        </label>
                        <input
                            id="new-subject-name"
                            type="text"
                            value={newSubName}
                            onChange={e => setNewSubName(e.target.value)}
                            className={controlClass(false, 'font-bold')}
                            placeholder="ឧ. កុំព្យូទ័រ, ភាសាចិន..."
                        />
                    </div>

                    <Select
                        label="ប្រើសម្រាប់"
                        value={newSubType}
                        onChange={v => setNewSubType(v as CustomSubjectScope)}
                        options={[
                            { value: 'monthly', label: 'ប្រចាំខែ ប៉ុណ្ណោះ' },
                            { value: 'semester', label: 'ប្រចាំឆមាស ប៉ុណ្ណោះ' },
                            { value: 'both', label: 'ប្រចាំខែ និងប្រចាំឆមាស' },
                        ]}
                    />

                    <div>
                        <label className={fieldLabel} htmlFor="new-subject-cols">ជួរឈរពិន្ទុ (ជម្រើស)</label>
                        <p className="mb-2 text-[11px] leading-relaxed text-text-muted">
                            បើមុខវិជ្ជានេះមានច្រើនជួរឈរ សូមសរសេរខណ្ឌដោយសញ្ញាក្បៀស (,) ឧ. <strong>ទ្រឹស្តី, អនុវត្តន៍</strong>។ បើទុកទទេ វានឹងយកឈ្មោះមុខវិជ្ជាជាជួរឈរតែមួយ។
                        </p>
                        <input
                            id="new-subject-cols"
                            type="text"
                            value={newSubCols}
                            onChange={e => setNewSubCols(e.target.value)}
                            className={controlClass(false, 'font-bold')}
                            placeholder="ឧ. ទ្រឹស្តី, អនុវត្តន៍"
                        />
                    </div>
                </div>
            </Dialog>

            {dialog}
        </PageContainer>
    )
}
