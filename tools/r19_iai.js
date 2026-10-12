// 第十九轮自检工具：拔刀斩（纳刀蓄势、缓步、闪身不断蓄力、出刀伤害随蓄力、自动出刀、格挡作废）、回血葫芦、养元丹恒为 99、新音效的触发。
// 都按真实的输入、出招、结算代码推进（__qinglan.tick），不是另写一套。
// 用法（预览）：const T = await import('/tools/r19_iai.js?v=' + Date.now());
//   await T.setup(); await T.arena();                   开局、到演武场比试圈（空场）
//   T.chargeDamage([0.2, 1, 3, 5, 7])                    按住 Z 不同秒数 → 出刀时的蓄力、木人桩上的伤害、有没有剑气、前冲多远
//   T.walk() / T.dodgeKeep() / T.dodgeRelease() / T.autoRelease() / T.guardCancel()
//   T.gourd() / T.pills() / T.sounds()
//   await T.views('iai_slash', [0, 0.1, 0.2])            定格动作截图（docs/screenshots/r19_tmp_*.jpg）；T.swapCheck() 换手那一帧两把剑差多少
import * as B from './r17_combat_bot.js';

const Q = () => window.__qinglan;
export const { setup, toArena, tick, dummy, sim } = B;
const r2 = (v) => +(+v).toFixed(2), r3 = (v) => +(+v).toFixed(3);
let RING = null;                       // 演武场比试圈（arena() 之后有）

// 每次测试前：招式、蓄力、冷却、灵力、气血归位，人站回比试圈中央、朝北
function fresh(yaw = Math.PI) {
  const A = Q(), M = A.moves, C = A.combat, P = A.player;
  M.reset(); for (const k in M.cools) M.cools[k] = 0; M.mp = 100;
  C.playerUnit.hp = C.playerUnit.maxHp; C.playerUnit.alive = true;
  A.input.keys.clear();
  if (RING) P.place(RING.cx, RING.cz + 2, yaw, RING.y);
  P.heading = yaw; P.vel.set(0, 0, 0);
  C.dummies = C.dummies.filter((x) => !x.test);
  tick(10, 1 / 60, false);
}
export async function arena() { RING = await toArena(); fresh(); return RING; }

// 推进 secs 秒；evs = [[秒, 事件]]：'Z+' 'Z-' 'C' 'R+' 'R-' 'L+' 'L-' 'G' '2' 'move:x,y' 'Q' '1' 'V'；each(t) 每帧调用
function run(evs, secs, each = null, dt = 1 / 60) {
  const A = Q(), M = A.moves;
  const list = evs.slice().sort((a, b) => a[0] - b[0]);
  let k = 0, t = 0;
  const segs = [];
  let cur = null;
  for (let i = 0; i < Math.round(secs / dt); i++) {
    while (k < list.length && list[k][0] <= t + 1e-9) { const e = list[k++][1]; if (e === '2') M.press('gourd', true); else B.applyEvent(e); }
    A.tick(dt, 1, false);
    t += dt;
    const key = M.act ? M.act.key + (M.act.key === 'iai' ? ':' + M.act.phase + (M.act.walking ? '/walk' : '') : '') : M.guarding ? 'guard' : 'idle';
    if (!cur || cur.key !== key) { if (cur) cur.end = r2(t - dt); cur = { key, start: r2(t) }; segs.push(cur); }
    each?.(t);
  }
  if (cur) cur.end = r2(t);
  return segs.map((s) => `${s.key}[${s.start}-${s.end}]`);
}
const lastLog = (key) => { const L = Q().moves.log.filter((x) => x.key === key); return L[L.length - 1]; };
const ev = (L, k) => L?.events.find((e) => e.k === k);

// ---------- 拔刀斩：蓄力秒数 → 伤害 ----------
// 木人桩在身前 d 米；按住 Z holds 秒后松开，跑到出刀收完。返回每一次的蓄力（log 的 draw 事件）、桩上的伤害、剑气、前冲距离
export function chargeDamage(holds = [0.2, 1, 2, 3, 4, 5, 7], { d = 3.2 } = {}) {
  const out = [];
  for (const h of holds) {
    fresh();
    const A = Q(), P = A.player, T = dummy(d);
    T.total = 0;
    let p0 = null, p1 = null;
    const segs = run([[0.05, 'Z+'], [0.05 + h, 'Z-']], h + 1.6, () => {
      const a = A.moves.act;
      if (a?.key === 'iai_slash' && !p0) p0 = P.pos.clone();
      if (a?.key === 'iai_slash' && a.t >= 0.4 && !p1) p1 = P.pos.clone();
    });
    const L = lastLog('iai_slash'), dr = ev(L, 'draw');
    out.push({ hold: h, charge: dr?.charge, k: dr?.ratio, dmg: Math.round(T.total), wave: !!ev(L, 'wave'), lunge: p0 && p1 ? r2(p0.distanceTo(p1)) : null, res: L?.results.map((x) => `${x.r}:${x.dmg}`).join(' '), segs: segs.join(' ') });
  }
  fresh();
  return out;
}

