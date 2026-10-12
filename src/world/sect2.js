// 宗门场景（续）：弟子居所、丹房、梯田灵田、听雨池、上院（配殿 / 藏经阁 / 观云台 / 天阶牌楼）、云顶问道殿、两条探索支路
import * as THREE from 'three';
import { Builder, C } from './arch/builder.js';
import { rail, stairs, rockery, pavilion, plaqueMesh, roofAssembly, hall, woodRail, burner, lion } from './arch/arch.js';
import { house, yardWall, yardGate, moonGateWall, tower, gatePailou, pagoda } from './arch/buildings.js';
import * as P from './arch/props.js';
import { SITES, POND, FIELD_PLOTS, PATHS, PADS, STAIRS, SWITCHBACK, corridorPlan } from './layout.js';
import { mulberry32 } from '../core/math.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { placeLion, placeCenser, addPalaceLantern, placeProp } from './models.js';
import { table9, teaSet, bench9, stoneSet9, sideCabinet9, blind9, dryRack9, workTable9, jarCabinet9, herbJar } from './arch/furniture9.js';
import { moonGate9 } from './arch/stone9.js';
import { herbBundle } from './interiorProps.js';
import { bridgeBetween, archBridge } from './arch/bridges.js';
import { scriptureHall, danHall, grandFurnace, spiritPagoda, terrace, frontStairs } from './arch/halls.js';
import { placeBuilding, addPlaque } from './buildings10.js';
import { grandTower, darkInterior } from './arch/tower11.js';
import { HALL } from './hallSpec.js';
import { ASSETS } from './assets.js';
import { jadePillar } from './arch/ornaments.js';
import { stairGallery, kitchenShed, bookRack } from './arch/west8.js';
import { danHall8, pharmacyWing, southGate8, furnaceTerrace, furnace8, herbBed, switchbackStairs } from './arch/alch8.js';
import { bronzeLamp } from './arch/plaza8.js';
import { medallionTexture } from './arch/gate8.js';
import { censerR } from './arch/ornaments.js';
import { SMALL_STEPS } from './layout.js';

const padY = (id) => PADS.find((p) => p.id === id).y;

// ---------------- 弟子居所（西翼：竹院 y17，北舍 y20）----------------
export function buildDorms(ctx) {
  const A = SITES.courtA, y = padY('dormA');
  // 竹院：院墙（东墙开门）
  const w = new Builder();
  const gz = A.gateZ, gw = 3.0;
  yardWall(w, A.x0, A.z0, A.x1, A.z0, { h: 2.6 });
  yardWall(w, A.x0, A.z1, A.x1, A.z1, { h: 2.6 });
  yardWall(w, A.x0, A.z0, A.x0, A.z1, { h: 2.6 });
  yardWall(w, A.x1, A.z0, A.x1, gz - gw / 2 - 0.55, { h: 2.6 });
  yardWall(w, A.x1, gz + gw / 2 + 0.55, A.x1, A.z1, { h: 2.6 });
  yardGate(w, A.x1, 0, gz, Math.PI / 2, { w: 2.4, h: 3.0, plaque: '竹院' });
  ctx.place(w, { y, id: 'courtA-wall', fade: true, name: '竹院院墙' });
  // 正房（西）、北厢、南厢。第十轮：正房改用素材模型（X：曲尺形两层楼，白粉墙、朱红门窗，缩到 0.74，面朝院心向东）；
  // 两厢仍为程序化单层厢房（低一等），东移 1.5 米让出正房前檐
  const XA = A.x0 + 6.4, wx = A.x1 - 10;
  const xm = placeBuilding(ctx, 'X', { x: XA, y, z: gz, ry: Math.PI / 2, s: 0.74, id: 'courtA-main', name: '竹院正房', foot: { kind: 'house' } });
  if (!xm) {
    const h1 = new Builder();
    house(h1, { w: 13, d: 7, h: 3.5, bays: 5, porch: 1.5, doors: [2], railing: true, roof: 'xieshan', chimney: [4.6, -1.5], windowsBack: true });
    ctx.place(h1, { x: A.x0 + 5.4, y, z: gz, ry: Math.PI / 2, id: 'courtA-main', fade: true, name: '竹院正房', foot: { w: 7, d: 13, kind: 'house' } });
  }
  const h2 = new Builder();
  house(h2, { w: 10, d: 6, h: 3.2, bays: 3, doors: [1], roof: 'gableWall' });
  ctx.place(h2, { x: wx, y, z: A.z0 + 4.2, ry: 0, id: 'courtA-n', fade: true, name: '竹院北厢', foot: { w: 10, d: 6, kind: 'house' } });
  const h3 = new Builder();
  house(h3, { w: 10, d: 6, h: 3.2, bays: 3, doors: [1], roof: 'gableWall' });
  ctx.place(h3, { x: wx, y, z: A.z1 - 4.2, ry: Math.PI, id: 'courtA-s', fade: true, name: '竹院南厢', foot: { w: 10, d: 6, kind: 'house' } });
  ctx.anchors.dormDoor = { x: wx, y, z: A.z1 - 8.1 };
  // 院内生活：水井、晾衣、石桌、柴垛、花钵、扫帚、水缸
  const d = new Builder(), ox = A.x1 + 34, oz = gz - 20;   // 以旧院落坐标布置（原院门 x=-34、z=20）
  P.well(d, ox - 38.6, y, oz + 24.8, 0.3);
  P.laundry(d, ox - 42.5, y, oz + 23.6, 0, 4.2, [0xdcd8cc, 0x9fb1bd, 0xe6e1d4]);
  stoneSet9(d, ox - 46.8, y, oz + 17.6, 0.3);
  P.firewood(d, ox - 39.2, y, oz + 11.6, 0, ctx.rand);
  P.flowerPot(d, ox - 48.8, y, oz + 15.8, 0xc9a0b0);
  P.flowerPot(d, ox - 48.8, y, oz + 24.2, 0xd8c2a0);
  P.broom(d, ox - 36.0, y, oz + 16.0, 0.6);
  P.waterJar(d, ox - 36.4, y, oz + 27.4);
  P.basket(d, ox - 43.8, y, oz + 26.4, 0.9, 0, 0xe6e1d4);
  // 竹院：院内四角与院墙外成丛的竹，正房前一对花钵、一块景石
  rockery(d, A.x0 + 10.6, y, A.z0 + 2.6, 0.7, ctx.rand, 5);
  // 正房前廊（廊深 1.5 米，廊面高 0.42）：北端一张茶桌、两把官帽椅（实物模型）、青花茶具；南端靠墙一条长凳；窗间竹帘半卷
  // 第十轮：正房换成曲尺楼后，茶座与长凳移到楼前院中（竹帘随原前廊撤去）
  if (xm) {
    const xf = XA + xm.half[1], xc = xf + 1.5;
    table9(d, xc, y, gz + 4.6, Math.PI / 2, { L: 1.3, D: 0.62, H: 0.74 });
    teaSet(d, xc, y + 0.74, gz + 4.5, 0.4);
    placeProp(ctx, 'chinese_armchair', xc, y, gz + 5.6, Math.PI, 0.76, { pad: 0.02 });
    placeProp(ctx, 'chinese_armchair', xc, y, gz + 3.6, 0, 0.76, { pad: 0.02 });
    bench9(d, xf + 1.1, y, gz - 4.6, Math.PI / 2, 1.8);
    placeProp(ctx, 'ceramic_vase_02', xf + 1.05, y + 0.45, gz - 5.2, 0, 1.0);
  } else {
    const px = A.x0 + 5.4, yp = y + 0.42, xc = px + 2.78;
    table9(d, xc, yp, gz + 4.3, Math.PI / 2, { L: 1.3, D: 0.62, H: 0.74 });
    teaSet(d, xc, yp + 0.74, gz + 4.2, 0.4);
    placeProp(ctx, 'chinese_armchair', xc, yp, gz + 5.3, Math.PI, 0.76, { pad: 0.02 });
    placeProp(ctx, 'chinese_armchair', xc, yp, gz + 3.3, 0, 0.76, { pad: 0.02 });
    bench9(d, px + 2.3, yp, gz - 4.0, Math.PI / 2, 1.8);
    placeProp(ctx, 'ceramic_vase_02', px + 2.25, yp + 0.45, gz - 4.6, 0, 1.0);
    for (const bz of [-5.2, -2.6, 2.6, 5.2]) blind9(d, px + 3.42, yp + 3.5 - 0.32, gz + bz, Math.PI / 2, 2.1, bz > 0 ? 0.75 : 1.05);
  }
  ctx.place(d, { name: 'courtA-props' });
  ctx.anchors.well = { x: ox - 38.6, y, z: oz + 23.4 };
  for (const [bx, bz, s] of [[A.x0 + 1.6, A.z0 + 1.6, 0.75], [A.x0 + 2.8, A.z0 + 1.4, 0.7], [A.x0 + 1.5, A.z1 - 1.6, 0.75], [A.x0 + 2.6, A.z1 - 1.3, 0.68],
    [A.x1 - 1.6, A.z0 + 1.5, 0.7], [A.x1 - 1.5, A.z1 - 1.6, 0.72], [A.x0 + 6, A.z1 + 1.1, 0.8], [A.x0 + 9, A.z1 + 1.0, 0.75], [A.x0 + 14, A.z1 + 1.2, 0.8], [A.x1 - 6, A.z1 + 1.0, 0.78],
    [A.x0 - 1.0, A.z0 + 6, 0.8], [A.x0 - 1.2, A.z0 + 12, 0.78], [A.x0 - 1.0, A.z0 + 18, 0.8]]) (ctx.extraVeg ||= []).push(['bamboo', bx, bz, s]);
  ctx.extraVeg.push(['sakura', A.x1 - 4.2, A.z0 + 10.8, 0.62, 1.2], ['goldTree', A.x1 + 2.6, A.z1 - 3.0, 0.7, 0.4]);

  // 北舍：长排寝舍 + 前院菜畦、竹篱、晾衣绳、水缸
  const yb = padY('dormB'), dz = 1;
  // 第十轮：北舍改用素材模型（X 左右镜像、缩到 0.84，与竹院正房同式而朝向、大小、左右各异），面朝南院
  // （楼后留出 3 米通道，接北面登膳堂台地的石阶）
  const xb = placeBuilding(ctx, 'X', { x: -56, y: yb, z: -18.3, ry: 0, s: 0.84, mirror: true, id: 'courtB-dorm', name: '北舍', foot: { kind: 'house' } });
  if (!xb) {
    const lh = new Builder();
    house(lh, { w: 22, d: 7, h: 3.4, bays: 7, porch: 1.7, doors: [1, 3, 5], railing: true, roof: 'gable', rcol: C.tile });
    ctx.place(lh, { x: -61, y: yb, z: -20.2 + dz, ry: 0, id: 'courtB-dorm', fade: true, name: '北舍', foot: { w: 22, d: 7, kind: 'house' } });
  }
  const e = new Builder();
  P.fence(e, [[-75.5, -15 + dz], [-75.5, -7 + dz], [-66, -7 + dz], [-66, -15 + dz]], yb, 0.85);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 9; k++) e.sphere(0.22 + ((r * 9 + k) % 3) * 0.04, r % 2 ? 0x6f8a4e : 0x86985a, -74.5 + k * 0.95, yb + 0.12, -13.6 + dz + r * 1.7, { mat: 'leaf', sy: 0.55, seg: 7, seg2: 5 });
  P.laundry(e, -54, yb, -11 + dz, 0.05, 5.6, [0xe6e1d4, 0xa9bac6, 0xdcd8cc, 0x8e9aa2]);
  P.waterJar(e, xb ? -45.0 : -49.8, yb, (xb ? -10.6 : -15.4) + dz, 1.1);
  P.bench(e, -61, yb, (xb ? -11.2 : -12.4) + dz, 0, 2.6, C.wood, 'wood');
  P.firewood(e, -76.6, yb, -20.5 + dz, Math.PI / 2, ctx.rand);
  P.broom(e, xb ? -44.8 : -50.8, yb, (xb ? -13.0 : -16.2) + dz, -0.4);
  P.bucket(e, xb ? -44.2 : -50.6, yb, (xb ? -11.8 : -14.2) + dz);
  ctx.place(e, { name: 'courtB-props' });
  ctx.footprints.push({ x: -70.75, z: -11 + dz, w: 9.5, d: 8, kind: 'yard' });
  (ctx.extraVeg ||= []).push(['sakura', -46.5, -6.5, 0.72, 2.0], ['bamboo', -77.0, -9.0, 0.7], ['bamboo', -77.2, -5.5, 0.66], ['bamboo', -76.8, -1.6, 0.72]);
  buildWestLinks(ctx);
}

