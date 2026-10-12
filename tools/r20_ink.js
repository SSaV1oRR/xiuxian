// 第二十轮自检工具：水墨特效（普攻、拔刀斩）与拔刀斩的新站姿。都按真实的输入、出招、结算、特效代码推进（__qinglan.tick），不是另写一套。
// 用法（预览）：const T = await import('/tools/r20_ink.js?v=' + Date.now());
//   await T.setup(); await T.arena();                 开局、到演武场比试圈（空场）
//   await T.rebuildIai()                               改了 cultivatorClips.js / cultivatorPose.js 的 IAI_SHEATH 之后，页内重编拔刀斩的四段动作（不刷新）
//   await T.stanceShots('r20_tmp_st_')                 蓄势姿势：常用的跟随镜头（背后 8 米、俯 17°）与其他五个机位的截图
//   T.weaponVis()                                       同样六个机位：剑柄、剑鞘有几成没被身体挡住（GPU 逐像素数）
//   T.blade() / T.combo() / T.cancels() / T.charge() / T.release() / T.perf()      见各函数说明
import * as B from './r17_combat_bot.js';
import * as R19 from './r19_iai.js';
import { PLAYER_MOVES as PM, PLAYER_COMBAT as PC } from '/src/game/combatConfig.js';

const Q = () => window.__qinglan;
export const { setup, toArena, tick, dummy } = B;
export const { recStart, recStop, recSub, recTick, flush } = R19;
// 定格动作时的佩剑与鞘（第二十轮：多了鞘在蓄势 / 出刀两个位置之间的 sp）：与 moves.iaiLook 同一规则
const sm = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
function track(T, t) { if (!T) return null; const X = T.times, n = X.length; if (t <= X[0]) return T.v[0]; if (t >= X[n - 1]) return T.v[n - 1]; let i = 0; while (i < n - 2 && X[i + 1] <= t) i++; return T.v[i] + (T.v[i + 1] - T.v[i]) * (t - X[i]) / (X[i + 1] - X[i]); }
export function lookAt(clip, t) {
  const ch = Q().player.char, D = (n) => ch.clips[n].data, M = (n) => D(n).marks;
  if (clip === 'iai_enter') return { drawn: t < M('iai_enter').sheathed, tilt: sm(t / M('iai_enter').tilt), sp: track(D('iai_enter').sheathPose, t) ?? 1 };
  if (clip === 'iai_hold' || clip === 'iai_walk') return { drawn: false, tilt: 1, sp: track(D(clip).sheathPose, t) ?? 1 };
  if (clip === 'iai_slash') return { drawn: t >= M('iai_slash').draw, tilt: 1 - sm((t - 0.22) / 0.28), pull: track(D('iai_slash').pull, t) ?? 0, sp: track(D('iai_slash').sheathPose, t) ?? 1 };
  return R19.lookAt(clip, t);
}
export function pose(clip, t, look = null) {
  const A = Q(), P = A.player, ch = P.char, L = look || lookAt(clip, t);
  A.moves.reset(); ch.anim.clear();
  ch.anim.play(clip, { from: t, to: t + 0.001, speed: 0, hold: true, fade: 0, mask: L.mask || 'full' });
  ch.anim.update(0);
  ch.drawnSnap = true; ch.sheathTilt = L.tilt ?? 0; ch.sheathPull = L.pull ?? 0; ch.sheathPose = L.sp ?? 1; ch.gourdInHand = +L.gourd || 0;
  for (let i = 0; i < 2; i++) ch.update(1 / 60, P.pos, P.heading, { mode: 'walk', onGround: true, speed: 0, drawn: L.drawn ?? true });
}
function unpose() { const ch = Q().player.char; ch.anim.stop(0); ch.drawnSnap = false; ch.sheathTilt = 0; ch.sheathPull = 0; ch.sheathPose = 1; ch.gourdInHand = 0; }
// 换手的那一帧：手中的剑与鞘中的剑相差多少（剑柄原点的距离，厘米；剑身、刃口方向的夹角，度）
export function swapCheck(times = [['iai_enter', 0.18], ['iai_slash', 0], ['iai_slash', 0.0333], ['iai_slash', 0.045], ['iai_hold', 0], ['iai_hold', 1.0], ['iai_walk', 0.25], ['iai_walk', 0.75]]) {
  const A = Q(), T = A.THREE, ch = A.player.char, out = [];
  const frame = (o) => { o.updateWorldMatrix(true, false); const p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3(); o.matrixWorld.decompose(p, q, s); return { p, y: new T.Vector3(0, 1, 0).applyQuaternion(q), x: new T.Vector3(1, 0, 0).applyQuaternion(q) }; };
  for (const [clip, t] of times) {
    const L = lookAt(clip, t);
    pose(clip, t, { ...L, drawn: false });
    const a = frame(ch.handSword), b = frame(ch.scabTop);
    out.push({ clip, t, gripCm: r2(a.p.distanceTo(b.p) * 100), bladeDeg: r2(a.y.angleTo(b.y) * 180 / Math.PI), edgeDeg: r2(a.x.angleTo(b.x) * 180 / Math.PI) });
  }
  unpose();
  return out;
}
// 出刀时剑身是否斜穿鞘壁：逐帧看剑身上还在鞘的长度范围内的各点离鞘轴多远（inCm 还在鞘里的长度、offCm 离鞘轴最远的一点；鞘的内径约 2 厘米）
export function drawCheck(from = 0, to = 0.2) {
  const A = Q(), ch = A.player.char, T3 = A.THREE, S = ch.sword, out = [];
  const len = S.tip - S.guard[0];
  for (let t = from; t <= to + 1e-6; t += 1 / 60) {
    pose('iai_slash', t, { ...lookAt('iai_slash', t), drawn: true });
    ch.scabTop.updateWorldMatrix(true, false);
    const m = ch.scabTop.matrixWorld, ax = new T3.Vector3(0, 1, 0).transformDirection(m);
    const mouth = new T3.Vector3().setFromMatrixPosition(m).addScaledVector(ax, S.guard[0] + 0.01);
    const tip = new T3.Vector3(), base = new T3.Vector3();
    ch.bladeEnds(tip, base);
    let inLen = 0, off = 0;
    for (let k = 0; k <= 40; k++) {
      const p = base.clone().lerp(tip, k / 40), d = p.clone().sub(mouth), sA = d.dot(ax);
      if (sA > 0.01 && sA < len) { inLen += base.distanceTo(tip) / 40; off = Math.max(off, d.addScaledVector(ax, -sA).length()); }
    }
    out.push({ t: r3(t), inCm: Math.round(inLen * 100), offCm: r2(off * 100) });
  }
  unpose();
  return { sword: S.id, bladeCm: Math.round(len * 100), frames: out };
}
const r1 = (v) => +(+v).toFixed(1), r2 = (v) => +(+v).toFixed(2), r3 = (v) => +(+v).toFixed(3);
let RING = window.__r20ring || null;          // 演武场比试圈（arena() 之后有；存在 window 上，重新载入本工具后还在）

