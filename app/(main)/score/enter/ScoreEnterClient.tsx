'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
    CalendarCheck, Award, CalendarDays, Bookmark, Clock, BookOpen, FolderPlus,
    Mic, UserCheck, Book, Home, Save, Table2, Loader2,
} from 'lucide-react'

import { Button } from '@/components/ui/actions/Button'
import { Dialog } from '@/components/ui/overlay/Dialog'
import { useConfirm } from '@/components/ui/overlay/ConfirmDialog'
import { notify } from '@/components/ui/feedback/notify'
import { PageContainer, PageHeader } from '@/components/shell/PageContainer'
import { controlClass, fieldLabel, requiredMark } from '@/components/ui/forms/fieldStyles'
import Select from '@/components/ui/forms/Select'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import { ScoreEntryCards } from './ScoreEntryCards'

import { getScores, saveScores } from './actions'
import { createCustomSubject } from '@/app/(main)/score/custom-subjects/actions'
import { useCustomSubjects } from '@/lib/hooks/useCustomSubjects'
import { appliesTo } from '@/lib/storage/custom-subjects'
import { scoreCellValue } from '@/lib/utils/score-value'
import { ACADEMIC_MONTH_OPTIONS_BY_ID } from '@/lib/constants/months'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import type { CustomSubjectScope, Score, ScoreInput, Student } from '@/lib/types'

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
    // Was hard-coded `'2025-2026'`, which silently became the wrong year every
    // November. The picker still offers the neighbouring years either side.
    const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear)
    const [semester, setSemester] = useState('sem1')
    const [month, setMonth] = useState('nov')
    const [selectedSubject, setSubject] = useState('math_general')

    const [scoresData, setScoresData] = useState<Record<string, Record<string, string | number | null>>>({})
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    /**
     * Marks typed but not yet saved.
     *
     * Changing the month, the subject or the score type re-runs `loadData`,
     * which replaces `scoresData` wholesale. A teacher who typed thirty marks
     * and then touched a picker lost all thirty without a word. Every control
     * that triggers a reload now goes through `switchTo`, which asks first.
     */
    const [dirty, setDirty] = useState(false)
    const { confirm, dialog } = useConfirm()

    // Supabase-backed since migration 00012; the hook imports a browser's old
    // localStorage copy once, then reads from the database.
    const { subjects: customSubjects, reload: reloadCustomSubjects } = useCustomSubjects()

    // Computed
    const scorePeriod = scoreType === 'monthly' ? `${month}-${academicYear}` : `${semester}-${academicYear}`

    // The current year plus one either side, so the list follows the calendar
    // instead of expiring — it used to be three hard-coded strings.
    const academicYearOptions = useMemo(() => {
        const start = parseInt(getCurrentAcademicYear().split('-')[0], 10)
        return [start - 1, start, start + 1].map((y) => `${y}-${y + 1}`)
    }, [])

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
        setDirty(true)
        setScoresData(prev => ({
            ...prev,
            [studentId]: {
                ...(prev[studentId] || {}),
                [subId]: value
            }
        }))
    }

    /**
     * Run a control change that will discard the grid, asking first if there is
     * anything to lose. The change is applied only on confirmation, so
     * cancelling leaves the picker where it was.
     */
    const switchTo = async (apply: () => void) => {
        if (dirty && !(await confirm({
            title: 'ពិន្ទុមិនទាន់រក្សាទុក',
            message: 'អ្នកបានបញ្ចូលពិន្ទុដែលមិនទាន់រក្សាទុក។ ប្តូរទៅទិន្នន័យផ្សេងនឹងបាត់បង់ពិន្ទុទាំងនោះ។',
            tone: 'warning',
            confirmLabel: 'បន្ត​ដោយមិនរក្សាទុក',
        }))) return
        setDirty(false)
        apply()
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
            notify.error('បរាជ័យក្នុងការរក្សាទុកពិន្ទុ៖ ' + res.error)
        } else {
            setDirty(false)
            notify.success('រក្សាទុកពិន្ទុបានជោគជ័យ')
        }
        setSaving(false)
    }

    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [newSubName, setNewSubName] = useState('')
    const [newSubType, setNewSubType] = useState<CustomSubjectScope>('both')
    const [newSubCols, setNewSubCols] = useState('')

    const submitNewSubject = async () => {
        if (!newSubName.trim()) {
            notify.error('សូមបញ្ចូលឈ្មោះមុខវិជ្ជា')
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
            notify.error(res.error ?? 'រក្សាទុកមុខវិជ្ជាមិនបានសម្រេច')
            return
        }

        // Key the column lookup by the row's real id — the local `id` above only
        // ever seeded the column ids, which the server stored verbatim.
        subjectConfigs[res.data.id] = res.data.columns
        await reloadCustomSubjects()

        setIsAddModalOpen(false)
        setSubject(res.data.id)
        notify.success('បានបន្ថែមមុខវិជ្ជាថ្មី')
    }

    return (
        <PageContainer className="font-battambang">
            <style jsx global>{`
                .font-battambang { font-family: 'Battambang', cursive; }
                
                .sticky-col { position: sticky; left: 0; z-index: 10; box-shadow: 2px 0 5px -2px rgba(0,0,0,0.05); }
                thead th.sticky-col { z-index: 20; }
                
                /* Hide number arrows */
                input[type=number]::-webkit-inner-spin-button, 
                input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
                input[type=number] { -moz-appearance: textfield; }
            `}</style>

            <PageHeader
                title="ទម្រង់បញ្ចូលពិន្ទុសិស្ស"
                description="ជ្រើសរើសប្រភេទពិន្ទុ ខែ និងមុខវិជ្ជា រួចបញ្ចូលពិន្ទុសិស្ស"
                actions={
                    <Link
                        href="/score/total"
                        className="flex min-h-11 items-center gap-2 rounded-lg border border-divider bg-bg-surface px-4 text-[13px] font-bold text-text-body transition hover:border-brand-400 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                        <Table2 className="h-4 w-4" aria-hidden="true" /> តារាងពិន្ទុសរុប
                    </Link>
                }
            />

            <div>
                    <div>
                        {/* Controls */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                            <div className="col-span-1 md:col-span-2 lg:col-span-4 mb-2">
                                <label className="block text-xs font-bold text-text-muted mb-2 ml-1">ជ្រើសរើសប្រភេទពិន្ទុ</label>
                                <div className="grid grid-cols-2 gap-3 max-w-sm">
                                    <button onClick={() => switchTo(() => setScoreType('monthly'))} className={`p-[0.6rem_1rem] rounded-lg font-bold transition flex items-center justify-center gap-2 text-[13px] border ${scoreType === 'monthly' ? 'bg-brand text-white border-transparent shadow-[0_2px_8px_rgba(79,70,229,0.2)]' : 'bg-bg-surface text-text-muted border-divider hover:border-brand hover:text-brand hover:bg-paper'}`}>
                                        <CalendarCheck className="w-4 h-4" />
                                        ពិន្ទុប្រចាំខែ
                                    </button>
                                    <button onClick={() => switchTo(() => setScoreType('semester'))} className={`p-[0.6rem_1rem] rounded-lg font-bold transition flex items-center justify-center gap-2 text-[13px] border ${scoreType === 'semester' ? 'bg-brand text-white border-transparent shadow-[0_2px_8px_rgba(79,70,229,0.2)]' : 'bg-bg-surface text-text-muted border-divider hover:border-brand hover:text-brand hover:bg-paper'}`}>
                                        <Award className="w-4 h-4" />
                                        ពិន្ទុប្រចាំឆមាស
                                    </button>
                                </div>
                            </div>

                            <Select
                                label="ឆ្នាំសិក្សា"
                                value={academicYear}
                                onChange={(v) => switchTo(() => setAcademicYear(v))}
                                options={academicYearOptions}
                                leadingIcon={<CalendarDays />}
                            />

                            {scoreType === 'semester' && (
                                <Select
                                    label="ឆមាស"
                                    value={semester}
                                    onChange={(v) => switchTo(() => setSemester(v))}
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
                                    onChange={(v) => switchTo(() => setMonth(v))}
                                    options={ACADEMIC_MONTH_OPTIONS_BY_ID}
                                    leadingIcon={<Clock />}
                                />
                            )}

                            <div className="relative lg:col-span-2">
                                <div className="flex justify-between items-end mb-1.5 ml-1">
                                    <label className="block text-xs font-bold text-text-muted">មុខវិជ្ជា</label>
                                    <div className="flex gap-2">
                                        <Button size="sm" printHidden={false} onClick={() => setIsAddModalOpen(true)}>
                                            <FolderPlus className="w-3 h-3" /> បន្ថែម
                                        </Button>
                                    </div>
                                </div>
                                <SearchableSelect
                                    ariaLabel="មុខវិជ្ជា"
                                    placeholder="ជ្រើសរើសមុខវិជ្ជា..."
                                    value={subject}
                                    onChange={(v) => switchTo(() => setSubject(v))}
                                    options={subjectOptions}
                                    leadingIcon={<BookOpen />}
                                />
                            </div>
                        </div>

                        {/* Quick select monthly */}
                        {scoreType === 'monthly' && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                                <div onClick={() => switchTo(() => setSubject('ex_oral'))} className="bg-brand-100 border border-divider p-3 rounded-lg flex items-center gap-3 cursor-pointer hover:bg-brand-100 transition">
                                    <div className="p-2 bg-bg-surface rounded-md shadow-sm text-brand"><Mic className="w-4 h-4" /></div>
                                    <div>
                                        <p className="text-[10px] text-text-muted font-bold uppercase">បញ្ចូលពិន្ទុ</p>
                                        <p className="text-xs md:text-sm font-bold text-text-heading">សំណួរផ្ទាល់មាត់</p>
                                    </div>
                                </div>
                                <div onClick={() => switchTo(() => setSubject('ex_att'))} className="bg-success/10 border border-divider p-3 rounded-lg flex items-center gap-3 cursor-pointer hover:bg-success/10 transition">
                                    <div className="p-2 bg-bg-surface rounded-md shadow-sm text-success"><UserCheck className="w-4 h-4" /></div>
                                    <div>
                                        <p className="text-[10px] text-text-muted font-bold uppercase">បញ្ចូលពិន្ទុ</p>
                                        <p className="text-xs md:text-sm font-bold text-success">វត្តមាន</p>
                                    </div>
                                </div>
                                <div onClick={() => switchTo(() => setSubject('ex_book'))} className="bg-brand-100 border border-divider p-3 rounded-lg flex items-center gap-3 cursor-pointer hover:bg-brand-100 transition">
                                    <div className="p-2 bg-bg-surface rounded-md shadow-sm text-brand"><Book className="w-4 h-4" /></div>
                                    <div>
                                        <p className="text-[10px] text-text-muted font-bold uppercase">បញ្ចូលពិន្ទុ</p>
                                        <p className="text-xs md:text-sm font-bold text-brand-800">សៀវភៅ</p>
                                    </div>
                                </div>
                                <div onClick={() => switchTo(() => setSubject('ex_hw'))} className="bg-warning/10 border border-divider p-3 rounded-lg flex items-center gap-3 cursor-pointer hover:bg-warning/15 transition">
                                    <div className="p-2 bg-bg-surface rounded-md shadow-sm text-warning"><Home className="w-4 h-4" /></div>
                                    <div>
                                        <p className="text-[10px] text-text-muted font-bold uppercase">បញ្ចូលពិន្ទុ</p>
                                        <p className="text-xs md:text-sm font-bold text-warning">កិច្ចការផ្ទះ</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/*
                          The grid, on screens that can hold it. Below `lg` the
                          same state is rendered as one card per pupil — see
                          `ScoreEntryCards` for why a table is the wrong control
                          for a phone.
                        */}
                        <div className="hidden overflow-x-auto rounded-lg border border-divider lg:block">
                            <table className="w-full border-collapse text-[13px]">
                                <thead>
                                    <tr>
                                        <th className="bg-paper text-text-body font-bold p-3 border border-divider whitespace-nowrap sticky-col left-0 text-left">សិស្ស ({initialStudents.length})</th>
                                        {cols.map(col => (
                                            <th key={col.id} className="bg-paper text-text-body font-bold p-3 border border-divider whitespace-nowrap text-center" style={{ width: col.width || '100px' }}>
                                                {col.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {initialStudents.map((stu, i) => (
                                        <tr key={stu.id} className="bg-bg-surface hover:bg-paper border-b border-divider transition-colors">
                                            <td className="p-[6px_12px] border-r border-divider sticky-col left-0 font-bold text-text-heading bg-bg-surface group-hover:bg-paper truncate max-w-[200px]">
                                                {i+1}. {stu.name_kh || stu.full_name}
                                            </td>
                                            {cols.map(col => (
                                                <td key={col.id} className="p-[6px_12px] border-r border-divider text-center">
                                                    {col.type === 'select' ? (
                                                        <select 
                                                            className="w-full max-w-[95px] text-center text-center-last p-1.5 rounded-[0.375rem] border border-divider outline-none text-success bg-paper font-bold text-[13px] cursor-pointer focus:bg-bg-surface focus:border-success focus:ring-2 focus:ring-success/10"
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
                                                            className="w-full max-w-[80px] min-h-[44px] sm:min-h-0 text-center p-1.5 rounded-[0.375rem] border border-divider outline-none text-brand bg-paper font-bold text-[16px] sm:text-[13px] focus:bg-bg-surface focus:border-brand focus:ring-2 focus:ring-focus-ring/10"
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

                        <div className="lg:hidden">
                            <ScoreEntryCards
                                students={initialStudents}
                                columns={cols}
                                values={scoresData}
                                onChange={handleScoreChange}
                            />
                        </div>

                        {/*
                          The save bar sticks to the bottom of the viewport.
                          With one card per pupil the button was previously a
                          scroll away from wherever the teacher was typing, and
                          nothing else on this page tells them work is pending.
                        */}
                        <div className="sticky bottom-4 z-20 mt-6 flex flex-col gap-3 rounded-xl border border-divider bg-bg-surface p-3 shadow-lg sm:flex-row sm:items-center">
                            {/*
                              Status lives here rather than in the full-screen
                              spinner this page used to throw up. Blanking the
                              whole surface to say "loading" hides the marks the
                              teacher is in the middle of reading.
                            */}
                            <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-text-muted">
                                {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" aria-hidden="true" />}
                                {loading
                                    ? 'កំពុងទាញយកទិន្នន័យ...'
                                    : dirty ? 'មានពិន្ទុមិនទាន់រក្សាទុក' : 'ពិន្ទុទាំងអស់បានរក្សាទុករួចរាល់'}
                            </p>
                            <Button
                                variant="success"
                                size="lg"
                                printHidden={false}
                                onClick={handleSave}
                                loading={saving}
                                icon={<Save className="h-5 w-5" />}
                            >
                                រក្សាទុកពិន្ទុ
                            </Button>
                        </div>
                    </div>
            </div>

            {/*
              Add a custom subject. The previous overlay had no focus trap, no
              Escape handler and no accessible name — `Dialog` supplies all
              three, and rises from the bottom on a phone.
            */}
            <Dialog
                open={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                title="បន្ថែមមុខវិជ្ជាថ្មី"
                description="មុខវិជ្ជាថ្មីនឹងបង្ហាញនៅក្នុងបញ្ជីជ្រើសរើសមុខវិជ្ជា"
                footer={
                    <>
                        <Button variant="secondary" printHidden={false} onClick={() => setIsAddModalOpen(false)}>
                            បោះបង់
                        </Button>
                        <Button printHidden={false} onClick={submitNewSubject} icon={<Save className="h-4 w-4" />}>
                            រក្សាទុក
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4">
                    <div>
                        <label className={fieldLabel} htmlFor="new-subject-name">
                            ឈ្មោះមុខវិជ្ជា <span className={requiredMark}>*</span>
                        </label>
                        <input
                            id="new-subject-name"
                            type="text"
                            value={newSubName}
                            onChange={e => setNewSubName(e.target.value)}
                            className={controlClass(false, 'font-bold')}
                            placeholder="ឧ. កុំព្យូទ័រ, ភាសាចិន..."
                        />
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
                        <label className={fieldLabel} htmlFor="new-subject-cols">ជួរឈរពិន្ទុ (ជម្រើស)</label>
                        <p className="mb-2 text-[11px] leading-relaxed text-text-muted">
                            បើមុខវិជ្ជានេះមានច្រើនជួរឈរ សូមសរសេរខណ្ឌដោយសញ្ញាក្បៀស (,) ឧ. <strong>ទ្រឹស្តី, អនុវត្តន៍</strong>។ បើទុកទទេ វានឹងយកឈ្មោះមុខវិជ្ជាជាជួរឈរតែមួយ។
                        </p>
                        <input
                            id="new-subject-cols"
                            type="text"
                            value={newSubCols}
                            onChange={e => setNewSubCols(e.target.value)}
                            className={controlClass(false, 'font-bold')}
                            placeholder="ឧ. ទ្រឹស្តី, អនុវត្តន៍"
                        />
                    </div>
                </div>
            </Dialog>

            {dialog}
        </PageContainer>
    )
}
