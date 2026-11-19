import { catalog, type WorldId } from "./catalog";
import { paintPanorama } from "./panorama";

export function startPanoramas() {
  const $ = (id: string) => document.getElementById(id)!;
  const canvas = $("view") as HTMLCanvasElement,
    dialog = $("panel") as HTMLDialogElement;
  const ids = Object.keys(catalog) as WorldId[];
  let active: WorldId = "hub",
    yaw = 0,
    startX: number | null = null,
    scheduled = false;
  function paint() {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        paintPanorama(canvas, active, yaw);
      });
    }
  }
  function button(label: string, action: () => void, style = "") {
    const b = document.createElement("button");
    b.className = style;
    b.textContent = label;
    b.onclick = action;
    return b;
  }
  function menu(title: string) {
    $("panel-title").textContent = title;
    $("panel-body").replaceChildren();
    if (!dialog.open) dialog.showModal();
    return $("panel-body");
  }
  function index() {
    const body = menu("World index");
    for (const id of ids) {
      const w = catalog[id],
        b = button(
          "",
          () => {
            dialog.close();
            enter(id);
          },
          "menu-row",
        );
      const icon = document.createElement("span");
      icon.className = "sigil";
      icon.textContent = w.mark;
      b.style.setProperty("--ink", w.color);
      const text = document.createElement("span"),
        name = document.createElement("strong"),
        kind = document.createElement("small");
      name.textContent = w.title;
      kind.textContent = w.kind;
      text.append(name, kind);
      b.append(icon, text);
      body.append(b);
    }
  }
  function enter(id: WorldId) {
    active = id;
    yaw = 0;
    const w = catalog[id];
    $("title").textContent = w.title;
    $("kind").textContent = w.kind;
    $("summary").textContent = {
      hub: "A mountain observatory at the threshold of five worlds.",
      earth: "A rocky ledge above the blue curve of a planet at sunrise.",
      valley: "A river threads its way to a glowing gate deep in the canyon.",
      field: "A trail of lights winds among flowers beneath a violet sky.",
      sculpture: "A luminous filament sculpture suspended in a quiet rotunda.",
      lab: "An array of particles suspended in a cyan observation chamber.",
    }[id];
    $("location").textContent = "Panorama view  /  WebGL2 unavailable";
    $("actions").replaceChildren(
      id === "hub"
        ? button("View Edge of Earth", () => enter("earth"), "primary")
        : button("Return to hub", () => enter("hub"), "primary"),
      button("Browse worlds", index),
    );
    history.replaceState(null, "", "#" + id);
    paint();
    $("loading").hidden = true;
  }
  function options() {
    const body = menu("Panorama controls");
    const p = document.createElement("p");
    p.className = "help";
    p.textContent =
      "Drag horizontally or use the left and right arrow keys to pan. Select a world in the index. Walking, live particles, camera gestures and VR require a browser with WebGL2 graphics acceleration.";
    body.append(
      p,
      button("Center view", () => {
        yaw = 0;
        paint();
        dialog.close();
      }),
    );
  }
  $("index-open").onclick = index;
  $("home").onclick = () => enter("hub");
  $("settings-open").onclick = options;
  $("help-open").onclick = options;
  $("close").onclick = () => dialog.close();
  $("joystick").hidden = true;
  $("clear").onclick = () => {
    document.body.classList.add("clean");
    $("restore").hidden = false;
  };
  $("restore").onclick = () => {
    document.body.classList.remove("clean");
    $("restore").hidden = true;
  };
  canvas.setAttribute(
    "aria-label",
    "World panorama. Drag or press the arrow keys to pan.",
  );
  canvas.onpointerdown = (e) => {
    canvas.setPointerCapture(e.pointerId);
    startX = e.clientX;
  };
  canvas.onpointermove = (e) => {
    if (startX !== null) {
      yaw += (startX - e.clientX) * 0.004;
      startX = e.clientX;
      paint();
    }
  };
  canvas.onlostpointercapture = () => {
    startX = null;
  };
  window.addEventListener("keydown", (e) => {
    if (dialog.open) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      yaw += e.key === "ArrowRight" ? 0.12 : -0.12;
      paint();
    }
  });
  window.addEventListener("resize", paint);
  const id = location.hash.slice(1) as WorldId;
  enter(ids.includes(id) ? id : "hub");
}
