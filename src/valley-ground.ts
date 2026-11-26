import * as T from "three";

export const waterLevel = -0.24;
export const portal = { x: -6.1, z: -17.8 };
export const riverX = (z: number) =>
  0.9 + 3.2 * Math.sin(z * 0.066 + 0.25) + 0.8 * Math.sin(z * 0.16);
export const trailX = (z: number) =>
  -7.2 + 0.94 * Math.sin(z * 0.21 - 0.32) + 0.82 * Math.cos(z * 0.103);
export const riverWidth = (z: number) => 3.3 + 0.46 * Math.sin(z * 0.21);
const smooth = T.MathUtils.smoothstep;

function hash(x: number, y: number) {
  let h = Math.imul(x + 1287, 374761393) + Math.imul(y - 391, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, z: number) {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const sx = smooth(x - ix, 0, 1),
    sz = smooth(z - iz, 0, 1);
  return T.MathUtils.lerp(
    T.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), sx),
    T.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), sx),
    sz,
  );
}
function shapeTerrain(x: number, z: number) {
  const a = Math.atan2(x, z);
  const d = Math.hypot(x, z * 0.84);
  const streamDistance = Math.abs(x - riverX(z));
  const bank = smooth(
    streamDistance,
    riverWidth(z) - 1.15,
    riverWidth(z) + 1.35,
  );
  const floor =
    -0.88 +
    1.53 * bank +
    0.18 * Math.sin(z * 0.26 + x * 0.34) * bank +
    0.42 * noise(x * 0.28, z * 0.26) * bank +
    0.12 * noise(x * 0.91, z * 0.91) * bank;
  const wall = smooth(d, 23, 71);
  // Two folded ridgelines. The saddle above the upstream gate preserves the view of the sky.
  const saddle =
    1 - 0.48 * Math.exp(-Math.pow((x + 10) / 25, 2)) * smooth(-z, 24, 62);
  const first =
    9 + 9 * noise(x * 0.046 + 3, z * 0.046) + 8 * noise(x * 0.098, z * 0.098);
  const crest = Math.max(0, 1 - Math.abs(d - 66 - 7 * Math.sin(4 * a)) / 34);
  const far = Math.max(0, 1 - Math.abs(d - 126 - 12 * Math.sin(5 * a)) / 34);
  const folds =
    noise(x * 0.12, z * 0.095) * 0.58 +
    noise(x * 0.24, z * 0.19) * 0.27 +
    noise(x * 0.49, z * 0.35) * 0.15;
  const ridges =
    8 * (1 - Math.abs(folds * 2 - 1)) +
    4 *
      Math.abs(Math.sin(x * 0.115 + z * 0.089 + 3 * noise(x * 0.05, z * 0.05)));
  const mountain =
    saddle *
    (crest * (first + ridges) + far * (37 + 28 * noise(x * 0.047, z * 0.047)));
  const natural =
    floor +
    smooth(streamDistance, 8, 24) *
      (1.5 * noise(x * 0.12, z * 0.1) + 0.7 * Math.sin(z * 0.17 + x * 0.086)) +
    wall * mountain * 0.2;
  const terrace = smooth(Math.hypot(x - portal.x, z - portal.z), 2.8, 4.6);
  return T.MathUtils.lerp(
    1.75 + 0.04 * Math.sin(x * 0.32 + z * 0.23),
    natural,
    terrace,
  );
}

// Nonuniform grid puts sub-meter cells on the path, and progressively larger cells on distant slopes.
const half: number[] = [0];
for (let i = 1; i <= 35; i++) half.push(i * 0.85);
for (let i = 1; i <= 24; i++) half.push(29.75 + i * 1.7);
for (let i = 1; i <= 22; i++) half.push(70.55 + i * 4.3);
const axis = half
    .slice(1)
    .reverse()
    .map((v) => -v)
    .concat(half),
  size = axis.length;

