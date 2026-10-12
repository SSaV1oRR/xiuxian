// 浮空仙岛：宗门北面与两侧的天上浮着几座仙岛——岛顶青草，长着松与樱，有的立着小亭、宝塔、殿阁；
// 岛底是倒垂的嶙峋山石（层理、苔痕、向下收成几根石笋）；岛沿挂下一道道瀑布，落到半空便散成水雾，没入云中。
// 岛下与瀑布下方各有一团云（交给 clouds.js 的云带一起画）。
// 第十三轮扩建：宗门后方（北面）的四座岛——灵霄、栖霞、揽月、松涛——俯视占地各扩为原来的 4 倍（顶面轮廓按同一形状
// 长宽各乘 2），岛心位置不动；岛体厚度、顶面高度按岛下的山体另定（岛底离地至少 25 米，见 ISLES 的 y、depth）。
// 两侧的东翠、西翠二屿不在后方，形制不变。岛不再浮动（可以站上去了）：
//   · 岛面：按网格三角形精确取高，可行走，岛沿外是断崖；
//   · 岛体：飞行时是实心的（岛面、岛沿崖带、倒垂的岛底，按同一套轮廓与起伏计算）；
//   · 岛上的殿阁、塔、亭登记碰撞；树改由植被系统种（近处是完整的树，有树干碰撞，远处换成贴片）；
//   · 每座后方岛面朝宗门一侧设一座传送阵、一条石径通往岛上主景，沿路石灯（夜间光源锚点）。
import * as THREE from 'three';
import { Builder, C } from './arch/builder.js';
import { pavilion, hall, rockery } from './arch/arch.js';
import { pagoda } from './arch/buildings.js';
import { stoneLanternR } from './arch/ornaments.js';
import { teleportArray } from './arch/portal.js';
import { applyFade } from './shaderlib.js';
import { ASSETS } from './assets.js';
import { mulberry32, createNoise2D, smoothstep, lerp } from '../core/math.js';
import { fallMaterial, fallGeometry } from './falls.js';

// x, z 岛心；y0 原岛顶面高度、y 扩建后的高度；r0 原顶面半径参数，grow 长宽放大倍数（面积为其平方）；depth 岛体厚度（不含岛沿）；
// deco 岛上主景；falls 瀑布数；back：宗门后方的岛（扩建、可传送）
export const ISLES = [
  { id: 'lingxiao', name: '灵霄岛', x: 10, z: -470, y0: 150, y: 205, r0: 66, grow: 2, depth: 130, seed: 11, deco: 'palace', falls: 2, back: true,
    desc: '后山北面最大的一座浮岛：岛上重檐殿阁、五层小塔与方亭，石径自传送阵直通殿前。' },
  { id: 'qixia', name: '栖霞岛', x: -285, z: -300, y0: 168, y: 205, r0: 42, grow: 2, depth: 88, seed: 12, deco: 'pavilion', falls: 1, back: true,
    desc: '西北的浮岛，岛心一座六角亭，晚霞时满岛松影。' },
  { id: 'lanyue', name: '揽月岛', x: 345, z: -390, y0: 150, y: 170, r0: 48, grow: 2, depth: 100, seed: 13, deco: 'pagoda', falls: 1, back: true,
    desc: '东北的浮岛，岛上一座七层宝塔，夜里登岛可揽月。' },
  { id: 'dongcui', name: '东翠屿', x: 455, z: -50, y0: 122, y: 122, r0: 24, grow: 1, seed: 14, deco: 'trees', falls: 0 },
  { id: 'xicui', name: '西翠屿', x: -435, z: 85, y0: 118, y: 118, r0: 28, grow: 1, seed: 15, deco: 'trees', falls: 1 },
  { id: 'songtao', name: '松涛岛', x: 265, z: -665, y0: 225, y: 225, r0: 32, grow: 2, depth: 70, seed: 16, deco: 'grove', falls: 0, back: true,
    desc: '远东北的浮岛，满岛古松，岛前一座观松台。' },
];

