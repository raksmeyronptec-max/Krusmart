/**
 * Resolving which subjects a class enters marks for.
 *
 * The subject list used to be a literal array inside `ScoreEnterClient`, which
 * meant the Cambodian primary curriculum was compiled into the product. It now
 * comes from `score_template_subjects` (migration 00016) in three layers:
 *
 *     system  the national default, seeded by the migration
 *     school  a school's amendments
 *     class   one class's amendments
 *
 * The merge lives here rather than in SQL because it has to run in two places:
 * in the browser, where the rows are fetched once and re-resolved every time
 * the teacher flips between monthly and semester, and on the server during
 * render. A SQL view would force a round trip for the second case.
 *
 * Pure and free of server-only imports, for the same reason
 * `lib/rbac/permissions.ts` is: a client hook imports it, and pulling
 * `next/headers` in here breaks the build.
 */

import type { ScoreTemplateSubjectRow } from '@/lib/types'

/** Which `scores.score_type` a subject appears under. */
export type TemplateScoreType = 'monthly' | 'semester' | 'annual' | 'homework'

/**
 * One editable column of the score grid.
 *
 * Lived in `ScoreEnterClient.tsx`, then in `subjectConfigs.ts`; it belongs here
 * because both score clients and the template rows describe the same thing.
 * `id` is what `scores.subject` stores, so it is schema — never rename one.
 */
export interface SubjectColumn {
  id: string
  label: string
  width?: string
  /** `'select'` renders a dropdown; the values land in `scores.score_text`. */
  type?: string
  options?: string[]
}

/** One subject, after the three layers have been merged. */
export interface EffectiveSubject {
  subjectKey: string
  labelKm: string
  groupLabel: string | null
  maxScore: number
  columns: SubjectColumn[]
  valueKind: 'numeric' | 'text'
  sortOrder: number
  /** Which layer the winning row came from — for "overridden by your school". */
  origin: 'system' | 'school' | 'class'
}

/** Lower number wins. A class override beats its school, which beats the default. */
const LAYER_PRECEDENCE: Record<ScoreTemplateSubjectRow['scope'], number> = {
  class: 0,
  school: 1,
  system: 2,
}

/**
 * Merge template rows into the list of subjects a screen should offer.
 *
 * Group by `subject_key`, keep the row from the lowest layer present, drop it
 * if that row is `hidden`, keep it only if it applies to `scoreType`, and sort
 * by `sort_order`.
 *
 * Note the order of the last two steps: `score_types` is read from the *winning*
 * row, not unioned across layers. That is deliberate — an override replaces the
 * subject's definition wholesale, so a class row that lists only `monthly`
 * removes that subject from the semester grid for that class. Anything else
 * would make an override unable to narrow where a subject appears.
 *
 * Rows for other classes or schools are simply absent: RLS and the query filter
 * both exclude them, so no scoping check is repeated here.
 */
export function resolveTemplate(
  rows: ScoreTemplateSubjectRow[],
  scoreType: TemplateScoreType,
): EffectiveSubject[] {
  const winners = new Map<string, ScoreTemplateSubjectRow>()

  for (const row of rows) {
    const current = winners.get(row.subject_key)
    if (!current || LAYER_PRECEDENCE[row.scope] < LAYER_PRECEDENCE[current.scope]) {
      winners.set(row.subject_key, row)
    }
  }

  return [...winners.values()]
    .filter((row) => !row.hidden)
    .filter((row) => row.score_types.includes(scoreType))
    .sort((a, b) => a.sort_order - b.sort_order || a.subject_key.localeCompare(b.subject_key))
    .map((row) => ({
      subjectKey: row.subject_key,
      labelKm: row.label_km,
      groupLabel: row.group_label ?? null,
      maxScore: Number(row.max_score),
      columns: row.columns ?? [],
      valueKind: row.value_kind,
      sortOrder: row.sort_order,
      origin: row.scope,
    }))
}

/** The shape `Select` / `SearchableSelect` take. */
export interface SubjectOption {
  value: string
  label: string
  group?: string
}

/** Effective subjects as picker options, preserving resolution order. */
export function toSubjectOptions(subjects: EffectiveSubject[]): SubjectOption[] {
  return subjects.map((s) => ({
    value: s.subjectKey,
    label: s.labelKm,
    ...(s.groupLabel ? { group: s.groupLabel } : {}),
  }))
}

/** Column layout for one subject, or `null` when the template does not define it. */
export function columnsFor(
  subjects: EffectiveSubject[],
  subjectKey: string,
): SubjectColumn[] | null {
  const match = subjects.find((s) => s.subjectKey === subjectKey)
  return match ? match.columns : null
}

const BEHAVIOUR_OPTIONS = ['ល្អ', 'ល្អបង្គួរ', 'មធ្យម', 'ខ្សោយ']

