// 天空环境贴图的重绘（src/world/sky.js update()）：约每 20 秒（现实时间）重绘一次；时辰与上次重绘相差 0.6 小时以上（调时辰、自检取图、丹房一炉 +1 小时）时当帧重绘。
// 第十三轮加的时辰跳变判断写反了（同一时刻算出 12、相差 12 小时反而算出 0），第一次重绘之后每帧都重绘——这里是修正后的自检与修正前后的测量。
// 都按真实的更新、绘制代码推进（__qinglan.tick），不另写一套；refreshEnv 只包一层记下调用，照常执行。
// 注意：别的自检常调 skyQuiet(true)（tools/r21_growth.js，把 refreshEnv 换成空函数）；这里的 setup 换回真的，各项都用真的 refreshEnv。
// 用法（预览）：const E = await import('/tools/r27_skyenv.js?v=' + Date.now()); await E.setup();
//   E.cadenceRun()   按 1/60 秒一帧推进 70 秒（只推进不画），记下每次重绘的时刻（应约每 20 秒一次）；fps 可改
//   E.bg('realtimeRun')  按墙钟推进约 22 秒（每帧 dt 取真实流逝的时间、照常绘制），量两次重绘在墙钟上隔了多久
//   E.jumpRun()      调时辰：与上次重绘的环形时差超过 0.6 小时（含跨零点）当帧重绘，以内不重绘
//   E.todRun()       黎明 → 白天 → 黄昏 → 夜：调时辰后画一帧，那一帧里重绘；环境贴图的平均颜色随之变，水面、灵池、琉璃 / 金 / 铜换上新贴图；shots 给前缀时截图
//   E.costRun()      单次 refreshEnv 的耗时
//   E.perfRun()      画布 1280×720 的每帧耗时（tick(1/60, 1, true) + readPixels），广场 / 山门 / 主峰
//   超过二三十秒的放进 setTimeout 里跑：E.bg('perfRun', {...})，结果在 window.__skyenv
import * as B from './r17_combat_bot.js';
import { AM } from '/src/world/arch/builder.js';

const Q = () => window.__qinglan;
const r2 = (v) => +(+v).toFixed(2), r3 = (v) => +(+v).toFixed(3);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const stat = (v) => {
  if (!v.length) return null;
  const s = v.slice().sort((a, b) => a - b), q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { n: s.length, mean: r2(s.reduce((a, b) => a + b, 0) / s.length), median: r2(q(0.5)), p95: r2(q(0.95)), max: r2(s[s.length - 1]) };
};
// 视点与 tools/perf_r9.js 相同：[x, z, yaw]，传送后镜头 view(yaw, 0.1, 8)
export const VIEWS = { plaza: [0, 20, Math.PI], gate: [0, 88, Math.PI], summit: [0, -180, Math.PI] };
// 黎明、白天、黄昏、夜（游戏小时）
export const TOD = [['dawn', 5.3], ['day', 10], ['dusk', 18.6], ['night', 22.5]];

const realRefresh = () => Object.getPrototypeOf(Q().sky).refreshEnv;
// 记下每次重绘（照常执行真的 refreshEnv）；info() 的返回值一并记下；stop() 复原
export function spy(info = null) {
  const S = Q().sky, own = hasOwn(S, 'refreshEnv'), prev = S.refreshEnv, real = realRefresh();
  const log = [];
  S.refreshEnv = function (...a) { log.push({ hour: r3(Q().TIME.hour), from: this.envHour == null ? null : r3(this.envHour), ...(info ? info() : {}) }); return real.apply(this, a); };
  return { log, stop() { if (own) S.refreshEnv = prev; else delete S.refreshEnv; } };
}
// 环形时差（小时，0–12）
const hourDiff = (a, b) => Math.abs(((a - b + 36) % 24) - 12);

export async function setup() {
  const s = await B.setup();
  B.quietDragons(true);
  const A = Q(), S = A.sky;
  if (hasOwn(S, 'refreshEnv')) S.refreshEnv = realRefresh();          // 前面的自检留下的 skyQuiet(true)：换回真的
  A.TIME.paused = false;
  return { ...s, envHour: S.envHour ?? null, envT: r2(S.envT), quality: A.quality, pixelRatio: A.renderer.getPixelRatio() };
}

