// app/api/orders/route.js
export const dynamic = "force-dynamic";

import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import Discount from "@/models/Discount";
import ShippingMethod from "@/models/ShippingMethod";
import { getEffectivePrice, isValidQuantity, formatCurrency } from "@/lib/utils";
import { orderConfirmationBody } from "@/lib/orderEmails";
import { hasPermission } from "@/lib/rbac";
import crypto from "crypto";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { validateEmail } from "@/lib/authValidation";
import Settings from "@/models/Settings";
import { computeTax, taxLinesFromItems } from "@/lib/tax";
import { notify } from "@/lib/notify";
import { atomicDecrement, adjustStock } from "@/lib/productStock";
import { STOCK_REASONS } from "@/models/StockMovement";
import { runInTransaction } from "@/lib/dbTransaction";
import { checkLowStock } from "@/lib/inventoryEvents";
import { implementedProviders } from "@/lib/payments";
import { settleCartAfterOrder } from "@/lib/cartReminder";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { serverError } from "@/lib/apiError";
import { orderRequiresShipping } from "@/lib/shippingRequirement";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
// How recent a pending SSLCommerz order has to be for a fresh checkout to
// reuse/overwrite it (a "resume payment" convenience for someone who just
// bounced off the SSLCommerz redirect a minute ago). Anything older is left
// completely untouched and a brand-new order is created instead — reusing
// an arbitrary old pending order regardless of age was a real bug: a
// customer's abandoned cart from weeks ago could get silently overwritten
// by an unrelated new checkout.
const DRAFT_REUSE_WINDOW_MS = 30 * 60 * 1000;

// Atomically claims one usage slot on a discount — the increment and the
// usageLimit check happen as a single DB operation, so concurrent checkouts
// can't all read "1 slot left" and all succeed. Returns the updated
// discount doc if the claim succeeded, or null if the limit was already hit
// (by this or a concurrent request) between validation and this call.
async function claimDiscountUsage(discountId, session) {
  return Discount.findOneAndUpdate(
    { _id: discountId, $or: [{ usageLimit: 0 }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }] },
    { $inc: { usedCount: 1 } },
    { new: true, session }
  );
}

// Releases one usage slot — guarded so usedCount can never go negative
// (e.g. from a retry, a race, or a manual DB edit elsewhere).
async function releaseDiscountUsage(code, session) {
  await Discount.updateOne({ code, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, { session });
}

export async function GET(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    // AUTO-FULFILL: ship howar 30 din por o keu confirm na korle auto delivered
    await Order.updateMany(
      { orderStatus: "shipped", shippedAt: { $lte: new Date(Date.now() - THIRTY_DAYS) } },
      { $set: { orderStatus: "delivered", deliveredAt: new Date() } }
    );

    // Staff with the "orders" permission see every order (previously this
    // was hardcoded to role === "admin", which silently blocked the
    // Order Processing / Support staff roles from seeing anything but
    // their own — a real RBAC gap now fixed).
    const isStaff = await hasPermission(session, "orders");
    const query = isStaff ? {} : { user: session.user.id };
    const orders = await Order.find(query)
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .limit(100);

    return NextResponse.json({ success: true, data: orders });
  } catch (error) {
    return serverError(error, "api/orders");
  }
}

