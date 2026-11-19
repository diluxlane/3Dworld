import * as T from "three";

// Direction-space noise keeps the sky continuous around the viewer.
export const noise = `
float hash(vec3 p){p=fract(p*.31831+vec3(.12,.31,.57));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1)),f.x),f.y),f.z);}
float fb(vec3 p){return .55*noise3(p)+.27*noise3(p*2.04)+.13*noise3(p*4.13)+.05*noise3(p*8.3);}
`;
export function sky(id: number) {
  const horizon = [
    "#bb91c6",
    "#ffd3a5",
    "#589ea8",
    "#bd85b4",
    "#364a6a",
    "#23515e",
  ][id];
  const mat = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    uniforms: {
      h: { value: new T.Color(horizon) },
      sunset: { value: id === 1 ? 1 : 0 },
    },
    vertexShader: `
  varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
  varying vec3 dir;uniform vec3 h;uniform float sunset;${noise}
  void main(){vec3 d=normalize(dir);float y=max(0.,d.y);
  vec3 col=mix(h,vec3(.007,.008,.036),smoothstep(-.12,.65,y));
  float n=fb(d*5.+vec3(2.,7.,12.));float band=exp(-4.*abs(d.y-.38+d.x*.48));
  col+=band*pow(n,3.)*vec3(.48,.25,.69);
  vec3 cell=d*330.;float star=step(.976,hash(floor(cell)))*exp(-16.*dot(fract(cell)-.5,fract(cell)-.5));
  col+=star*(.35+y)*vec3(.85,.87,1.);
  float sun=max(0.,dot(d,normalize(vec3(.32,.13,-1.))));
  col+=vec3(1.,.58,.24)*(pow(sun,50.)*.68+pow(sun,500.)*.7+smoothstep(.99965,.99984,sun)*2.)*sunset;
  gl_FragColor=vec4(col,1.);
  #include <colorspace_fragment>
  }`,
  });
  const dome = new T.Mesh(new T.SphereGeometry(390, 48, 32), mat);
  dome.renderOrder = -10;
  return dome;
}
export function earth() {
  const mat = new T.ShaderMaterial({
    vertexShader: `varying vec3 n;varying vec3 v;void main(){n=normal;vec4 p=modelMatrix*vec4(position,1.);v=cameraPosition-p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `
  varying vec3 n;varying vec3 v;${noise}
  void main(){vec3 d=normalize(n);float f=fb(d*7.);float land=smoothstep(.49,.56,f);
  vec3 c=mix(vec3(.006,.065,.18),vec3(.09,.20,.15),land);
  float clouds=.78*fb(d*30.+vec3(3.*fb(d*9.),1.2*sin(d.y*24.),0.))+.22*fb(d*98.);c=mix(c,vec3(.81,.85,.89),smoothstep(.47,.67,clouds));
  float light=clamp(dot(d,normalize(vec3(1.,.28,.2)))+.20,.06,1.);
  float rim=pow(1.-max(dot(d,normalize(v)),0.),3.);
  gl_FragColor=vec4(c*light+rim*vec3(.11,.47,.92),1.);
  #include <colorspace_fragment>
  }`,
  });
  const mesh = new T.Mesh(new T.SphereGeometry(185, 112, 72), mat);
  mesh.position.set(-36, -149, -175);
  return mesh;
}
