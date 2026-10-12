// 第二十一轮录像：修为（打坐、提升修为、中断、大境界突破、上限）、凤翔天击、凤灵护战、第五十层、飞行的距离与高度。
// 都按真实的输入、出招、结算代码推进（__qinglan.tick），帧在页面里同步截下（后台标签页里 await 会被拖慢），录完分批上传。
// 画面里的文字：左上的标题与说明、境界徽记（等级、修炼灵气）、下方的气血 / 灵力 / 凤凰状态、伤害与治疗的浮字、提示（toast）与横幅，
// 都按游戏里同一份数据画进录像（游戏的界面是网页元素，截不进画布）。音效照常放，同时记下来，离线混成音轨（tools/r19_mix_audio.py）。
// 用法（预览）：const F = await import('/tools/r21_film.js?v=' + Date.now()); setTimeout(() => F.scnGrowth().then((r) => window.__film = r), 0);
//   之后 await F.flush() 上传帧（docs/screenshots/<前缀>00000.jpg…）与音效记录（<前缀>events.jpg，其实是 JSON）
import * as G from './r21_growth.js';
import * as B from './r17_combat_bot.js';
import { totalNeed, realmLabel } from '/src/game/progression.js';
import { PHOENIX } from '/src/game/combatConfig.js';
import { LEVEL, ASCEND } from '/src/game/progressConfig.js';

const Q = () => window.__qinglan;
const r2 = (v) => +(+v).toFixed(2), r3 = (v) => +(+v).toFixed(3);
let REC = null;
const NUM = { heal: ['#a6f2bf', 18], crit: ['#ffd36a', 25], heavy: ['#ffe08a', 24], fire: ['#ffb050', 17], burn: ['#ffb050', 13], parry: ['#ffe39a', 26], block: ['#c9f4ff', 17], hurt: ['#ff6a55', 18], immune: ['#b9c2c8', 16], phoenix: ['#f2a43a', 20] };
const strip = (h) => String(h).replace(/<br\s*\/?>/g, '　').replace(/<[^>]+>/g, '');

