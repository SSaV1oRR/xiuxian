// 第十四轮验收用的取图工具（在浏览器里 fetch 后 eval；依赖 tools/r11_capture.js 的 grab / sheet / post / domShot）：
//   window.__r14.setup({ hour })              关掉开场、显示界面、冻结页面自己的动画循环（之后一律手动推进帧）
//   window.__r14.run(n) / until(cond, max)    推进 n 帧 / 推进到 cond() 为真
//   window.__r14.at(key, t)                   推进到当前招式 key 放到动作时间 t（秒）
//   window.__r14.rel(label, cam, at, fov)     机位相对人物（cam = [右, 上, 前]）取一帧，记入待拼的图
//   window.__r14.abs(label, pos, at, fov)     世界坐标机位取一帧
//   window.__r14.sheet(name, title, cols)     把取到的帧拼图上传到 docs/screenshots/<name>.jpg
//   window.__r14.frames(prefix, n, every, cam) 连续取帧（录像用）：每 every 帧上传一张 <prefix>0000.jpg …
// 运行时只读取游戏状态、改机位；招式由调用方按真实的输入接口（moves.input）触发。
(() => {
  const q = window.__qinglan, R = window.__r11;
  const T = {
    shots: [], w: 640, h: 400,
    setup({ hour = 11 } = {}) {
      q.timeScale = 1e-6; q.game.intro = null;
      document.querySelector('#loading')?.classList.add('hidden');
      document.querySelector('#hud')?.classList.remove('hidden');
      for (const a of document.getAnimations()) { try { if (a.effect?.getTiming().iterations !== Infinity) a.finish(); } catch (e) { /* 循环动画不管 */ } }
      q.TIME.hour = hour; q.TIME.paused = true;
      this.shots = [];
    },
    run(n = 1) { for (let i = 0; i < n; i++) q.tick(1 / 60, 1); },
    until(cond, max = 600) { let i = 0; while (!cond() && i < max) { q.tick(1 / 60, 1); i++; } return i; },
    at(key, t, max = 600) { return this.until(() => q.moves.act?.key === key && q.moves.act.t >= t, max); },
    camRel(cam = [3.2, 2.0, 4.2], at = [0, 1.0, 0]) {
      const P = q.player, p = P.pos, h = P.heading, fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
      return { pos: [p.x + rx * cam[0] + fx * cam[2], p.y + cam[1], p.z + rz * cam[0] + fz * cam[2]], at: [p.x + fx * 1.5 + rx * at[0], p.y + at[1], p.z + fz * 1.5 + rz * at[0]] };
    },
    rel(label, cam, at, fov = 50) { const c = this.camRel(cam, at); return this.abs(label, c.pos, c.at, fov); },
    abs(label, pos, at, fov = 50) { const g = R.grab('sect', { pos, at, fov, w: this.w, h: this.h }); this.shots.push({ url: g.url, label }); return g; },
    async sheet(name, title = '', cols = 4) { const r = await R.sheet(name, this.shots, { cols, pw: 480, ph: 300, title }); this.shots = []; return r; },
    // 录像帧：每 every 帧按 cam(i) 给出的机位取一帧上传
    async frames(prefix, n, every = 2, cam = null, { w = 960, h = 540, caption = null } = {}) {
      let k = 0;
      for (let i = 0; i < n; i++) {
        q.tick(1 / 60, 1);
        if (i % every) continue;
        const c = cam ? cam(i) : this.camRel();
        const g = R.grab('sect', { pos: c.pos, at: c.at, fov: c.fov || 50, w, h });
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.drawImage(await R.img(g.url), 0, 0);
        const cap = caption ? caption(i) : '';
        if (cap) { ctx.font = '24px "Microsoft YaHei",sans-serif'; const tw = ctx.measureText(cap).width; ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(14, 14, tw + 30, 42); ctx.fillStyle = '#f3e9d2'; ctx.fillText(cap, 29, 44); }
        await R.post(prefix + String(k++).padStart(4, '0'), cv);
      }
      return k;
    },
  };
  window.__r14 = T;
  return Object.keys(T);
})();
