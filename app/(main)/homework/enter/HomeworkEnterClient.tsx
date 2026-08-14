'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { 
    ArrowLeft, BookMarked, Calendar, Clock, CalendarDays, Printer, Save, Info,
    CalendarCheck, TableProperties, Loader2, Users, Check, Zap
} from 'lucide-react'
import { getScores, saveScores } from '../../score/enter/actions'
import { TopNav } from "@/components/TopNav"
import Select from '@/components/ui/forms/Select'
import type { ScoreInput, Student } from '@/lib/types'
import { logger } from '@/lib/utils/logger'

const allMonthsMap = [
    { id: 'nov', label: 'វិច្ឆិកា', isNextYear: false },
    { id: 'dec', label: 'ធ្នូ', isNextYear: false },
    { id: 'jan', label: 'មករា', isNextYear: true },
    { id: 'feb', label: 'កុម្ភៈ', isNextYear: true },
    { id: 'mar', label: 'មីនា', isNextYear: true },
    { id: 'apr', label: 'មេសា', isNextYear: true },
    { id: 'may', label: 'ឧសភា', isNextYear: true },
    { id: 'jun', label: 'មិថុនា', isNextYear: true },
    { id: 'jul', label: 'កក្កដា', isNextYear: true },
    { id: 'aug', label: 'សីហា', isNextYear: true },
    { id: 'sep', label: 'កញ្ញា', isNextYear: true },
    { id: 'oct', label: 'តុលា', isNextYear: true }
]

const monthIndexMapping: Record<string, number> = {
    'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
    'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
}

/** The grid only needs the id, the Khmer name and the gender. */
type StudentRow = Pick<Student, 'id' | 'name_kh' | 'gender'>

