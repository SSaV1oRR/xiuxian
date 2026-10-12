// 第二十四轮录像：通天塔第三十层 · 烬狱剑尊——素材动作 → 剑尊动作、十套连招与弹反规则、截锋架势、留锋突刺、火焰招式（一 / 二阶段）、
// 焚天断界、四段过场、两个阶段的实战。
// 都按真实的输入、出招、结算、特效代码推进（__qinglan.tick），帧在页面里同步截下（后台标签页里 await 会被拖慢），录完分批上传（tools/r21_film.js）；
// 剑尊的血条、架势、招式名、焚天断界的倒计时、过场的黑边与标题按游戏里同一份数据画进录像（游戏的界面是网页元素，截不进画布）。
// 音效照常放，同时记下来，离线混成音轨（tools/r19_mix_audio.py）。
// 用法（预览）：const F = await import('/tools/r24_film.js?v=' + Date.now()); await F.setup();
//   setTimeout(() => F.scnCombos(0).then((r) => window.__film = r), 0);   之后 await F.flush()
import * as RF from './r21_film.js';
import * as T from './r24_tests.js';
import { CONFIG30 as CFG, COMBOS30 } from '/src/game/boss30Config.js';
import { PLAYER_COMBAT as PC } from '/src/game/combatConfig.js';

const Q = () => window.__qinglan;
const F = () => Q().game.boss30;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const r2 = (v) => +(+v).toFixed(2);
export const { flush, recSub } = RF;
export async function setup() { return T.setup(); }

