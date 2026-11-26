# Portal Valley functional verification

The functional check drives real keyboard, mouse and emulated touch input in Chromium and records the camera and rig poses from a temporary, instrumented build. Only this local build exposes the pre-render sample. The collision fixture calls the runtime's collision function with ordinary-sized movement steps against the arch pier and a placed boulder. A second smoke check exercises an ordinary production build.

## Executed results

| Browser path | Observed result |
| --- | --- |
| Desktop navigation | Keyboard entry into the valley, mouse look, recenter and arch selection passed. Clicking the arch's projected opening entered Edge of Earth. Browser Back restored Portal Valley. |
| Movement and solid objects | Movement followed the rig height. Walking-sized test steps stopped at 0.670 m from the center of a stone pier and 1.324 m from the center of a western boulder. Across 13,456 sample positions at 0.5 m spacing, the final sampler matched the rendered terrain triangles within one micrometre. |
| Scene ownership | The initial hub requested zero valley assets. Delayed valley downloads did not replace a later destination. Blocking the valley assets produced a retry action, and the same action succeeded when the assets became available. |
| Resource reuse | At the end of each of three valley → lab → hub cycles, Three.js reported 4 resident textures and 44 geometries. These counters measure objects, not total GPU bytes. |
| Touch and motion | Chromium touch emulation accepted independent simultaneous joystick and look inputs. The layout fit both tested orientations. A synthetic 50° sensor turn changed camera pose by 50°. Recenter restored the initial heading. Missing orientation permission or input displayed the fallback message. |
| Display recovery | Split rendering entered and exited. Forcing a WebGL context loss displayed the recovery state and restoring it reloaded the same route. Disabling WebGL2 displayed the unsupported-graphics message. |
| Ordinary production build | Physical hub selection, all existing destinations, sculpture form buttons, manual gesture buttons, denied camera access and Back navigation passed. No unexpected console errors were captured. |

[Instrumented browser checks](browser.json) · [Ordinary production build smoke](production.json) · [Surface samples](terrain.json)

## Reproduce

Install the repository dependencies with `npm ci`. Provide the Playwright Node package and a Chromium executable on the test host. For example, a separate QA tools directory can install Playwright and expose it through `NODE_PATH`. In the repository root, build both targets:

```sh
npm run build
node scripts/qa/terrain.cjs docs/evidence/functional/terrain.json
node scripts/qa/build-probe.mjs . /tmp/xr-functional
```

Serve `dist` and `/tmp/xr-functional` from localhost HTTP servers on distinct ports (the following commands use 4174 and 4175). Run the checks against the corresponding target:

```sh
CHROME_BIN=/path/to/chromium node scripts/qa/smoke.cjs http://localhost:4174 docs/evidence/functional/production.json
CHROME_BIN=/path/to/chromium node scripts/qa/functional.cjs http://localhost:4175 docs/evidence/functional/browser.json
```

## Release checks that require hardware

| Device | Check | Acceptance criterion |
| --- | --- | --- |
| Redmi 15 with target browser | Warm and cold HTTPS load, touch forward plus look, recenter in portrait and landscape | Visible ground throughout. Both fingers work simultaneously. Drag still works if motion permission or readings are unavailable. |
| Phone viewer | Alignment, comfortable eye height, recenter and Escape/exit | Naturally aligned image for both eyes. Accessible return to the gallery. |
| Headset with floor tracking | Enter immersive VR, select portal, thumbstick locomotion into rocks, squeeze to return | Session enters at floor height, solids block motion, destination resolves, no unwanted yaw or unbounded movement. |
| Low-memory phone | Cycle valley, lab and hub for ten minutes with app switches, then re-enter | Stable camera indicator and scene recovery. Record tab eviction, frame times and throttling. |

No Android phone, physical viewer or headset was attached to the test environment. Touch and simulated sensor results cover browser input logic. They cannot establish sensor quality, thermal behavior, comfort, optical alignment or headset refresh rate.
