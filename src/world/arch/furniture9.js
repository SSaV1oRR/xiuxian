// 家具与陈设（第九轮，依参考包 D03 家具、D07 炼丹器物；尺寸按人物 1.7 米校准）
//   D03-01 木桌（1.6 × 0.8 × 0.75 米：桌面有厚度、四腿、牙板与角牙、横枨）+ 茶具（青花壶、杯、茶盘）
//   D03-03 木长凳（座高 0.45）  D03-04 石桌石凳（桌径 1 米、高 0.72，腰身莲瓣、青玉嵌带；鼓凳开光）
//   D03-05 书柜（1.2 × 0.42 × 2.0：上部棂格柜门、下部敞格放书册与卷轴）  D03-06 竹帘（半卷、流苏）与边柜（抽屉、对开门、铜拉手）
//   官帽椅、绣墩、瓷瓶、竹篮、陶罐等直接复用项目里的 Poly Haven 实物模型（见 models.js placeProp）
// 本地原点：底面中心；正面朝 +Z。碰撞只给桌、柜、凳这类大件（不碰撞的小物不加）
import * as THREE from 'three';
import { C } from './builder.js';
import { petalRing } from './stone9.js';

const TAU = Math.PI * 2;
const WD = 0x5a3a2c, WD2 = 0x49342d;           // 家具深木（#49342D 起步，桌面略暖）
const POR = 0xece8df, BLUE = 0x3e5b8a;         // 瓷白、青花