// =====================================================================================
// 录像里的剑尊界面：过场的黑边与标题卡；战斗中顶部的名号、阶段、气血、架势、当前招式；焚天断界的倒计时
// =====================================================================================
let HIDE_BAR = false;
function bar(g, x, y, w, h, f, col, bg) { g.fillStyle = bg; g.fillRect(x, y, w, h); g.fillStyle = col; g.fillRect(x, y, w * Math.max(0, Math.min(1, f)), h); }
function box(g, x, y, w, h, a = 0.5) { g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(x, y, w, h); }
export function hud30(g, w, h) {
  const f = F();
  if (!f?.active || !f.rig) return;
  g.textAlign = 'center';
  if (f.cine.active) {
    g.fillStyle = '#050508'; g.fillRect(0, 0, w, h * 0.1); g.fillRect(0, h * 0.9, w, h * 0.1);
    const te = f.hud.titleEl;
    if (te?.classList.contains('on')) {
      g.font = '38px "KaiTi","STKaiti",serif'; g.fillStyle = '#ffe9b8'; g.shadowColor = '#3a0d05'; g.shadowBlur = 14;
      g.fillText(te.querySelector('b').textContent, w / 2, h * 0.46);
      const sub = te.querySelector('span').textContent;
      if (sub) { g.font = '17px "KaiTi","STKaiti",serif'; g.fillStyle = '#f4d7a8'; g.fillText(sub, w / 2, h * 0.46 + 30); }
      g.shadowBlur = 0;
    }
    if (f.cine.cur?.skip) { g.textAlign = 'right'; g.font = '12px "Microsoft YaHei",sans-serif'; g.fillStyle = 'rgba(255,240,220,.7)'; g.fillText('空格 跳过', w - 16, h * 0.965); }
    g.textAlign = 'left';
    return;
  }
  if (HIDE_BAR || !['fight', 'transition', 'victory', 'exec'].includes(f.state)) { g.textAlign = 'left'; return; }
  const bw = 440, bx = (w - bw) / 2, by = 92, U = f.unit, p2 = f.phase === 2;
  g.font = '17px "KaiTi","STKaiti",serif'; g.fillStyle = '#f8e6d0'; g.shadowColor = '#000'; g.shadowBlur = 4;
  g.fillText(`烬狱剑尊　${p2 ? '二阶段 · 烬火' : '一阶段'}`, w / 2, by); g.shadowBlur = 0;
  bar(g, bx, by + 7, bw, 9, U.hp / Math.max(1, U.maxHp), p2 ? '#f05a28' : '#b8402e', 'rgba(15,8,8,.6)');
  bar(g, bx + bw * 0.2, by + 20, bw * 0.6, 4, f.posture / CFG.posture.max, f.B.mode === 'break' ? '#fff1c1' : '#ffb247', 'rgba(15,8,8,.5)');
  g.font = '11px sans-serif'; g.fillStyle = '#fff';
  g.fillText(`${Math.ceil(U.hp)} / ${U.maxHp}　·　架势 ${Math.round(f.posture)} / ${CFG.posture.max}`, w / 2, by + 37);
  const mv = f.M ? `${f.M.no} · ${f.M.name}` : f.B.mode === 'guard' ? '截锋架势' : f.B.mode === 'break' ? '失衡 · 破绽' : f.B.mode === 'recoil' ? '被弹反 · 完整收势' : '';
  if (mv) {
    g.font = '15px "KaiTi","STKaiti",serif'; const tw = g.measureText(mv).width;
    box(g, w / 2 - tw / 2 - 10, by + 44, tw + 20, 22, 0.45);
    g.fillStyle = f.M?.kind === 'fire' || f.M?.kind === 'ult' ? '#ffb247' : '#f3e9d2'; g.fillText(mv, w / 2, by + 60);
  }
  if (f.M?.kind === 'ult' && f.M.stage === 'charge') {
    const left = Math.max(0, CFG.ult.charge - f.M.ct);
    g.font = '30px "KaiTi","STKaiti",serif'; g.fillStyle = '#fff1c1'; g.shadowColor = '#8d241d'; g.shadowBlur = 12;
    g.fillText(`焚天断界　${left.toFixed(1)}`, w / 2, h * 0.34); g.shadowBlur = 0;
    g.font = '13px "Microsoft YaHei",sans-serif'; g.fillStyle = '#ffe2c0'; g.fillText('跑出亮边之外 · 或在爆发的一刻闪身', w / 2, h * 0.34 + 22);
  }
  if (f.hitchT > 0) { g.font = '16px "KaiTi","STKaiti",serif'; g.fillStyle = '#fff1c1'; g.fillText('弹反 · 一顿', w / 2, h * 0.62); }
  g.textAlign = 'left';
}
function rec(prefix, title, sub = '', o = {}) {
  HIDE_BAR = !!o.hideBar;
  const X = RF.recStart({ prefix, every: 2, w: 960, h: 540, title, sub });
  X.extra = (g, w, h) => hud30(g, w, h);
  return X;
}
function stop() { HIDE_BAR = false; Q().game.freeCam = null; return RF.recStop(); }
const play = (secs, fn) => RF.play(secs, fn);
// 玩家不死、守势不破（录像里看招，不看玩家倒下）
function keepHp() { const A = Q(), U = A.combat.playerUnit; U.hp = U.maxHp; A.moves.guardHP = PC.guard.max; }
// 机位：侧面看剑尊与玩家（cx, cz：两人中点）；跟拍：玩家身后看向剑尊
function side(cx = 0, cz = -3, d = 6.2, h = 2.1, s = 1) { Q().game.freeCam = { pos: new (Q().THREE.Vector3)(cx + d * s, h, cz + 0.6), at: new (Q().THREE.Vector3)(cx, 1.05, cz) }; }
function chase(dist = 7.0, pitch = 0.24, k = 0.25) {
  const A = Q(), f = F(), P = A.player;
  A.game.freeCam = null;
  const yaw = Math.atan2(f.root.x - P.pos.x, f.root.z - P.pos.z);
  A.cam.set(A.cam.yaw + wrap(yaw - A.cam.yaw) * k, pitch, dist);
}
function overview(h = 13, back = 15) { const V = Q().THREE.Vector3; Q().game.freeCam = { pos: new V(0, h, back), at: new V(0, 0, -1) }; }

