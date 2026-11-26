/* Reproducible QA harness for 4bb8b0e. All timing hooks live in disposable builds. */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { chromium } = require("playwright");
const [rootArg, model, fixture, output, candidateCSS] = process.argv.slice(2);
if (!rootArg || !model || !fixture || !output)
  throw Error("Usage: node probe.cjs SOURCE MODEL.task HANDS.jpg OUTPUT.json");
const root = path.resolve(rootArg);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "xr-hand-probe-"));
const build = require(path.join(root, "node_modules/esbuild")).build;
const source = (name) => fs.readFileSync(path.join(root, "src", name), "utf8");
function patch(code, from, to) {
  if (!code.includes(from))
    throw Error("Incompatible source revision: " + from);
  return code.replace(from, to);
}

async function prepare() {
  const common = {
    bundle: true,
    format: "iife",
    minify: true,
    absWorkingDir: root,
  };
  await build({
    ...common,
    entryPoints: ["src/main.ts"],
    outfile: path.join(temp, "app.js"),
    define: { "import.meta.env.BASE_URL": '"/"' },
    plugins: [
      {
        name: "probe-classifier",
        setup(plugin) {
          plugin.onLoad({ filter: /[/\\]tracking\.ts$/ }, () => ({
            loader: "ts",
            resolveDir: path.join(root, "src"),
            contents: patch(
              source("tracking.ts"),
              "this.gesture(g);",
              `this.gesture(g);
          window.probe.gestures.push({gesture:g, time:performance.now(), sample:data.t});`,
            ),
          }));
        },
      },
    ],
  });
  for (const delegate of ["CPU", "GPU"]) {
    let worker = patch(
      source("vision.worker.ts"),
      'delegate: "CPU"',
      'delegate: "' + delegate + '"',
    );
    worker = patch(
      worker,
      "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      "/model",
    );
    worker = patch(
      worker,
      "const result = model.detectForVideo",
      "const tic=performance.now();const result = model.detectForVideo",
    );
    worker = patch(
      worker,
      "landmarks: result.landmarks[0]",
      "inferenceMs:performance.now()-tic, landmarks: result.landmarks[0]",
    );
    worker = patch(worker, "  } catch {", "  } catch(err) {");
    worker = patch(
      worker,
      '"Hand model unavailable. Check your connection or use the gesture buttons."',
      "String(err)",
    );
    await build({
      ...common,
      stdin: {
        contents: worker,
        resolveDir: path.join(root, "src"),
        loader: "ts",
      },
      outfile: path.join(temp, delegate + ".js"),
    });
  }
  let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  html = patch(
    html,
    '<script type="module" src="/src/main.ts"></script>',
    '<link rel="stylesheet" href="/app.css"><script defer src="/app.js"></script>',
  );
  fs.writeFileSync(path.join(temp, "index.html"), html);
}

