// 第二十一轮自检与录像：境界成长（等级、修炼灵气、奖励、提升修为、属性、存档迁移、御剑）与九霄凤焰（两种模式、火带、弹反、仇恨、Boss 阶段）。
// 都按真实的输入、出招、结算、特效代码推进（__qinglan.tick），不是另写一套。
// 用法（预览）：const T = await import('/tools/r21_growth.js?v=' + Date.now()); await T.setup(); await T.arena();
//   修为：T.paceTable()、T.meditateRun()、T.rewardsRun()、T.ascendRun()、T.capRun()、T.equipRun()、T.migrateRun()、T.flightRun()
//   凤凰：T.lmbRun()、T.steerRun()、T.strikeRun()、T.stageRun()、T.zoneRun()、T.parryRun()、T.guardRun()、T.budgetRun()、T.fpsRun()、T.pauseRun()、T.snapshotRun()
import * as B from './r17_combat_bot.js';
import { baseNeed, breakExtra, totalNeed, targetTime, baseAbsorb, paceSecs, realmLabel, statMul, rewardScale, Progression, realmOf } from '/src/game/progression.js';
import { execChance } from '/src/game/phoenix.js';
import { PHOENIX, PLAYER_COMBAT as PC } from '/src/game/combatConfig.js';
import { LEVEL, REWARDS, ASCEND, FLIGHT, QI_TIERS } from '/src/game/progressConfig.js';

const Q = () => window.__qinglan;
export const { setup, toArena, tick } = B;
const r1 = (v) => +(+v).toFixed(1), r2 = (v) => +(+v).toFixed(2), r3 = (v) => +(+v).toFixed(3);
let RING = window.__r21ring || null;
export async function arena() { RING = window.__r21ring = await B.toArena(); B.quietDragons(true); skyQuiet(true); fresh(); return RING; }
// 长时间模拟时不重绘环境贴图（与本轮无关，只为自检跑得快）；录像前 skyQuiet(false) 恢复。
// 关着时空函数只记下时辰、没有真画：恢复时让下一帧真的重绘一次（天空的时辰判断修正后约 20 秒才重绘一次，不再每帧刷新，见 tools/r27_skyenv.js）
export function skyQuiet(on = true) {
  const S = Q().sky;
  S._refreshEnv ||= S.refreshEnv;
  if (!on && S.refreshEnv !== S._refreshEnv) S.envT = Infinity;
  S.refreshEnv = on ? function () { this.envHour = Q().TIME.hour; } : S._refreshEnv;
}

// 每次测试前：招式、冷却、灵力、气血归位，凤凰与火焰清掉，人站回比试圈中央、朝北
// OPEN：开阔的山坡（西边，朝东北 90 米内障碍不高于 10 米、都在可加载范围内）——凤凰的飞行测试在这里做（比试圈四周有墙、门楼与屋舍）
export const OPEN = { x: -80, z: 0, yaw: Math.PI / 4 };
export function fresh(yaw = Math.PI, at = null) {
  const A = Q(), M = A.moves, C = A.combat, P = A.player;
  if (A.game.meditating) A.game.endMeditate(true);
  if (A.game.asc) A.game.cancelAscend('test');
  A.phoenix.clear('test');
  M.reset(); for (const k in M.cools) M.cools[k] = 0; M.mp = M.mpMax;
  C.playerUnit.hp = C.playerUnit.maxHp; C.playerUnit.alive = true; C.playerUnit.invuln = 0;
  A.input.keys.clear(); A.input.forceDown = false;
  if (at) P.place(at.x, at.z, yaw, A.terrain.heightAt(at.x, at.z));
  else if (RING) P.place(RING.cx, RING.cz + 2, yaw, RING.y);
  P.heading = yaw; P.vel.set(0, 0, 0);
  A.cam.pitchRange = null;
  A.cam.set(yaw, 0.3, 8); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55));
  C.dummies = C.dummies.filter((x) => !x.test);
  B.tick(10, 1 / 60, false);
}
// 推进 secs 秒；evs = [[秒, 事件]]（'L+' 'L-' 'Z+' 'C' 'R+' … 或函数）；each(t) 每帧
export function run(evs, secs, each = null, dt = 1 / 60) {
  const A = Q(), list = evs.slice().sort((a, b) => a[0] - b[0]);
  let k = 0, t = 0;
  for (let i = 0; i < Math.round(secs / dt); i++) {
    while (k < list.length && list[k][0] <= t + 1e-9) { const e = list[k++][1]; if (typeof e === 'function') e(); else B.applyEvent(e); }
    A.tick(dt, 1, false);
    t += dt;
    if (each && each(t) === false) break;
  }
  return t;
}
// 身前的魔修：[[种类, 前方几米, 向左几米], …]；active：会出手（默认只站着挨打）
export function foes(list, { yaw = null, active = false, hp = null } = {}) {
  const A = Q(), C = A.combat, P = A.player, y = yaw ?? P.heading, f = { x: Math.sin(y), z: Math.cos(y) }, l = { x: Math.cos(y), z: -Math.sin(y) };
  clearFoes();
  return list.map(([k, d, s]) => {
    const e = C.spawn(k, { x: P.pos.x + f.x * d + l.x * s, y: P.pos.y, z: P.pos.z + f.z * d + l.z * s }, { yaw: y + Math.PI });
    e.state = 'chase';
    if (!active) { e.cool = 99; e.slamCool = 99; e.cfg = { ...e.cfg, speed: 0 }; }
    if (hp != null) { e.hp = e.maxHp = hp; e.bar.set(1); }
    return e;
  });
}
export function clearFoes() { const C = Q().combat; for (const e of [...C.enemies]) { e.dispose(); C.enemies.splice(C.enemies.indexOf(e), 1); } }
// 战斗中的随机数换成固定序列（暴击、秒杀可复现）
function fixRand(v) { const ph = Q().phoenix, keep = ph.rand; ph.rand = typeof v === 'function' ? v : () => v; return () => { ph.rand = keep; }; }

