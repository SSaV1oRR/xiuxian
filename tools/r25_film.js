// 第二十五轮录像：拔刀斩「终式·墨·终焉」——墨势积累与成势、3 秒满蓄力、高血量目标的强化伤害、普通敌人的完整处决、
// 第三十层一阶段（非最终）的处决与正常转阶段、墙边的精简演出。
// 都按真实的输入、出招、结算、演出代码推进（__qinglan.tick），帧在页面里同步截下（后台标签页里 await 会被拖慢），录完分批上传（tools/r21_film.js）；
// 墨势签、终式格子、演出的黑边与竖排标题、「跳过」、剑尊的血条与过场按游戏里同一份数据画进录像（游戏的界面是网页元素，截不进画布）。
// 音效：音效库里的录音照常记下、离线混（tools/r19_mix_audio.py）；音效库之外的合成音（终式的墨声、纸声、收刀清响、爆墨、八卦低鸣……）
// 录完在页面里用游戏同一段合成代码离线渲染成一轨（synthStem，OfflineAudioContext），混音时并进来（r19_mix_audio.py stem=）。
// 用法（预览）：const F = await import('/tools/r25_film.js?v=' + Date.now()); await F.setup();
//   setTimeout(async () => { const r = await F.scnFull(); const s = await F.synthStem('full'); const n = await F.flush(); window.__film = { r, s, n }; }, 0);
import * as RF from './r21_film.js';
import * as T from './r25_tests.js';
import { hud30 } from './r24_film.js';
import { FINALE as F } from '/src/game/inkFinaleConfig.js';
import { LOADOUT, PLAYER_COMBAT as PC } from '/src/game/combatConfig.js';

const Q = () => window.__qinglan;
const r2 = (v) => +(+v).toFixed(2);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const { flush, recSub } = RF;
export async function setup() { return T.setup(); }

