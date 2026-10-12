// 主要建筑（依「主要建筑三视图」「镇灵塔三视图」与宗门整体图）：
//   主殿（问道殿）：中央重檐歇山正殿（横向展开、庄重）+ 前出抱厦 + 东西翼殿，两层汉白玉台基（团纹、栏杆、御路），檐下垂蓝底金纹的幡
//   藏经阁：三层楼阁（垂直层次）——底层出腰檐，二、三层带平座栏杆，顶为鎏金歇山；两层台基、前后踏步
//   丹殿：正殿（圆形金章门额、明确的入口）+ 两厢敞开的制药房（药架、药罐）+ 东院青铜大丹炉与高烟管
//   镇灵塔：八角五层楼阁式塔，每层平座栏杆、檐角悬铃，两层八角须弥台基（浮雕、角灯、青玉嵌线踏道）
//   山门：正中重檐歇山门殿（中间通行）、两侧双层阙楼、蓝底金纹长幡、白墙青瓦的院墙
// 统一用色：青灰屋瓦（琉璃）、朱红木构、暖白石材、青玉与鎏金点缀。
import * as THREE from 'three';
import { C } from './builder.js';
import { hall, rail, stairs, beam, dougong, doorLeaves, sillWindow, woodRail, roofAssembly, eaves, hipRoofGeo, pyramidRoofGeo, plaqueMesh, goldCurl, liftFn, hipCornerLines, ridgeAlong, openLeaves, hangLantern } from './arch.js';
import { bookcase9, table9, sideCabinet9 } from './furniture9.js';
import { stoneLanternR, censerR } from './ornaments.js';
import { yardWall } from './buildings.js';
import { columnBase } from './stone9.js';

const TAU = Math.PI * 2;

// ---------- 幡：蓝底、金边、鎏金团纹与竖排金字（随风轻摆）----------
const BANNER_TEX = new Map();
function bannerTexture(text = '', style = '') {
  const key = text + '|' + style;
  if (BANNER_TEX.has(key)) return BANNER_TEX.get(key);
  const W = 128, H = 448, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = style === 'jade' ? '#6f9d92' : '#20385a'; g.fillRect(0, 0, W, H);
  const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(0,0,0,.25)'); gr.addColorStop(0.5, 'rgba(255,255,255,.06)'); gr.addColorStop(1, 'rgba(0,0,0,.25)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#d6b45e'; g.lineWidth = 6; g.strokeRect(8, 8, W - 16, H - 16);
  g.lineWidth = 2; g.strokeRect(16, 16, W - 32, H - 32);
  // 团纹：圆环 + 卷云
  const cy = 112;
  g.lineWidth = 5; g.beginPath(); g.arc(W / 2, cy, 34, 0, TAU); g.stroke();
  g.lineWidth = 3;
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; g.beginPath(); g.arc(W / 2 + Math.cos(a) * 14, cy + Math.sin(a) * 14, 11, a, a + 4); g.stroke(); }
  g.fillStyle = '#e1c272'; g.beginPath(); g.arc(W / 2, cy, 7, 0, TAU); g.fill();
  if (text) {
    g.font = 'bold 54px "STKaiti","KaiTi","Kaiti SC",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    [...text].forEach((ch, i) => g.fillText(ch, W / 2, 200 + i * 66));
  }
  // 下摆：燕尾
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.moveTo(W / 2, H - 46); g.lineTo(W * 0.2, H + 2); g.lineTo(W * 0.8, H + 2); g.closePath(); g.fill();
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  BANNER_TEX.set(key, t);
  return t;
}
// 垂幡：顶边中心 (x, yTop, z)，宽 w、长 h，朝向 ry（正面朝本地 +Z）
export function banner(b, x, yTop, z, ry, w = 0.9, h = 3.2, text = '', style = '') {
  // 几何沿本地 +X 下垂（摆动着色器按 position.x 加大摆幅：挂边不动、下摆飘动），网格整体转成竖直
  const geo = new THREE.PlaneGeometry(h, w, 8, 1);
  geo.translate(h / 2 - 0.75, 0, 0);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) { const u0 = uv.getX(i), v0 = uv.getY(i); uv.setXY(i, v0, 1 - u0); }
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: bannerTexture(text, style), side: THREE.DoubleSide, roughness: 0.9, alphaTest: 0.5 }));
  m.position.set(x, yTop - 0.75, z); m.rotation.set(0, ry, -Math.PI / 2);
  m.userData.sway = true; m.castShadow = true;
  b.addMesh(m);
  b.cyl(0.03, 0.03, w + 0.2, C.gold, x, yTop + 0.05, z, { rz: Math.PI / 2, ry, col: false, seg: 6, mat: 'gold' });
}

// ---------- 汉白玉台基：台身、压面石、正面团纹（青玉心）、台沿栏杆（开口留给踏步）----------
// rect [x0, x1, z0, z1]，y 底面，h 台高；gaps：前沿开口 [[a, b]]（沿 X）；backGaps 后沿开口；medal：正面团纹间距
export function terrace(b, [x0, x1, z0, z1], y, h, { gaps = [], backGaps = [], sideGaps = [], medal = 5.5, railH = 0.82 } = {}) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, W = x1 - x0, D = z1 - z0;
  b.slab(W, h - 0.2, D, C.marbleShade, cx, y, cz, { mat: 'stone' });
  b.slab(W + 0.3, 0.2, D + 0.3, C.marble, cx, y + h - 0.2, cz, { mat: 'stoneSmooth' });
  b.slab(W + 0.16, 0.14, D + 0.16, C.marbleWarm, cx, y, cz, { mat: 'stoneSmooth', col: false });
  // 正面团纹
  const n = Math.max(1, Math.floor(W / medal));
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 0.5) * W) / n;
    if (gaps.some(([a, c]) => x > a - 0.8 && x < c + 0.8)) continue;
    b.cyl(Math.min(0.42, h * 0.32), Math.min(0.42, h * 0.32), 0.05, C.marbleWarm, x, y + h * 0.48, z1 + 0.02, { rx: Math.PI / 2, mat: 'stoneSmooth', col: false, seg: 16 });
    b.cyl(Math.min(0.2, h * 0.15), Math.min(0.2, h * 0.15), 0.06, 0x89b5ab, x, y + h * 0.48, z1 + 0.04, { rx: Math.PI / 2, mat: 'jade', col: false, seg: 12 });
  }
  // 栏杆（四沿，按开口切断）
  const cut = (a, c, list) => {
    let segs = [[a, c]];
    for (const [ga, gc] of list) segs = segs.flatMap(([p, q]) => (gc <= p || ga >= q ? [[p, q]] : [[p, ga], [gc, q]].filter(([u, v]) => v - u > 0.4)));
    return segs;
  };
  const yR = y + h, inset = 0.22;
  for (const [a, c] of cut(x0 + inset, x1 - inset, gaps)) rail(b, [[a, z1 - inset], [c, z1 - inset]], yR, { h: railH, color: C.marble, spacing: 1.7, post: 0.18 });
  for (const [a, c] of cut(x0 + inset, x1 - inset, backGaps)) rail(b, [[a, z0 + inset], [c, z0 + inset]], yR, { h: railH, color: C.marble, spacing: 1.7, post: 0.18 });
  for (const sx of [-1, 1]) {
    const xx = sx < 0 ? x0 + inset : x1 - inset;
    for (const [a, c] of cut(z0 + inset, z1 - inset, sideGaps)) rail(b, [[xx, a], [xx, c]], yR, { h: railH, color: C.marble, spacing: 1.7, post: 0.18 });
  }
  b.collider(cx, y, y + h, cz, W / 2, D / 2, 0, { walk: true });
}
// 踏步（自 zEdge 向前下行到 y）：w 宽，rise 高；center 为御路石
export function frontStairs(b, x, zEdge, y, rise, w, { center = false, ry = 0 } = {}) {
  const run = 0.32, n = Math.max(1, Math.round(rise / 0.17)), L = n * run;
  b.push(x, 0, zEdge, ry);
  stairs(b, 0, y, L, w, rise, { run, stepH: rise / n, color: C.marble, cheekW: 0.4 });
  if (center) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.atan2(rise, L), 0, 0));
    b.add(new THREE.BoxGeometry(Math.min(2.2, w * 0.3), 0.18, Math.hypot(L, rise)), C.marbleWarm, 'stoneSmooth', { x: 0, y: y + rise / 2 + 0.12, z: L / 2, q, col: false });
    for (let k = 0; k < 3; k++) b.sphere(0.32, C.marble, (k % 2 ? 0.3 : -0.3), y + rise * (0.25 + k * 0.25) + 0.24, L * (0.75 - k * 0.25), { mat: 'stoneSmooth', sy: 0.3, sx: 1.4, seg: 8, seg2: 4 });
  }
  b.pop();
  return L;
}

