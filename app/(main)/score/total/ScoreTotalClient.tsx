'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createPortal } from 'react-dom'
import {
    Calendar, Award, GraduationCap, CalendarDays, Clock, Bookmark, Settings2,
    Lock, Unlock, Printer, CloudUpload, Table2, Check, X, Search,
    Users, TrendingUp, Gauge, AlertTriangle, SlidersHorizontal, ChevronDown,
    MoreVertical, Eye, PencilLine, FileSpreadsheet, PieChart, Trash2, FileText,
    Columns3, PlusCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/actions/Button'
import { StatCard } from '@/components/ui/data/StatCard'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { Skeleton } from '@/components/ui/feedback/Skeleton'
import { notify } from '@/components/ui/feedback/notify'
import { Dialog } from '@/components/ui/overlay/Dialog'
import { useConfirm } from '@/components/ui/overlay/ConfirmDialog'
import { PageContainer } from '@/components/shell/PageContainer'
import { controlClass } from '@/components/ui/forms/fieldStyles'
import Select from '@/components/ui/forms/Select'

import { getAllScoresByPeriod, getMonthlyScoresForYear, clearScoresForStudents } from './actions'
import { saveScores } from '../enter/actions'
import { useCustomSubjects } from '@/lib/hooks/useCustomSubjects'
import { useScoreTemplate } from '@/lib/hooks/useScoreTemplate'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import { MONTHS_BY_ACADEMIC_YEAR, MONTH_LABEL_BY_ID } from '@/lib/constants/months'
import {
    coefficientAverage, letterFor, type GradingSchemeConfig,
} from '@/lib/grading/scheme'
import { maxScoreByColumn, resolveTemplate } from '@/lib/scores/template'
import { levelByKey, trackLabel } from '@/lib/onboarding/curriculum'
import { scoreCellValue, scoreNumericValue } from '@/lib/utils/score-value'
import { formatMark, letterOrDash, numericCell, styleFor, styleForMark } from '@/lib/utils/score-band'
import { getDriveImageUrl } from '@/lib/utils/drive-image'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import {
    filterGroups, flatten, groupsFor, groupsFromTemplate, type GridColumn,
    type TotalMode, type TotalledStudent,
} from './scoreTotalConfig'
import { Sparkline } from './Sparkline'
import { ScoreAnalyticsPanel } from './ScoreAnalyticsPanel'
import { ScoreTotalCards } from './ScoreTotalCards'
import { ScoreTotalPrint } from './ScoreTotalPrint'
import { FullscreenGrid } from '@/components/ui/data/FullscreenGrid'
import { exportScoreTotal } from './exportScoreTotal'
import type { Score, ScoreInput, Settings, Student } from '@/lib/types'

/**
 * តារាងពិន្ទុសិស្សសរុប — the whole class, every subject, one period.
 *
 * The table is wide by nature, so the design question is not how to make it
 * narrow but how to keep it readable while it scrolls: the pupil column pins
 * left, the class average pins right, and every mark is painted by band so the
 * pupils in trouble are visible without reading a single number. The four stat
 * cards above answer the question the table is usually opened to answer — how
 * did the class do, and who needs help — and the failing card is a filter, not
 * just a figure.
 *
 * Two structural changes from the previous version, both load-bearing:
 *
 *   * The rows are *derived*, not stored. Fetched records plus an `edits`
 *     overlay go through `computeRows` on every render, so a mark typed into
 *     the grid re-totals and re-ranks the class immediately instead of waiting
 *     for a save. Only the edited cells are sent to `saveScores`.
 *   * The semester's monthly component comes from one year-wide fetch rather
 *     than one request per selected month, which also feeds the trend chart and
 *     the per-row sparkline.
 */


const MODES: { id: TotalMode; label: string; icon: typeof Calendar }[] = [
    { id: 'monthly', label: 'ប្រចាំខែ', icon: Calendar },
    { id: 'semester', label: 'ឆមាស', icon: Award },
    { id: 'annual', label: 'ឆ្នាំ', icon: GraduationCap },
]

/** Scores for one pupil: what was fetched, with anything typed layered on top. */
type ScoreMap = Record<string, number | string | null>

function computeRows(
    students: Student[],
    scoresByStudent: Record<string, ScoreMap>,
    columns: GridColumn[],
    mode: TotalMode,
    monthlyComponent: Record<string, number>,
    scheme: GradingSchemeConfig,
    maxByColumn: Record<string, number>,
): TotalledStudent[] {
    const rows: TotalledStudent[] = students.map(stu => {
        const scores = scoresByStudent[stu.id] ?? {}

        let sum = 0
        const entries: { score: number | null; maxScore: number }[] = []
        for (const col of columns) {
            // Behavioural ratings are words, not marks — they never enter an average.
            if (col.isText) continue
            const raw = scores[col.key]
            if (raw === null || raw === undefined || raw === '') continue
            const value = Number(raw)
            if (!Number.isFinite(value)) continue
            sum += value
            entries.push({ score: value, maxScore: maxByColumn[col.key] ?? scheme.maxScore })
        }
        // Σscore ÷ Σcoefficient under a secondary scheme — the /50 average by
        // construction; under the default it is the plain mean, digit for
        // digit what this function always produced.
        const weighted = coefficientAverage(entries, scheme)

        const row: TotalledStudent = {
            ...stu,
            scores,
            total: 0,
            average: '0.00',
            finalAverageForRank: 0,
            rank: 0,
            annualTotal: 0,
            annualAverage: '0.00',
            examTotal: 0,
            examAverage: '0.00',
            monthlyAverage: '0.00',
            semesterAverage: '0.00',
        }

        if (mode === 'monthly') {
            row.total = sum
            row.average = weighted === null ? '0.00' : weighted.toFixed(2)
            row.finalAverageForRank = parseFloat(row.average)
        } else if (mode === 'annual') {
            const s1 = parseFloat(String(scores['sem1_avg'] ?? '0'))
            const s2 = parseFloat(String(scores['sem2_avg'] ?? '0'))

            let div = 0
            if (!isNaN(s1) && s1 > 0) div++
            if (!isNaN(s2) && s2 > 0) div++

            row.annualTotal = (isNaN(s1) ? 0 : s1) + (isNaN(s2) ? 0 : s2)
            row.annualAverage = div === 0 ? '0.00'
                : div === 1 ? row.annualTotal.toFixed(2)
                : (row.annualTotal / 2).toFixed(2)

            row.finalAverageForRank = parseFloat(row.annualAverage)
            row.total = row.annualTotal
            row.average = row.annualAverage
        } else {
            row.examTotal = sum
            row.examAverage = weighted === null ? '0.00' : weighted.toFixed(2)

            const monthly = monthlyComponent[stu.id] ?? 0
            row.monthlyAverage = monthly.toFixed(2)

            // Both halves already sit on the scheme's scale, so their mean does too.
            let semAvg = (parseFloat(row.examAverage) + monthly) / 2
            if (weighted === null && monthly === 0) semAvg = 0

            row.semesterAverage = semAvg.toFixed(2)
            row.finalAverageForRank = semAvg
            row.total = row.examTotal
            row.average = row.semesterAverage
        }

        return row
    })

    // Rank on the derived average, then restore a stable display order so the
    // table does not reshuffle under the teacher's cursor while they type.
    const ranked = [...rows].sort((a, b) => b.finalAverageForRank - a.finalAverageForRank)
    let rank = 1
    ranked.forEach((row, i) => {
        if (i > 0 && row.finalAverageForRank < ranked[i - 1].finalAverageForRank) rank = i + 1
        row.rank = rank
    })

    return rows
}

export default function ScoreTotalClient({
    initialStudents,
    settings,
}: {
    initialStudents: Student[]
    settings: Settings | null
}) {
    const searchParams = useSearchParams()

    // ------------------------------------------------------- period selection
    const [currentMode, setCurrentMode] = useState<TotalMode>(() => {
        const m = searchParams.get('mode')
        return m === 'semester' || m === 'annual' ? m : 'monthly'
    })
    const [academicYear, setAcademicYear] = useState(() => searchParams.get('year') || getCurrentAcademicYear())
    const [month, setMonth] = useState(() => searchParams.get('month') || 'nov')
    const [semester, setSemester] = useState(() => searchParams.get('semester') || 'sem1')

    /**
     * Filters live in the URL so a teacher can bookmark or share "December,
     * class 5A". `history.replaceState` rather than `router.replace`: the
     * server component only reads `?class=`, so a round trip would refetch the
     * roster to render exactly the same rows.
     */
    useEffect(() => {
        const url = new URL(window.location.href)
        url.searchParams.set('mode', currentMode)
        url.searchParams.set('year', academicYear)
        if (currentMode === 'monthly') url.searchParams.set('month', month)
        else url.searchParams.delete('month')
        if (currentMode === 'semester') url.searchParams.set('semester', semester)
        else url.searchParams.delete('semester')
        window.history.replaceState(null, '', url)
    }, [currentMode, academicYear, month, semester])

    const academicYearOptions = useMemo(() => {
        const start = parseInt(getCurrentAcademicYear().split('-')[0], 10)
        return [start - 1, start, start + 1].map((y) => `${y}-${y + 1}`)
    }, [])

    const scorePeriod = currentMode === 'monthly' ? `${month}-${academicYear}`
        : currentMode === 'semester' ? `${semester}-${academicYear}`
        : `annual-${academicYear}`

    // ------------------------------------------------------------------ data
    const [records, setRecords] = useState<Score[]>([])
    const [yearMonthly, setYearMonthly] = useState<{ year: string; rows: Score[] } | null>(null)
    const [edits, setEdits] = useState<Record<string, Record<string, string>>>({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const [selectedSemesterMonths, setSelectedSemesterMonths] = useState(['nov', 'dec', 'jan', 'feb', 'mar'])

    const { subjects: customSubjects } = useCustomSubjects()
    const { confirm, dialog } = useConfirm()

    /**
     * The class's curriculum and grading scheme. Two worlds, decided by data:
     *
     *   fallback — the untagged primary curriculum. Columns come from this
     *   file's hand-built layout (thirty columns, several the picker template
     *   deliberately does not carry), the scheme is /10 simple, and every
     *   figure is digit-for-digit what this screen always showed.
     *
     *   level curriculum — a class that resolves tagged rows (a grade-12
     *   stream). Columns come from the template, the scheme is the level's
     *   (/50, coefficient), and the annual mode keeps its derived sem_avg
     *   columns since those are already on the scheme's scale.
     */
    const {
        subjects: templateSubjects,
        rows: templateRows,
        context: templateContext,
        scheme,
        levelCurriculum,
    } = useScoreTemplate(currentMode === 'annual' ? 'semester' : currentMode)

    const PASS_MARK = scheme.passMark
    const MAX_SCORE = scheme.maxScore

    const allGroups = useMemo(
        () =>
            levelCurriculum && currentMode !== 'annual'
                ? groupsFromTemplate(templateSubjects, customSubjects)
                : groupsFor(currentMode, customSubjects),
        [levelCurriculum, currentMode, templateSubjects, customSubjects],
    )
    const allColumns = useMemo(() => flatten(allGroups), [allGroups])

    /** Full mark per column id, for weighting, validation and cell colours. */
    const maxByColumn = useMemo(() => maxScoreByColumn(templateSubjects), [templateSubjects])

    /** The class's curriculum said out loud (§24) — never from a route hint. */
    const levelContextLabel = useMemo(() => {
        const level = templateContext?.levelKey ? levelByKey(templateContext.levelKey) : undefined
        if (!level) return null
        const parts = [level.name]
        if (templateContext?.gradeNumber) parts.push(`ថ្នាក់ទី${toKhmerNumber(templateContext.gradeNumber)}`)
        const track = trackLabel(templateContext?.track)
        if (track) parts.push(track)
        return parts.join(' · ')
    }, [templateContext])

    const loadRecords = useCallback(async () => {
        setLoading(true)
        setRecords(await getAllScoresByPeriod(currentMode, scorePeriod))
        setEdits({})
        setLoading(false)
    }, [currentMode, scorePeriod])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is set after await, not synchronously during the effect
        loadRecords()
    }, [loadRecords])

    // One year-wide fetch backs three things: the semester's monthly component,
    // the trend chart and the per-row sparkline. It used to be one request per
    // selected month, run sequentially, on a classroom connection.
    useEffect(() => {
        let alive = true
        getMonthlyScoresForYear(academicYear).then(rows => {
            // Stamped with the year it was fetched for, so a slow response for
            // last year cannot be read as this year's trend.
            if (alive) setYearMonthly({ year: academicYear, rows })
        })
        return () => { alive = false }
    }, [academicYear])

    /**
     * Full mark per *monthly* column, for the semester's monthly component —
     * the current mode may be semester, but the component is built from
     * monthly rows and must weigh them by the monthly curriculum's maxima.
     */
    const monthlyMaxByColumn = useMemo(
        () =>
            maxScoreByColumn(
                resolveTemplate(
                    templateRows.length > 0 ? templateRows : [],
                    'monthly',
                    templateContext,
                ),
            ),
        [templateRows, templateContext],
    )

    /** studentId → monthId → that month's average across every marked subject. */
    const monthlyAverages = useMemo(() => {
        const acc: Record<string, Record<string, { score: number; maxScore: number }[]>> = {}
        const source = yearMonthly?.year === academicYear ? yearMonthly.rows : []
        for (const r of source) {
            const value = scoreNumericValue(r)
            if (value === null) continue
            const monthId = r.score_period.slice(0, r.score_period.length - academicYear.length - 1)
            const forStudent = (acc[r.student_id] ??= {})
            ;(forStudent[monthId] ??= []).push({
                score: value,
                maxScore: monthlyMaxByColumn[r.subject] ?? scheme.maxScore,
            })
        }

        const out: Record<string, Record<string, number>> = {}
        for (const [sid, months] of Object.entries(acc)) {
            out[sid] = {}
            for (const [mid, entries] of Object.entries(months)) {
                // Plain mean under the default scheme — unchanged — and the
                // /50 coefficient average under a secondary one.
                const avg = coefficientAverage(entries, scheme)
                if (avg !== null) out[sid][mid] = avg
            }
        }
        return out
    }, [yearMonthly, academicYear, monthlyMaxByColumn, scheme])

    /** Class average per month — the trend line in the analysis panel. */
    const classTrend = useMemo(() => {
        const out: Record<string, number | null> = {}
        for (const m of MONTHS_BY_ACADEMIC_YEAR) {
            const values = initialStudents
                .map(s => monthlyAverages[s.id]?.[m.id])
                .filter((v): v is number => typeof v === 'number')
            out[m.id] = values.length
                ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
                : null
        }
        return out
    }, [monthlyAverages, initialStudents])

    /** The monthly half of a semester average, over the months the teacher picked. */
    const monthlyComponent = useMemo(() => {
        const out: Record<string, number> = {}
        if (currentMode !== 'semester') return out
        for (const stu of initialStudents) {
            const values = selectedSemesterMonths
                .map(m => monthlyAverages[stu.id]?.[m])
                .filter((v): v is number => typeof v === 'number')
            if (values.length > 0) out[stu.id] = values.reduce((a, b) => a + b, 0) / values.length
        }
        return out
    }, [currentMode, initialStudents, monthlyAverages, selectedSemesterMonths])

    /** Fetched marks with anything typed layered on top. */
    const scoresByStudent = useMemo(() => {
        const base: Record<string, ScoreMap> = {}
        for (const stu of initialStudents) base[stu.id] = {}
        for (const r of records) {
            (base[r.student_id] ??= {})[r.subject] = scoreCellValue(r)
        }
        for (const [sid, row] of Object.entries(edits)) {
            base[sid] = { ...(base[sid] ?? {}), ...row }
        }
        return base
    }, [initialStudents, records, edits])

    const rows = useMemo(
        () => computeRows(initialStudents, scoresByStudent, allColumns, currentMode, monthlyComponent, scheme, maxByColumn),
        [initialStudents, scoresByStudent, allColumns, currentMode, monthlyComponent, scheme, maxByColumn],
    )

    // -------------------------------------------------------------- filtering
    const [filtersOpen, setFiltersOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [gender, setGender] = useState('')
    const [onlyFailing, setOnlyFailing] = useState(false)
    const [minAvg, setMinAvg] = useState(0)
    // `null` = no cap. The scheme resolves asynchronously (default /10 until
    // the class context arrives), so seeding this with MAX_SCORE would freeze
    // a 10 into the state and silently filter every /50 average out.
    const [maxAvg, setMaxAvg] = useState<number | null>(null)
    const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())

    const visibleKeys = useMemo(() => {
        if (hiddenColumns.size === 0) return null
        return new Set(allColumns.map(c => c.key).filter(k => !hiddenColumns.has(k)))
    }, [allColumns, hiddenColumns])

    const groups = useMemo(() => filterGroups(allGroups, visibleKeys), [allGroups, visibleKeys])
    const columns = useMemo(() => flatten(groups), [groups])

    const filteredRows = useMemo(() => {
        const q = search.trim().toLowerCase()
        return rows.filter(r => {
            if (q && ![r.name_kh, r.name_en, r.student_id].some(f => String(f ?? '').toLowerCase().includes(q))) return false
            if (gender && r.gender !== gender) return false
            const avg = r.finalAverageForRank
            if (onlyFailing && !(avg > 0 && avg < PASS_MARK)) return false
            if (avg < minAvg || avg > (maxAvg ?? Infinity)) return false
            return true
        })
    }, [rows, search, gender, onlyFailing, minAvg, maxAvg, PASS_MARK])

    const rowNumbers = useMemo(
        () => new Map(initialStudents.map((s, i) => [s.id, i + 1])),
        [initialStudents],
    )

    const filtersActive = search !== '' || gender !== '' || onlyFailing
        || minAvg !== 0 || maxAvg !== null || hiddenColumns.size > 0

    const clearFilters = () => {
        setSearch('')
        setGender('')
        setOnlyFailing(false)
        setMinAvg(0)
        setMaxAvg(null)
        setHiddenColumns(new Set())
    }

    // ------------------------------------------------------------- statistics
    const stats = useMemo(() => {
        const scored = rows.filter(r => r.finalAverageForRank > 0)
        const passing = scored.filter(r => r.finalAverageForRank >= PASS_MARK).length
        const average = scored.length
            ? scored.reduce((a, r) => a + r.finalAverageForRank, 0) / scored.length
            : null
        return {
            total: rows.length,
            scored: scored.length,
            passRate: scored.length ? Math.round((passing / scored.length) * 100) : 0,
            average,
            failing: scored.length - passing,
        }
    }, [rows, PASS_MARK])

    /** Per-subject rank, for the cell tooltip. Cheap: one pass per column. */
    const columnRanks = useMemo(() => {
        const map = new Map<string, Map<string, number>>()
        for (const col of allColumns) {
            if (col.isText) continue
            const values = rows
                // `numericCell` keeps a cleared cell ('') out of the ranking —
                // `Number('')` is 0, which would have ranked an unmarked pupil
                // as though they scored zero.
                .map(r => ({ id: r.id, v: numericCell(r.scores[col.key]) }))
                .filter((x): x is { id: string; v: number } => x.v !== null)
                .sort((a, b) => b.v - a.v)
            const ranks = new Map<string, number>()
            let rank = 1
            values.forEach((x, i) => {
                if (i > 0 && x.v < values[i - 1].v) rank = i + 1
                ranks.set(x.id, rank)
            })
            map.set(col.key, ranks)
        }
        return map
    }, [allColumns, rows])

    /** The three months up to and including the selected one, for the sparkline. */
    const trendMonths = useMemo(() => {
        const index = MONTHS_BY_ACADEMIC_YEAR.findIndex(m => m.id === month)
        const end = index >= 0 ? index + 1 : MONTHS_BY_ACADEMIC_YEAR.length
        return MONTHS_BY_ACADEMIC_YEAR.slice(Math.max(0, end - 3), end)
    }, [month])

    // ----------------------------------------------------------------- editing
    const [isEditLocked, setIsEditLocked] = useState(true)
    const dirty = Object.keys(edits).length > 0

    const handleScoreChange = (studentId: string, key: string, value: string) => {
        setEdits(prev => ({ ...prev, [studentId]: { ...(prev[studentId] ?? {}), [key]: value } }))
    }

    const handleSave = async () => {
        const payload: ScoreInput[] = []
        for (const [studentId, row] of Object.entries(edits)) {
            for (const [subject, value] of Object.entries(row)) {
                payload.push({ student_id: studentId, subject, score_value: value })
            }
        }
        if (payload.length === 0) return

        setSaving(true)
        const res = await saveScores(currentMode, scorePeriod, payload)
        if (res.error) {
            notify.error('បរាជ័យក្នុងការរក្សាទុកពិន្ទុ៖ ' + res.error)
        } else {
            notify.success(`បានរក្សាទុកពិន្ទុ ${toKhmerNumber(payload.length)} កោសិកា`)
            await loadRecords()
        }
        setSaving(false)
    }

    // -------------------------------------------------------------- selection
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const visibleIds = useMemo(() => filteredRows.map(r => r.id), [filteredRows])
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id))

    const toggleAll = () => {
        setSelected(prev => {
            const next = new Set(prev)
            if (allSelected) visibleIds.forEach(id => next.delete(id))
            else visibleIds.forEach(id => next.add(id))
            return next
        })
    }

    const toggleOne = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    // --------------------------------------------------------------- overlays
    const [isMonthModalOpen, setIsMonthModalOpen] = useState(false)
    const [columnsModalOpen, setColumnsModalOpen] = useState(false)
    const [analyticsOpen, setAnalyticsOpen] = useState(false)
    const [printOpen, setPrintOpen] = useState(false)
    const [printRows, setPrintRows] = useState<TotalledStudent[] | null>(null)
    const [toolsOpen, setToolsOpen] = useState(false)
    const toolsRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!toolsOpen) return
        const onDown = (e: MouseEvent) => {
            if (!toolsRef.current?.contains(e.target as Node)) setToolsOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [toolsOpen])

    const modeLabel = currentMode === 'monthly' ? 'ប្រចាំខែ' : currentMode === 'semester' ? 'ប្រចាំឆមាស' : 'ប្រចាំឆ្នាំ'
    const periodLabel = currentMode === 'monthly' ? `ខែ${MONTH_LABEL_BY_ID[month] ?? month}`
        : currentMode === 'semester' ? (semester === 'sem1' ? 'ឆមាសទី១' : 'ឆមាសទី២')
        : `ឆ្នាំសិក្សា ${academicYear}`

    const enterHref = `/score/enter?mode=${currentMode === 'annual' ? 'monthly' : currentMode}&year=${encodeURIComponent(academicYear)}${currentMode === 'semester' ? `&semester=${semester}` : `&month=${month}`}`

    const openPrint = (subset?: TotalledStudent[]) => {
        setPrintRows(subset ?? null)
        setPrintOpen(true)
    }

    const doExport = async (subset?: TotalledStudent[]) => {
        const target = subset ?? filteredRows
        if (target.length === 0) {
            notify.error('គ្មានទិន្នន័យសម្រាប់នាំចេញ')
            return
        }
        await exportScoreTotal(target, groups, scorePeriod, scheme)
        notify.success('បាននាំចេញជាឯកសារ Excel')
    }

    const doClearScores = async (ids: string[]) => {
        if (!(await confirm({
            title: 'លុបពិន្ទុ',
            message: `ពិន្ទុ${modeLabel} ${periodLabel} របស់សិស្ស ${toKhmerNumber(ids.length)} នាក់នឹងត្រូវលុបចោល។ សកម្មភាពនេះមិនអាចត្រឡប់វិញបានទេ។`,
            tone: 'danger',
            confirmLabel: 'លុបពិន្ទុ',
        }))) return

        const res = await clearScoresForStudents(currentMode, scorePeriod, ids)
        if (res.error) {
            notify.error(res.error)
            return
        }
        notify.success(`បានលុបពិន្ទុសិស្ស ${toKhmerNumber(ids.length)} នាក់`)
        setSelected(new Set())
        await loadRecords()
    }

    // ------------------------------------------------------------------ render
    const resultColumns = currentMode === 'monthly'
        ? [
            { key: 'total', label: 'សរុប', value: (s: TotalledStudent) => formatMark(s.total) },
            { key: 'rank', label: 'ចំណាត់ថ្នាក់', value: (s: TotalledStudent) => (s.rank ? toKhmerNumber(s.rank) : '—') },
        ]
        : currentMode === 'semester'
        ? [
            { key: 'examTotal', label: 'ពិន្ទុសរុប', value: (s: TotalledStudent) => formatMark(s.examTotal) },
            { key: 'examAvg', label: 'ម.ភាគប្រឡង', value: (s: TotalledStudent) => s.examAverage },
            { key: 'monthlyAvg', label: 'ម.ភាគប្រចាំខែ', value: (s: TotalledStudent) => s.monthlyAverage },
            { key: 'rank', label: 'ចំណាត់ថ្នាក់', value: (s: TotalledStudent) => (s.rank ? toKhmerNumber(s.rank) : '—') },
        ]
        : [
            { key: 'rank', label: 'ចំណាត់ថ្នាក់', value: (s: TotalledStudent) => (s.rank ? toKhmerNumber(s.rank) : '—') },
        ]

    const finalLabel = currentMode === 'semester' ? 'មធ្យមភាគឆមាស'
        : currentMode === 'annual' ? 'លទ្ធផលប្រចាំឆ្នាំ' : 'មធ្យមភាគ'

    return (
        <PageContainer>
            <style jsx global>{`
                /* Sticky rails. The left offsets are the widths of the columns
                   before them, so they have to be literal pixel values. */
                .st-c1, .st-c2, .st-c3, .st-r1 {
                    position: sticky;
                    z-index: 20;
                    background-color: var(--surface);
                }
                .st-c1 { left: 0; width: 40px; }
                .st-c2 { left: 40px; width: 44px; }
                .st-c3 { left: 84px; box-shadow: 4px 0 6px -4px rgba(15, 27, 61, 0.18); }
                .st-r1 { right: 0; box-shadow: -4px 0 6px -4px rgba(15, 27, 61, 0.18); }

                .score-grid thead { position: sticky; top: 0; z-index: 30; }
                .score-grid thead th { position: sticky; top: 0; }
                .score-grid thead .st-c1,
                .score-grid thead .st-c2,
                .score-grid thead .st-c3,
                .score-grid thead .st-r1 { z-index: 45; background-color: var(--brand); }

                .score-grid tbody tr:hover .st-c1,
                .score-grid tbody tr:hover .st-c2,
                .score-grid tbody tr:hover .st-c3,
                .score-grid tbody tr:hover .st-r1 { background-color: var(--surface-muted); }

                .score-grid input[type=number]::-webkit-inner-spin-button,
                .score-grid input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
                .score-grid input[type=number] { -moz-appearance: textfield; }
            `}</style>

            {/* ---------------------------------------------------------- header */}
            <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-contrast shadow-md sm:flex">
                        <Table2 className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <h1 className="kh-moul text-lg text-brand md:text-xl">តារាងពិន្ទុសិស្សសរុប</h1>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
                            <span>ពិន្ទុ{modeLabel} {periodLabel} · ឆ្នាំសិក្សា {academicYear}</span>
                            {levelContextLabel && (
                                <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-800 dark:bg-brand-900/40 dark:text-brand-300">
                                    {levelContextLabel}
                                </span>
                            )}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Link
                        href={enterHref}
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-success px-4 text-sm font-bold text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                        <PlusCircle className="h-4 w-4" aria-hidden="true" /> បញ្ចូលពិន្ទុ
                    </Link>

                    <Button
                        variant={isEditLocked ? 'secondary' : 'warning'}
                        printHidden={false}
                        onClick={() => setIsEditLocked(v => !v)}
                    >
                        {isEditLocked ? <Lock className="h-4 w-4" aria-hidden="true" /> : <Unlock className="h-4 w-4" aria-hidden="true" />}
                        {isEditLocked ? 'ចាក់សោរ' : 'ដោះសោរ'}
                    </Button>

                    {!isEditLocked && (
                        <Button printHidden={false} onClick={handleSave} loading={saving} disabled={!dirty}>
                            <CloudUpload className="h-4 w-4" aria-hidden="true" /> រក្សាទុក
                        </Button>
                    )}

                    <div className="relative" ref={toolsRef}>
                        <Button variant="secondary" printHidden={false} onClick={() => setToolsOpen(v => !v)} aria-expanded={toolsOpen}>
                            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> ឧបករណ៍ផ្សេងទៀត
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        {toolsOpen && (
                            <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-lg border border-divider bg-bg-surface p-1.5 shadow-lg">
                                {([
                                    { label: 'ទាញយក Excel', icon: FileSpreadsheet, run: () => doExport() },
                                    { label: 'បោះពុម្ពតារាង', icon: Printer, run: () => openPrint() },
                                    { label: 'សម្រាយទិន្នន័យ', icon: PieChart, run: () => setAnalyticsOpen(true) },
                                    { label: 'ជ្រើសរើសជួរឈរ', icon: Columns3, run: () => setColumnsModalOpen(true) },
                                    { label: 'តារាងទម្រង់ក្រសួង', icon: FileText, href: '/score/print' },
                                ] as { label: string; icon: LucideIcon; run?: () => void; href?: string }[]).map(item => item.href ? (
                                    <Link
                                        key={item.label}
                                        href={item.href}
                                        onClick={() => setToolsOpen(false)}
                                        className="flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm font-bold text-text-body transition hover:bg-paper hover:text-brand"
                                    >
                                        <item.icon className="h-4 w-4" aria-hidden="true" /> {item.label}
                                    </Link>
                                ) : (
                                    <button
                                        key={item.label}
                                        type="button"
                                        onClick={() => { setToolsOpen(false); item.run?.() }}
                                        className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm font-bold text-text-body transition hover:bg-paper hover:text-brand"
                                    >
                                        <item.icon className="h-4 w-4" aria-hidden="true" /> {item.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* ------------------------------------------------------ stat cards */}
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                    label="ចំនួនសិស្សសរុប"
                    value={`${toKhmerNumber(stats.total)} នាក់`}
                    hint={`មានពិន្ទុ ${toKhmerNumber(stats.scored)} នាក់`}
                    icon={Users}
                    tone="brand"
                />
                <StatCard
                    label="អត្រាជាប់"
                    value={`${toKhmerNumber(stats.passRate)}%`}
                    hint={`មធ្យមភាគ ≥ ${toKhmerNumber(PASS_MARK)}`}
                    icon={TrendingUp}
                    tone="success"
                />
                <StatCard
                    label="មធ្យមភាគថ្នាក់"
                    value={
                        <span className={styleFor(stats.average, scheme).text}>
                            {formatMark(stats.average)}
                            <span className="ml-1.5 text-base opacity-80">{letterOrDash(stats.average, scheme)}</span>
                        </span>
                    }
                    hint={`ពិន្ទុពេញ ${toKhmerNumber(MAX_SCORE)}`}
                    icon={Gauge}
                    tone="gold"
                />
                {/* Clickable: the figure and the filter that isolates it are the
                    same thought, so they are the same control. */}
                <button
                    type="button"
                    onClick={() => setOnlyFailing(v => !v)}
                    aria-pressed={onlyFailing}
                    className={`rounded-xl border p-4 text-left shadow-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${onlyFailing ? 'border-danger bg-danger/5' : 'border-divider bg-bg-surface hover:border-danger'}`}
                >
                    <div className="flex items-start justify-between gap-3">
                        <p className="text-[13px] font-bold text-text-muted">សិស្សធ្លាក់</p>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
                            <AlertTriangle className="h-[18px] w-[18px]" aria-hidden="true" />
                        </span>
                    </div>
                    <p className="mt-2 text-2xl font-bold tracking-tight text-text-heading tabular-nums">
                        {toKhmerNumber(stats.failing)} នាក់
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                        {onlyFailing ? 'កំពុងបង្ហាញតែសិស្សធ្លាក់ — ចុចម្តងទៀតដើម្បីបង្ហាញទាំងអស់' : 'ចុចដើម្បីត្រងបង្ហាញតែសិស្សធ្លាក់'}
                    </p>
                </button>
            </div>

            {/* --------------------------------------------------------- filters */}
            <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-divider bg-bg-app/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
                <div className="flex flex-wrap items-center gap-2">
                    <div role="tablist" aria-label="រយៈពេល" className="flex rounded-lg bg-paper p-1">
                        {MODES.map(({ id, label, icon: Icon }) => (
                            <button
                                key={id}
                                role="tab"
                                type="button"
                                aria-selected={currentMode === id}
                                onClick={() => setCurrentMode(id)}
                                className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${currentMode === id ? 'bg-brand text-brand-contrast shadow-sm' : 'text-text-muted hover:text-brand'}`}
                            >
                                <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
                            </button>
                        ))}
                    </div>

                    <Select
                        ariaLabel="ឆ្នាំសិក្សា"
                        value={academicYear}
                        onChange={setAcademicYear}
                        options={academicYearOptions}
                        leadingIcon={<CalendarDays />}
                        wrapperClassName="w-auto"
                    />

                    {currentMode === 'monthly' && (
                        <Select
                            ariaLabel="ខែ"
                            value={month}
                            onChange={setMonth}
                            options={MONTHS_BY_ACADEMIC_YEAR.map(m => ({ value: m.id, label: m.label }))}
                            leadingIcon={<Clock />}
                            wrapperClassName="w-auto"
                        />
                    )}

                    {currentMode === 'semester' && (
                        <>
                            <Select
                                ariaLabel="ឆមាស"
                                value={semester}
                                onChange={setSemester}
                                options={[
                                    { value: 'sem1', label: 'ឆមាសទី១' },
                                    { value: 'sem2', label: 'ឆមាសទី២' },
                                ]}
                                leadingIcon={<Bookmark />}
                                wrapperClassName="w-auto"
                            />
                            <Button size="sm" variant="secondary" printHidden={false} onClick={() => setIsMonthModalOpen(true)}>
                                <Settings2 className="h-3.5 w-3.5" aria-hidden="true" /> ខែបូកបញ្ចូល ({toKhmerNumber(selectedSemesterMonths.length)})
                            </Button>
                        </>
                    )}

                    <div className="relative min-w-[180px] flex-1">
                        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="ស្វែងរកឈ្មោះ ឬអត្តលេខ"
                            aria-label="ស្វែងរកសិស្ស"
                            className={controlClass(false, 'pl-9')}
                        />
                    </div>

                    <Button size="sm" variant="secondary" printHidden={false} onClick={() => setFiltersOpen(v => !v)} aria-expanded={filtersOpen}>
                        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> តម្រង
                        <ChevronDown className={`h-3.5 w-3.5 transition ${filtersOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </Button>
                </div>

                {filtersOpen && (
                    <div className="mt-3 grid gap-4 rounded-lg border border-divider bg-bg-surface p-3 md:grid-cols-3">
                        <Select
                            label="ភេទ"
                            value={gender}
                            onChange={setGender}
                            options={[
                                { value: '', label: 'ទាំងអស់' },
                                { value: 'ប្រុស', label: 'ប្រុស' },
                                { value: 'ស្រី', label: 'ស្រី' },
                            ]}
                        />

                        <div className="md:col-span-2">
                            <p className="mb-1 text-[13px] font-bold text-text-body">
                                ចន្លោះមធ្យមភាគ៖ <span className="text-brand tabular-nums">{formatMark(minAvg)} – {formatMark(maxAvg ?? MAX_SCORE)}</span>
                            </p>
                            <div className="flex flex-col gap-1.5">
                                <label className="flex items-center gap-2 text-xs text-text-muted">
                                    <span className="w-10 shrink-0">អប្បបរមា</span>
                                    <input
                                        type="range"
                                        min={0}
                                        max={MAX_SCORE}
                                        step={0.5}
                                        value={minAvg}
                                        onChange={(e) => setMinAvg(Math.min(Number(e.target.value), maxAvg ?? MAX_SCORE))}
                                        className="h-1.5 flex-1 accent-[var(--brand)]"
                                        aria-label="មធ្យមភាគអប្បបរមា"
                                    />
                                </label>
                                <label className="flex items-center gap-2 text-xs text-text-muted">
                                    <span className="w-10 shrink-0">អតិបរមា</span>
                                    <input
                                        type="range"
                                        min={0}
                                        max={MAX_SCORE}
                                        step={0.5}
                                        value={maxAvg ?? MAX_SCORE}
                                        onChange={(e) => setMaxAvg(Math.max(Number(e.target.value), minAvg))}
                                        className="h-1.5 flex-1 accent-[var(--brand)]"
                                        aria-label="មធ្យមភាគអតិបរមា"
                                    />
                                </label>
                            </div>
                        </div>
                    </div>
                )}

                {/* Active filter chips */}
                {filtersActive && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {search && <FilterChip label={`ស្វែងរក៖ ${search}`} onClear={() => setSearch('')} />}
                        {gender && <FilterChip label={`ភេទ៖ ${gender}`} onClear={() => setGender('')} />}
                        {onlyFailing && <FilterChip label="តែសិស្សធ្លាក់" onClear={() => setOnlyFailing(false)} />}
                        {(minAvg !== 0 || maxAvg !== null) && (
                            <FilterChip
                                label={`មធ្យមភាគ ${formatMark(minAvg)}–${formatMark(maxAvg ?? MAX_SCORE)}`}
                                onClear={() => { setMinAvg(0); setMaxAvg(null) }}
                            />
                        )}
                        {hiddenColumns.size > 0 && (
                            <FilterChip
                                label={`លាក់ជួរឈរ ${toKhmerNumber(hiddenColumns.size)}`}
                                onClear={() => setHiddenColumns(new Set())}
                            />
                        )}
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="ml-1 text-xs font-bold text-brand hover:underline"
                        >
                            សម្អាតតម្រងទាំងអស់
                        </button>
                    </div>
                )}
            </div>

            {/* ----------------------------------------------------------- table */}
            {loading ? (
                <div className="flex flex-col gap-2" role="status" aria-busy="true">
                    <span className="sr-only">កំពុងទាញទិន្នន័យ...</span>
                    <Skeleton className="h-10 w-full rounded-lg" />
                    {Array.from({ length: 10 }).map((_, i) => (
                        <Skeleton key={i} className="h-11 w-full rounded-lg" />
                    ))}
                </div>
            ) : rows.length === 0 ? (
                <div className="rounded-xl border border-divider bg-bg-surface">
                    <EmptyState
                        title="មិនទាន់មានសិស្សក្នុងថ្នាក់នេះ"
                        description="ចុះឈ្មោះសិស្សជាមុនសិន រួចត្រឡប់មកមើលតារាងពិន្ទុ។"
                        action={
                            <Link
                                href="/student-list"
                                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-brand-contrast transition hover:bg-brand-hover"
                            >
                                <Users className="h-4 w-4" aria-hidden="true" /> ចុះឈ្មោះសិស្ស
                            </Link>
                        }
                    />
                </div>
            ) : filteredRows.length === 0 ? (
                <div className="rounded-xl border border-divider bg-bg-surface">
                    <EmptyState
                        kind="filtered"
                        title="គ្មានសិស្សត្រូវនឹងលក្ខខណ្ឌដែលបានជ្រើសរើស"
                        description="សាកល្បងបន្ធូរតម្រង ឬសម្អាតវាចោល។"
                        action={
                            <Button variant="secondary" printHidden={false} onClick={clearFilters}>
                                <X className="h-4 w-4" aria-hidden="true" /> សម្អាតតម្រង
                            </Button>
                        }
                    />
                </div>
            ) : stats.scored === 0 ? (
                <div className="rounded-xl border border-divider bg-bg-surface">
                    <EmptyState
                        title={`មិនទាន់មានពិន្ទុសម្រាប់${periodLabel}`}
                        description="បញ្ចូលពិន្ទុជាមុនសិន រួចតារាងនេះនឹងគណនាមធ្យមភាគ និងចំណាត់ថ្នាក់ដោយស្វ័យប្រវត្តិ។"
                        action={
                            <Link
                                href={enterHref}
                                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-success px-4 text-sm font-bold text-white transition hover:opacity-90"
                            >
                                <PlusCircle className="h-4 w-4" aria-hidden="true" /> បញ្ចូលពិន្ទុ
                            </Link>
                        }
                    />
                </div>
            ) : (
                <>
                    {/* Desktop / tablet: the grid, with its two pinned rails.
                        `FullscreenGrid` owns the ពេញអេក្រង់ toggle and the
                        scroll region; the pinned rails need nothing because
                        `position: sticky` resolves against that same container
                        in both states. Saving stays on the toolbar button, which
                        sits behind the overlay — edits made while expanded are
                        kept (same DOM nodes) and save on exit. */}
                    <div className="hidden lg:block">
                        <FullscreenGrid label="តារាងពិន្ទុសិស្សសរុប" collapsedMaxHeight="max-h-[70vh]">
                        <table className="score-grid w-full border-collapse text-sm">
                            <thead>
                                <tr>
                                    <th rowSpan={2} className="st-c1 border border-brand-400 p-2 text-center text-brand-contrast">
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={toggleAll}
                                            aria-label="ជ្រើសរើសសិស្សទាំងអស់"
                                            className="h-4 w-4 accent-[var(--brand)]"
                                        />
                                    </th>
                                    <th rowSpan={2} className="st-c2 border border-brand-400 p-2 text-center text-xs text-brand-contrast">ល.រ</th>
                                    <th rowSpan={2} className="st-c3 min-w-[210px] border border-brand-400 p-2 text-left text-xs text-brand-contrast">ឈ្មោះសិស្ស</th>
                                    {groups.map((g) => (
                                        <th key={g.name} colSpan={g.columns.length} className={`border border-brand-400 p-1.5 text-center text-xs text-white ${g.color}`}>
                                            {g.name}
                                        </th>
                                    ))}
                                    <th colSpan={resultColumns.length + 2} className="border border-brand-400 bg-gold p-1.5 text-center text-xs font-bold text-brand-950">
                                        លទ្ធផលសរុប
                                    </th>
                                    <th rowSpan={2} className="st-r1 border border-brand-400 p-2 text-center text-xs text-brand-contrast" style={{ minWidth: '120px' }}>
                                        {finalLabel}
                                    </th>
                                </tr>
                                <tr>
                                    {columns.map((c) => (
                                        <th
                                            key={c.key}
                                            className="min-w-[74px] border border-brand-400 bg-brand-700/90 p-1.5 text-[11px] font-normal text-white"
                                        >
                                            {c.label}
                                        </th>
                                    ))}
                                    {resultColumns.map((c) => (
                                        <th key={c.key} className="min-w-[76px] border border-brand-400 bg-gold p-1.5 text-[11px] font-bold text-brand-950">
                                            {c.label}
                                        </th>
                                    ))}
                                    <th className="w-14 border border-brand-400 bg-gold p-1.5 text-[11px] font-bold text-brand-950">និទ្ទេស</th>
                                    <th className="w-10 border border-brand-400 bg-gold p-1.5 text-[11px] font-bold text-brand-950">
                                        <span className="sr-only">សកម្មភាព</span>⋮
                                    </th>
                                </tr>
                            </thead>

                            <tbody>
                                {filteredRows.map((stu) => {
                                    const avg = stu.finalAverageForRank || null
                                    const style = styleFor(avg, scheme)
                                    const isSelected = selected.has(stu.id)

                                    return (
                                        <tr
                                            key={stu.id}
                                            className={`border-b border-divider transition hover:bg-paper ${isSelected ? 'bg-brand/5 ring-1 ring-brand/20' : ''}`}
                                        >
                                            <td className="st-c1 border border-divider p-2 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleOne(stu.id)}
                                                    aria-label={`ជ្រើសរើស ${stu.name_kh || stu.name_en}`}
                                                    className="h-4 w-4 accent-[var(--brand)]"
                                                />
                                            </td>
                                            <td className="st-c2 border border-divider p-2 text-center text-xs font-bold text-text-muted tabular-nums">
                                                {toKhmerNumber(rowNumbers.get(stu.id) ?? 0)}
                                            </td>
                                            <td className={`st-c3 border border-divider p-2 ${style.rail}`}>
                                                <div className="flex items-center gap-2">
                                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-paper text-xs font-bold text-brand">
                                                        {stu.photo_url ? (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img src={getDriveImageUrl(stu.photo_url)} alt="" className="h-full w-full object-cover" />
                                                        ) : (
                                                            (stu.name_kh || stu.name_en || '?').trim().charAt(0)
                                                        )}
                                                    </span>
                                                    <span className="min-w-0">
                                                        <Link
                                                            href={`/students/${stu.id}`}
                                                            className="block truncate font-bold whitespace-nowrap text-text-heading hover:text-brand hover:underline"
                                                        >
                                                            {stu.name_kh || stu.name_en}
                                                        </Link>
                                                        <span className="block truncate text-[10px] text-text-muted">
                                                            {stu.student_id || '—'}{stu.gender ? ` · ${stu.gender}` : ''}
                                                        </span>
                                                    </span>
                                                </div>
                                            </td>

                                            {columns.map((col) => {
                                                const raw = stu.scores[col.key] ?? ''
                                                // `numericCell`, not `Number(raw)`: `Number('') === 0`, which is
                                                // finite, so every not-yet-entered cell was painted as a *fail* —
                                                // a wall of danger pills over a class that simply has no marks
                                                // yet. score-band's own contract: missing is `none`, never `fail`.
                                                const numeric = numericCell(raw)
                                                const colMax = maxByColumn[col.key] ?? scheme.maxScore
                                                const cellStyle = col.isText || numeric === null
                                                    ? styleFor(null)
                                                    : styleForMark(numeric, colMax, scheme)
                                                const rank = columnRanks.get(col.key)?.get(stu.id)
                                                const tooltip = raw === '' ? 'មិនទាន់មានពិន្ទុ'
                                                    : col.isText ? String(raw)
                                                    : `${formatMark(numeric)}/${formatMark(colMax)} · និទ្ទេស ${letterFor(numeric, scheme, colMax)}${rank ? ` · ចំណាត់ថ្នាក់ទី ${rank}` : ''}`

                                                if (isEditLocked || col.readOnly) {
                                                    return (
                                                        <td key={col.key} className="border border-divider p-1 text-center" title={tooltip}>
                                                            <span className={`inline-block rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums ${cellStyle.pill}`}>
                                                                {raw === '' ? '—' : col.isText || numeric === null ? String(raw) : formatMark(numeric)}
                                                            </span>
                                                        </td>
                                                    )
                                                }

                                                return (
                                                    <td key={col.key} className="border border-divider p-0.5">
                                                        {col.isText ? (
                                                            <select
                                                                aria-label={`${col.label} សម្រាប់ ${stu.name_kh || stu.name_en}`}
                                                                value={String(raw)}
                                                                onChange={(e) => handleScoreChange(stu.id, col.key, e.target.value)}
                                                                className="min-h-9 w-full cursor-pointer rounded-md border border-divider bg-bg-surface text-center text-[11px] font-bold text-success outline-none focus:ring-2 focus:ring-focus-ring/30"
                                                                style={{ textAlignLast: 'center' }}
                                                            >
                                                                <option value="">—</option>
                                                                {col.options?.map(o => <option key={o} value={o}>{o}</option>)}
                                                            </select>
                                                        ) : (
                                                            <input
                                                                type="number"
                                                                step="0.25"
                                                                min={0}
                                                                max={colMax}
                                                                inputMode="decimal"
                                                                aria-label={`ពិន្ទុ${col.label} សម្រាប់ ${stu.name_kh || stu.name_en}`}
                                                                value={String(raw)}
                                                                onChange={(e) => handleScoreChange(stu.id, col.key, e.target.value)}
                                                                onFocus={(e) => e.currentTarget.select()}
                                                                className={`min-h-9 w-full rounded-md border text-center text-[13px] font-bold tabular-nums outline-none focus:ring-2 focus:ring-focus-ring/30 ${cellStyle.field}`}
                                                            />
                                                        )}
                                                    </td>
                                                )
                                            })}

                                            {resultColumns.map((c) => (
                                                <td key={c.key} className="border border-divider p-1.5 text-center text-xs font-bold text-text-body tabular-nums">
                                                    {c.value(stu)}
                                                </td>
                                            ))}
                                            <td className={`border border-divider p-1.5 text-center text-sm font-bold ${style.text}`}>
                                                {letterOrDash(avg, scheme)}
                                            </td>
                                            <td className="border border-divider p-0 text-center">
                                                <RowMenu student={stu} enterHref={enterHref} />
                                            </td>

                                            <td className="st-r1 border border-divider p-1.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`rounded-lg px-2 py-0.5 text-sm font-bold tabular-nums ${style.pill}`}>
                                                        {formatMark(avg)}
                                                    </span>
                                                    {currentMode === 'monthly' && (
                                                        <Sparkline
                                                            points={trendMonths.map(m => monthlyAverages[stu.id]?.[m.id] ?? null)}
                                                            labels={trendMonths.map(m => m.label)}
                                                        />
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                        </FullscreenGrid>
                    </div>

                    {/* Phones and small tablets: one card per pupil. */}
                    <div className="lg:hidden">
                        <ScoreTotalCards
                            rows={filteredRows}
                            columns={columns}
                            enterHref={enterHref}
                            rowNumbers={rowNumbers}
                            scheme={scheme}
                            maxByColumn={maxByColumn}
                        />
                    </div>
                </>
            )}

            {/* ------------------------------------------------------- bulk bar */}
            {selected.size > 0 && (
                <div className="sheet-enter fixed inset-x-0 bottom-0 z-40 mx-auto max-w-4xl p-3 print:hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-divider bg-bg-surface px-4 py-3 shadow-lg">
                        <p className="flex items-center gap-2 text-sm font-bold text-text-heading">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs text-brand-contrast">
                                {toKhmerNumber(selected.size)}
                            </span>
                            បានជ្រើសរើស
                            <button
                                type="button"
                                onClick={() => setSelected(new Set())}
                                aria-label="មិនជ្រើសរើសទាំងអស់"
                                className="ml-1 rounded p-1 text-text-muted hover:bg-paper hover:text-text-heading"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" variant="secondary" printHidden={false}
                                onClick={() => openPrint(filteredRows.filter(r => selected.has(r.id)))}>
                                <Printer className="h-3.5 w-3.5" aria-hidden="true" /> បោះពុម្ពរបាយការណ៍
                            </Button>
                            <Button size="sm" variant="secondary" printHidden={false}
                                onClick={() => doExport(filteredRows.filter(r => selected.has(r.id)))}>
                                <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" /> ទាញយក Excel
                            </Button>
                            <Button size="sm" variant="danger" printHidden={false}
                                onClick={() => doClearScores([...selected])}>
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> លុបពិន្ទុ
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* -------------------------------------------------------- overlays */}
            <Dialog
                open={isMonthModalOpen}
                onClose={() => setIsMonthModalOpen(false)}
                title="ជ្រើសរើសខែបូកបញ្ចូល"
                description="ខែទាំងនេះនឹងត្រូវយកមកគណនាមធ្យមភាគប្រចាំខែ ដើម្បីបូកជាមួយពិន្ទុប្រឡងឆមាស"
                footer={
                    <Button printHidden={false} onClick={() => setIsMonthModalOpen(false)} icon={<Check className="h-4 w-4" />}>
                        យល់ព្រម
                    </Button>
                }
            >
                <div className="grid grid-cols-2 gap-2.5">
                    {MONTHS_BY_ACADEMIC_YEAR.map(m => {
                        const isSelected = selectedSemesterMonths.includes(m.id)
                        return (
                            <label
                                key={m.id}
                                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${isSelected ? 'border-brand bg-brand-100 dark:bg-brand-900/30' : 'border-divider hover:bg-paper'}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => setSelectedSemesterMonths(prev =>
                                        e.target.checked ? [...prev, m.id] : prev.filter(x => x !== m.id))}
                                    className="h-4 w-4 accent-[var(--brand)]"
                                />
                                <span className={`text-sm font-bold ${isSelected ? 'text-brand' : 'text-text-body'}`}>{m.label}</span>
                            </label>
                        )
                    })}
                </div>
            </Dialog>

            <Dialog
                open={columnsModalOpen}
                onClose={() => setColumnsModalOpen(false)}
                title="ជ្រើសរើសជួរឈរ"
                description="លាក់មុខវិជ្ជាដែលមិនទាន់បង្រៀន ដើម្បីឲ្យតារាងតូចជាងមុន"
                size="lg"
                footer={
                    <>
                        <Button variant="secondary" printHidden={false} onClick={() => setHiddenColumns(new Set())}>
                            បង្ហាញទាំងអស់
                        </Button>
                        <Button printHidden={false} onClick={() => setColumnsModalOpen(false)} icon={<Check className="h-4 w-4" />}>
                            យល់ព្រម
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4">
                    {allGroups.map(g => (
                        <div key={g.name}>
                            <p className="mb-2 text-[13px] font-bold text-text-heading">{g.name}</p>
                            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                {g.columns.map(c => {
                                    const shown = !hiddenColumns.has(c.key)
                                    return (
                                        <label key={c.key} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-xs text-text-body hover:bg-paper">
                                            <input
                                                type="checkbox"
                                                checked={shown}
                                                onChange={() => setHiddenColumns(prev => {
                                                    const next = new Set(prev)
                                                    if (shown) next.add(c.key)
                                                    else next.delete(c.key)
                                                    return next
                                                })}
                                                className="h-3.5 w-3.5 accent-[var(--brand)]"
                                            />
                                            <span className="min-w-0 truncate">{c.label}</span>
                                        </label>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </Dialog>

            <ScoreAnalyticsPanel
                open={analyticsOpen}
                onClose={() => setAnalyticsOpen(false)}
                rows={filteredRows}
                groups={groups}
                monthlyTrend={classTrend}
                periodLabel={`ពិន្ទុ${modeLabel} ${periodLabel}`}
                scheme={scheme}
            />

            <ScoreTotalPrint
                open={printOpen}
                onClose={() => setPrintOpen(false)}
                rows={printRows ?? filteredRows}
                groups={groups}
                settings={settings}
                periodLabel={periodLabel}
                academicYear={academicYear}
                modeLabel={modeLabel}
                scheme={scheme}
                maxByColumn={maxByColumn}
            />

            {saving && (
                <p className="sr-only" role="status" aria-live="polite">កំពុងរក្សាទុក...</p>
            )}

            {dialog}
        </PageContainer>
    )
}

/** A removable summary of one active filter. */
function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-[11px] font-bold text-brand-800 dark:bg-brand-900/40 dark:text-brand-300">
            {label}
            <button
                type="button"
                onClick={onClear}
                aria-label={`ដកតម្រង ${label}`}
                className="rounded-full p-0.5 hover:bg-brand-200/60 dark:hover:bg-brand-800/60"
            >
                <X className="h-3 w-3" aria-hidden="true" />
            </button>
        </span>
    )
}

/**
 * Per-row actions.
 *
 * Portalled and positioned from the trigger's rect: the table is inside an
 * `overflow: auto` box, and an absolutely positioned menu would be clipped by
 * it the moment the row is near the bottom edge.
 */
function RowMenu({ student, enterHref }: { student: TotalledStudent; enterHref: string }) {
    const [open, setOpen] = useState(false)
    const [rect, setRect] = useState<DOMRect | null>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (!open) return
        const close = () => setOpen(false)
        // Any scroll invalidates the anchor, so the menu closes rather than
        // floating away from the row it belongs to.
        document.addEventListener('mousedown', close)
        window.addEventListener('scroll', close, true)
        window.addEventListener('resize', close)
        return () => {
            document.removeEventListener('mousedown', close)
            window.removeEventListener('scroll', close, true)
            window.removeEventListener('resize', close)
        }
    }, [open])

    const items = [
        { label: 'មើលលម្អិត', icon: Eye, href: `/students/${student.id}` },
        { label: 'កែពិន្ទុ', icon: PencilLine, href: enterHref },
        { label: 'របាយការណ៍អាណាព្យាបាល', icon: FileText, href: '/parent-report' },
        { label: 'បោះពុម្ពប័ណ្ណសិស្ស', icon: Printer, href: '/id-student' },
    ]

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                aria-label={`សកម្មភាពសម្រាប់ ${student.name_kh || student.name_en}`}
                aria-expanded={open}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => {
                    setRect(buttonRef.current?.getBoundingClientRect() ?? null)
                    setOpen(v => !v)
                }}
                className="flex h-9 w-full items-center justify-center text-text-muted transition hover:text-brand"
            >
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </button>

            {open && rect && createPortal(
                <div
                    className="fixed z-[90] w-52 rounded-lg border border-divider bg-bg-surface p-1.5 shadow-lg"
                    style={{
                        top: Math.min(rect.bottom + 4, window.innerHeight - 200),
                        left: Math.max(8, rect.right - 208),
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    {items.map(({ label, icon: Icon, href }) => (
                        <Link
                            key={label}
                            href={href}
                            onClick={() => setOpen(false)}
                            className="flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm font-bold text-text-body transition hover:bg-paper hover:text-brand"
                        >
                            <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                        </Link>
                    ))}
                </div>,
                document.body,
            )}
        </>
    )
}
