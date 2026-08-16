import { SkeletonPage, SkeletonTable, Skeleton } from '@/components/ui/feedback/Skeleton'

function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-4 rounded-2xl border border-divider bg-paper p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
            <Skeleton className="h-6 w-12 rounded-full" />
          </div>
          <div className="space-y-3 pt-4 border-t border-divider/50">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Loading() {
  return (
    <SkeletonPage>
      {/* Page Header Skeleton */}
      <div className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-11 w-32 rounded-lg" />
          <Skeleton className="h-11 w-32 rounded-lg" />
          <Skeleton className="h-11 w-24 rounded-lg" />
          <Skeleton className="h-11 w-32 rounded-lg" />
        </div>
      </div>
      
      {/* Search & Filter Bar Skeleton */}
      <div className="mb-6 flex flex-col gap-3 rounded-b-xl border-b border-divider bg-bg-surface p-4 shadow-sm md:flex-row md:items-center">
        <Skeleton className="h-10 w-full flex-1 rounded-lg md:w-auto" />
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-36 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
          <div className="mx-1 h-6 w-px bg-divider" />
          <Skeleton className="h-10 w-20 rounded-lg" />
        </div>
      </div>

      {/* Responsive Content Skeleton */}
      <div className="md:hidden">
        <SkeletonGrid count={6} />
      </div>
      <div className="hidden overflow-hidden rounded-2xl border border-divider bg-paper shadow-sm md:block">
        <SkeletonTable rows={10} cols={8} />
      </div>
    </SkeletonPage>
  )
}
