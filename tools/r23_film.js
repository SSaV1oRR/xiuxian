// 第二十三轮录像：剑诀面板（六格装备）、锁定与超距拒绝、裂隙出场、多云雷击、15 个目标、俯冲、普攻水墨改前改后。
// 都按真实的输入、出招、结算、特效代码推进（__qinglan.tick），帧在页面里同步截下、录完分批上传；音效照常放并记下来离线混音（tools/r19_mix_audio.py）。
// 剑诀面板一段是网页界面：把整页的界面元素连同算好的样式克隆进 SVG 画成一张图（tools/r11_capture.js 的 domShot 同一做法），叠在逐帧的画面上；
// 其余各段的界面（剑诀栏六格、雷龙的选点提示、落雷计数）按游戏里同一份数据画进录像。
// 用法（预览）：const F = await import('/tools/r23_film.js?v=' + Date.now()); await F.setup();
//   setTimeout(() => F.scnStorm().then((r) => window.__film = r), 0);   之后 await F.flush()
import * as RF from './r21_film.js';
import * as G from './r21_growth.js';
import * as T from './r23_tests.js';
import { DRAGON as DG, LOADOUT, PLAYER_COMBAT as PC, INK } from '/src/game/combatConfig.js';

const Q = () => window.__qinglan;
const r1 = (v) => +(+v).toFixed(1), r2 = (v) => +(+v).toFixed(2);
export const { flush, recSub } = RF;
export async function setup() { const s = await T.setup(); G.skyQuiet(false); return s; }
const WITH_DRAGON = ['qi', 'dragon', 'power', 'ult', 'seal', 'phoenix'];
const key = (code, down = true) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
const tap = (code) => { key(code, true); key(code, false); };

// ---------- 镜头、时刻、推进 ----------
function day(hour = 10) { const A = Q(); A.TIME.hour = hour; G.skyQuiet(false); for (let i = 0; i < 3; i++) A.tick(1 / 60, 1, false); }
function behind(yawOff = 0.12, pitch = 0.06, dist = 8.5) { const A = Q(), P = A.player; A.game.freeCam = null; A.cam.set(P.heading + yawOff, pitch, dist); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); }
function fixCam(pos, at) { const A = Q(), V = A.THREE.Vector3; A.game.freeCam = { pos: new V(...pos), at: new V(...at) }; }
function freeOff() { Q().game.freeCam = null; }
// 推进 secs 秒（录像）；dt 小于 1/60 即慢放（游戏时间照 dt 走，录像的时钟每帧 1/60 秒，音效放在画面上对应的时刻）
function play(secs, fn = null, dt = 1 / 60) {
  const n = Math.round(secs / dt);
  for (let i = 0; i < n; i++) { if (fn && fn(i * dt) === false) break; RF.recTick(dt); const X = window.__r21rec; if (X) X.t += 1 / 60 - dt; }
}
// 不录、直接推进（快进到某一时刻）
function skip(secs, fn = null) { const A = Q(), n = Math.round(secs * 60); for (let i = 0; i < n; i++) { if (fn && fn(i / 60) === false) break; A.tick(1 / 60, 1, false); } }
function hpLock() { const U = Q().combat.playerUnit; U.hp = U.maxHp; }
function spawn(kind, x, z, { hp = 5000, active = false, yaw = 0 } = {}) {
  const A = Q(), C = A.combat, e = C.spawn(kind, { x, y: C.groundAt(x, z, A.player.pos.y + 2), z }, { yaw });
  e.state = 'chase'; e.hp = e.maxHp = hp; e.bar.set(1);
  if (!active) { e.cool = 99; e.slamCool = 99; e.cfg = { ...e.cfg, speed: 0 }; }
  return e;
}
// 身前 d 米、向左 s 米处的世界坐标
function ahead(d, s = 0) { const P = Q().player, h = P.heading; return { x: P.pos.x + Math.sin(h) * d + Math.cos(h) * s, z: P.pos.z + Math.cos(h) * d - Math.sin(h) * s }; }

