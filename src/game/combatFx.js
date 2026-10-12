// 第十七轮：战斗用的几样立体特效（与 skillfx.js 的粒子、拖尾配合；全部预先建好、循环取用，不在出招时现建）：
//   LightPool  几盏短命的点光（弹反、重击、破地时亮一下）——灯数固定，不会因灯的增减重编着色器
//   Crescents  剑气·新月的月牙：一段弧形的带子（外沿白热、向内渐暗、两端收尖、噪声闪动），随剑气飞行，散时化开
//   Chains     缚灵锁的金色锁链：一节一节的链环（实例化网格）从左手射向目标，缠上之后收回
//   Binds      被缚住的目标身上转动的金环（三道）
//   Tells      不可格挡的「危」字（红，悬在出手者头顶）与难挡重击出手前兵刃上的一道金光
import * as THREE from 'three';

const R = (a, b) => a + Math.random() * (b - a);

// ---------- 点光 ----------
export class LightPool {
  constructor(scene, n = 3) {
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const L = new THREE.PointLight(0xffffff, 0, 9, 2);
      L.castShadow = false; L.userData = { t: 0, life: 0, k: 0 };
      scene.add(L); this.lights.push(L);
    }
  }
  moveTo(scene) { for (const L of this.lights) scene.add(L); }
  pulse(p, color, k = 6, life = 0.25) {
    const L = this.lights.reduce((a, b) => (a.userData.life - a.userData.t < b.userData.life - b.userData.t ? a : b));
    L.position.copy(p); L.color.set(color);
    L.userData.t = 0; L.userData.life = life; L.userData.k = k;
  }
  update(dt) {
    for (const L of this.lights) {
      const u = L.userData;
      if (u.t >= u.life) { L.intensity = 0; continue; }
      u.t += dt;
      const x = Math.min(1, u.t / u.life);
      L.intensity = u.k * (1 - x) * (1 - x);
    }
  }
  clear() { for (const L of this.lights) { L.userData.t = L.userData.life; L.intensity = 0; } }
}

// ---------- 剑气月牙 ----------
const CRESCENT_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const CRESCENT_FS = `uniform float uT, uA; uniform vec3 uColor, uCore; varying vec2 vUv;
  float h(float n){ return fract(sin(n) * 43758.5453); }
  float noise(float x){ float i = floor(x), f = fract(x); return mix(h(i), h(i + 1.), f * f * (3. - 2. * f)); }
  void main(){
    float r = vUv.y, s = vUv.x;                                     // r：内沿 0 → 外沿 1；s：沿弧 0 → 1
    float tip = smoothstep(0., .22, s) * smoothstep(1., .78, s);    // 两端收尖
    float w = mix(.25, 1., sin(s * 3.14159));                        // 中段最厚
    float band = smoothstep(1. - w, 1., r);                          // 自外沿向内
    float edge = smoothstep(.82, 1., r) * smoothstep(1., .96, r);    // 外沿一道亮线
    float fl = .75 + .25 * noise(s * 14. + uT * 22.);
    vec3 c = (uColor * band * .7 + uCore * edge * 1.4) * tip * fl * uA;
    gl_FragColor = vec4(c, 1.);
  }`;
