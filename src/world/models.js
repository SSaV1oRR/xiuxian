// 外部模型摆件：
//   石狮：香港黄大仙祠石狮实拍扫描（yoko3d，CC BY 4.0，经 Zenodo / Objaverse），减面并烘焙为顶点色
//   香炉：耶鲁皮博迪博物馆藏元末明初青铜三足香炉扫描（YPM ANT.205210，CC BY 4.0），减面并烘焙为顶点色
//   宫灯：Poly Haven chinese_chandelier（CC0），减面、贴图压缩；同一几何全部实例化为一次绘制，入夜点亮
// 模型缺失时退回程序化构件（arch.js 的 lion / burner）
import * as THREE from 'three';
import { ASSETS } from './assets.js';
import { FOGU, injectFog } from './shaderlib.js';
import { lion as lionProc, burner as burnerProc } from './arch/arch.js';
import { C } from './arch/builder.js';
import { censerR, lionPlinth, lionPedestal } from './arch/ornaments.js';

let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    lion: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0, color: new THREE.Color(1.16, 1.13, 1.04) }),
    burner: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.55, color: new THREE.Color(1.15, 1.08, 0.95), envMapIntensity: 0.8 }),
  };
  return MATS;
}
// 模型的世界包围盒（单位缩放下）
const bbCache = new Map();
function bbox(key) {
  if (bbCache.has(key)) return bbCache.get(key);
  const bb = new THREE.Box3().setFromObject(ASSETS.models[key].scene);
  bbCache.set(key, bb);
  return bb;
}

function cloneModel(ctx, key, { x, y, z, ry = 0, s = 1, mirror = false }) {
  const src = ASSETS.models[key];
  if (!src) return null;
  const o = src.scene.clone(true);
  o.scale.set(mirror ? -s : s, s, s);
  o.position.set(x, y, z);
  o.rotation.y = ry;
  const M = mats()[key];
  o.traverse((m) => {
    if (!m.isMesh) return;
    if (M) m.material = M;
    m.castShadow = !ctx.lowShadows;
    m.receiveShadow = true;
  });
  ctx.scene.add(o);
  return o;
}

// 实物陈设（Poly Haven 室内模型，CC0）：克隆原模型（共享几何与材质），落地基点为底面中心；col：外扩 pad 的碰撞盒（不可走）
export function placeProp(ctx, key, x, y, z, ry = 0, s = 1, col = null) {
  const src = ASSETS.models[key];
  if (!src) return null;
  const o = src.scene.clone(true);
  o.position.set(x, y, z); o.rotation.y = ry; o.scale.setScalar(s);
  o.traverse((m) => { if (m.isMesh) { m.castShadow = !ctx.lowShadows; m.receiveShadow = true; } });
  ctx.scene.add(o);
  if (col) {
    o.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(o);
    ctx.cw.addBox({ x: (bb.min.x + bb.max.x) / 2, z: (bb.min.z + bb.max.z) / 2, y0: bb.min.y, y1: bb.max.y, hx: (bb.max.x - bb.min.x) / 2 + (col.pad ?? 0.02), hz: (bb.max.z - bb.min.z) / 2 + (col.pad ?? 0.02), walk: false, cam: false });
  }
  (ctx.props9 ||= []).push(o);
  return o;
}

