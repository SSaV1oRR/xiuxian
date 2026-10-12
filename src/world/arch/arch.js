// 中式古建构件（单位：米，本地 +Z 为正面）。屋面曲面生成沿用 demo/src/world/structures/arch.js：
// 庑殿 / 歇山 / 悬山 / 卷棚 / 攒尖（凹曲屋面 + 翼角起翘 + 瓦垄）。在此基础上增加：
// 檐椽与连檐、檐下木望板（仰视可见）、博风板、隔扇门窗（关闭）、粉墙木构、多重檐楼阁、牌楼等。
import * as THREE from 'three';
import { C } from './builder.js';
import { columnBase, VASE } from './stone9.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const X1 = new THREE.Vector3(1, 0, 0);

// ---------------- 曲面生成 ----------------
class Acc {
  constructor() { this.pos = []; this.uv = []; this.idx = []; }
  grid(nu, nv, fn) {
    const base = this.pos.length / 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const [x, y, z, u, v] = fn(i / nu, j / nv);
      this.pos.push(x, y, z); this.uv.push(u, v);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      this.idx.push(a, b, c, b, d, c);
    }
  }
  // up=true：统一屋面朝向（法线朝上），使檐下望板可用背面材质
  geo(up = false) {
    if (up) {
      const P = this.pos, I = this.idx;
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
        const ux = P[b] - P[a], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vz = P[c + 2] - P[a + 2];
        if (uz * vx - ux * vz < 0) { const s = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = s; }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

const cache = new Map();
const memo = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };
const k3 = (...a) => a.map((v) => (typeof v === 'number' ? v.toFixed(2) : String(v))).join('|');

// span：起翘自檐角起算的范围（米）；缺省为面阔、进深的 26%（大屋面上起翘就拉得很长，第十二轮问道殿改用固定范围，檐角翘得陡）
export function liftFn(W, D, H, lift, span = 0) {
  const sx = span || W * 0.26, sz = span || D * 0.26;
  return (x, z) => {
    const ex = W / 2 - Math.abs(x), ez = D / 2 - Math.abs(z);
    const cx = Math.max(0, 1 - ex / sx), cz = Math.max(0, 1 - ez / sz);
    return H * lift * 2.4 * Math.pow(cx * cz, 1.4);
  };
}

// 庑殿顶（四坡）
export function hipRoofGeo(W, D, H, { p = 1.7, lift = 0.16, tMax = 1, span = 0 } = {}) {
  return memo(k3('hip', W, D, H, p, lift, tMax, span), () => {
    if (W < D) { const g = hipRoofGeo(D, W, H, { p, lift, tMax, span }).clone(); g.rotateY(Math.PI / 2); return g; }
    const E = D / 2, L = W - D, sl = Math.hypot(E, H), lf = liftFn(W, D, H, lift, span), a = new Acc();
    // 起翘范围给定时（檐角陡翘）沿檐方向加密：每段不超过起翘范围的 1/5
    const nW = span ? Math.max(12, Math.ceil(W / (span / 5))) : 12, nD = span ? Math.max(6, Math.ceil(D / (span / 5))) : 6;
    const Y = (x, z) => H * Math.pow(Math.min(1, Math.max(0, Math.min(W / 2 - Math.abs(x), E - Math.abs(z)) / E)), p) + lf(x, z);
    for (const sz of [1, -1]) a.grid(nW, 6, (s, t) => { t *= tMax; const z = sz * E * (1 - t), hw = (W / 2) * (1 - t) + (L / 2) * t, x = (2 * s - 1) * hw; return [x, Y(x, z), z, x, t * sl]; });
    for (const sx of [1, -1]) a.grid(nD, 6, (s, t) => { t *= tMax; const x = sx * (W / 2 - (W / 2 - L / 2) * t), z = (2 * s - 1) * E * (1 - t); return [x, Y(x, z), z, z, t * sl]; });
    return a.geo(true);
  });
}

// 歇山顶：下部四坡 + 上部两坡与山花
// upper：只要上部两坡与山花（十字脊的第二座歇山：下部四坡与第一座重合，不再画）
export function xieshanRoofGeo(W, D, H, { p = 1.6, lift = 0.16, hs = 0.45, gin = 0.3, tMax = 1, span = 0, upper = false } = {}) {
  return memo(k3('xs', W, D, H, p, lift, hs, gin, tMax, span, upper), () => {
    if (W < D) {
      const r = xieshanRoofGeo(D, W, H, { p, lift, hs, gin, tMax, span, upper });
      const roof = r.roof.clone(); roof.rotateY(Math.PI / 2);
      const gable = r.gable ? r.gable.clone().rotateY(Math.PI / 2) : null;
      const gableN = r.gableN ? r.gableN.clone().rotateY(Math.PI / 2) : null;
      return { roof, gable, gableN, ridge: r.ridge, rot: true, g: r.g, Hs: r.Hs };
    }
    const E = D / 2, g = Math.min(W / 2 - 0.3, D * gin), Hs = H * hs, tS = Math.pow(hs, 1 / p), zs = E * (1 - tS);
    const sl = Math.hypot(E, H), lf = liftFn(W, D, H, lift, span), a = new Acc();
    const nW = span ? Math.max(12, Math.ceil(W / (span / 5))) : 12, nD = span ? Math.max(6, Math.ceil(D / (span / 5))) : 6;
    for (const sz of [1, -1]) a.grid(nW, upper ? 5 : 7, (s, t) => {
      t = upper ? tS + (1 - tS) * t : t * tMax;
      const z = sz * E * (1 - t), hw = t <= tS ? W / 2 - g * (t / tS) : W / 2 - g, x = (2 * s - 1) * hw;
      return [x, H * Math.pow(t, p) + lf(x, z), z, x, t * sl];
    });
    const tauMax = Math.min(1, tMax / tS);
    if (!upper) for (const sx of [1, -1]) a.grid(nD, 4, (s, tau) => {
      tau *= tauMax;
      const x = sx * (W / 2 - g * tau), zh = E - (E - zs) * tau, z = (2 * s - 1) * zh;
      return [x, Hs * Math.pow(tau, p) + lf(x, z), z, z, tau * Math.hypot(g, Hs)];
    });
    let gable = null, gableN = null;
    if (tMax >= 1) {
      // gable 的 uv 以米计；gableN 同形，uv 归一到 0–1（自外看左→右、山花底→尖），供整幅贴一张山花图
      const b = new Acc(), bn = new Acc();
      for (const sx of [1, -1]) {
        const pt = (s, t) => { const z = -sx * (2 * s - 1) * zs, top = H * Math.pow(1 - Math.abs(z) / E, p); return [sx * (W / 2 - g), Hs + (top - Hs) * t, z]; };
        b.grid(10, 1, (s, t) => { const [x, y, z] = pt(s, t); return [x, y, z, z, y]; });
        bn.grid(10, 1, (s, t) => { const [x, y, z] = pt(s, t); return [x, y, z, s, (y - Hs) / (H - Hs)]; });
      }
      gable = b.geo(); gableN = bn.geo();
    }
    return { roof: a.geo(true), gable, gableN, ridge: W - 2 * g, g, Hs };
  });
}

// 悬山 / 硬山（两坡），卷棚（圆脊）
export function gableRoofGeo(W, D, H, { p = 1.35, juan = false } = {}) {
  return memo(k3('gb', W, D, H, p, juan), () => {
    const E = D / 2, sl = Math.hypot(E, H), a = new Acc();
    for (const sz of [1, -1]) a.grid(4, juan ? 8 : 5, (s, t) => {
      const z = sz * E * (1 - t), x = (2 * s - 1) * (W / 2);
      return [x, juan ? H * (3 * t * t - 2 * t * t * t) : H * Math.pow(t, p), z, x, t * sl];
    });
    return a.geo(true);
  });
}
export const gableY = (D, H, z, p = 1.35) => H * Math.pow(Math.max(0, 1 - Math.abs(z) / (D / 2)), p);

// 山墙（竖直，z-y 平面）
export function gableWallGeo(D, H, { p = 1.35 } = {}) {
  return memo(k3('gw', D, H, p), () => {
    const a = new Acc(), E = D / 2;
    a.grid(8, 1, (s, t) => { const z = (2 * s - 1) * E, top = H * Math.pow(1 - Math.abs(z) / E, p); return [0, top * t, z, z, top * t]; });
    return a.geo();
  });
}

// 攒尖顶（n 边形）
export function pyramidRoofGeo(n, R, H, { p = 1.6, lift = 0.22, tMax = 1, rot = 0 } = {}) {
  return memo(k3('py', n, R, H, p, lift, tMax, rot), () => {
    const a = new Acc(), edge = 2 * R * Math.sin(Math.PI / n), sl = Math.hypot(R, H);
    for (let k = 0; k < n; k++) {
      const a0 = rot + (k / n) * Math.PI * 2, a1 = rot + ((k + 1) / n) * Math.PI * 2;
      const A = [R * Math.cos(a0), R * Math.sin(a0)], B = [R * Math.cos(a1), R * Math.sin(a1)];
      a.grid(6, 6, (s, t) => {
        t *= tMax;
        const ex = A[0] + (B[0] - A[0]) * s, ez = A[1] + (B[1] - A[1]) * s;
        const cf = Math.pow(Math.max(0, 1 - Math.min(s, 1 - s) / 0.32), 2) * Math.pow(1 - t, 2.5);
        return [ex * (1 - t), H * Math.pow(t, p) + H * lift * cf, ez * (1 - t), s * edge, t * sl];
      });
    }
    return a.geo(true);
  });
}

// ---------------- 通用小构件 ----------------
// 构件的本地 X 沿两点连线；第九轮起本地 Y 尽量保持朝上（斜梁、垂带、斜栏杆不再绕自身轴扭转成斜板）
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _bm = new THREE.Matrix4(), Y1 = new THREE.Vector3(0, 1, 0);
export function beam(b, x0, y0, z0, x1, y1, z1, t, color, mat = 'std', col = false, t2 = null) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz);
  if (L < 1e-3) return;
  _bx.set(dx / L, dy / L, dz / L);
  let q;
  if (Math.abs(_bx.y) > 0.985) q = new THREE.Quaternion().setFromUnitVectors(X1, _bx);
  else {
    _bz.crossVectors(_bx, Y1).normalize();
    _by.crossVectors(_bz, _bx);
    q = new THREE.Quaternion().setFromRotationMatrix(_bm.makeBasis(_bx, _by, _bz));
  }
  b.add(new THREE.BoxGeometry(L, t, t2 ?? t), color, mat, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, q, col: false });
  if (col) {
    const ry = Math.atan2(-dz, dx);
    b.collider((x0 + x1) / 2, Math.min(y0, y1) - t / 2, Math.max(y0, y1) + t / 2, (z0 + z1) / 2, Math.hypot(dx, dz) / 2, (t2 ?? t) / 2, ry, { walk: false });
  }
}

