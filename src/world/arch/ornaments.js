// 宗门装饰物（依「宗门装饰物三视图」）：
//   石灯：方座（两层）→ 仰莲 → 方柱（正背面圆形团纹）→ 托盘 → 灯室（朱红木格、暖光灯罩）→ 青瓦四角攒尖顶（鎏金角脊、宝顶、四角铜铃）
//   香炉：三足（狮首、兽足）→ 圆腹（青铜底、掐丝珐琅色带、上下金箍、正背面太极金章）→ 双龙耳（衔玉环、垂红穗）→ 镂空炉盖（金色经纬肋）→ 金莲托玉珠、火焰宝顶
//   玉柱：白石须弥座（三层，壶门浮雕、鎏金角包）→ 半透青玉柱身（盘龙纹，单独材质、全部实例化）→ 金箍 → 金冠托玉珠 → 四面垂玉璧红穗
//   护门石兽：沿用实拍石狮（调为暖白汉白玉色），下加一层浮雕须弥座（青灰腰带、正面鎏金团章）
import * as THREE from 'three';
import { C } from './builder.js';
import { beam, pyramidRoofGeo } from './arch.js';
import { petalRing, lobedRect } from './stone9.js';
import { GLOBAL, FOGU, applyFade } from '../shaderlib.js';

const TAU = Math.PI * 2;

