// 通天塔一层 · 接引大厅（第十三轮）：独立场景（同丹房、问道殿室内），第一次入塔时搭建。
// 八角大厅与塔外一层同向同大：外墙对边宽 60 米、墙厚 1.6 米，厅内对边宽约 56.8 米，楼面到天花 10.5 米。
//   · 正门在南：门洞、向内推开的两扇大门、门槛；门外是入塔时在塔前广场拍下的景色（走出门槛即回到塔岛）；
//   · 中央通行区：自正门一条朱红地衣经厅心直到执事案台，中轴上不摆东西；厅心一座楼层传送阵（未来自此去往二至一百层的
//     独立挑战场景——目前尚未开放，只在一层预留位置与配置，见 towerSpec.js 的 TOWER_FLOORS）；阵北中轴两侧，东为「百层」碑、西为铜鼎；
//   · 北面守塔执事的案台，执事立在案后；
//   · 一圈十六根深色木柱、墙上隔扇窗（入夜窗纸透出灯光）、八角藻井；八盏宫灯，厅心一点灵阵冷光。
// 本地原点：厅心、一层楼面；+Z 为南（正门）。
import * as THREE from 'three';
import { Builder, C, makeMaterials } from './arch/builder.js';
import { CollisionWorld } from '../core/collision.js';
import { columnBase } from './arch/stone9.js';
import { teleportArray, PORTAL_COLOR } from './arch/portal.js';
import { plaqueMesh, hangLantern } from './arch/arch.js';
import { TOWER } from './towerSpec.js';
import { NPC } from '../actors/npc.js';

const A = TOWER.f1.w / 2 - 1.6;          // 厅内对边宽的一半（墙内皮）
const H = TOWER.f1.h;
const DOOR = TOWER.door;
const K8 = Math.cos(Math.PI / 8), TAU = Math.PI * 2;
const vtx = (a, k) => { const t = (k * Math.PI) / 4 - Math.PI / 8, R = a / K8; return [R * Math.cos(t), R * Math.sin(t)]; };
// 点在八角形（对边宽一半 a）之内
export const inOct = (x, z, a) => { for (let k = 0; k < 8; k++) { const na = (k * Math.PI) / 4; if (x * Math.cos(na) + z * Math.sin(na) > a) return false; } return true; };

export const TH = { a: A, h: H, door: DOOR };
// 互动点（本地）：出塔、执事、楼层传送阵、百层碑
export const TH_SPOTS = {
  exit: { x: 0, z: A - 1.0, r: 3.0 },
  steward: { x: 0, z: -A + 7.6, r: 3.4 },
  dais: { x: 0, z: 2.0, r: 5.4 },
  stele: { x: 9.2, z: -9, r: 3.0 },          // 碑前（碑身在其东 1.4 米，碑面朝西）
};

export class TowerHall {
  constructor(renderer, { quality = 'mid' } = {}) {
    this.renderer = renderer;
    this.quality = quality;
    this.ready = false;
    this.cw = new CollisionWorld(8);
    this.bounds = { x0: -A - 6, x1: A + 6, z0: -A - 6, z1: A + 8 };
    this.exposure = 1.18;
  }