// 岛的网格：顶面（极坐标网格，缓丘）+ 岛沿崖带 + 倒垂的岛底（向下收成尖，带竖向石棱）；顶点色区分草地、泥土、岩石、苔痕。
// 第十三轮：可调细分（NA 方位、NT 顶面圈数、NU 崖带与岛底层数）、岛体厚度 D、轮廓起伏 round（1 为原样）、
// 顶面平台 plateau（ρ 以内削平，塔岛用）；另返回岛面三角形的分格索引（精确取高）与岛体的实心体参数
export function isleGeometry(r, seed, { D = null, NA = 84, NT = 9, NU = 20, round = 1, plateau = 0, relief = 0 } = {}) {
  const noise = createNoise2D(seed), rand = mulberry32(seed * 7 + 1);
  const d0 = r * (1.15 + rand() * 0.35);
  if (D == null) D = d0;
  const tip = [(rand() - 0.5) * r * 0.25, (rand() - 0.5) * r * 0.25];
  const R = (a) => r * (0.84 + round * (0.2 * noise(Math.cos(a) * 1.3, Math.sin(a) * 1.3) + 0.07 * noise(Math.cos(a) * 4.1 + 9, Math.sin(a) * 4.1)));
  // relief：扩建的大岛另加一层缓丘（起伏约 ±5% 半径），并在岛心与岛沿之间隆起一道矮岗——顶面不再是一块平盘
  const natural = (x, z, rho) => r * (0.045 * (1 - rho * rho) + 0.03 * noise(x / r * 2.2 + 3, z / r * 2.2) + 0.012 * noise(x / r * 7, z / r * 7 + 5)
    + relief * (0.04 * noise(x / r * 1.3 + 17, z / r * 1.3 - 5) + 0.035 * Math.max(0, 1 - Math.abs(rho - 0.58) / 0.22) * (0.6 + 0.4 * noise(x / r * 3 - 7, z / r * 3 + 2))));
  const flatY = natural(0, 0, 0);
  const topY = plateau > 0 ? (x, z, rho) => lerp(flatY, natural(x, z, rho), smoothstep(plateau, plateau + 0.16, rho)) : natural;
  const ridge = (a, u) => 1 + 0.16 * Math.abs(noise(a * 2.6 + seed, u * 3.2)) - 0.08 + 0.06 * noise(a * 9 + 3, u * 6);
  const shrinkOf = (u) => (u < 0.08 ? 1.02 + u * 0.4 : Math.pow(Math.max(0, 1 - (u - 0.08) / 0.92), 0.78) * 1.05);
  const depthK = (a) => 1 + 0.12 * noise(Math.cos(a) * 2 + 7, Math.sin(a) * 2);
  const pos = [], col = [], idx = [];
  const grass = new THREE.Color(0x5d7a3e), grass2 = new THREE.Color(0x7d8c45), soil = new THREE.Color(0x6d5a44), rock = new THREE.Color(0x7d776c), rockD = new THREE.Color(0x4f4b45), moss = new THREE.Color(0x5b6b45), c = new THREE.Color();
  const push = (x, y, z, cc) => { pos.push(x, y, z); col.push(cc.r, cc.g, cc.b); return pos.length / 3 - 1; };
  const rows = [];
  // 顶面：中心点 + NT 圈
  const center = push(0, topY(0, 0, 0), 0, grass);
  for (let i = 1; i <= NT; i++) {
    const rho = i / NT, row = [];
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2, rr = R(a) * rho, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const y = topY(x, z, rho) - (rho > 0.92 ? (rho - 0.92) * r * 0.2 : 0);
      const n = noise(x * 0.08 + 11, z * 0.08);
      c.copy(grass).lerp(grass2, 0.5 + 0.5 * n);
      if (rho > 0.9) c.lerp(soil, (rho - 0.9) * 6);
      row.push(push(x, y, z, c));
    }
    rows.push(row);
  }
  const topCount = 1 + NT * NA;
  // 岛沿崖带与岛底：u 自 0（崖沿）到 1（底尖）
  for (let i = 1; i <= NU; i++) {
    const u = i / NU, row = [];
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const rr = R(a) * shrinkOf(u) * ridge(a, u);
      const y = u < 0.08 ? -u / 0.08 * r * 0.1 : -r * 0.1 - D * Math.pow((u - 0.08) / 0.92, 1.25) * depthK(a);
      const k = Math.pow(u, 1.5);
      const x = ca * rr + tip[0] * k, z = sa * rr + tip[1] * k;
      // 颜色：上部岩石带苔，层理（按高度的明暗条带），越往下越暗
      const strata = 0.5 + 0.5 * Math.sin(y * 0.55 + noise(x * 0.05, z * 0.05) * 3);
      c.copy(rock).lerp(rockD, Math.min(1, u * 1.1)).multiplyScalar(0.86 + 0.22 * strata);
      if (u < 0.35) c.lerp(moss, Math.max(0, 0.45 - u) * (0.6 + 0.4 * noise(x * 0.1, z * 0.1 + 4)));
      if (u < 0.06) c.lerp(soil, 0.5);
      row.push(push(x, y, z, c));
    }
    rows.push(row);
  }
  const bottomY = -r * 0.1 - D * 1.04;
  const bottom = push(tip[0], bottomY, tip[1], rockD);
  // 三角形（前 NA + 2·NA·(NT-1) 个是岛面）
  for (let j = 0; j < NA; j++) idx.push(center, rows[0][(j + 1) % NA], rows[0][j]);
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < NA; j++) {
    const a = rows[i][j], b = rows[i][(j + 1) % NA], c2 = rows[i + 1][j], d = rows[i + 1][(j + 1) % NA];
    idx.push(a, b, c2, b, d, c2);
  }
  const last = rows[rows.length - 1];
  for (let j = 0; j < NA; j++) idx.push(last[j], last[(j + 1) % NA], bottom);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 岛面三角形按 6 米分格（精确取高：取高与画面一致，脚不悬空、不陷地）
  const nTop = (NA + 2 * NA * (NT - 1)) * 3, cell = 6, bins = new Map();
  for (let t = 0; t < nTop; t += 3) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k++) { const v = idx[t + k]; x0 = Math.min(x0, pos[v * 3]); x1 = Math.max(x1, pos[v * 3]); z0 = Math.min(z0, pos[v * 3 + 2]); z1 = Math.max(z1, pos[v * 3 + 2]); }
    for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) {
      const key = i * 4096 + j;
      let a = bins.get(key);
      if (!a) bins.set(key, (a = []));
      a.push(t);
    }
  }
  // 岛面局部高度（岛面外为 -Infinity）
  const surface = (x, z) => {
    const a = bins.get(Math.floor(x / cell) * 4096 + Math.floor(z / cell));
    if (!a) return -Infinity;
    for (const t of a) {
      const i0 = idx[t] * 3, i1 = idx[t + 1] * 3, i2 = idx[t + 2] * 3;
      const ax = pos[i0], az = pos[i0 + 2], bx = pos[i1], bz = pos[i1 + 2], cx = pos[i2], cz = pos[i2 + 2];
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-9) continue;
      const l0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l2 = 1 - l0 - l1;
      if (l0 < -1e-4 || l1 < -1e-4 || l2 < -1e-4) continue;
      return l0 * pos[i0 + 1] + l1 * pos[i1 + 1] + l2 * pos[i2 + 1];
    }
    return -Infinity;
  };
  // 岛体实心体：局部高度 y 处（y < 0）岛底轮廓的中心与方位半径
  const under = (x, y, z) => {
    if (y >= 0) return null;
    let u;
    const uOf = (dk) => { if (y > -r * 0.1) return (-y / (r * 0.1)) * 0.08; const v = Math.pow((-y - r * 0.1) / (D * dk), 0.8); return 0.08 + Math.min(1, v) * 0.92; };
    u = uOf(1);
    let k = Math.pow(u, 1.5), cx = tip[0] * k, cz = tip[1] * k;
    const a = Math.atan2(z - cz, x - cx);
    u = uOf(depthK(a));
    if (u >= 1) return null;
    k = Math.pow(u, 1.5); cx = tip[0] * k; cz = tip[1] * k;
    // 岛沿到第一圈崖带之间，网格是从岛面边缘（半径 R）直线连到第一圈：这一段按同样的直线取半径，
    // 不用崖带的外凸（否则紧贴岛沿下方会凭空多出最多一成半半径的实心，贴着岛沿飞会被横推出去）
    const u1 = 1 / NU;
    if (u < u1) {
      const R0 = R(a), r1 = R0 * shrinkOf(u1) * ridge(a, u1), y1 = u1 < 0.08 ? u1 / 0.08 * r * 0.1 : r * 0.1;
      return { cx, cz, rad: R0 + (r1 - R0) * (u / u1), a, lip: { R0, r1, y1 } };
    }
    return { cx, cz, rad: R(a) * shrinkOf(u) * ridge(a, u), a };
  };
  return { geo: g, topY, R, D, tip, surface, under, bottomY, top: topCount, maxR: r * 1.25 };
}

