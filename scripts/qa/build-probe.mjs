// Build an instrumented copy into a temporary directory. Never deploy this build.
import path from "node:path";
import { pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2]),
  outDir = path.resolve(process.argv[3]);
const { build } = await import(
  pathToFileURL(path.join(root, "node_modules/vite/dist/node/index.js"))
);
await build({
  root,
  build: { outDir, emptyOutDir: true },
  plugins: [
    {
      name: "local-measurement-probe",
      enforce: "pre",
      transform(code, id) {
        if (id.endsWith("/src/valley.ts")) {
          // Start each timer after the arguments (including the network buffer) resolve.
          // Timings overlap while other asset jobs execute; do not add them together.
          for (const call of ["textureLoader.loadAsync", "models.parseAsync"]) {
            const original = call + "(";
            const wrapped =
              "(async (...args) => { const start=performance.now();const value=await " +
              call +
              '(...args);performance.measure("asset-decode/"+name,{start,end:performance.now()});return value; })(';
            code = code.replace(original, wrapped);
          }
          return code;
        }
        if (!id.endsWith("/src/main.ts")) return;
        const anchor = /env\.update\(elapsed(?:, rig\.position)?\);/;
        if (!anchor.test(code))
          throw Error("Find the new pre-render hook before benchmarking.");
        const tail = "else renderer.render(env.scene, camera);";
        if (!code.includes(tail))
          throw Error("Locate the renderer submission boundary.");
        return code
          .replace(tail, tail + "\n window.__xrAfter?.();")
          .replace(
            anchor,
            (match) =>
              `window.__xrSample?.({renderer,camera,rig,env,id});\n    ${match}`,
          );
      },
    },
  ],
});
