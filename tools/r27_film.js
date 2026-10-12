// 第二十七轮录像：「墨里终焉」——三段不剪辑的实录：
//   normal —— 普通敌人：成势、3 秒满蓄力出刀、确认处决 → 16 秒完整演出 → 交还、结算提示；
//   b30p1  —— 第三十层一阶段（非最终）：同一套 16 秒演出 → 只结束当前阶段 → 剑尊正常的转阶段过场 → 二阶段照常开打；
//   b30p2  —— 第三十层二阶段（最终）：同一套 16 秒演出 → 胜利过场 → 结算面板。
// 都按真实的输入、出招、结算、演出代码推进（__qinglan.tick），帧在页面里同步截下（tools/r21_film.js），录完分批上传。
// 画面里的界面（游戏的界面是网页元素，截不进画布）按游戏里同一份数据画进录像：平时的墨势签与剑诀格子、剑尊的血条与过场字卡、结算面板；
// 演出中只有上下黑边与「空格 / E 跳过」（同游戏）——另在上黑边里加一行录像标注：自确认处决起的时刻与这一段的名称（游戏里没有这行字）。
// 声音：音效库的录音、合成音（synthStem）、音乐（演出音乐从 33 秒处起、场景的战斗音乐与压低）都照常记下，离线混成音轨（tools/r19_mix_audio.py）。
// 用法（预览）：const F = await import('/tools/r27_film.js?v=' + Date.now()); await F.setup();
//   setTimeout(async () => { const r = await F.scnNormal(); const s = await F.synthStem('normal'); const n = await F.flush(); window.__film = { r, s, n }; }, 0);
import * as RF from './r21_film.js';
import * as T from './r27_tests.js';
import * as T25 from './r25_tests.js';
import { hud30 } from './r24_film.js';
import { FINALE as F } from '/src/game/inkFinaleConfig.js';
import { LOADOUT } from '/src/game/combatConfig.js';

const Q = () => window.__qinglan;
const r2 = (v) => +(+v).toFixed(2), r3 = (v) => +(+v).toFixed(3);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const { recSub } = RF;
export async function setup() { return T.setup(); }

