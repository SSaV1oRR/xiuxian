// 植被：统一的“树皮枝干 + 叶片卡树冠”画法。叶片、针叶、树皮都取自同一张贴图集（Poly Haven / ambientCG CC0 实拍抠图重新组合、
// 统一调成国风色调），每种树一个几何、一个材质，按块实例化。
//   松：S 形主干、分层平展的针叶盘；古松：歪斜、一侧长臂；柏：塔形；阔叶（槐、桂、樟）、红枫、银杏：不规则叶团；柳：垂丝；
//   竹：竹竿 + 竹叶簇；灌木、蕨；岩石为实拍扫描石块（Poly Haven rock_moss_set）。
// 分布：宗门内以少量有造型的景观树为主；山坡按噪声成片成林、留出空隙；陡崖只零星挂松；宗门外的远坡用贴片林。
import * as THREE from 'three';
import { mulberry32, createNoise2D, smoothstep, clamp, fbm } from '../core/math.js';
import { GLOBAL, applyFade } from './shaderlib.js';
import { BAMBOO_ZONE, KEY_TREES, CLEAR, PADS, STAIRS } from './layout.js';
import { stairInfo, CORE } from './terrain.js';
import { ASSETS } from './assets.js';

const UP = new THREE.Vector3(0, 1, 0);
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler(), _QS = new THREE.Quaternion();
const CELLS = () => ASSETS.json.foliage || {};

// ---------- 几何构造 ----------
class TreeGeo {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.sw = []; this.idx = []; }
  get n() { return this.pos.length / 3; }
  // 枝干：沿折线的锥管；每段映射一整格树皮（格内留边防渗色）
  tube(pts, radii, cell, { seg = 6, color = [1, 1, 1], sway = 0, swayEnd = null } = {}) {
    if (!cell) return;
    const [u0, v0, du, dv] = cell, inset = 0.03;
    const t = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < pts.length - 1; i++) {
      const P0 = pts[i], P1 = pts[i + 1];
      t.subVectors(P1, P0).normalize();
      a.set(0, 1, 0); if (Math.abs(t.y) > 0.9) a.set(1, 0, 0);
      a.crossVectors(t, a).normalize(); b.crossVectors(t, a).normalize();
      const len = P0.distanceTo(P1), rep = Math.max(1, Math.round(len / 1.6));
      const base = this.n;
      for (let e = 0; e < 2; e++) {
        const P = e ? P1 : P0, r = e ? radii[i + 1] : radii[i];
        const sw = swayEnd == null ? sway : sway + (swayEnd - sway) * ((i + e) / (pts.length - 1));
        for (let k = 0; k <= seg; k++) {
          const ang = (k / seg) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
          p.copy(a).multiplyScalar(c).addScaledVector(b, s);
          this.pos.push(P.x + p.x * r, P.y + p.y * r, P.z + p.z * r);
          this.nrm.push(p.x, p.y, p.z);
          this.uv.push(u0 + du * (inset + (1 - 2 * inset) * (k / seg)), v0 + dv * (inset + (1 - 2 * inset) * (e ? Math.min(1, rep * 0.62) : 0)));
          this.col.push(...color);
          this.sw.push(sw);
        }
      }
      for (let k = 0; k < seg; k++) { const q = base + k, w = base + seg + 1 + k; this.idx.push(q, w, q + 1, q + 1, w, w + 1); }
    }
  }
  // 叶片卡：中心 c，两轴 ax、ay（单位向量）× 宽高；法线取“球面法线”（朝叶团中心外）与卡面法线的混合
  card(c, ax, ay, w, h, cell, { center = null, shade = 1, sway = 1, top = 1.08, bottom = 0.82, nmix = 0.72 } = {}) {
    if (!cell) return;
    const [u0, v0, du, dv] = cell, base = this.n;
    const fn = new THREE.Vector3().crossVectors(ax, ay).normalize();
    for (const [sx, sy] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      const x = c.x + ax.x * w * sx + ay.x * h * sy, y = c.y + ax.y * w * sx + ay.y * h * sy, z = c.z + ax.z * w * sx + ay.z * h * sy;
      this.pos.push(x, y, z);
      let n = fn;
      if (center) { V.set(x - center.x, (y - center.y) * 1.3, z - center.z).normalize(); n = V.clone().multiplyScalar(nmix).addScaledVector(fn.y < 0 ? fn.clone().negate() : fn, 1 - nmix).normalize(); }
      if (n.y < -0.2) n = n.clone().setY(-0.2).normalize();
      this.nrm.push(n.x, n.y, n.z);
      this.uv.push(u0 + du * (sx + 0.5), v0 + dv * (sy + 0.5));
      const k = shade * (sy > 0 ? top : bottom);
      this.col.push(k, k, k);
      this.sw.push(sway);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sw, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
// 水平叶盘：几张水平卡（顶视针叶团）+ 一圈向外斜立的侧卡（侧视轮廓毛边）
function needlePad(g, c, R, rand, { tops = ['pineTopA', 'pineTopB'], side = 'pineSide', nSide = 5, shade = 1, flat = 0.42, lo = false } = {}) {
  const C = CELLS();
  const nTop = lo ? 1 : 2;
  for (let i = 0; i < nTop; i++) {
    const a = rand() * Math.PI, tilt = (rand() - 0.5) * 0.3;
    const ax = v3(Math.cos(a), 0, Math.sin(a)), ay = v3(-Math.sin(a), tilt, Math.cos(a)).normalize();
    g.card(v3(c.x, c.y + i * R * 0.16, c.z), ax, ay, R * 2.1, R * 2.1 * (0.8 + rand() * 0.2), C[tops[i % tops.length]], { center: v3(c.x, c.y - R * 0.6, c.z), shade: shade * (0.86 + i * 0.12), top: 1.0, bottom: 1.0 });
  }
  const ns = lo ? 3 : nSide;
  for (let i = 0; i < ns; i++) {
    const a = (i / ns) * Math.PI * 2 + rand() * 0.6;
    const out = v3(Math.cos(a), 0, Math.sin(a)), tan = v3(-Math.sin(a), 0, Math.cos(a));
    const up = v3(0, 1, 0).addScaledVector(out, 0.55).normalize();
    const cc = v3(c.x + out.x * R * 0.55, c.y + R * flat * 0.15, c.z + out.z * R * 0.55);
    g.card(cc, tan, up, R * 1.5, R * flat * 2.2, C[side], { center: v3(c.x, c.y - R * 0.5, c.z), shade: shade * 0.95 });
  }
}
// 叶团：三张交叉竖卡 + 一张顶卡
function leafClump(g, c, R, rand, cell, { shade = 1, lo = false, flatten = 0.85, vc = null } = {}) {
  const C = CELLS(), cl = C[cell];
  const n = lo ? 2 : 3, a0 = rand() * Math.PI;
  const ctr = vc || c;                                   // 法线取整个树冠的中心：树冠作为一个体积受光
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI;
    const ax = v3(Math.cos(a), 0, Math.sin(a)), ay = v3(0, 1, 0).addScaledVector(v3(-Math.sin(a), 0, Math.cos(a)), (rand() - 0.5) * 0.4).normalize();
    g.card(c, ax, ay, R * 2, R * 2 * flatten, cl, { center: ctr, shade });
  }
  const a = rand() * Math.PI;
  g.card(v3(c.x, c.y + R * 0.25, c.z), v3(Math.cos(a), 0, Math.sin(a)), v3(-Math.sin(a), 0.15, Math.cos(a)).normalize(), R * 1.9, R * 1.9, cl, { center: vc || v3(c.x, c.y - R * 0.4, c.z), shade: shade * 1.08, top: 1, bottom: 1 });
}

// 弯曲主干：自地面向上，带侧倾与 S 形摆动
function spine(H, lean, rand, segs = 6, wiggle = 0.6) {
  const pts = [v3(0, -0.4, 0)];
  const la = rand() * Math.PI * 2, dir = v3(Math.cos(la) * lean, 1, Math.sin(la) * lean).normalize();
  let p = pts[0].clone();
  const ph = rand() * 6;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs, wob = Math.sin(t * 3.4 + ph) * wiggle;
    const d = dir.clone().add(v3(Math.cos(la + 1.6) * wob * 0.25, 0, Math.sin(la + 1.6) * wob * 0.25)).normalize();
    p = p.clone().addScaledVector(d, (H + 0.4) / segs);
    pts.push(p);
  }
  return pts;
}
const radii = (n, r0, r1) => Array.from({ length: n }, (_, i) => r0 + (r1 - r0) * Math.pow(i / (n - 1), 0.8));
function branch(g, from, dir, len, r0, rand, cell, sway0 = 0.15) {
  const pts = [from.clone()], d = dir.clone().normalize();
  const n = 3;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = from.clone().addScaledVector(d, len * t);
    p.y += Math.sin(t * Math.PI) * len * 0.08 * (rand() - 0.3);
    pts.push(p);
  }
  g.tube(pts, radii(n + 1, r0, r0 * 0.35), cell, { seg: 5, sway: sway0, swayEnd: 0.7, color: [0.92, 0.9, 0.88] });
  return pts[n];
}

// ---------- 各树种 ----------
function pineGeo(seed, { old = false, lo = false } = {}) {
  const rand = mulberry32(seed), C = CELLS(), g = new TreeGeo();
  const H = old ? 7.2 + rand() * 1.8 : 9.5 + rand() * 2.5;
  const pts = spine(H, old ? 0.45 + rand() * 0.25 : 0.12 + rand() * 0.12, rand, old ? 7 : 6, old ? 1.2 : 0.5);
  g.tube(pts, radii(pts.length, old ? 0.46 : 0.34, 0.07), C.barkPine, { seg: lo ? 5 : 7, sway: 0, swayEnd: 0.25, color: [0.95, 0.9, 0.86] });
  // 分层枝：一侧偏重（黄山松的迎风造型）
  const nb = old ? 5 : 8, bias = rand() * Math.PI * 2;
  const pads = [];
  for (let i = 0; i < nb; i++) {
    const t = (old ? 0.42 : 0.3) + (i / nb) * (old ? 0.52 : 0.64);
    const k = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1))), u = t * (pts.length - 1) - k;
    const base = pts[k].clone().lerp(pts[k + 1], u);
    const a = bias + (rand() - 0.5) * 2.6 + (i % 2 ? Math.PI * 0.55 : 0);
    const L = (old ? 3.4 : 2.3) * (1.15 - t * 0.6) * (0.8 + rand() * 0.45) * (old && i === 1 ? 1.7 : 1);
    const tip = branch(g, base, v3(Math.cos(a), 0.12 + rand() * 0.18, Math.sin(a)), L, (old ? 0.16 : 0.12) * (1.1 - t * 0.5), rand, C.barkPine);
    pads.push([tip, (old ? 1.55 : 1.3) * (1.2 - t * 0.45) * (0.85 + rand() * 0.3)]);
  }
  const top = pts[pts.length - 1];
  pads.push([top.clone().add(v3(0, 0.15, 0)), old ? 1.45 : 1.25]);
  for (const [c, R] of pads) needlePad(g, c, R, rand, { lo, shade: 0.9 + rand() * 0.2, nSide: old ? 6 : 5 });
  return g.build();
}

