/**
 * Builders for Yearly/Annual family:
 * - annual_summary_v1.xlsx
 * - annual_monthly_ranking_v1.xlsx
 * - annual_monthly_average_v1.xlsx
 * - annual_monthly_average_v2.xlsx
 * - annual_subject_v1.xlsx
 * - annual_subject_results_v1.xlsx
 * - annual_promoted_students_v1.xlsx
 * - annual_repeated_students_v1.xlsx
 */

import {
  DERIVED_NOTE,
  FORM_BAND,
  FORM_GRADE,
  FORM_LEAD,
  FORM_RED,
  FORM_YEAR_SUMMARY,
  FORM_YEAR_TAIL,
  KH,
  KINGDOM_TITLES,
  NO_RESULT_LINE,
  buildSchoolFormTemplate,
  buildTableTemplate,
  type TableColumnSpec,
} from './common.mts'

/** Lead columns shared by every pupil-row annual sheet. */
const PUPIL_LEAD: TableColumnSpec[] = [
  { label: 'ល.រ', token: '{{row.no}}', width: 6 },
  { label: 'អត្តលេខ', token: '{{row.student_id}}', width: 12 },
  { label: 'គោត្តនាម និងនាម', token: '{{row.name}}', width: 28, align: 'left' },
  { label: 'ភេទ', token: '{{row.gender}}', width: 7 },
]

/** Tail columns shared by the sheets that end in the year's verdict. */
const YEAR_TAIL: TableColumnSpec[] = [
  { label: 'ម.ភាគ ឆមាសទី១', token: '{{row.sem1}}', width: 11 },
  { label: 'ម.ភាគ ឆមាសទី២', token: '{{row.sem2}}', width: 11 },
  { label: 'ម.ភាគប្រចាំឆ្នាំ', token: '{{row.average}}', width: 12 },
  { label: 'និទ្ទេស', token: '{{row.grade}}', width: 10 },
  { label: 'ចំណាត់ថ្នាក់', token: '{{row.rank}}', width: 10 },
  { label: 'លទ្ធផល', token: '{{row.status}}', width: 12 },
]

const CLASS_LINE = {
  text: 'ថ្នាក់ {{class.name}} · ថ្នាក់ទី {{class.grade}} · {{period.label}} · សិស្ស {{class.count}} នាក់',
  size: 10,
  font: KH,
}

const SOURCE_LINE = {
  text: '{{annual.source}}',
  size: 8,
  font: KH,
  italic: true,
  color: 'FF6B7280',
}

const YEAR_TOTALS_NOTE = {
  text: 'មធ្យមភាគថ្នាក់ {{class.average}} · មានពិន្ទុ {{class.scored}} នាក់ · ឡើងថ្នាក់ {{class.promoted}} នាក់ · ត្រួតថ្នាក់ {{class.repeated}} នាក់ · មិនទាន់គ្រប់ {{class.incomplete}} នាក់',
  size: 10,
}

const YEARLY_FILL = 'FFEFF6EE'