const PAL = { deep: '#080b10', ink: '#15191f', gray: '#46505a', paper: '#d8d1c4', silver: '#eaf0f2', red: '#b63832' };
const KAI = '"KaiTi","STKaiti",serif', HEI = '"Microsoft YaHei",sans-serif';
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// =====================================================================================
// 录像里的界面
// =====================================================================================
// 墨势签（同 InkHud）
function inkTip(g, w, h) {
  const A = Q(), Fn = A.finale, I = A.moves.iai;
  if (!Fn.enabled) return;
  let text, mode = 'count', k = 0;
  if (I && Fn.ready) { const full = F.charge.full; k = Math.min(1, I.charge / full); mode = k >= 1 ? 'full' : 'charge'; text = k >= 1 ? F.text.full : `${F.text.charging} ${I.charge.toFixed(1)}／${full.toFixed(1)} 秒`; }
  else if (Fn.ready) { mode = 'ready'; text = F.text.ready; }
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
}
// 剑诀栏里拔刀斩那一格（装备着升级形态即为「墨」字，格下「终焉」）
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
  // 同游戏的剑诀格（combatHud）：格子正中是图标字「墨」，右上角是槽键，格子下面一行小字「终焉」
  g.textAlign = 'center';
  g.font = `${ready ? 700 : 400} 24px ${KAI}`; g.fillStyle = ready ? '#e6e0d4' : PAL.ink; g.fillText(Fn.enabled ? F.glyph : '拔', cx, cy + 8.5);
  g.font = `600 10px ${HEI}`; const kw = g.measureText(LOADOUT.labels[i]).width + 7;
  g.fillStyle = '#f7f3ea'; rrect(g, cx + r - 12, cy - r - 6, kw, 15, 3); g.fill();
  g.fillStyle = '#22272a'; g.fillText(LOADOUT.labels[i], cx + r - 12 + kw / 2, cy - r + 5);
  g.font = `400 13px ${KAI}`; g.fillStyle = 'rgba(244,239,228,.95)'; g.shadowColor = '#000'; g.shadowBlur = 3;
  g.fillText(Fn.enabled ? F.short : '拔刀斩', cx, cy + r + 15); g.shadowBlur = 0;
  g.textAlign = 'left';
}
// 演出的分段（统一时间线；用于录像标注）
export function segOf(t, S) {
  const T0 = F.show, fin = S?.finishT ?? 13.2;
  if (t < T0.land.wave[0]) return '确认处决 · 镜头接管，敌人居中；玩家化墨，在敌人身后凝聚';
  if (t < T0.scroll.knot[0]) return '山水由玩家处铺开（近 → 中 → 远）· 原场景在墨雾幕后被替换';
  if (t < T0.walk[0]) return '绳结解开，画卷由脚下展向敌人 · 书法「墨里终焉」逐笔写出';
  if (t < T0.draw[0]) return '一手扶鞘、一手按柄，缓步接近';
  if (t < T0.sheathe) return '快速拔刀穿行，停在敌人身前';
  if (t < T0.birds.phoenix[0]) return '缓慢收刀开始 · 镜头转到身前四分之三';
  if (t < T0.crash[0]) return '凤自左后、龙自右后同时出现，沿弧线汇向敌人';
  if (t < T0.ribbons[0]) return '龙凤砸入：墨柱、墨浪、墨裂、余震（凤先、龙后）· 化作墨流 · 八卦展开（阴阳 → 八卦 → 墨线）';
  if (t < fin) return '墨带由腿 → 躯干 → 肩缠绕上升 · 收刀继续';
  if (t < fin + 0.25) return '刀镡合拢：收刀清响 · 横向刀光 · 这一刻提交结算';
  if (t < T0.freeze[0]) return '爆墨：深墨核心收缩再爆开、墨浪、飞白、几点朱红 · 龙凤由余墨重新凝成';
  if (t < T0.exit[0]) return '正脸定格 · 凤左、龙右 · 书法「终焉」';
  return '字、画卷、山水退场 · 交还';
}
let LABEL = '';
// 演出中：上下黑边（同游戏的 .ink-ov：0.35 秒展开）、右下「空格 / E 跳过」；上黑边里一行录像标注（时刻与分段）
function showLayer(g, w, h) {
  const Fn = Q().finale, S = Fn.show, t = S ? S.t : 16;
  const e = clamp01(t / 0.35), bh = h * 0.085 * (1 - (1 - e) * (1 - e));
  g.fillStyle = PAL.deep; g.fillRect(0, 0, w, bh); g.fillRect(0, h - bh, w, bh);
  g.textAlign = 'right'; g.font = `13px ${KAI}`; g.fillStyle = 'rgba(216,209,196,.9)'; g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 3;
  g.fillText(F.text.skip, w - 22, h - bh - 10); g.shadowBlur = 0;
  // 录像标注（游戏里没有）
  g.textAlign = 'left'; g.font = `13px ${HEI}`; g.fillStyle = 'rgba(234,240,242,.82)';
  const line = `【录像标注】${LABEL} · 确认后 ${t.toFixed(2)} 秒 · ${segOf(t, S)}`;
  g.fillText(line, 14, Math.max(16, bh * 0.62), w - 28);
}
// 结算面板（网页元素）：按面板里的文字画进录像
function panelLayer(g, w, h) {
  const A = Q();
  if (!A.ui.panelOpen) return;
  const p = document.querySelector('#panel'); if (!p) return;
  const title = p.querySelector('h2')?.childNodes[0]?.textContent || '', sub = p.querySelector('h2 small')?.textContent || '';
  const verdict = p.querySelector('.ar-verdict b')?.textContent || '', vtext = p.querySelector('.ar-verdict span')?.textContent || '';
  const kv = [...p.querySelectorAll('.kv > b')].map((b) => [b.textContent, b.nextElementSibling?.textContent || '']);
  const pw = 560, ph = 120 + kv.length * 26, x = (w - pw) / 2, y = (h - ph) / 2;
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(244,239,228,.97)'; rrect(g, x, y, pw, ph, 10); g.fill();
  g.textAlign = 'left'; g.font = `20px ${KAI}`; g.fillStyle = '#2b2a27'; g.fillText(title, x + 22, y + 34);
  g.font = `13px ${HEI}`; g.fillStyle = '#6b6152'; g.fillText(sub, x + 26 + g.measureText(title).width * 1.5, y + 33);
  if (verdict) { g.font = `30px ${KAI}`; g.fillStyle = '#9b2a2a'; g.fillText(verdict, x + 22, y + 76); g.font = `16px ${KAI}`; g.fillStyle = '#3a2b1c'; g.fillText(vtext, x + 62, y + 72); }
  kv.forEach(([a, b], i) => { g.font = `13px ${HEI}`; g.fillStyle = '#6b6152'; g.fillText(a, x + 26, y + 106 + i * 26); g.fillStyle = '#2b2a27'; g.fillText(b, x + 150, y + 106 + i * 26, pw - 170); });
}
function hud27(g, w, h, X) {
  const A = Q(), Fn = A.finale, f30 = A.game.boss30;
  if (Fn.active) { showLayer(g, w, h); return; }
  if (X.boss30) {
    hud30(g, w, h);
    if (f30?.cine?.active) return;
  }
  if (A.ui.panelOpen) { panelLayer(g, w, h); return; }
  inkTip(g, w, h); powerSlot(g, w, h);
}

