'use client'

import { useState, useCallback, useEffect } from 'react'
import { ArrowLeft, PieChart, BarChart2 } from 'lucide-react'
import Link from 'next/link'
import { getAllScoresByPeriod } from '../../score/total/actions'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts'
import Select from '@/components/ui/forms/Select'
import { MONTHS_BY_CALENDAR } from '@/lib/constants/months'

/** Pass/fail tally for one subject, as charted on this page. */
interface SubjectStat {
    subject: string
    passed: number
    failed: number
    passedPct: string
    failedPct: string
    total: number
}

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

export default function SubjectAnalysisClient() {
    const [academicYear, setAcademicYear] = useState('2025-2026')
    const [currentPeriod, setCurrentPeriod] = useState('jan')
    const [loading, setLoading] = useState(false)
    const [stats, setStats] = useState<SubjectStat[]>([])



    const loadData = useCallback(async () => {
        setLoading(true)
        const fetchPeriod = `${currentPeriod}-${academicYear}`
        const records = await getAllScoresByPeriod('monthly', fetchPeriod)

        const processedStats: SubjectStat[] = []
        
        config.monthly.columns.forEach(col => {
            let passed = 0
            let failed = 0
            let total = 0
            records.forEach(r => {
                if (r.subject === col.key && r.score_value !== null && r.score_value !== undefined && String(r.score_value) !== "") {
                    const val = parseFloat(String(r.score_value))
                    if (!isNaN(val)) {
                        total++
                        if (val >= 5.0) passed++
                        else failed++
                    }
                }
            })
            if (total > 0) {
                processedStats.push({
                    subject: col.label,
                    passed,
                    failed,
                    passedPct: ((passed/total)*100).toFixed(1),
                    failedPct: ((failed/total)*100).toFixed(1),
                    total
                })
            }
        })
        
        setStats(processedStats)
        setLoading(false)
    }, [academicYear, currentPeriod])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is set after await, not synchronously during the effect
        loadData()
    }, [academicYear, currentPeriod, loadData])

    return (
        <div className="min-h-screen bg-paper font-battambang print:bg-bg-surface pb-10">
            <div className="max-w-7xl mx-auto py-8 px-4">
                <Link href="/dashboard" className="inline-flex items-center gap-2 text-brand font-bold mb-6 hover:bg-brand-100 p-2 rounded-xl transition">
                    <ArrowLeft className="w-5 h-5" /> ត្រឡប់ទៅទំព័រដើម
                </Link>

                <div className="bg-bg-surface p-6 rounded-xl shadow-sm border border-divider mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-brand-100 text-brand rounded-xl">
                            <PieChart className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl kh-moul text-text-heading">វិភាគតាមមុខវិជ្ជា</h1>
                            <p className="text-text-muted font-bold">ប្រៀបធៀបភាគរយសិស្សជាប់ និងធ្លាក់តាមមុខវិជ្ជា</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Select
                            ariaLabel="ឆ្នាំសិក្សា"
                            value={academicYear}
                            onChange={setAcademicYear}
                            options={[{ value: '2025-2026', label: '២០២៥-២០២៦' }]}
                        />
                        <Select
                            ariaLabel="ខែ"
                            value={currentPeriod}
                            onChange={setCurrentPeriod}
                            options={MONTHS_BY_CALENDAR.map(m => ({ value: m.id, label: m.label }))}
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center p-10"><div className="animate-spin w-10 h-10 border-4 border-brand border-t-transparent rounded-full"></div></div>
                ) : (
                    <div className="grid grid-cols-1 gap-6">
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
                                    <thead className="bg-paper text-text-body font-bold border-b">
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
                                        {stats.map((s, i) => (
                                            <tr key={i} className="border-b hover:bg-paper">
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
