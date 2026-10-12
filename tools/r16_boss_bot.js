// 第十六轮自检工具：在页面里（?boss50debug=1）按真实的移动、出招、伤害结算代码推进第五十层守关战。
// 用法（控制台 / 预览）：const B = await import('/tools/r16_boss_bot.js?v=' + Date.now());
//   await B.setup()                       开局 → 入塔 → 进第五十层（在后台标签页里用 __qinglan.tick 手动推进）
//   B.runMove('claw1', { d: 3.2 })        龙站好、玩家站在给定距离，放一招，返回玩家受到的结算（结果、伤害、时刻）
//   B.bot({ secs: 240, skill: 1 })        自动打一场：玩家按简单的规则走位、闪避红圈、在收势时进攻；返回统计
//   B.cine('intro', [1, 3.3, 6.6])        播一段过场，在给定时刻截图（docs/screenshots/r16_tmp_*.jpg）
const Q = () => window.__qinglan;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const tick = (n = 1, dt = 1 / 60, draw = true) => Q().tick(dt, n, draw);

export async function setup() {
  for (let i = 0; i < 200 && !(window.__qinglan && !document.querySelector('#enter').classList.contains('hidden')); i++) await sleep(500);
  const A = Q();
  if (A.world.name === 'boss50') return 'already';
  if (!document.querySelector('#enter').classList.contains('hidden')) document.querySelector('#enter').click();
  await sleep(300); tick(5);
  if (A.game.intro) A.game.intro.t = 99;
  tick(220);
  await A.game.towerRoom.enter(); tick(30);
  await A.boss50.enter(); tick(60);
  return A.boss50.debug.info();
}

// 把龙摆在 (bx, bz) 面朝 yaw，玩家在龙前方 d 米（behind：在身后）
export function stage({ bx = 0, bz = -6, yaw = 0, d = 3.2, behind = false, side = 0 } = {}) {
  const A = Q(), F = A.boss50, U = A.combat.playerUnit;
  F.cancelMove(true); F.clearHazards(); F.B.mode = 'idle'; F.B.gapT = 99; F.B.pending = null;
  F.rig.root.position.set(bx, 0, bz); F.rig.setYaw(yaw); F.rig.play('idle', { fade: 0 });
  U.hp = U.maxHp; U.alive = true; U.invuln = 0; A.moves.reset(); A.moves.iframes = 0; F.chain = [];
  const f = { x: Math.sin(yaw), z: Math.cos(yaw) }, l = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const k = behind ? -1 : 1;
  const px = bx + f.x * d * k + l.x * side, pz = bz + f.z * d * k + l.z * side;
  A.player.place(px, pz, Math.atan2(bx - px, bz - pz), 0);
  // 镜头：玩家身后、朝向龙（侧一点，招式的扇形与龙身都在画面里）
  const cy = Math.atan2(bx - px, bz - pz) + (o_camSide ?? 0.35);
  A.cam.set(cy, 0.32, 9.5); A.cam.snap(new A.THREE.Vector3(px, 1.55, pz));
  tick(2);
}
let o_camSide = 0.35;
export const camSide = (v) => { o_camSide = v; };

// 一招的几个时刻（招式自己的 clip 时间）各截一张无界面的图
export async function snapMove(id, times, o = {}) {
  const A = Q(), F = A.boss50;
  F.debug.ai(false);
  stage(o);
  F.debug.move(id);
  const shots = [];
  for (const t of times) {
    let n = 0;
    while (F.M && F.M.t1 < t && n < 900) { tick(1); n++; A.combat.playerUnit.hp = A.combat.playerUnit.maxHp; }
    if (!F.M) break;
    shots.push((await shot(`${o.prefix || id}_${String(t).replace('.', '_')}`, o.shot || {})).status);
  }
  let n = 0;
  while (F.M && n < 900) { tick(1); n++; A.combat.playerUnit.hp = A.combat.playerUnit.maxHp; }
  for (let k = 0; k < 150 && F.hz.length; k++) tick(1);
  return shots;
}

