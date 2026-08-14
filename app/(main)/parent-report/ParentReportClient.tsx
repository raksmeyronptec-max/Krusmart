'use client'

import { useState, useCallback, useEffect } from 'react'
import { ArrowLeft, UserSearch, FileSpreadsheet, Printer, Loader2, Contact } from 'lucide-react'
import Link from 'next/link'
import { getStudentDataForYear } from './actions'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import * as XLSX from 'xlsx-js-style'
import Select from '@/components/ui/forms/Select'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import type { AttendanceRecord, Score, Settings, Student } from '@/lib/types'
import { ACADEMIC_MONTH_IDS, MONTHS_BY_CALENDAR, MONTH_LABEL_BY_ID, MONTH_NUM_BY_ID, isMonthId } from '@/lib/constants/months'
import { calculateAge } from '@/lib/utils/date'

const subjectsConfig = [
    { key: 'kh_listen', label: 'ភាសាខ្មែរ (ស្តាប់)' }, { key: 'kh_speak', label: 'ភាសាខ្មែរ (និយាយ)' },
    { key: 'kh_read', label: 'ភាសាខ្មែរ (អាន)' }, { key: 'kh_write', label: 'ភាសាខ្មែរ (សរសេរ)' },
    { key: 'kh_calligraphy', label: 'ភាសាខ្មែរ (អក្សរផ្ចង់)' }, { key: 'kh_recitation', label: 'ភាសាខ្មែរ (មេសូត្រ)' }, { key: 'kh_essay', label: 'ភាសាខ្មែរ (តែងសេចក្តី)' },
    { key: 'math_num', label: 'គណិតវិទ្យា (ចំនួន)' }, { key: 'math_meas', label: 'គណិត (រង្វាស់រង្វាល់)' },
    { key: 'math_geo', label: 'គណិត (ធរណីមាត្រ)' }, { key: 'math_alg', label: 'គណិត (ពីជគណិត)' },
    { key: 'math_stat', label: 'គណិត (ស្ថិតិ)' },
    { key: 'sci_phy', label: 'រូបវិទ្យា' }, { key: 'sci_chem', label: 'គីមីវិទ្យា' },
    { key: 'sci_bio', label: 'ជីវវិទ្យា' }, { key: 'sci_earth', label: 'ផែនដីវិទ្យា' }, { key: 'sci_applied', label: 'វិទ្យាសាស្ត្រ (អនុវត្តន៍)' },
    { key: 'soc_ethic', label: 'សីលធម៌' }, { key: 'soc_geo', label: 'ភូមិវិទ្យា' },
    { key: 'soc_hist', label: 'ប្រវត្តិវិទ្យា' }, { key: 'soc_home', label: 'គេហវិទ្យា' },
    { key: 'pe_sport', label: 'អប់រំកាយ និងកីឡា' }, { key: 'health_hygiene', label: 'អប់រំសុខភាព' },
    { key: 'life_skill', label: 'បំណិនជីវិត' }, { key: 'foreign', label: 'ភាសាបរទេស' },
    { key: 'ex_oral', label: 'ការបំពេញបន្ថែម (ផ្ទាល់មាត់)' }, { key: 'ex_att', label: 'ការបំពេញបន្ថែម (អវត្តមាន)' },
    { key: 'ex_book', label: 'ការបំពេញបន្ថែម (សៀវភៅ)' }, { key: 'ex_hw', label: 'ការបំពេញបន្ថែម (កិច្ចការផ្ទះ)' }
]

/** One subject row on the printed report. */
interface DisplayScore {
    index: number
    label: string
    score: string
}

/** One point on the monthly trend chart. */
interface MonthlyPoint {
    name: string
    average: number | null
}

/** Everything the report renders for the selected student. */
interface ReportData {
    student: Student
    displayScores: DisplayScore[]
    total: string
    average: string
    rank: number | string
    grade: string
    remark: string
    attendance: { p: number; l: number; a: number; rate: string | number }
}

