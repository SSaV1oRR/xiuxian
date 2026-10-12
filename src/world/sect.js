// 宗门场景装配：挡土墙、中轴台阶、山门接引台、演武广场（回廊、钟鼓楼）、凌云阁高台；其余院落见 sect2.js
import * as THREE from 'three';
import { Builder, C } from './arch/builder.js';
import { rail, stairs, stoneBridge, burner, rockery, lion, pavilion } from './arch/arch.js';
import { gatePailou, house, yardWall, colonnade, drumTower, pavilionTower, sumeruWall, climbCorridor } from './arch/buildings.js';
import * as P from './arch/props.js';
import { PADS, NO_WALL, NO_RAIL, STAIRS, SMALL_STEPS, SITES, PLINTH, SWITCHBACK, corridorPlan } from './layout.js';
import { stairInfo, roadY } from './terrain.js';
import { mulberry32 } from '../core/math.js';
import { GLOBAL, FOGU, injectFog } from './shaderlib.js';
import { buildDorms, buildDining, buildAlchemy, buildField, buildPondArea, buildCourt3, buildSummit, buildBamboo, buildBackhill, buildTerraces } from './sect2.js';
import { QiVortex } from './qi.js';
import { placeLion, placeCenser, addPalaceLantern, buildPalaceLanterns } from './models.js';
import { buildDragonTerraces } from './dragons.js';
import { archBridge } from './arch/bridges.js';
import { banner } from './arch/halls.js';
import { gateComplex8, medallionTexture, turtleStele, registerPavilion, teaPavilion } from './arch/gate8.js';
import { colonnade8, lingyunHall, bellDrumPavilion, bronzeLamp, reliefTexture, plazaGate9 } from './arch/plaza8.js';
import { placeBuilding } from './buildings10.js';
import { ASSETS } from './assets.js';
import { jadePillar } from './arch/ornaments.js';
import { buildAbyssGate } from './abyssgate.js';

// ---------- 场景上下文 ----------
export class SectContext {
  constructor(scene, cw, terrain) {
    this.scene = scene; this.cw = cw; this.terrain = terrain;
    this.fadeables = new Map();     // id → { u, target, name }
    this.emitters = [];
    this.lights = [];               // 第十三轮：夜间照明的光源锚点（世界坐标），见 nightLights.js
    this.sway = [];
    this.footprints = [];           // 舆图用：{ x, z, w, d, ry, kind, name }
    this.anchors = {};              // 互动锚点
    this.boards = {};               // 可重绘的贴图板（告示、导览）
    this.groups = {};
    this.rand = mulberry32(2024);
  }
  // 把 Builder 放到世界中
  place(b, { x = 0, y = 0, z = 0, ry = 0, id = null, fade = false, name = '', shadows = true, foot = null } = {}) {
    // 流畅画质：只有主要建筑投影，小品、台阶与挡墙不投影（减少阴影绘制）
    if (this.lowShadows && !fade) shadows = false;
    const g = b.build({ fade, name: name || id || '', shadows });
    g.position.set(x, y, z);
    g.rotation.y = ry;
    this.scene.add(g);
    const cols = this.cw.addLocal(b.cols, x, y, z, ry, fade ? id : null);
    if (id) (this.colliders ||= {})[id] = cols;
    const c = Math.cos(ry), s = Math.sin(ry);
    for (const e of b.emitters) (e.kind === 'light' ? this.lights : this.emitters).push({ ...e, x: x + e.x * c + e.z * s, y: y + e.y, z: z - e.x * s + e.z * c });
    g.traverse((o) => { if (o.userData.sway) this.sway.push(o); });
    if (fade && id) this.fadeables.set(id, { u: g.userData.fade, target: 1, cur: 1, name });
    if (foot) this.footprints.push({ x, z, ry, ...foot });
    if (id) this.groups[id] = g;
    return g;
  }
  ground(x, z) { return this.terrain.heightAt(x, z); }
}

// ---------- 挡土墙 ----------
function stepFootprints() {
  const out = [];
  for (const s of STAIRS) {
    const info = stairInfo(s);
    out.push({ x0: s.x - s.w / 2 - 0.75, x1: s.x + s.w / 2 + 0.75, z0: info.zt - 0.3, z1: info.zb + 0.3 });
  }
  for (const s of SMALL_STEPS) {
    const [ax, az] = s.from, [bx, bz] = s.to;
    const hw = s.w / 2 + 0.45;
    out.push({ x0: Math.min(ax, bx) - (ax === bx ? hw : 0.1), x1: Math.max(ax, bx) + (ax === bx ? hw : 0.1), z0: Math.min(az, bz) - (az === bz ? hw : 0.1), z1: Math.max(az, bz) + (az === bz ? hw : 0.1) });
  }
  // 丹殿南门外折返石阶的顶部平台
  out.push({ x0: SWITCHBACK.x0, x1: SWITCHBACK.x0 + SWITCHBACK.topLen, z0: -0.5, z1: SWITCHBACK.z0 + SWITCHBACK.lane });
  return out;
}

