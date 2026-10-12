// 石作（第九轮，依参考包 D02 石作与铺地、D08-06 石碑）：
//   柱础 D02-03：八角础座（四正面青玉嵌板、上下两层）+ 覆盆莲瓣一圈（连续的枕状瓣）+ 柱脚古铜莲瓣箍（主殿用；配殿/廊为白石鼓镜）；
//   石栏杆 D02-01 的净瓶等共享几何也放在这里（arch.js 的 rail() 引用）；
//   月洞门 D02-05：白石门墙、正圆门洞（净宽约 2.4 米，人可通过）、雕花门圈与青玉嵌心、瓦顶压檐（筒瓦、瓦当）；
//   铺地镶边 D02-06：庭院铺地外沿一圈青玉嵌条（两道细线 + 转角方心花板），与石板齐平；
//   石碑 D08-06：须弥碑座（莲瓣、青玉嵌带）、碑身边框与青玉莲花心、卷云碑首；碑文用真实字体绘制。
// 构件都写进 Builder（按材质合并、自动合批）；碰撞只给碑座、门墙这类大块，细部不碰撞。
// 本模块只依赖 builder.js（arch.js 会引用它，避免循环引用）
import * as THREE from 'three';
import { C } from './builder.js';

const TAU = Math.PI * 2;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 参数曲面：角向 S 段（首尾共用顶点）× 竖向 R 段；wrapV 时竖向也首尾相接（环面）。法线平滑、无接缝
function ringSurface(S, R, fn, wrapV = false) {
  const rows = wrapV ? R : R + 1, pos = [], idx = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < S; i++) { const p = fn(i / S, j / R); pos.push(p[0], p[1], p[2]); }
  for (let j = 0; j < R; j++) for (let i = 0; i < S; i++) {
    const j1 = wrapV ? (j + 1) % R : j + 1;
    const a = j * S + i, b = j * S + ((i + 1) % S), c = j1 * S + i, d = j1 * S + ((i + 1) % S);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 莲瓣环（覆盆 / 仰莲）：单位大半径 1、管径 tr，管径随角度起伏成 lobes 个枕状瓣（瓣间有缝）；按参数缓存共享
const RINGS = new Map();
export function petalRing(tr = 0.16, lobes = 10) {
  const key = tr + '|' + lobes;
  if (!RINGS.has(key)) RINGS.set(key, ringSurface(lobes * 3, 5, (u, v) => {
    const th = u * TAU, ph = v * TAU;
    const t = tr * (0.6 + 0.4 * Math.pow(Math.abs(Math.sin((lobes * th) / 2)), 0.6));
    const rr = 1 + Math.cos(ph) * t;
    return [Math.cos(th) * rr, Math.sin(ph) * t, Math.sin(th) * rr];
  }, true));
  return RINGS.get(key);
}
const PETAL_RING = petalRing(0.16, 10);

// 方形须弥座的莲瓣带：沿 w × d 的圆角矩形（中心线在矩形边上）一圈枕状瓣，瓣长约 lobeLen；管径 t
export function lobedRect(w, d, t = 0.09, lobeLen = 0.24) {
  const rc = Math.min(t * 1.2, w / 4, d / 4), lx = w / 2 - rc, lz = d / 2 - rc, q = (Math.PI / 2) * rc;
  const P = 4 * lx + 4 * lz + 4 * q;
  const at = (s) => {
    s = ((s % P) + P) % P;
    if (s < 2 * lx) return [-lx + s, d / 2, 0, 1]; s -= 2 * lx;
    if (s < q) { const a = Math.PI / 2 - s / rc; return [lx + Math.cos(a) * rc, lz + Math.sin(a) * rc, Math.cos(a), Math.sin(a)]; } s -= q;
    if (s < 2 * lz) return [w / 2, lz - s, 1, 0]; s -= 2 * lz;
    if (s < q) { const a = -s / rc; return [lx + Math.cos(a) * rc, -lz + Math.sin(a) * rc, Math.cos(a), Math.sin(a)]; } s -= q;
    if (s < 2 * lx) return [lx - s, -d / 2, 0, -1]; s -= 2 * lx;
    if (s < q) { const a = -Math.PI / 2 - s / rc; return [-lx + Math.cos(a) * rc, -lz + Math.sin(a) * rc, Math.cos(a), Math.sin(a)]; } s -= q;
    if (s < 2 * lz) return [-w / 2, -lz + s, -1, 0]; s -= 2 * lz;
    const a = Math.PI - s / rc; return [-lx + Math.cos(a) * rc, lz + Math.sin(a) * rc, Math.cos(a), Math.sin(a)];
  };
  const nl = Math.max(8, Math.round(P / lobeLen)), Ll = P / nl;
  // 路径逆向取样，使三角形绕序朝外
  return ringSurface(nl * 4, 6, (u, v) => {
    const s = P * (1 - u), [px, pz, nx, nz] = at(s), ph = v * TAU;
    const tt = t * (0.62 + 0.38 * Math.pow(Math.abs(Math.sin((Math.PI * s) / Ll)), 0.6));
    return [px + nx * Math.cos(ph) * tt, Math.sin(ph) * tt, pz + nz * Math.cos(ph) * tt];
  }, true);
}

// 柱脚铜箍（莲瓣）：单位半径 1、高 1，中段鼓起；12 片向上收尖的仰莲瓣浮起
const LOTUS_COLLAR = ringSurface(36, 5, (u, v) => {
  const th = u * TAU;
  const lu = Math.abs(((u * 12) % 1) - 0.5);
  const hw = 0.46 - 0.3 * Math.pow(v, 1.5);
  const inside = 1 - sstep(hw - 0.12, hw, lu);
  const r = 1 + 0.12 * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.1)), 0.9) - 0.03 * v + 0.07 * inside * (0.35 + 0.65 * Math.sin(Math.PI * v));
  return [Math.cos(th) * r, v, Math.sin(th) * r];
});

