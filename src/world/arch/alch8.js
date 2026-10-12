// 丹殿与炼丹东院（第八轮，依「丹殿」三视图）：
//   正殿：五开间、重檐歇山（鎏金），前出两米檐廊（廊柱、柱础、额枋彩画），台基一米、汉白玉栏杆；
//         正间为丹房大门：抱框、门簪、两扇厚门板与鎏金丹炉纹圆章——门内即丹房室内（15 × 8.4 米，与室内场景一致，门位不变）；
//         两侧耳房三开间（槛窗、红墙），屋顶低一级。
//   东西厢房（制药房）：三开间敞厅朝院，正中一间为穿堂（通广场东回廊的侧门、通东院晒药场），两侧间内靠后墙百子药柜、药罐架，
//         前有制药长案（药秤、药钵）、药碾；院边药圃木畦与晒药架。
//   南门：三开间门楼（单檐歇山，正中板门敞开），门前一对石狮，门外分段石阶下灵池北岸。
//   东院：临东崖的丹炉台（高一米二，汉白玉台沿栏杆，南侧踏步），青铜大丹炉：三只兽足（兽面、弯腿、虎爪）、双立耳、
//         腹部饕餮纹带与鎏金弦纹、炉盖与宝顶；正面拱形火口（铜框、炉火只在火口一带），烟管自炉肩套箍接出、远离入口与树冠。
import * as THREE from 'three';
import { C } from './builder.js';
import { hall, rail, stairs, beam, dougong, doorLeaves, sillWindow, roofAssembly, plaqueMesh, goldCurl } from './arch.js';
import { plankDoors } from './gate8.js';
import { stoneLanternR } from './ornaments.js';
import { columnBase } from './stone9.js';
import { jarCabinet9, workTable9 } from './furniture9.js';

const TAU = Math.PI * 2;

// 汉白玉台基（四沿栏杆，开口 gaps：[[side, a, b]]，side 为 'n'|'s'|'e'|'w'，a..b 为沿边坐标）
function platform(b, x0, x1, z0, z1, h, gaps = []) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, W = x1 - x0, D = z1 - z0;
  b.slab(W, h - 0.18, D, C.marbleShade, cx, 0, cz, { mat: 'stone' });
  b.slab(W + 0.26, 0.18, D + 0.26, C.marble, cx, h - 0.18, cz, { mat: 'stoneSmooth' });
  b.slab(W + 0.16, 0.12, D + 0.16, C.marbleWarm, cx, 0, cz, { mat: 'stoneSmooth', col: false });
  b.collider(cx, 0, h, cz, W / 2, D / 2, 0, { walk: true });
  const cut = (a, c, side) => {
    let segs = [[a, c]];
    for (const [s, ga, gc] of gaps) if (s === side) segs = segs.flatMap(([p, q]) => (gc <= p || ga >= q ? [[p, q]] : [[p, ga], [gc, q]].filter(([u, v]) => v - u > 0.4)));
    return segs;
  };
  const ins = 0.2;
  for (const [a, c] of cut(x0 + ins, x1 - ins, 's')) rail(b, [[a, z1 - ins], [c, z1 - ins]], h, { h: 0.85, color: C.marble, spacing: 1.7, post: 0.18 });
  for (const [a, c] of cut(x0 + ins, x1 - ins, 'n')) rail(b, [[a, z0 + ins], [c, z0 + ins]], h, { h: 0.85, color: C.marble, spacing: 1.7, post: 0.18 });
  for (const [a, c] of cut(z0 + ins, z1 - ins, 'w')) rail(b, [[x0 + ins, a], [x0 + ins, c]], h, { h: 0.85, color: C.marble, spacing: 1.7, post: 0.18 });
  for (const [a, c] of cut(z0 + ins, z1 - ins, 'e')) rail(b, [[x1 - ins, a], [x1 - ins, c]], h, { h: 0.85, color: C.marble, spacing: 1.7, post: 0.18 });
}

