import * as THREE from "three";

const forms = [
  "Silk",
  "Orbit",
  "Wave",
  "Knot",
  "Sphere",
  "Cube",
  "Scatter",
  "Vortex",
  "Implode",
  "Burst",
];

const vertexShader = /* glsl */ `
  uniform float clockTime, blend, previousForm, nextForm, impulse, pixelScale;
  uniform vec2 hand, burstDirection;
  varying vec3 tint;
  varying float opacity;
  const float TAU = 6.2831853;

  vec3 pointOnForm(float form, float u, float v, float seed) {
    float a = TAU * u, b = TAU * v, time = clockTime * .27;
    float h = v * 2. - 1.;
    vec3 sphere = vec3(sqrt(max(0., 1.-h*h))*cos(a), h, sqrt(max(0., 1.-h*h))*sin(a));
    if (form < .5) { // Folded silk ribbons
      float r = 1.22 + .38*cos(3.*a+time) + .42*h;
      return vec3(r*cos(a), .68*sin(2.*a+time)+.52*h*cos(a-time), r*sin(a));
    }
    if (form < 1.5) { // Inclined orbital shells
      float band = floor(v*7.)/7.;
      float tilt = band*TAU+time*.21;
      float q = sin(a) * (1.4+.36*band);
      return vec3(cos(a)*(1.4+.36*band), q*sin(tilt), q*cos(tilt)) + .035*sphere;
    }
    if (form < 2.5) {
      return vec3((u-.5)*3.7, .58*sin(a*1.4+b*.46-time*2.)+.24*sin(b*1.5+time), h*1.1);
    }
    if (form < 3.5) { // Tubular trefoil
      vec3 p = vec3(sin(a)+2.*sin(2.*a), cos(a)-2.*cos(2.*a), -sin(3.*a))*.51;
      vec3 tangent = normalize(vec3(cos(a)+4.*cos(2.*a), -sin(a)+4.*sin(2.*a), -3.*cos(3.*a)));
      vec3 side = normalize(cross(tangent, vec3(.11,.04,1.)));
      return p+.19*(side*cos(b)+cross(tangent,side)*sin(b));
    }
    if (form < 4.5) return sphere*(1.36+.055*sin(3.*a+4.*b+time));
    if (form < 5.5) {
      vec3 cube = vec3(u*2.-1., fract(v*6.)*2.-1., mod(floor(v*6.),2.)*2.-1.);
      return (v<.333333 ? cube : (v<.666667 ? cube.zxy : cube.yzx))*1.12;
    }
    if (form < 6.5) return sphere*(1.2+1.05*seed+.2*sin(time*2.+a*4.));
    if (form < 7.5) {
      float r = .22+v*1.45;
      return vec3(cos(a+b*2.-time*2.)*r, h*1.45+.12*sin(a*2.), sin(a+b*2.-time*2.)*r);
    }
    if (form < 8.5) return sphere*(.27+.32*seed)+vec3(hand*vec2(1.7,1.1),0.);
    float kick = 1.-exp(-impulse*3.);
    float front = .5+.5*dot(sphere.xy,burstDirection);
    return sphere*(1.25+kick*.86*seed)+vec3(burstDirection,0.)*kick*front*(.55+1.6*seed);
  }
  void main() {
    float u=position.x, v=position.y, seed=position.z;
    vec3 p = mix(pointOnForm(previousForm,u,v,seed),pointOnForm(nextForm,u,v,seed),smoothstep(0.,1.,blend));
    float spin = sin(clockTime*.12)*.3 + .32;
    p.xz = mat2(cos(spin),-sin(spin),sin(spin),cos(spin))*p.xz;
    vec2 delta = p.xy-hand*vec2(2.,1.4);
    p.xy += delta*exp(-4.*dot(delta,delta))*(.16+impulse*1.05);
    vec4 mv = modelViewMatrix*vec4(p,1.);
    gl_Position = projectionMatrix*mv;
    gl_PointSize = clamp((1.8+2.8*seed)*pixelScale/max(.5,-mv.z),1.4,16.);
    float hue = .5+.5*sin(u*TAU*1.3+v*2.4+clockTime*.16);
    tint = mix(vec3(.16,.69,1.),vec3(.82,.38,1.),smoothstep(.1,.85,hue));
    tint = mix(tint,vec3(1.,.87,.66),smoothstep(.84,1.,hue)*.83);
    opacity = .42+.58*seed;
  }`;
const fragmentShader = /* glsl */ `
  varying vec3 tint;
  varying float opacity;
  void main(){
    vec2 uv = gl_PointCoord*2.-1.;
    float r = dot(uv,uv);
    if(r>1.) discard;
    float glow = exp(-3.4*r);
    gl_FragColor = vec4(mix(tint,vec3(1.),.25*glow),glow*opacity);
    #include <colorspace_fragment>
  }`;

export function createParticles(scene: THREE.Scene, lab: boolean) {
  const rows = matchMedia("(pointer: coarse)").matches ? 60 : 96;
  const columns = 144;
  const seeds = new Float32Array(rows * columns * 3);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const i = row * columns + col;
      const phase = Math.sin((i + 1) * 12.9898) * 43758.5453;
      seeds.set(
        [
          (col + (row % 2) * 0.5) / columns,
          (row + 0.5) / rows,
          phase - Math.floor(phase),
        ],
        i * 3,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(seeds, 3));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4.5);
  const initial = lab ? 4 : 0;
  const uniforms = {
    clockTime: { value: 0 },
    previousForm: { value: initial },
    nextForm: { value: initial },
    blend: { value: 1 },
    impulse: { value: 0 },
    hand: { value: new THREE.Vector2(8, 8) },
    pixelScale: { value: 5 },
    burstDirection: { value: new THREE.Vector2(1, 0) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const sculpture = new THREE.Points(geometry, material);
  sculpture.name = "Luminous filament sculpture";
  sculpture.position.set(0, 2, 0);
  scene.add(sculpture);
  const target = new THREE.Vector2(8, 8);
  let lastTime = -1;
  let pulse = 0;
  return {
    setForm(name: string) {
      const index = forms.indexOf(name);
      if (index < 0 || index === uniforms.nextForm.value) return;
      if (uniforms.blend.value > 0.5)
        uniforms.previousForm.value = uniforms.nextForm.value;
      uniforms.nextForm.value = index;
      uniforms.blend.value = 0;
      if (name === "Burst") pulse = 1;
    },
    interact(x: number, y: number, swipeX = 0, swipeY = 0) {
      if (swipeX * swipeX + swipeY * swipeY > 0.01)
        uniforms.burstDirection.value.set(swipeX, swipeY).normalize();
      target.set(
        THREE.MathUtils.clamp(x, -1, 1),
        THREE.MathUtils.clamp(y, -1, 1),
      );
      if (uniforms.hand.value.x === 8) uniforms.hand.value.copy(target);
      pulse = 1;
    },
    update(t: number) {
      const dt = lastTime < 0 ? 0 : THREE.MathUtils.clamp(t - lastTime, 0, 0.1);
      lastTime = t;
      uniforms.clockTime.value = t;
      uniforms.blend.value = Math.min(1, uniforms.blend.value + dt * 2.4);
      uniforms.hand.value.lerp(target, 1 - Math.exp(-dt * 16));
      uniforms.impulse.value = pulse;
      pulse *= Math.exp(-dt * 3);
      uniforms.pixelScale.value = Math.min(9, Math.max(4, innerHeight * 0.008));
    },
  };
}