const elevations = Float32Array.from(
  axis.flatMap((z) => axis.map((x) => shapeTerrain(x, z))),
);
function cell(v: number) {
  let lo = 0,
    hi = size - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (axis[m] > v) hi = m;
    else lo = m;
  }
  return lo;
}
export function terrainHeight(x: number, z: number) {
  const ix = cell(x),
    iz = cell(z),
    a = ix + iz * size;
  const u = T.MathUtils.clamp((x - axis[ix]) / (axis[ix + 1] - axis[ix]), 0, 1);
  const v = T.MathUtils.clamp((z - axis[iz]) / (axis[iz + 1] - axis[iz]), 0, 1);
  if (u + v <= 1)
    return (
      elevations[a] * (1 - u - v) +
      elevations[a + 1] * u +
      elevations[a + size] * v
    );
  return (
    elevations[a + 1] * (1 - v) +
    elevations[a + size] * (1 - u) +
    elevations[a + size + 1] * (u + v - 1)
  );
}
export interface ValleySurfaces {
  ground: T.Texture;
  normal: T.Texture;
  rough: T.Texture;
  rock: T.Texture;
  rockNormal: T.Texture;
  moss: T.Texture;
}
export function makeGround(
  maps: ValleySurfaces,
  shade: (x: number, z: number) => number,
) {
  const positions: number[] = [],
    uv: number[] = [],
    blend: number[] = [],
    indices: number[] = [];
  for (const z of axis)
    for (const x of axis) {
      const y = elevations[positions.length / 3];
      const dx = (terrainHeight(x + 0.25, z) - terrainHeight(x - 0.25, z)) * 2,
        dz = (terrainHeight(x, z + 0.25) - terrainHeight(x, z - 0.25)) * 2;
      const slope = Math.hypot(dx, dz);
      const path =
        1 -
        smooth(
          Math.abs(x - trailX(z)) + 0.24 * (noise(x * 0.8, z * 0.8) - 0.5),
          0.76,
          1.75,
        );
      const shore =
        1 - smooth(Math.abs(x - riverX(z)) - riverWidth(z), -0.45, 1.1);
      const stone = Math.max(
        shore * 0.62,
        smooth(slope + 0.3 * noise(x * 0.21, z * 0.21), 0.53, 1.34),
      );
      positions.push(x, y, z);
      uv.push(x * 0.42, z * 0.42);
      blend.push(stone, path, noise(x * 0.19, z * 0.19), shade(x, z));
    }
  for (let z = 0; z < size - 1; z++)
    for (let x = 0; x < size - 1; x++) {
      const a = z * size + x;
      indices.push(a, a + size, a + 1, a + 1, a + size, a + size + 1);
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setAttribute("landMix", new T.Float32BufferAttribute(blend, 4));
  g.setIndex(indices);
  g.computeVertexNormals();
  const m = new T.MeshStandardMaterial({
    map: maps.ground,
    normalMap: maps.normal,
    roughnessMap: maps.rough,
    roughness: 1,
    metalness: 0,
    normalScale: new T.Vector2(0.68, 0.68),
  });
  m.onBeforeCompile = (s) => {
    s.uniforms.mossMap = { value: maps.moss };
    s.uniforms.stoneMap = { value: maps.rock };
    s.uniforms.stoneNormal = { value: maps.rockNormal };
    s.vertexShader = s.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec4 landMix; varying vec4 vLand; varying vec3 vGround;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvLand=landMix;vGround=position;",
      );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nuniform sampler2D stoneMap,stoneNormal,mossMap; varying vec4 vLand;varying vec3 vGround;",
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <map_fragment>",
      `
  vec3 soil=texture2D(map,vMapUv).rgb;
  vec2 planar=vGround.xz*.23+vec2(vGround.y*.14,vGround.y*.25);
  vec3 crag=texture2D(stoneMap,planar).rgb;
  vec3 moss=texture2D(mossMap,vMapUv*.81).rgb;
  float fieldMask=smoothstep(.15,.74,vLand.z+sin(vGround.x*.17+vGround.z*.11)*.16);
  float altitude=smoothstep(10.,28.,vGround.y);
  float luma=dot(crag,vec3(.2126,.7152,.0722));
  crag=mix(crag,vec3(luma*.89,luma*.99,luma*1.09),.38+.51*altitude);
  vec3 trail=mix(soil,crag,.48)*vec3(1.29,1.04,.80);
  soil=mix(soil*vec3(.75,.90,.64),moss,.51+.40*fieldMask);
  diffuseColor.rgb*=mix(mix(soil,trail,vLand.y),crag,vLand.x)*mix(.82,1.10,vLand.z)*vLand.w;`,
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `
   vec3 closeNormal=texture2D(normalMap,vNormalMapUv).xyz*2.-1.;
   vec3 rockNormal=texture2D(stoneNormal,planar).xyz*2.-1.;
   vec3 mixNormal=mix(closeNormal,rockNormal,vLand.x);mixNormal.xy*=normalScale;normal=normalize(tbn*mixNormal);`,
    );
  };
  const ground = new T.Mesh(g, m);
  ground.receiveShadow = true;
  return ground;
}

/** Low keeps every cell under the player's feet, decimating only the surrounding hills. */
export function makeLowGround(full: T.Mesh, maps: ValleySurfaces) {
  const keep = axis
    .map((v, i) =>
      Math.abs(v) <= 29.76 || i === 0 || i === size - 1 || i % 6 === 0 ? i : -1,
    )
    .filter((i) => i !== -1);
  const indices: number[] = [];
  for (let row = 0; row < keep.length - 1; row++)
    for (let col = 0; col < keep.length - 1; col++) {
      const west = keep[col],
        east = keep[col + 1],
        south = keep[row] * size,
        north = keep[row + 1] * size;
      indices.push(
        south + west,
        north + west,
        south + east,
        south + east,
        north + west,
        north + east,
      );
    }
  const geo = new T.BufferGeometry();
  for (const name of ["position", "uv", "normal", "landMix"])
    geo.setAttribute(name, full.geometry.getAttribute(name));
  geo.setIndex(indices);
  // Bake the sun direction, slope blend and canopy shade per vertex. Only two photo samples are needed per pixel.
  const mat = new T.ShaderMaterial({
    uniforms: { soil: { value: maps.ground }, moss: { value: maps.moss } },
    vertexShader: `attribute vec4 landMix;varying vec2 coord;varying vec4 land;
 void main(){
 vec4 eye=modelViewMatrix*vec4(position,1.);
 float sunlight=max(dot(normalize(normal),normalize(vec3(-.39,.773,-.50))),0.);
 float cover=clamp(.60+.48*landMix.z-.65*landMix.x-landMix.y,0.,1.);
 land=vec4(cover,(.42+.94*sunlight)*landMix.w*(.82+.28*landMix.z),landMix.y,1.-exp(-.00004356*eye.z*eye.z));
 coord=uv;gl_Position=projectionMatrix*eye;}`,
    fragmentShader: `uniform sampler2D soil,moss;varying vec2 coord;varying vec4 land;
 void main(){vec3 base=mix(texture2D(soil,coord).rgb*mix(vec3(.78,.87,.69),vec3(1.16,.94,.74),land.z),texture2D(moss,coord*.81).rgb,land.x);
 gl_FragColor=vec4(mix(base*land.y,vec3(.215,.283,.296),land.w),1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`,
  });
  return new T.Mesh(geo, mat);
}