// ---------- 画进录像的界面 ----------
const box = (g, x, y, w, h, a = 0.5) => { g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(x, y, w, h); };
// 剑诀栏六格（右下）：键名、字、名字、调息（暗下去的部分与秒数）、灵力不够时发灰；空格写「空」
function slotBar(g, w, h, A) {
  if (A.game.freeCam) return;
  const L = A.loadout, M = A.moves, n = LOADOUT.keys.length, s = 52, gap = 7, x0 = w - (n * s + (n - 1) * gap) - 16, y0 = h - s - 52;
  g.fillStyle = 'rgba(244,239,228,.25)'; g.fillRect(x0 - 6, y0 - 6, n * s + (n - 1) * gap + 12, s + 12);
  for (let i = 0; i < n; i++) {
    const id = L.at(i), x = x0 + i * (s + gap), S = id ? PC.skills[id] : null;
    g.fillStyle = id ? 'rgba(244,239,228,.9)' : 'rgba(40,36,30,.5)'; g.fillRect(x, y0, s, s);
    g.textAlign = 'center';
    if (id) {
      const cd = S.cooldown || 0, c = M.cools[id] || 0, f = cd ? Math.min(1, c / cd) : 0, poor = M.mp < M.cost(id);
      g.font = '25px "KaiTi","STKaiti",serif'; g.fillStyle = poor ? '#8a857c' : '#2b2a27'; g.fillText(S.glyph, x + s / 2, y0 + 32);
      g.font = '10px "Microsoft YaHei",sans-serif'; g.fillText(S.name.replace(/ · .*/, '').slice(0, 4), x + s / 2, y0 + s - 5);
      if (f > 0) { g.fillStyle = 'rgba(20,18,16,.58)'; g.fillRect(x, y0, s, s * f); g.font = '600 13px sans-serif'; g.fillStyle = '#fff'; g.fillText(c >= 10 ? String(Math.ceil(c)) : c.toFixed(1), x + s / 2, y0 + 30); }
    } else { g.font = '15px "KaiTi","STKaiti",serif'; g.fillStyle = '#e8dcc6'; g.fillText('空', x + s / 2, y0 + 32); }
    g.textAlign = 'left'; g.font = '600 11px sans-serif'; g.fillStyle = id ? '#7a2a1c' : '#e8dcc6'; g.fillText(LOADOUT.labels[i], x + 3, y0 + 12);
  }
}
// 雷龙：选点提示（预览圈上方；合法青白、无效红）、施法状态、落雷计数、灵力与调息
function dragonOverlay(g, w, h, A) {
  const D = A.dragon, M = A.moves, S = D.S, cam = A.camera;
  if ((D.pre || D.rejectT > D.t) && D.labelText) {
    // 选点在画面里：提示立在它上方；没有选点（准星对着天空）或在画面外：放在准星下方
    const v = D.labelAt ? D.labelAt.clone().setY(D.labelAt.y + 2.2).project(cam) : null;
    const on = v && v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95;
    {
      const x = on ? (v.x * 0.5 + 0.5) * w : w / 2, y = on ? (-v.y * 0.5 + 0.5) * h : h / 2 + 46;
      if (!on) { g.strokeStyle = 'rgba(255,240,220,.85)'; g.lineWidth = 2; g.beginPath(); g.arc(w / 2, h / 2, 9, 0, Math.PI * 2); g.stroke(); }
      g.font = '15px "Microsoft YaHei",sans-serif'; g.textAlign = 'center';
      const tw = g.measureText(D.labelText).width;
      g.fillStyle = D.labelBad ? 'rgba(90,14,10,.82)' : 'rgba(16,30,52,.78)'; g.fillRect(x - tw / 2 - 10, y - 22, tw + 20, 28);
      g.strokeStyle = D.labelBad ? '#ff5a46' : '#a8d9ed'; g.lineWidth = 1.5; g.strokeRect(x - tw / 2 - 10, y - 22, tw + 20, 28);
      g.fillStyle = D.labelBad ? '#ffd0c8' : '#eaf8ff'; g.fillText(D.labelText, x, y - 3);
      g.textAlign = 'left';
    }
  }
  const lines = [];
  if (D.pre) lines.push(`引雷起势 ${D.pre.t.toFixed(2)} / ${DG.t.commit} 秒（之前可被格挡、闪身取消，不扣灵力）`);
  if (S) {
    const k = S.log.length, last = S.log[k - 1];
    const phase = S.t < DG.t.swim[0] ? '裂隙出场' : S.t < DG.t.charge[0] ? '雷云间盘游、落雷' : !S.dive.done ? (S.t < DG.t.dive[0] ? '蓄势（俯冲落点可有限追踪）' : '俯冲') : '爆雷、渐隐';
    lines.push(`雷龙破虚 ${S.t.toFixed(2)} 秒 · ${phase} · 雷云中心固定（离施法处 ${S.dist.toFixed(1)} 米）`);
    if (k) lines.push(`落雷 ${k} / ${DG.pulse.count} 次 · 第 ${k} 次：打中 ${last.hits} 个（选中 ${last.sel}、范围内 ${last.total} 个；每次至多 ${DG.pulse.max}）`);
    if (S.dive.rec) { const R = S.dive.rec; lines.push(`俯冲：${R.how === 'target' ? `撞上${R.direct?.primary ? '主要目标' : '目标'} ${Math.round(R.direct?.dealt ?? 0)}${R.direct?.crit ? '（暴击）' : ''}` : '落地爆雷'} · 周围爆发 ${R.burst.filter((b) => !b.blocked).length} 个各 ${Math.round(S.snap.burst)}`); }
  }
  lines.push(`灵力 ${Math.floor(M.mp)} / ${Math.round(M.mpMax)} · 雷龙破虚调息 ${(M.cools.dragon || 0).toFixed(1)} 秒`);
  g.font = '14px "Microsoft YaHei",sans-serif';
  let y = 152;
  for (const t of lines) { const tw = g.measureText(t).width; box(g, 14, y - 17, tw + 16, 24, 0.5); g.fillStyle = '#eaf8ff'; g.fillText(t, 22, y); y += 28; }
}