export default function ParentReportClient({ initialStudents, settings }: { initialStudents: Student[], settings: Settings | null }) {
    const [academicYear, setAcademicYear] = useState('2025-2026')
    const [month, setMonth] = useState('nov')
    const [studentId, setStudentId] = useState('')
    const [loading, setLoading] = useState(false)

    const [allScores, setAllScores] = useState<Score[]>([])
    const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([])
    
    // Derived Data
    const [reportData, setReportData] = useState<ReportData | null>(null)
    const [chartData, setChartData] = useState<MonthlyPoint[]>([])

    useEffect(() => {
        // Default to the current calendar month. Reading the clock is impure, so
        // it happens here rather than during render.
        const mCode = MONTHS_BY_CALENDAR[new Date().getMonth()].id
        // eslint-disable-next-line react-hooks/set-state-in-effect -- see above: the default depends on the clock
        if (isMonthId(mCode)) setMonth(mCode)
    }, [])

    const loadServerData = useCallback(async () => {
        setLoading(true)
        const { scores, attendance } = await getStudentDataForYear(academicYear)
        setAllScores(scores)
        setAllAttendance(attendance)
        setLoading(false)
    }, [academicYear])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is set after await, not synchronously during the effect
        loadServerData()
    }, [academicYear, loadServerData])

    const generateReport = useCallback((sid: string) => {
        const student = initialStudents.find(s => s.id === sid)
        if (!student) return

        // Calculate rankings for the current month to find the rank
        const currentPeriod = `${month}-${academicYear}`
        const periodScores = allScores.filter(s => s.score_period === currentPeriod)
        
        // Group by student for ranking
        const scoresByStudent: Record<string, { total: number, count: number, avg: number }> = {}
        initialStudents.forEach(stu => {
            scoresByStudent[stu.id] = { total: 0, count: 0, avg: 0 }
        })

        periodScores.forEach(ps => {
            if (scoresByStudent[ps.student_id]) {
                const val = parseFloat(String(ps.score_value))
                if (!isNaN(val)) {
                    scoresByStudent[ps.student_id].total += val
                    scoresByStudent[ps.student_id].count += 1
                }
            }
        })

        const rankedList = Object.keys(scoresByStudent).map(id => {
            const data = scoresByStudent[id]
            data.avg = data.count > 0 ? data.total / data.count : 0
            return { id, avg: data.avg }
        }).sort((a, b) => b.avg - a.avg)

        const rankMap: Record<string, number> = {}
        let currRank = 1
        for (let i = 0; i < rankedList.length; i++) {
            if (i > 0 && rankedList[i].avg < rankedList[i-1].avg) currRank = i + 1
            rankMap[rankedList[i].id] = currRank
        }

        // Student's scores for this month
        const studentMonthScores = periodScores.filter(s => s.student_id === sid)
        const displayScores: DisplayScore[] = []
        let stTotal = 0
        let stCount = 0

        subjectsConfig.forEach((subj, idx) => {
            const found = studentMonthScores.find(s => s.subject === subj.key)
            if (found && found.score_value !== null) {
                const v = parseFloat(String(found.score_value))
                if (!isNaN(v)) {
                    stTotal += v
                    stCount++
                    displayScores.push({ index: idx + 1, label: subj.label, score: v.toFixed(2) })
                }
            }
        })

        const stAvg = stCount > 0 ? stTotal / stCount : 0
        
        let grade = 'F'
        if (stAvg >= 9.0) grade = 'A'
        else if (stAvg >= 8.0) grade = 'B'
        else if (stAvg >= 7.0) grade = 'C'
        else if (stAvg >= 6.0) grade = 'D'
        else if (stAvg >= 5.0) grade = 'E'

        let remark = ""
        if (stAvg <= 0) remark = "គ្មាន"
        else if (stAvg < 5) remark = "សិស្សបាននិទ្ទេសF សូមជួយជំរុញកូនឲ្យខិតខំរៀនសូត្របន្ថែមទៀត"
        else if (stAvg < 6) remark = "សិស្សបាននិទ្ទេសE ត្រូវខិតខំប្រឹងប្រែងរៀនសូត្របន្ថែមទៀត"
        else if (stAvg < 7) remark = "សិស្សបាននិទ្ទេសD ត្រូវខិតខំប្រឹងរៀនសូត្របន្ថែមទៀត"
        else if (stAvg < 8) remark = "សិស្សបាននិទ្ទេសC មានវិន័យ និងសីលធម៌ល្អ"
        else if (stAvg < 9) remark = "សិស្សបាននិទ្ទេសB មានវិន័យ និងសីលធម៌ល្អ"
        else remark = "សិស្សបាននិទ្ទេសA មានវិន័យ និងសីលធម៌ល្អ"
        
        remark += "។ សូមជូនពរ មាតាបិតាឬអាណាព្យាបាល ព្រមទាំងកូន មានសុខភាពល្អ និងសំណាងល្អជានិច្ច។"

        // Attendance
        const [yStart, yEnd] = academicYear.split('-')
        const isNextYear = !['nov', 'dec'].includes(month)
        const actualYear = isNextYear ? yEnd : yStart
        const targetDatePrefix = `${actualYear}-${MONTH_NUM_BY_ID[month]}`

        let p=0, l=0, a=0
        allAttendance.forEach(att => {
            if (att.student_id === sid && att.date.startsWith(targetDatePrefix)) {
                if (att.status === 'P') p++
                if (att.status === 'L') l++
                if (att.status === 'A') a++
            }
        })

        const totalDays = p + l + a
        const attRate = totalDays > 0 ? ((p / totalDays) * 100).toFixed(0) : 100

        setReportData({
            student,
            displayScores,
            total: stTotal.toFixed(2),
            average: stAvg.toFixed(2),
            rank: stAvg > 0 ? rankMap[sid] : '-',
            grade: stAvg > 0 ? grade : '-',
            remark,
            attendance: { p, l, a, rate: attRate }
        })

        // Chart Data
        const cData: MonthlyPoint[] = []
        ACADEMIC_MONTH_IDS.forEach(m => {
            const mPeriod = `${m}-${academicYear}`
            const mScores = allScores.filter(s => s.score_period === mPeriod && s.student_id === sid)
            
            let mSum = 0, mCount = 0
            mScores.forEach(ms => {
                const val = parseFloat(String(ms.score_value))
                if (!isNaN(val)) {
                    mSum += val
                    mCount++
                }
            })
            
            cData.push({
                name: MONTH_LABEL_BY_ID[m],
                average: mCount > 0 ? parseFloat((mSum / mCount).toFixed(2)) : null
            })
        })
        setChartData(cData)
    }, [academicYear, month, allScores, allAttendance, initialStudents])

    useEffect(() => {
        if (studentId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- rebuilding the report for the new selection is this effect's purpose
            generateReport(studentId)
        } else {
            setReportData(null)
        }
    }, [studentId, generateReport])




    const printSingle = () => {
        if (!studentId) {
            alert("សូមជ្រើសរើសសិស្សជាមុនសិន")
            return
        }
        window.print()
    }

    const exportExcel = () => {
        // Simple export of the score table
        if (!reportData) return
        
        const wb = XLSX.utils.book_new()
        const wsData = [
            ["ល.រ", "មុខវិជ្ជាសិក្សា (Subjects)", "ពិន្ទុទទួលបាន"],
            ...reportData.displayScores.map(s => [s.index, s.label, s.score]),
            ["", "ពិន្ទុសរុប៖", reportData.total],
            ["", "មធ្យមភាគ៖", reportData.average],
            ["", "ចំណាត់ថ្នាក់លេខ៖", reportData.rank],
            ["", "និទ្ទេស៖", reportData.grade]
        ]
        const ws = XLSX.utils.aoa_to_sheet(wsData)
        XLSX.utils.book_append_sheet(wb, ws, "Report")
        XLSX.writeFile(wb, `Parent_Report_${reportData.student.name_kh || reportData.student.full_name}.xlsx`)
    }

    return (
        <div className="bg-[#f0f4f8] min-h-screen text-[#1e293b] font-battambang pb-10 print:bg-white print:m-0 print:p-0">
            <style jsx global>{`
                .font-moul { font-family: 'Moul', cursive; font-weight: normal; }
                .font-battambang { font-family: 'Battambang', cursive; }

                @media print {
                    @page { size: A4 portrait; margin: 8mm; }
                    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0; margin: 0; }
                    .no-print { display: none !important; }
                    .print-container { 
                        box-shadow: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        page-break-inside: avoid;
                    }
                    .print-break-inside-avoid { page-break-inside: avoid; }
                    
                    table.report-table th, table.report-table td { 
                        padding: 2px 4px !important; 
                        font-size: 11px !important; 
                        line-height: 1.2 !important;
                    }
                }
            `}</style>

            {loading && (
                <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.9)', zIndex: 2000, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                    <Loader2 className="w-12 h-12 animate-spin text-[#0054a6] mb-4" />
                    <p className="font-moul text-[#0054a6] text-lg animate-pulse">កំពុងរៀបចំទិន្នន័យ...</p>
                </div>
            )}

            <nav className="bg-white/95 backdrop-blur-md border-b border-[#0054a6]/10 sticky top-0 z-50 p-4 shadow-sm no-print">
                <div className="container mx-auto max-w-7xl flex flex-col xl:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4 w-full xl:w-auto">
                        <Link href="/dashboard" className="flex items-center justify-center w-10 h-10 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="font-moul text-[#0054a6] text-lg">របាយការណ៍ជូនមាតាបិតា</h1>
                            <p className="text-xs text-gray-500 font-bold">Student Progress Report</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                        <Select
                            ariaLabel="ឆ្នាំសិក្សា"
                            value={academicYear}
                            onChange={setAcademicYear}
                            options={[
                                { value: '2025-2026', label: 'ឆ្នាំ ២០២៥-២០២៦' },
                                { value: '2026-2027', label: 'ឆ្នាំ ២០២៦-២០២៧' },
                            ]}
                            wrapperClassName="w-full sm:w-auto"
                        />

                        <Select
                            ariaLabel="ខែ"
                            value={month}
                            onChange={setMonth}
                            options={ACADEMIC_MONTH_IDS.map(m => ({ value: m, label: `ខែ ${MONTH_LABEL_BY_ID[m]}` }))}
                            wrapperClassName="w-full sm:w-auto"
                        />

                        <SearchableSelect
                            ariaLabel="ជ្រើសរើសសិស្ស"
                            placeholder="-- ជ្រើសរើសសិស្ស --"
                            value={studentId}
                            onChange={setStudentId}
                            options={initialStudents.map(s => ({
                                value: s.id,
                                label: s.name_kh || s.full_name || '',
                            }))}
                            leadingIcon={<UserSearch />}
                            wrapperClassName="flex-1 min-w-[200px]"
                        />

                        <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                            <button onClick={exportExcel} className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl text-sm font-bold flex justify-center items-center gap-2 shadow-md transition-transform hover:scale-105">
                                <FileSpreadsheet className="w-4 h-4" /> Excel
                            </button>
                            <button onClick={printSingle} className="flex-1 sm:flex-none bg-[#0054a6] hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-sm font-bold flex justify-center items-center gap-2 shadow-md transition-transform hover:scale-105">
                                <Printer className="w-4 h-4" /> បោះពុម្ព
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {!reportData ? (
                <div className="container mx-auto max-w-3xl mt-10 p-8 text-center no-print">
                    <div className="bg-white p-10 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center">
                        <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
                            <Contact className="w-10 h-10" />
                        </div>
                        <h2 className="font-moul text-xl text-gray-700 mb-2">សៀវភៅតាមដានការសិក្សា</h2>
                        <p className="text-gray-500 font-medium">សូមជ្រើសរើសឈ្មោះសិស្សនៅខាងលើ ដើម្បីបង្ហាញរបាយការណ៍លទ្ធផលសិក្សារបស់ពួកគាត់។</p>
                    </div>
                </div>
            ) : (
                <div id="printContainer" className="print-container bg-white w-full max-w-[21cm] min-h-[29.7cm] my-8 mx-auto p-[1.5cm] rounded-lg shadow-lg border border-slate-100 print:block">
                    
                    <div className="flex justify-between items-start mb-6 print:mb-2 relative">
                        <div className="text-left leading-relaxed pt-[35pt] print:pt-[5pt]">
                            <p className="font-moul text-[13px]">{settings?.management_unit_1 || "មន្ទីរអប់រំ យុវជន និងកីឡា"}</p>
                            <p className="font-moul text-[13px]">{settings?.management_unit_2 || "ការិយាល័យអប់រំ យុវជន និងកីឡា"}</p>
                            <p className="font-moul text-[13px]">{settings?.school_name || "សាលារបស់អ្នក"}</p>
                            <p className="font-moul text-[13px] mt-2 print:mt-1"> <span className="text-blue-700">{settings?.class_name || "ថ្នាក់ដើម"}</span></p>
                        </div>
                        <div className="text-center">
                            <p className="font-moul text-[14px]">ព្រះរាជាណាចក្រកម្ពុជា</p>
                            <p className="font-moul text-[14px]">ជាតិ សាសនា ព្រះមហាក្សត្រ</p>
                        </div>
                    </div>

                    <div className="text-center mb-6 print:mb-2">
                        <h1 className="font-moul text-[16px] text-[#0054a6] uppercase underline underline-offset-8 decoration-2 mb-2 print:mb-1">សៀវភៅតាមដានការសិក្សា និងអវត្តមាន</h1>
                        <p className="font-bold text-[13px] text-gray-700">ប្រចាំខែ <span className="text-[#0054a6]">{MONTH_LABEL_BY_ID[month]}</span> ឆ្នាំសិក្សា <span>{academicYear}</span></p>
                    </div>

                    <div className="flex items-center gap-6 print:gap-3 mb-6 print:mb-2 bg-blue-50/50 p-4 print:p-2 rounded-xl border border-blue-100 print-break-inside-avoid">
                        <div className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={reportData.student.photo_url || `https://api.dicebear.com/7.x/notionists/svg?seed=${reportData.student.id}`} className="w-20 h-20 print:w-14 print:h-14 rounded-lg object-cover border-2 border-[#0054a6] shadow-sm bg-white" alt="Student" />
                            <div className="absolute -bottom-2 -right-2 bg-white px-2 py-0.5 rounded text-[10px] font-bold border shadow-sm">ID: {reportData.student.id}</div>
                        </div>
                        <div className="flex-1 grid grid-cols-2 gap-y-2 print:gap-y-0.5 gap-x-8 text-[13px]">
                            <div className="flex border-b border-gray-200 pb-1"><span className="w-28 text-gray-600">នាមត្រកូល និងនាម៖</span> <span className="font-moul text-[#0054a6]">{reportData.student.name_kh || reportData.student.full_name}</span></div>
                            <div className="flex border-b border-gray-200 pb-1"><span className="w-16 text-gray-600">ភេទ៖</span> <span className="font-bold">{reportData.student.gender}</span></div>
                            <div className="flex border-b border-gray-200 pb-1"><span className="w-28 text-gray-600">ថ្ងៃខែឆ្នាំកំណើត៖</span> <span className="font-bold">{reportData.student.dob}</span></div>
                            <div className="flex border-b border-gray-200 pb-1"><span className="w-16 text-gray-600">អាយុ៖</span> <span className="font-bold">{calculateAge(reportData.student.dob) ?? '-'} ឆ្នាំ</span></div>
                            <div className="flex border-b border-gray-200 pb-1 col-span-2"><span className="w-28 text-gray-600">ឈ្មោះមាតាបិតា៖</span> <span className="font-bold">ឪពុក: {reportData.student.father_name || '-'} ម្តាយ: {reportData.student.mother_name || '-'}</span></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 print:grid-cols-3 gap-6 print:gap-3 mb-6 print:mb-2">
                        
                        <div className="lg:col-span-2 print:col-span-2 print-break-inside-avoid">
                            <div className="flex items-center gap-2 mb-3 print:mb-1">
                                <div className="w-6 h-6 print:w-5 print:h-5 rounded-full bg-[#0054a6] text-white flex items-center justify-center font-bold text-xs">១</div>
                                <h2 className="font-moul text-[13px] text-[#0054a6]">លទ្ធផលនៃការសិក្សា</h2>
                            </div>
                            
                            <table className="w-full border-collapse text-[13px] report-table">
                                <thead>
                                    <tr>
                                        <th className="w-10 text-center border border-slate-300 bg-slate-50 p-2 font-bold">ល.រ</th>
                                        <th className="border border-slate-300 bg-slate-50 p-2 font-bold">មុខវិជ្ជាសិក្សា (Subjects)</th>
                                        <th className="w-24 text-center border border-slate-300 bg-slate-50 p-2 font-bold">ពិន្ទុទទួលបាន</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reportData.displayScores.length === 0 ? (
                                        <tr><td colSpan={3} className="text-center text-gray-400 py-4 border border-slate-300">មិនមានទិន្នន័យពិន្ទុសម្រាប់ខែនេះទេ</td></tr>
                                    ) : reportData.displayScores.map((s, idx) => (
                                        <tr key={idx}>
                                            <td className="text-center font-bold text-gray-500 border border-slate-300 p-1">{idx + 1}</td>
                                            <td className="font-medium text-gray-800 border border-slate-300 p-1 px-2">{s.label}</td>
                                            <td className={`text-center font-bold border border-slate-300 p-1 ${parseFloat(s.score) < 5 ? 'text-red-500' : 'text-[#0054a6]'}`}>{s.score}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-blue-50/50 border-t-2 border-[#0054a6]">
                                    <tr>
                                        <td colSpan={2} className="text-right font-bold text-gray-700 border border-slate-300 p-2">ពិន្ទុសរុប៖</td>
                                        <td className="text-center font-bold text-[#0054a6] text-[14px] print:text-[13px] border border-slate-300 p-2">{reportData.total}</td>
                                    </tr>
                                    <tr>
                                        <td colSpan={2} className="text-right font-bold text-gray-700 border border-slate-300 p-2">មធ្យមភាគ៖</td>
                                        <td className="text-center font-bold text-red-600 text-[14px] print:text-[13px] border border-slate-300 p-2">{reportData.average}</td>
                                    </tr>
                                    <tr>
                                        <td colSpan={2} className="text-right font-bold text-red-700 border border-slate-300 p-2">ចំណាត់ថ្នាក់លេខ៖</td>
                                        <td className="text-center font-moul text-red-600 text-[15px] print:text-[14px] border border-slate-300 p-2">{reportData.rank}</td>
                                    </tr>
                                    <tr>
                                        <td colSpan={2} className="text-right font-bold text-gray-700 border border-slate-300 p-2">និទ្ទេស៖</td>
                                        <td className={`text-center font-black text-[15px] print:text-[14px] border border-slate-300 p-2 ${parseFloat(reportData.average) < 5 ? 'text-red-600' : 'text-green-600'}`}>{reportData.grade}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <div className="flex flex-col gap-6 print:gap-2 print-break-inside-avoid">
                            
                            <div>
                                <div className="flex items-center gap-2 mb-3 print:mb-1">
                                    <div className="w-6 h-6 print:w-5 print:h-5 rounded-full bg-green-600 text-white flex items-center justify-center font-bold text-xs">២</div>
                                    <h2 className="font-moul text-[13px] text-green-700">អវត្តមានប្រចាំខែ</h2>
                                </div>
                                
                                <div className="bg-white border border-gray-200 rounded-xl print:rounded-lg overflow-hidden shadow-sm">
                                    <div className="flex justify-between items-center p-3 print:p-2 border-b border-gray-100">
                                        <span className="text-gray-600 font-bold text-[12px] flex items-center gap-2"><div className="w-3 h-3 print:w-2 print:h-2 bg-red-500 rounded-full"></div> អវត្តមាន (គ្មានច្បាប់)</span>
                                        <span className="font-bold text-red-600 text-[14px] print:text-[13px]">{reportData.attendance.a} <span className="text-[10px] font-normal text-gray-500">ដង</span></span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 print:p-2 border-b border-gray-100">
                                        <span className="text-gray-600 font-bold text-[12px] flex items-center gap-2"><div className="w-3 h-3 print:w-2 print:h-2 bg-yellow-500 rounded-full"></div> សុំច្បាប់ឈប់ (មានច្បាប់)</span>
                                        <span className="font-bold text-yellow-600 text-[14px] print:text-[13px]">{reportData.attendance.l} <span className="text-[10px] font-normal text-gray-500">ដង</span></span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 print:p-2 bg-green-50/50">
                                        <span className="text-gray-600 font-bold text-[12px] flex items-center gap-2"><div className="w-3 h-3 print:w-2 print:h-2 bg-green-500 rounded-full"></div> វត្តមានសរុប (អត្រា)</span>
                                        <span className={`font-bold text-[14px] print:text-[13px] ${parseFloat(String(reportData.attendance.rate)) < 80 ? 'text-red-600' : 'text-green-700'}`}>{reportData.attendance.rate}%</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center gap-2 mb-3 print:mb-1">
                                    <div className="w-6 h-6 print:w-5 print:h-5 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-xs">៣</div>
                                    <h2 className="font-moul text-[13px] text-purple-700">គំនូសតាងការសិក្សា</h2>
                                </div>
                                <div className="border border-gray-200 rounded-xl print:rounded-lg p-2 bg-white shadow-sm h-[160px] print:h-[140px] relative">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={chartData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} />
                                            <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                                            <Line type="monotone" dataKey="average" stroke="#0054a6" strokeWidth={3} dot={{ r: 4, fill: '#0054a6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} connectNulls={true} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                        </div>
                    </div>

                    <div className="mb-8 print:mb-2 print-break-inside-avoid">
                        <div className="flex items-center gap-2 mb-3 print:mb-1">
                            <div className="w-6 h-6 print:w-5 print:h-5 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-xs">៤</div>
                            <h2 className="font-moul text-[13px] text-orange-700">មតិយោបល់របស់គ្រូបន្ទុកថ្នាក់</h2>
                        </div>
                        <div className="border-2 border-dashed border-gray-300 rounded-xl print:rounded-lg p-4 print:p-2 min-h-[60px] print:min-h-[30px] bg-orange-50/30 flex items-center">
                            <p className="text-gray-600 italic text-[13px] print:text-[11px] w-full text-center">{reportData.remark}</p>
                        </div>
                    </div>

                    <div className="flex flex-row print:flex-row justify-between items-start mt-8 print:mt-2 px-4 print:px-0 print-break-inside-avoid text-[13px] print:text-[11px]">
                        <div className="text-center w-[180px] print:w-[150px]">
                            <p className="mb-2 font-bold">មាតាបិតា ឬអាណាព្យាបាល</p>
                            <p className="text-xs text-gray-500 mb-12 print:mb-6">បានឃើញ និងឯកភាព</p>
                        </div>
                        
                        <div className="text-center w-[180px] print:w-[150px]">
                            <p className="mb-2 font-bold">បានឃើញ និងឯកភាព</p>
                            <p className="font-moul mb-12 print:mb-6 text-[#0054a6]">{settings?.director_name || "នាយកសាលា"}</p>
                        </div>
                        
                        <div className="text-center w-[200px] print:w-[180px]">
                            <p className="mb-2"><span>{settings?.province_date || "......................."}</span>, ថ្ងៃទី.......ខែ.......ឆ្នាំ២០២...</p>
                            <p className="font-moul mb-12 print:mb-6 text-[#0054a6]">គ្រូបន្ទុកថ្នាក់</p>
                            <p className="font-moul text-[#0054a6]" style={{ marginLeft: '2cm', marginTop: '1.5cm' }}>{settings?.teacher_name || "ឈ្មោះគ្រូ"}</p>
                        </div>
                    </div>

                </div>
            )}
        </div>
    )
}
