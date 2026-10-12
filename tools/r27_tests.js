// 第二十七轮自检：「墨里终焉」——改名与入口、墨势规则（沿用第二十五轮的检查）、16 秒统一演出（时间线、各阶段的画面与镜头、站位分档与局部演出空间）、
// 普通 / 精英（阈值分段）/ 第三十层非最终与最终阶段 / 第五十层（大型）、刀光宽度、音乐（起点、淡入淡出、暂停续放）、跳过 / 暂停 / 失焦 / 重试 / 换场景、
// 不同帧率、清理（原场景、灯光、镜头、控制全部复原），以及原有功能的回归。
// 都按真实的输入、出招、结算、演出代码推进（__qinglan.tick），不另写一套。
// 用法（预览）：const T = await import('/tools/r27_tests.js?v=' + Date.now()); await T.setup(); … 长的放 setTimeout 里跑（见 runAll）
import * as T25 from './r25_tests.js';
import { FINALE as F } from '/src/game/inkFinaleConfig.js';

const Q = () => window.__qinglan;
const r2 = (v) => +(+v).toFixed(2), r3 = (v) => +(+v).toFixed(3);
export const { PLAZA, run, foes, clearFoes, skyQuiet, fresh, charge, equip, lastAct, inkShot } = T25;
export async function setup() { return T25.setup(); }

// 起一次处决（普通敌人，演武广场），返回演出对象（还没开演时推进到开演）
export function startShow({ list = [['shade', 3.2, 0]], hps = [8], at = PLAZA, hpMax = 100, hold = 3.15 } = {}) {
  const A = Q(), Fn = A.finale;
  fresh(at); Fn.debugGive();
  const es = foes(list, { hp: hpMax }); es.forEach((e, k) => { if (hps[k] != null) e.hp = hps[k]; });
  charge(hold);
  for (let i = 0; i < 120 && !Fn.show; i++) A.tick(1 / 60, 1, false);
  return { S: Fn.show, es };
}
// 推到演出时刻 t（只推进不画）
export function to(t, dt = 1 / 60) { const A = Q(), Fn = A.finale; let n = 0; while (Fn.show && Fn.show.t < t - 1e-6 && n++ < 4000) A.tick(dt, 1, false); return Fn.show ? r3(Fn.show.t) : null; }
// 按演出时刻截图（docs/screenshots/<prefix>_<时刻 × 100>.jpg）
export async function shots(prefix, times, { w = 960, h = 540, start = null } = {}) {
  const A = Q(), Fn = A.finale;
  skyQuiet(false); A.TIME.hour = 10;
  const st = start ? await start() : startShow();
  const S = Fn.show;
  if (!S) { skyQuiet(true); return { err: 'no show', why: lastAct('iai_slash')?.act?.finale?.why ?? null, rec: Fn.rec }; }
  const out = [];
  for (const t of times) {
    to(t);
    if (!Fn.show) break;
    A.tick(1 / 60, 1, true);
    const r = await A.shot(`${prefix}_${String(Math.round(t * 100)).padStart(4, '0')}`, { w, h });
    out.push({ t: r2(Fn.show?.t ?? -1), kb: r.kb, fx: A.finFx.census() });
  }
  const level = S.level, why = S.plan.why;
  while (Fn.active) A.tick(1 / 60, 1, false);
  skyQuiet(true);
  return { level, why, shots: out, events: Fn.events.slice(-40).map((e) => `${e.kind}@${e.t}`) };
}

// =====================================================================================
// Boss：第三十层（一阶段非最终 / 二阶段最终）、第五十层（大型目标）。同一套 16 秒演出，只在结算上区分：
// 非最终阶段——收刀合拢时只结束这一阶段（独立生命池清空），转阶段过场延到演出交还之后才放；最终阶段——整场胜利（胜利过场同样在交还之后）
// shotsAt：按演出时刻截图（prefix 必填）；返回时间线与结算
// =====================================================================================
export async function bossShow(kind = 'boss30', { phase = 1, ratio = 0.08, shotsAt = null, prefix = null, w = 960, h = 540, keepCine = false, probe = null } = {}) {
  const A = Q(), Fn = A.finale;
  if (A.ui.panelOpen) A.ui.closePanel();                 // 上一项留下的结算面板（打开着时不能出手）
  let f, place;
  if (kind === 'boss30') {
    const B24 = await import('./r24_tests.js');
    if (A.world.name !== 'boss30') await B24.setup({ ai: false });
    f = A.game.boss30;
    f.cine.forceSkip = !keepCine;
    await B24.fight({ ai: false });
    if (f.phase !== phase) f.debug.phase(phase);
    f.debugUsed = false; f.god = false;
    place = () => { const b = f.root, yaw = f.rig.yaw; B24.place(b.x + Math.sin(yaw) * 3.4, b.z + Math.cos(yaw) * 3.4); };
  } else {
    const B16 = await import('./r16_boss_bot.js');
    if (A.world.name !== 'boss50') { await A.game.towerRoom.enter(); run([], 0.5); await A.boss50.enter(); run([], 1); }
    f = A.boss50;
    f.resetFight(false); f.debug.start(); run([], 0.5); f.debug.skip(); run([], 1.5);
    if (phase === 2 && f.phase !== 2) { f.debug.phase?.(2); run([], 0.3); if (f.cine?.active) { f.cine.skip?.(); run([], 0.5); } }
    f.debugUsed = false;
    place = () => B16.stage({ d: 3.6 });
  }
  if (A.ui.panelOpen) A.ui.closePanel();
  place();
  f.unit.hp = f.unit.maxHp * ratio;
  Fn.debugGive();
  const ex0 = Fn.stats.execs, cm0 = Fn.stats.commits, rec0 = Fn.rec;
  const L = A.loadout, i = L.slotOf('power');
  skyQuiet(false);
  L.pressSlot(i, true); run([], 3.15, () => { if (f.B) f.B.gapT = 99; }); L.pressSlot(i, false);
  const tl = { showAt: null, commitT: null, stateAtCommit: null, cineAtCommit: null, endAt: null, cineAfter: null, stateAfter: null, level: null };
  for (let k = 0; k < 200 && !(Fn.show && Fn.rec !== rec0); k++) A.tick(1 / 60, 1, false);
  const S = Fn.show;
  if (!S) { skyQuiet(true); return { err: 'no show', why: lastAct('iai_slash')?.act?.finale?.why ?? null, state: f.state }; }
  tl.level = S.level; tl.showAt = 0;
  const shots = [];
  const times = shotsAt ? shotsAt.slice() : [];
  let tt = 0;
  while (Fn.active && tt < 30) {
    if (times.length && Fn.show && Fn.show.t >= times[0] - 1e-6) {
      const t0 = times.shift(); A.tick(1 / 60, 1, true);
      const r = await A.shot(`${prefix}_${String(Math.round(t0 * 100)).padStart(4, '0')}`, { w, h }); shots.push({ t: r2(Fn.show?.t ?? -1), kb: r.kb });
      continue;
    }
    A.tick(1 / 60, 1, false); tt += 1 / 60;
    probe?.(Fn.show);
    if (Fn.rec !== rec0 && Fn.rec?.committed && tl.commitT == null) { tl.commitT = r3(Fn.show?.t ?? -1); tl.stateAtCommit = f.state; tl.cineAtCommit = f.cine?.cur?.name || null; }
  }
  tl.endAt = r2(tt); tl.cineAfter = f.cine?.cur?.name || (f.cine?.active ? 'active' : null); tl.stateAfter = f.state;
  const rec = Fn.rec ? { ...Fn.rec } : null;
  const res = { kind, phase, ratio, level: tl.level, final: rec?.final, stage: rec?.stage, execs: Fn.stats.execs - ex0, commits: Fn.stats.commits - cm0, tl, shots };
  // 过场放完（自检里跳过）、回到战斗
  if (f.cine?.active) { run([], 0.4); f.cine.skip?.(); run([], 0.6); }
  res.after = { state: f.state, phase: f.phase, hp: Math.round(f.unit.hp), max: Math.round(f.unit.maxHp), alive: f.unit.alive, rewarded: !!f.rewarded };
  skyQuiet(true);
  return res;
}

