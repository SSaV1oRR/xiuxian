// 第二十四轮自检：通天塔第三十层 · 烬狱剑尊。都按真实的输入、出招、结算、特效代码推进（__qinglan.tick），不另写一套。
// 用法（预览）：const T = await import('/tools/r24_tests.js?v=' + Date.now()); await T.setup();
import * as B from './r17_combat_bot.js';
import { CONFIG30 as CFG, COMBOS30, COMBO_ORDER, FIRE30, BOSS30 } from '/src/game/boss30Config.js';
import { comboMove, fireMove, ultMove, specialMove } from '/src/game/boss30Moves.js';
import { T30 } from '/src/world/tower30.js';

const Q = () => window.__qinglan;
const F = () => Q().game.boss30;
const r2 = (v) => +(+v).toFixed(2), r3 = (v) => +(+v).toFixed(3);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function tick(secs, each = null, dt = 1 / 60, draw = false) {
  const A = Q();
  let t = 0;
  for (let i = 0; i < Math.round(secs / dt); i++) { A.tick(dt, 1, draw && i === Math.round(secs / dt) - 1); t += dt; if (each && each(t) === false) break; }
  return t;
}

// 进入第三十层（已在场景里就复原），过场强制可跳过；ai：剑尊的 AI 开关
export async function setup({ ai = false, skipIntro = true } = {}) {
  await B.setup();
  const A = Q();
  B.quietDragons?.(true);
  A.prog.debugSetLevel?.(21, { qi: 0 });
  document.querySelector('#pause-hint')?.style.setProperty('display', 'none');
  if (!F().active) await F().enter();
  else await F().retry(true);
  F().cine.forceSkip = true;
  document.querySelector('#b30-debug')?.style.setProperty('display', 'none');
  if (skipIntro) await fight({ ai });
  return { world: A.world.name, state: F().state };
}
// 开战并跳过出场（直接提交出场的最终状态）
export async function fight({ ai = false, at = { x: 0, z: 4 } } = {}) {
  const A = Q(), f = F();
  if (A.ui.panelOpen) A.ui.closePanel();
  for (let i = 0; i < 20 && f.busy; i++) await sleep(120);
  if (f.state !== 'dormant') await f.retry(true);                    // 战斗中、过场中、结算后……一律复原到未触发
  if (f.state === 'dormant') { f.debug.start(); tick(0.4); f.cine.skip(); tick(0.1); }
  f.debug.ai(ai); f.debugUsed = false;
  place(at.x, at.z);
  return f.state;
}
// 玩家站到某处、面朝剑尊
export function place(x, z) {
  const A = Q(), f = F(), P = A.player;
  const yaw = Math.atan2(f.root.x - x, f.root.z - z);
  P.place(x, z, yaw, 0); P.heading = yaw; P.vel.set(0, 0, 0);
  A.cam.set(yaw, 0.18, 6); A.cam.snap(P.pos.clone().setY(1.55));
  A.combat.playerUnit.hp = A.combat.playerUnit.maxHp; A.combat.playerUnit.alive = true; A.combat.playerUnit.invuln = 0;
  A.moves.reset(); A.moves.iframes = 0;
}
// 自由机位对着剑尊（看模型、拍照）
export function bossCam({ dist = 4.2, side = 1.0, up = 1.5, at = 1.25 } = {}) {
  const A = Q(), f = F(), T = A.THREE, b = f.root.clone(), yaw = f.rig.yaw;
  const fw = new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), rt = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  A.game.freeCam = { pos: b.clone().addScaledVector(fw, dist).addScaledVector(rt, side).add(new T.Vector3(0, up, 0)), at: b.clone().add(new T.Vector3(0, at, 0)) };
}
export function freeCamOff() { Q().game.freeCam = null; }
export function info() { return F().debug.info(); }
export function shaderErrors() {
  const r = Q().renderer, out = [];
  for (const p of r.info.programs || []) if (p.diagnostics && !p.diagnostics.runnable) out.push({ name: p.name, fs: p.diagnostics.fragmentShader?.log?.slice(0, 300), vs: p.diagnostics.vertexShader?.log?.slice(0, 300) });
  return out;
}
export { COMBOS30, COMBO_ORDER, FIRE30, BOSS30, CFG, T30, comboMove, fireMove, ultMove, specialMove, r2, r3 };

// =====================================================================================
// 节奏：放一套连招（AI 关、玩家站在剑能扫到的地方、无伤），按真实的出手段量前摇、间隔、收招
// =====================================================================================
const RANGE = { F: [0.35, 0.5], S: [1.0, 1.5], gapF: [0.25, 0.4], gapS: [0.75, 1.2], rec: [0.8, 1.0] };
export function rhythmOf(id, { dist = 2.1, god = true, secs = 9, dt = 1 / 60, phase = 1 } = {}) {
  const f = freshBoss(), A = Q();
  if (f.phase !== phase) f.debug.phase(phase);
  const b = f.root, yaw = f.rig.yaw;
  place(b.x + Math.sin(yaw) * dist, b.z + Math.cos(yaw) * dist);
  f.god = god;
  const before = (f.moveLog || []).length;
  f.debug.move(id);
  tick(secs, () => !(f.B.mode !== 'move' && (f.moveLog || []).length > before), dt);
  f.god = false;
  const L = f.moveLog[f.moveLog.length - 1];
  if (!L || L.id !== id) return { id, error: 'no log' };
  const def = COMBOS30[id], letters = def.rhythm.split('');
  const logs = L.logs.filter((x) => x.on != null);
  const windup = logs.length ? r3(logs[0].on - L.t0) : null;
  const gaps = logs.slice(1).map((x, i) => r3(x.on - logs[i].off));
  const recovery = logs.length ? r3(L.t1 - logs[logs.length - 1].off) : null;
  const checks = [];
  checks.push(['windup', windup, RANGE[letters[0]]]);
  gaps.forEach((g, i) => checks.push([`gap${i + 1}`, g, letters[i + 1] === 'F' ? RANGE.gapF : RANGE.gapS]));
  const rk = phase === 2 ? CFG.p2.recover : 1;                      // 二阶段常规恢复缩短 15%
  if (letters.length >= 3) checks.push(['recovery', recovery, (id === 'A10' ? [0.95, 1.08] : RANGE.rec).map((v) => v * rk)]);
  const bad = checks.filter(([, v, [lo, hi]]) => v == null || v < lo - 0.02 || v > hi + 0.02).map(([k, v, rng]) => `${k}=${v} ∉ [${rng}]`);
  return { id, phase, name: def.name, rhythm: def.rhythm, hits: logs.length, results: logs.map((x) => x.res || 'miss'), windup, gaps, recovery, ok: bad.length === 0 && logs.length === letters.length, bad };
}
export function rhythmAll(phase = 1) { return COMBO_ORDER.map((id) => rhythmOf(id, { phase })); }
// 调试：放一招，每 0.1 秒记一次状态（模式、动作、动作时刻、段）
export function traceMove(id, { secs = 6, dist = 2.1 } = {}) {
  const f = F();
  f.cancelMove(true); f.setMode('idle'); f.hitchT = 0;
  const b = f.root, yaw = f.rig.yaw;
  place(b.x + Math.sin(yaw) * dist, b.z + Math.cos(yaw) * dist);
  f.god = true;
  f.debug.move(id);
  const out = []; let k = 0;
  tick(secs, (t) => { if (++k % 6 === 0) out.push(`${t.toFixed(2)} ${f.B.mode} ${f.rig.name}@${f.rig.t.toFixed(3)} s${f.M?.si ?? '-'} ${f.M?.id ?? ''}`); });
  f.god = false;
  return out;
}
// 调试：放一招，出手段里逐帧记剑身与玩家身体（竖直胶囊）的最近距离、剑尊到玩家的距离与朝向偏角
export async function reachOf(id, { dist = 2.1, secs = 7 } = {}) {
  const f = F(), A = Q(), P = A.player;
  const { segSeg } = await import('/src/actors/boss30.js');
  f.cancelMove(true); f.setMode('idle'); f.hitchT = 0;
  const b = f.root, yaw = f.rig.yaw;
  place(b.x + Math.sin(yaw) * dist, b.z + Math.cos(yaw) * dist);
  f.god = true;
  f.debug.move(id);
  const rec = {};
  tick(secs, () => {
    const M = f.M; if (!M) return f.B.mode === 'move';
    const c = f.rig.cur, S = M.seg;
    for (const h of S.hits || []) {
      if (c.t < h.t[0] || c.t > h.t[1]) continue;
      const a = new A.THREE.Vector3(P.pos.x, P.pos.y + 0.15, P.pos.z), bb = new A.THREE.Vector3(P.pos.x, P.pos.y + 1.85, P.pos.z);
      const q = segSeg(f.rig.swordGrip, f.rig.swordTip, a, bb);
      const R = rec[h.key] ||= { min: 99, d: [], ang: [], tipY: [] };
      R.min = Math.min(R.min, q.d);
      const rel = f.playerRel(P.pos);
      R.d.push(r2(rel.d)); R.ang.push(Math.round(rel.a * 57.3)); R.tipY.push(r2(f.rig.swordTip.y));
    }
    return true;
  });
  f.god = false;
  for (const k in rec) { const R = rec[k]; R.min = r2(R.min); R.d = [R.d[0], R.d[R.d.length - 1]]; R.ang = [R.ang[0], R.ang[R.ang.length - 1]]; R.tipY = [Math.min(...R.tipY), Math.max(...R.tipY)]; }
  return rec;
}

