// 第十五轮：演武场的切磋流程（场地见 world/arenaSite.js，对手见 game/duel.js）。
// 与教习交互 → 演武选择（对手、难度、方式、当前佩剑）→ 整备（载入对手的模型与佩剑，失败给出原因，可重试或取消）→ 入场就位 →
// 倒计时（双方都不能出手、不能走动）→ 交手 → 结算（胜负、用时、造成与承受的伤害、有效格挡、精准格挡、闪身、最高连击）→ 再战 / 换对手 / 返回。
// 统计全部来自战斗系统的伤害结算事件（combat.emitHit）。正式切磋击败对手记首胜与最佳用时（存档），不发修为、灵石或物品。
// 玩家气血耗尽只判负、原地复原，不走宗门的「力竭醒来」，也没有任何惩罚。
// 退出、再战、结算后拆掉对手（模型、材质、骨骼贴图、血条、预警圈）与事件监听，并清掉鼠标、键盘的按住状态。
// 打开界面（设置、舆图……）时切磋暂停：对手不动，计时停走。
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Cultivator } from '../actors/cultivator.js';
import { Duelist, OPPONENTS, DIFFS } from './duel.js';
import { ARENA } from '../world/arenaSite.js';
import { ASSETS } from '../world/assets.js';
import { PLAYER_COMBAT } from './combatConfig.js';
import { freeGpu } from './swords.js';

