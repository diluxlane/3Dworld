# Rebuild audit • 20 November 2026

## Scope and reproducibility

The audit baseline is `origin/main` at **4bb8b0e2b3a7993614c809d7613001da49516e56**. The immediately preceding commits were `8036cbb` (workspace initialization) and `d081625` (project initialization). The review branch was cut from that tip. Other remote prototype branches are outside the baseline. A read-only HTTPS request to the supplied live deployment returned its gallery HTML and JavaScript. SHA-256 of the live entry bundle and the clean baseline build matched: `ab9d8ca7e598c9c262edbd5ea62addc29a1f7575b1eabb0ea191cc9ef15055cc`. This identifies the code behind the production comparison. [Source baseline](https://github.com/diluxlane/3Dworld/tree/4bb8b0e2b3a7993614c809d7613001da49516e56) · [Live deployment](https://3-dworld.vercel.app)

Use the lockfile with `npm ci`, `npm run dev` for development and `npm run build` for strict type checking and asset production. The clean baseline JS is 536,950 bytes before transport compression and approximately 140.83 KB gzip. The build also copies the MediaPipe SIMD/non-SIMD WASM variants into the static output. These files are only requested when tracking starts. The initial route does not fetch 20 MB of tracking files merely because they exist in the deployment.

The comparison uses a separate copy of the baseline so feature edits cannot contaminate the captures. Browser, viewport, route, quality settings, timed samples, chart limitations and test results belong to the [rebuild QA record](REBUILD-QA.md). The [original QA record](QA.md) is historical evidence from v0.1. It covers browser controls and a camera fixture; it contains no physical-phone frame-time or thermal trace.

## Source map and architecture at the baseline

| Source | Responsibility | Existing capability or constraint |
| --- | --- | --- |
| `package.json`, lockfile and `tsconfig.json` | Three.js 0.180.0, TypeScript 5.8.3, Vite 6.4.1, esbuild 0.25.12, MediaPipe Tasks Vision 0.10.22-rc.20250304 | Static application. A prebuild/predev step prepares the worker and SDK assets. |
| `index.html`, `src/style.css`, `src/catalog.ts` | Accessible native atlas/settings dialog, world captions, joystick, camera overlay and metadata | Six hash destinations, each with a title, tag and description. Category metadata, thumbnails and per-entry input/quality information are absent. |
| `src/main.ts` | Persistent renderer, rig, camera, hash history, ray selection, controller input and frame loop | Hub gates support click and proximity entry. Direct URLs, recenter and Back work through the same routing. Scene construction is synchronous. |
| `src/environment.ts`, `src/water.ts` | Procedural landscapes, orbital view, observatory, two chambers, sky, shadows implied by materials, reflection target | One factory builds every location. The valley receives a 384² planar reflection target. Outer rocks have two LODs. Realm changes destroy and rebuild geometry. |
| `src/input.ts` | WASD, arrows, drag look, touch joystick, orientation permission/offset and ground height | Movement clamps X/Z and evaluates the ground height. No obstacle intersection, step limit or physical room-scale blocker exists. |
| `src/particles.ts` | Six morph targets, one draw call for the sculpture, shader-driven pointer and gesture effects | 12,000 maximum points and 6,000 rendered on Low. CPU regenerates target positions when the form changes. |
| `src/tracking.ts`, `src/vision.worker.ts`, `scripts/vision-assets.mjs` | Camera lifecycle, worker bundling, model loading, frame transport, recognition and skeleton overlay | Worker owns inference. Camera tracks stop on visibility changes and scene exits. A generation counter prevents stale async requests from installing a stream. |
| `public/art/coastlines.png`, `docs/DESIGN.md`, `docs/QA.md` | Earth mask, design decisions and prior acceptance evidence | One small Earth-specific image. No photographic valley material, scanned mesh pack or HDR lighting resource is present at the baseline. |

## Findings and risks

| Priority | Confirmed in baseline source | Consequence and test |
| --- | --- | --- |
| High | Trunks are five-sided cylinders. Tree crowns stack seven-sided cones. Near rocks are scaled icosahedra. The 100 × 100 ground grid uses vertex colors and shared roughness. The scene has no valley surface maps, cast shadows or image-based illumination. | At eye height, silhouettes and surface response expose the primitives immediately. Compare eye-level stone, path, sunlit bank and vegetation photographs at matched positions. |
| High | The ground function follows a sinusoidal bank depression. Horizontal movement uses only world bounds. The rendered river overlaps the walkable streambed. | The camera can cross trunks or solid stone and traverse the riverbed as normal terrain. Add low-cost obstacle proxies and test sliding, shoreline edges, spawn safety and repeated entry. |
| High | Every visible planar reflection can invoke an additional scene render. `StereoEffect` renders two eyes. The reflection resolution and vegetation count are fixed across profiles. | The extra pass follows the reflective surface into the low-cost mode. A/B compare full-frame draw calls and frame times with reflection disabled. Source inspection alone cannot identify the slowest GPU pass. |
| Medium | Auto samples an EMA every 180 eligible frames and ignores intervals of 200 ms or more. It switches between two pixel-ratio caps and two point counts. It never adjusts while presenting through WebXR. | Severe stalls are invisible to its average; switching does little for valley vertex cost. Charts must include the unclipped intervals. Separate sustained degradation from an isolated load hitch. |
| Medium | Each outdoor scene creates 36 rock materials/LOD objects with two new geometries per rock. Input allocates two vectors during each update, including idle. XR movement allocates more while moving. | Instancing and reused scratch vectors are candidates. Quantify draw-call and GC changes before attributing a frame-rate gain to either. |
| Medium | Scene disposal traverses the detached scene and releases geometry, maps, shader textures, instanced objects and reflection targets. The ordinary material path checks only `map`. No persistent texture cache exists. | The baseline's limited inputs suit this disposal path. New normal, roughness and environment maps need explicit ownership. Verify counts flatten over repeated round trips and asynchronous callbacks cannot attach stale worlds. |
| Medium | The frame loop unconditionally hides the loading overlay at the end of each successful iteration. Realm creation and resource ownership have no per-route async lifecycle. The context-loss handler displays a reload message. | An asset-backed world needs visible progress, errors, cancellation and restoration behavior. Test rapid Back/forward and a missing optional texture. |
| Medium | In the lab, pointer moves both rotate the camera and move the deformation point during drags. A pose change computes and writes new targets for 12,000 points on the main thread even on Low. | Profile drag and rapid button changes independently. Pointer look/deform coupling and form-change work are plausible latency contributors independent of inference. |
| Medium | Orientation calibration subtracts the initial yaw from a YXZ rotation and times out after 2.2 s without a first reading. Once a valid reading has arrived, subsequent missing/stale samples are not reported. | Validate screen rotation through portrait/landscape and resume on the handset. Drag remains available. Lack of a physical test prevents any claim about absolute yaw, drift or comfort. |

## Camera timing audit

The target is a 640 × 480 ideal stream with one hand. A timer wakes every 80 ms, so **12.5 requests/s is the theoretical scheduling ceiling**, before repeated frames, busy-worker skips and decode stalls. Grab starts with `createImageBitmap`. The main thread transfers ownership, the worker runs the versioned CPU delegate synchronously, returns the first hand and releases the bitmap. Two consecutive candidate poses trigger a gesture. A quick horizontal wrist displacement triggers a burst with a 650 ms cooldown. Camera switch stops the outgoing track and rebuilds the worker/model. The WASM and model may benefit from ordinary HTTP caching; inference state is recreated each time.

A recognized-pose label currently displays a provisional classification while the effect waits for stabilization. The permission prompt precedes any in-panel initializing state. One in-flight bitmap bounds the queue, but that alone cannot establish latency. Record capture-attempt and delivered-frame rates, worker warmup, inference duration, capture-to-result delay, two-pose debounce and first painted response separately. A CPU/GPU delegate comparison must use the same camera stream, render quality, resolution and device. The baseline exposes no data that assigns the user's lag to CPU inference. [MediaPipe source integration](https://github.com/diluxlane/3Dworld/tree/4bb8b0e2b3a7993614c809d7613001da49516e56/src)

## Related Zyberlane cinema

The supplied historical MotionVR repository resolves to **diluxlane/Zyberlane-XR**. At audit time its `main` was **6299e3e83f05bbb2f3d83dbb1b8a01d63c0e9f86**. The repository contains a standalone browser player. The gallery baseline has no video route, media element for playback, media texture or Galaxy Cinema catalog entry. The gallery's camera-preview video serves hand tracking only. [Pinned player source](https://github.com/diluxlane/Zyberlane-XR/blob/6299e3e83f05bbb2f3d83dbb1b8a01d63c0e9f86/app.js) · [Player UX](https://github.com/diluxlane/Zyberlane-XR/blob/6299e3e83f05bbb2f3d83dbb1b8a01d63c0e9f86/ui.js) · [MIT notice](https://github.com/diluxlane/Zyberlane-XR/blob/6299e3e83f05bbb2f3d83dbb1b8a01d63c0e9f86/LICENSE)

| Verified in player source | Boundary for integration |
| --- | --- |
| Raw WebGL fragment shader intersects a fixed flat screen, maps a full equirectangular sphere or clips an equirectangular 180° front hemisphere. It selects mono, SBS left/right or top/bottom source halves for each eye. | Preserve the tested UV conventions. VR180 here means prepared equirectangular content, not arbitrary dual-fisheye uploads. Test an asymmetric labeled-eye test clip on the gallery's split and WebXR cameras. |
| Local input uses object URLs. Replacement and page unload revoke the prior URL. Source validation accepts HTTPS, including ordinary web pages. Component errors handle decode and cross-origin texture failure. | Reject known watch-page URLs before assigning the source. On gallery exit, pause, clear source, detach listeners and revoke local URLs. |
| Play/pause, mute, timeline, fullscreen fallbacks, sensor smoothing, recenter and two side-by-side viewports exist. The sample shader draws a dark backdrop and a screen. | Add variable volume, a space-cinema scene and explicit gallery return. The legacy `headset` flag toggles phone split. Real immersive sessions belong to the gallery's WebXR rig. Avoid opening a second renderer or orientation listener inside that session. |
| The renderer uploads the source via `texImage2D` during its animation loop whenever video has data; this can re-upload a paused or duplicated frame. | Reuse a video texture and schedule uploads on decoded-frame availability. Verify decode FPS separately from head-tracked scene FPS. |
| Two legacy Node regression suites passed locally: 9/9 cases in `tests/player-behavior.test.cjs` and `tests/tracking.test.cjs`. | These deterministic tests cover input/tracking behavior. Codec playback, stereo ordering and audio still need rendered media and device checks. |

## Device support and measurement boundaries

| Device / mode | Evidence at entry to the rebuild | Required sign-off |
| --- | --- | --- |
| Desktop Chromium | Historical v0.1 browser route and feature checks. Clean baseline reproduced. | Matched views, foreground frame intervals, world switching, CPU/heap and rendering counters. |
| Mobile-sized Chromium | Previous tests exercised a touch-emulated joystick, atlas and motion fallback. | Portrait/landscape and touch regressions in this branch. Emulation supplies no real gyro, lens or thermal results. |
| Physical Redmi 15 | No connected handset in the development environment. | HTTPS camera permission, lens switch, spatial feel, P95 frame times and sustained warm-device behavior. |
| Phone VR box | Split rendering exists. Previous QA entered/exited the mode. | Physical optical alignment, readable HUD, orientation after recenter and return from fullscreen. |
| Floor-tracking headset | `isSessionSupported`, explicit session request and a controller route exist in source. | Real controller selection, thumbstick motion, physical-floor height, per-eye alignment and native refresh cadence. |
| Firefox / Safari | Browser differences in video decoding, motion permission, worker initialization and GPU capabilities are relevant. | Test on available alternative browsers and explicitly record gaps. |

## Delivery sequence

1. Capture the unchanged baseline on a fixed route and retain the exact source revision, viewport, renderer and device classification.
2. Rebuild the valley's near path, waterline and hero rock with provenance-recorded assets. Establish the sun, shadow direction and distant silhouettes before adding density. Share a navigable floor and simple collision geometry.
3. Compare identical shots and profile Low, Balanced and High. Retain flow through the gate and clear sightlines after lowering quality. Check resource counts over transitions.
4. Once the valley meets the visual and frame-pacing gates, measure cold/warm tracking and interaction latency, then integrate the known player with fixture videos that distinguish left/right and front/back.
5. Apply validated techniques to the other environments only after target hardware confirms the budget. Treat target frame rates as acceptance goals. Sources and technique comparisons are in [Rendering research](RESEARCH.md).