function buildWalls(ctx) {
  const T = ctx.terrain, b = new Builder();
  const fps = stepFootprints();
  const noWall = (p, side, u) => NO_WALL.some(([id, s, a, c]) => id === p.id && s === side && u >= a && u <= c);
  const railCut = (p, side, a, c) => {
    let segs = [[a, c]];
    for (const [id, s, ga, gc] of NO_RAIL) if (id === p.id && s === side) segs = segs.flatMap(([q, r]) => (gc <= q || ga >= r ? [[q, r]] : [[q, Math.max(q, ga)], [Math.min(r, gc), r]].filter(([u, v]) => v - u > 0.5)));
    return segs;
  };
  for (const p of PADS) {
    if (p.soft != null) continue;
    for (const side of ['n', 's', 'e', 'w']) {
      const alongX = side === 'n' || side === 's';
      const lo = alongX ? p.x0 : p.z0, hi = alongX ? p.x1 : p.z1;
      const e = side === 's' ? p.z1 : side === 'n' ? p.z0 : side === 'e' ? p.x1 : p.x0;
      const out = side === 's' || side === 'e' ? 1 : -1;
      const P2 = (u) => (alongX ? [u, e + out] : [e + out, u]);
      const cells = [];
      for (let u = lo - 1; u < hi + 1; u++) {
        const [ax, az] = P2(u), [bx, bz] = P2(u + 1), [mx, mz] = P2(u + 0.5);
        const hA = T.heightAt(ax, az), hB = T.heightAt(bx, bz);
        const p2 = T.padAt(mx, mz);
        let type = null;
        if (p2 && p2 !== p && p2.y >= p.y - 0.05) type = null;
        else if (noWall(p, side, u + 0.5)) type = null;
        else if (p.y - Math.min(hA, hB) > 0.3) type = 'fill';
        else if (Math.max(hA, hB) - p.y > 0.3) type = 'cut';
        cells.push({ u, type, lo: Math.min(hA, hB), hi: Math.max(hA, hB) });
      }
      // 合并成段并按台阶开口裁切
      let i = 0;
      while (i < cells.length) {
        if (!cells[i].type) { i++; continue; }
        let j = i;
        while (j + 1 < cells.length && cells[j + 1].type === cells[i].type) j++;
        const type = cells[i].type, run = cells.slice(i, j + 1);
        let segs = [[cells[i].u, cells[j].u + 1]];
        const ca = Math.min(e, e + out), cb = Math.max(e, e + out);
        for (const f of fps) {
          const fa = alongX ? f.x0 : f.z0, fb = alongX ? f.x1 : f.z1, ga = alongX ? f.z0 : f.x0, gb = alongX ? f.z1 : f.x1;
          if (gb < ca - 0.05 || ga > cb + 0.05) continue;
          segs = segs.flatMap(([a, c]) => (fb <= a || fa >= c ? [[a, c]] : [[a, Math.max(a, fa)], [Math.min(c, fb), c]].filter(([q, r]) => r - q > 0.2)));
        }
        for (const [a, c] of segs) {
          const inRun = run.filter((q) => q.u + 1 > a && q.u < c);
          const L = c - a, mid = (a + c) / 2, cc = e + out * 0.5;
          const cx = alongX ? mid : cc, cz = alongX ? cc : mid;
          const sx = alongX ? L : 1.06, sz = alongX ? 1.06 : L;
          // 外壁附件：沿墙外侧的条带 / 扶壁（本地 u 沿墙，off 为离开台地边线的距离）
          const face = (u, off, len, y0, h, dep, col, mat = 'stone') => {
            const px = alongX ? u : e + out * off, pz = alongX ? e + out * off : u;
            b.slab(alongX ? len : dep, h, alongX ? dep : len, col, px, y0, pz, { mat, col: false });
          };
          if (type === 'fill') {
            const lo0 = Math.min(...inRun.map((q) => q.lo)), low = lo0 - 0.9, drop = p.y - lo0;
            const big = drop > 2.6, wallC = big ? C.stoneGrey : C.stone;
            b.slab(sx, p.y - 0.02 - low, sz, wallC, cx, low, cz, { mat: 'stone' });
            const ox = alongX ? 0 : out * 0.08, oz = alongX ? out * 0.08 : 0;
            b.slab(alongX ? L + 0.1 : 1.26, 0.2, alongX ? 1.26 : L + 0.1, big ? C.marbleWarm : C.stoneWarm, cx + ox, p.y - 0.04, cz + oz, { mat: 'stoneSmooth' });
            if (big) {
              // 勒脚、腰线与扶壁：高墙分出段落，不再是一整片平墙
              face(mid, 1.16, L, low, 0.9 + 0.7, 0.26, C.stoneDark);
              face(mid, 1.1, L, p.y - 0.62, 0.16, 0.14, C.stoneWarm, 'stoneSmooth');
              const m = Math.max(1, Math.round(L / 6.2));
              for (let k = 0; k <= m; k++) {
                const u = a + 0.35 + (k * (L - 0.7)) / m;
                face(u, 1.2, 0.72, low, p.y - 0.62 - low, 0.34, wallC);
              }
            }
            if (drop > 1.35) for (const [ra, rc] of railCut(p, side, a + 0.15, c - 0.15)) {
              const r0 = alongX ? [ra, cc] : [cc, ra], r1 = alongX ? [rc, cc] : [cc, rc];
              rail(b, [r0, r1], p.y + 0.16, { h: 0.82, color: big ? C.marbleWarm : C.stoneWarm, spacing: 1.9 });
            }
          } else {
            // 挖方墙：分段顶面随坡
            const n = Math.max(1, Math.round(L / 3.2));
            for (let k = 0; k < n; k++) {
              const qa = a + (k * L) / n, qb = a + ((k + 1) * L) / n;
              const sub = inRun.filter((q) => q.u + 1 > qa && q.u < qb);
              const topY = Math.max(p.y + 0.6, Math.max(...sub.map((q) => q.hi)) + 0.3);
              const qm = (qa + qb) / 2, ql = qb - qa;
              const tall = topY - p.y > 2.4;
              b.slab(alongX ? ql + 0.02 : 1.06, topY - (p.y - 0.4), alongX ? 1.06 : ql + 0.02, tall ? C.stoneGrey : C.stone, alongX ? qm : cc, p.y - 0.4, alongX ? cc : qm, { mat: 'stone' });
              b.slab(alongX ? ql + 0.06 : 1.16, 0.16, alongX ? 1.16 : ql + 0.06, C.stoneWarm, alongX ? qm : cc, topY, alongX ? cc : qm, { mat: 'stoneSmooth', col: false });
              // 挖方墙脚：朝台地一侧的深色勒脚
              if (tall) face(qm, -0.1, ql, p.y - 0.3, 0.75, 0.22, C.stoneDark);
            }
          }
        }
        i = j + 1;
      }
    }
  }
  ctx.place(b, { name: 'walls' });
}

