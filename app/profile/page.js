// app/profile/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatCurrency, formatDate } from "@/lib/utils";

const badge = (color) => `px-2.5 py-1 rounded-full text-[11px] font-bold capitalize ${color}`;

const payColors = {
  paid: "bg-green-500/15 text-green-400",
  pending: "bg-accent/15 text-accent",
  failed: "bg-red-500/15 text-red-400",
  refunded: "bg-zinc-500/15 text-zinc-400",
};

const orderColors = {
  processing: "bg-accent/15 text-accent",
  shipped: "bg-blue-500/15 text-blue-400",
  delivered: "bg-green-500/15 text-green-400",
  cancelled: "bg-red-500/15 text-red-400",
};

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paymentMsg, setPaymentMsg] = useState(null);

  useEffect(() => {
    // SSLCommerz redirects back here with a payment status
    const payment = new URLSearchParams(window.location.search).get("payment");
    if (payment === "VALID" || payment === "VALIDATED") {
      setPaymentMsg({ type: "ok", text: "Payment successful! Your order is being processed." });
    } else if (payment === "FAILED") {
      setPaymentMsg({ type: "bad", text: "Payment failed. Please try again." });
    } else if (payment === "CANCELLED") {
      setPaymentMsg({ type: "bad", text: "Payment cancelled. Your order is still pending." });
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      setLoading(false);
      return;
    }
    fetch("/api/orders")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setOrders(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status]);

  if (status === "loading" || loading) {
    return (
      <div className="bg-primary min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="bg-primary min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-xl font-bold text-white">Login required</p>
        <p className="text-sm text-zinc-400">Please sign in to view your profile and orders.</p>
        <Link
          href="/login"
          className="bg-accent hover:bg-accent/80 text-primary font-bold px-6 py-3 rounded-md transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-white">My Profile</h1>

        {paymentMsg && (
          <p
            className={`text-sm font-medium rounded-md px-4 py-3 border ${
              paymentMsg.type === "ok"
                ? "text-green-400 bg-green-500/10 border-green-500/30"
                : "text-red-400 bg-red-500/10 border-red-500/30"
            }`}
          >
            {paymentMsg.text}
          </p>
        )}

        <div className="bg-primary-light border border-white/10 rounded-xl p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-accent/15 border border-accent/40 flex items-center justify-center text-accent text-xl font-extrabold">
            {session.user?.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-white">{session.user?.name}</p>
            <p className="text-sm text-zinc-400">{session.user?.email}</p>
          </div>
          <span className="ml-auto px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-accent/15 text-accent">
            {session.user?.role}
          </span>
        </div>

        <section>
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-accent rounded-full" />
            My Orders
          </h2>

          {orders.length === 0 ? (
            <div className="text-center py-14 text-zinc-400 border border-dashed border-white/10 rounded-xl">
              <p className="mb-3">No orders yet.</p>
              <Link href="/products" className="text-accent hover:underline text-sm font-bold">
                Start shopping
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div key={order._id} className="bg-primary-light border border-white/10 rounded-xl p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-white">
                        Order #{order._id.slice(-6).toUpperCase()}
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {formatDate(order.createdAt)} • {order.shippingAddress.city}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <span className={badge(payColors[order.paymentStatus] || payColors.pending)}>
                        {order.paymentStatus}
                      </span>
                      <span className={badge(orderColors[order.orderStatus] || orderColors.processing)}>
                        {order.orderStatus}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {order.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between text-sm text-zinc-300">
                        <span>
                          {it.name} <span className="text-zinc-500">× {it.quantity}</span>
                        </span>
                        <span>{formatCurrency(it.price * it.quantity)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-white/10 pt-2 flex justify-between text-sm">
                    <span className="text-zinc-400">Total</span>
                    <span className="font-bold text-accent">{formatCurrency(order.totalAmount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}