function cypressGeo(seed, { old = false, lo = false } = {}) {
  const rand = mulberry32(seed), C = CELLS(), g = new TreeGeo();
  const H = old ? 9 : 10.5;
  const pts = spine(H, old ? 0.1 : 0.03, rand, 5, old ? 0.5 : 0.15);
  g.tube(pts, radii(pts.length, old ? 0.45 : 0.3, 0.06), C.barkBroad, { seg: lo ? 5 : 6, swayEnd: 0.2, color: [0.8, 0.72, 0.66] });
  const n = lo ? 5 : 8;
  for (let i = 0; i < n; i++) {
    const t = 0.22 + (i / n) * 0.78, k = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1))), u = t * (pts.length - 1) - k;
    const c = pts[k].clone().lerp(pts[k + 1], u);
    const R = (old ? 1.9 : 1.5) * (1.08 - t * 0.72) * (0.85 + rand() * 0.3);
    const m = lo ? 3 : 4;
    for (let j = 0; j < m; j++) {
      const a = (j / m) * Math.PI * 2 + rand() * 0.7, out = v3(Math.cos(a), 0, Math.sin(a));
      g.card(c.clone().addScaledVector(out, R * 0.35), v3(-Math.sin(a), 0, Math.cos(a)), v3(0, 1, 0).addScaledVector(out, 0.3).normalize(), R * 1.9, R * 2.2, C.cypressSide, { center: c, shade: 0.85 + t * 0.25 });
    }
    if (i % 2 === 0) g.card(c.clone().add(v3(0, R * 0.4, 0)), v3(1, 0, 0), v3(0, 0.2, 1).normalize(), R * 1.8, R * 1.8, C.cypressTop, { center: c, shade: 0.95 + t * 0.2 });
  }
  return g.build();
}

// 阔叶树：主干分 4 枝，枝端与树冠椭球面上布满叶团（越靠外越亮）；cell 决定树种（broadA/broadB/maple/ginkgo）
function broadGeo(seed, cell, { H = 7, R = 3, trunkH = 3, lo = false, bark = 'barkBroad', clumpR = 1.6, nClump = 6 } = {}) {
  const rand = mulberry32(seed), C = CELLS(), g = new TreeGeo();
  const pts = spine(trunkH, 0.12 + rand() * 0.15, rand, 3, 0.4);
  g.tube(pts, radii(pts.length, 0.3, 0.18), C[bark], { seg: lo ? 5 : 7, swayEnd: 0.1, color: [0.9, 0.86, 0.8] });
  const top = pts[pts.length - 1], tips = [];
  const nb = 4;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + rand() * 0.8;
    tips.push(branch(g, top, v3(Math.cos(a) * 0.8, 0.9 + rand() * 0.5, Math.sin(a) * 0.8), (H - trunkH) * (0.5 + rand() * 0.25), 0.14, rand, C[bark], 0.1));
  }
  const ch = (H - trunkH) * 0.5, crown = v3(top.x, trunkH + ch * 1.05, top.z);
  const nC = lo ? Math.ceil(nClump * 0.45) : nClump;
  const rc = clumpR * 0.72;
  for (let i = 0; i < nC; i++) {
    // 树冠椭球面附近取点（下半部收窄），保证轮廓饱满
    const u = rand(), th = rand() * Math.PI * 2, ph = Math.acos(1 - 2 * Math.pow(u, 0.8));
    const sx = Math.sin(ph) * Math.cos(th), sy = Math.cos(ph), sz = Math.sin(ph) * Math.sin(th);
    const k = 0.62 + rand() * 0.38;
    const c = i < tips.length ? tips[i].clone().add(v3(0, rc * 0.4, 0)) : v3(crown.x + sx * R * k, crown.y + sy * ch * k * (sy < 0 ? 0.7 : 1), crown.z + sz * R * k);
    leafClump(g, c, rc * (0.85 + rand() * 0.35), rand, cell, { lo, shade: 0.8 + Math.max(0, sy) * 0.25 + k * 0.08, vc: crown });
  }
  return g.build();
}

function willowGeo(seed, { lo = false } = {}) {
  const rand = mulberry32(seed), C = CELLS(), g = new TreeGeo();
  const pts = spine(4.2, 0.28, rand, 4, 0.8);
  g.tube(pts, radii(pts.length, 0.38, 0.2), C.barkBroad, { seg: 7, swayEnd: 0.1, color: [0.82, 0.78, 0.7] });
  const top = pts[pts.length - 1];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rand();
    branch(g, top, v3(Math.cos(a), 0.7, Math.sin(a)), 2.4, 0.12, rand, C.barkBroad, 0.1);
  }
  leafClump(g, top.clone().add(v3(0, 1.3, 0)), 2.0, rand, 'broadB', { shade: 1.05, lo });
  const n = lo ? 10 : 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.3, r = 1.4 + rand() * 1.6;
    const hgt = 2.8 + rand() * 1.6, cx = top.x + Math.cos(a) * r, cz = top.z + Math.sin(a) * r, cy = top.y + 1.6 - hgt / 2;
    g.card(v3(cx, cy, cz), v3(-Math.sin(a), 0, Math.cos(a)), v3(0, 1, 0), 1.3, hgt, C.willow, { center: v3(top.x, top.y + 1, top.z), shade: 0.95 + rand() * 0.15, sway: 1.3, top: 1.05, bottom: 0.95 });
  }
  return g.build();
}

// 竹丛：竹竿（树皮格染成竹青）+ 竹叶簇卡
function bambooGeo(seed, { lo = false } = {}) {
  const rand = mulberry32(seed), C = CELLS(), g = new TreeGeo();
  const n = 8 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2, r = 0.15 + rand() * 0.75, h = 5.6 + rand() * 2.8, lean = 0.05 + rand() * 0.1;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r, tx = bx + Math.cos(a) * h * lean, tz = bz + Math.sin(a) * h * lean;
    const col = i % 3 ? [0.62, 0.72, 0.42] : [0.72, 0.76, 0.48];
    g.tube([v3(bx, -0.2, bz), v3((bx + tx) / 2, h * 0.5, (bz + tz) / 2), v3(tx, h, tz)], [0.065, 0.055, 0.035], C.barkBroad, { seg: 4, sway: 0, swayEnd: 0.9, color: col });
    const m = lo ? 2 : 3 + Math.floor(rand() * 2);
    for (let k = 0; k < m; k++) {
      const u = 0.5 + (k / m) * 0.46 + rand() * 0.05;
      const x = bx + (tx - bx) * u + Math.cos(a) * 0.35, y = h * u, z = bz + (tz - bz) * u + Math.sin(a) * 0.35;
      const yaw = rand() * Math.PI, s = 1.2 + rand() * 0.7;
      for (const q of [0, Math.PI / 2]) g.card(v3(x, y, z), v3(Math.cos(yaw + q), 0, Math.sin(yaw + q)), v3(0, 1, 0).addScaledVector(v3(-Math.sin(yaw + q), 0, Math.cos(yaw + q)), 0.35).normalize(), s, s * 0.85, C[k % 2 ? 'bambooA' : 'bambooB'], { center: v3(bx, y - 0.6, bz), shade: 0.85 + rand() * 0.3, sway: 1.2 });
    }
  }
  return g.build();
}

function shrubGeo(seed, cell = 'shrub', { lo = false, R = 0.9 } = {}) {
  const rand = mulberry32(seed), g = new TreeGeo();
  const n = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    const a = rand() * 6.28, r = rand() * R * 0.5;
    leafClump(g, v3(Math.cos(a) * r, R * (0.55 + rand() * 0.3), Math.sin(a) * r), R * (0.7 + rand() * 0.4), rand, cell, { lo, shade: 0.85 + rand() * 0.2, flatten: 0.75 });
  }
  return g.build();
}
function fernGeo(seed) {
  const rand = mulberry32(seed), C = CELLS(), g = new TreeGeo();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI + rand() * 0.3;
    g.card(v3(0, 0.45, 0), v3(Math.cos(a), 0, Math.sin(a)), v3(0, 1, 0), 1.2, 0.95, C.fern, { center: v3(0, 0, 0), shade: 0.9 + rand() * 0.2, sway: 0.6 });
  }
  return g.build();
}
// 远景贴片树：两张交叉竖卡（树冠侧影）+ 顶卡 + 细树干卡；按树种取对应的叶簇格
const IMP = {
  pine: ['pineSide', 'pineTopA', 6.4, 8.6, 4.2, 0.95], pineOld: ['pineSide', 'pineTopB', 7.4, 6.8, 3.6, 0.9],
  cypress: ['cypressSide', 'cypressTop', 3.8, 9.5, 2.2, 0.9], cypressOld: ['cypressSide', 'cypressTop', 4.4, 8.4, 2.4, 0.9],
  broad: ['broadA', 'broadB', 6.6, 6.2, 3.2, 1.0], locust: ['broadA', 'broadB', 7.6, 6.6, 3.6, 1.0], osmanthus: ['broadB', 'broadB', 4.2, 3.8, 1.4, 0.92],
  maple: ['maple', 'maple', 6, 5.4, 2.8, 1.0], ginkgo: ['ginkgo', 'ginkgo', 5.4, 7.2, 3.2, 1.0], willow: ['willow', 'broadB', 6, 5.5, 3.0, 1.0],
  bamboo: ['bambooB', 'bambooA', 3.2, 6.4, 1.4, 0.95],
};
function impGeo(type) {
  const C = CELLS(), g = new TreeGeo(), [sideC, topC, w, h, trunkH, shade] = IMP[type] || IMP.pine;
  const cy = trunkH + h / 2 - 0.4;
  for (const a of [0.3, 0.3 + Math.PI / 2]) {
    g.card(v3(0, cy, 0), v3(Math.cos(a), 0, Math.sin(a)), v3(0, 1, 0), w, h, C[sideC], { center: v3(0, cy - h * 0.2, 0), shade, sway: 0.3 });
    g.card(v3(0, trunkH / 2, 0), v3(Math.cos(a), 0, Math.sin(a)), v3(0, 1, 0), 0.45, trunkH + 0.4, C.barkPine, { shade: 0.8, sway: 0, nmix: 0 });
  }
  g.card(v3(0, trunkH + h * 0.78, 0), v3(1, 0, 0), v3(0, 0.18, 1).normalize(), w * 0.95, w * 0.95, C[topC], { center: v3(0, cy, 0), shade: shade * 1.06, sway: 0.3, top: 1, bottom: 1 });
  return g.build();
}
const farTreeGeo = (kind) => impGeo(kind === 'conifer' ? 'pine' : 'broad');

