// 第二十六轮自检：普攻第三、四式的水墨特效、雷龙俯冲撞击的压迫感、第三十层剑尊（体型、模型清晰度、佩剑 sword3、打击感与节奏）、玩家的弹反手感。
// 都按真实的输入、出招、结算、特效代码推进（__qinglan.tick），不另写一套。
// 用法（预览）：const T = await import('/tools/r26_tests.js?v=' + Date.now()); await T.setup(); …；长的放 setTimeout 里跑
import * as B from './r17_combat_bot.js';
import * as G from './r21_growth.js';
import { PLAYER_COMBAT as PC, PLAYER_MOVES as PM } from '/src/game/combatConfig.js';
import { CONFIG30 } from '/src/game/boss30Config.js';

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
  return { world: A.world.name, slots: A.loadout.slots.slice() };
}
export function equip(slots = ['qi', 'dragon', 'power', 'ult', 'seal', 'phoenix']) { return Q().loadout.debugSet(slots); }
export function fresh(at = PLAZA, yaw = at.yaw ?? PLAZA.yaw) {
  const A = Q();
  G.fresh(yaw, at);
  A.game.freeCam = null;
  return A.player.pos.clone();
}
export function pinner(es) { const home = es.map((e) => e.pos.clone()); return () => es.forEach((e, i) => { if (!e.alive) return; e.pos.x = home[i].x; e.pos.z = home[i].z; e.kb = null; }); }

// =====================================================================================
// 一、普攻四式的特效：按动作时刻连拍（常用的背后跟随镜头；camYaw 相对人物朝向的偏角）
// =====================================================================================
export async function lightSeq(key, { prefix = 'r26_tmp_l', times = null, camOff = 0.35, pitch = 0.22, dist = 6.2, w = 640, h = 360, hour = 10, target = true } = {}) {
  const A = Q(), M = A.moves, P = A.player;
  A.TIME.hour = hour; skyQuiet(false);
  fresh();
  const es = target ? foes([['shade', 2.6, 0]], { hp: 5000 }) : (clearFoes(), []);
  const pin = pinner(es);
  A.cam.set(P.heading + camOff, pitch, dist); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55));
  M.lock = es[0] || null;                // 锁定（Tab）目标：出招朝着它（不随侧面镜头的朝向）
  run([], 0.3, pin);
  const D = PM[key];
  times = times || [0.05, D.active[0], (D.active[0] + D.active[1]) / 2, D.active[1], D.active[1] + 0.08, D.active[1] + 0.18, D.active[1] + 0.32];
  M.start(key);
  const out = [];
  let t = 0;
  for (const tt of times) {
    while (t < tt - 1e-6) { A.tick(1 / 60, 1, false); pin(); t += 1 / 60; }
    A.tick(1 / 60, 1, true); pin(); t += 1 / 60;
    const r = await A.shot(`${prefix}_${key}_${String(Math.round(tt * 1000)).padStart(4, '0')}`, { w, h });
    out.push(`${r2(t)}:${r.kb}`);
  }
  run([], 0.8, pin); M.lock = null; clearFoes(); skyQuiet(true);
  return out;
}

