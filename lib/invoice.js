// lib/invoice.js
import Settings from "@/models/Settings";

// Atomically claims the next invoice number and formats it as
// "{prefix}{zero-padded number}", e.g. "INV-00001". Uses $inc so two
// invoices generated at the same moment never collide, even under
// concurrent requests.
export async function claimNextInvoiceNumber() {
  // ensure the singleton settings doc exists with proper schema defaults
  // (mirrors the same pattern used in app/api/settings/route.js)
  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create({});

  // $inc first, but read the value *before* the increment so this
  // invoice gets the number that was "next" — findOneAndUpdate with
  // new:false (the default) returns the pre-update document
  const before = await Settings.findOneAndUpdate(
    { _id: settings._id },
    { $inc: { "billing.nextInvoiceNumber": 1 } }
  );
  const n = before?.billing?.nextInvoiceNumber || 1;
  const prefix = before?.billing?.invoice?.numberPrefix ?? "INV-";
  const padding = before?.billing?.invoice?.numberPadding ?? 5;
  return `${prefix}${String(n).padStart(padding, "0")}`;
}

export function formatInvoiceDate(date, format = "DD MMM YYYY") {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  if (format === "MM/DD/YYYY") return `${String(d.getMonth() + 1).padStart(2, "0")}/${day}/${year}`;
  if (format === "YYYY-MM-DD") return `${year}-${String(d.getMonth() + 1).padStart(2, "0")}-${day}`;
  return `${day} ${month} ${year}`; // default "DD MMM YYYY"
}