// 沿坡的长方体（沿 z 方向，从 (y0,z0) 到 (y1,z1)）
function slopeBox(b, x, y0, z0, y1, z1, w, h, color, mat = 'stoneSmooth') {
  const dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dy, dz);
  b.box(w, h, L, color, x, (y0 + y1) / 2, (z0 + z1) / 2, { rx: Math.atan2(-dy, dz), mat, col: false });
}
function slopeRail(b, x, z0, y0, z1, y1, { h = 0.82, spacing = 1.7, color = C.stoneWarm } = {}) {
  const L = Math.abs(z1 - z0), n = Math.max(1, Math.round(L / spacing));
  for (let k = 0; k <= n; k++) {
    const u = k / n, z = z0 + (z1 - z0) * u, y = y0 + (y1 - y0) * u;
    b.slab(0.22, h + 0.24, 0.22, color, x, y - 0.12, z, { mat: 'stoneSmooth', col: false });
    b.sphere(0.12, color, x, y + h + 0.17, z, { mat: 'stoneSmooth', seg: 8, seg2: 6 });
  }
  slopeBox(b, x, y0 + h - 0.04, z0, y1 + h - 0.04, z1, 0.15, 0.12, color);
  slopeBox(b, x, y0 + 0.12, z0, y1 + 0.12, z1, 0.17, 0.14, color);
  slopeBox(b, x, y0 + h * 0.46, z0, y1 + h * 0.46, z1, 0.07, h * 0.5, color);
}

// 中轴大台阶：嵌入山坡（两侧垂带、栏杆、中间平台）；free 为凸出于台面的独立踏道（踏步与象眼实砌到底）
function grandStairs(b, st) {
  const info = stairInfo(st), hw = st.w / 2, cw = 0.6, free = !!st.free, floor = info.yb - 0.06;
  const stepC = free ? C.marble : C.stone, cheekC = free ? C.marbleShade : C.stoneDark, capC = free ? C.marble : C.stoneWarm, railC = free ? C.marble : C.stoneWarm;
  const riserC = new THREE.Color(stepC).multiplyScalar(free ? 0.8 : 0.7).getHex();
  for (const f of info.flights) {
    for (let k = 0; k < f.n; k++) {
      const z0 = f.z0 - k * f.run, z1 = z0 - f.run, top = f.y0 + (k + 1) * f.sh, bot = free ? floor : top - 1.7;
      b.slab(st.w, top - bot, f.run + 0.025, stepC, st.x, bot, (z0 + z1) / 2, { mat: 'stoneSmooth', jitter: 0.07 });
      b.box(st.w + 0.02, 0.035, 0.05, capC, st.x, top - 0.02, z0 - 0.02, { mat: 'stoneSmooth', col: false });   // 踏步前沿
      b.box(st.w - 0.02, f.sh * 0.86, 0.014, riserC, st.x, top - f.sh * 0.5 - 0.02, z0 + 0.02, { mat: 'stoneSmooth', col: false, jitter: 0.05 });   // 踢面略暗：远看一级级分明
      for (const s of [-1, 1]) b.slab(cw, top + 0.22 - bot, f.run + 0.02, cheekC, st.x + s * (hw + cw / 2), bot, (z0 + z1) / 2, { mat: free ? 'stoneSmooth' : 'stone', col: false });
    }
    for (const s of [-1, 1]) {
      const cx = st.x + s * (hw + cw / 2);
      slopeBox(b, cx, f.y0 + 0.3, f.z0 + 0.1, f.y1 + 0.3, f.z1, cw + 0.06, 0.2, capC);
      b.collider(cx, free ? floor : f.y0 - 1.5, f.y1 + 1.3, (f.z0 + f.z1) / 2, cw / 2, (f.z0 - f.z1) / 2, 0, { walk: false, cam: false });
      if (st.rail) slopeRail(b, cx, f.z0 + 0.2, f.y0 + 0.4, f.z1, f.y1 + 0.4, { color: railC });
    }
    if (st.center) {
      // 御路石：云纹浮雕
      slopeBox(b, st.x, f.y0 + 0.1, f.z0, f.y1 + 0.1, f.z1, 1.7, 0.16, C.marbleWarm);
      const n = Math.round((f.z0 - f.z1) / 1.3);
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n, z = f.z0 + (f.z1 - f.z0) * u, y = f.y0 + (f.y1 - f.y0) * u + 0.2;
        b.sphere(0.32, C.marble, st.x + (k % 2 ? 0.3 : -0.3), y, z, { mat: 'stoneSmooth', sy: 0.25, sx: 1.4, seg: 8, seg2: 4 });
        b.sphere(0.22, C.marble, st.x + (k % 2 ? -0.35 : 0.35), y, z - 0.35, { mat: 'stoneSmooth', sy: 0.22, sx: 1.2, seg: 8, seg2: 4 });
      }
    }
  }
  for (const l of info.landings) {
    b.slab(st.w + 2 * cw, 1.7, l.z0 - l.z1 + 0.04, C.stone, st.x, l.y - 1.7, (l.z0 + l.z1) / 2, { mat: 'stoneSmooth' });
    for (const s of [-1, 1]) {
      const cx = st.x + s * (hw + cw / 2);
      b.slab(cw + 0.06, 0.2, l.z0 - l.z1, capC, cx, l.y + 0.2, (l.z0 + l.z1) / 2, { mat: 'stoneSmooth', col: false });
      if (st.rail) rail(b, [[cx, l.z0], [cx, l.z1]], l.y + 0.4, { h: 0.82, color: railC, spacing: 1.5 });
      b.collider(cx, l.y - 1, l.y + 1.3, (l.z0 + l.z1) / 2, cw / 2, (l.z0 - l.z1) / 2, 0, { walk: false, cam: false });
    }
  }
  return info;
}