// =====================================================================================
// 1. 约每 20 秒重绘一次：按 1/fps 秒一帧推进 secs 秒（只推进不画），记下每次重绘发生在第几秒、当时与上次重绘的时辰差。
//    游戏时间是现实的 100 倍，20 秒走 0.556 小时——还不到 0.6，平常只由 20 秒的计时触发
// =====================================================================================
export function cadenceRun({ secs = 70, fps = 60, hour = 10 } = {}) {
  const A = Q(), S = A.sky, dt = 1 / fps, t0 = performance.now();
  A.TIME.hour = hour; A.TIME.paused = false;
  const envT0 = r2(S.envT), envHour0 = S.envHour == null ? null : r3(S.envHour);
  let t = 0;
  const sp = spy(() => ({ t: r3(t) }));
  try { for (let i = 0, n = Math.round(secs * fps); i < n; i++) { t += dt; A.tick(dt, 1, false); } } finally { sp.stop(); }
  const at = sp.log.map((e) => e.t), gaps = at.slice(1).map((v, i) => r3(v - at[i]));
  const jumps = sp.log.map((e) => (e.from == null ? null : r3(hourDiff(e.hour, e.from))));
  return { fps, secs, envT0, envHour0, refreshes: sp.log.length, at, gaps, hourDiffAtRefresh: jumps, hourEnd: r3(A.TIME.hour), wallMs: Math.round(performance.now() - t0),
    ok: gaps.length >= 2 && gaps.every((g) => g > 19.9 && g < 20.2) };
}

// 1b. 墙钟：同步循环里每帧按真实流逝的时间推进（与主循环一样 dt = min(实际间隔, 0.05)，画布 1280×720 照常绘制并读回 1 个像素），
//     先把时辰调开 3 小时（第一帧当帧重绘），量之后每次重绘在墙钟上隔了多久。后台标签页没有 requestAnimationFrame，用 E.bg('realtimeRun') 跑
export function realtimeRun({ secs = 22, w = 1280, h = 720 } = {}) {
  const A = Q(), R = A.renderer, S = A.sky, gl = R.getContext(), px = new Uint8Array(4);
  const keep = { size: R.getSize(new A.THREE.Vector2()), pr: R.getPixelRatio(), asp: A.camera.aspect };
  R.setPixelRatio(1); R.setSize(w, h, false); A.camera.aspect = w / h; A.camera.updateProjectionMatrix();
  A.TIME.paused = false; A.TIME.hour = ((S.envHour ?? A.TIME.hour) + 3) % 24;
  const t0 = performance.now(), sp = spy(() => ({ wall: performance.now() - t0 }));
  let last = t0, frames = 0;
  try {
    while (performance.now() - t0 < secs * 1000) {
      const now = performance.now(), dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      A.tick(dt, 1, true); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); frames++;
    }
  } finally { sp.stop(); R.setPixelRatio(keep.pr); R.setSize(keep.size.x, keep.size.y, false); A.camera.aspect = keep.asp; A.camera.updateProjectionMatrix(); }
  const at = sp.log.map((e) => e.wall), gaps = at.slice(1).map((v, i) => v - at[i]);
  return { secs, frames, fps: r2(frames / secs), refreshAtS: at.map((v) => r3(v / 1000)), gapsS: gaps.map((g) => r3(g / 1000)), hours: sp.log.map((e) => [e.from, e.hour]),
    ok: at.length >= 2 && at[0] < 100 && gaps.every((g) => g > 19900 && g < 20200) };
}

// =====================================================================================
// 2. 调时辰：先在 from 时刻重绘一次（与 update 里重绘时一样把计时归零），改到 to 后推进一帧——
//    与上次重绘的环形时差超过 0.6 小时当帧重绘（want 1），以内不重绘（want 0，等 20 秒的计时）
// =====================================================================================
export const JUMPS = [[10, 13], [13, 11], [10, 10.3], [10, 10.7], [23.8, 0.2], [23.5, 1.0], [0.2, 23.9], [6, 18], [21.5, 22.5]];
export function jumpRun(cases = JUMPS) {
  const A = Q(), S = A.sky, real = realRefresh(), out = [];
  for (const [from, to] of cases) {
    A.TIME.hour = from; real.call(S); S.envT = 0;
    A.TIME.hour = to;
    const sp = spy();
    try { A.tick(1 / 60, 1, false); } finally { sp.stop(); }
    const diff = hourDiff(to, from);
    out.push({ from, to, diff: r2(diff), want: diff > 0.6 ? 1 : 0, got: sp.log.length });
  }
  return { cases: out, ok: out.every((c) => c.got === c.want) };
}