export class Crescents {
  constructor(scene, n = 6) {
    // 弧：正对 +Z 方向凸出（在 XZ 平面），张角 150°
    const g = new THREE.RingGeometry(0.55, 1.0, 40, 1, Math.PI / 2 - 1.31, 2.62);
    // RingGeometry 的 uv 是平面投影；换成（沿弧、径向）
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), r = Math.hypot(x, y), a = Math.atan2(y, x);
      uv.setXY(i, (a - (Math.PI / 2 - 1.31)) / 2.62, (r - 0.55) / 0.45);
    }
    g.rotateX(-Math.PI / 2);                     // 平放：原来的 +Y（弧顶）转到 -Z → 再绕 Y 转半圈让弧顶朝 +Z
    g.rotateY(Math.PI);
    this.geo = g;
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uA: { value: 0 }, uColor: { value: new THREE.Color(0x8fe6ff) }, uCore: { value: new THREE.Color(0xeaffff) } },
        vertexShader: CRESCENT_VS, fragmentShader: CRESCENT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      m.visible = false; m.frustumCulled = false; m.renderOrder = 9;
      scene.add(m);
      this.pool.push({ m, busy: false, t: 0, fade: 0, pr: null });
    }
  }
  moveTo(scene) { for (const c of this.pool) scene.add(c.m); }
  // pr：投射物（pos、dir）；size：弧的半径；gold：金色（满蓄力的剑气）
  spawn(pr, { size = 1.5, gold = false, tilt = 0 } = {}) {
    const c = this.pool.find((x) => !x.busy) || this.pool[0];
    c.busy = true; c.t = 0; c.fade = 0; c.pr = pr; c.size = size; c.tilt = tilt;
    const u = c.m.material.uniforms;
    u.uColor.value.set(gold ? 0xf5c86a : 0x8fe6ff); u.uCore.value.set(gold ? 0xfff1c8 : 0xeaffff);
    c.m.visible = true;
    this.place(c);
    return c;
  }
  place(c) {
    const p = c.pr.pos, d = c.pr.dir;
    c.m.position.copy(p);
    c.m.scale.setScalar(c.size);
    c.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.clone().normalize());
    if (c.tilt) c.m.rotateZ(c.tilt);
  }
  end(pr) { const c = this.pool.find((x) => x.busy && x.pr === pr); if (c) c.fade = 0.0001; }
  update(dt) {
    for (const c of this.pool) {
      if (!c.busy) continue;
      c.t += dt;
      const u = c.m.material.uniforms;
      u.uT.value = c.t;
      if (c.fade > 0) {
        c.fade += dt;
        const k = 1 - c.fade / 0.18;
        u.uA.value = Math.max(0, k);
        c.m.scale.setScalar(c.size * (1 + c.fade * 2.5));
        if (k <= 0) { c.busy = false; c.m.visible = false; c.pr = null; }
        continue;
      }
      u.uA.value = Math.min(1, c.t / 0.05);
      this.place(c);
    }
  }
  clear() { for (const c of this.pool) { c.busy = false; c.m.visible = false; c.pr = null; } }
}