// =====================================================================================
// 二、雷龙俯冲撞击：先放一次量出撞上的时刻（龙自己的时钟），再同样放一次、按撞上前后的时刻连拍
//   view：'back' 主人身后的常规视角（锁定主要目标）/ 'side' 侧面全景（固定机位，看得到落点四周）
// =====================================================================================
const DIVE_FOES = [['shade', 14, 0], ['shade', 14.5, 2.4], ['shade', 13.5, -2.6]];
function hpLock() { const U = Q().combat.playerUnit; U.hp = U.maxHp; }
export function diveSetup() {
  const A = Q(), M = A.moves, D = A.dragon;
  D.clear('test'); fresh(); equip();
  const es = foes(DIVE_FOES, { hp: 50000 }), pin = pinner(es);
  run([], 0.2, pin);
  M.lock = es[0]; M.mp = M.mpMax; M.cools.dragon = 0;
  M.press('dragon', true);
  return { es, pin };
}
export function diveContactT() {
  const A = Q(), D = A.dragon;
  const { pin } = diveSetup();
  let n = 0, t = null;
  while (n++ < 60 * 14) { A.tick(1 / 60, 1, false); pin(); hpLock(); if (D.S?.dive.done) { t = D.S.dive.doneT; break; } }
  run([], 1.8, () => { pin(); hpLock(); });
  D.clear('test'); clearFoes();
  return t;
}
export async function diveShots({ prefix = 'r26_tmp_dive', offs = [-0.03, 0.02, 0.07, 0.14, 0.25, 0.4, 0.6, 0.85, 1.15], view = 'back', w = 640, h = 360, hour = 10, pitch = 0.1 } = {}) {
  const A = Q(), D = A.dragon, P = A.player, V = A.THREE.Vector3;
  A.TIME.hour = hour; skyQuiet(false);
  const tc = diveContactT();
  if (tc == null) return { err: 'no contact' };
  const { es, pin } = diveSetup();
  if (view === 'back') { A.game.freeCam = null; A.cam.set(P.heading + 0.12, pitch, 9.5); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); }
  else if (view === 'close') { const c = es[0].pos, h0 = P.heading; A.game.freeCam = { pos: new V(c.x + Math.cos(h0) * 8.5 - Math.sin(h0) * 4, c.y + 3.2, c.z - Math.sin(h0) * 8.5 - Math.cos(h0) * 4), at: new V(c.x, c.y + 1.4, c.z) }; }
  else { const c = es[0].pos, h0 = P.heading; A.game.freeCam = { pos: new V(c.x + Math.cos(h0) * 17, c.y + 4.2, c.z - Math.sin(h0) * 17), at: new V(c.x - Math.sin(h0) * 1.5, c.y + 2.6, c.z - Math.cos(h0) * 1.5) }; }
  const out = { tc: r3(tc), shots: [] };
  // 龙的时钟（收尾之后 D.S 没了：接着自己数）
  let n = 0, clock = D.S?.t ?? 0;
  const step = (render) => { A.tick(1 / 120, 1, render); pin(); hpLock(); clock = D.S ? D.S.t : clock + 1 / 120; };
  for (const [i, o] of offs.entries()) {
    while (clock < tc + o - 1 / 240 && n++ < 120 * 30) step(false);
    step(true);
    const r = await A.shot(`${prefix}_${view}_${String(i).padStart(2, '0')}`, { w, h });
    out.shots.push(`${r2(o)}:${r.kb}`);
  }
  run([], 1.5, () => { pin(); hpLock(); });
  out.rec = D.last?.dive ? { how: D.last.dive.how, t: D.last.dive.t } : null;
  D.clear('test'); clearFoes(); A.game.freeCam = null; skyQuiet(true);
  return out;
}

// =====================================================================================
// 三、剑尊：每一击出手段里剑（握点、剑尖）在剑尊自己的坐标里的轨迹——[前, 上, 左]（除以模型缩放 = 模型米），另记骨盆、脊柱的位置（俯身的支点）
//   玩家放在正前方 16 米外（不挨打、剑尊不转身）；ids：COMBOS30 的套路，另可 'counter' 'F01' 'F06' 'F07'
// =====================================================================================
export async function bladeProfile({ ids = null, dt = 1 / 120 } = {}) {
  const B24 = await import('./r24_tests.js');
  const A = Q(), f = A.game.boss30;
  if (A.world.name !== 'boss30') await B24.setup({ ai: false });
  await B24.fight({ ai: false });
  const { COMBO_ORDER } = await import('/src/game/boss30Config.js');
  ids = ids || COMBO_ORDER;
  const out = {};
  for (const id of ids) {
    B24.freshBoss(); f.toIdle(9);
    B24.place(f.root.x, f.root.z + 16);
    f.god = true;
    f.debug.move(id);
    const S = f.rig.S, rec = {};
    B24.tick(9, () => {
      const M = f.M, c = f.rig.cur;
      if (!M || !c) return f.B.mode === 'move';
      for (const h of M.seg?.hits || []) {
        if (c.t >= h.t[0] - 1e-6 && c.t <= h.t[1] + 1e-6) {
          const r = f.root, yaw = f.rig.yaw, cs = Math.cos(yaw), sn = Math.sin(yaw);
          const L = (p) => { const dx = p.x - r.x, dz = p.z - r.z; return [r3((dx * sn + dz * cs) / S), r3((p.y - r.y) / S), r3((dx * cs - dz * sn) / S)]; };
          (rec[h.key] ||= []).push({ t: r3(c.t), g: L(f.rig.swordGrip), tip: L(f.rig.swordTip), pel: L(f.rig.bonePos('pelvis')), sp: L(f.rig.bonePos('spine_02')) });
        }
      }
      return f.B.mode === 'move';
    }, dt);
    f.god = false;
    out[id] = rec;
  }
  B24.freshBoss();
  return out;
}