// 岛石材质：顶点色 × 实拍岩石 / 草地细节（三向投影，按法线混合），远处随大气雾化
function isleMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    const T = ASSETS.tex;
    sh.uniforms.tRock = { value: T.rock_d || null }; sh.uniforms.tGrass = { value: T.grass_d || null };
    const has = !!(T.rock_d && T.grass_d);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vIW; varying vec3 vIN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvIW = (modelMatrix * vec4(transformed, 1.)).xyz; vIN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${has ? '#define ISLE_TEX' : ''}\nuniform sampler2D tRock, tGrass; varying vec3 vIW; varying vec3 vIN;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        #ifdef ISLE_TEX
        { vec3 w = pow(abs(vIN), vec3(4.)); w /= w.x + w.y + w.z;
          vec3 q = vIW * .11;
          float rl = dot(texture2D(tRock, q.zy).rgb * w.x + texture2D(tRock, q.xz).rgb * w.y + texture2D(tRock, q.xy).rgb * w.z, vec3(.333));
          float gl = dot(texture2D(tGrass, vIW.xz * .2).rgb, vec3(.333));
          float top = smoothstep(.55, .85, vIN.y);
          diffuseColor.rgb *= mix(clamp(rl / .42, .55, 1.45), clamp(gl / .3, .7, 1.3), top); }
        #endif`);
    applyFade(sh);
  };
  m.customProgramCacheKey = () => 'isle-rock';
  return m;
}
export const ISLE_MAT = { get: () => (ISLE_MAT.m ||= isleMaterial()) };

