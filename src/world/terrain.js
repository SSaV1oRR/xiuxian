// 地形：自然山势 → 台地挖填 → 台阶槽 → 山路 → 深涧与深谷的陡壁 → 溪床 → 下挖水池，依次合成高度场
// 宗门所在山台三面临崖：西侧溪涧在古碑旁跌落成深涧，绕到山门前；东侧另有一道深谷，谷中积云（见 layout.GORGES）
// 近处山势按构图塑形（宗门所在山脊、两侧压低后退的近山、侧谷与云顶后的山谷），远处接入真实高程（黄山汤口一带，
// AWS Terrain Tiles / SRTM 公有数据，水平 1:4，近低远高分级缩放），形成近山、中山、远山的层次。
// 网格：核心区 1 米（与挡土墙对齐）、外围 10 米、远景环带（极坐标，至 6 公里）；地表着色由遮罩与 CC0 实拍贴图驱动
import * as THREE from 'three';
import { clamp, lerp, smoothstep, createNoise2D, fbm, ridged, monotoneCurve, Polyline, smoothPath } from '../core/math.js';
import { PADS, STAIRS, SMALL_STEPS, PATHS, WALKS, PAVINGS, FIELD_PLOTS, STREAM, POND, ABYSS_GATE, GORGES, BASINS, basinShape, corridorPlan, CLIFF_RUNS, VALLEYS, CLIFF_POOLS, cliffLine, SITES } from './layout.js';

// 山门石道的设计标高（桥头 -2.5，向南缓降；外谷里的石道山脊、桥头岩颈都按它取高）
export function roadY(z) { return z < 152 ? -2.5 : z < 168 ? lerp(-2.5, -4.8, (z - 152) / 16) : z < 205 ? lerp(-4.8, -8.6, (z - 168) / 37) : -8.6 - (z - 205) * 0.16; }
import { NOISE_GLSL, injectFog } from './shaderlib.js';
import { ASSETS } from './assets.js';

export const CORE = { x0: -135, x1: 135, z0: -268, z1: 180 };
const OUTER = { x0: -1150, x1: 1150, z0: -1150, z1: 1150, step: 10 };
const FAR_R0 = 1080, FAR_R1 = 6100;     // 远景环带（极坐标网格）的内外半径
const MASK_RES = 0.5;

// 南北向基础山势（z → y）：山门前谷地 → 广场 → 上院 → 天阶所在山坡 → 云顶；云顶之后落入山谷（远处由真实高程接续）
const BASE = monotoneCurve([
  [-1150, 12], [-700, 14], [-520, 18], [-430, 22], [-350, 27], [-300, 33], [-262, 42], [-238, 52], [-220, 58.5], [-209, 61], [-188, 61.2], [-166, 57.4],
  [-140, 47.6], [-120, 39.8], [-102, 31.6], [-84, 30.4], [-62, 27.2], [-44, 23.2], [-28, 20.2], [-12, 17.6], [0, 16.2], [20, 14.5], [42, 12.4],
  [58, 8.2], [74, 4.2], [90, 2.6], [103, 1.6], [112, 0.6], [124, -1.6], [140, -3.6], [170, -6.6], [260, -11], [420, -13], [700, -14], [1150, -15],
]);
// 山体印章（assets/mountain 的山体网格烘焙的高度图，见 Terrain.stampAt）：[印章序号, 中心 x, z, 边长, 高度, 旋转]
// 近山：承托后山路线与隐藏入口的岩丘、寒玉台背后的西岭山肩
export const NEAR_STAMPS = [
  [0, 120, -200, 84, 30, 2.3],         // 后山东北岩丘：幽渊秘境的废弃石洞在它的西南崖下
  [2, -182, -150, 118, 26, 0.95],      // 西岭山肩：寒玉台与冰龙背后的岩坡
];
// 中山：宗门两侧的山脉（印章山脊旋成南北走向，把山谷框在中间，南端留出谷口与天空）
export const MID_STAMPS = [
  [1, -760, -250, 660, 250, 0.62],
  [2, -870, 120, 640, 185, 0.95],
  [0, 820, -110, 680, 235, 0.55],
  [1, 900, 250, 620, 170, 1.05],
];
// 局部岩丘（山门外前景）
const bump = (x, z, cx, cz, r, h) => { const d2 = ((x - cx) ** 2 + (z - cz) ** 2) / (r * r); return d2 < 1 ? h * (1 - d2) * (1 - d2) : 0; };

// ---------- 台阶剖面 ----------
export function stairInfo(st) {
  const [zb, yb] = st.bottom, [zt, yt] = st.top;
  if (st.corridor) {
    // 叠落廊：按分段的地面高度（段首踏步线性升高）
    const P = corridorPlan(st);
    const profile = (zz) => {
      if (zz >= zb) return yb;
      if (zz <= zt) return yt;
      const t = (zb - zz) / P.bay, i = Math.min(P.n - 1, Math.floor(t)), u = (t - i) * P.bay;
      if (i > 0 && u < P.Ls && P.floors[i] > P.floors[i - 1]) return yb + P.floors[i - 1] + (P.floors[i] - P.floors[i - 1]) * (u / P.Ls);
      return yb + P.floors[i];
    };
    return { flights: [{ z0: zb, z1: zt, y0: yb, y1: yt, n: 1, run: zb - zt, sh: yt - yb }], landings: [], profile, zb, zt, yb, yt };
  }
  const nf = (st.landings || 0) + 1, L = st.landingLen || 0;
  const run = (zb - zt - L * (nf - 1)) / nf, rise = (yt - yb) / nf;
  const n = Math.max(1, Math.round(rise / 0.19));
  const flights = [], landings = [];
  let z = zb, y = yb;
  for (let k = 0; k < nf; k++) {
    flights.push({ z0: z, z1: z - run, y0: y, y1: y + rise, n, run: run / n, sh: rise / n });
    z -= run; y += rise;
    if (k < nf - 1) { landings.push({ z0: z, z1: z - L, y }); z -= L; }
  }
  const profile = (zz) => {
    if (zz >= zb) return yb;
    if (zz <= zt) return yt;
    for (const f of flights) if (zz <= f.z0 && zz >= f.z1) return f.y0 + ((f.z0 - zz) / (f.z0 - f.z1)) * (f.y1 - f.y0);
    for (const l of landings) if (zz <= l.z0 && zz >= l.z1) return l.y;
    return yb;
  };
  return { flights, landings, profile, zb, zt, yb, yt };
}

function sdRect(x, z, p) {
  const dx = Math.max(p.x0 - x, x - p.x1), dz = Math.max(p.z0 - z, z - p.z1);
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
}
const sdPad = (x, z, p) => (p.r != null ? Math.hypot(x - p.cx, z - p.cz) - p.r : sdRect(x, z, p));

// 沿折线插值设计标高（点格式 [x, z, y]，与 layout.PATHS 一致）
function makeProfile(pts3) {
  const line = new Polyline(pts3.map((p) => [p[0], p[1]]));
  const ys = pts3.map((p) => p[2]);
  return { line, y: (s) => {
    const c = line.cum;
    if (s <= 0) return ys[0];
    for (let i = 0; i < c.length - 1; i++) if (s <= c[i + 1]) return lerp(ys[i], ys[i + 1], (s - c[i]) / (c[i + 1] - c[i] || 1));
    return ys[ys.length - 1];
  } };
}

// 把折线影响光栅化到网格：对每个格点记录最近距离与弧长（只遍历每段的包围盒）
function rasterLine(line, grid, R, D, S) {
  const { x0, z0, step, nx, nz } = grid, p = line.pts;
  for (let i = 0; i < p.length - 1; i++) {
    const ax = p[i][0], az = p[i][1], bx = p[i + 1][0], bz = p[i + 1][1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9, L = Math.sqrt(L2);
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - x0) / step)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + R - x0) / step));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - R - z0) / step)), j1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz) + R - z0) / step));
    for (let j = j0; j <= j1; j++) {
      const z = z0 + j * step;
      for (let ii = i0; ii <= i1; ii++) {
        const x = x0 + ii * step;
        let u = ((x - ax) * dx + (z - az) * dz) / L2;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const d = Math.hypot(x - ax - dx * u, z - az - dz * u);
        const k = j * nx + ii;
        if (d < D[k]) { D[k] = d; S[k] = line.cum[i] + u * L; }
      }
    }
  }
}