/**
 * The seeded national default, as data.
 *
 * This is the same fourteen rows migration 00016 inserts, and it exists for one
 * reason: a deploy of this code against a database where 00016 has not been
 * applied yet would otherwise render an empty subject picker, which to a
 * teacher is indistinguishable from losing their subjects. `useScoreTemplate`
 * and `resolveServerTemplate` fall back to it when the query returns nothing,
 * so the refactor cannot regress the picker regardless of migration order.
 *
 * It is also what makes the "identical before and after" check runnable without
 * a live database — see `scripts/verify-score-template.mts`.
 *
 * Delete it once 00016 is applied everywhere; until then, any edit here must be
 * mirrored in the migration and vice versa.
 */
export const SYSTEM_PRIMARY_TEMPLATE: ScoreTemplateSubjectRow[] = [
  // ------------------------------------------------------------------ monthly
  {
    id: 'system:khmer_all',
    scope: 'system',
    subject_key: 'khmer_all',
    label_km: 'ភាសាខ្មែរ (គ្រប់បំណិន)',
    group_label: 'ភាសាខ្មែរ',
    columns: [
      { id: 'kh_listen', label: 'ស្តាប់', width: '80px' },
      { id: 'kh_speak', label: 'និយាយ', width: '80px' },
      { id: 'kh_read', label: 'អាន', width: '80px' },
      { id: 'kh_write', label: 'សរសេរ', width: '80px' },
      { id: 'kh_calligraphy', label: 'អក្សរផ្ចង់', width: '80px' },
      { id: 'kh_recitation', label: 'មេសូត្រ', width: '80px' },
      { id: 'kh_essay', label: 'តែងសេចក្តី', width: '80px' },
    ],
    max_score: 10,
    value_kind: 'numeric',
    score_types: ['monthly'],
    sort_order: 10,
    hidden: false,
  },
  {
    id: 'system:kh_listen',
    scope: 'system',
    subject_key: 'kh_listen',
    label_km: 'សមត្ថភាពស្តាប់',
    group_label: 'ភាសាខ្មែរ',
    columns: [{ id: 'kh_listen', label: 'ស្តាប់', width: '120px' }],
    max_score: 10,
    value_kind: 'numeric',
    score_types: ['monthly'],
    sort_order: 20,
    hidden: false,
  },
  {
    id: 'system:kh_write',
    scope: 'system',
    subject_key: 'kh_write',
    label_km: 'សមត្ថភាពសរសេរ',
    group_label: 'ភាសាខ្មែរ',
    columns: [{ id: 'kh_write', label: 'សរសេរ', width: '120px' }],
    max_score: 10,
    value_kind: 'numeric',
    score_types: ['monthly'],
    sort_order: 30,
    hidden: false,
  },
  {
    id: 'system:kh_read',
    scope: 'system',
    subject_key: 'kh_read',
    label_km: 'សមត្ថភាពអាន',
    group_label: 'ភាសាខ្មែរ',
    columns: [{ id: 'kh_read', label: 'អាន', width: '120px' }],
    max_score: 10,
    value_kind: 'numeric',
    score_types: ['monthly'],
    sort_order: 40,
    hidden: false,
  },
  {
    id: 'system:kh_speak',
    scope: 'system',
    subject_key: 'kh_speak',
    label_km: 'សមត្ថភាពនិយាយ',
    group_label: 'ភាសាខ្មែរ',
    columns: [{ id: 'kh_speak', label: 'និយាយ', width: '120px' }],
    max_score: 10,
    value_kind: 'numeric',
    score_types: ['monthly'],
    sort_order: 50,
    hidden: false,
  },
  {
    id: 'system:math_general',
    scope: 'system',
    subject_key: 'math_general',
    label_km: 'គណិតវិទ្យា (គ្រប់ផ្នែក)',
    group_label: 'គណិតវិទ្យា',
    columns: [
      { id: 'math_num', label: 'ចំនួន', width: '70px' },
      { id: 'math_meas', label: 'រង្វាស់', width: '70px' },
      { id: 'math_geo', label: 'ធរណី', width: '70px' },
      { id: 'math_alg', label: 'ពីជគណិត', width: '70px' },
      { id: 'math_stat', label: 'ស្ថិតិ', width: '70px' },
    ],
    max_score: 10,
    value_kind: 'numeric',
    score_types: ['monthly'],
    sort_order: 60,
    hidden: false,
  },
  {
    id: 'system:ex_oral',
    scope: 'system',
    subject_key: 'ex_oral',
    label_km: 'សំណួរផ្ទាល់មាត់',
    group_label: 'ការបំពេញបន្ថែម',
    columns: [{ id: 'ex_oral', label: 'សំណួរផ្ទាល់មាត់', width: '120px' }],
    max_score: 10,
    value_kind: 'numeric',
    score_types: ['monthly'],
    sort_order: 70,
    hidden: false,
  },
  {
    id: 'system:ex_att',
    scope: 'system',
    subject_key: 'ex_att',
    label_km: 'វត្តមាន',
    group_label: 'ការបំពេញបន្ថែម',
    columns: [{ id: 'ex_att', label: 'វត្តមាន', width: '120px' }],
    max_score: 10,
    value_kind: 'numeric',
    score_types: ['monthly'],
    sort_order: 80,
    hidden: false,
  },
  {
    id: 'system:ex_book',
    scope: 'system',
    subject_key: 'ex_book',
    label_km: 'សៀវភៅ',
    group_label: 'ការបំពេញបន្ថែម',
    columns: [{ id: 'ex_book', label: 'សៀវភៅ', width: '120px' }],
    max_score: 10,
    value_kind: 'numeric',
    score_types: ['monthly'],
    sort_order: 90,
    hidden: false,
  },
  {
    id: 'system:ex_hw',
    scope: 'system',
    subject_key: 'ex_hw',
    label_km: 'កិច្ចការផ្ទះ',
    group_label: 'ការបំពេញបន្ថែម',
    columns: [{ id: 'ex_hw', label: 'កិច្ចការផ្ទះ', width: '120px' }],
    max_score: 10,
    value_kind: 'numeric',
    score_types: ['monthly'],
    sort_order: 100,
    hidden: false,
  },

  // ----------------------------------------------------------------- semester
  {
    id: 'system:sem_math',
    scope: 'system',
    subject_key: 'sem_math',
    label_km: 'គណិតវិទ្យា',
    group_label: 'មុខវិជ្ជាសិក្សា',
    columns: [{ id: 'sem_math', label: 'គណិតវិទ្យា', width: '150px' }],
    max_score: 10,
    value_kind: 'numeric',
    score_types: ['semester'],
    sort_order: 10,
    hidden: false,
  },
  {
    id: 'system:sem_kh_reading',
    scope: 'system',
    subject_key: 'sem_kh_reading',
    label_km: 'អំណាន',
    group_label: 'មុខវិជ្ជាសិក្សា',
    columns: [{ id: 'sem_kh_reading', label: 'អំណាន', width: '150px' }],
    max_score: 10,
    value_kind: 'numeric',
    score_types: ['semester'],
    sort_order: 20,
    hidden: false,
  },
  {
    id: 'system:sem_behavior_all',
    scope: 'system',
    subject_key: 'sem_behavior_all',
    label_km: 'វាយតម្លៃរួមទាំង៤',
    group_label: 'ការវាយតម្លៃអាកប្បកិរិយា',
    columns: [
      { id: 'sem_eval_knowledge', label: 'ចំណេះដឹង', width: '110px', type: 'select', options: BEHAVIOUR_OPTIONS },
      { id: 'sem_eval_skill', label: 'បំណិន-ចំណេះធ្វើ', width: '110px', type: 'select', options: BEHAVIOUR_OPTIONS },
      { id: 'sem_eval_moral', label: 'តម្លៃ-សីលធម៌', width: '110px', type: 'select', options: BEHAVIOUR_OPTIONS },
      { id: 'sem_eval_participate', label: 'សាមគ្គីភាព-ការចូលរួម', width: '110px', type: 'select', options: BEHAVIOUR_OPTIONS },
    ],
    max_score: 10,
    // Every column is one of the four behavioural dropdowns, so the cells hold
    // Khmer words, not marks — see `lib/utils/score-value.ts`.
    value_kind: 'text',
    score_types: ['semester'],
    sort_order: 30,
    hidden: false,
  },
  {
    id: 'system:sem_eval_knowledge',
    scope: 'system',
    subject_key: 'sem_eval_knowledge',
    label_km: 'ចំណេះដឹង',
    group_label: 'ការវាយតម្លៃអាកប្បកិរិយា',
    columns: [
      { id: 'sem_eval_knowledge', label: 'ចំណេះដឹង', width: '150px', type: 'select', options: BEHAVIOUR_OPTIONS },
    ],
    max_score: 10,
    value_kind: 'text',
    score_types: ['semester'],
    sort_order: 40,
    hidden: false,
  },
]

/**
 * Full mark per *column id*, from the resolved subjects.
 *
 * The grid edits columns, not subjects: `khmer_all` renders seven of them, and
 * in "all subjects" mode a single grid holds columns belonging to a dozen
 * different subjects. A per-column lookup is therefore the only shape that can
 * carry a per-subject maximum into the inputs.
 *
 * Deliberately keyed on `SubjectColumn.id` rather than added *to* the column:
 * that object is stored verbatim in `score_template_subjects.columns` and its
 * `id` is what `scores.subject` holds, so it is schema and must not grow fields
 * that belong to the row around it.
 */
export function maxScoreByColumn(subjects: EffectiveSubject[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const subject of subjects) {
    for (const column of subject.columns) out[column.id] = subject.maxScore
  }
  return out
}
