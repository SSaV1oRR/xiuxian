// 西翼生活区与藏经阁院（第八轮）：
//   叠落廊：台地之间的石阶上加盖爬山廊（每段一座两坡小顶、逐段跌落；朱柱、额枋、挂落、廊下宫灯）——即“侧廊”，雨天也走得通；
//   膳堂灶间：膳堂西山墙外的灶屋（敞口朝院：砖灶、铁锅、蒸笼、案板、水缸，屋上烟囱冒烟）；
//   晒书架：藏经阁读书前庭里晾晒典籍的木架（竹匾上摊着线装书与卷轴）。
import * as THREE from 'three';
import { C } from './builder.js';
import { roofAssembly, beam, woodRail } from './arch.js';

// 叠落廊：沿台阶（低端 lo → 高端 hi，[x, z, y]），w 为台阶净宽
export function stairGallery(b, lo, hi, w, { segLen = 2.6, clear = 2.55, roofCol = C.tile } = {}) {
  const [lx, lz, ly] = lo, [hx, hz, hy] = hi;
  const dx = hx - lx, dz = hz - lz, L = Math.hypot(dx, dz), rise = hy - ly, ry = Math.atan2(-dx, -dz);
  const n = Math.max(2, Math.round(L / segLen)), sl = L / n, px = w / 2 + 0.48;
  const yAt = (u) => (rise * Math.min(L, Math.max(0, u))) / L;
  const eave = (k) => yAt((k + 1) * sl) + clear;            // 第 k 段的檐口高度（高端净空 clear）
  b.push(lx, ly, lz, ry);                                     // 本地：自低端沿 -Z 上行
  for (let k = 0; k <= n; k++) {
    const u = k * sl, y0 = yAt(u) - 0.12, top = Math.max(k > 0 ? eave(k - 1) : 0, k < n ? eave(k) : 0);
    for (const s of [-1, 1]) {
      b.slab(0.4, 0.2, 0.4, C.stoneWarm, s * px, y0, -u, { mat: 'stoneSmooth', col: false });
      b.cyl(0.13, 0.14, top - y0, C.vermilion, s * px, y0 + (top - y0) / 2, -u, { seg: 10, mat: 'wood' });
    }
    b.slab(2 * px + 0.3, 0.22, 0.2, C.woodRed, 0, top - 0.22, -u, { mat: 'wood', col: false });     // 穿插枋
  }
  for (let k = 0; k < n; k++) {
    const u0 = k * sl, u1 = (k + 1) * sl, e = eave(k), um = (u0 + u1) / 2;
    // 檐檩、额枋、挂落（两侧）
    for (const s of [-1, 1]) {
      b.box(sl + 0.3, 0.26, 0.2, C.paintBlue, s * px, e - 0.13, -um, { col: false });
      b.box(sl - 0.3, 0.05, 0.05, C.woodRed, s * px, e - 0.62, -um, { col: false, mat: 'wood' });
      for (let q = 1; q < 6; q++) b.box(0.035, 0.32, 0.035, C.woodRed, s * px, e - 0.46, -(u0 + 0.15 + (q * (sl - 0.3)) / 6), { col: false, mat: 'wood' });
      // 外侧坐凳栏杆（沿坡）
      beam(b, s * (px + 0.02), yAt(u0) + 0.5, -u0 - 0.2, s * (px + 0.02), yAt(u1) + 0.5, -u1 + 0.2, 0.09, C.woodRed, 'wood');
    }
    // 两坡小顶：脊沿台阶方向，逐段跌落（前后相叠 0.25 米）
    b.push(0, e + 0.05, -um, Math.PI / 2);
    roofAssembly(b, 'gable', sl + 0.5, 2 * px + 1.5, (2 * px + 1.5) * 0.28, 0, roofCol, 'roof', {});
    b.pop();
    b.collider(0, e, e + 1.0, -um, px + 0.75, sl / 2 + 0.25, 0, { walk: false });
  }
  b.pop();
  return { n, ry, L };
}