function smallSteps(b, ss) {
  const [hx, hz, hy] = ss.from, [lx, lz, ly] = ss.to;
  const dx = hx - lx, dz = hz - lz, L = Math.hypot(dx, dz), ry = Math.atan2(-dx, -dz);
  const rise = hy - ly, n = Math.max(1, Math.round(rise / (ss.rough ? 0.2 : 0.22)));
  b.push(lx, ly, lz, ry);
  stairs(b, 0, 0, 0, ss.w, rise, { run: L / n, stepH: rise / n, color: ss.rough ? 0x9a958a : C.stone, cheeks: !ss.rough, base: -0.6, cheekW: 0.3 });
  b.pop();
}

function buildInfrastructure(ctx) {
  const b = new Builder();
  const infos = {};
  for (const st of STAIRS) {
    if (st.corridor) continue;
    infos[st.id] = grandStairs(b, st);
  }
  for (const ss of SMALL_STEPS) smallSteps(b, ss);
  ctx.place(b, { name: 'stairs' });
  ctx.stairInfos = infos;
  // 天阶中途平台：石灯与歇脚石凳
  const d = new Builder();
  for (const l of infos.s4?.landings || []) {
    for (const s of [-1, 1]) P.stoneLantern(d, s * 4.3, l.y, (l.z0 + l.z1) / 2, 0.95);
  }
  for (const l of infos.s1?.landings || []) for (const s of [-1, 1]) P.stoneLantern(d, s * 4.6, l.y, (l.z0 + l.z1) / 2 - 0.6, 0.9);
  ctx.place(d, { name: 'stair-lanterns' });
  // 叠落廊（爬山廊）：问心阶、天阶两侧
  for (const st of STAIRS) {
    if (!st.corridor) continue;
    const [zb, yb] = st.bottom, [zt, yt] = st.top, L = zb - zt;
    const cb = new Builder();
    climbCorridor(cb, corridorPlan(st), { w: st.w });
    ctx.place(cb, { x: st.x, y: yb, z: zb, ry: 0, id: st.id, fade: true, name: st.name, foot: { w: st.w, d: L, kind: 'house' } });
    ctx.footprints[ctx.footprints.length - 1].z = (zb + zt) / 2;
  }
  // 溪上石拱桥（山门外石道）
  // 山门前深涧上的单孔石拱桥（桥面与石道同高，拱跨溪涧）
  const br = new Builder(), T = ctx.terrain, BZ = SITES.bridge.z;
  const sx = T.stream.line.nearest(SITES.bridge.x, BZ);
  // 第十轮：涧深三十余米，拱券加大（跨 15.5 米、矢高 7 米），拱脚以下的桥墩砌到两岸陡壁上
  archBridge(br, { len: SITES.bridge.s - SITES.bridge.n + 2.4, w: 5.6, ground: (u) => T.heightAt(SITES.bridge.x, BZ + u) + 2.5,
    arches: [{ c: (T.stream.line.at(sx.s).z ?? BZ) - BZ, span: 15.5, rise: 7.0 }] });
  ctx.place(br, { x: SITES.bridge.x, y: -2.5, z: BZ, ry: -Math.PI / 2, name: 'bridge', foot: { w: 5.6, d: 19, kind: 'bridge' } });
  // 桥头：门前石阶脚下到石桥之间的岩颈，两侧临崖，砌一道汉白玉栏杆（望柱头石灯）
  const nk = new Builder(), z0 = 125.9, z1 = 130.4;
  for (const s of [-1, 1]) {
    const x = s * 4.9, y0 = T.heightAt(x, (z0 + z1) / 2);
    nk.slab(0.7, y0 - (y0 - 1.2) + 0.12, z1 - z0 + 0.4, C.stoneGrey, x, y0 - 1.2, (z0 + z1) / 2, { mat: 'stone', col: false });
    rail(nk, [[x, z0], [x, z1]], y0 + 0.1, { h: 0.85, color: C.marble, spacing: 1.5, post: 0.2 });
    P.stoneLantern(nk, x, y0 + 0.1, z0 - 0.2, 0.8);
  }
  ctx.place(nk, { name: '桥头栏杆' });
  // 第十轮：石桥以南的石道山脊两侧是陡崖，沿脊背边缘设一道看不见的挡（与地形里的山脊同一条中线、同样宽窄），不让人走下崖去
  {
    const sp = new Builder(), N = T.noise;
    for (let z = SITES.bridge.s + 0.2; z < 178.5; z += 1.6) {
      const xc = -3 * Math.sin(z / 37), sh = 10 + 3.5 * N(z / 23, 2.3) - 0.6, y = roadY(z);
      for (const s of [-1, 1]) sp.collider(xc + s * sh, y - 4, y + 3, z, 0.25, 0.95, 0, { walk: false, cam: false });
    }
    ctx.place(sp, { name: '石道山脊边挡' });
  }
}