// 节奏（第二十六轮的要求：慢刀不再拖）：同 r24 rhythmOf（AI 关、无伤、玩家站在剑能扫到的地方），只是距离按体型、慢刀的范围改了
export const RANGE26 = { F: [0.35, 0.5], S: [0.6, 1.0], gapF: [0.25, 0.42], gapS: [0.45, 0.8], rec: [0.8, 1.0] };
export async function rhythm26(id, { dist = 2.8, phase = 1, dt = 1 / 60 } = {}) {
  const B24 = await import('./r24_tests.js');
  const { COMBOS30, CONFIG30: CFG } = await import('/src/game/boss30Config.js');
  const f = B24.freshBoss();
  if (f.phase !== phase) f.debug.phase(phase);
  const b = f.root, yaw = f.rig.yaw;
  B24.place(b.x + Math.sin(yaw) * dist, b.z + Math.cos(yaw) * dist);
  f.god = true;
  const before = (f.moveLog || []).length, n0 = f.traceN || 0;
  // 剑「穿过」玩家的深度：每一击的出手段里，剑身（握点 → 剑尖外延）落在玩家身体那一圈（水平 ≤ 胶囊半径 + 剑的半粗）之内的点，最低到多高
  const Hc = CFG.hit, P = Q().player.pos, pass = {};
  f.debug.move(id);
  B24.tick(9, () => {
    const M = f.M, c = f.rig.cur;
    if (M && c) for (const h of M.seg?.hits || []) {
      if (c.t < h.t[0] || c.t > h.t[1]) continue;
      const g = f.rig.swordGrip, t = f.rig.swordTip, L = g.distanceTo(t) || 1;
      for (let k = 0; k <= 24; k++) {
        const u = k / 24 * (1 + Hc.extend / L), x = g.x + (t.x - g.x) * u, y = g.y + (t.y - g.y) * u, z = g.z + (t.z - g.z) * u;
        if (Math.hypot(x - P.x, z - P.z) <= Hc.player.r + Hc.blade && y >= P.y - 0.2 && y <= P.y + Hc.player.y1 + Hc.blade + Hc.player.r) pass[h.key] = Math.min(pass[h.key] ?? 99, r2(y - P.y));
      }
    }
    return !(f.B.mode !== 'move' && (f.moveLog || []).length > before);
  }, dt);
  f.god = false;
  const L = f.moveLog[f.moveLog.length - 1];
  if (!L || L.id !== id) return { id, error: 'no log' };
  const def = COMBOS30[id], letters = def.rhythm.split('');
  const logs = L.logs.filter((x) => x.on != null);
  const windup = logs.length ? r3(logs[0].on - L.t0) : null;
  const gaps = logs.slice(1).map((x, i) => r3(x.on - logs[i].off));
  const recovery = logs.length ? r3(L.t1 - logs[logs.length - 1].off) : null;
  const ys = {}; for (const e of f.since(n0)) if (e.type === 'hit' && e.id === id && ys[e.key] == null) ys[e.key] = e.y;
  const checks = [['windup', windup, RANGE26[letters[0]]]];
  gaps.forEach((g, i) => checks.push([`gap${i + 1}`, g, letters[i + 1] === 'F' ? RANGE26.gapF : RANGE26.gapS]));
  const rk = phase === 2 ? CFG.p2.recover : 1;
  if (letters.length >= 3) checks.push(['recovery', recovery, (id === 'A10' ? [0.95, 1.08] : RANGE26.rec).map((v) => v * rk)]);
  const bad = checks.filter(([, v, [lo, hi]]) => v == null || v < lo - 0.02 || v > hi + 0.02).map(([k, v, rng]) => `${k}=${v} ∉ [${rng}]`);
  return { id, phase, rhythm: def.rhythm, hits: logs.length, keys: logs.map((x) => x.key), results: logs.map((x) => x.res || 'miss'), ys, pass, windup, gaps, recovery, ok: bad.length === 0 && logs.length === letters.length && logs.every((x) => x.res), bad };
}
export async function rhythm26All({ phase = 1, dist = 2.8 } = {}) {
  const { COMBO_ORDER } = await import('/src/game/boss30Config.js');
  const out = [];
  for (const id of COMBO_ORDER) out.push(await rhythm26(id, { phase, dist }));
  return out;
}
// 每套连招在几个距离上各放一次：每一击碰没碰到玩家、碰到的高度（米）
export async function reach26({ dists = [2.2, 2.8, 3.4], ids = null } = {}) {
  const { COMBO_ORDER } = await import('/src/game/boss30Config.js');
  const out = {};
  for (const id of ids || COMBO_ORDER) out[id] = {};
  for (const d of dists) for (const id of ids || COMBO_ORDER) { const r = await rhythm26(id, { dist: d }); out[id][d] = r.results.map((x, i) => `${r.keys[i]}:${x === 'immune' ? 'hit' : x}${r.ys[r.keys[i]] != null ? '@' + r.ys[r.keys[i]] : ''}↓${r.pass[r.keys[i]] ?? '-'}`).join(' '); }
  return out;
}

