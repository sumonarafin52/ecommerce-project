// tests/cartReminder.test.js
//
// The reminder a shop sends about a basket somebody left behind.
//
// Every test here is a reason NOT to send, because that is where this kind
// of feature goes wrong: a shop that mails somebody who opted out, mails
// twice about the same basket, mails about items that have sold out, or
// claims credit for an order it had nothing to do with.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import Cart from "@/models/Cart";
import User from "@/models/User";
import NotificationLog from "@/models/NotificationLog";
import CartRecovery from "@/models/CartRecovery";

// The only thing stubbed is the SMTP hop itself — notify(), the channel
// settings, the delivery log and the template all run for real.
const sent = [];
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async (msg) => {
    sent.push(msg);
    return { sent: true };
  }),
}));

process.env.NEXTAUTH_SECRET = "test-secret-for-signed-links";

const { sendCartReminder, sendDueReminders, findDueCarts, settleCartAfterOrder, SKIP } = await import("@/lib/cartReminder");
const { signLink, verifyLink } = await import("@/lib/signedLink");

let n = 0;
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000);
const make = (o = {}) =>
  Product.create({ name: `P${++n}`, slug: `p-${n}-${Date.now()}`, price: 100, category: "C", stock: 5, status: "public", ...o });

const makeUser = (o = {}) => User.create({ name: "Shopper", email: `s${++n}@example.com`, password: "x".repeat(20), ...o });

const makeCart = async (user, product, o = {}) =>
  Cart.create({
    user: user._id,
    items: [{ product: product._id, combinationKey: "", quantity: 2 }],
    lastActivityAt: hoursAgo(10),
    ...o,
  });

beforeAll(async () => {
  await startTestDB();
}, 90000);
afterAll(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  sent.length = 0;
});

