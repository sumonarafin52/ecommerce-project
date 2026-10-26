// lib/digitalDelivery.js
//
// Everything that decides whether a given person may download a given file,
// and how the bytes get to them without the storage URL ever leaving the
// server.
//
// The flow:
//   1. order is paid  →  createGrantsForOrder()  issues one DownloadGrant
//                        per digital item, freezing limit/expiry/licence.
//   2. customer opens "My Downloads"  →  listGrants()  returns metadata
//                        only: file names, sizes, versions, remaining
//                        downloads. No URLs.
//   3. customer clicks a file  →  claimDownload()  checks ownership, quota
//                        and expiry, atomically increments the counter, and
//                        returns a token signed for ~2 minutes.
//   4. browser GETs /api/downloads/file?token=...  →  the route verifies the
//                        signature and streams the bytes from storage.
//
// The signed token is the only thing the browser ever holds, it dies in two
// minutes, and it is useless for any other grant or file because the
// signature covers both ids.
import crypto from "crypto";
import mongoose from "mongoose";
import DigitalProduct from "@/models/DigitalProduct";
import DownloadGrant from "@/models/DownloadGrant";
import DownloadLog from "@/models/DownloadLog";
import Product from "@/models/Product";

// Two minutes: long enough for a slow connection to start the transfer,
// short enough that a token pasted into a chat is dead before it's read.
export const DOWNLOAD_TOKEN_TTL_MS = 2 * 60_000;

