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
  | 'student_tracking_sheet'
  | 'class_admin_books'
  | 'tpp_master_book'
  // classroom arrangement — the rota a form master prints and pins up
  | 'class_cleaning_rota'
  // attendance
  | 'attendance_monthly'
  | 'attendance_yearly'
  // student documents — per-pupil paperwork, not a class result sheet
  | 'student_id_card'
  | 'student_parent_codes'
  | 'student_roster_print'
  | 'student_age_height'
  | 'student_parent_report'

export type ReportCategory =
  | 'scores'
  | 'attendance'
  | 'ranking'
  | 'honor'
  | 'certificate'
  | 'yearly'
  | 'tracking'
  | 'classroom'
  | 'student'

export const REPORT_CATEGORIES: { id: ReportCategory; label: string; description: string }[] = [
  { id: 'scores', label: 'ពិន្ទុ', description: 'តារាងពិន្ទុតាមទម្រង់ក្រសួង' },
  { id: 'attendance', label: 'វត្តមាន', description: 'បញ្ជីវត្តមាន និងអវត្តមានសិស្ស' },
  { id: 'ranking', label: 'ចំណាត់ថ្នាក់', description: 'លំដាប់សិស្សតាមមធ្យមភាគ' },
  { id: 'honor', label: 'កិត្តិយស', description: 'សិស្សពូកែប្រចាំគ្រា' },
  { id: 'certificate', label: 'វិញ្ញាបនបត្រ', description: 'ឯកសារផ្លូវការសម្រាប់សិស្ស' },
  { id: 'yearly', label: 'របាយការណ៍ប្រចាំឆ្នាំ', description: 'លទ្ធផលចុងឆ្នាំសិក្សា' },
  { id: 'tracking', label: 'សៀវភៅតាមដាន', description: 'កំណត់ត្រាតាមដានសិស្ស' },
  /*
   * រៀបចំថ្នាក់រៀន — the paperwork about running the room.
   *
   * Split out of សៀវភៅតាមដាន because the two answer different questions: a
   * tracking book follows a pupil through the year, while the thirteen MoEYS
   * administration books and the cleaning rota are about the class as an
   * organisation. Filed together they made the tracking family read as a
   * miscellany, which is the shape a teacher cannot scan.
   *
   * `/cleaning-schedule` was recorded in `verify-students.mts` as `the room,
   * not the class` — a judgement made when the centre indexed class RESULT
   * sheets only. The centre is the classroom document workspace now, so the
   * rota is catalogued rather than excused. `/inventory` stays excused: a
   * stock list of equipment is not a document about the class.
   */
  { id: 'classroom', label: 'រៀបចំថ្នាក់រៀន', description: 'សៀវភៅរដ្ឋបាល និងវេនប្រចាំថ្នាក់' },
  /*
   * ឯកសារសិស្ស — the per-pupil paperwork.
   *
   * These five screens have existed for a long time and were discoverable only
   * as menu items under សិស្ស: four printable documents listed in a navigation
   * module beside the roster and the enrolment form. That is the competing
   * document menu §8 forbids, and its cost was concrete — a teacher who opened
   * the Print Center looking for "print the ID cards" found six families and
   * not one of them held it, because the centre indexed class result sheets
   * only.
   *
   * Nothing moved. Each entry is `legacy_only`: it has a working screen and no
   * engine resolver, so `reportAvailability` labels the row បោះពុម្ពពីអេក្រង់
   * and its button opens the screen. Listing them is a claim about where they
   * can be *found*, never about how they are produced.
   */
  { id: 'student', label: 'ឯកសារសិស្ស', description: 'ឯកសារ និងបញ្ជីសម្រាប់សិស្សម្នាក់ៗ' },
]

/**
 * What a report needs the teacher to choose before it can run.
 *
 * Drives both the Print Center's flow (§14) and the server's validation — the
 * same declaration, so the form cannot ask for something the resolver ignores.
 */
export type PeriodKind = 'month' | 'semester' | 'year' | 'none'

/** How a report's document is produced. */
export type ReportFormat = 'xlsx' | 'docx' | 'html' | 'xlsm'

/**
 * What the teacher is told they will get.
 *
 * Here rather than in a component because two surfaces render it — the index's
 * rows and the generation flow's download button — and a file that a row calls
 * `Excel` must not become `xlsx` one dialog later. `html` is not a file at all:
 * it is the screen's own browser print, so it is named as the action it is.
 */
