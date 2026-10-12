// 第二十五轮自检：拔刀斩「终式·墨·终焉」——墨势积累、超时与保留、3 秒蓄力、未满 / 取消 / 空挥 / 正式消耗、×2 伤害、主目标、处决资格与阶段比例、
// 唯一记录与结算、完整 / 精简 / 退回、墙边 / 悬崖 / 大型目标、跳过 / 暂停 / 失焦 / 重试 / 换场景、连续三次、不同帧率、原有功能的回归。
// 都按真实的输入、出招、结算、演出代码推进（__qinglan.tick），不另写一套。
// 用法（预览）：const T = await import('/tools/r25_tests.js?v=' + Date.now()); await T.setup(); T.stackRun() …；长的放 setTimeout 里跑（见 runAll）
import * as B from './r17_combat_bot.js';
import * as G from './r21_growth.js';
import { FINALE as F } from '/src/game/inkFinaleConfig.js';
import { PLAYER_COMBAT as PC } from '/src/game/combatConfig.js';
import { stageRatio, stageOf } from '/src/game/inkFinale.js';

const Q = () => window.__qinglan;
const r2 = (v) => +(+v).toFixed(2), r3 = (v) => +(+v).toFixed(3);
export const PLAZA = { x: 0, z: 26, yaw: Math.PI };
export const { run, foes, clearFoes, skyQuiet } = G;

export async function setup() {
  await B.setup();
  const A = Q();
  B.quietDragons(true);
  skyQuiet(true);
  A.prog.debugSetLevel?.(21, { qi: 0 });
  equip();
  fresh();
  return { world: A.world.name, slots: A.loadout.slots.slice(), state: A.finale.debugState() };
}
// 默认的六格（拔刀斩在 R）；自检专用（不看脱战）
export function equip(slots = ['qi', 'heavy', 'power', 'ult', 'seal', 'phoenix']) { return Q().loadout.debugSet(slots); }
// 每个测试前：人站回演武广场、清墨势与演出
export function fresh(at = PLAZA, yaw = at.yaw ?? PLAZA.yaw) {
  const A = Q(), Fn = A.finale;
  if (Fn.active) Fn.invalidate('test');
  Fn.blend = null;
  G.fresh(yaw, at);
  if (at.y != null) { A.player.place(at.x, at.z, yaw, at.y); A.player.heading = yaw; A.cam.set(yaw, 0.3, 8); A.cam.snap(A.player.pos.clone().setY(at.y + 1.55)); B.tick(4, 1 / 60, false); }
  Fn.resetStack('test');
  A.game.freeCam = null;
  return A.player.pos.clone();
}
// 把测试用的敌人钉在原地（普攻的击退会把它们推出够得着的范围）
export function pinner(es) { const home = es.map((e) => e.pos.clone()); return () => es.forEach((e, i) => { if (!e.alive) return; e.pos.x = home[i].x; e.pos.z = home[i].z; e.kb = null; }); }
// 按住拔刀斩所在的槽键 secs 秒再松开（src：'slot' | 'z' | 'mmb'）
export function charge(secs, { src = 'slot', each = null } = {}) {
  const A = Q(), L = A.loadout, i = L.slotOf('power');
  const down = () => (src === 'slot' ? L.pressSlot(i, true) : L.alias('power', true, src));
  const up = () => (src === 'slot' ? L.pressSlot(i, false) : L.alias('power', false, src));
  down(); run([], secs, each); up();
}
export function lastAct(key) { return [...Q().moves.log].reverse().find((x) => x.key === key) || null; }

// =====================================================================================
// 1. 解锁、继承拔刀斩的槽与按键（槽键、Z、鼠标中键）；2. 未装备时一切别名都放不出来
// =====================================================================================
export function unlockRun() {
  const A = Q(), L = A.loadout, M = A.moves, Fn = A.finale, out = {};
  out.save = A.state.d.skillUp; out.unlocked = Fn.unlocked; out.level = A.prog.level;
  out.slots = L.slots.slice(); out.powerSlot = L.slotOf('power'); out.label = L.label(L.slotOf('power'));
  // 三个入口都起同一个拔刀斩（同一个技能入口）
  const tries = {};
  for (const src of ['slot', 'z', 'mmb']) {
    fresh();
    charge(0.6, { src });
    run([], 0.9);
    const a = lastAct('iai_slash'); tries[src] = { slash: !!a, act: a?.id ?? null };
  }
  out.tries = tries;
  // 卸下拔刀斩：槽键（那一格已换成别的）、Z、中键、直接调 moves.press 都放不出来
  const keep = L.slots.slice();
  L.debugSet(keep.map((id) => (id === 'power' ? null : id)));
  fresh();
  const n0 = M.log.filter((x) => x.key === 'iai' || x.key === 'iai_slash').length;
  L.alias('power', true, 'z'); run([], 0.4); L.alias('power', false, 'z');
  L.alias('power', true, 'mmb'); run([], 0.4); L.alias('power', false, 'mmb');
  M.press('power', true); run([], 0.4); M.press('power', false);
  run([], 0.6);
  out.unequipped = { iaiActs: M.log.filter((x) => x.key === 'iai' || x.key === 'iai_slash').length - n0, enabled: Fn.enabled, chargeFull: Fn.chargeFull() };
  L.debugSet(keep);
  out.reequipped = { enabled: Fn.enabled };
  out.ok = out.unlocked && tries.slot.slash && tries.z.slash && tries.mmb.slash && out.unequipped.iaiActs === 0 && !out.unequipped.enabled && out.reequipped.enabled;
  return out;
}
// 同一次蓄力只认一个发起者：槽键起的蓄力，中键、Z 按下 / 松开都不重复启动、不提前出刀
export function aliasRun() {
  const A = Q(), L = A.loadout, M = A.moves, Fn = A.finale, i = L.slotOf('power');
  fresh();
  const ign0 = Fn.stats.ignoredAlias;
  L.pressSlot(i, true); run([], 0.5);
  const id0 = M.act?.id;
  L.alias('power', true, 'mmb'); run([], 0.3); L.alias('power', true, 'z'); run([], 0.3);
  L.alias('power', false, 'mmb'); run([], 0.3); L.alias('power', false, 'z'); run([], 0.3);
  const still = M.act?.key === 'iai' && M.act?.id === id0 && !!M.iai;
  const charge = r2(M.iai?.charge ?? 0);
  L.pressSlot(i, false); run([], 0.9);
  const slashes = M.log.filter((x) => x.key === 'iai_slash' && x.id > id0).length;
  return { stillChargingAfterAliases: still, chargeAt: charge, slashes, ignored: Fn.stats.ignoredAlias - ign0, ok: still && slashes === 1 && Fn.stats.ignoredAlias - ign0 === 2 };
}

// =====================================================================================
// 演出截图：起一次处决，按演出时刻 times 用演出的机位截图（docs/screenshots/<prefix>_<时刻>.jpg）
// =====================================================================================
export async function showShots(prefix = 'r25_tmp_show', times = [0.1, 0.3, 0.6, 1.1, 1.5, 2.0, 2.5, 2.86, 3.05, 3.5, 4.3, 5.0, 5.45, 5.75, 6.05, 6.4, 6.75, 6.86, 7.05, 7.35, 7.7], { list = [['shade', 3.2, 0]], hps = [8], at = PLAZA, hour = 10, w = 640, h = 360, setup = null } = {}) {
  const A = Q(), Fn = A.finale;
  A.TIME.hour = hour; skyQuiet(false);
  fresh(at); Fn.debugGive();
  const es = foes(list, { hp: 100 }); es.forEach((e, k) => { if (hps[k] != null) e.hp = hps[k]; });
  if (setup) setup(es);
  charge(3.15);
  for (let i = 0; i < 120 && !Fn.show; i++) A.tick(1 / 60, 1, false);
  const S = Fn.show, out = [];
  if (!S) return { err: 'no show', rec: Fn.rec, why: lastAct('iai_slash')?.finale?.why };
  for (const t of times) {
    while (Fn.show && Fn.show.t < t - 1e-6) A.tick(1 / 60, 1, false);
    if (!Fn.show) break;
    A.tick(1 / 60, 1, true);
    const r = await A.shot(`${prefix}_${String(Math.round(t * 100)).padStart(3, '0')}`, { w, h });
    out.push(`${r2(Fn.show?.t ?? -1)}:${r.kb}`);
  }
  while (Fn.active) A.tick(1 / 60, 1, false);
  skyQuiet(true);
  return { mode: S.mode, shots: out, census: A.finFx.census() };
}

