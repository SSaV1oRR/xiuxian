// 第十七轮自检工具：在页面里按真实的输入、出招、结算代码推进玩家的战斗（演武场、第五十层共用）。
// 用法（控制台 / 预览）：const B = await import('/tools/r17_combat_bot.js?v=' + Date.now());
//   await B.setup()                      开局（在后台标签页里用 __qinglan.tick 手动推进）
//   await B.toArena()                    传到演武场比试圈（不开切磋，空场试招）
//   await B.snapClip('Sword_Regular_A', [0, .1, .2], { side: 1 })   摆好镜头，按动作时刻截图（docs/screenshots/r17_tmp_*.jpg）
const Q = () => window.__qinglan;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const tick = (n = 1, dt = 1 / 60, draw = true) => Q().tick(dt, n, draw);

export async function setup() {
  for (let i = 0; i < 200 && !(window.__qinglan && !document.querySelector('#enter').classList.contains('hidden')); i++) await sleep(500);
  const A = Q();
  if (!document.querySelector('#enter').classList.contains('hidden')) document.querySelector('#enter').click();
  await sleep(300); tick(5);
  if (A.game.intro) A.game.intro.t = 99;
  tick(220);
  return { world: A.world.name, pos: A.player.pos.toArray().map((v) => +v.toFixed(1)) };
}

// 测试时让护宗双龙不管魔修（免得火球、寒息打进测试里）；off=false 恢复
export function quietDragons(off = true) {
  const g = Q().game;
  g._threatFor ||= g.threatFor;
  g.threatFor = off ? () => null : g._threatFor;
}

// 演武场比试圈中心（空场）
export async function toArena() {
  const A = Q(), { ARENA } = await import('/src/world/arenaSite.js');
  if (A.world.name !== 'surface') await A.game.switchWorld('surface');
  A.player.place(ARENA.cx, ARENA.cz + 2, Math.PI, ARENA.y);
  A.cam.set(Math.PI, 0.25, 6); A.cam.snap(A.player.pos.clone().setY(ARENA.y + 1.55));
  tick(30);
  return ARENA;
}

// 重新编排动作（改了 cultivatorClips.js / cultivatorPose.js 之后不必重载页面）：返回各动作的检查结果
export async function author(only = null) {
  const A = Q(), v = Date.now();
  const [{ CultivatorPose }, C, { Cultivator }] = await Promise.all([import('/src/actors/cultivatorPose.js?v=' + v), import('/src/actors/cultivatorClips.js?v=' + v), import('/src/actors/cultivator.js')]);
  const { clips, report } = C.buildCultivatorClips(A.player.char, { only, Pose: CultivatorPose });
  Cultivator.addClips(clips, A.player.char, ...A.combat.duelists.map((d) => d.char));
  return report;
}

// 调试一帧的握法搜索：各组 roll / swing 的扭转、腕屈、代价（按代价排序取前 n 个）
export async function dbgArm(clip, t, side = 'R', n = 8) {
  const A = Q(), v = Date.now();
  const [{ CultivatorPose }, C] = await Promise.all([import('/src/actors/cultivatorPose.js?v=' + v), import('/src/actors/cultivatorClips.js?v=' + v)]);
  const S = new CultivatorPose(A.player.char);
  const full = S.prepare(C.CLIP_DEFS[clip].keys);
  const spec = S.specAt(full, t);
  S.trace = [];
  S.armPrev = {};
  S.solve(spec);
  const tr = S.trace.filter((x) => x.side === side).sort((a, b) => a.cost - b.cost);
  return { spec: { R: spec.R, L2: spec.L2 }, best: tr.slice(0, n), worstFlex: Math.max(...tr.map((x) => x.flex)), minFlex: Math.min(...tr.map((x) => x.flex)), minTw: Math.min(...tr.map((x) => Math.abs(x.tw))) };
}

// 在玩家身前 d 米放一根木人桩（只记伤害、不还手），返回它
export function dummy(d = 2.2, side = 0) {
  const A = Q(), P = A.player, C = A.combat;
  C.dummies = C.dummies.filter((x) => !x.test);
  const f = { x: Math.sin(P.heading), z: Math.cos(P.heading) }, l = { x: Math.cos(P.heading), z: -Math.sin(P.heading) };
  C.addDummies([{ x: P.pos.x + f.x * d + l.x * side, y: P.pos.y, z: P.pos.z + f.z * d + l.z * side }]);
  const t = C.dummies[C.dummies.length - 1]; t.test = true; t.id = 'testDummy';
  return t;
}

// 一个输入事件（见 sim 的说明）
export function applyEvent(e) {
  const A = Q(), M = A.moves, I = A.input, C = A.combat;
  if (e === 'L+') M.press('light', true); else if (e === 'L-') M.press('light', false);
  else if (e === 'R+') C.setGuard(true); else if (e === 'R-') C.setGuard(false);
  else if (e === 'Z+' || e === 'M+') M.press('power', true); else if (e === 'Z-' || e === 'M-') M.press('power', false);
  else if (e === 'C') M.press('dodge', true);
  else if (e === 'Tab') M.press('lock', true);
  else if (e.startsWith('move:')) { const [x, y] = e.slice(5).split(',').map(Number); I.keys.clear(); if (y > 0) I.keys.add('KeyW'); if (y < 0) I.keys.add('KeyS'); if (x > 0) I.keys.add('KeyD'); if (x < 0) I.keys.add('KeyA'); }
  else if (e === 'blur') { dispatchEvent(new Event('blur')); }
  else if (e === 'menu+') A.ui.openPanel('测试', '', document.createElement('div'), {}); else if (e === 'menu-') A.ui.closePanel();
  else { const map = { Q: 'qi', T: 'heavy', V: 'ult', G: 'pill', 1: 'seal', R: 'dash' }; if (map[e]) M.press(map[e], true); }
}

// 按脚本推进：script = [[秒, 动作], …]；动作：'L+' / 'L-'（左键按下 / 松开）、'R+' / 'R-'、'Z+' / 'Z-'、'M+' / 'M-'（中键）、
// 'C'（闪身）、'Q' 'T' 'V' 'G' '1'（剑诀）、'Tab'、'move:x,y' / 'move:0,0'（方向键）、'blur'、'menu+' / 'menu-'；
// 返回逐段的时间线（招式、起止游戏时刻、收招原因）与每段的结算
export function sim(script, { dt = 1 / 60, secs = 3, draw = false, keepHp = true } = {}) {
  const A = Q(), M = A.moves, I = A.input, C = A.combat;
  const evs = script.slice().sort((a, b) => a[0] - b[0]);
  let t = 0, k = 0;
  const segs = [], frames = [];
  let cur = null;
  const n = Math.round(secs / dt);
  for (let i = 0; i < n; i++) {
    while (k < evs.length && evs[k][0] <= t + 1e-9) applyEvent(evs[k++][1]);
    A.tick(dt, 1, draw && i === n - 1);
    if (keepHp) { C.playerUnit.hp = C.playerUnit.maxHp; }
    t += dt;
    const a = M.act, key = a ? a.key + (a.level ? a.level : '') : M.guarding ? 'guard' : 'idle';
    if (!cur || cur.key !== key || (a && cur.id !== a.id)) {
      if (cur) cur.end = +(t - dt).toFixed(3);
      cur = { key, id: a?.id, start: +t.toFixed(3), parry: M.parrying };
      segs.push(cur);
    }
    if (M.parrying) cur.parryWin = (cur.parryWin || 0) + dt;
  }
  if (cur) cur.end = +t.toFixed(3);
  const log = M.log.filter((L) => L.t0 >= M.time - secs - 0.01).map((L) => ({ id: L.id, key: L.key, ev: L.events.map((e) => `${e.k}@${e.t}${e.n != null ? '×' + e.n : ''}`).join(' '), res: L.results.length, end: L.act.endReason }));
  return { segs: segs.map((s) => `${s.key}[${s.start}-${s.end}]${s.parryWin ? ' parry ' + s.parryWin.toFixed(3) : ''}`), log, stat: { ...M.stat }, buffer: M.buffer, held: { ...M.held } };
}