// ---------- 缓步：蓄势中按住 W 走 2 秒，量平均速度；放开再站 0.6 秒 ----------
export function walk({ secs = 2 } = {}) {
  fresh();
  const A = Q(), P = A.player, M = A.moves;
  let a = null, b = null, maxV = 0, clipWalk = 0, n = 0;
  const segs = run([[0.05, 'Z+'], [0.6, 'move:0,1'], [0.6 + secs, 'move:0,0'], [1.4 + secs, 'Z-']], 2.6 + secs, (t) => {
    if (t >= 1.0 && !a) a = { p: P.pos.clone(), t };
    if (t >= 0.6 + secs && !b) b = { p: P.pos.clone(), t };
    if (t > 1.0 && t < 0.6 + secs) { maxV = Math.max(maxV, P.speed); n++; if (P.char.anim.name === 'iai_walk') clipWalk++; }
  });
  const v = a && b ? a.p.distanceTo(b.p) / (b.t - a.t) : null;
  void M;
  return { avgSpeed: r2(v), maxSpeed: r2(maxV), walkClipShare: r2(clipWalk / Math.max(1, n)), charge: ev(lastLog('iai_slash'), 'draw')?.charge, segs: segs.join(' ') };
}

// ---------- 闪身不断蓄力：按住 Z，1.0 秒闪身（向左），一直按着，2.6 秒松开 ----------
export function dodgeKeep() {
  fresh();
  let mid = null;
  const segs = run([[0.05, 'Z+'], [1.0, 'move:-1,0'], [1.0, 'C'], [1.1, 'move:0,0'], [2.65, 'Z-']], 3.8, () => { const M = Q().moves; if (M.act?.key === 'dodge' && M.iai && !mid) mid = r2(M.iai.charge); });
  const dr = ev(lastLog('iai_slash'), 'draw');
  return { chargeAtRelease: dr?.charge, expect: 2.6, chargeSeenInDodge: mid, segs: segs.join(' ') };
}
// 闪身中松开 Z：落地就出刀
export function dodgeRelease() {
  fresh();
  const segs = run([[0.05, 'Z+'], [1.0, 'C'], [1.1, 'Z-']], 2.6);
  const L = lastLog('iai_slash');
  return { charge: ev(L, 'draw')?.charge, segs: segs.join(' ') };
}
// 一直按着：蓄满 5 秒再撑 1 秒自动出刀
export function autoRelease() {
  fresh();
  const segs = run([[0.05, 'Z+']], 7.6);
  run([[0, 'Z-']], 0.1);
  const L = lastLog('iai_slash');
  return { charge: ev(L, 'draw')?.charge, k: ev(L, 'draw')?.ratio, segs: segs.join(' ') };
}
// 蓄势中举剑格挡：作废这次蓄力（之后松开 Z 不出刀），蓄力声停掉
export function guardCancel() {
  fresh();
  const M = Q().moves;
  let snd = null;
  const segs = run([[0.05, 'Z+'], [1.2, 'R+'], [1.8, 'Z-'], [2.2, 'R-']], 3.0, () => { if (M.iai?.snd) snd = M.iai.snd; });
  return { slashes: Q().moves.log.filter((x) => x.key === 'iai_slash' && x.t0 >= M.time - 3).length, iaiAfter: !!M.iai, soundStopped: snd ? !!snd.stopped : 'no sound handle (audio off)', segs: segs.join(' ') };
}

// ---------- 回血葫芦 ----------
export function gourd() {
  fresh();
  const A = Q(), M = A.moves, U = A.combat.playerUnit, P = A.player;
  const out = { start: M.gourdLeft, max: M.gourdMax, sips: [] };
  const denies = [];
  const fx = A.moves.fx, deny0 = fx.deny;
  fx.deny = (k, why) => { denies.push(`${k}:${why}`); deny0?.call(fx, k, why); };
  try {
    // 对照：不喝，同样 1.9 秒里脱战自然回复多少（喝葫芦的回血要减掉它）
    U.hp = U.maxHp * 0.25;
    { const hp0 = U.hp; run([], 1.9); out.regen = Math.round(U.hp - hp0); }
    for (let i = 0; i < 4; i++) {
      for (const k in M.cools) M.cools[k] = 0;
      U.hp = U.maxHp * 0.25;
      const hp0 = U.hp;
      let maxV = 0;
      const segs = run([[0.05, '2'], [0.3, 'move:0,1'], [1.2, 'move:0,0']], 1.9, (t) => { if (t > 0.4 && t < 1.15) maxV = Math.max(maxV, P.speed); });
      out.sips.push({ healed: Math.round(U.hp - hp0 - out.regen), expect: r2(U.maxHp / 3), left: M.gourdLeft, walkMax: r2(maxV), segs: segs.join(' ') });
    }
    U.hp = U.maxHp; M.refillGourd();
    for (const k in M.cools) M.cools[k] = 0;
    run([[0.05, '2']], 0.3);
    out.fullHpLeft = M.gourdLeft;
    out.denies = denies;
    out.afterRefill = M.gourdLeft;
  } finally { fx.deny = deny0; }
  fresh();
  return out;
}