// 一座岛的岛体（世界坐标的取高与实心体）：group 绕 y 转 rot，局部 = 绕 y 转回 -rot
export class IsleBody {
  constructor(spec, shape, rot) {
    this.s = spec; this.shape = shape; this.rot = rot;
    this.c = Math.cos(rot); this.sn = Math.sin(rot);
    this.maxTop = spec.y + shape.topY(0, 0, 0) + shape.maxR * 0.06 + 8;
    this.minY = spec.y + shape.bottomY - shape.D * 0.1;   // 岛底各方位的深浅不一（depthK 最多深一成二），最低处比底尖还低
  }
  // 世界 → 局部（three.js rotation.y = θ：世界 x = lx·cos + lz·sin，世界 z = -lx·sin + lz·cos）
  local(x, z) { const dx = x - this.s.x, dz = z - this.s.z; return [dx * this.c - dz * this.sn, dx * this.sn + dz * this.c]; }
  world(lx, lz) { return [this.s.x + lx * this.c + lz * this.sn, this.s.z - lx * this.sn + lz * this.c]; }
  near(x, z, m = 0) { return Math.hypot(x - this.s.x, z - this.s.z) < this.shape.maxR + m; }
  // 岛面高度（世界），岛面外 -Infinity
  surfaceAt(x, z) {
    if (!this.near(x, z)) return -Infinity;
    const [lx, lz] = this.local(x, z), h = this.shape.surface(lx, lz);
    return h > -Infinity ? this.s.y + h : -Infinity;
  }
  // 球（球心 c，半径 rs）与岛体：被推开时修改 c 并返回 true
  push(c, rs) {
    if (c.y > this.maxTop + rs || c.y < this.minY - rs || !this.near(c.x, c.z, rs)) return false;
    const [lx, lz] = this.local(c.x, c.z), ly = c.y - this.s.y;
    let ox = 0, oz = 0, oy = 0;
    if (ly >= -0.5) {
      // 岛面一层：在轮廓内且低于岛面 → 从近的那一侧推出（向上或向外）
      const h = this.shape.surface(lx, lz);
      if (h === -Infinity || ly > h + rs) return false;
      if (ly >= h) return false;                       // 岛面之上由「脚下间隙」处理
      const a = Math.atan2(lz, lx), d = Math.hypot(lx, lz), Rr = this.shape.R(a), side = Rr + rs - d;
      if (h + rs - ly < side) oy = h + rs - ly; else { ox = Math.cos(a) * side; oz = Math.sin(a) * side; }
    } else {
      // 岛沿一带岛面低于岛心（局部 -0.5 以下）：岛面之上是空的，不按岛底的倒锥推（否则贴着低处的岛面飞会被横推出去十几米）
      const h = this.shape.surface(lx, lz);
      if (h > -Infinity && ly >= h) return false;
      const u = this.shape.under(lx, ly, lz);
      if (!u) return false;
      const dx = lx - u.cx, dz = lz - u.cz, d = Math.hypot(dx, dz), pen = u.rad + rs - d;
      if (pen <= 0) return false;
      // 岛沿下第一段崖面上窄下宽，像一段坡：从上方擦过时往上托（比横推近的话），不横着推
      let up = Infinity;
      if (u.lip && u.lip.r1 > u.lip.R0 + 1e-3) { const L = u.lip, yf = -Math.min(1, Math.max(0, (d - L.R0) / (L.r1 - L.R0))) * L.y1; up = yf + rs - ly; }
      if (u.rad < 1.2) oy = -pen;                     // 底尖附近：向下推
      else if (up > 0 && up < pen) oy = up;
      else {
        // 往下让出岛底（岛底靠上的一段近乎平，贴着它飞时往下让比横着推近得多）：二分找这一处岛底的高度
        let lo = Math.min(ly, this.shape.bottomY) - this.shape.D * 0.1, hi = ly;
        for (let it = 0; it < 14; it++) {
          const mid = (lo + hi) / 2, um = this.shape.under(lx, mid, lz);
          if (um && um.rad + rs - Math.hypot(lx - um.cx, lz - um.cz) > 0) hi = mid; else lo = mid;
        }
        if (ly - lo < pen) oy = lo - ly;
        else { const k = pen / Math.max(d, 1e-4); ox = dx * k; oz = dz * k; }
      }
    }
    // 一次最多横推 0.6 米、竖推 0.42 米（与飞行越障的抬升一样）：飞行每一步不超过 0.35 米，推得回来；
    // 万一嵌得深，分几步推出，不会一下跳开好几米
    const L = Math.hypot(ox, oz);
    if (L > 0.6) { const k = 0.6 / L; ox *= k; oz *= k; }
    if (oy > 0.42) oy = 0.42; else if (oy < -0.42) oy = -0.42;
    // 局部 → 世界
    c.x += ox * this.c + oz * this.sn; c.z += -ox * this.sn + oz * this.c; c.y += oy;
    return true;
  }
  // 点是否在岛体内（镜头用）
  solidAt(x, y, z) {
    if (y > this.maxTop || y < this.minY || !this.near(x, z)) return false;
    const [lx, lz] = this.local(x, z), ly = y - this.s.y;
    const h = this.shape.surface(lx, lz);
    if (ly >= -0.5) return h > -Infinity && ly < h - 0.05;
    if (h > -Infinity && ly >= h - 0.05) return false;              // 岛沿低处的岛面之上
    const u = this.shape.under(lx, ly, lz);
    return !!u && Math.hypot(lx - u.cx, lz - u.cz) < u.rad;
  }
}