// =====================================================================================
// 境界成长
// =====================================================================================
// 升级需求与目标节奏（纯公式）：各级基础 / 突破额外 / 总需求、目标时间、1 倍浓度的吸收、4 倍灵脉的用时；几段的总用时
export function paceTable() {
  const rows = [];
  for (const L of [1, 9, 10, 11, 20, 21, 22, 31, 32, 33, 44, 45, 55, 56, 66, 67, 77, 78, 88, 89, 98, 99]) {
    rows.push({ L, realm: realmLabel(L), base: L < LEVEL.max ? baseNeed(L) : 0, extra: breakExtra(L), total: totalNeed(L), T: r2(targetTime(L)), absorb: r3(baseAbsorb(L)), secs4x: L < LEVEL.max ? r1(totalNeed(L) / (baseAbsorb(L) * 4)) : null });
  }
  const drops = [];
  for (let L = 1; L < 98; L++) if (totalNeed(L + 1) < totalNeed(L)) drops.push(`${L}→${L + 1}: ${totalNeed(L)} → ${totalNeed(L + 1)}`);
  return { rows, secs21: r1(paceSecs(21, 22)), secs55: r1(paceSecs(55, 56)), secs98: r1(paceSecs(98, 99)), hours21to99: r2(paceSecs(21, 99) / 3600), hours1to21: r2(paceSecs(1, 21) / 3600), drops };
}
// 打坐实测：L 级、在 spot（pool 灵池静修台 4 倍 / array 聚灵阵 3 倍 / free 当前位置）打坐，fps 帧率；secs 给了就只跑这么久（量速度），否则跑到攒满
export function meditateRun({ L = 21, spot = 'pool', fps = 60, secs = null, limit = 900 } = {}) {
  const A = Q(), G = A.game, P = A.prog, dt = 1 / fps;
  fresh(); clearFoes();
  P.debugSetLevel(L, { qi: 0 });
  G.startMeditate(spot);
  const m = G.meditating;
  if (!m) return { error: 'not meditating' };
  const zone = m.zone, need = totalNeed(L), q0 = P.qi;
  let t = 0;
  const end = secs ?? limit;
  while (t < end - 1e-9 && (secs != null || P.qi < need)) { A.tick(dt, 1, false); t += dt; if (!G.meditating) break; }
  const gained = P.qi - q0, still = !!G.meditating;
  G.endMeditate(true);
  return { L, spot, fps, zone: `${zone.name} ×${zone.k}`, need, secs: r2(t), gained: r2(gained), rate: r3(gained / t), expectRate: r3(baseAbsorb(L) * zone.k), expectSecs: r1(need / (baseAbsorb(L) * zone.k)), still };
}
// 打坐被打断：移动、出手、受击、换场景
export function meditateBreak() {
  const A = Q(), G = A.game, C = A.combat, out = {};
  const go = (label, act) => {
    fresh(); G.startMeditate('free');
    run([], 1);
    const q0 = A.prog.qi;
    act();
    const swung = A.moves.act?.key || null;
    run([], 0.5);
    out[label] = { stopped: !G.meditating, gainedAfter: r3(A.prog.qi - q0), swung };
    if (G.meditating) G.endMeditate(true);
  };
  go('move', () => { A.input.keys.add('KeyW'); run([], 0.1); A.input.keys.clear(); });
  go('attack', () => { A.moves.press('light', true); run([], 0.05); A.moves.press('light', false); });
  go('hurt', () => { C.damage(C.playerUnit, 3, { from: { faction: 'demon', pos: A.player.pos.clone().add(new A.THREE.Vector3(1, 0, 0)) }, kind: 'demonic', spec: { def: 'claw', id: 'test:hurt', seg: 0, active: true } }); });
  return out;
}
// 奖励：寻常魔修、精英（敌我等级差）、同一敌人只结算一次、遭遇时记下的基准不随升级变、宗门任务、Boss 首通、去重
export function rewardsRun() {
  const A = Q(), P = A.prog, C = A.combat, out = {};
  fresh(); P.debugSetLevel(21, { qi: 0 });
  const kill = (kind, lvUp = false) => {
    const [e] = foes([[kind, 3, 0]]);
    const q0 = P.qi;
    C.damage(e, 1, { from: C.playerUnit, kind: 'sword' });             // 遭遇开始（记下基准）
    if (lvUp) P.debugSetLevel(22, { qi: P.qi });                       // 击杀前升了一级：奖励仍按遭遇时的 21 级
    C.damage(e, e.hp + 10, { from: C.playerUnit, kind: 'sword' });
    const got = P.qi - q0, again = P.onKill(e);
    return { got: r2(got), again, base: e._rw?.need, pl: e._rw?.pl, el: e._rw?.el, scale: r3(rewardScale(e._rw?.el, e._rw?.pl)) };
  };
  out.shade = { ...kill('shade'), expect: r2(REWARDS.kill.normal * baseNeed(21) * rewardScale(20, 21)) };
  out.elite = { ...kill('elite'), expect: r2(REWARDS.kill.elite * baseNeed(21) * rewardScale(24, 21)) };
  P.debugSetLevel(21, { qi: 0 });
  out.shadeLevelUpBeforeKill = { ...kill('shade', true), expect: r2(REWARDS.kill.normal * baseNeed(21) * rewardScale(20, 21)) };
  // 木人桩、演武场的对手不给（遭遇基准为 none）
  const dm = { dummy: true, kind: 'dummy' }, du = { duel: true, diffKey: 'normal', kind: 'instructor' };
  out.training = { dummy: P.recordEncounter(dm), duel: P.recordEncounter(du) };
  // 宗门任务（丹房求药：简单 5%，任务 20 级）：领取时记下，交付时发；第二次交付不发
  P.debugSetLevel(21, { qi: 0 });
  const d = P.d; delete d.quests.herb; delete d.ledger['quest.herb'];
  P.recordQuest('herb');
  P.debugSetLevel(25, { qi: 0 });                                       // 交付前升到 25：仍按领取时的 21 级
  const a1 = P.completeQuest('herb'), a2 = P.completeQuest('herb');
  out.quest = { first: r2(a1), second: a2, expect: r2(REWARDS.quest.easy * baseNeed(21) * rewardScale(20, 21)) };
  // Boss 整场首通（20%，龙君 32 级 → 修正封顶 1.5）：只发一次
  P.debugSetLevel(21, { qi: 0 });
  delete d.ledger['boss50.first']; if (d.events) delete d.events.boss50;
  const rec = P.recordEvent('boss50', 32);
  const b1 = P.grantOnce('boss50.first', REWARDS.boss, rec, 'test'), b2 = P.grantOnce('boss50.first', REWARDS.boss, rec, 'test');
  out.boss = { first: r2(b1), second: b2, expect: r2(REWARDS.boss * baseNeed(21) * 1.5) };
  clearFoes();
  return out;
}
// 提升修为：条件、取消（移动、受击）、操作锁（重复点击）、一次性提交、过期的提交、上限
export function ascendRun() {
  const A = Q(), P = A.prog, G = A.game, C = A.combat, M = A.moves, out = {};
  // 每项之前真的静站 5.2 秒（脱战计时照常走，不直接改计时）
  const prep = (L = 21, extra = 123.4) => { fresh(); clearFoes(); P.debugSetLevel(L, { qi: totalNeed(L) + extra }); run([], ASCEND.calm + 0.2); };
  const hurt = (id) => C.damage(C.playerUnit, 4, { from: { faction: 'demon', pos: A.player.pos.clone().add(new A.THREE.Vector3(1, 0, 0)) }, kind: 'demonic', spec: { def: 'claw', id, seg: 0, active: true } });
  // 1. 脱战不足 5 秒：不能启动（挨一下、过 2 秒再试）
  prep(); hurt('test:calm'); run([], 2);
  G.startAscend(); out.notCalm = { asc: !!G.asc, calm: r2(P.calmT), reason: P.canAscend({}).reason };
  // 2. 移动取消：不扣、不升
  prep(); G.startAscend(); let started = !!G.asc; run([], 1.0); A.input.keys.add('KeyW'); run([], 0.1); A.input.keys.clear(); run([], 0.2);
  out.moveCancel = { started, level: P.level, qiKept: r2(P.qi - (totalNeed(21) + 123.4)), asc: !!G.asc };
  // 3. 受击取消
  prep(); G.startAscend(); started = !!G.asc; run([], 1.0);
  hurt('test:asc');
  run([], 0.2);
  out.hurtCancel = { started, level: P.level, qiKept: r2(P.qi - (totalNeed(21) + 123.4)), asc: !!G.asc };
  // 3b. 出手取消（按左键：只中断聚气，这一下不出剑）
  prep(); G.startAscend(); started = !!G.asc; run([], 1.0);
  M.press('light', true); run([], 0.1); const act = M.act?.key || null; M.press('light', false); run([], 0.2);
  out.attackCancel = { started, level: P.level, qiKept: r2(P.qi - (totalNeed(21) + 123.4)), asc: !!G.asc, swung: act };
  // 4. 重复点击（锁）+ 一次性提交：升一级、扣一次、保留剩余；HP / MP 已损失的量不变
  prep(); C.playerUnit.hp = C.playerUnit.maxHp - 50; M.mp = M.mpMax - 20;
  const hp0 = C.playerUnit.maxHp, mp0 = M.mpMax, ups0 = P.d.ups.length;
  // 提交的那一刻前后的气血、灵力（聚气 3.4 秒里自然回复照常，所以在提交处量）
  const keepCommit = P.commitAscend, at = {};
  P.commitAscend = function (...a) { const U = C.playerUnit; M.mp = M.mpMax - 20; at.before = { hp: U.hp, max: U.maxHp, mp: M.mp, mpMax: M.mpMax }; const r = keepCommit.apply(this, a); at.after = { hp: U.hp, max: U.maxHp, mp: M.mp, mpMax: M.mpMax }; return r; };
  G.startAscend(); started = !!G.asc; const dup = P.beginAscend({ world: G.world });
  G.startAscend();                                                       // 再点一次：不会启动第二个
  run([], ASCEND.gather + 0.3);
  P.commitAscend = keepCommit;
  const lost = (o) => o && { hpLost: r3(o.max - o.hp), mpLost: r3(o.mpMax - o.mp), max: r2(o.max), mpMax: r2(o.mpMax) };
  out.commitVitals = { before: lost(at.before), after: lost(at.after) };
  out.commit = { started, dup: dup.dup, level: P.level, left: r2(P.qi), expectLeft: 123.4, ups: P.d.ups.length - ups0, hpLost: r2(C.playerUnit.maxHp - C.playerUnit.hp), mpLost: r2(M.mpMax - M.mp), maxHp: [r2(hp0), r2(C.playerUnit.maxHp)], maxMp: [r2(mp0), r2(M.mpMax)] };
  // 5. 过期的提交（之前的 token 再交一次）：不重复升级
  const stale = P.commitAscend(1, { world: G.world });
  out.stale = { stage: stale.stage, level: P.level };
  // 6. 99 级不能再提升
  prep(99, 0); G.startAscend(); out.cap = { asc: !!G.asc, reason: P.canAscend({}).reason };
  P.debugSetLevel(21, { qi: 0 });
  return out;
}
// 99 级：灵气不再积累（剩余保留但没有升级用途），累计获得照记
export function capRun() {
  const A = Q(), P = A.prog, G = A.game;
  fresh();
  P.debugSetLevel(98, { qi: totalNeed(98) + 500 }); run([], ASCEND.calm + 0.2);
  G.startAscend(); run([], ASCEND.gather + 0.3);
  const after = { level: P.level, qi: r2(P.qi), capGained: r2(P.d.capGained), label: realmLabel(P.level), info: P.info().capText };
  const g0 = P.d.gained, c0 = P.d.capGained, q0 = P.qi;
  G.startMeditate('pool'); run([], 20); G.endMeditate(true);
  const killV = P.add(1000, { src: 'kill', label: 'test', quiet: true });
  const out = { after, qiAfterMeditate: r2(P.qi), qiChange: r2(P.qi - q0), gainedStat: r2(P.d.gained - g0), capGainedStat: r2(P.d.capGained - c0), killAdded: killV };
  P.debugSetLevel(21, { qi: 0 });
  return out;
}
// 换装：保持百分比，来回 n 次没有净回血、回灵力（不触发升级补偿）
export function equipRun(n = 500) {
  const A = Q(), P = A.prog, U = A.combat.playerUnit, M = A.moves;
  fresh(); P.debugSetLevel(40, { qi: 0 });
  U.hp = U.maxHp * 0.537; M.mp = M.mpMax * 0.4123;
  const hp0 = U.hp, mp0 = M.mp, max0 = [U.maxHp, M.mpMax];
  P.setEquip({ hpMul: 1.18, mpMul: 1.07, hpAdd: 13.3 });
  const on = { hp: r3(U.hp), max: r3(U.maxHp), pct: r3(U.hp / U.maxHp) };
  for (let i = 0; i < n; i++) { P.setEquip({}); P.setEquip({ hpMul: 1.18, mpMul: 1.07, hpAdd: 13.3 }); }
  P.setEquip({});
  const out = { n, hp: [r3(hp0), r3(U.hp)], mp: [r3(mp0), r3(M.mp)], hpDiff: U.hp - hp0, mpDiff: M.mp - mp0, max: [max0.map(r2), [r2(U.maxHp), r2(M.mpMax)]], on };
  P.debugSetLevel(21, { qi: 0 });
  return out;
}
// 存档迁移：用伪造的存档跑一遍 Progression（不碰真实存档）
export function migrateRun() {
  const mk = (d) => ({ d: { v: 1, quest: { herb: { stage: 0, count: 0 } }, ...d }, saved: 0, save() { this.saved++; } });
  const out = {};
  let s = mk({}); let p = new Progression(s); out.fresh = { init: p.migrated.init, level: p.level, qi: p.qi, label: p.label(), cfgV: s.d.cfgV };
  s = mk({ prog: { init: 1, level: 56, qi: 1234, gained: 9, capGained: 0, ledger: {}, quests: {}, ups: [], realm: '出窍' }, cfgV: 0 }); p = new Progression(s);
  out.storedRealmName = { level: p.level, label: p.label(), fixed: p.migrated.fixed, cfgFrom: p.migrated.cfgFrom, init: p.migrated.init };
  s = mk({ prog: { init: 1, level: 'abc', qi: -5, gained: NaN, ledger: null }, cfgV: 1 }); p = new Progression(s);
  out.illegal = { level: p.level, qi: p.qi, fixed: p.migrated.fixed };
  s = mk({ prog: { init: 1, level: 140, qi: 3 }, cfgV: 1 }); p = new Progression(s);
  out.over = { level: p.level, label: p.label() };
  s = mk({ prog: { init: 1, level: 30, qi: 777, ledger: { 'quest.herb': 639.1 }, quests: {}, ups: [{ from: 29, to: 30 }] }, cfgV: 1 }); p = new Progression(s);
  out.upgraded = { level: p.level, qi: p.qi, init: p.migrated.init, ledger: Object.keys(p.d.ledger) };
  // 读档恢复当前资源：直接恢复、校验范围，不做补偿
  const A = Q(), P = A.prog, U = A.combat.playerUnit, M = A.moves;
  P.applyStats('load', { hp: 50.5, mp: 20.25 }); out.loadVitals = { hp: U.hp, mp: M.mp };
  P.applyStats('load', { hp: 99999, mp: -3 }); out.loadClamp = { hp: r2(U.hp), max: r2(U.maxHp), mp: M.mp };
  U.hp = U.maxHp; M.mp = M.mpMax;
  return out;
}
// 御剑：练气不能、筑基短续航（到时缓降、落地歇息）、金丹以上照旧
export function flightRun() {
  const A = Q(), P = A.prog, G = A.game, pl = A.player, out = {};
  const prep = (L) => { fresh(); P.debugSetLevel(L, { qi: 0 }); G.flyRest = 0; };
  prep(5); G.toggleFlight(); run([], 0.5); out.lianqi = { flying: pl.flying };
  prep(15); G.toggleFlight(); run([], 1.0); const up = pl.flying;
  let landedAt = null, forcedAt = null;
  run([], FLIGHT.short.secs + 25, (t) => { if (forcedAt == null && A.input.forceDown) forcedAt = r1(t + 1); if (landedAt == null && !pl.flying && t > 2) { landedAt = r1(t + 1); return false; } });
  run([], 1);
  out.zhuji = { tookOff: up, forcedDownAt: forcedAt, landedAt, rest: r1(G.flyRest) };
  G.toggleFlight(); run([], 0.5); out.zhujiAgainAtOnce = { flying: pl.flying, rest: r1(G.flyRest) };
  run([], FLIGHT.short.rest); G.toggleFlight(); run([], 1); out.zhujiAfterRest = { flying: pl.flying };
  if (pl.flying) { pl.flight.land(); run([], 8); }
  prep(21); G.toggleFlight(); run([], 1.0); run([], FLIGHT.short.secs + 5); out.jindan = { flying: pl.flying };
  if (pl.flying) { pl.flight.land(); run([], 8); }
  P.debugSetLevel(21, { qi: 0 });
  return out;
}

