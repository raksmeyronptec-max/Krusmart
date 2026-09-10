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
  const onCloseRef = useRef(onClose)
  const closeOnEscapeRef = useRef(closeOnEscape)

  useEffect(() => {
    onCloseRef.current = onClose
    closeOnEscapeRef.current = closeOnEscape
  })

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

    // Move focus inside the overlay when opened.
    // If the overlay contains form fields (input, textarea, select), prefer focusing the first field
    // so user can type immediately instead of focusing the header's close button.
    const timer = requestAnimationFrame(() => {
      const root = panelRef.current
      if (!root) return

      // If focus is already inside the panel, do not interfere.
      if (root.contains(document.activeElement)) return

      const autoFocusEl = root.querySelector<HTMLElement>('[autofocus], [data-autofocus]')
      if (autoFocusEl) {
        autoFocusEl.focus()
        return
      }

      const firstInput = root.querySelector<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])',
      )
      if (firstInput && (firstInput.offsetParent !== null || firstInput === document.activeElement)) {
        firstInput.focus()
        return
      }

      const first = focusable()[0] ?? root
      first?.focus?.()
    })

    const onKeyDown = (e: KeyboardEvent) => {
      if (closeOnEscapeRef.current && e.key === "Escape") {
        e.stopPropagation()
        onCloseRef.current()
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
      cancelAnimationFrame(timer)
      document.removeEventListener("keydown", onKeyDown, true)
      html.style.overflow = previousOverflow
      restoreTo.current?.focus?.()
      restoreTo.current = null
    }
  }, [open, panelRef, focusable])
}
