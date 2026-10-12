// 夜间照明（第十三轮）：宗门里的灯都是「光源锚点」——宫灯、石灯、铜灯、檐下灯笼、火盆，以及本轮在石阶平台、
// 传送阵与互动点补的灯。入夜（随 uNight）后：
//   · 近处：一池实时点光（流畅 3 盏、均衡 6 盏、精美 8 盏，不投影），每 0.25 秒按离角色（略偏镜头前方）的远近与
//     重要性分给最近的锚点，强度平滑地淡入淡出，不跳变；
//   · 远处：灯下地面一圈光晕（实例化的贴地光斑，一次绘制，不是真实光源），只铺在平地上（台阶、坡面上不铺，免得穿插）；
//   · 白天全关。
// 光色：灯笼暖光 #FFD6A0、灵阵冷光 #8DDDD6、火盆略偏橙。
import * as THREE from 'three';
import { FOGU } from './shaderlib.js';
import { Builder } from './arch/builder.js';
import { stoneLanternR } from './arch/ornaments.js';
import { STAIRS } from './layout.js';
import { stairInfo } from './terrain.js';

export const LIGHT_HEX = { warm: '#FFD6A0', cold: '#8DDDD6', fire: '#FFB874' };
const LIGHT_COL = Object.fromEntries(Object.entries(LIGHT_HEX).map(([k, v]) => [k, new THREE.Color(v)]));
// 各类光源的点光强度（坎德拉，物理衰减）与光晕半径
const POWER = { warm: 9, cold: 11, fire: 12 };
const GLOW_R = { warm: 4.2, cold: 6.0, fire: 4.6 };
const _v = new THREE.Vector3();

export class NightLights {
  // ground(x, z, yTop)：yTop 以下最近的可站立面（贴地光晕用）
  constructor(scene, { count = 6, ground = null } = {}) {
    this.scene = scene;
    this.ground = ground;
    this.anchors = [];
    this.pool = Array.from({ length: count }, () => {
      const l = new THREE.PointLight(0xffd6a0, 0, 18, 2);
      l.castShadow = false;
      l.userData = { a: null, cur: 0 };
      scene.add(l);
      return l;
    });
    this.pickT = 0;
    this.chosen = new Set();
  }

  // tone：warm 灯笼 / cold 灵阵 / fire 火盆；k 亮度系数；pri 重要性（入口、石阶转折、传送阵取大，更常分到点光）；
  // range 点光照到的距离；glow 灯下铺一圈光晕
  add(x, y, z, { tone = 'warm', k = 1, pri = 1, range = 16, glow = true, r = null } = {}) {
    this.anchors.push({ x, y, z, tone, k, pri, range, glow, r });
  }

