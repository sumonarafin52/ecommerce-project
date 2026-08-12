// app/api/upload/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createHash } from "crypto";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") || formData.get("image");
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ success: false, message: "No file provided" }, { status: 400 });
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