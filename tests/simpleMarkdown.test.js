// tests/simpleMarkdown.test.js
import { describe, it, expect } from "vitest";
import { renderSimpleMarkdown as md, fillPlaceholders } from "@/lib/simpleMarkdown";

describe("renderSimpleMarkdown", () => {
  it("formats headings, lists, bold and paragraphs", () => {
    const out = md("## Returns\n\nYou have **7 days**.\n\n- Unused\n- In box");
    expect(out).toContain("<h2>Returns</h2>");
    expect(out).toContain("<strong>7 days</strong>");
    expect(out).toContain("<ul><li>Unused</li><li>In box</li></ul>");
  });

  it("escapes HTML so page content can't inject markup or scripts", () => {
    const out = md('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;");
  });

  it("allows safe links but never javascript: URLs", () => {
    expect(md("[Contact](/contact)")).toContain('<a href="/contact">Contact</a>');
    expect(md("[Mail](mailto:a@b.com)")).toContain('href="mailto:a@b.com"');
    expect(md("[Site](https://example.com)")).toContain('rel="noopener noreferrer"');
    const evil = md("[click](javascript:alert(1))");
    expect(evil).not.toContain("javascript:");
    expect(evil).not.toContain("<a");
    expect(md("[x](//evil.com)")).not.toContain("<a"); // protocol-relative off-site
  });

  it("can't break out of an attribute through a link", () => {
    const out = md('[x](/a"onmouseover="alert(1))');
    expect(out).not.toContain('"onmouseover=');
  });
});

describe("fillPlaceholders", () => {
  it("fills known values", () => {
    expect(fillPlaceholders("Welcome to {{storeName}}", { storeName: "SumonShop" })).toBe("Welcome to SumonShop");
  });
  it("drops lines whose value is missing instead of showing raw tokens", () => {
    const out = fillPlaceholders("Email: {{storeEmail}}\nPhone: {{storePhone}}", { storeEmail: "a@b.com" });
    expect(out).toBe("Email: a@b.com");
  });
});

describe("numbered lists", () => {
  it("renders 1. 2. 3. as an ordered list, separate from bullets", () => {
    const out = md("1. Go to orders\n2. Choose return\n\n- a\n- b");
    expect(out).toContain("<ol><li>Go to orders</li><li>Choose return</li></ol>");
    expect(out).toContain("<ul><li>a</li><li>b</li></ul>");
  });
});
