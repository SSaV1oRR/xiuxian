// 通天塔外观（第十三轮）：百层八角楼阁式塔。尺寸全部取自 towerSpec.js。
// 本地原点：塔心、台基底面（岛面）；+Z 为正面（南，朝宗门）。八角形的四正面朝东西南北（第 2 面朝南）。
// 自下而上：三层汉白玉石台基与正面踏道 → 一层接引大厅（柱列、隔扇墙身、正门与匾、正门抱厦、斗拱、大檐）→
// 二至一百层重复的楼层模块（墙身、窗、角柱、腰檐、封檐板；每十层一道大檐、彩画垫板与平座栏杆）→ 顶层八角攒尖 → 塔刹（须弥座、
// 仰莲、七重相轮、宝盖、宝珠）。用色：青灰屋瓦、深色木构、汉白玉台基，金色只用在塔刹、宝顶、檐角与匾额。
// 面数：楼层模块很省（墙身、檐裙、封檐板每层几百面），近处才看得清的斗拱、栏杆望柱交给建筑细部的显示距离。
import * as THREE from 'three';
import { C } from './builder.js';
import { dougong, doorLeaves, plaqueMesh, pyramidRoofGeo, roofAssembly, hangLantern } from './arch.js';
import { terrace, frontStairs } from './halls.js';
import { columnBase } from './stone9.js';
import { TOWER, PODIUM_H, floorBase, floorHeight, floorWidth, BODY_TOP } from '../towerSpec.js';

const P = TOWER, TAU = Math.PI * 2, K8 = Math.cos(Math.PI / 8);
const WOOD_DK = 0x3b2a22, WOOD = 0x5a3a2c;
// 八角形：第 k 个顶点在方位 k·45° − 22.5°（对边宽 w 的外接圆半径 w / 2 / cos 22.5°）
const vtx = (a, k) => { const t = (k * Math.PI) / 4 - Math.PI / 8, R = a / K8; return [R * Math.cos(t), R * Math.sin(t)]; };

// 一圈直墙（八面竖直的四边形；uv：u 沿墙面以米计，v 自下而上 0–1）；skip(k) 为 true 的面不画
function drumGeo(a, y0, h, { skip = null, out = 0 } = {}) {
  const pos = [], uv = [], nrm = [];
  for (let k = 0; k < 8; k++) {
    if (skip && skip(k)) continue;
    const [x0, z0] = vtx(a + out, k), [x1, z1] = vtx(a + out, k + 1), L = Math.hypot(x1 - x0, z1 - z0);
    const na = (k * Math.PI) / 4, nx = Math.cos(na), nz = Math.sin(na);
    const q = [[x0, y0, z0, 0, 0], [x1, y0, z1, L, 0], [x1, y0 + h, z1, L, 1], [x0, y0 + h, z0, 0, 1]];
    for (const i of [0, 2, 1, 0, 3, 2]) { const [x, y, z, u, v] = q[i]; pos.push(x, y, z); uv.push(u, v); nrm.push(nx, 0, nz); }
  }
  return geo(pos, uv, nrm);
}
function geo(pos, uv, nrm) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (nrm) g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); else g.computeVertexNormals();
  return g;
}