// 胶片：按脚本推进，在给定的游戏时刻各截一张（镜头相对人物的角度 / 距离 / 高度固定在开始时的朝向）
export async function film(script, times, { prefix = 'film', ang = 40, dist = 4.6, h = 1.6, w = 640, hgt = 400, dt = 1 / 60, fov = 50 } = {}) {
  const A = Q(), P = A.player;
  const yaw0 = P.heading, c0 = P.pos.clone();
  const ts = times.slice().sort((a, b) => a - b);
  let t = 0, done = 0;
  const shots = [];
  const total = ts[ts.length - 1] + 0.01;
  // 分段推进：每到一个截图时刻就停下来拍
  const evs = script.slice();
  let last = 0;
  for (const ts1 of ts) {
    const seg = evs.filter((e) => e[0] >= last && e[0] < ts1).map((e) => [e[0] - last, e[1]]);
    sim(seg, { dt, secs: ts1 - last });
    last = ts1;
    const a = yaw0 + ang * Math.PI / 180, cx = (c0.x + P.pos.x) / 2, cz = (c0.z + P.pos.z) / 2;
    const pos = [cx + Math.sin(a) * dist, P.pos.y + h, cz + Math.cos(a) * dist];
    shots.push((await A.shot(`r17_tmp_${prefix}_${String(Math.round(ts1 * 1000)).padStart(4, '0')}`, { w, h: hgt, pos, at: [cx, P.pos.y + 1.0, cz], fov })).status);
    done++;
  }
  void t; void total; void done;
  return shots.length;
}

// 来招测试：在玩家身前 d 米放一个魔修（kind），让它马上出手（act：melee / slam / cast），在出手前 lead 秒按下右键（hold 秒后松开；lead 为 null 不按）。
// 返回玩家这边的结算（hit / block / parry / guardbreak / dodge…）、守势、魔修的状态
export function enemyTest(kind = 'shade', { act = 'melee', d = 1.8, lead = 0.1, hold = 0.5, face = true, dt = 1 / 60, secs = 2.2 } = {}) {
  const A = Q(), C = A.combat, P = A.player, M = A.moves;
  for (const e of [...C.enemies]) { e.dispose(); C.enemies.splice(C.enemies.indexOf(e), 1); }
  M.reset(); C.playerUnit.invuln = 0; M.iframes = 0;
  const f = { x: Math.sin(P.heading), z: Math.cos(P.heading) };
  const e = C.spawn(kind, { x: P.pos.x + f.x * d, y: P.pos.y, z: P.pos.z + f.z * d }, { yaw: P.heading + Math.PI });
  e.state = 'chase'; e.cool = 99; e.slamCool = 99;
  if (!face) P.heading += Math.PI;                                   // 背对来招
  const log = [];
  const L = (ev) => { if (ev.target === C.playerUnit) log.push({ r: ev.result, a: Math.round(ev.amount * 10) / 10, t: +tt.toFixed(3) }); };
  C.hitListeners.add(L);
  let tt = 0;
  e.begin(act);
  const C0 = e.cfg, wind = act === 'slam' ? C0.slam.windup : C0.windup;
  const pressAt = lead == null ? null : wind - lead, relAt = pressAt == null ? null : pressAt + hold;
  const n = Math.round(secs / dt);
  try {
    for (let i = 0; i < n; i++) {
      if (pressAt != null && tt <= pressAt && tt + dt > pressAt) C.setGuard(true);
      if (relAt != null && tt <= relAt && tt + dt > relAt) C.setGuard(false);
      A.tick(dt, 1, false);
      tt += dt;
      C.playerUnit.hp = C.playerUnit.maxHp;
    }
  } finally { C.hitListeners.delete(L); C.setGuard(false); }
  const res = { kind, act, lead, log, guardHP: Math.round(M.guardHP), enemy: e.state, stunT: e.stunT, parries: M.stat.parries, windows: M.stat.parryWindows, proj: C.projectiles.length };
  return res;
}

// 第五十层：龙君放一招 id，玩家在招式的动作时刻 pressAt（clip 秒）按下右键、hold 秒后松开（pressAt 为 null 不按）；返回玩家这边的结算、架势变化
export async function bossTest(id, { d = 3.2, pressAt = null, hold = 0.5, side = 0, behind = false } = {}) {
  const A = Q(), F = A.boss50, C = A.combat, M = A.moves, U = C.playerUnit;
  const B16 = await import('/tools/r16_boss_bot.js');
  if (F.state === 'dormant') { F.debug.start(); for (let i = 0; i < 30; i++) A.tick(1 / 60, 1, false); F.debug.skip(); for (let i = 0; i < 60; i++) A.tick(1 / 60, 1, false); }
  F.debug.ai(false);
  B16.stage({ d, side, behind });
  M.reset(); U.invuln = 0;
  const log = [];
  const L = (e) => { if (e.target === U) log.push({ r: e.result, a: Math.round(e.amount * 10) / 10, t: +(F.M?.t1 ?? -1).toFixed(2) }); };
  C.hitListeners.add(L);
  const p0 = F.posture;
  let pressed = false, relT = null, n = 0;
  try {
    F.debug.move(id);
    while (F.M && n < 900) {
      const t1 = F.M.t1;
      if (pressAt != null && !pressed && t1 >= pressAt) { pressed = true; C.setGuard(true); relT = M.time + hold; }
      if (relT != null && M.time >= relT) { C.setGuard(false); relT = null; }
      A.tick(1 / 60, 1, false); n++;
      U.hp = U.maxHp;
    }
    for (let k = 0; k < 120 && F.hz.length; k++) A.tick(1 / 60, 1, false);
  } finally { C.hitListeners.delete(L); C.setGuard(false); }
  return { id, pressAt, log, posture: [Math.round(p0), Math.round(F.posture)], mode: F.B.mode, parries: M.stat.parries, blocks: M.stat.blocks };
}

// 一边推进一边在指定帧拍照：fn(i) 每帧先调用（可按键、出招）；shots = { 帧号: 名字 }；镜头 cam(P) 返回 { pos, at }
export async function shootAlong(n, fn, shots, cam, { w = 960, h = 540, fov = 50, dt = 1 / 60 } = {}) {
  const A = Q(), P = A.player;
  const out = [];
  for (let i = 0; i < n; i++) {
    fn?.(i);
    A.tick(dt, 1, false);
    A.combat.playerUnit.hp = A.combat.playerUnit.maxHp;
    if (shots[i]) { const c = cam(P); out.push((await A.shot('r17_tmp_' + shots[i], { w, h, pos: c.pos, at: c.at, fov })).status); }
  }
  return out;
}
// 常用镜头：人物侧前方 ang 度、dist 米、高 h
export const camOf = (ang = 50, dist = 4.5, h = 1.7, look = 1.1) => (P) => {
  const a = P.heading + ang * Math.PI / 180;
  return { pos: [P.pos.x + Math.sin(a) * dist, P.pos.y + h, P.pos.z + Math.cos(a) * dist], at: [P.pos.x + Math.sin(P.heading) * 1.2, P.pos.y + look, P.pos.z + Math.cos(P.heading) * 1.2] };
};