// ---------- 缚灵锁：锁链 ----------
const LINK = 0.085;                            // 链环间距
export class Chains {
  constructor(scene, maxLinks = 180) {
    const g = new THREE.TorusGeometry(0.05, 0.014, 6, 12);
    g.scale(1, 1.55, 1);
    this.mat = new THREE.MeshStandardMaterial({ color: 0xd9a84a, emissive: 0xffb84a, emissiveIntensity: 0.9, metalness: 0.85, roughness: 0.3 });
    this.mesh = new THREE.InstancedMesh(g, this.mat, maxLinks);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    this.max = maxLinks;
    this.list = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
  }
  moveTo(scene) { scene.add(this.mesh); }
  // 一条锁链：from → to（to 可以是函数，目标在动时跟着），grow 秒射出、hold 秒缠住、out 秒收回
  shoot(from, to, { grow = 0.12, hold = 0.35, out = 0.22, wobble = 0.12 } = {}) {
    this.list.push({ from: from.clone(), to, t: 0, grow, hold, out, wobble, seed: Math.random() * 10 });
  }
  update(dt) {
    let n = 0;
    const M = this._m, Q = this._q, S = this._s, P = this._p;
    this.list = this.list.filter((c) => c.t < c.grow + c.hold + c.out);
    for (const c of this.list) {
      c.t += dt;
      const end = typeof c.to === 'function' ? c.to() : c.to;
      const dir = P.subVectors(end, c.from), L = dir.length();
      if (L < 0.05) continue;
      dir.divideScalar(L);
      // 伸出的长度：射出时由手到目标，收回时由手这头往回卷
      const g = Math.min(1, c.t / c.grow), o = Math.max(0, (c.t - c.grow - c.hold) / c.out);
      const len = L * (1 - Math.pow(1 - g, 3)) * (1 - o);
      const links = Math.min(this.max - n, Math.floor(len / LINK));
      const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
      const base = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      for (let i = 0; i < links; i++) {
        const s = i * LINK, u = s / Math.max(L, 1e-3);
        // 微微下垂、抖动
        const sag = Math.sin(u * Math.PI) * (0.08 + c.wobble * Math.sin(c.t * 18 + c.seed + u * 9) * (1 - g * 0.6));
        const p = new THREE.Vector3().copy(c.from).addScaledVector(dir, s).addScaledVector(side, sag * 0.6);
        p.y -= Math.abs(sag) * 0.5;
        Q.copy(base);
        if (i % 2) Q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
        S.setScalar(1);
        M.compose(p, Q, S);
        this.mesh.setMatrixAt(n++, M);
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { this.list.length = 0; this.mesh.count = 0; }
}

// ---------- 被缚住的目标：身上转动的三道金环 ----------
export class Binds {
  constructor(scene, n = 6) {
    this.geo = new THREE.TorusGeometry(1, 0.018, 6, 48);
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0xffcf6a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(this.geo, mat); m.rotation.x = Math.PI / 2 + (k - 1) * 0.25; m.frustumCulled = false; g.add(m); }
      g.visible = false; g.renderOrder = 8;
      scene.add(g);
      this.pool.push({ g, mat, busy: false, t: 0, life: 0, target: null, r: 0.55 });
    }
  }
  moveTo(scene) { for (const b of this.pool) scene.add(b.g); }
  add(target, life, r = null) {
    const b = this.pool.find((x) => !x.busy) || this.pool[0];
    b.busy = true; b.t = 0; b.life = life; b.target = target; b.r = r ?? Math.max(0.5, (target.radius ?? 0.45) + 0.12);
    b.g.visible = true;
    return b;
  }
  update(dt) {
    for (const b of this.pool) {
      if (!b.busy) continue;
      b.t += dt;
      const e = b.target, live = e.alive !== false && b.t < b.life;
      const k = live ? Math.min(1, b.t / 0.12) : Math.max(0, 1 - (b.t - b.life) / 0.25);
      if (!live && k <= 0) { b.busy = false; b.g.visible = false; b.target = null; continue; }
      if (!live && b.t < b.life) b.t = b.life;
      const p = e.hitPoint && e.boss ? e.hitPoint : e.pos, h = e.boss ? 0 : (e.headY ? (e.headY - e.pos.y) : 1.8);
      b.g.position.set(p.x, (e.boss ? p.y - 0.4 : e.pos.y), p.z);
      b.g.children.forEach((m, i) => {
        const y = e.boss ? 0.4 + i * 0.4 : h * (0.28 + i * 0.27);
        const sq = 1 - 0.18 * (1 - Math.min(1, b.t / 0.18));      // 套上时收紧一下
        m.position.y = y;
        m.scale.setScalar(b.r * (e.boss ? 1.6 : 1) * sq * (1 + 0.04 * Math.sin(b.t * 9 + i)));
        m.rotation.z = b.t * (i % 2 ? -2.2 : 2.6);
      });
      b.mat.opacity = 0.85 * k * (0.8 + 0.2 * Math.sin(b.t * 14));
    }
  }
  clear() { for (const b of this.pool) { b.busy = false; b.g.visible = false; b.target = null; } }
}

// ---------- 出手提示：「危」字、金光 ----------
function glyphTexture(ch, color) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,60,40,0.55)'); gr.addColorStop(0.55, 'rgba(160,10,10,0.35)'); gr.addColorStop(1, 'rgba(120,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,90,70,0.95)'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.stroke();
  g.font = 'bold 64px "KaiTi","STKaiti","SimSun",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color; g.shadowColor = 'rgba(255,40,20,1)'; g.shadowBlur = 12;
  g.fillText(ch, 64, 68);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export class Tells {
  constructor(scene, glowTex, n = 6) {
    this.tex = glyphTexture('危', '#ffe0d0');
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
      s.renderOrder = 12; s.visible = false; scene.add(s);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      gl.renderOrder = 12; gl.visible = false; scene.add(gl);
      this.pool.push({ s, gl, busy: false, t: 0, dur: 0, unit: null, kind: null });
    }
  }
  moveTo(scene) { for (const x of this.pool) { scene.add(x.s); scene.add(x.gl); } }
  // kind：danger（「危」字，整段前摇都亮着）| heavy（出手前 0.22 秒兵刃上一道金光）
  begin(unit, kind, dur) {
    const x = this.pool.find((y) => !y.busy) || this.pool[0];
    x.busy = true; x.t = 0; x.dur = Math.max(0.2, dur); x.unit = unit; x.kind = kind; x.ending = 0;
    x.s.visible = kind === 'danger'; x.gl.visible = kind === 'heavy';
    return x;
  }
  end(x) { if (x && x.busy) x.ending = x.ending || 1e-4; }
  update(dt) {
    for (const x of this.pool) {
      if (!x.busy) continue;
      x.t += dt;
      const e = x.unit;
      if (!e || e.alive === false) { this.end(x); }
      if (x.ending > 0) x.ending += dt;
      const fadeOut = x.ending > 0 ? Math.max(0, 1 - x.ending / 0.15) : 1;
      if (fadeOut <= 0) { x.busy = false; x.s.visible = x.gl.visible = false; x.unit = null; continue; }
      const sc = e?.cfg?.scale ?? 1, head = e ? (e.headY ?? e.pos.y + 1.8 * sc) : 0;
      if (x.kind === 'danger') {
        x.s.position.set(e.pos.x, head + 0.65 * sc, e.pos.z);
        const pulse = 0.85 + 0.15 * Math.sin(x.t * 18);
        x.s.scale.setScalar(0.75 * sc * pulse * (x.t < 0.1 ? 0.6 + x.t * 4 : 1));
        x.s.material.opacity = Math.min(1, x.t / 0.08) * fadeOut;
      } else {
        // 金光：出手前 0.22 秒起，在出手者身前、兵刃一侧闪一下
        const k = x.t >= x.dur - 0.22 ? Math.sin(Math.min(1, (x.t - (x.dur - 0.22)) / 0.22) * Math.PI) : 0;
        const f = e ? { x: Math.sin(e.yaw ?? 0), z: Math.cos(e.yaw ?? 0) } : { x: 0, z: 1 };
        x.gl.position.set(e.pos.x + f.x * 0.6 * sc - f.z * 0.35, e.pos.y + 1.45 * sc, e.pos.z + f.z * 0.6 * sc + f.x * 0.35);
        x.gl.scale.setScalar((0.3 + 0.7 * k) * sc);             // 一点金光（最大约 1 米），不把双方都盖住
        x.gl.material.opacity = 0.85 * k * fadeOut;
      }
    }
  }
  clear() { for (const x of this.pool) { x.busy = false; x.s.visible = x.gl.visible = false; x.unit = null; } }
}
// ---------- 地面范围圈（玩家自己的范围招式）：圈的外沿就是伤害半径，由内向外填满即出手 ----------
const GRING_FS = `uniform float uP, uA, uR; uniform vec3 uColor; varying vec2 vUv;
  void main(){
    vec2 q = vUv * 2. - 1.; float r = length(q);
    if (r > 1.) discard;
    float px = 1.5 / max(uR * 60., 1.);                               // 约 2.5 厘米宽的外沿线（按半径换算）
    float rim = smoothstep(1. - px * 6., 1. - px, r) * smoothstep(1., 1. - px, r);
    float fill = step(r, uP) * .16 + smoothstep(.03, 0., abs(r - uP)) * .55 * step(.02, uP);
    float tick = step(.97, fract(atan(q.y, q.x) / 6.28318 * 36.)) * smoothstep(.9, .97, r) * .5;
    gl_FragColor = vec4(uColor * (rim * 1.3 + fill + tick) * uA, 1.);
  }`;
