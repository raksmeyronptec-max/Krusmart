/**
 * The panel surface for the teacher and admin apps.
 *
 * Card wrappers were previously written inline on every page, and drifted:
 * `rounded-2xl` beside `rounded-3xl`, `shadow-lg` beside `shadow-2xl`,
 * `bg-white/95 backdrop-blur` beside plain `bg-white`. This collapses them to
 * four variants and four padding steps, all on semantic tokens so dark mode
 * needs no `dark:` classes at the call site.
 *
 * Print is handled here rather than by each page: a shadow renders as a grey
 * smear on paper, so it is dropped and replaced with a plain border.
 *
 * Deliberately not a client component — it has no interactivity, so it can be
 * used inside server components without pulling them over the boundary.
 */

export type CardVariant = "default" | "elevated" | "flat" | "outlined"
export type CardPadding = "none" | "sm" | "md" | "lg"

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  variant?: CardVariant
  padding?: CardPadding
  /**
   * The element to render.
   *
   * `form` is included because the admin panels *are* forms — the card is the
   * form, not a wrapper around one — and splitting them would put the server
   * action on an inner element with the border on an outer one.
   */
  as?: "div" | "section" | "article" | "form"
  /** Server action, when rendered `as="form"`. */
  action?: string | ((formData: FormData) => void | Promise<void>)
  className?: string
  children: React.ReactNode
}

const VARIANTS: Record<CardVariant, string> = {
  default: "bg-bg-surface border border-divider rounded-xl shadow-sm",
  elevated: "bg-bg-surface border border-divider rounded-xl shadow-md",
  flat: "bg-paper rounded-xl",
  outlined: "border border-divider rounded-xl",
}

const PADDING: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
}

export function Card({
  variant = "default",
  padding = "md",
  as: Tag = "div",
  className = "",
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={[
        VARIANTS[variant],
        PADDING[padding],
        "print:border print:border-gray-300 print:shadow-none",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/**
 * Optional header strip for a card: a title, an optional description, and a
 * slot for controls on the right. Separated by the same divider token the card
 * border uses, so the two always agree.
 */
export function CardHeader({
  title,
  description,
  icon,
  actions,
  className = "",
}: {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={[
        "flex flex-wrap items-start justify-between gap-4 border-b border-divider pb-4",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-center gap-3">
        {icon && <span className="shrink-0 text-brand">{icon}</span>}
        <div>
          <h2 className="text-base font-bold text-text-heading">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </div>
  )
}

export default Card