// 任意布置的演出截图：start() 布置好并松开蓄力（返回前已出刀或即将出刀）；之后按演出时刻 times 截图
export async function captureShow(prefix, times, start, { w = 640, h = 360, hour = 10 } = {}) {
  const A = Q(), Fn = A.finale;
  A.TIME.hour = hour; skyQuiet(false);
  const rec0 = Fn.rec;
  await start();
  for (let i = 0; i < 160 && !(Fn.show && Fn.rec !== rec0); i++) A.tick(1 / 60, 1, false);
  const S = Fn.show, out = [];
  if (!S) { skyQuiet(true); return { err: 'no show', why: lastAct('iai_slash')?.act?.finale?.why }; }
  for (const t of times) {
    while (Fn.show && Fn.show.t < t - 1e-6) A.tick(1 / 60, 1, false);
    if (!Fn.show) break;
    A.tick(1 / 60, 1, true);
    const r = await A.shot(`${prefix}_${String(Math.round(t * 100)).padStart(3, '0')}`, { w, h });
    out.push(`${r2(Fn.show?.t ?? -1)}:${r.kb}`);
  }
  const mode = S.mode, why = S.plan.why;
  while (Fn.active) A.tick(1 / 60, 1, false);
  skyQuiet(true);
  return { mode, why, shots: out };
}
export const COMPACT_TIMES = [0.05, 0.3, 0.55, 0.9, 1.4, 2.0, 2.5, 2.9, 3.08, 3.25, 3.5, 3.7];
// 墙边的精简演出（演武广场东侧屋舍前）
export async function wallShots(prefix = 'r25_tmp_wall', times = COMPACT_TIMES) {
  const A = Q(), Fn = A.finale, cw = A.cw;
  return captureShow(prefix, times, () => {
    const ang = 1.374, d = { x: Math.sin(ang), y: 0, z: Math.cos(ang) }, o = new A.THREE.Vector3(0, 15.2, 26), t = cw.ray(o, d, 40);
    fresh({ x: o.x + d.x * (t - 4.3), z: o.z + d.z * (t - 4.3) }, ang); Fn.debugGive();
    const [e] = foes([['shade', 3.0, 0]], { hp: 100 }); e.hp = 8;
    charge(3.15);
  });
}
// 第三十层一阶段（非最终）的精简演出：ratio 剩余比例
export async function boss30Shots(prefix = 'r25_tmp_b30', times = COMPACT_TIMES, { phase = 1, ratio = 0.08 } = {}) {
  const A = Q(), Fn = A.finale;
  const B24 = await import('./r24_tests.js');
  if (A.world.name !== 'boss30') await B24.setup({ ai: false });
  const f = A.game.boss30;
  return captureShow(prefix, times, async () => {
    await B24.fight({ ai: false });
    if (f.phase !== phase) f.debug.phase(phase);
    f.debugUsed = false;
    const b = f.root, yaw = f.rig.yaw;
    B24.place(b.x + Math.sin(yaw) * 3.0, b.z + Math.cos(yaw) * 3.0);
    f.unit.hp = f.unit.maxHp * ratio;
    Fn.debugGive(); charge(3.15);
  });
}
// 第五十层（大型目标）的精简演出
export async function boss50Shots(prefix = 'r25_tmp_b50', times = COMPACT_TIMES) {
  const A = Q(), Fn = A.finale;
  const B16 = await import('./r16_boss_bot.js');
  if (A.world.name !== 'boss50') { await A.game.towerRoom.enter(); run([], 0.5); await A.boss50.enter(); run([], 1); }
  const F50 = A.boss50;
  return captureShow(prefix, times, () => {
    F50.resetFight(false); F50.debug.start(); run([], 0.5); F50.debug.skip(); run([], 1.5);
    B16.stage({ d: 3.4 }); F50.debugUsed = false;
    F50.unit.hp = F50.unit.maxHp * 0.07; Fn.debugGive();
    const L = A.loadout, i = L.slotOf('power');
    L.pressSlot(i, true); run([], 3.15, () => { F50.B.gapT = 99; }); L.pressSlot(i, false);
  });
}

// =====================================================================================
// 3. 每刀最多计一次（多目标、多帧不重复）；5. 第 30 刀只成势、不打断连击，上限一层
// =====================================================================================
export function stackRun({ secs = 40, after = 5 } = {}) {
  const A = Q(), M = A.moves, Fn = A.finale;
  fresh();
  const es = foes([['shade', 1.9, 0], ['shade', 2.1, 0.9], ['shade', 2.1, -0.9]], { hp: 90000 }), pin = pinner(es);
  const v0 = Fn.stats.valid, o0 = Fn.stats.overflow, d0 = Fn.stats.dup;
  const swings = new Set(); let targetHits = 0, readyAt = null, actAt = null, countAtReady = null;
  const seen = new Set();
  M.press('light', true);
  run([], secs, (t) => {
    pin();
    for (const L of M.log) if (L.key.startsWith('light') && !seen.has(L.id)) for (const ev of L.events) if (ev.k === 'hit') { seen.add(L.id); if (ev.n > 0) { swings.add(L.id + ':' + ev.i); targetHits += ev.n; } }
    if (Fn.ready && readyAt == null) { readyAt = r2(t); actAt = M.act?.key; countAtReady = swings.size; }
    if (readyAt != null && t > readyAt + after) return false;
  });
  const attacking = M.act?.key;
  M.press('light', false); run([], 1.0, pin);
  const out = { swingsLanded: swings.size, targetHits, countAtReady, readyAt, actAtReady: actAt, stillAttacking: attacking, count: Fn.count, ready: Fn.ready,
    valid: Fn.stats.valid - v0, overflow: Fn.stats.overflow - o0, dup: Fn.stats.dup - d0 };
  out.ok = Fn.ready && Fn.count === F.stack.hits && out.countAtReady === F.stack.hits && out.dup === 0 && out.overflow > 0 && out.targetHits > out.swingsLanded && /^light/.test(attacking || '');
  return out;
}
// 普攻对木人桩、空挥、被格挡（切磋对手举剑）、被免疫（转段中的魔将）不计
export function invalidHitRun() {
  const A = Q(), M = A.moves, Fn = A.finale, C = A.combat, out = {};
  // 空挥
  fresh(); clearFoes();
  M.press('light', true); run([], 2); M.press('light', false); run([], 0.8);
  out.whiff = Fn.count;
  // 转段中（无敌）的试炼魔将
  fresh();
  const [e] = foes([['eliteStaged', 2.0, 0]], { hp: 520 }); e.shiftT = 99;
  M.press('light', true); run([], 2.2, pinner([e])); M.press('light', false); run([], 0.6);
  out.immune = { count: Fn.count, rejected: Fn.stats.rejected };
  e.shiftT = 0;
  // 木人桩（演武广场的桩，不敌对）
  fresh({ x: C.dummies[0].pos.x, z: C.dummies[0].pos.z + 2.2, yaw: Math.PI });
  A.player.heading = Math.atan2(C.dummies[0].pos.x - A.player.pos.x, C.dummies[0].pos.z - A.player.pos.z);
  const tot0 = C.dummies[0].total;
  M.press('light', true); run([], 2); M.press('light', false); run([], 0.6);
  out.dummy = { count: Fn.count, dummyDamage: Math.round(C.dummies[0].total - tot0) };
  out.ok = out.whiff === 0 && out.immune.count === 0 && out.dummy.count === 0 && out.dummy.dummyDamage > 0;
  return out;
}