// =====================================================================================
// 录制：音乐（演出音乐 cue、场景音乐、压低）照常放，同时记下来；演出中的提示与浮字按游戏的规则（演出里不显示，提示攒到退场之后）
// =====================================================================================
let MUS = null;
function rec(prefix, title, sub = '', o = {}) {
  LABEL = o.label || title;
  const A = Q(), S = A.game.sound, Fn = A.finale;
  const X = RF.recStart({ prefix, every: 2, w: 960, h: 540, title, sub });
  X.boss30 = !!o.boss30;
  // 录像由脚本逐帧推进：预览的标签页在后台（document.hidden），游戏会当作暂停而停住演出音乐——录像期间按「没暂停」算
  const paused0 = Fn.paused; Fn.paused = () => false;
  X.extra = (g, w, h) => hud27(g, w, h, X);
  X.bare = () => !!Fn.active || (X.boss30 && !!A.game.boss30?.cine?.active) || A.ui.panelOpen;
  // 浮字：演出中游戏把伤害数字藏起（CSS），录像也不画
  const pop1 = A.combat.popNumber;
  A.combat.popNumber = function (...args) { if (Fn.active) return REC_POP0.call(this, ...args); return pop1.apply(this, args); };
  const REC_POP0 = X.pop0;
  // 提示：演出中由演出攒着、退场后才报——录像按真正报出的时刻记（包住演出的 rawToast），演出中调用的 ui.toast 不记
  const toast1 = A.ui.toast, raw0 = Fn.rawToast;
  A.ui.toast = function (html) { if (Fn.active) return X.toast0.call(this, html); return toast1.call(this, html); };
  Fn.rawToast = (html) => { X.toasts.push({ txt: String(html).replace(/<br\s*\/?>/g, '　').replace(/<[^>]+>/g, ''), t: 0 }); return raw0?.(html); };
  // 音乐
  MUS = { tracks: [], duck: [], keep: {} };
  const now = () => r3(X.t);
  for (const k of ['cue', 'cueStop', 'cuePause', 'cueResume', 'cueGain', 'music', 'stopMusic', 'duckMusic']) MUS.keep[k] = Object.prototype.hasOwnProperty.call(S, k) ? S[k] : null;
  const call = (k, self, args) => Object.getPrototypeOf(S)[k].apply(self, args);
  S.cue = function (name, url, op = {}) { MUS.tracks.push({ kind: 'cue', name, url, t: now(), at: op.at ?? 0, gain: op.gain ?? 1, fadeIn: op.fadeIn ?? 0.2, pauses: [], stopT: null }); return call('cue', this, [name, url, op]); };
  S.cuePause = function (name) { const tr = [...MUS.tracks].reverse().find((x) => x.kind === 'cue' && x.name === name && x.stopT == null); if (tr && !(tr.pauses.length && tr.pauses[tr.pauses.length - 1][1] == null)) tr.pauses.push([now(), null]); return call('cuePause', this, [name]); };
  S.cueResume = function (name, pos) { const tr = [...MUS.tracks].reverse().find((x) => x.kind === 'cue' && x.name === name && x.stopT == null); const p = tr?.pauses[tr.pauses.length - 1]; if (p && p[1] == null) p[1] = now(); return call('cueResume', this, [name, pos]); };
  S.cueGain = function (name, k = 1, time = 0.1) { const tr = [...MUS.tracks].reverse().find((x) => x.kind === 'cue' && x.name === name && x.stopT == null); if (tr) (tr.gains ||= []).push([now(), k, time]); return call('cueGain', this, [name, k, time]); };
  S.cueStop = function (name, fade = 0.5) { const tr = [...MUS.tracks].reverse().find((x) => x.kind === 'cue' && x.name === name && x.stopT == null); if (tr) { tr.stopT = now(); tr.stopFade = fade; const p = tr.pauses[tr.pauses.length - 1]; if (p && p[1] == null) p[1] = now(); } return call('cueStop', this, [name, fade]); };
  S.music = function (name, url, op = {}) { const live = MUS.tracks.find((x) => x.kind === 'track' && x.name === name && x.stopT == null); if (!live) MUS.tracks.push({ kind: 'track', name, url, t: now(), at: op.at ?? 0, gain: op.gain ?? 1, fadeIn: op.fade ?? 1.5, loop: !!op.loop, stopT: null }); return call('music', this, [name, url, op]); };
  S.stopMusic = function (name = null, fade = 1.5) { for (const tr of MUS.tracks) if (tr.kind === 'track' && tr.stopT == null && (!name || tr.name === name)) { tr.stopT = now(); tr.stopFade = fade; } return call('stopMusic', this, [name, fade]); };
  S.duckMusic = function (k = 1, time = 0.6) { MUS.duck.push([now(), k, time]); return call('duckMusic', this, [k, time]); };
  // 开录时已在放的场景音乐（战斗曲）：从录像开头算起（位置未知，按 0 秒起；循环）；o.music === false（慢放片段）不记
  if (o.music !== false) for (const [name, Tk] of S.tracks || []) MUS.tracks.push({ kind: 'track', name, url: Tk.url, t: 0, at: 0, gain: Tk.g?.gain?.value ?? 0.7, fadeIn: 0.02, loop: !!Tk.el?.loop, stopT: null, pre: true });
  X.restoreHooks = () => {
    A.combat.popNumber = pop1; A.ui.toast = toast1; Fn.rawToast = raw0; Fn.paused = paused0;
    for (const [k, v] of Object.entries(MUS.keep)) { if (v) S[k] = v; else delete S[k]; }
  };
  return X;
}
function stop() {
  const A = Q(), X = window.__r21rec;
  X?.restoreHooks?.();
  const out = RF.recStop();
  A.game.freeCam = null;
  const ev = window.__recEvents;
  if (ev && MUS) { ev.music = MUS.tracks; ev.duck = MUS.duck; ev.musicVol = A.game.sound.musicVol; }
  MUS = null;
  return out;
}
const play = (secs, fn) => RF.play(secs, fn);
function hold(secs, each) { const L = Q().loadout; L.pressSlot(L.slotOf('power'), true); play(secs, each); }
function release() { const L = Q().loadout; L.pressSlot(L.slotOf('power'), false); }
// 时间线：从演出的事件记录里取各个时刻（演出时钟）
function timeline(Fn, fromN) {
  const ev = Fn.events.filter((e) => e.n > fromN), out = {};
  for (const e of ev) {
    if (e.kind === 'show') out.confirm = 0;
    if (e.kind === 'sfx' && out[e.name] == null) out[e.name] = e.t;
    if (['pass', 'freeze', 'exit', 'inkTarget', 'musicPause', 'musicResume'].includes(e.kind) && out[e.kind] == null) out[e.kind] = e.t;
    if (e.kind === 'end') out.end = e.t;
  }
  return out;
}
// 录到演出交还之后 after 秒（each 只在演出开始之前调用）；返回演出开始、交还的录像时刻
function untilShowEnds(after = 2.0, each = null, max = 24, also = null) {
  const Fn = Q().finale;
  let seen = false, startT = null, endT = null;
  play(max, (t) => {
    if (Fn.active && !seen) { seen = true; startT = t; }
    if (!seen) each?.(t);
    if (seen && !Fn.active && endT == null) endT = t;
    also?.(t, seen, endT);
    if (endT != null && t > endT + after) return false;
    if (!seen && t > 1.5) return false;
  });
  return { seen, startT, endT };
}

