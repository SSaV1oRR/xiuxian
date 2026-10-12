// 跨谷石拱桥：桥身侧面轮廓（上沿为桥面底，下沿随地形，开出拱券）挤出成一个实体——拱腹、桥墩、两侧桥面墙一次成形；
// 拱券两面凸出一圈券石（券脸）与龙门石，桥面铺石，两侧汉白玉栏杆，望柱头鎏金。本地 +X 沿桥长，桥面顶为 y = 0。
import * as THREE from 'three';
import { C } from './builder.js';
import { rail } from './arch.js';

// o: { len, w, ground(u) → 桥下地面（相对桥面），arches: [{ c, span, rise }]（c 为拱中心的 u），ring 券石厚 }
export function archBridge(b, o) {
  const L = o.len, w = o.w ?? 5, hw = w / 2, ring = o.ring ?? 0.55, deckT = 0.45;
  const crown = -(deckT + ring + 0.12);                     // 拱腹顶（券石之下）
  const arches = (o.arches || []).map((a) => {
    const R = (a.span * a.span / 4 + a.rise * a.rise) / (2 * a.rise), spring = crown - a.rise;
    return { ...a, R, spring, cy: spring + a.rise - R };       // 圆心高度
  });
  const arcY = (A, u) => A.cy + Math.sqrt(Math.max(0, A.R * A.R - (u - A.c) ** 2));
  const inArch = (u) => arches.find((A) => Math.abs(u - A.c) < A.span / 2);
  // 侧面轮廓：上沿从左到右，下沿从右到左（随地形下埋 0.8 米；拱内取拱腹与地面的较高者）
  const shape = new THREE.Shape();
  shape.moveTo(-L / 2, -deckT + 0.02);
  shape.lineTo(L / 2, -deckT + 0.02);
  const n = Math.ceil(L / 0.5);
  const bottom = (u) => {
    const g = o.ground(u) - 0.8, A = inArch(u);
    return Math.min(A ? Math.max(arcY(A, u), g) : g, -deckT - 0.3);
  };
  // 采样点：均匀分布 + 各拱脚内外两侧（桥墩竖直）；自右向左
  const us = [];
  for (let i = 0; i <= n; i++) us.push(-L / 2 + (L * i) / n);
  for (const A of arches) for (const s of [-1, 1]) { const e = A.c + s * A.span / 2; if (Math.abs(e) < L / 2) us.push(e - 0.002, e + 0.002); }
  us.sort((p, q) => q - p);
  for (const u of us) shape.lineTo(u, bottom(u));
  shape.closePath();
  const body = new THREE.ExtrudeGeometry(shape, { depth: w - 0.3, bevelEnabled: false, steps: 1, curveSegments: 4 });
  body.translate(0, 0, -(w - 0.3) / 2);
  b.add(body, o.color ?? C.stone, 'stone', { col: false });
  // 券脸：拱券两面凸出的一圈券石，正中龙门石
  for (const A of arches) {
    const a0 = Math.asin(Math.min(1, (A.span / 2) / A.R));
    const rs = new THREE.Shape();
    const seg = 24;
    for (let i = 0; i <= seg; i++) { const t = -a0 + (2 * a0 * i) / seg; const px = A.c + Math.sin(t) * (A.R + ring), py = A.cy + Math.cos(t) * (A.R + ring); if (i) rs.lineTo(px, py); else rs.moveTo(px, py); }
    for (let i = seg; i >= 0; i--) { const t = -a0 + (2 * a0 * i) / seg; rs.lineTo(A.c + Math.sin(t) * A.R, A.cy + Math.cos(t) * A.R); }
    rs.closePath();
    const rg = new THREE.ExtrudeGeometry(rs, { depth: 0.16, bevelEnabled: false, curveSegments: 2 });
    for (const s of [-1, 1]) b.add(rg, o.ringColor ?? C.stoneWarm, 'stoneSmooth', { z: s > 0 ? hw - 0.15 : -hw + 0.15 - 0.16, col: false });
    for (const s of [-1, 1]) b.box(0.62, ring + 0.3, 0.26, o.ringColor ?? C.marbleWarm, A.c, A.cy + A.R + ring / 2 + 0.05, s * (hw - 0.08), { mat: 'stoneSmooth', col: false });
  }
  // 桥面：铺石（可走），两侧压面石
  b.slab(L, deckT, w, o.deckColor ?? C.stoneWarm, 0, -deckT, 0, { mat: 'stoneSmooth', jitter: 0.04 });
  for (const s of [-1, 1]) b.slab(L + 0.2, 0.16, 0.5, C.marbleShade, 0, -0.02, s * (hw - 0.05), { mat: 'stoneSmooth', col: false });
  // 栏杆（汀白玉），望柱头每隔一根鎏金
  for (const s of [-1, 1]) {
    rail(b, [[-L / 2 + 0.3, s * (hw - 0.22)], [L / 2 - 0.3, s * (hw - 0.22)]], 0.14, { h: 0.95, spacing: 1.9, color: o.railColor ?? C.marble });
    const np = Math.max(1, Math.round((L - 0.6) / 1.9));
    for (let k = 0; k <= np; k += 2) b.sphere(0.13, C.gold, -L / 2 + 0.3 + ((L - 0.6) * k) / np, 0.14 + 1.25, s * (hw - 0.22), { mat: 'gold', seg: 10, seg2: 6 });
  }
  // 桥头抱鼓石
  for (const e of [-1, 1]) for (const s of [-1, 1]) {
    const u = e * (L / 2 + 0.25);
    b.slab(0.62, 0.45, 0.42, C.marbleWarm, u, 0, s * (hw - 0.22), { mat: 'stoneSmooth' });
    b.cyl(0.38, 0.38, 0.32, C.marbleWarm, u + e * 0.05, 0.85, s * (hw - 0.22), { rx: Math.PI / 2, mat: 'stoneSmooth', col: false, seg: 14 });
  }
  return { arches };
}

// 便捷：沿世界坐标的两点（同高）造桥。p0、p1：[x, z]，y 桥面标高，ground(x, z) 世界地形
export function bridgeBetween(b, p0, p1, y, ground, o = {}) {
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
  const cx = (p0[0] + p1[0]) / 2, cz = (p0[1] + p1[1]) / 2;
  const groundU = (u) => ground(cx + ux * u, cz + uz * u) - y;
  b.push(cx, y, cz, Math.atan2(-uz, ux));
  const info = archBridge(b, { ...o, len: L, ground: groundU });
  b.pop();
  return { ...info, cx, cz, ry: Math.atan2(-uz, ux), L };
}
