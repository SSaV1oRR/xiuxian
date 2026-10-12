// 修士角色（沿用 demo/src/player/character.js）：程序化骨骼 + 分层服饰 + 布料/发丝物理（Verlet）
// 本项目改动：新增宗门弟子配色、背负佩剑的剑柄
// 骨骼：骨盆 → 双腿（髋/膝/踝）、胸 → 颈 → 头、双肩 → 肘 → 腕 → 手指
// 服饰：中衣、褙子（对襟外袍）、四片裙摆随腿摆动、纱衣、腰封玉佩、广袖（随重力与气流垂荡）
// 物理：长发五缕、鬓发、发带、披帛（经肘部）、腰带垂绦
import * as THREE from 'three';
import { skinRig } from './rig.js';
import { injectFog } from '../world/shaderlib.js';
import { AnimPlayer, BONE } from './anim.js';
import { buildSword } from './flight.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const physMat = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.78, sheen: 0.45, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xdde6f0), ...o });
const stdMat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...o });
const lathe = (pts, seg = 20, p0 = 0, pl = Math.PI * 2) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, p0, pl);

export const PALETTES = {
  sect: { inner: 0xe9e6de, outer: 0x9fb1bd, trim: 0x34495a, sash: 0x2c3c4a, gauze: 0xe4eef4, ribbon: 0xf0f4f6, shawl: 0xd7e3ea },
  azure: { inner: 0xdcd9d2, outer: 0x86acd0, trim: 0x2b4c7e, sash: 0x223c66, gauze: 0xdcefff, ribbon: 0xe8f3ff, shawl: 0xcfe6ff },
  crimson: { inner: 0xf4efe8, outer: 0xc8463c, trim: 0x5a1a14, sash: 0x3a1a16, gauze: 0xffe0d8, ribbon: 0xffd8c8, shawl: 0xffc8c0 },
  jade: { inner: 0xf2f4ee, outer: 0x7fb8a0, trim: 0x23503e, sash: 0x1e3d30, gauze: 0xe0fff2, ribbon: 0xe8fff4, shawl: 0xc8f0dc },
  ink: { inner: 0xefeeea, outer: 0x3b3f48, trim: 0x111215, sash: 0x1a1b1f, gauze: 0xd8dde6, ribbon: 0xffffff, shawl: 0xb8c0cc },
};

// ---------- Verlet 链 ----------
class Strand {
  constructor(scene, n, len, { width = 0.05, taper = 0.4, color = 0x111111, mat = null, pins = [0], drag = 0.06, stiff = 0 } = {}) {
    this.n = n; this.seg = len / (n - 1); this.width = width; this.taper = taper; this.drag = drag; this.stiff = stiff;
    this.p = Array.from({ length: n }, () => new THREE.Vector3());
    this.q = Array.from({ length: n }, () => new THREE.Vector3());
    this.pins = new Map(pins.map((i) => [i, new THREE.Vector3()]));
    this.init = false;
    const pos = new Float32Array(n * 2 * 3), nrm = new Float32Array(n * 2 * 3), idx = [];
    for (let i = 0; i < n - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, mat || stdMat(color, { side: THREE.DoubleSide, roughness: 0.5 }));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    scene.add(this.mesh);
  }
  pin(i, v) { this.pins.get(i)?.copy(v); }
  // 在“角色空间”（以 root 为原点，世界朝向）中模拟
  step(dt, acc, spheres, iters = 4) {
    const p = this.p, q = this.q, dt2 = dt * dt;
    if (!this.init) {
      const a = this.pins.get(0);
      for (let i = 0; i < this.n; i++) { p[i].set(a.x, a.y - i * this.seg, a.z); q[i].copy(p[i]); }
      this.init = true;
    }
    const tmp = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      if (this.pins.has(i)) { p[i].copy(this.pins.get(i)); q[i].copy(p[i]); continue; }
      tmp.copy(p[i]).sub(q[i]).multiplyScalar(0.96);
      q[i].copy(p[i]);
      p[i].add(tmp).addScaledVector(acc, dt2 * (1 + i * this.drag));
    }
    for (let it = 0; it < iters; it++) {
      for (let i = 1; i < this.n; i++) {
        const a = p[i - 1], b = p[i];
        tmp.subVectors(b, a);
        const d = tmp.length() || 1e-6, diff = (d - this.seg) / d;
        const pa = this.pins.has(i - 1), pb = this.pins.has(i);
        if (pa && pb) continue;
        if (pa) b.addScaledVector(tmp, -diff);
        else if (pb) a.addScaledVector(tmp, diff);
        else { a.addScaledVector(tmp, diff * 0.5); b.addScaledVector(tmp, -diff * 0.5); }
      }
      for (const [c, r] of spheres) for (let i = 1; i < this.n; i++) {
        if (this.pins.has(i)) continue;
        tmp.subVectors(p[i], c);
        const d = tmp.length();
        if (d < r) p[i].addScaledVector(tmp, (r - d) / (d || 1e-6));
      }
      for (const [i, v] of this.pins) p[i].copy(v);
    }
  }
  render(origin, view, forward) {
    const pos = this.geo.attributes.position.array, nrm = this.geo.attributes.normal.array;
    const t = new THREE.Vector3(), s = new THREE.Vector3(), nn = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const a = this.p[Math.max(0, i - 1)], b = this.p[Math.min(this.n - 1, i + 1)];
      t.subVectors(b, a).normalize();
      s.crossVectors(t, view ? view : forward);
      if (s.lengthSq() < 1e-6) s.crossVectors(t, forward);
      s.normalize().multiplyScalar(this.width * (1 - (i / (this.n - 1)) * (1 - this.taper)) * 0.5);
      nn.crossVectors(s, t).normalize();
      const P = this.p[i];
      pos.set([origin.x + P.x - s.x, origin.y + P.y - s.y, origin.z + P.z - s.z, origin.x + P.x + s.x, origin.y + P.y + s.y, origin.z + P.z + s.z], i * 6);
      nrm.set([nn.x, nn.y, nn.z, nn.x, nn.y, nn.z], i * 6);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
  }
}