// =====================================================================================
// 一、普通敌人：完整 16 秒
// =====================================================================================
export async function scnNormal({ hp = 8, pre = 'r27' } = {}) {
  const A = Q(), Fn = A.finale, P = A.player;
  A.TIME.hour = 10; T.skyQuiet(false);
  T.fresh(); Fn.debugGive();
  const [e] = T.foes([['shade', 3.2, 0]], { hp: 100 }); e.hp = hp;
  A.moves.lock = e;
  const cam = () => A.cam.set(P.heading + 0.7, 0.2, 6.0);
  cam(); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); T.run([], 0.3);
  const n0 = Fn.evN || 0;
  rec(`${pre}_normal_`, '墨里终焉 · 普通敌人', `墨势已成 → 满蓄力 3 秒出刀；刀身真实命中的主目标剩 ${hp}%（≤ 10%）→ 16 秒完整处决`, { label: '普通敌人' });
  play(0.8, cam);
  hold(F.charge.full + 0.15, cam); release();
  const rec0 = Fn.rec;
  const r = untilShowEnds(2.2, cam);
  const R = Fn.rec !== rec0 ? Fn.rec : null;
  const tl = timeline(Fn, n0);
  const out = stop();
  A.moves.lock = null;
  return { ...out, ...r, tl, rec: R && { level: R.level, why: R.why, state: R.state, src: R.src, committed: R.committed }, alive: e.alive };
}

