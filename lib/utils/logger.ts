/**
 * Dev-only console wrapper.
 *
 * Diagnostics are useful while developing but shouldn't ship to teachers'
 * browsers or the server log in production, so every call here is a no-op once
 * `NODE_ENV` is `production`. User-facing failures go through `react-hot-toast`
 * (or the page's own error state) instead — never through these.
 */

const isDev = process.env.NODE_ENV !== 'production'

export const logger = {
  log: (...args: unknown[]) => {
    if (isDev) console.log(...args)
  },
  warn: (...args: unknown[]) => {
    if (isDev) console.warn(...args)
  },
  error: (...args: unknown[]) => {
    if (isDev) console.error(...args)
  },
}
