// 宗门建筑（第十轮）：assets/buildings/01.fbx 转换出的各栋模型（tools/convert_buildings.py → converted/buildings/buildings.glb、buildings.json）
// 每栋保留原结构与贴图（屋瓦调成青灰、朱红略压、招牌字抹去；凌云阁横匾改写），按位置缩放、转向放上台地：
//   · 自带底座面与台面对齐（模型下沉底座高度，留 3 厘米免得与台面争深度）；
//   · 碰撞由 0.5 米网格合成：走得到的台基、踏道、廊面为可走面（同高的格合并成矩形），栏杆、矮墙为矮挡，
//     墙、柱、门扇与殿内为高挡（直到屋顶，镜头与遮挡淡化都按它；第十三轮起御剑也把它当实心，飞不进殿里）；
//     墙体外扩 1.5 米、离地 3 米以上为檐（镜头不钻进屋檐；御剑不算，檐下飞得过）；
//   · 淡化（镜头被挡时半隐、钻进屋内时隐去）与程序化建筑一致。
import * as THREE from 'three';
import { ASSETS } from './assets.js';
import { attachFade } from './arch/builder.js';

const DEC = {};
function b64(s) { const bin = atob(s), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }

// 模型信息：尺寸 size [宽 x, 高 y, 深 z]、底座高 plinth、碰撞网格（F 可走面高度 / 米，B 0 可走 1 矮挡 2 高挡）
export function bldInfo(key) {
  if (DEC[key]) return DEC[key];
  const m = ASSETS.json.buildings?.models?.[key];
  if (!m) return null;
  const g = m.grid, n = g.nx * g.nz;
  const fb = b64(g.f), F = new Float32Array(n), raw = new Int16Array(fb.buffer, 0, n);
  for (let k = 0; k < n; k++) F[k] = raw[k] / 100;
  return (DEC[key] = { ...m, F, B: b64(g.b) });
}

// 网格上的同值区域合并成矩形（贪心：先沿 x 延伸，再整行沿 z 延伸）
function rects(lab, nx, nz) {
  const used = new Uint8Array(nx * nz), out = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, L = lab[k];
    if (!L || used[k]) continue;
    let w = 1;
    while (i + w < nx && lab[k + w] === L && !used[k + w]) w++;
    let h = 1;
    grow: while (j + h < nz) {
      for (let t = 0; t < w; t++) { const kk = (j + h) * nx + i + t; if (lab[kk] !== L || used[kk]) break grow; }
      h++;
    }
    for (let jj = 0; jj < h; jj++) for (let t = 0; t < w; t++) used[(j + jj) * nx + i + t] = 1;
    out.push({ i, j, w, h, L });
  }
  return out;
}

// 碰撞盒（模型本地、已缩放；原点为放置点，y 0 为台面）。solids：额外整块阻挡的本地矩形 [x0, x1, z0, z1]（缩放前）
function colliders(info, s, mirror, solids = []) {
  const { nx, nz, res, x0, z0 } = info.grid, base = info.plinth, top = info.size[1];
  const N = nx * nz, F = info.F, B = info.B;
  const walk = new Int32Array(N), low = new Int32Array(N), tall = new Int32Array(N), eave = new Int32Array(N);
  for (let k = 0; k < N; k++) {
    const f = F[k];
    if (B[k]) {
      if (f < base - 0.2) continue;                                      // 底座外缘落在台面以下的一圈（被埋掉）
      (B[k] === 2 ? tall : low)[k] = 1;
    } else if (f > base + 0.08) walk[k] = 1 + Math.round(f * 20);        // 高出台面的可走面，按 5 厘米分档
  }
  for (const [ax, bx, az, bz] of solids) for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const cx = x0 + (i + 0.5) * res, cz = z0 + (j + 0.5) * res;
    if (cx >= ax && cx <= bx && cz >= az && cz <= bz) { const k = j * nx + i; tall[k] = 1; walk[k] = 0; low[k] = 0; }
  }
  // 四面墙围起来、从外面走不进去的殿内空地（模型的殿内地面与台面齐平，网格上记为空）也算殿内（第十三轮：御剑不从门窗钻进空壳里）
  const reach = new Uint8Array(N), st = [];
  for (let i = 0; i < nx; i++) st.push(i, (nz - 1) * nx + i);
  for (let j = 0; j < nz; j++) st.push(j * nx, j * nx + nx - 1);
  while (st.length) {
    const k = st.pop();
    if (reach[k] || tall[k]) continue;
    reach[k] = 1;
    const i = k % nx, j = (k - i) / nx;
    if (i > 0) st.push(k - 1);
    if (i < nx - 1) st.push(k + 1);
    if (j > 0) st.push(k - nx);
    if (j < nz - 1) st.push(k + nx);
  }
  for (let k = 0; k < N; k++) if (!reach[k] && !tall[k]) { tall[k] = 1; walk[k] = 0; low[k] = 0; }
  // 檐：高挡外扩 3 格
  const R = 3;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (!tall[j * nx + i]) continue;
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < nx && b < nz) eave[b * nx + a] = 1;
    }
  }
  const out = [], sx = mirror ? -s : s;
  const box = (r, y0, y1, o) => {
    const cx = x0 + (r.i + r.w / 2) * res, cz = z0 + (r.j + r.h / 2) * res;
    out.push({ type: 'box', x: cx * sx, z: cz * s, y0: (y0 - base) * s, y1: (y1 - base) * s + 0.03, hx: (r.w * res * s) / 2, hz: (r.h * res * s) / 2, ry: 0, ...o });
  };
  for (const r of rects(walk, nx, nz)) box(r, base - 0.6, (r.L - 1) / 20, { walk: true, cam: false });
  for (const r of rects(low, nx, nz)) {
    let f = -1e9; for (let jj = 0; jj < r.h; jj++) for (let t = 0; t < r.w; t++) f = Math.max(f, F[(r.j + jj) * nx + r.i + t]);
    box(r, base - 0.6, f + 1.05, { walk: false, cam: false });
  }
  for (const r of rects(tall, nx, nz)) box(r, base - 0.6, top * 0.82, { walk: false, cam: true, kind: 'body' });
  // 檐：从其下最高的可走面（台上、廊上）再高 2.5 米起，人在台上、廊下走动不碰檐
  for (const r of rects(eave, nx, nz)) {
    let f = base;
    for (let jj = 0; jj < r.h; jj++) for (let t = 0; t < r.w; t++) { const k = (r.j + jj) * nx + r.i + t; if (!tall[k]) f = Math.max(f, F[k]); }
    if (top * 0.82 > f + 2.5) box(r, f + 2.5, top * 0.82, { walk: false, cam: true, kind: 'eave' });
  }
  return out;
}

