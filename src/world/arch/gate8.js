// 山门与接引院（第八轮，依「山门修正版」三视图）：
//   门楼：三间“中高边低”——明间单檐歇山（鎏金鸱吻、宝珠），檐下一整排青绿斗拱、旋子彩画额枋、正中「青岚宗」匾；
//         明间两扇朱红板门向内开启（门洞贯通，望得见院中甬道），次间各两扇板门关闭；次间低檐向两侧接到阙楼。
//   板门：门框（抱框、中槛、下槛）、门板厚度、九路门钉、鎏金铺首衔环、门轴（上入连楹、下落门枕石）、门簪。
//   阙楼：白石楼基（勒脚、腰线、檐口，正面垂宗旗，背面券门）→ 平座（下有斗拱托，木栏杆）→ 朱红木构上层（格栅门窗、彩画额枋、斗拱）
//         → 歇山顶（鎏金宝珠、鸱吻），四角悬红灯。
//   接引院：龟趺宗门碑、登记亭（书案、名册）、茶亭（圆桌、鼓凳、风炉）、中轴白石甬道上的团纹石（见 sect.js）。
// 本地坐标：+Z 为正面（南），门楼中心在原点，y = 0 为接引台台面。
import * as THREE from 'three';
import { C } from './builder.js';
import { roofAssembly, dougong, woodRail, sillWindow, doorLeaves, plaqueMesh, beam, hangLantern, pavilion, openLeaves } from './arch.js';
import { banner } from './halls.js';
import { columnBase } from './stone9.js';

const TAU = Math.PI * 2;

// 彩画额枋：一根梁（朱红芯）外贴前后两面旋子彩画
export function paintedBeam(b, x0, x1, y, z, h, d, { front = true, back = true } = {}) {
  const L = x1 - x0, xm = (x0 + x1) / 2;
  b.slab(L, h, d, C.woodRed, xm, y, z, { mat: 'wood', col: false });
  if (front) b.panel(L - 0.02, h - 0.04, 0xffffff, xm, y + h / 2, z + d / 2 + 0.006, { mat: 'caihua', uvScale: [L, 1] });
  if (back) b.panel(L - 0.02, h - 0.04, 0xffffff, xm, y + h / 2, z - d / 2 - 0.006, { mat: 'caihua', uvScale: [L, 1], ry: Math.PI });
}