// =====================================================================================
// 二、第三十层一阶段（非最终）：16 秒演出 → 只结束当前阶段 → 剑尊正常的转阶段过场 → 二阶段照常开打
// 三、第三十层二阶段（最终）：16 秒演出 → 胜利过场 → 结算面板
// =====================================================================================
async function boss30At(phase, ratio) {
  const B24 = await import('./r24_tests.js');
  const A = Q(), Fn = A.finale;
  if (A.world.name !== 'boss30') await B24.setup({ ai: false });
  const f = A.game.boss30;
  f.cine.forceSkip = true;
  await B24.fight({ ai: false });
  if (f.phase !== phase) f.debug.phase(phase);
  f.debugUsed = false; f.god = false;
  const b = f.root, yaw = f.rig.yaw;
  B24.place(b.x + Math.sin(yaw) * 3.4, b.z + Math.cos(yaw) * 3.4);
  f.unit.hp = Math.round(f.unit.maxHp * ratio);
  T.equip(); Fn.resetStack('film'); Fn.debugGive();
  A.moves.lock = f.unit;
  f.musicTo?.('battle');
  return f;
}
export async function scnBoss30P1({ ratio = 0.08, pre = 'r27' } = {}) {
  const A = Q(), Fn = A.finale, P = A.player;
  const f = await boss30At(1, ratio);
  const cam = () => A.cam.set(P.heading + 0.75, 0.2, 6.6);
  cam(); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); T.run([], 0.3);
  f.cine.forceSkip = false;
  const n0 = Fn.evN || 0;
  rec(`${pre}_b30p1_`, '墨里终焉 · 第三十层一阶段（非最终）', `剑尊一阶段剩 ${Math.round(ratio * 100)}%（按当前阶段的气血池）：同一套 16 秒演出，只结束当前阶段`, { boss30: true, label: 'Boss 非最终阶段' });
  play(0.8, cam);
  hold(F.charge.full + 0.15, () => { cam(); f.B.gapT = 99; }); release();
  const rec0 = Fn.rec;
  let cineAt = null, cineEnd = null;
  const r = untilShowEnds(0, cam, 40, (t, seen, endT) => {
    if (f.cine.active && cineAt == null) { cineAt = t; recSub('演出交还 → 剑尊正常的转阶段过场（墨里终焉只结束当前阶段）'); }
    if (cineAt != null && !f.cine.active && cineEnd == null) { cineEnd = t; recSub(`二阶段：气血另起一条（${Math.ceil(f.unit.hp)} / ${f.unit.maxHp}）——战斗照常继续`); }
  });
  // 交还之后：录到转阶段过场放完、二阶段开打几秒
  if (cineEnd == null) play(30, (t) => { if (f.cine.active && cineAt == null) cineAt = r.endT + t; if (cineAt != null && !f.cine.active) { cineEnd = r.endT + t; recSub(`二阶段：气血另起一条（${Math.ceil(f.unit.hp)} / ${f.unit.maxHp}）——战斗照常继续`); return false; } });
  f.debug.ai?.(true);
  play(3.0);
  const R = Fn.rec !== rec0 ? Fn.rec : null;
  const tl = timeline(Fn, n0);
  const out = stop();
  f.cine.forceSkip = true; f.debug.ai?.(false); A.moves.lock = null;
  return { ...out, ...r, cineAt: cineAt != null ? r2(cineAt) : null, cineEnd: cineEnd != null ? r2(cineEnd) : null, tl, rec: R && { level: R.level, stage: R.stage, final: R.final, state: R.state }, phase: f.phase, state: f.state, hp: Math.round(f.unit.hp), maxHp: f.unit.maxHp };
}
export async function scnBoss30P2({ ratio = 0.08, pre = 'r27' } = {}) {
  const A = Q(), Fn = A.finale, P = A.player;
  const f = await boss30At(2, ratio);
  const cam = () => A.cam.set(P.heading + 0.75, 0.2, 6.6);
  cam(); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); T.run([], 0.3);
  f.cine.forceSkip = false;
  const n0 = Fn.evN || 0;
  rec(`${pre}_b30p2_`, '墨里终焉 · 第三十层二阶段（最终）', `剑尊二阶段剩 ${Math.round(ratio * 100)}%：同一套 16 秒演出 → 收刀合拢时整场胜利 → 胜利过场 → 结算`, { boss30: true, label: 'Boss 最终阶段' });
  play(0.8, cam);
  hold(F.charge.full + 0.15, () => { cam(); f.B.gapT = 99; }); release();
  const rec0 = Fn.rec;
  let cineAt = null, panelAt = null;
  const r = untilShowEnds(0, cam, 40);
  play(40, (t) => {
    if (f.cine.active && cineAt == null) { cineAt = r.endT + t; recSub('演出交还 → 胜利过场'); }
    if (A.ui.panelOpen && panelAt == null) { panelAt = r.endT + t; recSub('结算面板（奖励在演出与过场之后才发放）'); }
    if (panelAt != null && t > panelAt - r.endT + 3.0) return false;
  });
  const R = Fn.rec !== rec0 ? Fn.rec : null;
  const tl = timeline(Fn, n0);
  const panel = A.ui.panelOpen ? document.querySelector('#panel .ar-verdict')?.textContent : null;
  const out = stop();
  if (A.ui.panelOpen) A.ui.closePanel();
  f.cine.forceSkip = true; A.moves.lock = null;
  return { ...out, ...r, cineAt: cineAt != null ? r2(cineAt) : null, panelAt: panelAt != null ? r2(panelAt) : null, panel, tl, rec: R && { level: R.level, stage: R.stage, final: R.final, state: R.state }, state: f.state };
}