export class Isles {
  // veg：岛上的树交给植被系统（须在 veg.build() 之前构造）；lit / shade：天空的云受光 / 背光色（随时辰）
  constructor(scene, veg, terrain, { lit, shade } = {}) {
    this.groups = [];
    this.bodies = [];
    this.cloudBanks = [];
    this.arrays = [];             // 传送阵：{ id, name, x, y, z, arrive: { x, z, yaw }, desc }
    this.lights = [];             // 夜间光源锚点（世界坐标）
    this.decoGroups = [];
    this.before = [];             // 扩建前后的尺寸（报告用）
    this.cw = null;
    const mat = ISLE_MAT.get();
    const fallMat = fallMaterial(lit || { value: new THREE.Vector3(1, 0.98, 0.94) }, shade || { value: new THREE.Vector3(0.8, 0.84, 0.88) });
    this.fallMat = fallMat;
    for (const I of ISLES) {
      const rand = mulberry32(I.seed * 13);
      const r = I.r0 * I.grow, big = I.grow > 1;
      const grp = new THREE.Group();
      grp.position.set(I.x, I.y, I.z);
      const ph = rand(), rot = rand() * 6.28;
      grp.rotation.y = rot;
      const shape = isleGeometry(r, I.seed, big ? { D: I.depth, NA: 200, NT: Math.round(r / 4.2), NU: 26, relief: 1 } : {});
      const mesh = new THREE.Mesh(shape.geo, mat);
      mesh.name = 'isle';
      mesh.receiveShadow = true;
      grp.add(mesh);
      const body = new IsleBody(I, shape, rot);
      this.bodies.push(body);
      void ph;
      // 岛下悬着的两三块碎石（仍缓缓起伏）
      const nRock = r > 40 ? 3 : 2;
      for (let k = 0; k < nRock; k++) {
        const rr = I.r0 * (0.12 + rand() * 0.1) * (big ? 1.4 : 1), { geo: g2 } = isleGeometry(rr, I.seed * 31 + k);
        const m2 = new THREE.Mesh(g2, mat);
        const a = rand() * 6.28, d = r * (1.25 + rand() * 0.6);
        m2.position.set(Math.cos(a) * d, -r * (0.35 + rand() * 0.6) * (big ? 0.7 : 1), Math.sin(a) * d);
        m2.rotation.y = rand() * 6.28;
        m2.userData.bob = rand() * 6.28;
        grp.add(m2);
      }
      // 瀑布朝向宗门一侧：岛心指向原点的世界方位角，换算为岛的本地方位角（group 绕 y 转了 rot：本地 = 世界 + rot）
      for (let f = 0; f < I.falls; f++) {
        const la = Math.atan2(-I.z, -I.x) + (f - (I.falls - 1) / 2) * 0.55 * (big ? 0.6 : 1) + rot;
        const rr = shape.R(la) * 0.97, x = Math.cos(la) * rr, z = Math.sin(la) * rr;
        const wa0 = la - rot, gx = I.x + Math.cos(wa0) * rr, gz = I.z + Math.sin(wa0) * rr;
        const len = Math.max(60, (I.y - Math.max(0, terrain ? terrain.heightAt(gx, gz) : 0)) * 0.78), w = I.r0 * (0.06 + rand() * 0.03) * (big ? 1.5 : 1);
        const fm = new THREE.Mesh(fallGeometry(len, w), fallMat);
        fm.position.set(x, shape.topY(x, z, 0.97) - 0.4, z);
        fm.rotation.y = Math.PI / 2 - la;
        fm.renderOrder = 7;
        grp.add(fm);
        const wa = la - rot;
        this.cloudBanks.push([I.x + Math.cos(wa) * (rr + len * 0.06), I.y - len * 0.62, I.z + Math.sin(wa) * (rr + len * 0.06), w * 9, 2, 0.5]);
      }
      // 岛下的云团
      this.cloudBanks.push([I.x, I.y + shape.bottomY * 0.6, I.z, r * (big ? 2.4 : 3.2), r > 40 ? 3 : 2, 0.3]);
      scene.add(grp);
      this.groups.push(grp);
      // 主景、石径、传送阵、石灯（世界朝向：+z 朝宗门）
      const deco = this.decorate(I, body, rand, veg);
      if (deco) { scene.add(deco); this.decoGroups.push(deco); }
    }
  }

