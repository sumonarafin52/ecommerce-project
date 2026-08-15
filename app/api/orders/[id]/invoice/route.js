// app/api/orders/[id]/invoice/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Settings from "@/models/Settings";
import { hasPermission } from "@/lib/rbac";
import { claimNextInvoiceNumber } from "@/lib/invoice";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const order = await Order.findById(params.id).populate("user", "name email");
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    // same ownership rule as the order-details endpoint: the customer who
    // placed it, or staff with the "orders" permission
    const isOwner = order.user._id.toString() === session.user.id;
    const isStaff = await hasPermission(session, "orders");
    if (!isOwner && !isStaff) {
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

    return NextResponse.json({
      success: true,
      data: {
        order,
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
            businessName: billing.invoice?.businessName || billing.legalName || general.storeName || "SumonMart",
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
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