// ---------- 广袖（顶点随重力/气流形变）----------
class Sleeve {
  constructor(parent, mat, side) {
    this.side = side;
    this.rings = 9; this.seg = 14; this.L = 0.66;
    const geo = new THREE.CylinderGeometry(1, 1, 1, this.seg, this.rings - 1, true);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    this.hang = new THREE.Vector3(0, -1, 0);
  }
  update(elbow, gravityWind) {
    // 世界方向 → 肘部本地
    const inv = new THREE.Quaternion();
    elbow.getWorldQuaternion(inv).invert();
    const h = gravityWind.clone().applyQuaternion(inv).normalize();
    this.hang.lerp(h, 0.25).normalize();
    const pos = this.geo.attributes.position;
    const c = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), Bv = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
    for (let r = 0; r < this.rings; r++) {
      const t = r / (this.rings - 1), s = t * this.L;
      const lead = 0.24;
      if (s < lead) { c.set(0, -s, 0); T.set(0, -1, 0); }
      else {
        const k = (s - lead) / (this.L - lead);
        c.set(0, -lead, 0).addScaledVector(this.hang, (s - lead) * (0.85 + 0.15 * k));
        T.set(0, -1, 0).lerp(this.hang, Math.min(1, k * 1.6)).normalize();
      }
      N.crossVectors(T, X); if (N.lengthSq() < 1e-4) N.set(0, 0, 1); N.normalize();
      Bv.crossVectors(T, N).normalize();
      const rad = 0.055 + 0.17 * Math.min(1, Math.pow(t * 1.25, 1.3));
      for (let k = 0; k <= this.seg; k++) {
        const a = (k / this.seg) * Math.PI * 2;
        const flat = 0.75 + 0.25 * Math.abs(Math.cos(a));
        const i = (this.rings - 1 - r) * (this.seg + 1) + k;   // 圆柱几何自上而下排列
        pos.setXYZ(i, c.x + (Math.cos(a) * N.x + Math.sin(a) * Bv.x) * rad * flat,
          c.y + (Math.cos(a) * N.y + Math.sin(a) * Bv.y) * rad * flat,
          c.z + (Math.cos(a) * N.z + Math.sin(a) * Bv.z) * rad);
      }
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

// 合并后的材质：布料（物理材质，带丝光）与身体（标准材质）以顶点色区分原来的各色，粗糙度逐顶点（aRough）保留
function roughByVertex(m, key) {
  m.onBeforeCompile = (sh) => {
    injectFog(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRough; varying float vRough;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRough = aRough;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRough;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vRough;');
  };
  m.customProgramCacheKey = () => 'char-' + key;
  return m;
}
function rigMaterials(M) {
  const white = (m) => { const c = m.clone(); c.vertexColors = true; c.color.set(0xffffff); return c; };
  return {
    cloth: roughByVertex(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.78, sheen: 0.45, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xdde6f0), side: THREE.DoubleSide }), 'cloth'),
    body: roughByVertex(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), 'body'),
    gold: white(M.gold), jade: white(M.jade), glint: white(M.glint),
  };
}

