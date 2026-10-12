// 第二十一轮：九霄凤焰的特效——地面火带与凤焰印的贴地火面、火焰粒子、撞击爆焰、凤焰弹反的金红冲击环、飞行尾焰、治疗的青光、护战的凤焰弹与吐息。
// 火带与印记：逻辑区域（game/phoenix.js 的 FireField，伤害与治疗只按它算）与渲染分开——
//   渲染单元（每段火带 / 每枚印记一个）放在一张预先建好的贴地网格里（一次绘制），高度在生成时按真实地面逐点采样（贴合坡面、台阶），
//   出生与到期时刻写进顶点，淡入、燃烧、熄灭全在着色器里按时间算；同时活跃的单元超过上限时把同一条火带里相邻的两段合成一个单元，
//   并按单元数降低火苗粒子的密度——逻辑区域一个不删，作用范围、生成与到期时刻都不变。
// 粒子借用 world/vfx.js（Kenney 粒子贴图集）的两个实例化池（加色、普通混合）；颜色取 PHOENIX.colors
// 第二十二轮：舞刀起手——剑身上一层金红细焰（castBlade，叠在原有的刀光拖尾上，不盖住剑的材质）、向刀身汇聚的羽状灵焰（castGather：
//   顺着速度拉长的火苗，从四周飞向刀身）、凤凰显形的一点灵光（materialize）、取消时散去的余烬（castFade）、剑尖离刀的爆焰与一圈朝前的焰环（launch）
import * as THREE from 'three';
import { PHOENIX } from './combatConfig.js';

const C = PHOENIX.colors;
const R = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const ACROSS = 5, ALONG = 3;                // 火带单元的网格：沿长 3 个截面 × 横 5 点
const BAND_V = ACROSS * ALONG, BAND_T = (ACROSS - 1) * (ALONG - 1) * 2;
const SEAL_SEG = 28, SEAL_RINGS = 4, SEAL_V = 1 + SEAL_SEG * SEAL_RINGS, SEAL_T = SEAL_SEG + SEAL_SEG * (SEAL_RINGS - 1) * 2;

// 贴地火面的着色器：aInfo = (出生, 到期, 种类 0 火带 / 1 印记, 随机)；aUv = (沿长 0…1, 横 −1…1) / 印记为 (半径 0…1, 角度)
const FIRE_VS = /* glsl */`
  attribute vec4 aInfo; attribute vec2 aUv;
  uniform float uTime;
  varying vec4 vInfo; varying vec2 vUv; varying vec3 vW;
  void main() {
    vInfo = aInfo; vUv = aUv;
    vec4 w = modelMatrix * vec4(position, 1.);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
    if (uTime < aInfo.x - 0.01 || uTime > aInfo.y + 0.6) gl_Position = vec4(2., 2., 2., 1.);
  }`;
const FIRE_FS = /* glsl */`
  uniform float uTime; uniform vec3 uRed, uGold, uEdge, uTail;
  varying vec4 vInfo; varying vec2 vUv; varying vec3 vW;
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    float born = vInfo.x, die = vInfo.y, age = uTime - born, left = die - uTime;
    float fadeIn = smoothstep(0., .25, age), fadeOut = smoothstep(-.6, 1.6, left);
    float edge;
    if (vInfo.z < .5) edge = 1. - smoothstep(.55, 1., abs(vUv.y));                       // 火带：横向中间旺、两边淡
    else edge = smoothstep(1.02, .86, vUv.x) * (.55 + .45 * smoothstep(.55, .95, vUv.x)); // 印记：外圈一道火环，里面淡一些
    vec2 q = vW.xz * .9 + vec2(0., -uTime * .9);
    float f = n2(q) * .6 + n2(q * 2.3 + 7.1) * .4;
    float flick = .75 + .25 * sin(uTime * 9. + vInfo.w * 40. + vW.x * 2.);
    float a = edge * fadeIn * fadeOut * (.35 + .65 * f) * flick;
    if (a < .02) discard;
    vec3 col = mix(uRed, uGold, smoothstep(.35, .8, f * edge));
    col = mix(col, uEdge, smoothstep(.75, .98, f * edge) * .6);
    col = mix(uTail * .6, col, fadeOut);                                                    // 将熄时转暗红
    gl_FragColor = vec4(col * (1.15 + .6 * f), a * .78);
  }`;

