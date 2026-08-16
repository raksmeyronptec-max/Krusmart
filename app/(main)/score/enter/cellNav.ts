'use client'

/**
 * Moving between cells with the keyboard.
 *
 * A teacher copying marks off a paper register types down a column, not across
 * a row: `Tab` alone forces them across every subject of one pupil before
 * reaching the next. Arrow Up/Down and Enter therefore move *vertically*
 * through the same column, which is the motion the paper form has.
 *
 * Both the grid and the card list use it, so the two views behave identically —
 * they only differ in how the fields are drawn.
 *
 * Left/Right are deliberately not bound: inside a `<input type="number">` they
 * move the caret, and stealing them would make a typo impossible to fix.
 */

/** Marks a focusable cell. Read back by `handleCellKeyDown`. */
export function cellAttrs(row: number, col: number) {
  return { 'data-cell-row': row, 'data-cell-col': col }
}

function focusCell(container: HTMLElement, row: number, col: number) {
  const next = container.querySelector<HTMLElement>(
    `[data-cell-row="${row}"][data-cell-col="${col}"]`,
  )
  if (!next) return false
  next.focus()
  if (next instanceof HTMLInputElement) next.select()
  return true
}

/**
 * `onKeyDown` for a cell. Returns nothing; call it from the field itself.
 *
 * `rowCount` bounds the movement so Enter on the last pupil does not silently
 * do nothing *and* swallow the key — it simply stays put, which is the same
 * behaviour a spreadsheet has at the bottom of a column.
 */
export function handleCellKeyDown(
  e: React.KeyboardEvent<HTMLElement>,
  container: HTMLElement | null,
  rowCount: number,
) {
  if (!container) return
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Enter') return
  // A native <select> owns Up/Down to change its value; only Enter moves on.
  if (e.currentTarget.tagName === 'SELECT' && e.key !== 'Enter') return

  const row = Number(e.currentTarget.getAttribute('data-cell-row'))
  const col = Number(e.currentTarget.getAttribute('data-cell-col'))
  if (!Number.isFinite(row) || !Number.isFinite(col)) return

  const target = e.key === 'ArrowUp' ? row - 1 : row + 1
  if (target < 0 || target >= rowCount) {
    e.preventDefault()
    return
  }

  if (focusCell(container, target, col)) e.preventDefault()
}