// 西翼台地之间：石阶上的叠落廊（侧廊）、阶顶的歇脚亭（休息平台）、台壁脚下的景石（台地由石砌台壁与自然山石共同承托）
function buildWestLinks(ctx) {
  const g = new Builder();
  for (const id of ['dormAB', 'dormMid', 'midLib']) {
    const ss = SMALL_STEPS.find((s) => s.id === id);
    stairGallery(g, ss.to, ss.from, ss.w);
    // 廊下宫灯（中段）
    const [hx, hz, hy] = ss.from, [lx, lz, ly] = ss.to;
    addPalaceLantern(ctx, (hx + lx) / 2, (hy + ly) / 2 + 2.3, (hz + lz) / 2, 0.75);
  }
  ctx.place(g, { id: 'westGalleries', fade: true, name: '叠落廊' });
  // 歇脚亭：膳堂台地西南角（俯看竹院与北舍屋瓦）、藏经阁台地西南角外的平台
  for (const [x, yy, z, ent] of [[-73.2, padY('westMid'), -37.6, 1], [-72.0, padY('dormB'), 1.4, 1]]) {
    const pb = new Builder();
    pavilion(pb, { n: 4, r: 2.0, h: 3.0, base: 0.35, benches: true, entrance: ent, roofColor: C.tile, pillar: C.woodRed, beam: C.woodDark });
    ctx.place(pb, { x, y: yy, z, id: `restPav${Math.round(z)}`, fade: true, name: '歇脚亭', foot: { w: 4.4, d: 4.4, kind: 'small' } });
  }
  // 台壁脚下的山石（大小错落，避开石阶）
  const rocks = [[-71, 6.8, 1.6], [-66.5, 7.4, 1.1], [-52, 7.0, 1.4], [-43.5, 7.5, 1.2], [-39.5, 6.6, 1.6],
    [-74.5, -31.2, 1.7], [-69, -31.8, 1.2], [-55.5, -31.4, 1.5], [-47, -31.9, 1.1], [-41, -31.3, 1.6],
    [-72.5, -58.6, 1.6], [-66, -58.2, 1.2], [-58, -58.8, 1.4], [-43.5, -58.4, 1.5]];
  for (const [x, z, s] of rocks) ctx.extraVeg.push(['rock', x, z, s, (x * 7.3) % 6.28, ctx.ground(x, z) - 0.2]);
}

// ---------------- 膳堂（北舍与藏经阁之间的台地 y25）----------------
export function buildDining(ctx) {
  const S = SITES.dining, y = padY('westMid');
  // 第十轮：膳堂改用素材模型（H：三层楼，底层架空成敞厅、二层回廊、屋顶一对小亭，缩到 0.9）；底层敞厅不进人（整块阻挡）
  // 楼下砌一层青石台基（高 0.45 米，正面踏步），楼立在台上
  const DH = 0.45;
  const hm = ASSETS.models.buildings ? (() => {
    const pb = new Builder();
    pb.slab(18.6, DH - 0.1, 13.8, C.stoneGrey, 0, 0, -0.6, { mat: 'stone' });
    pb.slab(18.9, 0.1, 14.1, C.marbleShade, 0, DH - 0.1, -0.6, { mat: 'stoneSmooth', col: false });
    pb.collider(0, 0, DH, -0.6, 9.3, 6.9, 0, { walk: true });
    stairs(pb, 0, 0, 6.3 + 0.64, 4.2, DH, { run: 0.32, stepH: DH / 2, color: C.marbleShade, cheekW: 0.3 });
    ctx.place(pb, { x: S.x, y, z: S.z, name: '膳堂台基' });
    return placeBuilding(ctx, 'H', { x: S.x, y: y + DH, z: S.z, ry: 0, s: 0.9, id: 'dining', name: '膳堂', foot: { kind: 'house' }, solids: [[-8.8, 8.8, -6.6, 4.4]] });
  })() : null;
  if (hm) {
    ctx.anchors.diningDoor = hm.door ? { ...hm.door } : { x: S.x, y, z: S.z + hm.half[1] + 0.6 };
    addPlaque(hm, plaqueMesh('膳堂', 2.2, 0.85, { bg: '#2a2a28', fg: '#d9c48e', frame: '#5a4330' }), { lift: 3.0 });
  } else {
    const h = new Builder();
    hall(h, { w: 16, d: 8.4, bays: 5, dbays: 2, h: 4.2, base: 0.6, margin: 1.0, roof: 'xieshan', painted: false, dougong: false,
      pillar: C.woodDark, frame: C.woodDark, wallColor: C.plaster, front: 'doors', doorBays: [1, 2, 3], porch: 0, backWindows: true,
      plaque: '膳堂', plaqueStyle: { bg: '#2a2a28', fg: '#d9c48e', frame: '#5a4330' }, overhang: 1.5, fish: false, ridgeColor: C.ridge });
    h.slab(1.0, 8.2, 1.0, C.brick, -6.4, 0, -2.6, { mat: 'stone' });
    h.slab(1.25, 0.2, 1.25, C.brickDark, -6.4, 8.2, -2.6, { mat: 'stone', col: false });
    h.emitter('chimney', -6.4, 8.8, -2.6, { rate: 1.0 });
    ctx.place(h, { ...S, y, id: 'dining', fade: true, name: '膳堂', foot: { w: 18, d: 10.4, kind: 'house' } });
    ctx.anchors.diningDoor = { x: S.x, y, z: S.z + 7.2 };
    for (const s of [-1, 1]) addPalaceLantern(ctx, S.x + s * 3.2, y + 0.6 + 4.2 - 0.52, S.z + 4.3, 0.9);
  }
  // 院中：长桌条凳、水缸、菜筐、柴垛
  const d = new Builder();
  for (const dx of [-6, 4]) {
    d.slab(3.2, 0.08, 0.9, C.wood, S.x + dx, y + 0.74, S.z + 10.4, { mat: 'wood' });
    for (const [sx, sz] of [[-1.4, -0.3], [1.4, -0.3], [-1.4, 0.3], [1.4, 0.3]]) d.slab(0.08, 0.74, 0.08, C.woodDark, S.x + dx + sx, y, S.z + 10.4 + sz, { mat: 'wood', col: false });
    for (const sz of [-0.85, 0.85]) P.bench(d, S.x + dx, y, S.z + 10.4 + sz, 0, 2.8, C.wood, 'wood');
  }
  // 水缸一排（灶屋门外）、菜筐、柴垛；长案上的蒸笼、碗盏
  for (let k = 0; k < 3; k++) P.waterJar(d, S.x - (hm ? 13.6 : 10.6) + k * 1.15, y, S.z + (hm ? 6.1 : 5.3), 1.15);
  P.basket(d, S.x - 8.6, y, S.z + 8.4, 1.0, 0, 0x7a9a6a);
  P.basket(d, S.x - 7.6, y, S.z + 8.9, 0.9, 1, 0xb8a060);
  P.firewood(d, S.x - 13.4, y, S.z + 4.6, 0, ctx.rand);
  P.stoneLantern(d, S.x + (hm ? 10.4 : 9.2), y, S.z + (hm ? 7.4 : 6.2), 0.85);
  for (const dx of [-6, 4]) {
    for (let k = 0; k < 2; k++) d.cyl(0.3, 0.3, 0.16, C.bambooDry, S.x + dx - 0.9, y + 0.82 + k * 0.17, S.z + 10.4, { seg: 12, col: false });
    for (let k = 0; k < 4; k++) d.cyl(0.11, 0.07, 0.08, 0xe9e2d4, S.x + dx + 0.2 + k * 0.32, y + 0.82, S.z + 10.4 + (k % 2 ? 0.2 : -0.2), { seg: 8, mat: 'stoneSmooth', col: false });
  }
  // 膳堂台明上：两侧边柜（瓷瓶）、窗前竹帘；东侧檐角一张小茶座（茶桌、两只绣墩）（第十轮换楼后台明撤去，只留茶座）
  if (!hm) for (const sx of [-1, 1]) {
    sideCabinet9(d, S.x + sx * 6.4, y + 0.6, S.z + 4.75, 0);
    placeProp(ctx, sx < 0 ? 'ceramic_vase_01' : 'antique_ceramic_vase_01', S.x + sx * 6.4, y + 0.6 + 0.86, S.z + 4.75, 0, 0.9);
    blind9(d, S.x + sx * 6.4, y + 0.6 + 4.2 - 0.62, S.z + 4.33, 0, 2.4, 0.95);
  }
  table9(d, S.x + 9.4, y, S.z + 8.8, 0, { L: 1.2, D: 0.7, H: 0.74 });
  teaSet(d, S.x + 9.4, y + 0.74, S.z + 8.8, 1.1);
  placeProp(ctx, 'chinese_stool', S.x + 9.4, y, S.z + 9.75, Math.PI, 0.72, { pad: 0.02 });
  placeProp(ctx, 'chinese_stool', S.x + 9.4, y, S.z + 7.85, 0, 0.72, { pad: 0.02 });
  ctx.place(d, { name: 'dining-props' });
  // 灶屋：膳堂西山墙外，敞口朝院
  const k = new Builder();
  kitchenShed(k, 4.4, 6.2, ctx.rand);
  if (hm) k.emitter('chimney', 0.6, 4.6, -1.2, { rate: 1.0 });            // 灶间炊烟（原膳堂山墙烟囱随旧屋撤去，改由灶屋冒烟）
  ctx.place(k, { x: S.x - (hm ? 12.6 : 11.2), y, z: S.z - 0.4, id: 'kitchen', fade: true, name: '灶屋', foot: { w: 4.4, d: 6.2, kind: 'house' } });
  (ctx.extraVeg ||= []).push(['goldTree', S.x + 11.8, S.z + 2.0, 0.72, 0.8], ['sakura', S.x + 12.2, S.z + 8.6, 0.6, 2.1]);
}

