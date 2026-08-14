'use client'

import { useState, useCallback, useEffect } from 'react'
import { ArrowLeft, Award, RefreshCw, Image as ImageIcon, Camera, Printer, ListOrdered } from 'lucide-react'
import Link from 'next/link'
import { getAllScoresByPeriod } from '../score/total/actions'
import Select from '@/components/ui/forms/Select'
import type { Score, Settings, Student } from '@/lib/types'
import { MONTHS_BY_ACADEMIC_YEAR } from '@/lib/constants/months'

/** A student decorated with the scores and ranking fields the certificate prints. */
type ProcessedStudent = Student & {
    scores: Record<string, number | null>
    total?: number
    average?: string
    finalAverageForRank?: number
    rank?: number
}

const config = {
    monthly: {
        columns: ['kh_listen','kh_speak','kh_read','kh_write','kh_calligraphy','kh_recitation','kh_essay','math_num','math_meas','math_geo','math_alg','math_stat','sci_phy','sci_chem','sci_bio','sci_earth','sci_applied','soc_ethic','soc_geo','soc_hist','soc_home','pe_sport','health_hygiene','life_skill','foreign','ex_oral','ex_att','ex_book','ex_hw']
    },
    semester: {
        columns: ['sem_kh_reading','sem_kh_listening_speaking','sem_kh_dictation','sem_kh_essay','sem_math','sem_science','sem_moral_civics','sem_geo','sem_hist','sem_home_arts','sem_life_skills','sem_foreign','sem_sport']
    }
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

    const loadData = useCallback(async () => {
        const period = getScorePeriod()
        const records = await getAllScoresByPeriod(scoreType, period)
        
        const processedStudents: ProcessedStudent[] = initialStudents.map(stu => {
            const studentScores: Record<string, number | null> = {}
            records.filter((r: Score) => r.student_id === stu.id).forEach((r: Score) => {
                studentScores[r.subject] = r.score_value
            })
            return { ...stu, scores: studentScores }
        })

        processedStudents.forEach(stu => {
            let sum = 0
            let scoredSubjectsCount = 0

            const cols = scoreType === 'monthly' ? config.monthly.columns : (scoreType === 'semester' ? config.semester.columns : [])
            
            cols.forEach((key: string) => {
                const rawVal = stu.scores[key]
                if (rawVal !== null && rawVal !== undefined) {
                    const val = parseFloat(String(rawVal))
                    if (!isNaN(val)) {
                        sum += val
                        scoredSubjectsCount++
                    }
                }
            })
            
            if (scoreType === 'monthly') {
                stu.total = sum
                stu.average = scoredSubjectsCount > 0 ? (sum / scoredSubjectsCount).toFixed(2) : "0.00"
                stu.finalAverageForRank = parseFloat(stu.average)
            } else if (scoreType === 'yearly') {
                const s1 = parseFloat(String(stu.scores['sem1_avg'] ?? '0'))
                const s2 = parseFloat(String(stu.scores['sem2_avg'] ?? '0'))
                stu.total = s1 + s2
                stu.average = (stu.total / 2).toFixed(2)
                stu.finalAverageForRank = parseFloat(stu.average)
            } else { 
                stu.total = sum
                stu.average = scoredSubjectsCount > 0 ? (sum / scoredSubjectsCount).toFixed(2) : "0.00"
                stu.finalAverageForRank = parseFloat(stu.average)
            }

            const avgForGrade = stu.finalAverageForRank
            if (avgForGrade >= 9.0) stu.grade = 'A'
            else if (avgForGrade >= 8.0) stu.grade = 'B'
            else if (avgForGrade >= 7.0) stu.grade = 'C'
            else if (avgForGrade >= 6.0) stu.grade = 'D'
            else if (avgForGrade >= 5.0) stu.grade = 'E'
            else stu.grade = 'F'
        })

        processedStudents.sort((a, b) => (b.finalAverageForRank || 0) - (a.finalAverageForRank || 0))
        let currentRank = 1
        for (let i = 0; i < processedStudents.length; i++) {
            if (i > 0 && (processedStudents[i].finalAverageForRank || 0) < (processedStudents[i-1].finalAverageForRank || 0)) {
                currentRank = i + 1
            }
            processedStudents[i].rank = currentRank
        }

        setStudentsData(processedStudents)
    }, [scoreType, initialStudents, getScorePeriod])

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
            alert('សូមជ្រើសរើសសិស្សយ៉ាងហោចណាស់ម្នាក់!')
            return
        }
        if (!templateUrl) {
            alert('សូមជ្រើសរើសរូបភាពស៊ុម!')
            return
        }
        window.print()
    }

    const selectedStudentsData = studentsData.filter(s => selectedStudentIds.includes(s.id))

    return (
        <div className="bg-[#f0f4f8] min-h-screen text-slate-800 pb-20 print:bg-white print:m-0 print:p-0">
            <style jsx global>{`
                .font-moul { font-family: 'Moul', cursive; font-weight: normal; }
                .font-battambang { font-family: 'Battambang', cursive; }

                .input-field {
                    width: 100%;
                    padding: 0.75rem 1rem;
                    border-radius: 0.75rem;
                    border: 1px solid #e5e7eb;
                    background: #f9fafb;
                    font-family: 'Battambang', cursive;
                    outline: none;
                    transition: all 0.2s;
                }
                .input-field:focus { border-color: #0054a6; background: white; box-shadow: 0 0 0 3px rgba(0,84,166,0.1); }

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
                    <Link href="/dashboard" className="p-3 bg-white rounded-xl shadow-sm hover:shadow-md text-blue-600 transition-all border border-slate-200">
                        <ArrowLeft className="w-6 h-6" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-moul text-[#0054a6] flex items-center gap-3">
                            <Award className="w-8 h-8 text-yellow-500" /> បោះពុម្ពបណ្ណសរសើរ (Certificates)
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">ទាញយកទិន្នន័យពិន្ទុ និងចំណាត់ថ្នាក់ ដើម្បីបញ្ចូលក្នុងស៊ុមបណ្ណសរសើរដោយស្វ័យប្រវត្តិ</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="flex flex-col gap-6">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                            <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-700">
                                <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span> ជ្រើសរើសទិន្នន័យ
                            </h2>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-2">ប្រភេទពិន្ទុ</label>
                                    <div className="flex bg-slate-100 p-1 rounded-xl">
                                        <button onClick={() => setScoreType('monthly')} className={`flex-1 py-2 rounded-lg font-bold transition text-sm ${scoreType === 'monthly' ? 'bg-white shadow text-[#0054a6]' : 'text-slate-500 hover:bg-white/50'}`}>ប្រចាំខែ</button>
                                        <button onClick={() => setScoreType('semester')} className={`flex-1 py-2 rounded-lg font-bold transition text-sm ${scoreType === 'semester' ? 'bg-white shadow text-[#0054a6]' : 'text-slate-500 hover:bg-white/50'}`}>ប្រចាំឆមាស</button>
                                        <button onClick={() => setScoreType('yearly')} className={`flex-1 py-2 rounded-lg font-bold transition text-sm ${scoreType === 'yearly' ? 'bg-white shadow text-[#0054a6]' : 'text-slate-500 hover:bg-white/50'}`}>ប្រចាំឆ្នាំ</button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-600 mb-2">ឆ្នាំសិក្សា</label>
                                        <Select
                                            ariaLabel="ឆ្នាំសិក្សា"
                                            value={academicYear}
                                            onChange={setAcademicYear}
                                            options={['2025-2026', '2026-2027']}
                                        />
                                    </div>
                                    {scoreType === 'monthly' && (
                                        <div>
                                            <label className="block text-sm font-bold text-slate-600 mb-2">ខែ</label>
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
                                            <label className="block text-sm font-bold text-slate-600 mb-2">ឆមាស</label>
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

                                <button onClick={loadData} className="w-full bg-[#0054a6] text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-800 transition-colors shadow-lg shadow-blue-200 mt-2">
                                    <RefreshCw className="w-4 h-4" /> ទាញយកចំណាត់ថ្នាក់សិស្ស
                                </button>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                            <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-700">
                                <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span> រូបភាពស៊ុម & ព័ត៌មាន
                            </h2>

                            <div className="space-y-4">
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                    <label className="block text-sm font-bold text-slate-600 mb-2">ជ្រើសរើសស៊ុមពី Folder របស់អ្នក</label>
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

                                    <div className="relative w-full h-32 bg-white rounded-lg border border-slate-200 flex flex-col items-center justify-center overflow-hidden shadow-inner">
                                        {templateUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={templateUrl} className="absolute inset-0 w-full h-full object-cover z-0" alt="Preview" />
                                        ) : (
                                            <div className="relative z-10 text-center">
                                                <ImageIcon className="w-8 h-8 mx-auto text-slate-300 mb-1" />
                                                <p className="text-[11px] text-slate-400 font-bold">ទីតាំងបង្ហាញរូបភាព</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">ការិយាល័យ / មន្ទីរអប់រំ</label>
                                    <input type="text" value={certOffice} onChange={e => setCertOffice(e.target.value)} className="input-field py-2 text-sm text-green-800 font-bold" />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-600 mb-1">ឈ្មោះសាលា</label>
                                        <input type="text" value={certSchool} onChange={e => setCertSchool(e.target.value)} className="input-field py-2 text-sm text-green-800 font-bold" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-600 mb-1">ថ្នាក់ទី</label>
                                        <input type="text" value={certClass} onChange={e => setCertClass(e.target.value)} className="input-field py-2 text-sm text-red-600 font-bold" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">ធ្វើនៅ (ខេត្ត)</label>
                                    <input type="text" value={certProvince} onChange={e => setCertProvince(e.target.value)} className="input-field py-2 text-[11px] text-[#000080]" />
                                </div>

                                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-600 mb-1 flex items-center gap-2">
                                            <Camera className="w-4 h-4 text-[#0054a6]" /> ភ្ជាប់រូបថតសិស្ស (៤x៦)
                                        </label>
                                        <p className="text-[10px] text-slate-500">បើកដើម្បីទាញយករូបថតពីបញ្ជីឈ្មោះសិស្សមកបង្ហាញ</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={showPhoto} onChange={e => setShowPhoto(e.target.checked)} className="sr-only peer" />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0054a6]"></div>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden h-full min-h-[500px]">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col gap-4">
                            <div className="flex flex-wrap justify-between items-center gap-3">
                                <h2 className="font-bold text-lg flex items-center gap-2 text-slate-700">
                                    <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">3</span> បញ្ជីសិស្សទទួលបានចំណាត់ថ្នាក់
                                </h2>
                                <div className="flex items-center gap-3 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm w-full sm:w-auto justify-between">
                                    <span className="text-sm text-slate-500 font-bold px-3">បានជ្រើសរើស: {selectedStudentIds.length} នាក់</span>
                                    <button onClick={handlePrint} disabled={selectedStudentIds.length === 0} className="bg-green-600 text-white px-5 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-green-700 transition-colors shadow-md shadow-green-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap">
                                        <Printer className="w-4 h-4" /> បោះពុម្ពបណ្ណសរសើរ
                                    </button>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => selectTop(3)} className="px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg text-sm font-bold hover:bg-yellow-200 transition">រើស Top 3</button>
                                <button onClick={() => selectTop(5)} className="px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg text-sm font-bold hover:bg-yellow-200 transition">រើស Top 5</button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto p-0">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10">
                                    <tr>
                                        <th className="p-3 w-12 text-center">
                                            <input type="checkbox" checked={selectedStudentIds.length === studentsData.length && studentsData.length > 0} onChange={toggleAll} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                                        </th>
                                        <th className="p-3 font-bold">ចំណាត់ថ្នាក់</th>
                                        <th className="p-3 font-bold">ឈ្មោះសិស្ស</th>
                                        <th className="p-3 font-bold">ភេទ</th>
                                        <th className="p-3 font-bold">ពិន្ទុសរុប</th>
                                        <th className="p-3 font-bold">មធ្យមភាគ</th>
                                        <th className="p-3 font-bold">និទ្ទេស</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {studentsData.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="p-8 text-center text-slate-400">
                                                <ListOrdered className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                                សូមរង់ចាំបន្តិច ទិន្នន័យកំពុងទាញយក...
                                            </td>
                                        </tr>
                                    ) : studentsData.map(stu => (
                                        <tr key={stu.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-3 text-center">
                                                <input type="checkbox" checked={selectedStudentIds.includes(stu.id)} onChange={() => toggleSelection(stu.id)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                                            </td>
                                            <td className="p-3 font-bold text-center">
                                                <span className={`inline-block w-6 h-6 text-center leading-6 rounded-full ${stu.rank === 1 ? 'bg-yellow-400 text-white' : stu.rank === 2 ? 'bg-slate-300 text-white' : stu.rank === 3 ? 'bg-orange-400 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                                    {stu.rank}
                                                </span>
                                            </td>
                                            <td className="p-3 font-bold text-slate-800">{stu.name_kh || stu.full_name}</td>
                                            <td className="p-3">{stu.gender}</td>
                                            <td className="p-3 font-bold text-yellow-600">{stu.total}</td>
                                            <td className="p-3 font-bold text-blue-600">{stu.average}</td>
                                            <td className="p-3 font-bold text-green-600">{stu.grade}</td>
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
                            <div className="absolute text-center font-moul leading-relaxed px-2 flex items-center justify-center" style={{ color: '#000080', width: '20%', left: '40%', top: '22%', height: '5%', fontSize: '16px' }}>
                                {certOffice}
                            </div>

                            <div className="absolute w-full text-center font-moul" style={{ color: '#ff0000', top: '28%', fontSize: '20px' }}>
                                {certSchool}
                            </div>

                            <div className="absolute font-moul w-full text-center" style={{ color: '#000080', top: '55%', fontSize: '24px' }}>
                                {student.name_kh || student.full_name}
                            </div>
                            
                            <div className="absolute font-moul text-center" style={{ color: '#000080', top: '65%', left: '30%', width: '10%' }}>
                                {student.gender}
                            </div>
                            
                            <div className="absolute font-moul text-center" style={{ color: '#000080', top: '65%', left: '46%', width: '10%' }}>
                                {certClass}
                            </div>

                            <div className="absolute font-moul text-center" style={{ color: '#000080', top: '65%', left: '62%', width: '10%' }}>
                                {student.rank}
                            </div>
                            
                            <div className="absolute font-moul text-center" style={{ color: '#000080', top: '65%', left: '76%', width: '15%' }}>
                                {student.average}
                            </div>

                            <div className="absolute font-moul text-center" style={{ color: '#000080', top: '78%', left: '60%', width: '30%', fontSize: '14px' }}>
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
