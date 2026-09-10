/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PAGE FRAME CONTRACT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every route under `app/(main)/` is composed the same way:
 *
 *     <PageContainer>
 *       <PageHeader title description actions />
 *       <ClassContextBar />        ← class-scoped routes only; self-gating
 *       …content
 *     </PageContainer>
 *
 * A non-class-scoped page (`/profile`, `/team`, `/tutorial`) simply omits the
 * third line — though including it is harmless, because `ClassContextBar`
 * decides for itself from `isClassScopedPath`. It is written out rather than
 * folded into `PageHeader` so a screen that already states its context richly
 * can leave it out: `/score/enter`, `/score/total` and `/ranking` render
 * `ScoreWorkspaceHeader`, which names class · year · subject · period, and a
 * second strip above it would say the same thing twice.
 *
 * ── Why this is written down here ─────────────────────────────────────────
 *
 * Phase 0 found that only 16 of the 45 teacher routes use this pair. The other
 * 29 hand-roll a container, and between them they use six different content
 * widths — `max-w-4xl`, `-5xl`, `-6xl`, `-7xl`, `max-w-[1200px]` and this
 * file's `max-w-[1600px]` — each with its own `<h1>` treatment. That seam, not
 * any individual screen, is why the product reads as a collection of pages
 * rather than one system. Phase 2 converges them; this comment is the target it
 * converges on.
 *
 * ── What a converting page must delete, not merely wrap ───────────────────
 *
 *   its own `mx-auto max-w-*` wrapper   `PageContainer` owns the column
 *   its own `px-*` / `py-*` page padding same
 *   its own `<h1 className="kh-moul">`   `PageHeader` owns the title
 *   its own "class: ៥ក" caption          `ClassContextBar` owns the context
 *
 * ── What it must keep ─────────────────────────────────────────────────────
 *
 * A printable screen keeps its A4 block exactly as it is, *inside* the
 * container. `data-app-frame` gives this element `display: contents` under
 * `@media print` (see `globals.css`), which drops the box from layout while
 * keeping its children — so padding, max-width and grid placement stop applying
 * and the sheet measures precisely what it measured before the shell existed.
 * Nothing about a printed document changes by moving it in here.
 *
 * A full-bleed surface (the 3D seating view) passes `bleed`, which drops the
 * padding and the width cap while keeping the print behaviour.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * The content column every feature page sits in.
 *
 * `data-app-frame` matters more than it looks: the print rule in `globals.css`
 * gives this `display: contents`, which removes the box from layout while
 * keeping its children. Padding, max-width and the grid placement therefore
 * stop applying when printing, and an A4 sheet inside is laid out exactly as it
 * was before the shell existed.
 *
 * `max-w-[1600px]` keeps text from stretching on a 1920px monitor without
 * leaving a 1440px screen looking empty.
 */
export function PageContainer({
  children,
  className = "",
  bleed = false,
}: {
  children: React.ReactNode
  /** Extra classes for the inner column. */
  className?: string
  /** Drops the padding and width cap — for full-bleed surfaces like the 3D view. */
  bleed?: boolean
}) {
  return (
    <div
      data-app-frame
      className={
        bleed ? "w-full" : `mx-auto w-full max-w-[1600px] px-4 py-5 md:px-6 md:py-6 ${className}`
      }
    >
      {children}
    </div>
  )
}

/** Title row for a page: heading, optional description, and an actions slot. */
export function PageHeader({
  title,
  description,
  actions,
  className = "",
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header
      className={`mb-5 flex flex-wrap items-start justify-between gap-3 print:hidden ${className}`}
    >
      <div className="min-w-0">
        <h1 className="kh-moul text-lg text-brand md:text-xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export default PageContainer