// ---------------- 丹房（东翼台地 y18）----------------
export function buildAlchemy(ctx) {
  const S = SITES.alchemy, y = S.y;
  // 正殿 + 耳房（门内即丹房室内：正殿面阔 15、进深 8.4、柱高 4.3，与室内一致，门在南墙正中）
  // 第十轮：正殿改用素材模型（C：朱漆高台上的重檐殿，台前踏道、正面团龙圆窗，缩到 0.9，后移 1.5 米让出前院药圃），
  // 门口仍是进丹房的入口（互动点放在台上门前）
  const cm = placeBuilding(ctx, 'C', { x: S.x, y, z: S.z - 1.5, ry: 0, s: 0.9, id: 'alchemy', name: '丹殿', foot: { kind: 'major', accent: true } });
  if (cm) {
    ctx.anchors.alchemyDoor = cm.door ? { ...cm.door } : { x: S.x, y, z: S.z - 1.5 + cm.half[1] + 0.6 };
  } else {
    const b = new Builder();
    const di = danHall8(b, { plaque: '丹殿' });
    for (const s of [-1, 1]) censerR(b, s * 4.4, di.floor, di.front - 1.2, 1.0, 0);
    for (let i = 0; i < 9; i++) {
      const x = -6.4 + i * 1.6;
      if (Math.abs(x) < 1.8) continue;
      herbBundle(b, x, di.floor + 4.25, di.porchZ - 0.1, 0.35, ctx.rand);
    }
    ctx.place(b, { ...S, id: 'alchemy', fade: true, name: '丹殿', foot: { w: 2 * (di.earX + 3.6), d: 14.6, kind: 'major', accent: true } });
    ctx.footprints[ctx.footprints.length - 1].z = S.z + 1.0;
    ctx.anchors.alchemyDoor = { x: S.x, y: y + di.floor, z: S.z + 5.4 };
    for (const s of [-1, 1]) addPalaceLantern(ctx, S.x + s * 4.5, y + di.floor + 4.3 - 0.4, S.z + di.porchZ + 0.15, 1.0);
  }
  // 东西厢房（制药）：三开间敞厅朝院，正中穿堂（西通广场东回廊，东通丹炉东院）
  const CZ = -4.5;
  for (const [s, plaque] of [[-1, '百草'], [1, '制药']]) {
    const w = new Builder();
    pharmacyWing(w, { w: 10, plaque, rand: ctx.rand });
    ctx.place(w, { x: S.x + s * 12, y, z: CZ, ry: -s * Math.PI / 2, id: s < 0 ? 'pharmW' : 'pharmE', fade: true, name: s < 0 ? '西厢' : '东厢', foot: { w: 10, d: 6, kind: 'house' } });
    const fp = ctx.footprints[ctx.footprints.length - 1]; fp.ry = 0; fp.w = 6; fp.d = 10;
  }
  // 南门（门前一对石狮），门外折返石阶下到灵池
  {
    const g = new Builder();
    southGate8(g, '丹院');
    ctx.place(g, { x: S.x, y, z: -3.4, id: 'alchGate', fade: true, name: '丹院南门', foot: { w: 10.8, d: 4.6, kind: 'gate' } });
    const sb = new Builder();
    const sw = switchbackStairs(sb, SWITCHBACK);
    ctx.place(sb, { name: '丹殿折返阶' });
    ctx.switchback = sw;
    const d0 = new Builder();
    placeLion(ctx, d0, S.x - 3.7, y, -0.15, 0, 2.1, false, 0.6);
    placeLion(ctx, d0, S.x + 3.7, y, -0.15, 0, 2.1, true, 0.6);
    ctx.place(d0, { name: '丹院石狮' });
  }
  // 东院丹炉台（临东崖）与青铜大丹炉；火光只在炉口
  {
    const F = SITES.furnace, h = 1.2;
    const t = new Builder();
    furnaceTerrace(t, 9.0, 11.0, h);
    ctx.place(t, { x: F.x, y, z: F.z, name: '丹炉台', foot: { w: 9, d: 11, kind: 'small' } });
    const f = new Builder();
    const fi = furnace8(f, 0, 0, 0, 0);
    ctx.place(f, { x: F.x, y: y + h, z: F.z, id: 'furnace', fade: true, name: '大丹炉', foot: { w: 6, d: 6, kind: 'small' } });
    ctx.anchors.furnace = { x: F.x, y: y + h, z: F.z + 3.6 };
    const lamp = new Builder();
    for (const [lx, lz] of [[-3.6, -4.4], [3.6, -4.4], [-3.6, 4.4], [3.6, 4.4]]) bronzeLamp(lamp, F.x + lx, y + h, F.z + lz, 0.85);
    ctx.place(lamp, { name: '丹炉台铜灯' });
    // 炉口的暖光：一盏点光（只照亮炉口一带）
    const pl = new THREE.PointLight(0xff8a3a, 6, 7.5, 2);
    pl.position.set(F.x, y + h + 2.4, F.z + 2.6);
    ctx.scene.add(pl);
    ctx.furnaceLight = pl;
  }
  // 前院：药圃木畦、晒药架、竹筐、药臼、水缸；中轴团纹石；四角石灯
  const d = new Builder(), r = ctx.rand;
  for (const [x, z] of [[S.x - 6.4, -11.4], [S.x - 6.4, -9.0], [S.x + 6.4, -11.4], [S.x + 6.4, -9.0]]) herbBed(d, x, y, z, 0, 3.4, r);
  // 东院晒药场（东厢穿堂之外）：D07-02 晾晒架（挂药束、下层竹匾）、竹篮（实物模型）与药罐，沿院边成组
  dryRack9(d, S.x + 21.2, y, -9.6, Math.PI / 2, r, herbBundle);
  dryRack9(d, S.x + 21.2, y, -5.4, Math.PI / 2, r, herbBundle);
  dryRack9(d, S.x + 24.8, y, -7.5, Math.PI / 2, r, herbBundle);
  for (const [bx, bz, ry, sc] of [[23.2, -3.3, 0.3, 1.25], [24.0, -2.8, 1.2, 1.0], [23.6, -11.9, 0.5, 1.15]]) placeProp(ctx, 'wicker_basket_02', S.x + bx, y, bz, ry, sc);
  for (const [bx, bz, k] of [[24.6, -3.6, 0], [22.6, -12.4, 1], [23.0, -12.9, 2]]) herbJar(d, S.x + bx, y, bz, 0.42, k);
  // 前院：药圃边的竹筐、药臼（不挡两厢踏步与中轴）
  P.basket(d, S.x - 3.9, y, -11.0, 1, 0, 0x6f7a48);
  P.basket(d, S.x - 3.6, y, -11.9, 0.9, 1, 0x8a7a48);
  P.mortar(d, S.x + 5.6, y, -7.0);
  // 两厢廊前（院边）：操作台、药罐成组；中轴与两厢踏步留空
  workTable9(d, S.x + 8.6, y, -6.2, -Math.PI / 2, { L: 1.8, D: 0.8, H: 0.82 });
  for (const [bx, bz, k, h] of [[-8.9, -5.6, 0, 0.5], [-8.6, -6.3, 1, 0.42], [-9.2, -6.6, 2, 0.36], [8.9, -8.2, 1, 0.46]]) herbJar(d, S.x + bx, y, bz, h, k);
  P.waterJar(d, S.x - 8.9, y, -12.6, 1.1);
  P.waterJar(d, S.x + 8.9, y, -12.6, 1.1);
  for (const [x, z] of [[S.x - 8.2, -0.4], [S.x + 8.2, -0.4]]) P.stoneLantern(d, x, y, z, 0.95);
  P.stove(d, S.x + 25.0, y, -11.6);
  P.signpost(d, 37.4, y, -1.8, 0.4, '丹殿');
  ctx.place(d, { name: 'alchemy-props' });
  for (const [k, z] of [[0, -10.2], [1, -7.4]]) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1.15, 40), new THREE.MeshStandardMaterial({ map: medallionTexture(k), roughness: 0.78 }));
    m.rotation.x = -Math.PI / 2; m.position.set(S.x, y + 0.015, z); m.receiveShadow = true;
    ctx.scene.add(m);
  }
  (ctx.extraVeg ||= []).push(['sakura', S.x - 10.4, -14.6, 0.62, 1.1], ['goldTree', S.x + 10.2, -14.8, 0.66, 2.3], ['pine', 79.2, -29.0, 0.7, 0.4], ['shrub', 70.6, -11.6, 0.9, 0], ['shrub', 79.4, -11.8, 0.8, 1]);
  ctx.onAlchemyBrew = () => { for (const em of ctx.emitters) if (em.kind === 'furnace') em.rate = 2.4; };
}