// =====================================================================================
// 一、素材动作 → 剑尊动作（绑定结果）：每段动作配说明（游戏里的名字 ← 来源：素材的动作名 / 制作的动作），绕着剑尊慢慢转
// =====================================================================================
export async function scnActions() {
  await T.fight();
  const A = Q(), f = F(), R = f.rig, V = A.THREE.Vector3;
  T.freshBoss(); f.debug.ai(false); T.place(0, 7); f.setMode('cine'); f.lookW = 0;
  const list = [
    ['idle', '待机', 'Idle2（素材原样）', 2.6, { loop: true }],
    ['walk_f', '走', 'Walk_Fw_Loopable（素材原样）', 2.2, { loop: true }],
    ['walk_r', '原地转身（踏侧步）', 'Walk_R_Loopable（素材）＋ 程序转向', 2.4, { loop: true, turn: -1.3 }],
    ['run_f', '跑', 'Run_Fw_Loopable（素材原样）', 1.8, { loop: true }],
    ['a8s2c', '横斩 · 疾锋横斩 A01', 'Attack8_Stage2_Complete（素材原样）', 1.6, {}],
    ['a8s1c', '重劈 · 悬锋重劈 A02', 'Attack8_Stage1_Complete（素材原样；运行时举剑处停 0.45 秒）', 1.9, {}],
    ['thrust_dash', '突刺 · 留锋突刺', '制作：下身 Dash_Fw 的步子 ＋ 上身两节 IK 的拉剑 / 直刺（素材里没有直刺）', 2.0, {}],
    ['guard', '格挡 · 截锋架势', '制作：Idle2 上用 IK 摆的横档（剑斜立身前）', 1.6, { loop: true }],
    ['hit_f', '受击', 'Hit_Fw（素材原样）', 1.1, {}],
    ['kneel', '失衡 · 单膝跪地', '制作：IK 摆的单膝跪地（剑拄地）', 1.8, { loop: true }],
    ['parry_recoil', '被弹反 · 完整收势', '制作：Hit_Fw 上身 ＋ Dodge_Bw 下身 ＋ IK 把剑震开', 1.1, {}],
    ['kneel_slump', '击败 · 跪倒碎成余烬', '制作：跪地垂臂 ＋ 着色器自上而下碎烬', 3.4, { loop: true, ash: true }],
  ];
  const X = rec('r24_actions_', '绑定结果 · 素材动作 → 剑尊动作', '', { hideBar: true });
  let ang = 0.55;
  const orbit = () => { const c = f.root; A.game.freeCam = { pos: new V(c.x + Math.sin(ang) * 3.3, 1.5, c.z + Math.cos(ang) * 3.3), at: new V(c.x, 1.0, c.z) }; };
  for (const [clip, name, src, secs, o] of list) {
    RF.recSub(`${name}　←　${src}`);
    f.root.set(0, 0, -4); R.setYaw(0);
    R.play(clip, { fade: 0.2, loop: o.loop, root: false });
    play(secs, (t) => { ang += 0.0045; orbit(); if (o.turn) R.turn(o.turn / 60); if (o.ash) R.U.uAsh.value = Math.min(1, Math.max(0, (t - 0.9) / 2.2)); });
  }
  R.U.uAsh.value = 0; R.setYaw(0);
  const out = stop();
  f.toIdle(1);
  return out;
}

// =====================================================================================
// 二、十套连招与弹反规则：侧面机位；玩家举剑格挡，挑一击弹反——中途那一击：一顿 0.15 秒、连段继续；收招的一击（或「任一即收」的那套）：完整收势
// =====================================================================================
export async function scnCombos(part = 0) {
  const ids = part === 0 ? ['A01', 'A02', 'A03', 'A04', 'A05'] : ['A06', 'A07', 'A08', 'A09', 'A10'];
  await T.fight();
  const A = Q(), f = F(), C = A.combat;
  f.debug.ai(false);
  if (f.phase !== 1) f.debug.phase(1);
  const plan = {};
  for (const id of ids) plan[id] = T.contacts(id, 1.9);               // 空跑（不录）：每一击真正碰到玩家的时刻
  rec(`r24_combos${part + 1}_`, part === 0 ? '十套连招（一）· 节奏与弹反' : '十套连招（二）· 节奏与弹反');
  const res = [];
  ids.forEach((id, i) => {
    const D = COMBOS30[id], keys = D.segs.flatMap((s) => (s.hits || []).map((h) => h.key)), n = keys.length;
    const k = n === 1 ? 0 : (i % 2 === 0 ? n - 1 : Math.floor((n - 1) / 2));
    const want = D.parry === 'any' || k === n - 1 ? 'recoil' : 'hitch';
    T.freshBoss(); f.toIdle(9); T.place(0, -4 + 1.9); keepHp();
    const at = (plan[id][keys[k]] ?? 1) - 0.08;
    RF.recSub(`${id} ${D.name}（${D.rhythm.split('').join('·')}）　举剑格挡，第 ${k + 1} 击弹反 → ${want === 'recoil' ? '完整收势' : '一顿 0.15 秒、连段继续'}${D.parry === 'any' ? '（这套任一击被弹即收）' : ''}`);
    side(0, -3.0);
    C.setGuard(true);
    play(0.9, () => keepHp());                                       // 早早举剑：弹反窗口按下后约 0.75 秒内不会再开，第一击要弹就得先举一阵
    const n0 = f.traceN || 0, t0 = f.time;
    f.debug.move(id);
    let rel = false, pr = false;
    play(7, () => {
      keepHp();
      const el = f.time - t0;
      if (!rel && el >= at - 0.3) { rel = true; C.setGuard(false); }
      if (!pr && el >= at) { pr = true; C.setGuard(true); }
      return f.B.mode === 'move' || f.B.mode === 'recoil' || el < at + 0.4;
    });
    C.setGuard(false);
    const ev = f.since(n0);
    res.push({ id, k, want, got: ev.some((e) => e.type === 'hitch') ? 'hitch' : ev.some((e) => e.type === 'mode' && e.mode === 'recoil') ? 'recoil' : 'none', hits: ev.filter((e) => e.type === 'hit').map((e) => `${e.key}=${e.res}`) });
    play(0.5, () => { keepHp(); });
  });
  const out = stop();
  return { ...out, res };
}

