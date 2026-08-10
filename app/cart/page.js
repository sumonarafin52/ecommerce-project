"use client";
import useCartStore from "@/store/cartStore";
import CartItem from "@/components/cart/CartItem";
export const dynamic = 'force-dynamic';
export default function CartPage() {
  const items = useCartStore((state) => state.items);
  // TODO: cart items list করো, subtotal calculate করো, "Proceed to Checkout" বাটন

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-bold">Your Cart</h1>
      {items.length === 0 ? (
        <p className="text-primary-light">Cart is empty.</p>
      ) : (
        items.map((item) => <CartItem key={item.id} item={item} />)
      )}
      {/* TODO: order summary + checkout button */}
    </div>
  );
}
