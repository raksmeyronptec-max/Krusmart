'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/actions/Button'
import { Calendar, Award, GraduationCap, CalendarDays, Clock, Bookmark, Settings2, Lock, Unlock, Printer, CloudUpload, Table2, Menu, X, Loader2, Check } from 'lucide-react'
import { notify } from '@/components/ui/feedback/notify'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import { getAllScoresByPeriod } from './actions'
import { saveScores } from '../enter/actions'
import Select from '@/components/ui/forms/Select'
import type { Score, ScoreInput, Student } from '@/lib/types'
import { MONTHS_BY_ACADEMIC_YEAR } from '@/lib/constants/months'
import { appliesTo } from '@/lib/storage/custom-subjects'
import { useCustomSubjects } from '@/lib/hooks/useCustomSubjects'
import { letterFor } from '@/lib/grading/scheme'
import { scoreCellValue } from '@/lib/utils/score-value'

/**
 * A student decorated with the per-period scores and every derived total the
 * three modes (monthly / semester / annual) compute.
 */
type TotalledStudent = Student & {
    scores: Record<string, number | string | null>
    total: number
    average: string
    finalAverageForRank: number
    rank: number
    annualTotal: number
    annualAverage: string
    examTotal: number
    examAverage: string
    monthlyAverage: string
    semesterAverage: string
}

/** A column of the totals grid, covering every shape the `config` literal uses. */
interface GridColumn {
    key: string
    label: string
    color: string
    isText?: boolean
    options?: string[]
    readOnly?: boolean
}

const behaviorOptions = ['ល្អ', 'ល្អបង្គួរ', 'មធ្យម', 'ខ្សោយ']

