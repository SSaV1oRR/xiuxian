// 丹房室内：可以走进去的屋子。独立场景，第一次推门时才搭建并载入陈设模型；尺寸与屋外一致
// （面阔五间 15 米、进深 8.4 米、柱高 4.3 米，墙厚 0.4 米 → 室内净空 14.6 × 8 米），朝向一致（门在南墙正中）。
// 布局：正中八卦炉台与青铜丹炉；北墙一整面百子药柜，柜上「炉火纯青」匾；东北角砖砌煎药灶连着屋外看得见的烟囱；
// 东墙多宝格摆满药瓶药罐；南墙东间长案（丹方手记、戥子、药碾）；西间是起居一角（罗汉床、茶几、屏风、山水挂轴）。
// 光：阳光（或月光）只从敞开的门与两扇支起的窗照进来，在地上投出光斑，空中有光柱与浮尘；炉火、灶火、宫灯是暖色点光。
// 门外的景色：推门时从门口向外拍下当时的宗门画面，贴在门外，屋里回头能看到庭院。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Builder, C } from './arch/builder.js';
import { beam, plaqueMesh } from './arch/arch.js';
import { mortar, basket, waterJar } from './arch/props.js';
import * as IP from './interiorProps.js';
import { CollisionWorld } from '../core/collision.js';
import { skyState } from './time.js';
import { GLOBAL, NOISE_GLSL } from './shaderlib.js';
import { ASSETS } from './assets.js';
import { mulberry32, clamp, lerp, damp } from '../core/math.js';

export const IY = -600;                              // 室内场景整体位于地表之下 600 米：与地表、秘境的互动点互不重叠
const R = { x0: -7.3, x1: 7.3, z0: -4.0, z1: 4.0 };   // 墙内皮
const COL_H = 4.3, WALL_T = 0.4;
const DOOR = { hw: 1.32, y0: 0.2, y1: 3.05 };        // 南墙正中的门洞（门槛 0.2 米）
const WINS = [-3, 3];                                 // 支起的窗：南墙第二、四间（窗洞）
const WIN = { hw: 1.22, y0: 0.95, y1: 2.95 };
export const FURNACE = { x: 0, z: -0.7, s: 0.82, y: 0.34 };    // 炉台中心；丹炉按 0.82 缩放（总高约 2.7 米），立在两级炉台上
export const ALCHEMY_ENTRY = { x: 0, z: 2.2, yaw: Math.PI };   // 进门站定，面向丹炉
const BASE = './assets/converted/interior/';
const MODELS = ['chinese_cabinet', 'chinese_screen_panels', 'chinese_sofa', 'chinese_stool', 'chinese_tea_table', 'chinese_armchair',
  'chinese_console_table', 'chinese_chandelier', 'ceramic_vase_01', 'ceramic_vase_02', 'ceramic_vase_04', 'antique_ceramic_vase_01',
  'brass_pot_01', 'wooden_bowl_02', 'wicker_basket_02', 'painted_wooden_shelves', 'planter_pot_clay', 'wooden_candlestick',
  'food_ginger_01', 'carved_wooden_plate', 'ceramic_pot', 'brass_vase_03', 'potted_plant_04', 'potions'];

// 室内的互动点（本地坐标，y 为地面以上）——Game 据此注册（世界 y = IY + y）
export const ALCHEMY_SPOTS = {
  exit: { x: 0, y: 0, z: 3.35, r: 1.7 },
  furnace: { x: 0, y: 0, z: 1.15, r: 2.0 },
  cabinet: { x: -2.9, y: 0, z: -2.9, r: 1.9 },
  cabinet2: { x: 2.9, y: 0, z: -2.9, r: 1.9 },
  notes: { x: 3.0, y: 0, z: 2.75, r: 1.6 },
  shelf: { x: 6.3, y: 0, z: 0.9, r: 1.9 },
  stove: { x: 6.0, y: 0, z: -0.45, r: 1.6 },
  bed: { x: -5.6, y: 0, z: 1.5, r: 1.6 },
  painting: { x: -6.1, y: 0, z: -0.6, r: 1.4 },
};

// 室内的环境反光：暖色墙面、南面明亮的门窗（PMREM 预滤波）
function roomEnvironment(renderer) {
  const s = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 9), new THREE.MeshBasicMaterial({ color: 0x4a3a2c, side: THREE.BackSide }));
  box.position.y = 3; s.add(box);
  const lit = (w, h, c, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.y = ry; s.add(m); };
  lit(2.6, 2.8, 0xfff1d8, 0, 1.6, 4.4); lit(2.4, 2, 0xe8e4d8, -3, 1.9, 4.4); lit(2.4, 2, 0xe8e4d8, 3, 1.9, 4.4);
  lit(8, 1, 0x9a8a70, 0, 2.6, -4.4); lit(1.4, 1.4, 0xff8a40, 0, 1, -0.7);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.04);
  pm.dispose();
  return rt.texture;
}