// =====================================================================================
// 4. 8 秒超时（战斗时钟：打开界面不走）、成势后不因超时丢失
// =====================================================================================
export function timeoutRun() {
  const A = Q(), M = A.moves, Fn = A.finale, out = {};
  fresh();
  const es = foes([['shade', 1.9, 0]], { hp: 90000 }), pin = pinner(es);
  M.press('light', true); run([], 3.2, pin); M.press('light', false); run([], 0.8, pin);
  const since = () => r3(Fn.clock - Fn.lastHit);
  out.start = { count: Fn.count, since: since() };
  A.game.openBag(); run([], 3, pin); out.menu = { busy: A.ui.busy, count: Fn.count, since: since() }; A.ui.closePanel(); run([], 0.02);
  run([], Math.max(0, 7.9 - since()), pin); out.at79 = { count: Fn.count, since: since() };
  run([], 0.2, pin); out.at81 = { count: Fn.count, since: since() };
  // 成势之后 20 秒不打：仍在
  Fn.debugGive(); run([], 20); out.readyAfter20 = { ready: Fn.ready, count: Fn.count };
  out.ok = out.start.count > 0 && out.menu.since === out.start.since && out.at79.count === out.start.count && out.at81.count === 0 && out.readyAfter20.ready;
  return out;
}

// =====================================================================================
// 6. 3 秒蓄力、未满出刀、合法取消、空挥、正式消耗；7. 费用、冷却、×2 伤害只应用一次
// =====================================================================================
export function chargeRun() {
  const A = Q(), M = A.moves, Fn = A.finale, out = {};
  const shot = (ink, holdS, { target = true, cancel = false } = {}) => {
    fresh(); if (ink) Fn.debugGive();
    const es = target ? foes([['shade', 3.2, 0]], { hp: 100000 }) : (clearFoes(), []);
    const mp0 = M.mp, cools0 = JSON.stringify(M.cools), id0 = M.seq;
    let full = null;
    const L = A.loadout, i = L.slotOf('power');
    L.pressSlot(i, true);
    run([], holdS, (t) => { const I = M.iaiCharge; if (I && full == null && I.k >= 1) full = r3(t); if (cancel && t >= holdS - 0.3 && !M.guarding) M.press('guard', true); });
    const charging = !!M.iai;
    L.pressSlot(i, false);
    if (cancel) { run([], 0.2); M.press('guard', false); }
    run([], 1.0);
    const a0 = lastAct('iai_slash'), a = a0 && a0.id > id0 ? a0 : null, ev = a?.events.find((x) => x.k === 'draw');
    return { ink, hold: holdS, full, chargingAtRelease: charging, slash: !!a, drawInk: ev?.ink ?? null, ratio: ev?.ratio ?? null,
      blade: a?.results?.filter((r) => r.i === 0).map((r) => r.dmg) ?? [], total: es[0] ? Math.round(100000 - es[0].hp) : null,
      count: Fn.count, ready: Fn.ready, mpSpent: r2(mp0 - M.mp), coolsChanged: JSON.stringify(M.cools) !== cools0, dmgK: r3(M.dmgK) };
  };
  const e0 = Fn.stats.enhanced, c0 = Fn.stats.consumed;
  out.inkFull = shot(true, 7.0);                    // 有墨势、按住 7 秒：3 秒满、之后不自动出刀；松开：终式（×2）、消耗
  out.normalFull = shot(false, 5.2);                // 没有墨势：普通满蓄力（5 秒）
  out.inkUnder = shot(true, 2.0);                   // 有墨势、2 秒就松开：普通拔刀斩，不消耗
  out.inkCancel = shot(true, 3.4, { cancel: true }); // 有墨势、蓄满后举剑取消：不出刀、不消耗
  out.inkWhiff = shot(true, 3.2, { target: false });  // 有墨势、满蓄力空挥：消耗、不返还
  out.enhanced = Fn.stats.enhanced - e0; out.consumed = Fn.stats.consumed - c0;
  const I = out.inkFull, N = out.normalFull;
  out.ok = I.full != null && I.full <= 3.1 && I.chargingAtRelease && I.drawInk && I.blade[0] === 2 * N.blade[0] && !I.ready && I.count === 0
    && !out.inkUnder.drawInk && out.inkUnder.ready && !out.inkCancel.slash && out.inkCancel.ready
    && out.inkWhiff.drawInk && !out.inkWhiff.ready && out.enhanced === 2 && out.consumed === 2
    && [I, N, out.inkUnder, out.inkWhiff].every((x) => x.mpSpent <= 0.01 && !x.coolsChanged);
  return out;
}
// 反击强化（弹反后 2 秒）× 终式：两个倍率各乘一次（150 × 2 × 1.5），等级成长只乘一次
export function counterRun() {
  const A = Q(), M = A.moves, Fn = A.finale;
  fresh(); Fn.debugGive();
  foes([['shade', 3.2, 0]], { hp: 100000 });
  const L = A.loadout, i = L.slotOf('power');
  L.pressSlot(i, true); run([], 3.1);
  M.counterUntil = M.time + 5;                     // 等同弹反成功后的反击窗口
  L.pressSlot(i, false); run([], 0.9);
  const a = lastAct('iai_slash');
  return { blade: a?.results?.map((r) => ({ r: r.r, dmg: r.dmg, counter: !!r.counter })), expect: 150 * F.dmgK * PC.guard.counterK * M.dmgK, ok: a?.results?.[0]?.dmg === Math.round(150 * F.dmgK * PC.guard.counterK * M.dmgK) };
}

// =====================================================================================
// 8. ≤10% 处决、>10% 强化伤害、同一下打进阈值不补处决；10. 主目标稳定、一次最多处决一个
// =====================================================================================
// 一次墨势满蓄力出刀：list 敌人；hp：各自的气血（比例或数值）；lock：锁定第几个
export function inkShot(list, { hps = [], lock = null, secs = 9.5, hold = 3.15, each = null, at = PLAZA, yaw = null, hpMax = 100 } = {}) {
  const A = Q(), M = A.moves, Fn = A.finale;
  fresh(at, yaw ?? at.yaw ?? PLAZA.yaw); Fn.debugGive();
  const es = foes(list, { hp: hpMax });
  const rec0 = Fn.rec, id0 = M.seq;
  es.forEach((e, k) => { if (hps[k] != null) e.hp = hps[k]; });
  M.lock = lock != null ? es[lock] : null;
  const ex0 = Fn.stats.execs, cm0 = Fn.stats.commits;
  charge(hold);
  let showT = null, commitShowT = null, endT = null;
  const tl = [];
  let slashT = null;
  run([], secs, (t) => {
    const a = lastAct('iai_slash'); if (a && a.id > id0 && slashT == null) slashT = t;
    if (Fn.show && showT == null) showT = r3(t);
    if (Fn.show && Fn.rec !== rec0 && Fn.rec?.committed && commitShowT == null) commitShowT = r3(Fn.show.t);
    if (showT != null && !Fn.active && endT == null) endT = r3(t);
    if (each) each(t, es);
    if (endT != null && t > endT + 0.5) return false;
    if (showT == null && slashT != null && t > slashT + 1.2) return false;          // 没有处决：出刀之后看 1.2 秒就够
  });
  const a0 = lastAct('iai_slash'), a = a0 && a0.id > id0 ? a0 : null, hit = a?.events.find((x) => x.k === 'hit');
  const rec = Fn.rec !== rec0 && Fn.rec ? { ...Fn.rec } : null;
  return { es, act: a, fin: a?.act?.finale || null, why: a?.act?.finale?.why ?? null, hit, results: a?.results?.map((r) => `${r.target}:${r.r}:${r.dmg}`), execs: Fn.stats.execs - ex0, commits: Fn.stats.commits - cm0, showT, commitShowT, endT, rec };
}
export function thresholdRun() {
  const out = {};
  const at = (hp) => { const r = inkShot([['shade', 3.2, 0]], { hps: [hp] }); return { hp0: hp, execs: r.execs, alive: r.es[0].alive, hpAfter: r2(r.es[0].hp), why: r.why, via: r.rec?.via, results: r.results }; };
  out.at10 = at(10);          // 恰好 10%：处决
  out.at8 = at(8);            // 8%：处决
  out.at11 = at(11);          // 11%：拔刀斩不处决（why = hp）；第二十九轮起强化一刀打死它（只剩它一个）走通用的终结，演出照放
  // （inkShot 只看到演出的 9.5 秒，收刀合拢在 13.2 秒——三者这时都还站着，等收刀才倒下）
  out.ok = out.at10.execs === 1 && out.at10.via === 'iai' && out.at8.execs === 1 && out.at8.via === 'iai' && out.at11.execs === 1 && out.at11.via === 'kill' && out.at11.why === 'hp';
  return out;
}
// 大气血目标：从 11% 被强化伤害打到阈值以下——同一下不补处决，人还活着
export function belowRun() {
  const A = Q(), Fn = A.finale;
  fresh(); Fn.debugGive();
  const [e] = foes([['shade', 3.2, 0]], { hp: 5000 }); e.hp = 550;        // 11%
  const ex0 = Fn.stats.execs;
  charge(3.15); run([], 1.2);
  return { ratioBefore: 0.11, execs: Fn.stats.execs - ex0, alive: e.alive, ratioAfter: r3(e.hp / e.maxHp), why: lastAct('iai_slash')?.act?.finale?.why, ok: Fn.stats.execs - ex0 === 0 && e.alive && e.hp / e.maxHp < 0.1 };
}
// 主目标：锁定的（被命中）优先；不锁定时轨迹最先接触的（左边先）；主目标不够低时不改找别的低血量目标；一次最多一个
export function primaryRun() {
  const out = {};
  // 三个都在刀下：左边那个满血、右边那个 5%——不锁定时主目标是最左边的（满血）→ 不处决，也不处决右边那个
  const H = 100000;            // 第二十九轮：气血调高（强化一刀打不死），只看主目标与处决的判定
  const a = inkShot([['shade', 3.0, 1.2], ['shade', 3.0, 0], ['shade', 3.0, -1.2]], { hps: [H, H, 0.05 * H], hpMax: H });
  out.noLock = { primary: a.hit?.primary, firstSpawn: a.es[0].id, execs: a.execs, why: a.why, results: a.results };
  // 锁定右边那个（5%）：它是主目标 → 处决；其余两个照常吃强化伤害
  const b = inkShot([['shade', 3.0, 1.2], ['shade', 3.0, 0], ['shade', 3.0, -1.2]], { hps: [H, H, 0.05 * H], lock: 2, hpMax: H });
  out.lockLow = { primary: b.hit?.primary, execs: b.execs, why: b.why, results: b.results, rec: b.rec?.target };
  // 三个都低于 10%：只处决一个（锁定的那个），另外两个吃强化伤害（倒下）
  const c = inkShot([['shade', 3.0, 1.2], ['shade', 3.0, 0], ['shade', 3.0, -1.2]], { hps: [0.05 * H, 0.05 * H, 0.05 * H], lock: 1, hpMax: H });
  out.allLow = { primary: c.hit?.primary, execs: c.execs, why: c.why, results: c.results };
  // 稳定：同样的站位重来三次，主目标都一样
  const ids = [];
  for (let k = 0; k < 3; k++) { const d = inkShot([['shade', 3.0, 0.8], ['shade', 3.0, -0.8]], { hps: [H, H], hpMax: H }); ids.push(d.hit?.primary ? d.es.findIndex((e) => e.id === d.hit.primary) : -1); }
  out.stable = ids;
  // 第二十九轮：锁定的低血量目标仍是主目标，但还有别的敌人在 → 不处决（notLast）
  out.ok = out.noLock.execs === 0 && out.noLock.why === 'hp' && out.noLock.primary === out.noLock.firstSpawn && out.lockLow.execs === 0 && out.lockLow.why === 'notLast' && out.lockLow.primary === b.es[2].id
    && out.allLow.execs === 0 && out.allLow.why === 'notLast' && out.allLow.primary === c.es[1].id && ids.every((x) => x === ids[0] && x === 0);
  return out;
}


