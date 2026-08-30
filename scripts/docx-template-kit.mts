/**
 * Building a .docx from readable source.
 *
 *     imported by scripts/build-report-templates.mts
 *
 * WHY THIS EXISTS AT ALL
 * The same argument the XLSX builder makes: a .docx is a zip, so a template
 * committed as a blob is a file nobody can review and nobody can explain. The
 * spreadsheet templates get to be readable because exceljs constructs a
 * workbook from code. There is no equivalent constructor in this project's
 * dependencies for Word — `easy-template-x` only *fills* documents — so the
 * choice was a checked-in binary, a new library, or writing the OOXML.
 *
 * Writing the OOXML wins on all three counts §45 cares about: the layout stays
 * a reviewable diff, nothing new is downloaded, and the zip is produced by
 * `jszip` — which is not a new dependency but the very library
 * `easy-template-x` already uses to READ a .docx. Writing with the same
 * library that will read it is what makes "the template we ship is a template
 * the filler can open" true by construction rather than by hope.
 *
 * WHAT THIS IS NOT. It is a small OOXML emitter for the one shape this product
 * needs — centred, flowed, paginated Khmer text — not a Word library. It has no
 * tables, no images, no numbering. A real ministry .docx supersedes anything it
 * produces as a v2 with `provenance: 'official'`, and nothing in the engine
 * changes when that happens.
 *
 * TOKEN SHAPE. `easy-template-x` reads `{tag}`, not the `{{token}}` the XLSX
 * templates carry — `lib/reporting/docx-writer.ts` flattens the payload into
 * the shape it expects. Each token here is emitted as its own `<w:t>` run so it
 * can never arrive split across runs, which is the classic way a Word token
 * silently stops matching.
 */

import JSZip from 'jszip'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** XML-escape text. Khmer needs no escaping; the five predefined entities do. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface DocxRun {
  text: string
  bold?: boolean
  italic?: boolean
  /** Half-points are the OOXML unit; this takes points and doubles them. */
  size?: number
  font?: string
  /** `RRGGBB`, no hash. */
  color?: string
}

export interface DocxParagraph {
  runs: DocxRun[]
  align?: 'left' | 'center' | 'right'
  /** Space after, in points. */
  spaceAfter?: number
  /**
   * Start this paragraph on a new page.
   *
   * `pageBreakBefore` rather than an explicit `<w:br w:type="page"/>`: on the
   * FIRST paragraph of a repeated block it starts page 1 without emitting a
   * blank page, and on every later repetition it starts a fresh page. A trailing
   * break would leave an empty final page on every certificate stack printed.
   */
  pageBreakBefore?: boolean
}

function runXml(run: DocxRun): string {
  const props = [
    run.font ? `<w:rFonts w:ascii="${esc(run.font)}" w:hAnsi="${esc(run.font)}" w:cs="${esc(run.font)}"/>` : '',
    run.bold ? '<w:b/><w:bCs/>' : '',
    run.italic ? '<w:i/><w:iCs/>' : '',
    run.size ? `<w:sz w:val="${run.size * 2}"/><w:szCs w:val="${run.size * 2}"/>` : '',
    run.color ? `<w:color w:val="${run.color}"/>` : '',
  ].join('')

  // `xml:space="preserve"` so a token surrounded by spaces keeps them — without
  // it Word collapses the padding and tokens run into their labels.
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(run.text)}</w:t></w:r>`
}

function paragraphXml(p: DocxParagraph): string {
  const props = [
    p.pageBreakBefore ? '<w:pageBreakBefore/>' : '',
    p.align ? `<w:jc w:val="${p.align}"/>` : '',
    p.spaceAfter !== undefined ? `<w:spacing w:after="${Math.round(p.spaceAfter * 20)}"/>` : '',
  ].join('')

  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${p.runs.map(runXml).join('')}</w:p>`
}

// ---------------------------------------------------------------- tables

/**
 * A table cell. Holds paragraphs, because a cell in Word is a little document.
 */
export interface DocxTableCell {
  paragraphs: DocxParagraph[]
  /** Background shade, `RRGGBB`. */
  shade?: string
  /** Merge this cell across N columns. */
  span?: number
}

export interface DocxTableRow {
  cells: DocxTableCell[]
  /**
   * Repeat this row as a header on every page the table spills onto — the Word
   * equivalent of the spreadsheets' `printTitlesRow`.
   */
  header?: boolean
}

export interface DocxTable {
  kind: 'table'
  /** Column widths in millimetres. Their sum is the table width. */
  widths: number[]
  rows: DocxTableRow[]
}

/** A block in the document body: a paragraph or a table. */
export type DocxBlock = DocxParagraph | DocxTable

