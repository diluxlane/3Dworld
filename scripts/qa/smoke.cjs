// Runs against the ordinary production build. No renderer probe.
const { chromium } = require("playwright"),
  fs = require("node:fs"),
  assert = require("node:assert/strict");
const [url, log] = process.argv.slice(2);
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
    ],
  });
  const context = await browser.newContext({
      viewport: { width: 800, height: 600 },
      reducedMotion: "reduce",
    }),
    p = await context.newPage(),
    results = [],
    errors = [];
  let deliberatelyBroken = false;
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (!deliberatelyBroken && m.type() === "error") errors.push(m.text());
  });
  const ready = () =>
    p.waitForFunction(() => document.querySelector("#loading")?.hidden);
  await p.goto(url);
  await ready();
  await p.locator("#world").click({ position: { x: 400, y: 275 } });
  await p.waitForURL("**/#earth");
  await ready();
  results.push("Selected physical Earth gate in uninstrumented build.");
  for (const [id, title] of [
    ["valley", "Portal Valley"],
    ["field", "Starlight Field"],
    ["sculpture", "Particle Sculpture Room"],
    ["lab", "Hand Tracking Particle Lab"],
  ]) {
    await p.locator("#directory").click();
    await p.locator("dialog button").filter({ hasText: title }).first().click();
    await p.waitForURL("**/#" + id);
    await ready();
    if (id === "sculpture")
      for (const form of ["Silk", "Orbit", "Wave", "Knot", "Sphere", "Cube"]) {
        await p.getByRole("button", { name: form, exact: true }).click();
        assert.equal(
          await p
            .getByRole("button", { name: form, exact: true })
            .getAttribute("aria-pressed"),
          "true",
        );
      }
  }
  results.push(
    "Navigated four additional atlas destinations and selected all six sculpture forms.",
  );
  await p.goBack();
  await p.waitForURL("**/#sculpture");
  await ready();
  await p.locator("#settings").click();
  await p.getByRole("button", { name: /Phone VR.*split/ }).click();
  assert(await p.locator("body.stereo").count());
  await p.getByRole("button", { name: "Exit split view" }).click();
  await p.waitForFunction(() => !document.fullscreenElement);
  results.push(
    "Browser Back and split stereo enter/exit passed; actual headset unavailable.",
  );
  await p.evaluate(() => (location.hash = "lab"));
  await ready();
  await p.evaluate(() =>
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        throw Error("Camera permission denied");
      },
    }),
  );
  await p.getByRole("button", { name: "Enable camera" }).click();
  await p.waitForFunction(() =>
    document
      .querySelector("#message")
      .textContent.toLowerCase()
      .includes("denied"),
  );
  for (const g of ["Fist", "Open", "Point", "Peace", "Pinch", "Swipe"])
    await p.getByRole("button", { name: g, exact: true }).click();
  results.push(
    "Camera permission failure was visible; all manual lab commands remained available.",
  );
  deliberatelyBroken = true;
  await p.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === "webgl2" ? null : original.call(this, type, ...args);
    };
  });
  await p.reload();
  await p.waitForFunction(() =>
    document.querySelector("#loading").textContent.includes("WebGL 2"),
  );
  results.push("WebGL2-disabled device received graphics fallback.");
  fs.writeFileSync(log, JSON.stringify({ results, errors }, null, 2));
  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
