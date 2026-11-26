import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
const { code } = await transform(
  await readFile(new URL("../../src/quality.ts", import.meta.url), "utf8"),
  { loader: "ts", format: "esm" },
);
const { QualityControl } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
function frames(manager, count, dt) {
  for (let i = 0; i < count; i++) manager.observe(dt);
}
test("Auto counts sustained slow frames including intervals greater than 200 ms", () => {
  const q = new QualityControl(false);
  frames(q, 6, 0.25);
  assert.equal(q.tier, "Balanced");
  frames(q, 6, 0.25);
  assert.equal(q.tier, "Low");
});
test("Recovery requires more sustained evidence than a downshift", () => {
  const q = new QualityControl(true);
  frames(q, 500, 0.016);
  assert.equal(q.tier, "Low");
  frames(q, 80, 0.016);
  assert.equal(q.tier, "Balanced");
});
test("Explicit tiers remain selected through stalls", () => {
  const q = new QualityControl(true);
  q.select("High");
  frames(q, 100, 0.1);
  assert.equal(q.tier, "High");
  q.select("Auto");
  assert.equal(q.tier, "Low");
});
test("Auto reduces resolution gradually at Low and manual selection restores the fixed cap", () => {
  const q = new QualityControl(true);
  frames(q, 12, 0.25);
  assert.ok(Math.abs(q.resolutionLimit - 0.7) < 1e-6);
  frames(q, 12, 0.25);
  assert.ok(Math.abs(q.resolutionLimit - 0.6) < 1e-6);
  frames(q, 100, 0.25);
  assert.ok(q.resolutionLimit >= 0.6);
  frames(q, 380, 0.016);
  assert.ok(Math.abs(q.resolutionLimit - 0.7) < 1e-6);
  q.select("Low");
  assert.equal(q.resolutionLimit, 0.8);
});
