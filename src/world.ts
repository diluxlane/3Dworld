import * as T from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { earth, sky, noise } from "./sky";
import { worlds } from "./catalog";

const tau = Math.PI * 2;
function random(seed: number) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function relief(x: number, z: number) {
  return (
    Math.sin(x * 0.23 + z * 0.07) * 0.52 +
    Math.sin(z * 0.51 - x * 0.17) * 0.25 +
    Math.cos(x * 1.3 + z * 0.6) * 0.1
  );
}
export function floorAt(id: number, x: number, z: number) {
  if (id === 0 || id >= 4) return 0;
  const r = relief(x, z);
  if (id === 1) return r * 0.9 - Math.max(0, -z - 13) * 2.8;
  if (id === 2)
    return (
      0.5 +
      r * 0.65 +
      Math.max(0, Math.abs(x) - 7) * (0.9 + 0.32 * Math.sin(z * 0.22))
    );
  return r * 0.7 + 0.19 * Math.sin(x * 0.48);
}
export function buildWorld(id: number) {
  const scene = new T.Scene(),
    gates: T.Object3D[] = [],
    rng = random(4802 + id);
  const animated: ((t: number) => void)[] = [];
  const accent = new T.Color(worlds[id].accent);
  const fog = [
    "#746180",
    "#9f8990",
    "#507478",
    "#766381",
    "#303a54",
    "#23404a",
  ][id];
  scene.fog = new T.FogExp2(fog, id === 1 ? 0.006 : 0.014);
  scene.add(sky(id), new T.HemisphereLight(0xffe5ee, 0x65586d, 1.8));
  const light = new T.DirectionalLight(0xffdbbe, 2.3);
  light.position.set(-16, 22, -12);
  scene.add(light);
  function solid(
    g: T.BufferGeometry,
    color: T.ColorRepresentation,
    x: number,
    y: number,
    z: number,
  ) {
    const m = new T.Mesh(
      g,
      new T.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true }),
    );
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  }
  const terrain = new T.PlaneGeometry(145, 145, 165, 165);
  terrain.rotateX(-Math.PI / 2);
  const a = terrain.attributes.position,
    colors = [],
    base = new T.Color(
      ["#302838", "#383544", "#35554e", "#34394a", "#242737", "#182e34"][id],
    );
  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i),
      z = a.getZ(i),
      h = floorAt(id, x, z);
    a.setY(i, h - 0.04);
    const lane = Math.exp(-Math.pow((x - 3 * Math.sin(z * 0.14)) / 2, 2));
    const c = base
      .clone()
      .multiplyScalar(0.71 + 0.3 * relief(x, z) + rng() * 0.3);
    if (id === 3) c.lerp(new T.Color("#978aac"), lane * 0.6);
    colors.push(c.r, c.g, c.b);
  }
  terrain.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  terrain.computeVertexNormals();
  const surface = new T.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
  });
  if (id === 1) {
    surface.onBeforeCompile = (shader) => {
      shader.vertexShader =
        "varying vec3 basalt;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n basalt=position;",
        );
      shader.fragmentShader =
        "varying vec3 basalt;\n" +
        noise +
        shader.fragmentShader.replace(
          "#include <color_fragment>",
          `#include <color_fragment>
      float grit=fb(basalt*4.2);float seam=abs(sin(basalt.x*.56+basalt.z*.29+fb(basalt*.35)*5.));
      diffuseColor.rgb*=.48+grit*1.35+smoothstep(.08,.75,seam)*.38;
      diffuseColor.rgb+=pow(1.-seam,20.)*vec3(.075,.047,.035);`,
        );
    };
  }
  scene.add(new T.Mesh(terrain, surface));
  // Layered ridgelines use close and distant silhouettes with independent profiles.
  for (let layer = 0; layer < 3; layer++) {
    const geo = new T.PlaneGeometry(1, 1, 220, 5),
      p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const ang = p.getX(i) * tau,
        v = p.getY(i) + 0.5;
      const radius = 53 + layer * 20 + v * 8,
        variation =
          Math.sin(ang * 7 + layer) * 3 +
          Math.cos(ang * 13 - layer) * 2 +
          Math.sin(ang * 29) * 1.3;
      let h =
        6 + layer * 2.2 + variation + Math.abs(Math.sin(ang * 3 + layer)) * 9;
      if (id === 1 && Math.cos(ang) > 0.1) h = -22;
      p.setXYZ(i, Math.sin(ang) * radius, -4 + v * h, -Math.cos(ang) * radius);
    }
    geo.computeVertexNormals();
    const m = solid(geo, ["#494053", "#595169", "#706479"][layer], 0, 0, 0);
    m.material.side = T.DoubleSide;
  }
  function ring(
    x: number,
    y: number,
    z: number,
    r: number,
    color: T.Color,
    rx = 0,
    ry = 0,
  ) {
    const m = new T.Mesh(
      new T.TorusGeometry(r, 0.047, 10, 112),
      new T.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.6) }),
    );
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    scene.add(m);
    return m;
  }
  function gateway(index: number, x: number, z: number, r: number) {
    const g = new T.Group();
    g.position.set(x, floorAt(id, x, z) + r, z);
    g.rotation.y = Math.atan2(-x, 9 - z);
    scene.add(g);
    const tint = new T.Color(worlds[index].accent);
    const frame = new T.Mesh(
      new T.TorusGeometry(r, 0.18, 8, 80),
      new T.MeshStandardMaterial({
        color: 0x534753,
        metalness: 0.55,
        roughness: 0.34,
      }),
    );
    const inner = new T.Mesh(
      new T.TorusGeometry(r - 0.12, 0.042, 8, 100),
      new T.MeshBasicMaterial({ color: tint }),
    );
    const gate = new T.Mesh(
      new T.CircleGeometry(r - 0.14, 80),
      new T.ShaderMaterial({
        side: T.DoubleSide,
        uniforms: { t: { value: 0 }, tint: { value: tint } },
        vertexShader: `varying vec2 v;void main(){v=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `
    varying vec2 v;uniform vec3 tint;uniform float t;${noise}
    void main(){float r=length(v);float n=fb(vec3(v*3.,t*.09));float swirl=sin(10.*r-4.*n+atan(v.y,v.x)*2.-t*.4);
    vec3 col=mix(vec3(.022,.019,.064),tint,(n*n*.7+pow(r,5.)*.72)+.10*swirl);
    gl_FragColor=vec4(col,1.);
    #include <colorspace_fragment>
    }`,
      }),
    );
    gate.userData.destination = index;
    g.add(frame, inner, gate);
    gates.push(gate);
    const plaque = document.createElement("canvas");
    plaque.width = 640;
    plaque.height = 72;
    const pen = plaque.getContext("2d")!;
    pen.fillStyle = "rgba(21,17,32,.82)";
    pen.fillRect(0, 0, 640, 72);
    pen.font = "500 32px sans-serif";
    pen.fillStyle = "#fff5fa";
    pen.textAlign = "center";
    pen.fillText(index === 0 ? "Return to hub" : worlds[index].name, 320, 48);
    const map = new T.CanvasTexture(plaque);
    map.colorSpace = T.SRGBColorSpace;
    const label = new T.Sprite(
      new T.SpriteMaterial({ map, transparent: true, depthWrite: false }),
    );
    label.position.y = r + 0.62;
    label.scale.set(4.6, 0.52, 1);
    g.add(label);
    animated.push((t) => (gate.material.uniforms.t.value = t));
    solid(
      new T.CylinderGeometry(r * 1.08, r * 1.22, 0.34, 64),
      0x4e4758,
      x,
      g.position.y - r,
      z,
    );
  }
  if (id === 0) {
    for (let i = 0; i < 5; i++) {
      const angle = (i - 2) * 0.47;
      gateway(
        i + 1,
        Math.sin(angle) * 13,
        7 - Math.cos(angle) * 16,
        i === 2 ? 3.1 : 2.65,
      );
    }
    for (let i = 0; i < 4; i++)
      ring(
        0,
        0.02 + i * 0.006,
        2,
        4 + i * 3.4,
        new T.Color("#7c6c80"),
        Math.PI / 2,
      );
  }
  if (id !== 0 && id !== 2) gateway(0, 0, 19, 2.35);
  if (id === 1) {
    scene.add(earth());
    const strata = new T.Mesh(
      new T.PlaneGeometry(230, 150),
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { t: { value: 0 } },
        vertexShader: `varying vec2 uvCloud;void main(){uvCloud=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `varying vec2 uvCloud;uniform float t;${noise}
      void main(){vec3 p=vec3(uvCloud*vec2(18.,11.),t*.014);float n=fb(p+fb(p*1.8));float density=smoothstep(.32,.64,n);
      vec3 c=mix(vec3(.24,.24,.38),vec3(.98,.72,.57),smoothstep(.35,.67,n));
      gl_FragColor=vec4(c,density*smoothstep(0.,.15,uvCloud.y)*(1.-smoothstep(.78,1.,uvCloud.y))*.84);
      #include <colorspace_fragment>
      }`,
      }),
    );
    strata.rotation.x = -Math.PI / 2;
    strata.position.set(0, -7, -82);
    scene.add(strata);
    animated.push((t) => (strata.material.uniforms.t.value = t));
  }
  if (id === 2) {
    gateway(0, -2, -18, 4);
    const water = new Reflector(new T.PlaneGeometry(6, 92), {
      color: 0x8db8b6,
      textureWidth: 384,
      textureHeight: 384,
      clipBias: 0.003,
      multisample: 0,
    });
    const mirror = water.material as T.ShaderMaterial;
    mirror.uniforms.clock = { value: 0 };
    mirror.fragmentShader =
      "uniform float clock;\n" +
      mirror.fragmentShader.replace(
        "texture2DProj( tDiffuse, vUv )",
        "texture2D(tDiffuse, vUv.xy/vUv.w + .0028*vec2(sin(vUv.y*92.+clock),cos(vUv.x*115.+clock*.8)))",
      );
    water.rotation.x = -Math.PI / 2;
    water.position.set(-2, 0.94, -8);
    scene.add(water);
    animated.push((t) => (mirror.uniforms.clock.value = t));
  }
  if (id === 0 || id === 3) {
    const moon = new T.Mesh(
      new T.SphereGeometry(6, 64, 48),
      new T.MeshStandardMaterial({ color: 0xf4d7d9, roughness: 1 }),
    );
    moon.position.set(32, 28, -88);
    scene.add(moon);
    const halo = ring(32, 28, -88, 9, new T.Color("#c1a1ca"));
    halo.rotation.set(1.15, 0.22, -0.36);
  }
  const count = id === 3 ? 2400 : id === 2 ? 460 : 160;
  const stones = new T.InstancedMesh(
    new T.IcosahedronGeometry(1, 0),
    new T.MeshStandardMaterial({ flatShading: true }),
    count,
  );
  const dummy = new T.Object3D(),
    stoneColor = new T.Color();
  for (let i = 0; i < count; i++) {
    let x = (rng() - 0.5) * 82,
      z = (rng() - 0.5) * 85;
    if (id === 3 && Math.abs(x - 3 * Math.sin(z * 0.14)) < 2) x += 4;
    if ((id === 0 || id >= 4) && Math.abs(x) < 18 && Math.abs(z) < 19)
      x += x < 0 ? -22 : 22;
    if (id === 2 && x > -6 && x < 2) x += 9;
    const size = 0.13 + rng() ** 2 * (id === 3 ? 0.5 : id === 1 ? 1.1 : 2.2);
    dummy.position.set(x, floorAt(id, x, z) + size * 0.25, z);
    dummy.scale.set(
      size * (id === 3 ? 0.25 : 1),
      size * (id === 3 ? 1.8 : 1),
      size * 0.68,
    );
    dummy.rotation.set(rng() * 0.3, rng() * tau, rng() * 0.3);
    dummy.updateMatrix();
    stones.setMatrixAt(i, dummy.matrix);
    stoneColor.setHSL(
      id === 3 ? 0.74 + rng() * 0.15 : id === 2 ? 0.37 + rng() * 0.09 : 0.68,
      id === 3 ? 0.49 : 0.18,
      id === 3 ? 0.53 + rng() * 0.27 : 0.21 + rng() * 0.14,
    );
    stones.setColorAt(i, stoneColor);
  }
  scene.add(stones);
  // Distant outcrops keep a simple silhouette. Nearby ones reveal smaller facets.
  for (let i = 0; i < 12; i++) {
    const angle = (i * tau) / 12,
      distance = 22 + (i % 3) * 4;
    const x = Math.cos(angle) * distance,
      z = Math.sin(angle) * distance;
    if (id === 1 && z < 0) continue;
    const lod = new T.LOD(),
      material = new T.MeshStandardMaterial({
        color: id === 2 ? 0x456e58 : 0x51485f,
        flatShading: true,
      });
    for (const [detail, threshold] of [
      [1, 0],
      [0, 25],
    ]) {
      const rock = new T.Mesh(new T.IcosahedronGeometry(1, detail), material);
      lod.addLevel(rock, threshold);
    }
    lod.position.set(x, floorAt(id, x, z), z);
    lod.scale.set(2 + (i % 3), 2 + (i % 4), 3);
    scene.add(lod);
  }
  if (id === 2) {
    const trees = new T.InstancedMesh(
      new T.ConeGeometry(1, 3.4, 8, 2),
      new T.MeshStandardMaterial({ color: 0x41715f, flatShading: true }),
      720,
    );
    for (let i = 0; i < 240; i++) {
      const x = (6 + rng() * 31) * (rng() < 0.5 ? -1 : 1),
        z = rng() * 68 - 37,
        h = 0.7 + rng() ** 2 * 1.7;
      for (let j = 0; j < 3; j++) {
        const w = h * (1 - j * 0.2);
        dummy.position.set(x, floorAt(id, x, z) + h * (1.5 + j * 0.75), z);
        dummy.rotation.set(0, i * 0.49 + j, 0);
        dummy.scale.set(w, h * 0.83, w);
        dummy.updateMatrix();
        trees.setMatrixAt(i * 3 + j, dummy.matrix);
      }
    }
    scene.add(trees);
  }
  if (id === 3) {
    const stems = new T.InstancedMesh(
      new T.ConeGeometry(0.035, 1, 4),
      new T.MeshStandardMaterial({ color: 0x74968d }),
      800,
    );
    const flowers = new T.InstancedMesh(
      new T.OctahedronGeometry(0.1),
      new T.MeshBasicMaterial({ color: 0xffb6fb }),
      800,
    );
    for (let i = 0; i < 800; i++) {
      const z = rng() * 49 - 29,
        path = 3 * Math.sin(z * 0.14),
        x = path + (rng() < 0.5 ? -1 : 1) * (1.5 + rng() ** 2 * 16);
      const h = 0.35 + rng() * 0.6,
        y = floorAt(id, x, z);
      dummy.rotation.set(0, i, 0);
      dummy.scale.set(1, h, 1);
      dummy.position.set(x, y + h / 2, z);
      dummy.updateMatrix();
      stems.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(1.3, 0.7, 1.3);
      dummy.position.y = y + h;
      dummy.updateMatrix();
      flowers.setMatrixAt(i, dummy.matrix);
    }
    scene.add(stems, flowers);
  }
  const motes = new Float32Array((id === 3 ? 1300 : 290) * 3);
  for (let i = 0; i < motes.length; i += 3) {
    motes[i] = (rng() - 0.5) * 70;
    motes[i + 1] = 0.5 + rng() ** 2 * 16;
    motes[i + 2] = (rng() - 0.5) * 70;
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.BufferAttribute(motes, 3));
  const dust = new T.Points(
    geo,
    new T.PointsMaterial({
      color: accent,
      size: 0.07,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    }),
  );
  scene.add(dust);
  animated.push((t) => (dust.position.y = 0.18 * Math.sin(t * 0.45)));
  if (id >= 4) {
    solid(new T.CylinderGeometry(5, 5.3, 0.3, 80), 0x414755, 0, 0.1, -3);
    for (let i = 0; i < 3; i++)
      ring(0, 0.28, -3, 3.6 + i * 0.6, accent, Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const angle = (i * tau) / 12;
      solid(
        new T.BoxGeometry(0.28, 6, 0.28),
        0x596375,
        Math.sin(angle) * 11,
        3,
        -3 + Math.cos(angle) * 11,
      );
    }
  }
  return {
    scene,
    gates,
    update: (time: number) => animated.forEach((fn) => fn(time)),
    dispose: () => {
      scene.traverse((o) => {
        if (o instanceof Reflector) o.dispose();
        if (o instanceof T.Sprite) {
          o.material.map?.dispose();
          o.material.dispose();
        }
        if (o instanceof T.Mesh || o instanceof T.Points) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m: T.Material) => m.dispose());
          if (o instanceof T.InstancedMesh) o.dispose();
        }
      });
    },
  };
}