const config = {
    monthly: {
        groups: [
            { name: 'ភាសាខ្មែរ', cols: 7, color: 'bg-brand-800' },
            { name: 'គណិតវិទ្យា', cols: 5, color: 'bg-brand-700' },
            { name: 'វិទ្យាសាស្ត្រ', cols: 5, color: 'bg-brand-800' },
            { name: 'សិក្សាសង្គម', cols: 4, color: 'bg-brand-700' },
            { name: 'អប់រំសុខភាព', cols: 2, color: 'bg-brand-800' },
            { name: 'ផ្សេងៗ', cols: 2, color: 'bg-brand-700' },
            { name: 'ការបំពេញបន្ថែម', cols: 4, color: 'bg-brand-800' }
        ],
        columns: [
            { key: 'kh_listen', label: 'សមត្ថភាពស្តាប់', color: 'bg-brand-800/90' }, { key: 'kh_speak', label: 'សមត្ថភាពនិយាយ', color: 'bg-brand-800/90' },
            { key: 'kh_read', label: 'សមត្ថភាពអាន', color: 'bg-brand-800/90' }, { key: 'kh_write', label: 'សមត្ថភាពសរសេរ', color: 'bg-brand-800/90' },
            { key: 'kh_calligraphy', label: 'សមត្ថភាពអក្សរផ្ចង់', color: 'bg-brand-800/90' }, { key: 'kh_recitation', label: 'មេសូត្រ', color: 'bg-brand-800/90' }, { key: 'kh_essay', label: 'តែងសេចក្តី', color: 'bg-brand-800/90' },
            { key: 'math_num', label: 'សមត្ថភាពចំនួន', color: 'bg-brand-700/90' }, { key: 'math_meas', label: 'រង្វាស់រង្វាល់', color: 'bg-brand-700/90' },
            { key: 'math_geo', label: 'ធរណីមាត្រ', color: 'bg-brand-700/90' }, { key: 'math_alg', label: 'ពីជគណិត', color: 'bg-brand-700/90' },
            { key: 'math_stat', label: 'ស្ថិតិ', color: 'bg-brand-700/90' },
            { key: 'sci_phy', label: 'រូបវិទ្យា', color: 'bg-brand-800/90' }, { key: 'sci_chem', label: 'គីមីវិទ្យា', color: 'bg-brand-800/90' },
            { key: 'sci_bio', label: 'ជីវវិទ្យា', color: 'bg-brand-800/90' }, { key: 'sci_earth', label: 'ផែនដីវិទ្យា', color: 'bg-brand-800/90' }, { key: 'sci_applied', label: 'អនុវត្តន៍', color: 'bg-brand-800/90' },
            { key: 'soc_ethic', label: 'សីលធម៌', color: 'bg-brand-700/90' }, { key: 'soc_geo', label: 'ភូមិវិទ្យា', color: 'bg-brand-700/90' },
            { key: 'soc_hist', label: 'ប្រវត្តិវិទ្យា', color: 'bg-brand-700/90' }, { key: 'soc_home', label: 'គេហវិទ្យា', color: 'bg-brand-700/90' },
            { key: 'pe_sport', label: 'អប់រំកាយ', color: 'bg-brand-800/90' }, { key: 'health_hygiene', label: 'សុខភាព', color: 'bg-brand-800/90' },
            { key: 'life_skill', label: 'បំណិនជីវិត', color: 'bg-brand-700/90' }, { key: 'foreign', label: 'ភាសាបរទេស', color: 'bg-brand-700/90' },
            { key: 'ex_oral', label: 'ផ្ទាល់មាត់', color: 'bg-brand-800/90' }, { key: 'ex_att', label: 'អវត្តមាន', color: 'bg-brand-800/90' },
            { key: 'ex_book', label: 'សៀវភៅ', color: 'bg-brand-800/90' }, { key: 'ex_hw', label: 'កិច្ចការផ្ទះ', color: 'bg-brand-800/90' }
        ]
    },
    semester: {
        groups: [
            { name: 'ភាសាខ្មែរ', cols: 4, color: 'bg-brand-800' },
            { name: 'គណិត & វិទ្យាសាស្ត្រ', cols: 2, color: 'bg-brand-700' },
            { name: 'សិក្សាសង្គម', cols: 4, color: 'bg-brand-800' },
            { name: 'មុខវិជ្ជាទូទៅ', cols: 3, color: 'bg-brand-700' },
            { name: 'អាកប្បកិរិយា', cols: 4, color: 'bg-brand-500' }
        ],
        columns: [
            { key: 'sem_kh_reading', label: 'អំណាន', color: 'bg-brand-800/90' },
            { key: 'sem_kh_listening_speaking', label: 'ស្តាប់-និយាយ', color: 'bg-brand-800/90' }, 
            { key: 'sem_kh_dictation', label: 'សរសេរតាមអាន', color: 'bg-brand-800/90' },
            { key: 'sem_kh_essay', label: 'តែងសេចក្តី', color: 'bg-brand-800/90' },
            { key: 'sem_math', label: 'គណិតវិទ្យា', color: 'bg-brand-700/90' }, { key: 'sem_science', label: 'វិទ្យាសាស្ត្រ', color: 'bg-brand-700/90' },
            { key: 'sem_moral_civics', label: 'សីលធម៌', color: 'bg-brand-800/90' }, { key: 'sem_geo', label: 'ភូមិវិទ្យា', color: 'bg-brand-800/90' },
            { key: 'sem_hist', label: 'ប្រវត្តិវិទ្យា', color: 'bg-brand-800/90' }, { key: 'sem_home_arts', label: 'គេហវិទ្យា', color: 'bg-brand-800/90' },
            { key: 'sem_life_skills', label: 'បំណិនជីវិត', color: 'bg-brand-700/90' }, { key: 'sem_foreign', label: 'ភាសាបរទេស', color: 'bg-brand-700/90' },
            { key: 'sem_sport', label: 'កីឡា', color: 'bg-brand-700/90' },
            { key: 'sem_eval_knowledge', label: 'ចំណេះដឹង', color: 'bg-brand-500/90', isText: true, options: behaviorOptions },
            { key: 'sem_eval_skill', label: 'បំណិន-ចំណេះធ្វើ', color: 'bg-brand-500/90', isText: true, options: behaviorOptions },
            { key: 'sem_eval_moral', label: 'តម្លៃ-សីលធម៌', color: 'bg-brand-500/90', isText: true, options: behaviorOptions },
            { key: 'sem_eval_participate', label: 'សាមគ្គីភាព', color: 'bg-brand-500/90', isText: true, options: behaviorOptions }
        ]
    },
    annual: {
        groups: [
            { name: 'ពិន្ទុមធ្យមភាគប្រចាំឆមាស', cols: 2, color: 'bg-brand-800' }
        ],
        columns: [
            { key: 'sem1_avg', label: 'មធ្យមភាគ ឆមាសទី១', color: 'bg-brand-700/90', readOnly: true },
            { key: 'sem2_avg', label: 'មធ្យមភាគ ឆមាសទី២', color: 'bg-brand-700/90', readOnly: true }
        ]
    }
}

