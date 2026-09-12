/**
 * Document templates — the official file a report is printed onto.
 *
 * NOT the score template, and the distinction is the one §4 insists on because
 * conflating them is how a curriculum change silently reformats a ministry
 * document:
 *
 *     score template     which SUBJECTS a class assesses
 *                        -> score_template_subjects, lib/scores/template.ts
 *     document template  which FILE the results are printed onto
 *                        -> this module
 *
 * A class changing from three subjects to four changes the score template and
 * changes nothing here: the document template describes a layout with a
 * *variable* subject region, which the generator expands to fit.
 *
 * WHERE THE FILES LIVE
 * In the repository, under `lib/reporting/templates/`, and resolved through
 * `TEMPLATE_REGISTRY` below. That was a deliberate choice over a storage bucket
 * for the first phase: a template is code-shaped, not user data — it changes
 * with a deploy, it must be reviewable in a diff, and every environment must
 * have the same one. A bucket would add an upload screen, a policy surface and
 * a way for staging and production to disagree about what a ministry document
 * looks like, none of which buys anything until schools start supplying their
 * own files. The registry's shape is the same one a `report_document_templates`
 * row would have, so moving to a bucket later is a resolver change, not a
 * redesign.
 *
 * Pure and free of server-only imports: the Print Center lists versions in the
 * browser, and only `loadTemplateFile` (server-only, separate module) touches
 * the filesystem.
 */

import type { ReportDefinition, ReportFormat, ReportType } from './report-types.ts'

/**
 * One version of one report's document template.
 *
 * `id` and `version` are recorded on every generated document (§7/§24) so a
 * file can be traced back to the exact layout that produced it — which is the
 * whole reason versions are values rather than "whatever is on disk today".
 */
export interface DocumentTemplate {
  /** Stable id, recorded in generation metadata. `${reportType}_v${version}`. */
  id: string
  reportType: ReportType
  version: number
  /** Khmer label for the version picker, when a report has more than one. */
  label: string
  format: ReportFormat
  /** Path under `lib/reporting/templates/`, resolved server-side. */
  file: string
  /** Which curriculum this layout is for. Primary only for now (§1). */
  educationLevel: 'primary'
  /** Grades this layout suits; empty means every grade of the level. */
  grades: number[]
  /** Newer versions supersede older ones; exactly one active per report. */
  isActive: boolean
  /**
   * Where the layout came from — the honest provenance §5 needs.
   *
   * `derived` means it was generated from a screen this product already ships
   * (see `scripts/build-report-templates.mts`), so it reproduces output that
   * has been in use, but it is NOT a transcription of a ministry file. An
   * `official` template is one a school or the ministry supplied. The Print
   * Center says which, because a teacher submitting paperwork upward needs to
   * know whether the layout is authoritative.
   */
  provenance: 'derived' | 'official'
  notes?: string
}

/**
 * Every document template the build ships.
 *
 * One entry per version. Superseding a layout means adding a row with
 * `isActive: true` and flipping the old one to `false` — never editing a
 * shipped version in place, because a document generated last term must stay
 * reproducible from the version it recorded.
 */
