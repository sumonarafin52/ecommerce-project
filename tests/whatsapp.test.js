// tests/whatsapp.test.js
import { describe, it, expect } from "vitest";
import { toWhatsAppNumber } from "@/components/layout/WhatsAppButton";

describe("toWhatsAppNumber", () => {
  it("converts a Bangladeshi local number to international form", () => {
    expect(toWhatsAppNumber("01711223344")).toBe("8801711223344");
    expect(toWhatsAppNumber("017-1122-3344")).toBe("8801711223344");
  });
  it("keeps already-international numbers", () => {
    expect(toWhatsAppNumber("+880 1711 223344")).toBe("8801711223344");
    expect(toWhatsAppNumber("008801711223344")).toBe("8801711223344");
    expect(toWhatsAppNumber("8801711223344")).toBe("8801711223344");
  });
  it("rejects junk so the button stays hidden", () => {
    expect(toWhatsAppNumber("")).toBe("");
    expect(toWhatsAppNumber("12345")).toBe("");
    expect(toWhatsAppNumber("call me")).toBe("");
    expect(toWhatsAppNumber(undefined)).toBe("");
  });
});
