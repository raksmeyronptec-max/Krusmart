/**
 * The column layout of the totals grid.
 *
 * Previously a module-level literal that the client *mutated* to append custom
 * subjects — so a second visit to the page pushed the same columns again and
 * the group `colSpan` counters drifted out of step with the columns they were
 * supposed to span. Groups now carry their columns instead of a count, and the
 * custom subjects are merged in a pure function, so the header can no longer
 * disagree with the body.
 */

import type { CustomSubjectRow, Student } from '@/lib/types'
import { appliesTo } from '@/lib/storage/custom-subjects'

/**
 * A student decorated with the per-period scores and every derived total the
 * three modes compute. The field names are the ones the previous client used
 * and the export still writes, so they are part of this screen's contract.
 */
export type TotalledStudent = Student & {
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

export type TotalMode = 'monthly' | 'semester' | 'annual'

/** A column of the totals grid, covering every shape the layout below uses. */
export interface GridColumn {
    key: string
    label: string
    /** Behavioural rating — a Khmer word, excluded from every average. */
    isText?: boolean
    options?: string[]
    /** Derived elsewhere and shown here; never written back. */
    readOnly?: boolean
}

export interface ColumnGroup {
    name: string
    /** Header fill. Alternates down the brand ramp so groups read as bands. */
    color: string
    columns: GridColumn[]
}

export const behaviorOptions = ['ល្អ', 'ល្អបង្គួរ', 'មធ្យម', 'ខ្សោយ']

const GROUPS: Record<TotalMode, ColumnGroup[]> = {
    monthly: [
        {
            name: 'ភាសាខ្មែរ', color: 'bg-brand-800', columns: [
                { key: 'kh_listen', label: 'សមត្ថភាពស្តាប់' },
                { key: 'kh_speak', label: 'សមត្ថភាពនិយាយ' },
                { key: 'kh_read', label: 'សមត្ថភាពអាន' },
                { key: 'kh_write', label: 'សមត្ថភាពសរសេរ' },
                { key: 'kh_calligraphy', label: 'សមត្ថភាពអក្សរផ្ចង់' },
                { key: 'kh_recitation', label: 'មេសូត្រ' },
                { key: 'kh_essay', label: 'តែងសេចក្តី' },
            ],
        },
        {
            name: 'គណិតវិទ្យា', color: 'bg-brand-700', columns: [
                { key: 'math_num', label: 'សមត្ថភាពចំនួន' },
                { key: 'math_meas', label: 'រង្វាស់រង្វាល់' },
                { key: 'math_geo', label: 'ធរណីមាត្រ' },
                { key: 'math_alg', label: 'ពីជគណិត' },
                { key: 'math_stat', label: 'ស្ថិតិ' },
            ],
        },
        {
            name: 'វិទ្យាសាស្ត្រ', color: 'bg-brand-800', columns: [
                { key: 'sci_phy', label: 'រូបវិទ្យា' },
                { key: 'sci_chem', label: 'គីមីវិទ្យា' },
                { key: 'sci_bio', label: 'ជីវវិទ្យា' },
                { key: 'sci_earth', label: 'ផែនដីវិទ្យា' },
                { key: 'sci_applied', label: 'អនុវត្តន៍' },
            ],
        },
        {
            name: 'សិក្សាសង្គម', color: 'bg-brand-700', columns: [
                { key: 'soc_ethic', label: 'សីលធម៌' },
                { key: 'soc_geo', label: 'ភូមិវិទ្យា' },
                { key: 'soc_hist', label: 'ប្រវត្តិវិទ្យា' },
                { key: 'soc_home', label: 'គេហវិទ្យា' },
            ],
        },
        {
            name: 'អប់រំសុខភាព', color: 'bg-brand-800', columns: [
                { key: 'pe_sport', label: 'អប់រំកាយ' },
                { key: 'health_hygiene', label: 'សុខភាព' },
            ],
        },
        {
            name: 'ផ្សេងៗ', color: 'bg-brand-700', columns: [
                { key: 'life_skill', label: 'បំណិនជីវិត' },
                { key: 'foreign', label: 'ភាសាបរទេស' },
            ],
        },
        {
            name: 'ការបំពេញបន្ថែម', color: 'bg-brand-800', columns: [
                { key: 'ex_oral', label: 'ផ្ទាល់មាត់' },
                { key: 'ex_att', label: 'អវត្តមាន' },
                { key: 'ex_book', label: 'សៀវភៅ' },
                { key: 'ex_hw', label: 'កិច្ចការផ្ទះ' },
            ],
        },
    ],

    semester: [
        {
            name: 'ភាសាខ្មែរ', color: 'bg-brand-800', columns: [
                { key: 'sem_kh_reading', label: 'អំណាន' },
                { key: 'sem_kh_listening_speaking', label: 'ស្តាប់-និយាយ' },
                { key: 'sem_kh_dictation', label: 'សរសេរតាមអាន' },
                { key: 'sem_kh_essay', label: 'តែងសេចក្តី' },
            ],
        },
        {
            name: 'គណិត & វិទ្យាសាស្ត្រ', color: 'bg-brand-700', columns: [
                { key: 'sem_math', label: 'គណិតវិទ្យា' },
                { key: 'sem_science', label: 'វិទ្យាសាស្ត្រ' },
            ],
        },
        {
            name: 'សិក្សាសង្គម', color: 'bg-brand-800', columns: [
                { key: 'sem_moral_civics', label: 'សីលធម៌' },
                { key: 'sem_geo', label: 'ភូមិវិទ្យា' },
                { key: 'sem_hist', label: 'ប្រវត្តិវិទ្យា' },
                { key: 'sem_home_arts', label: 'គេហវិទ្យា' },
            ],
        },
        {
            name: 'មុខវិជ្ជាទូទៅ', color: 'bg-brand-700', columns: [
                { key: 'sem_life_skills', label: 'បំណិនជីវិត' },
                { key: 'sem_foreign', label: 'ភាសាបរទេស' },
                { key: 'sem_sport', label: 'កីឡា' },
            ],
        },
        {
            name: 'អាកប្បកិរិយា', color: 'bg-brand-500', columns: [
                { key: 'sem_eval_knowledge', label: 'ចំណេះដឹង', isText: true, options: behaviorOptions },
                { key: 'sem_eval_skill', label: 'បំណិន-ចំណេះធ្វើ', isText: true, options: behaviorOptions },
                { key: 'sem_eval_moral', label: 'តម្លៃ-សីលធម៌', isText: true, options: behaviorOptions },
                { key: 'sem_eval_participate', label: 'សាមគ្គីភាព', isText: true, options: behaviorOptions },
            ],
        },
    ],

    annual: [
        {
            name: 'ពិន្ទុមធ្យមភាគប្រចាំឆមាស', color: 'bg-brand-800', columns: [
                { key: 'sem1_avg', label: 'មធ្យមភាគ ឆមាសទី១', readOnly: true },
                { key: 'sem2_avg', label: 'មធ្យមភាគ ឆមាសទី២', readOnly: true },
            ],
        },
    ],
}

/**
 * The groups for a mode, with the teacher's own subjects appended.
 *
 * Pure: the caller memoises on `mode` + the custom-subject list, and nothing is
 * written back into `GROUPS`.
 */
export function groupsFor(mode: TotalMode, customSubjects: CustomSubjectRow[]): ColumnGroup[] {
    const base = GROUPS[mode]
    if (mode === 'annual' || customSubjects.length === 0) return base

    const known = new Set(base.flatMap(g => g.columns.map(c => c.key)))
    const extra: GridColumn[] = []

    for (const sub of customSubjects) {
        if (!appliesTo(sub, mode)) continue
        for (const col of sub.columns) {
            if (known.has(col.id)) continue
            known.add(col.id)
            extra.push({ key: col.id, label: col.label })
        }
    }

    return extra.length === 0
        ? base
        : [...base, { name: 'មុខវិជ្ជាបន្ថែម', color: 'bg-brand-600', columns: extra }]
}

/** Flat column list for a set of groups. */
export function flatten(groups: ColumnGroup[]): GridColumn[] {
    return groups.flatMap(g => g.columns)
}

/** Drop columns the teacher has hidden, and any group left with none. */
export function filterGroups(groups: ColumnGroup[], visible: Set<string> | null): ColumnGroup[] {
    if (!visible) return groups
    return groups
        .map(g => ({ ...g, columns: g.columns.filter(c => visible.has(c.key)) }))
        .filter(g => g.columns.length > 0)
}
