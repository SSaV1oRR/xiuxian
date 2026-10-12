// 山岩（第十轮）：扫描岩壁素材（assets/mountain/mountainside_4k.blend，Poly Haven「Mountainside」，CC0；tools/convert_mountainside.py 转换）
// 实例化成成片、互相咬合的大岩体，承托宗门台地、构成外谷谷壁与山脊崖面：
//   1. 台地绝壁：沿 layout.CLIFF_RUNS 的崖线，十几到六十多米的大岩块贴着程序化岩壁（cliffs.js）外侧错落排布、彼此搭接，
//      顶端压在崖口以下（不遮台沿栏杆与挡土墙），高崖分上下两层，崖脚再叠半埋的落石岩块；
//   2. 外谷谷壁、深涧两岸、山脊崖面：按地形检出陡壁（坡度 > 48°、二十米内落差 > 14 米），岩体顺坡面朝外、按坡度后仰，按落差定大小；
//      台地、道路、台阶、建筑、桥、瀑布、龙台与秘境入口一带留空。
// 扫描网格（面朝 +Z、原点在底边中点）取四级细节（1.9 万 / 5200 / 1600 / 580 面），按「距离 / 尺寸」逐块切换；
// 阴影由最简一级的代理实例绘制（只在阴影渲染时显示）。岩块按 150 米分区合批，每区每级一个实例网格。
import * as THREE from 'three';
import { ASSETS } from './assets.js';
import { SHADOW_PROXIES } from './arch/builder.js';
import { CLIFF_RUNS, CLIFF_FEATURES, PATHS, STAIRS, SMALL_STEPS, CLEAR, PADS, SITES, DRAGON_SITES, ABYSS_GATE } from './layout.js';
import { mulberry32, clamp, smoothstep } from '../core/math.js';

const FACE_H = 10.5, FACE_W = 10.2;          // 扫描岩面的高、宽（米，缩放 1）
const Z_BACK = 3.36;                         // 扫描壳中部凹入的深度（缩放 1）
const DEPTH = 0.55;                          // 进深压扁系数
const CELL = 150;                            // 合批分区边长
const LOD_R = [10, 32, 80];                  // 距离 / 缩放：小于 10 用 1.9 万面，小于 32 用 5200 面，小于 80 用 1600 面，其余 580 面

// 岩体材质：扫描漫反射（已按宗门岩色 #92968B / #606962 调过）、法线、粗糙度；双面（扫描网格是一层壳，边缘可能露出背面）
function cragMaterial() {
  const T = ASSETS.tex;
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: T.ms_d || null, normalMap: T.ms_n || null, roughnessMap: T.ms_r || null,
    roughness: 1, metalness: 0, side: THREE.DoubleSide, normalScale: new THREE.Vector2(1, 1),
  });
  return mat;
}