// =====================================================================================
// 录像里的界面：右下的墨势签与终式格子（同 InkHud / combatHud 的规则）；演出时的黑边、竖排标题、「跳过」与分段说明；右上的实测对照
// =====================================================================================
const PAL = { deep: '#080b10', ink: '#15191f', gray: '#46505a', paper: '#d8d1c4', silver: '#eaf0f2', red: '#b63832' };
const KAI = '"KaiTi","STKaiti",serif', HEI = '"Microsoft YaHei",sans-serif';
let NOTE = null;          // 右上角的实测对照：[[标签, 值], …]
let CAP = null;           // 演出时下黑边里的分段说明：(t, S) => 文字
let TIMER = false;        // 墨势签下的灰字标注：距上一次有效命中几秒（录像标注，游戏里没有）
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
// 墨势签：没成势「墨势：n／30」；成势「墨势已成 · 满蓄力可施展终式」；有墨势蓄力「终式蓄势 x／3.0 秒」→「终式 · 满蓄力（松开出刀）」（带进度细条）
function inkTip(g, w, h) {
  const A = Q(), Fn = A.finale, I = A.moves.iai;
  if (!Fn.enabled) return;
  let text, mode = 'count', k = 0;
  if (I && Fn.ready) { const full = F.charge.full; k = Math.min(1, I.charge / full); mode = k >= 1 ? 'full' : 'charge'; text = k >= 1 ? '终式 · 满蓄力（松开出刀）' : `终式蓄势 ${I.charge.toFixed(1)}／${full.toFixed(1)} 秒`; }
  else if (Fn.ready) { mode = 'ready'; text = '墨势已成 · 满蓄力可施展终式'; }
  else text = `墨势：${Fn.count}／${F.stack.hits}`;
  g.font = `14px ${KAI}`;
  const tw = g.measureText(text).width, pw = 6 + 18 + 8 + tw + 12, ph = 26, x = w - 16 - pw, y = h - 142;
  g.save();
  if (mode === 'full') { const p = 0.5 + 0.5 * Math.sin((Fn.clock * Math.PI * 2) / 0.9); g.shadowColor = `rgba(234,240,242,${0.35 + 0.4 * p})`; g.shadowBlur = 6 + 10 * p; }
  else { g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = 8; }
  g.fillStyle = mode === 'count' ? 'rgba(21,25,31,.8)' : 'rgba(8,11,16,.88)';
  rrect(g, x, y, pw, ph, 12); g.fill();
  g.restore();
  if (mode !== 'count') { g.strokeStyle = mode === 'full' ? 'rgba(234,240,242,.85)' : 'rgba(216,209,196,.35)'; g.lineWidth = 1; rrect(g, x + 0.5, y + 0.5, pw - 1, ph - 1, 12); g.stroke(); }
  g.fillStyle = PAL.red; rrect(g, x + 6, y + 4, 18, 18, 3); g.fill();
  g.font = `700 12px ${KAI}`; g.fillStyle = '#f3e8dc'; g.textAlign = 'center'; g.fillText('墨', x + 15, y + 17.5);
  g.font = `14px ${KAI}`; g.textAlign = 'left'; g.fillStyle = mode === 'ready' ? PAL.silver : PAL.paper; g.fillText(text, x + 32, y + 18);
  if (mode === 'charge' || mode === 'full') { g.fillStyle = 'rgba(216,209,196,.22)'; g.fillRect(x + 30, y + ph - 4, pw - 42, 2); g.fillStyle = PAL.silver; g.fillRect(x + 30, y + ph - 4, (pw - 42) * k, 2); }
  if (TIMER && !Fn.ready && Fn.count > 0) {
    const since = Math.max(0, Fn.clock - Fn.lastHit);
    g.font = `12px ${HEI}`; g.textAlign = 'right'; g.fillStyle = since > F.stack.timeout - 2 ? '#ffcf9a' : 'rgba(235,235,235,.85)';
    g.shadowColor = '#000'; g.shadowBlur = 3;
    g.fillText(`（标注）距上一次有效命中 ${since.toFixed(1)} 秒 · 满 ${F.stack.timeout} 秒清零`, w - 18, y - 8);
    g.shadowBlur = 0; g.textAlign = 'left';
  }
}
// 终式格子（剑诀栏里拔刀斩那一格）：装备着即「终式」（墨色细环）；成势时整格转墨、外发银光；蓄力外圈（有墨势按 3 秒、银白；普通按 5 秒、金）
function powerSlot(g, w, h) {
  const A = Q(), Fn = A.finale, L = A.loadout, M = A.moves, i = L.slotOf('power');
  if (i < 0) return;
  const cx = w - 52, cy = h - 74, r = 27, ready = Fn.inkReady, C = M.iaiCharge;
  g.save();
  if (ready) { g.shadowColor = 'rgba(234,240,242,.8)'; g.shadowBlur = 16; }
  g.fillStyle = 'rgba(244,239,228,.9)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.restore();
  g.lineWidth = 2; g.strokeStyle = 'rgba(21,25,31,.55)'; g.beginPath(); g.arc(cx, cy, r + 1.5, 0, Math.PI * 2); g.stroke();
  if (C) { g.lineWidth = 4; g.strokeStyle = C.ink ? PAL.silver : '#f2cf6a'; g.beginPath(); g.arc(cx, cy, r - 2.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * C.k); g.stroke(); }
  const hr = r - 7;
  if (ready) { const gr = g.createRadialGradient(cx - 3, cy - 5, 2, cx, cy, hr); gr.addColorStop(0, '#3b424b'); gr.addColorStop(0.72, PAL.ink); gr.addColorStop(1, PAL.ink); g.fillStyle = gr; }
  else g.fillStyle = 'rgba(255,255,255,.55)';
  g.beginPath(); g.arc(cx, cy, hr, 0, Math.PI * 2); g.fill();
  g.textAlign = 'center';
  g.font = `${ready ? 700 : 400} 15px ${KAI}`; g.fillStyle = ready ? '#e6e0d4' : PAL.ink; g.fillText(Fn.enabled ? F.short : '拔刀', cx, cy + 5);
  g.font = `600 11px ${HEI}`; g.fillStyle = 'rgba(244,239,228,.95)'; g.shadowColor = '#000'; g.shadowBlur = 3;
  g.fillText(`${LOADOUT.labels[i]} · Z · 中键`, cx, cy + r + 15); g.shadowBlur = 0;
  g.textAlign = 'left';
}
// 竖排文字（自上而下，列中心 x）
function vtext(g, s, x, y, size, gap) { let yy = y; for (const ch of s) { if (ch === ' ') { yy += size * 0.5; continue; } g.fillText(ch === '·' ? '・' : ch, x, yy + size); yy += size + gap; } return yy - y; }
function vlen(s, size, gap) { let n = 0; for (const ch of s) n += ch === ' ' ? size * 0.5 : size + gap; return n; }
// 演出：上下黑边（0.35 秒展开）、完整版的竖排标题（0.6 秒起 0.7 秒淡入）、右下「空格 / E 跳过」；上黑边写录像标题，下黑边写分段说明
function showLayer(g, w, h, X) {
  const Fn = Q().finale, S = Fn.show, t = S ? S.t : 0, mode = S?.mode || 'full';
  const e = clamp01(t / 0.35), bh = h * 0.085 * (1 - (1 - e) * (1 - e));
  g.fillStyle = PAL.deep; g.fillRect(0, 0, w, bh); g.fillRect(0, h - bh, w, bh);
  if (mode === 'full') {
    const a = 0.92 * clamp01((t - 0.6) / 0.7), top = h * 0.085 + 22, x1 = w - w * 0.045 - 16;
    const l1 = vlen('拔刀斩', 30, 8), l2 = vlen('终式 · 墨 · 终焉', 20, 6), H = Math.max(l1, l2);
    g.save(); g.globalAlpha = a; g.textAlign = 'center'; g.fillStyle = PAL.ink; g.shadowColor = 'rgba(216,209,196,.95)';
    for (const blur of [8, 2]) {
      g.shadowBlur = blur;
      g.font = `30px ${KAI}`; vtext(g, '拔刀斩', x1, top + (H - l1) / 2, 30, 8);
      g.font = `20px ${KAI}`; vtext(g, '终式 · 墨 · 终焉', x1 - 36, top + (H - l2) / 2, 20, 6);
    }
    g.restore();
  }
  g.textAlign = 'right'; g.font = `13px ${KAI}`; g.fillStyle = 'rgba(216,209,196,.9)'; g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 3;
  g.fillText('空格 / E 跳过', w - 22, h - bh - 10); g.shadowBlur = 0;
  bandText(g, w, h, Math.max(bh, h * 0.06), X.title, CAP ? CAP(t, S) : X.sub);
}
function bandText(g, w, h, bh, title, sub) {
  g.textAlign = 'left'; g.font = `15px ${KAI}`; g.fillStyle = 'rgba(216,209,196,.85)';
  if (title) g.fillText(title, 16, Math.min(bh, h * 0.085) * 0.5 + 6);
  if (sub) { g.textAlign = 'center'; g.font = `14px ${HEI}`; g.fillStyle = 'rgba(234,240,242,.92)'; g.fillText(sub, w / 2, h - Math.min(bh, h * 0.085) * 0.5 + 5, w - 40); }
  g.textAlign = 'left';
}
function note(g, w) {
  if (!NOTE?.length) return;
  g.font = `13px ${HEI}`;
  const lw = Math.max(...NOTE.map(([a, b]) => g.measureText(`${a}　${b}`).width)) + 24, x = w - lw - 16, y = 80, lh = 22;   // 在标题、说明那两行之下
  g.fillStyle = 'rgba(8,11,16,.72)'; rrect(g, x, y, lw, NOTE.length * lh + 10, 8); g.fill();
  NOTE.forEach(([a, b], i) => { g.fillStyle = PAL.paper; g.fillText(a, x + 12, y + 22 + i * lh); g.textAlign = 'right'; g.fillStyle = PAL.silver; g.fillText(b, x + lw - 12, y + 22 + i * lh); g.textAlign = 'left'; });
}
function hud25(g, w, h, X) {
  const A = Q(), Fn = A.finale, f30 = A.game.boss30;
  if (Fn.active) { showLayer(g, w, h, X); return; }
  if (X.boss30) {
    hud30(g, w, h);
    if (f30?.cine?.active) { bandText(g, w, h, h * 0.1, X.title, X.sub); return; }
  }
  inkTip(g, w, h); powerSlot(g, w, h); note(g, w);
}
function rec(prefix, title, sub = '', o = {}) {
  NOTE = null; CAP = null; TIMER = false;
  const X = RF.recStart({ prefix, every: 2, w: 960, h: 540, title, sub });
  X.boss30 = !!o.boss30;
  X.extra = (g, w, h) => hud25(g, w, h, X);
  X.bare = () => !!Q().finale.active || (X.boss30 && !!Q().game.boss30?.cine?.active);
  return X;
}
function stop() { const out = RF.recStop(); Q().game.freeCam = null; NOTE = null; CAP = null; TIMER = false; return out; }
const play = (secs, fn) => RF.play(secs, fn);
// 演出的分段说明（按演出自己的时钟；收刀合拢的时刻读 Show.finishT）
function capFull(t, S) {
  const T0 = F.full, fin = S?.finishT ?? 6.8;
  if (t < T0.stagger[1]) return '敌人失衡；玩家化墨，墨痕绕到敌人身后、重新凝聚';
  if (t < T0.scroll[1]) return '画卷由脚下铺向敌人（卷边、纸纹、晕染，随地面起伏）；远 → 中 → 近三层山水显现';
  if (t < T0.walk[1]) return '一手扶鞘、一手握柄，侧身缓步接近';
  if (t < T0.draw[1]) return '快速拔刀，穿过敌人，停在它身前——敌人「已被斩中、尚未显现」';
  if (t < T0.bagua.taiji) return '背对敌人缓慢收刀；凤凰自画面左后、雷龙自右后沿弧线撞入敌人';
  if (t < T0.ribbons[0]) return '阴阳 → 八卦 → 墨线自脚下展开';
  if (t < fin) return '水墨沿阵纹涌出、旋转包围（腰间留出刀光的位置）';
  if (t < fin + 0.45) return '鍔与鞘口合拢：这一刻结算处决 · 横向银白刀光切开墨带 · 爆墨';
  return '墨浪、飞白、山水碎片、朱印；正脸定格';
}
function capCompact(t, S) {
  const C0 = F.compact, fin = S?.finishT ?? 3.05;
  const why = { wall: '身后 / 侧面贴墙', cliff: '断崖、台阶', noGround: '地面不连续', stage: '非最终阶段', large: '大型目标', bounds: '超出场地' }[S?.plan?.why] || '空间不足';
  if (t < C0.hold) return `精简演出（${why}）：原地定住`;
  if (t < C0.noto) return '出刀余势';
  if (t < fin) return '缓慢收刀；八卦阵纹、墨带先后展开';
  if (t < fin + 0.45) return '鍔与鞘口合拢：这一刻结算 · 横向银白刀光 · 爆墨';
  return '收势';
}
const capShow = (t, S) => (S?.mode === 'compact' ? capCompact(t, S) : capFull(t, S));
// 按住拔刀斩所在的槽键 secs 秒（每帧 each），不松开
function hold(secs, each) { const L = Q().loadout; L.pressSlot(L.slotOf('power'), true); play(secs, each); }
function release() { const L = Q().loadout; L.pressSlot(L.slotOf('power'), false); }
// 出刀后一直录到演出结束、镜头回到第三人称之后 after 秒（each 只在演出开始之前调用：之后的镜头交给游戏自己——演出接管、结束后平滑回到第三人称）
function untilShowEnds(after = 1.2, each = null, max = 16) {
  const Fn = Q().finale;
  let seen = false, endT = null;
  play(max, (t) => { if (Fn.active) seen = true; if (!seen) each?.(t); if (seen && !Fn.active && endT == null) endT = t; if (endT != null && t > endT + after) return false; if (!seen && t > 1.5) return false; });
  return { seen, endT };
}
const slashOf = (id0) => { const a = T.lastAct('iai_slash'); return a && a.id > id0 ? a : null; };
const bladeDmg = (a) => a?.results?.filter((x) => x.i === 0).map((x) => x.dmg) ?? [];

