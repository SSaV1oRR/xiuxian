// 第二十二轮录像：舞刀召凤（显形、绕身、离刀）、万剑归宗用三把佩剑、完美弹反 → 强化反击、凤凰紧随准星、凤凰与万剑的伤害对照。
// 都按真实的输入、出招、结算、特效代码推进（__qinglan.tick），帧在页面里同步截下，录完分批上传；音效照常放，同时记下来离线混音（tools/r19_mix_audio.py）。
// 用法（预览）：const F = await import('/tools/r22_film.js?v=' + Date.now()); await F.setup();
//   setTimeout(() => F.scnDance().then((r) => window.__film = r), 0);   之后 await F.flush()
import * as RF from './r21_film.js';
import * as G from './r21_growth.js';
import * as R from './r22_tests.js';
import { PHOENIX, PLAYER_COMBAT as PC, PLAYER_MOVES as PM } from '/src/game/combatConfig.js';

const Q = () => window.__qinglan;
const r1 = (v) => +(+v).toFixed(1);
export const { flush, recSub } = RF;
export async function setup() { const s = await R.setup(); return s; }

// ---------- 镜头 ----------
// 常规的背后视角（与游戏一样的跟随镜头）：镜头朝 yaw 看，人在画面中央偏下
function behind(yawOff = 0.3, pitch = 0.14, dist = 6.4) { const A = Q(), P = A.player; A.game.freeCam = null; A.cam.set(P.heading + yawOff, pitch, dist); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); }
// 自由镜头：绕人物转（ang 相对人物朝向，0 正前、90 人物左侧、180 背后），每帧调用
function orbitCam(ang, dist, h, look = 1.25) {
  const A = Q(), P = A.player, a = P.heading + ang * Math.PI / 180;
  const fc = A.game.freeCam || (A.game.freeCam = { pos: new A.THREE.Vector3(), at: new A.THREE.Vector3() });
  fc.pos.set(P.pos.x + Math.sin(a) * dist, P.pos.y + h, P.pos.z + Math.cos(a) * dist); fc.at.set(P.pos.x, P.pos.y + look, P.pos.z);
}
function freeOff() { Q().game.freeCam = null; }
// 比试圈中心（面朝圈门：门外 60 米内没有遮挡，凤凰从门里飞出去；镜头在身后、仍在圈里）；dx / dz：相对圈心挪开
const RING = { x: 56, z: -115, y: 34 };
function spot(dx = 0, dz = 0, yaw = 0) {
  const A = Q(), P = A.player;
  G.fresh(yaw); P.place(RING.x + dx, RING.z + dz, yaw, RING.y); P.heading = yaw; P.vel.set(0, 0, 0);
  A.cam.set(yaw, 0.14, 6.4); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55));
  for (let i = 0; i < 5; i++) A.tick(1 / 60, 1, false);
}
// 白天（上午十时）：天色、日光、环境贴图随之重绘
function day(hour = 10) { const A = Q(); A.TIME.hour = hour; G.skyQuiet(false); for (let i = 0; i < 3; i++) A.tick(1 / 60, 1, false); }
// 推进 secs 秒（录像）；dt 小于 1/60 即慢放（游戏时间照 dt 走，每 every 帧录一帧）。录像的时钟（音效的时刻按它）按画面走：每帧 1/60 秒，
// 慢放时音效照常速放在画面上对应的时刻
function play(secs, fn = null, dt = 1 / 60) {
  const n = Math.round(secs / dt);
  for (let i = 0; i < n; i++) { if (fn && fn(i * dt) === false) break; RF.recTick(dt); const X = window.__r21rec; if (X) X.t += 1 / 60 - dt; }
}
function pressPhoenix(mode = 'strike') { const A = Q(), ph = A.phoenix, M = A.moves; ph.mode = mode; M.cools.phoenix = 0; M.mp = M.mpMax; M.press('phoenix', true); }
const CAST_STEP = (t) => (t < PHOENIX.cast.show ? '舞刀起势 · 剑上金红细光、羽焰汇聚' : t < PHOENIX.cast.swing ? '凤凰显形 · 随舞刀绕身一周' : t < PHOENIX.cast.launch ? '收拢刀势 · 凤凰沿刀刃汇向剑尖' : '离刀 · 从剑尖飞出');
// 说明层：舞刀的阶段、离刀时刻、扣灵力 / 冷却 / 飞行计时何时开始
function castOverlay(g, w, h, A) {
  const M = A.moves, ph = A.phoenix, a = M.act;
  const lines = [];
  if (a?.key === 'phoenix') lines.push(`舞刀 ${a.t.toFixed(2)} 秒 · ${CAST_STEP(a.t)}`);
  if (ph.pre && !ph.pre.cancel) lines.push('预演中：无碰撞、无伤害、不投火、不占 8 秒飞行时间');
  if (ph.bird) lines.push(`离刀 ${ph.bird.t.toFixed(2)} 秒 · 已扣灵力、冷却 ${M.cools.phoenix.toFixed(1)} 秒`);
  if (ph.lastCast?.launched && ph.bird && ph.bird.t < 1.2) lines.push(`绕身走过 ${ph.lastCast.travelDeg}° · 离身体最近 ${ph.lastCast.minClear} 米`);
  g.font = '14px "Microsoft YaHei",sans-serif';
  let y = 150;
  for (const t of lines) { const tw = g.measureText(t).width; g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(14, y - 17, tw + 16, 24); g.fillStyle = '#ffe9c2'; g.fillText(t, 22, y); y += 28; }
}