// ---------- 山门与接引院（第八轮，依「山门修正版」三视图）----------
// 门前：前庭（三面临崖的岩台）上一对高座石狮、一对石灯、两杆宗旗；门楼三间中高边低、两侧双层阙楼（gate8.js）。
// 门后接引院：中轴白石甬道（三块团纹石）、东西侧廊、西北登记亭、东北茶亭、甬道东侧龟趺宗门碑、四角花木与湖石。
function buildTier1(ctx) {
  const G = SITES.gate, y = G.y;
  const g = new Builder();
  // 第十轮：两侧阙楼的楼基之上改立素材模型的三层望楼（Et，缩到 0.44，与钟鼓楼同式而小一号）
  const qt = !!ASSETS.models.buildings;
  const gi = gateComplex8(g, { front: '青岚宗', back: '問道', towers: !qt });
  ctx.place(g, { ...G, id: 'gate', fade: true, name: '山门', foot: { w: 2 * (gi.towerX + gi.towerW / 2), d: 8, kind: 'gate', label: '山门' } });
  if (qt) for (const s of [-1, 1]) placeBuilding(ctx, 'Et', { x: G.x + s * gi.towerX, y: G.y + gi.towerBase, z: G.z, s: 0.44, id: s < 0 ? 'gateTowerW' : 'gateTowerE', name: '阙楼' });
  for (const [lx, ly, lz] of gi.lanterns) addPalaceLantern(ctx, G.x + lx, G.y + ly, G.z + lz, 1.1);
  // 门前：石狮（高须弥座，狮身与座高相称）、石灯、宗旗
  const d = new Builder();
  placeLion(ctx, d, -7.6, 0.6, 108.6, 0, 2.9, false, 0.95);
  placeLion(ctx, d, 7.6, 0.6, 108.6, 0, 2.9, true, 0.95);
  for (const s of [-1, 1]) {
    P.stoneLantern(d, s * 11.4, 0.6, 108.9, 1.15);
    flagMast(d, s * 14.2, 0.6, 112.2, s);
    P.stoneLantern(d, s * 4.4, y, 92.6, 1.0);
    P.stoneLantern(d, s * 4.4, y, 78.6, 1.0);
  }
  P.registerDesk(d, 3.6, y, 92.4, -0.25);
  P.broom(d, 2.2, y, 93.6, 0.4);
  ctx.place(d, { name: 'tier1-props' });
  // 中轴甬道上的团纹石（卷云、莲花、卷云）
  for (const [k, z] of [[0, 91.4], [1, 85.0], [0, 78.6]]) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1.3, 48), new THREE.MeshStandardMaterial({ map: medallionTexture(k), roughness: 0.78 }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, y + 0.015, z); m.receiveShadow = true; m.name = 'medallion';
    ctx.scene.add(m);
  }
  // 院墙：阙楼外侧到台沿，东西台沿
  const w = new Builder();
  const tOut = gi.towerX + gi.towerW / 2;
  for (const s of [-1, 1]) yardWall(w, s * tOut, 102.4, s * 25.4, 102.4, { h: 2.6, color: 0xe8e2d4 });
  yardWall(w, -25.4, 102.4, -25.4, 74.6, { h: 2.6, color: 0xe8e2d4 });
  yardWall(w, 25.4, 102.4, 25.4, 74.6, { h: 2.6, color: 0xe8e2d4 });
  ctx.place(w, { y, id: 't1-wall', fade: true, name: '接引台院墙' });
  // 东西侧廊（靠院墙，朝院心一侧设坐凳栏杆），廊下悬灯
  for (const s of [-1, 1]) {
    const cb = new Builder(), L = 18.6, x = s * 23.4, z0 = s > 0 ? 94.6 : 76.0;
    colonnade(cb, L, { w: 3.2, h: 2.9, base: 0.3, bay: 3.1 });
    ctx.place(cb, { x, y, z: z0, ry: s * Math.PI / 2, id: s > 0 ? 'galleryE' : 'galleryW', fade: true, name: s > 0 ? '东侧廊' : '西侧廊', foot: { w: L, d: 3.2, kind: 'house' } });
    const fp = ctx.footprints[ctx.footprints.length - 1]; fp.x = x; fp.z = (94.6 + 76.0) / 2;
    for (const z of [80.2, 85.3, 90.4]) addPalaceLantern(ctx, x - s * 1.25, y + 0.3 + 2.9 - 0.3, z, 0.8);
  }
  // 登记亭（西北，入口朝院心）与茶亭（东北）
  {
    const rb = new Builder();
    registerPavilion(rb, 0, P);
    ctx.place(rb, { x: -13.8, y, z: 79.6, ry: Math.PI / 2, id: 'regPavilion', fade: true, name: '登记亭', foot: { w: 6, d: 6, kind: 'small', label: '登记亭' } });
    const tb = new Builder();
    teaPavilion(tb, 1);
    ctx.place(tb, { x: 13.8, y, z: 79.6, ry: -Math.PI / 2, id: 'teaPavilion', fade: true, name: '茶亭', foot: { w: 6.2, d: 6.2, kind: 'small', label: '茶亭' } });
  }
  // 龟趺宗门碑（甬道东侧，碑面朝甬道）
  const sb = new Builder();
  turtleStele(sb, 0, 0, 0, 0, drawSteleText, P.canvasBoard);
  ctx.place(sb, { x: 8.8, y, z: 86.0, ry: -Math.PI / 2, id: 'stele', fade: true, name: '宗门碑', foot: { w: 3.0, d: 4.2, kind: 'prop' } });
  // 四角花园：湖石、花丛（花木本身见 layout.KEY_TREES）
  const gd = new Builder(), rr = ctx.rand;
  for (const [gx, gz, sc] of [[-18.6, 91.8, 0.75], [18.6, 91.8, 0.75], [-19.4, 75.6, 0.6], [19.4, 75.6, 0.6]]) rockery(gd, gx, y, gz, sc, rr, 5);
  for (const [fx, fz, col] of [[-17.2, 89.6, 0xd28ab0], [17.2, 89.6, 0xe0b0c8], [-9.6, 76.0, 0xc9a0b0], [9.6, 76.0, 0xd8c2a0], [-6.2, 93.6, 0xb88aa8], [6.2, 93.6, 0xd8c2a0]]) P.flowerPot(gd, fx, y, fz, col, 1.0);
  ctx.place(gd, { name: 'tier1-garden' });
  for (const [x, z] of [[-17.8, 87.8], [-15.8, 90.4], [17.8, 87.8], [15.8, 90.4], [-17.6, 74.8], [17.6, 74.8], [-11, 75.2], [11, 75.2], [-20.4, 81.6], [20.4, 81.6]]) {
    (ctx.extraVeg ||= []).push(['flower', x, z, 1.2]);
    ctx.extraVeg.push(['flower', x + 0.9, z - 0.6, 1.0], ['flower', x - 0.7, z + 0.5, 1.1]);
  }
  // 导览牌（画面在全图建好后绘制）
  const gb = new Builder();
  const board = P.guideBoard(gb, 0, 0, 0, 0, (g2, w2, h2) => P.paperTexture(g2, w2, h2));
  ctx.boards.guide = board;
  ctx.place(gb, { ...SITES.guide, name: 'guide', foot: { w: 3, d: 0.5, kind: 'prop' } });
  ctx.anchors.guide = { x: SITES.guide.x - 0.9, z: SITES.guide.z + 1.4, y };
  ctx.anchors.stele = { x: 8.8 - 2.9, z: 86.0, y };
  ctx.anchors.tea = { x: 13.8 - 3.6, z: 79.6, y };
}

