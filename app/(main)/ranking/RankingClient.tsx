'use client'

import { useState } from 'react'
import { ArrowLeft, Printer, FileSpreadsheet, CalendarDays, CalendarRange, Layers, Award } from 'lucide-react'
import Link from 'next/link'
import * as XLSX from 'xlsx-js-style'
import { getAllScoresByPeriod } from '../score/total/actions'
import Select from '@/components/ui/forms/Select'
import type { Settings, Student } from '@/lib/types'
import { MONTHS_BY_CALENDAR } from '@/lib/constants/months'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { SheetRow } from '@/lib/utils/xlsx'
import { gradeFor } from '@/lib/grading/scheme'

/** A student decorated with the per-period scores and the derived ranking fields. */
type RankedStudent = Student & {
    scores: Record<string, number | string | null>
    total: number
    average: string
    finalAverageForRank: number
    desc: string
    rank: number
}

export default function RankingClient({ initialStudents, settings}: { initialStudents: Student[], settings: Settings | null }) {
    const [academicYear, setAcademicYear] = useState('2025-2026')
    const [currentMode, setCurrentMode] = useState<'monthly'|'semester'|'yearly'>('monthly')
    const [currentPeriod, setCurrentPeriod] = useState('jan')
    const [loading, setLoading] = useState(false)
    const [showPreview, setShowPreview] = useState(false)
    const [studentsData, setStudentsData] = useState<RankedStudent[]>([])

    const config = {
        monthly: {
            columns: [
                'kh_listen', 'kh_speak', 'kh_read', 'kh_write', 'kh_calligraphy', 'kh_recitation', 'kh_essay',
                'math_num', 'math_meas', 'math_geo', 'math_alg', 'math_stat',
                'sci_phy', 'sci_chem', 'sci_bio', 'sci_earth', 'sci_applied',
                'soc_ethic', 'soc_geo', 'soc_hist', 'soc_home',
                'pe_sport', 'health_hygiene', 'life_skill', 'foreign',
                'ex_oral', 'ex_att', 'ex_book', 'ex_hw'
            ]
        },
        semester: {
            columns: [
                'sem_kh_reading', 'sem_kh_listening_speaking', 'sem_kh_dictation', 'sem_kh_essay',
                'sem_math', 'sem_science', 'sem_moral_civics', 'sem_geo', 'sem_hist', 'sem_home_arts',
                'sem_life_skills', 'sem_foreign', 'sem_sport'
            ]
        }
    }

    const loadData = async (mode: 'monthly'|'semester'|'yearly', period: string) => {
        setLoading(true)
        setCurrentMode(mode)
        setCurrentPeriod(period)

        // For yearly, it might fetch sem1 and sem2, but let's map it based on actions
        const scoreMode = mode === 'yearly' ? 'annual' : mode
        let fetchPeriod = ''
        if (mode === 'monthly') fetchPeriod = `${period}-${academicYear}`
        else if (mode === 'semester') fetchPeriod = `${period}-${academicYear}`
        else fetchPeriod = `annual-${academicYear}`

        const records = await getAllScoresByPeriod(scoreMode, fetchPeriod)

        const processedStudents: RankedStudent[] = initialStudents.map(stu => {
            const studentScores: Record<string, number | string | null> = {}
            records.filter(r => r.student_id === stu.id).forEach(r => {
                studentScores[r.subject] = r.score_value
            })
            // The derived fields are all overwritten by the pass below.
            return { ...stu, scores: studentScores, total: 0, average: '0.00', finalAverageForRank: 0, desc: '', rank: 0 }
        })

        processedStudents.forEach(stu => {
            let sum = 0
            let count = 0

            if (mode === 'monthly' || mode === 'semester') {
                const cols = config[mode].columns
                cols.forEach(key => {
                    const val = parseFloat(String(stu.scores[key] ?? ''))
                    if (!isNaN(val)) {
                        sum += val
                        count++
                    }
                })
                stu.total = sum
                stu.average = count > 0 ? (sum / count).toFixed(2) : "0.00"
                stu.finalAverageForRank = parseFloat(stu.average)
            } else if (mode === 'yearly') {
                const s1 = parseFloat(String(stu.scores['sem1_avg'] ?? '0'))
                const s2 = parseFloat(String(stu.scores['sem2_avg'] ?? '0'))
                const div = (s1 > 0 ? 1 : 0) + (s2 > 0 ? 1 : 0)
                stu.total = s1 + s2
                stu.average = div > 0 ? (stu.total / div).toFixed(2) : "0.00"
                stu.finalAverageForRank = parseFloat(stu.average)
            }

            // Shared grading engine — same A-F ladder this block used inline.
            const result = gradeFor(stu.finalAverageForRank)
            stu.grade = result?.letter ?? '-'
            stu.desc = result?.label ?? '-'
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

        // Restore original order based on order_index
        processedStudents.sort((a,b) => (a.order_index || 0) - (b.order_index || 0))
        setStudentsData(processedStudents)
        setLoading(false)
        setShowPreview(true)
    }

    const exportExcel = () => {
        const ws_data: SheetRow[] = []
        const title = currentMode === 'monthly' ? `តារាងចំណាត់ថ្នាក់ប្រចាំខែ ${MONTHS_BY_CALENDAR.find(m => m.id === currentPeriod)?.label}` 
            : currentMode === 'semester' ? `តារាងចំណាត់ថ្នាក់ប្រចាំ${currentPeriod === 'sem1' ? 'ឆមាសទី១' : 'ឆមាសទី២'}` 
            : `តារាងចំណាត់ថ្នាក់ប្រចាំឆ្នាំ ${academicYear}`

        ws_data.push([title])
        ws_data.push(['ល.រ', 'អត្តលេខ', 'គោត្តនាម និងនាម', 'ភេទ', 'ពិន្ទុសរុប', 'មធ្យមភាគ', 'ចំណាត់ថ្នាក់', 'និទ្ទេស', 'និទ្ទេស(អក្សរ)'])

        studentsData.forEach((stu, i) => {
            ws_data.push([
                i + 1,
                stu.id,
                stu.name_kh || stu.full_name,
                stu.gender === 'ស្រី' || stu.gender === 'F' ? 'ស' : 'ប',
                stu.total,
                stu.average,
                stu.rank,
                stu.grade,
                stu.desc
            ])
        })

        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet(ws_data)
        XLSX.utils.book_append_sheet(wb, ws, "Ranking")
        XLSX.writeFile(wb, `Ranking_${currentPeriod}_${academicYear}.xlsx`)
    }

    // Stats
    const totalSt = studentsData.length
    const totalF = studentsData.filter(s => s.gender === 'ស្រី' || s.gender === 'F').length
    const passSt = studentsData.filter(s => parseFloat(s.average) >= 5.0)
    const passF = passSt.filter(s => s.gender === 'ស្រី' || s.gender === 'F').length
    const failSt = studentsData.filter(s => parseFloat(s.average) > 0 && parseFloat(s.average) < 5.0)
    const failF = failSt.filter(s => s.gender === 'ស្រី' || s.gender === 'F').length
    
    return (
        <div className="min-h-screen bg-slate-50 font-battambang print:bg-white pb-10">
            <style jsx global>{`
                .font-moul { font-family: 'Moul', cursive; }
                .font-battambang { font-family: 'Battambang', cursive; }
                @media print {
                    @page { size: A4 portrait; margin: 0.5cm; }
                    body { background: white !important; -webkit-print-color-adjust: exact; padding: 0; }
                    .no-print { display: none !important; }
                    .print-container { box-shadow: none !important; margin: 0 !important; width: 100% !important; }
                }
                .select-btn {
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    padding: 16px; background-color: white; border: 1px solid #e2e8f0; border-radius: 16px;
                    transition: all 0.2s; cursor: pointer; color: #64748b;
                }
                .select-btn:hover { border-color: #3b82f6; color: #3b82f6; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1); }
            `}</style>

            {!showPreview ? (
                <div className="max-w-6xl mx-auto py-8 px-4 no-print">
                    {loading && (
                        <div className="fixed inset-0 bg-white/80 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
                            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                            <p className="mt-4 font-moul text-blue-600 animate-pulse">កំពុងរៀបចំទិន្នន័យ...</p>
                        </div>
                    )}
                    
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                        <div className="flex items-center gap-4">
                            <Link href="/dashboard" className="p-3 bg-slate-50 text-slate-500 hover:bg-blue-50 hover:text-blue-600 rounded-2xl transition-all shadow-sm">
                                <ArrowLeft className="w-6 h-6" />
                            </Link>
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-moul text-slate-800 flex items-center gap-3">
                                    <span className="bg-blue-600 text-white p-2 rounded-xl shadow-lg shadow-blue-200">
                                        <Award className="w-6 h-6" />
                                    </span>
                                    តារាងចំណាត់ថ្នាក់
                                </h1>
                                <p className="text-slate-500 mt-1 text-sm font-medium">ជ្រើសរើសខែ ឬ ឆមាសដើម្បីបោះពុម្ភតារាងចំណាត់ថ្នាក់សិស្ស</p>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-3 bg-blue-50/50 px-5 py-3 rounded-2xl border border-blue-100 shadow-inner">
                            <div className="bg-white p-1.5 rounded-lg shadow-sm">
                                <CalendarDays className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-blue-500 uppercase tracking-wider block">ឆ្នាំសិក្សា</label>
                                <Select
                                    variant="ghost"
                                    ariaLabel="ឆ្នាំសិក្សា"
                                    value={academicYear}
                                    onChange={setAcademicYear}
                                    options={[
                                        { value: '2024-2025', label: '2024 - 2025' },
                                        { value: '2025-2026', label: '2025 - 2026' },
                                        { value: '2026-2027', label: '2026 - 2027' },
                                    ]}
                                    className="text-base text-slate-800"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
                        <div className="lg:col-span-8 p-6 sm:p-8 border-b lg:border-b-0 lg:border-r border-slate-100 bg-slate-50/30">
                            <div className="flex items-center gap-2 mb-6">
                                <CalendarRange className="w-5 h-5 text-slate-400" />
                                <h3 className="text-base font-bold text-slate-700 font-moul">ការវាយតម្លៃប្រចាំខែ</h3>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                {MONTHS_BY_CALENDAR.map(m => (
                                    <button key={m.id} onClick={() => loadData('monthly', m.id)} className="select-btn group">
                                        <span className="font-moul text-[15px] group-hover:text-blue-600">{m.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="lg:col-span-4 p-6 sm:p-8 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-6">
                                    <Layers className="w-5 h-5 text-slate-400" />
                                    <h3 className="text-base font-bold text-slate-700 font-moul">ការវាយតម្លៃសរុប</h3>
                                </div>
                                <div className="flex flex-col gap-4">
                                    <button onClick={() => loadData('semester', 'sem1')} className="select-btn flex-row justify-between px-6 hover:border-blue-400">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">1</div>
                                            <span className="font-moul text-[15px]">ឆមាសទី១</span>
                                        </div>
                                    </button>
                                    <button onClick={() => loadData('semester', 'sem2')} className="select-btn flex-row justify-between px-6 hover:border-blue-400">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">2</div>
                                            <span className="font-moul text-[15px]">ឆមាសទី២</span>
                                        </div>
                                    </button>
                                </div>
                            </div>
                            <div className="mt-8 pt-8 border-t border-slate-100">
                                <button onClick={() => loadData('yearly', 'annual')} className="select-btn flex-row justify-between px-6 w-full border-fuchsia-200 hover:border-fuchsia-500 hover:text-fuchsia-600 bg-gradient-to-r from-fuchsia-50 to-white">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-fuchsia-100 flex items-center justify-center shadow-inner">
                                            <Award className="w-6 h-6 text-fuchsia-600" />
                                        </div>
                                        <span className="font-moul text-[16px]">ប្រចាំឆ្នាំ</span>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                // preview-scroll: the sheet is a fixed 21cm (~794px); without a
                // scroll container the whole page drags sideways on a phone.
                <div className="preview-scroll">
                <div className="print-container bg-white w-[21cm] shrink-0 min-h-[29.7cm] mx-auto my-8 p-[0.8cm] shadow-xl border border-slate-200 relative text-blue-900">
                    <div className="no-print fixed top-6 right-6 flex flex-col gap-3 z-50">
                        <button onClick={exportExcel} className="bg-emerald-600 text-white p-3.5 rounded-full shadow-lg shadow-emerald-200 hover:bg-emerald-700 hover:scale-110 transition-all flex items-center justify-center group" title="ទាញយក Excel">
                            <FileSpreadsheet className="w-6 h-6" />
                        </button>
                        <button onClick={() => window.print()} className="bg-blue-600 text-white p-3.5 rounded-full shadow-lg shadow-blue-200 hover:bg-blue-700 hover:scale-110 transition-all flex items-center justify-center group" title="បោះពុម្ភ">
                            <Printer className="w-6 h-6" />
                        </button>
                        <button onClick={() => setShowPreview(false)} className="bg-slate-700 text-white p-3.5 rounded-full shadow-lg hover:bg-slate-800 hover:scale-110 transition-all flex items-center justify-center group" title="បិទ">
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="relative text-center mb-4 font-moul text-blue-900 leading-relaxed">
                        <h3 className="text-[15px] tracking-wide">ព្រះរាជាណាចក្រកម្ពុជា</h3>
                        <h3 className="text-[14px] tracking-widest mt-0.5">ជាតិ សាសនា ព្រះមហាក្សត្រ</h3>
                        <div className="text-[10px] mt-1">❧❧❧ ❖ ☙☙☙</div>
                        
                        <div className="absolute left-0 top-[40px] text-left w-[38%] text-[10.5px] font-moul font-normal leading-[1.7] whitespace-nowrap z-10">
                            <p>{settings?.management_unit_1 || "មន្ទីរអប់រំ យុវជន និងកីឡា..."}</p>
                            <p>{settings?.management_unit_2 || "ការិយាល័យអប់រំ..."}</p>
                            <p className="mt-1">{settings?.school_name || "សាលា..."}</p>
                            <p>{settings?.class_name || "ថ្នាក់..."}</p>
                            <p>ឆ្នាំសិក្សា៖ {toKhmerNumber(academicYear)}</p>
                        </div>
                        
                        <div className="mt-2 pb-2 w-full text-center">
                            <h1 className="text-[18px] font-moul mb-1.5 text-blue-900">តារាងចំណាត់ថ្នាក់សិស្ស</h1>
                            <p className="font-moul text-[15px] text-blue-800">
                                {currentMode === 'monthly' ? `ប្រចាំខែ ${MONTHS_BY_CALENDAR.find(m => m.id === currentPeriod)?.label}` : currentMode === 'semester' ? `ប្រចាំឆមាសទី${currentPeriod === 'sem1' ? '១' : '២'}` : 'ប្រចាំឆ្នាំ'}
                            </p>
                        </div>
                    </div>

                    <table className="w-full table-fixed text-[11px] border-collapse border border-blue-900 mb-3 text-blue-900">
                        <thead className="bg-blue-50/50 text-center font-bold">
                            <tr>
                                <th className="border border-blue-900 w-10 p-1">ល.រ</th>
                                <th className="border border-blue-900 w-16 p-1">អត្តលេខ</th>
                                <th className="border border-blue-900 p-1 text-left px-2">គោត្តនាម និងនាម</th>
                                <th className="border border-blue-900 w-10 p-1">ភេទ</th>
                                <th className="border border-blue-900 w-16 p-1">ពិន្ទុសរុប</th>
                                <th className="border border-blue-900 w-16 p-1">មធ្យមភាគ</th>
                                <th className="border border-blue-900 w-16 p-1">ចំណាត់ថ្នាក់</th>
                                <th className="border border-blue-900 w-12 p-1">និទ្ទេស</th>
                                <th className="border border-blue-900 w-16 p-1">និទ្ទេស(អក្សរ)</th>
                                <th className="border border-blue-900 w-16 p-1">ផ្សេងៗ</th>
                            </tr>
                        </thead>
                        <tbody className="text-center">
                            {studentsData.map((stu, i) => (
                                <tr key={stu.id}>
                                    <td className="border border-blue-900 p-1 font-bold">{i + 1}</td>
                                    <td className="border border-blue-900 p-1 text-[9px] font-bold text-slate-500 font-mono">{stu.id}</td>
                                    <td className="border border-blue-900 p-1 text-left px-2 font-bold">{stu.name_kh || stu.full_name}</td>
                                    <td className="border border-blue-900 p-1">{stu.gender === 'ស្រី' || stu.gender === 'F' ? 'ស' : 'ប'}</td>
                                    <td className="border border-blue-900 p-1 font-bold">{stu.total}</td>
                                    <td className="border border-blue-900 p-1 font-bold text-blue-700">{stu.average}</td>
                                    <td className="border border-blue-900 p-1 font-bold text-red-600 text-sm">{stu.rank || '-'}</td>
                                    <td className="border border-blue-900 p-1 font-bold">{stu.grade || '-'}</td>
                                    <td className="border border-blue-900 p-1 text-[10px]">{stu.desc || '-'}</td>
                                    {/* Always blank: nothing ever populates a `remarks` field on a ranked
                                        student. Kept as an empty column so the printed table keeps its
                                        shape — wire it to `other_remarks` if it is meant to carry data. */}
                                    <td className="border border-blue-900 p-1 text-[10px]"></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="text-[11.5px] font-battambang leading-[1.65] text-blue-900 mt-3 px-1">
                        <div className="flex justify-between font-bold">
                            <div className="w-1/2 flex">
                                <span className="w-[150px]">បញ្ជីបេក្ខជនសរុប ៖</span>
                                <span><span className="inline-block w-7 text-center">{totalSt}</span> នាក់ ស្រី <span className="inline-block w-7 text-center">{totalF}</span> នាក់</span>
                            </div>
                            <div className="w-1/2 flex">
                                <span className="w-[170px]">សិស្សជាប់មធ្យមភាគ ៖</span>
                                <span className="flex-1"><span className="inline-block w-7 text-center">{passSt.length}</span> នាក់ ស្រី <span className="inline-block w-7 text-center">{passF}</span> នាក់</span>
                                <span className="w-[60px] text-right text-blue-900">{totalSt ? ((passSt.length / totalSt) * 100).toFixed(2) : '0.00'}%</span>
                            </div>
                        </div>
                        <div className="flex justify-between font-bold mb-3">
                            <div className="w-1/2 flex"></div>
                            <div className="w-1/2 flex text-red-700">
                                <span className="w-[170px]">សិស្សក្រោមមធ្យមភាគ ៖</span>
                                <span className="flex-1"><span className="inline-block w-7 text-center">{failSt.length}</span> នាក់ ស្រី <span className="inline-block w-7 text-center">{failF}</span> នាក់</span>
                                <span className="w-[60px] text-right">{totalSt ? ((failSt.length / totalSt) * 100).toFixed(2) : '0.00'}%</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 flex justify-between font-bold text-[12px]">
                        <div className="w-1/2 flex flex-col items-center pt-2">
                            <p className="mb-1 text-blue-900">បានឃើញ និង ឯកភាព</p>
                            <p className="font-moul mb-12 text-blue-900">នាយកសាលា</p>
                        </div>
                        
                        <div className="w-1/2 flex flex-col items-center pt-2">
                            <p className="mb-1 text-blue-900">ថ្ងៃ.........................................................ព.ស. ២៥៦...</p>
                            <p className="mb-1 text-blue-900"><span>ធ្វើនៅ {settings?.province_date || ".............."}</span>, <span>ថ្ងៃទី........ ខែ........... ឆ្នាំ ២០២...</span></p>
                            <p className="font-moul mb-12 mt-1 text-blue-900">គ្រូបន្ទុកថ្នាក់</p>
                            <p className="font-moul font-bold text-[13px] text-blue-900" style={{ marginLeft: '1.5cm' }}>{settings?.teacher_name || ".........."}</p>
                        </div>
                    </div>
                </div>
                </div>
            )}
        </div>
    )
}