// ---------- 正殿 + 耳房（本地原点：正殿室内中心地面；正面 +Z）----------
export function danHall8(b, o = {}) {
  const base = 1.0, MW = 15, MD = 8.4, MH = 4.3, porch = 2.0;
  const EW = 5.2, ED = 7.0, EH = 3.6, EX = MW / 2 + 0.3 + EW / 2;
  const front = MD / 2 + porch + 1.6;
  platform(b, -(EX + EW / 2 + 1.0), EX + EW / 2 + 1.0, -MD / 2 - 1.4, front, base, [['s', -3.2, 3.2], ['s', -EX - 1.4, -EX + 1.4], ['s', EX - 1.4, EX + 1.4]]);
  const nS = Math.round(base / 0.17), run = 0.32;
  stairs(b, 0, 0, front + nS * run, 6.0, base, { run, stepH: base / nS, color: C.marble, cheekW: 0.4 });
  for (const s of [-1, 1]) stairs(b, s * EX, 0, front + nS * run, 2.4, base, { run, stepH: base / nS, color: C.marble, cheekW: 0.32 });
  // 正殿：hall 的进深含前廊（门墙在 zf = MD/2，与室内一致）
  b.push(0, base, porch / 2, 0);
  const info = hall(b, { bronzeBase: true, w: MW, d: MD + porch, bays: 5, dbays: 2, h: MH, base: 0, porch, roof: 'xieshan', eaves: 2, glaze: true, roofColor: C.tileDark,
    wallColor: C.plaster, pillar: C.vermilion, frame: C.vermilion, painted: true, dougong: true, overhang: 1.7, dadoColor: C.marbleWarm,
    front: 'doors', doorBays: [], backWindows: true, sides: 'windows', roofOpts: { gold: true, goldK: 0.85 } });
  b.pop();
  // 正间：丹房大门（hall 的正间留作槛窗，这里覆上门框与两扇门板）
  // 门洞与丹房室内一致：宽 2.64、高 2.85（门槛 0.2）
  const dw = 2.64, dh = 2.95, dz = MD / 2 + 0.02;
  b.slab(MW / 5 - 0.4, MH - 0.6, 0.5, C.plaster, 0, base, dz - 0.1, { mat: 'std', col: false });
  plankDoors(b, 0, base + 0.06, dz + 0.16, dw, dh, { open: 0, rows: 7, cols: 5, color: 0x8a3a22 });
  b.cyl(0.6, 0.6, 0.06, C.gold, 0, base + dh * 0.62, dz + 0.37, { rx: Math.PI / 2, mat: 'gold', col: false, seg: 28 });
  b.cyl(0.47, 0.47, 0.07, 0x2a3a3c, 0, base + dh * 0.62, dz + 0.38, { rx: Math.PI / 2, col: false, seg: 28 });
  b.sphere(0.18, 0xf2a040, 0, base + dh * 0.6, dz + 0.42, { mat: 'glow', sy: 1.2, seg: 10, seg2: 8 });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; b.box(0.05, 0.22, 0.03, C.gold, Math.cos(a) * 0.36, base + dh * 0.62 + Math.sin(a) * 0.36, dz + 0.42, { rz: a + Math.PI / 2, mat: 'gold', col: false }); }
  const pm = plaqueMesh(o.plaque || '丹殿', 2.6, 0.9, { bg: '#2a2a28', fg: '#d9c48e', frame: '#5a4330' });
  pm.position.set(0, base + MH - 0.62, MD / 2 + porch + 0.36);
  b.addMesh(pm);
  // 耳房：三开间、槛窗、单檐歇山（低一级）
  for (const s of [-1, 1]) {
    b.push(s * EX, base, -0.6, 0);
    hall(b, { w: EW, d: ED, bays: 3, dbays: 2, h: EH, base: 0, porch: 0, roof: 'xieshan', glaze: true, roofColor: C.tileDark,
      wallColor: C.plaster, pillar: C.vermilion, frame: C.vermilion, painted: true, dougong: false, overhang: 1.2, dadoColor: C.marbleWarm,
      front: 'doors', doorBays: [1], sides: 'windows', roofOpts: { gold: true, goldK: 0.5 } });
    b.pop();
  }
  for (const s of [-1, 1]) stoneLanternR(b, s * (MW / 2 - 0.4), base, front - 0.8, 0.9);
  return { front, floor: base, top: base + info.top, porchZ: MD / 2 + porch, earX: EX };
}

// 百子药柜：本地沿 X，背靠 -Z；w 宽，rows × cols 只小抽屉（铜拉手），顶上一排药罐
function medicineCabinet(b, x, y, z, ry, w = 2.2, h = 2.1) {
  b.push(x, y, z, ry);
  b.slab(w, h, 0.5, C.woodRed, 0, 0, 0, { mat: 'wood' });
  const rows = 7, cols = Math.round(w / 0.3);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const px = -w / 2 + (c + 0.5) * w / cols, py = 0.18 + (r + 0.5) * (h - 0.3) / rows;
    b.box(w / cols - 0.04, (h - 0.3) / rows - 0.04, 0.03, (r + c) % 2 ? 0x7a3a26 : 0x6e3422, px, py, 0.26, { mat: 'wood', col: false });
    b.sphere(0.022, C.gold, px, py, 0.29, { mat: 'gold', seg: 5, seg2: 4 });
    if (c % 3 === 1 && r % 2 === 0) b.box(0.12, 0.05, 0.005, 0xe8dcc0, px, py + 0.06, 0.28, { col: false });
  }
  for (let k = 0; k < Math.round(w / 0.42); k++) b.cyl(0.11, 0.13, 0.26, [0x55704f, 0x3e5a5a, 0xc8b89a, 0x7a5a3a][k % 4], -w / 2 + 0.25 + k * 0.42, h + 0.13, 0, { mat: 'glaze', seg: 8, col: false });
  b.pop();
}
// 药碾：船形碾槽 + 铁碾轮 + 横柄
function herbGrinder(b, x, y, z, ry) {
  b.push(x, y, z, ry);
  b.slab(1.1, 0.22, 0.34, 0x4a4640, 0, 0, 0, { mat: 'bronze', col: false });
  b.add(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 18), 0x3c3a36, 'bronze', { x: 0.1, y: 0.36, z: 0, rx: Math.PI / 2, col: false });
  b.cyl(0.02, 0.02, 0.62, C.woodDark, 0.1, 0.36, 0, { rx: Math.PI / 2, seg: 6, col: false });
  b.collider(0, 0, 0.5, 0, 0.6, 0.25);
  b.pop();
}
// 药秤与药钵（案上小件）
function tableTools(b, x, y, z) {
  b.cyl(0.14, 0.1, 0.12, 0x5a564c, x - 0.5, y, z, { mat: 'bronze', seg: 10, col: false });
  b.cyl(0.015, 0.015, 0.36, C.woodDark, x - 0.5, y + 0.14, z + 0.08, { rz: 0.5, seg: 4, col: false });
  b.cyl(0.006, 0.006, 0.7, C.woodDark, x + 0.3, y + 0.42, z, { rz: Math.PI / 2, seg: 4, col: false });
  b.cyl(0.07, 0.07, 0.01, C.gold, x + 0.05, y + 0.3, z, { seg: 10, mat: 'gold', col: false });
  b.sphere(0.035, C.bronze, x + 0.6, y + 0.36, z, { mat: 'bronze', seg: 6, seg2: 4 });
  for (let k = 0; k < 3; k++) b.slab(0.18, 0.02, 0.18, 0xe8dcc0, x - 0.1 + k * 0.22, y, z - 0.22, { col: false, ry: k * 0.3 });
}