// =====================================================================================
// 九霄凤焰
// =====================================================================================
// 第二十二轮：起手换成约 1.2 秒的舞刀，1.05 秒才离刀——按 3 之后推进到凤凰出现（离刀）再多走 extra 秒
export function untilLaunch(extra = 0, dt = 1 / 60) { run([], 1.5, () => !Q().phoenix.bird, dt); if (extra > 0) run([], extra, null, dt); }
export function cast(mode = 'strike') {
  const A = Q(), ph = A.phoenix, M = A.moves;
  ph.mode = mode; M.cools.phoenix = 0; M.mp = M.mpMax;
  M.press('phoenix', true);
  untilLaunch(0.1);
  return ph.bird;
}
// 左键接管：只有凤翔天击的飞行阶段；之前按着的要松开再按；结束后新的按下才恢复连击；护战、残留火带不接管
export function lmbRun() {
  const A = Q(), ph = A.phoenix, M = A.moves, ptr = A.game.pointer, out = {};
  const lights = () => (M.act?.key?.startsWith('light') ? M.act.key : null);
  // 1. 按着左键时放出：飞行中左键不出剑，按着的那一下不算操控
  fresh(0); clearFoes(); A.prog.debugSetLevel(21);   // 朝南：比试圈南边是下坡、开阔（北边是山）
  A.cam.pitch = -0.1;                                   // 镜头略朝上：凤凰平飞出去（朝下会一头撞地，飞行一秒就结束）
  ptr.setAttack(true); run([], 0.4);
  const before = lights();
  // 连击中按 3：照现有的输入缓冲（0.15 秒），在可取消的时刻按下才接得上——这里等到可接时再按
  let pressedAt = null;
  run([], 1.5, (t) => { if (M.canStart('skill')) { M.press('phoenix', true); pressedAt = r2(t); return false; } });
  let sawLight = 0, flightFrames = 0, steer = 0;
  run([], 2.0, () => { if (ph.bird && ph.ownsLMB()) { flightFrames++; if (lights()) sawLight++; if (ph.bird.steering) steer++; } });
  out.heldBefore = { lightBefore: before, pressedAt, flightFrames, lightFramesDuringFlight: sawLight, steeringWhileHeld: steer, owns: ph.ownsLMB(), heldLight: M.held.light, ptrDown: ptr.attacking };
  ptr.setAttack(false); run([], 0.1);
  ptr.setAttack(true); run([], 0.3);
  out.repress = { steering: !!ph.bird?.steering, light: lights() };
  // 2. 飞行结束：仍按着左键也不自动出剑；新的一次按下才恢复
  run([], 8, () => !ph.bird ? false : true);
  run([], 0.5);
  out.afterEnd = { bird: !!ph.bird, heldLight: M.held.light, light: lights() };
  ptr.setAttack(false); run([], 0.1); ptr.setAttack(true); run([], 0.3);
  out.newPress = { light: lights() };
  ptr.setAttack(false); run([], 0.8);
  // 3. 护战期间：左键照常出剑
  fresh(0); A.cam.pitch = -0.1; cast('guard');
  ptr.setAttack(true); run([], 0.5); out.guard = { owns: ph.ownsLMB(), light: lights() }; ptr.setAttack(false);
  // 4. 残留火带：不接管
  fresh(); cast('strike'); run([], 2);                  // 朝下飞：撞地留下凤焰印与火带，飞行结束
  ptr.setAttack(true); run([], 0.3); out.residual = { zones: ph.zones.length, owns: ph.ownsLMB(), light: lights() }; ptr.setAttack(false);
  fresh();
  return out;
}
// 操控：镜头方向（上、下、左、右）→ 凤凰的三维方向；最大转速；距离上限折返（不瞬移）；投火高度
// 在开阔的山坡（OPEN）上：先略朝上飞 1 秒，再按测试转镜头
export function steerRun() {
  const A = Q(), ph = A.phoenix, cam = A.cam, ptr = A.game.pointer, out = {};
  const launch = (pre = -0.5, climb = 1.0) => {
    fresh(OPEN.yaw, OPEN); clearFoes();
    cam.pitch = pre;
    cast('strike');
    ptr.setAttack(false); ptr.setAttack(true);           // 起飞后按下左键：开始操控
    run([], climb);
    return ph.bird;
  };
  const fly = (pitchDeg, yawOff, secs = 1.4, pre = -0.5) => {
    const b0 = launch(pre);
    if (!b0) return { ended: 'early' };
    const p0 = b0.pos.clone(), y0 = b0.dir.clone();
    cam.yaw += yawOff; cam.pitch = pitchDeg * Math.PI / 180;
    let maxRate = 0, prev = b0.dir.clone(), end = null;
    run([], secs, (t) => { const b = ph.bird; if (!b || b.phase === 'dissolve') { end = ph.events.find((e) => e.kind === 'impact' || e.kind === 'end'); return false; } const a = prev.angleTo(b.dir) / (1 / 60); maxRate = Math.max(maxRate, a); prev = b.dir.clone(); });
    const b = ph.bird, camPitch = r1(cam.pitch * 180 / Math.PI);
    const r = b ? { dirPitchDeg: r1(Math.asin(b.dir.y) * 180 / Math.PI), camPitchDeg: camPitch, climb: r2(b.pos.y - p0.y), turned: r1(y0.angleTo(b.dir) * 180 / Math.PI), maxTurnDeg: r1(maxRate * 180 / Math.PI) }
      : { ended: end?.kind === 'impact' ? end.hit : end?.reason, maxTurnDeg: r1(maxRate * 180 / Math.PI), camPitchDeg: camPitch };
    ptr.setAttack(false);
    return r;
  };
  out.up = fly(-80, 0, 1.2); out.down = fly(80, 0, 2.5); out.left = fly(-5, 1.2); out.right = fly(-5, -1.2);
  // 距离上限：略朝上一直飞，超过 80 米后折返；记下每帧位移（不瞬移）、回到 64 米内可再接管
  launch(-0.42);
  let maxStep = 0, maxDist = 0, retAt = null, backAt = null, retake = null, prev = ph.bird?.pos.clone();
  const P = A.player, owner = () => P.pos.clone().setY(P.pos.y + 1.4);
  run([], 7.2, (t) => {
    const b = ph.bird; if (!b || b.phase === 'dissolve') return false;
    maxStep = Math.max(maxStep, b.pos.distanceTo(prev)); prev = b.pos.clone();
    const d = b.pos.distanceTo(owner()); maxDist = Math.max(maxDist, d);
    if (b.returning && retAt == null) retAt = r2(b.t);
    if (retAt != null && !b.returning && backAt == null) { backAt = r2(b.t); ptr.setAttack(false); ptr.setAttack(true); retake = { steering: b.steering, dist: r1(d) }; }
  });
  out.distance = { maxDist: r1(maxDist), returnedAtLife: retAt, backWithin64AtLife: backAt, retake, maxStepPerFrame: r3(maxStep), speedPerFrame: r3(PHOENIX.strike.speed / 60), endedBy: ph.bird ? 'still flying' : ph.events.find((e) => e.kind === 'end')?.reason };
  ptr.setAttack(false);
  // 投火高度：朝上陡升，离地 12 米以上时不再生火带
  launch(-0.9, 0.2);
  let hiT = 0, hiBands = 0, loBands = 0, prevN = ph.stats.bands, maxH = 0;
  run([], 3, () => {
    const b = ph.bird; if (!b || b.phase === 'dissolve') return false;
    const g = ph.surfaceBelow(b.pos.x, b.pos.y, b.pos.z, 400), hgt = g ? b.pos.y - g.y : 999, n = ph.stats.bands - prevN;
    maxH = Math.max(maxH, hgt); prevN = ph.stats.bands;
    if (hgt > PHOENIX.strike.band.rayDown) { hiT += 1 / 60; hiBands += n; } else loBands += n;
  });
  out.height = { secondsAbove12m: r2(hiT), maxHeight: r1(maxH), bandsBelow12m: loBands, bandsAbove12m: hiBands };
  ptr.setAttack(false);
  fresh();
  return out;
}

