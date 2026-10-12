// 问道殿外观（第十一轮起）：五层楼阁。尺寸、开间、门窗洞全部取自 hallSpec.js，与室内（hallInterior.js）一一对应。
// 自下而上：两层汉白玉台基与踏道 → 一层殿身（九开间、正面三间抱厦）→ 每层：檐柱、墙与门窗、额枋、斗拱、
// 腰檐（筒瓦、封檐板、角梁鎏金卷草、檐角宫灯）→ 上一层的平座（挑台、栏板）→ 顶层重檐歇山顶（鎏金鸱吻、宝珠）。
// 第十二轮：外观的瓦、封檐板、椽子、墙板、槛墙、额枋、斗拱垫板、门窗与栏板改用素材古建（assets/buildings/01.fbx）的手绘贴图横条
//   （builder.js 的 tr* 材质），与宗门里其他素材殿阁同一套画法；构件尺寸、门窗洞位置不变（仍与室内对应）。
//   檐角改为只在角上陡翘（起翘范围固定 SPAN 米），角上挑出上翘的仔角梁（翼角，梁头鎏金）；角间实墙为灰泥粉墙、
//   槛窗为米黄窗纸的菱花窗；顶层上檐改为十字脊（两座歇山十字相交，四面各见一座山花）。
// 开启的窗：窗扇向外推开，窗洞里看得见室内（外观这边用一圈暗色内壁示意；进殿后此内壁隐去，室内场景接替）。
// 本地原点：殿身中心、一层楼面；+Z 为正面（南）。
import * as THREE from 'three';
import { C } from './builder.js';
import { dougong, hipRoofGeo, hipCornerLines, ridgeAlong, roofAssembly, doorLeaves, plaqueMesh, liftFn } from './arch.js';
import { terrace, frontStairs, banner } from './halls.js';
import { columnBase } from './stone9.js';
import { HALL, N_LEVELS, bayKinds, bayCenters, openings } from '../hallSpec.js';
import { applyFade, FOGU } from '../shaderlib.js';

// 四面的朝向（Builder 坐标系转角：本地 +Z 即该面的外法线）与沿墙坐标 → 该面本地 x 的换算
export const SIDE_RY = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };
export const sideLX = (side, u) => (side === 'S' || side === 'W' ? u : -u);
export const sidePlane = (L, side) => (side === 'S' ? [0, L.d / 2] : side === 'N' ? [0, -L.d / 2] : side === 'E' ? [L.w / 2, 0] : [-L.w / 2, 0]);
export const COL_R = [0.44, 0.4, 0.38, 0.36, 0.36];
const OUT = 2.4;              // 腰檐出檐（自柱轴线）
const RAIL_OUT = 1.3;         // 平座挑出（自上一层柱轴线）
const TRANSOM = 0.45;         // 窗顶横披高
// 檐角起翘按绝对高度给（liftFn 的起翘与屋面虚拟高度 H 成正比：腰檐、下檐只取大屋面靠檐口的一圈，H 达二三十米，按比例会翘起十几米）
const liftFor = (H, corner) => corner / (2.4 * H);
const SPAN = 6.5;             // 起翘范围（自檐角起算，米）：只在角上翘起，翘得陡
const CORNERS = [[1, 1], [-1, 1], [1, -1], [-1, -1]];

// 窗扇：宽 w、高 h，下沿 y，铰在 hx（相对窗洞中心的本地 x），向外（+Z）推开 a 弧度
function casement(b, cx, hx, y, w, h, a, frame) {
  const s = Math.sign(hx);
  b.push(cx + hx, y, 0.06, s * a);
  const x = -s * w / 2;
  b.panel(w - 0.1, h - 0.1, C.paper, x, h / 2, -0.015, { mat: 'trLat', uvScale: [1, 1] });     // 菱花窗扇（双面）
  for (const e of [-1, 1]) b.box(0.07, h, 0.07, frame, x + e * (w / 2 - 0.035), h / 2, -0.015, { col: false, mat: 'wood' });
  for (const e of [0, 1]) b.box(w, 0.07, 0.07, frame, x, e ? h - 0.035 : 0.035, -0.015, { col: false, mat: 'wood' });
  b.pop();
}

