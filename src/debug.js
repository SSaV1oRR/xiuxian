// 调试与自检：沿路点模拟行走（使用真实的移动与碰撞代码）、传送、镜头预设
// 在浏览器控制台通过 window.__qinglan 调用
export function installDebug(api) {
  const { player, cam, camera } = api;
  // 无渲染快速模拟：按路点行走，返回是否到达与卡住位置
  api.simWalk = (pts, { maxT = 240, dt = 1 / 60, tol = 1.2, run = false } = {}) => {
    const log = [];
    let i = 0, t = 0, lastProg = 0, best = Infinity;
    const fwd = { x: 0, z: -1 };
    while (i < pts.length && t < maxT) {
      const [tx, tz] = pts[i];
      const dx = tx - player.pos.x, dz = tz - player.pos.z, d = Math.hypot(dx, dz);
      if (d < tol) { log.push({ wp: i, t: +t.toFixed(1), y: +player.pos.y.toFixed(2) }); i++; best = Infinity; lastProg = t; continue; }
      if (d < best - 0.05) { best = d; lastProg = t; }
      if (t - lastProg > 6) return { ok: false, stuckAt: [+player.pos.x.toFixed(2), +player.pos.y.toFixed(2), +player.pos.z.toFixed(2)], wp: i, target: pts[i], t: +t.toFixed(1), log };
      fwd.x = dx / d; fwd.z = dz / d;
      player.update(dt, { x: 0, y: 1, run }, fwd, camera.position);
      t += dt;
    }
    return { ok: i >= pts.length, t: +t.toFixed(1), pos: [+player.pos.x.toFixed(2), +player.pos.y.toFixed(2), +player.pos.z.toFixed(2)], log };
  };
  // 高分辨率截图（不含界面）：可指定自由机位；全景时临时扩大阴影范围；上传到 docs/screenshots/<name>.jpg（需本机 serve.py）
  // near：临时加大近裁剪面（远处机位截图时剔除贴近镜头的枝叶）
  api.shot = async (name, { w = 1600, h = 900, pos = null, at = null, fov = null, shadowRange = null, hideFade = true, near = null } = {}) => {
    const { renderer, THREE, sky, ctx } = api;
    // 问道殿内（第十一轮）：两遍合成（窗外宗门 + 室内），宗门照常按机位更新；显示的楼层按机位高度
    const wn = api.world?.name || 'surface', inHall = wn === 'hall', under = wn === 'abyss' || wn === 'alchemy' || wn === 'tower' || wn === 'boss50' || wn === 'boss30';
    const scene = wn === 'abyss' ? api.abyss.scene : wn === 'alchemy' ? api.interior.scene : wn === 'tower' ? api.towerHall.scene : wn === 'boss50' ? api.tower50.scene : wn === 'boss30' ? api.tower30.scene : inHall ? api.drawHall : api.scene;
    const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
    const keep = { fov: camera.fov, aspect: camera.aspect, near: camera.near, pos: camera.position.clone(), quat: camera.quaternion.clone() };
    if (near) camera.near = near;
    if (pos) { camera.position.set(...pos); camera.lookAt(new THREE.Vector3(...at)); }
    // 自由机位：植被远近细节与弟子剔除按机位计算
    if (pos && !under) { api.veg.update(camera.position, true); api.crags?.update(camera.position, true); for (const n of Object.values(api.game.npcs)) n.root.visible = n.pos.distanceTo(camera.position) < 70; }
    const fades = [];
    if (hideFade) for (const f of ctx.fadeables.values()) { fades.push([f, f.u.value]); f.u.value = 1; }
    const { GLOBAL } = await import('./world/shaderlib.js');
    const cut = GLOBAL.uCut.value.clone();
    if (pos) GLOBAL.uCut.value.set(-9999, -9999, 0, 1);
    if (shadowRange) sky.setShadowRange(shadowRange, 4096);
    if (!under) sky.update(camera, shadowRange ? new THREE.Vector3(...(at || [0, 0, 0])) : player.pos);
    if (inHall && pos) { const { levelAt } = await import('./world/hallSpec.js'); api.hall.setFloor(levelAt(camera.position.y - 1.5)); }
    renderer.setPixelRatio(1); renderer.setSize(w, h, false);
    camera.aspect = w / h; if (fov) camera.fov = fov; camera.updateProjectionMatrix();
    (api.present || ((s, c) => renderer.render(s, c)))(scene, camera);
    const url = renderer.domElement.toDataURL('image/jpeg', 0.92);
    renderer.setPixelRatio(pr); renderer.setSize(size.x, size.y, false);
    Object.assign(camera, { fov: keep.fov, aspect: keep.aspect, near: keep.near }); camera.updateProjectionMatrix();
    camera.position.copy(keep.pos); camera.quaternion.copy(keep.quat);
    for (const [f, v] of fades) f.u.value = v;
    GLOBAL.uCut.value.copy(cut);
    if (shadowRange) sky.setShadowRange(sky.baseRange, sky.baseMap);
    if (pos && !under) api.veg.update(player.pos, true);
    const blob = await (await fetch(url)).blob();
    const r = await fetch('/__shot/' + name, { method: 'POST', body: blob });
    return { status: r.status, kb: Math.round(blob.size / 1024) };
  };
  // 地形俯视晕渲图（调试构图）：范围 [x0,z0]-[x1,z1]，上传为 docs/screenshots/<name>.jpg
  api.heightShot = async (name, x0, z0, x1, z1, W = 900) => {
    const T = api.terrain, H = Math.round(W * (z1 - z0) / (x1 - x0));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    const sx = (x1 - x0) / W, sz = (z1 - z0) / H;
    const hs = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) hs[j * W + i] = T.heightAt(x0 + i * sx, z0 + j * sz);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const h = hs[j * W + i], hx = hs[j * W + Math.min(W - 1, i + 1)] - hs[j * W + Math.max(0, i - 1)], hz = hs[Math.min(H - 1, j + 1) * W + i] - hs[Math.max(0, j - 1) * W + i];
      const sh = Math.max(0, Math.min(1, 0.6 - (hx / (2 * sx) + hz / (2 * sz)) * 0.35));
      const e = Math.max(0, Math.min(1, (h + 20) / 240));
      const k = (j * W + i) * 4, band = Math.abs((h / 10) % 1) < 0.06 ? 0.75 : 1;
      d[k] = (70 + 150 * e) * sh * band + 20; d[k + 1] = (95 + 120 * e) * sh * band + 20; d[k + 2] = (70 + 140 * e) * sh * band + 25; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9));
    const r = await fetch('/__shot/' + name, { method: 'POST', body: blob });
    let mn = Infinity, mx = -Infinity; for (const v of hs) { if (v < mn) mn = v; if (v > mx) mx = v; }
    return { status: r.status, min: mn, max: mx };
  };
  // 分层设色高程图（调试地形：5 米细等高线、25 米粗等高线、50 米坐标网格）
  api.elevShot = async (name, x0, z0, x1, z1, W = 1100) => {
    const T = api.terrain, H = Math.round(W * (z1 - z0) / (x1 - x0));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    const sx = (x1 - x0) / W, sz = (z1 - z0) / H, hs = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) hs[j * W + i] = T.heightAt(x0 + i * sx, z0 + j * sz);
    const ramp = [[-60, [20, 30, 70]], [-30, [30, 70, 120]], [-10, [40, 110, 140]], [0, [60, 140, 110]], [15, [110, 170, 90]], [30, [200, 200, 100]], [45, [220, 160, 80]], [60, [200, 100, 70]], [80, [170, 80, 90]], [120, [230, 230, 230]]];
    const col = (h) => { if (h <= ramp[0][0]) return ramp[0][1]; for (let i = 0; i < ramp.length - 1; i++) { const [a, ca] = ramp[i], [b, cb] = ramp[i + 1]; if (h <= b) { const t = (h - a) / (b - a); return ca.map((v, k) => v + (cb[k] - v) * t); } } return ramp[ramp.length - 1][1]; };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const h = hs[j * W + i];
      const hx = (hs[j * W + Math.min(W - 1, i + 1)] - hs[j * W + Math.max(0, i - 1)]) / (2 * sx), hz = (hs[Math.min(H - 1, j + 1) * W + i] - hs[Math.max(0, j - 1) * W + i]) / (2 * sz);
      const sh = Math.max(0.35, Math.min(1.25, 0.85 - (hx * 0.6 + hz * 0.8) * 0.35)), c = col(h);
      const f5 = ((h % 5) + 5) % 5, f25 = ((h % 25) + 25) % 25;
      const line = (f25 < 0.6 || f25 > 24.4) ? 0.45 : (f5 < 0.25 || f5 > 4.75) ? 0.8 : 1;
      const k = (j * W + i) * 4;
      d[k] = c[0] * sh * line; d[k + 1] = c[1] * sh * line; d[k + 2] = c[2] * sh * line; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.fillStyle = '#fff'; g.font = '12px sans-serif';
    for (let x = Math.ceil(x0 / 50) * 50; x <= x1; x += 50) { const px = (x - x0) / sx; g.beginPath(); g.moveTo(px, 0); g.lineTo(px, H); g.stroke(); g.fillText(String(x), px + 2, 12); }
    for (let z = Math.ceil(z0 / 50) * 50; z <= z1; z += 50) { const pz = (z - z0) / sz; g.beginPath(); g.moveTo(0, pz); g.lineTo(W, pz); g.stroke(); g.fillText(String(z), 2, pz - 2); }
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9));
    return (await fetch('/__shot/' + name, { method: 'POST', body: blob })).status;
  };
  // 一组固定机位截图：[[名称, pos, at, fov, shadowRange], ...]
  api.shots = async (list, prefix = '') => {
    const out = [];
    for (const [n, pos, at, fov = 50, sr = 200] of list) out.push(n + ':' + (await api.shot(prefix + n, { pos, at, fov, shadowRange: sr })).kb);
    return out;
  };
  api.tp = (x, z, yaw) => { player.place(x, z, yaw ?? player.heading); cam.snap(player.pos.clone().setY(player.pos.y + 1.55)); };
  api.view = (yaw, pitch, dist) => { cam.set(yaw, pitch, dist); cam.snap(player.pos.clone().setY(player.pos.y + 1.55)); };
  // 实时自动行走（可见）：每帧朝下一路点移动
  api.autoWalk = (pts, done) => {
    let i = 0;
    api.autopilot = () => {
      if (i >= pts.length) { api.input.touch = { x: 0, y: 0, active: false }; api.autopilot = null; done && done(); return; }
      const [tx, tz] = pts[i], dx = tx - player.pos.x, dz = tz - player.pos.z, d = Math.hypot(dx, dz);
      if (d < 1.0) { i++; return; }
      const f = cam.forward(), r = { x: -f.z, z: f.x };
      const ux = dx / d, uz = dz / d;
      api.input.touch = { x: ux * r.x + uz * r.z, y: ux * f.x + uz * f.z, active: true };
    };
  };
}