export const TEMPLATE_REGISTRY: DocumentTemplate[] = [
  // ------------------------------------------------------------ attendance
  {
    id: 'attendance_monthly_v1',
    reportType: 'attendance_monthly',
    version: 1,
    label: 'បញ្ជីវត្តមានប្រចាំខែ — ទម្រង់សាលា (v1)',
    format: 'xlsx',
    file: 'attendance/attendance_monthly_v1.xlsx',
    educationLevel: 'primary',
    grades: [],
    isActive: true,
    provenance: 'derived',
    notes:
      'ជួរឈរមួយក្នុងមួយថ្ងៃនៃខែ ក្បាលតារាងបីជួរ (កាលបរិច្ឆេទ · ថ្ងៃទី · ថ្ងៃ)។ '
      + 'តួលេខទាំងអស់មកពីតារាង attendance តាមវិសាលភាពថ្នាក់ដូចរបាយការណ៍ពិន្ទុដដែល។',
  },
  {
    id: 'attendance_yearly_v1',
    reportType: 'attendance_yearly',
    version: 1,
    label: 'អវត្តមានប្រចាំឆ្នាំ — ទម្រង់សាលា (v1)',
    format: 'xlsx',
    file: 'attendance/attendance_yearly_v1.xlsx',
    educationLevel: 'primary',
    grades: [],
    isActive: true,
    provenance: 'derived',
    notes:
      'ជួរឈរពីរក្នុងមួយខែ (ច្ប · អច្ប) ដោយឈ្មោះខែឃ្លុំពីលើ រួចឆមាស និងប្រចាំឆ្នាំ។ '
      + 'លំដាប់ខែ វិច្ឆិកា → តុលា តាមកម្មវិធី មិនមែន តុលា → កញ្ញា តាមឯកសារចាស់ទេ។',
  },
  {
    id: 'score_monthly_v1',
    reportType: 'score_monthly',
    version: 1,
    label: 'ទម្រង់ក្រសួង (v1)',
    format: 'xlsx',
    file: 'scores/score_monthly_v1.xlsx',
    educationLevel: 'primary',
    grades: [],
    // Superseded by v2. Kept in the registry, not deleted: a document generated
    // before the change recorded this id, and it must stay reproducible.
    isActive: false,
    provenance: 'derived',
    notes:
      'បង្កើតចេញពីទម្រង់ដែល /score/print បង្ហាញរួចហើយ — មិនមែនចម្លងផ្ទាល់ពីឯកសារក្រសួងទេ។',
  },
  {
    id: 'score_monthly_v2',
    reportType: 'score_monthly',
    version: 2,
    label: 'តារាងសរុបពិន្ទុប្រចាំខែ — ទម្រង់សាលា (v2)',
    format: 'xlsx',
    file: 'scores/score_monthly_v2.xlsx',
    educationLevel: 'primary',
    grades: [],
    isActive: true,
    provenance: 'derived',
    notes:
      'ក្បាលលិខិតពីរជួរ បញ្ជីសង្ខេបតាមលទ្ធផល និងតាមនិទ្ទេស ព្រមទាំងកន្លែងចុះហត្ថលេខា '
      + 'តាមទម្រង់ដែលសាលាផ្តល់មក។ ពិន្ទុសរុប មធ្យមភាគ ចំណាត់ថ្នាក់ និងនិទ្ទេស '
      + 'មកពីប្រព័ន្ធគណនារបស់កម្មវិធី មិនមែនពីរូបមន្តក្នុងសន្លឹកទេ។',
  },
  {
    id: 'score_monthly_tpp',
    reportType: 'score_monthly',
    version: 3,
    label: 'តារាងពិន្ទុប្រចាំខែ — ទម្រង់ TPP 2026 (VBA Form បឋមសិក្សា)',
    format: 'xlsx',
    file: 'tracking/tpp2026_master.xlsm',
    educationLevel: 'primary',
    grades: [],
    isActive: false,
    provenance: 'official',
    notes:
      'ទម្រង់តារាងពិន្ទុប្រចាំខែដកស្រង់ចេញពី VBA TPP 2026 ផ្លូវការ — មានបំណិនរងគ្រប់មុខវិជ្ជា និងរូបមន្តត្រឹមត្រូវ។',
  },
  {
    id: 'ranking_monthly_v1',
    reportType: 'ranking_monthly',
    version: 1,
    label: 'តារាងចំណាត់ថ្នាក់ប្រចាំខែ (v1)',
    format: 'xlsx',
    file: 'ranking/ranking_monthly_v1.xlsx',
    educationLevel: 'primary',
    grades: [],
    // Superseded by the school-supplied form (v2). Kept, not deleted: a
    // document generated before the change recorded this id.
    isActive: false,
    provenance: 'derived',
    notes:
      'បង្កើតចេញពីទម្រង់ដែល /ranking បង្ហាញរួចហើយ — មិនមែនចម្លងផ្ទាល់ពីឯកសារក្រសួងទេ។',
  },
  {
    id: 'ranking_monthly_v2',
    reportType: 'ranking_monthly',
    version: 2,
    label: 'តារាងចំណាត់ថ្នាក់ប្រចាំខែ — ទម្រង់សាលា (v2)',
    format: 'xlsx',
    file: 'ranking/ranking_monthly_v2.xlsx',
    educationLevel: 'primary',
    grades: [],
    isActive: true,
    provenance: 'derived',
    notes:
      'ក្បាលលិខិតពីរជួរ បញ្ជីសង្ខេប និងកន្លែងចុះហត្ថលេខា តាមទម្រង់ដែលសាលាផ្តល់មក។ '
      + 'តួលេខទាំងអស់មកពីប្រព័ន្ធគណនារបស់កម្មវិធី មិនមែនពីរូបមន្តក្នុងសន្លឹកទេ។',
  },
  {
    id: 'ranking_monthly_tpp',
    reportType: 'ranking_monthly',
    version: 3,
    label: 'តារាងចំណាត់ថ្នាក់ប្រចាំខែ — ទម្រង់ TPP 2026 (VBA Form)',
    format: 'xlsx',
    file: 'tracking/tpp2026_master.xlsm',
    educationLevel: 'primary',
    grades: [],
    isActive: false,
    provenance: 'official',
    notes:
      'ទម្រង់តារាងចំណាត់ថ្នាក់ប្រចាំខែដកស្រង់ចេញពី VBA TPP 2026 ផ្លូវការ។',
  },
  {
    id: 'ranking_semester_v1',
    reportType: 'ranking_semester',
    version: 1,
    label: 'តារាងចំណាត់ថ្នាក់ឆមាស (v1)',
    format: 'xlsx',
    file: 'ranking/ranking_semester_v1.xlsx',
    educationLevel: 'primary',
    grades: [],
    // Superseded by the school-supplied form (v2). Kept, not deleted: a
    // document generated before the change recorded this id.
    isActive: false,
    provenance: 'derived',
    notes:
      'បង្ហាញម.ភាគប្រឡង និងម.ភាគប្រចាំខែដាច់ដោយឡែក — មិនមែនចម្លងផ្ទាល់ពីឯកសារក្រសួងទេ។',
  },
  {
    id: 'ranking_semester_v2',
    reportType: 'ranking_semester',
    version: 2,
    label: 'តារាងចំណាត់ថ្នាក់ឆមាស — ទម្រង់សាលា (v2)',
    format: 'xlsx',
    file: 'ranking/ranking_semester_v2.xlsx',
    educationLevel: 'primary',
    grades: [],
    isActive: true,
    provenance: 'derived',
    notes:
      'ក្បាលលិខិតពីរជួរ បញ្ជីសង្ខេប និងកន្លែងចុះហត្ថលេខា តាមទម្រង់ដែលសាលាផ្តល់មក។ '
      + 'តួលេខទាំងអស់មកពីប្រព័ន្ធគណនារបស់កម្មវិធី មិនមែនពីរូបមន្តក្នុងសន្លឹកទេ។',
  },
  {
    id: 'ranking_semester_tpp',
    reportType: 'ranking_semester',
    version: 3,
    label: 'តារាងចំណាត់ថ្នាក់ឆមាស — ទម្រង់ TPP 2026 (VBA Form)',
    format: 'xlsx',
    file: 'tracking/tpp2026_master.xlsm',
    educationLevel: 'primary',
    grades: [],
    isActive: false,
    provenance: 'official',
    notes:
      'ទម្រង់តារាងចំណាត់ថ្នាក់ឆមាសដកស្រង់ចេញពី VBA TPP 2026 ផ្លូវការ (ឆមាសទី១ ឬ ឆមាសទី២)។',
  },
  {
    id: 'honor_v1',
    reportType: 'honor',
    version: 1,
    label: 'តារាងកិត្តិយស (v1)',
    format: 'xlsx',
    file: 'honor/honor_v1.xlsx',
    educationLevel: 'primary',
    grades: [],
    // Superseded by the school-supplied form (v2). Kept, not deleted: a
    // document generated before the change recorded this id.
    isActive: false,
    provenance: 'derived',
    notes:
      'ទាំងទម្រង់ និងលក្ខណៈវិនិច្ឆ័យជាបណ្ដោះអាសន្ន — ក្រសួងមិនទាន់មានច្បាប់កិត្តិយសផ្លូវការក្នុងប្រព័ន្ធនេះទេ។',
  },
  {
    id: 'honor_v2',
    reportType: 'honor',
    version: 2,
    label: 'បញ្ជីសិស្សពូកែ — ទម្រង់សាលា (v2)',
    format: 'xlsx',
    file: 'honor/honor_v2.xlsx',
    educationLevel: 'primary',
    grades: [],
    isActive: true,
    provenance: 'derived',
    notes:
      'ក្បាលលិខិតពីរជួរ បញ្ជីសង្ខេប និងកន្លែងចុះហត្ថលេខា តាមទម្រង់ដែលសាលាផ្តល់មក។ '
      + 'តួលេខទាំងអស់មកពីប្រព័ន្ធគណនារបស់កម្មវិធី មិនមែនពីរូបមន្តក្នុងសន្លឹកទេ។',
  },
  {
    id: 'ranking_annual_v1',
    reportType: 'ranking_annual',
    version: 1,
    label: 'តារាងចំណាត់ថ្នាក់ប្រចាំឆ្នាំ (v1)',
    format: 'xlsx',
    file: 'ranking/ranking_annual_v1.xlsx',
    educationLevel: 'primary',
    grades: [],
    // Superseded by the school-supplied form (v2). Kept, not deleted: a
    // document generated before the change recorded this id.
    isActive: false,
    provenance: 'derived',
    notes:
      'បង្ហាញម.ភាគឆមាសទាំងពីរ និងលទ្ធផលប្រចាំឆ្នាំ។ ប្រភពម.ភាគឆមាស (រក្សាទុក ឬគណនា) បោះពុម្ពលើសន្លឹកតែម្ដង។',
  },
  {
    id: 'ranking_annual_v2',
    reportType: 'ranking_annual',
    version: 2,
    label: 'តារាងចំណាត់ថ្នាក់ប្រចាំឆ្នាំ — ទម្រង់សាលា (v2)',
    format: 'xlsx',
    file: 'ranking/ranking_annual_v2.xlsx',
    educationLevel: 'primary',
    grades: [],
    isActive: true,
    provenance: 'derived',
    notes:
      'ក្បាលលិខិតពីរជួរ បញ្ជីសង្ខេប និងកន្លែងចុះហត្ថលេខា តាមទម្រង់ដែលសាលាផ្តល់មក។ '
      + 'តួលេខទាំងអស់មកពីប្រព័ន្ធគណនារបស់កម្មវិធី មិនមែនពីរូបមន្តក្នុងសន្លឹកទេ។',
  },
  {
    id: 'certificate_v1',
    reportType: 'certificate',
    version: 1,
    label: 'បណ្ណសរសើរ (v1)',
    format: 'docx',
    file: 'certificate/certificate_v1.docx',
    educationLevel: 'primary',
    grades: [],
    isActive: true,
    provenance: 'derived',
    notes:
      'ឯកសារ Word មួយទំព័រក្នុងមួយសិស្ស។ យកតែវាល (field) ដែល /certificate បោះពុម្ពរួចហើយ — មិនមែនចម្លងផ្ទាល់ពីឯកសារក្រសួងទេ។ ទំព័រ /certificate ដើមនៅដំណើរការដដែល។',
  },
  {
    id: 'annual_summary_v1',
    reportType: 'annual_summary',
    version: 1,
    label: 'បញ្ជីបូកលទ្ធផលសរុប (v1)',
    format: 'xlsx',
    file: 'yearly/annual_summary_v1.xlsx',
    educationLevel: 'primary',
    grades: [],
    // Superseded by the school-supplied form (v2). Kept, not deleted: a
    // document generated before the change recorded this id.
    isActive: false,
    provenance: 'derived',
    notes:
      'លទ្ធផលពេញមួយឆ្នាំក្នុងមួយសន្លឹក — ឆមាសទាំងពីរ ម.ភាគ និទ្ទេស ចំណាត់ថ្នាក់ និងលទ្ធផល។ បង្កើតដោយ KruSmart។',
  },
  {
    id: 'annual_summary_v2',
    reportType: 'annual_summary',
    version: 2,
    label: 'បញ្ជីបូកលទ្ធផលសរុបប្រចាំឆ្នាំ — ទម្រង់សាលា (v2)',
    format: 'xlsx',
    file: 'yearly/annual_summary_v2.xlsx',
    educationLevel: 'primary',
    grades: [],
    isActive: true,
    provenance: 'derived',
    notes:
      'ក្បាលលិខិតពីរជួរ បញ្ជីសង្ខេប និងកន្លែងចុះហត្ថលេខា តាមទម្រង់ដែលសាលាផ្តល់មក។ '
      + 'តួលេខទាំងអស់មកពីប្រព័ន្ធគណនារបស់កម្មវិធី មិនមែនពីរូបមន្តក្នុងសន្លឹកទេ។',
  },
  {
    id: 'annual_monthly_ranking_v1',
    reportType: 'annual_monthly_ranking',
    version: 1,
    label: 'ចំណាត់ថ្នាក់ និងនិទ្ទេស (v1)',
    format: 'xlsx',
    file: 'yearly/annual_monthly_ranking_v1.xlsx',
    educationLevel: 'primary',
    grades: [],
    // Superseded by the school-supplied form (v2). Kept, not deleted: a
    // document generated before the change recorded this id.
    isActive: false,
    provenance: 'derived',
    notes:
      'ជួរឈរមួយក្នុងមួយខែតាមប្រតិទិនពិន្ទុរបស់ថ្នាក់ បង្ហាញចំណាត់ថ្នាក់ប្រចាំខែ។ បង្កើតដោយ KruSmart។',
  },
  {
    id: 'annual_monthly_ranking_v2',
    reportType: 'annual_monthly_ranking',
    version: 2,
    label: 'ចំណាត់ថ្នាក់ និងនិទ្ទេសប្រចាំឆ្នាំ — ទម្រង់សាលា (v2)',
    format: 'xlsx',
    file: 'yearly/annual_monthly_ranking_v2.xlsx',
    educationLevel: 'primary',
    grades: [],
    isActive: true,
    provenance: 'derived',
    notes:
      'ក្បាលលិខិតពីរជួរ បញ្ជីសង្ខេប និងកន្លែងចុះហត្ថលេខា តាមទម្រង់ដែលសាលាផ្តល់មក។ '
      + 'តួលេខទាំងអស់មកពីប្រព័ន្ធគណនារបស់កម្មវិធី មិនមែនពីរូបមន្តក្នុងសន្លឹកទេ។',
  },
  {
    id: 'annual_monthly_average_v1',
    reportType: 'annual_monthly_average',
    version: 1,
    label: 'មធ្យមភាគប្រចាំឆ្នាំ (v1)',
    format: 'xlsx',
    file: 'yearly/annual_monthly_average_v1.xlsx',
    educationLevel: 'primary',
    grades: [],
    // Superseded by v2. Kept in the registry, not deleted: a document generated
    // before the change recorded this id, and it must stay reproducible.
    isActive: false,
    provenance: 'derived',
    notes:
      'មធ្យមភាគប្រចាំខែ ឆមាស និងប្រចាំឆ្នាំក្នុងតារាងតែមួយ។ បង្កើតដោយ KruSmart។',
  },
  {
    id: 'annual_monthly_average_v2',
    reportType: 'annual_monthly_average',
    version: 2,
    label: 'មធ្យមភាគប្រចាំឆ្នាំ — ទម្រង់សាលា (v2)',
    format: 'xlsx',
    file: 'yearly/annual_monthly_average_v2.xlsx',
    educationLevel: 'primary',
    grades: [],
    isActive: true,
    provenance: 'derived',
    notes:
      'ក្បាលលិខិតពីរជួរ បញ្ជីសង្ខេបតាមលទ្ធផល និងតាមនិទ្ទេស ព្រមទាំងកន្លែងចុះហត្ថលេខា '
      + 'តាមទម្រង់ដែលសាលាផ្តល់មក។ ពិន្ទុសរុប មធ្យមភាគ ចំណាត់ថ្នាក់ និងនិទ្ទេស '
      + 'មកពីប្រព័ន្ធគណនារបស់កម្មវិធី មិនមែនពីរូបមន្តក្នុងសន្លឹកទេ។',
  },
  {
    id: 'annual_subject_v1',
    reportType: 'annual_subject',
    version: 1,
    label: 'មុខវិជ្ជាប្រចាំឆ្នាំ (v1)',
    format: 'xlsx',
    file: 'yearly/annual_subject_v1.xlsx',
    educationLevel: 'primary',
    grades: [],
    // Superseded by the school-supplied form (v2). Kept, not deleted: a
    // document generated before the change recorded this id.
    isActive: false,
    provenance: 'derived',
    notes:
      'មុខវិជ្ជាមកពីទម្រង់ពិន្ទុរបស់ថ្នាក់ — ទទឹងតារាងប្រែតាមចំនួនមុខវិជ្ជា។ បង្កើតដោយ KruSmart។',
  },
  {
    id: 'annual_subject_v2',
    reportType: 'annual_subject',
    version: 2,
    label: 'មធ្យមភាគតាមមុខវិជ្ជាប្រចាំឆ្នាំ — ទម្រង់សាលា (v2)',
    format: 'xlsx',
    file: 'yearly/annual_subject_v2.xlsx',
    educationLevel: 'primary',
    grades: [],
    isActive: true,
    provenance: 'derived',
    notes:
      'ក្បាលលិខិតពីរជួរ បញ្ជីសង្ខេប និងកន្លែងចុះហត្ថលេខា តាមទម្រង់ដែលសាលាផ្តល់មក។ '
      + 'តួលេខទាំងអស់មកពីប្រព័ន្ធគណនារបស់កម្មវិធី មិនមែនពីរូបមន្តក្នុងសន្លឹកទេ។',
  },
  {
    id: 'annual_subject_results_v1',
    reportType: 'annual_subject_results',
    version: 1,
    label: 'លទ្ធផលតាមមុខវិជ្ជា (v1)',
    format: 'xlsx',
    file: 'yearly/annual_subject_results_v1.xlsx',
    educationLevel: 'primary',
    grades: [],
    // Superseded by the school-supplied form (v2). Kept, not deleted: a
    // document generated before the change recorded this id.
    isActive: false,
    provenance: 'derived',
    notes:
      'ជួរដេកជាមុខវិជ្ជា មិនមែនសិស្ស។ ច្បាប់ជាប់/ធ្លាក់ដូចទំព័រ /yearly-report/subject-results ដដែល។ បង្កើតដោយ KruSmart។',
  },
  {
    id: 'annual_subject_results_v2',
    reportType: 'annual_subject_results',
    version: 2,
    label: 'លទ្ធផលតាមមុខវិជ្ជាប្រចាំឆ្នាំ — ទម្រង់សាលា (v2)',
    format: 'xlsx',
    file: 'yearly/annual_subject_results_v2.xlsx',
    educationLevel: 'primary',
    grades: [],
    isActive: true,
    provenance: 'derived',
    notes:
      'ក្បាលលិខិតពីរជួរ បញ្ជីសង្ខេប និងកន្លែងចុះហត្ថលេខា តាមទម្រង់ដែលសាលាផ្តល់មក។ '
      + 'តួលេខទាំងអស់មកពីប្រព័ន្ធគណនារបស់កម្មវិធី មិនមែនពីរូបមន្តក្នុងសន្លឹកទេ។',
  },
  {
    id: 'annual_promoted_students_v1',
    reportType: 'annual_promoted_students',
    version: 1,
    label: 'សិស្សឡើងថ្នាក់ (v1)',
    format: 'xlsx',
    file: 'yearly/annual_promoted_students_v1.xlsx',
    educationLevel: 'primary',
    grades: [],
    // Superseded by the school-supplied form (v2). Kept, not deleted: a
    // document generated before the change recorded this id.
    isActive: false,
    provenance: 'derived',
    notes:
      'លក្ខណៈវិនិច្ឆ័យបោះពុម្ពលើសន្លឹក។ សិស្សដែលមិនទាន់មានលទ្ធផលមិនស្ថិតក្នុងបញ្ជីទេ។ បង្កើតដោយ KruSmart។',
  },
  {
    id: 'annual_promoted_students_v2',
    reportType: 'annual_promoted_students',
    version: 2,
    label: 'បញ្ជីរាយនាមសិស្សឡើងថ្នាក់ — ទម្រង់សាលា (v2)',
    format: 'xlsx',
    file: 'yearly/annual_promoted_students_v2.xlsx',
    educationLevel: 'primary',
    grades: [],
    isActive: true,
    provenance: 'derived',
    notes:
      'ក្បាលលិខិតពីរជួរ បញ្ជីសង្ខេប និងកន្លែងចុះហត្ថលេខា តាមទម្រង់ដែលសាលាផ្តល់មក។ '
      + 'តួលេខទាំងអស់មកពីប្រព័ន្ធគណនារបស់កម្មវិធី មិនមែនពីរូបមន្តក្នុងសន្លឹកទេ។',
  },
  {
    id: 'annual_repeated_students_v1',
    reportType: 'annual_repeated_students',
    version: 1,
    label: 'សិស្សត្រួតថ្នាក់ (v1)',
    format: 'xlsx',
    file: 'yearly/annual_repeated_students_v1.xlsx',
    educationLevel: 'primary',
    grades: [],
    // Superseded by the school-supplied form (v2). Kept, not deleted: a
    // document generated before the change recorded this id.
    isActive: false,
    provenance: 'derived',
    notes:
      'ជាគូបំពេញនឹងបញ្ជីឡើងថ្នាក់ — សិស្សម្នាក់ស្ថិតក្នុងបញ្ជីតែមួយប៉ុណ្ណោះ។ បង្កើតដោយ KruSmart។',
  },
  {
    id: 'annual_repeated_students_v2',
    reportType: 'annual_repeated_students',
    version: 2,
    label: 'បញ្ជីរាយនាមសិស្សត្រួតថ្នាក់ — ទម្រង់សាលា (v2)',
    format: 'xlsx',
    file: 'yearly/annual_repeated_students_v2.xlsx',
    educationLevel: 'primary',
    grades: [],
    isActive: true,
    provenance: 'derived',
    notes:
      'ក្បាលលិខិតពីរជួរ បញ្ជីសង្ខេប និងកន្លែងចុះហត្ថលេខា តាមទម្រង់ដែលសាលាផ្តល់មក។ '
      + 'តួលេខទាំងអស់មកពីប្រព័ន្ធគណនារបស់កម្មវិធី មិនមែនពីរូបមន្តក្នុងសន្លឹកទេ។',
  },
  {
    id: 'student_tracking_record_book_v1',
    reportType: 'student_tracking_record_book',
    version: 1,
    label: 'សៀវភៅសិក្ខាគារិក (v1)',
    format: 'docx',
    file: 'tracking/student_tracking_record_book_v1.docx',
    educationLevel: 'primary',
    grades: [],
    isActive: true,
    provenance: 'derived',
    notes:
      'ឯកសារ Word មួយទំព័រក្នុងមួយសិស្ស (A4 ផ្តេក) — មុខវិជ្ជាមកពីទម្រង់ពិន្ទុរបស់ថ្នាក់ និងអវត្តមានចែកតាមប្រតិទិនពិន្ទុរបស់ថ្នាក់។ ទំព័រ /record-book ដើមនៅដំណើរការដដែល។',
  },
  {
    id: 'tpp_master_v1',
    reportType: 'tpp_master_book',
    version: 1,
    label: 'ទម្រង់ TPP 2026 (Excel ធម្មតា — គ្មាន Macro ដំណើរការគ្រប់ Device)',
    format: 'xlsx',
    file: 'tracking/tpp2026_master.xlsm',
    educationLevel: 'primary',
    grades: [],
    isActive: true,
    provenance: 'official',
    notes:
      'សៀវភៅតាមដាន និងគ្រប់គ្រងពិន្ទុ TPP 2026 (១៤៥ សន្លឹក បំលែងជា Excel ធម្មតា គ្មាន Macro Warning)។ '
      + 'បំពេញព័ត៌មានគ្រូ សាលា បញ្ជីសិស្ស និងពិន្ទុស្វ័យប្រវត្តិចេញពីប្រព័ន្ធ។',
  },
  {
    id: 'tpp_master_xlsm',
    reportType: 'tpp_master_book',
    version: 2,
    label: 'ទម្រង់ TPP 2026 VBA (Macro Enabled — មានប៊ូតុងចុចបញ្ជា)',
    format: 'xlsm',
    file: 'tracking/tpp2026_master.xlsm',
    educationLevel: 'primary',
    grades: [],
    isActive: false,
    provenance: 'official',
    notes:
      'សៀវភៅតាមដាន និងគ្រប់គ្រងពិន្ទុ TPP 2026 VBA ដើម (មាន Macro និងប៊ូតុងចុចផ្លាស់ប្តូរសន្លឹកកិច្ចការ)។ '
      + 'បំពេញព័ត៌មានគ្រូ សាលា បញ្ជីសិស្ស និងពិន្ទុស្វ័យប្រវត្តិចេញពីប្រព័ន្ធ។',
  },
  {
    id: 'tpp_section_monthly',
    reportType: 'tpp_master_book',
    version: 3,
    label: 'ទាញយកតែផ្នែក ៖ តារាងពិន្ទុប្រចាំខែ (Single Monthly Score Sheet)',
    format: 'xlsx',
    file: 'tracking/tpp2026_master.xlsm',
    educationLevel: 'primary',
    grades: [],
    isActive: false,
    provenance: 'official',
    notes:
      'ទាញយកតែសន្លឹកកិច្ចការតារាងពិន្ទុប្រចាំខែដែលបានជ្រើសរើស (ទំហំស្រាល ~១.៥ MB បើកលឿន)។',
  },
  {
    id: 'tpp_section_semester',
    reportType: 'tpp_master_book',
    version: 4,
    label: 'ទាញយកតែផ្នែក ៖ តារាងពិន្ទុឆមាស (Single Semester Score Sheet)',
    format: 'xlsx',
    file: 'tracking/tpp2026_master.xlsm',
    educationLevel: 'primary',
    grades: [],
    isActive: false,
    provenance: 'official',
    notes:
      'ទាញយកតែសន្លឹកកិច្ចការតារាងពិន្ទុឆមាសទី១ ឬ ឆមាសទី២ (ទំហំស្រាល ~១.៥ MB បើកលឿន)។',
  },
  {
    id: 'score_semester_v1',
    reportType: 'score_semester',
    version: 1,
    label: 'តារាងពិន្ទុឆមាស (v1)',
    format: 'xlsx',
    file: 'scores/score_semester_v1.xlsx',
    educationLevel: 'primary',
    grades: [],
    // Superseded by the school-supplied form (v2). Kept, not deleted: a
    // document generated before the change recorded this id.
    isActive: false,
    provenance: 'derived',
    notes:
      'តារាងពិន្ទុតាមលំដាប់បញ្ជីឈ្មោះ — ម.ភាគប្រឡង និងម.ភាគប្រចាំខែបង្ហាញដាច់ដោយឡែក។ មិនមែនចម្លងផ្ទាល់ពីឯកសារក្រសួងទេ។',
  },
  {
    id: 'score_semester_v2',
    reportType: 'score_semester',
    version: 2,
    label: 'តារាងសរុបពិន្ទុឆមាស — ទម្រង់សាលា (v2)',
    format: 'xlsx',
    file: 'scores/score_semester_v2.xlsx',
    educationLevel: 'primary',
    grades: [],
    isActive: true,
    provenance: 'derived',
    notes:
      'ក្បាលលិខិតពីរជួរ បញ្ជីសង្ខេប និងកន្លែងចុះហត្ថលេខា តាមទម្រង់ដែលសាលាផ្តល់មក។ '
      + 'តួលេខទាំងអស់មកពីប្រព័ន្ធគណនារបស់កម្មវិធី មិនមែនពីរូបមន្តក្នុងសន្លឹកទេ។',
  },
  {
    id: 'score_semester_tpp',
    reportType: 'score_semester',
    version: 3,
    label: 'តារាងពិន្ទុឆមាស — ទម្រង់ TPP 2026 (VBA Form បឋមសិក្សា)',
    format: 'xlsx',
    file: 'tracking/tpp2026_master.xlsm',
    educationLevel: 'primary',
    grades: [],
    isActive: false,
    provenance: 'official',
    notes:
      'ទម្រង់តារាងពិន្ទុឆមាសដកស្រង់ចេញពី VBA TPP 2026 ផ្លូវការ (ឆមាសទី១ ឬ ឆមាសទី២)។',
  },
]