// D03-01 木桌
export function table9(b, x, y, z, ry = 0, { L = 1.6, D = 0.8, H = 0.75, top = WD } = {}) {
  b.push(x, y, z, ry);
  const t = 0.06, lg = 0.07;
  b.slab(L, t, D, top, 0, H - t, 0, { mat: 'wood', col: false });                                   // 桌面（冰盘沿）
  b.slab(L - 0.04, 0.025, D - 0.04, WD2, 0, H - t - 0.025, 0, { mat: 'wood', col: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.slab(lg, H - t, lg, WD2, sx * (L / 2 - 0.1), 0, sz * (D / 2 - 0.08), { mat: 'wood', col: false });
  for (const sz of [-1, 1]) {
    b.slab(L - 0.26, 0.09, 0.025, WD2, 0, H - t - 0.115, sz * (D / 2 - 0.08), { mat: 'wood', col: false });     // 牙板
    for (const sx of [-1, 1]) b.box(0.14, 0.1, 0.02, WD2, sx * (L / 2 - 0.2), H - t - 0.17, sz * (D / 2 - 0.08), { rz: sx * 0.6, mat: 'wood', col: false });   // 角牙
    b.slab(L - 0.26, 0.04, 0.035, WD2, 0, 0.12, sz * (D / 2 - 0.08), { mat: 'wood', col: false });             // 横枨
  }
  for (const sx of [-1, 1]) {
    b.slab(0.025, 0.09, D - 0.2, WD2, sx * (L / 2 - 0.1), H - t - 0.115, 0, { mat: 'wood', col: false });
    b.slab(0.035, 0.04, D - 0.2, WD2, sx * (L / 2 - 0.1), 0.12, 0, { mat: 'wood', col: false });
  }
  b.collider(0, 0, H, 0, L / 2, D / 2);
  b.pop();
  return H;
}

// 茶具：茶盘、青花执壶、三只杯（桌面之上，y 为桌面高）
export function teaSet(b, x, y, z, ry = 0) {
  b.push(x, y, z, ry);
  const D = { detail: true };
  b.slab(0.42, 0.025, 0.28, 0x3b2a22, 0, 0, 0, { mat: 'wood', col: false, ...D });
  b.sphere(0.065, POR, -0.08, 0.085, 0, { mat: 'glaze', sy: 0.85, seg: 12, seg2: 8, ...D });               // 壶身
  b.cyl(0.066, 0.066, 0.02, BLUE, -0.08, 0.085, 0, { seg: 12, mat: 'glaze', col: false, ...D });           // 青花带
  b.cyl(0.03, 0.04, 0.03, POR, -0.08, 0.15, 0, { seg: 10, mat: 'glaze', col: false, ...D });               // 壶盖
  b.sphere(0.012, BLUE, -0.08, 0.172, 0, { mat: 'glaze', seg: 6, seg2: 4, ...D });
  b.add(new THREE.CylinderGeometry(0.009, 0.014, 0.09, 6), POR, 'glaze', { x: -0.0, y: 0.1, z: 0, rz: -0.9, col: false, ...D });          // 壶嘴
  b.add(new THREE.TorusGeometry(0.035, 0.008, 5, 10, Math.PI * 1.2), POR, 'glaze', { x: -0.15, y: 0.09, z: 0, rz: Math.PI * 0.4, col: false, ...D });   // 壶把
  for (let i = 0; i < 3; i++) {
    const cx = 0.06 + (i % 2) * 0.08, cz = -0.07 + i * 0.07;
    b.cyl(0.026, 0.017, 0.032, POR, cx, 0.041, cz, { seg: 10, mat: 'glaze', col: false, ...D });
    b.cyl(0.0265, 0.0265, 0.007, BLUE, cx, 0.05, cz, { seg: 10, mat: 'glaze', col: false, ...D });
  }
  b.pop();
}

// D03-03 木长凳
export function bench9(b, x, y, z, ry = 0, L = 1.6) {
  b.push(x, y, z, ry);
  const H = 0.45, D = 0.38;
  b.slab(L, 0.06, D, WD, 0, H - 0.06, 0, { mat: 'wood', col: false });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.slab(0.06, H - 0.06, 0.06, WD2, sx * (L / 2 - 0.14), 0, sz * (D / 2 - 0.07), { mat: 'wood', col: false });
    b.slab(0.04, 0.04, D - 0.14, WD2, sx * (L / 2 - 0.14), 0.12, 0, { mat: 'wood', col: false });
  }
  for (const sz of [-1, 1]) {
    b.slab(L - 0.36, 0.07, 0.022, WD2, 0, H - 0.13, sz * (D / 2 - 0.07), { mat: 'wood', col: false });
    for (const sx of [-1, 1]) b.box(0.12, 0.08, 0.018, WD2, sx * (L / 2 - 0.23), H - 0.16, sz * (D / 2 - 0.07), { rz: sx * 0.6, mat: 'wood', col: false });
  }
  b.collider(0, 0, H, 0, L / 2, D / 2, 0, { walk: true, cam: false });
  b.pop();
}

// D03-04 石桌与四只鼓凳
export function stoneSet9(b, x, y, z, ry = 0) {
  b.push(x, y, z, ry);
  const M = C.marble, Mw = C.marbleWarm, Ms = C.marbleShade, J = C.jade;
  b.cyl(0.36, 0.42, 0.1, Ms, 0, 0.05, 0, { seg: 20, mat: 'stoneSmooth', col: false });                   // 座
  b.add(petalRing(0.22, 14), Mw, 'stoneSmooth', { y: 0.14, sx: 0.32, sz: 0.32, sy: 0.32 * 0.9, col: false });   // 覆莲
  b.cyl(0.2, 0.26, 0.42, M, 0, 0.36, 0, { seg: 16, mat: 'stoneSmooth', col: false });                    // 腰身
  b.add(petalRing(0.22, 14), Mw, 'stoneSmooth', { y: 0.58, sx: 0.28, sz: 0.28, sy: 0.28 * -0.9, col: false });  // 仰莲
  b.cyl(0.5, 0.48, 0.08, Mw, 0, 0.64, 0, { seg: 28, mat: 'stoneSmooth', col: false });
  b.cyl(0.51, 0.51, 0.045, J, 0, 0.69, 0, { seg: 28, mat: 'jade', col: false });                         // 青玉嵌带
  b.cyl(0.5, 0.5, 0.04, M, 0, 0.73, 0, { seg: 28, mat: 'stoneSmooth', col: false });                     // 桌面
  b.cylCollider(0, 0, 0.75, 0, 0.5);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + TAU / 8, sx = Math.cos(a) * 0.95, sz = Math.sin(a) * 0.95;
    b.cyl(0.17, 0.15, 0.42, Mw, sx, 0.21, sz, { seg: 14, mat: 'stoneSmooth', col: false });               // 鼓凳
    b.cyl(0.175, 0.175, 0.04, M, sx, 0.42, sz, { seg: 14, mat: 'stoneSmooth', col: false });
    for (let m = 0; m < 4; m++) {
      const am = (m / 4) * TAU + a;
      b.box(0.12, 0.14, 0.02, J, sx + Math.cos(am) * 0.17, 0.22, sz + Math.sin(am) * 0.17, { ry: -am + Math.PI / 2, mat: 'jade', col: false });   // 开光
    }
    b.cylCollider(sx, 0, 0.44, sz, 0.17);
  }
  b.pop();
}

