# My 3D World
Zyberlane XR • Version 0.1

A first-person gallery of three landscapes and two interactive installations. The observatory is a playable scene. Select a physical gateway or use the world index to travel.

## Run locally
Use Node 22.12+ or Node 24. From the project root:

```sh
npm ci
npm run dev
```

Open the localhost address Vite prints. For the production build, run `npm run build`, then `npm run preview`. A phone visiting a plain HTTP LAN IP may explore by touch, but camera, motion permissions and immersive VR require a secure context on supporting browsers. Use the HTTPS preview for phone testing.

## Vercel preview
From the project root, sign in with `npx vercel login`, run `npx vercel link`, then `npx vercel deploy`. Choose Vite, build command `npm run build`, output `dist`. The CLI returns a preview URL. No application secrets or backend are required. For Git integration use a feature branch/PR after linking the repository. See https://vercel.com/docs/projects/deploy-from-cli.

## Architecture and delivery order
One WebGL2 renderer and one animation loop own the active scene. Each scene factory provides a spawn point, bounded walking area, floor-height query, interactable portals and a time update. Travel releases outgoing GPU resources. A persistent camera rig is reparented on entry. The catalog supplies titles and navigation. Particle forms and hand classification are independent of terrain.

1. Establish the hub, world catalog, scene lifecycle and menu.
2. Build the cliff, canyon and luminous field with distinct horizons, geometry and landmarks.
3. Introduce two installations sharing one particle engine and separate control panels.
4. Connect touch/keyboard, orientation, phone stereo and immersive VR to the rig.
5. Map landmarks to form, attraction and burst effects. Future work includes editable scene objects, persistent arrangements and physical-device tuning.

See [Design and QA](DESIGN.md) for the individual worlds, interaction model and checks.
