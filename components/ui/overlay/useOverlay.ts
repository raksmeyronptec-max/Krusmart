"use client"

import { useCallback, useEffect, useRef } from "react"

/**
 * The behaviour every overlay owes the user, in one place.
 *
 * The twenty hand-rolled modals this replaces implement none of it: only one
 * carries `role="dialog"`, none trap focus, none close on Escape, and none give
 * focus back to whatever opened them. A keyboard or screen-reader user could
 * tab straight out of an open dialog into the page behind it.
 *
 * Four things, all of which have to be undone precisely on close:
 *
 *   1. Escape closes.
 *   2. Tab cycles inside the panel instead of escaping to the page.
 *   3. The page behind stops scrolling.
 *   4. Focus returns to the element that opened the overlay.
 */
export function useOverlay(
  open: boolean,
  onClose: () => void,
  panelRef: React.RefObject<HTMLElement | null>,
  { closeOnEscape = true }: { closeOnEscape?: boolean } = {},
) {
  /** Whatever had focus before the overlay opened, so it can be restored. */
  const restoreTo = useRef<HTMLElement | null>(null)

  const focusable = useCallback(() => {
    const root = panelRef.current
    if (!root) return [] as HTMLElement[]
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement)
  }, [panelRef])

  useEffect(() => {
    if (!open) return

    restoreTo.current = document.activeElement as HTMLElement | null

    // Move focus in, so the first Tab lands inside rather than in the page.
    const first = focusable()[0] ?? panelRef.current
    first?.focus?.()

    const onKeyDown = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === "Escape") {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== "Tab") return

      const items = focusable()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      const active = document.activeElement

      // Wrap at both ends — this is what makes it a trap rather than a hint.
      if (e.shiftKey && (active === firstEl || !panelRef.current?.contains(active))) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown, true)

    // Lock the page behind. The previous value is captured rather than assumed
    // to be `''`, so nested overlays cannot leave the page permanently frozen.
    const html = document.documentElement
    const previousOverflow = html.style.overflow
    html.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", onKeyDown, true)
      html.style.overflow = previousOverflow
      restoreTo.current?.focus?.()
    }
  }, [open, onClose, panelRef, focusable, closeOnEscape])
}
