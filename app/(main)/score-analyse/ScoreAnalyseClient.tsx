'use client'

import { useState, useMemo } from 'react'
import { 
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, PieChart, Pie, Cell, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts'
import { ArrowLeft, Users, Award, CheckSquare, AlertTriangle, TrendingUp, Filter, RefreshCw, HeartPulse, BookOpen, HelpingHand } from 'lucide-react'
import Link from 'next/link'

export default function ScoreAnalyseClient({ initialStudents, attendanceData, scoresData, academicYear }: { 
    initialStudents: any[], attendanceData: any[], scoresData: any[], academicYear: string 
}) {
    const [selectedYear, setSelectedYear] = useState(academicYear)
    const [selectedMonth, setSelectedMonth] = useState('01') // Default Jan

    const months = [
        { val: '11', label: 'វិច្ឆិកា' }, { val: '12', label: 'ធ្នូ' },
        { val: '01', label: 'មករា' }, { val: '02', label: 'កុម្ភៈ' },
        { val: '03', label: 'មីនា' }, { val: '04', label: 'មេសា' },
        { val: '05', label: 'ឧសភា' }, { val: '06', label: 'មិថុនា' },
        { val: '07', label: 'កក្កដា' }, { val: '08', label: 'សីហា' },
        { val: '09', label: 'កញ្ញា' }, { val: '10', label: 'តុលា' }
    ]

    // Calculate Global Data
    const analytics = useMemo(() => {
        let globalTotalP = 0, globalTotalL = 0, globalTotalA = 0
        let gradesCount = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 }
        let studentData: Record<string, any> = {}
        let sumAllAvg = 0, validStudents = 0
        
        let monthlyAvgs: Record<string, {sum: number, count: number}> = {}
        months.forEach(m => monthlyAvgs[m.val] = {sum: 0, count: 0})

        let riskCount = 0
        let healthyCount = 0
        let slowCount = 0
        let diffCount = 0

        initialStudents.forEach(student => {
            const uid = student.id
            let p = 0, l = 0, a = 0
            
            attendanceData.forEach(att => {
                const data = typeof att.data === 'string' ? JSON.parse(att.data) : att.data
                if (data && data[uid]) {
                    if (data[uid] === 'P') p++
                    else if (data[uid] === 'L') l++
                    else if (data[uid] === 'A') a++
                }
            })
            
            globalTotalP += p; globalTotalL += l; globalTotalA += a;
            const totalDays = p + l + a
            const attRate = totalDays > 0 ? (p / totalDays) * 100 : 0

            // Scores
            let monthAvgSum = 0, monthCount = 0
            let sScores: Record<string, number> = {}

            months.forEach(m => {
                const mData = scoresData.find(d => d.month === m.val && d.year === selectedYear)
                if (mData) {
                    const data = typeof mData.data === 'string' ? JSON.parse(mData.data) : mData.data
                    if (data && data[uid]) {
                        // calculate average for this month for this student
                        let stSum = 0, stCount = 0
                        Object.keys(data[uid]).forEach(k => {
                            if (k !== 'average' && k !== 'rank' && k !== 'total') {
                                const val = parseFloat(data[uid][k])
                                if (!isNaN(val)) { stSum += val; stCount++ }
                            }
                        })
                        
                        let mAvg = data[uid].average ? parseFloat(data[uid].average) : (stCount > 0 ? stSum / stCount : null)
                        if (mAvg !== null && !isNaN(mAvg)) {
                            monthAvgSum += mAvg; monthCount++
                            monthlyAvgs[m.val].sum += mAvg
                            monthlyAvgs[m.val].count++
                            sScores[m.val] = mAvg
                        }
                    }
                }
            })

            const overallAvg = monthCount > 0 ? monthAvgSum / monthCount : null
            if (overallAvg !== null) {
                sumAllAvg += overallAvg; validStudents++
                if (overallAvg >= 9) gradesCount.A++
                else if (overallAvg >= 8) gradesCount.B++
                else if (overallAvg >= 7) gradesCount.C++
                else if (overallAvg >= 6) gradesCount.D++
                else if (overallAvg >= 5) gradesCount.E++
                else gradesCount.F++
            }

            // Simple risk metrics
            let isRisk = (overallAvg !== null && overallAvg < 5.0) || a >= 3 || (totalDays > 0 && attRate < 80)
            if (isRisk) riskCount++

            // Assign slow/diff randomly for visual demo based on score
            if (overallAvg !== null) {
                if (overallAvg > 7.5) healthyCount++
                else if (overallAvg > 5.5) slowCount++
                else diffCount++
            }

            let hwPoints = 85
            let healthPoints = 90
            let disciplinePoints = Math.max(40, 100 - (a * 5) - (l * 2))

            studentData[uid] = {
                student,
                p, l, a, attRate,
                overallAvg,
                sScores,
                isRisk,
                holistic: {
                    scorePoints: overallAvg ? (overallAvg / 10) * 100 : 0,
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

        let monthlyTrendData = months.map(m => {
            return {
                name: m.label.substring(0, 3),
                avg: monthlyAvgs[m.val].count > 0 ? parseFloat((monthlyAvgs[m.val].sum / monthlyAvgs[m.val].count).toFixed(2)) : 0
            }
        })

        const attendancePieData = [
            { name: 'មក (P)', value: globalTotalP, fill: '#22c55e' },
            { name: 'ច្បាប់ (L)', value: globalTotalL, fill: '#eab308' },
            { name: 'អវត្តមាន (A)', value: globalTotalA, fill: '#ef4444' }
        ]

        const gradeData = [
            { name: 'A', value: gradesCount.A, fill: '#22c55e' },
            { name: 'B', value: gradesCount.B, fill: '#3b82f6' },
            { name: 'C', value: gradesCount.C, fill: '#eab308' },
            { name: 'D', value: gradesCount.D, fill: '#f97316' },
            { name: 'E', value: gradesCount.E, fill: '#ef4444' },
            { name: 'F', value: gradesCount.F, fill: '#b91c1c' }
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
    }, [initialStudents, attendanceData, scoresData, selectedYear])

    return (
        <div className="min-h-screen bg-[#f0f4f8] text-slate-800 font-battambang pb-10">
            <nav className="bg-[#0054a6] text-white p-4 shadow-lg sticky top-0 z-50">
                <div className="max-w-7xl mx-auto flex flex-wrap justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard" className="flex items-center gap-2 hover:text-yellow-400 transition font-bold text-sm bg-white/10 px-3 py-1.5 rounded-lg border border-white/20">
                            <ArrowLeft className="w-4 h-4" /> ទំព័រដើម
                        </Link>
                        <h1 className="font-moul text-lg hidden sm:block">ប្រព័ន្ធវិភាគទិន្នន័យសិស្សកម្រិតខ្ពស់ (Holistic)</h1>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="bg-white/10 rounded-lg px-3 py-1.5 border border-white/20 flex items-center gap-2">
                            <Filter className="w-4 h-4 text-indigo-100" />
                            <select 
                                value={selectedYear} 
                                onChange={(e) => setSelectedYear(e.target.value)}
                                className="bg-transparent text-sm font-bold outline-none text-white cursor-pointer"
                            >
                                <option value="2023-2024" className="text-gray-800">ឆ្នាំ ២០២៣-២០២៤</option>
                                <option value="2024-2025" className="text-gray-800">ឆ្នាំ ២០២៤-២០២៥</option>
                                <option value="2025-2026" className="text-gray-800">ឆ្នាំ ២០២៥-២០២៦</option>
                            </select>
                        </div>
                        <button className="bg-yellow-500 hover:bg-yellow-600 text-white p-2 rounded-lg transition" title="Refresh Data">
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-4 mt-6 space-y-6">
                
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-blue-500 flex items-center gap-4">
                        <div className="p-3 bg-blue-100 text-blue-600 rounded-full"><Users className="w-6 h-6" /></div>
                        <div>
                            <p className="text-xs text-gray-500 font-bold uppercase">សិស្សសរុប</p>
                            <p className="text-2xl font-bold text-blue-700 leading-tight">{initialStudents.length}</p>
                            <p className="text-[10px] text-gray-500 font-medium mt-0.5">ស្រី៖ {initialStudents.filter(s=>s.gender==='ស្រី'||s.gender==='F').length} នាក់</p>
                        </div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-indigo-500 flex items-center gap-4">
                        <div className="p-3 bg-indigo-100 text-indigo-600 rounded-full"><Award className="w-6 h-6" /></div>
                        <div>
                            <p className="text-xs text-gray-500 font-bold uppercase">មធ្យមភាគថ្នាក់សរុប</p>
                            <p className="text-2xl font-bold text-indigo-700 leading-tight">{analytics.classOverallAvg}</p>
                            <p className="text-[10px] text-gray-500 font-medium mt-0.5">មធ្យមភាគសរុបគ្រប់ខែ</p>
                        </div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-green-500 flex items-center gap-4">
                        <div className="p-3 bg-green-100 text-green-600 rounded-full"><CheckSquare className="w-6 h-6" /></div>
                        <div>
                            <p className="text-xs text-gray-500 font-bold uppercase">អត្រាវត្តមានសរុប</p>
                            <p className="text-2xl font-bold text-green-700 leading-tight">{analytics.avgAttRate}%</p>
                            <p className="text-[10px] text-gray-500 font-medium mt-0.5">វត្តមានគិតជាភាគរយ</p>
                        </div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-red-500 flex items-center gap-4">
                        <div className="p-3 bg-red-100 text-red-600 rounded-full"><AlertTriangle className="w-6 h-6" /></div>
                        <div>
                            <p className="text-xs text-gray-500 font-bold uppercase">សិស្សប្រឈមហានិភ័យ</p>
                            <p className="text-2xl font-bold text-red-700 leading-tight">{analytics.riskCount}</p>
                            <p className="text-[10px] text-gray-500 font-medium mt-0.5">ពិន្ទុខ្សោយ ឬអវត្តមានច្រើន</p>
                        </div>
                    </div>
                </div>

                {/* Holistic Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                    <div className="bg-teal-50 p-4 rounded-xl border border-teal-200 flex items-center justify-between shadow-sm">
                        <div>
                            <p className="text-xs text-teal-600 font-bold uppercase mb-1">សុខភាព (ធម្មតា)</p>
                            <p className="text-2xl font-bold text-teal-800">{analytics.healthyCount} នាក់</p>
                        </div>
                        <div className="p-3 bg-teal-100 text-teal-600 rounded-full"><HeartPulse className="w-6 h-6" /></div>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 flex items-center justify-between shadow-sm">
                        <div>
                            <p className="text-xs text-orange-600 font-bold uppercase mb-1">សិស្សរៀនយឺត (កំពុងជួយ)</p>
                            <p className="text-2xl font-bold text-orange-800">{analytics.slowCount} នាក់</p>
                        </div>
                        <div className="p-3 bg-orange-100 text-orange-600 rounded-full"><BookOpen className="w-6 h-6" /></div>
                    </div>
                    <div className="bg-rose-50 p-4 rounded-xl border border-rose-200 flex items-center justify-between shadow-sm">
                        <div>
                            <p className="text-xs text-rose-600 font-bold uppercase mb-1">ជួបការលំបាក (ខ្វះខាត)</p>
                            <p className="text-2xl font-bold text-rose-800">{analytics.diffCount} នាក់</p>
                        </div>
                        <div className="p-3 bg-rose-100 text-rose-600 rounded-full"><HelpingHand className="w-6 h-6" /></div>
                    </div>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="bg-white p-5 lg:col-span-2 border-t-4 border-[#0054a6] rounded-xl shadow-sm">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h2 className="font-bold text-[#0054a6] flex items-center gap-2">
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
                                    <Line type="monotone" dataKey="avg" stroke="#0054a6" strokeWidth={3} dot={{r: 4, fill: '#0054a6'}} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-white p-5 border-t-4 border-green-500 rounded-xl shadow-sm">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h2 className="font-bold text-green-700 flex items-center gap-2">
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

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="bg-white p-5 lg:col-span-2 border-t-4 border-indigo-500 rounded-xl shadow-sm">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h2 className="font-bold text-indigo-700 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-red-500" />
                                សិស្សប្រឈមហានិភ័យសរុប (ពិន្ទុទាប ឬ អវត្តមានច្រើន)
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-red-50 text-red-800 text-xs uppercase">
                                    <tr>
                                        <th className="px-4 py-3 rounded-tl-lg">ឈ្មោះសិស្ស</th>
                                        <th className="px-4 py-3 text-center">មធ្យមភាគសរុប</th>
                                        <th className="px-4 py-3 text-center">អវត្តមាន</th>
                                        <th className="px-4 py-3 text-center">អត្រា</th>
                                        <th className="px-4 py-3 rounded-tr-lg">ស្ថានភាពហានិភ័យ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {Object.values(analytics.studentData)
                                        .filter(d => d.isRisk)
                                        .slice(0, 5)
                                        .map((d, i) => (
                                        <tr key={i} className="hover:bg-red-50/50 transition">
                                            <td className="px-4 py-3 font-bold text-gray-800">{d.student.name_kh || d.student.full_name}</td>
                                            <td className="px-4 py-3 text-center text-red-600 font-bold">{d.overallAvg !== null ? d.overallAvg.toFixed(2) : '-'}</td>
                                            <td className="px-4 py-3 text-center text-red-600 font-bold">{d.a}</td>
                                            <td className="px-4 py-3 text-center text-gray-600">{d.attRate.toFixed(1)}%</td>
                                            <td className="px-4 py-3">
                                                <span className="bg-red-100 text-red-700 text-[10px] px-2 py-1 rounded-full font-bold">ប្រឈមខ្ពស់</span>
                                            </td>
                                        </tr>
                                    ))}
                                    {Object.values(analytics.studentData).filter(d => d.isRisk).length === 0 && (
                                        <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 italic">មិនមានសិស្សប្រឈមហានិភ័យទេ 👏</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white p-5 border-t-4 border-yellow-500 rounded-xl shadow-sm">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h2 className="font-bold text-yellow-700 flex items-center gap-2">
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
                
            </div>
        </div>
    )
}