// =====================================================================================
// 弹反：先空跑一遍记下每一击真正碰到玩家的时刻，再重放一遍、在第 k 击碰到前 0.08 秒按下格挡（新按下才开 0.18 秒弹反窗口）
// =====================================================================================
// 剑尊回到台心附近、面朝南（多次测试之后不会漂到台边）
export function freshBoss({ center = true } = {}) { const f = F(); f.cancelMove(true); f.setMode('idle'); f.hitchT = 0; f.posture = 0; f.postureT = 0; f.clearHazards(); f.fx.clear(); if (center) { f.root.set(0, 0, -4); f.rig.setYaw(0); } return f; }
export function contacts(id, dist) {
  const f = freshBoss(), A = Q(), b = f.root, yaw = f.rig.yaw, x0 = b.x, z0 = b.z;
  place(x0 + Math.sin(yaw) * dist, z0 + Math.cos(yaw) * dist);
  f.god = true;
  const t0 = f.time, n0 = f.traceN || 0;
  f.debug.move(id);
  tick(8, () => f.B.mode === 'move');
  f.god = false;
  const hits = {};
  for (const e of f.since(n0)) if (e.type === 'hit' && e.id === id && hits[e.key] == null) hits[e.key] = r3(e.t - t0);
  f.root.set(x0, 0, z0); f.rig.setYaw(yaw);
  return hits;
}
export function parryAt(id, k, { dist = 1.9, lead = 0.08 } = {}) {
  const A = Q(), C = A.combat, f = F();
  const hits = contacts(id, dist), keys = COMBOS30[id].segs.flatMap((s) => (s.hits || []).map((h) => h.key));
  if (hits[keys[k]] == null) return { id, k, error: 'no contact', hits };
  const at = hits[keys[k]] - lead;
  freshBoss(); f.toIdle(9);
  const b = f.root, yaw = f.rig.yaw;
  place(b.x + Math.sin(yaw) * dist, b.z + Math.cos(yaw) * dist);
  C.playerUnit.maxHp = C.playerUnit.hp = 9999;
  const n0 = f.traceN || 0, p0 = f.posture, t0 = f.time;
  f.debug.move(id);
  f.god = true;                                       // 之前的各击不伤人（不击退、不打乱站位），到第 k 击才真打
  let pressed = false, rel = null;
  const modes = [];
  tick(7, (t) => {
    if (!pressed && t >= at) { pressed = true; f.god = false; C.setGuard(true); rel = t + 0.25; }
    if (rel != null && t >= rel) { C.setGuard(false); rel = null; }
    if (!modes.length || modes[modes.length - 1][1] !== f.B.mode) modes.push([r2(t), f.B.mode]);
    return f.B.mode === 'move' || f.B.mode === 'recoil' || t < at + 0.3;
  });
  C.setGuard(false); f.god = false;
  const ev = f.since(n0).filter((e) => ['parried', 'hitch', 'hit', 'mode', 'break', 'end'].includes(e.type)).map((e) => `${r2(e.t - t0)} ${e.type}${e.key ? ':' + e.key : ''}${e.res ? '=' + e.res : ''}${e.mode ? '>' + e.mode : ''}${e.posture != null ? ' p' + e.posture : ''}`);
  C.playerUnit.maxHp = C.playerUnit.hp = 160;
  const parried = f.since(n0).find((e) => e.type === 'parried');
  const hitched = f.since(n0).some((e) => e.type === 'hitch');
  const recoil = modes.find((m) => m[1] === 'recoil');
  return { id, k, key: keys[k], parried: !!parried, outcome: hitched ? 'hitch' : recoil ? 'recoil' : parried ? 'other' : 'none', posture: [p0, Math.round(f.posture)], modes, ev };
}
// 弹反规则表：每套的每一击各弹一次——中途的一顿 0.15 秒、收招的一击（或「任一即收」的那套）完整收势
export function parryTable() {
  const out = [];
  for (const id of COMBO_ORDER) {
    const n = COMBOS30[id].rhythm.length;
    for (let k = 0; k < n; k++) {
      const r = parryAt(id, k);
      const want = COMBOS30[id].parry === 'any' || k === n - 1 ? 'recoil' : 'hitch';
      out.push({ id, k, want, got: r.outcome, ok: r.outcome === want, posture: r.posture, err: r.error });
    }
  }
  return out;
}
// 被弹反后的一顿：时间轴确实停了 0.15 秒（动作时刻不走、之后不追帧）
export function hitchRun() {
  const f = F(), C = Q().combat;
  const hits = contacts('A03', 1.9), at = hits.h1 - 0.08;
  freshBoss(); f.toIdle(9);
  const b = f.root, yaw = f.rig.yaw;
  place(b.x + Math.sin(yaw) * 1.9, b.z + Math.cos(yaw) * 1.9);
  C.playerUnit.maxHp = C.playerUnit.hp = 9999;
  f.debug.move('A03');
  let pressed = false; const samples = [];
  tick(1.6, (t) => {
    if (!pressed && t >= at) { pressed = true; C.setGuard(true); }
    if (pressed && t > at + 0.25) C.setGuard(false);
    if (f.hitchT > 0 || samples.length && samples[samples.length - 1].h > 0) samples.push({ t: r3(t), h: r3(f.hitchT), clip: f.rig.name, ct: r3(f.rig.t) });
    return f.B.mode === 'move';
  });
  C.setGuard(false); C.playerUnit.maxHp = C.playerUnit.hp = 160;
  const frozen = samples.filter((s) => s.h > 0);
  const cts = new Set(frozen.map((s) => s.ct));
  return { frames: frozen.length, secs: r3(frozen.length / 60), clipTimeDuring: [...cts], after: samples.slice(frozen.length, frozen.length + 3) };
}
// 架势崩溃：二阶段 2.0 / 一阶段 2.4 秒；崩溃中再满架势不叠加；结束后架势归零
export function breakRun(phase = 1) {
  const f = freshBoss();
  if (f.phase !== phase) f.debug.phase(phase);
  const t0 = f.time;
  f.posture = 100; f.postureBreak();
  const clips = [];
  tick(3.2, (t) => { if (!clips.length || clips[clips.length - 1][1] !== f.rig.name) clips.push([r2(t), f.rig.name]); if (t > 0.5 && t < 0.6) f.postureBreak(); return f.B.mode === 'break' || t < 0.1; });
  const dur = r2(f.time - t0);
  return { phase: f.phase, dur, want: phase === 2 ? CFG.posture.break.p2 : CFG.posture.break.p1, clips, postureAfter: Math.round(f.posture), mode: f.B.mode };
}