// ---------- 制药厢房：三开间敞厅朝院（本地正面 +Z），正中一间为穿堂（后墙开门） ----------
export function pharmacyWing(b, o = {}) {
  const W = o.w ?? 10, D = 6.0, H = 3.6, base = 0.45, bw = W / 3, rand = o.rand ?? Math.random;
  b.slab(W + 1.0, base, D + 1.0, C.stone, 0, -0.05, 0, { mat: 'stone' });
  b.slab(W + 1.1, 0.08, D + 1.1, C.marbleWarm, 0, base - 0.08, 0, { mat: 'stoneSmooth', col: false });
  b.collider(0, 0, base, 0, (W + 1.0) / 2, (D + 1.0) / 2, 0, { walk: true });
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) b.slab(1.8, base * (k + 1) / 3, 0.3, C.marbleWarm, 0, -0.05, s * (D / 2 + 0.5 + (3 - k) * 0.3 - 0.15), { mat: 'stoneSmooth' });
  const y = base, zb = -D / 2, zf = D / 2;
  // 柱
  for (let i = 0; i <= 3; i++) for (const z of [zf, zb]) {
    const x = -W / 2 + i * bw;
    columnBase(b, x, y, z, 0.18);
    b.cyl(0.16, 0.18, H, C.vermilion, x, y + H / 2, z, { seg: 12, mat: 'wood' });
  }
  // 后墙（两侧间）、山墙；穿堂后檐为门（板门敞开）
  // 后墙、山墙：暖白墙（下 0.6 米暖白石墙裙），后墙两间各开一扇槛窗
  for (const s of [-1, 1]) {
    b.slab(bw - 0.3, 0.6, 0.34, C.marbleWarm, s * bw, y, zb, { mat: 'stoneSmooth', col: false });
    b.slab(0.34, 0.6, D - 0.3, C.marbleWarm, s * W / 2, y, 0, { mat: 'stoneSmooth', col: false });
    b.slab(0.3, H - 1.2, D - 0.3, C.plaster, s * W / 2, y + 0.6, 0, { mat: 'std', col: false });
    b.collider(s * W / 2, y, y + H - 0.6, 0, 0.17, (D - 0.3) / 2);
    const ww = bw - 1.6;
    for (const t of [-1, 1]) b.slab((bw - 0.3 - ww) / 2, H - 1.2, 0.3, C.plaster, s * bw + t * (ww / 2 + (bw - 0.3 - ww) / 4), y + 0.6, zb, { mat: 'std', col: false });
    b.slab(ww, 0.55, 0.3, C.plaster, s * bw, y + H - 1.15, zb, { mat: 'std', col: false });
    b.push(s * bw, y, zb, Math.PI);
    sillWindow(b, 0, 0, 0, ww, H - 1.15, { sill: 1.05, frame: C.vermilion, wall: C.plaster, wallMat: 'std' });
    b.pop();
    b.collider(s * bw, y, y + H - 0.6, zb, (bw - 0.3) / 2, 0.17);
  }
  b.push(0, y, zb, Math.PI);
  plankDoors(b, 0, 0, 0, bw - 0.9, 2.7, { open: 1.2, rows: 5, cols: 4 });
  b.pop();
  b.slab(bw - 0.3, H - 0.6 - 2.94, 0.3, C.plaster, 0, y + 2.94, zb, { mat: 'std', col: false });
  // 额枋彩画、挂落
  for (const z of [zf, zb]) {
    b.slab(W + 0.4, 0.36, 0.28, C.woodRed, 0, y + H - 0.5, z, { mat: 'wood', col: false });
    b.panel(W + 0.3, 0.32, 0xffffff, 0, y + H - 0.32, z + (z > 0 ? 0.145 : -0.145), { mat: 'caihua', uvScale: [W + 0.3, 1], ry: z > 0 ? 0 : Math.PI });
  }
  for (let i = 0; i < 3; i++) {
    const xm = -W / 2 + (i + 0.5) * bw;
    b.box(bw - 0.4, 0.05, 0.05, C.woodRed, xm, y + H - 0.98, zf, { col: false, mat: 'wood' });
    for (let k = 1; k < 7; k++) b.box(0.035, 0.3, 0.035, C.woodRed, xm - bw / 2 + 0.2 + (k * (bw - 0.4)) / 7, y + H - 0.82, zf, { col: false, mat: 'wood' });
  }
  // 两侧间陈设（D07）：后墙百子药柜、山墙前储药柜（多宝格药罐），中间操作台（石臼、药秤、碗），药碾；均靠边，穿堂与廊下通道留空
  for (const s of [-1, 1]) {
    medicineCabinet(b, s * bw, y, zb + 0.45, 0, bw - 0.8, 2.1);
    jarCabinet9(b, s * (W / 2 - 0.42), y, 0.2, -s * Math.PI / 2, { W: 1.6, H: 1.65, D: 0.45 });
    jarCabinet9(b, s * (W / 2 - 0.42), y, -1.75, -s * Math.PI / 2, { W: 1.6, H: 1.65, D: 0.45 });
    workTable9(b, s * bw, y, 0.9, 0, { L: 2.0, D: 0.85, H: 0.82 });
    herbGrinder(b, s * (bw + 0.4), y, 2.3, 0.2 * s);
  }
  // 悬山顶（鎏金脊端）
  const RW = W + 1.4, RD = D + 2.2, rh = RD * 0.32;
  roofAssembly(b, 'gable', RW, RD, rh, y + H + 0.05, C.tileDark, 'glaze', {});
  for (const s of [-1, 1]) goldCurl(b, s * (RW / 2 - 0.2), y + H + 0.05 + rh + 0.42, 0, 0.8);
  b.collider(0, y + H, y + H + rh, 0, RW / 2, RD / 2 * 0.9);
  if (o.plaque) {
    const pm = plaqueMesh(o.plaque, 1.8, 0.62, { bg: '#2a2a28', fg: '#d9c48e', frame: '#5a4330' });
    pm.position.set(0, y + H - 0.95, zf + 0.22);
    b.addMesh(pm);
  }
}