// =====================================================================================
// 11. 阶段比例：共享生命条按阈值转阶段（试炼魔将 stages [0.5]）——独立阶段生命条（Boss）见 boss30Run
// =====================================================================================
export function stageRatioRun() {
  const out = { threshold: [] };
  fresh();
  const [e] = foes([['eliteStaged', 5, 0]], { hp: 520 });
  for (const [idx, hp] of [[0, 520], [0, 390], [0, 286], [0, 270], [1, 260], [1, 130], [1, 26], [1, 13]]) {
    e.stageIdx = idx; e.hp = hp;
    const S = e.cfg.stages, top = idx === 0 ? 1 : S[idx - 1], end = S[idx] ?? 0;
    out.threshold.push({ stage: idx, hp, ratio: r3(stageRatio(e)), expect: r3(Math.max(0, Math.min(1, (hp / 520 - end) / (top - end)))), totalRatio: r3(hp / 520), final: stageOf(e).final });
  }
  e.stageIdx = 0; e.hp = 520;
  out.ok = out.threshold.every((x) => Math.abs(x.ratio - x.expect) < 1e-6);
  return out;
}
// 共享阈值的试炼魔将：第一段 ≤10% → 非最终阶段：精简演出，只结束这一段（推到阈值、转段），不死；第二段 ≤10% → 最终阶段：倒下
export function stagedExecRun() {
  const A = Q(), Fn = A.finale, out = {};
  const r1 = inkShot([['eliteStaged', 3.2, 0]], { hps: [0.54 * 520], hpMax: 520 });     // 第一段剩 8%：(0.54 − 0.5) / 0.5
  const e1 = r1.es[0];
  out.stage0 = { mode: r1.rec?.mode, why: r1.rec?.why, final: r1.rec?.final, execs: r1.execs, commits: r1.commits, alive: e1.alive, hp: r2(e1.hp), stageIdx: e1.stageIdx, floor: 0.5 * 520 };
  fresh(); Fn.debugGive();
  const [e3] = foes([['eliteStaged', 3.2, 0]], { hp: 520 }); e3.stageIdx = 1; e3.hp = 0.04 * 520;  // 第二段剩 8%：0.04 / 0.5
  const ex0 = Fn.stats.execs, rec0 = Fn.rec; charge(3.15);
  let endT = null;
  run([], 10, (t) => { if (Fn.rec !== rec0 && Fn.rec?.done && endT == null) endT = t; return endT == null; });
  out.stage1 = { mode: Fn.rec?.mode, final: Fn.rec?.final, execs: Fn.stats.execs - ex0, alive: e3.alive, committed: Fn.rec?.committed };
  out.ok = out.stage0.mode === 'compact' && out.stage0.why === 'stage' && out.stage0.alive && out.stage0.stageIdx === 1 && Math.abs(out.stage0.hp - 260) < 0.01 && out.stage1.execs === 1 && out.stage1.final && !out.stage1.alive;
  return out;
}

