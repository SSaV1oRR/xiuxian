// 第十七轮：战斗调试面板（地址加 ?combatdebug=1 才出现；正式界面不显示）。
//   · 当前招式的时间轴：前摇（灰）/ 有效段（红）/ 收势（蓝），接招窗口（绿）、格挡 / 闪身 / 剑诀取消窗口（青 / 黄 / 紫的细条）、承诺段（黑），游标是此刻
//   · 格挡：举剑与否、弹反窗口剩余、弹反再开间隔、守势、反击窗口；输入：缓冲（类别、已过多久）、按住的键
//   · 目标：近战辅助 / 锁定的目标与距离
//   · 结算：最近几次出手每一段打中了几个目标、各是什么结果；对玩家的来招按「招式 id # 段」各结算了几次（应当恰好一次）
//   · 强制出招：在身前放一个魔修（残魂 / 魔将 / 术士）让它马上出手；切磋中让对手出指定的招；守关战里让龙君出指定的招
//   · 场景里：此刻这一招的判定范围（扇形 / 圆，出手段才亮）、格挡的正面弧（青；弹反窗口里转金）
import * as THREE from 'three';
import { PLAYER_COMBAT as PC } from '../game/combatConfig.js';

const css = `
#cb-debug { position: fixed; right: 10px; top: 120px; width: 360px; max-height: 70vh; overflow: auto; z-index: 30; font: 12px/1.45 ui-monospace, Consolas, monospace;
  color: #e8eef2; background: rgba(12, 16, 20, .82); border: 1px solid rgba(140, 200, 255, .3); border-radius: 6px; padding: 8px 10px; pointer-events: auto; }
#cb-debug h4 { margin: 6px 0 3px; font: 600 12px system-ui; color: #9fd4ff; }
#cb-debug .tl { position: relative; height: 34px; background: #1d252c; border-radius: 3px; margin: 3px 0 2px; }
#cb-debug .tl i { position: absolute; top: 0; height: 14px; }
#cb-debug .tl b { position: absolute; height: 3px; }
#cb-debug .tl .cur { position: absolute; top: -2px; bottom: -2px; width: 2px; background: #fff; }
#cb-debug .row { display: flex; gap: 8px; flex-wrap: wrap; }
#cb-debug .k { color: #9aa8b4; }
#cb-debug button { font: 11px system-ui; margin: 2px 2px 0 0; padding: 2px 6px; background: #2a3846; color: #dff; border: 1px solid #4a6a86; border-radius: 3px; cursor: pointer; }
#cb-debug .on { color: #ffd36a; }
#cb-debug .bad { color: #ff7a6a; }
`;