// =====================================================================================
// 三、截锋架势：正面的真实近战被截住、随后一记反击（可闪、可挡、可弹）；背后、剑气不被截
// =====================================================================================
export async function scnGuard() {
  await T.fight();
  const A = Q(), f = F(), C = A.combat, M = A.moves;
  f.debug.ai(false); if (f.phase !== 1) f.debug.phase(1);
  const dry = T.guardRun({ how: 'front', counter: 'none' });
  const d = dry.ev.find((e) => e.includes('deflect')), h = dry.ev.find((e) => e.includes('hit:counter'));
  const counterAt = d && h ? parseFloat(h) - parseFloat(d) : 0.54;
  rec('r24_guard_', '截锋架势 · 截住正面近战，随后一记反击');
  const one = (how, sub, parry) => {
    T.freshBoss(); f.cd.guard = 0;
    const b = f.root, s = how === 'back' ? -1 : 1;
    T.place(b.x, b.z + 2.2 * s); keepHp();
    if (how === 'qi') M.loadout?.debugSet?.(['qi', 'heavy', 'power', 'ult', 'seal', 'phoenix']);
    RF.recSub(sub);
    side(0, -3, 6.2);
    const n0 = f.traceN || 0;
    f.debug.guard();
    let pressed = false, defl = null, cp = false;
    play(3.0, (t) => {
      keepHp();
      if (!pressed && t >= 0.17) { pressed = true; if (how === 'qi') { M.cools.qi = 0; M.mp = M.mpMax; M.press('qi', true); } else { M.press('light', true); M.press('light', false); } }
      if (defl == null) { const e = f.since(n0).find((x) => x.type === 'deflect'); if (e) defl = e.t; }
      if (parry && defl != null && !cp && f.time - defl >= counterAt - 0.08) { cp = true; C.setGuard(true); }
      if (cp && defl != null && f.time - defl >= counterAt + 0.3) C.setGuard(false);
      return true;
    });
    C.setGuard(false);
    play(0.4, () => keepHp());
  };
  one('front', '准备 0.35 → 窗口 0.18 秒（身前 120°）：正面的普攻被截住、不掉血；随后 0.45 秒准备的反击——不躲，被打中', false);
  one('front', '同样被截之后，反击碰到前一刻按右键：弹开反击（剑尊完整收势）', true);
  one('back', '绕到背后普攻：不被截（只截身前 120°），照常掉血、加架势；空架 0.6 秒后收', false);
  one('qi', '剑气不算近战：不被截', false);
  return stop();
}

// =====================================================================================
// 四、留锋突刺：真实的后撤闪身（远离剑尊、3–10 米、冷却好了、剑尊空闲）→ 必定触发；落地后横移可躲；二阶段留一道短火迹
// =====================================================================================
export async function scnRoll() {
  await T.fight();
  const A = Q(), f = F(), M = A.moves, I = A.input;
  f.debug.ai(false);
  rec('r24_roll_', '留锋突刺 · 追击远远后撤的闪身');
  const one = (sub, { dist = 5, key = null, after = null, phase = 1 } = {}) => {
    T.freshBoss(); if (f.phase !== phase) f.debug.phase(phase); f.cd.roll = 0;
    T.place(0, -4 + dist); keepHp();
    RF.recSub(sub);
    side(0, -4 + dist / 2 + 2, 9.5, 2.6);
    play(0.5, () => keepHp());
    I.keys.clear(); if (key) I.keys.add(key);
    M.cools.dodge = 0; M.press('dodge', true);
    play(0.05, () => keepHp()); I.keys.clear();
    if (after) { play(0.45, () => keepHp()); I.keys.add(after); }
    play(2.4, () => { keepHp(); return true; });
    I.keys.clear();
    play(0.3, () => keepHp());
  };
  one('离剑尊 5 米向后闪身 → 0.8 秒前摇（记下翻滚落点）、出手前 0.15 秒锁定方向 → 冲刺直刺，按真实的剑身判定：命中', { dist: 5 });
  one('同样向后闪身，落地后立刻横移：方向已锁定，突刺落空（可闪）', { dist: 5, after: 'KeyD' });
  one('朝剑尊闪身（不是远离）：不触发', { dist: 6, key: 'KeyW' });
  one('二阶段：突刺沿途留下一道短火迹（另算伤害、不延长剑身判定）', { dist: 6, phase: 2 });
  return stop();
}

