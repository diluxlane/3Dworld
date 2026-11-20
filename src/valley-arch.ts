import * as T from "three";
import { portal, terrainHeight, type ValleySurfaces } from "./valley-ground";
import type { Obstacle } from "./valley-dressing";

// Voussoirs carved along two radii. Each exposed face has its own UVs and bevel ring.
function wedge(
  a: number,
  b: number,
  inner: number,
  outer: number,
  depth: number,
) {
  const corners = [
    new T.Vector2(Math.cos(a) * inner, Math.sin(a) * inner),
    new T.Vector2(Math.cos(a) * outer, Math.sin(a) * outer),
    new T.Vector2(Math.cos(b) * outer, Math.sin(b) * outer),
    new T.Vector2(Math.cos(b) * inner, Math.sin(b) * inner),
  ];
  const shape = new T.Shape(corners);
  const g = new T.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.038,
    bevelSize: 0.034,
    bevelSegments: 1,
    curveSegments: 1,
    steps: 1,
  });
  g.translate(0, 0, -depth * 0.5);
  return g;
}
export function addArch(
  scene: T.Scene,
  maps: ValleySurfaces,
  obstacles: Obstacle[],
) {
  const root = new T.Group();
  root.position.set(
    portal.x,
    Math.min(
      terrainHeight(portal.x - 1.88, portal.z),
      terrainHeight(portal.x + 1.88, portal.z),
    ) - 0.1,
    portal.z,
  );
  scene.add(root);
  const stone = new T.MeshStandardMaterial({
    map: maps.rock,
    normalMap: maps.rockNormal,
    normalScale: new T.Vector2(0.62, 0.62),
    roughness: 0.84,
    color: 0xc6c8bd,
    metalness: 0,
  });
  stone.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
  float gray=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(gray*.98,gray*1.08,gray*1.04),.80)*1.42;`,
    );
  };
  const bronze = new T.MeshStandardMaterial({
    color: 0x636354,
    metalness: 0.55,
    roughness: 0.45,
  });
  // One merged material draw would suffice, but the keystone and trim have a different appearance.
  const consolidated: T.BufferGeometry[] = [];
  const rise = 1.85,
    radius = 1.63;
  for (let i = 0; i < 13; i++) {
    const key = i === 6;
    const g = wedge(
      (i * Math.PI) / 13 + 0.009,
      ((i + 1) * Math.PI) / 13 - 0.009,
      radius - (key ? 0.06 : 0),
      2.13 + (key ? 0.15 : 0.045 * Math.sin(i * 17)),
      key ? 0.99 : 0.82,
    );
    g.translate(0, rise, 0);
    consolidated.push(g);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const g = new T.BoxGeometry(
        0.54 + (i === 0 ? 0.25 : 0),
        0.45,
        0.83 + (i === 0 ? 0.19 : 0),
      ).toNonIndexed();
      g.translate(side * 1.88, 0.22 + 0.465 * i, 0);
      consolidated.push(g);
    }
    obstacles.push({ x: portal.x + side * 1.88, z: portal.z, radius: 0.41 });
  }
  // All keystones are unindexed triangles; combine common position/normal/UV streams.
  const merged = new T.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const arrays = consolidated.map(
      (g) => g.getAttribute(name).array as Float32Array,
    );
    const target = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
    let at = 0;
    for (const arr of arrays) {
      target.set(arr, at);
      at += arr.length;
    }
    merged.setAttribute(
      name,
      new T.BufferAttribute(target, name === "uv" ? 2 : 3),
    );
  }
  consolidated.forEach((g) => g.dispose());
  const masonry = new T.Mesh(merged, stone);
  masonry.castShadow = masonry.receiveShadow = true;
  root.add(masonry);
  const band = new T.Mesh(
    new T.TorusGeometry(radius + 0.035, 0.034, 6, 64, Math.PI),
    bronze,
  );
  band.position.set(0, rise, 0.43);
  root.add(band);
  const opening = new T.Shape();
  opening.moveTo(-radius, 0);
  opening.lineTo(radius, 0);
  opening.lineTo(radius, rise);
  opening.absarc(0, rise, radius, 0, Math.PI, false);
  opening.closePath();
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec2 p;void main(){p=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 p;uniform float time;void main(){float d=p.y>1.85?1.63-length(vec2(p.x,p.y-1.85)):1.63-abs(p.x);float rim=exp(-18.*max(d,0.));
 float sheet=sin(p.y*3.1+p.x*2.+.85*sin(p.x*3.-.42*time)+time*.5);float stars=pow(max(0.,sin(p.x*117.)*cos(p.y*183.)),54.);
 vec3 c=mix(vec3(.11,.24,.28),vec3(.47,.76,.75),rim)+.12*sheet*vec3(.2,.5,.5)+.48*stars;
 gl_FragColor=vec4(c,.35+.47*rim+.17*stars);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`,
  });
  const veil = new T.Mesh(new T.ShapeGeometry(opening, 36), material);
  veil.position.z = 0.03;
  veil.userData.place = "earth";
  root.add(veil);
  return {
    gate: veil,
    update: (t: number) => {
      material.uniforms.time.value = t;
    },
  };
}
