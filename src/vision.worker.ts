import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
let task: HandLandmarker;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const files = await FilesetResolver.forVisionTasks(data.wasm);
      const cached = await fetch("/models/hand_landmarker.task");
      const bytes = cached.ok
        ? new Uint8Array(await cached.arrayBuffer())
        : null;
      const model =
        bytes?.length === 7819105
          ? { modelAssetBuffer: bytes }
          : { modelAssetPath: data.model };
      task = await HandLandmarker.createFromOptions(files, {
        baseOptions: model,
        runningMode: "VIDEO",
        numHands: 1,
      });
      self.postMessage({ ready: true });
    } else {
      try {
        const result = task.detectForVideo(data.frame, data.time);
        self.postMessage({
          points: result.landmarks[0] ?? [],
          time: data.time,
        });
      } finally {
        data.frame.close();
      }
    }
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