// 斗拱（一朵），y 为柱头顶面；painted=false 时为素木
export function dougong(b, x, y, z, s, ry = 0, painted = true) {
  const w0 = painted ? C.woodRed : C.wood, cA = painted ? C.paintGreen : C.woodLight, cB = painted ? C.paintBlue : C.wood;
  b.push(x, y, z, ry);
  b.slab(0.55 * s, 0.24 * s, 0.55 * s, w0, 0, 0, 0, { col: false, mat: 'wood' });
  b.slab(1.4 * s, 0.17 * s, 0.3 * s, cA, 0, 0.24 * s, 0, { col: false });
  b.slab(0.3 * s, 0.17 * s, 1.4 * s, cB, 0, 0.24 * s, 0, { col: false });
  for (const e of [-0.6, 0.6]) {
    b.slab(0.32 * s, 0.14 * s, 0.32 * s, w0, e * s, 0.41 * s, 0, { col: false, mat: 'wood' });
    b.slab(0.32 * s, 0.14 * s, 0.32 * s, w0, 0, 0.41 * s, e * s, { col: false, mat: 'wood' });
  }
  b.slab(2.0 * s, 0.17 * s, 0.34 * s, cB, 0, 0.55 * s, 0, { col: false });
  b.slab(0.34 * s, 0.17 * s, 2.0 * s, cA, 0, 0.55 * s, 0, { col: false });
  b.pop();
  return 0.72 * s;
}

// 石栏杆（D02-01）：沿折线 pts（[x,z]）布置；高度 h，底面 y
//   望柱：柱身两面嵌青玉竖板，柱头为莲苞（cap='bronze' 时为古铜帽 + 铜莲苞，只用于山门、桥、修炼岛等少数重点处）
//   栏板：地栿、华板（白石框 + 略凹的青玉心，两面）、盆唇、净瓶（每档 2–3 枚）托寻杖
//   panel=false：只有寻杖与净瓶（通透栏杆）；rich=false：简化（远处长段或低矮护栏）
export const RAIL_STATS = { len: 0 };
export function rail(b, pts, y, { h = 1.0, spacing = 1.6, color = C.marble, post = 0.2, mat = 'stoneSmooth', closed = false, panel = true, cap = 'stone', rich = true } = {}) {
  const list = closed ? [...pts, pts[0]] : pts;
  const frameC = color === C.marble ? C.marbleWarm : color;
  const tH = 0.09, pY = y + 0.12, pH = Math.max(0.18, h * 0.36);
  for (let i = 0; i < list.length - 1; i++) {
    const [x0, z0] = list[i], [x1, z1] = list[i + 1];
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 0.1) continue;
    RAIL_STATS.len += L;
    const n = Math.max(1, Math.round(L / spacing));
    const ry = Math.atan2(-(z1 - z0), x1 - x0), nx = Math.sin(ry), nz = Math.cos(ry);
    for (let k = 0; k <= n; k++) {
      if (k === n && i < list.length - 2) continue;
      const x = x0 + ((x1 - x0) * k) / n, z = z0 + ((z1 - z0) * k) / n;
      b.slab(post, h + 0.1, post, color, x, y, z, { mat, col: false, ry });
      if (rich) for (const s of [-1, 1]) b.box(post * 0.5, h * 0.56, 0.012, C.jade, x + s * nx * (post / 2 + 0.004), y + 0.2 + h * 0.28, z + s * nz * (post / 2 + 0.004), { mat: 'jade', ry, col: false, detail: true });
      if (cap === 'bronze') {
        b.slab(post * 1.3, 0.1, post * 1.3, C.bronze, x, y + h + 0.1, z, { mat: 'bronze', col: false, ry });
        b.sphere(post * 0.4, C.bronze, x, y + h + 0.2 + post * 0.44, z, { mat: 'bronze', sy: 1.3, seg: 8, seg2: 6 });
        b.cyl(0.001, post * 0.13, post * 0.4, C.bronze, x, y + h + 0.2 + post * 0.98, z, { mat: 'bronze', seg: 6, col: false, detail: true });
      } else {
        b.slab(post * 1.18, 0.07, post * 1.18, frameC, x, y + h + 0.1, z, { mat, col: false, ry });
        if (rich) b.sphere(post * 0.44, color, x, y + h + 0.17 + post * 0.46, z, { mat, sy: 1.2, seg: 8, seg2: 6, detail: true });
        else b.slab(post * 0.8, 0.1, post * 0.8, color, x, y + h + 0.17, z, { mat, col: false, ry });
      }
    }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    b.box(L, 0.12, post * 0.8, frameC, cx, y + 0.06, cz, { mat, ry, col: false });                 // 地栿
    b.box(L, tH, post * 0.56, color, cx, y + h - tH / 2, cz, { mat, ry, col: false });              // 寻杖
    const vy = panel ? pY + pH + 0.07 : y + 0.12, vh = y + h - tH - vy;
    if (panel) b.box(L, 0.07, post * 0.6, frameC, cx, pY + pH + 0.035, cz, { mat, ry, col: false });   // 盆唇
    const l = L / n;
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n, sx = x0 + (x1 - x0) * u, sz = z0 + (z1 - z0) * u, lw = l - post;
      if (lw < 0.2) continue;
      if (panel) {
        b.box(lw, pH, 0.08, color, sx, pY + pH / 2, sz, { mat, ry, col: false });                      // 华板
        if (rich) for (const s of [-1, 1]) {
          const o = (d) => [sx + s * nx * d, sz + s * nz * d];
          let [px, pz] = o(0.05);
          b.box(lw - 0.06, 0.05, 0.02, frameC, px, pY + pH - 0.05, pz, { mat, ry, col: false, detail: true });     // 框：上、下、左右
          b.box(lw - 0.06, 0.05, 0.02, frameC, px, pY + 0.05, pz, { mat, ry, col: false, detail: true });
          for (const e of [-1, 1]) {
            const ex = sx + e * (lw / 2 - 0.055) * Math.cos(ry) + s * nx * 0.05, ez = sz - e * (lw / 2 - 0.055) * Math.sin(ry) + s * nz * 0.05;
            b.box(0.05, pH - 0.06, 0.02, frameC, ex, pY + pH / 2, ez, { mat, ry, col: false, detail: true });
          }
          [px, pz] = o(0.044);
          b.box(lw - 0.18, pH - 0.16, 0.012, C.jade, px, pY + pH / 2, pz, { mat: 'jade', ry, col: false, detail: true });   // 青玉心（略凹）
        }
      }
      if (rich && vh > 0.12) {
        const m = lw > 1.1 ? 3 : 2;
        for (let q = 1; q <= m; q++) {
          const uu = (k + q / (m + 1)) / n;
          b.add(VASE, color, mat, { x: x0 + (x1 - x0) * uu, y: vy, z: z0 + (z1 - z0) * uu, sx: post * 0.55, sz: post * 0.55, sy: vh, ry, col: false, detail: true });
        }
      }
    }
    if (!panel && !rich) b.box(L, 0.06, post * 0.5, color, cx, y + h * 0.5, cz, { mat, ry, col: false });
    b.collider(cx, y, y + h + 0.2, cz, L / 2, 0.16, ry, { walk: false, cam: false });
  }
}

// 木栏杆（楼阁平座、亭）
export function woodRail(b, pts, y, { h = 0.95, color = C.woodRed, closed = false, spacing = 0.22 } = {}) {
  const list = closed ? [...pts, pts[0]] : pts;
  for (let i = 0; i < list.length - 1; i++) {
    const [x0, z0] = list[i], [x1, z1] = list[i + 1];
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 0.1) continue;
    const ry = Math.atan2(-(z1 - z0), x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    b.box(L, 0.08, 0.1, color, cx, y + h, cz, { ry, col: false, mat: 'wood' });
    b.box(L, 0.07, 0.08, color, cx, y + 0.12, cz, { ry, col: false, mat: 'wood' });
    const n = Math.max(1, Math.round(L / spacing));
    for (let k = 1; k < n; k++) {
      const u = k / n;
      b.box(0.035, h - 0.12, 0.035, color, x0 + (x1 - x0) * u, y + 0.12 + (h - 0.12) / 2, z0 + (z1 - z0) * u, { ry, col: false, mat: 'wood' });
    }
    b.slab(0.12, h + 0.08, 0.12, color, x0, y, z0, { col: false, mat: 'wood' });
    b.collider(cx, y, y + h + 0.1, cz, L / 2, 0.1, ry, { walk: false, cam: false });
  }
}

