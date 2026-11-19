# My 3D World • design and release guide

## Visual direction
The gallery uses the visual language of an observatory. The horizon stays visible from the entry point, architecture gives the player a sense of human scale, and each destination has a distinct light source. Brass identifies travel and the current destination. Ivory serif titles sit over the landscape, while compact sans-serif controls leave the middle of the screen open. The interface can be hidden for exploration. All landscape geometry, particle equations and panorama art are original to this project.

| Experience | Composition and palette | Visitor interaction |
|---|---|---|
| The Observatory | An engraved circular deck in a blue-gray mountain basin. A warm central gateway anchors four smaller gates. | Walk around, click a labeled gate, or open the index. |
| Edge of Earth | An irregular basalt ledge, rock strata and floating cloud banks frame a vast shaded globe. Amber sunrise, blue atmosphere and the star field separate near and far space. | Walk to the rim, turn toward the stars, and return through the gate behind spawn. |
| Portal Valley | Evergreen slopes lead toward a pale green portal. Moving highlights on the river suggest the reflected sky. | Explore both banks and follow the glowing landmark home. The water uses a procedural reflection approximation. |
| Starlight Field | A winding path leads through violet hills, luminous flower heads and drifting specks. | Walk off the path to see the change in parallax between plants, motes and ridgelines. |
| Particle Sculpture Room | A dark rotunda provides a fixed frame for silk ribbons, orbit bands, ripples, a knot, a sphere and a cube. | Select one of six forms and move the pointer or touch the field; the GPU morphs each particle. |
| Hand Tracking Particle Lab | Cool instrument lighting and a central particle volume. A mirrored front-camera inset shows the tracked skeleton. | Enable a camera, select a different facing direction, or use the effect picker. |

## Project map

| Path | Responsibility |
|---|---|
| index.html | Fullscreen canvas, loading state, accessible headings, navigation, native modal, camera overlay and joystick. |
| src/catalog.ts | World IDs, display names and visual identities. |
| src/main.ts | Renderer lifecycle, menu state, scene travel, asset disposal and adaptive resolution. |
| src/worlds.ts | Procedural materials, geometry, floor height, portals, instancing and planet LOD. |
| src/input.ts | One rig for ground-following movement, pointer and controller rays, motion sensors and stereo rendering. |
| src/particles.ts | GPU form equations, smoothing, local displacement and directional bursts. |
| src/hands.ts | Lazy MediaPipe import, camera ownership, landmark classification and skeleton drawing. |
| src/fallback.ts and src/panorama.ts | Navigable illustrated panoramas when WebGL2 cannot initialize. |
| src/style.css | Responsive HUD, world index, display modes and dialog styles. |
| package.json, package-lock.json, tsconfig.json | Vite entry commands, reproducible dependency versions and strict type checks. |

## Input and menus
The camera rig stores the visitor's horizontal position. Each world supplies a floor-height function and walk radius. Desktop and touch share drag-to-look, with independent joystick and camera pointer IDs. Sensor readings are smoothed and corrected for screen orientation. The view menu requests motion access on demand and keeps drag available when readings are absent. Phone stereo renders two eye views with scissored viewports. It provides a basic split image; lens profiles and optical distortion correction are future work.

Native headset entry checks immersive-vr support, requests a session and prefers a floor reference space. Controller rays operate the world gates. The left stick moves and the right stick snap-turns. Triggering open space in an installation cycles the forms. The camera lab uses the ordinary browser camera in flat view; headset-native skeletal hand input is a separate future feature.

The world index works from every destination. View options expose motion, stereo, headset entry, recenter and quality presets. Controls explains each input mode. The URL hash records the current world so a copied link can open it directly.

## Hand signal path
An explicit camera action requests video without audio. The browser loads the pinned MediaPipe WASM runtime from jsDelivr and Google's Hand Landmarker task model from Google Storage. Those downloads need network access. Video frames and landmarks stay in the browser. One hand is sampled at up to roughly 14 frames per second, independently of rendering. A stable pose selects a form; a short velocity threshold and cooldown detect a swipe. The overlay follows the camera's mirror transform. A cancelled initialization releases late-arriving resources. Leaving the lab, stopping the camera or hiding the page releases tracks.

| Signal | Effect |
|---|---|
| Fist | Round sphere |
| Open palm | Scatter |
| Index extended | Vortex |
| Index and middle extended | Wave |
| Thumb and index pinch | Pull particles to the fingertip |
| Fast hand motion | Push burst along the observed swipe |

## Reference decisions
DanDekker's mesh. uses a continuous field of points across six named forms, responds to multiple pointer types and isolates physics in a worker. We adopted form continuity and a shared input representation. Our renderer computes positions from static seeds in a vertex shader, avoiding a per-frame particle transfer. The original GitHub page could not be retrieved during implementation; the architectural comparison used the published project description and the supplied brief. [Public project description](https://vibecruiser.com/v/dandekker--mesh)

Gesture Particle maps hand poses to readable particle formations and lets the hand steer the field. We adopted that mapping while separating capture, recognition, world navigation and rendering. The lab can be explored before granting camera access. [Gesture Particle](https://github.com/ppongtong/gesture-particle) · [Google Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js)

## Performance and next milestones
Instanced vegetation, rocks and repeat architecture reduce draw calls. Three.js performs frustum culling and chooses planet mesh detail by distance. The render loop samples frame time and adjusts pixel ratio in Auto mode. Low and High allow explicit selection. Particle seeds are uploaded once, and coarse-pointer devices use fewer samples. V0.1 uses procedural materials without a large texture download. Inference currently runs on the main thread at a capped rate; move it to a worker if measured device stalls justify the transfer cost.

The next implementation milestone is an editable object in a dedicated sandbox world. Add a selectable-object registry, ray and pinch selection, a reversible transform command and local save/restore. An editor and cross-session world persistence are outside the implemented v0.1 feature set.

## QA checklist
- [x] Install locked dependencies, pass strict TypeScript and build the production bundle.
- [x] Simulate walking, terrain height, click versus drag, joystick, orientation input and stereo eye draws.
- [x] Exercise mocked session entry, controller selection, exit and missing-headset fallback.
- [x] Check five static hand poses against synthetic landmark fixtures.
- [ ] Physical Redmi/Android phone: portrait and landscape, concurrent move/look, motion permissions and recenter.
- [ ] Phone viewer: comfort, eye separation, display fit and fullscreen exit on the actual viewer.
- [ ] Physical WebXR headset: enter, walk, snap-turn, trigger gates, return and exit.
- [ ] Real front/back camera: all six gestures, occlusion, camera switching, denial and repeated start/stop.
- [ ] Measure median and worst-frame times over sustained exploration on target hardware, including inference.
- [ ] Conduct a visual sign-off for the WebGL scenes on a hardware-accelerated browser.
- [x] Compile and link five distinct custom shader pairs in native offscreen Mesa OpenGL ES 3.2.
- [x] Build and update all six scenes, check finite geometry and sampled terrain heights, and ray-pick all ten gateway directions.
- [x] Exercise resource disposal after world travel in a scene-level harness.
- [x] Open the no-WebGL2 fallback in Chrome and navigate from its world index to each of the five destinations.
- [x] Inspect six offscreen landscape spawn frames rendered with scene geometry, camera transforms and custom shaders. The test renderer approximates standard-material lighting, sprite textures and blending. All five outbound gateways, the Earth horizon and both particle installations were visible in their respective views.
