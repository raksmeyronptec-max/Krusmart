'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/actions/Button'
import { Award, RefreshCw, Image as ImageIcon, Camera, Printer, ListOrdered } from 'lucide-react'
import { notify } from '@/components/ui/feedback/notify'
import { getAllScoresByPeriod } from '../score/total/actions'
import Select from '@/components/ui/forms/Select'
import type { Score, Settings, Student } from '@/lib/types'
import { MONTHS_BY_ACADEMIC_YEAR } from '@/lib/constants/months'
import { letterFor } from '@/lib/grading/scheme'
import { useScoreTemplate } from '@/lib/hooks/useScoreTemplate'
import { maxScoreByColumn, resolveTemplate, SYSTEM_PRIMARY_TEMPLATE } from '@/lib/scores/template'
import { levelByKey, trackLabel } from '@/lib/onboarding/curriculum'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import {
    assignRanks, FALLBACK_NUMERIC_KEYS, numericColumnKeys, studentAverage,
} from '@/lib/scores/aggregate'

/** A student decorated with the scores and ranking fields the certificate prints. */
type ProcessedStudent = Student & {
    scores: Record<string, number | null>
    total?: number
    average?: string
    finalAverageForRank?: number
    rank?: number
}


export default function CertificateClient({ initialStudents, settings }: { initialStudents: Student[], settings: Settings | null }) {
    const [scoreType, setScoreType] = useState('monthly')
    const [academicYear, setAcademicYear] = useState('2025-2026')
    const [month, setMonth] = useState('nov')
    const [semester, setSemester] = useState('sem1')

    const [studentsData, setStudentsData] = useState<ProcessedStudent[]>([])

    // Selection
    const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])

    // Certificate Meta
    const [templateUrl, setTemplateUrl] = useState('')
    const [certOffice, setCertOffice] = useState(settings?.management_unit_1 || 'ការិយាល័យអប់រំ យុវជន និងកីឡា ស្រុកព្រះស្តេច')
    const [certSchool, setCertSchool] = useState(settings?.school_name || 'សាលាបឋមសិក្សាភក្សោ')
    const [certClass, setCertClass] = useState(settings?.class_name || '៤')
    const [certProvince, setCertProvince] = useState(settings?.province_date || 'ព្រៃវែង')
    const [showPhoto, setShowPhoto] = useState(true)

    // Dates
    // Fixed on the printed certificate; nothing ever changes these.
    const solarDay = '១១'
    const solarMonth = 'មីនា'
    const solarYear = '២០២៦'

    const getScorePeriod = useCallback(() => {
        if (scoreType === 'monthly') return `${month}-${academicYear}`
        if (scoreType === 'semester') return `${semester}-${academicYear}`
        return `annual-${academicYear}`
    }, [scoreType, academicYear, month, semester])

    /**
     * Same resolution as /score/total, so the certificate carries the exact
     * average and letter the totals grid shows (§19) — the /50 coefficient
     * average for a class on a level template, the untouched /10 mean on the
     * primary fallback. The private column list is gone; the shared
     * denominators live in lib/scores/aggregate.ts.
     */
    const { rows: templateRows, context: templateContext, scheme, levelCurriculum } = useScoreTemplate('monthly')

    /** The class's curriculum, said on the panel so the paper is signed in context (§9). */
    const levelContextLabel = (() => {
        const level = templateContext?.levelKey ? levelByKey(templateContext.levelKey) : undefined
        if (!level) return null
        const parts = [level.name]
        if (templateContext?.gradeNumber) parts.push(`ថ្នាក់ទី${toKhmerNumber(templateContext.gradeNumber)}`)
        const track = trackLabel(templateContext?.track)
        if (track) parts.push(track)
        return parts.join(' · ')
    })()

    const loadData = useCallback(async () => {
        const period = getScorePeriod()
        const records = await getAllScoresByPeriod(scoreType, period)

        const mode = scoreType === 'monthly' || scoreType === 'semester' ? scoreType : 'semester'
        const subjectsForMode = resolveTemplate(
            templateRows.length > 0 ? templateRows : SYSTEM_PRIMARY_TEMPLATE, mode, templateContext,
        )
        const keys = levelCurriculum ? numericColumnKeys(subjectsForMode) : FALLBACK_NUMERIC_KEYS[mode]
        const maxByColumn = maxScoreByColumn(subjectsForMode)
        
        const processedStudents: ProcessedStudent[] = initialStudents.map(stu => {
            const studentScores: Record<string, number | null> = {}
            records.filter((r: Score) => r.student_id === stu.id).forEach((r: Score) => {
                studentScores[r.subject] = r.score_value
            })
            return { ...stu, scores: studentScores }
        })

        processedStudents.forEach(stu => {
            if (scoreType === 'yearly') {
                // Semester averages already sit on the scheme's scale.
                const s1 = parseFloat(String(stu.scores['sem1_avg'] ?? '0'))
                const s2 = parseFloat(String(stu.scores['sem2_avg'] ?? '0'))
                stu.total = s1 + s2
                stu.average = (stu.total / 2).toFixed(2)
                stu.finalAverageForRank = parseFloat(stu.average)
            } else {
                const { average, total } = studentAverage(stu.scores, keys, maxByColumn, scheme)
                stu.total = total
                stu.average = average === null ? '0.00' : average.toFixed(2)
                stu.finalAverageForRank = parseFloat(stu.average)
            }

            stu.grade = letterFor(stu.finalAverageForRank, scheme)
        })

        assignRanks(
            processedStudents,
            stu => stu.finalAverageForRank || 0,
            (stu, r) => { stu.rank = r },
        )

        setStudentsData(processedStudents)
    }, [scoreType, initialStudents, getScorePeriod, templateRows, templateContext, scheme, levelCurriculum])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is set after await, not synchronously during the effect
        loadData()
    }, [loadData])



    const toggleSelection = (id: string) => {
        if (selectedStudentIds.includes(id)) {
            setSelectedStudentIds(selectedStudentIds.filter(x => x !== id))
        } else {
            setSelectedStudentIds([...selectedStudentIds, id])
        }
    }

    const selectTop = (n: number) => {
        const topIds = studentsData.filter(s => s.rank !== undefined && s.rank <= n).map(s => s.id)
        setSelectedStudentIds(topIds)
    }

    const toggleAll = () => {
        if (selectedStudentIds.length === studentsData.length) {
            setSelectedStudentIds([])
        } else {
            setSelectedStudentIds(studentsData.map(s => s.id))
        }
    }

    const handlePrint = () => {
        if (selectedStudentIds.length === 0) {
            notify.error('សូមជ្រើសរើសសិស្សយ៉ាងហោចណាស់ម្នាក់')
            return
        }
        if (!templateUrl) {
            notify.error('សូមជ្រើសរើសរូបភាពស៊ុម')
            return
        }
        window.print()
    }

    const selectedStudentsData = studentsData.filter(s => selectedStudentIds.includes(s.id))

    return (
        <div className="text-text-heading pb-20 print:bg-white print:m-0 print:p-0">
            <style jsx global>{`
                .font-battambang { font-family: 'Battambang', cursive; }

                /*
                  Screen-only: .input-field is never used inside
                  #printContainer, so it follows the theme. The @media print
                  block below keeps its literal white — paper has no theme.
                */
                .input-field {
                    width: 100%;
                    min-height: 44px;
                    padding: 0.75rem 1rem;
                    border-radius: 0.75rem;
                    border: 1px solid var(--divider);
                    background: var(--paper);
                    color: var(--text-heading);
                    font-family: 'Battambang', cursive;
                    outline: none;
                    transition: all 0.2s;
                }
                .input-field:focus {
                    border-color: var(--brand);
                    background: var(--bg-surface);
                    box-shadow: 0 0 0 3px var(--focus-ring);
                }

                @media print {
                    @page { size: A4 landscape; margin: 0; }
                    body { background: white !important; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    .no-print { display: none !important; }
                    
                    #printContainer {
                        display: block !important;
                        width: 100%;
                        background: white;
                    }

                    .cert-page {
                        width: 29.7cm;
                        height: 21cm;
                        position: relative;
                        page-break-after: always;
                        page-break-inside: avoid;
                        overflow: hidden;
                    }

                    .cert-bg-image {
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        z-index: 0;
                        object-fit: cover;
                    }

                    .cert-content {
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        z-index: 10;
                    }
                }
            `}</style>

            <div className="no-print max-w-[1200px] mx-auto px-4 py-6">
                <div className="flex items-center gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl kh-moul text-brand flex items-center gap-3">
                            <Award className="w-8 h-8 text-gold" /> បោះពុម្ពបណ្ណសរសើរ (Certificates)
                        </h1>
                        <p className="text-text-muted text-sm mt-1">ទាញយកទិន្នន័យពិន្ទុ និងចំណាត់ថ្នាក់ ដើម្បីបញ្ចូលក្នុងស៊ុមបណ្ណសរសើរដោយស្វ័យប្រវត្តិ</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="flex flex-col gap-6">
                        <div className="bg-bg-surface p-6 rounded-xl shadow-sm border border-divider">
                            <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-text-body">
                                <span className="bg-brand-100 text-brand w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span> ជ្រើសរើសទិន្នន័យ
                            </h2>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-text-body mb-2">ប្រភេទពិន្ទុ</label>
                                    <div className="flex bg-paper p-1 rounded-xl">
                                        <button onClick={() => setScoreType('monthly')} className={`flex-1 py-2 rounded-lg font-bold transition text-sm ${scoreType === 'monthly' ? 'bg-bg-surface shadow text-brand' : 'text-text-muted hover:bg-paper'}`}>ប្រចាំខែ</button>
                                        <button onClick={() => setScoreType('semester')} className={`flex-1 py-2 rounded-lg font-bold transition text-sm ${scoreType === 'semester' ? 'bg-bg-surface shadow text-brand' : 'text-text-muted hover:bg-paper'}`}>ប្រចាំឆមាស</button>
                                        <button onClick={() => setScoreType('yearly')} className={`flex-1 py-2 rounded-lg font-bold transition text-sm ${scoreType === 'yearly' ? 'bg-bg-surface shadow text-brand' : 'text-text-muted hover:bg-paper'}`}>ប្រចាំឆ្នាំ</button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-bold text-text-body mb-2">ឆ្នាំសិក្សា</label>
                                        <Select
                                            ariaLabel="ឆ្នាំសិក្សា"
                                            value={academicYear}
                                            onChange={setAcademicYear}
                                            options={['2025-2026', '2026-2027']}
                                        />
                                    </div>
                                    {scoreType === 'monthly' && (
                                        <div>
                                            <label className="block text-sm font-bold text-text-body mb-2">ខែ</label>
                                            <Select
                                                ariaLabel="ខែ"
                                                value={month}
                                                onChange={setMonth}
                                                options={MONTHS_BY_ACADEMIC_YEAR.map(m => ({ value: m.id, label: m.label }))}
                                            />
                                        </div>
                                    )}
                                    {scoreType === 'semester' && (
                                        <div>
                                            <label className="block text-sm font-bold text-text-body mb-2">ឆមាស</label>
                                            <Select
                                                ariaLabel="ឆមាស"
                                                value={semester}
                                                onChange={setSemester}
                                                options={[
                                                    { value: 'sem1', label: 'ឆមាសទី១' },
                                                    { value: 'sem2', label: 'ឆមាសទី២' },
                                                ]}
                                            />
                                        </div>
                                    )}
                                </div>

                                {levelContextLabel && (
                                    <p className="inline-flex items-center self-start rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-800 dark:bg-brand-900/40 dark:text-brand-300">
                                        {levelContextLabel}
                                    </p>
                                )}

                                <Button printHidden={false} onClick={loadData}>
                                    <RefreshCw className="w-4 h-4" /> ទាញយកចំណាត់ថ្នាក់សិស្ស
                                </Button>
                            </div>
                        </div>

                        <div className="bg-bg-surface p-6 rounded-xl shadow-sm border border-divider">
                            <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-text-body">
                                <span className="bg-brand-100 text-brand w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span> រូបភាពស៊ុម & ព័ត៌មាន
                            </h2>

                            <div className="space-y-4">
                                <div className="bg-paper p-4 rounded-xl border border-divider">
                                    <label className="block text-sm font-bold text-text-body mb-2">ជ្រើសរើសស៊ុមពី Folder របស់អ្នក</label>
                                    <Select
                                        ariaLabel="រូបភាពស៊ុម"
                                        placeholder="-- ជ្រើសរើសរូបភាពស៊ុម --"
                                        value={templateUrl}
                                        onChange={setTemplateUrl}
                                        options={[
                                            { value: 'https://lh3.googleusercontent.com/d/1n96GdSeWpbSk9NoXHwEmAaTYWe2IzAGc', label: 'Certificate-1.jpg' },
                                            { value: 'https://lh3.googleusercontent.com/d/1gIWplNhrzkopylvqAHo-c2vmY0HWgemX', label: 'Certificate-2.jpg' },
                                        ]}
                                        wrapperClassName="mb-3"
                                    />

                                    <div className="relative w-full h-32 bg-bg-surface rounded-lg border border-divider flex flex-col items-center justify-center overflow-hidden shadow-inner">
                                        {templateUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={templateUrl} className="absolute inset-0 w-full h-full object-cover z-0" alt="Preview" />
                                        ) : (
                                            <div className="relative z-10 text-center">
                                                <ImageIcon className="w-8 h-8 mx-auto text-text-muted mb-1" />
                                                <p className="text-[11px] text-text-muted font-bold">ទីតាំងបង្ហាញរូបភាព</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-text-body mb-1">ការិយាល័យ / មន្ទីរអប់រំ</label>
                                    <input type="text" value={certOffice} onChange={e => setCertOffice(e.target.value)} className="input-field py-2 text-sm text-success font-bold" />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-bold text-text-body mb-1">ឈ្មោះសាលា</label>
                                        <input type="text" value={certSchool} onChange={e => setCertSchool(e.target.value)} className="input-field py-2 text-sm text-success font-bold" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-text-body mb-1">ថ្នាក់ទី</label>
                                        <input type="text" value={certClass} onChange={e => setCertClass(e.target.value)} className="input-field py-2 text-sm text-danger font-bold" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-text-body mb-1">ធ្វើនៅ (ខេត្ត)</label>
                                    <input type="text" value={certProvince} onChange={e => setCertProvince(e.target.value)} className="input-field py-2 text-[11px] text-[#000080]" />
                                </div>

                                <div className="flex items-center justify-between mt-4 pt-4 border-t border-divider">
                                    <div>
                                        <label className="block text-sm font-bold text-text-body mb-1 flex items-center gap-2">
                                            <Camera className="w-4 h-4 text-brand" /> ភ្ជាប់រូបថតសិស្ស (៤x៦)
                                        </label>
                                        <p className="text-[10px] text-text-muted">បើកដើម្បីទាញយករូបថតពីបញ្ជីឈ្មោះសិស្សមកបង្ហាញ</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={showPhoto} onChange={e => setShowPhoto(e.target.checked)} className="sr-only peer" />
                                        <div className="w-11 h-6 bg-divider peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-divider after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand"></div>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-2 bg-bg-surface rounded-xl shadow-sm border border-divider flex flex-col overflow-hidden h-full min-h-[500px]">
                        <div className="p-4 border-b border-divider bg-paper flex flex-col gap-4">
                            <div className="flex flex-wrap justify-between items-center gap-3">
                                <h2 className="font-bold text-lg flex items-center gap-2 text-text-body">
                                    <span className="bg-brand-100 text-brand w-6 h-6 rounded-full flex items-center justify-center text-sm">3</span> បញ្ជីសិស្សទទួលបានចំណាត់ថ្នាក់
                                </h2>
                                <div className="flex items-center gap-3 bg-bg-surface p-1.5 rounded-xl border border-divider shadow-sm w-full sm:w-auto justify-between">
                                    <span className="text-sm text-text-muted font-bold px-3">បានជ្រើសរើស: {selectedStudentIds.length} នាក់</span>
                                    <Button variant="success" printHidden={false} onClick={handlePrint} disabled={selectedStudentIds.length === 0}>
                                        <Printer className="w-4 h-4" /> បោះពុម្ពបណ្ណសរសើរ
                                    </Button>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="gold" size="sm" printHidden={false} onClick={() => selectTop(3)}>រើស Top 3</Button>
                                <Button variant="gold" size="sm" printHidden={false} onClick={() => selectTop(5)}>រើស Top 5</Button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto p-0">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-paper text-text-body sticky top-0 z-10">
                                    <tr>
                                        <th className="p-3 w-12 text-center">
                                            <input type="checkbox" checked={selectedStudentIds.length === studentsData.length && studentsData.length > 0} onChange={toggleAll} className="w-4 h-4 rounded border-divider text-brand" />
                                        </th>
                                        <th className="p-3 font-bold">ចំណាត់ថ្នាក់</th>
                                        <th className="p-3 font-bold">ឈ្មោះសិស្ស</th>
                                        <th className="p-3 font-bold">ភេទ</th>
                                        <th className="p-3 font-bold">ពិន្ទុសរុប</th>
                                        <th className="p-3 font-bold">មធ្យមភាគ</th>
                                        <th className="p-3 font-bold">និទ្ទេស</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-divider">
                                    {studentsData.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="p-8 text-center text-text-muted">
                                                <ListOrdered className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                                សូមរង់ចាំបន្តិច ទិន្នន័យកំពុងទាញយក...
                                            </td>
                                        </tr>
                                    ) : studentsData.map(stu => (
                                        <tr key={stu.id} className="hover:bg-paper transition-colors">
                                            <td className="p-3 text-center">
                                                <input type="checkbox" checked={selectedStudentIds.includes(stu.id)} onChange={() => toggleSelection(stu.id)} className="w-4 h-4 rounded border-divider text-brand" />
                                            </td>
                                            <td className="p-3 font-bold text-center">
                                                <span className={`inline-block w-6 h-6 text-center leading-6 rounded-full ${stu.rank === 1 ? 'bg-gold text-brand-950' : stu.rank === 2 ? 'bg-divider text-text-heading' : stu.rank === 3 ? 'bg-[#C4762A] text-white' : 'bg-paper text-text-muted'}`}>
                                                    {stu.rank}
                                                </span>
                                            </td>
                                            <td className="p-3 font-bold text-text-heading">{stu.name_kh || stu.full_name}</td>
                                            <td className="p-3">{stu.gender}</td>
                                            <td className="p-3 font-bold text-gold">{stu.total}</td>
                                            <td className="p-3 font-bold text-brand">{stu.average}</td>
                                            <td className="p-3 font-bold text-success">{stu.grade}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Print Area */}
            <div id="printContainer" className="hidden print:block">
                {selectedStudentsData.map(student => (
                    <div key={student.id} className="cert-page">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {templateUrl && <img src={templateUrl} className="cert-bg-image" alt="Template" />}
                        <div className="cert-content">
                            <div className="absolute text-center kh-moul leading-relaxed px-2 flex items-center justify-center" style={{ color: '#000080', width: '20%', left: '40%', top: '22%', height: '5%', fontSize: '16px' }}>
                                {certOffice}
                            </div>

                            <div className="absolute w-full text-center kh-moul" style={{ color: '#ff0000', top: '28%', fontSize: '20px' }}>
                                {certSchool}
                            </div>

                            <div className="absolute kh-moul w-full text-center" style={{ color: '#000080', top: '55%', fontSize: '24px' }}>
                                {student.name_kh || student.full_name}
                            </div>
                            
                            <div className="absolute kh-moul text-center" style={{ color: '#000080', top: '65%', left: '30%', width: '10%' }}>
                                {student.gender}
                            </div>
                            
                            <div className="absolute kh-moul text-center" style={{ color: '#000080', top: '65%', left: '46%', width: '10%' }}>
                                {certClass}
                            </div>

                            <div className="absolute kh-moul text-center" style={{ color: '#000080', top: '65%', left: '62%', width: '10%' }}>
                                {student.rank}
                            </div>
                            
                            <div className="absolute kh-moul text-center" style={{ color: '#000080', top: '65%', left: '76%', width: '15%' }}>
                                {student.average}
                            </div>

                            <div className="absolute kh-moul text-center" style={{ color: '#000080', top: '78%', left: '60%', width: '30%', fontSize: '14px' }}>
                                ធ្វើនៅ{certProvince} ថ្ងៃទី{solarDay} ខែ{solarMonth} ឆ្នាំ{solarYear}
                            </div>

                            {showPhoto && student.photo_url && (
                                <div className="absolute bg-white flex items-center justify-center overflow-hidden" style={{ left: '10%', bottom: '15%', width: '30mm', height: '40mm', border: '2px solid #000080' }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={student.photo_url} className="w-full h-full object-cover" alt="Student" />
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
