// components/auth/PasswordField.jsx
"use client";

import { useState } from "react";
import { scorePassword } from "@/lib/authValidation";

const BAR_COLORS = ["bg-line", "bg-brick", "bg-gold-dark", "bg-indigo-700", "bg-green-600"];
const TEXT_COLORS = ["text-ink-muted", "text-brick", "text-gold-dark", "text-indigo-700", "text-green-700"];

export default function PasswordField({
  value,
  onChange,
  label = "Password",
  placeholder = "Create a strong password",
  showMeter = false,
  context = {},
  autoComplete = "new-password",
  required = true,
}) {
  const [visible, setVisible] = useState(false);
  const strength = showMeter && value ? scorePassword(value, context) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-[13px] font-bold text-ink-soft">{label}</label>
        {value && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="text-[12px] font-bold text-ink-muted hover:text-indigo-900 transition-colors"
          >
            {visible ? "Hide" : "Show"}
          </button>
        )}
      </div>

      <input
        type={visible ? "text" : "password"}
        required={required}
        autoComplete={autoComplete}
        className="w-full px-3.5 py-3 border-[1.5px] border-line rounded-lg text-sm text-ink outline-none focus:border-indigo-900 transition-colors"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />

      {strength && (
        <div className="mt-2">
          <div className="flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                  i < strength.score ? BAR_COLORS[strength.score] : "bg-line"
                }`}
              />
            ))}
          </div>
          <p className={`text-[12px] font-bold mt-1.5 ${TEXT_COLORS[strength.score]}`} aria-live="polite">
            {strength.label}
            {strength.issues.length > 0 && (
              <span className="font-normal text-ink-muted"> — {strength.issues[0]}</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