// =====================================================================================
// 截锋架势：准备 0.35 → 窗口 0.18 → 空架 0.6；窗口里正面的真实近战被截住（不掉血），随后一记 0.45 秒准备的反击（可闪、可挡、可弹）
// =====================================================================================
function hitResults(fn) {
  const C = Q().combat, out = [];
  const L = (e) => out.push({ t: r3(F().time), tgt: e.target === C.playerUnit ? 'player' : e.target?.id || e.target?.kind, result: e.result, amount: r2(e.amount || 0), kind: e.kind });
  C.hitListeners.add(L);
  try { fn(); } finally { C.hitListeners.delete(L); }
  return out;
}
// how：'front' 正面普攻 / 'back' 背后普攻 / 'qi' 剑气 / 'none' 不出手；counter：'dodge' | 'parry' | 'none'（反击来时怎么应对）
export function guardRun({ how = 'front', counter = 'none', pressAt = 0.17, counterAt = null } = {}) {
  // 弹反反击：先空跑一遍量出反击真正碰到人的时刻（截住之后多久），再在那之前 0.08 秒按下格挡
  if (counter === 'parry' && counterAt == null) { const dry = guardRun({ how, counter: 'none', pressAt }); const d = dry.ev.find((e) => e.includes('deflect')), h = dry.ev.find((e) => e.includes('hit:counter')); if (!d || !h) return { error: 'dry', dry }; counterAt = parseFloat(h) - parseFloat(d); }
  const f = freshBoss(), A = Q(), M = A.moves, C = A.combat;
  f.cd.guard = 0;
  const b = f.root, yaw = f.rig.yaw, dist = 2.2;
  const s = how === 'back' ? -1 : 1;
  place(b.x + Math.sin(yaw) * dist * s, b.z + Math.cos(yaw) * dist * s);
  C.playerUnit.maxHp = C.playerUnit.hp = 9999;
  M.loadout?.debugSet?.(['qi', 'heavy', 'power', 'ult', 'seal', 'phoenix']);
  const hp0 = f.unit.hp, n0 = f.traceN || 0, t0 = f.time;
  f.debug.guard();
  let pressed = false, cAt = null, cDone = false;
  const res = hitResults(() => tick(3.2, (t) => {
    if (!pressed && t >= pressAt) { pressed = true; if (how === 'front' || how === 'back') { M.press('light', true); M.press('light', false); } else if (how === 'qi') { M.cools.qi = 0; M.mp = M.mpMax; M.press('qi', true); } }
    // 反击：出手段开前 0.1 秒闪身，或开窗格挡
    const Mv = f.M;
    if (!cDone && Mv?.id === 'counter') {
      const c = f.rig.cur, h = Mv.seg.hits[0];
      if (counter === 'dodge' && cAt == null && c.t >= h.t[0] - 0.09) { cAt = r3(t); cDone = true; M.press('dodge', true); }
      if (counter === 'parry' && cAt == null && Mv.t0 != null && f.time - Mv.t0 >= counterAt - 0.08) { cAt = r3(t); cDone = true; C.setGuard(true); }
    }
    if (cDone && counter === 'parry' && t > cAt + 0.3) C.setGuard(false);
    return true;
  }));
  C.setGuard(false);
  const ev = f.since(n0).filter((e) => ['guard', 'deflect', 'guardWhiff', 'move', 'hit', 'parried', 'mode'].includes(e.type)).map((e) => `${r2(e.t - t0)} ${e.type}${e.id ? ':' + e.id : ''}${e.key ? ':' + e.key : ''}${e.res ? '=' + e.res : ''}${e.mode ? '>' + e.mode : ''}`);
  C.playerUnit.maxHp = C.playerUnit.hp = 160;
  return { how, counter, bossDmg: r2(hp0 - f.unit.hp), deflect: ev.some((e) => e.includes('deflect')), counterMove: ev.some((e) => e.includes('move:counter')), counterRes: (ev.find((e) => e.includes('hit:counter')) || '').split('=')[1] || null, ev, hits: res.filter((r) => r.tgt === 'player' || r.tgt === 'boss30').slice(0, 6) };
}

// =====================================================================================
// 留锋突刺：玩家真实的后撤闪身（远离、3–10 米、路径合法、冷却好了、剑尊空闲）→ 必定触发；不排队、不打断剑尊当前的招
// =====================================================================================
// dist：开始时离剑尊多远；key：闪身时按住的方向键（null 向后；'KeyW' 向前…）；busy：先让剑尊出一套连招；after：落地后按住的方向键（躲突刺）
export function rollRun({ dist = 5, key = null, busy = null, after = null, twice = false, phase = null, dt = 1 / 60 } = {}) {
  const f = freshBoss(), A = Q(), M = A.moves, I = A.input, C = A.combat;
  if (phase === 2 && f.phase !== 2) f.debug.phase(2);
  if (phase === 1 && f.phase !== 1) f.debug.phase(1);
  f.cd.roll = 0;
  const b = f.root, yaw = f.rig.yaw;
  place(b.x + Math.sin(yaw) * dist, b.z + Math.cos(yaw) * dist);
  C.playerUnit.maxHp = C.playerUnit.hp = 9999;
  const n0 = f.traceN || 0, t0 = f.time;
  if (busy) { f.debug.move(busy); tick(0.3); }
  const busyId = f.M?.id || null;
  I.keys.clear(); if (key) I.keys.add(key);
  M.cools.dodge = 0; M.press('dodge', true);
  tick(0.05, null, dt); I.keys.clear();
  if (after) { tick(0.45, null, dt); I.keys.add(after); }
  let second = null;
  tick(2.6, (t) => { if (twice && second == null && t > 1.4) { second = true; M.cools.dodge = 0; M.press('dodge', true); } return true; }, dt);
  I.keys.clear();
  C.playerUnit.maxHp = C.playerUnit.hp = 160;
  const ev = f.since(n0);
  const pick = (type) => ev.filter((e) => e.type === type);
  const evt = pick('dodgeEvt');
  return {
    dist, key, busy, why: evt.map((e) => e.why), triggered: pick('roll').length,
    lockAt: pick('rollLock').map((e) => r2(e.t - t0)), dashAt: pick('rollDash').map((e) => r2(e.t - t0)), dashLen: pick('rollDash').map((e) => e.len),
    hit: ev.filter((e) => e.type === 'hit' && e.id === 'roll').map((e) => e.res), busyKept: busyId ? ev.some((e) => e.type === 'end' && e.id === busyId && !e.interrupted) : null,
    zones: f.zones.length, pred: pick('roll').map((e) => e.pred),
  };
}
export function rollTable() {
  return {
    back5: rollRun({ dist: 5, phase: 1 }), back8: rollRun({ dist: 8, phase: 1 }), near: rollRun({ dist: 2.2, phase: 1 }), far: rollRun({ dist: 11.5, phase: 1 }),
    toward: rollRun({ dist: 6, key: 'KeyW', phase: 1 }), side: rollRun({ dist: 5, key: 'KeyA', phase: 1 }), busy: rollRun({ dist: 5, busy: 'A02', phase: 1 }),
    escape: rollRun({ dist: 5, after: 'KeyD', phase: 1 }), twice: rollRun({ dist: 5, twice: true, phase: 1 }), p2trail: rollRun({ dist: 6, phase: 2 }),
  };
}