// =====================================================================================
// 录像
// =====================================================================================
export function recStart({ prefix, every = 2, w = 960, h = 540, title = '', sub = '', boss = false, aggro = false }) {
  const A = Q(), R = A.renderer, S = A.game.sound, C = A.combat, ui = A.ui;
  REC = window.__r21rec = { prefix, every, w, h, i: 0, t: 0, title, sub, boss, aggro, pops: [], toasts: [], banner: null, frames: [], events: [], level0: A.prog.level,
    keep: { s: R.getSize(new A.THREE.Vector2()), pr: R.getPixelRatio() } };
  R.setPixelRatio(1); R.setSize(w, h, false); A.camera.aspect = w / h; A.camera.updateProjectionMatrix();
  // 浮字：游戏的 popNumber 照常（网页元素），同时记下来画进录像
  REC.pop0 = C.popNumber;
  C.popNumber = function (unit, text, kind) {
    REC0()?.pops.push({ txt: text, kind: kind || '', p: new A.THREE.Vector3(unit.pos.x + (Math.random() - 0.5) * 0.5, (unit.headY ?? unit.pos.y + 1.9) + 0.2, unit.pos.z), t: 0 });
    return REC.pop0.call(this, unit, text, kind);
  };
  REC.toast0 = ui.toast; REC.banner0 = ui.banner;
  ui.toast = function (html) { REC0()?.toasts.push({ txt: strip(html), t: 0 }); return REC.toast0.call(this, html); };
  ui.banner = function (t1, t2) { if (REC0()) REC.banner = { t1, t2, t: 0 }; return REC.banner0.call(this, t1, t2); };
  // 音效：照常放，同时记下来（音量按 audio.js 的距离衰减、声像算好）
  REC.play0 = S.play;
  S.play = function (name, o = {}) {
    const hd = REC.play0.call(this, name, o);
    const sn = name === 'hit' && o.big && this.bank?.hitHeavy ? 'hitHeavy' : name, Sb = this.bank?.[sn];
    const kg = (name === 'swing' && o.heavy) || (name === 'block' && o.hard) ? 1.25 : 1;
    let att = 1, pan = 0;
    const L = this.listener;
    if (o.at && L) {
      const dx = o.at.x - L.pos.x, dz = o.at.z - L.pos.z, dy = (o.at.y ?? L.pos.y) - L.pos.y, d = Math.hypot(dx, dy, dz);
      att = 1 / (1 + Math.max(0, d - 4) / (o.ref ?? Sb?.ref ?? 14));
      if (d > 0.5) pan = Math.max(-0.85, Math.min(0.85, (dx * L.right.x + dz * L.right.z) / d));
    }
    const ev = { t: r3(REC.t), name: sn, v: Sb?.last ?? 0, offset: o.offset || 0, rate: hd?.src ? r3(hd.src.playbackRate.value) : r3(o.pitch ?? 1),
      gain: r3((Sb?.gain ?? 1) * (o.gain ?? 1) * kg * att), pan: r2(pan), wet: r2(o.wet ?? Sb?.wet ?? 0.4), dur: o.dur || 0, synth: !Sb };
    // 第二十五轮：合成音（音效库里没有录音的）另记原参数、声源与当时的听者——录完在页面里用同一段合成代码离线渲染成一轨（tools/r25_film.js synthStem）
    if (!Sb) Object.assign(ev, where(o, L), { o: plain(o) });
    REC.events.push(ev);
    if (hd) { const stop0 = hd.stop; hd.stop = (fade = 0.12) => { if (REC && !hd.stopped) { ev.stopT = r3(REC.t); ev.fade = fade; } stop0(fade); }; }
    return hd;
  };
  REC.loop0 = S.loop; REC.stopLoop0 = S.stopLoop; REC.loops = [];
  S.loop = function (id, kind, o = {}) {
    const h = REC.loop0.call(this, id, kind, o);
    if (REC) REC.loops.push({ t: r3(REC.t), id, kind, o: plain(o), ...where(o, this.listener) });
    return h;
  };
  S.stopLoop = function (id, fade = 0.3) {
    if (REC && this.loops.has(id)) REC.loops.push({ t: r3(REC.t), id, stop: true, fade });
    return REC.stopLoop0.call(this, id, fade);
  };
  return REC;
}
const REC0 = () => REC;
// 合成音的参数：只留数、布尔、字串（声源另记）；声源与听者（位置、右方）
const plain = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k, v]) => k !== 'at' && ['number', 'boolean', 'string'].includes(typeof v)));
const where = (o, L) => ({ at: o?.at ? [r3(o.at.x), o.at.y == null ? null : r3(o.at.y), r3(o.at.z)] : null, lis: L ? [r3(L.pos.x), r3(L.pos.y), r3(L.pos.z), r3(L.right.x), r3(L.right.z)] : null });
export function recSub(sub, title = null) { if (REC) { REC.sub = sub; if (title != null) REC.title = title; } }
export function recStop() {
  const A = Q(), R = A.renderer;
  if (!REC) return null;
  A.combat.popNumber = REC.pop0; A.ui.toast = REC.toast0; A.ui.banner = REC.banner0; A.game.sound.play = REC.play0;
  A.game.sound.loop = REC.loop0; A.game.sound.stopLoop = REC.stopLoop0;
  R.setPixelRatio(REC.keep.pr); R.setSize(REC.keep.s.x, REC.keep.s.y, false); A.camera.aspect = REC.keep.s.x / REC.keep.s.y; A.camera.updateProjectionMatrix();
  const out = { prefix: REC.prefix, frames: REC.frames.length, secs: r2(REC.t), fps: Math.round(60 / REC.every), events: REC.events, loops: REC.loops };
  window.__recFrames = REC.frames; window.__recEvents = out;
  REC = window.__r21rec = null;
  return { ...out, events: out.events.length };
}
// 推进一帧（录或不录）
export function recTick(dt = 1 / 60) {
  const A = Q();
  const rec = REC && REC.i % REC.every === 0;
  A.tick(dt, 1, !!rec);
  if (!REC) return;
  for (const p of REC.pops) p.t += dt;
  REC.pops = REC.pops.filter((p) => p.t < 0.9);
  for (const t of REC.toasts) t.t += dt;
  REC.toasts = REC.toasts.filter((t) => t.t < 3.5);
  if (REC.banner && (REC.banner.t += dt) > 2.8) REC.banner = null;
  if (rec) REC.frames.push(recFrame());
  REC.i++; REC.t += dt;
}
export function play(secs, fn = null) { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) { if (fn && fn(i / 60) === false) break; recTick(); } }