// 正门：中轴（x≈0）自前向后，第一处高挡之前的可走面——门口站人处取离门 1 米的那一格（本地、已缩放，y 为相对台面）
function doorOf(info, s, mirror) {
  const { nx, nz, res, x0, z0 } = info.grid, base = info.plinth;
  const i = Math.max(0, Math.min(nx - 1, Math.floor((0 - x0) / res)));
  const cells = [];
  let wallZ = null;
  for (let j = nz - 1; j >= 0; j--) {
    const k = j * nx + i;
    if (info.B[k] === 2 && info.F[k] >= base - 0.2) { wallZ = (z0 + (j + 1) * res) * s; break; }
    if (!info.B[k]) cells.push({ x: (x0 + (i + 0.5) * res) * (mirror ? -s : s), z: (z0 + (j + 0.5) * res) * s, y: (info.F[k] - base) * s + 0.03 });
  }
  if (!cells.length) return null;
  const last = cells[cells.length - 1];
  return { ...cells[Math.max(0, cells.length - 3)], wallZ: wallZ ?? last.z - res * s, floorY: last.y };
}

// 放一栋：key 模型；(x, y, z) 为台面上的放置点，ry 朝向（0 为正面朝 +Z），s 缩放，mirror 左右镜像；
// id 用于淡化与碰撞标记；foot 为舆图占地；solids 见 colliders
export function placeBuilding(ctx, key, { x, y, z, ry = 0, s = 1, mirror = false, id = null, name = '', foot = null, solids = [] } = {}) {
  const info = bldInfo(key), src = ASSETS.models.buildings?.scene?.getObjectByName('bld_' + key);
  if (!info || !src) return null;
  const root = new THREE.Group();
  root.name = name || id || key;
  const g = src.clone(true);
  g.position.set(0, -info.plinth * s + 0.03, 0);
  g.rotation.set(0, 0, 0);
  g.scale.set(mirror ? -s : s, s, s);
  root.add(g);
  root.position.set(x, y, z);
  root.rotation.y = ry;
  const fadeU = { value: 1 };
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.metalness = 0;
    o.material.roughness = Math.max(0.78, o.material.roughness ?? 0.8);
    o.material.color.setScalar(1.16);            // 手绘贴图自带暗部，场景光照下整体偏暗：提亮一成半，与程序化建筑的明度相当
    attachFade(o, fadeU);
    o.castShadow = true; o.receiveShadow = true;
  });
  ctx.scene.add(root);
  const cols = ctx.cw.addLocal(colliders(info, s, mirror, solids), x, y, z, ry, id);
  if (id) {
    (ctx.colliders ||= {})[id] = cols;
    ctx.fadeables.set(id, { u: fadeU, target: 1, cur: 1, name });
    ctx.groups[id] = root;
  }
  if (foot) ctx.footprints.push({ x, z, ry, w: info.size[0] * s, d: info.size[2] * s, ...foot });
  const c = Math.cos(ry), sn = Math.sin(ry);
  const toWorld = (p) => (p ? { x: x + p.x * c + p.z * sn, y: y + p.y, z: z - p.x * sn + p.z * c } : null);
  const d = doorOf(info, s, mirror);
  return { root, info, fadeU, local: d, top: y + (info.size[1] - info.plinth) * s, door: toWorld(d), toWorld, half: [info.size[0] * s / 2, info.size[2] * s / 2] };
}

// 门上的匾：挂在正门所在墙面（中轴第一处高挡的前沿）之前，门口地面以上 lift 米；随建筑淡化
export function addPlaque(res, mesh, { lift = 3.4, out = 0.12, dx = 0 } = {}) {
  if (!res?.local) return null;
  mesh.position.set(dx, res.local.floorY + lift, res.local.wallZ + out);
  attachFade(mesh, res.fadeU);
  res.root.add(mesh);
  return mesh;
}