export function runMove(id, o = {}) {
  const A = Q(), F = A.boss50, C = A.combat, U = C.playerUnit;
  if (F.state !== 'fight') return { err: 'state ' + F.state };
  F.debug.ai(false);
  stage(o);
  const log = [];
  const L = (e) => { if (e.target === U) log.push({ r: e.result, a: Math.round(e.amount), t: +(F.M?.t1 ?? -1).toFixed(2), clip: F.rig.name }); };
  C.hitListeners.add(L);
  let n = 0, maxTele = 0;
  try {
    F.debug.move(id);
    while (F.M && n < 900) { tick(1); n++; maxTele = Math.max(maxTele, F.fx.teles.size); if (o.keepAlive) { U.hp = U.maxHp; } }
    for (let k = 0; k < 150 && F.hz.length; k++) tick(1);
  } finally { C.hitListeners.delete(L); }
  return { id, frames: n, secs: +(n / 60).toFixed(2), hits: log, hp: Math.round(U.hp), boss: F.root.toArray().map((v) => +v.toFixed(1)), maxTele, left: F.hz.length };
}

// 截图：游戏画面（含界面）由预览截取；这里只渲染一张无界面的高清图
export async function shot(name, o = {}) { return Q().shot('r16_tmp_' + name, { w: 1280, h: 720, ...o }); }

// 播一段过场，在给定时刻截图
export async function cine(name, times = [], { prefix = name } = {}) {
  const A = Q(), F = A.boss50;
  F.debug.cine(name);
  const shots = [];
  for (const t of times) {
    const c = F.cine.cur;
    if (!c) break;
    const n = Math.max(0, Math.round((t - c.t) * 60));
    tick(n);
    if (!F.cine.cur) break;
    shots.push(await shot(`${prefix}_${String(t).replace('.', '_')}`));
  }
  let k = 0;
  while (F.cine.active && k < 1200) { tick(1); k++; }
  return { shots, state: F.state };
}