// D03-05 书柜：上部两扇棂格柜门，下部两层敞格（书册、卷轴、小匣）
export function bookcase9(b, x, y, z, ry = 0, { W = 1.2, D = 0.42, H = 2.0, seed = 1 } = {}) {
  b.push(x, y, z, ry);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const t = 0.04;
  b.slab(W, t, D, WD, 0, H - t, 0, { mat: 'wood', col: false });
  for (const sx of [-1, 1]) b.slab(t, H, D, WD2, sx * (W / 2 - t / 2), 0, 0, { mat: 'wood', col: false });
  b.slab(W - 2 * t, H - 0.1, 0.02, WD2, 0, 0.08, -D / 2 + 0.01, { mat: 'wood', col: false });          // 背板
  b.slab(W, 0.08, D, WD2, 0, 0, 0, { mat: 'wood', col: false });
  const shelves = [0.1, 0.62, 1.12];
  for (const sy of shelves) b.slab(W - 2 * t, 0.03, D - 0.02, WD, 0, sy, 0.01, { mat: 'wood', col: false });
  // 上部柜门（棂格糊纸）
  for (const sx of [-1, 1]) {
    const dw = (W - 2 * t) / 2 - 0.02, cx = sx * ((W - 2 * t) / 4);
    b.panel(dw - 0.08, H - 1.2 - 0.12, C.paper, cx, 1.15 + (H - 1.2 - t) / 2, D / 2 + 0.005);
    for (const yy of [1.15, H - t - 0.03]) b.box(dw, 0.05, 0.03, WD2, cx, yy, D / 2, { mat: 'wood', col: false });
    for (const e of [-1, 1]) b.box(0.04, H - 1.2 - t, 0.03, WD2, cx + e * (dw / 2 - 0.02), 1.15 + (H - 1.2 - t) / 2, D / 2, { mat: 'wood', col: false });
    b.cyl(0.035, 0.035, 0.012, C.bronze, sx * 0.05, 1.5, D / 2 + 0.02, { rx: Math.PI / 2, seg: 10, mat: 'bronze', col: false });
  }
  // 敞格：书册（深蓝、赭、灰绿书衣，一册册立着或平放）、卷轴、小匣
  const covers = [0x2f3e57, 0x5a3b2c, 0x46524a, 0x6a5a3e, 0x2c3a4a];
  for (const sy of [0.13, 0.65]) {
    let px = -W / 2 + t + 0.04;
    while (px < W / 2 - t - 0.12) {
      const r = rnd();
      if (r < 0.62) {
        const bw = 0.035 + rnd() * 0.03, bh = 0.24 + rnd() * 0.14;
        b.slab(bw, bh, D - 0.12, covers[Math.floor(rnd() * covers.length)], px + bw / 2, sy + 0.03, 0.02, { col: false, detail: true });
        px += bw + 0.004;
      } else if (r < 0.8) {
        for (let k = 0; k < 3; k++) b.cyl(0.03, 0.03, D - 0.14, 0xd9cfb4, px + 0.05 + (k % 2) * 0.03, sy + 0.06 + k * 0.05, 0.02, { rx: Math.PI / 2, seg: 8, col: false, detail: true });
        px += 0.14;
      } else {
        b.slab(0.2, 0.1, D - 0.14, 0x4a2e22, px + 0.1, sy + 0.03, 0.02, { mat: 'wood', col: false });
        b.box(0.04, 0.03, 0.01, C.bronze, px + 0.1, sy + 0.1, (D - 0.14) / 2 + 0.025, { mat: 'bronze', col: false });
        px += 0.24;
      }
    }
  }
  b.collider(0, 0, H, 0, W / 2, D / 2);
  b.pop();
}