// 正门的两扇大门：以门洞两边为轴向内推开约 93°（外观与室内各画一份，位置相同）；本地坐标同 bayFill
export function mainDoorLeaves(b, cx, w, h, wallT) {
  for (const s of [-1, 1]) {
    b.push(cx + s * w / 2, 0.16, -wallT / 2, s * -1.62);
    doorLeaves(b, -s * w / 4, 0, 0, w / 2, h - 0.2, { leaves: 2, frame: C.woodRed });
    b.pop();
  }
}

// 一间墙面（在该面的本地坐标系里：x 沿墙、z = 0 为柱轴线、+Z 朝外、y 自本层楼面起）
// kind：wall / paper / open / door / main；o 为门窗洞（来自 hallSpec.openings），exterior：外观（窗扇向外开）还是室内
// 墙面分三条横带（每条一整块，贴图连贯）：槛墙（地面到窗台）、窗带（窗洞两侧的竖板壁；实墙的开间为灰泥粉墙）、
// 额（窗顶到檐柱顶：回纹带与描金额枋）
export function bayFill(b, kind, cx, bw, L, colR, o, { exterior = true, wallT = HALL.wallT } = {}) {
  const H = L.col, cw = bw - 2 * colR * 0.9, frame = C.woodRed;
  const wall = (x0, x1, y0, y1, mat, color) => {
    if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return;
    b.box(x1 - x0, y1 - y0, wallT, color, (x0 + x1) / 2, (y0 + y1) / 2, 0, { mat, uvScale: [x1 - x0, 1] });
  };
  const xa = cx - cw / 2, xb = cx + cw / 2;
  if (kind === 'wall') {
    const [s0, s1] = L.win;
    wall(xa, xb, 0, s0, 'trSill', C.redDark);
    wall(xa, xb, s0, s1, 'trPlaster', C.plasterGrey);
    wall(xa, xb, s1, H, 'trHead', C.red);
    return;
  }
  const w = o.w, ox0 = cx - w / 2, ox1 = cx + w / 2, y0 = o.y0 - L.y, y1 = o.y1 - L.y;
  wall(xa, xb, y1, H, 'trHead', C.red);                                  // 额（整间宽）
  if (y0 > 0.02) wall(xa, xb, 0, y0, 'trSill', C.redDark);              // 槛墙（整间宽）
  wall(xa, ox0, y0, y1, 'trPlank', C.red); wall(ox1, xb, y0, y1, 'trPlank', C.red);   // 洞口两侧的竖板壁
  // 框：上槛、下槛（风槛）、抱框，进深 0.22
  const fd = 0.22;
  b.box(w + 0.16, 0.14, fd, frame, cx, y1 - 0.07, 0, { col: false, mat: 'wood' });
  for (const s of [-1, 1]) b.box(0.12, y1 - y0, fd, frame, cx + s * (w / 2 + 0.02), (y0 + y1) / 2, 0, { col: false, mat: 'wood' });
  if (kind === 'paper' || kind === 'open') {
    b.slab(w + 0.12, 0.08, wallT + 0.12, frame, cx, y0, 0, { col: false, mat: 'wood' });          // 榻板
    if (kind === 'paper') {
      // 关着的窗：整洞一扇菱花槛窗（米黄窗纸，双面）
      b.panel(w - 0.08, y1 - y0 - 0.2, C.paper, cx, (y0 + 0.08 + y1 - 0.14) / 2 + 0.01, 0.0, { mat: 'trLat', uvScale: [1, 1] });
      return;
    }
    // 开启的窗：窗顶一条横披（两面，与室内的横披同位），其下两扇窗扇向外推开（外观可见）；窗洞本身留空
    b.panel(w - 0.08, TRANSOM - 0.08, C.paper, cx, y1 - TRANSOM / 2, 0.02, { mat: 'window' });
    b.panel(w - 0.08, TRANSOM - 0.08, C.paper, cx, y1 - TRANSOM / 2, -0.02, { mat: 'window', ry: Math.PI });
    b.box(w, 0.08, fd, frame, cx, y1 - TRANSOM, 0, { col: false, mat: 'wood' });
    const ph = y1 - y0 - TRANSOM - 0.1;
    if (exterior) for (const s of [-1, 1]) casement(b, cx, s * w / 2, y0 + 0.08, w / 2, ph, 1.15, frame);
    return;
  }
  // 门：门槛；关着的隔扇门（素材贴图）；正门两扇向内推开（从门洞看进去，暗色内壁前立着门扇）
  b.slab(w + 0.1, 0.16, wallT + 0.1, frame, cx, 0, 0, { col: false, mat: 'wood' });
  if (kind === 'door') b.panel(w - 0.04, y1 - 0.2, C.red, cx, 0.16 + (y1 - 0.2) / 2, 0.0, { mat: 'trDoors', uvScale: [w, 1] });
  else if (kind === 'main') mainDoorLeaves(b, cx, w, y1, wallT);
}

