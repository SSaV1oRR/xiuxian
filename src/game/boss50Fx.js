// 第十六轮：镇塔龙君的三维特效与地面预警（世界空间，画法分两类）：
//   · 网格特效：地面预警（圆、扇 / 环扇、矩形路径、环带；边线就是判定边界）、龙焰锥、焰柱、落雷（自天而降的分叉电光）、冲击环（地面环带 + 竖起的光墙）、
//     灵弹、碎石（实例化，带重力与弹跳）、奖励灵珠；
//   · 粒子（world/vfx.js 的实例化粒子池）：爪光与弧形斩光、命中火花、扬尘、焦痕、符阵（贴地旋转）、汇聚的蓄力光、余烬、失衡的星芒……
// 爪、尾的拖尾用 vfx.js 的 Trail（剑光同款，换紫色）。点光源只用一个固定的小池（4 盏，按需亮灭），场景里灯的数量不变，不会触发着色器重编译。
// 震屏、闪光统一经 Boss50Fx.shake / flash，乘设置里的强度（qinglan.fxk：0 关、0.5 弱、1 标准）。
import * as THREE from 'three';
import { Trail } from '../world/vfx.js';

export const C50 = { p1: 0x7c68e8, p2: 0xb65cff, core: 0xeee5ff, gold: 0xb88a46, warn: 0xffb347, warnFill: 0xd9822b, danger: 0xff3a2e, dangerFill: 0xc0180f, ice: 0xbfe6ff };
const R = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// ---------- 地面预警 ----------
// shape：0 圆（r）；1 扇 / 环扇（r0..r，张角 arc，朝本地 +y）；2 矩形路径（自锚点沿 +y 长 len、宽 w）；3 环带（r0..r 一整圈）
const TELE_VS = 'varying vec2 vL; void main(){ vL = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const TELE_FS = /* glsl */`
  uniform float uShape, uR, uR0, uArc, uLen, uW, uP, uA, uT, uHit, uSweep, uFillK;
  uniform vec3 uCol, uFill;
  varying vec2 vL;
  float band(float x, float w){ return 1. - smoothstep(w * .5, w * .5 + .04, abs(x)); }
  void main(){
    vec2 p = vL;
    float d = length(p), ew = .16, inside = 0., edge = 0., front = 0., prog = 0.;
    if (uShape < .5) {
      inside = 1. - smoothstep(uR - .03, uR + .03, d);
      edge = band(d - (uR - ew * .5), ew) * step(d, uR + .05);
      prog = d / max(uR, .01);
    } else if (uShape < 1.5 || uShape > 2.5) {
      float hA = uShape > 2.5 ? 3.1416 : uArc * .5;
      float a = atan(p.x, p.y), aa = abs(a);
      float inA = uShape > 2.5 ? 1. : 1. - smoothstep(hA - .004, hA + .004, aa);
      float inR = smoothstep(uR0 - .03, uR0 + .03, d) * (1. - smoothstep(uR - .03, uR + .03, d));
      inside = inA * inR;
      edge = band(d - (uR - ew * .5), ew) * inA * step(uR0 - .05, d);
      if (uR0 > .05) edge = max(edge, band(d - (uR0 + ew * .5), ew) * inA * step(d, uR + .05));
      if (uShape < 1.5) {
        // 两条边线（到边界射线的距离）
        float s = sin(hA), c = cos(hA);
        float dl = abs(c * abs(p.x) - s * p.y);
        float along = s * abs(p.x) + c * p.y;
        edge = max(edge, band(dl - ew * .5, ew) * step(uR0 - .05, along) * step(along, uR + .02) * step(aa, hA + .05));
      }
      // 扫掠：sweep 表示已经扫过的角度比例（爪 / 尾的出手方向，自 -hA 起）
      prog = uSweep > .5 ? (a + hA) / (2. * hA) : uSweep < -.5 ? (hA - a) / (2. * hA) : (d - uR0) / max(uR - uR0, .01);
    } else {
      float hw = uW * .5;
      inside = step(abs(p.x), hw) * smoothstep(-.03, .03, p.y) * (1. - smoothstep(uLen - .03, uLen + .03, p.y));
      edge = (band(abs(p.x) - (hw - ew * .5), ew) * step(0., p.y) * step(p.y, uLen) + band(p.y - (uLen - ew * .5), ew) * step(abs(p.x), hw)) ;
      prog = p.y / max(uLen, .01);
    }
    edge = clamp(edge, 0., 1.);
    float fill = inside * step(prog, uP);
    front = inside * (1. - smoothstep(0., .05, abs(prog - uP))) * step(.01, uP) * step(uP, .995);
    float pulse = 1. + .45 * step(.8, uP) * (.5 + .5 * sin(uT * 32.));
    vec3 col = mix(uFill, uCol, clamp(edge + front, 0., 1.));
    float a = (edge * .95 + (fill * .3 + inside * .08) * uFillK + front * .6) * uA * pulse;
    a = max(a, inside * uHit * .65);
    gl_FragColor = vec4(col * (1. + uHit * 1.5), clamp(a, 0., 1.));
  }`;

export class Tele {
  // o：{ shape, pos, yaw, r, r0, arc, len, w, danger（不可格挡：红）, dur（填满的秒数）, sweep（扫掠填充：1 自龙的左侧起、-1 自右侧起）}
  // 本地 +y 为朝向、+x 为龙的右手边（扇形角度向右为正）
  constructor(fx, o) {
    this.fx = fx;
    const shape = { circle: 0, sector: 1, rect: 2, ring: 3 }[o.shape] ?? 0;
    const size = shape === 2 ? Math.max(o.len, o.w) * 2 + 1 : (o.r + 0.6) * 2;
    const geo = new THREE.PlaneGeometry(size, size);
    const col = new THREE.Color(o.danger ? C50.danger : C50.warn), fillC = new THREE.Color(o.danger ? C50.dangerFill : C50.warnFill);
    this.U = {
      uShape: { value: shape }, uR: { value: o.r ?? 1 }, uR0: { value: o.r0 ?? 0 }, uArc: { value: o.arc ?? Math.PI }, uLen: { value: o.len ?? 1 }, uW: { value: o.w ?? 1 },
      uP: { value: 0 }, uA: { value: 0 }, uT: { value: 0 }, uHit: { value: 0 }, uSweep: { value: o.sweep || 0 }, uCol: { value: col }, uFill: { value: fillC }, uFillK: { value: o.fillK ?? (shape === 3 ? 0.35 : 1) },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: TELE_VS, fragmentShader: TELE_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const m = this.mesh = new THREE.Mesh(geo, mat);
    m.renderOrder = 5; m.frustumCulled = false;
    this.place(o.pos, o.yaw ?? 0);
    fx.scene.add(m);
    this.dur = o.dur ?? 1; this.t = 0; this.alive = true; this.hitT = 0; this.fadeOut = 0; this.follow = o.follow || null;
    fx.teles.add(this);
  }
  place(pos, yaw = this.yaw) {
    this.yaw = yaw;
    this.mesh.position.set(pos.x, (pos.y ?? 0) + 0.035, pos.z);
    this.mesh.rotation.set(-Math.PI / 2, yaw + Math.PI, 0, 'YXZ');
  }
  set(k, v) { this.U[k].value = v; }
  hit() { this.hitT = 0.22; this.U.uP.value = 1; }
  remove(fade = 0.18) { if (this.fadeOut === 0) this.fadeOut = fade; }
  update(dt) {
    this.t += dt;
    const U = this.U;
    U.uT.value += dt;
    if (this.follow) this.follow(this);
    if (this.fadeOut > 0) {
      this.fadeLeft = (this.fadeLeft ?? this.fadeOut) - dt;
      U.uA.value = Math.max(0, this.fadeLeft / this.fadeOut);
      if (this.fadeLeft <= 0) { this.dispose(); return false; }
    } else {
      U.uA.value = Math.min(1, this.t / 0.12);
      U.uP.value = Math.min(1, this.t / Math.max(0.01, this.dur));
    }
    if (this.hitT > 0) { this.hitT -= dt; U.uHit.value = Math.max(0, this.hitT / 0.22); if (this.hitT <= 0 && this.fadeOut === 0) this.remove(0.2); }
    return true;
  }
  dispose() { this.alive = false; this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.fx.teles.delete(this); }
}

// ---------- 龙焰（锥）、焰柱、冲击环、落雷、灵弹的着色器 ----------
const NOISE2 = /* glsl */`
  float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h2(i), h2(i + vec2(1., 0.)), f.x), mix(h2(i + vec2(0., 1.)), h2(i + vec2(1., 1.)), f.x), f.y); }
  float fbm(vec2 p){ return n2(p) * .55 + n2(p * 2.1 + 3.1) * .3 + n2(p * 4.3 + 7.7) * .15; }`;
const FLAME_VS = 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }';
function flameMat({ col, core, k = 1, scroll = 3.5, cone = false }) {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, uCol: { value: new THREE.Color(col) }, uCore: { value: new THREE.Color(core) }, uK: { value: k }, uLen: { value: 1 } },
    vertexShader: FLAME_VS,
    fragmentShader: `${NOISE2}
      uniform float uT, uA, uK, uLen; uniform vec3 uCol, uCore; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float y = vUv.y;
        ${cone ? 'float along = y; if (along > uLen) discard;' : 'float along = y;'}
        float n = fbm(vec2(vUv.x * 9., along * 3.2 - uT * ${scroll.toFixed(2)}));
        float n2v = fbm(vec2(vUv.x * 17. + 4., along * 6. - uT * ${(scroll * 1.6).toFixed(2)}));
        float body = smoothstep(.38, .92, n * .7 + n2v * .45);
        ${cone ? 'float fade = smoothstep(0., .08, along) * (1. - smoothstep(uLen * .7, uLen, along));' : 'float fade = (1. - smoothstep(.55, 1., along)) * smoothstep(0., .06, along);'}
        float a = body * fade * pow(facing, .9) * uA * uK;
        vec3 c = mix(uCol, uCore, smoothstep(.55, .95, body) * (1. - along * .6));
        gl_FragColor = vec4(c * a, 1.);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