export const MODES = {
  free: { name: '自由练习', desc: '对手不主动出手，放心试招、练连击与格挡；按 U 让他隔一阵出一剑（前摇放慢），按 H 复原双方气血。' },
  formal: { name: '正式切磋', desc: '正常攻守，一方气血耗尽即分胜负。点到为止，不伤性命，也没有彩头。' },
};
const OPP_KEYS = ['disciple', 'instructor', 'elder'], DIFF_KEYS = ['easy', 'normal', 'hard'];
const LO_URL = 'assets/converted/figure/cultivator_lo.glb';      // 对手用减面版（独立载入一份模板，从不放进场景，每场克隆）
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DIGITS = ['三', '二', '一'];
const $ = (s) => document.querySelector(s);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export class Arena {
  constructor(game, { combat, moves, player, cam, input, pointer, sfx }) {
    this.g = game; this.C = combat; this.M = moves; this.P = player; this.cam = cam; this.input = input; this.pointer = pointer; this.sfx = sfx;
    this.S = null;                 // 当前这一场
    this.tpl = null; this.tplP = null; this.res = null;
    this.onHit = (e) => this.hit(e);
    this.sessions = 0;
  }
  get active() { return !!this.S; }
  get fighting() { return this.S?.phase === 'fight'; }
  // 入场、倒计时、分出胜负之后、退场时：不能走动，也不能出手（main.js 的 combat.blocked 与 game.update 的 moveLocked 读这两个）
  get blockMove() { return !!this.S && this.S.phase !== 'fight'; }
  get blockAct() { return !!this.S && this.S.phase !== 'fight'; }

  // ---------- 演武选择 ----------
  openMenu() {
    const g = this.g, ui = g.ui, st = g.state;
    if (this.S) return;
    if (this.C.invasion || g.abyssQuest?.inv) { ui.toast('魔影袭山，演武暂停——先退敌。'); return; }
    if (this.P.flying) { ui.toast('先落地再找教习。'); return; }
    const last = st.arena.last || {};
    const sel = { opp: OPP_KEYS.includes(last.opp) ? last.opp : 'disciple', diff: DIFF_KEYS.includes(last.diff) ? last.diff : 'normal', mode: MODES[last.mode] ? last.mode : 'formal' };
    const el = document.createElement('div');
    el.className = 'ar-panel';
    const sword = this.P.char.sword || g.armory?.get(st.sword);
    el.innerHTML = `
      <div class="ar-sec"><h3>对手</h3><div class="ar-opps">${OPP_KEYS.map((k) => {
        const O = OPPONENTS[k], sw = g.armory?.get(O.sword)?.name || O.sword;
        return `<button class="ar-opp" data-opp="${k}"><span class="ar-head"><i class="ar-tint" style="background: linear-gradient(135deg, ${hex(O.tint.cloth)} 0 60%, ${hex(O.tint.trim)} 60%)"></i><span><b>${O.name}</b><small>${O.who} · 佩剑「${sw}」</small></span></span>
          <p>${O.desc}</p><div class="ar-tags">${O.tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div><div class="ar-rec" data-rec="${k}"></div></button>`;
      }).join('')}</div></div>
      <div class="ar-row">
        <div class="ar-sec"><h3>难度</h3><div class="seg ar-seg" data-k="diff">${DIFF_KEYS.map((k) => `<button data-v="${k}">${DIFFS[k].name}</button>`).join('')}</div><p class="ar-desc" data-desc="diff"></p></div>
        <div class="ar-sec"><h3>方式</h3><div class="seg ar-seg" data-k="mode">${Object.keys(MODES).map((k) => `<button data-v="${k}">${MODES[k].name}</button>`).join('')}</div><p class="ar-desc" data-desc="mode"></p></div>
      </div>
      <div class="ar-row">
        <div class="ar-sec ar-sword"><h3>佩剑</h3>${sword ? `<div class="ar-sw"><img src="assets/converted/${sword.thumb}" alt=""><div><b>${sword.name}</b><small>${sword.length.toFixed(2)} 米 · 各剑数值相同</small><button class="act ghost" data-swords>更换佩剑</button></div></div>` : '<p class="muted">佩剑未载入</p>'}</div>
        <div class="ar-sec ar-rules"><h3>规矩</h3><p>点到为止：气血耗尽即判负，不伤性命、不掉东西，也没有彩头。倒计时里双方都不能出手。比试圈就是场地，走到圈边会被拦回。切磋中按 <kbd>退格</kbd> 退出。</p></div>
      </div>
      <div class="ar-act"><button class="act" data-start>开始切磋</button><button class="act ghost" data-cancel>取消</button></div>`;
    const refresh = () => {
      for (const b of el.querySelectorAll('.ar-opp')) b.classList.toggle('on', b.dataset.opp === sel.opp);
      for (const s of el.querySelectorAll('.ar-seg')) for (const b of s.querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === sel[s.dataset.k]);
      el.querySelector('[data-desc="diff"]').textContent = DIFFS[sel.diff].desc;
      el.querySelector('[data-desc="mode"]').textContent = MODES[sel.mode].desc;
      for (const r of el.querySelectorAll('[data-rec]')) {
        const R = st.arena.records[`${r.dataset.rec}_${sel.diff}`];
        r.innerHTML = R ? `<span class="tag jade">${DIFFS[sel.diff].name} · 已胜 ${R.wins} 场 · 最佳 ${fmt(R.best)}</span>` : `<span class="tag">${DIFFS[sel.diff].name} · 尚未取胜</span>`;
      }
    };
    el.addEventListener('click', async (e) => {
      const o = e.target.closest('.ar-opp'); if (o) { sel.opp = o.dataset.opp; refresh(); return; }
      const sb = e.target.closest('.ar-seg button'); if (sb) { sel[sb.parentElement.dataset.k] = sb.dataset.v; refresh(); return; }
      if (e.target.closest('[data-swords]')) { st.setArenaLast({ ...sel }); g.openSwords({ back: () => this.openMenu() }); return; }
      if (e.target.closest('[data-cancel]')) { ui.closePanel(); this.relock(); return; }
      const start = e.target.closest('[data-start]');
      if (!start || start.disabled) return;
      start.disabled = true; start.textContent = '整备中……';
      el.querySelector('.ar-err')?.remove();
      try {
        await this.prepare(sel);
      } catch (err) {
        console.warn('演武整备失败', err);
        start.disabled = false; start.textContent = '重试';
        el.querySelector('.ar-act').insertAdjacentHTML('beforebegin', `<p class="ar-err">对手的模型或佩剑没能载入（${err?.message || err}）。可以重试，或取消返回。</p>`);
        return;
      }
      if (!ui.panelOpen || g.panelKind !== 'arena') return;        // 整备期间关掉了界面：不进场
      ui.closePanel();
      this.relock();
      this.enter({ ...sel });
    });
    g.panelKind = 'arena';
    ui.openPanel('演武', '演武教习 · 韩铮：「选好对手与难度。点到为止。」', el, { width: 900, onClose: () => { if (g.panelKind === 'arena') g.panelKind = null; } });
    refresh();
  }

  // 整备：对手用的减面人物模板与对手的佩剑（都缓存）；15 秒载不下来算失败
  prepare(sel) {
    if (!ASSETS.json.cultivator) return Promise.reject(new Error('缺少人物数据 cultivator.json'));
    const tpl = this.tpl ? Promise.resolve(this.tpl)
      : (this.tplP ||= new GLTFLoader().loadAsync(LO_URL).then((x) => (this.tpl = x)).finally(() => { this.tplP = null; }));
    const sw = this.g.armory.load(OPPONENTS[sel.opp].sword);
    let timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('载入超时')), 15000); });
    return Promise.race([Promise.all([tpl, sw]), timeout]).then(([gltf, s]) => { this.res = { gltf, sword: s }; return this.res; })
      .finally(() => clearTimeout(timer));
  }

  // ---------- 入场、倒计时 ----------
  // prev：再战时上一场（在黑场里拆掉）
  async enter(sel, prev = null) {
    const g = this.g;
    g.state.setArenaLast({ ...sel });
    this.releaseInputs();
    const S = this.S = { sel, phase: 'enter', t: 0, cd: 0, n: ++this.sessions,
      stats: { dealt: 0, taken: 0, blocks: 0, parries: 0, dodges: 0, oppBlocks: 0, landed: 0, combo: 0 }, duelist: null };
    const fade = $('#fade');
    fade.classList.add('on');
    await sleep(420);
    if (prev) this.teardown(prev);
    if (this.S !== S) { fade.classList.remove('on'); return; }
    try {
      this.setupFight(S);
    } catch (e) {
      console.error('演武场布置失败', e);
      this.teardown(S);
      fade.classList.remove('on');
      g.ui.toast('演武场布置失败：' + (e?.message || e));
      return;
    }
    fade.classList.remove('on');
    this.buildHud(S);
    S.phase = 'countdown'; S.cd = 0;
  }
  setupFight(S) {
    const C = this.C, M = this.M, P = this.P, A = ARENA, sel = S.sel, O = OPPONENTS[sel.opp];
    // 玩家：气血、灵力、冷却、剑意、连击全部复原，站到圈南
    if (this.g.meditating) this.g.endMeditate(true);
    this.g.dragon?.clear('arena');                    // 第二十三轮：切磋开打——场上的雷龙收掉
    M.reset();
    C.revive(); C.stopT = 0;
    M.mp = PLAYER_COMBAT.mp; M.intent = 0; M.lightCool = 0;
    for (const k in M.cools) M.cools[k] = 0;
    M.refillGourd();                                  // 第十九轮：回血葫芦装满
    M.combo.n = 0; M.combo.best = 0;
    P.strike = null;
    P.place(A.spawnP.x, A.spawnP.z, A.spawnP.yaw, A.y);
    P.vel.set(0, 0, 0);
    this.cam.set(A.spawnP.yaw, null, null);
    this.cam.snap(P.pos.clone().setY(A.y + 1.55));
    // 对手：独立克隆（骨架、材质、动作层、佩剑、气血、AI 各自一份），站到圈北
    const char = new Cultivator(C.scene, this.res.gltf, ASSETS.json.cultivator, { clone: true, tint: O.tint, name: 'duelist' });
    char.setSword(this.res.sword.def, this.res.sword.scene, this.res.sword.sheath);
    this.g.armory.acquire(this.res.sword.def.id); S.swordId = this.res.sword.def.id;
    const d = new Duelist({ combat: C, player: P, hud: C.hud, ring: A, sfx: this.sfx }, char, { type: sel.opp, diff: sel.diff, mode: sel.mode });
    d.place(A.spawnO.x, A.spawnO.z, A.spawnO.yaw);
    d.onDeath = () => this.opponentDown();
    C.duelists.push(d); C.duelBoss = d;
    C.forceHud = true;
    C.hitListeners.add(this.onHit);
    S.duelist = d;
  }
  buildHud(S) {
    const O = OPPONENTS[S.sel.opp], D = DIFFS[S.sel.diff], free = S.sel.mode === 'free';
    const el = document.createElement('div');
    el.id = 'duel-hud';
    el.innerHTML = `<div class="dh-title"><b>${O.who}</b><span>${D.name} · ${MODES[S.sel.mode].name}</span><i class="dh-time">0:00</i></div>
      <div class="dh-keys"><button data-k="Backspace"><kbd>退格</kbd>退出切磋</button>${free ? '<button data-k="KeyH"><kbd>H</kbd>复原气血</button><button data-k="KeyU"><kbd>U</kbd>陪练出招：<em>关</em></button>' : ''}</div>`;
    // 按钮只在鼠标未锁定时点得到；按下即处理，不冒泡到画面（不会出剑）
    el.addEventListener('pointerdown', (e) => { const b = e.target.closest('button'); if (!b) return; e.preventDefault(); e.stopPropagation(); this.key(b.dataset.k); });
    $('#hud').appendChild(el);
    const cd = document.createElement('div');
    cd.id = 'duel-count';
    $('#hud').appendChild(cd);
    S.hud = el; S.count = cd; S.timeEl = el.querySelector('.dh-time');
  }
  showCount(text, cls = '') {
    const c = this.S?.count; if (!c) return;
    c.textContent = text; c.className = cls;
    c.getAnimations().forEach((a) => a.cancel());
    c.animate([{ opacity: 0, transform: 'translate(-50%, -50%) scale(1.5)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: 0.2 },
      { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: 0.75 }, { opacity: 0, transform: 'translate(-50%, -50%) scale(0.92)' }],
    { duration: cls === 'win' || cls === 'lose' ? 1600 : 950, easing: 'ease-out', fill: 'forwards' });
  }

  // ---------- 每帧（main.js：玩家移动之后、战斗系统之前）----------
  update(dt) {
    const S = this.S;
    if (!S || !S.duelist) return;
    const g = this.g, d = S.duelist;
    // 第十七轮：已经换了场景（入塔、下秘境、进殿……）切磋就此作罢——收掉对手与界面，不再把人拦回宗门演武场的比试圈
    if (g.world && g.world !== 'surface') { this.teardown(S); return; }
    if (S.phase !== 'exiting' && (this.C.invasion || g.abyssQuest?.inv)) { this.exit('魔影袭山，切磋中止。'); return; }
    // 第二十九轮：墨里终焉的处决演出中由演出接管双方（站位、姿势、镜头）——切磋的计时、对手的 AI、圈边的拦挡都停住，交还之后照常
    if (g.finale?.active) return;
    const paused = g.ui.busy && (S.phase === 'countdown' || S.phase === 'fight');
    if (!paused) {
      if (S.phase === 'countdown') {
        const k0 = S.cd === 0 ? -1 : Math.floor(S.cd);
        S.cd += dt;
        const k1 = Math.floor(S.cd);
        if (k1 !== k0 && k1 < 3) this.showCount(DIGITS[k1]);
        if (S.cd >= 3) {
          this.showCount('开 始', 'go');
          S.phase = 'fight'; S.t = 0;
          d.active = true; d.ai = 'neutral';
          d.rest = { easy: 1.4, normal: 0.9, hard: 0.6 }[S.sel.diff];             // 开打后第一轮进攻前的间隔
          d.practiceT = 2.5;
        }
      } else if (S.phase === 'fight') {
        S.t += dt;
        if (S.timeEl) S.timeEl.textContent = fmt(S.t);
        S.stats.combo = Math.max(S.stats.combo, this.M.combo.n);
        // 自由练习：对手被击倒后片刻复原
        if (S.reviveT > 0 && (S.reviveT -= dt) <= 0) { d.revive(); d.active = true; }
      } else if (S.phase === 'result' && S.resultT > 0 && !g.ui.busy && (S.resultT -= dt) <= 0) this.showResult(S);
      d.update(dt);
    }
    if (S.phase !== 'exiting') this.keepInRing(d);
  }
  // 第二十九轮：p 是否在比试圈里（离圈边至少 margin 米）——墨里终焉的演出按它挑玩家的几处站位
  inRing(p, margin = 0.6) { return Math.hypot(p.x - ARENA.cx, p.z - ARENA.cz) <= ARENA.r - margin; }
  // 双方不重叠；玩家走到圈边被拦回（对手自己也会拦在圈内）
  keepInRing(d) {
    const P = this.P, A = ARENA;
    const dx = P.pos.x - d.pos.x, dz = P.pos.z - d.pos.z, dd = Math.hypot(dx, dz);
    let moved = false;
    if (dd < 0.95 && dd > 1e-4) { const k = (0.95 - dd) / dd; P.pos.x += dx * k; P.pos.z += dz * k; moved = true; }
    const rx = P.pos.x - A.cx, rz = P.pos.z - A.cz, rr = Math.hypot(rx, rz), max = A.r - 0.45;
    if (rr > max) {
      P.pos.x = A.cx + (rx / rr) * max; P.pos.z = A.cz + (rz / rr) * max;
      const vr = (P.vel.x * rx + P.vel.z * rz) / rr;
      if (vr > 0) { P.vel.x -= (rx / rr) * vr; P.vel.z -= (rz / rr) * vr; }
      moved = true;
      if (this.S.phase === 'fight' && performance.now() - (this.edgeToast || 0) > 5000) { this.edgeToast = performance.now(); this.g.ui.toast('已到比试圈边——切磋未完不能离场（按 <b>退格</b> 退出）'); }
    }
    if (moved) P.char.root.position.copy(P.pos);
  }

  // ---------- 统计：伤害结算事件 ----------
  hit(e) {
    const S = this.S;
    if (!S || S.phase !== 'fight') return;
    const d = S.duelist, st = S.stats, U = this.C.playerUnit;
    if (e.target === d && (e.from === U || e.from?.isPlayer)) {
      if (e.result === 'hit' || e.result === 'block') { st.dealt += e.amount; st.landed++; }
      if (e.result === 'block') st.oppBlocks++;
    } else if (e.target === U && e.from === d) {
      if (e.result === 'hit' || e.result === 'block' || e.result === 'guardbreak') st.taken += e.amount;
      if (e.result === 'block' || e.result === 'guardbreak') st.blocks++;
      if (e.result === 'guardbreak') st.breaks = (st.breaks || 0) + 1;
      else if (e.result === 'parry') st.parries++;
      else if (e.result === 'dodge') st.dodges++;
    }
  }

  // ---------- 胜负 ----------
  opponentDown() {
    const S = this.S;
    if (!S || !S.duelist) return;
    const d = S.duelist;
    d.defeat();
    // 第二十九轮：在墨里终焉的演出里击倒的——胜负（字卡、结算面板；自由练习的复原）等演出交还之后再出
    if (this.g.finale?.active) { S.downAfterFinale = true; return; }
    this.resolveDown(S);
  }
  resolveDown(S) {
    if (S.sel.mode === 'free') {                    // 自由练习：倒下片刻后复原，不判胜负
      if (S.phase === 'fight') { S.reviveT = 1.8; this.g.ui.toast('对手被击倒——片刻后复原，接着练'); }
      return;
    }
    if (S.phase === 'fight') this.finish(true);
  }
  // 第二十九轮：墨里终焉的演出交还（inkFinale 的切磋对手接口调用）：演出里击倒的，这时判胜负
  finaleDone(d) {
    const S = this.S;
    if (!S || S.duelist !== d || !S.downAfterFinale) return;
    S.downAfterFinale = false;
    this.resolveDown(S);
  }
  // combat.onPlayerDown 先问这里：切磋中气血耗尽只判负、不走宗门的「力竭醒来」；返回 true 表示已处理
  onPlayerDown() {
    const S = this.S;
    if (!S) return false;
    if (S.phase !== 'fight' || S.sel.mode === 'free') {
      this.C.revive();
      this.g.ui.toast('气血见底——教习喊停，替你稳住了气息');
      return true;
    }
    this.P.char.anim.play('Hit_Knockback', { from: 0, to: 0.83, speed: 1.0, hold: true, fade: 0.05 });
    this.finish(false);
    return true;
  }
  finish(win) {
    const S = this.S, d = S.duelist;
    S.phase = 'result'; S.win = win; S.resultT = 1.8;
    d.active = false;
    if (!win) { d.interrupt(); d.ai = 'idle'; }        // 对手收剑站定（AI 立刻停下）
    this.releaseInputs();
    this.showCount(win ? '胜' : '负', win ? 'win' : 'lose');
    if (win && S.sel.mode === 'formal') S.rec = this.g.state.arenaWin(`${S.sel.opp}_${S.sel.diff}`, S.t);
  }
  showResult(S) {
    const g = this.g, O = OPPONENTS[S.sel.opp], D = DIFFS[S.sel.diff], st = S.stats, R = S.rec;
    S.resultT = 0;
    this.releaseInputs();
    const el = document.createElement('div');
    el.className = 'ar-result';
    const rec = !S.win ? '败了不记。养足气血再来。'
      : `${R.first ? '首次战胜这一难度的对手。' : `已胜 ${R.rec.wins} 场。`}${R.best ? `最佳用时 ${fmt(R.rec.best)}（刷新）。` : `最佳用时 ${fmt(R.rec.best)}。`}`;
    el.innerHTML = `
      <div class="ar-verdict ${S.win ? 'win' : 'lose'}"><b>${S.win ? '胜' : '负'}</b><span>${S.win ? `击败${O.name}` : `败给${O.name}`}</span></div>
      <div class="kv">
        <b>对手</b><span>${O.name}（${O.who}）· ${D.name} · ${MODES[S.sel.mode].name}</span>
        <b>用时</b><span>${fmt(S.t)}（${S.t.toFixed(1)} 秒）</span>
        <b>造成伤害</b><span>${Math.round(st.dealt)}（命中 ${st.landed} 次，其中被他挡下 ${st.oppBlocks} 次）</span>
        <b>承受伤害</b><span>${Math.round(st.taken)}</span>
        <b>有效防御</b><span>${st.blocks} 次（举剑挡下：扣守势、漏过少许伤害）${st.breaks ? `，其中被破防 ${st.breaks} 次` : ''}</span>
        <b>精准格挡</b><span>${st.parries} 次（右键按下的一瞬挡住：弹反，不受伤害，对手失衡）</span>
        <b>闪身避开</b><span>${st.dodges} 次</span>
        <b>最高连击</b><span>${st.combo}</span>
        <b>记录</b><span>${rec}</span>
      </div>
      <p class="muted">演武只为砥砺剑法，不发修为、灵石或物品。</p>
      <div class="ar-act"><button class="act" data-again>再战</button><button class="act ghost" data-menu>换对手</button><button class="act ghost" data-leave>返回</button></div>`;
    let chosen = null;
    el.addEventListener('click', (e) => {
      chosen = e.target.closest('[data-again]') ? 'again' : e.target.closest('[data-menu]') ? 'menu' : e.target.closest('[data-leave]') ? 'leave' : null;
      if (!chosen) return;
      g.ui.closePanel();
      if (chosen !== 'menu') this.relock();
    });
    g.panelKind = 'arenaResult';
    g.ui.openPanel('切磋结果', `${O.name} · ${D.name} · ${MODES[S.sel.mode].name}`, el, {
      width: 640,
      onClose: () => {
        if (g.panelKind === 'arenaResult') g.panelKind = null;
        if (this.S !== S) return;
        if (chosen === 'again') this.rematch();
        else this.exit(null, chosen === 'menu' ? () => this.openMenu() : null);       // Esc、点空白处也算返回
      },
    });
  }

  // ---------- 再战、退出、拆除 ----------
  rematch() {
    const S = this.S;
    if (!S || S.phase === 'exiting') return;
    S.phase = 'exiting';
    this.enter(S.sel, S);
  }
  async exit(msg = null, then = null) {
    const S = this.S;
    if (!S || S.phase === 'exiting') return;
    S.phase = 'exiting';
    this.releaseInputs();
    const fade = $('#fade');
    fade.classList.add('on');
    await sleep(380);
    this.teardown(S);
    freeGpu(this.tpl?.scene);                      // 离场：对手模板的显存也放掉（模板留在内存，下次进场重新上传）
    // 回到台口教习身前，面朝教习；气血复原
    this.C.revive();
    const n = this.g.npcs?.jiaoxi, ry = n?.def?.ry ?? 1.32, nx = n?.pos.x ?? 46, nz = n?.pos.z ?? -106.8;
    const yaw = ry + Math.PI;
    this.P.place(nx + Math.sin(ry) * 2.6, nz + Math.cos(ry) * 2.6, yaw, ARENA.y);
    this.P.vel.set(0, 0, 0);
    this.cam.set(yaw, null, null);
    this.cam.snap(this.P.pos.clone().setY(ARENA.y + 1.55));
    fade.classList.remove('on');
    if (msg) this.g.ui.toast(msg);
    if (then) setTimeout(then, 450);
  }
  teardown(S = this.S) {
    if (!S) return;
    const C = this.C;
    C.hitListeners.delete(this.onHit);
    if (S.duelist) { S.duelist.dispose(); C.duelists = C.duelists.filter((x) => x !== S.duelist); S.duelist = null; }
    if (S.swordId) { this.g.armory.release(S.swordId); S.swordId = null; }        // 对手的佩剑没人用了就释放显存
    C.duelBoss = null; C.forceHud = false; C.stopT = 0;
    S.hud?.remove(); S.count?.remove(); S.hud = S.count = S.timeEl = null;
    this.M.reset();
    this.P.char.anim.stop(0.1);
    this.releaseInputs();
    if (this.S === S) this.S = null;
  }
  // 清掉鼠标、键盘、触屏摇杆的按住状态（开打、分出胜负、结算、退出时）：不会自己走、自己出剑或一直举着剑
  releaseInputs() {
    const I = this.input;
    I.keys.clear(); I.pressed.clear(); I.touch = { x: 0, y: 0, active: false };
    this.pointer?.releaseAll();
    this.C.setGuard(false);
    this.M.clearInput();                  // 第十七轮：左键连续攻击、蓄力、缓冲的输入一并清掉
  }
  // 点界面按钮关掉面板后直接恢复鼠标锁定（按钮的点击就是这次手势；点击发生在松开之后，不会出剑）
  relock() { const p = this.pointer; if (p && !p.locked && p.canLock?.()) p.lock(); }

  // 切磋中的按键：退格退出（第二十三轮起；X 是剑诀槽键）；自由练习 H 复原双方气血、U 陪练出招开关。返回 true 表示已处理
  key(code) {
    const S = this.S;
    if (!S || S.phase === 'exiting' || S.phase === 'enter') return false;
    if (code === 'Backspace') { this.exit('退出切磋，回到台口。'); return true; }
    if (S.sel.mode !== 'free' || !S.duelist || S.phase !== 'fight') return false;
    const d = S.duelist, C = this.C, U = C.playerUnit;
    if (code === 'KeyH') {
      if (!d.alive) { d.revive(); S.reviveT = 0; } else { d.hp = d.maxHp; d.bar.set(1); }
      if (U.alive) { U.hp = U.maxHp; C.hud.setHp(U.hp, U.maxHp); }
      this.M.mp = PLAYER_COMBAT.mp;
      this.M.refillGourd();
      this.g.ui.toast('双方气血、灵力已复原（葫芦也装满了）');
      return true;
    }
    if (code === 'KeyU') {
      d.practiceAttack = !d.practiceAttack; d.practiceT = 1.2;
      const em = S.hud?.querySelector('[data-k="KeyU"] em'); if (em) em.textContent = d.practiceAttack ? '开' : '关';
      this.g.ui.toast(d.practiceAttack ? '陪练出招：对手隔一阵出一剑，前摇放慢——练格挡与弹反' : '陪练出招：关');
      return true;
    }
    return false;
  }
}
