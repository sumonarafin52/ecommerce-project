// tests/notifications.test.js
//
// The notification pipeline: which channels carry which events, the SMS
// gateway, and the delivery log.
//
// SMS costs money per message and goes to a real phone, so the cases that
// matter most are the ones where it must NOT fire.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import User from "@/models/User";
import Settings from "@/models/Settings";
import Notification from "@/models/Notification";
import NotificationLog from "@/models/NotificationLog";

process.env.PAYMENT_ENCRYPTION_KEY = process.env.PAYMENT_ENCRYPTION_KEY || "test-key-for-encrypting-credentials";

const sendEmail = vi.fn(async () => ({ sent: true }));
vi.mock("@/lib/email", () => ({ sendEmail: (...a) => sendEmail(...a) }));

const fetchMock = vi.fn(async () => new Response("OK: message sent", { status: 200 }));
vi.stubGlobal("fetch", fetchMock);

const { notify } = await import("@/lib/notify");
const { channelsFor, NOTIFICATION_EVENTS, getEvent } = await import("@/lib/notifications/events");
const { normalizePhone, smsBody, sendSms, isSendablePhone } = await import("@/lib/notifications/sms");

let buyer;

const smsConfigured = (over = {}) =>
  Settings.findOneAndUpdate(
    {},
    {
      notifications: {
        channels: { inApp: true, email: true, sms: true },
        events: {},
        sms: {
          enabled: true,
          urlTemplate: "https://sms.example.net/send?api_key={apiKey}&to={to}&msg={text}",
          method: "GET",
          senderId: "SHOP",
          ...over,
        },
      },
    },
    { upsert: true, new: true }
  );

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});
beforeEach(async () => {
  await clearTestDB();
  sendEmail.mockClear();
  fetchMock.mockClear();
  fetchMock.mockResolvedValue(new Response("OK: message sent", { status: 200 }));
  buyer = await User.create({ name: "Buyer", email: "b@test.com", password: "x".repeat(20) });
});

describe("phone numbers", () => {
  it("normalises the ways Bangladeshi customers actually type them", () => {
    // 880 + the full 01... number = 13 digits. An earlier version stripped
    // the leading zero and produced 12, which every gateway rejects — so
    // every single SMS would have failed.
    for (const input of ["01711223344", "+8801711223344", "8801711223344", "017 1122 3344", "017-1122-3344"]) {
      expect(normalizePhone(input), input).toBe("8801711223344");
    }
  });

  it("leaves a non-Bangladeshi number alone apart from punctuation", () => {
    expect(normalizePhone("+1 (415) 555-0100")).toBe("14155550100");
  });

  it("rejects something that can't be a number", () => {
    expect(isSendablePhone("")).toBe(false);
    expect(isSendablePhone("12")).toBe(false);
    expect(isSendablePhone("01711223344")).toBe(true);
  });
});

describe("message body", () => {
  it("strips markup and collapses whitespace", () => {
    expect(smsBody("<b>Hello</b>\n\n  there ")).toBe("Hello there");
  });

  it("trims to one billed segment rather than sending three", () => {
    const body = smsBody("x".repeat(400));
    expect(body.length).toBeLessThanOrEqual(160);
    expect(body.endsWith("…")).toBe(true);
  });
});

describe("the SMS gateway", () => {
  it("fills the template the admin configured and reports success", async () => {
    await smsConfigured();
    const res = await sendSms({ to: "01711223344", text: "Your order has shipped" });
    expect(res.sent).toBe(true);

    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain("to=8801711223344");
    expect(url).toContain("Your%20order%20has%20shipped");
  });

  it("does nothing when no gateway is configured", async () => {
    const res = await sendSms({ to: "01711223344", text: "hi" });
    expect(res.sent).toBe(false);
    expect(res.reason).toMatch(/not configured/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats an error in a 200 body as a failure — these gateways rarely use status codes", async () => {
    await smsConfigured();
    fetchMock.mockResolvedValue(new Response("ERROR: insufficient balance", { status: 200 }));
    const res = await sendSms({ to: "01711223344", text: "hi" });
    expect(res.sent).toBe(false);
    expect(res.reason).toMatch(/insufficient balance/);
  });

  it("reports an HTTP failure with what the gateway said", async () => {
    await smsConfigured();
    fetchMock.mockResolvedValue(new Response("bad key", { status: 401 }));
    const res = await sendSms({ to: "01711223344", text: "hi" });
    expect(res.sent).toBe(false);
    expect(res.reason).toContain("401");
  });

  it("never throws when the gateway is unreachable", async () => {
    await smsConfigured();
    fetchMock.mockRejectedValue(new Error("ENOTFOUND"));
    const res = await sendSms({ to: "01711223344", text: "hi" });
    expect(res.sent).toBe(false);
    expect(res.reason).toContain("ENOTFOUND");
  });

  it("builds a POST body when the provider needs one", async () => {
    await smsConfigured({
      method: "POST",
      contentType: "application/json",
      bodyTemplate: '{"key":"{apiKey}","to":"{to}","text":"{text}"}',
    });
    await sendSms({ to: "01711223344", text: "hello" });
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body).to).toBe("8801711223344");
  });
});

