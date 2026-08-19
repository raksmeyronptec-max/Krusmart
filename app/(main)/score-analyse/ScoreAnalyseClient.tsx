'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/actions/Button'
import type { AttendanceRecord, Score, Settings, Student } from '@/lib/types'
import { CognitivePanel, type StudentSummary } from './CognitivePanel'
import { useActiveClass } from '@/lib/hooks/useActiveClass'
import { 
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts'
import { ArrowLeft, Users, Award, CheckSquare, AlertTriangle, TrendingUp, Filter, RefreshCw, HeartPulse, BookOpen, HelpingHand } from 'lucide-react'
import Link from 'next/link'
import Select from '@/components/ui/forms/Select'
import { MONTHS_BY_ACADEMIC_YEAR } from '@/lib/constants/months'
import { letterFor } from '@/lib/grading/scheme'
import { useScoreTemplate } from '@/lib/hooks/useScoreTemplate'
import { maxScoreByColumn } from '@/lib/scores/template'
import { studentAverage } from '@/lib/scores/aggregate'

/** Per-student roll-up built by the analytics pass below. */
interface StudentAnalytics {
    student: Student
    /** Present / late / absent day counts. */
    p: number
    l: number
    a: number
    attRate: number
    overallAvg: number | null
    sScores: Record<string, number>
    isRisk: boolean
    holistic: {
        scorePoints: number
        attendancePoints: number
        homeworkPoints: number
        healthPoints: number
        disciplinePoints: number
    }
}

export default function ScoreAnalyseClient({ initialStudents, attendanceData, scoresData, academicYear, settings }: {
    initialStudents: Student[], attendanceData: AttendanceRecord[], scoresData: Score[], academicYear: string,
    settings: Settings | null
}) {
    const [selectedYear, setSelectedYear] = useState(academicYear)
    const { classId } = useActiveClass()

    // One grading resolution for the whole analysis; the per-student loop is pure.
    const { subjects: templateSubjects, scheme } = useScoreTemplate('monthly')
    const maxByColumn = useMemo(() => maxScoreByColumn(templateSubjects), [templateSubjects])


    // Calculate Global Data
    const analytics = useMemo(() => {
        let globalTotalP = 0, globalTotalL = 0, globalTotalA = 0
        const gradesCount = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 }
        const studentData: Record<string, StudentAnalytics> = {}
        let sumAllAvg = 0, validStudents = 0
        
        const monthlyAvgs: Record<string, {sum: number, count: number}> = {}
        MONTHS_BY_ACADEMIC_YEAR.forEach(m => monthlyAvgs[m.num] = {sum: 0, count: 0})

        let riskCount = 0
        let healthyCount = 0
        let slowCount = 0
        let diffCount = 0

        initialStudents.forEach(student => {
            const uid = student.id
            let p = 0, l = 0, a = 0
            
            attendanceData.forEach(att => {
                if (att.student_id === uid) {
                    if (att.status === 'P') p++
                    else if (att.status === 'L') l++
                    else if (att.status === 'A' || att.status === 'AP') a++
                }
            })
            
            globalTotalP += p; globalTotalL += l; globalTotalA += a;
            const totalDays = p + l + a
            const attRate = totalDays > 0 ? (p / totalDays) * 100 : 0

            // Scores
            let monthAvgSum = 0, monthCount = 0
            const sScores: Record<string, number> = {}

            MONTHS_BY_ACADEMIC_YEAR.forEach(m => {
                const targetPeriod = `${m.num}-${selectedYear}`
                const monthlyScores = scoresData.filter(d => 
                    d.student_id === uid && 
                    d.score_type === 'monthly' && 
                    d.score_period === targetPeriod &&
                    d.score_value !== null
                )

                if (monthlyScores.length > 0) {
                    // Row-driven, as this analysis has always been, but each
                    // row weighted by its subject's full mark so a secondary
                    // class is analysed on /50 rather than read as /10.
                    const marks: Record<string, number> = {}
                    monthlyScores.forEach(score => { marks[score.subject] = score.score_value! })
                    const { average } = studentAverage(marks, Object.keys(marks), maxByColumn, scheme)
                    if (average !== null) {
                        monthAvgSum += average; monthCount++
                        monthlyAvgs[m.num].sum += average
                        monthlyAvgs[m.num].count++
                        sScores[m.num] = average
                    }
                }
            })

            const overallAvg = monthCount > 0 ? monthAvgSum / monthCount : null
            if (overallAvg !== null) {
                sumAllAvg += overallAvg; validStudents++
                // Bucket via the shared engine so the histogram cannot drift
                // from the letter shown on reports and certificates.
                const letter = letterFor(overallAvg, scheme)
                if (letter in gradesCount) gradesCount[letter as keyof typeof gradesCount]++
            }

            // Simple risk metrics
            const isRisk = (overallAvg !== null && overallAvg < scheme.passMark) || a >= 3 || (totalDays > 0 && attRate < 80)
            if (isRisk) riskCount++

            // Assign slow/diff randomly for visual demo based on score
            if (overallAvg !== null) {
                // 7.5 and 5.5 of ten — kept as the same fractions of whatever
                // scale the class is on, so the three buckets keep their
                // meaning at /50.
                if (overallAvg > scheme.maxScore * 0.75) healthyCount++
                else if (overallAvg > scheme.maxScore * 0.55) slowCount++
                else diffCount++
            }

            const hwPoints = 85
            const healthPoints = 90
            const disciplinePoints = Math.max(40, 100 - (a * 5) - (l * 2))

            studentData[uid] = {
                student,
                p, l, a, attRate,
                overallAvg,
                sScores,
                isRisk,
                holistic: {
                    scorePoints: overallAvg ? (overallAvg / scheme.maxScore) * 100 : 0,
                    attendancePoints: attRate,
                    homeworkPoints: hwPoints,
                    healthPoints: healthPoints,
                    disciplinePoints: disciplinePoints
                }
            }
        })

        const classOverallAvg = validStudents > 0 ? (sumAllAvg / validStudents).toFixed(2) : "0.00"
        const totalAtt = globalTotalP + globalTotalL + globalTotalA
        const avgAttRate = totalAtt > 0 ? ((globalTotalP / totalAtt) * 100).toFixed(1) : 0

        const monthlyTrendData = MONTHS_BY_ACADEMIC_YEAR.map(m => {
            return {
                name: m.label.substring(0, 3),
                avg: monthlyAvgs[m.num].count > 0 ? parseFloat((monthlyAvgs[m.num].sum / monthlyAvgs[m.num].count).toFixed(2)) : 0
            }
        })

        const attendancePieData = [
            { name: 'មក (P)', value: globalTotalP, fill: '#16A36A' },
            { name: 'ច្បាប់ (L)', value: globalTotalL, fill: '#D99614' },
            { name: 'អវត្តមាន (A)', value: globalTotalA, fill: '#D9485F' }
        ]

        const gradeData = [
            { name: 'A', value: gradesCount.A, fill: '#16A36A' },
            { name: 'B', value: gradesCount.B, fill: '#18A5CC' },
            { name: 'C', value: gradesCount.C, fill: '#D99614' },
            { name: 'D', value: gradesCount.D, fill: '#C4762A' },
            { name: 'E', value: gradesCount.E, fill: '#D9485F' },
            { name: 'F', value: gradesCount.F, fill: '#A32A38' }
        ]

        return {
            classOverallAvg,
            avgAttRate,
            riskCount,
            studentData,
            monthlyTrendData,
            attendancePieData,
            gradeData,
            healthyCount,
            slowCount,
            diffCount
        }
    }, [initialStudents, attendanceData, scoresData, selectedYear, scheme, maxByColumn])

    /**
     * The slice of `studentData` the cognitive detail sheet prints.
     *
     * Narrowed here rather than handing the panel the whole analytics object, so
     * it depends only on the five figures it actually renders.
     */
    const cognitiveSummaries = useMemo<Record<string, StudentSummary>>(
        () => Object.fromEntries(
            Object.entries(analytics.studentData).map(([id, d]) => [
                id,
                { attRate: d.attRate, overallAvg: d.overallAvg, p: d.p, l: d.l, a: d.a },
            ]),
        ),
        [analytics.studentData],
    )

    return (
        <div className="min-h-screen bg-paper text-text-heading pb-10">
            {/*
              Printing this page means printing one pupil's detail sheet, not the
              class dashboard behind it. Everything marked `data-analysis-chrome`
              drops out; the sheet inside CognitivePanel is `hidden print:block`
              and is all that remains.
            */}
            <style jsx global>{`
                @media print {
                    @page { size: A4 portrait; margin: 12mm; }
                    body { background: white !important; }
                    [data-analysis-chrome] { display: none !important; }
                }
            `}</style>

            <nav data-analysis-chrome className="bg-brand text-white p-4 shadow-lg sticky top-0 z-50">
                <div className="max-w-7xl mx-auto flex flex-wrap justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard" className="flex items-center gap-2 hover:text-warning transition font-bold text-sm bg-bg-surface/10 px-3 py-1.5 rounded-lg border border-white/20">
                            <ArrowLeft className="w-4 h-4" /> ទំព័រដើម
                        </Link>
                        <h1 className="kh-moul text-lg hidden sm:block">ប្រព័ន្ធវិភាគទិន្នន័យសិស្សកម្រិតខ្ពស់ (Holistic)</h1>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="bg-bg-surface/10 rounded-lg px-3 py-1.5 border border-white/20 flex items-center gap-2">
                            <Select
                                variant="ghost"
                                ariaLabel="ឆ្នាំសិក្សា"
                                value={selectedYear}
                                onChange={setSelectedYear}
                                options={[
                                    { value: '2023-2024', label: 'ឆ្នាំ ២០២៣-២០២៤' },
                                    { value: '2024-2025', label: 'ឆ្នាំ ២០២៤-២០២៥' },
                                    { value: '2025-2026', label: 'ឆ្នាំ ២០២៥-២០២៦' },
                                ]}
                                leadingIcon={<Filter />}
                                className="text-sm text-white [&>option]:text-text-heading"
                            />
                        </div>
                        <Button variant="warning" printHidden={false} title="Refresh Data">
                            <RefreshCw className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-4 mt-6 space-y-6">
                
                {/* Summary Cards */}
                <div data-analysis-chrome className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-bg-surface p-4 rounded-xl shadow-sm border border-divider border-l-4 border-l-blue-500 flex items-center gap-4">
                        <div className="p-3 bg-brand-100 text-brand rounded-full"><Users className="w-6 h-6" /></div>
                        <div>
                            <p className="text-xs text-text-muted font-bold uppercase">សិស្សសរុប</p>
                            <p className="text-2xl font-bold text-brand leading-tight">{initialStudents.length}</p>
                            <p className="text-[10px] text-text-muted font-medium mt-0.5">ស្រី៖ {initialStudents.filter(s=>s.gender==='ស្រី'||s.gender==='F').length} នាក់</p>
                        </div>
                    </div>
                    <div className="bg-bg-surface p-4 rounded-xl shadow-sm border border-divider border-l-4 border-l-indigo-500 flex items-center gap-4">
                        <div className="p-3 bg-brand-100 text-brand rounded-full"><Award className="w-6 h-6" /></div>
                        <div>
                            <p className="text-xs text-text-muted font-bold uppercase">មធ្យមភាគថ្នាក់សរុប</p>
                            <p className="text-2xl font-bold text-brand leading-tight">{analytics.classOverallAvg}</p>
                            <p className="text-[10px] text-text-muted font-medium mt-0.5">មធ្យមភាគសរុបគ្រប់ខែ</p>
                        </div>
                    </div>
                    <div className="bg-bg-surface p-4 rounded-xl shadow-sm border border-divider border-l-4 border-l-green-500 flex items-center gap-4">
                        <div className="p-3 bg-success/10 text-success rounded-full"><CheckSquare className="w-6 h-6" /></div>
                        <div>
                            <p className="text-xs text-text-muted font-bold uppercase">អត្រាវត្តមានសរុប</p>
                            <p className="text-2xl font-bold text-success leading-tight">{analytics.avgAttRate}%</p>
                            <p className="text-[10px] text-text-muted font-medium mt-0.5">វត្តមានគិតជាភាគរយ</p>
                        </div>
                    </div>
                    <div className="bg-bg-surface p-4 rounded-xl shadow-sm border border-divider border-l-4 border-l-red-500 flex items-center gap-4">
                        <div className="p-3 bg-danger/10 text-danger rounded-full"><AlertTriangle className="w-6 h-6" /></div>
                        <div>
                            <p className="text-xs text-text-muted font-bold uppercase">សិស្សប្រឈមហានិភ័យ</p>
                            <p className="text-2xl font-bold text-danger leading-tight">{analytics.riskCount}</p>
                            <p className="text-[10px] text-text-muted font-medium mt-0.5">ពិន្ទុខ្សោយ ឬអវត្តមានច្រើន</p>
                        </div>
                    </div>
                </div>

                {/* Holistic Cards */}
                <div data-analysis-chrome className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                    <div className="bg-brand-100 p-4 rounded-xl border border-divider flex items-center justify-between shadow-sm">
                        <div>
                            <p className="text-xs text-brand-500 font-bold uppercase mb-1">សុខភាព (ធម្មតា)</p>
                            <p className="text-2xl font-bold text-brand-800">{analytics.healthyCount} នាក់</p>
                        </div>
                        <div className="p-3 bg-brand-100 text-brand-500 rounded-full"><HeartPulse className="w-6 h-6" /></div>
                    </div>
                    <div className="bg-warning/10 p-4 rounded-xl border border-warning/30 flex items-center justify-between shadow-sm">
                        <div>
                            <p className="text-xs text-warning font-bold uppercase mb-1">សិស្សរៀនយឺត (កំពុងជួយ)</p>
                            <p className="text-2xl font-bold text-warning">{analytics.slowCount} នាក់</p>
                        </div>
                        <div className="p-3 bg-warning/10 text-warning rounded-full"><BookOpen className="w-6 h-6" /></div>
                    </div>
                    <div className="bg-danger/10 p-4 rounded-xl border border-danger/30 flex items-center justify-between shadow-sm">
                        <div>
                            <p className="text-xs text-danger font-bold uppercase mb-1">ជួបការលំបាក (ខ្វះខាត)</p>
                            <p className="text-2xl font-bold text-danger">{analytics.diffCount} នាក់</p>
                        </div>
                        <div className="p-3 bg-danger/10 text-danger rounded-full"><HelpingHand className="w-6 h-6" /></div>
                    </div>
                </div>

                {/* Charts */}
                <div data-analysis-chrome className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="bg-bg-surface p-5 lg:col-span-2 border-t-4 border-brand rounded-xl shadow-sm">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h2 className="font-bold text-brand flex items-center gap-2">
                                <TrendingUp className="w-5 h-5" />
                                និន្នាការពិន្ទុមធ្យមប្រចាំខែ
                            </h2>
                        </div>
                        <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={analytics.monthlyTrendData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                    <YAxis domain={[0, 10]} axisLine={false} tickLine={false} />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="avg" stroke="var(--brand)" strokeWidth={3} dot={{r: 4, fill: 'var(--brand)'}} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-bg-surface p-5 border-t-4 border-success rounded-xl shadow-sm">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h2 className="font-bold text-success flex items-center gap-2">
                                <Award className="w-5 h-5" />
                                បំណែងចែកនិទ្ទេសសរុប
                            </h2>
                        </div>
                        <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={analytics.gradeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                                        {analytics.gradeData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                <div data-analysis-chrome className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="bg-bg-surface p-5 lg:col-span-2 border-t-4 border-brand rounded-xl shadow-sm">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h2 className="font-bold text-brand flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-danger" />
                                សិស្សប្រឈមហានិភ័យសរុប (ពិន្ទុទាប ឬ អវត្តមានច្រើន)
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-danger/10 text-danger text-xs uppercase">
                                    <tr>
                                        <th className="px-4 py-3 rounded-tl-lg">ឈ្មោះសិស្ស</th>
                                        <th className="px-4 py-3 text-center">មធ្យមភាគសរុប</th>
                                        <th className="px-4 py-3 text-center">អវត្តមាន</th>
                                        <th className="px-4 py-3 text-center">អត្រា</th>
                                        <th className="px-4 py-3 rounded-tr-lg">ស្ថានភាពហានិភ័យ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-divider">
                                    {Object.values(analytics.studentData)
                                        .filter(d => d.isRisk)
                                        .slice(0, 5)
                                        .map((d, i) => (
                                        <tr key={i} className="hover:bg-danger/5 transition">
                                            <td className="px-4 py-3 font-bold text-text-heading">{d.student.name_kh || d.student.full_name}</td>
                                            <td className="px-4 py-3 text-center text-danger font-bold">{d.overallAvg !== null ? d.overallAvg.toFixed(2) : '-'}</td>
                                            <td className="px-4 py-3 text-center text-danger font-bold">{d.a}</td>
                                            <td className="px-4 py-3 text-center text-text-body">{d.attRate.toFixed(1)}%</td>
                                            <td className="px-4 py-3">
                                                <span className="bg-danger/10 text-danger text-[10px] px-2 py-1 rounded-full font-bold">ប្រឈមខ្ពស់</span>
                                            </td>
                                        </tr>
                                    ))}
                                    {Object.values(analytics.studentData).filter(d => d.isRisk).length === 0 && (
                                        <tr><td colSpan={5} className="px-4 py-8 text-center text-text-muted italic">មិនមានសិស្សប្រឈមហានិភ័យទេ 👏</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-bg-surface p-5 border-t-4 border-warning rounded-xl shadow-sm">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h2 className="font-bold text-warning flex items-center gap-2">
                                <CheckSquare className="w-5 h-5" />
                                សូចនាករវត្តមានរួម
                            </h2>
                        </div>
                        <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={analytics.attendancePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100}>
                                        {analytics.attendancePieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                <div className="mt-6">
                    <CognitivePanel
                        students={initialStudents}
                        summaries={cognitiveSummaries}
                        settings={settings}
                        academicYear={selectedYear}
                        classId={classId}
                    />
                </div>

            </div>
        </div>
    )
}