// ---------------- 灵田：云顶问道殿西侧的三级梯田（自南向北逐级升高）----------------
export function buildField(ctx) {
  const T = ctx.terrain, b = new Builder();
  const earth = 0x6a5a44, grass = 0x6e7650;
  // 田埂（可行走）：每级梯田沿畦界的纵埂与南北两道横埂
  for (const id of ['field1', 'field2', 'field3']) {
    const p = PADS.find((q) => q.id === id), y = p.y;
    const plots = FIELD_PLOTS.filter((f) => f.rect[0] >= p.x0 && f.rect[1] <= p.x1 && f.rect[2] >= p.z0 && f.rect[3] <= p.z1);
    const xs = [p.x0 + 0.7, ...plots.slice(0, -1).map((f, i) => (f.rect[1] + plots[i + 1].rect[0]) / 2), p.x1 - 0.7];
    const zc = (p.z0 + p.z1) / 2, zl = p.z1 - p.z0;
    for (const x of xs) b.slab(1.4, 0.24, zl, earth, x, y - 0.02, zc, { mat: 'std' }), b.slab(1.2, 0.03, zl - 0.2, grass, x, y + 0.22, zc, { col: false });
    for (const z of [p.z0 + 0.7, p.z1 - 0.7]) b.slab(p.x1 - p.x0, 0.24, 1.4, earth, (p.x0 + p.x1) / 2, y - 0.02, z, { mat: 'std' }), b.slab(p.x1 - p.x0 - 0.2, 0.03, 1.2, grass, (p.x0 + p.x1) / 2, y + 0.22, z, { col: false });
  }
  // 引水：西岭山泉经竹笕引到第三级梯田西北角的石槽，逐级漫灌（石槽溢水处起一缕水汽）
  const y1 = padY('field1'), y2 = padY('field2'), y3 = padY('field3');
  const sx = -86.2, sz = -204.2;
  b.slab(1.6, 0.5, 0.9, C.stone, sx, y3, sz, { mat: 'stoneSmooth' });
  b.slab(1.3, 0.04, 0.6, C.water, sx, y3 + 0.42, sz, { mat: 'glaze', col: false });
  for (let i = 0; i < 4; i++) b.cyl(0.07, 0.07, 3.2, C.bambooDry, sx - 1.2 - i * 2.9, y3 + 1.1 + i * 0.35, sz - 0.4, { rz: Math.PI / 2 + 0.1, col: false, seg: 6, mat: 'wood' });
  for (let i = 0; i < 4; i++) b.cyl(0.03, 0.03, 1.2 + i * 0.35, C.bambooDry, sx - 2.6 - i * 2.9, y3 + 0.5 + i * 0.18, sz - 0.4, { col: false, seg: 4, mat: 'wood' });
  b.emitter('steam', sx, y3 + 0.5, sz, { rate: 0.4 });
  P.scarecrow(b, -61.8, y2, -186.4, 0.4);
  P.toolRack(b, -39.2, y1 + 0.22, -177.3, 0);
  P.carryPole(b, -47.5, y2 + 0.22, -181.7, Math.PI / 2);
  P.basket(b, -45.6, y1 + 0.22, -177.2, 1, 0, 0x7a9a6a);
  P.bucket(b, -40.2, y1 + 0.22, -166.7);
  P.signpost(b, -38.9, y1 + 0.22, -169.6, 0.6, '清露草');
  ctx.place(b, { name: 'field' });
  const sh = new Builder();
  P.thatchShed(sh, 0, 0, 0, 0);
  ctx.place(sh, { ...SITES.fieldShed, ry: -Math.PI / 2, id: 'fieldShed', fade: true, name: '农具棚', foot: { w: 4, d: 3.4, kind: 'small' } });

  // 水田：稻畦里的一层浅水，倒映天光
  const wMat = new THREE.MeshStandardMaterial({ color: 0x6f8a88, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.72, envMapIntensity: 0.9 });
  ctx.paddyMat = wMat;
  for (const pl of FIELD_PLOTS) {
    if (pl.crop !== 'rice') continue;
    const [x0, x1, za, zb] = pl.rect, py = T.padAt((x0 + x1) / 2, (za + zb) / 2)?.y ?? y1;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.2, zb - za - 0.2), wMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, py + 0.05, (za + zb) / 2);
    m.receiveShadow = true;
    ctx.scene.add(m);
  }

  // 作物（实例化）
  const rand = mulberry32(55), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s3 = new THREE.Vector3();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const crops = {
    qinglu: cropGeo('blade', 0x6e9a78, 0xcfe8d6, 0.42),
    rice: cropGeo('stalk', 0x7e8a4a, 0xc8b862, 0.85),
    veg: cropGeo('leafy', 0x5f7e44, 0x9ab872, 0.32),
    herb: cropGeo('flower', 0x5d7448, 0xdcd2e8, 0.5),
    fallow: cropGeo('stubble', 0x8e7a52, 0xb8a272, 0.18),
  };
  const lists = {};
  for (const pl of FIELD_PLOTS) {
    const [x0, x1, z0b, z1b] = pl.rect, py = T.padAt((x0 + x1) / 2, (z0b + z1b) / 2)?.y ?? y1;
    const gx = pl.crop === 'veg' ? 0.9 : 0.62, gz = pl.crop === 'rice' ? 0.42 : pl.crop === 'veg' ? 0.8 : 0.5;
    for (let x = x0 + 0.31; x < x1 - 0.1; x += gx) for (let z = z0b + 0.3; z < z1b - 0.2; z += gz) {
      if (pl.crop === 'fallow' && rand() < 0.5) continue;
      if (pl.crop === 'herb' && Math.hypot(x + 61.8, z + 186.4) < 1.2) continue;
      (lists[pl.crop] ||= []).push([x + (rand() - 0.5) * 0.08, z + (rand() - 0.5) * 0.1, 0.8 + rand() * 0.45, rand() * 6.28, py]);
    }
  }
  for (const [k, list] of Object.entries(lists)) {
    const im = new THREE.InstancedMesh(crops[k], mat, list.length);
    list.forEach(([x, z, s, r, py], i) => im.setMatrixAt(i, m4.compose(v.set(x, py - 0.02, z), q.setFromAxisAngle(up, r), s3.set(s, s * (0.85 + (i % 7) * 0.05), s))));
    im.castShadow = k === 'rice';
    im.receiveShadow = true;
    im.computeBoundingSphere();
    im.name = 'crops-' + k;
    im.userData.noSolid = true;                   // 田里的庄稼不进御剑碰撞（分层实心柱）
    ctx.scene.add(im);
  }
  // 可采集的清露草（较大、叶尖有露光），在第一级梯田最东一畦（紧挨云顶）
  const herbG = cropGeo('blade', 0x7fb08c, 0xe8fff0, 0.62, 11);
  const herbM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x2a5a44, emissiveIntensity: 0.35 });
  const dewM = new THREE.MeshBasicMaterial({ color: 0xe8fff6, transparent: true, opacity: 0.85 });
  const Q = FIELD_PLOTS.find((f) => f.crop === 'qinglu').rect;
  const spots = [[0.12, 0.25], [0.34, 0.72], [0.5, 0.3], [0.66, 0.78], [0.84, 0.36], [0.22, 0.52], [0.6, 0.52], [0.9, 0.7]]
    .map(([u, v]) => [Q[0] + (Q[1] - Q[0]) * u, Q[2] + (Q[3] - Q[2]) * v]);
  ctx.anchors.herbs = spots.map(([x, z], i) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(herbG, herbM);
    m.castShadow = true;
    g.add(m);
    // 四颗露珠合为一个网格
    const dews = [];
    for (let k = 0; k < 4; k++) {
      const a = k * 1.7 + i;
      dews.push(new THREE.SphereGeometry(0.035, 6, 4).translate(Math.cos(a) * 0.14, 0.45 + k * 0.05, Math.sin(a) * 0.14));
    }
    g.add(new THREE.Mesh(mergeGeometries(dews), dewM));
    g.position.set(x, y1 - 0.02, z);
    g.scale.setScalar(1.15);
    ctx.scene.add(g);
    return { id: 'herb' + i, x, y: y1, z, mesh: g };
  });
}

