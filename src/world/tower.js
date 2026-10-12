// 藏经阁塔楼模型（chinese_tower，经 tools/optimize_tower.py 优化后放在 assets/chinese_tower/）
// 加载器：three.js r160 FBXLoader；贴图名经 manifest 映射到降采样后的文件；TGA 法线贴图已转 PNG。
// 加载成功后替换程序化生成的三层楼阁，保留院落、月洞门、守阁长老与阅读交互；失败则沿用程序化楼阁。
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { applyFade } from './shaderlib.js';
import { SITES } from './layout.js';
import { Builder, C } from './arch/builder.js';
import { rail, plaqueMesh } from './arch/arch.js';

const BASE = './assets/chinese_tower/';
// 模型单位为毫米：圆形楼体，底层柱环半径约 4.6 米、高约 16.5 米；略放大以接近原楼阁体量（radius/height 为模型单位）
// 原模型底层柱脚直接落地，这里补一座圆形石台基（plinth 米高）与南向踏步，模型整体抬到台面上
export const TOWER = { scale: 0.00118, ry: 0, radius: 4620, height: 16550, plinth: 0.66 };

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('加载超时')), ms))]);
}

// 返回模型 Object3D；所有贴图加载完成后才 resolve
export async function loadTowerModel({ timeout = 20000 } = {}) {
  const manifest = await withTimeout(fetch(BASE + 'manifest.json').then((r) => { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); }), timeout);
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    const name = decodeURIComponent(url.split(/[\\/]/).pop());
    return manifest[name] ? BASE + manifest[name] : url;
  });
  manager.addHandler(/\.tga$/i, new THREE.TextureLoader(manager));
  let failed = null;
  const done = new Promise((res) => { manager.onLoad = res; });
  manager.onError = (url) => { failed = url; };
  const object = await withTimeout(new FBXLoader(manager).loadAsync(BASE + 'tower.fbx'), timeout);
  await withTimeout(done, timeout);
  if (failed) throw new Error('贴图加载失败：' + failed);
  return object;
}