// =====================================================================================
// 四、弹反手感：同一套脚本，旧规则（第二十五轮）与新规则对照
//   旧：窗口 0.18 秒、开窗间隔 0.7 秒（成功也算）、下一帧才处理按键、没有迟到弹反；新：见 combatConfig 的 guard
// =====================================================================================
export function legacy(on) {
  const M = Q().moves, G = PC.guard;
  M.legacyParry = !!on;
  if (!G._r26) G._r26 = { w: G.parryWindow, cd: G.parryCooldown };
  G.parryWindow = on ? 0.18 : G._r26.w; G.parryCooldown = on ? 0.7 : G._r26.cd;
}
export const LEADS = [0.3, 0.25, 0.21, 0.18, 0.14, 0.1, 0.06, 0.03, 0, -0.03, -0.06, -0.09, -0.12];
// 魔修残魂的爪：碰到身上之前 lead 秒按下右键（负数：碰到之后才按），按住 0.3 秒
export function parrySweepShade({ leads = LEADS } = {}) {
  const out = {};
  for (const mode of ['old', 'new']) {
    legacy(mode === 'old');
    out[mode] = leads.map((lead) => { fresh(); const r = B.enemyTest('shade', { lead, hold: 0.3 }); return `${lead}:${r.log[0]?.r ?? 'none'}`; });
  }
  legacy(false);
  return out;
}
// 第三十层剑尊：某一套的第 k 击，碰到之前 lead 秒按下——parried / 没弹到（玩家站在 dist 米处：剑尊放大之后按体型站远一点）
export async function parrySweepBoss({ id = 'A01', leads = LEADS, dist = 3.0 } = {}) {
  const B24 = await import('./r24_tests.js');
  const A = Q(), C = A.combat, f = A.game.boss30;
  if (A.world.name !== 'boss30') await B24.setup({ ai: false });
  await B24.fight({ ai: false });
  const hit0 = Object.values(B24.contacts(id, dist))[0];
  const out = { contact: hit0 };
  for (const mode of ['old', 'new']) {
    legacy(mode === 'old');
    out[mode] = leads.map((lead) => {
      B24.freshBoss(); f.toIdle(9);
      const b = f.root, yaw = f.rig.yaw;
      B24.place(b.x + Math.sin(yaw) * dist, b.z + Math.cos(yaw) * dist);
      C.playerUnit.maxHp = C.playerUnit.hp = 9999;
      let first = null, pressed = false, rel = null;
      const L = (e) => { if (e.target === C.playerUnit && first == null && e.result !== 'immune') first = e.result; };
      C.hitListeners.add(L);
      f.debug.move(id);
      try {
        B24.tick(4, (t) => {
          if (!pressed && t >= hit0 - lead) { pressed = true; C.setGuard(true); rel = t + 0.3; }
          if (rel != null && t >= rel) { C.setGuard(false); rel = null; }
          return f.B.mode === 'move' || f.B.mode === 'recoil' || t < hit0 + 0.4;
        });
      } finally { C.hitListeners.delete(L); C.setGuard(false); }
      C.playerUnit.maxHp = C.playerUnit.hp = 160;
      return `${lead}:${first ?? 'none'}`;
    });
  }
  legacy(false);
  return out;
}
// 连段的每一击都按时弹（A06 流影三式：三击相隔约 0.3 / 0.25 秒）：每一击碰到前 lead 秒按下、0.1 秒后松开
export async function parryChainBoss({ id = 'A06', lead = 0.07, dist = 3.0 } = {}) {
  const B24 = await import('./r24_tests.js');
  const A = Q(), C = A.combat, f = A.game.boss30;
  if (A.world.name !== 'boss30') await B24.setup({ ai: false });
  await B24.fight({ ai: false });
  const out = {};
  for (const mode of ['old', 'new']) {
    legacy(mode === 'old');
    const hits = B24.contacts(id, dist), keys = Object.keys(hits);
    B24.freshBoss(); f.toIdle(9);
    const b = f.root, yaw = f.rig.yaw;
    B24.place(b.x + Math.sin(yaw) * dist, b.z + Math.cos(yaw) * dist);
    C.playerUnit.maxHp = C.playerUnit.hp = 9999;
    const n0 = f.traceN || 0, t0 = f.time, res = {};
    const L = (e) => { if (e.target === C.playerUnit) { const k = keys.find((x) => res[x] == null && f.time - t0 >= hits[x] - 0.2); if (k) res[k] = e.result; } };
    C.hitListeners.add(L);
    const pressed = new Set(), rel = [];
    // 按剑尊自己的时钟（f.time）对时：被弹中的一顿里剑尊的时钟也停，之后各击照它往后推 hitch 秒
    let shift = 0, nPar = 0;
    f.debug.move(id);
    try {
      B24.tick(6, (t) => {
        const np = Object.values(res).filter((r) => r === 'parry').length, ft = f.time - t0;
        if (np > nPar) { shift += (np - nPar) * CONFIG30.parry.hitch; nPar = np; }
        for (const k of keys) if (!pressed.has(k) && ft >= hits[k] + shift - lead) { pressed.add(k); C.setGuard(true); rel.push(t + 0.1); }
        if (rel.length && t >= rel[0]) { rel.shift(); C.setGuard(false); }
        return f.B.mode === 'move' || f.B.mode === 'recoil' || t < 0.5;
      });
    } finally { C.hitListeners.delete(L); C.setGuard(false); }
    out[mode] = { hits, res, parried: f.since(n0).filter((e) => e.type === 'parried').map((e) => e.key) };
    C.playerUnit.maxHp = C.playerUnit.hp = 160;
  }
  legacy(false);
  return out;
}