// 台阶：底边中心 (x, y, z)，向本地 -Z 方向上升 rise；base 为踏步实体底面（相对 y）
export function stairs(b, x, y, z, w, rise, { run = 0.34, stepH = 0.19, color = C.stone, ry = 0, cheeks = true, base = -0.4, cheekW = 0.42 } = {}) {
  const n = Math.max(1, Math.round(rise / stepH)), sh = rise / n;
  b.push(x, y, z, ry);
  const riser = new THREE.Color(color).multiplyScalar(0.74).getHex();
  for (let k = 0; k < n; k++) {
    const top = sh * (k + 1);
    b.slab(w, top - base, run + 0.02, color, 0, base, -(k + 0.5) * run, { mat: 'stoneSmooth', jitter: 0.08 });
    // 踢面略暗（受光少、积尘）：远看一级一级分得清，不像一面斜坡
    b.box(w - 0.02, sh * 0.9, 0.014, riser, 0, top - sh * 0.5, -k * run + 0.017, { col: false, mat: 'stoneSmooth', jitter: 0.06 });
  }
  if (cheeks) for (const s of [-1, 1]) {
    const cx = s * (w / 2 + cheekW / 2);
    beam(b, cx, 0.12 + sh * 0.5, 0.05, cx, rise + 0.12, -n * run + run * 0.5, cheekW, C.stoneDark, 'stoneSmooth', false, cheekW);
    for (let k = 0; k < n; k++) b.slab(cheekW * 0.9, Math.max(0.05, sh * (k + 1) - base), run, C.stoneDark, cx, base, -(k + 0.5) * run, { mat: 'stone', col: false });
    b.collider(cx, base, rise + 0.3, -n * run / 2, cheekW / 2, n * run / 2, 0, { walk: false, cam: false });
  }
  b.pop();
  return n * run;
}

// ---------------- 屋顶装配 ----------------
// 瓦当：檐头一枚圆瓦当（短筒 + 当面），本地轴向 +Z；共享几何
const WADANG = (() => {
  const g = new THREE.CylinderGeometry(0.075, 0.075, 0.24, 6, 1, true); g.rotateX(Math.PI / 2);
  const f = new THREE.CircleGeometry(0.078, 6); f.translate(0, 0, 0.12);
  const rim = new THREE.RingGeometry(0.055, 0.079, 6, 1); rim.translate(0, 0, 0.124);
  return { g, f, rim };
})();
// 檐口的瓦当：沿每条檐边、对准瓦垄（屋面 uv 每 0.3 米一垄，垄心在半格处），高度随起翘；转角处让出角脊
export function wadangRow(b, type, W, D, y, lf, color = 0x2c3b46) {
  const sides = type === 'gable' || type === 'juan' ? [[0, 1], [0, -1]] : [[0, 1], [0, -1], [1, 0], [-1, 0]];
  for (const [sx, sz] of sides) {
    const along = sz !== 0, L = along ? W : D, half = L / 2;
    const k0 = Math.ceil((-half + 0.32) / 0.3 - 0.5), k1 = Math.floor((half - 0.32) / 0.3 - 0.5);
    for (let k = k0; k <= k1; k++) {
      const u = (k + 0.5) * 0.3;
      const ex = along ? u : sx * (W / 2), ez = along ? sz * (D / 2) : u;
      const ly = y + lf(ex * 0.995, ez * 0.995) + 0.02;
      const ry = along ? (sz > 0 ? 0 : Math.PI) : (sx > 0 ? Math.PI / 2 : -Math.PI / 2);
      b.add(WADANG.g, color, 'std', { x: ex - sx * 0.06, y: ly, z: ez - sz * 0.06, ry, col: false, detail: true });
      b.add(WADANG.f, color, 'std', { x: ex - sx * 0.06, y: ly, z: ez - sz * 0.06, ry, col: false, detail: true });
      b.add(WADANG.rim, 0x56646c, 'std', { x: ex - sx * 0.06, y: ly, z: ez - sz * 0.06, ry, col: false, detail: true });
    }
  }
}

// 檐口：椽头、连檐、檐头瓦当，以及檐下望板（只在仰视时可见）
export function eaves(b, type, W, D, H, y, roofOpts = {}) {
  const lift = roofOpts.lift ?? (type === 'pyramid' ? 0.22 : 0.16);
  const lf = type === 'gable' || type === 'juan' ? () => 0 : liftFn(W, D, H, lift, roofOpts.span || 0);
  const sides = type === 'gable' || type === 'juan' ? [[0, 1], [0, -1]] : [[0, 1], [0, -1], [1, 0], [-1, 0]];
  if (roofOpts.wadang !== false) wadangRow(b, type, W, D, y, lf);
  for (const [sx, sz] of sides) {
    const along = sz !== 0, L = along ? W : D, half = L / 2;
    const n = Math.max(4, Math.round(L / 0.36));
    for (let i = 0; i < n; i++) {
      const u = -half + ((i + 0.5) * L) / n;
      const ex = along ? u : sx * (W / 2), ez = along ? sz * (D / 2) : u;
      if (!along && Math.abs(u) > D / 2 - 0.4) continue;
      if (along && type !== 'gable' && type !== 'juan' && Math.abs(u) > W / 2 - 0.4) continue;
      const ly = y + lf(ex * 0.995, ez * 0.995);
      const ix = ex - sx * 0.32, iz = ez - sz * 0.32;
      b.box(along ? 0.09 : 0.5, 0.09, along ? 0.5 : 0.09, C.woodDark, ix, ly - 0.1, iz, { col: false, mat: 'wood' });
    }
    // 连檐（分段贴合起翘）
    const seg = 10;
    for (let i = 0; i < seg; i++) {
      const u0 = -half + (i * L) / seg, u1 = -half + ((i + 1) * L) / seg;
      const p0 = along ? [u0, sz * D / 2] : [sx * W / 2, u0], p1 = along ? [u1, sz * D / 2] : [sx * W / 2, u1];
      beam(b, p0[0], y + lf(p0[0] * 0.995, p0[1] * 0.995) - 0.06, p0[1], p1[0], y + lf(p1[0] * 0.995, p1[1] * 0.995) - 0.06, p1[1], 0.12, C.woodDark, 'wood', false, 0.06);
    }
  }
}

// 攒尖顶檐口：沿多边形各边布置椽头、连檐与檐头瓦当（起翘与屋面一致）
function eavesPoly(b, n, R, H, y, rot, lift) {
  for (let k = 0; k < n; k++) {
    const a0 = rot + (k / n) * Math.PI * 2, a1 = rot + ((k + 1) / n) * Math.PI * 2;
    const A = [R * Math.cos(a0), R * Math.sin(a0)], B = [R * Math.cos(a1), R * Math.sin(a1)];
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]), m = Math.max(4, Math.round(L / 0.36));
    const nx = Math.cos((a0 + a1) / 2), nz = Math.sin((a0 + a1) / 2), ry = Math.atan2(-(B[1] - A[1]), B[0] - A[0]);
    const ly = (s) => y + H * lift * Math.pow(Math.max(0, 1 - Math.min(s, 1 - s) / 0.32), 2);
    {
      const nw = Math.max(2, Math.floor((L - 0.6) / 0.3)), ryo = Math.atan2(nx, nz);
      for (let i = 0; i < nw; i++) {
        const s = (0.3 + (i + 0.5) * ((L - 0.6) / nw)) / L, x = A[0] + (B[0] - A[0]) * s - nx * 0.05, z = A[1] + (B[1] - A[1]) * s - nz * 0.05;
        b.add(WADANG.g, 0x2c3b46, 'std', { x, y: ly(s) + 0.02, z, ry: ryo, col: false });
        b.add(WADANG.f, 0x2c3b46, 'std', { x, y: ly(s) + 0.02, z, ry: ryo, col: false });
      }
    }
    for (let i = 1; i < m; i++) {
      const s = i / m, x = A[0] + (B[0] - A[0]) * s, z = A[1] + (B[1] - A[1]) * s;
      b.box(0.09, 0.09, 0.48, C.woodDark, x - nx * 0.3, ly(s) - 0.1, z - nz * 0.3, { col: false, mat: 'wood', ry: ry + Math.PI / 2 });
    }
    const seg = 8;
    for (let i = 0; i < seg; i++) {
      const s0 = i / seg, s1 = (i + 1) / seg;
      beam(b, A[0] + (B[0] - A[0]) * s0, ly(s0) - 0.06, A[1] + (B[1] - A[1]) * s0, A[0] + (B[0] - A[0]) * s1, ly(s1) - 0.06, A[1] + (B[1] - A[1]) * s1, 0.12, C.woodDark, 'wood', false, 0.06);
    }
  }
}

// 屋脊沿一串点铺设（点为屋面上的实际位置，脊身中心抬高 lift0；th 为脊宽）：脊贴着凹曲的屋面走，不再是悬空的直杆
export function ridgeAlong(b, pts, th, color, mat, lift0 = 0.12) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0, z0] = pts[i], [x1, y1, z1] = pts[i + 1];
    beam(b, x0, y0 + lift0, z0, x1, y1 + lift0, z1, th, color, mat, false, th * 0.82);
  }
}
// 角脊（庑殿的四条垂脊 / 截顶腰檐的戗脊）：沿屋面的角线采样。W、D 为屋面外廓，tMax 为截顶比例，返回四条线的点列
export function hipCornerLines(W, D, H, y, { tMax = 1, lift = 0.16, p = 1.7, n = 9, span = 0 } = {}) {
  // 角线：自檐角 (±W/2, ±D/2) 向内、向上，两个方向各收进 E·t（E 为短边之半），高度 H·t^p 加起翘
  const lf = liftFn(W, D, H, lift, span), E = Math.min(W, D) / 2, out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * tMax, X = sx * (W / 2 - E * t), Z = sz * (D / 2 - E * t);
      pts.push([X, y + H * Math.pow(t, p) + lf(X * 0.999, Z * 0.999), Z]);
    }
    out.push({ sx, sz, pts });
  }
  return out;
}
// 角脊上的走兽（脊端起翘处一列小兽，越往上越小）
function ridgeFigures(b, pts, n, color, mat) {
  for (let f = 0; f < n; f++) {
    const i = Math.min(pts.length - 2, 1 + f), [x0, y0, z0] = pts[i], [x1, y1, z1] = pts[i + 1], u = 0.5;
    const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u, z = z0 + (z1 - z0) * u, k = 1 - f * 0.12;
    b.slab(0.17 * k, 0.24 * k, 0.17 * k, color, x, y + 0.24, z, { mat, col: false });
    b.sphere(0.09 * k, color, x, y + 0.24 + 0.27 * k, z, { mat, col: false, seg: 6, seg2: 4 });
  }
}
function hipRidges(b, W, D, H, y, color, mat, figs = 3, p = 1.7, lift = 0.16, span = 0) {
  const alongX = W >= D, L = Math.abs(W - D);
  const ex0 = alongX ? L / 2 : 0, ez0 = alongX ? 0 : L / 2;
  if (L > 0.5) {
    b.box(alongX ? L + 0.6 : 0.5, 0.62, alongX ? 0.5 : L + 0.6, color, 0, y + H + 0.24, 0, { mat, col: false });
    for (const s of [-1, 1]) ridgeBeast(b, s * ex0, y + H, s * ez0, alongX, s, color, mat);
  }
  for (const ln of hipCornerLines(W, D, H, y, { p, lift, span })) {
    ridgeAlong(b, ln.pts, 0.32, color, mat, 0.14);
    ridgeFigures(b, ln.pts, figs, color, mat);
  }
}
// 正脊两端的鸱吻（简化为卷尾造型）
function ridgeBeast(b, x, y, z, alongX, s, color, mat, k = 1) {
  b.slab(alongX ? 0.45 * k : 0.8 * k, 1.35 * k, alongX ? 0.8 * k : 0.45 * k, color, x, y, z, { mat, col: false });
  b.box(alongX ? 0.42 * k : 0.75 * k, 0.4 * k, alongX ? 0.75 * k : 0.42 * k, color, x - (alongX ? s * 0.22 * k : 0), y + 1.38 * k, z - (alongX ? 0 : s * 0.22 * k),
    { mat, col: false, rz: alongX ? s * 0.6 : 0, rx: alongX ? 0 : -s * 0.6 });
}