// ---------- 剑诀面板（网页界面）：整页界面元素 → SVG → 图，叠在逐帧的画面上 ----------
function domImage() {
  const A = Q(), r = A.renderer, W = innerWidth, H = innerHeight, NS = 'http://www.w3.org/1999/xhtml';
  // 有限的过渡、动画直接走完；循环的（满槽时格子的闪烁提示）停在一个周期的中间（最亮的时候）
  for (const a of document.getAnimations()) { try { const tm = a.effect?.getTiming(); if (tm.iterations !== Infinity) a.finish(); else a.currentTime = (+tm.duration || 1000) / 2; } catch (e) { /* 取不到时间的不管 */ } }
  const clone = (el) => {
    if (el.nodeType === 3) return el.cloneNode();
    if (el.nodeType !== 1 || /^(SCRIPT|STYLE|LINK)$/.test(el.tagName) || el === r.domElement) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null;
    const cv = el.tagName === 'CANVAS';
    const c = document.createElementNS(NS, cv ? 'img' : el.tagName.toLowerCase());
    if (cv) { try { c.setAttribute('src', el.toDataURL()); } catch (e) { return null; } }
    if (el.tagName === 'IMG') { try { const k = document.createElement('canvas'); k.width = el.naturalWidth || 1; k.height = el.naturalHeight || 1; k.getContext('2d').drawImage(el, 0, 0); c.setAttribute('src', k.toDataURL()); } catch (e) { return null; } }
    let s = '';
    for (let i = 0; i < cs.length; i++) s += cs[i] + ':' + cs.getPropertyValue(cs[i]) + ';';
    c.setAttribute('style', s);
    // 滚动过的容器（面板正文）：子元素整体上移 scrollTop（SVG 里的克隆没有滚动位置）
    const st = el.scrollTop || 0;
    for (const ch of el.childNodes) {
      const k = clone(ch);
      if (!k) continue;
      if (st && ch.nodeType === 1 && getComputedStyle(ch).position === 'static') k.setAttribute('style', k.getAttribute('style') + `position:relative;top:${-st}px;`);
      c.appendChild(k);
    }
    return c;
  };
  const bs = getComputedStyle(document.body), root = document.createElementNS(NS, 'div');
  root.setAttribute('style', `position:relative;width:${W}px;height:${H}px;overflow:hidden;font-family:${bs.fontFamily};color:${bs.color};`);
  for (const ch of document.body.children) { const k = clone(ch); if (k) root.appendChild(k); }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">${new XMLSerializer().serializeToString(root)}</foreignObject></svg>`;
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
}
function uiFrame(im) {
  const A = Q(), X = window.__r21rec, w = X.w, h = X.h;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.drawImage(A.renderer.domElement, 0, 0, w, h);
  g.drawImage(im, 0, 0, w, h);
  if (X.title) { g.font = '22px "KaiTi","STKaiti",serif'; g.fillStyle = '#fff4dc'; g.shadowColor = '#000'; g.shadowBlur = 6; g.fillText(X.title, 18, 34); g.shadowBlur = 0; }
  if (X.sub) { g.font = '15px "Microsoft YaHei",sans-serif'; const tw = Math.min(w - 40, g.measureText(X.sub).width); box(g, 14, 44, tw + 14, 26, 0.62); g.fillStyle = '#f3e9d2'; g.fillText(X.sub, 21, 62, w - 48); }
  return cv.toDataURL('image/jpeg', 0.9);
}
// 界面这一步停 secs 秒：界面图取一次（后台标签页里 await 要等约 1 秒），画面照常逐帧推进
async function uiHold(secs, sub) {
  const A = Q(), X = window.__r21rec;
  X.sub = sub;
  const im = await domImage();
  const n = Math.round(secs * 60);
  for (let i = 0; i < n; i++) {
    const rec = X.i % X.every === 0;
    A.tick(1 / 60, 1, rec);
    if (rec) X.frames.push(uiFrame(im));
    X.i++; X.t += 1 / 60;
  }
}
const click = (sel) => { const el = document.querySelector(sel); if (!el) throw new Error('找不到 ' + sel); el.click(); };
// 面板正文滚动：sel 滚到中间；null 回到顶
function scrollTo(sel) {
  let p = document.querySelector('.lo-panel');
  while (p && !(p.scrollHeight > p.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
  if (!p) return;
  if (!sel) { p.scrollTop = 0; return; }
  document.querySelector(sel)?.scrollIntoView({ block: 'center' });
}
function drag(fromSel, toSel) {
  const a = document.querySelector(fromSel), b = document.querySelector(toSel), dt = new DataTransfer();
  a.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  b.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  b.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  a.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
}

// =====================================================================================
// 一、剑诀面板：六格装备（默认装配 → 满槽时选一格替换 → 卸下 → 互换 → 拖拽 → 交战中被拒）→ 新的槽键施展，旧的 T、Z 不再放招
// =====================================================================================
export async function scnLoadout() {
  const A = Q(), M = A.moves, L = A.loadout, P = A.player, C = A.combat;
  day(); T.equip(LOADOUT.defaults);
  T.plaza(); G.clearFoes(); skip(6.2);
  behind(0.28, 0.16, 7.2);
  const REC = RF.recStart({ prefix: 'r23_loadout_', every: 2, w: 1152, h: 720, title: '剑诀面板 · 六格装备', sub: '首次进入的默认装配：Q 剑气 · X 破岳 · R 拔刀斩（中键同）· V 万剑归宗 · 1 缚灵锁 · 3 九霄凤焰；惊鸿掠影、雷龙破虚在技能库' });
  REC.extra = (g, w, h, A2) => { slotBar(g, w, h, A2); };
  play(1.4);
  A.game.openSkills();
  await uiHold(3.0, '按 K 打开剑诀面板（鼠标随即释放，点界面不会出剑）：上面六格，下面技能库——每种剑诀写明消耗、调息、操作、特点与解锁条件');
  scrollTo('.lo-card[data-id="dragon"]');
  await uiHold(2.6, '技能库里还没装备的：惊鸿掠影、雷龙破虚（金丹初期解锁——已达成；耗最大灵力的 35%，调息 120 秒）');
  click('.lo-card[data-id="dragon"] [data-eq]');
  await uiHold(1.6, '六格都满：点「雷龙破虚」的「装备」——它亮起金边，等着选要替换的那一格');
  scrollTo(null);
  await uiHold(2.4, '面板上方写明「六格已满：点一格，换成雷龙破虚」，六格一闪一闪等着点选');
  click('.lo-slot[data-slot="1"]');
  await uiHold(2.4, '点 X 格：破岳换成雷龙破虚（破岳回到技能库；调息按剑诀记，不因换格刷新）');
  click('[data-un="4"]');
  await uiHold(2.2, '点 1 格的「卸下」：缚灵锁回到技能库，这一格空着');
  click('.lo-slot[data-slot="0"]'); click('.lo-slot[data-slot="3"]');
  await uiHold(2.2, '点 Q 格、再点 V 格：两格互换（万剑归宗到 Q，剑气到 V）');
  drag('.lo-card[data-id="dash"]', '.lo-slot[data-slot="4"]');
  await uiHold(2.2, '把技能库里的惊鸿掠影拖到 1 格（桌面可拖拽；只用点击也能完成全部操作）');
  // 交战：身前来了一只会出手的魔修 → 面板写明「交战之中」，点卸下被拒
  const e = spawn('shade', ahead(4.5).x, ahead(4.5).z, { active: true, hp: 400, yaw: P.heading + Math.PI });
  skip(0.4);
  click('[data-un="2"]');
  await uiHold(2.6, '身边来了魔修（交战中）：点「卸下」被拒、写明原因——脱战 5 秒、且没有正在施法时才能调整');
  A.ui.closePanel();
  e.dispose(); C.enemies.splice(C.enemies.indexOf(e), 1);
  // 新的槽键：X 放雷龙破虚（锁定身前 14 米的魔修），1 放惊鸿掠影；旧的 T、Z 不再是剑诀键
  RF.recSub('关上面板，按新的槽键：X 雷龙破虚（锁定身前 14 米的魔修）——起势、裂隙撕开、龙从裂隙里游出');
  const t1 = spawn('shade', ahead(14).x, ahead(14).z, { yaw: P.heading + Math.PI }), t2 = spawn('shade', ahead(15, 2.6).x, ahead(15, 2.6).z, { yaw: P.heading + Math.PI });
  M.lock = t1; M.mp = M.mpMax; M.cools.dragon = 0;
  behind(0.12, -0.02, 9);
  play(0.5, hpLock);
  tap('KeyX');
  play(3.6, hpLock);
  RF.recSub('按 T、Z（第二十二轮的旧键）：不再放任何剑诀；按 1：惊鸿掠影（刚拖进 1 格）——龙照常在雷云里落雷');
  tap('KeyT'); play(0.6, hpLock); tap('KeyZ'); play(0.6, hpLock);
  M.cools.dash = 0; M.mp = Math.max(M.mp, 40);
  tap('Digit1'); play(2.2, hpLock);
  RF.recSub('剑诀栏六格：X 格雷龙破虚调息 120 秒、1 格惊鸿掠影调息 6 秒，各按剑诀记');
  play(2.0, hpLock);
  const out = RF.recStop();
  A.dragon.clear('film'); G.clearFoes(); freeOff();
  return { ...out, slots: L.slots.slice() };
}

// =====================================================================================
// 二、锁定与拒绝：超出 30 米、起势中取消、准星对着天空、隔墙、上方空间不足——不放、不扣灵力、不进调息；最后合法地放出
// =====================================================================================
export async function scnReject() {
  const A = Q(), M = A.moves, D = A.dragon, P = A.player;
  day(); T.equip(WITH_DRAGON);
  const WEST = { x: -16, z: 26 };
  T.plaza(Math.PI / 2, WEST); G.clearFoes(); skip(0.3);
  const mid = spawn('shade', ahead(18, -1.5).x, ahead(18, -1.5).z, { yaw: -Math.PI / 2 }), far = spawn('shade', ahead(33, 1.5).x, ahead(33, 1.5).z, { yaw: -Math.PI / 2 });
  behind(0.18, 0.1, 6.5);
  const REC = RF.recStart({ prefix: 'r23_reject_', every: 2, w: 960, h: 540, title: '雷龙破虚 · 选点与拒绝', sub: '准星对着 33 米外的魔修按 X：超出 30 米（三维距离）——地上红圈与原因，不放、不扣灵力、不进调息' });
  REC.extra = (g, w, h, A2) => { slotBar(g, w, h, A2); dragonOverlay(g, w, h, A2); };
  M.mp = M.mpMax; M.cools.dragon = 0; M.lock = null;
  play(0.3, hpLock);
  T.aimAt(far.pos.clone().setY(far.pos.y + 1.1));
  play(0.3, hpLock);
  tap('KeyX'); play(2.0, hpLock);
  // 锁定 18 米处的魔修：起势中的预览，0.4 秒时闪身取消
  RF.recSub('锁定 18 米处的魔修（Tab，锁定只在 24 米内）按 X：青白雷纹圈（半径就是结算的 8 米）跟着它；起势 0.4 秒时按 C 闪身——取消，不扣灵力、不进调息');
  behind(0.18, 0.1, 6.5);
  M.lock = mid; play(0.3, hpLock); tap('KeyX'); play(0.4, hpLock); tap('KeyC'); play(1.6, hpLock);
  // 准星对着天空
  RF.recSub('不锁定、准星对着天空按 X：准星下没有可落雷的地面');
  M.lock = null; A.cam.set(P.heading + 0.18, -0.5, 6.5); play(0.4, hpLock); tap('KeyX'); play(1.8, hpLock);
  // 隔墙：广场南侧回廊后墙外低处的魔修
  T.plaza(0, { x: -6, z: 30 }); G.clearFoes(); skip(0.2);
  const w = spawn('shade', -6, 52, { yaw: Math.PI });
  behind(0.18, 0.12, 6.5); M.lock = w; M.mp = M.mpMax; M.cools.dragon = 0;
  RF.recSub('锁定回廊后墙外低处的魔修（22 米）按 X：胸口到它头顶上方 1 / 2.2 / 3.5 米的三条线都被墙挡住——被墙体或山石挡住');
  play(0.3, hpLock); tap('KeyX'); play(2.0, hpLock);
  // 上方空间不足：回廊屋顶下的魔修
  T.plaza(0, { x: -18.5, z: 27 }); G.clearFoes(); skip(0.2);
  const rf = spawn('shade', -18.5, 39.5, { yaw: Math.PI });
  behind(0.12, 0.12, 6.5); M.lock = rf; M.mp = M.mpMax; M.cools.dragon = 0;
  RF.recSub('锁定站在回廊屋顶下的魔修按 X：看得见，但它头顶 2.4 米起是屋顶——上方空间不足（龙与雷云放不下；地上红圈）');
  play(0.3, hpLock); tap('KeyX'); play(2.0, hpLock);
  // 合法
  T.plaza(Math.PI / 2, WEST); G.clearFoes(); skip(0.2);
  const ok = spawn('shade', ahead(18, -1.5).x, ahead(18, -1.5).z, { yaw: -Math.PI / 2 });
  spawn('shade', ahead(19, 1.5).x, ahead(19, 1.5).z, { yaw: -Math.PI / 2 });
  behind(0.14, 0.02, 7.5); M.lock = ok; M.mp = M.mpMax; M.cools.dragon = 0;
  RF.recSub('锁定 18 米处的魔修按 X：0.65 秒提交——这才扣灵力（最大灵力的 35%）、进 120 秒调息；雷云中心定在它脚下');
  play(0.3, hpLock); tap('KeyX'); play(3.4, hpLock);
  const out = RF.recStop();
  D.clear('film'); G.clearFoes(); freeOff();
  return out;
}

// =====================================================================================
// 三、裂隙出场：常规视角一遍；侧面 0.4 倍慢放一遍（剑上聚雷 → 剑尖一道雷 → 裂隙细裂、撑开 → 龙头探出、身体逐段穿出）
// =====================================================================================
export async function scnEmerge() {
  const A = Q(), M = A.moves, D = A.dragon, P = A.player;
  day(); T.equip(WITH_DRAGON);
  T.plaza(); G.clearFoes(); skip(0.3);
  const es = [spawn('shade', ahead(14).x, ahead(14).z, { yaw: P.heading + Math.PI }), spawn('shade', ahead(15, 2.5).x, ahead(15, 2.5).z, { yaw: P.heading + Math.PI }), spawn('shade', ahead(13, -3).x, ahead(13, -3).z, { yaw: P.heading + Math.PI })];
  behind(0.1, -0.06, 9.5);
  const REC = RF.recStart({ prefix: 'r23_emerge_', every: 2, w: 960, h: 540, title: '雷龙破虚 · 裂隙出场', sub: '常规背后视角：剑上聚雷（0–0.65 秒）→ 剑尖一道雷直上 → 裂隙先细裂再撑开 → 龙头探出、身体逐段穿出裂隙' });
  REC.extra = (g, w, h, A2) => { slotBar(g, w, h, A2); dragonOverlay(g, w, h, A2); };
  M.lock = es[0]; M.mp = M.mpMax; M.cools.dragon = 0;
  play(0.4, hpLock);
  tap('KeyX');
  play(3.6, hpLock);
  D.clear('film');
  // 侧面慢放：镜头在主人与裂隙连线的右侧
  T.plaza(); skip(0.2);
  for (const e of es) e.hp = e.maxHp;
  M.lock = es[0]; M.mp = M.mpMax; M.cools.dragon = 0;
  const V = A.THREE.Vector3, Cc = D.anchorOf(es[0], new V()), fr = D.frame(Cc, P.pos), rift = D.riftPos(Cc, fr.f, new V());
  const mid = P.pos.clone().lerp(rift, 0.5);
  fixCam([mid.x + fr.r.x * 23 + fr.f.x * 1, P.pos.y + 6, mid.z + fr.r.z * 23 + fr.f.z * 1], [rift.x * 0.6 + Cc.x * 0.4, rift.y - 0.5, rift.z * 0.6 + Cc.z * 0.4]);
  RF.recSub('侧面 0.4 倍慢放：裂隙背后的那段身体不画（裁切平面）——龙身是一节一节从裂隙里出来的，不是整条龙摆在一张裂隙图旁边');
  play(0.3, hpLock, 1 / 150);
  tap('KeyX');
  play(3.0, hpLock, 1 / 150);
  RF.recSub('尾巴离开裂隙（约 2.3 秒）后裂隙收成一道细缝；龙并入雷云间的盘游');
  play(1.6, hpLock);
  const out = RF.recStop();
  D.clear('film'); G.clearFoes(); freeOff();
  return out;
}

// =====================================================================================
// 四、多云雷击：十团雷云（中央厚、外围错落），8 秒十次落雷，每个敌人各挨一道；主人照常走动、出剑，雷云不随人移动
// =====================================================================================
export async function scnStorm() {
  const A = Q(), M = A.moves, D = A.dragon, P = A.player, I = A.input;
  day(); T.equip(WITH_DRAGON);
  T.plaza(); G.clearFoes(); skip(0.3);
  const c = ahead(14), es = [spawn('shade', c.x, c.z, { yaw: P.heading + Math.PI })];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.4, rr = 3 + (i % 2) * 2.4; es.push(spawn(i % 3 === 0 ? 'caster' : 'shade', c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr, { yaw: P.heading + Math.PI })); }
  behind(0.14, 0.0, 9.5);
  const REC = RF.recStart({ prefix: 'r23_storm_', every: 2, w: 960, h: 540, title: '雷龙破虚 · 雷云与落雷', sub: '锁定身前 14 米的魔修按 X：雷云在它脚下的上空聚成十团，龙在云间盘游' });
  REC.extra = (g, w, h, A2) => { slotBar(g, w, h, A2); dragonOverlay(g, w, h, A2); };
  M.lock = es[0]; M.mp = M.mpMax; M.cools.dragon = 0;
  play(0.3, hpLock); tap('KeyX'); play(2.6, hpLock);
  // 高处的侧面全景：雷云的层次、每次落雷前的青白预兆、雷柱跟着目标到锁定那一刻
  const S = D.S, Cc = S.C;
  fixCam([Cc.x + S.r.x * 21 + S.f.x * 6, Cc.y + 10, Cc.z + S.r.z * 21 + S.f.z * 6], [Cc.x, Cc.y + 4.5, Cc.z]);
  RF.recSub('侧面全景：落雷前 0.35 秒地上先亮青白预兆（跟着目标，落前 0.12 秒锁定），随后真的雷柱落下、云团一亮；每个敌人各挨一道（60）');
  play(3.2, hpLock);
  // 回到主人身后：走开、出剑——雷云中心不动
  behind(0.25, 0.12, 8);
  RF.recSub('主人照常走动（W）与出剑（按住左键）：雷云中心固定在施法时的选点，不跟着人走');
  I.keys.add('KeyA'); play(1.2, hpLock); I.keys.clear();
  A.game.pointer.setAttack(true); play(1.6, hpLock); A.game.pointer.setAttack(false);
  play(1.6, hpLock);
  const out = RF.recStop();
  D.clear('film'); G.clearFoes(); freeOff();
  return out;
}

// =====================================================================================
// 五、15 个目标：雷云里 20 个魔修（每次至多打 15 个：主要目标 + 最近的 14 个），身边两只会出手的魔将；主人连续普攻——敌人的预警照样看得清
// =====================================================================================
export async function scnFifteen() {
  const A = Q(), M = A.moves, D = A.dragon, P = A.player;
  day(); T.equip(WITH_DRAGON);
  T.plaza(); G.clearFoes(); skip(0.3);
  const c = ahead(9), es = [spawn('shade', c.x, c.z, { yaw: P.heading + Math.PI })];
  for (let i = 1; i < 20; i++) { const a = i * 2.39996, rr = 1.4 + 5.6 * Math.sqrt(i / 19); es.push(spawn('shade', c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr, { yaw: P.heading + Math.PI })); }
  const el = [spawn('elite', ahead(2.6, 1.4).x, ahead(2.6, 1.4).z, { active: true, hp: 6000, yaw: P.heading + Math.PI }), spawn('elite', ahead(3.0, -1.6).x, ahead(3.0, -1.6).z, { active: true, hp: 6000, yaw: P.heading + Math.PI })];
  for (const e of el) { e.slamCool = 1.2; }
  behind(0.1, 0.32, 9.5);
  const REC = RF.recStart({ prefix: 'r23_fifteen_', every: 2, w: 960, h: 540, title: '雷龙破虚 · 15 个目标', sub: '雷云里 20 个魔修：每次落雷至多 15 个（主要目标 + 离中心最近的 14 个），每个只挨一道；身边两只魔将照常出手' });
  REC.extra = (g, w, h, A2) => { slotBar(g, w, h, A2); dragonOverlay(g, w, h, A2); };
  M.lock = es[0]; M.mp = M.mpMax; M.cools.dragon = 0;
  play(0.3, hpLock); tap('KeyX'); play(2.0, hpLock);
  M.lock = null;
  RF.recSub('主人按住左键连续普攻：水墨只在剑的轨迹与命中处，旧墨很快淡去——魔将震地的地面预警（金环 / 红圈）、雷的青白预兆都看得清');
  A.game.pointer.setAttack(true);
  play(7.4, hpLock);
  A.game.pointer.setAttack(false);
  RF.recSub('十次落雷每次都是 15 / 20；随后俯冲撞向主要目标、爆雷震开周围');
  play(2.6, hpLock);
  const out = RF.recStop();
  D.clear('film'); G.clearFoes(); freeOff();
  return { ...out, pulses: D.last?.pulses.map((p) => [p.sel, p.total, p.hits]) };
}

// =====================================================================================
// 六、俯冲：蓄势（10.0–10.6 秒）中主要目标挪开 3 米——落点跟过去（在 30 米、半径 + 6 米、看得见的限度内）；10.6 定下，弧线俯冲，在实际接触处爆雷
// =====================================================================================
export async function scnDive() {
  const A = Q(), M = A.moves, D = A.dragon, P = A.player;
  day(); T.equip(WITH_DRAGON);
  T.plaza(); G.clearFoes(); skip(0.3);
  const es = [spawn('shade', ahead(14).x, ahead(14).z, { yaw: P.heading + Math.PI }), spawn('shade', ahead(14.5, 2.4).x, ahead(14.5, 2.4).z, { yaw: P.heading + Math.PI }), spawn('shade', ahead(13.5, -2.6).x, ahead(13.5, -2.6).z, { yaw: P.heading + Math.PI })];
  M.lock = es[0]; M.mp = M.mpMax; M.cools.dragon = 0;
  tap('KeyX');
  skip(8.8, hpLock);                        // 快进到 8.8 秒（不录）
  const S = D.S, Cc = S.C;
  fixCam([Cc.x + S.r.x * 20 + S.f.x * 8, Cc.y + 8, Cc.z + S.r.z * 20 + S.f.z * 8], [Cc.x, Cc.y + 5, Cc.z]);
  const REC = RF.recStart({ prefix: 'r23_dive_', every: 2, w: 960, h: 540, title: '雷龙破虚 · 蓄势与俯冲', sub: '第 8.8 秒起（侧面）：最后两次落雷 → 龙盘起身子、往里收、往上抬（蓄势）' });
  REC.extra = (g, w, h, A2) => { slotBar(g, w, h, A2); dragonOverlay(g, w, h, A2); };
  play(1.25, hpLock);
  RF.recSub('蓄势中主要目标挪开 3 米：俯冲落点跟过去（不超出施法处 30 米、雷云中心 14 米，看得见）；10.6 秒落点定下');
  es[0].pos.x += Math.cos(P.heading) * 3; es[0].pos.z -= Math.sin(P.heading) * 3;
  play(0.5, hpLock);
  RF.recSub('0.35 倍慢放：顺着盘游的方向弧线扑下，吻尖逐段检查碰撞，在实际接触处爆雷（直接命中 900，周围 5 米各 300）');
  play(0.9, hpLock, 1 / 170);
  play(1.4, hpLock);
  // 主人视角再看一遍俯冲
  D.clear('film'); G.clearFoes();
  T.plaza(); skip(0.2);
  const es2 = [spawn('shade', ahead(14).x, ahead(14).z, { yaw: P.heading + Math.PI }), spawn('shade', ahead(14.5, 2.4).x, ahead(14.5, 2.4).z, { yaw: P.heading + Math.PI }), spawn('shade', ahead(13.5, -2.6).x, ahead(13.5, -2.6).z, { yaw: P.heading + Math.PI })];
  M.lock = es2[0]; M.mp = M.mpMax; M.cools.dragon = 0;
  tap('KeyX'); skip(9.6, hpLock);
  behind(0.12, -0.04, 9.5);
  RF.recSub('主人身后的常规视角：蓄势 → 俯冲 → 爆雷（镜头轻震，随即回正）→ 雷云、裂隙、电弧约 1 秒渐隐');
  play(3.4, hpLock);
  const out = RF.recStop();
  D.clear('film'); G.clearFoes(); freeOff();
  return out;
}

// =====================================================================================
// 七、普攻水墨：改前（第二十二轮的墨带）与改后——同一机位、同一套连击；侧面、正面、夜间、空挥 / 命中
// =====================================================================================
// 第二十轮到第二十二轮普攻四式的墨带参数（改前对照用；游戏里不用）
const OLD = {
  light1: { from: 0.16, to: 0.285, inner: 0.45, reach: 0.3, thick: 0.08, hold: 0.02, life: 0.34, drops: 7, mist: 1 },
  light2: { from: 0.135, to: 0.27, inner: 0.45, reach: 0.3, thick: 0.08, hold: 0.02, life: 0.34, drops: 7, mist: 1 },
  light3: { from: 0.2, to: 0.31, stroke: true, ring: 0.245, reach: 0.4, thick: 0.15, hold: 0.02, life: 0.3, drops: 6, mist: 1 },
  light4: { from: 0.37, to: 0.5, inner: 0.38, reach: 0.42, thick: 0.12, hold: 0.04, life: 0.45, drops: 12, mist: 2 },
};
let NEW = null;
function legacy(on) {
  const ink = Q().sfx.ink, S = INK.slash;
  NEW ||= { light1: S.light1, light2: S.light2, light3: S.light3, light4: S.light4 };
  for (const k of Object.keys(OLD)) S[k] = on ? OLD[k] : NEW[k];
  ink.legacy = on;
}
export async function scnInk() {
  const A = Q(), M = A.moves, P = A.player, ptr = A.game.pointer;
  T.equip(LOADOUT.defaults);
  const combo = (secs = 2.9) => { ptr.setAttack(true); play(secs, hpLock); ptr.setAttack(false); play(0.9, hpLock); };
  const lineup = () => { T.plaza(); G.clearFoes(); skip(0.2); for (const [d, s] of [[2.8, 0], [3.4, 1.7], [3.2, -1.8]]) { const p = ahead(d, s); spawn('shade', p.x, p.z, { yaw: P.heading + Math.PI }); } skip(0.2); };
  const sideCam = () => { const h = P.heading, f = { x: Math.sin(h), z: Math.cos(h) }, r = { x: -Math.cos(h), z: Math.sin(h) }; fixCam([P.pos.x + r.x * 6.8 + f.x * 1.6, P.pos.y + 2.0, P.pos.z + r.z * 6.8 + f.z * 1.6], [P.pos.x + f.x * 1.7, P.pos.y + 1.1, P.pos.z + f.z * 1.7]); };
  const frontCam = () => { const h = P.heading, f = { x: Math.sin(h), z: Math.cos(h) }; fixCam([P.pos.x + f.x * 7.6, P.pos.y + 2.3, P.pos.z + f.z * 7.6], [P.pos.x + f.x * 1.2, P.pos.y + 1.1, P.pos.z + f.z * 1.2]); };
  day();
  lineup(); behind(0.22, 0.24, 6.2);
  const REC = RF.recStart({ prefix: 'r23_ink_', every: 2, w: 960, h: 540, title: '普攻水墨 · 改前', sub: '改前（第二十轮到第二十二轮的墨带）：按住左键四式一轮——墨带只到剑尖，窄而齐，命中处一团墨溅' });
  legacy(true);
  combo();
  legacy(false);
  lineup(); behind(0.22, 0.24, 6.2);
  RF.recSub('改后：浓墨核心贴着剑刃的真实轨迹、外沿伸到这一式的判定距离（3.5 / 3.5 / 4.2 / 3.8 米），宽约原来的两倍；外层墨雾、飞白、墨点低透明、随剑势甩出；命中处按招式炸墨', '普攻水墨 · 改后');
  combo();
  lineup(); sideCam();
  RF.recSub('改后 · 侧面：墨带是贴着剑的弧面，侧看也有厚度与干笔飞白，不是一张朝镜头的贴图', '普攻水墨 · 改后');
  combo();
  lineup(); frontCam();
  RF.recSub('改后 · 正面：迎面看墨带的外沿、碎开与外层的墨雾', '普攻水墨 · 改后');
  combo();
  // 空挥与命中：身前没人只铺墨带与外层，不炸墨；打中才在接触点炸墨
  T.plaza(); G.clearFoes(); skip(0.2); behind(0.22, 0.24, 6.2);
  RF.recSub('空挥：只有墨带与外层的墨雾、飞白——没有命中的炸墨', '普攻水墨 · 改后');
  combo(2.0);
  // 夜间
  day(22.5);
  lineup(); behind(0.22, 0.24, 6.2);
  RF.recSub('夜间：墨带外沿一线细亮的刀锋（只在剑尖刚扫过的一小段），墨色在夜里仍分得清', '普攻水墨 · 改后 · 夜间');
  combo();
  day(10);
  const out = RF.recStop();
  legacy(false); G.clearFoes(); freeOff();
  return out;
}
