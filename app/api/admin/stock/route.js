// app/api/admin/stock/route.js
//
// The stock ledger, and whether it agrees with the stock numbers.
//
// Two questions, one endpoint:
//   "what happened to this product?"  — ?product=<id>
//   "what happened in the shop?"      — no product, most recent first
//
// The integrity check is the valuable half. Each movement records the
// balance it left behind, so the ledger's own arithmetic can be compared
// with what the product actually says now. A difference means stock moved
// without going through the system — a direct database edit, a restore
// from a backup, or a bug — and that is worth knowing before it turns into
// an oversell.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import Order from "@/models/Order";
import StockMovement, { STOCK_REASONS } from "@/models/StockMovement";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { serverError } from "@/lib/apiError";

const PAGE_SIZE = 50;

export async function GET(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "products"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("product") || "";
    const reason = searchParams.get("reason") || "";
    const page = Math.max(1, parseInt(searchParams.get("page")) || 1);

    const query = {};
    if (/^[0-9a-fA-F]{24}$/.test(productId)) query.product = productId;
    if (Object.values(STOCK_REASONS).includes(reason)) query.reason = reason;

    const [rows, total] = await Promise.all([
      StockMovement.find(query).sort({ at: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
      StockMovement.countDocuments(query),
    ]);

    // Names for the ids, in two queries rather than one per row.
    const [products, orders] = await Promise.all([
      Product.find({ _id: { $in: [...new Set(rows.map((r) => String(r.product)))] } })
        .select("name slug stock combinations")
        .lean(),
      Order.find({ _id: { $in: rows.map((r) => r.order).filter(Boolean) } })
        .select("orderNumber")
        .lean(),
    ]);
    const byProduct = new Map(products.map((p) => [String(p._id), p]));
    const byOrder = new Map(orders.map((o) => [String(o._id), o]));

    const movements = rows.map((r) => ({
      _id: String(r._id),
      product: { _id: String(r.product), name: byProduct.get(String(r.product))?.name || "Deleted product" },
      combinationKey: r.combinationKey || "",
      delta: r.delta,
      balanceAfter: r.balanceAfter,
      reason: r.reason,
      order: r.order ? { _id: String(r.order), orderNumber: byOrder.get(String(r.order))?.orderNumber || "" } : null,
      by: r.by?.name || "",
      note: r.note || "",
      at: r.at,
    }));

    const data = { movements, page, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };

    // For a single product, also answer "does this add up?"
    if (query.product) {
      const product = byProduct.get(String(query.product)) || (await Product.findById(query.product).select("name stock combinations").lean());
      data.product = product
        ? { _id: String(product._id), name: product.name, stock: product.stock, combinations: product.combinations || [] }
        : null;
      data.integrity = await checkIntegrity(query.product, product);
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return serverError(error, "api/admin/stock");
  }
}

/**
 * Does the ledger explain the number on the product?
 *
 * Sums every movement for the product and compares it with what the
 * product says now. They agree when every change went through the system.
 *
 * A mismatch is reported, never corrected: this endpoint reads. Quietly
 * "fixing" a discrepancy would destroy the evidence of whatever caused it,
 * and the right response to unexplained stock is to look, not to paper
 * over it.
 */
async function checkIntegrity(productId, product) {
  if (!product) return null;

  const sums = await StockMovement.aggregate([
    { $match: { product: product._id } },
    { $group: { _id: "$combinationKey", total: { $sum: "$delta" } } },
  ]);
  const byKey = new Map(sums.map((s) => [s._id || "", s.total]));

  // A product that existed before stock history was switched on has no
  // opening entry, so its total cannot add up and never will until the
  // ledger covers its whole life. That is a completely different thing
  // from stock going missing, and reporting both the same way would teach
  // an owner to ignore the one that matters.
  const hasOpening = await StockMovement.exists({ product: product._id, reason: STOCK_REASONS.CREATED });

  const lines = [];

  // A product with variants keeps its count per variant; the base number
  // is not the sum of them, so they are checked separately.
  if (product.combinations?.length) {
    for (const combo of product.combinations) {
      const ledger = byKey.get(combo.key) ?? 0;
      lines.push({ key: combo.key, actual: combo.stock ?? 0, ledger, agrees: (combo.stock ?? 0) === ledger });
    }
  } else {
    const ledger = byKey.get("") ?? 0;
    lines.push({ key: "", actual: product.stock ?? 0, ledger, agrees: (product.stock ?? 0) === ledger });
  }

  const agrees = lines.every((l) => l.agrees);

  return {
    agrees,
    lines,
    // "incomplete" means the beginning is missing; "mismatch" means
    // something changed stock without going through the system.
    state: agrees ? "ok" : hasOpening ? "mismatch" : "incomplete",
    note: hasOpening
      ? "Every change since this product was created is listed above. A difference means stock moved without going through the shop — a direct database edit, a restored backup, or a bug."
      : "This product existed before stock history was switched on, so it has no opening entry and its total won't match. Everything from here on is recorded.",
  };
}
