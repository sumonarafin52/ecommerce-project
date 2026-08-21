// components/profile/AddressBook.jsx
"use client";

import { useEffect, useState } from "react";
import CountryStateSelect from "@/components/checkout/CountryStateSelect";

const inputCls =
  "w-full bg-cream-white border-[1.5px] border-line rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder-ink-muted outline-none focus:border-indigo-900 transition-colors";
const labelCls = "block text-[12px] font-bold text-ink-soft mb-1.5";

const emptyForm = {
  label: "Home",
  fullName: "",
  phone: "",
  address: "",
  city: "",
  countryCode: "BD",
  country: "Bangladesh",
  state: "",
  postalCode: "",
};

export default function AddressBook() {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = () => {
    setLoading(true);
    fetch("/api/addresses")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setAddresses(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  };

  const openEdit = (addr) => {
    setEditingId(addr._id);
    setForm({
      label: addr.label || "Home",
      fullName: addr.fullName,
      phone: addr.phone,
      address: addr.address,
      city: addr.city,
      countryCode: "", // resolved by CountryStateSelect from the country name below
      country: addr.country || "",
      state: addr.state || "",
      postalCode: addr.postalCode || "",
    });
    setError("");
    setShowForm(true);
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleLocationChange = ({ country, countryName, state }) => {
    setForm((f) => ({ ...f, countryCode: country, country: countryName, state }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.fullName.trim() || !form.phone.trim() || !form.address.trim() || !form.city.trim()) {
      setError("Full name, phone, address and city are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        label: form.label,
        fullName: form.fullName,
        phone: form.phone,
        address: form.address,
        city: form.city,
        country: form.country,
        state: form.state,
        postalCode: form.postalCode,
      };
      const res = await fetch(editingId ? `/api/addresses/${editingId}` : "/api/addresses", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message || "Failed to save address");
    }
    setSaving(false);
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this address?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/addresses/${id}`, { method: "DELETE" }).then((r) => r.json());
      if (res.success) load();
    } catch {}
    setBusyId("");
  };

  const makeDefault = async (id) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/addresses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      }).then((r) => r.json());
      if (res.success) load();
    } catch {}
    setBusyId("");
  };

  if (loading) {
    return (
      <div className="bg-cream-white border border-line rounded-xl p-6 flex items-center justify-center py-14">
        <div className="w-7 h-7 border-2 border-indigo-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-cream-white border border-line rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[17px] font-bold text-ink">Saved Addresses</h3>
        {!showForm && (
          <button
            onClick={openAdd}
            className="text-xs font-bold bg-indigo-900 hover:bg-indigo-950 text-white px-3.5 py-2 rounded-lg transition-colors"
          >
            + Add Address
          </button>
        )}
      </div>

      {showForm ? (
        <form onSubmit={submit} className="space-y-3 bg-cream-alt/40 border border-line rounded-xl p-5">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-ink">{editingId ? "Edit Address" : "New Address"}</h4>
            <button type="button" onClick={() => setShowForm(false)} className="text-ink-muted hover:text-ink text-lg" aria-label="Close">
              ✕
            </button>
          </div>

          {error && <p className="text-xs font-semibold text-brick bg-brick/10 border border-brick/30 rounded-lg px-3 py-2">{error}</p>}

          <div>
            <label className={labelCls}>Label</label>
            <input className={inputCls} placeholder="Home, Work, ..." value={form.label} onChange={set("label")} />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Full name</label>
              <input className={inputCls} value={form.fullName} onChange={set("fullName")} />
            </div>
            <div>
              <label className={labelCls}>Phone number</label>
              <input className={inputCls} placeholder="01XXXXXXXXX" value={form.phone} onChange={set("phone")} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Address</label>
            <input className={inputCls} placeholder="House, road, area" value={form.address} onChange={set("address")} />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <CountryStateSelect
              country={form.countryCode || form.country}
              state={form.state}
              onChange={handleLocationChange}
              selectClassName={inputCls}
              labelClassName={labelCls}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>City</label>
              <input className={inputCls} placeholder="City / Area" value={form.city} onChange={set("city")} />
            </div>
            <div>
              <label className={labelCls}>Postal code <span className="text-ink-muted font-normal">(optional)</span></label>
              <input className={inputCls} value={form.postalCode} onChange={set("postalCode")} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="text-xs font-bold text-ink-muted hover:text-ink px-3 py-2">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="text-xs font-bold bg-gold hover:bg-gold-dark text-indigo-950 px-4 py-2 rounded-lg disabled:opacity-50">
              {saving ? "Saving..." : editingId ? "Save Changes" : "Save Address"}
            </button>
          </div>
        </form>
      ) : addresses.length === 0 ? (
        <div className="text-center py-14 text-ink-muted border border-dashed border-line rounded-xl">
          <span className="text-3xl">📍</span>
          <p className="mt-3">No saved addresses yet.</p>
          <p className="text-xs mt-1">Add one to check out faster next time.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {addresses.map((addr) => (
            <div key={addr._id} className="border border-line rounded-xl p-4 relative">
              {addr.isDefault && (
                <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wide text-gold-dark bg-gold-light px-2 py-0.5 rounded-full">
                  Default
                </span>
              )}
              <span className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">{addr.label}</span>
              <p className="text-sm font-bold text-ink mt-1">{addr.fullName}</p>
              <p className="text-xs text-ink-muted">{addr.phone}</p>
              <p className="text-xs text-ink-soft mt-1.5 leading-relaxed">
                {addr.address}, {addr.city}
                {addr.state ? `, ${addr.state}` : ""}
                {addr.postalCode ? ` ${addr.postalCode}` : ""}
                {addr.country ? `, ${addr.country}` : ""}
              </p>

              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-line">
                <button onClick={() => openEdit(addr)} className="text-[12px] font-bold text-indigo-900 hover:underline">
                  Edit
                </button>
                {!addr.isDefault && (
                  <button
                    onClick={() => makeDefault(addr._id)}
                    disabled={busyId === addr._id}
                    className="text-[12px] font-bold text-ink-muted hover:text-indigo-900 disabled:opacity-50"
                  >
                    Set as default
                  </button>
                )}
                <button
                  onClick={() => remove(addr._id)}
                  disabled={busyId === addr._id}
                  className="text-[12px] font-bold text-brick hover:underline disabled:opacity-50 ml-auto"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
