// 第十八轮：弹反后的僵直实测——每种出手者各弹反一次（出手前一瞬按右键），从弹反那一刻起量：
//   stun 它处在受击 / 失衡里动不了多久（秒）；next 弹反后它最早再次起手的时刻（把它的出手冷却清零，一能动就让它出手）
// 用法：const P = await import('/tools/r18_parry.js?v=' + Date.now()); await P.all()
import * as B from './r17_combat_bot.js';
const Q = () => window.__qinglan;
const r2 = (v) => (v == null ? null : +v.toFixed(2));

// 魔修（残魂 shade、魔将 elite）
export async function enemyStun(kind, { act = 'melee', d = 1.8, lead = 0.1, hold = 0.3, secs = 4 } = {}) {
  const A = Q(), C = A.combat, P = A.player, M = A.moves;
  await B.toArena(); B.quietDragons(true);
  for (const e of [...C.enemies]) { e.dispose(); C.enemies.splice(C.enemies.indexOf(e), 1); }
  M.reset(); C.playerUnit.invuln = 0; M.iframes = 0;
  const f = { x: Math.sin(P.heading), z: Math.cos(P.heading) };
  const e = C.spawn(kind, { x: P.pos.x + f.x * d, y: P.pos.y, z: P.pos.z + f.z * d }, { yaw: P.heading + Math.PI });
  e.state = 'chase'; e.cool = 99; e.slamCool = 99;
  let tt = 0, parryT = null, freeT = null, nextT = null;
  const L = (ev) => { if (ev.target === C.playerUnit && ev.result === 'parry' && parryT == null) parryT = tt; };
  C.hitListeners.add(L);
  e.begin(act);
  const wind = act === 'slam' ? e.cfg.slam.windup : e.cfg.windup, pressAt = wind - lead, relAt = pressAt + hold;
  try {
    for (let i = 0; i < Math.round(secs * 60); i++) {
      if (tt <= pressAt && tt + 1 / 60 > pressAt) C.setGuard(true);
      if (tt <= relAt && tt + 1 / 60 > relAt) C.setGuard(false);
      A.tick(1 / 60, 1, false); tt += 1 / 60; C.playerUnit.hp = C.playerUnit.maxHp;
      if (parryT != null) {
        e.cool = 0; e.slamCool = 99;
        if (freeT == null && e.state !== 'hit') freeT = tt;
        if (nextT == null && freeT != null && e.state === 'windup') nextT = tt;
      }
    }
  } finally { C.hitListeners.delete(L); C.setGuard(false); }
  const out = { who: kind, parried: parryT != null, stun: r2(freeT != null ? freeT - parryT : null), next: r2(nextT != null ? nextT - parryT : null) };
  e.dispose(); C.enemies.splice(C.enemies.indexOf(e), 1);
  return out;
}