async function run() {
  await prepare();
  let delegate = "CPU";
  const routes = {
    "/": path.join(temp, "index.html"),
    "/app.js": path.join(temp, "app.js"),
    "/app.css": path.join(temp, "app.css"),
    "/model": model,
    "/fixture.jpg": fixture,
  };
  const server = http.createServer((req, res) => {
    const file =
      routes[req.url] ||
      (req.url === "/vision/landmarks.js"
        ? path.join(temp, delegate + ".js")
        : /^\/vision\/[\w.]+$/.test(req.url)
          ? path.join(
              root,
              "node_modules/@mediapipe/tasks-vision/wasm",
              path.basename(req.url),
            )
          : null);
    if (!file || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      req.url === "/"
        ? "text/html"
        : file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : file.endsWith(".wasm")
              ? "application/wasm"
              : file.endsWith(".jpg")
                ? "image/jpeg"
                : "application/octet-stream",
    );
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: process.env.CHROMIUM_PATH
      ? [
          "--no-sandbox",
          "--no-zygote",
          "--single-process",
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ]
      : [],
  });
  const report = {
    source: "4bb8b0e2b3a7993614c809d7613001da49516e56",
    browser: browser.version(),
    media: [640, 480],
    viewport: [480, 300],
    runs: {},
  };
  try {
    const ctx = await browser.newContext({
      viewport: { width: 480, height: 300 },
    });
    await ctx.addInitScript(() => {
      const stats = (window.probe = {
        samples: [],
        gestures: [],
        ready: [],
        bitmaps: [],
        switches: [],
        terminations: 0,
        error: null,
        desired: "blank",
        deny: false,
        sourceFrames: [],
        tracks: [],
      });
      let inputTime, pending;
      const create = window.createImageBitmap.bind(window);
      window.createImageBitmap = async (...args) => {
        inputTime = performance.now();
        const bitmap = await create(...args);
        pending = performance.now() - inputTime;
        return bitmap;
      };
      const WorkerOriginal = window.Worker;
      window.Worker = class extends WorkerOriginal {
        constructor(...args) {
          super(...args);
          this.addEventListener("message", ({ data }) => {
            const now = performance.now();
            if (data.error) stats.error = data.error;
            if (data.ready) stats.ready.push(now - this.startTime);
            if (data.t !== undefined)
              stats.samples.push({
                frame: data.t,
                inferenceMs: data.inferenceMs,
                bitmapMs: pending,
                roundTripMs: now - data.t,
                hand: !!data.landmarks,
              });
          });
        }
        postMessage(data, ...rest) {
          if (data.init) this.startTime = performance.now();
          return super.postMessage(data, ...rest);
        }
        terminate() {
          stats.terminations++;
          return super.terminate();
        }
      };
      navigator.mediaDevices.getUserMedia = async () => {
        if (stats.deny)
          throw new DOMException(
            "Fixture permission denied",
            "NotAllowedError",
          );
        const img = new Image();
        img.src = "/fixture.jpg";
        await img.decode();
        const c = document.createElement("canvas");
        c.width = 640;
        c.height = 480;
        const g = c.getContext("2d");
        let last = "";
        const stream = c.captureStream(30),
          track = stream.getVideoTracks()[0];
        stats.tracks.push(track);
        const draw = () => {
          if (track.readyState === "ended") return;
          g.fillStyle = "#aaa";
          g.fillRect(0, 0, 640, 480);
          if (stats.desired === "hand") g.drawImage(img, 0, 0, 640, 480);
          if (stats.desired !== last) {
            last = stats.desired;
            stats.switches.push({ mode: last, time: performance.now() });
          }
          stats.sourceFrames.push(performance.now());
          setTimeout(draw, 33);
        };
        draw();
        return stream;
      };
    });
    for (delegate of ["CPU", "GPU"]) {
      const p = await ctx.newPage();
      await p.goto("http://127.0.0.1:" + server.address().port + "/#lab");
      await p.getByText("Enable camera", { exact: true }).click();
      const checks = {};
      try {
        await p.waitForFunction(
          () => probe.samples.length >= 2 || probe.error,
          null,
          { timeout: 20000 },
        );
        const error = await p.evaluate(() => probe.error);
        if (error) throw Error(error);
        for (let i = 0; i < 3; i++) {
          await p.evaluate(() => (probe.desired = "hand"));
          await p.waitForFunction(
            (count) =>
              probe.gestures.filter((g) => g.gesture === "Open").length >=
              count,
            i + 1,
            { timeout: 12000 },
          );
          await p.waitForTimeout(500);
          await p.evaluate(() => (probe.desired = "blank"));
          await p.waitForFunction(
            () => document.querySelector("output").value === "Show one hand",
          );
        }
        await p.getByText("Switch camera", { exact: true }).click();
        await p.waitForFunction(() => probe.ready.length === 2);
        const stop = p.getByText("Stop camera", { exact: true });
        try {
          await stop.click({ timeout: 500 });
          checks.stopPointer = true;
        } catch {
          checks.stopPointer = false;
          if (candidateCSS) {
            await p.addStyleTag({ path: candidateCSS });
            await stop.click({ timeout: 1500 });
            checks.candidateStopPointer = true;
          } else {
            await stop.focus();
            await stop.press("Enter");
          }
        }
        checks.tracksEnded = await p.evaluate(
          () =>
            probe.tracks.length === 2 &&
            probe.tracks.every((t) => t.readyState === "ended"),
        );
        checks.workersTerminated = await p.evaluate(
          () => probe.terminations === 2,
        );
        await p.evaluate(() => (probe.deny = true));
        await p.getByText("Enable camera", { exact: true }).click();
        await p.waitForFunction(() =>
          document.querySelector("#message").textContent.includes("denied"),
        );
        checks.permissionFallback = true;
      } catch (e) {
        checks.error = String(e);
      }
      report.runs[delegate] = await p.evaluate(
        (checks) => ({
          checks,
          samples: probe.samples,
          gestures: probe.gestures,
          sourceFrames: probe.sourceFrames,
          switches: probe.switches,
          initMs: probe.ready,
          terminated: probe.terminations,
          error: probe.error,
        }),
        checks,
      );
      console.log(delegate, report.runs[delegate].samples.length, checks);
      await p.close();
    }
  } finally {
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
    await browser.close();
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