export class Terrain {
  constructor({ quality = 'mid' } = {}) {
    this.quality = quality;
    const noise = createNoise2D(1709), noise2 = createNoise2D(4421);
    this.noise = noise;
    this.hardPads = PADS.filter((p) => p.soft == null);
    this.softPads = PADS.filter((p) => p.soft != null);
    this.stairs = STAIRS.map((s) => ({ ...s, info: stairInfo(s) }));
    this.paths = PATHS.map((p) => {
      const dense = [];
      for (let i = 0; i < p.pts.length - 1; i++) {
        const a = p.pts[i], b = p.pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5));
        for (let k = 0; k < n; k++) dense.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n), lerp(a[2], b[2], k / n)]);
      }
      dense.push(p.pts[p.pts.length - 1]);
      return { ...p, prof: makeProfile(dense) };
    });
    // 溪流：平滑中线 + 沿程水位（跌水处保留落差）
    {
      const ctrl = STREAM.map((p) => [p[0], p[1]]);
      const dense = smoothPath(ctrl, 1.5);
      const cl = new Polyline(ctrl);
      const line = new Polyline(dense);
      const ys = STREAM.map((p) => p[2]);
      const yAtCtrl = (s) => {
        const c = cl.cum;
        for (let i = 0; i < c.length - 1; i++) if (s <= c[i + 1]) return lerp(ys[i], ys[i + 1], (s - c[i]) / (c[i + 1] - c[i] || 1));
        return ys[ys.length - 1];
      };
      // 稠密点的水位：投影到控制折线上求弧长再插值
      const tmp = {};
      const wy = dense.map(([x, z]) => yAtCtrl(cl.nearest(x, z, tmp).s));
      for (let i = 1; i < wy.length; i++) wy[i] = Math.min(wy[i], wy[i - 1]);   // 水往低处流
      this.stream = { line, wy, len: line.length, fallS: line.nearest(STREAM.find((p) => p[3] === 'fall')[0], STREAM.find((p) => p[3] === 'fall')[1]).s };
    }
    this.streamY = (s) => {
      const c = this.stream.line.cum, w = this.stream.wy;
      let lo = 0, hi = c.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] > s) hi = m; else lo = m; }
      return lerp(w[lo], w[hi], clamp((s - c[lo]) / (c[hi] - c[lo] || 1), 0, 1));
    };
    this.streamHalf = (s) => lerp(1.25, 2.5, smoothstep(60, 330, s));
    // 深涧：溪流上 'gorge' 标记处（峡谷源头的飞瀑）以下，两岸为陡壁
    const gm = STREAM.find((p) => p[3] === 'gorge');
    this.gorgeS = gm ? this.stream.line.nearest(gm[0], gm[1]).s : Infinity;
    this.gorgeK = (s) => smoothstep(this.gorgeS - 2, this.gorgeS + 3, s);
    // 深谷：控制折线 + 沿程谷底高度与谷底半宽
    this.channels = GORGES.map((G) => {
      const line = new Polyline(G.pts.map((p) => [p[0], p[1]])), fy = G.pts.map((p) => p[2]);
      const at = (arr, s) => { const c = line.cum; for (let i = 0; i < c.length - 1; i++) if (s <= c[i + 1]) return lerp(arr[i], arr[i + 1], (s - c[i]) / (c[i + 1] - c[i] || 1)); return arr[arr.length - 1]; };
      return { ...G, line, floor: (s) => at(fy, s), half: (s) => at(G.hw, s), reach: Math.max(...G.hw) + 60 };
    });

    // 山体高度印章（assets/mountain/tori_gate_enviroment.blend 中的山体网格，由 tools/convert_assets.py 烘焙为 257² 高度图）：
    // 按中心、边长、高度与旋转叠加到地形上，边缘高度为零，与周围自然衔接
    const STAMPS = ASSETS.stamps || [];
    this.stampAt = (k, x, z, cx, cz, size, height, rot = 0) => {
      const st = STAMPS[k];
      if (!st) return 0;
      const c = Math.cos(rot), sn = Math.sin(rot), dx = x - cx, dz = z - cz;
      const u = (dx * c - dz * sn) / size + 0.5, v = (dx * sn + dz * c) / size + 0.5;
      if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return 0;
      const n = st.n, fx = u * (n - 1), fz = v * (n - 1), i = Math.min(n - 2, Math.floor(fx)), j = Math.min(n - 2, Math.floor(fz)), a = fx - i, bb = fz - j;
      const H = st.h, k0 = j * n + i;
      return ((H[k0] * (1 - a) + H[k0 + 1] * a) * (1 - bb) + (H[k0 + n] * (1 - a) + H[k0 + n + 1] * a) * bb) * height;
    };
    // 近处印章：[印章序号, 中心 x, z, 边长, 高度, 旋转]
    this.nearStamps = NEAR_STAMPS;
    // 近山脊线：西岭（溪谷以西）、东岭（东侧谷以东）；脊高压在云顶以下，南端渐低成谷口
    const ridgeW = (z) => -(186 + 18 * Math.sin(z / 85 + 0.6));
    const ridgeE = (z) => 214 + 16 * Math.sin(z / 70 + 1.7);
    this.nearNatural = (x, z) => {
      const b = BASE(z);
      let y = b;
      // 两翼缓升：西侧弟子居所、藏经阁一线略高于中轴
      y += smoothstep(28, 62, -x) * 3.0 * smoothstep(-92, -40, z) * smoothstep(72, 40, z);
      // 后山东北山肩（后山小径、听松亭、灵狐出没处）
      y += smoothstep(40, 110, x) * smoothstep(-84, -150, z) * 5.0;
      // 东侧：离开灵田、丹房所在台地后落入东谷
      y -= 13 * smoothstep(92, 150, x) * smoothstep(-110, -60, z);
      // 西侧：溪谷以西缓缓抬升，接西岭
      y += Math.max(0, -x - 108) * 0.22 * smoothstep(240, 120, z);
      // 近山：脊顶标高随 z 变化，不高于 62 米；南端（z>170）渐低成谷口
      // 第十轮：脊顶抬高（北段至 90 米上下），从下切后的外谷谷底拔起七八十米以上
      const crest = (z) => Math.min(b + 46, 88) * smoothstep(340, 150, z) + 8;
      const gw = Math.exp(-(((x - ridgeW(z)) / 44) ** 2)), ge = Math.exp(-(((x - ridgeE(z)) / 46) ** 2));
      // 山坳：西岭在藏经阁之后、东岭在灵田以东各压低一段，形成谷口，露出远山与天空
      const cW = crest(z) + 4 * Math.sin(z / 37) - 24 * Math.exp(-(((z + 66) / 46) ** 2));
      const cE = crest(z) - 4 + 5 * Math.sin(z / 41 + 2) - 26 * Math.exp(-(((z - 14) / 42) ** 2));
      y = y + (cW - y) * gw * 0.92;
      y = y + (cE - y) * ge * 0.9;
      // 近山上的岩脊与沟壑（保留岩石细节）
      const rk = Math.max(gw, ge) * smoothstep(-0.2, 6, y - b);
      y += rk * (ridged(noise, x / 24 + 3, z / 24, 3) * 22 - 8);
      // 近山脊上的几处花岗岩峰（黄山式石峰），压在主殿以下
      const spire = (cx, cz, r, h) => { const d = Math.hypot(x - cx, z - cz) / r; return d < 1 ? h * Math.pow(1 - d * d, 1.7) : 0; };
      y += (spire(-198, -152, 28, 40) + spire(-184, 38, 24, 34) + spire(-204, 126, 22, 26) + spire(-176, -46, 18, 22)) * (0.7 + 0.6 * ridged(noise, x / 8, z / 8, 2));
      y += (spire(226, -118, 28, 42) + spire(212, 84, 24, 32) + spire(232, -200, 26, 36) + spire(206, -14, 18, 24)) * (0.7 + 0.6 * ridged(noise, x / 8 + 3, z / 8, 2));
      // 细部起伏
      y += fbm(noise, x / 58, z / 58, 4) * 3.0 + noise(x / 14, z / 14) * 0.5;
      // 镇岳塔所在山岗、听松亭山头的小起伏
      y += bump(x, z, 47, -214, 22, 8) + bump(x, z, 86, -150, 26, 4);
      // 问心阶两侧的岩丘（松石点景，打破坡地上的大片草坪）
      y += bump(x, z, -46, 59, 13, 6.5) * (0.85 + 0.3 * noise(x / 5, z / 5)) + bump(x, z, 52, 62, 14, 7.5) * (0.85 + 0.3 * noise(x / 5 + 4, z / 5));
      // 山体素材印章：后山东北的岩丘（南坡陡起成崖，崖下藏着废弃石洞）等
      for (const [k, cx, cz, size, h, rot] of NEAR_STAMPS) y += this.stampAt(k, x, z, cx, cz, size, h, rot);
      // 废弃石洞：岩丘西肩削出一面崖壁，崖前取平一小块洞前平台
      {
        const G = ABYSS_GATE, fx = Math.sin(G.face), fz = Math.cos(G.face), dx = x - G.x, dz = z - G.z;
        const along = dx * fx + dz * fz, lat = -dx * fz + dz * fx;
        const lw = 1 - smoothstep(G.w, G.w + 5, Math.abs(lat));
        if (lw > 0 && along > -14 && along < 12) {
          if (along < 0) y = Math.max(y, y + (G.apron + G.cliff - y) * lw * smoothstep(0.1, 2.6, -along) * (1 - smoothstep(9, 14, -along)));
          const ap = 1 - smoothstep(3.2, 8.5, Math.hypot(along - 3.4, lat * 0.85));
          if (along > -0.4) y += (G.apron - y) * ap;
        }
      }
      // 第十轮：外谷——宗门山台以外，东（东谷以东）、西（西涧以西、竹林台以南）、南（山门石桥以南）三面的地面整体下落成深谷，
      // 谷底约 -38 ～ -50 米；山台四周的绝壁、两侧山脊都从谷底拔起。西岸竹林台、古碑、寒玉台与后山一带（北半部）不动
      {
        // 谷缘按低频噪声扭曲（不出直线的谷边）；山脊之外（|x| > 250）不再下落
        const wx = x + 24 * noise(x / 64 + 5.1, z / 64), wz = z + 24 * noise(x / 64, z / 64 + 9.3);
        const e = smoothstep(108, 128, wx) * smoothstep(-96, -70, wz) * smoothstep(262, 240, wx);
        const w = smoothstep(-108, -128, wx) * smoothstep(-2, 18, wz) * smoothstep(-262, -240, wx);
        const s = smoothstep(150, 170, wz) * smoothstep(300, 244, Math.abs(wx));
        // 两侧山脊（脊线左右约 24 米内）保持原高，其外才落入谷底：山脊从谷底陡然拔起
        const low = Math.max(e, w, s) * (1 - smoothstep(0.15, 0.75, Math.max(gw, ge)));
        if (low > 0) {
          const vf = -40 + 5 * fbm(noise, x / 95 + 1.7, z / 95, 3) - 6 * smoothstep(160, 420, z) + 3 * noise(x / 31, z / 31);
          y = lerp(y, Math.min(y, vf), low);
        }
        // 山门石道下的山脊：石桥以南，石道两侧以约 1:1.3 的陡坡落到谷底，脊背随石道缓缓南降（谷底高的地方由谷底接住）
        if (z > 132 && z < 420) {
          const ry = roadY(z);
          const sx = Math.abs(x + 3 * Math.sin(z / 37)), shoulder = 10 + 3.5 * noise(z / 23, 2.3);
          // 脊背两侧先陡落（约 60°，人走不下去），再以约 1:1.3 的岩坡落到谷底
          const off = Math.max(0, sx - shoulder);
          const spur = ry - 0.6 - Math.min(off, 9) * 1.75 - Math.max(0, off - 9) * (1.3 + 0.25 * noise(x / 17, z / 17)) + ridged(noise, x / 11, z / 11, 2) * 2.2 * smoothstep(shoulder + 2, shoulder + 8, sx);
          y = Math.max(y, spur * smoothstep(132, 150, z) + (1 - smoothstep(132, 150, z)) * -1e3);
        }
      }
      // 山门外两处岩丘：外谷谷底拔起的两座石峰（前景，构图两角）
      y += bump(x, z, -36, 166, 19, 30) * (0.75 + 0.5 * ridged(noise, x / 7, z / 7, 2)) + bump(x, z, 40, 186, 17, 26) * (0.75 + 0.5 * ridged(noise, x / 7 + 9, z / 7, 2));
      return y;
    };
    // 远山：真实高程（预处理为游戏尺度），双线性采样
    const dem = ASSETS.dem;
    this.demAt = dem ? (x, z) => {
      const n = dem.n, fx = ((x + dem.half) / (2 * dem.half)) * n - 0.5, fz = ((z + dem.half) / (2 * dem.half)) * n - 0.5;
      const i = clamp(Math.floor(fx), 0, n - 2), j = clamp(Math.floor(fz), 0, n - 2), u = clamp(fx - i, 0, 1), v = clamp(fz - j, 0, 1), H = dem.h, k = j * n + i;
      return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + n] * (1 - u) + H[k + n + 1] * u) * v;
    } : (x, z) => 30 + ridged(noise2, x / 900, z / 900, 5) * 260 * smoothstep(800, 2600, Math.hypot(x, z + 40));
    // 中山：宗门背后的主峰群与两侧山脉（构图塑形，叠在真实高程之上）。主峰在云顶正后方略偏西，与问道殿构成“殿前峰后”；
    // 右后方（中轴东侧约 19°）留一道谷口，露出更远的山影与天空；两侧山脉向南渐低，把山谷框在中间。
    // 峰体取各峰的最大值（峰与峰之间留出山坳），再以脊状噪声做出花岗岩峰丛、沟壑与岩脊
    const PEAKS = [
      // [x, z, 高, 半径]
      [-90, -820, 400, 300], [-330, -700, 290, 230], [-620, -560, 275, 260], [150, -990, 310, 240], [560, -760, 330, 260],
      [760, -430, 270, 250],
    ];
    // 峰形：陡峭的峰身（柱状石峰）+ 圆缓的峰顶 + 向外铺开的山脚
    const peakShape = (d) => 0.78 * (1 - smoothstep(0.32, 1.0, d)) + 0.1 * Math.max(0, 1 - (d / 0.36) ** 2) + 0.22 * (1 - d * d) ** 2;
    this.massif = (x, z) => {
      let m = 0;
      for (const [cx, cz, h, r] of PEAKS) {
        const d = Math.hypot(x - cx, z - cz) / r;
        if (d >= 1) continue;
        m = Math.max(m, h * peakShape(d));
      }
      // 两侧中山：山体素材印章（真实侵蚀山形的山脊与沟谷）
      for (const [k, cx, cz, size, h, rot] of MID_STAMPS) m = Math.max(m, this.stampAt(k, x, z, cx, cz, size, h, rot));
      if (m <= 0) return 0;
      m *= 1 - 0.75 * Math.exp(-(((x - 330) / 110) ** 2) - (((z + 860) / 260) ** 2));     // 谷口
      return m * (0.86 + 0.24 * ridged(noise2, x / 150 + 7, z / 150, 3)) + (m / 400) * fbm(noise, x / 70 + 2, z / 70, 3) * 14;
    };
    // 远山（真实高程）随距离加高：1.3 公里外逐渐放大到 1.6 倍，透过谷口与峰间可见
    // 主峰群之上真实高程的细部减半，峰顶轮廓更干净
    const far = (x, z) => { const m = this.massif(x, z); return this.demAt(x, z) * (1 + 0.6 * smoothstep(1300, 2800, Math.hypot(x, z + 40))) * (1 - 0.5 * smoothstep(30, 180, m)) + m; };
    // 近处塑形与中远山按椭圆距离过渡
    this.natural = (x, z) => {
      const e = Math.hypot(x / 420, (z + 30) / 520);
      if (e > 1.18) return far(x, z);
      const y = this.nearNatural(x, z);
      if (e < 0.78) return y;
      return lerp(y, far(x, z), smoothstep(0.78, 1.18, e));
    };

    // ---------- 网格 ----------
    const cg = this.core = { x0: CORE.x0, z0: CORE.z0, step: 1, nx: CORE.x1 - CORE.x0 + 1, nz: CORE.z1 - CORE.z0 + 1 };
    // 外围远山网格：流畅画质用 20 米格（远山只作背景，省下约四分之三的三角形）
    const ostep = quality === 'low' ? 20 : OUTER.step;
    const og = this.outer = { x0: OUTER.x0, z0: OUTER.z0, step: ostep, nx: (OUTER.x1 - OUTER.x0) / ostep + 1, nz: (OUTER.z1 - OUTER.z0) / ostep + 1 };
    this.h = this.computeGrid(cg, true);
    this.oh = this.computeGrid(og, false);
    this.buildMask();
  }

  // 计算某张网格的最终高度
  computeGrid(g, isCore) {
    const N = g.nx * g.nz, H = new Float32Array(N);
    const SD = new Float32Array(N).fill(1e9), SS = new Float32Array(N);
    rasterLine(this.stream.line, g, isCore ? 40 : 50, SD, SS);
    const chD = this.channels.map((ch) => { const D = new Float32Array(N).fill(1e9), S = new Float32Array(N); rasterLine(ch.line, g, ch.reach, D, S); return { ch, D, S }; });
    const pd = this.paths.map((p) => {
      const D = new Float32Array(N).fill(1e9), S = new Float32Array(N);
      rasterLine(p.prof.line, g, p.w / 2 + 4, D, S);
      return { p, D, S };
    });
    let water = null;
    if (isCore) { water = new Float32Array(N).fill(NaN); this.water = water; }
    const pond = POND;
    for (let j = 0; j < g.nz; j++) {
      const z = g.z0 + j * g.step;
      for (let i = 0; i < g.nx; i++) {
        const x = g.x0 + i * g.step, k = j * g.nx + i;
        let y = this.natural(x, z);
        // 溪谷：靠近溪流处自然地形向水面收拢（深涧段只收拢溪床附近，两岸留给陡壁）
        const sd = SD[k];
        let swy = 0, shalf = 0;
        const gk = sd < 50 ? this.gorgeK(SS[k]) : 0;
        if (sd < 50) {
          swy = this.streamY(SS[k]); shalf = this.streamHalf(SS[k]);
          y = lerp(y, swy + 1.4, Math.exp(-((sd / lerp(15, 4.5, gk)) ** 2)));
        }
        // 硬边台地（挖填 + 挡土墙）
        let F = -1e9, C = 1e9, inside = null, guard = -1e9;
        for (const p of this.hardPads) {
          const d = sdRect(x, z, p);
          if (d <= 0) { inside = p; break; }
          // 崖边护缘：台地外 2.5 米内保持在挡土墙脚高度，其外才允许陡落（深涧、深谷的陡壁不削进台地）
          if (d < 30) guard = Math.max(guard, p.y - p.W - Math.max(0, d - 2.5) * 2.6);
          // 挖填护坡的约束只作用于台地附近，远处山体不受其限制
          const far = d > 45 ? (d - 45) * (d - 45) * 0.08 : 0;
          F = Math.max(F, p.y - p.W - d * p.slope - far);
          C = Math.min(C, p.y + p.Wc + d * p.slope + far);
        }
        if (inside) y = inside.y;
        else if (F <= C) y = Math.min(Math.max(y, F), C);
        else y = (F + C) / 2;
        // 软边台地（不影响硬边台地内部）
        if (!inside) for (const p of this.softPads) {
          const d = sdPad(x, z, p);
          if (d < 24) guard = Math.max(guard, p.y - 0.4 - Math.max(0, d - 2) * 2.6);
          if (d <= 0) y = p.y;
          else if (d < p.soft) y = lerp(y, p.y, 1 - smoothstep(0, p.soft, d));
        }
        // 台阶：台阶下方压低，两侧肩部与台阶齐平
        for (const s of this.stairs) {
          if (s.free) continue;                                 // 独立踏道砌在台面上，不挖地形
          const { zb, zt } = s.info;
          if (z > zb + 2 || z < zt - 2) continue;
          const ax = Math.abs(x - s.x), hw = s.w / 2 + (s.corridor ? 0.3 : 0.8);
          if (ax > hw + 4) continue;
          if (z >= zb - 0.01 || z <= zt + 0.01) continue;      // 台阶两端的台地边线不挖
          const py = s.info.profile(z);
          if (ax <= hw) y = Math.min(y, Math.max(py - 0.7, s.info.yb - 0.02));   // 不低于底端地面，免得踏步前出现凹坑
          else if (!inside) y = lerp(y, py + 0.1, 1 - smoothstep(0, 4, ax - hw));   // 两侧肩部（台地内部不动）
        }
        for (const ss of SMALL_STEPS) {
          const [ax0, az0, ay0] = ss.from, [ax1, az1, ay1] = ss.to;
          if (inside && inside.y >= Math.max(ay0, ay1) - 0.05) continue;   // 高处台地内不挖，免得台阶口下陷
          const dx = ax1 - ax0, dz = az1 - az0, L2 = dx * dx + dz * dz, u = ((x - ax0) * dx + (z - az0) * dz) / L2;
          if (u <= 0.02 || u >= 0.98) continue;                 // 两端的台地不挖
          const d = Math.hypot(x - ax0 - dx * u, z - az0 - dz * u);
          if (d < ss.w / 2 + 0.6) y = Math.min(y, Math.max(lerp(ay0, ay1, u) - 0.5, Math.min(ay0, ay1) - 0.02));
        }
        // 山路
        for (const { p, D, S } of pd) {
          const d = D[k];
          const hw = p.w / 2, sh = 3.2;
          if (d > hw + sh) continue;
          const ty = p.prof.y(S[k]);
          y = lerp(y, ty, 1 - smoothstep(hw * 0.6, hw + sh, d));
        }
        // 深涧陡壁：取自然地形与陡壁的较低者（陡壁在台地、构筑物处都高于其地面，不会削到台地）
        if (gk > 0) {
          const t = Math.max(0, sd - (shalf + 1.1));
          const rough = (0.5 + 0.5 * this.noise(x / 6.1 + 3.3, z / 6.1)) * Math.min(1, t / 2.5) * 2.4;
          let wall = Math.max(swy + 0.35 + (t < 9 ? t * 3.1 : 27.9 + (t - 9) * 1.5) - rough, guard);
          // 第十轮：山门石桥两端的桥头岩颈、南岸石道山脊不被深涧陡壁削低（两端桥头之间才是涧）
          const GB = SITES.bridge, bx = Math.abs(x - GB.x);
          if (bx < 9 && z > 118 && z < 178 && (z < GB.n || z > GB.s)) wall = Math.max(wall, roadY(z) - 0.05 - Math.max(0, bx - 5.2) * 3.2);
          if (!inside && wall < y) y = lerp(y, wall, gk);
        }
        // 深谷：平缓的谷底 + 陡壁（谷壁带岩坎起伏）
        for (const { ch, D, S } of chD) {
          const d = D[k];
          if (d > ch.reach) continue;
          const s = S[k], t = Math.max(0, d - ch.half(s));
          const rough = (0.5 + 0.5 * this.noise(x / 7.7 - 5.1, z / 7.7)) * Math.min(1, t / 3) * 3.0;
          const wall = Math.max(ch.floor(s) + t * ch.k - rough + this.noise(x / 23, z / 23) * 1.4 * (1 - smoothstep(0, 3, t)), guard);
          if (!inside && wall < y) y = wall;
        }
        // 溪床
        if (sd < shalf + 5) {
          const bank = 1.7;
          let cs;
          if (sd < shalf) cs = swy - 0.18 - 0.55 * (1 - (sd / shalf) ** 2);
          else cs = lerp(swy - 0.18, swy + 0.5, smoothstep(shalf, shalf + bank, sd));
          const w = 1 - smoothstep(shalf + bank, shalf + 5, sd);
          y = lerp(y, cs, w);
          if (water && sd < shalf + 0.6) water[k] = swy;
        }
        // 池塘
        if (pond) {
          const pdx = x - pond.x, pdz = z - pond.z, pr = Math.hypot(pdx, pdz);
          if (pr < pond.r + 3) {
            const a = Math.atan2(pdz, pdx), R = pond.r * (1 + 0.1 * Math.sin(3 * a + 1) + 0.06 * Math.sin(5 * a - 2));
            if (pr < R) y = Math.min(y, pond.y - 0.2 - pond.depth * (1 - (pr / R) ** 2));
            else if (pr < R + 2) y = Math.min(y, lerp(pond.y - 0.2, pond.top ?? pond.y + 0.65, smoothstep(R, R + 2, pr)));
            if (water && pr < R + 0.5) water[k] = pond.y;
          }
        }
        // 下挖的水池（灵池）：池底平，近池岸处略升；池岸以外为台面
        for (const B of BASINS) {
          if (B.rect) {
            const [ra, rb, rc, rd] = B.rect;
            if (x > ra && x < rb && z > rc && z < rd) { y = Math.min(y, B.y - B.depth); if (water) water[k] = B.y; }
            continue;
          }
          const ex = (x - B.x) / B.rx, ez = (z - B.z) / B.rz, e = Math.hypot(ex, ez);
          if (e > 1.4) continue;
          const ee = e / basinShape(B, Math.atan2(ez, ex));
          // 第九轮：池岸以内 1 米的一圈地形仍在台面高（网格 1 米，若在岸线处陡降，三角面会斜穿池壁、露出水面）；
          // 池内的地形在着色器里按池岸轮廓逐像素剔除（见 groundColor 之前的 discard），池底、池壁由 lingchi.js 的网格表现
          if (ee < 1 - 1.05 / Math.min(B.rx, B.rz)) y = Math.min(y, B.y - B.depth + 0.3 * smoothstep(0.82, 0.93, ee));
          if (water && ee < 1 + 0.5 / Math.min(B.rx, B.rz)) water[k] = B.y;
        }
        H[k] = y;
      }
    }
    if (isCore) this.carveValleys(H, g, SD, SS);
    return H;
  }

  // 深谷（第八轮）：崖线外侧的谷地下挖到谷底（反距离加权的控制点 + 崖脚碎石坡 + 起伏），崖线外 1 米内陡落（由岩壁网格遮住）；
  // 与原地形的较低者取低（东谷、西涧原有的谷底不抬高）；不与崖线重合的外缘按 8 米过渡；溪流两岸保持高出水面
  carveValleys(H, g, SD, SS) {
    const lines = {}, tops = {};
    for (const r of CLIFF_RUNS) {
      const L = lines[r.id] = cliffLine(r, 0.6), t = tops[r.id] = new Float32Array(L.N);
      if (r.closed) { t.fill(r.top); continue; }
      for (let i = 0; i < L.N; i++) t[i] = this._bilin(H, g, L.x[i] - L.nx[i] * 0.8, L.z[i] - L.nz[i] * 0.8);
      // 崖顶标高沿线略作平滑（台地转角、台阶口处不出尖）
      const sm = t.slice();
      for (let i = 0; i < L.N; i++) { let a = 0, n = 0; for (let j = Math.max(0, i - 3); j <= Math.min(L.N - 1, i + 3); j++) { a += sm[j]; n++; } t[i] = Math.min(sm[i], a / n + 0.15); }
    }
    this.cliffLines = lines; this.cliffTops = tops;
    const near = (L, p) => { let bi = 0, bd = Infinity; for (let i = 0; i < L.N; i++) { const d = (L.x[i] - p[0]) ** 2 + (L.z[i] - p[1]) ** 2; if (d < bd) { bd = d; bi = i; } } return bi; };
    // 多边形按行扫描填充：每行求与各边的交点、排序后成对取区间（比逐格判断快得多）
    const fillPoly = (poly, cb) => {
      let z0 = Infinity, z1 = -Infinity;
      for (const [, z] of poly) { z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const ja = Math.max(0, Math.ceil(z0 - g.z0)), jb = Math.min(g.nz - 1, Math.floor(z1 - g.z0)), xs = [];
      for (let j = ja; j <= jb; j++) {
        const z = g.z0 + j;
        xs.length = 0;
        for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
          const [xi, zi] = poly[i], [xk, zk] = poly[k];
          if ((zi > z) !== (zk > z)) xs.push(xi + ((xk - xi) * (z - zi)) / (zk - zi));
        }
        xs.sort((p, q) => p - q);
        for (let q = 0; q + 1 < xs.length; q += 2) {
          const ia = Math.max(0, Math.ceil(xs[q] - g.x0)), ib = Math.min(g.nx - 1, Math.floor(xs[q + 1] - g.x0));
          for (let i = ia; i <= ib; i++) cb(i, j, g.x0 + i, z);
        }
      }
    };
    const segDist = (x, z, ax, az, bx, bz) => {
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
      const u = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
      return Math.hypot(x - ax - dx * u, z - az - dz * u);
    };
    this.valleys = [];
    const VM = this.valleyMask = new Uint8Array(g.nx * g.nz);       // 每格所属的深谷序号（0 为不在谷中），供 inValley 查表
    const N = g.nx * g.nz;
    for (const V of VALLEYS) {
      const L = lines[V.run], top = tops[V.run];
      const i0 = V.from ? near(L, V.from) : 0, i1 = V.to ? near(L, V.to) : L.N - 1, st = i1 >= i0 ? 1 : -1;
      const ids = [];
      for (let i = i0; i !== i1 + st; i += st) ids.push(i);
      const poly = ids.map((i) => [L.x[i], L.z[i]]).concat(V.outer.map((p) => [p[0], p[1]]));
      // 需要过渡到原地形的外缘边（谷地接山坡处）
      const soft = [];
      let prev = poly[ids.length - 1];
      for (const p of V.outer) { if (p[2]) soft.push([prev, p]); prev = p; }
      if (V.softClose) soft.push([prev, poly[0]]);
      this.valleys.push({ id: V.id, poly, run: V.run, i0: Math.min(i0, i1), i1: Math.max(i0, i1) });
      const vi = this.valleys.length;
      // 崖线的距离场（光栅化：每格记最近距离与弧长 → 崖线上的序号）
      const runLine = new Polyline(ids.map((i) => [L.x[i], L.z[i]]));
      const RD = new Float32Array(N).fill(1e9), RS = new Float32Array(N);
      rasterLine(runLine, g, 60, RD, RS);
      const ds = L.ds;
      fillPoly(poly, (i, j, x, z) => {
        const k = j * g.nx + i;
        VM[k] = vi;
        for (const p of this.hardPads) if (sdRect(x, z, p) <= 0) return;
        const dRun = RD[k], iRun = ids[Math.min(ids.length - 1, Math.round(RS[k] / ds))];
        let dOpen = Infinity;
        for (const [pa, pb] of soft) dOpen = Math.min(dOpen, segDist(x, z, pa[0], pa[1], pb[0], pb[1]));
        let ws = 0, ys = 0;
        for (const [fx, fz, fy] of V.floor) { const w = 1 / ((x - fx) ** 2 + (z - fz) ** 2 + 9); ws += w; ys += w * fy; }
        let floor = ys / ws + 1.4 * (1 - smoothstep(1.0, 7.0, dRun)) + fbm(this.noise, x / 21 + 7.3, z / 21, 3) * 1.3 + this.noise(x / 6.3, z / 6.3 - 4) * 0.35;
        if (SD[k] < 16) floor = Math.max(floor, this.streamY(SS[k]) + 0.35 + 0.3 * Math.max(0, SD[k] - this.streamHalf(SS[k]) - 1.2));
        const carve = Math.max(floor, top[iRun] - dRun * 40);
        if (carve >= H[k]) return;
        H[k] -= (H[k] - carve) * smoothstep(0, 8, dOpen);
      });
    }
    // 谷中石柱：圈内抬到柱顶（略呈缓丘），圈外即谷底（陡落由岩壁网格遮住）
    for (const r of CLIFF_RUNS) {
      if (!r.closed) continue;
      const L = lines[r.id], poly = [];
      for (let i = 0; i < L.N - 1; i++) poly.push([L.x[i], L.z[i]]);
      const [cx, cz] = r.center;
      fillPoly(poly, (i, j, x, z) => {
        const d = Math.hypot(x - cx, z - cz) / r.r;
        H[j * g.nx + i] = r.top + 0.6 * Math.max(0, 1 - d * d) + this.noise(x / 3.1, z / 3.1) * 0.15;
      });
    }
    // 崖脚落水潭：水面取潭沿一圈的最低处再低一点，潭底下挖成浅碗
    this.pools = [];
    for (const P of CLIFF_POOLS) {
      let rimMin = Infinity;
      for (let a = 0; a < 24; a++) rimMin = Math.min(rimMin, this._bilin(H, g, P.x + Math.cos(a / 24 * Math.PI * 2) * (P.r + 0.7), P.z + Math.sin(a / 24 * Math.PI * 2) * (P.r + 0.7)));
      const level = rimMin - 0.12;
      for (let j = Math.floor(P.z - P.r - 2 - g.z0); j <= Math.ceil(P.z + P.r + 2 - g.z0); j++) for (let i = Math.floor(P.x - P.r - 2 - g.x0); i <= Math.ceil(P.x + P.r + 2 - g.x0); i++) {
        const x = g.x0 + i, z = g.z0 + j, d = Math.hypot(x - P.x, z - P.z), k = j * g.nx + i;
        if (d < P.r) H[k] = Math.min(H[k], level - 0.08 - P.depth * (1 - (d / P.r) ** 2));
        else if (d < P.r + 1.2) H[k] = Math.min(H[k], lerp(level - 0.08, level + 0.25, smoothstep(P.r, P.r + 1.2, d)));
        if (d < P.r + 0.3) this.water[k] = level;
      }
      this.pools.push({ ...P, level });
    }
  }
  // 是否在某处深谷之内（植被、云气等按此避让或布置）：查 1 米格的深谷遮罩
  inValley(x, z) {
    if (!this.valleyMask || !this.inCore(x, z)) return null;
    const g = this.core, i = Math.round(x - g.x0), j = Math.round(z - g.z0), v = this.valleyMask[j * g.nx + i];
    return v ? this.valleys[v - 1] : null;
  }

  // ---------- 查询 ----------
  _bilin(H, g, x, z) {
    const fx = (x - g.x0) / g.step, fz = (z - g.z0) / g.step;
    const i = clamp(Math.floor(fx), 0, g.nx - 2), j = clamp(Math.floor(fz), 0, g.nz - 2);
    const u = clamp(fx - i, 0, 1), v = clamp(fz - j, 0, 1), k = j * g.nx + i;
    // 与网格三角剖分一致（对角线 (i,j)-(i+1,j+1)）
    if (u >= v) return H[k] + (H[k + 1] - H[k]) * u + (H[k + g.nx + 1] - H[k + 1]) * v;
    return H[k] + (H[k + g.nx] - H[k]) * v + (H[k + g.nx + 1] - H[k + g.nx]) * u;
  }
  inCore(x, z, m = 0) { return x >= CORE.x0 + m && x <= CORE.x1 - m && z >= CORE.z0 + m && z <= CORE.z1 - m; }
  inOuter(x, z) { return Math.abs(x) <= OUTER.x1 - 1 && Math.abs(z) <= OUTER.z1 - 1; }
  heightAt(x, z) {
    if (this.inCore(x, z)) return this._bilin(this.h, this.core, x, z);
    if (this.inOuter(x, z) && Math.hypot(x, z) < FAR_R0 + 20) return this._bilin(this.oh, this.outer, x, z);
    return this.farHeight(x, z);
  }
  // 远景环带的高度（与网格一致：交界处略压低，免得两层网格争深度）
  farHeight(x, z) {
    const r = Math.hypot(x, z);
    return this.natural(x, z) - (r < FAR_R0 + 45 ? 1.6 * (1 - Math.max(0, r - FAR_R0) / 45) : 0);
  }
  // 水面高度（无水返回 null）
  waterAt(x, z) {
    if (!this.inCore(x, z)) return null;
    const g = this.core, i = Math.round(x - g.x0), j = Math.round(z - g.z0);
    const w = this.water[j * g.nx + i];
    return Number.isNaN(w) ? null : w;
  }
  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 0.7;
    return out.set(this.heightAt(x - e, z) - this.heightAt(x + e, z), 2 * e, this.heightAt(x, z - e) - this.heightAt(x, z + e)).normalize();
  }
  padAt(x, z) {
    for (const p of PADS) if (sdPad(x, z, p) <= 0) return p;
    return null;
  }
  // 遮罩值（0..1）：r 土路 g 石铺 b 田土 a 方砖
  maskAt(x, z) {
    const m = this.maskInfo;
    const i = clamp(Math.round((x - m.x0) / MASK_RES), 0, m.w - 1), j = clamp(Math.round((z - m.z0) / MASK_RES), 0, m.h - 1);
    const k = (j * m.w + i) * 4, d = m.data;
    return { r: d[k] / 255, g: d[k + 1] / 255, b: d[k + 2] / 255, a: d[k + 3] / 255 };
  }

  // ---------- 遮罩 ----------
  buildMask() {
    const w = Math.round((CORE.x1 - CORE.x0) / MASK_RES) + 1, h = Math.round((CORE.z1 - CORE.z0) / MASK_RES) + 1;
    const data = new Uint8Array(w * h * 4);
    const x0 = CORE.x0, z0 = CORE.z0;
    const put = (i, j, ch, v) => { const k = (j * w + i) * 4 + ch; const b = Math.round(clamp(v, 0, 1) * 255); if (b > data[k]) data[k] = b; };
    const rect = (r, ch, v = 1, feather = 0.6) => {
      const [ax, bx, az, bz] = r;
      const i0 = Math.max(0, Math.floor((ax - feather - x0) / MASK_RES)), i1 = Math.min(w - 1, Math.ceil((bx + feather - x0) / MASK_RES));
      const j0 = Math.max(0, Math.floor((az - feather - z0) / MASK_RES)), j1 = Math.min(h - 1, Math.ceil((bz + feather - z0) / MASK_RES));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = x0 + i * MASK_RES, z = z0 + j * MASK_RES;
        const d = sdRect(x, z, { x0: ax, x1: bx, z0: az, z1: bz });
        put(i, j, ch, v * (1 - smoothstep(-feather * 0.5, feather * 0.5, d)));
      }
    };
    const line = (pts, hw, ch, v = 1, feather = 0.8) => {
      for (let s = 0; s < pts.length - 1; s++) {
        const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9, R = hw + feather;
        const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - x0) / MASK_RES)), i1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + R - x0) / MASK_RES));
        const j0 = Math.max(0, Math.floor((Math.min(az, bz) - R - z0) / MASK_RES)), j1 = Math.min(h - 1, Math.ceil((Math.max(az, bz) + R - z0) / MASK_RES));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = x0 + i * MASK_RES, z = z0 + j * MASK_RES;
          const u = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
          const d = Math.hypot(x - ax - dx * u, z - az - dz * u);
          put(i, j, ch, v * (1 - smoothstep(hw - feather * 0.5, hw + feather * 0.5, d)));
        }
      }
    };
    // a 通道：1 方砖；0.3 暖白大石板（广场、云顶）
    for (const p of PAVINGS) {
      if (p.kind === 'yard') rect(p.rect, 0, 0.85, 1.2);
      else { rect(p.rect, 1, 1, 0.5); if (p.kind === 'court') rect(p.rect, 3, 1, 0.3); else if (p.kind === 'white') rect(p.rect, 3, 0.3, 0.3); }
    }
    for (const wk of WALKS) line(wk.pts, wk.w / 2, 1, 1, 0.5);
    for (const p of this.paths) {
      const pts = p.pts.map((q) => [q[0], q[1]]);
      if (p.kind === 'pave') line(pts, p.w / 2, 1, 1, 0.6);
      else line(pts, p.w / 2, 0, p.kind === 'faint' ? 0.5 : 1, p.kind === 'faint' ? 1.6 : 1.1);
    }
    for (const s of this.stairs) rect([s.x - s.w / 2 - 1.4, s.x + s.w / 2 + 1.4, s.info.zt - 0.5, s.info.zb + 0.5], 1, 1, 0.4);
    for (const f of FIELD_PLOTS) rect(f.rect, 2, 1, 0.35);
    // 溪岸卵石（按线段包围盒光栅化）
    {
      const g = { x0, z0, step: MASK_RES, nx: w, nz: h };
      const D = new Float32Array(w * h).fill(1e9), S = new Float32Array(w * h);
      rasterLine(this.stream.line, g, 5.5, D, S);
      for (let k = 0; k < w * h; k++) {
        if (D[k] > 5.5) continue;
        const half = this.streamHalf(S[k]);
        const v = Math.round(clamp(0.75 * (1 - smoothstep(half, half + 1.8, D[k])), 0, 1) * 255);
        if (v > data[k * 4]) data[k * 4] = v;
      }
    }
    this.maskInfo = { data, w, h, x0, z0 };
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.maskTex = tex;
  }

  // ---------- 网格与材质 ----------
  build(scene) {
    const mat = this.material = createTerrainMaterial(this.maskTex, this.quality);
    // 核心
    const g = this.core, nV = g.nx * g.nz;
    const pos = new Float32Array(nV * 3), nrm = new Float32Array(nV * 3);
    for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
      const k = j * g.nx + i;
      pos[k * 3] = g.x0 + i; pos[k * 3 + 1] = this.h[k]; pos[k * 3 + 2] = g.z0 + j;
      const hl = this.h[j * g.nx + Math.max(0, i - 1)], hr = this.h[j * g.nx + Math.min(g.nx - 1, i + 1)];
      const hd = this.h[Math.max(0, j - 1) * g.nx + i], hu = this.h[Math.min(g.nz - 1, j + 1) * g.nx + i];
      let nx = hl - hr, ny = 2, nz = hd - hu;
      const l = Math.hypot(nx, ny, nz); nrm[k * 3] = nx / l; nrm[k * 3 + 1] = ny / l; nrm[k * 3 + 2] = nz / l;
    }
    const idx = new Uint32Array((g.nx - 1) * (g.nz - 1) * 6);
    let o = 0;
    for (let j = 0; j < g.nz - 1; j++) for (let i = 0; i < g.nx - 1; i++) {
      const a = j * g.nx + i, b = a + 1, c = a + g.nx, d = c + 1;
      idx[o++] = a; idx[o++] = c; idx[o++] = d; idx[o++] = a; idx[o++] = d; idx[o++] = b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const core = new THREE.Mesh(geo, mat);
    core.receiveShadow = true;
    core.name = 'terrain-core';
    scene.add(core);

    // 外围（挖去核心，重叠一格并略压低，接缝处加裙边）
    const G = this.outer;
    const opos = new Float32Array(G.nx * G.nz * 3), onrm = new Float32Array(G.nx * G.nz * 3);
    const inner = (x, z) => x > CORE.x0 + 0.1 && x < CORE.x1 - 0.1 && z > CORE.z0 + 0.1 && z < CORE.z1 - 0.1;
    for (let j = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++) {
      const k = j * G.nx + i, x = G.x0 + i * G.step, z = G.z0 + j * G.step;
      opos[k * 3] = x; opos[k * 3 + 1] = this.oh[k] - (inner(x, z) ? 1.2 : 0); opos[k * 3 + 2] = z;
      const hl = this.oh[j * G.nx + Math.max(0, i - 1)], hr = this.oh[j * G.nx + Math.min(G.nx - 1, i + 1)];
      const hd = this.oh[Math.max(0, j - 1) * G.nx + i], hu = this.oh[Math.min(G.nz - 1, j + 1) * G.nx + i];
      const nx = hl - hr, ny = 2 * G.step, nz = hd - hu, l = Math.hypot(nx, ny, nz);
      onrm[k * 3] = nx / l; onrm[k * 3 + 1] = ny / l; onrm[k * 3 + 2] = nz / l;
    }
    const oidx = [];
    for (let j = 0; j < G.nz - 1; j++) for (let i = 0; i < G.nx - 1; i++) {
      const xa = G.x0 + i * G.step, za = G.z0 + j * G.step;
      if (xa >= CORE.x0 + G.step && xa + G.step <= CORE.x1 - G.step && za >= CORE.z0 + G.step && za + G.step <= CORE.z1 - G.step) continue;
      if (Math.min(Math.hypot(xa, za), Math.hypot(xa + G.step, za), Math.hypot(xa, za + G.step), Math.hypot(xa + G.step, za + G.step)) > FAR_R0 + 25) continue;
      const a = j * G.nx + i, b = a + 1, c = a + G.nx, d = c + 1;
      oidx.push(a, c, d, a, d, b);
    }
    const ogeo = new THREE.BufferGeometry();
    ogeo.setAttribute('position', new THREE.BufferAttribute(opos, 3));
    ogeo.setAttribute('normal', new THREE.BufferAttribute(onrm, 3));
    ogeo.setIndex(oidx);
    ogeo.computeBoundingSphere();
    const outer = new THREE.Mesh(ogeo, mat);
    outer.receiveShadow = true;
    outer.name = 'terrain-outer';
    scene.add(outer);

    // 远景环带：极坐标网格，越远越疏（真实高程的群峰）
    const NA = this.quality === 'low' ? 200 : 320, NR = this.quality === 'low' ? 30 : 44;
    const fpos = new Float32Array((NA + 1) * (NR + 1) * 3), fnrm = new Float32Array((NA + 1) * (NR + 1) * 3);
    for (let j = 0; j <= NR; j++) {
      const r = FAR_R0 * Math.pow(FAR_R1 / FAR_R0, j / NR), e = Math.max(8, r * 0.012);
      for (let i = 0; i <= NA; i++) {
        const a = (i / NA) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r, k = (j * (NA + 1) + i) * 3;
        fpos[k] = x; fpos[k + 1] = this.farHeight(x, z); fpos[k + 2] = z;
        const nx = this.natural(x - e, z) - this.natural(x + e, z), nz = this.natural(x, z - e) - this.natural(x, z + e), l = Math.hypot(nx, 2 * e, nz);
        fnrm[k] = nx / l; fnrm[k + 1] = (2 * e) / l; fnrm[k + 2] = nz / l;
      }
    }
    const fidx = [];
    for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) {
      const a = j * (NA + 1) + i, b = a + 1, c = a + NA + 1, d = c + 1;
      fidx.push(a, b, d, a, d, c);
    }
    const fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
    fgeo.setAttribute('normal', new THREE.BufferAttribute(fnrm, 3));
    fgeo.setIndex(fidx);
    fgeo.computeBoundingSphere();
    const far = new THREE.Mesh(fgeo, mat);
    far.receiveShadow = false;
    far.name = 'terrain-far';
    scene.add(far);

    // 裙边
    const sk = [], skn = [];
    const edge = [];
    for (let i = 0; i < g.nx; i++) edge.push([i, 0]);
    for (let j = 0; j < g.nz; j++) edge.push([g.nx - 1, j]);
    for (let i = g.nx - 1; i >= 0; i--) edge.push([i, g.nz - 1]);
    for (let j = g.nz - 1; j >= 0; j--) edge.push([0, j]);
    for (let e = 0; e < edge.length - 1; e++) {
      const [i0, j0] = edge[e], [i1, j1] = edge[e + 1];
      const A = [g.x0 + i0, this.h[j0 * g.nx + i0], g.z0 + j0], B = [g.x0 + i1, this.h[j1 * g.nx + i1], g.z0 + j1];
      sk.push(...A, ...B, A[0], A[1] - 3, A[2], ...B, B[0], B[1] - 3, B[2], A[0], A[1] - 3, A[2]);
      for (let q = 0; q < 6; q++) skn.push(0, 1, 0);
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.Float32BufferAttribute(sk, 3));
    sgeo.setAttribute('normal', new THREE.Float32BufferAttribute(skn, 3));
    const skirt = new THREE.Mesh(sgeo, mat);
    skirt.material = mat.clone();
    skirt.material.side = THREE.DoubleSide;
    skirt.material.onBeforeCompile = mat.onBeforeCompile;
    skirt.material.customProgramCacheKey = () => 'terrain-skirt';
    scene.add(skirt);
    this.meshes = [core, outer, skirt, far];
    return this;
  }
}