export class GroundRings {
  constructor(scene, n = 4) {
    this.pool = [];
    const g = new THREE.PlaneGeometry(2, 2); g.rotateX(-Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
        uniforms: { uP: { value: 0 }, uA: { value: 0 }, uR: { value: 1 }, uColor: { value: new THREE.Color(0xf5c86a) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
        fragmentShader: GRING_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4,
      }));
      m.visible = false; m.renderOrder = 5; m.frustumCulled = false;
      scene.add(m);
      this.pool.push({ m, busy: false, t: 0, dur: 0 });
    }
  }
  moveTo(scene) { for (const x of this.pool) scene.add(x.m); }
  // c：圆心（地面）；r：伤害半径；dur：多久后出手（圈填满）
  show(c, r, dur, color = 0xf5c86a) {
    const x = this.pool.find((y) => !y.busy) || this.pool[0];
    x.busy = true; x.t = 0; x.dur = Math.max(0.05, dur);
    x.m.position.set(c.x, c.y + 0.06, c.z); x.m.scale.setScalar(r);
    const u = x.m.material.uniforms; u.uR.value = r; u.uColor.value.set(color); u.uP.value = 0; u.uA.value = 1;
    x.m.visible = true;
    return x;
  }
  update(dt) {
    for (const x of this.pool) {
      if (!x.busy) continue;
      x.t += dt;
      const u = x.m.material.uniforms;
      u.uP.value = Math.min(1, x.t / x.dur);
      u.uA.value = x.t <= x.dur ? Math.min(1, x.t / 0.08) : Math.max(0, 1 - (x.t - x.dur) / 0.25);
      if (x.t > x.dur + 0.25) { x.busy = false; x.m.visible = false; }
    }
  }
  clear() { for (const x of this.pool) { x.busy = false; x.m.visible = false; } }
}
export { R as rnd };