// 演武场：开一场切磋（对手、难度、方式），走完倒计时，返回对手
export async function duel(opp = 'disciple', diff = 'normal', mode = 'formal') {
  const A = Q(), R = A.arena;
  if (R.active) { R.teardown(); }
  const sel = { opp, diff, mode };
  await R.prepare(sel);
  const p = R.enter(sel);
  for (let i = 0; i < 40; i++) { await sleep(25); A.tick(1 / 60, 1, false); }
  await p;
  for (let i = 0; i < 60 * 3.4; i++) A.tick(1 / 60, 1, false);
  return R.S?.duelist;
}
// 让对手一招一招出（不管 AI），玩家在出剑前 lead 秒按右键：返回结算
export function duelAttack(key, { lead = 0.08, hold = 0.4, d = 2.0 } = {}) {
  const A = Q(), R = A.arena, du = R.S.duelist, C = A.combat, M = A.moves, P = A.player, U = C.playerUnit;
  M.reset(); U.invuln = 0;
  // 对手站到玩家身前 d 米、面朝玩家
  const f = { x: Math.sin(P.heading), z: Math.cos(P.heading) };
  du.pos.set(P.pos.x + f.x * d, du.pos.y, P.pos.z + f.z * d); du.yaw = P.heading + Math.PI; du.vel.set(0, 0, 0);
  du.ai = 'attack'; du.rest = 99; du.startCombo([key]);
  const A0 = du.atk.A, wind = du.atk.wind + (A0.hold - A0.from) / A0.speed, hitT = wind + (A0.hit - A0.hold) / A0.speed;
  const log = [];
  const L = (e) => { if (e.target === U) log.push(`${e.result}:${Math.round(e.amount * 10) / 10}`); };
  C.hitListeners.add(L);
  let t = 0;
  // 第二十轮修：lead 比起手到出剑还长时（普通难度的斜劈 0.47 秒就出剑，「提前 0.6 秒举剑」），原来按右键的那一刻落在起手之前、根本没按下去——改为起手就按
  const tOn = lead == null ? null : Math.max(0, hitT - lead);
  try {
    for (let i = 0; i < 60 * 2.5; i++) {
      if (tOn != null && t <= tOn && t + 1 / 60 > tOn) C.setGuard(true);
      if (lead != null && t <= hitT - lead + hold && t + 1 / 60 > hitT - lead + hold) C.setGuard(false);
      A.tick(1 / 60, 1, false); t += 1 / 60;
      U.hp = U.maxHp;
      if (du.ai !== 'attack' && t > hitT + 0.3) break;
    }
  } finally { C.hitListeners.delete(L); C.setGuard(false); du.rest = 1.5; }
  return { key, lead, hitT: +hitT.toFixed(2), log, duAi: du.ai, stunT: +(du.stunT ?? 0).toFixed(2) };
}

// 滑步与跳变：按脚本推进，每帧量两只脚（踝）的世界位置——两帧都贴地（y < 地面 + 0.13）时水平挪动算滑步；骨盆一帧挪动的最大值（瞬移）；
// 剑尖一帧挪动的最大值。按当时的招式分别累计
export function motionCheck(script, { secs = 3, dt = 1 / 60 } = {}) {
  const A = Q(), M = A.moves, P = A.player, ch = P.char, T = A.THREE;
  const bone = (n) => ch.bones.find((b) => b.name === 'mixamorig' + n);
  const L = bone('LeftFoot'), R = bone('RightFoot'), H = bone('Hips');
  const evs = script.slice().sort((a, b) => a[0] - b[0]);
  let t = 0, k = 0;
  const prev = {}, stat = {};
  const tip = new T.Vector3(), base = new T.Vector3();
  const n = Math.round(secs / dt);
  for (let i = 0; i < n; i++) {
    while (k < evs.length && evs[k][0] <= t + 1e-9) applyEvent(evs[k++][1]);
    A.tick(dt, 1, false); t += dt;
    A.combat.playerUnit.hp = A.combat.playerUnit.maxHp;
    ch.root.updateMatrixWorld(true);
    const key = M.act ? M.act.key : M.guarding ? 'guard' : 'idle';
    const s = stat[key] ||= { slide: 0, slideMax: 0, hipJump: 0, tipJump: 0, frames: 0 };
    s.frames++;
    const g = P.pos.y;
    const cur = { l: new T.Vector3().setFromMatrixPosition(L.matrixWorld), r: new T.Vector3().setFromMatrixPosition(R.matrixWorld), h: new T.Vector3().setFromMatrixPosition(H.matrixWorld) };
    if (P.char.handSword.visible) { ch.bladeEnds(tip, base); cur.tip = tip.clone(); }
    if (prev.l) {
      for (const f of ['l', 'r']) {
        if (cur[f].y < g + 0.13 && prev[f].y < g + 0.13) { const d = Math.hypot(cur[f].x - prev[f].x, cur[f].z - prev[f].z); s.slide += d; s.slideMax = Math.max(s.slideMax, d); if (d > 0.012) (s.at ||= []).push(`${f}${(M.act?.t ?? 0).toFixed(2)}:${d.toFixed(3)}`); }
      }
      s.hipJump = Math.max(s.hipJump, cur.h.distanceTo(prev.h));
      if (cur.tip && prev.tip) s.tipJump = Math.max(s.tipJump, cur.tip.distanceTo(prev.tip));
    }
    Object.assign(prev, cur);
  }
  for (const s of Object.values(stat)) { s.slide = +s.slide.toFixed(3); s.slideMax = +s.slideMax.toFixed(3); s.hipJump = +s.hipJump.toFixed(3); s.tipJump = +s.tipJump.toFixed(3); }
  return stat;
}