// =====================================================================================
// 一、墨势：积累、8 秒超时清零、第 30 刀成势（不打断连击）、成势后不预存、不因超时丢失
// =====================================================================================
export async function scnStack() {
  const A = Q(), M = A.moves, Fn = A.finale, P = A.player;
  A.TIME.hour = 10; T.skyQuiet(false);
  T.fresh();
  const es = T.foes([['shade', 1.9, 0], ['shade', 2.1, 0.9], ['shade', 2.1, -0.9]], { hp: 90000 }), pin = T.pinner(es);
  const cam = () => A.cam.set(P.heading + 0.8, 0.24, 6.0);
  cam(); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); T.run([], 0.3, pin);
  const st = { gained: [], timeoutAt: null, readyAt: null, overflow0: 0 };
  rec('r25_stack_', '墨势 · 普攻连续有效命中 30 刀成势', '每一刀真实命中敌对目标计 1——一刀打中三个也只算 1（右下：墨势签、终式格子）');
  TIMER = true;
  M.press('light', true);
  play(4.4, () => { pin(); cam(); });
  M.press('light', false);
  play(0.5, pin);
  st.gained.push(Fn.count);
  recSub(`尚未成势：距上一次有效命中满 ${F.stack.timeout} 秒（战斗时钟：打开界面、演出、过场时不走）即清零`);
  play(F.stack.timeout + 0.8, (t) => { pin(); if (Fn.count === 0 && st.timeoutAt == null) st.timeoutAt = r2(t); });
  recSub('重新连击：第 30 刀只成势、不打断连击——鞘口出现墨环，终式格子转墨，提示「墨势已成 · 满蓄力可施展终式」');
  const ov0 = Fn.stats.overflow;
  M.press('light', true);
  play(18, (t) => {
    pin(); cam();
    if (Fn.ready && st.readyAt == null) { st.readyAt = r2(t); st.actAtReady = M.act?.key; }
    if (st.readyAt != null && t > st.readyAt + 0.6) recSub('成势之后多出的命中不预存（最多一层）');
    if (st.readyAt != null && t > st.readyAt + 2.6) return false;
  });
  M.press('light', false);
  st.overflow = Fn.stats.overflow - ov0;
  play(0.9, pin);
  // 鞘口特写：墨环（成势提示）；停手之后仍在（成势后不因超时丢失）
  recSub('鞘口的墨环：停手之后仍在——成势后不会因超时丢失（自检：20 秒后仍在）');
  TIMER = false;
  const V = A.THREE.Vector3, ring = A.finFx.ring.mesh, rp = new V();
  play(4.2, (t) => {
    pin();
    ring.updateWorldMatrix(true, false); rp.setFromMatrixPosition(ring.matrixWorld);
    const side = rp.clone().sub(P.pos).setY(0).normalize(), fw = new V(Math.sin(P.heading), 0, Math.cos(P.heading));
    const a = 0.95 - t * 0.1, dir = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(fw, Math.sin(a)).normalize();
    A.game.freeCam = { pos: rp.clone().addScaledVector(dir, 1.0).add(new V(0, 0.25, 0)), at: rp.clone().add(new V(0, -0.02, 0)) };
  });
  A.game.freeCam = null;
  const out = stop();
  return { ...out, ...st, count: Fn.count, ready: Fn.ready };
}

