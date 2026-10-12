// 同门弟子（轻量人物）：每个骨节一块顶点色合并网格；发式、服色、道具各异；
// 待机呼吸、注视玩家、说话手势，以及扫地、锄地、捣药、练剑、作画、读书、吐纳等日常动作
import * as THREE from 'three';
import { lerp, damp, clamp, wrapAngle, lerpAngle } from '../core/math.js';
import { skinRig } from './rig.js';
import { AnimPlayer } from './anim.js';

const SKIN = 0xeccdb4;
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });

function tint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function P(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.clone();
  g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)));
  return tint(g, color);
}
function mergeParts(parts) {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) { pos.set(p.attributes.position.array, o * 3); nrm.set(p.attributes.normal.array, o * 3); col.set(p.attributes.color.array, o * 3); o += p.attributes.position.count; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const sph = (r, a = 12, b = 9) => new THREE.SphereGeometry(r, a, b);
const cyl = (a, b, h, s = 10) => new THREE.CylinderGeometry(a, b, h, s);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// 当前构建所用的材质（魔修等敌人传入自己的材质：暗色衣袍、发光的红眼）
let CUR = MAT;
function mesh(parent, parts, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(mergeParts(parts), CUR);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function group(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

// 手持道具（以手为原点，沿 -Y 为手指方向）
function propParts(kind, L) {
  const wood = 0x8a6c50, dark = 0x3a2b21;
  switch (kind) {
    case 'broom': return [P(cyl(0.018, 0.018, 1.45), 0xb3a676, 0, -0.2, 0), P(new THREE.ConeGeometry(0.17, 0.42, 8), 0xb79f6c, 0, -1.05, 0, Math.PI)];
    case 'hoe': return [P(cyl(0.02, 0.02, 1.5), wood, 0, -0.35, 0), P(box(0.16, 0.2, 0.025), 0x6e6e6a, 0, -1.1, 0.07, 0.6)];
    case 'pestle': return [P(cyl(0.035, 0.05, 0.62), wood, 0, -0.2, 0)];
    case 'sword': return [P(box(0.045, 0.95, 0.012), 0xd8dde0, 0, -0.62, 0), P(box(0.15, 0.03, 0.04), 0xc9a050, 0, -0.12, 0), P(cyl(0.015, 0.015, 0.16), dark, 0, -0.03, 0)];
    case 'scroll': return [P(cyl(0.03, 0.03, 0.34), 0xe8dfc8, 0.0, -0.04, 0.05, 0, 0, Math.PI / 2), P(cyl(0.035, 0.035, 0.04), dark, 0.18, -0.04, 0.05, 0, 0, Math.PI / 2), P(cyl(0.035, 0.035, 0.04), dark, -0.18, -0.04, 0.05, 0, 0, Math.PI / 2)];
    case 'ledger': return [P(box(0.2, 0.26, 0.03), 0x3e5a72, 0, -0.08, 0.05), P(box(0.19, 0.25, 0.034), 0xe8dfc8, 0.004, -0.08, 0.05)];
    case 'brush': return [P(cyl(0.008, 0.008, 0.24), dark, 0, -0.09, 0.02), P(new THREE.ConeGeometry(0.014, 0.05, 6), 0x1d1d1d, 0, -0.23, 0.02, Math.PI)];
    case 'fan': return [P(new THREE.CircleGeometry(0.2, 12, 0, Math.PI), 0xe8e2d0, 0, -0.06, 0.02, 0, 0, -Math.PI / 2), P(cyl(0.008, 0.008, 0.2), dark, 0, -0.06, 0.02)];
    case 'basket': return [P(cyl(0.16, 0.12, 0.2, 10), 0xb3a676, 0, -0.18, 0.05), P(new THREE.TorusGeometry(0.15, 0.012, 4, 10, Math.PI), 0x9c9a62, 0, -0.08, 0.05)];
    default: return null;
  }
}

export class NPC {
  // def: { id, name, title, x, y, z, ry, look, anim, prop, propHand }
  constructor(scene, def) {
    this.def = def;
    CUR = def.material || MAT;
    const L = def.look || {};
    const robe = L.robe ?? 0x9fb1bd, inner = L.inner ?? 0xe9e6de, trim = L.trim ?? 0x34495a, sash = L.sash ?? 0x2c3c4a, hair = L.hair ?? 0x1a1614;
    const s = L.scale ?? 1;
    const root = this.root = new THREE.Group();
    root.position.set(def.x, def.y, def.z);
    root.rotation.y = def.ry ?? 0;
    root.scale.setScalar(s);
    scene.add(root);
    this.baseRy = def.ry ?? 0;
    // 下身：长袍下摆、内裙、鞋、腰带
    const hips = this.hips = group(root, 0, 0.95, 0);
    const lower = [
      P(lathe([[0.17, 0.02], [0.2, -0.25], [0.26, -0.6], [0.33, -0.9], [0.0, -0.9]], 18), robe),
      P(lathe([[0.3, -0.84], [0.335, -0.93], [0.0, -0.93]], 18), inner),
      P(cyl(0.178, 0.178, 0.11, 18), sash, 0, 0.0, 0),
      P(box(0.06, 0.4, 0.015), sash, 0.05, -0.2, 0.19, 0.05),
      P(box(0.05, 0.34, 0.015), sash, -0.02, -0.18, 0.19, 0.03),
      P(sph(0.055, 8, 6), 0x2a2522, 0.09, -0.92, 0.12, 0, 0, 0, 1, 0.6, 1.6),
      P(sph(0.055, 8, 6), 0x2a2522, -0.09, -0.92, 0.12, 0, 0, 0, 1, 0.6, 1.6),
    ];
    if (L.apron) lower.push(P(box(0.34, 0.6, 0.02), L.apron, 0, -0.32, 0.2, -0.12));
    if (L.short) lower.splice(0, 2, P(lathe([[0.17, 0.02], [0.2, -0.25], [0.25, -0.5], [0.0, -0.5]], 16), robe), P(cyl(0.07, 0.06, 0.42, 8), inner, 0.09, -0.7, 0), P(cyl(0.07, 0.06, 0.42, 8), inner, -0.09, -0.7, 0));
    mesh(hips, lower);
    // 上身
    const chest = this.chest = group(hips, 0, 0.02, 0);
    const torso = [
      P(lathe([[0.165, 0], [0.18, 0.12], [0.205, 0.3], [0.19, 0.37], [0.11, 0.42], [0.055, 0.45], [0, 0.45]], 18), robe, 0, 0, 0, 0, 0, 0, 1, 1, 0.8),
      P(box(0.05, 0.38, 0.012), trim, 0.035, 0.24, 0.145, 0.1, 0, 0.62),
      P(box(0.04, 0.2, 0.01), inner, -0.03, 0.36, 0.13, 0.15, 0, -0.55),
    ];
    if (L.vest) torso.push(P(lathe([[0.172, 0], [0.188, 0.12], [0.213, 0.3], [0.198, 0.37], [0.0, 0.37]], 18), L.vest, 0, 0, 0, 0, 0, 0, 1, 1, 0.83));
    if (L.sword) torso.push(P(box(0.05, 0.9, 0.03), 0x2a1a14, -0.02, 0.15, -0.18, 0, 0, 0.7), P(box(0.12, 0.03, 0.04), 0xc9a050, 0.2, 0.47, -0.18, 0, 0, 0.7));
    mesh(chest, torso);
    // 头
    const head = this.head = group(chest, 0, 0.45, 0);
    const hp = [
      P(cyl(0.042, 0.048, 0.09, 8), SKIN, 0, 0.02, 0),
      P(sph(0.102, 16, 12), SKIN, 0, 0.13, 0.005, 0, 0, 0, 0.92, 1.05, 0.98),
      P(sph(0.012, 6, 4), L.eye ?? 0x1c140e, 0.035, 0.14, 0.092, 0, 0, 0, 1.4, 0.8, 0.6),
      P(sph(0.012, 6, 4), L.eye ?? 0x1c140e, -0.035, 0.14, 0.092, 0, 0, 0, 1.4, 0.8, 0.6),
      P(box(0.04, 0.006, 0.01), hair, 0.037, 0.163, 0.093, 0, 0, -0.15),
      P(box(0.04, 0.006, 0.01), hair, -0.037, 0.163, 0.093, 0, 0, 0.15),
      P(box(0.024, 0.005, 0.006), 0xb86a62, 0, 0.088, 0.096),
      P(new THREE.ConeGeometry(0.011, 0.03, 5), SKIN, 0, 0.115, 0.1, 0.3),
      // 发顶与后脑
      P(new THREE.SphereGeometry(0.108, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), hair, 0, 0.14, -0.008, -0.38),
      P(new THREE.SphereGeometry(0.106, 16, 10, Math.PI * 0.5, Math.PI, Math.PI * 0.18, Math.PI * 0.62), hair, 0, 0.13, -0.012),
    ];
    const style = L.hairStyle ?? 'bun';
    if (style === 'bun' || style === 'ponytail' || style === 'elder' || style === 'crown') {
      hp.push(P(sph(0.045, 10, 8), hair, 0, 0.255, -0.03));
      hp.push(P(cyl(0.004, 0.004, 0.16, 4), L.pin ?? 0xc9a050, 0, 0.26, -0.03, 0, 0, Math.PI / 2));
    }
    if (style === 'ponytail') hp.push(P(cyl(0.03, 0.012, 0.42, 6), hair, 0, 0.06, -0.11, 0.25), P(box(0.012, 0.2, 0.03), L.ribbon ?? 0xe6e1d4, 0, 0.19, -0.1, 0.3));
    if (style === 'twin') for (const x of [-0.07, 0.07]) hp.push(P(sph(0.042, 10, 8), hair, x, 0.24, -0.02), P(box(0.01, 0.12, 0.02), L.ribbon ?? 0xb8452e, x, 0.18, -0.05));
    if (style === 'crown') hp.push(P(box(0.07, 0.05, 0.08), L.crown ?? 0x1d1d1d, 0, 0.275, -0.03), P(cyl(0.004, 0.004, 0.17, 4), 0xc9a050, 0, 0.28, -0.03, 0, 0, Math.PI / 2));
    if (style === 'elder') hp.push(P(new THREE.ConeGeometry(0.055, 0.2, 8), hair, 0, 0.0, 0.07, Math.PI - 0.25), P(box(0.07, 0.008, 0.01), hair, 0, 0.1, 0.1));
    if (style === 'cap') hp.push(P(cyl(0.095, 0.105, 0.09, 12), 0x1f1f22, 0, 0.24, -0.01), P(box(0.3, 0.012, 0.03), 0x1f1f22, 0, 0.23, -0.1));
    if (L.hat) hp.push(P(new THREE.ConeGeometry(0.34, 0.16, 16), 0xc2a46a, 0, 0.29, 0), P(cyl(0.09, 0.09, 0.05, 10), 0xa88a52, 0, 0.23, 0));
    mesh(head, hp);
    // 双臂
    this.arms = {};
    for (const side of [1, -1]) {
      const sh = group(chest, side * 0.2, 0.36, -0.01);
      mesh(sh, [P(sph(0.065, 10, 8), robe), P(cyl(0.062, 0.07, 0.28, 10), robe, 0, -0.14, 0)]);
      const el = group(sh, 0, -0.28, 0);
      const fp = [P(cyl(0.07, L.tight ? 0.075 : 0.13, 0.3, 12), robe, 0, -0.15, 0, 0, 0, 0), P(cyl(0.05, 0.05, 0.05, 8), inner, 0, -0.29, 0)];
      if (!L.tight) fp.push(P(cyl(0.13, 0.12, 0.04, 12), trim, 0, -0.3, 0));
      mesh(el, fp);
      const hand = group(el, 0, -0.34, 0);
      mesh(hand, [P(sph(0.04, 8, 6), SKIN, 0, -0.02, 0, 0, 0, 0, 0.9, 1.15, 0.7)]);
      this.arms[side] = { sh, el, hand };
    }
    const pk = def.prop && propParts(def.prop);
    if (pk) mesh(this.arms[def.propHand ?? -1].hand, pk, 0, -0.03, 0.02);
    // 各骨节的网格合为一个蒙皮网格：每人一次绘制、一次投影
    skinRig(root, { materials: { all: CUR } });
    CUR = MAT;
    this.anim = def.anim ?? 'idle';
    this.t = Math.random() * 10;
    this.look = 0; this.lookP = 0;
    this.talking = false;
    this.facePlayer = 0;
    this.pos = root.position;
    this.motion = null;          // 第十四轮：动作库的动作（魔修出手用，见 setAnimLib）
  }

  // 动作库：只驱动上身（胸、头、双臂；袍子下面没有腿关节），骨盆只给一点起伏
  setAnimLib(lib) {
    const A = this.arms;
    this.motion = new AnimPlayer(lib, {
      joints: [this.hips, this.chest, this.head, A[1].sh, A[1].el, A[1].hand, A[-1].sh, A[-1].el, A[-1].hand, null, null, null, null, null, null],
      pelvis: this.hips, pelvisRest: new THREE.Vector3(0, 0.95, 0), pelvisScale: new THREE.Vector3(0.3, 0.15, 0.3),
    });
  }

  setPose(o, k) {
    const J = (g, x, y, z) => { g.rotation.x = lerp(g.rotation.x, x, k); g.rotation.y = lerp(g.rotation.y, y, k); g.rotation.z = lerp(g.rotation.z, z, k); };
    const R = this.arms[-1], Lf = this.arms[1];
    J(R.sh, o.rs[0], o.rs[1], o.rs[2]); J(R.el, o.re[0], o.re[1], o.re[2]);
    J(Lf.sh, o.ls[0], o.ls[1], o.ls[2]); J(Lf.el, o.le[0], o.le[1], o.le[2]);
    if (o.rh) J(R.hand, o.rh[0], o.rh[1], o.rh[2]);
    if (o.lh) J(Lf.hand, o.lh[0], o.lh[1], o.lh[2]);
    J(this.chest, o.ch?.[0] ?? 0, o.ch?.[1] ?? 0, o.ch?.[2] ?? 0);
    this.hips.position.y = lerp(this.hips.position.y, 0.95 + (o.hy ?? 0), k);
  }

  update(dt, playerPos, near) {
    this.motion?.restore();
    this.t += dt;
    const t = this.t, k = damp(8, dt);
    const dx = playerPos.x - this.root.position.x, dz = playerPos.z - this.root.position.z, d = Math.hypot(dx, dz);
    // 说话时转身面向玩家，否则回到原朝向
    const toP = Math.atan2(dx, dz);
    const want = this.talking ? toP : this.baseRy;
    this.root.rotation.y = lerpAngle(this.root.rotation.y, want, damp(this.talking ? 5 : 1.5, dt));
    // 注视：近处转头看玩家
    let lookY = Math.sin(t * 0.35) * 0.35, lookX = 0;
    if (d < 7.5 && (near || this.talking || d < 4.5)) {
      lookY = clamp(wrapAngle(toP - this.root.rotation.y), -1.1, 1.1);
      lookX = -0.08;
    }
    const sw = Math.sin(t * 1.6) * 0.02;
    let pose;
    const A = this.talking ? 'talk' : this.anim;
    switch (A) {
      case 'sweep': {
        const s = Math.sin(t * 2.2);
        pose = { rs: [-0.55 + s * 0.15, 0, -0.15], re: [-0.6, 0, 0], ls: [-0.75 + s * 0.15, 0, 0.35], le: [-0.9, 0, 0], ch: [0.25, s * 0.35, 0], rh: [0.35, 0, s * 0.5], hy: -0.03 };
        lookY = s * 0.25; lookX = 0.25;
        break;
      }
      case 'hoe': {
        const c = (t * 0.75) % 1, up = c < 0.55 ? c / 0.55 : 1 - (c - 0.55) / 0.45;
        const a = -2.2 * Math.pow(up, 0.8);
        pose = { rs: [a, 0, -0.1], re: [-0.4, 0, 0], ls: [a + 0.15, 0, 0.25], le: [-0.55, 0, 0], ch: [0.35 - up * 0.3, 0, 0], rh: [1.2, 0, 0], hy: -0.04 };
        lookX = 0.35; lookY = 0;
        break;
      }
      case 'pound': {
        const c = Math.max(0, Math.sin(t * 3.2));
        pose = { rs: [-0.9 - c * 0.5, 0, -0.1], re: [-0.9 + c * 0.4, 0, 0], ls: [-0.5, 0, 0.3], le: [-1.2, 0, 0], ch: [0.25, 0, 0], rh: [0.6, 0, 0] };
        lookX = 0.35; lookY = 0;
        break;
      }
      case 'sword': {
        const a = t * 0.9;
        pose = { rs: [-1.4 + Math.sin(a) * 0.6, Math.cos(a) * 0.5, -0.3 + Math.cos(a) * 0.4], re: [-0.2, 0, 0], ls: [-0.3, 0, 0.9 + Math.sin(a + 1) * 0.2], le: [-1.4, 0, 0], ch: [0.05, Math.sin(a) * 0.4, 0], rh: [0.4, 0, 0] };
        if (!this.talking) { lookY = Math.sin(a) * 0.4; lookX = 0; }
        this.root.rotation.y = this.baseRy + Math.sin(a * 0.5) * 0.6 * (this.talking ? 0 : 1);
        break;
      }
      case 'taiji': {
        const a = t * 0.7;
        pose = { rs: [-0.9 + Math.sin(a) * 0.4, 0, -0.4 - Math.cos(a) * 0.3], re: [-0.8, 0, 0], ls: [-0.9 + Math.sin(a + Math.PI) * 0.4, 0, 0.4 + Math.cos(a) * 0.3], le: [-0.8, 0, 0], ch: [0, Math.sin(a) * 0.25, 0], hy: -0.06 + Math.sin(a * 2) * 0.03 };
        lookY = Math.sin(a) * 0.3;
        break;
      }
      case 'paint': {
        const s = Math.sin(t * 1.3), q = Math.sin(t * 5.3) * 0.1;
        pose = { rs: [-1.15 + q, 0.2, -0.15], re: [-0.7 + s * 0.15, 0, 0], ls: [0.05, 0, 0.12], le: [-0.2, 0, 0], ch: [0.08, -0.15, 0], rh: [0.2, 0, 0] };
        if (!near && !this.talking) { lookX = 0.1; lookY = -0.2 + s * 0.15; }
        break;
      }
      case 'read': {
        pose = { rs: [-0.95, 0, -0.35], re: [-1.0, 0, 0], ls: [-0.95, 0, 0.35], le: [-1.0, 0, 0], ch: [0.06, 0, 0] };
        if (!near && !this.talking) { lookX = 0.35; lookY = Math.sin(t * 0.25) * 0.15; }
        break;
      }
      case 'behind': {      // 负手而立
        pose = { rs: [0.35, 0, 0.18], re: [-1.2, 0.5, 0], ls: [0.35, 0, -0.18], le: [-1.2, -0.5, 0], ch: [-0.04 + sw, 0, 0] };
        break;
      }
      case 'ledger': {
        pose = { rs: [-0.45, 0, -0.2], re: [-1.35, 0, 0], ls: [-0.3, 0, 0.25], le: [-1.2, 0, 0], ch: [0.02 + sw, 0, 0] };
        break;
      }
      // ---------- 战斗动作（魔修）：ct 为当前动作的进度 0~1 ----------
      case 'run': {
        const s = Math.sin(t * 9);
        pose = { rs: [0.55 * s, 0, -0.15], re: [-0.7, 0, 0], ls: [-0.55 * s, 0, 0.15], le: [-0.7, 0, 0], ch: [0.32, 0, 0], hy: -0.03 + Math.abs(s) * 0.03 };
        lookX = -0.1; lookY = 0;
        break;
      }
      case 'windup': {
        const c = Math.min(1, this.ct || 0);
        pose = { rs: [-2.4 * c, 0.2, -0.5 * c], re: [-0.9 * c, 0, 0], ls: [-0.4 * c, 0, 0.5], le: [-0.6, 0, 0], ch: [-0.15 * c, 0.5 * c, 0], hy: -0.05 * c };
        lookX = -0.1; lookY = 0;
        break;
      }
      case 'strike': {
        const c = Math.min(1, this.ct || 0);
        pose = { rs: [-2.4 + 2.0 * c, 0.3, -0.5 + 0.9 * c], re: [-0.9 + 0.75 * c, 0, 0], ls: [-0.4, 0, 0.5], le: [-0.6, 0, 0], ch: [-0.15 + 0.45 * c, 0.5 - 1.0 * c, 0], hy: -0.08 };
        lookX = 0.1; lookY = 0;
        break;
      }
      case 'cast': {
        const c = Math.min(1, this.ct || 0);
        pose = { rs: [-1.45, 0.2, -0.1], re: [-0.2 - 0.3 * (1 - c), 0, 0], ls: [-1.45, -0.2, 0.1], le: [-0.2 - 0.3 * (1 - c), 0, 0], ch: [0.12, 0, 0], rh: [0.6, 0, 0], lh: [0.6, 0, 0] };
        lookX = 0; lookY = 0;
        break;
      }
      case 'hit': {
        pose = { rs: [0.4, 0, -0.5], re: [-0.5, 0, 0], ls: [0.4, 0, 0.5], le: [-0.5, 0, 0], ch: [-0.35, 0, 0], hy: -0.04 };
        lookX = -0.25;
        break;
      }
      case 'die': {
        const c = Math.min(1, this.ct || 0);
        pose = { rs: [0.3, 0, -0.9 * c], re: [-0.2, 0, 0], ls: [0.3, 0, 0.9 * c], le: [-0.2, 0, 0], ch: [0.7 * c, 0, 0.2 * c], hy: -0.55 * c };
        lookX = 0.5 * c;
        break;
      }
      case 'talk': {
        const g = Math.sin(t * 2.4) * 0.5 + 0.5;
        pose = { rs: [-0.55 - g * 0.35, 0.15, -0.2], re: [-0.9 + g * 0.25, 0, 0], ls: [-0.15, 0, 0.12], le: [-0.4, 0, 0], ch: [0.02 + sw, 0, 0], rh: [-0.3, 0, 0] };
        lookX = -0.05 + Math.sin(t * 3) * 0.04;
        break;
      }
      default:
        pose = { rs: [0.05, 0, -0.08], re: [-0.25, 0, 0], ls: [0.05, 0, 0.08], le: [-0.25, 0, 0], ch: [sw, 0, 0] };
    }
    this.setPose(pose, k);
    this.look = lerp(this.look, lookY, damp(4, dt));
    this.lookP = lerp(this.lookP, lookX, damp(4, dt));
    this.head.rotation.y = this.look;
    this.head.rotation.x = this.lookP;
    if (this.motion) { this.motion.update(dt); if (this.motion.active) this.motion.apply(); }
  }
}

// ---------------- 灵狐 ----------------
export class Fox {
  constructor(scene) {
    const W = 0xf2f0ea, G = 0xd8d4cc, D = 0x3a3634, P2 = 0xe9b8b0;
    const root = this.root = new THREE.Group();
    scene.add(root);
    const body = this.body = group(root, 0, 0.32, 0);
    mesh(body, [P(sph(0.2, 14, 10), W, 0, 0, 0, 0, 0, 0, 0.8, 0.78, 1.5), P(sph(0.15, 12, 8), W, 0, 0.04, 0.2, 0, 0, 0, 0.85, 0.95, 1)]);
    const head = this.head = group(body, 0, 0.14, 0.3);
    mesh(head, [
      P(sph(0.12, 14, 10), W, 0, 0.02, 0, 0, 0, 0, 1, 0.9, 1),
      P(new THREE.ConeGeometry(0.07, 0.16, 10), W, 0, -0.01, 0.13, Math.PI / 2),
      P(sph(0.018, 6, 4), D, 0, -0.01, 0.215),
      P(new THREE.ConeGeometry(0.05, 0.13, 6), W, 0.065, 0.13, -0.01, 0, 0, -0.25),
      P(new THREE.ConeGeometry(0.05, 0.13, 6), W, -0.065, 0.13, -0.01, 0, 0, 0.25),
      P(new THREE.ConeGeometry(0.028, 0.07, 6), P2, 0.065, 0.12, 0.005, 0, 0, -0.25),
      P(new THREE.ConeGeometry(0.028, 0.07, 6), P2, -0.065, 0.12, 0.005, 0, 0, 0.25),
      P(sph(0.017, 6, 4), D, 0.045, 0.04, 0.09, 0, 0, 0, 1.2, 0.8, 0.6),
      P(sph(0.017, 6, 4), D, -0.045, 0.04, 0.09, 0, 0, 0, 1.2, 0.8, 0.6),
    ]);
    this.legs = [];
    for (const [x, z] of [[0.08, 0.2], [-0.08, 0.2], [0.08, -0.2], [-0.08, -0.2]]) {
      const l = group(body, x, -0.08, z);
      mesh(l, [P(cyl(0.032, 0.025, 0.26, 6), G, 0, -0.13, 0), P(sph(0.03, 6, 4), G, 0, -0.26, 0.015)]);
      this.legs.push(l);
    }
    // 尾巴：多节蓬松，末端微蓝灵光
    this.tail = [];
    let parent = group(body, 0, 0.05, -0.28);
    for (let i = 0; i < 5; i++) {
      const seg = group(parent, 0, 0, i === 0 ? 0 : -0.12);
      const r = 0.07 + Math.sin((i / 4) * Math.PI) * 0.06;
      mesh(seg, [P(sph(r, 10, 8), i === 4 ? 0xeaf6f8 : W, 0, 0, -0.06, 0, 0, 0, 1, 1, 1.3)]);
      this.tail.push(seg);
      parent = seg;
    }
    const glowM = new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.35, depthWrite: false });
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), glowM);
    this.glow.position.z = -0.08;
    this.tail[4].add(this.glow);
    this.t = 0;
    this.state = 'hidden';
    this.speed = 0;
    this.target = null;
    root.visible = false;
  }
  place(x, y, z, ry = 0) { this.root.position.set(x, y, z); this.root.rotation.y = ry; }
  // 行至目标点（地面高度由回调给出）
  walkTo(x, z, speed = 2.2, done = null) { this.target = { x, z, done }; this.speed = speed; this.state = 'walk'; }
  update(dt, groundAt) {
    if (!this.root.visible) return;
    this.t += dt;
    const t = this.t;
    let moving = false;
    if (this.state === 'walk' && this.target) {
      const dx = this.target.x - this.root.position.x, dz = this.target.z - this.root.position.z, d = Math.hypot(dx, dz);
      if (d < 0.15) { const cb = this.target.done; this.target = null; this.state = 'idle'; cb && cb(); }
      else {
        const st = Math.min(d, this.speed * dt);
        this.root.position.x += (dx / d) * st; this.root.position.z += (dz / d) * st;
        this.root.rotation.y = lerpAngle(this.root.rotation.y, Math.atan2(dx, dz), damp(8, dt));
        moving = true;
      }
    }
    if (groundAt) this.root.position.y = lerp(this.root.position.y, groundAt(this.root.position.x, this.root.position.z), damp(12, dt));
    const f = moving ? this.speed * 3.2 : 0;
    this.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(t * f + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : lerp(l.rotation.x, 0, 0.1); });
    const sitting = this.state === 'sit';
    this.body.position.y = lerp(this.body.position.y, sitting ? 0.26 : 0.32 + (moving ? Math.abs(Math.sin(t * f)) * 0.03 : 0), 0.15);
    this.body.rotation.x = lerp(this.body.rotation.x, sitting ? -0.45 : 0, 0.1);
    this.head.rotation.x = lerp(this.head.rotation.x, sitting ? 0.35 : Math.sin(t * 0.7) * 0.08, 0.1);
    this.head.rotation.y = moving ? 0 : Math.sin(t * 0.5) * 0.5;
    this.tail.forEach((s, i) => { s.rotation.y = Math.sin(t * 2.2 - i * 0.6) * (0.18 + i * 0.05); s.rotation.x = 0.2 + (sitting ? 0.15 : 0); });
    this.glow.material.opacity = 0.25 + Math.sin(t * 2.5) * 0.12;
  }
}
