// 生活与景观小品：每件物件的位置都对应其用途（接引登记、奉茶、晨练、晒药、农作、洗衣、劈柴……）
import * as THREE from 'three';
import { C } from './builder.js';
import { beam, gableRoofGeo, xieshanRoofGeo, roofAssembly, plaqueTexture, hangLantern, pyramidRoofGeo } from './arch.js';
import { stoneLanternR } from './ornaments.js';
import { stoneSet9 } from './furniture9.js';

const TAU = Math.PI * 2;

// 画布贴图面板（碑文、告示、导览图）：返回网格，可在之后重绘
export function canvasBoard(w, h, draw, { px = 512, back = 0x5a4330 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = px; cv.height = Math.round(px * (h / w));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const redraw = (fn = draw) => { fn(cv.getContext('2d'), cv.width, cv.height); tex.needsUpdate = true; };
  redraw();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  const side = new THREE.MeshStandardMaterial({ color: back, roughness: 0.85 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), [side, side, side, side, mat, side]);
  m.castShadow = true; m.receiveShadow = true;
  m.userData.redraw = redraw;
  m.userData.canvas = cv;
  return m;
}

export function paperTexture(g, w, h, base = '#efe6cf') {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(120,96,60,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 2);
  }
}

// 石灯笼：须弥座、灯柱、灯室（四面开窗）、宝顶
export function stoneLantern(b, x, y, z, s = 1, ry = 0) { stoneLanternR(b, x, y, z, s, ry); }
export function stoneLantern6(b, x, y, z, s = 1, ry = 0) {
  // 中式六角石灯：须弥座（圭脚、束腰、上枋）→ 六棱柱身（上下箍）→ 仰莲承盘 → 灯室（六柱、灯芯）→ 起翘宝盖 → 宝珠
  const H6 = Math.PI / 6;
  b.push(x, y, z, ry);
  const lathe = (r0, r1, h, y0, col, mat = 'stoneSmooth', seg = 6) => b.cyl(r0 * s, r1 * s, h * s, col, 0, (y0 + h / 2) * s, 0, { seg, mat, col: false, ry: H6 });
  lathe(0.5, 0.54, 0.16, 0, C.stoneDark, 'stone');          // 圭脚
  lathe(0.44, 0.46, 0.08, 0.16, C.stone);                    // 下枋
  lathe(0.34, 0.34, 0.16, 0.24, C.stoneDark);                // 束腰
  lathe(0.44, 0.42, 0.08, 0.4, C.stone);                     // 上枋
  lathe(0.15, 0.17, 0.86, 0.48, C.stone);                    // 柱身
  lathe(0.2, 0.2, 0.05, 0.56, C.stoneWarm); lathe(0.19, 0.19, 0.05, 1.22, C.stoneWarm);   // 箍
  lathe(0.38, 0.18, 0.14, 1.34, C.stone, 'stoneSmooth', 12); // 仰莲承盘
  for (let k = 0; k < 12; k++) {                             // 莲瓣
    const a = (k / 12) * Math.PI * 2;
    b.sphere(0.075 * s, C.stoneWarm, Math.cos(a) * 0.3 * s, 1.44 * s, Math.sin(a) * 0.3 * s, { mat: 'stoneSmooth', sx: 0.7, sy: 1.1, seg: 6, seg2: 4 });
  }
  lathe(0.3, 0.32, 0.06, 1.48, C.stone);
  for (let k = 0; k < 6; k++) {                              // 灯室六柱
    const a = (k / 6) * Math.PI * 2;
    b.slab(0.07 * s, 0.4 * s, 0.07 * s, C.stone, Math.cos(a) * 0.24 * s, 1.54 * s, Math.sin(a) * 0.24 * s, { mat: 'stoneSmooth', col: false, ry: -a });
  }
  lathe(0.17, 0.17, 0.32, 1.57, 0xf3dca8, 'glow');           // 灯芯
  lathe(0.32, 0.3, 0.06, 1.94, C.stone);
  b.add(pyramidRoofGeo(6, 0.58 * s, 0.34 * s, { lift: 0.42 }), C.stone, 'stoneSmooth', { y: 2.0 * s, ry: 0, col: false });   // 宝盖（起翘）
  b.add(pyramidRoofGeo(6, 0.58 * s, 0.34 * s, { lift: 0.42 }), C.stoneDark, 'stoneSmooth', { y: 1.98 * s, ry: 0, sy: -0.25, col: false });
  lathe(0.08, 0.12, 0.12, 2.32, C.stone, 'stoneSmooth', 10);
  b.sphere(0.1 * s, C.stone, 0, 2.52 * s, 0, { mat: 'stoneSmooth', seg: 10, seg2: 8 });
  b.add(new THREE.ConeGeometry(0.05 * s, 0.14 * s, 8), C.stone, 'stoneSmooth', { y: 2.66 * s, col: false });
  b.collider(0, 0, 2.5 * s, 0, 0.42 * s, 0.42 * s);
  b.pop();
}

