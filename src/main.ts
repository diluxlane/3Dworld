import "./style.css";
import * as THREE from "three";
import { catalog, type WorldId } from "./catalog";
import { buildWorld } from "./worlds";
import { createInput } from "./input";
import { createParticles } from "./particles";
import { createHands } from "./hands";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("view"),
  dialog = $<HTMLDialogElement>("panel");
const forms = ["Silk", "Orbit", "Wave", "Knot", "Sphere", "Cube"];
const labForms = ["Sphere", "Scatter", "Vortex", "Wave", "Implode", "Burst"];
const ids = Object.keys(catalog) as WorldId[];
function button(label: string, action: () => void, style = "") {
  const el = document.createElement("button");
  el.textContent = label;
  el.className = style;
  el.onclick = action;
  return el;
}
let statusTimer = 0;
function status(message: string) {
  $("status").textContent = message;
  clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => ($("status").textContent = ""), 5200);
}
function boot() {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  const rig = new THREE.Group(),
    camera = new THREE.PerspectiveCamera(65, 1, 0.08, 2000);
  rig.add(camera);
  camera.position.y = 1.65;
  let active: WorldId = "hub",
    world: ReturnType<typeof buildWorld>,
    particles: ReturnType<typeof createParticles> | undefined;
  let selected = "Silk",
    quality = "Auto",
    ratio = 1.25,
    avg = 1 / 60,
    samples = 0,
    elapsed = 0,
    previous = 0;
  const cap = Math.min(devicePixelRatio || 1, 1.75);
  function resize() {
    if (renderer.xr.isPresenting) return;
    renderer.setPixelRatio(Math.min(cap, ratio));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);
  const input = createInput(
    renderer,
    camera,
    rig,
    $("joystick"),
    status,
    (ray) => {
      if (!world) return;
      const hit = ray.intersectObjects(world.portals, true)[0];
      for (
        let target: THREE.Object3D | null = hit?.object ?? null;
        target;
        target = target.parent
      ) {
        const dest = target.userData.destination as WorldId;
        if (dest && ids.includes(dest)) {
          travel(dest);
          return;
        }
      }
      if (particles && renderer.xr.isPresenting) {
        const choices = active === "lab" ? labForms : forms;
        setForm(choices[(choices.indexOf(selected) + 1) % choices.length]);
        particles.interact(0, 0);
      }
    },
  );
  const hands = createHands(
    $("hand-view"),
    (name, x, y, swipeX, swipeY) => {
      if (active === "lab") {
        setForm(name);
        particles?.interact(x, y, swipeX, swipeY);
      }
    },
    status,
  );
  function setForm(name: string) {
    if (!particles) return;
    particles.setForm(name);
    selected = name;
    for (const b of document.querySelectorAll<HTMLButtonElement>(
      "[data-form]",
    )) {
      const on = b.dataset.form === name;
      b.classList.toggle("selected", on);
      b.setAttribute("aria-pressed", String(on));
    }
  }
  function showPanel(title: string) {
    $("panel-title").textContent = title;
    const body = $("panel-body");
    body.replaceChildren();
    if (!dialog.open) dialog.showModal();
    return body;
  }
  function index() {
    const body = showPanel("World index");
    for (const id of ids) {
      const w = catalog[id],
        b = button(
          "",
          () => {
            dialog.close();
            travel(id);
          },
          "menu-row",
        );
      b.innerHTML =
        '<span class="sigil"></span><span><strong></strong><small></small></span><b></b>';
      b.style.setProperty("--ink", w.color);
      b.children[0].textContent = w.mark;
      b.querySelector("strong")!.textContent = w.title;
      b.querySelector("small")!.textContent = w.kind;
      b.querySelector("b")!.textContent = id === active ? "Here" : "";
      body.append(b);
    }
  }
  function settings() {
    const body = showPanel("View options");
    const option = (label: string, control: HTMLElement) => {
      const row = document.createElement("label");
      row.className = "option";
      row.append(label, control);
      body.append(row);
    };
    option(
      "Gyroscope",
      button("Toggle motion", () => {
        dialog.close();
        void input.gyro();
      }),
    );
    option(
      "Phone viewer",
      button("Side by side", () => {
        dialog.close();
        void input.stereo();
      }),
    );
    option(
      "VR headset",
      button("Enter immersive VR", () => {
        dialog.close();
        void input.xr();
      }),
    );
    const select = document.createElement("select");
    for (const s of ["Auto", "Low", "High"]) select.add(new Option(s, s));
    select.value = quality;
    select.onchange = () => {
      quality = select.value;
      ratio = quality === "Low" ? 0.75 : cap;
      resize();
    };
    option("Render quality", select);
    option(
      "Camera direction",
      button("Recenter", () => {
        dialog.close();
        input.reset();
        status("View centered.");
      }),
    );
  }
  function controls() {
    const body = showPanel("Controls");
    body.innerHTML =
      '<div class="help"><p><b>Desktop</b><br>Walk with WASD or arrow keys. Drag the sky to look around. Click a gateway to enter.</p><p><b>Phone</b><br>Walk with the joystick and drag elsewhere to look. Enable motion before entering a phone viewer.</p><p><b>Headset</b><br>Move with the left stick and snap-turn with the right. Aim and press the trigger at a portal. In an installation, trigger in open space to cycle forms.</p><p><b>Hand lab</b><br>Fist forms a sphere, open palm scatters, pointing creates a vortex, and a peace sign creates a wave. Pinch to grab or swipe to push.</p></div>';
  }
  function effects() {
    const body = showPanel("Particle effects");
    for (const name of labForms) {
      body.append(
        button(
          name,
          () => {
            setForm(name);
            particles?.interact(0, 0);
            dialog.close();
          },
          name === selected ? "selected" : "",
        ),
      );
    }
  }
  function disposeScene(scene: THREE.Scene) {
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>(),
      textures = new Set<THREE.Texture>();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) geometries.add(m.geometry);
      if (m.material)
        for (const mat of Array.isArray(m.material) ? m.material : [m.material])
          materials.add(mat);
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    for (const mat of materials) {
      for (const v of Object.values(mat))
        if (v instanceof THREE.Texture) textures.add(v);
      mat.dispose();
    }
    for (const g of geometries) g.dispose();
    for (const t of textures) t.dispose();
  }
  function travel(id: WorldId) {
    if (active === "lab") hands.stop();
    rig.removeFromParent();
    if (world) disposeScene(world.scene);
    active = id;
    world = buildWorld(id);
    world.scene.add(rig);
    input.reset();
    rig.position.set(
      world.spawn.x,
      world.ground(world.spawn.x, world.spawn.z),
      world.spawn.z,
    );
    const lab = id === "lab",
      room = lab || id === "sculpture";
    particles = room ? createParticles(world.scene, lab) : undefined;
    document.body.classList.toggle("room", room);
    document.body.classList.remove("moving");
    const w = catalog[id];
    $("kind").textContent = w.kind;
    $("title").textContent = w.title;
    $("summary").textContent = w.desc;
    $("location").textContent =
      id === "hub" ? "Observatory  /  Hub" : "World  /  " + w.kind;
    const actions = $("actions");
    actions.replaceChildren();
    if (id === "hub") {
      actions.append(
        button("Explore Edge of Earth", () => travel("earth"), "primary"),
        button("Browse worlds", index),
      );
    } else if (id === "sculpture") {
      forms.forEach((name) => {
        const b = button(name, () => setForm(name));
        b.dataset.form = name;
        actions.append(b);
      });
      setForm("Silk");
    } else if (lab) {
      selected = "Sphere";
      actions.append(
        button("Enable camera", () => void hands.start(), "primary"),
        button("Switch camera", () => void hands.switchCamera()),
        button("Stop camera", () => {
          hands.stop();
          status("Camera stopped.");
        }),
        button("Try effects", effects),
      );
    } else actions.append(button("Return to hub", () => travel("hub")));
    if (history.replaceState) history.replaceState(null, "", "#" + id);
  }
  canvas.onpointermove = (e) => {
    if (particles)
      particles.interact(
        (2 * e.clientX) / innerWidth - 1,
        1 - (2 * e.clientY) / innerHeight,
      );
  };
  canvas.onpointerdown = (e) => {
    if (particles)
      particles.interact(
        (2 * e.clientX) / innerWidth - 1,
        1 - (2 * e.clientY) / innerHeight,
      );
  };
  $("home").onclick = () => travel("hub");
  $("index-open").onclick = index;
  $("settings-open").onclick = settings;
  $("help-open").onclick = controls;
  $("close").onclick = () => dialog.close();
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        dialog.close();
    }
  });
  $("clear").onclick = () => {
    document.body.classList.add("clean");
    $("restore").hidden = false;
  };
  $("restore").onclick = () => {
    document.body.classList.remove("clean");
    $("restore").hidden = true;
  };
  $("stereo-exit").onclick = () => void input.stereo();
  const requested = location.hash.slice(1) as WorldId;
  travel(ids.includes(requested) ? requested : "hub");
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hands.stop();
    previous = 0;
  });
  window.addEventListener("pagehide", () => hands.stop());
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    hands.stop();
    $("loading").hidden = false;
    $("loading").textContent =
      "Graphics connection interrupted. Reload to reopen the world.";
  });
  renderer.setAnimationLoop((ms) => {
    const dt = previous ? Math.min(0.1, (ms - previous) / 1000) : 1 / 60;
    previous = ms;
    elapsed += dt;
    if (!dialog.open) input.update(dt, world.ground, world.radius);
    world.update(elapsed);
    particles?.update(elapsed);
    input.render(world.scene);
    $("loading").hidden = true;
    if (quality === "Auto" && !renderer.xr.isPresenting && dt > 0) {
      avg = avg * 0.96 + dt * 0.04;
      if (++samples >= 150) {
        samples = 0;
        const next =
          avg > 0.031
            ? Math.max(0.65, ratio - 0.2)
            : avg < 0.018
              ? Math.min(cap, ratio + 0.1)
              : ratio;
        if (next !== ratio) {
          ratio = next;
          resize();
        }
      }
    }
  });
}
if (
  !canvas.getContext("webgl2", {
    antialias: true,
    powerPreference: "high-performance",
  })
) {
  void import("./fallback").then(({ startPanoramas }) => startPanoramas());
} else {
  try {
    boot();
  } catch (error) {
    console.error(error);
    $("loading").textContent =
      "The 3D scene could not start. Reload to try again.";
  }
}
