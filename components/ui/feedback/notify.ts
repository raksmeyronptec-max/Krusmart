"use client"

import toast from "react-hot-toast"

/**
 * The app's one way to tell the user something happened.
 *
 * There are two habits in the codebase today: newer code calls
 * `react-hot-toast` directly, older code calls `window.alert()` — 34 times.
 * `alert` is the wrong tool here for reasons that matter to a teacher standing
 * in a classroom: it blocks the main thread, it cannot be styled or translated
 * (the OK button is in the browser's language, not Khmer), it is dismissed by
 * an extra tap, and mobile Safari suppresses it outright after a few in a row —
 * so a failure can end up reported to nobody.
 *
 * This wraps `react-hot-toast` rather than replacing it: the `<Toaster />` is
 * already mounted in the root layout, and the five files using it directly keep
 * working unchanged.
 *
 * Choosing between the layers:
 *   notify.*        — it happened, carry on (saved, exported, copied)
 *   ConfirmDialog   — decide before it happens (delete, promote, overwrite)
 *   inline field error — this specific input is wrong
 */

/** Default Khmer copy, so a call site can omit the obvious message. */
const DEFAULTS = {
  saved: "រក្សាទុករួចរាល់",
  failed: "មានបញ្ហា​ក្នុងការដំណើរការ",
} as const

export const notify = {
  /** Confirms something the user did. */
  success(message: string = DEFAULTS.saved) {
    return toast.success(message)
  },

  /**
   * Reports a failure. Give the teacher something actionable — say which record
   * failed, not just that "an error occurred".
   */
  error(message: string = DEFAULTS.failed) {
    return toast.error(message)
  },

  /** Neutral information: no valence, no icon. */
  info(message: string) {
    return toast(message)
  },

  /**
   * Progress for an operation with a definite end. Returns the toast id so the
   * caller can resolve it:
   *
   * ```ts
   * const id = notify.loading('កំពុងរក្សាទុក...')
   * notify.success('រក្សាទុករួចរាល់', id)
   * ```
   */
  loading(message: string) {
    return toast.loading(message)
  },

  /** Replace a pending toast with its outcome, so it does not linger. */
  settle(id: string, ok: boolean, message: string) {
    return ok ? toast.success(message, { id }) : toast.error(message, { id })
  },

  dismiss(id?: string) {
    toast.dismiss(id)
  },
}

export default notify
