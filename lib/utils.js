// lib/utils.js

export function formatCurrency(amount) {
  return `৳${Number(amount || 0).toLocaleString()}`;
}

export function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getEffectivePrice(product) {
  return product.discountPrice > 0 ? product.discountPrice : product.price;
}

export function getDiscountPercentage(product) {
  if (!product.discountPrice || product.discountPrice <= 0) return 0;
  return Math.round(
    ((product.price - product.discountPrice) / product.price) * 100
  );
}

// Once a product has variant combinations, its base `stock` field is no
// longer meaningfully maintained (each combination tracks its own) — so
// "how much is available" needs to sum the active combinations instead,
// wherever a product is shown without a specific variant already chosen
// (product cards, admin tables). The product detail page already does its
// own combo-aware lookup once a specific variant is selected.
export function getTotalStock(product) {
  if (product.combinations?.length) {
    return product.combinations.reduce((sum, c) => sum + (c.active !== false ? c.stock || 0 : 0), 0);
  }
  return product.stock || 0;
}

export function formatDate(date) {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// For timelines/activity logs where knowing just the date isn't enough to
// tell events apart (several can happen the same day) — includes the time.
export function formatDateTime(date) {
  return new Date(date).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Text utilities
export function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

// Validation utilities
export function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

export function isValidPhone(phone) {
  return /^(\+88)?01[0-9]{9}$/.test(phone.replace(/\s/g, ""));
}

// Formatting utilities
export function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

// Rating utilities
export function getStarArray(rating) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    if (i <= Math.floor(rating)) {
      stars.push("full");
    } else if (i - rating < 1) {
      stars.push("half");
    } else {
      stars.push("empty");
    }
  }
  return stars;
}