// 门窗洞里的光柱：每个洞口一块柱体，片元沿视线步进，按「沿光线方向投回洞口平面、落在洞口之内」累积散射
function shaftMaterial(rect, steps) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: new THREE.Vector3(0, 1, 1) }, uCol: { value: new THREE.Color(1, 0.9, 0.7) }, uK: { value: 0 },
      uC: { value: rect.c }, uEx: { value: rect.ex }, uEy: { value: rect.ey }, uN: { value: rect.n },
      uRoom: { value: new THREE.Vector4(R.x0 + 0.05, R.x1 - 0.05, R.z0 + 0.05, R.z1 + 0.6) }, uFloor: { value: IY }, uTop: { value: IY + 4.3 },
      uCamIn: { value: 0 }, uTime: GLOBAL.uTime,
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform vec3 uSun, uCol, uC, uEx, uEy, uN; uniform vec4 uRoom; uniform float uK, uFloor, uTop, uCamIn, uTime;
      varying vec3 vW;
      ${NOISE_GLSL}
      float lit(vec3 p){
        float s = dot(uC - p, uN) / dot(uSun, uN);           // 沿光线方向回到洞口平面的距离（>0：洞口在光源一侧）
        if (s < 0.) return 0.;
        vec3 q = p + uSun * s - uC;
        vec2 uv = vec2(dot(q, uEx) / dot(uEx, uEx), dot(q, uEy) / dot(uEy, uEy));
        float a = smoothstep(1., .82, abs(uv.x)) * smoothstep(1., .86, abs(uv.y));
        float inRoom = step(uRoom.x, p.x) * step(p.x, uRoom.y) * step(uRoom.z, p.z) * step(p.z, uRoom.w) * step(uFloor, p.y) * step(p.y, uTop);
        return a * inRoom * (1. - exp(-s * .9));             // 洞口处薄、向里渐浓
      }
      void main(){
        if (!gl_FrontFacing && uCamIn < .5) discard;
        vec3 ro = gl_FrontFacing ? vW : cameraPosition;
        vec3 rd = normalize(vW - cameraPosition);
        float tmax = gl_FrontFacing ? 9. : length(vW - cameraPosition);
        float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
        float acc = 0.;
        for (int i = 0; i < ${steps}; i++) {
          float t = (float(i) + j) / ${steps}. * tmax;
          vec3 p = ro + rd * t;
          float dust = .65 + .35 * nzv(p.xz * 1.7 + vec2(uTime * .05, p.y * 1.3));
          acc += lit(p) * dust;
        }
        acc *= tmax / ${steps}.;
        gl_FragColor = vec4(uCol * acc * uK, 1.);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// 柔软的圆点精灵贴图（烟、蒸汽、浮尘、火星）
function softDot(size = 64, k = 2.2) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (let i = 0; i <= 8; i++) { const t = i / 8; gr.addColorStop(t, `rgba(255,255,255,${Math.pow(1 - t, k)})`); }
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 粒子（烟、蒸汽）：点精灵，按年龄上升、扩散、渐隐
class Puffs {
  constructor(scene, n, tex, { color = 0xd8d2c8, size = 0.5, additive = false, opacity = 0.35 } = {}) {
    this.n = n; this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.age = new Float32Array(n).fill(-1); this.life = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3); this.alpha = new THREE.BufferAttribute(new Float32Array(n), 1); this.sz = new THREE.BufferAttribute(new Float32Array(n), 1);
    g.setAttribute('position', this.pos); g.setAttribute('alpha', this.alpha); g.setAttribute('size', this.sz);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, uCol: { value: new THREE.Color(color) }, uOp: { value: opacity }, uScale: { value: 600 } },
      vertexShader: `attribute float alpha; attribute float size; varying float vA; uniform float uScale;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); vA = alpha; gl_PointSize = size * uScale / max(-mv.z, .1); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 uCol; uniform float uOp; varying float vA;
        void main(){ float a = texture2D(map, gl_PointCoord).a * vA * uOp; if (a < .004) discard; gl_FragColor = vec4(uCol, a); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
    this.acc = 0;
  }
  // emit(i)：由调用方设置初始位置与速度
  update(dt, rate, emit, { grow = 1.2, rise = 0, drag = 0.4, fadeIn = 0.15 } = {}) {
    this.acc += rate * dt;
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] < 0) {
        if (this.acc >= 1) { this.acc -= 1; this.age[i] = 0; emit(i, this.p, this.v); this.life[i] = this.life[i] || 3; } else { this.alpha.array[i] = 0; continue; }
      }
      this.age[i] += dt;
      const k = i * 3, u = this.age[i] / this.life[i];
      if (u >= 1) { this.age[i] = -1; this.alpha.array[i] = 0; continue; }
      this.v[k + 1] += rise * dt;
      const f = Math.exp(-drag * dt);
      this.v[k] *= f; this.v[k + 2] *= f;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      this.pos.array[k] = this.p[k]; this.pos.array[k + 1] = this.p[k + 1]; this.pos.array[k + 2] = this.p[k + 2];
      this.alpha.array[i] = Math.min(1, u / fadeIn) * (1 - u) * (1 - u);
      this.sz.array[i] = this.base?.[i] ? this.base[i] * (1 + u * grow) : (1 + u * grow);
    }
    this.acc = Math.min(this.acc, 4);
    this.pos.needsUpdate = true; this.alpha.needsUpdate = true; this.sz.needsUpdate = true;
  }
}

export class Interior {
  constructor(renderer, { quality = 'mid' } = {}) {
    this.renderer = renderer;
    this.quality = quality;
    this.ready = false;
    this.bounds = { x0: R.x0 - 5, x1: R.x1 + 5, z0: R.z0 - 5, z1: R.z1 + 5 };      // 角色位置的夹取范围（各边内缩 4 米后仍包住整间屋）
    this.cw = new CollisionWorld(8);
    this.models = {};
    this.flick = [];
  }

  preload(gentle = false) { return (this.loadJob ||= this.load(gentle)); }

  async ensure() {
    if (this.ready) return this;
    this.hurry = true;
    this.job ||= this.preload().then(() => this.load()).then(async () => {
      this.build();
      // 着色器预编译（并行编译扩展可用时不阻塞），避免进门后第一帧卡顿
      const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 100);
      cam.position.set(0, IY + 1.6, 3); cam.lookAt(0, IY + 1.2, -2);
      try { await this.renderer.compileAsync?.(this.scene, cam); } catch (e) { /* 不支持时第一帧再编译 */ }
      this.ready = true;
    });
    try { await this.job; } catch (e) { this.job = null; throw e; }
    return this;
  }

  // gentle：在后台逐个取回（每件之间让出空闲时间），避免游玩中集中解析造成卡顿；推门时若尚未取完则并行取回剩下的
  async load(gentle = false) {
    const loader = new GLTFLoader();
    const one = (m) => (this.models[m] ? null : ASSETS.models[m] ? ((this.models[m] = ASSETS.models[m].scene), null)
      : loader.loadAsync(BASE + m + '.glb').then((g) => { this.models[m] = g.scene; }).catch((e) => console.info('室内陈设未能载入：', m, e.message)));
    if (gentle) {
      for (const m of MODELS) {
        if (this.hurry) break;
        await one(m);
        await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 600 }) : setTimeout(r, 120)));
      }
    }
    await Promise.all(MODELS.map(one));
  }

  // ---------- 搭建 ----------
  build() {
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0907);
    this.env = roomEnvironment(this.renderer);
    scene.environment = this.env;
    const root = this.root = new THREE.Group();
    root.position.y = IY;
    scene.add(root);
    const rand = mulberry32(911);
    const b = new Builder();
    this.labels = [];
    this.buildShell(b, rand);
    this.buildFixtures(b, rand);
    const g = b.build({ shadows: true, name: 'alchemy-interior' });
    root.add(g, this.furnaceGroup);
    this.cw.addLocal(b.cols, 0, IY, 0, 0);
    root.add(IP.labelMesh(this.labels));
    this.buildFloor();
    this.buildWindows();
    this.placeModels(rand);
    this.buildLights();
    this.buildEffects();
    this.buildBackdrop();
    // 室外不可走：墙外一律视为墙
    this.cw.addBox({ x: 0, z: R.z0 - 0.6, y0: IY, y1: IY + 6, hx: 9, hz: 0.6 });
    this.cw.addBox({ x: R.x0 - 0.6, z: 0, y0: IY, y1: IY + 6, hx: 0.6, hz: 6 });
    this.cw.addBox({ x: R.x1 + 0.6, z: 0, y0: IY, y1: IY + 6, hx: 0.6, hz: 6 });
    scene.traverse((o) => { if (o.isMesh && o.userData.noShadow !== true && !o.userData.shaft) { o.receiveShadow = true; } });
  }

  // 墙、柱、梁架、屋面、门窗洞
  buildShell(b, rand) {
    const H = COL_H, wh = H;
    const dado = 0x4a3428, plaster = 0xe2d9c6, colC = C.woodRed, beamC = C.woodDark;
    // 墙段：下为木护墙板（裙板），上为粉墙；open 为洞口区间（沿墙方向）
    const wall = (alongX, fixed, a0, a1, holes = []) => {
      const segs = [];
      let s = a0;
      for (const [h0, h1, y0, y1] of holes.sort((p, q) => p[0] - q[0])) { if (h0 > s) segs.push([s, h0, 0, wh]); segs.push([h0, h1, 0, y0], [h0, h1, y1, wh]); s = h1; }
      if (s < a1) segs.push([s, a1, 0, wh]);
      for (const [u0, u1, y0, y1] of segs) {
        if (y1 - y0 < 0.01 || u1 - u0 < 0.01) continue;
        const L = u1 - u0, c = (u0 + u1) / 2;
        const put = (h, ya, color, mat) => { if (h <= 0.001) return; if (alongX) b.slab(L, h, WALL_T, color, c, ya, fixed, { mat }); else b.slab(WALL_T, h, L, color, fixed, ya, c, { mat }); };
        const d1 = Math.min(y1, 0.95);
        if (d1 > y0) put(d1 - y0, y0, dado, 'wood');
        if (y1 > Math.max(y0, 0.95)) put(y1 - Math.max(y0, 0.95), Math.max(y0, 0.95), plaster, 'std');
      }
      // 墙裙压条
      if (alongX) b.box(a1 - a0, 0.06, 0.05, beamC, (a0 + a1) / 2, 0.95, fixed + (fixed > 0 ? -1 : 1) * (WALL_T / 2 + 0.02), { col: false, mat: 'wood' });
      else b.box(0.05, 0.06, a1 - a0, beamC, fixed + (fixed > 0 ? -1 : 1) * (WALL_T / 2 + 0.02), 0.95, (a0 + a1) / 2, { col: false, mat: 'wood' });
    };
    const zf = R.z1 + WALL_T / 2, zb = R.z0 - WALL_T / 2, xw = R.x0 - WALL_T / 2, xe = R.x1 + WALL_T / 2;
    wall(true, zb, xw - WALL_T / 2, xe + WALL_T / 2);
    wall(false, xw, zb, zf);
    wall(false, xe, zb, zf);
    wall(true, zf, xw - WALL_T / 2, xe + WALL_T / 2, [[-DOOR.hw, DOOR.hw, 0, DOOR.y1], ...WINS.map((x) => [x - WIN.hw, x + WIN.hw, WIN.y0, WIN.y1])]);
    // 门洞空着、门槛另做：门洞处的墙体碰撞去掉（墙段已分开），门槛可跨
    b.slab(DOOR.hw * 2, DOOR.y0, WALL_T, beamC, 0, 0, zf, { mat: 'wood', walk: true });
    b.box(DOOR.hw * 2 + 0.24, 0.16, WALL_T + 0.1, beamC, 0, DOOR.y1 + 0.08, zf, { col: false, mat: 'wood' });
    for (const s of [-1, 1]) b.box(0.12, DOOR.y1, WALL_T + 0.08, beamC, s * (DOOR.hw + 0.06), DOOR.y1 / 2, zf, { col: false, mat: 'wood' });
    // 门扇：两侧各一对，向内开到贴近墙面
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
      const lw = 0.64, hinge = s * DOOR.hw, a = -s * (Math.PI / 2 - 0.22 - k * 0.12);
      b.push(hinge, DOOR.y0, R.z1 - 0.04, a);
      const cx = -s * (lw / 2 + k * 0.05);
      b.box(lw, 2.82, 0.05, C.woodRed, cx, 1.41, -k * 0.06, { col: false, mat: 'wood' });
      b.panel(lw - 0.12, 1.5, C.paper, cx, 1.9, -k * 0.06 - 0.03, { ry: Math.PI });
      b.panel(lw - 0.12, 1.5, C.paper, cx, 1.9, -k * 0.06 + 0.03);
      b.pop();
    }
    // 窗洞：窗台、窗框；窗扇支在洞外上方（支摘窗）
    for (const x of WINS) {
      b.slab(WIN.hw * 2 + 0.2, 0.06, WALL_T + 0.12, beamC, x, WIN.y0 - 0.06, zf, { col: false, mat: 'wood' });
      b.box(WIN.hw * 2 + 0.2, 0.1, WALL_T + 0.06, beamC, x, WIN.y1 + 0.05, zf, { col: false, mat: 'wood' });
      for (const s of [-1, 1]) b.box(0.1, WIN.y1 - WIN.y0, WALL_T + 0.06, beamC, x + s * (WIN.hw + 0.05), (WIN.y0 + WIN.y1) / 2, zf, { col: false, mat: 'wood' });
      b.cyl(0.02, 0.02, 1.2, C.woodLight, x + WIN.hw * 0.8, WIN.y0 + 0.45, zf + 0.62, { rx: -0.55, col: false, seg: 5, mat: 'wood' });   // 支窗的撑杆
    }
    // 柱：半露于墙面（与屋外柱网一致：面阔每 3 米一柱，山墙中柱）
    const colAt = [];
    for (let i = 0; i <= 5; i++) { const x = -7.5 + i * 3; colAt.push([x, R.z0 + 0.06], [x, R.z1 - 0.06]); }
    for (const [x, z] of colAt) {
      const cx = clamp(x, R.x0 + 0.1, R.x1 - 0.1);
      b.cyl(0.2, 0.22, H, colC, cx, H / 2, z, { seg: 14, mat: 'wood', col: false });
      b.cyl(0.3, 0.32, 0.18, C.stoneWarm, cx, 0.09, z, { seg: 12, mat: 'stoneSmooth', col: false });
    }
    // 额枋（沿墙一周）与五架梁、瓜柱、三架梁、脊瓜柱
    for (const z of [R.z0 + 0.08, R.z1 - 0.08]) b.box(R.x1 - R.x0, 0.42, 0.24, beamC, 0, H - 0.21, z, { col: false, mat: 'wood' });
    for (const x of [R.x0 + 0.08, R.x1 - 0.08]) b.box(0.24, 0.42, R.z1 - R.z0, beamC, x, H - 0.21, 0, { col: false, mat: 'wood' });
    const Y = { eave: 4.95, mid: 5.95, ridge: 7.15 }, ZM = 2.1;
    for (const x of [-4.5, -1.5, 1.5, 4.5]) {
      b.box(0.34, 0.5, R.z1 - R.z0 + 0.4, beamC, x, H + 0.25, 0, { col: false, mat: 'wood' });
      for (const s of [-1, 1]) b.box(0.2, Y.mid - H - 0.5 - 0.35, 0.2, beamC, x, (H + 0.5 + Y.mid - 0.35) / 2, s * ZM, { col: false, mat: 'wood' });
      b.box(0.3, 0.38, ZM * 2 + 0.4, beamC, x, Y.mid - 0.35 + 0.19 - 0.19, 0, { col: false, mat: 'wood' });
      b.box(0.18, Y.ridge - Y.mid - 0.1, 0.18, beamC, x, (Y.mid + Y.ridge) / 2 - 0.1, 0, { col: false, mat: 'wood' });
      // 角背、叉手
      for (const s of [-1, 1]) beam(b, x, Y.mid - 0.2, s * 0.9, x, Y.ridge - 0.25, s * 0.12, 0.1, beamC, 'wood');
    }
    // 檩（圆木，通面阔）与椽、望板
    const purl = [[R.z0 - 0.15, Y.eave - 0.2], [-ZM, Y.mid], [0, Y.ridge], [ZM, Y.mid], [R.z1 + 0.15, Y.eave - 0.2]];
    for (const [z, y] of purl) b.cyl(0.14, 0.14, R.x1 - R.x0 + 0.6, beamC, 0, y, z, { rz: Math.PI / 2, col: false, seg: 10, mat: 'wood' });
    const slopes = [[purl[0], purl[1]], [purl[1], purl[2]], [purl[3], purl[2]], [purl[4], purl[3]]];
    for (const [[za, ya], [zb2, yb]] of slopes) {
      const L = Math.hypot(zb2 - za, yb - ya), ang = Math.atan2(yb - ya, zb2 - za);
      for (let x = R.x0 + 0.1; x <= R.x1 - 0.1; x += 0.27) b.box(0.08, 0.08, L + 0.12, 0x4a3426, x, (ya + yb) / 2 + 0.18, (za + zb2) / 2, { rx: -ang, col: false, mat: 'wood' });
      b.box(R.x1 - R.x0 + 1.0, 0.05, L + 0.5, 0x3a2a20, 0, (ya + yb) / 2 + 0.25, (za + zb2) / 2, { rx: -ang, col: false, mat: 'wood' });
    }
    // 檐墙以上的垫板（南北两面，从墙顶直抵望板，挡住梁架与屋面之间的缝）
    for (const z of [R.z0 - WALL_T / 2, R.z1 + WALL_T / 2]) b.slab(R.x1 - R.x0 + WALL_T * 2, Y.eave + 0.45 - H, WALL_T, 0x3a2a20, 0, H, z, { mat: 'wood', col: false });
    // 山面（两端梁架以上的三角墙）
    const gable = new THREE.Shape();
    gable.moveTo(R.z0 - WALL_T, H - 0.1); gable.lineTo(R.z0 - WALL_T, Y.eave + 0.3); gable.lineTo(-ZM, Y.mid + 0.35); gable.lineTo(0, Y.ridge + 0.35); gable.lineTo(ZM, Y.mid + 0.35); gable.lineTo(R.z1 + WALL_T, Y.eave + 0.3); gable.lineTo(R.z1 + WALL_T, H - 0.1); gable.closePath();
    const gGeo = new THREE.ShapeGeometry(gable);
    for (const s of [-1, 1]) b.add(gGeo, 0xcfc4ae, 'std', { x: s * (R.x1 + 0.02), y: 0, z: 0, ry: s * -Math.PI / 2, col: false });
    for (const s of [-1, 1]) b.add(gGeo, 0xcfc4ae, 'std', { x: s * (R.x1 + 0.06), y: 0, z: 0, ry: s * Math.PI / 2, col: false });
    // 烟囱（与屋外东北角的砖烟囱同一位置），穿出屋面
    b.slab(1.0, 7.4, 1.0, C.brickWarm, 6.0, 0, -2.6, { mat: 'stone' });
    b.slab(1.12, 0.12, 1.12, C.stoneDark, 6.0, 1.95, -2.6, { mat: 'stoneSmooth', col: false });
    // 匾额：炉火纯青
    const pq = plaqueMesh('炉火纯青', 2.3, 0.66, { bg: '#2a2a28', fg: '#d9c48e', frame: '#5a4330' });
    pq.position.set(0, 3.42, R.z0 + 0.1);
    this.extraMeshes = [pq];
    void rand;
  }

  // 固定陈设：药柜、炉台与丹炉、灶、长案、格架、挂件
  buildFixtures(b, rand) {
    // 北墙百子药柜：三组，每组 8 列 × 7 行
    for (const cx of [-3.0, 0, 3.0]) IP.medicineCabinet(b, cx, 0, R.z0 + 0.27, 2.6, 1.95, 0.5, 8, 7, this.labels, rand);
    // 八卦炉台与丹炉
    this.platformTop = IP.furnacePlatform(b, FURNACE.x, 0, FURNACE.z, 1.5);
    // 丹炉单独成组（便于整体缩放）
    const fb = new Builder();
    IP.bronzeFurnace(fb, 0, 0, 0);
    this.furnaceGroup = fb.build({ shadows: true, name: 'furnace' });
    this.furnaceGroup.position.set(FURNACE.x, FURNACE.y, FURNACE.z);
    this.furnaceGroup.scale.setScalar(FURNACE.s);
    this.cw.addCyl({ x: FURNACE.x, z: FURNACE.z, y0: IY + FURNACE.y, y1: IY + FURNACE.y + 2.9 * FURNACE.s, r: 0.86 * FURNACE.s });
    IP.prayerCushion(b, 0, 0, 1.35);
    // 东北角煎药灶（灶后即烟囱）
    this.stoveHoles = IP.brickStove(b, 6.0, 0, -1.6);
    // 柴垛（烟囱与北墙之间）
    for (let l = 0; l < 4; l++) for (let i = 0; i < 5 - (l > 2 ? 1 : 0); i++) b.cyl(0.075, 0.075, 0.95, rand() < 0.5 ? 0x7a6248 : 0x8a7054, 5.5 + i * 0.17 + (l % 2) * 0.08, 0.08 + l * 0.14, -3.55, { rz: Math.PI / 2, col: false, seg: 6, mat: 'wood' });
    b.collider(6.0, 0, 0.6, -3.55, 0.6, 0.35);
    waterJar(b, 4.55, 0, -1.95, 0.9);
    b.cylCollider(4.55, 0, 0.7, -1.95, 0.45);
    // 东墙多宝格
    this.shelfSpots = IP.curioShelf(b, R.x1 - 0.22, 0, 0.95, -Math.PI / 2, 2.7, 2.2, 0.42);
    // 南墙东间长案与条凳
    IP.longTable(b, 3.0, 0, R.z1 - 0.48, 0, 2.4, 0.72, 0.82);
    b.slab(1.3, 0.05, 0.3, C.woodRed, 3.0, 0.42, 2.72, { mat: 'wood' });
    for (const s of [-1, 1]) b.box(0.06, 0.42, 0.24, C.woodRed, 3.0 + s * 0.55, 0.21, 2.72, { mat: 'wood', col: false });
    const ty = 0.82;
    IP.bookStack(b, 2.0, ty, 3.6, 0.1, 4, rand);
    IP.scrollRoll(b, 2.25, ty, 3.25, 0.2);
    IP.scrollRoll(b, 2.3, ty + 0.06, 3.32, 0.35, 0.36);
    IP.steelyard(b, 3.75, ty, 3.3, -0.3);
    b.slab(0.16, 0.03, 0.24, 0x2a2a2a, 3.55, ty, 3.72, { mat: 'stoneSmooth', col: false });          // 砚
    b.cyl(0.006, 0.008, 0.22, 0x3a2a1c, 3.38, ty + 0.012, 3.7, { rz: Math.PI / 2, ry: 0.3, col: false, seg: 5, mat: 'wood' });   // 笔
    mortar(b, 4.75, 0, 3.55);
    IP.grinder(b, 5.35, 0, 2.7, 0.4);
    // 晒药竹匾：倚着东墙南段
    IP.bambooTray(b, R.x1 - 0.18, 0, 3.3, 0.5, 1.25, -Math.PI / 2, 0x8a7a48);
    IP.bambooTray(b, R.x1 - 0.3, 0, 2.85, 0.42, 1.3, -Math.PI / 2, 0x6e7a46);
    basket(b, 6.55, 0, 3.45, 0.85, 0, 0x6f7a48);
    basket(b, 5.95, 0, 3.6, 0.75, 1, 0xa35a3a);
    // 吊挂的药材串与葫芦（挂在两侧梁下）
    for (const x of [-4.5, 4.5]) for (let z = -2.6; z <= 2.7; z += 0.75) IP.herbBundle(b, x + (rand() - 0.5) * 0.1, COL_H, z, 0.35 + rand() * 0.45, rand);
    for (const z of [-1.8, -0.9, 1.0, 1.9]) IP.gourd(b, 1.5, COL_H - 0.95 - rand() * 0.3, z, 1.1, 0.6);
    // 西间：山水挂轴与对联（挂在罗汉床上方的西墙）
    this.wallArt = [];
    const art = (texture, w, h, x, y, z, ry, roller = true) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92 }));
      m.position.set(x, y, z); m.rotation.y = ry;
      this.wallArt.push(m);
      if (roller) for (const s of [-1, 1]) b.cyl(0.025, 0.025, w + 0.1, 0x3a2a1c, x + 0.01, y + s * (h / 2 + 0.01), z, { rx: Math.PI / 2, col: false, seg: 8, mat: 'wood' });
    };
    art(IP.paintingTexture(), 0.92, 1.84, R.x0 + 0.02, 2.35, 0.45, Math.PI / 2);
    art(IP.coupletTexture('丹砂九转'), 0.3, 1.5, R.x0 + 0.02, 2.2, -0.75, Math.PI / 2, false);
    art(IP.coupletTexture('松月一壶'), 0.3, 1.5, R.x0 + 0.02, 2.2, 1.65, Math.PI / 2, false);
  }

  buildFloor() {
    // 方砖地（灰褐，五十厘米见方），门口与炉前的砖面磨得发亮
    const T = (k) => ASSETS.tex[k];
    const map = T('paving_d') ? T('paving_d').clone() : null, nrm = T('paving_n') ? T('paving_n').clone() : null;
    for (const t of [map, nrm]) if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set((R.x1 - R.x0) / 2.5, (R.z1 - R.z0) / 2.5); t.needsUpdate = true; }
    const mat = new THREE.MeshStandardMaterial({ map, normalMap: nrm, color: map ? 0x8c847a : 0x4e4943, roughness: 0.78, envMapIntensity: 0.5 });
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          { float wear = exp(-pow(length((vFW.xz - vec2(0., 2.8)) / vec2(1.4, 1.6)), 2.)) + .7 * exp(-pow(length((vFW.xz - vec2(0., .9)) / vec2(1.2, .9)), 2.));
            roughnessFactor = mix(roughnessFactor, .42, clamp(wear, 0., 1.) * .8); diffuseColor.rgb *= 1. + .08 * wear; }`);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFW = (modelMatrix * vec4(transformed, 1.)).xyz;');
    };
    mat.customProgramCacheKey = () => 'interior-floor';
    const f = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.z1 - R.z0), mat);
    f.rotation.x = -Math.PI / 2;
    f.receiveShadow = true;
    this.root.add(f);
    // 门洞外一小段石阶面（门槛外），接上门外的远景
    const out = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.hw * 2 + 0.6, 1.6), new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.9 }));
    out.rotation.x = -Math.PI / 2; out.position.set(0, -0.02, R.z1 + WALL_T + 0.8);
    this.root.add(out);
    for (const m of this.extraMeshes) this.root.add(m);
    for (const m of this.wallArt) this.root.add(m);
    this.root.add(this.platformTop);
  }

  // 窗纸（北墙高窗、南墙未支起的窗与横披窗）：窗格贴图 + 背后天光透过来的亮度（随时辰）
  buildWindows() {
    const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.fillStyle = '#fff';
    const t = 9, bar = (x, y, w, h) => g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    bar(0, 0, S, t / 2); bar(0, S - t / 2, S, t / 2); bar(0, 0, t / 2, S); bar(S - t / 2, 0, t / 2, S);
    for (const m of [0.25, 0.5, 0.75]) { bar(S * m - t / 2, 0, t, S); bar(0, S * m - t / 2, S, t); }
    bar(S * 0.375 - t / 2, S * 0.375, t, S * 0.25); bar(S * 0.625 - t / 2, S * 0.375, t, S * 0.25);
    const lat = new THREE.CanvasTexture(cv); lat.wrapS = lat.wrapT = THREE.RepeatWrapping; lat.anisotropy = 4;
    this.paperU = { uDay: { value: new THREE.Color(1, 0.95, 0.85) } };
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tLat = { value: lat }; sh.uniforms.uDay = this.paperU.uDay;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPU;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvPU = uv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tLat; uniform vec3 uDay; varying vec2 vPU; float latV;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nlatV = texture2D(tLat, vPU).r; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.16, .09, .06), latV);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uDay * (1. - latV);');
    };
    mat.customProgramCacheKey = () => 'interior-paper';
    const add = (w, h, x, y, z, ry) => {
      const geo = new THREE.PlaneGeometry(w, h);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 0.6, uv.getY(i) * h / 0.6);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.rotation.y = ry;
      this.root.add(m);
    };
    // 北墙高窗（药柜上方，中间一间挂匾）
    for (const x of [-6, -3, 3, 6]) add(2.0, 0.95, x, 2.62, R.z0 + 0.01, 0);
    // 南墙：两端两间的槛窗（未支起）、各间的横披窗
    for (const x of [-6, 6]) add(2.5, 2.05, x, 0.95 + 1.02, R.z1 - 0.01, Math.PI);
    for (const x of [-6, -3, 0, 3, 6]) add(2.5, 0.5, x, 3.45, R.z1 - 0.01, Math.PI);
    // 支摘窗的窗扇：上沿为轴向外支起约 50°（从屋里看得见格扇的背面与透光的窗纸）
    for (const x of WINS) {
      const hh = WIN.y1 - WIN.y0, geo = new THREE.PlaneGeometry(WIN.hw * 2, hh), uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * WIN.hw * 2 / 0.6, uv.getY(i) * hh / 0.6);
      geo.translate(0, -hh / 2, 0);
      const sash = new THREE.Mesh(geo, mat);
      sash.position.set(x, WIN.y1, R.z1 + WALL_T + 0.03);
      sash.rotation.x = -0.9;
      sash.castShadow = true;
      this.root.add(sash);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(WIN.hw * 2 + 0.06, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0x4a2a20, roughness: 0.8 }));
      frame.position.set(x, WIN.y1 - hh * Math.cos(0.9), R.z1 + WALL_T + 0.03 + hh * Math.sin(0.9));
      this.root.add(frame);
    }
    for (const x of [-6, 6]) { const sill = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.1), new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.8 })); sill.position.set(x, 0.95, R.z1 - 0.05); this.root.add(sill); }
  }

  // 成品陈设（Poly Haven CC0 模型与项目自带的药瓶），按真实尺寸摆放；体量大的加碰撞
  placeModels(rand) {
    const M = this.models;
    const put = (name, x, y, z, ry = 0, s = 1, col = null) => {
      const src = M[name];
      if (!src) return null;
      const o = src.clone(true);
      o.position.set(x, y, z); o.rotation.y = ry; o.scale.setScalar(s);
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; if (m.material) m.material.envMapIntensity = 0.55; } });
      this.root.add(o);
      if (col) {
        const bb = new THREE.Box3().setFromObject(o);
        const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
        this.cw.addBox({ x: cx, z: cz, y0: IY + bb.min.y, y1: IY + bb.max.y, hx: (bb.max.x - bb.min.x) / 2 + (col.pad ?? 0), hz: (bb.max.z - bb.min.z) / 2 + (col.pad ?? 0), walk: col.walk ?? false, cam: col.cam ?? false });
      }
      return o;
    };
    // 西间起居：罗汉床、茶几、绣墩、官帽椅、屏风、顶箱柜、条案
    put('chinese_sofa', R.x0 + 0.5, 0, 0.45, Math.PI / 2, 1, { pad: 0.02 });
    put('chinese_tea_table', -5.55, 0, 0.45, Math.PI / 2, 0.9, { pad: 0.02 });
    put('chinese_stool', -4.65, 0, -0.25, 0.2, 0.8, { pad: 0.02 });
    put('chinese_stool', -4.7, 0, 1.15, -0.15, 0.8, { pad: 0.02 });
    put('chinese_armchair', -5.55, 0, -0.85, 0, 0.74, { pad: 0.02 });
    put('chinese_screen_panels', -4.1, 0, 2.85, -0.35, 1.05, { pad: 0.02, cam: true });
    put('chinese_cabinet', -6.45, 0, R.z0 + 0.25, 0, 0.85, { pad: 0.02, cam: true });
    put('chinese_console_table', -5.9, 0, R.z1 - 0.2, Math.PI, 1.15, { pad: 0.02 });
    // 条案上：烛台、青花罐、香瓶、盆景
    const ct = 0.66 * 1.15;
    put('wooden_candlestick', -6.55, ct, R.z1 - 0.2, 0, 1.2);
    put('antique_ceramic_vase_01', -5.3, ct, R.z1 - 0.22, 0.5, 0.75);
    put('brass_vase_03', -5.9, ct, R.z1 - 0.18, 0, 1.1);
    put('potted_plant_04', -6.15, ct, R.z1 - 0.2, 0.3, 1.0);
    // 茶几上：茶盏（木碗代替）与果盘
    put('wooden_bowl_02', -5.4, 0.45, 0.2, 0.4, 0.8);
    put('carved_wooden_plate', -5.65, 0.45, 0.7, 0, 0.9);
    put('food_ginger_01', -5.65, 0.47, 0.7, Math.PI / 2, 0.32)?.rotation.set(Math.PI / 2, 0, 0.4);
    // 顶箱柜上与药柜顶：瓷罐、铜罐、葫芦
    const topY = 1.95 + 0.01;
    const jars = ['ceramic_vase_01', 'ceramic_vase_02', 'ceramic_vase_04', 'ceramic_pot', 'brass_pot_01', 'ceramic_vase_02', 'antique_ceramic_vase_01', 'ceramic_vase_04', 'ceramic_vase_01'];
    [-4.0, -3.2, -2.1, -0.9, 0.3, 1.1, 2.3, 3.3, 4.0].forEach((x, i) => put(jars[i], x, topY, R.z0 + 0.27, rand() * 6, jars[i] === 'ceramic_pot' ? 0.55 : jars[i] === 'antique_ceramic_vase_01' ? 0.7 : 0.85));
    // 长案上：丹方手记（摊开）、木碗与人参、烛台
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.39), [
      new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ map: IP.manuscriptTexture(), roughness: 0.92 }), new THREE.MeshStandardMaterial({ color: 0x5a3a2a, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.9 })]);
    book.position.set(2.85, 0.835, 3.42); book.rotation.y = -0.08; book.castShadow = true; book.receiveShadow = true;
    this.root.add(book);
    put('wooden_bowl_02', 3.95, 0.82, 3.6, 0, 1.1);
    put('carved_wooden_plate', 4.15, 0.82, 3.3, 0, 1);
    const gin = put('food_ginger_01', 4.15, 0.84, 3.3, 0, 0.3); if (gin) gin.rotation.set(Math.PI / 2, 0, 0.6);
    this.candle = put('wooden_candlestick', 2.25, 0.82, 3.65, 0, 1.25);
    // 东墙多宝格：药瓶（项目素材）、瓷罐、葫芦、竹篮
    const potions = M.potions ? M.potions.children.filter((c) => c.name.startsWith('potion')) : [];
    let pi = 0;
    for (const sp of this.shelfSpots) {
      const n = Math.max(1, Math.round((sp.x1 - sp.x0) / 0.22));
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n, p = sp.at(u);
        const kind = (sp.level + k) % 5;
        if (kind < 3 && potions.length) {
          const src = potions[(pi++) % potions.length], o = src.clone(true);
          o.position.set(p.x + (rand() - 0.5) * 0.05, sp.y + 0.001, p.z + (rand() - 0.5) * 0.08);
          o.rotation.y = rand() * 6.28;
          o.scale.setScalar(0.5 + rand() * 0.12);
          o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.material.envMapIntensity = 0.9; m.material.emissiveIntensity = 0.55; } });
          this.root.add(o);
        } else if (kind === 3) put(['ceramic_vase_04', 'ceramic_vase_01', 'brass_pot_01'][k % 3], p.x, sp.y, p.z, rand() * 6, Math.min(0.62, sp.h / 0.45));
        else put('planter_pot_clay', p.x, sp.y, p.z, rand() * 6, 0.62);
      }
    }
    put('painted_wooden_shelves', R.x1 - 0.2, 1.2, -0.95, -Math.PI / 2, 0.8);
    // 地上：竹篮、陶盆
    put('wicker_basket_02', 6.6, 0, 2.15, 0.6, 1.3, { pad: 0.02 });
    put('wicker_basket_02', 5.4, 0, 3.6, -0.3, 1.1, { pad: 0.02 });
    put('planter_pot_clay', 4.6, 0, 2.15, 0, 1.3, { pad: 0.02 });
    put('ceramic_pot', 4.45, 0, -2.95, 0.5, 1.0, { pad: 0.02 });
    // 煎药灶上的两只药罐
    for (const h of this.stoveHoles) put('ceramic_pot', h.x, h.y - 0.02, h.z, rand() * 6, 0.52);
    // 宫灯：两盏，挂在丹炉两侧的梁间
    this.lanterns = [];
    for (const x of [-2.9, 2.9]) {
      const o = put('chinese_chandelier', x, 2.95, 0.4, 0, 0.95);
      if (o) this.lanterns.push(o);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 3.25), new THREE.MeshStandardMaterial({ color: 0x2a1a12 }));
      cord.position.set(x, 3.65 + 1.62, 0.4);
      this.root.add(cord);
    }
  }

  buildLights() {
    const root = this.root, q = this.quality;
    this.hemi = new THREE.HemisphereLight(0xfff1e0, 0x2a1e16, 0.5);
    root.add(this.hemi);
    // 阳光 / 月光：只从门窗洞照进来（屋面、墙体投影）
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d8, 2);
    sun.castShadow = true;
    sun.shadow.radius = 2;
    sun.shadow.mapSize.set(q === 'low' ? 1024 : 2048, q === 'low' ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = -10; sc.right = 10; sc.top = 10; sc.bottom = -10; sc.near = 0.5; sc.far = 60;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    sun.target.position.set(0, 0, 0);
    root.add(sun, sun.target);
    // 门窗进来的天光（漫射，不投影）
    this.fill = new THREE.DirectionalLight(0xdfe8ff, 0.4);
    this.fill.position.set(0, 3, 10); this.fill.target.position.set(0, 0, -2);
    root.add(this.fill, this.fill.target);
    // 炉火：炉门前的橙光（投影）、炉底炭火
    const fire = this.fireLight = new THREE.PointLight(0xff7a30, 10, 0, 2);
    fire.position.set(FURNACE.x, FURNACE.y + 0.9 * FURNACE.s, FURNACE.z + 1.0);
    fire.castShadow = q !== 'low';
    fire.shadow.mapSize.set(512, 512); fire.shadow.bias = -0.004; fire.shadow.camera.near = 0.1; fire.shadow.camera.far = 14;
    root.add(fire);
    this.coalLight = new THREE.PointLight(0xff5a20, 2.5, 0, 2);
    this.coalLight.position.set(FURNACE.x, FURNACE.y + 0.25, FURNACE.z);
    root.add(this.coalLight);
    this.stoveLight = new THREE.PointLight(0xff6a28, 3, 0, 2);
    this.stoveLight.position.set(6.0, 0.3, -0.85);
    root.add(this.stoveLight);
    this.lampLights = [-2.9, 2.9].map((x) => { const l = new THREE.PointLight(0xffb46a, 2, 0, 2); l.position.set(x, 3.25, 0.4); root.add(l); return l; });
    this.candleLight = new THREE.PointLight(0xffa04a, 0.6, 0, 2);
    this.candleLight.position.set(2.25, 1.15, 3.62);
    root.add(this.candleLight);
  }

  buildEffects() {
    const root = this.root;
    // 炉门与炉底的火光（动态的明暗与颜色）
    const fireMat = new THREE.ShaderMaterial({
      uniforms: { uTime: GLOBAL.uTime, uK: { value: 1 } },
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform float uTime, uK; varying vec2 vU; ${NOISE_GLSL}
        void main(){ vec2 p = vU - .5; float r = length(p * vec2(1., .8));
          float n = nzf(vec2(vU.x * 4., vU.y * 3. - uTime * 2.2)); float f = smoothstep(.5, .05, r) * (.55 + .7 * n);
          vec3 c = mix(vec3(1., .25, .04), vec3(1., .78, .35), smoothstep(.3, .9, f)) * f * 2.6 * uK;
          gl_FragColor = vec4(c, 1.); }`,
    });
    this.fireMat = fireMat;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), fireMat);
    win.position.set(FURNACE.x, FURNACE.y + 1.08 * FURNACE.s, FURNACE.z + 0.758 * FURNACE.s); win.rotation.x = 0.35; win.scale.setScalar(FURNACE.s);
    root.add(win);
    const coal = new THREE.Mesh(new THREE.CircleGeometry(0.38, 20), fireMat);
    coal.rotation.x = -Math.PI / 2; coal.position.set(FURNACE.x, FURNACE.y + 0.47 * FURNACE.s, FURNACE.z); coal.scale.setScalar(FURNACE.s);
    root.add(coal);
    for (const h of this.stoveHoles) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.24), fireMat);
      m.position.set(h.mouth.x, h.mouth.y - 0.02, h.mouth.z + 0.01);
      root.add(m);
    }
    // 烛焰
    const flameTex = softDot(64, 1.6);
    this.flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flame.scale.set(0.05, 0.1, 1);
    this.flame.position.set(2.25, 0.82 + 0.219 * 1.25 + 0.06, 3.65);
    root.add(this.flame);
    // 宫灯的灯罩透光（加在灯笼位置的柔光）
    this.lampGlow = [-2.9, 2.9].map((x) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(64, 1.4), color: 0xffb86a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 })); s.scale.set(1.3, 1.3, 1); s.position.set(x, 3.3, 0.4); root.add(s); return s; });
    // 烟与蒸汽
    const dot = softDot(64, 1.8);
    this.smoke = new Puffs(this.scene, 70, dot, { color: 0xc4c2c0, opacity: 0.34 });
    this.steam = new Puffs(this.scene, 40, dot, { color: 0xe8e6e0, opacity: 0.2 });
    this.sparks = new Puffs(this.scene, 30, softDot(32, 1.2), { color: 0xffa040, additive: true, opacity: 1 });
    // 浮尘：屋里慢慢飘着，进到光柱里就亮起来（顶点里按光柱的洞口投影判断）
    const N = this.quality === 'low' ? 160 : 420;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    const r = mulberry32(5);
    for (let i = 0; i < N; i++) { pos[i * 3] = lerp(R.x0, R.x1, r()); pos[i * 3 + 1] = 0.2 + r() * 3.6; pos[i * 3 + 2] = lerp(R.z0, R.z1, r()); seed[i] = r() * 100; }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); dg.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.dustU = { uSun: { value: new THREE.Vector3(0, 1, 1) }, uK: { value: 0 }, uTime: GLOBAL.uTime, map: { value: softDot(32, 2) }, uRects: { value: [] }, uScale: { value: 500 } };
    this.dust = new THREE.Points(dg, new THREE.ShaderMaterial({
      uniforms: this.dustU,
      vertexShader: `attribute float seed; uniform vec3 uSun; uniform float uK, uTime, uScale; uniform vec4 uRects[3]; varying float vA;
        void main(){
          vec3 p = position + vec3(sin(uTime * .07 + seed) * .5, sin(uTime * .05 + seed * 1.7) * .35, cos(uTime * .06 + seed * .7) * .5);
          // 光照判定：沿光线方向回到南墙内皮（z=${R.z1}），看是否落在门窗洞口内
          float s = (${R.z1.toFixed(2)} - p.z) / max(uSun.z, 1e-3), lit = 0.;
          vec3 q = p + uSun * s;
          for (int i = 0; i < 3; i++) { vec4 r = uRects[i]; lit = max(lit, step(abs(q.x - r.x), r.z) * step(r.y, q.y) * step(q.y, r.w)); }
          lit *= step(0., s);
          vA = (.08 + lit * uK * 1.4) * (.6 + .4 * sin(uTime * .8 + seed * 3.));
          vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.);
          gl_PointSize = (2. + lit * 1.5) * uScale / max(-mv.z, .2) * .02;
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying float vA; void main(){ float a = texture2D(map, gl_PointCoord).a * vA; if (a < .003) discard; gl_FragColor = vec4(vec3(1., .93, .8) * a, 1.); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.dust.frustumCulled = false;
    root.add(this.dust);
    // 光柱：门洞与两扇支起的窗（世界坐标中的洞口矩形）
    const zIn = IY * 0 + R.z1;
    const rects = [{ x: 0, hw: DOOR.hw, y0: DOOR.y0, y1: DOOR.y1 }, ...WINS.map((x) => ({ x, hw: WIN.hw, y0: WIN.y0, y1: WIN.y1 }))];
    this.rects = rects;
    this.dustU.uRects.value = rects.map((r2) => new THREE.Vector4(r2.x, r2.hw, r2.y0, r2.y1));
    const steps = this.quality === 'low' ? 10 : this.quality === 'high' ? 24 : 18;
    this.shafts = rects.map((r2) => {
      const c = new THREE.Vector3(r2.x, IY + (r2.y0 + r2.y1) / 2, zIn), ex = new THREE.Vector3(r2.hw, 0, 0), ey = new THREE.Vector3(0, (r2.y1 - r2.y0) / 2, 0);
      const mat = shaftMaterial({ c, ex, ey, n: new THREE.Vector3(0, 0, 1) }, steps);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
      geo.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false; m.renderOrder = 5; m.userData.shaft = true;
      this.scene.add(m);
      return { m, mat, r: r2 };
    });
  }

  // 门外的景色：推门那一刻从门口向外拍下的宗门画面（见 captureView），贴在门外 7 米处
  buildBackdrop() {
    this.backTex = null;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, uHas: { value: 0 }, uSky: { value: new THREE.Color(0.75, 0.82, 0.9) } },
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'uniform sampler2D map; uniform float uHas; uniform vec3 uSky; varying vec2 vU; void main(){ vec3 c = uHas > .5 ? texture2D(map, vU).rgb : mix(uSky * .8, uSky, vU.y); gl_FragColor = vec4(c, 1.); }',
      depthWrite: true,
    });
    this.backMat = mat;
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.backdrop.rotation.y = Math.PI;      // 朝向屋内（-z 方向看过来）
    this.root.add(this.backdrop);
    this.setBackdropFrame(70, 16 / 9);
  }
  setBackdropFrame(fov, aspect) {
    const D = 7.2, h = 2 * D * Math.tan(THREE.MathUtils.degToRad(fov / 2)), w = h * aspect;
    this.backdrop.scale.set(w, h, 1);
    this.backdrop.position.set(0, this.capY, R.z1 + WALL_T + 0.2 + D);
  }
  get capY() { return 1.6; }

  // 推门时调用：在宗门场景里，从门外一步（门口）面向南拍一张，作为门外景色
  // hour：拍摄时的时辰（屋里待久了，天色变化超过半个时辰就重拍一次，见 backdropStale）
  captureView(renderer, surfaceScene, doorWorld, hide = [], hour = null) {
    this.capHour = hour; this.capDay = skyState(hour ?? 12).day;
    // 固定 1280×720 拍摄（临时改画布尺寸，拍完复原；画面被淡出遮住，玩家看不到）
    const pr = renderer.getPixelRatio(), keep = renderer.getSize(new THREE.Vector2());
    const w = 1280, h = 720;
    try {
      renderer.setPixelRatio(1); renderer.setSize(w, h, false);
      const cam = new THREE.PerspectiveCamera(70, w / h, 0.3, 4000);
      cam.position.set(doorWorld.x, doorWorld.y + this.capY, doorWorld.z + 0.25);
      cam.lookAt(doorWorld.x, doorWorld.y + this.capY - 0.25, doorWorld.z + 10);
      cam.updateMatrixWorld();
      const vis = hide.map((o) => o.visible);
      hide.forEach((o) => { o.visible = false; });
      renderer.render(surfaceScene, cam);
      hide.forEach((o, i) => { o.visible = vis[i]; });
      if (!this.backTex) {
        this.backTex = new THREE.FramebufferTexture(w, h);
        this.backTex.minFilter = THREE.LinearFilter; this.backTex.magFilter = THREE.LinearFilter;
      }
      renderer.copyFramebufferToTexture(new THREE.Vector2(0, 0), this.backTex);
      this.backMat.uniforms.map.value = this.backTex;
      this.backMat.uniforms.uHas.value = 1;
      this.setBackdropFrame(70, w / h);
      // 拍照机位略低头：画面中心在门外地面以上略低处，平面正对拍摄点
      this.backdrop.position.y = this.capY - 0.25 * 7.2 / 10;
      this.backdrop.lookAt(new THREE.Vector3(0, IY + this.capY, R.z1 + WALL_T + 0.25));
      return true;
    } catch (e) {
      console.info('门外景色拍摄失败，改用天色：', e.message);
      this.backMat.uniforms.uHas.value = 0;
      return false;
    } finally {
      renderer.setPixelRatio(pr); renderer.setSize(keep.x, keep.y, false);
    }
  }

  backdropStale(hour) {
    if (this.capHour == null) return false;
    // 天色明暗变化明显（晨昏）或已过去两个时辰以上才重拍：重拍要完整画一遍宗门（约几十毫秒），不宜频繁
    const d = 12 - Math.abs(((hour - this.capHour + 36) % 24) - 12);      // 两个时刻相差几小时（环形）
    return d > 4 || Math.abs(skyState(hour).day - this.capDay) > 0.25;
  }

  // ---------- 行走与镜头 ----------
  heightAt() { return IY; }
  inCore(x, z) {
    if (x > R.x0 + 0.05 && x < R.x1 - 0.05 && z > R.z0 + 0.05 && z < R.z1 - 0.05) return true;
    return Math.abs(x) < DOOR.hw - 0.2 && z >= R.z1 - 0.1 && z < R.z1 + WALL_T + 0.6;     // 门洞（走出门即回到庭院）
  }
  waterAt() { return null; }
  normalAt() { return new THREE.Vector3(0, 1, 0); }
  inDoorway(x, z) { return Math.abs(x) < DOOR.hw && z > R.z1 + 0.05; }
  camInside(x, y, z) {
    y -= IY;
    if (y < 0.25 || y > COL_H - 0.5) return false;
    if (x < R.x0 + 0.25 || x > R.x1 - 0.25 || z < R.z0 + 0.25) return false;
    if (z > R.z1 - 0.25) return Math.abs(x) < DOOR.hw - 0.3 && z < R.z1 + 2.2 && y < DOOR.y1 - 0.2;     // 门洞里、门外台基上方（从门口看进屋）
    if (Math.hypot(x - FURNACE.x, z - FURNACE.z) < 0.95 && y < FURNACE.y + 2.9 * FURNACE.s + 0.2) return false;   // 丹炉炉身与炉盖
    if (z < R.z0 + 0.85 && Math.abs(x) < 4.4 && y < 2.1) return false;                      // 百子药柜
    return true;
  }
  camLimit(o, dir, d) {
    const n = Math.ceil(d / 0.15);
    for (let i = 1; i <= n; i++) {
      const s = (d * i) / n;
      if (!this.camInside(o.x + dir.x * s, o.y + dir.y * s, o.z + dir.z * s)) return Math.max(0.5, s - 0.25);
    }
    return d;
  }
  get entry() { return { x: ALCHEMY_ENTRY.x, y: IY, z: ALCHEMY_ENTRY.z, yaw: ALCHEMY_ENTRY.yaw }; }

  // ---------- 每帧 ----------
  update(dt, t, camera) {
    if (!this.ready) return;
    // 天光：每半秒按时辰更新阳光（或月光）方向、强度与颜色，窗纸亮度，光柱
    if ((this.skyT = (this.skyT ?? 0) - dt) <= 0) { this.skyT = 0.5; this.updateSky(); }
    // 火光闪烁
    const f = 0.82 + 0.12 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1) + 0.08 * Math.sin(t * 17.7);
    this.fireLight.intensity = 11 * f; this.coalLight.intensity = 3 * (0.9 + 0.1 * Math.sin(t * 5.1));
    this.stoveLight.intensity = 3.2 * (0.85 + 0.15 * Math.sin(t * 6.3 + 2) * Math.sin(t * 2.2));
    this.fireMat.uniforms.uK.value = 0.8 + 0.25 * f;
    this.candleLight.intensity = (0.5 + this.night * 0.9) * (0.9 + 0.1 * Math.sin(t * 13.1) * Math.sin(t * 4.7));
    this.flame.scale.set(0.05, 0.1 * (0.9 + 0.12 * Math.sin(t * 11.3)), 1);
    for (const l of this.lampLights) l.intensity = 1.6 + this.night * 3.6;
    for (const s of this.lampGlow) s.material.opacity = 0.18 + this.night * 0.45;
    for (const [i, lan] of this.lanterns.entries()) lan.rotation.y = Math.sin(t * 0.35 + i * 2) * 0.06;
    // 烟、蒸汽、火星
    const fx = FURNACE.x, fz = FURNACE.z;
    this.smoke.update(dt, 9, (i, p, v) => {
      const k = i * 3, a = Math.random() * 6.28;
      p[k] = fx + Math.cos(a) * 0.08; p[k + 1] = IY + FURNACE.y + 2.95 * FURNACE.s; p[k + 2] = fz + Math.sin(a) * 0.08;
      v[k] = (Math.random() - 0.5) * 0.12; v[k + 1] = 0.32 + Math.random() * 0.15; v[k + 2] = (Math.random() - 0.5) * 0.12;
      this.smoke.life[i] = 5 + Math.random() * 3;
      (this.smoke.base ||= new Float32Array(this.smoke.n))[i] = 0.35 + Math.random() * 0.2;
    }, { grow: 3.2, rise: -0.015, drag: 0.15 });
    this.steam.update(dt, 7, (i, p, v) => {
      const h = this.stoveHoles[i % 2], k = i * 3;
      p[k] = h.x + (Math.random() - 0.5) * 0.06; p[k + 1] = IY + h.y + 0.4; p[k + 2] = h.z + (Math.random() - 0.5) * 0.06;
      v[k] = (Math.random() - 0.5) * 0.06; v[k + 1] = 0.35 + Math.random() * 0.15; v[k + 2] = (Math.random() - 0.5) * 0.06;
      this.steam.life[i] = 2.2 + Math.random();
      (this.steam.base ||= new Float32Array(this.steam.n))[i] = 0.18;
    }, { grow: 3, drag: 0.6 });
    this.sparks.update(dt, 2.2 + 3 * Math.max(0, Math.sin(t * 0.7)), (i, p, v) => {
      const k = i * 3;
      p[k] = fx + (Math.random() - 0.5) * 0.16; p[k + 1] = IY + FURNACE.y + 1.05 * FURNACE.s; p[k + 2] = fz + 0.66;
      v[k] = (Math.random() - 0.5) * 0.6; v[k + 1] = 0.8 + Math.random() * 0.9; v[k + 2] = 0.3 + Math.random() * 0.4;
      this.sparks.life[i] = 0.6 + Math.random() * 0.6;
      (this.sparks.base ||= new Float32Array(this.sparks.n))[i] = 0.025;
    }, { grow: -0.6, rise: -1.6, drag: 0.8, fadeIn: 0.02 });
    // 光柱：镜头在柱体内时改从镜头处步进
    for (const s of this.shafts) s.mat.uniforms.uCamIn.value = this.pointInShaft(camera.position, s) ? 1 : 0;
  }

  // 镜头是否在某道光柱内（同着色器的判定）
  pointInShaft(p, s) {
    const L = this.light;
    if (!L || L.k <= 0) return false;
    const y = p.y - IY;
    if (p.z > R.z1 || y < 0) return false;
    const d = (R.z1 - p.z) / L.dir.z, qx = p.x + L.dir.x * d, qy = y + L.dir.y * d;
    return Math.abs(qx - s.r.x) < s.r.hw && qy > s.r.y0 && qy < s.r.y1;
  }

  updateSky() {
    const st = skyState();
    const sunUp = st.sunDir.y > 0.02, moonUp = st.moonDir.y > 0.05;
    // 照进屋的光：方位偏向正南、高度压低到 14°～43°（屋里看不到天上的日月，只看得到光斑与光柱——
    // 这样白天大部分时候都有斜斜的光柱穿过门窗落到地上，而不是正午只在门槛内照出一窄条）
    const src = sunUp ? st.sunDir : st.moonDir;
    const hx = src.x, hz = src.z + 0.9 * Math.hypot(src.x, src.z) + 0.15, hl = Math.hypot(hx, hz) || 1;
    const el = clamp(Math.asin(clamp(src.y, -1, 1)), 0.25, 0.75);
    const dir = new THREE.Vector3((hx / hl) * Math.cos(el), Math.sin(el), (hz / hl) * Math.cos(el));
    const fromSouth = dir.z > 0.05;
    const elev = Math.max(0, src.y);             // 亮度与颜色按真实的日（月）高
    const k = sunUp ? Math.min(1, elev * 3.2) * st.day : moonUp ? Math.min(1, elev * 2.5) * 0.12 : 0;
    this.night = st.night;
    this.light = { dir, k: fromSouth ? k : 0 };
    const col = sunUp ? new THREE.Color().setRGB(1, lerp(0.72, 0.95, Math.min(1, elev * 2.5)), lerp(0.5, 0.86, Math.min(1, elev * 2.5))) : new THREE.Color(0.62, 0.72, 1);
    this.sun.color.copy(col);
    this.sun.intensity = (sunUp ? 4.6 : 1.1) * k;
    this.sun.position.copy(dir).multiplyScalar(25);
    this.sun.visible = k > 0.001;
    this.fill.intensity = 0.15 + 0.4 * st.day;
    this.fill.color.setRGB(lerp(0.55, 0.92, st.day), lerp(0.62, 0.95, st.day), 1);
    this.hemi.intensity = 0.16 + 0.32 * st.day;
    // 窗纸透过来的天光（显示色）
    const d = st.day;
    this.paperU.uDay.value.setRGB(lerp(0.03, 0.72, d), lerp(0.04, 0.68, d), lerp(0.07, 0.6, d));
    this.renderer.toneMappingExposure = lerp(1.12, 1.05, d);
    // 光柱几何：洞口四角沿光线方向延伸 9 米（着色器里再裁到屋内）
    const L = 9, back = dir.clone().multiplyScalar(-1);
    for (const s of this.shafts) {
      s.mat.uniforms.uSun.value.copy(dir);
      s.mat.uniforms.uK.value = this.light.k * (sunUp ? 0.16 : 0.08);
      s.mat.uniforms.uCol.value.copy(col);
      s.m.visible = this.light.k > 0.01;
      const r2 = s.r, a = s.m.geometry.attributes.position;
      const pts = [[r2.x - r2.hw, r2.y0], [r2.x + r2.hw, r2.y0], [r2.x + r2.hw, r2.y1], [r2.x - r2.hw, r2.y1]];
      pts.forEach(([x, y], i) => {
        a.setXYZ(i, x, IY + y, R.z1 + 0.05);
        a.setXYZ(i + 4, x + back.x * L, IY + y + back.y * L, R.z1 + back.z * L);
      });
      a.needsUpdate = true;
    }
    this.dustU.uSun.value.copy(dir);
    this.dustU.uK.value = this.light.k * (sunUp ? 1 : 0.5);
  }
}
