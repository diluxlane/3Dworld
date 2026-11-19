import { recognize, type Landmark } from "./recognize";
const bones = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [5, 9, 13, 17, 0],
  [0, 9, 10, 11, 12],
  [0, 13, 14, 15, 16],
  [0, 17, 18, 19, 20],
];
export class Hands {
  private worker?: Worker;
  private stream?: MediaStream;
  private generation = 0;
  private timer = 0;
  active = false;
  constructor(
    private video: HTMLVideoElement,
    private canvas: HTMLCanvasElement,
    private status: (s: string) => void,
    private act: (g: number, x: number, y: number) => void,
  ) {}
  stop() {
    this.generation++;
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = undefined;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    this.video.srcObject = null;
    this.video.parentElement!.hidden = true;
    this.active = false;
    this.canvas
      .getContext("2d")!
      .clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  async start(back: boolean) {
    this.stop();
    const token = this.generation;
    this.active = true;
    const fail = (message: string) => {
      if (token === this.generation) {
        this.stop();
        this.status(message);
      }
    };
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error("Camera requires HTTPS and a supported browser.");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: back ? "environment" : "user" },
          width: { ideal: 640 },
        },
        audio: false,
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
        stream.getVideoTracks()[0].getSettings().facingMode === "user" ||
        (!stream.getVideoTracks()[0].getSettings().facingMode && !back);
      this.video.parentElement!.style.transform = mirror ? "scaleX(-1)" : "";
      this.video.parentElement!.hidden = false;
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;
      const worker = new Worker("/vision/hand-worker.js");
      this.worker = worker;
      this.status("Loading the hand model…");
      const ctx = this.canvas.getContext("2d")!;
      let lastX = 0,
        lastTime = 0,
        swiped = 0,
        lastClass = -1,
        stable = 0;
      const frame = async () => {
        if (token !== this.generation) return;
        try {
          const bitmap = await createImageBitmap(this.video);
          if (token !== this.generation) {
            bitmap.close();
            return;
          }
          worker.postMessage(
            { type: "frame", frame: bitmap, time: performance.now() },
            [bitmap],
          );
        } catch {
          fail("Camera interrupted. Try again or use the gesture buttons.");
        }
      };
      worker.onmessage = ({ data }) => {
        if (token !== this.generation) return;
        if (data.error) {
          fail(
            "Hand model unavailable. Check your connection or use the gesture buttons.",
          );
          return;
        }
        if (data.ready) this.status("Camera ready. Hold one hand in view.");
        if (data.points) {
          const p: Landmark[] = data.points,
            w = this.canvas.width,
            h = this.canvas.height;
          ctx.clearRect(0, 0, w, h);
          if (p.length) {
            ctx.strokeStyle = "#9dffe4";
            ctx.lineWidth = 3;
            for (const chain of bones) {
              ctx.beginPath();
              chain.forEach((idx, i) =>
                ctx[i ? "lineTo" : "moveTo"](p[idx].x * w, p[idx].y * h),
              );
              ctx.stroke();
            }
            ctx.fillStyle = "#fff";
            for (const pt of p) {
              ctx.beginPath();
              ctx.arc(pt.x * w, pt.y * h, 3, 0, 7);
              ctx.fill();
            }
            let g = recognize(p);
            stable = g === lastClass ? stable + 1 : 1;
            lastClass = g;
            const dt = data.time - lastTime,
              dx = p[0].x - lastX;
            if (
              lastTime &&
              dt < 230 &&
              Math.abs(dx) > Math.max(0.06, dt * 0.0011) &&
              data.time - swiped > 500
            ) {
              g = 5;
              swiped = data.time;
            } else if (stable < 2) g = -1;
            this.act(g, mirror ? 1 - p[8].x : p[8].x, p[8].y);
            lastX = p[0].x;
            lastTime = data.time;
          } else {
            lastTime = 0;
            stable = 0;
            this.act(-1, -1, -1);
          }
        }
        this.timer = window.setTimeout(frame, 65);
      };
      worker.onerror = () =>
        fail(
          "Hand tracking unavailable in this browser. Use the gesture buttons.",
        );
      worker.postMessage({
        type: "init",
        wasm: new URL("/vision", location.href).href,
        model:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      });
    } catch (e) {
      fail(
        e instanceof Error
          ? e.message
          : "Camera unavailable. Use the gesture buttons.",
      );
    }
  }
}