// ---------------- 石灯 ----------------
export function stoneLanternR(b, x, y, z, s = 1, ry = 0) {
  b.push(x, y, z, ry);
  const M = C.marble, MS = C.marbleShade, MW = C.marbleWarm;
  b.slab(0.74 * s, 0.14 * s, 0.74 * s, MS, 0, 0, 0, { mat: 'stone' });                         // 方座
  b.slab(0.62 * s, 0.1 * s, 0.62 * s, MW, 0, 0.14 * s, 0, { mat: 'stoneSmooth', col: false });
  b.cyl(0.25 * s, 0.3 * s, 0.12 * s, M, 0, 0.3 * s, 0, { seg: 12, mat: 'stoneSmooth', col: false });   // 仰莲
  b.add(petalRing(0.27, 10), MW, 'stoneSmooth', { y: 0.33 * s, sx: 0.25 * s, sz: 0.25 * s, sy: 0.25 * s * 1.25, col: false, detail: true });
  b.slab(0.24 * s, 0.86 * s, 0.24 * s, M, 0, 0.36 * s, 0, { mat: 'stoneSmooth', col: false });      // 方柱
  for (const sz of [-1, 1]) {                                                                         // 团纹
    b.cyl(0.095 * s, 0.095 * s, 0.025 * s, MW, 0, 0.84 * s, sz * 0.125 * s, { rx: Math.PI / 2, seg: 14, mat: 'stoneSmooth', col: false });
    b.add(new THREE.TorusGeometry(0.075 * s, 0.01 * s, 4, 16), MS, 'stoneSmooth', { x: 0, y: 0.84 * s, z: sz * 0.14 * s, col: false });
  }
  b.slab(0.46 * s, 0.08 * s, 0.46 * s, MW, 0, 1.22 * s, 0, { mat: 'stoneSmooth', col: false });     // 托盘
  b.cyl(0.2 * s, 0.25 * s, 0.07 * s, M, 0, 1.335 * s, 0, { seg: 12, mat: 'stoneSmooth', col: false });
  // 灯室：暖光灯罩 + 朱红木格
  b.slab(0.32 * s, 0.38 * s, 0.32 * s, 0xf3d79c, 0, 1.38 * s, 0, { mat: 'glow', col: false });
  const fr = 0x6e2a20;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.slab(0.05 * s, 0.44 * s, 0.05 * s, fr, sx * 0.19 * s, 1.36 * s, sz * 0.19 * s, { mat: 'wood', col: false });
  for (const [fx, fz, rot] of [[0, 0.168, 0], [0, -0.168, 0], [0.168, 0, Math.PI / 2], [-0.168, 0, Math.PI / 2]]) {
    b.box(0.34 * s, 0.025 * s, 0.02 * s, fr, fx * s, 1.58 * s, fz * s, { ry: rot, mat: 'wood', col: false });
    b.box(0.025 * s, 0.38 * s, 0.02 * s, fr, fx * s, 1.57 * s, fz * s, { ry: rot, mat: 'wood', col: false });
    b.box(0.34 * s, 0.03 * s, 0.025 * s, fr, fx * s, 1.38 * s, fz * s, { ry: rot, mat: 'wood', col: false });
    b.box(0.34 * s, 0.03 * s, 0.025 * s, fr, fx * s, 1.76 * s, fz * s, { ry: rot, mat: 'wood', col: false });
  }
  b.emitter('light', 0, 1.56 * s, 0, { k: 0.9 });                                                 // 夜间照明的光源锚点（灯室中心）
  // 顶：托板 + 青瓦四角攒尖（起翘）+ 鎏金角脊、宝顶、铜铃
  b.slab(0.52 * s, 0.05 * s, 0.52 * s, fr, 0, 1.78 * s, 0, { mat: 'wood', col: false });
  const R = 0.5 * s, H = 0.34 * s, y0 = 1.83 * s;
  b.add(pyramidRoofGeo(4, R, H, { lift: 0.42, rot: Math.PI / 4 }), C.tile, 'roof', { y: y0, col: false });
  b.add(pyramidRoofGeo(4, R, H, { lift: 0.42, rot: Math.PI / 4 }), C.paintTeal, 'under', { y: y0 - 0.025 * s, col: false });
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k / 4) * TAU, cx = Math.cos(a) * R * 0.98, cz = Math.sin(a) * R * 0.98;
    beam(b, cx * 0.12, y0 + H * 0.92, cz * 0.12, cx, y0 + H * 0.42 + 0.02 * s, cz, 0.035 * s, C.gold, 'gold');
    b.sphere(0.035 * s, C.gold, cx * 1.02, y0 + H * 0.42 - 0.06 * s, cz * 1.02, { mat: 'gold', seg: 6, seg2: 4 });       // 铜铃
    b.add(new THREE.ConeGeometry(0.03 * s, 0.05 * s, 6), C.gold, 'gold', { x: cx * 1.02, y: y0 + H * 0.42 - 0.1 * s, z: cz * 1.02, col: false });
  }
  b.cyl(0.05 * s, 0.07 * s, 0.07 * s, C.gold, 0, y0 + H + 0.02 * s, 0, { mat: 'gold', col: false, seg: 8 });
  b.sphere(0.065 * s, C.gold, 0, y0 + H + 0.14 * s, 0, { mat: 'gold', seg: 10, seg2: 6 });
  b.add(new THREE.ConeGeometry(0.035 * s, 0.14 * s, 8), C.gold, 'gold', { y: y0 + H + 0.26 * s, col: false });
  b.collider(0, 0, 2.3 * s, 0, 0.37 * s, 0.37 * s);
  b.pop();
}