  // 岛面上（世界朝向的局部坐标 wx, wz，相对岛心）的局部高度
  surfL(body, wx, wz) { const h = body.surfaceAt(body.s.x + wx, body.s.z + wz); return h > -Infinity ? h - body.s.y : -Infinity; }

  decorate(I, body, rand, veg) {
    const b = new Builder(), r = I.r0 * I.grow, keep = [];      // keep：不种树的圆（主景、阵、路）
    const S = (wx, wz) => this.surfL(body, wx, wz);
    // 正南（朝宗门）方向的岛沿：传送阵放在岛沿到岛心的六成处
    const edgeS = (() => { for (let d = r * 1.2; d > 2; d -= 0.5) if (S(0, d) > -Infinity) return d; return r * 0.5; })();
    const put = (wx, wz, fn) => { const h = S(wx, wz); if (h > -Infinity) fn(h); };
    let main = null;
    if (I.deco === 'palace') {
      const hz = -r * 0.12;
      b.push(0, S(0, hz) - 0.4, hz, 0);
      hall(b, { w: 16, d: 10, h: 5, base: 1.2, roof: 'xieshan', glaze: true, roofColor: 0x2f5a5a, painted: true, front: 'doors' });
      b.pop();
      keep.push([0, hz, 16]);
      const p1 = [-r * 0.33, r * 0.05], p2 = [r * 0.32, r * 0.1];
      put(...p1, (h) => { b.push(p1[0], h - 0.3, p1[1], 0.4); pagoda(b, { levels: 5, r: 2.6 }); b.pop(); keep.push([...p1, 7]); });
      put(...p2, (h) => { b.push(p2[0], h - 0.2, p2[1], 0); pavilion(b, { n: 4, r: 2.4, h: 3.2, base: 0.5, benches: false, glaze: true, roofColor: 0x2f5a5a }); b.pop(); keep.push([...p2, 6]); });
      main = [0, hz + 5 + 1.5];
    } else if (I.deco === 'pavilion') {
      b.push(0, S(0, 0) - 0.2, 0, 0); pavilion(b, { n: 6, r: 3.2, h: 3.8, base: 0.7, glaze: true, roofColor: 0x2f5a5a, benches: false }); b.pop();
      keep.push([0, 0, 9]); main = [0, 4.6];
    } else if (I.deco === 'pagoda') {
      b.push(0, S(0, 0) - 0.3, 0, 0.3); pagoda(b, { levels: 7, r: 3.4 }); b.pop();
      keep.push([0, 0, 9]); main = [0, 5.2];
    } else if (I.deco === 'grove') {
      // 观松台：汉白玉方台、一对石灯、一张石桌
      const gz = r * 0.05, gy = S(0, gz);
      b.slab(9, 0.4, 9, C.marbleShade, 0, gy - 0.2, gz, { mat: 'stone' });
      b.slab(8.4, 0.12, 8.4, C.marbleWarm, 0, gy + 0.2, gz, { mat: 'stoneSmooth', col: false });
      b.cyl(0.9, 0.7, 0.8, C.stone, 0, gy + 0.32 + 0.4, gz, { seg: 12, mat: 'stoneSmooth' });
      for (const s of [-1, 1]) stoneLanternR(b, s * 3.4, gy + 0.32, gz - 3.4, 0.95);
      keep.push([0, gz, 9]); main = [0, gz + 4.8];
    }
    let arr = null;
    if (I.back) {
      // 传送阵：岛的南侧（朝宗门），阵后一段石径通往主景；沿路石灯；到达点在阵北侧，面朝主景
      const az = edgeS * 0.6, ay = S(0, az);
      teleportArray(b, 0, ay - 0.05, az, { r: 3.4 });
      keep.push([0, az, 7]);
      const [mx, mz] = main;
      const len = Math.hypot(mx, az - 3.9 - mz), nSlab = Math.max(1, Math.floor(len / 1.6));
      for (let i = 0; i <= nSlab; i++) {
        const t = i / nSlab, x = lerp(0, mx, t), z = lerp(az - 3.9, mz, t), h = S(x, z);
        if (h === -Infinity) continue;
        b.slab(2.4, 0.12, 1.45, C.marbleWarm, x, h - 0.06, z, { mat: 'stoneSmooth', col: false });
        keep.push([x, z, 2.6]);
        if (i % 9 === 4) for (const s of [-1, 1]) stoneLanternR(b, x + s * 2.1, S(x + s * 2.1, z), z, 0.85);
      }
      const ax = 0, arz = az - 4.9;
      const [wx, wz] = [I.x + ax, I.z + arz];
      arr = { id: I.id, name: I.name, desc: I.desc, x: I.x, y: I.y + ay + 0.33, z: I.z + az, arrive: { x: wx, z: wz, yaw: Math.PI } };
      this.arrays.push(arr);
    }
    // 山石：扩建的大岛在岛沿与矮岗上散几处叠石（打破圆盘似的岛面，也给岛沿一点遮挡）
    if (I.grow > 1) {
      const nR = Math.round(r / 16);
      for (let k = 0, n = 0; k < nR * 6 && n < nR; k++) {
        const a = rand() * 6.28, rho = n % 2 ? 0.55 + rand() * 0.1 : 0.78 + rand() * 0.1;
        const [lx, lz] = [Math.cos(a), Math.sin(a)];
        const lr = body.shape.R(Math.atan2(lx * body.sn + lz * body.c, lx * body.c - lz * body.sn));
        const wx = lx * lr * rho, wz = lz * lr * rho;
        if (keep.some(([kx, kz, kr]) => (wx - kx) ** 2 + (wz - kz) ** 2 < (kr + 4) ** 2)) continue;
        const h = S(wx, wz);
        if (h === -Infinity) continue;
        rockery(b, wx, h - 0.3, wz, 1.2 + rand() * 1.1, rand, 5 + Math.floor(rand() * 4));
        keep.push([wx, wz, 5]);
        n++;
      }
    }
    // 岛上的树：松为主，杂以樱、老松；主景、阵、路两旁留空
    const nT = Math.round(I.r0 * 0.9 * (I.grow > 1 ? I.grow * 1.6 : 1));
    const placed = [];
    for (let k = 0; k < nT * 4 && placed.length < nT; k++) {
      const a = rand() * 6.28, rho = Math.sqrt(rand()) * 0.86;
      const la = a;                                                     // 世界朝向的方位角（相对岛心）
      const [lx, lz] = [Math.cos(la), Math.sin(la)];
      // 取岛轮廓半径：转到岛的本地方位
      const lr = body.shape.R(Math.atan2(lx * body.sn + lz * body.c, lx * body.c - lz * body.sn));
      const wx = lx * lr * rho, wz = lz * lr * rho;
      if (keep.some(([kx, kz, kr]) => (wx - kx) ** 2 + (wz - kz) ** 2 < kr * kr)) continue;
      if (placed.some(([px, pz]) => (wx - px) ** 2 + (wz - pz) ** 2 < 4.2 * 4.2)) continue;
      const h = S(wx, wz);
      if (h === -Infinity) continue;
      const kind = rand() < 0.2 ? 'sakura' : rand() < 0.18 ? 'pineOld' : 'pine';
      placed.push([wx, wz]);
      const it = veg?.add(kind, I.x + wx, I.z + wz, kind === 'pine' ? 0.9 + rand() * 0.5 : 0.8 + rand() * 0.35, null, I.y + h - 0.05);
      if (it) it.reach = I.id;                                          // 岛上走得到：近处整岛换完整树木、树干碰撞
    }
    if (!b.parts || !Object.keys(b.parts).length) return null;
    const g = b.build({ shadows: true, name: 'isle-deco-' + I.id });
    g.position.set(I.x, I.y, I.z);
    g.userData.isle = I.id;
    this.pendingCols = this.pendingCols || [];
    this.pendingCols.push([b.cols, I.x, I.y, I.z]);
    for (const e of b.emitters) if (e.kind === 'light') this.lights.push({ ...e, x: I.x + e.x, y: I.y + e.y, z: I.z + e.z });
    void arr;
    return g;
  }

