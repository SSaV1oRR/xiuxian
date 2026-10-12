// 第二十一轮：修为的界面——左上的境界徽记（境界、等级、修炼灵气进度、可否提升）、修为面板（L）、提升修为的聚气进度环、凤翔天击的准星。
// 只用实体元素（与战斗界面一致，连同界面截图时也画得出来）
import { REALMS, LEVEL, REWARDS, QI_TIERS, STATS, ASCEND, CAP_TEXT, PACE, FLIGHT, DOMAINS } from '../game/progressConfig.js';
import { baseNeed, breakExtra, totalNeed, baseAbsorb, targetTime, realmLabel, statMul, rewardScale } from '../game/progression.js';
import { PHOENIX, PLAYER_COMBAT as PC } from '../game/combatConfig.js';

const $ = (s) => document.querySelector(s);
const fmt = (v) => (v >= 10000 ? `${(v / 10000).toFixed(2)} 万` : Math.round(v).toLocaleString('zh-CN'));
const fmtT = (s) => (s >= 3600 ? `${(s / 3600).toFixed(1)} 小时` : s >= 60 ? `${Math.floor(s / 60)} 分 ${Math.round(s % 60)} 秒` : `${Math.round(s)} 秒`);

export class ProgressHud {
  constructor() {
    this.badge = $('#prog-badge');
    this.ring = $('#ascend-ring');
    this.reticle = $('#phoenix-reticle');
    this.last = {};
  }
  // 徽记：prog 修为；o：{ meditating, rate（每秒）, zone, ready（可提升）, show }
  update(prog, o = {}) {
    const B = this.badge;
    if (!B) return;
    const L = prog.level, need = totalNeed(L), qi = prog.qi;
    const key = `${L}|${Math.floor(qi)}|${o.meditating ? 1 : 0}|${o.ready ? 1 : 0}|${o.zone?.tier || ''}|${o.show ? 1 : 0}`;
    if (key === this.last.badge) return;
    this.last.badge = key;
    B.classList.toggle('on', !!o.show);
    B.classList.toggle('ready', !!o.ready);
    B.classList.toggle('cap', L >= LEVEL.max);
    B.querySelector('.pb-realm').textContent = realmLabel(L);
    B.querySelector('.pb-lv').textContent = `${L} 级`;
    B.querySelector('.pb-fill').style.width = L >= LEVEL.max ? '100%' : `${Math.min(100, (qi / need) * 100).toFixed(1)}%`;
    let sub = L >= LEVEL.max ? CAP_TEXT.line1 : `灵气 ${fmt(qi)} / ${fmt(need)}`;
    if (o.meditating && o.zone?.ok) sub = `${o.zone.name}（×${o.zone.k}）· 每秒 +${o.rate.toFixed(o.rate < 10 ? 2 : 1)}` + (L < LEVEL.max && qi < need ? ` · 约 ${fmtT((need - qi) / Math.max(1e-6, o.rate))}` : '');
    else if (o.ready) sub = '灵气已足 · 按 L 提升修为';
    B.querySelector('.pb-sub').textContent = sub;
  }
  // 聚气进度（k 0…1；null 收起）
  ascend(k, text = '') {
    const R = this.ring;
    if (!R) return;
    R.classList.toggle('on', k != null);
    if (k == null) return;
    const c = R.querySelector('.fg'), len = 2 * Math.PI * 44;
    c.style.strokeDasharray = `${len}`;
    c.style.strokeDashoffset = `${len * (1 - k)}`;
    R.querySelector('small').textContent = text;
  }
  // 凤翔天击：准星（操控中亮、折返时转红）
  steer(info) {
    const R = this.reticle;
    if (!R) return;
    const on = !!(info?.active && info.kind === 'strike');
    R.classList.toggle('on', on);
    if (!on) return;
    R.classList.toggle('steer', !!info.steering);
    R.classList.toggle('far', !!info.returning || info.dist > PHOENIX.strike.warnDist);
    const t = info.returning ? `凤凰折返 · 回到 ${PHOENIX.strike.retake} 米内可再操控` : info.steering ? `操控 · ${Math.round(info.dist)} 米` : `按住左键操控 · ${Math.round(info.dist)} 米`;
    if (this.last.ret !== t) { this.last.ret = t; R.querySelector('b').textContent = `${t} · ${info.left.toFixed(1)} 秒`; }
    else R.querySelector('b').textContent = `${t} · ${info.left.toFixed(1)} 秒`;
  }
}