// 宗旗：石夹杆、旗杆、横担与长幡（蓝底金纹）
function flagMast(b, x, y, z, s) {
  b.slab(1.1, 0.3, 1.1, C.marbleShade, x, y, z, { mat: 'stone' });
  for (const t of [-1, 1]) b.slab(0.22, 1.4, 0.6, C.marbleWarm, x + t * 0.21, y + 0.3, z, { mat: 'stoneSmooth', col: false });
  b.cyl(0.08, 0.12, 11.2, C.woodDark, x, y + 5.6, z, { mat: 'wood', seg: 8 });
  b.sphere(0.17, C.gold, x, y + 11.3, z, { mat: 'gold' });
  b.slab(1.6, 0.08, 0.08, C.woodDark, x - s * 0.75, y + 10.4, z, { col: false, mat: 'wood' });
  banner(b, x - s * 0.78, y + 10.4, z + 0.05, 0, 1.15, 5.2, s < 0 ? '青岚宗' : '问道');
  b.cylCollider(x, y, y + 11, z, 0.6);
}

function drawSteleText(g, w, h) {
  g.fillStyle = '#6d6a63'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${40 + Math.random() * 60},${40 + Math.random() * 60},40,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 2 + Math.random() * 5); }
  g.fillStyle = 'rgba(28,27,25,.85)';
  g.textAlign = 'center';
  g.font = `bold ${w * 0.2}px "STKaiti","KaiTi",serif`;
  ['青', '岚', '宗', '记'].forEach((c, i) => g.fillText(c, w / 2, h * 0.14 + i * w * 0.22));
  g.font = `${w * 0.07}px "STKaiti","KaiTi",serif`;
  const cols = ['开山于云岫之阳', '引泉为池种灵田', '三阶以问心', '一殿以问道', '后世弟子', '毋忘初心'];
  cols.forEach((s, ci) => [...s].forEach((c, i) => g.fillText(c, w * (0.86 - ci * 0.145), h * 0.66 + i * w * 0.075)));
}