// 净瓶（石栏杆华板上托寻杖的小柱）：高 1、最大半径约 0.5 的旋转体
export const VASE = (() => {
  const p = [[0.42, 0], [0.24, 0.16], [0.5, 0.45], [0.18, 0.78], [0.44, 0.9], [0.44, 1.0], [0.001, 1.0]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(p, 5);
})();

// ---------- 柱础（D02-03）----------
// r：柱半径；y：柱脚所在地面（柱身仍从 y 起算）。bronze：柱脚古铜莲瓣箍（主殿、山门、凌云阁、丹殿前檐等少量使用）
export function columnBase(b, x, y, z, r = 0.25, { bronze = false } = {}) {
  const R = Math.min(0.6, Math.max(0.25, r * 1.45 + 0.04)), h = 0.2 + r * 0.25;
  // 八角础座：下层略宽（青灰白石），上层收进（暖白石）；四正面嵌青玉小板
  b.cyl(R, R * 1.06, h * 0.56, C.marbleShade, x, y + h * 0.28, z, { seg: 8, ry: Math.PI / 8, mat: 'stoneSmooth', col: false });
  b.cyl(R * 0.9, R * 0.96, h * 0.44, C.marble, x, y + h * 0.56 + h * 0.22, z, { seg: 8, ry: Math.PI / 8, mat: 'stoneSmooth', col: false });
  const ap = R * 1.03 * Math.cos(Math.PI / 8);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    b.box(R * 0.56, h * 0.3, 0.02, C.jade, x + ca * (ap + 0.004), y + h * 0.29, z + sa * (ap + 0.004), { ry: -a + Math.PI / 2, mat: 'jade', col: false, detail: true });
  }
  // 覆盆莲瓣
  const pr = r * 1.18, tv = pr * 0.16 * 0.8;
  b.add(PETAL_RING, C.marbleWarm, 'stoneSmooth', { x, y: y + h + tv * 0.7, z, sx: pr, sy: pr * 0.8, sz: pr, col: false, detail: true });
  if (bronze) {
    // 古铜莲瓣箍：在覆盆之上包住柱脚
    const ch = Math.min(0.2, Math.max(0.11, r * 0.5));
    b.add(LOTUS_COLLAR, C.bronze, 'bronze', { x, y: y + h + tv * 0.9, z, sx: r * 1.03, sy: ch, sz: r * 1.03, col: false });
    b.cyl(r * 1.04, r * 1.1, ch * 0.9, C.bronze, x, y + h + tv * 0.9 + ch * 0.45, z, { seg: 10, mat: 'bronze', col: false });     // 远看：铜箍的简体（近处被莲瓣箍包住）
    return h + tv + ch;
  }
  // 白石鼓镜
  b.cyl(r * 1.06, r * 1.13, 0.07, C.marble, x, y + h + tv * 1.2 + 0.035, z, { seg: 14, mat: 'stoneSmooth', col: false });
  return h + tv + 0.07;
}

