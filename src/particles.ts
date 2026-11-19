import * as T from "three";

// Each vertex is a stable sample of a continuous surface. Morphs run on the GPU.
export function sculpture(lab: boolean) {
  const count = 10000,
    geom = new T.BufferGeometry(),
    samples = new Float32Array(count * 3);
  for (let i = 0; i < count; i++)
    samples.set(
      [(i + 0.5) / count, (i * 0.61803398875) % 1, (i * 0.41421356) % 1],
      i * 3,
    );
  geom.setAttribute("position", new T.BufferAttribute(samples, 3));
  geom.boundingSphere = new T.Sphere(new T.Vector3(), 9);
  const u = {
    t: { value: 0 },
    mode: { value: lab ? 4 : 0 },
    prev: { value: lab ? 4 : 0 },
    mixing: { value: 1 },
    cursor: { value: new T.Vector2(20, 20) },
    burst: { value: 0 },
    scale: { value: 1 },
  };
  const mat = new T.ShaderMaterial({
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    uniforms: u,
    vertexShader: `
  uniform float t,mixing,burst,scale;uniform int mode,prev;uniform vec2 cursor;varying float heat;
  const float TAU=6.2831853;
  vec3 shape(int m,vec3 s){
    float a=s.x*TAU,b=s.y*TAU,z=s.x*2.-1.,r=sqrt(max(0.,1.-z*z));
    vec3 sphere=vec3(cos(b)*r,z,sin(b)*r);
    if(m==0)return vec3(z*3.,sin(a*1.7+b*.55+t*.45)*.65+(s.y-.5)*2.,(s.y-.5)*2.+.4*cos(a*2.+t*.4));
    if(m==1){float ring=floor(s.z*7.)/7.;return vec3(cos(a)*(1.6+ring),sin(a+ring*3.)*.85,sin(a)*(1.6+ring));}
    if(m==2)return vec3(z*3.,sin(a*1.6+b*.65-t*.9)*.68,(s.y-.5)*3.5);
    if(m==3){float R=1.45+.5*cos(3.*a);return vec3(R*cos(2.*a),.8*sin(3.*a),R*sin(2.*a))+.24*vec3(cos(b)*cos(a),sin(b),cos(b)*sin(a));}
    if(m==5)return 1.65*sphere/max(abs(sphere.x),max(abs(sphere.y),abs(sphere.z)));
    if(m==6)return sphere*(1.3+2.3*s.z)+.2*sin(t+10.*sphere);
    if(m==7)return vec3(cos(3.*a+t)*(1.+s.y),z*2.,sin(3.*a+t)*(1.+s.y));
    if(m==8)return sphere*.55+vec3(clamp(cursor,vec2(-2.),vec2(2.)),0.);
    return sphere*2.;}
  void main(){vec3 p=mix(shape(prev,position),shape(mode,position),smoothstep(0.,1.,mixing));
  vec2 delta=p.xy-cursor;heat=exp(-1.7*dot(delta,delta));p.xy+=normalize(delta+vec2(.0001))*heat*.6;
  p+=burst*normalize(p+vec3(.001))*(1.+position.z)*2.;
  vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(scale*(15.+heat*20.)/max(1.,-mv.z),1.,7.);
  gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying float heat;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(mix(vec3(.49,.69,1.),vec3(1.,.52,.80),heat),(.68+.32*heat)*(1.-r*r));}`,
  });
  const points = new T.Points(geom, mat);
  points.position.set(0, 3, -3);
  let started = 0,
    pushed = -10;
  return {
    points,
    select(mode: number, time: number) {
      if (mode === 9) {
        pushed = time;
        return;
      }
      if (u.mode.value !== mode) {
        u.prev.value = u.mode.value;
        u.mode.value = mode;
        started = time;
      }
    },
    aim(x: number, y: number) {
      u.cursor.value.set(x, y);
    },
    count(n: number) {
      geom.setDrawRange(0, n);
    },
    update(t: number, pixelRatio: number) {
      u.t.value = t;
      u.scale.value = pixelRatio;
      u.mixing.value = Math.min(1, (t - started) * 2.5);
      u.burst.value = Math.exp(-4 * Math.max(0, t - pushed));
    },
  };
}
