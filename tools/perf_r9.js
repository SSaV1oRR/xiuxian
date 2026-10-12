// 第九轮性能测量脚本（在浏览器控制台 / 预览里对 window.__qinglan 执行；R8 备份副本与第九轮用同一份脚本、同一台机器、同一窗口）
// 方法：画布 1600×900、像素比 1、辰时 9.5 时（时间暂停）、各视点传送后镜头 view(yaw, 0.1, 8)，先空跑 30 帧预热，
// 再连续 30 帧（每帧完整更新 + 渲染，末尾 gl.finish 等 GPU 做完）取平均，测两轮取较好的一轮；
// 三角面与绘制调用取单次 present（含后期）在 info.autoReset = false 下的累计值。
// 载入：performance 资源条目（个数、传输字节，按扩展名分类）与载入各步耗时；显存估计：场景中独立几何体的顶点 / 索引字节与独立贴图（含 mipmap 估 4/3）。
// eslint-disable-next-line no-unused-vars
async function perfR9() {
  const q = window.__qinglan, R = q.renderer, T = q.THREE, gl = R.getContext();
  const keepPR = R.getPixelRatio();
  R.setPixelRatio(1); R.setSize(1600, 900, false); q.camera.aspect = 1600 / 900; q.camera.updateProjectionMatrix();
  q.game.intro = null; q.TIME.hour = 9.5; q.TIME.paused = true;
  const V = { gate: [0, 88, Math.PI], fore: [0, 116, Math.PI], plaza: [0, 20, Math.PI], lib: [-55, -78, 0.5], dorm: [-50, 0, 2.6], alch: [53, -9, Math.PI], pool: [45, 25, -Math.PI / 2], summit: [0, -180, Math.PI], backhill: [85, -145, 2.4] };
  const frames = {};
  for (const [k, [x, z, yaw]] of Object.entries(V)) {
    q.tp(x, z, yaw); q.view(yaw, 0.1, 8);
    for (let i = 0; i < 30; i++) q.tick(1 / 60, 1);
    gl.finish();
    let best = 1e9;
    for (let rep = 0; rep < 2; rep++) {
      const t0 = performance.now();
      for (let i = 0; i < 30; i++) q.tick(1 / 60, 1);
      gl.finish();
      best = Math.min(best, (performance.now() - t0) / 30);
    }
    R.info.autoReset = false; R.info.reset();
    (q.present || ((s, c) => R.render(s, c)))(q.scene, q.camera);
    frames[k] = { ms: +best.toFixed(2), tris: R.info.render.triangles, calls: R.info.render.calls };
    R.info.autoReset = true;
  }
  R.setPixelRatio(keepPR); R.setSize(innerWidth, innerHeight, false); q.camera.aspect = innerWidth / innerHeight; q.camera.updateProjectionMatrix();
  // 载入体积
  const res = performance.getEntriesByType('resource');
  const byExt = {};
  let bytes = 0;
  for (const e of res) {
    const ext = (e.name.split('?')[0].match(/\.(\w+)$/) || [, 'other'])[1].toLowerCase();
    const b = e.transferSize || e.encodedBodySize || 0;
    bytes += b; byExt[ext] = (byExt[ext] || 0) + b;
  }
  for (const k of Object.keys(byExt)) byExt[k] = +(byExt[k] / 1048576).toFixed(2);
  // 显存估计
  const geos = new Set(), texs = new Set();
  q.scene.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) for (const v of Object.values(m)) if (v && v.isTexture) texs.add(v);
  });
  // 顶点缓冲按底层数组去重（阴影代理、合批单元与原网格共用同一份属性数组，不重复计）
  const bufs = new Set();
  for (const g of geos) { for (const a of Object.values(g.attributes)) bufs.add(a.isInterleavedBufferAttribute ? a.data.array : a.array); if (g.index) bufs.add(g.index.array); }
  let gB = 0, tB = 0;
  for (const arr of bufs) gB += arr.byteLength;
  for (const t of texs) { const im = t.image; if (im && im.width) tB += im.width * im.height * 4 * (t.generateMipmaps === false ? 1 : 4 / 3); }
  return {
    frames,
    load: { resources: res.length, MB: +(bytes / 1048576).toFixed(2), byExt, steps: q.timings },
    mem: { geometries: geos.size, buffers: bufs.size, geoMB: +(gB / 1048576).toFixed(1), textures: texs.size, texMB: +(tB / 1048576).toFixed(1), info: { ...R.info.memory } },
  };
}