// =====================================================================================
// 二、3 秒满蓄力：未满松开 = 普通拔刀斩（不消耗）；满 3 秒保持就绪、不自动出刀；举剑取消（不消耗）；满蓄力松开 = 终式（消耗）
// =====================================================================================
export async function scnCharge() {
  const A = Q(), M = A.moves, Fn = A.finale, P = A.player;
  A.TIME.hour = 10; T.skyQuiet(false);
  T.fresh(); Fn.debugGive();
  const es = T.foes([['shade', 3.2, 0]], { hp: 100000 }), pin = T.pinner(es);
  const cam = () => A.cam.set(P.heading + 0.95, 0.2, 5.6);
  cam(); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); T.run([], 0.3, pin);
  const st = {};
  rec('r25_charge_', '终式 · 有墨势时 3 秒满蓄力', '有墨势：按住拔刀斩所在的槽键（R；Z、鼠标中键同）纳刀蓄势');
  play(0.8, () => { pin(); cam(); });
  recSub('有墨势、蓄 2 秒就松开（不满 3 秒）：照普通拔刀斩出刀（伤害按蓄力插值），不消耗墨势');
  let id0 = M.seq;
  hold(2.0, () => { pin(); cam(); }); release();
  play(1.5, () => { pin(); cam(); });
  st.under = { blade: bladeDmg(slashOf(id0)), ready: Fn.ready };
  recSub('按住满 3 秒：外圈转银白、提示「终式 · 满蓄力（松开出刀）」；之后一直保持就绪，不自动出刀');
  let fullAt = null;
  hold(5.2, (t) => { pin(); cam(); if (fullAt == null && M.iaiCharge?.k >= 1) fullAt = r2(t); });
  st.fullAt = fullAt; st.stillCharging = !!M.iai;
  recSub('合法取消（举剑格挡）：不出刀，墨势不消耗、计数不变');
  M.press('guard', true); play(0.5, () => { pin(); cam(); }); release(); play(0.4, () => { pin(); cam(); }); M.press('guard', false);
  play(0.9, () => { pin(); cam(); });
  st.cancel = { ready: Fn.ready, count: Fn.count };
  recSub('再按住满 3 秒后松开：终式——消耗墨势（计数回 0／30），刀身那一下按满蓄力 ×2；目标气血高（不处决）');
  id0 = M.seq;
  hold(3.15, () => { pin(); cam(); }); release();
  play(2.2, () => { pin(); cam(); });
  st.ink = { blade: bladeDmg(slashOf(id0)), ready: Fn.ready, count: Fn.count, fin: slashOf(id0)?.act?.finale?.why ?? null };
  NOTE = [['未满 3 秒（2 秒）', `刀身 ${st.under.blade[0] ?? '—'} · 墨势保留`], ['满 3 秒后松开（终式）', `刀身 ${st.ink.blade[0] ?? '—'} · 墨势消耗`]];
  play(1.6, () => { pin(); cam(); });
  const out = stop();
  return { ...out, ...st };
}

