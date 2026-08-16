// app/profile/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { formatCurrency, formatDate } from "@/lib/utils";
import TrackingTimeline from "@/components/order/TrackingTimeline";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/orderStatus";

const badge = (color) => `px-2.5 py-1 rounded-full text-[11px] font-bold capitalize ${color}`;

const payColors = {
  paid: "bg-green-100 text-green-700",
  pending: "bg-gold-light text-gold-dark",
  failed: "bg-brick/10 text-brick",
  refunded: "bg-line/60 text-ink-muted",
};

// Honest placeholder — no fake data, just says the feature is on its way.
// Swap this for the real UI once the backend for that section exists.
function PlaceholderPanel({ icon, title, text }) {
  return (
    <div className="bg-cream-white border border-line rounded-xl p-6">
      <div className="text-center py-14 border border-dashed border-line rounded-xl">
        <span className="text-3xl">{icon}</span>
        <h3 className="font-display text-lg font-semibold text-ink mt-3">{title}</h3>
        <p className="text-sm text-ink-muted mt-1.5 max-w-xs mx-auto">{text}</p>
        <span className="inline-block mt-4 text-[11px] font-bold uppercase tracking-wide text-gold-dark bg-gold-light px-3 py-1 rounded-full">
          Coming soon
        </span>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paymentMsg, setPaymentMsg] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [trackingOpenId, setTrackingOpenId] = useState("");
  const [trackingData, setTrackingData] = useState({});
  const [digitalDownloads, setDigitalDownloads] = useState({});
  const [downloadingId, setDownloadingId] = useState("");
  // NOTE: every hook in this component must stay above the loading/no-session
  // early returns below (Rules of Hooks — calling a hook only on some
  // renders makes React lose track of hook order and throw).
  const [tab, setTab] = useState("overview");

  const toggleTracking = async (orderId) => {
    if (trackingOpenId === orderId) {
      setTrackingOpenId("");
      return;
    }
    setTrackingOpenId(orderId);
    if (!trackingData[orderId]) {
      const res = await fetch(`/api/orders/${orderId}/shipment`).then((r) => r.json());
      if (res.success) setTrackingData((d) => ({ ...d, [orderId]: res.data }));
    }
  };

  const startDownload = async (orderId, productId, fileUrl) => {
    setDownloadingId(productId);
    try {
      // records the download (increments the admin-side counter) before
      // actually opening the file
      const res = await fetch(`/api/orders/${orderId}/downloads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      }).then((r) => r.json());
      window.open(res.success ? res.data.fileUrl : fileUrl, "_blank", "noopener,noreferrer");
    } catch {
      window.open(fileUrl, "_blank", "noopener,noreferrer");
    }
    setDownloadingId("");
  };

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
    } else if (payment === "RATE_LIMITED") {
      setPaymentMsg({ type: "bad", text: "Too many payment attempts — please wait a few minutes and try again." });
    }
  }, []);

  const loadOrders = () => {
    fetch("/api/orders")
      .then((r) => r.json())
      .then((res) => {
        const list = res.success ? (Array.isArray(res.data) ? res.data : res.data.orders || []) : [];
        setOrders(list);
        // check paid orders for digital items to download — a plain list
        // check, doesn't count as a "download" (see the API route)
        list
          .filter((o) => o.paymentStatus === "paid")
          .forEach((o) => {
            fetch(`/api/orders/${o._id}/downloads`)
              .then((r) => r.json())
              .then((dres) => {
                if (dres.success && dres.data.length) {
                  setDigitalDownloads((d) => ({ ...d, [o._id]: dres.data }));
                }
              })
              .catch(() => {});
          });
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
      <div className="bg-cream-bg min-h-screen flex items-center justify-center font-body2">
        <div className="w-10 h-10 border-4 border-indigo-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="bg-cream-bg min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4 font-body2">
        <p className="text-xl font-bold text-ink">Login required</p>
        <p className="text-sm text-ink-muted">Please sign in to view your profile and orders.</p>
        <Link href="/login" className="bg-gold hover:bg-gold-dark text-indigo-950 font-bold px-6 py-3 rounded-lg transition-colors">
          Sign in
        </Link>
      </div>
    );
  }

  // real, computed stats — no fabricated wishlist/rewards data
  const totalOrders = orders.length;
  const inTransit = orders.filter((o) => o.orderStatus === "shipped").length;
  const delivered = orders.filter((o) => o.orderStatus === "delivered").length;
  const totalSpent = orders.filter((o) => o.paymentStatus === "paid").reduce((s, o) => s + o.totalAmount, 0);

  const navItemCls = (active) =>
    `flex items-center gap-2.5 px-3.5 py-3 rounded-lg text-[13.5px] font-semibold transition-colors w-full text-left ${
      active ? "bg-indigo-100 text-indigo-900" : "text-ink-soft hover:bg-cream-alt"
    }`;

  const navItems = [
    { key: "overview", label: "Profile Overview", icon: "👤" },
    { key: "addresses", label: "Addresses", icon: "📍" },
    { key: "wishlist", label: "Wishlist", icon: "🤍" },
    { key: "payment", label: "Payment Methods", icon: "💳" },
    { key: "notifications", label: "Notifications", icon: "🔔" },
    { key: "settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <div className="bg-cream-bg min-h-screen font-body2">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <nav className="text-[13px] text-ink-muted flex items-center gap-2 mb-4">
          <Link href="/" className="hover:text-indigo-900">Home</Link>
          <span>›</span>
          <span className="text-ink">My Account</span>
        </nav>

        <div className="grid lg:grid-cols-[260px_1fr] gap-7 pb-14">
          <aside className="bg-cream-white border border-line rounded-xl p-2.5 h-fit lg:sticky lg:top-4 space-y-0.5">
            {navItems.map((item) => (
              <button key={item.key} onClick={() => setTab(item.key)} className={navItemCls(tab === item.key)}>
                {item.icon} {item.label}
              </button>
            ))}
            <div className="border-t border-line my-1.5" />
            <button onClick={() => signOut()} className={navItemCls(false) + " text-brick hover:bg-brick/5"}>
              ⏻ Sign Out
            </button>
          </aside>

          {tab === "overview" && (
          <div>
            {paymentMsg && (
              <p
                className={`text-sm font-semibold rounded-lg px-4 py-3 border mb-5 ${
                  paymentMsg.type === "ok"
                    ? "text-green-700 bg-green-50 border-green-200"
                    : "text-brick bg-brick/5 border-brick/20"
                }`}
              >
                {paymentMsg.text}
              </p>
            )}

            <div className="bg-gradient-to-br from-indigo-950 to-indigo-700 rounded-xl p-6 flex items-center gap-4 text-white mb-6">
              <div className="w-16 h-16 rounded-full bg-gold text-indigo-950 flex items-center justify-center text-2xl font-extrabold shrink-0">
                {session.user?.name?.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-[19px] font-bold">{session.user?.name}</p>
                <p className="text-[13px] text-cream-bg/70 mt-0.5">{session.user?.email}</p>
                <span className="inline-block mt-2.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/15 capitalize">
                  {session.user?.role}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              {[
                { num: totalOrders, lbl: "Total Orders" },
                { num: inTransit, lbl: "In Transit" },
                { num: delivered, lbl: "Delivered" },
                { num: formatCurrency(totalSpent), lbl: "Total Spent" },
              ].map((s) => (
                <div key={s.lbl} className="bg-cream-white border border-line rounded-xl p-4">
                  <div className="font-display text-2xl font-bold text-indigo-900">{s.num}</div>
                  <div className="text-[12.5px] text-ink-muted mt-1">{s.lbl}</div>
                </div>
              ))}
            </div>

            <div className="bg-cream-white border border-line rounded-xl p-6">
              <h3 className="text-[17px] font-bold text-ink mb-4">My Orders</h3>

              {orders.length === 0 ? (
                <div className="text-center py-14 text-ink-muted border border-dashed border-line rounded-xl">
                  <p className="mb-3">No orders yet.</p>
                  <Link href="/products" className="text-indigo-900 hover:underline text-sm font-bold">
                    Start shopping
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div key={order._id} className="bg-cream-alt/40 border border-line rounded-xl p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-ink">Order #{(order._id || "").slice(-6).toUpperCase()}</p>
                          <p className="text-xs text-ink-muted mt-0.5">
                            {formatDate(order.createdAt)} • {order.shippingAddress?.city} •{" "}
                            {order.paymentMethod === "cod" ? "Cash on Delivery" : "SSLCommerz"}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <span className={badge(payColors[order.paymentStatus] || payColors.pending)}>{order.paymentStatus}</span>
                          <span className={badge(ORDER_STATUS_COLORS[order.orderStatus] || ORDER_STATUS_COLORS.processing)}>
                            {ORDER_STATUS_LABELS[order.orderStatus] || order.orderStatus}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {order.items.map((it, idx) => (
                          <div key={idx} className="flex justify-between items-center text-sm text-ink-soft">
                            <span className="flex items-center gap-2 flex-wrap">
                              {it.name} <span className="text-ink-muted">× {it.quantity}</span>
                              {/* delivered + not reviewed = review option */}
                              {order.orderStatus === "delivered" && !order.reviewed && (
                                <button
                                  onClick={() => {
                                    setReview({ productId: it.product, productName: it.name });
                                    setRating(5);
                                    setComment("");
                                    setReviewMsg("");
                                  }}
                                  className="text-[11px] font-bold text-indigo-900 border border-indigo-700/30 rounded-full px-2 py-0.5 hover:bg-indigo-100 transition-colors"
                                >
                                  ★ Write Review
                                </button>
                              )}
                            </span>
                            <span className="font-semibold text-ink">{formatCurrency(it.price * it.quantity)}</span>
                          </div>
                        ))}
                        {order.orderStatus === "delivered" && order.reviewed && (
                          <p className="text-[11px] text-green-700 font-bold">✓ Reviewed — dhonnobad!</p>
                        )}
                      </div>

                      <div className="border-t border-line pt-2.5 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3 text-sm flex-wrap">
                          <span className="text-ink-muted">Total</span>
                          <span className="font-bold text-indigo-900">{formatCurrency(order.totalAmount)}</span>
                          <a
                            href={`/invoice/${order._id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-bold text-ink-muted hover:text-indigo-900 underline underline-offset-2"
                          >
                            Invoice
                          </a>
                          {!["cancelled", "returned"].includes(order.orderStatus) && (
                            <button
                              onClick={() => toggleTracking(order._id)}
                              className="text-xs font-bold text-ink-muted hover:text-indigo-900 underline underline-offset-2"
                            >
                              {trackingOpenId === order._id ? "Hide tracking" : "Track"}
                            </button>
                          )}
                        </div>

                        {/* shipped = customer confirm receipt option */}
                        {order.orderStatus === "shipped" && (
                          <button
                            onClick={() => confirmReceipt(order._id)}
                            disabled={busyId === order._id}
                            className="bg-green-700 hover:bg-green-800 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {busyId === order._id ? "Confirming..." : "✓ Confirm Receipt"}
                          </button>
                        )}
                        {order.orderStatus === "delivered" && (
                          <span className="text-[11px] text-green-700 font-bold">
                            Delivered {order.deliveredAt ? `on ${formatDate(order.deliveredAt)}` : ""}
                          </span>
                        )}
                      </div>

                      {digitalDownloads[order._id]?.length > 0 && (
                        <div className="border-t border-line pt-3 space-y-2">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">⚡ Digital Downloads</p>
                          {digitalDownloads[order._id].map((d) => (
                            <button
                              key={d.productId}
                              onClick={() => startDownload(order._id, d.productId, d.fileUrl)}
                              disabled={downloadingId === d.productId}
                              className="w-full flex items-center justify-between bg-indigo-100 border border-indigo-700/20 rounded-lg px-3 py-2 text-left hover:bg-indigo-100/70 transition-colors disabled:opacity-50"
                            >
                              <span className="text-xs font-bold text-indigo-950">{d.name}</span>
                              <span className="text-[11px] font-bold text-indigo-900">
                                {downloadingId === d.productId ? "Opening..." : "Download ↓"}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {trackingOpenId === order._id && (
                        <div className="border-t border-line pt-3">
                          {trackingData[order._id] ? (
                            <div className="bg-indigo-950 rounded-lg p-4">
                              <TrackingTimeline
                                orderStatus={trackingData[order._id].orderStatus}
                                shipment={trackingData[order._id].shipment}
                              />
                            </div>
                          ) : (
                            <p className="text-xs text-ink-muted">Loading tracking...</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          )}

          {tab === "addresses" && <PlaceholderPanel icon="📍" title="Addresses" text="Saved delivery addresses will appear here once this feature is added." />}
          {tab === "wishlist" && <PlaceholderPanel icon="🤍" title="Wishlist" text="Products you save will appear here once this feature is added." />}
          {tab === "payment" && <PlaceholderPanel icon="💳" title="Payment Methods" text="Saved cards and payment options will appear here once this feature is added." />}
          {tab === "notifications" && <PlaceholderPanel icon="🔔" title="Notifications" text="Order and account updates will appear here once this feature is added." />}
          {tab === "settings" && <PlaceholderPanel icon="⚙️" title="Settings" text="Account preferences will appear here once this feature is added." />}
        </div>
      </div>

      {/* ===== REVIEW MODAL ===== */}
      {review && (
        <div className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-4">
          <form onSubmit={submitReview} className="w-full max-w-md bg-cream-white border border-line rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">Review: {review.productName}</h2>
              <button type="button" onClick={() => setReview(null)} className="text-ink-muted hover:text-ink text-lg" aria-label="Close">
                ✕
              </button>
            </div>

            {reviewMsg && (
              <p className="text-sm font-semibold text-brick bg-brick/10 border border-brick/30 rounded-lg px-4 py-3">{reviewMsg}</p>
            )}

            <div className="flex gap-1 justify-center py-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} stars`}>
                  <svg className={`w-8 h-8 transition-colors ${n <= rating ? "text-gold" : "text-line"}`} fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.07 3.29a1 1 0 00.95.69h3.46c.97 0 1.37 1.24.59 1.81l-2.8 2.03a1 1 0 00-.36 1.12l1.07 3.29c.3.92-.76 1.69-1.54 1.12l-2.8-2.03a1 1 0 00-1.18 0l-2.8 2.03c-.78.57-1.84-.2-1.54-1.12l1.07-3.29a1 1 0 00-.36-1.12L2.98 8.72c-.78-.57-.38-1.81.59-1.81h3.46a1 1 0 00.95-.69l1.07-3.29z" />
                  </svg>
                </button>
              ))}
            </div>
            <p className="text-center text-sm text-ink-muted">
              {rating === 5 && "Excellent!"}
              {rating === 4 && "Very good"}
              {rating === 3 && "Average"}
              {rating === 2 && "Not good"}
              {rating === 1 && "Bad"}
            </p>

            <textarea
              className="w-full border-[1.5px] border-line rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none focus:border-indigo-900 transition-colors"
              rows={3}
              placeholder="Write your experience (optional)..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setReview(null)}
                className="flex-1 border-[1.5px] border-line text-ink-soft hover:border-indigo-700/50 font-bold py-2.5 rounded-lg text-sm transition-colors"
              >
                Skip
              </button>
              <button
                type="submit"
                disabled={reviewing}
                className="flex-1 bg-gold hover:bg-gold-dark text-indigo-950 font-bold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
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
