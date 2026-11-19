import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
let model: HandLandmarker;
self.onmessage = async ({ data }) => {
  try {
    if (data.init) {
      const files = await FilesetResolver.forVisionTasks(data.base + "vision");
      model = await HandLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
      });
      self.postMessage({ ready: true });
    } else {
      try {
        const result = model.detectForVideo(data.bitmap, data.t);
        self.postMessage({ landmarks: result.landmarks[0], t: data.t });
      } finally {
        data.bitmap.close();
      }
    }
  } catch {
    self.postMessage({
      error:
        "Hand model unavailable. Check your connection or use the gesture buttons.",
    });
  }
};
