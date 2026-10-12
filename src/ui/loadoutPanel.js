// 第二十三轮：剑诀面板（K）——六个装备槽、技能库（八个占槽的主动技能）、不占槽的基本操作、要领。
// 操作（点击即可完成全部；桌面另可拖拽）：
//   技能库里点「装备」：有空格放进第一个空格；六格都满了——提示「点一格替换」，再点要替换的那一格；
//   点一格选中它：再点技能库里的剑诀即替换这一格，点另一格即互换，点「卸下」清空；
//   拖：把技能库的剑诀拖到某一格（装上 / 替换）、把一格拖到另一格（互换）、把一格拖回技能库（卸下）。
// 规矩由装备槽（game/loadout.js）判：脱战 5 秒、没有正在施法才能调整；还有召唤物、投射物、持续伤害的剑诀不许动它。面板里每 0.25 秒刷新一次能不能调整、还差几秒。
// 打开面板时鼠标锁定释放（ui.busy），点界面不会出剑（指针事件只在锁定时转成出手）。
import { PLAYER_COMBAT as PC, PLAYER_MOVES as PM, PHOENIX, DRAGON, LOADOUT, SKILL_INFO } from '../game/combatConfig.js';
import { FINALE } from '../game/inkFinaleConfig.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 一个主动技能的消耗、调息（读各自的配置）
function costText(id, M) {
  const S = PC.skills[id], out = [];
  if (id === 'phoenix') out.push(`灵力 ${Math.round(M ? M.cost('phoenix') : PC.mp * PHOENIX.mpCost)}（最大灵力的 ${Math.round(PHOENIX.mpCost * 100)}%）`);
  else if (id === 'dragon') out.push(`灵力 ${Math.round(M ? M.cost('dragon') : PC.mp * DRAGON.mpCost)}（最大灵力的 ${Math.round(DRAGON.mpCost * 100)}%）`);
  else if (S.mp) out.push(`灵力 ${S.mp}`);
  if (S.intent) out.push(`剑意 ${S.intent}（满）`);
  if (id === 'power') out.push('不耗灵力 · 无调息');
  if (S.cooldown) out.push(`调息 ${S.cooldown} 秒`);
  return out;
}
const dmgTxt = (k) => PM[k].hits.map((x) => (Array.isArray(x.dmg) ? x.dmg.join('–') : x.dmg)).join(' / ');

