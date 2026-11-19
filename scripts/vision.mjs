import { cp, mkdir } from "node:fs/promises";
await mkdir("public/vision", { recursive: true });
await cp("node_modules/@mediapipe/tasks-vision/wasm", "public/vision", {
  recursive: true,
});
const { build } = await import("esbuild");
await build({
  entryPoints: ["src/vision.worker.ts"],
  bundle: true,
  format: "iife",
  outfile: "public/vision/hand-worker.js",
  minify: true,
});

// Cache the versioned model alongside the app when the build host can reach it.
const { readFile, writeFile } = await import("node:fs/promises");
const { createHash } = await import("node:crypto");
const model = "public/models/hand_landmarker.task";
const valid = (bytes) =>
  createHash("sha256").update(bytes).digest("hex") ===
  "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1";
try {
  if (!valid(await readFile(model).catch(() => Buffer.alloc(0)))) {
    const response = await fetch(
      "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      { signal: AbortSignal.timeout(45000) },
    );
    if (!response.ok) throw Error("Model download failed");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!valid(bytes)) throw Error("Unexpected model checksum");
    await mkdir("public/models", { recursive: true });
    await writeFile(model, bytes);
  }
} catch {
  console.warn(
    "Model cache unavailable. The lab will fetch the versioned model on demand.",
  );
}