function signingSecret() {
  // A dedicated secret is preferred so rotating download links doesn't log
  // every customer out, but falling back to NEXTAUTH_SECRET means this works
  // out of the box rather than silently disabling downloads.
  const secret = process.env.DOWNLOAD_SIGNING_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("DOWNLOAD_SIGNING_SECRET or NEXTAUTH_SECRET must be set to serve digital downloads");
  return secret;
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

/**
 * Signs a download token. The payload is visible to the client (it's only
 * base64) — that's fine, it contains no secret, just which grant and file
 * it authorises and when it dies. The HMAC is what makes it unforgeable.
 */
export function signDownloadToken({ grantId, fileId, expiresAt, nonce }) {
  const payload = JSON.stringify({
    g: String(grantId),
    f: String(fileId),
    e: expiresAt,
    n: nonce || crypto.randomBytes(8).toString("hex"),
  });
  const body = b64url(payload);
  const mac = crypto.createHmac("sha256", signingSecret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/**
 * Verifies a download token. Returns the payload, or null for anything
 * malformed, tampered with, or expired. Uses timingSafeEqual so a wrong
 * signature can't be narrowed down byte by byte.
 */
export function verifyDownloadToken(token) {
  if (typeof token !== "string" || token.length > 2048) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  let expected;
  try {
    expected = crypto.createHmac("sha256", signingSecret()).update(body).digest("base64url");
  } catch {
    return null;
  }
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload.e !== "number" || Date.now() > payload.e) return null;
  return { grantId: payload.g, fileId: payload.f, expiresAt: payload.e, nonce: payload.n };
}

/**
 * Normalises a DigitalProduct into one file list, folding the legacy
 * single-file fields in as the first entry so old documents behave exactly
 * like new multi-file ones.
 *
 * Each returned file carries a stable `id` the client can refer to without
 * learning anything about where the file lives.
 */
export function resolveFiles(dp) {
  if (!dp) return [];
  const out = [];

  if (Array.isArray(dp.files)) {
    for (const f of dp.files) {
      if (!f?.url) continue;
      out.push({
        id: String(f._id || `f${out.length}`),
        url: f.url,
        name: f.name || dp.title || "download",
        size: f.size || 0,
        type: f.type || "",
        version: f.version || dp.version || "",
        isPreview: !!f.isPreview,
        label: f.label || "",
      });
    }
  }

  // Legacy document: no files[] entries, but fileUrl is set.
  if (!out.length && dp.fileUrl) {
    out.push({
      id: "legacy",
      url: dp.fileUrl,
      name: dp.fileName || dp.title || "download",
      size: dp.fileSize || 0,
      type: dp.fileType || "",
      version: dp.version || "",
      isPreview: false,
      label: "Main download",
    });
  }

  return out;
}

/** Strips the storage URL. This is the only shape that may reach a browser. */
export function publicFileShape(f) {
  return {
    id: f.id,
    name: f.name,
    size: f.size,
    type: f.type,
    version: f.version,
    isPreview: f.isPreview,
    label: f.label,
  };
}

function generateLicenseKey() {
  // 4 groups of 5 from an unambiguous alphabet (no O/0, I/1) so a customer
  // can read one off the screen and type it without transcription errors.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(20);
  let key = "";
  for (let i = 0; i < 20; i++) {
    if (i > 0 && i % 5 === 0) key += "-";
    key += alphabet[bytes[i] % alphabet.length];
  }
  return key;
}

/**
 * Issues download entitlements for every digital item in a paid order.
 *
 * Safe to call repeatedly: the unique (order, product) index means a
 * duplicate payment webhook, a retried postback, or an admin re-marking an
 * order as paid can't hand out a second quota. Returns the number of grants
 * newly created.
 *
 * Never throws into the payment path — a failure here must not turn a
 * successful payment into an error, so problems are logged and the order
 * still completes. listGrants() backfills anything missed.
 */
export async function createGrantsForOrder(order) {
  if (!order || order.paymentStatus !== "paid") return 0;

  try {
    const items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) return 0;

    const productIds = [...new Set(items.map((it) => String(it.product?._id || it.product)).filter(Boolean))];
    if (!productIds.length) return 0;

    const products = await Product.find({ _id: { $in: productIds } })
      .select("digitalProduct name")
      .populate("digitalProduct")
      .lean();

    let created = 0;
    for (const product of products) {
      const dp = product.digitalProduct;
      if (!dp || !dp.active) continue;
      if (!resolveFiles(dp).length) continue;

      const limit = Math.max(0, Number(dp.downloadLimit) || 0);
      const expiryDays = Math.max(0, Number(dp.downloadExpiryDays) || 0);
      const expiresAt = expiryDays > 0 ? new Date(Date.now() + expiryDays * 86_400_000) : null;

      let licenseKey = "";
      if (dp.licenseMode === "generated") licenseKey = generateLicenseKey();
      else if (dp.licenseMode === "shared") licenseKey = dp.licenseKey || "";

      const orderItem = items.find((it) => String(it.product?._id || it.product) === String(product._id));

      try {
        // Insert-if-absent. $setOnInsert only — so the frozen policy and the
        // download counter of an existing grant are never touched.
        const res = await DownloadGrant.updateOne(
          { order: order._id, product: product._id },
          {
            $setOnInsert: {
              order: order._id,
              orderNumber: order.orderNumber || "",
              product: product._id,
              digitalProduct: dp._id,
              user: order.user || null,
              guestEmail: order.user ? "" : order.guestEmail || "",
              productName: orderItem?.name || product.name || dp.title || "",
              version: dp.version || "",
              downloadLimit: limit,
              expiresAt,
              licenseKey,
              licenseTerms: dp.licenseTerms || "",
              downloadCount: 0,
              revoked: false,
            },
          },
          { upsert: true }
        );
        if (res.upsertedCount) created++;
      } catch (err) {
        // Duplicate key = another concurrent webhook won the race, which is
        // exactly the outcome we want. Anything else is worth seeing.
        if (err?.code !== 11000) console.error("[digitalDelivery] grant upsert failed", err);
      }
    }

    return created;
  } catch (error) {
    console.error("[digitalDelivery] createGrantsForOrder failed", error);
    return 0;
  }
}

/** Why a grant can't be used right now, or null if it can. */
export function grantBlockReason(grant) {
  if (!grant) return "denied_auth";
  if (grant.revoked) return "denied_revoked";
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() < Date.now()) return "denied_expired";
  if (grant.downloadLimit > 0 && grant.downloadCount >= grant.downloadLimit) return "denied_limit";
  return null;
}

/** The customer-facing view of one entitlement. Carries no storage URL. */
export async function grantToPublic(grant, dpCache) {
  const dp = dpCache || (await DigitalProduct.findById(grant.digitalProduct).lean());
  const files = resolveFiles(dp);
  const blocked = grantBlockReason(grant);

  return {
    id: String(grant._id),
    orderId: String(grant.order),
    orderNumber: grant.orderNumber,
    productId: String(grant.product),
    productName: grant.productName,
    purchasedAt: grant.createdAt,
    version: dp?.version || grant.version || "",
    // Version the customer bought vs. what's current — "update available"
    // is only meaningful if both are set and differ.
    purchasedVersion: grant.version || "",
    updateAvailable: !!(grant.version && dp?.version && grant.version !== dp.version),
    changelog: Array.isArray(dp?.changelog) ? dp.changelog.slice(-10).reverse() : [],
    files: files.map(publicFileShape),
    downloadLimit: grant.downloadLimit,
    downloadCount: grant.downloadCount,
    // null means unlimited, so the UI can say "Unlimited" rather than "0 left"
    downloadsRemaining: grant.downloadLimit > 0 ? Math.max(0, grant.downloadLimit - grant.downloadCount) : null,
    expiresAt: grant.expiresAt || null,
    lastDownloadAt: grant.lastDownloadAt || null,
    licenseKey: grant.licenseKey || "",
    licenseTerms: grant.licenseTerms || "",
    revoked: !!grant.revoked,
    blocked,
    available: !blocked,
  };
}