// 一层（第 l 层）的墙身：檐柱一周、四面各间、额枋彩画、斗拱
function levelShell(b, l) {
  const L = HALL.levels[l], r = COL_R[l], ops = openings(l);
  for (const side of ['S', 'N', 'E', 'W']) {
    const [px, pz] = sidePlane(L, side), cs = bayCenters(l, side), kinds = bayKinds(l, side);
    const len = side === 'S' || side === 'N' ? L.w : L.d;
    b.push(px, L.y, pz, SIDE_RY[side]);
    kinds.forEach((kind, i) => {
      const o = ops.find((q) => q.side === side && q.bay === i);
      bayFill(b, kind, sideLX(side, cs[i].u), cs[i].bw, L, r, o, { exterior: true, wallT: l ? 0.45 : HALL.wallT });
    });
    // 额枋（描金）与平板枋，斗拱一排（约 1.15 米一朵），斗拱后一道彩画垫板（遮住与腰檐之间的空当）
    b.box(len + 2 * r, 0.5, 0.42, C.woodRed, 0, L.col - 0.37, 0.05, { col: false, mat: 'trBeam', uvScale: [len + 2 * r, 1] });
    b.slab(len + 2 * r + 0.3, 0.16, 0.56, C.woodRed, 0, L.col, 0.05, { col: false, mat: 'wood' });
    b.box(len + 2 * r, 0.7, 0.12, C.woodRed, 0, L.col + 0.51, -0.06, { col: false, mat: 'trFrieze', uvScale: [len + 2 * r, 1] });
    const nd = Math.max(4, Math.round(len / 1.15));
    for (let i = 0; i <= nd; i++) dougong(b, -len / 2 + (i * len) / nd, L.col + 0.16, 0.06, l ? 0.5 : 0.58, 0, true);
    b.pop();
  }
  // 檐柱：四周轴线上每个开间分界（角柱共用）
  const xs = Array.from({ length: L.nb + 1 }, (_, i) => -L.w / 2 + (i * L.w) / L.nb), zs = Array.from({ length: L.nd + 1 }, (_, j) => -L.d / 2 + (j * L.d) / L.nd);
  const cols = [];
  for (const x of xs) for (const z of [-L.d / 2, L.d / 2]) cols.push([x, z]);
  for (const z of zs.slice(1, -1)) for (const x of [-L.w / 2, L.w / 2]) cols.push([x, z]);
  for (const [x, z] of cols) {
    columnBase(b, x, L.y, z, r, { bronze: l === 0 });
    b.cyl(r * 0.9, r, L.col, C.vermilion, x, L.y + L.col / 2, z, { seg: 14, mat: 'wood' });
  }
}

