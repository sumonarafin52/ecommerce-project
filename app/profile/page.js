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
  const [busyId, setBusyId] = useState("");

  const [review, setReview] = useState(null); // { productId, productName }
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [reviewMsg, setReviewMsg] = useState("");

  useEffect(() => {
    const payment = new URLSearchParams(window.location.search).get("payment");
    if (payment === "VALID" || payment === "VALIDATED") {
      setPaymentMsg({ type: "ok", text: "Payment successful! Your order is being processed." });
    } else if (payment === "FAILED") {
      setPaymentMsg({ type: "bad", text: "Payment failed. Please try again." });
    } else if (payment === "CANCELLED") {
      setPaymentMsg({ type: "bad", text: "Payment cancelled. Your order is still pending." });
    }
  }, []);

  const loadOrders = () => {
    fetch("/api/orders")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setOrders(Array.isArray(res.data) ? res.data : res.data.orders || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (status === "authenticated") loadOrders();
    else setLoading(false);
  }, [status]);

  const confirmReceipt = async (id) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmReceipt: true }),
      }).then((r) => r.json());
      if (res.success) loadOrders();
      else alert(res.message);
    } catch {
      alert("Failed to confirm receipt");
    }
    setBusyId("");
  };

  const submitReview = async (e) => {
    e.preventDefault();
    setReviewing(true);
    setReviewMsg("");
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: review.productId, rating, comment }),
      }).then((r) => r.json());
      if (res.success) {
        setReview(null);
        setComment("");
        setRating(5);
        loadOrders();
      } else {
        setReviewMsg(res.message);
      }
    } catch {
      setReviewMsg("Failed to submit review");
    }
    setReviewing(false);
  };

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
        <Link href="/login" className="bg-accent hover:bg-accent/80 text-primary font-bold px-6 py-3 rounded-md transition-colors">
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
                      <p className="text-sm font-bold text-white">Order #{(order._id || "").slice(-6).toUpperCase()}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {formatDate(order.createdAt)} • {order.shippingAddress?.city} •{" "}
                        {order.paymentMethod === "cod" ? "Cash on Delivery" : "SSLCommerz"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <span className={badge(payColors[order.paymentStatus] || payColors.pending)}>{order.paymentStatus}</span>
                      <span className={badge(orderColors[order.orderStatus] || orderColors.processing)}>{order.orderStatus}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {order.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between items-center text-sm text-zinc-300">
                        <span className="flex items-center gap-2">
                          {it.name} <span className="text-zinc-500">× {it.quantity}</span>
                          {/* delivered + not reviewed = review option */}
                          {order.orderStatus === "delivered" && !order.reviewed && (
                            <button
                              onClick={() => {
                                setReview({ productId: it.product, productName: it.name });
                                setRating(5);
                                setComment("");
                                setReviewMsg("");
                              }}
                              className="text-[11px] font-bold text-accent border border-accent/40 rounded-full px-2 py-0.5 hover:bg-accent/10 transition-colors"
                            >
                              ★ Write Review
                            </button>
                          )}
                        </span>
                        <span>{formatCurrency(it.price * it.quantity)}</span>
                      </div>
                    ))}
                    {order.orderStatus === "delivered" && order.reviewed && (
                      <p className="text-[11px] text-green-400 font-bold">✓ Reviewed — dhonnobad!</p>
                    )}
                  </div>

                  <div className="border-t border-white/10 pt-2 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-zinc-400">Total</span>
                      <span className="font-bold text-accent">{formatCurrency(order.totalAmount)}</span>
                    </div>

                    {/* shipped = customer confirm receipt option */}
                    {order.orderStatus === "shipped" && (
                      <button
                        onClick={() => confirmReceipt(order._id)}
                        disabled={busyId === order._id}
                        className="bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-4 py-2 rounded-md transition-colors disabled:opacity-50"
                      >
                        {busyId === order._id ? "Confirming..." : "✓ Confirm Receipt"}
                      </button>
                    )}
                    {order.orderStatus === "delivered" && (
                      <span className="text-[11px] text-green-400 font-bold">
                        Delivered {order.deliveredAt ? `on ${formatDate(order.deliveredAt)}` : ""}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ===== REVIEW MODAL ===== */}
      {review && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form onSubmit={submitReview} className="w-full max-w-md bg-primary-light border border-white/10 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Review: {review.productName}</h2>
              <button type="button" onClick={() => setReview(null)} className="text-zinc-400 hover:text-white text-lg" aria-label="Close">
                ✕
              </button>
            </div>

            {reviewMsg && (
              <p className="text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-4 py-3">{reviewMsg}</p>
            )}

            <div className="flex gap-1 justify-center py-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} stars`}>
                  <svg className={`w-8 h-8 transition-colors ${n <= rating ? "text-accent" : "text-zinc-600"}`} fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.07 3.29a1 1 0 00.95.69h3.46c.97 0 1.37 1.24.59 1.81l-2.8 2.03a1 1 0 00-.36 1.12l1.07 3.29c.3.92-.76 1.69-1.54 1.12l-2.8-2.03a1 1 0 00-1.18 0l-2.8 2.03c-.78.57-1.84-.2-1.54-1.12l1.07-3.29a1 1 0 00-.36-1.12L2.98 8.72c-.78-.57-.38-1.81.59-1.81h3.46a1 1 0 00.95-.69l1.07-3.29z" />
                  </svg>
                </button>
              ))}
            </div>
            <p className="text-center text-sm text-zinc-400">
              {rating === 5 && "Excellent!"}
              {rating === 4 && "Very good"}
              {rating === 3 && "Average"}
              {rating === 2 && "Not good"}
              {rating === 1 && "Bad"}
            </p>

            <textarea
              className="w-full bg-primary border border-white/15 rounded-md px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent transition-colors"
              rows={3}
              placeholder="Write your experience (optional)..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setReview(null)}
                className="flex-1 border border-white/15 text-zinc-300 hover:border-white/40 font-bold py-2.5 rounded-md text-sm transition-colors"
              >
                Skip
              </button>
              <button
                type="submit"
                disabled={reviewing}
                className="flex-1 bg-accent hover:bg-accent/80 text-primary font-bold py-2.5 rounded-md text-sm transition-colors disabled:opacity-50"
              >
                {reviewing ? "Submitting..." : "Submit Review"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}