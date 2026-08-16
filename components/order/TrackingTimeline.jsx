// components/order/TrackingTimeline.jsx
"use client";

const STAGES = [
  { key: "confirmed", label: "Order Confirmed" },
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped" },
  { key: "in_transit", label: "In Transit" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
];

function formatDateTime(d) {
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TrackingTimeline({ orderStatus, shipment }) {
  const timeline = shipment?.timeline || [];
  const latestStatus = timeline.length
    ? timeline[timeline.length - 1].status
    : ["cancelled", "pending"].includes(orderStatus)
    ? null
    : "confirmed";
  const failedOrReturned = ["failed", "returned"].includes(latestStatus);
  const currentIndex = STAGES.findIndex((s) => s.key === latestStatus);

  return (
    <div className="space-y-4">
      {orderStatus === "cancelled" ? (
        <p className="text-sm font-bold text-rose-400">This order was cancelled.</p>
      ) : orderStatus === "on_hold" ? (
        <p className="text-sm font-bold text-amber-400">This order is on hold. Our team will reach out shortly.</p>
      ) : orderStatus === "returned" ? (
        <p className="text-sm font-bold text-amber-400">This order was returned.</p>
      ) : orderStatus === "pending" && !timeline.length ? (
        <p className="text-sm font-bold text-zinc-400">Awaiting payment confirmation.</p>
      ) : failedOrReturned ? (
        <p className="text-sm font-bold text-rose-400 capitalize">Delivery {latestStatus}</p>
      ) : (
        <div className="flex items-center justify-between gap-1">
          {STAGES.map((stage, i) => (
            <div key={stage.key} className="flex-1 flex flex-col items-center text-center">
              <div
                className={`w-3 h-3 rounded-full mb-1.5 ${
                  i <= currentIndex ? "bg-accent" : "bg-zinc-700"
                }`}
              />
              <span className={`text-[10px] font-bold leading-tight ${i <= currentIndex ? "text-accent" : "text-zinc-500"}`}>
                {stage.label}
              </span>
              {i < STAGES.length - 1 && (
                <div className={`hidden sm:block h-0.5 w-full mt-[-14px] ${i < currentIndex ? "bg-accent" : "bg-zinc-700"}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {shipment?.trackingNumber && (
        <p className="text-xs text-zinc-400">
          Tracking #: <span className="font-bold text-white">{shipment.trackingNumber}</span>
          {shipment.carrier?.name && <> via {shipment.carrier.name}</>}
        </p>
      )}
      {shipment?.estimatedDelivery && (
        <p className="text-xs text-zinc-400">
          Estimated delivery: <span className="font-bold text-white">{new Date(shipment.estimatedDelivery).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
        </p>
      )}

      {timeline.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-white/10">
          {timeline.slice().reverse().map((ev, i) => (
            <div key={i} className="text-xs">
              <p className="font-bold text-white capitalize">{ev.status.replace(/_/g, " ")}</p>
              <p className="text-zinc-500">{formatDateTime(ev.at)}{ev.location ? ` · ${ev.location}` : ""}</p>
              {ev.note && <p className="text-zinc-400 mt-0.5">{ev.note}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