// 封檐板：沿四坡檐口一圈的浅木色板（素材贴图），随檐角起翘；W × D 为檐口矩形，y 为檐口高（未起翘处）
function fasciaRing(b, W, D, H, y, lift, { h = 0.5, out = 0.035, span = SPAN } = {}) {
  const lf = liftFn(W, D, H, lift, span), pos = [], uv = [], nrm = [];
  let u = 0;
  for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    const along = nz !== 0, L = along ? W : D, seg = Math.max(8, Math.ceil(L / 0.8));
    // 自外看从左到右：南面 x 增、东面 z 减、北面 x 减、西面 z 增
    const P = (t) => (nz > 0 ? [t, D / 2] : nz < 0 ? [-t, -D / 2] : nx > 0 ? [W / 2, -t] : [-W / 2, t]);
    for (let i = 0; i < seg; i++) {
      const ta = -L / 2 + (i * L) / seg, tb = -L / 2 + ((i + 1) * L) / seg;
      const [xa, za] = P(ta), [xb, zb] = P(tb);
      const ya = y + lf(xa * 0.999, za * 0.999), yb = y + lf(xb * 0.999, zb * 0.999);
      const ua = u + (ta + L / 2), ub = u + (tb + L / 2);
      const q = [[xa, ya - h, za, ua, 0], [xb, yb - h, zb, ub, 0], [xb, yb + 0.03, zb, ub, 1], [xa, ya + 0.03, za, ua, 1]];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const [x, yy, z, uu, vv] = q[k];
        pos.push(x + nx * out, yy, z + nz * out); uv.push(uu, vv); nrm.push(nx, 0, nz);
      }
    }
    u += L;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  b.add(g, C.woodLight, 'trFascia', { col: false });
}

// 翼角的仔角梁：沿对角线挑出、渐细上翘的弯木（本地 +X 为挑出方向），按 k 缓存
const HORN = new Map();
function hornGeo(k) {
  const key = k.toFixed(2);
  if (HORN.has(key)) return HORN.get(key);
  const len = 1.5 * k, rise = 1.15 * k, r0 = 0.2 * k, r1 = 0.045 * k, n = 10, m = 7;
  const pos = [], nrm = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = len * t, y = rise * Math.pow(t, 2.2), r = r0 + (r1 - r0) * t;
    const ty = rise * 2.2 * Math.pow(t, 1.2), tl = Math.hypot(len, ty), Nx = -ty / tl, Ny = len / tl;
    for (let j = 0; j <= m; j++) {
      const a = (j / m) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      pos.push(x + Nx * c * r, y + Ny * c * r, sn * r); nrm.push(Nx * c, Ny * c, sn); uv.push(x, j / m);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const a = i * (m + 1) + j, c = a + m + 1;
    idx.push(a, a + 1, c, a + 1, c + 1, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const h = { geo: g, len, rise };
  HORN.set(key, h);
  return h;
}
// 檐角挑出的仔角梁（素材殿阁上高高翘起的檐角尖）：自檐角往里 0.3 米起，梁头一颗鎏金宝珠
function cornerHorns(b, W, D, H, y, lift, { span = SPAN, k = 1, corners = CORNERS } = {}) {
  const lf = liftFn(W, D, H, lift, span), hg = hornGeo(k);
  for (const [sx, sz] of corners) {
    const x = sx * (W / 2 - 0.21 * k), z = sz * (D / 2 - 0.21 * k), y0 = y + lf(sx * W / 2 * 0.999, sz * D / 2 * 0.999) - 0.12 * k;
    const ry = Math.atan2(-sz, sx);
    b.add(hg.geo, C.woodLight, 'trFascia', { x, y: y0, z, ry, col: false });
    b.sphere(0.12 * k, C.gold, x + Math.cos(ry) * hg.len, y0 + hg.rise + 0.05 * k, z - Math.sin(ry) * hg.len, { mat: 'gold', seg: 8, seg2: 6 });
  }
}

// 檐角宫灯的挂点：四坡檐口四角往里约 0.6 米、檐下（本地坐标，压入 [x, yTop, z]）
function cornerLanterns(W, D, H, y, lift, list, cx = 0, cz = 0, span = SPAN) {
  const lf = liftFn(W, D, H, lift, span);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (W / 2 - 0.62), z = sz * (D / 2 - 0.62);
    list.push([cx + x, y + lf(x, z) - 0.32, cz + z]);
  }
}

// 栏板：沿闭合折线每段一块素材贴图栏板（双面）、扶手、地栿，段首立望柱（鎏金柱头）
function railPanels(b, pts, y, h = 1.0) {
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
    const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    b.panel(L, h - 0.14, C.red, cx, y + 0.07 + (h - 0.14) / 2, cz, { mat: 'trRail', ry, uvScale: [L, 1] });
    b.box(L + 0.12, 0.1, 0.14, C.woodRed, cx, y + h, cz, { ry, col: false, mat: 'wood' });
    b.box(L, 0.1, 0.1, C.woodRed, cx, y + 0.05, cz, { ry, col: false, mat: 'wood' });
    b.slab(0.17, h + 0.12, 0.17, C.woodRed, x0, y, z0, { col: false, mat: 'wood' });
    b.sphere(0.1, C.gold, x0, y + h + 0.2, z0, { mat: 'gold', seg: 8, seg2: 6 });
    b.collider(cx, y, y + h + 0.1, cz, L / 2, 0.1, ry, { walk: false, cam: false });
  }
}