export async function POST(request) {
  try {
    await connectDB();
    // parsed up front: the guest checks below need it
    const body = await request.json();
    const session = await getServerSession(authOptions);

    // ---- guest checkout (off by default; Settings → Checkout) ----
    const settingsDoc = await Settings.findOne().select("checkout tax").lean();
    const guestMode = settingsDoc?.checkout?.guestCheckout || "off";
    const isGuest = !session?.user;

    if (isGuest && guestMode === "off") {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    let guestEmail = "";
    if (isGuest) {
      guestEmail = String(body.guestEmail || "").trim().toLowerCase();
      const emailError = validateEmail(guestEmail);
      if (emailError) {
        return NextResponse.json({ success: false, message: emailError }, { status: 400 });
      }
      // "cod" mode: guests may not use online payment
      if (guestMode === "cod" && body.paymentMethod && body.paymentMethod !== "cod") {
        return NextResponse.json(
          { success: false, message: "Please sign in to pay online, or choose cash on delivery." },
          { status: 400 }
        );
      }
    }

    const isAdmin = !isGuest && (await hasPermission(session, "orders_update"));

    // Staff creating orders on a customer's behalf get a higher ceiling —
    // ordinary shoppers checking out repeatedly is what this guards against.
    // Guests have no account, so they're limited per IP instead.
    const limitKey = isGuest ? `order-create-ip:${getClientIp(request)}` : `order-create:${session.user.id}`;
    const limit = await rateLimit(limitKey, { max: isAdmin ? 60 : isGuest ? 8 : 15, windowMs: 10 * 60_000 });
    if (!limit.allowed) {
      return NextResponse.json({ success: false, message: "Too many orders placed recently — please wait a few minutes." }, { status: 429 });
    }

    const { items, shippingAddress, paymentMethod, userId, paymentStatus, discountCode, shippingMethodId } = body;

    // ADMIN: customer er jonno order create
    let targetUserId = isGuest ? null : session.user.id;
    if (isAdmin && userId) {
      const customer = await User.findById(userId);
      if (!customer) {
        return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
      }
      targetUserId = customer._id.toString();
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, message: "Cart cannot be empty" }, { status: 400 });
    }

    // ===== DEFENSIVE ITEM VALIDATION (explicit, not truthy/falsy) =====
    // Quantity must be a positive integer — this used to only check
    // `!item.quantity`, which let 0 through (falsy check inverted wrongly
    // for 0... actually 0 IS falsy so !0 is true, correctly rejected) but
    // let -1, 1.5, and numeric strings straight through, since all of
    // those are truthy. Every item is fully validated up front, before any
    // database work happens, so a single bad line rejects the whole
    // request with a clear 400 rather than partially processing.
    for (const item of items) {
      if (!item || typeof item !== "object") {
        return NextResponse.json({ success: false, message: "Invalid item format" }, { status: 400 });
      }
      if (typeof item.product !== "string" || !/^[0-9a-fA-F]{24}$/.test(item.product)) {
        return NextResponse.json({ success: false, message: "Invalid product reference" }, { status: 400 });
      }
      if (!isValidQuantity(item.quantity)) {
        return NextResponse.json(
          { success: false, message: `Invalid quantity for an item — must be a whole number between 1 and 500` },
          { status: 400 }
        );
      }
      if (item.combinationKey !== undefined && typeof item.combinationKey !== "string") {
        return NextResponse.json({ success: false, message: "Invalid variant selection" }, { status: 400 });
      }
    }

    // Taken from the adapter registry rather than a hand-kept list, so a
    // newly implemented provider cannot be offered at checkout and then
    // rejected here — which is exactly how a customer ends up with a
    // "something went wrong" after choosing bKash.
    if (paymentMethod !== undefined && !["cod", ...implementedProviders()].includes(paymentMethod)) {
      return NextResponse.json({ success: false, message: "Invalid payment method" }, { status: 400 });
    }
    if (discountCode !== undefined && discountCode !== "" && typeof discountCode !== "string") {
      return NextResponse.json({ success: false, message: "Invalid coupon code" }, { status: 400 });
    }
    if (shippingMethodId !== undefined && shippingMethodId !== "" && !/^[0-9a-fA-F]{24}$/.test(String(shippingMethodId))) {
      return NextResponse.json({ success: false, message: "Invalid shipping method" }, { status: 400 });
    }

    // Does this order ship? Decided here from the products themselves — a
    // client claiming "no shipping needed" for physical goods would be
    // claiming free delivery, so the request has no say in it.
    const requirementProducts = await Product.find({ _id: { $in: items.map((i) => String(i.product)) } })
      .select("digitalProduct shippingRequirement")
      .lean();
    const needsShipping = orderRequiresShipping(requirementProducts);

    const address = {
      fullName: shippingAddress?.fullName?.trim(),
      phone: shippingAddress?.phone?.trim(),
      address: shippingAddress?.address?.trim(),
      city: shippingAddress?.city?.trim(),
      country: shippingAddress?.country?.trim() || "",
      state: shippingAddress?.state?.trim() || "",
      postalCode: shippingAddress?.postalCode?.trim() || "",
    };
    // A download-only order still needs a name and a contact number for the
    // invoice, but not a delivery address.
    if (!address.fullName || !address.phone) {
      return NextResponse.json({ success: false, message: "Name and phone number are required" }, { status: 400 });
    }
    if (needsShipping && (!address.address || !address.city)) {
      return NextResponse.json({ success: false, message: "Complete shipping address is required" }, { status: 400 });
    }

    const finalPaymentMethod = paymentMethod === "cod" ? "cod" : "sslcommerz";

    // DRAFT ORDER reuse (customer checkout only) — restricted to a recent
    // window (see DRAFT_REUSE_WINDOW_MS) and validated to actually belong
    // to this exact payment flow, so a months-old abandoned pending order
    // is never silently overwritten by an unrelated new checkout.
    const existing = isAdmin || isGuest
      ? null // guests have no account to match a previous draft against
      : await Order.findOne({
          user: targetUserId,
          paymentStatus: "pending",
          paymentMethod: "sslcommerz",
          createdAt: { $gte: new Date(Date.now() - DRAFT_REUSE_WINDOW_MS) },
        }).sort({ createdAt: -1 });

    // composite key so two different variants of the same product (e.g.
    // Size S vs Size M) are tracked separately, not merged together
    const lineKey = (productId, combinationKey) => `${productId}::${combinationKey || ""}`;

    const oldMap = new Map();
    if (existing) {
      for (const it of existing.items) {
        const key = lineKey(it.product, it.combinationKey);
        oldMap.set(key, (oldMap.get(key) || 0) + it.quantity);
      }
    }

    // DB theke price + stock + category collect. Availability is checked
    // here for a fast, clear error message, but this check alone does NOT
    // prevent overselling under concurrency — the real guarantee comes
    // from the atomic conditional decrement in the transaction below. Two
    // requests can both pass this optimistic check; only one will
    // actually succeed at the atomic-decrement stage, and the other gets
    // a proper 409.
    let baseAmount = 0;
    const orderItems = [];
    const categoryMap = new Map();
    const weightMap = new Map();
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) {
        return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
      }

      // A customer must never be able to purchase a draft/private/
      // unpublished product just by knowing its id — the storefront
      // already hides these from listings/search, but the order endpoint
      // previously fetched products directly with no status check at all.
      // Staff creating a manual order (phone/in-store sale, or adding a
      // product still being finished) are exempt on purpose.
      if (!isAdmin && product.status !== "public") {
        return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
      }

      // resolve the specific variant, if the cart line specified one —
      // stock/price come from the combination, not the base product, once
      // a product has variants (this is the actual fix: previously stock
      // was only ever checked/decremented on the base product.stock field,
      // so a sold-out variant could still be purchased as long as *some*
      // other variant had stock)
      let combo = null;
      if (item.combinationKey) {
        combo = (product.combinations || []).find((c) => c.key === item.combinationKey && c.active);
        if (!combo) {
          return NextResponse.json(
            { success: false, message: `The selected option for ${product.name} is no longer available` },
            { status: 400 }
          );
        }
      }

      const key = lineKey(product._id, item.combinationKey);
      const oldQ = oldMap.get(key) || 0;
      const stockAvailable = combo ? combo.stock : product.stock;
      const available = stockAvailable + oldQ;
      if (available < item.quantity) {
        return NextResponse.json(
          {
            success: false,
            message: `Insufficient stock for ${product.name}${combo ? ` (${combo.key})` : ""}. Available: ${available}`,
          },
          { status: 409 }
        );
      }

      // a combination price of 0 means "use the base product's price" —
      // matches the storefront's own display logic (matchedCombo?.price || basePrice)
      const price = combo?.price > 0 ? combo.price : getEffectivePrice(product);
      baseAmount += price * item.quantity;
      categoryMap.set(String(product._id), product.category);
      weightMap.set(String(product._id), product.weight || 0);
      orderItems.push({
        product: product._id,
        name: combo ? `${product.name} (${combo.key})` : product.name,
        sku: combo?.sku || product.sku || "",
        quantity: item.quantity,
        price,
        combinationKey: item.combinationKey || "",
      });
    }

    // ===== COUPON CALCULATION (server-side, tamper-proof) =====
    let discountAmount = 0;
    let appliedCode = "";
    let discountDoc = null;

    if (discountCode) {
      const d = await Discount.findOne({ code: String(discountCode).toUpperCase().trim() });
      if (!d || !d.active) {
        return NextResponse.json({ success: false, message: "Invalid or inactive coupon code" }, { status: 400 });
      }
      if (d.expiresAt && new Date(d.expiresAt) < new Date()) {
        return NextResponse.json({ success: false, message: "This coupon has expired" }, { status: 400 });
      }
      if (d.usageLimit > 0 && d.usedCount >= d.usageLimit) {
        return NextResponse.json({ success: false, message: "Coupon usage limit reached" }, { status: 400 });
      }
      if (d.scope === "customer" && d.target !== targetUserId) {
        return NextResponse.json({ success: false, message: "This coupon is not valid for your account" }, { status: 400 });
      }
      if (d.minAmount > 0 && baseAmount < d.minAmount) {
        return NextResponse.json(
          { success: false, message: `This coupon needs a minimum order of ${formatCurrency(d.minAmount)}` },
          { status: 400 }
        );
      }

      // eligible amount (scope onujayi)
      let eligible = 0;
      if (d.scope === "all" || d.scope === "customer") {
        eligible = baseAmount;
      } else {
        for (const it of orderItems) {
          const pid = String(it.product);
          if (d.scope === "product" && pid === String(d.target)) eligible += it.price * it.quantity;
          if (d.scope === "category" && categoryMap.get(pid) === d.target) eligible += it.price * it.quantity;
        }
      }
      if (eligible <= 0) {
        return NextResponse.json({ success: false, message: "Coupon does not apply to these products" }, { status: 400 });
      }

      discountAmount = d.type === "percentage" ? Math.round((eligible * d.value) / 100) : Math.min(d.value, eligible);
      appliedCode = d.code;
      discountDoc = d;
    }

    const totalAmountBeforeShipping = Math.max(0, baseAmount - discountAmount);

    // ===== SHIPPING (server-side, tamper-proof — never trust a client price) =====
    let shippingCost = 0;
    let shippingMethodDoc = null;
    // Nothing to deliver means nothing to charge for delivery — and a
    // shipping method id sent anyway is ignored rather than honoured.
    if (shippingMethodId && needsShipping) {
      shippingMethodDoc = await ShippingMethod.findById(shippingMethodId).populate("carrier");
      if (!shippingMethodDoc || !shippingMethodDoc.active) {
        return NextResponse.json({ success: false, message: "Selected shipping method is no longer available" }, { status: 400 });
      }
      if (finalPaymentMethod === "cod" && !shippingMethodDoc.codAllowed) {
        return NextResponse.json({ success: false, message: "Selected shipping method doesn't support Cash on Delivery" }, { status: 400 });
      }
      if (shippingMethodDoc.freeShippingThreshold > 0 && totalAmountBeforeShipping >= shippingMethodDoc.freeShippingThreshold) {
        shippingCost = 0;
      } else if (shippingMethodDoc.rateType === "weightBased" && shippingMethodDoc.weightTiers?.length) {
        const totalWeight = orderItems.reduce((sum, it) => sum + (weightMap.get(String(it.product)) || 0) * it.quantity, 0);
        const sorted = [...shippingMethodDoc.weightTiers].sort((a, b) => a.maxWeightKg - b.maxWeightKg);
        const tier = sorted.find((t) => totalWeight <= t.maxWeightKg);
        shippingCost = tier ? tier.rate : sorted[sorted.length - 1].rate;
      } else {
        shippingCost = shippingMethodDoc.flatRate || 0;
      }
    }

    // ===== TAX (server-side; the client never sends a tax figure) =====
    // Computed on the discounted goods plus shipping, from the zone that
    // covers this address. With inclusive pricing the tax is already inside
    // the prices, so `taxToAdd` is zero and the customer pays exactly what
    // the storefront showed; with exclusive pricing it's added here.
    // settingsDoc was already loaded above for the guest-checkout rule
    const taxSettings = settingsDoc?.tax || {};
    const taxAddress =
      taxSettings.basedOn === "store"
        ? { country: taxSettings.storeCountry, state: taxSettings.storeState }
        : // A download-only order has no delivery address to judge by, so
          // fall back to where the store is registered.
          { country: address.country || taxSettings.storeCountry, state: address.state || taxSettings.storeState };

    const tax = await computeTax({
      lines: taxLinesFromItems(orderItems, requirementProducts),
      shippingCost,
      discountAmount,
      address: taxAddress,
      taxSettings,
    });

    const totalAmount = totalAmountBeforeShipping + shippingCost + tax.taxToAdd;
    if (finalPaymentMethod === "sslcommerz" && totalAmount <= 0) {
      return NextResponse.json({ success: false, message: "Order amount must be positive for online payment" }, { status: 400 });
    }

    // ===== CRITICAL SECTION =====
    // Everything below either all succeeds together or all rolls back
    // together: coupon claim/release, stock reservation, and the order
    // write itself. Runs inside a real MongoDB transaction where the
    // connected server supports one (replica set/Atlas); on a standalone
    // server, runInTransaction() falls back to running this same code
    // without a session — concurrency-safety is still fully enforced by
    // the atomic conditional stock decrements below (that's what actually
    // prevents overselling), the transaction adds cross-document
    // all-or-nothing rollback on top of that where available.
    let finalOrder;
    let conflictMessage = null;

    await runInTransaction(async (dbSession) => {
      // ----- coupon: claim the NEW one first, only release the OLD one
      // after that succeeds. Previously the old coupon's usage was
      // decremented *before* the new one was claimed — if the new claim
      // then failed, the old counter was already wrong with nothing to
      // undo it. -----
      if (existing) {
        if (existing.discountCode !== appliedCode) {
          if (discountDoc) {
            const claimed = await claimDiscountUsage(discountDoc._id, dbSession);
            if (!claimed) {
              conflictMessage = "This coupon just reached its usage limit — please remove it and try again.";
              return;
            }
          }
          if (existing.discountCode) {
            await releaseDiscountUsage(existing.discountCode, dbSession);
          }
        }
      } else if (discountDoc) {
        const claimed = await claimDiscountUsage(discountDoc._id, dbSession);
        if (!claimed) {
          conflictMessage = "This coupon just reached its usage limit — please remove it and try again.";
          return;
        }
      }

      // ----- stock: atomic conditional decrement per line, with
      // compensating rollback if a later line fails partway through -----
      const newMap = new Map();
      for (const it of orderItems) {
        const key = lineKey(it.product, it.combinationKey);
        newMap.set(key, (newMap.get(key) || 0) + it.quantity);
      }
      const allKeys = new Set([...oldMap.keys(), ...newMap.keys()]);

      // The order's id, decided before the stock is reserved rather than
      // when the document is written. Stock moves first — that is what
      // makes the reservation safe — so without this the ledger rows for
      // the sale had nothing to point at, and "which order took these
      // four?" had no answer.
      const orderId = existing?._id || new mongoose.Types.ObjectId();

      const applied = []; // successfully-decremented keys, for rollback on partial failure
      for (const key of allKeys) {
        const delta = (oldMap.get(key) || 0) - (newMap.get(key) || 0);
        if (delta === 0) continue;
        const [productId, combinationKey] = key.split("::");

        if (delta > 0) {
          // returning stock (quantity decreased or line removed) — no
          // guard needed, this can't oversell anything
          await adjustStock([{ product: productId, combinationKey, quantity: delta }], 1, dbSession, {
            reason: STOCK_REASONS.SALE,
            order: orderId,
            note: "quantity reduced on an edited order",
          });
          applied.push({ product: productId, combinationKey, quantity: delta, sign: 1 });
        } else {
          const need = -delta;
          const ok = await atomicDecrement(productId, combinationKey || "", need, dbSession, {
            reason: STOCK_REASONS.SALE,
            order: orderId,
          });
          if (!ok) {
            // roll back everything this request already reserved, and any
            // coupon claim/release, before reporting the conflict
            for (const a of applied.reverse()) {
              // Rolling back a half-applied reservation. Recorded as a
              // cancellation so the pair reads as what it was.
              await adjustStock([{ product: a.product, combinationKey: a.combinationKey, quantity: a.quantity }], -a.sign, dbSession, {
                reason: STOCK_REASONS.CANCELLED,
                order: orderId,
                note: "order could not be completed",
              });
            }
            if (existing && existing.discountCode !== appliedCode) {
              if (discountDoc) await releaseDiscountUsage(discountDoc.code, dbSession);
            } else if (!existing && discountDoc) {
              await releaseDiscountUsage(discountDoc.code, dbSession);
            }
            conflictMessage = "Someone just bought the last unit — please review your cart and try again.";
            return;
          }
          applied.push({ product: productId, combinationKey, quantity: need, sign: -1 });
        }
      }

      // ----- draft thakle UPDATE, otherwise CREATE -----
      if (existing) {
        existing.items = orderItems;
        existing.baseAmount = baseAmount;
        existing.discountCode = appliedCode;
        existing.discountAmount = discountAmount;
        existing.requiresShipping = needsShipping;
        existing.shippingCost = shippingCost;
        existing.taxTotal = tax.taxTotal;
        existing.taxLines = tax.taxLines;
        existing.taxZoneName = tax.zoneName;
        existing.pricesIncludeTax = tax.pricesIncludeTax;
        existing.shippingMethodName = shippingMethodDoc?.name || "";
        existing.totalAmount = totalAmount;
        existing.shippingAddress = address;
        existing.paymentMethod = finalPaymentMethod;
        if (shippingMethodDoc) {
          existing.shipment.method = shippingMethodDoc._id;
          existing.shipment.carrier = shippingMethodDoc.carrier?._id || null;
        }
        await existing.save({ session: dbSession });
        finalOrder = existing;
        return;
      }

      const finalPaymentStatus = isAdmin && paymentStatus ? paymentStatus : "pending";
      // COD has nothing to wait on, so it's immediately actionable. Online
      // payment (sslcommerz) starts "pending" until the checkout webhook
      // verifies payment — unless an admin created the order already marked
      // paid, in which case there's nothing left to wait on either.
      const initialOrderStatus = finalPaymentMethod === "cod" || finalPaymentStatus === "paid" ? "processing" : "pending";

      const [created] = await Order.create(
        [
          {
            _id: orderId,
            orderNumber: `ORD-${Date.now().toString(36).toUpperCase()}`,
            user: targetUserId,
            guestEmail,
            guestAccessToken: isGuest ? crypto.randomBytes(24).toString("hex") : "",
            items: orderItems,
            shippingAddress: address,
            requiresShipping: needsShipping,
            taxTotal: tax.taxTotal,
            taxLines: tax.taxLines,
            taxZoneName: tax.zoneName,
            pricesIncludeTax: tax.pricesIncludeTax,
            paymentMethod: finalPaymentMethod,
            baseAmount,
            discountCode: appliedCode,
            discountAmount,
            shippingCost,
            shippingMethodName: shippingMethodDoc?.name || "",
            totalAmount,
            paymentStatus: finalPaymentStatus,
            orderStatus: initialOrderStatus,
            shipment: shippingMethodDoc
              ? { method: shippingMethodDoc._id, carrier: shippingMethodDoc.carrier?._id || null }
              : undefined,
          },
        ],
        { session: dbSession }
      );
      finalOrder = created;
    });

    if (conflictMessage) {
      return NextResponse.json({ success: false, message: conflictMessage }, { status: 409 });
    }
    if (!finalOrder) {
      return NextResponse.json({ success: false, message: "Failed to place order — please try again." }, { status: 500 });
    }

    // Stock has now genuinely left inventory (the transaction committed), so
    // tell admins about anything that just ran low or sold out. Runs here,
    // never inside the transaction, which could still have rolled back.
    // Skipped for a reused draft, whose stock was counted when first placed.
    if (!existing) {
      checkLowStock(orderItems);
    }

    // The saved basket has now been bought, so it stops being something the
    // customer could come back to — and if a reminder went out recently,
    // this is the order that answers whether it worked. Never allowed to
    // fail the order: it swallows its own errors.
    if (finalOrder.user) {
      await settleCartAfterOrder(finalOrder.user, finalOrder._id);
    }

    const confirmLink = isGuest
      ? `/order-confirmation/${finalOrder._id}?t=${finalOrder.guestAccessToken}`
      : `/order-confirmation/${finalOrder._id}`;
    const confirmMessage = `Thanks! We've received your order #${finalOrder.orderNumber} for ${formatCurrency(totalAmount)}. ${
      finalPaymentMethod === "cod" ? "Pay on delivery." : "Complete payment to confirm it."
    }`;

    // One path for both: notify() knows that a guest has no account to show
    // an in-app notification in, and routes to whichever channels the store
    // has enabled. The guest branch used to call sendEmail directly, which
    // meant it quietly skipped SMS and the delivery log.
    await notify({
      user: finalOrder.user,
      guestEmail: isGuest ? guestEmail : "",
      phone: finalOrder.shippingAddress?.phone,
      type: "order_status",
      title: `Order ${finalOrder.orderNumber} placed`,
      message: confirmMessage,
      // for a guest this carries the access token, since they can't sign in
      link: confirmLink,
      linkLabel: "View your order",
      emailHtml: orderConfirmationBody(finalOrder),
    });

    return NextResponse.json({ success: true, data: finalOrder }, { status: existing ? 200 : 201 });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return NextResponse.json({ success: false, message: "Validation failed", errors: messages }, { status: 400 });
    }
    console.error("[orders:create]", error);
    return NextResponse.json({ success: false, message: "Something went wrong placing your order" }, { status: 500 });
  }
}
