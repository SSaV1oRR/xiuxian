// 仙鹤：几群丹顶鹤绕着宗门、云顶与浮空仙岛之间盘旋——排成人字，缓缓扇翅，不时张开双翼滑翔，转弯时侧身。
// 鹤身为程序化网格（白羽、黑颈、黑色次级飞羽、丹顶、长喙、后伸的长腿），扇翅在顶点着色器里绕肩、腕两处关节转动。
// 入夜后归巢不见。
import * as THREE from 'three';
import { applyFade } from './shaderlib.js';

// 鹤的网格（前 +z，翼展沿 x，约 2.6 米）；aWing：0 身体，±1 内翼，±2 外翼
function craneGeometry() {
  const parts = [];
  const add = (geo, color, wing = 0, xform = null) => {
    if (xform) geo.applyMatrix4(xform);
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count, c = new THREE.Color(color), col = new Float32Array(n * 3), w = new Float32Array(n);
    for (let i = 0; i < n; i++) { col.set([c.r, c.g, c.b], i * 3); w[i] = typeof wing === 'function' ? wing(g.attributes.position.getX(i)) : wing; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aWing', new THREE.BufferAttribute(w, 1));
    g.deleteAttribute('uv');
    parts.push(g);
  };
  const M = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  const white = 0xf2f1ec, black = 0x1d1d1f, red = 0xc4231d;
  add(new THREE.SphereGeometry(1, 14, 10), white, 0, M(0, 0, 0, 0, 0, 0, 0.17, 0.15, 0.42));                  // 身
  add(new THREE.CylinderGeometry(0.032, 0.055, 0.62, 7), black, 0, M(0, 0.05, 0.64, Math.PI / 2 - 0.08));      // 颈
  add(new THREE.SphereGeometry(0.056, 10, 8), white, 0, M(0, 0.08, 0.98));                                        // 头
  add(new THREE.SphereGeometry(0.034, 8, 6), red, 0, M(0, 0.12, 0.97, 0, 0, 0, 1, 0.55, 1.1));                  // 丹顶
  add(new THREE.ConeGeometry(0.02, 0.17, 6), 0xa89a62, 0, M(0, 0.07, 1.11, Math.PI / 2));                       // 喙
  add(new THREE.ConeGeometry(0.11, 0.34, 7), black, 0, M(0, 0.02, -0.5, -Math.PI / 2, 0, 0, 1, 1, 0.45));       // 尾羽（三级飞羽，黑）
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.011, 0.011, 0.62, 4), 0x2c2a28, 0, M(s * 0.045, -0.07, -0.62, Math.PI / 2 + 0.05));   // 腿
  // 翼：内翼（肩 0.12 → 腕 0.7）、外翼（腕 → 翼尖 1.3）；前缘白、后缘黑
  const wing = (s) => {
    const panel = (x0, x1, zf0, zf1, zm0, zm1, zb0, zb1, col, k) => {
      const g = new THREE.BufferGeometry();
      const P = [x0, 0, zf0, x1, 0, zf1, x1, 0, zm1, x0, 0, zf0, x1, 0, zm1, x0, 0, zm0];
      const Q = [x0, 0, zm0, x1, 0, zm1, x1, 0, zb1, x0, 0, zm0, x1, 0, zb1, x0, 0, zb0];
      g.setAttribute('position', new THREE.Float32BufferAttribute(k ? Q : P, 3));
      for (let i = 0; i < g.attributes.position.count; i++) g.attributes.position.setX(i, g.attributes.position.getX(i) * s);
      if (s < 0) { const a = g.attributes.position.array; for (let i = 0; i < a.length; i += 9) for (let c = 0; c < 3; c++) { const t = a[i + 3 + c]; a[i + 3 + c] = a[i + 6 + c]; a[i + 6 + c] = t; } }
      g.computeVertexNormals();
      return g;
    };
    const wInner = (x) => (Math.abs(x) < 0.125 ? 0 : s), wOuter = (x) => (Math.abs(x) < 0.705 ? s : 2 * s);
    add(panel(0.12, 0.7, 0.14, 0.1, -0.02, -0.04, -0.26, -0.27, 0, 0), white, wInner);
    add(panel(0.12, 0.7, 0.14, 0.1, -0.02, -0.04, -0.26, -0.27, 0, 1), black, wInner);
    add(panel(0.7, 1.3, 0.1, -0.02, -0.04, -0.07, -0.27, -0.12, 0, 0), white, wOuter);
    add(panel(0.7, 1.3, 0.1, -0.02, -0.04, -0.07, -0.27, -0.12, 0, 1), black, wOuter);
    add(panel(1.0, 1.32, 0.04, -0.03, 0.0, -0.05, -0.04, -0.08, 0, 0), black, wOuter);       // 翼尖初级飞羽
  };
  wing(1); wing(-1);
  // 合并
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3), w = new Float32Array(n);
  let o = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); w.set(g.attributes.aWing.array, o);
    o += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aWing', new THREE.BufferAttribute(w, 1));
  return geo;
}

