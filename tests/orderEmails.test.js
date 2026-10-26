// tests/orderEmails.test.js
import { describe, it, expect } from "vitest";
import { orderConfirmationBody } from "@/lib/orderEmails";
import { emailTemplate } from "@/lib/notify";

const order = {
  orderNumber: "ORD-ABC123",
  paymentMethod: "cod",
  items: [
    { name: "Hot Ice Cream", quantity: 2, price: 90 },
    { name: '<img src=x onerror=alert(1)>', quantity: 1, price: 1200 },
  ],
  baseAmount: 1380, discountAmount: 100, discountCode: "SAVE100", shippingCost: 60, shippingMethodName: "Standard", totalAmount: 1340,
  shippingAddress: { fullName: "Rahim <b>Uddin</b>", phone: "01811223344", address: "House 12", city: "Savar" },
};

describe("order confirmation email", () => {
  const html = orderConfirmationBody(order);

  it("includes the order number, every item, and correctly formatted totals", () => {
    expect(html).toContain("ORD-ABC123");
    expect(html).toContain("Hot Ice Cream");
    expect(html).toContain("৳180"); // 2 × 90
    expect(html).toContain("৳1,340");
    expect(html).toContain("SAVE100");
    expect(html).toContain("Standard");
  });

  it("tells COD customers how much to have ready", () => {
    expect(html).toMatch(/have <b>৳1,340<\/b> ready/);
  });

  it("escapes customer-supplied text (product names, address)", () => {
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
    expect(html).not.toContain("<b>Uddin</b>");
  });

  it("shows free delivery when there's no charge", () => {
    expect(orderConfirmationBody({ ...order, shippingCost: 0 })).toContain("Free");
  });
});

describe("branded email layout", () => {
  it("carries the store's name and contact details", () => {
    const html = emailTemplate({ title: "Hi", message: "m", store: { storeName: "SumonShop", storeEmail: "help@x.com", storeAddress: "Savar" } });
    expect(html).toContain("SumonShop");
    expect(html).toContain("help@x.com");
    expect(html).toContain("Savar");
  });

  it("escapes store details and title too", () => {
    const html = emailTemplate({ title: "<script>", message: "m", store: { storeName: "<b>Evil</b>" } });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Evil</b>");
  });
});
