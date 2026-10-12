// 氛围：香火与炊烟、丹炉青烟、茶炉水汽、跌水薄雾（实例化烟团）；树下飘落的叶子；灵草微光
// 数量受控：只在角色附近生成
import * as THREE from 'three';
import { shaderMaterial } from './shaderlib.js';

const KIND = {
  incense: { rate: 3.2, life: 6, rise: 0.8, grow: 0.3, size: 0.35, alpha: 0.42, tint: [0.92, 0.92, 0.9], drift: 0.25 },
  chimney: { rate: 1.6, life: 9, rise: 1.3, grow: 0.7, size: 0.9, alpha: 0.32, tint: [0.86, 0.86, 0.85], drift: 0.45 },
  steam: { rate: 2.0, life: 3, rise: 0.6, grow: 0.35, size: 0.18, alpha: 0.35, tint: [1, 1, 1], drift: 0.1 },
  furnace: { rate: 2.4, life: 7, rise: 1.0, grow: 0.55, size: 0.5, alpha: 0.38, tint: [0.84, 0.88, 0.9], drift: 0.35 },
  mist: { rate: 2.2, life: 4, rise: 0.25, grow: 0.8, size: 0.9, alpha: 0.28, tint: [0.96, 0.97, 0.97], drift: 0.5 },
};

