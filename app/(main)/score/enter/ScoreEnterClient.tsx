'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { CalendarCheck, Award, CalendarDays, Bookmark, Clock, BookOpen, FolderPlus, X, Mic, UserCheck, Book, Home, Save, Table2, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { getScores, saveScores } from './actions'
import Select from '@/components/ui/forms/Select'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import { scoreCellValue } from '@/lib/utils/score-value'
import type { Score, ScoreInput, Student } from '@/lib/types'

const behaviorOptions = ['ល្អ', 'ល្អបង្គួរ', 'មធ្យម', 'ខ្សោយ']

/** One editable column of the score grid. */
interface SubjectColumn {
    id: string
    label: string
    width?: string
    type?: string
    options?: string[]
}

const subjectConfigs: Record<string, SubjectColumn[]> = {
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

export default function ScoreEnterClient({ initialStudents}: { initialStudents: Student[] }) {
    const [scoreType, setScoreType] = useState<'monthly' | 'semester'>('monthly')
    const [academicYear, setAcademicYear] = useState('2025-2026')
    const [semester, setSemester] = useState('sem1')
    const [month, setMonth] = useState('nov')
    const [selectedSubject, setSubject] = useState('math_general')

    const [scoresData, setScoresData] = useState<Record<string, Record<string, string | number | null>>>({})
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    // Supabase-backed since migration 00012; the hook imports a browser's old
    // localStorage copy once, then reads from the database.
    const { subjects: customSubjects, reload: reloadCustomSubjects } = useCustomSubjects()

    // Computed
    const scorePeriod = scoreType === 'monthly' ? `${month}-${academicYear}` : `${semester}-${academicYear}`
    // Semester subjects are prefixed `sem_`. If the teacher switches score type
    // while a subject from the other set is picked, fall back to that set's
    // default. Derived during render — this used to be an effect that re-set state.
    const subject = scoreType === 'monthly' && selectedSubject.startsWith('sem_') ? 'math_general'
        : scoreType === 'semester' && !selectedSubject.startsWith('sem_') ? 'sem_math'
        : selectedSubject
    const cols = subjectConfigs[subject] || []

    // Subject list for the picker — built per score type, with the teacher's
    // own localStorage subjects appended under their own heading.
    const subjectOptions = useMemo(() => {
        const base = scoreType === 'monthly'
            ? [
                { value: 'khmer_all', label: 'ភាសាខ្មែរ (គ្រប់បំណិន)', group: 'ភាសាខ្មែរ' },
                { value: 'kh_listen', label: 'សមត្ថភាពស្តាប់', group: 'ភាសាខ្មែរ' },
                { value: 'kh_write', label: 'សមត្ថភាពសរសេរ', group: 'ភាសាខ្មែរ' },
                { value: 'kh_read', label: 'សមត្ថភាពអាន', group: 'ភាសាខ្មែរ' },
                { value: 'kh_speak', label: 'សមត្ថភាពនិយាយ', group: 'ភាសាខ្មែរ' },
                { value: 'math_general', label: 'គណិតវិទ្យា (គ្រប់ផ្នែក)', group: 'គណិតវិទ្យា' },
                { value: 'ex_oral', label: 'សំណួរផ្ទាល់មាត់', group: 'ការបំពេញបន្ថែម' },
                { value: 'ex_att', label: 'វត្តមាន', group: 'ការបំពេញបន្ថែម' },
                { value: 'ex_book', label: 'សៀវភៅ', group: 'ការបំពេញបន្ថែម' },
                { value: 'ex_hw', label: 'កិច្ចការផ្ទះ', group: 'ការបំពេញបន្ថែម' },
            ]
            : [
                { value: 'sem_math', label: 'គណិតវិទ្យា', group: 'មុខវិជ្ជាសិក្សា' },
                { value: 'sem_kh_reading', label: 'អំណាន', group: 'មុខវិជ្ជាសិក្សា' },
                { value: 'sem_behavior_all', label: 'វាយតម្លៃរួមទាំង៤', group: 'ការវាយតម្លៃអាកប្បកិរិយា' },
                { value: 'sem_eval_knowledge', label: 'ចំណេះដឹង', group: 'ការវាយតម្លៃអាកប្បកិរិយា' },
            ]

        const custom = customSubjects
            .filter(s => appliesTo(s, scoreType))
            .map(s => ({ value: s.id, label: s.name, group: 'មុខវិជ្ជាបន្ថែម' }))

        return [...base, ...custom]
    }, [scoreType, customSubjects])

    // `subjectConfigs` is the grid's column lookup, keyed by picker value.
    useEffect(() => {
        customSubjects.forEach(s => {
            subjectConfigs[s.id] = s.columns
        })
    }, [customSubjects])

    const loadData = useCallback(async () => {
        setLoading(true)
        const records = await getScores(scoreType, scorePeriod)
        
        const newScoresData: Record<string, Record<string, string | number | null>> = {}
        initialStudents.forEach(stu => {
            newScoresData[stu.id] = {}
        })

        records.forEach((r: Score) => {
            if (!newScoresData[r.student_id]) newScoresData[r.student_id] = {}
            // Behavioural ratings live in `score_text`, numeric marks in
            // `score_value`; the grid renders one cell either way.
            newScoresData[r.student_id][r.subject] = scoreCellValue(r)
        })
        
        setScoresData(newScoresData)
        setLoading(false)
    }, [scoreType, scorePeriod, initialStudents])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is set after await, not synchronously during the effect
        loadData()
    }, [scoreType, scorePeriod, loadData])



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
        const payload: ScoreInput[] = []
        
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
    const [newSubType, setNewSubType] = useState<CustomSubjectScope>('both')
    const [newSubCols, setNewSubCols] = useState('')

    const submitNewSubject = async () => {
        if (!newSubName.trim()) {
            toast.error('សូមបញ្ចូលឈ្មោះមុខវិជ្ជា')
            return
        }
        
        const id = 'custom_' + Date.now()
        let cols: { id: string; label: string; width: string }[] = []
        if (newSubCols.trim()) {
            const colNames = newSubCols.split(',').map(s => s.trim()).filter(s => s)
            cols = colNames.map((n, i) => ({ id: `${id}_${i}`, label: n, width: '120px' }))
        } else {
            cols = [{ id: `${id}_0`, label: newSubName.trim(), width: '120px' }]
        }

        const res = await createCustomSubject(newSubName.trim(), newSubType, cols)
        if (res.error || !res.data) {
            toast.error(res.error ?? 'រក្សាទុកមុខវិជ្ជាមិនបានសម្រេច')
            return
        }

        // Key the column lookup by the row's real id — the local `id` above only
        // ever seeded the column ids, which the server stored verbatim.
        subjectConfigs[res.data.id] = res.data.columns
        await reloadCustomSubjects()

        setIsAddModalOpen(false)
        setSubject(res.data.id)
        toast.success('បានបន្ថែមមុខវិជ្ជាថ្មី')
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

                            <Select
                                label="ឆ្នាំសិក្សា"
                                value={academicYear}
                                onChange={setAcademicYear}
                                options={['2024-2025', '2025-2026', '2026-2027']}
                                leadingIcon={<CalendarDays />}
                            />

                            {scoreType === 'semester' && (
                                <Select
                                    label="ឆមាស"
                                    value={semester}
                                    onChange={setSemester}
                                    options={[
                                        { value: 'sem1', label: 'ឆមាសទី១' },
                                        { value: 'sem2', label: 'ឆមាសទី២' },
                                    ]}
                                    leadingIcon={<Bookmark />}
                                />
                            )}

                            {scoreType === 'monthly' && (
                                <Select
                                    label="ខែ"
                                    value={month}
                                    onChange={setMonth}
                                    options={ACADEMIC_MONTH_OPTIONS_BY_ID}
                                    leadingIcon={<Clock />}
                                />
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
                                <SearchableSelect
                                    ariaLabel="មុខវិជ្ជា"
                                    placeholder="ជ្រើសរើសមុខវិជ្ជា..."
                                    value={subject}
                                    onChange={setSubject}
                                    options={subjectOptions}
                                    leadingIcon={<BookOpen />}
                                />
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
                                                            {col.options?.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                                                        </select>
                                                    ) : (
                                                        <input 
                                                            type="number"
                                                            step="0.01"
                                                            className="w-full max-w-[80px] min-h-[44px] sm:min-h-0 text-center p-1.5 rounded-[0.375rem] border border-slate-200 outline-none text-indigo-600 bg-slate-50 font-bold text-[16px] sm:text-[13px] focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/10"
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
                <div className="fixed inset-0 bg-black/50 z-[1000] flex justify-center items-end sm:items-center p-0 sm:p-4">
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
                            
                            <Select
                                label="ប្រើសម្រាប់"
                                value={newSubType}
                                onChange={v => setNewSubType(v as CustomSubjectScope)}
                                options={[
                                    { value: 'monthly', label: 'ប្រចាំខែ ប៉ុណ្ណោះ' },
                                    { value: 'semester', label: 'ប្រចាំឆមាស ប៉ុណ្ណោះ' },
                                    { value: 'both', label: 'ប្រចាំខែ និងប្រចាំឆមាស' },
                                ]}
                            />
                            
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
import { ACADEMIC_MONTH_OPTIONS_BY_ID } from '@/lib/constants/months'
import toast from 'react-hot-toast'
import { useCustomSubjects } from '@/lib/hooks/useCustomSubjects'
import { createCustomSubject } from '@/app/(main)/score/custom-subjects/actions'
import { appliesTo } from '@/lib/storage/custom-subjects'
import type { CustomSubjectScope } from '@/lib/types'