// 地表材质：实拍贴图（Poly Haven CC0）提供明暗、色差与法线，颜色拉向统一的国风色板。
// 草地两张贴图交错 + 大尺度色块；岩面三向投影（灰青石，平缓处生苔）；铺地按遮罩：暖白大石板 / 条石方砖；
// 土路、田土、落叶仍为程序化；视距越远越简化（林地色块、岩面减对比），远处由雾完成空气透视
function createTerrainMaterial(maskTex, quality) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  const rect = new THREE.Vector4(CORE.x0, CORE.z0, CORE.x1 - CORE.x0, CORE.z1 - CORE.z0);
  const T = ASSETS.tex, has = !!(T.grass_d && T.grass2_d && T.grassfar_d && T.rock_d && T.mossrock_d && T.paving_d && T.block_d);
  const nrm = has && !!(T.rock_n && T.paving_n && T.block_n) && quality !== 'low';
  const RS = T.mside_d ? '7.5' : '5.', RL = T.mside_d ? '.49' : '.56';          // 岩面贴图的世界尺度、亮度均值
  // 林地遮罩（由植被分布烘焙，见 vegetation.js）：林下地表偏深，林间空地为草坡
  mat.userData.forest = { value: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1) };
  mat.userData.forest.value.needsUpdate = true;
  mat.userData.forestRect = { value: new THREE.Vector4(-1200, -1240, 2400, 2400) };
  mat.onBeforeCompile = (sh) => {
    injectFog(sh);
    sh.uniforms.uMask = { value: maskTex };
    sh.uniforms.uMaskRect = { value: rect };
    sh.uniforms.uForest = mat.userData.forest;
    sh.uniforms.uForestRect = mat.userData.forestRect;
    // 第十轮：陡坡岩面与崖壁、扫描岩体同用扫描岩壁烘焙的四方连续贴图（7.5 米一幅）
    if (has) for (const [u, k] of [['tGrass', 'grass_d'], ['tGrass2', 'grass2_d'], ['tGrassFar', 'grassfar_d'], ['tRock', T.mside_d ? 'mside_d' : T.cliff_d ? 'cliff_d' : 'rock_d'], ['tMoss', 'mossrock_d'], ['tPave', 'paving_d'], ['tBlock', 'block_d'], ['tRockN', T.mside_n ? 'mside_n' : T.cliff_n ? 'cliff_n' : 'rock_n'], ['tPaveN', 'paving_n'], ['tBlockN', 'block_n']]) sh.uniforms[u] = { value: T[k] || null };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${has ? '#define HAS_TEX' : ''}
        ${nrm ? '#define HAS_NRM' : ''}
        uniform sampler2D uMask; uniform vec4 uMaskRect; varying vec3 vWorld; varying vec3 vWN;
        uniform sampler2D uForest; uniform vec4 uForestRect;
        #ifdef HAS_TEX
          uniform sampler2D tGrass, tGrass2, tGrassFar, tRock, tMoss, tPave, tBlock;
        #endif
        #ifdef HAS_NRM
          uniform sampler2D tRockN, tPaveN, tBlockN;
        #endif
        ${NOISE_GLSL}
        float tBump; float tRough; vec3 tN; float tNw;
        vec3 sRGB(vec3 c){ return pow(c, vec3(2.2)); }
        float lum(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        vec3 groundColor(){
          vec2 p = vWorld.xz;
          vec2 muv = (p - uMaskRect.xy) / uMaskRect.zw;
          vec4 m = vec4(0.);
          if (muv.x > 0. && muv.x < 1. && muv.y > 0. && muv.y < 1.) m = texture2D(uMask, muv);
          vec2 pm = mod(p, 4096.);
          float dist = length(vViewPosition);
          float far = smoothstep(240., 1100., dist);
          float n1 = nzf(pm * .045), n2 = nzv(pm * .55), n3 = nzv(pm * 2.6);
          tBump = 0.; tRough = .95; tN = vec3(0., 1., 0.); tNw = 0.;
          // ---------- 草地 ----------
          #ifdef HAS_TEX
            vec3 gA = texture2D(tGrass, p / 3.1).rgb, gB = texture2D(tGrass2, p / 4.3 + vec2(.37, .71)).rgb;
            float gm = smoothstep(.32, .68, n1 + (nzv(pm * .09) - .5) * .5);
            vec3 gt = mix(gA, gB, gm);
            float gl = lum(gt);
            vec3 grass = mix(sRGB(vec3(.23, .30, .21)), sRGB(vec3(.50, .55, .39)), smoothstep(.1, .6, gl));
            grass = mix(grass, gt * vec3(.8, .9, .8), .3);
            grass *= .78 + .5 * lum(texture2D(tGrassFar, p / 46.).rgb);
          #else
            vec3 grass = mix(sRGB(vec3(.33, .39, .27)), sRGB(vec3(.46, .49, .34)), smoothstep(.3, .75, n1)) * (.86 + .22 * n3);
          #endif
          grass = mix(grass, sRGB(vec3(.58, .55, .40)), smoothstep(.64, .86, n2) * .22);
          // 林地：林下地表偏深（与植被分布一致），林间空地为草坡；视距越远越接近林地色块（中远景山坡的“点苔”）
          vec2 fuv = (p - uForestRect.xy) / uForestRect.zw;
          float fo = (fuv.x > 0. && fuv.x < 1. && fuv.y > 0. && fuv.y < 1.) ? texture2D(uForest, fuv).r : 0.;
          vec3 forest = mix(sRGB(vec3(.13, .20, .15)), sRGB(vec3(.27, .35, .25)), smoothstep(.28, .72, nzf(pm * .021 + 4.)));
          forest *= .85 + .3 * n3;
          grass = mix(grass, forest, clamp(max(far * .8, smoothstep(.15, .75, fo) * .82), 0., 1.));
          // 深谷谷底（第八轮）：阴湿的苔色与碎石滩，比台上的草地暗
          float lowV = smoothstep(3., -9., vWorld.y) * (1. - far) * smoothstep(-40., -10., vWorld.z + 140.);
          grass = mix(grass, sRGB(vec3(.19, .26, .18)) * (.85 + .3 * n3), lowV * .5);
          // ---------- 岩面 ----------
          float slope = 1. - vWN.y;
          float rk = smoothstep(.17, .38, slope + (n2 - .5) * .2);

          // 高处：花岗岩裸露（远山山顶灰青，草木退到沟谷与缓坡）
          float hiR = smoothstep(75., 200., vWorld.y + (n1 - .5) * 50.);
          rk = max(rk, hiR * smoothstep(.04, .26, slope + (n2 - .5) * .3));
          vec3 bw = pow(abs(vWN), vec3(4.)); bw /= bw.x + bw.y + bw.z;
          #ifdef HAS_TEX
            vec3 rt = texture2D(tRock, vWorld.zy / ${RS}).rgb * bw.x + texture2D(tRock, vWorld.xz / ${RS}).rgb * bw.y + texture2D(tRock, vWorld.xy / ${RS}).rgb * bw.z;
            // 第十轮：另取一层（尺度 1.63 倍、错位），按大尺度噪声成片替换，打散岩面贴图在大片陡壁上的重复
            if (rk > .02) {
              vec3 w2 = vWorld + vec3(13.7, 5.3, 29.1); float s2 = ${RS} * 1.63;
              vec3 rt2 = texture2D(tRock, w2.zy / s2).rgb * bw.x + texture2D(tRock, w2.xz / s2).rgb * bw.y + texture2D(tRock, w2.xy / s2).rgb * bw.z;
              rt = mix(rt, rt2, smoothstep(.32, .68, nzf(pm * .011 + vec2(5.1, vWorld.y * .008))));
            }
            // 与崖壁同一套岩色：青灰、灰白、暖灰按大尺度噪声成片过渡
            float tA = nzf(pm * .018 + vec2(vWorld.y * .02, 0.));
            vec3 rbase = mix(sRGB(vec3(.50, .55, .57)), sRGB(vec3(.70, .69, .66)), smoothstep(.35, .62, tA));
            rbase = mix(rbase, sRGB(vec3(.65, .60, .53)), smoothstep(.66, .86, tA));
            vec3 rock = rbase * clamp(.28 + .8 * lum(rt) / ${RL}, .2, 1.2) * (.78 + .36 * nzf(vec2((pm.x + pm.y) * .035, vWorld.y * .05) + 2.7));
            vec3 moss = texture2D(tMoss, vWorld.xz / 6. + vWorld.y * .03).rgb;
            rock = mix(rock, moss * vec3(.78, .9, .76), smoothstep(.58, .86, vWN.y) * .5);
          #else
            vec3 rock = sRGB(vec3(.48, .49, .47)) * (.75 + .3 * nzf(vec2((pm.x + pm.y * .7) * .32, vWorld.y * .045)));
          #endif
          // 远处岩面偏冷的青灰，缓坡与岩隙带青绿（青绿山水的设色）
          rock = mix(rock, sRGB(vec3(.37, .41, .41)) * (.85 + .3 * n1), far * .6);
          rock = mix(rock, sRGB(vec3(.24, .31, .27)) * (.85 + .3 * n3), far * smoothstep(.45, .75, nzf(pm * .012 + 2.)) * (1. - smoothstep(.45, .75, slope)) * .55);
          // 中远山崖面：岩层的明暗分层（竖向皴纹），岩脊与崖台上的松林、苔斑（随高度减少）
          float cliffFar = far * rk;
          if (cliffFar > .01) {
            float strata = nzf(vec2((pm.x + pm.y) * .011, vWorld.y * .045));
            rock *= mix(1., .8 + .4 * strata, cliffFar);
            float vg = smoothstep(.5, .68, nzf(vec2((pm.x - pm.y) * .02 + 5., vWorld.y * .03)) + (1. - slope) * .25) * smoothstep(440., 150., vWorld.y + (n1 - .5) * 90.);
            rock = mix(rock, sRGB(vec3(.17, .25, .21)) * (.85 + .3 * n2), vg * cliffFar * .72);
          }
          // 近处崖壁（深涧、深谷）：水平岩层的明暗、竖向的水痕与裂隙，岩坎上挂着青苔
          float nearR = rk * (1. - far);
          if (nearR > .01) {
            float strataN = nzf(vec2((pm.x + pm.y) * .045, vWorld.y * .32 + nzv(pm * .05) * 1.5));
            rock *= mix(1., .8 + .4 * strataN, nearR);
            float streak = nzv(vec2((pm.x - pm.y * .6) * .75, vWorld.y * .035));
            rock *= 1. - nearR * smoothstep(.6, .92, streak) * .28;
            rock = mix(rock, sRGB(vec3(.30, .38, .27)) * (.8 + .3 * n3), nearR * smoothstep(.62, .82, vWN.y + (n2 - .5) * .4) * .55);
          }
          vec3 col = mix(grass, rock, rk);
          #ifdef HAS_NRM
            if (rk > .02 && dist < 260.) {
              vec3 nx = texture2D(tRockN, vWorld.zy / ${RS}).xyz * 2. - 1., ny = texture2D(tRockN, vWorld.xz / ${RS}).xyz * 2. - 1., nz = texture2D(tRockN, vWorld.xy / ${RS}).xyz * 2. - 1.;
              nx = vec3(nx.xy + vWN.zy, abs(nx.z) * vWN.x); ny = vec3(ny.xy + vWN.xz, abs(ny.z) * vWN.y); nz = vec3(nz.xy + vWN.xy, abs(nz.z) * vWN.z);
              tN = normalize(nx.zyx * bw.x + ny.xzy * bw.y + nz.xyz * bw.z); tNw = rk * (1. - smoothstep(120., 260., dist));
            }
          #endif
          tBump += n3 * .03 * (1. - rk);
          // ---------- 土路、溪岸卵石 ----------
          float dirt = smoothstep(.25, .7, m.r + (n2 - .5) * .45);
          vec3 dcol = mix(sRGB(vec3(.52, .46, .37)), sRGB(vec3(.44, .40, .34)), n3);
          #ifdef HAS_TEX
            dcol *= .75 + .5 * lum(gB);
          #endif
          float peb = smoothstep(.55, .75, nzv(pm * 9.)) * dirt;
          dcol = mix(dcol, sRGB(vec3(.64, .62, .58)), peb * .6);
          col = mix(col, dcol, dirt);
          tBump += dirt * peb * .05;
          // ---------- 田土（田垄）----------
          float fld = smoothstep(.4, .6, m.b);
          float furrow = abs(fract(p.x / .62) - .5) * 2.;
          vec3 fcol = mix(sRGB(vec3(.27, .22, .17)), sRGB(vec3(.40, .33, .25)), smoothstep(.15, .85, furrow)) * (.9 + .2 * n3);
          col = mix(col, fcol, fld);
          tBump += fld * smoothstep(.2, .9, furrow) * .07;
          // ---------- 铺地：暖白大石板（广场、云顶）/ 条石方砖（院落）/ 石板路 ----------
          float pv = smoothstep(.42, .62, m.g + (n3 - .5) * .12);
          if (pv > .001) {
            float isBr = step(.6, m.a), isWh = smoothstep(.12, .24, m.a) * (1. - isBr);
            // 石板（广场、云顶的白石 1.6×1.05 米；石板路 1.2×0.8 米）：逐行错缝，接缝细而柔和，
            // 一个像素的地面尺寸超过接缝宽度后接缝随之淡出（远处不闪、不出摩尔纹）；每块石色略有冷暖深浅之差
            vec2 sz = mix(vec2(1.2, .8), vec2(1.6, 1.05), isWh);
            vec2 sg = p / sz;
            float row = floor(sg.y);
            sg.x += mod(row, 2.) * .5;
            vec2 cell = vec2(floor(sg.x), row), fc = fract(sg);
            vec2 dj = min(fc, 1. - fc) * sz;
            float dJ = min(dj.x, dj.y);
            float aa = max(fwidth(p.x), fwidth(p.y)) + 1e-4;
            float nj = 1. - smoothstep(.025, .08, aa);
            float joint = (1. - smoothstep(.011 - aa * .5, .011 + aa * .5, dJ)) * nj;
            float edge = (1. - smoothstep(.011, .06, dJ)) * nj;
            float tone = h21(cell * vec2(1.7, 3.1) + 9.), warm = h21(cell + 3.3);
            vec3 slab = mix(sRGB(vec3(.64, .63, .60)), sRGB(vec3(.80, .775, .725)), isWh) * (.91 + .15 * tone);     // 暖白石（#D8D5C9 起步，板与板略有色差）
            slab *= mix(vec3(1.), vec3(1.03, 1.005, .965), step(.62, warm));
            #ifdef HAS_TEX
              vec2 pu = p / 4.6, bu = p / 2.3 + vec2(.21, .63);
              vec3 tp = texture2D(tPave, pu).rgb, tb = texture2D(tBlock, bu).rgb;
              // 实拍贴图只取表面颗粒（相对均值的明暗）
              slab *= mix(1., clamp(lum(tp) / .138, .6, 1.45), .52);
              vec3 brick = mix(sRGB(vec3(.52, .51, .48)), sRGB(vec3(.80, .78, .73)), smoothstep(.12, .62, lum(tb)));
              #ifdef HAS_NRM
                if (dist < 140. && isBr > .5) {
                  vec3 pn = texture2D(tBlockN, bu).xyz * 2. - 1.;
                  pn.xy *= .55;
                  tN = mix(tN, normalize(vec3(pn.x, pn.z, -pn.y)), pv); tNw = mix(tNw, pv * (1. - smoothstep(60., 140., dist)), pv);
                }
              #endif
            #else
              vec3 brick = mix(sRGB(vec3(.55, .54, .5)), sRGB(vec3(.7, .68, .63)), n2);
            #endif
            slab *= 1. - joint * .3 - edge * .05;
            vec3 stone = mix(slab, brick, isBr);
            stone = mix(stone, stone * vec3(.93, .97, .9), smoothstep(.62, .9, n1) * .5);
            col = mix(col, stone, pv);
            tBump = mix(tBump, n3 * .004 - (1. - isBr) * (joint * .008 + edge * .002), pv);
            tRough = mix(tRough, .8, pv);
          }
          // ---------- 落叶斑 ----------
          float lp = smoothstep(.66, .82, nzf(pm * .06 + 11.)) * (1. - fld) * (1. - pv);
          float leaf = smoothstep(.78, .86, nzv(pm * 5.3 + 3.)) * lp;
          vec3 lcol = mix(sRGB(vec3(.66, .50, .26)), sRGB(vec3(.56, .40, .22)), h21(floor(pm * 5.3)));
          col = mix(col, lcol, leaf * .85);
          return col;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${BASINS.filter((q) => !q.rect).map((q) => `{ vec2 be = (vWorld.xz - vec2(${q.x.toFixed(2)}, ${q.z.toFixed(2)})) / vec2(${q.rx.toFixed(2)}, ${q.rz.toFixed(2)}); float ba = atan(be.y, be.x);
          if (length(be) < (1.${q.shape.map(([n, amp, ph]) => ` + ${amp.toFixed(4)} * sin(${n.toFixed(1)} * ba + ${ph.toFixed(4)})`).join('')}) * .999) discard; }`).join('\n')}
        diffuseColor.rgb *= groundColor();`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = tRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 R1 = cross(sy, normal), R2 = cross(normal, sx);
          float det = dot(sx, R1);
          vec2 dh = vec2(dFdx(tBump), dFdy(tBump));
          vec3 g = sign(det) * (dh.x * R1 + dh.y * R2);
          normal = normalize(abs(det) * normal - g);
          if (tNw > .001) normal = normalize(mix(normal, normalize((viewMatrix * vec4(tN, 0.)).xyz), clamp(tNw, 0., 1.)));
        }`);
  };
  mat.customProgramCacheKey = () => `terrain-${quality}-${has ? 't' : 'p'}${nrm ? 'n' : ''}${T.mside_d ? 'm' : ''}`;
  return mat;
}