// ---------------- 香炉 ----------------
let TAIJI = null;
function taijiTexture() {
  if (TAIJI) return TAIJI;
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), c = S / 2, r = S * 0.4;
  g.fillStyle = '#c9a050'; g.beginPath(); g.arc(c, c, S * 0.49, 0, TAU); g.fill();
  g.fillStyle = '#e8d29a'; g.beginPath(); g.arc(c, c, S * 0.45, 0, TAU); g.fill();
  g.fillStyle = '#f1ead6'; g.beginPath(); g.arc(c, c, r, 0, TAU); g.fill();
  g.fillStyle = '#23292a'; g.beginPath(); g.arc(c, c, r, -Math.PI / 2, Math.PI / 2); g.arc(c, c + r / 2, r / 2, Math.PI / 2, -Math.PI / 2, true); g.arc(c, c - r / 2, r / 2, Math.PI / 2, -Math.PI / 2, false); g.fill();
  g.fillStyle = '#f1ead6'; g.beginPath(); g.arc(c, c + r / 2, r / 7, 0, TAU); g.fill();
  g.fillStyle = '#23292a'; g.beginPath(); g.arc(c, c - r / 2, r / 7, 0, TAU); g.fill();
  TAIJI = new THREE.CanvasTexture(cv); TAIJI.colorSpace = THREE.SRGBColorSpace; TAIJI.anisotropy = 4;
  return TAIJI;
}
let TAIJI_MAT = null;
const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg);
// 炉身高度约为 s（含炉盖，不含宝顶）；本地原点在炉足底
export function censerR(b, x, y, z, s = 1.4, ry = 0) {
  const k = s / 1.4, BZ = 0x58644f, GD = C.gold;
  b.push(x, y, z, ry);
  // 三足：狮首 + 弯足 + 兽爪
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(ca * 0.3, 0.46, sa * 0.3), new THREE.Vector3(ca * 0.44, 0.3, sa * 0.44), new THREE.Vector3(ca * 0.47, 0.08, sa * 0.47)].map((v) => v.multiplyScalar(k)));
    b.add(new THREE.TubeGeometry(curve, 8, 0.065 * k, 7), BZ, 'bronze', { col: false });
    b.sphere(0.1 * k, BZ, ca * 0.48 * k, 0.07 * k, sa * 0.48 * k, { mat: 'bronze', sy: 0.65, seg: 10, seg2: 6 });
    b.sphere(0.11 * k, GD, ca * 0.33 * k, 0.5 * k, sa * 0.33 * k, { mat: 'gold', seg: 10, seg2: 8 });          // 狮首
    b.add(new THREE.TorusGeometry(0.1 * k, 0.03 * k, 5, 12), BZ, 'bronze', { x: ca * 0.33 * k, y: 0.5 * k, z: sa * 0.33 * k, ry: -a + Math.PI / 2, col: false });
  }
  // 炉腹
  b.add(lathe([[0, 0.38], [0.28, 0.4], [0.44, 0.5], [0.53, 0.64], [0.54, 0.76], [0.48, 0.9], [0.41, 0.96], [0.43, 1.0], [0.47, 1.03], [0.46, 1.05]].map(([r, h]) => [r * k, h * k])), BZ, 'bronze', { col: false });
  // 掐丝珐琅色带与金箍
  b.add(lathe([[0.537, 0.6], [0.548, 0.66], [0.55, 0.72], [0.54, 0.79]].map(([r, h]) => [r * k, h * k]), 32), 0x2c7b74, 'std', { col: false });
  for (const hy of [0.6, 0.8, 0.95]) b.add(new THREE.TorusGeometry((hy === 0.95 ? 0.43 : 0.548) * k, 0.016 * k, 5, 36), GD, 'gold', { y: hy * k, rx: Math.PI / 2, col: false });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; b.box(0.012 * k, 0.17 * k, 0.012 * k, GD, Math.cos(a) * 0.552 * k, 0.7 * k, Math.sin(a) * 0.552 * k, { mat: 'gold', col: false }); }
  // 太极金章（正、背面）
  TAIJI_MAT ||= new THREE.MeshStandardMaterial({ map: taijiTexture(), roughness: 0.45, metalness: 0.35 });
  for (const sz of [1, -1]) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.15 * k, 24), TAIJI_MAT);
    m.position.set(0, 0.7 * k, sz * 0.556 * k);
    if (sz < 0) m.rotation.y = Math.PI;
    m.userData.fadeable = false;
    b.addMesh(m);
  }
  // 双龙耳：S 形龙身、金首、衔玉环、垂红穗
  for (const sx of [-1, 1]) {
    const pts = [[0.42, 0.88], [0.58, 1.06], [0.76, 1.03], [0.8, 0.88], [0.7, 0.8]].map(([r, h]) => new THREE.Vector3(sx * r * k, h * k, 0));
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.045 * k, 7), BZ, 'bronze', { col: false });
    b.sphere(0.075 * k, GD, sx * 0.6 * k, 1.09 * k, 0, { mat: 'gold', sx: 1.3, seg: 10, seg2: 8 });
    b.add(new THREE.ConeGeometry(0.03 * k, 0.12 * k, 6), GD, 'gold', { x: sx * 0.68 * k, y: 1.12 * k, z: 0, rz: -sx * 1.2, col: false });
    b.add(new THREE.TorusGeometry(0.075 * k, 0.02 * k, 6, 16), 0x93c2b5, 'jade', { x: sx * 0.72 * k, y: 0.7 * k, z: 0, col: false });
    b.add(new THREE.ConeGeometry(0.035 * k, 0.18 * k, 6), 0xb0302a, 'cloth', { x: sx * 0.72 * k, y: 0.53 * k, z: 0, rx: Math.PI, col: false });
  }
  // 镂空炉盖：暗底 + 金色经纬肋
  b.add(lathe([[0.46, 1.05], [0.44, 1.14], [0.36, 1.27], [0.23, 1.36], [0.1, 1.4], [0, 1.41]].map(([r, h]) => [r * k, h * k])), 0x2e3a33, 'bronze', { col: false });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const pts = [[0.46, 1.06], [0.42, 1.17], [0.33, 1.29], [0.2, 1.37], [0.08, 1.405]].map(([r, h]) => new THREE.Vector3(ca * r * k, h * k, sa * r * k));
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.016 * k, 4), GD, 'gold', { col: false });
  }
  for (const [r, h] of [[0.4, 1.2], [0.27, 1.33]]) b.add(new THREE.TorusGeometry(r * k, 0.014 * k, 4, 28), GD, 'gold', { y: h * k, rx: Math.PI / 2, col: false });
  // 宝顶：金莲托玉珠、火焰
  b.cyl(0.05 * k, 0.1 * k, 0.07 * k, GD, 0, 1.44 * k, 0, { mat: 'gold', col: false, seg: 10 });
  b.sphere(0.075 * k, 0x93c2b5, 0, 1.54 * k, 0, { mat: 'jade', seg: 12, seg2: 8 });
  b.add(new THREE.ConeGeometry(0.05 * k, 0.2 * k, 8), GD, 'gold', { y: 1.72 * k, col: false });
  b.collider(0, 0, 1.45 * k, 0, 0.58 * k, 0.58 * k, 0, { walk: false });
  b.emitter('incense', 0, 1.46 * k, 0);
  b.pop();
}

