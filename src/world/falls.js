// 瀑布：自上沿垂落的水帘——流动的白色条纹，上沿翻出白沫，越往下越散、越透，落到底部化成水雾。
// 颜色取天空的云受光 / 背光色（显示色，随时辰变化，入夜变暗），远处融入地平线雾色。
// 浮空仙岛的瀑布、溪涧峡谷源头的飞瀑、灵池溢出东崖的瀑布、寒潭的跌水共用这一套。
import * as THREE from 'three';
import { GLOBAL, NOISE_GLSL, FOGU } from './shaderlib.js';

const DEF_LIT = { value: new THREE.Vector3(1, 0.98, 0.94) }, DEF_SHADE = { value: new THREE.Vector3(0.8, 0.84, 0.88) };

// near：近景瀑布（条纹更细密、上沿白沫、底部更早散成水雾、近看半透出后面的岩壁）
export function fallMaterial(lit = DEF_LIT, shade = DEF_SHADE, { near = false, tint = [0.93, 0.97, 1.0], reach = false } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide,
    uniforms: { uTime: GLOBAL.uTime, uLit: lit, uShade: shade, uHz: FOGU.uFogAway, uNight: FOGU.uNight, uTint: { value: new THREE.Vector3(...tint) } },
    vertexShader: `varying vec2 vUv; varying float vFar;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.); vFar = smoothstep(500., 2600., -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `${NOISE_GLSL}
      uniform float uTime, uNight; uniform vec3 uLit, uShade, uHz, uTint; varying vec2 vUv; varying float vFar;
      void main(){
        float v = vUv.y;
        ${near ? `
        float s1 = nzv(vec2(vUv.x * 26., v * 9. - uTime * 2.1));
        float s2 = nzv(vec2(vUv.x * 70. + 3., v * 22. - uTime * 3.4));
        float s3 = nzv(vec2(vUv.x * 9. + 7., v * 3. - uTime * 1.2));
        float streak = s1 * .5 + s2 * .3 + s3 * .2;
        float lip = smoothstep(.12, .0, v);                                  // 上沿翻出的白沫
        float edge = smoothstep(0., .16 + v * .2, vUv.x) * smoothstep(1., .84 - v * .2, vUv.x);
        float body = mix(.42 + .58 * smoothstep(.35, .75, streak), .85, lip);
        float a = edge * smoothstep(1., ${reach ? '.95' : '.62'}, v) * smoothstep(0., .015, v) * mix(body, ${reach ? '.7 + .25 * streak' : '.55 + .2 * streak'}, smoothstep(.55, .95, v));` : `
        float s1 = nzv(vec2(vUv.x * 18., v * 7. - uTime * 1.6));
        float s2 = nzv(vec2(vUv.x * 46. + 3., v * 16. - uTime * 2.7));
        float streak = s1 * .6 + s2 * .4, lip = 0.;
        float edge = smoothstep(0., .22 + v * .2, vUv.x) * smoothstep(1., .78 - v * .2, vUv.x);
        float a = edge * smoothstep(1., .45, v) * smoothstep(0., .02, v) * mix(.5 + .5 * streak, .7, smoothstep(.3, .9, v));`}
        a *= .88;
        if (a < .01) discard;
        vec3 col = mix(uShade, uLit, .55 + .45 * streak) * mix(uTint, vec3(1.), max(v, lip));
        ${reach ? 'col = mix(col, uLit * 1.04, smoothstep(.72, 1., v) * .55);' : ''}
        col = mix(col, uHz, vFar * .5);
        gl_FragColor = vec4(col, a);
      }`,
  });
}

// 水帘几何（本地：自原点向 -Y 垂落 len，向 +Z 外抛；spread 为底部相对顶部的展宽倍数）
export function fallGeometry(len, w, { spread = 2.2, out = 0.8, NX = 6, NY = 40 } = {}) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= NY; j++) {
    const t = j / NY, ww = w * (1 + spread * t), o = w * out * Math.sqrt(t) + len * 0.05 * t;
    for (let i = 0; i <= NX; i++) {
      const u = i / NX;
      pos.push((u - 0.5) * ww, -len * t, o);
      uv.push(u, t);
    }
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// 地上的瀑布：顶部中心 (x, y, z)，水流外抛方向 ry（0 为 +Z），落差 len，水帘宽 w
const MATS = new Map();
export function waterfall(parent, { x, y, z, ry = 0, len, w, spread = 0.6, out = 0.35, lit, shade, near = true, order = 7, reach = false }) {
  const key = (near ? 'n' : 'f') + (reach ? 'r' : '') + (lit ? lit.value.x : 0);
  let mat = MATS.get(key);
  if (!mat) { mat = fallMaterial(lit, shade, { near, reach }); MATS.set(key, mat); }
  const m = new THREE.Mesh(fallGeometry(len, w, { spread, out, NX: 8, NY: Math.max(16, Math.round(len * 1.6)) }), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.renderOrder = order;
  m.frustumCulled = true;
  m.geometry.computeBoundingSphere();
  parent.add(m);
  return m;
}
