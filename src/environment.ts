import { addWater } from "./water";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import * as T from "three";
import { atlas, places, type Place } from "./catalog";
const tau = Math.PI * 2;
function random(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const noise = `float hash(vec2 p){return fract(sin(dot(mod(p,251.),vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fb(vec2 p){return .52*n(p)+.26*n(p*2.03)+.14*n(p*4.11)+.08*n(p*8.3);}`;
const vertex = `varying vec3 pos;void main(){pos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
function shader(
  fragment: string,
  uniforms: T.ShaderMaterialParameters["uniforms"] = {},
  side: T.Side = T.FrontSide,
) {
  return new T.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: "varying vec3 pos;" + noise + fragment,
    uniforms,
    side,
  });
}
function mesh<M extends T.Material>(
  scene: T.Object3D,
  g: T.BufferGeometry,
  m: M,
  x = 0,
  y = 0,
  z = 0,
) {
  const o = new T.Mesh(g, m);
  o.position.set(x, y, z);
  scene.add(o);
  return o;
}
const colors = {
  hub: ["#182440", "#b77977", "#536881"],
  earth: ["#060d28", "#f3a063", "#36405d"],
  valley: ["#112940", "#91bba6", "#345c59"],
  field: ["#201639", "#b28abc", "#604b70"],
  sculpture: ["#10162c", "#465269", "#323747"],
  lab: ["#071c2a", "#376977", "#233b51"],
};
export function makeEnvironment(id: Place) {
  const scene = new T.Scene(),
    rng = random(232 + places.indexOf(id)),
    [zenith, horizon, stone] = colors[id];
  const gates: T.Object3D[] = [];
  const animated: ((t: number) => void)[] = [];
  const room = id === "lab" || id === "sculpture";
  const sky = mesh(
    scene,
    new T.SphereGeometry(400, 48, 24),
    shader(
      `
 uniform vec3 top,bottom;void main(){vec3 d=normalize(pos);float h=max(0.,d.y);vec2 p=d.xz/(.32+abs(d.y));float clouds=fb(p*3.);float band=exp(-9.*abs(d.y-.17-.18*d.x));
 vec3 col=mix(bottom,top,smoothstep(-.09,.62,h));col+=band*(.22+.65*clouds)*vec3(.30,.19,.32);
 col+=vec3(.95,.52,.23)*exp(-8.*distance(d,normalize(vec3(-.38,.12,-1.))));
 float sunDist=distance(d,normalize(vec3(-.38,.12,-1.)));col+=vec3(1.,.78,.52)*(1.-smoothstep(.023,.029,sunDist));col+=vec3(.18,.12,.17)*smoothstep(.40,.80,clouds)*exp(-5.*h);gl_FragColor=vec4(col,1.);
 #include <colorspace_fragment>
 }`,
      {
        top: { value: new T.Color(zenith) },
        bottom: { value: new T.Color(horizon) },
      },
      T.BackSide,
    ),
  );
  sky.material.depthWrite = false;
  sky.renderOrder = -5;
  const stars = new Float32Array(5400);
  for (let i = 0; i < stars.length; i += 3) {
    const a = rng() * tau,
      y = 0.03 + rng() * 0.97,
      r = Math.sqrt(1 - y * y);
    stars.set([330 * r * Math.cos(a), 330 * y, 330 * r * Math.sin(a)], i);
  }
  const sg = new T.BufferGeometry();
  sg.setAttribute("position", new T.BufferAttribute(stars, 3));
  scene.add(
    new T.Points(
      sg,
      new T.PointsMaterial({
        color: 0xf6eee1,
        size: 0.4,
        transparent: true,
        opacity: 0.82,
        fog: false,
      }),
    ),
  );
  scene.fog = new T.FogExp2(stone, id === "earth" ? 0.003 : 0.009);
  scene.add(new T.HemisphereLight(0xffefe5, 0x384055, 2));
  const sun = new T.DirectionalLight(0xffd2a7, 2.3);
  sun.position.set(-35, 26, -24);
  scene.add(sun);
  const solid = (color: T.ColorRepresentation) =>
    new T.MeshStandardMaterial({ color, roughness: 0.84, flatShading: true });
  const height = (x: number, z: number) => {
    if (room || id === "hub") return 0;
    if (id === "earth")
      return 0.045 * z + 0.47 * Math.sin(x * 0.21) + 0.26 * Math.cos(z * 0.35);
    const bank =
      id === "valley"
        ? -2.5 * Math.exp(-Math.pow((x - 5 * Math.sin(z * 0.06)) / 6, 2))
        : 0;
    return (
      bank +
      0.48 * Math.sin(x * 0.24) * Math.cos(z * 0.19) +
      0.23 * Math.sin(z * 0.38)
    );
  };
  const limit = id === "earth" ? 14 : room ? 10 : id === "hub" ? 16 : 24;
  if (!room) {
    for (let layer = 0; layer < 3; layer++) {
      const seg = 192,
        verts: number[] = [],
        cols: number[] = [];
      const base = new T.Color(stone);
      for (let i = 0; i < seg; i++) {
        const pair = (j: number) => {
          const a = (j / seg) * tau,
            r = 55 + layer * 28;
          const ridge =
            4 +
            layer * 2 +
            6 * Math.sin(a * 7 + layer) +
            3 * Math.sin(a * 17) +
            2 * Math.cos(a * 31) +
            Math.abs(Math.sin(a * 13)) * 4;
          const lower = id === "earth" ? 25 : 0;
          return [Math.sin(a) * r, ridge - lower, Math.cos(a) * r];
        };
        const a = pair(i),
          b = pair(i + 1),
          c = [a[0] * 0.64, -9 - (id === "earth" ? 25 : 0), a[2] * 0.64],
          d = [b[0] * 0.64, c[1], b[2] * 0.64];
        for (const tri of [
          [a, b, c],
          [b, d, c],
        ]) {
          const tint = base
            .clone()
            .multiplyScalar(0.56 + 0.21 * layer + 0.35 * rng());
          for (const p of tri) {
            verts.push(...p);
            cols.push(tint.r, tint.g, tint.b);
          }
        }
      }
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(verts, 3));
      g.setAttribute("color", new T.Float32BufferAttribute(cols, 3));
      g.computeVertexNormals();
      mesh(
        scene,
        g,
        new T.MeshStandardMaterial({
          vertexColors: true,
          flatShading: true,
          side: T.DoubleSide,
        }),
      );
    }
  }
  const floor = new T.PlaneGeometry(
    id === "earth" ? 34 : 100,
    id === "earth" ? 34 : 100,
    100,
    100,
  );
  floor.rotateX(-Math.PI / 2);
  const p = floor.attributes.position,
    fc = [];
  const soil = new T.Color(
    room
      ? "#283444"
      : id === "valley"
        ? "#436953"
        : id === "field"
          ? "#554161"
          : "#686574",
  );
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i);
    p.setY(i, height(x, z));
    const c = soil
      .clone()
      .multiplyScalar(0.73 + 0.16 * Math.sin(x * 0.7 + z * 0.3) + 0.22 * rng());
    fc.push(c.r, c.g, c.b);
  }
  floor.setAttribute("color", new T.Float32BufferAttribute(fc, 3));
  floor.computeVertexNormals();
  mesh(
    scene,
    floor,
    new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
  );
  if (id === "earth") {
    // Vertical basalt columns expose the shelf's fractured edge from either flank.
    const rock = new T.InstancedMesh(
        new T.CylinderGeometry(1, 0.73, 1, 6),
        solid("#494952"),
        100,
      ),
      d = new T.Object3D();
    for (let i = 0; i < 100; i++) {
      const side = Math.floor(i / 25),
        u = ((i % 25) - 12) * 1.38,
        x = side < 2 ? u : side === 2 ? -16 : 16,
        z = side < 2 ? (side === 0 ? -16 : 16) : u;
      const h = 4 + 8 * rng();
      d.position.set(x, height(x, z) - h * 0.5, z);
      d.scale.set(1 + rng() * 0.45, h, 1.2);
      d.updateMatrix();
      rock.setMatrixAt(i, d.matrix);
    }
    scene.add(rock);
    const landMap = new T.TextureLoader().load(
      import.meta.env.BASE_URL + "art/coastlines.png",
    );
    landMap.wrapS = T.RepeatWrapping;
    const planet = mesh(
      scene,
      new T.SphereGeometry(54, 96, 64),
      shader(
        `uniform sampler2D coast;void main(){vec3 d=normalize(pos);vec2 uv=vec2(atan(d.z,d.x),asin(d.y));float land=texture2D(coast,vec2(fract(uv.x/6.283+.43),uv.y/3.14159+.5)).r;float detail=fb(uv*18.);vec3 soil=mix(vec3(.06,.14,.08),vec3(.42,.28,.14),detail+.3*exp(-10.*abs(d.y-.43)));vec3 col=mix(vec3(.009,.055,.16),soil,land);float cloud=fb(uv*vec2(11.,25.)+fb(uv*5.)*4.);col=mix(col,vec3(.72,.79,.86),smoothstep(.50,.75,cloud));col+=vec3(.13,.30,.52)*pow(1.-abs(dot(d,normalize(vec3(-.13,.32,1.)))),3.);col*=.055+1.15*max(dot(d,normalize(vec3(-1.,.7,.1))),0.);gl_FragColor=vec4(col,1.);
 #include <colorspace_fragment>
 }`,
        { coast: { value: landMap } },
      ),
      16,
      -28,
      -104,
    );
    animated.push((t) => (planet.rotation.y = t * 0.012));
    const cloudGeo = new T.IcosahedronGeometry(1, 1),
      cloudMat = solid("#c7b0ab");
    const clouds = new T.InstancedMesh(cloudGeo, cloudMat, 220),
      dummy = new T.Object3D();
    for (let i = 0; i < 220; i++) {
      const a = rng() * tau,
        r = 30 + 45 * rng();
      dummy.position.set(Math.sin(a) * r, -9 - rng() * 9, Math.cos(a) * r);
      dummy.scale.set(3 + rng() * 7, 1 + rng(), 3 + rng() * 4);
      dummy.updateMatrix();
      clouds.setMatrixAt(i, dummy.matrix);
    }
    scene.add(clouds);
  }
  function gate(x: number, z: number, color: string, dest?: Place) {
    const group = new T.Group();
    group.position.set(x, height(x, z) + 2.65, z);
    group.rotation.y = Math.atan2(-x, 9 - z);
    scene.add(group);
    mesh(group, new T.TorusGeometry(2.35, 0.19, 10, 72), solid("#514c56"));
    mesh(
      group,
      new T.TorusGeometry(2.14, 0.05, 8, 90),
      new T.MeshBasicMaterial({ color }),
    );
    const disk = mesh(
      group,
      new T.CircleGeometry(2.11, 80),
      shader(
        `uniform vec3 tint;uniform float time;void main(){float r=length(pos.xy)/2.11;float v=fb(pos.xy*2.+vec2(time*.08,.0));float swirl=sin(17.*r+3.*atan(pos.y,pos.x)+4.*v-time*.4);vec3 c=tint*(.10+.30*v+.10*swirl+.95*pow(r,5.));gl_FragColor=vec4(c,1.);
 #include <colorspace_fragment>
 }`,
        { tint: { value: new T.Color(color) }, time: { value: 0 } },
        T.DoubleSide,
      ),
    );
    animated.push((t) => (disk.material.uniforms.time.value = t));
    if (dest) {
      disk.userData.place = dest;
      gates.push(disk);
      const label = document.createElement("canvas");
      label.width = 768;
      label.height = 100;
      const ctx = label.getContext("2d")!;
      ctx.fillStyle = "#102031d9";
      ctx.fillRect(0, 0, 768, 100);
      ctx.fillStyle = "#fffaed";
      ctx.textAlign = "center";
      ctx.font = "44px Georgia";
      ctx.fillText(atlas[dest][0], 384, 64);
      const tex = new T.CanvasTexture(label);
      tex.colorSpace = T.SRGBColorSpace;
      const sprite = new T.Sprite(new T.SpriteMaterial({ map: tex }));
      sprite.position.set(0, -2.15, 1.0);
      sprite.scale.set(4.6, 0.6, 1);
      group.add(sprite);
    }
  }
  if (id === "hub") {
    places.slice(1).forEach((key, i) => {
      const a = [0, -0.6, 0.6, -1.2, 1.2][i];
      gate(
        Math.sin(a) * 14,
        7 - Math.cos(a) * 14,
        ["#f0ae80", "#83ead5", "#cc9cff", "#9cc7ff", "#a2ffe6"][i],
        key,
      );
    });
  }
  if (id === "valley") {
    gate(0, -20, "#a6ffce");
    animated.push(addWater(scene));
  }
  if (id === "field" || id === "valley") {
    const field = id === "field",
      total = field ? 2300 : 750;
    const plant = new T.InstancedMesh(
      new T.CylinderGeometry(0.65, 1, 1, 5),
      solid(field ? "#456568" : "#483e3b"),
      total,
    );
    const crown = new T.InstancedMesh(
      new T.ConeGeometry(1, 1, 7),
      solid(field ? "#5b807e" : "#456b5b"),
      total * 3,
    );
    const tip = new T.InstancedMesh(
      new T.IcosahedronGeometry(1, 0),
      new T.MeshBasicMaterial(),
      total * 4,
    );
    const glow: number[] = [],
      d = new T.Object3D();
    let count = 0;
    for (let i = 0; i < total; i++) {
      const x = rng() * 66 - 33,
        z = rng() * 64 - 32;
      // Preserve the portal sightline from the western bank.
      if (
        !field &&
        z >= -22 &&
        z <= 11 &&
        Math.abs(x + ((z + 20) * 8) / 27) < 3.5
      )
        continue;
      if (Math.abs(x - 3 * Math.sin(z * 0.1)) < 1.9 || height(x, z) < -0.8)
        continue;
      const y = height(x, z),
        h = field ? 0.24 + rng() * 0.79 : 1 + rng() * 3.6;
      d.rotation.set(0, 0, 0);
      d.position.set(x, y + h * 0.5, z);
      d.scale.set(h * 0.035, h, h * 0.035);
      d.updateMatrix();
      plant.setMatrixAt(count, d.matrix);
      for (let j = 0; j < 3; j++) {
        const sign = j % 2 ? 1 : -1;
        d.position.set(
          x + (field ? sign * h * 0.1 : 0),
          y + h * (0.29 + j * 0.24),
          z,
        );
        d.rotation.set(0, rng() * 6, field ? sign * 0.8 : 0);
        const width = h * (field ? 0.075 : 0.32 - j * 0.067);
        d.scale.set(width, h * (field ? 0.38 : 0.62), width);
        d.updateMatrix();
        crown.setMatrixAt(count * 3 + j, d.matrix);
      }
      if (field) {
        const tint = new T.Color().setHSL(0.46 + rng() * 0.36, 0.72, 0.69);
        for (let j = 0; j < 4; j++) {
          const a = (j * Math.PI) / 2;
          d.position.set(
            x + 0.077 * Math.cos(a),
            y + h,
            z + 0.077 * Math.sin(a),
          );
          d.rotation.set(0, -a, 0.65);
          d.scale.set(0.12, 0.041, 0.053);
          d.updateMatrix();
          tip.setMatrixAt(count * 4 + j, d.matrix);
          tip.setColorAt(count * 4 + j, tint);
        }
        glow.push(x, y + h + 0.02, z);
        if (i % 4 === 0) glow.push(x + 0.2, y + h + 1.8 * rng(), z);
      }
      count++;
    }
    plant.count = count;
    crown.count = count * 3;
    tip.count = count * 4;
    scene.add(plant, crown);
    if (field) {
      scene.add(tip);
      const gp = new T.BufferGeometry();
      gp.setAttribute("position", new T.Float32BufferAttribute(glow, 3));
      const gm = new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        uniforms: { time: { value: 0 } },
        vertexShader: `uniform float time;varying float pulse;void main(){pulse=.68+.32*sin(position.x+time);vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(88./max(.4,-p.z),2.,35.);}`,
        fragmentShader: `varying float pulse;void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.65,.71,1.,exp(-5.*d*d)*pulse*.70*(1.-smoothstep(.74,1.,d)));}`,
      });
      scene.add(new T.Points(gp, gm));
      animated.push((t) => (gm.uniforms.time.value = t));
    } else {
      tip.geometry.dispose();
      tip.material.dispose();
      tip.dispose();
    }
  }
  if (room || id === "hub") {
    const ringMat = new T.MeshBasicMaterial({
      color: room ? "#618383" : "#bcaba6",
    });
    for (const r of room ? [3, 5, 9] : [8, 13, 17]) {
      const o = mesh(
        scene,
        new T.TorusGeometry(r, 0.022, 4, 140),
        ringMat,
        0,
        0.035,
        0,
      );
      o.rotation.x = Math.PI / 2;
    }
    if (room) {
      const wall = mesh(
        scene,
        new T.CylinderGeometry(14, 14, 10, 64, 1, true),
        new T.MeshStandardMaterial({
          color: id === "lab" ? "#12303a" : "#252338",
          side: T.DoubleSide,
          roughness: 0.77,
        }),
        0,
        4.6,
        0,
      );
      wall.receiveShadow = true;
      for (const y of [0.42, 3.8, 7.2]) {
        const rim = mesh(
          scene,
          new T.TorusGeometry(13.88, 0.025, 5, 96),
          ringMat,
          0,
          y,
          0,
        );
        rim.rotation.x = Math.PI / 2;
      }
      for (let i = 0; i < 20; i++) {
        const a = (i * tau) / 20;
        mesh(
          scene,
          new T.BoxGeometry(0.14, 6, 0.14),
          ringMat,
          13.8 * Math.sin(a),
          3,
          13.8 * Math.cos(a),
        );
      }
    }
  }
  if (!room) {
    for (let i = 0; i < 36; i++) {
      const a = rng() * tau,
        r = 19 + rng() * 16;
      const lod = new T.LOD(),
        mat = solid(stone);
      for (const [detail, dist] of [
        [1, 0],
        [0, 24],
      ])
        lod.addLevel(
          new T.Mesh(new T.IcosahedronGeometry(1, detail), mat),
          dist,
        );
      lod.position.set(
        r * Math.sin(a),
        height(r * Math.sin(a), r * Math.cos(a)),
        r * Math.cos(a),
      );
      lod.scale.set(1 + rng() * 2, 0.7 + rng() * 2, 1 + rng());
      scene.add(lod);
    }
  }
  return {
    scene,
    gates,
    height,
    limit,
    update: (t: number) => animated.forEach((f) => f(t)),
  };
}
export function dispose(scene: T.Scene) {
  const resources = new Set<{ dispose: () => void }>();
  scene.traverse((o) => {
    const m = o as T.Mesh;
    if (m.geometry) resources.add(m.geometry);
    if (m.material)
      for (const mat of [m.material].flat()) {
        resources.add(mat);
        if (mat instanceof T.ShaderMaterial) {
          for (const u of Object.values(mat.uniforms))
            if (u.value instanceof T.Texture) resources.add(u.value);
        }
        if ("map" in mat && mat.map instanceof T.Texture)
          resources.add(mat.map);
      }
    if (o instanceof T.InstancedMesh) resources.add(o);
    if (o instanceof Reflector) resources.add(o.getRenderTarget());
  });
  resources.forEach((o) => o.dispose());
}
