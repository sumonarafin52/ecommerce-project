// lib/simpleMarkdown.js
//
// A deliberately tiny formatter for store-owner-written pages (policies,
// About). Supports:
//   ## Heading / ### Subheading
//   - list item
//   1. numbered item
//   **bold**
//   [link text](/path | https://… | mailto:… | tel:…)
//   blank line = new paragraph
//
// Everything is HTML-escaped BEFORE formatting, so content can't inject
// markup or scripts; link targets are allow-listed so it can't sneak in a
// `javascript:` URL either. No dependency needed for this much.

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const SAFE_HREF = /^(\/(?!\/)|https:\/\/|mailto:|tel:)/i;

function inline(text) {
  let out = escapeHtml(text);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
    // href was escaped above; undo &amp; for the check, keep escaped for output
    const raw = href.replace(/&amp;/g, "&");
    if (!SAFE_HREF.test(raw)) return label;
    const external = /^https:\/\//i.test(raw);
    return `<a href="${href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`;
  });
  return out;
}

export function renderSimpleMarkdown(src = "") {
  const lines = String(src).replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let para = [];
  let list = null;
  let listTag = "ul";

  const flushPara = () => {
    if (para.length) html.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) html.push(`<${listTag}>${list.map((li) => `<li>${inline(li)}</li>`).join("")}</${listTag}>`);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    const h = line.match(/^(#{2,3})\s+(.*)$/);
    if (h) {
      flushPara(); flushList();
      html.push(h[1].length === 2 ? `<h2>${inline(h[2])}</h2>` : `<h3>${inline(h[2])}</h3>`);
      continue;
    }
    const li = line.match(/^[-*]\s+(.*)$/);
    const oli = line.match(/^\d+[.)]\s+(.*)$/);
    if (li || oli) {
      flushPara();
      const tag = oli ? "ol" : "ul";
      if (list && listTag !== tag) flushList(); // switching list type starts a new list
      listTag = tag;
      (list ||= []).push((li || oli)[1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return html.join("\n");
}

// {{storeName}}-style placeholders, filled from store settings. A line whose
// placeholder has no value (e.g. no phone number set) is dropped entirely,
// rather than showing customers a raw "{{storePhone}}".
export function fillPlaceholders(text = "", values = {}) {
  return String(text)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\{\{(\w+)\}\}/g, (m, key) => (values[key] != null && values[key] !== "" ? String(values[key]) : m)))
    .filter((line) => !/\{\{\w+\}\}/.test(line))
    .join("\n");
}