// 作物几何：blade 细长叶丛 / stalk 稻穗 / leafy 菜 / flower 药花 / stubble 稻茬
function cropGeo(kind, base, tip, h, n = 7) {
  const rand = mulberry32(kind.length * 31 + n), pos = [], col = [];
  const cb = new THREE.Color(base), ct = new THREE.Color(tip);
  const tri = (a, b, c, ca, cb2, cc) => { pos.push(...a, ...b, ...c); col.push(ca.r, ca.g, ca.b, cb2.r, cb2.g, cb2.b, cc.r, cc.g, cc.b); };
  if (kind === 'leafy') {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * 6.28, r = 0.12 + (i % 3) * 0.06, w = 0.12;
      const p0 = [0, 0.02, 0], p1 = [Math.cos(a - 0.4) * w, h * 0.5, Math.sin(a - 0.4) * w], p2 = [Math.cos(a) * (r + 0.08), h * (0.8 + (i % 2) * 0.2), Math.sin(a) * (r + 0.08)], p3 = [Math.cos(a + 0.4) * w, h * 0.5, Math.sin(a + 0.4) * w];
      tri(p0, p1, p2, cb, cb, ct); tri(p0, p2, p3, cb, ct, cb);
    }
  } else if (kind === 'stubble') {
    for (let i = 0; i < 8; i++) {
      const a = rand() * 6.28, r = rand() * 0.12, x = Math.cos(a) * r, z = Math.sin(a) * r;
      tri([x - 0.012, 0, z], [x + 0.012, 0, z], [x, h * (0.6 + rand() * 0.5), z], cb, cb, ct);
      tri([x, 0, z - 0.012], [x, 0, z + 0.012], [x, h * (0.6 + rand() * 0.5), z], cb, cb, ct);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI, w = kind === 'stalk' ? 0.018 : 0.035, hh = h * (0.7 + rand() * 0.35), lean = 0.08 + rand() * 0.18;
      const cx = Math.cos(a), cz = Math.sin(a), ox = (rand() - 0.5) * 0.12, oz = (rand() - 0.5) * 0.12;
      const tipP = [ox + cz * lean, hh, oz - cx * lean];
      tri([ox - cx * w, 0, oz - cz * w], [ox + cx * w, 0, oz + cz * w], tipP, cb, cb, ct);
      if (kind === 'stalk') {   // 稻穗下垂
        const t2 = [tipP[0] + cz * 0.12, hh - 0.18, tipP[2] - cx * 0.12];
        tri([tipP[0] - 0.02, tipP[1], tipP[2]], [tipP[0] + 0.02, tipP[1], tipP[2]], t2, ct, ct, new THREE.Color(0xe0c470));
      }
    }
    if (kind === 'flower') for (let i = 0; i < 5; i++) {
      const a = rand() * 6.28, r = 0.06 + rand() * 0.1, x = Math.cos(a) * r, z = Math.sin(a) * r, yy = h * (0.8 + rand() * 0.3), s = 0.05;
      const c = new THREE.Color(i % 2 ? 0xe6dcef : 0xf0ecdf);
      tri([x - s, yy, z], [x + s, yy, z], [x, yy + s * 0.6, z + s], c, c, c);
      tri([x - s, yy, z], [x, yy + s * 0.6, z - s], [x + s, yy, z], c, c, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, nrm.getX(i) * 0.3, 1, nrm.getZ(i) * 0.3);
  g.computeBoundingSphere();
  return g;
}

// ---------------- 听雨池（丹房台地东侧）----------------
export function buildPondArea(ctx) {
  const P0 = POND, y = P0.top, b = new Builder();
  // 亲水平台
  b.push(P0.x - P0.r - 0.6, 0, P0.z + 0.8, 0);
  for (const [sx, sz] of [[-1.2, -1.1], [1.6, -1.1], [-1.2, 1.1], [1.6, 1.1]]) b.cyl(0.08, 0.09, 1.3, C.woodDark, sx, y - 1.1, sz, { col: false, mat: 'wood', seg: 6 });
  for (let i = 0; i < 9; i++) b.slab(0.34, 0.08, 2.6, C.wood, -1.3 + i * 0.36, y + 0.06, 0, { mat: 'wood', jitter: 0.12 });
  b.collider(0.2, y - 0.3, y + 0.14, 0, 1.65, 1.3);
  woodRail(b, [[2.0, -1.25], [2.0, 1.25]], y + 0.14, { h: 0.8, color: C.woodDark });
  woodRail(b, [[-1.3, -1.25], [2.0, -1.25]], y + 0.14, { h: 0.8, color: C.woodDark });
  woodRail(b, [[-1.3, 1.25], [2.0, 1.25]], y + 0.14, { h: 0.8, color: C.woodDark });
  b.pop();
  // 池边湖石
  const rand = mulberry32(77);
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    if (a > 2.6 && a < 3.6) continue;
    const R = P0.r * (1 + 0.1 * Math.sin(3 * a + 1) + 0.06 * Math.sin(5 * a - 2)) + 0.5 + rand() * 0.6;
    const x = P0.x + Math.cos(a) * R, z = P0.z + Math.sin(a) * R, s = 0.35 + rand() * 0.55;
    b.add(new THREE.DodecahedronGeometry(1, 0), rand() < 0.5 ? 0x9b978c : 0x8a857a, 'stone', { x, y: ctx.ground(x, z) + s * 0.3, z, sx: s * 1.3, sy: s * 0.8, sz: s, ry: rand() * 3, col: false });
    if (s > 0.6) b.cylCollider(x, ctx.ground(x, z), ctx.ground(x, z) + s, z, s * 1.1);
  }
  rockery(b, P0.x + 5.8, y, P0.z - 5.8, 1.0, rand, 6);
  P.stoneLantern(b, P0.x - 4.2, y, P0.z - 7.0, 0.85, 0.3);
  P.bench(b, P0.x + 2, y, P0.z + 8.2, 0, 2.2);
  ctx.place(b, { name: 'pond' });
  ctx.footprints.push({ x: P0.x, z: P0.z, w: 0, d: 0, kind: 'water' });
}