function isTable(block: DocxBlock): block is DocxTable {
  return (block as DocxTable).kind === 'table'
}

const THIN_BORDER = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
  .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`)
  .join('')

function cellXml(cell: DocxTableCell, widthTwips: number): string {
  const props = [
    `<w:tcW w:w="${widthTwips}" w:type="dxa"/>`,
    cell.span && cell.span > 1 ? `<w:gridSpan w:val="${cell.span}"/>` : '',
    cell.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${cell.shade}"/>` : '',
    '<w:vAlign w:val="center"/>',
  ].join('')

  // A Word cell must contain at least one paragraph or the document is invalid.
  const body = cell.paragraphs.length
    ? cell.paragraphs.map(paragraphXml).join('')
    : '<w:p/>'

  return `<w:tc><w:tcPr>${props}</w:tcPr>${body}</w:tc>`
}

function tableXml(table: DocxTable): string {
  const twips = table.widths.map((mm) => Math.round(mm * 56.7))
  const total = twips.reduce((a, b) => a + b, 0)

  const grid = `<w:tblGrid>${twips.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
  const props =
    `<w:tblPr>` +
    `<w:tblW w:w="${total}" w:type="dxa"/>` +
    `<w:jc w:val="center"/>` +
    `<w:tblBorders>${THIN_BORDER}</w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/>` +
    `</w:tblPr>`

  const rows = table.rows.map((row) => {
    // Cells consume grid columns in order, so a spanned cell advances the
    // cursor by its span — otherwise a merged header would misalign the row.
    let col = 0
    const cells = row.cells.map((cell) => {
      const span = cell.span ?? 1
      const width = twips.slice(col, col + span).reduce((a, b) => a + b, 0)
      col += span
      return cellXml(cell, width)
    }).join('')

    const rowProps = row.header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''
    return `<w:tr>${rowProps}${cells}</w:tr>`
  }).join('')

  return `<w:tbl>${props}${grid}${rows}</w:tbl>`
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

/** Document defaults, so Khmer renders even where no run names a font. */
function stylesXml(font: string, size: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="${esc(font)}" w:hAnsi="${esc(font)}" w:cs="${esc(font)}"/>
<w:sz w:val="${size * 2}"/><w:szCs w:val="${size * 2}"/>
</w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`
}

export interface DocxSpec {
  /** The document body, top to bottom: paragraphs and tables interleaved. */
  paragraphs: DocxBlock[]
  orientation: 'portrait' | 'landscape'
  /** Page margins in millimetres. */
  margin: number
  defaultFont: string
  defaultSize: number
}

/** A4 in twips (1 mm = 56.7 twips). */
const A4_W = 11906
const A4_H = 16838

function documentXml(spec: DocxSpec): string {
  const landscape = spec.orientation === 'landscape'
  const w = landscape ? A4_H : A4_W
  const h = landscape ? A4_W : A4_H
  const m = Math.round(spec.margin * 56.7)

  const sectPr =
    `<w:sectPr>` +
    `<w:pgSz w:w="${w}" w:h="${h}"${landscape ? ' w:orient="landscape"' : ''}/>` +
    `<w:pgMar w:top="${m}" w:right="${m}" w:bottom="${m}" w:left="${m}" w:header="708" w:footer="708" w:gutter="0"/>` +
    `</w:sectPr>`

  // A table may not be the last block in a body — Word requires a paragraph
  // after it — so one is appended when the document ends on a table.
  const blocks = [...spec.paragraphs]
  if (blocks.length > 0 && isTable(blocks[blocks.length - 1])) {
    blocks.push({ runs: [], spaceAfter: 0 })
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${
    blocks.map((b) => (isTable(b) ? tableXml(b) : paragraphXml(b))).join('')
  }${sectPr}</w:body></w:document>`
}

/**
 * Write a .docx.
 *
 * Deterministic on purpose: a fixed timestamp on every entry and no compression
 * variance, so rebuilding an unchanged template produces an unchanged file and
 * `npm run build:templates` does not show up as a spurious diff.
 */
export async function writeDocx(path: string, spec: DocxSpec): Promise<void> {
  const zip = new JSZip()
  const date = new Date(Date.UTC(2020, 0, 1))

  const add = (name: string, content: string) => zip.file(name, content, { date })

  add('[Content_Types].xml', CONTENT_TYPES)
  add('_rels/.rels', ROOT_RELS)
  add('word/_rels/document.xml.rels', DOC_RELS)
  add('word/styles.xml', stylesXml(spec.defaultFont, spec.defaultSize))
  add('word/document.xml', documentXml(spec))

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, buffer)
}