export async function buildAnnualFamily(): Promise<void> {
  // ------------------------------------------------ បញ្ជីបូកលទ្ធផលសរុប (§12)
  await buildTableTemplate({
    file: 'yearly/annual_summary_v1.xlsx',
    sheetName: 'លទ្ធផលសរុប',
    orientation: 'landscape',
    headerFill: YEARLY_FILL,
    titles: [...KINGDOM_TITLES, { text: 'បញ្ជីបូកលទ្ធផលសរុបប្រចាំឆ្នាំ', size: 14 }, CLASS_LINE, SOURCE_LINE],
    lead: PUPIL_LEAD,
    subjectWidth: null,
    tail: YEAR_TAIL,
    notes: [YEAR_TOTALS_NOTE, DERIVED_NOTE],
  })

  // -------------------------------------------- ចំណាត់ថ្នាក់ និងនិទ្ទេស (§13)
  await buildTableTemplate({
    file: 'yearly/annual_monthly_ranking_v1.xlsx',
    sheetName: 'ចំណាត់ថ្នាក់',
    orientation: 'landscape',
    headerFill: YEARLY_FILL,
    titles: [...KINGDOM_TITLES, { text: 'ចំណាត់ថ្នាក់ និងនិទ្ទេសប្រចាំឆ្នាំ', size: 14 }, CLASS_LINE, SOURCE_LINE],
    lead: PUPIL_LEAD,
    subjectWidth: 8,
    tail: YEAR_TAIL,
    notes: [
      { text: 'ជួរឈរតាមខែបង្ហាញចំណាត់ថ្នាក់ប្រចាំខែ។ ខែដែលមិនទាន់មានពិន្ទុទុកជាទទេ។', size: 9, italic: true },
      YEAR_TOTALS_NOTE,
      DERIVED_NOTE,
    ],
  })

  // ------------------------------------------------ មធ្យមភាគប្រចាំឆ្នាំ (§14)
  await buildTableTemplate({
    file: 'yearly/annual_monthly_average_v1.xlsx',
    sheetName: 'មធ្យមភាគ',
    orientation: 'landscape',
    headerFill: YEARLY_FILL,
    titles: [...KINGDOM_TITLES, { text: 'មធ្យមភាគប្រចាំឆ្នាំ', size: 14 }, CLASS_LINE, SOURCE_LINE],
    lead: PUPIL_LEAD,
    subjectWidth: 8,
    tail: YEAR_TAIL,
    notes: [
      { text: 'ជួរឈរតាមខែបង្ហាញមធ្យមភាគប្រចាំខែ។ ខែដែលមិនទាន់មានពិន្ទុទុកជាទទេ — មិនមែនសូន្យទេ។', size: 9, italic: true },
      YEAR_TOTALS_NOTE,
      DERIVED_NOTE,
    ],
  })

  // ------------------------------------------------ មុខវិជ្ជាប្រចាំឆ្នាំ (§15)
  await buildTableTemplate({
    file: 'yearly/annual_subject_v1.xlsx',
    sheetName: 'មុខវិជ្ជា',
    orientation: 'landscape',
    headerFill: YEARLY_FILL,
    titles: [...KINGDOM_TITLES, { text: 'មធ្យមភាគតាមមុខវិជ្ជាប្រចាំឆ្នាំ', size: 14 }, CLASS_LINE, SOURCE_LINE],
    lead: PUPIL_LEAD,
    subjectWidth: 9,
    tail: [
      { label: 'ម.ភាគប្រចាំឆ្នាំ', token: '{{row.average}}', width: 12 },
      { label: 'និទ្ទេស', token: '{{row.grade}}', width: 10 },
      { label: 'ចំណាត់ថ្នាក់', token: '{{row.rank}}', width: 10 },
    ],
    notes: [
      { text: 'មុខវិជ្ជាមកពីទម្រង់ពិន្ទុរបស់ថ្នាក់នេះ — មិនមែនបញ្ជីថេរទេ។', size: 9, italic: true },
      YEAR_TOTALS_NOTE,
      DERIVED_NOTE,
    ],
  })

  // --------------------------------------------- លទ្ធផលតាមមុខវិជ្ជា (§16)
  await buildTableTemplate({
    file: 'yearly/annual_subject_results_v1.xlsx',
    sheetName: 'លទ្ធផលមុខវិជ្ជា',
    orientation: 'landscape',
    headerFill: YEARLY_FILL,
    titles: [...KINGDOM_TITLES, { text: 'លទ្ធផលតាមមុខវិជ្ជាប្រចាំឆ្នាំ', size: 14 }, CLASS_LINE, SOURCE_LINE],
    lead: [
      { label: 'ល.រ', token: '{{row.no}}', width: 6 },
      { label: 'មុខវិជ្ជា', token: '{{row.subject}}', width: 30, align: 'left' },
      { label: 'មានពិន្ទុ', token: '{{row.marked}}', width: 12 },
    ],
    subjectWidth: 11,
    tail: [
      { label: 'ជាប់មធ្យមភាគ', token: '{{row.pass}}', width: 13 },
      { label: 'ជាប់និទ្ទេស ABC', token: '{{row.pass_abc}}', width: 14 },
      { label: 'ធ្លាក់មធ្យមភាគ', token: '{{row.fail}}', width: 13 },
      { label: 'មធ្យមភាគ', token: '{{row.average}}', width: 11 },
    ],
    notes: [
      { text: 'តួលេខបង្ហាញជា សរុប (ស្រី)។ មុខវិជ្ជាដែលគ្មានសិស្សណាមានពិន្ទុមិនបង្ហាញទេ។', size: 9, italic: true },
      { text: 'ជាប់ = ពាក់កណ្តាលពិន្ទុពេញ · និទ្ទេស ABC = ៧០% នៃពិន្ទុពេញ · មុខវិជ្ជាសរុប {{class.subjects}}', size: 9, italic: true },
      DERIVED_NOTE,
    ],
  })

  // ------------------------------------- សិស្សឡើងថ្នាក់ / ត្រួតថ្នាក់ (§17/§18)
  for (const [file, sheet, heading] of [
    ['yearly/annual_promoted_students_v1.xlsx', 'ឡើងថ្នាក់', 'បញ្ជីរាយនាមសិស្សឡើងថ្នាក់'],
    ['yearly/annual_repeated_students_v1.xlsx', 'ត្រួតថ្នាក់', 'បញ្ជីរាយនាមសិស្សត្រួតថ្នាក់'],
  ] as const) {
    await buildTableTemplate({
      file,
      sheetName: sheet,
      orientation: 'landscape',
      headerFill: YEARLY_FILL,
      titles: [
        ...KINGDOM_TITLES,
        { text: heading, size: 14 },
        CLASS_LINE,
        { text: 'លក្ខណៈវិនិច្ឆ័យ៖ {{list.rule}}', size: 9, font: KH, italic: true },
        SOURCE_LINE,
      ],
      lead: [
        ...PUPIL_LEAD,
        { label: 'ថ្ងៃខែឆ្នាំកំណើត', token: '{{row.dob}}', width: 14 },
      ],
      subjectWidth: null,
      tail: [
        { label: 'ម.ភាគ ឆមាសទី១', token: '{{row.sem1}}', width: 11 },
        { label: 'ម.ភាគ ឆមាសទី២', token: '{{row.sem2}}', width: 11 },
        { label: 'ម.ភាគប្រចាំឆ្នាំ', token: '{{row.average}}', width: 12 },
        { label: 'និទ្ទេស', token: '{{row.grade}}', width: 10 },
        { label: 'ចំណាត់ថ្នាក់', token: '{{row.rank}}', width: 10 },
      ],
      notes: [
        {
          text: 'សរុប {{list.count}} នាក់ ក្នុងនោះស្រី {{list.female}} នាក់ · មធ្យមភាគ {{list.average}}',
          size: 10,
        },
        {
          text: 'សិស្សដែលមិនទាន់មានលទ្ធផលប្រចាំឆ្នាំ ({{class.incomplete}} នាក់) មិនស្ថិតក្នុងបញ្ជីណាមួយទេ។',
          size: 9,
          italic: true,
        },
        DERIVED_NOTE,
      ],
    })
  }
}