// 八角檐裙：外沿（对边宽一半 aOut、高 yOut）到内沿（aIn、yIn）的一圈瓦面，向外下凹，檐角起翘 lift；
// uv：u 沿檐口以米计，v 自檐口沿坡以米计（与素材瓦的檐口一行对齐）。nu × nv 为每面细分
const skirtCache = new Map();
function skirtGeo(aOut, yOut, aIn, yIn, lift, { nu = 4, nv = 2, p = 1.6 } = {}) {
  const key = [aOut, yOut, aIn, yIn, lift, nu, nv].map((v) => v.toFixed(2)).join('|');
  if (skirtCache.has(key)) return skirtCache.get(key);
  const pos = [], uv = [], idx = [];
  const sl = Math.hypot(aOut - aIn, yIn - yOut);
  for (let k = 0; k < 8; k++) {
    const [ox0, oz0] = vtx(aOut, k), [ox1, oz1] = vtx(aOut, k + 1), [ix0, iz0] = vtx(aIn, k), [ix1, iz1] = vtx(aIn, k + 1);
    const L = Math.hypot(ox1 - ox0, oz1 - oz0), base = pos.length / 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const s = i / nu, t = j / nv;
      const ox = ox0 + (ox1 - ox0) * s, oz = oz0 + (oz1 - oz0) * s, ix = ix0 + (ix1 - ix0) * s, iz = iz0 + (iz1 - iz0) * s;
      const cf = Math.pow(Math.max(0, 1 - Math.min(s, 1 - s) / 0.3), 2) * Math.pow(1 - t, 2);
      const y = yOut + (yIn - yOut) * Math.pow(t, p) + lift * cf;
      pos.push(ox + (ix - ox) * t, y, oz + (iz - oz) * t);
      uv.push(s * L, t * sl);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  skirtCache.set(key, g);
  return g;
}
// 封檐板：沿檐口一圈（随檐角起翘），h 板高
function fasciaGeo(aOut, yOut, lift, h, nu = 4) {
  const pos = [], uv = [], nrm = [];
  let u = 0;
  for (let k = 0; k < 8; k++) {
    const [x0, z0] = vtx(aOut + 0.04, k), [x1, z1] = vtx(aOut + 0.04, k + 1), L = Math.hypot(x1 - x0, z1 - z0), na = (k * Math.PI) / 4;
    for (let i = 0; i < nu; i++) {
      const s0 = i / nu, s1 = (i + 1) / nu, cf = (s) => Math.pow(Math.max(0, 1 - Math.min(s, 1 - s) / 0.3), 2);
      const xa = x0 + (x1 - x0) * s0, za = z0 + (z1 - z0) * s0, xb = x0 + (x1 - x0) * s1, zb = z0 + (z1 - z0) * s1;
      const ya = yOut + lift * cf(s0), yb = yOut + lift * cf(s1);
      const q = [[xa, ya - h, za, u + s0 * L, 0], [xb, yb - h, zb, u + s1 * L, 0], [xb, yb + 0.03, zb, u + s1 * L, 1], [xa, ya + 0.03, za, u + s0 * L, 1]];
      for (const j of [0, 2, 1, 0, 3, 2]) { const [x, y, z, uu, vv] = q[j]; pos.push(x, y, z); uv.push(uu, vv); nrm.push(Math.cos(na), 0, Math.sin(na)); }
    }
    u += L;
  }
  return geo(pos, uv, nrm);
}
// 平座台面（八角环）：内 aIn 到外 aOut，台面高 y，厚 th
function ringGeo(aIn, aOut, y, th) {
  const pos = [], uv = [];
  for (let k = 0; k < 8; k++) {
    const [ix0, iz0] = vtx(aIn, k), [ix1, iz1] = vtx(aIn, k + 1), [ox0, oz0] = vtx(aOut, k), [ox1, oz1] = vtx(aOut, k + 1);
    const L = Math.hypot(ox1 - ox0, oz1 - oz0);
    const top = [[ix0, y, iz0, 0, 0], [ix1, y, iz1, L, 0], [ox1, y, oz1, L, 1], [ox0, y, oz0, 0, 1]];
    for (const j of [0, 2, 1, 0, 3, 2]) { const [x, yy, z, u, v] = top[j]; pos.push(x, yy, z); uv.push(u, v); }
    const side = [[ox0, y - th, oz0, 0, 0], [ox1, y - th, oz1, L, 0], [ox1, y, oz1, L, 1], [ox0, y, oz0, 0, 1]];
    for (const j of [0, 2, 1, 0, 3, 2]) { const [x, yy, z, u, v] = side[j]; pos.push(x, yy, z); uv.push(u, v); }
  }
  return geo(pos, uv, null);
}

// 一道檐：瓦面（素材瓦）、檐下椽子（背面可见）、封檐板、角脊端鎏金
function eave(b, aOut, yOut, aIn, yIn, lift, { big = false, fh = 0.4 } = {}) {
  const nu = big ? 6 : 4, nv = big ? 3 : 2;
  b.add(skirtGeo(aOut, yOut, aIn, yIn, lift, { nu, nv }), C.tileDark, 'trTile', { col: false });
  b.add(skirtGeo(aOut, yOut - 0.1, aIn, yIn - 0.1, lift, { nu, nv }), C.woodRed, 'trRafter', { col: false });
  b.add(fasciaGeo(aOut, yOut, lift, fh, nu), C.woodLight, 'trFascia', { col: false });
  if (big) for (let k = 0; k < 8; k++) {
    const [x, z] = vtx(aOut + 0.25, k);
    b.add(new THREE.ConeGeometry(0.12, 0.7, 5), C.gold, 'gold', { x, y: yOut + lift + 0.25, z, col: false });
  }
}

// 平座栏杆：沿八角环外沿一圈素材栏板与扶手，角上望柱带鎏金柱头（细部）
function balcony(b, aIn, aOut, y) {
  b.add(ringGeo(aIn, aOut, y, 0.32), WOOD_DK, 'trBeam', { col: false });
  for (let k = 0; k < 8; k++) {
    const [x0, z0] = vtx(aOut - 0.12, k), [x1, z1] = vtx(aOut - 0.12, k + 1);
    const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    b.panel(L, 0.82, C.red, cx, y + 0.5, cz, { mat: 'trRail', ry, uvScale: [L, 1] });
    b.box(L + 0.1, 0.09, 0.12, WOOD_DK, cx, y + 0.95, cz, { ry, col: false, mat: 'wood' });
    b.slab(0.16, 1.1, 0.16, WOOD_DK, x0, y, z0, { col: false, mat: 'wood', detail: true });
    b.sphere(0.09, C.gold, x0, y + 1.18, z0, { mat: 'gold', seg: 6, seg2: 4, detail: true });
  }
}

// 塔刹：须弥座、仰莲、七重相轮、宝盖、宝珠与刹尖（金色只在这里成片出现）
function crown(b, y, h) {
  const G = C.gold;
  b.cyl(2.6, 3.0, 1.6, C.marbleShade, 0, y + 0.8, 0, { seg: 8, mat: 'stone', col: false });
  b.cyl(2.2, 2.6, 0.9, C.marble, 0, y + 2.05, 0, { seg: 8, mat: 'stoneSmooth', col: false });
  b.cyl(2.5, 1.6, 1.2, G, 0, y + 3.1, 0, { seg: 16, mat: 'gold', col: false });                         // 仰莲
  b.cyl(0.42, 0.55, h * 0.72, G, 0, y + 3.7 + h * 0.36, 0, { seg: 10, mat: 'gold', col: false });        // 刹杆
  const r0 = y + 5.0, rs = (h * 0.5) / 7;
  for (let i = 0; i < 7; i++) b.cyl(1.9 - i * 0.18, 1.9 - i * 0.18, 0.42, G, 0, r0 + i * rs, 0, { seg: 16, mat: 'gold', col: false });   // 相轮
  b.add(new THREE.ConeGeometry(2.4, 1.6, 8), G, 'gold', { y: r0 + 7 * rs + 0.6, col: false });           // 宝盖
  b.sphere(1.0, G, 0, r0 + 7 * rs + 2.4, 0, { mat: 'gold', seg: 14, seg2: 10 });                          // 宝珠
  b.add(new THREE.ConeGeometry(0.35, h - (r0 - y + 7 * rs + 3.4), 8), G, 'gold', { y: (r0 + 7 * rs + 3.4 + y + h) / 2, col: false });
}

// 整座塔。返回 { door（本地：正门外一步，可交互处）, plaza（台基前沿踏道下的广场中线 z）, lanterns, top }
export function towerOfHeaven(b) {
  const out = { lanterns: [] };
  // ---------- 台基：三层汉白玉石台，正面各出一道踏道 ----------
  let y = 0;
  const sw = 12;
  P.podium.forEach((t, i) => {
    const hw = t.w / 2;
    terrace(b, [-hw, hw, -hw, hw], y, t.h, { gaps: [[-sw / 2 - i * 0.6, sw / 2 + i * 0.6]], medal: 7 });
    frontStairs(b, 0, hw, y, t.h, sw + i * 1.2 - 1.2, { center: i === 0 });
    y += t.h;
  });
  out.stairFoot = P.podium[0].w / 2 + Math.round(P.podium[0].h / 0.17) * 0.32;
  // ---------- 一层：接引大厅 ----------
  const a1 = P.f1.w / 2, y1 = PODIUM_H, h1 = P.f1.h, D = P.door;
  // 墙身：南面开正门（门洞两侧与门上各一段）
  b.add(drumGeo(a1 - 0.6, y1, h1 - 1.4, { skip: (k) => k === 2 }), WOOD, 'trDoors', { col: false });
  {
    const L = 2 * a1 * Math.tan(Math.PI / 8) - 0.5, z = a1 - 0.6;
    const side = (L - D.w) / 2;
    for (const s of [-1, 1]) b.panel(side, h1 - 1.4, WOOD, s * (D.w / 2 + side / 2), y1 + (h1 - 1.4) / 2, z, { mat: 'trDoors', uvScale: [side, 1] });
    b.panel(D.w, h1 - 1.4 - D.h, WOOD, 0, y1 + D.h + (h1 - 1.4 - D.h) / 2, z, { mat: 'trHead', uvScale: [D.w, 1] });
    // 正门：两扇关着的大门（门内即接引大厅，按 E 入塔）、门框、门槛、匾
    doorLeaves(b, 0, y1, z + 0.05, D.w, D.h, { leaves: 2, frame: WOOD_DK, paper: 0x2b1f1a, back: false });
    b.box(D.w + 0.7, 0.45, 0.5, WOOD_DK, 0, y1 + D.h + 0.22, z, { col: false, mat: 'wood' });
    for (const s of [-1, 1]) b.box(0.4, D.h, 0.5, WOOD_DK, s * (D.w / 2 + 0.2), y1 + D.h / 2, z, { col: false, mat: 'wood' });
    b.slab(D.w + 0.8, 0.22, 0.7, C.marble, 0, y1, z + 0.1, { col: false, mat: 'stoneSmooth' });
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) for (const s of [-1, 1]) b.sphere(0.07, C.gold, s * (0.5 + i * 0.55), y1 + 1.2 + j * 1.2, z + 0.12, { mat: 'gold', seg: 6, seg2: 4, detail: true });   // 门钉
    const pq = plaqueMesh('通天塔', 7.6, 2.6, { bg: '#1b2b33', fg: '#d8b46a', frame: '#6a4a26' });
    pq.position.set(0, y1 + D.h + 1.9, z + 0.32);
    b.addMesh(pq);
    out.door = { x: 0, y: y1, z: z + 1.6 };
  }
  // 柱列：八角各一根、每面两根，深色木柱，石础
  for (let k = 0; k < 8; k++) {
    const [x0, z0] = vtx(a1, k), [x1, z1] = vtx(a1, k + 1);
    for (const t of [0, 1 / 3, 2 / 3]) {
      if (k === 2 && t > 0) continue;                                    // 正门两侧让给门框
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      columnBase(b, x, y1, z, 0.55, { bronze: false });
      b.cyl(0.48, 0.55, h1 - 1.4, WOOD_DK, x, y1 + (h1 - 1.4) / 2, z, { seg: 12, mat: 'wood', col: false });
    }
  }
  // 额枋、彩画垫板、斗拱（细部）
  b.add(drumGeo(a1 - 0.3, y1 + h1 - 1.4, 0.55), WOOD_DK, 'trBeam', { col: false });
  b.add(drumGeo(a1 - 0.35, y1 + h1 - 0.85, 0.85), C.red, 'trFrieze', { col: false });
  for (let k = 0; k < 8; k++) {
    const na = (k * Math.PI) / 4, [x0, z0] = vtx(a1 + 0.2, k), [x1, z1] = vtx(a1 + 0.2, k + 1);
    for (let i = 1; i < 9; i++) {
      const t = i / 9;
      dougong(b, x0 + (x1 - x0) * t, y1 + h1 - 0.9, z0 + (z1 - z0) * t, 0.62, Math.PI / 2 - na, true);
    }
  }
  // 一层大檐：出檐 6.6 米、檐角起翘 2.6 米（落到第二层墙脚）——全塔最大的一道檐
  eave(b, a1 + 6.6, y1 + h1 - 2.4, floorWidth(2) / 2, floorBase(2) + 0.2, 2.6, { big: true, fh: 0.7 });
  // 一层的墙体碰撞（八面，正门那一面也挡住——入塔按 E）
  for (let k = 0; k < 8; k++) {
    const [x0, z0] = vtx(a1 - 0.6, k), [x1, z1] = vtx(a1 - 0.6, k + 1), L = Math.hypot(x1 - x0, z1 - z0);
    b.collider((x0 + x1) / 2, y1, y1 + h1, (z0 + z1) / 2, L / 2 + 0.3, 0.7, Math.atan2(-(z1 - z0), x1 - x0));
  }
  // 正门抱厦：四根前檐柱 + 歇山顶，后坡搭在一层墙上
  {
    const pc = P.porch, z0 = a1 - 0.6, z1 = z0 + pc.d, xs = [-pc.w / 2, -pc.w / 6, pc.w / 6, pc.w / 2];
    for (const x of xs) {
      columnBase(b, x, y1, z1, 0.5, { bronze: true });
      b.cyl(0.42, 0.5, pc.col, WOOD_DK, x, y1 + pc.col / 2, z1, { seg: 12, mat: 'wood' });
    }
    b.box(pc.w + 1, 0.55, 0.45, WOOD_DK, 0, y1 + pc.col - 0.35, z1, { col: false, mat: 'trBeam', uvScale: [pc.w + 1, 1] });
    const W = pc.w + 3.4, Dd = pc.d + 2.2, H = Dd * 0.5;
    b.push(0, 0, z0 + Dd / 2 - 0.4, 0);
    roofAssembly(b, 'xieshan', W, Dd, H, y1 + pc.col + 0.4, C.tileDark, 'trTile', { gold: true, goldK: 1.0, fish: false, lift: 1.4 / (2.4 * H), span: 4, curl: true, underMat: 'trRafter', underColor: C.woodRed, gableMat: 'trGable', bofeng: 0.45 });
    b.pop();
    for (const s of [-1, 1]) { hangLantern(b, s * (pc.w / 2 - 1.2), y1 + pc.col - 0.7, z1 + 0.1, 1.4); out.lanterns.push([s * (pc.w / 2 - 1.2), y1 + pc.col - 0.9, z1 + 0.1]); }
    b.collider(0, y1 + pc.col, y1 + pc.col + H * 0.7, z0 + Dd / 2, W / 2 * 0.95, Dd / 2 * 0.9, 0, { walk: false });
  }
  // ---------- 二至一百层 ----------
  for (let f = 2; f <= P.floors; f++) {
    const a = floorWidth(f) / 2, yb = floorBase(f), H = floorHeight(f), seg = f % P.seg === 0 && f < P.floors;
    const aNext = f < P.floors ? floorWidth(f + 1) / 2 : a;
    // 墙身（窗格）与角柱；每段起首一层（11、21……）是平座层：墙脚一圈平座栏杆
    b.add(drumGeo(a, yb, H - 0.05), WOOD, 'trDoorsDk', { col: false });
    for (let k = 0; k < 8; k++) { const [x, z] = vtx(a + 0.05, k); b.slab(0.36, H, 0.36, WOOD_DK, x, yb, z, { col: false, mat: 'wood' }); }
    if (f % P.seg === 1 && f > 1) balcony(b, a, a + 2.0, yb + 0.25);
    // 段末（十、二十……九十层）：彩画垫板 + 大檐（出檐自 6 米到 4 米，越高越短，起翘随之）；其余各层：腰檐
    if (seg) {
      const so = 6.2 - 2.4 * (f / P.floors);
      b.add(drumGeo(a, yb + H - 0.85, 0.75, { out: 0.06 }), C.red, 'trFrieze', { col: false });
      eave(b, a + so, yb + H - 0.42 * so, aNext, yb + H + 0.25, 0.4 * so, { big: true, fh: 0.7 });
    } else if (f < P.floors) {
      eave(b, a + 1.6, yb + H - 0.85, aNext, yb + H + 0.1, 0.45, { fh: 0.34 });
    }
  }
  // ---------- 顶层：八角攒尖与塔刹 ----------
  const aT = floorWidth(P.floors) / 2, yT = BODY_TOP;
  b.add(drumGeo(aT, yT - 0.9, 0.85, { out: 0.06 }), C.red, 'trFrieze', { col: false });
  const Rr = (aT + 2.4) / K8;
  b.add(pyramidRoofGeo(8, Rr, P.roofH, { rot: -Math.PI / 8, lift: 0.16, p: 1.5 }), C.tileDark, 'trTile', { y: yT - 1.0, col: false });
  b.add(pyramidRoofGeo(8, Rr, P.roofH, { rot: -Math.PI / 8, lift: 0.16, p: 1.5 }), C.woodRed, 'trRafter', { y: yT - 1.1, col: false });
  b.add(fasciaGeo(aT + 2.4, yT - 1.0, P.roofH * 0.16, 0.45), C.woodLight, 'trFascia', { col: false });
  for (let k = 0; k < 8; k++) { const [x, z] = vtx(aT + 2.6, k); b.add(new THREE.ConeGeometry(0.16, 0.9, 5), C.gold, 'gold', { x, y: yT - 1.0 + P.roofH * 0.16 + 0.35, z, col: false }); }
  crown(b, yT - 1.0 + P.roofH - 0.6, P.crown);
  out.top = yT - 1.0 + P.roofH - 0.6 + P.crown;
  return out;
}
