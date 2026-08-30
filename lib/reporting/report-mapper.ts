/**
 * How report data reaches cells in a document template.
 *
 * §10 forbids the thing this replaces:
 *
 *     worksheet.getCell('B12').value = student.name    // ← never again
 *
 * Cell addresses are not written in code at all. The template file carries
 * `{{tokens}}` in the cells that should be filled, and this module says what
 * each token resolves to. Moving a column in the spreadsheet is then an edit to
 * the spreadsheet — no TypeScript changes, nothing to keep in step.
 *
 * THREE KINDS OF TOKEN, because a report has three shapes of content:
 *
 *   scalar   `{{class.name}}`      one value, anywhere in the sheet
 *   row      `{{row.name}}`        one value per pupil, in the marked row
 *   subject  `{{subject.score}}`   one value per pupil per SUBJECT — a region
 *                                  whose width the class's score template
 *                                  decides, not the layout (§11)
 *
 * The subject region is the reason this is a mapper and not a find-and-replace.
 * A primary class teaching three subjects and one teaching eight print the same
 * template; the generator widens the region to fit and the layout never has to
 * know how many subjects exist.
 *
 * Pure — no exceljs, no filesystem. The writers consume this; tests can too.
 */

/** A value a cell can hold. `null` leaves the cell empty rather than writing "null". */
export type CellValue = string | number | null

/** The marker a template puts in the first data row of the repeating block. */
export const ROW_MARKER = '{{#rows}}'

/** The marker a template puts where the subject columns begin. */
export const SUBJECT_MARKER = '{{#subjects}}'

/** Matches any `{{token}}`, capturing the token name. */
export const TOKEN_RE = /\{\{\s*([#\w.]+)\s*\}\}/g

/**
 * One subject column of a report, as the document will print it.
 *
 * Derived from the class's active score template by the resolver — never from
 * a constant (§12). `key` exists so a resolver can look a mark up per pupil.
 */
export interface ReportSubjectColumn {
  key: string
  label: string
  maxScore: number
}

/** One pupil's row. */
export interface ReportRow {
  /** Values for the row's fixed tokens, e.g. `{ 'row.name': 'សុខា' }`. */
  values: Record<string, CellValue>
  /** One value per subject column, in the same order as `subjects`. */
  subjectValues: CellValue[]
  /**
   * Extra named values per subject, for page-oriented documents (§24).
   *
   * A spreadsheet row has ONE cell per subject, which is why `subjectValues` is
   * a flat array and every XLSX report is served by it. A per-pupil Word form
   * is not a row: the record book prints a subject TABLE inside each pupil's
   * page, with a semester column, a second semester column and an annual
   * column — three figures under one subject.
   *
   * Additive on purpose. Nothing sets this except the reports that need it, the
   * XLSX writer never reads it (a spreadsheet has nowhere to put it), and the
   * DOCX writer merges each entry into that subject's loop scope. Extending the
   * contract this way was the alternative to giving one report its own payload
   * shape, which is the second source of truth §4 forbids.
   *
   * One entry per subject column, in the same order as `subjects`.
   */
  subjectDetail?: Record<string, CellValue>[]
}

/**
 * Everything a template needs, resolved and ready to write.
 *
 * The contract between a report's data resolver and the generator: a resolver
 * produces this and knows nothing about spreadsheets; a writer consumes it and
 * knows nothing about scores. Adding a report is writing one of these (§29).
 */
export interface ReportPayload {
  /** Scalar tokens: `{ 'class.name': '៤ក', 'period.label': 'ខែវិច្ឆិកា' }`. */
  scalars: Record<string, CellValue>
  /** The dynamic subject columns, left to right. */
  subjects: ReportSubjectColumn[]
  rows: ReportRow[]
}

/**
 * Resolve one token against a payload and an optional row.
 *
 * Unknown tokens resolve to `null` — a blank cell — rather than throwing or
 * leaving `{{typo}}` visible. A template is data: a stale token in a layout
 * someone edited must not break generation for a whole school, and a blank cell
 * is the failure a teacher can see and report.
 */
export function resolveToken(
  token: string,
  payload: ReportPayload,
  row?: ReportRow,
): CellValue {
  if (row && token in row.values) return row.values[token]
  if (token in payload.scalars) return payload.scalars[token]
  return null
}

/**
 * Replace every `{{token}}` inside a cell's text.
 *
 * A cell holding exactly one token yields that token's *typed* value, so a mark
 * lands in the sheet as a number and stays summable — the thing §10's
 * hand-written cells got right and a naive string replace would lose. A cell
 * mixing text and tokens (`ថ្នាក់ {{class.name}}`) yields a string, which is
 * what it should be.
 */
export function fillText(
  text: string,
  payload: ReportPayload,
  row?: ReportRow,
): CellValue {
  const whole = text.trim().match(/^\{\{\s*([#\w.]+)\s*\}\}$/)
  if (whole) return resolveToken(whole[1], payload, row)

  return text.replace(TOKEN_RE, (_, token: string) => {
    const value = resolveToken(token, payload, row)
    return value === null ? '' : String(value)
  })
}

/** Does this cell text carry any token at all? */
export function hasToken(text: string): boolean {
  TOKEN_RE.lastIndex = 0
  return TOKEN_RE.test(text)
}

/**
 * A blank payload, for a report with no data yet.
 *
 * Generating an empty class still produces a valid document — the header, the
 * school name and the column titles — because a teacher printing a blank sheet
 * to fill in by hand is a real use, and failing with "no data" would deny it.
 */
export function emptyPayload(scalars: Record<string, CellValue> = {}): ReportPayload {
  return { scalars, subjects: [], rows: [] }
}
