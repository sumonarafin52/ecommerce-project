// components/profile/SettingsPanel.jsx
"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";

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

  const [cartReminders, setCartReminders] = useState(true);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsMsg, setPrefsMsg] = useState(null);

  useEffect(() => {
    fetch("/api/account")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setProfile({ name: res.data.name, email: res.data.email });
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch("/api/account/email-prefs")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setCartReminders(res.data.cartReminders);
      })
      .catch(() => {})
      .finally(() => setPrefsLoading(false));
  }, []);

  const savePrefs = async (next) => {
    // Moves straight away, because a switch that waits for the network
    // feels broken — and is put back if the save fails.
    const previous = cartReminders;
    setCartReminders(next);
    setSavingPrefs(true);
    setPrefsMsg(null);
    try {
      const res = await fetch("/api/account/email-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartReminders: next }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      setPrefsMsg({ type: "ok", text: res.message });
    } catch (err) {
      setCartReminders(previous);
      setPrefsMsg({ type: "bad", text: err.message || "Couldn't save that — try again." });
    } finally {
      setSavingPrefs(false);
    }
  };

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
      // Changing the password signs out every existing session, including
      // this one, so send them to sign in again rather than leaving them on
      // a page whose session has just been revoked.
      setPwMsg({
        type: "ok",
        text: "Password changed. You've been signed out everywhere — signing you back in…",
      });
      setTimeout(() => signOut({ callbackUrl: "/login?passwordChanged=1" }), 2000);
      return;
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

      {/* The same switch the link in a basket reminder flips, so somebody
          who wants the emails back doesn't have to ask anyone. */}
      <div className="bg-cream-white border border-line rounded-xl p-6">
        <h3 className="text-[17px] font-bold text-ink">Emails</h3>
        <label className="flex items-start gap-3 mt-4 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 w-4 h-4 accent-indigo-900"
            checked={cartReminders}
            disabled={prefsLoading || savingPrefs}
            onChange={(e) => savePrefs(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-bold text-ink">Basket reminders</span>
            <span className="block text-[13px] text-ink-muted mt-0.5">
              One email if you leave something in your basket. Order confirmations, payment and delivery emails are
              separate and always sent.
            </span>
          </span>
        </label>
        {prefsMsg && (
          <p className={`text-[13px] font-semibold mt-3 ${prefsMsg.type === "ok" ? "text-green-700" : "text-brick"}`}>
            {prefsMsg.text}
          </p>
        )}
      </div>
    </div>
  );
}
