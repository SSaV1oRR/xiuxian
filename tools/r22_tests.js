// 第二十二轮自检：九霄凤焰的舞刀起手（显形、绕身、离刀）与操控、万剑归宗用当前佩剑、弹反收益与反击强化、凤凰伤害、龙君的弹反僵直。
// 都按真实的输入、出招、结算、特效代码推进（__qinglan.tick），不另写一套。
// 用法（预览）：const R = await import('/tools/r22_tests.js?v=' + Date.now()); await R.setup();   // 开局、到演武场
//   R.castRun()、R.moveCastRun()、R.cancelRun()、R.lmbRun()、R.steerRun()、R.returnRun()、R.diveRun()、R.damageRun()、R.guardRun()、
//   await R.ultRun(['chixiao', 'qiushui', 'jingji'])、await R.ultSwapRun()、R.ultTheory()、R.parryRun()、await R.dragonParryRun()、R.frameRun()
import * as B from './r17_combat_bot.js';
import * as G from './r21_growth.js';
import { PHOENIX, PLAYER_COMBAT as PC, PLAYER_MOVES as PM } from '/src/game/combatConfig.js';
import { statMul } from '/src/game/progression.js';

const Q = () => window.__qinglan;
const r1 = (v) => +(+v).toFixed(1), r2 = (v) => +(+v).toFixed(2), r3 = (v) => +(+v).toFixed(3);
export const { run, fresh, foes, clearFoes, skyQuiet } = G;

export async function setup() {
  await B.setup();
  await G.arena();
  const A = Q();
  A.prog.debugSetLevel(21, { qi: 0 });
  G.run([], 0.3);
  return { level: A.prog.level, world: A.world.name };
}

// =====================================================================================
// 万剑归宗：用当前佩剑
// =====================================================================================
// 手中剑的材质（施法前后对比：不得改动）
function handMat() {
  const ch = Q().player.char, root = ch.handSword.children[0];
  let m = null; root?.traverse((o) => { if (o.isMesh && !m) m = o; });
  if (!m) return null;
  const mat = m.material;
  return { mesh: m.uuid, mat: mat.uuid, type: mat.type, emissive: mat.emissive?.getHexString(), ei: mat.emissiveIntensity, transparent: mat.transparent, opacity: mat.opacity, obc: !!mat.onBeforeCompile && String(mat.onBeforeCompile).length, map: mat.map?.uuid, version: mat.version, geo: m.geometry.uuid, pos: m.geometry.attributes.position.uuid ?? m.geometry.attributes.position.count };
}
// 放一次万剑归宗（身前一只木人桩或几只魔修），走到最后一柄化光散去；返回剑阵记录、各目标受的伤害、手中剑材质前后是否一致
export function ultOnce({ list = [['shade', 6.5, 0], ['shade', 7.5, 2.4], ['shade', 7.0, -2.6]], hp = 5000, secs = 5.2, each = null } = {}) {
  const A = Q(), M = A.moves, F = A.sfx;
  const es = foes(list, { hp });
  G.run([], 0.1);
  const before = handMat();
  M.intent = 100; M.cools.ult = 0;
  M.press('ult', true);
  const seen = { phases: [], sword: null, kit: null };
  G.run([], secs, (t) => {
    const u = F.ultInfo();
    if (u.sword && !seen.sword) seen.sword = u.sword.id;
    if (u.sword && Math.round(t * 60) % 30 === 0) seen.phases.push(`${r2(t)} ${u.sword.phases} ${u.sword.giant}`);
    if (each) each(t, u);
  });
  const after = handMat(), info = F.ultInfo();
  const out = { sword: seen.sword, hand: A.player.char.swordId, dmg: es.map((e) => r1(hp - e.hp)), handSame: JSON.stringify(before) === JSON.stringify(after), handMat: after, kits: info.kits, active: info.active, phases: seen.phases };
  clearFoes();
  return out;
}
// 几把剑各放一次（直刀、弯刀、形状特殊的）：剑阵套件（剑尖方向、长度、与手中剑共用几何体、材质另一份）、伤害、手中剑材质不变
export async function ultRun(ids = ['chixiao', 'qiushui', 'jingji']) {
  const A = Q(), out = {};
  const keep = A.player.char.swordId;
  for (const id of ids) {
    await A.game.equipSword(id);
    fresh(Math.PI);
    out[id] = ultOnce();
  }
  await A.game.equipSword(keep);
  fresh(Math.PI);
  return out;
}
// 施法中途换剑：已放出的剑阵不变（还是施法时那把），手中是新剑；下一次施法换成新剑；换下的那把在剑阵散去之前不释放显存
export async function ultSwapRun(a = 'chixiao', b = 'qiushui') {
  const A = Q(), M = A.moves, F = A.sfx, AR = A.armory || A.game.armory, out = {};
  await A.game.equipSword(a);
  fresh(Math.PI);
  const es = foes([['shade', 6.5, 0]], { hp: 5000 });
  G.run([], 0.1);
  M.intent = 100; M.cools.ult = 0; M.press('ult', true);
  G.run([], 1.2);
  out.before = { cast: F.ultInfo().sword?.id, hand: A.player.char.swordId, users: AR.users.get(a) || 0 };
  await A.game.equipSword(b);
  out.swapped = { cast: F.ultInfo().sword?.id, hand: A.player.char.swordId, usersOld: AR.users.get(a) || 0, usersNew: AR.users.get(b) || 0 };
  G.run([], 4.5);
  out.after = { active: F.ultInfo().active, usersOld: AR.users.get(a) || 0, dmg: r1(5000 - es[0].hp) };
  clearFoes();
  fresh(Math.PI);
  const r = ultOnce({ list: [['shade', 6.5, 0]] });
  out.next = { cast: r.sword, hand: r.hand, handSame: r.handSame };
  await A.game.equipSword(a);
  fresh(Math.PI);
  return out;
}
// 万剑归宗的伤害（按代码算）：飞剑柄数 × 每柄 + 末了巨剑，× 等级成长；与 21 级实测对照
export function ultTheory() {
  const D = PM.ult, A = Q(), L = A.prog.level;
  const k = statMul('dmg', L);
  return { L, dmgK: r3(k), dmgKmoves: r3(A.moves.dmgK), swords: D.swords, swordDmg: D.swordDmg, swordR: D.swordR, circle: D.circle, final: D.final.dmg, finalR: D.final.r,
    fullHit: r1((D.swords * D.swordDmg + D.final.dmg) * k), perSword: r1(D.swordDmg * k), giant: r1(D.final.dmg * k),
    note: '一半的飞剑对准圈内的敌人（±0.6 米），另一半随机落在圈内；每柄打中落点 swordR + 目标半径内的敌人；巨剑打中阵心 final.r 内的全部敌人' };
}
// 万剑归宗：单个目标站在阵心时的实测（随机落点，多放几次取平均）
export function ultSingleRun(n = 5) {
  const out = [];
  for (let i = 0; i < n; i++) { fresh(Math.PI); out.push(ultOnce({ list: [['shade', 6.5, 0]], hp: 5000 }).dmg[0]); }
  return { runs: out, mean: r1(out.reduce((a, b) => a + b, 0) / out.length), max: Math.max(...out), min: Math.min(...out) };
}
// 剑阵的近景：施法到 t 秒时，从侧面看阵心（飞剑、巨剑与手中剑的样子）
export async function ultShots(id, times = [0.75, 1.6, 2.7, 3.3], { prefix = null } = {}) {
  const A = Q(), M = A.moves;
  await A.game.equipSword(id);
  fresh(Math.PI);
  skyQuiet(false);
  const es = foes([['shade', 6.5, 0], ['shade', 7.5, 2.4], ['shade', 7.0, -2.6]], { hp: 5000 });
  G.run([], 0.1);
  M.intent = 100; M.cools.ult = 0; M.press('ult', true);
  const c = M.ult?.center || null;
  let t = 0;
  const res = [];
  for (const tt of times) {
    G.run([], Math.max(0, tt - t)); t = tt;
    const U = M.ult || { center: c }, ctr = U.center || A.player.pos;
    const P = A.player.pos, dx = ctr.x - P.x, dz = ctr.z - P.z, l = Math.hypot(dx, dz) || 1;
    const side = { x: -dz / l, z: dx / l };
    const pos = [ctr.x + side.x * 11 - dx / l * 4, ctr.y + 3.0, ctr.z + side.z * 11 - dz / l * 4], at = [ctr.x, ctr.y + (tt > 2.4 && tt < 3.3 ? 5.5 : 3.0), ctr.z];
    res.push((await A.shot(`r22_tmp_${prefix || id}_${String(Math.round(tt * 100)).padStart(3, '0')}`, { w: 960, h: 540, pos, at, fov: 58 })).status);
  }
  G.run([], 5.5 - t);
  clearFoes(); skyQuiet(true);
  void es;
  return res;
}