// =====================================================================================
// 三、高血量目标的强化伤害：普通满蓄力 150 → 终式 300（×2 只在刀身那一下乘一次；剑气不加倍）；目标比例远高于 10%，不处决
// =====================================================================================
export async function scnDamage() {
  const A = Q(), M = A.moves, Fn = A.finale, P = A.player;
  A.TIME.hour = 10; T.skyQuiet(false);
  T.fresh();
  const [e] = T.foes([['shade', 3.3, 0]], { hp: 100000 }), pin = T.pinner([e]);
  const cam = () => A.cam.set(P.heading + 1.05, 0.2, 6.2);
  cam(); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); T.run([], 0.3, pin);
  const st = {};
  rec('r25_damage_', '强化伤害 · 高血量目标（不处决）', `没有墨势：普通拔刀斩蓄满 ${PC.iai.max} 秒松开`);
  play(0.6, () => { pin(); cam(); });
  let id0 = M.seq, hp0 = e.hp;
  hold(PC.iai.max + 0.1, () => { pin(); cam(); }); release();
  play(1.6, () => { pin(); cam(); });
  st.normal = { blade: bladeDmg(slashOf(id0)), total: Math.round(hp0 - e.hp) };
  NOTE = [['普通满蓄力', `刀身 ${st.normal.blade[0]} · 剑气 ${st.normal.total - st.normal.blade[0]} · 共 ${st.normal.total}`]];
  recSub(`有墨势：蓄满 ${F.charge.full} 秒松开——终式：刀身 = 满蓄力伤害 × ${F.dmgK}（剑气不加倍）；当前阶段剩余比例远高于 10%：只吃强化伤害`);
  Fn.debugGive(); play(0.7, () => { pin(); cam(); });
  id0 = M.seq; hp0 = e.hp;
  hold(F.charge.full + 0.15, () => { pin(); cam(); }); release();
  play(1.8, () => { pin(); cam(); });
  const a = slashOf(id0);
  st.ink = { blade: bladeDmg(a), total: Math.round(hp0 - e.hp), why: a?.act?.finale?.why ?? null, ratio: r2(e.hp / e.maxHp) };
  NOTE.push([`终式（× ${F.dmgK}）`, `刀身 ${st.ink.blade[0]} · 剑气 ${st.ink.total - st.ink.blade[0]} · 共 ${st.ink.total}`], ['目标剩余比例', `${Math.round(st.ink.ratio * 100)}%（> 10%，不处决）`]);
  play(1.8, () => { pin(); cam(); });
  const out = stop();
  return { ...out, ...st };
}

