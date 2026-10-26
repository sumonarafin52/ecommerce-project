// tests/registerModels.test.js
// Guards the fix in lib/registerModels.js: every model file must be listed,
// or populate() on it can crash on a freshly started server.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("model registry", () => {
  it("lists every file in models/", () => {
    const files = fs.readdirSync(path.resolve("models")).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3));
    const registry = fs.readFileSync(path.resolve("lib/registerModels.js"), "utf8");
    const missing = files.filter((m) => !registry.includes(`@/models/${m}"`));
    expect(missing).toEqual([]);
  });

  it("is loaded by the database helper", () => {
    expect(fs.readFileSync(path.resolve("lib/db.js"), "utf8")).toContain('import "@/lib/registerModels"');
  });
});
