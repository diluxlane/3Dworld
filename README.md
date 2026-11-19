# My 3D World

Version 0.1 of Zyberlane XR’s browser atlas. Enter the Observatory and select a physical gate, walk into its center, or open **World atlas**. Each destination is a navigable Three.js scene.

## Run locally

Use Node.js 22 LTS and npm. From the repository root, run the following commands.

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite. To check the deployable build, run `npm run build` followed by `npm run preview`. Both development startup and production build prepare the local MediaPipe WASM files and bundle the tracking worker. The gallery itself runs from static files. On first camera use the browser retrieves Google’s versioned hand-landmarker model. Camera frames and results stay on the device.

## Vercel preview

From the project root, run `npx vercel`, sign in and select a project. Use the Vite preset, the repository root, build command `npm run build`, and output directory `dist`. The default CLI deployment creates a preview. Open its HTTPS URL directly on your phone for camera, orientation and fullscreen permission tests. The hash routes support direct links such as `/#earth` and `/#lab` on static hosts.

## Controls

| Device or mode | Action |
| --- | --- |
| Keyboard and mouse | WASD or up/down arrows to walk. Drag to look. Left/right arrows turn. Click a gate to enter. |
| Phone or tablet | Move with the left joystick and drag elsewhere to look. Tap a gate or open World atlas. |
| Phone motion | Choose **View & controls → Enable motion view**. Hold the phone in viewing position while enabling it. Recenter at entrance resets heading and position. |
| Phone viewer | Enter a world, optionally enable motion, then select **Phone VR · split view**. Landscape gives each eye more room. Exit using the on-screen button. |
| Headset | Select **Enter headset VR** on compatible devices. Aim the first controller and select a hub portal. Use a thumbstick to move. Squeeze returns to the hub. In the sculpture room select cycles forms, and in the lab it sends a burst. |
| Gesture studio | Enable the camera, show one hand, and try the gesture table in the design guide. Switch camera requests the other facing direction when available. Buttons provide all six effects. |

**[Architecture, reference analysis, design bibles and roadmap](docs/DESIGN.md)** · **[QA results and device checklist](docs/QA.md)**

## Assets

Scene geometry, materials, particle forms, flowers, gates and interface were authored for this project. The included raster coastline mask derives from the Natural Earth 1:110m land dataset. Its projection feeds a custom Earth shader. The hand model and runtime have their own upstream distribution terms.

[Natural Earth land source](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson) · [Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/) · [MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js) · [Vercel Vite guide](https://vercel.com/docs/frameworks/frontend/vite)