// =====================================================================================
// 四、普通敌人的完整处决（约 8 秒，不含蓄力）
// =====================================================================================
export async function scnFull({ hp = 8 } = {}) {
  const A = Q(), Fn = A.finale, P = A.player;
  A.TIME.hour = 10; T.skyQuiet(false);
  T.fresh(); Fn.debugGive();
  const [e] = T.foes([['shade', 3.2, 0]], { hp: 100 }); e.hp = hp;
  const cam = () => A.cam.set(P.heading + 0.7, 0.2, 6.0);
  cam(); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); T.run([], 0.3);
  rec('r25_full_', '完整处决 · 普通敌人', `墨势满蓄力出刀；刀身真实命中的主目标当前阶段剩 ${hp}%（≤ 10%）、可处决 → 完整的水墨龙凤处决`);
  CAP = capShow;
  play(0.6, cam);
  hold(F.charge.full + 0.15, cam); release();
  const rec0 = Fn.rec;
  const r = untilShowEnds(1.6, cam);
  const R = Fn.rec !== rec0 ? Fn.rec : null;
  const out = stop();
  return { ...out, ...r, rec: R && { mode: R.mode, why: R.why, state: R.state, src: R.src, committed: R.committed }, alive: e.alive };
}

// =====================================================================================
// 五、第三十层一阶段（非最终）：精简演出 → 只结束当前阶段 → 剑尊正常的转阶段过场 → 二阶段（不给胜利、不发奖励）
// =====================================================================================
export async function scnBoss({ ratio = 0.08 } = {}) {
  const B24 = await import('./r24_tests.js');
  const A = Q(), Fn = A.finale;
  if (A.world.name !== 'boss30') await B24.setup({ ai: false });
  const f = A.game.boss30;
  await B24.fight({ ai: false });
  if (f.phase !== 1) f.debug.phase(1);
  f.debugUsed = false;
  const b = f.root, yaw = f.rig.yaw;
  B24.place(b.x + Math.sin(yaw) * 3.0, b.z + Math.cos(yaw) * 3.0);
  f.unit.hp = Math.round(f.unit.maxHp * ratio);
  T.equip(); Fn.resetStack('film'); Fn.debugGive();
  A.moves.lock = f.unit;            // 锁定剑尊：蓄势时人朝着它，不随侧面的镜头转
  const P = A.player, cam = () => A.cam.set(P.heading + 0.75, 0.2, 6.4);
  cam(); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); T.run([], 0.3);
  f.cine.forceSkip = false;
  rec('r25_boss_', '第三十层 · 一阶段（非最终）处决 → 正常转阶段', `剑尊一阶段剩 ${Math.round(ratio * 100)}%（按当前阶段的气血池 ${f.unit.maxHp}，不按总气血）：满蓄力终式`, { boss30: true });
  CAP = capShow;
  play(0.7, cam);
  hold(F.charge.full + 0.15, cam); release();
  const rec0 = Fn.rec;
  let showSeen = false, cineSeen = false, cineEnd = null;
  play(20, (t) => {
    if (Fn.active) showSeen = true;
    if (showSeen && !Fn.active && !cineSeen && !f.cine.active) recSub('演出交还：只结束当前阶段——随后是剑尊正常的转阶段过场（不给胜利、不发奖励）');
    if (f.cine.active) { cineSeen = true; recSub('剑尊正常的转阶段过场（终式处决只结束当前阶段）'); }
    if (cineSeen && !f.cine.active && cineEnd == null) { cineEnd = t; recSub(`二阶段：气血另起一条（${Math.ceil(f.unit.hp)} / ${f.unit.maxHp}）——战斗照常继续`); }
    if (!showSeen) cam();
    if (cineEnd != null && t > cineEnd + 2.2) return false;
    if (!showSeen && t > 1.5) return false;
  });
  const R = Fn.rec !== rec0 ? Fn.rec : null;
  const out = stop();
  f.cine.forceSkip = true; A.moves.lock = null;
  return { ...out, rec: R && { mode: R.mode, why: R.why, stage: R.stage, state: R.state, final: R.final }, phase: f.phase, state: f.state, hp: Math.round(f.unit.hp), maxHp: f.unit.maxHp, rewarded: !!A.ui.panelOpen };
}