/** Templates available for a report, newest first. */
export function templatesFor(reportType: ReportType): DocumentTemplate[] {
  return TEMPLATE_REGISTRY
    .filter((t) => t.reportType === reportType)
    .sort((a, b) => b.version - a.version)
}

/** The version a new generation should use unless the teacher picks another. */
export function activeTemplate(reportType: ReportType): DocumentTemplate | undefined {
  return templatesFor(reportType).find((t) => t.isActive)
}

/** Look one up by the id recorded in generation metadata. */
export function templateById(id: string): DocumentTemplate | undefined {
  return TEMPLATE_REGISTRY.find((t) => t.id === id)
}

/**
 * Does this report generate through the engine, or only through its legacy
 * screen?
 *
 * A report with no template cannot be generated however complete its resolver
 * is, so the Print Center asks this before offering a Generate button.
 */
export function hasTemplate(reportType: ReportType): boolean {
  return TEMPLATE_REGISTRY.some((t) => t.reportType === reportType && t.isActive)
}

// ----------------------------------------------------------- availability

/**
 * What a report can actually do right now (§10/§11).
 *
 * Four states, not two, because "definition exists" and "can be generated" are
 * different claims and a card that conflates them lies to the teacher:
 *
 *   engine_ready     resolver + active template  -> generates a document
 *   needs_template   resolver, no template       -> nothing to print onto
 *   legacy_only      no resolver, but a screen   -> opens what works today
 *   not_implemented  definition only             -> honest "not yet"
 *
 * Derived HERE and nowhere else. The Print Center previously computed
 * `report.engine && template !== undefined` inside a React component, which is
 * how a second, drifting definition of "ready" gets born the first time another
 * surface needs the same answer (§12/§13).
 */