function bar(g, x, y, w, h, f, col, bg = 'rgba(40,30,20,.28)') { g.fillStyle = bg; g.fillRect(x, y, w, h); g.fillStyle = col; g.fillRect(x, y, w * Math.max(0, Math.min(1, f)), h); }
function box(g, x, y, w, h, a = 0.5) { g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(x, y, w, h); }
function recFrame() {
  const A = Q(), R = A.renderer, M = A.moves, C = A.combat, U = C.playerUnit, P = A.prog, ph = A.phoenix, Gm = A.game, X = REC, w = X.w, h = X.h;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.drawImage(R.domElement, 0, 0, w, h);
  g.textAlign = 'left';
  const bare = !!X.bare?.();      // 第二十五轮：演出中（游戏界面整个藏起）——只留各段自己的说明层
  // 标题、说明
  if (X.title && !bare) { g.font = '22px "KaiTi","STKaiti",serif'; g.fillStyle = '#fff4dc'; g.shadowColor = '#000'; g.shadowBlur = 6; g.fillText(X.title, 18, 34); g.shadowBlur = 0; }
  if (X.sub && !bare) { g.font = '14px "Microsoft YaHei",sans-serif'; const tw = Math.min(w - 40, g.measureText(X.sub).width); box(g, 14, 44, tw + 14, 24); g.fillStyle = '#f3e9d2'; g.fillText(X.sub, 21, 61, w - 48); }
  // 境界徽记（bare 时这一段到「按住的键」都画成全透明：变量照常算，后面的准星、聚气环还要用）
  if (bare) g.globalAlpha = 0;
  const L = P.level, need = totalNeed(L), capped = L >= LEVEL.max, m = Gm.meditating;
  g.fillStyle = 'rgba(244,239,228,.86)'; g.fillRect(14, 76, 236, 50);
  g.font = '17px "KaiTi","STKaiti",serif'; g.fillStyle = '#3a2b1c'; g.fillText(realmLabel(L), 22, 96);
  g.font = '600 11.5px sans-serif'; g.fillStyle = '#5b5348'; g.fillText(`${L} 级`, 22 + g.measureText(realmLabel(L)).width * 1.45 + 8, 95);
  bar(g, 22, 102, 220, 5, capped ? 1 : P.qi / need, capped ? '#e0c37a' : P.qi >= need ? '#f2cf6a' : '#c08f45', 'rgba(43,42,39,.16)');
  g.font = '11px "Microsoft YaHei",sans-serif'; g.fillStyle = '#4a4238';
  const sub = capped ? '大乘大圆满 · 已达当前版本上限' : m?.zone?.ok ? `${m.zone.name}（×${m.zone.k}）· 每秒 +${P.rateAt(m.zone).toFixed(1)} · ${Math.floor(P.qi).toLocaleString('zh-CN')} / ${need.toLocaleString('zh-CN')}` : `修炼灵气 ${Math.floor(P.qi).toLocaleString('zh-CN')} / ${need.toLocaleString('zh-CN')}${P.qi >= need ? ' · 可提升' : ''}`;
  g.fillText(sub, 22, 120, 222);
  // 左下：气血、灵力、凤凰
  const qx = 18, qy = h - 84;
  g.fillStyle = 'rgba(244,239,228,.88)'; g.fillRect(qx - 8, qy - 16, 330, 80);
  g.font = '13px "KaiTi","STKaiti",serif'; g.fillStyle = '#2b2a27';
  g.fillText('气血', qx, qy - 2); g.fillText('灵力', qx, qy + 16);
  bar(g, qx + 36, qy - 11, 200, 8, U.hp / U.maxHp, '#b8402e');
  bar(g, qx + 36, qy + 8, 200, 6, M.mp / M.mpMax, '#3d7fa8');
  g.font = '11px sans-serif'; g.fillStyle = '#2b2a27';
  g.fillText(`${Math.min(Math.round(U.maxHp), Math.ceil(U.hp))} / ${Math.round(U.maxHp)}`, qx + 242, qy - 3); g.fillText(`${Math.floor(M.mp)} / ${Math.round(M.mpMax)}`, qx + 242, qy + 15);
  const b = ph.bird, info = ph.hudInfo();
  let pl = '';
  if (b && b.kind === 'strike') pl = `凤翔天击 · 剩 ${info.left.toFixed(1)} 秒 · ${info.returning ? '折返中' : info.steering ? '操控中' : '直飞'} · ${Math.round(info.dist)} 米`;
  else if (b && b.kind === 'guard') pl = `凤灵护战 · 剩 ${info.left.toFixed(1)} 秒`;
  else pl = M.cools.phoenix > 0 ? `九霄凤焰 · 冷却 ${M.cools.phoenix.toFixed(1)} 秒` : `九霄凤焰 · 可用（下一次：${PHOENIX.modes[ph.mode].name}，耗灵力 ${Math.round(ph.cost())}）`;
  g.font = '14px "KaiTi","STKaiti",serif'; g.fillStyle = '#7a2a1c'; g.fillText(pl, qx, qy + 38);
  if (b && b.kind === 'guard') { bar(g, qx + 36, qy + 46, 200, 6, ph.unit.hp / ph.unit.maxHp, '#e39a3a'); g.font = '11px sans-serif'; g.fillStyle = '#2b2a27'; g.fillText('凤凰', qx, qy + 52); g.fillText(`${Math.ceil(ph.unit.hp)} / ${Math.round(ph.unit.maxHp)}`, qx + 242, qy + 53); }
  const zs = ph.zones.length;
  if (zs) { g.font = '11px "Microsoft YaHei",sans-serif'; g.fillStyle = '#5b3a1c'; g.fillText(`火带 / 凤焰印 ${zs} 段${ph.zonesTouching(U, []).length ? ' · 主人在火中' : ''}`, qx + 150, qy + 52); }
  // 招式、按住的键
  const a = M.act;
  const st = a ? (a.key === 'phoenix' ? '起手 · 九霄凤焰' : '') : M.guarding ? (M.parrying ? '格挡 · 弹反窗口' : '格挡') : '';
  if (st) { g.font = '16px "KaiTi","STKaiti",serif'; const tw = g.measureText(st).width; box(g, qx + 330, qy - 16, tw + 20, 26, 0.45); g.fillStyle = '#fff'; g.fillText(st, qx + 340, qy + 2); }
  const ptr = Gm.pointer;
  const held = [ptr.attacking && (ph.ownsLMB() ? '左键（操控凤凰）' : '左键'), M.held.guard && '右键', A.input.keys.has('KeyW') && 'W', A.input.keys.has('KeyA') && 'A', A.input.keys.has('KeyS') && 'S', A.input.keys.has('KeyD') && 'D'].filter(Boolean).join(' + ');
  if (held) { g.textAlign = 'right'; g.font = '13px "Microsoft YaHei",sans-serif'; const tw = g.measureText('按住 ' + held).width; box(g, w - tw - 26, h - 38, tw + 14, 24, 0.45); g.fillStyle = '#e8f4ff'; g.fillText('按住 ' + held, w - 19, h - 21); g.textAlign = 'left'; }
  g.globalAlpha = 1;
  // 首领气血（第五十层）
  const F = A.boss50;
  if (X.boss && !bare && F.active && F.unit) {
    const bw = 420, bx = (w - bw) / 2, by = 92;
    g.textAlign = 'center'; g.font = '17px "KaiTi","STKaiti",serif'; g.fillStyle = '#f6e6de'; g.shadowColor = '#000'; g.shadowBlur = 4;
    g.fillText(`镇塔龙君 · 烬霄　${F.phase === 2 ? '二阶段' : '一阶段'}`, w / 2, by + 2); g.shadowBlur = 0;
    bar(g, bx, by + 9, bw, 9, F.unit.hp / Math.max(1, F.unit.maxHp), F.phase === 2 ? '#c2361f' : '#9b2a2a', 'rgba(15,8,8,.6)');
    g.font = '11px sans-serif'; g.fillStyle = '#fff'; g.fillText(`${Math.ceil(F.unit.hp)} / ${Math.round(F.unit.maxHp)}${F.state !== 'fight' ? '　（' + ({ transition: '转阶段过场 · 战斗时钟停', victory: '胜利', intro: '出场', result: '结算' }[F.state] || F.state) + '）' : ''}`, w / 2, by + 32);
    g.textAlign = 'left';
  }
  const cam = A.camera, v = new A.THREE.Vector3();
  // 仇恨（护战）：敌人头顶
  if (X.aggro) {
    g.textAlign = 'center'; g.font = '13px "Microsoft YaHei",sans-serif';
    const list = C.enemies.concat(F.active && F.unit?.alive ? [F.unit] : []);
    for (const e of list) {
      if (!e.alive || !e._ph) continue;
      v.set(e.pos.x, (e.headY ?? e.pos.y + 1.9) + 0.75, e.pos.z).project(cam);
      if (v.z > 1) continue;
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h, on = e._ph.on, val = Math.round(e._ph.v);
      const t = on ? `仇恨 ${val} · 改打凤凰` : `仇恨 ${val}`;
      const tw = g.measureText(t).width; box(g, x - tw / 2 - 6, y - 15, tw + 12, 20, 0.45);
      g.fillStyle = on ? '#ffb347' : '#f0e6d2'; g.fillText(t, x, y);
    }
    g.textAlign = 'left';
  }
  // 浮字（第二十九轮：演出中游戏把浮字一层整个藏起——录像同样不画；原来只是不再添新的，演出开头还会画出前一刀的浮字）
  g.textAlign = 'center';
  for (const p of bare ? [] : X.pops) {
    v.copy(p.p); v.y += p.t * 1.1; v.project(cam);
    if (v.z > 1) continue;
    const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
    const st2 = NUM[p.kind] || ['#fff6e0', 18];
    g.globalAlpha = Math.max(0, 1 - p.t / 0.9);
    g.font = `${st2[1]}px ${/^[\d+\-.]+$/.test(p.txt) ? '"Microsoft YaHei",sans-serif' : '"KaiTi","STKaiti",serif'}`;
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(p.txt, x, y);
    g.fillStyle = st2[0]; g.fillText(p.txt, x, y);
    g.globalAlpha = 1;
  }
  // 聚气（提升修为）的进度环
  if (P.asc) {
    const k = Math.min(1, P.asc.t / ASCEND.gather), cx = w / 2, cy = h * 0.4;
    g.lineWidth = 6; g.strokeStyle = 'rgba(30,24,16,.45)'; g.beginPath(); g.arc(cx, cy, 44, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#f2cf6a'; g.beginPath(); g.arc(cx, cy, 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.stroke();
    g.font = '15px "KaiTi","STKaiti",serif'; g.fillStyle = '#fff4dc'; g.shadowColor = '#000'; g.shadowBlur = 5;
    g.fillText(`聚气 · 冲击 ${realmLabel(L + 1)}`, cx, cy + 66); g.font = '13px sans-serif'; g.fillText(`${(k * 100).toFixed(0)}%`, cx, cy + 5); g.shadowBlur = 0;
  }
  // 凤翔天击的准星
  if (info.active && info.kind === 'strike') {
    const cx = w / 2, cy = h / 2;
    g.strokeStyle = info.returning ? '#e94b35' : info.steering ? '#ffd27a' : 'rgba(255,240,210,.7)'; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, 13, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(cx - 22, cy); g.lineTo(cx - 8, cy); g.moveTo(cx + 8, cy); g.lineTo(cx + 22, cy); g.stroke();
  }
  // 横幅、提示
  if (X.banner) {
    const k = X.banner.t, al = Math.min(1, k / 0.25, (2.8 - k) / 0.5);
    g.globalAlpha = Math.max(0, al);
    g.font = '40px "KaiTi","STKaiti",serif'; g.fillStyle = '#fff4dc'; g.shadowColor = '#000'; g.shadowBlur = 10; g.fillText(X.banner.t1, w / 2, h * 0.24);
    g.font = '17px "KaiTi","STKaiti",serif'; g.fillText(X.banner.t2, w / 2, h * 0.24 + 30); g.shadowBlur = 0; g.globalAlpha = 1;
  }
  let ty = h - 150;
  for (const t of X.toasts.slice(-3).reverse()) {
    g.globalAlpha = Math.max(0, Math.min(1, (3.5 - t.t) / 0.5));
    g.font = '14px "Microsoft YaHei",sans-serif';
    const tw = Math.min(w - 120, g.measureText(t.txt).width);
    g.fillStyle = 'rgba(244,239,228,.9)'; g.fillRect(w / 2 - tw / 2 - 12, ty - 18, tw + 24, 26);
    g.fillStyle = '#2b2a27'; g.fillText(t.txt, w / 2, ty, w - 130);
    ty -= 30; g.globalAlpha = 1;
  }
  g.textAlign = 'left';
  if (X.extra) { g.save(); X.extra(g, w, h, A); g.restore(); }     // 第二十二轮：各段录像自己的说明层（反击强化、剑阵用的剑、伤害对照……）
  return cv.toDataURL('image/jpeg', 0.9);
}
// 录完：帧分批上传为 docs/screenshots/<前缀><序号>.jpg；音效记录存为 docs/screenshots/<前缀>events.jpg（其实是 JSON，取出后改名）
export async function flush({ batch = 40 } = {}) {
  const fr = window.__recFrames || [], ev = window.__recEvents, prefix = ev?.prefix || 'r21_rec_';
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

// =====================================================================================
// 镜头与小工具
// =====================================================================================
const keys = (...k) => { const I = Q().input; I.keys.clear(); for (const x of k) I.keys.add(x); };
// 镜头在人物身后（镜头的 yaw 就是它看的方向：yaw = 人物朝向 → 在身后顺着看；yawOff 偏到一侧）
function behind(yawOff = 0.35, pitch = 0.16, dist = 6.5) { const A = Q(), P = A.player; A.cam.set(P.heading + yawOff, pitch, dist); A.cam.snap(P.pos.clone().setY(P.pos.y + 1.55)); }
// 镜头从主人身后朝 (x, z) 方向看（转动镜头 = 转动鼠标）
function aimYaw(x, z) { const P = Q().player.pos; return Math.atan2(x - P.x, z - P.z); }
// 让凤凰朝 target 飞：把镜头的瞄准方向逐帧转向「凤凰 → 目标」（玩家拖动鼠标瞄准；每帧最多转 rate 弧度）
function steerTo(target, rate = 0.06) {
  const A = Q(), b = A.phoenix.bird; if (!b) return;
  const d = new A.THREE.Vector3(target.x - b.pos.x, target.y - b.pos.y, target.z - b.pos.z).normalize();
  const yaw = Math.atan2(d.x, d.z), pitch = -Math.asin(Math.max(-1, Math.min(1, d.y)));
  const cam = A.cam, dy = Math.atan2(Math.sin(yaw - cam.yaw), Math.cos(yaw - cam.yaw));
  cam.yaw += Math.max(-rate, Math.min(rate, dy));
  cam.pitch += Math.max(-rate, Math.min(rate, pitch - cam.pitch));
}
function hpLock() { const U = Q().combat.playerUnit; U.hp = U.maxHp; }

// =====================================================================================
// 一、修为
// =====================================================================================
export async function scnGrowth() {
  const A = Q(), P = A.prog, Gm = A.game, M = A.moves;
  await G.arena(); G.skyQuiet(false); B.quietDragons(true);
  G.fresh(); A.combat.forceHud = false;
  P.debugSetLevel(21, { qi: totalNeed(21) - 720 });
  Gm.startMeditate('pool');
  play(0.5);
  recStart({ prefix: 'r21a_', title: '一 · 修为：打坐吸收修炼灵气', sub: '灵池静修台在池底灵脉上（高浓度 ×4）：本级基础吸收 28.03/秒 × 4 = 112.1/秒；只在主动打坐时吸收（与战斗灵力分开）' });
  play(7.2);
  recSub('灵气已足：起身，按 L 打开修为面板「提升修为」——脱战 5 秒、存活、安全；聚气 3.4 秒，期间移动、受击都会中断');
  Gm.endMeditate(); play(1.0);
  Gm.startAscend(); play(ASCEND.gather + 0.4);
  recSub('一次性提交：扣除本级总需求 13455，余量保留；气血、灵力上限按等级重算（已损失的量不补）');
  play(2.4);
  recSub('聚气中途移动：中断——灵气、等级都不变（演示：灵气直接给足）');
  P.debugSetLevel(22, { qi: totalNeed(22) + 80 }); play(0.6);
  Gm.startAscend(); play(1.4); keys('KeyW'); play(0.35); keys(); play(2.0);
  recSub('大境界突破（演示：直接到 32 级，灵气给足）：基础 38389 + 突破额外 30711（80%）= 69100');
  P.debugSetLevel(32, { qi: totalNeed(32) + 15 }); behind(0.4, 0.2, 6.5); play(1.2);
  Gm.startAscend(); play(ASCEND.gather + 2.6);
  recSub('升到 99 级（演示：直接到 98 级）：大乘大圆满 · 已达当前版本上限；飞升上界后续开放，剩余灵气记入累计');
  P.debugSetLevel(98, { qi: totalNeed(98) + 300 }); play(1.0);
  Gm.startAscend(); play(ASCEND.gather + 2.8);
  recSub('上限之后打坐：修炼灵气不再积累');
  Gm.startMeditate('free'); play(3.0); Gm.endMeditate(true); play(0.6);
  const out = recStop();
  P.debugSetLevel(21, { qi: 0 });
  return out;
}

// =====================================================================================
// 二、凤翔天击：起手、左键操控、撞击（主目标 1.0 + 周围 0.35）、火带与凤焰印、火中治疗、凤焰弹反
// =====================================================================================
export async function scnStrike() {
  const A = Q(), P = A.prog, M = A.moves, C = A.combat, ph = A.phoenix, ptr = A.game.pointer;
  await G.arena(); G.skyQuiet(false); B.quietDragons(true);
  P.debugSetLevel(21, { qi: 0 });
  G.ringSpot(6); A.combat.forceHud = true; ph.mode = 'strike';
  const [s1, s2, s3, el] = G.foes([['shade', 12, -2.6], ['shade', 12.5, 2.5], ['shade', 15, -3], ['elite', 13.5, 0.3]], { hp: 600 });
  behind(0.15, 0.25, 6); play(0.4);
  // 侧上方机位（比试圈东侧、高 9 米）：看得到起飞、转向、俯冲与撞击；操控仍按玩家的镜头（看不见的那一个）瞄准
  const R = window.__r21ring, side = { pos: new A.THREE.Vector3(R.cx + 13, R.y + 9, R.cz + 2), at: new A.THREE.Vector3(R.cx - 1, R.y + 2, R.cz - 2) };
  recStart({ prefix: 'r21b_', title: '二 · 九霄凤焰 · 凤翔天击（3）', sub: '按 3 召出凤凰：扣灵力上限的 30%（只在放出时扣）、进 90 秒冷却（两种模式共用）；同时最多一只' });
  play(0.6);
  const cam = A.cam;
  cam.pitch = -0.2;
  M.press('phoenix', true); play(0.45);
  A.freeCam = side;
  play(0.25);
  recSub('（侧上方机位）飞行中按住左键：凤凰朝镜头瞄准的方向转（上下左右，每秒最多 150°）；松开保持方向。路径下方每 1.5 米一段火带');
  ptr.setAttack(false); ptr.setAttack(true);
  const y0 = cam.yaw;
  play(0.35, () => { cam.yaw += (y0 - 0.3 - cam.yaw) * 0.2; });
  recSub('（侧上方机位）瞄准魔将俯冲：主目标 1.0 × D_cast（魔将 24 级同为金丹：×1）、周围 0.35（寻常魔修低一个大境界：×2），凤凰爆开');
  play(2.4, () => { const tp = el.pos.clone(); tp.y += 1.0; steerTo(tp, 0.09); if (!ph.bird) return false; });
  ptr.setAttack(false);
  play(1.6);
  A.freeCam = null; behind(0.1, 0.3, 7);
  recSub('撞击处一枚凤焰印（半径 4 米、20 秒）；敌人在火中每 0.5 秒受 0.01 × D_cast（低境界 ×2）');
  play(1.6);
  // 主人走进火里
  recSub('主人站进自己的火里：每 0.5 秒恢复施法时最大生命的 3%（每秒 6%）；重叠的火带、印记共用间隔，不叠加');
  C.playerUnit.hp = C.playerUnit.maxHp * 0.5; C.noRegen = true;
  const seal = ph.zones.find((z) => z.kind === 'seal');
  // W 朝镜头的方向走：镜头对准印记中心
  if (seal) { A.player.heading = aimYaw(seal.c.x, seal.c.z); cam.set(A.player.heading, 0.2, 6.5); }
  keys('KeyW');
  play(5.0, () => { if (seal) cam.yaw = aimYaw(seal.c.x, seal.c.z); if (!seal || Math.hypot(A.player.pos.x - seal.c.x, A.player.pos.z - seal.c.z) < 1.5) { keys(); return false; } });
  keys(); cam.set(A.player.heading + 0.5, 0.24, 6.5);
  keys(); play(2.6);
  // 火里弹反
  recSub('站在火里真实弹反（右键）成功：周围 5 米一道冲击 0.15 × D_cast（不暴击、不秒杀、不耗灵力），共用 1 秒冷却');
  const yaw = A.player.heading, f = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const atk = (e, side = 0) => { e.pos.set(A.player.pos.x + f.x * 1.8 + Math.cos(yaw) * side, A.player.pos.y, A.player.pos.z + f.z * 1.8 - Math.sin(yaw) * side); e.yaw = yaw + Math.PI; e.state = 'chase'; e.stunT = 0; e.cool = 0; e.begin('melee'); e.cool = 99; };
  cam.set(yaw + 1.1, 0.22, 5.2);
  // 时间线：0 秒、0.8 秒、2.0 秒各一只出手（第二下离第一下约 0.8 秒：照常弹反、冲击在 1 秒冷却里不追加；第三下冷却已过）
  const w1 = s1.cfg.windup, plan = [[0, s1, 0], [0.8, s2, 0.5], [2.0, s3, -0.5]], evs = [];
  for (const [at, e, sd] of plan) {
    evs.push([at, () => atk(e, sd)], [at + w1 - 0.1, () => C.setGuard(true)], [at + w1 + 0.15, () => C.setGuard(false)]);
    if (at === 0.8) evs.push([at + w1 + 0.2, () => recSub('第二下离第一下约 0.8 秒：照常弹反，只是在 1 秒冷却里不追加冲击；第三下冷却已过，再一道')]);
  }
  evs.sort((a, b) => a[0] - b[0]);
  let k = 0, tt = 0;
  play(3.4, () => { while (k < evs.length && evs[k][0] <= tt + 1e-9) evs[k++][1](); tt += 1 / 60; });
  C.setGuard(false); play(0.8);
  recSub('按 4 切换模式：只影响下一次召唤（已放出的凤凰不变）');
  ph.switchMode(); A.ui.toast(`九霄凤焰 · 下一次召唤：<b>${PHOENIX.modes[ph.mode].name}</b>`); play(2.0);
  ph.mode = 'strike';
  const out = recStop();
  C.noRegen = false; A.combat.forceHud = false; G.clearFoes();
  return out;
}

// =====================================================================================
// 三、凤灵护战：调度、伤害、隐藏仇恨（满 100 改打凤凰、打中凤凰 −30）、凤凰的气血
// =====================================================================================
export async function scnGuard() {
  const A = Q(), P = A.prog, M = A.moves, C = A.combat, ph = A.phoenix;
  await G.arena(); G.skyQuiet(false); B.quietDragons(true);
  P.debugSetLevel(21, { qi: 0 });
  G.ringSpot(6); A.combat.forceHud = true;
  G.foes([['shade', 5.5, -2.6], ['shade', 6.5, 2.4], ['elite', 8.5, 0]], { active: true, hp: 1500 });
  behind(0.55, 0.24, 8.5); play(0.3, hpLock);
  // 侧上方机位（比试圈东侧）：主人不动，整场都看得到凤凰、魔修与仇恨标记
  const R = window.__r21ring;
  A.freeCam = { pos: new A.THREE.Vector3(R.cx + 12, R.y + 7.5, R.cz + 7), at: new A.THREE.Vector3(R.cx - 0.5, R.y + 2.0, R.cz + 1) };
  recStart({ prefix: 'r21c_', title: '三 · 九霄凤焰 · 凤灵护战（4 切换后按 3）', sub: '（侧上方机位）凤凰随身 30 秒，气血 = 召唤时主人的最大生命（之后独立）；优先打主人锁定的、正在打主人的、范围内最近的敌人', aggro: true });
  ph.mode = 'guard'; M.press('phoenix', true);
  play(4, hpLock);
  recSub('凤焰弹 0.18（冷却 2.5 秒）、掠翼突袭 0.22（6 秒）、吐息完整命中 0.25（8 秒）× D_cast；公共间隔 2.5 秒；不秒杀、不留火');
  play(8, hpLock);
  recSub('隐藏仇恨：凤凰每次完整攻击 +25 + 伤害贡献（最多 +40）；3 秒没挨打每秒 −5；满 100 在决策时机改打凤凰（至少 2 秒），打中凤凰一次 −30');
  play(10, hpLock);
  recSub('（演示里主人的气血每帧补满，专看凤凰）30 秒到时凤凰消散，敌人回到原来的选敌');
  play(9.5, hpLock);
  const out = recStop();
  A.freeCam = null;
  A.combat.forceHud = false; G.clearFoes(); ph.clear('test'); ph.mode = 'strike';
  return out;
}

// =====================================================================================
// 四、第五十层：护战的凤凰与龙君（仇恨满了龙君改打凤凰）、凤翔天击撞向龙君、火中久站时龙君更常出逼退招式、秒杀走正常的转阶段
// =====================================================================================
export async function scnBoss() {
  const A = Q(), P = A.prog, M = A.moves, C = A.combat, ph = A.phoenix, F = A.boss50, ptr = A.game.pointer;
  const B16 = await import('/tools/r16_boss_bot.js');
  if (A.world.name !== 'boss50') { await A.game.towerRoom.enter(); B.tick(30, 1 / 60, false); await F.enter(); B.tick(60, 1 / 60, false); }
  if (F.state === 'dormant') { F.debug.start(); B.tick(30, 1 / 60, false); F.debug.skip(); B.tick(90, 1 / 60, false); }
  G.skyQuiet(false);
  P.debugSetLevel(21, { qi: 0 }); for (const k in M.cools) M.cools[k] = 0; M.mp = M.mpMax;
  B16.stage({ d: 9 }); F.B.gapT = 1.2;
  const lookBoss = (off = 0.35, pitch = 0.2, dist = 9) => { const yaw = aimYaw(F.root.x, F.root.z); A.player.heading = yaw; A.cam.set(yaw + off, pitch, dist); };
  lookBoss(); play(0.4, hpLock);
  recStart({ prefix: 'r21d_', title: '四 · 第五十层：凤凰与龙君', sub: '凤灵护战：凤焰弹、掠翼、吐息打龙君；仇恨满了，龙君在出招的决策时机改打凤凰（预警、冷却照常）', boss: true, aggro: true });
  ph.mode = 'guard'; M.press('phoenix', true);
  play(11, () => { hpLock(); });
  recSub('龙君的范围招式扫到凤凰：这一次攻击仇恨 −30（只减一次）；凤凰不停出手，仇恨又涨回来，满 100 就改打凤凰');
  play(15, () => { hpLock(); });
  // 凤翔天击撞向龙君
  recSub('凤翔天击撞向龙君（演示：跳过 90 秒冷却）：首次有效命中 1.0 × D_cast，龙身下留火；龙君 32 级同为金丹，不克制');
  ph.clear('test'); M.cools.phoenix = 0; M.mp = M.mpMax; ph.mode = 'strike';
  B16.stage({ d: 10 }); F.B.gapT = 3; lookBoss(0.2, 0.14, 8);
  const caps = () => { const pl = A.player.pos; const c = F.rig.caps.slice().sort((a, b) => a.a.distanceTo(pl) - b.a.distanceTo(pl))[0]; return c.a.clone().add(c.b).multiplyScalar(0.5); };
  play(0.3, hpLock);
  M.press('phoenix', true); play(0.6, hpLock);
  ptr.setAttack(false); ptr.setAttack(true);
  play(2.0, () => { hpLock(); steerTo(caps(), 0.1); if (!ph.bird) return false; });
  ptr.setAttack(false); play(0.8, hpLock);
  recSub('主人在自己的火里连续站 2.5 秒以上：龙君更常出有清楚预警的逼退招式（落点、雷印、碎岳，权重 ×3，冷却照常）');
  const seal = ph.zones.find((z) => z.kind === 'seal') || ph.zones[0];
  if (seal) { const c = seal.c || seal.a; A.player.place(c.x, c.z, aimYaw(F.root.x, F.root.z), A.player.pos.y); lookBoss(0.5, 0.25, 9.5); }
  play(9, hpLock);
  // 秒杀：一阶段 → 正常的阶段耗尽与转阶段过场
  recSub('秒杀（演示：把这一次的随机数固定为 0；实际概率 0.5%）：走龙君自己的阶段耗尽——转阶段过场照常，二阶段另起满血一条');
  ph.clear('test'); M.cools.phoenix = 0; M.mp = M.mpMax;
  B16.stage({ d: 10 }); F.B.gapT = 3; lookBoss(0.2, 0.14, 8);
  const keepR = ph.rand; ph.rand = () => 0;
  M.press('phoenix', true); play(0.6, hpLock);
  ptr.setAttack(false); ptr.setAttack(true);
  play(2.0, () => { hpLock(); steerTo(caps(), 0.1); if (!ph.bird) return false; });
  ptr.setAttack(false); ph.rand = keepR;
  play(0.5, hpLock);
  recSub('转阶段过场：战斗时钟停——凤凰、火焰、冷却、仇恨都不走；过场完毕二阶段 1300 满血开打');
  let n = 0; play(14, () => { hpLock(); if (F.state === 'fight' && ++n > 90) return false; });
  const out = recStop();
  ph.clear('test'); ph.mode = 'strike';
  return out;
}

// =====================================================================================
// 五、飞行的距离与高度：离主人 80 米自行折返（不瞬移）、回到 64 米内可再按左键操控；离地 12 米以上不生火带
// =====================================================================================
export async function scnRange() {
  const A = Q(), P = A.prog, M = A.moves, ph = A.phoenix, ptr = A.game.pointer;
  await G.arena(); G.skyQuiet(false); B.quietDragons(true);
  P.debugSetLevel(21, { qi: 0 });
  G.fresh(G.OPEN.yaw, G.OPEN); A.combat.forceHud = true; ph.mode = 'strike';
  A.cam.set(G.OPEN.yaw, -0.25, 7); A.cam.snap(A.player.pos.clone().setY(A.player.pos.y + 1.55));
  // 侧上方的远景机位（看得到主人与凤凰的整条航线）
  const P0 = A.player.pos.clone(), f = { x: Math.sin(G.OPEN.yaw), z: Math.cos(G.OPEN.yaw) }, s = { x: Math.cos(G.OPEN.yaw), z: -Math.sin(G.OPEN.yaw) };
  const far = { pos: new A.THREE.Vector3(P0.x + f.x * 40 + s.x * 70, P0.y + 42, P0.z + f.z * 40 + s.z * 70), at: new A.THREE.Vector3(P0.x + f.x * 45, P0.y + 10, P0.z + f.z * 45) };
  play(0.3);
  recStart({ prefix: 'r21e_', title: '五 · 凤翔天击：操控、距离与高度', sub: '按住左键：凤凰追镜头的瞄准方向（三维）——先拉起，再左、右、直飞；每秒最多转 150°' });
  M.press('phoenix', true); play(0.7);
  ptr.setAttack(false); ptr.setAttack(true);
  const cam = A.cam, y0 = cam.yaw;
  play(0.8, () => { cam.pitch += (-0.5 - cam.pitch) * 0.2; });
  play(0.7, () => { cam.yaw += (y0 + 0.7 - cam.yaw) * 0.15; cam.pitch += (-0.12 - cam.pitch) * 0.15; });
  play(0.8, () => { cam.yaw += (y0 - 0.6 - cam.yaw) * 0.15; });
  recSub('（远景机位）离主人 80 米：快到时提示，超过后退出手动、平滑转回主人（不瞬移）；离地 12 米以上的航段不生火带');
  A.freeCam = far;
  play(2.2, () => { cam.yaw += (y0 - cam.yaw) * 0.15; cam.pitch += (-0.2 - cam.pitch) * 0.15; if (ph.bird?.returning) return false; });
  ptr.setAttack(false);
  play(2.0, () => { if (ph.bird && !ph.bird.returning) return false; });
  recSub('回到 64 米内：再按住左键，重新接管；8 秒到时凤凰消散');
  ptr.setAttack(true);
  play(2.0, () => { cam.pitch += (0.15 - cam.pitch) * 0.1; if (!ph.bird) return false; });
  ptr.setAttack(false);
  play(4.0, () => { if (!ph.bird) return false; });
  play(1.0);
  A.freeCam = null;
  const out = recStop();
  A.combat.forceHud = false; ph.clear('test');
  return out;
}
