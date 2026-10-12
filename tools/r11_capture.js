// 第十一轮验收用的取图工具（在浏览器控制台里 fetch 后 eval，需本机 serve.py 的 /__shot 上传接口）：
//   window.__r11.grab(mode, { pos, at, fov, w, h, win })  同步取一帧：mode 'hall' 为殿内两遍合成，'sect' 为同机位只画宗门；
//                                                       win 为洞口（hall.openings 的一项），返回洞口四角在图上的位置
//   window.__r11.sheet(name, panels, opts)               拼成对照图上传到 docs/screenshots/<name>.jpg
//   window.__r11.walk(pts, { every, prefix, w, h, follow })  真实逐帧（game tick）自动行走并按间隔取帧，供合成 GIF
// 运行时只读取游戏状态、改机位与时刻；不改游戏数据。
(() => {
  const q = window.__qinglan;
  const R = {
    grab(mode, { pos, at, fov = 60, w = 1280, h = 720, win = null }) {
      const { renderer: r, camera: c, THREE } = q;
      const size = r.getSize(new THREE.Vector2()), pr = r.getPixelRatio();
      const keep = { fov: c.fov, aspect: c.aspect, pos: c.position.clone(), quat: c.quaternion.clone() };
      if (pos) { c.position.set(...pos); c.lookAt(new THREE.Vector3(...at)); }
      r.setPixelRatio(1); r.setSize(w, h, false);
      c.aspect = w / h; c.fov = fov; c.updateProjectionMatrix(); c.updateMatrixWorld();
      q.veg.update(c.position, true); q.crags?.update(c.position, true);
      for (const n of Object.values(q.game.npcs)) n.root.visible = n.pos.distanceTo(c.position) < 70;
      const fades = []; for (const f of q.ctx.fadeables.values()) { fades.push([f, f.u.value]); f.u.value = 1; }
      const corners = win ? win.pts.map((p) => { const v = p.clone().project(c); return [(v.x * 0.5 + 0.5) * w, (0.5 - v.y * 0.5) * h]; }) : null;
      if (mode === 'sect') { const dv = q.ctx.hallDark.visible; q.ctx.hallDark.visible = false; q.present(q.scene, c); q.ctx.hallDark.visible = dv; }
      else if (mode === 'hall') q.present(q.drawHall, c);
      else if (mode === 'tower') q.present(q.towerHall.scene, c);       // 通天塔一层（第十三轮）
      else q.present(q.scene, c);
      const url = r.domElement.toDataURL('image/jpeg', 0.92);
      r.setPixelRatio(pr); r.setSize(size.x, size.y, false);
      Object.assign(c, { fov: keep.fov, aspect: keep.aspect }); c.updateProjectionMatrix();
      c.position.copy(keep.pos); c.quaternion.copy(keep.quat);
      for (const [f, v] of fades) f.u.value = v;
      return { url, corners, rect: q.hallRect };
    },
    img: (url) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; }),
    async post(name, cv) {
      const url = cv.toDataURL('image/jpeg', 0.9), blob = await (await fetch(url)).blob();
      const r = await fetch('/__shot/' + name, { method: 'POST', body: blob });
      return { status: r.status, kb: Math.round(blob.size / 1024) };
    },
    async sheet(name, panels, { cols = 2, pw = 960, ph = 540, title = '' } = {}) {
      const rows = Math.ceil(panels.length / cols), top = title ? 44 : 0;
      const cv = document.createElement('canvas'); cv.width = cols * pw; cv.height = rows * (ph + 34) + top;
      const g = cv.getContext('2d'); g.fillStyle = '#1b1a18'; g.fillRect(0, 0, cv.width, cv.height);
      if (title) { g.fillStyle = '#efe6d2'; g.font = '24px "Microsoft YaHei",sans-serif'; g.fillText(title, 14, 30); }
      for (let i = 0; i < panels.length; i++) {
        const P = panels[i], x = (i % cols) * pw, y = top + Math.floor(i / cols) * (ph + 34);
        const im = await this.img(P.url); g.drawImage(im, x, y, pw, ph);
        if (P.corners) {
          const k = pw / im.width; g.save(); g.beginPath(); g.rect(x, y, pw, ph); g.clip();
          g.strokeStyle = '#ffd34a'; g.lineWidth = 3; g.setLineDash([10, 6]); g.beginPath();
          P.corners.forEach(([u, v], j) => { const X = x + u * k, Y = y + v * k; j ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath(); g.stroke(); g.restore();
        }
        if (P.note) { g.font = '20px "Microsoft YaHei",sans-serif'; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x + 8, y + 8, g.measureText(P.note).width + 24, 34); g.fillStyle = '#ffe9a8'; g.fillText(P.note, x + 20, y + 32); }
        g.fillStyle = '#efe6d2'; g.font = '19px "Microsoft YaHei",sans-serif'; g.fillText(P.label || '', x + 10, y + ph + 24);
      }
      return this.post(name, cv);
    },
    // 截图时藏起角色（角色的身体与飘带、发丝网格各自挂在当前场景下）
    hideActor(on) {
      const ch = q.player.char, parts = [ch.root, ...(ch.strands || []).map((s) => s.mesh)];
      for (const p of parts) p.visible = !on;
    },
    // 连同界面一起截图（第十三轮）：画面按 scale 倍重画一帧，界面元素连同计算后的样式放进 SVG foreignObject 由浏览器自己排版后叠上
    // （伪元素 ::before/::after 与界面里的外链图片画不出来；用于对话框、菜单之类的验收截图）
    async domShot(name, { scale = 1.25 } = {}) {
      const r = q.renderer, W = innerWidth, H = innerHeight, NS = 'http://www.w3.org/1999/xhtml';
      // 后台标签页里 CSS 过渡不推进（如载入页的淡出）：取图前把有限的过渡、动画直接走完
      for (const a of document.getAnimations()) { try { if (a.effect?.getTiming().iterations !== Infinity) a.finish(); } catch (e) { /* 无限循环的动画不管 */ } }
      const out = document.createElement('canvas'); out.width = Math.round(W * scale); out.height = Math.round(H * scale);
      const g = out.getContext('2d'), pr = r.getPixelRatio();
      r.setPixelRatio(scale); r.setSize(W, H, false);
      q.tick(1 / 60, 1);
      g.drawImage(r.domElement, 0, 0, out.width, out.height);
      r.setPixelRatio(pr); r.setSize(W, H, false);
      const clone = (el) => {
        if (el.nodeType === 3) return el.cloneNode();
        if (el.nodeType !== 1 || /^(SCRIPT|STYLE|LINK)$/.test(el.tagName) || el === r.domElement) return null;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null;
        const cv = el.tagName === 'CANVAS';                                  // 界面里的 2D 画布（小地图等）：换成同样式的图片
        const c = document.createElementNS(NS, cv ? 'img' : el.tagName.toLowerCase());
        if (cv) { try { c.setAttribute('src', el.toDataURL()); } catch (e) { return null; } }
        if (el.tagName === 'IMG') {                                          // 第十五轮：图片转成 data URL 嵌进去（外链在 SVG 里不会载入）
          try { const k = document.createElement('canvas'); k.width = el.naturalWidth || 1; k.height = el.naturalHeight || 1; k.getContext('2d').drawImage(el, 0, 0); c.setAttribute('src', k.toDataURL()); } catch (e) { return null; }
        }
        let s = '';
        for (let i = 0; i < cs.length; i++) s += cs[i] + ':' + cs.getPropertyValue(cs[i]) + ';';
        c.setAttribute('style', s);
        for (const ch of el.childNodes) { const k = clone(ch); if (k) c.appendChild(k); }
        return c;
      };
      const bs = getComputedStyle(document.body), root = document.createElementNS(NS, 'div');
      root.setAttribute('style', `position:relative;width:${W}px;height:${H}px;overflow:hidden;font-family:${bs.fontFamily};color:${bs.color};`);
      for (const ch of document.body.children) { const k = clone(ch); if (k) root.appendChild(k); }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">${new XMLSerializer().serializeToString(root)}</foreignObject></svg>`;
      const im = await this.img('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
      g.drawImage(im, 0, 0, out.width, out.height);
      return this.post(name, out);
    },
    hhmm(h) { const m = Math.round(h * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; },
    // 真实逐帧自动行走：每 every 帧取一帧（follow：镜头偏航跟随人物朝向），caption(i) 返回帧上的说明文字
    async walk(pts, { every = 4, prefix = 'r11f_walk_', w = 960, h = 540, follow = 0.06, pitch = null, dist = null, maxFrames = 3000, caption = null, start = 0, onTick = null } = {}) {
      const { renderer: r, camera: c, THREE } = q;
      const size = r.getSize(new THREE.Vector2()), pr = r.getPixelRatio();
      r.setPixelRatio(1); r.setSize(w, h, false); c.aspect = w / h; c.updateProjectionMatrix();
      let done = false, n = start, f = 0, lastWorld = q.world.name;
      const switches = [];
      if (pts && pts.length) q.autoWalk(pts, () => { done = true; });
      if (pitch != null || dist != null) q.cam.set(null, pitch, dist);
      // pts 为空：原地停留 maxFrames 帧（onTick 里转镜头等），用于凭窗远望之类的片段
      while ((pts && pts.length ? !done : true) && f < maxFrames) {
        if (follow) { const d = Math.atan2(Math.sin(q.player.heading - q.cam.yaw), Math.cos(q.player.heading - q.cam.yaw)); q.cam.yaw += d * follow; }
        q.tick(1 / 60, 1);
        onTick && onTick(f);
        if (q.world.name !== lastWorld) { switches.push(n); lastWorld = q.world.name; }
        if (f % every === 0) {
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          const g = cv.getContext('2d'); g.drawImage(r.domElement, 0, 0, w, h);
          const cap = caption ? caption(f) : '';
          if (cap) { g.font = '22px "Microsoft YaHei",sans-serif'; const tw = g.measureText(cap).width; g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(12, 12, tw + 28, 38); g.fillStyle = '#f3e9d2'; g.fillText(cap, 26, 39); }
          await this.post(prefix + String(n).padStart(4, '0'), cv);
          n++;
        }
        f++;
      }
      q.autopilot = null; q.input.touch = { x: 0, y: 0, active: false };
      r.setPixelRatio(pr); r.setSize(size.x, size.y, false); c.aspect = size.x / size.y; c.updateProjectionMatrix();
      return { frames: n - start, ticks: f, done, switches, pos: q.player.pos.toArray().map((v) => +v.toFixed(2)) };
    },
    // 殿内性能：方法同 tools/perf_r9.js（1600×900、像素比 1、9.5 时、预热 30 帧、两轮各 30 帧取较好的一轮、每轮末 gl.finish），
    // 另测同一机位关掉窗洞（不画宗门一遍）的帧时，两者之差即窗外宗门这一遍的开销
    async perfHall(views) {
      const R0 = q.renderer, gl = R0.getContext(), keepPR = R0.getPixelRatio(), H = q.hall;
      R0.setPixelRatio(1); R0.setSize(1600, 900, false); q.camera.aspect = 1600 / 900; q.camera.updateProjectionMatrix();
      q.TIME.hour = 9.5; q.TIME.paused = true;
      const measure = () => {
        for (let i = 0; i < 30; i++) q.tick(1 / 60, 1);
        gl.finish();
        let best = 1e9;
        for (let rep = 0; rep < 2; rep++) { const t0 = performance.now(); for (let i = 0; i < 30; i++) q.tick(1 / 60, 1); gl.finish(); best = Math.min(best, (performance.now() - t0) / 30); }
        return +best.toFixed(2);
      };
      const out = {};
      for (const [k, x, y, z, yaw, pitch = 0.12, dist = 6] of views) {
        q.player.place(x, z, yaw, y); q.cam.set(yaw, pitch, dist); q.cam.snap(q.player.pos.clone().setY(y + 1.55));
        const ms = measure();
        R0.info.autoReset = false; R0.info.reset(); q.present(q.drawHall, q.camera);
        const tris = R0.info.render.triangles, calls = R0.info.render.calls; R0.info.autoReset = true;
        const rect = q.hallRect, area = rect ? +((rect.w * rect.h) / (1600 * 900)).toFixed(2) : 0;
        const keep = H.openings; H.openings = [];
        const msNoWin = measure();
        H.openings = keep;
        out[k] = { ms, msNoWindows: msNoWin, windowPass: +(ms - msNoWin).toFixed(2), tris, calls, portalArea: area, floor: H.floor + 1 };
      }
      R0.setPixelRatio(keepPR); R0.setSize(innerWidth, innerHeight, false); q.camera.aspect = innerWidth / innerHeight; q.camera.updateProjectionMatrix();
      return out;
    },
  };
  window.__r11 = R;
  return Object.keys(R);
})();