// =====================================================================================
// 九霄凤焰：舞刀起手（显形、绕身一周、离刀）
// =====================================================================================
const beakTip = (b) => { const A = Q(), ch = A.player.char, tip = new A.THREE.Vector3(), base = new A.THREE.Vector3(); ch.bladeEnds(tip, base); const beak = b.rig.offset(b.rig.dims.beak, new A.THREE.Vector3()).add(b.pos); return { d: r3(beak.distanceTo(tip)), chest: r3(beak.distanceTo(A.player.pos.clone().setY(A.player.pos.y + 1.3))) }; };
// 按 3：一帧一帧推进到离刀（凤凰出现），记下每帧的状态；再推进 after 秒
export function castTrace({ mode = 'strike', after = 0.3, each = null } = {}) {
  const A = Q(), ph = A.phoenix, M = A.moves, rows = [];
  ph.mode = mode; M.cools.phoenix = 0; M.mp = M.mpMax;
  const mp0 = M.mp, z0 = ph.zones.length, cast0 = ph.stats.casts;
  M.press('phoenix', true);
  let launchRow = null, coolSets = 0, lastCool = 0, mpDrops = 0, lastMp = M.mp, bt = null;
  run([], 1.4 + after, (t) => {
    const a = M.act, b = ph.bird, p = ph.pre;
    if ((M.cools.phoenix || 0) > lastCool + 1) coolSets++;
    lastCool = M.cools.phoenix || 0;
    if (M.mp < lastMp - 1) mpDrops++;
    lastMp = M.mp;
    const row = { t: r3(t), at: a ? r3(a.t) : null, key: a?.key || null, pre: !!p, vis: !!p?.vis, bird: !!b, zones: ph.zones.length, mp: r1(M.mp), cool: r2(M.cools.phoenix || 0), bt: b ? r3(b.t) : null };
    if (b && !launchRow) { launchRow = { ...row, beak: beakTip(b), snapErr: b.snapErr }; bt = b.t; }
    rows.push(row);
    if (each) each(t, row);
  });
  return { rows, launch: launchRow, mpSpent: r1(mp0 - M.mp), mpDrops, coolSets, casts: ph.stats.casts - cast0, cast: ph.lastCast, zonesBefore: z0, bt };
}
// 三把剑各舞一次：事件时刻、离刀时喙尖到剑尖的距离、预演中没有伤害 / 火 / 秒杀、扣费与冷却各一次、绕身的角度与离身体的最近距离
export async function castRun(ids = ['chixiao', 'qiushui', 'jingji']) {
  const A = Q(), ph = A.phoenix, out = {};
  const keep = A.player.char.swordId;
  for (const id of ids) {
    await A.game.equipSword(id);
    fresh(Math.PI); ph.resetStats();
    // 右边 2.4 米站一只魔将（绕身的路线从它身旁扫过）：预演中不应受任何伤害
    const [e] = foes([['elite', 0.6, -2.4]], { hp: 3000 });
    const hp0 = e.hp;
    let hpAtLaunch = null, zonesAtLaunch = null, execAtLaunch = null;
    const r = castTrace({ after: 0.2, each: (t, row) => { if (row.bird && hpAtLaunch == null) { hpAtLaunch = r1(hp0 - e.hp); zonesAtLaunch = row.zones; execAtLaunch = ph.stats.execRolls; } } });
    const C = r.cast;
    out[id] = { events: C?.events.map((x) => `${x.name}@${x.t}`), travelDeg: C?.travelDeg, minClear: C?.minClear, maxStep: C?.maxStep, maxSpeed: C?.maxSpeed, R: C?.R,
      launchAt: r.launch?.at, snapErr: r.launch?.snapErr, beakToTipAfter1Frame: r.launch?.beak.d, beakToChest: r.launch?.beak.chest, flightClockAtLaunch: r.bt,
      previewDamage: hpAtLaunch, previewZones: zonesAtLaunch, previewExecRolls: execAtLaunch, mpSpent: r.mpSpent, mpDrops: r.mpDrops, cooldownSets: r.coolSets, casts: r.casts };
    clearFoes(); ph.clear('test');
  }
  await A.game.equipSword(keep);
  fresh(Math.PI);
  return out;
}
// 舞刀中按方向键：施法时步行速度 × 0.6、腿交给走路的动作；绕身中心跟着人走；离刀后恢复正常速度
export function moveCastRun(key = 'KeyW') {
  const A = Q(), ph = A.phoenix, M = A.moves, P = A.player;
  fresh(Math.PI); clearFoes();
  ph.mode = 'strike'; M.cools.phoenix = 0; M.mp = M.mpMax;
  const p0 = P.pos.clone();
  M.press('phoenix', true);
  A.input.keys.add(key);
  const rows = [];
  run([], 1.5, (t) => {
    const b = ph.bird, pr = ph.pre, pos = b ? b.pos : pr?.vis ? pr.pos : null;
    rows.push({ t: r3(t), at: M.act ? r3(M.act.t) : null, key: M.act?.key || null, speed: r2(Math.hypot(P.vel.x, P.vel.z)), free: r2(P.char.anim.free), r: pos ? r2(Math.hypot(pos.x - P.pos.x, pos.z - P.pos.z)) : null });
  });
  A.input.keys.delete(key);
  const during = rows.filter((x) => x.at != null && x.at > 0.4 && x.at < 1.0);
  const rs = during.filter((x) => x.r != null).map((x) => x.r);
  const out = { moved: r2(Math.hypot(P.pos.x - p0.x, P.pos.z - p0.z)), speedDuring: [Math.min(...during.map((x) => x.speed)), Math.max(...during.map((x) => x.speed))], expect: r2(4.3 * PHOENIX.cast.walk), freeDuring: Math.min(...during.map((x) => x.free)),
    orbitR: [Math.min(...rs), Math.max(...rs)], after: rows.filter((x) => x.t > 1.3).map((x) => `${x.t}:${x.speed}`).slice(0, 3),
    cast: ph.lastCast && { travel: ph.lastCast.travelDeg, minClear: ph.lastCast.minClear, maxStep: ph.lastCast.maxStep, events: ph.lastCast.events.map((e) => `${e.name}@${e.t}`) } };
  ph.clear('test'); fresh(Math.PI);
  return out;
}
// 取消：最后一刀之前闪身 / 举剑 / 受击合法取消（不扣费、预演撤掉、不留判定）；最后一刀（commit）里闪身不取消；倒下立即清掉
export function cancelRun() {
  const A = Q(), ph = A.phoenix, M = A.moves, C = A.combat, out = {};
  const snap = () => ({ pre: !!ph.pre, bird: !!ph.bird, vis: ph.rig.root.visible, zones: ph.zones.length, mp: r1(M.mp), cool: r2(M.cools.phoenix || 0), act: M.act?.key || null, owns: ph.ownsLMB() });
  const start = () => { fresh(Math.PI); clearFoes(); ph.resetStats(); ph.mode = 'strike'; M.cools.phoenix = 0; M.mp = M.mpMax; M.press('phoenix', true); };
  // 1. 0.5 秒闪身
  start(); run([], 0.5); const pre1 = snap();
  M.press('dodge', true); run([], 0.05); const at1 = snap(); run([], 0.4); const after1 = snap(); run([], 2.0);
  out.dodge = { before: pre1, justAfter: at1, after: after1, later: snap(), cast: ph.lastCast && { launched: ph.lastCast.launched, cancel: ph.lastCast.cancel }, stats: { casts: ph.stats.casts, impacts: ph.stats.impacts, bands: ph.stats.bands } };
  // 2. 0.3 秒举剑（右键）
  start(); run([], 0.3); C.setGuard(true); run([], 0.4); C.setGuard(false); run([], 0.4);
  out.guard = { after: snap(), cast: ph.lastCast && { launched: ph.lastCast.launched, cancel: ph.lastCast.cancel } };
  // 3. 0.95 秒（最后一刀，commit）闪身：不取消，照常离刀
  start(); run([], 0.95); M.press('dodge', true); run([], 0.2);
  out.commitDodge = { after: snap(), cast: ph.lastCast && { launched: ph.lastCast.launched } };
  ph.clear('test');
  // 4. 舞刀中受击打断（龙君的爪、演武场对手的剑走的同一条路：moves.react）——0.5 秒时一记 flinch
  //    （寻常魔修的爪按现有规则不让人受击硬直：combat.damage 的 react 缺省是 null，所以它们打中也不会打断舞刀，这一轮不改）
  start(); run([], 0.5);
  M.react('flinch', A.player.pos.clone().add(new A.THREE.Vector3(0, 0, -2)));
  const atHit = snap(); run([], 0.5);
  out.hit = { justAfter: atHit, after: snap(), cast: ph.lastCast && { launched: ph.lastCast.launched, cancel: ph.lastCast.cancel, events: ph.lastCast.events.map((x) => x.name) } };
  // 4b. 寻常魔修的爪打中（现有规则：不硬直）：舞刀照常、离刀
  fresh(Math.PI); clearFoes(); ph.resetStats();
  const [sh] = foes([['shade', 1.6, 0]], { hp: 3000 });
  ph.mode = 'strike'; M.cools.phoenix = 0; M.mp = M.mpMax; M.press('phoenix', true);
  let hitT = null;
  const L = (ev) => { if (ev.target === C.playerUnit && hitT == null && ev.result === 'hit') hitT = r2(M.act?.t ?? -1); };
  C.hitListeners.add(L);
  run([[0.1, () => { sh.state = 'chase'; sh.stunT = 0; sh.cool = 0; sh.begin('melee'); sh.cool = 99; }]], 1.3);
  C.hitListeners.delete(L);
  out.shadeHit = { hitAtCastT: hitT, launched: ph.lastCast?.launched ?? null };
  clearFoes(); ph.clear('test');
  // 5. 舞刀中倒下：立即清掉
  start(); run([], 0.5);
  C.playerDown(C.playerUnit); const dead = snap();
  out.death = { at: dead, cast: ph.lastCast && { launched: ph.lastCast.launched, cancel: ph.lastCast.cancel } };
  return out;
}
// 舞刀中换场景（进丹房）：预演立即清掉、不扣费
export async function cancelSceneRun() {
  const A = Q(), ph = A.phoenix, M = A.moves, out = {};
  fresh(Math.PI); clearFoes(); ph.mode = 'strike'; M.cools.phoenix = 0; M.mp = M.mpMax; M.press('phoenix', true); run([], 0.5);
  out.before = { pre: !!ph.pre, vis: ph.rig.root.visible };
  await A.game.switchWorld('alchemy'); B.tick(5, 1 / 60, false);
  out.after = { pre: !!ph.pre, bird: !!ph.bird, vis: ph.rig.root.visible, mp: r1(M.mp), cool: r2(M.cools.phoenix || 0), cast: ph.lastCast && { launched: ph.lastCast.launched, cancel: ph.lastCast.cancel } };
  await A.game.switchWorld('surface'); B.tick(5, 1 / 60, false);
  await G.arena(); fresh(Math.PI);
  return out;
}
// 左键：普攻时按住的左键不算操控；舞刀中新按下、按住的离刀即生效；舞刀中按下又松开的不算
export function lmbRun() {
  const A = Q(), ph = A.phoenix, M = A.moves, ptr = A.game.pointer, out = {};
  const lights = () => (M.act?.key?.startsWith('light') ? M.act.key : null);
  // 1. 按住左键连击中按 3
  fresh(Math.PI); clearFoes(); A.cam.pitch = 0.05;
  ptr.setAttack(true); run([], 0.4);
  const before = lights();
  let pressed = null;
  run([], 1.5, (t) => { if (M.canStart('skill')) { ph.mode = 'strike'; M.cools.phoenix = 0; M.mp = M.mpMax; M.press('phoenix', true); pressed = r2(t); return false; } });
  let lightsInCast = 0, steerAtLaunch = null;
  run([], 1.3, () => { if (lights()) lightsInCast++; if (ph.bird && steerAtLaunch == null) steerAtLaunch = { steering: ph.bird.steering, armed: ph.bird.armed }; });
  out.heldFromLight = { lightBefore: before, pressedAt: pressed, lightsDuringCast: lightsInCast, atLaunch: steerAtLaunch, owns: ph.ownsLMB() };
  ptr.setAttack(false); run([], 0.1); ptr.setAttack(true); run([], 0.2);
  out.heldFromLight.repress = { steering: !!ph.bird?.steering, light: lights() };
  ptr.setAttack(false); ph.clear('test'); run([], 0.2);
  // 2. 舞刀 0.5 秒时新按下并按住：离刀即操控（左键不出剑）
  fresh(Math.PI); ph.mode = 'strike'; M.cools.phoenix = 0; M.mp = M.mpMax; A.cam.pitch = 0.05;
  M.press('phoenix', true); run([], 0.5);
  ptr.setAttack(true);
  let intentRow = null, lightsInCast2 = 0;
  run([], 0.7, () => { if (lights()) lightsInCast2++; if (ph.bird && !intentRow) intentRow = { steering: ph.bird.steering, held: ph.bird.held, intent: ph.lastCast?.intent }; });
  run([], 0.2);
  out.newPress = { atLaunch: intentRow, lightsDuringCast: lightsInCast2, press: ph.bird?.diag?.press.map((p) => ({ t: r3(p.t), resp: p.resp, fromCast: !!p.fromCast })) };
  ptr.setAttack(false); ph.clear('test'); run([], 0.2);
  // 3. 舞刀中按下又松开：离刀时不操控
  fresh(Math.PI); ph.mode = 'strike'; M.cools.phoenix = 0; M.mp = M.mpMax; A.cam.pitch = 0.05;
  M.press('phoenix', true); run([], 0.4); ptr.setAttack(true); run([], 0.2); ptr.setAttack(false);
  let r3row = null;
  run([], 0.6, () => { if (ph.bird && !r3row) r3row = { steering: ph.bird.steering, held: ph.bird.held }; });
  out.tapRelease = r3row;
  ph.clear('test'); fresh(Math.PI);
  return out;
}

