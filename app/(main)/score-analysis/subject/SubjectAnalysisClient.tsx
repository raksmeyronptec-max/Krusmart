'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { ArrowLeft, PieChart, BarChart2, TrendingUp, Trophy, AlertTriangle, User } from 'lucide-react'
import Link from 'next/link'
import { getAllScoresByPeriod, getMonthlyScoresForYear } from '../../score/total/actions'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
    ResponsiveContainer, LineChart, Line,
} from 'recharts'
import Select from '@/components/ui/forms/Select'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import { MONTHS_BY_ACADEMIC_YEAR } from '@/lib/constants/months'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { Score, Student } from '@/lib/types'

/** Pass/fail tally for one subject, as charted on this page. */
interface SubjectStat {
    key: string
    subject: string
    passed: number
    failed: number
    passedPct: string
    failedPct: string
    total: number
}

/** A pupil's mark in the selected subject and period. */
interface StudentMark {
    id: string
    name: string
    value: number
}

const PASS_MARK = 5.0

const config = {
    monthly: {
        columns: [
            { key: 'kh_listen', label: 'សមត្ថភាពស្តាប់' }, { key: 'kh_speak', label: 'សមត្ថភាពនិយាយ' },
            { key: 'kh_read', label: 'សមត្ថភាពអាន' }, { key: 'kh_write', label: 'សមត្ថភាពសរសេរ' },
            { key: 'kh_calligraphy', label: 'អក្សរផ្ចង់' }, { key: 'kh_recitation', label: 'មេសូត្រ' }, { key: 'kh_essay', label: 'តែងសេចក្តី' },
            { key: 'math_num', label: 'សមត្ថភាពចំនួន' }, { key: 'math_meas', label: 'រង្វាស់រង្វាល់' },
            { key: 'math_geo', label: 'ធរណីមាត្រ' }, { key: 'math_alg', label: 'ពីជគណិត' },
            { key: 'math_stat', label: 'ស្ថិតិ' },
            { key: 'sci_phy', label: 'រូបវិទ្យា' }, { key: 'sci_chem', label: 'គីមីវិទ្យា' },
            { key: 'sci_bio', label: 'ជីវវិទ្យា' }, { key: 'sci_earth', label: 'ផែនដីវិទ្យា' }, { key: 'sci_applied', label: 'អនុវត្តន៍' },
            { key: 'soc_ethic', label: 'សីលធម៌' }, { key: 'soc_geo', label: 'ភូមិវិទ្យា' },
            { key: 'soc_hist', label: 'ប្រវត្តិវិទ្យា' }, { key: 'soc_home', label: 'គេហវិទ្យា' },
            { key: 'pe_sport', label: 'អប់រំកាយ' }, { key: 'health_hygiene', label: 'សុខភាព' },
            { key: 'life_skill', label: 'បំណិនជីវិត' }, { key: 'foreign', label: 'ភាសាបរទេស' }
        ]
    }
}

/**
 * Academic years offered in the picker.
 *
 * Built around whichever year the teacher is actually in rather than listed as
 * literals — the previous version hardcoded a single `'2025-2026'` option, which
 * silently became wrong the moment the school year rolled over in November.
 */
function academicYearOptions(current: string): { value: string; label: string }[] {
    const start = Number.parseInt(current.split('-')[0], 10)
    if (Number.isNaN(start)) return [{ value: current, label: current }]

    return [start + 1, start, start - 1, start - 2].map((y) => {
        const value = `${y}-${y + 1}`
        return { value, label: `${toKhmerNumber(y)}-${toKhmerNumber(y + 1)}` }
    })
}

/** Finite numeric value of a score cell, or null for blanks and word ratings. */
function numericValue(r: Score): number | null {
    if (r.score_value === null || r.score_value === undefined || String(r.score_value) === '') return null
    const v = Number.parseFloat(String(r.score_value))
    return Number.isFinite(v) ? v : null
}