describe("sending a reminder", () => {
  it("emails the customer and records that it did", async () => {
    const user = await makeUser();
    const product = await make({ name: "Ceramic Mug", price: 450 });
    const cart = await makeCart(user, product);

    const res = await sendCartReminder(cart._id);

    expect(res.sent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(user.email);
    expect(sent[0].html).toContain("Ceramic Mug");

    const after = await Cart.findById(cart._id).lean();
    expect(after.reminderCount).toBe(1);
    expect(after.reminderSentAt).toBeTruthy();
    // Kept because a recovered basket is emptied — without it, a successful
    // recovery would show in the admin list as a row worth nothing.
    expect(after.reminderValue).toBe(900);
    expect(after.reminderItemCount).toBe(2);

    const log = await NotificationLog.findOne({ event: "cart_reminder", channel: "email" }).lean();
    expect(log.sent).toBe(true);
  });

  it("prices the basket as it is today, not as it was", async () => {
    const user = await makeUser();
    const product = await make({ price: 100 });
    const cart = await makeCart(user, product);

    await Product.updateOne({ _id: product._id }, { $set: { price: 150 } });
    const res = await sendCartReminder(cart._id);

    expect(res.value).toBe(300);
  });

  it("carries a working opt-out link", async () => {
    const user = await makeUser();
    const cart = await makeCart(user, await make());

    await sendCartReminder(cart._id);

    const token = sent[0].html.match(/token=([A-Za-z0-9_.-]+)/)?.[1];
    expect(token).toBeTruthy();
    // Minted for one purpose, and useless for any other.
    expect(verifyLink(token, "cart_reminders_off").subject).toBe(String(user._id));
    expect(verifyLink(token, "something_else")).toBeNull();
  });
});

describe("reasons not to send", () => {
  it("never emails a customer who turned reminders off", async () => {
    const user = await makeUser({ emailPrefs: { cartReminders: false } });
    const cart = await makeCart(user, await make());

    const res = await sendCartReminder(cart._id, { force: true });

    expect(res).toEqual({ sent: false, reason: SKIP.OPTED_OUT });
    expect(sent).toHaveLength(0);
    // And the refusal leaves no trace on the basket, so it stays visible
    // in the admin list rather than looking as if it had been handled.
    expect((await Cart.findById(cart._id).lean()).reminderCount).toBe(0);
  });

  it("does not send about a basket of sold-out items", async () => {
    const user = await makeUser();
    const cart = await makeCart(user, await make({ stock: 0 }));

    const res = await sendCartReminder(cart._id, { force: true });

    expect(res.reason).toBe(SKIP.NOTHING_BUYABLE);
    expect(sent).toHaveLength(0);
  });

  it("does not send about a basket of withdrawn products", async () => {
    const user = await makeUser();
    const cart = await makeCart(user, await make({ status: "draft" }));

    expect((await sendCartReminder(cart._id, { force: true })).reason).toBe(SKIP.NOTHING_BUYABLE);
  });

  it("still sends when only some of the basket is gone", async () => {
    const user = await makeUser();
    const gone = await make({ stock: 0, name: "Sold Out Thing" });
    const kept = await make({ name: "Still Here", price: 200 });
    const cart = await Cart.create({
      user: user._id,
      items: [
        { product: gone._id, quantity: 1 },
        { product: kept._id, quantity: 1 },
      ],
      lastActivityAt: hoursAgo(10),
    });

    const res = await sendCartReminder(cart._id);

    expect(res.sent).toBe(true);
    expect(res.value).toBe(200); // only what can actually be bought
    expect(sent[0].html).toContain("Still Here");
    expect(sent[0].html).not.toContain("Sold Out Thing");
  });

  it("refuses a second reminder for the same basket, even when forced", async () => {
    const user = await makeUser();
    const cart = await makeCart(user, await make(), { reminderCount: 1, reminderSentAt: hoursAgo(3) });

    // `force` is for the shop's timing, not for overriding the customer's
    // quota — a button that can be pressed twice is a button that nags.
    expect((await sendCartReminder(cart._id, { force: true })).reason).toBe(SKIP.NOT_DUE);
    expect(sent).toHaveLength(0);
  });

  it("does not record a reminder for an email that never left", async () => {
    // A shop with no SMTP configured, or with email switched off for this
    // event, must not end up with baskets marked "reminded" and customers
    // who were never told anything.
    const { sendEmail } = await import("@/lib/email");
    sendEmail.mockImplementationOnce(async () => ({ sent: false, reason: "email not configured" }));

    const user = await makeUser();
    const cart = await makeCart(user, await make());

    const res = await sendCartReminder(cart._id);

    expect(res.sent).toBe(false);
    expect(res.reason).toBe(SKIP.EMAIL_FAILED);

    const after = await Cart.findById(cart._id).lean();
    expect(after.reminderCount).toBe(0);
    expect(after.reminderSentAt).toBeNull();
    // So the next sweep tries again rather than writing it off.
    expect((await findDueCarts()).map((c) => String(c._id))).toContain(String(cart._id));
  });

  it("does not send about a basket the shopper is still using", async () => {
    const user = await makeUser();
    const cart = await makeCart(user, await make(), { lastActivityAt: hoursAgo(1) });

    expect((await sendCartReminder(cart._id)).reason).toBe(SKIP.NOT_DUE);
  });
});

describe("the sweep", () => {
  it("picks up what is due and leaves the rest alone", async () => {
    const due = await makeCart(await makeUser(), await make());
    const fresh = await makeCart(await makeUser(), await make(), { lastActivityAt: hoursAgo(1) });
    const already = await makeCart(await makeUser(), await make(), { reminderCount: 1, reminderSentAt: hoursAgo(2) });
    const bought = await makeCart(await makeUser(), await make(), { items: [] }); // bought: emptied

    const ids = (await findDueCarts()).map((c) => String(c._id));
    expect(ids).toEqual([String(due._id)]);
    expect(ids).not.toContain(String(fresh._id));
    expect(ids).not.toContain(String(already._id));
    expect(ids).not.toContain(String(bought._id));

    const result = await sendDueReminders();
    expect(result.sent).toBe(1);
  });

  it("running twice does not send twice", async () => {
    await makeCart(await makeUser(), await make());

    await sendDueReminders();
    const second = await sendDueReminders();

    expect(second.sent).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("one bad basket does not stop the others", async () => {
    await makeCart(await makeUser(), await make({ stock: 0 })); // will be skipped
    await makeCart(await makeUser(), await make()); // should still go

    const result = await sendDueReminders();
    expect(result.considered).toBe(2);
    expect(result.sent).toBe(1);
  });
});

describe("after the customer orders", () => {
  it("credits the reminder when the order follows it", async () => {
    const user = await makeUser();
    const cart = await makeCart(user, await make(), { reminderSentAt: hoursAgo(6), reminderCount: 1, reminderValue: 900 });

    const res = await settleCartAfterOrder(user._id, "000000000000000000000001");

    expect(res.recovered).toBe(true);
    expect((await Cart.findById(cart._id).lean()).items).toEqual([]); // bought — not still waiting

    const record = await CartRecovery.findOne({ user: user._id }).lean();
    expect(record.value).toBe(900);
    expect(String(record.order)).toBe("000000000000000000000001");
  });

  it("keeps the recovery when the customer starts a new basket", async () => {
    // The whole reason recoveries live in their own record: this used to be
    // two fields on the basket, so a customer coming back to shop erased
    // the shop's own evidence that the reminder had worked.
    const user = await makeUser();
    const product = await make();
    await makeCart(user, product, { reminderSentAt: hoursAgo(6), reminderCount: 1, reminderValue: 900 });
    await settleCartAfterOrder(user._id, "000000000000000000000001");

    await Cart.updateOne(
      { user: user._id },
      { $set: { items: [{ product: product._id, quantity: 1 }], lastActivityAt: new Date() } }
    );

    expect(await CartRecovery.countDocuments({ user: user._id })).toBe(1);
  });

  it("counts one order as one recovery, however many times it is settled", async () => {
    const user = await makeUser();
    await makeCart(user, await make(), { reminderSentAt: hoursAgo(6), reminderCount: 1, reminderValue: 900 });

    await settleCartAfterOrder(user._id, "000000000000000000000001");
    await settleCartAfterOrder(user._id, "000000000000000000000001");

    expect(await CartRecovery.countDocuments()).toBe(1);
  });

  it("clears the reminder history with the basket, so the next one starts clean", async () => {
    const user = await makeUser();
    await makeCart(user, await make(), { reminderSentAt: hoursAgo(6), reminderCount: 1, reminderValue: 900 });

    await settleCartAfterOrder(user._id, "000000000000000000000001");

    const after = await Cart.findOne({ user: user._id }).lean();
    expect(after.reminderCount).toBe(0);
    expect(after.reminderSentAt).toBeNull();
  });

  it("does not credit an order from somebody who was never reminded", async () => {
    const user = await makeUser();
    const cart = await makeCart(user, await make());

    const res = await settleCartAfterOrder(user._id, "000000000000000000000001");

    expect(res.recovered).toBe(false);
    expect(await CartRecovery.countDocuments()).toBe(0);
    // The basket is still emptied — they bought it either way.
    expect((await Cart.findById(cart._id).lean()).items).toEqual([]);
  });

  it("does not credit an order weeks after the reminder", async () => {
    const user = await makeUser();
    await makeCart(user, await make(), { reminderSentAt: hoursAgo(24 * 10), reminderCount: 1 });

    expect((await settleCartAfterOrder(user._id, "000000000000000000000001")).recovered).toBe(false);
  });

  it("never throws at a customer with no saved basket", async () => {
    const user = await makeUser();
    await expect(settleCartAfterOrder(user._id, "000000000000000000000001")).resolves.toEqual({ recovered: false });
    await expect(settleCartAfterOrder(null, null)).resolves.toEqual({ recovered: false });
  });
});

describe("signed opt-out links", () => {
  it("rejects a tampered token", () => {
    const token = signLink({ purpose: "cart_reminders_off", subject: "000000000000000000000001" });
    const [body, mac] = token.split(".");
    const forged = `${Buffer.from(JSON.stringify({ p: "cart_reminders_off", s: "000000000000000000000002", e: Date.now() + 1000 })).toString("base64url")}.${mac}`;

    expect(verifyLink(forged, "cart_reminders_off")).toBeNull();
    expect(verifyLink(`${body}.x${mac.slice(1)}`, "cart_reminders_off")).toBeNull();
    expect(verifyLink(token, "cart_reminders_off")).toBeTruthy();
  });

  it("rejects an expired token", () => {
    const token = signLink({ purpose: "cart_reminders_off", subject: "000000000000000000000001", ttlMs: -1 });
    expect(verifyLink(token, "cart_reminders_off")).toBeNull();
  });

  it("rejects nonsense rather than throwing", () => {
    for (const bad of ["", "...", "a.b", null, undefined, "x".repeat(5000)]) {
      expect(verifyLink(bad, "cart_reminders_off")).toBeNull();
    }
  });
});