// =====================================================================================
// 火焰招式：危险物出现的时刻、预警时长、爆发、结果（火不可格挡、不可弹反；闪身无敌或离开范围可避）、安全区、不穿墙
// =====================================================================================
// 逐帧记危险物：种类、出现、火浪开始走、爆发；火柱记下位置
function watchHz(f, t0, rec) {
  for (const h of f.hz) {
    if (h.__w == null) { h.__w = rec.length; rec.push({ kind: h.kind, born: r3(f.time - t0), p: h.p ? [r2(h.p.x), r2(h.p.z)] : null }); }
    const R = rec[h.__w];
    if (h.kind === 'wave') { if (h.wave && R.go == null) R.go = r3(f.time - t0); R.len = r2(h.s); R.L = r2(h.L); }
    if (h.done && R.burst == null) { R.burst = r3(f.time - t0); if (h.p) R.pAtBurst = [r2(h.p.x), r2(h.p.z)]; }
  }
}
// 火浪的前沿离玩家还有多远（沿火浪方向；负值 = 已经过去）
const waveGap = (h, p) => ((p.x - h.o.x) * h.d.x + (p.z - h.o.z) * h.d.z) - h.s;
// id：火焰招式（或剑式）；dist / side：玩家在剑尊身前多远、偏左多少；guard：一直举着格挡；dodge(f, pos, t)：返回 true 的那一刻闪身；
// press：这一刻按下格挡（0.25 秒后松开，弹反）；shift：{ at, dx, dz } 这一刻把玩家挪开；boss：{ x, z, yaw } 剑尊的位置
export function fireRun(id, { dist = 6, side = 0, guard = false, dodge = null, dodgeKey = null, press = null, shift = null, secs = 4.5, phase = null, boss = null, dt = 1 / 60 } = {}) {
  const f = freshBoss(), A = Q(), C = A.combat, M = A.moves, P = A.player;
  const ph = phase ?? FIRE30[id]?.p ?? 1;
  if (ph === 2 && f.phase !== 2) f.debug.phase(2);
  if (ph === 1 && f.phase !== 1) f.debug.phase(1);
  f.cd.fire = {};
  if (boss) { f.root.set(boss.x, 0, boss.z); f.rig.setYaw(boss.yaw ?? 0); }
  const b = f.root, yaw = f.rig.yaw;
  place(b.x + Math.sin(yaw) * dist + Math.cos(yaw) * side, b.z + Math.cos(yaw) * dist - Math.sin(yaw) * side);
  C.playerUnit.maxHp = C.playerUnit.hp = 9999;
  const n0 = f.traceN || 0, t0 = f.time, hz = [];
  let dodged = null, shifted = false, pressed = null, maxR = 0;
  f.debug.move(id);
  const res = hitResults(() => tick(secs, (t) => {
    watchHz(f, t0, hz);
    for (const h of f.hz) if (h.kind === 'wave' && h.wave) maxR = Math.max(maxR, Math.hypot(h.o.x + h.d.x * h.s, h.o.z + h.d.z * h.s));
    if (dodge && dodged == null && dodge(f, P.pos, t)) { dodged = r3(t); if (dodgeKey) A.input.keys.add(dodgeKey); M.cools.dodge = 0; M.press('dodge', true); }
    if (dodgeKey && dodged != null && t > dodged + 0.1) A.input.keys.delete(dodgeKey);
    if (press != null && pressed == null && t >= press) { pressed = r3(t); C.setGuard(true); }
    if (pressed != null && t >= pressed + 0.25) C.setGuard(false);
    if (shift && !shifted && t >= shift.at) { shifted = true; P.pos.x += shift.dx; P.pos.z += shift.dz; }
    if (guard) C.setGuard(true);
    return true;
  }, dt));
  C.setGuard(false);
  C.playerUnit.maxHp = C.playerUnit.hp = 160;
  return {
    id, dist, hz, dodged, pressed, maxR: r2(maxR), zones: f.zones.length,
    hits: res.filter((r) => r.tgt === 'player').map((r) => `${r2(r.t - t0)}:${r.kind}:${r.result}`),
    blade: f.since(n0).filter((e) => e.type === 'hit' && e.id === id).map((e) => `${e.key}=${e.res}`),
  };
}
export function fireTable() {
  const FC = CFG.fire;
  const W = (f, p) => f.hz.some((h) => h.kind === 'wave' && h.wave && waveGap(h, p) > 0 && waveGap(h, p) < 1.2);
  const B = (kind, delay) => (f) => f.hz.some((h) => h.kind === kind && !h.done && h.t >= delay - 0.05);
  return {
    F01_far: fireRun('F01', { dist: 7 }), F01_near: fireRun('F01', { dist: 2 }), F01_guard: fireRun('F01', { dist: 7, guard: true }), F01_dodge: fireRun('F01', { dist: 7, dodge: W, dodgeKey: 'KeyW' }), F01_dodgeBack: fireRun('F01', { dist: 7, dodge: W }),
    F01_wall: fireRun('F01', { dist: 2.5, boss: { x: 0, z: 12, yaw: 0 } }),
    F02_in: fireRun('F02', { dist: 3 }), F02_out: fireRun('F02', { dist: 5 }), F02_guard: fireRun('F02', { dist: 3, guard: true }), F02_dodge: fireRun('F02', { dist: 3, dodge: B('circle', FC.F02.delay) }),
    F04: fireRun('F04', { dist: 7, secs: 6 }),
    F05_inner: fireRun('F05', { dist: 2.2 }), F05_ring: fireRun('F05', { dist: 6 }), F05_outer: fireRun('F05', { dist: 10.5 }), F05_dodge: fireRun('F05', { dist: 6, dodge: B('ring', FC.F05.delay) }),
    F06_stay: fireRun('F06', { dist: 7 }), F06_moved: fireRun('F06', { dist: 7, shift: { at: 0.6, dx: 0, dz: 3 } }),
    F07: fireRun('F07', { dist: 8, secs: 3.5 }),
  };
}
// 炎刃重坠：刀身可弹反、落地的火冲击不可（先空跑量出刀身碰到人的时刻，再在那之前 0.08 秒按下格挡）
export function f07Parry() {
  const dry = fireRun('F07', { dist: 8, secs: 3.5 });
  const tb = dry.hits.find((h) => h.includes(':phys:'));
  if (!tb) return { error: 'no blade contact', dry };
  const r = fireRun('F07', { dist: 8, secs: 3.5, press: parseFloat(tb) - 0.08 });
  return { dry: dry.hits, parry: r.hits, blade: r.blade, pressed: r.pressed };
}
// 燃刃留痕（F03）：A02 的重劈剑尖贴地 → 4 秒的火痕（地上的火，不延长刀身判定）；站上去每 0.5 秒灼一下（不可格挡）；同时最多 4 组
export function trailRun() {
  const f = freshBoss(), A = Q(), C = A.combat, P = A.player;
  if (f.phase !== 1) f.debug.phase(1);
  const b = f.root, yaw = f.rig.yaw;
  place(b.x + Math.sin(yaw) * 2.2, b.z + Math.cos(yaw) * 2.2);
  f.god = true;
  const t0 = f.time;
  f.debug.move('A02');
  let Z = null, born = null;
  tick(2.4, () => { if (!Z && f.zones.length) { Z = f.zones[0]; born = r3(f.time - t0); } return true; });
  f.god = false;
  if (!Z) return { error: 'no trail' };
  const info = { kind: Z.kind, life: Z.life, patches: Z.patches.length, born, firstPatch: [r2(Z.patches[0].p.x), r2(Z.patches[0].p.z)], r: Z.patches[0].r };
  // 站到第一块火痕上、举着格挡 1.6 秒
  const q = Z.patches[0].p; P.place(q.x, q.z, P.heading, 0); A.moves.reset();
  C.playerUnit.maxHp = C.playerUnit.hp = 9999;
  const burn = hitResults(() => tick(1.6, () => { C.setGuard(true); return true; })).filter((r) => r.tgt === 'player').map((r) => `${r.kind}:${r.result}:${r.amount}`);
  C.setGuard(false); C.playerUnit.maxHp = C.playerUnit.hp = 160;
  let gone = null;
  tick(5, () => { if (gone == null && !f.zones.includes(Z)) gone = r3(f.time - t0); return gone == null; });
  for (let i = 0; i < 6; i++) f.addZone({ life: 4, kind: 'test', id: 'x' + i });
  const cap = f.zones.length;
  f.clearHazards();
  return { info, burn, lived: gone != null ? r2(gone - born) : null, cap, max: CFG.fire.maxZones };
}