// ---------------- 鎏金屋脊构件（依主要建筑三视图：正脊两端鸱吻、正脊正中火焰宝珠、各脊端卷草）----------------
// 鸱吻：正脊两端的卷尾龙吻（alongX：正脊沿 X；s：哪一端；k：尺度）
const CHIWEN_TAIL = new Map();
export function goldChiwen(b, x, y, z, alongX, s, k = 1) {
  // 吻身：与屋脊同色的琉璃，下宽上收，略向脊内倾；张口朝脊、卷尾朝外——卷尾为一道回卷的鎏金带，背上一列短鳍
  const G = C.gold, R = C.ridge, ux = alongX ? -s : 0, uz = alongX ? 0 : -s;       // 朝向脊中
  b.slab(alongX ? 0.4 * k : 0.82 * k, 0.95 * k, alongX ? 0.82 * k : 0.4 * k, R, x, y, z, { mat: 'glaze', col: false });
  b.slab(alongX ? 0.34 * k : 0.7 * k, 0.32 * k, alongX ? 0.7 * k : 0.34 * k, R, x + ux * 0.12 * k, y + 0.92 * k, z + uz * 0.12 * k, { mat: 'glaze', col: false });
  b.box(alongX ? 0.1 * k : 0.86 * k, 0.12 * k, alongX ? 0.86 * k : 0.1 * k, G, x - ux * 0.16 * k, y + 0.45 * k, z - uz * 0.16 * k, { mat: 'gold', col: false });
  const key = k.toFixed(2);
  let tail = CHIWEN_TAIL.get(key);
  if (!tail) {
    // 卷尾曲线（本地：+X 朝脊外，Y 向上）：自吻身顶向外上方伸出，回卷成一圈
    const P = [[-0.05, 1.05], [0.12, 1.32], [0.32, 1.52], [0.5, 1.5], [0.58, 1.32], [0.48, 1.16], [0.32, 1.18], [0.3, 1.32], [0.4, 1.38]];
    tail = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(P.map(([a, h]) => new THREE.Vector3(a * k, h * k, 0))), 18, 0.075 * k, 5, false);
    CHIWEN_TAIL.set(key, tail);
  }
  const ry = alongX ? (s > 0 ? 0 : Math.PI) : (s > 0 ? -Math.PI / 2 : Math.PI / 2);
  b.add(tail, G, 'gold', { x, y, z, ry, col: false });
  for (let i = 0; i < 3; i++) {
    const t = i / 2, a = -0.1 - t * 0.32;
    b.add(new THREE.ConeGeometry(0.05 * k, 0.24 * k, 4), G, 'gold', { x: x - ux * a * k, y: y + (1.2 - 0.06 * t) * k, z: z - uz * a * k, col: false });
  }
}
// 正脊正中的火焰宝珠：莲座 + 宝珠 + 三簇火焰
export function goldPearl(b, x, y, z, k = 1) {
  const G = C.gold;
  b.cyl(0.3 * k, 0.42 * k, 0.2 * k, G, x, y + 0.1 * k, z, { mat: 'gold', col: false, seg: 10 });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.add(new THREE.ConeGeometry(0.08 * k, 0.26 * k, 4), G, 'gold', { x: x + Math.cos(a) * 0.3 * k, y: y + 0.28 * k, z: z + Math.sin(a) * 0.3 * k, rx: Math.sin(a) * 0.6, rz: -Math.cos(a) * 0.6, col: false }); }
  b.sphere(0.3 * k, G, x, y + 0.62 * k, z, { mat: 'gold', seg: 12, seg2: 8 });
  b.add(new THREE.ConeGeometry(0.13 * k, 0.6 * k, 6), G, 'gold', { x, y: y + 1.14 * k, z, col: false });
  for (const s of [-1, 1]) b.add(new THREE.ConeGeometry(0.1 * k, 0.46 * k, 6), G, 'gold', { x: x + s * 0.24 * k, y: y + 0.98 * k, z, rz: -s * 0.45, col: false });
}
// 脊端卷草（戗脊、角脊末端翘起的鎏金饰件）
export function goldCurl(b, x, y, z, k = 1) {
  b.add(new THREE.ConeGeometry(0.09 * k, 0.5 * k, 5), C.gold, 'gold', { x, y: y + 0.22 * k, z, col: false });
  b.sphere(0.1 * k, C.gold, x, y + 0.06 * k, z, { mat: 'gold', seg: 6, seg2: 4 });
}

// 博风板：沿山花斜边（垂脊之下）一条浅木色板，略出山花面；pts 为垂脊各点（自正脊端到山花底），(nx, nz) 为山花外法线，h 板高
function bargeBoard(b, pts, nx, nz, h, color, mat) {
  const pos = [], uv = [], nrm = [];
  let u = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [xa, ya, za] = pts[i], [xb, yb, zb] = pts[i + 1], L = Math.hypot(xb - xa, yb - ya, zb - za);
    const q = [[xa, ya - h, za, u, 0], [xb, yb - h, zb, u + L, 0], [xb, yb + 0.02, zb, u + L, 1], [xa, ya + 0.02, za, u, 1]];
    const flip = -(zb - za) * nx + (xb - xa) * nz < 0;             // 绕序朝外
    for (const k of flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) {
      const [x, yy, z, uu, vv] = q[k];
      pos.push(x + nx * 0.1, yy, z + nz * 0.1); uv.push(uu, vv); nrm.push(nx, 0, nz);
    }
    u += L;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  b.add(g, color, mat, { col: false });
}

