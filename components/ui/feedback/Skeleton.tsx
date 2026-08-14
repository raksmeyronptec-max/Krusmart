/**
 * Loading placeholders for the route-level `loading.tsx` files.
 *
 * These are presentational only — they use the semantic tokens from
 * `globals.css` so they track light/dark without any hard-coded greys.
 */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-divider/60 ${className}`} aria-hidden="true" />
}

/** A rectangular block standing in for a paragraph line or a field. */
export function SkeletonLine({ className = 'h-4 w-full' }: { className?: string }) {
  return <Skeleton className={className} />
}

/**
 * A generic table placeholder: a header strip plus `rows` body rows.
 * Sized to roughly match the real tables so the swap doesn't jump.
 */
export function SkeletonTable({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-divider">
      <div className="flex gap-4 border-b border-divider bg-paper p-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-divider">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 p-3">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The shell every `(main)` loading state shares: the page is still behind the
 * real `<TopNav />`, so this only stands in for the content below it.
 */
export function SkeletonPage({
  children,
  label = 'កំពុងទាញទិន្នន័យ...',
}: {
  children: React.ReactNode
  label?: string
}) {
  return (
    <div className="min-h-screen bg-bg-surface" role="status" aria-live="polite" aria-busy="true">
      <div className="container mx-auto max-w-7xl p-4 md:p-6">
        <span className="sr-only">{label}</span>
        {children}
      </div>
    </div>
  )
}
