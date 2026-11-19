import * as T from "three";

type Floor = (x: number, z: number) => number;
export interface World {
  scene: T.Scene;
  spawn: T.Vector3;
  ground: Floor;
  radius: number;
  update: (seconds: number) => void;
  portals: T.Object3D[];
}

const TAU = Math.PI * 2;
const noiseGL = `
float hash(vec3 p){p=fract(p*.3183099+vec3(.11,.23,.37));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1)),f.x),f.y),f.z);}
float fbm(vec3 p){return .55*noise3(p)+.27*noise3(2.07*p+3.)+.13*noise3(4.14*p)+.05*noise3(8.4*p+7.);}
`;
const outputGL = `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;

function generator(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function stone(color: number, metalness = 0) {
  return new T.MeshStandardMaterial({
    color,
    metalness,
    roughness: 0.82,
    flatShading: true,
  });
}

function mount(
  scene: T.Object3D,
  geometry: T.BufferGeometry,
  material: T.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const mesh = new T.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

function sky(
  scene: T.Scene,
  top: number,
  horizon: number,
  light: number,
  sunX: number,
  sunY: number,
  starCount: number,
) {
  const sun = new T.Vector3(sunX, sunY, -1).normalize();
  const material = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    uniforms: {
      zenith: { value: new T.Color(top) },
      horizon: { value: new T.Color(horizon) },
      lightColor: { value: new T.Color(light) },
      sun: { value: sun },
    },
    vertexShader:
      "varying vec3 v; void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `varying vec3 v;uniform vec3 zenith,horizon,lightColor,sun;${noiseGL}
    void main(){vec3 d=normalize(v);float h=smoothstep(-.02,.66,d.y);
    vec3 col=mix(horizon,zenith,h);float n=fbm(d*vec3(3.,11.,3.)+4.);
    float band=exp(-abs(d.y-.19-d.x*.2)*4.5);
    col+=vec3(.023,.038,.075)*smoothstep(.3,.73,n)*band;
    float c=max(dot(d,sun),0.); col+=lightColor*(.18*pow(c,12.)+.48*pow(c,145.)+1.6*smoothstep(.9995,.99992,c));
    gl_FragColor=vec4(col,1.);${outputGL}}`,
  });
  const dome = mount(scene, new T.SphereGeometry(177, 48, 28), material);
  dome.renderOrder = -5;
  const rand = generator(10),
    data: number[] = [],
    colors: number[] = [];
  for (let i = 0; i < starCount; i++) {
    const a = rand() * TAU,
      y = 0.025 + rand() * 0.974,
      r = Math.sqrt(1 - y * y),
      k = 0.45 + 0.5 * rand();
    data.push(150 * r * Math.cos(a), 150 * y, 150 * r * Math.sin(a));
    colors.push(k * 0.84, k * 0.91, k);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(data, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  scene.add(
    new T.Points(
      g,
      new T.PointsMaterial({
        size: 0.16,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        fog: false,
        depthWrite: false,
      }),
    ),
  );
}

function lights(scene: T.Scene, upper: number, lower: number, key: number) {
  scene.add(new T.HemisphereLight(upper, lower, 2));
  const sun = new T.DirectionalLight(key, 2.3);
  sun.position.set(12, 18, -13);
  scene.add(sun);
}

// Build one continuous mesh per ridge. The near silhouette has a broken crest,
// exposed sediment and sharp facets while the distant ridges dissolve into fog.
function ridges(scene: T.Scene, palette: number[], seed: number, peak: number) {
  const rand = generator(seed);
  for (let layer = 0; layer < 3; layer++) {
    const segments = 170,
      rows = 7,
      points: number[] = [],
      colors: number[] = [],
      idx: number[] = [];
    const radius = 70 - layer * 14;
    const phase = rand() * TAU;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * TAU;
      const shape =
        Math.sin(a * 7 + phase) * 0.18 +
        Math.cos(a * 13 - phase) * 0.16 +
        Math.sin(a * 27 + phase) * 0.085 +
        0.65;
      const pass = 0.5 + 0.5 * Math.abs(Math.sin(a));
      const crest = (peak + layer * 0.5) * shape * pass + 3;
      for (let j = 0; j < rows; j++) {
        const u = j / (rows - 1),
          r = radius + (u - 0.5) * 11 + 0.62 * Math.sin(a * 41 + u * 8);
        const y =
          -2 +
          crest * (1 - Math.abs(u - 0.67) * 1.52) +
          Math.sin(a * 50 + u * 17) * 0.46;
        points.push(r * Math.sin(a), y, -r * Math.cos(a));
        const c = new T.Color(palette[layer]).multiplyScalar(
          0.64 + 0.55 * u + 0.2 * Math.sin(u * 18 + a * 12),
        );
        colors.push(c.r, c.g, c.b);
        if (i < segments && j < rows - 1) {
          const p = i * rows + j;
          idx.push(p, p + 1, p + rows, p + 1, p + rows + 1, p + rows);
        }
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(points, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    mount(
      scene,
      g,
      new T.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        side: T.DoubleSide,
        roughness: 1,
      }),
    );
  }
}

function groundMesh(
  scene: T.Scene,
  floor: Floor,
  color: number,
  extent: number,
  seed: number,
) {
  const g = new T.PlaneGeometry(extent * 2, extent * 2, 84, 84);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const colors: number[] = [],
    rand = generator(seed),
    base = new T.Color(color);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      z = pos.getZ(i);
    pos.setY(i, floor(x, z));
    const c = base
      .clone()
      .multiplyScalar(
        0.72 + 0.22 * rand() + 0.14 * Math.sin(x * 0.6 + Math.cos(z * 0.4)),
      );
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  mount(
    scene,
    g,
    new T.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      flatShading: true,
    }),
  );
}

function stoneDeck(scene: T.Scene, radius: number, color: number, y = 0) {
  mount(
    scene,
    new T.CylinderGeometry(radius, radius * 1.03, 0.55, 72),
    stone(color, 0.18),
    0,
    y - 0.275,
  );
  const mat = new T.MeshBasicMaterial({ color: 0x8a8269 });
  for (const r of [radius * 0.7, radius * 0.97]) {
    const line = mount(
      scene,
      new T.TorusGeometry(r, 0.015, 4, 160),
      mat,
      0,
      y + 0.01,
      0,
    );
    line.rotation.x = Math.PI / 2;
  }
}

function ring(
  scene: T.Object3D,
  r: number,
  width: number,
  shade: number,
  x: number,
  y: number,
  z: number,
) {
  return mount(
    scene,
    new T.TorusGeometry(r, width, 8, 100),
    new T.MeshBasicMaterial({ color: shade }),
    x,
    y,
    z,
  );
}

function gateway(
  scene: T.Scene,
  x: number,
  z: number,
  scale: number,
  shade: number,
  destination: string,
  floor: Floor,
  angle = 0,
) {
  const group = new T.Group();
  group.position.set(x, floor(x, z), z);
  group.rotation.y = angle;
  group.scale.setScalar(scale);
  group.userData.destination = destination;
  scene.add(group);
  const arch = mount(
    group,
    new T.TorusGeometry(1.75, 0.17, 6, 88),
    stone(0x474342, 0.64),
    0,
    1.87,
    0,
  );
  arch.scale.x = 0.76;
  ring(group, 1.61, 0.027, shade, 0, 1.87, 0.035).scale.x = 0.76;
  ring(group, 1.9, 0.011, shade, 0, 1.87, 0).scale.x = 0.76;
  const veil = new T.ShaderMaterial({
    side: T.DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: { tint: { value: new T.Color(shade) }, clock: { value: 0 } },
    vertexShader:
      "varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `varying vec2 v;uniform vec3 tint;uniform float clock;${noiseGL}
    void main(){vec2 q=(v-.5)*2.;float r=length(q);
    float n=fbm(vec3(q*3.,clock*.12));float rays=pow(abs(sin(atan(q.y,q.x)*12.+n*11.-clock*.2)),9.);
    float edge=pow(r,4.);gl_FragColor=vec4(tint*(.17+n*.43+edge*.85+rays*.22),.20+.35*n+.43*edge);${outputGL}}`,
  });
  const face = mount(group, new T.CircleGeometry(1.58, 72), veil, 0, 1.87, 0);
  face.scale.x = 0.76;
  mount(
    group,
    new T.CylinderGeometry(1.7, 1.9, 0.2, 28),
    stone(0x514f50),
    0,
    0.06,
    0,
  );
  group.traverse((o) => (o.userData.destination = destination));
  return { group, veil };
}

function instance(
  scene: T.Scene,
  g: T.BufferGeometry,
  material: T.Material,
  matrices: T.Matrix4[],
  colors?: T.Color[],
) {
  const mesh = new T.InstancedMesh(g, material, matrices.length);
  matrices.forEach((matrix, i) => {
    mesh.setMatrixAt(i, matrix);
    if (colors) mesh.setColorAt(i, colors[i]);
  });
  mesh.computeBoundingSphere();
  scene.add(mesh);
}
function transform(
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  ry = 0,
  rz = 0,
) {
  return new T.Matrix4().compose(
    new T.Vector3(x, y, z),
    new T.Quaternion().setFromEuler(new T.Euler(0, ry, rz)),
    new T.Vector3(sx, sy, sz),
  );
}

function spires(scene: T.Scene, floor: Floor, seed: number, color: number) {
  const rand = generator(seed),
    data: T.Matrix4[] = [];
  for (let i = 0; i < 110; i++) {
    const a = rand() * TAU,
      r = 16 + rand() * 20,
      x = Math.sin(a) * r,
      z = Math.cos(a) * r;
    const w = 0.5 + rand() * 1.8,
      h = 1.1 + rand() ** 2 * 7;
    data.push(
      transform(
        x,
        floor(x, z) + h * 0.3,
        z,
        w,
        h,
        w * 0.7,
        a,
        rand() * 0.24 - 0.12,
      ),
    );
  }
  instance(scene, new T.DodecahedronGeometry(1, 0), stone(color, 0.1), data);
}

function trees(scene: T.Scene, floor: Floor) {
  const rand = generator(113),
    canopy: T.Matrix4[] = [],
    trunks: T.Matrix4[] = [],
    shades: T.Color[] = [];
  for (let i = 0; i < 650; i++) {
    const x = (rand() - 0.5) * 70,
      z = (rand() - 0.5) * 68,
      waterLine = riverX(z);
    if (
      Math.abs(x - waterLine) < 4.8 ||
      Math.hypot(x, z - 6) < 5 ||
      Math.hypot(x + 1, z + 9) < 5
    )
      continue;
    const y = floor(x, z),
      h = 1.3 + rand() ** 2 * 5,
      w = h * (0.13 + rand() * 0.11);
    trunks.push(transform(x, y + h * 0.36, z, w * 0.11, h * 0.7, w * 0.11));
    for (let j = 0; j < 3; j++) {
      canopy.push(
        transform(
          x,
          y + h * (0.37 + j * 0.23),
          z,
          w * (1 - j * 0.23),
          h * (0.56 - j * 0.065),
          w * (1 - j * 0.23),
          i,
        ),
      );
      shades.push(
        new T.Color().setHSL(
          0.4 + rand() * 0.035,
          0.34,
          0.13 + j * 0.022 + rand() * 0.05,
        ),
      );
    }
  }
  instance(
    scene,
    new T.CylinderGeometry(0.9, 1, 1, 5),
    stone(0x534541),
    trunks,
  );
  instance(scene, new T.ConeGeometry(1, 1, 7), stone(0xffffff), canopy, shades);
}

function riverX(z: number) {
  return 4.5 + Math.sin(z * 0.105) * 3.1 + Math.sin(z * 0.24) * 0.64;
}
function water(scene: T.Scene) {
  const pos: number[] = [],
    idx: number[] = [];
  for (let i = 0; i <= 160; i++) {
    const z = -55 + (i * 110) / 160,
      x = riverX(z),
      w = 2.8 + 0.28 * Math.sin(z * 0.43);
    pos.push(x - w, -0.08, z, x + w, -0.08, z);
    if (i < 160) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const mat = new T.ShaderMaterial({
    side: T.DoubleSide,
    uniforms: { clock: { value: 0 } },
    vertexShader:
      "varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `varying vec3 p;uniform float clock;${noiseGL}void main(){
    vec3 eye=normalize(cameraPosition-p);float rip=noise3(vec3(p.x*4.,p.z*16.-clock*.96,0.));
    vec3 refl=reflect(-eye,normalize(vec3((rip-.5)*.067,1.,(rip-.5)*.086)));
    float f=pow(1.-abs(eye.y),3.);float mt=.12+.08*sin(refl.x*12.)+.06*cos(refl.x*29.);
    vec3 c=mix(vec3(.009,.058,.069),mix(vec3(.016,.066,.072),vec3(.18,.30,.36),smoothstep(mt-.02,mt+.04,refl.y)),f);
    float beam=exp(-pow((p.x+1.)*.45,2.))*smoothstep(.58,.78,rip);
    c+=vec3(.18,.48,.41)*beam*f;gl_FragColor=vec4(c,1.);${outputGL}}`,
  });
  mount(scene, g, mat);
  return mat;
}

function planet(scene: T.Scene) {
  const body = new T.ShaderMaterial({
    uniforms: { clock: { value: 0 } },
    vertexShader:
      "varying vec3 n;varying vec3 p;void main(){n=normal;p=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}",
    fragmentShader: `varying vec3 n,p;uniform float clock;${noiseGL}
    void main(){vec3 d=normalize(n), eye=normalize(cameraPosition-p), sun=normalize(vec3(.62,.29,-.10));
    float continents=fbm(d*5.+vec3(10.,0.,1.));float land=smoothstep(.49,.53,continents);
    float light=smoothstep(-.32,.48,dot(d,sun));float rim=pow(1.-max(dot(eye,d),0.),3.5);
    vec3 water=vec3(.01,.082,.19),soil=mix(vec3(.065,.17,.11),vec3(.29,.24,.14),smoothstep(.53,.68,continents));
    vec3 col=mix(water,soil,land);
    float cloud=fbm(d*vec3(12.,21.,12.)+vec3(0.,0.,clock*.002)+fbm(d*6.)*2.);
    col=mix(col,vec3(.85,.86,.81),smoothstep(.49,.64,cloud)*.87);
    col*=.10+.98*light;
    col+=mix(vec3(.03,.3,.87),vec3(1.,.52,.16),pow(max(d.x,0.),1.5))*rim*1.35;
    gl_FragColor=vec4(col,1.);${outputGL}}`,
  });
  const globe = new T.LOD();
  globe.position.set(-11, -40, -93);
  globe.addLevel(new T.Mesh(new T.SphereGeometry(67, 112, 72), body), 0);
  globe.addLevel(new T.Mesh(new T.SphereGeometry(67, 72, 48), body), 110, 0.05);
  scene.add(globe);
  return body;
}

function cloudSea(scene: T.Scene) {
  // Alpha-soft wisps share a single sprite atlas and draw call.
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rand = generator(327);
  for (let i = 0; i < 55; i++) {
    const x = 25 + rand() * 78,
      y = 45 + rand() * 36,
      r = 6 + rand() * 24;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(242,232,223,.15)");
    grad.addColorStop(1, "rgba(242,232,223,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const positions: number[] = [],
    clrs: number[] = [];
  for (let i = 0; i < 500; i++) {
    const a = rand() * TAU,
      r = 19 + rand() * 46;
    positions.push(Math.sin(a) * r, -5 + rand() * 3, Math.cos(a) * r);
    const c = new T.Color(0x849ab9).lerp(
      new T.Color(0xffce9e),
      (0.5 + 0.5 * Math.sin(a)) ** 2,
    );
    clrs.push(c.r, c.g, c.b);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(clrs, 3));
  scene.add(
    new T.Points(
      g,
      new T.PointsMaterial({
        size: 12,
        map: texture,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    ),
  );
}

function blooms(scene: T.Scene, floor: Floor) {
  const rand = generator(743),
    stems: T.Matrix4[] = [],
    flower: T.Matrix4[] = [],
    colors: T.Color[] = [];
  const palette = [0x89d6ff, 0xf9a2d9, 0xc5a1ff, 0x92f6db];
  for (let i = 0; i < 2350; i++) {
    const x = (rand() - 0.5) * 63,
      z = (rand() - 0.5) * 62,
      path = Math.sin(z * 0.22) * 1.65;
    if (Math.abs(path - x) < 1.55 + rand() * 0.65) continue;
    const y = floor(x, z),
      h = 0.18 + rand() ** 2 * 0.82;
    stems.push(transform(x, y + h * 0.5, z, 0.022, h, 0.022));
    flower.push(
      transform(
        x,
        y + h,
        z,
        0.085 + 0.08 * h,
        0.065 + 0.07 * h,
        0.078,
        rand() * TAU,
      ),
    );
    colors.push(
      new T.Color(
        palette[
          Math.floor((Math.sin(z * 0.36 + x * 0.36) * 0.45 + 0.5) * 3.99)
        ],
      ).multiplyScalar(0.62 + rand() * 0.67),
    );
  }
  instance(scene, new T.ConeGeometry(1, 1, 4), stone(0x33636a), stems);
  instance(
    scene,
    new T.IcosahedronGeometry(1),
    new T.MeshBasicMaterial(),
    flower,
    colors,
  );
}

function motes(scene: T.Scene, color: number, count: number, spread: number) {
  const rand = generator(count),
    data: number[] = [];
  for (let i = 0; i < count; i++)
    data.push(
      (rand() - 0.5) * spread,
      0.5 + rand() ** 2 * 5,
      (rand() - 0.5) * spread,
    );
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(data, 3));
  const points = new T.Points(
    g,
    new T.PointsMaterial({
      color,
      size: 0.045,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: T.AdditiveBlending,
    }),
  );
  scene.add(points);
  return points;
}

function portalName(group: T.Group, title: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 72;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.font = "500 30px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f7e9cf";
  ctx.shadowColor = "#121723";
  ctx.shadowBlur = 5;
  ctx.fillText(title, 256, 37);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  const label = new T.Sprite(
    new T.SpriteMaterial({ map, transparent: true, depthWrite: false }),
  );
  label.position.set(0, 4.3, 0.03);
  label.scale.set(3.4, 0.48, 1);
  group.add(label);
  label.userData.destination = group.userData.destination;
}

function monument(scene: T.Scene) {
  const metal = stone(0x5b6066, 0.7);
  // Weathered orbital instrument, with a deliberately missing upper segment.
  const hoop = mount(
    scene,
    new T.TorusGeometry(7.8, 0.31, 7, 110, TAU * 0.87),
    metal,
    0,
    8.4,
    -23,
  );
  hoop.rotation.z = 0.28;
  for (const [r, w, tint] of [
    [7.47, 0.06, 0xffc788],
    [7.98, 0.019, 0xf8cc8e],
    [6.96, 0.018, 0xffe4ba],
  ]) {
    const arc = mount(
      scene,
      new T.TorusGeometry(r, w, 5, 112, TAU * 0.86),
      new T.MeshBasicMaterial({ color: tint }),
      0,
      8.4,
      -23,
    );
    arc.rotation.z = 0.3;
  }
  const teeth: T.Matrix4[] = [];
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU * 0.84 + 0.34;
    const len = i % 5 === 0 ? 0.5 : 0.23;
    teeth.push(
      transform(
        Math.cos(a) * 7.7,
        8.4 + Math.sin(a) * 7.7,
        -22.71,
        0.026,
        len,
        0.05,
        0,
        a - Math.PI / 2,
      ),
    );
  }
  instance(
    scene,
    new T.BoxGeometry(1, 1, 1),
    new T.MeshBasicMaterial({ color: 0xe0b887 }),
    teeth,
  );
  const island = mount(
    scene,
    new T.CylinderGeometry(5.6, 2.7, 3.6, 9),
    stone(0x354552),
    0,
    -0.2,
    -23,
  );
  island.rotation.y = 0.38;
  for (const sign of [-1, 1]) {
    const pillar = mount(
      scene,
      new T.CylinderGeometry(0.54, 1.1, 7.2, 5),
      metal,
      sign * 6.3,
      2.3,
      -23,
    );
    pillar.rotation.z = -sign * 0.28;
  }
}

function observatory(scene: T.Scene, lab: boolean) {
  const dark = stone(lab ? 0x152b3a : 0x282435, 0.38),
    accent = lab ? 0x51d7d9 : 0xe0a4ff;
  stoneDeck(scene, 12, lab ? 0x172b37 : 0x282635);
  mount(scene, new T.CylinderGeometry(1.72, 1.98, 0.27, 64), dark, 0, 0.14, 0);
  for (const r of [1.76, 2.03, 4.9, 10.3]) {
    const edge = ring(scene, r, 0.013, accent, 0, r < 2 ? 0.281 : 0.018, 0);
    edge.rotation.x = Math.PI / 2;
  }
  const posts: T.Matrix4[] = [],
    lamps: T.Matrix4[] = [],
    fins: T.Matrix4[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU,
      x = 11.2 * Math.sin(a),
      z = 11.2 * Math.cos(a);
    posts.push(transform(x, 3.4, z, 0.38, 6.8, 0.39, a));
    lamps.push(transform(x * 0.982, 4.2, z * 0.982, 0.035, 4.7, 0.035, a));
  }
  const box = new T.BoxGeometry(1, 1, 1);
  instance(scene, box, dark, posts);
  instance(scene, box, new T.MeshBasicMaterial({ color: accent }), lamps);
  for (const h of [6.4, 6.72]) {
    const rim = ring(scene, 11.23, 0.045, accent, 0, h, 0);
    rim.rotation.x = Math.PI / 2;
  }
  // Vertical fins and open slots let the night sky show through the rotunda.
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TAU;
    fins.push(
      transform(
        12.3 * Math.sin(a),
        1.65,
        12.3 * Math.cos(a),
        1.72,
        3.4,
        0.23,
        a,
      ),
    );
  }
  instance(scene, box, dark, fins);
}

export function buildWorld(id: string): World {
  const scene = new T.Scene();
  let ground: Floor = () => 0,
    radius = 13,
    spawnZ = 8;
  const portals: T.Object3D[] = [];
  const animate: Array<(seconds: number) => void> = [];
  const portal = (
    x: number,
    z: number,
    s: number,
    c: number,
    target: string,
    a = 0,
    title = "",
  ) => {
    const { group, veil } = gateway(scene, x, z, s, c, target, ground, a);
    if (title) portalName(group, title);
    portals.push(group);
    animate.push((t) => {
      veil.uniforms.clock.value = t;
    });
  };
  if (id === "hub") {
    radius = 13.5;
    spawnZ = 8.8;
    scene.background = new T.Color(0x687986);
    scene.fog = new T.FogExp2(0x708390, 0.018);
    sky(scene, 0x122336, 0x9ca3a5, 0xffd393, -0.23, 0.095, 820);
    lights(scene, 0xc6dbed, 0x3b3e4c, 0xffddb4);
    groundMesh(scene, () => -0.46, 0x485462, 62, 441);
    ridges(scene, [0x708596, 0x526675, 0x394b58], 412, 21);
    stoneDeck(scene, 14, 0x495360);
    spires(scene, ground, 62, 0x52606a);
    monument(scene);
    const locations = [
      ["earth", "Edge of Earth", 0, -8, 1.25, 0xffc988],
      ["valley", "Portal Valley", -5.25, -5.9, 1.04, 0x9df8d3],
      ["field", "Starlight Field", 5.25, -5.9, 1.04, 0xe4b6ff],
      ["sculpture", "Particle Sculpture", -9, -2.1, 0.95, 0x9edaff],
      ["lab", "Hand Tracking Lab", 9, -2.1, 0.95, 0xffa78e],
    ] as const;
    for (const [target, title, x, z, s, color] of locations)
      portal(x, z, s, color, target, -x * 0.046, title);
    const ticks: T.Matrix4[] = [];
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * TAU,
        r = 12.3;
      ticks.push(
        transform(
          r * Math.sin(a),
          0.016,
          r * Math.cos(a),
          0.019,
          0.015,
          i % 5 === 0 ? 0.48 : 0.16,
          a,
        ),
      );
    }
    instance(
      scene,
      new T.BoxGeometry(1, 1, 1),
      new T.MeshBasicMaterial({ color: 0x9f967e }),
      ticks,
    );
  } else if (id === "earth") {
    radius = 11;
    spawnZ = 5.6;
    scene.background = new T.Color(0x1d2339);
    sky(scene, 0x060b1e, 0x634f67, 0xffa24b, 0.48, 0.115, 2600);
    lights(scene, 0x9eaac7, 0x333247, 0xffaf73);
    const earth = planet(scene);
    animate.push((t) => {
      earth.uniforms.clock.value = t;
    });
    cloudSea(scene);
    ground = (x, z) =>
      0.32 * Math.sin(x * 0.38 + z * 0.11) +
      0.15 * Math.cos(z * 0.69) +
      0.45 * Math.cos(Math.hypot(x, z) * 0.27);
    // Concentric irregular rings share the top with the walkable height function.
    const vertices: number[] = [],
      indices: number[] = [],
      colors: number[] = [];
    const rings = 21,
      seg = 116;
    for (let j = 0; j <= rings + 6; j++) {
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU;
        const outer = 12.5 + 0.7 * Math.sin(5 * a) + 0.42 * Math.sin(13 * a);
        const r =
          j <= rings
            ? (outer * j) / rings
            : outer * (1 - (j - rings) * 0.067) + 0.35 * Math.sin(a * 20 + j);
        const x = r * Math.sin(a),
          z = r * Math.cos(a);
        const y = ground(x, z) - Math.max(0, j - rings) * 2.6;
        vertices.push(x, y, z);
        const veins =
          Math.sin(x * 0.95 + z * 1.65 + Math.sin(x * 0.7)) * 0.5 + 0.5;
        const c = new T.Color(0x383541).lerp(
          new T.Color(0x8d6960),
          veins * 0.73 + (j > rings ? 0.18 : 0),
        );
        colors.push(c.r, c.g, c.b);
        if (j < rings + 6 && i < seg) {
          const n = j * (seg + 1) + i;
          indices.push(n, n + seg + 1, n + 1, n + 1, n + seg + 1, n + seg + 2);
        }
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    mount(
      scene,
      g,
      new T.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        side: T.DoubleSide,
      }),
    );
    const rand = generator(182),
      rocks: T.Matrix4[] = [];
    for (let i = 0; i < 190; i++) {
      const a = rand() * TAU,
        r = 4 + rand() * 7.2,
        w = 0.1 + rand() ** 4 * 0.98;
      const x = Math.sin(a) * r,
        z = Math.cos(a) * r;
      rocks.push(
        transform(
          x,
          ground(x, z) + w * 0.16,
          z,
          w,
          w * (0.35 + rand() * 0.6),
          w * 0.72,
          a,
        ),
      );
    }
    instance(scene, new T.DodecahedronGeometry(1), stone(0x554851), rocks);
  } else if (id === "valley") {
    radius = 24;
    spawnZ = 8;
    scene.fog = new T.FogExp2(0x48727b, 0.019);
    sky(scene, 0x0d213d, 0x639496, 0xc4f8dd, -0.32, 0.23, 2400);
    lights(scene, 0x9dc8d3, 0x293f3d, 0xffe4b9);
    ground = (x, z) => {
      const dist = Math.abs(x - riverX(z));
      const upland = Math.max(0, dist - 4);
      return (
        -0.36 +
        Math.min(1, Math.max(0, (dist - 2.5) / 1.8)) *
          (0.6 + 0.16 * Math.sin(z * 0.41) + 0.19 * Math.sin(x * 0.6)) +
        Math.min(2.3, upland * upland * 0.009)
      );
    };
    groundMesh(scene, ground, 0x486a57, 52, 92);
    ridges(scene, [0x547783, 0x335960, 0x274748], 642, 27);
    const flow = water(scene);
    animate.push((t) => {
      flow.uniforms.clock.value = t;
    });
    trees(scene, ground);
    portal(-1, -9, 1.6, 0xb9ffda, "hub", 0.09, "Hub world");
    const dust = motes(scene, 0xc6f7ac, 330, 36);
    animate.push((t) => {
      dust.position.y = Math.sin(t * 0.45) * 0.15;
    });
  } else if (id === "field") {
    radius = 23;
    spawnZ = 9;
    scene.fog = new T.FogExp2(0x54537c, 0.017);
    sky(scene, 0x100f35, 0x87739b, 0xf2c4e7, 0.08, 0.21, 3600);
    lights(scene, 0xc4b6e4, 0x30304b, 0xffc9d0);
    ground = (x, z) =>
      0.34 * Math.sin(z * 0.24) +
      0.21 * Math.cos(x * 0.49 + z * 0.16) +
      Math.abs(x) * 0.027;
    groundMesh(scene, ground, 0x343f51, 48, 637);
    ridges(scene, [0x6f6789, 0x494762, 0x434156], 275, 23);
    blooms(scene, ground);
    const dust = motes(scene, 0xffddf2, 700, 44);
    animate.push((t) => {
      dust.position.y = Math.sin(t * 0.38) * 0.23;
      dust.rotation.y = Math.sin(t * 0.055) * 0.028;
    });
    const path: T.Matrix4[] = [];
    for (let i = 0; i < 48; i++) {
      const z = -23 + i * 0.9,
        x = Math.sin(z * 0.22) * 1.65;
      path.push(
        transform(
          x,
          ground(x, z) + 0.013,
          z,
          1.06,
          0.046,
          0.48,
          Math.cos(z * 0.22) * 0.3,
        ),
      );
    }
    instance(
      scene,
      new T.CylinderGeometry(1, 0.94, 1, 7),
      stone(0x575064),
      path,
    );
  } else {
    const lab = id === "lab";
    radius = 10.7;
    spawnZ = 7;
    scene.fog = new T.FogExp2(lab ? 0x152933 : 0x251d30, 0.03);
    sky(
      scene,
      lab ? 0x071825 : 0x18152b,
      lab ? 0x173b47 : 0x443953,
      lab ? 0x78c7ca : 0xd6acd8,
      -0.4,
      0.25,
      580,
    );
    lights(scene, lab ? 0x9abcc4 : 0xd2b8ce, 0x242330, 0xc9bdc9);
    observatory(scene, lab);
  }
  if (id !== "hub" && id !== "valley")
    portal(
      0,
      Math.min(radius - 1, spawnZ + 3),
      0.69,
      0xf2d5a7,
      "hub",
      Math.PI,
      "Hub world",
    );
  return {
    scene,
    ground,
    radius,
    spawn: new T.Vector3(0, ground(0, spawnZ) + 1.65, spawnZ),
    portals,
    update: (t) => {
      for (const next of animate) next(t);
    },
  };
}
