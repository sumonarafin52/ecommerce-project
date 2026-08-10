export default async function ProductDetailsPage({ params }) {
  const { id } = params;

  // TODO: /api/products/[id] থেকে product data fetch করো
  // TODO: Image gallery, variant selector, Add to Cart button, reviews section

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <p className="text-primary-light">Product ID: {id}</p>
      <h1 className="mt-2 text-3xl font-bold">Product name বসবে এখানে</h1>
      {/* TODO: image gallery */}
      {/* TODO: price, stock, variant selector */}
      {/* TODO: Add to Cart button - use useCartStore() */}
      {/* TODO: reviews section */}
    </div>
  );
}
