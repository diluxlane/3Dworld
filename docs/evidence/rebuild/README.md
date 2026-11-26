# Rendering evidence

The JPEGs come from the running WebGL scene. The “mobile” captures use a phone-sized viewport on a desktop software renderer. The stereo images capture the phone split-screen path. These images support visual inspection and do not attest to the optical alignment of a physical viewer.

## Reproduce

Use two separate working copies for the revisions being compared, with Node.js 22 or later and each build's dependencies installed. The measurement scripts require Playwright and a Chromium executable with WebGL2. Keep Playwright available through the Node module search path. Set CHROME_BIN to the executable. The Python plots require matplotlib and NumPy. Run one Chromium workload at a time.

From the candidate repository, run the following commands separately for each working copy. Set SOURCE to its absolute path and LABEL to baseline or candidate.

```sh
(cd "$SOURCE" && npm ci && npm run build)
node scripts/qa/build-probe.mjs "$SOURCE" /tmp/xr-probe
python -m http.server 4290 --directory /tmp/xr-probe
```

In a second terminal with the same LABEL, run the captures and numbers. Stop the server before building the other revision.

```sh
QA_STAGE=visual node scripts/qa/measure.cjs http://localhost:4290 docs/evidence/rebuild "$LABEL"
QA_STAGE=numbers node scripts/qa/measure.cjs http://localhost:4290 docs/evidence/rebuild "$LABEL"
python scripts/qa/plot.py
```

The temporary Vite transform inserts observation callbacks into a disposable build. The released app has no metric hook. For the route only, the harness sets an absolute horizontal path and look angle at each sample and uses that revision's terrain height. The route moves from x = −8, z = 7 to x = −5, z = −3. This holds the view trajectory fixed while frame rate varies. Collision and touch behavior require separate tests using the normal application input path.

## Raw trace schema

Each sample is an array of eight values. In column order these are frame interval in ms, GL draw calls, submitted triangle instances, live Three.js texture count, live geometry count, used JS heap bytes if available, page clock in ms, and renderer submission duration in ms. Frame intervals are pre-render to pre-render wall-clock intervals. Submission time includes environment update, Three.js traversal, software driver calls and instrumentation. Neither value isolates GPU execution. The four common indexed/unindexed and instanced GL draw calls are wrapped, so nested reflection and shadow passes count. Points and lines generate draw calls and contribute zero triangles.

Cold scene measurements use a new navigation, disabled Chromium network cache, an uncompressed localhost HTTP server and DPR 1. First-frame time is navigation start to the next render callback after a frame of that scene was submitted. Transfer size sums Resource Timing transferSize including the initial HTML, dependencies and reached assets. DevTools network throttling is disabled. Results do not estimate Vercel CDN speed.

The workload sweep warms each tier before sampling it from the same entrance viewpoint. Low and High exist on both revisions. Balanced was introduced on the candidate. The route uses High. The sustained run uses Low for at least 65 seconds. Frame counts of the two runs can differ. Resource count checks repeat Valley → Lab → Hub three times. JS heap can vary with garbage collection, and allocated Three.js counts are indicators rather than GPU memory bytes.

For a physical-device run, record the exact build, refresh rate, orientation, viewport, DPR, power mode and initial device temperature state. Sample the same route cold and warm. Record thermal behavior, camera and sensor tests after at least ten minutes. Save the observations in a copy of hardware-capture.csv.

For a separate timer-query pass run the same browser command with QA_STAGE=gpu for each label. Each run requests asynchronous EXT_disjoint_timer_query_webgl2 samples on the High entrance view, polls readiness without waiting synchronously, and discards disjoint measurements. SwiftShader implements the graphics pipeline in software. Its query durations include no real phone or headset GPU timing. Decode measurements in the candidate raw JSON cover each loader promise after network input is available; overlapping jobs include browser scheduling delays.

The tier sweep switches settings inside an already-open valley. A Low tier selected after entry retains textures that were decoded for that visit. Cold visits in the loading chart use desktop Auto. These cases measure different things from starting directly on a touch device's Low profile. Each route has one cold observation, so individual load values are samples rather than distribution estimates. Desktop screenshots are 960 × 600 and material/lighting details hide the caption. The incoming default quality can adapt during visual review.