export const FORMAT_LABELS: Record<ReportFormat, string> = {
  xlsx: 'Excel',
  xlsm: 'Excel (VBA)',
  docx: 'Word',
  html: 'បោះពុម្ពពីអេក្រង់',
}

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
  /**
   * Subsection heading inside a large family (§42).
   *
   * Only the yearly family needs one: seven reports in a flat list is a wall,
   * and the three things a teacher actually comes for — the year's totals, the
   * per-subject view, and the promote/repeat decision — are not the same
   * errand. Declared here rather than in the Print Center because it is a fact
   * about the catalogue, and a second list of groupings in a React component is
   * exactly the drift §28 forbids. Undefined means the family lists flat.
   *
   * Display only. Never key anything on it.
   */
  group?: string
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
    description: 'ពិន្ទុប្រឡងឆមាស ម.ភាគប្រចាំខែ និងម.ភាគឆមាស តាមលំដាប់បញ្ជីឈ្មោះ',
    period: 'semester',
    formats: ['xlsx'],
    legacyHref: '/score/print',
    resolver: true,
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
  // ------------------------------------------------------------ attendance
  /*
   * The two attendance SHEETS, moved here from the វត្តមាន menu (§27).
   *
   * They belong in the print centre and not in that menu because neither one
   * records anything — `/attendance/monthly` reads the month and prints it,
   * `/attendance/yearly` totals the year and prints that. Recording attendance
   * is `/attendance/layout`, which stays exactly where it was. What moved is
   * the paperwork, which is what this screen is the front door for.
   *
   * They arrived here as `legacyHref` cards that opened those screens, and now
   * generate through the engine as well: same form as the thirteen score
   * sheets, same roster scope, same writer. The screens and their own print and
   * export buttons are untouched and still linked — nothing was reimplemented
   * by deleting it.
   */
  {
    type: 'attendance_monthly',
    category: 'attendance',
    label: 'បញ្ជីវត្តមានប្រចាំខែ',
    description: 'បញ្ជីវត្តមានសិស្សប្រចាំខែ ព្រមទាំងបោះពុម្ព និងនាំចេញ Excel/PDF',
    period: 'month',
    formats: ['xlsx'],
    // The screen still works and is still linked; the engine now prints it too.
    legacyHref: '/attendance/monthly',
    resolver: true,
  },
  {
    type: 'attendance_yearly',
    category: 'attendance',
    label: 'អវត្តមានប្រចាំឆ្នាំ',
    description: 'សរុបអវត្តមានសិស្សពេញមួយឆ្នាំសិក្សា',
    period: 'year',
    formats: ['xlsx'],
    legacyHref: '/attendance/yearly',
    resolver: true,
  },

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
    description: 'លំដាប់សិស្សតាមមធ្យមភាគឆមាសទាំងពីរ និងលទ្ធផលប្រចាំឆ្នាំ',
    period: 'year',
    formats: ['xlsx'],
    legacyHref: '/ranking',
    resolver: true,
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
    description: 'បណ្ណសរសើរជា Word មួយទំព័រក្នុងមួយសិស្ស តាមលទ្ធផលប្រចាំឆ្នាំ',
    period: 'year',
    formats: ['docx', 'html'],
    legacyHref: '/certificate',
    resolver: true,
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
    resolver: true,
    group: 'លទ្ធផលសិក្សា',
  },
  {
    type: 'annual_monthly_ranking',
    category: 'yearly',
    label: 'ចំណាត់ថ្នាក់ និងនិទ្ទេស',
    description: 'ចំណាត់ថ្នាក់ប្រចាំខែ និងនិទ្ទេសពេញមួយឆ្នាំ',
    period: 'year',
    formats: ['xlsx'],
    legacyHref: '/yearly-report',
    resolver: true,
    group: 'លទ្ធផលសិក្សា',
  },
  {
    type: 'annual_monthly_average',
    category: 'yearly',
    label: 'មធ្យមភាគប្រចាំឆ្នាំ',
    description: 'មធ្យមភាគរបស់សិស្សម្នាក់ៗពេញមួយឆ្នាំ',
    period: 'year',
    formats: ['xlsx'],
    legacyHref: '/yearly-report',
    resolver: true,
    group: 'លទ្ធផលសិក្សា',
  },
  {
    type: 'annual_subject',
    category: 'yearly',
    label: 'មុខវិជ្ជាប្រចាំឆ្នាំ',
    description: 'មធ្យមភាគតាមមុខវិជ្ជាពេញមួយឆ្នាំ',
    period: 'year',
    formats: ['xlsx'],
    legacyHref: '/yearly-report',
    resolver: true,
    group: 'តាមមុខវិជ្ជា',
  },
  {
    type: 'annual_subject_results',
    category: 'yearly',
    label: 'លទ្ធផលតាមមុខវិជ្ជា',
    description: 'ចំនួនសិស្សជាប់/ធ្លាក់តាមមុខវិជ្ជា',
    period: 'year',
    formats: ['xlsx'],
    legacyHref: '/yearly-report/subject-results',
    resolver: true,
    group: 'តាមមុខវិជ្ជា',
  },
  {
    type: 'annual_promoted_students',
    category: 'yearly',
    label: 'សិស្សឡើងថ្នាក់',
    description: 'បញ្ជីសិស្សដែលឡើងថ្នាក់',
    period: 'year',
    formats: ['xlsx'],
    legacyHref: '/yearly-report/promoted',
    resolver: true,
    group: 'លទ្ធផលឡើងថ្នាក់',
  },
  {
    type: 'annual_repeated_students',
    category: 'yearly',
    label: 'សិស្សត្រួតថ្នាក់',
    description: 'បញ្ជីសិស្សដែលត្រួតថ្នាក់',
    period: 'year',
    formats: ['xlsx'],
    legacyHref: '/yearly-report/repeated',
    resolver: true,
    group: 'លទ្ធផលឡើងថ្នាក់',
  },

  // -------------------------------------------------------------- tracking
  {
    type: 'student_tracking_record_book',
    category: 'tracking',
    label: 'សៀវភៅសិក្ខាគារិក',
    description: 'កំណត់ត្រាតាមដានសិស្សប្រចាំឆ្នាំ — ១ទំព័រក្នុងមួយសិស្ស ជា Word',
    period: 'year',
    // DOCX because the form is page-oriented — one sheet per pupil — which a
    // single worksheet's one repeating row cannot express (§24). `html` stays
    // listed: the legacy /record-book screen still prints it that way (§29).
    formats: ['docx', 'html'],
    legacyHref: '/record-book',
    resolver: true,
  },
  /*
   * The other two documents §8 names under TRACKING / ADMIN, and the last
   * printable class paperwork that was catalogued nowhere.
   *
   * `/student-tracking` is the *screen* សៀវភៅតាមដាន — a different document from
   * `student_tracking_record_book`, which is the engine's per-pupil Word book
   * printed from `/record-book`. They share a subject and not a sheet, which is
   * exactly why both belong in the family rather than one standing for the
   * other.
   */
  {
    type: 'student_tracking_sheet',
    category: 'tracking',
    label: 'សៀវភៅតាមដានសិស្ស',
    description: 'តារាងតាមដានវឌ្ឍនភាពសិស្សប្រចាំឆ្នាំ សម្រាប់បោះពុម្ព',
    period: 'year',
    formats: ['html'],
    legacyHref: '/student-tracking',
    resolver: false,
  },
  {
    type: 'class_admin_books',
    category: 'classroom',
    label: 'រដ្ឋបាលថ្នាក់រៀន (១៣ សៀវភៅ)',
    description: 'សៀវភៅរដ្ឋបាលថ្នាក់រៀនតាមទម្រង់ក្រសួង ១៣ ប្រភេទ',
    period: 'none',
    formats: ['html'],
    legacyHref: '/class-admin',
    resolver: false,
  },
  {
    type: 'class_cleaning_rota',
    category: 'classroom',
    label: 'វេនសម្អាតថ្នាក់',
    description: 'តារាងវេនសម្អាតថ្នាក់ សម្រាប់បោះពុម្ព និងបិទក្នុងថ្នាក់',
    period: 'none',
    formats: ['html'],
    legacyHref: '/cleaning-schedule',
    resolver: false,
  },
  {
    type: 'tpp_master_book',
    category: 'tracking',
    label: 'សៀវភៅតាមដាន TPP 2026 (VBA Form)',
    description: 'សៀវភៅតាមដាន និងគ្រប់គ្រងពិន្ទុសិស្ស TPP 2026 ពេញលេញ ១៤៥ សន្លឹក — បំពេញទិន្នន័យស្វ័យប្រវត្តិ',
    period: 'month',
    formats: ['xlsx', 'xlsm'],
    legacyHref: null,
    resolver: true,
  },

  // ------------------------------------------------------ student documents
  /*
   * Five screens that already work, indexed rather than rebuilt (§27).
   *
   * `resolver: false` on every one of them, deliberately: none has a data
   * resolver in `report-data.ts`, and claiming otherwise would make
   * `reportAvailability` offer a generate button that produces nothing. The
   * honest state is `legacy_only` — "there is a screen, here it is".
   *
   * `formats: ['html']` for the same reason: `html` in this catalogue means
   * "the screen's own browser print", not a file the engine writes. Four of
   * these five print from the browser; the roster list also exports Excel from
   * its own screen, which is why it lists both.
   */
  {
    type: 'student_id_card',
    category: 'student',
    label: 'បណ្ណសម្គាល់ខ្លួនសិស្ស',
    description: 'បោះពុម្ពកាតសម្គាល់ខ្លួនសិស្ស ជាមួយរូបថត និងព័ត៌មានថ្នាក់',
    period: 'none',
    formats: ['html'],
    legacyHref: '/id-student',
    resolver: false,
  },
  {
    type: 'student_parent_codes',
    category: 'student',
    label: 'លេខកូដសិស្សសម្រាប់អាណាព្យាបាល',
    description: 'លេខកូដដែលអាណាព្យាបាលប្រើដើម្បីភ្ជាប់គណនីទៅសិស្ស',
    period: 'none',
    formats: ['html'],
    legacyHref: '/print-student-codes',
    resolver: false,
  },
  {
    type: 'student_roster_print',
    category: 'student',
    label: 'បញ្ជីរាយនាមសិស្ស',
    description: 'បញ្ជីឈ្មោះសិស្សទាំងមូល សម្រាប់បោះពុម្ព ឬនាំចេញ Excel',
    period: 'none',
    formats: ['xlsx', 'html'],
    legacyHref: '/print-list',
    resolver: false,
  },
  {
    type: 'student_age_height',
    category: 'student',
    label: 'វិភាគអាយុ និងកម្ពស់',
    description: 'តារាងវិភាគអាយុ និងកម្ពស់សិស្សក្នុងថ្នាក់',
    period: 'none',
    formats: ['html'],
    legacyHref: '/print-student-age',
    resolver: false,
  },
  {
    type: 'student_parent_report',
    category: 'student',
    label: 'របាយការណ៍ជូនអាណាព្យាបាល',
    description: 'សន្លឹកលទ្ធផលប្រចាំខែសម្រាប់សិស្សម្នាក់ៗ ជូនអាណាព្យាបាល',
    period: 'month',
    formats: ['html'],
    legacyHref: '/parent-report',
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

/* ═════════════════════════════════════════════════════════════════════════
 * THE SHELF THE DOCUMENTS SIT ON
 * ═════════════════════════════════════════════════════════════════════════
 *
 * A category answers "what kind of document is this?". It is the right key for
 * a deep link (`?category=student`) and the wrong unit to lay a page out in,
 * because a teacher does not arrive looking for a kind — they arrive with an
 * errand. Nine categories rendered as nine equal panels is the wall this
 * replaces: ពិន្ទុ, ចំណាត់ថ្នាក់, កិត្តិយស and វិញ្ញាបនបត្រ are four kinds and one
 * errand ("the paperwork I file upward"), while វត្តមាន is one kind and an
 * errand of its own that was buried third in a row of nine.
 *
 * So a SECTION groups categories by errand, and it lives here rather than in
 * `PrintCenterClient` for exactly the reason `group` does: a second list of
 * groupings inside a React component is the drift the catalogue exists to
 * prevent. The Print Center renders this; it decides none of it.
 *
 * Categories are unchanged and still canonical — every one of them belongs to
 * exactly one section, which `verify-reporting.mts` checks, so `?category=`
 * keeps resolving and nothing that links here had to be rewritten.
 */

export type ReportSectionId = 'official' | 'attendance' | 'annual' | 'classAdmin' | 'student'

export interface ReportSectionGroup {
  /**
   * The run's heading inside the section, or `null` for a section whose
   * documents list flat.
   *
   * Not always one category: កិត្តិយស and វិញ្ញាបនបត្រ hold one report each and
   * are one shelf to a teacher, so they share a run rather than each becoming a
   * heading above a single line.
   */
  label: string | null
  categories: ReportCategory[]
}

export interface ReportSection {
  id: ReportSectionId
  label: string
  /** One line on the errand, shown under the heading. */
  description: string
  groups: ReportSectionGroup[]
}

export const REPORT_SECTIONS: ReportSection[] = [
  {
    id: 'official',
    label: 'របាយការណ៍ផ្លូវការ',
    description: 'តារាងពិន្ទុ ចំណាត់ថ្នាក់ និងឯកសារកិត្តិយសសម្រាប់ដាក់ជូនសាលា',
    groups: [
      { label: 'ពិន្ទុ', categories: ['scores'] },
      { label: 'ចំណាត់ថ្នាក់', categories: ['ranking'] },
      { label: 'កិត្តិយស និងវិញ្ញាបនបត្រ', categories: ['honor', 'certificate'] },
    ],
  },
  {
    id: 'attendance',
    label: 'វត្តមាន',
    description: 'បញ្ជីវត្តមានប្រចាំខែ និងសរុបអវត្តមានប្រចាំឆ្នាំ',
    groups: [{ label: null, categories: ['attendance'] }],
  },
  {
    id: 'annual',
    label: 'លទ្ធផលប្រចាំឆ្នាំ',
    description: 'លទ្ធផលដំណាច់ឆ្នាំ និងការសម្រេចឡើងថ្នាក់',
    // Flat here on purpose: the seven annual reports already carry `group`,
    // which splits them into the three errands a teacher comes for. A second
    // split at this level would be the same cut made twice.
    groups: [{ label: null, categories: ['yearly'] }],
  },
  {
    id: 'classAdmin',
    label: 'ឯកសាររដ្ឋបាលថ្នាក់',
    description: 'សៀវភៅតាមដាន សៀវភៅរដ្ឋបាល និងការរៀបចំថ្នាក់',
    groups: [
      { label: 'សៀវភៅតាមដាន', categories: ['tracking'] },
      { label: 'ការរៀបចំថ្នាក់', categories: ['classroom'] },
    ],
  },
  {
    id: 'student',
    label: 'ឯកសារសិស្ស',
    description: 'ឯកសារ និងបញ្ជីសម្រាប់សិស្សម្នាក់ៗ',
    groups: [{ label: null, categories: ['student'] }],
  },
]

/** Every category the section holds, in section order. */
export function categoriesInSection(id: ReportSectionId): ReportCategory[] {
  return (REPORT_SECTIONS.find((s) => s.id === id)?.groups ?? []).flatMap((g) => g.categories)
}

/** Which shelf a category sits on. Every category sits on exactly one. */
export function sectionForCategory(category: ReportCategory): ReportSection | undefined {
  return REPORT_SECTIONS.find((s) => s.groups.some((g) => g.categories.includes(category)))
}

/** Every report on a shelf, in catalogue order. */
export function reportsInSection(id: ReportSectionId): ReportDefinition[] {
  const categories = new Set(categoriesInSection(id))
  return REPORT_DEFINITIONS.filter((r) => categories.has(r.category))
}

/* ────────────────────────────────────────────────────────────────────────
 * HOW LOUDLY A DOCUMENT SHOULD SPEAK
 * ────────────────────────────────────────────────────────────────────────
 *
 * Twenty-seven documents cannot all be equally important, and a page that
 * pretends otherwise makes the teacher read all of them every visit. Two short
 * lists rather than a field on all twenty-seven definitions: the default is the
 * middle, and only the ends are a claim worth making.
 *
 * P0 decides which shelves open on arrival. It does NOT reorder anything —
 * catalogue order is the order a teacher learns, and shuffling it by
 * "importance" would move a document every time the list changed.
 */

/** The documents a primary form master reaches for in an ordinary month. */
export const PRIMARY_DOCUMENTS: readonly ReportType[] = [
  'score_monthly',
  'score_semester',
  'ranking_monthly',
  'ranking_semester',
  'ranking_annual',
  'attendance_monthly',
  'annual_summary',
]

/** Paperwork that is real, needed, and needed rarely. */
export const OCCASIONAL_DOCUMENTS: readonly ReportType[] = [
  'tpp_master_book',
  'class_admin_books',
  'class_cleaning_rota',
  'student_tracking_sheet',
]

export function reportPriority(type: ReportType): 0 | 1 | 2 {
  if (PRIMARY_DOCUMENTS.includes(type)) return 0
  if (OCCASIONAL_DOCUMENTS.includes(type)) return 2
  return 1
}

/**
 * The four documents the quick-print row offers, in order.
 *
 * Deliberately a short fixed list and not "everything P0": a quick action is a
 * row of large targets at the top of the page, and seven of them is a second
 * index above the index. Each resolves against the period bar's current
 * selection, so "ពិន្ទុខែនេះ" means the month on screen.
 *
 * Every entry must be generatable — `verify-reporting.mts` checks it — because
 * the one thing a quick action may not do is be the biggest button on the page
 * and then say មិនទាន់មាន.
 */
export const QUICK_ACTION_REPORTS: readonly ReportType[] = [
  'score_monthly',
  'attendance_monthly',
  'ranking_monthly',
  'annual_summary',
]

/* ────────────────────────────────────────────────────────────────────────
 * DOCUMENTS THAT DO NOT EXIST YET
 * ────────────────────────────────────────────────────────────────────────
 *
 * Named here as PLAIN TEXT, deliberately carrying no `ReportType`, no category
 * and no availability.
 *
 * The catalogue's own invariant — pinned twice, by `verify-reporting.mts` and
 * `verify-students.mts` — is that no entry may be both resolver-less and
 * screen-less, because such an entry renders as a row that offers nothing. That
 * invariant is what keeps every line in the index actionable, and announcing
 * four planned families by minting fourteen schema identifiers for documents
 * with no screen, no data and no template would break it for a roadmap.
 *
 * So the roadmap is a roadmap: one quiet collapsed block at the foot of the
 * page, saying what is coming and that it is not here. It costs the teacher one
 * line of screen and answers the question ("is KruSmart going to print my GEIP
 * plan?") that would otherwise be answered by a fruitless search.
 *
 * When one of these is built it gains a screen or a resolver and MOVES into
 * `REPORT_DEFINITIONS` — it never graduates by being given an identifier here.
 */
export interface PlannedDocumentGroup {
  id: string
  label: string
  description: string
  /** Documents, by the name a teacher would call them. */
  documents: string[]
  /** A caveat the teacher needs before they plan around it. */
  note?: string
}

export const PLANNED_DOCUMENT_GROUPS: PlannedDocumentGroup[] = [
  {
    id: 'assessment',
    label: 'តេស្ត និងការវាស់ស្ទង់',
    description: 'លទ្ធផលវាស់ស្ទង់សមត្ថភាពដើមឆ្នាំ និងចុងឆ្នាំ',
    documents: ['CALM ដើមឆ្នាំ', 'CALM ចុងឆ្នាំ', 'ប្រៀបធៀបដើម–ចុងឆ្នាំ'],
    note: 'លទ្ធផលពី PLP · មិនរាប់ចូលការឡើងថ្នាក់',
  },
  {
    id: 'teaching_plan',
    label: 'ផែនការបង្រៀន',
    description: 'ផែនការបង្រៀនតាមរយៈពេល (GEIP)',
    documents: [
      'ផែនការបង្រៀន ៣ ឆ្នាំ',
      'ផែនការបង្រៀន ១ ឆ្នាំ',
      'ផែនការបង្រៀន ១ ឆ្នាំ + ៣ ខែ',
      'ផែនការបង្រៀន ៣ ខែ',
    ],
  },
  {
    id: 'learning_plan',
    label: 'ផែនការសិក្សារបស់សិស្ស',
    description: 'ផែនការជួយសិស្សតាមលទ្ធផលនិទ្ទេស',
    documents: ['បញ្ជីសិស្សរៀនឡើងនិទ្ទេស', 'សៀវភៅផែនការសិស្សម្នាក់ៗ'],
  },
  {
    id: 'agreement',
    label: 'កិច្ចព្រមព្រៀង',
    description: 'កិច្ចព្រមព្រៀងសមិទ្ធកម្មប្រចាំឆ្នាំ',
    documents: ['កិច្ចព្រមព្រៀងគ្រូ–មាតាបិតា', 'កិច្ចព្រមព្រៀងសមិទ្ធកម្ម គ្រូ–នាយក'],
  },
]