// 环境贴图（PMREM 的 cubeUV 图集）LOD0 六个面的平均颜色（线性）：all 六面、up 顶面（+Y）、horizon 四个侧面；lum 为 all 的亮度
// 面的排列见 three 的 PMREMGenerator._sceneToCubeUV：下排 +X +Y +Z、上排 −X −Y −Z，每面 size × size（size = 图集高 / 4）
export function envMean(rt = Q().sky.envRT, step = 2) {
  const A = Q(), R = A.renderer, gl = R.getContext(), size = rt.height / 4, w = 3 * size, h = 2 * size;
  const buf = new Float32Array(w * h * 4), keep = R.getRenderTarget();
  R.setRenderTarget(rt);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, buf);
  const err = gl.getError();
  R.setRenderTarget(keep);
  if (err) return { err };
  const acc = Array.from({ length: 6 }, () => [0, 0, 0]);
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const f = (y >= size ? 3 : 0) + Math.floor(x / size), i = (y * w + x) * 4;
    acc[f][0] += buf[i]; acc[f][1] += buf[i + 1]; acc[f][2] += buf[i + 2];
  }
  const n = Math.ceil(size / step) ** 2, fm = acc.map((c) => c.map((v) => v / n));
  const avg = (ids) => [0, 1, 2].map((k) => r3(ids.reduce((s, i) => s + fm[i][k], 0) / ids.length));
  const all = avg([0, 1, 2, 3, 4, 5]);
  return { all, up: avg([1]), horizon: avg([0, 2, 3, 5]), lum: r3(0.2126 * all[0] + 0.7152 * all[1] + 0.0722 * all[2]) };
}

// =====================================================================================
// 3. 黎明 → 白天 → 黄昏 → 夜：调时辰后画一帧——那一帧里重绘；环境贴图的平均颜色随之变；
//    水面（Water）、灵池水面、琉璃 / 金 / 铜（arch/builder 的 AM，殿内与各处登记的金属、釉面同一份 envMap）都换上新贴图。
//    shots：截图前缀（docs/screenshots/<前缀>_<名>.jpg），view：{ tp: [x, z, yaw], pos, at }；probe：在 probe 处放一个镜面球（只为看清反光，截完拿掉）
// =====================================================================================
export async function todRun({ hours = TOD, shots = null, w = 960, h = 540, view = null, probe = null } = {}) {
  const A = Q(), S = A.sky, T = A.THREE, out = [];
  if (view?.tp) A.tp(...view.tp);
  let ball = null;
  if (probe) {
    ball = new T.Mesh(new T.SphereGeometry(probe.r ?? 0.9, 64, 32), new T.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.04, envMap: S.envMap }));
    ball.position.set(...probe.at); A.scene.add(ball);
  }
  let prev = S.envMap;
  try {
    for (const [name, hour] of hours) {
      A.TIME.hour = hour;
      const sp = spy();
      try { A.tick(1 / 60, 1, true); } finally { sp.stop(); }
      const env = S.envMap, m = envMean(S.envRT), lc = A.ctx.lingchi?.waterMat;
      const users = { water: A.water.mat.envMap === env, lingchi: lc ? lc.envMap === env : null, glaze: AM.glaze.envMap === env, gold: AM.gold.envMap === env, bronze: AM.bronze.envMap === env };
      const r = { name, hour, refreshed: sp.log.length, newMap: env !== prev, users, mean: m.all, up: m.up, horizon: m.horizon, lum: m.lum, err: m.err };
      prev = env;
      if (ball) ball.material.envMap = env;
      if (shots) { A.tick(1 / 60, 1, true); r.shot = await A.shot(`${shots}_${name}`, { w, h, pos: view?.pos ?? null, at: view?.at ?? null }); }
      out.push(r);
    }
  } finally { if (ball) { A.scene.remove(ball); ball.geometry.dispose(); ball.material.dispose(); } }
  const lum = out.map((r) => r.lum);
  return { out, ok: out.every((r) => r.refreshed === 1 && r.newMap && Object.values(r.users).every((u) => u !== false)) && lum[1] > lum[0] && lum[1] > lum[2] && lum[2] > lum[3] };
}

// =====================================================================================
// 4. 单次重绘的耗时：直接调真的 refreshEnv，之后读回 1 个像素（画布 1280×720，等 GPU 做完）再计时；前 2 次不计
// =====================================================================================
export function costRun({ n = 20, w = 1280, h = 720 } = {}) {
  const A = Q(), R = A.renderer, S = A.sky, gl = R.getContext(), px = new Uint8Array(4), real = realRefresh();
  const keep = { size: R.getSize(new A.THREE.Vector2()), pr: R.getPixelRatio() };
  R.setPixelRatio(1); R.setSize(w, h, false);
  const v = [];
  try {
    for (let i = 0; i < n + 2; i++) {
      const t0 = performance.now();
      real.call(S); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      if (i >= 2) v.push(performance.now() - t0);
    }
  } finally { R.setPixelRatio(keep.pr); R.setSize(keep.size.x, keep.size.y, false); }
  return stat(v);
}