// 灶屋：本地原点为地面中心，敞口朝 +Z；w 宽、d 深
export function kitchenShed(b, w = 4.4, d = 6.2, rand = Math.random) {
  const h = 3.0;
  b.slab(w + 0.6, 0.3, d + 0.6, C.stone, 0, -0.1, 0, { mat: 'stone' });
  // 三面墙（粉墙、石墙裙），前檐两柱
  b.slab(w, h, 0.3, C.plaster, 0, 0.2, -d / 2 + 0.15, { mat: 'std' });
  for (const s of [-1, 1]) b.slab(0.3, h, d - 0.3, C.plaster, s * (w / 2 - 0.15), 0.2, 0.15, { mat: 'std' });
  b.slab(w + 0.02, 0.6, 0.32, C.stoneDark, 0, 0.2, -d / 2 + 0.15, { mat: 'stone', col: false });
  for (const s of [-1, 1]) { b.cyl(0.12, 0.13, h, C.woodDark, s * (w / 2 - 0.2), 0.2 + h / 2, d / 2 - 0.2, { seg: 8, mat: 'wood' }); }
  b.box(w + 0.1, 0.2, 0.14, C.woodDark, 0, 0.2 + h - 0.1, d / 2 - 0.2, { mat: 'wood', col: false });
  // 灶台：砖砌两眼灶、铁锅、锅盖、蒸笼三层；灶口火光
  const gz = -d / 2 + 1.1;
  b.slab(w - 0.8, 0.85, 1.4, C.brickWarm, 0, 0.2, gz, { mat: 'stone' });
  b.slab(w - 0.7, 0.08, 1.5, C.stoneDark, 0, 1.05, gz, { mat: 'stoneSmooth', col: false });
  for (const s of [-1, 1]) {
    b.add(new THREE.SphereGeometry(0.42, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), C.black, 'bronze', { x: s * 0.85, y: 1.12, z: gz, col: false });
    b.box(0.36, 0.28, 0.04, 0xff9040, s * 0.85, 0.42, gz + 0.71, { mat: 'glow', col: false });
  }
  for (let k = 0; k < 3; k++) b.cyl(0.4, 0.4, 0.18, C.bambooDry, 0.85, 1.14 + k * 0.19, gz, { seg: 14, col: false });
  b.cyl(0.42, 0.4, 0.08, C.woodLight, -0.85, 1.14, gz, { seg: 14, mat: 'wood', col: false });
  // 案板、刀、菜筐；墙上挂的勺、笊篱
  b.slab(1.6, 0.08, 0.7, C.wood, -w / 2 + 1.1, 0.95, 0.8, { mat: 'wood' });
  for (const [sx, sz] of [[-0.7, -0.28], [0.7, -0.28], [-0.7, 0.28], [0.7, 0.28]]) b.slab(0.07, 0.75, 0.07, C.woodDark, -w / 2 + 1.1 + sx, 0.2, 0.8 + sz, { mat: 'wood', col: false });
  b.slab(0.5, 0.06, 0.32, C.woodLight, -w / 2 + 1.0, 1.03, 0.75, { mat: 'wood', col: false });
  for (let k = 0; k < 3; k++) b.cyl(0.015, 0.015, 0.5, C.woodDark, -0.6 + k * 0.4, 2.2, -d / 2 + 0.34, { seg: 4, col: false });
  for (let k = 0; k < 3; k++) b.cyl(0.08 + k * 0.01, 0.08 + k * 0.01, 0.03, C.bronze, -0.6 + k * 0.4, 1.92, -d / 2 + 0.36, { rx: Math.PI / 2, seg: 10, mat: 'bronze', col: false });
  // 烟囱（灶后墙外）
  b.slab(0.8, h + 2.6, 0.8, C.brick, 0, 0.2, -d / 2 - 0.3, { mat: 'stone' });
  b.slab(1.0, 0.18, 1.0, C.brickDark, 0, 0.2 + h + 2.6, -d / 2 - 0.3, { mat: 'stone', col: false });
  b.emitter('chimney', 0, h + 3.4, -d / 2 - 0.3, { rate: 1.2 });
  // 单坡顶（前高后低反过来：后高前低，排烟）
  b.push(0, 0.2 + h + 0.05, 0, 0);
  roofAssembly(b, 'gable', w + 0.9, d + 1.0, (d + 1.0) * 0.28, 0, C.tile, 'roof', {});
  b.pop();
  b.collider(0, 0.2 + h, 0.2 + h + 1.6, 0, (w + 0.9) / 2, (d + 1.0) / 2);
}

// 晒书架：两层木架、竹匾，摊着线装书与卷轴（本地沿 X）
export function bookRack(b, x, y, z, ry, rand = Math.random) {
  b.push(x, y, z, ry);
  for (const sx of [-1.2, 1.2]) for (const sz of [-0.45, 0.45]) b.slab(0.08, 1.25, 0.08, C.woodDark, sx, 0, sz, { mat: 'wood', col: false });
  for (const yy of [0.55, 1.15]) {
    b.slab(2.6, 0.05, 1.05, C.woodDark, 0, yy, 0, { mat: 'wood', col: false });
    b.cyl(0.5, 0.5, 0.04, C.bambooDry, -0.62, yy + 0.05, 0, { seg: 16, col: false, sz: 0.9 });
    b.cyl(0.5, 0.5, 0.04, C.bambooDry, 0.62, yy + 0.05, 0, { seg: 16, col: false, sz: 0.9 });
    for (let k = 0; k < 4; k++) {
      const bx = -0.62 + (k % 2) * 1.24 + (rand() - 0.5) * 0.3, bz = (rand() - 0.5) * 0.4;
      b.slab(0.24, 0.035, 0.32, k % 2 ? 0xe6dcc0 : 0xd9cba4, bx, yy + 0.09, bz, { col: false, ry: rand() });
      b.slab(0.24, 0.012, 0.32, 0x3e5a72, bx, yy + 0.125, bz, { col: false, ry: rand(), sx: 1.02 });
    }
    b.cyl(0.05, 0.05, 0.62, 0xe9e2cc, 0.62 + (rand() - 0.5) * 0.3, yy + 0.12, 0.2, { rz: Math.PI / 2, seg: 8, col: false });
  }
  b.collider(0, 0, 1.25, 0, 1.3, 0.55);
  b.pop();
}