export async function buildAnnualMonthlyAverageV2(): Promise<void> {
  await buildSchoolFormTemplate({
    file: 'yearly/annual_monthly_average_v2.xlsx',
    sheetName: 'មធ្យមភាគ',
    title: 'មធ្យមភាគប្រចាំឆ្នាំ',
    lead: FORM_LEAD,
    subjectWidth: 6.83,
    tail: [
      { label: 'ម.ភាគ ឆមាសទី១', token: '{{row.sem1}}', width: 8 },
      { label: 'ម.ភាគ ឆមាសទី២', token: '{{row.sem2}}', width: 8 },
      { label: 'ម.ភាគប្រចាំឆ្នាំ', token: '{{row.average}}', width: 9.5, fill: FORM_BAND, bold: true },
      { label: 'ចំណាត់ថ្នាក់', token: '{{row.rank}}', width: 8, color: FORM_RED, bold: true },
      { label: 'និទ្ទេស', token: '{{row.grade}}', width: 9.5, color: FORM_GRADE, bold: true },
      { label: 'លទ្ធផល', token: '{{row.status}}', width: 12 },
    ],
    summary: [
      { label: 'បញ្ចូលបញ្ជីត្រឹមចំនួន ៖', token: '{{class.roll_tally}}' },
      { label: 'សិស្សឡើងថ្នាក់ ៖', token: '{{class.promoted_tally}}' },
      { label: 'សិស្សត្រួតថ្នាក់ ៖', token: '{{class.repeated_tally}}' },
      { label: NO_RESULT_LINE, token: '{{class.incomplete_tally}}' },
    ],
    note: 'ជួរឈរតាមខែបង្ហាញមធ្យមភាគប្រចាំខែ។ ខែដែលមិនទាន់មានពិន្ទុទុកជាទទេ — មិនមែនសូន្យទេ។ {{annual.source}}',
  })
}