// ---------- 月洞门（D02-05）----------
// 门墙沿本地 X（中心 x、z，朝向 ry），墙宽 W、高 H、厚 t；门洞直径 Dm（净宽 2.2–2.8 米）、洞底离地 sill
export function moonGate9(b, x, y, z, ry, { W = 5.2, H = 3.4, t = 0.5, Dm = 2.5, sill = 0.08, wall = C.plaster } = {}) {
  b.push(x, y, z, ry);
  const R = Dm / 2, cy = sill + R, top = H;
  // 门墙：用竖条拼出圆洞（条高按圆的弦长截断），两侧实墙
  const n = Math.ceil(Dm / 0.16);
  for (let i = 0; i < n; i++) {
    const x0 = -R + (i * Dm) / n, x1 = -R + ((i + 1) * Dm) / n, xm = (x0 + x1) / 2;
    const hy = Math.sqrt(Math.max(0, R * R - xm * xm));
    const lo = cy - hy, hi = cy + hy;
    if (lo > 0.01) b.slab(x1 - x0 + 0.005, lo, t, wall, xm, 0, 0, { mat: 'std', col: false });
    b.slab(x1 - x0 + 0.005, top - hi, t, wall, xm, hi, 0, { mat: 'std', col: false });
  }
  for (const s of [-1, 1]) {
    const w = W / 2 - R;
    b.slab(w, top, t, wall, s * (R + w / 2), 0, 0, { mat: 'std', col: false });
    b.slab(w + 0.02, 0.5, t + 0.06, C.marbleShade, s * (R + w / 2), 0, 0, { mat: 'stoneSmooth', col: false });         // 墙裙石
    // 墙面雕花方板（门两侧，两面）
    for (const sz of [-1, 1]) {
      b.box(0.9, 0.62, 0.04, C.marbleWarm, s * (R + w / 2), 0.93, sz * (t / 2 + 0.02), { mat: 'stoneSmooth', col: false });
      b.box(0.62, 0.4, 0.03, C.jade, s * (R + w / 2), 0.93, sz * (t / 2 + 0.045), { mat: 'jade', col: false });
    }
  }
  // 门圈：雕花石圈（两面各一圈）+ 青玉嵌线；顶上一块青玉方心花板
  for (const sz of [-1, 1]) {
    b.add(new THREE.TorusGeometry(R + 0.09, 0.09, 6, 40), C.marbleWarm, 'stoneSmooth', { x: 0, y: cy, z: sz * (t / 2 + 0.02), col: false });
    b.add(new THREE.TorusGeometry(R + 0.22, 0.025, 4, 40), C.jade, 'jade', { x: 0, y: cy, z: sz * (t / 2 + 0.02), col: false });
    b.box(0.62, 0.62, 0.05, C.marbleWarm, 0, cy + R + 0.53, sz * (t / 2 + 0.02), { mat: 'stoneSmooth', col: false });
    b.box(0.42, 0.42, 0.04, C.jade, 0, cy + R + 0.53, sz * (t / 2 + 0.05), { mat: 'jade', col: false });
  }
  // 门洞内侧的石面（洞壁有厚度）：沿圆周一圈薄板
  const m = 28;
  for (let i = 0; i < m; i++) {
    const a = (i / m) * TAU, a1 = ((i + 1) / m) * TAU;
    if (Math.sin((a + a1) / 2) * R + cy < sill + 0.02) continue;
    const xa = Math.cos(a) * R, ya = cy + Math.sin(a) * R, xb = Math.cos(a1) * R, yb = cy + Math.sin(a1) * R;
    const L = Math.hypot(xb - xa, yb - ya), mid = [(xa + xb) / 2, (ya + yb) / 2];
    b.box(L + 0.01, 0.04, t + 0.02, C.marble, mid[0], mid[1], 0, { rz: Math.atan2(yb - ya, xb - xa), mat: 'stoneSmooth', col: false });
  }
  b.slab(Dm * 0.8, sill + 0.02, t + 0.3, C.marbleWarm, 0, 0, 0, { mat: 'stoneSmooth', col: false });          // 门槛石（低，可跨）
  // 瓦顶压檐：两坡小顶 + 筒瓦脊，檐口一排瓦当
  const RW = W + 0.5, RD = t + 1.0;
  b.slab(RW - 0.2, 0.12, t + 0.12, C.marbleShade, 0, top, 0, { mat: 'stoneSmooth', col: false });
  for (const sz of [-1, 1]) {
    b.box(RW, 0.08, RD / 2 + 0.06, C.tileDark, 0, top + 0.26, sz * RD / 4, { rx: sz * 0.42, mat: 'roof', col: false });
    for (let k = 0; k < Math.floor(RW / 0.3); k++) {
      const px = -RW / 2 + 0.15 + k * 0.3;
      b.cyl(0.065, 0.065, 0.12, 0x2c3b46, px, top + 0.08, sz * (RD / 2 + 0.02), { rx: Math.PI / 2, seg: 6, mat: 'std', col: false });
    }
  }
  b.box(RW + 0.1, 0.18, 0.24, C.ridge, 0, top + 0.46, 0, { mat: 'roof', col: false });
  // 碰撞：两侧墙、洞顶以上（洞内可走）
  for (const s of [-1, 1]) b.collider(s * (R + (W / 2 - R) / 2 + 0.05), 0, top, 0, (W / 2 - R) / 2 + 0.05, t / 2 + 0.05, 0, { walk: false });
  b.collider(0, cy + R * 0.92, top + 0.6, 0, R, t / 2 + 0.05, 0, { walk: false });
  b.pop();
  return { R, cy };
}