// =====================================================================================
// 凤凰的操控（开阔山坡上）：近距离转向、上下、松开保持、再接管、折返、俯冲
// =====================================================================================
function openSpot(yaw = G.OPEN.yaw) { fresh(yaw, G.OPEN); Q().cam.set(yaw, 0.05, 8); }
// 让镜头（准星）朝世界方向：yaw、pitch（cam.pitch 正为朝下）
function aim(yaw, pitch) { const c = Q().cam; c.yaw = yaw; c.pitch = pitch; }
function launch(mode = 'strike') {
  const A = Q(), ph = A.phoenix, M = A.moves;
  ph.mode = mode; M.cools.phoenix = 0; M.mp = M.mpMax;
  M.press('phoenix', true);
  run([], 1.4, () => !ph.bird);
  return ph.bird;
}
const yawOf = (v) => Math.atan2(v.x, v.z), pitchOf = (v) => Math.asin(Math.max(-1, Math.min(1, v.y)));
const ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export function steerRun() {
  const A = Q(), ph = A.phoenix, ptr = A.game.pointer, out = {};
  openSpot();
  const b = launch();
  if (!b) return { error: 'no bird' };
  run([], 0.2);
  // 1. 抬头：准星向上约 40°、按住左键 → 俯仰角速度（限 300°/秒）、离刀后第一次按下的响应
  aim(yawOf(b.dir), -0.7);
  ptr.setAttack(true);
  let maxP = 0, pp = pitchOf(b.dir);
  run([], 0.5, () => { const p = pitchOf(b.dir), r = Math.abs(p - pp) * 60; pp = p; maxP = Math.max(maxP, r); return !!ph.bird; });
  out.climb = { pitchDeg: r1(pitchOf(b.dir) * 180 / Math.PI), maxPitchRate: r1(maxP * 180 / Math.PI), limit: PHOENIX.strike.turnV, resp: b.diag.press[0]?.resp ?? null };
  // 2. 松开：保持方向
  ptr.setAttack(false);
  const dh = b.dir.clone(); run([], 0.5);
  out.releaseHold = { driftDeg: r2(b.dir.angleTo(dh) * 180 / Math.PI) };
  // 3. 近距离急转：准星转向左侧 90°（水平），再按住——转过 85° 的时间、最大偏航角速度、再接管的响应
  const yawB = yawOf(b.dir), nPress = b.diag.press.length;
  aim(yawB + Math.PI / 2, 0.0);
  ptr.setAttack(true);
  let t85 = null, maxRate = 0, prev = yawOf(b.dir), tt = 0;
  run([], 0.6, () => { tt += 1 / 60; const y = yawOf(b.dir), r = Math.abs(ang(y - prev)) * 60; prev = y; maxRate = Math.max(maxRate, r); if (t85 == null && Math.abs(ang(y - yawB)) > 85 * Math.PI / 180) t85 = r3(tt); return !!ph.bird; });
  out.turn90 = { t85, maxYawRate: r1(maxRate * 180 / Math.PI), limit: PHOENIX.strike.turnH, retakeResp: b.diag.press[nPress]?.resp ?? null };
  // 4. 俯身向下：准星朝下约 35° → 向下的俯仰角速度
  aim(yawOf(b.dir), 0.6);
  let maxD = 0; pp = pitchOf(b.dir);
  run([], 0.4, () => { const p = pitchOf(b.dir), r = Math.abs(p - pp) * 60; pp = p; maxD = Math.max(maxD, r); return !!ph.bird; });
  out.down = { pitchDeg: r1(pitchOf(b.dir) * 180 / Math.PI), maxPitchRate: r1(maxD * 180 / Math.PI) };
  ptr.setAttack(false);
  run([], 7, () => !!ph.bird);
  const fl = ph.lastFlight;
  out.flight = fl && { life: fl.life, reason: fl.reason, resp: fl.resp, errMax: fl.errMax, errMedian: fl.errMedian, turnMax: fl.turnMax, speedMax: fl.speedMax, speedMin: fl.speedMin };
  ph.clear('test'); fresh(Math.PI);
  return out;
}
// 折返：飞出 80 米自动折返（不接受左键），回到 65 米内再接管（左键仍按着就直接接上）
export function returnRun() {
  const A = Q(), ph = A.phoenix, ptr = A.game.pointer, P = A.player, out = {};
  openSpot();
  const b = launch();
  if (!b) return { error: 'no bird' };
  aim(yawOf(b.dir), -0.25);                 // 略朝上飞，免得撞上山坡
  ptr.setAttack(true);
  run([], 0.6);
  // 主人往回跑开（相当于玩家掉头疾行）：这里直接把人挪到身后 70 米外的空地，凤凰随即在 80 米外
  const back = { x: P.pos.x - Math.sin(yawOf(b.dir)) * 70, z: P.pos.z - Math.cos(yawOf(b.dir)) * 70 };
  P.place(back.x, back.z, P.heading, A.terrain.heightAt(back.x, back.z));
  const rows = [];
  let tRet = null, tRetake = null, steeringWhileRet = 0, maxD = 0, t = 0, flips = 0, lastRet = false, dirFlips = 0, lastYaw = yawOf(b.dir), lastDy = 0;
  const owner = () => P.pos.clone().setY(P.pos.y + 1.4);
  run([], 7.0, () => {
    t += 1 / 60;
    const d = b.pos.distanceTo(owner()); maxD = Math.max(maxD, d);
    if (b.returning !== lastRet) { flips++; lastRet = b.returning; }
    if (b.returning && tRet == null) tRet = r2(t);
    if (b.returning && b.steering) steeringWhileRet++;
    // 折返中准星仍朝外、左键一直按着：方向不应来回摆（转向的正负号翻转次数）
    const y = yawOf(b.dir), dy = ang(y - lastYaw); if (b.returning && Math.abs(dy) > 1e-4 && Math.abs(lastDy) > 1e-4 && Math.sign(dy) !== Math.sign(lastDy)) dirFlips++; if (Math.abs(dy) > 1e-4) lastDy = dy; lastYaw = y;
    if (tRet != null && !b.returning && tRetake == null) tRetake = { t: r2(t), d: r1(d), steering: b.steering };
    if (Math.round(t * 60) % 30 === 0) rows.push(`${r1(t)}s ${r1(d)}m ${b.returning ? '折返' : b.steering ? '操控' : '保持'}`);
    return !!ph.bird;
  });
  ptr.setAttack(false);
  out.ret = { at: tRet, maxDist: r1(maxD), steeringWhileReturning: steeringWhileRet, modeChanges: flips, turnSignFlipsWhileReturning: dirFlips, retake: tRetake, log: rows, events: ph.events.filter((e) => e.kind === 'return' || e.kind === 'retake').map((e) => `${e.kind}@${e.t}:${e.dist}`) };
  ph.clear('test'); fresh(Math.PI);
  return out;
}
// 俯冲：前方 16 米内、22° 内看得见的敌人——0.2 秒的时间常数加速到 20 米/秒；准星移开（偏离 > 33°）后同样平滑回落；偏在一旁的不俯冲。
// 在演武场的比试圈里做（平地、视线通畅；开阔山坡那边隔着院墙，凤凰正确地不俯冲）
function aimAt(p) { const A = Q(), c = A.camera.position; const dx = p.x - c.x, dz = p.z - c.z, dy = p.y - c.y; aim(Math.atan2(dx, dz), -Math.atan2(dy, Math.hypot(dx, dz))); }
export function diveRun() {
  const A = Q(), ph = A.phoenix, ptr = A.game.pointer, out = {};
  const chest = (e) => e.pos.clone().setY(e.pos.y + 1.2);
  const los = (e) => ph.clearLine(A.player.pos.clone().setY(A.player.pos.y + 1.4), chest(e));
  // 1. 对准：魔将在身前 14 米，按住左键、准星压在它身上
  G.ringSpot(); A.cam.set(A.player.heading, 0.05, 8);
  let [e] = foes([['elite', 14, 0]], { hp: 99999 });
  run([], 0.1); aimAt(chest(e));
  const los1 = los(e);
  let b = launch();
  if (!b) return { error: 'no bird' };
  ptr.setAttack(true);
  let t = 0, tDive = null, t90 = null; const rows = [];
  const pre = { diving: b.diving, speed: r2(b.speed) };
  run([], 2, () => { t += 1 / 60; aimAt(chest(e)); if (b.diving && tDive == null) tDive = r3(t); if (tDive != null && t90 == null && b.speed >= 12 + 0.9 * 8) t90 = r3(t - tDive); rows.push([r3(t), r2(b.speed), b.diving ? 1 : 0, r1(b.pos.distanceTo(chest(e)))]); return !!ph.bird; });
  ptr.setAttack(false);
  out.aligned = { lineOfSight: los1, atLaunch: pre, diveStartAt: tDive, to90pct: t90, expect90: r2(PHOENIX.strike.dive.tau * Math.log(10)), maxSpeed: Math.max(...rows.map((x) => x[1])), impact: ph.events.find((x) => x.kind === 'impact')?.target ?? null, trace: rows.filter((_, i) => i % 3 === 0).map((x) => x.join(' ')) };
  clearFoes(); ph.clear('test');
  // 2. 俯冲中把准星移开 60°：脱离后平滑回落到 12 米/秒
  G.ringSpot(); A.cam.set(A.player.heading, 0.05, 8);
  [e] = foes([['elite', 15.5, 0]], { hp: 99999 });
  run([], 0.1); aimAt(chest(e));
  b = launch(); ptr.setAttack(true);
  t = 0; let tOff = null, tBack = null, offAt = null; const rows2 = [];
  run([], 1.6, () => { t += 1 / 60; if (tOff == null) aimAt(chest(e)); if (b.diving && tOff == null && b.speed > 16) { tOff = r3(t); const c = A.cam; aim(c.yaw + 1.05, c.pitch); offAt = r2(b.speed); } if (tOff != null && tBack == null && !b.diving && b.speed <= 12.8) tBack = r3(t - tOff); rows2.push([r3(t), r2(b.speed), b.diving ? 1 : 0]); return !!ph.bird; });
  ptr.setAttack(false);
  out.veerOff = { aimedAwayAt: tOff, speedThen: offAt, backTo12_8: tBack, note: '偏离 33° 之后才脱离俯冲（滞回），之后时间常数 0.2 秒回落', trace: rows2.filter((_, i) => i % 3 === 0).map((x) => x.join(' ')) };
  clearFoes(); ph.clear('test');
  // 3. 飞行中前方偏 35° 处出现一只（不按左键）：不俯冲
  G.ringSpot(); clearFoes(); A.cam.set(A.player.heading, 0.05, 8);
  b = launch();
  run([], 0.05);
  const d = b.dir.clone(), side = new A.THREE.Vector3(d.z, 0, -d.x).normalize();
  const at = b.pos.clone().addScaledVector(d, 12 * Math.cos(35 * Math.PI / 180)).addScaledVector(side, 12 * Math.sin(35 * Math.PI / 180));
  [e] = foes([['elite', 0, 0]], { hp: 99999 }); e.pos.set(at.x, A.combat.groundAt(at.x, at.z, at.y + 3), at.z);
  let dived = 0, minAng = 180;
  run([], 0.8, () => { if (b.diving) dived++; minAng = Math.min(minAng, chest(e).sub(b.pos).normalize().angleTo(b.dir) * 180 / Math.PI); return !!ph.bird; });
  out.offAxis = { lineOfSight: los(e), divingFrames: dived, minAngleDeg: r1(minAng), speed: r2(b.speed) };
  clearFoes(); ph.clear('test'); fresh(Math.PI);
  return out;
}

