import * as T from "three";
import { StereoEffect } from "three/examples/jsm/effects/StereoEffect.js";
import {
  atlas,
  places,
  gallerySections,
  accessHints,
  type Place,
} from "./catalog";
import { makeEnvironment, dispose } from "./environment";
import { forms, gestures, sculpture } from "./particles";
import { Input } from "./input";
import { Tracking } from "./tracking";
import { QualityControl, type Quality, type Tier } from "./quality";
import type { DeviceCapture } from "./device-capture";
import "./style.css";
type World = Omit<ReturnType<typeof makeEnvironment>, "update"> & {
  update(time: number, viewer: T.Vector3): void;
  setQuality?(tier: Tier): void;
  resolveMove?(previous: T.Vector3, next: T.Vector3): void;
  disposeExtras?(): void;
};
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
    env: World,
    art: ReturnType<typeof sculpture> | undefined,
    split = false,
    xr = false,
    opening = false,
    transition = 0,
    contextLost = false,
    elapsed = 0,
    notifyTimer = 0,
    formIndex = 0;
  let capture: DeviceCapture | undefined;
  const profiling = new URLSearchParams(location.search).has("profile");
  let appliedTier: Tier | undefined;
  let pendingLoad: AbortController | undefined;
  const quality = new QualityControl(matchMedia("(pointer:coarse)").matches);
  const previous = new T.Vector3(),
    forward = new T.Vector3(),
    right = new T.Vector3();
  const mouse = new T.Vector2(),
    hitPoint = new T.Vector3(),
    hitNormal = new T.Vector3(),
    hitPlane = new T.Plane();
  const loading = $("#loading");
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
    if (!env || opening) return;
    const hit = ray.intersectObjects(env.gates)[0];
    if (hit) nav(hit.object.userData.place);
  };
  function screenRay(x: number, y: number) {
    ray.setFromCamera(
      mouse.set((x / innerWidth) * 2 - 1, 1 - (y / innerHeight) * 2),
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
      const normal = camera.getWorldDirection(hitNormal),
        pt = hitPoint;
      if (
        ray.ray.intersectPlane(
          hitPlane.setFromNormalAndCoplanarPoint(normal, art.obj.position),
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
    if (id === "hub" || id === "valley") {
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
      const dir = renderer.xr.getCamera().getWorldDirection(forward);
      dir.y = 0;
      dir.normalize();
      const side = right.set(-dir.z, 0, dir.x);
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
    for (const section of gallerySections) {
      const heading = document.createElement("h3");
      heading.textContent = section.title;
      content.append(heading);
      for (const p of section.entries) {
        const b = button(
          "",
          () => {
            panel.close();
            nav(p);
          },
          content,
          "row destination",
        );
        const img = document.createElement("img");
        img.src = import.meta.env.BASE_URL + "atlas/" + p + ".webp";
        img.alt = "";
        img.width = 72;
        img.height = 44;
        img.loading = "lazy";
        const copy = document.createElement("span");
        const title = document.createElement("strong");
        title.textContent = atlas[p][0];
        const detail = document.createElement("small");
        detail.textContent = accessHints[p];
        copy.append(title, detail);
        const action = document.createElement("em");
        action.textContent = p === id ? "Here" : "Enter";
        b.title = atlas[p][2];
        b.append(img, copy, action);
      }
    }
  }
  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    if (!renderer.xr.isPresenting) {
      renderer.setPixelRatio(
        Math.min(devicePixelRatio, quality.resolutionLimit),
      );
      stereo.setSize(innerWidth, innerHeight);
    }
    art?.quality(quality.tier === "Low");
  }
  function applyQuality() {
    if (appliedTier === quality.tier) {
      resize();
      return;
    }
    env?.setQuality?.(quality.tier);
    appliedTier = quality.tier;
    renderer.shadowMap.enabled = id === "valley" && quality.tier !== "Low";
    renderer.shadowMap.autoUpdate = true;
    renderer.shadowMap.needsUpdate = true;
    resize();
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
    if (profiling) {
      button(
        capture?.active ? "Finish device recording" : "Record 60 seconds",
        async () => {
          if (capture?.active) {
            capture.stop("Stopped by user");
            settings();
            return;
          }
          if (!capture) {
            const { DeviceCapture } = await import("./device-capture");
            capture = new DeviceCapture(renderer, () =>
              note("Recording finished. Export it from View & controls."),
            );
          }
          capture.begin(id);
          panel.close();
          note("Recording frame times for 60 seconds. Explore normally.");
        },
        content,
        "row",
      );
      if (capture?.available)
        button(
          "Download frame data",
          () => capture?.download(),
          content,
          "row",
        );
    }
    const label = document.createElement("label");
    label.textContent = "Render quality  ";
    const sel = document.createElement("select");
    for (const q of ["Auto", "Low", "Balanced", "High"])
      sel.add(new Option(q, q, false, q === quality.mode));
    sel.onchange = () => {
      quality.select(sel.value as Quality);
      applyQuality();
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
    rig.position.y = env.height(rig.position.x, rig.position.z);
    input.reset();
    camera.position.set(0, 1.7, 0);
  }
  function release(world: World) {
    world.scene.remove(rig);
    dispose(world.scene);
    world.disposeExtras?.();
  }
  async function openWorld(key: Place) {
    capture?.stop("Changed world");
    const request = ++transition;
    pendingLoad?.abort();
    const loadController = new AbortController();
    pendingLoad = loadController;
    opening = true;
    input.clear();
    tracking.stop();
    loading.hidden = false;
    const progress = document.createElement("span");
    progress.textContent = "Opening " + atlas[key][0] + "…";
    loading.replaceChildren(progress);
    if (key === "valley") button("Return to hub", () => nav("hub"), loading);
    let next: World;
    try {
      if (key === "valley") {
        const { makeValley } = await import("./valley");
        if (request !== transition) return;
        next = await makeValley(
          quality.tier,
          (label) => {
            if (request === transition) progress.textContent = label;
          },
          loadController.signal,
        );
      } else next = makeEnvironment(key);
    } catch (error) {
      if (request !== transition) return;
      console.error("Could not load world", error);
      opening = false;
      loading.replaceChildren(
        document.createTextNode("Could not load " + atlas[key][0] + "."),
      );
      button("Retry", () => openWorld(key), loading);
      button("Return to hub", () => nav("hub"), loading);
      return;
    }
    if (request !== transition || contextLost) {
      release(next);
      return;
    }
    pendingLoad = undefined;
    if (env) release(env);
    env = next;
    appliedTier = undefined;
    id = key;
    renderer.toneMapping =
      id === "valley" ? T.ACESFilmicToneMapping : T.NoToneMapping;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    quality.reset();
    opening = false;
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
    applyQuality();
    loading.hidden = true;
  }
  function route() {
    const p = location.hash.slice(1);
    openWorld(places.includes(p as Place) ? (p as Place) : "hub");
  }
  const guide = $<HTMLButtonElement>("#guide");
  guide.onclick = () => {
    const caption = $("#caption");
    caption.hidden = !caption.hidden;
    guide.textContent = caption.hidden ? "Show guide" : "Hide guide";
    guide.setAttribute("aria-expanded", String(!caption.hidden));
  };
  $("#directory").onclick = directory;
  $("#settings").onclick = settings;
  $("#close").onclick = () => panel.close();
  window.addEventListener("resize", resize);
  window.addEventListener("hashchange", route);
  window.addEventListener("pagehide", () => {
    tracking.stop();
    pendingLoad?.abort();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && pendingLoad?.signal.aborted) route();
  });
  document.addEventListener("visibilitychange", () => {
    quality.reset();
    if (document.hidden) {
      capture?.stop("Page hidden");
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
    capture?.stop("Graphics context lost");
    contextLost = true;
    pendingLoad?.abort();
    ++transition;
    renderer.setAnimationLoop(null);
    tracking.stop();
    $("#loading").hidden = false;
    $("#loading").textContent =
      "Graphics context lost. Reload to reopen the gallery.";
  });
  canvas.addEventListener("webglcontextrestored", () => location.reload());
  route();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const delta = (now - last) / 1000;
    last = now;
    const dt = Math.max(0, Math.min(0.05, delta));
    if (
      !env ||
      contextLost ||
      document.hidden ||
      (!loading.hidden && !renderer.xr.isPresenting)
    )
      return;
    if (!opening && !renderer.xr.isPresenting && quality.observe(delta))
      applyQuality();
    if (!reducedMotion.matches) elapsed += dt;
    previous.copy(rig.position);
    if (!opening && renderer.xr.isPresenting) xrMove(dt);
    if (!opening && !panel.open)
      input.update(dt, renderer.xr.isPresenting, env.height, env.limit);
    if (
      env.resolveMove &&
      (previous.x !== rig.position.x || previous.z !== rig.position.z)
    ) {
      env.resolveMove(previous, rig.position);
      rig.position.y = env.height(rig.position.x, rig.position.z);
    }
    if (id === "hub" && !opening && !panel.open) {
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
    env.update(elapsed, rig.position);
    art?.update(elapsed, dt);
    capture?.beforeFrame();
    if (split && !renderer.xr.isPresenting) stereo.render(env.scene, camera);
    else renderer.render(env.scene, camera);
    capture?.afterFrame(
      now,
      quality.tier,
      renderer.xr.isPresenting
        ? "WebXR"
        : split
          ? "Phone stereo"
          : "Single view",
    );
  });
}
try {
  boot();
} catch (error) {
  $("#loading").textContent =
    "The observatory needs WebGL 2. Enable graphics acceleration or try another browser.";
  console.error(error);
}
