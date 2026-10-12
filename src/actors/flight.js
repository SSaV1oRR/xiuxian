// 御剑飞行（第十三轮）：F 起飞 / 请求落地；WASD 水平移动（以镜头朝向为前），空格上升、C 下降，Shift 加速；
// 鼠标照常转动视角，镜头始终以角色为中心，不会自动转成俯视。
// 状态：ground 步行 → takeoff（背后的佩剑出鞘、化为两米飞剑落到脚下，人随剑缓缓升起约 2.6 米）→ fly → landing（降到
// 选定的安全落点，剑收回鞘中）→ ground。
// 碰撞：每帧按不超过 0.35 米一步推进（高速也不会穿过墙体、山体、塔身）。构筑物（殿阁、塔、岛上建筑、石像香炉、山岩、崖壁）
// 用分层实心柱（solidCols.js）——门洞、檐下、廊下、桥下飞得过去，墙、柱、殿身挡住，步行进不去的殿内也是实心；比脚底高不到
// 1.35 米的障碍（栏杆、石灯、香炉、矮墙、檐口）抬身越过，每步最多抬 0.42 米，不瞬移；地形缓坡贴着爬，一步高出 2.6 米以上的
// 崖壁当墙；斜着擦上墙、崖就沿着滑过去；正面顶着墙、崖时顺着往上爬，翻过去再往前；头顶有屋檐、岩檐压着爬不上去时自动绕檐
// （往外让开、必要时往下沉一点，头顶敞开了再升过墙顶）；树干、石块（碰撞世界的圆柱）推开并顺着绕过去；浮空岛与塔岛的岛体
// 另有实心判定。上升到檐底、廊顶为止。
// 高度上限与地图边界（云海结界）柔和地推回并提示。
// 落地：只在正下方 3.6 米内找得到安全落点、且离地不超过 60 米时降落——落点是平地，竖直通道里没有构筑物，落下后至少有三个方向
// 走得出去；否则继续飞行并说明原因（太高 / 水面 / 屋顶 / 岛沿 / 陡坡 / 四下走不出去 / 深谷），不会直接收剑让人坠落。
// 飞剑：项目素材里没有飞剑模型（assets/sword 里是西式长剑、东洋刀、带刺巨剑和描边卡通水晶剑，形制、画风都不合），
// 这里按角色背负佩剑的样式（鎏金剑格、乌木剑柄、鎏金剑首）程序化搭一柄临时飞剑，剑身钢色、淡淡的青色剑光，配红穗。
import * as THREE from 'three';
import { clamp, lerp, damp, lerpAngle, wrapAngle, smoothstep } from '../core/math.js';
import { shaderMaterial, injectFog } from '../world/shaderlib.js';
import { CORE } from '../world/terrain.js';

export const FLY = {
  cruise: 15, boost: 32, vert: 7, vertBoost: 11,     // 米 / 秒
  clear: 0.9,                                         // 脚下与地面、岛面、屋顶的最小间隙
  ceiling: 780,                                       // 绝对高度上限（通天塔塔刹之上留余）
  bounds: { x0: -960, x1: 960, z0: -1160, z1: 640 },  // 云海结界（宗门、后方空岛群与通天塔岛都在其内）
  maxDrop: 60,                                        // 请求落地时离地的最大高度
  rise: 2.6, takeoff: 0.9,                            // 起飞上升高度与时长
};
const STEP = 0.35, R_BODY = 0.8, Y_BODY = 1.0;     // 每步最大位移；浮空岛岛体用的球体（半径、球心离脚底）
// 构筑物（分层实心柱）：身体是脚底以上 0.12–1.85 米、水平半径 0.3 米的一段；比脚底高不到 1.35 米的障碍（栏杆、石灯、香炉、
// 矮墙、檐口、石阶边）抬身越过，再高的当墙；每步最多抬 0.42 米（越障、贴坡都平滑，不瞬移）；一步之内地形高出 2.6 米以上即崖壁
const R_COL = 0.3, BODY_LO = 0.12, BODY_H = 1.85, STEP_UP = 1.35, LIFT = 0.42, CLIMB = 2.6, STRUCT_CLEAR = 0.2;
const R_CYL = 0.4;                                     // 树干、石块（碰撞世界的竖直圆柱）
const SLIDE_NEAR = [0.35, -0.35], SLIDE_FAR = [0.7, -0.7, 1.05, -1.05, 1.4, -1.4];   // 挡住时依次试的偏转角：擦墙滑开（20°）/ 爬不上去时偏转找路
const ESC_TURN = [0, 0.45, -0.45, 0.9, -0.9];        // 绕檐往外让时试的方向（正后方，再左右偏 25°、50°）
const ESC_BACK = 12, ESC_SINK = 2;                    // 绕檐时最多往外让 12 米（深的抱厦、廊下要退出好几米）、往下沉 2 米
const ESC_DIP = [0, -0.2, -LIFT];                     // 往外让时顺带往下让（每步最多与抬升一样 0.42 米，不一下子掉下去）
// 请求落地时试的落点：正下方，再向外四圈（0.9、1.8、2.7、3.6 米）
const LAND_ORDER = [[0, 0]];
for (const [r, n] of [[0.9, 4], [1.8, 8], [2.7, 8], [3.6, 12]]) for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + (n === 8 ? Math.PI / 8 : 0); LAND_ORDER.push([Math.sin(a) * r, Math.cos(a) * r]); }

const fogMat = (m) => { m.onBeforeCompile = (sh) => injectFog(sh); return m; };
const std = (c, o = {}) => fogMat(new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o }));