// ---------- 铺地镶边（D02-06）：沿矩形 [x0, x1, z0, z1] 内缩 inset 的一圈青玉嵌条（两道细线 + 四角方心花板），与地面齐平 ----------
let INLAY = null;
export function inlayMaterial() {
  if (INLAY) return INLAY;
  INLAY = new THREE.MeshStandardMaterial({ color: 0x89b5ab, roughness: 0.38, metalness: 0, envMapIntensity: 0.6 });
  return INLAY;
}
let CORNER_TEX = null;
function cornerTex() {
  if (CORNER_TEX) return CORNER_TEX;
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#d8d5c9'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#a7ada5'; g.lineWidth = 6; g.strokeRect(10, 10, S - 20, S - 20);
  g.fillStyle = '#89b5ab'; g.fillRect(26, 26, S - 52, S - 52);
  g.strokeStyle = '#e8e6dc'; g.lineWidth = 7; g.lineCap = 'round';
  const c = S / 2;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.ellipse(c + Math.cos(a) * 46, c + Math.sin(a) * 46, 34, 13, a, 0, TAU); g.stroke(); }
  g.beginPath(); g.arc(c, c, 18, 0, TAU); g.stroke();
  CORNER_TEX = new THREE.CanvasTexture(cv); CORNER_TEX.colorSpace = THREE.SRGBColorSpace; CORNER_TEX.anisotropy = 8;
  return CORNER_TEX;
}
export function pavingBorder(scene, [x0, x1, z0, z1], y, { inset = 0.8, gap = 0.36, wLine = 0.12, corners = true } = {}) {
  const mat = inlayMaterial(), group = new THREE.Group();
  group.name = 'paving-border';
  const strip = (cx, cz, L, along) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(along ? L : wLine, along ? wLine : L), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(cx, y + 0.012, cz); m.receiveShadow = true;
    group.add(m);
  };
  for (const o of [inset, inset + gap]) {
    const ax = x0 + o, bx = x1 - o, az = z0 + o, bz = z1 - o;
    strip((ax + bx) / 2, az, bx - ax, true); strip((ax + bx) / 2, bz, bx - ax, true);
    strip(ax, (az + bz) / 2, bz - az, false); strip(bx, (az + bz) / 2, bz - az, false);
  }
  if (corners) {
    const cm = new THREE.MeshStandardMaterial({ map: cornerTex(), roughness: 0.6 });
    const s = gap + 0.5;
    for (const [cx, cz] of [[x0 + inset + gap / 2, z0 + inset + gap / 2], [x1 - inset - gap / 2, z0 + inset + gap / 2], [x0 + inset + gap / 2, z1 - inset - gap / 2], [x1 - inset - gap / 2, z1 - inset - gap / 2]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), cm);
      m.rotation.x = -Math.PI / 2; m.position.set(cx, y + 0.014, cz); m.receiveShadow = true;
      group.add(m);
    }
  }
  scene.add(group);
  return group;
}