// ---------------- 玉柱 ----------------
// 玉柱身（半透青玉、盘龙纹）单独一个材质，全部实例化：addJadePillar 收集，buildJadePillars 统一生成
export function jadePillar(ctx, b, x, y, z, s = 1, ry = 0) {
  b.push(x, y, z, ry);
  const M = C.marble, MW = C.marbleWarm, MS = C.marbleShade, GD = C.gold;
  b.slab(1.04 * s, 0.28 * s, 1.04 * s, MS, 0, 0, 0, { mat: 'stone' });
  b.slab(0.84 * s, 0.44 * s, 0.84 * s, M, 0, 0.28 * s, 0, { mat: 'stoneSmooth' });
  for (let i = 0; i < 4; i++) {                                                       // 壶门浮雕（四面）
    const a = (i / 4) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    b.box(0.56 * s, 0.24 * s, 0.03 * s, MS, ca * 0.425 * s, 0.5 * s, sa * 0.425 * s, { ry: -a + Math.PI / 2, mat: 'stoneSmooth', col: false });
    b.cyl(0.06 * s, 0.06 * s, 0.03 * s, GD, ca * 0.44 * s, 0.5 * s, sa * 0.44 * s, { rx: Math.PI / 2, ry: -a + Math.PI / 2, mat: 'gold', col: false, seg: 12 });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.slab(0.12 * s, 0.1 * s, 0.12 * s, GD, sx * 0.39 * s, 0.64 * s, sz * 0.39 * s, { mat: 'gold', col: false });
  b.cyl(0.32 * s, 0.38 * s, 0.14 * s, MW, 0, 0.79 * s, 0, { seg: 16, mat: 'stoneSmooth', col: false });    // 仰莲座
  b.add(petalRing(0.23, 12), MW, 'stoneSmooth', { y: 0.84 * s, sx: 0.32 * s, sz: 0.32 * s, sy: 0.32 * s * 1.25, col: false, detail: true });
  // 金箍
  for (const hy of [0.93, 1.95, 2.95]) b.add(new THREE.TorusGeometry(0.255 * s, 0.03 * s, 6, 24), GD, 'gold', { y: hy * s, rx: Math.PI / 2, col: false });
  // 金冠托玉珠
  b.cyl(0.3 * s, 0.24 * s, 0.16 * s, GD, 0, 3.04 * s, 0, { mat: 'gold', col: false, seg: 16 });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; b.add(new THREE.ConeGeometry(0.06 * s, 0.22 * s, 5), GD, 'gold', { x: Math.cos(a) * 0.27 * s, y: 3.2 * s, z: Math.sin(a) * 0.27 * s, rx: Math.sin(a) * 0.5, rz: -Math.cos(a) * 0.5, col: false }); }
  b.sphere(0.17 * s, 0x93c2b5, 0, 3.3 * s, 0, { mat: 'jade', seg: 14, seg2: 10 });
  b.add(new THREE.ConeGeometry(0.05 * s, 0.24 * s, 8), GD, 'gold', { y: 3.58 * s, col: false });
  // 四面垂玉璧、红穗
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4, px = Math.cos(a) * 0.33 * s, pz = Math.sin(a) * 0.33 * s;
    b.cyl(0.008 * s, 0.008 * s, 0.32 * s, GD, px, 2.86 * s, pz, { col: false, seg: 3, mat: 'gold' });
    b.add(new THREE.TorusGeometry(0.075 * s, 0.028 * s, 6, 14), 0x93c2b5, 'jade', { x: px, y: 2.62 * s, z: pz, ry: -a, col: false });
    b.add(new THREE.ConeGeometry(0.03 * s, 0.2 * s, 6), 0xb0302a, 'cloth', { x: px, y: 2.42 * s, z: pz, rx: Math.PI, col: false });
  }
  b.collider(0, 0, 3.4 * s, 0, 0.52 * s, 0.52 * s);
  b.pop();
  const c = Math.cos(ry), sn = Math.sin(ry);
  (ctx.jadePillars ||= []).push({ x, y: y + 0.86 * s, z, s, ry, h: 2.1 * s });
  void c; void sn;
}