/*
 * The rest of the annual family, on the school-supplied form.
 *
 * All seven share `resolveAnnualClass`, so they share the summary block too:
 * the year's three statuses on the left and the scheme's grade bands on the
 * right. `annual_subject_results` is the one exception, and the reason the
 * band block is overridable — see its note below.
 */

/** `annual_summary` v2 — the year in one line per pupil, no variable region. */
export async function buildAnnualSummaryV2(): Promise<void> {
  await buildSchoolFormTemplate({
    file: 'yearly/annual_summary_v2.xlsx',
    sheetName: 'លទ្ធផលសរុប',
    title: 'បញ្ជីបូកលទ្ធផលសរុបប្រចាំឆ្នាំ',
    lead: FORM_LEAD,
    // No variable region: this sheet is the year's totals, not its workings.
    subjectWidth: null,
    tail: FORM_YEAR_TAIL,
    summary: FORM_YEAR_SUMMARY,
    note: 'ពិន្ទុឡើងថ្នាក់ {{class.passmark}} · មធ្យមភាគថ្នាក់ {{class.average}} · {{annual.source}}',
  })
}

/** `annual_monthly_ranking` v2 — where each pupil placed, month by month. */
export async function buildAnnualMonthlyRankingV2(): Promise<void> {
  await buildSchoolFormTemplate({
    file: 'yearly/annual_monthly_ranking_v2.xlsx',
    sheetName: 'ចំណាត់ថ្នាក់',
    title: 'ចំណាត់ថ្នាក់ និងនិទ្ទេសប្រចាំឆ្នាំ',
    lead: FORM_LEAD,
    // One column per period of the class's OWN calendar, never twelve by
    // assumption.
    subjectWidth: 6.83,
    tail: FORM_YEAR_TAIL,
    summary: FORM_YEAR_SUMMARY,
    note: 'ជួរឈរតាមខែបង្ហាញចំណាត់ថ្នាក់ប្រចាំខែ។ ខែដែលមិនទាន់មានពិន្ទុទុកជាទទេ។ {{annual.source}}',
  })
}

/** `annual_subject` v2 — the year's average per subject, per pupil. */
export async function buildAnnualSubjectV2(): Promise<void> {
  await buildSchoolFormTemplate({
    file: 'yearly/annual_subject_v2.xlsx',
    sheetName: 'មុខវិជ្ជា',
    title: 'មធ្យមភាគតាមមុខវិជ្ជាប្រចាំឆ្នាំ',
    lead: FORM_LEAD,
    subjectWidth: 6.83,
    tail: [
      { label: 'ម.ភាគប្រចាំឆ្នាំ', token: '{{row.average}}', width: 9.5, fill: FORM_BAND, bold: true },
      { label: 'ចំណាត់ថ្នាក់', token: '{{row.rank}}', width: 8, color: FORM_RED, bold: true },
      { label: 'និទ្ទេស', token: '{{row.grade}}', width: 9.5, color: FORM_GRADE, bold: true },
    ],
    summary: FORM_YEAR_SUMMARY,
    note: 'មុខវិជ្ជាមកពីទម្រង់ពិន្ទុរបស់ថ្នាក់នេះ — មិនមែនបញ្ជីថេរទេ។ {{annual.source}}',
  })
}

/**
 * `annual_subject_results` v2 — the one sheet whose ROWS are subjects.
 *
 * Two consequences, both deliberate. Its lead names a subject rather than a
 * pupil, and its variable region is the SCHEME'S GRADE BANDS rather than
 * subjects — `ReportPayload.subjects` is the one variable column region a
 * template has, and this report fills it with bands (§22).
 *
 * And it prints NO right-hand band block. That block counts pupils per grade;
 * beside a table whose rows are subjects it would put two different
 * populations under one heading, which is exactly the kind of quiet
 * disagreement between two halves of one sheet this family exists to avoid.
 */