// =====================================================================================
// 撞击、暴击、秒杀
// =====================================================================================
const seqRand = (arr) => { let i = 0; return () => arr[Math.min(i++, arr.length - 1)]; };
// 比试圈南侧离中心 dz 米、朝北（圈内平地；北边 10 米外才是山坡）
export function ringSpot(dz = 7) {
  const A = Q(), P = A.player;
  fresh(Math.PI);
  P.place(RING.cx, RING.cz + dz, Math.PI, RING.y); P.heading = Math.PI;
  A.cam.set(Math.PI, 0.3, 8); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55));
  B.tick(5, 1 / 60, false);
}
// 放一次凤翔天击（镜头俯角 pitch），等它结束（撞击、到时、出界），返回这一次的撞击、结束记录
// 第二十二轮：凤凰由剑尖沿刀刃（大致水平）飞出；steer：离刀后按住左键，让它朝镜头准星所指的地面俯冲（第二十一轮起飞即朝镜头方向，这些测试靠它撞地留印）
export function strikeOnce(pitch = 0.3, { secs = 9, dt = 1 / 60, steer = false } = {}) {
  const A = Q(), ph = A.phoenix, M = A.moves;
  A.cam.pitch = pitch;
  const top = ph.events[0] || null;
  ph.mode = 'strike'; M.cools.phoenix = 0; M.mp = M.mpMax;
  M.press('phoenix', true);
  untilLaunch(0, dt);
  if (steer) A.game.pointer.setAttack(true);
  run([], secs, () => !!ph.bird, dt);
  if (steer) A.game.pointer.setAttack(false);
  const i = top ? ph.events.indexOf(top) : ph.events.length;
  const evs = ph.events.slice(0, i < 0 ? ph.events.length : i);
  return { impact: evs.find((e) => e.kind === 'impact') || null, end: evs.find((e) => e.kind === 'end') || null, cast: evs.find((e) => e.kind === 'cast') || null };
}
export function strikeRun() {
  const A = Q(), P = A.prog, C = A.combat, out = {};
  P.debugSetLevel(21, { qi: 0 });
  const dC = PHOENIX.dBase;                  // 21 级：等级成长 ×1
  // 1. 寻常魔修（20 级筑基，低于金丹：×2）：主目标 1.0 → 240；旁边一只 0.35 → 84；随机数 0.99：不暴击、不秒杀
  ringSpot(); let undo = fixRand(0.99);
  let [m, s] = foes([['shade', 9, 0], ['shade', 9.5, 2.6]], { hp: 1000 });
  let r = strikeOnce();
  out.shade = { hit: r.impact?.hit, main: r.impact?.main, burst: r.impact?.burst, exec: r.impact?.exec, hp: [r1(m.hp), r1(s.hp)], expect: { main: dC * PHOENIX.strike.hit.main * 2, burst: dC * PHOENIX.strike.hit.burst * 2 } };
  undo();
  // 2. 精英（24 级，同为金丹：×1）+ 暴击（随机数先 0.99 不秒杀、再 0 暴击）：主目标 120 × 1.5 = 180；旁边的寻常魔修 84（爆发不暴击）
  ringSpot(); undo = fixRand(seqRand([0.99, 0, 0, 0, 0]));
  [m, s] = foes([['elite', 9, 0], ['shade', 9.5, 2.6]], { hp: 1000 });
  r = strikeOnce();
  out.eliteCrit = { main: r.impact?.main, burst: r.impact?.burst, exec: r.impact?.exec, expect: { main: dC * PHOENIX.strike.hit.main * PHOENIX.crit.mult, burst: dC * PHOENIX.strike.hit.burst * 2 } };
  undo();
  // 3. 爆发的墙体遮挡：旁边那只在一堵（临时加的）墙后面
  ringSpot(); undo = fixRand(0.99);
  [m, s] = foes([['shade', 9, 0], ['shade', 9, 3.6]], { hp: 1000 });
  const W = C.world.cw, Pp = A.player.pos;
  const wall = W.addBox({ x: Pp.x - 1.9, z: Pp.z - 9, y0: RING.y - 0.5, y1: RING.y + 5, hx: 0.15, hz: 2.5, tag: 'r21test' });
  r = strikeOnce();
  W.remove(wall);
  out.burstLOS = { main: r.impact?.main?.amount, burst: r.impact?.burst, sideHp: r1(s.hp) };
  undo();
  // 4. 秒杀（随机数 0）：寻常魔修整条气血就是最终阶段 → 正常的死亡流程（降妖奖励照发）；不再追加普通撞击伤害
  ringSpot(); undo = fixRand(0);
  [m] = foes([['shade', 9, 0]]);
  const q0 = P.qi;
  r = strikeOnce();
  out.execute = { exec: r.impact?.exec, executed: r.impact?.executed, main: r.impact?.main ?? null, alive: m.alive, reward: r2(P.qi - q0), expectReward: r2(REWARDS.kill.normal * baseNeed(21) * rewardScale(20, 21)) };
  undo();
  // 5. 木人桩：随机数 0 也不判秒杀；没有境界配置 → 不克制（120）
  ringSpot(); undo = fixRand(0); clearFoes();
  const dm = B.dummy(9, 0); const tot0 = dm.total;
  r = strikeOnce();
  out.dummy = { target: r.impact?.target, exec: r.impact?.exec ?? null, main: r.impact?.main, recorded: r1(dm.total - tot0) };
  C.dummies = C.dummies.filter((x) => !x.test);
  undo();
  // 6. 秒杀概率 p(L)（低大境界 ×2，最高 10%）
  out.chance = [21, 30, 38, 46, 55, 70, 99].map((L) => `${L}: ${r3(execChance(L, false) * 100)}% / 低境界 ${r3(execChance(L, true) * 100)}%`);
  clearFoes(); fresh();
  return out;
}

// =====================================================================================
// 两种 Boss 气血结构（试炼魔将：同一总气血按阈值；第五十层龙君：独立阶段气血见 bossStageRun）
// =====================================================================================
export function stageRun() {
  const A = Q(), ph = A.phoenix, P = A.prog, out = {};
  P.debugSetLevel(21, { qi: 0 });
  // B1. 阶段 0 秒杀：推到 50% 阈值、转段（短暂无敌），不追加伤害
  ringSpot(); let undo = fixRand(0);
  let [e] = foes([['eliteStaged', 9, 0]]);
  const hp0 = e.hp;
  let r = strikeOnce();
  out.execStage0 = { maxHp: e.maxHp, before: hp0, after: r1(e.hp), stageIdx: e.stageIdx, immune: e.immune(), executed: r.impact?.executed, main: r.impact?.main ?? null };
  undo();
  // B2. 普通撞击打穿阶段 0：停在阈值，溢出的不带进下一段
  ringSpot(); undo = fixRand(0.99);
  [e] = foes([['eliteStaged', 9, 0]]);
  e.hp = 300; e.bar.set(e.hp / e.maxHp);
  r = strikeOnce();
  out.overflow = { before: 300, dmg: r.impact?.main?.amount, after: r1(e.hp), floor: e.maxHp * 0.5, stageIdx: e.stageIdx };
  undo();
  // B3. 最终阶段秒杀：正常死亡（精英的降妖奖励照发）
  ringSpot(); undo = fixRand(0);
  [e] = foes([['eliteStaged', 9, 0]]);
  e.stageIdx = 1; e.hp = 200; e.bar.set(e.hp / e.maxHp);
  const q0 = P.qi;
  r = strikeOnce();
  out.execFinal = { executed: r.impact?.executed, alive: e.alive, reward: r2(P.qi - q0), expect: r2(REWARDS.kill.elite * baseNeed(21) * rewardScale(26, 21)) };
  undo();
  // B4. 延迟的效果：护战的凤焰弹飞行途中，目标转了段——到达时阶段号对不上，丢掉（不伤到新阶段）
  ringSpot(); clearFoes();
  [e] = foes([['eliteStaged', 14, 0]]);
  ph.mode = 'guard'; A.moves.cools.phoenix = 0; A.moves.mp = A.moves.mpMax; A.moves.press('phoenix', true); untilLaunch(0.1);
  const b = ph.bird; if (b) { b.cds.breath = b.cds.swoop = 999; }
  let shifted = null, stale = null;
  run([], 8, () => { if (!shifted && ph.bolts?.length) { shifted = { hp: r1(e.hp), stage: e.stageInfo().id }; e.endStage({}); } stale = ph.events.find((x) => x.kind === 'stale'); if (stale) return false; });
  run([], 0.1);
  out.staleBolt = { shifted, stale, nowStage: e.stageInfo().id, hpAfter: r1(e.hp) };
  ph.clear('test'); ph.mode = 'strike';
  clearFoes(); fresh();
  return out;
}

