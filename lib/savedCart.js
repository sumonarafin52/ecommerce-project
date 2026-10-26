// lib/savedCart.js
//
// The rules for a basket that follows its owner between devices, and for
// deciding when one has been abandoned.
//
// Deliberately free of database and browser imports: the merge runs in the
// browser the moment somebody signs in, the abandonment rules run on the
// server during the reminder sweep, and both are the sort of thing that is
// much easier to trust once it can be tested directly.
import { normaliseCartInput } from "@/lib/cartIssues";

/** Two lines are the same line only if the variant matches too. */
export const cartKey = (item) => `${item.product ?? item._id}:${item.combinationKey || ""}`;

/** The hours a basket sits untouched before it counts as abandoned. */
export const ABANDONED_AFTER_HOURS = 4;

/** How many reminders one abandoned basket may ever produce. */
export const MAX_REMINDERS = 1;

/**
 * An order placed within this window of a reminder is credited to it.
 * Long enough to cover somebody who reads the email that evening and buys
 * the next day; short enough that an unrelated purchase a fortnight later
 * is not quietly claimed as a recovery.
 */
export const RECOVERY_WINDOW_HOURS = 72;

/**
 * Combines the basket in this browser with the one on the server.
 *
 * Quantities are taken at their HIGHEST, never summed. Summing looks
 * reasonable until the same cart syncs twice — sign in on the laptop where
 * you already have two of something and it becomes four, which a shopper
 * reads as the shop trying its luck. Taking the larger of the two is the
 * only merge that can run repeatedly without changing the answer.
 */
export function mergeCartItems(localItems, serverItems) {
  const merged = new Map();

  for (const list of [serverItems, localItems]) {
    for (const item of normaliseCartInput(list)) {
      const key = cartKey(item);
      const existing = merged.get(key);
      if (!existing) merged.set(key, { ...item });
      else existing.quantity = Math.max(existing.quantity, item.quantity);
    }
  }

  return [...merged.values()];
}

/** The shape stored on the Cart document — ids, variants, quantities only. */
export function toStoredItems(rawItems) {
  return normaliseCartInput(rawItems).map((i) => ({
    product: i.product,
    combinationKey: i.combinationKey || "",
    quantity: i.quantity,
  }));
}

/** True when two carts hold the same lines in the same quantities. */
export function sameCart(a, b) {
  const key = (list) =>
    toStoredItems(list)
      .map((i) => `${cartKey(i)}x${i.quantity}`)
      .sort()
      .join("|");
  return key(a) === key(b);
}

/**
 * Has this basket been left behind?
 *
 * An empty basket is not abandoned — there is nothing to come back to, and
 * that covers the bought ones too: placing an order empties the basket.
 */
export function isAbandoned(cart, { now = Date.now(), afterHours = ABANDONED_AFTER_HOURS } = {}) {
  if (!cart || !cart.items?.length) return false;
  const last = new Date(cart.lastActivityAt || cart.updatedAt || 0).getTime();
  return now - last >= afterHours * 3600_000;
}

/**
 * Should this basket produce a reminder right now?
 *
 * Everything here is a reason NOT to send, which is the right bias for a
 * message nobody asked for:
 *   - it is not actually abandoned yet, or is already recovered
 *   - the shop has already sent its quota of reminders
 *   - a reminder has gone out since the shopper last touched the basket,
 *     so sending again would be nagging about the same thing
 *
 * Consent is checked separately, by the caller, against the account — it
 * needs the customer record, and this stays free of database imports.
 */
export function dueForReminder(cart, { now = Date.now(), afterHours = ABANDONED_AFTER_HOURS, maxReminders = MAX_REMINDERS } = {}) {
  if (!isAbandoned(cart, { now, afterHours })) return false;
  if ((cart.reminderCount || 0) >= maxReminders) return false;

  const sent = cart.reminderSentAt ? new Date(cart.reminderSentAt).getTime() : 0;
  const touched = new Date(cart.lastActivityAt || cart.updatedAt || 0).getTime();
  if (sent && sent >= touched) return false;

  return true;
}

/**
 * Does an order placed now count as this reminder working?
 *
 * Only ever true for a basket that was actually reminded — a shop that
 * credits its reminder emails with orders it would have got anyway is
 * lying to itself about what they are worth.
 */
export function countsAsRecovery(cart, { now = Date.now(), windowHours = RECOVERY_WINDOW_HOURS } = {}) {
  if (!cart?.reminderSentAt) return false;
  return now - new Date(cart.reminderSentAt).getTime() <= windowHours * 3600_000;
}

/**
 * What the admin list shows as this basket's state.
 *
 * "recovered" is not one of them: a recovery is an event in the past, kept
 * in its own record (models/CartRecovery.js), not a state a live basket is
 * ever in.
 */
export function cartState(cart, { now = Date.now(), afterHours = ABANDONED_AFTER_HOURS } = {}) {
  if (!cart?.items?.length) return "empty";
  if (cart.reminderSentAt) return "reminded";
  return isAbandoned(cart, { now, afterHours }) ? "abandoned" : "active";
}
