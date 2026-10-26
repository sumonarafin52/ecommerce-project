import { Skeleton, ProductDetailSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="bg-cream-bg min-h-screen font-body2" aria-busy="true" aria-label="Loading product">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 py-6">
        <Skeleton className="h-4 w-48 mb-5" />
        <ProductDetailSkeleton />
      </div>
    </div>
  );
}