// =====================================================================================
// 规则：沿用第二十五轮与演出形式无关的自检（墨势、蓄力、×2、主目标、阈值、阶段比例、保护、跳过、暂停、换场景、重试）
// =====================================================================================
export const { unlockRun, aliasRun, stackRun, invalidHitRun, timeoutRun, chargeRun, counterRun, thresholdRun, belowRun, primaryRun, stageRatioRun, protectRun, skipRun, pauseRun, sceneRun, retryRun } = T25;

// 改名：显示名称「墨里终焉」（格子的标签、图标字、悬停提示、剑诀面板、墨势签、演出覆盖层）；内部 id 与存档里的解锁标记不变
export function renameRun() {
  const A = Q(), Fn = A.finale, out = {};
  fresh();
  Fn.debugGive(18); A.tick(1 / 60, 1, false);
  const tip = () => document.querySelector('#combat-hud .ink-tip'), slot = () => document.querySelector('#combat-hud .slot.power');
  out.count = tip()?.querySelector('.ct')?.textContent;
  Fn.debugGive(); A.tick(1 / 60, 1, false);
  out.ready = tip()?.querySelector('.rd')?.textContent;
  out.slot = { em: slot()?.querySelector('em')?.textContent, glyph: slot()?.querySelector('.g')?.textContent, title: slot()?.title };
  const L = A.loadout, i = L.slotOf('power');
  L.pressSlot(i, true); run([], 1.5);
  out.charging = tip()?.querySelector('.ct')?.textContent;
  run([], 1.7);
  out.full = tip()?.querySelector('.ct')?.textContent;
  L.pressSlot(i, false); run([], 0.8);
  out.overlay = document.querySelector('.ink-ov')?.textContent?.trim();
  out.ids = { id: F.id, form: A.state.d.skillUp?.power?.form, unlocked: Fn.unlocked };
  const texts = [out.count, out.ready, out.slot.em, out.slot.title, out.charging, out.full, out.overlay].join('|');
  out.oldName = /终式/.test(texts);
  out.ok = F.name === '墨里终焉' && out.ready === '墨势已成 · 满蓄力可施展墨里终焉' && out.slot.em === '终焉' && out.slot.glyph === '墨' && /^墨里终焉/.test(out.slot.title || '')
    && /^墨里终焉蓄势 1\.5／3\.0 秒$/.test(out.charging || '') && out.full === '墨里终焉 · 满蓄力（松开出刀）'
    && out.overlay === F.text.skip && out.ids.id === 'inkFinale' && out.ids.form === 'inkFinale' && out.ids.unlocked && !out.oldName;
  return out;
}
// 剑诀面板：拔刀斩那张卡按升级形态显示（名字、图标字、说明）
export async function panelRun() {
  const A = Q(), out = {};
  const { openLoadoutPanel } = await import('/src/ui/loadoutPanel.js');
  openLoadoutPanel(A.game);
  const panel = document.querySelector('#panel');
  const card = [...(panel?.querySelectorAll('.lo-card') || [])].find((c) => c.dataset.id === 'power');
  const slot = [...(panel?.querySelectorAll('.lo-slot') || [])].find((c) => c.classList.contains('k-power'));
  out.card = card ? { name: card.querySelector('.hd b')?.textContent, glyph: card.querySelector('.g')?.textContent, tag: card.querySelector('.tag.up')?.textContent, ink: card.querySelector('.up-mode.ink')?.textContent?.slice(0, 60), tags: [...card.querySelectorAll('.kv2 em')].map((e) => e.textContent) } : null;
  out.slot = slot ? { name: slot.querySelector('.nm b')?.textContent, glyph: slot.querySelector('.g')?.textContent } : null;
  if (A.ui.panelOpen) A.ui.closePanel();
  out.ok = out.card?.name === '墨里终焉' && out.card.glyph === '墨' && /墨里终焉/.test(out.card.ink || '') && out.slot?.name === '墨里终焉' && out.slot.glyph === '墨';
  return out;
}