// =====================================================================================
// 五、火焰招式：地上的图案、边线与爆发；火不可格挡、不可弹反（闪身无敌或离开范围可避）
// =====================================================================================
function fireShot(id, { dist, sub, phase = null, dodge = null, dodgeKey = null, shift = null, guard = false, press = null, secs = 3.6, cam = 'chase' }) {
  const A = Q(), f = F(), C = A.combat, M = A.moves, I = A.input, P = A.player;
  T.freshBoss();
  const ph = phase ?? (id.startsWith('F') ? (id === 'F01' || id === 'F02' ? 1 : 2) : 1);
  if (f.phase !== ph) f.debug.phase(ph);
  f.cd.fire = {};
  T.place(0, -4 + dist); keepHp();
  RF.recSub(sub);
  if (cam === 'chase') { A.game.freeCam = null; A.cam.set(Math.PI, 0.3, 8.5); A.cam.snap(P.pos.clone().setY(1.55)); }
  else if (cam === 'over') overview();
  else side(0, -4 + dist / 2, 9, 3.2);
  play(0.3, () => keepHp());
  const t0 = f.time;
  f.debug.move(id);
  let dodged = false, shifted = false, pr = null;
  play(secs, () => {
    keepHp();
    const el = f.time - t0;
    if (cam === 'chase') chase(8.5, 0.32, 0.1);
    if (guard) C.setGuard(true);
    if (dodge && !dodged && dodge(f, P.pos, el)) { dodged = true; I.keys.clear(); if (dodgeKey) I.keys.add(dodgeKey); M.cools.dodge = 0; M.press('dodge', true); }
    if (shift && !shifted && el >= shift.at) { shifted = true; I.keys.add(shift.key); }
    if (shifted && el >= shift.at + shift.secs) I.keys.delete(shift.key);
    if (press != null && pr == null && el >= press) { pr = el; C.setGuard(true); }
    if (pr != null && el >= pr + 0.3) C.setGuard(false);
    return true;
  });
  I.keys.clear(); C.setGuard(false);
  play(0.3, () => keepHp());
}
const nearWave = (f, p) => f.hz.some((h) => h.kind === 'wave' && h.wave && (((p.x - h.o.x) * h.d.x + (p.z - h.o.z) * h.d.z) - h.s) > 0 && (((p.x - h.o.x) * h.d.x + (p.z - h.o.z) * h.d.z) - h.s) < 1.4);
const burstSoon = (kind) => (f) => f.hz.some((h) => h.kind === kind && !h.done && h.t >= (h.delay ?? 1) - 0.06);
export async function scnFire1() {
  await T.fight(); F().debug.ai(false);
  rec('r24_fire1_', '火焰招式 · 一阶段（剑 75% / 火 25%）');
  fireShot('F01', { dist: 7, sub: 'F01 烬刃波：挥剑后地上亮出火道（0.8 秒准备），火浪沿地推出、到火墙为止——举剑格挡也挡不住' , guard: true });
  fireShot('F01', { dist: 7, sub: '同一招：火浪到身前的一刻朝它闪身，闪身无敌穿过去', dodge: nearWave, dodgeKey: 'KeyW' });
  fireShot('F02', { dist: 3, sub: 'F02 踏火震：跃起踏地，脚下 4 米的火纹 1.0 秒后爆发——站在圈里被炸', cam: 'side' });
  fireShot('F02', { dist: 3, sub: '同一招：看清圈线，走出 4 米之外', shift: { at: 0.85, key: 'KeyS', secs: 0.6 }, cam: 'side' });
  fireShot('A02', { dist: 2.2, sub: 'F03 燃刃留痕：重劈剑尖贴地处留下 4 秒火痕（只是地上的火，不延长刀身判定），站上去每 0.5 秒灼一下', secs: 4.2, cam: 'side' });
  return stop();
}
export async function scnFire2() {
  await T.fight(); F().debug.ai(false);
  rec('r24_fire2_', '火焰招式 · 二阶段（剑 55% / 火 45%；胸口、甲缝、剑刃燃起）');
  fireShot('F04', { dist: 7, sub: 'F04 三叠炎浪：三道火浪 快—慢—快（起步间隔约 1.65 / 0.6 秒）——第一道闪身躲过，之后一直侧移、走出后两道的火道', secs: 4.6, dodge: nearWave, dodgeKey: 'KeyA' });
  fireShot('F05', { dist: 6, sub: 'F05 焚环裂地：插剑，3.4–8.6 米的环带 1.2 秒后爆发；环内、环外是安全区（平静的虚线圈）——站在环上被炸', cam: 'over' });
  fireShot('F05', { dist: 6, sub: '同一招：走进环内的安全区', shift: { at: 0.4, key: 'KeyW', secs: 0.9 }, cam: 'over' });
  fireShot('F06', { dist: 7, sub: 'F06 落烬火柱：三根火柱在放招的一刻定下位置（脚下 + 左右各偏 40°），1.1 秒后爆发——走开就躲过', shift: { at: 0.5, key: 'KeyS', secs: 0.8 }, cam: 'over' });
  fireShot('F07', { dist: 8, sub: 'F07 炎刃重坠：跃起重劈——刀身可弹反；落地的火纹 0.45 秒后炸开、不可弹反（弹完再闪身离开）', press: 1.17, dodge: burstSoon('circle'), dodgeKey: 'KeyS', secs: 3.4, cam: 'side' });
  return stop();
}

