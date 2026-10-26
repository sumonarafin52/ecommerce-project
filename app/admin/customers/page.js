// app/admin/customers/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatCurrency, formatDate } from "@/lib/utils";
import usePermissions from "@/lib/usePermissions";
import Checkbox from "@/components/admin/ui/Checkbox";
import Button from "@/components/admin/ui/Button";
import PermissionGate from "@/components/admin/ui/PermissionGate";
import ErrorState from "@/components/admin/ui/ErrorState";

const inputCls = "admin-input";

const ROLE_OPTIONS = [
  { value: "customer", label: "Customer", desc: "Shop only — no admin access" },
  { value: "support", label: "Customer Support", desc: "Orders + customers view" },
  { value: "order_processing", label: "Order Processing", desc: "Order status updates" },
  { value: "editor", label: "Editor", desc: "Products, reports, discounts" },
  { value: "admin", label: "Admin", desc: "Full access" },
];

export default function AdminCustomersPage() {
  const { data: session, status } = useSession();
  const { can, loading: permLoading, failed: permFailed, refresh: refreshPermissions, roles, catalog, refresh } = usePermissions();

  const [loadError, setLoadError] = useState(false);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [rolePerms, setRolePerms] = useState({});
  const [savingRole, setSavingRole] = useState("");

  const isAdmin = session?.user?.role !== "customer";

  const load = () => {
    // Order count and lifetime spend now come with each user, aggregated
    // over all their orders. This page used to also fetch /api/orders and
    // tally it here — but that returns only the newest 100 orders, so most
    // customers were shown as having never ordered.
    setLoadError(false);
    fetch("/api/users")
      .then((r) => r.json())
      .then((uRes) => {
        if (uRes.success) setUsers(uRes.data);
        else setLoadError(true);
      })
      .catch(() => setLoadError(true))
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

  if (!session || permLoading || permFailed || !can("customers")) {
    return (
      <PermissionGate
        perm="customers"
        what="customer accounts"
        signedIn={!!session}
        state={{ loading: permLoading, failed: permFailed, can, refresh: refreshPermissions }}
      />
    );
  }

  if (loadError) {
    return <ErrorState what="customers" onRetry={() => { setLoadError(false); load(); }} />;
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
              className="admin-input w-full sm:w-80"
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
                    const s = { count: u.orderCount || 0, spent: u.spent || 0 };
                    return (
                      <tr key={u._id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-accent/15 border border-accent/40 flex items-center justify-center text-accent font-extrabold shrink-0">
                              {u.name?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <Link href={`/admin/customers/${u._id}`} className="font-bold admin-text-primary hover:text-accent">{u.name}</Link>
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
                Choose what each staff role can access. Admins always have full access.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
                        <Checkbox
                          key={p.key}
                          checked={(rolePerms[r.role] || []).includes(p.key)}
                          onChange={() => togglePerm(r.role, p.key)}
                          label={p.label}
                          hint={p.desc}
                          block
                        />
                      ))}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button size="sm" className="flex-1" onClick={() => saveRole(r.role)} disabled={savingRole === r.role}>
                        {savingRole === r.role ? "Saving..." : "Save Access"}
                      </Button>
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

            <Button full type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}