export function buildJadePillars(ctx) {
  const list = ctx.jadePillars || [];
  if (!list.length) return null;
  const geo = new THREE.CylinderGeometry(0.235, 0.235, 1, 8, 12, false);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x86b4a8, roughness: 0.22, metalness: 0.02, envMapIntensity: 0.9 });     // 淡玉 #89B5AB 起步
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = GLOBAL.uTime; sh.uniforms.uNight = FOGU.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vJL; varying vec3 vJN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvJL = position; vJN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uNight; varying vec3 vJL; varying vec3 vJN;\nfloat jh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }')
      .replace('#include <color_fragment>', `#include <color_fragment>
        // 盘龙纹：绕柱的一道螺旋龙身（略深，带鳞纹），其余为温润青玉、内里有絮状纹理
        float ang = atan(vJL.z, vJL.x);
        float hel = sin(ang + vJL.y * 7.5);
        float body = smoothstep(.55, .85, hel);
        float scale = step(.5, fract((ang * 3. + vJL.y * 24.) * .5)) * body;
        float cloud = jh(floor(vec2(ang * 4., vJL.y * 9.)));
        diffuseColor.rgb *= mix(1., .62, body) * (1. - scale * .12) * (.92 + .16 * cloud);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float fr = pow(1. - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.);
          float pulse = .85 + .15 * sin(uTime * 1.3 + vJL.y * 3.);
          totalEmissiveRadiance += vec3(.25, .62, .5) * (.025 + fr * .12 + uNight * .22) * pulse; }`);
    applyFade(sh);
  };
  mat.customProgramCacheKey = () => 'jade-pillar';
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();
  list.forEach((p, i) => im.setMatrixAt(i, M4.compose(V.set(p.x, p.y, p.z), Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.ry), S.set(p.s, p.h, p.s))));
  im.castShadow = !ctx.lowShadows; im.receiveShadow = true;
  im.computeBoundingSphere();
  im.name = 'jade-pillars';
  ctx.scene.add(im);
  return im;
}