// 宗门碑：赑屃（龟趺）+ 碑身 + 碑首，碑文为贴图
export function stele(b, x, y, z, ry, textDraw) {
  b.push(x, y, z, ry);
  b.slab(2.6, 0.25, 3.6, C.stoneDark, 0, 0, 0, { mat: 'stone' });
  // 龟趺
  b.sphere(1.05, C.stoneWarm, 0, 0.55, -0.1, { mat: 'stoneSmooth', sx: 1.05, sy: 0.55, sz: 1.45, seg: 14, seg2: 8 });
  b.sphere(0.34, C.stoneWarm, 0, 0.62, 1.55, { mat: 'stoneSmooth', sx: 0.9, sy: 0.8, sz: 1.2 });
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) b.sphere(0.24, C.stoneWarm, sx * 0.85, 0.32, sz * 0.9 - 0.1, { mat: 'stoneSmooth', sy: 0.7 });
  b.collider(0, 0, 1.2, 0, 1.1, 1.75);
  // 碑身
  b.slab(1.5, 0.3, 0.6, C.stone, 0, 1.05, -0.1, { mat: 'stoneSmooth', col: false });
  b.slab(1.3, 2.7, 0.34, C.stoneDark, 0, 1.3, -0.1, { mat: 'stoneSmooth' });
  b.add(new THREE.CylinderGeometry(0.66, 0.66, 0.36, 18, 1, false, -Math.PI / 2, Math.PI), C.stoneDark, 'stoneSmooth', { x: 0, y: 4.0, z: -0.1, rx: Math.PI / 2, col: false });
  b.slab(1.34, 0.12, 0.38, C.stoneDark, 0, 3.95, -0.1, { mat: 'stoneSmooth', col: false });
  if (textDraw) {
    const m = canvasBoard(1.1, 2.3, textDraw, { px: 300, back: 0x5c5a55 });
    m.position.set(0, 2.62, 0.08);
    m.scale.z = 0.4;
    b.addMesh(m);
  }
  b.pop();
}

// 导览牌：双柱、带小坡顶的木框画板（画面为宗门舆图）
export function guideBoard(b, x, y, z, ry, draw) {
  b.push(x, y, z, ry);
  for (const s of [-1, 1]) {
    b.slab(0.36, 0.3, 0.36, C.stoneDark, s * 1.45, 0, 0, { mat: 'stone' });
    b.cyl(0.08, 0.09, 3.1, C.woodDark, s * 1.45, 1.55, 0, { mat: 'wood', seg: 8 });
  }
  b.slab(3.0, 0.12, 0.16, C.woodDark, 0, 2.7, 0, { mat: 'wood', col: false });
  b.slab(3.0, 0.1, 0.14, C.woodDark, 0, 1.0, 0, { mat: 'wood', col: false });
  b.add(gableRoofGeo(3.6, 0.9, 0.32), C.tile, 'roof', { y: 3.08, col: false });
  b.box(3.7, 0.12, 0.12, C.ridge, 0, 3.42, 0, { mat: 'roof', col: false });
  const m = canvasBoard(2.7, 1.62, draw, { px: 900, back: 0x4a3828 });
  m.position.set(0, 1.88, 0.02);
  b.addMesh(m);
  b.collider(0, 0, 3.1, 0, 1.6, 0.25);
  b.pop();
  return m;
}

// 登记案：书案、名册、砚台、笔架、腰牌
export function registerDesk(b, x, y, z, ry) {
  b.push(x, y, z, ry);
  b.slab(1.6, 0.06, 0.7, C.woodRed, 0, 0.76, 0, { mat: 'wood' });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.slab(0.07, 0.76, 0.07, C.woodRed, sx * 0.72, 0, sz * 0.28, { mat: 'wood', col: false });
  b.slab(1.5, 0.06, 0.06, C.woodRed, 0, 0.62, 0.3, { mat: 'wood', col: false });
  b.slab(0.42, 0.05, 0.3, C.paper, -0.3, 0.82, 0, { col: false });                    // 名册
  b.slab(0.2, 0.06, 0.3, 0xb8452e, -0.3, 0.825, 0.02, { col: false, sx: 0.06 });      // 书脊
  b.slab(0.16, 0.04, 0.22, C.black, 0.25, 0.82, -0.05, { mat: 'stoneSmooth', col: false }); // 砚
  b.slab(0.22, 0.12, 0.04, C.woodDark, 0.55, 0.82, -0.15, { mat: 'wood', col: false });     // 笔架
  for (let i = 0; i < 4; i++) b.slab(0.06, 0.008, 0.11, 0x8e7a4e, 0.4 + i * 0.08, 0.82, 0.18, { col: false }); // 腰牌
  b.collider(0, 0, 0.82, 0, 0.82, 0.38);
  b.pop();
}

export function bench(b, x, y, z, ry, len = 2.2, color = C.stoneWarm, mat = 'stoneSmooth') {
  b.push(x, y, z, ry);
  b.slab(len, 0.1, 0.46, color, 0, 0.36, 0, { mat });
  for (const s of [-1, 1]) b.slab(0.3, 0.36, 0.4, color, s * (len / 2 - 0.25), 0, 0, { mat, col: false });
  b.collider(0, 0, 0.46, 0, len / 2, 0.24);
  b.pop();
}