// =====================================================================================
// 焚天断界：跃至台心 → 蓄力 5.5 秒（危险区在蓄力开始时定下，半径 √0.75·R）→ 爆发判定一次（致死，经统一的伤害入口）→ 恢复 4 秒 → 冷却 40 秒
// how：'stay' 站在区内 / 'run' 往外跑 / 'dodge' 爆发前一刻闪身 / 'guard' 一直格挡 / 'parry' 爆发前按下格挡 / 'break' 蓄力中架势崩溃
// =====================================================================================
export function ultRun({ how = 'stay', start = { x: 0, z: 6 }, dt = 1 / 60 } = {}) {
  const f = freshBoss(), A = Q(), C = A.combat, M = A.moves, I = A.input, P = A.player;
  if (f.phase !== 2) f.debug.phase(2);
  f.cd.ult = 0;
  place(start.x, start.z);
  C.playerUnit.maxHp = C.playerUnit.hp = 160;
  const n0 = f.traceN || 0, t0 = f.time;
  f.debug.move('ult');
  let charge = null, zone = null, pressed = null, broke = null, ranFrom = null, minR = 99, maxR = 0, landed = null;
  const res = hitResults(() => tick(12, (t) => {
    const Mv = f.M, ct = Mv?.id === 'ult' && Mv.stage === 'charge' ? Mv.ct : null;
    if (Mv?.id === 'ult' && Mv.landed && landed == null) landed = r3(t);
    if (ct != null && charge == null) { charge = r3(t); zone = { c: Mv.zone.c.toArray().map(r2), r: r3(Mv.zone.r) }; }
    if (ct != null) { const r = Math.hypot(P.pos.x, P.pos.z); minR = Math.min(minR, r); maxR = Math.max(maxR, r); }
    if (how === 'run' && ct != null) { if (ranFrom == null) ranFrom = r2(Math.hypot(P.pos.x, P.pos.z)); A.cam.set(Math.atan2(P.pos.x, P.pos.z), 0.18, 6); I.keys.add('KeyW'); }
    if (how === 'dodge' && ct != null && pressed == null && ct >= CFG.ult.charge - 0.05) { pressed = r3(ct); M.cools.dodge = 0; M.press('dodge', true); }
    if (how === 'guard' && ct != null) C.setGuard(true);
    if (how === 'parry' && ct != null && pressed == null && ct >= CFG.ult.charge - 0.08) { pressed = r3(ct); C.setGuard(true); }
    if (how === 'break' && ct != null && broke == null && ct >= 2) { broke = r3(ct); f.posture = CFG.posture.max; f.postureBreak(); }
    return f.state === 'fight' && (f.M?.id === 'ult' || f.B.mode === 'break' || t < 0.5);
  }, dt));
  I.keys.clear(); C.setGuard(false);
  const ev = f.since(n0), at = (type) => { const e = ev.find((x) => x.type === type); return e ? r2(e.t - t0) : null; };
  const burst = ev.find((e) => e.type === 'ultBurst'), end = ev.find((e) => e.type === 'ultEnd');
  return {
    how, landed, chargeAt: at('ultCharge'), burstAt: at('ultBurst'), endAt: at('ultEnd'), chargeDur: burst ? r2(burst.t - ev.find((e) => e.type === 'ultCharge').t) : null,
    recover: burst && end ? r2(end.t - burst.t) : null, zone, ranFrom, playerR: [r2(minR), r2(maxR)], pressed, broke,
    result: burst ? burst.res : 'none', inZone: burst?.inZone ?? null, endInterrupted: end?.interrupted ?? null, cdAfter: r2(f.cd.ult),
    playerHits: res.filter((r) => r.tgt === 'player').map((r) => `${r.kind}:${r.result}:${r.amount}`), alive: C.playerUnit.alive, state: f.state,
  };
}
// 致死之后（失败过场 → 结算面板 → 重新挑战）收拾干净，回到一场新的战斗
export async function recover() {
  const f = F(), A = Q();
  for (let i = 0; i < 3 && f.cine.active; i++) { f.cine.skip(); tick(0.2); }
  if (A.ui.panelOpen) A.ui.closePanel();
  for (let i = 0; i < 30 && (f.busy || !['dormant', 'fight', 'result', 'failed'].includes(f.state)); i++) await sleep(120);
  return fight();
}
// 首次可用：二阶段开始 12 秒内 AI 不选焚天断界（之后冷却好了以 75% 的概率优先）
export function ultFirstUse() {
  const f = freshBoss();
  if (f.phase !== 2) f.debug.phase(2);
  f.cd.ult = 0;
  const out = [];
  for (const pt of [0, 6, 11.9, 12.1, 20]) {
    f.phaseT = pt; let n = 0;
    for (let i = 0; i < 200; i++) if (f.choose(5, 0).id === 'ult') n++;
    out.push({ phaseT: pt, ultPicks: n, of: 200 });
  }
  f.cd.ult = 10; f.phaseT = 30; let n = 0; for (let i = 0; i < 200; i++) if (f.choose(5, 0).id === 'ult') n++;
  out.push({ phaseT: 30, cd: 10, ultPicks: n, of: 200 });
  f.cd.ult = 0;
  return out;
}

