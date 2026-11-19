# The Observatory and its five worlds

## Architecture

A single WebGL2 renderer owns the active scene, player rig and camera. A catalog resolves a location hash to a world factory. Scene transitions stop the tracking worker and camera tracks, detach the persistent rig, dispose of the old geometry, textures, materials and reflection target, then attach the rig to the new scene. Browser Back retraces the route. The render loop shares simulation time across standard, stereo and immersive views.

```text
index.html                   Accessible shell, canvas, atlas dialog, tracking overlay
src/
  catalog.ts                 World identifiers, titles and interpretive captions
  main.ts                    Routing, XR sessions, render loop, quality and menus
  environment.ts             Seeded terrain, skies, gates, vegetation and room construction
  water.ts                   Planar reflection and animated surface distortion
  particles.ts               Shape generators, morph buffers and local forces
  input.ts                   Locomotion, touch, sensor calibration and recenter
  tracking.ts                Camera lifecycle, landmark overlay and gesture classification
  vision.worker.ts           MediaPipe inference and frame ownership
  style.css                  Overlay layout, mobile controls and stereo presentation
  vite-env.d.ts              Vite environment types
public/art/coastlines.png     Earth land mask
scripts/vision-assets.mjs     Prepare SDK assets and build a classic worker
docs/                        Design and verification
```

## Reference study

| Reference | Observed design | Adaptation |
| --- | --- | --- |
| [Dan Dekker’s mesh.](https://github.com/DanDekker/mesh.) | The repository name ends with a period. It separates geometry, worker-based physics and raw WebGL2 rendering. Its 7,680 points take six forms and respond to nearby input. | Preserve the six form names and persistent particle identities. Generate new parametric shapes. Blend GPU position buffers during transitions and apply local forces in a shader. The renderer and materials also work in stereo. |
| [ppongtong’s gesture-particle](https://github.com/ppongtong/gesture-particle) | Three.js particles react to hand landmarks in the browser. A recognizer translates continuous hand observations into discrete visual commands. | Keep landmarks local, display the skeleton and translate gestures before they reach the sculpture. Use Tasks Vision in a worker, cancel stale camera requests on scene changes, and expose the same effects through buttons. |

## Visual design bible

The atlas pairs quiet editorial typography with concentrated light in the world itself. Large serif world names anchor the lower left. Small teal overlines identify the environment. A graphite scrim keeps text readable against the sunrise. Interface controls stay at the perimeter so the center remains available for aiming. Motion comes from the portal surfaces, water, turning Earth and particles. The camera rotates only in response to user input. Reduced-motion mode holds the ambient clock while preserving explicit interactions.

| Space | Emotional direction | Composition, materials and exploration |
| --- | --- | --- |
| The Observatory | Anticipation | A circular stone court above ridges. Five illuminated gates form an arc around the arrival point. Earth is straight ahead. Colored gate interiors and nameplates identify the other destinations. |
| Edge of Earth | Awe | A basalt shelf hangs over a low cloud bank. A sunrise silhouettes its fractured rim. Walk toward the edge or along either flank to change the overlap between the ledge, clouds and curved Earth. Geographic coastlines, cloud bands and grazing light give the planet scale. |
| Portal Valley | Serenity and mystery | A winding inlet divides forested banks. The starting sightline leads to a pale green gate. The water reflects the forest and gate through a small, rippled reflection target. The valley gate is a landmark. |
| Starlight Field | Wonder | A curving unplanted path cuts through a violet valley. Low branching plants carry four luminous petals each. Detached points of light hang above the flower heads. Walk across or along the trail. |
| Particle Sculpture Room | Abstract art | A dark cylindrical pavilion frames a mint-to-orchid sculpture over marked floor rings. Orbit it on foot, draw across it with the pointer and morph between Silk, Orbit, Wave, Knot, Sphere and Cube. |
| Hand Tracking Particle Lab | Experimentation | Cool structural ribs and a pale constellation define the studio. The camera inset shows exactly which hand is driving the object. Movement, a labeled gesture and the resulting particle motion provide immediate feedback. |

## Input, tracking and menus

Pointer rays select gate surfaces. On the sculpture they intersect a camera-facing plane through the object, then transform to object space. Keyboard and joystick displacement share normalized horizontal movement and terrain-following eye height. Device orientation combines sensor and screen rotation, calibrates the first heading, and falls back to drag if readings never arrive. The phone viewer uses two offset eyes. Headset entry checks immersive-VR support, requests a local-floor session, and uses the WebXR camera and first controller.

The atlas dialog exposes the same destinations by name, supports native keyboard focus and Escape, and marks the current location. View controls collect quality, recenter, motion and headset entry. The camera starts only after an explicit button press. Scene changes, stopping, entering stereo or headset mode, and hiding the page release the stream. Facing mode is a preference because some devices expose one camera.

The worker processes at most one transferred frame at a time, sampled at up to 12.5 Hz. It returns one hand with 21 landmarks. The main thread draws the bones and fingertips over the video, mirrors front-camera coordinates, and evaluates finger extension relative to the wrist. Two consecutive classifications stabilize pose changes. Swipe uses wrist displacement, elapsed time and a cooldown.

| Input | Particle response |
| --- | --- |
| Fist | Morph to a sphere |
| Open hand | Scatter across a volume |
| Index finger | Curl into a vortex |
| Peace sign | Form a wave |
| Thumb–index pinch | Collapse and follow the tracked fingertip |
| Fast horizontal swipe | Push points outward, then decay the burst |

## Performance and implementation roadmap

1. **Hub and shell, implemented.** Shared renderer, loading state, physical gates, atlas dialog, direct routes and scene cleanup.
2. **Exploration, implemented.** Three original landscapes, seeded dressing, instanced vegetation/clouds, rock LOD and bounded terrain-following movement.
3. **Creative rooms, implemented.** Six morphable forms, pointer/touch forces and a local-camera studio. Particle surfaces use one point draw call per sculpture.
4. **XR entry, implemented; hardware acceptance pending.** Permission-gated orientation, split eyes, capability-gated floor-level headset sessions and controller selection.
5. **Gesture influence, implemented for particles.** A later editor can consume the same discrete gesture events for selecting, placing and moving scene objects. Persistent editing and headset-native joint tracking are future work.

Auto quality samples frame intervals, changes resolution with hysteresis and selects 6,000 or 12,000 sculpture points. Low caps pixel ratio at 1, High at 1.7. Standard frustum culling applies to scene objects. The 384-square valley reflection is the main extra scene pass. MediaPipe assets load when tracking starts. Device testing should decide whether to reduce reflection resolution or instance density before increasing geometrical detail.