// ---------- 南门：三开间门楼（本地正面 +Z，门外为台沿） ----------
export function southGate8(b, plaque = '丹院') {
  const W = 9.6, D = 3.8, H = 3.9, bw = W / 3, base = 0.3;
  b.slab(W + 1.2, base, D + 1.2, C.marbleShade, 0, -0.05, 0, { mat: 'stone' });
  b.collider(0, 0, base, 0, (W + 1.2) / 2, (D + 1.2) / 2, 0, { walk: true });
  const y = base;
  for (let i = 0; i <= 3; i++) for (const z of [D / 2, 0, -D / 2]) {
    if (z === 0 && (i === 1 || i === 2)) continue;
    const x = -W / 2 + i * bw;
    columnBase(b, x, y, z, 0.22);
    b.cyl(0.2, 0.22, H, C.vermilion, x, y + H / 2, z, { seg: 12, mat: 'wood' });
  }
  plankDoors(b, 0, y, 0, bw - 0.5, H - 0.75, { open: 1.3, rows: 7, cols: 5 });
  for (const s of [-1, 1]) {
    b.slab(bw - 0.4, H - 0.4, 0.4, C.red, s * bw, y, 0, { mat: 'std' });
    b.cyl(0.36, 0.36, 0.04, 0x89b5ab, s * bw, y + 1.9, 0.22, { rx: Math.PI / 2, mat: 'jade', seg: 20, col: false });
    b.cyl(0.46, 0.46, 0.03, C.marbleWarm, s * bw, y + 1.9, 0.205, { rx: Math.PI / 2, mat: 'stoneSmooth', seg: 20, col: false });
  }
  for (const z of [D / 2, -D / 2]) {
    b.slab(W + 0.5, 0.42, 0.32, C.woodRed, 0, y + H - 0.48, z, { mat: 'wood', col: false });
    b.panel(W + 0.4, 0.38, 0xffffff, 0, y + H - 0.27, z + (z > 0 ? 0.165 : -0.165), { mat: 'caihua', uvScale: [W + 0.4, 1], ry: z > 0 ? 0 : Math.PI });
  }
  for (let i = 0; i <= 8; i++) for (const s of [-1, 1]) dougong(b, -W / 2 + (i * W) / 8, y + H, s * D / 2, 0.36, s > 0 ? 0 : Math.PI, true);
  const RW = W + 2.8, RD = D + 2.8;
  roofAssembly(b, 'xieshan', RW, RD, RD * 0.46, y + H + 0.3, C.tileDark, 'glaze', { gold: true, goldK: 0.75, fish: true });
  b.collider(0, y + H, y + H + RD * 0.3, 0, RW / 2 * 0.92, RD / 2 * 0.9);
  const pm = plaqueMesh(plaque, 1.8, 0.66, { bg: '#2a2a28', fg: '#d9c48e', frame: '#5a4330' });
  pm.position.set(0, y + H - 0.95, D / 2 + 0.24);
  b.addMesh(pm);
  return { w: W, d: D };
}

// ---------- 东院丹炉台（本地原点：台面中心地面；踏步朝 +Z）----------
export function furnaceTerrace(b, W, D, h) {
  platform(b, -W / 2, W / 2, -D / 2, D / 2, h, [['s', -1.8, 1.8]]);
  const n = Math.round(h / 0.17), run = 0.32;
  stairs(b, 0, 0, D / 2 + n * run, 3.4, h, { run, stepH: h / n, color: C.marble, cheekW: 0.38 });
  // 炉台地面：八角形铁色石板（防火），四角铜灯
  b.cyl(4.2, 4.2, 0.04, 0x6a655c, 0, h, 0, { seg: 8, mat: 'stone', col: false, ry: Math.PI / 8 });
}