// ---------- 养元丹恒为 99 ----------
export function pills() {
  const A = Q(), S = A.game.state, M = A.moves, U = A.combat.playerUnit;
  const r = { start: S.count('yangyuan') };
  fresh();
  U.hp = U.maxHp * 0.5;
  run([[0.05, 'G']], 1.6);
  r.afterPill = S.count('yangyuan');
  S.give('yangyuan', 3); r.afterGive = S.count('yangyuan');
  S.d.inv.yangyuan += 3; S.save(); r.afterDirectEdit = S.count('yangyuan');
  r.saved = JSON.parse(localStorage.getItem('qinglan.save.v1')).inv.yangyuan;
  void M;
  fresh();
  return r;
}

// ---------- 音效：记下每个招式放了哪些音效（名字、从录音第几秒放起），不论 AudioContext 有没有开 ----------
export function sounds() {
  const A = Q(), S = A.game.sound, M = A.moves, U = A.combat.playerUnit;
  const play0 = S.play, got = [];
  S.play = function (name, o = {}) { got.push(`${name}${o.offset ? '@' + r3(o.offset) : ''}`); return play0.call(this, name, o); };
  const log = {};
  const take = (k, f) => { got.length = 0; f(); log[k] = got.slice(); };
  try {
    take('普攻四式', () => { fresh(); run([[0.05, 'L+'], [3.0, 'L-']], 3.4); });
    take('拔刀斩', () => { fresh(); run([[0.05, 'Z+'], [1.0, 'Z-']], 2.0); });
    take('剑气', () => { fresh(); run([[0.05, 'Q']], 0.8); });
    take('缚灵锁', () => { fresh(); dummy(3); run([[0.05, '1']], 1.0); });
    take('万剑归宗', () => { fresh(); M.intent = 100; run([[0.05, 'V']], 4.6); });
    take('回血葫芦', () => { fresh(); U.hp = U.maxHp * 0.3; run([[0.05, '2']], 1.6); });
  } finally { S.play = play0; }
  log.bank = Object.fromEntries(['lightSlash', 'parry', 'bind', 'qi', 'iaiCharge', 'iaiDraw', 'ultRain', 'ultFinal', 'gourdOpen', 'gulp', 'gourdClose'].map((k) => [k, S.bank?.[k]?.bufs?.map((b) => r2(b.duration)) ?? null]));
  fresh();
  return log;
}

// ---------- 定格动作（带拔刀斩的佩剑与鞘、葫芦的状态）----------
// look：{ drawn 剑在手里, tilt 鞘压平 0 … 1, gourd 葫芦在手里 }；不给时按动作自己的时刻推断（与 moves.iaiLook 同一规则）
export function lookAt(clip, t) {
  const ch = Q().player.char, M = (n) => ch.clips[n].data.marks;
  const sm = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
  if (clip === 'iai_enter') return { drawn: t < M('iai_enter').sheathed, tilt: sm(t / M('iai_enter').tilt) };
  if (clip === 'iai_hold' || clip === 'iai_walk') return { drawn: false, tilt: 1 };
  if (clip === 'iai_slash') {
    const P = ch.clips.iai_slash.data.pull;                 // 鞘引き（与 moves.trackAt 同样线性插值）
    let pull = 0;
    if (P) { const X = P.times, i = Math.min(X.length - 2, Math.max(0, X.findIndex((x) => x > t) - 1)); const u = Math.min(1, Math.max(0, (t - X[i]) / (X[i + 1] - X[i]))); pull = P.v[i] + (P.v[i + 1] - P.v[i]) * u; }
    return { drawn: t >= M('iai_slash').draw, tilt: 1 - sm((t - 0.22) / 0.28), pull };
  }
  if (clip === 'drink') { const g = sm((t - 0.18) / 0.1) * (1 - sm((t - 1.04) / 0.1)); return { drawn: true, tilt: 0, gourd: g, mask: 'drink' }; }
  return { drawn: true, tilt: 0 };
}
export function pose(clip, t, look = null) {
  const A = Q(), P = A.player, ch = P.char, L = look || lookAt(clip, t);
  A.moves.reset(); ch.anim.clear();              // reset 会让上一段淡出 0.05 秒——定格前清掉，免得混进来
  ch.anim.play(clip, { from: t, to: t + 0.001, speed: 0, hold: true, fade: 0, mask: L.mask || 'full' });
  ch.anim.update(0);
  ch.drawnSnap = true; ch.sheathTilt = L.tilt ?? 0; ch.sheathPull = L.pull ?? 0; ch.gourdInHand = +L.gourd || 0;
  for (let i = 0; i < 2; i++) ch.update(1 / 60, P.pos, P.heading, { mode: 'walk', onGround: true, speed: 0, drawn: L.drawn ?? true });
}
export async function views(clip, times, { prefix = clip, views: vs = [[35, 2.7, 1.35], [-80, 2.9, 1.25], [180, 2.9, 1.7]], w = 420, h = 520, fov = 46, look = null } = {}) {
  const A = Q(), P = A.player, ch = P.char;
  for (const t of times) {
    pose(clip, t, look);
    for (let k = 0; k < vs.length; k++) {
      const [ang, dist, hh] = vs[k], a = P.heading + ang * Math.PI / 180;
      const pos = [P.pos.x + Math.sin(a) * dist, P.pos.y + hh, P.pos.z + Math.cos(a) * dist];
      await A.shot(`r19_tmp_${prefix}_${String(Math.round(t * 1000)).padStart(4, '0')}_${k}`, { w, h, pos, at: [P.pos.x, P.pos.y + 1.0, P.pos.z], fov });
    }
  }
  ch.anim.stop(0); ch.drawnSnap = false; ch.sheathTilt = 0; ch.gourdInHand = 0;
}

