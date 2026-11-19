import * as T from "three";
import { StereoEffect } from "three/examples/jsm/effects/StereoEffect.js";
import { atlas, places, type Place } from "./catalog";
import { makeEnvironment, dispose } from "./environment";
import { forms, gestures, sculpture } from "./particles";
import { Input } from "./input";
import { Tracking } from "./tracking";
import "./style.css";
const $ = <E extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<E>(s)!;
function boot() {
  const canvas = $<HTMLCanvasElement>("#world"),
    renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local-floor");
  const camera = new T.PerspectiveCamera(64, 1, 0.06, 550),
    rig = new T.Group();
  rig.add(camera);
  camera.position.y = 1.7;
  const stereo = new StereoEffect(renderer);
  const ray = new T.Raycaster();
  const panel = $<HTMLDialogElement>("#panel"),
    content = $("#contents");
  let id: Place = "hub",
    env: ReturnType<typeof makeEnvironment>,
    art: ReturnType<typeof sculpture> | undefined,
    split = false,
    xr = false,
    quality = "Auto",
    low = matchMedia("(pointer:coarse)").matches,
    avg = 0.018,
    elapsed = 0,
    samples = 0,
    notifyTimer = 0,
    formIndex = 0;
  const note = (msg: string) => {
    clearTimeout(notifyTimer);
    $("#message").textContent = msg;
    notifyTimer = window.setTimeout(
      () => ($("#message").textContent = ""),
      4500,
    );
  };
  const tracking = new Tracking(
    (g) => art?.gesture(g),
    (x, y) => art?.pointer(x, y),
    note,
  );
  function nav(key: Place) {
    if (location.hash === "#" + key) {
      openWorld(key);
      return;
    }
    location.hash = key;
  }
  const pick = () => {
    const hit = ray.intersectObjects(env.gates)[0];
    if (hit) nav(hit.object.userData.place);
  };
  function screenRay(x: number, y: number) {
    ray.setFromCamera(
      new T.Vector2((x / innerWidth) * 2 - 1, 1 - (y / innerHeight) * 2),
      camera,
    );
  }
  const input = new Input(
    camera,
    rig,
    canvas,
    note,
    (x, y) => {
      screenRay(x, y);
      pick();
    },
    (x, y) => {
      if (!art) return;
      screenRay(x, y);
      const normal = camera.getWorldDirection(new T.Vector3()),
        pt = new T.Vector3();
      if (
        ray.ray.intersectPlane(
          new T.Plane().setFromNormalAndCoplanarPoint(normal, art.obj.position),
          pt,
        )
      ) {
        art.obj.worldToLocal(pt);
        art.pointer(pt.x, pt.y);
      }
    },
  );
  const controller = renderer.xr.getController(0);
  rig.add(controller);
  controller.addEventListener("select", () => {
    ray.setFromXRController(controller);
    if (id === "hub") {
      pick();
    } else if (art) {
      if (id === "lab") art.gesture("Swipe");
      else art.form(forms[++formIndex % forms.length]);
    } else nav("hub");
  });
  controller.addEventListener("squeeze", () => nav("hub"));
  function xrMove(dt: number) {
    const session = renderer.xr.getSession();
    if (!session) return;
    for (const source of session.inputSources) {
      const axes = source.gamepad?.axes;
      if (!axes || axes.length < 2) continue;
      const x = axes[axes.length - 2],
        z = axes[axes.length - 1];
      if (Math.hypot(x, z) < 0.18) continue;
      const dir = renderer.xr.getCamera().getWorldDirection(new T.Vector3());
      dir.y = 0;
      dir.normalize();
      const side = new T.Vector3(-dir.z, 0, dir.x);
      rig.position
        .addScaledVector(dir, -z * dt * 2.5)
        .addScaledVector(side, x * dt * 2.5);
      break;
    }
  }
  const line = new T.Line(
    new T.BufferGeometry().setFromPoints([
      new T.Vector3(),
      new T.Vector3(0, 0, -7),
    ]),
    new T.LineBasicMaterial({ color: 0x9ae1da }),
  );
  controller.add(line);
  function button(
    label: string,
    fn: () => void,
    parent: HTMLElement,
    cls = "",
  ) {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = cls;
    b.onclick = fn;
    parent.append(b);
    return b;
  }
  function modal(title: string) {
    input.clear();
    content.replaceChildren();
    const h = document.createElement("h2");
    h.textContent = title;
    content.append(h);
    if (!panel.open) panel.showModal();
  }
  function directory() {
    modal("World atlas");
    places.forEach((p) => {
      const b = button(
        atlas[p][0],
        () => {
          panel.close();
          nav(p);
        },
        content,
        "row",
      );
      const em = document.createElement("em");
      em.textContent = p === id ? "Here" : p === "hub" ? "Hub" : "Enter ↗";
      b.append(em);
    });
  }
  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    if (!renderer.xr.isPresenting) {
      renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1 : 1.7));
      stereo.setSize(innerWidth, innerHeight);
    }
    art?.quality(low);
  }
  function toggleSplit() {
    tracking.stop();
    split = !split;
    document.body.classList.toggle("stereo", split);
    $("#settings").textContent = split ? "Exit split view" : "View & controls";
    panel.close();
    if (split) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      note("Split view · use motion or drag to look");
    } else if (document.fullscreenElement)
      document.exitFullscreen().catch(() => {});
    renderer.setViewport(0, 0, innerWidth, innerHeight);
    resize();
  }
  async function enterXR() {
    try {
      if (!xr || !navigator.xr) return;
      const session = await navigator.xr.requestSession("immersive-vr", {
        requiredFeatures: ["local-floor"],
      });
      panel.close();
      tracking.stop();
      try {
        await renderer.xr.setSession(session);
      } catch (error) {
        await session.end().catch(() => {});
        throw error;
      }
    } catch {
      note("Headset session unavailable. Phone split view is available.");
    }
  }
  function settings() {
    if (split) {
      toggleSplit();
      return;
    }
    modal("View & controls");
    const p = document.createElement("p");
    p.textContent =
      "WASD or ↑ ↓ to walk. Drag or use ← → to look. On touchscreens, move with the joystick and drag the scene to look.";
    content.append(p);
    button(
      input.motion ? "Disable motion view" : "Enable motion view",
      async () => {
        await input.toggleMotion();
        panel.close();
      },
      content,
      "row",
    );
    button("Phone VR · split view", toggleSplit, content, "row");
    const vr = button(
      xr ? "Enter headset VR" : "Headset VR unavailable",
      enterXR,
      content,
      "row",
    );
    vr.disabled = !xr;
    const label = document.createElement("label");
    label.textContent = "Render quality  ";
    const sel = document.createElement("select");
    for (const q of ["Auto", "High", "Low"])
      sel.add(new Option(q, q, false, q === quality));
    sel.onchange = () => {
      quality = sel.value;
      low = quality === "Low" || (quality === "Auto" && avg > 0.028);
      resize();
    };
    label.append(sel);
    content.append(label);
    button(
      "Recenter at entrance",
      () => {
        spawn();
        panel.close();
      },
      content,
      "row",
    );
  }
  function spawn() {
    rig.position.set(id === "valley" ? -8 : 0, 0, id === "hub" ? 9 : 7);
    input.reset();
    camera.position.set(0, 1.7, 0);
  }
  function openWorld(key: Place) {
    tracking.stop();
    if (env) {
      env.scene.remove(rig);
      dispose(env.scene);
    }
    id = key;
    env = makeEnvironment(key);
    art =
      key === "lab" || key === "sculpture"
        ? sculpture(env.scene, key === "lab" ? "Sphere" : "Silk")
        : undefined;
    env.scene.add(rig);
    spawn();
    formIndex = 0;
    const [title, tag, desc] = atlas[key];
    $("#title").textContent = title;
    $("#eyebrow").textContent = tag;
    $("#description").textContent = desc;
    document.title = title + " · My 3D World";
    const a = $("#actions");
    a.replaceChildren();
    if (key === "hub") button("Explore worlds ↗", directory, a, "primary");
    else if (key === "sculpture") {
      forms.forEach((name) => {
        const b = button(
          name,
          () => {
            art?.form(name);
            a.querySelectorAll("button").forEach((e) =>
              e.setAttribute("aria-pressed", String(e === b)),
            );
          },
          a,
        );
        b.setAttribute("aria-pressed", String(name === "Silk"));
      });
    } else if (key === "lab") {
      button("Enable camera", () => tracking.start(), a, "primary");
      button("Switch camera", () => tracking.start(true), a);
      button("Stop camera", () => tracking.stop(), a);
      for (const g of gestures) button(g, () => art?.gesture(g), a);
    } else button("Return to hub", () => nav("hub"), a);
    resize();
  }
  function route() {
    const p = location.hash.slice(1);
    openWorld(places.includes(p as Place) ? (p as Place) : "hub");
  }
  $("#directory").onclick = directory;
  $("#settings").onclick = settings;
  $("#close").onclick = () => panel.close();
  window.addEventListener("resize", resize);
  window.addEventListener("hashchange", route);
  window.addEventListener("pagehide", () => tracking.stop());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      tracking.stop();
      input.clear();
    }
  });
  navigator.xr
    ?.isSessionSupported("immersive-vr")
    .then((s) => (xr = s))
    .catch(() => {});
  renderer.xr.addEventListener("sessionend", () => {
    spawn();
    resize();
  });
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    tracking.stop();
    $("#loading").hidden = false;
    $("#loading").textContent =
      "Graphics context lost. Reload to reopen the gallery.";
  });
  route();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const delta = (now - last) / 1000;
    last = now;
    const dt = Math.max(0, Math.min(0.05, delta));
    if (!document.hidden && delta > 0 && delta < 0.2) {
      avg += 0.025 * (delta - avg);
      if (
        ++samples % 180 === 0 &&
        quality === "Auto" &&
        !renderer.xr.isPresenting
      ) {
        const next = avg > 0.028 ? true : avg < 0.019 ? false : low;
        if (next !== low) {
          low = next;
          resize();
        }
      }
    }
    if (!reducedMotion.matches) elapsed += dt;
    if (renderer.xr.isPresenting) xrMove(dt);
    if (!panel.open)
      input.update(dt, renderer.xr.isPresenting, env.height, env.limit);
    if (id === "hub" && !panel.open) {
      for (const gate of env.gates) {
        const center = gate.parent!.position;
        if (
          Math.hypot(center.x - rig.position.x, center.z - rig.position.z) <
          1.05
        ) {
          location.hash = gate.userData.place;
          break;
        }
      }
    }
    env.update(elapsed);
    art?.update(elapsed, dt);
    if (split && !renderer.xr.isPresenting) stereo.render(env.scene, camera);
    else renderer.render(env.scene, camera);
    $("#loading").hidden = true;
  });
}
try {
  boot();
} catch (error) {
  $("#loading").textContent =
    "The observatory needs WebGL 2. Enable graphics acceleration or try another browser.";
  console.error(error);
}