export function openLoadoutPanel(game) {
  const L = game.loadout, M = game.moves, ui = game.ui, G = PC.guard;
  if (!L) return;
  // 第二十五轮：拔刀斩已解锁升级形态时，名字、操作、说明都按升级形态显示（分开写普通释放与墨势满蓄力释放）；第二十七轮起名「墨里终焉」，图标字「墨」
  const up = (id) => id === 'power' && !!game.finale?.unlocked;
  const nameOf = (id) => (up(id) ? FINALE.name : PC.skills[id].name);
  const glyphOf = (id) => (up(id) ? FINALE.glyph : PC.skills[id].glyph);
  const el = document.createElement('div');
  el.className = 'lo-panel';
  let mode = null;                 // null | { kind: 'equip', id }（满槽：等着选替换的那一格）| { kind: 'slot', i }（选中了一格）
  let msg = null, msgBad = false, timer = 0;
  const say = (t, bad = false) => { msg = t; msgBad = bad; render(); };
  const result = (r, okText) => { if (r.ok) { mode = null; say(okText); } else say(r.reason || '不能调整', true); };

  function slotHtml(i) {
    const id = L.at(i), S = id ? PC.skills[id] : null, busy = id ? L.busyOf(id) : null, sel = mode?.kind === 'slot' && mode.i === i, pick = mode?.kind === 'equip';
    return `<div class="lo-slot${id ? '' : ' empty'}${sel ? ' sel' : ''}${pick ? ' pick' : ''}${id ? ' k-' + id : ''}" data-slot="${i}" draggable="${id ? 'true' : 'false'}">
      <kbd>${LOADOUT.labels[i]}</kbd><i class="g">${S ? glyphOf(id) : '空'}</i>
      <div class="nm"><b>${S ? esc(nameOf(id)) : '（空）'}</b><small>${S ? esc(costText(id, M).join(' · ')) : '点技能库里的剑诀装进来'}</small>${busy ? `<small class="busy">${esc(busy)}</small>` : ''}</div>
      ${id ? `<button class="lo-un" data-un="${i}" title="卸下">卸下</button>` : ''}</div>`;
  }
  function cardHtml(id) {
    const S = PC.skills[id], I = SKILL_INFO[id] || {}, st = L.info(id), at = st.slot;
    const lock = !st.learned, u = st.unlock;
    const btn = lock ? `<button class="lo-eq" disabled>未解锁</button>`
      : at >= 0 ? `<button class="lo-eq ghost" data-unid="${id}">卸下（${LOADOUT.labels[at]}）</button>`
      : `<button class="lo-eq" data-eq="${id}">${mode?.kind === 'slot' ? `装到 ${LOADOUT.labels[mode.i]}` : '装备'}</button>`;
    return `<div class="lo-card${at >= 0 ? ' on' : ''}${lock ? ' locked' : ''}${mode?.kind === 'equip' && mode.id === id ? ' picking' : ''} k-${id}" data-id="${id}" draggable="${lock ? 'false' : 'true'}">
      <i class="g">${glyphOf(id)}</i>
      <div class="bd">
        <div class="hd"><b>${esc(nameOf(id))}</b>${up(id) ? '<span class="tag up">升级形态</span>' : ''}${at >= 0 ? `<span class="tag on">已装备 · ${LOADOUT.labels[at]}</span>` : lock ? '<span class="tag lock">未解锁</span>' : '<span class="tag">技能库</span>'}</div>
        <div class="kv2"><b>消耗</b><span>${esc(costText(id, M).join(' · ') || '—')}</span>
          <b>操作</b><span>${esc(up(id) ? FINALE.text.op : I.op || '')}</span>
          <b>特点</b><span>${(up(id) ? ['蓄力', '墨势满蓄力 ×2', '低血处决', '16 秒水墨演出'] : I.tags || []).map((t) => `<em>${esc(t)}</em>`).join('')}</span>
          <b>解锁</b><span>${up(id) ? '升级形态：当前无视等级直接解锁（独立的解锁标记）' : u ? `${esc(u.text)}${st.meets ? ' · <i class="ok">已达成</i>' : ` · 当前 ${game.prog?.level ?? '—'} 级`}` : '入门即会'}</span></div>
        ${up(id) ? `<p class="up-mode"><b>普通释放</b>${esc(FINALE.text.normal)}</p><p class="up-mode ink"><b>墨势满蓄力释放</b>${esc(FINALE.text.ink)}</p><p class="up-mode">${esc(FINALE.text.stack)}</p><p class="up-mode"><b>通用的终结</b>${esc(FINALE.text.kill)}</p>` : `<p>${esc(S.desc)}</p>`}
      </div>
      ${btn}</div>`;
  }
  function render() {
    const ce = L.canEdit();
    const lines = [];
    if (!ce.ok) lines.push(`<span class="no">${esc(ce.reason)}</span>`);
    else if (mode?.kind === 'equip') lines.push(`六格已满：点一格，换成「${esc(PC.skills[mode.id].name)}」（再点「装备」或 Esc 取消）`);
    else if (mode?.kind === 'slot') lines.push(`已选 ${LOADOUT.labels[mode.i]} 格：点技能库里的剑诀替换它，点另一格互换，点「卸下」清空`);
    else lines.push('点「装备」放进空格；六格都满时先选要替换的那一格。也可以把剑诀拖到格子上、格子之间拖动互换、拖回技能库卸下。');
    if (msg && !(msgBad && !ce.ok && msg === ce.reason)) lines.push(`<span class="${msgBad ? 'no' : 'yes'}">${esc(msg)}</span>`);      // 与上一行的原因相同就不重复
    el.innerHTML = `
      <div class="lo-status${ce.ok ? '' : ' locked'}">${lines.join('<br>')}</div>
      <div class="lo-slots">${LOADOUT.keys.map((_, i) => slotHtml(i)).join('')}</div>
      <h3 class="sk-h">技能库 <small>主动技能（占槽）：${LOADOUT.skills.length} 种 · 已装备 ${L.slots.filter(Boolean).length} / ${LOADOUT.keys.length}</small></h3>
      <div class="lo-lib">${LOADOUT.skills.map(cardHtml).join('')}</div>
      <h3 class="sk-h">不占槽的基本操作</h3>
      <div class="lo-basic">
        <div><kbd>左键</kbd><b>流云剑</b><span>四段普攻：${dmgTxt('light1')} / ${dmgTxt('light2')} / ${dmgTxt('light3')} / ${dmgTxt('light4')}；按住连续出手</span></div>
        <div><kbd>C</kbd><b>闪身</b><span>闪出的一瞬不受伤害（调息 ${PC.skills.dodge.cooldown} 秒）</span></div>
        <div><kbd>右键</kbd><b>格挡 · 弹反</b><span>按下 ${G.parryWindow} 秒内挡住可弹反的来招即弹反；弹反后 ${G.counter} 秒内下一次普攻 / 拔刀斩 ×${G.counterK}</span></div>
        <div><kbd>2</kbd><b>回血葫芦</b><span>一口回三分之一气血，打坐调息时装满</span></div>
        <div><kbd>G</kbd><b>服丹</b><span>养元丹回复气血（调息 ${PC.skills.pill.cooldown} 秒）</span></div>
        <div><kbd>Tab</kbd><b>锁定</b><span>锁定身前的对手（雷龙破虚优先落在锁定的敌人脚下）</span></div>
        <div><kbd>Z / 中键</kbd><b>拔刀斩的别名</b><span>只在拔刀斩装备着时有效，与它所在的槽键同一个技能入口与蓄力；同一次蓄力只认先按下的那个键</span></div>
        <div><kbd>4</kbd><b>凤凰模式</b><span>只在九霄凤焰装备着时有效</span></div>
        <div><kbd>空格 / F / E</kbd><b>跳跃 · 御剑 · 交互</b><span>照旧</span></div>
      </div>
      <h3 class="sk-h">要领</h3>
      <div class="kv">
        <b>装备</b><span>六个槽的键固定为 ${LOADOUT.labels.join('、')}；格子里装什么就放什么，空着也可以，同一剑诀不能装两格。卸下之后原来的键、中键与剑诀栏的按钮都放不出来；调息按剑诀记，卸下、换格、重新装上、读档、换场景都不会刷新。脱战 ${LOADOUT.calm} 秒、且没有正在施法时才能调整；凤凰、雷龙还在场，剑阵、剑气还没散的，暂时不能动它。</span>
        <b>灵力</b><span>满值 ${Math.round(M?.mpMax ?? PC.mp)}（随修为等级成长，21 级为 ${PC.mp}）。施展剑诀时在「放出」的那一刻才扣、才进调息；起手中被格挡或闪身取消的不扣（剑诀栏上灵力条会先画出要扣的一段）。交战中每秒回复 ${PC.mpRegen}，脱战后每秒 ${PC.mpRegenIdle}。</span>
        <b>剑意</b><span>出剑命中即积攒，弹反一次 +${G.parryIntent}（最多到满），满 ${PC.intent} 时「万剑归宗」一格泛金，可施展。脱战 ${PC.intentHold} 秒后渐渐消散。</span>
        <b>弹反</b><span>右键按下、真正举起剑的那一刻起 ${G.parryWindow} 秒内，正面挡住一记可弹反、正在出手的来招：不受伤害，对手收手、失衡或被打断，回 ${Math.round(G.parryRefund * 100)}% 守势、${G.parryMp} 灵力、${G.parryIntent} 剑意；随后 ${G.counter} 秒「反击强化」。两次弹反窗口至少相隔 ${G.parryCooldown} 秒。</span>
        <b>雷龙破虚</b><span>选点：锁定的敌人 → 准星对着的敌人 → 准星对着的地面；离你 ${DRAGON.range} 米内、看得见、有地面、上方有空间，否则地上亮红圈并写明原因，不扣灵力。起势 ${DRAGON.t.commit} 秒（之前可被格挡、闪身取消），之后自行演完：8 秒 ${DRAGON.pulse.count} 次雷击（半径 ${DRAGON.radius} 米，每次至多 ${DRAGON.pulse.max} 个敌人、每个只挨一道），最后俯冲爆雷。</span>
        <b>来招</b><span>魔修的爪、剑与龙爪可挡可弹；兵刃上一道<b style="color:#c99a3a">金光</b>的是难挡的重击（仍可弹反）；头顶亮红色「<b style="color:#c0281e">危</b>」字的只能闪开。</span>
        <b>本次</b><span>最高连击 ${M ? M.combo.best : 0}${M && M.intent >= PC.intent ? '　·　剑意已满' : ''}</span>
      </div>`;
  }
  // ---------- 点击 ----------
  el.addEventListener('click', (e) => {
    const un = e.target.closest('[data-un]');
    if (un) { const i = +un.dataset.un, id = L.at(i); result(L.unequip(i), `卸下「${PC.skills[id]?.name}」（${LOADOUT.labels[i]} 格空出）`); return; }
    const unid = e.target.closest('[data-unid]');
    if (unid) { const id = unid.dataset.unid, i = L.slotOf(id); result(L.unequip(i), `卸下「${PC.skills[id].name}」（${LOADOUT.labels[i]} 格空出）`); return; }
    const eq = e.target.closest('[data-eq]');
    if (eq) { equipClick(eq.dataset.eq); return; }
    const slot = e.target.closest('.lo-slot');
    if (slot) { slotClick(+slot.dataset.slot); return; }
    const card = e.target.closest('.lo-card');
    if (card && mode?.kind === 'slot' && !card.classList.contains('locked')) { const i = mode.i, id = card.dataset.id; result(L.equip(id, i), `「${PC.skills[id].name}」装到 ${LOADOUT.labels[i]} 格`); }
  });
  function equipClick(id) {
    if (mode?.kind === 'slot') { const i = mode.i; result(L.equip(id, i), `「${PC.skills[id].name}」装到 ${LOADOUT.labels[i]} 格`); return; }
    if (mode?.kind === 'equip' && mode.id === id) { mode = null; say('取消'); return; }
    const ce = L.canEdit();
    if (!ce.ok) { say(ce.reason, true); return; }
    const i = L.firstEmpty();
    if (i < 0) { mode = { kind: 'equip', id }; msg = null; render(); return; }
    result(L.equip(id, i), `「${PC.skills[id].name}」装到 ${LOADOUT.labels[i]} 格`);
  }
  function slotClick(i) {
    if (mode?.kind === 'equip') { const id = mode.id, old = L.at(i); result(L.equip(id, i), old ? `${LOADOUT.labels[i]} 格：「${PC.skills[old].name}」换成「${PC.skills[id].name}」` : `「${PC.skills[id].name}」装到 ${LOADOUT.labels[i]} 格`); return; }
    if (mode?.kind === 'slot') {
      if (mode.i === i) { mode = null; msg = null; render(); return; }
      const a = mode.i; result(L.swap(a, i), `${LOADOUT.labels[a]} 与 ${LOADOUT.labels[i]} 互换`); return;
    }
    mode = { kind: 'slot', i }; msg = null; render();
  }
  // ---------- 拖拽（桌面）----------
  el.addEventListener('dragstart', (e) => {
    const s = e.target.closest('.lo-slot'), c = e.target.closest('.lo-card');
    if (s && L.at(+s.dataset.slot)) e.dataTransfer.setData('text/plain', 'slot:' + s.dataset.slot);
    else if (c && !c.classList.contains('locked')) e.dataTransfer.setData('text/plain', 'skill:' + c.dataset.id);
    else { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = 'move';
  });
  el.addEventListener('dragover', (e) => { if (e.target.closest('.lo-slot') || e.target.closest('.lo-lib')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
  el.addEventListener('drop', (e) => {
    const v = e.dataTransfer.getData('text/plain') || '';
    const s = e.target.closest('.lo-slot');
    e.preventDefault();
    mode = null;
    if (s) {
      const i = +s.dataset.slot;
      if (v.startsWith('skill:')) { const id = v.slice(6); result(L.equip(id, i), `「${PC.skills[id].name}」装到 ${LOADOUT.labels[i]} 格`); }
      else if (v.startsWith('slot:')) { const a = +v.slice(5); if (a !== i) result(L.swap(a, i), `${LOADOUT.labels[a]} 与 ${LOADOUT.labels[i]} 互换`); }
      return;
    }
    if (e.target.closest('.lo-lib') && v.startsWith('slot:')) { const a = +v.slice(5), id = L.at(a); result(L.unequip(a), `卸下「${PC.skills[id]?.name}」（${LOADOUT.labels[a]} 格空出）`); }
  });
  render();
  game.panelKind = 'skills';
  ui.openPanel('剑诀', `六槽装备 · 技能库（按 K 关闭）`, el, { width: 980, onClose: () => { clearInterval(timer); if (game.panelKind === 'skills') game.panelKind = null; } });
  // 每 0.25 秒刷新「能不能调整」（脱战倒计时、施法结束、凤凰散去……）；不在拖动时重画，免得打断拖拽
  let lastKey = '';
  let dragging = false;
  el.addEventListener('dragstart', () => { dragging = true; }); el.addEventListener('dragend', () => { dragging = false; });
  timer = setInterval(() => {
    if (!ui.panelOpen || game.panelKind !== 'skills') { clearInterval(timer); return; }
    const ce = L.canEdit(), key = `${ce.ok}|${ce.reason}|${LOADOUT.skills.map((id) => L.busyOf(id) || '').join(',')}`;
    if (key !== lastKey && !dragging) { lastKey = key; render(); }
  }, 250);
  return el;
}
