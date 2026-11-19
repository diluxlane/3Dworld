import type {
  HandLandmarker,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";

const wasm =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";
const model =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const bones = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [5, 9, 10, 11, 12],
  [9, 13, 14, 15, 16],
  [13, 17, 18, 19, 20],
  [17, 0],
];
const distance = (a: NormalizedLandmark, b: NormalizedLandmark) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function recognize(points: NormalizedLandmark[]) {
  const palm = Math.max(0.025, distance(points[5], points[17]));
  // Joint-to-tip extension relative to each finger's base works with a rotated wrist.
  const fingers = [5, 9, 13, 17].map(
    (i) =>
      distance(points[i], points[i + 3]) >
      distance(points[i], points[i + 1]) * 1.65,
  );
  const [index, middle, ring, pinky] = fingers;
  if (!index && !middle && !ring && !pinky) return "Sphere";
  if (distance(points[4], points[8]) / palm < 0.37) return "Implode";
  if (index && middle && !ring && !pinky) return "Wave";
  if (index && !middle && !ring && !pinky) return "Vortex";
  if (index && middle && ring && pinky) return "Scatter";
  return "";
}

const instructions: Record<string, string> = {
  Sphere: "Fist · sphere",
  Scatter: "Open palm · scatter",
  Vortex: "Point · vortex",
  Wave: "Peace sign · wave",
  Implode: "Pinch · grab",
  Burst: "Swipe · push burst",
};