// =====================================================================================
// 六、焚天断界：跃至台心 → 蓄力 5.5 秒（地纹、火聚、增强、最终前摇；危险区在蓄力开始时定下：半径 √0.75·R）→ 爆发判定一次 → 恢复 4 秒
// =====================================================================================
export async function scnUlt() {
  await T.fight();
  const A = Q(), f = F(), C = A.combat, M = A.moves, I = A.input, P = A.player;
  f.debug.ai(false);
  rec('r24_ult_', '焚天断界 · 二阶段的秒杀');
  const one = (how, sub) => {
    T.freshBoss(); if (f.phase !== 2) f.debug.phase(2); f.cd.ult = 0;
    T.place(0, 4); C.playerUnit.hp = C.playerUnit.maxHp;
    RF.recSub(sub);
    A.game.freeCam = null; A.cam.set(Math.PI, 0.42, 10); A.cam.snap(P.pos.clone().setY(1.55));
    f.debug.move('ult');
    let pressed = false;
    play(how === 'stay' ? 12 : 11.5, () => {
      const Mv = f.M, ct = Mv?.id === 'ult' && Mv.stage === 'charge' ? Mv.ct : null;
      if (how !== 'stay') C.playerUnit.hp = C.playerUnit.maxHp;
      if (how === 'run' && ct != null) { A.cam.set(Math.atan2(P.pos.x, P.pos.z), 0.42, 10); if (Math.hypot(P.pos.x, P.pos.z) < Mv.zone.r + 1.0) I.keys.add('KeyW'); else I.keys.clear(); }
      if (how === 'dodge' && ct != null && !pressed && ct >= CFG.ult.charge - 0.05) { pressed = true; M.cools.dodge = 0; M.press('dodge', true); }
      if (how !== 'run') A.cam.set(Math.atan2(f.root.x - P.pos.x, f.root.z - P.pos.z), 0.42, 10);
      return f.state === 'fight' ? (f.M?.id === 'ult' || f.B.mode !== 'idle') : f.cine.active && f.cine.cur.t < 2.2;
    });
    I.keys.clear();
  };
  one('run', '开始蓄力：台面 3/4（亮边以内，半径 15.6 米）化作火阵——跑到亮边以外的外圈：安全（剑尊恢复 4 秒，冷却 40 秒从恢复结束起算）');
  one('dodge', '站在区内，在爆发的一刻闪身：闪身无敌，躲过');
  one('stay', '站在区内不动（格挡、弹反都挡不住）：致死——经统一的伤害入口倒下，进失败过场');
  const out = stop();
  return out;
}

