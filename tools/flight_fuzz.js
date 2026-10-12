// 御剑回归测试（第十三轮修订）：在浏览器里 fetch 后 eval，对 window.__qinglan 执行。不渲染，直接逐帧驱动 Flight.update，
// 在网格上的各个起点、四个方向低飞若干秒，记下「卡住」（连续 1 秒都没离开过 1 米范围——自动绕檐时的后退、上升不算卡住）
// 与「跳变」（一帧竖直位移 > 0.9 米，或水平位移 > 1.2 米——加速时一帧也只走 0.53 米），
// 并给出卡住处前方的情形（撞上的构筑物比脚底高多少、头顶还有多少空、是否树干石块）。
//   window.__fuzz.run({ x0, x1, z0, z1, step, dy, secs, offset, boost, yaws }) → { trials, res }
//   window.__fuzz.classify(res) → 各类计数
//   window.__fuzz.landing({ x0, x1, z0, z1, step, h }) → 在网格各点上空按 F，统计落得下 / 落不下的原因，落下后试走八个方向
(() => {
  const q = window.__qinglan, P = q.player, F = P.flight, T = q.terrain, C = P.cols;
  const camPos = new q.THREE.Vector3();
  const why = (yaw) => {
    const x = P.pos.x + Math.sin(yaw) * 0.5, z = P.pos.z + Math.cos(yaw) * 0.5, y = P.pos.y;
    const top = C ? C.hit(x, z, 0.3, y + 0.12, y + 1.85) : -Infinity;
    const g = F.groundBelow(x, z, y + 1.35);
    let cyl = 0;
    P.cw.query(x - 1, z - 1, x + 1, z + 1, (c) => { if (c.type === 1 && Math.hypot(x - c.x, z - c.z) < c.r + 0.5 && c.y1 > y && c.y0 < y + 1.85) cyl++; });
    return { wall: top > -Infinity ? +(top - y).toFixed(1) : 0, ground: +(g + 0.9 - y).toFixed(1), cyl, ceil: Math.min(99, +(F.ceilAbove(P.pos.x, P.pos.z, y) - y).toFixed(1)) };
  };
  // 合法起点：从地面往上找第一个身体不碰东西的高度
  const spawnY = (x, z, dy) => {
    let y = Math.max(T.heightAt(x, z), P.cw.ground(x, z, T.heightAt(x, z) + 3, 0.3), P.skyGround?.(x, z, 1e4) ?? -1e9) + dy;
    for (let k = 0; k < 160; k++) { const nd = F.need(x, z, y, 0.9); if (nd !== Infinity && F.free(x, z, Math.max(y, nd))) return Math.max(y, nd); y += 0.5; }
    return null;
  };
  const fly = (x, z, y, yaw, secs, boost) => {
    F.cancel(); P.place(x, z, yaw, y); F.mode = 'fly'; F.blend = 1; P.onGround = false; F.vel.set(0, 0, 0);
    let win = [], stuck = null, maxPop = 0, maxJump = 0;
    for (let i = 0; i < secs * 60; i++) {
      const yy = P.pos.y, xx = P.pos.x, zz = P.pos.z;
      camPos.set(P.pos.x - Math.sin(yaw) * 6, P.pos.y + 3, P.pos.z - Math.cos(yaw) * 6);
      F.update(1 / 60, { x: 0, y: 1, up: 0, down: 0, boost, yaw }, camPos);
      if (i >= 3) {                                    // 头几帧是起点安顿（起点偶尔落在塔刹、宝顶里，第一步会挪出来），不算
        maxPop = Math.max(maxPop, Math.abs(P.pos.y - yy));
        maxJump = Math.max(maxJump, Math.hypot(P.pos.x - xx, P.pos.z - zz));
      }
      win.push([P.pos.x, P.pos.y, P.pos.z]); if (win.length > 60) win.shift();
      if (win.length === 60 && i > 70) {
        let far = 0;
        for (const w of win) far = Math.max(far, Math.hypot(w[0] - win[0][0], w[1] - win[0][1], w[2] - win[0][2]));
        if (far < 1) { stuck = { at: P.pos.toArray().map((v) => +v.toFixed(1)), why: why(yaw) }; break; }
      }
    }
    return { stuck, maxPop, maxJump, end: P.pos.toArray().map((v) => +v.toFixed(1)) };
  };
  const F_ = {
    spawnY, fly, why,
    run({ x0 = -300, x1 = 300, z0 = -660, z1 = 240, step = 60, dy = 2, secs = 2.5, offset = 0, boost = false, yaws = [0, Math.PI / 2, Math.PI, -Math.PI / 2] } = {}) {
      const res = []; let trials = 0;
      for (let x = x0 + offset; x <= x1; x += step) for (let z = z0 + offset; z <= z1; z += step) {
        const y0 = spawnY(x, z, dy); if (y0 == null) continue;
        for (const yaw of yaws) {
          trials++;
          const r = fly(x, z, y0, yaw, secs, boost);
          if (r.stuck) res.push({ from: [x, z], yaw: +yaw.toFixed(2), ...r.stuck });
          if (r.maxPop > 0.9) res.push({ from: [x, z], yaw: +yaw.toFixed(2), pop: +r.maxPop.toFixed(2), at: r.end });
          if (r.maxJump > 1.2) res.push({ from: [x, z], yaw: +yaw.toFixed(2), jump: +r.maxJump.toFixed(2), at: r.end });
        }
      }
      F.cancel();
      return { trials, res };
    },
    // 分类；停在云海结界（飞行范围 x −960…960、z −1160…640，边上 40 米柔和推回）上的记为 bound——那是设计如此，不算卡住
    classify(res) {
      const c = {}, B = { x0: -960, x1: 960, z0: -1160, z1: 640 }, m = 41;
      const atBound = (a) => a[0] < B.x0 + m || a[0] > B.x1 - m || a[2] < B.z0 + m || a[2] > B.z1 - m;
      for (const o of res) { const k = o.pop ? 'pop' : o.jump ? 'jump' : atBound(o.at) ? 'bound' : o.why.cyl ? 'tree/rock' : o.why.ceil < 2.2 ? 'ceiling' : o.why.wall ? 'wall' : o.why.ground > 0.5 ? 'cliff' : 'other'; c[k] = (c[k] || 0) + 1; }
      return c;
    },
    landing({ x0 = -120, x1 = 120, z0 = -230, z1 = 140, step = 12, h = 12 } = {}) {
      const why = {}; let ok = 0, n = 0, walkFail = 0;
      for (let x = x0; x <= x1; x += step) for (let z = z0; z <= z1; z += step) {
        if (!T.inCore(x, z, 6)) continue;
        const y0 = spawnY(x, z, h); if (y0 == null) continue;
        n++;
        F.cancel(); P.place(x, z, 0, y0); F.mode = 'fly'; F.blend = 1; P.onGround = false; F.vel.set(0, 0, 0);
        const r = F.land();
        if (r) { why[r] = (why[r] || 0) + 1; continue; }
        let f = 0;
        while (F.active && f < 900) { F.update(1 / 60, { x: 0, y: 0, up: 0, down: 0, boost: false, yaw: 0 }, camPos); f++; }
        if (F.active) { why.timeout = (why.timeout || 0) + 1; continue; }
        ok++;
        // 落地后能不能走开：用步行逻辑往八个方向各走 0.6 秒
        let moved = 0;
        const sp = P.pos.clone();
        for (let k = 0; k < 8; k++) {
          P.pos.copy(sp); P.vel.set(0, 0, 0); P.onGround = true;
          const a = (k / 8) * Math.PI * 2, fwd = new q.THREE.Vector3(Math.sin(a), 0, Math.cos(a));
          for (let i = 0; i < 36; i++) P.update(1 / 60, { x: 0, y: 1, run: false }, fwd, camPos);
          if (Math.hypot(P.pos.x - sp.x, P.pos.z - sp.z) > 1.2) moved++;
        }
        P.pos.copy(sp);
        if (moved < 2) walkFail++;
      }
      F.cancel();
      return { n, ok, walkFail, why };
    },
  };
  window.__fuzz = F_;
  return Object.keys(F_);
})();