// ---------- 自动对战：一个照规矩打的玩家 ----------
// 规则：离龙 3–4.5 米为攻击位；龙出手前摇：可格挡的招式举剑（偶尔掐准弹反）、不可格挡的（红圈）侧移、快落下时闪身；
// 地上有红圈（雷印、焰柱、落点）时往圈外走；龙在收势或失衡时连斩、失衡时放破岳 / 万剑归宗；气血低于 35% 时服丹。
// 只通过键位（input.keys）、剑诀入口（moves.input）、右键格挡（combat.setGuard）操作，与真人一样走真实的移动、碰撞与结算。
// rec：{ every 每几帧录一帧, prefix, w, h, when(F) 此刻是否录, caption(F) 帧上的说明 } —— 录下的帧画面另叠一层界面（龙君血条、阶段、玩家气血、招式名、过场黑边与标题）
export async function bot({ secs = 240, skill = 1, seed = 1, rec = null } = {}) {
  const A = Q(), F = A.boss50, C = A.combat, U = C.playerUnit, M = A.moves, P = A.player, I = A.input;
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const st = { t: 0, hits: 0, taken: 0, blocks: 0, parries: 0, dodges: 0, attacks: 0, skills: 0, pills: 0, frames: 0 };
  const L = (e) => { if (e.target === U) { if (e.result === 'hit') { st.hits++; st.taken += e.amount; } else if (e.result === 'block') st.blocks++; else if (e.result === 'parry') st.parries++; else if (e.result === 'dodge') st.dodges++; } };
  C.hitListeners.add(L);
  F.aiOn = true;
  const keys = I.keys;
  const setMove = (fwd, right) => { keys.clear(); if (fwd > 0) keys.add('KeyW'); if (fwd < 0) keys.add('KeyS'); if (right > 0) keys.add('KeyD'); if (right < 0) keys.add('KeyA'); };
  let guardT = 0, actCool = 0, pillCount = A.state.count('yangyuan');
  const frames = Math.round(secs * 60);
  const R = A.renderer, cam = A.camera;
  let keepSize = null;
  if (rec) { keepSize = { s: R.getSize(new A.THREE.Vector2()), pr: R.getPixelRatio() }; R.setPixelRatio(1); R.setSize(rec.w || 960, rec.h || 540, false); cam.aspect = (rec.w || 960) / (rec.h || 540); cam.updateProjectionMatrix(); A.cam.set(null, 0.26, 8.6); }
  try {
    for (let i = 0; i < frames; i++) {
      if (F.state === 'result' || F.state === 'failed' || F.state === 'off') break;
      const recNow = rec && (!rec.when || rec.when(F)) && i % (rec.every || 2) === 0;
      if (F.cine.active) { keys.clear(); tick(1, 1 / 60, !!recNow || i % 30 === 0); if (recNow) await recFrame(rec, st); continue; }
      st.t += 1 / 60;
      const r = F.root, dx = r.x - P.pos.x, dz = r.z - P.pos.z, d = Math.hypot(dx, dz), toBoss = Math.atan2(dx, dz);
      A.cam.yaw += Math.atan2(Math.sin(toBoss - A.cam.yaw), Math.cos(toBoss - A.cam.yaw)) * 0.12;
      let flee = null;
      for (const T of F.fx.teles) {
        if (!T.alive || T.fadeOut) continue;
        const red = T.U.uCol.value.r > 0.9 && T.U.uCol.value.g < 0.4;
        const sh = T.U.uShape.value, p = T.mesh.position, rr = T.U.uR.value;
        if (sh === 0 && red) { const ex = P.pos.x - p.x, ez = P.pos.z - p.z, ed = Math.hypot(ex, ez); if (ed < rr + 0.8) flee = { x: ex / (ed || 1), z: ez / (ed || 1), urgent: T.U.uP.value > 0.55 }; }
        if (sh === 3 && red && T.U.uR0.value > 1.5) { const ed = Math.hypot(P.pos.x - p.x, P.pos.z - p.z); if (ed < rr + 1 && ed > T.U.uR0.value - 1) flee = { x: (P.pos.x - p.x) / ed, z: (P.pos.z - p.z) / ed, out: true, urgent: T.U.uP.value > 0.7 }; }
      }
      const mv = F.M, winding = mv && mv.t1 < (mv.def.windEnd ?? 0) + 0.05, def = mv?.def;
      const recovering = !mv && F.B.mode !== 'walk' && d < 6;
      const stag = F.B.mode === 'stagger';
      if (U.hp < U.maxHp * 0.35 && M.cools.pill <= 0 && A.state.count('yangyuan') > 0 && !mv) { if (M.input('pill')) st.pills++; }
      if (flee) {
        const fw = flee.x * Math.sin(toBoss) + flee.z * Math.cos(toBoss), rt = flee.x * Math.cos(toBoss) - flee.z * Math.sin(toBoss);
        setMove(Math.sign(fw), Math.sign(rt)); keys.add('ShiftLeft');
        if (flee.urgent && rnd() < 0.08 * skill && M.cools.dodge <= 0) M.input('dodge');
        if (guardT > 0) { C.setGuard(false); guardT = 0; }
      } else if (mv && def && (winding || mv.t1 < (mv.def.windEnd ?? 0) + 0.4)) {
        if (def.block !== false) {
          if (guardT <= 0 && rnd() < 0.5 * skill) { C.setGuard(true); guardT = 0.6; }
          setMove(-1, 0);
        } else {
          setMove(0, rnd() < 0.5 ? 1 : -1); keys.add('ShiftLeft');
          if (d < 6 && rnd() < 0.05 * skill && M.cools.dodge <= 0) M.input('dodge');
        }
      } else if (stag || recovering) {
        if (guardT > 0) { C.setGuard(false); guardT = 0; }
        if (d > 3.6) setMove(1, 0);
        else {
          keys.clear();
          if (actCool <= 0) {
            if (stag && M.intent >= 100) { M.input('ult'); st.skills++; }
            else if (stag && M.cools.heavy <= 0 && M.mp >= 35) { M.input('heavy'); st.skills++; }
            else { M.input('light'); st.attacks++; }
            actCool = 0.12;
          }
        }
      } else {
        if (guardT > 0) { C.setGuard(false); guardT = 0; }
        if (d > 8) setMove(1, 0); else if (d < 5) setMove(-1, 0.5); else setMove(0, Math.sin(st.t * 0.7) > 0 ? 1 : -1);
        if (d > 9 && M.cools.qi <= 0 && M.mp >= 15 && rnd() < 0.02) { M.input('qi'); st.skills++; }
      }
      guardT -= 1 / 60; if (guardT <= 0 && C.guardHeld) C.setGuard(false);
      actCool -= 1 / 60;
      tick(1, 1 / 60, !!recNow || i % 30 === 0);
      if (recNow) await recFrame(rec, st);
    }
  } finally {
    keys.clear(); C.setGuard(false); C.hitListeners.delete(L);
    if (keepSize) { R.setPixelRatio(keepSize.pr); R.setSize(keepSize.s.x, keepSize.s.y, false); cam.aspect = keepSize.s.x / keepSize.s.y; cam.updateProjectionMatrix(); }
  }
  st.pills = pillCount - A.state.count('yangyuan');
  return { ...st, t: +st.t.toFixed(1), state: F.state, phase: F.phase, bossHp: Math.round(F.unit.hp), bossMax: F.unit.maxHp, hp: Math.round(U.hp), fightT: +F.fightT.toFixed(1), p1t: +(F.stats.p1t || 0).toFixed(1), staggers: F.stats.staggers, dealt: Math.round(F.stats.dealt), moves: F.stats.moves };
}