// =====================================================================================
// 凤凰伤害（21 级、无装备与增伤）：撞击、周围、灼烧、凤焰弹反、护战三招
// =====================================================================================
function fixRand(v) { const ph = Q().phoenix, keep = ph.rand; ph.rand = typeof v === 'function' ? v : () => v; return () => { ph.rand = keep; }; }
export function damageRun() {
  const A = Q(), ph = A.phoenix, M = A.moves, out = {};
  A.prog.debugSetLevel(21, { qi: 0 });
  const D = PHOENIX.dBase * statMul('dmg', 21);
  out.dCast = r2(D);
  out.expect = { main: r2(D * PHOENIX.strike.hit.main), burst: r2(D * PHOENIX.strike.hit.burst), burn: r3(D * PHOENIX.strike.burn), parry: r2(D * PHOENIX.strike.parry.k), bolt: r2(D * PHOENIX.guard.bolt.k), swoop: r2(D * PHOENIX.guard.swoop.k), breath: r2(D * PHOENIX.guard.breath.k) };
  const strike = () => { A.cam.pitch = 0.1; ph.mode = 'strike'; M.cools.phoenix = 0; M.mp = M.mpMax; M.press('phoenix', true); run([], 4, () => !ph.events.find((e) => e.kind === 'impact')); return ph.events.find((e) => e.kind === 'impact'); };
  // 1. 同为金丹的魔将（不克制）：主目标 2.0 → 720；旁边一只魔将 0.75 → 270；随机数 0.99（不暴击、不秒杀）
  G.ringSpot(); ph.events.length = 0; let undo = fixRand(0.99);
  let [m, s] = foes([['elite', 9, 0], ['elite', 9.5, 2.8]], { hp: 5000 });
  const imp = strike();
  out.impact = { target: imp?.target, main: imp?.main, burst: imp?.burst, exec: imp?.exec, mainHp: r1(5000 - m.hp), sideHp: r1(5000 - s.hp) };
  // 2a. 照常：撞击把主目标击退（knock 2.6），之后它站着不动——20 秒里它实际受到的灼烧
  const seal0 = ph.zones.find((z) => z.kind === 'seal');
  const hpA = m.hp;
  run([], 1.0);
  out.knockback = seal0 ? { mainFromSeal: r2(Math.hypot(m.pos.x - seal0.c.x, m.pos.z - seal0.c.z)), sealR: seal0.r, mainInFire: ph.zonesTouching(m, []).length > 0, sideInFire: ph.zonesTouching(s, []).length > 0 } : null;
  run([], 19.4);
  out.natural = { mainBurn: r1(hpA - m.hp), mainTotal: r1(5000 - m.hp), sideBurn: r1(5000 - s.hp - (imp?.burst?.[0]?.amount ?? 0)) };
  undo(); clearFoes(); ph.clear('test');
  // 2b. 一直站在火里：撞击之后把主目标每帧按回印记中心（不让击退带出去）——20 秒共 40 跳 × 3.6 ≈ 144；撞击 + 灼烧 ≈ 864
  G.ringSpot(); ph.events.length = 0; undo = fixRand(0.99);
  [m] = foes([['elite', 9, 0]], { hp: 5000 });
  const imp2 = strike();
  const seal1 = ph.zones.find((z) => z.kind === 'seal');
  const hpB = m.hp;
  run([], 20.4, () => { if (seal1) m.pos.set(seal1.c.x, seal1.c.y, seal1.c.z); });
  out.fullBurn = { impact: imp2?.main?.amount, burn: r1(hpB - m.hp), ticks: r1((hpB - m.hp) / (D * PHOENIX.strike.burn)), total: r1(5000 - m.hp),
    expect: { ticks: 40, burn: r1(40 * D * PHOENIX.strike.burn), sum: r1(D * PHOENIX.strike.hit.main + 40 * D * PHOENIX.strike.burn) } };
  undo(); clearFoes(); ph.clear('test');
  // 3. 低一个大境界的魔修（筑基）：一切伤害 ×2
  G.ringSpot(); ph.events.length = 0; undo = fixRand(0.99);
  [m] = foes([['shade', 9, 0]], { hp: 5000 });
  out.lowRealm = { main: strike()?.main };
  undo(); clearFoes(); ph.clear('test');
  // 4. 凤焰弹反：主人站在印记里，给一个真实格式的弹反事件
  G.ringSpot(); ph.events.length = 0; undo = fixRand(0.99);
  [m] = foes([['elite', 9, 0]], { hp: 5000 });
  strike();
  const seal = ph.zones.find((z) => z.kind === 'seal');
  undo(); clearFoes();
  if (seal) {
    A.player.place(seal.c.x, seal.c.z, Math.PI, ph.groundUnder(seal.c.x, seal.c.z, seal.c.y + 1));
    const [e2] = foes([['elite', 2.5, 0]], { hp: 5000 });
    run([], 1.2);
    const r = ph.onParry({ seq: 77001, specId: 'test:shock', seg: 0, from: null });
    out.parryShock = { hits: r?.hits, hp: r1(5000 - e2.hp) };
  }
  clearFoes(); ph.clear('test'); fresh(Math.PI);
  return out;
}
// 凤灵护战 30 秒：三只魔将围着打（不还手）——各招的次数、伤害与总伤害（实测，不假定 12 次）
export function guardRun({ secs = 30.5, list = [['elite', 7, -3], ['elite', 8, 3], ['elite', 11, 0]] } = {}) {
  const A = Q(), ph = A.phoenix, M = A.moves, out = {};
  A.prog.debugSetLevel(21, { qi: 0 });
  fresh(Math.PI); ph.resetStats();
  const es = foes(list, { hp: 20000 });
  ph.mode = 'guard'; M.cools.phoenix = 0; M.mp = M.mpMax; M.press('phoenix', true);
  run([], 1.3, () => !ph.bird);
  const t0 = ph.t;
  run([], secs, () => { A.combat.playerUnit.hp = A.combat.playerUnit.maxHp; return !!ph.bird; });
  const S = ph.stats;
  out.guard = { life: r2(ph.t - t0), attacks: { ...S.guardAtk }, total: Object.values(S.guardAtk).reduce((a, b) => a + b, 0), dmg: r1(S.guardDmg), byFoe: es.map((e) => r1(20000 - e.hp)),
    perHit: { bolt: r2(PHOENIX.dBase * PHOENIX.guard.bolt.k), swoop: r2(PHOENIX.dBase * PHOENIX.guard.swoop.k), breathFull: r2(PHOENIX.dBase * PHOENIX.guard.breath.k) } };
  clearFoes(); ph.clear('test'); fresh(Math.PI);
  return out;
}

