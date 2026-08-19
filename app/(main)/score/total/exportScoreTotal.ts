import type { SheetCell, SheetRow } from '@/lib/utils/xlsx'
import { letterOrDash } from '@/lib/utils/score-band'
import { DEFAULT_SCHEME_CONFIG, type GradingSchemeConfig } from '@/lib/grading/scheme'
import type { ColumnGroup, TotalledStudent } from './scoreTotalConfig'

/**
 * The totals table as a spreadsheet.
 *
 * Same columns in the same order as the screen, so a teacher can check one
 * against the other. Marks are written as numbers rather than strings — a
 * column of text-formatted scores is a column nobody can sum, which is usually
 * the first thing done to this file after downloading it.
 *
 * `xlsx-js-style` is imported dynamically: it is a large dependency and only a
 * fraction of visits export.
 */

const HEADER_FILL = 'FF1D3E73'

function headerCell(v: string): SheetCell {
  return {
    v,
    t: 's',
    s: {
      font: { bold: true, sz: 10, color: { rgb: 'FFFFFFFF' } },
      fill: { fgColor: { rgb: HEADER_FILL } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      },
    },
  }
}

function bodyCell(v: string | number | null, opts: { bold?: boolean; left?: boolean } = {}): SheetCell {
  return {
    v: v ?? '',
    t: typeof v === 'number' ? 'n' : 's',
    s: {
      font: { sz: 10, bold: opts.bold },
      alignment: { horizontal: opts.left ? 'left' : 'center', vertical: 'center' },
      border: {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      },
    },
  }
}

export async function exportScoreTotal(
  rows: TotalledStudent[],
  groups: ColumnGroup[],
  fileLabel: string,
  /** The class's grading scheme — the exported letter must match the screen's. */
  scheme: GradingSchemeConfig = DEFAULT_SCHEME_CONFIG,
) {
  const XLSX = await import('xlsx-js-style')
  const columns = groups.flatMap(g => g.columns)

  const header: SheetRow = [
    headerCell('ល.រ'),
    headerCell('អត្តលេខ'),
    headerCell('ឈ្មោះសិស្ស'),
    headerCell('ភេទ'),
    ...columns.map(c => headerCell(c.label)),
    headerCell('មធ្យមភាគ'),
    headerCell('និទ្ទេស'),
    headerCell('ចំណាត់ថ្នាក់'),
  ]

  const body: SheetRow[] = rows.map((stu, i) => {
    const avg = stu.finalAverageForRank || null
    return [
      bodyCell(i + 1),
      bodyCell(stu.student_id || ''),
      bodyCell(stu.name_kh || stu.name_en || '', { left: true, bold: true }),
      bodyCell(stu.gender || ''),
      ...columns.map(c => {
        const raw = stu.scores[c.key]
        if (raw === null || raw === undefined || raw === '') return bodyCell('')
        const numeric = Number(raw)
        return bodyCell(Number.isFinite(numeric) ? numeric : String(raw))
      }),
      bodyCell(avg === null ? '' : Number(avg.toFixed(2)), { bold: true }),
      bodyCell(letterOrDash(avg, scheme)),
      bodyCell(stu.rank || ''),
    ]
  })

  const sheet = XLSX.utils.aoa_to_sheet([header, ...body] as unknown[][])
  sheet['!cols'] = [
    { wch: 5 }, { wch: 12 }, { wch: 24 }, { wch: 6 },
    ...columns.map(() => ({ wch: 8 })),
    { wch: 10 }, { wch: 8 }, { wch: 10 },
  ]
  // The pupil column has to stay put while the subject columns scroll.
  sheet['!freeze'] = { xSplit: 3, ySplit: 1 }

  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'ពិន្ទុសរុប')
  XLSX.writeFile(book, `score-total-${fileLabel}.xlsx`)
}