export function createHands(
  container: HTMLElement,
  gesture: (
    name: string,
    x: number,
    y: number,
    swipeX?: number,
    swipeY?: number,
  ) => void,
  status: (message: string) => void,
) {
  const preview = document.createElement("div");
  preview.style.cssText =
    "position:relative;width:min(170px,35vw);aspect-ratio:4/3;overflow:hidden;border-radius:10px;background:#091017;";
  preview.setAttribute("aria-label", "Local camera preview with hand skeleton");
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  const overlay = document.createElement("canvas");
  for (const item of [video, overlay])
    item.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;object-fit:fill;";
  preview.append(video, overlay);
  const ctx = overlay.getContext("2d");
  let session = 0;
  let facing: "user" | "environment" = "user";
  let stream: MediaStream | undefined;
  let tracker: HandLandmarker | undefined;
  let frame = 0;
  let lastStatus = "";
  function report(message: string) {
    if (lastStatus !== message) {
      lastStatus = message;
      status(message);
    }
  }

  function release() {
    ++session;
    cancelAnimationFrame(frame);
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
    video.pause();
    video.srcObject = null;
    tracker?.close();
    tracker = undefined;
    ctx?.clearRect(0, 0, overlay.width, overlay.height);
    preview.remove();
  }

  function draw(points: NormalizedLandmark[] | undefined) {
    if (!ctx) return;
    const w = overlay.width,
      h = overlay.height;
    ctx.clearRect(0, 0, w, h);
    if (!points) return;
    ctx.lineWidth = Math.max(2, w / 150);
    ctx.strokeStyle = "#72fff0";
    ctx.fillStyle = "#fff3c2";
    for (const chain of bones) {
      ctx.beginPath();
      chain.forEach((id, i) => {
        const p = points[id];
        if (i === 0) ctx.moveTo(p.x * w, p.y * h);
        else ctx.lineTo(p.x * w, p.y * h);
      });
      ctx.stroke();
    }
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, w / 105, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  async function start() {
    release();
    const token = session;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      report(
        "Camera unavailable. Open over HTTPS or localhost, or use touch and pointer controls.",
      );
      return;
    }
    try {
      report("Requesting camera access…");
      const camera = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 480 },
          height: { ideal: 360 },
        },
      });
      if (token !== session) {
        camera.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = camera;
      video.srcObject = camera;
      const cameraTrack = camera.getVideoTracks()[0];
      const mirror =
        (cameraTrack.getSettings().facingMode || facing) === "user";
      for (const item of [video, overlay])
        item.style.transform = mirror ? "scaleX(-1)" : "";
      cameraTrack.addEventListener(
        "ended",
        () => {
          if (token === session) {
            release();
            report(
              "Camera disconnected. Pointer and touch controls are available.",
            );
          }
        },
        { once: true },
      );
      container.append(preview);
      await video.play();
      if (token !== session) return;
      overlay.width = video.videoWidth || 480;
      overlay.height = video.videoHeight || 360;
      preview.style.aspectRatio = overlay.width + "/" + overlay.height;
      report("Loading the hand model…");
      const { FilesetResolver, HandLandmarker } =
        await import("@mediapipe/tasks-vision");
      if (token !== session) return;
      const files = await FilesetResolver.forVisionTasks(wasm);
      if (token !== session) return;
      const detector = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: model, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minTrackingConfidence: 0.55,
        minHandDetectionConfidence: 0.58,
      });
      if (token !== session) {
        detector.close();
        return;
      }
      tracker = detector;
      let lastFrame = -1,
        lastRun = -1000,
        candidate = "",
        candidateSince = 0,
        stable = "";
      let previousX = 0,
        previousY = 0,
        previousAt = -1,
        burstUntil = 0,
        refractoryUntil = 0;
      let swipeX = 0,
        swipeY = 0;
      function tick(now: number) {
        if (token !== session) return;
        if (
          !document.hidden &&
          video.readyState >= 2 &&
          video.currentTime !== lastFrame &&
          now - lastRun >= 68
        ) {
          lastRun = now;
          lastFrame = video.currentTime;
          try {
            const points = detector.detectForVideo(video, now).landmarks[0];
            draw(points);
            if (points) {
              const p = points[9];
              const elapsed = (now - previousAt) / 1000;
              const move = Math.hypot(p.x - previousX, p.y - previousY);
              if (
                previousAt >= 0 &&
                elapsed < 0.28 &&
                move > 0.085 &&
                move / elapsed > 1.05 &&
                now > refractoryUntil
              ) {
                swipeX = ((p.x - previousX) * (mirror ? -1 : 1)) / move;
                swipeY = (previousY - p.y) / move;
                burstUntil = now + 420;
                refractoryUntil = now + 850;
              }
              previousX = p.x;
              previousY = p.y;
              previousAt = now;
              const detected = recognize(points);
              if (candidate !== detected) {
                candidate = detected;
                candidateSince = now;
              }
              if (now - candidateSince > 100) stable = candidate;
              const active = now < burstUntil ? "Burst" : stable;
              const anchor =
                active === "Implode" || active === "Vortex" ? points[8] : p;
              if (active) {
                gesture(
                  active,
                  (mirror ? 1 - anchor.x : anchor.x) * 2 - 1,
                  1 - anchor.y * 2,
                  active === "Burst" ? swipeX : 0,
                  active === "Burst" ? swipeY : 0,
                );
                report(instructions[active]);
              } else report("Hand visible · hold a gesture");
            } else {
              previousAt = -1;
              burstUntil = 0;
              candidate = "";
              stable = "";
              report("Camera active · show one hand");
            }
          } catch {
            release();
            report(
              "Hand tracking stopped. Restart the camera or use touch and pointer controls.",
            );
            return;
          }
        }
        frame = requestAnimationFrame(tick);
      }
      frame = requestAnimationFrame(tick);
    } catch (error) {
      if (token !== session) return;
      release();
      const reason = error instanceof DOMException ? error.name : "";
      const message =
        reason === "NotAllowedError"
          ? "Camera permission denied."
          : reason === "NotFoundError"
            ? "No camera found."
            : reason === "NotReadableError"
              ? "Camera is in use or inaccessible."
              : "Camera or hand model unavailable. Check your connection.";
      report(message + " Pointer and touch controls are available.");
    }
  }
  return {
    start,
    async switchCamera() {
      facing = facing === "user" ? "environment" : "user";
      await start();
    },
    stop() {
      release();
      report("Camera off");
    },
  };
}
