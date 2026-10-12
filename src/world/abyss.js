// 幽渊秘境：宗门地底被长期封存的魔修遗迹。独立的地下场景——从后山废弃石洞进入时切换过来，地表与地下不同时渲染。
// 结构：隐蔽入口（洞室）→ 下行甬道（石阶、幽蓝鬼火、暗红阵纹）→ 地下殿堂（temple 素材：圆形石殿、八道步道、水池与外环回廊）
//      → 核心祭坛（十七柱回廊中央，四尊镇魔石像以光链锁住一块裂开的魔晶）。
// 主体建筑为 assets/temple/temple-usd-workflow-under-zongmen/source/p_112_engrave.fbx（实为二进制 FBX，经 tools/convert_assets.py 转为 glb，南侧开出门洞）；
// 四尊石像为同一素材里的僧像（monk.glb）。洞壁、岩顶、殿外地面、甬道与洞室为程序生成，与殿门相接；
// 可走范围由殿内实际网格自上而下射线采样得到（步道、祭坛台、外环），水池不可涉；镜头限制在殿内、甬道与洞室的空间里。
import * as THREE from 'three';
import { ASSETS, loadAbyssAssets } from './assets.js';
import { CollisionWorld } from '../core/collision.js';
import { shaderMaterial, GLOBAL, injectFog } from './shaderlib.js';
import { clamp, lerp, wrapAngle, mulberry32 } from '../core/math.js';

export const Y0 = -300;                       // 地下场景整体在地表之下 300 米：与地表的互动点、区域互不重叠
// 入口洞室与下行甬道是同一条连续的洞道（局部坐标 [x, 地面 y, z]）：洞室（宽、高，后壁有上行石阶通回后山）→ 收窄为甬道 → 下行石阶 → 转折 → 殿门前。
// 中线、可走范围、洞壁网格、地面与镜头空间都取自同一条加密的平滑中线，彼此对齐（不再有洞室穹顶挡住甬道口）
const TUNNEL = [[-8, 14.5, 96], [-8, 14.5, 89], [-7.6, 14.5, 80], [-5.5, 11.5, 67], [-2, 7.6, 56], [3.5, 4.6, 46], [3, 2.2, 37], [0, -0.2, 29], [0, -0.2, 22]];
const TW = 2.2;                               // 甬道可走半宽
const HALL_R = 19.2;                          // 殿内可走半径（外环墙脚斜坡以内）
const DOOR_W = 2.45;                          // 殿门可走半宽
const CHAMBER = { x: -8, z: 89, r: 4.2, y: 14.5 };      // 洞室中心（可走半径由剖面给出）
export const ABYSS_EXIT = { x: -8, z: 95.2, y: 14.5 };   // 洞室后壁石阶下：返回后山
export const ABYSS_ENTRY = { x: -8, z: 91.6, y: 14.5 };  // 进入秘境的落脚点（面向甬道）
// 殿中四道加宽的石堤（东南西北四向），把一米宽的步道拓宽到 2.4 米
const CAUSEWAY = { r0: 5.2, r1: 16.4, hw: 1.2, top: -0.12, land: 13.6, landHw: 2.3 };
const APRON = { r0: 4.25, r1: 6.1, top: -0.13 };     // 十七柱回廊外沿一圈石台：从任一步道都能绕过柱子进到祭坛
// 区域灵气：甬道、殿堂、祭坛均为魔气，浓度不同（封印加固后减弱）；修炼规则据此判断（见 game/regions.js）
export const ABYSS_REGIONS = [
  { id: 'abyssAltar', name: '幽渊秘境 · 核心祭坛', test: (x, z) => Math.hypot(x, z) < 5, qi: 'demonic', level: 1.6, sealedLevel: 0.35 },
  { id: 'abyssHall', name: '幽渊秘境 · 地下殿堂', test: (x, z) => Math.hypot(x, z) < 21.5, qi: 'demonic', level: 1.0, sealedLevel: 0.3 },
  { id: 'abyssTunnel', name: '幽渊秘境 · 下行甬道', test: (x, z) => nearestTunnel(x, z).s > 12, qi: 'demonic', level: 0.5, sealedLevel: 0.2 },
  { id: 'abyssGate', name: '幽渊秘境 · 入口洞室', test: () => true, qi: 'demonic', level: 0.3, sealedLevel: 0.15 },
];