describe("channel routing", () => {
  it("falls back to each event's own defaults when nothing is configured", () => {
    const c = channelsFor("order_status", { channels: { inApp: true, email: true, sms: false } });
    expect(c).toEqual({ inApp: true, email: true, sms: false });
  });

  it("an upgrading store with no notification settings at all keeps emailing", () => {
    // Existing stores have no `notifications` block until somebody opens the
    // settings page. Treating that as "every channel off" would have
    // silently stopped all customer email the moment this shipped.
    const c = channelsFor("order_status", {});
    expect(c.email).toBe(true);
    expect(c.inApp).toBe(true);
    // ...but still no surprise text messages
    expect(c.sms).toBe(false);
  });

  it("an unconfigured store does not start texting even for an sms-worthy event", () => {
    const c = channelsFor("shipment", {});
    expect(c.sms).toBe(false);
  });

  it("a channel switched off globally overrides a per-event setting", () => {
    const c = channelsFor("order_status", {
      channels: { inApp: true, email: false, sms: true },
      events: { order_status: { inApp: true, email: true, sms: true } },
    });
    expect(c.email).toBe(false);
    expect(c.sms).toBe(true);
  });

  it("a per-event setting overrides the default", () => {
    const c = channelsFor("stock_alert", {
      channels: { inApp: true, email: true, sms: true },
      events: { stock_alert: { inApp: false, email: false, sms: false } },
    });
    expect(c).toEqual({ inApp: false, email: false, sms: false });
  });

  it("an uncatalogued event still gets the baseline rather than being dropped", () => {
    const c = channelsFor("something_new", { channels: { inApp: true, email: true, sms: true } });
    expect(c.inApp).toBe(true);
    expect(c.email).toBe(true);
  });

  it("every catalogued event has defaults, and promo is off until someone opts in", () => {
    for (const ev of NOTIFICATION_EVENTS) {
      expect(ev.defaults, ev.id).toBeTruthy();
      expect(typeof ev.defaults.sms, ev.id).toBe("boolean");
      // nothing ships texting customers by default — that's a billed decision
      expect(ev.defaults.sms, `${ev.id} must not default to SMS`).toBe(false);
    }
    expect(getEvent("promo").defaults).toEqual({ inApp: false, email: false, sms: false });
  });
});

