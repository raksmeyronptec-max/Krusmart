"use client"

import { useId, useRef } from "react"
import { createPortal } from "react-dom"
import { useIsClient } from "./useIsClient"
import { useOverlay } from "./useOverlay"

/**
 * Sheet that rises from the bottom edge.
 *
 * The brief asks for bottom sheets over "tiny dropdowns" on mobile, and the
 * reason is reach: a teacher holding a phone one-handed can hit the bottom
 * third of the screen with a thumb and not the top. Use this for action lists
 * and pickers on touch; use `Dialog` when the content is a form or a
 * confirmation the user must read.
 *
 * Anchored to the bottom at every width — that is the whole point — so it has
 * no desktop-centred variant. It ends at 88dvh so the page stays visible behind
 * it and the sheet still reads as temporary.
 */

export interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  description?: React.ReactNode
  /** Hides the title visually while keeping the accessible name. */
  hideTitle?: boolean
  className?: string
  children: React.ReactNode
}

export function BottomSheet({
  open,
  onClose,
  title,
  description,
  hideTitle = false,
  className = "",
  children,
}: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()

  const isClient = useIsClient()

  useOverlay(open, onClose, panelRef)

  if (!isClient || !open) return null

  return createPortal(
    <div
      className="overlay-enter fixed inset-0 z-[100] flex items-end justify-center bg-brand-950/50 backdrop-blur-[2px] print:hidden"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={[
          "flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-xl bg-bg-surface shadow-lg outline-none",
          "sheet-enter",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Grab handle: a visual affordance that this panel is dismissable. */}
        <div className="flex justify-center pt-3 pb-1" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-divider" />
        </div>

        <header className={`px-5 pb-3 ${hideTitle ? "sr-only" : ""}`}>
          <h2 id={titleId} className="text-base font-bold text-text-heading">
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-1 text-sm text-text-muted">
              {description}
            </p>
          )}
        </header>

        <div className="overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default BottomSheet