// 换手的那一帧：手中的剑与鞘中的剑（同一把剑的两份）相差多少——剑柄原点的距离（厘米）与剑身方向的夹角（度）。
// 纳刀 0.18 秒（剑入鞘）、出刀 0 秒与 draw 时刻（剑出鞘）应当几乎重合
export function swapCheck(times = [['iai_enter', 0.18], ['iai_slash', 0], ['iai_slash', 0.045], ['iai_hold', 0], ['iai_hold', 1.0], ['iai_walk', 0.25], ['iai_walk', 0.75]]) {
  const A = Q(), T = A.THREE, ch = A.player.char, out = [];
  const frame = (o) => { o.updateWorldMatrix(true, false); const p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3(); o.matrixWorld.decompose(p, q, s); return { p, y: new T.Vector3(0, 1, 0).applyQuaternion(q), x: new T.Vector3(1, 0, 0).applyQuaternion(q) }; };
  for (const [clip, t] of times) {
    const L = lookAt(clip, t);
    pose(clip, t, { drawn: false, tilt: L.tilt, pull: L.pull });
    const a = frame(ch.handSword), b = frame(ch.scabTop);
    out.push({ clip, t, gripCm: r2(a.p.distanceTo(b.p) * 100), bladeDeg: r2(a.y.angleTo(b.y) * 180 / Math.PI), edgeDeg: r2(a.x.angleTo(b.x) * 180 / Math.PI) });
  }
  ch.anim.stop(0); ch.drawnSnap = false; ch.sheathTilt = 0; ch.sheathPull = 0;
  return out;
}

