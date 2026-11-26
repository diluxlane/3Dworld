// Run against the local build produced by build-probe.mjs. No probe is deployed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");
const [url, output] = process.argv.slice(2);
if (!url || !output)
  throw Error("Usage: node functional.cjs PROBE_URL RESULT.json");

(async () => {
  const report = {
    browser: "",
    target: "local probe build",
    checks: [],
    errors: [],
  };
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_BIN || "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        "--single-process",
        "--no-zygote",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    });
    report.browser = browser.version();
    const context = await browser.newContext({
      viewport: { width: 540, height: 380 },
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => {
      window.__xrSample = (sample) => {
        window.model = sample;
        window.rendered = (window.rendered || 0) + 1;
      };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    page.on("pageerror", (error) => report.errors.push(error.message));
    page.on("console", (msg) => {
      if (
        msg.type() === "error" &&
        /Shader Error|VALIDATE_STATUS|program not valid/i.test(msg.text())
      )
        report.errors.push(msg.text());
    });
    const check = (name, measured = {}) => {
      report.checks.push({ name, measured });
      console.log(name, JSON.stringify(measured));
    };
    const ready = (id) =>
      page.waitForFunction(
        (id) =>
          window.model?.id === id && document.querySelector("#loading").hidden,
        id,
      );
    async function navigate(id) {
      await page.evaluate((id) => {
        location.hash = id;
      }, id);
      await ready(id);
    }
    async function frames(n) {
      const target = await page.evaluate((n) => window.rendered + n, n);
      await page.waitForFunction((target) => window.rendered >= target, target);
    }
    const diag = () =>
      page.evaluate(() => {
        const { rig, camera, env, renderer } = window.model;
        return {
          x: rig.position.x,
          y: rig.position.y,
          z: rig.position.z,
          yaw: camera.rotation.y,
          offset: rig.position.y - env.height(rig.position.x, rig.position.z),
          textures: renderer.info.memory.textures,
          geometries: renderer.info.memory.geometries,
        };
      });
    await page.goto(url + "/#hub");
    await ready("hub");
    const hubResources = await page.evaluate(
      () =>
        performance
          .getEntriesByType("resource")
          .filter((e) => new URL(e.name).pathname.includes("/valley/")).length,
    );
    assert.equal(hubResources, 0);
    check("Hub loads without valley assets", { hubResources });
    await page.locator("#directory").focus();
    await page.keyboard.press("Enter");
    const row = page
      .locator("dialog button")
      .filter({ hasText: "Portal Valley" });
    await row.focus();
    await page.keyboard.press("Enter");
    await ready("valley");
    const before = await diag();
    await page.keyboard.down("w");
    try {
      await page.waitForFunction(
        (z) => window.model.rig.position.z < z - 0.18,
        before.z,
      );
    } finally {
      await page.keyboard.up("w");
    }
    const after = await diag();
    assert(Math.abs(after.offset) < 0.001);
    check("Keyboard atlas entry, forward movement and ground following", {
      distance: before.z - after.z,
      groundError: after.offset,
    });
    await page.mouse.move(320, 140);
    await page.mouse.down();
    await page.mouse.move(346, 146, { steps: 3 });
    await page.mouse.up();
    await frames(1);
    assert(Math.abs((await diag()).yaw - after.yaw) > 0.03);
    await page.locator("#settings").click();
    for (const quality of ["High", "Balanced", "Low", "Auto", "Low"])
      await page.locator("dialog select").selectOption(quality);
    await page.getByRole("button", { name: "Recenter at entrance" }).click();
    await frames(2);
    const reset = await diag();
    assert.equal(reset.x, -8);
    assert.equal(reset.z, 7);
    check("Drag look, four quality choices and recenter");
    // Each attempted step is smaller than the input loop's maximum displacement.
    // Aim directly into a known stone pier and a visible boulder group from the art layout.
    const tests = await page.evaluate(() => {
      const { env, rig } = window.model;
      const gate = env.gates[0].parent.position;
      return [
        { object: "stone pier", x: gate.x - 1.88, z: gate.z, min: 0.6 },
        { object: "western boulder", x: -11, z: 1.5, min: 0.9 },
      ].map((subject) => {
        const p = rig.position.clone().set(subject.x, 0, subject.z + 1.7),
          last = p.clone();
        let minDistance = Infinity,
          maxGroundError = 0;
        for (let i = 0; i < 30; i++) {
          last.copy(p);
          p.z -= 0.09;
          env.resolveMove(last, p);
          minDistance = Math.min(
            minDistance,
            Math.hypot(p.x - subject.x, p.z - subject.z),
          );
          maxGroundError = Math.max(
            maxGroundError,
            Math.abs(p.y - env.height(p.x, p.z)),
          );
        }
        return { ...subject, minDistance, maxGroundError };
      });
    });
    for (const t of tests) {
      assert(t.minDistance >= t.min, t.object + " penetration");
      assert(t.maxGroundError < 0.001);
    }
    check("Production collision function blocks masonry and boulder", {
      tests,
    });
    // Compute the actual arch's projected screen coordinate, then invoke an ordinary pointer event.
    const pixel = await page.evaluate(() => {
      const { env, camera } = window.model;
      const gate = env.gates[0];
      const p = gate.position.clone().set(0, 1.45, 0);
      gate.localToWorld(p).project(camera);
      return {
        x: ((p.x + 1) * innerWidth) / 2,
        y: ((1 - p.y) * innerHeight) / 2,
      };
    });
    await page.mouse.click(pixel.x, pixel.y);
    await ready("earth");
    await page.goBack();
    await ready("valley");
    check("Arch mesh click opens Earth and browser Back restores valley", {
      pixel,
    });
    await navigate("hub");
    const settled = [];
    for (let i = 0; i < 3; i++) {
      await navigate("valley");
      await navigate("lab");
      await navigate("hub");
      await frames(2);
      const r = await diag();
      settled.push([r.textures, r.geometries]);
    }
    assert.deepEqual(settled[2], settled[1]);
    check("Three valley/lab/hub cycles settle renderer resource counts", {
      settled,
    });
    let releaseDownload;
    const hold = new Promise((r) => (releaseDownload = r));
    let stalled = false;
    const stall = async (route) => {
      stalled = true;
      await hold;
      await route.continue();
    };
    await page.route("**/valley/**", stall);
    await page.evaluate(() => (location.hash = "valley"));
    for (let i = 0; !stalled && i < 200; i++) await page.waitForTimeout(50);
    assert(stalled);
    await navigate("field");
    releaseDownload();
    await page.waitForLoadState("networkidle");
    await page.unrouteAll({behavior: "wait"});
    await frames(4);
    assert.equal(await page.evaluate(() => window.model.id), "field");
    check("Delayed valley requests cannot replace a newer route");
    await page.route("**/valley/**", (route) => route.abort());
    await page.evaluate(() => (location.hash = "valley"));
    await page.getByRole("button", { name: "Retry" }).waitFor();
    await page.unroute("**/valley/**");
    await page.getByRole("button", { name: "Retry" }).click();
    await ready("valley");
    check("Failed valley downloads show recoverable error and replay succeeds");
    await page.locator("#settings").click();
    await page.getByRole("button", { name: /Phone VR.*split/ }).click();
    await page.waitForFunction(() =>
      document.body.classList.contains("stereo"),
    );
    await frames(2);
    await page.getByRole("button", { name: "Exit split view" }).click();
    await page.waitForFunction(
      () =>
        !document.fullscreenElement &&
        !document.body.classList.contains("stereo"),
    );
    check("Two-eye phone renderer enters and restores normal view");
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    });
    async function mobile(width, height) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: true,
      });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await mobile(390, 844);
    const stick = await page.locator("#stick").boundingBox();
    assert(stick);
    const finger = {
      x: Math.round(stick.x + stick.width / 2),
      y: Math.round(stick.y + stick.height / 2 - 23),
      id: 0,
    };
    const start = await diag();
    const touch = (type, points) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    await touch("touchStart", [finger]);
    await touch("touchStart", [finger, { x: 290, y: 200, id: 1 }]);
    await touch("touchMove", [finger, { x: 338, y: 204, id: 1 }]);
    await page.waitForFunction((initial) => {
      const m = window.model;
      return (
        Math.abs(m.camera.rotation.y - initial.yaw) > 0.05 &&
        Math.hypot(m.rig.position.x - initial.x, m.rig.position.z - initial.z) >
          0.1
      );
    }, start);
    await touch("touchEnd", []);
    await mobile(844, 390);
    check(
      "Portrait two-finger joystick and look operate together; landscape fits",
    );
    await page.locator("#settings").click();
    await page.getByRole("button", { name: "Enable motion view" }).click();
    await page.waitForFunction(() =>
      /unavailable|no motion/i.test(
        document.querySelector("#message").textContent,
      ),
    );
    check("Missing orientation data returns to touch look");
    const canInjectSensor = await page.evaluate(() => {
      if (!window.DeviceOrientationEvent) return false;
      Object.defineProperty(DeviceOrientationEvent, "requestPermission", {
        configurable: true,
        value: async () => "granted",
      });
      return true;
    });
    if (canInjectSensor) {
      await page.locator("#settings").click();
      await page.getByRole("button", { name: "Enable motion view" }).click();
      const sendOrientation = (alpha) =>
        page.evaluate(
          (a) =>
            window.dispatchEvent(
              new DeviceOrientationEvent("deviceorientation", {
                alpha: a,
                beta: 90,
                gamma: 0,
              }),
            ),
          alpha,
        );
      await sendOrientation(20);
      await frames(2);
      const firstHeading = await page.evaluate(() =>
        window.model.camera.quaternion.toArray(),
      );
      await sendOrientation(70);
      await frames(2);
      const nextHeading = await page.evaluate(() =>
        window.model.camera.quaternion.toArray(),
      );
      const dot = Math.abs(
        firstHeading.reduce((sum, n, i) => sum + n * nextHeading[i], 0),
      );
      assert(dot < 0.96);
      await page.locator("#settings").click();
      await page.getByRole("button", { name: "Recenter at entrance" }).click();
      await frames(2);
      const centered = await page.evaluate(() =>
        window.model.camera.quaternion.toArray(),
      );
      const dotAfter = Math.abs(
        firstHeading.reduce((sum, n, i) => sum + n * centered[i], 0),
      );
      assert(dotAfter > 0.999);
      check("Synthetic orientation changes view and recenter resets heading", {
        rotationDegrees: (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI,
        recenterDot: dotAfter,
      });
    }
    const xr = await page.evaluate(async () => ({
      api: !!navigator.xr,
      immersive:
        (await navigator.xr?.isSessionSupported("immersive-vr")) ?? false,
    }));
    check("Browser immersive-session capability observed", xr);
    const lost = await page.evaluate(() => {
      const e = window.model.renderer
        .getContext()
        .getExtension("WEBGL_lose_context");
      if (!e) return false;
      e.loseContext();
      setTimeout(() => e.restoreContext(), 1200);
      return true;
    });
    if (lost) {
      await page
        .getByText("Graphics context lost.", { exact: false })
        .waitFor();
      await page.waitForEvent("domcontentloaded");
      await ready("valley");
      check("Lost WebGL context surfaces error, restores and reloads route");
    } else check("Context-loss extension unavailable");
    assert.equal(report.errors.length, 0);
    report.passed = true;
  } catch (error) {
    report.passed = false;
    report.failure = String(error);
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
    await browser?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
