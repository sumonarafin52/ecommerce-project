import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="bg-cream-bg min-h-screen font-body2" aria-busy="true" aria-label="Loading categories">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 py-5 sm:py-8">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-56 mt-2" />
        <div className="flex gap-2 mt-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-24 rounded-full" />)}</div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4 mt-6">
          {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)}
        </div>
      </div>
    </div>
  );
}