// 第五十层（独立阶段气血）：一阶段秒杀 → 正常的阶段耗尽与转阶段过场（不发奖励）；二阶段满血（不带溢出）；
// 过场中战斗时钟停（凤凰、火焰、冷却都不走）；二阶段秒杀 → 正常的死亡与胜利结算（修为系统开放后的第一次通关发一次 20%）
// 不用调试入口（用了不发奖励）：龙的出招间隔拉长（stage 摆位时设定）、人物气血每帧补满
export async function bossStageRun() {
  const A = Q(), F = A.boss50, ph = A.phoenix, P = A.prog, M = A.moves, C = A.combat, out = {};
  const B16 = await import('/tools/r16_boss_bot.js');
  if (A.world.name !== 'boss50') { await A.game.towerRoom.enter(); B.tick(30, 1 / 60, false); await F.enter(); B.tick(60, 1 / 60, false); }
  if (F.state === 'dormant') { F.debug.start(); B.tick(30, 1 / 60, false); F.debug.skip(); B.tick(90, 1 / 60, false); }
  P.debugSetLevel(21, { qi: 0 });
  delete P.d.ledger['boss50.first'];
  out.start = { state: F.state, phase: F.phase, hp: F.unit.hp, debugUsed: !!F.debugUsed };
  const aimAtBoss = () => {
    B16.stage({ d: 9 });
    const pl = A.player.pos, caps = F.rig.caps.slice().sort((a, b) => a.a.distanceTo(pl) - b.a.distanceTo(pl));
    const c = caps[0], mid = c.a.clone().add(c.b).multiplyScalar(0.5);
    const from = pl.clone().setY(pl.y + 4.6);
    const yaw = Math.atan2(mid.x - from.x, mid.z - from.z), pitch = -Math.atan2(mid.y - from.y, Math.hypot(mid.x - from.x, mid.z - from.z));
    A.cam.set(yaw, pitch, 8);
    return { yaw: r2(yaw), pitch: r2(pitch), part: c.part };
  };
  const keepHp = () => { C.playerUnit.hp = C.playerUnit.maxHp; };
  // 一阶段秒杀
  let undo = fixRand(0);
  out.aim1 = aimAtBoss();
  M.cools.phoenix = 0; M.mp = M.mpMax; ph.mode = 'strike'; M.press('phoenix', true);
  run([], 3, () => { keepHp(); return F.state === 'fight'; });
  undo();
  const imp1 = ph.events.find((e) => e.kind === 'impact');
  out.phase1 = { impact: imp1 && { hit: imp1.hit, target: imp1.target, stage: imp1.stage, executed: imp1.executed, main: imp1.main ?? null }, state: F.state, p1Done: !!F.p1Done, hp: F.unit.hp, granted: P.granted('boss50.first'), qi: r2(P.qi), hold: F.combatHold };
  // 过场中：战斗时钟停
  const z0 = ph.zones.length, t0 = ph.t, c0 = M.cools.phoenix, die0 = ph.zones[0]?.die;
  let n = 0;
  run([], 30, () => { keepHp(); n++; return F.state !== 'fight'; });
  out.cine = { secs: r1(n / 60), phoenixClock: [r2(t0), r2(ph.t)], cooldown: [r2(c0), r2(M.cools.phoenix)], zones: [z0, ph.zones.length], zoneDie: [die0 != null ? r2(die0) : null, ph.zones[0] ? r2(ph.zones[0].die) : null] };
  out.phase2 = { state: F.state, phase: F.phase, hp: F.unit.hp, pool: F.hpPool(2) };
  // 二阶段秒杀 → 死亡与胜利
  undo = fixRand(0);
  ph.clear('test');
  out.aim2 = aimAtBoss();
  M.cools.phoenix = 0; M.mp = M.mpMax; M.press('phoenix', true);
  run([], 3, () => { keepHp(); return F.state === 'fight'; });
  undo();
  const imp2 = ph.events.find((e) => e.kind === 'impact');
  out.final = { impact: imp2 && { target: imp2.target, stage: imp2.stage, executed: imp2.executed }, state: F.state, alive: F.unit.alive };
  run([], 40, () => { keepHp(); return F.state === 'victory'; });
  out.result = { state: F.state, granted: P.granted('boss50.first'), qi: r2(P.qi), expect: r2(0.2 * baseNeed(21) * rewardScale(32, 21)), items: F.rewardInfo?.items, debug: !!F.rewardInfo?.debug };
  return out;
}
// 第五十层：主人在火里站久了（≥ 2.5 秒），落点 / 雷印 / 碎岳更常出（权重 ×3）——统计 n 次选招
export async function campRun(n = 3000) {
  const A = Q(), F = A.boss50, ph = A.phoenix;
  const { MOVES50 } = await import('/src/game/boss50Moves.js');
  const idOf = new Map(Object.entries(MOVES50).map(([k, v]) => [v, k]));
  const keep = ph.campSecs, CAMP = ['jump', 'thunder', 'slam'];
  const count = (secs) => { ph.campSecs = () => secs; const c = {}; let camp = 0; for (let i = 0; i < n; i++) { const d = F.choose(8, 0); if (!d) continue; const id = idOf.get(d); c[id] = (c[id] || 0) + 1; if (CAMP.includes(id)) camp++; } return { campShare: r3(camp / n), picks: c }; };
  const out = { calm: count(0), short: count(2.0), camping: count(3.0) };
  ph.campSecs = keep;
  return out;
}

// =====================================================================================
// 火带、凤焰印：接触、共享间隔、灼烧与治疗
// =====================================================================================
export function zoneRun() {
  const A = Q(), ph = A.phoenix, P = A.prog, C = A.combat, U = C.playerUnit, G = A.game, out = {};
  P.debugSetLevel(21, { qi: 0 });
  ringSpot(); clearFoes(); ph.resetStats();
  const r = strikeOnce(0.3, { steer: true });
  const seal = ph.zones.find((z) => z.kind === 'seal'), bands = ph.zones.filter((z) => z.kind === 'band');
  out.made = { hit: r.impact?.hit, seal: !!seal, bands: bands.length, spacing: bands.length > 1 ? r2(Math.hypot(bands[1].a.x - bands[0].a.x, bands[1].a.z - bands[0].a.z)) : null };
  if (!seal) return out;
  // 主人站在印记与最后一段火带重叠处：每 0.5 秒一跳（不因重叠而翻倍），每跳 3%（施法时的最大生命）
  const last = bands[bands.length - 1];
  const spot = last ? last.b.clone().lerp(seal.c, 0.3) : seal.c.clone();
  const stand = (p) => { A.player.place(p.x, p.z, Math.PI, ph.groundUnder(p.x, p.z, p.y + 1)); A.player.vel.set(0, 0, 0); };
  C.noRegen = true;
  stand(spot); U.hp = 60;
  const touching = ph.zonesTouching(U, []).map((z) => z.kind);
  let s0 = { ...ph.stats }; run([], 3.0);
  out.heal = { touching, ticks: ph.stats.healTicks - s0.healTicks, healed: r2(ph.stats.healEff - s0.healEff), perTick: r2(ph.zones[0].snap.maxHp * PHOENIX.strike.heal), perSec: r2((ph.stats.healEff - s0.healEff) / 3), maxHp: U.maxHp };
  // 反复进出不重置间隔：1 秒里在 0.3 秒处出去、0.4 秒处回来
  s0 = { ...ph.stats };
  const away = spot.clone().add(new A.THREE.Vector3(0, 0, 12));
  run([[0.3, () => stand(away)], [0.4, () => stand(spot)]], 1.0);
  out.reenter = { ticks: ph.stats.healTicks - s0.healTicks, expect: 2 };
  // 满血时：理论治疗照记、实际为 0、溢出为理论
  U.hp = U.maxHp; s0 = { ...ph.stats }; run([], 1.0);
  out.overheal = { theory: r2(ph.stats.healTheory - s0.healTheory), eff: r2(ph.stats.healEff - s0.healEff), over: r2(ph.stats.healOver - s0.healOver) };
  // 高空经过不算：御剑升到火上 1 米以上
  U.hp = 60; G.toggleFlight();
  run([], 3);
  s0 = { ...ph.stats }; run([], 1.5);
  out.overhead = { flying: A.player.flying, height: r2(A.player.pos.y - spot.y), ticksWhileAbove: ph.stats.healTicks - s0.healTicks };
  if (A.player.flying) { A.player.flight.land(); run([], 6); }
  // 敌人：灼烧每 0.5 秒 0.01 × 120 × 2（低境界）= 2.4，重叠不翻倍、不暴击（随机数 0）
  const undo = fixRand(0);
  stand(away);
  const [e] = foes([['shade', 1, 0]], { hp: 500 });
  const put = () => e.pos.set(spot.x, ph.groundUnder(spot.x, spot.z, spot.y + 1), spot.z);
  put();
  s0 = { ...ph.stats }; const hp0 = e.hp;
  run([], 3.0, put);
  out.burn = { touching: ph.zonesTouching(e, []).map((z) => z.kind), ticks: ph.stats.burnTicks - s0.burnTicks, dmg: r2(hp0 - e.hp), perTick: r2((hp0 - e.hp) / Math.max(1, ph.stats.burnTicks - s0.burnTicks)), crits: ph.stats.crits - s0.crits };
  undo();
  // 20 秒后全部熄灭（逻辑区域与渲染单元）
  clearFoes(); stand(away);
  run([], PHOENIX.strike.band.life + 1);
  out.expire = { zones: ph.zones.length, units: A.phoenixFx.activeUnits() };
  out.stats = { fireStay: r2(ph.stats.fireStay), healTheory: r2(ph.stats.healTheory), healEff: r2(ph.stats.healEff), healOver: r2(ph.stats.healOver), fireTaken: r2(ph.stats.fireTaken) };
  C.noRegen = false;
  fresh();
  return out;
}

