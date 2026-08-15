import { SkeletonPage, SkeletonTable, Skeleton } from '@/components/ui/feedback/Skeleton'

export default function Loading() {
  return (
    <>
      <SkeletonPage>
        <div className="mb-6 flex items-center justify-between gap-4">
          <Skeleton className="h-7 w-56" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        <SkeletonTable rows={12} cols={10} />
      </SkeletonPage>
    </>
  )
}
