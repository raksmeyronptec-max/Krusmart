/**
 * The column layout of every subject the entry grid can show.
 *
 * Lifted out of `ScoreEnterClient` unchanged, and now a *fallback*: since
 * migration 00016 the column layout for a subject comes from
 * `score_template_subjects`, and this map covers the keys the template does not
 * define — the ~37 group members the picker never offered directly, and any
 * database where 00016 has not been applied yet. The keys are picker values and
 * the ids are `scores.subject` values; both are persisted, so treat them as
 * schema.
 */

import type { SubjectColumn } from '@/lib/scores/template'

export const behaviorOptions = ['ល្អ', 'ល្អបង្គួរ', 'មធ្យម', 'ខ្សោយ']

export const subjectConfigs: Record<string, SubjectColumn[]> = {
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

/**
 * Every column of a score type, in report-card order.
 *
 * The grid can widen from "the subject I picked" to "the whole month" because
 * `getScores` already returns every subject for the period — the extra columns
 * cost no extra request, only the picker keys listed here.
 */
const ALL_SUBJECT_KEYS: Record<'monthly' | 'semester', string[]> = {
    monthly: [
        'khmer_all', 'math_general', 'science_all', 'social_all', 'health_all',
        'life_skill', 'foreign', 'ex_oral', 'ex_att', 'ex_book', 'ex_hw',
    ],
    semester: [
        'sem_kh_reading', 'sem_kh_listening_speaking', 'sem_kh_dictation', 'sem_kh_essay',
        'sem_math', 'sem_science', 'sem_moral_civics', 'sem_geo', 'sem_hist',
        'sem_home_arts', 'sem_life_skills', 'sem_foreign', 'sem_sport', 'sem_behavior_all',
    ],
}

/** Flattened column list for a score type, deduplicated by column id. */
export function allColumnsFor(scoreType: 'monthly' | 'semester'): SubjectColumn[] {
    const seen = new Set<string>()
    const out: SubjectColumn[] = []
    for (const key of ALL_SUBJECT_KEYS[scoreType]) {
        for (const col of subjectConfigs[key] ?? []) {
            if (seen.has(col.id)) continue
            seen.add(col.id)
            out.push(col)
        }
    }
    return out
}

/** Human label for the picker value, used in the "you are entering…" line. */
export const SUBJECT_TITLES: Record<string, string> = {
    khmer_all: 'ភាសាខ្មែរ (គ្រប់បំណិន)',
    math_general: 'គណិតវិទ្យា (គ្រប់ផ្នែក)',
    science_all: 'វិទ្យាសាស្ត្រ (គ្រប់ផ្នែក)',
    social_all: 'សិក្សាសង្គម (គ្រប់ផ្នែក)',
    health_all: 'អប់រំកាយ និងសុខភាព',
    sem_behavior_all: 'ការវាយតម្លៃអាកប្បកិរិយា',
}

/** The label to show for a subject: the group title, or its single column's name. */
export function subjectTitle(subject: string): string {
    return SUBJECT_TITLES[subject] ?? subjectConfigs[subject]?.[0]?.label ?? subject
}
