// app/checkout/page.js
"use client";

export const dynamic = 'force-dynamic';

import { useState } from "react";
import useCartStore from "@/store/cartStore";  // ✅ Fixed
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { formatCurrency } from "@/lib/utils";

// ... rest of the code same

export default function CheckoutPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { items, getTotalPrice, clearCart } = useCartStore();

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    address: "",
    city: "",
    paymentMethod: "sslcommerz",
  });

  // Redirect to login if not authenticated
  if (status === "loading") {
    return <div className="text-center py-10">Loading...</div>;
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p>Please login to proceed with checkout</p>
        <button
          onClick={() => router.push("/login")}
          className="mt-4 rounded bg-primary px-6 py-2 text-white"
        >
          Go to Login
        </button>
      </div>
    );
  }

  // Redirect if cart is empty
  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p>Your cart is empty</p>
        <button
          onClick={() => router.push("/products")}
          className="mt-4 rounded bg-primary px-6 py-2 text-white"
        >
          Continue Shopping
        </button>
      </div>
    );
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate form
      if (
        !formData.fullName.trim() ||
        !formData.phone.trim() ||
        !formData.address.trim() ||
        !formData.city.trim()
      ) {
        toast.error("All fields are required");
        setLoading(false);
        return;
      }

      // Create order
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            product: item._id,
            quantity: item.quantity,
          })),
          shippingAddress: {
            fullName: formData.fullName.trim(),
            phone: formData.phone.trim(),
            address: formData.address.trim(),
            city: formData.city.trim(),
          },
          paymentMethod: formData.paymentMethod,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        toast.error(result.message || "Order creation failed");
        setLoading(false);
        return;
      }

      const order = result.data;
      toast.success("Order created!");

      // Trigger payment gateway
      const checkoutResponse = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order._id,
          paymentMethod: formData.paymentMethod,
          totalAmount: order.totalAmount,
        }),
      });

      const checkoutData = await checkoutResponse.json();

      if (!checkoutData.success) {
        toast.error(checkoutData.message || "Payment initiation failed");
        setLoading(false);
        return;
      }

      // Redirect to payment gateway
      if (formData.paymentMethod === "sslcommerz") {
        window.location.href = checkoutData.data.redirectUrl;
      } else if (formData.paymentMethod === "stripe") {
        window.location.href = checkoutData.data.checkoutUrl;
      }

      // Clear cart after successful submission
      clearCart();
    } catch (error) {
      toast.error(error.message || "An error occurred");
      setLoading(false);
    }
  };

  const totalPrice = getTotalPrice();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-8 text-3xl font-bold">Checkout</h1>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Left: Form */}
        <div>
          <form onSubmit={handleSubmit} className="space-y-4 bg-gray-50 p-6 rounded">
            <h2 className="text-xl font-semibold mb-4">Shipping Address</h2>

            <div>
              <label className="block text-sm font-medium mb-2">Full Name</label>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                placeholder="Enter your full name"
                className="w-full px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Phone Number</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="Enter your phone (e.g., 01XXXXXXXXX)"
                className="w-full px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Address</label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Enter your street address"
                className="w-full px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">City</label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="Enter your city"
                className="w-full px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <h2 className="text-xl font-semibold mt-6 mb-4">Payment Method</h2>

            <div className="space-y-3">
              <label className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-100">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="sslcommerz"
                  checked={formData.paymentMethod === "sslcommerz"}
                  onChange={handleChange}
                  className="mr-3"
                />
                <span>SSLCommerz (Bangladesh)</span>
              </label>

              <label className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-100">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="stripe"
                  checked={formData.paymentMethod === "stripe"}
                  onChange={handleChange}
                  className="mr-3"
                />
                <span>Stripe</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-accent px-6 py-3 text-white font-semibold hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed mt-6"
            >
              {loading ? "Processing..." : "Place Order"}
            </button>
          </form>
        </div>

        {/* Right: Order Summary */}
        <div>
          <div className="sticky top-4 bg-gray-50 p-6 rounded">
            <h2 className="text-xl font-semibold mb-4">Order Summary</h2>

            {/* Cart Items */}
            <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item._id}
                  className="flex justify-between items-center pb-3 border-b"
                >
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-gray-600">
                      Qty: {item.quantity} × {formatCurrency(item.price)}
                    </p>
                  </div>
                  <p className="font-semibold">
                    {formatCurrency(item.price * item.quantity)}
                  </p>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{formatCurrency(totalPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span>Shipping:</span>
                <span>Free</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
                <span>Total:</span>
                <span>{formatCurrency(totalPrice)}</span>
              </div>
            </div>

            {/* Continue Shopping Link */}
            <button
              onClick={() => router.push("/products")}
              className="w-full mt-4 text-primary hover:underline text-sm"
            >
              ← Continue Shopping
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}