// ---------------- 护门石兽的须弥座 ----------------
// w、d：石狮底面尺寸；返回座高
export function lionPlinth(b, x, y, z, ry, w, d) {
  b.push(x, y, z, ry);
  const h = 0.62;
  b.slab(w + 0.3, 0.16, d + 0.3, C.marbleShade, 0, 0, 0, { mat: 'stone' });
  b.slab(w + 0.12, 0.12, d + 0.12, C.marble, 0, 0.16, 0, { mat: 'stoneSmooth', col: false });
  b.slab(w - 0.04, 0.2, d - 0.04, 0x55606a, 0, 0.28, 0, { mat: 'stoneSmooth', col: false });        // 青灰腰带
  for (const sz of [-1, 1]) {
    b.cyl(0.11, 0.11, 0.03, C.gold, 0, 0.38, sz * (d / 2 - 0.0), { rx: Math.PI / 2, mat: 'gold', col: false, seg: 14 });
    for (const sx of [-1, 1]) b.box(w * 0.28, 0.12, 0.02, C.marbleWarm, sx * w * 0.27, 0.38, sz * (d / 2 - 0.01), { mat: 'stoneSmooth', col: false });
  }
  b.slab(w + 0.16, 0.14, d + 0.16, C.marble, 0, 0.48, 0, { mat: 'stoneSmooth', col: false });
  b.collider(0, 0, h, 0, (w + 0.3) / 2, (d + 0.3) / 2);
  b.pop();
  return h;
}

// 石兽的高须弥座（第八轮山门石狮）：圭脚、下枋、束腰（壶门浮雕、青灰腰带、鎏金团纹）、上枋、压面，h 为座高
export function lionPedestal(b, x, y, z, ry, w, d, h = 1.0) {
  b.push(x, y, z, ry);
  const M = C.marble, Ms = C.marbleShade, Mw = C.marbleWarm, J = C.jade;
  b.slab(w + 0.44, 0.16, d + 0.44, Ms, 0, 0, 0, { mat: 'stone' });                                 // 圭脚
  b.slab(w + 0.3, 0.12, d + 0.3, Mw, 0, 0.16, 0, { mat: 'stoneSmooth', col: false });             // 下枋
  // 莲瓣带（下为覆莲、上为仰莲）：连续的枕状瓣一圈
  const lot = (yy, up) => b.add(lobedRect(w + 0.08, d + 0.08, 0.095, 0.26), M, 'stoneSmooth', { y: yy, sy: up ? 1.25 : 0.85, col: false, detail: true });
  lot(0.32, false);
  const bh = h - 0.28 - 0.42;
  b.slab(w, bh, d, Ms, 0, 0.28, 0, { mat: 'stoneSmooth', col: false });                          // 束腰
  for (const sz of [-1, 1]) {
    b.slab(w * 0.72, bh * 0.72, 0.04, Mw, 0, 0.28 + bh * 0.14, sz * (d / 2 + 0.01), { mat: 'stoneSmooth', col: false });
    b.slab(w * 0.6, bh * 0.52, 0.035, J, 0, 0.28 + bh * 0.24, sz * (d / 2 + 0.03), { mat: 'jade', col: false });       // 青玉雕板
    b.sphere(0.07, Mw, 0, 0.28 + bh * 0.5, sz * (d / 2 + 0.05), { mat: 'stoneSmooth', seg: 8, seg2: 6, sz: 0.4 });
  }
  for (const sx of [-1, 1]) {
    b.slab(0.04, bh * 0.72, d * 0.72, Mw, sx * (w / 2 + 0.01), 0.28 + bh * 0.14, 0, { mat: 'stoneSmooth', col: false });
    b.slab(0.035, bh * 0.52, d * 0.6, J, sx * (w / 2 + 0.03), 0.28 + bh * 0.24, 0, { mat: 'jade', col: false });
  }
  lot(h - 0.38, true);                                                                           // 仰莲（上）
  b.slab(w + 0.26, 0.12, d + 0.26, Mw, 0, h - 0.26, 0, { mat: 'stoneSmooth', col: false });       // 上枋
  b.slab(w + 0.34, 0.14, d + 0.34, M, 0, h - 0.14, 0, { mat: 'stoneSmooth', col: false });        // 压面
  b.collider(0, 0, h, 0, (w + 0.44) / 2, (d + 0.44) / 2);
  b.pop();
  return h;
}

