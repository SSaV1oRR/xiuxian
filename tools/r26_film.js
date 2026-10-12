// 第二十六轮录像：普攻第三、四式的水墨（含第三组水墨：太极印、喷墨、竹叶）、雷龙俯冲撞地之后的压迫感、第三十层剑尊（体型、佩剑、慢刀、打击感）、弹反手感。
// 同一份脚本在改动后（本项目）与改动前（第二十五轮的备份，tools/ 里放一份本文件与 r26_tests.js）各录一次：tag = 'after' / 'before'，标题上标明。
// 都按真实的输入、出招、结算、特效代码推进（__qinglan.tick），帧在页面里同步截下、录完分批上传（tools/r21_film.js）；
// 音效：音效库里的录音照常记下、离线混（tools/r19_mix_audio.py）；音效库之外的合成音（撞地闷响、电弧噼啪……）录完在页面里用游戏同一段合成代码
// 离线渲染成一轨（synthStem，上传为 docs/screenshots/r26stem_<name>.jpg，取出后改名 .wav）。
// 用法（预览）：const F = await import('/tools/r26_film.js?v=' + Date.now()); await F.setup();
//   setTimeout(async () => { const r = await F.scnLight('after'); const s = await F.synthStem('light_after'); const n = await F.flush(); window.__film = { r, s, n }; }, 0);
import * as RF from './r21_film.js';
import * as T from './r26_tests.js';
import { hud30 } from './r24_film.js';

const Q = () => window.__qinglan;
const r2 = (v) => +(+v).toFixed(2);
export const { flush } = RF;
export async function setup() { return T.setup(); }
const LABEL = { before: '改动前（第二十五轮）', after: '改动后（第二十六轮）' };

function rec(name, tag, title, sub = '', o = {}) {
  const X = RF.recStart({ prefix: `r26_${name}_${tag}_`, every: 2, w: 960, h: 540, title: `${title} · ${LABEL[tag]}`, sub });
  if (o.boss30) X.extra = (g, w, h) => hud30(g, w, h);
  return X;
}
function stop() { const out = RF.recStop(); Q().game.freeCam = null; return out; }
const play = (secs, fn = null) => RF.play(secs, fn);
// 慢放 k 倍：游戏时间每帧走 k / 60，录像的时钟每帧仍是 1/60（音效放在画面上对应的时刻）——同 r23_film 的 play(secs, fn, dt)
function slow(secs, k, fn = null) {
  const dt = k / 60, n = Math.round(secs / dt);
  for (let i = 0; i < n; i++) { if (fn && fn(i * dt) === false) break; RF.recTick(dt); const X = window.__r21rec; if (X) X.t += 1 / 60 - dt; }
}
const hpLock = () => { const U = Q().combat.playerUnit; U.hp = U.maxHp; };

// =====================================================================================
// 一、普攻四式（第三式突刺、第四式重劈）
// =====================================================================================
export async function scnLight(tag = 'after') {
  const A = Q(), M = A.moves, P = A.player;
  A.TIME.hour = 10; T.skyQuiet(false);
  T.fresh();
  const es = T.foes([['shade', 2.6, 0]], { hp: 90000 }), pin = T.pinner(es);
  const back = () => { A.game.freeCam = null; A.cam.set(P.heading + 0.32, 0.27, 6.4); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); };
  const side = () => { A.game.freeCam = null; A.cam.set(P.heading + 1.35, 0.14, 6.6); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); };
  M.lock = es[0]; back(); T.run([], 0.4, pin);
  rec('light', tag, '普攻四式', '常用的背后镜头：按住左键连出四式——斜斩、横斩、突刺（第三式）、重劈（第四式）');
  M.press('light', true); play(2.95, pin); M.press('light', false); play(1.1, pin);
  RF.recSub('侧面再看一遍同一套');
  T.fresh(); M.lock = es[0]; side(); play(0.3, pin);
  M.press('light', true); play(2.95, pin); M.press('light', false); play(1.1, pin);
  RF.recSub('0.35 倍慢放：第三式突刺（背后）');
  T.fresh(); M.lock = es[0]; back(); play(0.25, pin);
  M.start('light3'); slow(0.95, 0.35, pin);
  RF.recSub('0.35 倍慢放：第四式重劈（背后）');
  play(0.35, pin);
  M.start('light4'); slow(1.35, 0.35, pin);
  play(0.5, pin);
  M.lock = null;
  const out = stop(); T.clearFoes(); T.skyQuiet(true);
  return { frames: out.frames, secs: out.secs };
}