  // 贴地光晕：每个要铺光晕的锚点取正下方的地面；周围四点高差超过 0.35 米（台阶、坡面）就不铺
  build() {
    if (!this.ground) return;
    const list = [];
    for (const a of this.anchors) {
      if (!a.glow) continue;
      const r = a.r ?? GLOW_R[a.tone] * Math.sqrt(a.k);
      const g0 = this.ground(a.x, a.z, a.y);
      if (!(g0 > -1e8) || a.y - g0 > 9) continue;
      let lo = g0, hi = g0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const g = this.ground(a.x + dx * r * 0.55, a.z + dz * r * 0.55, a.y);
        lo = Math.min(lo, g); hi = Math.max(hi, g);
      }
      if (hi - lo > 0.35) continue;
      list.push([a.x, g0 + 0.035, a.z, r, a.tone, Math.min(1.3, a.k)]);
    }
    if (!list.length) return;
    const geo = new THREE.PlaneGeometry(2, 2);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
      uniforms: { uNight: FOGU.uNight },
      vertexShader: `varying vec2 vQ; varying vec3 vCol; varying float vD;
        void main(){
          vQ = position.xz; vCol = vec3(1.);
          #ifdef USE_INSTANCING_COLOR
            vCol = instanceColor;
          #endif
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.);
          vD = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      // 显示色直接叠加（不再做色调映射）：中心亮、边缘柔和，远处渐隐
      fragmentShader: `uniform float uNight; varying vec2 vQ; varying vec3 vCol; varying float vD;
        void main(){
          float r = length(vQ);
          float a = pow(max(0., 1. - r), 2.2) * uNight * smoothstep(340., 120., vD) * .34;
          if (a < .003) discard;
          gl_FragColor = vec4(vCol * a, 1.);
        }`,
    });
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const M = new THREE.Matrix4(), S = new THREE.Vector3(), Q = new THREE.Quaternion(), c = new THREE.Color();
    list.forEach(([x, y, z, r, tone, k], i) => {
      im.setMatrixAt(i, M.compose(_v.set(x, y, z), Q, S.set(r, 1, r)));
      im.setColorAt(i, c.copy(LIGHT_COL[tone]).convertLinearToSRGB().multiplyScalar(k));
    });
    im.frustumCulled = false;
    im.renderOrder = 3;
    im.name = 'night-light-pools';
    this.scene.add(im);
    this.pools = im;
    this.poolCount = list.length;
  }

  // 入夜时各材质的着色器多出这几盏点光（另一套变体）。载入时在后台预先编好（KHR_parallel_shader_compile 并行编译，
  // 不占主线程）——不预编时第一次天黑那一帧要同步编一百多个着色器，卡一两秒。
  // 同一材质用在不同种类的物体上（普通网格、实例化、合批、带实例颜色……）各是一个变体，按「材质 × 物体种类」各取一个代表来编
  prewarm(renderer, camera) {
    if (!renderer.compileAsync) return Promise.resolve();
    const reps = new Map();
    this.scene.traverse((o) => {
      if (!o.material) return;
      const kind = `${o.isInstancedMesh ? 'i' : ''}${o.instanceColor ? 'c' : ''}${o.isSkinnedMesh ? 's' : ''}${o.isBatchedMesh ? 'b' : ''}${o.isPoints ? 'p' : o.isLine ? 'l' : o.isSprite ? 'x' : ''}${o.receiveShadow ? 'r' : ''}`;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) { const k = m.uuid + kind; if (!reps.has(k)) reps.set(k, o); }
    });
    const keep = this.pool.map((l) => l.visible), ps = [];
    this.pool.forEach((l) => { l.visible = true; });
    try { for (const o of new Set(reps.values())) ps.push(renderer.compileAsync(o, camera, this.scene)); } catch (e) { /* 编不了就留到入夜时再编 */ } finally { this.pool.forEach((l, i) => { l.visible = keep[i]; }); }
    return Promise.all(ps).catch(() => {});
  }

  update(dt, focus, fwd) {
    const night = FOGU.uNight.value;
    this.pickT -= dt;
    if (this.pickT <= 0) {
      this.pickT = 0.25;
      this.chosen.clear();
      if (night > 0.02) {
        // 选点中心：角色前方约 5 米（镜头看着的那一侧多分几盏）
        const fx = focus.x + (fwd ? fwd.x * 5 : 0), fz = focus.z + (fwd ? fwd.z * 5 : 0), fy = focus.y;
        const n = this.pool.length, best = [];
        for (const a of this.anchors) {
          const d = Math.hypot(a.x - fx, (a.y - fy) * 1.6, a.z - fz) / a.pri;
          if (d > 55) continue;
          if (best.length < n) { best.push([d, a]); best.sort((p, q) => p[0] - q[0]); }
          else if (d < best[n - 1][0]) { best[n - 1] = [d, a]; best.sort((p, q) => p[0] - q[0]); }
        }
        for (const [, a] of best) this.chosen.add(a);
        // 已分到点光、仍在入选之列的锚点保留；其余点光先淡出，淡尽后再接新锚点
        const held = new Set(this.pool.map((l) => l.userData.a).filter((a) => a && this.chosen.has(a)));
        const waiting = [...this.chosen].filter((a) => !held.has(a));
        for (const l of this.pool) {
          const u = l.userData;
          if (u.a && this.chosen.has(u.a)) continue;
          if (u.cur < 0.02 && waiting.length) {
            const a = waiting.shift();
            u.a = a; u.cur = 0;
            l.position.set(a.x, a.y, a.z);
            l.color.copy(LIGHT_COL[a.tone]);
            l.distance = a.range;
          }
        }
      }
    }
    const kf = 1 - Math.exp(-dt * 5);
    // 点光整组一起显隐（入夜全开、天亮全关；没分到锚点的强度为 0）：three.js 的着色器按「可见点光的个数」分变体，
    // 逐盏随淡入淡出显隐会让个数在 0–6 之间来回变，走动时各材质不停换（初次还要现编）着色器变体
    const lit = night > 0.02;
    for (const l of this.pool) {
      const u = l.userData, on = u.a && this.chosen.has(u.a);
      const target = on ? POWER[u.a.tone] * u.a.k * night : 0;
      u.cur += (target - u.cur) * kf;
      if (!on && u.cur < 0.02) { u.cur = 0; if (u.a && !this.chosen.has(u.a)) u.a = null; }
      l.intensity = u.cur;
      l.visible = lit;
    }
  }
}

// 石阶的石灯（第十三轮补灯）：问心阶、天阶的中途平台第十二轮已各有一对（sect.js 的 stair-lanterns，这一轮起也会照亮），
// 这里只补没有灯的：登云阶中途平台两侧各一盏、问心阶阶脚一对（登云阶、天阶的阶脚紧挨凌云阁后墙与天阶门，不再加）；
// 灯放在平台内侧、栏杆以内（不占踏道中线），基座有碰撞
export function stairLamps(ctx) {
  const b = new Builder(), pts = [];
  for (const st of STAIRS) {
    if (st.id !== 's1' && st.id !== 's3') continue;
    const info = stairInfo(st), x = st.w / 2 - 0.55;
    if (st.id === 's3') for (const L of info.landings) pts.push([(L.z0 + L.z1) / 2, L.y, x, 0.9]);
    else pts.push([info.zb + 1.2, info.yb, x + 0.2, 0.95]);
  }
  for (const [z, y, x, s] of pts) for (const sx of [-1, 1]) stoneLanternR(b, sx * x, y, z, s);
  ctx.place(b, { name: '石阶平台石灯' });
  return pts.length * 2;
}