// D03-06 边柜：一屉两门，铜拉手与面叶
export function sideCabinet9(b, x, y, z, ry = 0, { W = 0.8, D = 0.44, H = 0.86 } = {}) {
  b.push(x, y, z, ry);
  b.slab(W + 0.04, 0.035, D + 0.04, WD, 0, H - 0.035, 0, { mat: 'wood', col: false });
  b.slab(W, H - 0.12, D, WD2, 0, 0.09, 0, { mat: 'wood', col: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.slab(0.05, 0.1, 0.05, WD2, sx * (W / 2 - 0.03), 0, sz * (D / 2 - 0.03), { mat: 'wood', col: false });
  b.box(W - 0.08, 0.16, 0.02, WD, 0, H - 0.15, D / 2 + 0.008, { mat: 'wood', col: false });            // 抽屉
  b.box(0.06, 0.018, 0.012, C.bronze, 0, H - 0.15, D / 2 + 0.022, { mat: 'bronze', col: false });
  for (const sx of [-1, 1]) {
    b.box(W / 2 - 0.06, H - 0.4, 0.02, WD, sx * (W / 4), 0.12 + (H - 0.4) / 2 + 0.02, D / 2 + 0.008, { mat: 'wood', col: false });
    b.box(W / 2 - 0.14, H - 0.52, 0.012, 0x6a4636, sx * (W / 4), 0.12 + (H - 0.4) / 2 + 0.02, D / 2 + 0.02, { mat: 'wood', col: false });   // 门心板
    b.add(new THREE.TorusGeometry(0.022, 0.005, 4, 10), C.bronze, 'bronze', { x: sx * 0.035, y: 0.12 + (H - 0.4) / 2, z: D / 2 + 0.028, col: false });
  }
  b.collider(0, 0, H, 0, W / 2, D / 2);
  b.pop();
}

// D03-06 竹帘：挂在檐枋下，半卷（顶部一卷竹帘、放下一段竹条），两侧流苏；x、z 为帘中心，yTop 为挂杆高
export function blind9(b, x, yTop, z, ry, w = 1.2, drop = 0.9) {
  b.push(x, yTop, z, ry);
  const BAM = 0xb79a64, BAM2 = 0xa48955;
  b.cyl(0.05, 0.05, w + 0.04, BAM2, 0, -0.07, 0, { rz: Math.PI / 2, seg: 10, mat: 'wood', col: false });    // 卷起的帘
  const n = Math.max(4, Math.round(w / 0.16)), sw = w / n;
  for (let i = 0; i < n; i++) b.box(sw - 0.006, drop, 0.012, i % 2 ? BAM : BAM2, -w / 2 + (i + 0.5) * sw, -0.07 - drop / 2, 0, { mat: 'wood', col: false });
  b.box(w + 0.02, 0.025, 0.02, 0x6a4e34, 0, -0.07 - drop, 0, { mat: 'wood', col: false });
  for (const s of [-1, 1]) {
    b.cyl(0.004, 0.004, drop * 0.7, 0x8a6a3a, s * (w / 2 - 0.1), -0.07 - drop * 0.35, 0.02, { seg: 3, col: false });
    b.add(new THREE.ConeGeometry(0.025, 0.12, 6), 0xa8382c, 'cloth', { x: s * (w / 2 - 0.1), y: -0.07 - drop * 0.7 - 0.06, z: 0.02, rx: Math.PI, col: false });
  }
  b.pop();
}

// ---------------- 炼丹器物（D07）----------------
// 药罐三种（D07-03）：白瓷绘枝、青瓷暗纹、褐釉；罐身（车削）+ 罐盖 + 盖钮；h 为罐高
const JAR_PROF = [[0.001, 0], [0.32, 0], [0.42, 0.08], [0.5, 0.35], [0.48, 0.6], [0.36, 0.8], [0.28, 0.86], [0.3, 0.9], [0.001, 0.9]].map(([r, y]) => new THREE.Vector2(r, y));
const JAR = new THREE.LatheGeometry(JAR_PROF, 10);
const JAR_KIND = [[0xe2ddcf, 0x6b5a44], [0x8fae98, 0x5e7a68], [0x5e3a26, 0x3a2418]];
export function herbJar(b, x, y, z, h = 0.3, kind = 0) {
  const [body, lid] = JAR_KIND[kind % 3];
  b.add(JAR, body, 'glaze', { x, y, z, sx: h * 0.55, sy: h, sz: h * 0.55, col: false });
  b.cyl(h * 0.17, h * 0.2, h * 0.08, lid, x, y + h * 0.94, z, { seg: 10, mat: 'glaze', col: false, detail: true });
  b.sphere(h * 0.06, lid, x, y + h * 1.0, z, { mat: 'glaze', seg: 6, seg2: 4, detail: true });
}
// 储药柜（D07-03）：多宝格（3 × 4 格，铜包角），每格一罐；本地正面 +Z
export function jarCabinet9(b, x, y, z, ry = 0, { W = 1.6, H = 1.65, D = 0.45, rows = 3, cols = 4 } = {}) {
  b.push(x, y, z, ry);
  const t = 0.05, cw = (W - 2 * t) / cols, ch = (H - 0.16 - t) / rows;
  b.slab(W, t, D, WD, 0, H - t, 0, { mat: 'wood', col: false });
  b.slab(W, 0.12, D, WD2, 0, 0.04, 0, { mat: 'wood', col: false });
  for (const sx of [-1, 1]) b.slab(t, H - 0.04, D, WD2, sx * (W / 2 - t / 2), 0.04, 0, { mat: 'wood', col: false });
  b.slab(W - 2 * t, H - 0.2, 0.025, WD2, 0, 0.16, -D / 2 + 0.013, { mat: 'wood', col: false });
  for (let r = 1; r < rows; r++) b.slab(W - 2 * t, 0.03, D - 0.03, WD, 0, 0.16 + r * ch - 0.015, 0.015, { mat: 'wood', col: false });
  for (let c = 1; c < cols; c++) b.slab(0.03, H - 0.2 - t, D - 0.03, WD, -W / 2 + t + c * cw, 0.16, 0.015, { mat: 'wood', col: false });
  for (const sx of [-1, 1]) for (const yy of [0.06, H - 0.12]) b.box(0.1, 0.1, 0.012, C.bronze, sx * (W / 2 - 0.05), yy + 0.05, D / 2 + 0.006, { mat: 'bronze', col: false });   // 铜包角
  for (const sx of [-1, 1]) b.box(0.012, 0.1, 0.1, C.bronze, sx * (W / 2 + 0.006), H - 0.07, D / 2 - 0.05, { mat: 'bronze', col: false });
  let k = (Math.abs(Math.round(x * 3 + z * 7))) % 3;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) herbJar(b, -W / 2 + t + (c + 0.5) * cw, 0.16 + r * ch + 0.015, 0.02, Math.min(ch - 0.06, 0.3), (k++) % 3);
  b.collider(0, 0, H, 0, W / 2, D / 2);
  b.pop();
}
// 操作台（D07-04）：厚木台（拼板、粗腿、横枨），台上石臼与杵、铜药秤、青瓷碗与铜碗、一方麻布
export function workTable9(b, x, y, z, ry = 0, { L = 1.8, D = 0.85, H = 0.82 } = {}) {
  b.push(x, y, z, ry);
  const t = 0.08;
  for (let k = 0; k < 4; k++) b.slab(L, t, D / 4 - 0.006, k % 2 ? WD : 0x5e3e2e, 0, H - t, -D / 2 + (k + 0.5) * D / 4, { mat: 'wood', col: false });   // 拼板
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.slab(0.1, H - t, 0.1, WD2, sx * (L / 2 - 0.12), 0, sz * (D / 2 - 0.1), { mat: 'wood', col: false });
  for (const sz of [-1, 1]) b.slab(L - 0.34, 0.06, 0.05, WD2, 0, 0.18, sz * (D / 2 - 0.1), { mat: 'wood', col: false });
  for (const sx of [-1, 1]) b.slab(0.05, 0.06, D - 0.3, WD2, sx * (L / 2 - 0.12), 0.18, 0, { mat: 'wood', col: false });
  // 石臼（白石、外壁粗）与杵
  b.cyl(0.17, 0.13, 0.17, C.marbleShade, -L * 0.3, H + 0.085, 0.05, { seg: 12, mat: 'stone', col: false });
  b.cyl(0.13, 0.13, 0.012, 0x6a6a52, -L * 0.3, H + 0.168, 0.05, { seg: 12, col: false });
  b.add(new THREE.CylinderGeometry(0.03, 0.045, 0.34, 8), C.marbleWarm, 'stoneSmooth', { x: -L * 0.3 + 0.07, y: H + 0.27, z: 0.05, rz: -0.55, col: false });
  // 铜药秤：底座、立柱、横梁、两只秤盘
  const sx0 = L * 0.12;
  b.slab(0.24, 0.04, 0.12, WD2, sx0, H, -0.2, { mat: 'wood', col: false });
  b.cyl(0.012, 0.014, 0.42, C.bronze, sx0, H + 0.25, -0.2, { seg: 6, mat: 'bronze', col: false });
  b.box(0.42, 0.014, 0.014, C.bronze, sx0, H + 0.45, -0.2, { mat: 'bronze', col: false });
  for (const s of [-1, 1]) {
    b.cyl(0.002, 0.002, 0.2, C.bronze, sx0 + s * 0.2, H + 0.35, -0.2, { seg: 3, col: false });
    b.cyl(0.075, 0.06, 0.018, C.gold, sx0 + s * 0.2, H + 0.25, -0.2, { seg: 12, mat: 'gold', col: false });
  }
  // 碗：青瓷碗（药渣）、铜碗（枸杞红）、小铜罐
  b.cyl(0.11, 0.06, 0.06, 0x9cb8a8, L * 0.32, H + 0.03, 0.12, { seg: 12, mat: 'glaze', col: false });
  b.cyl(0.095, 0.095, 0.01, 0x9a8a5a, L * 0.32, H + 0.055, 0.12, { seg: 12, mat: 'leaf', col: false });
  b.cyl(0.09, 0.05, 0.05, 0x8a6a3c, L * 0.18, H + 0.025, 0.24, { seg: 12, mat: 'bronze', col: false });
  b.cyl(0.078, 0.078, 0.01, 0xa03a2a, L * 0.18, H + 0.045, 0.24, { seg: 10, mat: 'leaf', col: false });
  b.cyl(0.06, 0.06, 0.11, C.bronze, L * 0.4, H + 0.055, -0.22, { seg: 10, mat: 'bronze', col: false });
  b.cyl(0.062, 0.05, 0.03, C.gold, L * 0.4, H + 0.125, -0.22, { seg: 10, mat: 'gold', col: false });
  // 麻布：垂在台边
  b.box(0.4, 0.01, 0.34, 0xd8d0bc, -L * 0.05, H + 0.005, D / 2 - 0.12, { mat: 'cloth', col: false });
  b.box(0.4, 0.22, 0.01, 0xd8d0bc, -L * 0.05, H - 0.1, D / 2 + 0.05, { mat: 'cloth', col: false });
  b.collider(0, 0, H, 0, L / 2, D / 2);
  b.pop();
}
// 晾晒架（D07-02）：两端 A 字木架、上下两道横杆（麻绳扎结），上杆挂药束，下层两只竹匾
export function dryRack9(b, x, y, z, ry, rand, bundle) {
  b.push(x, y, z, ry);
  const W = 2.0, H = 1.75, sp = 0.55;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.add(new THREE.CylinderGeometry(0.035, 0.045, H + 0.12, 6), 0x6a4a32, 'wood', { x: sx * W / 2, y: H / 2, z: sz * sp / 2, rx: -sz * Math.atan2(sp / 2, H), col: false });
    b.cyl(0.03, 0.03, sp * 0.8, 0x6a4a32, sx * W / 2, 0.5, 0, { rx: Math.PI / 2, seg: 6, mat: 'wood', col: false });
    b.cyl(0.045, 0.045, 0.08, 0xb89a62, sx * W / 2, H - 0.03, 0, { seg: 6, mat: 'thatch', col: false });     // 麻绳扎结
  }
  b.cyl(0.035, 0.035, W + 0.3, 0x6a4a32, 0, H - 0.03, 0, { rz: Math.PI / 2, seg: 6, mat: 'wood', col: false });
  b.cyl(0.03, 0.03, W + 0.1, 0x6a4a32, 0, 0.5, sp * 0.32, { rz: Math.PI / 2, seg: 6, mat: 'wood', col: false });
  b.cyl(0.03, 0.03, W + 0.1, 0x6a4a32, 0, 0.5, -sp * 0.32, { rz: Math.PI / 2, seg: 6, mat: 'wood', col: false });
  for (let i = 0; i < 5; i++) bundle(b, -0.8 + i * 0.4, H - 0.06, 0, 0.12, rand);
  const herb = [0x8a7a48, 0x6e7a46, 0xb8a060, 0x9a6a50];
  for (const sx of [-0.45, 0.45]) {
    b.cyl(0.4, 0.36, 0.06, 0xb79a64, sx, 0.53, 0, { seg: 16, mat: 'thatch', col: false });
    b.cyl(0.34, 0.3, 0.03, herb[Math.floor(rand() * herb.length)], sx, 0.575, 0, { seg: 12, mat: 'leaf', col: false });
  }
  b.collider(0, 0, H, 0, W / 2 + 0.1, sp / 2 + 0.05);
  b.pop();
}
