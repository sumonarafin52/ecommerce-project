// components/profile/SettingsPanel.jsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const inputCls =
  "w-full bg-cream-white border-[1.5px] border-line rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder-ink-muted outline-none focus:border-indigo-900 transition-colors";
const labelCls = "block text-[12px] font-bold text-ink-soft mb-1.5";

export default function SettingsPanel() {
  const { update } = useSession();

  const [profile, setProfile] = useState({ name: "", email: "" });
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);

  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  useEffect(() => {
    fetch("/api/account")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setProfile({ name: res.data.name, email: res.data.email });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileMsg(null);
    setSavingProfile(true);
    try {
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      // refresh the JWT session so the header/avatar reflect the new
      // name/email right away, without needing to sign in again
      await update({ name: res.data.name, email: res.data.email });
      setProfileMsg({ type: "ok", text: "Profile updated successfully." });
    } catch (err) {
      setProfileMsg({ type: "bad", text: err.message || "Failed to update profile" });
    }
    setSavingProfile(false);
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwMsg(null);
    if (pw.newPassword !== pw.confirmPassword) {
      setPwMsg({ type: "bad", text: "New passwords don't match." });
      return;
    }
    setSavingPw(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      setPw({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPwMsg({ type: "ok", text: "Password changed successfully." });
    } catch (err) {
      setPwMsg({ type: "bad", text: err.message || "Failed to change password" });
    }
    setSavingPw(false);
  };

  if (loading) {
    return (
      <div className="bg-cream-white border border-line rounded-xl p-6 flex items-center justify-center py-14">
        <div className="w-7 h-7 border-2 border-indigo-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={saveProfile} className="bg-cream-white border border-line rounded-xl p-6 space-y-4">
        <h3 className="text-[17px] font-bold text-ink">Profile Information</h3>

        {profileMsg && (
          <p
            className={`text-sm font-semibold rounded-lg px-4 py-3 border ${
              profileMsg.type === "ok"
                ? "text-green-700 bg-green-50 border-green-200"
                : "text-brick bg-brick/5 border-brick/20"
            }`}
          >
            {profileMsg.text}
          </p>
        )}

        <div>
          <label className={labelCls}>Full name</label>
          <input className={inputCls} value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Email address</label>
          <input
            type="email"
            className={inputCls}
            value={profile.email}
            onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
          />
        </div>

        <button
          type="submit"
          disabled={savingProfile}
          className="bg-indigo-900 hover:bg-indigo-950 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          {savingProfile ? "Saving..." : "Save Changes"}
        </button>
      </form>

      <form onSubmit={savePassword} className="bg-cream-white border border-line rounded-xl p-6 space-y-4">
        <h3 className="text-[17px] font-bold text-ink">Change Password</h3>

        {pwMsg && (
          <p
            className={`text-sm font-semibold rounded-lg px-4 py-3 border ${
              pwMsg.type === "ok" ? "text-green-700 bg-green-50 border-green-200" : "text-brick bg-brick/5 border-brick/20"
            }`}
          >
            {pwMsg.text}
          </p>
        )}

        <div>
          <label className={labelCls}>Current password</label>
          <input
            type="password"
            className={inputCls}
            value={pw.currentPassword}
            onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>New password</label>
            <input
              type="password"
              className={inputCls}
              value={pw.newPassword}
              onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelCls}>Confirm new password</label>
            <input
              type="password"
              className={inputCls}
              value={pw.confirmPassword}
              onChange={(e) => setPw((p) => ({ ...p, confirmPassword: e.target.value }))}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={savingPw}
          className="bg-gold hover:bg-gold-dark text-indigo-950 font-bold px-5 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          {savingPw ? "Updating..." : "Change Password"}
        </button>
      </form>
    </div>
  );
}