// 腰檐（第 l 层之上）：只取四坡屋面靠檐口的一圈，自檐口升到上一层柱轴线、平座之下；檐角陡翘，挑出仔角梁
function waistEave(b, l, lanterns) {
  const L = HALL.levels[l], N = HALL.levels[l + 1];
  const W = L.w + 2 * OUT, D = L.d + 2 * OUT, half = Math.min(W, D) / 2;
  const ey = L.y + L.col + 0.15, sN = OUT + (L.w - N.w) / 2;          // 檐口高、檐口到上层柱轴线的水平距离
  const rise = N.y - 0.35 - ey, p = 1.7;
  const H = rise / Math.pow(sN / half, p), tM = Math.min(0.95, (sN + 0.6) / half), lift = liftFor(H, 1.45);
  const o = { tMax: tM, lift, p, span: SPAN };
  b.add(hipRoofGeo(W, D, H, o), C.tileDark, 'trTile', { y: ey, col: false });
  b.add(hipRoofGeo(W, D, H, o), C.woodRed, 'trRafter', { y: ey - 0.12, col: false });
  fasciaRing(b, W, D, H, ey, lift);
  cornerHorns(b, W, D, H, ey, lift, { k: 0.85 });
  cornerLanterns(W, D, H, ey, lift, lanterns);
  for (const ln of hipCornerLines(W, D, H, ey, { tMax: tM, lift, p, n: 7, span: SPAN })) ridgeAlong(b, ln.pts, 0.3, C.ridge, 'glaze', 0.13);
  // 檐下挡雨：腰檐以下不让人从平座跳下（外观不可走，留作镜头遮挡）
  b.collider(0, ey - 0.2, N.y - 0.3, 0, W / 2 * 0.98, D / 2 * 0.98, 0, { walk: false });
}

// 平座：上一层（第 l 层）柱外挑出的回廊台面与朱红栏杆，台下一排斗拱
function balcony(b, l) {
  const L = HALL.levels[l], P = [L.w + 2 * RAIL_OUT, L.d + 2 * RAIL_OUT];
  b.box(P[0], 0.28, P[1], C.woodRed, 0, L.y - 0.14, 0, { col: false, mat: 'trBeam', uvScale: [Math.max(P[0], P[1]), 1] });
  b.slab(P[0] + 0.1, 0.07, P[1] + 0.1, C.woodDark, 0, L.y - 0.02, 0, { col: false, mat: 'wood' });
  for (const [sx, sz, len, along] of [[0, 1, P[0], true], [0, -1, P[0], true], [1, 0, P[1], false], [-1, 0, P[1], false]]) {
    const n = Math.max(4, Math.round(len / 1.4));
    for (let i = 0; i <= n; i++) {
      const u = -len / 2 + (i * len) / n;
      const x = along ? u : sx * P[0] / 2, z = along ? sz * P[1] / 2 : u;
      dougong(b, x * 0.985, L.y - 0.62, z * 0.985, 0.34, along ? (sz > 0 ? 0 : Math.PI) : sx * Math.PI / 2, true);
    }
  }
  railPanels(b, [[-P[0] / 2 + 0.12, P[1] / 2 - 0.12], [P[0] / 2 - 0.12, P[1] / 2 - 0.12], [P[0] / 2 - 0.12, -P[1] / 2 + 0.12], [-P[0] / 2 + 0.12, -P[1] / 2 + 0.12]], L.y + 0.05, 1.0);
}

