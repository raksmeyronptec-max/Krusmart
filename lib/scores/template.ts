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

// Relative and extension-qualified on purpose: the verify scripts under
// `scripts/` run this module with plain `node`, which strips types but neither
// rewrites the `@/` alias nor resolves extensionless specifiers — either form
// would crash them at load time. `allowImportingTsExtensions` covers tsc.
import { NATIONAL_COEFFICIENT_UNIT } from '../grading/scheme.ts'
import type { ScoreTemplateSubjectRow } from '@/lib/types'
import type { EducationLevelKey } from '@/lib/onboarding/curriculum'

/** Which `scores.score_type` a subject appears under. */
export type TemplateScoreType = 'monthly' | 'semester' | 'annual' | 'homework'

/**
 * Which curriculum a class resolves against — its education level, grade
 * number, and (grades 11–12) stream. Every field optional: a legacy account
 * has none of them, and resolution must then behave exactly as it did before
 * the levels existed.
 */
export interface TemplateContext {
  levelKey?: EducationLevelKey | null
  gradeNumber?: number | null
  track?: 'science' | 'social_science' | null
}

/**
 * Which system/school rows apply to a context.
 *
 * Two-step, and the order is the safety property:
 *
 *   1. If the context names a level AND rows tagged with that level exist
 *      (matching grade and track where the row narrows them), those rows are
 *      the curriculum — a grade-12 science class sees `hs_math` at /100 and
 *      none of the primary skills.
 *   2. Otherwise the *untagged* rows apply: no context (legacy account,
 *      pre-00021 database, fallback constant), a level nothing has been
 *      seeded for yet, or a grade-12 class whose track is still unset. All of
 *      those land on today's list rather than an empty picker, which to a
 *      teacher reads as data loss.
 *
 * Class-scope rows are always kept: they belong to the resolved class by
 * construction (RLS plus the class_id filter), and hiding a teacher's own
 * override because a seed arrived later would silently undo their edit.
 */
export function filterRowsForContext(
  rows: ScoreTemplateSubjectRow[],
  context?: TemplateContext | null,
): ScoreTemplateSubjectRow[] {
  const classRows = rows.filter((r) => r.scope === 'class')
  const tagged = levelTaggedRows(rows, context)
  if (tagged.length > 0) return [...tagged, ...classRows]

  return [...rows.filter((r) => r.scope !== 'class' && r.level_key == null), ...classRows]
}

/** The system/school rows tagged with the context's level (and matching grade/track). */
function levelTaggedRows(
  rows: ScoreTemplateSubjectRow[],
  context?: TemplateContext | null,
): ScoreTemplateSubjectRow[] {
  if (!context?.levelKey) return []
  return rows.filter(
    (r) =>
      r.scope !== 'class' &&
      r.level_key === context.levelKey &&
      (r.grade_number == null || r.grade_number === context.gradeNumber) &&
      (r.track == null || r.track === context.track),
  )
}

/**
 * Is a level-specific curriculum in effect for this context — as opposed to
 * the untagged primary/legacy fallback?
 *
 * The totals grid keys on this: its hand-built primary column layout (thirty
 * columns, several of which the picker template deliberately does not carry)
 * must stay byte-identical for every account on the fallback, and only a
 * class that actually resolves a tagged curriculum switches to
 * template-driven columns. Same predicate `filterRowsForContext` selects by,
 * so the two can never disagree about which world a class is in.
 */
