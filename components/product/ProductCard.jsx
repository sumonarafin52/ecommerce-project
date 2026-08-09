import Link from "next/link";

export default function ProductCard({ product }) {
  // TODO: product.image, product.name, product.price দেখাও
  // TODO: hover effect, "Add to Cart" quick action button
  return (
    <Link
      href={`/products/${product?._id || ""}`}
      className="block rounded-lg border border-gray-200 p-4 hover:shadow-md"
    >
      <div className="mb-3 aspect-square bg-gray-100">
        {/* TODO: next/image দিয়ে product.images[0] বসাও */}
      </div>
      <h3 className="font-medium">{product?.name || "Product name"}</h3>
      <p className="text-primary-light">{product?.price ?? "—"} ৳</p>
    </Link>
  );
}