export default function ScoreTotalClient({ initialStudents}: { initialStudents: Student[] }) {
    const [currentMode, setCurrentMode] = useState<'monthly' | 'semester' | 'annual'>('monthly')
    // Was a hard-coded `'2025-2026'`, which quietly became the wrong year
    // every November.
    const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear)
    const [month, setMonth] = useState('nov')
    const [semester, setSemester] = useState('sem1')

    const academicYearOptions = useMemo(() => {
        const start = parseInt(getCurrentAcademicYear().split('-')[0], 10)
        return [start - 1, start, start + 1].map((y) => `${y}-${y + 1}`)
    }, [])

    const [isEditLocked, setIsEditLocked] = useState(true)
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [loading, setLoading] = useState(false)

    // Data state
    const [studentsData, setStudentsData] = useState<TotalledStudent[]>([])

    // Semester specific
    const [selectedSemesterMonths, setSelectedSemesterMonths] = useState(['nov', 'dec', 'jan', 'feb', 'mar'])
    const [isMonthModalOpen, setIsMonthModalOpen] = useState(false)
    
    // We fetch all needed data to calculate semester and annual averages. 
    // To keep it simple in this mock, we just fetch for the current mode/period.
    // In a real scenario, semester needs monthly averages too.

    // Supabase-backed since migration 00012 (was localStorage `custom_subjects`).
    const { subjects: customSubjects } = useCustomSubjects()

    useEffect(() => {
        const stored = customSubjects
        if (stored.length > 0) {
            const monthlyCustomCols: { key: string; label: string; color: string }[] = []
            const semesterCustomCols: { key: string; label: string; color: string }[] = []

            stored.forEach(sub => {
                sub.columns.forEach(col => {
                    const newCol = { key: col.id, label: col.label, color: 'bg-brand/90' }
                    if (appliesTo(sub, 'monthly')) {
                        if (!config.monthly.columns.find(c => c.key === col.id)) monthlyCustomCols.push(newCol)
                    }
                    if (appliesTo(sub, 'semester')) {
                        if (!config.semester.columns.find(c => c.key === col.id)) semesterCustomCols.push(newCol)
                    }
                })
            })

            if (monthlyCustomCols.length > 0) {
                config.monthly.columns.push(...monthlyCustomCols)
                const customGroup = config.monthly.groups.find(g => g.name === 'មុខវិជ្ជាបន្ថែម')
                if (customGroup) customGroup.cols += monthlyCustomCols.length
                else config.monthly.groups.push({ name: 'មុខវិជ្ជាបន្ថែម', cols: monthlyCustomCols.length, color: 'bg-brand-600' })
            }

            if (semesterCustomCols.length > 0) {
                config.semester.columns.push(...semesterCustomCols)
                const customGroup = config.semester.groups.find(g => g.name === 'មុខវិជ្ជាបន្ថែម')
                if (customGroup) customGroup.cols += semesterCustomCols.length
                else config.semester.groups.push({ name: 'មុខវិជ្ជាបន្ថែម', cols: semesterCustomCols.length, color: 'bg-brand-600' })
            }
        }
    }, [customSubjects])

    // Derived from `currentMode`; it was mirrored into state and re-synced by an effect.
    const currentConfig = config[currentMode]

    const getScorePeriod = useCallback(() => {
        if (currentMode === 'monthly') return `${month}-${academicYear}`
        if (currentMode === 'semester') return `${semester}-${academicYear}`
        return `annual-${academicYear}`
    }, [currentMode, academicYear, month, semester])

    const loadData = useCallback(async () => {
        setLoading(true)
        const period = getScorePeriod()
        const records = await getAllScoresByPeriod(currentMode, period)
        
        const monthlyAverages: Record<string, { totalAvg: number; count: number }> = {}
        if (currentMode === 'semester') {
            for (const m of selectedSemesterMonths) {
                const mPeriod = `${m}-${academicYear}`
                const mRecords = await getAllScoresByPeriod('monthly', mPeriod)
                
                const mSum: Record<string, number> = {}
                const mCount: Record<string, number> = {}
                
                mRecords.forEach((r: Score) => {
                    const val = parseFloat(String(r.score_value))
                    if (!isNaN(val)) {
                        mSum[r.student_id] = (mSum[r.student_id] || 0) + val
                        mCount[r.student_id] = (mCount[r.student_id] || 0) + 1
                    }
                })
                
                Object.keys(mSum).forEach(sid => {
                    const mAvg = mSum[sid] / mCount[sid]
                    if (!monthlyAverages[sid]) monthlyAverages[sid] = { totalAvg: 0, count: 0 }
                    monthlyAverages[sid].totalAvg += mAvg
                    monthlyAverages[sid].count += 1
                })
            }
        }
        
        const processedStudents: TotalledStudent[] = initialStudents.map(stu => {
            const studentScores: Record<string, number | string | null> = {}
            records.filter(r => r.student_id === stu.id).forEach(r => {
                studentScores[r.subject] = scoreCellValue(r)
            })

            // The derived fields are all overwritten by the calculation pass below.
            return {
                ...stu,
                scores: studentScores,
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
        })

        // Calculation logic
        processedStudents.forEach(stu => {
            let sum = 0
            let scoredSubjectsCount = 0

            config[currentMode].columns.forEach((col: GridColumn) => {
                if(col.isText) return
                const rawVal = stu.scores[col.key]
                if (rawVal !== null && rawVal !== undefined && rawVal !== "") {
                    const val = parseFloat(String(rawVal))
                    if (!isNaN(val)) {
                        sum += val
                        scoredSubjectsCount++
                    }
                }
            })
            
            if (currentMode === 'monthly') {
                stu.total = sum
                stu.average = scoredSubjectsCount > 0 ? (sum / scoredSubjectsCount).toFixed(2) : "0.00"
                stu.finalAverageForRank = parseFloat(stu.average)
            } else if (currentMode === 'annual') {
                const s1 = parseFloat(String(stu.scores['sem1_avg'] ?? '0'))
                const s2 = parseFloat(String(stu.scores['sem2_avg'] ?? '0'))
                
                let div = 0
                if (!isNaN(s1) && s1 > 0) div++
                if (!isNaN(s2) && s2 > 0) div++
                
                stu.annualTotal = (isNaN(s1) ? 0 : s1) + (isNaN(s2) ? 0 : s2)
                
                if (div === 0) {
                    stu.annualAverage = "0.00"
                } else if (div === 1) {
                    stu.annualAverage = (stu.annualTotal).toFixed(2)
                } else {
                    stu.annualAverage = (stu.annualTotal / 2).toFixed(2)
                }
                
                stu.finalAverageForRank = parseFloat(stu.annualAverage)
                stu.total = stu.annualTotal
                stu.average = stu.annualAverage
            } else { 
                stu.examTotal = sum
                stu.examAverage = scoredSubjectsCount > 0 ? (sum / scoredSubjectsCount).toFixed(2) : "0.00"
                
                let finalMonthlyAvg = 0
                if (monthlyAverages[stu.id] && monthlyAverages[stu.id].count > 0) {
                    finalMonthlyAvg = monthlyAverages[stu.id].totalAvg / monthlyAverages[stu.id].count
                }
                stu.monthlyAverage = finalMonthlyAvg.toFixed(2) 
                
                let semAvg = (parseFloat(stu.examAverage) + finalMonthlyAvg) / 2
                if (scoredSubjectsCount === 0 && finalMonthlyAvg === 0) semAvg = 0
                
                stu.semesterAverage = semAvg.toFixed(2)
                stu.finalAverageForRank = semAvg
                
                stu.total = stu.examTotal
                stu.average = stu.semesterAverage
            }

            stu.grade = letterFor(stu.finalAverageForRank)
        })

        // Rank
        processedStudents.sort((a, b) => b.finalAverageForRank - a.finalAverageForRank)
        let currentRank = 1
        for (let i = 0; i < processedStudents.length; i++) {
            if (i > 0 && processedStudents[i].finalAverageForRank < processedStudents[i-1].finalAverageForRank) {
                currentRank = i + 1
            }
            processedStudents[i].rank = currentRank
        }
        
        // sort back by created_at or name if preferred, or keep ranked. Let's sort by ID to match enter UI or keep rank. Old UI kept it by ID or Name originally, but visually it showed rank.
        processedStudents.sort((a,b) => a.id.localeCompare(b.id)) 

        setStudentsData(processedStudents)
        setLoading(false)
    }, [currentMode, academicYear, selectedSemesterMonths, initialStudents, getScorePeriod])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is set after await, not synchronously during the effect
        loadData()
    }, [loadData])



    const handleScoreChange = (stuId: string, colKey: string, val: string) => {
        if (isEditLocked) return
        setStudentsData(prev => prev.map(stu => {
            if (stu.id === stuId) {
                const newStu = { ...stu, scores: { ...stu.scores, [colKey]: val } }
                // Re-calculate simple total/avg on the fly just for this student (omitting full re-rank for performance)
                return newStu
            }
            return stu
        }))
    }

    const handleSave = async () => {
        setLoading(true)
        const payload: ScoreInput[] = []
        const period = getScorePeriod()
        
        studentsData.forEach(stu => {
            currentConfig.columns.forEach((col: GridColumn) => {
                if(col.readOnly) return
                payload.push({
                    student_id: stu.id,
                    subject: col.key,
                    // `?? null`, not `|| null`: a mark of 0 is falsy, and `||`
                    // silently turned it into "no mark entered".
                    score_value: stu.scores[col.key] ?? null
                })
            })
        })

        const res = await saveScores(currentMode, period, payload)
        if (res.error) {
            notify.error('បរាជ័យក្នុងការរក្សាទុកពិន្ទុ៖ ' + res.error)
        } else {
            notify.success('រក្សាទុកពិន្ទុបានជោគជ័យ')
            loadData() // re-calculate ranks
        }
        setLoading(false)
    }

    const getGradeColor = (grade: string) => {
        if (grade === 'A') return 'text-success bg-success/10'
        if (grade === 'B') return 'text-brand bg-brand-100'
        if (grade === 'C') return 'text-warning bg-warning/10'
        if (grade === 'D') return 'text-warning bg-warning/10'
        return 'text-danger bg-danger/10'
    }

    return (
        <div className="bg-paper min-h-screen text-text-heading font-battambang relative z-0">
            <style jsx global>{`
                .font-battambang { font-family: 'Battambang', cursive; }
                
                .sticky-col-1 { position: sticky; left: 0; z-index: 40; background-color: white; border-right: 1px solid var(--divider); }
                .sticky-col-2 { position: sticky; left: 40px; z-index: 40; background-color: white; border-right: 2px solid var(--divider); box-shadow: 2px 0 5px rgba(0,0,0,0.05); }
                @media (min-width: 768px) {
                    .sticky-col-1 { width: 50px; }
                    .sticky-col-2 { left: 50px; }
                }
                
                thead { position: sticky; top: 0; z-index: 50; }
                thead th { position: sticky; top: 0; z-index: 50; }
                thead th.sticky-col-1 { z-index: 60; }
                thead th.sticky-col-2 { z-index: 60; }

                input[type="number"]::-webkit-inner-spin-button, 
                input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }

                tr:hover td { background-color: var(--brand-100); }
                tr:hover td.sticky-col-1, tr:hover td.sticky-col-2 { background-color: var(--brand-100); }
            `}</style>

            <div className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-60" style={{ background: 'radial-gradient(circle at 10% 20%, var(--brand-100) 0%, transparent 40%), radial-gradient(circle at 90% 80%, var(--color-success) 0%, transparent 40%), radial-gradient(circle at 50% 50%, var(--color-gold) 0%, transparent 40%)' }}></div>

            <div className="relative z-10 mx-auto flex w-full max-w-full flex-col px-2 py-2 lg:max-w-[98%] lg:py-4">
                {/* Header & Toolbar */}
                <div className="mb-2 lg:mb-4 bg-bg-surface/80 backdrop-blur-md p-3 lg:p-4 rounded-xl shadow-sm border border-divider flex flex-col transition-all duration-300">
                    <div className="flex justify-between items-center w-full">
                        <div className="flex items-center gap-2 lg:gap-4">
                            <div className="bg-brand p-2 lg:p-3 rounded-xl shadow-lg text-brand-contrast shrink-0 hidden sm:block">
                                <Table2 className="w-5 h-5 lg:w-6 lg:h-6" />
                            </div>
                            <div>
                                <h1 className="text-lg sm:text-xl md:text-2xl kh-moul text-brand leading-tight">តារាងពិន្ទុសិស្សសរុប</h1>
                                <p className="text-text-muted font-medium text-[10px] sm:text-xs md:text-sm">Score Master Sheet</p>
                            </div>
                        </div>
                        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="lg:hidden p-2 bg-paper text-text-body rounded-xl hover:bg-divider transition shrink-0 border border-divider">
                            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>

                    <div className={`${isMenuOpen ? 'flex' : 'hidden'} lg:flex flex-col lg:flex-row justify-end items-stretch lg:items-center gap-4 mt-4 lg:mt-0 pt-4 lg:pt-0 border-t lg:border-t-0 border-divider`}>
                        <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-3 w-full lg:w-auto">
                            
                            {/* Mode */}
                            <div className="flex bg-paper p-1 rounded-xl w-full xl:w-auto">
                                <button onClick={() => setCurrentMode('monthly')} className={`p-2 rounded-xl text-sm font-bold transition flex flex-1 items-center justify-center gap-2 ${currentMode === 'monthly' ? 'bg-brand text-white shadow' : 'bg-bg-surface text-text-muted'}`}>
                                    <Calendar className="w-4 h-4 hidden sm:block" /> ប្រចាំខែ
                                </button>
                                <button onClick={() => setCurrentMode('semester')} className={`p-2 rounded-xl text-sm font-bold transition flex flex-1 items-center justify-center gap-2 ${currentMode === 'semester' ? 'bg-brand text-white shadow' : 'bg-bg-surface text-text-muted'}`}>
                                    <Award className="w-4 h-4 hidden sm:block" /> ឆមាស
                                </button>
                                <button onClick={() => setCurrentMode('annual')} className={`p-2 rounded-xl text-sm font-bold transition flex flex-1 items-center justify-center gap-2 ${currentMode === 'annual' ? 'bg-brand text-white shadow' : 'bg-bg-surface text-text-muted'}`}>
                                    <GraduationCap className="w-4 h-4 hidden sm:block" /> ឆ្នាំ
                                </button>
                            </div>

                            {/* Filters */}
                            <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
                                <Select
                                    ariaLabel="ឆ្នាំសិក្សា"
                                    value={academicYear}
                                    onChange={setAcademicYear}
                                    options={academicYearOptions}
                                    leadingIcon={<CalendarDays />}
                                    wrapperClassName="w-full sm:w-auto"
                                />

                                {currentMode === 'monthly' && (
                                    <Select
                                        ariaLabel="ខែ"
                                        value={month}
                                        onChange={setMonth}
                                        options={MONTHS_BY_ACADEMIC_YEAR.map(m => ({ value: m.id, label: m.label }))}
                                        leadingIcon={<Clock />}
                                        wrapperClassName="w-full sm:w-auto"
                                    />
                                )}

                                {currentMode === 'semester' && (
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto">
                                        <Select
                                            ariaLabel="ឆមាស"
                                            value={semester}
                                            onChange={setSemester}
                                            options={[
                                                { value: 'sem1', label: 'ឆមាសទី១' },
                                                { value: 'sem2', label: 'ឆមាសទី២' },
                                            ]}
                                            leadingIcon={<Bookmark />}
                                            wrapperClassName="w-full sm:w-auto"
                                        />
                                        <Button variant="secondary" printHidden={false} onClick={() => setIsMonthModalOpen(true)}>
                                            <Settings2 className="w-4 h-4 text-brand-500" />
                                            <span>ជ្រើសរើសខែបូកបញ្ចូល</span>
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <div className="w-full h-px bg-divider my-1 xl:w-px xl:h-8 xl:my-0 hidden xl:block"></div>

                            {/* Actions */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full xl:w-auto mt-2 xl:mt-0">
                                <button onClick={() => setIsEditLocked(!isEditLocked)} className={`flex justify-center items-center gap-2 px-4 py-2.5 text-white rounded-xl font-bold shadow-lg transition-all w-full ${isEditLocked ? 'bg-text-muted hover:opacity-90' : 'bg-warning hover:bg-gold'}`}>
                                    {isEditLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                                    <span className="text-sm">{isEditLocked ? 'ចាក់សោរ' : 'ដោះសោរ'}</span>
                                </button>
                                <Button variant="success" printHidden={false} onClick={() => window.print()}>
                                    <Printer className="w-4 h-4" /> <span className="text-sm">បោះពុម្ព</span>
                                </Button>
                                <Button printHidden={false} onClick={handleSave}>
                                    <CloudUpload className="w-4 h-4" /> <span className="text-sm">រក្សាទុក</span>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Table Area */}
                <div className="relative flex max-h-[72vh] min-h-[320px] flex-col overflow-hidden rounded-xl border border-divider bg-bg-surface/95 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl print:max-h-none print:overflow-visible">
                    {loading && (
                        <div className="absolute inset-0 bg-bg-surface/70 z-50 flex justify-center items-center">
                            <Loader2 className="w-10 h-10 animate-spin text-brand" />
                        </div>
                    )}
                    <div className="flex-1 overflow-auto custom-scrollbar">
                        <table className="w-full border-collapse" style={{ minWidth: currentMode === 'monthly' ? '2400px' : (currentMode === 'annual' ? '600px' : '2000px') }}>
                            <thead>
                                <tr>
                                    <th rowSpan={2} className="p-2 lg:p-3 border border-brand-400 sticky-col-1 bg-brand text-white w-10 lg:w-14 z-50 text-xs">ល.រ</th>
                                    <th rowSpan={2} className="p-2 lg:p-3 border border-brand-400 sticky-col-2 bg-brand text-white min-w-[120px] lg:w-64 text-left z-50 text-xs lg:text-sm">ឈ្មោះសិស្ស</th>
                                    {currentConfig.groups.map((g, i) => (
                                        <th key={i} colSpan={g.cols} className={`p-1 lg:p-2 border border-brand-400 ${g.color} text-white text-center text-xs lg:text-sm`}>{g.name}</th>
                                    ))}
                                    <th colSpan={currentMode === 'semester' ? 6 : (currentMode === 'annual' ? 3 : 4)} className="p-1 lg:p-2 border border-brand-400 bg-gold text-white text-center text-xs lg:text-sm shadow-md z-40">លទ្ធផលសរុប</th>
                                </tr>
                                <tr>
                                    {currentConfig.columns.map((c: GridColumn) => (
                                        <th key={c.key} className={`p-1 lg:p-2 min-w-[70px] lg:min-w-[80px] border border-brand-400 ${c.color} text-white text-[10px] lg:text-xs font-normal`}>{c.label}</th>
                                    ))}
                                    {currentMode === 'semester' && (
                                        <>
                                            <th className="p-1 lg:p-2 w-16 lg:w-20 border border-brand-400 bg-gold font-bold text-[10px] lg:text-xs text-white">ពិន្ទុសរុប</th>
                                            <th className="p-1 lg:p-2 w-20 lg:w-24 border border-brand-400 bg-gold font-bold text-[10px] lg:text-[11px] leading-tight text-white">ម.ភាគ<br/>ប្រឡង</th>
                                            <th className="p-1 lg:p-2 w-20 lg:w-24 border border-brand-400 bg-gold font-bold text-[10px] lg:text-[11px] leading-tight text-white">ម.ភាគ<br/>ប្រចាំខែ</th>
                                            <th className="p-1 lg:p-2 w-20 lg:w-24 border border-brand-400 bg-gold font-bold text-[10px] lg:text-[11px] leading-tight text-white">មធ្យមភាគ<br/>ប្រចាំឆមាស</th>
                                            <th className="p-1 lg:p-2 w-16 lg:w-20 border border-brand-400 bg-gold font-bold text-[10px] lg:text-xs text-white">ចំណាត់ថ្នាក់</th>
                                            <th className="p-1 lg:p-2 w-12 lg:w-16 border border-brand-400 bg-gold font-bold text-[10px] lg:text-xs text-white">និទ្ទេស</th>
                                        </>
                                    )}
                                    {currentMode === 'annual' && (
                                        <>
                                            <th className="p-1 lg:p-2 w-24 lg:w-28 border border-brand-400 bg-gold font-bold text-[10px] lg:text-[11px] leading-tight text-white">លទ្ធផលប្រចាំឆ្នាំ</th>
                                            <th className="p-1 lg:p-2 w-20 lg:w-24 border border-brand-400 bg-gold font-bold text-[10px] lg:text-xs text-white">ចំណាត់ថ្នាក់</th>
                                            <th className="p-1 lg:p-2 w-12 lg:w-16 border border-brand-400 bg-gold font-bold text-[10px] lg:text-xs text-white">និទ្ទេស</th>
                                        </>
                                    )}
                                    {currentMode === 'monthly' && (
                                        <>
                                            <th className="p-1 lg:p-2 w-20 lg:w-24 border border-brand-400 bg-gold font-bold text-[10px] lg:text-xs text-white">សរុប</th>
                                            <th className="p-1 lg:p-2 w-20 lg:w-24 border border-brand-400 bg-gold font-bold text-[10px] lg:text-xs text-white">មធ្យម</th>
                                            <th className="p-1 lg:p-2 w-20 lg:w-24 border border-brand-400 bg-gold font-bold text-[10px] lg:text-xs text-white">ចំណាត់ថ្នាក់</th>
                                            <th className="p-1 lg:p-2 w-12 lg:w-16 border border-brand-400 bg-gold font-bold text-[10px] lg:text-xs text-white">និទ្ទេស</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="bg-bg-surface text-sm">
                                {studentsData.map((stu, index) => (
                                    <tr key={stu.id} className="hover:bg-[var(--brand-100)]">
                                        <td className="p-2 lg:p-3 border border-divider sticky-col-1 text-center font-bold text-text-muted">{index + 1}</td>
                                        <td className="p-2 lg:p-3 border border-divider sticky-col-2 font-bold text-text-heading whitespace-nowrap">{stu.name_kh || stu.full_name}</td>
                                        
                                        {currentConfig.columns.map((col: GridColumn) => {
                                            const val = stu.scores[col.key] || ''
                                            if (col.isText) {
                                                return (
                                                    <td key={col.key} className={`p-0 border border-divider relative ${isEditLocked ? 'bg-paper/50' : 'bg-success/10'}`}>
                                                        <select
                                                            disabled={isEditLocked}
                                                            value={val}
                                                            onChange={e => handleScoreChange(stu.id, col.key, e.target.value)}
                                                            className={`w-full h-full min-h-[35px] lg:min-h-[40px] p-1 text-[10px] lg:text-sm outline-none text-success font-bold bg-transparent transition-all focus:z-10 relative appearance-none ${isEditLocked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                                                            style={{ textAlignLast: 'center' }}
                                                        >
                                                            <option value="">-</option>
                                                            {col.options?.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                                                        </select>
                                                    </td>
                                                )
                                            }
                                            if (col.readOnly) {
                                                return (
                                                    <td key={col.key} className="p-0 border border-divider relative bg-paper/50 text-center text-text-muted font-bold">
                                                        {val}
                                                    </td>
                                                )
                                            }
                                            return (
                                                <td key={col.key} className={`p-0 border border-divider relative ${isEditLocked ? 'bg-paper/50' : 'bg-bg-surface'}`}>
                                                    <input 
                                                        type="number" 
                                                        step="0.01"
                                                        disabled={isEditLocked}
                                                        value={val}
                                                        onChange={e => handleScoreChange(stu.id, col.key, e.target.value)}
                                                        className={`w-full h-full min-h-[35px] lg:min-h-[40px] p-1 text-center text-[10px] lg:text-sm outline-none text-brand bg-transparent transition-all focus:z-10 relative ${isEditLocked ? 'cursor-not-allowed' : ''}`}
                                                    />
                                                </td>
                                            )
                                        })}

                                        {currentMode === 'monthly' && (
                                            <>
                                                <td className="p-1 lg:p-2 border border-divider text-center font-bold text-text-body bg-warning/10">{stu.total}</td>
                                                <td className="p-1 lg:p-2 border border-divider text-center font-bold text-brand bg-brand-100/30">{stu.average}</td>
                                                <td className="p-1 lg:p-2 border border-divider text-center font-bold text-brand bg-brand-100/30 text-lg">{stu.rank}</td>
                                                <td className={`p-1 lg:p-2 border border-divider text-center font-bold ${getGradeColor(stu.grade)}`}>{stu.grade}</td>
                                            </>
                                        )}
                                        {currentMode === 'annual' && (
                                            <>
                                                <td className="p-1 lg:p-2 border border-divider text-center font-bold text-brand bg-brand-100/30">{stu.annualAverage}</td>
                                                <td className="p-1 lg:p-2 border border-divider text-center font-bold text-brand bg-brand-100/30 text-lg">{stu.rank}</td>
                                                <td className={`p-1 lg:p-2 border border-divider text-center font-bold ${getGradeColor(stu.grade)}`}>{stu.grade}</td>
                                            </>
                                        )}
                                        {currentMode === 'semester' && (
                                            <>
                                                <td className="p-1 lg:p-2 border border-divider text-center font-bold text-text-body bg-warning/10">{stu.examTotal}</td>
                                                <td className="p-1 lg:p-2 border border-divider text-center font-bold text-text-body">{stu.examAverage}</td>
                                                <td className="p-1 lg:p-2 border border-divider text-center font-bold text-text-body">{stu.monthlyAverage}</td>
                                                <td className="p-1 lg:p-2 border border-divider text-center font-bold text-brand bg-brand-100/30">{stu.semesterAverage}</td>
                                                <td className="p-1 lg:p-2 border border-divider text-center font-bold text-brand bg-brand-100/30 text-lg">{stu.rank}</td>
                                                <td className={`p-1 lg:p-2 border border-divider text-center font-bold ${getGradeColor(stu.grade)}`}>{stu.grade}</td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Month Selection Modal */}
            {isMonthModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm" onClick={() => setIsMonthModalOpen(false)}>
                    <div className="bg-bg-surface rounded-t-2xl sm:rounded-xl w-full max-h-[90vh] sm:max-h-[85vh] overflow-y-auto max-w-md shadow-lg overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-divider flex justify-between items-center bg-paper">
                            <h3 className="font-bold text-text-heading flex items-center gap-2">
                                <Settings2 className="w-5 h-5 text-brand" />
                                ជ្រើសរើសខែបូកបញ្ចូល
                            </h3>
                            <button onClick={() => setIsMonthModalOpen(false)} className="p-1 hover:bg-divider rounded-full"><X className="w-5 h-5 text-text-muted" /></button>
                        </div>
                        <div className="p-4 space-y-2">
                            <p className="text-sm text-text-muted mb-4">សូមជ្រើសរើសខែដែលត្រូវយកមកគណនាមធ្យមភាគប្រចាំខែ (ដើម្បីបូកជាមួយពិន្ទុប្រឡងឆមាស)</p>
                            <div className="grid grid-cols-2 gap-3">
                                {MONTHS_BY_ACADEMIC_YEAR.map(m => {
                                    const isSelected = selectedSemesterMonths.includes(m.id)
                                    return (
                                        <label key={m.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? 'border-brand-500 bg-brand-100' : 'border-divider bg-bg-surface hover:bg-paper'}`}>
                                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${isSelected ? 'bg-brand border-brand-500' : 'border-divider'}`}>
                                                {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                                            </div>
                                            <input type="checkbox" className="hidden" checked={isSelected} onChange={(e) => {
                                                if(e.target.checked) setSelectedSemesterMonths(prev => [...prev, m.id])
                                                else setSelectedSemesterMonths(prev => prev.filter(x => x !== m.id))
                                            }} />
                                            <span className={`text-sm font-bold ${isSelected ? 'text-brand' : 'text-text-body'}`}>{m.label}</span>
                                        </label>
                                    )
                                })}
                            </div>
                        </div>
                        <div className="p-4 border-t border-divider bg-paper flex justify-end">
                            <Button printHidden={false} onClick={() => { setIsMonthModalOpen(false); loadData(); }}>
                                <Check className="w-4 h-4" /> យល់ព្រម
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