// 空地检查：台地、道路、台阶、建筑、清空区、桥与瀑布周围不放岩块
function makeKeepOut(ctx) {
  const T = ctx.terrain;
  const segs = [];
  for (const p of PATHS) for (let i = 0; i < p.pts.length - 1; i++) segs.push([p.pts[i][0], p.pts[i][1], p.pts[i + 1][0], p.pts[i + 1][1], p.w / 2 + 5]);
  for (const s of STAIRS) segs.push([s.x, s.bottom[0] + 3, s.x, s.top[0] - 3, s.w / 2 + 4]);
  for (const s of SMALL_STEPS) segs.push([s.from[0], s.from[1], s.to[0], s.to[1], s.w / 2 + 4]);
  const WB = SITES.westBridge;
  segs.push([WB.x0, WB.z, WB.x1, WB.z, 9]);                    // 跨谷石桥（桥身两侧）
  segs.push([0, 124, 0, 156, 9]);                              // 山门前石桥与桥头岩颈
  const discs = CLEAR.map(([x, z, r]) => [x, z, r + 4, T.heightAt(x, z)]);
  discs.push([SITES.fall.x, SITES.fall.z, 10, 1e9], [SITES.gorgeFall.x, SITES.gorgeFall.z, 12, 1e9], [ABYSS_GATE.x, ABYSS_GATE.z, 18, 1e9]);
  for (const f of CLIFF_FEATURES) discs.push([f.at[0], f.at[1], 9, 1e9]);
  for (const k of Object.keys(DRAGON_SITES)) discs.push([DRAGON_SITES[k].x, DRAGON_SITES[k].z, 16, T.heightAt(DRAGON_SITES[k].x, DRAGON_SITES[k].z)]);
  const segD = (x, z, s) => {
    const dx = s[2] - s[0], dz = s[3] - s[1], L2 = dx * dx + dz * dz || 1e-9;
    const u = clamp(((x - s[0]) * dx + (z - s[1]) * dz) / L2, 0, 1);
    return Math.hypot(x - s[0] - dx * u, z - s[1] - dz * u);
  };
  // r：岩块的平面半径（大岩块离道路、台地更远）；rim：台地崖口以下的岩块（只避让台阶、桥、瀑布与特殊崖段，不查台地与建筑）
  const rimDiscs = [[SITES.fall.x, SITES.fall.z, 10], [SITES.gorgeFall.x, SITES.gorgeFall.z, 12], ...CLIFF_FEATURES.map((f) => [f.at[0], f.at[1], 9])];
  // 返回此处岩块顶端允许的最高高度（-Infinity 为不放）：道路、台阶、桥、瀑布、水面一带不放；
  // 清空区、台地、建筑占地一带只放顶端低于其地面 2 米的岩块（如龙台、观云台下的崖壁）
  const footY = new Map();
  return (x, z, r = 0, padMargin = 4, rim = false) => {
    if (rim) {
      for (const s of segs) if (segD(x, z, s) < s[4] * 0.6 + r) return -Infinity;
      for (const [cx, cz, cr] of rimDiscs) if (Math.hypot(x - cx, z - cz) < cr + r) return -Infinity;
      return Infinity;
    }
    for (const s of segs) if (segD(x, z, s) < s[4] + r) return -Infinity;
    let cap = Infinity;
    for (const [cx, cz, cr, gy] of discs) if (Math.hypot(x - cx, z - cz) < cr + r * 0.3) { if (gy > 1e8) return -Infinity; cap = Math.min(cap, gy - 2); }
    for (const p of PADS) {
      const d = p.r != null ? Math.hypot(x - p.cx, z - p.cz) - p.r - (p.soft || 0) * 0.5 : Math.max(p.x0 - x, x - p.x1, p.z0 - z, z - p.z1);
      if (d < 1) return -Infinity;
      if (d < padMargin + r * 0.5) cap = Math.min(cap, p.y - 2);
    }
    for (const f of ctx.footprints) {
      const c = Math.cos(f.ry || 0), sn = Math.sin(f.ry || 0), dx = x - f.x, dz = z - f.z;
      if (Math.abs(dx * c - dz * sn) < (f.w || 0) / 2 + 3 + r * 0.5 && Math.abs(dx * sn + dz * c) < (f.d || 0) / 2 + 3 + r * 0.5) {
        if (!footY.has(f)) footY.set(f, T.heightAt(f.x, f.z));
        cap = Math.min(cap, footY.get(f) - 2);
      }
    }
    const w = T.waterAt?.(x, z);
    if (w != null && r < 6) return -Infinity;
    return cap;
  };
}

export class Crags {
  constructor(ctx, { quality = 'mid' } = {}) {
    this.ctx = ctx;
    const g = ASSETS.models.mountainside;
    this.ok = !!(g && ASSETS.tex.ms_d);
    this.items = [];                 // { m: Matrix4, c: [x, y, z] 中心, s: 缩放, col }
    this.chunks = new Map();
    this.quality = quality;
    this.lodK = quality === 'low' ? 0.6 : quality === 'high' ? 1.3 : 1;      // 流畅画质提早换成简模，精美画质推远
    if (!this.ok) return;
    const geos = {};
    g.scene.traverse((o) => { if (o.isMesh) geos[o.name] = o.geometry; });
    this.geos = [geos.ms_1, geos.ms_2, geos.ms_3, geos.ms_4].map((x) => x || geos.ms_3);
    this.mat = cragMaterial();
    this.shadowMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    this.keepOut = makeKeepOut(ctx);
    this.rand = mulberry32(1010);
  }