  async ensure() {
    if (this.ready) return this;
    this.build();
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 300);
    cam.position.set(0, 1.6, A - 3); cam.lookAt(0, 3, 0);
    try { await this.renderer.compileAsync?.(this.scene, cam); } catch (e) { /* 第一帧再编译 */ }
    this.ready = true;
    return this;
  }

  build() {
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1612);
    this.mats = makeMaterials(null);
    const b = new Builder();
    const WOOD = 0x4a3226, WOOD_DK = 0x2e2019;
    // ---------- 地面：汉白玉方砖，中轴朱红地衣 ----------
    const R = A / K8;
    for (let x = -R; x < R; x += 2) for (let z = -R; z < R; z += 2) {
      if (!inOct(x + 1, z + 1, A - 0.2)) continue;
      b.slab(1.96, 0.12, 1.96, (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? C.marbleWarm : 0xd2ccc0, x + 1, -0.12, z + 1, { mat: 'stoneSmooth', col: false });
    }
    b.slab(3.0, 0.03, A - 6.2, 0x8a2a22, 0, 0, (A + 6.2) / 2 + 0.2, { mat: 'cloth', col: false });              // 正门 → 厅心
    const c0 = TH_SPOTS.dais.z - 5.7, c1 = TH_SPOTS.steward.z - 0.9;                                           // 厅心阵台北沿 → 执事案台前
    b.slab(3.0, 0.03, c0 - c1, 0x8a2a22, 0, 0, (c0 + c1) / 2, { mat: 'cloth', col: false });
    for (const s of [-1, 1]) {
      b.slab(0.18, 0.035, A - 6.2, C.gold, s * 1.5, 0, (A + 6.2) / 2 + 0.2, { mat: 'gold', col: false });
      b.slab(0.18, 0.035, c0 - c1, C.gold, s * 1.5, 0, (c0 + c1) / 2, { mat: 'gold', col: false });
    }
    // ---------- 墙：八面（南面开正门），内皮隔扇墙（入夜窗纸透灯），墙脚槛墙，墙顶额枋 ----------
    for (let k = 0; k < 8; k++) {
      const [x0, z0] = vtx(A, k), [x1, z1] = vtx(A, k + 1), L = Math.hypot(x1 - x0, z1 - z0), na = (k * Math.PI) / 4;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ry = Math.PI / 2 - na + Math.PI;   // 面板法线朝厅内
      if (k !== 2) b.collider(cx + Math.cos(na) * 0.8, 0, H, cz + Math.sin(na) * 0.8, L / 2 + 0.6, 0.8, Math.atan2(-(z1 - z0), x1 - x0));
      if (k === 2) {
        // 南面：门洞两侧与门上
        const side = (L - DOOR.w) / 2;
        for (const s of [-1, 1]) {
          b.panel(side, H - 1.6, WOOD, s * (DOOR.w / 2 + side / 2), (H - 1.6) / 2 + 0.6, A, { mat: 'trDoorsDk', uvScale: [side, 1], ry: Math.PI });
          b.slab(side, 0.6, 0.3, WOOD_DK, s * (DOOR.w / 2 + side / 2), 0, A - 0.15, { mat: 'wood', col: false });
        }
        b.panel(DOOR.w, H - DOOR.h - 0.6, WOOD, 0, DOOR.h + (H - DOOR.h - 0.6) / 2, A, { mat: 'trHead', uvScale: [DOOR.w, 1], ry: Math.PI });
        continue;
      }
      b.panel(L, H - 1.6, WOOD, cx, (H - 1.6) / 2 + 0.6, cz, { mat: 'trDoorsDk', uvScale: [L, 1], ry });
      b.box(L, 0.6, 0.3, WOOD_DK, cx - Math.cos(na) * 0.15, 0.3, cz - Math.sin(na) * 0.15, { mat: 'wood', col: false, ry: Math.atan2(-(z1 - z0), x1 - x0) });
    }
    // 南墙门洞外的墙段碰撞（门洞两侧）
    {
      const L = 2 * A * Math.tan(Math.PI / 8), side = (L - DOOR.w) / 2;
      for (const s of [-1, 1]) b.collider(s * (DOOR.w / 2 + side / 2), 0, H, A + 0.8, side / 2, 0.8);
    }
    // 墙顶额枋、彩画带（一圈）
    for (let k = 0; k < 8; k++) {
      const [x0, z0] = vtx(A - 0.1, k), [x1, z1] = vtx(A - 0.1, k + 1), L = Math.hypot(x1 - x0, z1 - z0), na = (k * Math.PI) / 4;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ry = Math.atan2(-(z1 - z0), x1 - x0);
      b.box(L, 0.6, 0.35, WOOD_DK, cx, H - 0.95, cz, { ry, mat: 'trBeam', col: false, uvScale: [L, 1] });
      b.box(L, 0.7, 0.3, C.red, cx - Math.cos(na) * 0.05, H - 0.3, cz - Math.sin(na) * 0.05, { ry, mat: 'trFrieze', col: false, uvScale: [L, 1] });
    }
    // 正门：门槛、门框、两扇向内推开的大门
    b.slab(DOOR.w + 0.8, 0.22, 1.6, C.marble, 0, -0.02, A + 0.8, { mat: 'stoneSmooth', col: false });
    b.box(DOOR.w + 0.8, 0.5, 0.6, WOOD_DK, 0, DOOR.h + 0.25, A, { mat: 'wood', col: false });
    for (const s of [-1, 1]) {
      b.box(0.45, DOOR.h, 0.6, WOOD_DK, s * (DOOR.w / 2 + 0.22), DOOR.h / 2, A, { mat: 'wood', col: false });
      b.push(s * DOOR.w / 2, 0, A - 0.2, s * 1.35);
      b.box(DOOR.w / 2 - 0.1, DOOR.h - 0.2, 0.14, WOOD_DK, -s * (DOOR.w / 4), (DOOR.h - 0.2) / 2 + 0.1, 0, { mat: 'wood' });
      for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) b.sphere(0.07, C.gold, -s * (0.45 + i * 0.6), 1.2 + j * 1.2, -0.1, { mat: 'gold', seg: 6, seg2: 4 });
      b.pop();
    }
    const inner = plaqueMesh('接引大厅', 5.2, 1.6, { bg: '#1b2b33', fg: '#d8b46a', frame: '#6a4a26' });
    inner.position.set(0, DOOR.h + 1.6, A - 0.4); inner.rotation.y = Math.PI;
    b.addMesh(inner);
    // ---------- 柱列：一圈十六根深色木柱 ----------
    const ringA = A - 4.5;
    for (let k = 0; k < 16; k++) {
      const t = (k / 16) * TAU + TAU / 32, R2 = ringA / Math.cos(Math.PI / 16) * 0.98, x = Math.cos(t) * R2, z = Math.sin(t) * R2;
      if (Math.abs(x) < 2.6 && z > 0) continue;            // 正门中轴让开
      columnBase(b, x, 0, z, 0.62, { bronze: true });
      b.cyl(0.55, 0.62, H - 0.6, WOOD, x, (H - 0.6) / 2, z, { seg: 14, mat: 'wood' });
    }
    // ---------- 天花与八角藻井 ----------
    {
      const ceil = new THREE.CircleGeometry(A / K8 + 0.3, 8, Math.PI / 8);
      ceil.rotateX(Math.PI / 2);
      b.add(ceil, 0x2f4652, 'coffer', { y: H, col: false });
      for (let i = 0; i < 3; i++) {
        const r = (A * 0.42 - i * 3.2) / K8, y = H + 0.5 + i * 0.9;
        const g2 = new THREE.CylinderGeometry(r, r + 0.6, 0.9, 8, 1, true, Math.PI / 8);
        b.add(g2, i % 2 ? 0x8a3a2c : 0x2f5a5a, 'coffer', { y: y - 0.45, col: false });             // 藻井各层的围板（双面）
        const cap = new THREE.RingGeometry(Math.max(0.1, r - 3.2 / K8 + 0.3), r + 0.6, 8, 1, Math.PI / 8);
        cap.rotateX(Math.PI / 2);
        b.add(cap, 0x2a3e48, 'coffer', { y: y - 0.9, col: false });
      }
      b.add(new THREE.ConeGeometry(2.4, 1.4, 16), C.gold, 'gold', { y: H + 2.9, rx: Math.PI, col: false });      // 藻井心：倒垂的鎏金莲
    }
    // ---------- 厅心：楼层传送阵（预留）；阵北中轴两侧：东「百层」碑（碑面朝中轴）、西铜鼎 ----------
    teleportArray(b, TH_SPOTS.dais.x, 0, TH_SPOTS.dais.z, { r: 5.0 });
    {
      const S = TH_SPOTS.stele;
      b.push(S.x + 1.4, 0, S.z, -Math.PI / 2);
      b.slab(3.4, 0.6, 1.4, C.marbleShade, 0, 0, 0, { mat: 'stone' });
      b.slab(2.4, 4.6, 0.6, 0x3a4248, 0, 0.6, 0, { mat: 'stone' });
      b.slab(2.8, 0.5, 0.9, C.marble, 0, 5.2, 0, { mat: 'stoneSmooth', col: false });
      const st = plaqueMesh('通天百层', 3.6, 1.1, { bg: '#26313a', fg: '#e6c77e', frame: '#3a4248', vertical: true });
      st.position.set(0, 3.0, 0.32);
      b.addMesh(st);
      b.pop();
      // 铜鼎：石座、三足、鼎腹、口沿、双耳
      b.push(-(S.x + 1.4), 0, S.z, Math.PI / 2);
      b.slab(2.2, 0.3, 2.2, C.marbleShade, 0, 0, 0, { mat: 'stone' });
      for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + Math.PI / 2; b.cyl(0.1, 0.14, 0.75, C.bronze, Math.cos(a) * 0.5, 0.3 + 0.375, Math.sin(a) * 0.5, { seg: 8, mat: 'bronze', col: false }); }
      b.cyl(0.82, 0.62, 0.86, C.bronze, 0, 0.98 + 0.43, 0, { seg: 20, mat: 'bronze', col: false });
      b.cyl(0.9, 0.9, 0.1, C.bronze, 0, 1.89, 0, { seg: 20, mat: 'bronze', col: false });
      for (const s of [-1, 1]) b.box(0.12, 0.42, 0.34, C.bronze, s * 0.72, 2.1, 0, { mat: 'bronze', col: false });
      b.cylCollider(0, 0, 2.0, 0, 1.0);
      b.pop();
    }
    // ---------- 北面：守塔执事的案台、屏风 ----------
    {
      const z = TH_SPOTS.steward.z - 1.6;
      b.slab(5.2, 0.78, 1.3, WOOD_DK, 0, 0, z, { mat: 'wood' });
      b.slab(5.6, 0.1, 1.6, WOOD, 0, 0.78, z, { mat: 'wood', col: false });
      b.box(0.5, 0.12, 0.34, 0x3e5a72, -1.4, 0.94, z, { col: false });                 // 名册
      b.cyl(0.18, 0.22, 0.3, C.bronze, 1.6, 1.03, z, { mat: 'bronze', col: false });   // 香炉
      // 三扇屏风：屏座、深色木框、米色绢面
      const sz2 = -A + 0.9;
      b.slab(9.6, 0.35, 0.7, WOOD_DK, 0, 0, sz2, { mat: 'wood', col: false });
      for (let i = -1; i <= 1; i++) {
        const cx = i * 3.05, y0 = 0.35, h = 3.9;
        b.box(2.8, h - 0.3, 0.08, 0xd9cdb0, cx, y0 + h / 2, sz2, { mat: 'trPlaster', col: false, uvScale: [2.8, 1] });
        for (const s of [-1, 1]) b.box(0.15, h, 0.2, WOOD_DK, cx + s * 1.45, y0 + h / 2, sz2, { mat: 'wood', col: false });
        for (const y of [y0 + 0.08, y0 + h - 0.08, y0 + h * 0.3]) b.box(2.9, 0.15, 0.18, WOOD_DK, cx, y, sz2, { mat: 'wood', col: false });
        b.box(2.9, 0.06, 0.22, C.gold, cx, y0 + h + 0.03, sz2, { mat: 'gold', col: false });
      }
      const pq = plaqueMesh('守塔', 2.6, 1.0, { bg: '#1b2b33', fg: '#d8b46a', frame: '#6a4a26' });
      pq.position.set(0, 5.2, -A + 1.1);
      b.addMesh(pq);
    }
    // ---------- 宫灯八盏 ----------
    this.lampSpots = [];
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * TAU + TAU / 16, r = A - 8, x = Math.cos(t) * r, z = Math.sin(t) * r;
      hangLantern(b, x, H - 1.2, z, 2.2);
      this.lampSpots.push([x, H - 1.8, z]);
    }
    const g = b.build({ shadows: true, name: 'tower-hall', mats: this.mats });
    scene.add(g);
    this.cw.addLocal(b.cols, 0, 0, 0, 0);
    // ---------- 光：天光、宫灯点光（六盏）、厅心灵阵冷光、门口天光 ----------
    scene.add(new THREE.HemisphereLight(0xd8d0c4, 0x3a3028, 0.55));
    const key = new THREE.DirectionalLight(0xffe6c8, 0.35);
    key.position.set(10, 30, 18);
    scene.add(key);
    this.points = this.lampSpots.slice(0, 6).map(([x, y, z]) => { const p = new THREE.PointLight(0xffd6a0, 26, 30, 2); p.position.set(x, y, z); scene.add(p); return p; });
    this.daisLight = new THREE.PointLight(PORTAL_COLOR, 14, 16, 2);
    this.daisLight.position.set(TH_SPOTS.dais.x, 2.2, TH_SPOTS.dais.z);
    scene.add(this.daisLight);
    this.doorLight = new THREE.PointLight(0xfff2dc, 18, 22, 2);
    this.doorLight.position.set(0, 4.5, A - 2.5);
    scene.add(this.doorLight);
    // 门外的景色（入塔时在塔前广场拍下；拍不到时用天色）
    const backMat = this.backMat = new THREE.MeshBasicMaterial({ color: 0xcfdbe4, toneMapped: false });
    const back = this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), backMat);
    back.position.set(0, DOOR.h * 0.55, A + 7);
    back.rotation.y = Math.PI;
    back.scale.set(DOOR.w * 3.4, DOOR.h * 2.4, 1);
    scene.add(back);
    // 守塔执事
    this.steward = new NPC(scene, {
      id: 'steward', name: '守塔执事', title: '通天塔', x: 0, y: 0, z: TH_SPOTS.steward.z - 2.8, ry: 0, anim: 'ledger', prop: 'ledger', propHand: 1,
      look: { robe: 0x2c3a46, inner: 0xe4e0d6, trim: 0xa8884a, sash: 0x1e2830, hair: 0xd8d4cc, hairStyle: 'elder', pin: 0xc9a45a, scale: 1.03 },
    });
    this.tris = 0;
    g.traverse((o) => { if (o.isMesh) { const G = o.geometry; this.tris += Math.round(Math.min(G.drawRange.count, G.index ? G.index.count : G.attributes.position.count) / 3); } });
  }

  // 门外景色：在宗门场景里自塔门口向外（向南）拍一张
  captureView(renderer, surfaceScene, door, hide = []) {
    if (!this.ready) return false;
    const pr = renderer.getPixelRatio(), keep = renderer.getSize(new THREE.Vector2());
    const w = 1280, h = 720;
    try {
      renderer.setPixelRatio(1); renderer.setSize(w, h, false);
      const cam = new THREE.PerspectiveCamera(64, w / h, 0.3, 6000);
      cam.position.set(door.x, door.y + 2.2, door.z + 0.6);
      cam.lookAt(door.x, door.y + 2.6, door.z + 30);
      cam.updateMatrixWorld();
      const vis = hide.map((o) => o.visible);
      hide.forEach((o) => { o.visible = false; });
      renderer.render(surfaceScene, cam);
      hide.forEach((o, i) => { o.visible = vis[i]; });
      if (!this.backTex) { this.backTex = new THREE.FramebufferTexture(w, h); this.backTex.minFilter = this.backTex.magFilter = THREE.LinearFilter; }
      renderer.copyFramebufferToTexture(new THREE.Vector2(0, 0), this.backTex);
      this.backMat.map = this.backTex; this.backMat.color.set(0xffffff); this.backMat.needsUpdate = true;
      return true;
    } catch (e) {
      console.info('塔门外景色拍摄失败，改用天色：', e.message);
      return false;
    } finally {
      renderer.setPixelRatio(pr); renderer.setSize(keep.x, keep.y, false);
    }
  }

  // ---------- 行走与镜头 ----------
  heightAt() { return 0; }
  waterAt() { return null; }
  normalAt() { return new THREE.Vector3(0, 1, 0); }
  inCore(x, z) { return inOct(x, z, A - 0.45) || (Math.abs(x) < DOOR.w / 2 - 0.3 && z > 0 && z < A + 2.4); }
  inDoorway(x, z) { return Math.abs(x) < DOOR.w / 2 && z > A + 0.4; }
  camInside(x, y, z) {
    if (y < 0.25 || y > H - 0.4) return false;
    if (inOct(x, z, A - 0.3)) return true;
    return Math.abs(x) < DOOR.w / 2 - 0.3 && z < A + 2.6 && y < DOOR.h - 0.2;
  }
  camLimit(o, dir, d) {
    const n = Math.ceil(d / 0.2);
    for (let i = 1; i <= n; i++) {
      const s = (d * i) / n;
      if (!this.camInside(o.x + dir.x * s, o.y + dir.y * s, o.z + dir.z * s)) return Math.max(0.6, s - 0.3);
    }
    return d;
  }
  get entry() { return { x: 0, y: 0, z: A - 3.4, yaw: Math.PI }; }

  update(dt, t, player) {
    if (!this.ready) return;
    for (const [i, p] of this.points.entries()) p.intensity = 24 * (0.92 + 0.08 * Math.sin(t * (5 + i) + i * 1.7) * Math.sin(t * 2.3 + i));
    this.daisLight.intensity = 12 + 3 * Math.sin(t * 1.4);
    if (player) this.steward.update(dt, player.pos, Math.hypot(player.pos.x - this.steward.root.position.x, player.pos.z - this.steward.root.position.z) < 6);
  }
}