// ---------------- 主殿 ----------------
// 本地原点：台基前沿中点所在的地面；正殿中心在 z = 0（台基向前铺到 z = front）
export function grandHall(b, o = {}) {
  const T1 = 1.15, T2 = 1.05, FY = T1 + T2;
  const MW = 28, MD = 17, MH = 7.2;
  const WW = 11.4, WD = 11, WH = 5.4, WX = MW / 2 + WW / 2 + 0.2, WZ = -1.2;
  const PW = 12.4, PD = 5.4, PH = 5.0;
  const B1 = [-(WX + WW / 2 + 2.6), WX + WW / 2 + 2.6, -MD / 2 - 3.2, MD / 2 + PD + 4.6];
  const B2 = [-(MW / 2 + 2.3), MW / 2 + 2.3, -MD / 2 - 1.9, MD / 2 + PD + 1.7];
  terrace(b, B1, 0, T1, { gaps: [[-5, 5], [-WX - 2.2, -WX + 2.2], [WX - 2.2, WX + 2.2]], medal: 6 });
  terrace(b, B2, T1, T2, { gaps: [[-4.2, 4.2]], medal: 5 });
  frontStairs(b, 0, B1[3], 0, T1, 9.2);
  frontStairs(b, 0, B2[3], T1, T2, 7.6, { center: true });
  for (const s of [-1, 1]) frontStairs(b, s * WX, B1[3], 0, T1, 3.8);
  // 正殿：重檐歇山，七开间，朱柱、彩画、斗拱，鎏金脊饰
  b.push(0, FY, 0, 0);
  const info = hall(b, { bronzeBase: true, w: MW, d: MD, bays: 7, dbays: 3, h: MH, base: 0, porch: 0, roof: 'xieshan', eaves: 2, glaze: true, roofColor: C.tileDark,
    wallColor: C.red, pillar: C.vermilion, frame: C.vermilion, painted: true, dougong: true, overhang: 2.8, dadoColor: C.marbleWarm,
    front: 'doors', doorBays: [2, 3, 4], roofOpts: { gold: true } });
  b.pop();
  // 抱厦：前出三间敞廊，单檐歇山（鎏金），檐下正中悬殿匾
  {
    const z0 = MD / 2, z1 = MD / 2 + PD, bw = PW / 3;
    for (let i = 0; i <= 3; i++) for (const z of [z1]) {
      const x = -PW / 2 + i * bw;
      columnBase(b, x, FY, z, 0.3, { bronze: true });
      b.cyl(0.27, 0.3, PH, C.vermilion, x, FY + PH / 2, z, { seg: 12, mat: 'wood' });
    }
    for (const sx of [-1, 1]) b.cyl(0.27, 0.3, PH, C.vermilion, sx * PW / 2, FY + PH / 2, z0 + 0.3, { seg: 12, mat: 'wood' });
    b.slab(PW + 0.6, 0.52, 0.5, C.paintBlue, 0, FY + PH - 0.52, z1, { col: false });
    b.slab(PW + 0.4, 0.28, 0.42, C.paintGreen, 0, FY + PH - 0.9, z1, { col: false });
    b.slab(PW * 0.24, 0.46, 0.52, C.gold, 0, FY + PH - 0.48, z1, { col: false, mat: 'gold' });
    for (const sx of [-1, 1]) b.slab(0.5, 0.5, PD + 0.4, C.paintBlue, sx * PW / 2, FY + PH - 0.5, (z0 + z1) / 2, { col: false });
    for (let i = 0; i <= 8; i++) dougong(b, -PW / 2 + (i * PW) / 8, FY + PH, z1, 0.46, 0, true);
    const Wr = PW + 3.0, Dr = PD + 2.6;
    roofAssembly(b, 'xieshan', Wr, Dr, Dr * 0.42, FY + PH + 0.34, C.tileDark, 'glaze', { gold: true, goldK: 0.85, fish: true });
    b.collider(0, FY + PH + 0.3, FY + PH + 0.3 + Dr * 0.3, (z0 + z1) / 2 + 0.3, Wr / 2 * 0.9, Dr / 2 * 0.9);
    const pm = plaqueMesh(o.plaque || '问道殿', 4.2, 1.45, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
    pm.position.set(0, FY + PH - 1.75, z1 + 0.32);
    b.addMesh(pm);
    // 抱厦檐下长幡、殿前廊下幡
    for (const sx of [-1, 1]) {
      banner(b, sx * (PW / 2 - bw / 2 - 0.8), FY + PH - 1.1, z1 + 0.32, 0, 0.82, 2.9, '');
      banner(b, sx * (MW / 2 - MW / 7 * 1.5), FY + MH - 0.9, MD / 2 + 0.36, 0, 0.9, 3.4, sx < 0 ? '问道' : '青岚');
      banner(b, sx * (MW / 2 - MW / 7 * 0.5), FY + MH - 0.9, MD / 2 + 0.36, 0, 0.9, 3.4, '');
    }
  }
  // 东西翼殿：单檐歇山（鎏金），三开间，正面隔扇门
  for (const s of [-1, 1]) {
    b.push(s * WX, T1, WZ, 0);
    hall(b, { w: WW, d: WD, bays: 3, dbays: 2, h: WH, base: 0, porch: 0, roof: 'xieshan', glaze: true, roofColor: C.tileDark,
      wallColor: C.red, pillar: C.vermilion, frame: C.vermilion, painted: true, dougong: true, overhang: 1.9, dadoColor: C.marbleWarm,
      front: 'doors', doorBays: [1], roofOpts: { gold: true, goldK: 0.75 } });
    banner(b, -WW / 2 + 1.2, WH - 0.7, WD / 2 + 0.34, 0, 0.75, 2.6, '');
    banner(b, WW / 2 - 1.2, WH - 0.7, WD / 2 + 0.34, 0, 0.75, 2.6, '');
    b.pop();
  }
  // 台上：香炉、石灯
  for (const s of [-1, 1]) {
    censerR(b, s * 6.6, FY, B2[3] - 1.4, 1.35, 0);
    stoneLanternR(b, s * (MW / 2 + 1.0), FY, B2[3] - 0.9, 1.1);
    stoneLanternR(b, s * (WX + WW / 2 + 1.4), T1, B1[3] - 1.0, 1.0);
    stoneLanternR(b, s * (WX - WW / 2 - 1.4), T1, B1[3] - 1.0, 1.0);
  }
  return { front: B1[3], floor: FY, porchFront: MD / 2 + PD, top: FY + info.top, lanterns: [[-PW / 2 + 0.2, FY + PH - 0.3, MD / 2 + PD + 0.4], [PW / 2 - 0.2, FY + PH - 0.3, MD / 2 + PD + 0.4]], wings: WX };
}

// 第十轮：云顶主殿的台基与翼殿（正殿本身用素材模型 D，由 buildings10.js 放在上层台面正中）。
// 两层汉白玉台基：上层正方（半边 half，承托正殿模型连同殿前一对八角楼），下层向两侧展开承托东西翼殿；
// 正面三道踏道（中间带御路石），台上香炉、石灯。本地原点：上层台基中心的地面；正面 +Z
export function grandTerrace(b, o = {}) {
  const T1 = 1.15, T2 = 1.05, FY = T1 + T2, HB = o.half ?? 18;
  const WW = o.wingW ?? 9.6, WD = o.wingD ?? 10, WH = 5.2, WX = HB + 0.8 + WW / 2, WZ = o.wingZ ?? -9;
  const B2 = [-HB, HB, -HB, HB];
  const B1 = [-(WX + WW / 2 + 1.8), WX + WW / 2 + 1.8, -HB - 1.5, HB + 3.0];
  terrace(b, B1, 0, T1, { gaps: [[-5, 5], [-WX - 2.0, -WX + 2.0], [WX - 2.0, WX + 2.0]], medal: 6 });
  terrace(b, B2, T1, T2, { gaps: [[-4.2, 4.2]], medal: 5 });
  frontStairs(b, 0, B1[3], 0, T1, 9.2);
  frontStairs(b, 0, B2[3], T1, T2, 7.6, { center: true });
  for (const s of [-1, 1]) frontStairs(b, s * WX, B1[3], 0, T1, 3.8);
  // 东西翼殿：单檐歇山（鎏金），三开间，正面隔扇门（比正殿低一等）
  for (const s of [-1, 1]) {
    b.push(s * WX, T1, WZ, 0);
    hall(b, { w: WW, d: WD, bays: 3, dbays: 2, h: WH, base: 0, porch: 0, roof: 'xieshan', glaze: true, roofColor: C.tileDark,
      wallColor: C.red, pillar: C.vermilion, frame: C.vermilion, painted: true, dougong: true, overhang: 1.8, dadoColor: C.marbleWarm,
      front: 'doors', doorBays: [1], roofOpts: { gold: true, goldK: 0.75 } });
    banner(b, -WW / 2 + 1.1, WH - 0.7, WD / 2 + 0.34, 0, 0.72, 2.5, '');
    banner(b, WW / 2 - 1.1, WH - 0.7, WD / 2 + 0.34, 0, 0.72, 2.5, '');
    b.pop();
  }
  // 台上：上层台基前沿一对香炉，上下层台沿石灯
  for (const s of [-1, 1]) {
    censerR(b, s * 5.6, FY, B2[3] - 1.3, 1.25, 0);
    stoneLanternR(b, s * (HB - 1.0), FY, B2[3] - 0.9, 1.05);
    stoneLanternR(b, s * (WX + WW / 2 + 0.9), T1, B1[3] - 1.0, 1.0);
    stoneLanternR(b, s * (WX - WW / 2 - 0.9), T1, B1[3] - 1.0, 1.0);
  }
  return { floor: FY, front: B1[3], b2Front: B2[3], back: B1[2], wings: WX, wingW: WW, half: HB, width: 2 * B1[1] };
}

// ---------------- 藏经阁 ----------------
// 本地原点：台基中心地面；正面 +Z
export function scriptureHall(b, o = {}) {
  const base = 1.5, B1 = 18.6, D1 = 17.2;
  terrace(b, [-B1 / 2, B1 / 2, -D1 / 2, D1 / 2], 0, 0.8, { gaps: [[-2.6, 2.6]], backGaps: [[-2.2, 2.2]], medal: 6 });
  terrace(b, [-B1 / 2 + 1.5, B1 / 2 - 1.5, -D1 / 2 + 1.5, D1 / 2 - 1.5], 0.8, 0.7, { gaps: [[-2.6, 2.6]], backGaps: [[-2.2, 2.2]], medal: 5 });
  frontStairs(b, 0, D1 / 2, 0, 0.8, 5.0);
  frontStairs(b, 0, D1 / 2 - 1.5, 0.8, 0.7, 5.0);
  frontStairs(b, 0, -D1 / 2, 0, 0.8, 4.2, { ry: Math.PI });
  frontStairs(b, 0, -D1 / 2 + 1.5, 0.8, 0.7, 4.2, { ry: Math.PI });
  const levels = [{ w: 12.4, d: 11.2, h: 4.7 }, { w: 10.6, d: 9.6, h: 3.6 }, { w: 9.0, d: 8.2, h: 3.3 }];
  let y = base;
  let top = 0;
  levels.forEach((L, l) => {
    const bays = 3, bw = L.w / bays, rc = l === 0 ? 0.25 : 0.21;
    // 柱
    for (let i = 0; i <= bays; i++) for (const s of [-1, 1]) {
      const x = -L.w / 2 + i * bw;
      columnBase(b, x, y, s * L.d / 2, rc, { bronze: l === 0 && s > 0 });
      b.cyl(rc * 0.92, rc, L.h, C.vermilion, x, y + L.h / 2, s * L.d / 2, { seg: 12, mat: 'wood' });
    }
    for (const s of [-1, 1]) for (let j = 1; j < 3; j++) b.cyl(rc * 0.92, rc, L.h, C.vermilion, s * L.w / 2, y + L.h / 2, -L.d / 2 + (j * L.d) / 3, { seg: 12, mat: 'wood' });
    // 四面：正面底层正中隔扇门，余为槛窗；侧、后为槛窗（楼上满开窗）
    for (let side = 0; side < 4; side++) {
      const along = side % 2 === 0, len = along ? L.w : L.d, half = along ? L.d / 2 : L.w / 2;
      b.push(0, 0, 0, (side * Math.PI) / 2);
      const nb = along ? bays : 3, sb = len / nb;
      for (let i = 0; i < nb; i++) {
        const cx = -len / 2 + (i + 0.5) * sb, iw = sb - 2 * rc, tp = L.h - 0.7;
        b.panel(iw - 0.1, 0.45, C.paper, cx, y + L.h - 0.42, half + 0.03);
        b.box(iw, 0.1, 0.12, C.vermilion, cx, y + tp, half, { col: false, mat: 'wood' });
        if (l === 0 && side === 0 && i === 1) {
          b.slab(iw, 0.18, 0.18, C.vermilion, cx, y, half, { col: false, mat: 'wood' });
          openLeaves(b, cx, y + 0.18, half, iw, tp - 0.18, 1.3, C.vermilion);
          // 门内：底层天花、后墙一排书柜、正中长案（书函、笔架）、两侧边柜，梁下一盏灯
          b.slab(L.w - 0.6, 0.08, L.d - 0.6, C.woodDark, 0, y + L.h - 0.14, 0, { mat: 'wood', col: false });
          for (const bx of [-4.3, -3.05, 3.05, 4.3, -1.55, 1.55]) bookcase9(b, bx, y, -L.d / 2 + 0.55, 0, { W: 1.2, H: 2.2, seed: Math.round(bx * 7 + 31) });
          for (const bx of [-4.6, 4.6]) bookcase9(b, bx, y, -1.0, bx < 0 ? Math.PI / 2 : -Math.PI / 2, { W: 1.2, H: 2.2, seed: Math.round(bx * 3 + 11) });
          table9(b, 0, y, -1.2, 0, { L: 2.4, D: 0.9, H: 0.78 });
          for (let k = 0; k < 4; k++) b.slab(0.3, 0.06 + (k % 2) * 0.04, 0.22, k % 2 ? 0x2f3e57 : 0x5a3b2c, -0.8 + k * 0.5, y + 0.78, -1.2, { col: false });
          for (const sx of [-1, 1]) sideCabinet9(b, sx * 3.6, y, L.d / 2 - 0.65, Math.PI);
          hangLantern(b, 0, y + L.h - 0.3, -0.6, 0.85, false);
        } else sillWindow(b, cx, y, half, iw, tp, { frame: C.vermilion, wall: l === 0 ? C.red : C.woodRed, sill: l === 0 ? 0.9 : 0.5, wallMat: l === 0 ? 'std' : 'wood' });
        b.collider(cx, y, y + L.h, half, iw / 2 + rc, 0.18);
      }
      b.slab(len + rc * 2, 0.44, rc * 1.4, C.paintBlue, 0, y + L.h - 0.44, half, { col: false });
      b.slab(len + rc * 2, 0.22, rc * 1.2, C.paintGreen, 0, y + L.h - 0.74, half, { col: false });
      b.slab(len * 0.24, 0.32, rc * 1.45, C.gold, 0, y + L.h - 0.4, half, { col: false, mat: 'gold' });
      b.pop();
    }
    // 斗拱一周
    b.slab(L.w + rc * 3, 0.16, L.d + rc * 3, C.woodRed, 0, y + L.h, 0, { col: false, mat: 'wood' });
    const dgS = l === 0 ? 0.48 : 0.4;
    for (let i = 0; i <= 6; i++) for (const s of [-1, 1]) dougong(b, -L.w / 2 + (i * L.w) / 6, y + L.h + 0.16, s * L.d / 2, dgS, s > 0 ? 0 : Math.PI, true);
    for (let j = 1; j < 6; j++) for (const s of [-1, 1]) dougong(b, s * L.w / 2, y + L.h + 0.16, -L.d / 2 + (j * L.d) / 6, dgS, s * Math.PI / 2, true);
    let yd = y + L.h + 0.16 + 0.72 * dgS;
    if (l < levels.length - 1) {
      // 腰檐（青灰琉璃，角端鎏金卷草）+ 平座挑台（朱红栏杆）
      const W = L.w + 3.4, D = L.d + 3.4, H = Math.min(W, D) * 0.38, tM = 0.3, ey = yd - 0.2;
      b.add(hipRoofGeo(W, D, H, { tMax: tM, lift: 0.2 }), C.tileDark, 'glaze', { y: ey, col: false });
      b.add(hipRoofGeo(W, D, H, { tMax: tM, lift: 0.2 }), C.paintTeal, 'under', { y: ey - 0.12, col: false });
      eaves(b, 'hip', W, D, H, ey, { lift: 0.2 });
      for (const ln of hipCornerLines(W, D, H, ey, { tMax: tM, lift: 0.2, n: 5 })) {
        ridgeAlong(b, ln.pts, 0.26, C.ridge, 'glaze', 0.12);
        goldCurl(b, ln.pts[0][0] * 0.985, ln.pts[0][1] + 0.2, ln.pts[0][2] * 0.985, 0.75);
      }
      const ringY = ey + H * Math.pow(tM, 1.7), N = levels[l + 1], P = [N.w + 1.8, N.d + 1.8];
      b.slab(P[0] + 0.2, 0.24, P[1] + 0.2, C.woodRed, 0, ringY, 0, { col: false, mat: 'wood' });
      woodRail(b, [[-P[0] / 2, P[1] / 2], [P[0] / 2, P[1] / 2], [P[0] / 2, -P[1] / 2], [-P[0] / 2, -P[1] / 2]], ringY + 0.24, { color: C.vermilion, closed: true, h: 0.9 });
      b.collider(0, ey, ringY + 0.24, 0, W / 2 * 0.92, D / 2 * 0.92);
      y = ringY + 0.24;
    } else {
      const W = L.w + 3.6, D = L.d + 3.6, H = Math.min(W, D) * 0.46;
      roofAssembly(b, 'xieshan', W, D, H, yd, C.tileDark, 'glaze', { gold: true, goldK: 0.9, fish: true });
      b.collider(0, yd, yd + H * 0.6, 0, W / 2 * 0.9, D / 2 * 0.9);
      top = yd + H;
      const pm = plaqueMesh('藏经', 2.2, 0.8, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
      pm.position.set(0, y + L.h - 0.9, L.d / 2 + 0.3);
      b.addMesh(pm);
    }
  });
  const pm = plaqueMesh(o.plaque || '藏经阁', 3.2, 1.1, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
  pm.position.set(0, base + levels[0].h - 0.62, levels[0].d / 2 + 0.34);
  b.addMesh(pm);
  for (const s of [-1, 1]) banner(b, s * (levels[0].w / 2 - levels[0].w / 6), base + levels[0].h - 0.75, levels[0].d / 2 + 0.36, 0, 0.8, 2.9, '');
  for (const s of [-1, 1]) { censerR(b, s * 4.2, 1.5, D1 / 2 - 2.6, 1.05, 0); stoneLanternR(b, s * (B1 / 2 - 2.4), 1.5, D1 / 2 - 2.4, 0.95); }
  return { top, door: { z: levels[0].d / 2 + 1.6, y: base } };
}

// ---------------- 丹殿 ----------------
// 本地原点：正殿中心地面；正面 +Z。正殿尺寸与丹殿室内一致（15 × 8.4，柱高 4.3）
export function danHall(b, o = {}) {
  const base = 0.9, MW = 15, MD = 8.4;
  const WW = 8.2, WD = 6.6, WX = MW / 2 + WW / 2 + 0.4, WZ = -0.6;
  const B1 = [-(WX + WW / 2 + 1.4), WX + WW / 2 + 1.4, -MD / 2 - 1.6, MD / 2 + 2.4];
  terrace(b, B1, 0, base, { gaps: [[-3, 3], [-WX - 1.6, -WX + 1.6], [WX - 1.6, WX + 1.6]], medal: 5 });
  frontStairs(b, 0, B1[3], 0, base, 5.4);
  for (const s of [-1, 1]) frontStairs(b, s * WX, B1[3], 0, base, 2.8);
  b.push(0, base, 0, 0);
  const info = hall(b, { w: MW, d: MD, bays: 5, dbays: 2, h: 4.3, base: 0, porch: 0, roof: 'xieshan', glaze: true, roofColor: C.tileDark,
    wallColor: C.red, pillar: C.vermilion, frame: C.vermilion, painted: true, dougong: true, overhang: 1.6, dadoColor: C.marbleWarm,
    front: 'doors', doorBays: [2], backWindows: true, roofOpts: { gold: true, goldK: 0.8 } });
  // 门额上方的圆形金章（丹炉纹），两侧对联
  b.cyl(0.62, 0.62, 0.08, C.gold, 0, 3.5, MD / 2 + 0.16, { rx: Math.PI / 2, mat: 'gold', col: false, seg: 24 });
  b.cyl(0.48, 0.48, 0.1, 0x2a3a3c, 0, 3.5, MD / 2 + 0.18, { rx: Math.PI / 2, mat: 'std', col: false, seg: 24 });
  b.sphere(0.2, 0xf2a040, 0, 3.42, MD / 2 + 0.24, { mat: 'glow', sy: 1.2, seg: 10, seg2: 8 });
  for (const s of [-1, 1]) b.add(new THREE.TorusGeometry(0.3, 0.03, 4, 16, Math.PI), C.gold, 'gold', { x: s * 0.0, y: 3.35, z: MD / 2 + 0.22, rz: s > 0 ? 0 : Math.PI, col: false });
  b.pop();
  const pm = plaqueMesh(o.plaque || '丹殿', 2.6, 0.9, { bg: '#2a2a28', fg: '#d9c48e', frame: '#5a4330' });
  pm.position.set(0, base + 4.3 - 0.45, MD / 2 + 0.5);
  b.addMesh(pm);
  // 两厢制药房：正面敞开，内有药架、药罐、药碾
  for (const s of [-1, 1]) {
    b.push(s * WX, base, WZ, 0);
    hall(b, { w: WW, d: WD, bays: 3, dbays: 2, h: 3.6, base: 0, porch: 0, roof: 'xieshan', glaze: true, roofColor: C.tileDark,
      wallColor: C.red, pillar: C.vermilion, frame: C.vermilion, painted: true, dougong: false, overhang: 1.4, dadoColor: C.marbleWarm,
      front: 'open', roofOpts: { gold: true, goldK: 0.55 } });
    // 药架（靠后墙）与药罐
    const yb = 0;
    for (let i = 0; i < 3; i++) {
      const x = -WW / 2 + 1.4 + i * 2.7;
      b.slab(2.2, 2.4, 0.5, C.woodDark, x, yb, -WD / 2 + 0.6, { mat: 'wood' });
      for (let r = 0; r < 4; r++) {
        b.slab(2.1, 0.04, 0.46, C.woodRed, x, yb + 0.4 + r * 0.55, -WD / 2 + 0.62, { mat: 'wood', col: false });
        for (let k = 0; k < 5; k++) {
          const jx = x - 0.85 + k * 0.42, col = [0x7a5a3a, 0x3e5a5a, 0xc8b89a, 0x6a3a2a, 0x55704f][(i + r + k) % 5];
          b.cyl(0.11, 0.13, 0.28, col, jx, yb + 0.44 + r * 0.55 + 0.14, -WD / 2 + 0.62, { mat: 'glaze', col: false, seg: 8 });
        }
      }
    }
    b.slab(2.6, 0.8, 0.9, C.woodRed, 0, yb, -0.4, { mat: 'wood' });                    // 制药长案
    b.cyl(0.18, 0.14, 0.22, 0x4a4640, -0.6, yb + 0.8 + 0.11, -0.4, { mat: 'bronze', col: false, seg: 10 });
    b.slab(0.6, 0.05, 0.16, 0x3e3a34, 0.5, yb + 0.8, -0.4, { mat: 'bronze', col: false });
    b.pop();
  }
  // 台上：石灯、小香炉
  for (const s of [-1, 1]) stoneLanternR(b, s * (MW / 2 + 0.6), base, B1[3] - 0.9, 0.9);
  return { front: B1[3], floor: base, top: base + info.top, wingX: WX };
}

// 青铜大丹炉：三足兽首、圆腹饕餮纹带、双立耳、炉盖与鎏金宝顶；炉侧一根高烟管（分节、弯折向上）；炉底炭火
export function grandFurnace(b, x, y, z, ry = 0) {
  b.push(x, y, z, ry);
  b.cyl(3.0, 3.25, 0.5, C.marbleShade, 0, 0.25, 0, { seg: 8, mat: 'stone', ry: Math.PI / 8 });
  b.cyl(2.6, 2.7, 0.3, C.marble, 0, 0.65, 0, { seg: 8, mat: 'stoneSmooth', col: false, ry: Math.PI / 8 });
  b.cylCollider(0, 0, 0.8, 0, 3.0, { walk: true });
  const y0 = 0.8, BZ = 0x4f5a48;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    beam(b, ca * 0.9, y0 + 1.7, sa * 0.9, ca * 1.25, y0 + 0.15, sa * 1.25, 0.34, BZ, 'bronze');
    b.sphere(0.28, BZ, ca * 1.28, y0 + 0.14, sa * 1.28, { mat: 'bronze', sy: 0.6 });
    b.sphere(0.3, C.gold, ca * 0.95, y0 + 1.85, sa * 0.95, { mat: 'gold', seg: 10, seg2: 8 });
  }
  const prof = [[0, 1.3], [0.7, 1.35], [1.25, 1.6], [1.6, 2.1], [1.7, 2.7], [1.58, 3.3], [1.25, 3.7], [1.1, 3.85], [1.12, 3.98]];
  b.add(new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h + y0)), 32), BZ, 'bronze', { col: false });
  for (const hy of [2.35, 3.0]) b.add(new THREE.TorusGeometry(1.67, 0.05, 6, 48), C.gold, 'gold', { y: y0 + hy, rx: Math.PI / 2, col: false });
  for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; b.box(0.2, 0.5, 0.06, 0x6b7458, Math.cos(a) * 1.69, y0 + 2.68, Math.sin(a) * 1.69, { ry: -a + Math.PI / 2, col: false, mat: 'bronze' }); }
  for (const s of [-1, 1]) {
    b.box(0.12, 0.8, 0.14, BZ, s * 1.05, y0 + 4.3, 0.25, { col: false, mat: 'bronze' });
    b.box(0.12, 0.8, 0.14, BZ, s * 1.05, y0 + 4.3, -0.25, { col: false, mat: 'bronze' });
    b.box(0.14, 0.14, 0.64, C.gold, s * 1.05, y0 + 4.72, 0, { col: false, mat: 'gold' });
  }
  const lid = [[1.16, 3.98], [1.1, 4.15], [0.9, 4.45], [0.6, 4.7], [0.3, 4.86], [0, 4.9]];
  b.add(new THREE.LatheGeometry(lid.map(([r, h]) => new THREE.Vector2(r, h + y0)), 28), 0x3e4a40, 'bronze', { col: false });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lid.map(([r, h]) => new THREE.Vector3(Math.cos(a) * r * 1.01, h + y0, Math.sin(a) * r * 1.01))), 8, 0.035, 4), C.gold, 'gold', { col: false });
  }
  b.cyl(0.18, 0.26, 0.24, C.gold, 0, y0 + 5.02, 0, { mat: 'gold', col: false, seg: 10 });
  b.sphere(0.26, C.gold, 0, y0 + 5.38, 0, { mat: 'gold', seg: 12, seg2: 8 });
  b.add(new THREE.ConeGeometry(0.12, 0.5, 8), C.gold, 'gold', { y: y0 + 5.84, col: false });
  // 炉门火光、炉底炭盆
  b.add(new THREE.CircleGeometry(0.42, 16), 0xff8a40, 'glow', { x: 0, y: y0 + 2.1, z: 1.69, rx: -0.12, col: false });
  b.cyl(1.0, 0.85, 0.2, 0x2e2a26, 0, y0 + 0.5, 0, { col: false, mat: 'stone', seg: 16 });
  b.cyl(0.85, 0.85, 0.04, 0xff7a30, 0, y0 + 0.62, 0, { col: false, mat: 'glow', seg: 16 });
  // 烟管：自炉肩伸出，分节、弯折向上，顶端承露盘
  const pipe = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.3, y0 + 3.4, -0.4), new THREE.Vector3(-2.3, y0 + 3.9, -0.8), new THREE.Vector3(-2.8, y0 + 5.2, -1.0), new THREE.Vector3(-2.85, y0 + 8.0, -1.05), new THREE.Vector3(-2.85, y0 + 10.6, -1.05)]);
  b.add(new THREE.TubeGeometry(pipe, 32, 0.32, 10), 0x3c4440, 'bronze', { col: false });
  for (let k = 1; k < 8; k++) { const p = pipe.getPointAt(k / 8); b.add(new THREE.TorusGeometry(0.34, 0.06, 5, 14), C.gold, 'gold', { x: p.x, y: p.y, z: p.z, rx: Math.PI / 2, col: false }); }
  b.cyl(0.62, 0.36, 0.3, 0x3c4440, -2.85, y0 + 10.7, -1.05, { mat: 'bronze', col: false, seg: 14 });
  b.cylCollider(0, y0, y0 + 5.0, 0, 1.75);
  b.cylCollider(-2.85, y0, y0 + 11, -1.05, 0.45);
  b.emitter('furnace', -2.85, y0 + 11.0, -1.05, { rate: 2.4 });
  b.emitter('furnace', 0, y0 + 5.9, 0, { rate: 0.8 });
  b.pop();
  return { top: y + y0 + 11 };
}

