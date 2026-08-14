/**
 * Types and shared styling for the `xlsx-js-style` exports.
 *
 * `xlsx-js-style` ships no useful types for styled cells, so every exporting
 * client used to declare its own `any[]` sheet arrays and re-inline the same
 * border/font/alignment objects. The shapes below cover what this app actually
 * writes; they are deliberately permissive (plain `string` rather than unions)
 * so the existing literals type-check without churn.
 */

export interface SheetBorderSide {
  style: string
  color?: { rgb: string }
}

export interface SheetBorder {
  top?: SheetBorderSide
  bottom?: SheetBorderSide
  left?: SheetBorderSide
  right?: SheetBorderSide
}

export interface SheetFont {
  name?: string
  sz?: number
  bold?: boolean
  italic?: boolean
  color?: { rgb: string }
}

export interface SheetAlignment {
  vertical?: string
  horizontal?: string
  textRotation?: number
  wrapText?: boolean
}

export interface SheetCellStyle {
  font?: SheetFont
  alignment?: SheetAlignment
  border?: SheetBorder
  fill?: { fgColor: { rgb: string } }
  numFmt?: string
}

/** One styled cell. `t` is the xlsx cell type: string / number / boolean / date. */
export interface SheetCell {
  v: string | number | boolean | null | undefined
  t: 's' | 'n' | 'b' | 'd'
  s?: SheetCellStyle
}

/** A worksheet row. Bare primitives are allowed — xlsx coerces them. */
export type SheetRow = (SheetCell | string | number | null | undefined)[]

/**
 * One row as parsed back *out* of a sheet by `sheet_to_json(ws, { header: 1 })`
 * — raw cell values, no styling.
 */
export type SheetImportRow = (string | number | boolean | null)[]

/** A merged range, `s`tart → `e`nd, in zero-based row/column coordinates. */
export interface SheetMerge {
  s: { r: number; c: number }
  e: { r: number; c: number }
}

/** `!rows` entry — `hpt` is row height in points. */
export interface SheetRowMeta {
  hpt?: number
  hpx?: number
}

/** `!cols` entry — `wch` is column width in characters. */
export interface SheetColMeta {
  wch?: number
  wpx?: number
  hidden?: boolean
}

const KHMER_BODY_FONT = 'Khmer OS Battambang'
const KHMER_DISPLAY_FONT = 'Khmer OS Moul Light'

/** Body text in the Khmer body face. */
export function khmerFont(sz: number, bold = false): SheetFont {
  return { name: KHMER_BODY_FONT, sz, bold }
}

/** Display headings in the Khmer Moul face. */
export function moulFont(sz: number): SheetFont {
  return { name: KHMER_DISPLAY_FONT, sz }
}

export const THIN_BORDER: SheetBorder = {
  top: { style: 'thin', color: { rgb: 'FF000000' } },
  bottom: { style: 'thin', color: { rgb: 'FF000000' } },
  left: { style: 'thin', color: { rgb: 'FF000000' } },
  right: { style: 'thin', color: { rgb: 'FF000000' } },
}

export const ALIGN_CENTER: SheetAlignment = { vertical: 'center', horizontal: 'center' }
export const ALIGN_LEFT: SheetAlignment = { vertical: 'center', horizontal: 'left' }
export const ALIGN_RIGHT: SheetAlignment = { vertical: 'center', horizontal: 'right' }

/** A blank string cell, optionally styled — used to pad header rows before merging. */
export function emptyCell(style: SheetCellStyle = {}): SheetCell {
  return { v: '', t: 's', s: style }
}

/** Build a row of `count` blank cells. */
export function emptyRow(count: number, style: SheetCellStyle = {}): SheetCell[] {
  return Array.from({ length: count }, () => emptyCell(style))
}