// 每次测试前：招式、蓄力、冷却、灵力、气血归位，水墨特效全收，人站回比试圈中央、朝北
export function fresh(yaw = Math.PI) {
  const A = Q(), M = A.moves, C = A.combat, P = A.player;
  M.reset(); for (const k in M.cools) M.cools[k] = 0; M.mp = 100;
  C.playerUnit.hp = C.playerUnit.maxHp; C.playerUnit.alive = true;
  A.input.keys.clear();
  if (RING) P.place(RING.cx, RING.cz + 2, yaw, RING.y);
  P.heading = yaw; P.vel.set(0, 0, 0);
  // 镜头顺着人物朝向（没有目标时出招朝镜头所对的方向——测试里要朝前）
  A.cam.set(yaw, 0.3, 8); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55));
  C.dummies = C.dummies.filter((x) => !x.test);
  A.sfx.ink?.clear(true);
  tick(10, 1 / 60, false);
}
export async function arena() { RING = window.__r20ring = await toArena(); B.quietDragons(true); fresh(); return RING; }       // 护宗双龙不出手（会烧到测试里的魔修）

// =====================================================================================
// 拔刀斩站姿
// =====================================================================================
// 页内重编拔刀斩的四段动作：新载入 cultivatorClips.js / cultivatorPose.js（磁盘上改过的），鞘的蓄势位置（IAI_SHEATH）同步进运行中的模块，
// 修士重新算蓄势时的鞘
// dir：从别处载入（如 '_r19'：第十九轮的动作与姿势代码，对照用；那时只有一个鞘的位置）——先把 backups/xiuxian-r19-20261010-0243.zip 里的
//   src/actors/cultivatorClips.js、cultivatorPose.js、boss50Pose.js 解到 src/actors/_r19/（本轮的对照做完后已删掉）
export async function rebuildIai(only = ['iai_enter', 'iai_hold', 'iai_walk', 'iai_slash'], dir = null) {
  const A = Q(), v = Date.now(), ch = A.player.char, base = dir ? `/src/actors/${dir}/` : '/src/actors/';
  const [fresh, live, C, CU] = await Promise.all([import(base + 'cultivatorPose.js?v=' + v), import('/src/actors/cultivatorPose.js'), import(base + 'cultivatorClips.js?v=' + v), import('/src/actors/cultivator.js')]);
  Object.assign(live.IAI_SHEATH, JSON.parse(JSON.stringify(fresh.IAI_SHEATH)));
  if (live.IAI_SHEATH_HOLD) Object.assign(live.IAI_SHEATH_HOLD, JSON.parse(JSON.stringify(fresh.IAI_SHEATH_HOLD || { pos: fresh.IAI_SHEATH.pos, dir: fresh.IAI_SHEATH.dir })));
  const { clips, report } = C.buildCultivatorClips(ch, { only, Pose: fresh.CultivatorPose });
  CU.Cultivator.addClips(clips, ch, ...A.combat.duelists.map((d) => d.char));
  if (ch.sword) {
    ch.sheathIai = CU.sheathPose(live.IAI_SHEATH.pos, live.IAI_SHEATH.dir, ch.sword.guard[0]);
    if (live.IAI_SHEATH_HOLD) ch.sheathHold = CU.sheathPose(live.IAI_SHEATH_HOLD.pos, live.IAI_SHEATH_HOLD.dir, ch.sword.guard[0]);
    ch.applySheath(ch.sheathTilt || 0, ch.sheathPull || 0, ch.sheathPose ?? 1);
  }
  return report;
}

// 机位（相对人物朝向）：常用的跟随镜头 = 背后、俯 0.3 弧度（17°）、8 米，看向头顶上方 0.3 米（与 actors/camera.js 一样）
export const VIEWS = [
  { name: '跟随镜头（背后 8 米）', yaw: 0, pitch: 0.3, dist: 8 },
  { name: '背后近（4.5 米）', yaw: 0, pitch: 0.25, dist: 4.5 },
  { name: '右后 40°', yaw: 0.7, pitch: 0.28, dist: 5 },
  { name: '左后 40°', yaw: -0.7, pitch: 0.28, dist: 5 },
  { name: '右侧', yaw: 1.57, pitch: 0.12, dist: 3.4 },
  { name: '左前', yaw: -2.4, pitch: 0.12, dist: 3.4 },
];
export function viewCam(v) {
  const P = Q().player, h = P.heading + (v.yaw || 0), f = { x: P.pos.x, y: P.pos.y + 1.55, z: P.pos.z };
  const cp = Math.cos(v.pitch);
  return { pos: [f.x - Math.sin(h) * cp * v.dist, f.y + Math.sin(v.pitch) * v.dist, f.z - Math.cos(h) * cp * v.dist], at: [f.x, f.y + 0.3 * Math.min(1, v.dist / 8), f.z] };
}
export async function stanceShots(prefix = 'r20_tmp_st_', { clip = 'iai_hold', t = 0, views = VIEWS, w = 640, h = 480, look = null } = {}) {
  const A = Q();
  pose(clip, t, look);
  const out = [];
  for (let i = 0; i < views.length; i++) {
    const c = viewCam(views[i]);
    out.push((await A.shot(`${prefix}${i}`, { w, h, pos: c.pos, at: c.at, fov: 46 })).kb);
  }
  unpose();
  return out;
}

// 看姿势用：镜头对着腰（离地 1 米）、3.2 米外，绕人一圈 8 个方位（0 背后，逆时针：右后、右、右前、正前、左前、左、左后——与 VIEWS 同一算法）
export async function ringShots(prefix = 'r20_tmp_ring_', { clip = 'iai_hold', t = 0, dist = 3.2, h = 1.35, w = 520, hh = 640, look = null } = {}) {
  const A = Q(), P = A.player;
  pose(clip, t, look);
  for (let i = 0; i < 8; i++) {
    const yaw = P.heading + i * Math.PI / 4;
    const pos = [P.pos.x - Math.sin(yaw) * dist, P.pos.y + h, P.pos.z - Math.cos(yaw) * dist];
    await A.shot(`${prefix}${i}`, { w, h: hh, pos, at: [P.pos.x, P.pos.y + 0.95, P.pos.z], fov: 42 });
  }
  unpose();
}

