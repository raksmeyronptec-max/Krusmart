'use client'

import { useState, useEffect, useMemo } from 'react'
import { 
    BookMarked, Calendar, Clock, CalendarDays, Save, Info,
    CalendarCheck, TableProperties, Loader2, Users, Check, Zap, Printer
} from 'lucide-react'
import { getScores, saveScores } from '../../score/enter/actions'
import Select from '@/components/ui/forms/Select'
import { notify } from '@/components/ui/feedback/notify'
import { useConfirm } from '@/components/ui/overlay/ConfirmDialog'
import type { ScoreInput, Settings, Student } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { MONTHS_BY_ACADEMIC_YEAR } from '@/lib/constants/months'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

const monthIndexMapping: Record<string, number> = {
    'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
    'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
}

/** The grid only needs the id, the Khmer name and the gender. */
type StudentRow = Pick<Student, 'id' | 'name_kh' | 'gender'>

export default function HomeworkEnterClient({ initialStudents, settings }: {
    initialStudents: StudentRow[]
    settings: Settings | null
}) {
    const [students] = useState<StudentRow[]>(initialStudents)
    const [currentTab, setCurrentTab] = useState<'daily' | 'monthly'>('daily')
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [showSuccess, setShowSuccess] = useState(false)
    const [bulkScore, setBulkScore] = useState<string>('')
    const [showBulkSuccess, setShowBulkSuccess] = useState(false)

    /**
     * Marks typed but not yet saved.
     *
     * Changing the month or the academic year re-runs the loader, which
     * replaces `scores` wholesale — the same silent data loss the score-entry
     * grid had. `switchTo` asks before discarding.
     */
    const [dirty, setDirty] = useState(false)
    const { confirm, dialog } = useConfirm()

    // Selection States
    const [yearSelect, setYearSelect] = useState(getCurrentAcademicYear)
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

        // eslint-disable-next-line react-hooks/set-state-in-effect -- default derives from the current date, which is impure and cannot run during render
        setYearSelect(academicYearStr)
        setMonthSelect(targetMonthId)
        setDaySelect(dDay)
    }, [])

    // The current year plus two either side, replacing a hard-coded run of six
    // that started in 2024 and would have expired.
    const academicYearOptions = useMemo(() => {
        const start = parseInt(getCurrentAcademicYear().split('-')[0], 10)
        return [-2, -1, 0, 1, 2].map((d) => {
            const y = start + d
            return { value: `${y}-${y + 1}`, label: `${toKhmerNumber(y)}-${toKhmerNumber(y + 1)}` }
        })
    }, [])

    const switchTo = async (apply: () => void) => {
        if (dirty && !(await confirm({
            title: 'ពិន្ទុមិនទាន់រក្សាទុក',
            message: 'អ្នកបានបញ្ចូលពិន្ទុដែលមិនទាន់រក្សាទុក។ ប្តូរទៅខែ ឬឆ្នាំផ្សេងនឹងបាត់បង់ពិន្ទុទាំងនោះ។',
            tone: 'warning',
            confirmLabel: 'បន្ត​ដោយមិនរក្សាទុក',
        }))) return
        setDirty(false)
        apply()
    }

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
        setDirty(true)
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
        setDirty(true)

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
            setDirty(false)
            setShowSuccess(true)
            setTimeout(() => setShowSuccess(false), 3000)
        } catch (error) {
            logger.error("Save failed", error)
            notify.error('បរាជ័យក្នុងការរក្សាទុកពិន្ទុកិច្ចការផ្ទះ')
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
            const genderColor = (s.gender === 'ស្រី' || s.gender === 'F') ? 'text-brand' : 'text-brand'
            
            return (
                <tr key={s.id} className="group transition-colors border-b border-divider last:border-0 hover:bg-brand-100/50">
                    <td className="p-2 text-center font-bold text-text-muted bg-bg-surface group-hover:bg-brand-100/50 sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.05)] border-r border-divider">
                        {startIndex + index + 1}
                    </td>
                    <td className="p-2 bg-bg-surface group-hover:bg-brand-100/50 font-bold text-text-heading text-[13px] whitespace-nowrap sticky left-[40px] z-20 shadow-[2px_0_5px_rgba(0,0,0,0.05)] border-r border-divider min-w-[150px]">
                        {s.name_kh || '-'}
                    </td>
                    <td className={`p-2 text-center font-bold text-[13px] ${genderColor} border-r border-divider bg-bg-surface group-hover:bg-brand-100/50`}>
                        {s.gender || '-'}
                    </td>
                    
                    {(mode === 'daily' ? dateColumns.filter(c => c.dayNum === daySelect) : dateColumns).map(col => {
                        const val = scores[s.id]?.[col.dayNum] ?? ''
                        const bgClass = col.isSunday ? 'bg-danger/10' : 'bg-transparent'
                        const inputSize = mode === 'daily' ? 'py-2.5 text-[15px]' : 'py-1.5 text-[13px]'
                        
                        return (
                            <td key={col.dayNum} className={`p-0.5 border-r border-divider ${bgClass}`}>
                                {col.isSunday ? (
                                    <input type="text" disabled readOnly
                                        className={`w-full text-center ${inputSize} px-0.5 border border-transparent rounded outline-none font-bold text-danger bg-transparent cursor-not-allowed select-none`}
                                        value="-" title="ថ្ងៃអាទិត្យ មិនអនុញ្ញាតអោយបញ្ចូលទេ" />
                                ) : (
                                    <input type="number" 
                                        className={`w-full text-center ${inputSize} px-0.5 border border-transparent hover:border-divider rounded outline-none focus:border-brand focus:ring-1 focus:ring-focus-ring/30 font-bold text-text-body bg-transparent transition-all`}
                                        value={val}
                                        onChange={(e) => handleScoreChange(s.id, col.dayNum, e.target.value)}
                                        min="0" step="0.5" />
                                )}
                            </td>
                        )
                    })}
                    
                    <td className="p-2 text-center font-bold text-success text-base group-hover:bg-success/10 sticky right-[80px] z-20 shadow-[-2px_0_5px_rgba(0,0,0,0.05)] border-l border-success/30 bg-success/10">
                        {total}
                    </td>
                    
                    {mode === 'monthly' && (
                        <td className="p-2 text-center font-bold text-brand-500 text-[15px] group-hover:bg-brand-100 sticky right-0 z-20 shadow-[-2px_0_5px_rgba(0,0,0,0.05)] border-l border-divider bg-brand-100/30">
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
                    <th rowSpan={2} className="p-2 border-b border-r border-divider bg-brand-900 text-white w-10 text-center font-bold text-sm sticky left-0 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">ល.រ</th>
                    <th rowSpan={2} className="p-2 border-b border-r border-divider bg-brand-900 text-white text-left font-bold text-sm min-w-[150px] sticky left-[40px] z-30 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">ឈ្មោះសិស្ស</th>
                    <th rowSpan={2} className="p-2 border-b border-r border-divider bg-brand-800 text-white w-14 text-center font-bold text-sm">ភេទ</th>
                    <th colSpan={displayCols.length} className="p-1.5 border-b border-r border-divider bg-brand-700 text-white text-center font-bold text-sm">{dateLabel}</th>
                    <th rowSpan={2} className="p-2 border-b border-success/40 bg-success text-white w-[80px] min-w-[80px] text-center font-bold text-sm sticky right-[80px] z-30 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">សរុប</th>
                    {mode === 'monthly' && (
                        <th rowSpan={2} className="p-2 border-b border-brand-400 bg-brand-500 text-white w-[80px] min-w-[80px] text-center font-bold text-sm sticky right-0 z-30 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">មធ្យមភាគ</th>
                    )}
                </tr>
                <tr>
                    {displayCols.map(col => {
                        const bg = col.isSunday ? 'bg-danger/80 text-white' : 'bg-brand text-brand-100'
                        const minW = mode === 'daily' ? 'min-w-[80px]' : 'min-w-[34px]'
                        const textSize = mode === 'daily' ? 'text-[14px]' : 'text-[11px]'
                        return (
                            <th key={col.dayNum} className={`py-1.5 px-0.5 border-b border-r border-divider/30 ${bg} text-center font-bold ${textSize} ${minW}`}>
                                {col.dayNum}
                            </th>
                        )
                    })}
                </tr>
            </>
        )
    }

    const monthLabel = MONTHS_BY_ACADEMIC_YEAR.find(m => m.id === monthSelect)?.label ?? ''
    const femaleTotal = students.filter(s => s.gender === 'ស្រី' || s.gender === 'F').length

    return (
        <div className="relative flex flex-col text-text-heading">
            <div data-hw-chrome className="bg-animate pointer-events-none absolute inset-0 z-[-1] opacity-60 bg-[radial-gradient(circle_at_10%_20%,var(--brand-100)_0%,transparent_40%),radial-gradient(circle_at_90%_80%,var(--color-success)_0%,transparent_40%),radial-gradient(circle_at_50%_50%,var(--color-gold)_0%,transparent_40%)]"></div>

            {/* Printable monthly score sheet — `homework/print-score.html` restored. */}
            <div className="hidden print:block">
                <div className="mb-4 flex items-start justify-between">
                    <div className="kh-moul text-[10pt] leading-relaxed" style={{ marginTop: '24pt' }}>
                        <p>{settings?.management_unit_1 || 'មន្ទីរអប់រំ យុវជន និងកីឡា...'}</p>
                        <p>{settings?.management_unit_2 || 'ការិយាល័យអប់រំ យុវជន និងកីឡា...'}</p>
                        <p>{settings?.school_name || 'សាលា...'}</p>
                    </div>
                    <div className="text-center">
                        <h3 className="kh-moul mb-1 text-[12pt]">ព្រះរាជាណាចក្រកម្ពុជា</h3>
                        <h3 className="kh-moul mb-1 text-[12pt]">ជាតិ សាសនា ព្រះមហាក្សត្រ</h3>
                    </div>
                </div>

                <h2 className="kh-moul mb-1 text-center text-[13pt] uppercase">
                    របាយការណ៍ពិន្ទុកិច្ចការផ្ទះប្រចាំខែ{monthLabel}
                </h2>
                <p className="mb-3 text-center text-[10pt]">កាលបរិច្ឆេទ ២៦ ដល់ ២៥ · ឆ្នាំសិក្សា {yearSelect}</p>

                <div className="mb-2 flex justify-between text-[10pt] font-bold">
                    <p>សិស្សសរុប {toKhmerNumber(students.length)} នាក់ · ស្រី {toKhmerNumber(femaleTotal)} នាក់</p>
                    <p>ថ្នាក់ទី៖ {settings?.class_name || '..........'}</p>
                </div>

                <table className="hw-print-table">
                    <thead>
                        <tr>
                            <th rowSpan={2} className="w-7">ល.រ</th>
                            <th rowSpan={2} className="min-w-[130px] text-left">គោត្តនាម និងនាម</th>
                            <th rowSpan={2} className="w-9">ភេទ</th>
                            <th colSpan={dateColumns.length}>កាលបរិច្ឆេទ (២៦ ដល់ ២៥)</th>
                            <th rowSpan={2} className="w-12">សរុប</th>
                            <th rowSpan={2} className="w-14">មធ្យមភាគ</th>
                        </tr>
                        <tr>
                            {dateColumns.map(col => (
                                <th key={col.dayNum} className={col.isSunday ? 'sun' : ''}>{col.dayNum}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {students.map((s, i) => {
                            const { total, average } = getStudentTotals(s.id)
                            return (
                                <tr key={s.id}>
                                    <td>{toKhmerNumber(i + 1)}</td>
                                    <td className="text-left font-bold">{s.name_kh}</td>
                                    <td>{s.gender}</td>
                                    {dateColumns.map(col => (
                                        <td key={col.dayNum} className={col.isSunday ? 'sun' : ''}>
                                            {scores[s.id]?.[col.dayNum] ?? ''}
                                        </td>
                                    ))}
                                    <td className="font-bold">{total}</td>
                                    <td className="font-bold">{average}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>

                <div className="mt-8 flex justify-between text-[10pt]">
                    <div className="text-center">
                        <p className="kh-moul uppercase">{settings?.manager_role || 'នាយកសាលា'}</p>
                        <p className="mt-14">{settings?.manager_name || settings?.director_name || ''}</p>
                    </div>
                    <div className="text-center">
                        <p className="mb-1">
                            ធ្វើនៅ {settings?.province_date || settings?.province_for_date || '..............'}, ថ្ងៃទី....... ខែ........... ឆ្នាំ២០២...
                        </p>
                        <p className="kh-moul">គ្រូបន្ទុកថ្នាក់</p>
                        <p className="mt-10">{settings?.homeroom_teacher || settings?.teacher_name || ''}</p>
                    </div>
                </div>
            </div>

            <div data-hw-chrome className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6">
                
                {/* Header Section */}
                <div className="bg-bg-surface/80 backdrop-blur-md p-4 md:p-5 rounded-xl shadow-sm border border-divider flex flex-col gap-4 shrink-0">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        {/* Title & Back */}
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <div className="rounded-xl bg-brand p-3 text-brand-contrast shadow-lg">
                                <BookMarked className="w-6 h-6" />
                            </div>
                            <div>
                                <h1 className="text-xl md:text-2xl kh-moul text-text-heading">បញ្ចូលពិន្ទុកិច្ចការផ្ទះ</h1>
                                <p className="text-text-muted font-medium text-xs md:text-sm">បញ្ចូលពិន្ទុកិច្ចការផ្ទះ ធ្វើសមកាលកម្មដោយស្វ័យប្រវត្តិ</p>
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
                                    
                                    <div className="flex items-center bg-bg-surface border border-divider rounded-xl overflow-hidden shadow-sm h-[38px]">
                                        <input 
                                            type="number" 
                                            value={bulkScore}
                                            onChange={(e) => setBulkScore(e.target.value)}
                                            className="w-16 h-full px-2 text-center text-sm font-bold text-text-body outline-none" 
                                            placeholder="ពិន្ទុ" min="0" step="0.5" 
                                        />
                                        <button 
                                            onClick={fillAllScores}
                                            className={`h-full px-3 font-bold text-[13px] flex items-center gap-1 transition-colors whitespace-nowrap border-l border-divider ${showBulkSuccess ? 'bg-success/10 text-success' : 'bg-brand-100 text-brand hover:bg-brand-100'}`}
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
                                onChange={(v) => switchTo(() => setMonthSelect(v))}
                                options={MONTHS_BY_ACADEMIC_YEAR.map(m => ({
                                    value: m.id,
                                    label: `ខែ${m.label} ឆ្នាំ ${m.isNextYear ? yearSelect.split('-')[1] : yearSelect.split('-')[0]}`,
                                }))}
                                leadingIcon={<Clock />}
                            />

                            {/* Year Select */}
                            <Select
                                ariaLabel="ឆ្នាំសិក្សា"
                                value={yearSelect}
                                onChange={(v) => switchTo(() => setYearSelect(v))}
                                options={academicYearOptions}
                                leadingIcon={<CalendarDays />}
                            />

                            <div className="w-px h-8 bg-divider mx-1 hidden sm:block"></div>

                            {/* Save Button */}
                            <button 
                                onClick={handleSave} 
                                disabled={isSaving}
                                className={`flex min-h-11 items-center gap-2 rounded-xl px-5 py-2.5 font-bold shadow-lg transition-all hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60 ${showSuccess ? 'bg-success text-white' : 'bg-brand text-brand-contrast hover:bg-brand-hover'}`}
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : (showSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />)}
                                <span>{showSuccess ? 'ជោគជ័យ' : 'រក្សាទុក'}</span>
                            </button>

                            {/*
                              Printing always renders the full month, whichever tab
                              is on screen: a one-day sheet is not a report anyone
                              files, and the ministry form is the 26th-to-25th grid.
                            */}
                            <button
                                onClick={() => window.print()}
                                className="tap-target flex items-center gap-2 rounded-xl border border-divider bg-bg-surface px-5 py-2.5 font-bold text-text-heading shadow-sm transition-all hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                            >
                                <Printer className="w-4 h-4" />
                                <span>បោះពុម្ព</span>
                            </button>
                        </div>
                    </div>

                    <div className="bg-warning/10 border border-warning/30 text-warning px-4 py-3 rounded-xl text-sm flex items-start gap-3">
                        <Info className="w-5 h-5 min-w-[20px] text-warning mt-0.5" />
                        <div>
                            <span className="font-bold">បញ្ជាក់៖</span> ពិន្ទុកិច្ចការផ្ទះត្រូវបូកសរុបចាប់ពី <b>ថ្ងៃទី ២៦ នៃខែចាស់</b> រហូតដល់ <b>ថ្ងៃទី ២៥ នៃខែបច្ចុប្បន្ន</b>។
                        </div>
                    </div>
                </div>

                {/* Section Tabs */}
                <div className="flex items-center justify-between gap-4 shrink-0 -mb-2 z-10">
                    <div className="flex p-1 bg-bg-surface/80 backdrop-blur-md rounded-xl shadow-sm border border-divider/60 w-full sm:w-auto">
                        <button 
                            onClick={() => setCurrentTab('daily')} 
                            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm shadow-md transition-all ${currentTab === 'daily' ? 'bg-brand text-white' : 'text-text-body hover:text-brand hover:bg-paper shadow-none'}`}
                        >
                            <CalendarCheck className="w-4 h-4" /> បញ្ចូលប្រចាំថ្ងៃ
                        </button>
                        <button 
                            onClick={() => setCurrentTab('monthly')} 
                            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${currentTab === 'monthly' ? 'bg-brand text-white shadow-md' : 'text-text-body hover:text-brand hover:bg-paper'}`}
                        >
                            <TableProperties className="w-4 h-4" /> ពិនិត្យប្រចាំខែ
                        </button>
                    </div>
                </div>

                {/* Table Container */}
                <div className="flex-1 bg-bg-surface/95 backdrop-blur-xl rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-divider overflow-hidden flex flex-col relative min-h-0">
                    <div className="flex-1 overflow-auto custom-scrollbar relative">
                        {isLoading ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-brand-500 h-full gap-3 mt-10">
                                <Loader2 className="w-10 h-10 animate-spin opacity-80" />
                                <p className="font-bold">កំពុងទាញយកទិន្នន័យ...</p>
                            </div>
                        ) : students.length === 0 ? (
                            <div className="p-8 mt-10 text-center text-text-muted flex flex-col items-center justify-center gap-2">
                                <Users className="w-10 h-10 opacity-50 mb-2" />
                                <p>មិនមានទិន្នន័យសិស្សទេ។ សូមទៅកាន់បញ្ជីឈ្មោះសិស្សដើម្បីបញ្ចូលជាមុនសិន។</p>
                            </div>
                        ) : currentTab === 'daily' ? (
                            <div className="grid grid-cols-1 xl:grid-cols-2 bg-paper min-h-full">
                                <div className="border-b xl:border-b-0 xl:border-r border-divider">
                                    <table className="w-full border-collapse">
                                        <thead>{renderThead('daily')}</thead>
                                        <tbody className="bg-bg-surface text-sm">{renderTbody(leftStudents, 0, 'daily')}</tbody>
                                    </table>
                                </div>
                                <div>
                                    <table className="w-full border-collapse">
                                        <thead>{renderThead('daily')}</thead>
                                        <tbody className="bg-bg-surface text-sm">{renderTbody(rightStudents, half, 'daily')}</tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <table className="w-full border-collapse">
                                <thead>{renderThead('monthly')}</thead>
                                <tbody className="bg-bg-surface text-sm">{renderTbody(students, 0, 'monthly')}</tbody>
                            </table>
                        )}
                    </div>
                    
                    {/* Footer Stats */}
                    <div className="p-3 bg-bg-surface border-t border-divider flex justify-between items-center text-sm text-text-muted shrink-0">
                        <span className="font-bold text-brand">សិស្សសរុប៖ {students.length} នាក់ (ស្រី {femaleCount})</span>
                        <span className="italic text-xs bg-paper px-2 py-1 rounded flex items-center gap-1">
                            <Check className="w-3 h-3 text-brand-500" /> រួចរាល់សម្រាប់ធ្វើសមកាលកម្ម
                        </span>
                    </div>
                </div>
            </div>
            
            <style jsx global>{`
                @media print {
                    @page { size: A4 landscape; margin: 8mm; }
                    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    /* The entry grid is a screen tool: it scrolls sideways and
                       carries sticky columns that print as overlapping ink. */
                    [data-hw-chrome] { display: none !important; }
                }
                .hw-print-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
                .hw-print-table th, .hw-print-table td { border: 1px solid #444; padding: 1px 2px; text-align: center; }
                .hw-print-table th { background-color: #f1f5f9; font-weight: 700; }
                .hw-print-table .sun { background-color: #fff1f1; }

                input[type="number"]::-webkit-inner-spin-button,
                input[type="number"]::-webkit-outer-spin-button {
                    -webkit-appearance: none; margin: 0;
                }
                .custom-scrollbar::-webkit-scrollbar { height: 10px; width: 10px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: var(--paper); }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--divider); border-radius: 5px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
            `}</style>

            {dialog}
        </div>
    )
}