// 压力测试：secs 秒连续作战（左键一直按着，隔几秒放剑气 / 缚灵锁 / 蓄力重击 / 闪身 / 格挡），身边保持 n 个魔修；
// 比较开始与结束时的显存对象、着色器程序、JS 堆、DOM 节点、特效与投射物的数量
export function stress({ secs = 90, n = 3, dt = 1 / 60, drawEvery = 30 } = {}) {
  const A = Q(), C = A.combat, M = A.moves, P = A.player, R = A.renderer;
  const snap = () => ({ geo: R.info.memory.geometries, tex: R.info.memory.textures, prog: R.info.programs?.length, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    dom: document.getElementsByTagName('*').length, fx: C.effects.length, proj: C.projectiles.length, tele: C.telegraphs.length, nums: C.numbers.length, enemies: C.enemies.length,
    crescents: A.sfx.crescents.pool.filter((c) => c.busy).length, binds: A.sfx.binds.pool.filter((b) => b.busy).length, chains: A.sfx.chains.list.length, sceneChildren: C.scene.children.length });
  const s0 = snap();
  const kinds = ['shade', 'shade', 'caster', 'elite'];
  let k = 0, frames = 0, kills = 0;
  const onD = () => { kills++; };
  M.press('light', true);
  const t0 = performance.now();
  for (let i = 0; i < Math.round(secs / dt); i++) {
    const alive = C.enemies.filter((e) => e.alive && e.world === C.worldName);
    if (alive.length < n) {
      const a = Math.random() * Math.PI * 2, d = 5 + Math.random() * 4;
      const e = C.spawn(kinds[k++ % kinds.length], { x: P.pos.x + Math.cos(a) * d, y: P.pos.y, z: P.pos.z + Math.sin(a) * d }, { yaw: 0 });
      e.state = 'chase'; e.onDeath = onD;
    }
    const t = i * dt;
    if (i % 240 === 60) M.press('qi', true);
    if (i % 240 === 120) M.press('seal', true);
    if (i % 300 === 150) { M.press('power', true); }
    if (i % 300 === 200) { M.press('power', false); }
    if (i % 420 === 300) { C.setGuard(true); }
    if (i % 420 === 360) { C.setGuard(false); }
    if (i % 180 === 90) M.press('dodge', true);
    A.tick(dt, 1, i % drawEvery === 0);
    C.playerUnit.hp = C.playerUnit.maxHp; C.playerUnit.alive = true; M.mp = 100;
    frames++;
    void t;
  }
  M.press('light', false);
  const ms = performance.now() - t0;
  for (const e of [...C.enemies]) { e.dispose(); C.enemies.splice(C.enemies.indexOf(e), 1); }
  for (let i = 0; i < 180; i++) A.tick(dt, 1, i % 30 === 0);
  const s1 = snap();
  return { frames, kills, msPerFrame: +(ms / frames).toFixed(2), before: s0, after: s1, stat: { ...M.stat }, stopCount: C.stopCount, sounds: A.sound?.dropped ?? 0 };
}

// 回归检查：御剑起落、打坐、对话、丹房 / 问道殿 / 通天塔 / 幽渊秘境进出、第五十层重试与退出，各步收集控制台错误与关键状态
export async function regress() {
  const A = Q(), g = A.game, M = A.moves, P = A.player, out = [];
  const errs = [];
  const onErr = (e) => errs.push(String(e.message || e.reason || e));
  addEventListener('error', onErr); addEventListener('unhandledrejection', onErr);
  const step = async (name, fn) => { const n0 = errs.length; try { const r = await fn(); out.push(`${name}: ok${r ? ' ' + JSON.stringify(r) : ''}${errs.length > n0 ? ' 错误 ' + errs.slice(n0).join(' / ') : ''}`); } catch (e) { out.push(`${name}: 异常 ${e.message}`); } };
  const tk = (n = 60) => { for (let i = 0; i < n; i++) A.tick(1 / 60, 1, false); };
  try {
    await step('回宗门', async () => { if (A.world.name !== 'surface') await g.switchWorld('surface'); tk(30); return { world: A.world.name }; });
    await step('御剑起落', async () => { P.place(0, 100, Math.PI); tk(20); g.toggleFlight(); tk(90); const fly = P.flying; M.press('light', true); tk(30); M.press('light', false); const actWhileFly = M.act?.key || null; g.toggleFlight(); tk(400); return { fly, actWhileFly, landed: !P.flying }; });
    await step('出招后打坐', async () => { M.press('light', true); tk(10); M.press('light', false); tk(80); g.startMeditate('array'); tk(30); const med = !!g.meditating; M.press('light', true); tk(10); M.press('light', false); const act = M.act?.key || null; g.endMeditate(true); tk(20); return { med, actWhileMed: act }; });
    await step('对话中出招', async () => { const n = Object.values(g.npcs)[0]; if (!n) return { skip: 'no npc' }; P.place(n.pos.x + 1.5, n.pos.z, -Math.PI / 2); tk(10); g.ui.talk?.(n.def?.name || '弟子', [{ text: '测试' }]); tk(5); M.press('light', true); tk(10); M.press('light', false); const act = M.act?.key || null; g.ui.endTalk?.(); tk(10); return { busy: g.ui.busy, actInDlg: act }; });
    await step('丹房进出', async () => { await g.switchWorld('alchemy'); tk(30); M.press('qi', true); tk(10); const deny = M.act?.key || null; await g.switchWorld('surface'); tk(30); return { qiIndoor: deny }; });
    await step('问道殿进出', async () => { await g.switchWorld('hall'); tk(30); M.press('light', true); tk(20); M.press('light', false); tk(40); await g.switchWorld('surface'); tk(30); return { world: A.world.name }; });
    await step('幽渊秘境', async () => { await g.switchWorld('abyss'); tk(60); M.press('light', true); tk(60); M.press('light', false); tk(60); const en = A.combat.alive().length; await g.switchWorld('surface'); tk(30); return { enemiesThere: en }; });
    await step('通天塔与第五十层', async () => { await g.towerRoom.enter(); tk(30); await A.boss50.enter(); tk(60); A.boss50.debug.start(); tk(30); A.boss50.debug.skip(); tk(90); M.press('light', true); tk(90); M.press('light', false); await A.boss50.retry(true, true); tk(60); const st = A.boss50.state; A.boss50.debug.start(); tk(30); A.boss50.debug.skip(); tk(60); A.boss50.exit?.(); for (let i = 0; i < 40; i++) { await sleep(30); tk(5); } return { afterRetry: st, act: M.act?.key || null, world: A.world.name }; });
    await step('回宗门（存档）', async () => { if (A.world.name !== 'surface') await g.switchWorld('surface'); tk(30); A.state.save?.(); return { world: A.world.name, hp: Math.round(A.combat.playerUnit.hp) }; });
  } finally { removeEventListener('error', onErr); removeEventListener('unhandledrejection', onErr); }
  return out;
}