// 碑面：画布纹理的薄板（正面 +Z）
function tabletFace(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = 320; cv.height = Math.round(320 * (h / w));
  draw(cv.getContext('2d'), cv.width, cv.height);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82 });
  const side = new THREE.MeshStandardMaterial({ color: 0xcfcabd, roughness: 0.85 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), [side, side, side, side, face, side]);
  m.castShadow = false; m.receiveShadow = true;
  return m;
}

// ---------- 石碑（D08-06）：碑座（须弥、莲瓣、青玉嵌带）+ 碑身（边框、青玉莲花心 / 碑文）+ 卷云碑首 ----------
// draw(g, w, h)：碑文画法（真实字体）；本地原点为碑座底面中心，碑面朝 +Z
export function stoneTablet(b, x, y, z, ry, { w = 1.3, h = 1.9, draw = null } = {}) {
  b.push(x, y, z, ry);
  const M = C.marble, Mw = C.marbleWarm, Ms = C.marbleShade, J = C.jade;
  b.slab(w + 0.9, 0.18, 0.95, Ms, 0, 0, 0, { mat: 'stone', col: false });
  b.slab(w + 0.7, 0.2, 0.8, Mw, 0, 0.18, 0, { mat: 'stoneSmooth', col: false });
  b.slab(w + 0.52, 0.06, 0.66, J, 0, 0.27, 0.0, { mat: 'jade', col: false });
  for (let i = 0; i < 9; i++) b.sphere(0.09, M, -w / 2 - 0.2 + (i * (w + 0.4)) / 8, 0.46, 0.3, { mat: 'stoneSmooth', sy: 0.7, sz: 1.2, seg: 6, seg2: 4 });
  b.slab(w + 0.4, 0.14, 0.62, M, 0, 0.38, 0, { mat: 'stoneSmooth', col: false });
  b.collider(0, 0, 0.52, 0, (w + 0.9) / 2, 0.5);
  // 碑身
  const y0 = 0.52;
  b.slab(w, h, 0.3, M, 0, y0, 0, { mat: 'stoneSmooth', col: false });
  for (const s of [-1, 1]) b.slab(0.1, h - 0.1, 0.34, Mw, s * (w / 2 - 0.05), y0 + 0.05, 0, { mat: 'stoneSmooth', col: false });
  b.slab(w - 0.2, 0.1, 0.34, Mw, 0, y0 + 0.05, 0, { mat: 'stoneSmooth', col: false });
  if (draw) {
    const m = tabletFace(w - 0.36, h - 0.4, draw);
    m.position.set(0, y0 + 0.22 + (h - 0.4) / 2, 0.16);
    b.addMesh(m);
  } else {
    b.slab(w - 0.4, h - 0.5, 0.04, J, 0, y0 + 0.25, 0.15, { mat: 'jade', col: false });
  }
  // 卷云碑首：中间拱起的顶，两角卷云，正中一枚青玉圆心
  b.slab(w + 0.16, 0.16, 0.36, Mw, 0, y0 + h, 0, { mat: 'stoneSmooth', col: false });
  b.add(new THREE.CylinderGeometry(w * 0.42, w * 0.42, 0.34, 20, 1, false, -Math.PI / 2, Math.PI), M, 'stoneSmooth', { x: 0, y: y0 + h + 0.16, z: 0, rx: -Math.PI / 2, col: false });
  for (const s of [-1, 1]) b.add(new THREE.TorusGeometry(0.16, 0.06, 5, 12, Math.PI * 1.4), Mw, 'stoneSmooth', { x: s * (w / 2 - 0.05), y: y0 + h + 0.3, z: 0.02, rz: s > 0 ? -0.6 : Math.PI + 0.6, col: false });
  b.cyl(0.17, 0.17, 0.05, J, 0, y0 + h + 0.36, 0.17, { rx: Math.PI / 2, seg: 16, mat: 'jade', col: false });
  b.collider(0, y0, y0 + h + 0.5, 0, w / 2, 0.18);
  b.pop();
}