// =====================================================================================
// 5. 每帧耗时：画布 1280×720（像素比 1），每帧 tick(1/60, 1, true)（完整更新 + 绘制，含后期）后读回 1 个像素（等 GPU 画完）再计时；
//    视点同 tools/perf_r9.js（传送后 view(yaw, 0.1, 8)），时辰从 hour 起照常走，从刚在该时辰重绘过的状态开始（修正前：此后每帧重绘——
//    上次重绘的时辰离当前差 11.4–12 小时时修正前也不重绘，所以要先对齐；修正后：20 秒后才再重绘）；先空跑 warm 帧，modes 轮流各量 frames 帧、共 blocks 轮
//    （同一页面里交替对比，抵消后台标签页的快慢起伏）。mode：'asis' 照现有代码 / 'force' 每帧都重绘（把计时推过 20 秒，等于修正前的行为）/ 'stub' 不重绘（同 skyQuiet(true)）。
//    每种 mode：all 全部帧、envFrames 其中有重绘的帧数与它们的耗时、calls / tris 每帧绘制调用与三角形（中位数，含重绘的绘制）
// =====================================================================================
export function perfRun({ views = Object.keys(VIEWS), modes = ['asis'], frames = 120, warm = 30, blocks = 1, w = 1280, h = 720, hour = 10 } = {}) {
  const A = Q(), R = A.renderer, gl = R.getContext(), S = A.sky, px = new Uint8Array(4);
  const keep = { size: R.getSize(new A.THREE.Vector2()), pr: R.getPixelRatio(), asp: A.camera.aspect };
  R.setPixelRatio(1); R.setSize(w, h, false); A.camera.aspect = w / h; A.camera.updateProjectionMatrix();
  A.TIME.hour = hour; A.TIME.paused = false;
  realRefresh().call(S); S.envT = 0;
  let hits = 0;
  const sp = spy(() => { hits++; return {}; }), real = S.refreshEnv, stub = function () { this.envHour = Q().TIME.hour; };
  const out = { size: [w, h], quality: A.quality, modes, frames, blocks, views: {} };
  R.info.autoReset = false;
  try {
    for (const v of views) {
      const [x, z, yaw] = VIEWS[v];
      A.tp(x, z, yaw); A.view(yaw, 0.1, 8);
      S.refreshEnv = real;
      for (let i = 0; i < warm; i++) { R.info.reset(); A.tick(1 / 60, 1, true); }
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const acc = Object.fromEntries(modes.map((m) => [m, { ms: [], envMs: [], calls: [], tris: [] }]));
      for (let b = 0; b < blocks; b++) for (const m of modes) {
        S.refreshEnv = m === 'stub' ? stub : real;
        const a = acc[m];
        for (let i = 0; i < frames; i++) {
          if (m === 'force') S.envT = 1e9;
          const h0 = hits;
          R.info.reset();
          const t0 = performance.now();
          A.tick(1 / 60, 1, true);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          const ms = performance.now() - t0;
          a.ms.push(ms); if (hits > h0) a.envMs.push(ms);
          a.calls.push(R.info.render.calls); a.tris.push(R.info.render.triangles);
        }
      }
      out.views[v] = Object.fromEntries(modes.map((m) => {
        const a = acc[m];
        return [m, { all: stat(a.ms), envFrames: a.envMs.length, envMs: a.envMs.length ? stat(a.envMs) : null, calls: stat(a.calls)?.median, tris: stat(a.tris)?.median }];
      }));
    }
  } finally {
    sp.stop();
    R.info.autoReset = true;
    R.setPixelRatio(keep.pr); R.setSize(keep.size.x, keep.size.y, false); A.camera.aspect = keep.asp; A.camera.updateProjectionMatrix();
  }
  out.hourEnd = r3(A.TIME.hour);
  return out;
}

// 超过二三十秒的放进 setTimeout 里跑（预览里单次执行 30 秒为限），结果在 window.__skyenv
const RUNS = { cadenceRun, realtimeRun, jumpRun, todRun, costRun, perfRun };
export function bg(name, args = {}) {
  window.__skyenv = { running: true, name };
  setTimeout(async () => {
    const t0 = performance.now();
    try { window.__skyenv = { running: false, name, out: await RUNS[name](args), ms: Math.round(performance.now() - t0) }; }
    catch (e) { window.__skyenv = { running: false, name, err: String(e?.stack || e).slice(0, 600) }; }
  }, 0);
  return 'started';
}