// =====================================================================================
// 一、舞刀召凤：常规视角 → 侧面慢放 → 边走边舞 → 离刀特写（直剑、弯刀、宽刃各一把）
// =====================================================================================
export async function scnDance() {
  const A = Q(), ph = A.phoenix, M = A.moves, P = A.player;
  G.skyQuiet(false);
  // 1. 常规背后视角、站定（赤霄）
  await A.game.equipSword('chixiao');
  day(); G.clearFoes(); spot(); behind(0.32, 0.12, 6.2);
  const REC = RF.recStart({ prefix: 'r22_dance_', every: 2, w: 960, h: 540, title: '九霄凤焰 · 舞刀召凤', sub: '常规背后视角 · 站定施法（赤霄）：舞刀起势 → 凤凰显形、随舞刀绕身一周 → 沿刀刃汇向剑尖 → 从剑尖飞出' });
  REC.extra = castOverlay;
  play(0.4);
  pressPhoenix();
  play(2.6);
  ph.clear('film');
  // 2. 侧面绕拍、0.5 倍慢放（秋水：弯刀）
  await A.game.equipSword('qiushui');
  spot(); behind(0.3, 0.12, 6.2);
  RF.recSub('0.5× 慢放 · 镜头绕着人转：凤凰中段落后剑尖、两端与剑尖同位，高度在腰与肩之间；收成小灵体贴着弯刀的刀刃滑到剑尖（秋水）');
  // 镜头从人物左侧经背后绕到右后方（离刀时凤凰朝前飞走，不冲着镜头）
  let ang = 95;
  orbitCam(ang, 6.8, 3.0, 1.4);
  play(0.2, null, 1 / 120);
  pressPhoenix();
  play(1.75, () => { ang += 0.55; orbitCam(ang, 6.8, 3.0, 1.4); }, 1 / 120);
  freeOff(); ph.clear('film');
  // 3. 边走边舞（荆棘）：按住 W、A
  await A.game.equipSword('jingji');
  spot(2.5, -1); behind(0.45, 0.16, 6.0);
  RF.recSub('边走边舞（步行速度 × 0.6）：下身走路、上身照舞；绕身的中心跟着人走（荆棘）；离刀后恢复正常速度');
  play(0.3);
  A.input.keys.add('KeyW'); A.input.keys.add('KeyA');
  pressPhoenix();
  play(1.9, (t) => { if (t > 1.5) { A.input.keys.delete('KeyA'); } });
  A.input.keys.clear(); play(0.5);
  ph.clear('film');
  // 4. 离刀特写（0.25 倍慢放，赤霄）：喙尖对准剑尖
  await A.game.equipSword('chixiao');
  spot(); G.clearFoes(); behind(0.3, 0.12, 6.2);
  RF.recSub('0.25× 慢放 · 离刀特写：喙尖落在剑尖的世界坐标（同一帧误差 0），由小灵体展翅、0.35 秒内展开成凤凰（赤霄）');
  pressPhoenix();
  for (let i = 0; i < 48; i++) A.tick(1 / 60, 1, false);         // 0.8 秒（不录）
  // 镜头在人物右侧 4 米、胸口高，看着剑尖将到之处（人物前方 1.6 米）；凤凰从画面里横穿出去
  const closeCam = (k) => { const P = A.player, a = P.heading - 1.5 - k * 0.3, fc = A.game.freeCam || (A.game.freeCam = { pos: new A.THREE.Vector3(), at: new A.THREE.Vector3() }); fc.pos.set(P.pos.x + Math.sin(a) * (4.2 + k * 2), P.pos.y + 1.7 + k * 0.6, P.pos.z + Math.cos(a) * (4.2 + k * 2)); fc.at.set(P.pos.x + Math.sin(P.heading) * 1.6, P.pos.y + 1.4 + k * 0.8, P.pos.z + Math.cos(P.heading) * 1.6); };
  closeCam(0);
  play(0.65, (t) => closeCam(t / 0.65), 1 / 240);
  freeOff(); behind(0.3, 0.12, 6.2);
  play(0.9);
  ph.clear('film');
  const out = RF.recStop();
  G.skyQuiet(true);
  return out;
}

