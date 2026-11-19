import { cp, mkdir } from "node:fs/promises";
import { build } from "esbuild";
await mkdir("public/vision", { recursive: true });
await cp("node_modules/@mediapipe/tasks-vision/wasm", "public/vision", {
  recursive: true,
});
// The MediaPipe loader imports its pinned WASM glue with importScripts.
// Bundle one classic worker for both Vite development and static hosting.
await build({
  entryPoints: ["src/vision.worker.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  outfile: "public/vision/landmarks.js",
});
