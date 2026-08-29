/**
 * What reports exist, and what each one needs before it can be generated.
 *
 * This module is the catalogue — the Print Center renders it, the generator
 * dispatches on it, and nothing else decides what a report *is*. Pure and free
 * of server-only imports so the client can render the centre from the same
 * definitions the server generates from; a second, drifting list of reports on
 * the browser is exactly what this replaces.
 *
 * THE IDENTIFIERS ARE SCHEMA (§19). `ReportType` values are recorded on every
 * generated document and will be persisted in generation metadata, so they are
 * renamed only with a migration. Khmer labels are display and may change
 * freely — never key anything on them.
 */

/** Stable machine identifier for a report. Never a translated label. */
export type ReportType =
  // scores
  | 'score_monthly'
  | 'score_semester'
  | 'score_annual'
  // ranking
  | 'ranking_monthly'
  | 'ranking_semester'
  | 'ranking_annual'
  // honour + certificate
  | 'honor'
  | 'certificate'
  // yearly
  | 'annual_summary'
  | 'annual_monthly_ranking'
  | 'annual_monthly_average'
  | 'annual_subject'
  | 'annual_subject_results'
  | 'annual_promoted_students'
  | 'annual_repeated_students'
  // tracking
  | 'student_tracking_record_book'

export type ReportCategory =
  | 'scores'
  | 'ranking'
  | 'honor'
  | 'certificate'
  | 'yearly'
  | 'tracking'

export const REPORT_CATEGORIES: { id: ReportCategory; label: string; description: string }[] = [
  { id: 'scores', label: 'ពិន្ទុ', description: 'តារាងពិន្ទុតាមទម្រង់ក្រសួង' },
  { id: 'ranking', label: 'ចំណាត់ថ្នាក់', description: 'លំដាប់សិស្សតាមមធ្យមភាគ' },
  { id: 'honor', label: 'កិត្តិយស', description: 'សិស្សពូកែប្រចាំគ្រា' },
  { id: 'certificate', label: 'វិញ្ញាបនបត្រ', description: 'ឯកសារផ្លូវការសម្រាប់សិស្ស' },
  { id: 'yearly', label: 'របាយការណ៍ប្រចាំឆ្នាំ', description: 'លទ្ធផលចុងឆ្នាំសិក្សា' },
  { id: 'tracking', label: 'សៀវភៅតាមដាន', description: 'កំណត់ត្រាតាមដានសិស្ស' },
]

/**
 * What a report needs the teacher to choose before it can run.
 *
 * Drives both the Print Center's flow (§14) and the server's validation — the
 * same declaration, so the form cannot ask for something the resolver ignores.
 */
export type PeriodKind = 'month' | 'semester' | 'year' | 'none'

/** How a report's document is produced. */
export type ReportFormat = 'xlsx' | 'docx' | 'html'

export interface ReportDefinition {
  type: ReportType
  category: ReportCategory
  /** Khmer title shown on the card. Display only — never an identifier. */
  label: string
  /** One line on when a teacher reaches for this. */
  description: string
  /** Which period selector the flow shows. */
  period: PeriodKind
  /** Formats this report can produce, best first. */
  formats: ReportFormat[]
  /**
   * Where this report lives today, when it already has a working screen.
   *
   * §27's migration strategy in one field: the Print Center links to the
   * existing page until the report is migrated onto the shared engine, so
   * nothing that works today stops working while the engine is built out.
   * `null` means the report runs through the engine and has no legacy screen.
   */
  legacyHref: string | null
  /**
   * A data resolver exists for this report in `report-data.ts`.
   *
   * NOT the same as "can be generated" (§11). A resolver with no document
   * template produces a payload with nothing to print it onto. The four states
   * are derived together by `reportAvailability` in `report-template.ts`,
   * which is the only place allowed to decide what a card may claim.
   */
  resolver: boolean
}

/**
 * Every report the product offers, in the order the centre lists them.
 *
 * Adding a report is meant to be an entry here plus a resolver and a mapping —
 * not another independent export screen. That is the whole point of §29's
 * closing requirement, and this array is where it is enforced.
 */