const BAND_FS = /* glsl */`
  ${NOISE2}
  uniform float uR, uW, uA, uT; uniform vec3 uCol, uCore; varying vec2 vL;
  void main(){
    float d = length(vL), x = (d - uR) / max(uW, .01);
    float b = exp(-x * x * 5.) ;
    float n = .75 + .25 * n2(vec2(atan(vL.y, vL.x) * 8., d * 2. - uT * 6.));
    gl_FragColor = vec4(mix(uCol, uCore, b * .6) * b * n * uA * 1.6, 1.);
  }`;
const WALL_FS = /* glsl */`
  ${NOISE2}
  uniform float uA, uT; uniform vec3 uCol, uCore; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){
    float y = vUv.y, n = .65 + .35 * n2(vec2(vUv.x * 40., y * 3. - uT * 5.));
    float a = pow(1. - y, 1.8) * n * uA;
    gl_FragColor = vec4(mix(uCol, uCore, (1. - y) * .5) * a * 1.4, 1.);
  }`;
const BOLT_FS = 'uniform vec3 uCol, uCore; uniform float uA; varying vec2 vUv; void main(){ float x = abs(vUv.x - .5) * 2.; float core = exp(-x * x * 18.), glow = exp(-x * x * 3.); gl_FragColor = vec4((uCore * core * 2.2 + uCol * glow * .9) * uA, 1.); }';