// 板门（两扇）：门洞中心 cx、底面 y、门线 z（门扇正面朝 +Z）；w 门洞宽，h 门洞高；open 为向内（-Z）开启的角度
export function plankDoors(b, cx, y, z, w, h, { open = 0, rows = 9, cols = 7, color = C.vermilion, frame = C.woodRed } = {}) {
  const fw = 0.16, ft = 0.26;
  // 门框：抱框、中槛、下槛（可跨过）
  for (const s of [-1, 1]) b.slab(fw, h + 0.24, ft, frame, cx + s * (w / 2 + fw / 2), y, z, { mat: 'wood' });
  b.slab(w + 2 * fw + 0.1, 0.24, ft + 0.04, frame, cx, y + h, z, { mat: 'wood', col: false });
  b.slab(w + 0.04, 0.14, ft + 0.06, frame, cx, y, z, { mat: 'wood', col: false });
  // 门簪：中槛正面一对六角门簪（金色簪头）
  for (const s of [-1, 1]) {
    b.cyl(0.12, 0.12, 0.26, frame, cx + s * w * 0.24, y + h + 0.12, z + ft / 2 + 0.13, { rx: Math.PI / 2, seg: 6, mat: 'wood', col: false });
    b.cyl(0.1, 0.1, 0.03, C.gold, cx + s * w * 0.24, y + h + 0.12, z + ft / 2 + 0.27, { rx: Math.PI / 2, seg: 6, mat: 'gold', col: false });
  }
  // 门枕石：门轴下端落在门内侧的抱鼓形门枕石上；上端入连楹（门内侧的横木）
  for (const s of [-1, 1]) {
    b.slab(0.34, 0.26, 0.86, C.marbleShade, cx + s * (w / 2 - 0.12), y, z - 0.3, { mat: 'stoneSmooth', col: false });
    b.cyl(0.2, 0.2, 0.2, C.marbleWarm, cx + s * (w / 2 - 0.12), y + 0.36, z - 0.62, { rz: Math.PI / 2, seg: 12, mat: 'stoneSmooth', col: false });
  }
  b.slab(w + 0.2, 0.14, 0.2, frame, cx, y + h - 0.2, z - ft / 2 - 0.1, { mat: 'wood', col: false });       // 连楹
  // 门扇：门轴在外缘，向内开启
  const lw = w / 2 - 0.02, t = 0.13, lh = h - 0.18;
  for (const s of [-1, 1]) {
    const hx = cx + s * (w / 2 - 0.04);
    b.push(hx, y + 0.14, z - 0.02, -s * open);
    const lx = -s * lw / 2;
    b.slab(lw, lh, t, color, lx, 0, 0, { mat: 'wood', col: open > 0.3 ? false : 'box' });
    // 边梃与抹头（门板四周略厚的边框）
    for (const yy of [0.04, lh - 0.12]) b.box(lw, 0.1, t + 0.04, frame, lx, yy + 0.05, 0, { mat: 'wood', col: false });
    b.box(0.1, lh, t + 0.04, frame, lx - s * (lw / 2 - 0.05), lh / 2, 0, { mat: 'wood', col: false });
    // 门轴（贯通上下、略出门板）
    b.cyl(0.06, 0.06, lh + 0.3, frame, 0, lh / 2, 0, { seg: 8, mat: 'wood', col: false });
    // 门钉：rows × cols 路鎏金门钉（正面）
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const px = lx - lw / 2 + 0.16 + (c + 0.5) * (lw - 0.32) / cols, py = 0.38 + r * (lh - 0.9) / (rows - 1);
      b.sphere(0.045, C.gold, px, py, t / 2 + 0.005, { mat: 'gold', seg: 6, seg2: 4, sz: 0.65 });
    }
    // 铺首衔环（靠门缝一侧）
    const kx = -s * (lw - 0.36), ky = lh * 0.46;
    b.cyl(0.17, 0.17, 0.04, C.gold, kx, ky, t / 2 + 0.02, { rx: Math.PI / 2, seg: 14, mat: 'gold', col: false });
    b.add(new THREE.TorusGeometry(0.12, 0.022, 5, 14), C.gold, 'gold', { x: kx, y: ky - 0.16, z: t / 2 + 0.06, col: false });
    if (open > 0.3) b.collider(lx, 0, lh, 0, lw / 2, t / 2 + 0.03, 0, { walk: false, cam: false });
    b.pop();
  }
}

// 支摘窗：下半为固定的槛墙与窗扇，上扇以上沿为轴向外撑起 open 弧度（一根撑杆），窗洞可见室内
function proppedWindow(b, cx, y, z, w, h, open = 0.7, { sill = 0.7, frame = C.vermilion, wall = C.red } = {}) {
  b.slab(w, sill, 0.32, wall, cx, y, z - 0.08, { col: false, mat: 'std' });
  b.slab(w + 0.04, 0.06, 0.42, frame, cx, y + sill, z - 0.05, { col: false, mat: 'wood' });
  const y0 = y + sill + 0.06, wh = h - sill - 0.06, lo = wh * 0.42;
  // 下扇（固定）
  b.panel(w - 0.18, lo - 0.1, C.paper, cx, y0 + lo / 2, z - 0.01);
  b.panel(w - 0.18, lo - 0.1, C.paper, cx, y0 + lo / 2, z - 0.05, { ry: Math.PI });
  b.box(w, 0.08, 0.14, frame, cx, y0 + lo, z, { col: false, mat: 'wood' });
  // 上扇：绕上槛撑开
  const uh = wh - lo - 0.1;
  b.push(cx, y + h - 0.1, z + 0.04, 0);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -open);
  const off = new THREE.Vector3(0, -uh / 2, 0).applyQuaternion(q);
  b.add(new THREE.PlaneGeometry(1, 1), C.paper, 'window', { x: 0, y: off.y, z: off.z, q, sx: w - 0.2, sy: uh - 0.08, uvScale: [w - 0.2, uh - 0.08], col: false });
  for (const e of [-1, 1]) {
    const p = new THREE.Vector3(e * (w / 2 - 0.12), -uh / 2, 0).applyQuaternion(q);
    b.add(new THREE.BoxGeometry(0.07, uh, 0.07), frame, 'wood', { x: p.x, y: p.y, z: p.z, q, col: false });
  }
  const pb = new THREE.Vector3(0, -uh + 0.035, 0).applyQuaternion(q);
  b.add(new THREE.BoxGeometry(w - 0.18, 0.07, 0.07), frame, 'wood', { x: pb.x, y: pb.y, z: pb.z, q, col: false });
  b.pop();
  beam(b, cx + w * 0.3, y0 + lo, z + 0.04, cx + w * 0.3, y + h - 0.1 + Math.cos(open) * -uh * 0.92, z + 0.04 + Math.sin(open) * uh * 0.92, 0.035, C.woodDark, 'wood');
  // 窗框
  b.box(w, 0.1, 0.16, frame, cx, y0 + 0.05, z, { col: false, mat: 'wood' });
  b.box(w, 0.1, 0.16, frame, cx, y + h - 0.05, z, { col: false, mat: 'wood' });
  for (const s of [-1, 1]) b.box(0.09, wh, 0.16, frame, cx + s * (w / 2 - 0.045), y0 + wh / 2, z, { col: false, mat: 'wood' });
}

