import type { WebGLRenderer } from "three";
import type { Tier } from "./quality";

interface Sample {
  elapsedMs: number;
  frameMs: number;
  quality: Tier;
  mode: string;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
}
export class DeviceCapture {
  private samples: Sample[] = [];
  private startTime = 0;
  private previous = 0;
  private originalReset = true;
  private reason = "";
  private recording = false;
  private world = "";
  constructor(
    private renderer: WebGLRenderer,
    private finished: () => void,
  ) {}
  get active() {
    return this.recording;
  }
  get available() {
    return this.samples.length > 0 && !this.recording;
  }
  begin(world: string) {
    if (this.recording) return;
    this.samples = [];
    this.world = world;
    this.reason = "";
    this.startTime = performance.now();
    this.previous = 0;
    this.recording = true;
    // Accumulate the whole submission, including both eyes and nested reflections.
    this.originalReset = this.renderer.info.autoReset;
    this.renderer.info.autoReset = false;
  }
  beforeFrame() {
    if (this.recording) this.renderer.info.reset();
  }
  afterFrame(now: number, quality: Tier, mode: string) {
    if (!this.recording) return;
    const previous = this.previous;
    this.previous = now;
    if (previous && now > previous) {
      const { render, memory } = this.renderer.info;
      this.samples.push({
        elapsedMs: now - this.startTime,
        frameMs: now - previous,
        quality,
        mode,
        calls: render.calls,
        triangles: render.triangles,
        geometries: memory.geometries,
        textures: memory.textures,
      });
    }
    if (now - this.startTime >= 60000) this.stop("60 seconds elapsed");
  }
  stop(reason: string) {
    if (!this.recording) return;
    this.reason = reason;
    this.recording = false;
    this.renderer.info.autoReset = this.originalReset;
    this.finished();
  }
  download() {
    if (!this.available) return;
    const sorted = this.samples.map((s) => s.frameMs).sort((a, b) => a - b);
    const quantile = (fraction: number) =>
      sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
    const report = {
      schema: 1,
      world: this.world,
      endedBecause: this.reason,
      viewport: [innerWidth, innerHeight],
      devicePixelRatio,
      frameCount: this.samples.length,
      medianFrameMs: quantile(0.5),
      p95FrameMs: quantile(0.95),
      medianFps: 1000 / quantile(0.5),
      note: "Animation frame intervals and renderer counters. GPU execution time, GPU memory bytes, and motion-to-photon latency require separate measurements.",
      samples: this.samples,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "zyberlane-xr-" + this.world + "-frames.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