class GroundFire {
  constructor(scene, cap, perV, perT, buildIndex) {
    this.cap = cap; this.perV = perV; this.perT = perT;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * perV * 3);
    this.info = new Float32Array(cap * perV * 4);
    this.uv = new Float32Array(cap * perV * 2);
    for (let i = 0; i < cap * perV; i++) { this.info[i * 4] = 1e9; this.info[i * 4 + 1] = -1e9; }        // 空单元：永不显示
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aInfo', new THREE.BufferAttribute(this.info, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aUv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    const idx = new Uint32Array(cap * perT * 3);
    for (let u = 0; u < cap; u++) buildIndex(idx, u * perT * 3, u * perV);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geo = g;
    this.U = { uTime: { value: 0 }, uRed: { value: new THREE.Color(C.red) }, uGold: { value: new THREE.Color(C.gold) }, uEdge: { value: new THREE.Color(C.edge) }, uTail: { value: new THREE.Color(C.tail) } };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: FIRE_VS, fragmentShader: FIRE_FS, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;            // 敌人的预警圈（renderOrder 5）画在火面之上，招式照样看得清
    scene.add(this.mesh);
    this.free = []; for (let i = cap - 1; i >= 0; i--) this.free.push(i);
    this.used = new Map();        // 单元号 → { die }
    this.dirty = false;
  }
  alloc() { return this.free.length ? this.free.pop() : -1; }
  release(u) { if (!this.used.has(u)) return; this.used.delete(u); this.free.push(u); for (let i = 0; i < this.perV; i++) { this.info[(u * this.perV + i) * 4] = 1e9; this.info[(u * this.perV + i) * 4 + 1] = -1e9; } this.dirty = true; }
  flush() { if (!this.dirty) return; for (const k of ['position', 'aInfo', 'aUv']) this.geo.attributes[k].needsUpdate = true; this.dirty = false; }
  get active() { return this.used.size; }
  moveTo(scene) { scene.add(this.mesh); }
}

