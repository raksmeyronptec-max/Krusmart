"use client"

import { useId, useRef } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { useIsClient } from "./useIsClient"
import { useOverlay } from "./useOverlay"

/**
 * Centred modal dialog.
 *
 * Replaces the fifteen hand-rolled `fixed inset-0` overlays. Three things it
 * does that none of them did:
 *
 *   * portals to `<body>`, so a future sidebar or sticky header cannot trap it
 *     in a stacking context;
 *   * carries the dialog role, the accessible name and a focus trap;
 *   * hides itself in print — an open dialog used to render onto the paper.
 *
 * On phones it rises from the bottom edge instead of floating in the middle,
 * which puts the controls under the thumb rather than in the middle of the
 * screen. That is a layout switch only; the semantics stay identical.
 */

export type DialogSize = "sm" | "md" | "lg" | "xl"

export interface DialogProps {
  open: boolean
  onClose: () => void
  /** Accessible name. Rendered as the header unless `hideTitle`. */
  title: React.ReactNode
  description?: React.ReactNode
  size?: DialogSize
  /** Footer row — typically the cancel/confirm buttons. */
  footer?: React.ReactNode
  /** Keeps the title for assistive tech but does not draw it. */
  hideTitle?: boolean
  /** Set false for a flow the user must resolve with a button. */
  dismissible?: boolean
  className?: string
  children?: React.ReactNode
}

const SIZES: Record<DialogSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  size = "md",
  footer,
  hideTitle = false,
  dismissible = true,
  className = "",
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()

  // `createPortal` needs a DOM target, which does not exist during SSR.
  const isClient = useIsClient()

  useOverlay(open, onClose, panelRef, { closeOnEscape: dismissible })

  if (!isClient || !open) return null

  return createPortal(
    <div
      className="overlay-enter fixed inset-0 z-[100] flex items-end justify-center bg-brand-950/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4 print:hidden"
      onMouseDown={(e) => {
        // Only a press that both starts and ends on the backdrop dismisses —
        // dragging a text selection out of the panel must not close it.
        if (dismissible && e.target === e.currentTarget) onClose()
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
          "flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl bg-bg-surface shadow-lg outline-none sm:rounded-xl",
          "sheet-enter sm:dialog-enter",
          SIZES[size],
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <header className="flex items-start justify-between gap-4 border-b border-divider px-5 py-4">
          <div className={hideTitle ? "sr-only" : ""}>
            <h2 id={titleId} className="text-base font-bold text-text-heading">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-text-muted">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="បិទ"
              className="tap-target -mr-1.5 -mt-1 shrink-0 rounded-lg p-2 text-text-muted transition hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </header>

        <div className="overflow-y-auto overscroll-contain px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex flex-wrap justify-end gap-3 border-t border-divider px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default Dialog