// =====================================================================================
// 二、万剑归宗：飞剑与巨剑用手中的剑（赤霄、秋水、荆棘），施法中途换剑不改空中的剑
// =====================================================================================
function ultOverlay(g, w, h, A) {
  const U = A.sfx.ultInfo(), ch = A.player.char;
  const name = (id) => A.armory.get(id)?.name || id;
  const t = U.sword ? `剑阵用的剑：${U.sword.name}（施法那一刻手中的剑）　手中：${name(ch.swordId)}` : `手中：${name(ch.swordId)}`;
  g.font = '15px "KaiTi","STKaiti",serif';
  const tw = g.measureText(t).width; g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(14, 133, tw + 18, 26); g.fillStyle = '#fff1c8'; g.fillText(t, 22, 151);
}
export async function scnUlt3() {
  const A = Q(), M = A.moves;
  G.skyQuiet(false);
  day();
  const cast = (hp = 6000) => { spot(0, -2); const es = G.foes([['shade', 6.5, 0], ['shade', 7.5, 2.4], ['shade', 7.0, -2.6]], { hp }); behind(0.22, 0.1, 6.4); M.intent = 100; M.cools.ult = 0; return es; };
  let REC = null;
  const SW = [['chixiao', '直剑'], ['qiushui', '弯刀（太刀）'], ['jingji', '宽刃、带棘刺的巨剑']];
  for (let i = 0; i < SW.length; i++) {
    const [id, kind] = SW[i];
    await A.game.equipSword(id);
    cast();
    const nm = A.armory.get(id)?.name;
    if (!REC) { REC = RF.recStart({ prefix: 'r22_ult3_', every: 2, w: 960, h: 540, title: '万剑归宗 · 用手中的佩剑', sub: '' }); REC.extra = ultOverlay; }
    RF.recSub(`${nm}（${kind}）：聚剑成阵（刀尖朝下）→ 飞剑刀尖朝前落下插地 → 同一把剑放大成巨剑镇阵；落点、伤害与原来相同`);
    play(0.3);
    M.intent = 100; M.cools.ult = 0; M.press('ult', true);
    play(4.9);
    G.clearFoes();
  }
  // 中途换剑
  await A.game.equipSword('chixiao');
  cast();
  RF.recSub('施法中途换剑（1.2 秒时换成秋水）：手中已是秋水，空中的飞剑、巨剑仍是赤霄（不变形）');
  play(0.3);
  M.intent = 100; M.cools.ult = 0; M.press('ult', true);
  play(1.2);
  await A.game.equipSword('qiushui');
  play(3.7);
  G.clearFoes();
  cast();
  RF.recSub('下一次施法：换成秋水');
  play(0.2);
  M.intent = 100; M.cools.ult = 0; M.press('ult', true);
  play(4.6);
  G.clearFoes();
  const out = RF.recStop();
  await A.game.equipSword('chixiao');
  G.skyQuiet(true);
  return out;
}

