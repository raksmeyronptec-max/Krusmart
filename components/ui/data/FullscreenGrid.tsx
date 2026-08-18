'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useOverlay } from '@/components/ui/overlay/useOverlay'

/**
 * A wide entry/review table with a ពេញអេក្រង់ toggle.
 *
 * Three score grids (homework monthly, score entry, score totals) each want the
 * same thing: a header row with a toggle button, and a scroll container that is
 * capped at ~⅔ viewport inline but owns the whole screen when a teacher asks
 * for room. One component, so the behaviours cannot drift apart.
 *
 * Fullscreen is a CLASS SWITCH on the same DOM nodes — not a portal, not the
 * Fullscreen API. A portalled copy would remount every `<input>`, dropping the
 * focused cell and its caret at the exact moment the teacher asked for *more*
 * room to type; `requestFullscreen()` is refused on iPad Safari, exits behind
 * React's back on Escape, and hides browser chrome. A `fixed inset-0` overlay
 * behaves identically everywhere, and because the nodes survive the toggle,
 * focus, caret, scroll position and unsaved cell state all come along in both
 * directions. The pinned columns need nothing: `position: sticky` resolves
 * against this scroll container, which is the same element in both states.
 *
 * `useOverlay` supplies what the expanded state owes the user — Escape closes,
 * Tab stays inside, the page behind stops scrolling, focus returns to the
 * toggle — the same contract as every dialog in the app.
 *
 * The scroll container is rendered here, focusable and labelled: a scroll
 * region with no focusable child is unreachable to a keyboard user, and two of
 * the three grids were missing that.
 */
export interface FullscreenGridProps {
  /** Accessible name for the scroll region, and for the dialog when expanded. */
  label: string
  /** Left side of the header row while inline — e.g. a drag hint. */
  hint?: React.ReactNode
  /**
   * Left side while expanded. Defaults to the ESC note; a grid whose page
   * listens for Ctrl+S should say so here, because the sticky save bar sits
   * behind the overlay.
   */
  expandedHint?: React.ReactNode
  /** Height cap for the inline state. */
  collapsedMaxHeight?: string
  /** Forwarded to the scroll container — cell keyboard navigation reads it. */
  scrollRef?: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
}

export function FullscreenGrid({
  label,
  hint,
  expandedHint = 'ESC ដើម្បីបិទពេញអេក្រង់',
  collapsedMaxHeight = 'max-h-[68vh]',
  scrollRef,
  children,
}: FullscreenGridProps) {
  const [expanded, setExpanded] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setExpanded(false), [])
  useOverlay(expanded, close, panelRef)

  // These grids are desktop-only (`hidden lg:block` at every call site). If the
  // window shrinks below `lg` while expanded, the overlay would vanish by CSS
  // with the scroll lock still applied — so the state follows the breakpoint.
  // Printing collapses too: every page here prints through its own dedicated
  // sheet component, and a fixed overlay must not sit over that pagination.
  useEffect(() => {
    if (!expanded) return
    const mq = window.matchMedia('(min-width: 1024px)')
    const onMq = () => {
      if (!mq.matches) setExpanded(false)
    }
    const onPrint = () => setExpanded(false)
    mq.addEventListener('change', onMq)
    window.addEventListener('beforeprint', onPrint)
    return () => {
      mq.removeEventListener('change', onMq)
      window.removeEventListener('beforeprint', onPrint)
    }
  }, [expanded])

  return (
    <div
      ref={panelRef}
      role={expanded ? 'dialog' : undefined}
      aria-modal={expanded || undefined}
      aria-label={expanded ? `${label} — ពេញអេក្រង់` : undefined}
      className={expanded ? 'fixed inset-0 z-[100] flex flex-col bg-bg-app p-4 md:p-6' : ''}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center text-[11px] font-bold text-text-muted">
          {expanded ? <span className="kh-truncate">{expandedHint}</span> : hint}
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'បិទការបង្ហាញពេញអេក្រង់' : 'ពង្រីកតារាងពេញអេក្រង់'}
          title={expanded ? 'បិទការបង្ហាញពេញអេក្រង់ (ESC)' : 'ពង្រីកតារាងពេញអេក្រង់'}
          className="flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-2.5 text-[11px] font-bold text-text-body transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {expanded ? (
            <>
              <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
              បិទពេញអេក្រង់
            </>
          ) : (
            <>
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              ពេញអេក្រង់
            </>
          )}
        </button>
      </div>

      <div
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label={label}
        className={`overflow-auto rounded-xl border border-divider bg-bg-surface shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
          // Expanded, the container owns the leftover viewport height and
          // `min-h-0` lets the flex column actually cap it; inline, the cap
          // keeps the page's own footer controls in reach below the grid.
          expanded ? 'min-h-0 flex-1' : collapsedMaxHeight
        }`}
      >
        {children}
      </div>
    </div>
  )
}

export default FullscreenGrid
