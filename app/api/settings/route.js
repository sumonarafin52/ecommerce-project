// app/api/settings/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Settings from "@/models/Settings";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// there is only ever one Settings document — fetch it, creating a default
// one on first use so the rest of the app never has to null-check
async function getOrCreateSettings() {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({});
  }
  return settings;
}

// GET: public — storefront (Header/Footer/homepage) and admin both read this
export async function GET() {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// PUT: admin only — partial update, only known top-level sections are touched
export async function PUT(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!(await hasPermission(session, "settings"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const body = await request.json();
    const settings = await getOrCreateSettings();

    // only merge recognized sections — never trust arbitrary client keys
    if (body.general && typeof body.general === "object") {
      settings.general = { ...settings.general.toObject?.() ?? settings.general, ...body.general };
    }
    if (body.homepage && typeof body.homepage === "object") {
      if (Array.isArray(body.homepage.heroSlides)) settings.homepage.heroSlides = body.homepage.heroSlides;
      if (Array.isArray(body.homepage.banners)) settings.homepage.banners = body.homepage.banners;
      if (Array.isArray(body.homepage.sections)) settings.homepage.sections = body.homepage.sections;
    }

    settings.markModified("general");
    settings.markModified("homepage");
    await settings.save();

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
