import * as T from "three";
export class Input {
  yaw = 0;
  pitch = 0.025;
  motion = false;
  stick = new T.Vector2();
  private keys = new Set<string>();
  private sensor?: T.Quaternion;
  private zero?: T.Quaternion;
  private pending?: () => void;
  private pointer = -1;
  private sx = 0;
  private sy = 0;
  constructor(
    canvas: HTMLCanvasElement,
    joy: HTMLElement,
    private tap: (x: number, y: number) => void,
    private aim: (x: number, y: number) => void,
  ) {
    window.addEventListener("keydown", (e) => {
      if (document.querySelector("dialog[open]")) return;
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowRight",
          "ArrowLeft",
          "KeyW",
          "KeyS",
          "KeyA",
          "KeyD",
        ].includes(e.code)
      ) {
        e.preventDefault();
        this.keys.add(e.code);
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.stick.set(0, 0);
      this.pointer = -1;
    });
    canvas.onpointerdown = (e) => {
      if (this.pointer !== -1) return;
      this.pointer = e.pointerId;
      this.sx = e.clientX;
      this.sy = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    canvas.onpointermove = (e) => {
      this.aim(e.clientX / innerWidth, e.clientY / innerHeight);
      if (e.pointerId !== this.pointer) return;
      this.yaw -= e.movementX * 0.004;
      this.pitch = T.MathUtils.clamp(
        this.pitch - e.movementY * 0.003,
        -1.35,
        1.35,
      );
    };
    canvas.onpointerup = (e) => {
      if (e.pointerId !== this.pointer) return;
      this.pointer = -1;
      if (Math.hypot(e.clientX - this.sx, e.clientY - this.sy) < 7)
        this.tap(e.clientX, e.clientY);
    };
    canvas.onpointercancel = () => (this.pointer = -1);
    const move = (e: PointerEvent) => {
      const r = joy.getBoundingClientRect();
      this.stick
        .set(
          (e.clientX - r.left - r.width / 2) / (r.width * 0.38),
          (e.clientY - r.top - r.height / 2) / (r.height * 0.38),
        )
        .clampLength(0, 1);
      joy.style.setProperty("--x", this.stick.x * 18 + "px");
      joy.style.setProperty("--y", this.stick.y * 18 + "px");
    };
    joy.onpointerdown = (e) => {
      joy.setPointerCapture(e.pointerId);
      move(e);
    };
    joy.onpointermove = (e) => {
      if (joy.hasPointerCapture(e.pointerId)) move(e);
    };
    joy.onlostpointercapture = () => {
      this.stick.set(0, 0);
      joy.style.setProperty("--x", "0px");
      joy.style.setProperty("--y", "0px");
    };
  }
  recenter() {
    this.yaw = 0;
    this.pitch = 0.025;
    this.zero = undefined;
  }
  private orient = (e: DeviceOrientationEvent) => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const rad = Math.PI / 180,
      angle =
        screen.orientation?.angle ??
        Number((window as Window & { orientation?: number }).orientation ?? 0);
    const q = new T.Quaternion().setFromEuler(
      new T.Euler(e.beta * rad, e.alpha * rad, -e.gamma * rad, "YXZ"),
    );
    q.multiply(
      new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2),
    ).multiply(
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), -angle * rad),
    );
    this.sensor = q;
    this.zero ??= q.clone().invert();
    this.pending?.();
  };
  async toggleMotion() {
    if (this.motion) {
      removeEventListener("deviceorientation", this.orient);
      this.motion = false;
      this.sensor = undefined;
      this.zero = undefined;
      return;
    }
    if (typeof DeviceOrientationEvent === "undefined")
      throw Error("Motion unavailable. Drag to look.");
    const api = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<string>;
    };
    if (api.requestPermission && (await api.requestPermission()) !== "granted")
      throw Error("Motion permission declined. Drag to look.");
    await new Promise<void>((resolve, reject) => {
      const handle = setTimeout(() => {
        removeEventListener("deviceorientation", this.orient);
        this.pending = undefined;
        reject(Error("No motion readings. Drag to look."));
      }, 1700);
      this.pending = () => {
        clearTimeout(handle);
        this.pending = undefined;
        this.motion = true;
        resolve();
      };
      addEventListener("deviceorientation", this.orient);
    });
  }
  update(camera: T.PerspectiveCamera, dt: number) {
    this.yaw +=
      (+this.keys.has("ArrowLeft") - +this.keys.has("ArrowRight")) * dt * 1.5;
    camera.quaternion.setFromEuler(new T.Euler(this.pitch, this.yaw, 0, "YXZ"));
    if (this.motion && this.zero && this.sensor)
      camera.quaternion.multiply(this.zero).multiply(this.sensor);
    const side = this.stick.x + +this.keys.has("KeyD") - +this.keys.has("KeyA");
    const forward =
      this.stick.y +
      (+this.keys.has("KeyS") || +this.keys.has("ArrowDown")) -
      (+this.keys.has("KeyW") || +this.keys.has("ArrowUp"));
    const dir = camera.getWorldDirection(new T.Vector3());
    dir.y = 0;
    dir.normalize();
    return new T.Vector3(-dir.z, 0, dir.x)
      .multiplyScalar(side)
      .addScaledVector(dir, -forward)
      .clampLength(0, 1)
      .multiplyScalar(dt * 4.2);
  }
}
