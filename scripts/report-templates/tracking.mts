/**
 * Builders for Tracking family:
 * - student_tracking_record_book_v1.docx
 */

import { join } from 'node:path'

import { writeDocx, type DocxParagraph } from '../docx-template-kit.mts'
import { KH, KH_MOUL, OUT_DIR } from './common.mts'

export async function buildRecordBookV1(): Promise<void> {
  const NAVY = '000080'
  const HEAD_SHADE = 'EFF6EE'
  const GREY = '6B7280'
  const AMBER = '9A6700'

  const p = (
    text: string,
    opts: {
      size?: number; font?: string; color?: string; italic?: boolean
      align?: 'left' | 'center' | 'right'; spaceAfter?: number; pageBreakBefore?: boolean
    } = {},
  ): DocxParagraph => ({
    runs: text === '' ? [] : [{
      text, size: opts.size ?? 10, font: opts.font ?? KH,
      color: opts.color, italic: opts.italic,
    }],
    align: opts.align ?? 'center',
    spaceAfter: opts.spaceAfter ?? 4,
    pageBreakBefore: opts.pageBreakBefore,
  })

  const cell = (text: string, opts: Parameters<typeof p>[1] = {}, shade?: string) =>
    ({ paragraphs: [p(text, { size: 9, spaceAfter: 0, ...opts })], shade })

  const section = (text: string) =>
    p(text, { size: 11, font: KH_MOUL, color: NAVY, align: 'left', spaceAfter: 4 })

  const path = join(OUT_DIR, 'tracking', 'student_tracking_record_book_v1.docx')
  await writeDocx(path, {
    orientation: 'landscape',
    margin: 14,
    defaultFont: KH,
    defaultSize: 10,
    paragraphs: [
      p('{#rows}', { size: 1, spaceAfter: 0 }),

      // ------------------------------------------------------- letterhead
      p('ព្រះរាជាណាចក្រកម្ពុជា', { size: 12, font: KH_MOUL, spaceAfter: 1, pageBreakBefore: true }),
      p('ជាតិ សាសនា ព្រះមហាក្សត្រ', { size: 10, font: KH_MOUL, spaceAfter: 6 }),
      p('{school.name}', { size: 11, font: KH_MOUL, color: NAVY, spaceAfter: 2 }),
      p('{book.title}', { size: 16, font: KH_MOUL, color: NAVY, spaceAfter: 2 }),
      p('{period.label}', { size: 10, spaceAfter: 8 }),

      // ---------------------------------------------------- identity block
      {
        kind: 'table',
        widths: [45, 30, 45, 30, 45, 40],
        rows: [{
          cells: [
            cell('គោត្តនាម និងនាម', { font: KH_MOUL }, HEAD_SHADE),
            cell('{row.name}', { color: NAVY }),
            cell('ភេទ / អត្តលេខ', { font: KH_MOUL }, HEAD_SHADE),
            cell('{row.gender} / {row.student_id}'),
            cell('ថ្នាក់ / ថ្នាក់ទី', { font: KH_MOUL }, HEAD_SHADE),
            cell('{class.name} / {class.grade}'),
          ],
        }],
      },
      p('', { spaceAfter: 6 }),

      // --------------------------------------- ក. results per subject
      section('ក. លទ្ធផលតាមមុខវិជ្ជា'),
      {
        kind: 'table',
        widths: [110, 40, 40, 45],
        rows: [
          {
            header: true,
            cells: [
              cell('មុខវិជ្ជា', { font: KH_MOUL, align: 'left' }, HEAD_SHADE),
              cell('ឆមាសទី១', { font: KH_MOUL }, HEAD_SHADE),
              cell('ឆមាសទី២', { font: KH_MOUL }, HEAD_SHADE),
              cell('ប្រចាំឆ្នាំ', { font: KH_MOUL }, HEAD_SHADE),
            ],
          },
          {
            cells: [
              cell('{#subjects}{label}', { align: 'left' }),
              cell('{sem1}'),
              cell('{sem2}'),
              cell('{annual}{/subjects}', { color: NAVY }),
            ],
          },
        ],
      },
      p('', { spaceAfter: 6 }),

      // ------------------------------------------------- ខ. absences
      section('ខ. អវត្តមាន'),
      {
        kind: 'table',
        widths: [60, 55, 55, 65],
        rows: [
          {
            header: true,
            cells: [
              cell('ឆមាស', { font: KH_MOUL }, HEAD_SHADE),
              cell('មានច្បាប់', { font: KH_MOUL }, HEAD_SHADE),
              cell('ឥតច្បាប់', { font: KH_MOUL }, HEAD_SHADE),
              cell('សរុបទាំងឆ្នាំ', { font: KH_MOUL }, HEAD_SHADE),
            ],
          },
          {
            cells: [
              cell('ឆមាសទី១'),
              cell('{row.absent_s1_excused}'),
              cell('{row.absent_s1_unexcused}'),
              cell('{row.absent_total}'),
            ],
          },
          {
            cells: [
              cell('ឆមាសទី២'),
              cell('{row.absent_s2_excused}'),
              cell('{row.absent_s2_unexcused}'),
              cell(''),
            ],
          },
        ],
      },
      p('', { spaceAfter: 6 }),

      // --------------------------------------------- គ. behaviour
      section('គ. ការវាយតម្លៃឥរិយាបថ'),
      {
        kind: 'table',
        widths: [59, 59, 59, 58],
        rows: [
          {
            header: true,
            cells: [
              cell('ចំណេះដឹង', { font: KH_MOUL }, HEAD_SHADE),
              cell('បំណិន-ចំណេះធ្វើ', { font: KH_MOUL }, HEAD_SHADE),
              cell('តម្លៃ-សីលធម៌', { font: KH_MOUL }, HEAD_SHADE),
              cell('សាមគ្គីភាព', { font: KH_MOUL }, HEAD_SHADE),
            ],
          },
          {
            cells: [
              cell('{row.sem_eval_knowledge}'),
              cell('{row.sem_eval_skill}'),
              cell('{row.sem_eval_moral}'),
              cell('{row.sem_eval_participate}'),
            ],
          },
        ],
      },
      p('', { spaceAfter: 6 }),

      // ------------------------------------------------- ឃ. outcome
      section('ឃ. លទ្ធផលប្រចាំឆ្នាំ'),
      {
        kind: 'table',
        widths: [47, 47, 47, 47, 47],
        rows: [
          {
            header: true,
            cells: [
              cell('ម.ភាគ ឆមាសទី១', { font: KH_MOUL }, HEAD_SHADE),
              cell('ម.ភាគ ឆមាសទី២', { font: KH_MOUL }, HEAD_SHADE),
              cell('ម.ភាគប្រចាំឆ្នាំ', { font: KH_MOUL }, HEAD_SHADE),
              cell('និទ្ទេស', { font: KH_MOUL }, HEAD_SHADE),
              cell('ចំណាត់ថ្នាក់ / លទ្ធផល', { font: KH_MOUL }, HEAD_SHADE),
            ],
          },
          {
            cells: [
              cell('{row.sem1}'),
              cell('{row.sem2}'),
              cell('{row.average}', { color: NAVY }),
              cell('{row.grade}'),
              cell('{row.rank} / {row.status}'),
            ],
          },
        ],
      },
      p('', { spaceAfter: 10 }),

      // ---------------------------------------------------- signatures
      {
        kind: 'table',
        widths: [118, 117],
        rows: [{
          cells: [
            { paragraphs: [p('គ្រូបន្ទុកថ្នាក់', { size: 10, spaceAfter: 24 }), p('{teacher.name}', { size: 10, spaceAfter: 0 })] },
            { paragraphs: [p('{province.date}', { size: 9, spaceAfter: 2 }), p('{director.role}', { size: 10, spaceAfter: 24 }), p('{director.name}', { size: 10, spaceAfter: 0 })] },
          ],
        }],
      },

      p('{annual.source}', { size: 8, color: GREY, italic: true, spaceAfter: 1 }),
      p('{book.provenance}', { size: 8, color: AMBER, italic: true, spaceAfter: 0 }),

      p('{/rows}', { size: 1, spaceAfter: 0 }),
    ],
  })
  console.log(`  ✓ ${path}`)
}