// =====================================================================================
// 第二十八轮：慢放片段（普通敌人）——演出先不录、推到 from 秒，再按 k 倍速录到 to 秒（游戏每一小步推进 k / 60 秒，录像仍是每秒 30 帧）；
// 声音照常记（各自原速放），音乐不记（原速的音乐对不上慢放的画面）
// =====================================================================================
export async function scnSlow({ hp = 8, from = 10.15, to = 11.9, k = 0.5, pre = 'r28', name = 'slow', title = '墨里终焉 · 龙凤砸入（慢放）', sub = '' } = {}) {
  const A = Q(), Fn = A.finale, P = A.player;
  A.TIME.hour = 10; T.skyQuiet(false);
  T.fresh(); Fn.debugGive();
  const [e] = T.foes([['shade', 3.2, 0]], { hp: 100 }); e.hp = hp;
  A.moves.lock = e;
  T.charge(F.charge.full + 0.15);
  for (let i = 0; i < 120 && !Fn.show; i++) A.tick(1 / 60, 1, false);
  if (!Fn.show) return { err: 'no show' };
  T.to(from);
  rec(`${pre}_${name}_`, title, sub || `${k} 倍慢放：演出 ${from}–${to} 秒（凤 10.5、龙 10.7 秒砸入）；音乐不随慢放，这一段只有音效`, { label: `慢放 ${k}×`, music: false });
  const n = Math.round(((to - from) / k) * 60);
  for (let i = 0; i < n && Fn.show && Fn.show.t < to; i++) RF.recTick((1 / 60) * k);
  const out = stop();
  // 录像的时钟按游戏时间走（每一小步 k / 60 秒），录像本身每秒 30 帧：音效、循环声、音乐记录的时刻都换成录像里的秒（÷ k），声音各自原速放
  const ev = window.__recEvents, sc = (v) => (v == null ? v : r3(v / k));
  if (ev) {
    for (const e of ev.events) { e.t = sc(e.t); if (e.stopT != null) e.stopT = sc(e.stopT); }
    for (const l of ev.loops || []) l.t = sc(l.t);
    for (const tr of ev.music || []) { tr.t = sc(tr.t); tr.stopT = sc(tr.stopT); for (const pz of tr.pauses || []) { pz[0] = sc(pz[0]); pz[1] = sc(pz[1]); } for (const gn of tr.gains || []) gn[0] = sc(gn[0]); }
    for (const d of ev.duck || []) d[0] = sc(d[0]);
    ev.secs = r2(ev.secs / k); ev.slow = k;
  }
  while (Fn.active) A.tick(1 / 60, 1, false);
  A.moves.lock = null;
  return { ...out, secs: ev ? ev.secs : out.secs, from, to, k };
}