// =====================================================================================
// 七、四段过场：出场（7.2 秒）/ 转阶段（6.2）/ 击败（5.8）/ 失败（5.0），都完整放
// =====================================================================================
export async function scnCines() {
  const A = Q(), C = A.combat;
  await T.fight();
  const f = F();
  f.cine.forceSkip = false;
  rec('r24_cines_', '四段过场');
  // 出场：从桥头走上剑台触发
  f.resetFight(true); f.debugUsed = false;
  RF.recSub('出场：火盆熄灭 → 台心余烬翻涌、火墙升起封住出口 → 剑尊由余烬自脚下凝成 → 缓缓拔剑 → 名号 → 回到玩家');
  A.player.place(0, 15.6, Math.PI, 0); A.cam.set(Math.PI, 0.2, 6.6); A.cam.snap(A.player.pos.clone().setY(1.55));
  A.input.keys.add('KeyW');
  play(9.5, () => { if (f.state !== 'dormant') A.input.keys.clear(); return f.state === 'dormant' || f.cine.active || f.time < 0; });
  A.input.keys.clear();
  play(0.8);
  // 转阶段：一阶段最后一击
  f.debug.ai(false);
  RF.recSub('转阶段：剑尊跪地，胸口与甲缝裂出火光 → 起身、火盆旺火、台面熔岩裂纹烧红 → 二阶段（气血另起一条）');
  T.place(0, -4 + 2.0); f.unit.hp = 1; f.debugUsed = false;
  C.damage(f.unit, 50, { from: C.playerUnit, kind: 'sword', hitKind: 'light' });
  play(7.0, () => f.cine.active || f.state !== 'fight');
  play(0.6);
  RF.recSub('击败：剑上的火熄灭 → 单膝跪地、剑脱手落地 → 自上而下碎成余烬 → 火墙落下、出口打开 → 用时与奖励');
  f.unit.hp = 1; f.debugUsed = false;
  C.damage(f.unit, 50, { from: C.playerUnit, kind: 'sword', hitKind: 'light' });
  play(6.4, () => f.cine.active);
  const out = stop();
  if (A.ui.panelOpen) A.ui.closePanel();
  f.cine.forceSkip = true;
  return out;
}
export async function scnDefeat() {
  const A = Q(), C = A.combat;
  await T.fight();
  const f = F();
  f.debug.ai(false); T.place(0, -4 + 2.4);
  f.cine.forceSkip = false;
  rec('r24_defeat_', '失败过场');
  RF.recSub('玩家力竭：被击退倒地 → 剑尊走到身前 2.6 米、收剑定式 → 黑场 → 重新挑战 / 返回');
  play(0.6);
  C.playerUnit.invuln = 0;
  C.damage(C.playerUnit, 99999, { from: f.unit, kind: 'phys', spec: { def: 'blade', id: 'r24film', block: false, parry: false } });
  play(5.6, () => f.cine.active);
  const out = stop();
  if (A.ui.panelOpen) A.ui.closePanel();
  f.cine.forceSkip = true;
  return out;
}

