// components/ui/Skeleton.jsx
//
// Content-shaped loading placeholders. A spinner tells someone "something
// is happening"; a skeleton tells them *what* is coming and reserves the
// right amount of space, so the page doesn't jump when real content lands.

export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse bg-line/60 rounded ${className}`} />;
}

export function ProductCardSkeleton() {
  return (
    <div className="bg-cream-white border border-line rounded-xl overflow-hidden">
      <Skeleton className="aspect-square rounded-none" />
      <div className="p-3.5 space-y-2.5">
        <Skeleton className="h-2.5 w-1/3" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-4 w-1/2 mt-1" />
        <Skeleton className="h-9 w-full rounded-lg mt-2" />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ProductDetailSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div className="space-y-3">
        <Skeleton className="aspect-square rounded-xl" />
        <div className="flex gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="w-16 h-16 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-4/5" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-40" />
        <div className="space-y-2 pt-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
        <div className="flex gap-3 pt-4">
          <Skeleton className="h-12 flex-1 rounded-lg" />
          <Skeleton className="h-12 flex-1 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function OrderCardSkeleton() {
  return (
    <div className="bg-cream-alt/40 border border-line rounded-xl p-5 space-y-3">
      <div className="flex justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-2.5 w-48" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}