export function roofAssembly(b, type, W, D, H, y, color, mat, o = {}) {
  const ridgeC = o.ridgeColor ?? C.ridge;
  const underC = o.underColor ?? (mat === 'glaze' ? C.paintTeal : C.woodUnder);
  if (type === 'hip') {
    b.add(hipRoofGeo(W, D, H, o), color, mat, { y, col: false });
    if (o.under !== false) b.add(hipRoofGeo(W, D, H, o), underC, o.underMat || 'under', { y: y - 0.12, col: false });
    hipRidges(b, W, D, H, y, ridgeC, mat === 'glaze' ? 'glaze' : 'roof', 3, o.p ?? 1.7, o.lift ?? 0.16, o.span || 0);
    if (o.gold) {
      const k = o.goldK ?? Math.min(1.5, Math.max(0.55, Math.min(W, D) / 9)), alongX = W >= D, L = Math.abs(W - D), lf = liftFn(W, D, H, o.lift ?? 0.16, o.span || 0);
      for (const s of [-1, 1]) goldChiwen(b, alongX ? s * L / 2 : 0, y + H + 0.2, alongX ? 0 : s * L / 2, alongX, s, k);
      goldPearl(b, 0, y + H + 0.5, 0, k * 0.9);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) goldCurl(b, sx * W / 2 * 0.97, y + lf(sx * W / 2 * 0.999, sz * D / 2 * 0.999) + 0.3, sz * D / 2 * 0.97, k * 0.8);
    }
  } else if (type === 'xieshan') {
    const r = xieshanRoofGeo(W, D, H, o);
    b.add(r.roof, color, mat, { y, col: false });
    if (o.under !== false && !o.upper) b.add(r.roof, underC, o.underMat || 'under', { y: y - 0.12, col: false });
    if (r.gable) b.add(o.gableMat ? r.gableN : r.gable, o.gableColor ?? C.woodRed, o.gableMat || 'wood', { y, col: false });
    const L = r.ridge, along = !r.rot;
    const rx = along ? L / 2 : 0, rz = along ? 0 : L / 2;
    const rm = mat === 'glaze' ? 'glaze' : 'roof';
    b.box(along ? L + 0.5 : 0.5, 0.6, along ? 0.5 : L + 0.5, ridgeC, 0, y + H + 0.22, 0, { mat: rm, col: false });
    if (o.gold) {
      const k = o.goldK ?? Math.min(1.5, Math.max(0.55, Math.min(W, D) / 9));
      b.box(along ? L + 0.4 : 0.14, 0.06, along ? 0.14 : L + 0.4, C.gold, 0, y + H + 0.55, 0, { mat: 'gold', col: false });
      for (const s of [-1, 1]) goldChiwen(b, s * rx, y + H + 0.2, s * rz, along, s, k);
      if (!o.upper) goldPearl(b, 0, y + H + 0.5, 0, k * 0.9);
    } else for (const s of [-1, 1]) ridgeBeast(b, s * rx, y + H - 0.05, s * rz, along, s, ridgeC, rm, 0.85);
    const fk = o.fishK ?? 1;
    if (o.fish) for (const s of [-1, 1]) b.slab(0.3 * fk, 0.45 * fk, 0.3 * fk, C.gold, along ? s * (W / 2 - r.g + 0.12) : 0, y + H - 0.85, along ? 0 : s * (D / 2 - r.g + 0.12), { mat: 'gold', col: false });
    // 垂脊（山花两侧，自正脊端沿山花边下到下部屋面）与戗脊（沿下部四坡的角线到檐角）：都按屋面的实际曲线采样
    {
      const lift = o.lift ?? 0.16, p = o.p ?? 1.6, hs = o.hs ?? 0.45, tS = Math.pow(hs, 1 / p);
      const Wc = Math.max(W, D), Dc = Math.min(W, D), E = Dc / 2, g = r.g, zs = E * (1 - tS);
      const lf = liftFn(W, D, H, lift, o.span || 0);
      const M = (xc, zc) => (along ? [xc, zc] : [zc, xc]);           // 标准方向（长边沿 X）→ 实际
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const corner = [], gable = [], n = 8;
        for (let i = 0; i <= n; i++) {
          const t = tS * (1 - i / n);                                   // 自垂脊下端到檐角
          const [X, Z] = M(sx * (Wc / 2 - g * (t / tS)), sz * E * (1 - t));
          corner.push([X, y + H * Math.pow(t, p) + lf(X * 0.999, Z * 0.999), Z]);
          const t2 = 1 - (1 - tS) * (i / n);                            // 自正脊端到垂脊下端
          const [X2, Z2] = M(sx * (Wc / 2 - g), sz * E * (1 - t2));
          gable.push([X2, y + H * Math.pow(t2, p) + lf(X2 * 0.999, Z2 * 0.999), Z2]);
        }
        ridgeAlong(b, gable, 0.26, ridgeC, rm, 0.12);
        if (o.bofeng) { const [nx, nz] = M(sx, 0); bargeBoard(b, gable, nx, nz, o.bofeng, C.woodLight, 'trFascia'); }
        if (o.upper) continue;                                          // 十字脊的第二座：戗脊与第一座重合
        ridgeAlong(b, corner, 0.3, ridgeC, rm, 0.13);
        ridgeFigures(b, [...corner].reverse(), 3, ridgeC, rm);
        const [ex, ey, ez] = corner[n];
        if (o.gold && o.curl !== false) goldCurl(b, ex * 0.985, ey + 0.2, ez * 0.985, o.goldK ?? Math.min(1.2, Math.max(0.5, Math.min(W, D) / 10)));
      }
    }
  } else if (type === 'gable' || type === 'juan') {
    b.add(gableRoofGeo(W, D, H, { juan: type === 'juan' }), color, mat, { y, col: false });
    if (o.under !== false) b.add(gableRoofGeo(W, D, H, { juan: type === 'juan' }), underC, 'under', { y: y - 0.1, col: false });
    const rm = mat === 'glaze' ? 'glaze' : mat === 'thatch' ? 'thatch' : 'roof';
    if (type === 'gable' && mat !== 'thatch') {
      b.box(W + 0.24, 0.42, 0.4, ridgeC, 0, y + H + 0.12, 0, { mat: rm, col: false });
      for (const s of [-1, 1]) b.slab(0.34, 0.75, 0.5, ridgeC, s * (W / 2 - 0.05), y + H, 0, { mat: rm, col: false });
    }
    // 博风板（山面两坡沿口）
    for (const s of [-1, 1]) {
      const seg = 6;
      for (const sz of [-1, 1]) for (let i = 0; i < seg; i++) {
        const z0 = sz * (D / 2) * (i / seg), z1 = sz * (D / 2) * ((i + 1) / seg);
        const yy0 = type === 'juan' ? H * (1 - 3 * (i / seg) ** 2 + 2 * (i / seg) ** 3) : gableY(D, H, z0);
        const yy1 = type === 'juan' ? H * (1 - 3 * ((i + 1) / seg) ** 2 + 2 * ((i + 1) / seg) ** 3) : gableY(D, H, z1);
        beam(b, s * (W / 2 + 0.03), y + yy0 - 0.08, z0, s * (W / 2 + 0.03), y + yy1 - 0.08, z1, 0.3, mat === 'thatch' ? C.wood : C.woodDark, 'wood', false, 0.05);
      }
    }
  } else if (type === 'pyramid' || type === 'hex' || type === 'oct') {
    const n = type === 'pyramid' ? 4 : type === 'hex' ? 6 : 8;
    const R = W / 2 / Math.cos(Math.PI / n), rot = n === 4 ? Math.PI / 4 : 0;
    b.add(pyramidRoofGeo(n, R, H, { rot, ...o }), color, mat, { y, col: false });
    if (o.under !== false) b.add(pyramidRoofGeo(n, R, H, { rot, ...o }), underC, 'under', { y: y - 0.1, col: false });
    // 角脊：沿屋面角线的凹曲（与 pyramidRoofGeo 的角点高度一致），分段贴合
    const lift = o.lift ?? 0.22, p = o.p ?? 1.6, ry = (t) => H * Math.pow(t, p) + H * lift * Math.pow(1 - t, 2.5);
    for (let k = 0; k < n; k++) {
      const a = rot + (k / n) * Math.PI * 2, cx = Math.cos(a) * R * 0.985, cz = Math.sin(a) * R * 0.985;
      const seg = 7;
      for (let i = 0; i < seg; i++) {
        const t0 = 0.02 + (i / seg) * 0.97, t1 = 0.02 + ((i + 1) / seg) * 0.97;
        beam(b, cx * (1 - t0), y + ry(t0) + 0.16, cz * (1 - t0), cx * (1 - t1), y + ry(t1) + 0.16, cz * (1 - t1), 0.24, ridgeC, 'roof');
      }
    }
    if (o.gold) for (let k2 = 0; k2 < n; k2++) { const a = rot + (k2 / n) * Math.PI * 2; goldCurl(b, Math.cos(a) * R * 0.96, y + H * lift + 0.2, Math.sin(a) * R * 0.96, o.goldK ?? Math.min(1, Math.max(0.4, R / 6))); }
    b.cyl(0.22, 0.42, 0.7, ridgeC, 0, y + H + 0.2, 0, { mat: 'roof', col: false, seg: 8 });
    b.sphere(0.34, o.finial ?? C.gold, 0, y + H + 0.85, 0, { mat: o.finial ? 'stoneSmooth' : 'gold' });
    b.cyl(0.04, 0.09, 0.8, o.finial ?? C.gold, 0, y + H + 1.4, 0, { mat: o.finial ? 'stoneSmooth' : 'gold', col: false });
  }
  if (o.eaves === false) return;
  if (type === 'pyramid' || type === 'hex' || type === 'oct') {
    const n = type === 'pyramid' ? 4 : type === 'hex' ? 6 : 8;
    eavesPoly(b, n, W / 2 / Math.cos(Math.PI / n), H, y, n === 4 ? Math.PI / 4 : 0, o.lift ?? 0.22);
  } else eaves(b, type, W, D, H, y, o);
}

export const ROOF_K = { hip: 0.4, xieshan: 0.42, gable: 0.34, juan: 0.28, pyramid: 0.45, hex: 0.5, oct: 0.5 };

