// components/admin/ui/BarChart.jsx
//
// The admin's one bar chart.
//
// What it replaces was a row of bare <div>s scaled to the tallest value:
// no axis, no gridlines, no dates, and no way to read a figure off it. With
// a single busy day in the range it drew one full-height bar and thirty
// 2px slivers — a shape that tells an owner nothing they didn't already
// know.
//
// Deliberately one series. Two measures on two y-scales in one frame is the
// most common way a chart lies about a relationship; orders ride along in
// the tooltip instead, where they can be read but not misread as a trend
// against revenue.
//
// Plain HTML rather than SVG, so the labels stay upright and legible at
// every width instead of being stretched by a scaling viewBox.
"use client";

import { useMemo, useState } from "react";

/** A round number at or above `value`, so the axis reads 0 / 500 / 1,000. */
function niceCeiling(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

/** 1200 → "1.2k". Axis labels have to fit in a 52px gutter. */
function short(n) {
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}m`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}k`;
  return String(Math.round(n));
}

export default function BarChart({
  data = [],
  valueKey = "value",
  labelKey = "label",
  formatValue = (n) => String(n),
  tooltipExtra = null,
  height = 200,
  emptyMessage = "No data in this range.",
}) {
  const [showTable, setShowTable] = useState(false);

  const { top, ticks } = useMemo(() => {
    const max = Math.max(0, ...data.map((d) => Number(d[valueKey]) || 0));
    const ceiling = niceCeiling(max);
    return { top: ceiling, ticks: [0, 0.25, 0.5, 0.75, 1].map((f) => ceiling * f) };
  }, [data, valueKey]);

  if (!data.length) {
    return <p className="text-xs admin-text-muted py-10 text-center">{emptyMessage}</p>;
  }

  // Thinned so labels never collide. Two densities rather than one: eight
  // dates fit comfortably on a desktop card and run together on a phone
  // ("16 Sept20 Sept24 Sept"), so half of them are dropped below the `sm`
  // breakpoint. Done in CSS rather than by measuring the container, so it
  // is right on the first paint instead of after a resize observer fires.
  const labelEvery = Math.ceil(data.length / 8);
  const sparseEvery = labelEvery * 2;

  return (
    <div>
      <div className="flex justify-end mb-2">
        <button
          onClick={() => setShowTable((v) => !v)}
          className="h-6 inline-flex items-center text-[11px] font-bold admin-text-muted hover:text-accent transition-colors"
          aria-expanded={showTable}
        >
          {showTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {showTable ? (
        // Not an afterthought: a chart that can only be read by eye is one
        // that some people cannot read at all.
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left admin-text-muted">
                <th className="py-1.5 font-bold">Day</th>
                <th className="py-1.5 font-bold text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i} className="border-t admin-border">
                  <td className="py-1.5 admin-text-secondary">{d[labelKey]}</td>
                  <td className="py-1.5 admin-text-primary font-semibold text-right">{formatValue(d[valueKey])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="flex" style={{ height }}>
            {/* y axis */}
            <div className="w-12 shrink-0 relative text-[10px] admin-text-muted">
              {ticks.map((t, i) => (
                <span
                  key={i}
                  className="absolute right-1.5 -translate-y-1/2 tabular-nums"
                  style={{ bottom: `${(t / top) * 100}%` }}
                >
                  {short(t)}
                </span>
              ))}
            </div>

            {/* plot */}
            <div className="flex-1 relative">
              {/* gridlines sit behind the bars and stay recessive */}
              {ticks.map((t, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-t"
                  style={{ bottom: `${(t / top) * 100}%`, borderColor: i === 0 ? "var(--admin-border-strong)" : "var(--admin-border)" }}
                />
              ))}

              <div className="absolute inset-0 flex items-end gap-[2px]">
                {data.map((d, i) => {
                  const value = Number(d[valueKey]) || 0;
                  const pct = (value / top) * 100;
                  return (
                    <div key={i} className="flex-1 h-full flex items-end relative group">
                      {/* the hit target is the whole column, not the bar —
                          a quiet day's 1px bar is otherwise unhoverable */}
                      <div className="absolute inset-0" />
                      <div
                        className="w-full rounded-t bg-accent/85 group-hover:bg-accent transition-colors"
                        style={{ height: value > 0 ? `max(3px, ${pct}%)` : "0" }}
                      />
                      {/* Inside the plot, not above it: hovering the tallest
                          bar used to push the tooltip out through the top of
                          the card, where it was clipped. Columns near either
                          end align to that edge so it can't spill sideways
                          either. */}
                      <div
                        className={`admin-on-dark pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute top-0 z-10 whitespace-nowrap rounded-lg bg-[#303030] text-white text-[11px] px-2.5 py-1.5 shadow-lg ${
                          i <= 1 ? "left-0" : i >= data.length - 2 ? "right-0" : "left-1/2 -translate-x-1/2"
                        }`}
                      >
                        <span className="block font-bold">{d[labelKey]}</span>
                        <span className="block tabular-nums">{formatValue(value)}</span>
                        {tooltipExtra?.(d)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* x axis */}
          <div className="flex mt-1.5">
            <div className="w-12 shrink-0" />
            <div className="flex-1 flex gap-[2px] relative h-4">
              {data.map((d, i) =>
                i % labelEvery === 0 ? (
                  // Positioned over its own column rather than filling it:
                  // one column is about 36px wide, so a date constrained to
                  // that width was truncated to "16 S…".
                  <div key={i} className="flex-1 relative">
                    <span
                      className={`absolute left-1/2 -translate-x-1/2 text-[10px] admin-text-muted whitespace-nowrap ${
                        i % sparseEvery === 0 ? "" : "hidden sm:inline"
                      }`}
                    >
                      {d[labelKey]}
                    </span>
                  </div>
                ) : (
                  <div key={i} className="flex-1" />
                )
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
