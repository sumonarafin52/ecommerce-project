// tests/supportAndQA.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB, clearTestDB } from "./dbSetup";
import Product from "@/models/Product";
import User from "@/models/User";
import Notification from "@/models/Notification";
import SupportTicket from "@/models/SupportTicket";
import ProductQuestion from "@/models/ProductQuestion";

const sent = [];
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async (m) => { sent.push(m); return { sent: true }; }) }));
let mockSession = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => Promise.resolve(mockSession)) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

const support = await import("@/app/api/support/route");
const supportOne = await import("@/app/api/support/[id]/route");
const qa = await import("@/app/api/products/[id]/questions/route");
const qaAdmin = await import("@/app/api/questions/[id]/route");
const { notify } = await import("@/lib/notify");

let ip = 0;
const req = (method, body, url = "http://localhost/x") =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.9.${Math.floor(++ip / 250)}.${ip % 250}` },
    body: body ? JSON.stringify(body) : undefined,
  });
const as = (u) => (mockSession = u ? { user: { id: String(u._id), role: u.role, name: u.name, email: u.email } } : null);
const settle = () => new Promise((r) => setTimeout(r, 60));
let n = 0;
const makeUser = (role = "customer", name = "Rahim Uddin") =>
  User.create({ name, email: `u${++n}_${Date.now()}@t.com`, password: "x", role });
const makeProduct = (o = {}) =>
  Product.create({ name: "Kettle", slug: `k-${++n}-${Date.now()}`, price: 100, category: "C", stock: 5, status: "public", ...o });

const validTicket = {
  name: "Karim Ahmed", email: "karim@example.com", category: "order",
  subject: "Where is my parcel", message: "It has been five days since I ordered.",
};

beforeAll(async () => { await startTestDB(); }, 90000);
afterAll(async () => { await stopTestDB(); });
beforeEach(async () => {
  await clearTestDB();
  await mongoose.connection.db.collection("ratelimits").deleteMany({});
  sent.length = 0;
});

describe("support tickets", () => {
  it("lets a guest open a ticket and emails them a receipt", async () => {
    as(null);
    const res = await support.POST(req("POST", validTicket));
    expect(res.status).toBe(201);
    const t = await SupportTicket.findOne();
    expect(t.user).toBeNull();
    expect(t.messages).toHaveLength(1);
    await settle();
    expect(sent.some((m) => m.to === "karim@example.com")).toBe(true);
  });

  it("links the ticket to a signed-in customer", async () => {
    const u = await makeUser(); as(u);
    await support.POST(req("POST", validTicket));
    expect(String((await SupportTicket.findOne()).user)).toBe(String(u._id));
  });

  it("validates input", async () => {
    as(null);
    expect((await support.POST(req("POST", { ...validTicket, email: "nope" }))).status).toBe(400);
    expect((await support.POST(req("POST", { ...validTicket, category: "x" }))).status).toBe(400);
    expect((await support.POST(req("POST", { ...validTicket, message: "short" }))).status).toBe(400);
    expect((await support.POST(req("POST", { ...validTicket, message: "x".repeat(5001) }))).status).toBe(400);
    expect(await SupportTicket.countDocuments()).toBe(0);
  });

  it("silently drops honeypot (bot) submissions", async () => {
    as(null);
    const res = await support.POST(req("POST", { ...validTicket, website: "http://spam.example" }));
    expect(res.status).toBe(200); // looks successful to the bot…
    expect(await SupportTicket.countDocuments()).toBe(0); // …but nothing is stored
  });

  it("rate-limits one email address", async () => {
    as(null);
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await support.POST(req("POST", validTicket))).status);
    expect(statuses).toContain(429);
  });

  it("escapes customer text in the receipt email", async () => {
    as(null);
    await support.POST(req("POST", { ...validTicket, name: "<b>Evil</b>", subject: '<a href="http://phish">click</a>' }));
    await settle();
    const html = sent.find((m) => m.to === "karim@example.com").html;
    expect(html).not.toContain("<a href=\"http://phish\">");
    expect(html).toContain("&lt;a href=");
  });

  it("only staff can reply, and the reply is emailed to the customer", async () => {
    as(null);
    await support.POST(req("POST", validTicket));
    const t = await SupportTicket.findOne();

    const customer = await makeUser(); as(customer);
    expect((await supportOne.PUT(req("PUT", { reply: "hi" }), { params: { id: String(t._id) } })).status).toBe(403);

    const admin = await makeUser("admin"); as(admin);
    sent.length = 0;
    const res = await supportOne.PUT(req("PUT", { reply: "Your parcel ships today." }), { params: { id: String(t._id) } });
    expect(res.status).toBe(200);
    const after = await SupportTicket.findById(t._id);
    expect(after.status).toBe("answered");
    expect(after.messages).toHaveLength(2);
    await settle();
    expect(sent[0].to).toBe("karim@example.com");
    expect(sent[0].html).toContain("Your parcel ships today.");
  });
});

describe("product Q&A", () => {
  const ask = (p, text) => qa.POST(req("POST", { question: text }), { params: { id: String(p._id) } });
  const list = (p) => qa.GET(req("GET"), { params: { id: String(p._id) } }).then((r) => r.json());

  it("requires sign-in to ask", async () => {
    const p = await makeProduct(); as(null);
    expect((await ask(p, "Does this come with a warranty?")).status).toBe(401);
  });

  it("rejects questions on draft products", async () => {
    const u = await makeUser(); as(u);
    const p = await makeProduct({ status: "draft" });
    expect((await ask(p, "Does this come with a warranty?")).status).toBe(404);
  });

  it("validates question length", async () => {
    const u = await makeUser(); as(u); const p = await makeProduct();
    expect((await ask(p, "short")).status).toBe(400);
    expect((await ask(p, "x".repeat(501))).status).toBe(400);
  });

  it("keeps unanswered questions private to the asker", async () => {
    const asker = await makeUser(); const other = await makeUser(); const p = await makeProduct();
    as(asker); await ask(p, "Does this come with a warranty?");

    const asAsker = await list(p);
    expect(asAsker.data.mine).toHaveLength(1);
    expect(asAsker.data.published).toHaveLength(0);

    as(other);
    const asOther = await list(p);
    expect(asOther.data.mine).toHaveLength(0);
    expect(asOther.data.published).toHaveLength(0);

    as(null);
    expect((await list(p)).data.published).toHaveLength(0);
  });

  it("shows only the asker's first name publicly once answered", async () => {
    const asker = await makeUser("customer", "Rahim Uddin Chowdhury"); const p = await makeProduct();
    as(asker); await ask(p, "Does this come with a warranty?");
    const q = await ProductQuestion.findOne();

    const admin = await makeUser("admin"); as(admin);
    await qaAdmin.PUT(req("PUT", { answer: "Yes, one year." }), { params: { id: String(q._id) } });

    as(null);
    const pub = (await list(p)).data.published;
    expect(pub).toHaveLength(1);
    expect(pub[0].askerName).toBe("Rahim");
    expect(pub[0].answer).toBe("Yes, one year.");
    expect(JSON.stringify(pub)).not.toContain("@t.com"); // no email leaks
  });

  it("notifies the asker when answered", async () => {
    const asker = await makeUser(); const p = await makeProduct();
    as(asker); await ask(p, "Does this come with a warranty?");
    const q = await ProductQuestion.findOne();
    const admin = await makeUser("admin"); as(admin);
    await qaAdmin.PUT(req("PUT", { answer: "Yes." }), { params: { id: String(q._id) } });
    await settle();
    expect(await Notification.countDocuments({ user: asker._id, type: "question" })).toBe(1);
  });

  it("only staff with products permission can answer", async () => {
    const asker = await makeUser(); const p = await makeProduct();
    as(asker); await ask(p, "Does this come with a warranty?");
    const q = await ProductQuestion.findOne();
    const support = await makeUser("support"); as(support);
    expect((await qaAdmin.PUT(req("PUT", { answer: "Yes." }), { params: { id: String(q._id) } })).status).toBe(403);
  });

  it("hidden questions never appear publicly", async () => {
    const asker = await makeUser(); const p = await makeProduct();
    as(asker); await ask(p, "Buy cheap watches at spam-site dot com");
    const q = await ProductQuestion.findOne();
    const admin = await makeUser("admin"); as(admin);
    await qaAdmin.PUT(req("PUT", { status: "hidden" }), { params: { id: String(q._id) } });
    as(null);
    expect((await list(p)).data.published).toHaveLength(0);
  });

  it("won't publish a question that has no answer", async () => {
    const asker = await makeUser(); const p = await makeProduct();
    as(asker); await ask(p, "Does this come with a warranty?");
    const q = await ProductQuestion.findOne();
    const admin = await makeUser("admin"); as(admin);
    expect((await qaAdmin.PUT(req("PUT", { status: "published" }), { params: { id: String(q._id) } })).status).toBe(400);
  });
});

describe("notification email escaping (security fix)", () => {
  it("escapes HTML in notification titles and messages", async () => {
    const u = await makeUser();
    sent.length = 0;
    await notify({ user: u._id, type: "support", title: "<script>x</script>", message: '<a href="http://phish">reset</a>', link: "/admin" });
    const html = sent[0].html;
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('<a href="http://phish">');
    expect(html).toContain("&lt;script&gt;");
  });

  it("refuses off-site links in notification buttons", async () => {
    const u = await makeUser();
    sent.length = 0;
    await notify({ user: u._id, type: "support", title: "t", message: "m", link: "//evil.example/steal" });
    expect(sent[0].html).not.toContain("evil.example");
  });
});
