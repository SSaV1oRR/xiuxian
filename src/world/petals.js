// 樱花飘落：角色附近的樱花（与淡紫花树）树冠里不断落下花瓣，打着旋、随风斜飘，落地后渐隐；
// 微风也会把一些花瓣吹过附近的庭院与山路——走在宗门里时，周围总有几片花瓣在飘。
// 树下另铺一层落花（地面上的小花瓣，静态实例），越靠近树干越密。
// 花瓣与落花都用花树贴图集里的单片花瓣（tools/make_blossom_atlas.py 绘制），实例颜色染成樱粉或淡紫。
// 第十二轮加强「落樱」：
//   · 花瓣加大、加多，越近的花树落得越多（花树下站着时满眼是飘落的花瓣），镜头前也不时有花瓣飘过；
//   · 每隔十几二十秒一阵风（花吹雪）：风势骤起，枝头一下子吹落一大片花瓣，先被风托起、卷着斜飞，风过后才慢慢落下；
//     地上的花瓣也被风吹着贴地滑开；
//   · 落进水里的花瓣浮在水面，随风缓缓漂开，十来秒后才隐去；临水的樱花树下，水面上另漂着一层落花（着色器里缓缓漂动）。
import * as THREE from 'three';
import { ASSETS } from './assets.js';
import { BLOSSOM_CELLS } from './vegetation.js';
import { GLOBAL, applyFade } from './shaderlib.js';
import { mulberry32 } from '../core/math.js';

const TINTS = { sakura: [1.0, 0.8, 0.87], lilac: [0.86, 0.78, 1.0] };
const IDLE = 0, FALL = 1, GROUND = 2, FLOAT = 3;
const TAU = Math.PI * 2;

// kind：fall 飘落（自身卷曲翻动）、ground 地上落花、float 水面落花（世界坐标里缓缓漂动、随波起伏）
function petalMaterial(kind) {
  const m = new THREE.MeshStandardMaterial({ map: ASSETS.tex.blossom || null, roughness: 0.75, side: THREE.DoubleSide, alphaTest: 0.4 });
  const [u0, v0, du, dv] = BLOSSOM_CELLS.petal;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = GLOBAL.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_MAP
          vMapUv = vec2(${u0.toFixed(4)} + uv.x * ${du.toFixed(4)}, ${v0.toFixed(4)} + uv.y * ${dv.toFixed(4)});
        #endif`);
    // 飘落的花瓣自身轻微卷曲、翻动
    if (kind === 'fall') sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.z += sin(position.x * 9. + uTime * 6.) * .012;');
    // 水面落花：以各自的位置定相位，绕原处缓缓漂一个小圈，随波轻轻起伏
    if (kind === 'float') sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4(transformed, 1.0);
      vec2 ph = vec2(0.);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
        ph = instanceMatrix[3].xz;
      #endif
      { float a = uTime * .11 + dot(ph, vec2(.73, 1.31));
        mvPosition.xz += vec2(sin(a), cos(a * .83 + ph.x)) * .35;
        mvPosition.y += sin(uTime * 1.1 + ph.x * 3.7 + ph.y * 2.3) * .006; }
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * .18;');   // 花瓣透光
    applyFade(sh, { cut: false });
  };
  m.customProgramCacheKey = () => 'petal-' + kind;
  return m;
}