// =====================================================================================
// 完美弹反：收益（剑意 +8、守势回 25%）、反击强化（2 秒内下一次普攻 / 拔刀斩的第一个有效目标 ×1.5，不叠层、刷新、空挥不消耗、到时消失、剑气不吃）
// =====================================================================================
// 身前的魔修出一爪，按时举剑弹反；返回弹反前后的剑意、守势、反击窗口
// 弹反那一刻前后的剑意、守势（包住 moves.onParry 读，排除守势的自然回复）
function parryOnce(e, { at = 0 } = {}) {
  const A = Q(), M = A.moves, C = A.combat, w = e.cfg.windup;
  const r = { p0: M.stat.parries };
  const op = M.onParry;
  M.onParry = function (...args) { r.intent0 = r1(this.intent); r.guard0 = r1(this.guardHP); r.wasCountering = this.countering; const o = op.apply(this, args); r.intent1 = r1(this.intent); r.guard1 = r1(this.guardHP); r.window = r2(this.counterUntil - this.time); return o; };
  try { run([[at, () => { e.state = 'chase'; e.stunT = 0; e.cool = 0; e.begin('melee'); e.cool = 99; }], [at + w - 0.1, () => C.setGuard(true)], [at + w + 0.12, () => C.setGuard(false)]], at + w + 0.15, () => { C.playerUnit.hp = C.playerUnit.maxHp; }); }
  finally { M.onParry = op; }
  r.parried = M.stat.parries - r.p0; r.counterK = PC.guard.counterK; r.leftAfter = r2(M.counterUntil - M.time);
  return r;
}
// 出一招（light / qi / iai），推进到收招，返回这一招打中的结果（目标、伤害、是否反击强化）
function swing(kind, secs = 0.9) {
  const A = Q(), M = A.moves, n0 = M.log.length ? M.log[M.log.length - 1].id : 0;
  if (kind === 'iai') { M.press('power', true); run([], 0.12); M.press('power', false); run([], secs); }
  else { M.press(kind, true); if (kind === 'light') run([], 0.02, () => { M.held.light = false; }); run([], secs); }
  const L = M.log.filter((x) => x.id > n0);
  return L.map((x) => ({ key: x.key, results: (x.results || []).map((r) => ({ target: r.target, r: r.r, dmg: r.dmg, counter: !!r.counter })) }));
}
export function parryRun() {
  const A = Q(), M = A.moves, C = A.combat, out = {};
  const setup = (list) => { fresh(Math.PI); clearFoes(); const es = foes(list, { hp: 5000 }); run([], 0.2); M.intent = 50; M.guardHP = 40; M.counterUntil = -99; M.guardUsed = M.time; return es; };
  // 0. 对照：没有弹反时一记斜斩打魔修的伤害
  let [e] = setup([['shade', 1.8, 0]]);
  out.base = swing('light');
  // 1. 弹反：剑意 +8、守势 +25（上限 100 的 25%）、反击窗口 2 秒；随后一记斜斩 ×1.5（只这一下）
  [e] = setup([['shade', 1.8, 0]]);
  out.parry = parryOnce(e);
  out.counterHit = swing('light', 0.5);
  out.afterUse = { countering: M.countering, counters: M.stat.counters, last: M.lastCounter };
  out.nextHit = swing('light', 0.6);
  // 2. 一刀扫中两个目标：只有第一个有效目标 ×1.5
  const two = setup([['shade', 1.7, -0.45], ['shade', 1.9, 0.5]]);
  out.twoTargets = { parry: parryOnce(two[0]), hit: swing('light', 0.5) };
  // 3. 不叠层：2 秒内连续两次弹反（两只魔修先后出手）→ 仍是 ×1.5，期限从第二次弹反重新算 2 秒
  const pair = setup([['shade', 1.8, 0.35], ['shade', 1.8, -0.35]]);
  const r0 = M.stat.counterRefresh || 0;
  const p1 = parryOnce(pair[0]);
  run([], 0.6);
  const p2 = parryOnce(pair[1]);
  out.noStack = { first: p1, second: p2, refreshed: (M.stat.counterRefresh || 0) - r0, hit: swing('light', 0.5) };
  // 4. 空挥不消耗（身前没人），之后在期限内打中才用掉
  [e] = setup([['shade', 1.8, 0]]);
  out.whiff = { parry: parryOnce(e) };
  const keep = e.pos.clone(); e.pos.set(keep.x + 30, keep.y, keep.z);
  out.whiff.air = swing('light', 0.5);
  out.whiff.stillReady = { countering: M.countering, left: r2(M.counterUntil - M.time) };
  e.pos.copy(keep);
  out.whiff.hit = swing('light', 0.5);
  // 5. 到时消失：弹反后等 2.1 秒再打——不再 ×1.5
  [e] = setup([['shade', 1.8, 0]]);
  out.expire = { parry: parryOnce(e) };
  run([], 2.1);
  out.expire.hit = swing('light', 0.5);
  // 6. 剑气不吃、也不消耗；之后的拔刀斩吃
  [e] = setup([['shade', 3.0, 0]]);
  e.pos.set(A.player.pos.x + Math.sin(Math.PI) * 1.8, e.pos.y, A.player.pos.z + Math.cos(Math.PI) * 1.8);
  out.exclude = { parry: parryOnce(e) };
  M.cools.qi = 0; M.mp = M.mpMax;
  const s0 = e.hp;
  out.exclude.qi = { hit: swing('qi', 1.0), hpLost: r1(s0 - e.hp), countering: M.countering };
  out.exclude.iai = swing('iai', 0.9);
  clearFoes(); fresh(Math.PI);
  return out;
}