export function usesLevelCurriculum(
  rows: ScoreTemplateSubjectRow[],
  context?: TemplateContext | null,
): boolean {
  return levelTaggedRows(rows, context).length > 0
}

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
  context?: TemplateContext | null,
): EffectiveSubject[] {
  const winners = new Map<string, ScoreTemplateSubjectRow>()

  for (const row of filterRowsForContext(rows, context)) {
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

/**
 * The subjects a teacher can be assigned to in a class, with the label each
 * assignment surface must show.
 *
 * ONE function on purpose. The admin console's assignment picker and
 * `/score/collect` previously named subjects from two different catalogues
 * (`public.subjects` free-typed names vs template `label_km`), which is how the
 * same subject wore two names in the same school. Both now derive their list
 * here, so they cannot disagree — that is requirement, not convenience.
 *
 * An assignment is not per score type (a teacher who enters the monthly maths
 * marks also enters the semester ones), so the list is the union of the
 * monthly and semester resolutions, deduplicated by key in template order.
 * Annual resolves derived columns and homework resolves day slots; neither
 * names anything assignable.
 */
export function assignableSubjects(
  rows: ScoreTemplateSubjectRow[],
  context: TemplateContext | null,
): { subjectKey: string; labelKm: string }[] {
  const source = rows.length > 0 ? filterRowsForContext(rows, context) : SYSTEM_PRIMARY_TEMPLATE
  const seen = new Map<string, string>()
  for (const scoreType of ['monthly', 'semester'] as const) {
    for (const s of resolveTemplate(source, scoreType, context)) {
      if (!seen.has(s.subjectKey)) seen.set(s.subjectKey, s.labelKm)
    }
  }
  return [...seen.entries()].map(([subjectKey, labelKm]) => ({ subjectKey, labelKm }))
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

/**
 * One subject as the class-scope editor sees it: what the higher layers give,
 * what this class has overridden, and the result.
 *
 * `resolveTemplate` returns only the winner, which is all the score grid needs.
 * The editor additionally has to answer "is this the system's or mine?" and
 * "what would I get back if I reset?", and both questions need the losing rows.
 */
export interface EditableSubject {
  subjectKey: string
  /** The winning row, exactly as the score grid would resolve it. */
  effective: EffectiveSubject
  /** The system/school row this class inherits, if any. */
  inherited: ScoreTemplateSubjectRow | null
  /** This class's own row, if it has one. */
  override: ScoreTemplateSubjectRow | null
  /** No higher layer defines this key — a subject this class added itself. */
  isClassOwn: boolean
  /** Hidden rows are excluded from the grid but must still be listed here. */
  hidden: boolean
}

/**
 * The editor's view of one score type's subject list.
 *
 * Unlike `resolveTemplate` this keeps hidden subjects — a teacher cannot unhide
 * what the screen refuses to show them — and sorts on the same key so the order
 * matches the picker exactly.
 */
export function resolveTemplateEditor(
  rows: ScoreTemplateSubjectRow[],
  scoreType: TemplateScoreType,
  context?: TemplateContext | null,
): EditableSubject[] {
  const byKey = new Map<string, { inherited: ScoreTemplateSubjectRow | null; override: ScoreTemplateSubjectRow | null }>()

  for (const row of filterRowsForContext(rows, context)) {
    const entry = byKey.get(row.subject_key) ?? { inherited: null, override: null }
    if (row.scope === 'class') {
      entry.override = row
    } else if (
      !entry.inherited ||
      LAYER_PRECEDENCE[row.scope] < LAYER_PRECEDENCE[entry.inherited.scope]
    ) {
      entry.inherited = row
    }
    byKey.set(row.subject_key, entry)
  }

  const out: EditableSubject[] = []

  for (const [subjectKey, { inherited, override }] of byKey) {
    const winner = override ?? inherited
    if (!winner) continue
    if (!winner.score_types.includes(scoreType)) continue

    out.push({
      subjectKey,
      effective: {
        subjectKey,
        labelKm: winner.label_km,
        groupLabel: winner.group_label ?? null,
        maxScore: Number(winner.max_score),
        columns: winner.columns ?? [],
        valueKind: winner.value_kind,
        sortOrder: winner.sort_order,
        origin: winner.scope,
      },
      inherited,
      override,
      isClassOwn: inherited === null,
      hidden: winner.hidden,
    })
  }

  return out.sort(
    (a, b) =>
      a.effective.sortOrder - b.effective.sortOrder ||
      a.subjectKey.localeCompare(b.subjectKey),
  )
}

/**
 * The derived coefficient for a full mark, per design §3.2.
 *
 * There is no `coefficient` column and there must not be one: two editable
 * numbers that can contradict each other is a bug waiting to happen. The
 * national scale of 50 is what makes a subject marked out of 100 count double
 * one marked out of 50.
 *
 * Nothing multiplies by this yet — the score screens use `simpleAverage`, and
 * `weightedAverage` in `lib/grading/scheme.ts` has no callers. It is shown to
 * the teacher as a consequence of the number they are typing, not as an input.
 */
export const COEFFICIENT_BASE = NATIONAL_COEFFICIENT_UNIT

export function coefficientFor(maxScore: number): number {
  return Math.round((maxScore / COEFFICIENT_BASE) * 100) / 100
}

/**
 * The fields that decide whether a class row says anything its parent does not.
 *
 * `subject_key` is absent on purpose: it identifies the subject rather than
 * describing it, and it is what `scores.subject` stores, so it is never part of
 * what an override changes.
 */
export const OVERRIDE_FIELDS = [
  'label_km', 'group_label', 'columns', 'max_score',
  'value_kind', 'score_types', 'sort_order', 'hidden',
] as const

export type OverridableFields = Pick<ScoreTemplateSubjectRow, (typeof OVERRIDE_FIELDS)[number]>

/**
 * Does this override still differ from what it inherits?
 *
 * When it does not, the row should be deleted rather than stored. A redundant
 * class row is not merely wasteful — it *pins* the definition, so a later change
 * to the national default would never reach the class. Keeping inheritance live
 * wherever a teacher has not actually diverged is the point of the layering.
 *
 * A subject with no parent (one the class invented) always differs: there is
 * nothing to fall back to.
 */
export function overrideDiffers(
  candidate: OverridableFields,
  inherited: ScoreTemplateSubjectRow | null,
): boolean {
  if (!inherited) return true
  return OVERRIDE_FIELDS.some(
    (field) => JSON.stringify(candidate[field]) !== JSON.stringify(inherited[field]),
  )
}
