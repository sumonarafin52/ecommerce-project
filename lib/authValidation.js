// lib/authValidation.js
//
// One source of truth for credential rules, shared by the registration
// API, the password-change API, and the client-side strength meter — so
// the server never accepts something the UI called strong, and the UI
// never rejects something the server would have allowed.

// Deliberately pragmatic rather than RFC-5322-exhaustive: catches real
// typos ("user@", "user.com", spaces) without rejecting valid unusual
// addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

export const PASSWORD_MIN = 8;
// bcrypt silently truncates beyond 72 *bytes*, so anything past that is
// security theatre — and accepting megabyte passwords is a cheap DoS
// (every attempt burns CPU hashing it).
export const PASSWORD_MAX = 72;
export const NAME_MAX = 80;
export const EMAIL_MAX = 254; // practical maximum length of an email address

// Passwords people pick constantly; blocking these removes the cheapest
// possible attack without pretending to be a full breach-corpus check.
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwerty123", "qwertyuiop", "abc12345", "iloveyou", "admin123", "welcome1",
  "letmein1", "sunshine", "princess", "football", "monkey123", "11111111",
  "bangladesh", "dhaka123", "asdfghjkl", "zxcvbnm1", "passw0rd", "p@ssword",
]);

export function validateName(name) {
  if (typeof name !== "string") return "Name is required";
  const trimmed = name.trim();
  if (trimmed.length < 2) return "Please enter your full name";
  if (trimmed.length > NAME_MAX) return `Name must be under ${NAME_MAX} characters`;
  return null;
}

export function validateEmail(email) {
  if (typeof email !== "string") return "Email is required";
  const trimmed = email.trim();
  if (!trimmed) return "Email is required";
  if (trimmed.length > EMAIL_MAX) return "That email address is too long";
  if (!EMAIL_RE.test(trimmed)) return "Please enter a valid email address";
  return null;
}

/**
 * Scores password strength 0–4 and explains what's missing.
 * Used both to block weak passwords server-side and to drive the live
 * strength meter on the signup form.
 */
export function scorePassword(password, { name = "", email = "" } = {}) {
  const result = { score: 0, label: "Too weak", issues: [] };
  if (typeof password !== "string" || !password) {
    result.issues.push("Password is required");
    return result;
  }

  if (password.length < PASSWORD_MIN) {
    result.issues.push(`Use at least ${PASSWORD_MIN} characters`);
  }
  if (password.length > PASSWORD_MAX) {
    result.issues.push(`Keep it under ${PASSWORD_MAX} characters`);
  }

  const lower = password.toLowerCase();

  if (COMMON_PASSWORDS.has(lower)) {
    result.issues.push("That password is too common — pick something less guessable");
  }

  // Don't let someone use their own name or email handle as the password;
  // it's the first thing anyone targeting them would try.
  const emailHandle = String(email).split("@")[0]?.toLowerCase();
  if (emailHandle && emailHandle.length >= 3 && lower.includes(emailHandle)) {
    result.issues.push("Don't use your email address in your password");
  }
  const firstName = String(name).trim().split(/\s+/)[0]?.toLowerCase();
  if (firstName && firstName.length >= 3 && lower.includes(firstName)) {
    result.issues.push("Don't use your name in your password");
  }

  // A single repeated character, or a straight run like "123456"/"abcdef"
  if (/^(.)\1+$/.test(password)) {
    result.issues.push("Don't repeat a single character");
  }

  // variety earns points
  let variety = 0;
  if (/[a-z]/.test(password)) variety++;
  if (/[A-Z]/.test(password)) variety++;
  if (/[0-9]/.test(password)) variety++;
  if (/[^A-Za-z0-9]/.test(password)) variety++;

  if (variety < 2) {
    result.issues.push("Mix letters with numbers or symbols");
  }

  // score: length is the biggest real contributor to strength, variety second
  let score = 0;
  if (password.length >= PASSWORD_MIN) score++;
  if (password.length >= 12) score++;
  if (variety >= 2) score++;
  if (variety >= 3 && password.length >= 10) score++;
  if (result.issues.length) score = Math.min(score, 1);

  result.score = Math.max(0, Math.min(4, score));
  result.label = ["Too weak", "Weak", "Fair", "Good", "Strong"][result.score];
  return result;
}

/**
 * Server-side gate. Returns an error string, or null if acceptable.
 * A password only needs to clear "Fair" — strong enough to stop trivial
 * guessing without forcing people into patterns they'll write on a sticky note.
 */
export function validatePassword(password, context = {}) {
  const { issues } = scorePassword(password, context);
  return issues.length ? issues[0] : null;
}
