import * as T from "three";
export class Input {
  private keys = new Set<string>();
  private joy = new T.Vector2();
  private yaw = 0;
  private pitch = 0;
  private drag?: { id: number; x: number; y: number; travel: number };
  private sensor?: T.Quaternion;
  private active = false;
  private sensorSeen = false;
  private sensorTimer = 0;
  constructor(
    private camera: T.PerspectiveCamera,
    private rig: T.Group,
    canvas: HTMLCanvasElement,
    private note: (s: string) => void,
    tap: (x: number, y: number) => void,
    hover: (x: number, y: number) => void,
  ) {
    const panel = document.querySelector("dialog")!;
    window.addEventListener("keydown", (e) => {
      if (panel.open || e.ctrlKey || e.metaKey || e.altKey) return;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.code))
        e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.clear());
    canvas.onpointerdown = (e) => {
      if (this.drag) return;
      canvas.setPointerCapture(e.pointerId);
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, travel: 0 };
    };
    canvas.onpointermove = (e) => {
      hover(e.clientX, e.clientY);
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x,
        dy = e.clientY - d.y;
      d.travel += Math.abs(dx) + Math.abs(dy);
      d.x = e.clientX;
      d.y = e.clientY;
      this.yaw -= dx * 0.004;
      this.pitch = T.MathUtils.clamp(this.pitch - dy * 0.003, -1.38, 1.38);
    };
    canvas.onpointerup = (e) => {
      if (this.drag?.id === e.pointerId) {
        if (this.drag.travel < 7) tap(e.clientX, e.clientY);
        this.drag = undefined;
      }
    };
    canvas.onpointercancel = () => (this.drag = undefined);
    const stick = document.querySelector<HTMLElement>("#stick")!,
      knob = stick.querySelector("i")!;
    let joystickId = -1;
    const move = (e: PointerEvent) => {
      const box = stick.getBoundingClientRect();
      this.joy
        .set(
          (e.clientX - box.left - box.width / 2) / 30,
          (e.clientY - box.top - box.height / 2) / 30,
        )
        .clampLength(0, 1);
      knob.style.transform =
        "translate(" + this.joy.x * 20 + "px," + this.joy.y * 20 + "px)";
    };
    stick.onpointerdown = (e) => {
      joystickId = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      move(e);
    };
    stick.onpointermove = (e) => {
      if (e.pointerId === joystickId) move(e);
    };
    stick.onlostpointercapture = () => {
      joystickId = -1;
      this.joy.set(0, 0);
      knob.style.transform = "";
    };
  }
  clear() {
    this.keys.clear();
    this.joy.set(0, 0);
    this.drag = undefined;
  }
  reset() {
    this.pitch = 0;
    this.yaw = this.sensor
      ? -new T.Euler().setFromQuaternion(this.sensor, "YXZ").y
      : 0;
    this.clear();
  }
  private orientation = (e: DeviceOrientationEvent) => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const first = !this.sensorSeen;
    this.sensorSeen = true;
    const rad = Math.PI / 180;
    this.sensor = new T.Quaternion()
      .setFromEuler(
        new T.Euler(e.beta * rad, e.alpha * rad, -e.gamma * rad, "YXZ"),
      )
      .multiply(
        new T.Quaternion().setFromAxisAngle(
          new T.Vector3(1, 0, 0),
          -Math.PI / 2,
        ),
      )
      .multiply(
        new T.Quaternion().setFromAxisAngle(
          new T.Vector3(0, 0, 1),
          -(
            screen.orientation?.angle ??
            Number(
              (window as Window & { orientation?: number }).orientation ?? 0,
            )
          ) * rad,
        ),
      );
    if (first) this.reset();
  };
  get motion() {
    return this.active;
  }
  async toggleMotion() {
    if (this.active) {
      this.disable();
      return;
    }
    const api =
      window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<string>;
      };
    if (!api) {
      this.note("Motion sensor unavailable. Drag to look.");
      return;
    }
    try {
      if (
        api.requestPermission &&
        (await api.requestPermission()) !== "granted"
      )
        throw Error();
      this.active = true;
      this.sensorSeen = false;
      window.addEventListener("deviceorientation", this.orientation);
      this.sensorTimer = window.setTimeout(() => {
        if (!this.sensorSeen) {
          this.disable();
          this.note("No motion readings. Drag to look.");
        }
      }, 2200);
    } catch {
      this.note("Motion permission unavailable. Drag to look.");
    }
  }
  private disable() {
    clearTimeout(this.sensorTimer);
    this.active = false;
    this.sensor = undefined;
    window.removeEventListener("deviceorientation", this.orientation);
  }
  update(
    dt: number,
    immersive: boolean,
    height: (x: number, z: number) => number,
    limit: number,
  ) {
    if (!immersive) {
      this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
      if (this.sensor) this.camera.quaternion.multiply(this.sensor);
      if (this.keys.has("ArrowLeft")) this.yaw += dt * 1.6;
      if (this.keys.has("ArrowRight")) this.yaw -= dt * 1.6;
    }
    const dir = new T.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    const side = new T.Vector3(-dir.z, 0, dir.x);
    const x =
        Number(this.keys.has("KeyD")) -
        Number(this.keys.has("KeyA")) +
        this.joy.x,
      z =
        Number(this.keys.has("KeyW") || this.keys.has("ArrowUp")) -
        Number(this.keys.has("KeyS") || this.keys.has("ArrowDown")) -
        this.joy.y;
    dir.multiplyScalar(z).addScaledVector(side, x).clampLength(0, 1);
    this.rig.position.addScaledVector(dir, dt * 4);
    const p = this.rig.position;
    p.x = T.MathUtils.clamp(p.x, -limit, limit);
    p.z = T.MathUtils.clamp(p.z, -limit, limit);
    p.y = height(p.x, p.z);
  }
}