export const REPORT_DEFINITIONS: ReportDefinition[] = [
  // ---------------------------------------------------------------- scores
  {
    type: 'score_monthly',
    category: 'scores',
    label: 'តារាងពិន្ទុប្រចាំខែ',
    description: 'ពិន្ទុគ្រប់មុខវិជ្ជាក្នុងមួយខែ តាមទម្រង់ក្រសួង',
    period: 'month',
    formats: ['xlsx'],
    legacyHref: '/score/print',
    resolver: true,
  },
  {
    type: 'score_semester',
    category: 'scores',
    label: 'តារាងពិន្ទុឆមាស',
    description: 'ពិន្ទុប្រឡងឆមាស និងមធ្យមភាគ',
    period: 'semester',
    formats: ['xlsx'],
    legacyHref: '/score/print',
    resolver: false,
  },
  {
    type: 'score_annual',
    category: 'scores',
    label: 'តារាងពិន្ទុប្រចាំឆ្នាំ',
    description: 'មធ្យមភាគឆមាសទាំងពីរ និងលទ្ធផលប្រចាំឆ្នាំ',
    period: 'year',
    formats: ['xlsx'],
    legacyHref: '/score/total',
    resolver: false,
  },

  // --------------------------------------------------------------- ranking
  {
    type: 'ranking_monthly',
    category: 'ranking',
    label: 'ចំណាត់ថ្នាក់ប្រចាំខែ',
    description: 'លំដាប់សិស្សតាមមធ្យមភាគប្រចាំខែ ព្រមទាំងនិទ្ទេស និងលទ្ធផល',
    period: 'month',
    formats: ['xlsx'],
    legacyHref: '/ranking',
    resolver: true,
  },
  {
    type: 'ranking_semester',
    category: 'ranking',
    label: 'ចំណាត់ថ្នាក់ឆមាស',
    description: 'លំដាប់សិស្សតាមមធ្យមភាគឆមាស (ប្រឡង + ប្រចាំខែ)',
    period: 'semester',
    formats: ['xlsx'],
    legacyHref: '/ranking',
    resolver: true,
  },
  {
    type: 'ranking_annual',
    category: 'ranking',
    label: 'ចំណាត់ថ្នាក់ប្រចាំឆ្នាំ',
    description: 'លំដាប់សិស្សតាមមធ្យមភាគប្រចាំឆ្នាំ',
    period: 'year',
    formats: ['xlsx'],
    legacyHref: '/ranking',
    resolver: false,
  },

  // ----------------------------------------------------------------- honor
  {
    type: 'honor',
    category: 'honor',
    label: 'តារាងកិត្តិយស',
    description: 'សិស្សដែលឈានដល់លក្ខណៈវិនិច្ឆ័យកិត្តិយស (បណ្ដោះអាសន្ន)',
    period: 'month',
    formats: ['xlsx'],
    legacyHref: '/honor-roll',
    resolver: true,
  },

  // ----------------------------------------------------------- certificate
  {
    type: 'certificate',
    category: 'certificate',
    label: 'វិញ្ញាបនបត្រ',
    description: 'ឯកសារផ្លូវការសម្រាប់សិស្សម្នាក់ៗ',
    period: 'year',
    formats: ['docx', 'html'],
    legacyHref: '/certificate',
    resolver: false,
  },

  // ---------------------------------------------------------------- yearly
  {
    type: 'annual_summary',
    category: 'yearly',
    label: 'បញ្ជីបូកលទ្ធផលសរុប',
    description: 'លទ្ធផលសរុបរបស់សិស្សទាំងអស់ចុងឆ្នាំ',
    period: 'year',
    formats: ['xlsx'],
    legacyHref: '/yearly-report',
    resolver: false,
  },
  {
    type: 'annual_monthly_ranking',
    category: 'yearly',
    label: 'ចំណាត់ថ្នាក់ និងនិទ្ទេស',
    description: 'ចំណាត់ថ្នាក់ប្រចាំខែ និងនិទ្ទេសពេញមួយឆ្នាំ',
    period: 'year',
    formats: ['xlsx'],
    legacyHref: '/yearly-report',
    resolver: false,
  },
  {
    type: 'annual_monthly_average',
    category: 'yearly',
    label: 'មធ្យមភាគប្រចាំឆ្នាំ',
    description: 'មធ្យមភាគរបស់សិស្សម្នាក់ៗពេញមួយឆ្នាំ',
    period: 'year',
    formats: ['xlsx'],
    legacyHref: '/yearly-report',
    resolver: false,
  },
  {
    type: 'annual_subject',
    category: 'yearly',
    label: 'មុខវិជ្ជាប្រចាំឆ្នាំ',
    description: 'មធ្យមភាគតាមមុខវិជ្ជាពេញមួយឆ្នាំ',
    period: 'year',
    formats: ['xlsx'],
    legacyHref: '/yearly-report',
    resolver: false,
  },
  {
    type: 'annual_subject_results',
    category: 'yearly',
    label: 'លទ្ធផលតាមមុខវិជ្ជា',
    description: 'ចំនួនសិស្សជាប់/ធ្លាក់តាមមុខវិជ្ជា',
    period: 'year',
    formats: ['xlsx'],
    legacyHref: '/yearly-report/subject-results',
    resolver: false,
  },
  {
    type: 'annual_promoted_students',
    category: 'yearly',
    label: 'សិស្សឡើងថ្នាក់',
    description: 'បញ្ជីសិស្សដែលឡើងថ្នាក់',
    period: 'year',
    formats: ['xlsx'],
    legacyHref: '/yearly-report/promoted',
    resolver: false,
  },
  {
    type: 'annual_repeated_students',
    category: 'yearly',
    label: 'សិស្សត្រួតថ្នាក់',
    description: 'បញ្ជីសិស្សដែលត្រួតថ្នាក់',
    period: 'year',
    formats: ['xlsx'],
    legacyHref: '/yearly-report/repeated',
    resolver: false,
  },

  // -------------------------------------------------------------- tracking
  {
    type: 'student_tracking_record_book',
    category: 'tracking',
    label: 'សៀវភៅសិក្ខាគារិក',
    description: 'កំណត់ត្រាតាមដានសិស្សប្រចាំឆ្នាំ',
    period: 'year',
    formats: ['html'],
    legacyHref: '/record-book',
    resolver: false,
  },
]

export function reportsByCategory(category: ReportCategory): ReportDefinition[] {
  return REPORT_DEFINITIONS.filter((r) => r.category === category)
}

export function reportDefinition(type: ReportType): ReportDefinition | undefined {
  return REPORT_DEFINITIONS.find((r) => r.type === type)
}

/** Guard for a value arriving from a request. */
export function isReportType(value: unknown): value is ReportType {
  return typeof value === 'string' && REPORT_DEFINITIONS.some((r) => r.type === value)
}