// 剑柄、剑鞘没被身体（含衣服、葫芦）挡住的比例：把人物单独放进一个场景，剑柄画红、剑鞘画绿、身体画黑，
// 有身体与没身体各画一遍，数红、绿像素之比。剑柄 = 鞘中那把剑护手以下的部分（护手也算），剑鞘 = 鞘
export function weaponVis({ clip = 'iai_hold', t = 0, views = VIEWS, w = 480, h = 360, look = null, save = null } = {}) {
  const A = Q(), T3 = A.THREE, R = A.renderer, P = A.player, ch = P.char;
  pose(clip, t, look);
  ch.root.updateMatrixWorld(true);
  const S = ch.sword, inv = new T3.Matrix4().copy(ch.scabTop.matrixWorld).invert();
  const hiltMat = new T3.ShaderMaterial({
    uniforms: { uInv: { value: inv }, uG: { value: S.guard[1] + 0.005 } },
    vertexShader: 'uniform mat4 uInv; varying float vY; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vY = (uInv * w).y; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform float uG; varying float vY; void main(){ if (vY > uG) discard; gl_FragColor = vec4(1., 0., 0., 1.); }', side: T3.DoubleSide });
  const sheathMat = new T3.MeshBasicMaterial({ color: 0x00ff00, side: T3.DoubleSide });
  // 身体：右手（手骨与手指骨的蒙皮权重过半的顶点）画蓝，其余画黑；uOnly 时只画右手（数右手单独露出多少像素）
  const handBones = (m) => m.skeleton.bones.map((b, i) => (/RightHand/.test(b.name) ? i : -1)).filter((i) => i >= 0);
  const occFor = (m) => new T3.ShaderMaterial({
    uniforms: { uB: { value: (() => { const a = new Array(24).fill(-9); handBones(m).slice(0, 24).forEach((v, i) => { a[i] = v; }); return a; })() }, uOnly: { value: 0 } },
    vertexShader: `#include <common>
      #include <skinning_pars_vertex>
      uniform float uB[24]; varying float vH;
      float inH(float b) { for (int i = 0; i < 24; i++) if (abs(uB[i] - b) < .5) return 1.; return 0.; }
      void main() {
        #include <skinbase_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        vH = 0.;
        #ifdef USE_SKINNING
        vH = skinWeight.x * inH(skinIndex.x) + skinWeight.y * inH(skinIndex.y) + skinWeight.z * inH(skinIndex.z) + skinWeight.w * inH(skinIndex.w);
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.);
      }`,
    fragmentShader: 'uniform float uOnly; varying float vH; void main(){ if (uOnly > .5 && vH < .5) discard; gl_FragColor = vH > .5 ? vec4(0., 0., 1., 1.) : vec4(0., 0., 0., 1.); }', side: T3.DoubleSide });
  const occ = new T3.MeshBasicMaterial({ color: 0x000000, side: T3.DoubleSide });
  const under = (o, root) => { for (let x = o; x; x = x.parent) if (x === root) return true; return false; };
  const keep = [], occluders = [], bodyMats = [];
  ch.root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;         // 本来就不显示的（护体剑罡等）不参与
    keep.push([o, o.material, o.visible]);
    if (under(o, ch.scabTop)) o.material = hiltMat;
    else if (under(o, ch.sheath)) o.material = sheathMat;
    else if (o.isSkinnedMesh) { o.material = occFor(o); bodyMats.push(o.material); occluders.push(o); }
    else { o.material = occ; occluders.push(o); }
  });
  const scn = new T3.Scene(), parent = ch.root.parent;
  scn.add(ch.root);
  const cam = new T3.PerspectiveCamera(46, w / h, 0.05, 100);
  const rt = new T3.WebGLRenderTarget(w, h), buf = new Uint8Array(w * h * 4);
  const keepClear = R.getClearColor(new T3.Color()), keepA = R.getClearAlpha(), keepTone = R.toneMapping;
  R.setClearColor(0xffffff, 1); R.toneMapping = T3.NoToneMapping;
  const count = () => { R.setRenderTarget(rt); R.clear(); R.render(scn, cam); R.readRenderTargetPixels(rt, 0, 0, w, h, buf); let r = 0, g = 0, b = 0; for (let i = 0; i < buf.length; i += 4) { if (buf[i] > 128 && buf[i + 1] < 80) r++; else if (buf[i + 1] > 128 && buf[i] < 80) g++; else if (buf[i + 2] > 128 && buf[i] < 80) b++; } return { r, g, b }; };
  const out = [];
  try {
    R.setRenderTarget(rt); R.render(scn, cam); R.setRenderTarget(null);          // 先画一遍：着色器第一次用时编好
    for (const v of views) {
      const c = viewCam(v);
      cam.position.set(...c.pos); cam.lookAt(...c.at); cam.updateMatrixWorld();
      const a = count();
      if (save) {        // 存下这一遍的遮挡图（剑柄红、鞘绿、右手蓝、其余身体黑；背景白）
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const g = cv.getContext('2d'), img = g.createImageData(w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = ((h - 1 - y) * w + x) * 4, o = (y * w + x) * 4;
          img.data[o] = buf[i]; img.data[o + 1] = buf[i + 1]; img.data[o + 2] = buf[i + 2]; img.data[o + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        save.push(cv.toDataURL('image/png'));
      }
      for (const o of occluders) o.visible = false;
      const b = count();
      // 右手单独（只画右手、不画剑与鞘）
      for (const o of occluders) o.visible = !!o.isSkinnedMesh;
      for (const m of bodyMats) m.uniforms.uOnly.value = 1;
      const hk = keep.filter(([o]) => under(o, ch.scabTop) || under(o, ch.sheath)); for (const [o] of hk) o.visible = false;
      const hand = count();
      for (const [o] of hk) o.visible = true;
      for (const m of bodyMats) m.uniforms.uOnly.value = 0;
      for (const o of occluders) o.visible = true;
      out.push({ view: v.name, hilt: b.r ? r2(a.r / b.r) : null, sheath: b.g ? r2(a.g / b.g) : null, hand: hand.b ? r2(a.b / hand.b) : null, hiltPx: b.r, sheathPx: b.g, handPx: hand.b });
    }
  } finally {
    R.setRenderTarget(null); R.setClearColor(keepClear, keepA); R.toneMapping = keepTone;
    parent.add(ch.root);
    for (const [o, m, vis] of keep) { o.material = m; o.visible = vis; }
    rt.dispose(); hiltMat.dispose(); sheathMat.dispose(); occ.dispose(); for (const m of bodyMats) m.dispose();
    unpose();
  }
  return out;
}

// 蓄势姿势的几样量：右手握点离剑柄、左手离鞘口多远（厘米）；骨盆、两肩的朝向（相对人物朝向，度：正为向左转）；
// 骨盆离地多高、上身前倾几度、两膝弯几度；鞘中的剑（与鞘）离身体最近处（厘米，负为穿进去）
export function stanceMetrics(clip = 'iai_hold', t = 0) {
  const A = Q(), T3 = A.THREE, P = A.player, ch = P.char;
  pose(clip, t);
  ch.root.updateMatrixWorld(true);
  const W = (b) => ch.bones[b].getWorldPosition(new T3.Vector3());
  const L = (o) => o.clone().sub(P.pos).applyAxisAngle(new T3.Vector3(0, 1, 0), -P.heading);
  const BI = { Hips: 0, Spine2: 3, Neck: 4, LShoulder: 7, RShoulder: 11, RHand: 13, LHand: 9, LUpLeg: 14, LLeg: 15, LFoot: 16, RUpLeg: 18, RLeg: 19, RFoot: 20 };
  const hip = L(W(BI.Hips)), lsh = L(W(BI.LShoulder)), rsh = L(W(BI.RShoulder)), lup = L(W(BI.LUpLeg)), rup = L(W(BI.RUpLeg)), neck = L(W(BI.Neck));
  const yawOf = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return Math.atan2(-dz, dx) * 180 / Math.PI; };       // 左 → 右连线的朝向：0 = 正对前方
  const knee = (u, k, f) => { const a = W(u).sub(W(k)).normalize(), b = W(f).sub(W(k)).normalize(); return 180 - Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 180 / Math.PI; };
  const hilt = ch.scabbardPoint(-0.06, new T3.Vector3()), mouth = ch.scabbardPoint(ch.sword.guard[0] + 0.01, new T3.Vector3());
  // 右手握剑的挂点（handSocket）与鞘中剑的原点（握持处）
  const grip = ch.handSocket.getWorldPosition(new T3.Vector3()), held = ch.scabTop.getWorldPosition(new T3.Vector3());
  const lhand = W(BI.LHand);
  const lean = Math.atan2(Math.hypot(neck.x - hip.x, neck.z - hip.z), neck.y - hip.y) * 180 / Math.PI;
  const out = {
    gripToHiltCm: r1(grip.distanceTo(held) * 100), lWristToMouthCm: r1(lhand.distanceTo(mouth) * 100),
    pelvisYaw: r1(yawOf(lup, rup)), shoulderYaw: r1(yawOf(lsh, rsh)), hipCm: r1((W(BI.Hips).y - P.pos.y) * 100), leanDeg: r1(lean),
    kneeL: r1(knee(BI.LUpLeg, BI.LLeg, BI.LFoot)), kneeR: r1(knee(BI.RUpLeg, BI.RLeg, BI.RFoot)),
    hiltLocal: L(hilt).toArray().map(r2), mouthLocal: L(mouth).toArray().map(r2),
    sheathDir: L(mouth).sub(L(ch.scabbardPoint(0.6, new T3.Vector3()))).normalize().negate().toArray().map(r2),
  };
  unpose();
  return out;
}