// =====================================================================================
// 两个阶段：独立的气血池（H / 0.8H）、耗尽 → 转阶段过场（期间不吃伤害）→ 二阶段（满血、架势归零、燃起）；凤凰的秒杀只把一阶段推进到二阶段
// =====================================================================================
export function phaseRun({ watch = true } = {}) {
  const f = freshBoss(), A = Q(), C = A.combat, M = A.moves;
  if (f.phase !== 1) f.debug.phase(1);
  f.unit.maxHp = f.unit.hp = f.hpPool(1);
  const out = { pools: [f.hpPool(1), f.hpPool(2)], p1Start: f.unit.hp };
  const b = f.root, yaw = f.rig.yaw;
  place(b.x + Math.sin(yaw) * 1.8, b.z + Math.cos(yaw) * 1.8);
  f.toIdle(9); f.posture = 37;
  f.unit.hp = 4;
  const n0 = f.traceN || 0, t0 = f.time;
  M.press('light', true); M.press('light', false);
  tick(0.7, () => f.state === 'fight');
  out.afterHit = { state: f.state, cine: f.cine.cur?.name || null, hp: f.unit.hp };
  out.immuneDuring = C.damage(f.unit, 100, { from: C.playerUnit, kind: 'sword', hitKind: 'light' });
  if (!watch) f.cine.skip();
  let back = null;
  tick(9, (t) => { if (back == null && f.state === 'fight') back = r2(t); return back == null; });
  const ev = f.since(n0), e1 = ev.find((e) => e.type === 'cine'), e2 = ev.find((e) => e.type === 'cineEnd');
  out.cine = { name: e1?.name, dur: e1 && e2 ? r2(e2.t - e1.t) : null, skipped: e2?.skipped ?? null };
  out.p2 = { phase: f.phase, hp: f.unit.hp, max: f.unit.maxHp, posture: f.posture, ignite: f.rig.U.uIgnite.value, blade: r2(f.rig.U.uBlade.value), heat: A.game.tower30?.heatTarget ?? null, mode: f.B.mode, gapT: r2(f.B.gapT) };
  out.p2k = { move: CFG.walk.p2 / CFG.walk.p1, run: CFG.run.p2 / CFG.run.p1, recover: CFG.p2.recover, parryRecover: CFG.parry.recover };
  return out;
}
// 凤凰的秒杀：一阶段 → 走 Boss 自己的阶段结束（不追加冲击伤害），二阶段满血；二阶段受保护，不吃秒杀
export function executeRun() {
  const f = freshBoss(), A = Q(), ph = A.game.phoenix;
  if (f.phase !== 1) f.debug.phase(1);
  f.unit.maxHp = f.unit.hp = f.hpPool(1);
  const out = { eligibleP1: ph.execEligible(f.unit) };
  const rec = {};
  const ok = ph.executeStage(f.unit, { castId: 'r24test' }, rec);
  out.p1 = { ok, rec: rec.executed, state: f.state, cine: f.cine.cur?.name || null, hp: f.unit.hp };
  tick(0.4); f.cine.skip(); tick(0.2);                              // 过场开头 0.3 秒内不能跳
  out.p2 = { phase: f.phase, hp: f.unit.hp, max: f.unit.maxHp, state: f.state };
  tick(0.9);
  out.eligibleP2 = ph.execEligible(f.unit);
  out.endStageP2 = f.unit.endStage({ reason: 'phoenix', castId: 'r24test2' });
  out.p2After = { phase: f.phase, hp: f.unit.hp, state: f.state };
  return out;
}
// 真的放一只凤凰（凤翔天击）撞上剑尊，秒杀判定固定为成功：一阶段 → 只推进到二阶段（不吃冲击伤害）；二阶段 → 不判秒杀，照常吃冲击伤害
export function phoenixRun() {
  const A = Q(), ph = A.phoenix, M = A.moves, C = A.combat, out = {};
  const f = freshBoss();
  if (f.phase !== 1) f.debug.phase(1);
  f.unit.maxHp = f.unit.hp = f.hpPool(1);
  const keep = ph.rand; ph.rand = () => 0;
  const aim = () => {
    const b = f.root; place(b.x, b.z + 9);
    const pl = A.player.pos, caps = f.rig.caps.slice().sort((a, c) => a.a.distanceTo(pl) - c.a.distanceTo(pl));
    const mid = caps[0].a.clone().add(caps[0].b).multiplyScalar(0.5), from = pl.clone().setY(pl.y + 4.6);
    A.cam.set(Math.atan2(mid.x - from.x, mid.z - from.z), -Math.atan2(mid.y - from.y, Math.hypot(mid.x - from.x, mid.z - from.z)), 8);
  };
  const shoot = () => { ph.clear('test'); ph.events.length = 0; aim(); ph.mode = 'strike'; M.cools.phoenix = 0; M.mp = M.mpMax; M.press('phoenix', true); };
  try {
    shoot();
    const hp0 = f.unit.hp;
    tick(3, () => { C.playerUnit.hp = C.playerUnit.maxHp; return f.state === 'fight'; });
    const imp = ph.events.find((e) => e.kind === 'impact');
    out.p1 = { impact: imp && { target: imp.target, stage: imp.stage, exec: imp.exec, executed: imp.executed, main: imp.main ?? null }, hpBefore: hp0, state: f.state, cine: f.cine.cur?.name || null };
    tick(0.4); f.cine.skip(); tick(0.3);
    out.p2Start = { phase: f.phase, hp: f.unit.hp, max: f.unit.maxHp, state: f.state };
    tick(1.0);
    f.toIdle(9);
    shoot();
    const hp1 = f.unit.hp;
    tick(3, () => { C.playerUnit.hp = C.playerUnit.maxHp; return !ph.events.some((e) => e.kind === 'impact'); });
    tick(0.2);
    const imp2 = ph.events.find((e) => e.kind === 'impact');
    out.p2 = { impact: imp2 && { target: imp2.target, stage: imp2.stage, exec: imp2.exec ?? null, executed: imp2.executed ?? null, main: imp2.main ?? null }, hpBefore: hp1, hpAfter: r2(f.unit.hp), phase: f.phase, state: f.state };
  } finally { ph.rand = keep; ph.clear('test'); }
  return out;
}

// =====================================================================================
// 过场：出场 / 转阶段 / 击败 / 失败——完整放与中途跳过，最终状态一致
// =====================================================================================
function snapState() {
  const f = F(), A = Q(), R = f.rig, H = A.game.tower30;
  return {
    state: f.state, phase: f.phase, mode: f.B?.mode, hp: Math.round(f.unit.hp), max: f.unit.maxHp, form: r2(R.U.uForm.value), ash: r2(R.U.uAsh.value), ignite: r2(R.U.uIgnite.value),
    sword: R.swordAttached, visible: R.root.visible, clip: R.name, barrier: H?.barrierTarget ?? null, gate: H?.gateTarget ?? null, lock: !!A.game.lock, freeCam: !!A.game.freeCam,
    hud: !!document.querySelector('#b30-hud')?.classList.contains('on'), panel: A.ui.panelOpen ? A.game.panelKind : null, invuln: r2(A.combat.playerUnit.invuln),
    buttons: A.ui.panelOpen ? [...document.querySelectorAll('.b30-result .ar-act button')].map((b) => b.textContent) : [],
  };
}
export async function cineRun(name, { skipAt = null } = {}) {
  const A = Q();
  await fight();
  const f = F(), C = A.combat;
  f.debugUsed = false;
  if (name === 'intro') { f.resetFight(true); f.debug.start(); }
  else if (name === 'phase') { if (f.phase !== 1) f.debug.phase(1); f.unit.hp = 1; f.debugUsed = false; C.damage(f.unit, 50, { from: C.playerUnit, kind: 'sword', hitKind: 'light' }); }
  // 第二十九轮：最后一条命打空会先放墨里终焉的处决演出，胜利过场在演出交还之后才开始——这里像玩家一样按跳过，只看胜利过场本身
  else if (name === 'victory') { f.debug.phase(2); f.debugUsed = false; f.unit.hp = 1; C.damage(f.unit, 50, { from: C.playerUnit, kind: 'sword', hitKind: 'light' }); tick(0.05); if (A.finale?.active) { A.finale.skip(); tick(0.05); } }
  else if (name === 'defeat') { C.playerUnit.invuln = 0; C.damage(C.playerUnit, 99999, { from: f.unit, kind: 'phys', spec: { def: 'blade', id: 'r24kill', block: false, parry: false } }); }
  const n0 = f.traceN || 0;
  const start = f.trace.filter((e) => e.type === 'cine').pop();
  const t0 = start ? start.t : f.time, marks = [];
  tick(9, (t) => {
    if (skipAt != null && f.cine.active && f.time - t0 >= skipAt && !marks.includes('skip')) { marks.push('skip'); f.cine.skip(); }
    return f.cine.active;
  });
  tick(0.3);
  const ev = f.trace.filter((e) => e.t >= t0 - 1e-6 && (e.type === 'cine' || e.type === 'cineEnd' || e.type === 'cineSkip' || e.type === 'reward'));
  const e2 = ev.find((e) => e.type === 'cineEnd');
  const after = snapState();
  const reward = f.rewardInfo && name === 'victory' ? { first: f.rewardInfo.first, items: f.rewardInfo.items, debug: !!f.rewardInfo.debug } : null;
  void n0;
  return { name, skipAt, dur: e2 ? r2(e2.t - t0) : null, skipped: e2?.skipped ?? null, ev: ev.map((e) => `${r2(e.t - t0)} ${e.type}${e.name ? ':' + e.name : ''}`), after, reward };
}