// ---------- 演武广场：演武台、回廊、钟鼓楼、告示栏 ----------
function buildPlaza(ctx) {
  const c = SITES.plazaCenter, y = c.y;
  const b = new Builder();
  // 广场中央的聚灵阵（打坐修炼）：第九轮依 D08-01 改为与铺地齐平的石、玉、铜镶嵌阵面（阵径 16 米）——
  // 不再有抬高的演武台与四向踏步、外圈金环、四角灵泉与导流槽、蒲团，阵上与阵外都是平地，可在上面战斗
  ctx.qi = new QiVortex(ctx.scene, { x: c.x, y, z: c.z });
  ctx.anchors.meditate = { x: c.x, y, z: c.z };
  // 广场西缘：兵器架、木人桩、石锁（靠回廊，不占中央演武空间）
  P.weaponRack(b, -23.2, y, 31, Math.PI / 2);
  P.weaponRack(b, -23.2, y, 35.6, Math.PI / 2);
  P.dummy(b, -21.0, y, 16.5, 0.6);
  P.dummy(b, -21.4, y, 12.8, -0.2);
  P.dummy(b, -20.6, y, 9.4, 0.3);
  ctx.anchors.dummies = [{ x: -21.0, y, z: 16.5 }, { x: -21.4, y, z: 12.8 }, { x: -20.6, y, z: 9.4 }];     // 第十四轮：练功靶
  P.stoneWeights(b, -22.0, y, 5.4);
  for (const s of [-1, 1]) {
    P.stoneLantern(b, s * 8.8, y, 36.0, 1.05);       // 南门内两侧
    P.stoneLantern(b, s * 7.6, y, 3.4, 1.1);         // 凌云阁踏道前
    placeCenser(ctx, b, s * 12, y, 1.2, 1.55);
    // 回廊内侧：铜灯与盆景（避开侧门），广场边缘的花木
    for (const z of [-10.5, 0.5, 13.5, 33.5]) {
      if (s > 0 && z === 0.5) continue;
      bronzeLamp(b, s * 24.6, y, z, 0.95);
    }
    for (const z of [7.2, 19.8, 35.4]) {
      b.slab(1.3, 0.5, 1.3, C.marbleShade, s * 24.4, y, z, { mat: 'stoneSmooth' });
      b.slab(1.4, 0.08, 1.4, C.marble, s * 24.4, y + 0.5, z, { mat: 'stoneSmooth', col: false });
    }
  }
  ctx.place(b, { name: 'plaza' });
  for (const s of [-1, 1]) for (const z of [7.2, 19.8, 35.4]) (ctx.extraVeg ||= []).push([z === 19.8 ? 'lilac' : 'pine', s * 24.4, z, z === 19.8 ? 0.42 : 0.38, z, y + 0.55]);
  for (const s of [-1, 1]) {
    const f = new Builder();
    P.flagpole(f, 0, 0, 0, 0, s < 0 ? '青岚' : '问道', 10);
    ctx.place(f, { x: s * 13.2, y, z: 35.2, ry: s < 0 ? 0 : Math.PI, name: 'flag' });
  }
  // 第九轮：问心阶顶的南门殿 + 两侧南廊（东西回廊在南端经南廊接到南门；南廊在 x = ±17 开门接问心廊）
  {
    const g = new Builder();
    plazaGate9(g, { front: '演武', back: '聚灵' });
    ctx.place(g, { x: 0, y, z: 40.0, ry: 0, id: 'plazaGate', fade: true, name: '演武场南门', foot: { w: 15.6, d: 5.2, kind: 'house' } });
    const LS = 18.4, gap = [7.6, 11.4];
    for (const s of [-1, 1]) {
      const sb = new Builder();
      colonnade8(sb, LS, { w: 3.6, gaps: [s < 0 ? gap : [LS - 7.6 - 3.8 + 0.0, LS - 7.6]], labels: ['问心廊'] });
      // 西廊自 x = -7.6 向西；东廊自 x = 26.0 向西（本地 X 均朝世界 -X，内侧 +Z 朝广场即世界 -Z）
      ctx.place(sb, { x: s < 0 ? -7.6 : 26.0, y, z: 40.0, ry: Math.PI, id: s < 0 ? 'colSW' : 'colSE', fade: true, name: '南廊', foot: { w: LS, d: 3.6, kind: 'house' } });
      const fp = ctx.footprints[ctx.footprints.length - 1]; fp.x = s * (7.6 + LS / 2); fp.z = 40.0; fp.ry = 0;
    }
  }
  // 委托告示栏
  const nb = new Builder();
  const board = P.noticeBoard(nb, 0, 0, 0, 0, (g, w, h) => P.paperTexture(g, w, h, '#8a6e52'));
  ctx.boards.notice = board;
  ctx.redrawNotice = (S) => board.userData.redraw((g, w, h) => drawNotice(g, w, h, S.herb.stage));
  ctx.place(nb, { ...SITES.notice, id: 'notice', fade: true, name: '委托告示', foot: { w: 4, d: 0.6, kind: 'prop', label: '告示' } });
  ctx.anchors.notice = { x: SITES.notice.x - 1.6, z: SITES.notice.z, y };
  // 东西回廊（单面空廊：背面白墙、漏窗；侧门门楼）。本地 X 沿回廊，内侧（+Z）朝向广场
  const K = SITES.colonnade, L = K.z0 - K.z1;
  const cwB = new Builder();
  colonnade8(cwB, L, { w: K.w, gaps: K.gapsW.map(([a, c2]) => [K.z0 - c2, K.z0 - a]), labels: ['居所'] });
  ctx.place(cwB, { x: -K.x, y, z: K.z0, ry: Math.PI / 2, id: 'colW', fade: true, name: '西回廊', foot: { w: K.w, d: L, kind: 'house' } });
  const ceB = new Builder();
  colonnade8(ceB, L, { w: K.w, gaps: K.gapsE.map(([a, c2]) => [a - K.z1, c2 - K.z1]), labels: ['丹殿', '灵池'] });
  ctx.place(ceB, { x: K.x, y, z: K.z1, ry: -Math.PI / 2, id: 'colE', fade: true, name: '东回廊', foot: { w: K.w, d: L, kind: 'house' } });
  for (const fp of ctx.footprints.slice(-2)) { fp.ry = 0; fp.z = (K.z0 + K.z1) / 2; }
  // 回廊檐下宫灯（每三间一盏，挂在朝广场一侧）
  {
    const n = Math.max(1, Math.round(L / 3.3)), bw = L / n, zi = K.w / 2 - 0.35;
    for (let i = 1; i < n; i += 3) {
      const lx = (i + 0.5) * bw;
      addPalaceLantern(ctx, -K.x + zi, y + 0.3 + 3.1 - 0.62, K.z0 - lx, 0.8);
      addPalaceLantern(ctx, K.x - zi, y + 0.3 + 3.1 - 0.62, K.z1 + lx, 0.8);
    }
  }
  // 钟楼（西）、鼓楼（东）：凌云阁台下两侧的矮石台上。第十轮：石台上改立素材模型（Et：三层方楼，取自校场门楼的中楼，
  // 缩到 0.62，楼高十三米余，低于凌云阁一等）；素材缺失时仍用原先的重檐方亭
  for (const [id, S, name, kind] of [['bell', SITES.bell, '钟楼', 'bell'], ['drum', SITES.drum, '鼓楼', 'drum']]) {
    const t = new Builder();
    const tower = !!ASSETS.models.buildings;
    bellDrumPavilion(t, kind, { platformOnly: tower });
    ctx.place(t, { ...S, id: tower ? id + 'Base' : id, fade: true, name: name + '石台', foot: tower ? null : { w: 8.6, d: 8.6, kind: 'major' } });
    if (tower) placeBuilding(ctx, 'Et', { x: S.x, y: S.y + 2.2, z: S.z, s: 0.62, id, name, foot: { kind: 'major' } });
  }
}

