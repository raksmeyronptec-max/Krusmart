'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/actions/Button'
import { ArrowLeft, Printer, Award, Calendar, Bookmark } from 'lucide-react'
import { notify } from '@/components/ui/feedback/notify'
import { getAllScoresByPeriod } from '../score/total/actions'
import Select from '@/components/ui/forms/Select'
import type { Settings, Student } from '@/lib/types'
import { MONTHS_BY_CALENDAR } from '@/lib/constants/months'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { letterFor } from '@/lib/grading/scheme'
import { useScoreTemplate } from '@/lib/hooks/useScoreTemplate'
import { maxScoreByColumn, resolveTemplate, SYSTEM_PRIMARY_TEMPLATE } from '@/lib/scores/template'
import {
    assignRanks, FALLBACK_NUMERIC_KEYS, numericColumnKeys, studentAverage,
} from '@/lib/scores/aggregate'

/** A student decorated with the per-period scores and the derived ranking fields. */
type RankedStudent = Student & {
    scores: Record<string, number | string | null>
    total: number
    average: string
    finalAverageForRank: number
    rank: number
}

export default function HonorRollClient({ initialStudents, settings}: { initialStudents: Student[], settings: Settings | null }) {
    const [academicYear, setAcademicYear] = useState('2025-2026')
    const [currentMode, setCurrentMode] = useState<'monthly'|'semester'|'yearly'>('monthly')
    const [currentPeriod, setCurrentPeriod] = useState('jan')
    const [loading, setLoading] = useState(false)
    const [showPreview, setShowPreview] = useState(false)
    const [topStudents, setTopStudents] = useState<RankedStudent[]>([])

    /**
     * Same resolution as /score/total: honour-roll qualification is the final
     * effective average — the /50 coefficient average for a class on a level
     * template, never a raw total of mixed denominators (§10). The shared
     * denominators live in lib/scores/aggregate.ts.
     */
    const { rows: templateRows, context: templateContext, scheme, levelCurriculum } = useScoreTemplate('monthly')

    const keysForMode = (mode: 'monthly' | 'semester') => {
        if (!levelCurriculum) return FALLBACK_NUMERIC_KEYS[mode]
        return numericColumnKeys(resolveTemplate(
            templateRows.length > 0 ? templateRows : SYSTEM_PRIMARY_TEMPLATE, mode, templateContext,
        ))
    }

    const loadData = async (mode: 'monthly'|'semester'|'yearly', period: string) => {
        setLoading(true)
        setCurrentMode(mode)
        setCurrentPeriod(period)

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
            return { ...stu, scores: studentScores, total: 0, average: '0.00', finalAverageForRank: 0, rank: 0 }
        })

        const maxByColumn = maxScoreByColumn(resolveTemplate(
            templateRows.length > 0 ? templateRows : SYSTEM_PRIMARY_TEMPLATE,
            mode === 'yearly' ? 'semester' : mode,
            templateContext,
        ))

        processedStudents.forEach(stu => {
            if (mode === 'monthly' || mode === 'semester') {
                const { average, total } = studentAverage(stu.scores, keysForMode(mode), maxByColumn, scheme)
                stu.total = total
                stu.average = average === null ? '0.00' : average.toFixed(2)
                stu.finalAverageForRank = parseFloat(stu.average)
            } else if (mode === 'yearly') {
                // Semester averages already sit on the scheme's scale.
                const s1 = parseFloat(String(stu.scores['sem1_avg'] ?? '0'))
                const s2 = parseFloat(String(stu.scores['sem2_avg'] ?? '0'))
                const div = (s1 > 0 ? 1 : 0) + (s2 > 0 ? 1 : 0)
                stu.total = s1 + s2
                stu.average = div > 0 ? (stu.total / div).toFixed(2) : "0.00"
                stu.finalAverageForRank = parseFloat(stu.average)
            }

            stu.grade = letterFor(stu.finalAverageForRank, scheme)
        })

        assignRanks(processedStudents, s => s.finalAverageForRank, (s, r) => { s.rank = r })

        // Get Top 5 (or those with average > 0)
        const top5 = processedStudents.filter(s => s.finalAverageForRank > 0).slice(0, 5)

        if (top5.length === 0) {
            notify.error('មិនទាន់មានទិន្នន័យពិន្ទុគ្រប់គ្រាន់ទេ សូមបញ្ចូលពិន្ទុជាមុនសិន')
            setLoading(false)
            return
        }

        setTopStudents(top5)
        setLoading(false)
        setShowPreview(true)
    }

    return (
        <div className="min-h-screen bg-paper font-battambang print:bg-white pb-10 relative">
            <style jsx global>{`
                .font-battambang { font-family: 'Battambang', cursive; }
                
                :root { 
                    --primary: #0a2351; 
                    --gold-main: #bf953f;
                    --gold-grad: linear-gradient(135deg, #BF953F 0%, #FCF6BA 25%, #B38728 50%, #FBF5B7 75%, #AA771C 100%);
                }

                @media print {
                    @page { size: A4 portrait; margin: 0; }
                    body { background: white !important; -webkit-print-color-adjust: exact; padding: 0; overflow: hidden; }
                    .no-print { display: none !important; }
                    .print-container { 
                        display: block !important; 
                        width: 210mm !important; 
                        height: 297mm !important; 
                        margin: 0 !important;
                        box-shadow: none !important;
                        overflow: hidden !important;
                        padding: 5px !important;
                    }
                    .gold-border-inner { padding: 8mm 10mm 8mm 10mm !important; }
                }

                /*
                  Screen decoration only — the printed certificate below keeps
                  its literal gold and white, which paper needs and a theme must
                  not touch.
                */
                .bg-animate { 
                    position: absolute; inset: 0; z-index: 0; pointer-events: none; opacity: 0.5;
                    background: radial-gradient(circle at 10% 20%, var(--brand-100) 0%, transparent 40%), 
                                radial-gradient(circle at 90% 80%, var(--color-gold) 0%, transparent 40%), 
                                radial-gradient(circle at 50% 50%, var(--color-warning) 0%, transparent 50%); 
                    animation: moveBg 20s infinite alternate ease-in-out; 
                }
                @media (prefers-reduced-motion: reduce) { .bg-animate { animation: none; } }
                @keyframes moveBg { from { transform: scale(1); } to { transform: scale(1.1); } }

                .gold-border-outer {
                    width: 100%; height: 100%;
                    background: var(--gold-grad);
                    padding: 6px; border-radius: 4px; box-sizing: border-box; position: relative;
                }
                .white-inner-bg {
                    width: 100%; height: 100%;
                    background: #ffffff; background-image: radial-gradient(circle, #ffffff 40%, #fcfbf8 100%);
                    padding: 4px; box-sizing: border-box;
                }
                .gold-border-inner {
                    width: 100%; height: 100%;
                    border: 2px solid var(--gold-main); box-sizing: border-box;
                    padding: 10mm 12mm 8mm 12mm; position: relative;
                    display: flex; flex-direction: column; align-items: center; overflow: hidden;
                }
                .top-crown {
                    position: absolute; top: -18px; left: 50%; transform: translateX(-50%);
                    width: 45px; height: auto; z-index: 10;
                }

                .student-card {
                    width: 190px; background: #ffffff; border-radius: 10px; position: relative;
                    display: flex; flex-direction: column; align-items: center;
                    padding: 18px 10px 8px 10px;
                    border: 1px solid rgba(191, 149, 63, 0.25);
                    box-shadow: 0 6px 15px rgba(0,0,0,0.05);
                }
                .pos-1 {
                    border: 2px solid var(--gold-main); box-shadow: 0 10px 25px rgba(191, 149, 63, 0.20);
                    background: radial-gradient(circle at top, #ffffff, #fffcf0);
                    width: 210px; padding-top: 24px; grid-column: 1 / span 2; justify-self: center; margin-bottom: 4px;
                }
                .pos-2 { grid-column: 1; justify-self: end; }
                .pos-3 { grid-column: 2; justify-self: start; }
                .pos-4 { grid-column: 1; justify-self: end; }
                .pos-5 { grid-column: 2; justify-self: start; }

                .card-pattern {
                    position: absolute; top: 0; left: 0; right: 0; height: 4px;
                    background: var(--gold-grad); border-top-left-radius: 9px; border-top-right-radius: 9px;
                }
                .rank-badge {
                    position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
                    width: 30px; height: 30px; background: var(--gold-grad); color: white;
                    border-radius: 50%; display: flex; align-items: center; justify-content: center;
                    font-weight: bold; font-size: 15px; box-shadow: 0 4px 8px rgba(191, 149, 63, 0.3);
                    z-index: 2; border: 2px solid white;
                }
                .card-crown { position: absolute; top: -38px; color: var(--gold-main); width: 25px; height: 25px; }

                .student-name { 
                    font-family: 'Moul', cursive; font-size: 15px; color: var(--primary);
                    margin-bottom: 2px; margin-top: 0px; text-align: center; width: 100%; line-height: 1.4;
                }
                .pos-1 .student-name { font-size: 17px; }

                .honor-grid {
                    display: grid; grid-template-columns: auto auto; justify-content: center;
                    row-gap: 12px; column-gap: 25px; width: 100%; margin: 0 auto; margin-top: 5px;
                }

                .select-btn {
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                    padding: 12px 24px; background-color: white; border-radius: 12px; font-weight: bold;
                    transition: all 0.2s; cursor: pointer; color: var(--text-muted);
                }
                .select-btn:hover { background-color: rgba(255,255,255,0.5); }
            `}</style>

            {!showPreview ? (
                <>
                    <div className="bg-animate"></div>
                    <div className="max-w-4xl mx-auto py-8 px-4 no-print relative z-10">
                        {loading && (
                            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg-surface/80 backdrop-blur-sm">
                                <div className="w-16 h-16 border-4 border-divider border-t-blue-600 rounded-full animate-spin"></div>
                                <p className="mt-4 kh-moul text-brand animate-pulse">កំពុងទាញយកទិន្នន័យ...</p>
                            </div>
                        )}
                        
                        <div className="rounded-[1.5rem] border-t-4 border-gold bg-bg-surface/95 p-6 text-center shadow-[0_10px_30px_rgba(0,0,0,0.05)] backdrop-blur-md md:p-10">
                            <div className="flex justify-center mb-4">
                                <div className="p-4 bg-gold/10 rounded-full text-gold border border-gold/30">
                                    <Award className="w-8 h-8 text-gold" />
                                </div>
                            </div>
                            <h1 className="kh-moul text-xl md:text-2xl text-brand mb-2">តារាងកិត្តិយស (Premium Edition)</h1>
                            <p className="text-text-muted font-bold mb-8">រចនាបថស៊ុមពណ៌មាស និង សម្រាប់សិស្សឆ្នើមទាំង ៥</p>

                            <div className="mb-6 flex justify-center w-full overflow-x-auto pb-2">
                                <div className="inline-flex bg-paper p-1 rounded-xl whitespace-nowrap">
                                    <button onClick={() => setCurrentMode('monthly')} className={`select-btn ${currentMode === 'monthly' ? 'bg-bg-surface shadow text-brand' : 'text-text-muted hover:bg-paper'}`}>
                                        <Calendar className="w-4 h-4" /> ប្រចាំខែ
                                    </button>
                                    <button onClick={() => setCurrentMode('semester')} className={`select-btn ${currentMode === 'semester' ? 'bg-bg-surface shadow text-brand' : 'text-text-muted hover:bg-paper'}`}>
                                        <Bookmark className="w-4 h-4" /> ប្រចាំឆមាស
                                    </button>
                                    <button onClick={() => setCurrentMode('yearly')} className={`select-btn ${currentMode === 'yearly' ? 'bg-bg-surface shadow text-brand' : 'text-text-muted hover:bg-paper'}`}>
                                        <Award className="w-4 h-4" /> ប្រចាំឆ្នាំ
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left mb-8 max-w-2xl mx-auto">
                                <div>
                                    <label className="block font-bold text-text-body mb-2">ឆ្នាំសិក្សា</label>
                                    <Select
                                        ariaLabel="ឆ្នាំសិក្សា"
                                        value={academicYear}
                                        onChange={setAcademicYear}
                                        options={['2024-2025', '2025-2026', '2026-2027']}
                                    />
                                </div>

                                {currentMode !== 'yearly' && (
                                    <div>
                                        <label className="block font-bold text-text-body mb-2">{currentMode === 'monthly' ? 'ជ្រើសរើសខែ' : 'ជ្រើសរើសឆមាស'}</label>
                                        <Select
                                            ariaLabel={currentMode === 'monthly' ? 'ជ្រើសរើសខែ' : 'ជ្រើសរើសឆមាស'}
                                            value={currentPeriod}
                                            onChange={setCurrentPeriod}
                                            options={currentMode === 'monthly'
                                                ? MONTHS_BY_CALENDAR.map(m => ({ value: m.id, label: m.label }))
                                                : [
                                                    { value: 'sem1', label: 'ឆមាសទី១' },
                                                    { value: 'sem2', label: 'ឆមាសទី២' },
                                                ]}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-center">
                                <Button size="lg" printHidden={false} onClick={() => loadData(currentMode, currentPeriod)}>
                                    <Printer className="w-5 h-5" /> មើលគំរូ និង បោះពុម្ភ
                                </Button>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="relative pt-8 pb-8 bg-divider min-h-screen preview-mode">
                    <div className="fixed top-4 right-4 flex flex-col gap-3 z-50 no-print">
                        <Button printHidden={false} onClick={() => window.print()} title="បោះពុម្ភ">
                            <Printer className="w-6 h-6" />
                        </Button>
                        <button onClick={() => setShowPreview(false)} className="bg-text-muted text-white p-3 rounded-full shadow-lg hover:opacity-90 hover:scale-105 transition" title="បិទ">
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="print-container mx-auto">
                        <div className="gold-border-outer">
                            <div className="white-inner-bg">
                                <div className="gold-border-inner text-slate-900">
                                    
                                    <svg width="0" height="0" className="absolute">
                                        <defs>
                                            <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                <stop offset="0%" stopColor="#BF953F" />
                                                <stop offset="25%" stopColor="#FCF6BA" />
                                                <stop offset="50%" stopColor="#B38728" />
                                                <stop offset="75%" stopColor="#FBF5B7" />
                                                <stop offset="100%" stopColor="#AA771C" />
                                            </linearGradient>
                                        </defs>
                                    </svg>

                                    <svg className="top-crown" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style={{ fill: 'url(#goldGradient)' }}>
                                        <path d="M496 128c-17.7 0-32 14.3-32 32s14.3 32 32 32c21.8 0 40.5-14.7 46.5-34.8L444.6 363.5c-2.3 8.1-9.6 13.9-18 14L85.4 378c-8.4 .1-15.8-5.7-18-13.8L-9.7 172.9c10-8.9 16.4-21.9 16.4-36.4c0-26.5-21.5-48-48-48s-48 21.5-48 48c0 23.3 16.7 42.7 38.6 47.1l66 226.7C24.4 435.5 45.4 456 71.4 456H440.6c26 0 47-20.5 55.1-45.7l66-226.7C583.6 179.2 600 159.8 600 136.5c0-26.5-21.5-48-48-48z" transform="translate(48 20) scale(0.8)"/>
                                        <path d="M256 128c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32zM80 128c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32zm352 0c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32z"/>
                                    </svg>

                                    <div className="w-full relative z-10">
                                        <div className="text-center w-full mb-1">
                                            <h3 className="kh-moul text-[11pt] mb-1">ព្រះរាជាណាចក្រកម្ពុជា</h3>
                                            <h3 className="kh-moul text-[11pt] mb-1">ជាតិ សាសនា ព្រះមហាក្សត្រ</h3>
                                            <div className="text-[10px] mt-1 text-center">❧❧❧ ❖ ☙☙☙</div>
                                        </div>
                                        
                                        <div className="absolute top-[35px] left-0 text-left font-bold text-[9pt] leading-[1.5]">
                                            <p>{settings?.management_unit_1 || "មន្ទីរអប់រំ យុវជន និងកីឡា..."}</p>
                                            <p>{settings?.management_unit_2 || "ការិយាល័យអប់រំ..."}</p>
                                            <p className="mt-1">{settings?.school_name || "សាលា..."}</p>
                                            <p>{settings?.class_name || "ថ្នាក់..."}</p>
                                        </div>
                                    </div>

                                    <div className="text-center w-full mt-0 mb-1 z-10">
                                        <h2 className="kh-moul text-[15pt] mb-1 text-gold tracking-wide" style={{ textShadow: '1px 1px 0px rgba(0,0,0,0.1)' }}>តារាងកិត្តិយស</h2>
                                        <h3 className="kh-moul text-[10pt] text-brand">
                                            {currentMode === 'monthly' ? `ប្រចាំខែ ${MONTHS_BY_CALENDAR.find(m => m.id === currentPeriod)?.label}` : currentMode === 'semester' ? `ប្រចាំឆមាសទី${currentPeriod === 'sem1' ? '១' : '២'}` : 'ប្រចាំឆ្នាំ'}
                                        </h3>
                                    </div>

                                    <div className="honor-grid w-full flex-1 z-10">
                                        {topStudents.map((stu, i) => {
                                            const posClass = `pos-${i + 1}`
                                            return (
                                                <div key={stu.id} className={`student-card ${posClass}`}>
                                                    <div className="card-pattern"></div>
                                                    <div className="rank-badge">{stu.rank}</div>
                                                    {i === 0 && <Award className="card-crown" />}
                                                    <div className="w-[60px] h-[60px] mb-2 mt-2 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200">
                                                        <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                                                    </div>
                                                    <h4 className="student-name">{stu.name_kh || stu.full_name}</h4>
                                                    <div className="text-[10px] text-slate-500 mb-2">អត្តលេខ៖ {toKhmerNumber(stu.id)}</div>
                                                    <div className="flex items-center gap-4 border-t border-slate-100 pt-2 w-full justify-center">
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider mb-0.5">និទ្ទេស</span>
                                                            <span className={`font-bold text-[14px] ${stu.grade === 'A' ? 'text-gold' : stu.grade === 'B' ? 'text-brand-500' : stu.grade === 'C' ? 'text-warning' : 'text-brand'}`}>{stu.grade}</span>
                                                        </div>
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider mb-0.5">មធ្យមភាគ</span>
                                                            <span className="font-bold text-[14px] text-slate-700">{toKhmerNumber(stu.average)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>

                                    <div className="w-full mt-auto mb-0 z-10 flex flex-col items-center">
                                        <div className="flex justify-end w-full mb-1">
                                            <div className="text-center w-[50%]">
                                                <p className="mb-1 text-[8pt] font-normal">ថ្ងៃ................ខែ..........ឆ្នាំ..........ព.ស.២៥៦...</p>
                                                <p className="text-[8pt] font-normal">ធ្វើនៅ {settings?.province_date || ".............."}, ថ្ងៃទី........ ខែ........... ឆ្នាំ ២០២...</p>
                                            </div>
                                        </div>
                                        <div className="flex justify-between w-full items-start">
                                            <div className="text-center w-[45%]">
                                                <p className="text-[10pt] font-normal">បានឃើញ និងឯកភាព</p>
                                                <p className="kh-moul text-[10pt] mt-1">នាយកសាលា</p>
                                            </div>
                                            <div className="text-center w-[45%]">
                                                <p className="mb-1 kh-moul text-[10pt]">គ្រូបន្ទុកថ្នាក់</p>
                                                <p className="kh-moul text-[10pt] mt-[20px]">{settings?.teacher_name || "ឈ្មោះគ្រូ"}</p>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