// 抱厦：一层正面居中三间、进深 7 米；四根前檐柱 + 两根山面柱，歇山顶（脊与殿身正面平行，后坡搭在殿身墙上）
function porch(b) {
  const L = HALL.levels[0], P = HALL.porch, cs = bayCenters(0, 'S');
  const x0 = cs[3].u - cs[3].bw / 2, x1 = cs[5].u + cs[5].bw / 2, z0 = L.d / 2, z1 = L.d / 2 + P.d, r = 0.4;
  for (const x of [x0, cs[3].u + cs[3].bw / 2, cs[5].u - cs[5].bw / 2, x1]) {
    columnBase(b, x, 0, z1, r, { bronze: true });
    b.cyl(r * 0.9, r, P.col, C.vermilion, x, P.col / 2, z1, { seg: 14, mat: 'wood' });
  }
  for (const x of [x0, x1]) {
    columnBase(b, x, 0, (z0 + z1) / 2, r, { bronze: true });
    b.cyl(r * 0.9, r, P.col, C.vermilion, x, P.col / 2, (z0 + z1) / 2, { seg: 14, mat: 'wood' });
  }
  b.box(x1 - x0 + 2 * r, 0.5, 0.42, C.woodRed, (x0 + x1) / 2, P.col - 0.35, z1, { col: false, mat: 'trBeam', uvScale: [x1 - x0 + 2 * r, 1] });
  for (const s of [-1, 1]) b.box(0.42, 0.5, P.d + 0.3, C.woodRed, s > 0 ? x1 : x0, P.col - 0.35, (z0 + z1) / 2, { col: false, mat: 'trBeam', uvScale: [1, 1] });
  b.slab(x1 - x0 + 0.9, 0.16, 0.5, C.woodRed, (x0 + x1) / 2, P.col, z1, { col: false, mat: 'wood' });
  const nd = Math.round((x1 - x0) / 1.1);
  for (let i = 0; i <= nd; i++) dougong(b, x0 + (i * (x1 - x0)) / nd, P.col + 0.16, z1, 0.5, 0, true);
  for (const s of [-1, 1]) for (let i = 1; i < 6; i++) dougong(b, s > 0 ? x1 : x0, P.col + 0.16, z0 + (i * P.d) / 6, 0.5, s * Math.PI / 2, true);
  // 屋顶：前檐出 1.8 米，后檐压在殿身墙上
  const W = x1 - x0 + 3.6, D = P.d + 1.8 + 0.4, cz = z0 - 0.4 + D / 2, H = D * 0.5, sp = 4.2;
  const pl = liftFor(H, 1.2);
  b.push(0, 0, cz, 0);
  roofAssembly(b, 'xieshan', W, D, H, P.col + 0.62, C.tileDark, 'trTile', { gold: true, goldK: 0.9, fish: false, lift: pl, span: sp, curl: false, underMat: 'trRafter', underColor: C.woodRed, gableMat: 'trGable', bofeng: 0.4 });
  fasciaRing(b, W, D, H, P.col + 0.62, pl, { span: sp });
  cornerHorns(b, W, D, H, P.col + 0.62, pl, { span: sp, k: 0.75, corners: [[1, 1], [-1, 1]] });
  b.pop();
  b.collider((x0 + x1) / 2, P.col + 0.3, P.col + 0.62 + H * 0.6, cz, W / 2 * 0.95, D / 2 * 0.9, 0, { walk: false });
  return { x0, x1, z0, z1, roofTop: P.col + 0.62 + H };
}

