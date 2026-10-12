// 第十七轮整套自检（docs/R17_REPORT.md「自检」一节的数字都出自这里）：输入与缓冲、弹反窗口、帧率无关、魔修 / 演武场对手 / 龙君的来招结算、
// 滑步、压力与回归。都在页面里按真实的输入、出招、结算代码推进（不渲染），与录像用的是同一套工具（r17_combat_bot.js）。
// 用法（控制台 / 预览）：const S = await import('/tools/r17_suite.js?v=' + Date.now()); window.__suite = await S.suite();
//   { skip: ['duel', 'boss', 'stress', 'regress'] } 跳过其中耗时的几项
// 第十九轮：Z 由蓄力重击（charge / power）换成拔刀斩（iai 纳刀蓄势 / iai_slash 出刀），这里跟着改了招式名（按键脚本不变）
import * as B from './r17_combat_bot.js';

const Q = () => window.__qinglan;

export async function suite({ skip = [] } = {}) {
  const A = Q(), M = A.moves, C = A.combat, out = {};
  const acts = (r) => r.log.filter((L) => /^light|^iai/.test(L.key)).map((L) => `${L.key}(${L.end})`);
  const clearFoes = () => { for (const e of [...C.enemies]) { e.dispose(); C.enemies.splice(C.enemies.indexOf(e), 1); } };
  const noDummy = () => { C.dummies = C.dummies.filter((x) => !x.test); };
  // 每一项之前：回到演武场空场中心，收掉切磋与魔修，招式归位、灵力满、调息清零；身前 2.2 米一根木人桩（近战辅助有目标）
  const fresh = async (dummy = true) => {
    await B.toArena(); B.quietDragons(true);
    const R = A.arena; if (R?.S) R.teardown();
    clearFoes(); noDummy(); M.reset(); M.mp = 100; for (const k in M.cools) M.cools[k] = 0;
    B.tick(20, 1 / 60, false);
    if (dummy) B.dummy(2.2);
  };

  // ---------- 一、输入与缓冲 ----------
  await fresh(); out.singleClick = acts(B.sim([[0.1, 'L+'], [0.16, 'L-']], { secs: 1.6 }));
  await fresh(); out.holdLMB = acts(B.sim([[0.1, 'L+'], [4.6, 'L-']], { secs: 6 }));
  await fresh();
  const rapid = []; for (let i = 0; i < 8; i++) rapid.push([0.1 + i * 0.05, 'L+'], [0.12 + i * 0.05, 'L-']);
  out.rapid8clicksIn04s = acts(B.sim(rapid, { secs: 2.5 }));
  // 第一下在 0.1 秒按下；第一式可接第二式的时刻约在 0.417 秒。第二下提前 0.11 秒（在缓冲期内）与提前 0.25 秒（缓冲过期）
  await fresh(); out.secondClick011sEarly = acts(B.sim([[0.1, 'L+'], [0.12, 'L-'], [0.3067, 'L+'], [0.32, 'L-']], { secs: 2 }));
  await fresh(); out.secondClick025sEarly = acts(B.sim([[0.1, 'L+'], [0.12, 'L-'], [0.1667, 'L+'], [0.18, 'L-']], { secs: 2 }));
  await fresh(); out.parryWindowHoldRMB = B.sim([[0.1, 'R+'], [1.0, 'R-']], { secs: 1.3 }).segs;
  await fresh();
  const spam = []; for (let t = 0.1; t < 2.2; t += 0.15) spam.push([+t.toFixed(3), 'R+'], [+(t + 0.05).toFixed(3), 'R-']);
  const w0 = M.stat.parryWindows, sp = B.sim(spam, { secs: 2.4 });
  out.rmbSpam = { presses: spam.length / 2, windows: M.stat.parryWindows - w0, withWindow: sp.segs.filter((s) => s.includes('parry')) };
  await fresh(); out.guardWhileHoldingLMB = B.sim([[0.1, 'L+'], [0.9, 'R+'], [1.7, 'R-'], [2.8, 'L-']], { secs: 3.8 }).segs;
  await fresh();
  out.charge = [];
  for (const h of [0.3, 0.75, 1.3]) { await fresh(); const r = B.sim([[0.1, 'Z+'], [+(0.1 + h).toFixed(2), 'Z-']], { secs: h + 1.4 }); out.charge.push(`按住 Z ${h} 秒 → ${r.segs.filter((s) => s.startsWith('iai')).join(' ')}`); }
  await fresh(); { const r = B.sim([[0.1, 'L+'], [0.5, 'blur']], { secs: 2.5 }); out.blurWhileHoldingLMB = { acts: acts(r), held: r.held, buffer: r.buffer }; }
  await fresh(); { const r = B.sim([[0.1, 'L+'], [0.5, 'menu+'], [1.0, 'menu-']], { secs: 2 }); out.menuWhileHoldingLMB = { acts: acts(r), held: r.held }; }
  await fresh(); out.blurWhileCharging = acts(B.sim([[0.1, 'Z+'], [0.6, 'blur']], { secs: 1.6 }));

  // ---------- 二、帧率无关 ----------
  const fpsScript = [[0.1, 'L+'], [2.0, 'L-'], [2.6, 'R+'], [3.2, 'R-'], [3.4, 'Z+'], [4.2, 'Z-']];
  out.fps = {};
  for (const fps of [30, 60, 144]) {
    await fresh();
    const r = B.sim(fpsScript, { secs: 6, dt: 1 / fps });
    out.fps[fps] = { acts: r.log.map((L) => L.key).join(' '), hits: r.log.reduce((n, L) => n + L.res, 0), parryWindow: (r.segs.find((s) => s.includes('parry')) || '').replace(/.*parry /, '') };
  }

  // ---------- 三、魔修的来招 ----------
  await fresh(false);
  const et = (kind, o) => { const e = B.enemyTest(kind, o); return `${e.log.map((x) => `${x.r}:${x.a}`).join(' ') || '（没打到）'}｜守势 ${e.guardHP}｜魔修 ${e.enemy}${e.stunT ? ' ' + (+e.stunT).toFixed(2) + 's' : ''}`; };
  out.enemy = {
    '残魂爪 · 出手前 0.1 秒按右键': et('shade', { lead: 0.1, hold: 0.3 }),
    '残魂爪 · 早早举剑按住': et('shade', { lead: 0.5, hold: 1.0 }),
    '残魂爪 · 不举剑': et('shade', { lead: null }),
    '残魂爪 · 背对着举剑': et('shade', { lead: 0.1, hold: 0.5, face: false }),
    '魔将剑 · 出手前 0.1 秒按右键': et('elite', { lead: 0.1, hold: 0.3, d: 2.2 }),
    '魔将震地 · 举剑': et('elite', { act: 'slam', lead: 0.3, hold: 1.0, d: 2.4 }),
  };
  // 术士魔弹：在飞到之前一瞬按右键（几个时刻都试，取第一个弹反的）
  for (const lead of [-0.3, -0.4, -0.5, -0.6]) {
    const e = B.enemyTest('caster', { act: 'cast', lead, hold: 0.3, d: 6, secs: 2.8 });
    const s = e.log.map((x) => `${x.r}:${x.a}`).join(' ');
    if (s.includes('parry')) { out.enemy['术士魔弹 · 飞到前一瞬按右键'] = `${s}｜按键在出手后 ${(-lead).toFixed(2)} 秒｜术士 ${e.enemy}`; break; }
    out.enemy['术士魔弹 · 飞到前一瞬按右键'] = `（lead ${lead}：${s}）`;
  }
  // 魔将连续出剑、玩家一直举着剑：第几下破防
  {
    clearFoes(); M.reset(); C.playerUnit.invuln = 0;
    const P = A.player, f = { x: Math.sin(P.heading), z: Math.cos(P.heading) };
    const e = C.spawn('elite', { x: P.pos.x + f.x * 2.2, y: P.pos.y, z: P.pos.z + f.z * 2.2 }, { yaw: P.heading + Math.PI });
    e.state = 'chase'; e.slamCool = 99;
    const res = [], hp = []; const L = (ev) => { if (ev.target === C.playerUnit) { res.push(ev.result); hp.push(Math.round(M.guardHP)); } };
    C.hitListeners.add(L); C.setGuard(true);
    for (let i = 0; i < 60 * 24 && !res.includes('guardbreak'); i++) { if (e.cool > 0.4) e.cool = 0.4; A.tick(1 / 60, 1, false); C.playerUnit.hp = C.playerUnit.maxHp; }
    C.hitListeners.delete(L); C.setGuard(false);
    out.eliteBlocksUntilBreak = res.map((r, i) => `${r}(${hp[i]})`).join(' ');
    clearFoes();
  }

  // ---------- 四、演武场的对手（护法教习，普通，自由练习）----------
  if (!skip.includes('duel')) {
    await fresh(false);
    await B.duel('instructor', 'normal', 'free');
    out.duel = {};
    for (const [k, lead, hold, label] of [['slashA', 0.08, 0.3, '斜劈 · 出剑前一瞬'], ['slashB', 0.08, 0.3, '横斩 · 出剑前一瞬'], ['thrust', 0.08, 0.3, '反刺 · 出剑前一瞬'], ['slashC', 0.08, 0.3, '重劈 · 出剑前一瞬'],
      ['slashA', 0.6, 1.2, '斜劈 · 早举剑按住'], ['slashC', 0.6, 1.2, '重劈 · 早举剑按住'], ['slashB', null, 0, '横斩 · 不举剑'], ['slam', 0.2, 1.0, '震地 · 举剑']]) {
      const r = B.duelAttack(k, { lead, hold });
      out.duel[label] = `${r.log.join(' ') || '（没打到）'} → 对手 ${r.duAi}${r.stunT ? ' ' + r.stunT + 's' : ''}`;
    }
    A.arena?.S && A.arena.teardown();
  }

  // ---------- 五、滑步、骨盆跳变、剑尖跳变（演武场空场）----------
  const mc = (s, o) => { const r = B.motionCheck(s, o); const p = {}; for (const [k, v] of Object.entries(r)) p[k] = `贴地滑动合计 ${v.slide} 米、单帧最大 ${v.slideMax}；骨盆单帧最大 ${v.hipJump}；剑尖单帧最大 ${v.tipJump}（${v.frames} 帧）`; return p; };
  await fresh(false); out.motionHoldCombo = mc([[0.1, 'L+'], [3.0, 'L-']], { secs: 3.8 });
  await fresh(false); out.motionDodge = mc([[0.1, 'C']], { secs: 0.8 });
  await fresh(false); out.motionPower = mc([[0.1, 'Z+'], [1.3, 'Z-']], { secs: 2.6 });

  // ---------- 六、第五十层：龙君的来招 ----------
  if (!skip.includes('boss')) {
    if (A.world.name !== 'boss50') { const R = A.arena; if (R?.S) R.teardown(); await A.game.towerRoom.enter(); B.tick(30, 1 / 60, false); await A.boss50.enter(); B.tick(60, 1 / 60, false); }
    const bt = async (id, o) => { const r = await B.bossTest(id, o); return `${r.log.map((x) => `${x.r}:${x.a}@${x.t}`).join(' ') || '（没打到）'}｜架势 ${r.posture[0]}→${r.posture[1]}｜龙 ${r.mode}`; };
    out.boss = {};
    for (const [label, id, o] of [
      ['裂空龙爪 · 不举剑', 'claw1', {}], ['裂空龙爪 · 出爪前一瞬按右键', 'claw1', { pressAt: 0.44, hold: 0.3 }], ['裂空龙爪 · 早举剑按住', 'claw1', { pressAt: 0.1, hold: 1.0 }],
      ['双爪追猎 · 弹开第一爪后按住', 'claw2', { pressAt: 0.6, hold: 1.2 }], ['双爪追猎 · 弹开第一爪后松开', 'claw2', { pressAt: 0.6, hold: 0.2 }],
      ['三段猎杀 · 弹开第一段', 'combo3', { pressAt: 0.66, hold: 0.3, d: 3.0 }],
      ['龙尾回扫 · 早举剑硬挡', 'tailsweep', { pressAt: 0.5, hold: 1.2, d: 3.6 }], ['龙尾回扫 · 出尾前一瞬按右键', 'tailsweep', { pressAt: 1.12, hold: 0.3, d: 3.6 }],
      ['迟发碎岳 · 举剑', 'slam', { pressAt: 1.2, hold: 1.0, d: 3.0 }], ['紫焰吐息 · 一直举剑', 'breath', { pressAt: 0.6, hold: 3.0, d: 5 }],
    ]) out.boss[label] = await bt(id, o);
  }

  // ---------- 七、压力与回归 ----------
  if (!skip.includes('stress')) { await fresh(false); out.stress = B.stress({ secs: 60 }); }
  if (!skip.includes('regress')) out.regress = await B.regress();
  if (A.world.name !== 'surface') await A.game.switchWorld('surface');
  B.quietDragons(false);
  return out;
}
