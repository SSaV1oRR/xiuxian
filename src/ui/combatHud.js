// 战斗界面（第十四轮重做）：画面下方居中一条「剑诀栏」——左为气血、灵力，中为五格剑诀（流云、剑气、惊鸿、破岳、万剑归宗），
// 右为闪身、格挡、服丹三个小格；每格一个楷书字作图标，冷却时自顶顺时针褪去一圈墨色并标出剩余秒数，灵力不够时转青灰，
// 万剑归宗的外圈是剑意（金色），圆满时整格泛金。另有：连击数（右侧）、魔将血条（顶部）、敌人头顶血条、伤害数字、受伤时的红晕。
// 只用实体元素（不用 ::before / ::after），连同界面截图时也画得出来。
import { PLAYER_COMBAT as PC, PHOENIX, LOADOUT } from '../game/combatConfig.js';
import { FINALE } from '../game/inkFinaleConfig.js';

// 第十七轮：多了「重」（Z 蓄力重击，蓄力时外圈按档位填金）与「缚」（1 缚灵锁）；气血、灵力之下一条守势（格挡扣、破防时转红）；
// 灵力条上起手未放出的剑诀先画出要扣的一段；弹反后的反击窗口里「流」格泛金；Tab 锁定时栏边亮一个「锁」字
// 第十九轮：「重」换成「拔」（Z 拔刀斩：外圈按蓄力的秒数填金，蓄满整格亮起）；小格多一个「葫」（2 回血葫芦，角上是还剩几口）
// 第二十一轮：多一格「凤」（3 九霄凤焰；角上是下一次的模式「翔 / 护」，4 切换；凤凰在场时整格亮着、标出剩余秒数）
// 第二十二轮：弹反后的反击强化——剑诀栏上方一枚金色小签「反击强化 ×1.5」，下沿一条随 2 秒期限缩短的细线；「流」「拔」两格泛金（只有普攻、拔刀斩吃强化）
// 第二十三轮：剑诀栏 = 「流」（左键普攻，固定）+ 六个装备槽（槽键 Q X R V 1 3；格子里是这一格装的剑诀，空格显示「空」）+ 小格（闪身、格挡、葫芦、服丹——不占槽）
const MINIS = [['dodge', 'C'], ['guard', '右键'], ['gourd', '2'], ['pill', 'G']];
const SHORT = { slash: '流云', power: '拔刀', qi: '剑气', dash: '惊鸿', heavy: '破岳', seal: '缚灵', ult: '万剑', phoenix: '凤焰', dragon: '雷龙', dodge: '闪身', guard: '格挡', gourd: '葫芦', pill: '服丹' };
const DENY = { mp: '灵力不足', cool: '尚在调息', intent: '剑意未满', none: '行囊里没有养元丹', full: '气血充盈，不必服丹', indoor: '屋里施展不开', nolock: '身前没有可锁定的对手', guard: '守势已破，暂时举不起剑',
  sated: '气血充盈，不必饮用', empty: '葫芦已空（打坐调息时装满）',
  locked: '九霄凤焰：金丹初期解锁', one: '凤凰已在身边（同时只能一只）', asset: '凤凰素材没载入',
  // 第二十三轮：装备槽与雷龙破虚
  unequipped: '这一式没有装备（按 K 打开剑诀面板）', slotEmpty: '这一格还没有装备剑诀（按 K 装备）',
  dragonLocked: '雷龙破虚：金丹初期解锁', dragonOne: '雷龙已在场（同时只能一条）', dragonAsset: '雷龙素材没载入', dragonPoint: '这里放不了雷龙破虚' };