// =====================================================================================
// 12. 第三十层：一阶段（非最终）——精简演出、随后 Boss 正常的转阶段过场，不结算胜利与奖励；二阶段（最终）——完整演出、随后胜利
// =====================================================================================
export async function boss30Run({ skipCine = true } = {}) {
  const A = Q(), Fn = A.finale, out = {};
  const B24 = await import('./r24_tests.js');
  if (A.world.name !== 'boss30') await B24.setup({ ai: false });
  const f = A.game.boss30;
  const shoot = async (phase, ratio) => {
    await B24.fight({ ai: false });
    if (f.phase !== phase) f.debug.phase(phase);
    f.debugUsed = false; f.god = false;
    const b = f.root, yaw = f.rig.yaw;
    B24.place(b.x + Math.sin(yaw) * 3.0, b.z + Math.cos(yaw) * 3.0);
    f.unit.hp = f.unit.maxHp * ratio;
    const pool = f.unit.maxHp, total = f.hpPool(1) + f.hpPool(2);
    Fn.debugGive();
    const ex0 = Fn.stats.execs, cm0 = Fn.stats.commits, rec0 = Fn.rec;
    charge(3.15);
    const tl = { showAt: null, commitAt: null, endAt: null, stateAtCommit: null, cineAtCommit: null, cineAfter: null, stateAfter: null };
    B24.tick(12, (tt) => {
      if (Fn.show && tl.showAt == null) tl.showAt = r2(tt);
      if (Fn.rec !== rec0 && Fn.rec?.committed && tl.commitAt == null) { tl.commitAt = r2(tt); tl.stateAtCommit = f.state; tl.cineAtCommit = f.cine.cur?.name || null; }
      if (tl.showAt != null && !Fn.active && tl.endAt == null) { tl.endAt = r2(tt); tl.cineAfter = f.cine.cur?.name || null; tl.stateAfter = f.state; }
      return tl.endAt == null || tt < tl.endAt + 0.5;
    });
    const rec = Fn.rec ? { ...Fn.rec } : null;
    const res = { phase, ratio, pool, totalRatio: r3((pool * ratio) / total), mode: rec?.mode, why: rec?.why, final: rec?.final, stage: rec?.stage, execs: Fn.stats.execs - ex0, commits: Fn.stats.commits - cm0, tl };
    if (skipCine && f.cine.active) { B24.tick(0.4); f.cine.skip(); B24.tick(0.3); }
    res.after = { state: f.state, phase: f.phase, hp: Math.round(f.unit.hp), max: Math.round(f.unit.maxHp), alive: f.unit.alive, rewarded: !!f.rewarded, panel: A.ui.panelOpen ? A.game.panelKind : null };
    return res;
  };
  out.p1 = await shoot(1, 0.08);
  out.p2 = await shoot(2, 0.08);
  if (A.ui.panelOpen) A.ui.closePanel();
  out.ok = out.p1.mode === 'compact' && out.p1.why === 'stage' && !out.p1.final && out.p1.execs === 1 && out.p1.commits === 1 && out.p1.tl.stateAtCommit === 'transition' && !out.p1.tl.cineAtCommit && out.p1.tl.cineAfter === 'phase'
    && out.p1.after.phase === 2 && out.p1.after.hp === out.p1.after.max && !out.p1.after.rewarded
    && out.p2.final && out.p2.execs === 1 && out.p2.commits === 1 && out.p2.tl.stateAtCommit === 'victory' && !out.p2.tl.cineAtCommit && out.p2.tl.cineAfter === 'victory';
  return out;
}
// 第五十层（大型目标：龙君）：精简演出（不做身后绕行、穿行），非最终阶段之后放转阶段过场
export async function boss50Run() {
  const A = Q(), Fn = A.finale, out = {};
  const B16 = await import('./r16_boss_bot.js');
  if (A.world.name !== 'boss50') { await A.game.towerRoom.enter(); run([], 0.5); await A.boss50.enter(); run([], 1); }
  const F50 = A.boss50;
  F50.resetFight(false); F50.debug.start(); run([], 0.5); F50.debug.skip(); run([], 1.5);
  B16.stage({ d: 3.4 });
  F50.debugUsed = false;
  F50.unit.hp = F50.unit.maxHp * 0.07;
  Fn.debugGive();
  const ex0 = Fn.stats.execs, rec0 = Fn.rec;
  const L = A.loadout, i = L.slotOf('power');
  L.pressSlot(i, true); run([], 3.15, () => { F50.B.gapT = 99; }); L.pressSlot(i, false);
  let endAt = null, cineAfter = null, stateAtCommit = null;
  run([], 9, (t) => { const nw = Fn.rec !== rec0; if (nw && Fn.rec?.committed && stateAtCommit == null) stateAtCommit = F50.state; if (nw && !Fn.active && Fn.rec?.done && endAt == null) { endAt = r2(t); cineAfter = F50.cine.cur?.name || null; } return endAt == null; });
  out.rec = Fn.rec ? { mode: Fn.rec.mode, why: Fn.rec.why, final: Fn.rec.final, stage: Fn.rec.stage, committed: Fn.rec.committed } : null;
  out.execs = Fn.stats.execs - ex0; out.stateAtCommit = stateAtCommit; out.cineAfter = cineAfter;
  out.why = lastAct('iai_slash')?.finale?.why ?? null;
  if (F50.cine.active) { run([], 0.4); F50.cine.skip?.(); run([], 0.5); }
  out.after = { state: F50.state, phase: F50.phase };
  // 二阶段（最终阶段）：大型目标 → 原地精简演出，随后整场胜利
  if (F50.phase === 2 && F50.state === 'fight') {
    B16.stage({ d: 3.4 }); F50.debugUsed = false;
    F50.unit.hp = F50.unit.maxHp * 0.07; Fn.debugGive();
    const rec1 = Fn.rec;
    L.pressSlot(i, true); run([], 3.15, () => { F50.B.gapT = 99; }); L.pressSlot(i, false);
    let st2 = null, cine2 = null;
    run([], 9, () => { const nw = Fn.rec !== rec1; if (nw && Fn.rec?.committed && st2 == null) st2 = F50.state; if (nw && !Fn.active && Fn.rec?.done && cine2 == null) { cine2 = F50.cine.cur?.name || 'none'; } return cine2 == null; });
    out.final = { mode: Fn.rec?.mode, why: Fn.rec?.why, final: Fn.rec?.final, stateAtCommit: st2, cineAfter: cine2 };
    if (F50.cine.active) { run([], 0.4); F50.cine.skip?.(); run([], 1.0); }
    if (A.ui.panelOpen) A.ui.closePanel();
  }
  out.ok = out.rec?.mode === 'compact' && out.rec?.why === 'stage' && out.execs === 1 && out.stateAtCommit === 'transition' && out.cineAfter === 'phase'
    && out.final?.mode === 'compact' && out.final?.why === 'large' && out.final?.final && out.final?.stateAtCommit === 'victory' && out.final?.cineAfter === 'victory';
  return out;
}

