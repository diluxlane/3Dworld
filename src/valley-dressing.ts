import * as T from "three";
import {
  terrainHeight,
  riverX,
  riverWidth,
  trailX,
  portal,
} from "./valley-ground";

export type ValleyTier = "Low" | "Balanced" | "High";
type Item = {
  x: number;
  y: number;
  z: number;
  size: number;
  turn: number;
  wide: number;
  tint: number;
};
export type Obstacle = { x: number; z: number; radius: number };
const TAU = Math.PI * 2;
function random(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function resolveObstacles(
  obstacles: Obstacle[],
  previous: T.Vector3,
  next: T.Vector3,
) {
  // Velocity per simulation step is bounded by the input system; slide along low-cost circular hulls.
  for (let iteration = 0; iteration < 2; iteration++)
    for (const object of obstacles) {
      const radius = object.radius + 0.26,
        dx = next.x - object.x,
        dz = next.z - object.z,
        dist2 = dx * dx + dz * dz;
      if (dist2 >= radius * radius) continue;
      if (dist2 < 0.00001) {
        next.x = previous.x;
        next.z = previous.z;
        continue;
      }
      const factor = radius / Math.sqrt(dist2);
      next.x = object.x + dx * factor;
      next.z = object.z + dz * factor;
    }
  next.y = terrainHeight(next.x, next.z);
}

function modelParts(root: T.Object3D, byWidth = false) {
  root.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(root),
    center = box.getCenter(new T.Vector3()),
    size = box.getSize(new T.Vector3());
  const unit = 1 / Math.max(0.001, byWidth ? Math.max(size.x, size.z) : size.y);
  const normalize = new T.Matrix4()
    .makeScale(unit, unit, unit)
    .multiply(
      new T.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z),
    );
  const parts: {
    geometry: T.BufferGeometry;
    material: T.Material | T.Material[];
  }[] = [];
  root.traverse((o) => {
    if (o instanceof T.Mesh)
      parts.push({
        geometry: o.geometry
          .clone()
          .applyMatrix4(normalize.clone().multiply(o.matrixWorld)),
        material: o.material,
      });
  });
  return parts;
}
type Parts = ReturnType<typeof modelParts>;
function batches(scene: T.Scene, parts: Parts, max: number, cast: boolean) {
  return parts.map(({ geometry, material }) => {
    const b = new T.InstancedMesh(geometry, material, max);
    b.count = 0;
    b.castShadow = cast;
    b.receiveShadow = true;
    b.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(b);
    return b;
  });
}
const dummy = new T.Object3D(),
  tint = new T.Color();
