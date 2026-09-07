/**
 * Builders for Certificate family:
 * - certificate_v1.docx
 */

import { join } from 'node:path'

import { writeDocx, type DocxParagraph, type DocxRun } from '../docx-template-kit.mts'
import { KH, KH_MOUL, OUT_DIR } from './common.mts'

export async function buildCertificateV1(): Promise<void> {
  const NAVY = '000080'
  const RED = 'C00000'
  const GREY = '6B7280'
  const AMBER = '9A6700'

  /** One centred line. Every token is its own run, so none can split. */
  const line = (
    runs: DocxRun[],
    opts: { align?: 'left' | 'center' | 'right'; spaceAfter?: number; pageBreakBefore?: boolean } = {},
  ): DocxParagraph => ({
    runs,
    align: opts.align ?? 'center',
    spaceAfter: opts.spaceAfter ?? 6,
    pageBreakBefore: opts.pageBreakBefore,
  })

  const text = (
    value: string,
    size: number,
    opts: { font?: string; color?: string; italic?: boolean } = {},
  ): DocxRun => ({ text: value, size, font: opts.font ?? KH, color: opts.color, italic: opts.italic })

  const spacer = (points: number): DocxParagraph => ({ runs: [], align: 'center', spaceAfter: points })

  const path = join(OUT_DIR, 'certificate', 'certificate_v1.docx')
  await writeDocx(path, {
    orientation: 'portrait',
    margin: 18,
    defaultFont: KH,
    defaultSize: 12,
    paragraphs: [
      line([{ text: '{#rows}', size: 1 }], { spaceAfter: 0 }),

      line([text('ព្រះរាជាណាចក្រកម្ពុជា', 16, { font: KH_MOUL })], { pageBreakBefore: true, spaceAfter: 2 }),
      line([text('ជាតិ សាសនា ព្រះមហាក្សត្រ', 12, { font: KH_MOUL })], { spaceAfter: 10 }),
      line([text('{school.unit1}', 11, { color: NAVY })], { spaceAfter: 2 }),
      line([text('{school.name}', 15, { font: KH_MOUL, color: RED })], { spaceAfter: 24 }),

      line([text('បណ្ណសរសើរ', 34, { font: KH_MOUL, color: NAVY })], { spaceAfter: 24 }),

      line([text('សូមប្រកាសសរសើរជូន', 12)], { spaceAfter: 8 }),
      line([text('{row.name}', 22, { font: KH_MOUL, color: NAVY })], { spaceAfter: 10 }),
      line([
        text('ភេទ ', 12), text('{row.gender}', 12, { color: NAVY }),
        text(' · ថ្នាក់ ', 12), text('{class.name}', 12, { color: NAVY }),
        text(' · ថ្នាក់ទី ', 12), text('{class.grade}', 12, { color: NAVY }),
      ], { spaceAfter: 14 }),

      line([text('{achievement}', 13)], { spaceAfter: 8 }),
      line([text('{period.label}', 12, { color: NAVY })], { spaceAfter: 30 }),

      line([text('{province.date}', 11)], { align: 'right', spaceAfter: 4 }),
      line([text('{director.role}', 11)], { align: 'right', spaceAfter: 30 }),
      line([text('{director.name}', 13, { font: KH_MOUL })], { align: 'right', spaceAfter: 18 }),

      spacer(4),
      line([text('{annual.source}', 8, { color: GREY, italic: true })], { spaceAfter: 2 }),
      line([text('{certificate.provenance}', 8, { color: AMBER, italic: true })], { spaceAfter: 0 }),

      line([{ text: '{/rows}', size: 1 }], { spaceAfter: 0 }),
    ],
  })
  console.log(`  ✓ ${path}`)
}