// =====================================================================================
// 9. 格挡、弹反、无敌与剧情保护：被战斗系统拒绝的一刀不判处决（主目标没被接受即不再找别的低血量目标，墨势照样消耗）；
//    演出期间玩家与被处决的目标受保护，演出结束后保护撤掉
// =====================================================================================
export async function protectRun() {
  const A = Q(), Fn = A.finale, C = A.combat, M = A.moves, out = {};
  const shot = (e, pre = null) => {
    const id0 = M.seq, ex0 = Fn.stats.execs, rec0 = Fn.rec, hp0 = Math.round(e.hp), ratio = r3(stageRatio(e));
    Fn.debugGive();
    const L = A.loadout, i = L.slotOf('power');
    L.pressSlot(i, true); run([], pre ? 2.9 : 3.15); if (pre) { pre(); run([], 0.25); } L.pressSlot(i, false);
    run([], 1.4);
    const a0 = lastAct('iai_slash'), a = a0 && a0.id > id0 ? a0 : null;
    return { ratio, results: a?.results?.filter((x) => x.i === 0).map((x) => x.r) ?? [], why: a?.act?.finale?.why ?? null, finale: !!a?.act?.finale,
      execs: Fn.stats.execs - ex0, newRec: Fn.rec !== rec0, hp0, hp: Math.round(e.hp), ready: Fn.ready, count: Fn.count };
  };
  // (1) 无敌：转段中的试炼魔将（当前阶段只剩 5%，正在转段 → 无敌）——在宗门演武广场（前一项可能停在第三十层）
  if (A.world.name !== 'surface') { if (A.ui.panelOpen) A.ui.closePanel(); await A.game.switchWorld('surface'); run([], 0.5); equip(); }
  fresh();
  const [el] = foes([['eliteStaged', 3.2, 0]], { hp: 520 });
  el.hp = 273; el.shiftT = 99;
  out.immune = shot(el);
  el.shiftT = 0;
  // (2)(3) 第三十层：剧情保护（noDmg：过场、开战前那一类）与截锋架势（格挡 / 弹反式的拦截）
  const B24 = await import('./r24_tests.js');
  if (A.world.name !== 'boss30') await B24.setup({ ai: false });
  const f = A.game.boss30;
  const atBoss = async () => {
    await B24.fight({ ai: false });
    if (f.phase !== 1) f.debug.phase(1);
    f.debugUsed = false; f.god = false; f.cd.guard = 0;
    const b = f.root, yaw = f.rig.yaw;
    B24.place(b.x + Math.sin(yaw) * 3.0, b.z + Math.cos(yaw) * 3.0);
    f.unit.hp = Math.round(f.unit.maxHp * 0.08);
  };
  await atBoss();
  f.noDmg = true;
  out.story = shot(f.unit);
  f.noDmg = false;
  await atBoss();
  let guardMode = null;
  out.guard = shot(f.unit, () => { f.debug.guard(); guardMode = f.B.mode; });
  out.guard.bossMode = guardMode; out.guard.lostToWave = out.guard.hp0 - out.guard.hp;   // 截锋只截刀身，剑气照常打进去（第二十四轮的规则）
  // 墨势：普攻打在截锋架势上（被格挡拒绝）不计；随后一刀真实打中照常计 1
  await atBoss(); Fn.resetStack('test');
  const lightOnce = () => { M.press('light', true); M.press('light', false); run([], 1.0); };
  const hitsOf = (id0) => M.log.filter((x) => x.id > id0 && /^light/.test(x.key)).flatMap((x) => (x.results || []).map((r) => r.r));
  let id1 = M.seq; f.debug.guard(); const gm = f.B.mode; run([], 0.17); lightOnce();
  out.lightBlocked = { bossMode: gm, results: hitsOf(id1), count: Fn.count };
  await atBoss(); Fn.resetStack('test');
  id1 = M.seq; lightOnce();
  out.lightHit = { results: hitsOf(id1), count: Fn.count };
  await A.game.switchWorld('surface'); run([], 0.5); equip();
  // (4) 演出中：玩家不受伤、被处决的目标不吃别的伤害；演出结束后都恢复
  fresh(); Fn.debugGive();
  // 第二个敌人只用来在演出中打玩家；锁定第一个。第二十九轮：群战里只处决最后一个——第二个放到 35 米外、没惊动（不算这场战斗里的）
  const es = foes([['shade', 3.2, 0], ['shade', 35, 0]], { hp: 100 }); es[0].hp = 8; M.lock = es[0]; es[1].state = 'idle'; es[1].engaged = false;
  charge(3.15);
  for (let k = 0; k < 120 && !Fn.show; k++) A.tick(1 / 60, 1, false);
  while (Fn.show && Fn.show.t < 2.0) A.tick(1 / 60, 1, false);
  const U = C.playerUnit, php0 = U.hp;
  const rP = C.damage(U, 40, { from: es[1], kind: 'phys', spec: { def: 'blade', id: 'r25protect', block: true, parry: true } });
  const rT = C.damage(es[0], 50, { from: U, kind: 'sword' });
  out.during = { active: Fn.active, player: rP, playerHpLost: Math.round(php0 - U.hp), target: rT, targetAlive: es[0].alive, guard: !!U.finaleGuard, lock: !!es[0].finaleLock };
  while (Fn.active) A.tick(1 / 60, 1, false);
  run([], 0.8);
  const php1 = U.hp;
  const rP2 = C.damage(U, 10, { from: es[1], kind: 'phys', spec: { def: 'blade', id: 'r25protect2', block: true, parry: true } });
  out.after = { guard: !!U.finaleGuard, player: rP2, playerHpLost: Math.round(php1 - U.hp), targetAlive: es[0].alive };
  U.hp = U.maxHp; M.lock = null;
  const I = out.immune, S = out.story, Gd = out.guard;
  out.ok = I.ratio <= 0.1 && I.results.every((r) => r === 'immune') && I.results.length > 0 && I.execs === 0 && !I.newRec && I.hp === I.hp0 && I.why === 'rejected' && !I.ready
    && S.ratio <= 0.1 && S.results.every((r) => r === 'immune') && S.results.length > 0 && S.execs === 0 && !S.newRec && S.hp === S.hp0
    && Gd.bossMode === 'guard' && Gd.results.length > 0 && Gd.results.every((r) => r === 'block') && Gd.execs === 0 && !Gd.newRec && Gd.hp0 - Gd.hp <= 48
    && out.lightBlocked.results.includes('block') && !out.lightBlocked.results.includes('hit') && out.lightBlocked.count === 0 && out.lightHit.results.includes('hit') && out.lightHit.count === 1
    && out.during.active && out.during.player === 'immune' && out.during.playerHpLost === 0 && out.during.target === 'immune' && out.during.targetAlive
    && !out.after.guard && out.after.player !== 'immune' && !out.after.targetAlive;
  return out;
}

// =====================================================================================
// 16. 站位与空间：墙边、悬崖边——完整演出的路线不合法时（各个偏角都试过）退成原地的精简演出；查的是真实的碰撞与地面，不改任何碰撞
// =====================================================================================
export function spaceRun() {
  const A = Q(), cw = A.cw, out = {};
  // 墙边：演武广场东侧的屋舍（广场中心往东偏北 79° 打射线，21.7 米处是墙，一路是平的广场地面）；敌人在墙前 1.3 米、玩家在它外侧 3 米朝着墙
  const ang = 1.374, d = { x: Math.sin(ang), y: 0, z: Math.cos(ang) }, o = new A.THREE.Vector3(0, 15.2, 26), t = cw.ray(o, d, 40);
  const P = { x: o.x + d.x * (t - 4.3), z: o.z + d.z * (t - 4.3) };
  const w = inkShot([['shade', 3.0, 0]], { hps: [8], at: P, yaw: ang });
  out.wall = { wallDist: r2(t), mode: w.rec?.mode, why: w.rec?.why, execs: w.execs, finWhy: w.why, alive: w.es[0].alive, ePos: w.es[0].pos.toArray().map(r2), playerEnd: A.player.pos.toArray().map(r2) };
  // 悬崖边：西边台地（高 19.1）东沿往下 5 米；敌人站在崖边内 1 米，玩家在它西边 3 米朝东
  const c = inkShot([['shade', 3.0, 0]], { hps: [8], at: { x: -29.6, z: 10, y: 19.1 }, yaw: Math.PI / 2 });
  out.cliff = { mode: c.rec?.mode, why: c.rec?.why, execs: c.execs, finWhy: c.why, alive: c.es[0].alive, ePos: c.es[0].pos.toArray().map(r2), playerEnd: A.player.pos.toArray().map(r2), y: r2(A.player.pos.y) };
  // 开阔处：完整演出
  const f = inkShot([['shade', 3.0, 0]], { hps: [8] });
  out.open = { mode: f.rec?.mode, why: f.rec?.why };
  out.ok = out.wall.mode === 'compact' && out.wall.why === 'wall' && out.cliff.mode === 'compact' && ['cliff', 'noGround'].includes(out.cliff.why) && out.open.mode === 'full' && out.cliff.y > 18;
  return out;
}