export class Character {
  constructor(scene, palette = PALETTES.sect) {
    this.scene = scene;
    const P = palette;
    this.M = {
      skin: stdMat(0xf1d3bd, { roughness: 0.55 }),
      inner: physMat(P.inner), outer: physMat(P.outer), trim: physMat(P.trim, { roughness: 0.6 }),
      sash: physMat(P.sash), hair: stdMat(0x141012, { roughness: 0.42, metalness: 0.05 }),
      boot: stdMat(0x1c1a1c, { roughness: 0.8 }), sole: stdMat(0xe8e2d6),
      gold: stdMat(0xd9aa48, { metalness: 0.9, roughness: 0.3 }), jade: stdMat(0x9ff0d4, { emissive: 0x2a8a70, emissiveIntensity: 0.6, roughness: 0.25 }),
      eyeW: stdMat(0xf6f4f0, { roughness: 0.3 }), iris: stdMat(0x1c120c, { roughness: 0.2 }), glint: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      brow: stdMat(0x1a1210), lip: stdMat(0xc8706a, { roughness: 0.5 }), scab: stdMat(0x2a1a14, { roughness: 0.6 }),
      gauze: new THREE.MeshPhysicalMaterial({ color: P.gauze, transparent: true, opacity: 0.32, roughness: 0.4, sheen: 1, sheenColor: new THREE.Color(0xffffff), side: THREE.DoubleSide, depthWrite: false }),
      ribbon: physMat(P.ribbon, { side: THREE.DoubleSide, roughness: 0.55 }),
      shawl: new THREE.MeshPhysicalMaterial({ color: P.shawl, transparent: true, opacity: 0.78, roughness: 0.45, sheen: 1, sheenColor: new THREE.Color(0xffffff), side: THREE.DoubleSide }),
    };
    const M = this.M;
    const mesh = (geo, mat, parent, x = 0, y = 0, z = 0, sc) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (sc) m.scale.set(...sc);
      m.castShadow = true; m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    this.root = new THREE.Group();
    scene.add(this.root);
    const pelvis = (this.pelvis = grp(this.root, 0, 0.94, 0));

    // ----- 腿 -----
    this.legs = {};
    for (const s of [1, -1]) {
      const hip = grp(pelvis, s * 0.09, -0.02, 0);
      mesh(new THREE.CylinderGeometry(0.068, 0.058, 0.44, 10), M.inner, hip, 0, -0.22, 0);
      const knee = grp(hip, 0, -0.44, 0);
      mesh(new THREE.CylinderGeometry(0.052, 0.043, 0.42, 10), M.inner, knee, 0, -0.21, 0);
      const ankle = grp(knee, 0, -0.42, 0);
      mesh(new THREE.SphereGeometry(1, 12, 8), M.boot, ankle, 0, -0.035, 0.035, [0.058, 0.05, 0.13]);
      mesh(new THREE.BoxGeometry(0.1, 0.012, 0.25), M.sole, ankle, 0, -0.075, 0.035);
      mesh(new THREE.ConeGeometry(0.03, 0.07, 8), M.boot, ankle, 0, -0.04, 0.17, [1, 1, 1]).rotation.x = -1.2;
      this.legs[s] = { hip, knee, ankle };
    }

    // ----- 裙摆（四片，随腿摆动）-----
    const skirtIn = [[0.158, 0.1], [0.172, 0.0], [0.2, -0.2], [0.25, -0.5], [0.31, -0.86]];
    const skirtOut = skirtIn.map(([r, y]) => [r * 1.07, y]).slice(0, 4).concat([[0.33, -0.8]]);
    this.panels = [];
    const sectors = [
      { p0: 0, len: Math.PI / 2, side: 1, front: true }, { p0: -Math.PI / 2, len: Math.PI / 2, side: -1, front: true },
      { p0: Math.PI / 2, len: Math.PI / 2, side: 1, front: false }, { p0: Math.PI, len: Math.PI / 2, side: -1, front: false },
    ];
    for (const sc of sectors) {
      const pv = grp(pelvis, 0, 0.08, 0);
      mesh(lathe(skirtIn.map(([r, y]) => [r, y - 0.08]), 6, sc.p0, sc.len), M.inner, pv).material.side = THREE.DoubleSide;
      const open = sc.front ? 0.42 : 0;
      const oP0 = sc.front && sc.side > 0 ? sc.p0 + open : sc.p0, oLen = sc.len - open;
      const o = mesh(lathe(skirtOut.map(([r, y]) => [r, y - 0.08]), 6, oP0, oLen), M.outer, pv);
      o.material = M.outer;
      mesh(lathe([[0.326, -0.76 - 0.08], [0.334, -0.81 - 0.08]], 6, oP0, oLen), M.trim, pv);
      this.panels.push({ pv, ...sc });
    }
    M.inner.side = THREE.DoubleSide; M.outer.side = THREE.DoubleSide; M.trim.side = THREE.DoubleSide;
    this.gauzeSkirt = mesh(lathe([[0.2, 0.05], [0.24, -0.25], [0.3, -0.55], [0.36, -0.92]], 18, 0.9, Math.PI * 2 - 1.8), M.gauze, grp(pelvis, 0, 0.02, 0));
    // 腰封、玉佩
    mesh(new THREE.CylinderGeometry(0.168, 0.172, 0.12, 18), M.sash, pelvis, 0, 0.09, 0);
    mesh(new THREE.CylinderGeometry(0.171, 0.171, 0.02, 18), M.gold, pelvis, 0, 0.14, 0);
    mesh(new THREE.BoxGeometry(0.07, 0.07, 0.02), M.gold, pelvis, 0, 0.09, 0.172);
    const jade = grp(pelvis, 0.115, 0.03, 0.13);
    mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.14, 4), M.trim, jade, 0, -0.07, 0);
    mesh(new THREE.TorusGeometry(0.03, 0.011, 8, 16), M.jade, jade, 0, -0.16, 0);
    mesh(new THREE.CylinderGeometry(0.004, 0.012, 0.12, 6), M.trim, jade, 0, -0.25, 0);

    // ----- 躯干 -----
    const chest = (this.chest = grp(pelvis, 0, 0.32, 0));
    mesh(lathe([[0.16, -0.24], [0.175, -0.12], [0.195, 0.0], [0.205, 0.1], [0.19, 0.16], [0.12, 0.2], [0.055, 0.215]], 22), M.inner, chest, 0, 0, 0, [1, 1, 0.8]);
    mesh(lathe([[0.17, -0.24], [0.184, -0.12], [0.205, 0.0], [0.215, 0.1], [0.2, 0.16], [0.13, 0.205], [0.07, 0.218]], 22, 0.42, Math.PI * 2 - 0.84), M.outer, chest, 0, 0, 0, [1, 1, 0.82]);
    for (const s of [1, -1]) {
      const a = s * 0.42, r = 0.2;
      const t = mesh(new THREE.BoxGeometry(0.028, 0.44, 0.01), M.trim, chest, Math.sin(a) * r * 1.02, -0.02, Math.cos(a) * r * 0.82 + 0.004);
      t.rotation.y = a;
    }
    // 交领（右衽）
    const lap = (a, b, w, mat) => {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
      const m = mesh(new THREE.BoxGeometry(w, d.length(), 0.012), mat, chest);
      m.position.copy(A).add(B).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    };
    lap([0.045, 0.2, 0.1], [-0.09, -0.06, 0.156], 0.05, M.trim);
    lap([-0.04, 0.2, 0.1], [0.05, 0.07, 0.15], 0.04, M.inner);
    // 背后剑鞘
    const scab = (this.scabbard = grp(chest, -0.02, 0.0, -0.175));
    scab.rotation.z = 0.7;
    mesh(new THREE.BoxGeometry(0.055, 0.95, 0.032), M.scab, scab, 0, 0.02, 0);
    for (const y of [-0.44, 0.36, 0.47]) mesh(new THREE.BoxGeometry(0.07, 0.045, 0.042), M.gold, scab, 0, y, 0);
    this.scabTop = grp(scab, 0, 0.5, 0);
    mesh(new THREE.BoxGeometry(0.16, 0.035, 0.05), M.gold, this.scabTop, 0, 0.0, 0);
    mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.2, 6), M.scab, this.scabTop, 0, 0.11, 0);
    mesh(new THREE.SphereGeometry(0.024, 8, 6), M.gold, this.scabTop, 0, 0.22, 0);

    // ----- 头颈 -----
    const neck = grp(chest, 0, 0.215, 0.0);
    mesh(new THREE.CylinderGeometry(0.043, 0.048, 0.1, 10), M.skin, neck, 0, 0.03, 0);
    const head = (this.head = grp(neck, 0, 0.07, 0.005));
    mesh(new THREE.SphereGeometry(0.1, 20, 16), M.skin, head, 0, 0.105, 0, [0.92, 1.06, 0.97]);
    mesh(new THREE.SphereGeometry(0.068, 16, 12), M.skin, head, 0, 0.05, 0.022, [0.98, 0.85, 0.95]);
    this.eyes = grp(head, 0, 0, 0);
    for (const s of [1, -1]) {
      mesh(new THREE.SphereGeometry(0.017, 12, 8), M.eyeW, this.eyes, s * 0.036, 0.113, 0.088, [1.45, 0.78, 0.5]);
      mesh(new THREE.SphereGeometry(0.0098, 10, 8), M.iris, this.eyes, s * 0.035, 0.112, 0.095, [1, 1.05, 0.6]);
      mesh(new THREE.SphereGeometry(0.0028, 6, 4), M.glint, this.eyes, s * 0.033, 0.117, 0.1);
      const lid = mesh(new THREE.BoxGeometry(0.042, 0.005, 0.012), M.brow, head, s * 0.036, 0.121, 0.092);
      lid.rotation.z = s * 0.12;
      const brow = mesh(new THREE.BoxGeometry(0.044, 0.006, 0.01), M.brow, head, s * 0.038, 0.141, 0.093);
      brow.rotation.z = -s * 0.18;
      mesh(new THREE.SphereGeometry(0.018, 8, 6), M.skin, head, s * 0.098, 0.1, -0.005, [0.35, 0.95, 0.65]);
    }
    const nose = mesh(new THREE.ConeGeometry(0.012, 0.034, 6), M.skin, head, 0, 0.092, 0.101);
    nose.rotation.x = 0.25;
    mesh(new THREE.BoxGeometry(0.026, 0.005, 0.006), M.lip, head, 0, 0.061, 0.091);
    // 发：发顶、发髻、玉冠、簪
    const cap = mesh(new THREE.SphereGeometry(0.106, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.36), M.hair, head, 0, 0.11, -0.006);
    cap.rotation.x = -0.42;                                                                                    // 发际线在额头上方
    mesh(new THREE.SphereGeometry(0.105, 22, 14, Math.PI * 0.55, Math.PI * 0.9, Math.PI * 0.2, Math.PI * 0.62), M.hair, head, 0, 0.1, -0.01);  // 后脑
    for (const s of [1, -1]) {                                                                                 // 鬓角
      const t = mesh(new THREE.SphereGeometry(0.03, 8, 6), M.hair, head, s * 0.088, 0.145, 0.03, [0.55, 1.1, 0.9]);
      t.rotation.z = s * 0.3;
    }
    mesh(new THREE.SphereGeometry(0.043, 14, 10), M.hair, head, 0, 0.228, -0.025);
    mesh(new THREE.BoxGeometry(0.052, 0.036, 0.064), M.jade, head, 0, 0.262, -0.022);
    mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.18, 6), M.gold, head, 0, 0.255, -0.022).rotation.z = Math.PI / 2;
    for (const s of [1, -1]) mesh(new THREE.SphereGeometry(0.008, 6, 4), M.jade, head, s * 0.09, 0.255, -0.022);

    // ----- 臂 -----
    this.arms = {};
    for (const s of [1, -1]) {
      const sh = grp(chest, s * 0.185, 0.155, -0.01);
      mesh(new THREE.SphereGeometry(0.064, 12, 10), M.outer, sh);
      mesh(new THREE.CylinderGeometry(0.06, 0.052, 0.28, 10), M.outer, sh, 0, -0.14, 0);
      const el = grp(sh, 0, -0.28, 0);
      mesh(new THREE.CylinderGeometry(0.046, 0.037, 0.24, 10), M.inner, el, 0, -0.12, 0);
      const wr = grp(el, 0, -0.25, 0);
      mesh(new THREE.BoxGeometry(0.066, 0.075, 0.025), M.skin, wr, 0, -0.045, 0);
      const fingers = [];
      for (let k = 0; k < 4; k++) {
        const f = grp(wr, (k - 1.5) * 0.016 * s, -0.082, 0);
        mesh(new THREE.BoxGeometry(0.013, 0.058, 0.015), M.skin, f, 0, -0.027, 0);
        fingers.push(f);
      }
      const th = grp(wr, s * 0.036, -0.035, 0.008);
      mesh(new THREE.BoxGeometry(0.014, 0.045, 0.016), M.skin, th, 0, -0.02, 0);
      th.rotation.z = s * 0.6;
      const sleeve = new Sleeve(el, M.outer, s);
      this.arms[s] = { sh, el, wr, fingers, th, sleeve };
    }

    // 静态构件按材质类别合为五个蒙皮网格（布料 / 身体 / 金饰 / 玉饰 / 眼神光），每个顶点绑定其所在关节，动作代码不变；
    // 纱裙、广袖（逐帧形变）与发带等物理链保持独立
    const cloth = new Set([M.inner, M.outer, M.trim, M.sash]), body = new Set([M.skin, M.hair, M.boot, M.sole, M.eyeW, M.iris, M.brow, M.lip, M.scab]);
    skinRig(this.root, {
      skip: new Set([this.gauzeSkirt, this.arms[1].sleeve.mesh, this.arms[-1].sleeve.mesh]),
      classOf: (o) => (cloth.has(o.material) ? 'cloth' : body.has(o.material) ? 'body' : o.material === M.gold ? 'gold' : o.material === M.jade ? 'jade' : o.material === M.glint ? 'glint' : null),
      materials: rigMaterials(M),
      shadow: (c) => c === 'cloth' || c === 'body',
      extra: (o, g, n) => g.setAttribute('aRough', new THREE.BufferAttribute(new Float32Array(n).fill(o.material.roughness ?? 0.6), 1)),
      cull: false,
    });

    // 剑光：出剑时握在右手中的一道青白光刃（平时隐藏）
    this.blade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.15, 0.012), new THREE.MeshBasicMaterial({ color: 0xcff4ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.blade.position.set(0, -0.68, 0.02);
    this.blade.visible = false;
    this.blade.renderOrder = 5;
    this.arms[-1].wr.add(this.blade);
    // 第十四轮：出剑时右手握的佩剑（与御剑的飞剑同一形制，缩到 0.6 倍，剑身约 0.93 米）；收剑时隐去、背上剑鞘口重现剑柄。
    // 剑身沿手腕本地的握剑方向（动作库给出：拇指一侧，静止时朝前），剑柄落在蜷起的手指间
    const hs = buildSword();
    this.handSword = hs.g; this.handBladeMat = hs.bladeMat; this.handGlow = hs.glow;
    this.handSword.scale.setScalar(0.6);
    this.handSword.visible = false;
    this.arms[-1].wr.add(this.handSword);
    this.setGrip(new THREE.Vector3(1, 0, 0));
    this.drawn = 0;                 // 0 剑在鞘 → 1 剑在手（显隐带一点淡入淡出）
    // 动作库重定向用的关节表（顺序见 anim.js 的 BONE）
    const AL0 = this.arms[1], AR0 = this.arms[-1], L0 = this.legs[1], R0 = this.legs[-1];
    this.rig = {
      joints: [pelvis, chest, head, AL0.sh, AL0.el, AL0.wr, AR0.sh, AR0.el, AR0.wr, L0.hip, L0.knee, L0.ankle, R0.hip, R0.knee, R0.ankle],
      pelvis, pelvisRest: new THREE.Vector3(0, 0.94, 0), pelvisScale: new THREE.Vector3(1, 0.94 / 0.917, 1),
    };
    this.anim = null;
    // 护体剑罡：防御时挡在身前的一道弧形青光（受击时一闪）
    {
      const g = new THREE.CylinderGeometry(1.0, 1.0, 1.5, 28, 1, true, -0.85, 1.7);
      const m = new THREE.ShaderMaterial({
        uniforms: { uA: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
        fragmentShader: `uniform float uA, uFlash, uTime; varying vec2 vUv;
          void main(){
            float edge = smoothstep(0., .18, vUv.x) * smoothstep(1., .82, vUv.x) * smoothstep(0., .2, vUv.y) * smoothstep(1., .75, vUv.y);
            float lines = .55 + .45 * sin(vUv.y * 40. - uTime * 6.) * sin(vUv.x * 9.);
            float rim = smoothstep(.22, .0, abs(vUv.x - .5) - .28);
            vec3 c = vec3(.45, .9, 1.) * (edge * (.07 + .06 * lines) + rim * .025) * (uA + uFlash * 2.4);
            gl_FragColor = vec4(c, 1.);
          }`,
      });
      this.shield = new THREE.Mesh(g, m);
      this.shield.position.set(0, 1.05, 0.05);
      this.shield.renderOrder = 6;
      this.shield.visible = false;
      this.shield.frustumCulled = false;
      this.root.add(this.shield);
    }

    // ----- 物理：发、带 -----
    const S = scene;
    this.strands = [];
    this.hair = [-0.05, -0.025, 0, 0.025, 0.05].map((x) => ({ x, s: new Strand(S, 12, 0.86 - Math.abs(x) * 3, { width: 0.06, taper: 0.35, mat: M.hair, drag: 0.02 }) }));
    this.locks = [1, -1].map((s) => ({ s, st: new Strand(S, 6, 0.24, { width: 0.028, taper: 0.5, mat: M.hair }) }));
    this.ribbon = new Strand(S, 14, 1.05, { width: 0.035, taper: 0.8, mat: M.ribbon, drag: 0.05 });
    this.shawl = [1, -1].map((s) => ({ s, st: new Strand(S, 18, 1.9, { width: 0.15, taper: 0.7, mat: M.shawl, pins: [0, 5], drag: 0.04 }) }));
    this.tails = [1, -1].map((s) => ({ s, st: new Strand(S, 7, 0.55, { width: 0.045, taper: 0.7, mat: M.sash }) }));
    this.strands = [...this.hair.map((h) => h.s), ...this.locks.map((l) => l.st), this.ribbon, ...this.shawl.map((s) => s.st), ...this.tails.map((t) => t.st)];
    for (const st of [...this.locks.map((l) => l.st), this.ribbon, ...this.tails.map((t) => t.st)]) st.mesh.castShadow = false;

    this.phase = 0;
    this.blinkT = 2;
    this.cur = {};
    this.time = 0;
  }

  setVisible(v) {
    this.root.visible = v;
    for (const s of this.strands) s.mesh.visible = v;
  }
  // 动作库载入后接上（未载入时出剑仍用原来的程序化姿势）
  setAnimLib(lib) {
    this.anim = new AnimPlayer(lib, this.rig);
    this.setGrip(lib.blade.r);
  }
  // 手中佩剑的朝向：剑身（本地 +Y）转到手腕本地的握剑方向 dir，剑柄中段落在拳心
  setGrip(dir) {
    const d = dir.clone().normalize();
    this.handSword.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    const fist = new THREE.Vector3(0, -0.078, -0.012);                 // 拳心（手指蜷起后的中间）
    this.handSword.position.copy(fist).addScaledVector(d, 0.036);       // 剑柄中段（本地 y = -0.06，缩放 0.6）对准拳心
  }
  // 剑尖与剑根（剑格处）的世界坐标（剑光拖尾用）
  bladeEnds(tip, base) {
    const g = this.handSword;
    g.updateWorldMatrix(true, false);
    tip.set(0, 1.62, 0).applyMatrix4(g.matrixWorld);
    base.set(0, 0.12, 0).applyMatrix4(g.matrixWorld);
  }
  // 换场景（宗门 / 幽渊秘境）：身体与发丝、披帛等物理链一起移过去
  moveTo(scene) {
    scene.add(this.root);
    for (const s of this.strands) scene.add(s.mesh);
  }

  // 平滑设定关节角
  J(obj, key, x, y = 0, z = 0, k = 0.2) {
    obj.rotation.x = lerp(obj.rotation.x, x, k);
    obj.rotation.y = lerp(obj.rotation.y, y, k);
    obj.rotation.z = lerp(obj.rotation.z, z, k);
  }

  fingers(arm, kind, k) {
    const curls = kind === 'sword' ? [0, 0, 1.5, 1.5] : kind === 'fist' ? [1.6, 1.6, 1.6, 1.6] : [0.35, 0.45, 0.55, 0.65];
    const order = arm === this.arms[1] ? [3, 2, 1, 0] : [0, 1, 2, 3];
    arm.fingers.forEach((f, i) => { f.rotation.x = lerp(f.rotation.x, curls[order[i]], k); });
    arm.th.rotation.x = lerp(arm.th.rotation.x, kind === 'sword' ? 0.9 : 0.3, k);
  }

  // s: { mode, onGround, speed, vel, boost, dun, meditate, camPos, heading, sprint, airborne, turn }
  update(dt, pos, heading, s) {
    this.anim?.restore();                 // 上一帧盖上去的动作姿势先还原，程序化姿势照常从自己的状态继续
    this.time += dt;
    const t = this.time, k = 1 - Math.exp(-dt * 12), kSlow = 1 - Math.exp(-dt * 6);
    this.root.position.copy(pos);
    this.root.rotation.y = heading;
    const L = this.legs[1], R = this.legs[-1], AL = this.arms[1], AR = this.arms[-1];
    const flying = s.mode !== 'walk';
    const spd = s.speed;
    const stream = clamp(spd / 70, 0, 1);
    let pelY = 0.94, pelRx = 0, pelRy = 0, chRx = 0, chRy = 0, chRz = 0, headRx = 0, headRy = 0;
    const skirt = { f: [0, 0], b: [0, 0] };

    if (s.meditate) {
      pelY = 0.34 + 0.32 + Math.sin(t * 1.2) * 0.03;
      for (const [leg, sd] of [[L, 1], [R, -1]]) { this.J(leg.hip, 0, -1.45, sd * 0.25, sd * 0.75, kSlow); this.J(leg.knee, 0, 2.35, 0, 0, kSlow); this.J(leg.ankle, 0, 0.3, 0, -sd * 0.5, kSlow); }
      for (const [arm, sd] of [[AL, 1], [AR, -1]]) { this.J(arm.sh, 0, -0.5, 0, sd * 0.18, kSlow); this.J(arm.el, 0, -1.05, 0, 0, kSlow); this.J(arm.wr, 0, -0.2, 0, -sd * 0.3, kSlow); this.fingers(arm, 'relax', kSlow); }
      headRx = 0.18;
      skirt.f = [-1.25, -1.25]; skirt.b = [0.15, 0.15];
    } else if (!flying) {
      const moving = spd > 0.4;
      if (s.onGround && moving) this.phase += dt * spd * (s.sprint ? 0.62 : 1.1);
      const ph = this.phase, A = s.sprint ? 0.78 : 0.44 * Math.min(1, spd / 4);
      if (!s.onGround) {
        this.J(L.hip, 0, -0.65, 0, 0.05, k); this.J(L.knee, 0, 1.15, 0, 0, k);
        this.J(R.hip, 0, -0.1, 0, -0.05, k); this.J(R.knee, 0, 0.55, 0, 0, k);
        this.J(L.ankle, 0, -0.2, 0, 0, k); this.J(R.ankle, 0, 0.2, 0, 0, k);
        this.J(AL.sh, 0, -0.5, 0, 0.75, k); this.J(AR.sh, 0, 0.4, 0, -0.75, k);
        this.J(AL.el, 0, -0.4, 0, 0, k); this.J(AR.el, 0, -0.3, 0, 0, k);
        chRx = 0.1; skirt.f = [-0.5, -0.1]; skirt.b = [0.3, 0.3];
      } else {
        const sl = Math.sin(ph), cl = Math.cos(ph);
        this.J(L.hip, 0, -sl * A, 0, 0.02, k); this.J(R.hip, 0, sl * A, 0, -0.02, k);
        this.J(L.knee, 0, 0.08 + Math.max(0, cl) * A * 1.5, 0, 0, k); this.J(R.knee, 0, 0.08 + Math.max(0, -cl) * A * 1.5, 0, 0, k);
        this.J(L.ankle, 0, -Math.max(0, cl) * 0.4, 0, 0, k); this.J(R.ankle, 0, -Math.max(0, -cl) * 0.4, 0, 0, k);
        if (s.sprint) {   // 轻功：双臂后掠
          this.J(AL.sh, 0, 0.95, 0, 0.42, k); this.J(AR.sh, 0, 0.95, 0, -0.42, k);
          this.J(AL.el, 0, -0.15, 0, 0, k); this.J(AR.el, 0, -0.15, 0, 0, k);
          pelRx = 0.28; chRx = 0.22;
        } else {
          this.J(AL.sh, 0, sl * A * 0.65, 0, 0.12, k); this.J(AR.sh, 0, -sl * A * 0.65, 0, -0.12, k);
          this.J(AL.el, 0, -0.25 - Math.max(0, -sl) * 0.3, 0, 0, k); this.J(AR.el, 0, -0.25 - Math.max(0, sl) * 0.3, 0, 0, k);
        }
        pelY = 0.94 - Math.abs(Math.sin(ph)) * 0.025 * Math.min(1, spd / 3) + (moving ? 0 : Math.sin(t * 1.6) * 0.004);
        pelRy = sl * 0.08 * Math.min(1, spd / 3);
        chRy = -sl * 0.12 * Math.min(1, spd / 3);
        chRx += moving ? 0.04 : Math.sin(t * 1.6) * 0.012;
        skirt.f = [Math.min(0, -sl * A) * 0.9, Math.min(0, sl * A) * 0.9];
        skirt.b = [Math.max(0, -sl * A) * 0.7, Math.max(0, sl * A) * 0.7];
        if (!moving) {   // 待机：微微环视镜头方向
          const toCam = new THREE.Vector3().subVectors(s.camPos, pos);
          const yawCam = Math.atan2(toCam.x, toCam.z) - heading;
          headRy = clamp(Math.atan2(Math.sin(yawCam + Math.PI), Math.cos(yawCam + Math.PI)) * 0.0, -0.5, 0.5) + Math.sin(t * 0.4) * 0.15;
        }
      }
      this.fingers(AL, 'relax', k); this.fingers(AR, 'relax', k);
      this.J(AL.wr, 0, 0, 0, 0, k); this.J(AR.wr, 0, 0, 0, 0, k);
    } else {
      // 御剑：前后弓步立于剑上，右手剑指，左手负后
      const b = s.boost, d = s.dun;
      this.J(L.hip, 0, -0.32, 0.1, 0.05, k); this.J(L.knee, 0, 0.42, 0, 0, k); this.J(L.ankle, 0, -0.12, 0, 0, k);
      this.J(R.hip, 0, 0.3, -0.1, -0.05, k); this.J(R.knee, 0, 0.5, 0, 0, k); this.J(R.ankle, 0, -0.15, 0, 0, k);
      pelY = 0.9; pelRy = -0.32; chRy = 0.28 - b * 0.1;
      pelRx = 0.06 + b * 0.18 + d * 0.1 + clamp(-s.vel.y / 120, -0.3, 0.3);
      chRx = 0.05 + b * 0.22 + d * 0.15;
      chRz = clamp(-s.turn * 0.25, -0.35, 0.35);
      this.J(AR.sh, 0, -1.35 - b * 0.3, 0.1, -0.12, k);
      this.J(AR.el, 0, -0.7 + b * 0.6, 0, 0, k);
      this.J(AR.wr, 0, -0.25, 0, 0.1, k);
      this.fingers(AR, 'sword', k);
      this.J(AL.sh, 0, 0.55 + b * 0.3, -0.2, 0.18, k);
      this.J(AL.el, 0, -1.7 + b * 0.8, 0, 0, k);
      this.J(AL.wr, 0, 0, 0, 0, k);
      this.fingers(AL, b > 0.5 ? 'relax' : 'fist', k);
      headRx = -0.1 - b * 0.15;
      skirt.f = [0.35 * stream + 0.15, 0.4 * stream + 0.15]; skirt.b = [0.9 * stream + 0.1, 0.95 * stream + 0.1];
    }
    // 出剑：覆盖右臂与上身（流云剑：举剑、斜斩、收势；剑气：剑指前推），手中现出一道剑光
    if (s.strike && !s.meditate && !flying) {
      const u = s.strike.t, kk = 1 - Math.exp(-dt * 30);
      if (s.strike.kind === 'slash') {
        const w = u < 0.3 ? u / 0.3 : 1, f = u < 0.3 ? 0 : Math.min(1, (u - 0.3) / 0.3);
        this.J(AR.sh, 0, -2.5 * w + 2.1 * f, 0.15 + 0.35 * f, -0.7 * w + 1.1 * f, kk);
        this.J(AR.el, 0, -1.0 * w + 0.85 * f, 0, 0, kk);
        this.J(AR.wr, 0, 0.3, 0, 0, kk);
        this.fingers(AR, 'fist', kk);
        chRy = 0.55 * w - 1.0 * f; chRx = 0.05 + 0.15 * f;
      } else {
        this.J(AR.sh, 0, -1.55, -0.1, -0.15, kk); this.J(AR.el, 0, -0.08, 0, 0, kk); this.J(AR.wr, 0, -0.2, 0, 0, kk);
        this.fingers(AR, 'sword', kk);
        this.J(AL.sh, 0, 0.4, 0, 0.3, kk); this.J(AL.el, 0, -1.4, 0, 0, kk);
        chRy = -0.3; chRx = 0.1;
      }
    }
    // 防御：右手横剑于胸前，左手剑指抵住剑身；身前现出护体剑罡
    const guard = !!(s.guard && !s.meditate && !flying && !s.strike);
    if (guard) {
      const kk = 1 - Math.exp(-dt * 22);
      this.J(AR.sh, 0, -1.2, 0.5, -0.35, kk); this.J(AR.el, 0, -1.45, 0, 0, kk); this.J(AR.wr, 0, 0.15, 0, 0.55, kk);
      this.J(AL.sh, 0, -1.05, -0.45, 0.35, kk); this.J(AL.el, 0, -1.2, 0, 0, kk); this.J(AL.wr, 0, 0, 0, 0, kk);
      this.fingers(AR, 'fist', kk); this.fingers(AL, 'sword', kk);
      chRx = 0.1; chRy = 0;
    }
    const su = this.shield.material.uniforms;
    su.uA.value += ((guard ? 1 : 0) - su.uA.value) * (1 - Math.exp(-dt * 10));
    su.uFlash.value = Math.max(0, su.uFlash.value - dt * 3);
    su.uTime.value = t;
    this.shield.visible = su.uA.value > 0.02;
    this.blade.visible = guard || !!(s.strike && s.strike.kind === 'slash' && s.strike.t < 0.85);
    if (guard) this.blade.material.opacity = 0.6;
    else if (this.blade.visible) this.blade.material.opacity = 0.75 * Math.min(1, s.strike.t * 6) * (1 - Math.max(0, (s.strike.t - 0.6) / 0.25));
    // 气流使裙摆后扬
    const flow = flying ? 0 : stream * 0.3;
    this.pelvis.position.y = lerp(this.pelvis.position.y, pelY, k);
    this.pelvis.rotation.x = lerp(this.pelvis.rotation.x, pelRx, k);
    this.pelvis.rotation.y = lerp(this.pelvis.rotation.y, pelRy, k);
    this.chest.rotation.set(lerp(this.chest.rotation.x, chRx, k), lerp(this.chest.rotation.y, chRy, k), lerp(this.chest.rotation.z, chRz, k));
    this.head.rotation.x = lerp(this.head.rotation.x, headRx, kSlow);
    this.head.rotation.y = lerp(this.head.rotation.y, headRy, kSlow);
    // 第十四轮：动作库的动作（剑招、格挡、受击……）按权重盖在程序化姿势上；握剑时右手攥拳
    let animW = 0;
    if (this.anim) {
      this.anim.update(dt);
      if (this.anim.active) {
        if (s.drawn) this.fingers(AR, 'fist', 1);
        this.anim.apply();
        animW = this.anim.weight(BONE.hip_l);
        if (animW > 0.01) {                // 裙摆随动作里的抬腿摆开
          const hl = L.hip.rotation.x, hr = R.hip.rotation.x;
          const cf = (v) => Math.max(-0.7, Math.min(0, v) * 0.6), cb = (v) => Math.min(0.55, Math.max(0, v) * 0.5);
          skirt.f = [lerp(skirt.f[0], cf(hl), animW), lerp(skirt.f[1], cf(hr), animW)];
          skirt.b = [lerp(skirt.b[0], cb(hl), animW), lerp(skirt.b[1], cb(hr), animW)];
        }
      }
    }
    // 佩剑在手（出剑、格挡与收势后的几秒）：剑出鞘握在右手，背上只剩剑鞘
    this.drawn = lerp(this.drawn, s.drawn ? 1 : 0, 1 - Math.exp(-dt * (s.drawn ? 30 : 8)));
    this.handSword.visible = this.drawn > 0.5 && !flying;
    if (this.handSword.visible) this.blade.visible = false;          // 有真剑在手，就不再画旧的一道光刃
    if (this.handSword.visible) {
      this.fingers(AR, 'fist', 1);
      this.handGlow.material.opacity = (s.bladeGlow ?? 0) * 0.35;
      this.handBladeMat.emissiveIntensity = 0.3 + (s.bladeGlow ?? 0) * 1.2;
    }
    for (const p of this.panels) {
      const i = p.side > 0 ? 0 : 1;
      const target = (p.front ? skirt.f[i] : skirt.b[i]) + flow + Math.sin(t * 7 + i * 2 + (p.front ? 0 : 1)) * 0.03 * stream;
      p.pv.rotation.x = lerp(p.pv.rotation.x, target, k);
      p.pv.rotation.z = lerp(p.pv.rotation.z, (s.meditate ? p.side * 0.5 : 0), kSlow);
    }
    this.gauzeSkirt.parent.rotation.x = lerp(this.gauzeSkirt.parent.rotation.x, (flying ? 1.0 : 0.25) * stream + (s.meditate ? -0.6 : 0), k);
    // 眨眼
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 ? 0.12 : 1;
    if (this.blinkT < 0) this.blinkT = 2.5 + Math.random() * 3;
    this.eyes.scale.y = lerp(this.eyes.scale.y, blink, 0.6);
    this.eyes.position.y = (1 - this.eyes.scale.y) * 0.113;

    // ---------- 物理 ----------
    this.root.updateMatrixWorld(true);
    const org = pos;
    const rel = (obj, x, y, z) => obj.localToWorld(new THREE.Vector3(x, y, z)).sub(org);
    const fwd = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    const vel = s.vel;
    const acc = new THREE.Vector3(0, -9.8, 0).addScaledVector(vel, -0.9);
    if (acc.length() > 80) acc.setLength(80);
    acc.x += Math.sin(t * 1.7) * 1.2; acc.z += Math.cos(t * 1.3) * 1.2;
    const spheres = [[rel(this.chest, 0, 0, 0), 0.21], [rel(this.pelvis, 0, -0.1, 0), 0.26], [rel(this.head, 0, 0.1, 0), 0.115]];
    for (const h of this.hair) { h.s.pin(0, rel(this.head, h.x, 0.135 - Math.abs(h.x) * 0.4, -0.09)); h.s.step(dt, acc, spheres); }
    for (const l of this.locks) { l.st.pin(0, rel(this.head, l.s * 0.1, 0.13, -0.005)); l.st.step(dt, acc, [[rel(this.head, 0, 0.08, 0.0), 0.118], ...spheres.slice(0, 1)]); }
    this.ribbon.pin(0, rel(this.head, 0, 0.225, -0.065)); this.ribbon.step(dt, acc, spheres);
    for (const sw of this.shawl) {
      sw.st.pin(0, rel(this.chest, sw.s * 0.1, 0.13, -0.15));
      sw.st.pin(5, rel(this.arms[sw.s].el, sw.s * 0.07, -0.05, 0));
      sw.st.step(dt, acc, spheres);
    }
    for (const tl of this.tails) { tl.st.pin(0, rel(this.pelvis, tl.s * 0.045, 0.07, 0.175)); tl.st.step(dt, acc, spheres.slice(1, 2)); }
    const view = new THREE.Vector3().subVectors(s.camPos, org).normalize();
    for (const h of this.hair) h.s.render(org, view, fwd);
    for (const l of this.locks) l.st.render(org, view, fwd);
    this.ribbon.render(org, view, fwd);
    for (const sw of this.shawl) sw.st.render(org, null, new THREE.Vector3(0, 1, 0));
    for (const tl of this.tails) tl.st.render(org, view, fwd);
    // 广袖
    const gw = new THREE.Vector3(0, -1, 0).addScaledVector(vel, -0.03);
    for (const sd of [1, -1]) this.arms[sd].sleeve.update(this.arms[sd].el, gw);
  }

  // 剑的挂点：背负时在剑鞘口，御剑时由 Player 放到脚下
  scabbardMatrix() {
    this.root.updateMatrixWorld(true);
    return this.scabTop.matrixWorld;
  }
}