// 修为面板（L）：境界、等级、升级需求（基础 / 突破额外 / 总需求 / 当前进度）、吸收速度、奖励、属性、御剑、上界
export function cultivationPanel(prog, { zone, rate, can, phoenixMode, eqNote = '' } = {}) {
  const L = prog.level, I = prog.info(L), r = I.realm;
  const capped = L >= LEVEL.max;
  const lowerRows = REALMS.filter((x) => x.domain === 'lower').map((x) => `<tr class="${x.id === r.id ? 'cur' : ''}"><td>${x.name}${x.alias ? `（${x.alias}）` : ''}</td><td>${x.lv[0]}–${x.lv[1]}</td><td>${x.life || '—'}</td><td>${{ none: '不能御剑', short: `短续航（每次 ${FLIGHT.short.secs} 秒）`, long: '长续航' }[x.fly]}</td></tr>`).join('');
  const upper = REALMS.filter((x) => x.domain === 'upper').map((x) => x.name).join(' → ');
  const pct = capped ? 100 : Math.min(100, (prog.qi / I.total) * 100);
  const tNeed = capped ? 0 : (I.total - prog.qi) / Math.max(1e-6, rate || baseAbsorb(L) * PACE.ref);
  const mul = (k) => statMul(k, L);
  // 同一小境界里升级只写等级（免得「金丹初期 → 金丹初期」）；跨小境界、大境界再写境界名
  const ups = prog.d.ups.slice(-4).reverse().map((u) => `<span class="tag">${realmLabel(u.from) === realmLabel(u.to) ? `${realmLabel(u.to)} · ${u.from} → ${u.to} 级` : `${realmLabel(u.from)} → ${realmLabel(u.to)} · ${u.to} 级`}</span>`).join('') || '<span class="muted">尚未提升</span>';
  return `
    <div class="cult">
      <div class="cult-head">
        <div class="cult-realm"><i>${r.name.slice(0, 1)}</i><div><b>${I.labelLong}</b><small>${DOMAINS[r.domain]} · 第 ${L} 级${r.life ? ' · ' + r.life : ''}</small></div></div>
        ${capped ? `<div class="cult-cap"><b>${CAP_TEXT.line1}</b><span>${CAP_TEXT.line2}</span></div>` : ''}
      </div>
      ${capped ? '' : `
      <div class="cult-need">
        <div><small>基础升级需求</small><b>${fmt(I.base)}</b></div>
        <div class="${I.extra ? 'brk' : ''}"><small>大境界突破额外消耗</small><b>${I.extra ? fmt(I.extra) : '0'}</b>${I.extra ? `<em>突破至 ${I.next.name}（+${Math.round(LEVEL.breakthrough.extra * 100)}%）</em>` : ''}</div>
        <div><small>总需求</small><b>${fmt(I.total)}</b></div>
        <div><small>当前进度</small><b>${fmt(prog.qi)}</b><em>${pct.toFixed(1)}%</em></div>
      </div>
      <div class="cult-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
      <p class="muted">基础需求递增，大境界突破额外消耗 80%。突破之后的下一级总需求会回落（不保证每一级都更多）。</p>`}
      <div class="kv">
        <b>修炼灵气</b><span>只用于等级成长，与剑诀用的战斗灵力分开。主动打坐（按 <b>Y</b> 随处打坐，聚灵阵、灵池静修台按 E）才吸收；移动、出手、受击、力竭、换场景即中断。${capped ? '<br><b>已达当前版本上限：不再积累可用于升级的灵气</b>（累计获得照记）。' : ''}</span>
        <b>此处</b><span>${zone?.ok ? `${zone.name}（×${zone.k}）${zone.source ? ' · ' + zone.source : ''}${capped ? ' · 已达当前上限，不再吸收' : ` · 打坐每秒 +${(rate || 0).toFixed(2)}`}` : zone?.reason || '—'}${!capped && zone?.ok ? ` · 攒满约 ${fmtT(tNeed)}` : ''}</span>
        <b>浓度</b><span>${Object.values(QI_TIERS).map((t) => `${t.name} ×${t.k}`).join(' · ')}（重叠取最高的一档，不叠乘）。${capped ? '已达当前版本上限：打坐不再吸收用于升级的灵气。' : `本级在普通区域每秒 ${baseAbsorb(L).toFixed(2)}；在 ${PACE.ref} 倍灵脉攒满本级基础需求约 ${fmtT(targetTime(L))}。`}</span>
        <b>其他来源</b><span>同等级的寻常魔修 ${REWARDS.kill.normal * 100}%、精英 ${REWARDS.kill.elite * 100}%，Boss 整场首次通关 ${REWARDS.boss * 100}%，宗门任务 ${REWARDS.quest.easy * 100}%–${REWARDS.quest.hard * 100}%，秘境完成 ${REWARDS.abyss * 100}%（都按本级基础需求、遭遇或领取时记下；敌我等级差修正 ${REWARDS.scale.min}–${REWARDS.scale.max} 倍）。演武场切磋、木人桩不给；Boss 重复通关不再给修炼灵气。</span>
        <b>属性</b><span>伤害 ×${mul('dmg').toFixed(3)} · 气血上限 ${Math.round(prog.maxHpAt())}（×${mul('hp').toFixed(3)}）· 灵力上限 ${Math.round(prog.maxMpAt())}（×${mul('mp').toFixed(3)}）——以 21 级为基准（${PC.hp} / ${PC.mp}）。${eqNote}</span>
        <b>提升修为</b><span>须存活、脱战至少 ${ASCEND.calm} 秒、身处安全之处；聚气 ${ASCEND.gather} 秒，期间移动、受击、力竭、换场景即中止（不扣灵气、不升级）。</span>
        <b>九霄凤焰</b><span>${L >= PHOENIX.unlock ? `已解锁 · 下一次召唤：${PHOENIX.modes[phoenixMode]?.name || ''}（按 4 切换）` : `金丹初期解锁（还差 ${PHOENIX.unlock - L} 级）`}</span>
        <b>近来</b><span>${ups}</span>
        <b>上界</b><span>${upper}（金仙为最终境界；飞升上界：后续开放）</span>
      </div>
      <table class="cult-tab"><thead><tr><th>境界（下界）</th><th>等级</th><th>寿元</th><th>御剑</th></tr></thead><tbody>${lowerRows}</tbody></table>
      <div class="cult-act">${capped ? `<button class="act" disabled>${CAP_TEXT.line2}</button>` : `<button class="act ${can?.ok ? 'danger' : ''}" id="ascend" ${can?.ok ? '' : 'disabled'}>提升修为</button><span class="muted">${can?.ok ? `扣除 ${fmt(I.total)} 灵气，升至 ${realmLabel(L + 1)}` : can?.reason || ''}</span>`}</div>
    </div>`;
}
export { fmt, fmtT, rewardScale, baseNeed, breakExtra, STATS };