// =====================================================================================
// 17. 跳过（同一个终结入口，只结算一次）、暂停与失焦（只停演出，不取消）、重试与换场景（作废、不提交、不留保护）
// =====================================================================================
function startShow(hps = [8], list = [['shade', 3.2, 0]]) {
  const A = Q(), Fn = A.finale;
  fresh(); Fn.debugGive();
  const es = foes(list, { hp: 100 }); es.forEach((e, k) => { if (hps[k] != null) e.hp = hps[k]; });
  charge(3.15);
  for (let i = 0; i < 120 && !Fn.show; i++) A.tick(1 / 60, 1, false);
  return es;
}
export function skipRun() {
  const A = Q(), Fn = A.finale, out = {};
  const es = startShow();
  while (Fn.show && Fn.show.t < 2.0) A.tick(1 / 60, 1, false);
  const c0 = Fn.stats.commits, plan = Fn.show.plan;
  const ok1 = Fn.skip(), ok2 = Fn.skip();
  run([], 1.5);
  out.skip = { first: ok1, second: ok2, commits: Fn.stats.commits - c0, src: Fn.rec?.src, alive: es[0].alive, active: Fn.active, pos: A.player.pos.toArray().map(r2), F: plan.F?.toArray().map(r2), ctl: A.player.ctl.lock, freeCam: !!A.game.freeCam };
  out.ok = ok1 && !ok2 && out.skip.commits === 1 && out.skip.src === 'skip' && !out.skip.alive && !out.skip.active && Math.hypot(out.skip.pos[0] - out.skip.F[0], out.skip.pos[2] - out.skip.F[2]) < 0.05 && !out.skip.ctl && !out.skip.freeCam;
  return out;
}
export function pauseRun() {
  const A = Q(), Fn = A.finale, out = {};
  const es = startShow();
  while (Fn.show && Fn.show.t < 3.0) A.tick(1 / 60, 1, false);
  const t0 = Fn.show.t;
  // 暂停：主循环在暂停 / 失焦 / 后台时给 dt = 0（main.js 的 frame）——这里直接推 0
  for (let i = 0; i < 120; i++) A.tick(0, 1, false);
  out.paused = { t0: r3(t0), t1: r3(Fn.show.t), active: Fn.active };
  // 失焦：清掉按住的输入，不取消演出
  window.dispatchEvent(new Event('blur'));
  A.tick(1 / 60, 1, false);
  window.dispatchEvent(new Event('focus'));
  out.blur = { active: Fn.active, t: r3(Fn.show?.t ?? -1) };
  while (Fn.active) A.tick(1 / 60, 1, false);
  out.end = { commits: Fn.rec?.committed, alive: es[0].alive };
  out.ok = out.paused.t0 === out.paused.t1 && out.paused.active && out.blur.active && out.end.commits && !out.end.alive;
  return out;
}
// 重试（第三十层）：演出中重来——作废旧的记录、不提交、清掉保护与暂停、Boss 复原；已消耗的墨势不返还
export async function retryRun() {
  const A = Q(), Fn = A.finale, out = {};
  const B24 = await import('./r24_tests.js');
  if (A.world.name !== 'boss30') await B24.setup({ ai: false });
  const f = A.game.boss30;
  await B24.fight({ ai: false });
  f.debug.phase(2); f.debugUsed = false;
  const b = f.root, yaw = f.rig.yaw;
  B24.place(b.x + Math.sin(yaw) * 3.0, b.z + Math.cos(yaw) * 3.0);
  f.unit.hp = f.unit.maxHp * 0.08;
  Fn.debugGive(); charge(3.15);
  B24.tick(3, () => !(Fn.show && Fn.show.t > 1.5));
  out.during = { active: Fn.active, mode: Fn.show?.mode, t: r2(Fn.show?.t ?? -1), hold: !!f.finaleHold, lock: !!f.unit.finaleLock };
  const inst0 = Fn.instance;
  await f.retry(true);
  B24.tick(0.5);
  out.after = { active: Fn.active, rec: Fn.rec ? { state: Fn.rec.state, invalid: Fn.rec.invalid, committed: Fn.rec.committed } : null, instance: Fn.instance - inst0, hold: !!f.finaleHold, lock: !!f.unit.finaleLock, guard: !!A.combat.playerUnit.finaleGuard,
    freeCam: !!A.game.freeCam, ctl: A.player.ctl.lock, bossHp: Math.round(f.unit.hp), bossMax: Math.round(f.unit.maxHp), state: f.state, ready: Fn.ready, count: Fn.count, body: document.body.classList.contains('ink-show'), census: A.finFx.census() };
  out.ok = out.during.active && !out.after.active && out.after.rec?.invalid && !out.after.rec?.committed && out.after.instance >= 1 && !out.after.hold && !out.after.lock && !out.after.guard && !out.after.ctl && !out.after.ready && !out.after.body;
  return out;
}
// 换场景：演出中切到别的场景——作废、不提交、不把旧目标的伤害或奖励交给新实例
export async function sceneRun() {
  const A = Q(), Fn = A.finale, out = {};
  if (A.world.name !== 'surface') await A.game.switchWorld('surface');
  const es = startShow();
  while (Fn.show && Fn.show.t < 2.5) A.tick(1 / 60, 1, false);
  out.during = { active: Fn.active, t: r2(Fn.show?.t ?? -1) };
  const k0 = Fn.stats.commits;
  await A.game.switchWorld('tower');
  run([], 0.4);
  out.after = { world: A.world.name, active: Fn.active, commits: Fn.stats.commits - k0, rec: Fn.rec ? { invalid: Fn.rec.invalid, state: Fn.rec.state } : null, enemyAlive: es[0].alive, freeCam: !!A.game.freeCam, ctl: A.player.ctl.lock, guard: !!A.combat.playerUnit.finaleGuard, census: A.finFx.census() };
  await A.game.switchWorld('surface');
  run([], 0.4);
  out.ok = out.during.active && !out.after.active && out.after.commits === 0 && out.after.rec?.invalid && !out.after.freeCam && !out.after.ctl && !out.after.guard;
  return out;
}

// =====================================================================================
// 18. 连续三次：镜头不锁死、资源不丢、材质不串（原技能的凤凰、雷龙材质不动；演出实例的材质与几何不新增）
// =====================================================================================
export function repeatRun(n = 3) {
  const A = Q(), Fn = A.finale, Rr = A.renderer, out = { runs: [] };
  const sig = () => ({ phx: A.phoenix.rig?.materials?.map((m) => m.customProgramCacheKey?.()).join(','), phxRecolor: A.phoenix.rig?.U?.uRecolor?.value, loong: A.dragon.rig?.materials?.map((m) => m.customProgramCacheKey?.()).join(','),
    inkPhx: A.finFx.phx?.materials?.map((m) => m.customProgramCacheKey?.()).join(','), inkLoong: A.finFx.loong?.materials?.map((m) => m.customProgramCacheKey?.()).join(','),
    geos: Rr.info.memory.geometries, texs: Rr.info.memory.textures });
  const s0 = sig();
  for (let k = 0; k < n; k++) {
    const r = inkShot([['shade', 3.2, 0]], { hps: [8] });
    run([], 1.0);
    out.runs.push({ mode: r.rec?.mode, execs: r.execs, commits: r.commits, end: r.endT != null, freeCam: !!A.game.freeCam, blend: !!Fn.blend, ctl: A.player.ctl.lock, cam: A.cam.enabled, census: A.finFx.census(), sig: sig() });
  }
  const s1 = sig();
  out.s0 = s0; out.s1 = s1;
  out.ok = out.runs.every((x) => x.execs === 1 && x.commits === 1 && x.end && !x.freeCam && !x.ctl && x.cam && x.census.sprites === 0 && !x.census.scroll)
    && s0.phx === s1.phx && s0.loong === s1.loong && s0.inkPhx === s1.inkPhx && s0.inkLoong === s1.inkLoong && s1.geos <= s0.geos + 2 && s1.texs <= s0.texs + 1;
  return out;
}

// =====================================================================================
// 19. 不同帧率：积累的次数、满蓄力的时刻、演出各事件（只触发一次）、终结的时刻一致
// =====================================================================================
export function fpsRun(rates = [30, 60, 144]) {
  const A = Q(), M = A.moves, Fn = A.finale, out = {};
  for (const hz of rates) {
    const dt = 1 / hz;
    fresh();
    const es = foes([['shade', 1.9, 0], ['shade', 2.1, 0.9]], { hp: 90000 }), pin = pinner(es);
    const seen = new Set(), landed = new Set(), id0 = M.seq;
    const scan = () => { pin(); for (const L of M.log) if (L.id > id0 && L.key.startsWith('light') && !seen.has(L.id)) for (const ev of L.events) if (ev.k === 'hit') { seen.add(L.id); if (ev.n > 0) landed.add(L.id + ':' + ev.i); } };
    M.press('light', true);
    run([], 8, scan, dt);
    M.press('light', false); run([], 1, scan, dt);
    const count = Fn.count;
    fresh(); Fn.debugGive();
    let full = null;
    const L = A.loadout, i = L.slotOf('power');
    L.pressSlot(i, true); run([], 3.4, () => { if (full == null && M.iaiCharge?.k >= 1) full = r3(M.iaiCharge.secs); }, dt); L.pressSlot(i, false);
    run([], 0.6, null, dt);
    fresh(); Fn.debugGive();
    const [e] = foes([['shade', 3.2, 0]], { hp: 100 }); e.hp = 8;
    L.pressSlot(i, true); run([], 3.15, null, dt); L.pressSlot(i, false);
    const n0 = Fn.evN || 0, rec0 = Fn.rec;
    let commitT = null, endT = null;
    run([], 10.5, () => { const nw = Fn.rec !== rec0; if (nw && Fn.rec?.committed && commitT == null && Fn.show) commitT = r3(Fn.show.t); if (nw && Fn.rec?.done && endT == null) endT = 1; return endT == null; }, dt);
    const evs = Fn.events.filter((x) => x.n > n0).map((x) => x.kind), countOf = (k) => evs.filter((x) => x === k).length;
    out[hz] = { count, landedSwings: landed.size, full, commitShowT: commitT, events: { confirm: countOf('confirm'), show: countOf('show'), commit: countOf('commit'), end: countOf('end'), cleanup: countOf('cleanup') } };
  }
  const v = rates.map((hz) => out[hz]);
  // 容差：一帧（数值按 3 位小数记，另加半个千分位）
  out.ok = v.every((x, k) => x.count === Math.min(F.stack.hits, x.landedSwings) && x.full != null && x.full >= 3.0 - 1e-6 && x.full <= 3.0 + 1 / rates[k] + 6e-4 && x.commitShowT != null && Math.abs(x.commitShowT - 6.8) <= 1 / rates[k] + 6e-4
    && x.events.confirm === 1 && x.events.commit === 1 && x.events.end === 1 && x.events.cleanup === 1);
  return out;
}

