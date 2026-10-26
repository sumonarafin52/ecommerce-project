// app/api/admin/tax/route.js
//
// Tax zones and the rates inside them.
//
// Zones and rates are kept in one endpoint because they're never useful
// apart — a zone with no rates charges nothing, and a rate without a zone
// has nowhere to apply.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import TaxZone from "@/models/TaxZone";
import TaxRate from "@/models/TaxRate";
import { hasPermission } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { serverError } from "@/lib/apiError";

async function guard() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ success: false, message: "Login required" }, { status: 401 }) };
  if (!(await hasPermission(session, "settings"))) {
    return { error: NextResponse.json({ success: false, message: "No permission" }, { status: 403 }) };
  }
  return { session };
}

const str = (v, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v, max = 200) =>
  Array.isArray(v) ? v.map((x) => str(x, 80)).filter(Boolean).slice(0, max) : [];

export async function GET() {
  try {
    await connectDB();
    const { error } = await guard();
    if (error) return error;

    const [zones, rates] = await Promise.all([
      TaxZone.find().sort({ priority: -1, name: 1 }).lean(),
      TaxRate.find().sort({ compound: 1, priority: -1 }).lean(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        zones: zones.map((z) => ({
          ...z,
          _id: String(z._id),
          rates: rates.filter((r) => String(r.zone) === String(z._id)).map((r) => ({ ...r, _id: String(r._id) })),
        })),
      },
    });
  } catch (err) {
    return serverError(err, "api/admin/tax");
  }
}

// POST creates either a zone or a rate, depending on `kind`.
export async function POST(request) {
  try {
    await connectDB();
    const { error } = await guard();
    if (error) return error;

    const body = (await request.json()) || {};

    if (body.kind === "zone") {
      const name = str(body.name);
      if (!name) return NextResponse.json({ success: false, message: "Zone name is required" }, { status: 400 });
      const zone = await TaxZone.create({
        name,
        countries: list(body.countries),
        states: list(body.states),
        priority: Number.isFinite(Number(body.priority)) ? Math.trunc(Number(body.priority)) : 0,
        active: body.active !== false,
      });
      return NextResponse.json({ success: true, data: zone }, { status: 201 });
    }

    if (body.kind === "rate") {
      const name = str(body.name, 60);
      if (!name) return NextResponse.json({ success: false, message: "Rate name is required" }, { status: 400 });
      if (!/^[0-9a-fA-F]{24}$/.test(String(body.zone || ""))) {
        return NextResponse.json({ success: false, message: "Pick a zone for this rate" }, { status: 400 });
      }
      const zone = await TaxZone.findById(body.zone).select("_id").lean();
      if (!zone) return NextResponse.json({ success: false, message: "That zone no longer exists" }, { status: 404 });

      // Validated, not clamped: a rate silently turned into 0 or 100 would
      // be a tax bug nobody notices until the figures are wrong.
      const rate = Number(body.rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return NextResponse.json({ success: false, message: "Rate must be between 0 and 100" }, { status: 400 });
      }

      const created = await TaxRate.create({
        zone: body.zone,
        name,
        rate,
        appliesTo: ["all", "physical", "digital"].includes(body.appliesTo) ? body.appliesTo : "all",
        taxShipping: body.taxShipping !== false,
        compound: !!body.compound,
        priority: Number.isFinite(Number(body.priority)) ? Math.trunc(Number(body.priority)) : 0,
        active: body.active !== false,
      });
      return NextResponse.json({ success: true, data: created }, { status: 201 });
    }

    return NextResponse.json({ success: false, message: "Unknown kind" }, { status: 400 });
  } catch (err) {
    return serverError(err, "api/admin/tax");
  }
}

export async function PUT(request) {
  try {
    await connectDB();
    const { error } = await guard();
    if (error) return error;

    const body = (await request.json()) || {};
    if (!/^[0-9a-fA-F]{24}$/.test(String(body.id || ""))) {
      return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
    }

    if (body.kind === "zone") {
      const update = {};
      if (body.name !== undefined) {
        const name = str(body.name);
        if (!name) return NextResponse.json({ success: false, message: "Zone name is required" }, { status: 400 });
        update.name = name;
      }
      if (body.countries !== undefined) update.countries = list(body.countries);
      if (body.states !== undefined) update.states = list(body.states);
      if (body.priority !== undefined) update.priority = Math.trunc(Number(body.priority) || 0);
      if (body.active !== undefined) update.active = !!body.active;

      const zone = await TaxZone.findByIdAndUpdate(body.id, update, { new: true });
      if (!zone) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
      return NextResponse.json({ success: true, data: zone });
    }

    if (body.kind === "rate") {
      const update = {};
      if (body.name !== undefined) {
        const name = str(body.name, 60);
        if (!name) return NextResponse.json({ success: false, message: "Rate name is required" }, { status: 400 });
        update.name = name;
      }
      if (body.rate !== undefined) {
        const rate = Number(body.rate);
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
          return NextResponse.json({ success: false, message: "Rate must be between 0 and 100" }, { status: 400 });
        }
        update.rate = rate;
      }
      if (body.appliesTo !== undefined) {
        update.appliesTo = ["all", "physical", "digital"].includes(body.appliesTo) ? body.appliesTo : "all";
      }
      if (body.taxShipping !== undefined) update.taxShipping = !!body.taxShipping;
      if (body.compound !== undefined) update.compound = !!body.compound;
      if (body.priority !== undefined) update.priority = Math.trunc(Number(body.priority) || 0);
      if (body.active !== undefined) update.active = !!body.active;

      const rate = await TaxRate.findByIdAndUpdate(body.id, update, { new: true, runValidators: true });
      if (!rate) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
      return NextResponse.json({ success: true, data: rate });
    }

    return NextResponse.json({ success: false, message: "Unknown kind" }, { status: 400 });
  } catch (err) {
    return serverError(err, "api/admin/tax");
  }
}

export async function DELETE(request) {
  try {
    await connectDB();
    const { error } = await guard();
    if (error) return error;

    const url = new URL(request.url);
    const id = url.searchParams.get("id") || "";
    const kind = url.searchParams.get("kind");
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
    }

    if (kind === "zone") {
      // Rates belong to their zone — leaving them behind would mean
      // invisible rows that can never apply to anything.
      await TaxRate.deleteMany({ zone: id });
      const zone = await TaxZone.findByIdAndDelete(id);
      if (!zone) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
      return NextResponse.json({ success: true, message: "Zone and its rates deleted" });
    }

    if (kind === "rate") {
      const rate = await TaxRate.findByIdAndDelete(id);
      if (!rate) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
      return NextResponse.json({ success: true, message: "Rate deleted" });
    }

    return NextResponse.json({ success: false, message: "Unknown kind" }, { status: 400 });
  } catch (err) {
    return serverError(err, "api/admin/tax");
  }
}
