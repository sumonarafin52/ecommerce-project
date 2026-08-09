import ProductGrid from "@/components/product/ProductGrid";

export default function HomePage() {
  // TODO: এখানে API থেকে featured/latest products fetch করে ProductGrid-এ পাঠাও
  // এই file-এ Hero section, Category showcase ইত্যাদির code বসবে
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <section className="mb-12">
        {/* TODO: Hero section - এখানে অন্য AI থেকে পাওয়া Hero code বসাও */}
        <h1 className="font-display text-4xl font-bold">
          Welcome to MyShop
        </h1>
        <p className="mt-2 text-primary-light">
          Homepage hero section - এখানে বসবে।
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-semibold">Featured Products</h2>
        {/* TODO: real product data pass করো */}
        <ProductGrid products={[]} />
      </section>
    </div>
  );
}
