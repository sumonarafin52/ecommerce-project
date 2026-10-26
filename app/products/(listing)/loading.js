// Instant feedback while the product listing loads on the server — without
// this, tapping a category on a slow connection looked like nothing happened.
//
// It lives inside the (listing) route group rather than at app/products/ so
// the boundary covers ONLY this page. At the parent level it also wrapped
// /products/[id], and a Suspense boundary above that segment flushes the
// shell before its layout runs — which meant the layout could neither
// return a 404 for a URL matching no product nor redirect a legacy id URL
// with a real status code. The group changes no URLs: this still serves
// /products.
import { Skeleton, ProductGridSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="bg-cream-bg min-h-screen font-body2" aria-busy="true" aria-label="Loading products">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 py-6">
        <Skeleton className="h-4 w-40 mb-5" />
        <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-7">
          <div className="hidden lg:block space-y-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
          </div>
          <div>
            <Skeleton className="h-7 w-48 mb-2" />
            <Skeleton className="h-4 w-28 mb-5" />
            <ProductGridSkeleton count={12} />
          </div>
        </div>
      </div>
    </div>
  );
}
