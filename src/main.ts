import * as T from "three";
import { worlds, forms, gestures } from "./catalog";
import { buildWorld, floorAt } from "./world";
import { sculpture } from "./particles";
import { Input } from "./input";
import { Hands } from "./hands";
import "./style.css";
const el = <E extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as E;
const canvas = el<HTMLCanvasElement>("scene"),
  dialog = el<HTMLDialogElement>("menu"),
  list = el("list");
let statusTimer = 0;
function status(s: string) {
  clearTimeout(statusTimer);
  el("status").textContent = s;
  statusTimer = window.setTimeout(() => (el("status").textContent = ""), 5200);
}
function button(label: string, action: () => void, parent: HTMLElement) {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = action;
  parent.append(b);
  return b;
}
function boot() {
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local");
  const camera = new T.PerspectiveCamera(66, 1, 0.08, 520),
    rig = new T.Group();
  rig.add(camera);
  let id = 0,
    world = buildWorld(0),
    art: ReturnType<typeof sculpture> | undefined;
  let time = 0,
    prior = 0,
    stereo = false,
    back = false,
    current = 0,
    cap = 1.65,
    slow = 0,
    fast = 0,
    auto = true;
  let xrAvailable = false,
    session: XRSession | undefined,
    changedFullscreen = false;
  const stereoCam = new T.StereoCamera(),
    ray = new T.Raycaster();
  stereoCam.aspect = 0.5;
  const pointing = new T.Vector2(),
    impact = new T.Vector3(),
    plane = new T.Plane();
  function aim(x: number, y: number) {
    if (!art) return;
    if (x < 0) {
      art.aim(20, 20);
      return;
    }
    pointing.set(x * 2 - 1, 1 - y * 2);
    ray.setFromCamera(pointing, camera);
    plane.setFromNormalAndCoplanarPoint(
      camera.getWorldDirection(impact),
      art.points.position,
    );
    if (ray.ray.intersectPlane(plane, impact)) {
      art.points.worldToLocal(impact);
      art.aim(impact.x, impact.y);
    }
  }
  const input = new Input(
    canvas,
    el("joystick"),
    (x, y) => {
      if (stereo) return;
      ray.setFromCamera(
        new T.Vector2((2 * x) / innerWidth - 1, 1 - (2 * y) / innerHeight),
        camera,
      );
      pick();
    },
    aim,
  );
  const gestureModes = [4, 6, 7, 2, 8, 9];
  function choose(index: number) {
    current = index;
    art?.select(id === 5 ? gestureModes[index] : index, time);
    el("tools")
      .querySelectorAll("[data-mode]")
      .forEach((b, i) => b.setAttribute("aria-pressed", String(i === index)));
  }
  const hands = new Hands(
    document.querySelector("video")!,
    document.querySelector("#camera canvas")!,
    (s) => {
      status(s);
      updateCameraButton();
    },
    (g, x, y) => {
      aim(x, y);
      if (g !== -1) choose(g);
    },
  );
  function updateCameraButton() {
    const b = document.querySelector("#startcam");
    if (b) b.textContent = hands.active ? "Stop camera" : "Enable camera";
  }
  function setWorld(next: number, initial = false) {
    hands.stop();
    el("status").textContent = "";
    if (!initial) {
      world.scene.remove(rig);
      world.dispose();
      world = buildWorld(next);
    }
    id = next;
    world.scene.add(rig);
    rig.position.set(0, floorAt(id, 0, 9) + (session ? 1.55 : 1.72), 9);
    camera.position.set(0, 0, 0);
    input.recenter();
    const w = worlds[id];
    document.documentElement.style.setProperty("--accent", w.accent);
    el("kind").textContent = w.kind;
    el("name").textContent = w.name;
    el("note").textContent = w.note;
    el("home").hidden = id === 0;
    const panel = el("tools");
    panel.replaceChildren();
    art = id >= 4 ? sculpture(id === 5) : undefined;
    if (art) {
      world.scene.add(art.points);
      (id === 4 ? forms : gestures).forEach((s, i) => {
        button(s, () => choose(i), panel).dataset.mode = String(i);
      });
      choose(0);
      if (id === 5) {
        button(
          "Enable camera",
          () => {
            if (hands.active) hands.stop();
            else void hands.start(back);
            updateCameraButton();
          },
          panel,
        ).id = "startcam";
        button(
          "Switch camera",
          () => {
            back = !back;
            void hands.start(back);
            updateCameraButton();
          },
          panel,
        );
      }
    }
    quality();
    document.title = w.name + " · My 3D World";
  }
  function pick() {
    const hit = ray.intersectObjects(world.gates, false)[0];
    if (hit) {
      setWorld(hit.object.userData.destination);
      return true;
    }
    return false;
  }
  const controller = renderer.xr.getController(0);
  rig.add(controller);
  const beam = new T.Line(
    new T.BufferGeometry().setFromPoints([
      new T.Vector3(),
      new T.Vector3(0, 0, -10),
    ]),
    new T.LineBasicMaterial({
      color: 0xcbb5ec,
      transparent: true,
      opacity: 0.45,
    }),
  );
  controller.add(beam);
  controller.addEventListener("select", () => {
    ray.setFromXRController(controller);
    if (!pick() && art) choose((current + 1) % 6);
  });
  function resize() {
    if (renderer.xr.isPresenting) return;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
  }
  function quality() {
    if (!renderer.xr.isPresenting)
      renderer.setPixelRatio(Math.min(devicePixelRatio, cap));
    art?.count(cap < 1.1 ? 5500 : 10000);
    resize();
  }
  function show(title: string) {
    list.replaceChildren();
    dialog.querySelector("h2")!.textContent = title;
    if (!dialog.open) dialog.showModal();
  }
  el("index").onclick = () => {
    show("World index");
    worlds.forEach((w, i) => {
      const b = button(
        w.name,
        () => {
          dialog.close();
          setWorld(i);
        },
        list,
      );
      b.setAttribute("aria-current", String(i === id));
      const small = document.createElement("small");
      small.textContent = w.kind;
      b.append(small);
    });
  };
  el("close").onclick = () => dialog.close();
  dialog.onclick = (e) => {
    if (e.target === dialog) dialog.close();
  };
  el("home").onclick = () => setWorld(0);
  async function stereoToggle() {
    stereo = !stereo;
    document.body.classList.toggle("stereo", stereo);
    el("leave").hidden = !stereo;
    try {
      if (
        stereo &&
        !document.fullscreenElement &&
        document.documentElement.requestFullscreen
      ) {
        await document.documentElement.requestFullscreen();
        changedFullscreen = true;
      } else if (!stereo && changedFullscreen && document.fullscreenElement)
        await document.exitFullscreen();
    } catch {
      status("Split view is available in the current window.");
    }
    if (!stereo) changedFullscreen = false;
    resize();
  }
  document.addEventListener("fullscreenchange", () => {
    if (stereo && changedFullscreen && !document.fullscreenElement)
      void stereoToggle();
  });
  el("leave").onclick = () => void stereoToggle();
  navigator.xr
    ?.isSessionSupported("immersive-vr")
    .then((v) => (xrAvailable = v))
    .catch(() => {});
  async function enterXR() {
    try {
      const s = await navigator.xr!.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor"],
      });
      hands.stop();
      updateCameraButton();
      session = s;
      rig.position.y = floorAt(id, rig.position.x, rig.position.z) + 1.55;
      s.addEventListener(
        "end",
        () => {
          session = undefined;
          camera.position.set(0, 0, 0);
          input.recenter();
          quality();
        },
        { once: true },
      );
      try {
        await renderer.xr.setSession(s);
      } catch (e) {
        await s.end();
        throw e;
      }
    } catch {
      status("Headset session unavailable. Try phone stereo or standard view.");
    }
  }
  el("settings").onclick = () => {
    show("View controls");
    const p = document.createElement("p");
    p.textContent =
      "Walk with WASD or the touch joystick. Drag to look. Arrow keys turn and walk. Select a gate to enter.";
    list.append(p);
    button(
      "Recenter view",
      () => {
        input.recenter();
        dialog.close();
      },
      list,
    );
    button(
      input.motion ? "Turn motion off" : "Enable motion view",
      async () => {
        dialog.close();
        try {
          await input.toggleMotion();
          status(input.motion ? "Motion view enabled." : "Drag to look.");
        } catch (e) {
          status(String(e).replace("Error: ", ""));
        }
      },
      list,
    );
    button(
      "Phone stereo · split view",
      () => {
        dialog.close();
        void stereoToggle();
      },
      list,
    );
    const xr = button(
      xrAvailable ? "Enter headset VR" : "Headset VR unavailable",
      () => {
        dialog.close();
        void enterXR();
      },
      list,
    );
    xr.disabled = !xrAvailable;
    button(
      "Quality · " + (auto ? "Adaptive" : cap > 1 ? "High" : "Low"),
      eQuality,
      list,
    );
  };
  function eQuality() {
    if (auto) {
      auto = false;
      cap = 1;
    } else if (cap === 1) {
      cap = 1.65;
    } else {
      auto = true;
    }
    quality();
    dialog.close();
    status(
      auto
        ? "Adaptive quality enabled."
        : cap === 1
          ? "Low quality enabled."
          : "High quality enabled.",
    );
  }
  setWorld(0, true);
  addEventListener("resize", resize);
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    el("loading").hidden = false;
    el("loading").textContent =
      "Graphics interrupted. Reload to reopen the gallery.";
    hands.stop();
  });
  document.addEventListener("visibilitychange", () => {
    prior = 0;
    if (document.hidden) {
      hands.stop();
      updateCameraButton();
    }
  });
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let atmosphereTime = 0;
  renderer.setAnimationLoop((ms) => {
    const delta = prior ? Math.max(0, (ms - prior) / 1000) : 0;
    prior = ms;
    const dt = Math.min(0.06, delta);
    time += dt;
    atmosphereTime += dt * (reduce ? 0.18 : 1);
    if (session) {
      const pad = Array.from(session.inputSources).find(
        (source) => source.gamepad && source.gamepad.axes.length >= 2,
      )?.gamepad;
      if (pad) {
        const axes = pad.axes,
          side = axes[axes.length - 2],
          forward = axes[axes.length - 1];
        const gaze = renderer.xr.getCamera().getWorldDirection(new T.Vector3());
        gaze.y = 0;
        gaze.normalize();
        if (Math.abs(forward) > 0.15)
          rig.position.addScaledVector(gaze, -forward * dt * 2.4);
        if (Math.abs(side) > 0.15)
          rig.position.addScaledVector(
            new T.Vector3(-gaze.z, 0, gaze.x),
            side * dt * 2.4,
          );
        rig.position.x = T.MathUtils.clamp(rig.position.x, -20, 20);
        rig.position.z = T.MathUtils.clamp(
          rig.position.z,
          id === 1 ? -13 : -26,
          24,
        );
        rig.position.y = floorAt(id, rig.position.x, rig.position.z) + 1.55;
      }
    } else if (!dialog.open) {
      rig.position.add(input.update(camera, dt));
      rig.position.x = T.MathUtils.clamp(rig.position.x, -20, 20);
      rig.position.z = T.MathUtils.clamp(
        rig.position.z,
        id === 1 ? -13 : -26,
        24,
      );
      rig.position.y = floorAt(id, rig.position.x, rig.position.z) + 1.72;
    }
    world.update(atmosphereTime);
    art?.update(time, renderer.getPixelRatio());
    camera.updateMatrixWorld();
    if (auto && !session && delta > 0 && delta < 0.8) {
      slow = delta > 0.036 ? slow + 1 : Math.max(0, slow - 1);
      fast = delta < 0.02 ? fast + 1 : 0;
      if (slow > 40 && cap > 1) {
        cap = 1;
        slow = 0;
        quality();
      } else if (fast > 360 && cap === 1) {
        cap = 1.65;
        fast = 0;
        quality();
      }
    }
    if (stereo && !session) {
      stereoCam.update(camera);
      const w = innerWidth,
        h = innerHeight,
        half = Math.floor(w / 2);
      renderer.setScissorTest(true);
      for (const [x, width, eye] of [
        [0, half, stereoCam.cameraL],
        [half, w - half, stereoCam.cameraR],
      ] as const) {
        renderer.setScissor(x, 0, width, h);
        renderer.setViewport(x, 0, width, h);
        renderer.render(world.scene, eye);
      }
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
    } else renderer.render(world.scene, camera);
    el("loading").hidden = true;
  });
}
try {
  boot();
} catch (e) {
  el("loading").textContent =
    "The gallery needs WebGL2. Enable hardware acceleration or open it in a WebGL2 browser.";
  console.error(e);
}
