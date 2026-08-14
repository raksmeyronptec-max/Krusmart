/**
 * Single source of truth for form-control styling across KruSmart.
 *
 * Both `Select` (native) and `SearchableSelect` (custom listbox) compose these
 * strings so a user cannot tell which page — or which implementation — a
 * dropdown came from. Only design tokens are used; no hard-coded hex values.
 */

/** Height/radius/typography shared by every control trigger. */
export const controlBase =
  "flex h-11 w-full items-center justify-between gap-2 rounded-lg border px-4 text-sm transition outline-none"

/** Idle + focus appearance for an enabled control. */
export const controlEnabled =
  "border-divider bg-bg-surface text-text-heading hover:border-brand/60 focus:border-brand focus:ring-2 focus:ring-focus-ring/30 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-focus-ring/30"

/** Appearance for a disabled control. */
export const controlDisabled = "cursor-not-allowed bg-paper opacity-60"

/** Complete trigger class for a control in a given state. */
export function controlClass(disabled = false, extra = "") {
  return [controlBase, disabled ? controlDisabled : controlEnabled, extra]
    .filter(Boolean)
    .join(" ")
}

/** Popup surface shared by the searchable dropdown. */
export const menuSurface =
  "rounded-lg border border-divider bg-bg-surface p-2 shadow-lg shadow-black/5 dark:shadow-black/40"

/** Max height of an option list before it scrolls internally. */
export const menuListClass = "max-h-60 overflow-y-auto overscroll-contain"

/** Field label used above controls. */
export const fieldLabel = "mb-1 text-[13px] font-bold text-text-body"