// =====================================================================================
// 时间线：统一的 16 秒（普通敌人）——各事件的演出时刻、收刀合拢（清响 + 刀光 + 提交）同一帧、各只一次
// =====================================================================================
export function timelineRun(dt = 1 / 60) {
  const A = Q(), Fn = A.finale, X = A.finFx, St = A.inkStage, out = {};
  const { S, es } = startShow();
  if (!S) return { err: 'no show' };
  const n0 = (Fn.evN || 0) - 2;
  const seen = {}, first = (k, t) => { if (seen[k] == null) seen[k] = r3(t); };
  let lastT = 0, bothFrom = null, both = 0;
  while (Fn.show) {
    A.tick(dt, 1, false);
    const s = Fn.show; if (!s) break;
    const t = s.t, c = X.census(), sc = St.census();
    if (sc.R > 0) first('landscape', t);
    if (sc.islands > 0) first('islands', t);
    if (c.scroll) first('scroll', t);
    if (c.knot) first('knot', t);
    if (c.calliP[0] > 0) first('calligraphy', t);
    if (c.calliP[3] >= 1) first('calligraphyDone', t);
    if (c.calli < 1 && seen.calligraphy != null) first('calligraphyFade', t);
    if (c.phoenix && c.dragon && t < F.show.crash[0] + 0.05) { if (bothFrom == null) bothFrom = t; both = t - bothFrom; }
    if (c.bagua) first('bagua', t);
    if (c.ribbons > 0) first('ribbons', t);
    if (c.slash) first('slash', t);
    if (c.title) first('title', t);
    if (s.walkPh > 0) first('walk', t);
    if (s.frozen) first('freeze', t);
    if (s.exited) first('exit', t);
    lastT = t;
  }
  const ev = Fn.events.filter((e) => e.n > n0);
  const at = (k, name) => ev.find((e) => e.kind === k && (name == null || e.name === name))?.t ?? null;
  const cnt = (k) => ev.filter((e) => e.kind === k).length;
  out.events = { confirm: 0, ...seen, pass: at('pass'), noto: at('sfx', 'noto'), burstSnd: at('sfx', 'inkBurst'), inkTarget: at('inkTarget'), both: r3(both), lastT: r3(lastT) };
  out.sounds = ev.filter((e) => e.kind === 'sfx').map((e) => `${e.name}@${e.t}`);
  out.counts = { show: cnt('show'), commit: cnt('commit'), end: cnt('end'), cleanup: cnt('cleanup'), freeze: cnt('freeze'), exit: cnt('exit') };
  out.rec = Fn.rec ? { committed: Fn.rec.committed, src: Fn.rec.src, level: Fn.rec.level } : null;
  out.alive = es[0].alive;
  const E = out.events, near = (x, y, tol = dt + 1e-3) => x != null && Math.abs(x - y) <= tol;
  out.ok = near(E.slash, 13.2) && near(E.noto, 13.2) && E.landscape != null && E.landscape >= 0.6 - dt && E.landscape <= 0.7 && E.islands < 1.6 && E.scroll < 2.45 && E.calligraphy >= 2.8 && E.calligraphy <= 2.95 && E.calligraphyDone <= 4.35
    && E.walk >= 4 - dt && E.walk <= 4.1 && E.pass > 6.0 && E.pass < 6.5 && E.both >= 2.0 && E.bagua >= 10.5 && E.bagua <= 10.65 && E.ribbons >= 11.45 && E.ribbons <= 11.6 && E.calligraphyFade >= 9.45 && E.calligraphyFade < 10.4
    && near(E.freeze, 14.8) && near(E.exit, 15.6) && E.title >= 14.65 && E.title <= 14.8 && out.counts.show === 1 && out.counts.commit === 1 && out.counts.end === 1 && out.counts.cleanup === 1
    && out.rec?.committed && out.rec?.src === 'sheathe' && !out.alive && E.lastT >= 16 - dt - 2e-3 && E.lastT <= 16 + dt;
  return out;
}
// 不同帧率：30 / 60 / 144——关键事件的演出时刻差不超过一帧，各只一次
export function fps27Run(rates = [30, 60, 144]) {
  const out = {};
  for (const hz of rates) {
    const r = timelineRun(1 / hz);
    out[hz] = { ok: r.ok, slash: r.events?.slash, noto: r.events?.noto, pass: r.events?.pass, freeze: r.events?.freeze, exit: r.events?.exit, end: r.events?.lastT, both: r.events?.both, counts: r.counts };
  }
  const v = rates.map((hz) => out[hz]);
  out.ok = v.every((x, k) => x.ok && Math.abs(x.slash - 13.2) <= 1 / rates[k] + 1e-3 && Math.abs(x.freeze - 14.8) <= 1 / rates[k] + 1e-3 && x.counts?.commit === 1);
  return out;
}

// 刀光：横贯切口、宽度为画面宽度的 95%–110%（按距离、视角、宽高比求）、可见 0.12–0.2 秒、与收刀清响和提交同一帧
export function slashRun() {
  const A = Q(), Fn = A.finale, X = A.finFx, out = {};
  const keep = A.camera.aspect;
  A.camera.aspect = 16 / 9; A.camera.updateProjectionMatrix();
  startShow();
  to(13.0);
  let vis0 = null, vis1 = null, commitT = null, frac = null;
  const n0 = Fn.evN || 0;
  while (Fn.show && Fn.show.t < 13.8) {
    A.tick(1 / 60, 1, false);
    const t = Fn.show?.t ?? 99, c = X.census();
    if (c.slash && vis0 == null) { vis0 = t; frac = c.slashFrac; }
    if (vis0 != null && !c.slash && vis1 == null) vis1 = t;
    if (Fn.rec?.committed && commitT == null) commitT = t;
  }
  const noto = Fn.events.find((e) => e.n > n0 && e.kind === 'sfx' && e.name === 'noto')?.t ?? null;
  while (Fn.active) A.tick(1 / 60, 1, false);
  A.camera.aspect = keep; A.camera.updateProjectionMatrix();
  out.slash = { from: r3(vis0), to: r3(vis1), secs: r3((vis1 ?? 0) - (vis0 ?? 0)), frac, commitT: r3(commitT), noto };
  out.ok = vis0 != null && Math.abs(vis0 - commitT) < 1e-6 && Math.abs(noto - vis0) <= 1 / 60 + 1e-3 && out.slash.secs >= 0.12 - 1 / 60 && out.slash.secs <= 0.2 + 1 / 60 && frac >= 0.95 && frac <= 1.1;
  return out;
}