// =====================================================================================
// 二、雷龙破虚：俯冲撞地之后（view：'back' 主人身后的常规视角 / 'side' 侧面近景，撞上的一刻慢放）
// =====================================================================================
export async function scnDive(tag = 'after', view = 'back') {
  const A = Q(), D = A.dragon, P = A.player, V = A.THREE.Vector3;
  A.TIME.hour = 10; T.skyQuiet(false);
  const tc = T.diveContactT();
  const { es, pin } = T.diveSetup();
  const pre = view === 'back' ? 1.2 : 0.55;
  let n = 0;
  while ((!D.S || D.S.t < tc - pre) && n++ < 60 * 14) { A.tick(1 / 60, 1, false); pin(); hpLock(); }      // 雷龙在起势 0.65 秒提交之后才有
  if (view === 'back') { A.game.freeCam = null; A.cam.set(P.heading + 0.12, 0.26, 9.5); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); }
  else { const c = es[0].pos, h0 = P.heading; A.game.freeCam = { pos: new V(c.x + Math.cos(h0) * 8.5 - Math.sin(h0) * 4, c.y + 3.2, c.z - Math.sin(h0) * 8.5 - Math.cos(h0) * 4), at: new V(c.x, c.y + 1.4, c.z) }; }
  const each = () => { pin(); hpLock(); };
  if (view === 'back') {
    rec('dive', tag, '雷龙破虚 · 俯冲撞地', '主人身后的常规视角：蓄势末 → 俯冲 → 撞上 → 之后一秒多');
    play(4.4, each);
  } else {
    rec('diveside', tag, '雷龙破虚 · 俯冲撞地', '侧面近景：撞上之前');
    play(0.4, each);
    RF.recSub('0.4 倍慢放：撞上的一刻');
    slow(1.0, 0.4, each);
    RF.recSub('之后（原速）');
    play(2.0, each);
  }
  const out = stop();
  run2(1.2, each); D.clear('test'); T.clearFoes(); T.skyQuiet(true);
  return { frames: out.frames, secs: out.secs, tc: r2(tc) };
}
function run2(secs, each) { const A = Q(); for (let i = 0; i < Math.round(secs * 60); i++) { A.tick(1 / 60, 1, false); each?.(); } }