export default function SubjectAnalysisClient({
    students,
    defaultAcademicYear,
}: {
    students: Student[]
    defaultAcademicYear: string
}) {
    const [academicYear, setAcademicYear] = useState(defaultAcademicYear || getCurrentAcademicYear())
    // Widened to `string`: `MonthId` is a literal union, and `Select`'s onChange
    // hands back a plain string.
    const [currentPeriod, setCurrentPeriod] = useState<string>(MONTHS_BY_ACADEMIC_YEAR[0].id)
    const [subjectKey, setSubjectKey] = useState(config.monthly.columns[0].key)
    const [studentId, setStudentId] = useState('')
    const [loading, setLoading] = useState(false)
    const [periodScores, setPeriodScores] = useState<Score[]>([])
    const [yearScores, setYearScores] = useState<Score[]>([])

    const nameById = useMemo(
        () => new Map(students.map((s) => [s.id, s.name_kh || s.full_name || ''])),
        [students],
    )

    const loadData = useCallback(async () => {
        setLoading(true)
        // Both requests are issued together: the trend chart and the period
        // tables are independent, so serialising them would double the wait.
        const [period, year] = await Promise.all([
            getAllScoresByPeriod('monthly', `${currentPeriod}-${academicYear}`),
            getMonthlyScoresForYear(academicYear),
        ])
        setPeriodScores(period)
        setYearScores(year)
        setLoading(false)
    }, [academicYear, currentPeriod])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is set after await, not synchronously during the effect
        loadData()
    }, [loadData])

    /** Pass/fail per subject for the selected period. */
    const stats = useMemo<SubjectStat[]>(() => {
        const out: SubjectStat[] = []

        config.monthly.columns.forEach((col) => {
            let passed = 0, failed = 0, total = 0

            periodScores.forEach((r) => {
                if (r.subject !== col.key) return
                const val = numericValue(r)
                if (val === null) return
                total++
                if (val >= PASS_MARK) passed++
                else failed++
            })

            if (total > 0) {
                out.push({
                    key: col.key,
                    subject: col.label,
                    passed,
                    failed,
                    passedPct: ((passed / total) * 100).toFixed(1),
                    failedPct: ((failed / total) * 100).toFixed(1),
                    total,
                })
            }
        })

        return out
    }, [periodScores])

    /** Class average of the selected subject, month by month. */
    const subjectTrend = useMemo(() => {
        const buckets = new Map<string, number[]>()

        yearScores.forEach((r) => {
            if (r.subject !== subjectKey) return
            const val = numericValue(r)
            if (val === null) return
            // `jan-2025-2026` → `jan`. Split on the first hyphen only, since the
            // academic year contains one of its own.
            const monthId = String(r.score_period).split('-')[0]
            const list = buckets.get(monthId)
            if (list) list.push(val)
            else buckets.set(monthId, [val])
        })

        return MONTHS_BY_ACADEMIC_YEAR.map((m) => {
            const values = buckets.get(m.id) ?? []
            return {
                month: m.label,
                average: values.length
                    ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2))
                    : null,
            }
        })
    }, [yearScores, subjectKey])

    /** Every pupil's mark in the selected subject and period, best first. */
    const ranked = useMemo<StudentMark[]>(() => {
        const marks: StudentMark[] = []

        periodScores.forEach((r) => {
            if (r.subject !== subjectKey) return
            const val = numericValue(r)
            if (val === null) return
            marks.push({ id: r.student_id, name: nameById.get(r.student_id) || '—', value: val })
        })

        return marks.sort((a, b) => b.value - a.value)
    }, [periodScores, subjectKey, nameById])

    /** Count / average / max / min for the selected subject this period. */
    const subjectMetrics = useMemo(() => {
        if (ranked.length === 0) return null
        const values = ranked.map((r) => r.value)
        return {
            count: values.length,
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            max: values[0],
            min: values[values.length - 1],
        }
    }, [ranked])

    /** The selected pupil's own month-by-month trend in this subject. */
    const studentTrend = useMemo(() => {
        if (!studentId) return []
        const byMonth = new Map<string, number>()

        yearScores.forEach((r) => {
            if (r.subject !== subjectKey || r.student_id !== studentId) return
            const val = numericValue(r)
            if (val === null) return
            byMonth.set(String(r.score_period).split('-')[0], val)
        })

        return MONTHS_BY_ACADEMIC_YEAR.map((m) => ({
            month: m.label,
            score: byMonth.has(m.id) ? byMonth.get(m.id)! : null,
        }))
    }, [yearScores, subjectKey, studentId])

    const subjectLabel = config.monthly.columns.find((c) => c.key === subjectKey)?.label ?? ''
    const topFive = ranked.slice(0, 5)
    // Taken from the tail and reversed so the weakest pupil is listed first.
    // `slice(-5)` on a list of four would otherwise repeat the whole table.
    const bottomFive = ranked.length > 5 ? ranked.slice(-5).reverse() : [...ranked].reverse()

    return (
        <div className="min-h-screen bg-paper print:bg-bg-surface pb-10">
            <div className="max-w-7xl mx-auto py-8 px-4">
                <Link href="/dashboard" className="inline-flex items-center gap-2 text-brand font-bold mb-6 hover:bg-brand-100 p-2 rounded-xl transition">
                    <ArrowLeft className="w-5 h-5" /> ត្រឡប់ទៅទំព័រដើម
                </Link>

                <div className="bg-bg-surface p-6 rounded-xl shadow-sm border border-divider mb-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-brand-100 text-brand rounded-xl">
                                <PieChart className="w-6 h-6" />
                            </div>
                            <div>
                                <h1 className="text-2xl kh-moul text-text-heading">វិភាគតាមមុខវិជ្ជា</h1>
                                <p className="text-text-muted font-bold">ប្រៀបធៀបភាគរយសិស្សជាប់ និងធ្លាក់តាមមុខវិជ្ជា</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <Select
                            label="ឆ្នាំសិក្សា"
                            value={academicYear}
                            onChange={setAcademicYear}
                            options={academicYearOptions(academicYear)}
                        />
                        <Select
                            label="ខែ"
                            value={currentPeriod}
                            onChange={setCurrentPeriod}
                            options={MONTHS_BY_ACADEMIC_YEAR.map(m => ({ value: m.id, label: m.label }))}
                        />
                        <Select
                            label="មុខវិជ្ជា"
                            value={subjectKey}
                            onChange={setSubjectKey}
                            options={config.monthly.columns.map(c => ({ value: c.key, label: c.label }))}
                        />
                        <SearchableSelect
                            label="សិស្ស (ស្រេចចិត្ត)"
                            value={studentId}
                            onChange={setStudentId}
                            clearable
                            clearLabel="មិនជ្រើសរើស"
                            placeholder="ជ្រើសរើសសិស្ស"
                            options={students.map(s => ({ value: s.id, label: s.name_kh || s.full_name || '—' }))}
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center p-10"><div className="animate-spin w-10 h-10 border-4 border-brand border-t-transparent rounded-full"></div></div>
                ) : (
                    <div className="grid grid-cols-1 gap-6">
                        {/* Metrics for the selected subject */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-bg-surface border border-divider p-4 rounded-xl">
                                <p className="text-xs text-text-muted font-bold mb-1">សិស្សមានពិន្ទុ</p>
                                <h3 className="text-xl font-bold text-text-heading">
                                    {subjectMetrics ? `${toKhmerNumber(subjectMetrics.count)} នាក់` : '—'}
                                </h3>
                            </div>
                            <div className="bg-bg-surface border border-divider p-4 rounded-xl">
                                <p className="text-xs text-text-muted font-bold mb-1">មធ្យមភាគ</p>
                                <h3 className="text-xl font-bold text-brand">
                                    {subjectMetrics ? subjectMetrics.avg.toFixed(2) : '—'}
                                </h3>
                            </div>
                            <div className="bg-bg-surface border border-divider p-4 rounded-xl">
                                <p className="text-xs text-text-muted font-bold mb-1">ពិន្ទុខ្ពស់បំផុត</p>
                                <h3 className="text-xl font-bold text-success">
                                    {subjectMetrics ? subjectMetrics.max.toFixed(2) : '—'}
                                </h3>
                            </div>
                            <div className="bg-bg-surface border border-divider p-4 rounded-xl">
                                <p className="text-xs text-text-muted font-bold mb-1">ពិន្ទុទាបបំផុត</p>
                                <h3 className="text-xl font-bold text-danger">
                                    {subjectMetrics ? subjectMetrics.min.toFixed(2) : '—'}
                                </h3>
                            </div>
                        </div>

                        {/* Class trend for the selected subject */}
                        <div className="bg-bg-surface p-6 rounded-xl shadow-sm border border-divider">
                            <h2 className="font-bold text-lg text-text-body mb-4 flex items-center gap-2">
                                <TrendingUp className="w-5 h-5" /> និន្នាការមធ្យមភាគប្រចាំខែ · {subjectLabel}
                            </h2>
                            <div className="w-full h-[320px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={subjectTrend} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="month" angle={-45} textAnchor="end" interval={0} tick={{ fontSize: 10 }} height={60} />
                                        <YAxis domain={[0, 10]} />
                                        <RechartsTooltip />
                                        <Legend />
                                        {/*
                                          `connectNulls` joins across months with no marks yet, so a
                                          part-filled year reads as one line rather than as fragments.
                                        */}
                                        <Line type="monotone" dataKey="average" name="មធ្យមភាគថ្នាក់" stroke="#0054a6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                                        {studentId && (
                                            <Line
                                                type="monotone"
                                                dataKey="score"
                                                name={nameById.get(studentId) || 'សិស្ស'}
                                                data={studentTrend}
                                                stroke="#D9485F"
                                                strokeWidth={2}
                                                dot={{ r: 3 }}
                                                connectNulls
                                            />
                                        )}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Top and bottom performers */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-bg-surface p-6 rounded-xl shadow-sm border border-divider">
                                <h2 className="font-bold text-lg text-text-body mb-4 flex items-center gap-2">
                                    <Trophy className="w-5 h-5 text-gold" /> សិស្សពូកែ ៥ នាក់ · {subjectLabel}
                                </h2>
                                <RankTable rows={topFive} emptyLabel="មិនមានទិន្នន័យ" tone="success" />
                            </div>
                            <div className="bg-bg-surface p-6 rounded-xl shadow-sm border border-divider">
                                <h2 className="font-bold text-lg text-text-body mb-4 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-warning" /> សិស្សត្រូវជួយ ៥ នាក់ · {subjectLabel}
                                </h2>
                                <RankTable rows={bottomFive} emptyLabel="មិនមានទិន្នន័យ" tone="danger" />
                            </div>
                        </div>

                        <div className="bg-bg-surface p-6 rounded-xl shadow-sm border border-divider">
                            <h2 className="font-bold text-lg text-text-body mb-4 flex items-center gap-2"><BarChart2 className="w-5 h-5" /> ក្រាហ្វិកសិស្សជាប់តាមមុខវិជ្ជា (%)</h2>
                            <div className="w-full h-[400px]">
                                {stats.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={stats} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="subject" angle={-45} textAnchor="end" interval={0} tick={{fontSize: 10}} height={80}/>
                                            <YAxis />
                                            <RechartsTooltip />
                                            <Legend />
                                            <Bar dataKey="passedPct" name="ភាគរយជាប់ (%)" fill="#16A36A" />
                                            <Bar dataKey="failedPct" name="ភាគរយធ្លាក់ (%)" fill="#D9485F" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="flex items-center justify-center h-full text-text-muted">មិនមានទិន្នន័យ</div>
                                )}
                            </div>
                        </div>

                        <div className="bg-bg-surface p-6 rounded-xl shadow-sm border border-divider">
                            <h2 className="font-bold text-lg text-text-body mb-4 flex items-center gap-2"><PieChart className="w-5 h-5" /> តារាងលម្អិត</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-paper text-text-body font-bold border-b border-divider">
                                        <tr>
                                            <th className="p-3">មុខវិជ្ជា</th>
                                            <th className="p-3 text-center">សិស្សមានពិន្ទុ (នាក់)</th>
                                            <th className="p-3 text-center text-success">សិស្សជាប់ (នាក់)</th>
                                            <th className="p-3 text-center text-success">ភាគរយជាប់ (%)</th>
                                            <th className="p-3 text-center text-danger">សិស្សធ្លាក់ (នាក់)</th>
                                            <th className="p-3 text-center text-danger">ភាគរយធ្លាក់ (%)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.map((s) => (
                                            <tr
                                                key={s.key}
                                                className={`border-b border-divider hover:bg-paper ${s.key === subjectKey ? 'bg-brand-100/40' : ''}`}
                                            >
                                                <td className="p-3 font-bold text-text-heading">{s.subject}</td>
                                                <td className="p-3 text-center">{s.total}</td>
                                                <td className="p-3 text-center text-success font-bold">{s.passed}</td>
                                                <td className="p-3 text-center text-success font-bold">{s.passedPct}%</td>
                                                <td className="p-3 text-center text-danger font-bold">{s.failed}</td>
                                                <td className="p-3 text-center text-danger font-bold">{s.failedPct}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

/** Shared body for the top and bottom performer tables. */
function RankTable({
    rows,
    emptyLabel,
    tone,
}: {
    rows: StudentMark[]
    emptyLabel: string
    tone: 'success' | 'danger'
}) {
    if (rows.length === 0) {
        return <p className="py-8 text-center text-sm italic text-text-muted">{emptyLabel}</p>
    }

    return (
        <table className="w-full text-sm text-left">
            <thead className="bg-paper text-text-body font-bold border-b border-divider">
                <tr>
                    <th className="p-3 w-12">ល.រ</th>
                    <th className="p-3">គោត្តនាម និងនាម</th>
                    <th className="p-3 text-right">ពិន្ទុ</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((r, i) => (
                    <tr key={r.id} className="border-b border-divider last:border-0 hover:bg-paper">
                        <td className="p-3 text-text-muted">{toKhmerNumber(i + 1)}</td>
                        <td className="p-3 font-bold text-text-heading flex items-center gap-2">
                            <User className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" /> {r.name}
                        </td>
                        <td className={`p-3 text-right font-bold ${tone === 'success' ? 'text-success' : 'text-danger'}`}>
                            {r.value.toFixed(2)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}