// 茶寮：四柱小卷棚、茶案、条凳、风炉与铜壶、茶旗
export function teaShed(b, x, y, z, ry) {
  b.push(x, y, z, ry);
  b.slab(5.4, 0.18, 4.2, C.stone, 0, 0, 0, { mat: 'stone' });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    b.cyl(0.11, 0.12, 2.75, C.woodDark, sx * 2.35, 1.55, sz * 1.75, { mat: 'wood', seg: 8 });
  }
  for (const s of [-1, 1]) b.slab(5.0, 0.18, 0.16, C.woodDark, 0, 2.75, s * 1.75, { mat: 'wood', col: false });
  roofAssembly(b, 'juan', 6.2, 4.9, 1.05, 2.92, C.tile, 'roof', { under: true });
  b.collider(0, 2.9, 4.0, 0, 3.1, 2.4);
  // 茶案与凳
  b.slab(1.8, 0.07, 0.8, C.woodRed, 0, 0.72, 0.2, { mat: 'wood' });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.slab(0.07, 0.72, 0.07, C.woodRed, sx * 0.8, 0.18, 0.2 + sz * 0.32, { mat: 'wood', col: false });
  for (const s of [-1, 1]) {
    b.slab(1.9, 0.07, 0.3, C.wood, 0, 0.45, 0.2 + s * 0.85, { mat: 'wood' });
    for (const q of [-1, 1]) b.slab(0.06, 0.27, 0.24, C.wood, q * 0.8, 0.18, 0.2 + s * 0.85, { mat: 'wood', col: false });
  }
  // 茶具
  b.cyl(0.09, 0.11, 0.14, 0x4b5a5a, -0.2, 0.86, 0.15, { col: false, mat: 'glaze', seg: 10 });
  b.sphere(0.07, 0x4b5a5a, -0.2, 0.98, 0.15, { mat: 'glaze', sy: 0.6 });
  for (let i = 0; i < 4; i++) b.cyl(0.035, 0.028, 0.05, 0xe6e1d4, 0.15 + i * 0.13, 0.81, 0.32 - (i % 2) * 0.12, { col: false, seg: 8, mat: 'glaze' });
  b.slab(0.36, 0.02, 0.24, C.woodDark, 0.3, 0.79, 0.05, { col: false, mat: 'wood' });
  // 风炉与壶
  b.cyl(0.24, 0.3, 0.55, C.brickDark, 1.7, 0.45, -1.1, { mat: 'stone', seg: 10 });
  b.cyl(0.2, 0.2, 0.04, 0xd06030, 1.7, 0.74, -1.1, { mat: 'glow', col: false, seg: 10 });
  b.sphere(0.2, 0x5a4a3a, 1.7, 0.9, -1.1, { mat: 'bronze', sy: 0.85 });
  b.cyl(0.02, 0.03, 0.22, 0x5a4a3a, 1.86, 0.95, -1.1, { col: false, rz: -0.9 });
  b.emitter('steam', 1.7, 1.1, -1.1);
  // 茶罐、竹篮
  b.cyl(0.13, 0.13, 0.3, 0x6b4a38, 1.9, 0.18, -0.6, { col: false, mat: 'glaze', seg: 10 });
  b.cyl(0.28, 0.22, 0.26, C.bamboo, -2.0, 0.18, -1.2, { col: false, seg: 12, mat: 'thatch' });
  // 茶旗
  b.cyl(0.04, 0.05, 3.9, C.woodDark, 2.75, 2.13, 1.9, { col: false, mat: 'wood' });
  b.slab(0.08, 0.04, 1.0, C.woodDark, 2.75, 3.9, 1.45, { col: false, mat: 'wood' });
  const flagTex = plaqueTexture('茶', { bg: '#e8e1cf', fg: '#3a3a36', frame: '#8a3a2c', vertical: true, w: 300, h: 140 });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.25), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.95 }));
  flag.position.set(2.75, 3.25, 1.2);
  flag.rotation.y = Math.PI / 2;
  flag.userData.sway = true;
  b.addMesh(flag);
  b.pop();
}

// 旗杆与宗旗
export function flagpole(b, x, y, z, ry, text = '青岚', h = 9) {
  b.push(x, y, z, ry);
  b.slab(1.0, 0.3, 1.0, C.stoneDark, 0, 0, 0, { mat: 'stone' });
  for (const s of [-1, 1]) b.slab(0.18, 1.2, 0.5, C.stone, s * 0.18, 0.3, 0, { mat: 'stoneSmooth', col: false });
  b.cyl(0.07, 0.11, h, C.woodDark, 0, h / 2, 0, { mat: 'wood', seg: 8 });
  b.sphere(0.13, C.gold, 0, h + 0.1, 0, { mat: 'gold' });
  b.slab(1.6, 0.06, 0.06, C.woodDark, 0.8, h - 0.4, 0, { col: false, mat: 'wood' });
  const tex = plaqueTexture(text, { bg: '#3e5c66', fg: '#ece4d0', frame: '#2e444c', vertical: true, w: 520, h: 200 });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 3.6, 6, 1), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.95 }));
  flag.position.set(0.82, h - 2.25, 0);
  flag.userData.sway = true;
  flag.castShadow = true;
  b.addMesh(flag);
  b.pop();
}

// 兵器架：长枪、木棍、木剑
export function weaponRack(b, x, y, z, ry) {
  b.push(x, y, z, ry);
  for (const s of [-1, 1]) {
    b.slab(0.12, 1.9, 0.12, C.woodDark, s * 1.3, 0, 0, { mat: 'wood' });
    b.slab(0.12, 0.08, 0.7, C.woodDark, s * 1.3, 0.02, 0, { mat: 'wood', col: false });
  }
  b.slab(2.72, 0.1, 0.12, C.woodDark, 0, 1.6, 0, { mat: 'wood', col: false });
  b.slab(2.72, 0.08, 0.36, C.woodDark, 0, 0.3, 0, { mat: 'wood', col: false });
  for (let i = 0; i < 7; i++) {
    const xx = -1.05 + i * 0.35, kind = i % 3;
    const lean = 0.12;
    b.cyl(0.022, 0.026, kind === 0 ? 2.6 : 2.0, kind === 2 ? C.woodLight : C.wood, xx, (kind === 0 ? 1.3 : 1.0) + 0.3, 0.12, { col: false, rx: -lean, seg: 6, mat: 'wood' });
    if (kind === 0) b.add(new THREE.ConeGeometry(0.04, 0.24, 6), 0xb6b8b4, 'gold', { x: xx, y: 2.95, z: -0.05, rx: -lean, col: false });
    if (kind === 0) b.sphere(0.06, 0xa83a2c, xx, 2.75, -0.03, { sy: 1.4 });
  }
  b.collider(0, 0, 1.9, 0, 1.4, 0.3);
  b.pop();
}