// =====================================================================================
// 三、第三十层剑尊：体型、佩剑、慢刀、打击感（AI 关，按招放；玩家气血锁住）
// =====================================================================================
export async function scnBoss(tag = 'after') {
  const B24 = await import('./r24_tests.js');
  const A = Q(), C = A.combat, V = A.THREE.Vector3;
  await B24.setup({ ai: false });
  const f = A.game.boss30;
  const big = f.rig.S > 1, dist = big ? 3.4 : 2.1;
  const R = f.rig;
  const stand = (d = dist, off = 0) => { B24.freshBoss(); f.toIdle(99); const yaw = R.yaw, fw = new V(Math.sin(yaw), 0, Math.cos(yaw)), rt = new V(Math.cos(yaw), 0, -Math.sin(yaw)); B24.place(f.root.x + fw.x * d + rt.x * off, f.root.z + fw.z * d + rt.z * off); C.playerUnit.maxHp = C.playerUnit.hp = 9999; return { fw, rt }; };
  const gameCam = () => { A.game.freeCam = null; f.cameraBehind(); };
  const sideCam = (fw, rt, k = 1) => { const mid = f.root.clone().addScaledVector(fw, dist * 0.5); A.game.freeCam = { pos: mid.clone().addScaledVector(rt, 8.5 * k).add(new V(0, 2.4 * k, 0)), at: mid.clone().add(new V(0, 1.6 * k, 0)) }; };
  const until = (pad = 0.5, each = null) => { let t = 0, done = null; play(8, () => { each?.(); if (f.B.mode !== 'move' && t > 0.2) { done ??= t; if (t - done > pad) return false; } t += 1 / 60; }); };
  let { fw, rt } = stand();
  sideCam(fw, rt, big ? 1.25 : 1);
  B24.tick(0.3);
  rec('boss', tag, '第三十层 · 烬狱剑尊', big ? '剑尊约 4 米（玩家的 2.3 倍），手里是荆棘剑（assets/sword/sword3）' : '剑尊约 2.1 米（与玩家同身量），原装的剑', { boss30: true });
  play(2.2);
  RF.recSub('悬锋重劈（慢刀：举剑停顿之后劈下）——玩家举剑硬挡');
  ({ fw, rt } = stand()); gameCam(); play(0.2);
  C.setGuard(true); f.debug.move('A02'); until(0.5); C.setGuard(false);
  RF.recSub('迟刃三绝（慢—快—慢）——不挡，看命中的打击感');
  ({ fw, rt } = stand()); gameCam(); play(0.2);
  f.debug.move('A07'); until(0.6, hpLock);
  RF.recSub('疾锋横斩（快刀横扫）——侧面');
  ({ fw, rt } = stand()); sideCam(fw, rt, big ? 1.25 : 1); play(0.2);
  f.debug.move('A01'); until(0.5, hpLock);
  RF.recSub('逐影四斩（第一斩伏身贴地旋斩）——侧面');
  ({ fw, rt } = stand()); sideCam(fw, rt, big ? 1.25 : 1); play(0.2);
  f.debug.move('A09'); until(0.5, hpLock);
  RF.recSub('沉锋双落（两记重劈）——玩家站远，劈空的刀砸在地上');
  ({ fw, rt } = stand(dist * 2.2, 2.5)); sideCam(fw, rt, big ? 1.4 : 1.1); play(0.2);
  f.debug.move('A05'); until(0.8, hpLock);
  C.setGuard(false);
  const out = stop();
  C.playerUnit.maxHp = C.playerUnit.hp = 160;
  return { frames: out.frames, secs: out.secs, big, dist };
}

