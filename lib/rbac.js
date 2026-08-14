// lib/rbac.js
import RoleConfig from "@/models/RoleConfig";

// ===== PERMISSION CATALOG =====
export const PERMISSIONS = [
  { key: "dashboard", label: "Dashboard", desc: "View admin home & stats" },
  { key: "products", label: "Products", desc: "Add, edit, delete products & stock" },
  { key: "orders", label: "Orders (view)", desc: "See all customer orders" },
  { key: "orders_update", label: "Orders (update)", desc: "Change order status, create & delete orders" },
  { key: "customers", label: "Customers", desc: "View & manage customer accounts" },
  { key: "reports", label: "Reports", desc: "Sales reports & analytics" },
  { key: "discounts", label: "Discounts", desc: "Create & manage discount codes" },
  { key: "settings", label: "Settings", desc: "Manage store info, homepage, payment, billing & shipping settings" },
  { key: "roles", label: "Roles & Access", desc: "Change what each role can do" },
];

// ===== STAFF ROLES (customer bad e) =====
export const STAFF_ROLES = ["admin", "editor", "order_processing", "support"];

export const ROLE_LABELS = {
  admin: "Admin",
  editor: "Editor",
  order_processing: "Order Processing",
  support: "Customer Support",
  customer: "Customer",
};

// ===== DEFAULT ACCESS (admin customize na kora porjonto) =====
export const DEFAULT_ROLE_PERMISSIONS = {
  admin: PERMISSIONS.map((p) => p.key), // admin always full access
  editor: ["dashboard", "products", "orders", "reports", "discounts"],
  order_processing: ["dashboard", "orders", "orders_update"],
  support: ["dashboard", "orders", "customers"],
};

// ===== HELPERS =====

// ekta role er effective permissions (custom override thakle seta, na thakle default)
export async function getRolePermissions(role) {
  if (role === "customer") return [];
  if (role === "admin") return DEFAULT_ROLE_PERMISSIONS.admin; // admin customizable noy
  try {
    const config = await RoleConfig.findOne({ role }).lean();
    return config ? config.permissions : DEFAULT_ROLE_PERMISSIONS[role] || [];
  } catch {
    return DEFAULT_ROLE_PERMISSIONS[role] || [];
  }
}

// session user er permissions
export async function getUserPermissions(session) {
  if (!session?.user) return [];
  return getRolePermissions(session.user.role);
}

// API route e use korar jonno: true/false
export async function hasPermission(session, perm) {
  const perms = await getUserPermissions(session);
  return perms.includes(perm);
}