// ---------------- 上院：东西配殿、香炉、天阶牌楼、藏经阁院、观云台、后山入口 ----------------
export function buildCourt3(ctx) {
  const y = padY('court3');
  // 院中香炉、石灯、石狮、长凳
  const c = new Builder();
  placeCenser(ctx, c, SITES.burner.x, y, SITES.burner.z, 1.9);
  for (const s of [-1, 1]) {
    P.stoneLantern(c, s * 10.5, y, -69.5, 1.1);
    P.stoneLantern(c, s * 11, y, -90.5, 1.1);
    placeLion(ctx, c, s * 5.0, y, -94.8, 0, 2.6, s > 0, 0.85);
    P.bench(c, s * 12.5, y, -70, 0, 2.6);
  }
  ctx.place(c, { name: 'court3' });
  // 东西配殿：西为传功殿，东为执事堂，均面向中轴
  for (const [S, id, name] of [[SITES.sideHallW, 'hallW', '传功殿'], [SITES.sideHallE, 'hallE', '执事堂']]) {
    // 第十轮：东西配殿改用素材模型（F：踏道上的二层殿、两侧挑廊，缩到 0.9，东殿左右镜像），面向中轴
    const fm = placeBuilding(ctx, 'F', { x: S.x, y, z: S.z, ry: S.ry, s: 0.9, mirror: id === 'hallE', id, name, foot: { kind: 'major' } });
    if (fm) { addPlaque(fm, plaqueMesh(name, 2.6, 0.92, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' }), { lift: 3.2 }); continue; }
    const h = new Builder();
    hall(h, { w: 15, d: 8.4, bays: 5, dbays: 2, h: 4.6, base: 0.9, margin: 1.1, roof: 'xieshan', painted: true, dougong: true, porch: 0, glaze: true, roofColor: C.tileDark,
      wallColor: C.red, pillar: C.vermilion, frame: C.vermilion, plaque: name, overhang: 1.7, fish: false, doorBays: [1, 2, 3], roofOpts: { gold: true, goldK: 0.7 },
      plaqueStyle: { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' } });
    ctx.place(h, { ...S, id, fade: true, name, foot: { w: 17.2, d: 10.6, kind: 'major' } });
  }
  // 天阶牌楼
  const g = new Builder();
  gatePailou(g, { front: '天阶', back: '问心' });
  ctx.place(g, { ...SITES.tianGate, id: 'tianGate', fade: true, name: '天阶牌楼', foot: { w: 15, d: 2, kind: 'gate' } });

  // 藏经阁院：院墙 + 月洞门
  const S = SITES.scripture, yl = S.y, [x0, x1, z0, z1] = S.court;
  const w = new Builder();
  yardWall(w, x0, z0, x1, z0, { h: 3.0, t: 0.5 });
  // 南墙正对膳堂台地的石阶开一座小院门
  const sg = -50, sgw = 2.4;
  yardWall(w, x0, z1, sg - sgw / 2 - 0.55, z1, { h: 3.0, t: 0.5 });
  yardWall(w, sg + sgw / 2 + 0.55, z1, x1, z1, { h: 3.0, t: 0.5 });
  moonGate9(w, sg, 0, z1, 0, { W: 3.6, H: 3.4, t: 0.5, Dm: 2.4 });                 // D02-05 月洞门（净宽 2.4 米）
  yardWall(w, x0, z0, x0, z1, { h: 3.0, t: 0.5 });
  yardWall(w, x1, z0, x1, S.gateZ - 2.4, { h: 3.0, t: 0.5 });
  yardWall(w, x1, S.gateZ + 2.4, x1, z1, { h: 3.0, t: 0.5 });
  moonGate9(w, x1, 0, S.gateZ, Math.PI / 2, { W: 4.8, H: 3.4, t: 0.5, Dm: 2.6 });
  ctx.place(w, { y: yl, id: 'libWall', fade: true, name: '藏经阁院墙' });
  // 第十轮：藏经阁改用素材模型（G：四层方阁，逐层平座、腰檐与隔扇窗，前后抱厦，缩到 0.95），立在新砌的汉白玉台基上
  // （台高 0.9 米，前后踏道，台沿栏杆）；素材缺失时仍用原先的三层方阁
  const LH = 0.9, LW = 19.6, LD = 24;
  const gm = ASSETS.models.buildings ? (() => {
    const pb = new Builder();
    terrace(pb, [-LW / 2, LW / 2, -LD / 2, LD / 2], 0, LH, { gaps: [[-3.0, 3.0]], backGaps: [[-2.6, 2.6]], medal: 6 });
    frontStairs(pb, 0, LD / 2, 0, LH, 5.6, { center: true });
    frontStairs(pb, 0, -LD / 2, 0, LH, 4.6, { ry: Math.PI });
    ctx.place(pb, { x: S.x, y: yl, z: S.z, id: 'libBase', fade: true, name: '藏经阁台基' });
    return placeBuilding(ctx, 'G', { x: S.x, y: yl + LH, z: S.z, ry: 0, s: 0.95, id: 'library', name: '藏经阁', foot: { kind: 'major' } });
  })() : null;
  if (gm) {
    ctx.anchors.libraryDoor = gm.door ? { ...gm.door } : { x: S.x, y: yl + LH, z: S.z + gm.half[1] + 0.6 };
    ctx.libraryTop = gm.top;
    addPlaque(gm, plaqueMesh('藏经阁', 2.8, 1.0, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' }), { lift: 3.3 });
  } else {
    const t = new Builder();
    const li = scriptureHall(t, { plaque: '藏经阁' });
    ctx.place(t, { x: S.x, y: yl, z: S.z, id: 'library', fade: true, name: '藏经阁', foot: { w: 18.6, d: 17.2, kind: 'major' } });
    ctx.anchors.libraryDoor = { x: S.x, y: yl, z: S.z + 9.6 };
    ctx.libraryTop = yl + li.top;
  }
  // 院中：石桌棋枰、湖石、石灯、长凳、花钵
  const g2 = new Builder();
  P.stoneTable(g2, S.x - 0.5, yl + 0.28, S.z + 18.5, true);
  rockery(g2, S.x + 12.6, yl, S.z - 12.8, 1.0, ctx.rand, 7);
  P.stoneLantern(g2, S.x + 6.8, yl, S.z + 13.8, 0.9);
  P.stoneLantern(g2, S.x - 6.8, yl, S.z + 13.8, 0.9);
  P.bench(g2, S.x - 13.4, yl, S.z + 12, Math.PI / 2, 2.2);
  P.flowerPot(g2, S.x + (gm ? 4.4 : 5.6), yl, S.z + (gm ? 13.4 : 11.0), 0x9a6e9a, 1.0);
  P.flowerPot(g2, S.x - (gm ? 4.4 : 5.6), yl, S.z + (gm ? 13.4 : 11.0), 0x9a6e9a, 1.0);
  // 读书前庭：白石铺的读书台（略高一级），两张书案、四只鼓凳；台边两架晒书架；景石一组
  g2.slab(9.6, 0.22, 6.4, C.marbleShade, S.x - 0.5, yl, S.z + 18.2, { mat: 'stoneSmooth' });
  g2.slab(9.8, 0.06, 6.6, C.marble, S.x - 0.5, yl + 0.22, S.z + 18.2, { mat: 'stoneSmooth', col: false });
  for (const dx of [-3.4, 2.4]) {
    g2.slab(1.7, 0.07, 0.7, C.woodRed, S.x + dx, yl + 0.98, S.z + 20.4, { mat: 'wood' });
    for (const [sx, sz] of [[-0.75, -0.28], [0.75, -0.28], [-0.75, 0.28], [0.75, 0.28]]) g2.slab(0.07, 0.7, 0.07, C.woodRed, S.x + dx + sx, yl + 0.28, S.z + 20.4 + sz, { mat: 'wood', col: false });
    g2.slab(0.34, 0.05, 0.24, 0xe6dcc0, S.x + dx - 0.3, yl + 1.05, S.z + 20.4, { col: false });
    g2.slab(0.16, 0.04, 0.22, C.black, S.x + dx + 0.4, yl + 1.05, S.z + 20.3, { mat: 'stoneSmooth', col: false });
    for (const s of [-1, 1]) g2.cyl(0.2, 0.22, 0.44, C.marbleWarm, S.x + dx + s * 0.55, yl + 0.28, S.z + 21.3, { seg: 10, mat: 'stoneSmooth', col: false });
  }
  bookRack(g2, S.x - 9.4, yl, S.z + 19.4, 0.15, ctx.rand);
  bookRack(g2, S.x - 9.6, yl, S.z + 14.4, -0.1, ctx.rand);
  rockery(g2, S.x - 12.6, yl, S.z + 4.5, 0.85, ctx.rand, 6);
  ctx.place(g2, { name: 'libGarden' });
  ctx.extraVeg.push(['goldTree', S.x - 13.2, S.z + 21.6, 0.85, 0.2], ['goldTree', S.x + 12.6, S.z + 21.0, 0.8, 2.4], ['bamboo', S.x - 14.8, S.z + 9.0, 0.75], ['bamboo', S.x - 15.0, S.z + 6.2, 0.7], ['bamboo', S.x + 15.2, S.z + 8.2, 0.72]);
  (ctx.extraVeg ||= []).push(['bamboo', -70, -101.5, 0.7], ['bamboo', -66.8, -102.2, 0.65], ['bamboo', -71, -67.5, 0.6], ['shrub', -42.6, -64.6, 0.8], ['shrub', -70.5, -72, 0.9], ['grass', -44.5, -68.6, 1.2]);

  // 观云台：题刻山石、石凳、画架（沈墨）
  const V = SITES.view, yv = padY('view');
  const v = new Builder();
  v.add(new THREE.DodecahedronGeometry(1, 1), 0x8f8a80, 'stone', { x: V.x + 7.6, y: yv + 0.9, z: V.z - 1.6, sx: 1.6, sy: 1.15, sz: 1.0, ry: 0.4, col: false });
  v.collider(V.x + 7.6, yv, yv + 2.0, V.z - 1.6, 1.3, 0.9, 0.4);
  const cut = plaqueMesh('观云', 1.2, 0.5, { bg: '#7d786e', fg: '#a63b2e', frame: '#7d786e', w: 380, h: 150 });
  cut.position.set(V.x + 7.1, yv + 1.05, V.z - 0.55);
  cut.rotation.y = 0.4;
  v.addMesh(cut);
  P.bench(v, V.x - 7.4, yv, V.z - 2.6, Math.PI / 2, 2.2);
  P.easel(v, V.x - 1.7, yv, V.z + 1.1, Math.PI, drawLandscape);
  P.stoneLantern(v, V.x - 9.8, yv, V.z + 2.6, 0.8);
  ctx.place(v, { name: 'viewpoint' });
  ctx.anchors.viewRock = { x: V.x + 3.6, y: yv, z: V.z + 0.8 };

  // 后山入口：木牌坊 + 指路牌
  const th = new Builder(), TH = SITES.trailhead;
  th.push(TH.x, y, TH.z, Math.PI / 2);
  for (const s of [-1, 1]) {
    th.slab(0.5, 0.35, 0.5, C.stoneDark, s * 1.7, 0, 0, { mat: 'stone' });
    th.cyl(0.13, 0.15, 3.6, C.woodDark, s * 1.7, 1.8, 0, { mat: 'wood', seg: 8 });
  }
  th.slab(4.2, 0.3, 0.3, C.woodDark, 0, 3.2, 0, { mat: 'wood', col: false });
  th.push(0, 3.5, 0, 0);
  roofAssembly(th, 'gable', 4.8, 1.4, 0.45, 0, C.tile, 'roof', {});
  th.pop();
  const pl = plaqueMesh('后山', 1.0, 0.4, { bg: '#2a2a28', fg: '#d9c48e', frame: '#5a4330', w: 320, h: 130 });
  pl.position.set(0, 2.85, 0.18);
  th.addMesh(pl);
  th.pop();
  P.signpost(th, TH.x + 2.6, ctx.ground(TH.x + 2.6, TH.z + 2.4), TH.z + 2.4, Math.PI / 2 - 0.3, '听松亭');
  ctx.place(th, { name: 'trailhead' });
}

function drawLandscape(g, w, h) {
  g.fillStyle = '#efe9da'; g.fillRect(0, 0, w, h);
  const ridge = (y0, amp, col, seed) => {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) g.lineTo(x, y0 - Math.abs(Math.sin(x * 0.02 + seed) * amp + Math.sin(x * 0.051 + seed * 2) * amp * 0.5));
    g.lineTo(w, h); g.closePath(); g.fill();
  };
  ridge(h * 0.45, h * 0.18, 'rgba(120,128,130,.5)', 1);
  ridge(h * 0.62, h * 0.14, 'rgba(70,76,78,.65)', 4);
  ridge(h * 0.8, h * 0.08, 'rgba(40,44,46,.8)', 7);
  g.fillStyle = 'rgba(166,59,46,.8)'; g.fillRect(w * 0.82, h * 0.1, w * 0.06, w * 0.06);
}

// ---------------- 云顶：问道殿、碑亭、铜鹤、香炉 ----------------
export function buildSummit(ctx) {
  const y = SITES.mainHall.y;
  // 第十一轮：问道殿重建为五层楼阁——首层占地扩大到原殿（素材模型 D）的约 10 倍，长宽各放大约 √10 倍、层高按真实尺度营造
  // （尺寸表与量测见 hallSpec.js）。两层汉白玉台基、九开间殿身、正面三间抱厦，每层腰檐与平座，顶层重檐歇山。
  // 门窗洞与室内（hallInterior.js）一一对应：外观的窗洞里是一圈暗色内壁，进殿后隐去，由室内场景接替
  const h = new Builder();
  const info = grandTower(h);
  const dark = darkInterior(info.dark);
  h.addMesh(dark);
  const [T1] = HALL.podium;
  const hg = ctx.place(h, { x: HALL.x, y: HALL.y, z: HALL.z, id: 'hall', fade: true, name: '问道殿', foot: { w: 2 * T1.x, d: T1.z1 - T1.z0, kind: 'major', accent: true } });
  dark.userData.mat.userData.fadeU = hg.userData.fade;
  for (const c of info.bodies) ctx.cw.addBox({ ...c, x: HALL.x + c.x, z: HALL.z + c.z, y0: HALL.y + c.y0, y1: HALL.y + c.y1, walk: false, cam: true, tag: 'hall#body' });
  ctx.footprints[ctx.footprints.length - 1].z = HALL.z + (T1.z0 + T1.z1) / 2;
  ctx.hallDark = dark;
  ctx.anchors.hallDoor = { x: HALL.x + info.door.x, y: HALL.y + info.door.y, z: HALL.z + info.door.z };
  ctx.hallTop = HALL.y + info.top;
  for (const [lx, ly, lz] of info.lanterns) addPalaceLantern(ctx, HALL.x + lx, HALL.y + ly, HALL.z + lz, 1.4);
  // 殿东北山岗上的镇灵塔（经云顶东侧石阶登临）
  const pg = new Builder(), PG = SITES.pagoda;
  const pinfo = spiritPagoda(pg, {});
  ctx.place(pg, { ...PG, y: PG.y, id: 'pagoda', fade: true, name: '镇灵塔', foot: { w: 18, d: 18, kind: 'major' } });
  ctx.pagodaTop = PG.y + pinfo.top;
  ctx.anchors.pagoda = { x: PG.x + Math.sin(PG.ry) * (pinfo.front - 1.2), y: PG.y + pinfo.base, z: PG.z + Math.cos(PG.ry) * (pinfo.front - 1.2) };
  // 殿前：香炉、石灯、宗旗
  const c = new Builder();
  placeCenser(ctx, c, SITES.summitBurner.x, y, SITES.summitBurner.z, 2.2);
  for (const s of [-1, 1]) {
    P.stoneLantern(c, s * 11.5, y, -169.5, 1.15);
    placeLion(ctx, c, s * 7.6, y, -174.6, 0, 2.9, s > 0, 0.95);
    jadePillar(ctx, c, s * 13.2, y, -173.2, 1.05, 0);
  }
  ctx.place(c, { name: 'summit-court' });
  ctx.anchors.summitView = { x: 3.2, y, z: -167.2 };
  for (const s of [-1, 1]) {
    const f = new Builder();
    P.flagpole(f, 0, 0, 0, 0, s < 0 ? '青岚' : '问道', 12);
    ctx.place(f, { x: s * 17.5, y, z: -168.5, ry: s < 0 ? 0 : Math.PI, name: 'flag' });
  }
  // （第七轮：殿前月台依参照图只留香炉、石狮、玉柱、石灯与宗旗，原东西碑亭撤去，让出通往灵田、镇灵塔的通道）
}

// ---------------- 西支路：竹林、溪涧、古碑 ----------------
export function buildBamboo(ctx) {
  const T = ctx.terrain, b = new Builder();
  // 跨谷石桥：北舍西端横跨西涧到竹林（桥面与北舍同高）；桥下深涧
  const WB = SITES.westBridge, br = new Builder();
  const bi = bridgeBetween(br, [WB.x0, WB.z], [WB.x1, WB.z], WB.y, (x, z) => T.heightAt(x, z), {
    w: 4.6, arches: [{ c: -100 - (WB.x0 + WB.x1) / 2, span: 17, rise: 3.4 }, { c: -86.4 - (WB.x0 + WB.x1) / 2, span: 4.6, rise: 1.6 }, { c: -112.6 - (WB.x0 + WB.x1) / 2, span: 4.2, rise: 1.5 }] });
  ctx.place(br, { name: 'westBridge', id: 'westBridge', foot: { w: 4.6, d: bi.L, kind: 'bridge' } });
  ctx.footprints[ctx.footprints.length - 1].ry = Math.PI / 2;
  ctx.footprints[ctx.footprints.length - 1].x = bi.cx; ctx.footprints[ctx.footprints.length - 1].z = bi.cz;
  ctx.crossing = { x: -100, z: WB.z, y: WB.y };
  // 溪岸石
  const rand = mulberry32(13);
  const line = T.stream.line;
  for (let i = 0; i < 80; i++) {
    const s = 60 + rand() * 190, at = line.at(s);
    if (at.z > 25 || at.z < -75) continue;
    const half = T.streamHalf(s), side = rand() < 0.5 ? -1 : 1, off = half + 0.3 + rand() * 1.4;
    const x = at.x - at.tz * off * side, z = at.z + at.tx * off * side;
    if (Math.hypot(x - ctx.crossing.x, z - ctx.crossing.z) < 4.5) continue;
    const sc = 0.3 + rand() * 0.7;
    b.add(new THREE.DodecahedronGeometry(1, 0), rand() < 0.5 ? 0x8f8b80 : 0x7e7a70, 'stone', { x, y: T.heightAt(x, z) + sc * 0.2, z, sx: sc * 1.3, sy: sc * 0.7, sz: sc, ry: rand() * 3, col: false });
  }
  // 大石（遮挡古碑所在的空地）
  b.add(new THREE.DodecahedronGeometry(1, 1), 0x8a867c, 'stone', { x: -104.6, y: T.heightAt(-104.6, -30.5) + 1.2, z: -30.5, sx: 3.2, sy: 2.6, sz: 2.4, ry: 0.6, col: false });
  b.collider(-104.6, T.heightAt(-104.6, -30.5) - 0.5, T.heightAt(-104.6, -30.5) + 3.6, -30.5, 2.6, 2.0, 0.6);
  // 跌水两侧叠石
  const F = SITES.fall;
  for (const [dx, dz, s] of [[-2.2, 0.4, 1.4], [2.1, -0.2, 1.3], [-1.6, -1.6, 1.1], [1.7, -1.8, 1.2], [-2.6, 2.2, 0.9], [2.8, 2.0, 0.8], [0.2, -2.6, 1.0]]) {
    const x = F.x + dx, z = F.z + dz, g = T.heightAt(x, z);
    b.add(new THREE.DodecahedronGeometry(1, 0), 0x87837a, 'stone', { x, y: g + s * 0.45, z, sx: s * 1.2, sy: s, sz: s, ry: dx + dz, col: false });
    b.cylCollider(x, g - 0.5, g + s * 1.3, z, s * 0.95);
  }
  b.emitter('mist', F.x, T.streamY(T.stream.line.nearest(F.x, F.z).s + 2.5) + 0.3, F.z + 2.2, { rate: 1 });
  // 峡谷源头飞瀑落处的水雾
  const GF = SITES.gorgeFall, gs = T.stream.line.nearest(GF.x, GF.z).s;
  b.emitter('mist', GF.x, T.streamY(gs + 6) + 0.6, GF.z + 3.2, { rate: 2.4 });
  b.emitter('mist', GF.x + 1.2, T.streamY(gs + 9) + 0.8, GF.z + 6.5, { rate: 1.2 });
  // 古碑：苔痕、藤蔓、略倾
  const t = SITES.tablet, ty = T.heightAt(t.x, t.z);
  b.push(t.x, ty, t.z, t.ry);
  b.slab(1.6, 0.35, 1.0, 0x6f6b62, 0, -0.1, 0, { mat: 'stone' });
  b.box(1.1, 2.3, 0.3, 0x76736a, 0, 1.35, 0, { mat: 'stoneSmooth', rz: 0.06, rx: -0.04, col: false });
  b.add(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 14, 1, false, -Math.PI / 2, Math.PI), 0x76736a, 'stoneSmooth', { x: 0.08, y: 2.5, z: 0, rx: Math.PI / 2, rz: 0.06, col: false });
  b.collider(0, -0.1, 2.8, 0, 0.8, 0.5);
  for (let i = 0; i < 6; i++) b.cyl(0.025, 0.02, 1.2 + i * 0.12, 0x4f6a3e, -0.5 + i * 0.2, 0.7 + (i % 3) * 0.2, 0.17, { col: false, rz: 0.3 - i * 0.12, mat: 'leaf', seg: 4 });
  b.sphere(0.35, 0x4c6640, -0.4, 2.2, 0.12, { mat: 'leaf', sy: 0.5, sx: 1.4 });
  b.pop();
  const plate = P.canvasBoard(0.9, 1.7, drawTabletText, { px: 260, back: 0x6f6b62 });
  plate.position.set(t.x + Math.sin(t.ry) * 0.17, ty + 1.4, t.z + Math.cos(t.ry) * 0.17);
  plate.rotation.y = t.ry;
  plate.scale.z = 0.3;
  ctx.scene.add(plate);
  ctx.place(b, { name: 'bamboo' });
  ctx.anchors.tablet = { x: t.x + Math.sin(t.ry) * 1.6, y: ty, z: t.z + Math.cos(t.ry) * 1.6 };
  (ctx.extraVeg ||= []).push(['pineOld', -117, -58.5, 1.05], ['shrub', -112.5, -57.8, 0.9], ['grass', -113.5, -52.4, 1.2], ['grass', -111.2, -55.8, 1.1], ['rock', -98.2, -63.0, 1.3], ['rock', -103.4, -62.4, 1.1]);
}

function drawTabletText(g, w, h) {
  g.fillStyle = '#6f6b62'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${60 + Math.random() * 50},${80 + Math.random() * 50},${50 + Math.random() * 30},${Math.random() * 0.25})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 9, 0, 6.28); g.fill(); }
  g.fillStyle = 'rgba(30,30,28,.55)';
  g.textAlign = 'center';
  g.font = `bold ${w * 0.16}px "STKaiti","KaiTi",serif`;
  const cols = ['岚起于谷', '泉出于石', '吾来此山', '白狐为邻'];
  cols.forEach((s, ci) => [...s].forEach((c, i) => { if ((ci + i) % 3 !== 1) g.fillText(c, w * (0.8 - ci * 0.2), h * 0.2 + i * w * 0.2); }));
}

// ---------------- 东支路：后山小径、听松亭、灵狐出没处 ----------------
export function buildBackhill(ctx) {
  const T = ctx.terrain, b = new Builder();
  // 陡段铺设块石台阶
  const p = PATHS.find((q) => q.id === 'backhill');
  for (let i = 0; i < p.pts.length - 1; i++) {
    const [ax, az, ay] = p.pts[i], [bx, bz, by] = p.pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az), grade = (by - ay) / L;
    if (grade < 0.16) continue;
    const n = Math.max(1, Math.round((by - ay) / 0.3)), ry = Math.atan2(bx - ax, bz - az);
    for (let k = 0; k < n; k++) {
      // 踏步首尾相接：第 k 级顶面与其后缘处的山路齐平，前缘高出不超过一级
      const u = (k + 0.5) / n, x = ax + (bx - ax) * u, z = az + (bz - az) * u, yy = ay + (by - ay) * (k + 1) / n;
      b.push(x, 0, z, ry);
      b.slab(1.9 + ((k * 7) % 3) * 0.15, 0.42, L / n + 0.08, (k % 2) ? 0x8f8b80 : 0x99958a, 0, yy - 0.4, 0, { mat: 'stone', walk: true });
      b.pop();
    }
  }
  // 听松亭（六角）
  const pv = SITES.pavilion;
  const pb = new Builder();
  pavilion(pb, { n: 6, r: 2.5, h: 3.0, base: 0.36, entrance: 1, roofColor: C.tile, pillar: C.woodRed, beam: C.woodDark });
  const plq = plaqueMesh('听松', 1.0, 0.38, { bg: '#2a2a28', fg: '#d9c48e', frame: '#5a4330', w: 320, h: 120 });
  plq.position.set(0, 0.36 + 2.6, 2.32);
  pb.addMesh(plq);
  ctx.place(pb, { x: pv.x, y: pv.y, z: pv.z, ry: 0, id: 'pavilion', fade: true, name: '听松亭', foot: { w: 5.4, d: 5.4, kind: 'small' } });   // 亭口朝南，正对山径
  ctx.anchors.pavilion = { x: pv.x, y: pv.y + 0.36, z: pv.z };
  // 灵狐出没处：巨石下的小洞、倒木、野花
  const d = SITES.den, dy = T.heightAt(d.x, d.z);
  b.add(new THREE.DodecahedronGeometry(1, 1), 0x8a867c, 'stone', { x: d.x + 0.6, y: dy + 1.0, z: d.z - 0.8, sx: 2.6, sy: 1.9, sz: 2.2, ry: 0.4, col: false });
  b.collider(d.x + 0.6, dy - 0.5, dy + 2.8, d.z - 0.8, 2.0, 1.6, 0.4);
  b.sphere(0.55, 0x1c1b19, d.x - 0.9, dy + 0.25, d.z + 0.5, { sy: 0.6, sx: 1.1, seg: 10 });
  b.cyl(0.28, 0.32, 4.2, 0x5e4c3c, d.x - 3.4, dy + 0.3, d.z + 2.6, { rz: Math.PI / 2, ry: 0.7, col: false, mat: 'wood', seg: 8 });
  b.cylCollider(d.x - 3.4, dy, dy + 0.6, d.z + 2.6, 0.5);
  ctx.place(b, { name: 'backhill' });
  ctx.anchors.den = { x: d.x - 1.6, y: dy, z: d.z + 1.8 };
  const gp = PATHS.find((q) => q.id === 'glade').pts, fs = gp[Math.floor(gp.length / 2) + 1];
  ctx.anchors.foxSign = { x: fs[0] - 1.0, y: T.heightAt(fs[0] - 1.0, fs[1] - 1.2), z: fs[1] - 1.2 };
  const fl = [];
  const rand = mulberry32(5);
  for (let i = 0; i < 40; i++) { const a = rand() * 6.28, r = 1.5 + rand() * 6.5; fl.push(['flower', d.x - 3 + Math.cos(a) * r, d.z + 4 + Math.sin(a) * r, 0.8 + rand() * 0.5]); }
  (ctx.extraVeg ||= []).push(...fl, ['shrubDry', ctx.anchors.foxSign.x + 0.2, ctx.anchors.foxSign.z - 0.8, 0.9], ['shrub', 99.5, -126.2, 1.0], ['shrub', 112, -126, 1.1], ['pine', 93, -158.5, 1.0], ['rock', 86.2, -155.2, 1.4], ['rock', 94.8, -148, 1.0]);
}

// ---------------- 天阶两侧台地：碑林、半山茶亭、钟亭、松风台（经登天廊侧门进入）----------------
export function buildTerraces(ctx) {
  const st = STAIRS.find((s) => s.id === 'cW4'), CP = corridorPlan(st);
  const segZ = (i) => [st.bottom[0] - (i + 1) * CP.bay, st.bottom[0] - i * CP.bay];
  // 台地朝廊一侧的石栏（侧门处留口）
  const edgeRail = (b, xEdge, pad, seg) => {
    const [ga, gb] = segZ(seg);
    rail(b, [[xEdge, pad.z1 - 0.2], [xEdge, gb - 0.25]], pad.y, { h: 0.82, color: C.marbleWarm, spacing: 1.7 });
    rail(b, [[xEdge, ga + 0.25], [xEdge, pad.z0 + 0.2]], pad.y, { h: 0.82, color: C.marbleWarm, spacing: 1.7 });
  };
  const pad = (id) => PADS.find((p) => p.id === id);
  // 碑林
  {
    const S = SITES.steleGarden, p = pad('tjW1'), b = new Builder();
    edgeRail(b, p.x1 - 0.25, p, 6);
    [[-4.6, 0.12, '功'], [0, 0, '德'], [4.6, -0.12, '碑']].forEach(([dz, ry, ch]) => P.stele(b, S.x - 2.6, p.y, S.z + dz, Math.PI / 2 + ry, (g, w, h) => drawMasterStele(g, w, h, ch)));
    P.bench(b, S.x + 3.2, p.y, S.z + 4.2, 0, 2.2);
    P.stoneLantern(b, S.x + 3.6, p.y, S.z - 5.6, 0.85);
    ctx.place(b, { name: 'stele-garden' });
    ctx.anchors.steles = { x: S.x + 0.6, y: p.y, z: S.z };
    (ctx.extraVeg ||= []).push(['cypress', S.x - 6.2, S.z - 6.4, 0.9], ['cypress', S.x - 6.2, S.z + 6.4, 0.85], ['shrub', S.x - 5.5, S.z, 0.9]);
  }
  // 半山茶亭
  {
    const S = SITES.teaPavilion, p = pad('tjE1'), b = new Builder();
    edgeRail(b, p.x0 + 0.25, p, 6);
    b.push(S.x + 1.5, p.y, S.z, 0);
    pavilion(b, { n: 4, r: 2.3, h: 3.1, base: 0.3, entrance: 1, roofColor: C.tile, pillar: C.vermilion, beam: C.paintBlue });
    P.stoneTable(b, 0, 0.3, 0);
    b.pop();
    ctx.place(b, { id: 'teaPav', fade: true, name: '半山茶亭', foot: { w: 6, d: 6, kind: 'small' } });
    ctx.anchors.teaPav = { x: S.x + 1.5, y: p.y + 0.3, z: S.z };
    (ctx.extraVeg ||= []).push(['maple', S.x + 5.6, S.z - 5.8, 0.85], ['osmanthus', S.x + 5.8, S.z + 5.4, 0.8]);
  }
  // 钟亭：青铜钟（车削轮廓）悬于亭中
  {
    const S = SITES.bellPavilion, p = pad('tjW2'), b = new Builder();
    edgeRail(b, p.x1 - 0.25, p, 12);
    b.push(S.x - 1.2, p.y, S.z, 0);
    pavilion(b, { n: 4, r: 2.5, h: 3.8, base: 0.45, entrance: 3, benches: false, roofColor: C.tileDark, glaze: true, pillar: C.vermilion, beam: C.paintBlue });
    const prof = [[0, 0], [0.62, 0], [0.66, 0.08], [0.58, 0.3], [0.5, 0.9], [0.48, 1.3], [0.36, 1.46], [0.16, 1.52], [0, 1.53]].map(([r, y]) => new THREE.Vector2(r, y));
    b.add(new THREE.LatheGeometry(prof, 20), C.bronze, 'bronze', { y: 1.5, col: false });
    b.cyl(0.05, 0.05, 1.0, C.woodDark, 0, 3.55, 0, { col: false, mat: 'wood' });
    b.slab(5.0, 0.22, 0.22, C.woodRed, 0, 4.0, 0, { col: false, mat: 'wood' });
    b.cyl(0.09, 0.09, 1.8, C.wood, 1.25, 2.5, 0, { col: false, mat: 'wood', rz: Math.PI / 2 });      // 撞木
    b.pop();
    ctx.place(b, { id: 'bellPav', fade: true, name: '钟亭', foot: { w: 6.5, d: 6.5, kind: 'small' } });
    ctx.anchors.bell = { x: S.x + 1.8, y: p.y + 0.45, z: S.z };
    (ctx.extraVeg ||= []).push(['pineOld', S.x - 5.4, S.z + 5.4, 1.0]);
  }
  // 松风台：斜出的古松、湖石、石凳
  {
    const S = SITES.pineRest, p = pad('tjE2'), b = new Builder();
    edgeRail(b, p.x0 + 0.25, p, 12);
    rail(b, [[p.x1 - 0.25, p.z1 - 0.2], [p.x1 - 0.25, p.z0 + 0.2]], p.y, { h: 0.82, color: C.marbleWarm, spacing: 1.7 });
    rockery(b, S.x + 2.6, p.y, S.z - 4.8, 0.9, ctx.rand, 6);
    P.bench(b, S.x + 1.2, p.y, S.z + 3.6, 0.3, 2.4);
    P.bench(b, S.x - 2.6, p.y, S.z + 5.4, -0.2, 2.2);
    ctx.place(b, { name: 'pine-rest' });
    ctx.anchors.pineRest = { x: S.x, y: p.y, z: S.z + 2.0 };
    (ctx.extraVeg ||= []).push(['pineOld', S.x + 4.4, S.z - 1.2, 1.3]);
  }
}

function drawMasterStele(g, w, h, ch) {
  g.fillStyle = '#6a6862'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${40 + Math.random() * 60},${40 + Math.random() * 60},40,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 2 + Math.random() * 5); }
  g.fillStyle = 'rgba(28,27,25,.85)'; g.textAlign = 'center';
  g.font = `bold ${w * 0.22}px "STKaiti","KaiTi",serif`;
  g.fillText(ch, w / 2, h * 0.16);
  g.font = `${w * 0.075}px "STKaiti","KaiTi",serif`;
  const cols = ['青岚第' + { 功: '三', 德: '五', 碑: '七' }[ch] + '代掌门', '守山门四十载', '开灵田三级', '弟子百余人', '立此以记'];
  cols.forEach((s, ci) => [...s].forEach((c, i) => g.fillText(c, w * (0.84 - ci * 0.17), h * 0.32 + i * w * 0.085)));
}