export type ReportStatus = 'engine_ready' | 'needs_template' | 'legacy_only' | 'not_implemented'

export interface ReportAvailability {
  status: ReportStatus
  /**
   * Khmer badge text — what the TEACHER is told, in words about the document.
   *
   * The four labels used to be written from the engine's point of view: a
   * report with a resolver and no document template read `ត្រូវកំណត់ Template`,
   * which names an internal artefact the teacher cannot supply, cannot see and
   * has never heard of. A report with a working screen read `ទំព័រដើម` — "the
   * original page" — which describes the migration state of this codebase and
   * not what pressing the button does.
   *
   * They say what happens instead: it is ready, it prints from its own screen,
   * or it is still being built. The four `status` values above are unchanged
   * and are what anything keying on availability must read; these are display.
   */
  label: string
  tone: 'success' | 'warning' | 'muted'
  /** What the card's primary control does. */
  action: 'generate' | 'open' | 'none'
  actionLabel: string
  /** The template that would be used, when one exists — shown per §28. */
  template: DocumentTemplate | null
}

export function reportAvailability(definition: ReportDefinition): ReportAvailability {
  const template = activeTemplate(definition.type) ?? null

  if (definition.resolver && template) {
    return {
      status: 'engine_ready',
      label: 'រួចរាល់',
      tone: 'success',
      action: 'generate',
      // `បើក` and not `បង្កើតរបាយការណ៍`, because the button does not create
      // anything: it opens the flow where the teacher picks the period, reads
      // the preview and then decides. Naming it after the last step of a flow
      // it only starts is how a teacher comes to believe a file has already
      // been written when they click away.
      actionLabel: 'បើក',
      template,
    }
  }

  if (definition.resolver && !template) {
    return {
      status: 'needs_template',
      // The teacher is told what they can do, never what the build is missing.
      // With a screen behind it this is indistinguishable, to them, from
      // `legacy_only` — and it should be: both print from a page.
      label: definition.legacyHref ? 'បោះពុម្ពពីអេក្រង់' : 'កំពុងរៀបចំ',
      tone: 'muted',
      // A resolver with no template cannot produce a file, so the card offers
      // the legacy screen if there is one rather than a button that fails.
      action: definition.legacyHref ? 'open' : 'none',
      actionLabel: 'បើកទំព័រ',
      template: null,
    }
  }

  if (definition.legacyHref) {
    return {
      status: 'legacy_only',
      label: 'បោះពុម្ពពីអេក្រង់',
      tone: 'muted',
      action: 'open',
      actionLabel: 'បើកទំព័រ',
      template: null,
    }
  }

  return {
    status: 'not_implemented',
    label: 'កំពុងរៀបចំ',
    tone: 'muted',
    action: 'none',
    actionLabel: '',
    template: null,
  }
}