// 龙凤：身前四分之三机位里同框（都在画面内）≥ 2 秒；不挡玩家的脸与双手（投影后保持距离）；凤身、龙头出画的时间都短
export function birdsRun() {
  const A = Q(), Fn = A.finale, X = A.finFx, cam = A.camera, out = {};
  const keep = cam.aspect; cam.aspect = 16 / 9; cam.updateProjectionMatrix();
  startShow();
  to(7.9);
  const V = A.THREE.Vector3, ch = A.player.char;
  const ndc = (p) => p.clone().project(cam);
  const inFrame = (v) => Math.abs(v.x) < 0.98 && Math.abs(v.y) < 0.98 && v.z < 1;
  let together = 0, blocked = 0, frames = 0;
  const maxOut = { phx: 0, dg: 0 }, runOut = { phx: 0, dg: 0 };
  while (Fn.show && Fn.show.t < F.show.crash[0]) {
    A.tick(1 / 60, 1, false);
    if (!Fn.show) break;
    cam.updateMatrixWorld();
    const ph = X.phx?.root.visible ? ndc(X.phx.root.position) : null, hd = X.loong?.root.visible ? ndc(X.loong.snout(new V())) : null;
    if (ph && hd && inFrame(ph) && inFrame(hd)) together += 1 / 60;
    for (const [k, v] of [['phx', ph], ['dg', hd]]) { if (v && !inFrame(v)) { runOut[k] += 1 / 60; maxOut[k] = Math.max(maxOut[k], runOut[k]); } else runOut[k] = 0; }
    const pts = [ch.bones[5].getWorldPosition(new V()), ch.handBone?.getWorldPosition(new V())].filter(Boolean).map(ndc);
    for (const b of [ph, hd]) if (b && pts.some((p) => Math.hypot(p.x - b.x, (p.y - b.y) / (16 / 9)) < 0.16)) blocked++;
    frames++;
  }
  while (Fn.active) A.tick(1 / 60, 1, false);
  cam.aspect = keep; cam.updateProjectionMatrix();
  out.together = r2(together); out.blockedFrames = blocked; out.frames = frames; out.longestOut = { phx: r2(maxOut.phx), dg: r2(maxOut.dg) };
  out.ok = together >= 2.0 && blocked <= frames * 0.05 && maxOut.phx < 0.6 && maxOut.dg < 0.6;
  return out;
}

// 站位分档：开阔处 full；墙边、悬崖边收紧（near / tight）或局部演出空间（local）——都是同一套 16 秒完整流程，终点合法（在地面上、不在墙里）
export function levelsRun() {
  const A = Q(), cw = A.cw, out = {};
  const one = (list, o) => {
    const r = T25.inkShot(list, { hps: [8], secs: 20, ...o });
    const P = A.player.pos, g = A.player.groundAt(P.x, P.z, P.y + 0.6, 0.6), q = P.clone();
    cw.pushCircle?.(q, 0.34, 1.72, 0.46);
    return { level: r.rec?.level, why: r.rec?.why, execs: r.execs, commits: r.commits, showSecs: r.endT != null && r.showT != null ? r2(r.endT - r.showT) : null, onGround: Math.abs(g - P.y) < 0.3, inWall: Math.hypot(q.x - P.x, q.z - P.z) > 0.05, alive: r.es[0].alive };
  };
  out.open = one([['shade', 3.0, 0]], {});
  const ang = 1.374, d = { x: Math.sin(ang), y: 0, z: Math.cos(ang) }, o = new A.THREE.Vector3(0, 15.2, 26), t = cw.ray(o, d, 40);
  out.wall = one([['shade', 3.0, 0]], { at: { x: o.x + d.x * (t - 4.3), z: o.z + d.z * (t - 4.3) }, yaw: ang });
  out.wallTight = one([['shade', 1.6, 0]], { at: { x: o.x + d.x * (t - 2.2), z: o.z + d.z * (t - 2.2) }, yaw: ang });
  out.cliff = one([['shade', 3.0, 0]], { at: { x: -29.6, z: 10, y: 19.1 }, yaw: Math.PI / 2 });
  const all = [out.open, out.wall, out.wallTight, out.cliff];
  out.ok = out.open.level === 'full' && all.every((x) => x.execs === 1 && x.commits === 1 && x.showSecs != null && x.showSecs >= 15.9 && x.showSecs <= 16.4 && x.onGround && !x.inWall && !x.alive)
    && all.some((x) => x.level !== 'full');
  return out;
}