// =====================================================================================
// 录像：逐帧推进、每 every 帧录一帧（画面 + 一层说明：气血 / 灵力 / 守势、此刻的招式与阶段、弹反窗口、反击、按住的键、对手血条、
// 结算浮字——弹反、格挡、破防、受击、伤害），同步上传为 docs/screenshots/<prefix><序号>.jpg
// =====================================================================================
const NAMES = { light1: '斜斩', light2: '反手横斩', light3: '突刺', light4: '重劈', charge: '蓄力', power: '蓄力横扫', iai: '纳刀蓄势', iai_slash: '拔刀斩', gourd: '回血葫芦', qi: '剑气·新月', seal: '缚灵锁', dash: '惊鸿掠影', heavy: '破岳', ult: '万剑归宗', pill: '服丹', dodge: '闪身', draw: '拔剑入势', react: '受击', knockdown: '倒地' };
let REC = null;
export function recStart({ prefix = 'r17f_', every = 2, w = 960, h = 540, title = '', sub = '', foe = null } = {}) {
  const A = Q(), R = A.renderer;
  REC = { prefix, every, w, h, n: 0, i: 0, title, sub, foe, pops: [], keep: { s: R.getSize(new A.THREE.Vector2()), pr: R.getPixelRatio() } };
  R.setPixelRatio(1); R.setSize(w, h, false); A.camera.aspect = w / h; A.camera.updateProjectionMatrix();
  REC.L = (e) => {
    if (!REC) return;
    const U = A.combat.playerUnit, p = (e.target.boss && e.target.hitPoint ? e.target.hitPoint : e.target.pos).clone();
    p.y = (e.target.headY ?? p.y + 1.8) + 0.25;
    let txt = null, col = '#fff';
    if (e.target === U) { txt = { parry: '弹反', block: `格挡 -${Math.round(e.amount)}`, guardbreak: '破防', hit: `-${Math.round(e.amount)}`, dodge: '闪', immune: null }[e.result]; col = { parry: '#ffd86a', block: '#bfefff', guardbreak: '#ff7a5a', hit: '#ff6a55', dodge: '#bfefff' }[e.result]; }
    else if (e.from === U || e.from?.isPlayer) { txt = e.result === 'block' ? '被挡' : e.result === 'immune' ? '免疫' : `${Math.round(e.amount)}`; col = e.result === 'block' ? '#bfefff' : '#fff6e0'; }
    if (txt) REC.pops.push({ txt, col, p, t: 0, big: e.result === 'parry' || e.result === 'guardbreak' });
  };
  A.combat.hitListeners.add(REC.L);
  return REC;
}
export function recSub(sub, title = null) { if (REC) { REC.sub = sub; if (title != null) REC.title = title; } }
export function recStop() {
  const A = Q(), R = A.renderer;
  if (!REC) return 0;
  A.combat.hitListeners.delete(REC.L);
  R.setPixelRatio(REC.keep.pr); R.setSize(REC.keep.s.x, REC.keep.s.y, false); A.camera.aspect = REC.keep.s.x / REC.keep.s.y; A.camera.updateProjectionMatrix();
  const n = REC.n; REC = null; return n;
}
// 推进一帧（录或不录）；fn(i) 每帧先调用
export function recTick(dt = 1 / 60) {
  const A = Q();
  const rec = REC && REC.i % REC.every === 0;
  A.tick(dt, 1, !!rec);
  if (REC) { for (const p of REC.pops) p.t += dt; REC.pops = REC.pops.filter((p) => p.t < 0.75); if (rec) recFrame(); REC.i++; }
}
function bar(g, x, y, w, h, f, col, bg = 'rgba(40,30,20,.28)') { g.fillStyle = bg; g.fillRect(x, y, w, h); g.fillStyle = col; g.fillRect(x, y, w * Math.max(0, Math.min(1, f)), h); }
function recFrame() {
  const A = Q(), R = A.renderer, M = A.moves, C = A.combat, U = C.playerUnit, G = REC, w = G.w, h = G.h;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.drawImage(R.domElement, 0, 0, w, h);
  // 标题与说明
  g.textAlign = 'left';
  if (G.title) { g.font = '22px "KaiTi","STKaiti",serif'; g.fillStyle = '#fff4dc'; g.shadowColor = '#000'; g.shadowBlur = 6; g.fillText(G.title, 18, 34); g.shadowBlur = 0; }
  if (G.sub) { g.font = '14px "Microsoft YaHei",sans-serif'; const tw = g.measureText(G.sub).width; g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(14, 44, tw + 14, 24); g.fillStyle = '#f3e9d2'; g.fillText(G.sub, 21, 61); }
  // 对手血条
  const foe = G.foe?.();
  if (foe) {
    const bw = Math.min(300, w * 0.32), bx = w - bw - 20, cx = bx + bw / 2;
    g.textAlign = 'center'; g.font = '16px "KaiTi","STKaiti",serif'; g.fillStyle = '#f6eadf'; g.shadowColor = '#000'; g.shadowBlur = 4; g.fillText(foe.name, cx, 24); g.shadowBlur = 0;
    bar(g, bx, 31, bw, 8, foe.hp, '#c0281e', 'rgba(10,8,8,.6)');
    if (foe.posture != null) bar(g, bx + bw * 0.2, 42, bw * 0.6, 3, foe.posture, '#e0b45a', 'rgba(10,8,8,.5)');
    if (foe.note) { g.font = '14px "KaiTi","STKaiti",serif'; g.fillStyle = foe.noteCol || '#e6dcff'; g.shadowColor = '#000'; g.shadowBlur = 4; g.fillText(foe.note, cx, 62); g.shadowBlur = 0; }
  }
  // 玩家：气血、灵力、守势
  const qx = 18, qy = h - 70;
  g.textAlign = 'left';
  g.fillStyle = 'rgba(244,239,228,.88)'; g.fillRect(qx - 8, qy - 16, 262, 66);
  g.font = '13px "KaiTi","STKaiti",serif'; g.fillStyle = '#2b2a27';
  g.fillText('气血', qx, qy - 2); g.fillText('灵力', qx, qy + 16); g.fillText('守势', qx, qy + 33);
  bar(g, qx + 36, qy - 11, 170, 8, U.hp / U.maxHp, '#b8402e');
  const pend = M.pendingMp || 0;
  bar(g, qx + 36, qy + 8, 170, 6, (M.mp - pend) / 100, '#3d7fa8');
  if (pend) { g.fillStyle = 'rgba(120,190,230,.6)'; g.fillRect(qx + 36 + 170 * (M.mp - pend) / 100, qy + 8, 170 * pend / 100, 6); }
  const broken = M.time < M.guardLock;
  bar(g, qx + 36, qy + 26, 170, 5, M.guardHP / 100, broken ? '#c0402e' : M.guarding ? '#f0d58c' : '#b99a4e');
  g.font = '11px sans-serif'; g.fillStyle = '#2b2a27'; g.fillText(`${Math.ceil(U.hp)}`, qx + 212, qy - 3); g.fillText(`${Math.floor(M.mp)}`, qx + 212, qy + 15); g.fillText(broken ? '破' : `${Math.ceil(M.guardHP)}`, qx + 212, qy + 32);
  // 此刻的招式、阶段、窗口
  const a = M.act, D = a?.def;
  let st = '', col = '#fff';
  if (a) {
    const ph = a.react ? '' : D.active ? (a.t < D.active[0] ? '前摇' : a.t <= D.active[1] ? '出手' : '收势') : D.release != null ? (a.t < D.release ? '起手（未放出）' : '已放出') : '';
    st = `${NAMES[a.key] || a.key}${a.level ? ` · ${a.level}档` : ''}${ph ? ' · ' + ph : ''}${a.counter ? ' · 反击' : ''}`;
    col = ph === '出手' ? '#ffd86a' : '#fff';
  } else if (M.guarding) st = '格挡';
  if (M.parrying) { st += (st ? '  ' : '') + '【弹反窗口】'; col = '#ffd86a'; }
  if (M.countering && !a) st += (st ? '  ' : '') + '反击窗口';
  if (st) { g.font = '17px "KaiTi","STKaiti",serif'; g.fillStyle = 'rgba(0,0,0,.45)'; const tw = g.measureText(st).width; g.fillRect(qx + 266, qy - 16, tw + 20, 28); g.fillStyle = col; g.fillText(st, qx + 276, qy + 4); }
  // 按住的键
  const keys = [M.held.light && '左键', M.held.guard && '右键', M.held.power && 'Z'].filter(Boolean).join(' + ');
  if (keys) { g.textAlign = 'right'; g.font = '13px "Microsoft YaHei",sans-serif'; g.fillStyle = 'rgba(0,0,0,.45)'; const tw = g.measureText('按住 ' + keys).width; g.fillRect(w - tw - 26, h - 38, tw + 14, 24); g.fillStyle = '#e8f4ff'; g.fillText('按住 ' + keys, w - 19, h - 21); }
  // 结算浮字
  const cam = A.camera, v = new A.THREE.Vector3();
  g.textAlign = 'center';
  for (const p of G.pops) {
    v.copy(p.p); v.y += p.t * 1.2; v.project(cam);
    if (v.z > 1) continue;
    const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
    g.globalAlpha = Math.max(0, 1 - p.t / 0.75);
    g.font = p.big ? '30px "KaiTi","STKaiti",serif' : '19px "KaiTi","STKaiti",serif';
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(p.txt, x, y);
    g.fillStyle = p.col; g.fillText(p.txt, x, y);
    g.globalAlpha = 1;
  }
  const url = cv.toDataURL('image/jpeg', 0.88), bin = atob(url.slice(url.indexOf(',') + 1)), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const x = new XMLHttpRequest();
  x.open('POST', '/__shot/' + G.prefix + String(G.n++).padStart(5, '0'), false);
  x.send(arr);
}