// ---------- 门楼 + 阙楼 ----------
export function gateComplex8(b, o = {}) {
  const base = 0.3, GD = 5.0, zc = GD / 2;
  const XI = 2.4, XS = 7.2, HC = 6.8, HS = 4.4;
  // 台基：素面须弥（圭脚、台身、阶条石）
  b.slab(2 * XS + 1.6, base - 0.1, GD + 1.6, C.marbleShade, 0, 0, 0, { mat: 'stone' });
  b.slab(2 * XS + 1.8, 0.1, GD + 1.8, C.marble, 0, base - 0.1, 0, { mat: 'stoneSmooth', col: false });
  b.collider(0, 0, base, 0, XS + 0.8, zc + 0.8, 0, { walk: true });
  const y = base;
  // 柱网：明间四柱（高）+ 门线上中柱；次间外侧四柱（低）
  const column = (x, z, h, r) => {
    columnBase(b, x, y, z, r, { bronze: true });   // 柱础（D02-03：八角础座、覆盆莲瓣、铜箍）
    b.cyl(r, r + 0.02, h, C.vermilion, x, y + h / 2, z, { seg: 14, mat: 'wood' });
  };
  for (const s of [-1, 1]) {
    for (const z of [zc, 0, -zc]) column(s * XI, z, HC, 0.3);
    for (const z of [zc, 0, -zc]) column(s * XS, z, HS, 0.26);
  }
  // 明间：门线上两扇板门向内开启（门洞贯通）；门上走马板（格栅）
  const dw = 2 * XI - 0.62, dh = 4.5;
  plankDoors(b, 0, y, 0, dw, dh, { open: 1.35, rows: 9, cols: 7 });
  b.panel(dw + 0.3, HC - 0.62 - (dh + 0.24) - 0.05, 0xd7c6a2, 0, y + dh + 0.24 + (HC - 0.62 - dh - 0.24) / 2, 0.02, { mat: 'window' });
  b.panel(dw + 0.3, HC - 0.62 - (dh + 0.24) - 0.05, 0xd7c6a2, 0, y + dh + 0.24 + (HC - 0.62 - dh - 0.24) / 2, -0.02, { mat: 'window', ry: Math.PI });
  // 次间：两扇板门关闭；门两侧与上方为红墙（门上横披格栅）
  for (const s of [-1, 1]) {
    const cx = s * (XI + XS) / 2, w = XS - XI - 0.56, dW = 3.0, dH = 3.3;
    plankDoors(b, cx, y, 0, dW, dH, { open: 0, rows: 7, cols: 5 });
    const side = (w - dW - 0.32) / 2;
    for (const t of [-1, 1]) b.slab(side, HS, 0.34, C.red, cx + t * (dW / 2 + 0.16 + side / 2), y, 0, { mat: 'std' });
    b.slab(dW + 0.32, HS - (dH + 0.24), 0.3, C.red, cx, y + dH + 0.24, 0, { mat: 'std', col: false });
  }
  // 次间外端到阙楼之间的红墙（在次间低檐之下，封住门楼两侧）
  for (const s of [-1, 1]) b.slab(10.0 - XS - 0.26, HS + 0.3, 0.5, C.red, s * (XS + 0.26 + (10.0 - XS - 0.26) / 2), y, 0, { mat: 'std' });
  // 额枋（旋子彩画）+ 平板枋；明间正中鎏金枋心
  for (const z of [zc, -zc]) {
    paintedBeam(b, -XI - 0.3, XI + 0.3, y + HC - 0.62, z, 0.46, 0.38);
    b.slab(2 * XI + 0.9, 0.16, 0.5, C.woodRed, 0, y + HC - 0.16, z, { mat: 'wood', col: false });
    b.slab(2 * XI * 0.22, 0.3, 0.42, C.gold, 0, y + HC - 0.54, z, { mat: 'gold', col: false });
    for (const s of [-1, 1]) {
      paintedBeam(b, Math.min(s * XI, s * XS) - (s < 0 ? 0.3 : 0), Math.max(s * XI, s * XS) + (s > 0 ? 0.3 : 0), y + HS - 0.56, z, 0.4, 0.34);
      b.slab(XS - XI + 0.5, 0.14, 0.44, C.woodRed, s * (XI + XS) / 2, y + HS - 0.14, z, { mat: 'wood', col: false });
    }
  }
  for (const s of [-1, 1]) {
    // 明间两侧的山面额枋、次间外端
    b.slab(0.38, 0.46, GD + 0.4, C.paintBlue, s * XI, y + HC - 0.62, 0, { col: false });
    b.slab(0.34, 0.4, GD + 0.4, C.paintBlue, s * XS, y + HS - 0.56, 0, { col: false });
  }
  // 斗拱：明间前后各一整排（0.8 米一朵）、山面一排；次间前后与外端各一排
  for (const z of [zc, -zc]) for (let i = 0; i <= 6; i++) dougong(b, -XI + i * 0.8, y + HC, z, 0.42, z > 0 ? 0 : Math.PI, true);
  for (const s of [-1, 1]) for (let i = 1; i < 6; i++) dougong(b, s * XI, y + HC, -zc + i * (GD / 6), 0.42, s * Math.PI / 2, true);
  for (const s of [-1, 1]) {
    for (const z of [zc, -zc]) for (let i = 1; i <= 6; i++) dougong(b, s * (XI + i * (XS - XI) / 6), y + HS, z, 0.32, z > 0 ? 0 : Math.PI, true);
    for (let i = 1; i < 5; i++) dougong(b, s * XS, y + HS, -zc + i * (GD / 5), 0.32, s * Math.PI / 2, true);
  }
  // 明间屋顶：单檐歇山（鎏金鸱吻、宝珠、卷草），檐椽连檐双层（厚檐口）
  const yT = y + HC + 0.32, W1 = 2 * XI + 5.0, D1 = GD + 3.0, H1 = D1 * 0.44;
  roofAssembly(b, 'xieshan', W1, D1, H1, yT, C.tileDark, 'glaze', { gold: true, goldK: 1.0, fish: true });
  b.slab(W1 - 0.4, 0.16, D1 - 0.4, C.woodDark, 0, yT - 0.2, 0, { mat: 'wood', col: false });
  b.collider(0, yT - 0.2, yT + H1 * 0.7, 0, W1 / 2 * 0.92, D1 / 2 * 0.9);
  // 次间低檐：庑殿（外端插入阙楼楼基）
  const yS = y + HS + 0.25, W2 = 10.6 - XI + 0.6, D2 = GD + 2.4, H2 = D2 * 0.32;
  for (const s of [-1, 1]) {
    b.push(s * (XI - 0.6 + W2 / 2), 0, 0, 0);
    roofAssembly(b, 'hip', W2, D2, H2, yS, C.tileDark, 'glaze', { gold: false });
    b.pop();
    b.collider(s * (XI - 0.6 + W2 / 2), yS - 0.2, yS + H2 * 0.6, 0, W2 / 2 * 0.95, D2 / 2 * 0.9);
  }
  // 匾额：正面「青岚宗」，背面「問道」
  const p1 = plaqueMesh(o.front || '青岚宗', 3.6, 1.2, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
  p1.position.set(0, y + HC - 1.22, zc + 0.32); b.addMesh(p1);
  const p2 = plaqueMesh(o.back || '問道', 2.6, 1.0, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
  p2.position.set(0, y + HC - 1.14, -zc - 0.32); p2.rotation.y = Math.PI; b.addMesh(p2);
  // 宫灯挂点（明间檐下一对）：sect.js 用实例化的宫灯模型挂上
  const lanterns = [[-XI + 0.6, y + HC - 0.66, zc + 0.5], [XI - 0.6, y + HC - 0.66, zc + 0.5]];

  // ---------- 阙楼 ----------
  const TX = 12.8, TW = 5.6, TD = 5.6, TB = 5.6, TH = 3.0;
  for (const s of [-1, 1]) {
    b.push(s * TX, 0, 0, 0);
    // 楼基：勒脚（深）、白石墙身、腰线、出檐压顶
    b.slab(TW + 0.4, 0.55, TD + 0.4, C.marbleShade, 0, 0, 0, { mat: 'stone' });
    b.slab(TW, TB - 0.55, TD, C.marble, 0, 0.55, 0, { mat: 'stoneSmooth' });
    b.slab(TW + 0.12, 0.16, TD + 0.12, C.marbleWarm, 0, TB - 1.25, 0, { mat: 'stoneSmooth', col: false });
    b.slab(TW + 0.5, 0.22, TD + 0.5, C.marbleWarm, 0, TB - 0.22, 0, { mat: 'stoneSmooth', col: false });
    // 楼基转角的条石隅石（白墙上的块石纹）
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let k = 0; k < 4; k++) b.slab(0.62, 0.5, 0.62, C.marbleShade, sx * (TW / 2 - 0.27), 0.7 + k * 0.95, sz * (TD / 2 - 0.27), { mat: 'stoneSmooth', col: false, sx: 1.02, sz: 1.02 });
    // 正面宗旗（蓝底金纹，垂在楼基正面）；背面（院内）券门
    banner(b, 0, TB - 0.6, TD / 2 + 0.06, 0, 1.3, 3.3, s < 0 ? '青岚' : '问道', 'jade');
    b.box(1.4, 2.2, 0.06, 0x2a2826, 0, 0.55 + 1.1, -TD / 2 - 0.02, { col: false });
    b.add(new THREE.CircleGeometry(0.7, 14, 0, Math.PI), 0x2a2826, 'std', { x: 0, y: 0.55 + 2.2, z: -TD / 2 - 0.02, ry: Math.PI, col: false });
    b.add(new THREE.TorusGeometry(0.78, 0.08, 4, 14, Math.PI), C.marbleWarm, 'stoneSmooth', { x: 0, y: 0.55 + 2.2, z: -TD / 2 - 0.05, col: false });
    // 第十轮：楼基之上改立素材模型的三层望楼（sect.js 放置），此处只留楼基
    if (o.towers === false) { b.collider(0, 0, TB, 0, TW / 2 + 0.2, TD / 2 + 0.2); b.pop(); continue; }
    // 平座：外挑 0.5 米，下有一排斗拱托，四周木栏杆
    const PW = TW + 1.0, PD = TD + 1.0;
    for (const sz of [-1, 1]) for (let i = 0; i <= 6; i++) dougong(b, -TW / 2 + i * TW / 6, TB - 0.05, sz * TD / 2, 0.28, sz > 0 ? 0 : Math.PI, true);
    for (const sx of [-1, 1]) for (let i = 1; i < 6; i++) dougong(b, sx * TW / 2, TB - 0.05, -TD / 2 + i * TD / 6, 0.28, sx * Math.PI / 2, true);
    b.slab(PW, 0.2, PD, C.woodRed, 0, TB + 0.16, 0, { mat: 'wood' });
    b.slab(PW + 0.08, 0.06, PD + 0.08, C.woodDark, 0, TB + 0.36, 0, { mat: 'wood', col: false });
    woodRail(b, [[-PW / 2 + 0.1, PD / 2 - 0.1], [PW / 2 - 0.1, PD / 2 - 0.1], [PW / 2 - 0.1, -PD / 2 + 0.1], [-PW / 2 + 0.1, -PD / 2 + 0.1]], TB + 0.42, { color: C.vermilion, closed: true, h: 0.82, spacing: 0.24 });
    // 上层：朱红木构的真楼层——柱网、楼板（平座板面）、天花与楞木、四面门窗围合，室内有陈设；
    // 正面两间各四扇隔扇门，中间两扇向内开着（门洞见室内），两侧各一扇支摘窗撑起；背面与其余为槛窗
    const uw = TW - 1.0, ud = TD - 1.0, yU = TB + 0.42, bwU = uw / 2 - 0.3, dhU = TH - 0.45;
    for (const [px, pz] of [[-uw / 2, -ud / 2], [uw / 2, -ud / 2], [-uw / 2, ud / 2], [uw / 2, ud / 2], [0, ud / 2], [0, -ud / 2], [-uw / 2, 0], [uw / 2, 0]]) b.cyl(0.17, 0.19, TH, C.vermilion, px, yU + TH / 2, pz, { seg: 10, mat: 'wood', col: false });
    for (const sx2 of [-1, 1]) openLeaves(b, sx2 * uw / 4, yU, ud / 2, bwU, dhU, 1.25, C.vermilion);
    for (const px of [-uw / 4, uw / 4]) sillWindow(b, px, yU, -ud / 2, bwU, dhU, { frame: C.vermilion, wall: C.red, sill: 0.7, wallMat: 'std' });
    for (const sx2 of [-1, 1]) {
      b.push(sx2 * uw / 2, 0, 0, sx2 * Math.PI / 2);
      sillWindow(b, -ud / 4 * sx2, yU, 0, bwU, dhU, { frame: C.vermilion, wall: C.red, sill: 0.7, wallMat: 'std' });
      proppedWindow(b, ud / 4 * sx2, yU, 0, bwU, dhU, 0.7);
      b.pop();
    }
    // 楼板以上的室内：天花板与楞木、正中吊灯、靠后墙一张条案（香炉、书匣）与一对圆凳
    b.slab(uw - 0.1, 0.08, ud - 0.1, C.woodDark, 0, yU + TH - 0.5, 0, { mat: 'wood', col: false });
    for (let k = -2; k <= 2; k++) b.box(uw - 0.1, 0.14, 0.12, C.woodRed, 0, yU + TH - 0.57, k * ud / 5, { mat: 'wood', col: false });
    hangLantern(b, 0, yU + TH - 0.6, 0, 0.7, true);
    b.slab(1.8, 0.06, 0.5, C.woodDark, 0, yU + 0.8, -ud / 2 + 0.55, { mat: 'wood', col: false });
    for (const ex of [-0.82, 0.82]) for (const ez of [-0.2, 0.2]) b.slab(0.06, 0.8, 0.06, C.woodDark, ex, yU, -ud / 2 + 0.55 + ez, { mat: 'wood', col: false });
    b.cyl(0.13, 0.11, 0.14, C.bronze, -0.4, yU + 0.93, -ud / 2 + 0.55, { seg: 10, mat: 'bronze', col: false });
    b.slab(0.36, 0.14, 0.26, C.woodRed, 0.45, yU + 0.86, -ud / 2 + 0.55, { mat: 'wood', col: false });
    for (const ex of [-0.6, 0.6]) b.cyl(0.2, 0.17, 0.46, C.woodRed, ex, yU + 0.23, -ud / 2 + 1.25, { seg: 10, mat: 'wood', col: false });
    for (const sz of [-1, 1]) paintedBeam(b, -uw / 2 - 0.2, uw / 2 + 0.2, yU + TH - 0.42, sz * ud / 2, 0.36, 0.3, { back: false });
    for (const sx of [-1, 1]) b.slab(0.3, 0.36, ud + 0.4, C.paintBlue, sx * uw / 2, yU + TH - 0.42, 0, { col: false });
    for (const sz of [-1, 1]) for (let i = 0; i <= 5; i++) dougong(b, -uw / 2 + i * uw / 5, yU + TH - 0.06, sz * ud / 2, 0.3, sz > 0 ? 0 : Math.PI, true);
    const yR = yU + TH + 0.18, RW = uw + 2.9, RD = ud + 2.9, RH = RD * 0.46;
    roofAssembly(b, 'xieshan', RW, RD, RH, yR, C.tileDark, 'glaze', { gold: true, goldK: 0.7, fish: true });
    // 檐角红灯
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) hangLantern(b, sx * (RW / 2 - 0.55), yR + 0.1, sz * (RD / 2 - 0.55), 0.95, true);
    b.collider(0, 0, yR + RH * 0.7, 0, TW / 2 + 0.2, TD / 2 + 0.2);
    b.pop();
  }
  return { towerX: TX, towerW: TW, towerBase: TB, gateW: 2 * XS, top: yT + H1, lanterns };
}