// 出刀时剑身是否斜穿鞘壁：逐帧（60 帧 / 秒）看剑身上还在鞘的长度范围内的各点离鞘轴多远。
// inCm：还在鞘里的那一段有多长；offCm：这一段离鞘轴最远的一点（鞘的内径约 2 厘米，超出即穿过鞘壁）
export function drawCheck(from = 0, to = 0.2) {
  const A = Q(), ch = A.player.char, T3 = A.THREE, S = ch.sword, out = [];
  const len = S.tip - S.guard[0];
  for (let t = from; t <= to + 1e-6; t += 1 / 60) {
    const L = lookAt('iai_slash', t);
    pose('iai_slash', t, { drawn: true, tilt: L.tilt, pull: L.pull });
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
  ch.anim.stop(0); ch.drawnSnap = false; ch.sheathTilt = 0; ch.sheathPull = 0;
  return { sword: S.id, bladeCm: Math.round(len * 100), frames: out };
}

// =====================================================================================
// 录像：逐帧推进（每 1/60 秒），每 every 帧画一帧——画面 + 一层说明（标题、字幕、气血 / 灵力、拔刀斩蓄了几秒、葫芦与养元丹的数目、
// 此刻的招式、按住的键、伤害浮字、放不出时的提示）。帧先存在内存（隐藏的预览页里每个 await 都被拖慢到约 1 秒），录完 flush 分批上传；
// 同时记下这段里放的每个音效（时刻、名字、挑中的那一份、从录音第几秒放起、实际音高、音量、声像、混响、半途停下的时刻）——
// tools/r19_mix_audio.py 按它用同一个音效库离线混出配音（合成音没有录音，不进配音）
// =====================================================================================
const NAMES = { light1: '斜斩', light2: '反手横斩', light3: '突刺', light4: '重劈', iai_slash: '拔刀斩', gourd: '回血葫芦', qi: '剑气·新月', seal: '缚灵锁', dash: '惊鸿掠影', heavy: '破岳', ult: '万剑归宗', pill: '服丹', dodge: '闪身', draw: '拔剑入势', react: '受击', knockdown: '倒地' };
const DENY = { sated: '气血充盈，不必饮用', empty: '葫芦已空（打坐调息时装满）', cool: '尚在调息', full: '气血充盈，不必服丹' };
let REC = null;
export function recStart({ prefix, every = 2, w = 960, h = 540, title = '', sub = '' }) {
  const A = Q(), R = A.renderer, S = A.game.sound, M = A.moves;
  REC = { prefix, every, w, h, i: 0, t: 0, title, sub, pops: [], frames: [], events: [], deny: null, keep: { s: R.getSize(new A.THREE.Vector2()), pr: R.getPixelRatio() } };
  R.setPixelRatio(1); R.setSize(w, h, false); A.camera.aspect = w / h; A.camera.updateProjectionMatrix();
  REC.L = (e) => {
    if (!REC) return;
    const U = A.combat.playerUnit, p = (e.target.boss && e.target.hitPoint ? e.target.hitPoint : e.target.pos).clone();
    p.y = (e.target.headY ?? p.y + 1.8) + 0.25;
    if (e.target === U) return;
    if (e.from === U || e.from?.isPlayer) REC.pops.push({ txt: `${Math.round(e.amount)}`, col: e.amount >= 60 ? '#ffd86a' : '#fff6e0', p, t: 0, big: e.amount >= 60 });
  };
  A.combat.hitListeners.add(REC.L);
  // 音效：照常放，同时记下来（音量按 audio.out 的距离衰减、声像算好）
  REC.play0 = S.play;
  S.play = function (name, o = {}) {
    const h = REC.play0.call(this, name, o);
    const sn = name === 'hit' && o.big && this.bank?.hitHeavy ? 'hitHeavy' : name, Sb = this.bank?.[sn];
    const kg = (name === 'swing' && o.heavy) || (name === 'block' && o.hard) ? 1.25 : 1;
    let att = 1, pan = 0;
    const L = this.listener;
    if (o.at && L) {
      const dx = o.at.x - L.pos.x, dz = o.at.z - L.pos.z, dy = (o.at.y ?? L.pos.y) - L.pos.y, d = Math.hypot(dx, dy, dz);
      att = 1 / (1 + Math.max(0, d - 4) / (o.ref ?? Sb?.ref ?? 14));
      if (d > 0.5) pan = Math.max(-0.85, Math.min(0.85, (dx * L.right.x + dz * L.right.z) / d));
    }
    const ev = { t: r3(REC.t), name: sn, v: Sb?.last ?? 0, offset: o.offset || 0, rate: h?.src ? r3(h.src.playbackRate.value) : r3(o.pitch ?? 1),
      gain: r3((Sb?.gain ?? 1) * (o.gain ?? 1) * kg * att), pan: r2(pan), wet: r2(o.wet ?? Sb?.wet ?? 0.4), dur: o.dur || 0, synth: !Sb };
    REC.events.push(ev);
    if (h) { const stop0 = h.stop; h.stop = (fade = 0.12) => { if (REC && !h.stopped) { ev.stopT = r3(REC.t); ev.fade = fade; } stop0(fade); }; }
    return h;
  };
  REC.deny0 = M.fx.deny;
  M.fx.deny = (k, why) => { if (REC) REC.deny = { txt: DENY[why] || why, t: 0 }; REC.deny0?.call(M.fx, k, why); };
  return REC;
}
export function recSub(sub, title = null) { if (REC) { REC.sub = sub; if (title != null) REC.title = title; } }
export function recStop() {
  const A = Q(), R = A.renderer;
  if (!REC) return null;
  A.combat.hitListeners.delete(REC.L);
  A.game.sound.play = REC.play0;
  A.moves.fx.deny = REC.deny0;
  R.setPixelRatio(REC.keep.pr); R.setSize(REC.keep.s.x, REC.keep.s.y, false); A.camera.aspect = REC.keep.s.x / REC.keep.s.y; A.camera.updateProjectionMatrix();
  const out = { prefix: REC.prefix, frames: REC.frames.length, secs: r2(REC.t), fps: Math.round(60 / REC.every), events: REC.events };
  window.__recFrames = REC.frames; window.__recEvents = out;
  REC = null;
  return out;
}
// 推进一帧（录或不录）
export function recTick(dt = 1 / 60) {
  const A = Q();
  const rec = REC && REC.i % REC.every === 0;
  A.tick(dt, 1, !!rec);
  if (!REC) return;
  for (const p of REC.pops) p.t += dt;
  REC.pops = REC.pops.filter((p) => p.t < 0.8);
  if (REC.deny) { REC.deny.t += dt; if (REC.deny.t > 1.6) REC.deny = null; }
  if (rec) REC.frames.push(recFrame());
  REC.i++; REC.t += dt;
}
const frames = (s) => Math.round(s * 60);
function play(n, fn = null) { for (let i = 0; i < n; i++) { fn?.(i); recTick(); } }
function bar(g, x, y, w, h, f, col, bg = 'rgba(40,30,20,.28)') { g.fillStyle = bg; g.fillRect(x, y, w, h); g.fillStyle = col; g.fillRect(x, y, w * Math.max(0, Math.min(1, f)), h); }
function recFrame() {
  const A = Q(), R = A.renderer, M = A.moves, C = A.combat, U = C.playerUnit, G = REC, w = G.w, h = G.h;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.drawImage(R.domElement, 0, 0, w, h);
  g.textAlign = 'left';
  if (G.title) { g.font = '22px "KaiTi","STKaiti",serif'; g.fillStyle = '#fff4dc'; g.shadowColor = '#000'; g.shadowBlur = 6; g.fillText(G.title, 18, 34); g.shadowBlur = 0; }
  if (G.sub) { g.font = '14px "Microsoft YaHei",sans-serif'; const tw = g.measureText(G.sub).width; g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(14, 44, tw + 14, 24); g.fillStyle = '#f3e9d2'; g.fillText(G.sub, 21, 61); }
  // 左下：气血、灵力；拔刀斩的蓄力；葫芦、养元丹
  const qx = 18, qy = h - 92;
  g.fillStyle = 'rgba(244,239,228,.88)'; g.fillRect(qx - 8, qy - 16, 300, 88);
  g.font = '13px "KaiTi","STKaiti",serif'; g.fillStyle = '#2b2a27';
  g.fillText('气血', qx, qy - 2); g.fillText('灵力', qx, qy + 16); g.fillText('拔刀', qx, qy + 34);
  bar(g, qx + 36, qy - 11, 190, 8, U.hp / U.maxHp, '#b8402e');
  bar(g, qx + 36, qy + 8, 190, 6, M.mp / 100, '#3d7fa8');
  const I = M.iaiCharge, k = I ? I.k : 0;
  bar(g, qx + 36, qy + 25, 190, 7, k, k >= 1 ? '#f2c14e' : k >= 0.6 ? '#e2a43a' : '#8fc9d8');
  for (const s of [1.5, 3, 5]) { g.fillStyle = 'rgba(43,42,39,.55)'; g.fillRect(qx + 36 + 190 * s / 5 - 1, qy + 23, 2, 11); }
  g.font = '11px sans-serif'; g.fillStyle = '#2b2a27';
  g.fillText(`${Math.ceil(U.hp)} / ${U.maxHp}`, qx + 232, qy - 3); g.fillText(`${Math.floor(M.mp)}`, qx + 232, qy + 15); g.fillText(I ? `${I.secs.toFixed(1)} 秒` : '—', qx + 232, qy + 33);
  g.font = '14px "KaiTi","STKaiti",serif'; g.fillStyle = '#2b2a27';
  g.fillText(`葫芦 ${M.gourdLeft} / ${M.gourdMax} 口　　养元丹 ${A.game.state.count('yangyuan')} 颗`, qx, qy + 58);
  // 此刻的招式
  const a = M.act;
  let st = '';
  if (a) {
    if (a.key === 'iai') st = a.phase === 'enter' ? '纳刀' : a.walking ? '蓄势 · 缓步' : '蓄势';
    else if (a.key === 'iai_slash') st = `拔刀斩 · 蓄力 ${(a.charge ?? 0).toFixed(1)} 秒${a.iaiK >= 0.6 ? ' · 带剑气' : ''}`;
    else if (a.key === 'dodge' && M.iai) st = '闪身（蓄力不断）';
    else st = NAMES[a.key] || a.key;
  } else if (M.guarding) st = '格挡';
  if (st) { g.font = '17px "KaiTi","STKaiti",serif'; g.fillStyle = 'rgba(0,0,0,.45)'; const tw = g.measureText(st).width; g.fillRect(qx + 304, qy - 16, tw + 20, 28); g.fillStyle = a?.key === 'iai_slash' ? '#ffd86a' : '#fff'; g.fillText(st, qx + 314, qy + 4); }
  // 按住的键
  const held = [M.held.power && 'Z', M.held.guard && '右键', A.input.keys.has('KeyW') && 'W', A.input.keys.has('KeyA') && 'A', A.input.keys.has('KeyS') && 'S', A.input.keys.has('KeyD') && 'D'].filter(Boolean).join(' + ');
  if (held) { g.textAlign = 'right'; g.font = '13px "Microsoft YaHei",sans-serif'; g.fillStyle = 'rgba(0,0,0,.45)'; const tw = g.measureText('按住 ' + held).width; g.fillRect(w - tw - 26, h - 38, tw + 14, 24); g.fillStyle = '#e8f4ff'; g.fillText('按住 ' + held, w - 19, h - 21); }
  // 放不出的提示
  if (G.deny) { g.textAlign = 'center'; g.font = '18px "KaiTi","STKaiti",serif'; g.globalAlpha = Math.max(0, Math.min(1, (1.6 - G.deny.t) / 0.4)); g.fillStyle = 'rgba(0,0,0,.5)'; const tw = g.measureText(G.deny.txt).width; g.fillRect(w / 2 - tw / 2 - 12, h - 150, tw + 24, 30); g.fillStyle = '#ffe2c0'; g.fillText(G.deny.txt, w / 2, h - 129); g.globalAlpha = 1; }
  // 伤害浮字
  const cam = A.camera, v = new A.THREE.Vector3();
  g.textAlign = 'center';
  for (const p of G.pops) {
    v.copy(p.p); v.y += p.t * 1.2; v.project(cam);
    if (v.z > 1) continue;
    const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
    g.globalAlpha = Math.max(0, 1 - p.t / 0.8);
    g.font = p.big ? '28px "KaiTi","STKaiti",serif' : '19px "KaiTi","STKaiti",serif';
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(p.txt, x, y);
    g.fillStyle = p.col; g.fillText(p.txt, x, y);
    g.globalAlpha = 1;
  }
  return cv.toDataURL('image/jpeg', 0.9);
}
// 录完：帧分批上传为 docs/screenshots/<prefix><序号>.jpg；音效记录存为 docs/screenshots/<prefix>events.jpg（其实是 JSON，取出后改名）
export async function flush({ batch = 40 } = {}) {
  const fr = window.__recFrames || [], ev = window.__recEvents, prefix = ev?.prefix || 'r19_rec_';
  for (let i = 0; i < fr.length; i += batch) {
    await Promise.all(fr.slice(i, i + batch).map(async (u, j) => {
      const blob = await (await fetch(u)).blob();
      await fetch(`/__shot/${prefix}${String(i + j).padStart(5, '0')}`, { method: 'POST', body: blob });
    }));
  }
  if (ev) await fetch(`/__shot/${prefix}events`, { method: 'POST', body: JSON.stringify(ev) });
  const n = fr.length;
  window.__recFrames = [];
  return n;
}

// ---------- 录像脚本 ----------
// 镜头：在人物侧后方顺着人物朝向看（yawOff 偏到右后），或在身前侧面回看人物
function behind(yawOff = 0.6, pitch = 0.2, dist = 6) { const A = Q(), P = A.player; A.cam.set(P.heading + yawOff, pitch, dist); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); }
function facing(yawOff = 0.9, pitch = 0.18, dist = 4.2) { const A = Q(), P = A.player; A.cam.set(P.heading + Math.PI + yawOff, pitch, dist); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.4)); }
// 身前几只魔修（只站着挨打、不出手、不走动）；yaw：沿这个方向摆（默认人物朝向；按 W 走的方向是镜头的朝向）
function foes(list, yaw = null) {
  const A = Q(), C = A.combat, P = A.player, y = yaw ?? P.heading, f = { x: Math.sin(y), z: Math.cos(y) }, l = { x: Math.cos(y), z: -Math.sin(y) };
  for (const e of [...C.enemies]) { e.dispose(); C.enemies.splice(C.enemies.indexOf(e), 1); }
  return list.map(([k, d, s]) => { const e = C.spawn(k, { x: P.pos.x + f.x * d + l.x * s, y: P.pos.y, z: P.pos.z + f.z * d + l.z * s }, { yaw: y + Math.PI }); e.state = 'chase'; e.cool = 99; e.slamCool = 99; e.cfg = { ...e.cfg, speed: 0 }; e.hp = e.maxHp = 600; e.bar.set(1); return e; });
}
const camYaw = () => { const f = Q().cam.forward(); return Math.atan2(f.x, f.z); };
const clearFoes = () => { const C = Q().combat; for (const e of [...C.enemies]) { e.dispose(); C.enemies.splice(C.enemies.indexOf(e), 1); } };
const keys = (...k) => { const I = Q().input; I.keys.clear(); for (const x of k) I.keys.add(x); };