// ---------------- 门窗 ----------------
// 隔扇门（关闭）：宽 w，高 h，底面在 y，位于本地 z 平面，法线 +Z
// 每扇：隔心（棂格糊纸，退进框面）、绦环板、裙板（板心起线）；边梃、抹头有 12–14 厘米进深
export function doorLeaves(b, cx, y, z, w, h, { leaves = 4, frame = C.woodRed, paper = C.paper, back = true } = {}) {
  const lw = w / leaves;
  for (let i = 0; i < leaves; i++) {
    const x = cx - w / 2 + (i + 0.5) * lw;
    b.panel(lw - 0.08, h * 0.56, paper, x, y + h * 0.66, z + 0.01);
    if (back) b.panel(lw - 0.08, h * 0.56, paper, x, y + h * 0.66, z - 0.03, { ry: Math.PI });
    b.box(lw - 0.08, h * 0.28, 0.06, frame, x, y + h * 0.2, z, { col: false, mat: 'wood' });                       // 裙板
    b.box(lw - 0.24, h * 0.28 - 0.16, 0.08, frame, x, y + h * 0.2, z, { col: false, mat: 'wood', detail: true });                // 板心起线
    b.box(lw - 0.08, h * 0.04, 0.06, frame, x, y + h * 0.355, z, { col: false, mat: 'wood', detail: true });                     // 绦环板
    b.box(0.07, h, 0.13, frame, cx - w / 2 + i * lw, y + h / 2, z, { col: false, mat: 'wood' });
  }
  b.box(0.07, h, 0.13, frame, cx + w / 2, y + h / 2, z, { col: false, mat: 'wood' });
  b.box(w, 0.08, 0.13, frame, cx, y + h * 0.375, z, { col: false, mat: 'wood' });
  b.box(w, 0.07, 0.13, frame, cx, y + 0.035, z, { col: false, mat: 'wood' });
  b.box(w, 0.08, 0.13, frame, cx, y + h - 0.04, z, { col: false, mat: 'wood' });
}
// 槛窗：下为槛墙，上为窗
// 一间四扇隔扇门：两边两扇关着，中间两扇以外缘为轴向内（-Z）开 open 弧度；门洞上下有槛框
export function openLeaves(b, cx, y, z, w, h, open = 1.2, frame = C.vermilion) {
  const lw = w / 4, a = Math.abs(open);
  for (const s of [-1, 1]) {
    doorLeaves(b, cx + s * (w / 2 - lw / 2), y, z, lw, h, { leaves: 1, frame });
    b.push(cx + s * lw, y, z - 0.02, -s * a);
    doorLeaves(b, -s * lw / 2, 0, 0, lw, h, { leaves: 1, frame });
    b.pop();
  }
  b.box(w + 0.1, 0.1, 0.18, frame, cx, y + h + 0.05, z, { mat: 'wood', col: false });
  b.box(w + 0.1, 0.07, 0.18, frame, cx, y + 0.035, z, { mat: 'wood', col: false });
}
// 槛窗：下为槛墙，墙上压榻板（出墙面）；窗框 16 厘米进深（风槛、上槛、抱框、中槛），棂格窗心退进框面约 9 厘米；
// 上部一道横披窗，宽窗分两到三扇（扇间立梃）
export function sillWindow(b, cx, y, z, w, h, { sill = 0.85, frame = C.woodRed, wall = C.brickWarm, paper = C.paper, back = true, wallMat = 'stone' } = {}) {
  b.slab(w, sill, 0.32, wall, cx, y, z - 0.08, { col: false, mat: wallMat });
  b.slab(w + 0.04, 0.06, 0.42, frame, cx, y + sill, z - 0.05, { col: false, mat: 'wood' });                       // 榻板
  const y0 = y + sill + 0.06, wh = h - sill - 0.06;
  const tb = Math.min(0.42, wh * 0.22), nC = w > 2.6 ? 3 : w > 1.3 ? 2 : 1, cw = (w - 0.18) / nC;
  const ph = wh - tb - 0.2;
  for (let i = 0; i < nC; i++) {
    const x = cx - w / 2 + 0.09 + (i + 0.5) * cw;
    b.panel(cw - 0.06, ph, paper, x, y0 + 0.1 + ph / 2, z - 0.01);
    if (back) b.panel(cw - 0.06, ph, paper, x, y0 + 0.1 + ph / 2, z - 0.05, { ry: Math.PI });
  }
  b.panel(w - 0.18, tb - 0.02, paper, cx, y + h - 0.0825 - tb / 2, z - 0.01);                                       // 横披
  if (back) b.panel(w - 0.18, tb - 0.02, paper, cx, y + h - 0.0825 - tb / 2, z - 0.05, { ry: Math.PI });
  b.box(w, 0.1, 0.16, frame, cx, y0 + 0.05, z, { col: false, mat: 'wood' });                                        // 风槛
  b.box(w, 0.1, 0.16, frame, cx, y + h - 0.05, z, { col: false, mat: 'wood' });                                     // 上槛
  b.box(w, 0.07, 0.13, frame, cx, y + h - 0.1 - tb, z, { col: false, mat: 'wood' });                                // 中槛
  for (const s of [-1, 1]) b.box(0.09, wh, 0.16, frame, cx + s * (w / 2 - 0.045), y0 + wh / 2, z, { col: false, mat: 'wood' });   // 抱框
  for (let i = 1; i < nC; i++) b.box(0.065, ph + 0.04, 0.12, frame, cx - w / 2 + 0.09 + i * cw, y0 + 0.08 + ph / 2 + 0.02, z, { col: false, mat: 'wood' });
}

// ---------------- 殿堂 ----------------
// 返回 { top, floor, zf, zb, roofY, W, D }
export function hall(b, o = {}) {
  const w = o.w ?? 20, d = o.d ?? 12, bays = o.bays ?? Math.max(1, Math.round(w / 4) | 1), dbays = o.dbays ?? Math.max(1, Math.round(d / 4));
  const h = o.h ?? 6, base = o.base ?? 1.2, margin = o.margin ?? clamp(d * 0.2, 1.0, 3.2);
  const type = o.roof ?? 'hip', nEaves = o.eaves ?? 1;
  const rmat = o.glaze ? 'glaze' : 'roof', rcol = o.roofColor ?? C.tile;
  const wallCol = o.wallColor ?? C.plaster, pillar = o.pillar ?? C.pillar, frame = o.frame ?? C.woodRed;
  const bw = w / bays, bd = d / dbays;
  const rc = o.rc ?? clamp(bw * 0.06, 0.15, 0.36);
  const porch = o.porch ?? (dbays >= 3 ? bd : 0);
  const zf = d / 2 - porch, zb = -d / 2;
  const front = o.front ?? 'doors', back = o.back ?? 'wall', sides = o.sides ?? 'wall';
  const mid = Math.floor(bays / 2);
  const doorBays = o.doorBays ?? (bays >= 5 ? [mid - 1, mid, mid + 1] : [mid]);
  const dg = o.dougong ?? w >= 12;
  const painted = o.painted ?? true;
  const dgS = clamp(bw * 0.15, 0.3, 0.75);
  let y = 0;

  // 台基与踏步
  if (base > 0) {
    const bc = o.baseColor ?? C.stone;
    b.slab(w + 2 * margin, base - 0.22, d + 2 * margin, bc, 0, -0.3, 0, { mat: 'stone' });
    b.slab(w + 2 * margin + 0.24, 0.22, d + 2 * margin + 0.24, o.capColor ?? C.stoneWarm, 0, base - 0.22, 0, { mat: 'stoneSmooth' });
    b.slab(w + 2 * margin + 0.3, 0.3, d + 2 * margin + 0.3, C.stoneDark, 0, -0.3, 0, { mat: 'stone', col: false });
    const sw = o.stairW ?? Math.min(w * 0.5, bw * (doorBays.length + 0.2));
    if (o.stairs !== false) {
      const run = 0.34, nS = Math.max(1, Math.round(base / 0.19));
      stairs(b, 0, 0, d / 2 + margin + nS * run, sw, base, { color: bc });
      if (o.backStairs) stairs(b, 0, 0, -(d / 2 + margin + nS * run), sw, base, { color: bc, ry: Math.PI });
    }
    if (o.rail) {
      const X = w / 2 + margin - 0.2, Z = d / 2 + margin - 0.2, g = sw / 2 + 0.5;
      rail(b, [[-g, Z], [-X, Z], [-X, -Z], [X, -Z], [X, Z], [g, Z]], base, { color: o.railColor ?? C.marble, h: 0.85 });
    }
    y = base;
  }
  const floorY = y;
  b.slab(w + 0.6, 0.04, d + 0.6, C.stoneWarm, 0, y - 0.03, 0, { mat: 'stoneSmooth', col: false });

  // 柱与柱础
  const cols = [];
  for (let i = 0; i <= bays; i++) { const x = -w / 2 + i * bw; cols.push([x, d / 2]); cols.push([x, -d / 2]); }
  for (let j = 1; j < dbays; j++) { const z = -d / 2 + j * bd; cols.push([-w / 2, z]); cols.push([w / 2, z]); }
  if (porch > 0 && front !== 'open') for (let i = 1; i < bays; i++) cols.push([-w / 2 + i * bw, zf]);
  for (const [x, z] of cols) {
    columnBase(b, x, y, z, rc, { bronze: !!o.bronzeBase });
    b.cyl(rc * 0.92, rc, h, pillar, x, y + h / 2, z, { seg: 12, mat: 'wood' });
  }

  // 墙
  const tw = Math.max(0.4, rc * 2), wh = h - 0.55;
  const wallSeg = (L, cx, cz, alongX) => {
    b.slab(alongX ? L : tw, 0.9, alongX ? tw : L, o.dadoColor ?? C.brickWarm, cx, y, cz, { mat: 'stone' });
    b.slab(alongX ? L : tw * 0.92, wh - 0.9, alongX ? tw * 0.92 : L, wallCol, cx, y + 0.9, cz, { mat: o.wallMat ?? 'std' });
  };
  if (sides === 'wall') for (const s of [-1, 1]) wallSeg(zf - zb, s * w / 2, (zf + zb) / 2, false);
  else if (sides === 'windows') for (const s of [-1, 1]) for (let j = 0; j < dbays; j++) {
    const z0 = zb + j * bd, z1 = Math.min(zf, z0 + bd);
    if (z1 - z0 < 0.5) continue;
    b.push(s * w / 2, 0, (z0 + z1) / 2, s * Math.PI / 2);
    sillWindow(b, 0, y, 0, z1 - z0 - 2 * rc, wh, { frame, wall: o.dadoColor ?? C.brickWarm });
    b.pop();
    b.collider(s * w / 2, y, y + wh, (z0 + z1) / 2, tw / 2, (z1 - z0) / 2);
  }
  if (back === 'wall') {
    wallSeg(w, 0, zb, true);
    if (o.backWindows !== false) for (let i = 0; i < bays; i++) b.panel(bw - 2 * rc - 0.6, 1.1, C.paper, -w / 2 + (i + 0.5) * bw, y + wh - 1.2, zb - tw / 2 - 0.02, { ry: Math.PI });
  }
  if (front !== 'open') {
    for (let i = 0; i < bays; i++) {
      const cx = -w / 2 + (i + 0.5) * bw, iw = bw - 2 * rc;
      if (front === 'wall') { b.slab(iw, wh, tw, wallCol, cx, y, zf); continue; }
      const top = wh - 0.7;
      b.panel(iw - 0.1, 0.55, C.paper, cx, y + wh - 0.38, zf + 0.03);                                         // 横披窗
      b.box(iw, 0.1, 0.12, frame, cx, y + top, zf, { col: false, mat: 'wood' });
      b.box(iw, 0.1, 0.12, frame, cx, y + wh - 0.05, zf, { col: false, mat: 'wood' });
      if (front === 'doors' && doorBays.includes(i)) {
        b.slab(iw, 0.2, 0.18, frame, cx, y, zf, { col: false, mat: 'wood' });                                 // 门槛
        doorLeaves(b, cx, y + 0.2, zf, iw, top - 0.2, { frame });
      } else sillWindow(b, cx, y, zf, iw, top, { frame, wall: o.dadoColor ?? C.brickWarm });
      b.collider(cx, y, y + wh, zf, iw / 2 + rc, tw / 2);
    }
  }

  // 梁枋：彩画或素木
  const bh = 0.5, beamC = painted ? (o.beam ?? C.paintBlue) : C.wood, beamC2 = painted ? (o.beam2 ?? C.paintGreen) : C.woodDark;
  for (const s of [-1, 1]) {
    b.slab(w + rc * 2, bh, rc * 1.5, beamC, 0, y + h - bh, s * d / 2, { col: false, mat: painted ? 'std' : 'wood' });
    b.slab(w + rc * 2, 0.28, rc * 1.2, beamC2, 0, y + h - bh - 0.34, s * d / 2, { col: false, mat: painted ? 'std' : 'wood' });
    b.slab(rc * 1.5, bh, d + rc * 2, beamC, s * w / 2, y + h - bh, 0, { col: false, mat: painted ? 'std' : 'wood' });
    if (painted) b.slab(w * 0.2, bh * 0.7, rc * 1.55, C.gold, 0, y + h - bh * 0.85, s * d / 2, { col: false, mat: 'gold' });       // 箍头/盒子
  }
  if (porch > 0) b.slab(w + rc * 2, bh * 0.8, rc * 1.3, beamC, 0, y + h - bh * 0.8, zf, { col: false, mat: painted ? 'std' : 'wood' });
  let yTop = y + h;
  if (dg) {
    b.slab(w + rc * 3, 0.16, d + rc * 3, painted ? C.woodRed : C.wood, 0, yTop, 0, { col: false, mat: 'wood' });
    yTop += 0.16;
    const spots = [];
    for (let i = 0; i <= bays * 2; i++) { const x = -w / 2 + (i * bw) / 2; spots.push([x, d / 2, 0]); spots.push([x, -d / 2, Math.PI]); }
    for (let j = 1; j < dbays * 2; j++) { const z = -d / 2 + (j * bd) / 2; spots.push([w / 2, z, Math.PI / 2]); spots.push([-w / 2, z, -Math.PI / 2]); }
    let dh = 0;
    for (const [x, z, ry] of spots) dh = dougong(b, x, yTop, z, dgS, ry, painted);
    yTop += dh;
  } else {
    b.slab(w + rc * 2.4, 0.22, d + rc * 2.4, C.woodDark, 0, yTop, 0, { col: false, mat: 'wood' });
    yTop += 0.22;
  }

  // 屋顶
  const ov = o.overhang ?? clamp(Math.min(w, d) * 0.2, 1.0, 3.2);
  let W = w + 2 * ov, D = d + 2 * ov, roofY = yTop, Hr, top;
  const ropt = { ...(o.roofOpts || {}), fish: o.fish ?? painted, ridgeColor: o.ridgeColor };
  if (nEaves === 2) {
    const H1 = Math.min(W, D) * 0.4, tM = 0.3;
    b.add(hipRoofGeo(W, D, H1, { tMax: tM }), rcol, rmat, { y: yTop, col: false });
    b.add(hipRoofGeo(W, D, H1, { tMax: tM }), o.glaze ? C.paintTeal : C.woodUnder, 'under', { y: yTop - 0.12, col: false });
    eaves(b, 'hip', W, D, H1, yTop);
    for (const ln of hipCornerLines(W, D, H1, yTop, { tMax: tM, n: 5 })) ridgeAlong(b, ln.pts, 0.28, o.ridgeColor ?? C.ridge, rmat, 0.13);
    if (ropt.gold) { const lf1 = liftFn(W, D, H1, 0.16); for (const sx of [-1, 1]) for (const sz of [-1, 1]) goldCurl(b, sx * W / 2 * 0.97, yTop + lf1(sx * W / 2 * 0.999, sz * D / 2 * 0.999) + 0.25, sz * D / 2 * 0.97, Math.min(1.1, Math.min(W, D) / 12)); }
    const ringTop = yTop + H1 * Math.pow(tM, 1.7);
    const wi = Math.max(w * 0.6, w - 2 * bd), di = Math.max(d * 0.55, d - 2 * bd), uh = Math.max(2.0, h * 0.42);
    b.slab(wi, uh + 0.5, di, wallCol, 0, ringTop - 0.5, 0);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) b.panel(wi / 5 - 0.5, uh * 0.5, C.paper, -wi / 2 + (i + 0.5) * wi / 5, ringTop + uh * 0.48, s * (di / 2 + 0.03), { ry: s > 0 ? 0 : Math.PI });
      b.slab(wi + 0.3, 0.42, 0.36, beamC, 0, ringTop + uh - 0.42, s * di / 2, { col: false });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(rc * 0.9, rc * 0.9, uh + 0.5, pillar, sx * wi / 2, ringTop - 0.5 + (uh + 0.5) / 2, sz * di / 2, { col: false, mat: 'wood' });
    let y2 = ringTop + uh;
    if (dg) {
      for (let i = 0; i <= 8; i++) for (const s of [-1, 1]) dougong(b, -wi / 2 + (i * wi) / 8, y2, s * di / 2, dgS * 0.8, s > 0 ? 0 : Math.PI, painted);
      y2 += 0.72 * dgS * 0.8;
    }
    W = wi + 2 * ov * 0.95; D = di + 2 * ov * 0.95;
    Hr = Math.min(W, D) * (ROOF_K[type] ?? 0.4);
    roofAssembly(b, type, W, D, Hr, y2, rcol, rmat, ropt);
    roofY = y2;
    top = y2 + Hr;
    b.collider(0, yTop, ringTop + 0.3, 0, (w + 2 * ov) / 2 * 0.95, (d + 2 * ov) / 2 * 0.95);
  } else {
    Hr = (type === 'pyramid' ? W : Math.min(W, D)) * (ROOF_K[type] ?? 0.4);
    roofAssembly(b, type, W, D, Hr, yTop, rcol, rmat, ropt);
    top = yTop + Hr;
  }
  b.collider(0, roofY, roofY + Hr * 0.45, 0, W / 2 * 0.9, D / 2 * 0.9);
  b.collider(0, roofY + Hr * 0.45, roofY + Hr * 0.9, 0, W / 2 * 0.5, D / 2 * 0.45);
  if (o.plaque) {
    const pm = plaqueMesh(o.plaque, Math.min(bw * 0.95, 4.6), Math.min(bw * 0.4, 1.6), o.plaqueStyle);
    pm.position.set(0, y + h - bh - 0.35, d / 2 + rc * 0.8 + 0.06);
    b.addMesh(pm);
  }
  return { top, floor: floorY, zf, zb, roofY, W, D, ov };
}