export class CombatHud {
  constructor({ onSkill, onGuard, onHold } = {}) {
    const hud = document.querySelector('#hud');
    const root = this.root = document.createElement('div');
    root.id = 'combat-hud';
    const slot = ([k, key], cls) => {
      const S = PC.skills[k];
      return `<button class="${cls}" data-k="${k}" title="${S.name}"><span class="g">${S.glyph}</span><i class="cd"></i><b class="left"></b><kbd>${key}</kbd>${cls === 'slot' ? `<em>${SHORT[k]}</em>` : ''}${k === 'pill' || k === 'gourd' ? '<small class="n">0</small>' : ''}</button>`;
    };
    // 装备槽：每格把各种剑诀可能用到的部件都备好（外圈、模式字、灵力数），按装的是什么显示
    const eq = (i) => `<button class="slot eq empty" data-slot="${i}" title=""><i class="ring"><i class="hole"></i></i><span class="g">空</span><i class="cd"></i><b class="left"></b><kbd>${LOADOUT.labels[i]}</kbd><em></em><small class="cost"></small><small class="mode"></small></button>`;
    root.innerHTML = `
      <div class="vitals">
        <div class="seal-c"><i>青</i><i>岚</i></div>
        <div class="bars">
          <div class="vbar hp"><b>气血</b><div class="track"><i class="lag"></i><i class="fill"></i></div><span></span></div>
          <div class="vbar mp"><b>灵力</b><div class="track"><i class="fill"></i><i class="pend"></i></div><span></span></div>
          <div class="vbar gd"><b>守势</b><div class="track"><i class="fill"></i></div><span></span></div>
        </div>
      </div>
      <div class="slots">${slot(['slash', '左键'], 'slot')}${LOADOUT.keys.map((_, i) => eq(i)).join('')}</div>
      <div class="minis">${MINIS.map((s) => slot(s, 'mini')).join('')}<i class="lockon" title="Tab 锁定">锁</i></div>
      <div class="deny"></div>
      <div class="counter-tip"><b>反击强化</b><em>×${PC.guard.counterK}</em><i class="ct-bar"><i></i></i></div>`;
    hud.appendChild(root);
    this.layer = document.createElement('div');
    this.layer.className = 'combat-layer';
    hud.appendChild(this.layer);
    this.vig = document.createElement('div');
    this.vig.className = 'hurt-vignette';
    hud.appendChild(this.vig);
    this.comboEl = document.createElement('div');
    this.comboEl.id = 'combo-ct';
    this.comboEl.innerHTML = '<b>0</b><em>连击</em>';
    hud.appendChild(this.comboEl);
    this.bossEl = document.createElement('div');
    this.bossEl.id = 'boss-bar';
    this.bossEl.innerHTML = '<div class="nm"><i class="seal-b">魔</i><em></em></div><div class="track"><i class="lag"></i><i class="fill"></i></div>';
    hud.appendChild(this.bossEl);
    this.comboNum = this.comboEl.querySelector('b');
    this.bossName = this.bossEl.querySelector('em'); this.bossFill = this.bossEl.querySelector('.fill'); this.bossLag = this.bossEl.querySelector('.lag');
    this.cache = {};

    const q = (s) => root.querySelector(s);
    this.hpFill = q('.hp .fill'); this.hpLag = q('.hp .lag'); this.hpTxt = q('.hp span');
    this.mpFill = q('.mp .fill'); this.mpTxt = q('.mp span'); this.mpPend = q('.mp .pend');
    this.gdFill = q('.gd .fill'); this.gdTxt = q('.gd span'); this.gdBar = q('.gd');
    this.lockEl = q('.lockon');
    this.denyEl = q('.deny');
    this.ctEl = q('.counter-tip'); this.ctBar = q('.counter-tip .ct-bar i');
    this.sk = {};
    const part = (b) => ({ el: b, cd: b.querySelector('.cd'), left: b.querySelector('.left'), ring: b.querySelector('.ring'), n: b.querySelector('.n'), mode: b.querySelector('.mode'), cost: b.querySelector('.cost'), g: b.querySelector('.g'), em: b.querySelector('em'), last: '' });
    for (const b of root.querySelectorAll('[data-k]')) this.sk[b.dataset.k] = part(b);
    this.eq = [...root.querySelectorAll('[data-slot]')].map((b) => ({ ...part(b), i: +b.dataset.slot, id: null }));
    this.onSlot = null;                 // (槽号, 按下 / 松开) → 装备槽（main.js 接上）
    void onHold;
    // 点击 / 触屏：格挡按住生效，其余点一下；装备槽按下 / 松开都交给装备槽（拔刀斩按住纳刀、松开出刀）
    for (const [k, s] of Object.entries(this.sk)) {
      if (k === 'guard') {
        s.el.addEventListener('pointerdown', (e) => { e.preventDefault(); onGuard?.(true); });
        for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) s.el.addEventListener(ev, () => onGuard?.(false));
      } else s.el.addEventListener('pointerdown', (e) => { e.preventDefault(); onSkill?.(k); });
    }
    for (const s of this.eq) {
      s.el.addEventListener('pointerdown', (e) => { e.preventDefault(); s.down = true; this.onSlot?.(s.i, true); });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) s.el.addEventListener(ev, () => { if (!s.down) return; s.down = false; this.onSlot?.(s.i, false); });
    }
    this.hp = { cur: 1, lag: 1 };
    this.boss = { e: null, lag: 1 };
    this.combo = { n: 0, shown: 0 };
    this.nums = [];
  }

  setHp(hp, max) {
    const f = Math.max(0, hp / max);
    if (f < this.hp.cur) this.hp.lagHold = 0.45;       // 掉血：白色残影停一下再追上
    this.hp.cur = f;
    this.put('hp', this.hpFill, 'width', `${(f * 100).toFixed(1)}%`);
    // 第二十一轮：气血上限随修为是小数（如 162.4）——显示取整，当前值不超过显示的上限
    const mx = Math.round(max);
    this.put('hpTxt', this.hpTxt, 'text', `${Math.min(mx, Math.ceil(hp))} / ${mx}`);
    this.root.classList.toggle('low', f < 0.3);
  }
  show(v) {
    if (v === this.shown) return;
    this.shown = v;
    this.root.classList.toggle('on', v);
    document.body.classList.toggle('combat-on', v);
  }
  // 受伤的红晕：ang 为来袭方向相对镜头前方的角度（弧度），那一侧更浓
  hurt(ang = null) {
    const v = this.vig;
    let side = '';
    if (ang != null) { const a = Math.atan2(Math.sin(ang), Math.cos(ang)); side = Math.abs(a) < 0.8 ? '' : Math.abs(a) > 2.35 ? ' from-b' : a > 0 ? ' from-l' : ' from-r'; }
    v.className = 'hurt-vignette' + side; void v.offsetWidth; v.classList.add('on');
  }
  // 敌人头顶血条
  bar(name, elite) {
    const el = document.createElement('div');
    el.className = 'ehp' + (elite ? ' elite' : '');
    el.innerHTML = `<em>${name}</em><div><i></i></div>`;
    this.layer.appendChild(el);
    const fill = el.querySelector('i');
    let shown = true;
    return { el, set(f) { fill.style.width = `${Math.max(0, f * 100)}%`; },
      place(x, y, vis) { if (vis) el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; if (vis !== shown) { shown = vis; el.style.display = vis ? '' : 'none'; } },
      remove() { el.remove(); } };
  }
  // 伤害数字（第十七轮：元素循环取用，不在每次命中时新建、删除）
  number(text, kind) {
    const el = (this.numPool ||= []).pop() || document.createElement('div');
    el.className = 'dmg ' + (kind || '');
    el.textContent = text;
    el.style.display = ''; el.style.opacity = '1';
    if (el.parentNode !== this.layer) this.layer.appendChild(el);
    return el;
  }
  freeNumber(el) { el.style.display = 'none'; if (this.numPool.length < 48) this.numPool.push(el); else el.remove(); }
  // 第二十三轮：按装备槽重排六格（字、名字、灵力数、外圈、模式字、空格）；剑诀 id → 格子的对应随之更新
  setLoadout(L) {
    for (const k of Object.keys(this.sk)) if (this.eq.some((s) => s === this.sk[k])) delete this.sk[k];
    for (const k of ['ring', 'pring', 'phMode', 'phCost', 'dgCost']) delete this.cache[k];       // 换了格子：这些按元素缓存的值重写一次
    for (const s of this.eq) {
      const id = L.at(s.i), S = id ? PC.skills[id] : null;
      s.id = id; s.last = '';
      s.el.className = `slot eq${id ? ' ' + id : ' empty'}${id === 'ult' ? ' ult' : ''}${id === 'power' ? ' power' : ''}`;
      s.el.dataset.k = id || '';
      s.el.title = S ? `${S.name}（${LOADOUT.labels[s.i]}）` : `第 ${s.i + 1} 格（${LOADOUT.labels[s.i]}）：空`;
      s.g.textContent = S ? S.glyph : '空';
      s.em.textContent = id ? SHORT[id] : '';
      s.cost.textContent = S?.mp ? `${S.mp}` : '';
      s.cost.style.display = S?.mp || id === 'phoenix' || id === 'dragon' ? '' : 'none';
      s.mode.style.display = id === 'phoenix' ? '' : 'none';
      s.ring.style.display = id === 'ult' || id === 'power' ? '' : 'none';
      s.cd.style.setProperty('--p', 0); s.left.textContent = '';
      s.inkForm = undefined; s.inkReady = undefined; s.inkCharge = undefined;      // 第二十五轮：拔刀斩的升级形态按每帧的状态重写
      s.el.classList.remove('ink-form', 'ink-ready', 'ink-charge');
      if (id) this.sk[id] = s;
    }
  }
  // 放不出来的原因：那一格抖一下，栏上方浮一行小字（text：直接给出的原因，如雷龙破虚「超出 30 米（34.6 米）」）
  deny(kind, why, text = null) {
    const s = kind ? this.sk[kind === 'light' ? 'slash' : kind] : null;
    if (s) { s.el.classList.remove('shake'); void s.el.offsetWidth; s.el.classList.add('shake'); }
    const t = text || DENY[why === 'empty' && !kind ? 'slotEmpty' : why];
    if (!t) return;
    this.denyEl.textContent = t;
    this.denyEl.classList.remove('show'); void this.denyEl.offsetWidth; this.denyEl.classList.add('show');
  }

  // 只在数值变了时写 DOM（每帧写同样的值、同样的文字，浏览器也要重算样式与排版）
  put(key, el, prop, v) {
    if (this.cache[key] === v) return;
    this.cache[key] = v;
    if (prop === 'text') el.textContent = v; else if (prop === 'class') el.className = v; else el.style.setProperty(prop, v);
  }

  update(dt, { moves: M, boss = null, pills = 0 }) {
    // 气血残影
    const H = this.hp;
    if (H.lagHold > 0) H.lagHold -= dt;
    else H.lag += (H.cur - H.lag) * Math.min(1, dt * 3.5);
    if (H.lag < H.cur) H.lag = H.cur;
    this.put('hpLag', this.hpLag, 'width', `${(H.lag * 100).toFixed(1)}%`);
    // 灵力（起手未放出的剑诀：要扣的那一段先画成淡色）
    // 第二十一轮：灵力上限随修为（M.mpMax）
    const pend = Math.min(M.mp, M.pendingMp || 0), MX = M.mpMax || PC.mp;
    this.put('mp', this.mpFill, 'width', `${((M.mp - pend) / MX * 100).toFixed(1)}%`);
    this.put('mpPendL', this.mpPend, 'left', `${((M.mp - pend) / MX * 100).toFixed(1)}%`);
    this.put('mpPendW', this.mpPend, 'width', `${(pend / MX * 100).toFixed(1)}%`);
    this.put('mpTxt', this.mpTxt, 'text', `${Math.floor(M.mp)}`);
    // 守势
    const G = PC.guard, gd = Math.max(0, M.guardHP ?? G.max), broken = (M.guardLock ?? 0) > M.time;
    this.put('gd', this.gdFill, 'width', `${(gd / G.max * 100).toFixed(1)}%`);
    this.put('gdTxt', this.gdTxt, 'text', broken ? '破' : `${Math.ceil(gd)}`);
    this.put('gdBroken', this.gdBar, 'class', broken ? 'vbar gd broken' : M.guarding ? 'vbar gd up' : 'vbar gd');
    this.put('lock', this.lockEl, 'class', M.lock ? 'lockon on' : 'lockon');
    // 反击强化：还剩多少（2 秒期限）
    const ctk = M.countering ? Math.max(0, (M.counterUntil - M.time) / G.counter) : 0;
    this.put('ct', this.ctEl, 'class', ctk > 0 ? 'counter-tip on' : 'counter-tip');
    this.put('ctW', this.ctBar, 'width', `${(ctk * 100).toFixed(0)}%`);
    // 各格
    for (const [k, s] of Object.entries(this.sk)) {
      let p = 0, left = 0, nomp = false, ready = false, active = false;
      if (k === 'slash') { active = M.act?.key?.startsWith('light') ?? false; ready = M.countering; }
      else if (k === 'guard') { active = M.guarding; p = Math.max(0, 1 - (M.time - M.parryOpenT) / G.parryCooldown); if (broken) { p = Math.min(1, ((M.guardLock ?? 0) - M.time) / G.breakLock); left = (M.guardLock ?? 0) - M.time; } }
      else if (k === 'power') {
        const I = M.iaiCharge;
        active = !!I || M.act?.key === 'iai_slash';
        ready = (!!I && I.k >= 1) || M.countering;
        this.put('pring', s.ring, '--p', `${Math.round((I ? I.k : 0) * 100)}`);
        // 第二十五轮：升级形态——装备着即换成升级形态的格子（墨色细环）；第二十七轮起名「墨里终焉」：图标字「墨」、标签「终焉」；墨势已成时整格转墨；有墨势的蓄力外圈按 3 秒、银白
        const fin = M.finale, form = !!fin?.enabled, ink = !!fin?.inkReady, chg = !!I?.ink;
        if (s.inkForm !== form) {
          s.inkForm = form; s.el.classList.toggle('ink-form', form);
          if (s.em) s.em.textContent = form ? FINALE.short : SHORT.power;
          if (s.g) s.g.textContent = form ? FINALE.glyph : PC.skills.power.glyph;
          if (s.i != null) s.el.title = form ? `${FINALE.name}（${LOADOUT.labels[s.i]}、Z、鼠标中键）` : `${PC.skills.power.name}（${LOADOUT.labels[s.i]}）`;
        }
        if (s.inkReady !== ink) { s.inkReady = ink; s.el.classList.toggle('ink-ready', ink); }
        if (s.inkCharge !== chg) { s.inkCharge = chg; s.el.classList.toggle('ink-charge', chg); }
      } else {
        const o = M.slot(k);
        p = o.cool; left = o.left; nomp = !o.mp;
        if (k === 'ult') { ready = o.intent >= 1; this.put('ring', s.ring, '--p', `${Math.round(o.intent * 100)}`); }
        if (k === 'pill') { if (s.n) this.put('pills', s.n, 'text', `${pills}`); nomp = pills < 1; }
        if (k === 'gourd') { const n = M.gourdLeft ?? 0; if (s.n) this.put('gourdN', s.n, 'text', `${n}`); nomp = n < 1; }
        active = M.act?.key === k;
        // 第二十一轮：九霄凤焰——模式（翔 / 护）、灵力（最大灵力的三成）、凤凰在场时亮着并标出剩余秒数
        if (k === 'phoenix') {
          const ph = M.phoenix, info = ph?.hudInfo();
          if (s.mode) this.put('phMode', s.mode, 'text', PHOENIX.modes[ph?.mode || 'strike'].glyph);
          if (s.cost) this.put('phCost', s.cost, 'text', `${Math.round(M.cost('phoenix'))}`);
          if (info?.active) { active = true; left = info.left; }
          if (ph && !ph.unlocked) nomp = true;
        }
        // 第二十三轮：雷龙破虚——灵力数（最大灵力的 35%）、龙在场时亮着并标出剩余秒数
        if (k === 'dragon') {
          const dg = M.dragon, info = dg?.hudInfo();
          if (s.cost) this.put('dgCost', s.cost, 'text', `${Math.round(M.cost('dragon'))}`);
          if (info?.active) { active = true; left = info.left; }
          if (dg && !dg.unlocked) nomp = true;
        }
      }
      // 进位取整：只要还在调息就至少是 1，免得最后一帧（剩不到半个百分点）被当成 0 而跳过，整格一直灰着
      const pc = Math.ceil(p * 100);
      const key = `${pc}|${left > 1 ? Math.ceil(left) : ''}|${nomp}|${ready}|${active}`;
      if (key === s.last) continue;
      s.last = key;
      s.cd.style.setProperty('--p', pc);
      if (s.cooling && p <= 0) { s.el.classList.remove('pop'); void s.el.offsetWidth; s.el.classList.add('pop'); }   // 调息完毕：整格亮一下
      s.cooling = p > 0;
      s.el.classList.toggle('cooling', p > 0);
      s.left.textContent = left > 1 ? Math.ceil(left) : '';
      s.el.classList.toggle('nomp', nomp && p <= 0);
      s.el.classList.toggle('ready', ready);
      s.el.classList.toggle('active', active);
    }
    // 连击数
    const C = this.combo, n = M.combo.n;
    if (n !== C.n) {
      if (n > C.n && n >= 2) {
        this.comboNum.textContent = n;
        this.comboEl.classList.add('on');
        this.comboNum.animate([{ transform: 'scale(1.45)' }, { transform: 'scale(1)' }], { duration: 200, easing: 'ease-out' });
      }
      if (n === 0) this.comboEl.classList.remove('on');
      C.n = n;
    }
    // 魔将血条
    const B = this.boss;
    if (boss !== B.e) {
      B.e = boss;
      this.bossEl.classList.toggle('on', !!boss);
      document.body.classList.toggle('boss-on', !!boss);
      if (boss) { this.bossName.textContent = boss.cfg.name; B.lag = boss.hp / boss.maxHp; }
      // 第十五轮：演武场的切磋对手用「武」字、青色血条（不是魔修）
      this.bossEl.classList.toggle('duel', !!boss?.duel);
      this.bossEl.querySelector('.seal-b').textContent = boss?.duel ? '武' : '魔';
    }
    if (boss) {
      const f = Math.max(0, boss.hp / boss.maxHp);
      B.lag += (f - B.lag) * Math.min(1, dt * 2.5); if (B.lag < f) B.lag = f;
      this.put('bossFill', this.bossFill, 'width', `${(f * 100).toFixed(1)}%`);
      this.put('bossLag', this.bossLag, 'width', `${(B.lag * 100).toFixed(1)}%`);
    }
  }
}
