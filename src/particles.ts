import * as T from "three";
export const forms = [
  "Silk",
  "Orbit",
  "Wave",
  "Knot",
  "Sphere",
  "Cube",
] as const;
export const gestures = [
  "Fist",
  "Open",
  "Point",
  "Peace",
  "Pinch",
  "Swipe",
] as const;
export type Gesture = (typeof gestures)[number];
const tau = 2 * Math.PI;
function point(form: string, u: number, v: number, w: number) {
  const a = u * tau,
    b = v * tau,
    k = 0.13 * (w - 0.5);
  switch (form) {
    case "Silk":
      return [
        (u - 0.5) * 5.6,
        0.68 * Math.sin(2 * a + b * 0.5) + 0.32 * Math.cos(b) + k,
        (v - 0.5) * 2.7 + 0.4 * Math.sin(a),
      ];
    case "Orbit": {
      const tilt = Math.floor(v * 5) * 0.59;
      return [
        2.25 * Math.cos(a),
        2.25 * Math.sin(a) * Math.sin(tilt) + k,
        2.25 * Math.sin(a) * Math.cos(tilt),
      ];
    }
    case "Wave":
      return [
        (u - 0.5) * 5,
        0.72 * Math.sin(a * 1.6 + b * 0.7),
        (v - 0.5) * 3.4,
      ];
    case "Knot": {
      const r = 1.35 + 0.62 * Math.cos(3 * a) + 0.16 * Math.cos(b);
      return [
        r * Math.cos(2 * a),
        0.78 * Math.sin(3 * a) + 0.16 * Math.sin(b),
        r * Math.sin(2 * a),
      ];
    }
    case "Cube": {
      const s = Math.floor(w * 6),
        p = [(u - 0.5) * 3, (v - 0.5) * 3, (s % 2 ? 1 : -1) * 1.5];
      return s < 2 ? p : s < 4 ? [p[2], p[0], p[1]] : [p[1], p[2], p[0]];
    }
    case "Scatter":
      return [(u - 0.5) * 7, (v - 0.5) * 4, (w - 0.5) * 5];
    case "Vortex":
      return [
        v * 2.6 * Math.cos(a + v * 7),
        (v - 0.5) * 3,
        v * 2.6 * Math.sin(a + v * 7),
      ];
    default: {
      const y = 2 * v - 1,
        r = Math.sqrt(1 - y * y) * (form === "Grab" ? 0.57 : 1.86);
      return [
        r * Math.cos(a),
        y * (form === "Grab" ? 0.57 : 1.86),
        r * Math.sin(a),
      ];
    }
  }
}
export function sculpture(scene: T.Scene, initial: string) {
  const count = 12000,
    g = new T.BufferGeometry(),
    seed = Float32Array.from({ length: count * 3 }, () => Math.random()),
    start = new Float32Array(count * 3),
    end = new Float32Array(count * 3);
  function fill(name: string) {
    for (let i = 0; i < count; i++)
      end.set(
        point(name, seed[3 * i], seed[3 * i + 1], seed[3 * i + 2]),
        i * 3,
      );
  }
  fill(initial);
  start.set(end);
  g.setAttribute("position", new T.BufferAttribute(start, 3));
  g.setAttribute("target", new T.BufferAttribute(end, 3));
  g.setAttribute("seed", new T.BufferAttribute(seed, 3));
  g.boundingSphere = new T.Sphere(new T.Vector3(), 10);
  const uniforms = {
    blend: { value: 1 },
    time: { value: 0 },
    hand: { value: new T.Vector2(8, 8) },
    burst: { value: 0 },
    anchor: { value: new T.Vector2() },
  };
  const m = new T.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    vertexShader: `
 attribute vec3 target,seed;uniform float blend,time,burst;uniform vec2 hand,anchor;varying vec3 tint;
 void main(){vec3 p=mix(position,target,smoothstep(0.,1.,blend));p.y+=.09*sin(time+6.*seed.x+p.x);vec2 delta=p.xy-hand;p.xy+=delta*exp(-2.*dot(delta,delta))*.98;p+=normalize(p+.001)*burst*(1.+seed.z);p.xy+=anchor;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((8.+seed.z*8.)/max(.5,-mv.z),1.,9.);tint=mix(vec3(.26,.96,.86),vec3(.92,.49,.93),seed.x);}`,
    fragmentShader: `varying vec3 tint;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(tint,.85*(1.-d*d));}`,
  });
  const obj = new T.Points(g, m);
  obj.position.y = 2.4;
  scene.add(obj);
  let current = initial;
  function form(name: string) {
    if (name === current) return;
    current = name;
    const b = T.MathUtils.smoothstep(uniforms.blend.value, 0, 1);
    for (let i = 0; i < start.length; i++) start[i] += (end[i] - start[i]) * b;
    fill(name);
    g.attributes.position.needsUpdate = g.attributes.target.needsUpdate = true;
    uniforms.blend.value = 0;
  }
  return {
    obj,
    form,
    pointer: (x: number, y: number) => uniforms.hand.value.set(x, y),
    gesture: (gesture: Gesture) => {
      if (gesture === "Swipe") uniforms.burst.value = 1.5;
      else
        form(
          {
            Fist: "Sphere",
            Open: "Scatter",
            Point: "Vortex",
            Peace: "Wave",
            Pinch: "Grab",
          }[gesture],
        );
    },
    quality: (low: boolean) => g.setDrawRange(0, low ? 6000 : count),
    update: (t: number, dt: number) => {
      const grabbing =
        current === "Grab" &&
        Math.abs(uniforms.hand.value.x) < 5 &&
        Math.abs(uniforms.hand.value.y) < 4;
      const factor = 1 - Math.exp(-dt * 9);
      uniforms.anchor.value.x +=
        ((grabbing ? uniforms.hand.value.x : 0) - uniforms.anchor.value.x) *
        factor;
      uniforms.anchor.value.y +=
        ((grabbing ? uniforms.hand.value.y : 0) - uniforms.anchor.value.y) *
        factor;
      uniforms.time.value = t;
      uniforms.blend.value = Math.min(1, uniforms.blend.value + dt * 2);
      uniforms.burst.value *= Math.exp(-dt * 3.2);
      obj.rotation.y = 0.18 * Math.sin(t * 0.23);
    },
  };
}
