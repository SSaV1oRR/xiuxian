// 近处的茵茵草地：角色周围约 26 米内的草地铺满细密的草丛，夹着成片的野花（白、粉、黄、淡紫），随风起伏，
// 远处由地表贴图接替（边缘按距离缩小淡出，不见接缝）。草地按 8 米见方的块生成，角色走动时只补新进入范围的块；
// 道路、石铺、田土、方砖、水面、陡坡、建筑占地、台阶与预留的空地都不长草（建筑占地等在载入时栅格化为 2 米网格，查表即得）。
import * as THREE from 'three';
import { mulberry32, createNoise2D } from '../core/math.js';
import { GLOBAL, applyFade } from './shaderlib.js';
import { CLEAR } from './layout.js';
import { CORE } from './terrain.js';

const TILE = 8, RES = 2;

// 一丛草：细长的叶片（基部暗、叶尖亮），flower 为真时叶丛里冒出几朵小花
function clumpGeometry(flower, seed) {
  const rand = mulberry32(seed), pos = [], col = [];
  const base = new THREE.Color(0x3f5130), tip = new THREE.Color(0x8fa25e), c = new THREE.Color();
  const n = flower ? 6 : 9;
  for (let b = 0; b < n; b++) {
    const a = rand() * Math.PI, w = 0.022 + rand() * 0.014, h = 0.22 + rand() * 0.26, lean = 0.06 + rand() * 0.14, ld = rand() * Math.PI * 2;
    const ox = (rand() - 0.5) * 0.34, oz = (rand() - 0.5) * 0.34, cx = Math.cos(a) * w, cz = Math.sin(a) * w;
    const tx = ox + Math.cos(ld) * lean, tz = oz + Math.sin(ld) * lean;
    c.copy(tip).multiplyScalar(0.85 + rand() * 0.3);
    pos.push(ox - cx, 0, oz - cz, ox + cx, 0, oz + cz, tx, h, tz);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, c.r, c.g, c.b);
  }
  if (flower) {
    const sets = [[0xf4f1ea, 0xe8e2f2], [0xeeb0c6, 0xf4d2de], [0xeed06a, 0xf2e2a0], [0xc2aaea, 0xdccff4]];
    const set = sets[seed % sets.length];
    for (let i = 0; i < 5; i++) {
      const x = (rand() - 0.5) * 0.36, z = (rand() - 0.5) * 0.36, y = 0.2 + rand() * 0.22, s = 0.045 + rand() * 0.02;
      c.set(set[i % 2]);
      // 花：两片交叉的小三角（俯看成星形），茎用一根细叶代替
      pos.push(x - s, y, z, x + s, y, z, x, y + s * 0.4, z + s * 1.1, x, y, z - s, x, y, z + s, x + s * 1.1, y + s * 0.4, z);
      for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
      pos.push(x - 0.006, 0, z, x + 0.006, 0, z, x, y, z);
      col.push(base.r, base.g, base.b, base.r, base.g, base.b, base.r, base.g, base.b);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const nrm = new Float32Array(pos.length); for (let i = 0; i < nrm.length; i += 3) nrm[i + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}

function lawnMaterial(focus, radius) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = GLOBAL.uTime; sh.uniforms.uFocus = focus; sh.uniforms.uR = { value: radius };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aP; attribute vec2 aR; uniform float uTime; uniform vec3 uFocus; uniform float uR; varying float vTint;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float c = cos(aR.x), s = sin(aR.x);
          float d = distance(aP.xz, uFocus.xz);
          float k = aP.w * (1. - smoothstep(uR * .72, uR, d));
          vec3 p = vec3(c * position.x - s * position.z, position.y, s * position.x + c * position.z) * k;
          float sw = (sin(uTime * 1.6 + aP.x * .21 + aP.z * .17) + .5 * sin(uTime * 2.9 + aP.x * .7)) * .07 * position.y * 2.;
          p.x += sw; p.z += sw * .6;
          transformed = p + aP.xyz;
          vTint = aR.y; }`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0., 1., 0.);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTint;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(1.), vec3(1.12, 1.06, .78), vTint);');
    applyFade(sh);
  };
  m.customProgramCacheKey = () => 'lawn';
  return m;
}

export class Lawn {
  constructor(scene, terrain, veg, { radius = 26, density = 3.2 } = {}) {
    this.T = terrain; this.veg = veg; this.R = radius; this.density = density;
    this.noise = createNoise2D(4242);
    this.focus = { value: new THREE.Vector3() };
    this.tiles = new Map();
    this.buildBlocked();
    const MAXG = Math.ceil(((2 * radius + TILE) / TILE) ** 2 * TILE * TILE * density), MAXF = Math.ceil(MAXG * 0.3);
    this.kinds = [
      { geo: clumpGeometry(false, 7), max: MAXG },
      { geo: clumpGeometry(true, 8), max: MAXF }, { geo: clumpGeometry(true, 9), max: MAXF }, { geo: clumpGeometry(true, 10), max: MAXF }, { geo: clumpGeometry(true, 11), max: MAXF },
    ];
    const mat = lawnMaterial(this.focus, radius);
    for (const k of this.kinds) {
      k.p = new Float32Array(k.max * 4); k.r = new Float32Array(k.max * 2);
      k.aP = new THREE.InstancedBufferAttribute(k.p, 4); k.aR = new THREE.InstancedBufferAttribute(k.r, 2);
      k.aP.setUsage(THREE.DynamicDrawUsage); k.aR.setUsage(THREE.DynamicDrawUsage);
      k.geo.setAttribute('aP', k.aP); k.geo.setAttribute('aR', k.aR);
      k.geo.instanceCount = 0;
      k.mesh = new THREE.Mesh(k.geo, mat);
      k.mesh.frustumCulled = false;
      k.mesh.receiveShadow = true;
      k.mesh.name = 'lawn';
      scene.add(k.mesh);
    }
    this.dirty = false;
    this.cx = null; this.cz = null;
  }

  // 不长草的范围栅格化（2 米网格）：建筑占地（外扩 0.5 米）、台阶、预留空地
  buildBlocked() {
    const w = Math.ceil((CORE.x1 - CORE.x0) / RES), h = Math.ceil((CORE.z1 - CORE.z0) / RES);
    const B = this.blocked = new Uint8Array(w * h);
    this.bw = w; this.bh = h;
    const mark = (x0, z0, x1, z1, test) => {
      const i0 = Math.max(0, Math.floor((x0 - CORE.x0) / RES)), i1 = Math.min(w - 1, Math.floor((x1 - CORE.x0) / RES));
      const j0 = Math.max(0, Math.floor((z0 - CORE.z0) / RES)), j1 = Math.min(h - 1, Math.floor((z1 - CORE.z0) / RES));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = CORE.x0 + (i + 0.5) * RES, z = CORE.z0 + (j + 0.5) * RES;
        if (!test || test(x, z)) B[j * w + i] = 1;
      }
    };
    for (const f of this.veg.footprints || []) {
      const c = Math.cos(f.ry || 0), s = Math.sin(f.ry || 0), hw = (f.w || 0) / 2 + 0.5, hd = (f.d || 0) / 2 + 0.5, e = Math.hypot(hw, hd);
      mark(f.x - e, f.z - e, f.x + e, f.z + e, (x, z) => { const dx = x - f.x, dz = z - f.z; return Math.abs(dx * c - dz * s) < hw + 1 && Math.abs(dx * s + dz * c) < hd + 1; });
    }
    for (const f of this.veg.stairFp || []) mark(f.x0, f.z0, f.x1, f.z1);
    for (const [x, z, r] of CLEAR) mark(x - r, z - r, x + r, z + r, (px, pz) => (px - x) ** 2 + (pz - z) ** 2 < r * r);
  }
  isBlocked(x, z) {
    const i = Math.floor((x - CORE.x0) / RES), j = Math.floor((z - CORE.z0) / RES);
    if (i < 0 || j < 0 || i >= this.bw || j >= this.bh) return true;
    return this.blocked[j * this.bw + i] === 1;
  }

  // 一块草地：按块坐标确定性地撒点（同一块每次生成都一样）
  makeTile(ti, tj) {
    const T = this.T, rand = mulberry32((ti * 73856093) ^ (tj * 19349663)), out = [[], [], [], [], []];
    const n = Math.round(TILE * TILE * this.density);
    for (let k = 0; k < n; k++) {
      const x = (ti + rand()) * TILE, z = (tj + rand()) * TILE;
      if (!T.inCore(x, z, 2) || this.isBlocked(x, z)) continue;
      const m = T.maskAt(x, z);
      if (m.r > 0.25 || m.g > 0.06 || m.b > 0.1 || m.a > 0.1) continue;
      if (T.waterAt(x, z) != null) continue;
      if (T.normalAt(x, z).y < 0.74) continue;
      const meadow = this.noise(x * 0.035 + 7, z * 0.035 - 3);
      const fl = meadow > 0.2 && rand() < (meadow - 0.2) * 0.9;
      const kind = fl ? 1 + Math.floor(((this.noise(x * 0.06 - 11, z * 0.06 + 2) + 1) * 0.5) * 3.999) : 0;
      out[kind].push(x, T.heightAt(x, z) - 0.02, z, 0.75 + rand() * 0.6, rand() * 6.283, Math.max(0, this.noise(x * 0.05, z * 0.05)) * 0.8 * rand());
    }
    return out;
  }

  update(focus) {
    this.focus.value.copy(focus);
    const ci = Math.floor(focus.x / TILE), cj = Math.floor(focus.z / TILE);
    const span = Math.ceil(this.R / TILE);
    // 新进入范围的块：每帧最多生成 3 块（不卡顿）
    let made = 0;
    const want = new Set();
    for (let j = cj - span; j <= cj + span; j++) for (let i = ci - span; i <= ci + span; i++) {
      const cxm = (i + 0.5) * TILE - focus.x, czm = (j + 0.5) * TILE - focus.z;
      if (cxm * cxm + czm * czm > (this.R + TILE * 0.75) ** 2) continue;
      const key = i * 100000 + j;
      want.add(key);
      if (!this.tiles.has(key) && made < 3) { this.tiles.set(key, this.makeTile(i, j)); made++; this.dirty = true; }
    }
    for (const key of this.tiles.keys()) if (!want.has(key)) { this.tiles.delete(key); this.dirty = true; }
    if (!this.dirty) return;
    this.dirty = false;
    // 把在用的块拼进实例缓冲
    for (let k = 0; k < this.kinds.length; k++) {
      const K = this.kinds[k];
      let c = 0;
      for (const t of this.tiles.values()) {
        const L = t[k];
        for (let q = 0; q < L.length && c < K.max; q += 6, c++) {
          K.p[c * 4] = L[q]; K.p[c * 4 + 1] = L[q + 1]; K.p[c * 4 + 2] = L[q + 2]; K.p[c * 4 + 3] = L[q + 3];
          K.r[c * 2] = L[q + 4]; K.r[c * 2 + 1] = L[q + 5];
        }
      }
      K.geo.instanceCount = c;
      K.aP.needsUpdate = true; K.aR.needsUpdate = true;
      K.aP.addUpdateRange?.(0, c * 4); K.aR.addUpdateRange?.(0, c * 2);
    }
  }

  setVisible(v) { for (const k of this.kinds) k.mesh.visible = v; }
}