// =====================================================================================
// 凤焰弹反
// =====================================================================================
export function parryRun() {
  const A = Q(), ph = A.phoenix, P = A.prog, C = A.combat, M = A.moves, out = {};
  P.debugSetLevel(21, { qi: 0 });
  ringSpot(); clearFoes(); ph.resetStats();
  strikeOnce(0.3, { steer: true });
  const seal = ph.zones.find((z) => z.kind === 'seal');
  if (!seal) return { error: 'no seal' };
  const yaw = Math.PI, f = { x: Math.sin(yaw), z: Math.cos(yaw) }, l = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const stand = (x, z) => { A.player.place(x, z, yaw, ph.groundUnder(x, z, seal.c.y + 1)); A.player.heading = yaw; A.player.vel.set(0, 0, 0); };
  // 时间线：每个出手的魔修在开始时摆到身前 1.8 米（side 左右错开）、出一招 melee；命中前 0.1 秒按下右键、0.25 秒后松开（真实的弹反）
  const timeline = (plan, secs) => {
    const P0 = A.player.pos.clone(), rec = [];
    const es = plan.map(() => C.spawn('shade', { x: P0.x + f.x * 6, y: P0.y, z: P0.z + f.z * 6 + 30 }, { yaw: yaw + Math.PI }));
    for (const e of es) { e.hp = e.maxHp = 500; e.bar.set(1); e.state = 'chase'; e.cool = 99; e.slamCool = 99; e.cfg = { ...e.cfg, speed: 0 }; }
    let t = 0;
    const evs = [];
    plan.forEach((p, i) => {
      const e = es[i], w = e.cfg.windup;
      evs.push([p.at, () => { e.pos.set(P0.x + f.x * 1.8 + l.x * (p.side || 0), P0.y, P0.z + f.z * 1.8 + l.z * (p.side || 0)); e.state = 'chase'; e.stunT = 0; e.cool = 0; e.begin('melee'); e.cool = 99; rec[i] = { parries: M.stat.parries, trig: ph.stats.parryTriggers, skip: ph.stats.parryCdSkip, t: null }; }]);
      evs.push([p.at + w - 0.1, () => C.setGuard(true)]);
      evs.push([p.at + w + 0.15, () => { C.setGuard(false); }]);
      evs.push([p.at + w + 0.3, () => { const r = rec[i]; rec[i] = { parried: M.stat.parries - r.parries, shock: ph.stats.parryTriggers - r.trig, skipped: ph.stats.parryCdSkip - r.skip }; }]);
    });
    run(evs, secs, () => { C.playerUnit.hp = C.playerUnit.maxHp; });
    C.setGuard(false);
    return { rec, es };
  };
  // 1–3. 站在印记中心：0 秒出手（弹反 → 冲击）；0.8 秒出手（距上次弹反约 0.8 秒：弹反照常、冲击在 1 秒冷却里不追加）；2.0 秒出手（冷却已过：再次冲击）
  stand(seal.c.x, seal.c.z);
  const near = foes([['shade', 4, 1.5], ['shade', 7, -2]], { hp: 500 });
  const h0 = near.map((e) => r1(e.hp)); let s0 = { ...ph.stats };
  const T1 = timeline([{ at: 0, side: 0 }, { at: 0.8, side: 0.5 }, { at: 2.0, side: -0.5 }], 3.2);
  out.sequence = { attacks: T1.rec, bystanders: { before: h0, after: near.map((e) => r1(e.hp)) }, shockHits: ph.stats.parryHits - s0.parryHits, shockDmg: r2(ph.stats.parryDmg - s0.parryDmg), expectEach: PHOENIX.strike.parry.k * PHOENIX.dBase * 2 };
  // 4. 去重：同一个真实事件（敌人 + 出手 + 第几段 + 弹反序号）再报一次不算；同一招的另一段（不同段号）各自触发
  run([], 1.1); s0 = { ...ph.stats };
  const ev = { seq: 9001, specId: 'testfoe:x1', seg: 0, from: { id: 'testfoe' } };
  const a1 = ph.onParry(ev), a2 = ph.onParry({ ...ev });
  run([], 1.1);
  const a3 = ph.onParry({ ...ev, seq: 9002, seg: 1 });
  out.dedupe = { first: !!a1, sameAgain: !!a2, nextSegment: !!a3, triggers: ph.stats.parryTriggers - s0.parryTriggers };
  // 5. 不在火里（离火带、印记 7 米以外）：弹反照常，不触发
  run([], 1.1); clearFoes();
  stand(seal.c.x + l.x * 7.5, seal.c.z + l.z * 7.5);
  const touchOut = ph.zonesTouching(C.playerUnit, []).length;
  const T2 = timeline([{ at: 0 }], 1.0);
  out.outsideFire = { touching: touchOut, attack: T2.rec[0] };
  // 6. 两次施法的火重叠：取 D_cast 最高的（40 级施的那次：120 × 8^(19/78) ≈ 199）——不清场，回到第一次的起点再放一次
  clearFoes();
  const start = { x: RING.cx, z: RING.cz + 7 };
  A.player.place(start.x, start.z, yaw, RING.y); A.player.heading = yaw; A.cam.set(yaw, 0.3, 8); B.tick(5, 1 / 60, false);
  P.debugSetLevel(40, { qi: 0 });
  const r40 = strikeOnce(0.3, { steer: true });
  P.debugSetLevel(21, { qi: 0 });
  stand(seal.c.x, seal.c.z);
  const touching = ph.zonesTouching(C.playerUnit, []).map((z) => `${z.kind}#${z.castId}:${r1(z.snap.dCast)}`);
  run([], 1.1);
  const r6 = ph.onParry({ seq: 9100, specId: 'test:src', seg: 0, from: null });
  out.source = { touching, chosenCast: r6?.castId, cast40: r40.cast?.castId, dCast40: r40.cast?.dCast };
  out.stats = { triggers: ph.stats.parryTriggers, dmg: r2(ph.stats.parryDmg), hits: ph.stats.parryHits, cdSkip: ph.stats.parryCdSkip };
  clearFoes(); fresh();
  return out;
}

// =====================================================================================
// 凤灵护战（30 秒）：调度、伤害、仇恨、凤凰的气血
// =====================================================================================
export function guardRun({ secs = 31, foesList = [['shade', 8, -3], ['shade', 9, 3], ['elite', 12, 0]], hp = 2000 } = {}) {
  const A = Q(), ph = A.phoenix, P = A.prog, C = A.combat, M = A.moves, out = {};
  P.debugSetLevel(21, { qi: 0 });
  ringSpot(); clearFoes(); ph.resetStats();
  const es = foes(foesList, { active: true, hp });
  M.cools.phoenix = 0; M.mp = M.mpMax; ph.mode = 'guard'; M.press('phoenix', true); untilLaunch(0.1);
  const b = ph.bird;
  out.summon = { kind: b?.kind, hp: ph.unit.hp, maxHp: ph.unit.maxHp, ownerMax: C.playerUnit.maxHp };
  const atks = [], keep = ph.pickGuardAttack;
  ph.pickGuardAttack = function (bb, T) { const before = bb.act; keep.call(this, bb, T); if (bb.act && bb.act !== before) atks.push({ t: r2(bb.t), kind: bb.act.kind, target: T.id || T.kind }); };
  const aggro = es.map(() => []);
  let endT = null;
  const maxAg = es.map(() => 0);
  run([], secs, (tt) => {
    C.playerUnit.hp = C.playerUnit.maxHp;
    es.forEach((e, i) => { const v = e._ph?.v ?? 0; maxAg[i] = Math.max(maxAg[i], v); if (Math.round(tt * 60) % 30 === 0) aggro[i].push(Math.round(v)); });
    if (!ph.bird && endT == null) endT = r2(tt + 0.5);
  });
  ph.pickGuardAttack = keep;
  const gaps = atks.slice(1).map((a, i) => r2(a.t - atks[i].t));
  const byKind = {}; for (const a of atks) (byKind[a.kind] ||= []).push(a.t);
  const kindGaps = {}; for (const k in byKind) kindGaps[k] = byKind[k].length > 1 ? Math.min(...byKind[k].slice(1).map((x, i) => r2(x - byKind[k][i]))) : null;
  const ends = ph.events.filter((e) => e.kind === 'end').slice(0, 1);
  out.attacks = { n: atks.length, list: atks.map((a) => `${a.t}:${a.kind}`).join(' '), minGap: gaps.length ? Math.min(...gaps) : null, minPerKind: kindGaps };
  out.damage = { total: r2(ph.stats.guardDmg), byKind: ph.stats.guardAtk, hits: ph.events.filter((e) => e.kind === 'guardHit').slice(0, 24).reverse().map((e) => `${e.atk}→${e.target}:${e.amount}${e.crit ? '暴' : ''}${e.low ? '×2' : ''}`) };
  out.aggro = { max: maxAg.map(Math.round), switches: ph.events.filter((e) => e.kind === 'aggroSwitch').length, drawSecs: r2(ph.stats.guardDrawT), taken: r2(ph.stats.guardTaken), trace: aggro.map((a) => a.filter((_, i) => i % 2 === 0).join(',')) };
  out.end = { endedAt: endT, reason: ends[0]?.reason, life: ends[0]?.life, phoenixHpLeft: r1(ph.unit.hp) };
  clearFoes(); ph.clear('test'); ph.mode = 'strike'; fresh();
  return out;
}

// 仇恨的稳定：改打凤凰之后，看得见 / 看不见每帧来回跳（飞行中擦过柱子）不会来回切换；连续 0.25 秒看不见才失效；失效后 0.5 秒才再改打
export function aggroFlickerRun() {
  const A = Q(), ph = A.phoenix, M = A.moves, out = {};
  ringSpot(6); clearFoes(); ph.resetStats();
  const [e] = foes([['shade', 6, 0]], { hp: 2000 });
  M.cools.phoenix = 0; M.mp = M.mpMax; ph.mode = 'guard'; M.press('phoenix', true); untilLaunch(0.1);
  const keep = ph.clearLine;
  let mode = 'flicker', frame = 0;
  ph.clearLine = function (a, b) { return mode === 'flicker' ? frame % 2 === 0 : mode !== 'blind'; };
  const ag = ph.aggro(e);
  const n = (k) => ph.events.filter((x) => x.kind === k).length;
  const on = [];
  run([], 2.0, () => { frame++; ag.v = 100; ag.last = ph.t; on.push(ph.targetFor(e) ? 1 : 0); });
  out.flicker = { switches: n('aggroSwitch'), drops: n('aggroDrop'), onFrames: on.filter(Boolean).length, frames: on.length };
  mode = 'blind'; let dropAt = null; const t0 = ph.t;
  run([], 0.6, () => { ag.v = 100; ph.targetFor(e); if (dropAt == null && !ag.on) dropAt = r2(ph.t - t0); });
  out.blind = { droppedAfter: dropAt, drops: n('aggroDrop'), why: ph.events.find((x) => x.kind === 'aggroDrop')?.why };
  mode = 'clear'; let reAt = null; const tOff = ag.offT;
  run([], 1.0, () => { ag.v = 100; ph.targetFor(e); if (reAt == null && ag.on) reAt = r2(ph.t - tOff); });
  out.rearm = { reswitchedAfterDrop: reAt, switches: n('aggroSwitch') };
  ph.clearLine = keep;
  clearFoes(); ph.clear('test'); ph.mode = 'strike'; fresh();
  return out;
}