// =====================================================================================
// 水墨特效的实测
// =====================================================================================
const INKF = () => Q().sfx.ink;
// 推进 secs 秒；evs = [[秒, 事件]]（与第十九轮工具同一套：'L+' 'L-' 'Z+' 'Z-' 'C' 'R+' 'R-' 'move:x,y' 'Q' …）；each(t) 每帧调用
export function run(evs, secs, each = null, dt = 1 / 60) {
  const A = Q();
  const list = evs.slice().sort((a, b) => a[0] - b[0]);
  let k = 0, t = 0;
  for (let i = 0; i < Math.round(secs / dt); i++) {
    while (k < list.length && list[k][0] <= t + 1e-9) { const e = list[k++][1]; if (typeof e === 'function') e(); else B.applyEvent(e); }
    A.tick(dt, 1, false);
    t += dt;
    each?.(t);
  }
}
// 身前几只魔修（只站着挨打、不出手、不走动）：[[种类, 前方几米, 向左几米], …]
export function foes(list, yaw = null) {
  const A = Q(), C = A.combat, P = A.player, y = yaw ?? P.heading, f = { x: Math.sin(y), z: Math.cos(y) }, l = { x: Math.cos(y), z: -Math.sin(y) };
  clearFoes();
  return list.map(([k, d, s]) => { const e = C.spawn(k, { x: P.pos.x + f.x * d + l.x * s, y: P.pos.y, z: P.pos.z + f.z * d + l.z * s }, { yaw: y + Math.PI }); e.state = 'chase'; e.cool = 99; e.slamCool = 99; e.cfg = { ...e.cfg, speed: 0 }; e.hp = e.maxHp = 900; e.bar.set(1); return e; });
}
export function clearFoes() { const C = Q().combat; for (const e of [...C.enemies]) { e.dispose(); C.enemies.splice(C.enemies.indexOf(e), 1); } }
// 人物坐标：世界向量 → (右, 上, 前)
function toLocal(v) { const P = Q().player, c = Math.cos(P.heading), s = Math.sin(P.heading); return [-(v.x * c - v.z * s), v.y, v.x * s + v.z * c]; }
// 一条带子铺完时记下：扫过的方向（起点 → 终点，人物坐标）、扫过的面的朝向（面的法线离竖直多少度：0 面是平的（横扫），90 面是竖的（竖劈））、外沿走过的长度
function ribbonShape(r) {
  const A = Q(), T3 = A.THREE, P = r.pos, n = r.n;
  const a = new T3.Vector3(P[3], P[4], P[5]), b = new T3.Vector3(P[(n - 1) * 6 + 3], P[(n - 1) * 6 + 4], P[(n - 1) * 6 + 5]);
  const N = new T3.Vector3();
  for (let i = 1; i < n; i++) { const k = i * 2 * 4; const v = new T3.Vector3(r.nrm[k], r.nrm[k + 1], r.nrm[k + 2]); if (v.lengthSq() > 0.5) { if (N.lengthSq() > 0 && v.dot(N) < 0) v.negate(); N.add(v); } }
  const tilt = N.lengthSq() > 1e-6 ? Math.acos(Math.min(1, Math.abs(N.normalize().y))) * 180 / Math.PI : null;
  return { key: r.act.key, samples: n, from: toLocal(a.clone().sub(Q().player.pos)).map(r2), to: toLocal(b.clone().sub(Q().player.pos)).map(r2), sheetTiltDeg: tilt == null ? 'stroke' : r1(tilt), lengthM: r2(r.L[n - 1]), clip: [r3(r.cfg.from), r3(r.cfg.to)] };
}
// 普攻四式（按住左键一轮）：每一刀的带子形状、带子的头与画面上的剑相差多少（逐帧）、命中几次、命中处放了几团墨
// targets：true 身前一只魔修（命中）/ false 空挥（不该有墨溅）
export function combo({ targets = true } = {}) {
  fresh();
  const I = INKF(), M = Q().moves;
  I.debug = true; I.stat.dev.length = 0;
  const hits0 = I.stat.hits, rib0 = I.stat.ribbons, seq0 = M.seq;
  if (targets) foes([['shade', 2.6, 0]]); else clearFoes();
  const shapes = [], seen = new Set(), states = [];
  let maxAlive = 0;
  run([[0.05, 'L+'], [2.9, 'L-']], 4.6, (t) => {
    for (const r of I.ribbons) if (r.state === 'break' && !seen.has(r.t0)) { seen.add(r.t0); shapes.push(ribbonShape(r)); }
    const c = I.census(); maxAlive = Math.max(maxAlive, c.ribbons);
    if (Math.abs(t - 4.6) < 0.01) states.push(c);
  });
  I.debug = false;
  const by = {};
  for (const x of I.stat.dev) (by[x.key] ||= []).push(Math.max(x.tipCm, x.baseCm));
  const results = M.log.filter((x) => x.id > seq0 && x.key.startsWith('light')).flatMap((x) => x.results.map((y) => `${x.key}:${y.r}`));
  const out = { attacks: shapes.length, ribbonsStarted: I.stat.ribbons - rib0, maxRibbonsAtOnce: maxAlive, inkBursts: I.stat.hits - hits0, hits: results.filter((x) => !/immune|block/.test(x)).length,
    headVsBladeCm: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { frames: v.length, max: r2(Math.max(...v)) }])), shapes, after: states[0] };
  clearFoes(); fresh();
  return out;
}
// 取消、打断、力竭：带子不再铺、很快碎开；蓄力不再生、已有的原地散开
export function cancels() {
  const A = Q(), M = A.moves, I = INKF(), C = A.combat, out = {};
  const until = (pred, max = 3) => { let t = 0; while (t < max) { A.tick(1 / 60, 1, false); t += 1 / 60; if (pred()) return r2(t); } return null; };
  const ribbonOf = (key) => I.ribbons.find((r) => r.act?.key === key && r.state !== 'off');
  // 1. 斜斩前摇里闪身取消（有效段之前）：带子还没开始铺，直接作废，一笔墨也不留
  fresh(); foes([['shade', 3.2, 0]]);
  M.press('light', true); M.press('light', false);
  until(() => M.act?.key === 'light1' && M.act.t >= 0.1);
  let r = ribbonOf('light1'); const st0 = r?.state;
  B.applyEvent('C');
  A.tick(1 / 60, 1, false);
  out.windupCancel = { act: M.act?.key, ribbonBefore: st0, ribbonAfter: ribbonOf('light1')?.state ?? 'off', inkSpritesAfter: I.census().ink };
  // 2. 斜斩收势里闪身取消（有效段刚过，0.27 秒起可闪）：已铺好的照常碎开、淡出
  fresh(); foes([['shade', 3.2, 0]]);
  M.press('light', true); M.press('light', false);
  until(() => M.act?.key === 'light1' && M.act.t >= 0.28);
  r = ribbonOf('light1');
  B.applyEvent('C');
  A.tick(1 / 60, 1, false);
  out.recoveryCancel = { act: M.act?.key, state: r?.state, samples: r?.n, goneAfter: until(() => !ribbonOf('light1')) };
  // 3. 普攻接剑诀（切换动作）：斜斩收势里按 Q，剑气放出；斜斩那一笔照常碎开
  fresh(); foes([['shade', 5, 0]]);
  M.press('light', true); M.press('light', false);
  until(() => M.act?.key === 'light1' && M.act.t >= 0.3);
  B.applyEvent('Q');
  const q = until(() => M.act?.key === 'qi', 0.3);
  out.switchToSkill = { switchedAfter: q, light1Ribbon: ribbonOf('light1')?.state ?? 'off', goneAfter: until(() => !ribbonOf('light1')) };
  // 2. 重劈出手中被重击打退（受击反应）
  fresh(); foes([['shade', 3.2, 0]]);
  M.press('light', true); M.press('light', false);
  // 直接起第四式
  M.start('light4');
  until(() => M.act?.key === 'light4' && M.act.t >= 0.43);
  r = ribbonOf('light4'); const n1 = r?.n;
  M.react('knockback', { x: A.player.pos.x + Math.sin(A.player.heading) * 2, z: A.player.pos.z + Math.cos(A.player.heading) * 2 });
  A.tick(1 / 60, 1, false);
  out.hitInterrupt = { act: M.act?.key, samplesAtHit: n1, samplesAfter: r?.n, state: r?.state, life: r2(r?.life ?? 0), goneAfter: until(() => !ribbonOf('light4')) };
  // 2b. 拔刀斩扫到一半被掀翻（霸体挡得住轻受击，挡不住击退）：刀光带子与月牙带都快速碎开
  fresh(); foes([['shade', 3.6, 0]]);
  M.press('power', true); run([], 2.0); M.press('power', false);
  until(() => M.act?.key === 'iai_slash' && M.act.t >= 0.17);
  const ri = ribbonOf('iai_slash'), bi = I.bands.find((b) => b.kind === 'iai' && b.state !== 'off');
  const bs0 = bi?.state;
  M.react('knockback', { x: A.player.pos.x + Math.sin(A.player.heading) * 2, z: A.player.pos.z + Math.cos(A.player.heading) * 2 });
  A.tick(1 / 60, 1, false);
  out.iaiInterrupt = { act: M.act?.key, ribbon: ri?.state, ribbonLife: r2(ri?.life ?? 0), band: `${bs0} → ${bi?.state}`, bandLife: r2(bi?.life ?? 0), goneAfter: until(() => !ribbonOf('iai_slash') && !I.bands.some((b) => b.kind === 'iai' && b.state !== 'off')) };
  // 3. 出手中力竭（气血归零：combat.playerDown → moves.reset → 特效收掉；这里不走「力竭醒来」的过场）
  fresh(); foes([['shade', 3.2, 0]]);
  const down0 = C.onPlayerDown; C.onPlayerDown = () => {};
  try {
    M.press('light', true); M.press('light', false);
    until(() => M.act?.key === 'light1' && M.act.t >= 0.21);
    C.playerDown(C.playerUnit);
    A.tick(1 / 60, 1, false);
    out.deathMidSwing = { act: M.act?.key ?? null, census: I.census(), clearAfter: until(() => { const c = I.census(); return c.ribbons === 0 && c.bands === 0; }) };
  } finally { C.onPlayerDown = down0; C.playerUnit.alive = true; C.playerUnit.hp = C.playerUnit.maxHp; }
  // 4–7. 蓄力中：举剑格挡 / 受击 / 力竭 / 出刀 —— 停下那一刻起不再生；已有的散去要多久
  const chargeStop = (label, stop) => {
    fresh();
    M.press('power', true);
    run([], 2.2);
    const before = I.census(), spawned0 = I.stat.chargeSpawned;
    stop();
    A.tick(1 / 60, 1, false);
    const atStop = I.census();
    const t = until(() => I.census().charge === 0, 1.5);
    const spawnedAfter = I.stat.chargeSpawned - spawned0;
    M.press('power', false); C.setGuard(false);
    out[label] = { liveBefore: before.chargeLive, swirlsBefore: before.swirls, liveAfterStop: atStop.chargeLive, spawnedAfterStop: spawnedAfter, fadeOutSecs: t, glintAfter: I.census().glint, act: M.act?.key ?? null };
  };
  chargeStop('chargeGuard', () => C.setGuard(true));
  chargeStop('chargeHit', () => M.react('flinch', { x: A.player.pos.x + Math.sin(A.player.heading) * 2, z: A.player.pos.z + Math.cos(A.player.heading) * 2 }));
  chargeStop('chargeDeath', () => { const d0 = C.onPlayerDown; C.onPlayerDown = () => {}; try { C.playerDown(C.playerUnit); } finally { C.onPlayerDown = d0; C.playerUnit.alive = true; C.playerUnit.hp = C.playerUnit.maxHp; } });
  chargeStop('chargeRelease', () => M.press('power', false));
  // 8. 真的出手：蓄势中魔将震地（不可格挡、倒地）——combat.damage → moves.knockdown 打断蓄势
  fresh(); const [el] = foes([['elite', 2.6, 0]]);
  M.press('power', true); run([], 1.0);
  el.begin('slam');
  let tHit = null, spAt = null;
  run([], 2.2, (t) => { if (tHit == null && M.act?.key === 'knockdown') { tHit = r2(t); spAt = I.stat.chargeSpawned; } });
  const c8 = I.census();
  out.chargeRealHit = { knockedDownAt: tHit, iaiAfter: !!M.iai, spawnedAfterHit: spAt == null ? null : I.stat.chargeSpawned - spAt, liveAfter: c8.chargeLive, visibleAfter: c8.charge, glint: c8.glint };
  M.press('power', false); clearFoes();
  clearFoes(); fresh();
  return out;
}
// 蓄力：按住 Z，各时刻还在往里收的粒子数、鞘口亮边、弯带子；蓄满后再撑一会儿数目稳不稳
export function charge() {
  fresh();
  const A = Q(), M = A.moves, I = INKF(), out = [];
  M.press('power', true);
  let t = 0;
  for (const at of [0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0, 5.4, 5.8]) {
    run([], at - t); t = at;
    const c = I.census();
    out.push({ secs: at, k: r2(M.iaiCharge?.k ?? 0), live: c.chargeLive, swirls: c.swirls, glint: c.glint, spawned: I.stat.chargeSpawned });
  }
  M.press('power', false); run([], 1.2);
  fresh();
  return out;
}
// 出刀：月牙带的外沿半径、张开的角度与这一刀的判定距离、判定弧相比；扫开到头的时刻与判定的时刻；判定那一刻月牙带的圆心离人多远、朝向差几度
export function release(holds = [0.2, 2.5, 5.2]) {
  const A = Q(), M = A.moves, I = INKF(), P = A.player, H = PM.iai_slash.hits[0], out = [];
  for (const h of holds) {
    fresh();
    M.press('power', true); run([], h); M.press('power', false);
    let band = null, sweepEnd = null, atHit = null, k = null;
    run([], 1.0, () => {
      const a = M.act;
      if (a?.key === 'iai_slash') k = a.iaiK;
      const b = I.bands.find((x) => x.kind === 'iai' && x.state !== 'off');
      if (b && !band) band = b;
      if (band && sweepEnd == null && band.state === 'break') sweepEnd = r3(band.act.t);
      if (a?.key === 'iai_slash' && a.t >= H.t && !atHit && band) atHit = { centerToPlayerM: r2(Math.hypot(band.center.x - P.pos.x, band.center.z - P.pos.z)), headingDiffDeg: r1(Math.abs(Math.atan2(Math.sin(band.heading - P.heading), Math.cos(band.heading - P.heading))) * 180 / Math.PI) };
    });
    const v = (x) => (Array.isArray(x) ? x[0] + (x[1] - x[0]) * Math.pow(k ?? 0, PC.iai.curve) : x);
    out.push({ hold: h, k: r3(k), hitRange: r2(v(H.range)), bandOuter: band ? r2(band.range) : null, bandInner: band ? r2(band.range * 0.6195) : null, arcDeg: band ? r1((band.u1 - band.u0) * 240) : null, hitArcDeg: H.arc, sweepDoneAt: sweepEnd, hitAt: H.t, atHit });
  }
  fresh();
  return out;
}
// 判定距离里外各摆一只魔修：里面的挨刀、外面的不挨（与月牙带外沿对照）。先空放一刀量出判定那一刻人前冲到了哪里
export function rangeCheck(hold = 5.2) {
  const A = Q(), M = A.moves, P = A.player, H = PM.iai_slash.hits[0];
  fresh();
  const start = P.pos.clone();
  M.press('power', true); run([], hold); M.press('power', false);
  let p0 = null, k = 0;
  run([], 0.8, () => { if (M.act?.key === 'iai_slash') k = M.act.iaiK; if (!p0 && M.act?.key === 'iai_slash' && M.act.t >= H.t) p0 = P.pos.clone(); });
  const rr = H.range[0] + (H.range[1] - H.range[0]) * Math.pow(k, PC.iai.curve), lunge = Math.hypot(p0.x - start.x, p0.z - start.z);
  fresh();
  // 魔修半径 0.45：判定是「距离 ≤ 判定距离 + 半径」
  const dIn = lunge + rr + 0.45 - 0.3, dOut = lunge + rr + 0.45 + 0.4;
  const [e1, e2] = foes([['shade', dIn, 0], ['shade', dOut, 0.0]]);
  // 两只排在一条线上会互相挡（visible 检查不看敌人），所以外面那只稍偏一点
  e2.pos.x += Math.cos(P.heading) * 0.6; e2.pos.z -= Math.sin(P.heading) * 0.6;
  // 按来源记：刀（kind heavy，判定那一刻）与剑气（kind sword，蓄过 3 秒才有，飞得比判定远）；别的来源（护宗双龙的火等）不算
  const got = { e1: [], e2: [] };
  const L = (ev) => { if (ev.from !== A.combat.playerUnit || !(ev.amount > 0)) return; if (ev.target === e1) got.e1.push(ev.kind); if (ev.target === e2) got.e2.push(ev.kind); };
  A.combat.hitListeners.add(L);
  try { M.press('power', true); run([], hold); M.press('power', false); run([], 0.9); } finally { A.combat.hitListeners.delete(L); }
  const out = { k: r3(k), hitRange: r2(rr), lungeAtHit: r2(lunge),
    inside: { dist: r2(dIn - lunge), bySlash: got.e1.includes('heavy'), byWave: got.e1.includes('sword') },
    outside: { dist: r2(Math.hypot(dOut - lunge, 0.6)), bySlash: got.e2.includes('heavy'), byWave: got.e2.includes('sword') } };
  clearFoes(); fresh();
  return out;
}
// 性能：一轮普攻 + 一次满蓄力出刀里，水墨特效每帧的 CPU 时间（update）与绘制调用数
export function perf() {
  const A = Q(), I = INKF(), M = A.moves, R = A.renderer;
  fresh(); foes([['shade', 2.6, 0]]);
  const u0 = I.update.bind(I); const times = [];
  I.update = (dt, cam) => { const t0 = performance.now(); u0(dt, cam); times.push(performance.now() - t0); };
  // 水墨特效此刻要画几次（看得见的网格数：每个是一次绘制）
  const draws = () => I.meshes().filter((o) => o.visible).length;
  let calls = { idle: null, busy: 0 };
  try {
    A.tick(1 / 60, 1, true); calls.idle = draws();
    run([[0.05, 'L+'], [2.9, 'L-']], 3.2, () => { calls.busy = Math.max(calls.busy, draws()); });
    M.press('power', true); run([], 5.2); calls.charge = draws(); M.press('power', false);
    run([], 0.25); calls.release = draws();
    run([], 1.0);
  } finally { I.update = u0; }
  times.sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  clearFoes(); fresh();
  return { frames: times.length, meanMs: r3(sum / times.length), p95Ms: r3(times[Math.floor(times.length * 0.95)]), maxMs: r3(times[times.length - 1]), inkDraws: calls, sceneDrawsNow: R.info.render.calls };
}