// =====================================================================================
// 四、弹反：魔修残魂的爪（碰到之后才按右键；碰到之前按），第三十层剑尊的三连（每一击都按时弹）
// =====================================================================================
function clawOnce(lead, label, k = 1) {
  const A = Q(), C = A.combat, P = A.player, M = A.moves;
  M.reset(); C.playerUnit.invuln = 0; M.iframes = 0;
  const f = { x: Math.sin(P.heading), z: Math.cos(P.heading) };
  const e = C.spawn('shade', { x: P.pos.x + f.x * 1.8, y: P.pos.y, z: P.pos.z + f.z * 1.8 }, { yaw: P.heading + Math.PI });
  e.state = 'chase'; e.cool = 99; e.slamCool = 99;
  let res = null;
  const L = (ev) => { if (ev.target === C.playerUnit && !res) res = ev.result; };
  C.hitListeners.add(L);
  RF.recSub(label);
  e.begin('melee');
  const wind = e.cfg.windup, pressAt = wind - lead, relAt = pressAt + 0.3;
  let pressed = false, released = false;
  const each = (t) => {
    if (!pressed && t >= pressAt) { pressed = true; C.setGuard(true); }
    if (pressed && !released && t >= relAt) { released = true; C.setGuard(false); }
    C.playerUnit.hp = C.playerUnit.maxHp;
  };
  if (k < 1) slow(wind + 0.55, k, each); else play(wind + 0.55, each);
  C.hitListeners.delete(L); C.setGuard(false);
  RF.recSub(`${label} → 结果：${res === 'parry' ? '弹反' : res === 'block' ? '格挡' : res === 'hit' ? '受击' : res || '—'}`);
  play(0.9, () => { C.playerUnit.hp = C.playerUnit.maxHp; });
  e.dispose(); C.enemies.splice(C.enemies.indexOf(e), 1);
  return res;
}
export async function scnParry(tag = 'after') {
  const A = Q(), P = A.player, V = A.THREE.Vector3;
  A.TIME.hour = 10; T.skyQuiet(false);
  T.fresh(); T.clearFoes();
  const f = { x: Math.sin(P.heading), z: Math.cos(P.heading) }, sd = { x: Math.cos(P.heading), z: -Math.sin(P.heading) };
  A.game.freeCam = { pos: new V(P.pos.x + f.x * 0.9 + sd.x * 4.0, P.pos.y + 1.75, P.pos.z + f.z * 0.9 + sd.z * 4.0), at: new V(P.pos.x + f.x * 0.9, P.pos.y + 1.05, P.pos.z + f.z * 0.9) };
  rec('parry', tag, '弹反手感', '魔修残魂的爪');
  play(0.4);
  const out = {};
  out.late = clawOnce(-0.06, '爪子碰到身上之后 0.06 秒才按右键（0.4 倍慢放）', 0.4);
  out.late2 = clawOnce(-0.03, '碰到之后 0.03 秒按（原速）');
  out.early = clawOnce(0.1, '碰到之前 0.1 秒按（原速）');
  out.tooLate = clawOnce(-0.12, '碰到之后 0.12 秒才按（太迟）');
  const R = stop();
  T.clearFoes(); T.skyQuiet(true);
  return { ...out, frames: R.frames, secs: R.secs };
}
// 第三十层剑尊的流影三式：每一击碰到前 0.07 秒按下、0.1 秒后松开（按剑尊自己的时钟对时；被弹中的一顿里剑尊的时钟也停）
export async function scnParryBoss(tag = 'after') {
  const B24 = await import('./r24_tests.js');
  const { CONFIG30 } = await import('/src/game/boss30Config.js');
  const A = Q(), C = A.combat, V = A.THREE.Vector3;
  await B24.setup({ ai: false });
  const f = A.game.boss30, big = f.rig.S > 1, dist = big ? 3.0 : 1.9, id = 'A06', lead = 0.07;
  const hits = B24.contacts(id, dist), keys = Object.keys(hits);
  B24.freshBoss(); f.toIdle(9);
  const b = f.root, yaw = f.rig.yaw, fw = new V(Math.sin(yaw), 0, Math.cos(yaw)), rt = new V(Math.cos(yaw), 0, -Math.sin(yaw));
  B24.place(b.x + fw.x * dist, b.z + fw.z * dist);
  C.playerUnit.maxHp = C.playerUnit.hp = 9999;
  const mid = b.clone().addScaledVector(fw, dist * 0.5);
  A.game.freeCam = { pos: mid.clone().addScaledVector(rt, big ? 9.5 : 6.5).add(new V(0, big ? 2.6 : 1.9, 0)), at: mid.clone().add(new V(0, big ? 1.7 : 1.2, 0)) };
  play(0.1);
  rec('parryboss', tag, '弹反手感 · 剑尊的三连', '流影三式：每一击碰到前 0.07 秒按右键、0.1 秒后松开（0.5 倍慢放）', { boss30: true });
  const t0 = f.time, res = {};
  const L = (e) => { if (e.target === C.playerUnit) { const k = keys.find((x) => res[x] == null && f.time - t0 >= hits[x] - 0.2); if (k) res[k] = e.result; } };
  C.hitListeners.add(L);
  const pressed = new Set(), rel = [];
  let shift = 0, nPar = 0, tt = 0;
  f.debug.move(id);
  slow(3.2, 0.5, (t) => {
    const np = Object.values(res).filter((r) => r === 'parry').length, ft = f.time - t0;
    if (np > nPar) { shift += (np - nPar) * CONFIG30.parry.hitch; nPar = np; }
    for (const k of keys) if (!pressed.has(k) && ft >= hits[k] + shift - lead) { pressed.add(k); C.setGuard(true); rel.push(t + 0.1); }
    if (rel.length && t >= rel[0]) { rel.shift(); C.setGuard(false); }
    RF.recSub(`流影三式：每一击碰到前 0.07 秒按右键 → ${keys.map((k) => (res[k] === 'parry' ? '弹反' : res[k] === 'block' ? '格挡' : res[k] === 'hit' ? '受击' : '…')).join(' / ')}`);
    tt = t;
  });
  C.hitListeners.delete(L); C.setGuard(false);
  play(0.8);
  const R = stop();
  C.playerUnit.maxHp = C.playerUnit.hp = 160;
  return { res, frames: R.frames, secs: R.secs, big };
}