// --------------------------------------------------------------- metadata

/**
 * What is recorded about a generated document (§7/§24).
 *
 * Returned to the caller and written to the audit log. Enough to reproduce the
 * file: the same inputs plus the same template version must yield the same
 * document, which is why the template id is part of it rather than "the active
 * one at the time".
 */
export interface GenerationMetadata {
  reportType: ReportType
  templateId: string
  templateVersion: number
  classId: string | null
  academicYear: string
  /** `nov`, `sem1`, or the year itself — whatever the report's period is. */
  period: string
  generatedBy: string
  generatedAt: string
  fileName: string
  format: ReportFormat
  /** Rows written, so an empty document is visible in the audit trail. */
  rowCount: number
}

/**
 * The filename a teacher downloads (§42).
 *
 * Takes the report's KHMER LABEL rather than its `ReportType`, so a teacher
 * filing a document recognises it in their downloads folder — `ranking_monthly`
 * means nothing to the person printing it. The machine identifier still travels
 * with the file, in the audit record and the generation metadata, which is
 * where something needs to key on it.
 *
 * Khmer reaches the filesystem intact — every browser this app targets handles
 * UTF-8 filenames — but separators and quotes are stripped because they would
 * break the `Content-Disposition` header the download rides on.
 */
export function downloadFileName(
  reportLabel: string,
  className: string,
  period: string,
  extension: string,
): string {
  const safe = (s: string) => s.replace(/[/\\"'\r\n]+/g, '').replace(/\s+/g, ' ').trim() || '—'
  return `KruSmart_${safe(reportLabel)}_${safe(className)}_${safe(period)}.${extension}`
}