function fill(batches: T.InstancedMesh[], items: Item[], count: number) {
  for (const b of batches) {
    b.count = Math.min(count, items.length, b.instanceMatrix.count);
    for (let i = 0; i < b.count; i++) {
      const v = items[i];
      dummy.position.set(v.x, v.y, v.z);
      dummy.rotation.set(0, v.turn, 0);
      dummy.scale.set(v.size * v.wide, v.size, v.size * v.wide);
      dummy.updateMatrix();
      b.setMatrixAt(i, dummy.matrix);
      tint.setScalar(v.tint);
      b.setColorAt(i, tint);
    }
    b.instanceMatrix.needsUpdate = true;
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
    b.computeBoundingSphere();
  }
}
function grassClump() {
  const xyz: number[] = [],
    colors: number[] = [],
    idx: number[] = [];
  const rng = random(85);
  for (let i = 0; i < 9; i++) {
    const a = rng() * TAU,
      s = Math.sin(a),
      c = Math.cos(a),
      x = (rng() - 0.5) * 0.45,
      z = (rng() - 0.5) * 0.45,
      h = 0.16 + rng() * 0.38,
      w = 0.008 + rng() * 0.015,
      lean = 0.07 + rng() * 0.21;
    const start = xyz.length / 3;
    for (let j = 0; j < 3; j++) {
      const k = j / 2,
        ox = x + s * k * k * lean,
        oz = z + c * k * k * lean,
        width = w * (1 - k * 0.96);
      xyz.push(
        ox + c * width,
        k * h,
        oz - s * width,
        ox - c * width,
        k * h,
        oz + s * width,
      );
      for (let n = 0; n < 2; n++)
        colors.push(0.043 + 0.11 * k, 0.075 + 0.12 * k, 0.018 + 0.035 * k);
    }
    idx.push(
      start,
      start + 1,
      start + 2,
      start + 2,
      start + 1,
      start + 3,
      start + 2,
      start + 3,
      start + 4,
      start + 4,
      start + 3,
      start + 5,
    );
  }
  const g = new T.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute("position", new T.Float32BufferAttribute(xyz, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}
function pineCards(tex: T.Texture, width: number) {
  const g = new T.PlaneGeometry(width, 1);
  g.translate(0, 0.5, 0);
  const material = new T.MeshBasicMaterial({
    map: tex,
    alphaTest: 0.25,
    side: T.DoubleSide,
  });
  // Face the viewer around world up. The low-frequency sway only affects the tops.
  const clock = { value: 0 };
  material.onBeforeCompile = (s) => {
    s.uniforms.groveClock = clock;
    s.fragmentShader = s.fragmentShader.replace(
      "#include <map_fragment>",
      "#include <map_fragment>\ndiffuseColor.rgb=diffuseColor.rgb*1.42+vec3(.014,.026,.010);",
    );
    s.vertexShader = s.vertexShader.replace(
      "#include <common>",
      "#include <common>\nuniform float groveClock;",
    );
    s.vertexShader = s.vertexShader.replace(
      "#include <project_vertex>",
      `
    vec4 base=modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
    vec2 direction=normalize(cameraPosition.xz-base.xz+vec2(.00001));
    vec3 right=vec3(direction.y,0.,-direction.x);
    float scaleX=length(instanceMatrix[0].xyz), scaleY=length(instanceMatrix[1].xyz);
    vec3 worldVertex=base.xyz+right*position.x*scaleX+vec3(0.,position.y*scaleY,0.);
    worldVertex.x+=.035*sin(groveClock*.7+base.x*.3+base.z*.2)*position.y*position.y;
    vec4 mvPosition=viewMatrix*vec4(worldVertex,1.);
    gl_Position=projectionMatrix*mvPosition;`,
    );
  };
  return { parts: [{ geometry: g, material }], clock };
}
export function dressValley(
  scene: T.Scene,
  tree: T.Object3D,
  fern: T.Object3D,
  rock: T.Object3D,
  lowRock: T.Object3D,
  impostor: T.Texture,
  broadleaf: T.Texture,
  quality: ValleyTier,
) {
  const rng = random(6383),
    obstacles: Obstacle[] = [],
    trees: Item[] = [],
    ferns: Item[] = [],
    rocks: Item[] = [],
    grass: Item[] = [];
  const item = (x: number, z: number, size: number, wide = 1): Item => ({
    x,
    z,
    y: terrainHeight(x, z) - size * 0.023,
    size,
    turn: rng() * TAU,
    wide,
    tint: 0.72 + rng() * 0.28,
  });
  const canopyExclusion = (x: number, z: number) =>
    Math.hypot(x + 8, z - 7) < 4 ||
    Math.abs(x - trailX(z)) < 2.8 ||
    Math.hypot(x - portal.x, z - portal.z) < 4.5;
  for (let i = 0; i < 3600; i++) {
    const x = (rng() - 0.5) * 173,
      z = (rng() - 0.5) * 184,
      d = Math.hypot(x, z);
    if (
      d > 105 ||
      d < 4 ||
      canopyExclusion(x, z) ||
      Math.abs(x - riverX(z)) < riverWidth(z) + 1.2
    )
      continue;
    if (d < 26 && Math.abs(x + 8) < 2.5 && z > -9 && z < 8) continue;
    if (d > 46 && terrainHeight(x, z) > 29 && rng() < 0.62) continue;
    const sightline = Math.abs(x + 8) < 9 && z < -23;
    if (sightline && rng() < 0.58) continue;
    const size =
      (3.5 + rng() * 5.5 + (d > 41 ? 2 : 0)) * (sightline ? 0.48 : 1);
    if (trees.some((t) => Math.abs(t.x - x) < 2.1 && Math.abs(t.z - z) < 2.1))
      continue;
    trees.push(item(x, z, size, 0.74 + rng() * 0.32));
    if (Math.abs(x) < 31 && Math.abs(z) < 31)
      obstacles.push({ x, z, radius: size * 0.041 });
  }
  // Composition is anchored by two boulder groups on opposing banks, with smaller stones grading into the streambed.
  for (const [x, z, s] of [
    [-11, 1.5, 2.8],
    [-12.4, 0.4, 2.1],
    [-3.8, -0.4, 1.65],
    [-3.4, -8, 2.1],
    [-4.6, -19.7, 2.2],
    [4, -13, 3.6],
    [4.8, -14.6, 2.2],
    [-13, -12, 3.9],
    [-14, -10.5, 2.5],
    [7, 2, 3.5],
    [-9.18, -17.9, 2.15],
    [-9.67, -17.15, 1.3],
    [-9.7, -18.9, 1.9],
    [-8.65, -17.6, 1.1],
    [-4.05, -17.7, 0.87],
    [-3.72, -17.7, 1.62],
    [-3.48, -18.7, 2.05],
    [-3.03, -17.4, 1.16],
    [-9.3, -18.4, 0.76],
    [-8.85, -19.1, 0.55],
    [-3.8, -19.3, 1.45],
    [-2.2, -12.4, 0.98],
    [-3.45, -6, 0.42],
  ]) {
    rocks.push(item(x, z, s, 1));
  }
  for (let i = 0; i < 200; i++) {
    const z = (rng() - 0.5) * 64;
    const bank = rng() < 0.72;
    const x = bank
      ? riverX(z) + (rng() > 0.5 ? 1 : -1) * (riverWidth(z) - 1.8 + rng() * 3.1)
      : (rng() - 0.5) * 68;
    const clearance = Math.abs(x - trailX(z));
    const size =
      (clearance < 1.7 ? 0.07 : bank ? 0.16 : 0.38) +
      Math.pow(rng(), 2) * (clearance < 1.7 ? 0.12 : bank ? 1 : 2.4);
    rocks.push(item(x, z, size));
  }
  for (const r of rocks) r.y -= r.size * 0.12;
  for (let i = 0; i < 46; i++) {
    const side = i % 2 ? 1 : -1;
    const x = portal.x + side * (1.7 + rng() * 2.1),
      z = portal.z + (rng() - 0.5) * 3;
    ferns.push(item(x, z, 0.43 + rng() * 0.77));
  }
  for (const r of rocks)
    if (r.size > 0.64)
      obstacles.push({ x: r.x, z: r.z, radius: r.size * 0.38 * r.wide });
  for (let i = 0; i < 4800; i++) {
    const x = (rng() - 0.5) * 67,
      z = (rng() - 0.5) * 68;
    if (
      Math.abs(x - riverX(z)) < riverWidth(z) + 0.48 ||
      Math.abs(x - trailX(z)) < 1 ||
      Math.hypot(x - portal.x, z - portal.z) < 2
    )
      continue;
    if (ferns.length < 285 && rng() < 0.17)
      ferns.push(item(x, z, 0.4 + rng() * 0.58, 1.0 + rng() * 0.3));
    else grass.push(item(x, z, 0.51 + rng() * 1.05, 0.7 + rng() * 0.6));
  }
  const treeParts = modelParts(tree),
    fernParts = modelParts(fern),
    rockParts = modelParts(rock, true);
  const billboard = pineCards(impostor, 2 / 3),
    deciduous = pineCards(broadleaf, 1);
  const nearTrees = batches(scene, treeParts, 26, true),
    distantTrees = batches(scene, billboard.parts, trees.length, false);
  const broadTrees = batches(scene, deciduous.parts, trees.length, false);
  // Depth-test alpha cutouts after solid ground and boulders; hidden canopy fragments can be rejected early.
  for (const batch of [...distantTrees, ...broadTrees]) batch.renderOrder = 1;
  const undergrowth = batches(scene, fernParts, ferns.length, false);
  const boulders = batches(scene, rockParts, 14, true),
    farBoulders = batches(
      scene,
      modelParts(lowRock, true),
      rocks.length,
      false,
    );
  const grassBatches = batches(
    scene,
    [
      {
        geometry: grassClump(),
        material: new T.MeshLambertMaterial({
          vertexColors: true,
          side: T.DoubleSide,
        }),
      },
    ],
    grass.length,
    false,
  );
  let tier = quality,
    lodX = Infinity,
    lodZ = Infinity;
  function refresh(x: number, z: number) {
    const sort = (a: Item, b: Item) =>
      (a.x - x) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + (b.z - z) ** 2);
    trees.sort(sort);
    ferns.sort(sort);
    rocks.sort(sort);
    grass.sort(sort);
    const archCluster = (i: Item) =>
      Math.abs(i.x - portal.x) < 4.5 && Math.abs(i.z - portal.z) < 2.2;
    const close = tier === "Low" ? 1 : tier === "High" ? 14 : 7;
    const near = trees.slice(0, close);
    fill(nearTrees, near, near.length);
    const far = trees.slice(close);
    const pines: Item[] = [],
      leafy: Item[] = [];
    // Keep a representative stand on distant slopes at every quality. Truncating a distance-sorted array produces bald mountains.
    for (const tree of far) {
      const d = Math.hypot(tree.x - x, tree.z - z),
        factor = Math.abs(Math.sin(tree.turn * 177.91));
      if (
        d > (tier === "High" ? 38 : tier === "Low" ? 11 : 24) &&
        factor > (tier === "High" ? 0.94 : tier === "Low" ? 0.26 : 0.62)
      )
        continue;
      (tree.turn < 2.38 && tree.y < 19 ? leafy : pines).push(tree);
    }
    fill(distantTrees, pines, pines.length);
    fill(broadTrees, leafy, leafy.length);
    const fernCount = tier === "High" ? 90 : tier === "Low" ? 11 : 48;
    const archFerns = tier === "Low" ? 3 : 9;
    const nearFerns = ferns.slice(0, fernCount - archFerns);
    fill(
      undergrowth,
      nearFerns.concat(
        ferns
          .filter((v) => archCluster(v) && !nearFerns.includes(v))
          .slice(0, archFerns),
      ),
      fernCount,
    );
    const rockNear = tier === "High" ? 8 : tier === "Low" ? 1 : 5;
    fill(boulders, rocks, rockNear);
    const rockLimit = tier === "High" ? 140 : tier === "Low" ? 27 : 70;
    const midRocks = rocks.slice(rockNear, rockLimit - 12);
    const landmarkRocks = rocks.filter(
      (v) =>
        archCluster(v) &&
        !midRocks.includes(v) &&
        !rocks.slice(0, rockNear).includes(v),
    );
    fill(farBoulders, midRocks.concat(landmarkRocks), rockLimit);
    fill(
      grassBatches,
      grass,
      tier === "High" ? 1900 : tier === "Low" ? 130 : 920,
    );
    lodX = x;
    lodZ = z;
  }
  refresh(-8, 7);
  // Bake broad contact shade into terrain vertices. The hash grid bounds queries to neighboring canopies.
  const cells = new Map<string, Item[]>(),
    key = (x: number, z: number) => Math.floor(x / 8) + "," + Math.floor(z / 8);
  for (const v of trees.concat(rocks.filter((r) => r.size > 1))) {
    const k = key(v.x, v.z),
      arr = cells.get(k) ?? [];
    arr.push(v);
    cells.set(k, arr);
  }
  function shade(x: number, z: number) {
    let shade = 1;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        for (const v of cells.get(key(x + a * 8, z + b * 8)) ?? []) {
          const r = Math.max(0.7, v.size * 0.31);
          const d = ((x - v.x) ** 2 + (z - v.z) ** 2) / (r * r);
          if (d < 1)
            shade = Math.min(
              shade,
              0.42 + 0.58 * T.MathUtils.smoothstep(d, 0, 1),
            );
        }
      }
    return shade;
  }
  return {
    obstacles,
    shade,
    setQuality(v: ValleyTier) {
      tier = v;
      refresh(lodX, lodZ);
    },
    update(t: number, player?: T.Vector3) {
      billboard.clock.value = deciduous.clock.value = t;
      if (player && (player.x - lodX) ** 2 + (player.z - lodZ) ** 2 > 16) {
        refresh(player.x, player.z);
        return true;
      }
      return false;
    },
  };
}
