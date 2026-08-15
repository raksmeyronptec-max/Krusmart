/**
 * Tiling maths for the poster splitter (`បំបែកសន្លឹក Poster`).
 *
 * A teacher wants a 120 × 80 cm classroom poster but owns an A4 printer. The
 * tool slices one image across as many sheets as it takes, leaving an overlap
 * strip on each so the pieces can be glued without a visible seam.
 *
 * The arithmetic lives here, apart from the canvas and PDF work, because it is
 * the part that is easy to get subtly wrong — an off-by-one in the row count
 * silently drops the bottom strip of the poster.
 */

/** Paper sizes offered, in millimetres, portrait. */
export const PAPER_SIZES = {
  A4: { w: 210, h: 297, label: 'A4 (២១ × ២៩.៧ សម)' },
  A3: { w: 297, h: 420, label: 'A3 (២៩.៧ × ៤២ សម)' },
  Letter: { w: 216, h: 279, label: 'Letter (២១.៦ × ២៧.៩ សម)' },
} as const

export type PaperSizeKey = keyof typeof PAPER_SIZES
export type Orientation = 'p' | 'l'

export interface TileInput {
  /** Finished poster size in millimetres. */
  totalW: number
  totalH: number
  paper: PaperSizeKey
  orientation: Orientation
  /** Unprintable border each sheet keeps, in mm. */
  margin: number
  /** Glue strip shared between neighbouring sheets, in mm. */
  overlap: number
}

export interface TilePlan {
  /** Sheet dimensions after orientation is applied, in mm. */
  sheetW: number
  sheetH: number
  /** Printable area of one sheet, in mm. */
  usableW: number
  usableH: number
  /** How far the next sheet starts along each axis — usable minus the overlap. */
  advanceX: number
  advanceY: number
  rows: number
  cols: number
  sheets: number
  /** Populated when the settings cannot produce a poster; `sheets` is 0. */
  error?: string
}

/**
 * Work out the sheet grid.
 *
 * Returns an `error` rather than throwing: the settings are live-edited, and a
 * half-typed value should grey the button out, not break the page.
 */
export function planTiles(input: TileInput): TilePlan {
  const paper = PAPER_SIZES[input.paper] ?? PAPER_SIZES.A4
  const sheetW = input.orientation === 'l' ? paper.h : paper.w
  const sheetH = input.orientation === 'l' ? paper.w : paper.h

  const usableW = sheetW - 2 * input.margin
  const usableH = sheetH - 2 * input.margin

  const empty: TilePlan = {
    sheetW, sheetH, usableW, usableH,
    advanceX: 0, advanceY: 0, rows: 0, cols: 0, sheets: 0,
  }

  if (usableW <= 0 || usableH <= 0) {
    return { ...empty, error: 'រឹមក្រដាសធំពេក' }
  }

  // Each sheet after the first contributes only `usable - overlap` of new
  // poster, so the overlap must be strictly smaller than the printable area or
  // the grid never advances and the loop below would not terminate.
  const advanceX = usableW - input.overlap
  const advanceY = usableH - input.overlap

  if (advanceX <= 0 || advanceY <= 0) {
    return { ...empty, error: 'ចន្លោះត្រួតលើគ្នាធំពេក' }
  }

  if (input.totalW <= 0 || input.totalH <= 0) {
    return { ...empty, advanceX, advanceY, error: 'ទំហំ Poster មិនត្រឹមត្រូវ' }
  }

  // The first sheet covers a full `usable`; every sheet after adds `advance`.
  const cols = Math.max(1, Math.ceil((input.totalW - usableW) / advanceX) + 1)
  const rows = Math.max(1, Math.ceil((input.totalH - usableH) / advanceY) + 1)

  return {
    sheetW, sheetH, usableW, usableH,
    advanceX, advanceY, rows, cols,
    sheets: rows * cols,
  }
}

/** Where one tile starts on the poster, in millimetres from the top-left. */
export function tileOrigin(plan: TilePlan, row: number, col: number): { x: number; y: number } {
  return { x: col * plan.advanceX, y: row * plan.advanceY }
}

/** Millimetres → source pixels, for cropping the uploaded image. */
export function mmToPx(
  imageW: number,
  imageH: number,
  totalW: number,
  totalH: number,
): { scaleX: number; scaleY: number } {
  return { scaleX: imageW / totalW, scaleY: imageH / totalH }
}
