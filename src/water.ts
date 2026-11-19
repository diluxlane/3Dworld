import * as T from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";

export function addWater(scene: T.Scene) {
  const water = new Reflector(new T.PlaneGeometry(72, 72), {
    textureWidth: 384,
    textureHeight: 384,
    multisample: 0,
    clipBias: 0.003,
    color: 0x567e79,
    shader: {
      uniforms: {
        color: { value: null },
        textureMatrix: { value: null },
        tDiffuse: { value: null },
        time: { value: 0 },
      },
      vertexShader: `uniform mat4 textureMatrix;varying vec4 proj;varying vec2 surface;
 void main(){surface=position.xy;proj=textureMatrix*vec4(position,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform sampler2D tDiffuse;uniform float time;varying vec4 proj;varying vec2 surface;
 void main(){vec2 uv=proj.xy/proj.w;float line=sin(surface.y*5.+time+1.8*sin(surface.x*1.3))+sin(surface.y*11.-time*.7+surface.x);uv.y+=.003*line;uv.x+=.0016*cos(surface.y*4.+time);
 vec3 col=texture2D(tDiffuse,clamp(uv,.001,.999)).rgb;gl_FragColor=vec4(mix(col,vec3(.02,.13,.14),.35)+.018*max(line,0.),1.);
 #include <colorspace_fragment>
 }`,
    },
  });
  water.position.y = -0.9;
  water.rotation.x = -Math.PI / 2;
  scene.add(water);
  return (t: number) => {
    (water.material as T.ShaderMaterial).uniforms.time.value = t;
  };
}
