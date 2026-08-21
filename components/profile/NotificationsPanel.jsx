// components/profile/NotificationsPanel.jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

const TYPE_ICON = {
  order_status: "📦",
  payment: "💳",
  shipment: "🚚",
  refund: "💰",
  account: "👤",
  promo: "🏷️",
};

export default function NotificationsPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setItems(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const markRead = async (item) => {
    if (item.read) return;
    setItems((list) => list.map((n) => (n._id === item._id ? { ...n, read: true } : n)));
    try {
      await fetch(`/api/notifications/${item._id}`, { method: "PUT" });
    } catch {}
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    try {
      await fetch("/api/notifications/read-all", { method: "PUT" });
    } catch {}
    setMarkingAll(false);
  };

  const unreadCount = items.filter((n) => !n.read).length;

  if (loading) {
    return (
      <div className="bg-cream-white border border-line rounded-xl p-6 flex items-center justify-center py-14">
        <div className="w-7 h-7 border-2 border-indigo-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-cream-white border border-line rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[17px] font-bold text-ink">Notifications</h3>
        {unreadCount > 0 && (
          <button onClick={markAllRead} disabled={markingAll} className="text-xs font-bold text-indigo-900 hover:underline disabled:opacity-50">
            Mark all as read
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-14 text-ink-muted border border-dashed border-line rounded-xl">
          <span className="text-3xl">🔔</span>
          <p className="mt-3">No notifications yet.</p>
          <p className="text-xs mt-1">Order and account updates will show up here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Link
              key={n._id}
              href={n.link || "/profile"}
              onClick={() => markRead(n)}
              className={`block rounded-lg px-4 py-3 border transition-colors ${
                n.read ? "border-line hover:border-indigo-700/30" : "border-indigo-300 bg-indigo-100/40 hover:bg-indigo-100/60"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg leading-none mt-0.5">{TYPE_ICON[n.type] || "🔔"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-ink">{n.title}</p>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-brick shrink-0" />}
                  </div>
                  <p className="text-xs text-ink-soft mt-0.5">{n.message}</p>
                  <p className="text-[11px] text-ink-muted mt-1">{formatDate(n.createdAt)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