// ---------- 录像脚本 ----------
const run = (frames, fn = null) => { for (let i = 0; i < frames; i++) { fn?.(i); recTick(); const U = Q().combat.playerUnit; if (U.hp < 40) U.hp = U.maxHp; } };
const secsF = (s) => Math.round(s * 60);
// 镜头（cam.set 的 yaw 是镜头所看的方向）。frame：在人物身前侧面回看人物（对打时两人都侧对镜头）；
// behind：在人物侧后方、顺着人物朝向看（身前的目标都在画面里；没有目标时出招朝镜头方向，也就是人物原本的朝向）
function frame(yawOff = 0.9, pitch = 0.2, dist = 5.6) {
  const A = Q(), P = A.player;
  A.cam.set(P.heading + Math.PI + yawOff, pitch, dist);
  A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55));
}
function behind(yawOff = 0.6, pitch = 0.2, dist = 6) {
  const A = Q(), P = A.player;
  A.cam.set(P.heading + yawOff, pitch, dist);
  A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55));
}
// 上一段录像留下的切磋（对手还站在场上）先收掉
function endDuel() { const R = Q().arena; if (R?.S) R.teardown(); }
function placeDuelist(du, d = 2.3) {
  const P = Q().player, f = { x: Math.sin(P.heading), z: Math.cos(P.heading) };
  du.pos.set(P.pos.x + f.x * d, du.pos.y, P.pos.z + f.z * d); du.yaw = P.heading + Math.PI; du.vel.set(0, 0, 0);
  du.ai = 'neutral'; du.rest = 99; du.hp = du.maxHp; du.bar.set(1);
}
// 让对手出一招，在出剑前 lead 秒按右键（null 不按），hold 秒后松开；返回出剑时刻（帧）
function duelSwing(du, key, lead, hold, after = 0.9) {
  const M = Q().moves, C = Q().combat;
  du.ai = 'attack'; du.rest = 99; du.startCombo([key]);
  const A0 = du.atk.A, hitT = du.atk.wind + (A0.hold - A0.from) / A0.speed + (A0.hit - A0.hold) / A0.speed;
  const pressF = lead == null ? -1 : secsF(hitT - lead), relF = lead == null ? -1 : secsF(hitT - lead + hold);
  run(secsF(hitT + after), (i) => { if (i === pressF) C.setGuard(true); if (i === relF) C.setGuard(false); });
  void M;
  return hitT;
}
export async function scnDuel() {
  const A = Q(), P = A.player, C = A.combat, M = A.moves;
  await toArena(); quietDragons(true);
  const du = await duel('instructor', 'normal', 'free');
  M.reset(); M.mp = 100;
  placeDuelist(du, 2.4); frame(0.75, 0.18, 5.4); run(10);
  M.lock = du;                                    // Tab 锁定对手：出招对着它（镜头仍自由）
  const foe = () => ({ name: `${du.def.name} · ${du.def.who}`, hp: du.hp / du.maxHp, note: du.ai === 'stagger' ? '失衡' : du.guarding ? '举剑' : du.ai === 'attack' ? (du.atk?.phase === 'wind' ? '前摇' : '出剑') : '', noteCol: du.ai === 'stagger' ? '#ffd86a' : '#ffb8a8' });
  // 一、四段普攻：按住左键
  recStart({ prefix: 'r17a_', title: '一 · 四段普攻（按住左键连续出手）', sub: '斜斩 → 反手横斩 → 突刺 → 重劈；第四式收势后才从第一式再起；松开左键，当前这一下打完即停', foe });
  M.press('light', true);
  run(secsF(4.6), () => { if (du.hp < du.maxHp * 0.3) { du.hp = du.maxHp; du.bar.set(1); } if (du.ai === 'down' || du.ai === 'getup') { /* 等起身 */ } });
  M.press('light', false); run(secsF(1.2));
  recSub('单击：只出一剑（不会把整套连招放完）');
  placeDuelist(du, 2.4); run(20);
  M.press('light', true); run(3); M.press('light', false); run(secsF(1.0));
  recSub('快速连点：只缓冲最近一下（约 0.15 秒），到可接的时刻接下一式，不会无限排队');
  for (let k = 0; k < 6; k++) { M.press('light', true); run(3); M.press('light', false); run(4); }
  run(secsF(1.6));
  M.lock = du;
  // 二、弹反 / 格挡 / 破防 / 先攻后弹
  recSub('弹反：对手出剑前一瞬按下右键（弹反窗口 0.18 秒）——不受伤害，对手失衡，随后反击', '二 · 弹反、格挡与破防');
  placeDuelist(du, 2.2); run(20);
  duelSwing(du, 'slashA', 0.08, 0.25, 0.05);
  M.press('light', true); run(6); M.press('light', false); run(secsF(1.3));
  recSub('格挡：早早举剑按住——扣守势、漏过少许伤害，人顶住');
  placeDuelist(du, 2.2); run(20);
  duelSwing(du, 'slashB', 0.5, 1.0, 0.6);
  recSub('重劈（出剑前剑上金光）难挡：举剑硬接扣得多、漏得多，第二下守势见底即破防');
  placeDuelist(du, 2.3); run(20); M.guardHP = 100;
  C.setGuard(true);
  duelSwing(du, 'slashC', null, 0, 0.5);
  du.atk = null; du.ai = 'neutral'; run(10);
  duelSwing(du, 'slashC', null, 0, 1.6);
  C.setGuard(false); run(secsF(0.8));
  recSub('先攻后弹：自己出两剑，对手反刺——收势中按右键弹开（窗口只在真正举剑时打开）');
  placeDuelist(du, 2.0); run(20); M.guardHP = 100;
  M.press('light', true); run(secsF(0.36)); M.press('light', false);
  run(secsF(0.3));
  duelSwing(du, 'thrust', 0.09, 0.3, 0.1);
  M.press('light', true); run(6); M.press('light', false); run(secsF(1.6));
  return recStop();
}

