// 问道殿室内（第十一轮）：五层楼阁的独立场景。几何按 hallSpec.js 搭建，放在殿在宗门里的真实位置（世界坐标与外观完全重合），
// 门窗洞与外观一一对应。窗外不是贴图：进殿后每帧先画一遍宗门（只画窗洞、门洞在屏幕上框住的那一块，见 portalRect），
// 再清深度、把室内画在上面——窗外的山、殿、云、鹤、龙与人都是宗门场景里的同一批对象，时间、天气、动态一致，视差自然正确。
// 结构：一层问道大殿（九开间、殿心中庭直通三层，悬一架浑天仪）；二层藏经阁、三层法器阁（围着中庭的回廊）；四层静修堂；
// 五层观云阁（四面开窗、八角藻井、宗门舆图案）。东西各一座叠放的双跑楼梯间，自一层直上五层。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Builder, C, makeMaterials, registerEnvMat } from './arch/builder.js';
import { dougong, woodRail, doorLeaves, plaqueMesh } from './arch/arch.js';
import { banner } from './arch/halls.js';
import { censerR, stoneLanternR } from './arch/ornaments.js';
import { columnBase } from './arch/stone9.js';
import { table9, teaSet, bookcase9, jarCabinet9, herbJar } from './arch/furniture9.js';
import { paintedBeam } from './arch/gate8.js';
import { CollisionWorld } from '../core/collision.js';
import { FOGU, injectFog } from './shaderlib.js';
import { ASSETS } from './assets.js';
import { skyState } from './time.js';
import { mulberry32, clamp } from '../core/math.js';
import { HALL, N_LEVELS, levelAt, ceilY, bayKinds, bayCenters, openings, openingCorners, stairGeom, slabHoles } from './hallSpec.js';
import { SIDE_RY, sideLX, sidePlane, COL_R, mainDoorLeaves } from './arch/tower11.js';

const BASE = './assets/converted/interior/';
const MODELS = ['chinese_cabinet', 'chinese_screen_panels', 'chinese_sofa', 'chinese_stool', 'chinese_tea_table', 'chinese_armchair',
  'ceramic_vase_04', 'antique_ceramic_vase_01', 'brass_pot_01', 'brass_vase_03', 'painted_wooden_shelves', 'potted_plant_04', 'potions'];
const LIGHTS = 6;                                     // 宫灯点光：固定 6 盏，分给离人最近的灯位（灯数不变，着色器不重编）
const CAISSON = 5.6;                                  // 顶层藻井方口半边
const TH = 0.36;                                      // 楼上梯段踏步板厚（踏步下另有斜梁底板）

// 互动点（本地坐标、所在层）；hallRoom.js 换算成世界坐标
export const HALL_SPOTS = {
  exit: { l: 0, x: 0, z: 19.8, r: 2.6 },
  altar: { l: 0, x: 0, z: -14.6, r: 3.4 },
  armillary: { l: 0, x: 0, z: -5.5, r: 5.4 },
  booksW: { l: 1, x: -12.75, z: 6.75, r: 3.4 }, booksE: { l: 1, x: 12.75, z: 6.75, r: 3.4 },
  relics: { l: 2, x: 0, z: 9.5, r: 3.0 },
  swords: { l: 2, x: 0, z: 14.6, r: 3.4 },
  meditate: { l: 3, x: 0, z: -2, r: 5.8 },
  map: { l: 4, x: 0, z: 0, r: 4.2 },
  view: { l: 4, x: 0, z: 13.6, r: 2.8 },
};

