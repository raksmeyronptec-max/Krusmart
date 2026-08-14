/**
 * Narrowing helpers for `catch` blocks, so handlers can take `unknown` instead
 * of `any` and still reach the message.
 */

/** Pull a human-readable message off an unknown thrown value. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message
    if (typeof message === 'string') return message
  }
  return ''
}

/** `getErrorMessage`, falling back to a Khmer message when nothing is readable. */
export function getErrorMessageOr(error: unknown, fallback: string): string {
  return getErrorMessage(error) || fallback
}
