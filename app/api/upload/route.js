// app/api/upload/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createHash } from "crypto";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { STAFF_ROLES } from "@/lib/rbac";

// Two allow-lists: plain images (logos, product photos, banners) and the
// broader set Digital Products needs (ebooks/zips). SVG is scoped to images
// only, never digital-file downloads, since browsers execute embedded SVG
// scripts when a file is opened/downloaded directly (unlike <img src=...>).
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);
const DIGITAL_FILE_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/epub+zip",
  "application/x-mobipocket-ebook",
  "application/vnd.ms-excel",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_DIGITAL_BYTES = 200 * 1024 * 1024; // 200MB — ebooks/zips run larger

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    // Only staff accounts may upload — this endpoint writes directly to the
    // store's Cloudinary account, so an ordinary "logged in customer" check
    // was letting any registered shopper burn upload quota / host files there.
    if (!session?.user || !STAFF_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, message: "Staff access required" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") || formData.get("image");
    // callers set kind="digital" for Digital Products uploads (ebooks/zips);
    // everything else (logos, product photos, banners) stays image-only
    const kind = formData.get("kind") === "digital" ? "digital" : "image";

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ success: false, message: "No file provided" }, { status: 400 });
    }

    const isImage = IMAGE_TYPES.has(file.type);
    const isDigitalFile = kind === "digital" && (IMAGE_TYPES.has(file.type) || DIGITAL_FILE_TYPES.has(file.type));
    if (!isImage && !isDigitalFile) {
      return NextResponse.json(
        { success: false, message: kind === "digital" ? "Unsupported file type" : "Only image files are allowed" },
        { status: 400 }
      );
    }
    const maxBytes = kind === "digital" ? MAX_DIGITAL_BYTES : MAX_IMAGE_BYTES;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { success: false, message: `File must be under ${Math.round(maxBytes / (1024 * 1024))}MB` },
        { status: 400 }
      );
    }

    // Cloudinary config auto-detect (env name ja e thakuk)
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY || process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const uploadPreset =
      process.env.CLOUDINARY_UPLOAD_PRESET || process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName) {
      return NextResponse.json(
        { success: false, message: "Cloudinary cloud name not configured (CLOUDINARY_CLOUD_NAME)" },
        { status: 500 }
      );
    }

    const fd = new FormData();
    fd.append("file", file);

    if (uploadPreset) {
      // unsigned preset
      fd.append("upload_preset", uploadPreset);
    } else if (apiKey && apiSecret) {
      // signed upload
      const timestamp = Math.round(Date.now() / 1000);
      const signature = createHash("sha1").update(`timestamp=${timestamp}${apiSecret}`).digest("hex");
      fd.append("timestamp", String(timestamp));
      fd.append("api_key", apiKey);
      fd.append("signature", signature);
    } else {
      return NextResponse.json(
        { success: false, message: "Cloudinary upload preset or API key/secret missing in env" },
        { status: 500 }
      );
    }

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
      method: "POST",
      body: fd,
    }).then((r) => r.json());

    if (res.secure_url) {
      return NextResponse.json({ success: true, url: res.secure_url, public_id: res.public_id });
    }
    return NextResponse.json(
      { success: false, message: res.error?.message || "Cloudinary upload failed" },
      { status: 500 }
    );
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}