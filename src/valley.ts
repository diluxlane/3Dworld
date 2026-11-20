import * as T from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { terrainHeight, makeGround } from "./valley-ground";
import {
  dressValley,
  resolveObstacles,
  type ValleyTier,
} from "./valley-dressing";
import { addArch } from "./valley-arch";
import { makeStream } from "./valley-water";
export type { ValleyTier };
const assetRoot = import.meta.env.BASE_URL + "valley/";

export async function makeValley(
  tier: ValleyTier,
  onProgress?: (label: string) => void,
  signal?: AbortSignal,
) {
  const scene = new T.Scene();
  const textureLoader = new T.TextureLoader(),
    models = new GLTFLoader();
  const originalModels: T.Object3D[] = [],
    textures: T.Texture[] = [];
  let done = 0;
  const imageNames = [
    "ground-color.webp",
    "ground-normal.webp",
    "ground-rough.webp",
    "rock-color.webp",
    "rock-normal.webp",
    "sky-light.hdr",
    "tree-impostor.webp",
    "broadleaf.webp",
    "moss-color.webp",
    "alpine-panorama.webp",
  ];
  const meshNames = ["tree.glb", "fern.glb", "boulder.glb", "boulder-low.glb"];
  const notify = () =>
    onProgress?.(
      "Opening Portal Valley · " +
        ++done +
        " / " +
        (imageNames.length + meshNames.length),
    );
  // Bound network waits, allow concurrent callers to finish cleanup, and keep partially constructed assets off-screen.
  const abort = new AbortController(),
    timeout = window.setTimeout(() => abort.abort(), 45000);
  const cancel = () => abort.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  async function read(name: string) {
    const response = await fetch(assetRoot + name, { signal: abort.signal });
    if (!response.ok) throw new Error("Could not load " + name);
    return response;
  }
  async function loadTexture(name: string) {
    const lowMap =
      tier === "Low" &&
      ![
        "sky-light.hdr",
        "tree-impostor.webp",
        "broadleaf.webp",
        "alpine-panorama.webp",
      ].includes(name);
    const blob = await (await read(lowMap ? "low/" + name : name)).blob();
    const url = URL.createObjectURL(blob);
    try {
      const tex = name.endsWith(".hdr")
        ? await new HDRLoader().loadAsync(url)
        : await textureLoader.loadAsync(url);
      textures.push(tex);
      notify();
      return tex;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async function model(name: string) {
    const gltf = await models.parseAsync(
      await (await read(name)).arrayBuffer(),
      assetRoot,
    );
    originalModels.push(gltf.scene);
    notify();
    return gltf.scene;
  }
  const [imageJobs, meshJobs] = await Promise.all([
    Promise.allSettled(imageNames.map(loadTexture)),
    Promise.allSettled(meshNames.map(model)),
  ]);
  clearTimeout(timeout);
  signal?.removeEventListener("abort", cancel);
  function disposeSource(includeMaterials: boolean) {
    const seen = new Set<{ dispose: () => void }>(),
      images = new Set<ImageBitmap>();
    for (const root of originalModels)
      root.traverse((o) => {
        if (o instanceof T.Mesh) {
          seen.add(o.geometry);
          for (const mat of [o.material].flat() as T.Material[]) {
            if (includeMaterials) seen.add(mat);
            for (const v of Object.values(mat))
              if (v instanceof T.Texture) {
                if (includeMaterials) seen.add(v);
                if (
                  typeof ImageBitmap !== "undefined" &&
                  v.image instanceof ImageBitmap
                )
                  images.add(v.image);
              }
          }
        }
      });
    seen.forEach((o) => o.dispose());
    images.forEach((i) => i.close());
  }
  const failed = [...imageJobs, ...meshJobs].find(
    (job) => job.status === "rejected",
  );
  if (signal?.aborted || (failed && failed.status === "rejected")) {
    textures.forEach((t) => t.dispose());
    disposeSource(true);
    throw new Error(
      "Portal Valley assets unavailable: " +
        String(failed?.status === "rejected" ? failed.reason : "cancelled"),
    );
  }
  try {
    const [
      ground,
      normal,
      rough,
      rock,
      rockNormal,
      sky,
      impostor,
      broadleaf,
      moss,
      panorama,
    ] = imageJobs.map(
      (job) => (job as PromiseFulfilledResult<T.Texture>).value,
    );
    const [tree, fern, boulder, lowBoulder] = meshJobs.map(
      (job) => (job as PromiseFulfilledResult<T.Object3D>).value,
    );
    for (const tex of [ground, normal, rough, rock, rockNormal, moss]) {
      tex.wrapS = tex.wrapT = T.RepeatWrapping;
      tex.anisotropy = 4;
    }
    for (const tex of [ground, rock, impostor, broadleaf, moss, panorama])
      tex.colorSpace = T.SRGBColorSpace;
    sky.mapping = T.EquirectangularReflectionMapping;
    panorama.mapping = T.EquirectangularReflectionMapping;
    scene.background = panorama;
    scene.environment = sky;
    scene.environmentIntensity = 0.37;
    scene.fog = new T.FogExp2(0x809194, 0.0066);
    const hemi = new T.HemisphereLight(0xd4e3f4, 0x716348, 1.05),
      sun = new T.DirectionalLight(0xffedcf, 2.08);
    // Direction measured from the brightest texel of the co-oriented radiance panorama.
    sun.position.set(-18.6, 30.9, -25);
    sun.target.position.set(-3, 0, -5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -28;
    sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 26;
    sun.shadow.camera.bottom = -26;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 99;
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.00032;
    sun.shadow.autoUpdate = false;
    sun.shadow.needsUpdate = true;
    scene.add(hemi, sun, sun.target);
    const surfaces = { ground, normal, rough, rock, rockNormal, moss };
    const dressing = dressValley(
      scene,
      tree,
      fern,
      boulder,
      lowBoulder,
      impostor,
      broadleaf,
      tier,
    );
    scene.add(makeGround(surfaces, dressing.shade));
    const arch = addArch(scene, surfaces, dressing.obstacles);
    const water = makeStream(scene, panorama, rock);
    let current: ValleyTier | undefined;
    function setQuality(q: ValleyTier) {
      if (current === q) return;
      current = q;
      sun.castShadow = q !== "Low";
      const size = q === "High" ? 2048 : 1024;
      if (sun.shadow.mapSize.x !== size) {
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
        sun.shadow.mapSize.set(size, size);
      }
      sun.shadow.needsUpdate = true;
      dressing.setQuality(q);
      water.setQuality(q);
    }
    setQuality(tier);
    return {
      scene,
      gates: [arch.gate] as T.Object3D[],
      height: terrainHeight,
      limit: 29,
      update(t: number, player?: T.Vector3) {
        if (dressing.update(t, player) && current !== "Low")
          sun.shadow.needsUpdate = true;
        arch.update(t);
        water.update(t);
      },
      setQuality,
      resolveMove(previous: T.Vector3, next: T.Vector3) {
        resolveObstacles(dressing.obstacles, previous, next);
      },
      disposeExtras() {
        sun.shadow.dispose();
        disposeSource(true);
        textures.forEach((o) => o.dispose());
      },
    };
  } catch (error) {
    scene.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.geometry.dispose();
        for (const m of [o.material].flat()) m.dispose();
        if (o instanceof T.InstancedMesh) o.dispose();
      }
    });
    textures.forEach((o) => o.dispose());
    disposeSource(true);
    throw error;
  }
}