// 顶层屋顶：重檐（下檐一圈 + 上檐十字脊），鎏金鸱吻、宝珠
function topRoof(b, lanterns) {
  const L = HALL.levels[N_LEVELS - 1];
  const ey = L.y + L.col + 0.15;
  // 下檐：一圈腰檐式的四坡檐（宽出 2.6 米）
  const W1 = L.w + 5.2, D1 = L.d + 5.2, half1 = Math.min(W1, D1) / 2, sIn = 5.2, rise1 = 3.0, p = 1.7;
  const H1 = rise1 / Math.pow(sIn / half1, p), tM = sIn / half1, lift1 = liftFor(H1, 1.6);
  const o1 = { tMax: tM, lift: lift1, p, span: SPAN };
  b.add(hipRoofGeo(W1, D1, H1, o1), C.tileDark, 'trTile', { y: ey, col: false });
  b.add(hipRoofGeo(W1, D1, H1, o1), C.woodRed, 'trRafter', { y: ey - 0.12, col: false });
  fasciaRing(b, W1, D1, H1, ey, lift1);
  cornerHorns(b, W1, D1, H1, ey, lift1, { k: 0.95 });
  cornerLanterns(W1, D1, H1, ey, lift1, lanterns);
  for (const ln of hipCornerLines(W1, D1, H1, ey, { tMax: tM, lift: lift1, p, n: 7, span: SPAN })) ridgeAlong(b, ln.pts, 0.32, C.ridge, 'glaze', 0.13);
  // 上下檐之间：一圈额枋与斗拱（上檐的檐柱缩进 2.4 米）
  const yU = ey + rise1 - 0.2, wU = L.w - 4.8, dU = L.d - 4.8;
  for (const side of ['S', 'N', 'E', 'W']) {
    const LL = { w: wU, d: dU }, [px, pz] = sidePlane(LL, side), len = side === 'S' || side === 'N' ? wU : dU;
    b.push(px, yU, pz, SIDE_RY[side]);
    b.box(len, 1.0, 0.6, C.red, 0, 0.5, -0.1, { mat: 'trFrieze', col: false, uvScale: [len, 1] });
    b.box(len, 0.6, 0.6, C.woodRed, 0, 1.3, -0.1, { mat: 'trBeam', col: false, uvScale: [len, 1] });
    const nd = Math.round(len / 1.15);
    for (let i = 0; i <= nd; i++) dougong(b, -len / 2 + (i * len) / nd, 1.6, 0.26, 0.55, 0, true);
    b.pop();
  }
  // 上檐：十字脊——方形屋面上两座歇山十字相交（第二座只取上部两坡与山花），四面各见一座山花，脊心鎏金宝珠
  const S = Math.max(wU, dU) + 6.4, W = S, D = S, H = S * 0.44, y = yU + 2.0, sp = 8;
  const tl = liftFor(H, 2.2);
  const ro = { gold: true, goldK: 1.6, fish: true, fishK: 2.4, lift: tl, span: sp, curl: false, underMat: 'trRafter', underColor: C.woodRed, gableMat: 'trGable', bofeng: 0.75 };
  roofAssembly(b, 'xieshan', S, S, H, y, C.tileDark, 'trTile', ro);
  b.push(0, 0, 0, Math.PI / 2);
  roofAssembly(b, 'xieshan', S, S, H, y, C.tileDark, 'trTile', { ...ro, upper: true });
  b.pop();
  fasciaRing(b, S, S, H, y, tl, { span: sp });
  cornerHorns(b, S, S, H, y, tl, { span: sp, k: 1.25 });
  cornerLanterns(W, D, H, y, tl, lanterns, 0, 0, sp);
  b.collider(0, ey - 0.2, y + H * 0.6, 0, W1 / 2 * 0.9, D1 / 2 * 0.9, 0, { walk: false });
  return { top: y + H, band: { y: yU, z: dU / 2 } };
}

