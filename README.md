# My 3D World

Zyberlane XR’s browser atlas. Enter the Observatory and select a physical gate, walk into its center, or open **World atlas**. Each destination is a navigable Three.js scene.

## Portal Valley review build

Enter `/#valley` to follow a woodland path beside the stream. Select the stone arch to enter Edge of Earth. **Hide guide** clears the lower overlay while exploring. View & controls offers Auto, Low, Balanced and High. Geometry, shadows, water and resolution respond during play. Soil and rock texture sizes are chosen when entering the valley, so re-enter after selecting Low to measure its smaller download.

The CPU/GPU camera comparison uses a synthetic stream on software Chromium. Physical Redmi and headset acceptance are still open. The cinema audit identifies an existing player in the Zyberlane XR repository.

[Source and cinema audit](docs/REBUILD-AUDIT.md) · [Rendering research](docs/RESEARCH.md) · [Asset sources and offline workflow](docs/assets/VALLEY.md) · [Motion and collision checks](docs/evidence/functional/README.md) · [Gesture timing](docs/evidence/tracking/README.md)

## Run locally

Use Node.js 22 LTS and npm. From the repository root, run the following commands.

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite. To check the deployable build, run `npm run build` followed by `npm run preview`. Both development startup and production build prepare the local MediaPipe WASM files and bundle the tracking worker. The gallery itself runs from static files. On first camera use the browser retrieves Google’s versioned hand-landmarker model. Camera frames and results stay on the device.

## Record a physical-device test

Open the preview with `/?profile=1#valley`. Choose a quality tier, then **View & controls → Record 60 seconds**. Walk toward the stone arch while recording. Open **View & controls → Download frame data** to save the trace to the device. Changing world or backgrounding the page ends a partial trace. The export includes individual frame intervals, active tier, stereo mode, draw calls, triangles and renderer resource counts. The browser generates this file locally. Repeat after the phone has warmed up and record its browser version alongside the file.

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

Portal Valley combines original scenery with optimized external models, photographic surfaces and panorama data. The asset manifest records creators, source URLs, licenses and derivative sizes. The other worlds use original procedural scenery and particle forms. [Valley asset manifest](docs/assets/valley-manifest.json) The included raster coastline mask derives from the Natural Earth 1:110m land dataset. Its projection feeds a custom Earth shader. The hand model and runtime have their own upstream distribution terms.

[Natural Earth land source](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson) · [Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/) · [MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js) · [Vercel Vite guide](https://vercel.com/docs/frameworks/frontend/vite)