// =====================================================================================
// 渲染预算：超过 256 个火焰单元时合并相邻单元，逻辑区域一个不少
// =====================================================================================
export function budgetRun(n = 420) {
  const A = Q(), ph = A.phoenix, fx = A.phoenixFx, V = A.THREE.Vector3, out = {};
  ringSpot(); clearFoes(); ph.clear('test');
  const snap = ph.snapshot(); ph.ticks.set(snap.castId, new Map());
  const b = { snap, strip: 0 };
  const P = A.player.pos, per = 14;
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / per), col = i % per;
    if (col === 0) b.strip = 1e6 + row;
    const z = P.z - 22 + (row % 20) * 1.6, x0 = P.x - 10 + col * 1.5, y = RING.y;
    ph.addBand(b, new V(x0, y, z), new V(x0 + 1.5, y, z));
  }
  out.logical = ph.zones.length;
  out.units = fx.activeUnits();
  out.merged = fx.stat.merged;
  out.maxUnits = fx.stat.maxUnits;
  // 最后加的那段（可能已被并进相邻单元）照样灼烧敌人
  const lastZ = ph.zones[ph.zones.length - 1];
  const [e] = foes([['shade', 1, 0]], { hp: 500 });
  const mid = lastZ.a.clone().lerp(lastZ.b, 0.5);
  const hp0 = e.hp;
  run([], 1.0, () => { e.pos.set(mid.x, ph.groundUnder(mid.x, mid.z, mid.y + 1), mid.z); });
  out.lastZoneBurns = r2(hp0 - e.hp);
  // 画一帧的开销（这些单元都在画面附近）
  const t0 = performance.now(); A.tick(1 / 60, 1, true); out.drawMs = r1(performance.now() - t0);
  clearFoes(); ph.clear('test'); fresh();
  return out;
}

// =====================================================================================
// 暂停：dt = 0 时一切不走（凤凰、火焰、治疗、冷却、仇恨、修炼、聚气）；没有哪一样按墙上时钟走
// =====================================================================================
export function pauseRun() {
  const A = Q(), ph = A.phoenix, P = A.prog, C = A.combat, M = A.moves, G = A.game, out = {};
  P.debugSetLevel(21, { qi: 0 });
  ringSpot(); clearFoes();
  const [e] = foes([['shade', 9, 2]], { hp: 500 });
  A.cam.pitch = -0.1; M.cools.phoenix = 0; M.mp = M.mpMax; ph.mode = 'strike'; M.press('phoenix', true); untilLaunch(0.5);
  C.playerUnit.hp = 80;
  const snap = () => ({ phT: r3(ph.t), birdT: ph.bird ? r3(ph.bird.t) : null, birdPos: ph.bird ? ph.bird.pos.toArray().map(r2) : null, cool: r3(M.cools.phoenix), zones: ph.zones.length, hp: r2(C.playerUnit.hp), mp: r2(M.mp), combatT: r3(C.t), movesT: r3(M.time), enemyHp: r1(e.hp), units: A.phoenixFx.activeUnits() });
  const s0 = snap(); const w0 = performance.now();
  A.tick(0, 600, false);
  const s1 = snap();
  out.strike = { same: JSON.stringify(s0) === JSON.stringify(s1), before: s0, after: s1, wallMs: Math.round(performance.now() - w0) };
  ph.clear('test'); clearFoes();
  // 打坐：dt = 0 不吸收
  fresh(); G.startMeditate('free'); run([], 0.5);
  const q0 = P.qi; A.tick(0, 600, false); out.meditate = { qi: [r3(q0), r3(P.qi)] }; G.endMeditate(true);
  // 聚气：dt = 0 不前进
  fresh(); P.debugSetLevel(21, { qi: totalNeed(21) + 1 }); run([], ASCEND.calm + 0.2); G.startAscend(); run([], 1.0);
  const a0 = P.asc ? r3(P.asc.t) : null; A.tick(0, 600, false); out.ascend = { t: [a0, P.asc ? r3(P.asc.t) : null], level: P.level };
  G.cancelAscend('test'); P.debugSetLevel(21, { qi: 0 });
  out.pausedNow = A.paused();
  fresh();
  return out;
}

// =====================================================================================
// 帧率一致：30 / 60 / 144 帧下同一次凤翔天击（同样的瞄准）的飞行、火带、撞击点，以及站在印记里 5 秒的治疗
// =====================================================================================
export function fpsRun() {
  const A = Q(), ph = A.phoenix, C = A.combat, out = [];
  for (const fps of [30, 60, 144]) {
    ringSpot(); clearFoes(); ph.resetStats();
    const r = strikeOnce(0.25, { dt: 1 / fps, steer: true });
    const seal = ph.zones.find((z) => z.kind === 'seal');
    const row = { fps, life: r.end?.life, impact: r.impact?.at, bands: ph.zones.filter((z) => z.kind === 'band').length, seal: !!seal };
    if (seal) {
      A.player.place(seal.c.x, seal.c.z, Math.PI, ph.groundUnder(seal.c.x, seal.c.z, seal.c.y + 1));
      C.noRegen = true; C.playerUnit.hp = 40;
      const s0 = { ...ph.stats };
      run([], 5, null, 1 / fps);
      row.healTicks = ph.stats.healTicks - s0.healTicks; row.healed = r2(ph.stats.healEff - s0.healEff);
      C.noRegen = false;
    }
    out.push(row);
    ph.clear('test');
  }
  fresh();
  return out;
}

// =====================================================================================
// 施法快照：放出之后升级、换装不改这一只凤凰与它的火；下一次施法才按新的
// =====================================================================================
export function snapshotRun() {
  const A = Q(), ph = A.phoenix, P = A.prog, M = A.moves, out = {};
  P.debugSetLevel(21, { qi: 0 }); P.setEquip({});
  ringSpot(); const undo = fixRand(0.99);
  foes([['elite', 9, 0]], { hp: 3000 });
  A.cam.pitch = 0.3; M.cools.phoenix = 0; M.mp = M.mpMax; ph.mode = 'strike'; M.press('phoenix', true); untilLaunch(0.05);
  P.debugSetLevel(40, { qi: 0 }); P.setEquip({ dmgMul: 1.5 });              // 放出之后：升到 40 级、换上 +50% 的装备
  run([], 4, () => !!ph.bird);
  const imp = ph.events.find((e) => e.kind === 'impact');
  out.afterCast = { castL: ph.events.find((e) => e.kind === 'cast')?.L, main: imp?.main, expect: PHOENIX.dBase * PHOENIX.strike.hit.main };
  // 下一次：按 40 级 + 装备：120 × 8^(19/78) × 1.5；精英 24 级（金丹）低于元婴 → ×2
  ringSpot(); foes([['elite', 9, 0]], { hp: 3000 });
  const r = strikeOnce(0.3);
  out.nextCast = { dCast: r.cast?.dCast, main: r.impact?.main, expect: r2(PHOENIX.dBase * statMul('dmg', 40) * 1.5 * PHOENIX.strike.hit.main * PHOENIX.lowRealmK) };
  // 反击窗口里施法：第二十二轮起反击强化只给普攻与拔刀斩，快照里的临时增伤应为 1
  P.setEquip({}); P.debugSetLevel(21, { qi: 0 });
  ringSpot(); clearFoes();
  M.counterUntil = M.time + 2;
  const s = ph.snapshot();
  out.counterWindow = { dCast: r2(s.dCast), k: s.k };
  M.counterUntil = 0;
  undo(); clearFoes(); fresh();
  return out;
}