// ---------------- 火焰（火盆、炉口）----------------
// list：[x, y, z, s]；火焰面片始终转向镜头（绕竖轴），按噪声翻卷、明灭；s 为火焰高度（米）
export function flameSprites(list) {
  const base = new THREE.PlaneGeometry(1, 1, 1, 1);
  base.translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry().copy(base);
  const info = new Float32Array(list.length * 4);
  list.forEach(([x, y, z, s], i) => info.set([x, y, z, s], i * 4));
  g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
  g.instanceCount = list.length;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: GLOBAL.uTime },
    vertexShader: `attribute vec4 aInfo; uniform float uTime; varying vec2 vUv; varying float vS;
      void main(){
        vUv = uv; vS = fract(aInfo.x * .37 + aInfo.z * .71);
        vec3 right = normalize(vec3(viewMatrix[0][0], 0., viewMatrix[2][0]));
        float s = aInfo.w * (.9 + .12 * sin(uTime * 9. + vS * 20.));
        vec3 p = aInfo.xyz + right * position.x * s * .62 + vec3(0., position.y * s, 0.);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vS;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
      void main(){
        vec2 q = vUv - vec2(.5, 0.);
        float t = uTime * 2.6 + vS * 9.;
        float flick = n(vec2(q.x * 5. + vS * 7., vUv.y * 3. - t)) * .55 + n(vec2(q.x * 11., vUv.y * 7. - t * 1.6)) * .45;
        float w = (1. - vUv.y) * .48 + .02;
        float body = smoothstep(w, w * .25, abs(q.x + (flick - .5) * .18 * vUv.y)) * smoothstep(1., .25, vUv.y + (flick - .5) * .4);
        float core = smoothstep(w * .5, 0., abs(q.x)) * smoothstep(.65, .05, vUv.y);
        vec3 c = mix(vec3(1., .32, .06), vec3(1., .72, .3), vUv.y < .5 ? core : core * .5) * body * 1.6 + vec3(1., .9, .6) * core * .5;
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 8;
  m.name = 'flames';
  return m;
}

// 火盆：青铜三足盆、炭火，返回火焰的位置（交给 flameSprites）
export function brazier(b, x, y, z, s = 1) {
  b.push(x, y, z, 0);
  b.slab(0.9 * s, 0.25 * s, 0.9 * s, 0x5a2b22, 0, 0, 0, { mat: 'stone' });
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; beam(b, Math.cos(a) * 0.32 * s, 0.25 * s, Math.sin(a) * 0.32 * s, Math.cos(a) * 0.22 * s, 1.0 * s, Math.sin(a) * 0.22 * s, 0.08 * s, 0x4f4a3e, 'bronze'); }
  b.add(new THREE.LatheGeometry([[0, 0], [0.3, 0.02], [0.46, 0.14], [0.52, 0.3], [0.5, 0.32]].map(([r, h]) => new THREE.Vector2(r * s, h * s)), 18), 0x4f4a3e, 'bronze', { y: 0.95 * s, col: false });
  b.add(new THREE.TorusGeometry(0.5 * s, 0.035 * s, 5, 20), C.gold, 'gold', { y: 1.27 * s, rx: Math.PI / 2, col: false });
  b.cyl(0.44 * s, 0.44 * s, 0.05 * s, 0xff6a20, 0, 1.22 * s, 0, { mat: 'glow', col: false, seg: 14 });
  b.collider(0, 0, 1.3 * s, 0, 0.5 * s, 0.5 * s, 0, { walk: false });
  b.emitter('chimney', 0, 1.9 * s, 0, { rate: 0.6 });
  b.emitter('light', 0, 1.6 * s, 0, { k: 1.1, tone: 'fire' });
  b.pop();
  return [x, y + 1.2 * s, z, 1.15 * s];
}
