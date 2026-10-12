// 第二十九轮自检：
//   一、演出音乐：山水铺开之前 0.1 秒进、从原曲 33 秒处放、一倍速、放满整段演出；不依赖服务器的分段请求
//       （原来经 <audio> 定位到 33 秒——开发服务器不支持 Range，定位不了，实际从原曲开头放：又短又轻）
//   二、演武场：切磋对手也放这段处决（击倒 → 演武场判胜，胜负等演出交还之后再出；演出中演武场停住；站位都在比试圈里）
//   三、通用的终结：不论哪种招式（普攻、凤凰、雷龙、剑气）的致命一击，群战里的最后一个、首领的最后一条命才放，之前的照常倒下；不需要墨势
// 都按真实的输入、出招、演出代码推进（__qinglan.tick）。第二十七轮的整套自检照跑（规则变了的几组已按新规矩改了期望，见各处「第二十九轮」注释）。
// 用法：const T = await import('/tools/r29_tests.js?v=' + Date.now()); await T.setup(); T.runAll()  → window.__r29all
import * as T27 from './r27_tests.js';
import { FINALE as F } from '/src/game/inkFinaleConfig.js';

const Q = () => window.__qinglan;
const r2 = (v) => +(+v).toFixed(2), r3 = (v) => +(+v).toFixed(3);
export const { startShow, to, foes, fresh, charge, run, clearFoes, skyQuiet, lastAct } = T27;
export async function setup() { return T27.setup(); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 把正在放的演出放完（只推进不画）
function finishShow(max = 1500) { const A = Q(), Fn = A.finale; let n = 0; while (Fn.active && n++ < max) A.tick(1 / 60, 1, false); return n; }
const evSince = (n0) => Q().finale.events.filter((e) => e.n > n0);
const noKillWhy = (n0) => evSince(n0).filter((e) => e.kind === 'noKill').map((e) => e.why);

// =====================================================================================
// 一、演出音乐
// =====================================================================================
// 1. 起止与位置：cueAt（= 山水铺开 − 0.1）起、从原曲 start 秒处放、0.1 秒淡入；暂停后续放的位置；退场时淡出；整段演出都有音乐
export function musicRun29() {
  const A = Q(), Fn = A.finale, S = A.game.sound, out = {};
  const calls = [], keep = {};
  for (const k of ['cue', 'cuePause', 'cueResume', 'cueStop']) {
    keep[k] = Object.prototype.hasOwnProperty.call(S, k) ? S[k] : null;
    const f = Object.getPrototypeOf(S)[k];
    S[k] = function (...a) { calls.push([k, r3(Fn.show?.t ?? -1), ...a.map((x) => (x && typeof x === 'object' ? JSON.parse(JSON.stringify(x)) : x))]); return f.apply(this, a); };
  }
  const paused0 = Fn.paused; let fake = false; Fn.paused = () => fake;
  try {
    startShow();
    to(F.music.cueAt - 0.05); out.before = S.cueState('ml')?.state;
    to(F.music.cueAt + 0.05); out.atCue = S.cueState('ml');
    to(5.0); fake = true; for (let i = 0; i < 20; i++) A.tick(1 / 60, 1, false); fake = false; A.tick(1 / 60, 1, false);
    finishShow();
    out.afterEnd = S.cueState('ml')?.state;
  } finally { Fn.paused = paused0; for (const [k, v] of Object.entries(keep)) { if (v) S[k] = v; else delete S[k]; } }
  const find = (k) => calls.find((c) => c[0] === k);
  const cue = find('cue'), stop = find('cueStop'), resume = find('cueResume');
  out.cue = cue ? { t: cue[1], at: cue[4]?.at, fadeIn: cue[4]?.fadeIn, gain: cue[4]?.gain } : null;
  out.stop = stop ? { t: stop[1], fade: stop[3] } : null;
  out.resume = resume ? { t: resume[1], pos: r3(resume[3]), expect: r3(F.music.start + resume[1] - F.music.cueAt) } : null;
  out.landAt = F.show.land.wave[0];
  out.musicSecs = cue && stop ? r2(stop[1] - cue[1] + (stop[3] || 0)) : null;            // 由进到淡出完
  const st = out.atCue;
  out.ok = out.before === 'idle' && Math.abs(F.music.cueAt - (out.landAt - 0.1)) < 1e-6 && !!cue && Math.abs(cue[1] - F.music.cueAt) <= 1 / 60 + 1e-3 && cue[4]?.at === F.music.start
    && st?.state === 'playing' && st.loaded && st.rate === 1 && st.seg >= 16.1 && Math.abs(st.pos - F.music.start) < 0.5
    && !!resume && Math.abs(resume[3] - out.resume.expect) < 0.02 && !!stop && Math.abs(stop[1] - F.show.exit[0]) < 0.02 && out.musicSecs >= 15;
  return out;
}
// 2. 实时：等几秒（墙上的钟），音乐在原曲里走过同样多的秒数——一倍速、不是半速
export async function musicRealtime29(secs = 3) {
  const A = Q(), Fn = A.finale, S = A.game.sound, out = {};
  const paused0 = Fn.paused; Fn.paused = () => false;
  try {
    startShow(); to(F.music.cueAt + 0.1);
    const p0 = S.cueState('ml').pos, w0 = performance.now();
    await sleep(secs * 1000);
    const st = S.cueState('ml'), w1 = performance.now();
    out.dPos = r3(st.pos - p0); out.dWall = r3((w1 - w0) / 1000); out.rate = st.rate; out.ratio = r3(out.dPos / out.dWall); out.ctx = S.ctx?.state; out.state = st.state;
    finishShow();
  } finally { Fn.paused = paused0; }
  out.ok = out.ctx === 'running' && out.state === 'playing' && Math.abs(out.ratio - 1) < 0.03 && out.rate === 1;
  return out;
}
// 3. 原因的记录（只记录，不判对错）：服务器对分段请求的回应；老办法（<audio> 定位到 33 秒）定位到了哪里
export async function serverInfo29() {
  const url = encodeURI('/' + F.music.url), out = {};
  const r = await fetch(url, { headers: { Range: 'bytes=0-15' } });
  out.rangeStatus = r.status; out.acceptRanges = r.headers.get('accept-ranges');
  try { await r.body?.cancel?.(); } catch (e) { /* 已读完 */ }
  const el = new Audio(); el.preload = 'auto'; el.src = url;
  await new Promise((res) => { el.addEventListener('loadedmetadata', res, { once: true }); setTimeout(res, 8000); });
  el.currentTime = F.music.start;
  await new Promise((res) => { el.addEventListener('seeked', res, { once: true }); setTimeout(res, 4000); });
  out.oldSeek = { want: F.music.start, got: r3(el.currentTime), seekable: el.seekable.length ? [r2(el.seekable.start(0)), r2(el.seekable.end(0))] : [] };
  el.removeAttribute('src'); el.load();
  out.ok = true;
  return out;
}

// =====================================================================================
// 二、演武场
// =====================================================================================
async function duel(sel) {
  const A = Q(), Ar = A.arena;
  if (Ar.S) Ar.teardown(Ar.S);
  if (A.ui.panelOpen) A.ui.closePanel();
  fresh();
  await Ar.prepare(sel); Ar.enter(sel);
  for (let i = 0; i < 80 && !(Ar.S && Ar.S.phase === 'countdown'); i++) await sleep(150);
  let n = 0; while (Ar.S && Ar.S.phase !== 'fight' && n++ < 400) A.tick(1 / 60, 1, false);
  for (let i = 0; i < 20; i++) A.tick(1 / 60, 1, false);
  return Ar.S;
}
async function leaveDuel() { const A = Q(), Ar = A.arena; if (A.ui.panelOpen) A.ui.closePanel(); if (Ar.S) Ar.teardown(Ar.S); if (A.ui.panelOpen) A.ui.closePanel(); }
// 1. 正式切磋：任何招式打出的致命一击 → 演出（站位在比试圈里；演出中演武场的计时、对手都停住；对手不出手）→ 收刀时击倒 → 交还之后才判胜
// 2. 自由练习：同样放演出，交还之后 1.8 秒对手复原
export async function arenaRun29(mode = 'formal') {
  const A = Q(), Ar = A.arena, Fn = A.finale, C = A.combat, U = C.playerUnit, out = { mode };
  const S = await duel({ opp: 'disciple', diff: 'easy', mode });
  if (!S || S.phase !== 'fight') { await leaveDuel(); return { err: 'no fight', phase: S?.phase }; }
  const d = S.duelist;
  d.setGuard?.(false); d.hp = 5;
  const n0 = Fn.evN || 0, hp0 = U.hp, t0 = S.t;
  out.res = C.damage(d, 40, { from: U, kind: 'sword', hitKind: 'light' });
  A.tick(1 / 60, 1, false);
  const Sh = Fn.show;
  out.show = Sh ? { level: Sh.level, inRing: [Sh.B, Sh.D, Sh.Fp].map((p) => Ar.inRing(p)) } : null;
  let mid = null, oppActs = 0; const ai0 = d.ai;
  let k = 0;
  while (Fn.active && k++ < 1500) {
    A.tick(1 / 60, 1, false);
    if (d.ai !== 'finale' && d.alive) oppActs++;
    if (Fn.show && Fn.show.t > 14 && !mid) mid = { phase: S.phase, t: r2(S.t - t0), win: S.win ?? null };
  }
  out.mid = mid; out.aiDuring = ai0; out.oppActs = oppActs;
  out.atEnd = { phase: S.phase, win: S.win ?? null, alive: d.alive, ai: d.ai, playerHpLost: r2(hp0 - U.hp) };
  run([], 2.2);
  out.after = { phase: Ar.S?.phase ?? null, alive: d.alive, ai: d.ai, hp: r2(d.hp) };
  out.ev = evSince(n0).filter((e) => ['confirm', 'commit', 'end'].includes(e.kind)).map((e) => `${e.kind}${e.via ? ':' + e.via : ''}${e.ok != null ? ':' + e.ok : ''}`);
  await leaveDuel();
  const ringOK = out.show && out.show.inRing.every(Boolean);
  const common = out.res === 'exec' && ringOK && out.mid?.phase === 'fight' && out.mid.t < 0.05 && out.oppActs === 0 && out.atEnd.playerHpLost === 0 && out.ev.includes('confirm:kill') && out.ev.includes('commit:true');
  out.ok = mode === 'formal' ? common && out.atEnd.phase === 'result' && out.atEnd.win === true && !out.atEnd.alive && out.atEnd.ai === 'defeated'
    : common && out.after.alive && out.after.hp === r2(d.maxHp);
  return out;
}
// 3. 满蓄力拔刀斩：切磋对手剩 8% → 处决（第二十九轮以前切磋对手不处决）
export async function arenaIaiRun() {
  const A = Q(), Ar = A.arena, Fn = A.finale, out = {};
  const S = await duel({ opp: 'disciple', diff: 'easy', mode: 'formal' });
  if (!S || S.phase !== 'fight') { await leaveDuel(); return { err: 'no fight' }; }
  const d = S.duelist;
  d.active = false; d.setGuard?.(false); d.hp = Math.round(d.maxHp * 0.08);
  A.moves.lock = d; Fn.debugGive();
  const n0 = Fn.evN || 0;
  charge(3.15);
  for (let i = 0; i < 120 && !Fn.show; i++) A.tick(1 / 60, 1, false);
  out.show = !!Fn.show; out.via = Fn.rec?.via ?? null; out.why = lastAct('iai_slash')?.act?.finale?.why ?? null;
  finishShow();
  out.atEnd = { phase: S.phase, win: S.win ?? null, alive: d.alive };
  out.ev = evSince(n0).filter((e) => ['confirm', 'commit'].includes(e.kind)).map((e) => `${e.kind}${e.via ? ':' + e.via : ''}`);
  A.moves.lock = null;
  await leaveDuel();
  out.ok = out.show && out.via === 'iai' && out.atEnd.phase === 'result' && out.atEnd.win === true && !out.atEnd.alive;
  return out;
}

// =====================================================================================
// 三、通用的终结
// =====================================================================================
// 1. 一个敌人：普攻（真实按键）、凤凰、雷龙、剑气打死它都放演出（不需要墨势）；护宗双龙、来路不明的持续伤害打死的照常倒下
export function killSoloRun() {
  const A = Q(), Fn = A.finale, C = A.combat, M = A.moves, U = C.playerUnit, out = {};
  const one = (label, how) => {
    fresh(); Fn.resetStack('test');
    const [e] = foes([['shade', how === 'light' ? 1.5 : 3.2, 0]], { hp: 100 }); e.hp = 4;
    const k0 = Fn.stats.kills, n0 = Fn.evN || 0, ready = Fn.ready;
    let r = null;
    if (how === 'light') { M.lock = e; run([[0, () => M.press('light', true)], [0.1, () => M.press('light', false)]], 1.2, () => (Fn.active ? false : undefined)); M.lock = null; }
    else r = C.damage(e, 50, how);
    const showed = Fn.active, via = Fn.rec?.via;
    finishShow(); run([], 0.1);
    const ev = evSince(n0);
    return { label, r, ready, showed, via: showed ? via : null, kills: Fn.stats.kills - k0, dead: !e.alive, committed: ev.some((x) => x.kind === 'commit' && x.ok), act: how === 'light' ? [...M.log].reverse().find((x) => /^light/.test(x.key))?.key ?? null : null };
  };
  const phx = A.phoenix?.unit || { phoenix: true, ownerPlayer: true, faction: 'sect', id: 'phoenix' };
  const loong = A.dragon?.unit || { ownerPlayer: true, faction: 'sect', id: 'loong' };
  out.light = one('普攻（真实按键）', 'light');
  out.phoenix = one('凤凰', { from: phx, kind: 'fire' });
  out.loong = one('雷龙', { from: loong, kind: 'thunder' });
  out.wave = one('剑气（玩家的投射物）', { from: { faction: 'sect', pos: U.pos.clone(), owner: 'player' }, kind: 'wave' });
  out.guardian = one('护宗双龙', { from: { faction: 'sect', isPlayer: false }, kind: 'fire' });
  out.dot = one('来路不明的持续伤害', { kind: 'fire', dot: true });
  const yes = (x) => x.showed && x.via === 'kill' && x.kills === 1 && x.dead && x.committed && !x.ready;
  const no = (x) => !x.showed && x.kills === 0 && x.dead;
  out.ok = yes(out.light) && /^light/.test(out.light.act || '') && yes(out.phoenix) && yes(out.loong) && yes(out.wave) && no(out.guardian) && no(out.dot);
  return out;
}
// 2. 群战：依次打死三个——前两个照常倒下（notLast），最后一个放演出；一下打死三个（群伤）——也只有最后一个放；
//    远处（30 米外）没惊动的不拦着，近处没惊动的拦着
export function groupRun() {
  const A = Q(), Fn = A.finale, C = A.combat, U = C.playerUnit, out = {};
  const hit = (e) => C.damage(e, 500, { from: U, kind: 'sword' });
  fresh();
  const es = foes([['shade', 3.2, -1.5], ['shade', 3.2, 0], ['shade', 3.2, 1.5]], { hp: 100 });
  out.seq = es.map((e) => {
    const n0 = Fn.evN || 0, r = hit(e), active = Fn.active, why = noKillWhy(n0)[0] ?? null;
    if (active) finishShow(); else run([], 0.2);
    return { r, active, dead: !e.alive, why };
  });
  fresh();
  const gs = foes([['shade', 3.2, -1.5], ['shade', 3.2, 0], ['shade', 3.2, 1.5]], { hp: 100 });
  const n1 = Fn.evN || 0;
  const rs = gs.map(hit);
  out.aoe = { results: rs, dead: gs.map((e) => !e.alive), active: Fn.active, why: noKillWhy(n1) };
  finishShow(); run([], 0.2);
  fresh();
  const far = foes([['shade', 3.2, 0], ['shade', 45, 0]], { hp: 100 }); far[1].state = 'idle'; far[1].engaged = false;
  out.farIdle = { r: hit(far[0]), active: Fn.active, d: r2(Math.hypot(far[1].pos.x - U.pos.x, far[1].pos.z - U.pos.z)) };
  finishShow(); run([], 0.2);
  fresh();
  const near = foes([['shade', 3.2, 0], ['shade', 12, 0]], { hp: 100 }); near[1].state = 'idle'; near[1].engaged = false;
  const n2 = Fn.evN || 0;
  out.nearIdle = { r: hit(near[0]), active: Fn.active, dead: !near[0].alive, why: noKillWhy(n2)[0] ?? null };
  finishShow(); run([], 0.2); clearFoes();
  const s = out.seq, g = out.aoe;
  out.ok = s[0].r !== 'exec' && s[0].dead && s[0].why === 'notLast' && s[1].r !== 'exec' && s[1].dead && s[1].why === 'notLast' && s[2].r === 'exec' && s[2].dead
    && g.results[0] !== 'exec' && g.results[1] !== 'exec' && g.results[2] === 'exec' && g.dead[0] && g.dead[1] && g.why.length === 2 && g.why.every((w) => w === 'notLast')
    && out.farIdle.r === 'exec' && out.nearIdle.r !== 'exec' && out.nearIdle.dead && out.nearIdle.why === 'notLast';
  return out;
}
// 3. 满蓄力拔刀斩的处决也照这条：旁边还有敌人时不处决（notLast，照常吃 ×2 伤害）；只剩它一个时处决
export function iaiRulesRun() {
  const A = Q(), Fn = A.finale, out = {};
  const H = 100000;
  const shot = (list, lock) => {
    fresh(); Fn.debugGive();
    const es = foes(list, { hp: H }); es[lock].hp = 0.08 * H; A.moves.lock = es[lock];
    const ex0 = Fn.stats.execs, hp0 = es[lock].hp;
    charge(3.15);
    for (let i = 0; i < 90 && !Fn.show; i++) A.tick(1 / 60, 1, false);
    const r = { show: !!Fn.show, via: Fn.show ? Fn.rec?.via : null, why: lastAct('iai_slash')?.act?.finale?.why ?? null, execs: Fn.stats.execs - ex0, lost: r2(hp0 - es[lock].hp) };
    finishShow(); A.moves.lock = null; run([], 0.2);
    return r;
  };
  out.two = shot([['shade', 3.2, 0], ['shade', 5, 2.5]], 0);
  out.one = shot([['shade', 3.2, 0]], 0);
  clearFoes();
  out.ok = !out.two.show && out.two.why === 'notLast' && out.two.execs === 0 && out.two.lost > 0 && out.one.show && out.one.via === 'iai' && out.one.execs === 1;
  return out;
}
// 4. 分段的敌人（试炼魔将，共享生命条在 50% 转段）：第一段打到底照常转段，最后一条命打死放演出
export function stagedKillRun() {
  const A = Q(), Fn = A.finale, C = A.combat, U = C.playerUnit, out = {};
  fresh(); Fn.resetStack('test');
  const [e] = foes([['eliteStaged', 3.2, 0]], { hp: 520 });
  e.hp = 270;
  let n0 = Fn.evN || 0;
  const r0 = C.damage(e, 400, { from: U, kind: 'sword' });
  out.first = { r: r0, active: Fn.active, alive: e.alive, stage: e.stageIdx, hp: r2(e.hp), why: noKillWhy(n0)[0] ?? null };
  run([], 1.5);
  e.hp = 10; n0 = Fn.evN || 0;
  const r1 = C.damage(e, 400, { from: U, kind: 'sword' });
  out.last = { r: r1, active: Fn.active, via: Fn.rec?.via, final: Fn.rec?.final };
  finishShow();
  out.last.dead = !e.alive;
  clearFoes();
  out.ok = out.first.r !== 'exec' && !out.first.active && out.first.alive && out.first.stage === 1 && out.first.why === 'notFinal'
    && out.last.r === 'exec' && out.last.via === 'kill' && out.last.final && out.last.dead;
  return out;
}
// 5. 首领：第三十层、第五十层——一阶段打空照常转阶段（不放演出），二阶段（最后一条命）打空放演出、收刀时胜利
async function bossKill(kind, phase) {
  const A = Q(), Fn = A.finale, C = A.combat, U = C.playerUnit, run_ = run;
  if (A.ui.panelOpen) A.ui.closePanel();
  let f;
  if (kind === 'boss30') {
    const B24 = await import('./r24_tests.js');
    if (A.world.name !== 'boss30') await B24.setup({ ai: false });
    f = A.game.boss30; f.cine.forceSkip = true;
    await B24.fight({ ai: false });
    if (f.phase !== phase) f.debug.phase(phase);
    f.debugUsed = false; f.god = false;
  } else {
    if (A.world.name !== 'boss50') { await A.game.towerRoom.enter(); run_([], 0.5); await A.boss50.enter(); run_([], 1); }
    f = A.boss50;
    f.resetFight(false); f.debug.start(); run_([], 0.5); f.debug.skip(); run_([], 1.5);
    if (phase === 2 && f.phase !== 2) { f.debug.phase?.(2); run_([], 0.3); if (f.cine?.active) { f.cine.skip?.(); run_([], 0.5); } }
    f.debugUsed = false;
  }
  if (A.ui.panelOpen) A.ui.closePanel();
  Fn.resetStack('test');
  f.unit.hp = 5;
  const n0 = Fn.evN || 0;
  const r = C.damage(f.unit, 300, { from: U, kind: 'sword', hitKind: 'light' });
  const res = { kind, phase, r, show: Fn.active, why: noKillWhy(n0)[0] ?? null, via: Fn.active ? Fn.rec?.via : null };
  let commitT = null, stateAtCommit = null, k = 0;
  while (Fn.active && k++ < 1500) { A.tick(1 / 60, 1, false); if (Fn.rec?.committed && commitT == null) { commitT = r3(Fn.show?.t ?? -1); stateAtCommit = f.state; } }
  res.commitT = commitT; res.stateAtCommit = stateAtCommit;
  run_([], 1.0);
  res.after = { state: f.state, phase: f.phase, alive: f.unit.alive };
  if (f.cine?.active) { f.cine.skip?.(); run_([], 0.6); }
  if (A.ui.panelOpen) A.ui.closePanel();
  return res;
}
export async function bossKillRun() {
  const out = {};
  out.b30p1 = await bossKill('boss30', 1);
  out.b30p2 = await bossKill('boss30', 2);
  out.b50p1 = await bossKill('boss50', 1);
  out.b50p2 = await bossKill('boss50', 2);
  const no = (x) => x.r !== 'exec' && !x.show && x.why === 'notFinal';
  const yes = (x) => x.r === 'exec' && x.show && x.via === 'kill' && Math.abs((x.commitT ?? 0) - 13.2) < 0.02 && x.stateAtCommit === 'victory';
  out.ok = no(out.b30p1) && yes(out.b30p2) && no(out.b50p1) && yes(out.b50p2);
  return out;
}
// 6. 幽渊秘境（地下场景）里也演：演出物、画中世界跟着换到那个场景
export async function abyssRun() {
  const A = Q(), Fn = A.finale, C = A.combat, U = C.playerUnit, out = {};
  if (A.ui.panelOpen) A.ui.closePanel();
  await A.game.switchWorld('abyss'); run([], 0.6);
  out.world = A.world?.name ?? A.game.world;
  const P = A.player, y = P.heading, f = { x: Math.sin(y), z: Math.cos(y) };
  const e = C.spawn('shade', { x: P.pos.x + f.x * 3.2, y: P.pos.y, z: P.pos.z + f.z * 3.2 }, { yaw: y + Math.PI });
  e.state = 'chase'; e.cool = 99; e.cfg = { ...e.cfg, speed: 0 }; e.hp = 4;
  // 秘境里别的敌人（没惊动、离得远的不算）：记下当前同一场景里还活着的
  out.others = C.enemies.filter((u) => u !== e && u.alive && u.world === e.world).length;
  for (const u of C.enemies) if (u !== e && u.alive && u.world === e.world) { u.state = 'dormant'; u.engaged = false; }
  const n0 = Fn.evN || 0;
  out.r = C.damage(e, 50, { from: U, kind: 'sword' });
  out.show = Fn.active;
  A.tick(1 / 60, 1, false);                         // 确认之后的下一帧才建好演出
  to(3.0); out.t = Fn.show ? r2(Fn.show.t) : null;
  out.stage = A.inkStage?.census?.() ? { active: A.inkStage.census().active, hidden: A.inkStage.census().hidden } : null;
  finishShow();
  out.dead = !e.alive; out.committed = evSince(n0).some((x) => x.kind === 'commit' && x.ok);
  await A.game.switchWorld('surface'); run([], 0.6);
  out.back = A.world?.name ?? A.game.world;
  out.ok = out.r === 'exec' && out.show && out.stage?.active && out.dead && out.committed;
  return out;
}
// 7. 清理：几次通用的终结之后，镜头、控制、界面、音乐、演出物都复原；几何体、贴图数不累积
export function cleanup29Run(n = 2) {
  const A = Q(), Fn = A.finale, C = A.combat, Rr = A.renderer, out = { runs: [] };
  const g0 = Rr.info.memory.geometries, x0 = Rr.info.memory.textures;
  for (let k = 0; k < n; k++) {
    fresh(); const [e] = foes([['shade', 3.2, 0]], { hp: 100 }); e.hp = 4;
    C.damage(e, 50, { from: C.playerUnit, kind: 'sword' });
    finishShow(); A.tick(1 / 60, 1, false);
    out.runs.push({ active: Fn.active, freeCam: !!A.game.freeCam, ctl: !!A.player.ctl?.lock, body: document.body.classList.contains('ink-show'), music: A.game.sound.cueState('ml')?.state, sprites: A.finFx.census().sprites, stage: A.inkStage?.census?.().active ?? null });
  }
  run([], 0.8);
  out.music = A.game.sound.cueState('ml')?.state;
  out.geos = Rr.info.memory.geometries - g0; out.texs = Rr.info.memory.textures - x0;
  out.ok = out.runs.every((r) => !r.active && !r.freeCam && !r.ctl && !r.body && r.sprites === 0 && !r.stage) && out.music === 'idle' && out.geos <= 1 && out.texs <= 1;
  clearFoes();
  return out;
}

// =====================================================================================
// 全部（放进 setTimeout 里跑，结果在 window.__r29all）
// =====================================================================================
export function runAll() {
  window.__r29all = { running: true };
  setTimeout(async () => {
    const out = {}, t0 = performance.now();
    const steps = [['music', musicRun29], ['musicRealtime', () => musicRealtime29()], ['server', serverInfo29],
      ['arenaFormal', () => arenaRun29('formal')], ['arenaFree', () => arenaRun29('free')], ['arenaIai', arenaIaiRun],
      ['killSolo', killSoloRun], ['group', groupRun], ['iaiRules', iaiRulesRun], ['stagedKill', stagedKillRun], ['cleanup', () => cleanup29Run(2)],
      ['bossKill', bossKillRun], ['abyss', abyssRun]];
    for (const [k, f] of steps) {
      const s0 = performance.now();
      try { out[k] = await f(); } catch (e) { out[k] = { err: String(e), stack: String(e.stack).slice(0, 400) }; }
      out[k].ms = Math.round(performance.now() - s0);
      window.__r29all = { running: true, at: k, out };
      await new Promise((r) => setTimeout(r, 30));
    }
    out.summary = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v?.ok ?? (v?.err ? 'ERR' : null)]));
    out.totalMs = Math.round(performance.now() - t0);
    window.__r29all = { running: false, out };
  }, 0);
  return 'started';
}