// =====================================================================================
// 第五十层龙君：弹反的僵直（一阶段 1.0 秒、二阶段 0.8 秒；受击动作与 AI 的僵直同一段）；双爪追猎的前一爪只顿一下
// =====================================================================================
export async function toBoss() {
  const A = Q(), F = A.boss50;
  if (A.world.name !== 'boss50') { await A.game.towerRoom.enter(); B.tick(30, 1 / 60, false); await F.enter(); B.tick(60, 1 / 60, false); }
  if (F.state === 'dormant') { F.debug.start(); B.tick(30, 1 / 60, false); F.debug.skip(); B.tick(90, 1 / 60, false); }
  return F;
}
// 逼龙君出 id，第 pressAt 秒（招式时刻）举剑；返回是否弹反、弹反后龙君的状态时间线
async function bossParry(id, pressAt, { hold = 0.25, watch = 2.2 } = {}) {
  const A = Q(), F = A.boss50, C = A.combat, M = A.moves, U = C.playerUnit;
  const B16 = await import('/tools/r16_boss_bot.js');
  F.debug.ai(true);
  B16.stage({ d: 3.2 });
  M.reset(); U.invuln = 0; U.hp = U.maxHp;
  F.posture = 0;
  const p0 = M.stat.parries;
  const hits = [];
  const L = (e) => { if (e.target === U) hits.push({ r: e.result, t1: r2(F.M?.t1 ?? -1) }); };
  C.hitListeners.add(L);
  F.debug.move(id);
  let pressed = false, relT = null, n = 0, parT = null, pressT1 = null;
  const tl = [];
  while (n < 600) {
    const t1 = F.M?.t1;
    if (!pressed && t1 != null && t1 >= pressAt) { pressed = true; pressT1 = r2(t1); C.setGuard(true); relT = M.time + hold; }
    if (relT != null && M.time >= relT) { C.setGuard(false); relT = null; }
    A.tick(1 / 60, 1, false); n++; U.hp = U.maxHp;
    if (parT == null && M.stat.parries > p0) parT = F.fightT;
    if (parT != null) { tl.push([r3(F.fightT - parT), F.B.mode, F.M?.id || null, F.rig.name]); if (F.fightT - parT > watch) break; }
    if (!F.M && parT == null && pressed && relT == null && n > 200) break;
  }
  C.setGuard(false); C.hitListeners.delete(L);
  return { parried: M.stat.parries - p0, tl, stun: F.stats.parryStun || null, hits, pressT1, move: id, dist: r2(Math.hypot(A.player.pos.x - F.root.x, A.player.pos.z - F.root.z)) };
}
export async function dragonParryRun() {
  const A = Q(), F = await toBoss(), out = {};
  A.prog.debugSetLevel(21, { qi: 0 });
  const tries = [];
  const scan = async (id) => {
    for (let p = 0.2; p <= 1.2; p += 0.05) { const r = await bossParry(id, r2(p)); tries.push({ id, p: r2(p), hits: r.hits, pressT1: r.pressT1, dist: r.dist }); if (r.parried) return { pressAt: r2(p), ...r }; }
    return null;
  };
  const summarize = (r) => {
    if (!r) return null;
    const hit = r.tl.find((x) => x[1] === 'hitH'), out1 = r.tl.find((x) => hit && x[0] > hit[0] && x[1] !== 'hitH'), next = r.tl.find((x) => x[2] && x[0] > 0.1);
    return { pressAt: r.pressAt, stunCfg: r.stun?.stun, phase: r.stun?.phase, hitHFrom: hit?.[0] ?? null, recoverAt: out1?.[0] ?? null, nextMoveAt: next?.[0] ?? null, nextMove: next?.[2] ?? null, modes: [...new Set(r.tl.map((x) => x[1]))] };
  };
  F.debug.phase(1);
  out.p1 = summarize(await scan('claw1'));
  F.debug.phase(2);
  out.p2 = summarize(await scan('claw1'));
  // 双爪追猎（二阶段三爪）：前一爪被弹开只顿一下（不进 hitH），招式照常
  const r2c = await scan('claw2');
  out.double = r2c && { pressAt: r2c.pressAt, modes: [...new Set(r2c.tl.map((x) => x[1]))], moveKept: r2c.tl.filter((x) => x[2] === 'claw2').length, hitch: F.hitchT ?? null };
  out.clip = { hitH: r3(F.rig.dur('hitH') || 0) };
  if (!out.p1 || !out.p2) out.tries = tries.slice(0, 30);
  F.debug.phase(1);
  await A.game.switchWorld('surface'); B.tick(10, 1 / 60, false);
  await G.arena(); fresh(Math.PI);
  return out;
}