// ---------- 草丛、野花、落叶（顶点色几何，沿用）----------
function grassGeo(seed, tint = 0x86925e) {
  const rand = mulberry32(seed), pos = [], col = [];
  const base = new THREE.Color(0x58623f), top = new THREE.Color(tint);
  for (let b = 0; b < 9; b++) {
    const a = rand() * Math.PI, w = 0.05 + rand() * 0.03, h = 0.35 + rand() * 0.35, lean = 0.12 + rand() * 0.18;
    const cx = Math.cos(a), cz = Math.sin(a), ox = (rand() - 0.5) * 0.3, oz = (rand() - 0.5) * 0.3;
    pos.push(ox - cx * w, 0, oz - cz * w, ox + cx * w, 0, oz + cz * w, ox + cz * lean, h, oz - cx * lean);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, top.r, top.g, top.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const nrm = new Float32Array(pos.length);
  for (let i = 0; i < nrm.length; i += 3) nrm[i + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}
function flowerGeo(seed) {
  const rand = mulberry32(seed), g0 = grassGeo(seed + 1, 0x6a7a48);
  const pos = [...g0.attributes.position.array], col = [...g0.attributes.color.array];
  const sets = [[0xf2efe6, 0xe9e2f2], [0xeab4c8, 0xf2d0dc], [0xe8cf6a, 0xf0e2a0], [0xc4aee8, 0xdccdf2]];
  const set = sets[seed % sets.length];
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Color(set[i % 2]), x = (rand() - 0.5) * 0.45, y = 0.3 + rand() * 0.25, z = (rand() - 0.5) * 0.45, s = 0.055;
    pos.push(x - s, y, z, x + s, y, z, x, y + s * 1.2, z + s * 0.4, x, y, z - s, x, y, z + s, x + s * 0.4, y + s * 1.2, z);
    for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const nrm = new Float32Array(pos.length); for (let i = 0; i < nrm.length; i += 3) nrm[i + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}
function leafLitterGeo(seed) {
  const rand = mulberry32(seed), pos = [], col = [];
  const pal = [0xb08a46, 0x9a6a3a, 0xc4a25a, 0x8a5a36];
  for (let i = 0; i < 26; i++) {
    const a = rand() * 6.28, r = Math.sqrt(rand()) * 1.6, x = Math.cos(a) * r, z = Math.sin(a) * r, s = 0.07 + rand() * 0.05, ang = rand() * 6.28;
    const c = new THREE.Color(pal[Math.floor(rand() * 4)]);
    const ca = Math.cos(ang) * s, sa = Math.sin(ang) * s;
    pos.push(x - ca, 0.02, z - sa, x + sa * 0.6, 0.02, z - ca * 0.6, x + ca, 0.02, z + sa);
    pos.push(x - ca, 0.02, z - sa, x + ca, 0.02, z + sa, x - sa * 0.6, 0.02, z + ca * 0.6);
    for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const nrm = new Float32Array(pos.length); for (let i = 0; i < nrm.length; i += 3) nrm[i + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}

// ---------- 材质 ----------
// 远近细节由着色器按“块”判定（与 CPU 端的块判定一致）：贴片树在近处块内收起；草与小灌木在 uFadeR 以外收起
export const VEGU = { uFocus: { value: new THREE.Vector3() }, uLodR: { value: 88 }, uChunk: { value: 128 }, uFadeR: { value: 150 } };
const LOD_GLSL = `
  #ifdef USE_INSTANCING
    #ifdef VEG_IMPOSTOR
      { vec2 cc = (floor(instanceMatrix[3].xz / uChunk) + .5) * uChunk;
        if (aHasHi > .5 && distance(cc, uFocus.xz) < uLodR) transformed = vec3(0.); }
    #endif
    #ifdef VEG_FADE
      { float d = distance(instanceMatrix[3].xz, uFocus.xz);
        transformed *= 1. - smoothstep(uFadeR * .8, uFadeR, d); }
    #endif
  #endif`;
// 树（贴图集）：叶卡不随背面翻转法线（球面法线使树冠受光柔和），远处按 mip 级提升透明度阈值以内的覆盖，避免树冠变稀
// variant：'' 近景完整树；'imp' 贴片（近处块内收起）；'fade' 小灌木（远处收起）
function treeMaterial(variant = '', tex = ASSETS.tex.foliage, size = [2048, 2048], key = '', glow = 0.05) {
  const m = new THREE.MeshStandardMaterial({ map: tex || null, vertexColors: true, roughness: 0.88, metalness: 0, side: THREE.DoubleSide, alphaTest: tex ? 0.42 : 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = GLOBAL.uTime;
    Object.assign(sh.uniforms, VEGU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        ${variant === 'imp' ? '#define VEG_IMPOSTOR' : variant === 'fade' ? '#define VEG_FADE' : ''}
        uniform float uTime; attribute float aSway; uniform vec3 uFocus; uniform float uLodR, uChunk, uFadeR;
        #ifdef VEG_IMPOSTOR
          attribute float aHasHi;
        #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.);
        #endif
        float sw = (sin(uTime * 1.25 + ip.x * .07 + ip.z * .05 + position.y * .3) + .4 * sin(uTime * 2.7 + ip.x * .3 + position.x)) * .045 * aSway * max(position.y, 0.) * .25;
        transformed.x += sw; transformed.z += sw * .6;
        ${LOD_GLSL}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        #ifdef DOUBLE_SIDED
          normal *= faceDirection;   // 叶卡：背面不翻转
        #endif`)
      .replace('#include <alphatest_fragment>', `{
          vec2 ts = vec2(${size[0].toFixed(1)}, ${size[1].toFixed(1)});
          vec2 dx = dFdx(vMapUv * ts), dy = dFdy(vMapUv * ts);
          float mip = max(0., .5 * log2(max(dot(dx, dx), dot(dy, dy))));
          diffuseColor.a *= 1. + mip * .28;
        }
        #include <alphatest_fragment>`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * ${glow.toFixed(2)};`);   // 花瓣与叶片透光：背光处不至于发黑
    applyFade(sh, { cut: true });
  };
  m.customProgramCacheKey = () => 'veg-tree2-' + variant + key;
  return m;
}

// ---------- 花树：樱花（粉）、淡紫花树、金叶树 ----------
// 贴图集 assets/converted/trees/blossom.png（tools/make_blossom_atlas.py 由项目里已有的樱花与银杏叶贴图截取、调色）：
// 主干与三级分枝用树皮管，枝梢上挂一簇簇花簇卡片（每簇三张交叉竖卡 + 一张顶卡），簇与簇之间留空，近看有枝条托着、透得出天光
export const BLOSSOM_CELLS = {
  sakuraA: [0, 0, 0.25, 0.5], sakuraB: [0.25, 0, 0.25, 0.5], bark: [0.75, 0, 0.25, 0.5],
  // 单朵花与花瓣（一格里 2×2，近白，由顶点色染成樱粉或淡紫）
  flowerA: [0.5, 0.25, 0.125, 0.25], flowerB: [0.625, 0.25, 0.125, 0.25], buds: [0.5, 0, 0.125, 0.25], petal: [0.625, 0, 0.125, 0.25],
  lilacA: [0, 0.5, 0.25, 0.5], lilacB: [0.25, 0.5, 0.25, 0.5], goldA: [0.5, 0.5, 0.25, 0.5], goldB: [0.75, 0.5, 0.25, 0.5],
};
const BLOSSOM_KINDS = {
  // 樱：粗短的干，四五道主枝斜展，再分枝、分梢，树冠宽而成伞形；花簇挂在梢头，外层缀满单朵的花
  sakura: { trunkH: 1.7, lean: 0.2, r0: 0.3, spread: 3.6, up: [0.32, 0.3], cells: ['sakuraA', 'sakuraB'], cR: [0.42, 0.26], per: 2, bark: [0.55, 0.43, 0.43],
    nb: 5, sec: 3, twig: 2, flowers: 22, tint: [1.0, 0.86, 0.9], dome: 0.85 },
  // 淡紫花树：枝条更直立，树冠圆而略小
  lilac: { trunkH: 2.0, lean: 0.12, r0: 0.24, spread: 2.8, up: [0.7, 0.3], cells: ['lilacA', 'lilacB'], cR: [0.4, 0.24], per: 2, bark: [0.62, 0.58, 0.56],
    nb: 5, sec: 3, twig: 2, flowers: 18, tint: [0.88, 0.8, 1.0], dome: 1.15 },
  // 金叶树（银杏一类）：高干、主枝上举，树冠呈卵形，有中央主梢；叶簇不缀单花
  gold: { trunkH: 2.6, lean: 0.05, r0: 0.3, spread: 2.5, up: [1.0, 0.4], cells: ['goldA', 'goldB'], cR: [0.55, 0.3], per: 3, bark: [0.7, 0.66, 0.6],
    nb: 5, sec: 2, twig: 1, flowers: 0, tint: [1, 1, 1], leader: true, dome: 1.4 },
};
// 一团花：两三张交叉竖卡 + 一张顶卡（花簇贴图）
function blossomClump(g, c, R, rand, cell, { lo = false, vc = null, shade = 1, tint = null } = {}) {
  const n = lo ? 2 : 3, a0 = rand() * Math.PI, base = g.n;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI;
    const ax = v3(Math.cos(a), 0, Math.sin(a)), ay = v3(0, 1, 0).addScaledVector(v3(-Math.sin(a), 0, Math.cos(a)), (rand() - 0.5) * 0.6).normalize();
    g.card(c, ax, ay, R * 2, R * 1.8, cell, { center: vc || c, shade, nmix: 0.6 });
  }
  const a = rand() * Math.PI;
  g.card(v3(c.x, c.y + R * 0.22, c.z), v3(Math.cos(a), 0, Math.sin(a)), v3(-Math.sin(a), 0.2, Math.cos(a)).normalize(), R * 1.9, R * 1.9, cell, { center: vc || c, shade: shade * 1.06, top: 1, bottom: 1 });
  if (tint) for (let i = base; i < g.n; i++) { g.col[i * 3] *= tint[0]; g.col[i * 3 + 1] *= tint[1]; g.col[i * 3 + 2] *= tint[2]; }
}
// 单朵的花：贴在花团外表面上的小方片（约 0.13～0.2 米），朝外、随机倾转；近看是一朵朵五瓣花
function scatterFlowers(g, c, R, n, rand, P, vc) {
  const B = BLOSSOM_CELLS, base = g.n;
  for (let i = 0; i < n; i++) {
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
    const nrm = v3(rr * Math.cos(th), u * 0.8 + 0.2, rr * Math.sin(th)).normalize();
    const p = c.clone().addScaledVector(nrm, R * (0.78 + rand() * 0.3));
    // 方片平面：大致朝外，再随机转动
    const t1 = v3(0, 1, 0).cross(nrm); if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0); t1.normalize();
    const t2 = nrm.clone().cross(t1).normalize();
    const ang = rand() * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
    const ax = t1.clone().multiplyScalar(ca).addScaledVector(t2, sa), ay = t1.clone().multiplyScalar(-sa).addScaledVector(t2, ca);
    const tilt = (rand() - 0.5) * 0.9; ax.addScaledVector(nrm, tilt).normalize();
    const k = rand(), cell = k < 0.42 ? B.flowerA : k < 0.84 ? B.flowerB : B.buds, sz = (k < 0.84 ? 0.15 : 0.22) + rand() * 0.07;
    g.card(p, ax, ay, sz, sz, cell, { center: vc, shade: 0.95 + rand() * 0.12, sway: 1, top: 1, bottom: 1, nmix: 0.5 });
  }
  for (let i = base; i < g.n; i++) { g.col[i * 3] *= P.tint[0]; g.col[i * 3 + 1] *= P.tint[1]; g.col[i * 3 + 2] *= P.tint[2]; }
}
function blossomGeo(seed, kind, { lo = false } = {}) {
  const rand = mulberry32(seed), B = BLOSSOM_CELLS, P = BLOSSOM_KINDS[kind], g = new TreeGeo();
  const pts = spine(P.trunkH, P.lean + rand() * 0.12, rand, 3, 0.55);
  g.tube(pts, radii(pts.length, P.r0, P.r0 * 0.6), B.bark, { seg: lo ? 5 : 8, swayEnd: 0.05, color: P.bark });
  const top = pts[pts.length - 1], tips = [];
  if (P.leader) {                     // 中央主梢：继续向上，沿途分出短枝
    const lead = [top.clone()];
    for (let i = 1; i <= 3; i++) lead.push(top.clone().add(v3((rand() - 0.5) * 0.4, i * 1.45, (rand() - 0.5) * 0.4)));
    g.tube(lead, radii(lead.length, P.r0 * 0.6, 0.06), B.bark, { seg: lo ? 4 : 6, sway: 0.06, swayEnd: 0.5, color: P.bark });
    for (let i = 1; i < lead.length; i++) {
      const a = rand() * Math.PI * 2;
      tips.push(branch(g, lead[i], v3(Math.cos(a), 0.55, Math.sin(a)), 1.2 + rand() * 0.6 - i * 0.2, 0.06, rand, B.bark, 0.3));
      tips.push(lead[i].clone().add(v3(0, 0.35, 0)));
    }
  }
  // 主枝 → 分枝 → 梢：逐级变细、略向上翘，梢头与分枝处都挂花
  const nb = lo ? P.nb - 1 : P.nb;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + rand() * 0.7;
    const L1 = P.spread * (0.45 + rand() * 0.2);
    const mid = branch(g, top, v3(Math.cos(a), P.up[0] + rand() * P.up[1], Math.sin(a)), L1, P.r0 * 0.5, rand, B.bark, 0.06);
    const ns = lo ? Math.max(1, P.sec - 1) : P.sec;
    for (let j = 0; j < ns; j++) {
      const b = a + (rand() - 0.5) * 1.6;
      const sec = branch(g, mid, v3(Math.cos(b), P.up[0] * 0.8 + 0.2 + rand() * 0.35, Math.sin(b)), P.spread * (0.3 + rand() * 0.22), P.r0 * 0.24, rand, B.bark, 0.2);
      tips.push(sec);
      const nt = lo ? 0 : P.twig;
      for (let k = 0; k < nt; k++) {
        const c2 = b + (rand() - 0.5) * 1.8;
        tips.push(branch(g, sec, v3(Math.cos(c2), 0.35 + rand() * 0.5, Math.sin(c2)), 0.55 + rand() * 0.6, 0.035, rand, B.bark, 0.45));
      }
    }
    tips.push(mid.clone().add(v3(0, 0.25, 0)));
  }
  // 花团：梢头成团、上下错落，树冠整体呈伞形 / 圆形；外层缀满单朵的花
  const crown = v3(top.x, top.y + P.spread * 0.45, top.z);
  const cellOf = () => B[P.cells[Math.floor(rand() * P.cells.length)]];
  for (const tip of tips) {
    const n = lo ? 1 : P.per;
    for (let k = 0; k < n; k++) {
      const c = tip.clone().add(v3((rand() - 0.5) * 0.9, (rand() - 0.25) * 0.7 * P.dome, (rand() - 0.5) * 0.9));
      const R = P.cR[0] + rand() * P.cR[1];
      blossomClump(g, c, R, rand, cellOf(), { lo, vc: crown, shade: 0.86 + rand() * 0.22, tint: P.flowers ? P.tint : null });
      if (P.flowers && !lo) scatterFlowers(g, c, R, P.flowers, rand, P, crown);
    }
  }
  return g.build();
}
// 花树的远景贴片：两张交叉的花簇卡 + 顶卡 + 树干卡（花树贴图集）
const BLOSSOM_IMP = { sakura: ['sakuraA', 'sakuraB', 7.4, 4.6, 1.9, 1.0, [1.0, 0.88, 0.92]], lilac: ['lilacA', 'lilacB', 5.8, 5.0, 2.1, 1.0, [1, 1, 1]], goldTree: ['goldA', 'goldB', 5.2, 6.6, 2.6, 1.0, [1, 1, 1]] };
function blossomImpGeo(type) {
  const B = BLOSSOM_CELLS, g = new TreeGeo(), [sideC, topC, w, h, trunkH, shade, tint] = BLOSSOM_IMP[type];
  const cy = trunkH + h / 2 - 0.4;
  for (const a of [0.3, 0.3 + Math.PI / 2]) {
    g.card(v3(0, cy, 0), v3(Math.cos(a), 0, Math.sin(a)), v3(0, 1, 0), w, h, B[sideC], { center: v3(0, cy - h * 0.2, 0), shade, sway: 0.3 });
    g.card(v3(0, trunkH / 2, 0), v3(Math.cos(a), 0, Math.sin(a)), v3(0, 1, 0), 0.5, trunkH + 0.4, B.bark, { shade: 0.6, sway: 0, nmix: 0 });
  }
  g.card(v3(0, trunkH + h * 0.75, 0), v3(1, 0, 0), v3(0, 0.18, 1).normalize(), w * 0.95, w * 0.95, B[topC], { center: v3(0, cy, 0), shade: shade * 1.06, sway: 0.3, top: 1, bottom: 1 });
  for (let i = 0; i < g.col.length; i += 3) { g.col[i] *= tint[0]; g.col[i + 1] *= tint[1]; g.col[i + 2] *= tint[2]; }
  return g.build();
}
function plainMaterial(kind) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = GLOBAL.uTime;
    Object.assign(sh.uniforms, VEGU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n#define VEG_FADE\nuniform float uTime; uniform vec3 uFocus; uniform float uLodR, uChunk, uFadeR;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.);
        #endif
        ${kind === 'grass' ? 'float sw = (sin(uTime * 1.25 + ip.x * .07 + ip.z * .05) + .4 * sin(uTime * 2.7 + ip.x * .3)) * .1 * max(0., position.y - .05); transformed.x += sw; transformed.z += sw * .6;' : ''}
        ${LOD_GLSL}`);
    applyFade(sh, { cut: false });
  };
  m.customProgramCacheKey = () => 'veg-plain-' + kind;
  return m;
}

// ---------- 素材树（assets/tree/stylizedtree_pack.blend，经 tools/convert_assets.py 去掉底座草皮、减面为 LOD0 / LOD1）----------
// 原素材是一张贴图画好的风格化树：这里只压低一些饱和度（与宗门的设色统一），加上随风轻摆，并与其他植被一样在角色前方镂空。
const MODEL_MATS = new Map();
function modelTreeMaterial(src, sat, tint = null) {
  if (MODEL_MATS.has(src.uuid)) return MODEL_MATS.get(src.uuid);
  const m = new THREE.MeshStandardMaterial({ map: src.map || null, roughness: 0.86, metalness: 0 });
  if (tint) m.color.setRGB(...tint);           // 紫薇：蓝紫的花色偏向粉紫
  if (m.map) m.map.anisotropy = 8;
  const uSat = { value: sat };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = GLOBAL.uTime;
    sh.uniforms.uSat = uSat;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.);
        #endif
        { float hh = max(position.y - 1.2, 0.);
          float sw = (sin(uTime * 1.1 + ip.x * .07 + ip.z * .05) + .35 * sin(uTime * 2.3 + ip.x * .3 + position.y * .4)) * .0035 * min(hh * hh, 30.);
          transformed.x += sw; transformed.z += sw * .6; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSat;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        { float l = dot(diffuseColor.rgb, vec3(.3, .59, .11)); diffuseColor.rgb = mix(vec3(l), diffuseColor.rgb, uSat); }`);
    applyFade(sh, { cut: true });
  };
  m.customProgramCacheKey = () => 'veg-model-tree';
  MODEL_MATS.set(src.uuid, m);
  return m;
}

// ---------- 树种表 ----------
// variants / lo：近景与远景几何；r 碰撞半径；h 碰撞高；crown [冠底, 冠顶]（镜头避让）
const TYPES = {
  pine: { variants: () => [11, 23, 37].map((s) => pineGeo(s)), lo: () => [11, 23, 37].map((s) => pineGeo(s, { lo: true })), r: 0.4, h: 9, crown: [3.6, 11.5] },
  pineOld: { variants: () => [51, 77, 93].map((s) => pineGeo(s, { old: true })), lo: () => [51, 77, 93].map((s) => pineGeo(s, { old: true, lo: true })), r: 0.55, h: 7, crown: [3.4, 9.5] },
  cypress: { variants: () => [5, 9].map((s) => cypressGeo(s)), lo: () => [5, 9].map((s) => cypressGeo(s, { lo: true })), r: 0.36, h: 9, crown: [2.2, 11] },
  cypressOld: { variants: () => [13].map((s) => cypressGeo(s, { old: true })), lo: () => [13].map((s) => cypressGeo(s, { old: true, lo: true })), r: 0.5, h: 8, crown: [2.4, 9.6] },
  broad: { variants: () => [31, 47].map((s) => broadGeo(s, s === 31 ? 'broadA' : 'broadB', { H: 8.5, R: 3.4, trunkH: 3.3, clumpR: 1.8, nClump: 16 })), lo: () => [31, 47].map((s) => broadGeo(s, s === 31 ? 'broadA' : 'broadB', { H: 8.5, R: 3.4, trunkH: 3.3, clumpR: 1.8, nClump: 16, lo: true })), r: 0.45, h: 8, crown: [3.4, 9.5] },
  locust: { variants: () => [6].map((s) => broadGeo(s, 'broadA', { H: 9, R: 4, trunkH: 3.6, clumpR: 2.1, nClump: 18 })), lo: () => [6].map((s) => broadGeo(s, 'broadA', { H: 9, R: 4, trunkH: 3.6, clumpR: 2.1, nClump: 18, lo: true })), r: 0.45, h: 8, crown: [3.8, 10] },
  osmanthus: { variants: () => [4].map((s) => broadGeo(s, 'broadB', { H: 4.8, R: 2.0, trunkH: 1.5, clumpR: 1.25, nClump: 12 })), lo: () => [4].map((s) => broadGeo(s, 'broadB', { H: 4.8, R: 2.0, trunkH: 1.5, clumpR: 1.25, nClump: 12, lo: true })), r: 0.3, h: 4, crown: [1.6, 5.4] },
  maple: { variants: () => [8, 19].map((s) => broadGeo(s, 'maple', { H: 7, R: 3, trunkH: 2.8, clumpR: 1.55, nClump: 15 })), lo: () => [8, 19].map((s) => broadGeo(s, 'maple', { H: 7, R: 3, trunkH: 2.8, clumpR: 1.55, nClump: 15, lo: true })), r: 0.35, h: 6, crown: [2.8, 7.8] },
  ginkgo: { variants: () => [3].map((s) => broadGeo(s, 'ginkgo', { H: 10, R: 2.8, trunkH: 3.4, clumpR: 1.7, nClump: 15 })), lo: () => [3].map((s) => broadGeo(s, 'ginkgo', { H: 10, R: 2.8, trunkH: 3.4, clumpR: 1.7, nClump: 15, lo: true })), r: 0.45, h: 9, crown: [3.2, 11] },
  willow: { variants: () => [2].map((s) => willowGeo(s)), lo: () => [2].map((s) => willowGeo(s, { lo: true })), r: 0.42, h: 7, crown: [3.0, 7.5] },
  bamboo: { variants: () => [61, 62, 63].map((s) => bambooGeo(s)), lo: () => [61, 62, 63].map((s) => bambooGeo(s, { lo: true })), r: 0.85, h: 9, crown: [2.2, 7.8] },
  shrub: { variants: () => [71, 72, 73].map((s) => shrubGeo(s)), r: 0, h: 0 },
  shrubDry: { variants: () => [81].map((s) => shrubGeo(s, 'ginkgo', { R: 0.8 })), r: 0, h: 0 },
  fern: { variants: () => [91, 92].map((s) => fernGeo(s)), r: 0, h: 0 },
  grass: { variants: () => [101, 102].map((s) => grassGeo(s)).concat([grassGeo(103, 0x9c9a62)]), mat: 'grass', r: 0, h: 0 },
  flower: { variants: () => [112, 113, 114, 115].map((s) => flowerGeo(s)), mat: 'grass', r: 0, h: 0 },
  leaves: { variants: () => [121, 122].map((s) => leafLitterGeo(s)), mat: 'leaf', r: 0, h: 0 },
  rock: { rock: true, r: 1.0, h: 1.2 },
  // 花树（花树贴图集，常显；数量少，不做远景贴片）
  sakura: { variants: () => [201, 202, 203, 204].map((s) => blossomGeo(s, 'sakura')), mat: 'blossom', blossomImp: true, r: 0.32, h: 3, crown: [3.8, 5.8] },
  lilac: { variants: () => [211, 212, 213].map((s) => blossomGeo(s, 'lilac')), mat: 'blossom', blossomImp: true, r: 0.28, h: 3, crown: [3.0, 6.0] },
  goldTree: { variants: () => [221, 222, 223].map((s) => blossomGeo(s, 'gold')), mat: 'blossom', blossomImp: true, r: 0.35, h: 4, crown: [3.0, 9.0] },     // 银杏（D06-03）：主梢 + 上举主枝，扇形叶簇成团、簇间留空；三种轮廓
  // 素材树（model 为 trees.glb 中的节点名；r 树干碰撞半径、crown [冠幅, 冠顶] 均为缩放 1 时的米数；sat 饱和度；sink 埋入地面）
  // 院落景观树：云片古松（PineTree_03）、虬枝老树（OakTree_02）、紫薇（JacarandaTree）、池边垂柳（WillowTree_01）
  mPine03: { model: 'PineTree_03', r: 0.36, h: 7, crown: [2.8, 7.3], sat: 0.8 },
  mOak02: { model: 'OakTree_02', r: 0.5, h: 10, crown: [4.2, 11.9], sat: 0.75 },
  mJac01: { model: 'JacarandaTree_01', r: 0.32, h: 5, crown: [3.6, 6.6], sat: 0.34, tint: [1.42, 1.0, 0.86] },
  mJac02: { model: 'JacarandaTree_02', r: 0.3, h: 4.5, crown: [3.6, 5.7], sat: 0.34, tint: [1.42, 1.0, 0.86] },
  mWillow: { model: 'WillowTree_01', r: 0.4, h: 4.5, crown: [2.9, 5.2], sat: 0.75, sink: 0.12 },
  // 外围树林与后山：高松（PineTree_04）、塔松（PineTree_01 / 02）、团冠阔叶（OakTree_03）、半枯老树（OakTree_05）、树桩
  mPine04: { model: 'PineTree_04', r: 0.3, h: 7, crown: [1.6, 7.1], sat: 0.8 },
  mPine01: { model: 'PineTree_01', r: 0.3, h: 6, crown: [2.3, 6.0], sat: 0.8 },
  mPine02: { model: 'PineTree_02', r: 0.3, h: 6, crown: [1.7, 6.5], sat: 0.8 },
  mOak03: { model: 'OakTree_03', r: 0.55, h: 8, crown: [5.0, 9.4], sat: 0.72 },
  mOak05: { model: 'OakTree_05', r: 0.45, h: 8, crown: [3.6, 9.4], sat: 0.75 },
  mStump1: { model: 'TreeStump_01', r: 0.55, h: 1.2, sat: 0.8, stump: true },
  mStump2: { model: 'TreeStump_02', r: 0.55, h: 1.0, sat: 0.8, stump: true },
  mStump3: { model: 'TreeStump_03', r: 0.5, h: 1.2, sat: 0.8, stump: true },
};

const CHUNK = 128;
function inPoly(x, z, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

export class Vegetation {
  constructor(scene, terrain, cw, footprints, { density = 1, grass = true } = {}) {
    this.scene = scene; this.terrain = terrain; this.cw = cw;
    this.items = {};
    this.density = density;
    this.footprints = footprints;
    this.mats = { tree: treeMaterial(), treeImp: treeMaterial('imp'), treeFade: treeMaterial('fade'), grass: plainMaterial('grass'), leaf: plainMaterial('leaf') };
    if (ASSETS.tex.blossom) {
      this.mats.blossom = treeMaterial('', ASSETS.tex.blossom, [2048, 1024], '-blossom', 0.2);
      this.mats.blossomImp = treeMaterial('imp', ASSETS.tex.blossom, [2048, 1024], '-blossom', 0.2);
      this.blossomDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: ASSETS.tex.blossom, alphaTest: 0.42 });
    }
    this.depthMat = ASSETS.tex.foliage ? new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: ASSETS.tex.foliage, alphaTest: 0.42 }) : null;
    this.geos = {};
    this.noise = createNoise2D(777);
    this.rand = mulberry32(4242);
    this.grassOn = grass;
    this.stairFp = STAIRS.map((s) => { const i = stairInfo(s); return { x0: s.x - s.w / 2 - 2, x1: s.x + s.w / 2 + 2, z0: i.zt - 2, z1: i.zb + 2 }; });
    this.rockGeos = this.loadRocks();
  }

  // 实拍扫描石块：两组共 13 块，各自带贴图与法线
  loadRocks() {
    const out = [];
    for (const key of ['rocks_a', 'rocks_b']) {
      const g = ASSETS.models[key];
      if (!g) continue;
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material;
        m.roughness = 0.95; m.metalness = 0;
        if (m.map) m.map.anisotropy = 4;
        m.color = new THREE.Color(0.9, 0.92, 0.9);
        m.onBeforeCompile = (sh) => applyFade(sh, { cut: true });
        m.customProgramCacheKey = () => 'rock-scan-' + key;
        const geo = o.geometry.clone();
        geo.computeBoundingBox();
        const bb = geo.boundingBox, s = 1 / Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
        geo.scale(s * 2, s * 2, s * 2);      // 归一：最大水平尺寸 2 米（缩放系数 1 时）
        geo.computeBoundingSphere();
        out.push({ geo, mat: m });
      });
    }
    return out;
  }

  // 返回的项可再标 reach（岛名）：核心区以外、但玩家走得到的地方（浮空岛、塔岛）——近处整岛换完整树木、树干有碰撞
  add(type, x, z, s = 1, ry = null, y = null, v = null) {
    const it = { x, z, y: y ?? this.terrain.heightAt(x, z) - 0.05, s, ry: ry ?? this.rand() * Math.PI * 2, v: v ?? Math.floor(this.rand() * 3), tilt: (this.rand() - 0.5) * 0.12 };
    (this.items[type] ||= []).push(it);
    return it;
  }

  // 是否允许在 (x,z) 种植（r 为所需空间）
  free(x, z, r = 1, { onPad = false, inCore = true } = {}) {
    const T = this.terrain;
    if (inCore && !T.inCore(x, z, 2)) return false;
    if (T.inCore(x, z, 0)) {
      if (T.waterAt(x, z) != null) return false;
      const m = T.maskAt(x, z);
      if (m.g > 0.08 || m.b > 0.1 || m.r > 0.25) return false;
      // 崖壁占地与崖脚缓冲带：不种树（留出裸岩与崖脚落石）
      if (T.cliffMaskAt && (T.cliffMaskAt(x, z) > 0 || T.cliffMaskAt(x + r, z) > 1 || T.cliffMaskAt(x - r, z) > 1 || T.cliffMaskAt(x, z + r) > 1 || T.cliffMaskAt(x, z - r) > 1)) return false;
    }
    for (const c of CLEAR) if ((x - c[0]) ** 2 + (z - c[1]) ** 2 < (c[2] + r) ** 2) return false;
    for (const f of this.stairFp) if (x > f.x0 - r && x < f.x1 + r && z > f.z0 - r && z < f.z1 + r) return false;
    if (!onPad) for (const p of PADS) {
      if (p.r != null) { if (Math.hypot(x - p.cx, z - p.cz) < p.r + r) return false; }
      else if (x > p.x0 - 1.5 - r && x < p.x1 + 1.5 + r && z > p.z0 - 1.5 - r && z < p.z1 + 1.5 + r) return false;
    }
    for (const f of this.footprints) {
      const c = Math.cos(f.ry || 0), sn = Math.sin(f.ry || 0), dx = x - f.x, dz = z - f.z;
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      if (Math.abs(lx) < (f.w || 0) / 2 + r + 1.5 && Math.abs(lz) < (f.d || 0) / 2 + r + 1.5) return false;
    }
    for (const p of T.paths) {
      const m2 = p.w / 2 + r + 0.7;
      if (!p.prof.line.near(x, z, m2)) continue;
      if (p.prof.line.nearest(x, z, this._n || (this._n = {})).d < m2) return false;
    }
    return true;
  }

  // 樱花林：在宗门可到达的范围内按噪声成簇种樱（夹几株淡紫花树），每处都检查道路、建筑、坡度、水面与树冠离墙离檐；
  // 用独立的随机序列，不打乱其余植被
  blossomGroves() {
    if (!ASSETS.tex.blossom) return;
    const T = this.terrain, rand = mulberry32(31), n = this.noise;
    const R = TYPES.sakura.crown[0];
    let count = 0;
    const near = (x, z, r) => ['sakura', 'lilac', 'goldTree'].some((t) => (this.items[t] || []).some((it) => Math.hypot(it.x - x, it.z - z) < r));
    // 花林的去处：山门内外、灵池四周、藏经阁院外、上院两侧、云顶殿前；第八轮起问心阶两侧、山门两侧落成深谷，
    // 花林移到谷底（崖脚之外）与西翼、丹殿的院外（[x, z, 半径]）
    const FOCI = [[0, 112, 30], [60, 25, 34], [-58, -70, 22], [-40, -96, 14], [36, -88, 16], [0, -180, 40], [46, -200, 18], [-58, 30, 18], [-34, -40, 10], [40, -40, 10]];
    const inFocus = (x, z) => FOCI.some(([fx, fz, fr]) => Math.hypot(x - fx, z - fz) < fr);
    for (let z = CORE.z0 + 6; z < CORE.z1 - 6; z += 6.5) for (let x = CORE.x0 + 6; x < CORE.x1 - 6; x += 6.5) {
      const px = x + (rand() - 0.5) * 5, pz = z + (rand() - 0.5) * 5;
      const g = n(px * 0.018 - 3.1, pz * 0.018 + 7.7);
      if (!inFocus(px, pz)) continue;
      if (g < 0.05 || count >= (this.density < 0.8 ? 40 : 80)) continue;
      if (this.inAxis(px, pz) && !(Math.abs(px) > 16 && pz < 100 && pz > -60)) continue;
      if (1 - T.normalAt(px, pz).y > 0.3 || T.waterAt(px, pz) != null) continue;
      const s = 0.8 + rand() * 0.3;
      if (!this.free(px, pz, R * s * 0.5) || !this.crownFree('sakura', px, pz, s) || near(px, pz, 6.2)) continue;
      this.add(rand() < 0.86 ? 'sakura' : 'lilac', px, pz, s);
      count++;
    }
    this.blossomCount = count;
  }

  // 中轴视廊：山门、广场、凌云阁、上院、天阶与云顶之间不植高树（只留指定的景观树）
  inAxis(x, z) { return Math.abs(x) < 24 && z < 150 && z > -222; }

  scatter(extra = []) {
    const T = this.terrain, rand = this.rand, n = this.noise, D = this.density;
    // 景观树与场景指定的花木：树冠不得穿进屋顶、墙体（先缩小、再在 1.5 米内挪位，仍不行则不种）
    const soft = (type, x, z, s, ry, y) => {
      if (!TYPES[type]?.crown || !this.cw) { this.add(type, x, z, s, ry, y); return; }
      for (const k of [1, 0.88, 0.76]) if (this.crownFree(type, x, z, s * k)) { this.add(type, x, z, s * k, ry, y); return; }
      if (y == null) for (const [dx, dz] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2], [1.1, 1.1], [-1.1, 1.1], [1.1, -1.1], [-1.1, -1.1], [2.4, 0], [-2.4, 0], [0, 2.4], [0, -2.4]]) {
        if (this.crownFree(type, x + dx, z + dz, s * 0.88)) { this.add(type, x + dx, z + dz, s * 0.88, ry); return; }
      }
      (this.skippedTrees ||= []).push([type, +x.toFixed(1), +z.toFixed(1)]);
    };
    for (const [type, x, z, s, ry] of KEY_TREES) soft(type, x, z, s, ry);
    for (const [type, x, z, s, ry, y] of extra) soft(type, x, z, s, ry, y);
    this.blossomGroves();
    // 竹林
    for (let i = 0; i < 520 * D; i++) {
      const x = -128 + rand() * 50, z = -72 + rand() * 108;
      if (!inPoly(x, z, BAMBOO_ZONE) || !this.free(x, z, 0.9)) continue;
      if (n(x * 0.05, z * 0.05) < -0.45) continue;
      if (T.normalAt(x, z).y < 0.78 || T.waterAt(x, z) != null) continue;      // 深涧的陡壁与溪床不长竹
      this.add('bamboo', x, z, 0.85 + rand() * 0.35);
    }
    // 核心区（可到达的范围）：按噪声成片成林、留出空隙；中轴视廊不植；越靠近院落越稀
    const step = 3.2 / Math.sqrt(D);
    for (let z = CORE.z0 + 3; z < CORE.z1 - 3; z += step) for (let x = CORE.x0 + 3; x < CORE.x1 - 3; x += step) {
      const px = x + (rand() - 0.5) * step, pz = z + (rand() - 0.5) * step;
      if (inPoly(px, pz, BAMBOO_ZONE) || this.inAxis(px, pz)) continue;
      this.forestCell(px, pz, rand, true);
    }
    // 宗门外的近坡（不可到达，仍为完整树木，远景切换为简模）
    const step2 = 4.0 / Math.sqrt(D);
    for (let z = -330; z < 280; z += step2) for (let x = -300; x < 300; x += step2) {
      const px = x + (rand() - 0.5) * step2, pz = z + (rand() - 0.5) * step2;
      if (T.inCore(px, pz, -2)) continue;
      this.forestCell(px, pz, rand, false);
    }
    // 院落与路旁的草丛，草地里成片的野花（白、粉、黄、淡紫，按大尺度噪声聚成一片一片）
    if (this.grassOn) {
      for (let i = 0; i < 13000 * D; i++) {
        const x = CORE.x0 + rand() * (CORE.x1 - CORE.x0), z = CORE.z0 + rand() * (CORE.z1 - CORE.z0);
        const m = T.maskAt(x, z);
        if (m.g > 0.3 || m.b > 0.2 || T.waterAt(x, z) != null) continue;
        if (T.normalAt(x, z).y < 0.72) continue;
        if (T.cliffMaskAt && T.cliffMaskAt(x, z) > 1) continue;
        const near = m.g > 0.02 || m.r > 0.2;
        if (!near && rand() < 0.3) continue;
        const meadow = this.noise(x * 0.03 + 40, z * 0.03 - 17);
        const flower = !near && meadow > 0.15 && rand() < 0.22 + meadow * 0.5;
        this.add(flower ? 'flower' : 'grass', x, z, 0.8 + rand() * 0.7);
      }
    }
    // 落叶：阔叶树下
    for (const t of [...(this.items.pineOld || []), ...(this.items.maple || []), ...(this.items.ginkgo || []), ...(this.items.broad || [])]) {
      if (!T.inCore(t.x, t.z, 4)) continue;
      const a = rand() * 6.28, r = 1 + rand() * 3.2;
      const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
      if (T.waterAt(x, z) != null) continue;
      this.add('leaves', x, z, 0.8 + rand() * 0.6, null, this.groundY(x, z) + 0.01);
    }
  }

  // 林地密度：大尺度噪声决定成片林地与空隙；靠近院落更稀（宗门内以景观树为主）；陡崖不成林
  forestDensity(px, pz, slope) {
    const n = this.noise;
    const patch = n(px * 0.011, pz * 0.011) * 0.7 + n(px * 0.035 + 5, pz * 0.035) * 0.3;
    const civ = Math.exp(-((px / 105) ** 2 + ((pz + 30) / 190) ** 2));
    const core = this.terrain.inCore(px, pz, -2);
    let dens = smoothstep(0.02, 0.2, patch) * (core ? 0.9 - civ * 0.62 : 1);
    if (slope > 0.62) dens = 0;
    // 深谷：谷底只留稀疏的树丛（崖壁与谷中云气为主）
    if (core && this.terrain.inValley?.(px, pz)) dens *= 0.22;
    return dens;
  }
  // 把林地密度烘焙为地表遮罩（2400 米见方，6 米一格），让林下地表与树木分布一致
  bakeForestMask(mat) {
    if (!mat?.userData?.forest) return;
    const N = 400, x0 = -1200, z0 = -1240, st = 6, data = new Uint8Array(N * N * 4), T = this.terrain;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = x0 + (i + 0.5) * st, z = z0 + (j + 0.5) * st;
      const slope = 1 - T.normalAt(x, z).y;
      let d = this.forestDensity(x, z, slope);
      if (T.inCore(x, z, 0) && (T.waterAt(x, z) != null)) d = 0;
      const k = (j * N + i) * 4;
      data[k] = Math.round(d * 255); data[k + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    mat.userData.forest.value = tex;
  }
  // 一个候选点：林地（成片）/ 林缘灌木 / 岩坡石块 / 崖上孤松
  forestCell(px, pz, rand, core) {
    const T = this.terrain;
    const nrm = T.normalAt(px, pz), slope = 1 - nrm.y, y = T.heightAt(px, pz);
    const dens = this.forestDensity(px, pz, slope);
    const r0 = rand();
    if (r0 < dens * (core ? 0.62 : 0.85)) {
      if (!this.free(px, pz, 1.3, { inCore: core })) return;
      const k = rand(), low = y < 8 || T.waterAt(px, pz) != null;
      let kind;
      if (slope > 0.35) kind = k < 0.55 ? 'pine' : 'pineOld';
      else if (low) kind = k < 0.35 ? 'broad' : k < 0.5 ? 'willow' : k < 0.62 ? 'maple' : 'pine';
      else kind = k < 0.5 ? 'pine' : k < 0.62 ? 'pineOld' : k < 0.78 ? 'broad' : k < 0.86 ? 'cypress' : k < 0.93 ? 'maple' : k < 0.97 ? 'locust' : 'ginkgo';
      if (kind === 'willow' && !low) kind = 'broad';
      let s = (kind === 'pineOld' ? 0.85 : 0.75) + rand() * 0.55;
      const mk = this.modelPick(px, pz, kind, core);
      if (mk && this.crownFree(mk[0], px, pz, mk[1])) [kind, s] = mk;
      this.add(kind, px, pz, s);
    } else if (r0 < dens * (core ? 0.62 : 0.85) + 0.05 + Math.min(slope, 0.6) * 0.12) {
      if (!this.free(px, pz, 0.6, { inCore: core })) return;
      if (slope > 0.62) {
        // 崖面：只在凸出的岩台（法线较平的局部）挂一株松
        if (rand() < 0.18 && T.normalAt(px + 1.2, pz).y > 0.55) this.add(rand() < 0.5 ? 'pineOld' : 'pine', px, pz, 0.6 + rand() * 0.3);
        return;
      }
      if (slope > 0.28 || rand() < 0.22) {
        this.add('rock', px, pz, (0.5 + rand() * 0.9 + slope * 1.2) * (core ? 1 : 1.6));
        if (slope > 0.45) this.items.rock.pop();       // 过陡的崖面上不放大石（会一侧悬空）；仍照常取随机数，其余植被不变
      }
      else if (core) this.add(rand() < 0.3 ? 'fern' : rand() < 0.15 ? 'shrubDry' : 'shrub', px, pz, 0.8 + rand() * 0.6);
    }
  }

  // 素材树按噪声成簇混入林地：后山以云片松、高松为主，夹几株半枯老树；宗门内的坡地与宗门外近坡的林缘，
  // 在簇内把松换成素材松、把阔叶换成团冠阔叶。主殿、双龙、建筑入口与道路的视线由 free()、CLEAR 与中轴视廊保证。
  // 用位置哈希而非 rand()：不打乱其余植被的随机序列（宗门原有的林相与视线保持不变）
  modelPick(x, z, kind, core) {
    if (!ASSETS.models.trees) return null;
    let hs = 0;
    const rand = () => (Math.abs(Math.sin(x * 12.9898 + z * 78.233 + ++hs * 37.719)) * 43758.5453) % 1;
    const cl = this.noise(x * 0.018 + 40, z * 0.018 - 13);
    const conifer = kind === 'pine' || kind === 'pineOld' || kind === 'cypress';
    const k = rand();
    if (core && x > 56 && z < -96) {                                  // 后山
      if (cl < -0.35) return null;
      if (conifer) return k < 0.5 ? ['mPine03', 1.15 + rand() * 0.45] : k < 0.92 ? ['mPine04', 1.25 + rand() * 0.45] : ['mOak05', 0.9 + rand() * 0.3];
      return k < 0.6 ? ['mOak03', 0.65 + rand() * 0.3] : null;
    }
    if (core) {                                                       // 宗门内的坡地
      if (cl < 0.4) return null;
      if (conifer) return k < 0.55 ? ['mPine03', 1.1 + rand() * 0.4] : ['mPine04', 1.2 + rand() * 0.4];
      return k < 0.5 ? ['mOak03', 0.6 + rand() * 0.3] : null;
    }
    // 宗门外的近坡：只在核心区外 32 米以内（流畅画质不换，保持移动端的三角形数）
    const dEdge = Math.max(CORE.x0 - x, x - CORE.x1, CORE.z0 - z, z - CORE.z1);
    // （第七轮：外围山坡不再成片种樱，花树集中在入口、灵池与重要庭院）
    if (dEdge > 32 || cl < 0.3 || this.density < 0.8) return null;
    if (conifer) return k < 0.35 ? ['mPine01', 1.25 + rand() * 0.45] : k < 0.7 ? ['mPine02', 1.25 + rand() * 0.45] : ['mPine04', 1.3 + rand() * 0.45];
    return k < 0.7 ? ['mOak03', 0.7 + rand() * 0.35] : null;
  }

  // 树冠（冠幅 × 0.85、冠高三成以上）不碰墙体、屋顶等构筑物
  crownFree(type, x, z, s) {
    const def = TYPES[type];
    if (!def?.crown) return true;
    const R = def.crown[0] * s * 0.85, y = this.terrain.heightAt(x, z), y0 = y + def.crown[1] * s * 0.3, y1 = y + def.crown[1] * s;
    let ok = true;
    this.cw.query(x - R, z - R, x + R, z + R, (c) => {
      if (!ok || c.type !== 0 || !c.cam || c.y1 < y0 || c.y0 > y1) return;
      const dx = x - c.x, dz = z - c.z, lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
      if (Math.hypot(lx - Math.max(-c.hx, Math.min(c.hx, lx)), lz - Math.max(-c.hz, Math.min(c.hz, lz))) < R) ok = false;
    });
    return ok;
  }

  groundY(x, z) { return Math.max(this.terrain.heightAt(x, z), this.cw.ground(x, z, this.terrain.heightAt(x, z) + 1.2, 1.5)); }

  // 远近两级细节：块中心距角色 lodR 以内的块显示完整树木，同时着色器把这些块里的贴片收起（两边用同一焦点、同一时刻切换）；
  // 草、灌木、蕨、落叶在 lodR2 的四分之三以外由着色器收起
  update(focus, force = false) {
    const now = performance.now();
    if (!force && now - (this._lodT || 0) < 400) return;
    this._lodT = now;
    const R = this.lodR || 88;
    VEGU.uFocus.value.copy(focus);
    VEGU.uLodR.value = R;
    VEGU.uFadeR.value = (this.lodR2 || 200) * 0.75;
    for (const l of this.lods) {
      const show = Math.hypot(l.cx - focus.x, l.cz - focus.z) < R;
      for (const h of l.his) h.visible = show;
    }
    for (const l of this.isleLods || []) {
      const near = Math.hypot(l.cx - focus.x, l.cz - focus.z) < l.r + R * 0.5;
      for (const h of l.his) h.visible = near;
      l.lo.visible = !near;
    }
    // 素材树：lodR 的四分之三以内用 LOD0，其余用 LOD1
    const R0 = R * 0.75;
    for (const md of this.models || []) {
      let a = 0, b = 0;
      for (const it of md.list) {
        if (Math.hypot(it.x - focus.x, it.z - focus.z) < R0) md.im0.setMatrixAt(a++, it.m4); else md.im1.setMatrixAt(b++, it.m4);
      }
      md.im0.count = a; md.im1.count = b;
      md.im0.visible = a > 0; md.im1.visible = b > 0;
      md.im0.instanceMatrix.needsUpdate = md.im1.instanceMatrix.needsUpdate = true;
    }
  }

  // 素材树：每个树种按 128 米分块，每块两个实例网格（LOD0 / LOD1），实例在两者之间按距离分配（分块便于镜头与阴影各自剔除）；树干碰撞同其他树
  buildModels(type, list, def, groups) {
    const src = ASSETS.models.trees?.scene;
    const n0 = src?.getObjectByName(def.model + '_0'), n1 = src?.getObjectByName(def.model + '_1');
    if (!n0) return 0;
    this.models ||= [];
    const mat = modelTreeMaterial(n0.material, def.sat ?? 0.8, def.tint);
    const chunks = new Map();
    for (const it of list) {
      const j = (Math.abs(Math.sin(it.x * 12.9898 + it.z * 78.233)) * 43758.5453) % 1;
      Q.setFromEuler(E.set(it.tilt * 0.4, it.ry, it.tilt * 0.3, 'YXZ'));
      it.m4 = new THREE.Matrix4().compose(V.set(it.x, it.y - (def.sink ?? 0.06) * it.s, it.z), Q, S.set(it.s, it.s * (0.94 + j * 0.12), it.s));
      const key = `${Math.floor(it.x / CHUNK)},${Math.floor(it.z / CHUNK)}`;     // 128 米一块（LOD 逐株切换，分块只为视锥剔除）
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push(it);
    }
    for (const arr of chunks.values()) {
      const im0 = new THREE.InstancedMesh(n0.geometry, mat, arr.length), im1 = new THREE.InstancedMesh((n1 || n0).geometry, mat, arr.length);
      arr.forEach((it, i) => { im0.setMatrixAt(i, it.m4); im1.setMatrixAt(i, it.m4); });
      for (const im of [im0, im1]) {
        im.castShadow = this.treeShadows !== false;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        im.name = 'veg-model-' + type;
        groups.add(im);
      }
      im0.count = 0;
      this.models.push({ type, list: arr, im0, im1 });
    }
    for (const it of list) {
      if (!this.terrain.inCore(it.x, it.z)) continue;
      this.cw.addCyl({ x: it.x, z: it.z, y0: it.y - 0.5, y1: it.y + def.h * it.s, r: def.r * it.s, walk: false });
    }
    return list.length;
  }

  build() {
    this.lods = [];
    const groups = new THREE.Group();
    groups.name = 'vegetation';
    const col = new THREE.Color();
    let count = 0;
    for (const [type, list] of Object.entries(this.items)) {
      const def = TYPES[type];
      if (!def || !list.length) continue;
      if (def.rock) { count += this.buildRocks(list, groups); continue; }
      if (def.model) { count += this.buildModels(type, list, def, groups); continue; }
      if (def.mat === 'blossom' && !this.mats.blossom) continue;
      let vars = (this.geos[type] ||= def.variants());
      if (this.maxVariants) vars = vars.slice(0, this.maxVariants);
      const imp = def.blossomImp ? (this.geos[type + '-imp'] ||= blossomImpGeo(type)) : IMP[type] ? (this.geos[type + '-imp'] ||= impGeo(type)) : null;
      // 小型植物（无贴片的草、灌木、蕨、落叶）：每个变体一个全局实例网格，远处由着色器收起
      const small = !imp;
      const mat = def.mat ? this.mats[def.mat] : small ? this.mats.treeFade : this.mats.tree;
      const impMat = def.blossomImp ? this.mats.blossomImp : this.mats.treeImp;
      const make = (geo, arr, m = mat) => {
        const im = new THREE.InstancedMesh(geo, m, arr.length);
        arr.forEach((it, i) => {
          const tilt = type === 'pine' || type === 'pineOld' ? it.tilt : it.tilt * 0.3;
          Q.setFromEuler(E.set(tilt, it.ry, tilt * 0.7, 'YXZ'));
          // 高度与色调的随机量取自位置，近景完整树与远景贴片一致，切换时不跳色
          const j = (Math.abs(Math.sin(it.x * 12.9898 + it.z * 78.233)) * 43758.5453) % 1, j2 = (j * 7.31) % 1;
          im.setMatrixAt(i, M4.compose(V.set(it.x, it.y, it.z), Q, S.set(it.s, it.s * (0.9 + j2 * 0.18), it.s)));
          col.setRGB(0.88 + j * 0.2, 0.9 + j * 0.16, 0.86 + j * 0.16);
          im.setColorAt(i, col);
        });
        im.castShadow = this.treeShadows !== false && def.mat !== 'grass' && def.mat !== 'leaf';
        if (!def.mat && this.depthMat) im.customDepthMaterial = this.depthMat;
        if (def.mat === 'blossom' && this.blossomDepth) im.customDepthMaterial = this.blossomDepth;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        im.name = 'veg-' + type;
        groups.add(im);
        count += arr.length;
        return im;
      };
      if (small) {
        const byVar = vars.map(() => []);
        list.forEach((it, i) => byVar[(it.v ?? i) % vars.length].push(it));
        byVar.forEach((arr, v) => { if (arr.length) make(vars[v], arr); });
      } else {
        // 可到达的核心区：完整树木按“块 × 变体”分组，块中心在 lodR 以内时显示；
        // 贴片：每个树种一个全局网格（含核心区以外不可到达的近坡），aHasHi 标记在核心区有完整模型的树，由着色器在近处块内收起
        const isle = new Map(), rest = [];
        for (const it of list) { if (it.reach) { if (!isle.has(it.reach)) isle.set(it.reach, []); isle.get(it.reach).push(it); } else rest.push(it); }
        const buckets = new Map(), hasHi = new Float32Array(rest.length), chunks = new Map();
        rest.forEach((it, i) => {
          if (!this.terrain.inCore(it.x, it.z)) return;
          hasHi[i] = 1;
          const v = (it.v ?? i) % vars.length;
          const key = `${Math.floor(it.x / CHUNK)},${Math.floor(it.z / CHUNK)},${v}`;
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(it);
        });
        for (const [key, arr] of buckets) {
          const [ci, cj, v] = key.split(',').map(Number);
          const hi = make(vars[v], arr);
          hi.visible = false;
          const ck = ci + ',' + cj;
          if (!chunks.has(ck)) chunks.set(ck, { cx: (ci + 0.5) * CHUNK, cz: (cj + 0.5) * CHUNK, his: [] });
          chunks.get(ck).his.push(hi);
        }
        this.lods.push(...chunks.values());
        if (rest.length) {
          const geo = imp.clone();
          geo.setAttribute('aHasHi', new THREE.InstancedBufferAttribute(hasHi, 1));
          const im2 = make(geo, rest, impMat);
          im2.castShadow = false;
          im2.name = 'veg-imp-' + type;
        }
        // 岛上（reach，第十三轮起走得上去的浮空岛、塔岛）：每座岛的树整组切换——角色到了岛上或岛边（离最外一株不到 lodR 的一半）
        // 整岛换完整树木，否则整岛用贴片；不按 128 米的块判定（大岛跨好几块，块心离得远的半座岛会留着贴片）
        for (const [key, arr] of isle) {
          let cx = 0, cz = 0, r = 0;
          for (const it of arr) { cx += it.x / arr.length; cz += it.z / arr.length; }
          for (const it of arr) r = Math.max(r, Math.hypot(it.x - cx, it.z - cz));
          const his = [];
          vars.forEach((g, v) => { const sub = arr.filter((it, i) => (it.v ?? i) % vars.length === v); if (sub.length) { const hi = make(g, sub); hi.visible = false; his.push(hi); } });
          const geo = imp.clone();
          geo.setAttribute('aHasHi', new THREE.InstancedBufferAttribute(new Float32Array(arr.length), 1));
          const lo = make(geo, arr, impMat);
          lo.castShadow = false;
          lo.name = `veg-imp-${type}-${key}`;
          (this.isleLods ||= []).push({ key, cx, cz, r, his, lo });
        }
      }
      // 碰撞（只在可到达的核心区与岛上）
      if (def.r > 0) for (const it of list) {
        if (!it.reach && !this.terrain.inCore(it.x, it.z)) continue;
        this.cw.addCyl({ x: it.x, z: it.z, y0: it.y - 0.5, y1: it.y + def.h * it.s, r: def.r * Math.min(1.3, it.s), walk: false });
      }
    }
    this.scene.add(groups);
    this.group = groups;
    this.count = count;
    this.buildCanopy();
    return this;
  }

  // 实拍石块：按变体实例化；大石可站立
  buildRocks(list, groups) {
    const G = this.rockGeos;
    if (!G.length) return 0;
    const buckets = G.map(() => []);
    list.forEach((it, i) => buckets[(it.v + i * 7) % G.length].push(it));
    buckets.forEach((arr, k) => {
      if (!arr.length) return;
      const { geo, mat } = G[k];
      const im = new THREE.InstancedMesh(geo, mat, arr.length);
      arr.forEach((it, i) => {
        // 石块顺着坡面放（上方向对齐地面法线），陡坡上不会一侧悬空；坡越陡埋得越深
        const n = this.terrain.normalAt(it.x, it.z);
        Q.setFromEuler(E.set((i % 3 - 1) * 0.08, it.ry, (i % 5 - 2) * 0.05, 'YXZ'));
        Q.premultiply(_QS.setFromUnitVectors(UP, n.lerp(UP, 0.15).normalize()));
        const sink = 0.2 + (1 - n.y) * 0.5;
        im.setMatrixAt(i, M4.compose(V.set(it.x, it.y - sink * it.s, it.z), Q, S.set(it.s, it.s * (0.75 + ((i * 37) % 10) / 22), it.s)));
      });
      im.castShadow = this.treeShadows !== false;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      im.name = 'veg-rock';
      groups.add(im);
    });
    for (const it of list) {
      if (!this.terrain.inCore(it.x, it.z)) continue;
      this.cw.addCyl({ x: it.x, z: it.z, y0: it.y - 0.5, y1: it.y + 1.0 * it.s, r: 0.85 * it.s, walk: it.s < 0.9 });
    }
    return list.length;
  }

  // 树冠高度网格（2 米一格）：镜头把树冠当作“地面”避让
  buildCanopy() {
    const cs = 2, nx = Math.ceil((CORE.x1 - CORE.x0) / cs) + 1, nz = Math.ceil((CORE.z1 - CORE.z0) / cs) + 1;
    const G = new Float32Array(nx * nz).fill(-1e9);
    for (const [type, def] of Object.entries(TYPES)) {
      if (!def.crown) continue;
      const [r0, h0] = def.crown;
      for (const it of this.items[type] || []) {
        const r = r0 * it.s, top = it.y + h0 * it.s;
        const i0 = Math.max(0, Math.floor((it.x - r - CORE.x0) / cs)), i1 = Math.min(nx - 1, Math.ceil((it.x + r - CORE.x0) / cs));
        const j0 = Math.max(0, Math.floor((it.z - r - CORE.z0) / cs)), j1 = Math.min(nz - 1, Math.ceil((it.z + r - CORE.z0) / cs));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const dx = CORE.x0 + i * cs - it.x, dz = CORE.z0 + j * cs - it.z;
          if (dx * dx + dz * dz > r * r) continue;
          const k = j * nx + i;
          if (top > G[k]) G[k] = top;
        }
      }
    }
    this.canopy = { G, nx, nz, cs };
  }
  canopyAt(x, z) {
    const c = this.canopy;
    if (!c) return -1e9;
    const i = Math.round((x - CORE.x0) / c.cs), j = Math.round((z - CORE.z0) / c.cs);
    if (i < 0 || j < 0 || i >= c.nx || j >= c.nz) return -1e9;
    return c.G[j * c.nx + i];
  }

  // 远坡贴片林：宗门之外 300~1100 米的成片林地（与地表林地色块对应），两种贴片树，各一次绘制
  // 远处的一丛贴片树（浮空仙岛上）：list 为 [x, y, z, 缩放, 随机数]，坐标相对 parent；kind 为 pine / broad / sakura
  treeCluster(parent, list, kind = 'pine') {
    if (!list.length) return null;
    const sak = kind === 'sakura' && this.mats.blossomImp;
    const geo = sak ? blossomImpGeo('sakura') : impGeo(kind === 'broad' ? 'broad' : 'pine');
    const im = new THREE.InstancedMesh(geo, sak ? this.mats.blossomImp : this.mats.tree, list.length);
    const col = new THREE.Color();
    list.forEach(([x, y, z, s, r], i) => {
      im.setMatrixAt(i, M4.compose(V.set(x, y, z), Q.setFromAxisAngle(UP, r * 6.28), S.set(s, s * (0.85 + r * 0.4), s)));
      im.setColorAt(i, col.setRGB(0.8 + r * 0.2, 0.84 + r * 0.16, 0.8 + r * 0.14));
    });
    im.computeBoundingSphere();
    im.name = 'veg-cluster-' + kind;
    parent.add(im);
    return im;
  }

  buildFar(count = 2500) {
    const T = this.terrain, rand = mulberry32(9), lists = { conifer: [], broad: [] };
    for (let i = 0; i < count * 6 && lists.conifer.length + lists.broad.length < count; i++) {
      const a = rand() * Math.PI * 2, r = 260 + Math.pow(rand(), 0.8) * 860;
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 40;
      if (Math.abs(x) < 300 && z > -330 && z < 280) continue;
      const nrm = T.normalAt(x, z), y = T.heightAt(x, z);
      if (nrm.y < 0.62 || y < -12) continue;
      if (this.forestDensity(x, z, 1 - nrm.y) < 0.15 + rand() * 0.7) continue;
      (rand() < 0.65 ? lists.conifer : lists.broad).push([x, y - 0.4, z, 0.75 + rand() * 0.6, rand()]);
    }
    // 主峰群的崖上松：生在岩台与峰顶（远看是崖面上一点点墨绿），不上陡壁
    const cliff = Math.round(count * 0.35);
    for (let i = 0, n = 0; i < cliff * 10 && n < cliff && T.massif; i++) {
      const a = rand() * Math.PI * 2, r = 380 + rand() * 900;
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 40;
      if (T.massif(x, z) < 70) continue;
      if (T.normalAt(x, z).y < 0.45) continue;
      lists.conifer.push([x, T.heightAt(x, z) - 0.6, z, 0.9 + rand() * 0.7, rand()]);
      n++;
    }
    const col = new THREE.Color();
    this.far = [];
    for (const [kind, list] of Object.entries(lists)) {
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(farTreeGeo(kind), this.mats.tree, list.length);
      list.forEach(([x, y, z, s, r], i) => {
        im.setMatrixAt(i, M4.compose(V.set(x, y, z), Q.setFromAxisAngle(UP, r * 6.28), S.set(s, s * (0.85 + r * 0.4), s)));
        const j = ((i * 7919) % 97) / 97;
        im.setColorAt(i, col.setRGB(0.78 + j * 0.22, 0.82 + j * 0.2, 0.8 + j * 0.16));
      });
      im.castShadow = false;
      im.receiveShadow = false;
      im.computeBoundingSphere();
      im.name = 'veg-far-' + kind;
      this.scene.add(im);
      this.far.push(im);
    }
  }
}