// ---------- 大丹炉（第九轮依 D07-01 重做）----------
// 暗古铜炉身（#70694B 起步，压暗）、旧金（#B99A61）只在弦纹、团花、龙耳、炉足兽首与炉盖筋上；
// 三足狮首、鼓腹两侧各一条攀附的龙（龙口衔环）、腹部正面与背面大团花（莲瓣圆章）、四周小如意云纹；
// 炉盖穹顶一圈透气圆孔，盖顶正中立烟囱（分节、旧金箍、顶端透孔烟帽），烟只自烟帽冒出；正面下部拱形火口，火光只在火口一带
export function furnace8(b, x, y, z, ry = 0) {
  b.push(x, y, z, ry);
  const BZ = 0x6a6446, BZd = 0x55503a, BZl = 0x8a7d55, G = C.gold;      // 古铜 #70694B 上下
  // 炉座：八角须弥石座
  b.cyl(2.7, 2.9, 0.4, C.marbleShade, 0, 0, 0, { seg: 8, mat: 'stone', ry: Math.PI / 8 });
  b.cyl(2.4, 2.5, 0.22, C.marble, 0, 0.4, 0, { seg: 8, mat: 'stoneSmooth', col: false, ry: Math.PI / 8 });
  b.cylCollider(0, 0, 0.62, 0, 2.7, { walk: true });
  const y0 = 0.62;
  // 三只狮首足：上端狮首（鬃毛一圈、旧金眼）、短粗弯腿、虎爪踏地
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU - Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);     // 一足在后、两足在前侧（火口居中不被挡）
    const hx = ca * 1.12, hz = sa * 1.12, hy = y0 + 1.42;
    b.sphere(0.42, BZ, hx, hy, hz, { mat: 'bronze', sx: 1.05, sy: 0.95, seg: 12, seg2: 9 });                          // 狮首
    for (let m = 0; m < 9; m++) {                                                                                        // 鬃毛卷
      const t = (m / 9) * TAU, ux = -sa * Math.cos(t), uz = ca * Math.cos(t), uy = Math.sin(t);
      b.sphere(0.13, BZd, hx + ux * 0.4 - ca * 0.06, hy + uy * 0.38, hz + uz * 0.4 - sa * 0.06, { mat: 'bronze', seg: 6, seg2: 4 });
    }
    b.sphere(0.16, BZl, hx + ca * 0.36, hy - 0.08, hz + sa * 0.36, { mat: 'bronze', sx: 1.2, sy: 0.8, seg: 8, seg2: 6 });   // 吻
    for (const s of [-1, 1]) b.sphere(0.065, G, hx + ca * 0.32 - sa * s * 0.17, hy + 0.1, hz + sa * 0.32 + ca * s * 0.17, { mat: 'gold', seg: 6, seg2: 4 });
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(ca * 1.15, y0 + 1.2, sa * 1.15), new THREE.Vector3(ca * 1.4, y0 + 0.75, sa * 1.4), new THREE.Vector3(ca * 1.32, y0 + 0.35, sa * 1.32), new THREE.Vector3(ca * 1.45, y0 + 0.1, sa * 1.45)]);
    b.add(new THREE.TubeGeometry(curve, 10, 0.22, 8), BZ, 'bronze', { col: false });
    b.sphere(0.3, BZd, ca * 1.5, y0 + 0.13, sa * 1.5, { mat: 'bronze', sy: 0.5, sx: 1.25 });
    for (let c = -1; c <= 1; c++) { const ac = a + c * 0.19; b.add(new THREE.ConeGeometry(0.055, 0.24, 5), G, 'gold', { x: Math.cos(ac) * 1.74, y: y0 + 0.1, z: Math.sin(ac) * 1.74, rz: -Math.cos(ac) * 1.4, rx: Math.sin(ac) * 1.4, col: false }); }
  }
  // 炉身：鼓腹（车削），上下两道旧金弦纹、口沿
  const prof = [[0, 1.2], [0.8, 1.26], [1.35, 1.5], [1.72, 2.05], [1.84, 2.7], [1.72, 3.32], [1.36, 3.72], [1.16, 3.86], [1.2, 3.98], [1.08, 3.98]];
  b.add(new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h + y0)), 44), BZ, 'bronze', { col: false });
  for (const [hy, rr] of [[2.3, 1.8], [3.36, 1.72], [3.9, 1.18]]) b.add(new THREE.TorusGeometry(rr, 0.045, 6, 48), G, 'gold', { y: y0 + hy, rx: Math.PI / 2, col: false });
  // 大团花：前后各一枚（旧金圆章：外圈、十二瓣莲、花心）；腹部四周小如意云纹（旧金）
  for (const k of [0, 1]) {
    const a = Math.PI / 2 + k * Math.PI, ca = Math.cos(a), sa = Math.sin(a), r = 1.84, px = ca * r, pz = sa * r, py = y0 + 2.84;
    const ryA = -a + Math.PI / 2;
    b.cyl(0.44, 0.44, 0.06, G, px, py, pz, { rx: Math.PI / 2, ry: ryA, seg: 28, mat: 'gold', col: false });
    b.cyl(0.37, 0.37, 0.07, BZd, px + ca * 0.01, py, pz + sa * 0.01, { rx: Math.PI / 2, ry: ryA, seg: 28, mat: 'bronze', col: false });
    for (let m = 0; m < 12; m++) {
      const t = (m / 12) * TAU, ox = Math.cos(t) * 0.24, oy = Math.sin(t) * 0.24;
      b.sphere(0.08, G, px - sa * ox + ca * 0.05, py + oy, pz + ca * ox + sa * 0.05, { mat: 'gold', sx: 0.5, sy: 1.3, sz: 0.5, seg: 6, seg2: 4, rz: t });
    }
    b.cyl(0.11, 0.11, 0.08, G, px + ca * 0.06, py, pz + sa * 0.06, { rx: Math.PI / 2, ry: ryA, seg: 14, mat: 'gold', col: false });
  }
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU + 0.31;
    if (Math.abs(Math.cos(a)) < 0.4 || Math.abs(Math.cos(a)) > 0.9) continue;
    const px = Math.cos(a) * 1.8, pz = Math.sin(a) * 1.8, py = y0 + 2.45 + (k % 2) * 0.55;
    b.add(new THREE.TorusGeometry(0.1, 0.028, 4, 10, Math.PI * 1.5), G, 'gold', { x: px, y: py, z: pz, ry: -a + Math.PI / 2, col: false });
    b.add(new THREE.TorusGeometry(0.06, 0.022, 4, 8, Math.PI * 1.5), G, 'gold', { x: px + Math.cos(a) * 0.01, y: py + 0.03, z: pz + Math.sin(a) * 0.01, ry: -a + Math.PI / 2, rz: Math.PI, col: false });
  }
  // 两侧攀附的龙（炉耳）：S 形龙身自腹下攀到肩上，龙首向外，口衔旧金环
  for (const s of [-1, 1]) {
    const P = (u, h, o = 0) => new THREE.Vector3(s * u, y0 + h, o);
    const body = new THREE.CatmullRomCurve3([P(1.62, 1.75, 0.25), P(2.02, 2.1, 0.1), P(1.98, 2.62, -0.15), P(2.12, 3.12, 0.05), P(2.0, 3.6, 0.0), P(2.24, 3.92, 0.0)]);
    b.add(new THREE.TubeGeometry(body, 28, 0.21, 9), BZl, 'bronze', { col: false });
    const belly = new THREE.CatmullRomCurve3(body.points.map((p) => p.clone().add(new THREE.Vector3(s * 0.1, -0.06, 0))));
    b.add(new THREE.TubeGeometry(belly, 28, 0.13, 6), G, 'gold', { col: false });                                                // 龙腹（旧金）
    for (let m = 1; m < 8; m++) { const p = body.getPointAt(m / 8); b.add(new THREE.ConeGeometry(0.06, 0.22, 4), G, 'gold', { x: p.x - s * 0.05, y: p.y + 0.18, z: p.z, rz: s * 0.3, col: false }); }   // 背鳍
    for (const u of [0.22, 0.55]) { const p = body.getPointAt(u); for (const t of [-1, 1]) b.add(new THREE.ConeGeometry(0.05, 0.26, 4), G, 'gold', { x: p.x + s * 0.12, y: p.y - 0.12, z: p.z + t * 0.18, rz: -s * 2.2, col: false }); }   // 爪
    const hp = body.getPointAt(1);
    b.box(0.56, 0.32, 0.36, BZl, hp.x + s * 0.22, hp.y + 0.08, hp.z, { mat: 'bronze', col: false });                                 // 龙首
    b.box(0.4, 0.13, 0.3, BZ, hp.x + s * 0.46, hp.y - 0.1, hp.z, { mat: 'bronze', col: false });                                    // 下颌（张口）
    for (const t of [-1, 1]) b.add(new THREE.ConeGeometry(0.07, 0.36, 4), G, 'gold', { x: hp.x - s * 0.12, y: hp.y + 0.18, z: hp.z + t * 0.16, rz: s * 1.6, col: false });   // 鬃
    for (const t of [-1, 1]) b.add(new THREE.ConeGeometry(0.04, 0.32, 5), G, 'gold', { x: hp.x - s * 0.02, y: hp.y + 0.28, z: hp.z + t * 0.1, rz: s * 0.9, col: false });   // 角
    for (const t of [-1, 1]) b.sphere(0.035, G, hp.x + s * 0.24, hp.y + 0.12, hp.z + t * 0.12, { mat: 'gold', seg: 5, seg2: 4 });
    b.add(new THREE.TorusGeometry(0.2, 0.04, 6, 16), G, 'gold', { x: hp.x + s * 0.55, y: hp.y - 0.36, z: hp.z, ry: Math.PI / 2, col: false });   // 衔环
    const tail = body.getPointAt(0);
    b.sphere(0.13, BZl, tail.x, tail.y - 0.05, tail.z, { mat: 'bronze', seg: 8, seg2: 6 });
  }
  // 炉盖：穹顶、旧金筋、一圈透气圆孔（深色孔、旧金孔沿，内里微亮）
  const lid = [[1.12, 3.98], [1.08, 4.14], [0.92, 4.44], [0.62, 4.68], [0.34, 4.8], [0.3, 4.82]];
  b.add(new THREE.LatheGeometry(lid.map(([r, h]) => new THREE.Vector2(r, h + y0)), 36), BZd, 'bronze', { col: false });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lid.map(([r, h]) => new THREE.Vector3(Math.cos(a) * r * 1.01, h + y0, Math.sin(a) * r * 1.01))), 8, 0.03, 4), G, 'gold', { col: false });
    const ah = a + TAU / 16, rr = 0.98, hy = y0 + 4.3, nx = Math.cos(ah), nz = Math.sin(ah);
    b.add(new THREE.TorusGeometry(0.1, 0.026, 4, 12), G, 'gold', { x: nx * rr, y: hy, z: nz * rr, ry: -ah + Math.PI / 2, rx: -0.55, col: false });
    b.cyl(0.08, 0.08, 0.02, 0x1c120a, nx * rr * 0.995, hy, nz * rr * 0.995, { rx: Math.PI / 2 - 0.55, ry: -ah + Math.PI / 2, seg: 10, col: false });
    b.sphere(0.045, 0xff9a50, nx * (rr - 0.04), hy, nz * (rr - 0.04), { mat: 'glow', seg: 6, seg2: 4 });
  }
  // 烟囱：盖顶正中立起，分节（旧金箍）、透孔烟帽
  b.cyl(0.36, 0.42, 0.22, G, 0, y0 + 4.9, 0, { seg: 16, mat: 'gold', col: false });
  b.cyl(0.3, 0.32, 3.6, BZ, 0, y0 + 4.95 + 1.8, 0, { seg: 16, mat: 'bronze', col: false });
  for (const hy of [5.6, 6.6, 7.6, 8.4]) b.cyl(0.345, 0.345, 0.1, G, 0, y0 + hy, 0, { seg: 16, mat: 'gold', col: false });
  b.cyl(0.42, 0.34, 0.12, G, 0, y0 + 8.62, 0, { seg: 16, mat: 'gold', col: false });
  b.cyl(0.38, 0.38, 0.42, BZd, 0, y0 + 8.9, 0, { seg: 16, mat: 'bronze', col: false });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; b.cyl(0.06, 0.06, 0.02, 0x1c120a, Math.cos(a) * 0.385, y0 + 8.92, Math.sin(a) * 0.385, { rx: Math.PI / 2, ry: -a + Math.PI / 2, seg: 8, col: false }); }
  b.add(new THREE.ConeGeometry(0.5, 0.36, 16), BZd, 'bronze', { y: y0 + 9.29, col: false });
  b.sphere(0.12, G, 0, y0 + 9.52, 0, { mat: 'gold', seg: 10, seg2: 6 });
  // 火口：正面下部拱形（旧金框），炉膛里炭火；火光只在火口一带
  const fz = 1.76, fy = y0 + 1.28;
  const arch = new THREE.Shape();
  arch.moveTo(-0.46, 0); arch.lineTo(0.46, 0); arch.lineTo(0.46, 0.42); arch.absarc(0, 0.42, 0.46, 0, Math.PI, false); arch.lineTo(-0.46, 0);
  b.add(new THREE.ShapeGeometry(arch, 10), 0x2a1408, 'std', { x: 0, y: fy, z: fz - 0.06, col: false });
  b.add(new THREE.ShapeGeometry(arch, 10), 0xff8a3a, 'glow', { x: 0, y: fy + 0.04, z: fz - 0.1, sx: 0.78, sy: 0.72, col: false });
  b.add(new THREE.TorusGeometry(0.5, 0.06, 5, 16, Math.PI), G, 'gold', { x: 0, y: fy + 0.42, z: fz + 0.0, col: false });
  for (const s of [-1, 1]) b.box(0.1, 0.44, 0.12, G, s * 0.5, fy + 0.21, fz, { mat: 'gold', col: false });
  b.box(1.12, 0.1, 0.2, G, 0, fy - 0.03, fz + 0.03, { mat: 'gold', col: false });
  for (let k = 0; k < 5; k++) b.sphere(0.06 + (k % 2) * 0.02, 0xff7a2a, -0.24 + k * 0.12, fy + 0.06, fz - 0.16, { mat: 'glow', seg: 6, seg2: 4, sy: 0.7 });   // 炭
  b.cylCollider(0, y0, y0 + 4.9, 0, 1.86);
  b.cylCollider(0, y0 + 4.9, y0 + 9.6, 0, 0.42);
  b.emitter('furnace', 0, y0 + 9.25, 0, { rate: 1.6 });
  b.pop();
  return { mouth: [x + Math.sin(ry) * fz, y + fy + 0.3, z + Math.cos(ry) * fz], top: y + y0 + 9.6 };
}

