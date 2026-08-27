// tests/utils.test.js
import { describe, it, expect } from "vitest";
import { isValidQuantity } from "@/lib/utils";

describe("isValidQuantity", () => {
  it("rejects zero", () => {
    expect(isValidQuantity(0)).toBe(false);
  });

  it("rejects negative numbers", () => {
    expect(isValidQuantity(-1)).toBe(false);
    expect(isValidQuantity(-100)).toBe(false);
  });

  it("rejects decimals", () => {
    expect(isValidQuantity(1.5)).toBe(false);
    expect(isValidQuantity(2.0001)).toBe(false);
  });

  it("rejects NaN", () => {
    expect(isValidQuantity(NaN)).toBe(false);
  });

  it("rejects numeric-looking strings (must be a real number, not coerced)", () => {
    expect(isValidQuantity("5")).toBe(false);
    expect(isValidQuantity("1")).toBe(false);
  });

  it("rejects non-numeric strings", () => {
    expect(isValidQuantity("abc")).toBe(false);
    expect(isValidQuantity("")).toBe(false);
  });

  it("rejects other malformed values", () => {
    expect(isValidQuantity(null)).toBe(false);
    expect(isValidQuantity(undefined)).toBe(false);
    expect(isValidQuantity({})).toBe(false);
    expect(isValidQuantity([])).toBe(false);
    expect(isValidQuantity(true)).toBe(false);
    expect(isValidQuantity(Infinity)).toBe(false);
  });

  it("accepts valid positive integers", () => {
    expect(isValidQuantity(1)).toBe(true);
    expect(isValidQuantity(5)).toBe(true);
    expect(isValidQuantity(500)).toBe(true);
  });

  it("rejects quantities above the sane upper bound", () => {
    expect(isValidQuantity(501)).toBe(false);
    expect(isValidQuantity(999999999)).toBe(false);
  });
});
