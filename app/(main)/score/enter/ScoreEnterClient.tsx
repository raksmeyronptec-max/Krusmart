'use client'

import { useState, useEffect } from 'react'
import { CalendarCheck, Award, CalendarDays, Bookmark, Clock, BookOpen, Settings, FolderPlus, X, Mic, UserCheck, Book, Home, Save, Table2, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { getScores, saveScores } from './actions'

type Student = any

const behaviorOptions = ['ល្អ', 'ល្អបង្គួរ', 'មធ្យម', 'ខ្សោយ']

const subjectConfigs: Record<string, any[]> = {
    'khmer_all': [
        { id: 'kh_listen', label: 'ស្តាប់', width: '80px' },
        { id: 'kh_speak', label: 'និយាយ', width: '80px' },
        { id: 'kh_read', label: 'អាន', width: '80px' },
        { id: 'kh_write', label: 'សរសេរ', width: '80px' },
        { id: 'kh_calligraphy', label: 'អក្សរផ្ចង់', width: '80px' },
        { id: 'kh_recitation', label: 'មេសូត្រ', width: '80px' },
        { id: 'kh_essay', label: 'តែងសេចក្តី', width: '80px' }
    ],
    'math_general': [
        { id: 'math_num', label: 'ចំនួន', width: '70px' },
        { id: 'math_meas', label: 'រង្វាស់', width: '70px' },
        { id: 'math_geo', label: 'ធរណី', width: '70px' },
        { id: 'math_alg', label: 'ពីជគណិត', width: '70px' },
        { id: 'math_stat', label: 'ស្ថិតិ', width: '70px' }
    ],
    'science_all': [
        { id: 'sci_phy', label: 'រូប', width: '80px' },
        { id: 'sci_chem', label: 'គីមី', width: '80px' },
        { id: 'sci_bio', label: 'ជីវៈ', width: '80px' },
        { id: 'sci_earth', label: 'ផែនដី', width: '80px' },
        { id: 'sci_applied', label: 'អនុវត្តន៍', width: '80px' }
    ],
    'social_all': [
        { id: 'soc_ethic', label: 'សីលធម៌', width: '80px' },
        { id: 'soc_geo', label: 'ភូមិ', width: '80px' },
        { id: 'soc_hist', label: 'ប្រវត្តិ', width: '80px' },
        { id: 'soc_home', label: 'គេហៈ', width: '80px' }
    ],
    'health_all': [
        { id: 'pe_sport', label: 'អប់រំកាយ', width: '100px' },
        { id: 'health_hygiene', label: 'សុខភាព', width: '100px' }
    ],

    'kh_listen': [{ id: 'kh_listen', label: 'ស្តាប់', width: '120px' }],
    'kh_speak': [{ id: 'kh_speak', label: 'និយាយ', width: '120px' }],
    'kh_read': [{ id: 'kh_read', label: 'អាន', width: '120px' }],
    'kh_write': [{ id: 'kh_write', label: 'សរសេរ', width: '120px' }],
    'kh_calligraphy': [{ id: 'kh_calligraphy', label: 'អក្សរផ្ចង់', width: '120px' }],
    'kh_recitation': [{ id: 'kh_recitation', label: 'មេសូត្រ', width: '120px' }],
    'kh_essay': [{ id: 'kh_essay', label: 'តែងសេចក្តី', width: '120px' }],

    'math_num': [{ id: 'math_num', label: 'ចំនួន', width: '120px' }],
    'math_meas': [{ id: 'math_meas', label: 'រង្វាស់', width: '120px' }],
    'math_geo': [{ id: 'math_geo', label: 'ធរណី', width: '120px' }],
    'math_alg': [{ id: 'math_alg', label: 'ពីជគណិត', width: '120px' }],
    'math_stat': [{ id: 'math_stat', label: 'ស្ថិតិ', width: '120px' }],

    'sci_phy': [{ id: 'sci_phy', label: 'រូបវិទ្យា', width: '120px' }],
    'sci_chem': [{ id: 'sci_chem', label: 'គីមីវិទ្យា', width: '120px' }],
    'sci_bio': [{ id: 'sci_bio', label: 'ជីវវិទ្យា', width: '120px' }],
    'sci_earth': [{ id: 'sci_earth', label: 'ផែនដីវិទ្យា', width: '120px' }],
    'sci_applied': [{ id: 'sci_applied', label: 'វិទ្យាសាស្ត្រអនុវត្តន៍', width: '120px' }],

    'soc_ethic': [{ id: 'soc_ethic', label: 'សីលធម៌', width: '120px' }],
    'soc_geo': [{ id: 'soc_geo', label: 'ភូមិវិទ្យា', width: '120px' }],
    'soc_hist': [{ id: 'soc_hist', label: 'ប្រវត្តិវិទ្យា', width: '120px' }],
    'soc_home': [{ id: 'soc_home', label: 'គេហវិទ្យា', width: '120px' }],

    'pe_sport': [{ id: 'pe_sport', label: 'អប់រំកាយ', width: '120px' }],
    'health_hygiene': [{ id: 'health_hygiene', label: 'សុខភាព និងអនាម័យ', width: '120px' }],

    'life_skill': [{ id: 'life_skill', label: 'បំណិនជីវិត', width: '120px' }],
    'foreign': [{ id: 'foreign', label: 'ភាសាបរទេស', width: '120px' }],
    'ex_oral': [{ id: 'ex_oral', label: 'សំណួរផ្ទាល់មាត់', width: '120px' }],
    'ex_att': [{ id: 'ex_att', label: 'វត្តមាន', width: '120px' }],
    'ex_book': [{ id: 'ex_book', label: 'សៀវភៅ', width: '120px' }],
    'ex_hw': [{ id: 'ex_hw', label: 'កិច្ចការផ្ទះ', width: '120px' }],

    'sem_moral_civics': [{ id: 'sem_moral_civics', label: 'សីលធម៌-ពលរដ្ឋ', width: '150px' }],
    'sem_geo': [{ id: 'sem_geo', label: 'ភូមិវិទ្យា', width: '150px' }],
    'sem_hist': [{ id: 'sem_hist', label: 'ប្រវត្តិវិទ្យា', width: '150px' }],
    'sem_home_arts': [{ id: 'sem_home_arts', label: 'គេហៈ-សិល្បៈ', width: '150px' }],
    'sem_life_skills': [{ id: 'sem_life_skills', label: 'បំណិនជីវិត', width: '150px' }],
    'sem_foreign': [{ id: 'sem_foreign', label: 'ភាសាបរទេស', width: '150px' }],
    'sem_kh_reading': [{ id: 'sem_kh_reading', label: 'អំណាន', width: '150px' }],
    'sem_kh_listening_speaking': [{ id: 'sem_kh_listening_speaking', label: 'ស្តាប់-និយាយ', width: '150px' }],
    'sem_kh_dictation': [{ id: 'sem_kh_dictation', label: 'សរសេរតាមអាន', width: '150px' }],
    'sem_kh_essay': [{ id: 'sem_kh_essay', label: 'តែងសេចក្តី', width: '150px' }],
    'sem_math': [{ id: 'sem_math', label: 'គណិតវិទ្យា', width: '150px' }],
    'sem_science': [{ id: 'sem_science', label: 'វិទ្យាសាស្ត្រ', width: '150px' }],
    'sem_sport': [{ id: 'sem_sport', label: 'អប់រំកាយ-សុខភាព', width: '150px' }],

    'sem_behavior_all': [
        { id: 'sem_eval_knowledge', label: 'ចំណេះដឹង', width: '110px', type: 'select', options: behaviorOptions },
        { id: 'sem_eval_skill', label: 'បំណិន-ចំណេះធ្វើ', width: '110px', type: 'select', options: behaviorOptions },
        { id: 'sem_eval_moral', label: 'តម្លៃ-សីលធម៌', width: '110px', type: 'select', options: behaviorOptions },
        { id: 'sem_eval_participate', label: 'សាមគ្គីភាព-ការចូលរួម', width: '110px', type: 'select', options: behaviorOptions }
    ],
    'sem_eval_knowledge': [{ id: 'sem_eval_knowledge', label: 'ចំណេះដឹង', width: '150px', type: 'select', options: behaviorOptions }],
    'sem_eval_skill': [{ id: 'sem_eval_skill', label: 'បំណិន-ចំណេះធ្វើ', width: '150px', type: 'select', options: behaviorOptions }],
    'sem_eval_moral': [{ id: 'sem_eval_moral', label: 'តម្លៃ-សីលធម៌', width: '150px', type: 'select', options: behaviorOptions }],
    'sem_eval_participate': [{ id: 'sem_eval_participate', label: 'សាមគ្គីភាព-ការចូលរួម', width: '150px', type: 'select', options: behaviorOptions }]
}

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

export default function ScoreEnterClient({ initialStudents, userId }: { initialStudents: Student[], userId: string }) {
    const [scoreType, setScoreType] = useState('monthly')
    const [academicYear, setAcademicYear] = useState('2025-2026')
    const [semester, setSemester] = useState('sem1')
    const [month, setMonth] = useState('nov')
    const [subject, setSubject] = useState('math_general')

    const [scoresData, setScoresData] = useState<Record<string, Record<string, string | number | null>>>({})
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    const [customSubjects, setCustomSubjects] = useState<any[]>([])

    // Computed
    const scorePeriod = scoreType === 'monthly' ? `${month}-${academicYear}` : `${semester}-${academicYear}`
    const cols = subjectConfigs[subject] || []

    useEffect(() => {
        const local = localStorage.getItem('custom_subjects')
        if (local) {
            const parsed = JSON.parse(local)
            setCustomSubjects(parsed)
            parsed.forEach((s: any) => {
                subjectConfigs[s.id] = s.columns
            })
        }
    }, [])

    useEffect(() => {
        loadData()
    }, [scoreType, scorePeriod])

    useEffect(() => {
        // adjust default subject when changing type
        if (scoreType === 'monthly' && subject.startsWith('sem_')) {
            setSubject('math_general')
        } else if (scoreType === 'semester' && !subject.startsWith('sem_')) {
            setSubject('sem_math')
        }
    }, [scoreType])

    const loadData = async () => {
        setLoading(true)
        const records = await getScores(scoreType, scorePeriod)
        
        const newScoresData: Record<string, Record<string, any>> = {}
        initialStudents.forEach(stu => {
            newScoresData[stu.id] = {}
        })

        records.forEach((r: any) => {
            if (!newScoresData[r.student_id]) newScoresData[r.student_id] = {}
            newScoresData[r.student_id][r.subject] = r.score_value
        })
        
        setScoresData(newScoresData)
        setLoading(false)
    }

    const handleScoreChange = (studentId: string, subId: string, value: string) => {
        setScoresData(prev => ({
            ...prev,
            [studentId]: {
                ...(prev[studentId] || {}),
                [subId]: value
            }
        }))
    }

    const handleSave = async () => {
        setSaving(true)
        const payload: any[] = []
        
        Object.keys(scoresData).forEach(studentId => {
            Object.keys(scoresData[studentId]).forEach(subId => {
                payload.push({
                    student_id: studentId,
                    subject: subId,
                    score_value: scoresData[studentId][subId]
                })
            })
        })

        const res = await saveScores(scoreType, scorePeriod, payload)
        if (res.error) {
            alert('បរាជ័យក្នុងការរក្សាទុកពិន្ទុ: ' + res.error)
        } else {
            alert('រក្សាទុកពិន្ទុបានជោគជ័យ')
        }
        setSaving(false)
    }

    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [newSubName, setNewSubName] = useState('')
    const [newSubType, setNewSubType] = useState('both')
    const [newSubCols, setNewSubCols] = useState('')

    const submitNewSubject = () => {
        if (!newSubName.trim()) {
            alert('សូមបញ្ចូលឈ្មោះមុខវិជ្ជា')
            return
        }
        
        const id = 'custom_' + Date.now()
        let cols = []
        if (newSubCols.trim()) {
            const colNames = newSubCols.split(',').map(s => s.trim()).filter(s => s)
            cols = colNames.map((n, i) => ({ id: `${id}_${i}`, label: n, width: '120px' }))
        } else {
            cols = [{ id: `${id}_0`, label: newSubName.trim(), width: '120px' }]
        }

        const newSub = { id, name: newSubName.trim(), type: newSubType, columns: cols }
        const updated = [...customSubjects, newSub]
        setCustomSubjects(updated)
        subjectConfigs[id] = cols
        localStorage.setItem('custom_subjects', JSON.stringify(updated))
        
        setIsAddModalOpen(false)
        setSubject(id)
    }

    return (
        <div className="min-h-screen bg-[#f9fafb] text-[#1f2937] font-battambang pb-20">
            <style jsx global>{`
                .font-moul { font-family: 'Moul', cursive; font-weight: normal; }
                .font-battambang { font-family: 'Battambang', cursive; }
                
                .sticky-col { position: sticky; left: 0; z-index: 10; box-shadow: 2px 0 5px -2px rgba(0,0,0,0.05); }
                thead th.sticky-col { z-index: 20; }
                
                /* Hide number arrows */
                input[type=number]::-webkit-inner-spin-button, 
                input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
                input[type=number] { -moz-appearance: textfield; }
            `}</style>

            {/* Loading Overlay */}
            {(loading || saving) && (
                <div className="fixed inset-0 bg-white/80 z-[2000] flex flex-col justify-center items-center">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-2" />
                    <p className="font-bold text-gray-600">{saving ? 'កំពុងរក្សាទុក...' : 'កំពុងទាញយកទិន្នន័យ...'}</p>
                </div>
            )}

            <nav className="bg-indigo-900 text-white p-4 shadow-lg sticky top-0 z-50">
                <div className="container mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/dashboard" className="hover:text-indigo-200 transition-colors flex items-center gap-1">
                            <ArrowLeft className="w-5 h-5" /> ត្រឡប់
                        </Link>
                        <h1 className="font-moul text-lg hidden sm:block ml-2">បញ្ចូលពិន្ទុ (Online)</h1>
                    </div>
                    <div className="text-sm font-bold flex items-center gap-4">
                        <Link href="/score/total" className="hover:text-indigo-200 transition-colors flex items-center gap-1">
                            <Table2 className="w-4 h-4" /> តារាងពិន្ទុ
                        </Link>
                    </div>
                </div>
            </nav>

            <div className="container mx-auto p-4 md:p-6 mt-4 max-w-[1400px]">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
                    <div className="h-2 w-full bg-[#2da143]"></div>
                    
                    <div className="p-6 md:p-8">
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-gray-100 pb-4 mb-6 gap-4">
                            <div>
                                <h2 className="font-moul text-[#322a83] text-xl">ទម្រង់បញ្ចូលពិន្ទុសិស្ស</h2>
                                <p className="text-sm text-gray-500 mt-1">ទិន្នន័យនឹងត្រូវបានរក្សាទុកទៅក្នុង Database</p>
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                            <div className="col-span-1 md:col-span-2 lg:col-span-4 mb-2">
                                <label className="block text-xs font-bold text-gray-500 mb-2 ml-1">ជ្រើសរើសប្រភេទពិន្ទុ</label>
                                <div className="grid grid-cols-2 gap-3 max-w-sm">
                                    <button onClick={() => setScoreType('monthly')} className={`p-[0.6rem_1rem] rounded-lg font-bold transition flex items-center justify-center gap-2 text-[13px] border ${scoreType === 'monthly' ? 'bg-indigo-600 text-white border-transparent shadow-[0_2px_8px_rgba(79,70,229,0.2)]' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-600 hover:text-indigo-600 hover:bg-slate-50'}`}>
                                        <CalendarCheck className="w-4 h-4" />
                                        ពិន្ទុប្រចាំខែ
                                    </button>
                                    <button onClick={() => setScoreType('semester')} className={`p-[0.6rem_1rem] rounded-lg font-bold transition flex items-center justify-center gap-2 text-[13px] border ${scoreType === 'semester' ? 'bg-indigo-600 text-white border-transparent shadow-[0_2px_8px_rgba(79,70,229,0.2)]' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-600 hover:text-indigo-600 hover:bg-slate-50'}`}>
                                        <Award className="w-4 h-4" />
                                        ពិន្ទុប្រចាំឆមាស
                                    </button>
                                </div>
                            </div>

                            <div className="relative">
                                <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">ឆ្នាំសិក្សា</label>
                                <div className="relative">
                                    <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <select value={academicYear} onChange={e => setAcademicYear(e.target.value)} className="w-full p-[0.6rem_1rem_0.6rem_2.2rem] rounded-lg border border-gray-200 outline-none bg-white font-battambang font-bold text-gray-800 text-[13px] focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/10 appearance-none">
                                        <option value="2024-2025">2024-2025</option>
                                        <option value="2025-2026">2025-2026</option>
                                        <option value="2026-2027">2026-2027</option>
                                    </select>
                                </div>
                            </div>

                            {scoreType === 'semester' && (
                                <div className="relative">
                                    <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">ឆមាស</label>
                                    <div className="relative">
                                        <Bookmark className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <select value={semester} onChange={e => setSemester(e.target.value)} className="w-full p-[0.6rem_1rem_0.6rem_2.2rem] rounded-lg border border-gray-200 outline-none bg-white font-battambang font-bold text-gray-800 text-[13px] focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/10 appearance-none">
                                            <option value="sem1">ឆមាសទី១</option>
                                            <option value="sem2">ឆមាសទី២</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {scoreType === 'monthly' && (
                                <div className="relative">
                                    <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">ខែ</label>
                                    <div className="relative">
                                        <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <select value={month} onChange={e => setMonth(e.target.value)} className="w-full p-[0.6rem_1rem_0.6rem_2.2rem] rounded-lg border border-gray-200 outline-none bg-white font-battambang font-bold text-gray-800 text-[13px] focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/10 appearance-none">
                                            {allMonthsMap.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                            )}

                            <div className="relative lg:col-span-2">
                                <div className="flex justify-between items-end mb-1.5 ml-1">
                                    <label className="block text-xs font-bold text-gray-500">មុខវិជ្ជា</label>
                                    <div className="flex gap-2">
                                        <button onClick={() => setIsAddModalOpen(true)} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 transition-colors">
                                            <FolderPlus className="w-3 h-3" /> បន្ថែម
                                        </button>
                                    </div>
                                </div>
                                <div className="relative">
                                    <BookOpen className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <select value={subject} onChange={e => setSubject(e.target.value)} className="w-full p-[0.6rem_1rem_0.6rem_2.2rem] rounded-lg border border-gray-200 outline-none bg-white font-battambang font-bold text-gray-800 text-[13px] focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/10 appearance-none">
                                        {scoreType === 'monthly' ? (
                                            <>
                                                <option value="" disabled>ជ្រើសរើសមុខវិជ្ជា...</option>
                                                <optgroup label="ភាសាខ្មែរ">
                                                    <option value="khmer_all">ភាសាខ្មែរ (គ្រប់បំណិន)</option>
                                                    <option value="kh_listen">សមត្ថភាពស្តាប់</option>
                                                    <option value="kh_write">សមត្ថភាពសរសេរ</option>
                                                    <option value="kh_read">សមត្ថភាពអាន</option>
                                                    <option value="kh_speak">សមត្ថភាពនិយាយ</option>
                                                </optgroup>
                                                <optgroup label="គណិតវិទ្យា">
                                                    <option value="math_general">គណិតវិទ្យា (គ្រប់ផ្នែក)</option>
                                                </optgroup>
                                                {/* other monthly subjects */}
                                                <optgroup label="ការបំពេញបន្ថែម">
                                                    <option value="ex_oral">សំណួរផ្ទាល់មាត់</option>
                                                    <option value="ex_att">វត្តមាន</option>
                                                    <option value="ex_book">សៀវភៅ</option>
                                                    <option value="ex_hw">កិច្ចការផ្ទះ</option>
                                                </optgroup>
                                            </>
                                        ) : (
                                            <>
                                                <option value="" disabled>ជ្រើសរើសមុខវិជ្ជា...</option>
                                                <optgroup label="មុខវិជ្ជាសិក្សា">
                                                    <option value="sem_math">គណិតវិទ្យា</option>
                                                    <option value="sem_kh_reading">អំណាន</option>
                                                </optgroup>
                                                <optgroup label="ការវាយតម្លៃអាកប្បកិរិយា">
                                                    <option value="sem_behavior_all">វាយតម្លៃរួមទាំង៤</option>
                                                    <option value="sem_eval_knowledge">ចំណេះដឹង</option>
                                                </optgroup>
                                            </>
                                        )}
                                        {customSubjects.length > 0 && (
                                            <optgroup label="មុខវិជ្ជាបន្ថែម">
                                                {customSubjects.filter(s => s.type === scoreType || s.type === 'both').map(s => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Quick select monthly */}
                        {scoreType === 'monthly' && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                                <div onClick={() => setSubject('ex_oral')} className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg flex items-center gap-3 cursor-pointer hover:bg-indigo-100 transition">
                                    <div className="p-2 bg-white rounded-md shadow-sm text-indigo-600"><Mic className="w-4 h-4" /></div>
                                    <div>
                                        <p className="text-[10px] text-gray-500 font-bold uppercase">បញ្ចូលពិន្ទុ</p>
                                        <p className="text-xs md:text-sm font-bold text-indigo-900">សំណួរផ្ទាល់មាត់</p>
                                    </div>
                                </div>
                                <div onClick={() => setSubject('ex_att')} className="bg-green-50 border border-green-100 p-3 rounded-lg flex items-center gap-3 cursor-pointer hover:bg-green-100 transition">
                                    <div className="p-2 bg-white rounded-md shadow-sm text-green-600"><UserCheck className="w-4 h-4" /></div>
                                    <div>
                                        <p className="text-[10px] text-gray-500 font-bold uppercase">បញ្ចូលពិន្ទុ</p>
                                        <p className="text-xs md:text-sm font-bold text-green-900">វត្តមាន</p>
                                    </div>
                                </div>
                                <div onClick={() => setSubject('ex_book')} className="bg-purple-50 border border-purple-100 p-3 rounded-lg flex items-center gap-3 cursor-pointer hover:bg-purple-100 transition">
                                    <div className="p-2 bg-white rounded-md shadow-sm text-purple-600"><Book className="w-4 h-4" /></div>
                                    <div>
                                        <p className="text-[10px] text-gray-500 font-bold uppercase">បញ្ចូលពិន្ទុ</p>
                                        <p className="text-xs md:text-sm font-bold text-purple-900">សៀវភៅ</p>
                                    </div>
                                </div>
                                <div onClick={() => setSubject('ex_hw')} className="bg-orange-50 border border-orange-100 p-3 rounded-lg flex items-center gap-3 cursor-pointer hover:bg-orange-100 transition">
                                    <div className="p-2 bg-white rounded-md shadow-sm text-orange-600"><Home className="w-4 h-4" /></div>
                                    <div>
                                        <p className="text-[10px] text-gray-500 font-bold uppercase">បញ្ចូលពិន្ទុ</p>
                                        <p className="text-xs md:text-sm font-bold text-orange-900">កិច្ចការផ្ទះ</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Table */}
                        <div className="overflow-x-auto border border-gray-200 rounded-lg">
                            <table className="w-full border-collapse text-[13px]">
                                <thead>
                                    <tr>
                                        <th className="bg-slate-50 text-slate-700 font-bold p-3 border border-slate-200 whitespace-nowrap sticky-col left-0 text-left">សិស្ស ({initialStudents.length})</th>
                                        {cols.map(col => (
                                            <th key={col.id} className="bg-slate-50 text-slate-700 font-bold p-3 border border-slate-200 whitespace-nowrap text-center" style={{ width: col.width || '100px' }}>
                                                {col.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {initialStudents.map((stu, i) => (
                                        <tr key={stu.id} className="bg-white hover:bg-slate-50 border-b border-slate-200 transition-colors">
                                            <td className="p-[6px_12px] border-r border-slate-200 sticky-col left-0 font-bold text-slate-800 bg-white group-hover:bg-slate-50 truncate max-w-[200px]">
                                                {i+1}. {stu.name_kh || stu.full_name}
                                            </td>
                                            {cols.map(col => (
                                                <td key={col.id} className="p-[6px_12px] border-r border-slate-200 text-center">
                                                    {col.type === 'select' ? (
                                                        <select 
                                                            className="w-full max-w-[95px] text-center text-center-last p-1.5 rounded-[0.375rem] border border-slate-200 outline-none text-green-700 bg-slate-50 font-bold text-[13px] cursor-pointer focus:bg-white focus:border-green-700 focus:ring-2 focus:ring-green-700/10"
                                                            value={scoresData[stu.id]?.[col.id] || ''}
                                                            onChange={e => handleScoreChange(stu.id, col.id, e.target.value)}
                                                        >
                                                            <option value="" disabled></option>
                                                            {col.options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                                                        </select>
                                                    ) : (
                                                        <input 
                                                            type="number"
                                                            step="0.01"
                                                            className="w-full max-w-[80px] text-center p-1.5 rounded-[0.375rem] border border-slate-200 outline-none text-indigo-600 bg-slate-50 font-bold text-[13px] focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/10"
                                                            placeholder="-"
                                                            value={scoresData[stu.id]?.[col.id] || ''}
                                                            onChange={e => handleScoreChange(stu.id, col.id, e.target.value)}
                                                        />
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col md:flex-row gap-4 mt-6 pt-6 border-t border-gray-100">
                            <button onClick={handleSave} className="flex-1 py-3 bg-[#2da143] hover:bg-[#238535] text-white rounded-lg font-bold shadow-sm transition flex justify-center items-center gap-2">
                                <Save className="w-5 h-5" /> រក្សាទុកពិន្ទុ
                            </button>
                            <Link href="/score/total" className="flex-1 py-3 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg font-bold transition flex justify-center items-center gap-2">
                                <Table2 className="w-5 h-5" /> មើលតារាងពិន្ទុសរុប
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Add Subject Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-[1000] flex justify-center items-center p-4">
                    <div className="bg-white p-6 rounded-xl shadow-2xl max-w-md w-full">
                        <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                            <h3 className="font-moul text-[#322a83] text-lg flex items-center gap-2">
                                <FolderPlus className="w-5 h-5" /> បន្ថែមមុខវិជ្ជាថ្មី
                            </h3>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-red-500 transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">ឈ្មោះមុខវិជ្ជា <span className="text-red-500">*</span></label>
                                <input value={newSubName} onChange={e => setNewSubName(e.target.value)} type="text" className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm" placeholder="ឧ. កុំព្យូទ័រ, ភាសាចិន..." />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">ប្រើសម្រាប់</label>
                                <select value={newSubType} onChange={e => setNewSubType(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm">
                                    <option value="monthly">ប្រចាំខែ ប៉ុណ្ណោះ</option>
                                    <option value="semester">ប្រចាំឆមាស ប៉ុណ្ណោះ</option>
                                    <option value="both">ប្រចាំខែ និងប្រចាំឆមាស</option>
                                </select>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">ជួរឈរពិន្ទុ (ជម្រើស)</label>
                                <p className="text-[11px] text-gray-500 mb-2 leading-relaxed">
                                    បើមុខវិជ្ជានេះមានច្រើនជួរឈរ សូមសរសេរខណ្ឌដោយសញ្ញាក្បៀស (,) ឧ. <strong>ទ្រឹស្តី, អនុវត្តន៍</strong>។ បើទុកទទេ វានឹងយកឈ្មោះមុខវិជ្ជាជាជួរឈរតែមួយ។
                                </p>
                                <input value={newSubCols} onChange={e => setNewSubCols(e.target.value)} type="text" className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm" placeholder="ឧ. ទ្រឹស្តី, អនុវត្តន៍" />
                            </div>
                        </div>
                        
                        <div className="flex gap-3 mt-6 pt-2">
                            <button onClick={() => setIsAddModalOpen(false)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold transition">បោះបង់</button>
                            <button onClick={submitNewSubject} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition flex justify-center items-center gap-2">
                                <Save className="w-4 h-4" /> រក្សាទុក
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
// Add ArrowLeft icon to lucide-react import
import { ArrowLeft } from 'lucide-react'