// ---------- 团纹石（中轴甬道上的圆形浮雕石）----------
const MEDAL = new Map();
export function medallionTexture(kind = 0) {
  if (MEDAL.has(kind)) return MEDAL.get(kind);
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#d9d2c3'; g.fillRect(0, 0, S, S);
  const c = S / 2;
  g.strokeStyle = '#8f8676'; g.lineCap = 'round';
  g.lineWidth = 7; g.beginPath(); g.arc(c, c, 118, 0, TAU); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.arc(c, c, 104, 0, TAU); g.stroke();
  g.lineWidth = 5;
  if (kind === 0) {
    // 卷云团纹：四朵如意云头
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4, x = c + Math.cos(a) * 52, z = c + Math.sin(a) * 52;
      g.beginPath(); g.arc(x, z, 24, a + 0.8, a + 0.8 + 4.6); g.stroke();
      g.beginPath(); g.arc(x + Math.cos(a) * 8, z + Math.sin(a) * 8, 11, a + 2, a + 6.4); g.stroke();
    }
    g.beginPath(); g.arc(c, c, 26, 0, TAU); g.stroke();
  } else {
    // 莲纹：八瓣莲 + 中心莲蓬
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      g.beginPath(); g.ellipse(c + Math.cos(a) * 56, c + Math.sin(a) * 56, 36, 15, a, 0, TAU); g.stroke();
    }
    g.beginPath(); g.arc(c, c, 22, 0, TAU); g.stroke();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; g.beginPath(); g.arc(c + Math.cos(a) * 11, c + Math.sin(a) * 11, 3, 0, TAU); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  MEDAL.set(kind, t);
  return t;
}

