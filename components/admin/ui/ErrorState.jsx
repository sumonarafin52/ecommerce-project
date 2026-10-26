// components/admin/ui/ErrorState.jsx
//
// "We couldn't load this" — as distinct from "there is nothing here".
//
// Most of the admin could only say the second. A list page fetched its data,
// swallowed any failure with `.catch(() => {})`, and fell through to its
// empty state: with the API down, Orders said "No orders yet", Customers
// said "No customers found", and the dashboard reported ৳0 revenue and zero
// orders for the day. Thirteen pages did this. That is worse than a blank
// screen, because a shop owner has no reason to doubt it — it is a
// confident, specific, wrong answer about their own business.
//
// Six more showed nothing at all, or a skeleton that never resolved.
"use client";

import Button from "@/components/admin/ui/Button";
import EmptyState from "@/components/admin/ui/EmptyState";

export default function ErrorState({ what = "this page", onRetry, detail, className = "" }) {
  return (
    <div className={`max-w-[1700px] mx-auto px-4 lg:px-8 py-6 ${className}`}>
      <div className="admin-card rounded-xl">
        <EmptyState
          icon="warning"
          title={`Couldn't load ${what}`}
          description={
            detail ||
            "The server didn't answer. Nothing has been changed or lost — this is about reading the data, not your store."
          }
        />
        {onRetry && (
          <div className="flex justify-center pb-6">
            <Button onClick={onRetry}>Try again</Button>
          </div>
        )}
      </div>
    </div>
  );
}