// =====================================================================================
// 合成音轨（同 r25_film.synthStem，上传名改成 r26stem_<name>）
// =====================================================================================
export async function synthStem(name) {
  const ev = window.__recEvents;
  if (!ev) return { err: 'no events' };
  const A = Q(), S0 = A.game.sound, SR = 44100, secs = ev.secs + 2.5, N = Math.ceil(secs * SR);
  const ctx = new OfflineAudioContext(2, N, SR);
  const off = Object.create(Object.getPrototypeOf(S0));
  Object.assign(off, { ctx, vol: 1, bank: null, loops: new Map(), listener: null, tracks: new Map() });
  off.dry = ctx.createGain(); off.dry.connect(ctx.destination);
  off.verb = ctx.createConvolver(); off.verb.buffer = off.impulse(2.6, 2.2);
  off.wet = ctx.createGain(); off.wet.gain.value = 0.32; off.verb.connect(off.wet); off.wet.connect(ctx.destination);
  off.noiseBuf = { white: off.noise('white'), pink: off.noise('pink'), brown: off.noise('brown') };
  const V = A.THREE.Vector3;
  const lis = (l) => (l ? { pos: new V(l[0], l[1], l[2]), right: { x: l[3], z: l[4] } } : null);
  const at = (a) => (a ? { x: a[0], y: a[1] ?? undefined, z: a[2] } : undefined);
  const names = {}, skipped = {};
  for (const e of ev.events) {
    if (!e.synth) continue;
    const f = off[`s_${e.name}`];
    if (!f) { skipped[e.name] = (skipped[e.name] || 0) + 1; continue; }
    off.listener = lis(e.lis);
    const o = { ...(e.o || {}) }; const p = at(e.at); if (p) o.at = p;
    try { f.call(off, e.t + (o.delay || 0), o); names[e.name] = (names[e.name] || 0) + 1; } catch (err) { skipped[`${e.name}!`] = String(err); }
  }
  const groups = new Map();
  for (const L of ev.loops || []) { const q = (Math.max(1, Math.round((L.t * SR) / 128)) * 128) / SR; if (!groups.has(q)) groups.set(q, []); groups.get(q).push(L); }
  for (const [q, list] of groups) {
    if (q >= secs - 0.01) continue;
    ctx.suspend(q).then(() => {
      for (const L of list) {
        off.listener = lis(L.lis);
        if (L.stop) off.stopLoop(L.id, L.fade);
        else { const o = { ...(L.o || {}) }; const p = at(L.at); if (p) o.at = p; off.loop(L.id, L.kind, o); names[`loop:${L.kind}`] = (names[`loop:${L.kind}`] || 0) + 1; }
      }
      ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; } }
  const blob = wavF32(buf);
  await fetch(`/__shot/r26stem_${name}`, { method: 'POST', body: blob });
  return { names, skipped, peak: r2(peak), secs: r2(buf.length / SR), bytes: blob.size };
}
function wavF32(buf) {
  const nch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate, bytes = n * nch * 4;
  const ab = new ArrayBuffer(58 + bytes), v = new DataView(ab);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 50 + bytes, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 18, true); v.setUint16(20, 3, true); v.setUint16(22, nch, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * nch * 4, true); v.setUint16(32, nch * 4, true); v.setUint16(34, 32, true); v.setUint16(36, 0, true);
  str(38, 'fact'); v.setUint32(42, 4, true); v.setUint32(46, n, true);
  str(50, 'data'); v.setUint32(54, bytes, true);
  const ch = []; for (let c = 0; c < nch; c++) ch.push(buf.getChannelData(c));
  let o = 58;
  for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) { v.setFloat32(o, ch[c][i], true); o += 4; }
  return new Blob([ab], { type: 'audio/wav' });
}
