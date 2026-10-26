// lib/digitalProductInput.js
//
// One validator for digital-product admin input, shared by the create and
// update routes so the two can't drift apart (they previously accepted
// different field sets).
//
// Everything is clamped and typed here rather than trusted: a download limit
// arriving as "-5" or "1e9" from a hand-rolled request must not become a
// grant policy that locks customers out or never expires.

// Mirrors the upload route's digital allow-list. A file reference is only
// accepted if it points at our own storage, so an admin account can't be
// used to turn the download endpoint into an open proxy that fetches
// arbitrary URLs (internal services included) and streams them out.
const ALLOWED_FILE_HOSTS = [/(^|\.)res\.cloudinary\.com$/i, /(^|\.)cloudinary\.com$/i];

export function isAllowedFileUrl(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== "https:") return false;
    return ALLOWED_FILE_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

function clampInt(value, { min = 0, max = 1_000_000, fallback = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

// A policy number that must never be quietly reinterpreted. 0 is meaningful
// here (unlimited / never expires), so coercing a negative to 0 would turn a
// typo into "unlimited downloads". Returns null for anything invalid so the
// caller can refuse it.
function policyInt(value, max) {
  if (value === "" || value === null || value === undefined) return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(max, Math.floor(n));
}

function str(value, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * Normalises a files[] payload. Returns { files, error }.
 * An entry whose URL isn't on our storage is rejected outright rather than
 * silently dropped — quietly discarding a file would leave the admin
 * thinking it saved.
 */
export function normalizeFiles(input) {
  if (!Array.isArray(input)) return { files: [] };
  if (input.length > 20) return { error: "A digital product can have at most 20 files" };

  const files = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const url = str(raw.url, 1000);
    if (!url) continue;
    if (!isAllowedFileUrl(url)) {
      return { error: "Files must be uploaded through this admin panel" };
    }
    files.push({
      url,
      name: str(raw.name, 200),
      size: clampInt(raw.size, { max: 5_000_000_000 }),
      type: str(raw.type, 100),
      version: str(raw.version, 40),
      isPreview: !!raw.isPreview,
      label: str(raw.label, 80),
    });
  }
  return { files };
}

/**
 * Builds the set of fields to write for a digital product.
 * `partial: true` (update) only includes keys actually present in the body,
 * so a PUT that sends only `active` can't blank out the licence terms.
 */
export function buildDigitalProductFields(body, { partial = false } = {}) {
  const b = body && typeof body === "object" ? body : {};
  const fields = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);

  if (!partial || has("title")) {
    const title = str(b.title, 200);
    if (!title) return { error: "Title is required" };
    fields.title = title;
  }
  if (!partial || has("description")) fields.description = str(b.description, 5000);

  // legacy single-file fields stay writable so the existing admin form works
  if (!partial || has("fileUrl")) {
    const fileUrl = str(b.fileUrl, 1000);
    if (fileUrl && !isAllowedFileUrl(fileUrl)) {
      return { error: "Files must be uploaded through this admin panel" };
    }
    fields.fileUrl = fileUrl;
  }
  if (!partial || has("fileName")) fields.fileName = str(b.fileName, 200);
  if (!partial || has("fileSize")) fields.fileSize = clampInt(b.fileSize, { max: 5_000_000_000 });
  if (!partial || has("fileType")) fields.fileType = str(b.fileType, 100);

  if (has("files")) {
    const { files, error } = normalizeFiles(b.files);
    if (error) return { error };
    fields.files = files;
  }

  if (!partial || has("version")) fields.version = str(b.version, 40);

  if (has("changelog")) {
    const entries = Array.isArray(b.changelog) ? b.changelog.slice(0, 100) : [];
    fields.changelog = entries
      .filter((c) => c && typeof c === "object")
      .map((c) => ({
        version: str(c.version, 40),
        notes: str(c.notes, 2000),
        at: c.at && !Number.isNaN(new Date(c.at).getTime()) ? new Date(c.at) : new Date(),
      }));
  }

  if (!partial || has("licenseMode")) {
    const mode = str(b.licenseMode, 20);
    fields.licenseMode = ["none", "generated", "shared"].includes(mode) ? mode : "none";
  }
  if (!partial || has("licenseKey")) fields.licenseKey = str(b.licenseKey, 200);
  if (!partial || has("licenseTerms")) fields.licenseTerms = str(b.licenseTerms, 2000);

  // 0 = unlimited / never expires. A negative or non-numeric value is
  // refused rather than coerced — turning "-5" into 0 would hand every buyer
  // unlimited downloads off the back of a typo.
  if (!partial || has("downloadLimit")) {
    const limit = policyInt(b.downloadLimit, 10_000);
    if (limit === null) return { error: "Download limit must be 0 or more (0 means unlimited)" };
    fields.downloadLimit = limit;
  }
  if (!partial || has("downloadExpiryDays")) {
    const days = policyInt(b.downloadExpiryDays, 3650);
    if (days === null) return { error: "Expiry must be 0 or more days (0 means never expires)" };
    fields.downloadExpiryDays = days;
  }

  if (has("active")) fields.active = !!b.active;

  // A "shared" licence with no key would silently issue blank keys to buyers.
  if (fields.licenseMode === "shared" && !partial && !fields.licenseKey) {
    return { error: "A shared licence needs a licence key" };
  }

  const hasLegacyFile = !!fields.fileUrl;
  const hasFiles = Array.isArray(fields.files) && fields.files.length > 0;
  if (!partial && !hasLegacyFile && !hasFiles) {
    return { error: "File upload required" };
  }

  return { fields };
}