export async function buildAnnualSubjectResultsV2(): Promise<void> {
  await buildSchoolFormTemplate({
    file: 'yearly/annual_subject_results_v2.xlsx',
    sheetName: 'លទ្ធផលមុខវិជ្ជា',
    title: 'លទ្ធផលតាមមុខវិជ្ជាប្រចាំឆ្នាំ',
    lead: [
      { label: 'ល.រ', token: '{{row.no}}', width: 5, align: 'center' },
      { label: 'មុខវិជ្ជា', token: '{{row.subject}}', width: 26, align: 'left', bold: true },
      { label: 'មានពិន្ទុ', token: '{{row.marked}}', width: 11 },
    ],
    subjectWidth: 9.5,
    tail: [
      { label: 'ជាប់មធ្យមភាគ', token: '{{row.pass}}', width: 11 },
      { label: 'ជាប់និទ្ទេស ABC', token: '{{row.pass_abc}}', width: 12 },
      { label: 'ធ្លាក់មធ្យមភាគ', token: '{{row.fail}}', width: 11, color: FORM_RED },
      { label: 'មធ្យមភាគ', token: '{{row.average}}', width: 9.5, fill: FORM_BAND, bold: true },
    ],
    summary: [
      { label: 'មុខវិជ្ជាសរុប ៖', token: '{{class.subjects}}' },
      { label: 'បញ្ចូលបញ្ជីត្រឹមចំនួន ៖', token: '{{class.roll_tally}}' },
      { label: 'ពិន្ទុជាប់ ៖', token: '{{class.passmark}}' },
      { label: 'មធ្យមភាគថ្នាក់ ៖', token: '{{class.average}}' },
    ],
    bands: null,
    note: 'តួលេខបង្ហាញជា សរុប (ស្រី)។ ជាប់ = ពាក់កណ្តាលពិន្ទុពេញ · និទ្ទេស ABC = ៧០% នៃពិន្ទុពេញ។ មុខវិជ្ជាដែលគ្មានសិស្សណាមានពិន្ទុមិនបង្ហាញទេ។',
  })
}

/**
 * `annual_promoted_students` / `annual_repeated_students` v2 — the two lists.
 *
 * They partition the class between them, and a pupil with no annual result is
 * on NEITHER: a missing year is not a failed year (§18/§36). The rule each
 * sheet filtered on rides in the subtitle, because a list that does not say
 * what put a name on it is not auditable.
 */
export async function buildAnnualPromotionListsV2(): Promise<void> {
  for (const [file, sheet, heading] of [
    ['yearly/annual_promoted_students_v2.xlsx', 'ឡើងថ្នាក់', 'បញ្ជីរាយនាមសិស្សឡើងថ្នាក់'],
    ['yearly/annual_repeated_students_v2.xlsx', 'ត្រួតថ្នាក់', 'បញ្ជីរាយនាមសិស្សត្រួតថ្នាក់'],
  ] as const) {
    await buildSchoolFormTemplate({
      file,
      sheetName: sheet,
      title: heading,
      subtitle: 'លក្ខណៈវិនិច្ឆ័យ ៖ {{list.rule}}',
      lead: [
        ...FORM_LEAD,
        { label: 'ថ្ងៃខែឆ្នាំកំណើត', token: '{{row.dob}}', width: 13 },
      ],
      subjectWidth: null,
      tail: [
        { label: 'ម.ភាគ ឆមាសទី១', token: '{{row.sem1}}', width: 8 },
        { label: 'ម.ភាគ ឆមាសទី២', token: '{{row.sem2}}', width: 8 },
        { label: 'ម.ភាគប្រចាំឆ្នាំ', token: '{{row.average}}', width: 9.5, fill: FORM_BAND, bold: true },
        { label: 'ចំណាត់ថ្នាក់', token: '{{row.rank}}', width: 8, color: FORM_RED, bold: true },
        { label: 'និទ្ទេស', token: '{{row.grade}}', width: 9.5, color: FORM_GRADE, bold: true },
      ],
      summary: [
        { label: 'សិស្សក្នុងបញ្ជីនេះ ៖', token: '{{list.count}} នាក់ ស្រី {{list.female}} នាក់' },
        { label: 'មធ្យមភាគនៃបញ្ជីនេះ ៖', token: '{{list.average}}' },
        { label: 'បញ្ចូលបញ្ជីត្រឹមចំនួន ៖', token: '{{class.roll_tally}}' },
        { label: NO_RESULT_LINE, token: '{{class.incomplete_tally}}' },
      ],
      note: 'សិស្សដែលមិនទាន់មានលទ្ធផលប្រចាំឆ្នាំមិនស្ថិតក្នុងបញ្ជីណាមួយទេ។ {{annual.source}}',
    })
  }
}