export class Ambient {
  constructor(scene, emitters, veg, { density = 1 } = {}) {
    this.emitters = emitters;
    this.density = density;
    // ---------- 烟 ----------
    this.n = Math.round(260 * density);
    this.parts = Array.from({ length: this.n }, () => ({ life: 0 }));
    const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
    this.inst = new Float32Array(this.n * 4);   // x y z size
    this.inst2 = new Float32Array(this.n * 4);  // r g b alpha
    geo.setAttribute('aP', new THREE.InstancedBufferAttribute(this.inst, 4));
    geo.setAttribute('aC', new THREE.InstancedBufferAttribute(this.inst2, 4));
    geo.instanceCount = this.n;
    this.smokeGeo = geo;
    const mat = shaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexPars: 'attribute vec4 aP; attribute vec4 aC; varying vec2 vUv; varying vec4 vC;',
      vertex: `vUv = uv; vC = aC;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec4 mvPosition = viewMatrix * vec4(aP.xyz + (right * position.x + up * position.y) * aP.w, 1.0);
        gl_Position = projectionMatrix * mvPosition;`,
      fragmentPars: 'uniform float uTime; varying vec2 vUv; varying vec4 vC;',
      fragment: `float n = nzf(vUv * 2.6 + vC.a * 7. + uTime * .04);
        float a = smoothstep(.5, .08, length(vUv - .5) + (n - .5) * .32) * vC.a;
        if (a < .008) discard;
        gl_FragColor = vec4(vC.rgb * (.8 + .2 * n), a);`,
    });
    this.smokeMat = mat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    scene.add(mesh);

    // ---------- 落叶 ----------
    this.trees = [];
    for (const t of ['pineOld', 'maple', 'ginkgo', 'broad', 'locust', 'willow', 'mOak02', 'mOak03', 'mOak05', 'mWillow', 'mPine03', 'sakura', 'sakura', 'lilac', 'goldTree']) for (const it of veg.items[t] || []) this.trees.push({ x: it.x, y: it.y, z: it.z, s: it.s, type: t });
    this.nl = Math.round(70 * density);
    this.lp = new Float32Array(this.nl * 3);
    this.lv = new Float32Array(this.nl * 3);
    this.ll = new Float32Array(this.nl);
    this.lk = new Float32Array(this.nl);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.lp, 3));
    lg.setAttribute('aLife', new THREE.BufferAttribute(this.ll, 1));
    lg.setAttribute('aKind', new THREE.BufferAttribute(this.lk, 1));
    this.leafMat = shaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
      vertexPars: 'attribute float aLife; attribute float aKind; varying float vL; varying float vK; uniform float uScale;',
      vertex: 'vL = aLife; vK = aKind; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition; gl_PointSize = clamp(uScale * 9. / -mvPosition.z, 1.5, 14.);',
      fragmentPars: 'uniform float uTime; varying float vL; varying float vK;',
      fragment: `if (vL <= 0.) discard;
        vec2 c = gl_PointCoord - .5;
        float ang = vK * 40. + uTime * (1.5 + vK * 2.);
        mat2 r = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
        vec2 q = r * c; q.x *= 2.1;
        if (length(q) > .45) discard;
        vec3 col = vK >= 3. ? vec3(.95, .74, .26) : vK >= 2. ? vec3(.8, .7, .93) : vK >= 1. ? vec3(1., .8, .86) : vK < .33 ? vec3(.78, .6, .3) : vK < .66 ? vec3(.62, .42, .24) : vec3(.66, .34, .22);
        gl_FragColor = vec4(col * (.8 + .4 * fract(vK * 13.)), min(1., vL * 3.));`,
    });
    const pts = new THREE.Points(lg, this.leafMat);
    pts.frustumCulled = false;
    pts.renderOrder = 6;
    scene.add(pts);
    this.leafGeo = lg;

    // ---------- 灵草微光 ----------
    this.glints = [];
    this.ng = 48;
    this.gp = new Float32Array(this.ng * 3);
    this.gl = new Float32Array(this.ng);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(this.gp, 3));
    gg.setAttribute('aLife', new THREE.BufferAttribute(this.gl, 1));
    this.glintMat = shaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 1 } },
      vertexPars: 'attribute float aLife; varying float vL; uniform float uScale;',
      vertex: 'vL = aLife; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition; gl_PointSize = clamp(uScale * 5. / -mvPosition.z, 1., 8.);',
      fragmentPars: 'varying float vL;',
      fragment: 'if (vL <= 0.) discard; float a = smoothstep(.5, 0., length(gl_PointCoord - .5)) * sin(vL * 3.14159) * .9; gl_FragColor = vec4(vec3(.75, 1., .88) * 1.4, a);',
    });
    const gpts = new THREE.Points(gg, this.glintMat);
    gpts.frustumCulled = false;
    gpts.renderOrder = 7;
    scene.add(gpts);
    this.glintGeo = gg;
    this.gv = new Float32Array(this.ng);
    this.pickT = 0;
    this.active = [];
  }

  setHerbs(list) { this.glints = list; }

  update(dt, camera, focus, t) {
    this.smokeMat.uniforms.uTime.value = t;
    this.leafMat.uniforms.uTime.value = t;
    const scale = innerHeight / 900 * (camera.isPerspectiveCamera ? 1 : 1);
    this.leafMat.uniforms.uScale.value = scale * 60;
    this.glintMat.uniforms.uScale.value = scale * 60;
    // 选出附近的发烟点
    this.pickT -= dt;
    if (this.pickT <= 0) {
      this.pickT = 1.0;
      this.active = this.emitters.filter((e) => (e.x - focus.x) ** 2 + (e.z - focus.z) ** 2 < 95 * 95);
    }
    for (const e of this.active) {
      const K = KIND[e.kind] || KIND.incense;
      e.acc = (e.acc || 0) + dt * K.rate * (e.rate || 1) * this.density;
      while (e.acc >= 1) {
        e.acc -= 1;
        const p = this.parts.find((q) => q.life <= 0);
        if (!p) break;
        Object.assign(p, { life: 1, K, x: e.x + (Math.random() - 0.5) * 0.2, y: e.y, z: e.z + (Math.random() - 0.5) * 0.2, s: K.size * (0.8 + Math.random() * 0.4), seed: Math.random(),
          vx: (Math.random() - 0.3) * K.drift + 0.15, vz: (Math.random() - 0.5) * K.drift });
      }
    }
    const I = this.inst, C2 = this.inst2;
    for (let i = 0; i < this.n; i++) {
      const p = this.parts[i];
      if (p.life > 0) {
        const K = p.K;
        p.life -= dt / K.life;
        p.y += dt * K.rise * (0.6 + p.life * 0.6);
        p.x += dt * p.vx; p.z += dt * p.vz;
        p.s += dt * K.grow;
        const a = Math.max(0, p.life) * Math.min(1, (1 - p.life) * 6) * K.alpha;
        I.set([p.x, p.y, p.z, p.s], i * 4);
        C2.set([K.tint[0], K.tint[1], K.tint[2], a], i * 4);
      } else { I[i * 4 + 3] = 0; C2[i * 4 + 3] = 0; }
    }
    this.smokeGeo.attributes.aP.needsUpdate = true;
    this.smokeGeo.attributes.aC.needsUpdate = true;

    // 落叶：在附近树冠下生成
    for (let i = 0; i < this.nl; i++) {
      if (this.ll[i] <= 0) {
        if (Math.random() > dt * 0.6) continue;
        const near = this.trees.filter((q) => Math.abs(q.x - focus.x) < 45 && Math.abs(q.z - focus.z) < 45);
        if (!near.length) continue;
        const tr = near[Math.floor(Math.random() * near.length)];
        const a = Math.random() * 6.28, r = Math.random() * 2.6 * tr.s;
        this.lp.set([tr.x + Math.cos(a) * r, tr.y + (4 + Math.random() * 4) * tr.s, tr.z + Math.sin(a) * r], i * 3);
        this.lv.set([(Math.random() - 0.5) * 0.6 + 0.35, -(0.55 + Math.random() * 0.4), (Math.random() - 0.5) * 0.6], i * 3);
        this.ll[i] = 1;
        this.lk[i] = tr.type === 'sakura' ? 1 + Math.random() * 0.9 : tr.type === 'lilac' ? 2 + Math.random() * 0.9 : tr.type === 'goldTree' ? 3 + Math.random() * 0.9
          : tr.type === 'maple' ? 0.7 + Math.random() * 0.3 : tr.type === 'ginkgo' ? Math.random() * 0.3 : Math.random() * 0.66;
        if (this.lk[i] >= 1 && this.lk[i] < 3) this.lv[i * 3 + 1] *= 0.6;          // 花瓣更轻，飘得慢
        continue;
      }
      const k = i * 3;
      this.ll[i] -= dt / 9;
      const ph = t * 1.7 + i;
      this.lp[k] += (this.lv[k] + Math.sin(ph) * 0.6) * dt;
      this.lp[k + 1] += this.lv[k + 1] * dt;
      this.lp[k + 2] += (this.lv[k + 2] + Math.cos(ph * 0.8) * 0.5) * dt;
      if (this.lp[k + 1] < focus.y - 25) this.ll[i] = 0;
    }
    this.leafGeo.attributes.position.needsUpdate = true;
    this.leafGeo.attributes.aLife.needsUpdate = true;
    this.leafGeo.attributes.aKind.needsUpdate = true;

    // 灵草微光
    const herbs = this.glints.filter((h) => h.mesh.visible && Math.abs(h.x - focus.x) < 30 && Math.abs(h.z - focus.z) < 30);
    for (let i = 0; i < this.ng; i++) {
      if (this.gl[i] <= 0) {
        if (!herbs.length || Math.random() > dt * 1.6) { this.gl[i] = 0; continue; }
        const h = herbs[Math.floor(Math.random() * herbs.length)];
        this.gp.set([h.x + (Math.random() - 0.5) * 0.5, h.y + 0.15 + Math.random() * 0.3, h.z + (Math.random() - 0.5) * 0.5], i * 3);
        this.gl[i] = 1;
        this.gv[i] = 0.25 + Math.random() * 0.25;
        continue;
      }
      this.gl[i] -= dt / 1.8;
      this.gp[i * 3 + 1] += this.gv[i] * dt;
    }
    this.glintGeo.attributes.position.needsUpdate = true;
    this.glintGeo.attributes.aLife.needsUpdate = true;
  }
}