// =====================================================================================
// 补测：飞行中主人照常行动；地图硬边界；火带采样（悬停、树冠、屋顶）；完整清理；第五十层火中久站
// =====================================================================================
// 凤翔天击飞行中：W 按镜头水平朝向走（镜头俯仰不让人升降）、跳、闪身、举剑格挡都照常；凤凰照飞
export function actRun() {
  const A = Q(), ph = A.phoenix, M = A.moves, P = A.player, C = A.combat, out = {};
  ringSpot(9); clearFoes();
  A.cam.pitch = -0.6;                                   // 镜头朝上看（凤凰往上飞）：W 仍只在水平面上走
  M.cools.phoenix = 0; M.mp = M.mpMax; ph.mode = 'strike'; M.press('phoenix', true); untilLaunch(0.1);
  const p0 = P.pos.clone(), y0 = P.pos.y, fwd = A.cam.forward();
  A.input.keys.add('KeyW'); run([], 0.6); A.input.keys.clear();
  const moved = P.pos.clone().sub(p0);
  out.walk = { bird: ph.bird?.phase, metres: r2(Math.hypot(moved.x, moved.z)), alongCamYaw: r3((moved.x * fwd.x + moved.z * fwd.z) / Math.max(1e-6, Math.hypot(fwd.x, fwd.z) * Math.hypot(moved.x, moved.z))), dy: r2(P.pos.y - y0), camPitchDeg: r1(A.cam.pitch * 180 / Math.PI) };
  let air = false;
  A.input.pressed.add('Space'); run([], 0.4, () => { if (!P.onGround) air = true; }); run([], 0.6);         // 跳跃按「按下」触发（input.take）
  out.jump = { leftGround: air, bird: ph.bird?.phase };
  M.press('dodge', true); run([], 0.1); out.dodge = { act: M.act?.key || null, bird: ph.bird?.phase }; run([], 0.6);
  C.setGuard(true); run([], 0.25); out.guard = { guarding: M.guarding, bird: ph.bird?.phase, ownsLMB: ph.ownsLMB() }; C.setGuard(false);
  ph.clear('test'); fresh();
  return out;
}
// 越过地图硬边界（宗门核心范围之外）：在边界内终止飞行并消散，不访问不存在的碰撞数据
export function boundsRun() {
  const A = Q(), ph = A.phoenix, M = A.moves, T = A.terrain, out = {};
  // 山门外往南（+z）：核心范围南界 z = 180
  fresh(0, { x: 0, z: 150 }); clearFoes();
  A.cam.set(0, -0.12, 7);
  M.cools.phoenix = 0; M.mp = M.mpMax; ph.mode = 'strike'; M.press('phoenix', true); untilLaunch(0.05);
  const n0 = ph.events[0];
  let last = null;
  run([], 6, () => { if (ph.bird && ph.bird.phase !== 'dissolve') last = ph.bird.pos.clone(); if (!ph.bird) return false; });
  const fresh2 = ph.events.slice(0, Math.max(0, ph.events.indexOf(n0)));
  const ev = fresh2.find((e) => e.kind === 'bounds'), end = fresh2.find((e) => e.kind === 'end');
  out.south = { end: end?.reason, at: ev?.at, inCore: last ? T.inCore(last.x, last.z, 2) : null, lastZ: last ? r1(last.z) : null, coreEdgeZ: 180 };
  ph.clear('test'); fresh();
  return out;
}
// 火带采样：近乎垂直上升（落点不变）不重复堆；路径正下方是树冠、殿阁屋顶时不投火（也不往下穿到地面）
export function sampleRun() {
  const A = Q(), ph = A.phoenix, M = A.moves, W = A.combat.world, out = {};
  // 1. 垂直上升：镜头抬到 −80°，按住左键
  ringSpot(); clearFoes();
  A.cam.pitch = -1.39;
  M.cools.phoenix = 0; M.mp = M.mpMax; ph.mode = 'strike'; M.press('phoenix', true); untilLaunch(0);
  A.game.pointer.setAttack(false); A.game.pointer.setAttack(true);
  const b0 = ph.stats.bands; let maxH = 0;
  run([], 1.2, () => { const b = ph.bird; if (!b) return false; maxH = Math.max(maxH, b.pos.y - RING.y); A.cam.pitch = -1.39; });
  out.climb = { bands: ph.stats.bands - b0, height: r1(maxH), pitchDeg: ph.bird ? r1(Math.asin(ph.bird.dir.y) * 180 / Math.PI) : null };
  A.game.pointer.setAttack(false); ph.clear('test');
  // 2. 树冠、屋顶：在宗门里找一棵树（不可承载的圆柱）与一处殿阁屋檐，从其上方 3 米往下探
  const P = A.player.pos;
  let tree = null, roof = null;
  W.cw.query(P.x - 160, P.z - 160, P.x + 160, P.z + 160, (c) => {
    if (!tree && c.type === 1 && !c.walk && c.y1 - c.y0 > 3) tree = c;
    if (!roof && c.type === 0 && (c.kind === 'eave' || c.kind === 'body') && c.hx > 1.5 && c.hz > 1.5) roof = c;
  });
  const probe = (c) => { if (!c) return null; const s = ph.surfaceBelow(c.x, c.y1 + 3, c.z, PHOENIX.strike.band.rayDown); return { at: [r1(c.x), r1(c.y1), r1(c.z)], kind: s?.kind, valid: s?.valid, why: s?.why, y: s ? r2(s.y) : null, ground: r2(A.terrain.heightAt(c.x, c.z)) }; };
  out.tree = probe(tree); out.roof = probe(roof);
  fresh();
  return out;
}
// 完整清理：主人力竭、换场景时，凤凰、火焰、印记、仇恨、左键接管一并清掉
export async function cleanupRun() {
  const A = Q(), ph = A.phoenix, M = A.moves, C = A.combat, G = A.game, out = {};
  const state = () => ({ bird: !!ph.bird, zones: ph.zones.length, units: A.phoenixFx.activeUnits(), ownsLMB: ph.ownsLMB(), camRange: A.cam.pitchRange ? 'set' : null, allies: C.allies.length, aggro: C.enemies.filter((e) => e._ph).length });
  const castInFlight = () => { ringSpot(); clearFoes(); const [e] = foes([['shade', 9, 2]], { hp: 900 }); ph.aggro(e).v = 60; A.cam.pitch = -0.05; M.cools.phoenix = 0; M.mp = M.mpMax; ph.mode = 'strike'; M.press('phoenix', true); untilLaunch(0.4); ph.addSeal(ph.bird, A.player.pos.clone()); };
  // 1. 力竭
  castInFlight(); out.deathBefore = state();
  C.playerDown(C.playerUnit); out.deathAfter = state();
  for (let i = 0; i < 40 && G.lock; i++) await new Promise((r) => setTimeout(r, 250));
  B.tick(10, 1 / 60, false);
  // 2. 换场景（进丹房再出来）
  await arena(); castInFlight(); out.sceneBefore = state();
  await G.switchWorld('alchemy'); B.tick(5, 1 / 60, false); out.sceneAfter = state();
  await G.switchWorld('surface'); B.tick(5, 1 / 60, false);
  await arena();
  return out;
}
// 第五十层：主人在自己的火里站 20 秒、龙君照常出招（不举剑、不闪）——有效治疗、溢出、火里受的伤、龙君出了哪些招；对照：同样 20 秒不在火里
export async function bossCampRun({ secs = 20 } = {}) {
  const A = Q(), F = A.boss50, ph = A.phoenix, P = A.prog, M = A.moves, C = A.combat, U = C.playerUnit, out = {};
  const B16 = await import('/tools/r16_boss_bot.js');
  if (A.world.name !== 'boss50') { await A.game.towerRoom.enter(); B.tick(30, 1 / 60, false); await F.enter(); B.tick(60, 1 / 60, false); }
  if (F.state === 'dormant') { F.debug.start(); B.tick(30, 1 / 60, false); F.debug.skip(); B.tick(90, 1 / 60, false); }
  P.debugSetLevel(21, { qi: 0 });
  const { MOVES50 } = await import('/src/game/boss50Moves.js');
  const idOf = new Map(Object.entries(MOVES50).map(([k, v]) => [v, k]));
  const moves = () => { const used = {}; const keep = F.startMove; F.startMove = function (def) { const id = idOf.get(def) || def.name; used[id] = (used[id] || 0) + 1; return keep.call(this, def); }; return { used, undo: () => { F.startMove = keep; } }; };
  // 上一轮倒下了：按重试回到开战（龙君与玩家复原）
  const ensureFight = () => { if (F.state === 'fight') return; F.resetFight(); B.tick(5, 1 / 60, false); F.debug.start(); B.tick(30, 1 / 60, false); F.debug.skip(); B.tick(90, 1 / 60, false); };
  const camp = async (inFire) => {
    ensureFight();
    ph.clear('test'); ph.resetStats(); M.cools.phoenix = 0; M.mp = M.mpMax;
    B16.stage({ d: 6 }); F.B.gapT = 0.6;
    U.hp = U.maxHp; U.alive = true;
    if (inFire) {
      // 脚下砸一枚凤焰印（凤翔天击朝脚前俯冲撞地）
      A.cam.set(A.player.heading + Math.PI, 0.9, 6); ph.mode = 'strike'; M.press('phoenix', true);
      untilLaunch(0); run([], 2.5, () => { if (!ph.bird) return false; });
      const seal = ph.zones.find((z) => z.kind === 'seal');
      if (seal) A.player.place(seal.c.x, seal.c.z, A.player.heading, seal.c.y);
    }
    const hp0 = U.hp, rec = moves(), s0 = { ...ph.stats };
    let down = 0, minHp = U.hp, taken = 0;
    const L = (e) => { if (e.target === U && e.amount > 0) taken += e.amount; };
    C.hitListeners.add(L);
    let t = 0;
    run([], secs, (tt) => { t = tt; minHp = Math.min(minHp, U.hp); if (!U.alive) { down++; return false; } });
    C.hitListeners.delete(L); rec.undo();
    return { inFire, secs: r2(t), startHp: r1(hp0), endHp: r1(U.hp), minHp: r1(minHp), down, taken: r1(taken), fireStay: r2(ph.stats.fireStay - (s0.fireStay || 0)), fireTaken: r1(ph.stats.fireTaken - (s0.fireTaken || 0)), healTheory: r1(ph.stats.healTheory - (s0.healTheory || 0)), healEff: r1(ph.stats.healEff - (s0.healEff || 0)), healOver: r1(ph.stats.healOver - (s0.healOver || 0)), campSecs: r2(ph.campSecs()), moves: rec.used };
  };
  out.inFire = await camp(true);
  out.noFire = await camp(false);
  ph.clear('test');
  return out;
}

// =====================================================================================
// 整套（第五十层的两项 bossStageRun / campRun 要进殿，另跑）：按顺序跑完，返回各项结果
// 用法：setTimeout(() => window.__all = T.runAll(), 0)；后台标签页里约两三分钟
// =====================================================================================
export function runAll() {
  const out = {}, t0 = performance.now(), A = Q();
  skyQuiet(true);
  const steps = [
    ['paceTable', () => paceTable()],
    ['meditate', () => [meditateRun({ L: 21, fps: 30 }), meditateRun({ L: 21, fps: 60 }), meditateRun({ L: 21, fps: 144 }), meditateRun({ L: 55 }), meditateRun({ L: 98 }), meditateRun({ L: 21, spot: 'array', secs: 20 }), meditateRun({ L: 21, spot: 'free', secs: 20 })]],
    ['meditateBreak', () => meditateBreak()], ['rewards', () => rewardsRun()], ['ascend', () => ascendRun()], ['cap', () => capRun()],
    ['equip', () => equipRun(1000)], ['migrate', () => migrateRun()], ['flight', () => flightRun()],
    ['lmb', () => lmbRun()], ['steer', () => steerRun()], ['strike', () => strikeRun()], ['stage', () => stageRun()], ['zone', () => zoneRun()],
    ['parry', () => parryRun()], ['guard', () => guardRun()], ['aggroFlicker', () => aggroFlickerRun()], ['budget', () => budgetRun()],
    ['pause', () => pauseRun()], ['fps', () => fpsRun()], ['snapshot', () => snapshotRun()],
  ];
  for (const [k, f] of steps) {
    const s0 = performance.now();
    try { out[k] = f(); } catch (e) { out[k] = { err: String(e), stack: e.stack }; }
    (out._ms ||= {})[k] = Math.round(performance.now() - s0);
  }
  A.prog.debugSetLevel(21, { qi: 0 });
  out._total = Math.round((performance.now() - t0) / 1000);
  return out;
}
