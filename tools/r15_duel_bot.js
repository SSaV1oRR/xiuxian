// 第十五轮验收用的切磋测试工具（在浏览器里 fetch 后 eval）：用真实的输入接口（moves.input、combat.setGuard、移动键）
// 模拟一个玩家与演武场的对手对打，并记下对手的每一个决定（出招、前摇、举剑、出剑、状态切换），比较不同对手、难度的打法。
//   window.__duel.start(opp, diff, mode)   与教习交互之后点「开始」同一条路（arena.prepare → arena.enter），推进到开打
//   window.__duel.fight(style, maxSec)     按 style 打到分出胜负（或超时）：返回用时、胜负、统计与对手的行为计数
//   style：{ react 看到前摇后几秒举剑, guardP 举剑的概率, aggr 每几帧点一次左键, parry 是否掐着刚举剑的时机（弹反）, kite 出完一轮倒退几秒, spam 对手出招时也照砍, patient 只在对手露出破绽时出剑 }
// 推进时不画画面（只跑逻辑），所以很快；不改游戏数据，只读状态、按键。
(() => {
  const q = window.__qinglan;
  const D = {
    log: [],
    async start(opp = 'disciple', diff = 'normal', mode = 'formal') {
      const A = q.arena;
      if (A.S) { A.teardown(A.S); }
      const sel = { opp, diff, mode };
      await A.prepare(sel);
      A.enter(sel);
      for (let i = 0; i < 100 && !(A.S && A.S.phase === 'countdown'); i++) await new Promise((r) => setTimeout(r, 50));
      this.instrument(A.S.duelist);
      const pr = q.post.render; q.post.render = () => {};
      try { let n = 0; while (A.S.phase !== 'fight' && n++ < 400) q.tick(1 / 60, 1); } finally { q.post.render = pr; }
      return A.S.phase;
    },
    instrument(d) {
      const L = this.log = []; this.d = d; this.frames = 0; this.lastAi = d.ai;
      const T = () => +d.t.toFixed(2), dist = () => +Math.hypot(q.player.pos.x - d.pos.x, q.player.pos.z - d.pos.z).toFixed(2);
      const sc = d.startCombo.bind(d);
      d.startCombo = (list, o) => { L.push([T(), 'combo', list.join('+'), o?.quick ? 'counter' : o?.slow ? 'slow' : '', dist()]); return sc(list, o); };
      const ba = d.beginAttack.bind(d);
      d.beginAttack = (key) => { const r = ba(key); L.push([T(), 'wind', key, +d.atk.wind.toFixed(2)]); return r; };
      const sg = d.setGuard.bind(d);
      d.setGuard = (v) => { if (v !== d.guarding) L.push([T(), v ? 'guard' : 'unguard', dist()]); return sg(v); };
      const st = d.strike.bind(d);
      d.strike = (A) => { const hp0 = q.combat.playerUnit.hp; st(A); L.push([T(), 'strike', A.name, +(hp0 - q.combat.playerUnit.hp).toFixed(1), dist()]); };
    },
    step(o) {
      const d = this.d, P = q.player, M = q.moves, C = q.combat;
      if (d.ai !== this.lastAi) { this.log.push([+d.t.toFixed(2), 'ai', this.lastAi + '>' + d.ai]); this.lastAi = d.ai; }
      const dx = d.pos.x - P.pos.x, dz = d.pos.z - P.pos.z, dist = Math.hypot(dx, dz);
      q.cam.yaw = Math.atan2(dx, dz);
      const A = d.atk?.A;
      const threat = d.ai === 'attack' && d.atk && dist < (A.aoe || A.range) + 1.2;
      if (threat && this.seenAt == null) this.seenAt = d.t;
      if (!threat) { this.seenAt = null; this.roll = null; }
      let want = false;
      if (threat && d.t - this.seenAt >= o.react && (this.roll ??= Math.random()) < o.guardP) {
        // 掐时机：前摇快完时才举剑（刚举剑的 0.22 秒内挡住为弹反）；否则看到就举
        want = !o.parry || d.atk.phase === 'strike' || (d.atk.phase === 'wind' && d.atk.t >= A.hold && d.atk.wind < 0.12);
      }
      if (want !== !!C.guardHeld) C.setGuard(want);                       // 按住 / 松开右键（出剑那一段举不起剑，过后自动举起）
      q.input.keys.delete('KeyW'); q.input.keys.delete('KeyS');
      // kite：自己一轮剑招放完就倒退 kite 秒（看护法教习追不追、会不会疾掠突刺）
      if (o.kite) { if (this.wasBusy && !M.act) this.backT = o.kite; this.wasBusy = !!M.act; }
      if (this.backT > 0) { this.backT -= 1 / 60; if (!want) q.input.keys.add('KeyS'); }
      else if (!want && !threat) {
        // patient：只在对手露出破绽时出剑（收势、失衡、后撤，或刚出完一轮还在调息）——看节奏的玩家
        const opening = !o.patient || ['recover', 'stagger', 'retreat'].includes(d.ai) || (d.ai === 'neutral' && d.rest > 0.6);
        if (dist > 2.1) q.input.keys.add('KeyW');
        else if (opening && this.frames % o.aggr === 0) M.input('light');
      } else if (!want && threat && o.spam) { if (dist <= 2.1 && this.frames % o.aggr === 0) M.input('light'); }
      this.frames++;
    },
    fight(o = { react: 0.2, guardP: 0.8, aggr: 8 }, maxSec = 120) {
      const A = q.arena, pr = q.post.render; q.post.render = () => {};
      let n = 0;
      try { while (n < maxSec * 60 && A.S && A.S.phase === 'fight') { this.step(o); q.tick(1 / 60, 1); n++; } } finally { q.post.render = pr; q.input.keys.clear(); q.combat.setGuard(false); }
      const S = A.S, L = this.log, c = (k) => L.filter((x) => x[1] === k).length;
      const strikes = L.filter((x) => x[1] === 'strike');
      return {
        sec: S && +S.t.toFixed(1), phase: S?.phase, win: S?.win,
        stats: S && { ...S.stats, dealt: Math.round(S.stats.dealt), taken: Math.round(S.stats.taken) },
        oppHp: S?.duelist && Math.round(S.duelist.hp), oppMax: S?.duelist?.maxHp, pHp: Math.round(q.combat.playerUnit.hp),
        opp: { combos: c('combo'), winds: c('wind'), strikes: strikes.length, landed: strikes.filter((x) => x[3] > 0).length, guards: c('guard'), counters: L.filter((x) => x[1] === 'combo' && x[3] === 'counter').length,
          staggers: L.filter((x) => x[1] === 'ai' && x[2].endsWith('>stagger')).length, downs: L.filter((x) => x[1] === 'ai' && x[2].endsWith('>down')).length,
          dodges: L.filter((x) => x[1] === 'ai' && x[2].endsWith('>dodge')).length, retreats: L.filter((x) => x[1] === 'ai' && x[2].endsWith('>retreat')).length,
          lunges: L.filter((x) => x[1] === 'wind' && x[2] === 'lunge').length, slams: L.filter((x) => x[1] === 'wind' && x[2] === 'slam').length,
          avgWind: +(L.filter((x) => x[1] === 'wind').reduce((a, x) => a + x[3], 0) / Math.max(1, c('wind'))).toFixed(2) },
      };
    },
  };
  window.__duel = D;
  return Object.keys(D);
})();