// ---------- 落雷：自天而降的分叉电光（交叉的两片带子）----------
function boltGeometry(top, bottom, { jag = 1.6, width = 0.55, branches = 3 } = {}) {
  const pts = [top.clone(), bottom.clone()];
  // 中点位移：越往下越细碎
  for (let it = 0; it < 6; it++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], m = a.clone().lerp(b, 0.5), l = a.distanceTo(b);
      m.x += (Math.random() - 0.5) * l * 0.32 * (jag / 1.6); m.z += (Math.random() - 0.5) * l * 0.32 * (jag / 1.6); m.y += (Math.random() - 0.5) * l * 0.08;
      out.push(m, b);
    }
    pts.splice(0, pts.length, ...out);
  }
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1], width * (0.65 + 0.35 * (i / pts.length))]);
  // 分叉
  for (let k = 0; k < branches; k++) {
    let p = pts[Math.floor(R(0.2, 0.75) * pts.length)].clone();
    const dir = new THREE.Vector3(R(-1, 1), R(-1.6, -0.6), R(-1, 1)).normalize();
    const n = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const q = p.clone().addScaledVector(dir, R(0.6, 1.6)); q.x += R(-0.4, 0.4); q.z += R(-0.4, 0.4);
      if (q.y < 0.1) break;
      segs.push([p, q, width * 0.45 * (1 - i / n)]);
      p = q;
    }
  }
  const pos = [], uv = [], idx = [];
  let v = 0;
  for (const [a, b, w] of segs) {
    for (const side of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)]) {
      const d = b.clone().sub(a).normalize(), s = side.clone().addScaledVector(d, -side.dot(d)).normalize().multiplyScalar(w / 2);
      pos.push(a.x - s.x, a.y - s.y, a.z - s.z, a.x + s.x, a.y + s.y, a.z + s.z, b.x - s.x, b.y - s.y, b.z - s.z, b.x + s.x, b.y + s.y, b.z + s.z);
      uv.push(0, 0, 1, 0, 0, 1, 1, 1);
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      v += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class Boss50Fx {
  constructor(vfx, scene, { quality = 1 } = {}) {
    this.V = vfx; this.scene = scene; this.q = quality;
    this.teles = new Set();
    this.items = [];              // 有寿命的网格特效：{ update(dt) → 是否继续, dispose() }
    this.energy = new THREE.Color(C50.p1);
    this.fxk = +(localStorage.getItem('qinglan.fxk') ?? 1);
    this.trails = {};
    for (const k of ['l', 'r', 'tail']) {
      const t = this.trails[k] = new Trail(scene, 36);
      t.span = k === 'tail' ? 0.22 : 0.16; t.color.set(C50.p1); t.core.set(C50.core); t.k = 1.2; t.on = false;
      t.mesh.name = 'boss50-trail-' + k;
    }
    // 点光源池
    this.lights = [];
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xb08cff, 0, 18, 2); l.name = 'boss50-light'; scene.add(l); this.lights.push({ l, t: 0, life: 0, k: 0, follow: null }); }
    // 碎石（实例化）
    const rg = new THREE.DodecahedronGeometry(0.2, 0);
    this.rockMesh = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ color: 0x55535b, roughness: 0.92 }), 60);
    this.rockMesh.castShadow = true; this.rockMesh.frustumCulled = false; this.rockMesh.name = 'boss50-rocks';
    this.rocks = [];
    const m0 = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < 60; i++) this.rockMesh.setMatrixAt(i, m0);
    scene.add(this.rockMesh);
    this.shakeHook = null; this.flashHook = null;
    this.t = 0;
  }
  setPhase(p2) { this.energy.set(p2 ? C50.p2 : C50.p1); for (const t of Object.values(this.trails)) t.color.copy(this.energy); }
  n(k) { return this.V.n(k); }
  shake(v) { if (this.fxk > 0.01) this.shakeHook?.(v * this.fxk); }
  flash(color, k) { if (this.fxk > 0.01) this.flashHook?.(color, k * this.fxk); }

  // ---------- 点光 ----------
  light(pos, { color = this.energy, k = 30, life = 0.25, dist = 16, follow = null } = {}) {
    const L = this.lights.reduce((a, b) => (a.k * Math.max(0, 1 - a.t / a.life) < b.k * Math.max(0, 1 - b.t / b.life) ? a : b));
    L.l.color.set(color); L.l.distance = dist; L.l.position.copy(pos); L.t = 0; L.life = life; L.k = k; L.follow = follow;
    return L;
  }

  // ---------- 预警 ----------
  tele(o) { return new Tele(this, o); }

  // ---------- 爪：蓄力（汇聚的光点）、弧形斩光 ----------
  converge(p, { color = this.energy, n = 3, r = 1.0, size = 0.16, life = 0.35 } = {}) {
    for (let i = 0; i < this.n(n); i++) {
      const d = _v.set(R(-1, 1), R(-0.6, 1), R(-1, 1)).normalize();
      const s = p.clone().addScaledVector(d, r * R(0.7, 1.1));
      this.V.spawn({ p: s, v: d.clone().multiplyScalar(-r / life * 1.05), tile: i % 2 ? 'glow' : 'trace', mode: i % 2 ? 0 : 1, stretch: 0.05, size: size * R(0.7, 1.3), life, color, alpha: 0.9, fadeIn: 0.3 });
    }
  }
  // 横向月牙斩光：origin 地面圆心，yaw 朝向，r 半径（与判定扇形同），a0→a1 扫过的角度（相对朝向，左正），y 高度
  clawArc(origin, yaw, r, a0, a1, y = 1.4, { color = this.energy, big = false } = {}) {
    const V = this.V, mid = (a0 + a1) / 2, span = Math.abs(a1 - a0);
    const dir = _u.set(Math.sin(yaw + mid), 0, Math.cos(yaw + mid));
    const side = _w.set(Math.cos(yaw + mid), 0, -Math.sin(yaw + mid));
    const c = new THREE.Vector3(origin.x, y, origin.z).addScaledVector(dir, r * 0.42);
    const sz = r * Math.max(0.9, Math.min(1.6, span / 1.6));
    V.spawn({ p: c, tile: 'slashH', mode: 2, u: side.clone(), w: dir.clone(), size: [sz * 0.8, sz * 1.15], life: 0.26, color, alpha: 1, fadeIn: 0.06, early: true });
    V.spawn({ p: c, tile: 'slashH', mode: 2, u: side.clone(), w: dir.clone(), size: [sz * 0.75, sz * 1.0], life: 0.16, color: C50.core, alpha: 0.85, fadeIn: 0.04, early: true });
    V.spawn({ p: c.clone().setY(y - 0.25), tile: 'slashLow', mode: 2, u: side.clone(), w: dir.clone().negate(), size: [sz * 1.0, sz * 1.3], life: 0.32, color, alpha: 0.5, fadeIn: 0.08 });
    for (let i = 0; i < this.n(big ? 18 : 10); i++) {
      const a = yaw + a0 + (a1 - a0) * Math.random(), rr = r * R(0.55, 1.0);
      const p = new THREE.Vector3(origin.x + Math.sin(a) * rr, y + R(-0.4, 0.4), origin.z + Math.cos(a) * rr);
      V.spawn({ p, v: new THREE.Vector3(Math.sin(a), R(-0.2, 0.6), Math.cos(a)).multiplyScalar(R(3, 7)), tile: 'trace', mode: 1, size: R(0.08, 0.15), stretch: 0.05, life: R(0.2, 0.4), drag: 2.5, color: i % 3 ? color : C50.core, alpha: 0.95 });
    }
  }
  // 命中火花（龙被打中：紫色碎光；玩家被打中：红白）
  sparks(p, { color = this.energy, n = 10, big = false, away = null } = {}) {
    const V = this.V;
    V.spawn({ p, tile: 'starSharp2', size: [0.5, big ? 2.2 : 1.4], life: 0.16, color: C50.core, rot: R(0, 3), alpha: 1 });
    V.spawn({ p, tile: 'flare', size: big ? 3.0 : 2.0, life: 0.12, color, alpha: 0.8 });
    for (let i = 0; i < this.n(n); i++) {
      const d = new THREE.Vector3(R(-1, 1), R(-0.3, 1), R(-1, 1)); if (away) d.addScaledVector(away, 1.2); d.normalize();
      V.spawn({ p, v: d.multiplyScalar(R(5, 12)), tile: 'trace', mode: 1, size: R(0.08, 0.15), stretch: 0.045, gravity: 9, drag: 2.2, life: R(0.2, 0.4), color: i % 3 ? color : C50.core, alpha: 1 });
    }
  }

  // ---------- 地面冲击：光环、扬尘、碎石、焦痕 ----------
  impact(pos, r, { color = this.energy, rocks = 10, dust = 12, scorch = true, light = 40 } = {}) {
    const V = this.V, g = new THREE.Vector3(pos.x, 0.06, pos.z);
    V.spawn({ p: g, tile: 'ringSoft', mode: 3, size: [r * 0.3, r * 2.2], life: 0.5, color, alpha: 0.85 });
    V.spawn({ p: g, tile: 'ringWide', mode: 3, size: [r * 0.5, r * 2.6], life: 0.7, color: C50.core, alpha: 0.3 });
    V.spawn({ p: g.clone().setY(0.7), tile: 'flare', size: r * 1.1, life: 0.14, color, alpha: 0.45 });
    if (scorch) V.spawn({ p: g.clone().setY(0.045), tile: 'scorch2', mode: 3, blend: 'alpha', size: [r * 1.6, r * 1.8], life: 6, color: 0x14121a, alpha: 0.7, rot: R(0, 6) });
    for (let i = 0; i < this.n(dust); i++) {
      const a = Math.random() * Math.PI * 2, s = R(0.4, 1);
      V.spawn({ p: new THREE.Vector3(pos.x + Math.cos(a) * r * 0.5, 0.35, pos.z + Math.sin(a) * r * 0.5), v: new THREE.Vector3(Math.cos(a) * s * r * 1.6, R(0.4, 1.6), Math.sin(a) * s * r * 1.6), tile: i % 2 ? 'smoke' : 'smoke2', blend: 'alpha', size: [0.9, R(2.2, 3.6)], life: R(0.9, 1.5), drag: 2.4, color: 0x8a8590, alpha: 0.42, rot: R(0, 6), spin: R(-0.8, 0.8) });
    }
    this.rocksBurst(pos, rocks, r);
    if (light) this.light(new THREE.Vector3(pos.x, 1.5, pos.z), { color, k: light, life: 0.35, dist: r * 4 + 6 });
  }
  rocksBurst(pos, n, r = 2) {
    for (let i = 0; i < Math.round(n * Math.max(0.5, this.q)); i++) {
      const a = Math.random() * Math.PI * 2, s = R(2, 6);
      this.rocks.push({ p: new THREE.Vector3(pos.x + Math.cos(a) * r * R(0.1, 0.6), 0.2, pos.z + Math.sin(a) * r * R(0.1, 0.6)), v: new THREE.Vector3(Math.cos(a) * s, R(4, 9), Math.sin(a) * s),
        rot: new THREE.Euler(R(0, 6), R(0, 6), R(0, 6)), rv: new THREE.Vector3(R(-8, 8), R(-8, 8), R(-8, 8)), s: R(0.5, 1.5), t: 0, life: R(1.6, 2.6) });
    }
    while (this.rocks.length > 60) this.rocks.shift();
  }
  dust(pos, n = 8, spread = 2, color = 0x8a8590) {
    for (let i = 0; i < this.n(n); i++) {
      const a = Math.random() * Math.PI * 2;
      this.V.spawn({ p: new THREE.Vector3(pos.x + Math.cos(a) * spread * 0.3, 0.3, pos.z + Math.sin(a) * spread * 0.3), v: new THREE.Vector3(Math.cos(a) * R(0.6, 1.6) * spread, R(0.3, 1.2), Math.sin(a) * R(0.6, 1.6) * spread), tile: i % 2 ? 'smoke' : 'smoke2', blend: 'alpha', size: [0.8, R(1.8, 2.8)], life: R(0.8, 1.3), drag: 2.5, color, alpha: 0.38, rot: R(0, 6), spin: R(-0.8, 0.8) });
    }
  }

  // ---------- 冲击环：地面环带 + 竖起的光墙；radius 由调用方每帧给（与判定同一个半径）----------
  shockRing(center, { maxR = 10, w = 1.6, h = 1.6, color = this.energy } = {}) {
    const S = maxR * 2 + 4;
    const bandU = { uR: { value: 0.1 }, uW: { value: w }, uA: { value: 1 }, uT: { value: 0 }, uCol: { value: new THREE.Color(color) }, uCore: { value: new THREE.Color(C50.core) } };
    const band = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.ShaderMaterial({ uniforms: bandU, vertexShader: TELE_VS, fragmentShader: BAND_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    band.rotation.x = -Math.PI / 2; band.position.set(center.x, 0.07, center.z); band.renderOrder = 6;
    const wallU = { uA: { value: 1 }, uT: { value: 0 }, uCol: { value: new THREE.Color(color) }, uCore: { value: new THREE.Color(C50.core) } };
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, h, 72, 1, true), new THREE.ShaderMaterial({ uniforms: wallU, vertexShader: FLAME_VS, fragmentShader: WALL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    wall.position.set(center.x, h / 2, center.z); wall.renderOrder = 6;
    this.scene.add(band, wall);
    const h0 = { r: 0.1, a: 1, done: false,
      set: (r, a = 1) => { bandU.uR.value = r; bandU.uA.value = a; wallU.uA.value = a; wall.scale.set(Math.max(0.05, r), 1, Math.max(0.05, r)); },
      update: (dt) => { bandU.uT.value += dt; wallU.uT.value += dt; return !h0.done; },
      dispose: () => { for (const m of [band, wall]) { m.parent?.remove(m); m.geometry.dispose(); m.material.dispose(); } },
      end: () => { h0.done = true; } };
    this.items.push(h0);
    return h0;
  }

  // ---------- 灵弹 ----------
  orb(pos, { color = this.energy, size = 0.55 } = {}) {
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(size * 0.55, 2), new THREE.MeshBasicMaterial({ color: C50.core, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    const g = new THREE.Group(); g.add(core, shell); g.position.copy(pos); g.renderOrder = 7;
    this.scene.add(g);
    const L = this.light(pos, { color, k: 14, life: 99, dist: 9 });
    const h = { g, L, t: 0, color, done: false,
      move: (p, dt) => {
        g.position.copy(p); L.l.position.copy(p); L.t = 0; h.t += dt;
        shell.scale.setScalar(1 + 0.12 * Math.sin(h.t * 25));
        this.V.spawn({ p: p.clone(), tile: 'glow', size: size * 3.2, life: 0.12, color, alpha: 0.55 });
        this.V.spawn({ p: p.clone().add(_v.set(R(-0.15, 0.15), R(-0.15, 0.15), R(-0.15, 0.15))), v: _u.set(R(-0.5, 0.5), R(-0.2, 0.6), R(-0.5, 0.5)), tile: 'trace', mode: 1, stretch: 0.04, size: R(0.08, 0.14), life: R(0.25, 0.45), color: Math.random() < 0.4 ? C50.core : color, alpha: 0.9 });
      },
      update: () => !h.done,
      dispose: () => { g.parent?.remove(g); core.geometry.dispose(); core.material.dispose(); shell.geometry.dispose(); shell.material.dispose(); L.k = 0; L.l.intensity = 0; },
      end: () => { h.done = true; } };
    this.items.push(h);
    return h;
  }
  orbBurst(p, color = this.energy) {
    const V = this.V;
    V.spawn({ p, tile: 'sparkBall', size: [0.6, 3.2], life: 0.28, color, alpha: 0.9, rot: R(0, 6) });
    V.spawn({ p, tile: 'ring', size: [0.3, 2.6], life: 0.3, color: C50.core, alpha: 0.7 });
    this.sparks(p, { color, n: 12 });
    this.light(p, { color, k: 26, life: 0.25, dist: 10 });
  }

  // ---------- 龙焰：自嘴向前的锥（长度、张角与判定一致）----------
  breath({ len = 11, half = 0.32, color = this.energy } = {}) {
    const R0 = 0.35, R1 = Math.tan(half) * len;
    const mk = (k, rr, cone) => { const geo = new THREE.CylinderGeometry(rr, R0 * 0.8, len, 40, 8, true); geo.translate(0, len / 2, 0); const m = new THREE.Mesh(geo, flameMat({ col: color, core: C50.core, k, scroll: 4.2, cone })); m.renderOrder = 7; m.frustumCulled = false; return m; };
    const outer = mk(0.8, R1, true), inner = mk(0.55, R1 * 0.4, true);
    inner.material.uniforms.uCore.value.set(0xd8c8ff);
    const g = new THREE.Group(); g.add(outer, inner); this.scene.add(g);
    const L = this.light(new THREE.Vector3(), { color, k: 45, life: 99, dist: 16 });
    const h = { g, t: 0, a: 0, on: true, done: false, len,
      set: (mouth, dir, a = 1, grow = 1) => {
        g.position.copy(mouth); g.quaternion.setFromUnitVectors(UP, dir);
        for (const m of [outer, inner]) { m.material.uniforms.uA.value = a; m.material.uniforms.uLen.value = grow; }
        L.l.position.copy(mouth).addScaledVector(dir, len * 0.35 * grow); L.t = 0; L.k = 45 * a;
        h.mouth = mouth; h.dir = dir;
      },
      update: (dt) => {
        h.t += dt;
        for (const m of [outer, inner]) m.material.uniforms.uT.value = h.t;
        if (h.on && h.mouth) {
          // 沿锥喷出的火团、余烬与地面焦痕
          const V = this.V;
          for (let i = 0; i < this.n(4); i++) {
            const sp = _v.copy(h.dir).multiplyScalar(R(9, 15)).add(_u.set(R(-1, 1), R(-0.5, 0.5), R(-1, 1)).multiplyScalar(R(0.6, 2.4)));
            V.spawn({ p: h.mouth.clone(), v: sp.clone(), tile: i % 2 ? 'flame' : 'fire', size: [0.5, R(2.2, 3.4)], life: R(0.45, 0.75), drag: 1.2, color: i % 3 ? color : C50.core, alpha: 0.75, rot: R(0, 6), spin: R(-2, 2) });
          }
          const hitG = h.groundHit;
          if (hitG && Math.random() < 0.5) V.spawn({ p: hitG.clone().add(_v.set(R(-1.2, 1.2), 0.05, R(-1.2, 1.2))), tile: 'scorch', mode: 3, blend: 'alpha', size: [1.6, 2.6], life: 4, color: 0x17121c, alpha: 0.45, rot: R(0, 6) });
        }
        return !h.done;
      },
      dispose: () => { g.parent?.remove(g); for (const m of [outer, inner]) { m.geometry.dispose(); m.material.dispose(); } L.k = 0; L.l.intensity = 0; },
      end: () => { h.done = true; } };
    this.items.push(h);
    return h;
  }

  // ---------- 落雷 ----------
  runeMark(pos, r, life, color = this.energy) {
    const V = this.V, g = new THREE.Vector3(pos.x, 0.05, pos.z);
    V.spawn({ p: g, tile: 'magicCompass', mode: 3, size: [r * 1.6, r * 2.2], life, color, alpha: 0.75, fadeIn: 0.15, spin: 1.6 });
    V.spawn({ p: g.clone().setY(0.055), tile: 'magic5', mode: 3, size: [r * 0.6, r * 1.2], life, color: C50.core, alpha: 0.45, fadeIn: 0.25, spin: -2.4 });
  }
  lightning(pos, { r = 2.4, color = this.energy } = {}) {
    const top = new THREE.Vector3(pos.x + R(-3, 3), 26, pos.z + R(-3, 3)), bot = new THREE.Vector3(pos.x, 0.05, pos.z);
    const mats = [];
    const mk = () => { const m = new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(color) }, uCore: { value: new THREE.Color(C50.core) }, uA: { value: 1 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }', fragmentShader: BOLT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); mats.push(m); return m; };
    const bolts = [0, 1, 2].map((i) => { const b = new THREE.Mesh(boltGeometry(top, bot, { width: i === 0 ? 0.7 : 0.5, branches: 3 + i }), mk()); b.frustumCulled = false; b.renderOrder = 8; this.scene.add(b); return b; });
    const h = { t: 0, done: false,
      update: (dt) => {
        h.t += dt;
        const k = Math.floor(h.t / 0.05) % bolts.length, a = h.t < 0.28 ? 1 : Math.max(0, 1 - (h.t - 0.28) / 0.22);
        bolts.forEach((b, i) => { b.visible = i === k || h.t < 0.06; b.material.uniforms.uA.value = a * (0.85 + 0.15 * Math.random()); });
        return h.t < 0.5;
      },
      dispose: () => { for (const b of bolts) { b.parent?.remove(b); b.geometry.dispose(); } for (const m of mats) m.dispose(); },
    };
    this.items.push(h);
    // 落点：光环、焦痕、火花、烟
    const V = this.V, g = new THREE.Vector3(pos.x, 0.06, pos.z);
    V.spawn({ p: g, tile: 'ringSoft', mode: 3, size: [0.4, r * 2.4], life: 0.45, color: C50.core, alpha: 0.9 });
    V.spawn({ p: g, tile: 'starRing', mode: 3, size: [r * 0.6, r * 2.0], life: 0.35, color, alpha: 0.8, rot: R(0, 6) });
    V.spawn({ p: g.clone().setY(1.0), tile: 'flare', size: r * 3, life: 0.16, color: C50.core, alpha: 0.9 });
    V.spawn({ p: g.clone().setY(0.045), tile: 'scorch', mode: 3, blend: 'alpha', size: [r * 1.3, r * 1.6], life: 5, color: 0x120f18, alpha: 0.75, rot: R(0, 6) });
    for (let i = 0; i < this.n(18); i++) V.spawn({ p: g.clone().setY(0.3), v: new THREE.Vector3(R(-1, 1), R(0.4, 1.6), R(-1, 1)).normalize().multiplyScalar(R(6, 14)), tile: 'trace', mode: 1, size: R(0.08, 0.14), stretch: 0.05, gravity: 12, drag: 1.5, life: R(0.25, 0.5), color: i % 2 ? color : C50.core, alpha: 1 });
    this.dust(pos, 6, 2.2, 0x5a5466);
    this.light(new THREE.Vector3(pos.x, 3, pos.z), { color: C50.core, k: 120, life: 0.3, dist: 26 });
  }

  // ---------- 焰柱 ----------
  flamePillar(pos, { r = 2.0, h = 7.5, color = this.energy, life = 0.95 } = {}) {
    const geo = new THREE.CylinderGeometry(r * 0.75, r, h, 36, 6, true); geo.translate(0, h / 2, 0);
    const m = new THREE.Mesh(geo, flameMat({ col: color, core: C50.core, k: 1.25, scroll: 3.0 }));
    const geo2 = new THREE.CylinderGeometry(r * 0.35, r * 0.55, h * 0.8, 24, 4, true); geo2.translate(0, h * 0.4, 0);
    const m2 = new THREE.Mesh(geo2, flameMat({ col: 0xd9b8ff, core: C50.core, k: 0.9, scroll: 4.2 }));
    const g = new THREE.Group(); g.add(m, m2); g.position.set(pos.x, 0, pos.z); g.renderOrder = 7;
    for (const x of [m, m2]) x.frustumCulled = false;
    this.scene.add(g);
    const L = this.light(new THREE.Vector3(pos.x, 2.5, pos.z), { color, k: 70, life: life, dist: 18 });
    const V = this.V;
    V.spawn({ p: new THREE.Vector3(pos.x, 0.06, pos.z), tile: 'ringSoft', mode: 3, size: [r * 0.6, r * 2.6], life: 0.5, color, alpha: 0.9 });
    V.spawn({ p: new THREE.Vector3(pos.x, 0.045, pos.z), tile: 'scorch3', mode: 3, blend: 'alpha', size: [r * 1.8, r * 2.0], life: 6, color: 0x150f1c, alpha: 0.7, rot: R(0, 6) });
    const hh = { t: 0,
      update: (dt) => {
        hh.t += dt;
        const u = hh.t / life, rise = Math.min(1, hh.t / 0.12), a = u < 0.7 ? 1 : Math.max(0, 1 - (u - 0.7) / 0.3);
        g.scale.set(0.6 + 0.4 * rise, rise, 0.6 + 0.4 * rise);
        for (const x of [m, m2]) { x.material.uniforms.uT.value = hh.t; x.material.uniforms.uA.value = a; }
        if (u < 0.75) for (let i = 0; i < this.n(3); i++) { const a2 = Math.random() * Math.PI * 2, rr = r * Math.sqrt(Math.random()); V.spawn({ p: new THREE.Vector3(pos.x + Math.cos(a2) * rr, R(0, 1), pos.z + Math.sin(a2) * rr), v: new THREE.Vector3(0, R(6, 12), 0), tile: i % 2 ? 'flame' : 'fire', size: [0.6, R(1.6, 2.6)], life: R(0.4, 0.7), drag: 0.8, color: i % 3 ? color : C50.core, alpha: 0.7, rot: R(0, 6) }); }
        return hh.t < life;
      },
      dispose: () => { g.parent?.remove(g); for (const x of [m, m2]) { x.geometry.dispose(); x.material.dispose(); } },
    };
    this.items.push(hh);
    void L;
  }

  // ---------- 怒吼：一圈扬尘被吹开、一道光环 ----------
  roarWave(center, { r = 9, color = this.energy } = {}) {
    const V = this.V, g = new THREE.Vector3(center.x, 0.08, center.z);
    V.spawn({ p: g, tile: 'smokeRing', mode: 3, blend: 'alpha', size: [2, r * 2.6], life: 1.1, color: 0x9a94a6, alpha: 0.4 });
    V.spawn({ p: g, tile: 'ringWide', mode: 3, size: [1, r * 2.2], life: 0.8, color, alpha: 0.6 });
    for (let i = 0; i < this.n(26); i++) {
      const a = (i / 26) * Math.PI * 2 + R(-0.1, 0.1);
      V.spawn({ p: new THREE.Vector3(center.x + Math.cos(a) * 2.5, 0.4, center.z + Math.sin(a) * 2.5), v: new THREE.Vector3(Math.cos(a) * R(7, 12), R(0.2, 1), Math.sin(a) * R(7, 12)), tile: i % 2 ? 'smoke' : 'smoke2', blend: 'alpha', size: [1.2, R(2.6, 4)], life: R(1, 1.6), drag: 1.8, color: 0x8f8a98, alpha: 0.4, rot: R(0, 6), spin: R(-1, 1) });
    }
  }
  // 大符阵（灭世龙怒的蓄力、二阶段觉醒）
  bigRune(center, r, life, color = this.energy) {
    const V = this.V, g = new THREE.Vector3(center.x, 0.06, center.z);
    V.spawn({ p: g, tile: 'magic7', mode: 3, size: [r * 1.4, r * 2.1], life, color, alpha: 0.7, fadeIn: 0.2, spin: 0.8 });
    V.spawn({ p: g.clone().setY(0.065), tile: 'magicCompass', mode: 3, size: [r * 0.9, r * 1.3], life, color: C50.core, alpha: 0.4, fadeIn: 0.3, spin: -1.2 });
  }
  // 失衡：头顶绕圈的星芒
  staggerFx(head) {
    const V = this.V;
    for (let i = 0; i < 3; i++) {
      const a = this.t * 4 + (i * Math.PI * 2) / 3;
      V.spawn({ p: new THREE.Vector3(head.x + Math.cos(a) * 1.1, head.y + 0.9, head.z + Math.sin(a) * 1.1), tile: 'star', size: 0.45, life: 0.12, color: i ? C50.gold : C50.core, alpha: 0.95, rot: a });
    }
  }
  // 二阶段：贴着龙身升起的紫焰余烬
  embers(points, k = 1) {
    const V = this.V;
    for (let i = 0; i < this.n(Math.round(3 * k)); i++) {
      const p = points[Math.floor(Math.random() * points.length)];
      V.spawn({ p: p.clone().add(_v.set(R(-0.4, 0.4), R(-0.3, 0.3), R(-0.4, 0.4))), v: _u.set(R(-0.3, 0.3), R(0.8, 2.2), R(-0.3, 0.3)), tile: i % 3 ? 'flame' : 'glow', size: [R(0.3, 0.5), 0.05], life: R(0.6, 1.1), drag: 0.6, color: i % 4 ? this.energy : C50.core, alpha: 0.75, rot: R(0, 6) });
    }
  }
  // 玩家：雷击麻痹的电光、破防的碎环
  stunFx(P) {
    const V = this.V, p = new THREE.Vector3(P.pos.x, P.pos.y + 1.2, P.pos.z);
    for (let i = 0; i < this.n(2); i++) V.spawn({ p: p.clone().add(_v.set(R(-0.4, 0.4), R(-0.6, 0.7), R(-0.4, 0.4))), tile: i % 2 ? 'bolt' : 'bolt2', size: R(0.4, 0.8), life: 0.1, color: i % 2 ? C50.core : this.energy, alpha: 1, rot: R(0, 6) });
  }
  guardBreak(P) {
    const V = this.V, p = new THREE.Vector3(P.pos.x, P.pos.y + 1.1, P.pos.z);
    V.spawn({ p, tile: 'ring2', size: [0.6, 2.8], life: 0.3, color: 0xffd28a, alpha: 0.95 });
    V.spawn({ p, tile: 'starSharp', size: [0.4, 2.0], life: 0.2, color: 0xfff1c8, alpha: 1, rot: R(0, 3) });
    for (let i = 0; i < this.n(16); i++) V.spawn({ p, v: new THREE.Vector3(R(-1, 1), R(-0.2, 1), R(-1, 1)).normalize().multiplyScalar(R(4, 9)), tile: 'trace', mode: 1, size: R(0.08, 0.14), stretch: 0.05, gravity: 10, drag: 2, life: R(0.3, 0.5), color: i % 2 ? 0xffd28a : 0xbff0ff, alpha: 1 });
  }
  // 封印光墙上被撞到的一点涟漪
  barrierHit(p, color = 0xb08cff) {
    this.V.spawn({ p: p.clone(), tile: 'ring', mode: 0, size: [0.3, 2.4], life: 0.35, color, alpha: 0.8 });
    this.V.spawn({ p: p.clone(), tile: 'flare', size: 2.0, life: 0.15, color, alpha: 0.7 });
  }
  // 溶解：自龙身各处升起的灵光点
  motes(points, n, color = this.energy, toward = null) {
    const V = this.V;
    for (let i = 0; i < this.n(n); i++) {
      const p = points[Math.floor(Math.random() * points.length)].clone().add(_v.set(R(-0.5, 0.5), R(-0.4, 0.4), R(-0.5, 0.5)));
      const v = toward ? toward.clone().sub(p).multiplyScalar(R(0.5, 0.9)).add(_u.set(R(-0.5, 0.5), R(0.5, 1.5), R(-0.5, 0.5))) : _u.set(R(-0.4, 0.4), R(1, 2.6), R(-0.4, 0.4)).clone();
      V.spawn({ p, v, tile: i % 3 ? 'glow' : 'star', size: R(0.12, 0.3), life: R(0.9, 1.6), drag: 0.4, color: i % 3 ? color : C50.core, alpha: 0.9, fadeIn: 0.2, rot: R(0, 6) });
    }
  }
  // 奖励灵珠
  rewardOrb(pos, color = 0xffe7a8) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(pos); m.renderOrder = 8; this.scene.add(m);
    const h = { m, t: 0, done: false,
      update: (dt) => { h.t += dt; this.V.spawn({ p: m.position.clone(), tile: 'glow', size: 1.6 + 0.3 * Math.sin(h.t * 8), life: 0.1, color, alpha: 0.7 }); return !h.done; },
      dispose: () => { m.parent?.remove(m); m.geometry.dispose(); m.material.dispose(); }, end: () => { h.done = true; } };
    this.items.push(h);
    return h;
  }

  // ---------- 拖尾：每帧给出尖端与根部（on 为假时不再取样，残留的自然淡去）----------
  trailPush(k, tip, base) { const T = this.trails[k]; T.push(tip, base, this.V.now); }

  // ---------- 每帧 ----------
  update(dt) {
    this.t += dt;
    for (const t of [...this.teles]) t.update(dt);
    for (let i = this.items.length - 1; i >= 0; i--) { const it = this.items[i]; if (!it.update(dt)) { it.dispose(); this.items.splice(i, 1); } }
    for (const T of Object.values(this.trails)) T.update(this.V.now);
    for (const L of this.lights) {
      if (L.k <= 0) { L.l.intensity = 0; continue; }
      L.t += dt;
      if (L.follow) L.l.position.copy(L.follow());
      const u = L.t / L.life;
      L.l.intensity = u >= 1 ? 0 : L.k * (L.life > 50 ? 1 : (1 - u) * (1 - u));
      if (u >= 1) L.k = 0;
    }
    // 碎石
    const M = this.rockMesh, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.t += dt;
      r.v.y -= 22 * dt; r.p.addScaledVector(r.v, dt);
      if (r.p.y < 0.12 * r.s) { r.p.y = 0.12 * r.s; r.v.y *= -0.35; r.v.x *= 0.6; r.v.z *= 0.6; r.rv.multiplyScalar(0.6); }
      r.rot.x += r.rv.x * dt; r.rot.y += r.rv.y * dt; r.rot.z += r.rv.z * dt;
      if (r.t > r.life) this.rocks.splice(i, 1);
    }
    for (let i = 0; i < 60; i++) {
      const r = this.rocks[i];
      if (!r) { m4.makeScale(0, 0, 0); M.setMatrixAt(i, m4); continue; }
      const k = r.s * Math.min(1, (r.life - r.t) / 0.4);
      m4.compose(r.p, q.setFromEuler(r.rot), s.set(k, k, k));
      M.setMatrixAt(i, m4);
    }
    M.instanceMatrix.needsUpdate = true;
  }

  // 清场（换阶段、重试、离开）：预警、网格特效、点光、碎石、拖尾一律清掉
  clear() {
    for (const t of [...this.teles]) t.dispose();
    for (const it of this.items) it.dispose();
    this.items.length = 0;
    for (const L of this.lights) { L.k = 0; L.l.intensity = 0; L.follow = null; }
    this.rocks.length = 0;
    for (const T of Object.values(this.trails)) T.clear();
  }
  dispose() {
    this.clear();
    for (const T of Object.values(this.trails)) { T.mesh.parent?.remove(T.mesh); T.geo.dispose(); T.mat.dispose(); }
    for (const L of this.lights) L.l.parent?.remove(L.l);
    this.rockMesh.parent?.remove(this.rockMesh); this.rockMesh.geometry.dispose(); this.rockMesh.material.dispose();
  }
}