export class CombatDebug {
  constructor(game, { combat, moves, player, scene }) {
    this.g = game; this.C = combat; this.M = moves; this.P = player;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const el = this.el = document.createElement('div');
    el.id = 'cb-debug';
    el.innerHTML = `<div><b style="color:#ffd36a">战斗调试</b> <span class="k">（?combatdebug=1）</span></div>
      <h4>当前招式</h4><div class="act"></div><div class="tl"></div>
      <h4>格挡 / 输入 / 目标</h4><div class="state"></div>
      <h4>近几次出手（每段命中）</h4><div class="log"></div>
      <h4>来招结算（id#段 → 次数，应为 1）</h4><div class="inc"></div>
      <h4>强制出招</h4><div class="force">
        <div>魔修：<button data-f="shade:melee">残魂·爪</button><button data-f="elite:melee">魔将·剑</button><button data-f="elite:slam">魔将·震地</button><button data-f="caster:cast">术士·魔弹</button></div>
        <div class="duel">切磋对手：${['slashA', 'slashB', 'slashC', 'thrust', 'lunge', 'slam'].map((k) => `<button data-d="${k}">${k}</button>`).join('')}</div>
        <div class="boss">龙君：${['claw1', 'claw2', 'tailsweep', 'combo3', 'charge', 'slam', 'breath', 'orbs', 'thunder'].map((k) => `<button data-b="${k}">${k}</button>`).join('')}</div>
        <div><label><input type="checkbox" data-g="gizmo" checked> 场景里画判定范围与格挡弧</label></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      const f = e.target.closest('[data-f]')?.dataset.f, d = e.target.closest('[data-d]')?.dataset.d, b = e.target.closest('[data-b]')?.dataset.b;
      if (f) { const [kind, act] = f.split(':'); this.forceEnemy(kind, act); }
      if (d) { const du = this.C.duelists.find((x) => x.alive); if (du) { du.ai = 'attack'; du.startCombo([d]); } }
      if (b) this.g.boss50?.debug.move(b);
    });
    el.querySelector('[data-g="gizmo"]').addEventListener('change', (e) => { this.gizmoOn = e.target.checked; });
    this.gizmoOn = true;
    this.q = (s) => el.querySelector(s);
    // 来招结算计数：combat.emitHit 的事件里带着 spec（id、段）
    this.inc = new Map();
    combat.hitListeners.add((e) => {
      if (e.target !== combat.playerUnit || !e.spec?.id) return;
      const k = `${e.spec.id}#${e.spec.seg ?? 0}`;
      const o = this.inc.get(k) || { n: 0, r: [] };
      o.n++; o.r.push(e.result); this.inc.set(k, o);
      if (this.inc.size > 40) this.inc.delete(this.inc.keys().next().value);
    });
    // 场景里的范围
    this.sector = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    this.sector.rotation.x = -Math.PI / 2; this.sector.renderOrder = 6; this.sector.visible = false;
    this.arc = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 40, 1, Math.PI / 2 - PC.guard.arc / 2, PC.guard.arc), new THREE.MeshBasicMaterial({ color: 0x6adfff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    this.arc.rotation.x = -Math.PI / 2; this.arc.renderOrder = 6; this.arc.visible = false;
    this.moveTo(scene);
    this.t = 0;
  }
  moveTo(scene) { scene.add(this.sector); scene.add(this.arc); }

  // 在身前 2.2 米放一个魔修，让它马上出手
  forceEnemy(kind, act) {
    const C = this.C, P = this.P;
    const d = act === 'cast' ? 8 : kind === 'elite' ? 2.6 : 2.0;
    const f = { x: Math.sin(P.heading), z: Math.cos(P.heading) };
    let e = C.enemies.find((x) => x.alive && x.kind === kind && x.world === C.worldName && x.dbg);
    if (!e) { e = C.spawn(kind, { x: P.pos.x + f.x * d, y: P.pos.y, z: P.pos.z + f.z * d }, { yaw: P.heading + Math.PI }); e.dbg = true; }
    e.state = 'chase'; e.slamCool = act === 'slam' ? 0 : 99;
    e.begin(act);
  }

  update(dt) {
    this.t += dt;
    const M = this.M, a = M.act, D = a?.def, P = this.P;
    // ---- 场景里的范围 ----
    const h = D?.hits?.find((x) => a && Math.abs(a.t - x.t) < 0.12);
    if (this.gizmoOn && h && !a.react) {
      const lv = Math.max(0, (a.level || 1) - 1), pick = (v) => (Array.isArray(v) ? v[Math.min(lv, v.length - 1)] : v);
      const r = h.aoe ?? pick(h.range), arc = h.aoe ? Math.PI * 2 : (h.arc ?? 120) * Math.PI / 180;
      const key = `${r}|${arc}`;
      if (this.sector.userData.key !== key) { this.sector.geometry.dispose(); this.sector.geometry = new THREE.CircleGeometry(1, 40, Math.PI / 2 - arc / 2, arc); this.sector.userData.key = key; }
      const c = h.aoe ? M.slamCenter() : P.pos;
      this.sector.position.set(c.x, P.pos.y + 0.09, c.z);
      this.sector.scale.set(r, r, 1);
      this.sector.rotation.z = P.heading + Math.PI;            // 扇形的中线（局部 +Y）转到人物朝向
      this.sector.material.color.set(Math.abs(a.t - h.t) < 0.02 ? 0xffe070 : 0xff4a3a);
      this.sector.visible = true;
    } else this.sector.visible = false;
    if (this.gizmoOn && M.guarding) {
      this.arc.position.set(P.pos.x, P.pos.y + 0.1, P.pos.z);
      this.arc.rotation.z = P.heading + Math.PI;
      this.arc.material.color.set(M.parrying ? 0xffd36a : 0x6adfff);
      this.arc.visible = true;
    } else this.arc.visible = false;
    // ---- 面板（每 0.1 秒刷一次）----
    if ((this.ui = (this.ui || 0) + dt) < 0.1) return;
    this.ui = 0;
    const f2 = (v) => (v == null ? '-' : (+v).toFixed(2));
    if (a) {
      const end = a.react ? a.end : D.end ?? 1, sp = D.speed ?? 1;
      const ph = D.active ? (a.t < D.active[0] ? '前摇' : a.t <= D.active[1] ? '<span class="bad">有效</span>' : '收势') : D.release != null ? (a.t < D.release ? '前摇（未放出）' : '已放出') : '';
      this.q('.act').innerHTML = `<b class="on">${a.key}</b>${a.level ? ` 档${a.level}` : ''} · 动作 ${a.clip} · t ${f2(a.t)} / ${f2(end)}（×${sp}）· ${ph}${M.counterFor?.(a) ? ' · <span class="on">反击</span>' : ''}${a.target ? ` · 对准 ${a.target.cfg?.name || a.target.kind}` : ''}`;
      const W = (x) => `${Math.max(0, Math.min(100, (x / end) * 100)).toFixed(1)}%`;
      let html = '';
      const seg = (x0, x1, col, top = 0, hgt = 14) => { if (x1 <= x0) return; html += `<i style="left:${W(x0)};width:calc(${W(x1)} - ${W(x0)});background:${col};top:${top}px;height:${hgt}px"></i>`; };
      if (D.windup) seg(D.windup[0], D.windup[1], '#55606a');
      if (D.active) { seg(D.active[0], D.active[1], '#d0463a'); seg(D.active[1], end, '#3a6a9a'); }
      if (D.commit) seg(D.commit[0], Math.min(end, D.commit[1]), '#000', 15, 3);
      if (D.chain) seg(D.chain[0], Math.min(end, D.chain[1]), '#5fd06a', 19, 3);
      const wins = D.cancel || {};
      (wins.guard || []).forEach(([x0, x1]) => seg(x0, Math.min(end, x1), '#5ad8ff', 23, 3));
      (wins.dodge || []).forEach(([x0, x1]) => seg(x0, Math.min(end, x1), '#ffd36a', 27, 3));
      (wins.skill || []).forEach(([x0, x1]) => seg(x0, Math.min(end, x1), '#c08aff', 31, 3));
      (D.hits || []).forEach((x) => seg(x.t - 0.004, x.t + 0.004, '#fff'));
      html += `<span class="cur" style="left:${W(a.t)}"></span>`;
      this.q('.tl').innerHTML = html;
    } else { this.q('.act').innerHTML = `<span class="k">无</span>${M.guarding ? ' · 举剑' : ''}`; this.q('.tl').innerHTML = ''; }
    const G = PC.guard;
    const b = M.buffer;
    const T = M.lock?.alive ? M.lock : M.target?.alive ? M.target : null;
    this.q('.state').innerHTML = `
      <div class="row"><span>举剑 <b class="${M.guarding ? 'on' : ''}">${M.guarding ? '是' : '否'}</b></span><span>弹反窗口 <b class="${M.parrying ? 'on' : ''}">${M.parrying ? f2(M.parryUntil - M.time) : '-'}</b></span>
        <span>再开 ${f2(Math.max(0, G.parryCooldown - (M.time - M.parryOpenT)))}</span><span>守势 ${Math.round(M.guardHP)}${M.time < M.guardLock ? ' <b class="bad">破防</b>' : ''}</span>
        <span>反击 ${M.countering ? f2(M.counterUntil - M.time) : '-'}</span><span>无敌 ${f2(M.iframes)}</span></div>
      <div class="row"><span>缓冲 ${b ? `<b class="on">${b.kind}</b> ${(M.time - b.t).toFixed(3)}s` : '-'}</span><span>按住 ${Object.entries(M.held).filter(([, v]) => v).map(([k]) => k).join(' ') || '-'}</span>
        <span>输入 ${M.stat.inputs}</span><span>开窗 ${M.stat.parryWindows} / 弹反 ${M.stat.parries} / 格挡 ${M.stat.blocks} / 破防 ${M.stat.breaks}</span></div>
      <div class="row"><span>${M.lock ? '锁定' : '辅助'} ${T ? `${T.cfg?.name || T.kind} ${Math.hypot(T.pos.x - P.pos.x, T.pos.z - P.pos.z).toFixed(1)}m` : '-'}</span><span>顿帧 ${this.C.stopCount}</span><span>帧率 ${this.g.fps ?? window.__qinglan?.fps ?? '-'}</span></div>`;
    this.q('.log').innerHTML = M.log.slice(-7).reverse().map((L) => {
      const byIdx = {};
      for (const r of L.results) (byIdx[r.i] ||= []).push(r.r);
      const segs = Object.entries(byIdx).map(([i, rs]) => `段${i}:${rs.length}（${[...new Set(rs)].join('/')}）`).join(' ');
      return `<div>#${L.id} <b>${L.key}</b> ${segs || '<span class="k">未命中</span>'} <span class="k">${L.act.endReason || '进行中'}</span></div>`;
    }).join('');
    this.q('.inc').innerHTML = [...this.inc.entries()].slice(-8).reverse().map(([k, o]) => `<div class="${o.n > 1 ? 'bad' : ''}">${k} → ${o.n}（${o.r.join(',')}）</div>`).join('') || '<span class="k">-</span>';
    this.q('.duel').style.display = this.C.duelists.some((x) => x.alive) ? '' : 'none';
    this.q('.boss').style.display = this.g.boss50?.fighting ? '' : 'none';
  }
}
