import type { Gesture } from "./particles";
type Landmark = { x: number; y: number; z: number };
const distance = (a: Landmark, b: Landmark) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function classify(p: Landmark[]): Gesture | null {
  const palm = Math.max(0.02, distance(p[0], p[9]));
  if (distance(p[4], p[8]) / palm < 0.36) return "Pinch";
  const [i, m, r, l] = [8, 12, 16, 20].map(
    (n) => distance(p[0], p[n]) > distance(p[0], p[n - 2]) * 1.17,
  );
  if (i && m && r && l) return "Open";
  if (i && m && !r && !l) return "Peace";
  if (i && !m && !r && !l) return "Point";
  if (!i && !m && !r && !l) return "Fist";
  return null;
}
const chains = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [5, 9, 13, 17, 0],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];
export class Tracking {
  private generation = 0;
  private stream?: MediaStream;
  private worker?: Worker;
  private timer = 0;
  private box = document.querySelector<HTMLElement>("#capture")!;
  private video = this.box.querySelector("video")!;
  private canvas = this.box.querySelector("canvas")!;
  private output = this.box.querySelector("output")!;
  private facing = "user";
  constructor(
    private gesture: (g: Gesture) => void,
    private pointer: (x: number, y: number) => void,
    private note: (s: string) => void,
  ) {}
  stop() {
    this.generation++;
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    this.worker?.terminate();
    this.worker = undefined;
    this.video.srcObject = null;
    this.box.hidden = true;
    this.pointer(10, 10);
  }
  async start(switchSide = false) {
    this.stop();
    const token = this.generation;
    if (switchSide)
      this.facing = this.facing === "user" ? "environment" : "user";
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error("Camera requires HTTPS and a supported browser.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: this.facing },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      if (token !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play();
      if (token !== this.generation) return;
      const mirror =
        (stream.getVideoTracks()[0].getSettings().facingMode ?? this.facing) ===
        "user";
      this.video.style.transform = this.canvas.style.transform = mirror
        ? "scaleX(-1)"
        : "none";
      this.box.hidden = false;
      this.output.value = "Loading hand model…";
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;
      const worker = new Worker(
        import.meta.env.BASE_URL + "vision/landmarks.js",
      );
      this.worker = worker;
      let ready = false,
        busy = false,
        lastTime = -1,
        previous: { x: number; t: number } | undefined,
        lastBurst = -1000,
        candidate: Gesture | null = null,
        frames = 0,
        active: Gesture | null = null;
      const fail = (msg: string) => {
        if (token === this.generation) {
          this.stop();
          this.note(msg);
        }
      };
      worker.onerror = () =>
        fail("Tracking could not start. Gesture buttons are available.");
      worker.onmessage = ({ data }) => {
        if (token !== this.generation) return;
        if (data.error) {
          fail(data.error);
          return;
        }
        if (data.ready) {
          ready = true;
          return;
        }
        busy = false;
        const p: Landmark[] | undefined = data.landmarks,
          ctx = this.canvas.getContext("2d")!,
          w = this.canvas.width,
          h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);
        if (!p) {
          this.output.value = "Show one hand";
          previous = undefined;
          candidate = active = null;
          frames = 0;
          this.pointer(10, 10);
          return;
        }
        ctx.strokeStyle = "#8affdc";
        ctx.lineWidth = 3;
        for (const chain of chains) {
          ctx.beginPath();
          chain.forEach((n, i) =>
            i
              ? ctx.lineTo(p[n].x * w, p[n].y * h)
              : ctx.moveTo(p[n].x * w, p[n].y * h),
          );
          ctx.stroke();
        }
        for (const a of p) {
          ctx.fillStyle = "white";
          ctx.beginPath();
          ctx.arc(a.x * w, a.y * h, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        this.pointer(
          ((mirror ? 1 - p[8].x : p[8].x) - 0.5) * 6,
          (0.5 - p[8].y) * 4,
        );
        const t = data.t,
          g = classify(p);
        if (g !== candidate) {
          candidate = g;
          frames = 0;
        }
        if (++frames >= 2 && g && active !== g) {
          this.gesture(g);
          active = g;
        }
        const dx = previous ? Math.abs(p[0].x - previous.x) : 0;
        if (
          previous &&
          dx > 0.075 &&
          dx / (t - previous.t) > 0.001 &&
          t - lastBurst > 650
        ) {
          this.gesture("Swipe");
          lastBurst = t;
        }
        previous = { x: p[0].x, t };
        this.output.value = t - lastBurst < 450 ? "Swipe" : (g ?? "Tracking");
      };
      worker.postMessage({
        init: true,
        base: location.origin + import.meta.env.BASE_URL,
      });
      this.timer = window.setInterval(async () => {
        if (
          !ready ||
          busy ||
          this.video.readyState < 2 ||
          lastTime === this.video.currentTime
        )
          return;
        busy = true;
        lastTime = this.video.currentTime;
        try {
          const bitmap = await createImageBitmap(this.video);
          if (token !== this.generation) {
            bitmap.close();
            return;
          }
          worker.postMessage({ bitmap, t: performance.now() }, [bitmap]);
        } catch {
          fail("Camera frame unavailable. Try a gesture button.");
        }
      }, 80);
    } catch (e) {
      if (token === this.generation) {
        this.stop();
        this.note(e instanceof Error ? e.message : "Camera unavailable");
      }
    }
  }
}
