// app/api/orders/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import Discount from "@/models/Discount";
import ShippingMethod from "@/models/ShippingMethod";
import { getEffectivePrice } from "@/lib/utils";
import { hasPermission } from "@/lib/rbac";
import { rateLimit } from "@/lib/rateLimit";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

// Atomically claims one usage slot on a discount — the increment and the
// usageLimit check happen as a single DB operation, so concurrent checkouts
// can't all read "1 slot left" and all succeed. Returns the updated
// discount doc if the claim succeeded, or null if the limit was already hit
// (by this or a concurrent request) between validation and this call.
async function claimDiscountUsage(discountId) {
  return Discount.findOneAndUpdate(
    { _id: discountId, $or: [{ usageLimit: 0 }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }] },
    { $inc: { usedCount: 1 } },
    { new: true }
  );
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
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const isAdmin = await hasPermission(session, "orders_update");

    // Staff creating orders on a customer's behalf get a higher ceiling —
    // ordinary shoppers checking out repeatedly is what this guards against.
    const limit = rateLimit(`order-create:${session.user.id}`, { max: isAdmin ? 60 : 15, windowMs: 10 * 60_000 });
    if (!limit.allowed) {
      return NextResponse.json({ success: false, message: "Too many orders placed recently — please wait a few minutes." }, { status: 429 });
    }

    const { items, shippingAddress, paymentMethod, userId, paymentStatus, discountCode, shippingMethodId } = await request.json();

    // ADMIN: customer er jonno order create
    let targetUserId = session.user.id;
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

    const address = {
      fullName: shippingAddress?.fullName?.trim(),
      phone: shippingAddress?.phone?.trim(),
      address: shippingAddress?.address?.trim(),
      city: shippingAddress?.city?.trim(),
    };
    if (!address.fullName || !address.phone || !address.address || !address.city) {
      return NextResponse.json({ success: false, message: "Complete shipping address is required" }, { status: 400 });
    }

    const finalPaymentMethod = paymentMethod === "cod" ? "cod" : "sslcommerz";

    // DRAFT ORDER reuse (customer checkout only)
    const existing = isAdmin
      ? null
      : await Order.findOne({
          user: targetUserId,
          paymentStatus: "pending",
          paymentMethod: "sslcommerz",
        });

    const oldMap = new Map();
    if (existing) {
      for (const it of existing.items) {
        const key = String(it.product);
        oldMap.set(key, (oldMap.get(key) || 0) + it.quantity);
      }
    }

    // DB theke price + stock + category collect
    let baseAmount = 0;
    const orderItems = [];
    const categoryMap = new Map();
    const weightMap = new Map();
    for (const item of items) {
      if (!item.product || !item.quantity) {
        return NextResponse.json({ success: false, message: "Invalid item format" }, { status: 400 });
      }
      const product = await Product.findById(item.product);
      if (!product) {
        return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
      }
      const oldQ = oldMap.get(String(product._id)) || 0;
      const available = product.stock + oldQ;
      if (available < item.quantity) {
        return NextResponse.json(
          { success: false, message: `Insufficient stock for ${product.name}. Available: ${available}` },
          { status: 400 }
        );
      }
      const price = getEffectivePrice(product);
      baseAmount += price * item.quantity;
      categoryMap.set(String(product._id), product.category);
      weightMap.set(String(product._id), product.weight || 0);
      orderItems.push({ product: product._id, name: product.name, sku: product.sku || "", quantity: item.quantity, price });
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
          { success: false, message: `Minimum order ${d.minAmount}৳ required for this coupon` },
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
    if (shippingMethodId) {
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

    const totalAmount = totalAmountBeforeShipping + shippingCost;
    if (finalPaymentMethod === "sslcommerz" && totalAmount <= 0) {
      return NextResponse.json({ success: false, message: "Order amount must be positive for online payment" }, { status: 400 });
    }

    // ===== COUPON CLAIM (atomic, and done before stock is touched below —
    // if the claim fails, nothing else has changed yet, so there's nothing
    // to roll back) =====
    if (existing) {
      if (existing.discountCode !== appliedCode) {
        if (existing.discountCode) {
          await Discount.updateOne({ code: existing.discountCode }, { $inc: { usedCount: -1 } });
        }
        if (discountDoc) {
          const claimed = await claimDiscountUsage(discountDoc._id);
          if (!claimed) {
            return NextResponse.json({ success: false, message: "This coupon just reached its usage limit — please remove it and try again." }, { status: 400 });
          }
        }
      }
    } else if (discountDoc) {
      const claimed = await claimDiscountUsage(discountDoc._id);
      if (!claimed) {
        return NextResponse.json({ success: false, message: "This coupon just reached its usage limit — please remove it and try again." }, { status: 400 });
      }
    }

    // stock adjustment (delta)
    const newMap = new Map();
    for (const it of orderItems) {
      const key = String(it.product);
      newMap.set(key, (newMap.get(key) || 0) + it.quantity);
    }
    const allIds = new Set([...oldMap.keys(), ...newMap.keys()]);
    for (const id of allIds) {
      const delta = (oldMap.get(id) || 0) - (newMap.get(id) || 0);
      if (delta !== 0) {
        await Product.findByIdAndUpdate(id, { $inc: { stock: delta } });
      }
    }

    // draft thakle UPDATE
    if (existing) {
      existing.items = orderItems;
      existing.baseAmount = baseAmount;
      existing.discountCode = appliedCode;
      existing.discountAmount = discountAmount;
      existing.shippingCost = shippingCost;
      existing.shippingMethodName = shippingMethodDoc?.name || "";
      existing.totalAmount = totalAmount;
      existing.shippingAddress = address;
      existing.paymentMethod = finalPaymentMethod;
      if (shippingMethodDoc) {
        existing.shipment.method = shippingMethodDoc._id;
        existing.shipment.carrier = shippingMethodDoc.carrier?._id || null;
      }
      await existing.save();
      return NextResponse.json({ success: true, data: existing });
    }

    // notun order CREATE (coupon already claimed atomically above, before stock was touched)
    const finalPaymentStatus = isAdmin && paymentStatus ? paymentStatus : "pending";
    // COD has nothing to wait on, so it's immediately actionable. Online
    // payment (sslcommerz) starts "pending" until the checkout webhook
    // verifies payment — unless an admin created the order already marked
    // paid, in which case there's nothing left to wait on either.
    const initialOrderStatus = finalPaymentMethod === "cod" || finalPaymentStatus === "paid" ? "processing" : "pending";

    const order = await Order.create({
      orderNumber: `ORD-${Date.now().toString(36).toUpperCase()}`,
      user: targetUserId,
      items: orderItems,
      shippingAddress: address,
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
    });

    return NextResponse.json({ success: true, data: order }, { status: 201 });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return NextResponse.json({ success: false, message: "Validation failed", errors: messages }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}