// =====================================================================================
// 界面与存档：墨势计数「墨势：18／30」、成势提示、拔刀斩格的升级形态；解锁存档、墨势与计数不存档
// =====================================================================================
export function hudRun() {
  const A = Q(), Fn = A.finale, out = {};
  fresh();
  Fn.debugGive(18); A.tick(1 / 60, 1, false);
  const tip = () => document.querySelector('#combat-hud .ink-tip');
  out.count = { cls: tip()?.className, text: tip()?.querySelector('.ct')?.textContent };
  Fn.debugGive(); A.tick(1 / 60, 1, false);
  out.ready = { cls: tip()?.className, text: tip()?.querySelector('.rd')?.textContent, slot: document.querySelector('#combat-hud .slot.power')?.className, em: document.querySelector('#combat-hud .slot.power em')?.textContent, title: document.querySelector('#combat-hud .slot.power')?.title, ring: A.finFx.ring.mesh.visible };
  const L = A.loadout, i = L.slotOf('power');
  L.pressSlot(i, true); run([], 1.5);
  out.charge = { cls: tip()?.className, text: tip()?.querySelector('.ct')?.textContent, ring: document.querySelector('#combat-hud .slot.power .ring')?.style.getPropertyValue('--p') };
  run([], 1.7);
  out.full = { cls: tip()?.className, text: tip()?.querySelector('.ct')?.textContent };
  L.pressSlot(i, false); run([], 0.8);
  A.state.save();
  const raw = localStorage.getItem('qinglan.save.v1') || '', d = JSON.parse(raw);
  out.save = { skillUp: d.skillUp, keys: Object.keys(d).filter((k) => /ink|finale|skillUp|stack/i.test(k)) };
  out.ok = out.count.text === '墨势：18／30' && /ready/.test(out.ready.cls) && out.ready.text === '墨势已成 · 满蓄力可施展终式' && /ink-ready/.test(out.ready.slot) && out.ready.em === '终式' && out.ready.ring
    && /charge/.test(out.charge.cls) && /^终式蓄势 1\.5／3\.0 秒$/.test(out.charge.text || '') && /full/.test(out.full.cls) && !!out.save.skillUp?.power?.unlocked && out.save.keys.length === 1 && out.save.keys[0] === 'skillUp';
  return out;
}

// =====================================================================================
// 12. 性能：完整演出各段的每帧耗时（1280×720 渲染 + 读回一个像素、等 GPU 画完）、绘制调用与三角形峰值、
//     演出中新编译的着色器程序（应为 0：进入场景时已预热，确认处决后不再同步准备资源）、画质（粒子倍率、山水层数、墨带与碎片数）
// =====================================================================================
const phaseOf = (t, S) => {
  if (!S) return t < 0 ? 'pre' : 'after';
  const T = F.full, fin = S.finishT ?? 6.8;
  if (S.mode !== 'full') return 'compact';
  return t < T.stagger[1] ? 'stagger' : t < T.scroll[1] ? 'scroll' : t < T.walk[1] ? 'walk' : t < T.draw[1] ? 'draw' : t < T.bagua.taiji ? 'birds' : t < T.ribbons[0] ? 'bagua' : t < fin ? 'ribbons' : t < fin + 0.5 ? 'finish' : 'tail';
};
export function perfRun({ frames = 720 } = {}) {
  const A = Q(), Fn = A.finale, R0 = A.renderer, gl = R0.getContext(), px = new Uint8Array(4), X = A.finFx;
  const keep = R0.getSize(new A.THREE.Vector2());
  R0.setSize(1280, 720, false);
  A.TIME.hour = 10; skyQuiet(true);
  fresh(); Fn.debugGive();
  const [e] = foes([['shade', 3.2, 0]], { hp: 100 }); e.hp = 8;
  A.moves.lock = e;
  const frame = () => { const t0 = performance.now(); A.tick(1 / 60, 1, true); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
  const base = []; for (let k = 0; k < 60; k++) base.push(frame());
  const L = A.loadout, i = L.slotOf('power');
  L.pressSlot(i, true); for (let k = 0; k < 190; k++) frame(); L.pressSlot(i, false);
  const prog0 = R0.info.programs?.length ?? 0, geo0 = R0.info.memory.geometries, tex0 = R0.info.memory.textures;
  const times = []; let peak = { calls: 0, tris: 0, t: null }, most = { ribbons: 0, land: 0, sprites: 0 }, seenShow = false;
  R0.info.autoReset = false;
  for (let k = 0; k < frames; k++) {
    R0.info.reset();
    const ms = frame(), S = Fn.show, t = S ? S.t : (seenShow ? 99 : -1);
    if (S) seenShow = true;
    times.push([phaseOf(t, S), ms]);
    if (R0.info.render.calls > peak.calls) peak = { calls: R0.info.render.calls, tris: R0.info.render.triangles, t: r2(t) };
    if (S) { const c = X.census(); most = { ribbons: Math.max(most.ribbons, c.ribbons), land: Math.max(most.land, c.land), sprites: Math.max(most.sprites, c.sprites) }; }
    if (seenShow && !Fn.active && k > 60) break;
  }
  R0.info.autoReset = true;
  const stat = (v) => { v = v.slice().sort((a, b) => a - b); return v.length ? { n: v.length, median: +v[Math.floor(v.length / 2)].toFixed(1), p95: +v[Math.min(v.length - 1, Math.floor(v.length * 0.95))].toFixed(1), max: +v[v.length - 1].toFixed(1) } : null; };
  const out = { quality: X.q, base: stat(base), phases: {} };
  for (const ph of ['stagger', 'scroll', 'walk', 'draw', 'birds', 'bagua', 'ribbons', 'finish', 'tail', 'compact', 'after']) { const v = times.filter((x) => x[0] === ph).map((x) => x[1]); if (v.length) out.phases[ph] = stat(v); }
  out.show = stat(times.filter((x) => !['pre', 'after'].includes(x[0])).map((x) => x[1]));
  out.peak = peak; out.most = most;
  out.newPrograms = (R0.info.programs?.length ?? 0) - prog0;
  out.geometriesAfter = R0.info.memory.geometries - geo0; out.texturesAfter = R0.info.memory.textures - tex0;
  out.budget = { ribbons: X.ribs.length, landRings: X.land.rings.length, sprites: X.sp?.cap ?? null };
  A.moves.lock = null;
  R0.setSize(keep.x, keep.y, false);
  out.ok = seenShow && out.newPrograms === 0;
  return out;
}

// =====================================================================================
// 全部（放进 setTimeout 里跑，结果在 window.__r25all）
// =====================================================================================
export function runAll({ boss = true } = {}) {
  window.__r25all = { running: true };
  setTimeout(async () => {
    const out = {}, t0 = performance.now();
    const steps = [['unlock', unlockRun], ['alias', aliasRun], ['stack', () => stackRun()], ['invalidHit', invalidHitRun], ['timeout', timeoutRun], ['charge', chargeRun], ['counter', counterRun],
      ['threshold', thresholdRun], ['below', belowRun], ['primary', primaryRun], ['stageRatio', stageRatioRun], ['stagedExec', stagedExecRun], ['space', spaceRun],
      ['skip', skipRun], ['pause', pauseRun], ['scene', sceneRun], ['repeat', () => repeatRun(3)], ['fps', () => fpsRun()], ['hud', hudRun]];
    if (boss) steps.push(['boss30', () => boss30Run()], ['retry', retryRun], ['protect', protectRun], ['boss50', boss50Run]);
    for (const [k, f] of steps) {
      const s0 = performance.now();
      try { out[k] = await f(); } catch (e) { out[k] = { err: String(e), stack: String(e.stack).slice(0, 400) }; }
      out[k].ms = Math.round(performance.now() - s0);
      window.__r25all = { running: true, at: k, out };
    }
    if (Q().world.name !== 'surface') await Q().game.switchWorld('surface');
    out.summary = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v?.ok ?? (v?.err ? 'ERR' : null)]));
    out.totalMs = Math.round(performance.now() - t0);
    window.__r25all = { running: false, out };
  }, 0);
  return 'started';
}