// 阈值分段的精英（共享生命条）：第一段 ≤10% → 同一套 16 秒演出，只结束这一段（推到阈值、转段）、不死；第二段 ≤10% → 最终阶段：倒下
export function stagedRun() {
  const A = Q(), Fn = A.finale, out = {};
  const r1 = T25.inkShot([['eliteStaged', 3.2, 0]], { hps: [0.54 * 520], hpMax: 520, secs: 20 });
  const e1 = r1.es[0];
  out.stage0 = { level: r1.rec?.level, final: r1.rec?.final, execs: r1.execs, commits: r1.commits, alive: e1.alive, hp: r2(e1.hp), stageIdx: e1.stageIdx, showSecs: r1.endT != null ? r2(r1.endT - r1.showT) : null };
  fresh(); Fn.debugGive();
  const [e3] = foes([['eliteStaged', 3.2, 0]], { hp: 520 }); e3.stageIdx = 1; e3.hp = 0.04 * 520;
  const ex0 = Fn.stats.execs, rec0 = Fn.rec; charge(3.15);
  let endT = null, t0 = null;
  run([], 20, (t) => { if (Fn.show && t0 == null) t0 = t; if (Fn.rec !== rec0 && Fn.rec?.done && endT == null) endT = t; return endT == null; });
  out.stage1 = { final: Fn.rec?.final, execs: Fn.stats.execs - ex0, alive: e3.alive, committed: Fn.rec?.committed, showSecs: endT != null && t0 != null ? r2(endT - t0) : null };
  // 第二十九轮：只有最后一条命放演出——第一段不处决（强化一刀打到本段的底、照常转段），第二段（最后一条命）处决
  out.ok = out.stage0.execs === 0 && out.stage0.commits === 0 && out.stage0.alive && out.stage0.stageIdx === 1 && Math.abs(out.stage0.hp - 260) < 0.01
    && out.stage1.final && out.stage1.execs === 1 && out.stage1.committed && !out.stage1.alive && out.stage1.showSecs >= 15.9;
  return out;
}

// Boss：第三十层一阶段 / 二阶段、第五十层一阶段——同一套 16 秒演出，结算区分、过场顺序（演出 → 交还 → 过场 → 恢复）
export async function bossRun() {
  const out = {};
  out.b30p1 = await bossShow('boss30', { phase: 1 });
  out.b30p2 = await bossShow('boss30', { phase: 2 });
  out.b50p1 = await bossShow('boss50', { phase: 1 });
  out.b50p2 = await bossShow('boss50', { phase: 2 });
  const A = Q(); if (A.ui.panelOpen) A.ui.closePanel();
  const p1 = out.b30p1, p2 = out.b30p2, d1 = out.b50p1, d2 = out.b50p2;
  const showOK = (x) => x.execs === 1 && x.commits === 1 && Math.abs((x.tl.commitT ?? 0) - 13.2) < 0.02 && x.tl.endAt >= 15.6;
  out.ok = p1.err === 'no show' && p1.why === 'notFinal'
    && showOK(p2) && p2.final && p2.tl.stateAtCommit === 'victory' && !p2.tl.cineAtCommit && p2.tl.cineAfter === 'victory'
    && d1.err === 'no show' && d1.why === 'notFinal' && showOK(d2) && d2.final;
  return out;
}

// 清理：演出结束后原场景（渲染层）、灯光、镜头、控制、界面、音乐、演出物件全部复原；连续三次无累积
export function cleanupRun(n = 3) {
  const A = Q(), Fn = A.finale, St = A.inkStage, Rr = A.renderer, out = { runs: [] };
  const masks = () => { let m = 0; A.scene.traverse((o) => { if (o.layers.mask !== 1) m++; }); return m; };
  const red = new A.THREE.PointLight(0xff2a10, 3, 30); red.position.set(0, 17, 26); red.name = 'r27-test-red'; A.scene.add(red);
  const m0 = masks(), g0 = Rr.info.memory.geometries, x0 = Rr.info.memory.textures;
  let dimmed = null;
  for (let k = 0; k < n; k++) {
    const r = T25.inkShot([['shade', 3.2, 0]], { hps: [8], secs: 20, each: () => { if (A.finale.show && A.finale.show.t > 5 && dimmed == null) dimmed = { i: +red.intensity.toFixed(3), c: red.color.getHexString() }; } });
    run([], 1.0);
    const c = A.finFx.census(), sc = St.census();
    out.runs.push({ execs: r.execs, commits: r.commits, end: r.endT != null, masks: masks(), lights: red.intensity === 3 && red.color.getHex() === 0xff2a10 && St.lights.length === 0 && St.lightK === 0, freeCam: !!A.game.freeCam, blend: !!Fn.blend, ctl: A.player.ctl.lock, camEnabled: A.cam.enabled,
      body: document.body.classList.contains('ink-show'), paper: A.post?.paper ?? 0, hold: A.post?.hold ?? 0, stage: sc, fx: { scroll: c.scroll, bagua: c.bagua, phoenix: c.phoenix, dragon: c.dragon, title: c.title, sprites: c.sprites },
      music: A.game.sound.cueState?.('ml')?.state ?? null, duck: A.game.sound.musicDuck ? +A.game.sound.musicDuck.gain.value.toFixed(2) : null });
  }
  A.scene.remove(red); red.dispose?.();
  out.m0 = m0; out.dimmed = dimmed; out.geos = Rr.info.memory.geometries - g0; out.texs = Rr.info.memory.textures - x0;
  out.ok = dimmed != null && dimmed.i < 1 && out.runs.every((x) => x.execs === 1 && x.commits === 1 && x.end && x.masks === m0 && x.lights && !x.freeCam && !x.ctl && x.camEnabled && !x.body && x.paper === 0 && x.hold === 0
    && !x.stage.active && x.stage.hidden === 0 && !x.fx.scroll && !x.fx.bagua && !x.fx.phoenix && !x.fx.dragon && !x.fx.title && x.fx.sprites === 0 && (x.music == null || ['idle', 'stopping'].includes(x.music)))
    && out.geos <= 2 && out.texs <= 1;
  return out;
}