// ---------------- 镇灵塔 ----------------
// 八角五层；本地原点为台基中心地面，正面 +Z
export function spiritPagoda(b, o = {}) {
  const R0 = o.r ?? 4.2, levels = 5, rot = Math.PI / 8;
  const RB1 = R0 + 4.6, RB2 = R0 + 2.7, HB1 = 1.0, HB2 = 1.05;
  // 两层八角须弥台基：台身浮雕（团纹、青玉心）、压面石；上层台缘栏杆（正面留口）；下层八角各一盏石灯
  const octo = (R, h, y0, col, mat) => b.cyl(R, R, h, col, 0, y0 + h / 2, 0, { seg: 8, mat, ry: rot, col: false });
  octo(RB1, HB1 - 0.2, 0, C.marbleShade, 'stone'); octo(RB1 + 0.15, 0.2, HB1 - 0.2, C.marble, 'stoneSmooth');
  octo(RB2, HB2 - 0.2, HB1, C.marble, 'stoneSmooth'); octo(RB2 + 0.15, 0.2, HB1 + HB2 - 0.2, C.marbleWarm, 'stoneSmooth');
  b.cylCollider(0, 0, HB1, 0, RB1 * 0.96, { walk: true });
  b.cylCollider(0, HB1, HB1 + HB2, 0, RB2 * 0.96, { walk: true });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + rot + Math.PI / 8, nx = Math.cos(a), nz = Math.sin(a);
    for (const [R, yy, hh] of [[RB1, 0.08, HB1 - 0.3], [RB2, HB1 + 0.06, HB2 - 0.3]]) {
      const ri = R * Math.cos(Math.PI / 8) + 0.02, fw = 2 * R * Math.sin(Math.PI / 8) * 0.72;
      b.box(fw, hh * 0.7, 0.04, C.marbleShade, nx * ri, yy + hh / 2, nz * ri, { ry: Math.PI / 2 - a, mat: 'stoneSmooth', col: false });
      b.cyl(0.24, 0.24, 0.05, C.marbleWarm, nx * (ri + 0.03), yy + hh / 2, nz * (ri + 0.03), { rx: Math.PI / 2, ry: Math.PI / 2 - a, mat: 'stoneSmooth', col: false, seg: 14 });
      b.cyl(0.1, 0.1, 0.06, 0x89b5ab, nx * (ri + 0.05), yy + hh / 2, nz * (ri + 0.05), { rx: Math.PI / 2, ry: Math.PI / 2 - a, mat: 'jade', col: false, seg: 10 });
    }
    const ca = (k / 8) * TAU + rot;
    stoneLanternR(b, Math.cos(ca) * (RB1 - 0.5), HB1, Math.sin(ca) * (RB1 - 0.5), 0.72, -ca);
    // 上层台缘栏杆（正面 +Z 一边留口）
    const a0 = ca, a1 = ca + TAU / 8, mid = (a0 + a1) / 2;
    if (Math.abs(Math.atan2(Math.sin(mid - Math.PI / 2), Math.cos(mid - Math.PI / 2))) < 0.3) continue;
    const rr = RB2 - 0.25;
    rail(b, [[Math.cos(a0) * rr, Math.sin(a0) * rr], [Math.cos(a1) * rr, Math.sin(a1) * rr]], HB1 + HB2, { h: 0.8, color: C.marble, spacing: 1.4, post: 0.16 });
  }
  // 正面踏道：中间一条青玉嵌线，底端青玉团章
  const fz1 = RB1 * Math.cos(Math.PI / 8), fz2 = RB2 * Math.cos(Math.PI / 8);
  frontStairs(b, 0, fz1, 0, HB1, 4.2);
  frontStairs(b, 0, fz2, HB1, HB2, 3.6);
  b.slab(0.36, 0.03, 2.1, 0x89b5ab, 0, HB1 + 0.02, fz1 - 1.05 + 0.01, { mat: 'jade', col: false });
  b.cyl(0.6, 0.6, 0.04, 0x89b5ab, 0, 0.02, fz1 + 2.4, { mat: 'jade', col: false, seg: 20 });
  // 塔身
  let y = HB1 + HB2;
  for (let l = 0; l < levels; l++) {
    const r = R0 * (1 - l * 0.085), h = l === 0 ? 4.8 : 3.3 - l * 0.08;
    b.cyl(r, r, h, C.plaster, 0, y + h / 2, 0, { seg: 8, ry: rot, mat: 'std' });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU, ri = r * Math.cos(Math.PI / 8) + 0.03;
      b.cyl(0.17, 0.19, h, C.vermilion, Math.cos(a + rot) * r, y + h / 2, Math.sin(a + rot) * r, { seg: 8, mat: 'wood', col: false });
      const fa = a + Math.PI / 8 + rot, fx = Math.cos(fa) * ri, fz = Math.sin(fa) * ri, ry = Math.PI / 2 - fa;
      const fw = 2 * r * Math.sin(Math.PI / 8) - 0.5;
      if (k % 2 === 0) {
        if (l === 0) { b.box(1.2, h * 0.56, 0.08, C.vermilion, fx, y + h * 0.3, fz, { ry, col: false, mat: 'wood' }); b.panel(1.0, h * 0.24, C.paper, fx + Math.cos(fa) * 0.05, y + h * 0.36, fz + Math.sin(fa) * 0.05, { ry }); }
        else b.panel(Math.min(1.4, fw), h * 0.46, C.paper, fx, y + h * 0.5, fz, { ry });
      } else b.panel(Math.min(1.1, fw), h * 0.32, C.paper, fx, y + h * 0.55, fz, { ry });
    }
    b.cyl(r + 0.12, r + 0.12, 0.34, C.paintBlue, 0, y + h - 0.17, 0, { seg: 8, ry: rot, col: false });
    b.cyl(r + 0.13, r + 0.13, 0.12, C.gold, 0, y + h - 0.42, 0, { seg: 8, ry: rot, col: false, mat: 'gold' });
    b.cyl(r + 0.36, r + 0.22, 0.38, C.woodRed, 0, y + h + 0.19, 0, { seg: 8, ry: rot, col: false, mat: 'wood' });
    y += h + 0.38;
    const W = r + 2.0;
    if (l < levels - 1) {
      // 出檐（八角截顶，起翘）；角端鎏金卷草、悬铃
      const H = W * 0.6, tM = 0.42;
      b.add(pyramidRoofGeo(8, W, H, { tMax: tM, lift: 0.32, rot: 0 }), C.tileDark, 'glaze', { y, col: false, ry: rot });
      b.add(pyramidRoofGeo(8, W, H, { tMax: tM, lift: 0.32, rot: 0 }), C.paintTeal, 'under', { y: y - 0.1, col: false, ry: rot });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + rot, cx = Math.cos(a) * W * 0.98, cz = Math.sin(a) * W * 0.98, cy = y + H * 0.32;
        goldCurl(b, cx, cy + 0.12, cz, 0.6);
        b.cyl(0.006, 0.006, 0.42, C.gold, cx * 0.97, cy - 0.22, cz * 0.97, { col: false, seg: 3, mat: 'gold' });
        b.add(new THREE.ConeGeometry(0.1, 0.24, 8), 0x93c2b5, 'jade', { x: cx * 0.97, y: cy - 0.52, z: cz * 0.97, col: false });
      }
      const ringY = y + H * Math.pow(tM, 1.6) * 0.92;
      // 平座栏杆（上一层外圈）
      const rn = R0 * (1 - (l + 1) * 0.085) + 0.95;
      b.cyl(rn + 0.1, rn + 0.1, 0.2, C.woodRed, 0, ringY + 0.1, 0, { seg: 8, ry: rot, col: false, mat: 'wood' });
      const pts = [];
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + rot; pts.push([Math.cos(a) * rn, Math.sin(a) * rn]); }
      woodRail(b, pts, ringY + 0.2, { color: C.vermilion, closed: true, h: 0.8 });
      y = ringY + 0.2;
    } else {
      const H = W * 1.05;
      b.push(0, 0, 0, rot);
      roofAssembly(b, 'oct', 2 * W * Math.cos(Math.PI / 8), 0, H, y, C.tileDark, 'glaze', { lift: 0.32, eaves: false, gold: true, goldK: 0.6 });
      b.pop();
      // 塔刹：金覆钵、相轮、青玉宝珠、金刹尖
      b.sphere(0.55, C.gold, 0, y + H + 0.9, 0, { mat: 'gold', sy: 0.6 });
      for (let k = 0; k < 5; k++) b.cyl(0.4 - k * 0.05, 0.44 - k * 0.05, 0.13, C.gold, 0, y + H + 1.35 + k * 0.38, 0, { mat: 'gold', col: false, seg: 12 });
      b.cyl(0.07, 0.09, 2.6, C.gold, 0, y + H + 2.6, 0, { mat: 'gold', col: false });
      b.sphere(0.5, 0x93c2b5, 0, y + H + 3.6, 0, { mat: 'jade', seg: 16, seg2: 12 });
      b.add(new THREE.ConeGeometry(0.12, 0.9, 8), C.gold, 'gold', { y: y + H + 4.5, col: false });
      y += H + 5.0;
    }
  }
  b.cylCollider(0, HB1 + HB2, y - 4, 0, R0 + 0.3, { walk: false });
  b.collider(0, HB1 + HB2 + 1, y - 6, 0, R0 * 0.72, R0 * 0.72, 0, { walk: false, cam: true });
  return { top: y, base: HB1 + HB2, front: fz1 };
}