// 告示栏画面：三张告示，今日委托接取后盖「已揭」朱印
function drawNotice(g, w, h, stage) {
  g.fillStyle = '#7a5f45'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(40,26,16,${Math.random() * 0.12})`; g.fillRect(0, Math.random() * h, w, 1 + Math.random() * 3); }
  const sheet = (x, y, sw, sh, rot, title, lines, cross, stamp) => {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = '#efe6cf'; g.fillRect(-sw / 2, -sh / 2, sw, sh);
    g.fillStyle = 'rgba(120,96,60,.08)'; for (let i = 0; i < 60; i++) g.fillRect(-sw / 2 + Math.random() * sw, -sh / 2 + Math.random() * sh, 3, 2);
    g.fillStyle = '#2b2a27'; g.textAlign = 'center';
    g.font = `bold ${sw * 0.13}px "STKaiti","KaiTi",serif`;
    g.fillText(title, 0, -sh / 2 + sw * 0.2);
    g.font = `${sw * 0.075}px "STKaiti","KaiTi",serif`;
    lines.forEach((l, i) => g.fillText(l, 0, -sh / 2 + sw * 0.36 + i * sw * 0.11));
    if (cross) { g.strokeStyle = 'rgba(40,40,38,.7)'; g.lineWidth = 4; g.beginPath(); g.moveTo(-sw * 0.4, -sh * 0.3); g.lineTo(sw * 0.4, sh * 0.32); g.stroke(); }
    if (stamp) {
      g.strokeStyle = 'rgba(166,59,46,.85)'; g.fillStyle = 'rgba(166,59,46,.85)'; g.lineWidth = 5;
      g.strokeRect(sw * 0.05, sh * 0.12, sw * 0.36, sw * 0.36);
      g.font = `bold ${sw * 0.14}px "STKaiti","KaiTi",serif`; g.fillText(stamp, sw * 0.23, sh * 0.12 + sw * 0.24);
    }
    g.fillStyle = '#5a4330'; g.beginPath(); g.arc(0, -sh / 2 + 8, 5, 0, 6.28); g.fill();
    g.restore();
  };
  sheet(w * 0.2, h * 0.52, w * 0.24, h * 0.78, -0.04, '赤阳果', ['待熟暂缓', '灵田东畦', '执事堂'], true);
  sheet(w * 0.5, h * 0.5, w * 0.27, h * 0.86, 0.015, '丹房求药', ['清露草五株', '送交丹房苏木', '酬养元丹一枚', '贡献十点'], false, stage === 3 ? '已毕' : stage > 0 ? '已揭' : null);
  sheet(w * 0.8, h * 0.53, w * 0.24, h * 0.76, 0.05, '晒书', ['藏经阁', '需人手二名', '已满'], true);
}

// ---------- 凌云阁：须弥座高台 + 三重檐方阁 ----------
function buildLingyun(ctx) {
  const pad = PADS.find((p) => p.id === PLINTH.pad), st = STAIRS.find((s) => s.id === PLINTH.front);
  const y0 = SITES.plazaCenter.y, H = pad.y - y0, sw = st.w / 2 + 0.65;
  const b = new Builder();
  // 南壁（正中留出踏道口）：本地原点在西南角，外壁朝 +Z
  b.push(pad.x0, y0, pad.z1, 0);
  sumeruWall(b, -1.4, -sw - pad.x0, H);
  sumeruWall(b, sw - pad.x0, pad.x1 - pad.x0 + 1.4, H);
  b.pop();
  // 东壁、西壁
  b.push(pad.x1, y0, pad.z1, Math.PI / 2);
  sumeruWall(b, 0, pad.z1 - pad.z0, H);
  b.pop();
  b.push(pad.x0, y0, pad.z0, -Math.PI / 2);
  sumeruWall(b, 0, pad.z1 - pad.z0, H);
  b.pop();
  // 南壁正面：踏道两侧各一方青玉云龙浮雕板（白石边框）
  for (const s of [-1, 1]) {
    const cx = s * (sw + (pad.x1 - sw) / 2), w = pad.x1 - sw - 2.2, hh = H - 2.6, zf = pad.z1 + 1.06;
    b.slab(w + 0.5, hh + 0.5, 0.16, C.marbleWarm, cx, y0 + 1.05, zf + 0.08, { mat: 'stoneSmooth', col: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshStandardMaterial({ map: reliefTexture(), roughness: 0.6 }));
    m.position.set(cx, y0 + 1.3 + hh / 2, zf + 0.17);
    if (s > 0) m.scale.x = -1;
    m.receiveShadow = true; m.userData.fadeable = false;
    b.addMesh(m);
  }
  ctx.place(b, { name: '凌云阁台基' });
  // 楼阁。第十轮：改用素材模型（A：十字脊楼阁，上下两层前后对称、正中三层望楼高出，檐下横匾「凌云阁」），自带底座与台面齐平；
  // 素材缺失时仍用原先的两层楼阁
  const L = SITES.lingyun;
  const lg = placeBuilding(ctx, 'A', { x: L.x, y: L.y, z: L.z, s: 1.0, id: 'lingyun', name: '凌云阁', foot: { kind: 'major', accent: true } });
  const d = new Builder();
  placeCenser(ctx, d, SITES.cauldron.x, pad.y, SITES.cauldron.z, 1.9);
  if (lg) {
    ctx.lingyunTop = lg.top;
    ctx.anchors.lingyun = lg.door ? { x: lg.door.x, y: lg.door.y, z: lg.door.z } : { x: 0, y: pad.y, z: L.z + lg.half[1] + 0.8 };
  } else {
    const t = new Builder();
    const info = lingyunHall(t, { plaque: '凌云阁' });
    ctx.place(t, { ...L, id: 'lingyun', fade: true, name: '凌云阁', foot: { w: 23, d: 15.8, kind: 'major', accent: true } });
    ctx.lingyunTop = L.y + info.top;
    for (const [lx, ly, lz] of info.lanterns) addPalaceLantern(ctx, L.x + lx, L.y + ly, L.z + lz, 1.1);
    ctx.anchors.lingyun = { x: 0, y: pad.y + info.floor, z: L.z + info.porchZ - 1.0 };
  }
  // 台上：香炉、四角石灯
  for (const sx of [-1, 1]) for (const z of [pad.z1 - 2.4, pad.z0 + 2.6]) P.stoneLantern(d, sx * (pad.x1 - 2.4), pad.y, z, 1.0);
  ctx.place(d, { name: '凌云阁台上' });
}

export function buildSect(ctx) {
  buildWalls(ctx);
  buildInfrastructure(ctx);
  buildTier1(ctx);
  buildPlaza(ctx);
  buildLingyun(ctx);
  buildDorms(ctx);
  buildDining(ctx);
  buildAlchemy(ctx);
  buildField(ctx);
  buildCourt3(ctx);
  buildSummit(ctx);
  buildTerraces(ctx);
  buildBamboo(ctx);
  buildBackhill(ctx);
  ctx.dragonTerraces = buildDragonTerraces(ctx);
  buildAbyssGate(ctx);
  buildPalaceLanterns(ctx);
  return ctx;
}

// 旗帜等飘动材质：顶点沿自由端摆动
export function setupSway(list) {
  for (const m of list) {
    const mat = m.material;
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      sh.uniforms.uTime = GLOBAL.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          { float f = clamp(position.x / 1.5 + .5, 0., 1.);
            transformed.z += sin(uTime * 2.3 + position.x * 2.6 + position.y * .7) * .09 * f + sin(uTime * 3.7 + position.y * 1.3) * .03 * f; }`);
    };
    mat.customProgramCacheKey = () => 'sway-' + (mat.map ? 'm' : 'n');
    mat.needsUpdate = true;
  }
}