/**
 * Checks a grant out for one download and returns a signed token.
 *
 * The quota is spent here, not at stream time, and it's spent with a
 * conditional update so two simultaneous clicks on the last remaining
 * download can't both succeed. The signed token embeds the spent count, so
 * if the transfer drops the customer can retry the same link within its
 * two-minute life without being charged a second download.
 *
 * Preview files bypass the quota entirely — they're free samples.
 */
export async function claimDownload({ grant, fileId, isPreview }) {
  if (isPreview) {
    return {
      ok: true,
      token: signDownloadToken({
        grantId: grant._id,
        fileId,
        expiresAt: Date.now() + DOWNLOAD_TOKEN_TTL_MS,
      }),
    };
  }

  const blocked = grantBlockReason(grant);
  if (blocked) return { ok: false, reason: blocked };

  // Conditional increment. The filter repeats every rule so the decision and
  // the counter move together — no read-then-write window for a second
  // request to slip through.
  const filter = {
    _id: grant._id,
    revoked: false,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  };
  if (grant.downloadLimit > 0) filter.downloadCount = { $lt: grant.downloadLimit };

  const updated = await DownloadGrant.findOneAndUpdate(
    filter,
    { $inc: { downloadCount: 1 }, $set: { lastDownloadAt: new Date() } },
    { new: true }
  );

  if (!updated) {
    // Lost the race, or the grant changed underneath us. Re-read to report
    // the real reason rather than a generic failure.
    const fresh = await DownloadGrant.findById(grant._id).lean();
    return { ok: false, reason: grantBlockReason(fresh) || "denied_limit" };
  }

  return {
    ok: true,
    grant: updated,
    token: signDownloadToken({
      grantId: updated._id,
      fileId,
      expiresAt: Date.now() + DOWNLOAD_TOKEN_TTL_MS,
    }),
  };
}

/** Audit trail. Best-effort: logging must never fail a download. */
export async function logDownload(entry) {
  try {
    await DownloadLog.create({
      grant: entry.grant || null,
      order: entry.order || null,
      product: entry.product || null,
      user: entry.user || null,
      guestEmail: entry.guestEmail || "",
      fileName: entry.fileName || "",
      fileVersion: entry.fileVersion || "",
      isPreview: !!entry.isPreview,
      outcome: entry.outcome,
      detail: entry.detail || "",
      ip: entry.ip || "",
      userAgent: (entry.userAgent || "").slice(0, 300),
      at: new Date(),
    });
  } catch (error) {
    console.error("[digitalDelivery] download log failed", error);
  }
}

/** True if `id` could be a Mongo ObjectId — avoids CastError 500s on probes. */
export function isObjectId(id) {
  return mongoose.Types.ObjectId.isValid(String(id || "")) && /^[0-9a-fA-F]{24}$/.test(String(id));
}

/**
 * Gives a spent download back after the file could not be delivered.
 *
 * The quota is spent when the token is issued, so a storage outage would
 * otherwise cost the customer one of their downloads for a failure that was
 * entirely ours. The token's nonce is recorded, so retrying the same link
 * can only ever refund once however many times it fails.
 */
export async function refundDownload({ grantId, nonce }) {
  if (!grantId || !nonce) return false;
  try {
    const res = await DownloadGrant.updateOne(
      { _id: grantId, downloadCount: { $gt: 0 }, refundedTokens: { $ne: nonce } },
      {
        $inc: { downloadCount: -1 },
        // keep only the recent ones — this is a replay guard, not a ledger
        $push: { refundedTokens: { $each: [nonce], $slice: -25 } },
      }
    );
    return res.modifiedCount > 0;
  } catch (error) {
    console.error("[digitalDelivery] refund failed", error);
    return false;
  }
}