// ---------------- 亭 ----------------
export function pavilion(b, o = {}) {
  const n = o.n ?? 4, r = o.r ?? 3, h = o.h ?? 3.4, base = o.base ?? 0.6;
  const rcol = o.roofColor ?? C.tile, rmat = o.glaze ? 'glaze' : 'roof', rot = n === 4 ? Math.PI / 4 : 0;
  b.cyl(r * 1.28, r * 1.34, base, C.stone, 0, base / 2, 0, { seg: n, mat: 'stone', walk: true, ry: rot, col: false });
  b.collider(0, 0, base, 0, r * 1.05, r * 1.05, 0, { walk: true });
  // 入口踏步（台基高于一级时）
  if (base > 0.3) {
    const ea = rot + ((((o.entrance ?? 0) + 0.5) / n) * Math.PI * 2), ed = r * 1.28 * Math.cos(Math.PI / n) + 0.3;
    b.push(Math.cos(ea) * ed, 0, Math.sin(ea) * ed, Math.atan2(Math.cos(ea), Math.sin(ea)));
    b.slab(r * 0.9, base * 0.5, 0.7, C.stoneWarm, 0, 0, 0, { mat: 'stoneSmooth' });
    b.pop();
  }
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = rot + (k / n) * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    pts.push([x, z]);
    b.cyl(0.24, 0.26, 0.22, C.stoneWarm, x, base + 0.11, z, { seg: 8, mat: 'stoneSmooth', col: false });
    b.cyl(0.14, 0.16, h, o.pillar ?? C.woodRed, x, base + h / 2, z, { seg: 8, mat: 'wood' });
  }
  for (let k = 0; k < n; k++) {
    const [x0, z0] = pts[k], [x1, z1] = pts[(k + 1) % n];
    beam(b, x0, base + h - 0.22, z0, x1, base + h - 0.22, z1, 0.3, o.beam ?? C.woodDark, 'wood');
    beam(b, x0 * 0.98, base + h - 0.62, z0 * 0.98, x1 * 0.98, base + h - 0.62, z1 * 0.98, 0.12, o.beam ?? C.woodDark, 'wood');
    if (o.benches !== false && k !== (o.entrance ?? 0)) {
      beam(b, x0 * 0.96, base + 0.46, z0 * 0.96, x1 * 0.96, base + 0.46, z1 * 0.96, 0.34, C.woodRed, 'wood', true, 0.42);
      beam(b, x0 * 1.03, base + 0.86, z0 * 1.03, x1 * 1.03, base + 0.86, z1 * 1.03, 0.08, C.woodRed, 'wood');
      for (let q = 1; q < 6; q++) {
        const u = q / 6, x = (x0 + (x1 - x0) * u) * 1.02, z = (z0 + (z1 - z0) * u) * 1.02;
        b.slab(0.04, 0.4, 0.04, C.woodRed, x, base + 0.48, z, { col: false, mat: 'wood' });
      }
    }
  }
  const W = 2 * r * 1.62 * Math.cos(Math.PI / n);
  const kind = n === 4 ? 'pyramid' : n === 6 ? 'hex' : 'oct';
  if (o.eaves === 2) {
    b.add(pyramidRoofGeo(n, r * 1.6, r * 0.7, { tMax: 0.4, rot }), rcol, rmat, { y: base + h, col: false });
    b.cyl(r * 0.7, r * 0.7, 1.4, C.woodRed, 0, base + h + 0.8, 0, { seg: n, ry: rot, col: false });
    roofAssembly(b, kind, 2 * r * 1.05 * Math.cos(Math.PI / n), 0, r * 0.95, base + h + 1.4, rcol, rmat, { finial: o.finial });
  } else roofAssembly(b, kind, W, 0, r * 1.08, base + h, rcol, rmat, { finial: o.finial });
  b.collider(0, base + h, base + h + r * 0.6, 0, r * 1.2, r * 1.2, rot);
  return base + h + r * 1.08;
}

