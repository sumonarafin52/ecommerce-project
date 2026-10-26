// components/order/TrackingTimeline.jsx
//
// What the customer sees about their delivery, on the public /track page and
// in their profile.
//
// An order can ship in parts, so this renders a progress bar per parcel plus
// whatever is still waiting to go out. It takes the shape from
// lib/customerTracking.js; the `shipment` prop is still accepted so an order
// that only has the old singular field keeps working.
"use client";

const STAGES = [
  { key: "confirmed", label: "Order Confirmed" },
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped" },
  { key: "in_transit", label: "In Transit" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
];

// Not stages on the bar — showing an all-grey bar for these would read as
// "nothing has happened yet" when in fact something went wrong.
const EXCEPTIONS = {
  failed: "Delivery was attempted but didn't succeed",
  returned: "On its way back to us",
  cancelled: "This delivery was cancelled",
};

function formatDateTime(d) {
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(d) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function ProgressBar({ status }) {
  const currentIndex = STAGES.findIndex((s) => s.key === status);

  // The connecting line is its own row above the labels rather than a margin
  // pulled up behind them — a label that wraps to two lines ("Out for
  // Delivery" in a narrow column) used to have the line struck through it.
  return (
    <div className="space-y-1.5">
      <div className="relative flex items-center justify-between">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-zinc-700" aria-hidden="true" />
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-accent transition-all"
          style={{ width: `${Math.max(0, currentIndex) / (STAGES.length - 1) * 100}%` }}
          aria-hidden="true"
        />
        {STAGES.map((stage, i) => (
          <div
            key={stage.key}
            className={`relative w-3 h-3 rounded-full ${i <= currentIndex ? "bg-accent" : "bg-zinc-700"}`}
          />
        ))}
      </div>
      <div className="flex items-start justify-between gap-1">
        {STAGES.map((stage, i) => (
          <span
            key={stage.key}
            className={`flex-1 text-[10px] font-bold leading-tight text-center ${
              i <= currentIndex ? "text-accent" : "text-zinc-500"
            } ${i === 0 ? "text-left" : ""} ${i === STAGES.length - 1 ? "text-right" : ""}`}
          >
            {stage.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Shipment({ shipment, showHeading }) {
  const exception = EXCEPTIONS[shipment.status];

  return (
    <div className={showHeading ? "rounded-lg border border-white/10 p-3 space-y-3" : "space-y-3"}>
      {showHeading && (
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-bold text-white">{shipment.label}</p>
          {shipment.items.length > 0 && (
            <p className="text-[11px] text-zinc-500 text-right">
              {shipment.items.map((it) => `${it.name} × ${it.quantity}`).join(", ")}
            </p>
          )}
        </div>
      )}

      {exception ? (
        <p className="text-sm font-bold text-rose-400">{exception}.</p>
      ) : (
        <ProgressBar status={shipment.status} />
      )}

      {shipment.trackingNumber && (
        <p className="text-xs text-zinc-400">
          Tracking #: <span className="font-bold text-white">{shipment.trackingNumber}</span>
          {shipment.carrierName && <> via {shipment.carrierName}</>}
          {shipment.trackingUrl && (
            <>
              {" · "}
              <a
                href={shipment.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent font-bold hover:underline"
              >
                Track on carrier site ↗
              </a>
            </>
          )}
        </p>
      )}
      {!shipment.trackingNumber && shipment.carrierName && (
        <p className="text-xs text-zinc-400">
          Carrier: <span className="font-bold text-white">{shipment.carrierName}</span>
        </p>
      )}
      {shipment.estimatedDelivery && (
        <p className="text-xs text-zinc-400">
          Estimated delivery: <span className="font-bold text-white">{formatDate(shipment.estimatedDelivery)}</span>
        </p>
      )}

      {shipment.timeline?.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-white/10">
          {shipment.timeline
            .slice()
            .reverse()
            .map((ev, i) => (
              <div key={i} className="text-xs">
                <p className="font-bold text-white capitalize">{String(ev.status).replace(/_/g, " ")}</p>
                <p className="text-zinc-500">
                  {formatDateTime(ev.at)}
                  {ev.location ? ` · ${ev.location}` : ""}
                </p>
                {ev.note && <p className="text-zinc-400 mt-0.5">{ev.note}</p>}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export default function TrackingTimeline({ orderStatus, shipments, awaitingShipment = [], shipment }) {
  // `shipment` (singular) is what the older callers passed. Accept it so an
  // order with only the legacy field still renders.
  const parcels = shipments?.length
    ? shipments
    : shipment && (shipment.trackingNumber || shipment.carrier || shipment.timeline?.length)
    ? [
        {
          id: "legacy",
          label: "",
          status: shipment.timeline?.at(-1)?.status || "confirmed",
          carrierName: shipment.carrier?.name || "",
          trackingNumber: shipment.trackingNumber || "",
          trackingUrl: "",
          estimatedDelivery: shipment.estimatedDelivery || null,
          items: [],
          timeline: shipment.timeline || [],
        },
      ]
    : [];

  // Order-level states that override anything the parcels say.
  if (orderStatus === "cancelled") {
    return <p className="text-sm font-bold text-rose-400">This order was cancelled.</p>;
  }
  if (orderStatus === "on_hold") {
    return <p className="text-sm font-bold text-amber-400">This order is on hold. Our team will reach out shortly.</p>;
  }
  if (orderStatus === "returned") {
    return <p className="text-sm font-bold text-amber-400">This order was returned.</p>;
  }
  if (orderStatus === "pending" && !parcels.length) {
    return <p className="text-sm font-bold text-zinc-400">Awaiting payment confirmation.</p>;
  }

  // Nothing has shipped yet, but the order is live — show the early stages
  // rather than an empty panel.
  if (!parcels.length) {
    return (
      <div className="space-y-3">
        <ProgressBar status={orderStatus === "processing" ? "processing" : "confirmed"} />
        <p className="text-xs text-zinc-400">We&apos;ll add tracking details here as soon as your order is handed to the courier.</p>
      </div>
    );
  }

  const multiple = parcels.length > 1;

  return (
    <div className="space-y-4">
      {multiple && (
        <p className="text-xs text-zinc-400">
          This order is being delivered in {parcels.length} shipments.
        </p>
      )}
      <div className={multiple ? "space-y-3" : ""}>
        {parcels.map((p, i) => (
          <Shipment key={p.id || i} shipment={p} showHeading={multiple} />
        ))}
      </div>

      {awaitingShipment.length > 0 && (
        <div className="rounded-lg border border-dashed border-white/15 p-3">
          <p className="text-xs font-bold text-white mb-1">Still to be shipped</p>
          <p className="text-[11px] text-zinc-400">
            {awaitingShipment.map((it) => `${it.name} × ${it.quantity}`).join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}