// 药圃木畦：本地沿 X 的长条木框，种着成行的药草
export function herbBed(b, x, y, z, ry, L = 3.2, rand = Math.random) {
  b.push(x, y, z, ry);
  b.slab(L, 0.36, 1.1, C.woodDark, 0, 0, 0, { mat: 'wood' });
  b.slab(L - 0.16, 0.04, 0.94, 0x4a3a2a, 0, 0.34, 0, { col: false });
  const n = Math.round(L / 0.38);
  for (let i = 0; i < n; i++) for (const zz of [-0.26, 0.26]) {
    const px = -L / 2 + 0.2 + i * (L - 0.4) / (n - 1), c = [0x6f8a4e, 0x86985a, 0x5c7a50, 0x9aa25e][(i + (zz > 0 ? 1 : 0)) % 4];
    b.sphere(0.16 + rand() * 0.06, c, px, 0.48, zz, { mat: 'leaf', sy: 0.8 + rand() * 0.5, seg: 6, seg2: 4 });
    if (rand() < 0.25) b.sphere(0.05, [0xe8d0f0, 0xf0e090, 0xffffff][i % 3], px, 0.68, zz, { mat: 'leaf', seg: 5, seg2: 3 });
  }
  b.pop();
}

// 斜栏杆（沿 X 从 (x0, y0) 到 (x1, y1)，z 处）：望柱、扶手、下枋、栏板
function slopeRailX(b, x0, y0, x1, y1, z, { h = 0.85, color = C.marble } = {}) {
  const L = Math.abs(x1 - x0), n = Math.max(1, Math.round(L / 1.3));
  for (let k = 0; k <= n; k++) {
    const u = k / n, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u;
    b.slab(0.18, h + 0.18, 0.18, color, x, y, z, { mat: 'stoneSmooth', col: false });
    b.sphere(0.1, color, x, y + h + 0.26, z, { mat: 'stoneSmooth', seg: 8, seg2: 6 });
  }
  beam(b, x0, y0 + h - 0.04, z, x1, y1 + h - 0.04, z, 0.12, color, 'stoneSmooth');
  beam(b, x0, y0 + 0.12, z, x1, y1 + 0.12, z, 0.14, color, 'stoneSmooth');
  beam(b, x0, y0 + h * 0.46, z, x1, y1 + h * 0.46, z, h * 0.5, color, 'stoneSmooth', false, 0.07);
  b.collider((x0 + x1) / 2, Math.min(y0, y1), Math.max(y0, y1) + h + 0.2, z, L / 2, 0.14, 0, { walk: false, cam: false });
}