// 在玩家身前放几只魔修（只站着挨打，不出手），返回它们
function foes(list) {
  const A = Q(), C = A.combat, P = A.player, f = { x: Math.sin(P.heading), z: Math.cos(P.heading) }, l = { x: Math.cos(P.heading), z: -Math.sin(P.heading) };
  for (const e of [...C.enemies]) { e.dispose(); C.enemies.splice(C.enemies.indexOf(e), 1); }
  return list.map(([k, d, s]) => { const e = C.spawn(k, { x: P.pos.x + f.x * d + l.x * s, y: P.pos.y, z: P.pos.z + f.z * d + l.z * s }, { yaw: P.heading + Math.PI }); e.state = 'chase'; e.cool = 99; e.slamCool = 99; e.cfg = { ...e.cfg, speed: 0 }; e.hp = e.maxHp = 400; e.bar.set(1); return e; });
}
export async function scnSkills() {
  const A = Q(), P = A.player, C = A.combat, M = A.moves;
  await toArena(); quietDragons(true); endDuel();
  M.reset(); M.mp = 100;
  const press = (k) => M.press(k, true);
  recStart({ prefix: 'r17b_', title: '三 · 剑诀特写', sub: '剑气·新月（Q）：以指抹剑、横斩，一道立体的月牙贯穿沿途，撞墙即散' });
  foes([['shade', 5, -0.8], ['shade', 7.5, 0.7], ['shade', 10, -0.3]]);
  behind(0.45, 0.2, 6.2); run(20);
  press('qi'); run(secsF(1.6));
  recSub('缚灵锁（1）：竖剑掐诀、推掌，金链缚住身前扇形内至多三个敌人（寻常魔修定身 2.4 秒）');
  M.mp = 100; M.cools.seal = 0;
  foes([['shade', 4.5, -1.2], ['shade', 6, 1.0], ['elite', 7.5, 0]]);
  run(15); press('seal'); run(secsF(2.6));
  recSub('蓄力重击（按住 Z）：三档蓄力，松开压步横扫两百余度；满蓄斩出一道金色剑气');
  foes([['shade', 2.3, -0.7], ['shade', 2.6, 0.9], ['shade', 7, 0]]);
  behind(0.6, 0.2, 5.8); run(15);
  M.press('power', true); run(secsF(1.25)); M.press('power', false); run(secsF(1.5));
  recSub('破岳（T）：四连重斩，末式破地——地上金环即伤害半径，填满即破地');
  M.mp = 100; M.cools.heavy = 0;
  foes([['shade', 2.4, -0.8], ['shade', 2.8, 0.9], ['shade', 4.3, 0.2]]);
  behind(0.5, 0.32, 7.5); run(15); press('heavy'); run(secsF(3.0));
  recSub('万剑归宗（V，剑意满）：剑阵落地（外圈即范围），万剑自天而降，末了巨剑镇住阵心');
  M.intent = 100; M.cools.ult = 0;
  foes([['shade', 6, -1], ['shade', 6.5, 1.2], ['elite', 7.5, 0]]);
  behind(0.35, 0.45, 11); run(15); press('ult'); run(secsF(4.3));
  recSub('惊鸿掠影（R）：身化惊鸿疾掠七步，途经之敌各受一剑；掠身时不受伤害');
  M.mp = 100; M.cools.dash = 0;
  foes([['shade', 3.5, -0.4], ['shade', 6, 0.5]]);
  behind(0.55, 0.25, 7); run(15); press('dash'); run(secsF(1.6));
  recSub('不可格挡的来招：魔将震地前头顶亮红色「危」字，地上深红圈——举剑也挡不住，只能闪开（C）');
  const [el] = foes([['elite', 3.2, 0]]);
  behind(0.9, 0.25, 7.5); run(10);
  el.slamCool = 0; el.begin('slam');
  run(secsF(1.05)); M.press('dodge', true); run(secsF(1.4));
  for (const e of [...C.enemies]) { e.dispose(); C.enemies.splice(C.enemies.indexOf(e), 1); }
  return recStop();
}
export async function scnCancel() {
  const A = Q(), C = A.combat, M = A.moves, I = A.input;
  await toArena(); quietDragons(true); endDuel();
  const until = (fn, max = 400) => { for (let i = 0; i < max && !fn(M.act); i++) recTick(); };
  // 每一段：回到比试圈中心，身前 d 米一只魔修残魂（只挨打），镜头在人物侧后方
  const setup = async (d) => { await toArena(); M.reset(); M.mp = 100; for (const k in M.cools) M.cools[k] = 0; foes([['shade', d, 0]]); behind(0.5, 0.2, 5.4); };
  await setup(3.2); run(10);
  recStart({ prefix: 'r17c_', title: '四 · 取消与收势', sub: '剑气起手中按 C 闪身取消：剑气没放出、不扣灵力（灵力条上预扣的淡色一段消失），只留 0.4 秒再按间隔' });
  M.press('qi', true); run(secsF(0.1)); M.press('dodge', true); run(secsF(1.3));
  recSub('蓄力中按右键：蓄力作废、直接举剑（什么都不扣），这一下真正举剑才开弹反窗口');
  await setup(3.2); run(8);
  M.press('power', true); run(secsF(0.7)); C.setGuard(true); run(secsF(0.8)); C.setGuard(false); M.press('power', false); run(secsF(0.8));
  // 按住左键接到第四式（重劈），起手后松开；到了承诺段（举剑过顶之后）再按住右键
  recSub('重劈的承诺段（举剑过顶到劈落，0.28–0.74 秒）：其间按住右键不会立刻举剑，到收势的格挡窗口（0.8 秒）才举起，这样举起的不开弹反窗口');
  await setup(2.4); run(8);
  M.press('light', true); until((x) => x?.key === 'light4'); M.press('light', false);
  until((x) => x?.key === 'light4' && x.t >= 0.32);
  C.setGuard(true); run(secsF(1.1)); C.setGuard(false); run(secsF(0.6));
  recSub('重劈收势长：一直按着左键，也要等第四式收完（1.05 秒）才从第一式再起');
  await setup(2.4); run(8);
  M.press('light', true); until((x) => x?.key === 'light4'); until((x) => x?.key === 'light1', 200); run(secsF(0.3)); M.press('light', false); run(secsF(1.0));
  recSub('破岳：前段（四连斩之间）可闪身取消，后面的斩击与破地都不再出（灵力已在放出时扣过）；临近破地（2.15–2.75 秒）是承诺段');
  await setup(2.6); run(8);
  M.press('heavy', true); run(secsF(0.9));
  I.keys.add('KeyA'); M.press('dodge', true); recTick(); I.keys.clear();          // 向左闪身
  run(secsF(1.4));
  for (const e of [...C.enemies]) { e.dispose(); C.enemies.splice(C.enemies.indexOf(e), 1); }
  return recStop();
}
export async function scnBoss() {
  const A = Q(), F = A.boss50, C = A.combat, M = A.moves, U = C.playerUnit;
  const B16 = await import('/tools/r16_boss_bot.js');
  endDuel();
  if (A.world.name !== 'boss50') { await A.game.towerRoom.enter(); tick(30); await A.boss50.enter(); tick(60); }
  if (F.state === 'dormant') { F.debug.start(); for (let i = 0; i < 30; i++) A.tick(1 / 60, 1, false); F.debug.skip(); for (let i = 0; i < 60; i++) A.tick(1 / 60, 1, false); }
  F.debug.ai(false); F.debug.hp('debug');
  const foe = () => ({ name: '镇塔龙君 · 烬霄', hp: F.unit.hp / F.unit.maxHp, posture: F.posture / 100, note: F.M ? `${F.M.def.no} · ${F.M.def.name}` : F.B.mode === 'stagger' ? '失衡 · 破绽' : '', noteCol: F.B.mode === 'stagger' ? '#ffd86a' : '#e6dcff' });
  // 一招：龙与玩家摆好（镜头沿用 r16 的站位：玩家侧后方、看向龙），龙出这一招；招中 t1 到 pressAt 时按下右键、hold 秒后松开。
  // guard：开招前的守势（接着上一招的守势演示破防；这时守势暂不回复）
  const move = (id, pressAt, hold, d = 3.2, o = {}) => {
    B16.stage({ d }); M.reset(); U.invuln = 0;
    M.guardHP = o.guard ?? 100; if (o.guard != null) M.guardUsed = M.time + 3;
    F.debug.move(id);
    let pressed = false, rel = -1, n = 0;
    while (F.M && n < 700) { const t1 = F.M.t1; if (pressAt != null && !pressed && t1 >= pressAt) { pressed = true; C.setGuard(true); rel = n + secsF(hold); } if (n === rel) C.setGuard(false); recTick(); n++; U.hp = U.maxHp; }
    C.setGuard(false); run(secsF(0.5));
  };
  recStart({ prefix: 'r17d_', title: '五 · 第五十层：与龙君同一套规矩', sub: '裂空龙爪：出爪前一瞬按右键——弹反，龙君收手，架势 +22', foe });
  move('claw1', 0.44, 0.3);
  recSub('双爪追猎：两爪逐段结算——弹开第一爪、第二爪照常来（此招配置为不打断后续），按住则挡下');
  move('claw2', 0.6, 1.2);
  recSub('三段猎杀：弹开第一爪即打断后面两段（此招配置为弹反后作废余下的段）');
  move('combo3', 0.66, 0.3, 3.0);
  recSub('龙尾回扫是难挡的重击：硬挡一下扣守势 55（剩 45）');
  move('tailsweep', 0.5, 1.2, 3.6);
  recSub('守势只剩 45 时再硬挡龙尾回扫：破防，踉跄、短时举不起剑');
  move('tailsweep', 0.5, 1.2, 3.6, { guard: 45 });
  recSub('龙尾回扫可以弹反：出尾前一瞬按右键，把这一招打断');
  move('tailsweep', 1.12, 0.3, 3.6);
  recSub('迟发碎岳：不可格挡（红圈、「危」字）——举剑照样受伤');
  move('slam', 1.2, 1.0, 3.0);
  recSub('架势攒满（弹反、重击都会积累）：龙君失衡跪地，受到的伤害提高');
  F.posture = 92; move('claw1', 0.44, 0.3);
  run(secsF(2.0));
  return recStop();
}