// ---------------- 山门 ----------------
// 本地原点：门殿中心地面；正面 +Z（朝山外）
export function gateComplex(b, o = {}) {
  const GW = 14.4, GD = 6.4, GH = 6.0, base = 0.3;
  // 门殿台基
  b.slab(GW + 2.6, base - 0.1, GD + 1.6, C.marbleShade, 0, 0, 0, { mat: 'stone' });
  b.slab(GW + 2.8, 0.1, GD + 1.8, C.marble, 0, base - 0.1, 0, { mat: 'stoneSmooth', col: false });
  b.collider(0, 0, base, 0, (GW + 2.6) / 2, (GD + 1.6) / 2, 0, { walk: true });
  const bw = GW / 3, y = base;
  for (let i = 0; i <= 3; i++) for (const z of [GD / 2, -GD / 2, 0]) {
    const x = -GW / 2 + i * bw;
    if (z === 0 && (i === 1 || i === 2)) continue;
    columnBase(b, x, y, z, 0.33);
    b.cyl(0.3, 0.33, GH, C.vermilion, x, y + GH / 2, z, { seg: 12, mat: 'wood' });
  }
  // 两侧次间：中线上朱门（关闭），门洞上方横披；正中明间通行
  for (const s of [-1, 1]) {
    const cx = s * bw, iw = bw - 0.7;
    b.slab(iw, GH - 0.9, 0.3, C.vermilion, cx, y, 0, { mat: 'wood' });
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) b.sphere(0.07, C.gold, cx - iw / 2 + (c + 0.5) * iw / 4, y + 0.8 + r * 0.9, 0.17, { mat: 'gold', seg: 6, seg2: 4 });   // 门钉
    b.panel(iw - 0.1, 0.6, C.paper, cx, y + GH - 0.5, 0.17);
    b.collider(cx, y, y + GH, 0, iw / 2 + 0.3, 0.3);
  }
  b.slab(bw - 0.5, 0.2, 0.36, C.vermilion, 0, y + GH - 0.95, 0, { col: false, mat: 'wood' });
  for (const s of [-1, 1]) {
    b.slab(GW + 0.7, 0.5, 0.42, C.paintBlue, 0, y + GH - 0.5, s * GD / 2, { col: false });
    b.slab(GW + 0.5, 0.26, 0.36, C.paintGreen, 0, y + GH - 0.85, s * GD / 2, { col: false });
    b.slab(GW * 0.22, 0.42, 0.44, C.gold, 0, y + GH - 0.46, s * GD / 2, { col: false, mat: 'gold' });
    b.slab(0.42, 0.5, GD + 0.6, C.paintBlue, s * GW / 2, y + GH - 0.5, 0, { col: false });
  }
  b.slab(GW + 1.0, 0.16, GD + 1.0, C.woodRed, 0, y + GH, 0, { col: false, mat: 'wood' });
  for (let i = 0; i <= 10; i++) for (const s of [-1, 1]) dougong(b, -GW / 2 + (i * GW) / 10, y + GH + 0.16, s * GD / 2, 0.48, s > 0 ? 0 : Math.PI, true);
  // 重檐歇山（下檐四坡截顶 + 上层歇山），鎏金
  const yT = y + GH + 0.16 + 0.35, W1 = GW + 4.2, D1 = GD + 4.2, H1 = Math.min(W1, D1) * 0.42, tM = 0.3;
  b.add(hipRoofGeo(W1, D1, H1, { tMax: tM }), C.tileDark, 'glaze', { y: yT, col: false });
  b.add(hipRoofGeo(W1, D1, H1, { tMax: tM }), C.paintTeal, 'under', { y: yT - 0.12, col: false });
  eaves(b, 'hip', W1, D1, H1, yT);
  { const lf = liftFn(W1, D1, H1, 0.16); for (const sx of [-1, 1]) for (const sz of [-1, 1]) goldCurl(b, sx * W1 / 2 * 0.97, yT + lf(sx * W1 / 2 * 0.999, sz * D1 / 2 * 0.999) + 0.25, sz * D1 / 2 * 0.97, 0.8); }
  const ring = yT + H1 * Math.pow(tM, 1.7), wi = GW * 0.62, di = GD * 0.7, uh = 1.6;
  b.slab(wi, uh + 0.4, di, C.red, 0, ring - 0.4, 0);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) b.panel(wi / 4 - 0.4, uh * 0.55, C.paper, -wi / 2 + (i + 0.5) * wi / 4, ring + uh * 0.45, s * (di / 2 + 0.03), { ry: s > 0 ? 0 : Math.PI });
  for (let i = 0; i <= 6; i++) for (const s of [-1, 1]) dougong(b, -wi / 2 + (i * wi) / 6, ring + uh, s * di / 2, 0.4, s > 0 ? 0 : Math.PI, true);
  const W2 = wi + 3.6, D2 = di + 3.6, H2 = Math.min(W2, D2) * 0.46;
  roofAssembly(b, 'xieshan', W2, D2, H2, ring + uh + 0.29, C.tileDark, 'glaze', { gold: true, goldK: 0.95, fish: true });
  b.collider(0, yT, ring + 0.3, 0, W1 / 2 * 0.92, D1 / 2 * 0.92);
  b.collider(0, ring, ring + uh + H2 * 0.6, 0, W2 / 2 * 0.9, D2 / 2 * 0.9);
  // 匾额：正面「青岚宗」，背面「問道」
  const p1 = plaqueMesh(o.front || '青岚宗', 4.0, 1.3, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
  p1.position.set(0, y + GH - 1.75, GD / 2 + 0.3); b.addMesh(p1);
  const p2 = plaqueMesh(o.back || '問道', 2.8, 1.05, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
  p2.position.set(0, y + GH - 1.7, -GD / 2 - 0.3); p2.rotation.y = Math.PI; b.addMesh(p2);
  // 两侧双层阙楼：白石楼基（拱形暗门）+ 朱红木构上层（平座栏杆）+ 歇山顶（鎏金）
  const TX = GW / 2 + 5.6, TW = 5.6, TD = 5.4, TB = 4.8, TH = 3.0;
  for (const s of [-1, 1]) {
    b.push(s * TX, 0, 0, 0);
    b.slab(TW, TB, TD, C.marble, 0, 0, 0, { mat: 'stoneSmooth' });
    b.slab(TW + 0.3, 0.3, TD + 0.3, C.marbleShade, 0, 0, 0, { mat: 'stone', col: false });
    b.slab(TW + 0.4, 0.22, TD + 0.4, C.marbleWarm, 0, TB - 0.22, 0, { mat: 'stoneSmooth', col: false });
    b.box(1.5, 2.3, 0.06, 0x2a2826, 0, 1.15 + 0.3, TD / 2 + 0.02, { col: false });
    b.add(new THREE.CircleGeometry(0.75, 14, 0, Math.PI), 0x2a2826, 'std', { x: 0, y: 2.6 + 0.3, z: TD / 2 + 0.02, col: false });
    for (const sz of [-1, 1]) b.cyl(0.3, 0.3, 0.04, C.gold, 0, TB - 1.1, sz * (TD / 2 + 0.02), { rx: Math.PI / 2, mat: 'gold', col: false, seg: 16 });
    const uw = TW - 1.2, ud = TD - 1.2;
    for (const [px, pz] of [[-uw / 2, -ud / 2], [uw / 2, -ud / 2], [-uw / 2, ud / 2], [uw / 2, ud / 2], [0, ud / 2], [0, -ud / 2]]) b.cyl(0.18, 0.2, TH, C.vermilion, px, TB + TH / 2, pz, { seg: 10, mat: 'wood', col: false });
    for (const sz of [-1, 1]) for (const px of [-uw / 4, uw / 4]) sillWindow(b, px, TB, sz * ud / 2, uw / 2 - 0.3, TH - 0.4, { frame: C.vermilion, wall: C.red, sill: 0.6, wallMat: 'std' });
    for (const sx2 of [-1, 1]) { b.push(sx2 * uw / 2, 0, 0, Math.PI / 2); sillWindow(b, 0, TB, 0, ud - 0.6, TH - 0.4, { frame: C.vermilion, wall: C.red, sill: 0.6, wallMat: 'std' }); b.pop(); }
    woodRail(b, [[-TW / 2 + 0.1, TD / 2 - 0.1], [TW / 2 - 0.1, TD / 2 - 0.1], [TW / 2 - 0.1, -TD / 2 + 0.1], [-TW / 2 + 0.1, -TD / 2 + 0.1]], TB, { color: C.vermilion, closed: true, h: 0.8 });
    b.slab(uw + 0.5, 0.36, ud + 0.5, C.paintBlue, 0, TB + TH - 0.36, 0, { col: false });
    roofAssembly(b, 'xieshan', uw + 2.6, ud + 2.6, (ud + 2.6) * 0.44, TB + TH + 0.1, C.tileDark, 'glaze', { gold: true, goldK: 0.65, fish: true });
    b.collider(0, 0, TB + TH + 2.4, 0, TW / 2, TD / 2);
    b.pop();
    // 长幡（门殿与阙楼之间的旗杆上）
    b.cyl(0.08, 0.12, 9.5, C.woodDark, s * (GW / 2 + 1.6), 4.75, GD / 2 + 1.9, { mat: 'wood', seg: 8 });
    b.sphere(0.16, C.gold, s * (GW / 2 + 1.6), 9.6, GD / 2 + 1.9, { mat: 'gold' });
    b.slab(1.3, 0.07, 0.07, C.woodDark, s * (GW / 2 + 1.6) - s * 0.6, 9.0, GD / 2 + 1.9, { col: false, mat: 'wood' });
    banner(b, s * (GW / 2 + 1.6) - s * 0.62, 9.0, GD / 2 + 1.95, 0, 1.1, 4.2, s < 0 ? '青岚' : '问道');
    b.cylCollider(s * (GW / 2 + 1.6), 0, 9, GD / 2 + 1.9, 0.2);
  }
  return { towerX: TX, towerW: TW, gateW: GW, top: ring + uh + H2 };
}

// 山门两侧院墙（自阙楼外侧到台沿）：白墙、朱红腰线、青瓦压顶
export function gateWalls(b, x0, x1, z, y, h = 2.6) {
  yardWall(b, x0, z, x1, z, { h, color: 0xe8e2d4, base: C.marbleShade });
}
