import { Skeleton, SkeletonPage } from '@/components/ui/feedback/Skeleton'

/**
 * Route-level placeholder for the homework publisher.
 *
 * The page fetches its assignments on the server, so this stands in for that
 * round trip — composer on the left, grouped list on the right, in the same
 * proportions as the real thing.
 */
export default function Loading() {
  return (
    <SkeletonPage label="កំពុងទាញយកកិច្ចការផ្ទះ...">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>
        <Skeleton className="h-11 w-48 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="flex flex-col gap-4 rounded-xl border border-divider p-4 md:p-5">
            <Skeleton className="h-6 w-40" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-1.5 h-11 w-full rounded-lg" />
              </div>
            ))}
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="flex flex-col gap-4 rounded-xl border border-divider p-4 md:p-5">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-11 w-full rounded-lg" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </SkeletonPage>
  )
}