describe("notify() end to end", () => {
  it("creates an in-app notification and sends an email for an account holder", async () => {
    await Settings.create({ notifications: { channels: { inApp: true, email: true, sms: false } } });
    await notify({ user: buyer._id, type: "order_status", title: "Order placed", message: "Thanks!" });

    expect(await Notification.countDocuments({ user: buyer._id })).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe("b@test.com");
  });

  it("texts the customer when the event and the store both allow it", async () => {
    await smsConfigured();
    await Settings.updateOne({}, { $set: { "notifications.events.order_status": { inApp: true, email: true, sms: true } } });

    await notify({
      user: buyer._id,
      phone: "01711223344",
      type: "order_status",
      title: "Shipped",
      message: "Your order is on its way.",
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toContain("8801711223344");
  });

  it("does not text for an event that isn't worth a text, even if switched on", async () => {
    await smsConfigured();
    // "question" is not smsWorthy — turning it on must not start texting
    await Settings.updateOne({}, { $set: { "notifications.events.question": { inApp: true, email: true, sms: true } } });

    await notify({
      user: buyer._id,
      phone: "01711223344",
      type: "question",
      title: "Answered",
      message: "Someone answered your question.",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not text when no phone number was passed", async () => {
    await smsConfigured();
    await Settings.updateOne({}, { $set: { "notifications.events.order_status": { inApp: true, email: true, sms: true } } });
    await notify({ user: buyer._id, type: "order_status", title: "Shipped", message: "On its way." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reaches a guest by email and SMS, with no in-app row", async () => {
    await smsConfigured();
    await Settings.updateOne({}, { $set: { "notifications.events.order_status": { inApp: true, email: true, sms: true } } });

    await notify({
      guestEmail: "guest@test.com",
      phone: "01799887766",
      type: "order_status",
      title: "Order placed",
      message: "Thanks!",
    });

    expect(sendEmail.mock.calls[0][0].to).toBe("guest@test.com");
    expect(fetchMock.mock.calls[0][0]).toContain("8801799887766");
    expect(await Notification.countDocuments()).toBe(0);
  });

  it("does nothing at all when there's nobody to reach", async () => {
    await Settings.create({});
    await notify({ type: "order_status", title: "x", message: "y" });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(await NotificationLog.countDocuments()).toBe(0);
  });

  it("never throws, even when a channel fails", async () => {
    await smsConfigured();
    sendEmail.mockRejectedValueOnce(new Error("smtp exploded"));
    // It returns what happened per channel rather than throwing — the
     // basket reminder reads this to avoid recording a reminder for an
     // email that never left. A channel blowing up must still not take the
     // operation it was called from down with it.
    const outcome = await notify({ user: buyer._id, type: "order_status", title: "x", message: "y" });
    expect(outcome.email?.sent).not.toBe(true);
  });
});

describe("the delivery log", () => {
  it("records what went out, and where", async () => {
    await Settings.create({ notifications: { channels: { inApp: true, email: true, sms: false } } });
    await notify({ user: buyer._id, type: "order_status", title: "Order placed", message: "Thanks!" });

    const rows = await NotificationLog.find({}).lean();
    const channels = rows.map((r) => r.channel).sort();
    expect(channels).toEqual(["email", "inApp"]);
    const emailRow = rows.find((r) => r.channel === "email");
    expect(emailRow.sent).toBe(true);
    expect(emailRow.recipient).toBe("b@test.com");
    expect(emailRow.event).toBe("order_status");
  });

  it("records a failure with the reason, so support can see it", async () => {
    await smsConfigured();
    await Settings.updateOne({}, { $set: { "notifications.events.order_status": { inApp: false, email: false, sms: true } } });
    fetchMock.mockResolvedValue(new Response("ERROR: invalid number", { status: 200 }));

    await notify({ user: buyer._id, phone: "01711223344", type: "order_status", title: "Shipped", message: "x" });

    const row = await NotificationLog.findOne({ channel: "sms" }).lean();
    expect(row.sent).toBe(false);
    expect(row.reason).toMatch(/invalid number/);
  });

  it("never stores the gateway credential", async () => {
    await smsConfigured({ apiKey: "" });
    await Settings.updateOne({}, { $set: { "notifications.events.order_status": { inApp: false, email: false, sms: true } } });
    await notify({ user: buyer._id, phone: "01711223344", type: "order_status", title: "x", message: "y" });

    const all = JSON.stringify(await NotificationLog.find({}).lean());
    expect(all).not.toContain("api_key");
    expect(all).not.toContain("urlTemplate");
  });
});

describe("settings exposure", () => {
  it("keeps notification routing and the gateway out of the public settings", async () => {
    const { toPublicJSON } = await import("@/lib/settingsService");
    const settings = await smsConfigured();
    const pub = toPublicJSON(settings);
    expect(pub.notifications).toBeUndefined();
    expect(JSON.stringify(pub)).not.toContain("sms.example.net");
  });

  it("masks the gateway key in the admin view", async () => {
    const { toAdminSafeJSON } = await import("@/lib/settingsService");
    const { encryptSecret } = await import("@/lib/crypto");
    const settings = await smsConfigured({ apiKey: encryptSecret("super-secret-key") });
    const admin = toAdminSafeJSON(settings);
    expect(admin.notifications.sms.apiKey).not.toContain("super-secret-key");
    expect(JSON.stringify(admin)).not.toContain("super-secret-key");
  });
});