// 音乐：确认处决才起（从 33 秒）、淡入 0.2 秒；暂停时停住、恢复时由演出时刻对应的位置接着放（不补算）；退场淡出 0.5 秒；场景音乐压低、交还时复原
export function musicRun() {
  const A = Q(), Fn = A.finale, S = A.game.sound, out = {};
  const calls = [];
  const keep = {};
  for (const k of ['cue', 'cuePause', 'cueResume', 'cueStop', 'cueGain', 'duckMusic']) {
    keep[k] = Object.prototype.hasOwnProperty.call(S, k) ? S[k] : null;
    const f = Object.getPrototypeOf(S)[k];
    S[k] = function (...a) { calls.push([k, r3(Fn.show?.t ?? -1), ...a.map((x) => (x && typeof x === 'object' ? JSON.stringify(x) : x))]); return f.apply(this, a); };
  }
  const paused0 = Fn.paused; let fakePause = false; Fn.paused = () => fakePause;
  fresh(); const [e0] = foes([['shade', 3.2, 0]], { hp: 100000 }); charge(3.15); run([], 1.5);   // 没有墨势：普通拔刀斩（打不死，第二十九轮起打死只剩的一个会走通用的终结），不起音乐
  out.noFinale = calls.filter((c) => c[0] === 'cue').length;
  startShow();
  to(5.0);
  fakePause = true; for (let i = 0; i < 30; i++) A.tick(1 / 60, 1, false);
  fakePause = false; A.tick(1 / 60, 1, false);
  while (Fn.active) A.tick(1 / 60, 1, false);
  Fn.paused = paused0;
  for (const [k, v] of Object.entries(keep)) { if (v) S[k] = v; else delete S[k]; }
  const cue = calls.find((c) => c[0] === 'cue'), pause = calls.find((c) => c[0] === 'cuePause'), resume = calls.find((c) => c[0] === 'cueResume'), stop = calls.find((c) => c[0] === 'cueStop');
  const op = cue ? JSON.parse(cue[4]) : {};
  out.cue = cue ? { t: cue[1], url: cue[3], at: op.at, fadeIn: op.fadeIn } : null;
  out.pause = pause ? pause[1] : null; out.resume = resume ? { t: resume[1], pos: resume[3] } : null; out.stop = stop ? { t: stop[1], fade: stop[3] } : null;
  const ducks = calls.filter((c) => c[0] === 'duckMusic');
  out.ducks = ducks.map((d) => [d[1], d[2], d[3]]);
  // 收刀合拢前后音乐让开：13.0 秒压到 0.4、13.55 秒回升（第二十八轮：龙凤砸入时另有一次让开 F.quake.duck，由 r28_tests 核对；这里只看收刀前后的）
  const D = F.music.dip, allDips = calls.filter((c) => c[0] === 'cueGain'), dips = allDips.filter((c) => c[1] >= D.at - 0.3);
  out.dips = allDips.map((d) => [d[1], d[3], d[4]]);
  const dipOk = dips.length === 2 && Math.abs(dips[0][1] - D.at) < 0.02 && dips[0][3] === D.k && Math.abs(dips[1][1] - D.back) < 0.02 && dips[1][3] === 1;
  // 音乐在演出开始的那一刻（Show 的构造里，演出时刻 0、Fn.show 还没赋值，记作 −1）起
  // 第二十九轮：演出音乐在 cueAt（山水铺开之前 0.1 秒）起，续放的位置 = start + (t − cueAt)
  out.ok = out.noFinale === 0 && Math.abs(out.cue?.t - F.music.cueAt) <= 1 / 60 + 1e-3 && out.cue.at === F.music.start && out.cue.fadeIn === F.music.fadeIn && /tunetank-china-epic-background-music-349892\.mp3$/.test(out.cue.url)
    && out.pause != null && out.resume != null && Math.abs(out.resume.pos - (F.music.start + out.resume.t - F.music.cueAt)) < 0.05 && out.stop && Math.abs(out.stop.t - 15.6) < 0.02 && out.stop.fade === F.music.fadeOut
    && ducks.length >= 2 && ducks[0][2] === F.feel.duck && ducks[ducks.length - 1][2] === 1 && dipOk;
  return out;
}

// 原有的凤凰、雷龙、普通拔刀斩不受影响：演出实例的材质另做（原技能材质的缓存键不变）；没有墨势的拔刀斩照旧
export function isolationRun() {
  const A = Q(), out = {};
  const sig = () => ({ phx: A.phoenix.rig?.materials?.map((m) => m.customProgramCacheKey?.()).join(','), loong: A.dragon.rig?.materials?.map((m) => m.customProgramCacheKey?.()).join(','),
    inkPhx: A.finFx.phx?.materials?.map((m) => m.customProgramCacheKey?.()).join(','), inkLoong: A.finFx.loong?.materials?.map((m) => m.customProgramCacheKey?.()).join(',') });
  const s0 = sig();
  T25.inkShot([['shade', 3.2, 0]], { hps: [8], secs: 20 });
  const s1 = sig();
  fresh(); const [e] = foes([['shade', 3.2, 0]], { hp: 100000 }); const id0 = A.moves.seq;
  charge(3.15); run([], 1.2);
  const a = T25.lastAct('iai_slash');
  out.normal = { slash: !!a && a.id > id0, finale: !!a?.act?.finale, active: A.finale.active, dmg: Math.round(100000 - e.hp) };
  out.s0 = s0; out.s1 = s1;
  out.ok = s0.phx === s1.phx && s0.loong === s1.loong && s0.inkPhx === s1.inkPhx && s0.inkLoong === s1.inkLoong && !/ink-r27/.test(s1.phx || '') && !/ink-r27/.test(s1.loong || '') && out.normal.slash && !out.normal.finale && !out.normal.active && out.normal.dmg > 0;
  return out;
}

