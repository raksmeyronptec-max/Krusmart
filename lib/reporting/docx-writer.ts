import { TemplateHandler, type TemplateData } from 'easy-template-x'

import type { ReportPayload } from './report-mapper.ts'

/**
 * Filling a DOCX template without rebuilding it.
 *
 * The Word half of §5, and the reason it exists separately from the XLSX writer
 * is that the two formats want opposite things. A spreadsheet is a grid, so the
 * XLSX writer addresses cells and expands regions. A Word document is a flow,
 * so `easy-template-x` walks the document's own XML and substitutes in place —
 * which is what keeps a certificate's fonts, page size, margins, logo and
 * signature blocks intact.
 *
 * `easy-template-x` is MIT with no paid modules, which is why it is here rather
 * than docxtemplater — a certificate generator that stops working behind a
 * licence gate would be a poor thing to put in a school's hands.
 *
 * TOKEN SHAPE
 * The library reads `{tag}` where this project's XLSX templates read
 * `{{token}}`, so the payload is flattened into the shape it expects and the
 * document uses the same names. A repeating block is `{#rows}…{/rows}`, which
 * is the library's own loop syntax.
 *
 * Not marked `server-only`, for the same reason as the XLSX writer: it is a
 * pure Buffer-to-Buffer transform. The guard lives on the modules that read
 * files and the database. Still server code in practice — do not import it
 * from a client component.
 */

/**
 * The payload as `easy-template-x` data.
 *
 * Scalars become top-level tags; each pupil becomes an entry in `rows` with its
 * own tags plus `subjects`, so a certificate can loop pupils and a results
 * sheet can loop pupils and their marks. Nulls become empty strings — a
 * certificate printing the word "null" where a name belongs is worse than a
 * gap someone notices.
 */
function toTemplateData(payload: ReportPayload): TemplateData {
  const clean = (v: string | number | null) => (v === null ? '' : v)

  return {
    ...Object.fromEntries(
      Object.entries(payload.scalars).map(([k, v]) => [k, clean(v)]),
    ),
    subjects: payload.subjects.map((s) => ({
      label: s.label,
      key: s.key,
      maxScore: s.maxScore,
    })),
    rows: payload.rows.map((row) => ({
      ...Object.fromEntries(Object.entries(row.values).map(([k, v]) => [k, clean(v)])),
      // `subjectDetail` is merged into each subject's scope so a per-pupil form
      // can print several figures under one subject — the record book's
      // semester/semester/annual table. Absent for every other report, which
      // sees exactly the shape it always did.
      subjects: payload.subjects.map((s, i) => ({
        label: s.label,
        key: s.key,
        maxScore: s.maxScore,
        score: clean(row.subjectValues[i] ?? null),
        ...Object.fromEntries(
          Object.entries(row.subjectDetail?.[i] ?? {}).map(([k, v]) => [k, clean(v)]),
        ),
      })),
    })),
    // Asserted rather than structurally typed: the library's `TemplateData` is
    // a recursive union that a mapped object literal cannot satisfy without
    // widening every leaf to `unknown`, which would lose the shape this
    // function exists to guarantee.
  } as TemplateData
}

/** Fill a DOCX template and return the finished document. */
export async function fillDocxTemplate(
  templateBuffer: ArrayBuffer | Buffer,
  payload: ReportPayload,
): Promise<Buffer> {
  const handler = new TemplateHandler()
  const out = await handler.process(
    Buffer.from(templateBuffer as ArrayBuffer),
    toTemplateData(payload),
  )
  return Buffer.from(out)
}
