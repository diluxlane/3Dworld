// Compare walk height to the triangles actually drawn across the walkable square.
// Usage: node scripts/qa/terrain.cjs docs/evidence/functional/terrain.json
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { buildSync } = require("esbuild");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "valley-terrain-"));
try {
  const dest = path.join(dir, "ground.cjs");
  buildSync({
    entryPoints: ["src/valley-ground.ts"],
    outfile: dest,
    bundle: true,
    platform: "node",
    format: "cjs",
  });
  const { makeGround, terrainHeight } = require(dest);
  const mesh = makeGround(
    {
      ground: null,
      normal: null,
      rough: null,
      rock: null,
      rockNormal: null,
      moss: null,
    },
    () => 1,
  );
  const p = mesh.geometry.getAttribute("position"),
    row = Math.sqrt(p.count);
  const xs = Array.from({ length: row }, (_, i) => p.getX(i));
  let maxFloorAbove = 0,
    maxFloorBelow = 0,
    samples = 0;
  const errors = [];
  for (let z = -29; z < 29; z += 0.5)
    for (let x = -29; x < 29; x += 0.5) {
      const col = xs.findIndex((v) => v > x) - 1,
        line = xs.findIndex((v) => v > z) - 1,
        lower = line * row + col;
      const u = (x - xs[col]) / (xs[col + 1] - xs[col]),
        v = (z - xs[line]) / (xs[line + 1] - xs[line]);
      const a = p.getY(lower),
        b = p.getY(lower + 1),
        c = p.getY(lower + row),
        d = p.getY(lower + row + 1);
      const rendered =
        u + v <= 1
          ? a * (1 - u - v) + b * u + c * v
          : d * (u + v - 1) + b * (1 - v) + c * (1 - u);
      const difference = rendered - terrainHeight(x, z);
      maxFloorAbove = Math.max(maxFloorAbove, difference);
      maxFloorBelow = Math.max(maxFloorBelow, -difference);
      samples++;
      errors.push(Math.abs(difference));
    }
  errors.sort((a, b) => a - b);
  const result = {
    samples,
    stepMeters: 0.5,
    minimumEyeClearanceMeters: 1.7 - maxFloorAbove,
    maxFloorAboveRigMeters: maxFloorAbove,
    maxFloorBelowRigMeters: maxFloorBelow,
    p95AbsoluteErrorMeters: errors[Math.floor(samples * 0.95)],
  };
  fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + "\n");
  console.log(result);
  if (Math.max(maxFloorAbove, maxFloorBelow) > 0.00001) process.exitCode = 1;
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