// ---------- 洞道中线：控制点经 Catmull-Rom 平滑后每 0.5 米取一点；地面高度按弧长在控制点之间线性插值，陡处做成 0.2 米一级的石阶 ----------
const TP = (() => {
  const ctrl = TUNNEL.map(([x, y, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
  const n = Math.ceil(curve.getLength() / 0.5);
  const pts = curve.getSpacedPoints(n).map((p) => ({ x: p.x, z: p.z, s: 0, y: 0 }));
  let s = 0;
  for (let i = 0; i < pts.length; i++) { if (i) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); pts[i].s = s; }
  // 控制点在平滑曲线上的弧长位置（取最近点）
  const ks = TUNNEL.map(([x, , z]) => pts.reduce((b, p) => (Math.hypot(p.x - x, p.z - z) < Math.hypot(b.x - x, b.z - z) ? p : b), pts[0]).s);
  const floorY = (sv) => {
    for (let k = 0; k < ks.length - 1; k++) if (sv <= ks[k + 1] || k === ks.length - 2) {
      const ya = TUNNEL[k][1], yb = TUNNEL[k + 1][1], u = clamp((sv - ks[k]) / Math.max(1e-6, ks[k + 1] - ks[k]), 0, 1);
      const y = lerp(ya, yb, u);
      return Math.abs(yb - ya) > 0.5 ? yb + Math.round((y - yb) / 0.2) * 0.2 : y;
    }
    return TUNNEL[TUNNEL.length - 1][1];
  };
  for (const p of pts) p.y = floorY(p.s);
  return { pts, len: s, floorY };
})();
// 剖面（按弧长 s，自洞室后壁量起）：可走半宽、洞壁半宽、洞高
const PROFILE = {
  hw: (s) => (s < 1.5 ? lerp(2.4, 4.0, s / 1.5) : s < 8.5 ? 4.0 : s < 13 ? lerp(4.0, TW, (s - 8.5) / 4.5) : TW),
  wall: (s) => PROFILE.hw(s) + (s < 13 ? 1.2 : 0.75),
  h: (s) => (s < 9 ? 5.6 : s < 14 ? lerp(5.6, 4.5, (s - 9) / 5) : 4.5),
};
// 最近的中线位置：{ d 距离, s 弧长, y 地面高, i 最近点序号 }
function nearestTunnel(x, z) {
  const P = TP.pts;
  let bi = 0, bd = Infinity;
  for (let i = 0; i < P.length; i += 4) { const d = (P[i].x - x) ** 2 + (P[i].z - z) ** 2; if (d < bd) { bd = d; bi = i; } }
  const i0 = Math.max(0, bi - 5), i1 = Math.min(P.length - 2, bi + 5);
  let best = { d: Infinity, s: 0, y: 0 };
  for (let i = i0; i <= i1; i++) {
    const a = P[i], b = P[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
    const u = clamp(((x - a.x) * dx + (z - a.z) * dz) / L2, 0, 1);
    const d = Math.hypot(x - a.x - dx * u, z - a.z - dz * u);
    if (d < best.d) { const sv = lerp(a.s, b.s, u); best = { d, s: sv, y: TP.floorY(sv), i }; }
  }
  return best;
}
function tunnelAt(sv) {
  const P = TP.pts;
  sv = clamp(sv, 0, TP.len);
  let i = 0;
  while (i < P.length - 2 && P[i + 1].s < sv) i++;
  const a = P[i], b = P[i + 1], u = clamp((sv - a.s) / Math.max(1e-6, b.s - a.s), 0, 1);
  return { x: lerp(a.x, b.x, u), z: lerp(a.z, b.z, u) };
}
function tunnelDir(sv) {
  const a = tunnelAt(sv - 0.6), b = tunnelAt(sv + 0.6), l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
}

// ---------- 材质 ----------
const SEAL = { value: 0 };     // 0 魔气未封（刻纹透暗红）→ 1 已加固封印（转为幽青）
const CRACK = { value: 0 };    // 魔晶裂开的程度（魔将现身时最大）
// 殿内石材：沿用素材的刻纹贴图（素材里误接为法线贴图的其实是颜色图，故不用法线贴图），整体偏冷、偏暗，有长期封存的灰旧感；
// 刻纹凹处透出暗红（封印加固后转为幽青）
const STONE = new Map();
function stoneMat(name, map, tint) {
  if (STONE.has(name)) return STONE.get(name);
  const m = new THREE.MeshStandardMaterial({ map: map || null, color: new THREE.Color(...tint), roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  if (m.map) m.map.anisotropy = 8;
  m.onBeforeCompile = (sh) => {
    injectFog(sh);
    sh.uniforms.uSeal = SEAL;
    sh.uniforms.uTime = GLOBAL.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSeal, uTime; varying vec3 vWp;')
      // 去掉素材贴图的大半饱和度（金铜、靛蓝都压成冷灰石色）
      .replace('#include <map_fragment>', `#include <map_fragment>
        { float l = dot(diffuseColor.rgb, vec3(.3, .59, .11)); diffuseColor.rgb = mix(vec3(l), diffuseColor.rgb, .35); }`)
      // 只有最深的刻槽透出暗红，越近祭坛越明显，并有一圈圈向外的脉动（封印加固后转为幽青、变弱）
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float lr = dot(diffuseColor.rgb, vec3(.3, .59, .11)) / max(dot(diffuse, vec3(.3, .59, .11)), 1e-3);
          float groove = smoothstep(.05, .012, lr);
          float d = length(vWp.xz);
          float near = smoothstep(12., 3., d) * .9 + .07;            // 远处只剩一点暗红（不与红衣魔修抢眼）
          float wave = .55 + .45 * sin(uTime * 1.2 - d * .5);
          totalEmissiveRadiance += mix(vec3(.32, .022, .028) * wave, vec3(.04, .13, .17), uSeal) * groove * near; }`);
  };
  m.customProgramCacheKey = () => 'abyss-stone';
  STONE.set(name, m);
  return m;
}

function waterMat() {
  return shaderMaterial({
    uniforms: { uTime: GLOBAL.uTime, uSeal: SEAL },
    side: THREE.DoubleSide,
    vertexPars: 'varying vec3 vW;',
    vertex: 'vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;',
    fragmentPars: 'uniform float uTime, uSeal; varying vec3 vW;',
    fragment: `
      vec3 V = normalize(cameraPosition - vW);
      vec2 q = vW.xz;
      float n = nzf(q * .35 + vec2(uTime * .04, -uTime * .03)) + nzf(q * 1.1 - vec2(uTime * .07, uTime * .05)) * .5;
      float fr = pow(1. - max(V.y, 0.), 3.);
      float r = length(vW.xz);
      vec3 c = vec3(.006, .009, .014);
      c += mix(vec3(.22, .02, .03), vec3(.04, .16, .22), uSeal) * smoothstep(10., 4., r) * (.2 + .8 * fr) * (.6 + .5 * n);   // 祭坛光的倒影
      c += vec3(.05, .07, .10) * fr * (.5 + .7 * n);                                                                           // 冷色天光
      c += vec3(.35, .45, .55) * smoothstep(3.6, 2., length(vW.xz - vec2(.6, -.4)) - n * .8) * .25;                             // 天窗光斑
      c += vec3(.45, .58, .7) * pow(max(0., n - .62) * 2.6, 3.) * .3 * fr;
      gl_FragColor = vec4(c, 1.);`,
  });
}

// 岩壁 / 岩顶：三向投影的实拍岩石贴图，暗而冷
function rockMat(dark = 0.42, side = THREE.DoubleSide) {
  const T = ASSETS.tex;
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(dark, dark * 1.02, dark * 1.1), roughness: 0.96, side });
  m.onBeforeCompile = (sh) => {
    injectFog(sh);
    sh.uniforms.tRock = { value: T.rock_d || null };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.)).xyz; vWn = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tRock; varying vec3 vWp; varying vec3 vWn;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        { vec3 w = pow(abs(vWn), vec3(4.)); w /= w.x + w.y + w.z;
          vec3 t = texture2D(tRock, vWp.zy / 7.).rgb * w.x + texture2D(tRock, vWp.xz / 7.).rgb * w.y + texture2D(tRock, vWp.xy / 7.).rgb * w.z;
          diffuseColor.rgb *= .35 + 1.7 * dot(t, vec3(.3, .59, .11)); }`);
  };
  m.customProgramCacheKey = () => 'abyss-rock';
  return m;
}

// 阵纹：暗红的同心符环（画布贴图），加法混合；封印加固后转为幽青并减弱
let RUNE_TEX = null;
function runeTexture() {
  if (RUNE_TEX) return RUNE_TEX;
  const S = 1024, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), c = S / 2;
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); };
  ring(500, 6); ring(472, 3); ring(330, 5); ring(302, 2); ring(150, 4);
  g.font = '44px "KaiTi","STKaiti",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const glyphs = '幽冥镇魔封禁玄阴血煞噬魂锁骨寂灭无间';
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; g.save(); g.translate(c + Math.cos(a) * 402, c + Math.sin(a) * 402); g.rotate(a + Math.PI / 2); g.fillText(glyphs[i % glyphs.length], 0, 0); g.restore(); }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.lineWidth = 4; g.beginPath(); g.moveTo(c + Math.cos(a) * 150, c + Math.sin(a) * 150); g.lineTo(c + Math.cos(a) * 472, c + Math.sin(a) * 472); g.stroke();
    for (let k = 0; k < 3; k++) { g.lineWidth = 7; g.beginPath(); g.arc(c, c, 210 + k * 24, a + 0.2, a + 0.2 + (k === 1 && i % 2 ? 0.12 : 0.34)); g.stroke(); }
  }
  RUNE_TEX = new THREE.CanvasTexture(cv);
  RUNE_TEX.anisotropy = 8;
  return RUNE_TEX;
}
function runeMat(strength = 1) {
  return shaderMaterial({
    uniforms: { tRune: { value: runeTexture() }, uTime: GLOBAL.uTime, uSeal: SEAL, uK: { value: strength } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, fog: false,
    vertexPars: 'varying vec2 vUv;',
    vertex: 'vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mvPosition;',
    fragmentPars: 'uniform sampler2D tRune; uniform float uTime, uSeal, uK; varying vec2 vUv;',
    fragment: `
      float t = texture2D(tRune, vUv).r;
      float r = length(vUv - .5) * 2.;
      float pulse = .55 + .45 * sin(uTime * 1.4 - r * 6.);
      vec3 c = mix(vec3(.85, .07, .05), vec3(.16, .6, .78), uSeal) * t * pulse * uK * mix(1., .55, uSeal);
      gl_FragColor = vec4(c, 1.);`,
  });
}

// 光柱：殿顶天窗漏下的冷光（加法、两端渐隐）
function shaftMesh(h, r0, r1, k = 0.5) {
  const geo = new THREE.CylinderGeometry(r0, r1, h, 32, 1, true);
  const m = shaderMaterial({
    uniforms: { uTime: GLOBAL.uTime, uK: { value: k } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexPars: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV;',
    vertex: 'vUv = uv; vN = normalize(normalMatrix * normal); vec4 mvPosition = modelViewMatrix * vec4(position, 1.); vV = -mvPosition.xyz; gl_Position = projectionMatrix * mvPosition;',
    fragmentPars: 'uniform float uTime, uK; varying vec2 vUv; varying vec3 vN; varying vec3 vV;',
    fragment: `
      float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.4);
      float dust = .7 + .3 * nzv(vec2(vUv.x * 18., vUv.y * 4. - uTime * .2));
      float k = edge * smoothstep(0., .3, vUv.y) * smoothstep(1., .6, vUv.y) * dust;
      gl_FragColor = vec4(vec3(.42, .55, .70) * k * uK, 1.);`,
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.renderOrder = 8;
  return mesh;
}

// 粒子：魔气（暗红烟缕，绕祭坛缓缓旋转）与浮尘（光柱里的微光）
function qiParticles(n, radius, height, dust = false) {
  const pos = new Float32Array(n * 3), seed = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
    pos.set([Math.cos(a) * r, Math.random() * height, Math.sin(a) * r], i * 3);
    seed.set([Math.random(), Math.random()], i * 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
  const u = { uTime: GLOBAL.uTime, uSeal: SEAL, uLevel: { value: 1 }, uDust: { value: dust ? 1 : 0 } };
  const m = shaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.CustomBlending, fog: false,
    vertexPars: 'attribute vec2 aSeed; uniform float uTime, uSeal, uLevel, uDust; varying float vA; varying float vS;',
    vertex: `
      vS = aSeed.x;
      vec3 p = position;
      float a = uTime * (.05 + .07 * aSeed.y) * (uDust > .5 ? .3 : 1.);
      p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
      p.y += sin(uTime * .5 + aSeed.x * 9.) * .5;
      vA = uLevel * (uDust > .5 ? .6 : (1. - uSeal * .75) * .16);
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.);
      gl_PointSize = (uDust > .5 ? 9. : 900. + 700. * aSeed.y) / -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;`,
    fragmentPars: 'uniform float uSeal, uDust, uTime; varying float vA; varying float vS;',
    fragment: `
      vec2 q = gl_PointCoord - .5; float d = length(q);
      float a = uDust > .5 ? smoothstep(.5, .1, d) : pow(smoothstep(.5, .0, d), 1.6) * (.4 + .6 * nzv(q * 4. + vS * 17. + uTime * .05));
      vec3 c = uDust > .5 ? vec3(.7, .85, 1.) : mix(mix(vec3(.30, .02, .04), vec3(.16, .015, .06), vS), vec3(.04, .12, .16), uSeal);
      gl_FragColor = vec4(c * a * vA, uDust > .5 ? 0. : a * vA * .55);`,
  });
  m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 7;
  pts.userData.u = u;
  return pts;
}

// 柔和的圆形光晕（鬼火四周的一圈微光）
let HALO = null;
function haloTexture() {
  if (HALO) return HALO;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.3, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  HALO = new THREE.CanvasTexture(cv);
  return HALO;
}

let FLAME = null;
function flameTexture() {
  if (FLAME) return FLAME;
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 96;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 70, 2, 32, 60, 34);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(32, 4); g.bezierCurveTo(52, 40, 60, 70, 32, 92); g.bezierCurveTo(4, 70, 12, 40, 32, 4); g.fill();
  FLAME = new THREE.CanvasTexture(cv);
  return FLAME;
}

// 沿中线的隧道管：拱形横截面、带起伏的岩壁
function tunnelTube(rand) {
  const ring = 26, pos = [], idx = [], P = TP.pts;
  const rows = [];
  // 后壁：起点之后再延伸约 4 米（上行石阶在这里），最后几圈收拢成圆拱形的尽头
  rows.push({ s: -4.7, shrink: 0 });
  for (let k = 6; k >= 1; k--) rows.push({ s: -k * 0.7, shrink: k <= 3 ? 1 : Math.sqrt(Math.max(0, 1 - ((k - 3) / 3.3) ** 2)) });
  for (let i = 0; i < P.length; i += 2) rows.push({ s: P[i].s, shrink: 1 });
  rows.forEach((row, i) => {
    const sv = row.s, c = tunnelAt(Math.max(0, sv)), dir = tunnelDir(Math.max(0, sv));
    const cx = c.x + dir.x * Math.min(0, sv), cz = c.z + dir.z * Math.min(0, sv);
    const sx = -dir.z, sz = dir.x;
    const y0 = TP.floorY(Math.max(0, sv));
    const W0 = PROFILE.wall(Math.max(0, sv)), H0 = PROFILE.h(Math.max(0, sv));
    for (let j = 0; j <= ring; j++) {
      const a = Math.PI * (-0.12 + 1.24 * (j / ring));
      const n = 0.38 * Math.sin(i * 0.7 + j * 1.3) + 0.22 * Math.sin(i * 0.23 + j * 2.9) + (rand() - 0.5) * 0.28;
      const w = (W0 + n) * row.shrink, h = (H0 + n * 0.8) * (0.55 + 0.45 * row.shrink);
      pos.push(cx + sx * Math.cos(a) * w, y0 + Math.sin(a) * h, cz + sz * Math.cos(a) * w);
      if (i < rows.length - 1 && j < ring) { const k = i * (ring + 1) + j; idx.push(k, k + ring + 1, k + 1, k + 1, k + ring + 1, k + ring + 2); }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Abyss {
  constructor() {
    this.ready = false;
    this.bounds = { x0: -40, x1: 40, z0: -40, z1: 100 };
    this.cw = new CollisionWorld(12);
    this.sealed = false;
    this.pillars = [];
    this.spokes = null;
    this.obst = [];          // 圆形障碍（柱、石像、魔晶、石灯、门柱）：寻路与出生点避让
  }

  async ensure() {
    if (this.ready) return this;
    await loadAbyssAssets();
    this.build();
    this.ready = true;
    this.setSealed(this.sealed);
    return this;
  }

  // ---------- 场景 ----------
  build() {
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040507);
    scene.fog = new THREE.FogExp2(0x040507, 1);       // 只为让材质带上雾的代码；雾的实际参数在进入秘境时写入 FOGU
    const root = this.root = new THREE.Group();
    root.position.y = Y0;
    scene.add(root);
    const rand = mulberry32(911);
    // 灯光：幽蓝天光、天窗冷光（投影）、祭坛暗红光、殿门与入口洞室透下的一点冷光
    this.hemi = new THREE.HemisphereLight(0x50698a, 0x10121a, 1.5);
    scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xa6c4e4, 2.2);
    sun.position.set(-5, Y0 + 40, 6); sun.target.position.set(0, Y0, 0);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -23, right: 23, top: 23, bottom: -23, near: 10, far: 64 });
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    this.altarLight = new THREE.PointLight(0xff3424, 14, 18, 1.6);
    this.altarLight.position.set(0, Y0 + 2.6, 0);
    scene.add(this.altarLight);
    this.doorLight = new THREE.PointLight(0x6f9cc8, 18, 24, 1.4);
    this.doorLight.position.set(0, Y0 + 4, 25);
    scene.add(this.doorLight);
    const gateLight = new THREE.PointLight(0x9fbfe0, 26, 18, 1.4);
    gateLight.position.set(ABYSS_EXIT.x, Y0 + 18.5, ABYSS_EXIT.z + 1.5);
    scene.add(gateLight);

    // 地下神殿（temple 素材）
    const temple = this.temple = ASSETS.models.abyss_temple.scene.clone(true);
    const TINT = { d605deea: [0.5, 0.54, 0.62], '93d99f61': [0.5, 0.48, 0.52], '27f3765': [0.6, 0.63, 0.7], '5b86a32a': [0.58, 0.6, 0.66] };
    temple.traverse((o) => {
      if (!o.isMesh) return;
      const name = o.material.name;
      if (name === 'water') { o.material = waterMat(); o.userData.water = true; return; }
      if (name === 'emit') { o.material = new THREE.MeshBasicMaterial({ color: 0xff3a20 }); o.userData.emit = true; this.emitMat = o.material; return; }
      o.material = stoneMat(name, o.material.map, TINT[name] || [0.58, 0.6, 0.66]);
      o.castShadow = true; o.receiveShadow = true;
    });
    root.add(temple);
    scene.updateMatrixWorld(true);          // 射线采样前先算好世界矩阵（整体位于 Y0 之下）

    // 可走地面：对殿内网格自上而下射线采样（水面处不可走）；十七柱回廊的柱子由水平射线找出
    this.buildFloor(temple);
    this.buildPillars(temple);
    this.buildPortal();
    this.buildCauseways();
    this.buildCavern(rand);
    this.buildTunnel(rand);
    this.buildAltar();
    const shaft = shaftMesh(15.6, 2.3, 3.1, 0.11);
    shaft.position.set(0, 8.0, 0);
    root.add(shaft);
    this.qi = qiParticles(150, 17, 2.2);
    root.add(this.qi);
    this.dust = qiParticles(140, 4.2, 13, true);
    this.dust.position.y = 0.5;
    root.add(this.dust);
    // 鬼火：甬道两侧的石灯（幽蓝火苗，发光体，不加真实光源）
    this.flames = [];
    const lampMat = stoneMat('lamp', null, [0.34, 0.35, 0.39]);
    const lampS = [16, 25, 34, 43, 52, 61, 70].filter((v) => v < TP.len - 4);
    lampS.forEach((sv, li) => {
      const side = li % 2 ? -1 : 1, c = tunnelAt(sv), tg = tunnelDir(sv);
      const sx = -tg.z, sz = tg.x;
      const x = c.x + sx * (TW + 0.35) * side, z = c.z + sz * (TW + 0.35) * side, y = TP.floorY(sv);
      const lamp = new THREE.Group();
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.17, 0.42, 8), lampMat);
      bowl.position.y = 0.9;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 0.75, 6), lampMat);
      leg.position.y = 0.37;
      lamp.add(bowl, leg);
      lamp.position.set(x, y, z);
      lamp.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(), color: 0x7fcfff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      fl.position.set(x, y + 1.42, z); fl.scale.set(0.8, 1.2, 1);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: 0x1f4a66, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      halo.position.set(x, y + 1.35, z); halo.scale.set(2.6, 2.6, 1);
      root.add(lamp, fl, halo);
      this.flames.push(fl);
      this.cw.addCyl({ x, z, y0: Y0 + y, y1: Y0 + y + 1.2, r: 0.35 });
      this.obst.push({ x, z, r: 0.35 });
    });
    this.spokes = this.findSpokes();
    this.buildNav();
  }

  buildFloor(temple) {
    const rc = new THREE.Raycaster(), meshes = [];
    temple.traverse((o) => { if (o.isMesh && !o.userData.emit) meshes.push(o); });
    const N = this.fn = 128, step = this.fs = 0.33, half = this.fhalf = (N * step) / 2;
    const fh = new Float32Array(N * N).fill(NaN);
    const down = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
    rc.far = 5;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -half + (i + 0.5) * step, z = -half + (j + 0.5) * step;
      if (Math.hypot(x, z) > HALL_R) continue;
      o.set(x, Y0 + 2.6, z);
      rc.set(o, down);
      const h = rc.intersectObjects(meshes, false)[0];
      if (!h || h.object.userData.water) continue;
      fh[j * N + i] = h.point.y - Y0;
    }
    // 孤立的格子（栏杆顶、雕饰）不可站
    const out = fh.slice();
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      if (Number.isNaN(fh[j * N + i])) continue;
      let cnt = 0;
      for (const k of [-1, 1, -N, N]) if (!Number.isNaN(fh[j * N + i + k])) cnt++;
      if (cnt < 2) out[j * N + i] = NaN;
    }
    this.fh = out;
  }

  // 十七柱回廊：自祭坛中心向外的水平射线命中的柱面，按角度聚类为柱子
  buildPillars(temple) {
    const rc = new THREE.Raycaster(), meshes = [];
    temple.traverse((o) => { if (o.isMesh && !o.userData.water && !o.userData.emit) meshes.push(o); });
    const hits = [], M = 720;
    rc.far = 7;
    for (let k = 0; k < M; k++) {
      const a = (k / M) * Math.PI * 2;
      rc.set(new THREE.Vector3(0, Y0 + 1.6, 0), new THREE.Vector3(Math.sin(a), 0, Math.cos(a)));
      const h = rc.intersectObjects(meshes, false)[0];
      hits.push(h && h.distance > 3 && h.distance < 6 ? h.distance : null);
    }
    let start = hits.findIndex((d) => d == null);
    if (start < 0) start = 0;
    let seg = null;
    for (let n = 1; n <= M; n++) {
      const k = (start + n) % M, d = hits[k];
      if (d != null) (seg ||= []).push([start + n, d]);
      if ((d == null || n === M) && seg) {
        const a = ((seg[0][0] + (seg.length - 1) / 2) / M) * Math.PI * 2, dmin = Math.min(...seg.map((s) => s[1]));
        const r = Math.max(0.25, Math.min(0.75, (seg.length / M) * Math.PI * dmin));
        const c = dmin + r * 0.9;
        this.pillars.push({ x: Math.sin(a) * c, z: Math.cos(a) * c, r, a });
        this.obst.push({ x: Math.sin(a) * c, z: Math.cos(a) * c, r });
        this.cw.addCyl({ x: Math.sin(a) * c, z: Math.cos(a) * c, y0: Y0 - 1, y1: Y0 + 5, r: r + 0.06 });
        seg = null;
      }
    }
  }

  // 殿中四道石堤：沿东南西北四条步道铺出 2.4 米宽的青石堤，两侧压一道深色边石，堤身没入水中
  buildCauseways() {
    const C = CAUSEWAY, len = C.r1 - C.r0, mid = (C.r0 + C.r1) / 2, H = 0.7;
    const mat = stoneMat('causeway', ASSETS.tex.block_d, [0.46, 0.48, 0.53]);
    const edge = stoneMat('causewayEdge', ASSETS.tex.block_d, [0.33, 0.34, 0.38]);
    const body = new THREE.BoxGeometry(C.hw * 2 - 0.36, H, len);
    const uv = body.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (C.hw * 2) / 1.6, uv.getY(i) * len / 1.6);
    const rim = new THREE.BoxGeometry(0.18, H + 0.02, len + 0.02);
    const landLen = C.r1 - C.land, land = new THREE.BoxGeometry(C.landHw * 2, H, landLen);
    const luv = land.attributes.uv;
    for (let i = 0; i < luv.count; i++) luv.setXY(i, luv.getX(i) * (C.landHw * 2) / 1.6, luv.getY(i) * landLen / 1.6);
    // 柱廊外沿的石台（圆环，台身没入水中）
    const ringG = new THREE.CylinderGeometry(APRON.r1, APRON.r1 + 0.1, H, 72, 1, true);
    const ringTop = new THREE.RingGeometry(APRON.r0, APRON.r1, 72, 2);
    const rtUv = ringTop.attributes.uv, rtP = ringTop.attributes.position;
    for (let i = 0; i < rtUv.count; i++) rtUv.setXY(i, rtP.getX(i) / 1.6, rtP.getY(i) / 1.6);
    const top = new THREE.Mesh(ringTop, mat);
    top.rotation.x = -Math.PI / 2; top.position.y = APRON.top;
    const side = new THREE.Mesh(ringG, edge);
    side.position.y = APRON.top - H / 2;
    for (const o of [top, side]) { o.receiveShadow = true; this.root.add(o); }
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2, g = new THREE.Group();
      const m = new THREE.Mesh(body, mat);
      m.position.set(0, C.top - H / 2, mid);
      g.add(m);
      for (const sd of [-1, 1]) { const e = new THREE.Mesh(rim, edge); e.position.set(sd * (C.hw - 0.09), C.top - H / 2 + 0.01, mid); g.add(e); }
      const lm = new THREE.Mesh(land, mat);                              // 近外环的落脚石台
      lm.position.set(0, C.top - H / 2 - 0.004, (C.land + C.r1) / 2);
      g.add(lm);
      g.rotation.y = a;
      g.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = true; } });
      this.root.add(g);
    }
  }

  // 殿门：门洞两侧石柱、门楣与门槛（遮住门洞切口，接上甬道）
  buildPortal() {
    const g = new THREE.Group(), mat = stoneMat('portal', ASSETS.tex.block_d, [0.4, 0.42, 0.47]);
    const R = 21.35, W = 5.4;
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 8.6, 1.9), mat);
      p.position.set(s * (W / 2 + 0.45), 3.9, R);
      p.castShadow = p.receiveShadow = true;
      g.add(p);
      this.cw.addBox({ x: s * (W / 2 + 0.45), z: R, y0: Y0 - 1, y1: Y0 + 8.2, hx: 0.6, hz: 0.95 });
      this.obst.push({ x: s * (W / 2 + 0.45), z: R, r: 0.95 });
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(W + 2.8, 1.3, 2.1), mat);
    lintel.position.set(0, 8.6, R); lintel.castShadow = true;
    g.add(lintel);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.9), runeMat(0.7));
    plaque.position.set(0, 8.6, R + 1.07);
    g.add(plaque);
    // 门槛与门外石台
    const sill = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.6, 10.5), mat);
    sill.position.set(0, -0.5, R - 0.2); sill.receiveShadow = true;
    g.add(sill);
    this.root.add(g);
  }

  buildCavern(rand) {
    // 环形岩壁（殿外），甬道口不封；岩顶为低穹顶；殿外地面
    const ring = 72, rows = 14, pos = [], idx = [];
    const R0 = 30.5, H = 27, gapA = Math.PI / 2;      // 甬道口在 +Z 方向（atan2(z, x) = π/2）
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= ring; i++) {
      const a = (i / ring) * Math.PI * 2, t = j / rows;
      const da = Math.abs(wrapAngle(a - gapA));
      const n = Math.sin(a * 5 + t * 3) * 1.6 + Math.sin(a * 11 + 1.3) * 0.9 + (rand() - 0.5) * 1.1;
      const r = R0 + n - t * t * 6 + (da < 0.2 && t < 0.3 ? 2 : 0);
      pos.push(Math.cos(a) * r, -2.4 + t * H, Math.sin(a) * r);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < ring; i++) {
      const a = ((i + 0.5) / ring) * Math.PI * 2, y = -2.4 + ((j + 0.5) / rows) * H;
      if (Math.abs(wrapAngle(a - gapA)) < 0.12 && y < 5) continue;       // 甬道口
      const k = j * (ring + 1) + i;
      idx.push(k, k + 1, k + ring + 1, k + 1, k + ring + 2, k + ring + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const wall = new THREE.Mesh(g, rockMat(0.34));
    wall.receiveShadow = true;
    this.root.add(wall);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(25.5, 48, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), rockMat(0.24));
    cap.scale.set(1, 0.3, 1); cap.position.y = 24;
    this.root.add(cap);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(34, 64), rockMat(0.3, THREE.FrontSide));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1.7; floor.receiveShadow = true;
    this.root.add(floor);
    // 殿外散落的碎石（实拍山石）
    const rocks = ASSETS.models.rocks_a?.scene;
    if (rocks) {
      let src = null; rocks.traverse((o) => { if (o.isMesh && !src) src = o; });
      if (src) {
        const n = 22, im = new THREE.InstancedMesh(src.geometry, rockMat(0.36, THREE.FrontSide), n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
        for (let i = 0; i < n; i++) {
          let a = rand() * Math.PI * 2;
          if (Math.abs(wrapAngle(a - Math.PI / 2)) < 0.3) a += 0.6;
          const r = 23 + rand() * 6, s = 0.8 + rand() * 1.8;
          e.set(rand() * 0.6, rand() * 6.28, rand() * 0.6);
          m4.compose(new THREE.Vector3(Math.cos(a) * r, -1.7 + s * 0.15, Math.sin(a) * r), q.setFromEuler(e), new THREE.Vector3(s, s * 0.8, s));
          im.setMatrixAt(i, m4);
        }
        im.castShadow = im.receiveShadow = true;
        this.root.add(im);
      }
    }
  }

  buildTunnel(rand) {
    // 与旧代码兼容的曲线接口（石灯、阵纹按比例取点）
    this.curve = { getPointAt: (t) => { const c = tunnelAt(t * TP.len); return new THREE.Vector3(c.x, TP.floorY(t * TP.len), c.z); },
      getTangentAt: (t) => { const d = tunnelDir(t * TP.len); return new THREE.Vector3(d.x, 0, d.z); } };
    const tube = new THREE.Mesh(tunnelTube(rand), rockMat(0.4));
    tube.receiveShadow = true;
    this.root.add(tube);
    // 地面：沿中线的石板与台阶，宽度随剖面（洞室宽、甬道窄）
    const pos = [], uv = [], idx = [], P = TP.pts;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], dir = tunnelDir(p.s), sx = -dir.z, sz = dir.x, w = PROFILE.hw(p.s) + 0.75;
      for (const k of [-1, 1]) pos.push(p.x + sx * k * w, p.y + 0.01, p.z + sz * k * w);
      uv.push(0, p.s / 1.6, (w * 2) / 3.2, p.s / 1.6);
      if (i < P.length - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const fm = stoneMat('tunnelFloor', ASSETS.tex.block_d, [0.5, 0.52, 0.56]);
    if (fm.map) { fm.map = fm.map.clone(); fm.map.wrapS = fm.map.wrapT = THREE.RepeatWrapping; fm.map.needsUpdate = true; }
    const floor = new THREE.Mesh(g, fm);
    floor.receiveShadow = true;
    this.root.add(floor);
    // 洞室后壁：上行石阶通向岩缝里透下的天光（来路，回后山）。石阶下设挡，人在阶前按 E 返回
    const back = tunnelAt(0), dir0 = tunnelDir(0), ry = Math.atan2(dir0.x, dir0.z);
    const stair = new THREE.Group();
    const behind = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 5.2), fm);           // 起点之后的一小块地面
    behind.rotation.x = -Math.PI / 2; behind.position.set(back.x - dir0.x * 2.4, CHAMBER.y + 0.005, back.z - dir0.z * 2.4);
    behind.receiveShadow = true;
    stair.add(behind);
    for (let k = 0; k < 7; k++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.24 * (k + 1), 0.48), fm);
      st.position.set(back.x - dir0.x * (0.9 + k * 0.46), CHAMBER.y + 0.12 * (k + 1), back.z - dir0.z * (0.9 + k * 0.46));
      st.rotation.y = ry;
      st.receiveShadow = st.castShadow = true;
      stair.add(st);
    }
    this.root.add(stair);
    this.cw.addBox({ x: back.x - dir0.x * 2.3, z: back.z - dir0.z * 2.3, y0: Y0 + CHAMBER.y - 1, y1: Y0 + CHAMBER.y + 3, hx: 1.5, hz: 1.9, ry, walk: false });
    // 岩缝里的天光：石阶顶上一片柔和的亮面与很淡的光束（不刺眼）
    const exitGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.4), new THREE.MeshBasicMaterial({ color: 0x8faac6, fog: false }));
    exitGlow.position.set(back.x - dir0.x * 4.05, CHAMBER.y + 2.95, back.z - dir0.z * 4.05);
    exitGlow.rotation.y = ry;
    this.root.add(exitGlow);
    const beam = shaftMesh(3.6, 0.7, 1.2, 0.12);
    beam.position.set(back.x - dir0.x * 3.2, CHAMBER.y + 2.6, back.z - dir0.z * 3.2);
    this.root.add(beam);
    this.exitPos = { x: back.x + dir0.x * 0.6, z: back.z + dir0.z * 0.6 };
    // 甬道末段的暗红阵纹（引向殿门）
    for (const t of [0.72, 0.87]) {
      const c = this.curve.getPointAt(t);
      const r = new THREE.Mesh(new THREE.CircleGeometry(1.9, 40), runeMat(0.5));
      r.rotation.x = -Math.PI / 2; r.position.set(c.x, c.y + 0.03, c.z);
      this.root.add(r);
    }
  }

  buildAltar() {
    const big = new THREE.Mesh(new THREE.CircleGeometry(4.1, 64), runeMat(1));
    const ay = this.hallY(0, 3.5);
    big.rotation.x = -Math.PI / 2; big.position.y = (Number.isNaN(ay) ? -0.17 : ay) + 0.02;
    this.root.add(big);
    // 四尊镇魔石像（素材里的僧像，放大到约 2 米），面向魔晶
    const monk = ASSETS.models.monk.scene;
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.4, emissive: 0xff2a18, emissiveIntensity: 0.8 });
    this.statues = [];
    const bb = new THREE.Box3().setFromObject(monk), s = 2.0 / (bb.max.y - bb.min.y);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2, r = 2.75;
      const m = monk.clone(true);
      m.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.name === 'eye' ? this.eyeMat : stoneMat('monk-' + o.material.name, o.material.map, [0.55, 0.57, 0.62]);
        o.castShadow = true; o.receiveShadow = true;
      });
      m.scale.setScalar(s);
      const x = Math.sin(a) * r, z = Math.cos(a) * r, y = this.heightLocal(x, z);
      m.position.set(x, (Number.isNaN(y) ? -0.17 : y) - bb.min.y * s, z);
      m.rotation.y = Math.atan2(-x, -z);
      this.root.add(m);
      this.statues.push(m);
      this.cw.addCyl({ x, z, y0: Y0 - 1, y1: Y0 + 2, r: 0.5 });
      this.obst.push({ x, z, r: 0.5 });
    }
    // 魔晶：暗红晶簇悬在祭坛上方，光链连向四尊石像
    const crystal = new THREE.Group();
    const cm = this.crystalMat = new THREE.MeshStandardMaterial({ color: 0x3a0a10, roughness: 0.22, metalness: 0.1, emissive: 0xff2410, emissiveIntensity: 1 });
    for (let i = 0; i < 7; i++) {
      const g = new THREE.OctahedronGeometry(1, 0); g.scale(0.3, 1.0, 0.3);
      const m = new THREE.Mesh(g, cm);
      const a = i * 0.9, tilt = i === 0 ? 0 : 0.5;
      m.position.set(Math.cos(a) * (i ? 0.3 : 0), i ? -0.25 : 0, Math.sin(a) * (i ? 0.3 : 0));
      m.rotation.set(Math.cos(a) * tilt, a, Math.sin(a) * tilt);
      m.scale.setScalar(i ? 0.62 : 1);
      m.castShadow = true;
      crystal.add(m);
    }
    crystal.position.set(0, 2.3, 0);
    this.root.add(crystal);
    this.crystal = crystal;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(), color: 0xff3018, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.scale.set(4, 5, 1); glow.position.set(0, 2.3, 0);
    this.root.add(glow);
    this.crystalGlow = glow;
    this.cw.addCyl({ x: 0, z: 0, y0: Y0 - 1, y1: Y0 + 3.5, r: 0.8 });
    this.obst.push({ x: 0, z: 0, r: 0.8 });
    this.chainMat = new THREE.LineBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    for (const st of this.statues) {
      const a = new THREE.Vector3(0, 2.3, 0), b = new THREE.Vector3(st.position.x * 0.92, st.position.y + 1.45, st.position.z * 0.92), pts = [];
      for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * 0.3, 0))); }
      this.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.chainMat));
    }
  }

  // ---------- 地面与可走范围（x, z 与世界坐标相同，高度为相对 Y0 的局部值）----------
  hallY(x, z) {
    const N = this.fn, i = Math.floor((x + this.fhalf) / this.fs), j = Math.floor((z + this.fhalf) / this.fs);
    if (i < 0 || j < 0 || i >= N || j >= N) return NaN;
    return this.fh[j * N + i];
  }
  // 局部地面高度；NaN 表示不可走（水池、墙外、岩壁）
  heightLocal(x, z) {
    const nt = nearestTunnel(x, z);
    if (nt.d < PROFILE.hw(nt.s) && (z > 20.5 || nt.s < TP.len - 3)) return nt.y;       // 洞室与甬道
    if (Math.abs(x) < DOOR_W && z > 15.5 && z < 23.5) return -0.2;                     // 门槛
    const r = Math.hypot(x, z);
    if (r < HALL_R) {
      if (this.onCauseway(x, z)) return CAUSEWAY.top;
      if (r > APRON.r0 && r < APRON.r1) { const h = this.hallY(x, z); return Number.isNaN(h) ? APRON.top : Math.max(h, APRON.top); }
      return this.hallY(x, z);
    }
    return NaN;
  }
  // 石堤：近外环处加宽成一块落脚的石台（与外环相接，不留水缝）
  onCauseway(x, z) {
    const C = CAUSEWAY, ax = Math.abs(x), az = Math.abs(z);
    const on = (along, lat) => along > C.r0 && along < C.r1 && (lat < C.hw || (along > C.land && lat < C.landHw));
    return on(az, ax) || on(ax, az);
  }
  heightAt(x, z) {
    const y = this.heightLocal(x, z);
    return Number.isNaN(y) ? Y0 - 1.8 : Y0 + y;
  }
  inCore(x, z) { return !Number.isNaN(this.heightLocal(x, z)); }
  waterAt(x, z) {
    const r = Math.hypot(x, z);
    return r > 4 && r < 16.5 && Number.isNaN(this.heightLocal(x, z)) ? Y0 - 0.31 : null;
  }
  normalAt() { return new THREE.Vector3(0, 1, 0); }

  // 在角度 a（与 atan2(x, z) 一致）、半径 r 附近找一个可站的位置（世界坐标）
  spot(a, r) {
    for (let k = 0; k < 60; k++) {
      const da = (k % 2 ? 1 : -1) * Math.floor((k + 1) / 2) * 0.03, dr = (Math.floor(k / 20)) * 0.6;
      const x = Math.sin(a + da) * (r - dr), z = Math.cos(a + da) * (r - dr), y = this.heightLocal(x, z);
      if (!Number.isNaN(y) && this.clearAround(x, z)) return { x, y: Y0 + y, z };
    }
    return { x: 0, y: Y0 - 0.17, z: 10 };
  }
  clearAround(x, z) {
    for (const [dx, dz] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) if (Number.isNaN(this.heightLocal(x + dx, z + dz))) return false;
    return this.clearOf(x, z, 0.5);
  }
  clearOf(x, z, r) { return !this.obst.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r); }
  // 线段两侧 r 以内无障碍、地面连续
  clearPath(a, b, r = 0.35) {
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
    for (const o of this.obst) {
      const u = clamp(((o.x - a.x) * dx + (o.z - a.z) * dz) / L2, 0, 1);
      if (Math.hypot(a.x + dx * u - o.x, a.z + dz * u - o.z) < o.r + r) return false;
    }
    return this.clearLine(a, b);
  }
  clearLine(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 0.4);
    let prev = this.heightLocal(a.x, a.z);
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = this.heightLocal(x, z);
      if (Number.isNaN(y) || (!Number.isNaN(prev) && Math.abs(y - prev) > 0.5)) return false;
      prev = y;
    }
    return true;
  }
  // 寻路路网：外环、八道步道、柱间缺口与柱内环道、殿门、甬道中线、入口洞室；两点间直线可走（地面连续、离障碍够远）即连边
  buildNav() {
    const polar = (a, r) => ({ x: Math.sin(a) * r, z: Math.cos(a) * r });
    const P = this.pillars.map((p) => p.a).sort((a, b) => a - b), gaps = [];
    for (let i = 0; i < P.length; i++) gaps.push((P[i] + (i === P.length - 1 ? P[0] + Math.PI * 2 : P[i + 1])) / 2);
    const pts = [];
    for (let k = 0; k < 28; k++) pts.push(polar((k / 28) * Math.PI * 2, 16.6));
    for (let k = 0; k < 24; k++) pts.push(polar((k / 24) * Math.PI * 2, 5.45));          // 柱廊外沿石台
    for (const sp of this.spokes) for (const r of [5.5, 8, 11, 14]) pts.push(polar(sp, r));
    for (const g of gaps) pts.push(polar(g, 4.45), polar(g, 5.1), polar(g, 3.75));
    pts.push({ x: 0, z: 18.5 }, { x: 0, z: 21.5 });
    for (let d = 0; d <= TP.len; d += 3.5) pts.push(tunnelAt(d));
    pts.push({ x: CHAMBER.x, z: CHAMBER.z });
    const nodes = [];
    for (const p of pts) {
      if (Number.isNaN(this.heightLocal(p.x, p.z)) || !this.clearOf(p.x, p.z, 0.3)) continue;
      if (nodes.some((n) => Math.hypot(n.x - p.x, n.z - p.z) < 0.6)) continue;
      nodes.push(p);
    }
    this.nav = nodes;
    this.navE = nodes.map(() => []);
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
      if (d < 9 && this.clearPath(nodes[i], nodes[j], 0.42)) { this.navE[i].push([j, d]); this.navE[j].push([i, d]); }
    }
  }
  // 最短路的第一个路点（自起点可直达的路网节点中，经路网到达终点可见节点的总长最短者）
  route(from, to) {
    const nodes = this.nav, N = nodes.length;
    const dist = new Float32Array(N).fill(Infinity), first = new Int16Array(N).fill(-1), done = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const d = Math.hypot(nodes[i].x - from.x, nodes[i].z - from.z);
      if (d < 12 && this.clearPath(from, nodes[i], 0.42)) { dist[i] = d; first[i] = i; }
    }
    const goal = new Float32Array(N).fill(Infinity);
    for (let i = 0; i < N; i++) {
      const d = Math.hypot(nodes[i].x - to.x, nodes[i].z - to.z);
      if (d < 12 && this.clearPath(nodes[i], to, 0.42)) goal[i] = d;
    }
    let best = Infinity, bi = -1;
    for (;;) {
      let u = -1, du = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < du) { du = dist[i]; u = i; }
      if (u < 0 || du >= best) break;
      done[u] = 1;
      if (du + goal[u] < best) { best = du + goal[u]; bi = u; }
      for (const [v, w] of this.navE[u]) if (du + w < dist[v]) { dist[v] = du + w; first[v] = first[u]; }
    }
    return bi < 0 ? null : nodes[first[bi]];
  }
  // 敌人寻路：直线走不通时给出下一个路点（每个敌人缓存 0.4 秒，到达路点或目标移动较远时重算）
  navTarget(from, to) {
    const now = performance.now(), c = from._nav;
    if (c && now - c.t < 400 && Math.hypot(c.tx - to.x, c.tz - to.z) < 2 && (!c.wp || Math.hypot(c.wp.x - from.x, c.wp.z - from.z) > 0.7)) return c.wp;
    const wp = this.clearPath(from, to, 0.42) ? null : this.route(from, to);
    from._nav = { t: now, tx: to.x, tz: to.z, wp };
    return wp;
  }
  // 步道方向：在 r = 9 的圆上找连续可走的角度段
  findSpokes() {
    const out = [];
    let seg = null;
    for (let k = 0; k <= 360; k++) {
      const a = (k / 360) * Math.PI * 2 - Math.PI, ok = !Number.isNaN(this.hallY(Math.sin(a) * 9, Math.cos(a) * 9));
      if (ok) (seg ||= []).push(a);
      if ((!ok || k === 360) && seg) { out.push(seg[(seg.length / 2) | 0]); seg = null; }
    }
    return out.length ? out : [0];
  }

  // 镜头：从角色头部向镜头位置步进，出了殿内、门洞、甬道与洞室的空间就停下
  camInside(x, y, z) {
    y -= Y0;
    const r = Math.hypot(x, z);
    if (r < 20.4) {
      if (r > 3.7 && r < 5.0 && y > 3.4 && y < 4.6) return false;       // 十七柱回廊的环梁
      return y < this.ceilAt(r) && y > -0.1;
    }
    if (Math.abs(x) < 2.6 && z < 24 && z > 20) return y > -0.1 && y < 7.6;
    // 洞室与甬道：拱形断面（半宽、洞高随剖面），留出离洞壁半米的余量
    const nt = nearestTunnel(x, z), W = PROFILE.wall(nt.s) - 0.6, H = PROFILE.h(nt.s) - 0.7, dy = y - nt.y;
    return dy > 0.25 && (nt.d / W) ** 2 + (dy / H) ** 2 < 1;
  }
  // 殿顶内轮廓（自中心向外射线实测）：中心天窗、r 9 米处 16 米，向外降到墙边 10.3 米；留 0.7 米余量
  ceilAt(r) {
    const P = [[0, 16], [9, 16], [10.5, 15.1], [12, 13.5], [13.5, 11.8], [15, 10.9], [18, 10.8], [19.5, 10.3], [21, 9.5]];
    for (let i = 1; i < P.length; i++) if (r <= P[i][0]) return lerp(P[i - 1][1], P[i][1], (r - P[i - 1][0]) / (P[i][0] - P[i - 1][0])) - 0.7;
    return 9;
  }
  // 镜头：自跟随点沿给定方向，在殿内、门洞、甬道与洞室的空间里最多能退多远
  camLimit(o, dir, d) {
    const n = Math.ceil(d / 0.2);
    for (let i = 1; i <= n; i++) {
      const s = (d * i) / n;
      if (!this.camInside(o.x + dir.x * s, o.y + dir.y * s, o.z + dir.z * s)) return Math.max(0.6, s - 0.3);
    }
    return d;
  }

  regionAt(x, z) { return ABYSS_REGIONS.find((g) => g.test(x, z)); }

  // 进入时的落脚点（世界坐标）：入口洞室，面向甬道
  get entry() { return { x: ABYSS_ENTRY.x, y: Y0 + ABYSS_ENTRY.y, z: ABYSS_ENTRY.z, yaw: Math.PI }; }

  setSealed(v) {
    this.sealed = v;
    SEAL.value = v ? 1 : 0;
    if (!this.ready) return;
    this.chainMat.color.set(v ? 0x7fd8ff : 0xff5040);
    this.crystalMat.emissive.set(v ? 0x2a8aa8 : 0xff2410);
    this.crystalMat.color.set(v ? 0x10303a : 0x3a0a10);
    this.crystalGlow.material.color.set(v ? 0x4ab8e0 : 0xff3018);
    this.eyeMat.emissive.set(v ? 0x5fd0ff : 0xff2a18);
    this.altarLight.color.set(v ? 0x5fb8e0 : 0xff3424);
    if (this.emitMat) this.emitMat.color.set(v ? 0x4ab8e0 : 0xff3a20);
    this.qi.userData.u.uLevel.value = v ? 0.35 : 1;
    CRACK.value = 0;
  }
  crack(v) { CRACK.value = v; }

  update(dt, t) {
    if (!this.ready) return;
    const cr = CRACK.value;
    this.crystal.rotation.y += dt * (this.sealed ? 0.25 : 0.6 + cr * 1.5);
    this.crystal.position.y = 2.3 + Math.sin(t * 1.3) * 0.12;
    const k = this.sealed ? 1 : 0.6 + 0.4 * Math.sin(t * 2.3) * Math.sin(t * 0.7);
    this.crystalMat.emissiveIntensity = (this.sealed ? 0.7 : 1.2 + cr) * k;
    this.crystalGlow.material.opacity = (this.sealed ? 0.4 : 0.55 + cr * 0.4) * (0.8 + 0.2 * k);
    this.altarLight.intensity = (this.sealed ? 9 : 14 + cr * 16) * (0.8 + 0.2 * k);
    this.chainMat.opacity = this.sealed ? 0.8 : (0.35 + 0.35 * Math.abs(Math.sin(t * 5.1))) * (1 - cr * 0.6);
    for (const f of this.flames) { f.material.opacity = 0.8 + 0.2 * Math.sin(t * 9 + f.position.x); f.scale.y = 1.15 + 0.12 * Math.sin(t * 7 + f.position.z); }
  }
}
