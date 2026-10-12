// 传送阵（第十三轮）：两级汉白玉圆台，台面嵌内外两道青玉环与八方卦纹（灵阵冷光 #8DDDD6，白天淡淡一层，入夜透亮），
// 阵心一方青玉圆盘，台周四根青玉短柱。r 为上级台面半径；台面高 0.38 米，可直接走上去（碰撞体顶面可站立）。
// 在 Builder 的当前坐标系里搭建；返回本地的互动点与光源锚点。
import * as THREE from 'three';
import { C } from './builder.js';

export const PORTAL_COLOR = 0x8dddd6;
const TAU = Math.PI * 2;
const ringGeo = (r0, r1, seg = 56) => { const g = new THREE.RingGeometry(r0, r1, seg); g.rotateX(-Math.PI / 2); return g; };

export function teleportArray(b, x, y, z, { r = 3.4, ry = 0 } = {}) {
  b.push(x, y, z, ry);
  const top = 0.38;
  b.cyl(r + 0.55, r + 0.65, 0.18, C.marbleShade, 0, 0.09, 0, { seg: 44, mat: 'stone', col: false });         // 下级台
  b.cyl(r, r + 0.06, 0.2, C.marble, 0, 0.28, 0, { seg: 44, mat: 'stoneSmooth', col: false });                // 上级台面
  b.add(ringGeo(r - 0.12, r), C.marbleWarm, 'stoneSmooth', { y: top + 0.004, col: false });                   // 台沿压边
  // 青玉环与卦纹（发光）
  b.add(ringGeo(r * 0.8, r * 0.87), PORTAL_COLOR, 'glow', { y: top + 0.008, col: false });
  b.add(ringGeo(r * 0.38, r * 0.43), PORTAL_COLOR, 'glow', { y: top + 0.008, col: false });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU, rr = r * 0.62;
    for (let j = 0; j < 3; j++) {                                                                               // 每方三爻（长短相间）
      const broken = (k >> j) & 1, w = 0.62, off = (j - 1) * 0.16;
      const cx = Math.cos(a) * (rr + off), cz = Math.sin(a) * (rr + off);
      if (broken) for (const s of [-1, 1]) b.box(w * 0.4, 0.02, 0.07, PORTAL_COLOR, cx - Math.sin(a) * s * w * 0.28, top + 0.01, cz + Math.cos(a) * s * w * 0.28, { ry: -a + Math.PI / 2, mat: 'glow', col: false });
      else b.box(w, 0.02, 0.07, PORTAL_COLOR, cx, top + 0.01, cz, { ry: -a + Math.PI / 2, mat: 'glow', col: false });
    }
  }
  b.cyl(r * 0.3, r * 0.3, 0.03, C.jade, 0, top + 0.015, 0, { seg: 32, mat: 'jade', col: false });           // 阵心青玉
  // 四根青玉短柱（柱头一点冷光）
  for (let k = 0; k < 4; k++) {
    const a = TAU / 8 + (k / 4) * TAU, px = Math.cos(a) * (r + 0.3), pz = Math.sin(a) * (r + 0.3);
    b.cyl(0.16, 0.2, 0.2, C.marbleShade, px, 0.1, pz, { seg: 8, mat: 'stone', col: false });
    b.cyl(0.11, 0.13, 1.25, C.jade, px, 0.2 + 0.625, pz, { seg: 8, mat: 'jade', col: false });
    b.sphere(0.12, PORTAL_COLOR, px, 1.52, pz, { mat: 'glow', seg: 8, seg2: 6 });
    b.cylCollider(px, 0, 1.5, pz, 0.2);
  }
  b.cylCollider(0, -0.4, top, 0, r + 0.05, { walk: true });                                                  // 台面可站立
  b.emitter('light', 0, 2.2, 0, { k: 0.5, tone: 'cold', pri: 1.3 });            // 冷光不宜太强（汉白玉台面一照就发白）
  b.pop();
  return { top };
}