export default function HomeworkEnterClient({ initialStudents, userId }: { initialStudents: StudentRow[], userId: string }) {
    const [students] = useState<StudentRow[]>(initialStudents)
    const [currentTab, setCurrentTab] = useState<'daily' | 'monthly'>('daily')
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [showSuccess, setShowSuccess] = useState(false)
    const [bulkScore, setBulkScore] = useState<string>('')
    const [showBulkSuccess, setShowBulkSuccess] = useState(false)

    // Selection States
    const [yearSelect, setYearSelect] = useState('2025-2026')
    const [monthSelect, setMonthSelect] = useState('nov')
    const [daySelect, setDaySelect] = useState<number>(1)

    // Scores State: { student_id: { day: score_value } }
    const [scores, setScores] = useState<Record<string, Record<number, string>>>({})

    // Initialize Default Dates
    useEffect(() => {
        const d = new Date()
        const dDay = d.getDate()
        let dMonth = d.getMonth()
        let dYear = d.getFullYear()

        if (dDay >= 26) {
            dMonth += 1
            if (dMonth > 11) {
                dMonth = 0
                dYear += 1
            }
        }

        const academicStartYear = (dMonth === 10 || dMonth === 11) ? dYear : dYear - 1
        const academicYearStr = `${academicStartYear}-${academicStartYear + 1}`
        
        const monthIds = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
        const targetMonthId = monthIds[dMonth]

        setYearSelect(academicYearStr)
        setMonthSelect(targetMonthId)
        setDaySelect(dDay)
    }, [])

    // Generate Date Columns (Memoized)
    const dateColumns = useMemo(() => {
        if (!yearSelect.includes('-')) return []
        const selectedMonth = monthIndexMapping[monthSelect]
        const [startYear, endYear] = yearSelect.split('-')
        
        let currentYear = parseInt(endYear)
        if (monthSelect === 'nov' || monthSelect === 'dec') {
            currentYear = parseInt(startYear)
        }

        let prevMonth = selectedMonth - 1
        let prevYear = currentYear
        if (prevMonth < 0) {
            prevMonth = 11
            prevYear--
        }

        const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate()
        const columns = []
        
        for (let d = 26; d <= daysInPrevMonth; d++) {
            const date = new Date(prevYear, prevMonth, d)
            columns.push({ dayNum: d, isSunday: date.getDay() === 0, fullDate: date })
        }
        
        for (let d = 1; d <= 25; d++) {
            const date = new Date(currentYear, selectedMonth, d)
            columns.push({ dayNum: d, isSunday: date.getDay() === 0, fullDate: date })
        }
        
        return columns
    }, [yearSelect, monthSelect])

    // Load Scores from Supabase
    useEffect(() => {
        const loadScores = async () => {
            setIsLoading(true)
            const scorePeriod = `${yearSelect}_${monthSelect}`
            
            try {
                const data = await getScores('homework', scorePeriod)
                
                const loadedScores: Record<string, Record<number, string>> = {}
                
                data.forEach(s => {
                    const sid = s.student_id
                    const dayNum = parseInt(s.subject.replace('hw_', ''))
                    const val = s.score_value?.toString() || ''
                    
                    if (!isNaN(dayNum)) {
                        if (!loadedScores[sid]) loadedScores[sid] = {}
                        loadedScores[sid][dayNum] = val
                    }
                })
                
                setScores(loadedScores)
            } catch (error) {
                logger.error("Failed to load scores", error)
            } finally {
                setIsLoading(false)
            }
        }
        
        if (yearSelect && monthSelect) {
            loadScores()
        }
    }, [yearSelect, monthSelect])

    const handleScoreChange = (studentId: string, dayNum: number, val: string) => {
        setScores(prev => ({
            ...prev,
            [studentId]: {
                ...(prev[studentId] || {}),
                [dayNum]: val
            }
        }))
    }

    const fillAllScores = () => {
        if (!bulkScore || currentTab !== 'daily') return

        const dayCol = dateColumns.find(c => c.dayNum === daySelect)
        if (dayCol?.isSunday) return

        const newScores = { ...scores }
        students.forEach(s => {
            if (!newScores[s.id]) newScores[s.id] = {}
            newScores[s.id][daySelect] = bulkScore
        })
        setScores(newScores)

        setShowBulkSuccess(true)
        setTimeout(() => setShowBulkSuccess(false), 1500)
    }

    const handleSave = async () => {
        setIsSaving(true)
        
        const scorePeriod = `${yearSelect}_${monthSelect}`
        const upsertPayload: ScoreInput[] = []

        students.forEach(s => {
            const studentScores = scores[s.id] || {}
            dateColumns.forEach(col => {
                if (!col.isSunday) {
                    const val = studentScores[col.dayNum]
                    if (val !== undefined && val !== '') {
                        upsertPayload.push({
                            student_id: s.id,
                            subject: `hw_${col.dayNum}`,
                            score_value: val
                        })
                    } else if (val === '') {
                        // Include null to delete if existed
                         upsertPayload.push({
                            student_id: s.id,
                            subject: `hw_${col.dayNum}`,
                            score_value: null
                        })
                    }
                }
            })
        })

        try {
            await saveScores('homework', scorePeriod, upsertPayload)
            setShowSuccess(true)
            setTimeout(() => setShowSuccess(false), 3000)
        } catch (error) {
            logger.error("Save failed", error)
            alert("បរាជ័យក្នុងការរក្សាទុក!")
        } finally {
            setIsSaving(false)
        }
    }

    const getStudentTotals = (studentId: string) => {
        const studentScores = scores[studentId] || {}
        let total = 0
        let count = 0
        let hasValue = false
        
        for (const val of Object.values(studentScores)) {
            const num = parseFloat(val)
            if (!isNaN(num)) {
                total += num
                count++
                hasValue = true
            }
        }
        
        return {
            total: hasValue ? total : '',
            average: hasValue && count > 0 ? (total / count).toFixed(2) : ''
        }
    }

    const femaleCount = students.filter(s => s.gender === 'ស្រី' || s.gender === 'F').length
    
    // Split for daily view
    const half = Math.ceil(students.length / 2)
    const leftStudents = students.slice(0, half)
    const rightStudents = students.slice(half)

    const renderTbody = (stuList: StudentRow[], startIndex: number, mode: 'daily' | 'monthly') => {
        return stuList.map((s, index) => {
            const { total, average } = getStudentTotals(s.id)
            const genderColor = (s.gender === 'ស្រី' || s.gender === 'F') ? 'text-pink-600' : 'text-blue-600'
            
            return (
                <tr key={s.id} className="group transition-colors border-b border-slate-100 last:border-0 hover:bg-indigo-50/50">
                    <td className="p-2 text-center font-bold text-slate-500 bg-white group-hover:bg-indigo-50/50 sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.05)] border-r border-slate-200">
                        {startIndex + index + 1}
                    </td>
                    <td className="p-2 bg-white group-hover:bg-indigo-50/50 font-bold text-indigo-900 text-[13px] whitespace-nowrap sticky left-[40px] z-20 shadow-[2px_0_5px_rgba(0,0,0,0.05)] border-r border-slate-200 min-w-[150px]">
                        {s.name_kh || '-'}
                    </td>
                    <td className={`p-2 text-center font-bold text-[13px] ${genderColor} border-r border-slate-200 bg-white group-hover:bg-indigo-50/50`}>
                        {s.gender || '-'}
                    </td>
                    
                    {(mode === 'daily' ? dateColumns.filter(c => c.dayNum === daySelect) : dateColumns).map(col => {
                        const val = scores[s.id]?.[col.dayNum] ?? ''
                        const bgClass = col.isSunday ? 'bg-red-50' : 'bg-transparent'
                        const inputSize = mode === 'daily' ? 'py-2.5 text-[15px]' : 'py-1.5 text-[13px]'
                        
                        return (
                            <td key={col.dayNum} className={`p-0.5 border-r border-slate-200 ${bgClass}`}>
                                {col.isSunday ? (
                                    <input type="text" disabled readOnly
                                        className={`w-full text-center ${inputSize} px-0.5 border border-transparent rounded outline-none font-bold text-red-300 bg-transparent cursor-not-allowed select-none`}
                                        value="-" title="ថ្ងៃអាទិត្យ មិនអនុញ្ញាតអោយបញ្ចូលទេ" />
                                ) : (
                                    <input type="number" 
                                        className={`w-full text-center ${inputSize} px-0.5 border border-transparent hover:border-slate-300 rounded outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 font-bold text-slate-700 bg-transparent transition-all`}
                                        value={val}
                                        onChange={(e) => handleScoreChange(s.id, col.dayNum, e.target.value)}
                                        min="0" step="0.5" />
                                )}
                            </td>
                        )
                    })}
                    
                    <td className="p-2 text-center font-bold text-emerald-600 text-base group-hover:bg-emerald-50 sticky right-[80px] z-20 shadow-[-2px_0_5px_rgba(0,0,0,0.05)] border-l border-emerald-200 bg-emerald-50/30">
                        {total}
                    </td>
                    
                    {mode === 'monthly' && (
                        <td className="p-2 text-center font-bold text-teal-600 text-[15px] group-hover:bg-teal-50 sticky right-0 z-20 shadow-[-2px_0_5px_rgba(0,0,0,0.05)] border-l border-teal-200 bg-teal-50/30">
                            {average}
                        </td>
                    )}
                </tr>
            )
        })
    }

    const renderThead = (mode: 'daily' | 'monthly') => {
        const displayCols = mode === 'daily' ? dateColumns.filter(c => c.dayNum === daySelect) : dateColumns
        const dateLabel = mode === 'daily' ? 'កាលបរិច្ឆេទប្រចាំថ្ងៃ' : 'កាលបរិច្ឆេទ (២៦ ដល់ ២៥)'

        return (
            <>
                <tr>
                    <th rowSpan={2} className="p-2 border-b border-r border-indigo-200 bg-indigo-900 text-white w-10 text-center font-bold text-sm sticky left-0 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">ល.រ</th>
                    <th rowSpan={2} className="p-2 border-b border-r border-indigo-200 bg-indigo-900 text-white text-left font-bold text-sm min-w-[150px] sticky left-[40px] z-30 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">ឈ្មោះសិស្ស</th>
                    <th rowSpan={2} className="p-2 border-b border-r border-indigo-200 bg-indigo-800 text-white w-14 text-center font-bold text-sm">ភេទ</th>
                    <th colSpan={displayCols.length} className="p-1.5 border-b border-r border-indigo-200 bg-indigo-700 text-white text-center font-bold text-sm">{dateLabel}</th>
                    <th rowSpan={2} className="p-2 border-b border-emerald-300 bg-emerald-600 text-white w-[80px] min-w-[80px] text-center font-bold text-sm sticky right-[80px] z-30 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">សរុប</th>
                    {mode === 'monthly' && (
                        <th rowSpan={2} className="p-2 border-b border-teal-300 bg-teal-600 text-white w-[80px] min-w-[80px] text-center font-bold text-sm sticky right-0 z-30 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">មធ្យមភាគ</th>
                    )}
                </tr>
                <tr>
                    {displayCols.map(col => {
                        const bg = col.isSunday ? 'bg-red-500/80 text-white' : 'bg-indigo-600 text-indigo-50'
                        const minW = mode === 'daily' ? 'min-w-[80px]' : 'min-w-[34px]'
                        const textSize = mode === 'daily' ? 'text-[14px]' : 'text-[11px]'
                        return (
                            <th key={col.dayNum} className={`py-1.5 px-0.5 border-b border-r border-indigo-300/30 ${bg} text-center font-bold ${textSize} ${minW}`}>
                                {col.dayNum}
                            </th>
                        )
                    })}
                </tr>
            </>
        )
    }

    return (
        <div className="min-h-screen bg-[#f0f4f8] text-slate-800 flex flex-col">
            <TopNav />
            <div className="bg-animate fixed inset-0 z-[-1] opacity-60 bg-[radial-gradient(circle_at_10%_20%,#e0e7ff_0%,transparent_40%),radial-gradient(circle_at_90%_80%,#dcfce7_0%,transparent_40%),radial-gradient(circle_at_50%_50%,#fef3c7_0%,transparent_40%)]"></div>

            <div className="max-w-[1400px] mx-auto px-4 py-6 w-full flex flex-col gap-5 flex-1 overflow-hidden h-[calc(100vh-64px)]">
                
                {/* Header Section */}
                <div className="bg-white/80 backdrop-blur-md p-4 md:p-5 rounded-2xl shadow-sm border border-white/50 flex flex-col gap-4 shrink-0">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        {/* Title & Back */}
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <Link href="/dashboard" className="bg-indigo-50 p-3 rounded-xl hover:bg-indigo-100 text-indigo-600 transition flex items-center gap-2">
                                <ArrowLeft className="w-5 h-5" />
                            </Link>
                            <div className="bg-indigo-600 p-3 rounded-xl shadow-lg shadow-indigo-200 text-white">
                                <BookMarked className="w-6 h-6" />
                            </div>
                            <div>
                                <h1 className="text-xl md:text-2xl kh-moul text-indigo-900">បញ្ចូលពិន្ទុកិច្ចការផ្ទះ</h1>
                                <p className="text-slate-500 font-medium text-xs md:text-sm">Homework Score Entry (Cloud Sync)</p>
                            </div>
                        </div>

                        {/* Filters & Action */}
                        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-start md:justify-end">
                            
                            {/* Daily Controls */}
                            {currentTab === 'daily' && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <Select
                                        ariaLabel="ថ្ងៃ"
                                        value={String(daySelect)}
                                        onChange={(v) => setDaySelect(Number(v))}
                                        options={dateColumns.map(c => ({
                                            value: String(c.dayNum),
                                            label: `ថ្ងៃទី ${c.dayNum}${c.fullDate.getDate() === new Date().getDate() ? ' (ថ្ងៃនេះ)' : ''}`,
                                        }))}
                                        leadingIcon={<Calendar />}
                                        wrapperClassName="min-w-[130px]"
                                    />
                                    
                                    <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm h-[38px]">
                                        <input 
                                            type="number" 
                                            value={bulkScore}
                                            onChange={(e) => setBulkScore(e.target.value)}
                                            className="w-16 h-full px-2 text-center text-sm font-bold text-slate-700 outline-none" 
                                            placeholder="ពិន្ទុ" min="0" step="0.5" 
                                        />
                                        <button 
                                            onClick={fillAllScores}
                                            className={`h-full px-3 font-bold text-[13px] flex items-center gap-1 transition-colors whitespace-nowrap border-l border-slate-200 ${showBulkSuccess ? 'bg-green-100 text-green-700' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
                                        >
                                            {showBulkSuccess ? <Check className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                                            {showBulkSuccess ? 'រួចរាល់' : 'ទាំងអស់'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Month Select */}
                            <Select
                                ariaLabel="ខែ"
                                value={monthSelect}
                                onChange={setMonthSelect}
                                options={allMonthsMap.map(m => ({
                                    value: m.id,
                                    label: `ខែ${m.label} ឆ្នាំ ${m.isNextYear ? yearSelect.split('-')[1] : yearSelect.split('-')[0]}`,
                                }))}
                                leadingIcon={<Clock />}
                            />

                            {/* Year Select */}
                            <Select
                                ariaLabel="ឆ្នាំសិក្សា"
                                value={yearSelect}
                                onChange={setYearSelect}
                                options={[
                                    { value: '2024-2025', label: '២០២៤-២០២៥' },
                                    { value: '2025-2026', label: '២០២៥-២០២៦' },
                                    { value: '2026-2027', label: '២០២៦-២០២៧' },
                                    { value: '2027-2028', label: '២០២៧-២០២៨' },
                                    { value: '2028-2029', label: '២០២៨-២០២៩' },
                                    { value: '2029-2030', label: '២០២៩-២០៣0' },
                                ]}
                                leadingIcon={<CalendarDays />}
                            />

                            <div className="w-px h-8 bg-slate-200 mx-1 hidden sm:block"></div>

                            {/* Save Button */}
                            <button 
                                onClick={handleSave} 
                                disabled={isSaving}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold shadow-lg transition-all hover:scale-105 active:scale-95 ${showSuccess ? 'bg-emerald-500 text-white shadow-emerald-200' : 'bg-[#0054a6] text-white hover:bg-[#1e40af] shadow-blue-200'}`}
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : (showSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />)}
                                <span>{showSuccess ? 'ជោគជ័យ' : 'រក្សាទុក'}</span>
                            </button>
                        </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm flex items-start gap-3">
                        <Info className="w-5 h-5 min-w-[20px] text-amber-600 mt-0.5" />
                        <div>
                            <span className="font-bold">បញ្ជាក់៖</span> ពិន្ទុកិច្ចការផ្ទះត្រូវបូកសរុបចាប់ពី <b>ថ្ងៃទី ២៦ នៃខែចាស់</b> រហូតដល់ <b>ថ្ងៃទី ២៥ នៃខែបច្ចុប្បន្ន</b>។
                        </div>
                    </div>
                </div>

                {/* Section Tabs */}
                <div className="flex items-center justify-between gap-4 shrink-0 -mb-2 z-10">
                    <div className="flex p-1 bg-white/80 backdrop-blur-md rounded-xl shadow-sm border border-slate-200/60 w-full sm:w-auto">
                        <button 
                            onClick={() => setCurrentTab('daily')} 
                            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm shadow-md transition-all ${currentTab === 'daily' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-50 shadow-none'}`}
                        >
                            <CalendarCheck className="w-4 h-4" /> បញ្ចូលប្រចាំថ្ងៃ
                        </button>
                        <button 
                            onClick={() => setCurrentTab('monthly')} 
                            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${currentTab === 'monthly' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-50'}`}
                        >
                            <TableProperties className="w-4 h-4" /> ពិនិត្យប្រចាំខែ
                        </button>
                    </div>
                </div>

                {/* Table Container */}
                <div className="flex-1 bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50 overflow-hidden flex flex-col relative min-h-0">
                    <div className="flex-1 overflow-auto custom-scrollbar relative">
                        {isLoading ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-indigo-500 h-full gap-3 mt-10">
                                <Loader2 className="w-10 h-10 animate-spin opacity-80" />
                                <p className="font-bold">កំពុងទាញយកទិន្នន័យ...</p>
                            </div>
                        ) : students.length === 0 ? (
                            <div className="p-8 mt-10 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                                <Users className="w-10 h-10 opacity-50 mb-2" />
                                <p>មិនមានទិន្នន័យសិស្សទេ។ សូមទៅកាន់បញ្ជីឈ្មោះសិស្សដើម្បីបញ្ចូលជាមុនសិន។</p>
                            </div>
                        ) : currentTab === 'daily' ? (
                            <div className="grid grid-cols-1 xl:grid-cols-2 bg-slate-50 min-h-full">
                                <div className="border-b xl:border-b-0 xl:border-r border-slate-300">
                                    <table className="w-full border-collapse">
                                        <thead>{renderThead('daily')}</thead>
                                        <tbody className="bg-white text-sm">{renderTbody(leftStudents, 0, 'daily')}</tbody>
                                    </table>
                                </div>
                                <div>
                                    <table className="w-full border-collapse">
                                        <thead>{renderThead('daily')}</thead>
                                        <tbody className="bg-white text-sm">{renderTbody(rightStudents, half, 'daily')}</tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <table className="w-full border-collapse">
                                <thead>{renderThead('monthly')}</thead>
                                <tbody className="bg-white text-sm">{renderTbody(students, 0, 'monthly')}</tbody>
                            </table>
                        )}
                    </div>
                    
                    {/* Footer Stats */}
                    <div className="p-3 bg-white border-t border-slate-200 flex justify-between items-center text-sm text-slate-500 shrink-0">
                        <span className="font-bold text-[#0054a6]">សិស្សសរុប៖ {students.length} នាក់ (ស្រី {femaleCount})</span>
                        <span className="italic text-xs bg-slate-100 px-2 py-1 rounded flex items-center gap-1">
                            <Check className="w-3 h-3 text-blue-500" /> Cloud Sync Ready
                        </span>
                    </div>
                </div>
            </div>
            
            <style jsx global>{`
                input[type="number"]::-webkit-inner-spin-button, 
                input[type="number"]::-webkit-outer-spin-button { 
                    -webkit-appearance: none; margin: 0; 
                }
                .custom-scrollbar::-webkit-scrollbar { height: 10px; width: 10px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 5px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>
        </div>
    )
}
