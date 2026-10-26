// lib/orderEmails.js
//
// Rich order-confirmation email body. Previously the confirmation was one
// line ("…your order #X for 2799" — not even a currency symbol) with no
// items, address or totals. Inline styles only: most email clients strip
// <style> blocks and external CSS.
import { formatCurrency } from "@/lib/utils";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const td = "padding:8px 0;border-bottom:1px solid #EFE4C8;font-size:14px;color:#2B2318;";

export function orderConfirmationBody(order) {
  const online = order.paymentMethod !== "cod";
  const a = order.shippingAddress || {};
  const rows = (order.items || [])
    .map(
      (it) => `
      <tr>
        <td style="${td}">${esc(it.name)} <span style="color:#8C8168;">× ${Number(it.quantity)}</span></td>
        <td style="${td}text-align:right;white-space:nowrap;">${esc(formatCurrency(it.price * it.quantity))}</td>
      </tr>`
    )
    .join("");

  const line = (label, value, color = "#4A3F2E") =>
    `<tr><td style="padding:4px 0;font-size:14px;color:${color};">${label}</td><td style="padding:4px 0;font-size:14px;color:${color};text-align:right;">${value}</td></tr>`;

  return `
    <p style="margin:0 0 6px;font-size:15px;color:#2B2318;">Hi ${esc(a.fullName || "there")},</p>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#4A3F2E;">
      Thanks for your order! ${
        online
          ? "We'll confirm once your payment has been received."
          : `It's confirmed — please have <b>${esc(formatCurrency(order.totalAmount))}</b> ready when it's delivered.`
      }
    </p>

    <div style="background:#FBF5E9;border-radius:10px;padding:12px 16px;margin:0 0 18px;">
      <span style="font-size:12px;color:#8C8168;">Order number</span><br>
      <span style="font-family:monospace;font-size:17px;font-weight:bold;color:#1E3A5F;letter-spacing:.5px;">${esc(order.orderNumber)}</span>
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${rows}</table>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:10px;">
      ${line("Subtotal", esc(formatCurrency(order.baseAmount)))}
      ${
        order.discountAmount > 0
          ? line(`Discount${order.discountCode ? ` (${esc(order.discountCode)})` : ""}`, `− ${esc(formatCurrency(order.discountAmount))}`, "#2F7A3E")
          : ""
      }
      ${line(`Delivery${order.shippingMethodName ? ` (${esc(order.shippingMethodName)})` : ""}`, order.shippingCost > 0 ? esc(formatCurrency(order.shippingCost)) : "Free")}
      <tr><td style="padding:10px 0 0;font-size:15px;font-weight:bold;color:#2B2318;border-top:2px solid #EFE4C8;">Total</td>
          <td style="padding:10px 0 0;font-size:17px;font-weight:bold;color:#1E3A5F;text-align:right;border-top:2px solid #EFE4C8;">${esc(formatCurrency(order.totalAmount))}</td></tr>
    </table>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;">
      <tr>
        <td style="vertical-align:top;width:55%;padding-right:12px;">
          <p style="margin:0 0 4px;font-size:12px;font-weight:bold;color:#8C8168;text-transform:uppercase;">Delivering to</p>
          <p style="margin:0;font-size:13.5px;line-height:1.55;color:#2B2318;">
            ${esc(a.fullName)}<br>${esc(a.phone)}<br>${esc([a.address, a.city, a.state, a.postalCode].filter(Boolean).join(", "))}
          </p>
        </td>
        <td style="vertical-align:top;">
          <p style="margin:0 0 4px;font-size:12px;font-weight:bold;color:#8C8168;text-transform:uppercase;">Payment</p>
          <p style="margin:0;font-size:13.5px;line-height:1.55;color:#2B2318;">${online ? "Online payment" : "Cash on delivery"}</p>
        </td>
      </tr>
    </table>`;
}