// =====================================================================================
// 退场叠化（看画面）：演出最后一帧被留住，之后按墨晕一块块化开、露出回到第三人称的画面。整屏取 32 × 18 个点，
// 每一帧与留住的那一帧一致的比例应由约 100% 一路降到很低（中间不能反着变多、不能一下跳回）；交还之后是回来的画面
// =====================================================================================
export function crossfadeRun({ w = 960, h = 540 } = {}) {
  const A = Q(), Fn = A.finale, R0 = A.renderer, gl = R0.getContext(), post = A.post, THREE = A.THREE;
  const keep = R0.getSize(new THREE.Vector2()), pr = R0.getPixelRatio(), asp = A.camera.aspect;
  const out = { frames: [] }, GX = 32, GY = 18, buf = new Uint8Array(w * h * 4);
  const grab = () => {
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const v = [];
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) { const o = (Math.floor((j + 0.5) * h / GY) * w + Math.floor((i + 0.5) * w / GX)) * 4; v.push(buf[o], buf[o + 1], buf[o + 2]); }
    return v;
  };
  const same = (a, b) => { let n = 0; for (let k = 0; k < a.length; k += 3) if (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) < 24) n++; return n / (a.length / 3); };
  try {
    R0.setPixelRatio(1); R0.setSize(w, h, false); A.camera.aspect = w / h; A.camera.updateProjectionMatrix();
    startShow(); to(15.5);
    let ref = null;
    const h0 = post.heldN || 0;
    out.fxAfter = 0;                                                  // 叠化开始后还在画的演出物（墨带、画卷、八卦、题字、龙凤）：应为 0
    while (Fn.active) {
      A.tick(1 / 60, 1, true);
      const S = Fn.show, v = grab();
      if (!ref && (post.heldN || 0) > h0) { ref = v; continue; }     // 留住的那一帧（这一帧画完时拷下来的）
      if (ref && S) {
        out.frames.push({ t: r3(S.t), hold: r2(post.hold), same: r2(same(v, ref)) });
        if (S.exitApplied) { const c = A.finFx.census(); out.fxAfter = Math.max(out.fxAfter, (c.ribbons || 0) + (c.flows || 0) + [c.scroll, c.bagua, c.title, c.phoenix, c.dragon].filter(Boolean).length); }
      }
    }
    for (let k = 0; k < 6; k++) A.tick(1 / 60, 1, true);
    out.after = ref ? r2(same(grab(), ref)) : null;
  } finally { R0.setPixelRatio(pr); R0.setSize(keep.x, keep.y, false); A.camera.aspect = asp; A.camera.updateProjectionMatrix(); }
  const f = out.frames, first = f.find((x) => x.hold > 0.9), last = f[f.length - 1];
  let ups = 0; for (let k = 1; k < f.length; k++) if (f[k].same > f[k - 1].same + 0.08) ups++;
  out.first = first ?? null; out.last = last ?? null; out.ups = ups;
  out.ok = !!first && first.same > 0.9 && !!last && last.same < 0.35 && ups === 0 && out.after != null && out.after < 0.35 && out.fxAfter === 0;
  return out;
}

// =====================================================================================
// 构图：入场镜头（演出 0.3 秒）里敌人的投影高度占画面高度的比例（要求 35%–50%）、躯干（半身高处）离画面中心多远（NDC：画面半宽、半高为 1）。
// 按演出用的体型（adapter.size 的身高）算一次，再按模型实际的包围盒（同一竖线上的最低、最高点）算一次。普通敌人、第三十层剑尊、第五十层龙君
// =====================================================================================
export async function framingRun({ at = 0.3 } = {}) {
  const A = Q(), Fn = A.finale, R0 = A.renderer, THREE = A.THREE;
  const keep = R0.getSize(new THREE.Vector2()), asp = A.camera.aspect;
  const measure = (S) => {
    const cam = A.camera, e = S.e, h = S.size.h, E = S.E;
    cam.updateMatrixWorld();
    const ndc = (x, y, z) => new THREE.Vector3(x, y, z).project(cam);
    const feet = ndc(E.x, E.y, E.z), head = ndc(E.x, E.y + h, E.z), torso = ndc(E.x, E.y + h * 0.5, E.z);
    const r = { t: r3(S.t), h: r2(h), frac: r3((head.y - feet.y) / 2), torso: [r3(torso.x), r3(torso.y)] };
    const root = Fn.adapter(e).root(e);
    if (root) {
      root.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(root);
      if (!b.isEmpty()) { const c = b.getCenter(new THREE.Vector3()); r.boxH = r2(b.max.y - b.min.y); r.boxFrac = r3((ndc(c.x, b.max.y, c.z).y - ndc(c.x, b.min.y, c.z).y) / 2); }
    }
    return r;
  };
  const out = {};
  R0.setSize(1280, 720, false); A.camera.aspect = 16 / 9; A.camera.updateProjectionMatrix();
  try {
    if (A.world.name !== 'surface') { await A.game.switchWorld('surface'); run([], 0.5); }   // runAll 里排在首领之后（还在首领场地）
    if (A.ui.panelOpen) A.ui.closePanel();
    startShow(); to(at);
    out.normal = Fn.show ? { ...measure(Fn.show), level: Fn.show.level } : { err: 'no show' };
    while (Fn.active) A.tick(1 / 60, 1, false);
    for (const kind of ['boss30', 'boss50']) {
      let m = null;
      const r = await bossShow(kind, { phase: 2, probe: (S) => { if (!m && S && S.t >= at - 1e-6) m = measure(S); } });     // 第二十九轮：最后一条命才放演出
      out[kind] = m ? { ...m, level: r.level } : { err: r.err || 'no probe' };
    }
  } finally { R0.setSize(keep.x, keep.y, false); A.camera.aspect = asp; A.camera.updateProjectionMatrix(); }
  // 判定按实际轮廓（包围盒；没有就按演出用的身高）
  const good = (r) => { const f = r?.boxFrac ?? r?.frac; return f != null && f >= 0.35 - 1e-3 && f <= 0.5 + 1e-3 && Math.abs(r.torso[0]) <= 0.1 && Math.abs(r.torso[1]) <= 0.15; };
  out.ok = good(out.normal) && good(out.boss30) && good(out.boss50);
  return out;
}

