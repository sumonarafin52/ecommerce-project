// app/api/roles/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import RoleConfig from "@/models/RoleConfig";
import {
  PERMISSIONS,
  STAFF_ROLES,
  ROLE_LABELS,
  DEFAULT_ROLE_PERMISSIONS,
  getRolePermissions,
  getUserPermissions,
  hasPermission,
} from "@/lib/rbac";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// GET: staff nijer permissions pay; admin (roles permission thakle) sob role er config o pay
export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }

    const myPermissions = await getUserPermissions(session);

    const data = { myPermissions };

    // roles manage korar permission thaklei full role list dekhabe
    if (myPermissions.includes("roles")) {
      const roles = [];
      for (const role of STAFF_ROLES) {
        const config = await RoleConfig.findOne({ role }).lean();
        roles.push({
          role,
          label: ROLE_LABELS[role],
          permissions: await getRolePermissions(role),
          isCustomized: Boolean(config),
          defaults: DEFAULT_ROLE_PERMISSIONS[role] || [],
        });
      }
      data.roles = roles;
      data.catalog = PERMISSIONS;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// PUT: admin kono role er permissions update korbe
export async function PUT(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
    }
    if (!(await hasPermission(session, "roles"))) {
      return NextResponse.json({ success: false, message: "You cannot change role access" }, { status: 403 });
    }

    const { role, permissions } = await request.json();

    // admin er access change kora jabe na
    if (!STAFF_ROLES.includes(role) || role === "admin") {
      return NextResponse.json({ success: false, message: "Invalid role" }, { status: 400 });
    }
    if (!Array.isArray(permissions)) {
      return NextResponse.json({ success: false, message: "Permissions must be an array" }, { status: 400 });
    }

    // catalog er baire kono permission key allow noy
    const validKeys = PERMISSIONS.map((p) => p.key);
    const clean = [...new Set(permissions.filter((p) => validKeys.includes(p)))];

    const config = await RoleConfig.findOneAndUpdate(
      { role },
      { role, permissions: clean },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}