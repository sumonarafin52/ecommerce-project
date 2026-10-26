// app/api/orders/[id]/invoice/route.js
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Settings from "@/models/Settings";
import { hasPermission } from "@/lib/rbac";
import { claimNextInvoiceNumber } from "@/lib/invoice";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { serverError } from "@/lib/apiError";

// Compares two tokens without leaking their contents through timing.
function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a || ""));
  const bufB = Buffer.from(String(b || ""));
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function GET(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    // A guest has no account, so they reach their own invoice with the
    // access token the order was issued with — the same mechanism the order
    // page and the downloads use.
    const guestToken = new URL(request.url).searchParams.get("t") || "";
    if (!session?.user && !guestToken) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!/^[0-9a-fA-F]{24}$/.test(String(params.id || ""))) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    const order = await Order.findById(params.id).select("+guestAccessToken").populate("user", "name email");
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    // Same ownership rule as the order-details endpoint: the customer who
    // placed it, the guest holding its access token, or staff with the
    // "orders" permission.
    //
    // `order.user` is null on a guest order — dereferencing it blindly threw
    // a 500 here, so a guest's invoice was unreachable and the invoice page
    // rendered blank.
    const isOwner = !!session?.user && !!order.user && order.user._id.toString() === session.user.id;
    const isGuestHolder =
      !!guestToken && !!order.guestAccessToken && timingSafeEqualStr(guestToken, order.guestAccessToken);
    const isStaff = !!session?.user && (await hasPermission(session, "orders"));
    if (!isOwner && !isGuestHolder && !isStaff) {
      return NextResponse.json({ success: false, message: "Not authorized" }, { status: 403 });
    }

    // assign an invoice number the first time anyone views this invoice
    // (atomic — see lib/invoice.js — safe even if two people open it at once)
    if (!order.invoiceNumber) {
      order.invoiceNumber = await claimNextInvoiceNumber();
      await order.save();
    }

    const settings = await Settings.findOne().lean();
    const billing = settings?.billing || {};
    const general = settings?.general || {};

    // The order document now carries guestAccessToken (selected above for
    // the ownership check). It must never go back out in the response.
    const safeOrder = order.toObject();
    delete safeOrder.guestAccessToken;

    return NextResponse.json({
      success: true,
      data: {
        order: safeOrder,
        billing: {
          legalName: billing.legalName || general.storeName || "",
          billingAddress: billing.billingAddress || general.storeAddress || "",
          country: billing.country || "",
          state: billing.state || "",
          city: billing.city || "",
          postalCode: billing.postalCode || "",
          phone: billing.phone || general.storePhone || "",
          email: billing.email || general.storeEmail || "",
          taxId: billing.taxId || "",
          invoice: {
            logo: billing.invoice?.logo || general.storeLogo || "",
            businessName: billing.invoice?.businessName || billing.legalName || general.storeName || "Online Store",
            address: billing.invoice?.address || billing.billingAddress || general.storeAddress || "",
            contactInfo: billing.invoice?.contactInfo || [general.storeEmail, general.storePhone].filter(Boolean).join(" · "),
            dateFormat: billing.invoice?.dateFormat || "DD MMM YYYY",
            currency: billing.invoice?.currency || "BDT",
            taxInfo: billing.invoice?.taxInfo || "",
            footerText: billing.invoice?.footerText || "Thank you for your business.",
            additionalNotes: billing.invoice?.additionalNotes || "",
            paymentInfo: billing.invoice?.paymentInfo || "",
          },
        },
      },
    });
  } catch (error) {
    return serverError(error, "api/orders/[id]/invoice");
  }
}