// =====================================================================================
// 六、墙边：完整演出放不下（身后起点、穿行路径过不了墙体射线）→ 原地精简演出（不穿墙、不瞬移、不改碰撞）
// =====================================================================================
export async function scnWall() {
  const A = Q(), Fn = A.finale, cw = A.cw, P = A.player;
  if (A.world.name !== 'surface') { await A.game.switchWorld('surface'); T.run([], 0.5); T.equip(); }
  A.TIME.hour = 10; T.skyQuiet(false);
  const ang = 1.374, d = { x: Math.sin(ang), y: 0, z: Math.cos(ang) }, o = new A.THREE.Vector3(0, 15.2, 26), tw = cw.ray(o, d, 40);
  T.fresh({ x: o.x + d.x * (tw - 4.3), z: o.z + d.z * (tw - 4.3) }, ang); Fn.debugGive();
  const [e] = T.foes([['shade', 3.0, 0]], { hp: 100 }); e.hp = 8;
  // 锁定（Tab）它：蓄势时人朝着锁定的目标，不随侧面的镜头转（没锁定时蓄势会转向镜头所看的方向——那样换了一条轴线，偏 50° 的完整路线就放得下了）
  A.moves.lock = e;
  const cam = () => A.cam.set(P.heading + 1.15, 0.24, 6.6);
  cam(); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); T.run([], 0.3);
  rec('r25_wall_', '墙边 · 精简演出', '敌人身后贴着屋墙：身后起点与穿行路径过不了墙体射线 → 完整演出放不下，原地精简演出（不穿墙、不瞬移、不改碰撞）');
  CAP = capShow;
  play(0.7, cam);
  hold(F.charge.full + 0.15, cam); release();
  const rec0 = Fn.rec;
  const r = untilShowEnds(1.6, cam);
  const R = Fn.rec !== rec0 ? Fn.rec : null;
  const out = stop();
  A.moves.lock = null;
  return { ...out, ...r, rec: R && { mode: R.mode, why: R.why, state: R.state }, alive: e.alive, wallDist: r2(tw) };
}

// =====================================================================================
// 合成音轨：录像期间记下的合成音（音效库里没有录音的）与持续音，用游戏同一段合成代码（SoundFx 的 s_* / loop）在 OfflineAudioContext 里重放；
// 总线同游戏：干声 + 同一条混响（0.32），不经总音量与压限（混音时与录音一起过）；写成 32 位浮点 WAV 上传为 docs/screenshots/r25stem_<name>.jpg（取出后改名 .wav）
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
  // 持续音（八卦低鸣）：loop() 以 currentTime 起，按记下的时刻挂起离线渲染再开（同一渲染块的合并）
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
  await fetch(`/__shot/r25stem_${name}`, { method: 'POST', body: blob });
  ev.stemNames = Object.keys(names).filter((k) => !k.startsWith('loop:'));
  return { names, skipped, peak: r2(peak), secs: r2(buf.length / SR), bytes: blob.size };
}
// 32 位浮点 WAV（fmt 18 字节 + fact）
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