// 木人桩
export function dummy(b, x, y, z, ry) {
  b.push(x, y, z, ry);
  b.cyl(0.2, 0.22, 1.9, C.wood, 0, 0.95, 0, { mat: 'wood', seg: 10 });
  b.cyl(0.24, 0.26, 0.12, C.woodDark, 0, 0.06, 0, { mat: 'wood', col: false });
  for (const [yy, ang, len] of [[1.45, 0.5, 0.55], [1.45, -0.5, 0.55], [1.05, 0, 0.6]]) {
    const dx = Math.sin(ang) * len, dz = Math.cos(ang) * len;
    beam(b, 0, yy, 0, dx, yy - 0.08, dz, 0.07, C.woodLight, 'wood');
  }
  b.cyl(0.03, 0.03, 0.4, C.woodDark, 0, 0.55, 0.22, { col: false, rx: 0.9, mat: 'wood' });
  b.pop();
}

// 石锁、石墩
export function stoneWeights(b, x, y, z) {
  b.push(x, y, z, 0);
  for (const [dx, dz, s] of [[0, 0, 1], [0.6, 0.2, 0.85], [-0.4, 0.5, 0.75]]) {
    b.slab(0.36 * s, 0.32 * s, 0.24 * s, C.stone, dx, 0, dz, { mat: 'stoneSmooth', col: false });
    b.add(new THREE.TorusGeometry(0.1 * s, 0.035 * s, 5, 10, Math.PI), C.stone, 'stoneSmooth', { x: dx, y: 0.32 * s, z: dz, col: false });
  }
  b.cyl(0.32, 0.36, 0.45, C.stoneWarm, -0.9, 0.22, -0.4, { mat: 'stone', seg: 10 });
  b.pop();
}

// 蒲团
export function cushion(b, x, y, z) {
  b.cyl(0.32, 0.34, 0.12, 0xa48a5c, x, y + 0.06, z, { col: false, seg: 14, mat: 'thatch' });
  b.cyl(0.24, 0.3, 0.05, 0x8e7650, x, y + 0.14, z, { col: false, seg: 14, mat: 'thatch' });
}

// 方鼎（广场北端）
export function cauldron(b, x, y, z, ry = 0) {
  b.push(x, y, z, ry);
  b.slab(3.4, 0.5, 3.4, C.stone, 0, 0, 0, { mat: 'stone' });
  b.slab(3.0, 0.16, 3.0, C.stoneWarm, 0, 0.5, 0, { mat: 'stoneSmooth', col: false });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.cyl(0.13, 0.17, 0.85, C.bronze, sx * 0.72, 0.66 + 0.42, sz * 0.62, { mat: 'bronze', col: false });
  b.slab(1.9, 1.15, 1.6, C.bronze, 0, 1.45, 0, { mat: 'bronze', col: false });
  b.slab(2.0, 0.12, 1.7, C.bronze, 0, 2.58, 0, { mat: 'bronze', col: false });
  for (const s of [-1, 1]) {
    b.slab(0.12, 0.6, 0.12, C.bronze, s * 0.75, 2.7, 0, { mat: 'bronze', col: false });
    b.add(new THREE.TorusGeometry(0.22, 0.05, 5, 12, Math.PI), C.bronze, 'bronze', { x: s * 0.75, y: 3.18, z: 0, ry: Math.PI / 2, col: false });
  }
  // 饕餮纹带
  for (const s of [-1, 1]) b.slab(1.5, 0.24, 0.04, 0x55593f, 0, 2.1, s * 0.81, { mat: 'bronze', col: false });
  b.collider(0, 0, 2.8, 0, 1.75, 1.75, 0, { walk: false });
  b.emitter('incense', 0, 2.8, 0, { rate: 2 });
  b.pop();
}

// 委托告示栏：双柱、檐顶、告示纸（贴图）
export function noticeBoard(b, x, y, z, ry, draw) {
  b.push(x, y, z, ry);
  for (const s of [-1, 1]) {
    b.slab(0.4, 0.28, 0.4, C.stoneDark, s * 1.75, 0, 0, { mat: 'stone' });
    b.cyl(0.1, 0.11, 3.0, C.woodDark, s * 1.75, 1.5, 0, { mat: 'wood', seg: 8 });
  }
  b.slab(3.9, 0.14, 0.18, C.woodDark, 0, 2.62, 0, { mat: 'wood', col: false });
  b.slab(3.9, 0.12, 0.18, C.woodDark, 0, 0.82, 0, { mat: 'wood', col: false });
  b.slab(3.4, 1.7, 0.06, 0x8a6e52, 0, 0.9, -0.02, { mat: 'wood', col: false });
  roofAssembly(b, 'gable', 4.6, 1.3, 0.42, 2.86, C.tile, 'roof', { under: true });
  const m = canvasBoard(3.2, 1.5, draw, { px: 900, back: 0x6a5440 });
  m.position.set(0, 1.75, 0.05);
  m.scale.z = 0.3;
  b.addMesh(m);
  b.collider(0, 0, 3.0, 0, 1.95, 0.3);
  b.pop();
  return m;
}