// ---------- 龟趺宗门碑：赑屃（龟背纹、昂首、四足）+ 碑身 + 螭首碑额 ----------
export function turtleStele(b, x, y, z, ry, draw, canvasBoard) {
  b.push(x, y, z, ry);
  b.slab(3.0, 0.22, 4.2, C.marbleShade, 0, 0, 0, { mat: 'stone' });
  b.slab(3.1, 0.06, 4.3, C.marble, 0, 0.22, 0, { mat: 'stoneSmooth', col: false });
  const S = C.stoneWarm;
  b.sphere(1.15, S, 0, 0.62, -0.1, { mat: 'stoneSmooth', sx: 1.05, sy: 0.5, sz: 1.42, seg: 16, seg2: 9 });           // 龟背
  for (let i = 0; i < 7; i++) {                                                                                      // 龟背六角纹（凸起的甲片）
    const a = (i / 6) * TAU, r = i === 6 ? 0 : 0.6;
    b.add(new THREE.CylinderGeometry(0.34, 0.38, 0.12, 6), 0xbcb3a0, 'stoneSmooth', { x: Math.cos(a) * r, y: 1.08 - (r ? 0.1 : 0), z: -0.1 + Math.sin(a) * r * 1.2, rx: Math.sin(a) * r * 0.35, rz: -Math.cos(a) * r * 0.35, col: false });
  }
  b.sphere(0.36, S, 0, 0.78, 1.58, { mat: 'stoneSmooth', sx: 0.95, sy: 0.85, sz: 1.25 });                            // 昂首
  b.sphere(0.2, S, 0, 0.72, 1.95, { mat: 'stoneSmooth', sx: 1.1, sy: 0.7, sz: 1.0 });
  for (const s of [-1, 1]) b.sphere(0.07, C.stoneDark, s * 0.2, 0.92, 1.72, { mat: 'stoneSmooth', seg: 6, seg2: 4 });
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    b.sphere(0.3, S, sx * 0.95, 0.3, sz * 0.95 - 0.1, { mat: 'stoneSmooth', sy: 0.65, sx: 1.2 });
    b.sphere(0.18, S, sx * 1.12, 0.14, sz * 1.15 - 0.1, { mat: 'stoneSmooth', sy: 0.5, sz: 1.3 });
  }
  b.collider(0, 0, 1.3, 0, 1.35, 2.0);
  // 碑座（龟背上的方座）+ 碑身 + 螭首碑额（两条盘螭）
  b.slab(1.7, 0.32, 0.76, C.stone, 0, 1.08, -0.1, { mat: 'stoneSmooth', col: false });
  b.slab(1.44, 2.9, 0.4, C.stoneDark, 0, 1.4, -0.1, { mat: 'stoneSmooth' });
  b.slab(1.6, 0.14, 0.46, C.stoneDark, 0, 4.28, -0.1, { mat: 'stoneSmooth', col: false });
  b.add(new THREE.CylinderGeometry(0.8, 0.8, 0.44, 20, 1, false, -Math.PI / 2, Math.PI), C.stoneDark, 'stoneSmooth', { x: 0, y: 4.42, z: -0.1, rx: Math.PI / 2, col: false });
  for (const s of [-1, 1]) {
    b.add(new THREE.TorusGeometry(0.42, 0.11, 6, 12, Math.PI * 1.1), 0x6f6b63, 'stoneSmooth', { x: s * 0.36, y: 4.62, z: 0.14, rz: s > 0 ? 0.2 : Math.PI - 0.2, col: false });
    b.add(new THREE.TorusGeometry(0.42, 0.11, 6, 12, Math.PI * 1.1), 0x6f6b63, 'stoneSmooth', { x: s * 0.36, y: 4.62, z: -0.34, rz: s > 0 ? 0.2 : Math.PI - 0.2, col: false });
  }
  if (draw && canvasBoard) {
    const m = canvasBoard(1.18, 2.4, draw, { px: 300, back: 0x5c5a55 });
    m.position.set(0, 2.82, 0.12);
    m.scale.z = 0.4;
    b.addMesh(m);
  }
  b.pop();
}