// =====================================================================================
// 重试 / 离开：危险物、火域、预警、粒子、灯、剑、碎烬、镜头、输入、界面都复原；奖励只发一次
// =====================================================================================
function leftovers() {
  const f = F(), A = Q(), R = f.rig;
  return {
    state: f.state, phase: f.phase, mode: f.B.mode, move: f.M?.id || null, hz: f.hz.length, zones: f.zones.length, fx: f.fx.stats(), sword: R.swordAttached, ash: r2(R.U.uAsh.value), ignite: r2(R.U.uIgnite.value),
    hp: f.unit.hp, max: f.unit.maxHp, posture: f.posture, cd: { ...f.cd, fire: Object.keys(f.cd.fire).length }, freeCam: !!A.game.freeCam, lock: !!A.game.lock, cine: f.cine.active,
    player: { hp: A.combat.playerUnit.hp, max: A.combat.playerUnit.maxHp, alive: A.combat.playerUnit.alive, keys: A.input.keys.size, guard: !!A.combat.guardHeld },
    hud: !!document.querySelector('#b30-hud')?.classList.contains('on'), ult: f.ultTele ? 1 : 0, arenaUlt: A.game.tower30?.U?.uUlt?.value ?? null,
  };
}
export async function retryRun(n = 3) {
  const out = [];
  for (let i = 0; i < n; i++) {
    await fight();
    const f = F(), C = Q().combat;
    f.debug.phase(2);
    f.debug.move('F06'); tick(0.5);                                  // 火柱的预警还在
    rollRun({ dist: 6, phase: 2 });                                  // 突刺的火迹
    f.debug.move('A02'); tick(1.2);                                  // 燃刃留痕
    f.debug.move('ult'); tick(2.2);                                  // 焚天断界蓄力中
    const before = { hz: f.hz.length, zones: f.zones.length, fx: f.fx.stats(), ult: f.M?.id };
    // 第三轮：打赢后再战（剑掉了、碎成了余烬）。第二十九轮：最后一条命打空会先放墨里终焉的处决演出（收刀时才胜利）——像玩家一样按跳过，再等胜利的结算
    if (i === 2) { f.debugUsed = false; f.unit.hp = 1; f.cancelMove(true); C.damage(f.unit, 50, { from: C.playerUnit, kind: 'sword', hitKind: 'light' }); tick(0.1); const Fn = Q().finale; if (Fn?.active) { Fn.skip?.(); tick(0.1); } tick(7); }
    const won = i === 2 ? { state: f.state, sword: f.rig.swordAttached, ash: r2(f.rig.U.uAsh.value) } : null;
    if (Q().ui.panelOpen) Q().ui.closePanel();
    await f.retry(true);
    tick(0.3);
    out.push({ round: i + 1, before, won, after: leftovers() });
  }
  return out;
}
// 奖励只发一次：连赢两场，第一场首通（剑印、余烬、养元丹、灵气），第二场只有常规的少量奖励；同一场的结算重复调用不重复发
export async function rewardRun() {
  const A = Q(), st = A.game.state, R = () => st.d.tower30;
  const snap = () => ({ wins: R().wins, firstReward: R().firstReward, merit: st.d.merit, jinyu: st.d.inv.jinyu || 0, ember: st.d.inv.ember || 0, yangyuan: st.d.inv.yangyuan || 0, qiGranted: !!A.prog.granted?.('boss30.first') });
  const win = async () => {
    await fight();
    const f = F(), C = A.combat;
    f.debug.phase(2); f.debugUsed = false; f.unit.hp = 1;
    C.damage(f.unit, 50, { from: C.playerUnit, kind: 'sword', hitKind: 'light' });
    tick(7);
    const info = f.rewardInfo, again = f.grantRewards();
    const s = snap();
    if (A.ui.panelOpen) A.ui.closePanel();
    await f.retry(true);
    return { first: info?.first, items: info?.items, sameObjectOnRepeat: again === info, after: s };
  };
  st.d.tower30.firstReward = false; if (A.prog.d?.ledger) delete A.prog.d.ledger['boss30.first'];     // 自检页面的存档：从「从未通关」开始
  const s0 = snap();
  const w1 = await win(), w2 = await win();
  return { before: s0, w1, w2 };
}

// =====================================================================================
// 真实的进出：一层的楼层传送阵 → 挑战说明 → 进入 → 走上剑台触发出场 → 战斗中按退格放弃 → 回到桥头 → 走到拱门下按 E 回一层
// =====================================================================================
const key = (code, down = true) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
async function until(fn, secs = 15) { for (let i = 0; i < secs * 10 && !fn(); i++) { tick(0.1); await sleep(30); } return fn(); }
export async function entryRun() {
  const A = Q(), g = A.game, f = F(), out = {};
  if (f.active) { if (A.ui.panelOpen) A.ui.closePanel(); await f.exit(); }
  out.left = { world: A.world.name, state: f.state, rig: !!f.rig };
  f.openChallenge();
  out.panel = { open: A.ui.panelOpen, kind: g.panelKind, go: !!document.querySelector('.b30-panel [data-go]') };
  document.querySelector('.b30-panel [data-go]').click();
  out.entered = await until(() => A.world.name === 'boss30' && f.state === 'dormant' && !f.busy && !g.lock, 20);
  const P = A.player;
  out.atEntry = { pos: [r2(P.pos.x), r2(P.pos.z)], state: f.state, barrier: A.game.tower30.barrierTarget, gate: A.game.tower30.gateTarget };
  // 走上剑台
  A.cam.set(Math.PI, 0.2, 6.6); A.input.keys.add('KeyW');
  let trig = null;
  for (let i = 0; i < 12 * 60 && trig == null; i++) { A.tick(1 / 60, 1, false); if (f.state === 'intro') trig = r2(Math.hypot(P.pos.x, P.pos.z)); }
  A.input.keys.clear();
  out.intro = { at: trig, trigger: T30.trigger, cine: f.cine.cur?.name || null, skippable: !!f.cine.cur?.skip };
  tick(0.5); key('Space'); key('Space', false); tick(0.3);
  out.fight = { state: f.state, barrier: A.game.tower30.barrierTarget, gate: A.game.tower30.gateTarget, hud: !!document.querySelector('#b30-hud')?.classList.contains('on') };
  tick(1.0);
  key('Backspace'); key('Backspace', false);
  out.quitPanel = { open: A.ui.panelOpen, kind: g.panelKind };
  document.querySelector('.ui-panel [data-yes], [data-yes]')?.click();
  out.afterQuit = await until(() => f.state === 'dormant' && !f.busy, 10);
  out.respawn = { pos: [r2(P.pos.x), r2(P.pos.z)], state: f.state, hp: A.combat.playerUnit.hp };
  // 回拱门下
  const ex = g.items?.find?.((it) => it.id === 'b30Exit');
  P.place(0, T30.entry.z + 0.4, Math.PI, 0); tick(0.3);
  out.near = { nearest: g.nearest?.()?.id || null };
  key('KeyE'); key('KeyE', false);
  out.back = await until(() => A.world.name === 'tower' && !g.lock, 15);
  out.final = { world: A.world.name, state: f.state, rig: !!f.rig, fx: !!f.fx, hud: !!document.querySelector('#b30-hud'), keys: A.input.keys.size, freeCam: !!g.freeCam, exitItem: !!ex };
  return out;
}