// 镜头：玩家侧面（side 1 右侧 / -1 左侧 / 0 正面 / 2 背后），距离 dist
export function camAround(side = 1, dist = 4.2, h = 1.25, look = 1.0) {
  const A = Q(), P = A.player, f = { x: Math.sin(P.heading), z: Math.cos(P.heading) }, r = { x: -Math.cos(P.heading), z: Math.sin(P.heading) };
  let dx, dz;
  if (side === 0) { dx = f.x; dz = f.z; } else if (side === 2) { dx = -f.x; dz = -f.z; } else { dx = r.x * side + f.x * 0.35; dz = r.z * side + f.z * 0.35; }
  const l = Math.hypot(dx, dz);
  return { pos: [P.pos.x + dx / l * dist, P.pos.y + h, P.pos.z + dz / l * dist], at: [P.pos.x + f.x * 0.4, P.pos.y + look, P.pos.z + f.z * 0.4], fov: 50 };
}

// 定格一段动作的某一刻
export function pose(clip, t) {
  const A = Q(), P = A.player, ch = P.char;
  ch.anim.play(clip, { from: t, to: t + 0.001, speed: 0, hold: true, fade: 0 });
  ch.anim.update(0);
  for (let i = 0; i < 2; i++) ch.update(1 / 60, P.pos, P.heading, { mode: 'walk', onGround: true, speed: 0, drawn: true });
}
// 几个时刻 × 几个机位的近景（每张 w×h），文件名 r17_tmp_<prefix>_<时刻>_<机位>.jpg
// views：[角度（相对人物朝向，0 正前、90 人物左侧、-90 右侧、180 背后）, 距离, 镜头高度]
export async function views(clip, times, { prefix = clip, views: vs = [[35, 2.7, 1.35], [-80, 2.9, 1.25], [180, 2.9, 1.7]], w = 420, h = 520, fov = 46 } = {}) {
  const A = Q(), P = A.player;
  for (const t of times) {
    pose(clip, t);
    for (let k = 0; k < vs.length; k++) {
      const [ang, dist, hh] = vs[k], a = P.heading + ang * Math.PI / 180;
      const pos = [P.pos.x + Math.sin(a) * dist, P.pos.y + hh, P.pos.z + Math.cos(a) * dist];
      await A.shot(`r17_tmp_${prefix}_${String(Math.round(t * 1000)).padStart(4, '0')}_${k}`, { w, h, pos, at: [P.pos.x, P.pos.y + 1.05, P.pos.z], fov });
    }
  }
  P.char.anim.stop(0);
}

// 某一刻的实际姿势（模型空间）：握持点、剑尖方向、肘、手、脚踝——与 spec 对照
export function probe(clip, t) {
  const A = Q(), P = A.player, ch = P.char, T = A.THREE;
  pose(clip, t);
  ch.root.updateMatrixWorld(true);
  const inv = new T.Matrix4().copy(ch.root.matrixWorld).invert();
  const at = (o) => new T.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(inv).toArray().map((v) => +v.toFixed(3));
  const B = (n) => ch.bones.find((b) => b.name === 'mixamorig' + n);
  const tip = new T.Vector3(), base = new T.Vector3();
  ch.bladeEnds(tip, base); tip.applyMatrix4(inv); base.applyMatrix4(inv);
  const d = tip.clone().sub(base).normalize().toArray().map((v) => +v.toFixed(2));
  const o = { grip: at(ch.handSocket), d, tip: tip.toArray().map((v) => +v.toFixed(2)) };
  for (const n of ['RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand', 'Hips', 'LeftFoot', 'RightFoot']) o[n] = at(B(n));
  ch.anim.stop(0);
  return o;
}

// 直接在出招层放一段动作，按动作时刻截图（检查动作本身的姿势、握剑、穿模）
export async function snapClip(clip, times, { side = 1, dist = 4.2, from = 0, speed = 1, prefix = null, mask = 'full' } = {}) {
  const A = Q(), P = A.player, ch = P.char;
  A.moves.reset(); P.drawn = true;
  const out = [];
  for (const t of times) {
    ch.anim.play(clip, { from: t, to: t + 0.001, speed: 0, hold: true, fade: 0, mask });
    ch.anim.update(0);
    for (let i = 0; i < 2; i++) { P.drawn = true; ch.update(1 / 60, P.pos, P.heading, { mode: 'walk', onGround: true, speed: 0, drawn: true }); }
    const c = camAround(side, dist);
    out.push((await Q().shot(`r17_tmp_${prefix || clip}_${String(t.toFixed(2)).replace('.', '_')}`, { w: 960, h: 720, ...c })).status);
  }
  ch.anim.stop(0);
  return out;
}