// ---------------- 桥 ----------------
// 石拱桥（沿本地 X，两端桥面在 y=0）
export function stoneBridge(b, o = {}) {
  const L = o.len ?? 16, w = o.w ?? 5.5, rise = o.rise ?? 1.4, color = o.color ?? C.stone, mat = 'stoneSmooth';
  const n = Math.max(8, Math.round(L / 1.0));
  const Y = (x) => rise * (1 - (2 * x / L) ** 2);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const xa = -L / 2 + (i * L) / n, xb = xa + L / n, ya = Y(xa), yb = Y(xb), xm = (xa + xb) / 2, ym = Y(xm);
    b.box(L / n + 0.04, 0.5, w, color, xm, ym - 0.25, 0, { mat, rz: Math.atan2(yb - ya, L / n), col: false, jitter: 0.06 });
    b.collider(xm, ym - 2.5, ym, 0, L / n / 2 + 0.02, w / 2);
    pts.push([xa, ya]);
  }
  pts.push([L / 2, Y(L / 2)]);
  for (const s of [-1, 1]) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [xa, ya] = pts[i], [xb, yb] = pts[i + 1];
      beam(b, xa, ya + 0.82, s * (w / 2 - 0.14), xb, yb + 0.82, s * (w / 2 - 0.14), 0.16, o.railColor ?? C.stoneWarm, mat);
      beam(b, xa, ya + 0.3, s * (w / 2 - 0.14), xb, yb + 0.3, s * (w / 2 - 0.14), 0.4, o.railColor ?? C.stoneWarm, 'stone', false, 0.12);
      if (i % 2 === 0) b.slab(0.2, 1.0, 0.2, o.railColor ?? C.stoneWarm, xa, ya, s * (w / 2 - 0.14), { mat, col: false });
    }
    b.collider(0, -1, rise + 1.1, s * (w / 2 - 0.1), L / 2, 0.14, 0, { walk: false, cam: false });
    // 拱券侧面
    const ar = L * 0.32;
    b.add(new THREE.TorusGeometry(ar, 0.35, 6, 20, Math.PI), C.stoneDark, 'stone', { x: 0, y: rise - 0.9 - ar * 0.7, z: s * (w / 2 - 0.05), sy: 0.7, col: false });
    b.slab(L * 0.9, rise + 0.6, 0.3, color, 0, -1.6, s * (w / 2 - 0.15), { mat: 'stone', col: false, sy: 1 });
  }
}

// ---------------- 小品 ----------------
export function lion(b, x, y, z, ry = 0, s = 1) {
  b.push(x, y, z, ry);
  b.slab(1.3 * s, 0.9 * s, 1.7 * s, C.stoneWarm, 0, 0, 0, { mat: 'stone' });
  b.sphere(0.55 * s, C.stoneWarm, 0, 1.45 * s, -0.18 * s, { mat: 'stoneSmooth', sx: 1, sy: 1.1, sz: 1.2 });
  b.sphere(0.52 * s, C.stone, 0, 2.1 * s, 0.22 * s, { mat: 'stoneSmooth', sx: 1.1, sy: 1.0, sz: 0.9 });
  b.sphere(0.34 * s, C.stoneWarm, 0, 2.08 * s, 0.55 * s, { mat: 'stoneSmooth' });
  for (const k of [-1, 1]) b.cyl(0.15 * s, 0.19 * s, 0.9 * s, C.stoneWarm, k * 0.36 * s, 1.35 * s, 0.48 * s, { mat: 'stoneSmooth', col: false });
  b.sphere(0.26 * s, C.stoneWarm, 0.36 * s, 1.0 * s, 0.68 * s, { mat: 'stoneSmooth' });
  b.collider(0, 0, 2.6 * s, 0, 0.7 * s, 0.9 * s);
  b.pop();
}

export function burner(b, x, y, z, s = 1) {
  b.push(x, y, z, 0);
  b.slab(2.0 * s, 0.35 * s, 2.0 * s, C.stoneWarm, 0, 0, 0, { mat: 'stoneSmooth' });
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; b.cyl(0.08 * s, 0.12 * s, 0.6 * s, C.bronze, Math.cos(a) * 0.45 * s, 0.35 * s + 0.3 * s, Math.sin(a) * 0.45 * s, { mat: 'bronze', col: false }); }
  b.sphere(0.65 * s, C.bronze, 0, 1.3 * s, 0, { mat: 'bronze', sy: 0.75 });
  b.cyl(0.5 * s, 0.62 * s, 0.25 * s, C.bronze, 0, 1.7 * s, 0, { mat: 'bronze', col: false });
  b.add(new THREE.ConeGeometry(0.45 * s, 0.7 * s, 8), C.bronze, 'bronze', { x: 0, y: 2.15 * s, z: 0, col: false });
  b.sphere(0.12 * s, C.bronze, 0, 2.55 * s, 0, { mat: 'bronze' });
  for (const k of [-1, 1]) b.add(new THREE.TorusGeometry(0.15 * s, 0.04 * s, 5, 10), C.bronze, 'bronze', { x: k * 0.6 * s, y: 1.65 * s, z: 0, ry: Math.PI / 2, col: false });
  b.collider(0, 0, 2.4 * s, 0, 1.0 * s, 1.0 * s, 0, { walk: false });
  b.emitter('incense', 0, 2.5 * s, 0);
  b.pop();
}

export function hangLantern(b, x, y, z, s = 1, red = true) {
  b.cyl(0.012, 0.012, 0.5 * s, C.black, x, y + 0.25 * s, z, { col: false, seg: 4 });
  b.sphere(0.28 * s, red ? C.lantern : C.lanternGold, x, y - 0.22 * s, z, { mat: 'glow', sy: 1.2, seg: 10 });
  b.cyl(0.12 * s, 0.12 * s, 0.08 * s, C.woodDark, x, y + 0.06 * s, z, { col: false, seg: 8, mat: 'wood' });
  b.cyl(0.12 * s, 0.12 * s, 0.08 * s, C.woodDark, x, y - 0.55 * s, z, { col: false, seg: 8, mat: 'wood' });
  b.cyl(0.015, 0.04, 0.35 * s, C.cloth, x, y - 0.76 * s, z, { col: false, seg: 4 });
  b.emitter('light', x, y - 0.22 * s, z, { k: 0.75 });
}

export function rockery(b, x, y, z, s = 1, rand = Math.random, n = 7) {
  for (let k = 0; k < n; k++) {
    const a = rand() * Math.PI * 2, r = rand() * 1.4 * s, sc = (0.6 + rand() * 1.1) * s;
    b.add(new THREE.DodecahedronGeometry(1, 0), rand() < 0.5 ? 0x9b978c : 0x8a857a, 'stone',
      { x: x + Math.cos(a) * r, y: y + sc * 0.5 + rand() * s * 0.8, z: z + Math.sin(a) * r, sx: sc * 0.9, sy: sc * (1.1 + rand() * 0.9), sz: sc * 0.8, ry: rand() * 3, rx: (rand() - 0.5) * 0.5, col: false });
  }
  b.collider(x, y, y + 2.2 * s, z, 1.6 * s, 1.6 * s);
}

export function vat(b, x, y, z, s = 1) {
  b.cyl(0.62 * s, 0.48 * s, 0.85 * s, C.brickDark, x, y + 0.42 * s, z, { mat: 'stoneSmooth' });
  b.cyl(0.56 * s, 0.56 * s, 0.04, C.water, x, y + 0.78 * s, z, { col: false, mat: 'glaze' });
}

// ---------------- 匾额（画布文字）----------------
const plaqueTex = new Map();
export function plaqueTexture(text, { bg = '#22384a', fg = '#e2c27a', frame = '#7a5a34', vertical = false, w = 512, h = 168 } = {}) {
  const key = [text, bg, fg, frame, vertical].join('|');
  let tex = plaqueTex.get(key);
  if (tex) return tex;
  const cw = vertical ? h : w, ch = vertical ? w : h;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d');
  g.fillStyle = frame; g.fillRect(0, 0, cw, ch);
  g.fillStyle = bg; g.fillRect(16, 16, cw - 32, ch - 32);
  g.strokeStyle = fg; g.globalAlpha = 0.55; g.lineWidth = 3; g.strokeRect(26, 26, cw - 52, ch - 52); g.globalAlpha = 1;
  g.fillStyle = fg;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = [...text];
  const size = vertical ? Math.min(118, (ch - 80) / chars.length) : Math.min(112, (cw - 90) / chars.length);
  g.font = `bold ${size}px "STXingkai","STKaiti","KaiTi","Kaiti SC","Noto Serif SC","SimSun",serif`;
  g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 3; g.shadowOffsetY = 2;
  chars.forEach((c, i) => {
    if (vertical) g.fillText(c, cw / 2, 46 + size / 2 + i * size + ((ch - 92) - size * chars.length) / 2);
    else g.fillText(c, 45 + size / 2 + i * size + ((cw - 90) - size * chars.length) / 2, ch / 2 + 4);
  });
  tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  plaqueTex.set(key, tex);
  return tex;
}

export function plaqueMesh(text, w, h, style = {}) {
  const tex = plaqueTexture(text, style);
  const pw = style.vertical ? h : w, ph = style.vertical ? w : h;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.05 });
  // 盒子六面合成两组（边框一组、正面贴图一组），两次绘制
  const g = new THREE.BoxGeometry(pw, ph, 0.1), I = g.index.array;
  const order = [0, 1, 2, 3, 5, 4], idx = [];
  for (const f of order) for (let k = 0; k < 6; k++) idx.push(I[f * 6 + k]);
  g.setIndex(idx); g.clearGroups(); g.addGroup(0, 30, 0); g.addGroup(30, 6, 1);
  const m = new THREE.Mesh(g, [new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 0.8 }), mat]);   // 边框材质不共享（各建筑的淡化各自独立）
  m.castShadow = true;
  m.userData.fadeable = true;
  return m;
}