const FLAP = /* glsl */ `
  float wS = sign(aWing), wW = abs(aWing);
  float fPh = uTime * aAnim.y + aAnim.x;
  float fA = (sin(fPh) * .62 + .12) * aAnim.z + .06;                 // 内翼：上下扇动；滑翔时近乎平展，略上扬
  float fB = sin(fPh - .8) * .5 * aAnim.z + .05;                      // 外翼滞后，扇出鞭梢
  mat2 rA = mat2(cos(wS * fA), sin(wS * fA), -sin(wS * fA), cos(wS * fA));
  mat2 rB = mat2(cos(wS * fB), sin(wS * fB), -sin(wS * fB), cos(wS * fB));`;

function craneMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWing; attribute vec3 aAnim; uniform float uTime;')
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        ${FLAP}
        if (wW > .5) { objectNormal.xy = rA * objectNormal.xy; if (wW > 1.5) objectNormal.xy = rB * objectNormal.xy; }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        if (wW > .5) {
          vec2 sh0 = vec2(wS * .12, 0.);
          vec2 q = rA * (transformed.xy - sh0) + sh0;
          if (wW > 1.5) { vec2 wr = rA * vec2(wS * .58, 0.) + sh0; q = rB * (q - wr) + wr; }
          transformed.xy = q;
        }`);
    sh.uniforms.uTime = m.userData.uTime;
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * .1;');
    applyFade(sh);
  };
  m.customProgramCacheKey = () => 'crane';
  return m;
}

// 鹤群：中心、半径、高度、角速度、只数、相位
const FLOCKS = [
  { c: [0, -40], rx: 175, rz: 135, y: 62, w: 0.05, n: 5, ph: 0 },        // 绕宗门（掠过广场、凌云阁上空）
  { c: [-30, -210], rx: 110, rz: 80, y: 98, w: -0.065, n: 3, ph: 2.1 },   // 绕云顶
  { c: [120, -420], rx: 230, rz: 120, y: 140, w: 0.04, n: 4, ph: 4.2 },   // 仙岛之间
];

export class Cranes {
  constructor(scene, GLOBAL) {
    this.birds = [];
    for (const f of FLOCKS) for (let i = 0; i < f.n; i++) this.birds.push({ f, i, side: i === 0 ? 0 : (i % 2 ? 1 : -1), rank: Math.ceil(i / 2), j: Math.random() * 6.28, roll: 0 });
    const n = this.birds.length, geo = craneGeometry();
    this.anim = new Float32Array(n * 3);
    geo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(this.anim, 3));
    const mat = craneMaterial();
    mat.userData.uTime = GLOBAL.uTime;
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'cranes';
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ'); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1.25, 1.25, 1.25);
    this.prev = new Map();
  }

  pathAt(f, t, out) {
    const th = f.ph + t * f.w;
    out.x = f.c[0] + Math.cos(th) * f.rx + Math.sin(th * 2.3) * 18;
    out.z = f.c[1] + Math.sin(th) * f.rz + Math.cos(th * 1.7) * 14;
    out.y = f.y + Math.sin(th * 2 + f.ph) * 9;
    return out;
  }

  update(dt, t, night) {
    const vis = night < 0.6;
    this.mesh.visible = vis;
    if (!vis) return;
    const a = {}, b = {};
    this.birds.forEach((bd, k) => {
      const f = bd.f;
      // 领头鹤的位置与朝向（沿路径的切线）
      this.pathAt(f, t, a); this.pathAt(f, t + 0.5, b);
      let dx = b.x - a.x, dz = b.z - a.z;
      const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const yaw = Math.atan2(dx, dz);
      // 人字形：后排向两侧、向后错开，各自有一点起伏
      const back = bd.rank * 3.4, lat = bd.side * bd.rank * 2.9;
      const px = a.x - dx * back + dz * lat + Math.sin(t * 0.7 + bd.j) * 0.6;
      const pz = a.z - dz * back - dx * lat + Math.cos(t * 0.6 + bd.j) * 0.6;
      const py = a.y + bd.rank * 0.8 + Math.sin(t * 0.9 + bd.j) * 0.7;
      // 转弯侧身：按航向变化率
      const pv = this.prev.get(k) ?? yaw;
      let dyaw = Math.atan2(Math.sin(yaw - pv), Math.cos(yaw - pv)) / Math.max(dt, 1e-3);
      this.prev.set(k, yaw);
      bd.roll += (THREE.MathUtils.clamp(-dyaw * 1.6, -0.6, 0.6) - bd.roll) * Math.min(1, dt * 2);
      // 扇翅：约 1.3 赫兹；每只按自己的节奏间歇滑翔
      const glide = 0.5 + 0.5 * Math.sin(t * 0.23 + bd.j * 3.1);
      this.anim[k * 3] = bd.j * 2 + bd.rank * 0.35; this.anim[k * 3 + 1] = 8.2; this.anim[k * 3 + 2] = glide > 0.72 ? 0.12 : 1;
      this._e.set(-0.05 + Math.sin(t * 0.9 + bd.j) * 0.03, yaw, bd.roll);
      this._q.setFromEuler(this._e);
      this.mesh.setMatrixAt(k, this._m.compose(this._p.set(px, py, pz), this._q, this._s));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.geometry.attributes.aAnim.needsUpdate = true;
  }
}
