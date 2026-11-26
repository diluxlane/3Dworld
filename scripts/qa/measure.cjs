// Usage: node measure.cjs URL output-directory baseline|candidate
// Requires Playwright and Chromium. Set CHROME_BIN when using a non-default browser.
const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path");
const [url, out, label] = process.argv.slice(2),
  dest = path.join(out, label === "baseline" ? "before" : "after");
const stage = process.env.QA_STAGE || "all";
fs.mkdirSync(dest, { recursive: true });
fs.mkdirSync(path.join(out, "data"), { recursive: true });
const output = {
  engine: "Chromium / ANGLE SwiftShader",
  label,
  scenes: [],
  route: {},
  tiers: {},
  stress: [],
  checks: [],
  errors: [],
};
const views = {
  overview: [-8, 7, 0, 0],
  close: [-6, -2, -0.25, -0.58],
  water: [-3, -7, -0.38, -0.19],
  light: [-8, 2, -0.62, 0.17],
};
function setup() {
  let calls = 0,
    tri = 0,
    prev = null,
    frame = 0;
  const proto = WebGL2RenderingContext.prototype;
  for (const [name, countIdx, instanceIdx] of [
    ["drawElements", 1, null],
    ["drawArrays", 2, null],
    ["drawElementsInstanced", 1, 4],
    ["drawArraysInstanced", 2, 3],
  ]) {
    const old = proto[name];
    proto[name] = function (...a) {
      calls++;
      const n = a[countIdx],
        inst = instanceIdx == null ? 1 : a[instanceIdx];
      if (a[0] === 4) tri += (n / 3) * inst;
      else if (a[0] === 5 || a[0] === 6) tri += Math.max(0, n - 2) * inst;
      return old.apply(this, a);
    };
  }
  const long = [];
  try {
    new PerformanceObserver((list) =>
      long.push(...list.getEntries().map((e) => [e.startTime, e.duration])),
    ).observe({ type: "longtask", buffered: true });
  } catch {}
  const state = (window.__bench = {
    rows: [],
    long,
    place: null,
    pose: null,
    step: null,
    record: false,
    heapPeak: 0,
    swaps: 0,
    frame: 0,
  });
  let submittedMs = null;
  let gl,
    timer,
    query,
    running = false;
  state.gpu = [];
  state.disjoint = 0;
  window.__xrAfter = () => {
    if (running) {
      gl.endQuery(timer.TIME_ELAPSED_EXT);
      running = false;
    }
    if (prev !== null)
      submittedMs = Math.round((performance.now() - prev) * 100) / 100;
  };
  window.__xrSample = ({ renderer, camera, rig, env, id }) => {
    const t = performance.now(),
      heap = performance.memory?.usedJSHeapSize ?? null;
    if (!state.gl) {
      gl = renderer.getContext();
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      state.gl = {
        renderer: info
          ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
        timerQuery: !!timer,
      };
    }
    if (state.sampleGpu && timer) {
      if (query && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
        const ns = gl.getQueryParameter(query, gl.QUERY_RESULT);
        if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) state.gpu.push(ns / 1e6);
        else state.disjoint++;
        gl.deleteQuery(query);
        query = null;
      }
      if (!query) {
        query = gl.createQuery();
        gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
        running = true;
      }
    }
    if (state.place !== id) {
      state.place = id;
      state.changed = t;
      state.submitted = null;
      state.swaps++;
    } else if (state.submitted == null) state.submitted = t;
    if (state.record && prev !== null) {
      state.rows.push([
        Math.round((t - prev) * 100) / 100,
        calls,
        Math.round(tri),
        renderer.info.memory.textures,
        renderer.info.memory.geometries,
        heap,
        Math.round(t),
        submittedMs,
      ]);
      if (heap) state.heapPeak = Math.max(state.heapPeak, heap);
    }
    state.frame = ++frame;
    calls = tri = 0;
    prev = t;
    const pose = state.step ? state.step(state.rows.length) : state.pose;
    if (pose) {
      rig.position.set(pose[0], env.height(pose[0], pose[1]), pose[1]);
      camera.position.set(0, 1.7, 0);
      camera.rotation.set(pose[3], pose[2], 0, "YXZ");
    }
  };
}
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--single-process",
      "--no-zygote",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--enable-precise-memory-info",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 480, height: 300 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(setup);
  const p = await context.newPage();
  p.setDefaultTimeout(20000);
  p.on("pageerror", (e) => output.errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") output.errors.push(m.text());
  });
  output.version = browser.version();
  async function scene(id, cold = false) {
    const started = cold ? 0 : await p.evaluate(() => performance.now());
    if (cold)
      await p.goto(url + "/?qa=" + encodeURIComponent(id) + "#" + id, {
        waitUntil: "domcontentloaded",
      });
    else await p.evaluate((id) => (location.hash = id), id);
    await p.waitForFunction(
      (id) =>
        window.__bench?.place === id &&
        document.querySelector("#loading").hidden,
      id,
    );
    await p.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    return p.evaluate(
      ({ id, started }) => ({
        id,
        firstFrameMs: Math.round(
          (__bench.submitted ?? __bench.changed) - started,
        ),
        sceneReadyMs: Math.round(__bench.changed - started),
        resources: performance.getEntriesByType("resource").map((r) => ({
          name: new URL(r.name).pathname,
          transfer: r.transferSize,
          body: r.encodedBodySize,
          end: Math.round(r.responseEnd),
        })),
        geometries: null,
      }),
      { id, started },
    );
  }
  async function tier(name) {
    await p.locator("#settings").click();
    await p.locator("dialog select").first().selectOption({ label: name });
    await p.keyboard.press("Escape");
    await p.waitForTimeout(200);
  }
  async function record(frames, route) {
    await p.evaluate(
      ({ route, frames }) => {
        const b = window.__bench;
        b.rows = [];
        b.record = true;
        b.step = route
          ? (i) => {
              const f = Math.min(1, i / frames);
              return [-8 + 3 * f, 7 - 10 * f, -0.24 * f, -0.08 * f];
            }
          : null;
      },
      { route, frames },
    );
    await p.waitForFunction((n) => __bench.rows.length >= n, frames, {
      timeout: 180000,
    });
    return p.evaluate((n) => {
      const b = window.__bench;
      b.record = false;
      b.step = null;
      return b.rows.slice(1, n);
    }, frames);
  }
  if (stage === "gpu") {
    await scene("valley", true);
    await tier("High");
    await p.evaluate((v) => (__bench.pose = v), views.overview);
    await record(10, false);
    await p.evaluate(() => (__bench.sampleGpu = true));
    await record(60, false);
    output.gpu = await p.evaluate(() => ({
      samples: __bench.gpu,
      disjoint: __bench.disjoint,
      support: __bench.gl,
    }));
  }
  if (stage === "all" || stage === "visual" || stage === "valley-visual") {
    for (const [w, h, suffix] of [
      [960, 600, "desktop"],
      [390, 844, "mobile"],
    ]) {
      await p.setViewportSize({ width: w, height: h });
      for (const id of stage === "valley-visual"
        ? ["valley"]
        : ["hub", "earth", "field", "sculpture", "lab", "valley"]) {
        await scene(id, true);
        if (id === "valley")
          await p.evaluate((v) => (__bench.pose = v), views.overview);
        await p.waitForTimeout(id === "valley" ? 1300 : 100);
        await p.screenshot({
          path: path.join(dest, id + "-" + suffix + ".jpg"),
          quality: 75,
        });
      }
      if (suffix === "desktop") {
        for (const key of ["close", "water", "light"]) {
          await p.evaluate((v) => {
            __bench.pose = v;
            document.querySelector("#caption").style.visibility = "hidden";
          }, views[key]);
          await p.waitForTimeout(180);
          await p.screenshot({
            path: path.join(dest, "valley-" + key + ".jpg"),
            quality: 80,
          });
        }
      }
    }
    await p.setViewportSize({ width: 800, height: 480 });
    await scene("valley", true);
    await p.locator("#settings").click();
    await p.getByRole("button", { name: /Phone VR.*split/ }).click();
    await p.waitForTimeout(300);
    await p.screenshot({
      path: path.join(dest, "valley-stereo.jpg"),
      quality: 75,
    });
    await p.getByRole("button", { name: "Exit split view" }).click();
    await p.waitForFunction(() => !document.fullscreenElement);
    output.checks.push(
      "Screenshot capture for six desktop and portrait routes; stereo button entered split view",
    );
  }
  if (stage === "all" || stage === "numbers" || stage === "loads") {
    await p.setViewportSize({ width: 480, height: 300 });
    for (const id of ["hub", "earth", "valley", "field", "sculpture", "lab"]) {
      const client = await context.newCDPSession(p);
      await client.send("Network.enable");
      await client.send("Network.setCacheDisabled", { cacheDisabled: true });
      const load = await scene(id, true);
      await p.waitForTimeout(500);
      const rows = await record(20, false);
      const resources = await p.evaluate(() =>
        [
          ...performance.getEntriesByType("navigation"),
          ...performance.getEntriesByType("resource"),
        ].map((r) => ({
          name: new URL(r.name).pathname,
          transfer: r.transferSize,
          body: r.encodedBodySize,
        })),
      );
      output.scenes.push({
        id,
        firstFrameMs: load.firstFrameMs,
        sceneReadyMs: load.sceneReadyMs,
        decode: await p.evaluate(() =>
          performance
            .getEntriesByType("measure")
            .filter((r) => r.name.startsWith("asset-decode/"))
            .map((r) => ({ name: r.name.slice(13), ms: r.duration })),
        ),
        transfer: resources.reduce((s, r) => s + r.transfer, 0),
        resources,
        rows,
      });
      await client.detach();
      console.log(
        "Cold route",
        id,
        load.firstFrameMs,
        output.scenes.at(-1).transfer,
      );
    }
  }
  if (stage === "all" || stage === "numbers") {
    await scene("valley", true);
    for (const q of label === "baseline"
      ? ["Low", "High"]
      : ["Low", "Balanced", "High"]) {
      await tier(q);
      await p.evaluate((v) => (__bench.pose = v), views.overview);
      await record(10, false);
      output.tiers[q] = await record(40, false);
      console.log("Tier", q, output.tiers[q].at(-1));
    }
    await tier("High");
    await record(12, false);
    output.route.High = await record(100, true);
    console.log("Matched route complete");
    const t0 = Date.now();
    await tier("Low");
    await p.evaluate((v) => (__bench.pose = v), views.overview);
    while (Date.now() - t0 < 65000) {
      const rows = await record(24, false);
      output.stress.push(...rows);
    }
    output.gl = await p.evaluate(() => __bench.gl);
    output.long = await p.evaluate(() => __bench.long);
    output.checks.push(
      "Four GL draw entry points counted including nested reflection pass; High matched route; Low 65s+ continuous run",
    );
    await scene("hub");
    await scene("sculpture");
    await p.goBack();
    await p.waitForFunction(() => __bench.place === "hub");
    for (let i = 0; i < 3; i++)
      for (const id of ["valley", "lab", "hub"]) {
        await scene(id);
        const rows = await record(4, false);
        output.checks.push({
          cycle: i,
          id,
          resources: rows.at(-1).slice(3, 6),
        });
      }
  }
  fs.writeFileSync(
    path.join(out, "data", label + "-" + stage + ".json"),
    JSON.stringify(output),
  );
  await browser.close();
})().catch((e) => {
  fs.writeFileSync(
    path.join(out, "data", label + "-" + stage + "-error.json"),
    JSON.stringify({ ...output, failure: String(e) }),
  );
  console.error(e);
  process.exit(1);
});