// 飞剑（剑尖沿本地 +Y）：剑身 1.55 米、剑脊、剑尖；鎏金剑格、乌木剑柄、鎏金剑首、红穗；外裹一层淡青剑光
// （第十四轮起出剑时手里握的也是这一柄，缩到 0.6 倍，见 character.js）
export function buildSword() {
  const g = new THREE.Group();
  const bladeMat = std(0xdfe9ef, { metalness: 0.92, roughness: 0.16, emissive: 0x5ab8e0, emissiveIntensity: 0.35 });
  const L = 1.55, W = 0.085;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(W, L, 0.014), bladeMat); blade.position.y = L / 2 + 0.08; g.add(blade);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(W * 0.18, L * 0.96, 0.02), std(0xf4f8fa, { metalness: 1, roughness: 0.08, emissive: 0x9fe0ff, emissiveIntensity: 0.4 }));
  ridge.position.y = L / 2 + 0.08; g.add(ridge);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(W * 0.7, 0.16, 4), bladeMat); tip.scale.set(1, 1, 0.2); tip.rotation.y = Math.PI / 4; tip.position.y = L + 0.16; g.add(tip);
  const gold = std(0xc9a45a, { metalness: 0.85, roughness: 0.3 });
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.05), gold); guard.position.y = 0.06; g.add(guard);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.2, 6), std(0x2a1a14)); grip.position.y = -0.06; g.add(grip);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), gold); pommel.position.y = -0.18; g.add(pommel);
  const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.026, 0.26, 5), std(0xa8242a)); tassel.position.y = -0.33; g.add(tassel);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(W * 3.6, L * 1.06, 0.18),
    new THREE.MeshBasicMaterial({ color: 0x8adcf0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  glow.position.y = L / 2 + 0.08;
  g.add(glow);
  g.traverse((o) => { if (o.isMesh && o !== glow) { o.castShadow = true; o.receiveShadow = true; } });
  g.visible = false;
  return { g, bladeMat, glow };
}

// 剑光拖尾：沿飞剑尾部的轨迹画一条面向镜头的带子，离镜头 4–16 米以内渐隐（镜头在身后时不挡视线）
class Trail {
  constructor(scene, n = 48) {
    this.n = n;
    this.pts = [];
    const pos = new Float32Array(n * 2 * 3), a = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { a[i * 2] = a[i * 2 + 1] = i / (n - 1); }
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('aT', new THREE.BufferAttribute(a, 1));
    this.geo.setIndex(idx);
    this.mat = shaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false,
      uniforms: { uColor: { value: new THREE.Color(0x9fe2ff) }, uAlpha: { value: 0 } },
      vertexPars: 'attribute float aT; varying float vT; varying float vD;',
      vertex: 'vT = aT; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); vD = -mvPosition.z; gl_Position = projectionMatrix * mvPosition;',
      fragmentPars: 'uniform vec3 uColor; uniform float uAlpha; varying float vT; varying float vD;',
      fragment: 'float a = pow(1. - vT, 1.8) * uAlpha * smoothstep(4., 16., vD); gl_FragColor = vec4(uColor * (.6 + (1. - vT) * .8) * a, a);',
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  moveTo(scene) { scene.add(this.mesh); }
  reset() { this.pts.length = 0; }
  update(head, camPos, width, alpha) {
    this.mesh.visible = alpha > 0.005;
    if (!this.mesh.visible) { this.pts.length = 0; return; }
    this.pts.unshift(head.clone());
    if (this.pts.length > this.n) this.pts.pop();
    this.mat.uniforms.uAlpha.value = alpha;
    const pos = this.geo.attributes.position.array;
    const t = new THREE.Vector3(), v = new THREE.Vector3(), side = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[Math.min(i, this.pts.length - 1)], q = this.pts[Math.min(i + 1, this.pts.length - 1)];
      t.subVectors(p, q);
      if (t.lengthSq() < 1e-6) t.set(0, 0, 1);
      v.subVectors(camPos, p);
      side.crossVectors(t, v);
      if (side.lengthSq() < 1e-8) side.set(0, 1, 0);
      side.normalize().multiplyScalar(width * (1 - (i / this.n) * 0.7));
      pos.set([p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z], i * 6);
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

const _c = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _up = new THREE.Vector3(0, 1, 0), _bp = new THREE.Vector3(), _bs = new THREE.Vector3();
const _fp = new THREE.Vector3(), _tail = new THREE.Vector3(), _keep = new THREE.Vector3();
const FLIP = new THREE.Matrix4().makeRotationZ(Math.PI);

export class Flight {
  // world()：当前场景的地面与实心体 { terrain, cw, sky: { groundAt(x, z, footY), push(c, r) → 推挤量或 null, solidAt(x, y, z) } }
  constructor(player, scene) {
    this.p = player;
    this.mode = 'ground';
    this.vel = new THREE.Vector3();
    this.t = 0;
    this.blend = 0;               // 0 剑在鞘中 → 1 剑在脚下
    this.bank = 0; this.pitch = 0; this.turn = 0;
    this.boost = 0;
    this.notice = null;           // 给界面的提示（读后清空）
    this.noticeT = 0;
    const sw = buildSword();
    this.sword = sw.g; this.bladeMat = sw.bladeMat; this.glow = sw.glow;
    this.scaleSheath = 0.55; this.scaleFly = 1.35;          // 背负时与剑鞘一般长，御剑时化为两米飞剑（第十五轮换成佩剑后按真实长度重设）
    scene.add(this.sword);
    this.trail = new Trail(scene);
    this.target = null;
    this.stuckT = 0;
    this.inDir = new THREE.Vector3();
    this.esc = null; this.escCool = 0;
  }

  get active() { return this.mode !== 'ground'; }
  // 第十五轮：飞剑换成当前佩剑——同一把剑，鞘中是真实大小，御剑时放大到约 2.1 米；起落时从鞘中飞出、落回鞘中，
  // 手中、鞘中、脚下始终只有一把（flight.pose 与人物的 update 一起管显隐）
  setSwordModel(scene, def) {
    const g = this.sword;
    for (const c of [...g.children]) if (c !== this.glow) g.remove(c);
    const obj = scene.clone(true);
    const mats = [];
    obj.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); mats.push(o.material); o.castShadow = true; o.frustumCulled = false; } });
    g.add(obj);
    const L = def.tip - def.guard[1];
    this.glow.geometry.dispose();
    this.glow.geometry = new THREE.BoxGeometry(Math.max(0.05, def.bladeWidth) * 2.6, L * 1.04, 0.12);
    this.glow.position.set(0, (def.tip + def.guard[1]) / 2, 0);
    const em = mats.filter((m) => m.emissiveMap);
    this.bladeMat = { set emissiveIntensity(v) { for (const m of em) m.emissiveIntensity = 0.6 + v * 0.8; } };
    this.ownedMats?.forEach((m) => m.dispose());
    this.ownedMats = mats;
    this.scaleSheath = 1;
    this.scaleFly = (def.flight?.length || 2.1) / def.length;
    this.footY = -0.052;                                   // 剑面贴着脚底（实测：剑身中面在脚底以下约五厘米时剑面与鞋底齐平）
  }
  moveTo(scene) { scene.add(this.sword); this.trail.moveTo(scene); }

  // 立即回到步行（换场景、传送、力竭后重新放置）
  cancel() {
    this.mode = 'ground'; this.esc = null; this.escCool = 0;
    this.vel.set(0, 0, 0);
    this.blend = 0; this.bank = 0; this.pitch = 0; this.boost = 0;
    this.sword.visible = false;
    this.trail.reset(); this.trail.mesh.visible = false;
    this.p.char.scabTop.visible = true;
    this.p.char.root.rotation.x = 0; this.p.char.root.rotation.z = 0;
    this.target = null;
  }

  // 碰撞世界里头顶以上最近的可走箱体（桥面、台面、楼板）的底面。只挡步行、只挡镜头的箱体（素材殿阁檐下那圈镜头挡板、山岩外扩的一圈、
  // 殿身）不算——它们比看得见的构件大，当天花会在檐下凭空压住人；构筑物本身都在分层实心柱里
  cwCeil(x, z, headY) {
    let g = Infinity;
    this.p.cw.query(x, z, x, z, (c) => {
      if (c.type !== 0 || !c.walk || c.y0 < headY - 0.3 || c.y0 >= g) return;
      const dx = x - c.x, dz = z - c.z, lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
      if (Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz) g = c.y0;
    });
    return g;
  }

  // 头顶的天花：分层实心柱里头顶以上最近的区间底、碰撞世界里屋顶的底面（取低者）
  ceilAbove(x, z, feet) {
    const C = this.p.cols;
    return Math.min(C ? C.ceil(x, z, R_COL, feet + BODY_LO) : Infinity, this.cwCeil(x, z, feet + BODY_H));
  }

  // 起飞：宗门地表，站着、跳起、坠落中都行；头顶要留得出一点空（檐下、廊下、门洞里也能起，升到檐底、廊顶为止）
  takeoff() {
    const P = this.p, air = !P.onGround;
    if (!air) {
      const w = P.terrain.waterAt?.(P.pos.x, P.pos.z);
      if (w != null && w - P.pos.y > 0.25) return '站在水里不便御剑';
    }
    if (this.ceilAbove(P.pos.x, P.pos.z, P.pos.y) - (P.pos.y + BODY_H) < 0.4) return '头顶太低，到开阔处再御剑';
    this.mode = 'takeoff'; this.t = 0; this.esc = null; this.escCool = 0; this.boost = 0;
    this.y0 = P.pos.y;
    this.vel.set(P.vel.x * 0.4, air ? clamp(P.vel.y, -4, 4) : 0, P.vel.z * 0.4);
    P.onGround = false; P.jumping = false;
    this.sword.visible = true;
    return null;
  }

  // 请求落地：找安全落点；找到则降落，找不到则继续飞行并返回原因
  land() {
    if (this.mode === 'landing') return null;
    const P = this.p, s = this.landingSpot(P.pos.x, P.pos.y, P.pos.z);
    if (s.reason) { this.lastH = s.h; return s.reason; }
    this.mode = 'landing'; this.target = s; this.stuckT = 0;
    return null;
  }

  // 脚下（不高于 footY + 0.5）的自然落脚面：地形、水面、可走的台面与台阶（碰撞世界）、浮空岛岛面——飞行时离它留 0.9 米
  groundBelow(x, z, footY) {
    const P = this.p, T = P.terrain;
    let g = T.heightAt(x, z);
    const w = T.waterAt?.(x, z);
    if (w != null) g = Math.max(g, w);
    g = Math.max(g, P.cw.ground(x, z, footY, 0.5));
    const sg = P.skyGround ? P.skyGround(x, z, footY + 0.5) : -Infinity;
    return Math.max(g, sg);
  }

  // 在 (x, z)、脚底原本在 feet 时，脚底至少要多高才不碰东西：自然地面留 clear，脚下的构筑物顶面（屋面、墙头、栏杆）留 0.2 米；
  // 身体高度内撞上的构筑物若比脚底高出不到 STEP_UP 就抬身越过，再高就是墙（返回 Infinity）
  need(x, z, feet, clear, r = R_COL) {
    const C = this.p.cols;
    let n = this.groundBelow(x, z, feet + STEP_UP) + clear;
    if (C) {
      // 构筑物顶面留 0.2 米；降落时（clear 为 0）不留，落到铺地、台面上的落点不会悬着下不去
      const sc = clear > 0 ? STRUCT_CLEAR : 0, top = C.hit(x, z, r, feet + BODY_LO, feet + BODY_H);
      if (top > -Infinity) {
        if (top - feet > STEP_UP) return Infinity;
        if (top + sc > n) n = top + sc;
      }
      const f = C.floor(x, z, r, feet + BODY_LO);
      if (f + sc > n) n = f + sc;
    }
    return n;
  }

  // 脚底在 y 时身体不碰构筑物、头不顶到屋顶（抬身越障之前的检查）
  free(x, z, y) {
    const P = this.p, C = P.cols;
    if (C && C.hit(x, z, R_COL, y + BODY_LO, y + BODY_H) > -Infinity) return false;
    return this.cwCeil(x, z, y + BODY_H - 0.3) > y + BODY_H;
  }

  // 落下后走得出去：从落点往八个方向，按步行的同一套判定迈出第一小步（5 厘米，连同碰撞体推挤；落点压在山岩外扩的挡块、
  // 墙脚里时迈不出去）、再挪出 0.8 米也能走，至少三个方向（四面陡坡、谷底、断崖、围栏里的小块平地不落）
  walkable(x, y, z) {
    const P = this.p, keep = _keep.copy(P.pos);
    let n = 0;
    for (let k = 0; k < 8 && n < 3; k++) {
      const a = (k / 8) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
      P.pos.set(x, y, z);
      if (!P.tryMove(x + s * 0.05, z + c * 0.05)) continue;
      P.pos.set(x, y, z);
      if (P.canEnter(x + s * 0.8, z + c * 0.8)) n++;
    }
    P.pos.copy(keep);
    return n >= 3;
  }

  // 正下方（3.6 米内）的安全落点：{ x, y, z } 或 { reason }
  landingSpot(px, py, pz) {
    const P = this.p, T = P.terrain, cw = P.cw, C = P.cols;
    const prio = { blocked: 1, cramped: 2, steep: 3, water: 4, roof: 5, edge: 6, out: 7, high: 8 };
    let why = null;
    const fail = (k) => { if (!why || prio[k] > prio[why]) why = k; };
    for (const [dx, dz] of LAND_ORDER) {
      const x = px + dx, z = pz + dz;
      const sg = P.skyGround ? P.skyGround(x, z, py) : -Infinity;
      const inCore = T.inCore(x, z, 5), onIsle = sg > -1e8;
      // 自然地面：宗门核心区的地形，或浮空岛岛面；两者都没有（山野、深谷上空）不落
      const base = onIsle ? sg : inCore ? T.heightAt(x, z) : -Infinity;
      if (!(base > -1e8)) { fail('out'); continue; }
      const g = Math.max(base, cw.ground(x, z, py, 0));
      if (py - g > FLY.maxDrop) { fail('high'); continue; }
      if (inCore && !onIsle) {
        const w = T.waterAt(x, z);
        if (w != null && w - T.heightAt(x, z) > 0.3 && w >= g - 0.05) { fail('water'); continue; }
      }
      if (g - base > 4.2) { fail('roof'); continue; }                           // 屋顶、墙头、高台上
      // 落下去的竖直通道里（身体半径内）没有构筑物：栏杆、石灯、香炉、屋檐、廊顶……
      if (C) {
        const st = C.hit(x, z, R_COL + 0.15, g + 0.15, Math.max(py, g) + BODY_H);
        if (st > -Infinity) { fail(st - base > 4.2 && st <= py + 0.5 ? 'roof' : 'blocked'); continue; }
      }
      // 周围四点（0.8 米）都得是差不多高的落脚面（岛沿、墙头、台沿、陡坡都不行）
      let flat = true, edge = false;
      for (const [ax, az] of [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]) {
        const sg2 = P.skyGround ? P.skyGround(x + ax, z + az, g + 1.5) : -Infinity;
        let g2 = Math.max(sg2, cw.ground(x + ax, z + az, g + 0.6, 0));
        if (T.inCore(x + ax, z + az, 5)) g2 = Math.max(g2, T.heightAt(x + ax, z + az));
        if (!(g2 > -1e8) || g - g2 > 1.2) { edge = true; break; }
        if (Math.abs(g2 - g) > 0.55) { flat = false; break; }
      }
      if (edge) { fail(onIsle ? 'edge' : 'roof'); continue; }
      if (!flat) { fail('steep'); continue; }
      // 树干、石块（碰撞世界的圆柱）不压在落点上
      let blocked = false;
      cw.query(x - 1, z - 1, x + 1, z + 1, (c) => {
        if (blocked || c.type !== 1 || c.y1 <= g + 0.25 || c.y0 >= py + 0.5) return;
        if (Math.hypot(x - c.x, z - c.z) < c.r + 0.45) blocked = true;
      });
      if (blocked) { fail('blocked'); continue; }
      if (!this.walkable(x, g, z)) { fail('cramped'); continue; }
      return { x, y: g, z };
    }
    const nat = Math.max(T.heightAt(px, pz), P.skyGround ? P.skyGround(px, pz, py) : -Infinity, cw.ground(px, pz, py, 0)), h = py - nat;
    // 正停在屋面、塔身、塔刹上（脚下几米就是建筑表面、离地面还远）：提示先飞离建筑，而不是「按 C 降低」
    const st0 = C ? C.floor(px, pz, R_COL, py + 0.3) : -Infinity;
    if (st0 > nat + 4.2 && py - st0 < 6) why = 'roof';
    return { reason: why || 'out', h };
  }

  // 每帧：inp = { x, y（WASD，镜头相对）, up, down, boost, yaw（镜头偏航）}；返回 true 表示仍在飞行（步行逻辑跳过）
  update(dt, inp, camPos) {
    const P = this.p;
    if (this.mode === 'ground' && this.blend < 0.002) { this.sword.visible = false; this.trail.update(_tail, camPos, 0, 0); return false; }
    const prevHeading = P.heading;
    if (this.mode !== 'ground') {
      const fx = Math.sin(inp.yaw), fz = Math.cos(inp.yaw);
      let mx = fx * inp.y - fz * inp.x, mz = fz * inp.y + fx * inp.x;
      const ml = Math.hypot(mx, mz);
      if (ml > 1) { mx /= ml; mz /= ml; }
      this.inDir.set(ml > 0.1 ? mx / ml : 0, 0, ml > 0.1 ? mz / ml : 0);    // 玩家想去的水平方向（绕檐、爬墙用）
      const boosting = inp.boost && ml > 0.1;
      this.boost = lerp(this.boost, boosting ? 1 : 0, damp(2.5, dt));
      const sp = lerp(FLY.cruise, FLY.boost, this.boost), vs = lerp(FLY.vert, FLY.vertBoost, this.boost);
      let tx = mx * sp, tz = mz * sp, ty = (inp.up - inp.down) * vs;
      if (this.mode === 'takeoff') {
        this.t += dt;
        const u = Math.min(1, this.t / FLY.takeoff), k = u < 0.4 ? 0 : (u - 0.4) / 0.6;
        tx *= k; tz *= k;
        ty = Math.max(ty, (this.y0 + FLY.rise * (1 - (1 - u) * (1 - u)) - P.pos.y) / Math.max(dt, 1e-3));
        if (u >= 1) this.mode = 'fly';
      } else if (this.mode === 'landing') {
        // 自动降落：水平对准落点，竖直随离地高度由快到慢；按空格、WASD 取消降落
        if (inp.up || ml > 0.1) { this.mode = 'fly'; this.target = null; this.notice = '取消降落'; }
        else {
          const T0 = this.target, dx = T0.x - P.pos.x, dz = T0.z - P.pos.z, dh = Math.hypot(dx, dz), dy = P.pos.y - T0.y;
          const hs = Math.min(6, dh * 2.2);
          tx = dh > 1e-4 ? (dx / dh) * hs : 0; tz = dh > 1e-4 ? (dz / dh) * hs : 0;
          ty = -clamp(dy * 1.15, 1.6, 14);
          if (dh < 0.2 && (dy < 0.08 || (dy < 0.3 && this.vel.y > -0.3))) { this.touchDown(T0); return false; }   // 末了几厘米被铺地边沿托住也算落地
          this.stuckT = Math.hypot(this.vel.x, this.vel.y, this.vel.z) < 0.4 ? this.stuckT + dt : 0;
          if (this.stuckT > 1.6) { this.mode = 'fly'; this.target = null; this.notice = '落点被挡住了，换一处再落'; }
        }
      }
      // 速度向目标平滑靠拢：加速稍快、减速稍缓（起停都不突兀）
      const accel = this.mode === 'landing' ? 4 : (tx * tx + tz * tz) > this.vel.x * this.vel.x + this.vel.z * this.vel.z ? 2.4 : 1.7;
      const kh = damp(accel, dt), kv = damp(this.mode === 'takeoff' ? 12 : 3.2, dt);
      this.vel.x = lerp(this.vel.x, tx, kh); this.vel.z = lerp(this.vel.z, tz, kh); this.vel.y = lerp(this.vel.y, ty, kv);
      this.integrate(dt);
      // 朝向：移动时朝运动方向，悬停时慢慢转向镜头所对的方向；转弯时身体与飞剑向内侧倾
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (hs > 1.5) P.heading = lerpAngle(P.heading, Math.atan2(this.vel.x, this.vel.z), damp(4, dt));
      else P.heading = lerpAngle(P.heading, inp.yaw, damp(1.6, dt));
      this.turn = lerp(this.turn, wrapAngle(P.heading - prevHeading) / Math.max(dt, 1e-3), 0.15);
      this.bank = lerp(this.bank, clamp(-this.turn * 0.16 * Math.min(1, hs / 8), -0.3, 0.3), damp(4, dt));
      this.pitch = lerp(this.pitch, clamp(hs / FLY.boost * 0.14 - this.vel.y * 0.008, -0.12, 0.2), damp(3, dt));
      P.vel.copy(this.vel);
    }
    this.blend = lerp(this.blend, this.mode === 'ground' ? 0 : 1, damp(this.mode === 'ground' ? 7 : 5, dt));
    return this.mode !== 'ground';
  }

  touchDown(T0) {
    const P = this.p;
    P.pos.set(T0.x, T0.y, T0.z);
    P.vel.set(0, 0, 0); this.vel.set(0, 0, 0);
    P.onGround = true; P.jumping = false;
    this.mode = 'ground'; this.target = null; this.esc = null; this.escCool = 0;
    this.bank = 0; this.pitch = 0;
    this.notice = '落地 · 收剑入鞘';
  }

  // 分步推进与碰撞（每步不超过 0.35 米，高速也不穿模）
  integrate(dt) {
    const P = this.p, B = FLY.bounds, pos = P.pos;
    const dist = Math.hypot(this.vel.x, this.vel.y, this.vel.z) * dt, n = Math.max(1, Math.ceil(dist / STEP));
    const sx = (this.vel.x * dt) / n, sy = (this.vel.y * dt) / n, sz = (this.vel.z * dt) / n;
    const landing = this.mode === 'landing', clear = landing ? 0 : FLY.clear;
    for (let i = 0; i < n; i++) {
      const y0 = pos.y;
      // 0) 万一身体已经嵌在构筑物里（贴墙起飞、浮点误差）：先就近挪到空处
      if (this.need(pos.x, pos.z, pos.y, clear) === Infinity) this.depenetrate(clear);
      // 1) 竖直：上升时头顶不进屋檐、门楣、廊顶；下降见第 5 步
      if (sy > 0) {
        const cap = this.ceilAbove(pos.x, pos.z, pos.y) - BODY_H - 0.04;
        if (pos.y + sy > cap) { if (cap > pos.y) pos.y = cap; if (this.vel.y > 0) this.vel.y = 0; }
        else pos.y += sy;
      } else pos.y += sy;
      // 2) 水平：构筑物与地形（越障、贴坡、沿墙滑）
      if (Math.abs(sx) > 1e-6 || Math.abs(sz) > 1e-6) this.stepH(sx, sz, clear);
      // 3) 树干、石块（抬身越过石块时与上一步共用这一步的抬升余量）
      // （降落的最后一段不管：落点查过四周没有树干、石块，落点旁贴地的矮石不该把人托住）
      if (!landing || Math.hypot(this.target.x - pos.x, this.target.z - pos.z) > 0.6) this.pushCyl(y0 + Math.max(sy, 0) + LIFT);
      // 4) 浮空岛与塔岛的岛体（球体推挤，撞上的那个方向的速度去掉）
      if (P.skyPush) {
        _c.set(pos.x, pos.y + Y_BODY, pos.z); _b.copy(_c);
        if (P.skyPush(_c, R_BODY)) {
          _n.subVectors(_c, _b);
          pos.set(_c.x, _c.y - Y_BODY, _c.z);
          if (_n.lengthSq() > 1e-10) { _n.normalize(); const vn = this.vel.dot(_n); if (vn < 0) this.vel.addScaledVector(_n, -vn); }
        }
      }
      // 5) 脚下：地形、水面、台面、岛面留 0.9 米，构筑物顶面留 0.2 米（降落时直到落点为止）；
      //    这一步里越障、爬坡已经抬过的高度算在内，一步合计最多抬 LIFT（高速时也不跳）
      const nd = this.need(pos.x, pos.z, pos.y, clear);
      if (nd !== Infinity && pos.y < nd) {
        const room = Math.max(0, y0 + Math.max(sy, 0) + LIFT - pos.y);
        pos.y = Math.min(nd, pos.y + Math.max(room, -sy + 0.01));
        if (this.vel.y < 0) this.vel.y = 0;
      }
    }
    // 高度上限与云海结界：柔和推回并提示
    if (pos.y > FLY.ceiling) { pos.y = FLY.ceiling; if (this.vel.y > 0) this.vel.y = 0; this.warn('再往上是罡风层，不可再高'); }
    const m = 40;
    if (pos.x < B.x0 + m || pos.x > B.x1 - m || pos.z < B.z0 + m || pos.z > B.z1 - m) {
      const px = clamp(pos.x, B.x0 + m, B.x1 - m), pz = clamp(pos.z, B.z0 + m, B.z1 - m);
      pos.x = lerp(pos.x, px, damp(3, dt)); pos.z = lerp(pos.z, pz, damp(3, dt));
      if (pos.x < B.x0 || pos.x > B.x1 || pos.z < B.z0 || pos.z > B.z1) { pos.x = clamp(pos.x, B.x0, B.x1); pos.z = clamp(pos.z, B.z0, B.z1); }
      const ox = pos.x - px, oz = pos.z - pz, ol = Math.hypot(ox, oz);
      if (ol > 1e-3) { const vn = (this.vel.x * ox + this.vel.z * oz) / ol; if (vn > 0) { this.vel.x -= (ox / ol) * vn; this.vel.z -= (oz / ol) * vn; } }
      this.warn('前方是护山云海结界，不可再往前');
    }
  }

  // 水平一步：走得通就走（顺带抬身越过矮障碍、贴着缓坡爬升，每步最多抬 LIFT；一步抬不完就先原地抬，下一步再前进）；
  // 墙、崖、高台挡住时：斜擦上去的（偏转 20° 走得通）沿墙滑开；正面顶上去的顺着往上爬；头顶挡着就往外让开再上（绕檐）；
  // 都不行才大角度偏转找路
  stepH(sx, sz, clear) {
    const P = this.p, pos = P.pos, v = this.vel;
    const tryTo = (x, z) => {
      const nd = this.need(x, z, pos.y, clear);
      if (nd === Infinity || nd - pos.y > CLIMB) return null;
      if (nd > pos.y + 0.01 && !this.free(x, z, nd)) return null;          // 抬起来头顶有东西
      return nd > pos.y ? nd : pos.y;
    };
    const go = (x, z, y) => {
      if (y - pos.y <= LIFT) { if (y > pos.y && v.y < 0) v.y = 0; pos.x = x; pos.z = z; pos.y = y; return true; }   // 被地面、台面托起时下降的速度归零
      if (this.free(pos.x, pos.z, pos.y + LIFT)) { pos.y += LIFT; return true; }
      return false;
    };
    const len = Math.hypot(sx, sz), up = Math.min(LIFT, len * 0.9);
    // 绕檐：正面顶着墙、头顶又有檐口（岩檐）伸出来盖在墙顶之下时，直接往上爬只会钻进檐下卡住——先往外让（檐口外沿往往更低，
    // 必要时略往下让），让到头顶敞开了再往上，直到高过墙顶，再往前翻过去。这期间不往前；松开前进、改了方向、
    // 或一直绕不出去（约 2 秒、让出 12 米还在檐下）就作罢；让不开、升不上去（墙角里、身后也挡着）时先偏转着顺墙找路，过一会儿再试
    if (this.escCool > 0) this.escCool--;
    if (this.esc) {
      const E = this.esc, fwd = -(this.inDir.x * E.fx + this.inDir.z * E.fz);
      if (fwd < 0.5 || ++E.n > 120 || pos.y >= E.top + 0.3) this.esc = null;
      else if (E.d > ESC_BACK) { this.esc = null; this.escCool = 90; }
      else {
        const ceil = this.ceilAbove(pos.x, pos.z, pos.y);
        if (ceil > E.top + BODY_H + 0.3) {                                    // 头顶敞开了：往上
          if (this.free(pos.x, pos.z, pos.y + up)) { pos.y += up; return; }
        } else {
          const k = Math.min(STEP, Math.max(len, 0.12) * 1.5);
          for (const [ux, uz] of E.dirs) for (const da of ESC_TURN) {
            const c = Math.cos(da), sn = Math.sin(da), nx = pos.x + (ux * c - uz * sn) * k, nz = pos.z + (ux * sn + uz * c) * k;
            for (const dy of ESC_DIP) {
              const ny = pos.y + dy, nd = this.need(nx, nz, ny, clear);
              if (nd === Infinity) continue;
              const yy = Math.max(ny, nd);
              if (yy - pos.y <= LIFT && this.free(nx, nz, yy)) { E.d += k; pos.x = nx; pos.z = nz; pos.y = yy; return; }
            }
          }
          // 身后低处还压着一道檐口（层层叠落的廊檐之间）：先原地往下沉，沉到檐口以下再往外让
          const d = Math.max(up, 0.2), ny = pos.y - d;
          if (E.dn < ESC_SINK && this.need(pos.x, pos.z, ny, clear) <= ny + 0.02 && this.free(pos.x, pos.z, ny)) { E.dn += d; pos.y = ny; return; }
        }
        this.esc = null; this.escCool = 24;
      }
    }
    let y = tryTo(pos.x + sx, pos.z + sz);
    if (y != null && go(pos.x + sx, pos.z + sz, y)) return;
    const slide = (angles) => {
      for (const da of angles) {
        const c = Math.cos(da), sn = Math.sin(da), k = Math.max(0.35, c);
        const dx = (sx * c - sz * sn) * k, dz = (sx * sn + sz * c) * k;
        const yy = tryTo(pos.x + dx, pos.z + dz);
        if (yy != null && go(pos.x + dx, pos.z + dz, yy)) {
          // 速度转到滑开的方向上（去掉顶着墙的那一份）
          const ux = dx / (len * k), uz = dz / (len * k), vp = v.x * ux + v.z * uz;
          v.x = ux * Math.max(0, vp); v.z = uz * Math.max(0, vp);
          return true;
        }
      }
      return false;
    };
    // 斜着擦上墙、崖（偏转 20° 以内走得通）：沿着滑过去
    if (slide(SLIDE_NEAR)) return;
    // 正面顶着墙、崖、殿身：头顶敞开（没有檐口压在墙顶之下）就顺着往上爬，翻过去再往前；否则开始绕檐
    if (up > 0.002) {
      const C = P.cols, ceil = this.ceilAbove(pos.x, pos.z, pos.y);
      const ahead = C ? C.hit(pos.x + (sx / len) * 0.6, pos.z + (sz / len) * 0.6, R_COL, pos.y + BODY_LO, pos.y + BODY_H) : -Infinity;
      if (ceil > Math.max(ahead, pos.y + BODY_H) + 0.3) {
        if (this.free(pos.x, pos.z, pos.y + up)) { pos.y += up; return; }
      } else if (!this.escCool) {
        // 往外让的方向：先试与前进相反的方向；不行再试往墙面法向（四周哪几面挡着）偏一半的方向——斜着顶上墙、
        // 身后侧正好有柱子时不往柱子上退
        const d0 = Math.hypot(this.inDir.x, this.inDir.z) > 0.5 ? this.inDir : null, fx = d0 ? -d0.x : -sx / len, fz = d0 ? -d0.z : -sz / len;
        const dirs = [[fx, fz]];
        let wx = 0, wz = 0;
        if (C) for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
          if (C.hit(pos.x + dx * 0.6, pos.z + dz * 0.6, R_COL, pos.y + BODY_LO, pos.y + BODY_H) > pos.y + STEP_UP) { wx -= dx; wz -= dz; }
        }
        const wl = Math.hypot(wx, wz);
        if (wl > 1e-3 && wx * fx + wz * fz > 0) { const bx = fx + wx / wl, bz = fz + wz / wl, bl = Math.hypot(bx, bz); dirs.push([bx / bl, bz / bl]); }
        this.esc = { fx, fz, dirs, n: 0, d: 0, dn: 0, top: ahead > -Infinity ? ahead : ceil };
        return;
      }
    }
    // 头顶、身后都挡着：偏转着找路，再不行就停下
    if (slide(SLIDE_FAR)) return;
    v.x *= 0.3; v.z *= 0.3;
  }

  // 身体嵌在构筑物里时就近挪到空处（向外 0.2–1.5 米、八个方向里第一个空着的）；都不空就往上抬
  depenetrate(clear) {
    const pos = this.p.pos;
    for (const r of [0.2, 0.4, 0.7, 1.0, 1.5]) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2, x = pos.x + Math.sin(a) * r, z = pos.z + Math.cos(a) * r;
        const nd = this.need(x, z, pos.y, clear);
        if (nd !== Infinity && nd - pos.y <= LIFT && this.free(x, z, Math.max(pos.y, nd))) { pos.x = x; pos.z = z; pos.y = Math.max(pos.y, nd); return; }
      }
    }
    if (this.free(pos.x, pos.z, pos.y + LIFT)) pos.y += LIFT;
  }

  // 树干、石块（碰撞世界的竖直圆柱）：矮的（石块）抬身越过——这一步抬升的余量（cap：脚底最多到这个高度，与越障、贴坡共用）
  // 不够时下一步接着抬，不横推；高的水平推开（一步最多推 0.4 米，嵌得深也是几步推出，不跳），速度转到切向（保持快慢）绕过去；
  // 一步里被好几根挤着（竹林、密林）就往上让，从树梢上过去
  pushCyl(cap) {
    const P = this.p, pos = P.pos, v = this.vel, x0 = pos.x - R_CYL - 1.5, z0 = pos.z - R_CYL - 1.5, x1 = pos.x + R_CYL + 1.5, z1 = pos.z + R_CYL + 1.5;
    const touch = (c) => c.type === 1 && c.y1 > pos.y + BODY_LO && c.y0 < pos.y + BODY_H && (pos.x - c.x) ** 2 + (pos.z - c.z) ** 2 < (R_CYL + c.r) ** 2;
    let over = -Infinity;
    const low = this._low || (this._low = []);
    low.length = 0;
    P.cw.query(x0, z0, x1, z1, (c) => {
      if (touch(c) && c.y1 - pos.y <= STEP_UP && this.free(pos.x, pos.z, c.y1 + STRUCT_CLEAR)) { low.push(c); if (c.y1 + STRUCT_CLEAR > over) over = c.y1 + STRUCT_CLEAR; }
    });
    if (over > pos.y && cap > pos.y) pos.y = Math.min(over, cap);
    let hits = 0;
    P.cw.query(x0, z0, x1, z1, (c) => {
      if (!touch(c) || low.includes(c)) return;
      const dx = pos.x - c.x, dz = pos.z - c.z, R = R_CYL + c.r, d = Math.hypot(dx, dz), nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
      const k = Math.min(R - d, 0.4);
      pos.x += nx * k; pos.z += nz * k;
      hits++;
      const vn = v.x * nx + v.z * nz;
      if (vn < 0) {
        const sp = Math.hypot(v.x, v.z);
        const tx = -nz, tz = nx, vt = v.x * tx + v.z * tz, sgn = Math.abs(vt) > 1e-3 ? Math.sign(vt) : 1;
        v.x = tx * sgn * sp; v.z = tz * sgn * sp;
      }
    });
    const up = Math.min(LIFT * 0.6, cap - pos.y);
    if (hits > 1 && up > 0.01 && this.free(pos.x, pos.z, pos.y + up)) pos.y += up;
  }

  warn(text) {
    const now = performance.now();
    if (now - this.noticeT < 4000) return;
    this.noticeT = now;
    this.notice = text;
  }

  // 角色动画之后：飞剑位置（背后 ↔ 脚下）、剑光、拖尾、身体倾侧
  pose(dt, camPos) {
    const P = this.p, ch = P.char, sb = this.blend, flying = this.mode !== 'ground';
    const root = ch.root;
    root.rotation.order = 'YXZ';
    root.rotation.x = flying ? this.pitch * 0.5 : lerp(root.rotation.x, 0, damp(8, dt));
    root.rotation.z = flying ? this.bank * 0.6 : lerp(root.rotation.z, 0, damp(8, dt));
    if (sb < 0.002 && !flying) { this.sword.visible = false; ch.scabTop.visible = !ch.handSword?.visible; this.trail.update(_tail, camPos, 0, 0); return; }   // 剑在手里时背上只剩剑鞘
    this.sword.visible = true;
    ch.scabTop.visible = false;                           // 飞剑在外（含起落途中）：鞘中不再画一把（第十五轮：免得落地时两把剑同时出现）
    // 背后：剑鞘口（剑柄朝上）；脚下：剑身水平、剑尖朝前，随转弯侧倾、随升降俯仰
    _m.copy(ch.scabbardMatrix()).multiply(FLIP);
    _m.decompose(_bp, _q, _bs);
    _q2.setFromAxisAngle(_up, P.heading);
    _e.set(Math.PI / 2 + clamp(-this.vel.y / 60, -0.25, 0.25), this.bank * 1.2, 0);       // 先绕剑身自转（侧倾），再放平
    const fq = _q2.clone().multiply(new THREE.Quaternion().setFromEuler(_e));
    _fp.set(0, this.footY ?? -0.05, -0.72).applyQuaternion(_q2).add(P.pos);
    const k = smoothstep(0, 1, sb);
    this.sword.position.lerpVectors(_bp, _fp, k);
    this.sword.quaternion.slerpQuaternions(_q, fq, k);
    this.sword.scale.setScalar(this.scaleSheath + k * (this.scaleFly - this.scaleSheath));   // 鞘中原大 → 脚下的飞剑
    this.bladeMat.emissiveIntensity = 0.25 + k * 0.5 + this.boost * 0.6;
    this.glow.material.opacity = k * 0.05 + this.boost * 0.1;
    const spd = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    _tail.set(0, -0.08, -0.85).applyQuaternion(_q2).add(P.pos);
    const a = flying ? smoothstep(5, 24, spd) * (0.35 + this.boost * 0.35) : 0;
    this.trail.update(_tail, camPos, 0.07 + this.boost * 0.16, a);
  }
}

// 主循环用：飞行时的输入（WASD 镜头相对；空格上升、C 下降、Shift 加速）
export function flightInput(input, mv, yaw) {
  const has = (k) => input.has(k);
  const locked = input.moveLocked;
  return {
    x: locked ? 0 : mv.x, y: locked ? 0 : mv.y, yaw,
    up: !locked && (has('Space') || input.touchUp) ? 1 : 0,
    down: (!locked && (has('KeyC') || input.touchDown)) || input.forceDown ? 1 : 0,       // 第二十一轮：筑基御剑的真元耗尽时自行缓降
    boost: !locked && !!mv.run,
  };
}
export { CORE };