// =====================================================================================
// 三、完美弹反 → 强化反击（魔修残魂）
// =====================================================================================
function parryOverlay(g, w, h, A) {
  const M = A.moves, G0 = PC.guard;
  const k = M.countering ? Math.max(0, (M.counterUntil - M.time) / G0.counter) : 0;
  // 剑诀栏上方的金签（与游戏界面相同的样子）
  if (k > 0) {
    const x = 380, y = h - 112;
    g.fillStyle = 'rgba(52,34,10,.85)'; g.strokeStyle = 'rgba(242,196,92,.8)'; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(x, y, 150, 30, 12); g.fill(); g.stroke();
    g.font = '15px "KaiTi","STKaiti",serif'; g.fillStyle = '#ffe39a'; g.fillText('反击强化', x + 14, y + 20);
    g.font = '700 13px sans-serif'; g.fillStyle = '#fff1c2'; g.fillText(`×${G0.counterK}`, x + 92, y + 20);
    g.fillStyle = 'rgba(255,230,160,.25)'; g.fillRect(x + 10, y + 25, 130, 2); g.fillStyle = '#ffd27a'; g.fillRect(x + 10, y + 25, 130 * k, 2);
  }
  const lines = [`剑意 ${Math.round(M.intent)} / ${PC.intent}　守势 ${Math.round(M.guardHP)} / ${G0.max}`, M.lastCounter ? `上一次反击强化：${M.lastCounter.key === 'iai_slash' ? '拔刀斩' : '普攻'} ${M.lastCounter.dmg}（弹反后 ${M.lastCounter.sinceParry} 秒）` : ''].filter(Boolean);
  g.font = '14px "Microsoft YaHei",sans-serif';
  let y = 150;
  for (const t of lines) { const tw = g.measureText(t).width; g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(14, y - 17, tw + 16, 24); g.fillStyle = '#ffe9c2'; g.fillText(t, 22, y); y += 28; }
}
export async function scnParry() {
  const A = Q(), M = A.moves, C = A.combat;
  G.skyQuiet(false);
  await A.game.equipSword('chixiao');
  day();
  const setup = (list) => { spot(); G.clearFoes(); const es = G.foes(list, { hp: 5000 }); M.intent = 40; M.guardHP = 40; M.counterUntil = -99; M.guardUsed = M.time; behind(0.55, 0.16, 5.2); return es; };
  // 魔修出一爪：前摇 windup 秒；按时按下右键（弹反窗口 0.18 秒）
  const attack = (e, at) => [[at, () => { e.state = 'chase'; e.stunT = 0; e.cool = 0; e.begin('melee'); e.cool = 99; }], [at + e.cfg.windup - 0.1, () => C.setGuard(true)], [at + e.cfg.windup + 0.14, () => C.setGuard(false)]];
  const runEv = (evs, secs) => { const list = evs.slice().sort((a, b) => a[0] - b[0]); let k = 0; play(secs, (t) => { while (k < list.length && list[k][0] <= t + 1e-9) list[k++][1](); C.playerUnit.hp = C.playerUnit.maxHp; }); };
  const light = () => { M.press('light', true); M.held.light = false; };
  let [e] = setup([['shade', 1.8, 0]]);
  const REC = RF.recStart({ prefix: 'r22_parry_', every: 2, w: 960, h: 540, title: '完美弹反 → 强化反击', sub: '对照：没有弹反时一记斜斩 15' });
  REC.extra = parryOverlay;
  play(0.3); light(); play(1.0);
  RF.recSub('弹反成功：剑意 +8、守势回上限的 25%、2 秒内「反击强化」——下一次普攻 / 拔刀斩打中的第一个敌人 ×1.5（15 → 23），打中即用掉');
  [e] = setup([['shade', 1.8, 0]]);
  runEv([...attack(e, 0.3), [0.95, light]], 2.0);
  play(0.6, () => { if (M.act == null) light(); });
  RF.recSub('一刀扫中两个：只有第一个有效目标 ×1.5（23 / 15）；空挥不消耗、到时自然消失；剑气、万剑、凤凰都不吃这个倍率');
  const two = setup([['shade', 1.7, -0.45], ['shade', 1.9, 0.5]]);
  runEv([...attack(two[0], 0.3), [0.95, light]], 2.0);
  RF.recSub('2 秒内连续两次弹反：不叠层（仍是 ×1.5），期限从第二次重新算 2 秒');
  const pair = setup([['shade', 1.8, 0.35], ['shade', 1.8, -0.35]]);
  runEv([...attack(pair[0], 0.3), ...attack(pair[1], 1.45), [2.2, light]], 3.0);
  RF.recSub('弹反 → 拔刀斩（按住 Z 纳刀、松开出刀）：同样 ×1.5（28 → 42）');
  [e] = setup([['shade', 1.8, 0]]);
  runEv([...attack(e, 0.3), [0.9, () => M.press('power', true)], [1.05, () => M.press('power', false)]], 2.2);
  G.clearFoes();
  const out = RF.recStop();
  G.skyQuiet(true);
  return out;
}
// 第五十层龙君被弹断：一阶段僵直 1.0 秒、二阶段 0.8 秒（受击动作按这个时长放完）——另录一段，接在弹反录像后面
export async function scnParryBoss() {
  const A = Q(), F = await R.toBoss(), C = A.combat, M = A.moves, U = C.playerUnit;
  const B16 = await import('/tools/r16_boss_bot.js');
  const REC = RF.recStart({ prefix: 'r22_parryb_', every: 2, w: 960, h: 540, title: '完美弹反 · 第五十层龙君', sub: '', boss: true });
  REC.extra = (g, w, h, A2) => {
    parryOverlay(g, w, h, A2);
    const S = F.stats.parryStun, t = S && F.B.mode === 'hitH' ? (F.fightT - S.at) : null;
    const s = t != null ? `龙君被弹断 · 僵直 ${t.toFixed(2)} / ${S.stun} 秒（${S.phase === 2 ? '二' : '一'}阶段）` : F.B.mode === 'hitH' ? '' : '';
    if (s) { g.font = '16px "KaiTi","STKaiti",serif'; const tw = g.measureText(s).width; g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(w / 2 - tw / 2 - 10, 130, tw + 20, 28); g.fillStyle = '#ffd9a0'; g.textAlign = 'center'; g.fillText(s, w / 2, 150); g.textAlign = 'left'; }
  };
  for (const [ph, pressAt] of [[1, 0.4], [2, 0.3]]) {
    F.debug.phase(ph); F.debug.ai(true);
    B16.stage({ d: 3.2 }); M.reset(); U.invuln = 0; U.hp = U.maxHp; F.posture = 0;
    A.cam.set(A.player.heading + 0.5, 0.12, 6.5); A.cam.snap(A.player.pos.clone().setY(A.player.pos.y + 1.55));
    RF.recSub(ph === 1 ? '一阶段 · 裂空龙爪被弹断：僵直 1.0 秒（受击动作放慢到正好 1.0 秒，不另加锁定）；之后照常的出招间隔' : '二阶段 · 同一招：僵直 0.8 秒');
    play(0.3, () => { U.hp = U.maxHp; });
    F.debug.move('claw1');
    let pressed = false, rel = null;
    play(2.6, () => { const t1 = F.M?.t1; if (!pressed && t1 != null && t1 >= pressAt) { pressed = true; C.setGuard(true); rel = M.time + 0.25; } if (rel != null && M.time >= rel) { C.setGuard(false); rel = null; } U.hp = U.maxHp; });
  }
  F.debug.phase(1);
  const out = RF.recStop();
  await A.game.switchWorld('surface'); G.tick?.(10);
  await G.arena();
  return out;
}