  // 岛上构筑物的碰撞体登记进碰撞世界
  addColliders(cw) {
    this.cw = cw;
    let n = 0;
    for (const [cols, x, y, z] of this.pendingCols || []) n += cw.addLocal(cols, x, y, z, 0).length;
    this.pendingCols = [];
    return n;
  }

  // 岛面高度：footY 以上 0.6 米以内的那一面（站立、行走、降落用）；不在任何岛面上为 -Infinity
  groundAt(x, z, footY = Infinity) {
    let best = -Infinity;
    for (const b of this.bodies) {
      const h = b.surfaceAt(x, z);
      if (h > best && h <= footY + 0.6) best = h;
    }
    return best;
  }
  push(c, rs) { let hit = false; for (const b of this.bodies) if (b.push(c, rs)) hit = true; return hit; }
  solidAt(x, y, z) { for (const b of this.bodies) if (b.solidAt(x, y, z)) return true; return false; }
  // (x, z) 所在的岛（不论高度）
  isleAt(x, z) { for (const b of this.bodies) if (b.surfaceAt(x, z) > -Infinity) return b.s; return null; }

  update(t) {
    for (const g of this.groups) for (const c of g.children) if (c.userData.bob != null) c.position.y += Math.sin(t * 0.3 + c.userData.bob) * 0.004;
  }
}
