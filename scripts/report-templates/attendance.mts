/**
 * The two ministry attendance sheets, on the school-supplied form.
 *
 * Both were screens that exported their own spreadsheet; they are engine
 * reports now, built from the same bones as the thirteen score sheets so a
 * teacher meets one document design across the whole print centre.
 *
 * WHAT MAKES THESE TWO DIFFERENT from every other report on the form: their
 * variable region needs THREE header rows, not one. A date column is headed by
 * its day number over its weekday; a month's absence pair by the month name
 * over `ច្ប` / `អច្ប`, with the month spanning both. `subHeader` is the whole
 * of that difference — see `buildSchoolFormTemplate`.
 *
 * NEITHER SHEET COMPUTES ANYTHING IN EXCEL. The supplied exports carried their
 * totals as literal values from the screen that wrote them; here every figure
 * is a token filled by `resolveAttendanceMonthly` / `resolveAttendanceYearly`,
 * which read the `attendance` table through the same roster scope the score
 * reports use.
 */

import {
  FORM_BAND,
  FORM_LEAD,
  FORM_RED,
  buildSchoolFormTemplate,
  type FormColumnSpec,
} from './common.mts'

/** No pupil-band block on either sheet: neither one grades anybody. */
const NO_BANDS = null

/**
 * `attendance_monthly` — របាយការណ៍វត្តមានសិស្សប្រចាំខែ.
 *
 * One column per day of the month, so February prints twenty-eight and never a
 * dead thirty-first. The three absence columns are totals for the pupil's row;
 * the class totals sit in the summary block underneath.
 */
export async function buildAttendanceMonthlyV1(): Promise<void> {
  await buildSchoolFormTemplate({
    file: 'attendance/attendance_monthly_v1.xlsx',
    sheetName: 'វត្តមាន',
    title: 'របាយការណ៍វត្តមានសិស្សប្រចាំខែ {{period.label}}',
    lead: FORM_LEAD,
    // Narrow: thirty-one of these have to fit across one landscape page.
    subjectWidth: 4.33,
    subHeader: {
      caption: 'កាលបរិច្ឆេទ',
      tailCaptions: [{ label: 'អវត្តមាន', span: 3 }, { label: '', span: 1 }],
    },
    tail: [
      { label: 'ច្បាប់', token: '{{row.excused}}', width: 6 },
      { label: 'អត់ច្បាប់', token: '{{row.unexcused}}', width: 7, color: FORM_RED },
      { label: 'សរុប', token: '{{row.absent_total}}', width: 6, fill: FORM_BAND, bold: true },
      // A remarks box on the paper form, with nothing behind it in the data.
      { label: 'ផ្សេងៗ', token: '', width: 10 },
    ],
    summary: [
      { label: 'បញ្ចូលបញ្ជីត្រឹមចំនួន ៖', token: '{{class.roll_tally}}' },
      { label: 'អវត្តមានមានច្បាប់សរុប ៖', token: '{{class.excused}} ដង' },
      { label: 'អវត្តមានអត់ច្បាប់សរុប ៖', token: '{{class.unexcused}} ដង' },
      { label: 'អវត្តមានសរុប ៖', token: '{{class.absent_total}} ដង' },
    ],
    bands: NO_BANDS,
    note: '✓ = មានវត្តមាន · ច = អវត្តមានមានច្បាប់ · អ = អវត្តមានអត់ច្បាប់ · ប្រអប់ទទេ = មិនទាន់បានចុះ។ ខែនេះមាន {{class.days}} ថ្ងៃ។',
  })
}

/**
 * `attendance_yearly` — ចំនួនសរុបអវត្តមានសិស្សប្រចាំឆ្នាំ.
 *
 * Twenty-four month columns — `ច្ប` and `អច្ប` under each month — then the two
 * semesters and the year. The month order and the semester split are the app's
 * own (វិច្ឆិកា → តុលា, first six months against the last six), not the
 * ministry file's តុលា → កញ្ញា: `/attendance/yearly` records why, and one sheet
 * a month out of step with every other view is worse than one that differs
 * from a legacy file.
 */
export async function buildAttendanceYearlyV1(): Promise<void> {
  const semesterTail = (prefix: string): FormColumnSpec[] => [
    { label: 'ច្ប', token: `{{row.${prefix}_excused}}`, width: 5 },
    { label: 'អច្ប', token: `{{row.${prefix}_unexcused}}`, width: 5, color: FORM_RED },
    { label: 'សរុប', token: `{{row.${prefix}_total}}`, width: 5.5, fill: FORM_BAND, bold: true },
  ]

  await buildSchoolFormTemplate({
    file: 'attendance/attendance_yearly_v1.xlsx',
    sheetName: 'អវត្តមានប្រចាំឆ្នាំ',
    title: 'ចំនួនសរុបអវត្តមានសិស្សប្រចាំឆ្នាំ',
    lead: [
      { label: 'ល.រ', token: '{{row.no}}', width: 5, align: 'center' },
      { label: 'អត្តលេខ', token: '{{row.student_id}}', width: 10 },
      { label: 'គោត្តនាម និងនាម', token: '{{row.name}}', width: 22, align: 'left', bold: true },
      { label: 'ភេទ', token: '{{row.gender}}', width: 5, align: 'center' },
    ],
    subjectWidth: 4.83,
    subHeader: {
      caption: 'អវត្តមានប្រចាំខែ',
      tailCaptions: [
        { label: 'ឆមាសទី១', span: 3 },
        { label: 'ឆមាសទី២', span: 3 },
        { label: 'សរុបប្រចាំឆ្នាំ', span: 3 },
        { label: '', span: 1 },
      ],
    },
    tail: [
      ...semesterTail('sem1'),
      ...semesterTail('sem2'),
      ...semesterTail('year'),
      // Never exactly 9: exceljs calls that its default and writes no <col>.
      { label: 'ផ្សេងៗ', token: '', width: 9.5 },
    ],
    summary: [
      { label: 'បញ្ចូលបញ្ជីត្រឹមចំនួន ៖', token: '{{class.roll_tally}}' },
      { label: 'អវត្តមានមានច្បាប់សរុប ៖', token: '{{class.excused}} ដង' },
      { label: 'អវត្តមានអត់ច្បាប់សរុប ៖', token: '{{class.unexcused}} ដង' },
      { label: 'អវត្តមានសរុប ៖', token: '{{class.absent_total}} ដង' },
    ],
    bands: NO_BANDS,
    note: 'ច្ប = អវត្តមានមានច្បាប់ · អច្ប = អវត្តមានអត់ច្បាប់។ ប្រអប់ទទេមានន័យថាគ្មានអវត្តមាន — មិនមែនមិនទាន់ចុះទេ។',
  })
}
