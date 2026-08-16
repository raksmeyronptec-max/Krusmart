import { Skeleton, SkeletonPage } from '@/components/ui/feedback/Skeleton'

/**
 * Route-level placeholder for the homework mark book.
 *
 * Shaped like the real page — header card, toolbar, then a stack of roster rows
 * — so the swap does not jump. The old skeleton drew a ten-column table, which
 * matched neither the daily roster nor the monthly grid.
 */
export default function Loading() {
  return (
    <SkeletonPage label="កំពុងទាញយកពិន្ទុកិច្ចការផ្ទះ...">
      {/* header card */}
      <div className="mb-4 rounded-xl border border-divider p-4 md:p-5">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="mt-2 h-4 w-72" />
        <Skeleton className="mt-3 h-10 w-full rounded-lg" />
        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>

      {/* toolbar */}
      <div className="mb-4 rounded-xl border border-divider p-3 md:p-4">
        <Skeleton className="h-11 w-64 rounded-xl" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      </div>

      {/* roster */}
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </SkeletonPage>
  )
}
