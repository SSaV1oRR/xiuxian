// 第十五轮：佩剑面板（P 键、菜单「佩」、演武选择界面里的「更换佩剑」）
// 左边是剑器清单（缩略图离线渲染好，见 tools/convert_swords.py），右边转着看选中的那把（只在面板打开时建一个小画布，关闭即释放）；
// 「佩上此剑」立即换下人物手中、鞘中与御剑的飞剑，并记入存档。第一版所有剑器共用同一套基础战斗数值。
import { SwordPreview } from '../game/swords.js';

const BASE = 'assets/converted/';

export function openSwordPanel(game, { back = null } = {}) {
  const A = game.armory, ui = game.ui;
  if (!A || !A.list.length) { ui.toast('剑器清单未能载入'); return; }
  const equipped = () => game.player.char.sword?.id || game.state.sword || A.defaultId;
  let sel = equipped();
  let preview = null, closed = false, busy = false;
  const el = document.createElement('div');
  el.className = 'sw-panel';
  el.innerHTML = `
    <div class="sw-list">${A.list.map((s) => `<button class="sw-item" data-id="${s.id}"><img src="${BASE + s.thumb}" alt=""><b>${s.name}</b><small>${(s.length).toFixed(2)} 米</small><i class="sw-on">佩</i></button>`).join('')}</div>
    <div class="sw-view">
      <canvas class="sw-canvas"></canvas>
      <div class="sw-info"></div>
      <div class="sw-act"><button class="act" data-equip>佩上此剑</button>${back ? '<button class="act ghost" data-back>返回演武</button>' : ''}</div>
    </div>`;
  const info = el.querySelector('.sw-info'), btn = el.querySelector('[data-equip]');
  const refresh = () => {
    const cur = equipped();
    for (const b of el.querySelectorAll('.sw-item')) { b.classList.toggle('sel', b.dataset.id === sel); b.classList.toggle('on', b.dataset.id === cur); }
    const d = A.get(sel);
    info.innerHTML = `<h3>${d.name}<small>${d.kind || (d.curved ? '单刃弯刀' : d.id === 'jingji' ? '重剑' : '直剑')}</small></h3><p>${d.desc}</p>
      <div class="kv"><b>全长</b><span>${d.length.toFixed(2)} 米（剑身 ${(d.tip - d.guard[1]).toFixed(2)} 米）</span>${d.sheath ? '<b>剑鞘</b><span>原装刀鞘（收刀时挂在腰间）</span>' : ''}<b>数值</b><span>与其他剑器相同（第一版只换外观与握持）</span></div>`;
    btn.disabled = busy || cur === sel;
    btn.textContent = busy ? '正在佩上……' : cur === sel ? '已佩此剑' : '佩上此剑';
  };
  const show = (id) => {
    sel = id; refresh();
    A.load(id).then((r) => { if (!closed && sel === id && preview) preview.show(r.scene, r.def); })
      .catch(() => { if (!closed) info.insertAdjacentHTML('beforeend', '<p class="warn">这把剑的模型未能载入，请稍后再试。</p>'); });
  };
  el.querySelector('.sw-list').addEventListener('click', (e) => {
    const b = e.target.closest('.sw-item');
    if (b) show(b.dataset.id);
  });
  btn.addEventListener('click', async () => {
    if (busy) return;
    busy = true; refresh();
    try {
      const r = await game.equipSword(sel);
      ui.toast(`佩剑换作<b>${r.def.name}</b>`);
    } catch (e) {
      ui.toast('换剑失败：剑器模型未能载入');
    }
    busy = false;
    if (!closed) refresh();
  });
  el.querySelector('[data-back]')?.addEventListener('click', () => { ui.closePanel(); back?.(); });
  game.panelKind = 'swords';
  ui.openPanel('佩剑', `${A.list.length} 把剑器 · 按 P 关闭`, el, {
    width: 820,
    onClose: () => { closed = true; preview?.dispose(); preview = null; if (game.panelKind === 'swords') game.panelKind = null; },
  });
  preview = new SwordPreview(el.querySelector('.sw-canvas'));
  preview.start();
  show(sel);
}