// 整座外观。返回 { top, door（本地：正门外一步）, porch, lanterns（本地：抱厦檐下宫灯挂点）, dark（各层暗色内壁的尺寸）, bodies（各层实心碰撞，本地） }
export function grandTower(b) {
  const [T1, T2] = HALL.podium;
  // 两层台基（前后踏道；两侧不设踏道——台基外沿到云顶台沿只剩 3 米，留作绕殿的通道）
  terrace(b, [-T1.x, T1.x, T1.z0, T1.z1], -T1.h - T2.h, T1.h, { gaps: [[-4.8, 4.8]], backGaps: [[-3.2, 3.2]], medal: 6.5 });
  terrace(b, [-T2.x, T2.x, T2.z0, T2.z1], -T2.h, T2.h, { gaps: [[-4.0, 4.0]], backGaps: [[-3.2, 3.2]], medal: 6 });
  frontStairs(b, 0, T1.z1, -T1.h - T2.h, T1.h, 9.6);
  frontStairs(b, 0, T2.z1, -T2.h, T2.h, 8.0, { center: true });
  frontStairs(b, 0, T1.z0, -T1.h - T2.h, T1.h, 6.4, { ry: Math.PI });
  frontStairs(b, 0, T2.z0, -T2.h, T2.h, 6.4, { ry: Math.PI });
  // 一层台面：金砖（深灰方砖）铺地一层，与室内楼面齐平
  const eaveLanterns = [];
  for (let l = 0; l < N_LEVELS; l++) levelShell(b, l);
  for (let l = 0; l < N_LEVELS - 1; l++) { waistEave(b, l, eaveLanterns); balcony(b, l + 1); }
  const pc = porch(b);
  const { top, band } = topRoof(b, eaveLanterns);
  // 匾额：抱厦檐下「问道殿」（入殿处，月台上看得清），顶层上下檐之间「道法自然」（自天阶仰望可见）
  const p1 = plaqueMesh('问道殿', 4.2, 1.45, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
  p1.position.set(0, HALL.porch.col - 1.32, pc.z1 + 0.3); b.addMesh(p1);
  const p2 = plaqueMesh('道法自然', 4.6, 1.3, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
  p2.position.set(0, band.y + 0.98, band.z + 0.52); b.addMesh(p2);
  for (const s of [-1, 1]) banner(b, s * (pc.x1 - 1.5), HALL.porch.col - 0.75, pc.z1 + 0.3, 0, 0.9, 3.3, s < 0 ? '问道' : '青岚');
  // 各层室内不可走（外观这边只是暗色内壁）：整层实心碰撞，门口自然挡住。这几块由调用方登记（另给标签：
  // 镜头贴着外墙时不算「镜头进了建筑」，整座殿不因此隐去）
  const dark = [], bodies = [];
  HALL.levels.forEach((L, l) => {
    const top2 = l < N_LEVELS - 1 ? HALL.levels[l + 1].y - HALL.slabT : L.y + L.col;
    dark.push({ x: L.w / 2 - 0.3, z: L.d / 2 - 0.3, y0: L.y, y1: top2 });
    bodies.push({ x: 0, z: 0, y0: L.y - 0.05, y1: L.y + L.H, hx: L.w / 2 - 0.2, hz: L.d / 2 - 0.2 });
  });
  // 宫灯：抱厦檐下四盏，各层腰檐、顶层两重檐的檐角各一盏（与素材殿阁同样挂在檐角）
  const lanterns = [[pc.x0 + 0.1, HALL.porch.col - 0.7, pc.z1 + 0.3], [pc.x1 - 0.1, HALL.porch.col - 0.7, pc.z1 + 0.3], [-2.4, HALL.levels[0].col - 0.4, HALL.levels[0].d / 2 + 1.8], [2.4, HALL.levels[0].col - 0.4, HALL.levels[0].d / 2 + 1.8], ...eaveLanterns];
  return { top, porch: pc, door: { x: 0, y: 0, z: HALL.levels[0].d / 2 + 1.4 }, lanterns, dark, bodies };
}

// 外观的暗色内壁（从窗洞、门洞看进去是幽暗的殿内；入夜透出一点宫灯的暖光）：每层一个朝内的盒子。进殿后隐去，由室内场景接替。
// 不受光（日光照不进殿深处；阴影图只覆盖人物周围，受光的话远看窗洞里会是亮的）；随建筑一起淡化：
// 建筑放进场景后把淡化 uniform 记到 mat.userData.fadeU（见 sect2.js）
export function darkInterior(dark) {
  const g = new THREE.Group();
  g.name = 'hall-dark-interior';
  const mat = new THREE.MeshBasicMaterial({ color: 0x43362b, side: THREE.BackSide });
  mat.onBeforeCompile = (sh) => {
    applyFade(sh, { fade: mat.userData.fadeU || null });
    sh.uniforms.uNight = FOGU.uNight;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, vec3(.30, .17, .07), uNight);\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'hall-dark';
  for (const d of dark) {
    const y0 = d.y0 + 0.03;                        // 底面略高于台面 / 楼板，不与之争深度
    const m = new THREE.Mesh(new THREE.BoxGeometry(2 * d.x, d.y1 - y0, 2 * d.z), mat);
    m.position.set(0, (y0 + d.y1) / 2, 0);
    m.userData.fadeable = false;
    g.add(m);
  }
  g.userData.mat = mat;
  return g;
}