// =====================================================================================
// 帧率一致：同一套连招、同一次突刺、同一个火纹在 30 / 60 / 144 帧下的时刻
// =====================================================================================
export function rateRun() {
  const out = {};
  for (const [k, dt] of [['30fps', 1 / 30], ['60fps', 1 / 60], ['144fps', 1 / 144]]) {
    const a = rhythmOf('A10', { dt }), b = rhythmOf('A07', { dt });
    const r = rollRun({ dist: 5, phase: 1, dt });
    const s = fireRun('F02', { dist: 3, dt }), c = s.hz.find((h) => h.kind === 'circle');
    out[k] = { A10: { wind: a.windup, gaps: a.gaps, rec: a.recovery, hits: a.hits }, A07: { wind: b.windup, gaps: b.gaps, rec: b.recovery, hits: b.hits }, roll: { lock: r.lockAt[0], dash: r.dashAt[0], hit: r.hit[0] }, F02: { delay: c ? r2(c.burst - c.born) : null, hit: s.hits[0] } };
  }
  return out;
}

// =====================================================================================
// 全部自检（报告里的数字出自这里）：节奏（两阶段）、弹反表、一顿、架势崩溃、截锋、留锋突刺、火焰、燃刃留痕、焚天断界、阶段与秒杀、过场、重试、奖励、帧率
// 用法：setTimeout(() => T.runAll().then((r) => window.__all = r), 0)（约 2–3 分钟；后台标签页里 await 很慢）
// =====================================================================================
export async function runAll() {
  const out = {}, t0 = performance.now(), ms = {};
  const step = async (k, fn) => { const s0 = performance.now(); try { out[k] = await fn(); } catch (e) { out[k] = { err: String(e), stack: e.stack }; } ms[k] = Math.round(performance.now() - s0); };
  await step('setup', () => fight());
  await step('rhythm1', () => rhythmAll(1).map((r) => ({ id: r.id, ok: r.ok, hits: r.hits, windup: r.windup, gaps: r.gaps, recovery: r.recovery, bad: r.bad })));
  await step('rhythm2', () => rhythmAll(2).map((r) => ({ id: r.id, ok: r.ok, recovery: r.recovery, bad: r.bad })));
  await step('parry', () => { const t = parryTable(); return { ok: t.filter((r) => r.ok).length, of: t.length, bad: t.filter((r) => !r.ok) }; });
  await step('hitch', () => hitchRun());
  await step('break', () => [breakRun(1), breakRun(2)].map((r) => ({ phase: r.phase, dur: r.dur, want: r.want, clips: r.clips.map((c) => c[1]).join('>'), postureAfter: r.postureAfter })));
  await step('guard', () => ['front', 'back', 'qi', 'none'].map((how) => { const r = guardRun({ how }); return { how, bossDmg: r.bossDmg, deflect: r.deflect, counter: r.counterMove, counterRes: r.counterRes }; }).concat([{ how: 'front+dodge', ...(({ deflect, counterRes }) => ({ deflect, counterRes }))(guardRun({ how: 'front', counter: 'dodge' })) }, { how: 'front+parry', ...(({ deflect, counterRes }) => ({ deflect, counterRes }))(guardRun({ how: 'front', counter: 'parry' })) }]));
  await step('roll', () => Object.fromEntries(Object.entries(rollTable()).map(([k, r]) => [k, { why: r.why.join('|'), triggered: r.triggered, lockAt: r.lockAt[0] ?? null, dashAt: r.dashAt[0] ?? null, len: r.dashLen[0] ?? null, hit: r.hit[0] ?? null, busyKept: r.busyKept, zones: r.zones }])));
  await step('fire', () => Object.fromEntries(Object.entries(fireTable()).map(([k, r]) => [k, { hits: r.hits, blade: r.blade, hz: r.hz.map((h) => ({ kind: h.kind, prep: h.go != null ? r2(h.go - h.born) : h.burst != null ? r2(h.burst - h.born) : null, L: h.L ?? null, p: h.p, pAtBurst: h.pAtBurst ?? null })), maxR: r.maxR }])));
  await step('f07parry', () => f07Parry());
  await step('trail', () => trailRun());
  await step('ultFirst', () => ultFirstUse());
  await step('ult', async () => { const res = {}; for (const how of ['run', 'dodge', 'break']) { const r = ultRun({ how, start: how === 'run' ? { x: 0, z: 1 } : { x: 0, z: 6 } }); res[how] = { charge: r.chargeDur, recover: r.recover, zone: r.zone, result: r.result, inZone: r.inZone, cdAfter: r.cdAfter, alive: r.alive, ranFrom: r.ranFrom }; } for (const how of ['stay', 'guard', 'parry']) { const r = ultRun({ how }); res[how] = { result: r.result, inZone: r.inZone, alive: r.alive, state: r.state, hits: r.playerHits }; await recover(); } return res; });
  await step('phase', () => phaseRun());
  await step('execute', async () => { await fight(); return executeRun(); });
  await step('phoenix', async () => { await fight(); return phoenixRun(); });
  await step('cines', async () => { const res = {}; for (const n of ['intro', 'phase', 'victory', 'defeat']) { for (const s of [null, 1.0]) { const r = await cineRun(n, { skipAt: s }); res[n + (s ? '_skip' : '')] = { dur: r.dur, skipped: r.skipped, state: r.after.state, phase: r.after.phase, form: r.after.form, ash: r.after.ash, sword: r.after.sword, barrier: r.after.barrier, gate: r.after.gate, clip: r.after.clip, panel: r.after.panel, buttons: r.after.buttons, reward: r.reward && r.reward.items }; } } return res; });
  await step('retry', async () => (await retryRun(3)).map((r) => ({ round: r.round, won: r.won, after: { hz: r.after.hz, zones: r.after.zones, fx: r.after.fx, sword: r.after.sword, ash: r.after.ash, hp: r.after.hp, posture: r.after.posture, playerHp: r.after.player.hp, keys: r.after.player.keys, hud: r.after.hud } })));
  await step('reward', () => rewardRun());
  await step('rate', async () => { await fight(); return rateRun(); });
  await step('final', () => fight());
  out._ms = ms; out._secs = Math.round((performance.now() - t0) / 1000);
  return out;
}