// 鞘与身体会不会穿：沿鞘（鞘口 → 鞘尾）取 24 点，量到身体各段（躯干、两条大腿、两条小腿、左臂）的胶囊最近多远（厘米，负为穿进去；
// 胶囊与 cultivatorPose.clearance 一样）。长袍下摆是飘的布，不算（鞘会把下摆顶开——没有布料模拟，见报告）
export function sheathClear(list = [['iai_hold', 0], ['iai_hold', 1], ['iai_walk', 0], ['iai_walk', 0.25], ['iai_walk', 0.5], ['iai_walk', 0.75], ['iai_enter', 0.3]]) {
  const A = Q(), T3 = A.THREE, ch = A.player.char, S = ch.sword, out = [];
  const seg = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()))); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
  for (const [clip, t] of list) {
    pose(clip, t);
    ch.root.updateMatrixWorld(true);
    const W = (i) => ch.bones[i].getWorldPosition(new T3.Vector3());
    const caps = { torso: [W(0), W(3), 0.15], thighL: [W(14), W(15), 0.1], thighR: [W(18), W(19), 0.1], shinL: [W(15), W(16), 0.065], shinR: [W(19), W(20), 0.065], armL: [W(7), W(8), 0.055], foreL: [W(8), W(9), 0.045] };
    // 左前臂是扶鞘的那只手——碰着鞘是对的，单列
    let best = { d: 9, part: '', at: 0 }, hand = 9;
    for (let k = 0; k <= 24; k++) {
      const y = S.guard[0] + 0.03 + (S.tip + 0.02 - S.guard[0] - 0.03) * k / 24;
      const p = ch.scabbardPoint(y, new T3.Vector3());
      for (const [name, [a, b, r]] of Object.entries(caps)) { const d = seg(p, a, b) - r - 0.022; if (name === 'foreL') { hand = Math.min(hand, d); continue; } if (d < best.d) best = { d, part: name, at: r2(y) }; }
    }
    out.push({ clip, t, bodyMinCm: r1(best.d * 100), part: best.part, alongM: best.at, holdingForearmCm: r1(hand * 100) });
  }
  unpose();
  return out;
}

