"use client"

import { useLayoutEffect, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useIsClient } from "@/components/ui/overlay/useIsClient"
import type { NavLink, NavModule } from "@/lib/navigation"

const MARGIN = 8

/**
 * The submenu of a module in the collapsed icon rail.
 *
 * Portalled and `position: fixed` on purpose. Opening a group *inline* in a
 * 68px rail would either reflow the rail — pushing every icon below it down, so
 * the thing you were aiming at moves out from under the cursor — or overflow a
 * scroll container and be clipped. Anchoring to the trigger's viewport rect
 * escapes both, and escapes any `overflow`/`transform` ancestor the shell
 * grows later.
 */
export function RailFlyout({
  navModule,
  anchor,
  activeHref,
  onNavigate,
  panelRef,
}: {
  navModule: NavModule
  /** The rail button this hangs off. */
  anchor: HTMLElement | null
  activeHref: string
  onNavigate: () => void
  panelRef: React.RefObject<HTMLDivElement | null>
}) {
  const isClient = useIsClient()
  const [box, setBox] = useState<{ top: number; left: number; maxHeight: number } | null>(null)

  const children = (navModule.children ?? []).filter((c) => !c.hidden)

  useLayoutEffect(() => {
    if (!anchor) return

    const place = () => {
      const rect = anchor.getBoundingClientRect()
      // Roughly what the panel will measure: a header row plus one row per
      // child. Used only to decide whether it must be nudged up off the bottom
      // edge, so an estimate is enough and avoids a second layout pass.
      const estimated = 44 + children.length * 36 + 16
      const top = Math.min(
        Math.max(MARGIN, rect.top),
        Math.max(MARGIN, window.innerHeight - estimated - MARGIN),
      )
      // Bail when nothing moved. `place` runs on every capture-phase scroll
      // event in the document, and a re-render per scroll tick for a panel that
      // has not moved is pure waste.
      setBox((prev) => {
        const next = {
          top,
          left: rect.right + MARGIN,
          maxHeight: window.innerHeight - top - MARGIN,
        }
        return prev &&
          prev.top === next.top &&
          prev.left === next.left &&
          prev.maxHeight === next.maxHeight
          ? prev
          : next
      })
    }

    place()
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [anchor, children.length])

  if (!isClient || !box) return null

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-label={navModule.label}
      style={{ position: "fixed", top: box.top, left: box.left, maxHeight: box.maxHeight }}
      className="dialog-enter z-50 w-60 overflow-y-auto overscroll-contain rounded-xl border border-divider bg-bg-surface p-2 shadow-lg print:hidden"
    >
      <p className="kh-truncate px-2.5 pt-1 pb-2 text-[12px] font-bold text-text-heading">
        {navModule.label}
      </p>
      <ul className="flex flex-col gap-0.5">
        {children.map((child: NavLink) => {
          const on = activeHref === child.href || activeHref.startsWith(child.href + "/")
          return (
            <li key={child.href}>
              <Link
                href={child.href}
                role="menuitem"
                onClick={onNavigate}
                aria-current={on ? "page" : undefined}
                title={child.label}
                className={`nav-row flex items-center rounded-lg px-2.5 py-1.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring ${
                  on
                    ? "bg-brand-100 font-bold text-brand-800 dark:bg-brand-900/60 dark:text-brand-300"
                    : "text-text-body hover:bg-paper hover:text-text-heading"
                }`}
              >
                <span className="kh-truncate">{child.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>,
    document.body,
  )
}

export default RailFlyout