// 演武场对手（护法教习）：弹反后让它立刻接着出招（rest 清零），量失衡多久、多久后再起手
export async function duelStun(key = 'slashA', { lead = 0.08, hold = 0.3 } = {}) {
  const A = Q(), R = A.arena, C = A.combat, M = A.moves, P = A.player, U = C.playerUnit;
  if (!R.S?.duelist) { await B.toArena(); await B.duel('instructor', 'normal', 'free'); }
  const du = R.S.duelist;
  M.reset(); U.invuln = 0;
  const f = { x: Math.sin(P.heading), z: Math.cos(P.heading) };
  du.pos.set(P.pos.x + f.x * 2.0, du.pos.y, P.pos.z + f.z * 2.0); du.yaw = P.heading + Math.PI; du.vel.set(0, 0, 0);
  du.ai = 'attack'; du.rest = 99; du.startCombo([key]);
  const A0 = du.atk.A, wind = du.atk.wind + (A0.hold - A0.from) / A0.speed, hitT = wind + (A0.hit - A0.hold) / A0.speed;
  let t = 0, parryT = null, freeT = null, nextT = null;
  const L = (e) => { if (e.target === U && e.result === 'parry' && parryT == null) parryT = t; };
  C.hitListeners.add(L);
  try {
    for (let i = 0; i < 60 * 5; i++) {
      if (t <= hitT - lead && t + 1 / 60 > hitT - lead) C.setGuard(true);
      if (t <= hitT - lead + hold && t + 1 / 60 > hitT - lead + hold) C.setGuard(false);
      A.tick(1 / 60, 1, false); t += 1 / 60; U.hp = U.maxHp;
      if (parryT != null) {
        du.rest = 0;
        if (freeT == null && du.ai !== 'stagger' && !(du.stunT > 0)) freeT = t;
        if (nextT == null && freeT != null && du.ai === 'attack') nextT = t;
        if (nextT != null) break;
      }
    }
  } finally { C.hitListeners.delete(L); C.setGuard(false); du.rest = 1.5; }
  return { who: '演武场·' + key, parried: parryT != null, stun: r2(freeT != null ? freeT - parryT : null), next: r2(nextT != null ? nextT - parryT : null) };
}

// 守关龙君：放一招，在 pressAt（clip 秒）按右键；弹反后量龙多久不能再出手（受击 / 顿住），以及招式是否被弹断
export async function bossStun(id, { pressAt, hold = 0.3, d = 3.2 } = {}) {
  const A = Q(), F = A.boss50, C = A.combat, M = A.moves, U = C.playerUnit;
  const B16 = await import('/tools/r16_boss_bot.js');
  if (A.world.name !== 'boss50') { const R = A.arena; if (R?.S) R.teardown(); await A.game.towerRoom.enter(); A.tick(1 / 60, 30, false); await F.enter(); A.tick(1 / 60, 60, false); }
  if (F.state === 'dormant') { F.debug.start(); A.tick(1 / 60, 30, false); F.debug.skip(); A.tick(1 / 60, 60, false); }
  F.debug.hp('debug'); F.debug.ai(false); B16.stage({ d });
  M.reset(); U.invuln = 0; F.posture = 0;
  let t = 0, parryT = null, freeT = null, pressed = false, relT = null, interrupted = null;
  const L = (e) => { if (e.target === U && e.result === 'parry' && parryT == null) { parryT = t; } };
  C.hitListeners.add(L);
  try {
    F.debug.move(id);
    const M0 = F.M;
    for (let i = 0; i < 60 * 6; i++) {
      const t1 = F.M?.t1 ?? 99;
      if (!pressed && F.M === M0 && t1 >= pressAt) { pressed = true; C.setGuard(true); relT = t + hold; }
      if (relT != null && t >= relT) { C.setGuard(false); relT = null; }
      A.tick(1 / 60, 1, false); t += 1 / 60; U.hp = U.maxHp;
      if (parryT != null && interrupted == null) interrupted = F.M !== M0;
      // 能再出手：不在受击 / 失衡里，也没有被顿住（hitch）
      if (parryT != null && freeT == null && F.B.mode !== 'hitH' && F.B.mode !== 'stagger' && !(F.hitchT > 0) && t > parryT + 0.02) freeT = t;
      if (freeT != null && t > freeT + 0.2) break;
    }
  } finally { C.hitListeners.delete(L); C.setGuard(false); }
  F.cancelMove(true);
  return { who: '龙君·' + id, parried: parryT != null, moveBroken: interrupted, stun: r2(freeT != null ? freeT - parryT : null) };
}