// =====================================================================================
// 四、凤凰紧随准星：急转、抬头、俯冲、近处转身、撞击
// =====================================================================================
function steerOverlay(g, w, h, A) {
  const ph = A.phoenix, b = ph.bird;
  if (!b || b.kind !== 'strike') return;
  // 瞄准点（准星射线打到的那一点）在画面上的位置
  if (b.steering) {
    const P0 = ph.aimPoint().p.clone().project(A.camera);
    if (P0.z < 1) { const x = (P0.x * 0.5 + 0.5) * w, y = (-P0.y * 0.5 + 0.5) * h; g.strokeStyle = '#ffd27a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 7, y); g.lineTo(x, y + 7); g.lineTo(x - 7, y); g.closePath(); g.stroke(); }
  }
  const t = `速度 ${b.speed.toFixed(1)} 米/秒${b.diving ? ' · 俯冲' : ''} · 转向 ${Math.round(Math.abs(b.turnRate) * 180 / Math.PI)}°/秒 · ${b.returning ? '凤凰折返' : b.steering ? '按住左键：朝准星所指的点飞' : '松开：保持方向'}`;
  g.font = '14px "Microsoft YaHei",sans-serif'; const tw = g.measureText(t).width; g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(14, 133, tw + 16, 24); g.fillStyle = '#ffe9c2'; g.fillText(t, 22, 150);
}
export async function scnSteer() {
  const A = Q(), ph = A.phoenix, ptr = A.game.pointer, cam = A.cam;
  day();
  await A.game.equipSword('chixiao');
  // 比试圈中心、朝圈门（门外一带 60 米内没有遮挡；镜头在圈里绕着人转，不会撞墙）。魔将放在身后（不在施法时近战辅助的 ±55° 里：凤凰照常朝前飞出，
  // 要靠操控掉头回来）
  spot(); G.clearFoes();
  const es = G.foes([['elite', -8, 1.5]], { hp: 20000 });
  behind(0.0, 0.12, 7.0);
  const REC = RF.recStart({ prefix: 'r22_steer_', every: 2, w: 960, h: 540, title: '凤翔天击 · 凤凰紧随准星', sub: '按住左键：凤凰从自己的位置朝准星所指的那一点转去（水平 360°/秒、垂直 300°/秒、0.08 秒平滑）；松开保持方向' });
  REC.extra = steerOverlay;
  // 镜头一帧一帧转向目标朝向（模拟拖鼠标）
  const turnTo = (yaw, pitch, rate = 3.0) => () => { const dy = Math.atan2(Math.sin(yaw - cam.yaw), Math.cos(yaw - cam.yaw)); cam.yaw += Math.max(-rate / 60, Math.min(rate / 60, dy)); cam.pitch += Math.max(-rate / 60, Math.min(rate / 60, pitch - cam.pitch)); };
  const aimAt = (e, rate) => () => { const c = A.camera.position, p = e.pos.clone().setY(e.pos.y + 1.2); turnTo(Math.atan2(p.x - c.x, p.z - c.z), -Math.atan2(p.y - c.y, Math.hypot(p.x - c.x, p.z - c.z)), rate)(); return !!ph.bird; };
  const y0 = cam.yaw;
  play(0.3);
  pressPhoenix();
  play(1.2, () => !ph.bird);
  ptr.setAttack(true);
  RF.recSub('按住左键、准星抬起：凤凰拉起（越过院墙）');
  play(0.7, turnTo(y0, -0.34));
  RF.recSub('准星往右甩：凤凰在空中随之右转');
  play(0.8, turnTo(y0 - 0.9, -0.2));
  RF.recSub('松开左键：保持当前方向');
  ptr.setAttack(false); play(0.4);
  RF.recSub('再按住、准星转向身后的魔将：凤凰掉头飞回，对准后加速俯冲（0.2 秒的时间常数到 20 米/秒），撞上');
  ptr.setAttack(true);
  play(3.6, aimAt(es[0], 2.6));
  ptr.setAttack(false);
  play(1.0);
  // 近处：魔将在身侧 6 米（不在近战辅助的 ±55° 里）；离刀后立刻把准星甩过去
  G.clearFoes(); ph.clear('film');
  spot();
  const e2 = G.foes([['elite', 0.5, -6]], { hp: 20000 })[0];
  behind(0.0, 0.12, 7.0);
  RF.recSub('近处：魔将在右侧 6 米；离刀后立刻把准星甩过去——凤凰在十米内转过约 90° 撞上');
  play(0.2);
  pressPhoenix();
  play(1.2, () => !ph.bird);
  ptr.setAttack(true);
  play(2.0, aimAt(e2, 4.0));
  ptr.setAttack(false);
  play(1.0);
  G.clearFoes(); ph.clear('film');
  const out = RF.recStop();
  G.skyQuiet(true);
  return out;
}

// =====================================================================================
// 五、同等条件下的伤害对照：21 级、同一把剑（赤霄）、同样三只魔将（金丹，不克制）、无增伤
// =====================================================================================
export async function scnCompare() {
  const A = Q(), ph = A.phoenix, M = A.moves, C = A.combat;
  G.skyQuiet(false);
  await A.game.equipSword('chixiao');
  A.prog.debugSetLevel(21, { qi: 0 });
  const HP = 20000, D = PHOENIX.dBase;
  const tally = { title: '', rows: [] };
  let es = [];
  const overlay = (g, w, h) => {
    g.font = '14px "Microsoft YaHei",sans-serif';
    const lines = [tally.title, ...es.map((e, i) => `${i === 0 ? '中间' : i === 1 ? '左' : '右'}的魔将：${r1(HP - e.hp)}`), ...tally.rows];
    let y = 150;
    for (const t of lines.filter(Boolean)) { const tw = g.measureText(t).width; g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(14, y - 17, tw + 16, 24); g.fillStyle = '#ffe9c2'; g.fillText(t, 22, y); y += 27; }
  };
  const keepRand = ph.rand; ph.rand = () => 0.99;           // 不暴击、不秒杀（同等条件）
  day();
  const place = () => { spot(0, -2); es = G.foes([['elite', 9, 0], ['elite', 9.6, 2.6], ['elite', 9.6, -2.6]], { hp: HP }); behind(0.18, 0.1, 6.4); };
  place();
  const REC = RF.recStart({ prefix: 'r22_cmp_', every: 2, w: 960, h: 540, title: '伤害对照 · 21 级、赤霄、三只魔将（同为金丹）、无增伤、不暴击', sub: '' });
  REC.extra = overlay;
  tally.title = `凤翔天击（D = ${D}）：撞击主目标 2.0 → ${D * 2}；周围 0.75 → ${D * 0.75}；灼烧每 0.5 秒 ${D * 0.01}`;
  RF.recSub('九霄凤焰 · 凤翔天击：撞上中间那只，周围两只吃爆发；之后站在火里的每 0.5 秒灼烧一次');
  play(0.3);
  A.cam.pitch = 0.1;
  pressPhoenix();
  play(5.0);
  tally.rows = [`主目标被撞击击退 2.6 米、出了 4 米的凤焰印：站着不动就只吃到第一跳；一直站在火里 20 秒共 40 跳 = 144（撞击 + 灼烧 = 864，见报告实测）`];
  play(1.6);
  ph.clear('film'); G.clearFoes(); tally.rows = [];
  place();
  M.intent = 100; M.cools.ult = 0;
  const D2 = PM.ult;
  tally.title = `万剑归宗：26 柄飞剑各 ${D2.swordDmg}（落点 ${D2.swordR} 米内）+ 巨剑 ${D2.final.dmg}（阵心 ${D2.final.r} 米内）；全中 ${D2.swords * D2.swordDmg + D2.final.dmg}`;
  RF.recSub('万剑归宗（同样三只、同样的剑）：一半的飞剑对准圈内的敌人，一半随机落在圈内；末了巨剑镇阵');
  play(0.3);
  M.intent = 100; M.cools.ult = 0; M.press('ult', true);
  play(5.2);
  tally.rows = ['实测每只的伤害见上（随机落点，各次不同；多次平均见报告）'];
  play(1.4);
  ph.rand = keepRand;
  G.clearFoes();
  const out = RF.recStop();
  G.skyQuiet(true);
  return out;
}
