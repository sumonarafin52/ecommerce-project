// tests/i18n.test.js
import { describe, it, expect } from "vitest";
import dict, { translate, LANGS } from "@/lib/i18n";

describe("translations", () => {
  it("returns the Bangla string when available", () => {
    expect(translate("bn", "addToCart")).toBe("কার্টে যোগ করুন");
    expect(translate("en", "addToCart")).toBe("Add to Cart");
  });

  it("falls back to English for a key with no Bangla entry", () => {
    dict.en.__testOnly = "Fallback text";
    expect(translate("bn", "__testOnly")).toBe("Fallback text");
    delete dict.en.__testOnly;
  });

  it("returns the key itself if it's unknown, never blank", () => {
    expect(translate("bn", "doesNotExist")).toBe("doesNotExist");
  });

  it("fills placeholders", () => {
    expect(translate("en", "onlyLeft", { n: 3 })).toBe("Only 3 left");
    expect(translate("bn", "onlyLeft", { n: 3 })).toBe("মাত্র 3টি বাকি");
  });

  it("every Bangla key exists in English (no orphans)", () => {
    const orphans = Object.keys(dict.bn).filter((k) => !(k in dict.en));
    expect(orphans).toEqual([]);
  });

  it("no Bangla value was left as the English text by mistake", () => {
    const untranslated = Object.keys(dict.bn).filter(
      (k) => dict.bn[k] === dict.en[k] && !/[✓→🛒]/.test(dict.en[k])
    );
    expect(untranslated).toEqual([]);
  });

  it("offers exactly the two supported languages", () => {
    expect(Object.keys(LANGS)).toEqual(["en", "bn"]);
  });
});
