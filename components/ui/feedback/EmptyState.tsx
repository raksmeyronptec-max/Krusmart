import { Inbox, SearchX, AlertTriangle } from "lucide-react"

/**
 * What a data surface shows when it has nothing to show.
 *
 * The brief's rule is that no data page may render a blank area, and the three
 * reasons a page can be empty are not the same thing to a teacher:
 *
 *   empty    — nothing has been created yet. Offer the action that creates it.
 *   filtered — rows exist but the search excluded them. Offer to clear it.
 *   error    — the fetch failed. Offer to retry, and say what failed.
 *
 * Copy is passed in rather than defaulted per surface, because "no students
 * yet" and "no scores yet" want different next steps.
 */

export type EmptyStateKind = "empty" | "filtered" | "error"

export interface EmptyStateProps {
  kind?: EmptyStateKind
  title: React.ReactNode
  description?: React.ReactNode
  /** Primary next step — usually a `<Button>`. */
  action?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}

const ICONS: Record<EmptyStateKind, React.ComponentType<{ className?: string }>> = {
  empty: Inbox,
  filtered: SearchX,
  error: AlertTriangle,
}

const TONES: Record<EmptyStateKind, string> = {
  empty: "bg-paper text-text-muted",
  filtered: "bg-paper text-text-muted",
  error: "bg-danger/10 text-danger",
}

export function EmptyState({
  kind = "empty",
  title,
  description,
  action,
  icon,
  className = "",
}: EmptyStateProps) {
  const Icon = ICONS[kind]

  return (
    <div
      className={["flex flex-col items-center gap-3 px-6 py-12 text-center", className]
        .filter(Boolean)
        .join(" ")}
      // `status` rather than `alert`: an empty list is information, not an
      // interruption. The error kind is still announced, just not urgently.
      role="status"
    >
      <span className={`flex h-12 w-12 items-center justify-center rounded-full ${TONES[kind]}`}>
        {icon ?? <Icon className="h-6 w-6" aria-hidden="true" />}
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-bold text-text-heading">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-text-muted">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

export default EmptyState
