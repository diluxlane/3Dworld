# My 3D World · Design and implementation

## Architecture and repository map

The browser owns the scene, input and camera data. Vite produces a static deployment. One renderer serves desktop, mobile and headset views. Switching worlds builds a new scene, reparents the player rig, releases the old geometry, materials, labels and reflection target, and stops any active hand session.

| Path | Responsibility |
| --- | --- |
| `index.html`, `src/style.css` | Full-viewport canvas, loading state, title, accessible dialog, controls, camera overlay and responsive joystick |
| `src/main.ts` | Renderer, camera rig, menu, travel, quality, picking, stereo composition and WebXR session management |
| `src/catalog.ts` | Names, colors, world descriptions and available actions |
| `src/world.ts` | Scene construction, terrain height, placement, portal targets, timed animation and resource disposal |
| `src/sky.ts` | Directional sky, stars, atmosphere and procedural planetary surface |
| `src/input.ts` | Keyboard state, drag versus tap, joystick, device orientation permission and recentering |
| `src/particles.ts` | GPU surface sampling, form morphs, local interaction and impulse decay |
| `src/hands.ts` | Camera lifecycle, front/back preference, mirrored coordinates, inference pacing, skeleton and gesture dispatch |
| `src/recognize.ts` | Landmark geometry classifier |
| `src/vision.worker.ts` | MediaPipe creation and single-frame inference |
| `scripts/vision.mjs` | Generates the classic worker, stages WASM and caches the checksum-verified hand model at install time |
| `public/vision/`, `public/models/` | Generated runtime files. Vite copies them into the build. Model download fallback uses Google's versioned endpoint. |
| `package-lock.json`, `tsconfig.json`, `vite.config.ts` | Reproducible dependencies, strict TypeScript checks and bundler settings |

## Visual and world design bible

The horizon sets the emotional tone before the visitor moves. The composition keeps a recognizable landmark ahead of each spawn and leaves room for exploration to either side. Serif world names sit low in the frame. Short sans-serif instructions and a single accent identify the current place. The camera opens at walking height. Ambient motion slows when reduced motion is requested.

| Place and mood | Scene, scale and light | Visitor action |
| --- | --- | --- |
| The Observatory · anticipation | Five luminous membranes form an arc around an engraved terrace. Violet atmosphere, layered ridges and a ringed moon frame the gates. | Read a suspended label and select its surface, or open the world index. |
| Edge of Earth · awe | A fractured basalt shelf overlooks a giant curved planet. Procedural ocean, land, cloud bands and a blue limb sit below a warm sunrise. A second cloud layer drifts below the ledge. | Walk to the bounded cliff lip and turn back toward the return gate. |
| Portal Valley · serenity and mystery | Terraced canyon walls, clustered conifers and a narrow reflective channel lead to a mint gate. A low-resolution planar reflection ripples across the water. | Follow the bank and watch the gateway reflection move with the viewpoint. |
| Starlight Field · wonder | A winding, lighter strip cuts through violet growth. Stemmed lights, floating motes and distant ridges give the meadow depth. | Follow the path, then leave it to inspect the flowers and sky. |
| Particle Sculpture Room · abstract art | A cool blue point field hovers above a circular dais. Columns establish scale and allow the visitor to walk around the artwork. | Switch among Silk, Orbit, Wave, Knot, Sphere and Cube. Move the pointer or touch the sculpture to displace a local patch. |
| Hand Tracking Particle Lab · experimentation | A teal installation shares the particle engine. A camera preview and a 21-point skeleton expose what the tracker sees. | Enable a camera or use six named gesture buttons. Returning to the hub closes the camera. |

The rock, sky, water treatment, particles, vegetation and world layouts are procedural. There are no third-party landscape images or copied reference-project assets.

## Input and menus

| Input or control | Behavior |
| --- | --- |
| WASD / arrow keys | Walk relative to the current gaze. Left and right arrows turn. Up and down walk. |
| Mouse / touch | Drag the canvas to look. A short tap raycasts against physical gate surfaces. The touch joystick moves independently of the look pointer. |
| World index | Native modal dialog gives keyboard, mouse and touch users direct access to all five worlds and the hub. Escape dismisses it. |
| View controls | Recenter, request motion, switch quality, enter phone stereo, or request a supported immersive session. |
| Motion | Request device permission when required. Wait for non-null samples, compensate for display rotation and calibrate the starting attitude. A timeout restores drag look. |
| Phone stereo | Side-by-side stereo cameras, optional browser fullscreen and an explicit exit button. Enable motion first for head-controlled viewing. Lens distortion calibration is outside v0.1. |
| Headset | Check immersive-vr support before enabling entry. XR poses drive the camera. Controller select picks a portal or cycles the active artwork when pointed elsewhere. A controller stick provides gaze-relative movement. End the session using the headset system menu. |
| Camera selection | Enable tracking explicitly. Switch camera requests the alternate facing direction where available. Browsers decide which physical camera satisfies the request. |