// =====================================================================================
// 帧耗时：一帧一帧推进并画出来，每帧读回一个像素（等显卡画完）——分开看舞刀、飞行（含操控）、万剑归宗各段每帧的 CPU + GPU 用时
// =====================================================================================
export function frameRun({ part = 'phoenix', w = 1280, h = 720, rounds = 2 } = {}) {
  const A = Q(), ph = A.phoenix, M = A.moves, R0 = A.renderer, gl = R0.getContext(), px = new Uint8Array(4), ptr = A.game.pointer;
  // 预览窗格隐藏时画布是 0×0：按 w×h 画（与录像相同的做法），测完复原
  const keep = { s: R0.getSize(new A.THREE.Vector2()), pr: R0.getPixelRatio(), asp: A.camera.aspect };
  R0.setPixelRatio(1); R0.setSize(w, h, false); A.camera.aspect = w / h; A.camera.updateProjectionMatrix();
  const times = [];
  const frame = (tag, round) => { const t0 = performance.now(); A.tick(1 / 60, 1, true); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const dt = performance.now() - t0; times.push([tag, dt, round, M.act ? r3(M.act.t) : null, A.renderer.info.render.calls]); };
  skyQuiet(true);
  try {
    for (let k = 0; k < rounds; k++) {
      if (part === 'phoenix') {
        openSpot();
        for (let i = 0; i < 30; i++) frame('idle', k);
        ph.mode = 'strike'; M.cools.phoenix = 0; M.mp = M.mpMax; M.press('phoenix', true);
        for (let i = 0; i < 80 && !ph.bird; i++) frame('cast', k);
        aim(Q().cam.yaw + 0.8, 0.0); ptr.setAttack(true);
        for (let i = 0; i < 150 && ph.bird; i++) frame('flight', k);
        ptr.setAttack(false);
        ph.clear('test');
      } else {
        fresh(Math.PI);
        foes([['shade', 6.5, 0], ['shade', 7.5, 2.4], ['shade', 7.0, -2.6]], { hp: 5000 });
        for (let i = 0; i < 30; i++) frame('idle', k);
        M.intent = 100; M.cools.ult = 0; M.press('ult', true);
        for (let i = 0; i < 300; i++) frame('ult', k);
        clearFoes();
      }
    }
  } finally {
    R0.setPixelRatio(keep.pr); R0.setSize(keep.s.x, keep.s.y, false); A.camera.aspect = keep.asp; A.camera.updateProjectionMatrix();
  }
  const stat = (tag, round) => { const v = times.filter((x) => x[0] === tag && (round == null || x[2] === round)).map((x) => x[1]).sort((a, b) => a - b); return v.length ? { n: v.length, median: r1(v[Math.floor(v.length / 2)]), p95: r1(v[Math.min(v.length - 1, Math.floor(v.length * 0.95))]), max: r1(v[v.length - 1]) } : null; };
  const tags = [...new Set(times.map((x) => x[0]))];
  const spikes = times.filter((x) => x[1] > 40).map((x) => `${x[0]}#${x[2]} t=${x[3]} ${r1(x[1])}ms calls ${x[4]}`);
  const calls = times.filter((x) => x[2] === rounds - 1).map((x) => x[4]);
  fresh(Math.PI);
  return { size: [w, h], rounds: Object.fromEntries([...Array(rounds).keys()].map((k) => [k, Object.fromEntries(tags.map((t) => [t, stat(t, k)]))])), spikes, drawCalls: { min: Math.min(...calls), max: Math.max(...calls) } };
}
