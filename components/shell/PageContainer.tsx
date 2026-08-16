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