## Hand tracking and world influence

A classic worker loads the locally staged MediaPipe WASM runtime. The main thread sends one transferable video bitmap, waits for the landmark result, and then schedules the next sample. This avoids building an inference backlog. Video and landmark data stay in the browser. The skeleton overlay and fingertip interaction use the same mirror convention. The ray from the normalized fingertip intersects a plane through the artwork, so interaction follows the current camera angle.

| Gesture | Classification and effect |
| --- | --- |
| Fist | Four curled fingers select Sphere. |
| Open hand | Four extended fingers scatter points through a volume. |
| Point | An extended index finger drives a rotating vortex. |
| Peace | Index and middle fingers extended select Wave. |
| Pinch | Thumb–index separation normalized by palm size collapses the field around the fingertip. |
| Swipe | Rapid lateral wrist displacement triggers a short outward burst with a cooldown. |

Static poses require consecutive classifications. Unrecognized poses preserve the current form. Missing landmarks clear the skeleton and attraction point. These thresholds need tuning with real people, varied lighting and both camera orientations. Headset-native tracked hands and persistent world editing remain future work.

## Reference decisions

- **gesture-particle** documents 10,000 particles, landmark-to-scene mapping and gesture-driven behavior. This implementation adapts the input-to-effect separation. It uses palm-relative measurements, a worker and GPU-parametric forms with manual controls. [Reference repository](https://github.com/ppongtong/gesture-particle)
- **mesh.** publicly describes six responsive forms and pointer, touch and scroll input. Its six-form vocabulary informed the sculpture room. Here a GPU vertex shader samples a stable point field and interpolates between surfaces. The simulation needs no per-frame particle array transfer. The original repository source could not be retrieved for direct inspection. The worker-based architecture attributed to it in the project brief is unverified. [Public project description](https://vibecruiser.com/v/dandekker--mesh)
- **MediaPipe** supplies the landmark model and inference runtime. The worker performs inference and the foreground renderer remains independently paced. [Hand Landmarker documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
- **WebXR** support is queried per browser and session type. Session requests can still fail after a positive capability check. [Session detection](https://developer.mozilla.org/en-US/docs/Web/API/XRSystem/isSessionSupported)

## Implementation roadmap and performance

1. Establish travel, loading feedback, physical gateways and menu access.
2. Build distinct landscapes with bounded exploration and matching terrain-following movement.
3. Share the GPU particle renderer between the two installations.
4. Add touch, orientation, phone stereo and capability-detected immersive entry.
5. Connect gestures to shape, attraction and burst events. The first five steps are implemented in this branch.
6. Validate tracking, stereo alignment, physical comfort and sustained frame time on target devices. Use measured results to tune thresholds, terrain density and resolution.
7. Extend world influence to selectable scene objects. Add a transform preview, cancel/commit commands and undo before introducing persistence.

Static vegetation and field elements are instanced. Landmark rocks swap geometry using distance-based LOD. Three.js performs frustum culling. Terrain and animated particles use a small number of meshes. The sculpture draws 10,000 or 5,500 points. Sustained slow frames reduce pixel density, and sustained fast frames restore it. Users can override the adaptive preset. The water uses a 384-square reflection target. Worker scripts, WASM and model files are loaded only when camera tracking starts.

## QA checklist

### Verified in this environment

- [x] Strict TypeScript and Vite production build.
- [x] Chromium WebGL2 rendered the hub and all five world entries. Inspected the opening hub and cliff compositions.
- [x] Selected each sculpture form through the normal controls.
- [x] Started the real MediaPipe graph in a worker using a synthetic camera stream and the versioned model.
- [x] Returning to the hub released the lab video stream.
- [x] Entered and exited phone split-screen in Chromium.
- [x] Opened the six-entry world menu at a 390 × 844 viewport.

### Device acceptance

- [ ] Redmi 15 and a second phone: walk and look simultaneously, rotate portrait/landscape, recenter motion and test a device without valid sensor readings.
- [ ] Front/back cameras: test permission denial, retry, switch, loss of tracking and all six gestures in varied lighting. Confirm the camera indicator clears on stop, travel and page hide.
- [ ] Phone viewer: check inter-eye alignment, controls reachability, fullscreen exit and comfort in landscape.
- [ ] Headset: verify session entry, tracked pose, controller ray, stick movement, all return portals, end-session recovery and stable frame timing.
- [ ] Physical GPU: record median/p95 frame time and heat after ten minutes in each world. Compare manual high/low and adaptive settings.
- [ ] Visit the HTTPS Vercel preview from desktop, phone and headset; check first-load model caching and denied-permission fallback.