// 转为与场景一致的 PBR 材质，并接上该建筑的遮挡淡化
function toStandard(m, fadeU) {
  const src = m.map?.image?.currentSrc || m.map?.image?.src || '';
  const cutout = /\.png(\?|$)/i.test(src);                 // 带透明通道的贴图（栏杆、花窗等）
  if (m.map) m.map.anisotropy = 4;
  const s = new THREE.MeshStandardMaterial({
    name: m.name, map: m.map || null, normalMap: m.normalMap || null,
    color: new THREE.Color(m.map ? 0xeeeae2 : m.color ?? 0xcccccc),
    roughness: 0.84, metalness: 0,
    alphaTest: cutout ? 0.45 : 0, side: cutout ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (s.normalMap) s.normalScale.set(0.8, 0.8);
  s.onBeforeCompile = (sh) => applyFade(sh, { fade: fadeU });
  s.customProgramCacheKey = () => `tower-${s.map ? 'm' : ''}${s.normalMap ? 'n' : ''}${cutout ? 'a' : ''}`;
  return s;
}

export function installTower(ctx, model) {
  const S = SITES.scripture, y = S.y ?? 32;
  const fade = ctx.fadeables.get('library');
  // 移除程序化楼阁及其碰撞体
  const old = ctx.groups.library;
  if (old) ctx.scene.remove(old);
  for (const c of ctx.colliders?.library || []) ctx.cw.remove(c);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.45 });
  model.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const conv = list.map((m) => toStandard(m, fade.u));
    o.material = Array.isArray(o.material) ? conv : conv[0];
    o.castShadow = true;
    o.receiveShadow = true;
    if (conv.some((m) => m.alphaTest > 0)) o.customDepthMaterial = depth;
  });
  const R = TOWER.radius * TOWER.scale, top = TOWER.height * TOWER.scale, P = TOWER.plinth;
  model.scale.setScalar(TOWER.scale);
  model.position.y = P;
  // 圆形石台基：须弥座式上下枭线、条石台面、南向三级踏步、台沿石栏（踏步处留口）
  const b = new Builder();
  const Rp = R + 1.15;
  b.cyl(Rp + 0.25, Rp + 0.35, 0.22, C.stoneDark, 0, 0.11 - 0.05, 0, { seg: 40, mat: 'stone', col: false });
  b.cyl(Rp - 0.1, Rp + 0.05, P - 0.36, C.stone, 0, 0.17 + (P - 0.36) / 2, 0, { seg: 40, mat: 'stone', col: false });
  b.cyl(Rp + 0.12, Rp - 0.05, 0.2, C.stoneWarm, 0, P - 0.1, 0, { seg: 40, mat: 'stoneSmooth', col: false });
  const n = 3, run = 0.36;
  for (let k = 0; k < n; k++) b.slab(3.6, (P * (k + 1)) / n + 0.2, run, C.stoneWarm, 0, -0.2, Rp + (n - k - 0.5) * run - 0.05, { mat: 'stoneSmooth', col: false });
  const pts = [];
  for (let i = 0; i <= 28; i++) {
    const a = Math.PI / 2 + 0.36 + (i / 28) * (Math.PI * 2 - 0.72);
    pts.push([Math.cos(a) * (Rp - 0.25), Math.sin(a) * (Rp - 0.25)]);
  }
  rail(b, pts, P, { h: 0.7, spacing: 1.6, color: C.stoneWarm, post: 0.16 });
  const base = b.build({ fade: false, name: '藏经阁台基' });
  // 正面匾额（黑底金字，与问道殿的青底匾相区别）
  const plaque = plaqueMesh('藏经阁', 2.8, 0.95, { bg: '#1e1d1b', fg: '#d9b86a', frame: '#4a3726' });
  plaque.position.set(0, P + 3.55, R + 0.32);
  plaque.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) { m.onBeforeCompile = (sh) => applyFade(sh, { fade: fade.u }); m.customProgramCacheKey = () => 'tower-plaque' + (m.map ? 'm' : ''); } });
  const g = new THREE.Group();
  g.name = '藏经阁';
  g.add(model, base, plaque);
  g.position.set(S.x, y, S.z);
  g.rotation.y = TOWER.ry;
  ctx.scene.add(g);
  ctx.groups.library = g;
  // 碰撞：台基（可站立）、踏步、柱环楼身（圆柱，不可进入）、内切方体（供镜头遮挡判断与淡化）、台沿栏杆
  const cols = [
    ctx.cw.addCyl({ x: S.x, z: S.z, y0: y - 0.5, y1: y + P, r: Rp, walk: true }),
    ctx.cw.addCyl({ x: S.x, z: S.z, y0: y + P, y1: y + top, r: R + 0.1, walk: false }),
    ctx.cw.addBox({ x: S.x, z: S.z, y0: y + P, y1: y + top, hx: R * 0.72, hz: R * 0.72, ry: TOWER.ry, walk: false, cam: true, tag: 'library' }),
  ];
  for (let k = 0; k < n; k++) cols.push(ctx.cw.addBox({ x: S.x, z: S.z + Rp + (n - k - 0.5) * run - 0.05, y0: y - 0.2, y1: y + (P * (k + 1)) / n, hx: 1.8, hz: run / 2, walk: true, cam: false }));
  cols.push(...ctx.cw.addLocal(b.cols, S.x, y, S.z, TOWER.ry, null));
  ctx.colliders.library = cols;
  // 舆图上的占地改为台基大小
  const fp = ctx.footprints.find((f) => Math.abs(f.x - S.x) < 0.1 && Math.abs(f.z - S.z) < 0.1);
  if (fp) { fp.w = fp.d = Rp * 2; }
  return g;
}