// =====================================================================================
// 第二十九轮：通用的终结——不论哪种招式的致命一击（群战的最后一个、首领的最后一条命）都放这段演出，不需要墨势
// 普攻连按到出现演出（或 max 秒）：每 every 秒按一下左键、0.1 秒后松开；each 每帧调用（镜头）
// =====================================================================================
function lightUntil(stop, { max = 6, every = 0.42, each = null } = {}) {
  const M = Q().moves;
  let next = 0, rel = null;
  play(max, (t) => {
    each?.(t);
    if (rel != null && t >= rel) { M.press('light', false); rel = null; }
    if (stop()) { if (rel != null) { M.press('light', false); rel = null; } return false; }
    if (t >= next) { M.press('light', true); rel = t + 0.1; next = t + every; }
  });
  M.press('light', false);
}
// 一、演武场（正式切磋）：对手气血见底，普攻打死他 → 16 秒处决（不需要墨势）→ 收刀时击倒 → 演出交还之后演武场判胜
export async function scnArena({ pre = 'r29', name = 'arena', opp = 'disciple', diff = 'easy', ratio = 0.04 } = {}) {
  const A = Q(), Fn = A.finale, P = A.player, Ar = A.arena;
  A.TIME.hour = 10; T.skyQuiet(false);
  if (A.ui.panelOpen) A.ui.closePanel();
  if (Ar.S) Ar.teardown(Ar.S);
  T.fresh(); Fn.resetStack('film');
  const sel = { opp, diff, mode: 'formal' };
  await Ar.prepare(sel); Ar.enter(sel);
  for (let i = 0; i < 80 && !(Ar.S && Ar.S.phase === 'countdown'); i++) await new Promise((r) => setTimeout(r, 150));
  let n = 0; while (Ar.S && Ar.S.phase !== 'fight' && n++ < 400) A.tick(1 / 60, 1, false);
  const S = Ar.S;
  if (!S || S.phase !== 'fight') return { err: 'no fight' };
  const d = S.duelist;
  d.active = false; d.setGuard?.(false); d.hp = Math.max(1, Math.round(d.maxHp * ratio)); d.bar.set(d.hp / d.maxHp);
  // 玩家站到对手身前 1.7 米、面向他
  const yaw = Math.atan2(d.pos.x - P.pos.x, d.pos.z - P.pos.z);
  P.place(d.pos.x - Math.sin(yaw) * 1.7, d.pos.z - Math.cos(yaw) * 1.7, yaw, d.pos.y); P.heading = yaw;
  A.moves.lock = d;
  const cam = () => A.cam.set(P.heading + 0.7, 0.22, 6.2);
  cam(); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); T.run([], 0.3);
  const n0 = Fn.evN || 0;
  rec(`${pre}_${name}_`, '墨里终焉 · 演武场切磋', `正式切磋，对手剩 ${Math.round(ratio * 100)}%：普攻的致命一击 → 16 秒处决（不需要墨势）→ 收刀时击倒 → 演出交还之后演武场判胜`, { label: '演武场' });
  play(0.6, cam);
  lightUntil(() => Fn.active, { each: cam });
  const rec0 = Fn.rec;
  let resultAt = null;
  const r = untilShowEnds(0, cam, 30);
  play(6, (t) => {
    if (S.phase === 'result' && resultAt == null) { resultAt = t; recSub(`演出交还 → 演武场判${S.win ? '胜' : '负'}（击败${d.def?.name || '对手'}；画面中央的「胜」字卡是网页元素，录像里不画；随后的结算面板照画）`); }
    if (resultAt != null && t > resultAt + 2.8) return false;
  });
  const R = Fn.rec;
  const tl = timeline(Fn, n0);
  const out = stop();
  A.moves.lock = null;
  // 演出交还之后：被击倒的对手照常显出（演出中途按层藏起，交还时还原）、躺在圈里
  const root = d.char?.root, cam0 = A.camera;
  const res = { phase: S.phase, win: S.win ?? null, alive: d.alive, ai: d.ai, mask: root ? root.layers.mask : null, camMask: cam0.layers.mask, visible: root ? root.visible : null, seenByCam: root ? (root.layers.mask & cam0.layers.mask) !== 0 : null };
  if (A.ui.panelOpen) A.ui.closePanel();
  if (Ar.S) Ar.teardown(Ar.S);
  if (A.ui.panelOpen) A.ui.closePanel();
  return { ...out, ...r, tl, res, rec: R && R !== rec0 ? { via: R.via, level: R.level, state: R.state } : (R ? { via: R.via, level: R.level, state: R.state } : null) };
}
// 二、群战：三个魔修各剩一点气血——前两个照常倒下，打死最后一个时放 16 秒处决
export async function scnGroup({ pre = 'r29', name = 'group' } = {}) {
  const A = Q(), Fn = A.finale, P = A.player, M = A.moves;
  A.TIME.hour = 10; T.skyQuiet(false);
  T.fresh(); Fn.resetStack('film');
  // 三个分在前、左、右后（相隔 90° 以上）：一刀只够得着一个，一个一个倒下
  const es = T.foes([['shade', 2.1, 0], ['shade', 0.2, 2.3], ['shade', -1.6, -1.7]], { hp: 100 });
  es.forEach((e) => { e.hp = 12; e.bar.set(0.12); });
  const cam = () => A.cam.set(P.heading + 0.65, 0.28, 7.4);
  cam(); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); T.run([], 0.3);
  const n0 = Fn.evN || 0;
  rec(`${pre}_${name}_`, '墨里终焉 · 群战只在最后一个', '三个魔修各剩一点气血：前两个照常倒下；打死最后一个时放 16 秒处决（不需要墨势）', { label: '群战' });
  play(0.5, cam);
  const deaths = [];
  for (let i = 0; i < es.length; i++) {
    if (!es[i].alive) { deaths.push({ i, t: null, show: false, early: true }); continue; }
    M.lock = es[i];
    recSub(i < es.length - 1 ? `第 ${i + 1} 个：还有别的敌人——照常倒下` : '最后一个：打死时放墨里终焉');
    lightUntil(() => !es[i].alive || Fn.active, { max: 5, each: cam });
    deaths.push({ i, show: Fn.active, alive: es[i].alive });
    if (!Fn.active) play(0.8, cam);
  }
  const r = untilShowEnds(2.0, cam, 30);
  const tl = timeline(Fn, n0);
  const out = stop();
  M.lock = null;
  return { ...out, ...r, tl, deaths, via: Fn.rec?.via ?? null, dead: es.map((e) => !e.alive) };
}
// 三、第三十层二阶段（最后一条命）：普攻打空 → 16 秒处决 → 收刀时整场胜利 → 胜利过场 → 结算
export async function scnBoss30Kill({ ratio = 0.015, pre = 'r29', name = 'b30kill' } = {}) {
  const A = Q(), Fn = A.finale, P = A.player;
  const f = await boss30At(2, ratio);
  Fn.resetStack('film');
  const cam = () => A.cam.set(P.heading + 0.75, 0.2, 6.6);
  cam(); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); T.run([], 0.3);
  f.cine.forceSkip = false;
  const n0 = Fn.evN || 0;
  rec(`${pre}_${name}_`, '墨里终焉 · 第三十层最后一条命', `剑尊二阶段（最后一条命）剩 ${Math.round(ratio * 1000) / 10}%：普攻打空 → 16 秒处决（不需要墨势）→ 收刀时整场胜利 → 胜利过场 → 结算`, { boss30: true, label: 'Boss 最后一条命' });
  play(0.6, cam);
  lightUntil(() => Fn.active, { max: 8, each: () => { cam(); if (f.B) f.B.gapT = 99; } });
  const rec0 = Fn.rec;
  let cineAt = null, panelAt = null;
  const r = untilShowEnds(0, cam, 40);
  play(40, (t) => {
    if (f.cine.active && cineAt == null) { cineAt = r.endT + t; recSub('演出交还 → 胜利过场'); }
    if (A.ui.panelOpen && panelAt == null) { panelAt = r.endT + t; recSub('结算面板（奖励在演出与过场之后才发放）'); }
    if (panelAt != null && t > panelAt - r.endT + 3.0) return false;
  });
  const R = Fn.rec;
  const tl = timeline(Fn, n0);
  const panel = A.ui.panelOpen ? document.querySelector('#panel .ar-verdict')?.textContent : null;
  const out = stop();
  if (A.ui.panelOpen) A.ui.closePanel();
  f.cine.forceSkip = true; A.moves.lock = null;
  return { ...out, ...r, cineAt: cineAt != null ? r2(cineAt) : null, panelAt: panelAt != null ? r2(panelAt) : null, panel, tl, rec: R && { via: R.via, level: R.level, stage: R.stage, final: R.final, state: R.state }, state: f.state };
}

// =====================================================================================
// 合成音轨（同第二十五轮）：音效库之外的合成音与持续音，用游戏同一段合成代码在 OfflineAudioContext 里重放；上传为 docs/screenshots/r27stem_<name>.jpg（取出后改名 .wav）
// =====================================================================================
export async function synthStem(name, pre = 'r27stem_') {
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
  await fetch(`/__shot/${pre}${name}`, { method: 'POST', body: blob });
  ev.stemNames = Object.keys(names).filter((k) => !k.startsWith('loop:'));
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
// 上传帧与记录（同 r21_film.flush）
export const flush = RF.flush;
void T25;
