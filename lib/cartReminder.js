// lib/cartReminder.js
//
// Reminding a customer about a basket they left behind — and being honest
// about whether it worked.
//
// Every guard here exists because the alternative is a shop that nags:
//
//   consent      a customer who turned reminders off never gets one, and
//                every reminder carries the switch that turns them off
//   quota        one basket produces one reminder, counted on the basket
//                itself, so there is no loop to run away with
//   substance    a basket whose items have all sold out or been withdrawn
//                produces no email at all — "come back to your basket" is
//                a wasted trip if there is nothing left in it
//   attribution  a basket counts as recovered only if an order follows a
//                reminder that was actually sent, inside a fixed window
//
// Sending goes through notify(), so a reminder obeys the store's channel
// settings and lands in the delivery log beside every other message.
import Cart from "@/models/Cart";
import CartRecovery from "@/models/CartRecovery";
import User from "@/models/User";
import { notify } from "@/lib/notify";
import { revalidateCart } from "@/lib/cartRevalidation";
import { signLink } from "@/lib/signedLink";
import { formatCurrency } from "@/lib/utils";
import { dueForReminder, countsAsRecovery, ABANDONED_AFTER_HOURS, MAX_REMINDERS } from "@/lib/savedCart";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

/** Why a reminder was not sent — surfaced in the admin list, never guessed at. */
export const SKIP = {
  NOT_DUE: "not_due",
  OPTED_OUT: "opted_out",
  NO_EMAIL: "no_email",
  NOTHING_BUYABLE: "nothing_buyable",
  NO_CART: "no_cart",
  // The store has email switched off for this event, or has no SMTP set up
  // at all — so there is nothing to send with.
  EMAIL_OFF: "email_off",
  EMAIL_FAILED: "email_failed",
};

/**
 * Baskets that are ready for a reminder right now.
 *
 * The database narrows it (has items, untouched for long enough, never
 * reminded, not recovered) and lib/savedCart.js has the final say, so the
 * sweep and the admin list can never disagree about what "abandoned" means.
 */
export async function findDueCarts({ now = Date.now(), afterHours = ABANDONED_AFTER_HOURS, limit = 50 } = {}) {
  const cutoff = new Date(now - afterHours * 3600_000);

  const carts = await Cart.find({
    "items.0": { $exists: true },
    lastActivityAt: { $lte: cutoff },
    reminderCount: { $lt: MAX_REMINDERS },
  })
    .sort({ lastActivityAt: 1 })
    .limit(limit)
    .lean();

  return carts.filter((c) => dueForReminder(c, { now, afterHours }));
}

/**
 * Sends one reminder. Returns { sent, reason, value } — never throws, so a
 * single bad row can't stop a sweep.
 *
 * `force` is what the admin's "Send reminder" button passes: it skips the
 * timing checks (a shop owner looking at a basket may have a reason to nudge
 * it now) but NOT consent, and not the quota — those are the customer's,
 * not the shop's.
 */
export async function sendCartReminder(cartId, { force = false, now = Date.now() } = {}) {
  const cart = await Cart.findById(cartId).lean();
  if (!cart) return { sent: false, reason: SKIP.NO_CART };

  if (!force && !dueForReminder(cart, { now })) return { sent: false, reason: SKIP.NOT_DUE };
  if ((cart.reminderCount || 0) >= MAX_REMINDERS) return { sent: false, reason: SKIP.NOT_DUE };

  const user = await User.findById(cart.user).select("name email emailPrefs").lean();
  if (!user?.email) return { sent: false, reason: SKIP.NO_EMAIL };
  if (user.emailPrefs?.cartReminders === false) return { sent: false, reason: SKIP.OPTED_OUT };

  // Current prices and current availability — the email shows the shop as
  // it is today, not as it was when they left.
  const checked = await revalidateCart(cart.items.map((i) => ({ ...i, product: String(i.product) })));
  const buyable = checked.items.filter((l) => l.quantity > 0);
  if (!buyable.length) return { sent: false, reason: SKIP.NOTHING_BUYABLE };

  const value = buyable.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const itemCount = buyable.reduce((sum, l) => sum + l.quantity, 0);

  const optOutToken = signLink({ purpose: "cart_reminders_off", subject: String(cart.user) });

  const outcome = await notify({
    user: cart.user,
    type: "cart_reminder",
    title: itemCount === 1 ? "You left something in your basket" : `You left ${itemCount} items in your basket`,
    message: `Your basket is still here — ${formatCurrency(value)} waiting whenever you are.`,
    link: "/cart",
    linkLabel: "Back to my basket",
    emailHtml: reminderBody({ name: user.name, lines: buyable, value, optOutToken }),
  });

  // A reminder that did not leave the building is not a reminder. If the
  // store has email switched off for this event, or SMTP is not configured,
  // or the send failed, the basket keeps its place in the queue and the
  // admin is told the real reason — rather than being shown "sent" over an
  // email nobody will ever receive.
  if (!outcome?.email?.sent) {
    return { sent: false, reason: outcome?.email ? SKIP.EMAIL_FAILED : SKIP.EMAIL_OFF, detail: outcome?.email?.reason || "" };
  }

  await Cart.updateOne(
    { _id: cart._id },
    {
      $set: { reminderSentAt: new Date(now), reminderValue: value, reminderItemCount: itemCount },
      $inc: { reminderCount: 1 },
    }
  );

  return { sent: true, reason: "", value };
}

