# Version 0.1 verification

## Executed checks

| Check | Result |
| --- | --- |
| Clean dependency installation and production build | Passed with npm ci, strict TypeScript checking and Vite bundling. The main bundle is approximately 141 KB gzipped. Vite reports its standard uncompressed chunk-size advisory. |
| Desktop browser | Headless Chromium with software WebGL2 rendered the hub and all five destinations. Captures were reviewed for composition. The final route sweep reported no page exceptions or WebGL shader errors. |
| Hub and navigation | A click on the physical Earth gate opened Edge of Earth. The atlas opened all six locations. Keyboard movement and drag look accepted input. |
| Sculpture | Selected every form and checked its active control. The six lab buttons also accepted input. |
| Camera failure | A denied camera request produced a visible status message and the gesture buttons stayed usable. |
| Model inference | The real MediaPipe model processed generated blank frames and reported no hand. An image of an open hand fed through a synthetic camera stream was classified as Open. The model request was fulfilled with the downloaded versioned model during this test. |
| Camera lifecycle | Switching camera stopped the previous synthetic track. The explicit stop action ended the remaining tracks. Physical lens negotiation requires a phone. |
| Mobile UI | Chromium touch emulation at 390 × 844 exercised joystick capture, atlas navigation and motion-permission fallback. Portrait layout fit the viewport. |
| Display modes | Entered and exited phone split view, changed quality and closed the dialog via Escape. |
| Unsupported graphics | With WebGL2 context creation disabled, the page displayed its graphics fallback. |

## Physical-device and release checklist

- [ ] Open an HTTPS preview on the Redmi 15. Verify independent simultaneous joystick and look input in portrait and landscape.
- [ ] On a phone with orientation readings, enable motion, turn 90 degrees, then recenter. Repeat after changing screen orientation. On a phone without sensor readings, verify touch remains usable.
- [ ] Inspect stereo alignment in a phone viewer and return to single view using the exit button. Optical distortion correction is viewer-specific and outside v0.1.
- [ ] Test camera permission grant, denial, revocation, front/rear selection, backgrounding and returning to the hub. Watch the browser camera indicator on each exit.
- [ ] Hold each of the five poses using both hands separately. Test lighting, oblique angles and partial occlusion. Swipe in each horizontal direction and check burst cooldown.
- [ ] Check a WebXR headset with floor tracking. Enter each gate, use a thumbstick, select a sculpture form, squeeze to return and end the session through the headset.
- [ ] Profile sustained frame time and thermal behavior on the target phone and headset. Compare Low and High in Portal Valley and the camera studio. Physical frame-rate targets remain unmeasured.
- [ ] Confirm Vercel preview loads the worker, WASM and remote model over HTTPS. Test the atlas with the model host unavailable.
- [ ] Judge the Earth rim, valley reflection and flower glows in the viewer before signing off final art direction.

The camera fixture was used only for QA. [MediaPipe hand image fixture](https://storage.googleapis.com/mediapipe-assets/right_hands.jpg)
