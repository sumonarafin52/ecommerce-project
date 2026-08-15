// app/admin/customers/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatCurrency, formatDate } from "@/lib/utils";
import usePermissions from "@/lib/usePermissions";

const inputCls =
  "bg-primary border border-white/15 rounded-md px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent transition-colors";

const ROLE_OPTIONS = [
  { value: "customer", label: "Customer", desc: "Shop only — no admin access" },
  { value: "support", label: "Customer Support", desc: "Orders + customers view" },
  { value: "order_processing", label: "Order Processing", desc: "Order status updates" },
  { value: "editor", label: "Editor", desc: "Products, reports, discounts" },
  { value: "admin", label: "Admin", desc: "Full access" },
];

export default function AdminCustomersPage() {
  const { data: session, status } = useSession();
  const { can, loading: permLoading, roles, catalog, refresh } = usePermissions();

  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [rolePerms, setRolePerms] = useState({});
  const [savingRole, setSavingRole] = useState("");

  const isAdmin = session?.user?.role !== "customer";

  const load = () => {
    Promise.all([
      fetch("/api/users").then((r) => r.json()),
      fetch("/api/orders").then((r) => r.json()),
    ])
      .then(([uRes, oRes]) => {
        if (uRes.success) setUsers(uRes.data);
        if (oRes.success) setOrders(Array.isArray(oRes.data) ? oRes.data : oRes.data.orders || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (status === "authenticated" && isAdmin && can("customers")) load();
    else setLoading(false);
  }, [status, isAdmin, can]);

  useEffect(() => {
    if (roles) {
      const init = {};
      roles.forEach((r) => {
        init[r.role] = [...r.permissions];
      });
      setRolePerms(init);
    }
  }, [roles]);

  const stats = useMemo(() => {
    const map = {};
    orders.forEach((o) => {
      const id = String(o.user?._id || o.user);
      if (!map[id]) map[id] = { count: 0, spent: 0 };
      map[id].count += 1;
      if (o.paymentStatus === "paid") map[id].spent += o.totalAmount || 0;
    });
    return map;
  }, [orders]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  }, [users, search]);

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!edit) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/users/${edit._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: edit.name, email: edit.email, role: edit.role }),
      }).then((r) => r.json());
      if (res.success) {
        setEdit(null);
        load();
      } else setError(res.message);
    } catch {
      setError("Failed to update customer");
    }
    setSaving(false);
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this customer? Their old orders will show as 'Unknown'.")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" }).then((r) => r.json());
    if (res.success) load();
    else alert(res.message);
  };

  const togglePerm = (role, key) =>
    setRolePerms((p) => ({
      ...p,
      [role]: (p[role] || []).includes(key) ? (p[role] || []).filter((k) => k !== key) : [...(p[role] || []), key],
    }));

  const saveRole = async (role) => {
    setSavingRole(role);
    try {
      await fetch("/api/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, permissions: rolePerms[role] || [] }),
      }).then((r) => r.json());
      refresh();
    } catch {}
    setSavingRole("");
  };

  const resetRole = (role) => {
    const r = (roles || []).find((x) => x.role === role);
    if (r) setRolePerms((p) => ({ ...p, [role]: [...r.defaults] }));
  };

  if (status === "loading" || loading || permLoading) {
    return (
      <div className="bg-primary min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || !can("customers")) {
    return (
      <div className="bg-primary min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-xl font-bold text-white">Access denied</p>
        <p className="text-sm text-zinc-400">Your role does not allow viewing customers.</p>
        <Link href="/" className="bg-accent hover:bg-accent/80 text-primary font-bold px-6 py-3 rounded-md transition-colors">
          Back to home
        </Link>
      </div>
    );
  }

  const selectedRoleInfo = edit ? (roles || []).find((r) => r.role === edit.role) : null;

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {/* ===== CUSTOMER LIST ===== */}
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              Customers
              <span className="bg-accent/15 text-accent text-xs font-bold px-2.5 py-1 rounded-full">{users.length}</span>
            </h1>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full sm:w-80 bg-primary-light border border-white/15 rounded-md px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent transition-colors"
            />
          </div>

          {visible.length === 0 ? (
            <div className="text-center py-14 text-zinc-400 border border-dashed border-white/10 rounded-xl">No customers found.</div>
          ) : (
            <div className="overflow-x-auto bg-primary-light border border-white/10 rounded-xl">
              <table className="w-full text-sm text-left min-w-[760px]">
                <thead>
                  <tr className="text-zinc-400 border-b border-white/10">
                    <th className="p-4 font-medium">Customer</th>
                    <th className="p-4 font-medium">Role</th>
                    <th className="p-4 font-medium">Joined</th>
                    <th className="p-4 font-medium">Orders</th>
                    <th className="p-4 font-medium">Total Spent</th>
                    <th className="p-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((u) => {
                    const s = stats[String(u._id)] || { count: 0, spent: 0 };
                    return (
                      <tr key={u._id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-accent/15 border border-accent/40 flex items-center justify-center text-accent font-extrabold shrink-0">
                              {u.name?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-white">{u.name}</p>
                              <p className="text-xs text-zinc-500">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold capitalize ${
                              u.role === "admin"
                                ? "bg-accent/15 text-accent"
                                : u.role === "customer"
                                ? "bg-blue-500/15 text-blue-400"
                                : "bg-purple-500/15 text-purple-400"
                            }`}
                          >
                            {u.role?.replace("_", " ")}
                          </span>
                        </td>
                        <td className="p-4 text-zinc-400">{formatDate(u.createdAt)}</td>
                        <td className="p-4 font-bold text-white">{s.count}</td>
                        <td className="p-4 font-bold text-accent">{formatCurrency(s.spent)}</td>
                        <td className="p-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => {
                              setEdit({ _id: u._id, name: u.name, email: u.email, role: u.role });
                              setError("");
                            }}
                            className="text-zinc-300 hover:text-accent font-bold text-xs border border-white/15 hover:border-accent rounded-md px-3 py-1.5 mr-2 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => remove(u._id)}
                            className="text-red-400 hover:bg-red-500/10 font-bold text-xs border border-red-500/30 rounded-md px-3 py-1.5 transition-colors"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ===== ROLES & ACCESS MANAGER ===== */}
        {can("roles") && roles && (
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="w-1 h-5 bg-accent rounded-full" />
                Roles & Access
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Checkbox diye each role er access control korun. Admin role always full access.
              </p>
            </div>

            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
              {roles
                .filter((r) => r.role !== "admin")
                .map((r) => (
                  <div key={r.role} className="bg-primary-light border border-white/10 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-white capitalize">{r.label}</p>
                      {r.isCustomized && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded-full">
                          Customized
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {catalog.map((p) => (
                        <label key={p.key} className="flex items-start gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={(rolePerms[r.role] || []).includes(p.key)}
                            onChange={() => togglePerm(r.role, p.key)}
                            className="accent-[#f5a623] w-4 h-4 mt-0.5"
                          />
                          <span>
                            <span className="block text-xs font-bold text-zinc-200 group-hover:text-accent transition-colors">{p.label}</span>
                            <span className="block text-[10px] text-zinc-500">{p.desc}</span>
                          </span>
                        </label>
                      ))}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => saveRole(r.role)}
                        disabled={savingRole === r.role}
                        className="flex-1 bg-accent hover:bg-accent/80 text-primary text-xs font-bold py-2 rounded-md transition-colors disabled:opacity-50"
                      >
                        {savingRole === r.role ? "Saving..." : "Save Access"}
                      </button>
                      <button
                        onClick={() => resetRole(r.role)}
                        className="text-[11px] text-zinc-400 hover:text-white border border-white/15 rounded-md px-2 transition-colors"
                        title="Reset to defaults"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}
      </div>

      {/* ===== EDIT MODAL ===== */}
      {edit && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form onSubmit={saveEdit} className="w-full max-w-md bg-primary-light border border-white/10 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Edit Customer</h2>
              <button type="button" onClick={() => setEdit(null)} className="text-zinc-400 hover:text-white text-lg" aria-label="Close">
                ✕
              </button>
            </div>

            {error && (
              <p className="text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-4 py-3">{error}</p>
            )}

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Name</label>
              <input className={`${inputCls} w-full`} value={edit.name} onChange={(e) => setEdit((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Email</label>
              <input className={`${inputCls} w-full`} type="email" value={edit.email} onChange={(e) => setEdit((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Role</label>
              <select
                className={`${inputCls} w-full disabled:opacity-50 disabled:cursor-not-allowed`}
                value={edit.role}
                disabled={!can("roles")}
                onChange={(e) => setEdit((f) => ({ ...f, role: e.target.value }))}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value} className="bg-primary">
                    {r.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-zinc-500 mt-1">
                {can("roles")
                  ? ROLE_OPTIONS.find((r) => r.value === edit.role)?.desc
                  : "You don't have permission to change roles."}
              </p>

              {selectedRoleInfo && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedRoleInfo.permissions.map((p) => (
                    <span key={p} className="text-[10px] font-bold bg-accent/15 text-accent px-2 py-0.5 rounded-full">
                      {catalog.find((c) => c.key === p)?.label || p}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button type="submit" disabled={saving} className="w-full bg-accent hover:bg-accent/80 text-primary font-bold py-3 rounded-md transition-colors disabled:opacity-50">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}