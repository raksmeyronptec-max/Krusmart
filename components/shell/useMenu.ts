"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * A dropdown that behaves the way a dropdown has to.
 *
 * The account menu in the top bar used to open on `group-hover` alone. That is
 * three separate failures in one: a touch user has no hover, so the menu — and
 * with it the only sign-out control in the app — was reachable on a phone only
 * by accident; a keyboard user could tab into items that were still invisible;
 * and `aria-expanded` was hard-coded to `"false"`, so a screen reader was told
 * the menu was shut while it was open.
 *
 * This is deliberately *not* `useOverlay`. That hook is for modals: it locks
 * `<html>` scrolling and traps Tab inside the panel, which is right for a
 * dialog and wrong for a menu — a menu should let Tab walk out of it and close
 * behind you, and must never freeze the page underneath.
 *
 * Four behaviours, all of which have to unwind cleanly:
 *
 *   1. Escape closes and hands focus back to the trigger.
 *   2. A pointer press anywhere outside closes.
 *   3. Tabbing out of the menu closes it, without eating the Tab.
 *   4. Opening from the keyboard moves focus to the first item; opening from a
 *      pointer leaves focus on the trigger, so the mouse user's caret does not
 *      jump.
 */
export function useMenu<T extends HTMLElement = HTMLElement>() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<T | null>(null)
  /** Set when the menu was opened by a key, so focus should move inside. */
  const focusFirst = useRef(false)

  const close = useCallback((returnFocus = false) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  const toggle = useCallback((fromKeyboard = false) => {
    focusFirst.current = fromKeyboard
    setOpen((v) => !v)
  }, [])

  useEffect(() => {
    if (!open) return

    if (focusFirst.current) {
      const first = menuRef.current?.querySelector<HTMLElement>(
        'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])',
      )
      first?.focus()
      focusFirst.current = false
    }

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        close(true)
        return
      }
      if (event.key !== "Tab") return
      // Let the browser move focus, then decide: if it landed outside, the user
      // has walked out of the menu and it should not stay open behind them.
      requestAnimationFrame(() => {
        const active = document.activeElement
        if (
          !menuRef.current?.contains(active) &&
          !triggerRef.current?.contains(active)
        ) {
          setOpen(false)
        }
      })
    }

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("touchstart", onPointerDown)
    document.addEventListener("keydown", onKeyDown, true)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("touchstart", onPointerDown)
      document.removeEventListener("keydown", onKeyDown, true)
    }
  }, [open, close])

  return { open, setOpen, toggle, close, triggerRef, menuRef }
}