export class Petals {
  // ground(x, z, y)：y 以下最近的落脚面（第十三轮：浮空岛岛面也算，花瓣落在岛上而不是穿到谷底）
  constructor(scene, veg, terrain, { count = 2000, groundPer = 140, floatPer = 70, active = true, ground = null } = {}) {
    this.veg = veg; this.terrain = terrain;
    this.groundFn = ground || ((x, z) => terrain.heightAt(x, z));
    this.sources = [];
    for (const type of ['sakura', 'lilac']) for (const it of veg.items[type] || []) this.sources.push({ x: it.x, y: it.y, z: it.z, s: it.s, type });
    this.active = active && this.sources.length > 0 && !!ASSETS.tex.blossom;
    if (!this.active) return;
    const geo = new THREE.PlaneGeometry(0.16, 0.13, 2, 1);
    // ---------- 飘落的花瓣 ----------
    this.n = count;
    this.mesh = new THREE.InstancedMesh(geo, petalMaterial('fall'), count);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.renderOrder = 4;
    this.p = new Float32Array(count * 3); this.vy = new Float32Array(count); this.wk = new Float32Array(count);
    this.rot = new Float32Array(count * 3); this.spin = new Float32Array(count * 3);
    this.sc = new Float32Array(count);           // 大小
    this.st = new Uint8Array(count);             // IDLE 空闲、FALL 飘落中、GROUND 落地、FLOAT 浮在水面
    this.age = new Float32Array(count);          // 落地 / 落水后的秒数
    this.wl = new Float32Array(count);           // 落水处的水面高
    this.col = new THREE.Color();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) { this.mesh.setMatrixAt(i, zero); this.mesh.setColorAt(i, this.col.setRGB(1, 0.85, 0.9)); }
    scene.add(this.mesh);
    // ---------- 树下的落花；临水樱花树下水面上的落花 ----------
    const rand = mulberry32(77);
    const list = [], floatList = [];
    const wet = (x, z) => terrain.waterAt?.(x, z) != null;
    for (const src of this.sources) {
      const n = Math.round(groundPer * src.s);
      for (let k = 0; k < n; k++) {
        const r = Math.pow(rand(), 0.7) * 4.2 * src.s, a = rand() * TAU;
        const x = src.x + Math.cos(a) * r, z = src.z + Math.sin(a) * r;
        if (wet(x, z)) continue;
        const gy = terrain.inCore?.(x, z) ? veg.groundY(x, z) : this.groundFn(x, z, src.y + 2);
        if (!(gy > -1e8) || Math.abs(gy - src.y) > 3) continue;
        list.push([x, gy + 0.025 + rand() * 0.01, z, rand() * TAU, 0.75 + rand() * 0.6, src.type]);
      }
      if (src.type !== 'sakura') continue;
      // 水面落花：树冠外沿再往外几米内的水面上（多试几次，取够为止；离岸至少一米多，漂动的小圈不碰池岸）
      const nf = Math.round(floatPer * src.s);
      for (let k = 0, got = 0; k < nf * 6 && got < nf; k++) {
        const r = 1.5 + Math.pow(rand(), 0.8) * 9 * src.s, a = rand() * TAU;
        const x = src.x + Math.cos(a) * r, z = src.z + Math.sin(a) * r;
        if (!wet(x, z) || !wet(x + 1.3, z) || !wet(x - 1.3, z) || !wet(x, z + 1.3) || !wet(x, z - 1.3)) continue;
        floatList.push([x, terrain.waterAt(x, z) + 0.012, z, rand() * TAU, 0.8 + rand() * 0.6, src.type]);
        got++;
      }
    }
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
    const layer = (arr, kind, tilt) => {
      const im = new THREE.InstancedMesh(geo, petalMaterial(kind), Math.max(1, arr.length));
      im.count = arr.length;
      arr.forEach(([x, y, z, ry, sc, type], i) => {
        Q.setFromEuler(E.set(-Math.PI / 2 + (rand() - 0.5) * tilt, 0, ry, 'XYZ'));
        im.setMatrixAt(i, M.compose(P.set(x, y, z), Q, S.set(sc, sc, sc)));
        const t = TINTS[type], k = 0.88 + rand() * 0.2;
        im.setColorAt(i, this.col.setRGB(t[0] * k, t[1] * k, t[2] * k));
      });
      im.receiveShadow = true;
      im.computeBoundingSphere();
      im.name = 'petals-' + kind;
      im.userData.noSolid = true;                 // 贴地的落花不进御剑碰撞（分层实心柱）
      scene.add(im);
      return im;
    };
    this.ground = layer(list, 'ground', 0.3);
    this.floating = layer(floatList, 'float', 0.08);
    this.floating.frustumCulled = false;          // 着色器里漂动，包围球按原处算
    this._m = M; this._q = Q; this._e = E; this._s = S; this._v = P;
    this.wind = new THREE.Vector2(0.55, 0.25);
    this.acc = 0;
    this.gust = 0; this.gustT = 6; this.gustAge = 99;
    this._fw = new THREE.Vector3();
  }

  setVisible(v) { if (!this.active) return; this.mesh.visible = v; this.ground.visible = v; this.floating.visible = v; }

  // 生成一片：多半从附近的树冠里落下（越近的树越常落）；也有风从上风处带来的，和花树近旁、在镜头前飘过的
  spawn(i, focus, eye) {
    const near = this.near, k = i * 3, g = this.gust;
    if (!near.length) return false;
    const src = near[Math.floor(Math.random() * near.length)];
    const roll = Math.random(), eyeShare = this.n25 ? 0.34 : this.n60 ? 0.1 : 0;
    if (roll < eyeShare && eye) {
      // 镜头前：前方 3–14 米、左右各 7 米、高出镜头 1.5–6 米处飘下
      const f = this._fw, d = 3 + Math.random() * 11, side = (Math.random() - 0.5) * 14;
      this.p[k] = eye.x + f.x * d - f.z * side; this.p[k + 2] = eye.z + f.z * d + f.x * side;
      this.p[k + 1] = eye.y + 1.5 + Math.random() * 4.5;
    } else if (roll < eyeShare + 0.12 + 0.2 * g) {
      // 风带来的：从上风处更高的地方飘来
      this.p[k] = focus.x - this.wind.x * 12 + (Math.random() - 0.5) * 30; this.p[k + 2] = focus.z - this.wind.y * 12 + (Math.random() - 0.5) * 30;
      this.p[k + 1] = Math.max(focus.y, this.terrain.heightAt(this.p[k], this.p[k + 2])) + 3 + Math.random() * 4;
    } else {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 3.4 * src.s;
      this.p[k] = src.x + Math.cos(a) * r; this.p[k + 1] = src.y + (2.2 + Math.random() * 3.0) * src.s; this.p[k + 2] = src.z + Math.sin(a) * r;
    }
    this.wk[i] = 0.6 + Math.random() * 0.8;
    this.vy[i] = -(0.5 + Math.random() * 0.4);
    this.sc[i] = 0.8 + Math.random() * 0.5;
    for (let j = 0; j < 3; j++) { this.rot[k + j] = Math.random() * TAU; this.spin[k + j] = (Math.random() - 0.5) * 7; }
    this.st[i] = FALL; this.age[i] = 0;
    const t = TINTS[src.type], b = 0.9 + Math.random() * 0.18;
    this.mesh.setColorAt(i, this.col.setRGB(t[0] * b, t[1] * b, t[2] * b));
    return true;
  }

  update(dt, focus, t, camera = null) {
    if (!this.active || !this.mesh.visible) return;
    // 附近（80 米内）的花树，按距离加权：越近越常落；顺带数一数 25 米、60 米内的花树
    if (!this.near || (this.nearT = (this.nearT || 0) - dt) <= 0) {
      this.nearT = 0.5;
      this.near = [];
      let n25 = 0, n60 = 0;
      for (const s of this.sources) {
        const d = Math.hypot(s.x - focus.x, s.z - focus.z);
        if (d < 80) { const w = d < 20 ? 8 : d < 40 ? 3 : 1; for (let k = 0; k < w; k++) this.near.push(s); }
        if (d < 25) n25++;
        if (d < 60) n60++;
      }
      this.n25 = n25; this.n60 = n60;
    }
    // 阵风（花吹雪）：每隔 14–26 秒一阵，0.8 秒起势、持续 2.5 秒、2.2 秒平息
    if ((this.gustT -= dt) <= 0) { this.gustT = 14 + Math.random() * 12; this.gustAge = 0; }
    const ga = (this.gustAge += dt);
    const gust = ga < 0.8 ? ga / 0.8 : ga < 3.3 ? 1 : Math.max(0, 1 - (ga - 3.3) / 2.2);
    this.gust = gust;
    // 风：缓慢转向、时强时弱，阵风时骤强
    this.wind.set(Math.cos(t * 0.05) * 0.6 + 0.2, Math.sin(t * 0.037) * 0.5 + 0.15).multiplyScalar((0.8 + 0.4 * Math.sin(t * 0.21)) * (1 + 2.4 * gust));
    // 每秒新生的花瓣：随近处花树多少而定，阵风时成倍。平时的上限按花瓣池平均每片约占 14 秒算（池里留出三成，阵风时一下子吹落）
    const base = this.near.length ? Math.min(this.n / 14, 20 + 20 * this.n25 + 2.5 * this.n60) : 0;
    this.acc += base * (1 + 3.5 * gust) * dt;
    const eye = camera ? camera.position : null;
    if (camera) { camera.getWorldDirection(this._fw); this._fw.y = 0; if (this._fw.lengthSq() < 1e-4) this._fw.set(0, 0, -1); this._fw.normalize(); }
    const M = this._m, Q = this._q, E = this._e, S = this._s, P = this._v, T = this.terrain;
    const wx = this.wind.x, wz = this.wind.y;
    let colorDirty = false;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      let st = this.st[i];
      if (st === IDLE) {
        if (this.acc >= 1 && this.spawn(i, focus, eye)) { this.acc -= 1; colorDirty = true; st = FALL; } else continue;
      }
      let sc = this.sc[i];
      if (st === FALL) {
        // 下落：打着旋，左右摆荡，随风飘；阵风里先被托起、斜飞
        const sway = Math.sin(t * 2.1 + i * 1.7) * 0.55, sway2 = Math.cos(t * 1.7 + i * 2.3) * 0.45, wk = this.wk[i];
        const lift = gust * (0.35 + 0.5 * Math.sin(t * 2.7 + i * 0.9));
        this.p[k] += (wx * wk + sway) * dt; this.p[k + 1] += (this.vy[i] + lift) * dt; this.p[k + 2] += (wz * wk + sway2) * dt;
        for (let j = 0; j < 3; j++) this.rot[k + j] += this.spin[k + j] * dt * (1 + gust);
        const x = this.p[k], z = this.p[k + 2], w = T.waterAt(x, z);
        if (w != null && this.p[k + 1] <= w + 0.015) {
          this.p[k + 1] = w + 0.012; this.wl[i] = w; this.st[i] = FLOAT; this.age[i] = 0; this.rot[k] = -Math.PI / 2; this.rot[k + 1] = 0;
        } else if (w == null) {
          const g = this.groundFn(x, z, this.p[k + 1]);
          if (this.p[k + 1] <= g + 0.03) { this.p[k + 1] = g + 0.03; this.st[i] = GROUND; this.age[i] = 0; this.rot[k] = -Math.PI / 2; this.rot[k + 1] = 0; }
        }
        if (Math.hypot(this.p[k] - focus.x, this.p[k + 2] - focus.z) > 90) { this.st[i] = IDLE; this.mesh.setMatrixAt(i, M.makeScale(0, 0, 0)); continue; }
      } else if (st === GROUND) {
        // 落地：约 3 秒后 2.5 秒内缩没；阵风里贴地滑开
        const a = (this.age[i] += dt);
        if (gust > 0.05) {
          const nx = this.p[k] + wx * 0.6 * gust * dt, nz = this.p[k + 2] + wz * 0.6 * gust * dt;
          const g2 = this.groundFn(nx, nz, this.p[k + 1] + 0.3);
          if (T.waterAt(nx, nz) == null && Math.abs(g2 - this.p[k + 1]) < 0.4) { this.p[k] = nx; this.p[k + 2] = nz; this.p[k + 1] = g2 + 0.03; this.rot[k + 2] += gust * 3 * dt; }
        }
        if (a > 5.5) { this.st[i] = IDLE; this.mesh.setMatrixAt(i, M.makeScale(0, 0, 0)); continue; }
        if (a > 3) sc *= 1 - (a - 3) / 2.5;
      } else {
        // 浮在水面：随风缓缓漂开、随波起伏，约 9 秒后 3 秒内隐去；漂到岸边就停住
        const a = (this.age[i] += dt);
        const nx = this.p[k] + (wx * 0.14 + Math.sin(t * 0.4 + i) * 0.05) * dt, nz = this.p[k + 2] + (wz * 0.14 + Math.cos(t * 0.33 + i) * 0.05) * dt;
        if (T.waterAt(nx, nz) != null) { this.p[k] = nx; this.p[k + 2] = nz; }
        this.p[k + 1] = this.wl[i] + 0.012 + Math.sin(t * 1.3 + i) * 0.006;
        this.rot[k + 2] += 0.15 * dt;
        if (a > 12) { this.st[i] = IDLE; this.mesh.setMatrixAt(i, M.makeScale(0, 0, 0)); continue; }
        if (a > 9) sc *= 1 - (a - 9) / 3;
      }
      Q.setFromEuler(E.set(this.rot[k], this.rot[k + 1], this.rot[k + 2]));
      this.mesh.setMatrixAt(i, M.compose(P.set(this.p[k], this.p[k + 1], this.p[k + 2]), Q, S.set(sc, sc, sc)));
    }
    this.acc = Math.min(this.acc, 30);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (colorDirty) this.mesh.instanceColor.needsUpdate = true;
  }
}