// ---------- 接引院的两座亭 ----------
// 登记亭：方亭（四柱、坐凳栏杆三面、入口朝院心），亭中书案、名册、笔砚、两只绣墩，亭侧一块“入山登记”小木牌
export function registerPavilion(b, entrance, P) {
  const top = pavilion(b, { n: 4, r: 2.5, h: 3.3, base: 0.45, benches: true, entrance, glaze: true, roofColor: C.tileDark, pillar: C.vermilion, beam: C.paintBlue });
  P.registerDesk(b, 0, 0.45, -0.25, 0);
  for (const s of [-1, 1]) {
    b.cyl(0.22, 0.24, 0.44, 0xa04a32, s * 0.55, 0.45, 0.62, { seg: 10, mat: 'wood', col: false });
    b.cyl(0.24, 0.24, 0.05, 0x3e5c66, s * 0.55, 0.89, 0.62, { seg: 10, col: false });
  }
  // 书架（背后）与卷轴
  b.slab(1.6, 1.5, 0.36, C.woodRed, 0, 0.45, -1.35, { mat: 'wood' });
  for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) b.cyl(0.05, 0.05, 0.3, k % 2 ? 0xd9c9a4 : 0xc7b38a, -0.55 + k * 0.36, 0.45 + 0.32 + i * 0.42, -1.3, { rz: Math.PI / 2, seg: 6, col: false });
  return top;
}
// 茶亭：六角亭（坐凳栏杆），亭中石圆桌、四只鼓凳、茶壶茶盏，亭边风炉铜壶
export function teaPavilion(b, entrance) {
  const top = pavilion(b, { n: 6, r: 2.7, h: 3.3, base: 0.45, benches: true, entrance, glaze: true, roofColor: C.tileDark, pillar: C.vermilion, beam: C.paintBlue });
  b.cyl(0.62, 0.66, 0.08, C.marbleWarm, 0, 0.45 + 0.74, 0, { seg: 18, mat: 'stoneSmooth', col: false });
  b.cyl(0.18, 0.3, 0.74, C.marbleShade, 0, 0.45, 0, { seg: 12, mat: 'stoneSmooth' });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    b.cyl(0.2, 0.22, 0.44, C.marbleWarm, Math.cos(a) * 1.05, 0.45, Math.sin(a) * 1.05, { seg: 10, mat: 'stoneSmooth', col: false });
  }
  b.sphere(0.12, 0x6a4a3a, 0.1, 0.45 + 0.9, 0.05, { mat: 'stoneSmooth', sy: 0.85 });                  // 茶壶
  b.cyl(0.02, 0.03, 0.12, 0x6a4a3a, 0.24, 0.45 + 0.94, 0.05, { rz: -0.9, seg: 5, col: false });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; b.cyl(0.05, 0.035, 0.06, 0xe8e2d6, Math.cos(a) * 0.4, 0.45 + 0.82, Math.sin(a) * 0.4, { seg: 8, mat: 'stoneSmooth', col: false }); }
  // 亭外风炉与铜壶
  b.cyl(0.2, 0.24, 0.5, 0x5a4a3c, 2.9, 0, 0.9, { seg: 10, mat: 'stone', col: false });
  b.sphere(0.16, C.bronze, 2.9, 0.62, 0.9, { mat: 'bronze', sy: 0.8 });
  return top;
}