// =====================================================================================
// 八、实战：剑尊 AI 全开，玩家由一个简单的机器人操作（看圈走位、出手前格挡 / 弹反、剑尊收招时进攻、气血低时吃丹）
// =====================================================================================
function danger(f, p) {
  // 返回要躲开的方向（世界坐标）与是否紧急；没有危险时 null
  for (const h of f.hz) {
    if (h.kind === 'wave' && h.s < h.L) {
      const px = p.x - h.o.x, pz = p.z - h.o.z, along = px * h.d.x + pz * h.d.z, lat = px * h.d.z - pz * h.d.x;
      if (along > h.s - 0.5 && along < h.L + 0.5 && Math.abs(lat) < 2.0) { const sg = lat >= 0 ? 1 : -1; return { x: h.d.z * sg, z: -h.d.x * sg, urgent: h.wave && along - h.s < 2.2 }; }
    }
    if ((h.kind === 'circle' || h.kind === 'pillar') && !h.done) {
      const c = h.c || h.p, dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (d < h.r + 0.9) return { x: dx / (d || 1), z: dz / (d || 1), urgent: h.t > (h.delay ?? 1) - 0.12 };
    }
    if (h.kind === 'ring' && !h.done) {
      const dx = p.x - h.c.x, dz = p.z - h.c.z, d = Math.hypot(dx, dz) || 1;
      if (d > h.r0 - 0.9 && d < h.r1 + 0.9) { const s = d - h.r0 < h.r1 - d ? -1 : 1; return { x: (dx / d) * s, z: (dz / d) * s, urgent: h.t > h.delay - 0.12 }; }
    }
  }
  const Mv = f.M;
  if (Mv?.kind === 'ult' && Mv.zone) { const r = Math.hypot(p.x, p.z) || 1; if (r < Mv.zone.r + 0.9) return { x: p.x / r, z: p.z / r, urgent: Mv.stage === 'charge' && Mv.ct > CFG.ult.charge - 0.12, run: true }; }
  for (const Z of f.zones) for (const q of Z.patches) { const dx = p.x - q.p.x, dz = p.z - q.p.z, d = Math.hypot(dx, dz); if (d < q.r + 0.5) return { x: dx / (d || 1), z: dz / (d || 1), urgent: false }; }
  return null;
}
export function botStep(st) {
  const A = Q(), f = F(), P = A.player, M = A.moves, C = A.combat, I = A.input, U = C.playerUnit, keys = I.keys;
  keys.clear();
  if (f.state !== 'fight' || f.cine.active) { C.setGuard(false); return; }
  if (st.hpLock) { U.hp = Math.max(U.hp, U.maxHp * 0.6); }
  const r = f.root, dx = r.x - P.pos.x, dz = r.z - P.pos.z, d = Math.hypot(dx, dz), toBoss = Math.atan2(dx, dz);
  A.cam.set(A.cam.yaw + wrap(toBoss + 0.38 - A.cam.yaw) * 0.12, 0.3, 8.6);      // 镜头偏到玩家身后左侧：剑尊不被玩家挡住
  const yaw = A.cam.yaw;
  const go = (wx, wz) => { const fw = wx * Math.sin(yaw) + wz * Math.cos(yaw), rt = -(wx * Math.cos(yaw) - wz * Math.sin(yaw)); if (fw > 0.3) keys.add('KeyW'); if (fw < -0.3) keys.add('KeyS'); if (rt > 0.3) keys.add('KeyD'); if (rt < -0.3) keys.add('KeyA'); };
  st.guardT -= 1 / 60; st.act -= 1 / 60;
  const dz2 = danger(f, P.pos);
  if (dz2) {
    if (C.guardHeld) C.setGuard(false);
    go(dz2.x, dz2.z); if (dz2.run) keys.add('ShiftLeft');
    if (dz2.urgent && M.cools.dodge <= 0) M.press('dodge', true);
    return;
  }
  // 剑尊出手：下一击开刃前一瞬按下格挡（新按下的 0.18 秒是弹反窗口），之后举着挡
  const Mv = f.M, c = f.rig.cur;
  if (Mv && Mv.kind !== 'ult' && Mv.seg?.hits?.length && d < 4.6) {
    const h = Mv.seg.hits.find((x) => c.t < x.t[1]);
    if (h) {
      const until = c.t < h.t[0] ? f.rig.realSpan(c.t, h.t[0]) : 0;
      const key = Mv.uid + ':' + h.key;
      if (until < 0.09 && st.parried !== key) { st.parried = key; if (C.guardHeld) C.setGuard(false); C.setGuard(true); st.guardT = 0.5; }
      else if (until < 0.45 && st.parried !== key && !C.guardHeld) { /* 等着按 */ }
      if (st.guardT <= 0 && C.guardHeld && until > 0.6) C.setGuard(false);
      return;
    }
  }
  if (st.guardT <= 0 && C.guardHeld) C.setGuard(false);
  if (U.hp < U.maxHp * 0.4 && M.cools.gourd <= 0 && M.gourdLeft > 0 && !Mv) M.press('gourd', true);
  const free = !Mv || f.B.mode === 'recoil' || f.B.mode === 'break';
  if (f.B.mode === 'guard') { go(-dx / (d || 1), -dz / (d || 1)); return; }             // 剑尊横剑截锋：别硬砍，退开
  if (free && d < 2.6) { if (st.act <= 0) { M.press('light', true); M.press('light', false); st.act = 0.16; } return; }
  if (d > 2.2) go(dx / d, dz / d);
}
export async function scnFight(phase = 1, { secs = 40, lowAt = 30 } = {}) {
  await T.fight({ ai: true });
  const A = Q(), f = F(), C = A.combat;
  f.debugUsed = false;
  if (phase === 2) { f.debug.phase(2); }
  T.place(0, 6);
  const st = { guardT: 0, act: 0, parried: null, hpLock: true };
  const stats = { blocks: 0, parries: 0, hits: 0, dodges: 0 };
  const L = (e) => { if (e.target !== C.playerUnit) return; if (e.result === 'block') stats.blocks++; else if (e.result === 'parry') stats.parries++; else if (e.result === 'hit') stats.hits++; else if (e.result === 'dodge') stats.dodges++; };
  C.hitListeners.add(L);
  rec(`r24_fight${phase}_`, phase === 1 ? '实战 · 一阶段（剑尊 AI 全开）' : '实战 · 二阶段（剑尊 AI 全开）');
  RF.recSub(phase === 1 ? '玩家由脚本操作：看图案走位、出手前一瞬按右键（弹反）、剑尊收招 / 失衡时进攻' : '二阶段：移速 +15%、常规恢复 −15%，火焰更多；焚天断界在二阶段 12 秒后可用');
  const n0 = f.traceN || 0;
  let lowered = false;
  try {
    play(secs, (t) => {
      botStep(st);
      if (!lowered && t >= lowAt && f.state === 'fight') { lowered = true; f.unit.hp = Math.min(f.unit.hp, f.unit.maxHp * 0.06); RF.recSub(`（为缩短录像：第 ${lowAt} 秒起把剑尊余下气血调到 6%）${phase === 1 ? '——耗尽进入转阶段过场' : '——耗尽进入击败过场'}`); }
      return f.state === 'fight' || f.cine.active;
    });
  } finally { C.hitListeners.delete(L); A.input.keys.clear(); C.setGuard(false); }
  const moves = f.since(n0).filter((e) => e.type === 'move').map((e) => e.id);
  const out = stop();
  return { ...out, stats, moves, state: f.state, phase: f.phase };
}