// =====================================================================================
// 性能：16 秒演出各段的每帧耗时（按 1280×720 渲染，每帧读回一个像素、等 GPU 画完再计时）、绘制调用与三角形的峰值、
// 演出中新编译的着色器程序（演出用到的材质都在载入时预热过；第一次演出时原场景里个别带透明裁切的投影物体进阴影的深度变体可能多 1 个）、
// 隐去的原场景物体数。不放进 runAll（耗时、且结果随机器变）。冷启动（刚载入、第一次演出）与第二次演出各跑一次对比
// =====================================================================================
const PERF_SEG = [['entry', 0.6], ['landscape', 2.4], ['scroll', 4.0], ['walk', 6.0], ['draw', 6.5], ['sheathe', 8.0], ['birds', 10.5], ['bagua', 11.5], ['ribbons', 13.2], ['burst', 14.8], ['freeze', 15.6], ['exit', 16.01]];
export function perf27Run({ w = 1280, h = 720, raw = false } = {}) {
  const A = Q(), Fn = A.finale, R0 = A.renderer, gl = R0.getContext(), px = new Uint8Array(4), St = A.inkStage;
  const keep = R0.getSize(new A.THREE.Vector2()), asp = A.camera.aspect;
  R0.setSize(w, h, false); A.camera.aspect = w / h; A.camera.updateProjectionMatrix();
  const frame = () => { const t0 = performance.now(); A.tick(1 / 60, 1, true); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
  const stat = (v) => { v = v.slice().sort((a, b) => a - b); return v.length ? { n: v.length, median: r2(v[Math.floor(v.length / 2)]), p95: r2(v[Math.min(v.length - 1, Math.floor(v.length * 0.95))]), max: r2(v[v.length - 1]) } : null; };
  const out = { size: [w, h], quality: A.finFx.q ?? null };
  // 天空重绘环境贴图（老问题：时辰跳变的判断写反了，第一次重绘之后每帧都重绘；后台标签页里一次 0.5–0.9 秒），与演出无关：
  // 真的重绘时记下发生在哪一帧，那几帧单独列出、不进各段统计；skyQuiet(true) 时重绘已换成空函数（几乎不花时间），不必排除（第二十八轮）
  const sky = A.sky, re0 = sky.refreshEnv, envAt = [], realEnv = !sky._refreshEnv || re0 === sky._refreshEnv;
  out.skyQuiet = !realEnv;
  if (realEnv) sky.refreshEnv = function (...a) { envAt.push(Fn.show ? r2(Fn.show.t) : null); return re0.apply(this, a); };
  try {
    fresh(); Fn.debugGive();
    const [e] = foes([['shade', 3.2, 0]], { hp: 100 }); e.hp = 8;
    for (let k = 0; k < 20; k++) frame();
    const base = []; for (let k = 0; k < 90; k++) base.push(frame());
    out.base = stat(base);
    charge(3.15);
    for (let i = 0; i < 120 && !Fn.show; i++) A.tick(1 / 60, 1, false);
    if (!Fn.show) return { ...out, ok: false, why: 'no show' };
    const prog0 = R0.info.programs?.length ?? 0, times = [];
    let peak = { calls: 0, tris: 0, t: null }, hiddenMax = 0, n = 0;
    R0.info.autoReset = false;                     // 一帧里有好几次 render（场景、柔光、合成），计数按整帧累计
    const env = [];
    while (Fn.show && n++ < 1300) {
      R0.info.reset();
      const t = Fn.show.t, e0 = envAt.length, ms = frame();
      if (envAt.length > e0) { env.push({ t: r2(t), ms: r2(ms) }); continue; }
      times.push([PERF_SEG.find(([, e2]) => t < e2)?.[0] ?? 'exit', ms, t]);
      const ri = R0.info.render;
      if (ri.calls > peak.calls) peak = { calls: ri.calls, tris: ri.triangles, t: r2(t) };
      hiddenMax = Math.max(hiddenMax, St.census?.().hidden ?? 0);
    }
    R0.info.autoReset = true;
    out.segs = {}; for (const [s] of PERF_SEG) { const v = times.filter((x) => x[0] === s).map((x) => x[1]); if (v.length) out.segs[s] = stat(v); }
    out.show = stat(times.map((x) => x[1]));
    out.peak = peak; out.newPrograms = (R0.info.programs?.length ?? 0) - prog0; out.hiddenMax = hiddenMax; out.frames = times.length + env.length; out.envRefresh = env;
    if (raw) out.raw = times.map((x) => [+x[2].toFixed(3), r2(x[1])]);   // 第二十八轮：逐帧（演出时刻、毫秒），给细分的段落用
    for (let k = 0; k < 30; k++) frame();
    const after = []; for (let k = 0; k < 90; k++) after.push(frame());
    out.after = stat(after);
    out.ok = out.newPrograms <= 1 && out.frames >= 900;
  } finally { sky.refreshEnv = re0; R0.info.autoReset = true; R0.setSize(keep.x, keep.y, false); A.camera.aspect = asp; A.camera.updateProjectionMatrix(); }
  return out;
}

// =====================================================================================
// 全部（放进 setTimeout 里跑，结果在 window.__r27all）
// =====================================================================================
export function runAll({ boss = true } = {}) {
  window.__r27all = { running: true };
  setTimeout(async () => {
    const out = {}, t0 = performance.now();
    const steps = [['rename', renameRun], ['panel', panelRun], ['unlock', unlockRun], ['alias', aliasRun], ['stack', () => stackRun()], ['invalidHit', invalidHitRun], ['timeout', timeoutRun], ['charge', chargeRun], ['counter', counterRun],
      ['threshold', thresholdRun], ['below', belowRun], ['primary', primaryRun], ['stageRatio', stageRatioRun], ['staged', stagedRun],
      ['timeline', () => timelineRun()], ['fps', () => fps27Run()], ['slash', slashRun], ['birds', birdsRun], ['levels', levelsRun], ['music', musicRun],
      ['skip', skipRun], ['pause', pauseRun], ['scene', sceneRun], ['cleanup', () => cleanupRun(3)], ['crossfade', () => crossfadeRun()], ['isolation', isolationRun]];
    if (boss) steps.push(['boss', bossRun], ['framing', () => framingRun()], ['retry', retryRun], ['protect', protectRun]);
    for (const [k, f] of steps) {
      const s0 = performance.now();
      try { out[k] = await f(); } catch (e) { out[k] = { err: String(e), stack: String(e.stack).slice(0, 400) }; }
      out[k].ms = Math.round(performance.now() - s0);
      window.__r27all = { running: true, at: k, out };
    }
    if (Q().world.name !== 'surface') await Q().game.switchWorld('surface');
    out.summary = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v?.ok ?? (v?.err ? 'ERR' : null)]));
    out.totalMs = Math.round(performance.now() - t0);
    window.__r27all = { running: false, out };
  }, 0);
  return 'started';
}
