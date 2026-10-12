// 宗门建筑：山门牌楼、弟子居所、丹房、问道殿、藏经阁、亭台等。
// 同一构件库通过体量、屋顶形制、朝向、庭院与细节形成区别。
import * as THREE from 'three';
import { C } from './builder.js';
import { columnBase } from './stone9.js';
import { hall, roofAssembly, xieshanRoofGeo, gableRoofGeo, hipRoofGeo, pyramidRoofGeo, dougong, beam, rail, woodRail, stairs, plaqueMesh, doorLeaves, sillWindow, hangLantern, pavilion, gableY, liftFn, eaves, goldCurl, hipCornerLines, ridgeAlong } from './arch.js';
export { hall, pavilion };

// ---------------- 山门：三间四柱三楼牌楼 ----------------
export function gatePailou(b, { front = '青岚宗', back = '問道' } = {}) {
  const xi = 2.7, xo = 7.0, hi = 7.6, ho = 6.0;
  const pil = C.vermilion;
  for (const [x, h, r] of [[-xo, ho, 0.27], [-xi, hi, 0.31], [xi, hi, 0.31], [xo, ho, 0.27]]) {
    b.slab(1.15, 0.55, 1.15, C.stoneWarm, x, 0, 0, { mat: 'stone' });
    for (const s of [-1, 1]) {
      b.slab(0.62, 1.75, 0.78, C.stone, x, 0, s * 0.72, { mat: 'stoneSmooth' });
      b.slab(0.66, 0.12, 0.82, C.stoneWarm, x, 1.75, s * 0.72, { mat: 'stoneSmooth', col: false });
    }
    b.cyl(r, r * 1.04, h, pil, x, h / 2, 0, { seg: 14, mat: 'wood' });
  }
  const pd = 0.48;
  b.slab(2 * xi + 0.5, 0.42, pd, C.paintGreen, 0, 4.95, 0, { col: false });
  b.slab(2 * xi - 0.4, 1.2, 0.16, 0x31424c, 0, 5.37, 0, { col: false });
  b.slab(2 * xi + 0.6, 0.56, pd + 0.04, C.paintBlue, 0, 6.57, 0, { col: false });
  for (const s of [-1, 1]) b.slab(0.7, 0.56, pd + 0.06, C.gold, s * (xi - 0.55), 6.57, 0, { col: false, mat: 'gold' });
  b.slab(2 * xi + 0.8, 0.18, 0.62, C.woodRed, 0, 7.13, 0, { col: false, mat: 'wood' });
  for (const s of [-1, 1]) {
    const cx = s * (xi + xo) / 2, L = xo - xi;
    b.slab(L + 0.3, 0.36, pd, C.paintGreen, cx, 3.9, 0, { col: false });
    b.slab(L - 0.4, 0.62, 0.14, 0x31424c, cx, 4.26, 0, { col: false });
    for (let k = 0; k < 3; k++) b.slab(0.9, 0.34, 0.2, C.paintTeal, cx - L / 3 + k * L / 3, 4.4, 0, { col: false });
    b.slab(L + 0.4, 0.48, pd + 0.04, C.paintBlue, cx, 4.88, 0, { col: false });
    b.slab(L + 0.5, 0.16, 0.6, C.woodRed, cx, 5.36, 0, { col: false, mat: 'wood' });
  }
  for (let i = 0; i <= 6; i++) dougong(b, -2.4 + i * 0.8, 7.31, 0, 0.42, 0, true);
  for (const s of [-1, 1]) for (let i = 0; i <= 4; i++) dougong(b, s * (xi + 0.48 + i * 0.84), 5.52, 0, 0.36, 0, true);
  roofAssembly(b, 'xieshan', 8.2, 2.9, 1.32, 7.62, C.tileDark, 'glaze', { fish: true, gold: true, goldK: 0.55 });
  for (const s of [-1, 1]) {
    b.push(s * 4.95, 0, 0, 0);
    roofAssembly(b, 'xieshan', 5.1, 2.5, 1.0, 5.78, C.tileDark, 'glaze', { fish: false });
    b.pop();
  }
  b.collider(0, 7.4, 9.3, 0, 4.1, 1.4);
  for (const s of [-1, 1]) b.collider(s * 4.95, 5.6, 7.0, 0, 2.6, 1.25);
  // 匾额（正面「青岚宗」，背面「问道」）
  const p1 = plaqueMesh(front, 3.5, 1.05, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
  p1.position.set(0, 5.98, 0.18);
  b.addMesh(p1);
  const p2 = plaqueMesh(back, 2.4, 0.95, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
  p2.position.set(0, 5.98, -0.18);
  p2.rotation.y = Math.PI;
  b.addMesh(p2);
}

// ---------------- 民居单体（粉墙木构，悬山或硬山）----------------
// o: { w, d, h, bays, roof:'gable'|'gableWall'|'xieshan', porch, doors:[i], windowsBack, base, wall, frame, rcol, chimney }
export function house(b, o) {
  const w = o.w, d = o.d, h = o.h ?? 3.3, base = o.base ?? 0.42, porch = o.porch ?? 0, bays = o.bays ?? Math.max(1, Math.round(w / 3.4));
  const wall = o.wall ?? C.plaster, frame = o.frame ?? C.woodDark, rcol = o.rcol ?? C.tile, pillar = o.pillar ?? C.vermilion;
  const zf = d / 2 - porch, bw = w / bays;
  // 台基与踏步
  b.slab(w + 1.0, base - 0.12, d + 1.0, C.stone, 0, -0.25, 0, { mat: 'stone' });
  b.slab(w + 1.1, 0.12, d + 1.1, C.stoneWarm, 0, base - 0.12, 0, { mat: 'stoneSmooth' });
  const doors = o.doors ?? [Math.floor(bays / 2)];
  for (const i of doors) {
    const cx = -w / 2 + (i + 0.5) * bw;
    const n = Math.max(1, Math.round(base / 0.2));
    for (let k = 0; k < n; k++) b.slab(1.6, (base * (k + 1)) / n, 0.32, C.stoneWarm, cx, -0.1, d / 2 + 0.5 + (n - k) * 0.3 - 0.15, { mat: 'stoneSmooth' });
  }
  const y = base;
  // 墙体：下槛墙（石）+ 粉墙
  const zb = -d / 2;
  b.slab(w, 0.6, zf - zb, C.stoneDark, 0, y, (zf + zb) / 2, { mat: 'stone', col: false });
  b.slab(w - 0.04, h - 0.6, zf - zb - 0.04, wall, 0, y + 0.6, (zf + zb) / 2, { mat: 'std' });
  b.collider(0, y, y + h, (zf + zb) / 2, w / 2, (zf - zb) / 2);
  // 木构架外露（第九轮）：檐柱为半露于墙的朱红圆柱，上为额枋与由额垫板（深红）；山面中柱同样外露
  const ffz = zf + 0.03, bbz = zb - 0.03;
  for (let i = 0; i <= bays; i++) {
    const x = -w / 2 + i * bw;
    for (const zz of [ffz - 0.05, bbz + 0.05]) b.cyl(0.13, 0.14, h, pillar, x, y + h / 2, zz, { seg: 10, mat: 'wood', col: false });
  }
  for (const zz of [ffz, bbz]) {
    b.box(w + 0.14, 0.26, 0.14, C.woodRed, 0, y + h - 0.15, zz, { col: false, mat: 'wood' });
    b.box(w + 0.1, 0.1, 0.1, C.woodRed, 0, y + h - 0.4, zz, { col: false, mat: 'wood' });
  }
  for (const s of [-1, 1]) b.cyl(0.13, 0.14, h, pillar, s * (w / 2 - 0.02), y + h / 2, (zf + zb) / 2, { seg: 10, mat: 'wood', col: false });
  for (const s of [-1, 1]) b.box(0.14, 0.26, zf - zb + 0.14, C.woodRed, s * (w / 2 + 0.03), y + h - 0.15, (zf + zb) / 2, { col: false, mat: 'wood' });
  // 门窗
  for (let i = 0; i < bays; i++) {
    const cx = -w / 2 + (i + 0.5) * bw, iw = bw - 0.24;
    if (doors.includes(i)) {
      // 门：门槛、抱框、两扇格扇门、门上横披；门框上一对门簪
      b.slab(iw, 0.16, 0.12, frame, cx, y, ffz, { col: false, mat: 'wood' });
      for (const s of [-1, 1]) b.box(0.1, h - 0.3, 0.12, frame, cx + s * (iw * 0.4 + 0.05), y + (h - 0.3) / 2, ffz + 0.03, { col: false, mat: 'wood' });
      doorLeaves(b, cx, y + 0.16, ffz + 0.02, iw * 0.8, h - 0.75, { leaves: 2, frame, back: false });
      b.panel(iw * 0.8, 0.36, C.paper, cx, y + h - 0.42, ffz + 0.03);
      for (const s of [-1, 1]) b.cyl(0.05, 0.05, 0.12, frame, cx + s * iw * 0.18, y + h - 0.62, ffz + 0.09, { rx: Math.PI / 2, seg: 6, mat: 'wood', col: false });
    } else {
      // 槛窗（有进深的窗框、榻板、横披、棂格窗心退进框面）
      sillWindow(b, cx, y, ffz + 0.02, iw - 0.08, h - 0.47, { sill: 0.78, frame, wall: o.dado ?? C.stoneDark, back: false, wallMat: 'stone' });
    }
    if (o.windowsBack) b.panel(iw * 0.5, h * 0.22, C.paper, cx, y + h * 0.66, bbz - 0.02, { ry: Math.PI });
  }
  // 前廊
  if (porch > 0) {
    for (let i = 0; i <= bays; i++) {
      const x = -w / 2 + i * bw;
      columnBase(b, x, y, d / 2 - 0.2, 0.12);
      b.cyl(0.11, 0.12, h, pillar, x, y + h / 2, d / 2 - 0.2, { seg: 10, mat: 'wood' });
    }
    b.box(w + 0.1, 0.22, 0.12, C.woodRed, 0, y + h - 0.15, d / 2 - 0.2, { col: false, mat: 'wood' });
    if (o.railing) for (let i = 0; i < bays; i++) if (!doors.includes(i)) {
      const x0 = -w / 2 + i * bw + 0.15, x1 = x0 + bw - 0.3;
      woodRail(b, [[x0, d / 2 - 0.2], [x1, d / 2 - 0.2]], y, { h: 0.55, color: frame });
    }
  }
  // 屋顶
  const ov = o.over ?? 0.75, kind = o.roof ?? 'gable';
  const gw = kind === 'gableWall';
  const RW = gw ? w + 0.5 : w + ov * 2, RD = d + ov * 2, rh = o.rh ?? RD * 0.3;
  const ry0 = y + h + 0.05;
  if (kind === 'xieshan') roofAssembly(b, 'xieshan', RW + 0.4, RD, rh * 1.25, ry0, rcol, 'roof', { fish: false, gableColor: C.plasterWarm });
  else roofAssembly(b, 'gable', RW, RD, rh, ry0, rcol, 'roof', {});
  if (gw) for (const s of [-1, 1]) {
    // 硬山墙：山尖粉墙 + 墀头
    b.add(gableWallGeoCached(d + 0.3, rh * (d + 0.3) / RD + 0.06), wall, 'std', { x: s * (w / 2 + 0.12), y: ry0 - 0.02, ry: s > 0 ? Math.PI : 0, col: false });
    b.add(gableWallGeoCached(d + 0.3, rh * (d + 0.3) / RD + 0.06), wall, 'std', { x: s * (w / 2 + 0.12), y: ry0 - 0.02, ry: s > 0 ? 0 : Math.PI, col: false });
    b.slab(0.3, h + 0.05, d + 0.3, wall, s * (w / 2 + 0.12), y, 0, { col: false });
  }
  if (o.chimney) {
    const [cx, cz] = o.chimney;
    const top = ry0 + gableY(RD, rh, cz) + 0.9;
    b.slab(0.6, top - y, 0.6, C.brick, cx, y, cz, { mat: 'stone', col: false });
    b.slab(0.75, 0.15, 0.75, C.brickDark, cx, top, cz, { mat: 'stone', col: false });
    b.emitter('chimney', cx, top + 0.3, cz);
  }
  b.collider(0, ry0, ry0 + rh * 0.55, 0, RW / 2 * 0.95, RD / 2 * 0.9);
  return { top: ry0 + rh, floor: y, zf };
}
const gwCache = new Map();
function gableWallGeoCached(D, H) {
  const k = `${D.toFixed(2)}|${H.toFixed(2)}`;
  if (!gwCache.has(k)) {
    const g = new THREE.BufferGeometry(), E = D / 2, n = 8, pos = [];
    for (let i = 0; i < n; i++) {
      const z0 = -E + (i / n) * D, z1 = -E + ((i + 1) / n) * D;
      const y0 = H * Math.pow(1 - Math.abs(z0) / E, 1.35), y1 = H * Math.pow(1 - Math.abs(z1) / E, 1.35);
      pos.push(0, 0, z0, 0, 0, z1, 0, y1, z1, 0, 0, z0, 0, y1, z1, 0, y0, z0);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    gwCache.set(k, g);
  }
  return gwCache.get(k);
}

// 院墙（带瓦顶），从 (x0,z0) 到 (x1,z1)
export function yardWall(b, x0, z0, x1, z1, { h = 2.5, t = 0.42, color = C.plaster, base = C.stoneDark, roof = true } = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  if (L < 0.2) return;
  const ry = Math.atan2(-(z1 - z0), x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  b.slab(L, 0.55, t + 0.06, base, cx, 0, cz, { ry, mat: 'stone' });
  b.slab(L, h - 0.55, t, color, cx, 0.55, cz, { ry });
  if (roof) {
    b.push(cx, h, cz, ry);
    b.add(gableRoofGeo(L + 0.1, t + 0.75, 0.32), C.tile, 'roof', { col: false });
    b.box(L + 0.12, 0.14, 0.18, C.ridge, 0, 0.34, 0, { mat: 'roof', col: false });
    b.pop();
  }
}

// 院门（门楼）：两侧墙垛、门扇半掩、小悬山顶
export function yardGate(b, x, y, z, ry, { w = 2.4, h = 2.9, color = C.plaster, plaque = null, open = true } = {}) {
  b.push(x, y, z, ry);
  for (const s of [-1, 1]) {
    b.slab(0.55, h + 0.2, 0.9, color, s * (w / 2 + 0.27), 0, 0);
    b.slab(0.6, 0.55, 0.95, C.stoneDark, s * (w / 2 + 0.27), 0, 0, { mat: 'stone', col: false });
  }
  b.slab(w + 1.2, 0.3, 0.5, C.woodDark, 0, h - 0.3, 0, { col: false, mat: 'wood' });
  b.collider(0, h - 0.3, h + 0.6, 0, w / 2 + 0.6, 0.45);
  b.slab(w, 0.14, 0.5, C.stoneWarm, 0, 0, 0, { mat: 'stoneSmooth', col: false });
  if (open) for (const s of [-1, 1]) {
    b.push(s * (w / 2 - 0.05), 0, -0.1, 0);
    b.slab(0.08, h - 0.35, w / 2 - 0.1, C.woodRed, 0, 0.14, -(w / 4), { col: false, mat: 'wood', ry: s * 0.35 });
    b.pop();
  }
  b.push(0, h, 0, 0);
  roofAssembly(b, 'gable', w + 2.0, 2.2, 0.8, 0, C.tile, 'roof', { under: true });
  b.pop();
  b.collider(0, h, h + 0.9, 0, w / 2 + 1.0, 1.1);
  if (plaque) {
    const pm = plaqueMesh(plaque, 1.3, 0.5, { bg: '#2a2a28', fg: '#d9c48e', frame: '#5a4330', w: 400, h: 150 });
    pm.position.set(0, h - 0.62, 0.3);
    b.addMesh(pm);
  }
  b.pop();
}

// 月洞门（墙中圆门）
export function moonGateWall(b, x0, z0, x1, z1, { h = 3.0, t = 0.5, r = 1.35, color = C.plaster } = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  b.push(cx, 0, cz, ry);
  const side = (L - 2 * r - 0.4) / 2;
  for (const s of [-1, 1]) {
    b.slab(side, h, t, color, s * (r + 0.2 + side / 2), 0, 0);
    b.slab(side, 0.55, t + 0.06, C.stoneDark, s * (r + 0.2 + side / 2), 0, 0, { mat: 'stone', col: false });
  }
  // 圆洞四周：用挤出形状做墙心
  const sh = new THREE.Shape();
  sh.moveTo(-r - 0.2, 0); sh.lineTo(r + 0.2, 0); sh.lineTo(r + 0.2, h); sh.lineTo(-r - 0.2, h); sh.lineTo(-r - 0.2, 0);
  const hole = new THREE.Path();
  hole.absarc(0, r + 0.12, r, 0, Math.PI * 2, true);
  sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 24 });
  g.translate(0, 0, -t / 2);
  b.add(g, color, 'std', { col: false });
  b.add(new THREE.TorusGeometry(r, 0.07, 6, 32), C.stoneWarm, 'stoneSmooth', { y: r + 0.12, col: false, sz: t * 6 });
  b.collider(0, r * 2 + 0.1, h, 0, r + 0.2, t / 2);
  b.collider(-(r + 0.05), 0, h, 0, 0.2, t / 2);
  b.collider(r + 0.05, 0, h, 0, 0.2, t / 2);
  b.push(0, h, 0, 0);
  b.add(gableRoofGeo(L + 0.1, t + 0.8, 0.34), C.tile, 'roof', { col: false });
  b.box(L + 0.12, 0.14, 0.18, C.ridge, 0, 0.36, 0, { mat: 'roof', col: false });
  b.pop();
  b.pop();
}

// ---------------- 楼阁（藏经阁）：三层，腰檐 + 平座栏杆，顶为歇山 ----------------
export function tower(b, o = {}) {
  const w = o.w ?? 14, d = o.d ?? 10, levels = o.levels ?? 3, bays = o.bays ?? 5;
  const hs = o.hs ?? [4.6, 3.8, 3.5];
  const frame = o.frame ?? C.woodDark, wall = o.wall ?? C.plaster;
  const base = o.base ?? 1.2;
  b.slab(w + 4, base - 0.18, d + 4, C.stone, 0, -0.3, 0, { mat: 'stone' });
  b.slab(w + 4.2, 0.18, d + 4.2, C.stoneWarm, 0, base - 0.18, 0, { mat: 'stoneSmooth' });
  stairs(b, 0, 0, d / 2 + 2 + Math.round(base / 0.19) * 0.34, 4.2, base, { color: C.stone });
  let y = base, ww = w, dd = d;
  let top = 0;
  for (let l = 0; l < levels; l++) {
    const h = hs[l], bw = ww / bays;
    // 柱
    for (let i = 0; i <= bays; i++) for (const s of [-1, 1]) {
      const x = -ww / 2 + i * bw;
      b.cyl(0.17, 0.19, h, frame, x, y + h / 2, s * dd / 2, { seg: 10, mat: 'wood' });
    }
    for (const s of [-1, 1]) for (let j = 1; j < 3; j++) b.cyl(0.17, 0.19, h, frame, s * ww / 2, y + h / 2, -dd / 2 + (j * dd) / 3, { seg: 10, mat: 'wood' });
    // 墙与门窗：底层正面隔扇门，余为槛窗；侧后为粉墙配小窗
    for (let i = 0; i < bays; i++) {
      const cx = -ww / 2 + (i + 0.5) * bw, iw = bw - 0.36;
      if (l === 0 && i === Math.floor(bays / 2)) {
        b.slab(iw, 0.18, 0.16, frame, cx, y, dd / 2, { col: false, mat: 'wood' });
        doorLeaves(b, cx, y + 0.18, dd / 2, iw, h - 1.05, { frame });
        b.panel(iw, 0.6, C.paper, cx, y + h - 0.55, dd / 2 + 0.02);
      } else {
        sillWindow(b, cx, y, dd / 2, iw, h - 0.3, { frame, wall: l === 0 ? C.stoneDark : frame, sill: l === 0 ? 0.9 : 0.55, wallMat: l === 0 ? 'stone' : 'wood' });
      }
      b.panel(iw * 0.55, 0.9, C.paper, cx, y + h * 0.62, -dd / 2 - 0.22, { ry: Math.PI });
    }
    b.slab(ww, h - 0.3, 0.36, wall, 0, y, -dd / 2);
    for (const s of [-1, 1]) {
      b.slab(0.36, h - 0.3, dd, wall, s * ww / 2, y, 0);
      b.panel(1.0, 0.9, C.paper, s * (ww / 2 + 0.2), y + h * 0.6, 0, { ry: s * Math.PI / 2 });
    }
    b.collider(0, y, y + h, 0, ww / 2 + 0.2, dd / 2 + 0.2);
    // 梁枋
    for (const s of [-1, 1]) {
      b.slab(ww + 0.4, 0.34, 0.3, frame, 0, y + h - 0.34, s * dd / 2, { col: false, mat: 'wood' });
      b.slab(0.3, 0.34, dd + 0.4, frame, s * ww / 2, y + h - 0.34, 0, { col: false, mat: 'wood' });
    }
    y += h;
    if (l < levels - 1) {
      // 腰檐（四坡截顶）+ 平座
      const W = ww + 3.2, D = dd + 3.2, H = Math.min(W, D) * 0.36;
      b.add(hipRoofGeo(W, D, H, { tMax: 0.34 }), o.rcol ?? C.tile, 'roof', { y: y - 0.25, col: false });
      b.add(hipRoofGeo(W, D, H, { tMax: 0.34 }), C.woodUnder, 'under', { y: y - 0.37, col: false });
      const ring = y - 0.25 + H * Math.pow(0.34, 1.7);
      const nw = ww * (o.taper ?? 0.92), nd = dd * (o.taper ?? 0.92);
      b.slab(nw + 1.6, 0.22, nd + 1.6, frame, 0, ring, 0, { col: false, mat: 'wood' });
      for (let k = 0; k <= 8; k++) for (const s of [-1, 1]) dougong(b, -(nw + 1.2) / 2 + (k * (nw + 1.2)) / 8, ring - 0.4, s * (nd / 2 + 0.55), 0.3, s > 0 ? 0 : Math.PI, false);
      woodRail(b, [[-(nw + 1.4) / 2, (nd + 1.4) / 2], [(nw + 1.4) / 2, (nd + 1.4) / 2], [(nw + 1.4) / 2, -(nd + 1.4) / 2], [-(nw + 1.4) / 2, -(nd + 1.4) / 2]], ring + 0.22, { color: C.woodRed, closed: true });
      b.collider(0, y - 0.3, ring + 0.22, 0, W / 2 * 0.9, D / 2 * 0.9);
      // 楼层间每层挂匾、灯
      y = ring + 0.22;
      ww = nw; dd = nd;
    }
  }
  // 顶层歇山
  const W = ww + 3.4, D = dd + 3.4, Hr = Math.min(W, D) * 0.46;
  b.slab(ww + 0.6, 0.2, dd + 0.6, frame, 0, y, 0, { col: false, mat: 'wood' });
  for (let k = 0; k <= 8; k++) for (const s of [-1, 1]) dougong(b, -ww / 2 + (k * ww) / 8, y + 0.2, s * dd / 2, 0.36, s > 0 ? 0 : Math.PI, false);
  roofAssembly(b, 'xieshan', W, D, Hr, y + 0.46, o.rcol ?? C.tile, 'roof', { fish: false, gableColor: frame });
  b.collider(0, y + 0.4, y + 0.4 + Hr * 0.6, 0, W / 2 * 0.9, D / 2 * 0.9);
  top = y + 0.46 + Hr;
  if (o.plaque) {
    const pm = plaqueMesh(o.plaque, 3.0, 1.0, { bg: '#1e1d1b', fg: '#d9b86a', frame: '#4a3726' });
    pm.position.set(0, base + hs[0] - 0.85, d / 2 + 0.3);
    b.addMesh(pm);
  }
  return { top };
}

// ---------------- 回廊 ----------------
// 沿本地 X 从 0 到 L：宽 w，柱高 h；内侧（+Z）敞开，外侧（-Z）为坐凳栏杆；gaps 为外侧开口区间 [a, b]（沿 X），开口上方起一座小门罩
export function colonnade(b, L, o = {}) {
  const w = o.w ?? 3.6, h = o.h ?? 3.0, base = o.base ?? 0.3, gaps = o.gaps ?? [];
  const n = Math.max(1, Math.round(L / (o.bay ?? 3.3))), bw = L / n;
  const zi = w / 2 - 0.35, zo = -(w / 2 - 0.35);
  const pillar = o.pillar ?? C.vermilion, beamA = o.beam ?? C.paintBlue, beamB = o.beam2 ?? C.paintGreen;
  const inGap = (x) => gaps.some(([a, c]) => x > a - 0.2 && x < c + 0.2);
  // 台明（可走）与阶条石
  b.slab(L + 0.7, base, w + 0.5, C.stone, L / 2, -0.05, 0, { mat: 'stone' });
  b.slab(L + 0.8, 0.07, w + 0.6, C.marbleWarm, L / 2, base - 0.07, 0, { mat: 'stoneSmooth', col: false });
  for (let i = 0; i <= n; i++) {
    const x = i * bw;
    for (const z of [zi, zo]) {
      columnBase(b, x, base, z, 0.155);
      b.cyl(0.14, 0.155, h, pillar, x, base + h / 2, z, { seg: 10, mat: 'wood' });
    }
    b.slab(0.17, 0.26, w - 0.5, C.woodRed, x, base + h - 0.3, 0, { col: false, mat: 'wood' });   // 穿插枋
  }
  // 檐檩、额枋（彩画）与挂落
  for (const z of [zi, zo]) {
    b.slab(L + 0.36, 0.3, 0.22, beamA, L / 2, base + h - 0.32, z, { col: false });
    b.slab(L + 0.3, 0.13, 0.17, beamB, L / 2, base + h - 0.56, z, { col: false });
    for (let i = 0; i < n; i++) {
      const xm = (i + 0.5) * bw;
      if (o.gold !== false) b.slab(bw * 0.28, 0.2, 0.24, C.gold, xm, base + h - 0.27, z, { col: false, mat: 'gold' });
      // 挂落：额枋下的木格栅花边
      b.box(bw - 0.34, 0.05, 0.05, C.woodRed, xm, base + h - 0.92, z, { col: false, mat: 'wood' });
      for (let k = 1; k < 8; k++) b.box(0.035, 0.32, 0.035, C.woodRed, i * bw + 0.17 + (k * (bw - 0.34)) / 8, base + h - 0.76, z, { col: false, mat: 'wood' });
    }
  }
  b.slab(L + 0.4, 0.16, w - 0.2, C.woodDark, L / 2, base + h - 0.04, 0, { col: false, mat: 'wood' });
  // 坐凳栏杆（外侧）
  for (let i = 0; i < n; i++) {
    const xa = i * bw + 0.16, xb = (i + 1) * bw - 0.16, xm = (xa + xb) / 2;
    if (inGap(xm)) continue;
    b.slab(xb - xa, 0.08, 0.42, C.woodRed, xm, base + 0.42, zo + 0.05, { col: false, mat: 'wood' });
    b.slab(xb - xa, 0.42, 0.06, C.woodRed, xm, base, zo - 0.1, { col: false, mat: 'wood' });
    for (let k = 1; k < 6; k++) b.box(0.04, 0.34, 0.05, C.woodDark, xa + (k * (xb - xa)) / 6, base + 0.21, zo - 0.04, { col: false, mat: 'wood' });
    b.collider(xm, base, base + 0.9, zo, (xb - xa) / 2 + 0.05, 0.22, 0, { walk: false, cam: false });
  }
  // 卷棚屋面
  const RW = L + 1.3, RD = w + 2.1, rh = RD * 0.27;
  b.push(L / 2, base + h + 0.1, 0, 0);
  roofAssembly(b, 'juan', RW, RD, rh, 0, o.roofColor ?? C.tile, 'roof', {});
  b.pop();
  b.collider(L / 2, base + h, base + h + rh, 0, RW / 2, (RD / 2) * 0.9);
  // 开口处的门罩：垂直于回廊的小悬山，略高出廊顶
  for (const [a, c] of gaps) {
    const m = (a + c) / 2, gw = c - a + 1.6;
    b.push(m, base + h + 0.1, -0.2, Math.PI / 2);
    b.slab(w + 0.6, 0.55, 0.3, beamA, 0, rh * 0.55, 0, { col: false });
    roofAssembly(b, 'gable', w + 2.6, gw, gw * 0.3, rh * 0.75, o.roofColor ?? C.tile, 'roof', {});
    b.pop();
    b.collider(m, base + h, base + h + rh + 1.4, -0.2, gw / 2, ((w + 2.6) / 2) * 0.9);
  }
  return { top: base + h + rh };
}

// ---------------- 钟楼 / 鼓楼 ----------------
// 城台（前后各一座券洞装饰）+ 重檐歇山木楼
export function drumTower(b, o = {}) {
  const S = o.size ?? 9.4, bh = o.baseH ?? 4.4, aw = 2.6, ah = 3.3;
  // 城台：下碱 + 墙身 + 压面
  b.slab(S + 0.4, 0.5, S + 0.4, C.stoneDark, 0, -0.3, 0, { mat: 'stone', col: false });
  b.slab(S, bh - 0.35, S, C.stoneGrey, 0, 0, 0, { mat: 'stone' });
  b.slab(S + 0.3, 0.35, S + 0.3, C.marbleWarm, 0, bh - 0.35, 0, { mat: 'stoneSmooth', col: false });
  for (const s of [-1, 1]) {
    const z = s * (S / 2 + 0.01);
    b.box(aw, ah - aw / 2, 0.05, 0x2a2724, 0, (ah - aw / 2) / 2, z, { col: false });
    b.add(new THREE.CircleGeometry(aw / 2, 18, 0, Math.PI), 0x2a2724, 'std', { x: 0, y: ah - aw / 2, z: z + s * 0.01, ry: s > 0 ? 0 : Math.PI, col: false });
    b.add(new THREE.TorusGeometry(aw / 2 + 0.16, 0.16, 5, 18, Math.PI), C.marbleWarm, 'stoneSmooth', { x: 0, y: ah - aw / 2, z, col: false, sz: 0.6 });
  }
  // 城台顶宇墙（矮墙）
  for (const [x, z, sx, sz] of [[0, S / 2 - 0.2, S, 0.4], [0, -S / 2 + 0.2, S, 0.4], [S / 2 - 0.2, 0, 0.4, S], [-S / 2 + 0.2, 0, 0.4, S]]) {
    b.slab(sx, 0.75, sz, C.stoneGrey, x, bh, z, { mat: 'stone', col: false });
    b.slab(sx + 0.1, 0.1, sz + 0.1, C.marbleWarm, x, bh + 0.75, z, { mat: 'stoneSmooth', col: false });
  }
  b.push(0, bh, 0, 0);
  hall(b, { w: 6.4, d: 6.4, bays: 3, dbays: 3, h: 3.4, base: 0.3, margin: 0.6, stairs: false, roof: 'xieshan', eaves: 2, glaze: !!o.glaze,
    roofColor: o.roofColor ?? C.tile, wallColor: C.red, pillar: C.vermilion, frame: C.vermilion, sides: 'windows', front: 'windows', painted: true, dougong: true,
    overhang: 1.5, fish: false, plaque: o.plaque, plaqueStyle: { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' }, backWindows: false, roofOpts: { gold: true, goldK: 0.6 } });
  b.pop();
  return { top: bh + 12 };
}

// ---------------- 凌云阁：三重檐方阁（底层副阶周匝，二三层平座挑台，顶为攒尖宝顶）----------------
export function pavilionTower(b, o = {}) {
  const w0 = o.w ?? 11.2, levels = o.levels ?? 3, taper = o.taper ?? 0.78, vr = o.veranda ?? 2.0;
  const hs = o.hs ?? [5.0, 3.9, 3.5];
  const base = o.base ?? 1.1, pillar = o.pillar ?? C.vermilion;
  const rcol = o.roofColor ?? C.tileDark, rmat = o.glaze === false ? 'roof' : 'glaze';
  // 台基：四面踏步，台沿汉白玉栏杆（踏步处断开）
  const B = w0 + 2 * vr + 2.6, run = 0.34, nS = Math.max(1, Math.round(base / 0.18));
  b.slab(B, base - 0.18, B, C.marbleShade, 0, -0.25, 0, { mat: 'stone' });
  b.slab(B + 0.24, 0.18, B + 0.24, C.marble, 0, base - 0.18, 0, { mat: 'stoneSmooth' });
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2, d = B / 2 + nS * run + 0.1;
    stairs(b, Math.sin(a) * d, 0, Math.cos(a) * d, 3.6, base, { ry: a, color: C.marble, run, cheekW: 0.36 });
  }
  {
    const R = B / 2 - 0.25, g = 2.3;
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a);
      const P = (u) => [s * R + c * u, c * R - s * u];
      rail(b, [P(-R), P(-g)], base, { h: 0.8, color: C.marble, spacing: 1.5, post: 0.17 });
      rail(b, [P(g), P(R)], base, { h: 0.8, color: C.marble, spacing: 1.5, post: 0.17 });
    }
  }
  let y = base, ww = w0;
  for (let l = 0; l < levels; l++) {
    const h = hs[l], bays = 3, bw = ww / bays, rc = l === 0 ? 0.24 : 0.2;
    // 柱网（外圈）
    const ring = [];
    for (let i = 0; i <= bays; i++) {
      const t = -ww / 2 + i * bw;
      ring.push([t, ww / 2], [t, -ww / 2]);
      if (i > 0 && i < bays) ring.push([ww / 2, t], [-ww / 2, t]);
    }
    for (const [x, z] of ring) {
      columnBase(b, x, y, z, rc);
      b.cyl(rc * 0.92, rc, h, pillar, x, y + h / 2, z, { seg: 12, mat: 'wood' });
    }
    // 四面：中间一间隔扇门，两侧槛窗；额枋彩画（蓝绿相间，中段贴金）
    for (let side = 0; side < 4; side++) {
      b.push(0, 0, 0, (side * Math.PI) / 2);
      for (let i = 0; i < bays; i++) {
        const cx = -ww / 2 + (i + 0.5) * bw, iw = bw - 2 * rc, top = h - 0.75;
        b.panel(iw - 0.1, 0.5, C.paper, cx, y + h - 0.45, ww / 2 + 0.03);
        b.box(iw, 0.1, 0.12, C.vermilion, cx, y + top, ww / 2, { col: false, mat: 'wood' });
        if (i === 1 && (l === 0 || side === 0)) {
          b.slab(iw, 0.18, 0.18, C.vermilion, cx, y, ww / 2, { col: false, mat: 'wood' });
          doorLeaves(b, cx, y + 0.18, ww / 2, iw, top - 0.18, { frame: C.vermilion });
        } else sillWindow(b, cx, y, ww / 2, iw, top, { frame: C.vermilion, wall: C.red, wallMat: 'std' });
      }
      b.slab(ww + rc * 2, 0.46, rc * 1.4, C.paintBlue, 0, y + h - 0.46, ww / 2, { col: false });
      b.slab(ww + rc * 2, 0.24, rc * 1.2, C.paintGreen, 0, y + h - 0.78, ww / 2, { col: false });
      b.slab(ww * 0.22, 0.34, rc * 1.45, C.gold, 0, y + h - 0.4, ww / 2, { col: false, mat: 'gold' });
      b.pop();
    }
    b.collider(0, y, y + h, 0, ww / 2 + 0.25, ww / 2 + 0.25);
    // 斗拱一周
    b.slab(ww + rc * 3, 0.16, ww + rc * 3, C.woodRed, 0, y + h, 0, { col: false, mat: 'wood' });
    let yd = y + h + 0.16;
    const dgS = l === 0 ? 0.5 : 0.42;
    for (let side = 0; side < 4; side++) {
      b.push(0, 0, 0, (side * Math.PI) / 2);
      for (let i = 0; i <= bays * 2; i++) dougong(b, -ww / 2 + (i * bw) / 2, yd, ww / 2, dgS, 0, true);
      b.pop();
    }
    yd += 0.72 * dgS;
    if (l === 0 && vr > 0) {
      // 副阶周匝：外圈廊柱、额枋、坐凳栏杆（四面正中留口）
      const V = ww / 2 + vr, hv = h - 1.1, vb = 5, vbw = (2 * V) / vb;
      const seen = new Set();
      for (let i = 0; i <= vb; i++) {
        const t = -V + i * vbw;
        for (const [x, z] of [[t, V], [t, -V], [V, t], [-V, t]]) {
          const key = `${x.toFixed(2)},${z.toFixed(2)}`;
          if (seen.has(key)) continue;   // 角柱只放一次
          seen.add(key);
          columnBase(b, x, y, z, 0.18);
          b.cyl(0.16, 0.18, hv, pillar, x, y + hv / 2, z, { seg: 10, mat: 'wood' });
        }
      }
      for (let side = 0; side < 4; side++) {
        b.push(0, 0, 0, (side * Math.PI) / 2);
        b.slab(2 * V + 0.4, 0.34, 0.24, C.paintBlue, 0, y + hv - 0.34, V, { col: false });
        b.slab(2 * V + 0.3, 0.16, 0.2, C.paintGreen, 0, y + hv - 0.6, V, { col: false });
        for (let i = 0; i < vb; i++) {
          if (i === 2) continue;
          const xa = -V + i * vbw + 0.22, xb = xa + vbw - 0.44;
          woodRail(b, [[xa, V], [xb, V]], y, { h: 0.6, color: C.woodRed });
        }
        b.pop();
      }
      // 副阶腰檐：自外圈檐口斜上搭到主体墙身
      const W = 2 * V + 2.6, H = W * 0.36, tM = 1 - (ww + 0.6) / W;
      b.add(hipRoofGeo(W, W, H, { tMax: tM, lift: 0.2 }), rcol, rmat, { y: y + hv + 0.05, col: false });
      b.add(hipRoofGeo(W, W, H, { tMax: tM, lift: 0.2 }), C.paintTeal, 'under', { y: y + hv - 0.07, col: false });
      eaves(b, 'hip', W, W, H, y + hv + 0.05, { lift: 0.2 });
      hipCorners(b, W, H, y + hv + 0.05, tM, 0.2);
      b.collider(0, y + hv, y + hv + H * Math.pow(tM, 1.7) + 0.3, 0, (W / 2) * 0.95, (W / 2) * 0.95);
    }
    y = yd;
    if (l < levels - 1) {
      // 腰檐 + 平座挑台
      const W = ww + 3.4, H = W * 0.36, tM = 0.3;
      const skirt = !(l === 0 && vr > 0);
      const ey = y - 0.2;
      if (skirt) {
        b.add(hipRoofGeo(W, W, H, { tMax: tM, lift: 0.2 }), rcol, rmat, { y: ey, col: false });
        b.add(hipRoofGeo(W, W, H, { tMax: tM, lift: 0.2 }), C.paintTeal, 'under', { y: ey - 0.12, col: false });
        eaves(b, 'hip', W, W, H, ey, { lift: 0.2 });
        hipCorners(b, W, H, ey, tM, 0.2);
      }
      const ringY = skirt ? ey + H * Math.pow(tM, 1.7) : y + 0.1;
      const nw = ww * taper, P = nw + 1.7;
      b.slab(P + 0.2, 0.24, P + 0.2, C.woodRed, 0, ringY, 0, { col: false, mat: 'wood' });
      for (let side = 0; side < 4; side++) {
        b.push(0, 0, 0, (side * Math.PI) / 2);
        for (let k = 0; k <= 6; k++) dougong(b, -P / 2 + 0.3 + (k * (P - 0.6)) / 6, ringY - 0.42, P / 2 - 0.25, 0.32, 0, true);
        b.pop();
      }
      woodRail(b, [[-P / 2, P / 2], [P / 2, P / 2], [P / 2, -P / 2], [-P / 2, -P / 2]], ringY + 0.24, { color: C.vermilion, closed: true, h: 0.9 });
      b.collider(0, ey, ringY + 0.24, 0, (Math.max(W, P) / 2) * 0.92, (Math.max(W, P) / 2) * 0.92);
      y = ringY + 0.24;
      ww = nw;
    } else {
      // 顶层：攒尖宝顶（宝瓶 + 相轮）
      const W = ww + 4.2, H = W * 0.62;
      roofAssembly(b, 'pyramid', W, W, H, y, rcol, rmat, { lift: 0.26, gold: true, goldK: 0.9 });
      for (let k = 0; k < 3; k++) b.cyl(0.32 - k * 0.06, 0.36 - k * 0.06, 0.16, C.gold, 0, y + H + 2.0 + k * 0.32, 0, { mat: 'gold', col: false, seg: 12 });
      b.sphere(0.3, C.gold, 0, y + H + 3.1, 0, { mat: 'gold', sy: 1.3 });
      b.cyl(0.03, 0.06, 1.1, C.gold, 0, y + H + 3.9, 0, { mat: 'gold', col: false });
      b.collider(0, y, y + H * 0.55, 0, (W / 2) * 0.85, (W / 2) * 0.85);
      y += H + 4.4;
    }
  }
  if (o.plaque) {
    const pm = plaqueMesh(o.plaque, 2.6, 1.0, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
    pm.position.set(0, base + hs[0] + 0.25, w0 / 2 + 0.36);
    b.addMesh(pm);
  }
  return { top: y };
}

// 庑殿腰檐四角的戗脊（随起翘）
function hipCorners(b, W, H, y, tM, lift) {
  for (const ln of hipCornerLines(W, W, H, y, { tMax: tM, lift, n: 5 })) {
    ridgeAlong(b, ln.pts, 0.26, C.ridge, 'roof', 0.12);
    const [ex, ey, ez] = ln.pts[0];
    goldCurl(b, ex * 0.985, ey + 0.2, ez * 0.985, Math.min(1, W / 14));
  }
}

// ---------------- 须弥座台壁 ----------------
// 沿本地 X（xa→xb）的一段台壁：内侧台面在 z<0，外壁朝 +Z；H 为台高；顶面与台面齐平；上设汉白玉栏杆，望柱下出螭首
export function sumeruWall(b, xa, xb, H, o = {}) {
  const L = xb - xa, xm = (xa + xb) / 2, t = o.t ?? 1.06, withRail = o.rail !== false;
  const M = C.marble, Ms = C.marbleShade, Mw = C.marbleWarm;
  const layer = (y0, y1, d, col, mat = 'stoneSmooth', solid = false) => b.slab(L, y1 - y0, d, col, xm, y0, d / 2, { mat, col: solid ? 'box' : false, walk: false, cam: false });
  layer(-0.35, 0.45, t + 0.38, Ms, 'stone');                // 圭脚
  layer(0.45, 0.8, t + 0.26, Mw);                           // 下枋
  layer(0.8, 1.0, t + 0.14, M);                             // 下枭
  layer(1.0, H - 1.25, t, Ms, 'stone', true);               // 束腰
  layer(H - 1.25, H - 1.05, t + 0.14, M);                   // 上枭
  layer(H - 1.05, H - 0.55, t + 0.26, Mw);                  // 上枋
  layer(H - 0.55, H, t + 0.34, M);                          // 台帮压面
  b.collider(xm, -0.35, H, (t + 0.38) / 2, L / 2, (t + 0.38) / 2, 0, { walk: false, cam: false });
  // 束腰：间柱与壶门浮雕板
  const n = Math.max(1, Math.round(L / 3.1)), pw = L / n;
  for (let i = 0; i <= n; i++) b.slab(0.42, H - 2.25, 0.08, Mw, xa + i * pw, 1.0, t + 0.04, { mat: 'stoneSmooth', col: false });
  for (let i = 0; i < n; i++) {
    const cx = xa + (i + 0.5) * pw, ph = H - 2.85;
    b.slab(pw - 0.9, ph, 0.04, 0xb2aa98, cx, 1.3, t + 0.02, { mat: 'stoneSmooth', col: false });
    b.add(new THREE.TorusGeometry(Math.min(0.9, ph * 0.28), 0.06, 4, 16, Math.PI), Mw, 'stoneSmooth', { x: cx, y: 1.3 + ph * 0.55, z: t + 0.05, col: false });
  }
  // 螭首（望柱下）与栏杆
  const m = Math.max(1, Math.round(L / 1.75));
  for (let i = 0; i <= m; i++) {
    const x = xa + (i * L) / m;
    b.box(0.26, 0.24, 0.62, Mw, x, H - 0.8, t + 0.5, { mat: 'stoneSmooth', col: false });
    b.box(0.2, 0.16, 0.2, Mw, x, H - 0.86, t + 0.86, { mat: 'stoneSmooth', col: false, rx: 0.4 });
  }
  if (withRail) rail(b, [[xa + 0.2, t * 0.55], [xb - 0.2, t * 0.55]], H, { h: 0.95, spacing: L / m, color: M, post: 0.2 });
}

// ---------------- 镇岳塔：八角七级楼阁式塔（白墙朱柱、每级出檐，顶为塔刹）----------------
export function pagoda(b, o = {}) {
  const levels = o.levels ?? 7, R0 = o.r ?? 4.6, rot = Math.PI / 8;
  const rcol = o.roofColor ?? C.tileDark, rmat = o.glaze === false ? 'roof' : 'glaze';
  // 八角须弥座
  b.cyl(R0 + 1.6, R0 + 1.9, 0.6, C.marbleShade, 0, 0.0, 0, { seg: 8, mat: 'stone', ry: rot });
  b.cyl(R0 + 1.3, R0 + 1.45, 1.0, C.marbleWarm, 0, 0.8, 0, { seg: 8, mat: 'stoneSmooth', ry: rot });
  b.cyl(R0 + 1.6, R0 + 1.5, 0.25, C.marble, 0, 1.42, 0, { seg: 8, mat: 'stoneSmooth', ry: rot, col: false });
  let y = 1.55;
  for (let l = 0; l < levels; l++) {
    const r = R0 * (1 - l * 0.075), h = l === 0 ? 5.0 : 3.5 - l * 0.12;
    // 塔身：八角白墙，转角朱柱，四正面开券门（暗），四斜面置窗
    b.cyl(r, r, h, C.plaster, 0, y + h / 2, 0, { seg: 8, ry: rot, mat: 'std' });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, ri = r * Math.cos(Math.PI / 8) + 0.03;   // 圆柱半径为外接圆，面距为内切圆
      b.cyl(0.16, 0.18, h, C.vermilion, Math.cos(a + rot) * r, y + h / 2, Math.sin(a + rot) * r, { seg: 6, mat: 'wood', col: false });
      const fa = a + Math.PI / 8 + rot, fx = Math.cos(fa) * ri, fz = Math.sin(fa) * ri, ry = Math.PI / 2 - fa;
      if (k % 2 === 0) {
        b.box(1.1, h * 0.52, 0.06, 0x2a2724, fx, y + h * 0.36, fz, { ry, col: false });
        b.add(new THREE.CircleGeometry(0.55, 12, 0, Math.PI), 0x2a2724, 'std', { x: fx, y: y + h * 0.62, z: fz, ry, col: false });
      } else b.panel(0.9, h * 0.3, C.paper, fx, y + h * 0.55, fz, { ry });
    }
    // 额枋与斗拱带
    b.cyl(r + 0.12, r + 0.12, 0.34, C.paintBlue, 0, y + h - 0.17, 0, { seg: 8, ry: rot, col: false });
    b.cyl(r + 0.32, r + 0.2, 0.36, C.woodRed, 0, y + h + 0.18, 0, { seg: 8, ry: rot, col: false, mat: 'wood' });
    y += h + 0.36;
    // 出檐：八角屋面下段（截顶），起翘；最上一级为攒尖顶
    const W = r + 1.9;
    if (l < levels - 1) {
      const H = W * 0.62, tM = 0.42;
      b.add(pyramidRoofGeo(8, W, H, { tMax: tM, lift: 0.3, rot: 0 }), rcol, rmat, { y, col: false, ry: rot });
      b.add(pyramidRoofGeo(8, W, H, { tMax: tM, lift: 0.3, rot: 0 }), C.paintTeal, 'under', { y: y - 0.1, col: false, ry: rot });
      y += H * Math.pow(tM, 1.6) * 0.92;
    } else {
      const H = W * 1.05;
      b.push(0, 0, 0, rot);
      roofAssembly(b, 'oct', 2 * W * Math.cos(Math.PI / 8), 0, H, y, rcol, rmat, { lift: 0.3, eaves: false });
      b.pop();
      // 塔刹：覆钵、相轮七重、宝珠
      b.sphere(0.6, C.gold, 0, y + H + 1.0, 0, { mat: 'gold', sy: 0.6 });
      for (let k = 0; k < 7; k++) b.cyl(0.42 - k * 0.04, 0.46 - k * 0.04, 0.14, C.gold, 0, y + H + 1.5 + k * 0.42, 0, { mat: 'gold', col: false, seg: 12 });
      b.cyl(0.08, 0.1, 3.6, C.gold, 0, y + H + 2.9, 0, { mat: 'gold', col: false });
      b.sphere(0.36, C.gold, 0, y + H + 5.0, 0, { mat: 'gold' });
      y += H + 5.4;
    }
  }
  b.cylCollider(0, 0, y, 0, R0 + 1.3, { walk: false });
  b.collider(0, 1.5, y - 6, 0, R0 * 0.75, R0 * 0.75, 0, { walk: false, cam: true });
  return { top: y };
}

// ---------------- 叠落廊（爬山廊）----------------
// 本地坐标：底端在 z=0、地面 y=0，沿 -Z 上升；分段方案 P 来自 layout.corridorPlan（n 段、每段长 bay、各段地面高 floors，段首踏步）。
// 每段一顶卷棚（逐段叠落），两侧朱柱、槛墙（墙上开漏窗），两端敞口；P.open 中的 [段, 侧] 不砌槛墙，改为通向台地的门槛石。
export function climbCorridor(b, P, o = {}) {
  const w = o.w ?? 3.6, h = o.h ?? 2.9, { n, bay, floors, ns, run, Ls } = P;
  const hw = w / 2, wallT = 0.26, pillar = o.pillar ?? C.vermilion;
  const f = (i) => floors[Math.max(0, Math.min(n - 1, i))];
  const foot = (i) => Math.min(f(i - 1), f(i)) - 1.6;      // 台基底（盖住地形）
  const isOpen = (i, s) => P.open.some(([k, sd]) => k === i && sd === s);
  for (let i = 0; i < n; i++) {
    const z0 = -i * bay, z1 = -(i + 1) * bay, y = f(i), zc = (z0 + z1) / 2;
    // 踏步（段首）与平台
    let zf = z0;
    if (i > 0 && f(i) > f(i - 1)) {
      const dh = f(i) - f(i - 1);
      for (let k = 0; k < ns; k++) {
        const top = f(i - 1) + ((k + 1) * dh) / ns;
        b.slab(w - 2 * wallT, top - foot(i), run + 0.02, C.marble, 0, foot(i), z0 - (k + 0.5) * run, { mat: 'stoneSmooth', jitter: 0.06 });
      }
      zf = z0 - Ls;
    }
    b.slab(w - 2 * wallT, y - foot(i), zf - z1, C.stone, 0, foot(i), (zf + z1) / 2, { mat: 'stoneSmooth' });
    for (const s of [-1, 1]) {
      // 台明（两侧露出的石台边）
      b.slab(0.34, y + 0.06 - foot(i), bay + 0.02, C.marbleShade, s * (hw - 0.05), foot(i), zc, { mat: 'stone', col: false });
      const wx = s * (hw - wallT / 2);
      if (isOpen(i, s)) {
        // 侧门：门槛石伸出廊外，与台地齐平
        b.slab(2.0, 0.5, bay - 0.5, C.marbleWarm, s * (hw + 0.45), y - 0.5, zc, { mat: 'stoneSmooth' });   // 与廊内地面搭接，不留缝
        continue;
      }
      // 槛墙（粉墙 + 压顶），每段一截；墙上漏窗
      b.slab(wallT, 0.86, bay, C.plaster, wx, y, zc, { col: false });
      b.slab(wallT + 0.1, 0.08, bay + 0.02, C.marbleWarm, wx, y + 0.86, zc, { mat: 'stoneSmooth', col: false });
      if (i % 2 === 1) b.panel(0.7, 0.42, C.paper, wx + s * (wallT / 2 + 0.01), y + 0.46, zc, { ry: s * Math.PI / 2 });
      b.collider(wx, y - 0.3, y + 1.0, zc, wallT / 2 + 0.04, bay / 2, 0, { walk: false, cam: false });
    }
    // 卷棚顶（逐段叠落）：屋脊沿廊身
    b.push(0, y + h + 0.12, zc, Math.PI / 2);
    roofAssembly(b, 'juan', bay + 0.42, w + 1.9, (w + 1.9) * 0.27, 0, o.roofColor ?? C.tile, 'roof', {});
    b.pop();
    for (const s of [-1, 1]) {
      b.slab(0.2, 0.3, bay + 0.2, C.paintBlue, s * (hw - 0.22), y + h - 0.3, zc, { col: false });
      b.slab(0.16, 0.14, bay, C.paintGreen, s * (hw - 0.22), y + h - 0.5, zc, { col: false });
    }
    b.slab(w - 0.4, 0.14, bay, C.woodDark, 0, y + h - 0.02, zc, { col: false, mat: 'wood' });
    b.collider(0, y + h, y + h + 0.9, zc, ((w + 1.9) / 2) * 0.9, bay / 2, 0, { walk: false });
    // 挂落
    for (const s of [-1, 1]) for (let k = 1; k < 6; k++) b.box(0.035, 0.3, 0.035, C.woodRed, s * (hw - 0.22), y + h - 0.68, z0 - (k * bay) / 6, { col: false, mat: 'wood' });
  }
  // 柱：每段交界处，底在较低一段，顶到较高一段的檐下
  for (let i = 0; i <= n; i++) {
    const z = -i * bay, lo = Math.min(f(i - 1), f(i)), hi = Math.max(f(i - 1), f(i));
    for (const s of [-1, 1]) {
      const x = s * (hw - 0.22);
      b.cyl(0.21, 0.23, 0.18, C.marbleWarm, x, lo + 0.09, z, { seg: 8, mat: 'stoneSmooth', col: false });
      b.cyl(0.13, 0.145, hi + h - lo, pillar, x, lo + (hi + h - lo) / 2, z, { seg: 10, mat: 'wood' });
    }
  }
  return P;
}