// 石狮扫描原件连着自己的石柱与两层柱头石（y < 0.65 都是柱与座），立在须弥座上就成了“柱顶小狮”。
// 第九轮只取狮身（剔除 y < 0.655 的三角形），重新归一到落地基点在底面中心、高 1，再放到 D02-04 式须弥座上
let LION_FIG = null;
function lionFigure() {
  if (LION_FIG) return LION_FIG;
  let src = null;
  ASSETS.models.lion.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
  src.updateWorldMatrix(true, false);
  const g0 = (src.geometry.index ? src.geometry.toNonIndexed() : src.geometry.clone()).applyMatrix4(src.matrixWorld);
  const P = g0.attributes.position, CUT = 0.655, keep = [];
  for (let t = 0; t < P.count; t += 3) if (Math.min(P.getY(t), P.getY(t + 1), P.getY(t + 2)) >= CUT) keep.push(t);
  const out = new THREE.BufferGeometry();
  const get = ['getX', 'getY', 'getZ', 'getW'];
  for (const [name, a] of Object.entries(g0.attributes)) {
    const arr = new Float32Array(keep.length * 3 * a.itemSize);       // 顶点色在原件里是归一化整数：经 getX… 取回 0–1 的值
    let o = 0;
    for (const t of keep) for (let v = 0; v < 3; v++) for (let c = 0; c < a.itemSize; c++) arr[o++] = a[get[c]](t + v);
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  out.computeBoundingBox();
  const bb = out.boundingBox, cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, h = bb.max.y - bb.min.y;
  out.translate(-cx, -bb.min.y, -cz);
  out.scale(1 / h, 1 / h, 1 / h);
  out.computeBoundingBox(); out.computeBoundingSphere();
  const b2 = out.boundingBox;
  LION_FIG = { geo: out, w: b2.max.x - b2.min.x, d: b2.max.z - b2.min.z };
  return LION_FIG;
}

// 石狮（D02-04）：h 为狮身高（含狮下石板），ped 为须弥座高；含座总高 h + ped（参考 1.4–2.2 米，山门可略高）。默认面向 +Z
// 兼容旧调用：placeLion(ctx, b, x, y, z, ry, s, mirror, pedestal) 中 s 当作含座总高的尺度参考
export function placeLion(ctx, b, x, y, z, ry = 0, s = 2.0, mirror = false, pedestal = 0) {
  if (!ASSETS.models.lion) { lionProc(b, x, y, z, ry, s * 0.43); return; }
  const F = lionFigure();
  const ped = pedestal || Math.max(0.55, s * 0.32), h = Math.max(0.8, s * 0.55);
  const w = F.w * h, d = F.d * h;
  const ph = lionPedestal(b, x, y, z, ry, w * 1.1, d * 1.16, ped);
  const m = new THREE.Mesh(F.geo, mats().lion);
  m.scale.set(mirror ? -h : h, h, h);
  m.position.set(x, y + ph, z); m.rotation.y = ry;
  m.castShadow = !ctx.lowShadows; m.receiveShadow = true;
  ctx.scene.add(m);
  ctx.cw.addBox({ x, z, y0: y, y1: y + ph + h * 0.9, hx: (w * 1.1 + 0.5) / 2, hz: (d * 1.16 + 0.5) / 2, ry, walk: false, cam: false });
}

// 香炉：石座（程序化，进 Builder）+ 青铜炉身（扫描模型）；s 为炉身高度
// 香炉：石座（两层）+ 参照图的掐丝珐琅香炉（程序化）；s 为炉身高度
export function placeCenser(ctx, b, x, y, z, s = 1.5, ry = 0) {
  const base = 0.38;
  b.push(x, y, z, ry);
  b.slab(2.0 * s * 0.62, base * 0.6, 2.0 * s * 0.62, C.marbleShade, 0, 0, 0, { mat: 'stone' });
  b.slab(1.8 * s * 0.62, base * 0.4, 1.8 * s * 0.62, C.marbleWarm, 0, base * 0.6, 0, { mat: 'stoneSmooth' });
  b.pop();
  censerR(b, x, y + base, z, s, ry);
  void burnerProc;
}

// 宫灯：收集挂点，最后统一实例化；p 为灯顶挂点（世界坐标）
export function addPalaceLantern(ctx, x, yTop, z, s = 1.2) {
  (ctx.palaceLanterns ||= []).push([x, yTop, z, s]);
}
export function buildPalaceLanterns(ctx) {
  const list = ctx.palaceLanterns || [], src = ASSETS.models.palace_lantern;
  if (!list.length || !src) return;
  let mesh = null;
  src.scene.traverse((m) => { if (m.isMesh && !mesh) mesh = m; });
  if (!mesh) return;
  const mat = mesh.material.clone();
  mat.emissive = new THREE.Color(1.0, 0.68, 0.38);
  mat.emissiveMap = mat.map;
  mat.onBeforeCompile = (sh) => {
    injectFog(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= uNight * 1.6;');
    sh.uniforms.uNight = FOGU.uNight;
  };
  mat.customProgramCacheKey = () => 'palace-lantern';
  const bb = new THREE.Box3().setFromObject(src.scene), h = bb.max.y - bb.min.y;
  const im = new THREE.InstancedMesh(mesh.geometry, mat, list.length);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();
  list.forEach(([x, yTop, z, s], i) => {
    Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 1.3) % (Math.PI * 2));
    im.setMatrixAt(i, M4.compose(V.set(x, yTop - h * s - bb.min.y * s, z), Q, S.set(s, s, s)));
  });
  im.castShadow = !ctx.lowShadows;
  im.receiveShadow = true;
  im.computeBoundingSphere();
  im.name = 'palace-lanterns';
  ctx.scene.add(im);
  ctx.palaceLanternMesh = im;
}

const UP = new THREE.Vector3(0, 1, 0);
// 实拍扫描山石（assets/models/rocks_a、rocks_b）：按给定位置实例化，整体着色
export function scannedRocks(list, tint) {
  const group = new THREE.Group();
  const srcs = [];
  for (const key of ['rocks_a', 'rocks_b']) ASSETS.models[key]?.scene.traverse((o) => { if (o.isMesh) srcs.push(o); });
  if (!srcs.length) return group;
  const byGeo = srcs.map(() => []);
  list.forEach((it, i) => byGeo[(i * 7 + 3) % srcs.length].push(it));
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), Sv = new THREE.Vector3();
  byGeo.forEach((arr, k) => {
    if (!arr.length) return;
    const o = srcs[k], geo = o.geometry.clone();
    geo.computeBoundingBox();
    const bb = geo.boundingBox, sc = 2 / Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
    geo.scale(sc, sc, sc);
    const mat = o.material.clone();
    mat.color = new THREE.Color(...tint); mat.roughness = 0.95; mat.metalness = 0;
    const im = new THREE.InstancedMesh(geo, mat, arr.length);
    arr.forEach(([x, y, z, s, ry], i) => im.setMatrixAt(i, M4.compose(V.set(x, y, z), Q.setFromAxisAngle(UP, ry), Sv.set(s, s * 0.8, s))));
    im.castShadow = im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
  });
  return group;
}