export class PhoenixFx {
  // vfx：world/vfx.js；ground(x, z, y) → 该点的真实地面高度（采样贴地网格用）；quality 0.5…1（粒子数）
  constructor(scene, vfx, { quality = 1, flash = null } = {}) {
    this.scene = scene; this.V = vfx; this.q = quality; this.flash = flash;
    const cap = PHOENIX.fire.maxUnits;
    this.bands = new GroundFire(scene, cap, BAND_V, BAND_T, (idx, o, v0) => {
      let k = o;
      for (let j = 0; j < ALONG - 1; j++) for (let i = 0; i < ACROSS - 1; i++) {
        const a = v0 + j * ACROSS + i, b = a + 1, c = a + ACROSS, d = c + 1;
        idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    });
    this.seals = new GroundFire(scene, 24, SEAL_V, SEAL_T, (idx, o, v0) => {
      let k = o;
      for (let s = 0; s < SEAL_SEG; s++) { idx[k++] = v0; idx[k++] = v0 + 1 + s; idx[k++] = v0 + 1 + ((s + 1) % SEAL_SEG); }
      for (let r = 0; r < SEAL_RINGS - 1; r++) for (let s = 0; s < SEAL_SEG; s++) {
        const a = v0 + 1 + r * SEAL_SEG + s, b = v0 + 1 + r * SEAL_SEG + ((s + 1) % SEAL_SEG), c = a + SEAL_SEG, d = b + SEAL_SEG;
        idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    });
    this.units = new Map();       // 单元号 → { segs: [逻辑段], born, die, strip, a, b }
    this.stripTail = new Map();   // 火带 id → 最后一个单元号（合并时找相邻的段）
    this.merges = 0;
    this.flameAcc = 0;
    this.stat = { maxUnits: 0, merged: 0, flames: 0 };
    this.now = 0;
  }
  moveTo(scene) { this.scene = scene; this.bands.moveTo(scene); this.seals.moveTo(scene); }

  // ---------- 火带单元 ----------
  // seg：{ a, b（地面点）, ya, yb, width, born, die, strip, id }；ground(x, z, y)：采样真实地面
  addBand(seg, ground) {
    let u = this.bands.alloc();
    if (u < 0) { u = this.mergeOne(ground); if (u < 0) return -1; }
    this.writeBand(u, [seg], ground);
    const rec = { segs: [seg], born: seg.born, die: seg.die, strip: seg.strip };
    this.units.set(u, rec);
    this.bands.used.set(u, rec);
    this.stripTail.set(seg.strip, u);
    this.stat.maxUnits = Math.max(this.stat.maxUnits, this.bands.active);
    return u;
  }
  // 写一个单元：segs 首尾相接的几段（合并后的单元覆盖两段），沿长 3 个截面、每个截面横向 5 点，各点按真实地面取高度
  writeBand(u, segs, ground) {
    const B = this.bands, V = BAND_V, base = u * V;
    const a = segs[0].a, b = segs[segs.length - 1].b, mid = segs.length > 1 ? segs[0].b : _w.copy(a).lerp(b, 0.5);
    const width = segs[0].width, born = Math.min(...segs.map((s) => s.born)), die = Math.max(...segs.map((s) => s.die));
    const pts = [a, mid.clone ? mid.clone() : mid, b];
    const dir = _v.subVectors(b, a); dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
    dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const seed = Math.random();
    for (let j = 0; j < ALONG; j++) {
      const p = pts[j];
      for (let i = 0; i < ACROSS; i++) {
        const t = (i / (ACROSS - 1)) * 2 - 1, x = p.x + side.x * t * width * 0.5, z = p.z + side.z * t * width * 0.5;
        const g = ground(x, z, p.y + 1.2);
        const y = (Number.isFinite(g) && Math.abs(g - p.y) < 1.4 ? g : p.y) + 0.06;
        const k = base + j * ACROSS + i;
        B.pos[k * 3] = x; B.pos[k * 3 + 1] = y; B.pos[k * 3 + 2] = z;
        B.uv[k * 2] = j / (ALONG - 1); B.uv[k * 2 + 1] = t;
        B.info[k * 4] = born; B.info[k * 4 + 1] = die; B.info[k * 4 + 2] = 0; B.info[k * 4 + 3] = seed;
      }
    }
    B.dirty = true;
  }
  // 单元满了：把同一条火带里相邻的两段合成一个单元（最早的那一对），腾出一个
  mergeOne(ground) {
    let best = null;
    for (const [u, rec] of this.units) {
      if (rec.segs.length > 1) continue;
      for (const [u2, r2] of this.units) {
        if (u2 === u || r2.strip !== rec.strip || r2.segs.length > 1) continue;
        if (r2.segs[0].a.distanceToSquared(rec.segs[0].b) < 0.01 && (!best || rec.born < best.born)) best = { u, u2, born: rec.born };
      }
    }
    if (!best) return -1;
    const A = this.units.get(best.u), Bq = this.units.get(best.u2);
    A.segs = [A.segs[0], Bq.segs[0]]; A.die = Math.max(A.die, Bq.die); A.born = Math.min(A.born, Bq.born);
    this.writeBand(best.u, A.segs, ground);
    this.units.delete(best.u2);
    this.bands.release(best.u2);
    if (this.stripTail.get(A.strip) === best.u2) this.stripTail.set(A.strip, best.u);
    this.merges++; this.stat.merged++;
    return this.bands.alloc();
  }
  // ---------- 凤焰印 ----------
  addSeal(seal, ground) {
    const S = this.seals;
    const u = S.alloc();
    if (u < 0) return -1;
    const base = u * SEAL_V, c = seal.c, r = seal.r, seed = Math.random();
    const put = (k, x, z, rr, ang) => {
      const g = ground(x, z, c.y + 1.2);
      const y = (Number.isFinite(g) && Math.abs(g - c.y) < 1.6 ? g : c.y) + 0.07;
      S.pos[k * 3] = x; S.pos[k * 3 + 1] = y; S.pos[k * 3 + 2] = z;
      S.uv[k * 2] = rr; S.uv[k * 2 + 1] = ang;
      S.info[k * 4] = seal.born; S.info[k * 4 + 1] = seal.die; S.info[k * 4 + 2] = 1; S.info[k * 4 + 3] = seed;
    };
    put(base, c.x, c.z, 0, 0);
    for (let ring = 0; ring < SEAL_RINGS; ring++) {
      const rr = (ring + 1) / SEAL_RINGS;
      for (let s = 0; s < SEAL_SEG; s++) { const a = (s / SEAL_SEG) * Math.PI * 2; put(base + 1 + ring * SEAL_SEG + s, c.x + Math.cos(a) * r * rr, c.z + Math.sin(a) * r * rr, rr, a); }
    }
    S.used.set(u, { die: seal.die });
    S.dirty = true;
    // 印心的凤纹（金色、缓转，贴地）
    this.V.spawn({ p: new THREE.Vector3(c.x, c.y + 0.12, c.z), tile: 'magic7', mode: 3, size: r * 1.7, life: seal.die - seal.born, color: C.gold, alpha: 0.5, spin: 0.25, rot: R(0, 6.28), fadeIn: 0.05 });
    this.V.spawn({ p: new THREE.Vector3(c.x, c.y + 0.14, c.z), tile: 'ringWide', mode: 3, size: r * 2.1, life: 0.6, color: C.core, alpha: 0.8, fadeIn: 0.02 });
    return u;
  }

  // 每帧：到期的单元回收；火苗按单元数分配（超过预算时降低密度）
  update(dt, now) {
    this.now = now;
    this.bands.U.uTime.value = now; this.seals.U.uTime.value = now;
    for (const [u, rec] of this.units) if (now > rec.die + 0.7) { this.units.delete(u); this.bands.release(u); }
    for (const [u, rec] of this.seals.used) if (now > rec.die + 0.7) this.seals.release(u);
    this.bands.flush(); this.seals.flush();
    // 没有火的时候两块网格都不画（池子是固定大小的动态网格，空着也会提交绘制）
    this.bands.mesh.visible = this.bands.active > 0; this.seals.mesh.visible = this.seals.active > 0;
    // 火苗：总预算每秒 rate 个，平分到活跃单元上（单元多时每段的火苗就稀）
    const n = this.units.size;
    if (n) {
      const rate = 150 * this.q;
      this.flameAcc += dt * rate;
      const list = [...this.units.values()];
      while (this.flameAcc >= 1) {
        this.flameAcc -= 1;
        const rec = list[(Math.random() * list.length) | 0];
        if (now < rec.born || now > rec.die) continue;
        const s = rec.segs[(Math.random() * rec.segs.length) | 0], t = Math.random(), off = (Math.random() * 2 - 1) * s.width * 0.42;
        const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, l = Math.hypot(dx, dz) || 1;
        const p = new THREE.Vector3(s.a.x + dx * t - (dz / l) * off, s.a.y + (s.b.y - s.a.y) * t + 0.1, s.a.z + dz * t + (dx / l) * off);
        this.flame(p, rec.die - now);
        this.stat.flames++;
      }
    }
  }
  flame(p, left) {
    const k = Math.min(1, left / 2);
    this.V.spawn({ p, v: new THREE.Vector3(R(-0.2, 0.2), R(1.0, 2.2), R(-0.2, 0.2)), tile: Math.random() < 0.5 ? 'flame' : 'flame2', size: [R(0.5, 0.9) * k + 0.2, 0.1], life: R(0.45, 0.8),
      color: Math.random() < 0.6 ? C.gold : C.red, alpha: 0.75, rot: R(-0.3, 0.3), drag: 1.2, fadeIn: 0.1 });
    if (Math.random() < 0.18) this.V.spawn({ p: p.clone(), v: new THREE.Vector3(R(-0.6, 0.6), R(1.5, 3.2), R(-0.6, 0.6)), tile: 'sparkBall', size: 0.08, life: R(0.6, 1.1), color: C.edge, alpha: 0.9, gravity: -0.4, drag: 0.6 });
  }
  activeUnits() { return this.bands.active + this.seals.active; }
  clear() {
    for (const u of [...this.units.keys()]) this.bands.release(u);
    this.units.clear(); this.stripTail.clear();
    for (const u of [...this.seals.used.keys()]) this.seals.release(u);
    this.bands.flush(); this.seals.flush();
  }

  // ---------- 一次性的效果 ----------
  // 飞行中的尾焰与翼尖火星（每帧调用；k 强度）
  trail(rig, dir, k = 1) {
    const V = this.V, tail = rig.bonePos('B_Tail_4', _v).clone(), t2 = rig.bonePos('B_Tail_1', _w).clone();
    const back = dir.clone().multiplyScalar(-1);
    for (const p of [tail, t2]) {
      V.spawn({ p: p.clone().add(new THREE.Vector3(R(-0.2, 0.2), R(-0.2, 0.2), R(-0.2, 0.2))), v: back.clone().multiplyScalar(R(2, 4)).add(new THREE.Vector3(0, R(0.3, 1), 0)), tile: 'flame', size: [R(0.8, 1.3) * k, 0.2], life: R(0.3, 0.55),
        color: Math.random() < 0.5 ? C.tail : C.gold, alpha: 0.8, rot: R(-1, 1), drag: 1.5 });
    }
    for (const n of ['B_Left_Wing_8', 'B_Right_Wing_8']) if (Math.random() < 0.6) V.spawn({ p: rig.bonePos(n, _v).clone(), v: back.clone().multiplyScalar(R(1, 2.5)), tile: 'sparkBall', size: 0.1 * k, life: R(0.3, 0.6), color: C.edge, alpha: 0.9, drag: 0.8 });
    if (Math.random() < 0.5) V.spawn({ p: rig.root.position.clone(), tile: 'glow', size: 3.2 * k, life: 0.12, color: C.gold, alpha: 0.35 });
  }
  // ---------- 第二十二轮：舞刀起手 ----------
  // 剑身上的金红细焰：沿剑身（护手上沿 → 剑尖）随机几点小火苗、剑尖一点辉光；k 强度（起势渐亮、最后一刀最亮）
  castBlade(tip, base, k = 1) {
    const V = this.V, n = Math.random() < 0.5 * k ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const u = 0.15 + 0.85 * Math.random(), p = _v.lerpVectors(base, tip, u).clone();
      V.spawn({ p, v: new THREE.Vector3(R(-0.15, 0.15), R(0.3, 0.9), R(-0.15, 0.15)), tile: Math.random() < 0.5 ? 'flame' : 'flame2', size: [R(0.12, 0.2) * (0.6 + 0.4 * k), 0.03], life: R(0.14, 0.24),
        color: Math.random() < 0.55 ? C.gold : C.red, alpha: 0.85 * Math.min(1, k), rot: R(-0.4, 0.4), drag: 2 });
    }
    if (Math.random() < 0.45 * k) V.spawn({ p: tip.clone(), tile: 'glow', size: 0.42 * k, life: 0.08, color: C.edge, alpha: 0.55 });
  }
  // 羽状灵焰向刀身汇聚：四周 0.9–1.9 米处生出、顺着速度拉长的火苗，按寿命正好飞到刀身上某一点；k 强度
  castGather(tip, base, feet, dt, k = 1) {
    const V = this.V;
    this.gatherAcc = (this.gatherAcc || 0) + dt * 70 * this.q * k;
    while (this.gatherAcc >= 1) {
      this.gatherAcc -= 1;
      const to = _v.lerpVectors(base, tip, R(0.25, 1)).clone(), life = R(0.2, 0.32);
      const a = R(0, Math.PI * 2), e = R(-0.5, 0.9), r = R(0.9, 1.9);
      const from = to.clone().add(new THREE.Vector3(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r));
      if (from.y < feet.y + 0.1) from.y = feet.y + 0.1;
      V.spawn({ p: from, v: to.sub(from).divideScalar(life), tile: Math.random() < 0.5 ? 'flame' : 'flame2', mode: 1, stretch: 0.06, size: [R(0.1, 0.16), 0.04], life,
        color: Math.random() < 0.6 ? C.gold : C.red, alpha: 0.8, fadeIn: 0.25 });
    }
  }
  // 凤凰由剑尖显形：一点灵光、几颗火星
  materialize(p, s = 0.6) {
    const V = this.V;
    V.spawn({ p, tile: 'glow', size: [0.15, 0.5 * s + 0.35], life: 0.18, color: C.core, alpha: 0.8 });
    V.spawn({ p: p.clone(), tile: 'starGlow', size: [0.15, 0.55], life: 0.14, color: C.edge, alpha: 0.75, rot: R(0, 3) });
    for (let i = 0; i < V.n(8); i++) V.spawn({ p: p.clone(), v: new THREE.Vector3(R(-1.5, 1.5), R(-0.6, 1.6), R(-1.5, 1.5)), tile: 'sparkBall', size: 0.06, life: R(0.3, 0.5), color: i % 2 ? C.edge : C.gold, alpha: 0.9, drag: 2 });
  }
  // 起手被取消：灵体散成余烬（只是画面）
  castFade(p, s = 1) {
    const V = this.V;
    for (let i = 0; i < V.n(14); i++) V.spawn({ p: p.clone().add(new THREE.Vector3(R(-0.6, 0.6) * s, R(-0.2, 0.4) * s, R(-0.6, 0.6) * s)), v: new THREE.Vector3(R(-0.6, 0.6), R(0.4, 1.4), R(-0.6, 0.6)), tile: 'sparkBall', size: R(0.05, 0.1), life: R(0.4, 0.8), color: i % 2 ? C.edge : C.gold, alpha: 0.85, gravity: -0.2, drag: 0.8 });
    V.spawn({ p, tile: 'glow', size: [1.2 * s, 0.2], life: 0.25, color: C.gold, alpha: 0.5 });
  }
  // 离刀：剑尖一团爆焰、一圈朝着飞出方向的焰环（与方向垂直）、向前喷出的火苗
  launch(p, dir, s = 1) {
    const V = this.V, d = dir.clone().normalize();
    const u = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize(), w = new THREE.Vector3().crossVectors(d, u).normalize();
    V.spawn({ p, tile: 'glow', size: [0.3, 1.9 * s], life: 0.2, color: C.core, alpha: 0.8 });
    V.spawn({ p: p.clone(), tile: 'ringWide', mode: 2, u, w, size: [0.25, 1.7 * s], life: 0.3, color: C.edge, alpha: 0.7 });
    V.spawn({ p: p.clone().addScaledVector(d, 0.4), tile: 'ring2', mode: 2, u, w, size: [0.2, 1.25 * s], life: 0.36, color: C.red, alpha: 0.65, delay: 0.04 });
    for (let i = 0; i < V.n(22); i++) {
      const v = d.clone().multiplyScalar(R(6, 13)).add(new THREE.Vector3(R(-2, 2), R(-1.2, 2), R(-2, 2)));
      V.spawn({ p: p.clone(), v, tile: i % 3 ? 'flame' : 'flame2', mode: i % 2 ? 1 : 0, stretch: 0.05, size: [R(0.35, 0.7) * s, 0.08], life: R(0.25, 0.5), color: i % 2 ? C.gold : C.red, alpha: 0.9, drag: 3, rot: R(0, 6.28) });
    }
    this.flash?.(C.gold, 0.16);
  }
  // 出场：一团火光升起
  spawnBurst(p, s = 1) {
    const V = this.V;
    V.spawn({ p, tile: 'glow', size: [1, 6 * s], life: 0.5, color: C.core, alpha: 0.9 });
    for (let i = 0; i < V.n(26); i++) V.spawn({ p: p.clone(), v: new THREE.Vector3(R(-3, 3), R(1, 5), R(-3, 3)), tile: i % 2 ? 'flame' : 'fire', size: [R(0.6, 1.2) * s, 0.1], life: R(0.4, 0.8), color: i % 3 ? C.gold : C.red, alpha: 0.85, drag: 2, rot: R(0, 6.28) });
    V.spawn({ p: p.clone(), tile: 'ringWide', mode: 0, size: [0.5, 5 * s], life: 0.45, color: C.edge, alpha: 0.7 });
  }
  // 消散：余烬四散
  dissolveBurst(p, s = 1) {
    const V = this.V;
    for (let i = 0; i < V.n(30); i++) V.spawn({ p: p.clone().add(new THREE.Vector3(R(-1.5, 1.5) * s, R(-0.6, 0.6) * s, R(-1.5, 1.5) * s)), v: new THREE.Vector3(R(-1, 1), R(0.5, 2.5), R(-1, 1)), tile: 'sparkBall', size: R(0.08, 0.18), life: R(0.8, 1.6), color: i % 2 ? C.edge : C.gold, alpha: 0.9, gravity: -0.2, drag: 0.5 });
    V.spawn({ p, tile: 'glow', size: [4 * s, 1], life: 0.6, color: C.gold, alpha: 0.5 });
  }
  // 撞击爆焰：主爆点、火环、碎焰、烟
  impact(p, burstR) {
    const V = this.V;
    V.spawn({ p, tile: 'glow', size: [2, burstR * 2.2], life: 0.35, color: C.core, alpha: 1 });
    V.spawn({ p: p.clone(), tile: 'fire', size: [2, burstR * 1.6], life: 0.5, color: C.gold, alpha: 0.95, rot: R(0, 6.28) });
    V.spawn({ p: p.clone().setY(p.y + 0.15), tile: 'ringWide', mode: 3, size: [1, burstR * 2.1], life: 0.5, color: C.edge, alpha: 0.9 });
    V.spawn({ p: p.clone().setY(p.y + 0.12), tile: 'ring2', mode: 3, size: [0.6, burstR * 1.7], life: 0.65, color: C.red, alpha: 0.8 });
    for (let i = 0; i < V.n(44); i++) {
      const a = R(0, 6.28), e = R(0.1, 1.1), sp = R(5, 14);
      V.spawn({ p: p.clone(), v: new THREE.Vector3(Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp), tile: i % 3 ? 'flame' : 'flame2', mode: i % 4 ? 0 : 1, stretch: 0.05,
        size: [R(0.7, 1.4), 0.15], life: R(0.45, 0.9), color: i % 2 ? C.gold : C.red, alpha: 0.9, drag: 2.5, gravity: 1.2 });
    }
    for (let i = 0; i < V.n(12); i++) V.spawn({ p: p.clone(), v: new THREE.Vector3(R(-2, 2), R(1, 3), R(-2, 2)), tile: 'smoke', size: [1.2, 3.2], life: R(0.9, 1.6), color: 0x3a2a24, alpha: 0.45, blend: 'alpha', drag: 1.5, rot: R(0, 6.28) });
    this.flash?.(C.gold, 0.35);
  }
  // 凤焰弹反：金红两道冲击环（贴地，半径 r），火星
  parryShock(p, r) {
    const V = this.V;
    V.spawn({ p: p.clone().setY(p.y + 0.16), tile: 'ringWide', mode: 3, size: [0.6, r * 2.05], life: 0.42, color: C.parryA, alpha: 0.95 });
    V.spawn({ p: p.clone().setY(p.y + 0.14), tile: 'ring2', mode: 3, size: [0.4, r * 1.8], life: 0.55, color: C.parryB, alpha: 0.85, delay: 0.04 });
    V.spawn({ p: p.clone().setY(p.y + 1.0), tile: 'glow', size: [1, 5], life: 0.25, color: C.parryA, alpha: 0.8 });
    for (let i = 0; i < V.n(24); i++) { const a = (i / 24) * 6.28; V.spawn({ p: p.clone().setY(p.y + 0.5), v: new THREE.Vector3(Math.cos(a) * 9, R(0.5, 2), Math.sin(a) * 9), tile: 'sparkBall', mode: 1, stretch: 0.04, size: 0.14, life: 0.4, color: i % 2 ? C.parryA : C.parryB, alpha: 1, drag: 3 }); }
  }
  // 火焰治疗：主人身上一缕青光
  heal(p) {
    this.V.spawn({ p: p.clone().add(new THREE.Vector3(R(-0.3, 0.3), R(0.3, 1.4), R(-0.3, 0.3))), v: new THREE.Vector3(0, R(0.8, 1.4), 0), tile: 'light', size: [0.35, 0.05], life: 0.7, color: C.heal, alpha: 0.85 });
    this.V.spawn({ p: p.clone().setY(p.y + 0.08), tile: 'ringSoft', mode: 3, size: [0.6, 1.6], life: 0.5, color: C.heal, alpha: 0.4 });
  }
  // 灼烧：敌人身上一点火（每跳；不震屏）
  burn(p) { this.V.spawn({ p: p.clone().add(new THREE.Vector3(R(-0.3, 0.3), R(0.2, 1.2), R(-0.3, 0.3))), v: new THREE.Vector3(0, R(0.8, 1.6), 0), tile: 'flame', size: [0.5, 0.1], life: 0.4, color: C.gold, alpha: 0.7 }); }
  // 凤焰弹：飞行中每帧一点火光（logic 给位置）
  bolt(p, dir) {
    this.V.spawn({ p: p.clone(), tile: 'glow', size: 1.2, life: 0.08, color: C.core, alpha: 0.9 });
    this.V.spawn({ p: p.clone(), v: dir.clone().multiplyScalar(-3), tile: 'flame', size: [0.8, 0.1], life: 0.25, color: C.gold, alpha: 0.85, rot: R(0, 6.28), drag: 2 });
  }
  boltHit(p) {
    const V = this.V;
    V.spawn({ p, tile: 'glow', size: [0.5, 2.6], life: 0.22, color: C.core, alpha: 0.9 });
    for (let i = 0; i < V.n(12); i++) V.spawn({ p: p.clone(), v: new THREE.Vector3(R(-4, 4), R(0, 4), R(-4, 4)), tile: 'flame', size: [0.5, 0.1], life: R(0.3, 0.5), color: i % 2 ? C.gold : C.red, alpha: 0.85, drag: 3 });
  }
  // 吐息：口部向前一锥火（每帧几颗）
  breath(mouth, dir, range, arc) {
    const V = this.V;
    for (let i = 0; i < 3; i++) {
      const a = R(-arc / 2, arc / 2), d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      d.y += R(-0.08, 0.05);
      V.spawn({ p: mouth.clone(), v: d.multiplyScalar(range / 0.55), tile: i ? 'fire' : 'flame', size: [0.5, 2.2], life: 0.55, color: i % 2 ? C.gold : C.red, alpha: 0.8, rot: R(0, 6.28), drag: 0.4 });
    }
  }
  // 掠翼突袭：沿路径一道火痕
  swoop(p, dir) {
    this.V.spawn({ p: p.clone(), v: dir.clone().multiplyScalar(-2), tile: 'trace', mode: 1, stretch: 0.15, size: 1.6, life: 0.3, color: C.gold, alpha: 0.85 });
  }
  // 护战的凤凰被打中
  hurt(p) { this.V.spawn({ p, tile: 'starSharp', size: [0.4, 1.8], life: 0.18, color: C.edge, alpha: 0.9, rot: R(0, 6.28) }); }
}