export async function all() {
  const out = [];
  out.push(await enemyStun('shade'));
  out.push(await enemyStun('elite', { d: 2.2 }));
  for (const k of ['slashA', 'slashC']) out.push(await duelStun(k));
  if (Q().arena?.S) Q().arena.teardown();
  out.push(await bossStun('claw1', { pressAt: 0.44 }));
  out.push(await bossStun('combo3', { pressAt: 0.66, d: 3.0 }));
  out.push(await bossStun('claw2', { pressAt: 0.6 }));                 // 弹反第一爪：只顿一下，第二爪照常
  out.push({ ...(await bossStun('claw2', { pressAt: 0.95 })), who: '龙君·claw2 第二爪' });   // 第一爪吃下，弹反第二爪
  B.quietDragons(false);
  return out;
}

// 录像：弹反后的僵直（魔修残魂、魔将、龙君两招）。用游戏镜头（玩家身后偏一侧），帧上写说明与「弹反后几秒 · 对方状态」。
// 与 r18_boss_motion.js 的 recMoves 一样先同步录进内存，最后成批上传 docs/screenshots/r18_tmp_pa_<序号>.jpg
export async function recParry({ w = 960, h = 540, every = 2 } = {}) {
  const A = Q(), C = A.combat, P = A.player, M = A.moves, R = A.renderer, T = A.THREE, cam = A.camera;
  const present = A.present || ((s, c) => R.render(s, c));
  const frames = [];
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
  const keep = { s: R.getSize(new T.Vector2()), pr: R.getPixelRatio(), aspect: cam.aspect };
  const size = () => { R.setPixelRatio(1); R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  let k = 0;
  const shoot = (title, line) => {
    const scene = A.world.name === 'boss50' ? A.tower50.scene : A.scene;
    present(scene, cam);
    g.drawImage(R.domElement, 0, 0, w, h);
    g.fillStyle = 'rgba(8,6,14,.58)'; g.fillRect(0, 0, w, 58);
    g.textBaseline = 'middle'; g.fillStyle = '#efe8ff';
    g.font = '20px "Microsoft YaHei",sans-serif'; g.fillText(title, 12, 17);
    g.font = '17px "Microsoft YaHei",sans-serif'; g.fillStyle = line.startsWith('弹反') ? '#ffe2a0' : '#cfc6e8'; g.fillText(line, 12, 43);
    frames.push(cv.toDataURL('image/jpeg', 0.9));
  };
  // 魔修：出手前 0.1 秒举剑弹反，之后放开、看它僵直多久再出手
  const enemyClip = async (kind, title, d) => {
    await B.toArena(); B.quietDragons(true); size();
    for (const e of [...C.enemies]) { e.dispose(); C.enemies.splice(C.enemies.indexOf(e), 1); }
    M.reset(); C.playerUnit.invuln = 0; M.iframes = 0;
    const f = { x: Math.sin(P.heading), z: Math.cos(P.heading) };
    const e = C.spawn(kind, { x: P.pos.x + f.x * d, y: P.pos.y, z: P.pos.z + f.z * d }, { yaw: P.heading + Math.PI });
    e.state = 'chase'; e.cool = 99; e.slamCool = 99;
    A.cam.set(P.heading + 0.75, 0.2, 5.6); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.4));
    let tt = 0, parryT = null;
    const L = (ev) => { if (ev.target === C.playerUnit && ev.result === 'parry' && parryT == null) parryT = tt; };
    C.hitListeners.add(L);
    for (let i = 0; i < 24; i++) { A.tick(1 / 60, 1, false); if (++k % every === 0) shoot(title, '对方起手'); }
    e.begin('melee');
    const wind = e.cfg.windup, pressAt = wind - 0.1;
    try {
      for (let i = 0; i < 60 * 3.2; i++) {
        if (tt <= pressAt && tt + 1 / 60 > pressAt) C.setGuard(true);
        if (tt <= pressAt + 0.3 && tt + 1 / 60 > pressAt + 0.3) C.setGuard(false);
        A.tick(1 / 60, 1, false); tt += 1 / 60; C.playerUnit.hp = C.playerUnit.maxHp;
        if (parryT != null) { e.cool = 0; e.slamCool = 99; }
        const st = parryT == null ? (tt < pressAt ? '对方起手' : '举剑') : `弹反后 ${(tt - parryT).toFixed(2)} 秒 · 对方${e.state === 'hit' ? '僵直中（不能出手）' : e.state === 'windup' ? '再次起手' : '恢复'}`;
        if (++k % every === 0) shoot(title, st);
      }
    } finally { C.hitListeners.delete(L); C.setGuard(false); }
    e.dispose(); C.enemies.splice(C.enemies.indexOf(e), 1);
  };
  // 龙君：放一招，在 pressAt 按右键
  const bossClip = async (id, pressAt, title, d = 3.2) => {
    const F = A.boss50, U = C.playerUnit, B16 = await import('/tools/r16_boss_bot.js');
    if (A.world.name !== 'boss50') { const Ar = A.arena; if (Ar?.S) Ar.teardown(); await A.game.towerRoom.enter(); A.tick(1 / 60, 30, false); await F.enter(); A.tick(1 / 60, 60, false); }
    if (F.state === 'dormant') { F.debug.start(); A.tick(1 / 60, 30, false); F.debug.skip(); A.tick(1 / 60, 60, false); }
    size();
    F.debug.hp('debug'); F.debug.ai(false); B16.camSide(0.7); B16.stage({ d });
    M.reset(); U.invuln = 0; F.posture = 0;
    let t = 0, parryT = null, pressed = false, relT = null;
    const L = (e) => { if (e.target === U && e.result === 'parry') parryT = t; };
    C.hitListeners.add(L);
    try {
      for (let i = 0; i < 16; i++) { A.tick(1 / 60, 1, false); if (++k % every === 0) shoot(title, '龙君起手'); }
      F.debug.move(id);
      const M0 = F.M;
      for (let i = 0; i < 60 * 3.2; i++) {
        const t1 = F.M?.t1 ?? 99;
        if (!pressed && F.M === M0 && t1 >= pressAt) { pressed = true; C.setGuard(true); relT = t + 0.3; }
        if (relT != null && t >= relT) { C.setGuard(false); relT = null; }
        A.tick(1 / 60, 1, false); t += 1 / 60; U.hp = U.maxHp;
        const mode = F.B.mode === 'hitH' ? '僵直中（招式被弹断，不出招、不转身）' : F.hitchT > 0 ? '顿住（动作放慢）' : F.M ? '出招中' : '恢复';
        const st = parryT == null ? (pressed ? '举剑' : '龙君起手') : `弹反后 ${(t - parryT).toFixed(2)} 秒 · 龙君${mode}`;
        if (++k % every === 0) shoot(title, st);
      }
    } finally { C.hitListeners.delete(L); C.setGuard(false); B16.camSide(0.35); }
    F.cancelMove(true);
  };
  try {
    await enemyClip('shade', '弹反 · 魔修残魂（第十八轮：弹反后僵直 1.0 秒）', 1.8);
    await enemyClip('elite', '弹反 · 魔将（弹反后僵直 1.4 秒）', 2.2);
    await bossClip('claw1', 0.44, '弹反 · 龙君「裂空龙爪」（招式弹断，僵直 0.6 秒，连受击动作约 0.8 秒）');
    await bossClip('claw2', 0.95, '弹反 · 龙君「双爪追猎」第二爪（最后一爪被弹反：僵直）');
  } finally {
    R.setPixelRatio(keep.pr); R.setSize(keep.s.x, keep.s.y, false); cam.aspect = keep.aspect; cam.updateProjectionMatrix();
    B.quietDragons(false);
  }
  // 上传
  for (let i = 0; i < frames.length; i += 40) {
    await Promise.all(frames.slice(i, i + 40).map(async (u, j) => {
      const blob = await (await fetch(u)).blob();
      await fetch(`/__shot/r18_tmp_pa_${String(i + j).padStart(4, '0')}`, { method: 'POST', body: blob });
    }));
  }
  return frames.length;
}