// 一、拔刀斩
export async function scnIai() {
  const A = Q(), M = A.moves, C = A.combat;
  await arena(); B.quietDragons(true);
  fresh(); foes([['shade', 3.4, 0]]); behind(0.62, 0.2, 5.6); play(20);
  recStart({ prefix: 'r19a_', title: '一 · 拔刀斩（Z：按住纳刀蓄势，松开拔刀）', sub: '轻点 Z：剑收入鞘、立刻拔刀横斩——最轻的一刀（伤害 26 起）' });
  M.press('power', true); play(frames(0.1)); M.press('power', false); play(frames(1.5));
  recSub('按住 Z：沉身按柄蓄力，可缓步走（每秒 1.5 米）；蓄力条到 1.5 / 3 / 5 秒各亮一档，过 3 秒出刀多一道金色剑气');
  fresh(); behind(0.62, 0.22, 6.2); foes([['shade', 7.2, -0.7], ['shade', 7.8, 0.8], ['shade', 11, 0.2]], camYaw()); play(10);
  M.press('power', true); play(frames(0.6)); keys('KeyW'); play(frames(2.3)); keys(); play(frames(0.5)); M.press('power', false); play(frames(1.7));
  recSub('蓄力中可闪身（C）：闪身不断蓄力，落地仍按着 Z 就接着蓄；蓄满 5 秒出刀——前冲最远、伤害最重');
  fresh(); foes([['shade', 4.2, -0.9], ['shade', 4.6, 0.8], ['elite', 6.5, 0]]); behind(0.62, 0.24, 6.6); play(10);
  M.press('power', true); play(frames(1.2));
  keys('KeyA'); M.press('dodge', true); play(frames(0.12)); keys(); play(frames(1.0));
  keys('KeyD'); M.press('dodge', true); play(frames(0.12)); keys(); play(frames(3.0));
  M.press('power', false); play(frames(1.8));
  recSub('蓄势中举剑格挡（右键）：这次蓄力作废，直接举剑；松开 Z 不再出刀');
  fresh(); foes([['shade', 3.6, 0]]); behind(0.62, 0.2, 5.6); play(10);
  M.press('power', true); play(frames(1.3)); C.setGuard(true); play(frames(0.8)); M.press('power', false); play(frames(0.4)); C.setGuard(false); play(frames(0.8));
  const r = recStop();
  clearFoes();
  return { frames: r.frames, secs: r.secs, events: r.events.length };
}
// 二、回血葫芦与养元丹
export async function scnGourd() {
  const A = Q(), M = A.moves, U = A.combat.playerUnit;
  await arena(); B.quietDragons(true);
  fresh(); M.refillGourd();
  const C = A.combat, noRegen0 = C.noRegen;
  C.noRegen = true;                                 // 录这一段时关掉脱战自然回复：气血条上看到的就是葫芦回的那三分之一
  facing(0.35, 0.12, 3.4); play(20);
  U.hp = U.maxHp * 0.24;
  recStart({ prefix: 'r19b_', title: '二 · 回血葫芦（2）', sub: '按 2：左手取下腰间葫芦饮一口，回复三分之一气血（160 的三分之一 ≈ 53）；饮时只能缓步走（这里按着 S 朝镜头走）' });
  play(frames(0.5));
  M.press('gourd', true); play(frames(0.3)); keys('KeyS'); play(frames(1.0)); keys(); play(frames(0.8));
  recSub('一次装满 3 口：再喝两口，「葫芦」口数 3 → 2 → 1 → 0');
  U.hp = Math.min(U.hp, U.maxHp * 0.4); M.cools.gourd = 0;
  M.press('gourd', true); play(frames(1.9));
  U.hp = Math.min(U.hp, U.maxHp * 0.4); M.cools.gourd = 0;
  M.press('gourd', true); play(frames(1.9));
  recSub('葫芦空了：按 2 只提示「葫芦已空」——打坐调息、力竭醒来、守关战重来、演武场开打时装满');
  U.hp = U.maxHp * 0.5; M.cools.gourd = 0;
  M.press('gourd', true); play(frames(1.6));
  recSub('养元丹（G）眼下恒为 99 颗：服下一枚，数目仍是 99');
  M.press('pill', true); play(frames(2.4));
  const r = recStop();
  C.noRegen = noRegen0;
  return { frames: r.frames, secs: r.secs, events: r.events.length };
}
// 三、换了的音效：普攻、成功弹反、缚灵锁、剑气、万剑归宗（落剑 / 末了的巨剑），都按游戏里的触发录下
export async function scnSounds() {
  const A = Q(), M = A.moves, C = A.combat;
  await arena(); B.quietDragons(true);
  fresh(); foes([['shade', 2.4, 0]]); behind(0.6, 0.2, 5.4); play(15);
  recStart({ prefix: 'r19c_', title: '三 · 换了的音效', sub: '普攻（按住左键四段）：dragon-studio「sword slice」——跳过开头一截，最响的一下对上剑砍中的一刻' });
  M.press('light', true); play(frames(3.0)); M.press('light', false); play(frames(0.8));
  recSub('成功弹反：dragon-studio「sword clash/hit」（魔修残魂出爪前一瞬按右键）');
  fresh(); const [e] = foes([['shade', 1.8, 0]]); behind(0.95, 0.2, 4.8); play(10);
  e.begin('melee'); play(frames(e.cfg.windup - 0.1)); C.setGuard(true); play(frames(0.3)); C.setGuard(false); play(frames(1.3));
  recSub('缚灵锁（1）：fuling.mp3（放出的一刻，从录音第 0.06 秒放起）');
  fresh(); foes([['shade', 4.5, -1.2], ['shade', 6, 1.0]]); behind(0.5, 0.22, 6.2); play(10);
  M.press('seal', true); play(frames(2.3));
  recSub('剑气·新月（Q）：jianqi.mp3（放出的一刻，从录音第 0.1 秒放起）');
  fresh(); foes([['shade', 6, -0.4], ['shade', 9, 0.5]]); behind(0.45, 0.2, 6.2); play(10);
  M.press('qi', true); play(frames(1.7));
  recSub('万剑归宗（V）：落剑用 wanjianguizong.mp3 全段（1.94 秒），末了巨剑落下用它最后一声（第 0.24 秒起）');
  fresh(); M.intent = 100; foes([['shade', 6, -1], ['shade', 6.5, 1.2], ['elite', 7.5, 0]]); behind(0.35, 0.45, 11); play(10);
  M.press('ult', true); play(frames(4.6));
  const r = recStop();
  clearFoes();
  return { frames: r.frames, secs: r.secs, events: r.events.length };
}
