// lib/notifications/events.js
//
// Every kind of notification the store can send, in one place.
//
// Notifications used to be decided at each call site: a route picked a type
// string, and notify() always did the same two things with it (an in-app
// row and an email). There was no way to say "text the customer when their
// order ships but don't email them about stock alerts", and no way to add a
// channel without editing every caller.
//
// The ids here are the `type` values the call sites already pass, so this
// catalogue describes the system as it is rather than renaming everything.
//
// `smsWorthy` marks the events worth paying for a text message: short,
// time-critical, and about something the customer is waiting on. An SMS that
// says "someone answered your product question" is an annoyance; one that
// says "your order is out for delivery" is the reason people give you their
// number.

export const AUDIENCE = { CUSTOMER: "customer", STAFF: "staff" };

export const NOTIFICATION_EVENTS = [
  {
    id: "order_status",
    label: "Order status changed",
    description: "Confirmed, processing, shipped, delivered, cancelled.",
    audience: AUDIENCE.CUSTOMER,
    smsWorthy: true,
    defaults: { inApp: true, email: true, sms: false },
  },
  {
    id: "payment",
    label: "Payment received or failed",
    description: "Sent when a payment is confirmed or declined.",
    audience: AUDIENCE.CUSTOMER,
    smsWorthy: true,
    defaults: { inApp: true, email: true, sms: false },
  },
  {
    id: "shipment",
    label: "Shipment created or updated",
    description: "Tracking number issued, parcel handed to the courier, out for delivery.",
    audience: AUDIENCE.CUSTOMER,
    smsWorthy: true,
    defaults: { inApp: true, email: true, sms: false },
  },
  {
    id: "refund",
    label: "Refund processed",
    audience: AUDIENCE.CUSTOMER,
    smsWorthy: true,
    defaults: { inApp: true, email: true, sms: false },
  },
  {
    id: "return",
    label: "Return request updated",
    audience: AUDIENCE.CUSTOMER,
    smsWorthy: false,
    defaults: { inApp: true, email: true, sms: false },
  },
  {
    id: "account",
    label: "Account changes",
    description: "Password changes, access to a purchase being granted or withdrawn.",
    audience: AUDIENCE.CUSTOMER,
    smsWorthy: false,
    defaults: { inApp: true, email: true, sms: false },
  },
  {
    id: "stock_alert",
    label: "Back in stock",
    description: "Sent to customers who asked to be told when an item returns.",
    audience: AUDIENCE.CUSTOMER,
    smsWorthy: false,
    defaults: { inApp: true, email: true, sms: false },
  },
  {
    id: "question",
    label: "Product question answered",
    audience: AUDIENCE.CUSTOMER,
    smsWorthy: false,
    defaults: { inApp: true, email: true, sms: false },
  },
  {
    id: "support",
    label: "Support ticket activity",
    audience: AUDIENCE.CUSTOMER,
    smsWorthy: false,
    defaults: { inApp: true, email: true, sms: false },
  },
  {
    id: "cart_reminder",
    label: "Basket reminder",
    description: "One email about a basket the customer left behind. Never sent to anyone who has turned reminders off.",
    audience: AUDIENCE.CUSTOMER,
    // A basket is not urgent enough to be worth a text message, and a shop
    // that texts people about shopping is a shop people block.
    smsWorthy: false,
    // No in-app copy: it would still be sitting in the notifications list
    // long after the basket was bought or abandoned for good.
    defaults: { inApp: false, email: true, sms: false },
  },
  {
    id: "promo",
    label: "Promotions",
    description: "Marketing messages. Off by default — these need consent, not just an address.",
    audience: AUDIENCE.CUSTOMER,
    smsWorthy: false,
    defaults: { inApp: false, email: false, sms: false },
  },
  {
    id: "inventory",
    label: "Low stock (staff)",
    description: "Warns staff that an item is running out. Never sent to customers.",
    audience: AUDIENCE.STAFF,
    smsWorthy: false,
    defaults: { inApp: true, email: true, sms: false },
  },
];

const BY_ID = new Map(NOTIFICATION_EVENTS.map((e) => [e.id, e]));

export function getEvent(id) {
  return BY_ID.get(String(id || "")) || null;
}

/**
 * Which channels should carry this event, given the store's settings.
 *
 * Resolution order, most specific first:
 *   1. the store's per-event setting, if an admin has set one
 *   2. the event's own default
 * A channel that's switched off globally overrides both — turning email off
 * means off, not "off unless an event asks for it".
 *
 * An unknown event id still gets the baseline in-app + email rather than
 * being dropped: a notification nobody catalogued is still a notification
 * somebody meant to send.
 */
export function channelsFor(eventId, settings = {}) {
  const event = getEvent(eventId);
  const defaults = event?.defaults || { inApp: true, email: true, sms: false };
  const perEvent = settings?.events?.[eventId] || {};
  const global = settings?.channels || {};

  const pick = (name) => {
    const wanted = perEvent[name] === undefined ? defaults[name] : !!perEvent[name];
    // Only an explicit `false` switches a channel off.
    //
    // An existing store has no `notifications` block in its settings until
    // somebody opens the new page. Treating "absent" as "off" meant every
    // such store would silently stop emailing its customers the moment this
    // shipped — so absent means "not configured", and the event's own
    // default decides. SMS is safe under the same rule because no event
    // defaults to SMS, and the gateway refuses to send when unconfigured.
    const globallyOn = global[name] !== false;
    return wanted && globallyOn;
  };

  return { inApp: pick("inApp"), email: pick("email"), sms: pick("sms") };
}