// 折返石阶（世界坐标；S 为 layout.SWITCHBACK）：顶部平台 → 第一跑（东行下）→ 中间平台 → 第二跑（西行下）→ 灵池池台
export function switchbackStairs(b, S) {
  const { x0, z0, top, bottom, lane, run, n1, n2, landing, topLen } = S;
  const rise = top - bottom, sh = rise / (n1 + n2), yMid = top - n1 * sh;
  const zL1a = z0, zL1b = z0 + lane, zDiv = zL1b + 0.3, zL2b = zDiv + lane;
  const xA = x0 + topLen, xB = xA + n1 * run, xC = xB + landing, xD = xB - n2 * run;
  const stone = C.marble, side = C.marbleShade;
  // 顶部平台（与丹殿台地齐平），平台南沿栏杆
  b.slab(topLen, top - bottom, zL1b - (z0 - 1.1), side, (x0 + xA) / 2, bottom, (zL1b + z0 - 1.1) / 2, { mat: 'stone' });
  b.slab(topLen + 0.1, 0.12, zL1b - (z0 - 1.1) + 0.1, stone, (x0 + xA) / 2, top - 0.12, (zL1b + z0 - 1.1) / 2, { mat: 'stoneSmooth', col: false });
  rail(b, [[x0 + 0.15, zL1b + 0.15], [xA - 0.1, zL1b + 0.15]], top, { h: 0.85, color: stone, spacing: 1.5, post: 0.18 });
  rail(b, [[x0 + 0.15, z0 - 0.9], [x0 + 0.15, zL1b + 0.15]], top, { h: 0.85, color: stone, spacing: 1.5, post: 0.18 });
  // 第一跑：东行下 n1 级（贴台壁），踏面实砌到池台
  for (let k = 0; k < n1; k++) {
    const t = top - (k + 1) * sh, xs = xA + k * run;
    b.slab(run + 0.02, t - bottom, lane, stone, xs + run / 2, bottom, (zL1a + zL1b) / 2, { mat: 'stoneSmooth', jitter: 0.05 });
    b.box(0.014, sh * 0.85, lane - 0.04, new THREE.Color(stone).multiplyScalar(0.8).getHex(), xs + 0.012, t + sh * 0.5, (zL1a + zL1b) / 2, { mat: 'stoneSmooth', col: false });
  }
  // 中间平台
  b.slab(landing, yMid - bottom, zL2b - zL1a, side, (xB + xC) / 2, bottom, (zL1a + zL2b) / 2, { mat: 'stone' });
  b.slab(landing + 0.1, 0.1, zL2b - zL1a + 0.1, stone, (xB + xC) / 2, yMid - 0.1, (zL1a + zL2b) / 2, { mat: 'stoneSmooth', col: false });
  // 第二跑：西行下 n2 级（外侧）
  for (let k = 0; k < n2; k++) {
    const t = yMid - (k + 1) * sh, xs = xB - k * run;
    b.slab(run + 0.02, t - bottom, lane, stone, xs - run / 2, bottom, (zDiv + zL2b) / 2, { mat: 'stoneSmooth', jitter: 0.05 });
    b.box(0.014, sh * 0.85, lane - 0.04, new THREE.Color(stone).multiplyScalar(0.8).getHex(), xs - 0.012, t + sh * 0.5, (zDiv + zL2b) / 2, { mat: 'stoneSmooth', col: false });
  }
  // 两跑之间的隔墙（随第一跑）与外侧栏杆
  for (let k = 0; k < n1; k++) {
    const t = top - (k + 1) * sh, xs = xA + k * run;
    b.slab(run + 0.02, t + 0.1 - bottom, 0.3, side, xs + run / 2, bottom, zL1b + 0.15, { mat: 'stone', col: false });
  }
  slopeRailX(b, xA + 0.05, top - sh + 0.1, xB - 0.05, yMid + 0.1, zL1b + 0.15);
  slopeRailX(b, xB, yMid, xD + 0.1, bottom, zL2b - 0.15);
  rail(b, [[xB, zL2b - 0.15], [xC - 0.15, zL2b - 0.15], [xC - 0.15, zL1a + 0.1]], yMid, { h: 0.85, color: stone, spacing: 1.4, post: 0.18 });
  // 第二跑西端（下口）一对石灯；中间平台一盏青铜灯
  stoneLanternR(b, xD - 0.6, bottom, zL2b + 0.6, 0.85);
  return { bottom: [xD - 0.8, (zDiv + zL2b) / 2], topLanding: [x0, xA, z0 - 1.1, zL1b], mid: [(xB + xC) / 2, (zL1a + zL2b) / 2, yMid] };
}
