import * as T from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { riverX, riverWidth, waterLevel } from "./valley-ground";
import type { ValleyTier } from "./valley-dressing";

export function makeStream(scene: T.Scene, sky: T.Texture, gravel: T.Texture) {
  // A narrow ribbon follows the stream. It is clipped by the terrain at the banks.
  const geometry = new T.BufferGeometry(),
    p: number[] = [],
    idx: number[] = [];
  for (let i = 0; i <= 84; i++) {
    const z = -44 + i * 1.05,
      c = riverX(z),
      w = riverWidth(z) + 1.3;
    p.push(c - w, -z, 0, c + w, -z, 0);
    if (i > 0) {
      const a = i * 2 - 2;
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  // The geometry lies in local XY because Reflector uses its local +Z plane normal.
  geometry.setAttribute("position", new T.Float32BufferAttribute(p, 3));
  geometry.setIndex(idx.reverse());
  geometry.computeVertexNormals();
  const shader = {
    uniforms: {
      tDiffuse: { value: null },
      textureMatrix: { value: new T.Matrix4() },
      sky: { value: sky },
      gravel: { value: gravel },
      time: { value: 0 },
      useLocal: { value: 0 },
      color: { value: new T.Color() },
    },
    vertexShader: `uniform mat4 textureMatrix;varying vec4 projected;varying vec3 world;
 void main(){world=(modelMatrix*vec4(position,1.)).xyz;projected=textureMatrix*vec4(position,1.);gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
    fragmentShader: `uniform sampler2D tDiffuse,sky,gravel;uniform float time,useLocal;
 varying vec4 projected;varying vec3 world;
 void main(){
 vec2 p=world.xz;float t=time;float w=sin(p.y*4.8+p.x*2.2+t*1.05+sin(p.x*1.6+p.y*.43))+.46*sin(p.y*9.1-p.x*3.4+t*1.7);
 float v=cos(p.x*3.6-p.y*4.+t*.62+sin(p.y*1.88))+.31*cos(p.x*6.+p.y*9.+t*2.);
 vec3 N=normalize(vec3(.029*v,1.,.041*w)),V=normalize(cameraPosition-world),R=reflect(-V,N);
 float edge=pow(1.-max(dot(V,N),0.),3.);
 vec2 uv=vec2(atan(R.z,R.x)*.15915494+.5,asin(clamp(R.y,-1.,1.))*.31830989+.5);
 float skyline=smoothstep(.10,.45,R.y+.035*sin(29.*uv.x));
 vec3 reflected=mix(vec3(.037,.071,.060),texture2D(sky,uv).rgb*.42,skyline);
 if(useLocal>.5){vec2 tex=projected.xy/projected.w+vec2(v,w)*.0021;reflected=texture2D(tDiffuse,clamp(tex,.002,.998)).rgb;}
 float axis=.9+3.2*sin(p.y*.066+.25)+.8*sin(p.y*.16);
 float shore=smoothstep(.6,3.6,abs(p.x-axis));vec3 bed=texture2D(gravel,p*.61+.006*vec2(v,w)).rgb;
 vec3 base=mix(vec3(.020,.053,.046),bed*vec3(.41,.54,.45),.13+.53*shore);float glint=pow(max(dot(reflect(-normalize(vec3(-.39,.773,-.50)),N),V),0.),90.);
 vec3 c=mix(base,reflected,.18+.57*edge)+vec3(.86,.69,.42)*glint*.25;
 gl_FragColor=vec4(c,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`,
  };
  const water = new Reflector(geometry, {
    textureWidth: 320,
    textureHeight: 320,
    multisample: 0,
    clipBias: 0.006,
    shader,
  });
  const m = water.material as T.ShaderMaterial;
  m.uniforms.sky.value = sky;
  m.uniforms.gravel.value = gravel;
  m.side = T.DoubleSide;
  water.rotation.x = -Math.PI * 0.5;
  water.position.y = waterLevel;
  scene.add(water);
  const renderReflection = water.onBeforeRender.bind(water);
  let quality: ValleyTier = "Balanced",
    first = true;
  let prevX = Infinity,
    prevZ = Infinity,
    prevRotX = Infinity,
    prevRotY = Infinity,
    lastRefresh = -Infinity;
  water.onBeforeRender = (
    renderer,
    world,
    camera,
    geometry,
    material,
    group,
  ) => {
    // Planar reflections are only used on the High single-view path, and refreshed when the viewer moves.
    const stereo =
      camera instanceof T.ArrayCamera ||
      renderer.xr.isPresenting ||
      renderer.getScissorTest();
    const local = quality === "High" && !stereo;
    m.uniforms.useLocal.value = Number(local);
    if (!local) return;
    const e = camera.matrixWorld.elements;
    const changed =
      Math.abs(e[12] - prevX) +
        Math.abs(e[14] - prevZ) +
        3 * Math.abs(e[8] - prevRotX) +
        3 * Math.abs(e[9] - prevRotY) >
      0.018;
    const now = performance.now();
    if (first || (changed && now - lastRefresh >= 65)) {
      renderReflection(renderer, world, camera, geometry, material, group);
      lastRefresh = now;
      first = false;
      prevX = e[12];
      prevZ = e[14];
      prevRotX = e[8];
      prevRotY = e[9];
    }
  };
  return {
    setQuality(q: ValleyTier) {
      quality = q;
      first = true;
    },
    update(t: number) {
      m.uniforms.time.value = t;
    },
  };
}
