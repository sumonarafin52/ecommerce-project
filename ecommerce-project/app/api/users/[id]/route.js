// app/api/users/[id]/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import User from "@/models/User";
import { hasPermission, STAFF_ROLES } from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// Staff (e.g. "Customer Support") who only have the "customers" permission
// can view/edit a customer's name & email, but must NOT be able to change
// role — that's a privilege-escalation path (a support agent could otherwise
// promote themselves or anyone else to admin). Role changes require the
// separate "roles" permission, same gate used by /api/roles.
const ASSIGNABLE_ROLES = ["customer", ...STAFF_ROLES];

// Staff with "customers" permission: single user details
export async function GET(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "customers"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const user = await User.findById(params.id).select("name email role createdAt");
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// Staff with "customers" permission: edit name/email.
// Changing `role` additionally requires the "roles" permission.
export async function PUT(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "customers"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    const { name, email, role } = await request.json();

    // email duplicate check (onno karor sathe)
    if (email) {
      const existing = await User.findOne({ email, _id: { $ne: params.id } });
      if (existing) {
        return NextResponse.json({ success: false, message: "Email already in use" }, { status: 400 });
      }
    }

    const update = {};
    if (name) update.name = name;
    if (email) update.email = email;
    if (role) {
      if (!ASSIGNABLE_ROLES.includes(role)) {
        return NextResponse.json({ success: false, message: "Invalid role" }, { status: 400 });
      }
      if (!(await hasPermission(session, "roles"))) {
        return NextResponse.json(
          { success: false, message: "You do not have permission to change roles" },
          { status: 403 }
        );
      }
      // an admin can't be demoted this way accidentally by another admin
      // removing their own access — keep it simple and explicit instead
      update.role = role;
    }

    const user = await User.findByIdAndUpdate(params.id, update, { new: true }).select("name email role createdAt");
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// Deleting an account is destructive — keep this gated behind "roles" (the
// same admin-level permission that controls staff access) rather than the
// broader "customers" permission that ordinary support agents also hold.
export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user || !(await hasPermission(session, "roles"))) {
      return NextResponse.json({ success: false, message: "No permission" }, { status: 403 });
    }

    // nijeke delete kora jabe na
    if (session.user.id === params.id) {
      return NextResponse.json({ success: false, message: "You cannot delete your own account" }, { status: 400 });
    }

    const user = await User.findByIdAndDelete(params.id);
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "User deleted" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}