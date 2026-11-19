import * as THREE from "three";

const UP = new THREE.Vector3(0, 1, 0);
const SCREEN_AXIS = new THREE.Vector3(0, 0, 1);
const CAMERA_FRAME = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  -Math.PI / 2,
);
const clamp = THREE.MathUtils.clamp;
const rad = THREE.MathUtils.degToRad;
const keyCodes = [
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
];

export function createInput(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  rig: THREE.Group,
  joystick: HTMLElement,
  status: (message: string) => void,
  select: (ray: THREE.Raycaster) => void,
) {
  const canvas = renderer.domElement;
  const keys = new Set<string>();
  const stick = new THREE.Vector2();
  const pointer = new THREE.Vector2();
  const start = new THREE.Vector2();
  const last = new THREE.Vector2();
  const lookEuler = new THREE.Euler(0, 0, 0, "YXZ");
  const sensorPose = new THREE.Quaternion();
  const targetPose = new THREE.Quaternion();
  const rotation = new THREE.Quaternion();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const movement = new THREE.Vector3();
  const size = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  ray.camera = camera;
  const eyes = new THREE.StereoCamera();
  eyes.aspect = 0.5;
  let yaw = 0,
    pitch = 0,
    sensorOffset = 0;
  let sensorActive = false,
    receivedPose = false,
    split = false,
    xrBusy = false;
  let sensorTimer = 0,
    sensorGeneration = 0;
  let dragId: number | null = null,
    stickId: number | null = null;
  let dragged = false,
    turnLatch = false;
  let ownsFullscreen = false;
  const knob = joystick.firstElementChild as HTMLElement | null;
  const inputEvents = new AbortController();
  const listeners = { signal: inputEvents.signal };

  function clearInput() {
    keys.clear();
    stick.set(0, 0);
    stickId = dragId = null;
    if (knob) knob.style.translate = "";
  }

  function keyboard(event: KeyboardEvent) {
    if (!keyCodes.includes(event.code)) return;
    if (event.type === "keydown") {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.target instanceof Element &&
          event.target.closest(
            "input,select,textarea,[contenteditable=true],dialog[open]",
          ))
      )
        return;
      keys.add(event.code);
      event.preventDefault();
    } else keys.delete(event.code);
  }
  window.addEventListener("keydown", keyboard, listeners);
  window.addEventListener("keyup", keyboard, listeners);
  window.addEventListener("blur", clearInput, listeners);
  document.addEventListener("visibilitychange", clearInput, listeners);
  canvas.style.touchAction = joystick.style.touchAction = "none";
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (dragId !== null || e.button !== 0) return;
      dragId = e.pointerId;
      dragged = false;
      start.set(e.clientX, e.clientY);
      last.copy(start);
      canvas.setPointerCapture(e.pointerId);
    },
    listeners,
  );
  canvas.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerId !== dragId) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4)
        dragged = true;
      const dx = (e.clientX - last.x) * 0.004;
      if (sensorActive && receivedPose) sensorOffset -= dx;
      else {
        yaw -= dx;
        pitch = clamp(pitch - (e.clientY - last.y) * 0.004, -1.48, 1.48);
      }
      last.set(e.clientX, e.clientY);
    },
    listeners,
  );
  canvas.addEventListener(
    "pointerup",
    (e) => {
      if (e.pointerId !== dragId) return;
      dragId = null;
      if (dragged || renderer.xr.isPresenting) return;
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        split ? 0 : (2 * (e.clientX - rect.left)) / rect.width - 1,
        split ? 0 : 1 - (2 * (e.clientY - rect.top)) / rect.height,
      );
      camera.updateWorldMatrix(true, false);
      ray.setFromCamera(pointer, camera);
      select(ray);
    },
    listeners,
  );
  canvas.addEventListener(
    "lostpointercapture",
    (e) => {
      if (dragId === e.pointerId) dragId = null;
    },
    listeners,
  );

  function moveStick(e: PointerEvent) {
    if (stickId !== e.pointerId) return;
    const rect = joystick.getBoundingClientRect();
    const reach = Math.max(1, Math.min(rect.width, rect.height) * 0.4);
    stick
      .set(
        (e.clientX - rect.left - rect.width / 2) / reach,
        (rect.top + rect.height / 2 - e.clientY) / reach,
      )
      .clampLength(0, 1);
    if (knob)
      knob.style.translate = `${stick.x * reach * 0.65}px ${-stick.y * reach * 0.65}px`;
  }
  joystick.addEventListener(
    "pointerdown",
    (e) => {
      if (stickId !== null) return;
      stickId = e.pointerId;
      joystick.setPointerCapture(stickId);
      moveStick(e);
    },
    listeners,
  );
  joystick.addEventListener("pointermove", moveStick, listeners);
  joystick.addEventListener(
    "lostpointercapture",
    (e) => {
      if (stickId !== e.pointerId) return;
      stickId = null;
      stick.set(0, 0);
      if (knob) knob.style.translate = "";
    },
    listeners,
  );

  function readPose(e: DeviceOrientationEvent) {
    if (e.beta === null || e.gamma === null || e.alpha === null) return;
    const legacy = window as Window & { orientation?: number };
    const angle = screen.orientation?.angle ?? legacy.orientation ?? 0;
    lookEuler.set(rad(e.beta), rad(e.alpha), -rad(e.gamma), "YXZ");
    sensorPose
      .setFromEuler(lookEuler)
      .multiply(CAMERA_FRAME)
      .multiply(rotation.setFromAxisAngle(SCREEN_AXIS, -rad(angle)));
    if (!receivedPose) {
      sensorOffset = yaw - lookEuler.setFromQuaternion(sensorPose, "YXZ").y;
      receivedPose = true;
      window.clearTimeout(sensorTimer);
      status("Motion view active. Drag horizontally to recenter.");
    }
  }

  function stopSensor() {
    sensorGeneration++;
    window.removeEventListener("deviceorientation", readPose);
    window.clearTimeout(sensorTimer);
    lookEuler.setFromQuaternion(camera.quaternion, "YXZ");
    yaw = lookEuler.y;
    pitch = lookEuler.x;
    sensorActive = receivedPose = false;
  }

  async function gyro() {
    if (sensorActive) {
      stopSensor();
      status("Drag to look around.");
      return;
    }
    const api =
      window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<string>;
      };
    if (!window.isSecureContext || !api) {
      status("Motion sensors unavailable. Drag to look around.");
      return;
    }
    const request = ++sensorGeneration;
    try {
      if (
        api.requestPermission &&
        (await api.requestPermission()) !== "granted"
      ) {
        status("Motion access declined. Drag to look around.");
        return;
      }
      if (request !== sensorGeneration) return;
      sensorActive = true;
      window.addEventListener("deviceorientation", readPose);
      status("Waiting for motion sensor data…");
      sensorTimer = window.setTimeout(() => {
        if (!receivedPose) {
          stopSensor();
          status("No orientation readings. Drag to look around.");
        }
      }, 3500);
    } catch {
      status("Motion access unavailable. Drag to look around.");
    }
  }

  function changeSplit(value: boolean) {
    split = value;
    document.body.classList.toggle("phone-stereo", value);
    if (!value) {
      renderer.getSize(size);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, size.x, size.y);
    }
  }

  async function stereo() {
    if (renderer.xr.isPresenting) {
      status("Exit headset mode first.");
      return;
    }
    changeSplit(!split);
    if (split) {
      if (
        !document.fullscreenElement &&
        document.documentElement.requestFullscreen
      ) {
        try {
          await document.documentElement.requestFullscreen();
          ownsFullscreen = true;
        } catch {
          /* inline stereo is supported */
        }
      }
      status("Stereo view. Use landscape and enable motion for head tracking.");
    } else {
      if (ownsFullscreen && document.fullscreenElement)
        await document.exitFullscreen().catch(() => {});
      ownsFullscreen = false;
      status("Single view active.");
    }
  }
  document.addEventListener(
    "fullscreenchange",
    () => {
      if (!document.fullscreenElement && ownsFullscreen) {
        ownsFullscreen = false;
        changeSplit(false);
      }
    },
    listeners,
  );

  renderer.xr.enabled = true;
  const controllers = [
    renderer.xr.getController(0),
    renderer.xr.getController(1),
  ];
  const beamGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(0, 0, -3),
  ]);
  const beamMaterial = new THREE.LineBasicMaterial({
    color: 0xcbecff,
    transparent: true,
    opacity: 0.6,
  });
  for (const controller of controllers) {
    controller.add(new THREE.Line(beamGeometry, beamMaterial));
    rig.add(controller);
    controller.visible = false;
    controller.addEventListener("select", () => {
      controller.updateWorldMatrix(true, false);
      ray.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      ray.ray.direction
        .set(0, 0, -1)
        .transformDirection(controller.matrixWorld);
      select(ray);
    });
  }

  async function xr() {
    if (xrBusy) return;
    const system = navigator.xr;
    if (!window.isSecureContext || !system) {
      status("Headset VR unavailable. Try phone stereo or drag view.");
      return;
    }
    xrBusy = true;
    let session: XRSession | undefined;
    try {
      const current = renderer.xr.getSession();
      if (current) {
        await current.end();
        return;
      }
      if (!(await system.isSessionSupported("immersive-vr"))) {
        status("No immersive VR headset detected. Phone stereo is available.");
        return;
      }
      session = await system.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor"],
      });
      changeSplit(false);
      let floor = true;
      try {
        await session.requestReferenceSpace("local-floor");
      } catch {
        floor = false;
      }
      renderer.xr.setReferenceSpaceType(floor ? "local-floor" : "local");
      const savedYaw = yaw,
        savedPitch = pitch;
      session.addEventListener(
        "end",
        () => {
          document.body.classList.remove("immersive-xr");
          for (const controller of controllers) controller.visible = false;
          rig.rotation.y = 0;
          camera.position.set(0, 1.65, 0);
          camera.scale.set(1, 1, 1);
          yaw = savedYaw;
          pitch = savedPitch;
          camera.rotation.set(pitch, yaw, 0, "YXZ");
          clearInput();
          status("Headset session ended.");
        },
        { once: true },
      );
      await renderer.xr.setSession(session);
      if (!floor) {
        const space = renderer.xr.getReferenceSpace();
        if (space)
          renderer.xr.setReferenceSpace(
            space.getOffsetReferenceSpace(new XRRigidTransform({ y: -1.65 })),
          );
      }
      document.body.classList.add("immersive-xr");
      status(
        "Headset active. Use the left stick to move and trigger to enter a portal.",
      );
    } catch {
      if (session) await session.end().catch(() => {});
      status("Headset session could not start. Phone stereo is available.");
    } finally {
      xrBusy = false;
    }
  }

  function update(
    dt: number,
    ground: (x: number, z: number) => number,
    radius: number,
  ) {
    let side =
      stick.x +
      Number(keys.has("KeyD") || keys.has("ArrowRight")) -
      Number(keys.has("KeyA") || keys.has("ArrowLeft"));
    let walk =
      stick.y +
      Number(keys.has("KeyW") || keys.has("ArrowUp")) -
      Number(keys.has("KeyS") || keys.has("ArrowDown"));
    const session = renderer.xr.getSession();
    if (session) {
      for (const source of Array.from(session.inputSources)) {
        const axes = source.gamepad?.axes;
        if (!axes || axes.length < 2) continue;
        const x = axes[axes.length - 2],
          y = axes[axes.length - 1];
        if (source.handedness === "right") {
          if (!turnLatch && Math.abs(x) > 0.72) {
            rig.rotation.y -= (Math.sign(x) * Math.PI) / 6;
            turnLatch = true;
          }
          if (Math.abs(x) < 0.3) turnLatch = false;
        } else {
          if (Math.abs(x) > 0.17) side += x;
          if (Math.abs(y) > 0.17) walk -= y;
        }
      }
    } else if (sensorActive && receivedPose) {
      targetPose.setFromAxisAngle(UP, sensorOffset).multiply(sensorPose);
      camera.quaternion.slerp(targetPose, 1 - Math.exp(-16 * dt));
    } else camera.rotation.set(pitch, yaw, 0, "YXZ");

    if (side || walk) {
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(forward, UP);
      movement
        .copy(forward)
        .multiplyScalar(walk)
        .addScaledVector(right, side)
        .clampLength(0, 1);
      rig.position.addScaledVector(
        movement,
        (session ? 1.9 : 4.2) * Math.min(dt, 0.06),
      );
      const distance = Math.hypot(rig.position.x, rig.position.z);
      if (distance > radius) {
        rig.position.x *= radius / distance;
        rig.position.z *= radius / distance;
      }
    }
    rig.position.y = ground(rig.position.x, rig.position.z);
  }

  function render(scene: THREE.Scene) {
    if (!split || renderer.xr.isPresenting) {
      renderer.render(scene, camera);
      return;
    }
    camera.updateWorldMatrix(true, false);
    eyes.update(camera);
    renderer.getSize(size);
    const half = Math.floor(size.x / 2);
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, half, size.y);
    renderer.setViewport(0, 0, half, size.y);
    renderer.render(scene, eyes.cameraL);
    renderer.setScissor(half, 0, size.x - half, size.y);
    renderer.setViewport(half, 0, size.x - half, size.y);
    renderer.render(scene, eyes.cameraR);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.x, size.y);
  }

  function reset() {
    clearInput();
    yaw = pitch = 0;
    rig.rotation.y = 0;
    if (!renderer.xr.isPresenting) {
      camera.position.set(0, 1.65, 0);
      camera.rotation.set(0, 0, 0);
    }
    if (receivedPose)
      sensorOffset = -lookEuler.setFromQuaternion(sensorPose, "YXZ").y;
  }
  function dispose() {
    inputEvents.abort();
    stopSensor();
    controllers.forEach((controller) => controller.removeFromParent());
    beamGeometry.dispose();
    beamMaterial.dispose();
    void renderer.xr
      .getSession()
      ?.end()
      .catch(() => {});
  }
  return { update, reset, gyro, stereo, xr, render, dispose };
}