// =====================================================================================
// 总测：各项的判据（ok 为 true 才算过）——用法：const r = await T.runAll()（约 1–2 分钟，放 setTimeout 里跑）
// =====================================================================================
const pass = (o, ok, why = '') => ({ ...o, ok: !!ok, why: ok ? '' : why });
export async function runAll() {
  const A = Q(), out = {}, t0 = performance.now();
  const step = async (k, fn) => { const s = performance.now(); try { out[k] = await fn(); } catch (e) { out[k] = { ok: false, err: String(e && e.stack || e).slice(0, 400) }; } (out._ms ||= {})[k] = Math.round(performance.now() - s); };
  await step('setup', async () => pass({ r: await setup() }, true));
  // ---------- 四、弹反 ----------
  await step('parryShade', () => {
    const r = parrySweepShade(), at = (m, l) => (r[m].find((x) => x.startsWith(l + ':')) || '').split(':')[1];
    const lateNew = ['0', '-0.03', '-0.06'].every((l) => at('new', l) === 'parry'), lateOld = ['0', '-0.03', '-0.06'].some((l) => at('old', l) === 'parry');
    return pass({ r }, lateNew && !lateOld && at('new', '-0.12') === 'hit' && at('new', '0.18') === 'parry', '迟到的弹反窗口不对');
  });
  // ---------- 一、普攻第三、四式 ----------
  await step('light34', async () => {
    const ink = A.sfx.ink, s0 = { taiji: ink.stat.taiji || 0, slams: ink.stat.slams || 0 };
    fresh(); const es = foes([['shade', 2.6, 0]], { hp: 5000 }), pin = pinner(es); A.moves.lock = es[0];
    let peak = 0;
    for (const k of ['light3', 'light4']) { A.moves.start(k); run([], 1.2, () => { pin(); peak = Math.max(peak, ink.census().ink3 || 0); }); }
    A.moves.lock = null; clearFoes();
    const d = { taiji: (ink.stat.taiji || 0) - s0.taiji, slams: (ink.stat.slams || 0) - s0.slams, ink3Peak: peak, helices: ink.helices.length, has3: !!ink.ink3 };
    return pass(d, d.has3 && d.taiji >= 2 && d.slams >= 1 && d.ink3Peak > 10, '突刺 / 重劈的特效没放出来');
  });
  // ---------- 二、雷龙撞击 ----------
  await step('dive', () => {
    const D = A.dragon, S = A.game.sound, names = {};
    const play0 = S.play; S.play = function (n, o) { names[n] = (names[n] || 0) + 1; return play0.call(this, n, o); };
    let quake = false, strikes0 = 0, marks = new Set();
    try {
      const tc = diveContactT();
      const { pin } = diveSetup();
      const add0 = D.fx.marks.add.bind(D.fx.marks); D.fx.marks.add = (p, s, l, kind, k) => { marks.add(kind); return add0(p, s, l, kind, k); };
      const bc0 = D.fx.bolts.count;
      run([], tc + 2.2, () => { pin(); hpLock(); if (D.quakeS) quake = true; });
      strikes0 = D.fx.bolts.count - bc0;
      D.fx.marks.add = add0;
      D.clear('test'); clearFoes();
    } finally { S.play = play0; }
    const d = { quake, bolts: strikes0, marks: [...marks].sort().join(','), sounds: ['thunderBlast', 'dragonSlam', 'zapTail', 'thunderStrike'].map((n) => `${n}:${names[n] || 0}`).join(' ') };
    return pass(d, quake && marks.has(3) && marks.has(4) && (names.dragonSlam || 0) >= 1 && (names.thunderStrike || 0) >= 3, '撞击后的余震、气浪、电裂纹或声音缺了');
  });
  // ---------- 三、剑尊 ----------
  const B24 = await import('./r24_tests.js');
  await step('bossSize', async () => {
    await B24.setup({ ai: false });
    const f = A.game.boss30, R = f.rig, V = A.THREE.Vector3;
    B24.freshBoss(); f.toIdle(99); B24.tick(0.3);
    const head = R.head(new V()).y - f.root.y, top = f.unit.headY - f.root.y, len = R.swordTip.distanceTo(R.swordGrip);
    const d = { S: R.S, headBone: r2(head), helmTop: r2(top), ratio: r2(top / 1.72), sword: R.sword?.name, oldHidden: R.oldSword?.visible === false, len: r2(len), shaderErrors: B24.shaderErrors().length };
    return pass(d, d.ratio >= 2 && d.ratio <= 4 && d.sword === 'boss30_sword3' && d.oldHidden && d.len > 1.9 && !d.shaderErrors, '体型 / 佩剑 / 着色器不对');
  });
  await step('bossReach', async () => {
    const r = await reach26({ dists: [2.4, 3.4] });
    const bad = [];
    for (const [id, o] of Object.entries(r)) for (const [d, v] of Object.entries(o)) for (const x of v.split(' ')) { const m = x.match(/^(\w+):(\w+)(?:@[\d.]+)?↓([-\d.]+|-)$/); if (!m) continue; if (m[2] !== 'hit') bad.push(`${id}.${m[1]}@${d}:${m[2]}`); else if (m[3] !== '-' && +m[3] > 1.6) bad.push(`${id}.${m[1]}@${d}↓${m[3]}`); }
    return pass({ r, bad }, bad.length === 0, '有刀没碰到或从头顶扫过：' + bad.join(' '));
  });
  await step('bossRhythm', async () => {
    const p1 = await rhythm26All({ phase: 1, dist: 3.4 }), p2 = await rhythm26All({ phase: 2, dist: 3.4 });
    const bad = [...p1, ...p2].filter((x) => !x.ok).map((x) => `p${x.phase}:${x.id}:${x.bad.join(';') || x.results.join('/')}`);
    const slow = p1.filter((x) => x.rhythm[0] === 'S').map((x) => `${x.id}:${x.windup}`);
    return pass({ slow, gaps: p1.map((x) => `${x.id}:${x.gaps.join('/')}`), bad }, bad.length === 0, bad.join(' | '));
  });
  await step('bossFeel', async () => {
    const f = A.game.boss30, C = A.combat, V = A.THREE.Vector3;
    B24.freshBoss(); f.toIdle(99);
    const yaw = f.rig.yaw, fw = new V(Math.sin(yaw), 0, Math.cos(yaw));
    B24.place(f.root.x + fw.x * 3.2, f.root.z + fw.z * 3.2);
    C.playerUnit.maxHp = C.playerUnit.hp = 9999;
    const n0 = f.traceN || 0; let hitch = 0, shake = 0;
    f.debug.move('A02');
    B24.tick(3, () => { hitch = Math.max(hitch, f.hitchT || 0); shake = Math.max(shake, A.cam.shake || 0); return f.B.mode === 'move'; });
    const ev = f.since(n0).filter((e) => e.type === 'hit').map((e) => e.res);
    B24.freshBoss(); f.toIdle(99);
    B24.place(f.root.x + fw.x * 7.5 + 2.5 * fw.z, f.root.z + fw.z * 7.5 - 2.5 * fw.x);
    const n1 = f.traceN || 0;
    f.debug.move('A02'); B24.tick(3, () => f.B.mode === 'move');
    const ground = f.since(n1).filter((e) => e.type === 'ground').length;
    C.playerUnit.maxHp = C.playerUnit.hp = 160;
    const d = { hitRes: ev.join(','), bossHitch: r3(hitch), shake: r2(shake), ground };
    return pass(d, ev.includes('hit') && hitch >= 0.04 && shake >= 0.2 && ground >= 1, '命中的顿帧 / 震屏 / 劈地缺了');
  });
  await step('parryBoss', async () => {
    const a = await parrySweepBoss({ id: 'A01' }), c = await parryChainBoss({ id: 'A06' });
    const nw = (l) => (a.new.find((x) => x.startsWith(l + ':')) || '').split(':')[1];
    const ok = ['0.18', '0', '-0.06'].every((l) => nw(l) === 'parry') && Object.values(c.new.res).every((x) => x === 'parry');
    return pass({ A01: a.new, A06: c.new.res }, ok, '剑尊的弹反窗口 / 连段弹反不对');
  });
  out._secs = Math.round((performance.now() - t0) / 1000);
  out._ok = Object.entries(out).filter(([k, v]) => !k.startsWith('_') && v && v.ok === false).map(([k]) => k);
  return out;
}