// =====================================================================================
// 录像（帧先存内存、录完 flush 分批上传；同时记下音效，tools/r19_mix_audio.py 离线混出配音——与第十九轮同一套）
// =====================================================================================
let RECO = null;
const frames = (s) => Math.round(s * 60);
// 推进 n 帧；slow：慢放倍数（每帧游戏只走 1/(60·slow) 秒，录像时间照常每帧 1/60 秒，配音按录像时间放）
function play(n, fn = null, slow = 1) {
  for (let i = 0; i < n; i++) {
    fn?.(i);
    R19.recTick(1 / (60 * slow));
    if (RECO && slow !== 1) RECO.t += 1 / 60 - 1 / (60 * slow);
  }
}
// 镜头：相对人物朝向转 yawOff（0 背后、正为转到人物右后——与 VIEWS 同一算法）、俯 pitch、距离 dist，立即对齐
function camAt(yawOff = 0, pitch = 0.3, dist = 8) { const A = Q(), P = A.player; A.cam.set(P.heading + yawOff, pitch, dist); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); }
function camYawTo(yawOff, pitch, dist) { const A = Q(), P = A.player; A.cam.set(P.heading + yawOff, pitch, dist); }
const keys = (...k) => { const I = Q().input; I.keys.clear(); for (const x of k) I.keys.add(x); };