// 矩形减去若干矩形洞：返回覆盖剩余部分的矩形（按洞边切格、再贪心合并）。矩形为 [x0, x1, z0, z1]
export function rectMinus(r, holes) {
  const xs = new Set([r[0], r[1]]), zs = new Set([r[2], r[3]]);
  for (const h of holes) {
    for (const x of [h[0], h[1]]) if (x > r[0] && x < r[1]) xs.add(x);
    for (const z of [h[2], h[3]]) if (z > r[2] && z < r[3]) zs.add(z);
  }
  const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b), nx = X.length - 1, nz = Z.length - 1;
  const keep = [], used = [];
  for (let j = 0; j < nz; j++) {
    keep.push([]); used.push([]);
    for (let i = 0; i < nx; i++) {
      const cx = (X[i] + X[i + 1]) / 2, cz = (Z[j] + Z[j + 1]) / 2;
      keep[j].push(!holes.some((h) => cx > h[0] && cx < h[1] && cz > h[2] && cz < h[3])); used[j].push(false);
    }
  }
  const out = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (!keep[j][i] || used[j][i]) continue;
    let i2 = i;
    while (i2 + 1 < nx && keep[j][i2 + 1] && !used[j][i2 + 1]) i2++;
    let j2 = j;
    grow: while (j2 + 1 < nz) { for (let k = i; k <= i2; k++) if (!keep[j2 + 1][k] || used[j2 + 1][k]) break grow; j2++; }
    for (let jj = j; jj <= j2; jj++) for (let k = i; k <= i2; k++) used[jj][k] = true;
    out.push([X[i], X[i2 + 1], Z[j], Z[j2 + 1]]);
  }
  return out;
}
// 线段 [a, b] 减去若干区间：返回剩余的线段
function segMinus(a, b, cuts) {
  let segs = [[a, b]];
  for (const [c0, c1] of cuts) segs = segs.flatMap(([p, q]) => (c1 <= p || c0 >= q ? [[p, q]] : [[p, Math.max(p, c0)], [Math.min(q, c1), q]].filter(([u, v]) => v - u > 0.05)));
  return segs;
}
// 水平的凸多边形面片（[x, z] 点列，扇形三角化），法线朝 ny（-1 朝下）；uv 以米计
function flatGeo(polys, ny = -1) {
  const pos = [], nrm = [], uv = [];
  for (const pts of polys) for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[0];
    let p = pts[i], q = pts[i + 1];
    if (Math.sign((p[1] - a[1]) * (q[0] - a[0]) - (p[0] - a[0]) * (q[1] - a[1])) !== Math.sign(ny)) [p, q] = [q, p];
    for (const [x, z] of [a, p, q]) { pos.push(x, 0, z); nrm.push(0, ny, 0); uv.push(x, z); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
// 正多边形顶点（与 CylinderGeometry 转 π/n 后一致：边与坐标轴平行）
const ngon = (r, n = 8) => Array.from({ length: n }, (_, i) => { const a = Math.PI / n + (i * 2 * Math.PI) / n; return [r * Math.sin(a), r * Math.cos(a)]; });

// 金砖（深灰方砖，0.64 米一块，块块深浅略异，砖缝细）
let BRICK = null;
function brickTexture() {
  if (BRICK) return BRICK;
  const S = 512, n = 4, t = S / n, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), r = mulberry32(17);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = 96 + r() * 20;
    g.fillStyle = `rgb(${v},${v - 1},${v - 4})`; g.fillRect(i * t, j * t, t, t);
    for (let k = 0; k < 140; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.05})`; g.fillRect(i * t + r() * t, j * t + r() * t, 2 + r() * 10, 1 + r() * 3); }
  }
  g.strokeStyle = 'rgba(18,16,14,.9)'; g.lineWidth = 3;
  for (let k = 0; k <= n; k++) { g.beginPath(); g.moveTo(k * t, 0); g.lineTo(k * t, S); g.stroke(); g.beginPath(); g.moveTo(0, k * t); g.lineTo(S, k * t); g.stroke(); }
  BRICK = new THREE.CanvasTexture(cv);
  BRICK.wrapS = BRICK.wrapT = THREE.RepeatWrapping; BRICK.colorSpace = THREE.SRGBColorSpace; BRICK.anisotropy = 8;
  return BRICK;
}

// 一层大殿北墙正中的巨幅立轴：水墨远山 + 竖写「问道」
function scrollTexture() {
  const W = 640, H = 768, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), r = mulberry32(31);
  g.fillStyle = '#2e3d36'; g.fillRect(0, 0, W, H);                                         // 绫边（青绿）
  g.fillStyle = '#c9b48a'; g.fillRect(36, 70, W - 72, H - 150);                            // 隔水
  g.fillStyle = '#ece3cc'; g.fillRect(52, 92, W - 104, H - 196);                           // 画心
  const ridge = (y0, amp, a, seed) => {
    g.fillStyle = `rgba(40,46,44,${a})`; g.beginPath(); g.moveTo(52, H - 104);
    for (let x = 52; x <= W - 52; x += 6) g.lineTo(x, y0 - Math.abs(Math.sin(x * 0.019 + seed) * amp + Math.sin(x * 0.047 + seed * 2) * amp * 0.45));
    g.lineTo(W - 52, H - 104); g.closePath(); g.fill();
  };
  ridge(H * 0.56, 70, 0.16, 1); ridge(H * 0.64, 60, 0.28, 3); ridge(H * 0.74, 40, 0.48, 5); ridge(H * 0.81, 22, 0.68, 8);
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(30,34,32,${0.25 + r() * 0.3})`; g.beginPath(); g.ellipse(70 + r() * (W - 140), H * 0.76 + r() * 44, 3 + r() * 5, 8 + r() * 12, 0, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(236,227,204,.75)'; g.fillRect(52, H * 0.66, W - 104, 20);
  g.fillStyle = '#1e1c1a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 150px "STXingkai","STKaiti","KaiTi","Kaiti SC",serif';
  g.fillText('问', W / 2, 205); g.fillText('道', W / 2, 365);
  g.font = '28px "STKaiti","KaiTi",serif'; g.fillText('云岫子', W - 128, 130); g.fillText('书', W - 128, 166);
  g.fillStyle = '#a3342a'; g.fillRect(W - 150, 188, 44, 44);
  g.fillStyle = '#ece3cc'; g.font = 'bold 22px "STKaiti",serif'; g.fillText('青岚', W - 128, 210);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

// 太极八卦石台面
function baguaTexture() {
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), c = S / 2;
  g.fillStyle = '#b9b3a6'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#6e6658'; g.lineWidth = 6; g.beginPath(); g.arc(c, c, 240, 0, 7); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.arc(c, c, 200, 0, 7); g.stroke();
  const tri = ['111', '110', '101', '100', '011', '010', '001', '000'];
  g.fillStyle = '#4c463d';
  tri.forEach((t, k) => {
    g.save(); g.translate(c, c); g.rotate((k / 8) * Math.PI * 2);
    [...t].forEach((bit, i) => {
      const y = -222 + i * 14;
      if (bit === '1') g.fillRect(-34, y, 68, 9); else { g.fillRect(-34, y, 29, 9); g.fillRect(5, y, 29, 9); }
    });
    g.restore();
  });
  const R = 120;
  g.fillStyle = '#e8e2d4'; g.beginPath(); g.arc(c, c, R, 0, 7); g.fill();
  g.fillStyle = '#2b2925'; g.beginPath(); g.arc(c, c, R, -Math.PI / 2, Math.PI / 2); g.arc(c, c + R / 2, R / 2, Math.PI / 2, -Math.PI / 2, true); g.arc(c, c - R / 2, R / 2, Math.PI / 2, -Math.PI / 2); g.fill();
  g.fillStyle = '#e8e2d4'; g.beginPath(); g.arc(c, c + R / 2, R / 7, 0, 7); g.fill();
  g.fillStyle = '#2b2925'; g.beginPath(); g.arc(c, c - R / 2, R / 7, 0, 7); g.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

export class HallInterior {
  // only：只开放这几处窗（{ l, side, bay }），其余开启的窗按糊纸窗搭建——分步验证窗景用（?hallStage=1）
  constructor(renderer, { quality = 'mid', sky = null, mapCanvas = null, models = null, only = null } = {}) {
    this.renderer = renderer;
    this.quality = quality;
    this.sky = sky;
    this.mapCanvas = mapCanvas;
    this.only = only;
    this.ready = false;
    this.cw = new CollisionWorld(8);
    this.models = models || {};
    this.exposureK = 1.4;           // 室内一遍的曝光倍数（人眼进屋后的适应；窗外仍按宗门的曝光）
    const L0 = HALL.levels[0];
    this.bounds = { x0: HALL.x - L0.w / 2 - 6, x1: HALL.x + L0.w / 2 + 6, z0: HALL.z - L0.d / 2 - 6, z1: HALL.z + L0.d / 2 + 6 };
    this.floor = -1;
    // 看得到宗门的洞口：开启的窗、正门
    this.openings = [];
    for (let l = 0; l < N_LEVELS; l++) for (const o of openings(l)) {
      if (o.kind !== 'main' && !(o.kind === 'open' && this.isOpen(l, o.side, o.bay))) continue;
      this.openings.push({ ...o, pts: openingCorners(o).map((p) => new THREE.Vector3(p.x, p.y, p.z)) });
    }
    this._c = [0, 1, 2, 3].map(() => new THREE.Vector4());
    this._m = new THREE.Matrix4();
  }
  isOpen(l, side, bay) { return !this.only || this.only.some((w) => w.l === l && w.side === side && w.bay === bay); }

  preload(gentle = false) { return (this.loadJob ||= this.load(gentle)); }
  async load(gentle = false) {
    const loader = new GLTFLoader();
    const one = (m) => (this.models[m] ? null : ASSETS.models[m] ? ((this.models[m] = ASSETS.models[m].scene), null)
      : loader.loadAsync(BASE + m + '.glb').then((g) => { this.models[m] ||= g.scene; }).catch((e) => console.info('问道殿陈设未能载入：', m, e.message)));
    if (gentle) for (const m of MODELS) { if (this.hurry) break; await one(m); await new Promise((r) => setTimeout(r, 80)); }
    await Promise.all(MODELS.map(one));
  }
  async ensure() {
    if (this.ready) return this;
    this.hurry = true;
    this.job ||= this.preload().then(() => this.load()).then(async () => {
      const t0 = performance.now();
      this.build();
      this.buildMs = Math.round(performance.now() - t0);
      const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 4000);
      cam.position.set(HALL.x, HALL.y + 1.6, HALL.z + 18); cam.lookAt(HALL.x, HALL.y + 3, HALL.z);
      const vis = this.groups.map((g) => g.visible);
      for (const g of this.groups) g.visible = true;                 // 各层都编译一遍
      try { await this.renderer.compileAsync?.(this.scene, cam); } catch (e) { /* 第一帧再编译 */ }
      this.groups.forEach((g, i) => { g.visible = vis[i]; });
      this.ready = true;
    });
    try { await this.job; } catch (e) { this.job = null; throw e; }
    return this;
  }

  // ---------- 搭建 ----------
  build() {
    const scene = this.scene = new THREE.Scene();
    scene.background = null;                         // 先画的宗门（窗外）留着，室内画在上面
    scene.fog = this.sky?.scene.fog || null;
    const root = this.root = new THREE.Group();
    root.position.set(HALL.x, HALL.y, HALL.z);
    scene.add(root);
    this.mats = makeMaterials(null);                 // 室内自用一套建筑材质（与宗门分开，见 Builder.build 的 mats）
    if (this.sky) for (const k of ['glaze', 'gold', 'bronze']) this.mats[k].envMap = this.sky.envMap;
    this.floorMat = new THREE.MeshStandardMaterial({ map: brickTexture(), color: 0xd8d2c6, roughness: 0.42, metalness: 0 });
    this.groups = [];
    this.lampSpots = [];
    this.tris = 0;
    const rand = mulberry32(1127);
    for (let l = 0; l < N_LEVELS; l++) {
      const g = new THREE.Group();
      g.name = 'hall-level-' + l;
      root.add(g);
      this.groups.push(g);
      const b = new Builder();
      this.buildLevel(b, l);
      if (l < N_LEVELS - 1) this.buildStairs(b, l);
      this.buildDetails(b, l, g, rand);
      g.add(b.build({ shadows: true, name: 'hall-interior-' + l, mats: this.mats }));
      this.cw.addLocal(b.cols, HALL.x, HALL.y, HALL.z, 0);
      g.add(this.floorMesh(l));
    }
    this.buildArmillary();
    this.buildLights();
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.receiveShadow = true;
      const gm = o.geometry;
      this.tris += (gm.index ? gm.index.count : gm.drawRange.count !== Infinity ? gm.drawRange.count : gm.attributes.position.count) / 3;
    });
    this.tris = Math.round(this.tris);
    this.setFloor(0);
  }

  // 楼面金砖（每层一块，按楼板开洞挖空）
  floorMesh(l) {
    const L = HALL.levels[l], wT = l ? 0.45 : HALL.wallT, ew = L.w / 2 - wT / 2, ed = L.d / 2 - wT / 2;
    const pos = [], uv = [], nrm = [], idx = [];
    for (const [x0, x1, z0, z1] of rectMinus([-ew, ew, -ed, ed], slabHoles(l))) {
      const k = pos.length / 3;
      for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) { pos.push(x, L.y + 0.012, z); uv.push(x / 2.56, z / 2.56); nrm.push(0, 1, 0); }
      idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, this.floorMat);
    m.receiveShadow = true;
    m.name = 'hall-floor-' + l;
    return m;
  }

  // 一层（第 l 层）的楼板、四面墙（与外观同位的门窗洞）、柱网、天花
  buildLevel(b, l) {
    const L = HALL.levels[l], T = HALL.slabT, wT = l ? 0.45 : HALL.wallT, top = ceilY(l), hW = top - L.y;
    const r = COL_R[l], ops = openings(l), holes = slabHoles(l), A = HALL.atrium, S = HALL.stairs;
    // 楼板（二层起）：按开洞拆成几块，顶面可走；开洞一圈朱红封边板
    if (l > 0) {
      for (const [x0, x1, z0, z1] of rectMinus([-L.w / 2 - 0.3, L.w / 2 + 0.3, -L.d / 2 - 0.3, L.d / 2 + 0.3], holes)) {
        b.slab(x1 - x0, T, z1 - z0, C.woodDark, (x0 + x1) / 2, L.y - T, (z0 + z1) / 2, { mat: 'wood' });
      }
      for (const [x0, x1, z0, z1] of holes) {
        for (const [cx, cz, w, d] of [[(x0 + x1) / 2, z0, x1 - x0, 0.06], [(x0 + x1) / 2, z1, x1 - x0, 0.06], [x0, (z0 + z1) / 2, 0.06, z1 - z0], [x1, (z0 + z1) / 2, 0.06, z1 - z0]]) {
          b.box(w, T, d, C.woodRed, cx, L.y - T / 2, cz, { col: false, mat: 'wood' });
        }
      }
    }
    // 四面墙（室内一侧）：下为木护墙板，上为粉墙；门窗洞位置、尺寸与外观完全一致
    for (const side of ['S', 'N', 'E', 'W']) {
      const [px, pz] = sidePlane(L, side), cs = bayCenters(l, side), kinds = bayKinds(l, side);
      const len = side === 'S' || side === 'N' ? L.w : L.d;
      b.push(px, L.y, pz, SIDE_RY[side]);
      kinds.forEach((kind, i) => {
        const o = ops.find((q) => q.side === side && q.bay === i);
        const k = kind === 'open' && !this.isOpen(l, side, i) ? 'paper' : kind;
        this.bayIn(b, k, sideLX(side, cs[i].u), cs[i].bw, hW, r, o, L, wT);
      });
      paintedBeam(b, -len / 2, len / 2, hW - 0.62, -wT / 2 - 0.2, 0.55, 0.4, { front: false, back: true });   // 墙顶额枋（彩画朝室内）
      b.pop();
    }
    // 柱网：檐柱（与外观同轴线，一半埋在墙里）与室内金柱（中庭、楼梯间、殿心不立柱）
    const xs = Array.from({ length: L.nb + 1 }, (_, i) => -L.w / 2 + (i * L.w) / L.nb), zs = Array.from({ length: L.nd + 1 }, (_, j) => -L.d / 2 + (j * L.d) / L.nd);
    const core = stairGeom(0).box;
    const blocked = (x, z) => (Math.abs(x) > S.x0 - 1.2 && Math.abs(x) < S.x1 + 1.2 && z > core.z0 - 1.2 && z < S.zs + 1.4) ||
      (Math.abs(x) < A.x + 0.9 && z > A.z0 - 0.9 && z < A.z1 + 0.9) || (l === 0 && Math.abs(x) < 6 && z > HALL.levels[0].d / 2 - 9) ||
      (l === N_LEVELS - 1 && Math.abs(x) < 8.5 && Math.abs(z) < 8.5);
    for (let i = 0; i <= L.nb; i++) for (let j = 0; j <= L.nd; j++) {
      const x = xs[i], z = zs[j], edge = i === 0 || j === 0 || i === L.nb || j === L.nd;
      if (!edge && blocked(x, z)) continue;
      const rr = edge ? r : r * 0.92;
      columnBase(b, x, L.y, z, rr, { bronze: l === 0 && !edge });
      b.cyl(rr * 0.92, rr, hW, C.vermilion, x, L.y + hW / 2, z, { seg: 16, mat: 'wood' });
    }
    // 天花：按柱网分格，每格一块彩画天花（整数个井口），避开上一层楼板的开洞；沿柱网的天花梁；顶层正中为八角藻井
    const ceilHoles = l < N_LEVELS - 1 ? slabHoles(l + 1) : [[-CAISSON, CAISSON, -CAISSON, CAISSON]];
    const ew = L.w / 2 - wT / 2, ed = L.d / 2 - wT / 2;
    for (let i = 0; i < L.nb; i++) for (let j = 0; j < L.nd; j++) {
      const cell = [Math.max(-ew, xs[i]), Math.min(ew, xs[i + 1]), Math.max(-ed, zs[j]), Math.min(ed, zs[j + 1])];
      for (const [x0, x1, z0, z1] of rectMinus(cell, ceilHoles)) {
        const w = x1 - x0, d = z1 - z0;
        if (w < 0.05 || d < 0.05) continue;
        b.panel(w, d, 0xffffff, (x0 + x1) / 2, top - 0.02, (z0 + z1) / 2, { mat: 'coffer', rx: Math.PI / 2, uvScale: [Math.max(1, Math.round(w / 2.2)) * 2.2, Math.max(1, Math.round(d / 2.2)) * 2.2] });
      }
    }
    for (const x of xs.slice(1, -1)) for (const [a, c] of segMinus(-ed, ed, ceilHoles.filter((h) => x > h[0] - 0.3 && x < h[1] + 0.3).map((h) => [h[2], h[3]]))) {
      b.box(0.42, 0.55, c - a, C.woodRed, x, top - 0.3, (a + c) / 2, { col: false, mat: 'wood' });
    }
    for (const z of zs.slice(1, -1)) for (const [a, c] of segMinus(-ew, ew, ceilHoles.filter((h) => z > h[2] - 0.3 && z < h[3] + 0.3).map((h) => [h[0], h[1]]))) {
      b.box(c - a, 0.55, 0.42, C.woodRed, (a + c) / 2, top - 0.3, z, { col: false, mat: 'wood' });
    }
    if (l === N_LEVELS - 1) this.caisson(b, top);
    // 中庭（二、三层楼板开洞）：一圈栏杆
    if (A.floors.includes(l)) this.rail(b, [[-A.x, A.z1], [A.x, A.z1], [A.x, A.z0], [-A.x, A.z0]], L.y, true);
    // 顶层：楼梯口三面与第一跑上方的栏杆（下面一层的楼梯间在此开洞，再无上行梯段）
    if (l === N_LEVELS - 1) {
      const g = stairGeom(l - 1);
      for (const s of [-1, 1]) {
        this.rail(b, [[s * g.box.x0, g.box.z1], [s * g.box.x0, g.box.z0], [s * g.box.x1, g.box.z0], [s * g.box.x1, g.box.z1]], L.y);
        this.rail(b, [[s * g.A.x0, g.box.z1], [s * (g.A.x1 + 0.2), g.box.z1]], L.y);
      }
    }
  }

  // 室内一间墙面（该面本地坐标：x 沿墙、z = 0 为轴线、+Z 朝外）
  bayIn(b, kind, cx, bw, hW, r, o, L, wT) {
    const cw = bw - 2 * r * 0.9, frame = C.woodRed, xa = cx - cw / 2, xb = cx + cw / 2;
    const wall = (x0, x1, y0, y1) => {
      if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return;
      if (y0 < 1.0) {                                                                                      // 木护墙板
        const ym = Math.min(y1, 1.0);
        b.slab(x1 - x0, ym - y0, wT, C.woodDark, (x0 + x1) / 2, y0, 0, { mat: 'wood' });
        b.box(x1 - x0, 0.06, 0.05, frame, (x0 + x1) / 2, ym - 0.03, -wT / 2 - 0.025, { col: false, mat: 'wood' });
      }
      if (y1 > 1.0) b.slab(x1 - x0, y1 - Math.max(y0, 1.0), wT, C.plaster, (x0 + x1) / 2, Math.max(y0, 1.0), 0, { mat: 'std' });
    };
    if (kind === 'wall') { wall(xa, xb, 0, hW); return; }
    const w = o.w, ox0 = cx - w / 2, ox1 = cx + w / 2, y0 = o.y0 - L.y, y1 = o.y1 - L.y;
    wall(xa, ox0, 0, hW); wall(ox1, xb, 0, hW); wall(ox0, ox1, y1, hW);
    if (y0 > 0.02) wall(ox0, ox1, 0, y0);
    // 窗框、门框（室内一侧，进深与墙同厚）
    b.box(w + 0.16, 0.14, wT + 0.04, frame, cx, y1 - 0.07, 0, { col: false, mat: 'wood' });
    for (const s of [-1, 1]) b.box(0.12, y1 - y0, wT + 0.04, frame, cx + s * (w / 2 + 0.02), (y0 + y1) / 2, 0, { col: false, mat: 'wood' });
    if (kind === 'paper' || kind === 'open') {
      b.slab(w + 0.12, 0.08, wT + 0.14, frame, cx, y0, 0, { col: false, mat: 'wood' });
      b.panel(w - 0.08, 0.37, C.paper, cx, y1 - 0.225, -0.02, { mat: 'windowLit', ry: Math.PI });           // 横披
      b.box(w, 0.08, 0.2, frame, cx, y1 - 0.45, 0, { col: false, mat: 'wood' });
      const ph = y1 - y0 - 0.55;
      if (kind === 'paper') {
        const n = w > 3 ? 4 : 3, lw = w / n;
        for (let i = 0; i < n; i++) {
          b.panel(lw - 0.08, ph, C.paper, cx - w / 2 + (i + 0.5) * lw, y0 + 0.08 + ph / 2, -0.04, { mat: 'windowLit', ry: Math.PI });
          if (i) b.box(0.06, ph, 0.12, frame, cx - w / 2 + i * lw, y0 + 0.08 + ph / 2, 0, { col: false, mat: 'wood' });
        }
      }
      b.collider(cx, y0, y1, 0, w / 2, wT / 2 + 0.05, 0, { walk: false, cam: false });                     // 窗洞里一道看不见的挡
      return;
    }
    b.slab(w + 0.1, 0.16, wT + 0.1, frame, cx, 0, 0, { col: false, mat: 'wood' });
    if (kind === 'door') {
      doorLeaves(b, cx, 0.16, -0.02, w, y1 - 0.16, { leaves: 4, frame });
      b.collider(cx, 0, y1, 0, w / 2, wT / 2, 0, { walk: false });
      return;
    }
    // 正门：两扇大门向内推开（与外观同一份几何），门扇各设一道挡
    mainDoorLeaves(b, cx, w, y1, wT);
    for (const s of [-1, 1]) b.collider(cx + s * (w / 2 + 0.05), 0, y1, -wT / 2 - w / 4, 0.12, w / 4, 0, { walk: false, cam: false });
  }

  // 顶层天花正中的藻井：方井（四角抹角板收成八角）→ 三重收进的八角井（每重一圈斗拱、一圈井口板）→ 井心彩画、垂一颗鎏金宝珠
  caisson(b, top) {
    const a = CAISSON, t8 = Math.tan(Math.PI / 8), nc = { col: false };
    const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => [[sx * a, sz * a], [sx * a, sz * a * t8], [sx * a * t8, sz * a]]);
    b.add(flatGeo(corners), C.paintBlue, 'std', { y: top - 0.02, ...nc });
    let R = a / Math.cos(Math.PI / 8), y = top;
    const H = [0.9, 0.8, 0.7];
    for (let k = 0; k < 3; k++) {
      const h = H[k], Rn = k < 2 ? R * 0.7 : 0;
      b.cyl(R, R, h, C.woodRed, 0, y + h / 2, 0, { seg: 8, open: true, ry: Math.PI / 8, mat: 'under', ...nc });           // 井壁（自井内看，取背面）
      b.cyl(R - 0.02, R - 0.02, 0.24, C.paintTeal, 0, y + h - 0.2, 0, { seg: 8, open: true, ry: Math.PI / 8, mat: 'cloth', ...nc });
      const nd = 8 * (3 - k);
      for (let i = 0; i < nd; i++) {
        const ang = Math.PI / 8 + (i / nd) * Math.PI * 2, rr = R * Math.cos(Math.PI / 8) - 0.18;
        dougong(b, Math.sin(ang) * rr, y + 0.04, Math.cos(ang) * rr, 0.36, ang + Math.PI, true);
      }
      y += h;
      // 井口板：本重与下一重之间的八角环（朝下）；最上一重为井心
      const outer = ngon(R), inner = ngon(Math.max(Rn, 0.001));
      const ring = outer.map((p, i) => [p, outer[(i + 1) % 8], inner[(i + 1) % 8], inner[i]]);
      b.add(flatGeo(ring), k < 2 ? C.paintBlue : 0xffffff, k < 2 ? 'std' : 'coffer', { y: y - 0.01, ...nc });
      if (Rn) R = Rn;
    }
    b.sphere(0.55, C.gold, 0, y - 0.75, 0, { mat: 'gold', seg: 18, seg2: 12 });
    b.cyl(0.04, 0.04, 0.2, C.gold, 0, y - 0.12, 0, { seg: 6, mat: 'gold', col: false });
  }

  // 木栏杆（closed：一圈），woodRail 自带不可越过的碰撞
  rail(b, pts, y, closed = false) { woodRail(b, pts, y + 0.02, { color: C.vermilion, closed, h: 1.05, spacing: 0.24 }); }

  // 第 l 层到 l+1 层的两座楼梯间：踏步（顶面可走）、休息平台、两跑之间的隔墙、三面围墙、楼梯口门楣与层匾。
  // 一层的梯段实砌到地；楼上的梯段只有踏步板与斜梁底板——下面一层的梯段从它们下方穿过（各层楼梯间叠放在同一处）
  buildStairs(b, l) {
    const g = stairGeom(l), S = HALL.stairs, y0 = g.y0, H = g.H, t = S.tread, rise = g.rise, solid = l === 0;
    for (const s of [-1, 1]) {
      const X = (a, c) => [Math.min(s * a, s * c), Math.max(s * a, s * c)];
      const box = (xa, xc, za, zc, ya, yc, color, mat = 'wood', o = {}) => {
        const [x0, x1] = X(xa, xc);
        b.box(x1 - x0, yc - ya, zc - za, color, (x0 + x1) / 2, (ya + yc) / 2, (za + zc) / 2, { mat, ...o });
      };
      // 第一跑（自楼梯口向北上行）
      // 一层实砌的梯段：粉墙砌体，上铺木踏板；楼上的梯段为木踏步板
      const step = (xa, xc, za, zc, tp) => {
        if (!solid) { box(xa, xc, za, zc, tp - rise - TH, tp, C.woodDark); return; }
        box(xa, xc, za, zc, y0, tp - 0.06, C.plaster, 'std');
        box(xa, xc, za, zc, tp - 0.06, tp, C.woodDark);
      };
      for (let k = 0; k < g.n; k++) {
        const tp = y0 + (k + 1) * rise, za = S.zs - (k + 1) * t, zc = S.zs - k * t;
        step(g.A.x0, g.A.x1, za, zc, tp);
        box(g.A.x0, g.A.x1, zc - 0.05, zc + 0.02, tp - 0.05, tp + 0.01, C.woodRed, 'wood', { col: false });     // 踏步口（朝下行方向）
      }
      // 休息平台
      if (solid) { box(g.box.x0, g.box.x1, g.landing.z0, g.landing.z1, y0, y0 + H / 2 - 0.06, C.plaster, 'std'); box(g.box.x0, g.box.x1, g.landing.z0, g.landing.z1, y0 + H / 2 - 0.06, y0 + H / 2, C.woodDark); }
      else box(g.box.x0, g.box.x1, g.landing.z0, g.landing.z1, y0 + H / 2 - 0.42, y0 + H / 2, C.woodDark);
      // 第二跑（自平台向南上行回到楼梯口，接上一层楼面）
      for (let k = 0; k < g.n; k++) {
        const tp = y0 + H / 2 + (k + 1) * rise, za = g.landing.z1 + k * t, zc = za + t;
        step(g.B.x0, g.B.x1, za, zc, tp);
        box(g.B.x0, g.B.x1, za - 0.02, za + 0.05, tp - 0.05, tp + 0.01, C.woodRed, 'wood', { col: false });
      }
      // 楼上：两跑下面的斜梁底板（自下一层仰看是一道平整的斜底）
      if (!solid) {
        const len = Math.hypot(g.run, H / 2), ang = Math.atan2(H / 2, g.run);
        const [ax0, ax1] = X(g.A.x0, g.A.x1), [bx0, bx1] = X(g.B.x0, g.B.x1);
        b.box(ax1 - ax0, 0.12, len, C.woodRed, (ax0 + ax1) / 2, y0 + H / 4 - TH - rise - 0.07, S.zs - g.run / 2, { rx: ang, col: false, mat: 'wood' });
        b.box(bx1 - bx0, 0.12, len, C.woodRed, (bx0 + bx1) / 2, y0 + H / 2 + H / 4 - TH - rise - 0.07, g.landing.z1 + g.run / 2, { rx: -ang, col: false, mat: 'wood' });
      }
      // 两跑之间的隔墙（自楼梯口到平台）、楼梯间三面围墙（整层高，与上下层的围墙接成一道）
      box(g.A.x1, g.B.x0, g.landing.z1, S.zs, y0, y0 + H, C.plaster, 'std');
      box(g.box.x0 - 0.32, g.box.x0 - 0.02, g.box.z0 - 0.32, S.zs, y0, y0 + H, C.plaster, 'std');
      box(g.box.x1 + 0.02, g.box.x1 + 0.32, g.box.z0 - 0.32, S.zs, y0, y0 + H, C.plaster, 'std');
      box(g.box.x0 - 0.32, g.box.x1 + 0.32, g.box.z0 - 0.32, g.box.z0 - 0.02, y0, y0 + H, C.plaster, 'std');
      // 楼梯口：两侧门柱、门楣，门楣下挂层匾（上行一侧「上 × 层」，下行一侧「下 × 层」）
      for (const xx of [g.box.x0 - 0.28, g.box.x1 + 0.28]) b.cyl(0.24, 0.26, 3.4, C.vermilion, s * xx, y0 + 1.7, S.zs + 0.1, { seg: 12, mat: 'wood' });
      const [bx0, bx1] = X(g.box.x0 - 0.5, g.box.x1 + 0.5);
      b.box(bx1 - bx0, 0.4, 0.36, C.woodRed, (bx0 + bx1) / 2, y0 + 3.2, S.zs + 0.1, { col: false, mat: 'wood' });
      const up = plaqueMesh('上' + HALL.levels[l + 1].name.split(' · ')[0], 1.5, 0.46, { bg: '#2a2a28', fg: '#d9c48e', frame: '#5a4330' });
      up.position.set(s * (g.A.x0 + g.A.x1) / 2, y0 + 2.72, S.zs + 0.3);
      b.addMesh(up);
      if (l > 0) {
        const dn = plaqueMesh('下' + HALL.levels[l - 1].name.split(' · ')[0], 1.5, 0.46, { bg: '#2a2a28', fg: '#d9c48e', frame: '#5a4330' });
        dn.position.set(s * (g.B.x0 + g.B.x1) / 2, y0 + 2.72, S.zs + 0.3);
        b.addMesh(dn);
      }
    }
  }

  // ---------- 陈设 ----------
  buildDetails(b, l, g, rand) {
    const L = HALL.levels[l], y = L.y, top = ceilY(l);
    // 模型摆件：col 给碰撞（包围盒）；返回的对象 userData.bb 为本地（相对殿心）包围盒
    const put = (name, x, yy, z, ry = 0, s = 1, col = null) => {
      const src = this.models[name];
      if (!src) return null;
      const o = src.clone(true);
      o.position.set(x, yy, z); o.rotation.y = ry; o.scale.setScalar(s);
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      o.updateMatrixWorld(true);
      const bb = o.userData.bb = new THREE.Box3().setFromObject(o);
      g.add(o);
      if (col) this.cw.addBox({ x: HALL.x + (bb.min.x + bb.max.x) / 2, z: HALL.z + (bb.min.z + bb.max.z) / 2, y0: HALL.y + bb.min.y, y1: HALL.y + bb.max.y, hx: (bb.max.x - bb.min.x) / 2, hz: (bb.max.z - bb.min.z) / 2, walk: false, cam: !!col.cam });
      return o;
    };
    const lamp = (x, z, s = 1.5) => { const cy = this.addLantern(b, g, x, top, z, s); this.lampSpots.push({ l, x, y: cy, z }); };
    const cushion = (x, z) => {
      b.cyl(0.36, 0.4, 0.16, 0x6b5a3a, x, y + 0.08, z, { seg: 14, col: false, mat: 'cloth' });
      b.cyl(0.3, 0.36, 0.06, 0x8a7448, x, y + 0.19, z, { seg: 14, col: false, mat: 'cloth' });
    };
    // 竖写条幅：宽 w、高 h（plaqueMesh 竖排时先给长边）
    const scrollV = (text, x, yy, z, ry, w = 0.9, h = 3.2) => {
      const m = plaqueMesh(text, h, w, { vertical: true, bg: '#e6dcc4', fg: '#22201c', frame: '#3a4a40' });
      m.position.set(x, yy, z); m.rotation.y = ry; b.addMesh(m);
    };
    if (l === 0) {
      // 北墙正中：须弥座供台（前出五级踏步）、香案、祖师牌位、巨幅立轴
      b.slab(11, 1.0, 4.4, C.marbleShade, 0, y, -19.4, { mat: 'stone' });
      b.slab(11.3, 0.14, 4.7, C.marble, 0, y + 1.0, -19.4, { mat: 'stoneSmooth', col: false });
      for (let k = 0; k < 5; k++) b.slab(4.2, (k + 1) * 0.2, 0.32, C.marble, 0, y, -17.2 + 0.16 + (4 - k) * 0.32, { mat: 'stoneSmooth' });
      table9(b, 0, y + 1.14, -19.6, 0, { L: 4.6, D: 1.1, H: 1.0 });
      censerR(b, 0, y + 2.14, -19.5, 0.62, 0);
      for (const s of [-1, 1]) {
        b.cyl(0.07, 0.09, 0.5, 0xa6342a, s * 1.4, y + 2.39, -19.5, { seg: 10, col: false });
        b.sphere(0.06, 0xffc070, s * 1.4, y + 2.72, -19.5, { mat: 'glow', seg: 8, seg2: 6 });
        b.cyl(0.26, 0.2, 0.08, C.bronze, s * 0.75, y + 2.18, -19.75, { seg: 14, col: false, mat: 'bronze' });
      }
      b.slab(1.2, 0.36, 0.6, C.woodRed, 0, y + 1.14, -20.9, { mat: 'wood', col: false });
      const tab = plaqueMesh('开山祖师云岫子之位', 2.0, 0.8, { vertical: true, bg: '#5a1e16', fg: '#e2c27a', frame: '#3a1a12' });
      tab.position.set(0, y + 1.5 + 1.0, -20.9); b.addMesh(tab);
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 4.7), new THREE.MeshStandardMaterial({ map: scrollTexture(), roughness: 0.92 }));
      sc.position.set(0, y + 2.0 + 2.35, -L.d / 2 + HALL.wallT / 2 + 0.03); sc.receiveShadow = true;
      g.add(sc);
      b.cyl(0.05, 0.05, 4.3, C.woodRed, 0, y + 6.72, -L.d / 2 + HALL.wallT / 2 + 0.06, { rz: Math.PI / 2, seg: 8, col: false, mat: 'wood' });
      b.cyl(0.06, 0.06, 4.4, C.woodRed, 0, y + 1.98, -L.d / 2 + HALL.wallT / 2 + 0.07, { rz: Math.PI / 2, seg: 8, col: false, mat: 'wood' });
      // 浑天仪下：圆形八卦石台（可登）
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.4, 0.36, 64), [new THREE.MeshStandardMaterial({ color: 0xc8c2b4, roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: baguaTexture(), roughness: 0.5 }), new THREE.MeshStandardMaterial({ color: 0xc8c2b4 })]);
      disc.position.set(0, y + 0.18, -5.5); disc.receiveShadow = true;
      g.add(disc);
      this.cw.addCyl({ x: HALL.x, z: HALL.z - 5.5, y0: HALL.y, y1: HALL.y + 0.36, r: 5.3, walk: true });
      censerR(b, 0, y, -13.6, 1.55, 0);
      // 蒲团：石台之前三排（向北拜）
      for (const z of [1.4, 3.0, 4.6]) for (const x of [-5.4, -4.0, -2.6, -1.2, 1.2, 2.6, 4.0, 5.4]) cushion(x, z);
      // 两侧：铜钟、法鼓
      b.cyl(0.9, 1.1, 2.2, C.bronze, -16, y + 1.6, 14, { seg: 24, mat: 'bronze' });
      b.slab(3.2, 0.3, 0.3, C.woodRed, -16, y + 3.3, 14, { mat: 'wood', col: false });
      for (const s of [-1, 1]) b.slab(0.3, 3.6, 0.3, C.woodRed, -16 + s * 1.5, y, 14, { mat: 'wood' });
      b.cyl(1.1, 1.1, 1.2, 0xa63d2c, 16, y + 1.7, 14, { rx: Math.PI / 2, seg: 28, mat: 'wood', col: false });
      for (const s of [-1, 1]) b.cyl(1.0, 1.0, 0.02, 0xd8c8a2, 16, y + 1.7, 14 + s * 0.61, { rx: Math.PI / 2, seg: 28, col: false });
      for (const s of [-1, 1]) b.slab(0.24, 1.2, 1.4, C.woodRed, 16 + s * 1.0, y, 14, { mat: 'wood' });
      b.collider(16, y, y + 2.8, 14, 1.2, 0.8, 0, { walk: false, cam: false });
      // 长幡（中庭两侧）、石灯
      for (const s of [-1, 1]) for (const z of [-9, -2, 5]) banner(b, s * 8.7, top - 0.2, z, s * Math.PI / 2, 1.0, 4.2, z === -2 ? (s < 0 ? '问道' : '青岚') : '');
      for (const s of [-1, 1]) for (const z of [10, 17]) stoneLanternR(b, s * 9.5, y, z, 1.1);
      // 正门内上方的匾（朝北）
      const pm = plaqueMesh('问道在心', 5.2, 1.6, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
      pm.position.set(0, y + HALL.door.h + 1.15, L.d / 2 - HALL.wallT / 2 - 0.08); pm.rotation.y = Math.PI; b.addMesh(pm);
      for (const [x, z] of [[-9, 12], [9, 12], [-9, -1], [9, -1], [-18, 6], [18, 6], [-18, -18], [18, -18], [0, 14]]) lamp(x, z, 1.6);
      put('chinese_cabinet', -22.3, y, -19.6, Math.PI / 2, 1.1, { cam: true });
      put('chinese_cabinet', 22.3, y, -19.6, -Math.PI / 2, 1.1, { cam: true });
    } else if (l === 1) {
      // 藏经阁：两翼一排排双面书架、窗前书案
      for (const s of [-1, 1]) for (const z of [4.5, 9, 13.5]) for (let k = 0; k < 3; k++) {
        const x = s * (11.5 + k * 1.25);
        bookcase9(b, x, y, z - 0.22, Math.PI, { W: 1.2, H: 2.2, seed: Math.round(Math.abs(x) * 3 + z) });
        bookcase9(b, x, y, z + 0.22, 0, { W: 1.2, H: 2.2, seed: Math.round(Math.abs(x) * 5 + z) });
      }
      for (const [x, z, ry] of [[-15.5, 18.0, Math.PI], [15.5, 18.0, Math.PI], [-18.6, -1, -Math.PI / 2], [18.6, -1, Math.PI / 2]]) {
        table9(b, x, y, z, ry, { L: 2.0, D: 0.9, H: 0.78 });
        for (let k = 0; k < 3; k++) b.slab(0.34, 0.07 + (k % 2) * 0.05, 0.24, k % 2 ? 0x2f3e57 : 0x5a3b2c, x + (k - 1) * 0.5 * Math.cos(ry), y + 0.78, z - (k - 1) * 0.5 * Math.sin(ry), { col: false });
        put('chinese_stool', x - Math.sin(ry) * 0.95, y, z - Math.cos(ry) * 0.95, ry, 0.8);
      }
      for (const s of [-1, 1]) scrollV(s < 0 ? '学而不思则罔' : '思而不学则殆', s * 4.2, y + 2.6, -L.d / 2 + 0.3, 0, 0.8, 3.0);
      for (const [x, z] of [[-11, 16], [11, 16], [-11, -1], [11, -1], [0, 15], [-18, 8], [18, 8]]) lamp(x, z);
    } else if (l === 2) {
      // 法器阁：多宝格、剑架、铜器、丹瓶
      for (const s of [-1, 1]) for (const z of [5, 10]) {
        jarCabinet9(b, s * 13.6, y, z, s < 0 ? Math.PI / 2 : -Math.PI / 2, { W: 2.4, H: 2.0, D: 0.5, rows: 4, cols: 5 });
        for (let k = 0; k < 4; k++) herbJar(b, s * 13.6, y + 2.02, z - 0.9 + k * 0.6, 0.3 + (k % 2) * 0.1, k % 3);
      }
      for (const [x, z] of [[-6, 13], [6, 13], [0, 16]]) {
        b.slab(2.2, 0.12, 0.5, C.woodDark, x, y, z, { mat: 'wood' });
        for (const s of [-1, 1]) b.slab(0.12, 1.6, 0.12, C.woodRed, x + s * 1.0, y, z, { mat: 'wood', col: false });
        for (let k = 0; k < 3; k++) {
          b.box(1.7, 0.06, 0.03, 0x9fd0c0, x, y + 0.6 + k * 0.38, z, { mat: 'jade', col: false });
          b.box(0.22, 0.05, 0.06, C.gold, x - 0.75, y + 0.6 + k * 0.38, z, { mat: 'gold', col: false });
        }
        b.collider(x, y, y + 1.7, z, 1.15, 0.3, 0, { walk: false, cam: false });
      }
      put('painted_wooden_shelves', -19.5, y + 1.3, -1, Math.PI / 2, 1.2);
      put('painted_wooden_shelves', 19.5, y + 1.3, -1, -Math.PI / 2, 1.2);
      for (const [n, x, z, s2] of [['brass_vase_03', -9, 17.6, 2.2], ['brass_pot_01', 9, 17.6, 2.4], ['antique_ceramic_vase_01', -15, 17.5, 1.8], ['ceramic_vase_04', 15, 17.5, 2.0]]) put(n, x, y, z, rand() * 6, s2, {});
      const potions = this.models.potions ? this.models.potions.children.filter((c) => c.name.startsWith('potion')) : [];
      table9(b, 0, y, 9.5, 0, { L: 2.4, D: 1.0, H: 0.85 });
      potions.slice(0, 8).forEach((src, i) => {
        const o = src.clone(true);
        o.position.set(-0.95 + i * 0.27, y + 0.85, 9.5 + (i % 2 ? 0.18 : -0.15)); o.scale.setScalar(0.62);
        o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.material.emissiveIntensity = 0.55; } });
        g.add(o);
      });
      for (const [x, z] of [[-10, 13], [10, 13], [0, 13], [-16, 2], [16, 2], [-10, -15], [10, -15]]) lamp(x, z);
    } else if (l === 3) {
      // 静修堂：殿心一圈蒲团围着青铜香炉；四面屏风、矮几茶具；北壁条幅
      censerR(b, 0, y, -2, 1.2, 0);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; cushion(Math.cos(a) * 4.6, -2 + Math.sin(a) * 4.6); }
      for (const [x, z, ry] of [[-8.6, -10, 0.55], [8.6, -10, -0.55], [-8.6, 6.4, Math.PI - 0.55], [8.6, 6.4, Math.PI + 0.55]]) put('chinese_screen_panels', x, y, z, ry, 1.4, { cam: true });
      for (const [x, z] of [[-6, 11], [6, 11]]) {
        table9(b, x, y, z, 0, { L: 1.2, D: 0.7, H: 0.42 });
        teaSet(b, x, y + 0.42, z, 0);
        cushion(x, z + 0.9); cushion(x, z - 0.9);
      }
      for (const [t, x] of [['静', -6], ['心', -2], ['守', 2], ['一', 6]]) scrollV(t, x, y + 2.5, -L.d / 2 + 0.3, 0, 0.9, 2.4);
      for (const [x, z] of [[-6, -2], [6, -2], [0, 8], [-14, 8], [14, 8], [0, -12]]) lamp(x, z);
    } else {
      // 观云阁：殿心舆图案（宗门全图）、南窗前茶座、凭窗的官帽椅
      const mapR = 2.8;
      b.cyl(mapR + 0.12, mapR + 0.12, 0.12, C.woodRed, 0, y + 0.86, 0, { seg: 40, mat: 'wood' });
      b.cyl(1.0, 1.4, 0.86, C.woodDark, 0, y + 0.43, 0, { seg: 24, mat: 'wood' });
      if (this.mapCanvas) {
        const tex = new THREE.CanvasTexture(this.mapCanvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
        const m = new THREE.Mesh(new THREE.CircleGeometry(mapR, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
        m.rotation.x = -Math.PI / 2; m.position.set(0, y + 0.93, 0); m.receiveShadow = true;
        g.add(m);
      }
      put('chinese_sofa', -6.5, y, 11.4, 0, 1.1, {});
      const tt = put('chinese_tea_table', -6.5, y, 13.0, 0, 1.0, {});
      teaSet(b, -6.5, tt ? tt.userData.bb.max.y : y + 0.45, 13.0, 0);
      for (const [x, z, ry] of [[6, 13.0, 0], [13.2, 4, Math.PI / 2], [-13.2, 4, -Math.PI / 2], [13.2, -2.5, Math.PI / 2], [-13.2, -2.5, -Math.PI / 2], [0, -13.0, Math.PI]]) put('chinese_armchair', x, y, z, ry, 0.8, {});
      for (const [x, z] of [[-14.6, 14.2], [14.6, 14.2], [-9.5, -14.6], [9.5, -14.6]]) put('potted_plant_04', x, y, z, rand() * 6, 2.2, {});
      for (const [x, z] of [[-9, 9], [9, 9], [-9, -9], [9, -9]]) lamp(x, z);
    }
  }

  // 宫灯（宗门里同一套灯笼模型，入夜灯罩透光）：挂在天花下，垂一根挂绳；返回灯笼中心高度（本地）
  addLantern(b, g, x, top, z, s) {
    const src = ASSETS.models.palace_lantern, yTop = top - 0.55;
    b.cyl(0.015, 0.015, 0.55, 0x2a2420, x, top - 0.275, z, { seg: 5, col: false });
    if (!src) return yTop - 0.6 * s;
    if (!this.lanternMat) {
      let mesh = null;
      src.scene.traverse((m) => { if (m.isMesh && !mesh) mesh = m; });
      this.lanternGeo = mesh.geometry;
      const mat = this.lanternMat = mesh.material.clone();
      mat.emissive = new THREE.Color(1.0, 0.68, 0.38); mat.emissiveMap = mat.map;
      mat.onBeforeCompile = (sh) => {
        injectFog(sh);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= .35 + uNight * 1.4;');
        sh.uniforms.uNight = FOGU.uNight;
      };
      mat.customProgramCacheKey = () => 'hall-lantern';
      const bb = new THREE.Box3().setFromObject(src.scene);
      this.lanternH = bb.max.y - bb.min.y; this.lanternY0 = bb.min.y;
    }
    const m = new THREE.Mesh(this.lanternGeo, this.lanternMat);
    m.scale.setScalar(s); m.position.set(x, yTop - this.lanternH * s - this.lanternY0 * s, z);
    m.rotation.y = (x * 0.7 + z * 1.3) % (Math.PI * 2);
    g.add(m);
    return yTop - this.lanternH * s * 0.5;
  }

  // 浑天仪：悬在中庭（二、三层楼板开洞之间），地平环、子午环（外重）与赤道环、黄道环、四游环（内重，绕斜轴缓转），中心青玉珠
  buildArmillary() {
    const A = HALL.atrium, g = this.armillary = new THREE.Group();
    const cy = 13.2;
    g.position.set(0, cy, (A.z0 + A.z1) / 2);
    const bronze = new THREE.MeshStandardMaterial({ color: 0x8a6c3c, metalness: 0.85, roughness: 0.42, envMapIntensity: 0.6 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc8a25a, metalness: 1, roughness: 0.32, envMapIntensity: 0.6 });
    registerEnvMat(bronze); registerEnvMat(gold);
    const ring = (R, t, mat) => new THREE.Mesh(new THREE.TorusGeometry(R, t, 10, 128), mat);
    const outer = this.armOuter = new THREE.Group();
    const hor = ring(4.4, 0.16, bronze); hor.rotation.x = Math.PI / 2; outer.add(hor);
    outer.add(ring(4.4, 0.16, bronze));
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2, tick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.34), gold);
      tick.position.set(Math.cos(a) * 4.4, 0.17, Math.sin(a) * 4.4); tick.rotation.y = Math.PI / 2 - a; outer.add(tick);
    }
    g.add(outer);
    const inner = this.armInner = new THREE.Group();
    inner.rotation.order = 'ZYX'; inner.rotation.z = 0.6;
    const eq = ring(3.6, 0.13, gold); eq.rotation.x = Math.PI / 2; inner.add(eq);
    const ecl = ring(3.6, 0.11, bronze); ecl.rotation.x = Math.PI / 2 - 0.41; inner.add(ecl);
    inner.add(ring(3.0, 0.1, bronze));
    g.add(inner);
    const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 9.6, 10), gold); axis.rotation.z = 0.6; g.add(axis);
    this.orbMat = new THREE.MeshStandardMaterial({ color: 0x8fc9b8, emissive: 0x3a8a74, emissiveIntensity: 0.4, roughness: 0.25, metalness: 0 });
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.75, 32, 20), this.orbMat));
    // 子午环顶的鎏金云头与吊链（挂在四层楼板下）
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 10), gold); knob.position.y = 4.62; g.add(knob);
    const topY = HALL.levels[3].y - HALL.slabT - cy, len = topY - 4.8;
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 8), bronze); chain.position.y = 4.8 + len / 2; g.add(chain);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.groups[1].add(g);           // 随二层显示（一至三层都看得见）
  }

  buildLights() {
    const q = this.quality;
    this.hemi = new THREE.HemisphereLight(0xdde4ec, 0x3a2e24, 0.5);
    this.scene.add(this.hemi);
    // 日光（夜里月光）：与宗门同向、同色；只从门窗洞照进来，楼板、墙、柱投影，地上落出窗格光斑
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d8, 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(q === 'low' ? 1024 : 2048, q === 'low' ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 170;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
    // 宫灯点光（固定数目，按远近分配到灯位，换灯位时先暗下再亮起）
    this.points = Array.from({ length: LIGHTS }, () => { const p = new THREE.PointLight(0xffb468, 0, 24, 2); p.userData = { spot: null, k: 0 }; this.scene.add(p); return p; });
  }

  // ---------- 行走与镜头（Player / FollowCamera 用的接口，世界坐标）----------
  heightAt() { return HALL.y; }
  waterAt() { return null; }
  normalAt() { return new THREE.Vector3(0, 1, 0); }
  inCore(x, z) {
    const L = HALL.levels[0], lx = x - HALL.x, lz = z - HALL.z;
    if (Math.abs(lx) < L.w / 2 - 0.3 && Math.abs(lz) < L.d / 2 - 0.3) return true;
    return Math.abs(lx) < HALL.door.w / 2 - 0.3 && lz >= L.d / 2 - 0.3 && lz < L.d / 2 + 0.7;
  }
  inDoorway(x, z) { const L = HALL.levels[0]; return Math.abs(x - HALL.x) < HALL.door.w / 2 && z - HALL.z > L.d / 2 - 0.05; }
  // 进殿：站在正门内两步，面朝北
  get entry() { const L = HALL.levels[0]; return { x: HALL.x, y: HALL.y, z: HALL.z + L.d / 2 - 2.4, yaw: Math.PI }; }
  // 镜头必须留在殿内（四面墙内、顶层天花下；正门洞可稍探出）；楼板、楼梯、柱子由碰撞体的射线检测挡住
  camInside(x, y, z) {
    const lx = x - HALL.x, ly = y - HALL.y, lz = z - HALL.z;
    if (ly < 0.2) return false;
    const l = levelAt(y), L = HALL.levels[l], wT = l ? 0.45 : HALL.wallT, m = 0.4;
    if (Math.abs(lx) < L.w / 2 - wT / 2 - m && Math.abs(lz) < L.d / 2 - wT / 2 - m) return l < N_LEVELS - 1 || ly < ceilY(l) - 0.25;
    return l === 0 && Math.abs(lx) < HALL.door.w / 2 - 0.35 && lz < L.d / 2 + 0.6 && ly < HALL.door.h - 0.25;
  }
  camLimit(o, dir, d) {
    const n = Math.ceil(d / 0.15);
    for (let i = 1; i <= n; i++) {
      const s = (d * i) / n;
      if (!this.camInside(o.x + dir.x * s, o.y + dir.y * s, o.z + dir.z * s)) return Math.max(0.5, s - 0.3);
    }
    return d;
  }

  // 显示的楼层：本层上下各一层；在一至三层时中庭上下贯通，一至三层都显示
  setFloor(f) {
    if (f === this.floor) return;
    this.floor = f;
    this.groups.forEach((g, l) => { g.visible = Math.abs(l - f) <= 1 || (f <= 2 && l <= 2); });
  }

  // ---------- 每帧 ----------
  update(dt, t, camera, player) {
    if (!this.ready) return;
    this.setFloor(levelAt(player.pos.y));
    this.updateSky();                                // 每帧跟宗门的天光同步（只是几个数值的拷贝）
    this.updateLamps(dt, player);
    this.armInner.rotation.y = t * 0.05;
    this.armOuter.rotation.y = -t * 0.012;
    this.orbMat.emissiveIntensity = 0.25 + FOGU.uNight.value * 1.4;
  }

  // 天光：取宗门的日（月）光方向、颜色与强度；四面开窗，天光照进屋里约剩七成；窗纸白天透光
  updateSky() {
    const sky = this.sky;
    if (!sky) return;
    const L = HALL.levels[Math.max(0, this.floor)], day = skyState().day;
    this.hemi.color.copy(sky.hemi.color); this.hemi.groundColor.setRGB(0.44, 0.37, 0.3);      // 地面（金砖、石台）反上来的光
    this.hemi.intensity = sky.hemi.intensity * 0.85 + 0.12;
    (this.mats.windowLit.userData.dayLit ||= { value: 0 }).value = 0.5 * day;
    (this.mats.windowLit.userData.nightK ||= { value: 1 }).value = 0.12;          // 夜里外墙窗纸后面是黑夜，只透一点
    this.exposureK = 1.4 - 0.3 * FOGU.uNight.value;                               // 入夜宫灯为主，曝光收回一些
    this.sun.color.copy(sky.sun.color);
    this.sun.intensity = sky.sun.intensity * 1.1;
    const c = (this._sc ||= new THREE.Vector3()).set(HALL.x, HALL.y + L.y + 2, HALL.z);
    this.sun.target.position.copy(c); this.sun.position.copy(c).addScaledVector(sky.lightDir, 85);
    this.sun.target.updateMatrixWorld();
  }

  // 宫灯：可见各层里离人最近的 6 处灯位各分一盏点光；换灯位时先暗下再挪过去
  updateLamps(dt, player) {
    if ((this.lampT = (this.lampT ?? 0) - dt) <= 0) {
      this.lampT = 0.25;
      const px = player.pos.x - HALL.x, py = player.pos.y - HALL.y, pz = player.pos.z - HALL.z;
      this.want = this.lampSpots.filter((s) => this.groups[s.l].visible)
        .map((s) => ({ s, d: Math.hypot(s.x - px, (s.y - py) * 2, s.z - pz) })).sort((a, b) => a.d - b.d).slice(0, LIGHTS).map((e) => e.s);
    }
    const want = this.want || [], night = FOGU.uNight.value, I = 8 + night * 16;
    const taken = new Set(this.points.map((p) => p.userData.spot).filter((s) => s && want.includes(s)));
    for (const p of this.points) {
      const u = p.userData, keep = u.spot && want.includes(u.spot);
      if (keep) u.k = Math.min(1, u.k + dt * 2.5);
      else if (u.k > 0) u.k = Math.max(0, u.k - dt * 4);
      if (!keep && u.k === 0) {
        const s = want.find((w) => !taken.has(w));
        u.spot = s || null;
        if (s) { taken.add(s); p.position.set(HALL.x + s.x, HALL.y + s.y, HALL.z + s.z); }
      }
      p.intensity = u.k * I;
    }
  }

  // 洞口在屏幕上框住的范围（CSS 像素，左上为原点）：{ x, y, w, h }；没有可见洞口时返回 null。
  // 各洞口四角先按镜头近处裁剪（角点在镜头背后时取与近处平面的交点），再取投影的外接矩形
  portalRect(camera, W, H) {
    const M = this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), EPS = 0.02;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, any = false;
    for (const o of this.openings) {
      if (!this.groups[o.l].visible) continue;
      const P = o.pts.map((p, i) => this._c[i].set(p.x, p.y, p.z, 1).applyMatrix4(M));
      let ox0 = Infinity, oy0 = Infinity, ox1 = -Infinity, oy1 = -Infinity, n = 0;
      const add = (x, y, w) => { const u = x / w, v = y / w; ox0 = Math.min(ox0, u); ox1 = Math.max(ox1, u); oy0 = Math.min(oy0, v); oy1 = Math.max(oy1, v); n++; };
      for (let i = 0; i < 4; i++) {
        const a = P[i], c = P[(i + 1) % 4], ia = a.w > EPS, ic = c.w > EPS;
        if (ia) add(a.x, a.y, a.w);
        if (ia !== ic) { const k = (EPS - a.w) / (c.w - a.w); add(a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, EPS); }
      }
      if (!n || ox1 < -1 || ox0 > 1 || oy1 < -1 || oy0 > 1) continue;
      any = true;
      x0 = Math.min(x0, ox0); x1 = Math.max(x1, ox1); y0 = Math.min(y0, oy0); y1 = Math.max(y1, oy1);
    }
    if (!any) return null;
    x0 = clamp(x0, -1, 1); x1 = clamp(x1, -1, 1); y0 = clamp(y0, -1, 1); y1 = clamp(y1, -1, 1);
    const px0 = Math.max(0, Math.floor((x0 * 0.5 + 0.5) * W) - 2), px1 = Math.min(W, Math.ceil((x1 * 0.5 + 0.5) * W) + 2);
    const py0 = Math.max(0, Math.floor((0.5 - y1 * 0.5) * H) - 2), py1 = Math.min(H, Math.ceil((0.5 - y0 * 0.5) * H) + 2);
    return px1 > px0 && py1 > py0 ? { x: px0, y: py0, w: px1 - px0, h: py1 - py0 } : null;
  }
}