  // 一块岩体。P：岩面竖向中点要贴住的崖面（坡面）上的点；out：崖面外法线（单位向量）；yaw、pitch：岩面朝向与后仰；s：缩放。
  // 扫描壳前后起伏约 5 米（中部凹入 3.36、两翼前凸 1.88，缩放 1），进深按 depth 压扁：
  //   正面（凹的岩湾）朝外时基准面外推，让凹进的中部大致落在崖面上；用背面（外凸的岩肩）时基准面贴着崖面，两翼插进崖里。
  place(P, out, yaw, pitch, s, { back = false, tint = 1, depth = DEPTH, proud = 0.6 } = {}) {
    const yawE = back ? yaw + Math.PI : yaw, pitchE = back ? -pitch : pitch;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitchE, yawE, 0, 'YXZ'));
    const push = proud + (back ? 0 : Z_BACK * s * depth * 0.8);
    const up = new THREE.Vector3(0, FACE_H * s * 0.5, 0).applyQuaternion(q);
    const o = new THREE.Vector3(P[0] + out[0] * push - up.x, P[1] + out[1] * push - up.y, P[2] + out[2] * push - up.z);
    const m = new THREE.Matrix4().compose(o, q, new THREE.Vector3(s, s, s * depth));
    const c = new THREE.Vector3(0, FACE_H * 0.5, 0).applyMatrix4(m);
    const h = (0.93 + 0.12 * this.rand()) * tint;
    this.items.push({ m, c: [c.x, c.y, c.z], s, col: new THREE.Color(h, h * (0.99 + 0.02 * this.rand()), h * (0.98 + 0.03 * this.rand())) });
  }

  // 1. 台地绝壁：沿崖线每隔约一块岩宽的 55–75% 放一块（相邻岩块左右搭接），主层顶端压在崖口下，高崖再加下层，崖脚叠落石
  placeCliffRuns() {
    const T = this.ctx.terrain, R = this.rand;
    let n = 0;
    for (const run of CLIFF_RUNS) {
      const cols = run._cols;
      if (!cols || !cols.length) continue;
      const L = cols[cols.length - 1].s;
      const at = (s) => cols[Math.min(cols.length - 1, Math.max(0, Math.round((s / L) * (cols.length - 1))))];
      for (let s = 6 + R() * 6; s < L - 6;) {
        const c = at(s), H = c.H;
        if (H < 9) { s += 8; continue; }
        const sc = clamp((H * (0.55 + 0.3 * R())) / FACE_H, 1.6, 6.2);
        const step = FACE_W * sc * (0.55 + 0.2 * R());
        const wall = (c.maxOff ?? 3) * 0.75;                       // 程序化岩壁面离崖线的大致距离
        const yaw = Math.atan2(c.nx, c.nz) + (R() - 0.5) * 0.45;
        const out = [c.nx, 0, c.nz];
        const topY = c.top - 1.5 - R() * 2.5;
        const P = [c.x + c.nx * wall, topY - FACE_H * sc * 0.5, c.z + c.nz * wall];
        if (this.keepOut(P[0], P[2], 0, 0, true) > -Infinity) {
          this.place(P, out, yaw, (R() - 0.5) * 0.12, sc, { back: R() < 0.4 });
          n++;
          // 下层：主层以下还有 8 米以上的崖面时，错开半块再放一块（更大），上下搭接
          const below = topY - FACE_H * sc * 0.8;
          if (below - c.foot > 8) {
            const sc2 = clamp(((below - c.foot) * (0.8 + 0.3 * R()) + 6) / FACE_H, 1.8, 6.8);
            const c2 = at(s + step * (0.35 + 0.3 * R())), w2 = (c2.maxOff ?? 3) * 0.85;
            const P2 = [c2.x + c2.nx * w2, below + 3 - FACE_H * sc2 * 0.5, c2.z + c2.nz * w2];
            if (this.keepOut(P2[0], P2[2], 0, 0, true) > -Infinity) {
              this.place(P2, [c2.nx, 0, c2.nz], Math.atan2(c2.nx, c2.nz) + (R() - 0.5) * 0.5, (R() - 0.3) * 0.16, sc2, { back: R() < 0.5, tint: 0.96 });
              n++;
            }
          }
          // 崖脚：半埋的大落石（外凸的背面朝上、大角度后仰，压住岩壁与谷底的交线）
          if (R() < 0.55) {
            const c3 = at(s + (R() - 0.5) * step), sc3 = clamp(sc * (0.32 + 0.22 * R()), 1.1, 3.0), o3 = (c3.maxOff ?? 3) + sc3 * 3.5;
            const fx = c3.x + c3.nx * o3, fz = c3.z + c3.nz * o3;
            if (this.keepOut(fx, fz, 0, 0, true) > -Infinity) {
              this.place([fx, T.heightAt(fx, fz) + FACE_H * sc3 * 0.08, fz], [0, 1, 0], Math.atan2(c3.nx, c3.nz) + (R() - 0.5) * 2, 0.9 + R() * 0.4, sc3, { back: true, tint: 0.93, depth: 0.7, proud: 0 });
              n++;
            }
          }
        }
        s += step;
      }
    }
    return n;
  }

  // 2. 外谷谷壁、深涧两岸、山脊崖面：按陡度与落差检出，泊松式间距（按岩块大小）
  placeSlopes({ x0 = -330, x1 = 330, z0 = -300, z1 = 340, step = 9 } = {}) {
    const T = this.ctx.terrain, R = this.rand;
    const hard = PADS.filter((p) => p.soft == null);
    const nearPadAbove = (x, z) => {
      const y = T.heightAt(x, z);
      for (const p of hard) {
        const d = Math.max(p.x0 - x, x - p.x1, p.z0 - z, z - p.z1);
        if (d > 0 && d < 30 && p.y - y > 3) return p;
      }
      return null;
    };
    const placed = [];
    const cand = [];
    for (let z = z0; z <= z1; z += step) for (let x = x0; x <= x1; x += step) {
      const px = x + (R() - 0.5) * step * 0.8, pz = z + (R() - 0.5) * step * 0.8;
      if (T.cliffMaskAt?.(px, pz) > 0) continue;                       // 台地绝壁由 placeCliffRuns 负责
      const e = 4;
      const gx = (T.heightAt(px + e, pz) - T.heightAt(px - e, pz)) / (2 * e), gz = (T.heightAt(px, pz + e) - T.heightAt(px, pz - e)) / (2 * e);
      const sl = Math.hypot(gx, gz);
      // 约 48° 以下不放；台地填方一侧的护坡（台沿外 30 米内、低于台面 3 米以上，约 37° 起）也放——上部各院的台地同样坐在岩体上
      const pad = sl >= 0.75 && sl < 1.1 ? nearPadAbove(px, pz) : null;
      if (sl < 1.1 && !pad) continue;
      const dx = -gx / sl, dz = -gz / sl;                                // 下坡方向（岩面朝向）
      // 落差：上坡 12 米与下坡 12 米的高差
      const relief = T.heightAt(px - dx * 12, pz - dz * 12) - T.heightAt(px + dx * 12, pz + dz * 12);
      if (relief < (pad ? 6 : 10)) continue;
      cand.push({ x: px, z: pz, dx, dz, sl, relief, y: T.heightAt(px, pz), up: T.heightAt(px - dx * 12, pz - dz * 12) });
    }
    cand.sort((a, b) => b.relief - a.relief);                          // 落差大的先放（大岩块优先占位）
    for (const c of cand) {
      // 岩块顶端不高过上坡 12 米处的地面 2 米（不顶出崖口、不挡上面的路与台地），也不高过附近台地、龙台、建筑的地面 2 米：按此限制大小
      const cap = this.keepOut(c.x, c.z, 6, 3, false);
      const sMax = (Math.min(c.up + 2, cap) - c.y) * 2 / FACE_H;
      if (!(sMax >= 1.2)) continue;
      let sc = clamp((c.relief * (0.55 + 0.35 * R())) / FACE_H, 1.2, Math.min(7.0, sMax));
      // 按实际大小复查（大岩块离路、台更远）
      const cap2 = this.keepOut(c.x, c.z, FACE_W * sc * 0.3, 3, false);
      if (cap2 === -Infinity) continue;
      sc = Math.min(sc, (Math.min(c.up + 2, cap2) - c.y) * 2 / FACE_H);
      if (sc < 1.2) continue;
      const rad = FACE_W * sc * 0.5;
      let ok = true;
      // 间距按三维距离（同一面高崖上下两块可以叠放）
      for (const p of placed) if (Math.hypot(p.x - c.x, (p.y - c.y) * 0.9, p.z - c.z) < (p.rad + rad) * 0.52) { ok = false; break; }
      if (!ok) continue;
      // 坡度越缓后仰越多（岩面贴着坡面）
      const ang = Math.atan(c.sl), pitch = clamp((Math.PI / 2 - ang) * 0.85, 0, 0.75) + (R() - 0.5) * 0.1;
      const out = [c.dx * Math.sin(ang), Math.cos(ang), c.dz * Math.sin(ang)];
      this.place([c.x, c.y, c.z], out, Math.atan2(c.dx, c.dz) + (R() - 0.5) * 0.4, pitch, sc, { back: R() < 0.35, tint: 0.9 + 0.1 * R(), proud: 0.4 + R() * 0.8 });
      placed.push({ x: c.x, y: c.y, z: c.z, rad });
    }
    return placed.length;
  }

  build(scene) {
    if (!this.ok) return { count: 0 };
    const n1 = this.placeCliffRuns();
    const n2 = this.placeSlopes();
    // 分区
    for (const it of this.items) {
      const key = `${Math.floor(it.c[0] / CELL)},${Math.floor(it.c[2] / CELL)}`;
      let ch = this.chunks.get(key);
      if (!ch) { ch = { items: [] }; this.chunks.set(key, ch); }
      ch.items.push(it);
    }
    const sphere = new THREE.Sphere();
    for (const ch of this.chunks.values()) {
      const N = ch.items.length;
      ch.meshes = this.geos.map((geo, lod) => {
        const m = new THREE.InstancedMesh(geo, this.mat, N);
        m.count = 0; m.castShadow = false; m.receiveShadow = true; m.frustumCulled = true;
        m.name = 'crags-lod' + lod;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.setColorAt(0, new THREE.Color(1, 1, 1));
        m.instanceColor.setUsage(THREE.DynamicDrawUsage);
        scene.add(m);
        return m;
      });
      // 阴影代理：最简一级、全部实例，只在阴影渲染时显示
      const px = new THREE.InstancedMesh(this.geos[3], this.shadowMat, N);
      ch.items.forEach((it, i) => px.setMatrixAt(i, it.m));
      px.castShadow = true; px.receiveShadow = false; px.visible = false; px.name = 'crags-shadow';
      scene.add(px); SHADOW_PROXIES.push(px);
      // 包围球：按全部实例的中心与尺寸
      const pts = ch.items.map((it) => new THREE.Vector3(...it.c));
      sphere.setFromPoints(pts);
      sphere.radius += Math.max(...ch.items.map((it) => it.s)) * FACE_W * 0.8;
      for (const m of [...ch.meshes, px]) { m.boundingSphere = sphere.clone(); }
      ch.lod = new Int8Array(N).fill(-1);
    }
    this.count = this.items.length;
    this.lastPos = new THREE.Vector3(1e9, 0, 0);
    this.tris = 0;
    return { count: this.count, cliff: n1, slope: n2, chunks: this.chunks.size };
  }

  // 碰撞：岩块大多在 46° 以上的陡坡、崖面上（角色本就走不上去），只给伸进可走地面的岩块加挡——
  // 在岩块包围盒内按 2 米取样，可走（坡度 < 46°）且地面以上 1 米落在岩体内（扫描壳的内收包围盒）的点，
  // 按岩块朝向取外接矩形，外扩 0.6 米，立一个不挡镜头的长方体
  addColliders(cw) {
    if (!this.ok) return 0;
    const T = this.ctx.terrain, inv = new THREE.Matrix4(), p = new THREE.Vector3(), nrm = new THREE.Vector3();
    let n = 0;
    for (const it of this.items) {
      inv.copy(it.m).invert();
      let ax = Infinity, bx = -Infinity, az = Infinity, bz = -Infinity;
      for (const cx of [-5.1, 5.1]) for (const cy of [0, FACE_H]) for (const cz of [-3.4, 1.9]) {
        p.set(cx, cy, cz).applyMatrix4(it.m);
        ax = Math.min(ax, p.x); bx = Math.max(bx, p.x); az = Math.min(az, p.z); bz = Math.max(bz, p.z);
      }
      const e = it.m.elements, yaw = Math.atan2(e[8], e[10]), c = Math.cos(yaw), sn = Math.sin(yaw), ox = e[12], oz = e[14];
      let l0 = Infinity, l1 = -Infinity, m0 = Infinity, m1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let x = ax; x <= bx; x += 2) for (let z = az; z <= bz; z += 2) {
        if (!T.inCore(x, z, 2)) continue;
        if (T.normalAt(x, z, nrm).y < 0.69) continue;
        const g = T.heightAt(x, z);
        p.set(x, g + 1, z).applyMatrix4(inv);
        if (p.x < -4.4 || p.x > 4.4 || p.y < 0.2 || p.y > FACE_H - 0.3 || p.z < -2.6 || p.z > 1.0) continue;
        const dx = x - ox, dz = z - oz, lx = dx * c - dz * sn, lz = dx * sn + dz * c;
        l0 = Math.min(l0, lx); l1 = Math.max(l1, lx); m0 = Math.min(m0, lz); m1 = Math.max(m1, lz); y0 = Math.min(y0, g); y1 = Math.max(y1, g);
      }
      if (l0 > l1) continue;
      const mx = (l0 + l1) / 2, mz = (m0 + m1) / 2;
      cw.addBox({ x: ox + mx * c + mz * sn, z: oz - mx * sn + mz * c, y0: y0 - 1, y1: y1 + 3, hx: (l1 - l0) / 2 + 1.6, hz: (m1 - m0) / 2 + 1.6, ry: yaw, walk: false, cam: false });
      n++;
    }
    return n;
  }

  // 每帧：镜头移动超过 3 米时重新分配细节等级
  update(camPos, force = false) {
    if (!this.ok || !this.chunks.size) return;
    if (!force && camPos.distanceToSquared(this.lastPos) < 9) return;
    this.lastPos.copy(camPos);
    let tris = 0;
    const triN = this.geos.map((g) => (g.index ? g.index.count : g.attributes.position.count) / 3);
    for (const ch of this.chunks.values()) {
      const cnt = [0, 0, 0, 0];
      for (const it of ch.items) {
        const d = Math.hypot(it.c[0] - camPos.x, it.c[1] - camPos.y, it.c[2] - camPos.z) / it.s;
        const lk = this.lodK, lod = d < LOD_R[0] * lk ? 0 : d < LOD_R[1] * lk ? 1 : d < LOD_R[2] * lk ? 2 : 3;
        const m = ch.meshes[lod], k = cnt[lod]++;
        m.setMatrixAt(k, it.m); m.setColorAt(k, it.col);
      }
      ch.meshes.forEach((m, lod) => {
        m.count = cnt[lod]; m.visible = cnt[lod] > 0;
        m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
        tris += cnt[lod] * triN[lod];
      });
    }
    this.tris = tris;
  }
}