// 一、普攻
export async function scnLight() {
  const A = Q(), M = A.moves;
  await arena();
  fresh(); foes([['shade', 2.6, -0.4], ['shade', 3.0, 0.9]]); camAt(0, 0.3, 8); play(20);
  RECO = R19.recStart({ prefix: 'r20a_', title: '一 · 普攻的水墨刀光（按住左键四段）', sub: '常用的跟随镜头（背后 8 米）：刀光沿剑的真实轨迹铺开——斜斩右上→左下、反手横斩左→右、突刺直刺、重劈自头顶劈下' });
  M.press('light', true); play(frames(3.1)); M.press('light', false); play(frames(0.9));
  R19.recSub('侧前方看：笔头跟着剑刃、枯笔的尾巴拖在后面；收剑后墨迹碎开、淡出；命中处一团墨溅与一点白光');
  fresh(); foes([['shade', 2.6, -0.4], ['shade', 3.0, 0.9]]); camAt(-1.0, 0.25, 5.5); play(10);
  M.press('light', true); play(frames(3.1)); M.press('light', false); play(frames(0.9));
  R19.recSub('慢放四倍：斜斩、反手横斩——刀光迅速出现，墨点沿刀势飞散，墨迹碎开后淡出（不久留、不挡人）');
  fresh(); foes([['shade', 2.6, 0]]); camAt(-1.0, 0.22, 4.6); play(10);
  M.press('light', true); play(frames(1.25), null, 4); M.press('light', false); play(frames(0.6), null, 4);
  R19.recSub('慢放四倍：突刺（刺到头一圈墨环朝刺的方向张开）、重劈（竖着的一笔，从背后看也有宽度）');
  fresh(); foes([['shade', 2.8, 0]]); camAt(-0.5, 0.25, 5); play(10);
  M.start('light3'); M.press('light', true); play(frames(1.7), null, 4); M.press('light', false); play(frames(0.6), null, 2);
  R19.recSub('空挥：只有刀光，没有墨溅；前摇里闪身取消：一笔墨也不留；收势里接剑诀：这一笔照常碎开');
  fresh(); clearFoes(); camAt(0, 0.3, 7); play(10);
  M.press('light', true); play(frames(1.4)); M.press('light', false); play(frames(0.6));
  M.press('light', true); M.press('light', false); play(6); keys('KeyA'); B.applyEvent('C'); play(8); keys(); play(frames(0.8));
  M.press('light', true); M.press('light', false); play(frames(0.3)); B.applyEvent('Q'); play(frames(1.2));
  const r = R19.recStop(); RECO = null;
  clearFoes(); fresh();
  return { frames: r.frames, secs: r.secs, events: r.events.length };
}

