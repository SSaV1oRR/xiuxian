// 第十八轮：普攻距离检查——演武场空场里在正前方 d 米立一根木人桩，按住左键打完四式（或按 Z 蓄力横扫），
// 记下每一式有没有打中、出手时离桩多远、剑身离桩身最近处还差多少（gap，米；≤ 0 即剑身扫到了桩身）、这一式里人往前挪了多少
// 用法：const R = await import('/tools/r18_reach.js?v=' + Date.now()); await R.reach([2.6, 3.0, 3.4, 3.8, 4.2])
import * as B from './r17_combat_bot.js';
const Q = () => window.__qinglan;

export async function reach(ds = [2.6, 3.0, 3.4, 3.8, 4.2], { power = false } = {}) {
  const A = Q(), M = A.moves, C = A.combat, P = A.player, T = A.THREE;
  const tip = new T.Vector3(), base = new T.Vector3();
  const out = {};
  for (const d of ds) {
    await B.toArena(); B.quietDragons(true);
    M.reset(); M.mp = 100; for (const k in M.cools) M.cools[k] = 0;
    B.tick(10, 1 / 60, false);
    const dm = B.dummy(d);
    const p0 = P.pos.clone(), hits = {}, gap = {}, at = {}, moved = {};
    const script = power ? [[0.1, 'Z+'], [1.3, 'Z-']] : [[0.1, 'L+'], [3.4, 'L-']];
    const evs = script.slice(); let t = 0, start = {};
    for (let i = 0; i < 60 * 4.2; i++) {
      while (evs.length && evs[0][0] <= t + 1e-9) B.applyEvent(evs.shift()[1]);
      A.tick(1 / 60, 1, false); C.playerUnit.hp = C.playerUnit.maxHp; t += 1 / 60;
      const a = M.act; if (!a) continue;
      const k = a.key + (a.level ? a.level : '');
      if (a.results?.length) hits[k] = a.results.length;                     // 这一式结算到的目标（只有这根桩）
      if (!start[k]) start[k] = P.pos.clone();
      moved[k] = +Math.hypot(P.pos.x - start[k].x, P.pos.z - start[k].z).toFixed(2);
      const act = a.def.active;
      if (act && a.t >= act[0] - 0.02 && a.t <= act[1] + 0.02) {
        P.char.bladeEnds(tip, base);
        // 剑身线段到桩身轴线（竖直）的水平最近距离
        let best = 9;
        for (let s = 0; s <= 10; s++) { const x = base.x + (tip.x - base.x) * s / 10, z = base.z + (tip.z - base.z) * s / 10; best = Math.min(best, Math.hypot(x - dm.pos.x, z - dm.pos.z)); }
        const g = +(best - (dm.radius ?? 0.4)).toFixed(2);
        if (gap[k] == null || g < gap[k]) { gap[k] = g; at[k] = +Math.hypot(P.pos.x - dm.pos.x, P.pos.z - dm.pos.z).toFixed(2); }
      }
    }
    out[d] = Object.keys(gap).map((k) => `${k}:${hits[k] ? '中' : '空'} 离桩${at[k]} 剑差${gap[k]} 前移${moved[k]}`).join(' | ');
    C.dummies = C.dummies.filter((x) => !x.test);
  }
  B.quietDragons(false);
  return out;
}