/** Runs the sweep. Returns a per-cart result, so a cron job can be audited. */
export async function sendDueReminders({ now = Date.now(), limit = 50 } = {}) {
  const due = await findDueCarts({ now, limit });
  const results = [];

  for (const cart of due) {
    try {
      const res = await sendCartReminder(cart._id, { now });
      results.push({ cart: String(cart._id), ...res });
    } catch (err) {
      results.push({ cart: String(cart._id), sent: false, reason: err.message });
    }
  }

  return { considered: due.length, sent: results.filter((r) => r.sent).length, results };
}

/**
 * Closes the loop after an order is placed.
 *
 * The basket is emptied either way — they bought it, it is not still
 * waiting for them — and is credited to the reminder only if one went out
 * recently. A shop that credits reminders with orders it would have had
 * anyway cannot tell whether reminders are worth sending.
 *
 * Never throws: this runs inside order creation, where nothing is allowed
 * to fail the order.
 */
export async function settleCartAfterOrder(userId, orderId, { now = Date.now() } = {}) {
  try {
    if (!userId) return { recovered: false };

    const cart = await Cart.findOne({ user: userId }).lean();
    if (!cart) return { recovered: false };

    const recovered = countsAsRecovery(cart, { now });

    if (recovered && orderId) {
      // Written once to its own record, where the customer's next basket
      // cannot overwrite it. Unique on the order, so a retried request
      // cannot count the same recovery twice.
      await CartRecovery.updateOne(
        { order: orderId },
        {
          $setOnInsert: {
            user: userId,
            order: orderId,
            value: cart.reminderValue || 0,
            itemCount: cart.reminderItemCount || 0,
            remindedAt: cart.reminderSentAt,
            recoveredAt: new Date(now),
          },
        },
        { upsert: true }
      );
    }

    // The basket is emptied either way — they bought it — and its reminder
    // history goes with it, so the next basket starts clean.
    await Cart.updateOne(
      { _id: cart._id },
      {
        $set: {
          items: [],
          lastActivityAt: new Date(now),
          reminderSentAt: null,
          reminderCount: 0,
          reminderValue: 0,
          reminderItemCount: 0,
        },
      }
    );

    return { recovered };
  } catch (err) {
    console.error("[cartReminder:settle]", err.message);
    return { recovered: false };
  }
}

// ---- the email ------------------------------------------------------

const td = "padding:8px 0;border-bottom:1px solid #EFE4C8;font-size:14px;color:#2B2318;";

function reminderBody({ name, lines, value, optOutToken }) {
  const siteUrl = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  const rows = lines
    .map(
      (l) => `
      <tr>
        <td style="${td}">${esc(l.name)} <span style="color:#8C8168;">× ${Number(l.quantity)}</span></td>
        <td style="${td}text-align:right;white-space:nowrap;">${esc(formatCurrency(l.price * l.quantity))}</td>
      </tr>`
    )
    .join("");

  // Stock pressure only where it is true. "Only 2 left" on a shelf of forty
  // is the kind of invented urgency that teaches people to distrust a shop.
  const low = lines.filter((l) => l.stock > 0 && l.stock <= 3);
  const lowNote = low.length
    ? `<p style="margin:14px 0 0;font-size:13px;color:#A13A3A;">Running low: ${low
        .map((l) => `${esc(l.name)} (${Number(l.stock)} left)`)
        .join(", ")}</p>`
    : "";

  return `
    <p style="margin:0 0 6px;font-size:15px;color:#2B2318;">Hi ${esc(name || "there")},</p>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#4A3F2E;">
      You left these in your basket. We've kept them for you — prices below are today's.
    </p>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${rows}</table>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:10px;">
      <tr>
        <td style="padding:8px 0;font-size:15px;font-weight:bold;color:#1E3A5F;">Total</td>
        <td style="padding:8px 0;font-size:15px;font-weight:bold;color:#1E3A5F;text-align:right;">${esc(formatCurrency(value))}</td>
      </tr>
    </table>
    ${lowNote}

    <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#8C8168;">
      Don't want basket reminders?
      <a href="${esc(siteUrl)}/email-preferences?token=${esc(optOutToken)}" style="color:#8C8168;">Turn them off</a>
      — this only stops reminders, never anything about your orders.
    </p>`;
}