// 二、拔刀斩
export async function scnIai() {
  const A = Q(), M = A.moves, C = A.combat;
  await arena();
  fresh(); clearFoes(); camAt(0, 0.3, 8); play(20);
  RECO = R19.recStart({ prefix: 'r20b_', title: '二 · 拔刀斩：侧身蓄势，墨向刀聚', sub: '按住 Z：侧身沉胯、屈膝、上身前倾，右手握柄、左手扶鞘——常用的背后镜头里看得见剑柄、握柄的手与整把鞘' });
  M.press('power', true); play(frames(1.2));
  // 绕人物转大半圈看站姿（蓄力照常）
  for (let i = 0; i < frames(2.4); i++) { const u = i / frames(2.4); camYawTo(-2.6 * Math.sin(u * Math.PI / 2), 0.3 - 0.12 * u, 8 - 3.6 * u); play(1); }
  R19.recSub('墨点、墨雾、细小光粒沿螺旋收向剑柄与鞘口，越近越小、到了即没；每过一档几笔墨扫进剑柄；蓄得越久越密越快，鞘口细亮边越亮；蓄满脚下一圈墨，之后不再变密');
  for (let i = 0; i < frames(1.0); i++) { const u = i / frames(1.0); camYawTo(-2.6 + 2.0 * u, 0.18, 4.4); play(1); }
  for (let i = 0; i < frames(0.8); i++) { const u = i / frames(0.8); camYawTo(-0.6 + 0.6 * u, 0.18 + 0.12 * u, 4.4 + 3.6 * u); play(1); }
  R19.recSub('满蓄出刀（这里没有对手）：剑顺鞘抽出，一道月牙墨自左向右扫开——外沿就是这一刀够得着的 4.8 米，张开 200° 与判定弧一样');
  M.press('power', false); play(frames(1.7));
  R19.recSub('对着三个魔修（4.3、5.3、7.2 米）满蓄出刀：判定距离里的挨刀，远的那个挨剑气（蓄过 3 秒多一道墨色剑气）。蓄力快进两倍');
  clearFoes(); fresh(); foes([['shade', 4.3, -1.2], ['shade', 5.3, 1.6], ['shade', 7.2, 0.3]]); camAt(0, 0.3, 8); play(5);
  M.press('power', true); play(frames(2.6), null, 0.5); M.press('power', false); play(frames(1.7));
  R19.recSub('慢放四倍（侧上方看）：出鞘 → 横斩 → 收势；月牙扫开的前沿一道白光，墨点向外飞散，随后碎开。蓄力快进两倍');
  clearFoes(); fresh(); foes([['shade', 3.6, -0.6], ['shade', 4.2, 1.0]]); camAt(-1.2, 0.55, 9); play(5);
  M.press('power', true); play(frames(1.6), null, 0.5); M.press('power', false); play(frames(1.4), null, 4); play(frames(0.5));
  R19.recSub('轻点 Z：最轻的一刀，墨痕外沿 3.9 米、碎得快，没有剑气');
  clearFoes(); fresh(); foes([['shade', 3.4, 0]]); camAt(0, 0.3, 8); play(5);
  M.press('power', true); play(6); M.press('power', false); play(frames(1.4));
  R19.recSub('蓄势中举剑格挡（右键）：这次蓄力作废——不再生墨，已有的原地散开（0.28 秒），人回到格挡');
  clearFoes(); fresh(); camAt(0, 0.3, 7); play(5);
  M.press('power', true); play(frames(2.0)); C.setGuard(true); play(frames(0.8)); M.press('power', false); C.setGuard(false); play(frames(0.6));
  R19.recSub('蓄势中被魔将震地掀翻：蓄力被打断，墨散去，人倒地再起身；之后松开 Z 也不再出刀');
  fresh(); const [e] = foes([['elite', 2.6, 0]]); camAt(-0.6, 0.3, 7.5); play(5);
  M.press('power', true); play(frames(1.0)); e.begin('slam'); play(frames(2.2)); M.press('power', false); play(frames(1.4));
  const r = R19.recStop(); RECO = null;
  clearFoes(); fresh();
  return { frames: r.frames, secs: r.secs, events: r.events.length };
}