// ---------- 录帧：渲染画面 + 一层界面 ----------
let recN = 0;
export const recReset = (n = 0) => { recN = n; };
async function recFrame(rec, st) {
  const A = Q(), F = A.boss50, U = A.combat.playerUnit, R = A.renderer;
  const w = rec.w || 960, h = rec.h || 540;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.drawImage(R.domElement, 0, 0, w, h);
  const cine = F.cine.active;
  if (cine) {
    g.fillStyle = '#050508'; g.fillRect(0, 0, w, h * 0.105); g.fillRect(0, h * 0.895, w, h * 0.105);
    const tEl = document.querySelector('#b50-cine .title');
    if (tEl?.classList.contains('on')) {
      g.textAlign = 'center';
      g.font = '42px "KaiTi","STKaiti",serif'; g.fillStyle = '#f6f0ff'; g.shadowColor = 'rgba(124,104,232,.9)'; g.shadowBlur = 18;
      g.fillText(tEl.querySelector('b').textContent.split('').join(' '), w / 2, h * 0.72);
      g.font = '16px "KaiTi","STKaiti",serif'; g.fillStyle = '#d9cfa0'; g.shadowBlur = 6;
      g.fillText(tEl.querySelector('span').textContent, w / 2, h * 0.72 + 30);
      g.shadowBlur = 0; g.textAlign = 'left';
    }
    g.font = '13px "KaiTi","STKaiti",serif'; g.fillStyle = 'rgba(240,236,255,.75)'; g.textAlign = 'right'; g.fillText('空格 跳过', w - 20, h * 0.895 - 10); g.textAlign = 'left';
  } else if (F.state === 'fight') {
    // 龙君血条
    const bw = Math.min(560, w * 0.6), bx = (w - bw) / 2, by = 34;
    g.textAlign = 'center'; g.font = '19px "KaiTi","STKaiti",serif'; g.fillStyle = '#f3ecff'; g.shadowColor = '#000'; g.shadowBlur = 5;
    g.fillText(`镇塔龙君 · 烬霄　〔${F.phase === 2 ? '二阶段 · 龙怒' : '一阶段'}〕`, w / 2, 26);
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(10,8,18,.75)'; g.fillRect(bx, by, bw, 11);
    const f = Math.max(0, F.unit.hp / F.unit.maxHp);
    const gr = g.createLinearGradient(bx, 0, bx + bw, 0);
    if (F.phase === 2) { gr.addColorStop(0, '#5a1f8a'); gr.addColorStop(0.6, '#b65cff'); gr.addColorStop(1, '#e2b8ff'); } else { gr.addColorStop(0, '#3c2f8f'); gr.addColorStop(0.62, '#7c68e8'); gr.addColorStop(1, '#a998ff'); }
    g.fillStyle = gr; g.fillRect(bx, by, bw * f, 11);
    g.strokeStyle = 'rgba(184,138,70,.7)'; g.strokeRect(bx - 0.5, by - 0.5, bw + 1, 12);
    g.font = '11px sans-serif'; g.fillStyle = 'rgba(255,255,255,.85)'; g.textAlign = 'right'; g.fillText(`${Math.ceil(F.unit.hp)} / ${F.unit.maxHp}`, bx + bw - 4, by + 10);
    const pw = bw * 0.6, px = (w - pw) / 2;
    g.fillStyle = 'rgba(10,8,18,.6)'; g.fillRect(px, by + 16, pw, 4);
    g.fillStyle = F.B.mode === 'stagger' ? '#fff1c8' : '#e0b45a'; g.fillRect(px, by + 16, pw * Math.min(1, F.posture / 100), 4);
    g.textAlign = 'center'; g.font = '14px "KaiTi","STKaiti",serif';
    if (F.M) { g.fillStyle = F.M.danger ? '#ff8a7e' : '#e6dcff'; g.fillText(`${F.M.def.no} · ${F.M.def.name}${F.M.danger ? '（不可格挡）' : ''}`, w / 2, by + 40); }
    else if (F.B.mode === 'stagger') { g.fillStyle = '#fff1c8'; g.fillText('失衡 · 破绽', w / 2, by + 40); }
    g.textAlign = 'right'; g.font = '12px sans-serif'; g.fillStyle = '#cfc6e6'; g.fillText(`${Math.floor(F.fightT / 60)}:${String(Math.floor(F.fightT % 60)).padStart(2, '0')}`, w - 16, 26);
    // 玩家气血、灵力
    g.textAlign = 'left';
    const qx = 20, qy = h - 46;
    g.fillStyle = 'rgba(244,239,228,.88)'; g.fillRect(qx - 8, qy - 18, 250, 48);
    g.font = '13px "KaiTi","STKaiti",serif'; g.fillStyle = '#2b2a27'; g.fillText('气血', qx, qy - 2); g.fillText('灵力', qx, qy + 18);
    g.fillStyle = 'rgba(40,30,20,.25)'; g.fillRect(qx + 36, qy - 11, 160, 8); g.fillRect(qx + 36, qy + 9, 160, 6);
    g.fillStyle = '#b8402e'; g.fillRect(qx + 36, qy - 11, 160 * Math.max(0, U.hp / U.maxHp), 8);
    g.fillStyle = '#3d7fa8'; g.fillRect(qx + 36, qy + 9, 160 * (A.moves.mp / 100), 6);
    g.font = '11px sans-serif'; g.fillStyle = '#2b2a27'; g.fillText(`${Math.ceil(U.hp)}`, qx + 202, qy - 3);
  }
  const cap = rec.caption ? rec.caption(F) : '';
  if (cap) { g.font = '15px "Microsoft YaHei",sans-serif'; g.textAlign = 'left'; const tw = g.measureText(cap).width; g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(12, h - (cine ? h * 0.105 : 0) - 86, tw + 20, 26); g.fillStyle = '#f3e9d2'; g.fillText(cap, 22, h - (cine ? h * 0.105 : 0) - 68); }
  // 同步编码、同步上传：预览面板在后台时，异步的 toBlob / fetch 回调会被节流到每秒一次，录一帧要一秒多
  const url = cv.toDataURL('image/jpeg', 0.86), bin = atob(url.slice(url.indexOf(',') + 1)), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const x = new XMLHttpRequest();
  x.open('POST', '/__shot/' + (rec.prefix || 'r16f_') + String(recN++).padStart(5, '0'), false);
  x.send(arr);
  st.frames++;
}