// 演武台（圆形）：土衬、下枭线脚、台身、出沿的压面石，四向两级踏步带垂带。台面的聚灵阵（刻纹与发光）由 qi.js 绘制；
// top = true 时仍画旧版的太极八卦台面（未接聚灵阵的地方可用）
export function trainingPlatform(b, x, y, z, r, { top = true } = {}) {
  b.push(x, y, z, 0);
  const h = 0.45;
  b.cyl(r + 0.46, r + 0.52, 0.1, C.stoneDark, 0, 0.05, 0, { seg: 64, mat: 'stone', col: false });          // 土衬
  b.cyl(r + 0.14, r + 0.32, 0.12, C.stone, 0, 0.16, 0, { seg: 64, mat: 'stoneSmooth', col: false });       // 下枭线脚
  b.cyl(r + 0.02, r + 0.06, h - 0.2, C.stone, 0, 0.22 + (h - 0.32) / 2, 0, { seg: 64, mat: 'stone', col: false });  // 台身
  b.cyl(r + 0.12, r + 0.08, 0.1, C.stoneWarm, 0, h - 0.05, 0, { seg: 64, mat: 'stoneSmooth', col: false }); // 压面石（出沿）
  b.cylCollider(0, 0, h, 0, r + 0.12, { walk: true });
  // 四向踏步：两级，两侧垂带
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    b.push(Math.sin(a) * (r + 0.12), 0, Math.cos(a) * (r + 0.12), a);
    b.slab(2.6, 0.3, 0.42, C.stoneWarm, 0, 0, 0.21, { mat: 'stoneSmooth' });
    b.slab(2.6, 0.15, 0.42, C.stoneWarm, 0, 0, 0.63, { mat: 'stoneSmooth' });
    for (const sd of [-1, 1]) b.add(new THREE.BoxGeometry(0.34, 0.42, 0.95), C.stone, 'stoneSmooth', { x: sd * 1.47, y: 0.18, z: 0.42, rx: -0.33 });
    b.pop();
  }
  if (!top) { b.pop(); return; }
  // 台面贴图
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1024;
  const g = cv.getContext('2d');
  const c = 512;
  g.fillStyle = '#a7a397'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${60 + Math.random() * 40},${58 + Math.random() * 40},50,${Math.random() * 0.06})`; g.fillRect(Math.random() * 1024, Math.random() * 1024, 2 + Math.random() * 6, 2 + Math.random() * 6); }
  g.strokeStyle = 'rgba(70,68,62,.55)'; g.lineWidth = 3;
  for (const rr of [500, 400, 300]) { g.beginPath(); g.arc(c, c, rr, 0, TAU); g.stroke(); }
  for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; g.beginPath(); g.moveTo(c + Math.cos(a) * 300, c + Math.sin(a) * 300); g.lineTo(c + Math.cos(a) * 508, c + Math.sin(a) * 508); g.stroke(); }
  const tri = ['111', '110', '101', '100', '011', '010', '001', '000'];
  g.fillStyle = 'rgba(52,54,52,.8)';
  tri.forEach((t, k) => {
    const a = (k / 8) * TAU - Math.PI / 2;
    g.save(); g.translate(c + Math.cos(a) * 350, c + Math.sin(a) * 350); g.rotate(a + Math.PI / 2);
    for (let l = 0; l < 3; l++) {
      const yy = -26 + l * 26;
      if (t[l] === '1') g.fillRect(-46, yy, 92, 13);
      else { g.fillRect(-46, yy, 38, 13); g.fillRect(8, yy, 38, 13); }
    }
    g.restore();
  });
  const R = 190;
  g.fillStyle = '#e4dfd2'; g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill();
  g.fillStyle = '#3b3d3c'; g.beginPath(); g.arc(c, c, R, -Math.PI / 2, Math.PI / 2); g.arc(c, c + R / 2, R / 2, Math.PI / 2, -Math.PI / 2, true); g.arc(c, c - R / 2, R / 2, Math.PI / 2, -Math.PI / 2, false); g.fill();
  g.fillStyle = '#e4dfd2'; g.beginPath(); g.arc(c, c + R / 2, R / 7, 0, TAU); g.fill();
  g.fillStyle = '#3b3d3c'; g.beginPath(); g.arc(c, c - R / 2, R / 7, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(40,40,38,.7)'; g.lineWidth = 6; g.beginPath(); g.arc(c, c, R, 0, TAU); g.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const topMesh = new THREE.Mesh(new THREE.CircleGeometry(r, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  topMesh.rotation.x = -Math.PI / 2;
  topMesh.position.y = h + 0.005;
  topMesh.receiveShadow = true;
  topMesh.userData.fadeable = false;
  b.addMesh(topMesh);
  b.pop();
}

// ---------------- 丹房、药圃 ----------------
// 晒药架：三层竹匾（不同颜色的药材）
export function dryingRack(b, x, y, z, ry, rand = Math.random) {
  b.push(x, y, z, ry);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.cyl(0.04, 0.05, 1.85, C.bambooDry, sx * 0.95, 0.92, sz * 0.5, { seg: 6, col: false, mat: 'wood' });
  const herb = [0x8a7a48, 0x6e7a46, 0xa35a3a, 0xb8a060, 0x5f6b44, 0x9a6a50];
  for (let l = 0; l < 3; l++) {
    const yy = 0.45 + l * 0.55;
    for (const s of [-1, 1]) b.slab(2.0, 0.04, 0.04, C.bambooDry, 0, yy - 0.04, s * 0.5, { col: false, mat: 'wood' });
    for (const sx of [-0.48, 0.48]) {
      b.cyl(0.46, 0.46, 0.05, C.bamboo, sx, yy, 0, { seg: 16, col: false, mat: 'thatch' });
      b.cyl(0.4, 0.36, 0.04, herb[Math.floor(rand() * herb.length)], sx, yy + 0.04, 0, { seg: 12, col: false, mat: 'leaf' });
    }
  }
  b.collider(0, 0, 1.9, 0, 1.05, 0.6);
  b.pop();
}

// 竹筐 / 背篓
export function basket(b, x, y, z, s = 1, kind = 0, fill = 0x6f7a48) {
  if (kind === 0) {
    b.cyl(0.32 * s, 0.24 * s, 0.34 * s, C.bamboo, x, y + 0.17 * s, z, { seg: 14, col: false, mat: 'thatch', open: true });
    b.cyl(0.29 * s, 0.29 * s, 0.03, fill, x, y + 0.3 * s, z, { seg: 12, col: false, mat: 'leaf' });
    b.cylCollider(x, y, y + 0.34 * s, z, 0.3 * s);
  } else {
    b.cyl(0.26 * s, 0.18 * s, 0.7 * s, C.bambooDry, x, y + 0.35 * s, z, { seg: 12, col: false, mat: 'thatch', open: true });
    b.cyl(0.24 * s, 0.24 * s, 0.03, fill, x, y + 0.62 * s, z, { seg: 10, col: false, mat: 'leaf' });
    b.cylCollider(x, y, y + 0.7 * s, z, 0.26 * s);
  }
}

// 药臼
export function mortar(b, x, y, z) {
  b.cyl(0.32, 0.26, 0.5, C.stone, x, y + 0.25, z, { seg: 12, mat: 'stoneSmooth' });
  b.cyl(0.22, 0.22, 0.02, 0x5a5040, x, y + 0.5, z, { seg: 12, col: false });
  b.cyl(0.05, 0.07, 0.75, C.woodLight, x + 0.08, y + 0.75, z, { col: false, rz: 0.3, mat: 'wood' });
}

// 丹炉（三足圆鼎，炉盖，炉膛火光）
export function furnace(b, x, y, z, ry = 0) {
  b.push(x, y, z, ry);
  b.cyl(1.55, 1.7, 0.4, C.stone, 0, 0.2, 0, { seg: 8, mat: 'stone' });
  for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + 0.3; b.cyl(0.14, 0.2, 0.9, C.bronze, Math.cos(a) * 0.72, 0.85, Math.sin(a) * 0.72, { mat: 'bronze', col: false }); }
  b.sphere(1.0, C.bronze, 0, 1.75, 0, { mat: 'bronze', sy: 0.82, seg: 18, seg2: 12 });
  b.cyl(0.66, 0.85, 0.3, C.bronze, 0, 2.5, 0, { mat: 'bronze', col: false, seg: 16 });
  b.add(new THREE.ConeGeometry(0.72, 0.6, 16), C.bronze, 'bronze', { y: 2.95, col: false });
  b.sphere(0.16, C.gold, 0, 3.3, 0, { mat: 'gold' });
  for (const s of [-1, 1]) b.add(new THREE.TorusGeometry(0.22, 0.06, 6, 12), C.bronze, 'bronze', { x: s * 1.0, y: 2.1, z: 0, ry: Math.PI / 2, col: false });
  // 炉门火光
  b.add(new THREE.CircleGeometry(0.26, 12), 0xff8a40, 'glow', { x: 0, y: 1.6, z: 0.86, rx: -0.2, col: false });
  b.collider(0, 0, 3.2, 0, 1.15, 1.15, 0, { walk: false });
  b.emitter('furnace', 0, 3.3, 0);
  b.pop();
}

// 小炉与药罐
export function stove(b, x, y, z) {
  b.cyl(0.32, 0.38, 0.6, C.brickDark, x, y + 0.3, z, { mat: 'stone', seg: 10 });
  b.cyl(0.24, 0.24, 0.03, 0xd06030, x, y + 0.6, z, { mat: 'glow', col: false, seg: 10 });
  b.cyl(0.22, 0.18, 0.3, 0x6b4a38, x, y + 0.78, z, { col: false, mat: 'glaze', seg: 12 });
  b.emitter('steam', x, y + 1.0, z);
}

// ---------------- 居所 ----------------
// 水井：井台、井栏、辘轳、木桶
export function well(b, x, y, z, ry = 0) {
  b.push(x, y, z, ry);
  b.slab(2.4, 0.15, 2.4, C.stoneDark, 0, 0, 0, { mat: 'stone' });
  b.cyl(0.62, 0.66, 0.7, C.stone, 0, 0.5, 0, { seg: 10, mat: 'stone' });
  b.cyl(0.48, 0.48, 0.02, 0x1d2526, 0, 0.84, 0, { seg: 10, col: false });
  for (const s of [-1, 1]) b.slab(0.12, 1.5, 0.12, C.woodDark, s * 0.75, 0.15, 0, { mat: 'wood', col: false });
  b.cyl(0.09, 0.09, 1.6, C.wood, 0, 1.45, 0, { rz: Math.PI / 2, col: false, mat: 'wood', seg: 8 });
  b.slab(0.04, 0.3, 0.04, C.woodDark, 0.86, 1.3, 0.12, { col: false });
  b.cyl(0.006, 0.006, 0.7, 0x8a7a5a, 0.1, 1.1, 0, { col: false, seg: 3 });
  b.cyl(0.17, 0.14, 0.26, C.wood, 0.95, 0.15 + 0.13, 0.55, { mat: 'wood', seg: 10 });
  b.add(new THREE.TorusGeometry(0.15, 0.015, 4, 10, Math.PI), C.woodDark, 'wood', { x: 0.95, y: 0.42, z: 0.55, col: false });
  b.pop();
}

// 晾衣架与晾晒的道袍
export function laundry(b, x, y, z, ry, len = 4, colors = [0xdcd8cc, 0x9fb1bd, 0xe6e1d4]) {
  b.push(x, y, z, ry);
  for (const s of [-1, 1]) {
    b.cyl(0.05, 0.06, 2.0, C.bambooDry, s * len / 2, 1.0, 0, { seg: 6, mat: 'wood' });
    b.slab(0.5, 0.06, 0.06, C.bambooDry, s * len / 2, 1.7, 0, { col: false, ry: Math.PI / 2, mat: 'wood' });
  }
  b.cyl(0.025, 0.025, len, C.bambooDry, 0, 1.92, 0, { rz: Math.PI / 2, col: false, seg: 6, mat: 'wood' });
  const n = colors.length;
  for (let i = 0; i < n; i++) {
    const cx = -len / 2 + (i + 0.5) * (len / n);
    b.box(len / n * 0.82, 1.05, 0.03, colors[i], cx, 1.38, 0.02, { mat: 'cloth', col: false });
    b.box(len / n * 0.82 + 0.5, 0.18, 0.035, colors[i], cx, 1.84, 0.02, { mat: 'cloth', col: false });
  }
  b.pop();
}

// 柴垛、劈柴墩与斧
export function firewood(b, x, y, z, ry, rand = Math.random) {
  b.push(x, y, z, ry);
  for (let l = 0; l < 4; l++) for (let i = 0; i < 6 - (l > 2 ? 1 : 0); i++) {
    b.cyl(0.09, 0.09, 1.1, rand() < 0.5 ? 0x7a6248 : 0x8a7054, -0.5 + i * 0.2 + (l % 2) * 0.1, 0.1 + l * 0.17, 0, { rx: Math.PI / 2, col: false, seg: 6, mat: 'wood' });
  }
  b.collider(0, 0, 0.75, 0, 0.7, 0.6);
  b.cyl(0.26, 0.3, 0.45, 0x6f5a44, 1.4, 0.22, 0.3, { seg: 10, mat: 'wood' });
  b.cyl(0.02, 0.025, 0.6, C.woodLight, 1.4, 0.65, 0.3, { rz: 0.5, col: false });
  b.slab(0.16, 0.12, 0.03, 0x9a9c98, 1.25, 0.86, 0.3, { col: false, mat: 'gold' });
  b.pop();
}

// 石桌石凳
// 第九轮：石桌石凳统一为 D03-04 样式（莲瓣腰身、青玉嵌带、开光鼓凳，见 furniture9.js），go 时桌面摆一方棋枰
export function stoneTable(b, x, y, z, go = false) {
  stoneSet9(b, x, y, z, 0.4);
  if (go) {
    b.push(x, y, z, 0.4);
    b.slab(0.56, 0.06, 0.56, 0xc9a86a, 0, 0.75, 0, { mat: 'wood', col: false });
    for (let i = 0; i < 26; i++) b.cyl(0.017, 0.017, 0.012, i % 2 ? 0xf2f0ea : 0x1d1d1d, (Math.round(Math.random() * 12) - 6) * 0.04, 0.816, (Math.round(Math.random() * 12) - 6) * 0.04, { col: false, seg: 8 });
    b.pop();
  }
}

export function flowerPot(b, x, y, z, color = 0x9a6e9a, s = 1) {
  b.cyl(0.24 * s, 0.18 * s, 0.34 * s, 0x7a5a48, x, y + 0.17 * s, z, { seg: 10, mat: 'glaze' });
  b.sphere(0.3 * s, C.leaf, x, y + 0.48 * s, z, { mat: 'leaf', sy: 0.8, seg: 7 });
  for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + s; b.sphere(0.07 * s, color, x + Math.cos(a) * 0.17 * s, y + 0.62 * s, z + Math.sin(a) * 0.17 * s, { seg: 5 }); }
  b.cylCollider(x, y, y + 0.6 * s, z, 0.25 * s);
}

export function broom(b, x, y, z, ry = 0) {
  b.push(x, y, z, ry);
  b.cyl(0.02, 0.02, 1.4, C.bambooDry, 0, 0.9, -0.1, { rx: 0.25, col: false, seg: 5 });
  b.add(new THREE.ConeGeometry(0.2, 0.5, 8), C.straw, 'thatch', { y: 0.2, z: 0.07, rx: Math.PI + 0.25, col: false });
  b.pop();
}

// 水缸
export function waterJar(b, x, y, z, s = 1) {
  b.cyl(0.5 * s, 0.38 * s, 0.75 * s, 0x5a4a3c, x, y + 0.375 * s, z, { seg: 14, mat: 'glaze' });
  b.cyl(0.46 * s, 0.46 * s, 0.02, 0x3e5e62, x, y + 0.7 * s, z, { col: false, seg: 12, mat: 'glaze' });
}

// 竹篱
export function fence(b, pts, y = 0, h = 0.9) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 0.16)), ry = Math.atan2(-(z1 - z0), x1 - x0);
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      b.cyl(0.025, 0.03, h + (k % 2) * 0.08, C.bambooDry, x0 + (x1 - x0) * u, y + (h + (k % 2) * 0.08) / 2, z0 + (z1 - z0) * u, { seg: 5, col: false, mat: 'wood' });
    }
    for (const yy of [0.3, 0.7]) b.box(L, 0.04, 0.04, C.bamboo, (x0 + x1) / 2, y + yy * h, (z0 + z1) / 2, { ry, col: false, mat: 'wood' });
    b.collider((x0 + x1) / 2, y, y + h, (z0 + z1) / 2, L / 2, 0.08, ry, { walk: false, cam: false });
  }
}

// ---------------- 灵田 ----------------
export function scarecrow(b, x, y, z, ry) {
  b.push(x, y, z, ry);
  b.cyl(0.04, 0.05, 1.9, C.wood, 0, 0.95, 0, { seg: 6, mat: 'wood' });
  b.cyl(0.03, 0.03, 1.5, C.wood, 0, 1.45, 0, { rz: Math.PI / 2, col: false, seg: 6, mat: 'wood' });
  b.cyl(0.22, 0.3, 0.8, C.straw, 0, 1.15, 0, { col: false, seg: 8, mat: 'thatch' });
  b.box(1.2, 0.35, 0.1, 0x8a8e7a, 0, 1.45, 0, { mat: 'cloth', col: false });
  b.sphere(0.17, C.straw, 0, 1.78, 0, { mat: 'thatch' });
  b.add(new THREE.ConeGeometry(0.42, 0.2, 12), C.strawDark, 'thatch', { y: 1.95, col: false });
  b.pop();
}

// 农具架：锄、耙、镰、扁担与水桶
export function toolRack(b, x, y, z, ry) {
  b.push(x, y, z, ry);
  for (const s of [-1, 1]) b.slab(0.1, 1.5, 0.1, C.woodDark, s * 0.9, 0, 0, { mat: 'wood' });
  b.slab(1.9, 0.08, 0.08, C.woodDark, 0, 1.3, 0, { col: false, mat: 'wood' });
  // 锄
  b.cyl(0.022, 0.022, 1.5, C.woodLight, -0.5, 0.8, 0.08, { rx: 0.12, col: false, seg: 5, mat: 'wood' });
  b.slab(0.18, 0.2, 0.03, 0x6e6e6a, -0.5, 0.05, 0.16, { col: false, mat: 'gold' });
  // 耙
  b.cyl(0.022, 0.022, 1.5, C.woodLight, 0, 0.8, 0.08, { rx: 0.1, col: false, seg: 5, mat: 'wood' });
  b.slab(0.4, 0.05, 0.05, C.wood, 0, 0.08, 0.15, { col: false, mat: 'wood' });
  for (let i = 0; i < 5; i++) b.slab(0.02, 0.12, 0.02, C.wood, -0.16 + i * 0.08, 0.0, 0.15, { col: false });
  // 镰挂在横杆上
  b.slab(0.03, 0.4, 0.03, C.woodLight, 0.5, 0.95, 0.06, { col: false, mat: 'wood' });
  b.add(new THREE.TorusGeometry(0.13, 0.015, 3, 10, Math.PI), 0x8a8c88, 'gold', { x: 0.5, y: 0.78, z: 0.08, col: false });
  b.collider(0, 0, 1.5, 0, 1.0, 0.25);
  b.pop();
}

export function bucket(b, x, y, z, s = 1) {
  b.cyl(0.2 * s, 0.16 * s, 0.32 * s, C.wood, x, y + 0.16 * s, z, { seg: 12, mat: 'wood' });
  b.cyl(0.18 * s, 0.18 * s, 0.01, 0x3e5e62, x, y + 0.28 * s, z, { seg: 10, col: false, mat: 'glaze' });
  b.add(new THREE.TorusGeometry(0.19 * s, 0.012, 3, 10, Math.PI), C.woodDark, 'wood', { x, y: y + 0.32 * s, z, col: false });
}

export function carryPole(b, x, y, z, ry) {
  b.push(x, y, z, ry);
  bucket(b, -0.7, 0, 0); bucket(b, 0.7, 0, 0);
  b.cyl(0.03, 0.03, 1.8, C.bambooDry, 0, 0.26, 0.32, { rz: Math.PI / 2, col: false, seg: 6, mat: 'wood' });
  b.pop();
}

// 茅草棚（农具棚）
export function thatchShed(b, x, y, z, ry) {
  b.push(x, y, z, ry);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.cyl(0.09, 0.1, 2.4, C.wood, sx * 1.6, 1.2, sz * 1.2, { seg: 7, mat: 'wood' });
  roofAssembly(b, 'gable', 4.2, 3.6, 1.1, 2.35, C.straw, 'thatch', { under: false, eaves: false });
  b.collider(0, 2.3, 3.4, 0, 2.1, 1.8);
  b.slab(3.0, 0.5, 0.8, C.wood, 0, 0, -0.85, { mat: 'wood' });
  for (let i = 0; i < 3; i++) basket(b, -0.9 + i * 0.9, 0.5, -0.85, 0.8, 0, [0x8e7a4a, 0xa89a64, 0x6e7a48][i]);
  b.slab(0.9, 0.6, 0.6, 0xa48a5a, 1.0, 0, 0.5, { mat: 'thatch' });       // 稻草捆
  b.pop();
}

// ---------------- 杂项 ----------------
export function signpost(b, x, y, z, ry, text) {
  b.push(x, y, z, ry);
  b.cyl(0.07, 0.08, 2.1, C.woodDark, 0, 1.05, 0, { seg: 7, mat: 'wood' });
  const tex = plaqueTexture(text, { bg: '#d8ccb0', fg: '#2c2a26', frame: '#5a4330', vertical: true, w: 420, h: 130 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.05, 0.05), [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ color: 0x5a4330 })).concat([new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })]));
  m.position.set(0, 1.45, 0.08);
  m.castShadow = true;
  b.addMesh(m);
  b.cylCollider(0, 0, 2.1, 0, 0.12);
  b.pop();
}

// 画架（观云台画痴）
export function easel(b, x, y, z, ry, draw) {
  b.push(x, y, z, ry);
  beam(b, -0.35, 0, 0.2, -0.1, 1.7, 0, 0.04, C.woodLight, 'wood');
  beam(b, 0.35, 0, 0.2, 0.1, 1.7, 0, 0.04, C.woodLight, 'wood');
  beam(b, 0, 0, -0.45, 0, 1.6, -0.02, 0.04, C.woodLight, 'wood');
  b.slab(0.9, 0.04, 0.08, C.woodLight, 0, 0.78, 0.12, { col: false, mat: 'wood' });
  const m = canvasBoard(0.85, 0.62, draw, { px: 360, back: 0xe9e3d3 });
  m.position.set(0, 1.12, 0.12);
  m.rotation.x = -0.12;
  m.scale.z = 0.4;
  b.addMesh(m);
  b.cylCollider(0, 0, 1.7, 0, 0.45);
  b.slab(0.4, 0.4, 0.3, C.woodRed, 0.7, 0, -0.2, { mat: 'wood' });                // 小几
  b.cyl(0.06, 0.06, 0.08, 0x2a2a28, 0.62, 0.44, -0.2, { col: false, seg: 8 });    // 墨碟
  b.cyl(0.008, 0.008, 0.22, C.woodDark, 0.78, 0.46, -0.18, { col: false, rz: 1.2, seg: 4 });
  b.pop();
}

export { hangLantern };
