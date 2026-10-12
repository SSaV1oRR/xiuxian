// 第十六轮：程序合成的音效（WebAudio，不用外部音频文件）。第五十层镇龙封印殿的龙吼、爪风、砸地、落雷、龙焰、封印、受击、格挡……
// 都由振荡器与噪声现场合成：每个音效是一小组节点（振荡器 / 噪声 → 滤波 → 包络 → 声像 → 总线），放完自动断开。
// 总线：干声 + 一路殿堂混响（生成的衰减噪声冲激响应），再经压限器输出。音量在设置里调（qinglan.vol，0–1），首次按键 / 点击时才启动。
// 声源可带世界坐标：按与镜头的距离衰减、按左右方位分声像。
// 叠音限制（第十七轮）：gap 同名两次之间至少隔多久（秒），per 同名同时最多几个，len 一个算多长
const LIMIT = {
  _: { gap: 0.03, per: 4, len: 0.4 },
  hit: { gap: 0.04, per: 3, len: 0.25 }, hitHeavy: { gap: 0.06, per: 2, len: 0.45 }, swing: { gap: 0.05, per: 3, len: 0.35 },
  block: { gap: 0.05, per: 2, len: 0.4 }, parry: { gap: 0.08, per: 2, len: 1.0 }, guardBreak: { gap: 0.2, per: 1, len: 0.5 },
  hurt: { gap: 0.08, per: 2, len: 0.3 }, wall: { gap: 0.1, per: 2, len: 0.2 }, claw: { gap: 0.05, per: 3, len: 0.3 }, step: { gap: 0.1, per: 2, len: 0.2 },
  finish: { gap: 0.15, per: 1, len: 0.9 }, orb: { gap: 0.05, per: 3, len: 0.45 }, pop: { gap: 0.05, per: 3, len: 0.3 },
  // 第十八轮：龙君的采样（吼、低吼、攻击时的咆哮、振翅）
  roar: { gap: 0.4, per: 2, len: 2.5 }, growl: { gap: 0.25, per: 2, len: 1.2 }, snarl: { gap: 0.4, per: 1, len: 1.4 }, wing: { gap: 0.18, per: 2, len: 0.8 },
  // 第十九轮：普攻、缚灵锁、剑气、拔刀斩（蓄力 / 出鞘）、万剑归宗（落剑 / 末了的巨剑）、回血葫芦（拔塞、吞咽、塞回）
  lightSlash: { gap: 0.05, per: 3, len: 0.4 }, bind: { gap: 0.2, per: 2, len: 1.5 }, qi: { gap: 0.1, per: 2, len: 0.8 },
  iaiCharge: { gap: 0.1, per: 2, len: 7.0 }, iaiDraw: { gap: 0.1, per: 2, len: 0.6 }, ultRain: { gap: 0.5, per: 1, len: 1.9 }, ultFinal: { gap: 0.5, per: 1, len: 1.7 },
  gourdOpen: { gap: 0.1, per: 2, len: 0.5 }, gulp: { gap: 0.1, per: 2, len: 0.5 }, gourdClose: { gap: 0.1, per: 2, len: 0.4 },
  // 第二十一轮：九霄凤焰（受限：撞击、弹反冲击每次只一声；凤焰弹、命中按间隔限流；持续灼烧不出声）与提升修为
  phoenixCry: { gap: 1.0, per: 1, len: 1.9 }, phoenixWing: { gap: 0.6, per: 1, len: 1.2 }, phoenixBlast: { gap: 0.5, per: 1, len: 1.7 }, phoenixParry: { gap: 0.4, per: 1, len: 0.8 },
  phoenixBolt: { gap: 0.3, per: 2, len: 0.55 }, phoenixBoltHit: { gap: 0.2, per: 2, len: 0.6 }, phoenixBreath: { gap: 1.0, per: 1, len: 1.6 }, phoenixSwoop: { gap: 0.6, per: 1, len: 0.85 },
  ascendGather: { gap: 2.5, per: 1, len: 2.9 }, ascendDone: { gap: 1.0, per: 1, len: 1.6 },
  // 第二十三轮：雷龙破虚——一次脉冲至多两声雷（不随目标数叠加），撕裂、龙鸣、俯冲、爆雷各一声
  riftTear: { gap: 1.0, per: 1, len: 2.3 }, dragonRoar: { gap: 1.0, per: 1, len: 2.9 }, thunderStrike: { gap: 0.05, per: 2, len: 1.1 },
  stormRumble: { gap: 1.5, per: 1, len: 4.2 }, dragonDive: { gap: 0.8, per: 1, len: 1.6 }, thunderBlast: { gap: 0.8, per: 1, len: 3.1 },
  // 第二十六轮：俯冲撞地的闷响（叠在爆雷上）、之后残留电弧的噼啪
  dragonSlam: { gap: 0.8, per: 1, len: 2.4 }, zapTail: { gap: 0.8, per: 1, len: 1.8 },
  // 第二十五轮：拔刀斩「终式·墨·终焉」——墨痕破空、画卷纸声、龙凤撞入的墨溅、收刀清响（每次只一声，要清楚突出）、爆墨；墨势成势、满蓄力的提示
  inkWhoosh: { gap: 0.3, per: 1, len: 0.7 }, paper: { gap: 0.6, per: 1, len: 1.3 }, inkHit: { gap: 0.12, per: 2, len: 0.7 },
  noto: { gap: 0.4, per: 1, len: 1.4 }, inkBurst: { gap: 0.6, per: 1, len: 2.0 }, inkReady: { gap: 1.0, per: 1, len: 1.0 }, inkFull: { gap: 0.6, per: 1, len: 0.8 }, inkDraw: { gap: 0.3, per: 1, len: 0.6 },
  // 第二十七轮：「墨里终焉」——龙吟、凤鸣、八卦共鸣的锣、画卷展开（assets/skill/molizhongyan 的录音，见 tools/r27_build_sfx.py）；山水铺开的风声（合成）
  mlRoar: { gap: 1.0, per: 1, len: 3.6 }, mlCry: { gap: 1.0, per: 1, len: 2.3 }, mlGong: { gap: 1.0, per: 1, len: 4.6 }, mlUnfold: { gap: 0.5, per: 1, len: 1.5 }, inkSwell: { gap: 1.0, per: 1, len: 2.2 },
  // 第二十八轮：龙凤撞地的墨震（凤、龙各一声，相隔 0.2 秒）
  inkSlam: { gap: 0.15, per: 2, len: 2.4 },
};
// 第十八轮：采样音效。assets/converted/sfx/sfx.json 列出每个音效的若干份录音（tools/r18_build_sfx.py 由素材剪成；第十九轮起为 r19_build_sfx.py），
// 有采样的音效直接放录音（同一条声像、距离衰减、混响与叠音限制，随机挑一份、音高略有浮动），没有的仍用下面的合成；
// 背景音乐（第五十层的出场曲与战斗曲）用 <audio> 流式播放，接进同一条总线，可淡入淡出、压低。
// 第二十九轮：演出音乐的解码与截段——离线的上下文解码（还没有声音上下文时也能预载），只留原曲 at 秒起 seg 秒（整首解码约 55 MB，截段约 9 MB）
function decodeClip(ab) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(2, 1, 48000);
  return new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
}
function sliceClip(full, at, seg) {
  const sr = full.sampleRate, i0 = Math.min(full.length - 1, Math.max(0, Math.round(at * sr))), n = Math.max(1, Math.min(full.length - i0, Math.round(seg * sr)));
  const out = new AudioBuffer({ numberOfChannels: full.numberOfChannels, length: n, sampleRate: sr });
  for (let c = 0; c < full.numberOfChannels; c++) out.copyToChannel(full.getChannelData(c).subarray(i0, i0 + n), c);
  return out;
}

export class SoundFx {
  constructor() {
    this.ctx = null;
    this.vol = Math.min(1, Math.max(0, +(localStorage.getItem('qinglan.vol') ?? 0.7)));
    this.musicVol = Math.min(1, Math.max(0, +(localStorage.getItem('qinglan.music') ?? 0.6)));
    this.loops = new Map();
    this.bank = null;               // { 名字: { gain, wet, pv, ref, loop, bufs: [AudioBuffer] } }
    this.tracks = new Map();        // 背景音乐：名字 → { el, src, g }
    this.listener = null;           // { pos: Vector3, right: { x, z } }（每帧由场景更新）
    const start = () => { this.ensure(); this.ctx?.state === 'suspended' && this.ctx.resume(); };
    addEventListener('pointerdown', start, { passive: true });
    addEventListener('keydown', start);
  }
  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.vol;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.dry = ctx.createGain(); this.dry.connect(this.master);
    this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(2.6, 2.2);
    this.wet = ctx.createGain(); this.wet.gain.value = 0.32;
    this.verb.connect(this.wet); this.wet.connect(this.master);
    this.noiseBuf = { white: this.noise('white'), pink: this.noise('pink'), brown: this.noise('brown') };
    // 背景音乐：各曲 → 压低（过场、打开界面时）→ 音乐音量 → 总音量
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicVol;
    this.musicDuck = ctx.createGain(); this.musicDuck.connect(this.musicBus); this.musicBus.connect(this.master);
    return ctx;
  }
  setVolume(v) { this.vol = Math.min(1, Math.max(0, v)); localStorage.setItem('qinglan.vol', String(this.vol)); if (this.master) this.master.gain.value = this.vol; }
  setMusicVolume(v) { this.musicVol = Math.min(1, Math.max(0, v)); localStorage.setItem('qinglan.music', String(this.musicVol)); if (this.musicBus) this.musicBus.gain.value = this.musicVol; }

  // ---------- 采样库：载入时解码（不必等声音上下文，用离线上下文解码；解出的缓冲各上下文通用）----------
  loadBank(url = 'assets/converted/sfx/sfx.json') {
    if (this.bankP) return this.bankP;
    const base = url.slice(0, url.lastIndexOf('/') + 1);
    this.bankP = (async () => {
      const man = await (await fetch(url)).json();
      const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!AC) return null;
      const dec = new AC(1, 2, 44100);
      const bank = {};
      await Promise.all(Object.entries(man).filter(([k]) => k !== '_').map(async ([name, e]) => {
        try {
          const bufs = await Promise.all(e.files.map(async (f) => dec.decodeAudioData(await (await fetch(base + f.file)).arrayBuffer())));
          bank[name] = { ...e, bufs, last: -1 };
        } catch (err) { console.warn('音效载入失败', name, err); }
      }));
      this.bank = bank;
      return bank;
    })().catch((err) => { console.warn('音效库载入失败，改用合成音', err); this.bankP = null; return null; });
    return this.bankP;
  }
  // 放一份采样：随机挑一份（不连着放同一份），音高 pitch × (1 ± pv)，dur 时在末尾 0.25 秒淡出；offset 从录音的第几秒放起。
  // 第十九轮：返回 { src, g, stop(fade) }——拔刀斩的蓄力声在出刀、取消时要半途淡出
  playSample(S, t, o) {
    const ctx = this.ctx, n = S.bufs.length;
    let i = 0;
    if (n > 1) { i = Math.floor(Math.random() * (n - 1)); if (i >= S.last) i++; }
    S.last = i;
    const src = ctx.createBufferSource();
    src.buffer = S.bufs[i];
    src.playbackRate.value = Math.max(0.3, (o.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * (S.pv ?? 0)));
    const out = this.out({ ...o, gain: (o.gain ?? 1) * (S.gain ?? 1), wet: o.wet ?? S.wet ?? 0.4, ref: o.ref ?? S.ref });
    const g = this.gain(1, out);
    if (o.dur) {
      const end = t + o.dur;
      g.gain.setValueAtTime(1, Math.max(t, end - 0.25)); g.gain.linearRampToValueAtTime(0.0001, end);
      src.stop(end + 0.05);
    }
    src.connect(g);
    src.start(t, Math.max(0, Math.min(o.offset || 0, src.buffer.duration - 0.01)));
    const h = { src, g, stopped: false, stop: (fade = 0.12) => {
      if (h.stopped) return;
      h.stopped = true; h.free?.();
      try {
        const now = ctx.currentTime, v = g.gain.value;
        g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(v, now); g.gain.linearRampToValueAtTime(0.0001, now + fade);
        src.stop(now + fade + 0.02);
      } catch (e) { /* 已经停了 */ }
    } };
    return h;
  }
  get ok() { return !!this.ctx && this.ctx.state === 'running' && this.vol > 0.001; }

  impulse(sec, decay) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (i < 400 ? i / 400 : 1); }
    return b;
  }
  noise(kind) {
    const ctx = this.ctx, n = ctx.sampleRate * 3, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.05) * 2.2; }
      else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    return b;
  }

  // ---------- 小积木 ----------
  // 输出口：声像 + 距离衰减 + 干 / 湿两路
  out(o = {}) {
    const ctx = this.ctx, g = ctx.createGain();
    let k = o.gain ?? 1, pan = 0;
    if (o.at && this.listener) {
      const L = this.listener, dx = o.at.x - L.pos.x, dz = o.at.z - L.pos.z, dy = (o.at.y ?? L.pos.y) - L.pos.y, d = Math.hypot(dx, dy, dz);
      k *= 1 / (1 + Math.max(0, d - 4) / (o.ref ?? 14));
      if (d > 0.5) pan = Math.max(-0.85, Math.min(0.85, (dx * L.right.x + dz * L.right.z) / d));
    }
    g.gain.value = k;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pan; g.connect(p); p.connect(this.dry); } else g.connect(this.dry);
    const send = ctx.createGain(); send.gain.value = o.wet ?? 0.5; g.connect(send); send.connect(this.verb);
    return g;
  }
  env(param, t0, a, peak, hold, r, base = 0) {
    param.cancelScheduledValues(t0);
    param.setValueAtTime(base, t0);
    param.linearRampToValueAtTime(peak, t0 + Math.max(0.002, a));
    param.setValueAtTime(peak, t0 + a + hold);
    param.exponentialRampToValueAtTime(Math.max(1e-4, base || 1e-4), t0 + a + hold + Math.max(0.01, r));
    return t0 + a + hold + r;
  }
  osc(type, f, t0, t1, dest, fEnv = null) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (fEnv) for (const [dt, v, lin] of fEnv) lin ? o.frequency.linearRampToValueAtTime(v, t0 + dt) : o.frequency.exponentialRampToValueAtTime(Math.max(1, v), t0 + dt);
    o.connect(dest); o.start(t0); o.stop(t1 + 0.05);
    return o;
  }
  nz(kind, t0, t1, dest, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf[kind]; s.loop = true; s.playbackRate.value = rate;
    s.connect(dest); s.start(t0, Math.random() * 2); s.stop(t1 + 0.05);
    return s;
  }
  filt(type, f, q = 0.7, dest) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(dest); return b; }
  gain(v, dest) { const g = this.ctx.createGain(); g.gain.value = v; g.connect(dest); return g; }
  shaper(k, dest) {
    const s = this.ctx.createWaveShaper(), n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    s.curve = c; s.connect(dest); return s;
  }

  // ---------- 音效 ----------
  // name：见下；o：{ at 世界坐标, gain, dur, pitch, offset（采样从录音的第几秒放起）}；放的是采样时返回句柄 { stop(淡出秒数) }，合成音返回 null
  // 第十七轮：限制叠音——同名音效 gap 秒内不重复起、同时最多 per 个，全部最多 maxVoices 个（多目标同时命中不会炸成一片）
  play(name, o = {}) {
    if (!this.ensure() || this.vol <= 0.001) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const f = this[`s_${name}`];
    // 第十八轮：有采样就放采样（重击用 hitHeavy；重挥、难挡的顶架低一些、响一些）
    const sn = name === 'hit' && o.big && this.bank?.hitHeavy ? 'hitHeavy' : name;
    const S = !o.synth && this.bank?.[sn]?.bufs?.length ? this.bank[sn] : null;
    if (!f && !S) return;
    const now = this.ctx.currentTime, L = LIMIT[name] || LIMIT._;
    const act = (this.voices ||= {})[name] ||= [];
    while (act.length && act[0] <= now) act.shift();
    this.allV = (this.allV || []).filter((t) => t > now);
    if (now - (this.lastT?.[name] ?? -9) < L.gap || act.length >= L.per || this.allV.length >= 24) { this.dropped = (this.dropped || 0) + 1; return; }
    (this.lastT ||= {})[name] = now;
    const end = now + L.len;
    act.push(end); act.sort((a, b) => a - b); this.allV.push(end);
    try {
      if (S) {
        const k = (name === 'swing' && o.heavy) || (name === 'block' && o.hard) ? [0.82, 1.25] : [1, 1];
        const h = this.playSample(S, now + (o.delay || 0), { ...o, pitch: (o.pitch ?? 1) * k[0], gain: (o.gain ?? 1) * k[1] });
        // 半途停掉的：叠音名额随之让出（不必等满 len 秒）
        h.free = () => { const t = this.ctx.currentTime + 0.05; for (const arr of [act, this.allV]) { const j = arr.indexOf(end); if (j >= 0) arr[j] = t; } act.sort((a, b) => a - b); };
        return h;
      }
      f.call(this, now + (o.delay || 0), o);
    } catch (e) { /* 个别浏览器不支持的节点：静默 */ }
    return null;
  }
  // 第十七轮：玩家的剑——挥剑（有风声的方向：随出手的左右声像）、命中（短促的切入 + 闷响）、重击（更低更沉）、撞墙（金石一声）
  s_swing(t, o) {
    const heavy = !!o.heavy, p = (o.pitch ?? 1) * (heavy ? 0.72 : 1);
    this.s_whoosh(t, { ...o, dur: heavy ? 0.42 : 0.26, pitch: p, gain: (o.gain ?? 1) * (heavy ? 0.85 : 0.6) });
    if (heavy) { const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.25, wet: 0.3 }); const g = this.gain(0, out); this.env(g.gain, t + 0.05, 0.1, 0.8, 0.05, 0.25); this.nz('brown', t, t + 0.5, this.filt('lowpass', 260, 0.7, g)); }
  }
  s_hitHeavy(t, o) {
    this.s_hit(t, { ...o, big: true, gain: (o.gain ?? 1) * 1.1 });
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.55, wet: 0.35 });
    const g = this.gain(0, out); this.env(g.gain, t, 0.003, 1, 0.03, 0.35);
    this.osc('sine', 95, t, t + 0.45, g, [[0.35, 38]]);
  }
  s_wall(t, o) {
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.45, wet: 0.35 });
    for (const [f, a, d] of [[880, 0.4, 0.18], [1960, 0.25, 0.12], [3300, 0.12, 0.08]]) { const g = this.gain(0, out); this.env(g.gain, t, 0.001, a, 0.003, d); this.osc('triangle', f, t, t + d + 0.05, g); }
    const n = this.gain(0, out); this.env(n.gain, t, 0.001, 0.7, 0.01, 0.12); this.nz('white', t, t + 0.16, this.filt('bandpass', 2600, 0.9, n));
  }
  s_finish(t, o) {
    this.s_hitHeavy(t, o);
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.3, wet: 0.7 });
    [523.3, 784, 1046.5].forEach((f, i) => { const g = this.gain(0, out); this.env(g.gain, t + 0.04 + i * 0.03, 0.01, 0.5, 0.02, 0.7); this.osc('sine', f, t, t + 0.9, g); });
  }
  s_dodge(t, o) { this.s_whoosh(t, { ...o, dur: 0.22, pitch: 1.35, gain: (o.gain ?? 1) * 0.45 }); }
  s_dash(t, o) { this.s_whoosh(t, { ...o, dur: 0.5, pitch: 0.9, gain: (o.gain ?? 1) * 0.8 }); this.s_whoosh(t + 0.12, { ...o, dur: 0.35, pitch: 1.4, gain: (o.gain ?? 1) * 0.4 }); }
  s_lockOn(t, o) { const out = this.out({ gain: (o.gain ?? 1) * 0.22, wet: 0.3 }); const g = this.gain(0, out); this.env(g.gain, t, 0.003, 0.8, 0.02, 0.18); this.osc('sine', 1318, t, t + 0.25, g, [[0.08, 1760]]); }
  s_lockOff(t, o) { const out = this.out({ gain: (o.gain ?? 1) * 0.18, wet: 0.3 }); const g = this.gain(0, out); this.env(g.gain, t, 0.003, 0.8, 0.02, 0.16); this.osc('sine', 988, t, t + 0.22, g, [[0.1, 660]]); }
  // 缚灵锁：锁链哗啦一声，一记清亮的符声
  s_bind(t, o) {
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.4, wet: 0.55 });
    for (let i = 0; i < 6; i++) {
      const tt = t + Math.random() * 0.35, f = 1100 + Math.random() * 1400, g = this.gain(0, out);
      this.env(g.gain, tt, 0.002, 0.35 + Math.random() * 0.3, 0.005, 0.18 + Math.random() * 0.2);
      this.osc('triangle', f, tt, tt + 0.45, g);
    }
    const c = this.gain(0, out); this.env(c.gain, t + 0.05, 0.01, 0.6, 0.05, 0.9);
    this.osc('sine', 880, t, t + 1.1, c); this.osc('sine', 1320, t, t + 1.1, this.gain(0.4, c));
  }
  s_roar(t, o) {
    const dur = o.dur ?? 2.0, out = this.out({ ...o, gain: (o.gain ?? 1) * 0.9, wet: 0.7 }), p = o.pitch ?? 1;
    const g = this.gain(0, out); this.env(g.gain, t, 0.18, 0.9, dur * 0.45, dur * 0.5);
    const sh = this.shaper(6, g);
    const bp = this.filt('bandpass', 520 * p, 1.4, sh), lp = this.filt('lowpass', 1400 * p, 0.6, sh);
    for (const [f0, det] of [[78, 0], [81, 0.3], [117, 0.6]]) this.osc('sawtooth', f0 * p, t, t + dur, f0 > 100 ? bp : lp, [[0.25, (f0 + 40) * p], [dur * 0.6, f0 * 1.15 * p], [dur, f0 * 0.7 * p]]).detune.value = det * 30;
    const ng = this.gain(0, out); this.env(ng.gain, t, 0.1, 0.55, dur * 0.4, dur * 0.55);
    this.nz('brown', t, t + dur, this.filt('lowpass', 700, 0.8, ng));
    const hg = this.gain(0, out); this.env(hg.gain, t + 0.05, 0.15, 0.16, dur * 0.3, dur * 0.5);
    this.nz('pink', t, t + dur, this.filt('bandpass', 2200 * p, 1.2, hg));
  }
  s_growl(t, o) {
    const dur = o.dur ?? 0.7, out = this.out({ ...o, gain: (o.gain ?? 1) * 0.55 });
    const g = this.gain(0, out); this.env(g.gain, t, 0.08, 0.8, dur * 0.4, dur * 0.5);
    const lp = this.filt('lowpass', 420, 1, this.shaper(4, g));
    this.osc('sawtooth', 52, t, t + dur, lp, [[dur, 44]]);
    this.nz('brown', t, t + dur, this.filt('lowpass', 300, 0.7, g));
  }
  s_whoosh(t, o) {
    const dur = o.dur ?? 0.32, out = this.out({ ...o, gain: (o.gain ?? 1) * 0.7, wet: 0.25 });
    const g = this.gain(0, out); this.env(g.gain, t, dur * 0.35, 0.9, 0, dur * 0.65);
    const bp = this.filt('bandpass', 500, 1.6, g);
    bp.frequency.setValueAtTime(380, t); bp.frequency.exponentialRampToValueAtTime(2600 * (o.pitch ?? 1), t + dur * 0.5); bp.frequency.exponentialRampToValueAtTime(900, t + dur);
    this.nz('white', t, t + dur, bp);
  }
  s_claw(t, o) { this.s_whoosh(t, { ...o, dur: 0.3, pitch: 1.2 }); const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.25, wet: 0.2 }); const g = this.gain(0, out); this.env(g.gain, t + 0.08, 0.01, 0.8, 0.02, 0.12); this.nz('white', t + 0.08, t + 0.3, this.filt('highpass', 3500, 0.8, g)); }
  s_thump(t, o) {
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.6, wet: 0.35 });
    const g = this.gain(0, out); this.env(g.gain, t, 0.004, 1, 0.02, 0.28);
    this.osc('sine', 120, t, t + 0.35, g, [[0.25, 42]]);
    const ng = this.gain(0, out); this.env(ng.gain, t, 0.002, 0.5, 0.01, 0.12);
    this.nz('brown', t, t + 0.2, this.filt('lowpass', 500, 0.7, ng));
  }
  s_slam(t, o) {
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 1.0, wet: 0.6 });
    const g = this.gain(0, out); this.env(g.gain, t, 0.003, 1, 0.05, 0.9);
    this.osc('sine', 75, t, t + 1.1, g, [[0.6, 28]]);
    const ng = this.gain(0, out); this.env(ng.gain, t, 0.003, 0.9, 0.05, 1.1);
    this.nz('brown', t, t + 1.3, this.filt('lowpass', 420, 0.6, ng));
    // 碎石：高频的碎响
    const rg = this.gain(0, out); this.env(rg.gain, t + 0.05, 0.01, 0.35, 0.1, 0.6);
    this.nz('white', t, t + 0.9, this.filt('bandpass', 2600, 0.9, rg), 0.7);
  }
  s_boom(t, o) {
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.8, wet: 0.7 });
    const g = this.gain(0, out); this.env(g.gain, t, 0.02, 0.9, 0.1, 1.6);
    this.osc('sine', 48, t, t + 1.8, g, [[1.2, 30]]);
    const ng = this.gain(0, out); this.env(ng.gain, t, 0.04, 0.6, 0.2, 1.4);
    const bp = this.filt('lowpass', 900, 0.6, ng); bp.frequency.setValueAtTime(1600, t); bp.frequency.exponentialRampToValueAtTime(200, t + 1.5);
    this.nz('pink', t, t + 1.8, bp);
  }
  s_thunder(t, o) {
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 1.0, wet: 0.75, ref: 20 });
    const c = this.gain(0, out); this.env(c.gain, t, 0.002, 1, 0.03, 0.18);
    this.nz('white', t, t + 0.25, this.filt('highpass', 1200, 0.7, c));
    const r = this.gain(0, out); this.env(r.gain, t + 0.04, 0.12, 0.9, 0.5, 2.2);
    const lp = this.filt('lowpass', 260, 0.7, r);
    this.nz('brown', t, t + 3, lp, 0.8);
    // 雷声的滚动：几次随机的起伏
    for (let i = 0; i < 4; i++) { const tt = t + 0.3 + i * (0.35 + Math.random() * 0.3); r.gain.setValueAtTime(0.5 + Math.random() * 0.5, tt); }
  }
  // 第二十六轮：雷龙俯冲撞地——一记往下沉的极低闷响、炸开的脆裂、碎石哗啦、之后低沉的滚动（叠在采样 thunderBlast 上）
  s_dragonSlam(t, o) {
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.8, wet: 0.5, ref: o.ref ?? 34 });
    const g = this.gain(0, out); this.env(g.gain, t, 0.003, 0.85, 0.07, 1.25);
    this.osc('sine', 72, t, t + 1.45, g, [[0.85, 23]]);
    const g2 = this.gain(0, out); this.env(g2.gain, t, 0.003, 0.42, 0.04, 0.55);
    this.osc('triangle', 46, t, t + 0.7, this.filt('lowpass', 180, 0.7, this.shaper(3, g2)), [[0.55, 27]]);
    const c = this.gain(0, out); this.env(c.gain, t, 0.001, 0.62, 0.01, 0.14);
    this.nz('white', t, t + 0.2, this.filt('highpass', 1600, 0.7, c));
    for (let i = 0; i < 12; i++) {
      const tt = t + 0.03 + Math.pow(Math.random(), 1.5) * 0.8, gg = this.gain(0, out);
      this.env(gg.gain, tt, 0.002, 0.2 + Math.random() * 0.25, 0.01, 0.05 + Math.random() * 0.08);
      this.nz('white', tt, tt + 0.16, this.filt('bandpass', 700 + Math.random() * 2400, 1.3, gg));
    }
    const r = this.gain(0, out); this.env(r.gain, t + 0.04, 0.12, 0.65, 0.35, 1.7);
    this.nz('brown', t, t + 2.4, this.filt('lowpass', 210, 0.7, r), 0.8);
  }
  // 第二十六轮：撞地之后残留电弧的噼啪（越来越稀、越来越轻；夹几声短促的电嗡）
  s_zapTail(t, o) {
    const dur = o.dur ?? 1.6, out = this.out({ ...o, gain: (o.gain ?? 1) * 0.42, wet: 0.35 });
    for (let i = 0; i < 26; i++) {
      const x = Math.pow(Math.random(), 1.8), tt = t + x * dur, g = this.gain(0, out);
      this.env(g.gain, tt, 0.001, (0.5 + Math.random() * 0.5) * (1 - x * 0.75), 0.004, 0.03 + Math.random() * 0.06);
      this.nz('white', tt, tt + 0.1, this.filt('bandpass', 2500 + Math.random() * 4500, 1.1, g));
      if (Math.random() < 0.3) { const b = this.gain(0, out); this.env(b.gain, tt, 0.002, 0.18 * (1 - x * 0.7), 0.02, 0.05); this.osc('sawtooth', 110 + Math.random() * 60, tt, tt + 0.1, this.filt('bandpass', 1400, 2, b)); }
    }
  }
  s_crackle(t, o) {
    const dur = o.dur ?? 0.9, out = this.out({ ...o, gain: (o.gain ?? 1) * 0.4, wet: 0.3 });
    for (let i = 0; i < 14; i++) {
      const tt = t + Math.random() * dur, g = this.gain(0, out);
      this.env(g.gain, tt, 0.002, 0.7 + Math.random() * 0.3, 0.005, 0.04 + Math.random() * 0.05);
      this.nz('white', tt, tt + 0.1, this.filt('bandpass', 2000 + Math.random() * 4000, 1.2, g));
    }
  }
  s_charge(t, o) {
    const dur = o.dur ?? 1.2, out = this.out({ ...o, gain: (o.gain ?? 1) * 0.45, wet: 0.55 });
    const g = this.gain(0, out); this.env(g.gain, t, dur * 0.8, 0.8, dur * 0.1, 0.25);
    const lp = this.filt('lowpass', 1800, 0.9, g);
    this.osc('sawtooth', 90, t, t + dur + 0.3, lp, [[dur, 420 * (o.pitch ?? 1)]]);
    this.osc('sine', 180, t, t + dur + 0.3, g, [[dur, 840 * (o.pitch ?? 1)]]);
    const trem = this.ctx.createOscillator(), tg = this.ctx.createGain(); trem.frequency.setValueAtTime(6, t); trem.frequency.linearRampToValueAtTime(18, t + dur); tg.gain.value = 0.35; trem.connect(tg); tg.connect(g.gain); trem.start(t); trem.stop(t + dur + 0.3);
  }
  s_flameBurst(t, o) {
    const dur = o.dur ?? 0.9, out = this.out({ ...o, gain: (o.gain ?? 1) * 0.75, wet: 0.45 });
    const g = this.gain(0, out); this.env(g.gain, t, 0.03, 1, dur * 0.3, dur * 0.7);
    const bp = this.filt('bandpass', 700, 0.6, g); bp.frequency.setValueAtTime(1600, t); bp.frequency.exponentialRampToValueAtTime(380, t + dur);
    this.nz('pink', t, t + dur + 0.1, bp);
    const lg = this.gain(0, out); this.env(lg.gain, t, 0.01, 0.6, 0.05, 0.4);
    this.osc('sine', 90, t, t + 0.5, lg, [[0.4, 45]]);
    this.s_crackle(t, { ...o, dur, gain: (o.gain ?? 1) * 0.6 });
  }
  s_orb(t, o) {
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.4, wet: 0.5 });
    const g = this.gain(0, out); this.env(g.gain, t, 0.01, 0.8, 0.05, 0.35);
    this.osc('triangle', 280, t, t + 0.45, g, [[0.25, 880]]);
    this.osc('sine', 560, t, t + 0.45, this.gain(0.4, g), [[0.25, 1760]]);
    this.s_whoosh(t, { ...o, dur: 0.25, gain: (o.gain ?? 1) * 0.5, pitch: 1.4 });
  }
  s_pop(t, o) {
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.6, wet: 0.4 });
    const g = this.gain(0, out); this.env(g.gain, t, 0.002, 1, 0.01, 0.22);
    this.nz('white', t, t + 0.3, this.filt('bandpass', 1300, 0.8, g));
    const s = this.gain(0, out); this.env(s.gain, t, 0.002, 0.7, 0.01, 0.2); this.osc('sine', 300, t, t + 0.25, s, [[0.2, 90]]);
  }
  s_hit(t, o) {
    const big = !!o.big, out = this.out({ ...o, gain: (o.gain ?? 1) * (big ? 0.85 : 0.55), wet: 0.3 });
    const g = this.gain(0, out); this.env(g.gain, t, 0.002, 1, 0.01, big ? 0.16 : 0.08);
    this.nz('white', t, t + 0.2, this.filt('bandpass', big ? 1300 : 2100, 1.1, g));
    const s = this.gain(0, out); this.env(s.gain, t, 0.002, 0.9, 0.01, big ? 0.3 : 0.14);
    this.osc('sine', big ? 150 : 210, t, t + 0.35, s, [[big ? 0.28 : 0.12, big ? 55 : 90]]);
  }
  s_block(t, o) {
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.5, wet: 0.45 });
    for (const [f, a, d] of [[523, 0.6, 0.5], [1347, 0.35, 0.35], [2181, 0.22, 0.25], [3480, 0.12, 0.15]]) { const g = this.gain(0, out); this.env(g.gain, t, 0.002, a, 0.005, d); this.osc('sine', f, t, t + d + 0.05, g); }
    const n = this.gain(0, out); this.env(n.gain, t, 0.001, 0.6, 0.004, 0.05); this.nz('white', t, t + 0.08, this.filt('highpass', 2500, 0.7, n));
  }
  s_parry(t, o) {
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.55, wet: 0.7 });
    for (const [f, a, d] of [[1175, 0.5, 1.1], [1760, 0.35, 0.9], [2637, 0.25, 0.7], [3951, 0.12, 0.5]]) { const g = this.gain(0, out); this.env(g.gain, t, 0.002, a, 0.01, d); this.osc('sine', f, t, t + d + 0.05, g); }
    this.s_block(t, { ...o, gain: (o.gain ?? 1) * 0.6 });
  }
  s_guardBreak(t, o) {
    this.s_block(t, { ...o, gain: (o.gain ?? 1) * 0.9 });
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.6, wet: 0.35 });
    const g = this.gain(0, out); this.env(g.gain, t + 0.02, 0.005, 0.9, 0.03, 0.35);
    this.nz('white', t, t + 0.45, this.filt('bandpass', 900, 0.6, this.shaper(8, g)));
  }
  s_hurt(t, o) { this.s_thump(t, { ...o, gain: (o.gain ?? 1) * 0.8 }); }
  s_step(t, o) {
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.35, wet: 0.3 });
    const g = this.gain(0, out); this.env(g.gain, t, 0.004, 1, 0.02, 0.2);
    this.osc('sine', 80, t, t + 0.3, g, [[0.2, 38]]);
    const n = this.gain(0, out); this.env(n.gain, t, 0.003, 0.4, 0.01, 0.1); this.nz('brown', t, t + 0.15, this.filt('lowpass', 350, 0.7, n));
  }
  s_chains(t, o) {
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.45, wet: 0.6 });
    for (let i = 0; i < 9; i++) {
      const tt = t + Math.random() * 0.7, f = 900 + Math.random() * 1500, g = this.gain(0, out);
      this.env(g.gain, tt, 0.002, 0.4 + Math.random() * 0.4, 0.005, 0.25 + Math.random() * 0.3);
      const m = this.ctx.createOscillator(), mg = this.ctx.createGain(); m.frequency.value = f * 1.41; mg.gain.value = f * 0.8; m.connect(mg);
      const c = this.osc('sine', f, tt, tt + 0.7, g); mg.connect(c.frequency); m.start(tt); m.stop(tt + 0.7);
    }
    this.s_slam(t + 0.05, { ...o, gain: (o.gain ?? 1) * 0.25 });
  }
  s_seal(t, o) {
    const dur = o.dur ?? 2.6, out = this.out({ ...o, gain: (o.gain ?? 1) * 0.28, wet: 0.85 });
    const up = o.close ? -1 : 1;
    [220, 261.6, 329.6, 440, 523.3].forEach((f, i) => {
      const g = this.gain(0, out); this.env(g.gain, t + i * 0.08, 0.5, 0.5, dur * 0.4, dur * 0.6);
      const os = this.osc(i % 2 ? 'triangle' : 'sine', f * (up > 0 ? 1 : 1.0), t, t + dur + 0.2, g, [[dur, f * (up > 0 ? 1.005 : 0.75)]]);
      os.detune.value = (Math.random() - 0.5) * 12;
    });
  }
  s_stagger(t, o) {
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.6, wet: 0.5 });
    const g = this.gain(0, out); this.env(g.gain, t, 0.01, 0.7, 0.2, 0.7);
    this.osc('triangle', 660, t, t + 1, g, [[0.8, 180]]);
    this.s_thump(t + 0.25, o);
    this.s_growl(t + 0.05, { ...o, dur: 0.9, gain: (o.gain ?? 1) * 0.8 });
  }
  s_gong(t, o) {
    const out = this.out({ gain: (o.gain ?? 1) * 0.5, wet: 0.8 });
    for (const [f, a, d] of [[98, 0.8, 3.5], [196.5, 0.4, 3], [263, 0.3, 2.4], [391, 0.2, 2], [521, 0.12, 1.4]]) { const g = this.gain(0, out); this.env(g.gain, t, 0.01, a, 0.05, d); this.osc('sine', f, t, t + d + 0.1, g, [[d, f * 0.985]]); }
  }
  s_chime(t, o) {
    const out = this.out({ gain: (o.gain ?? 1) * 0.35, wet: 0.7 });
    (o.notes || [523.3, 659.3, 784, 1046.5]).forEach((f, i) => { const g = this.gain(0, out); const tt = t + i * (o.step ?? 0.14); this.env(g.gain, tt, 0.005, 0.7, 0.02, 1.2); this.osc('sine', f, tt, tt + 1.3, g); this.osc('sine', f * 2.01, tt, tt + 0.6, this.gain(0.15, g)); });
  }
  s_defeat(t, o) {
    const out = this.out({ gain: (o.gain ?? 1) * 0.4, wet: 0.8 });
    for (const f of [73.4, 77.8, 110]) { const g = this.gain(0, out); this.env(g.gain, t, 0.6, 0.5, 1.6, 1.8); this.osc('sawtooth', f, t, t + 4.2, this.filt('lowpass', 500, 0.6, g)); }
  }
  s_rise(t, o) {
    const dur = o.dur ?? 2.2, out = this.out({ ...o, gain: (o.gain ?? 1) * 0.35, wet: 0.8 });
    const g = this.gain(0, out); this.env(g.gain, t, dur * 0.5, 0.8, dur * 0.2, dur * 0.3);
    const bp = this.filt('bandpass', 400, 2, g); bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(3400, t + dur);
    this.nz('pink', t, t + dur + 0.1, bp);
  }

  // ---------- 第二十五轮：拔刀斩「终式·墨·终焉」（全部现场合成）----------
  // 墨痕破空：一口气似的毛笔扫过——粉噪声带通由低扫高再落下，带一点低频的「噗」
  s_inkWhoosh(t, o) {
    const dur = o.dur ?? 0.5, out = this.out({ ...o, gain: (o.gain ?? 1) * 0.75, wet: 0.45 });
    const g = this.gain(0, out); this.env(g.gain, t, dur * 0.3, 0.9, 0.02, dur * 0.7);
    const bp = this.filt('bandpass', 300, 1.1, g);
    bp.frequency.setValueAtTime(260, t); bp.frequency.exponentialRampToValueAtTime(1900, t + dur * 0.4); bp.frequency.exponentialRampToValueAtTime(520, t + dur);
    this.nz('pink', t, t + dur + 0.05, bp);
    const lg = this.gain(0, out); this.env(lg.gain, t + 0.02, 0.02, 0.45, 0.02, 0.22);
    this.osc('sine', 150, t, t + 0.3, lg, [[0.25, 55]]);
  }
  // 画卷纸声：铺开的那一路窸窣（细碎的高频脆响由密到疏）+ 一层抖动的纸面摩擦
  s_paper(t, o) {
    const dur = o.dur ?? 1.1, out = this.out({ ...o, gain: (o.gain ?? 1) * 0.42, wet: 0.35 });
    const bed = this.gain(0, out); this.env(bed.gain, t, 0.08, 0.5, dur * 0.55, dur * 0.4);
    const bp = this.filt('bandpass', 1500, 0.8, bed); this.nz('pink', t, t + dur + 0.05, bp, 1.3);
    const flt = this.ctx.createOscillator(), fg = this.ctx.createGain(); flt.frequency.value = 13; fg.gain.value = 0.25; flt.connect(fg); fg.connect(bed.gain); flt.start(t); flt.stop(t + dur + 0.1);
    for (let i = 0; i < 22; i++) {
      const u = Math.pow(Math.random(), 1.6), tt = t + u * dur, g = this.gain(0, out);
      this.env(g.gain, tt, 0.002, (0.45 + Math.random() * 0.5) * (1 - u * 0.6), 0.004, 0.02 + Math.random() * 0.04);
      this.nz('white', tt, tt + 0.08, this.filt('bandpass', 2400 + Math.random() * 4200, 1.4, g));
    }
  }
  // 龙凤撞入的墨溅：湿的一团（低通噪声）+ 一记闷响
  s_inkHit(t, o) {
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.55, wet: 0.45 }), p = o.pitch ?? 1;
    const g = this.gain(0, out); this.env(g.gain, t, 0.006, 0.9, 0.03, 0.42);
    const lp = this.filt('lowpass', 1200 * p, 0.7, g); lp.frequency.setValueAtTime(2200 * p, t); lp.frequency.exponentialRampToValueAtTime(380 * p, t + 0.4);
    this.nz('pink', t, t + 0.5, lp);
    const s = this.gain(0, out); this.env(s.gain, t, 0.004, 0.7, 0.02, 0.3); this.osc('sine', 110 * p, t, t + 0.4, s, [[0.3, 46 * p]]);
  }
  // 收刀清响：刀镡与鞘口合拢——一记脆的金属碰击（两下极近的「咔」）、几个不成谐的金属泛音慢慢散开、鞘口木质的一下轻叩。清楚突出，不被别的声音盖住
  s_noto(t, o) {
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.62, wet: 0.5 });
    for (const [dt, a] of [[0, 1], [0.019, 0.55]]) { const n = this.gain(0, out); this.env(n.gain, t + dt, 0.0012, a, 0.002, 0.03); this.nz('white', t + dt, t + dt + 0.06, this.filt('bandpass', 4300, 2.6, n)); }
    for (const [f, a, d] of [[2637, 0.42, 0.95], [3951, 0.3, 0.7], [5273, 0.2, 0.5], [6867, 0.12, 0.35], [1318, 0.16, 0.6]]) { const g = this.gain(0, out); this.env(g.gain, t + 0.002, 0.0015, a, 0.004, d); this.osc('sine', f, t, t + d + 0.05, g).detune.value = (Math.random() - 0.5) * 18; }
    const w = this.gain(0, out); this.env(w.gain, t + 0.004, 0.002, 0.5, 0.01, 0.07); this.osc('triangle', 430, t, t + 0.12, w, [[0.08, 250]]);
    this.nz('white', t, t + 0.06, this.filt('bandpass', 900, 1.2, this.gain(0.35, w)));
  }
  // 爆墨：深沉的一记（低频）+ 湿的墨浪（粉噪声由亮转闷）+ 细碎的飞白（高处的沙沙）；比收刀声晚一点、频段在下面，不盖住清响
  s_inkBurst(t, o) {
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.85, wet: 0.65 });
    const g = this.gain(0, out); this.env(g.gain, t, 0.012, 1, 0.08, 1.2);
    this.osc('sine', 62, t, t + 1.4, g, [[1.0, 30]]);
    const ng = this.gain(0, out); this.env(ng.gain, t, 0.03, 0.75, 0.15, 1.2);
    const lp = this.filt('lowpass', 1400, 0.6, ng); lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(220, t + 1.3);
    this.nz('pink', t, t + 1.5, lp);
    const hg = this.gain(0, out); this.env(hg.gain, t + 0.08, 0.1, 0.16, 0.3, 0.8);
    this.nz('white', t, t + 1.3, this.filt('highpass', 5200, 0.7, hg));
  }
  // 第二十八轮：龙凤撞地的墨震——一记往下沉的低闷响（不带雷的脆裂）、墨团砸地的「身子」与一声湿重的「啪」、湿重的墨浪（粉噪声由亮转闷）、
  //   碎墨落地的细碎声、低沉的余音；pitch 越高越轻（凤 1.15）。
  //   闷响不再沉到 30 Hz 以下：那一段普通音箱放不出来，又占掉总线压缩的余量、把别的声音一起压低；能听见的重量放在 80–250 Hz 的「身子」与 1 kHz 上下的「啪」。
  //   「啪」与「身子」的起音不短于总线压缩的起音（4 毫秒）：太尖的话峰值越过压缩。另有一下很短的「溅」（2.4 千赫上下），砸地有个亮的边；
  //   听感（A 计权的短时响度）上砸入那一下与第二十七轮的撞入相当、多了低频的分量，仍比收刀清响低 4 dB 以上（录像混音实测）
  s_inkSlam(t, o) {
    const p = o.pitch ?? 1, out = this.out({ ...o, gain: (o.gain ?? 1) * 0.68, wet: 0.5, ref: o.ref ?? 30 });
    const g = this.gain(0, out); this.env(g.gain, t, 0.004, 0.38, 0.07, 1.0);
    this.osc('sine', 70 * p, t, t + 1.2, g, [[0.7, 34 * p]]);
    const b = this.gain(0, out); this.env(b.gain, t, 0.004, 0.5, 0.03, 0.38);
    this.osc('sine', 130 * p, t, t + 0.55, this.filt('lowpass', 520, 0.7, this.shaper(4, b)), [[0.28, 58 * p]]);
    const c = this.gain(0, out); this.env(c.gain, t, 0.005, 1.0, 0.015, 0.18);
    this.nz('pink', t, t + 0.24, this.filt('bandpass', 950 * p, 0.8, c));
    const sp = this.gain(0, out); this.env(sp.gain, t + 0.003, 0.004, 0.45, 0.006, 0.09);
    this.nz('pink', t, t + 0.14, this.filt('bandpass', 2400 * p, 0.9, sp));
    const c2 = this.gain(0, out); this.env(c2.gain, t + 0.004, 0.005, 0.5, 0.02, 0.22);
    this.nz('pink', t, t + 0.3, this.filt('bandpass', 340 * p, 0.9, c2));
    const g2 = this.gain(0, out); this.env(g2.gain, t, 0.004, 0.26, 0.04, 0.45);
    this.osc('triangle', 44 * p, t, t + 0.6, this.filt('lowpass', 170, 0.7, this.shaper(2.5, g2)), [[0.5, 26 * p]]);
    const w = this.gain(0, out); this.env(w.gain, t + 0.01, 0.02, 0.85, 0.12, 0.9);
    const lp = this.filt('lowpass', 1300 * p, 0.6, w); lp.frequency.setValueAtTime(2000 * p, t); lp.frequency.exponentialRampToValueAtTime(240 * p, t + 1.0);
    this.nz('pink', t, t + 1.1, lp);
    for (let i = 0; i < 8; i++) {
      const tt = t + 0.12 + Math.pow(Math.random(), 1.4) * 0.7, gg = this.gain(0, out);
      this.env(gg.gain, tt, 0.003, 0.12 + Math.random() * 0.12, 0.01, 0.06 + Math.random() * 0.06);
      this.nz('pink', tt, tt + 0.14, this.filt('bandpass', (500 + Math.random() * 1400) * p, 1.1, gg));
    }
    const r = this.gain(0, out); this.env(r.gain, t + 0.05, 0.15, 0.5, 0.3, 1.5);
    this.nz('brown', t, t + 2.2, this.filt('lowpass', 200, 0.7, r), 0.8);
  }
  // 墨势成势：一声低而短的磬（不打扰）；满蓄力（有墨势）：一记清亮的吸气声 + 磬
  s_inkReady(t, o) {
    const out = this.out({ gain: (o.gain ?? 1) * 0.3, wet: 0.7 });
    for (const [f, a, d] of [[392, 0.6, 0.9], [587.3, 0.3, 0.7], [1174.7, 0.12, 0.4]]) { const g = this.gain(0, out); this.env(g.gain, t, 0.004, a, 0.02, d); this.osc('sine', f, t, t + d + 0.05, g); }
  }
  s_inkFull(t, o) {
    this.s_inkReady(t + 0.05, { gain: (o.gain ?? 1) * 1.1 });
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.35, wet: 0.4 });
    const g = this.gain(0, out); this.env(g.gain, t, 0.18, 0.8, 0.02, 0.12);
    const bp = this.filt('bandpass', 900, 1.5, g); bp.frequency.setValueAtTime(700, t); bp.frequency.exponentialRampToValueAtTime(3200, t + 0.2);
    this.nz('pink', t, t + 0.35, bp);
  }
  s_inkDraw(t, o) { this.s_inkWhoosh(t, { ...o, dur: 0.32, gain: (o.gain ?? 1) * 0.5 }); }
  // 第二十七轮：山水由玩家处铺开——一阵由近及远的风声（粉噪声经缓慢扫高的带通），底下一层很低的气声
  s_inkSwell(t, o) {
    const out = this.out({ ...o, gain: (o.gain ?? 1) * 0.55, wet: 0.6 }), dur = o.dur ?? 1.9;
    const bp = this.filt('bandpass', 300, 0.7, this.gain(1, out));
    bp.frequency.setValueAtTime(240, t); bp.frequency.exponentialRampToValueAtTime(1400, t + dur * 0.55); bp.frequency.exponentialRampToValueAtTime(700, t + dur);
    const g = this.gain(0, bp); this.env(g.gain, t, 0.5, 0.9, dur * 0.25, dur * 0.6);
    this.nz('pink', t, t + dur + 0.1, g);
    const lp = this.filt('lowpass', 140, 0.7, this.gain(1, out)), g2 = this.gain(0, lp); this.env(g2.gain, t, 0.35, 0.6, dur * 0.3, dur * 0.5);
    this.nz('brown', t, t + dur + 0.1, g2);
  }

  // ---------- 持续音（龙焰；第二十五轮：八卦阵的低频共鸣 drone）：start 返回句柄，set 调音量，stop 渐弱 ----------
  loop(id, kind, o = {}) {
    if (!this.ensure() || this.vol <= 0.001) return null;
    this.stopLoop(id, 0.05);
    const t = this.ctx.currentTime, out = this.out({ ...o, gain: (o.gain ?? 1), wet: o.wet ?? 0.4 });
    const g = this.gain(0, out); g.gain.linearRampToValueAtTime(kind === 'flame' ? 0.75 : 0.5, t + 0.15);
    const nodes = [];
    // 第十八轮：有录音的持续音（龙焰）放无缝循环的录音
    const S = this.bank?.[kind + 'Loop'];
    if (S?.bufs?.length) {
      const s = this.ctx.createBufferSource();
      s.buffer = S.bufs[0]; s.loop = true;
      const sg = this.gain((S.gain ?? 1) / 0.75, g);
      s.connect(sg); s.start(t, Math.random() * S.bufs[0].duration);
      nodes.push(s);
    } else if (kind === 'flame') {
      const bp = this.filt('bandpass', 650, 0.5, g);
      nodes.push(this.nz('pink', t, t + 60, bp));
      const lp = this.filt('lowpass', 220, 0.7, this.gain(0.8, g));
      nodes.push(this.nz('brown', t, t + 60, lp));
    } else if (kind === 'drone') {
      // 八卦阵的低频共鸣：两个低音与一个微微走调的八度（缓慢拍音），一层闷的气声，慢颤
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.55, t + 0.25);
      for (const [f, a, det] of [[55, 0.55, 0], [82.4, 0.32, 0], [110.6, 0.22, 4], [165, 0.08, -3]]) { const og = this.gain(a, g); const os = this.osc('sine', f, t, t + 60, og); os.detune.value = det; nodes.push(os); }
      nodes.push(this.nz('brown', t, t + 60, this.filt('lowpass', 180, 0.8, this.gain(0.35, g))));
      const tr = this.ctx.createOscillator(), tg = this.ctx.createGain(); tr.frequency.value = 0.7; tg.gain.value = 0.12; tr.connect(tg); tg.connect(g.gain); tr.start(t); tr.stop(t + 60); nodes.push(tr);
    }
    const h = { g, out, nodes };
    this.loops.set(id, h);
    return h;
  }
  stopLoop(id, fade = 0.3) {
    const h = this.loops.get(id);
    if (!h || !this.ctx) return;
    this.loops.delete(id);
    const t = this.ctx.currentTime;
    h.g.gain.cancelScheduledValues(t); h.g.gain.setValueAtTime(h.g.gain.value, t); h.g.gain.linearRampToValueAtTime(0, t + fade);
    for (const n of h.nodes) { try { n.stop(t + fade + 0.05); } catch (e) { /* 已停 */ } }
  }
  stopAll() { for (const id of [...this.loops.keys()]) this.stopLoop(id, 0.1); }

  // ---------- 第十八轮：背景音乐（<audio> 流式播放，不整首解码进内存）----------
  // music(name, url, { loop, gain, fade, at })：开始一首（同名已在放则只调音量）；stopMusic(name 或省略为全部, fade)；duckMusic(k) 整体压低
  music(name, url, { loop = false, gain = 1, fade = 1.5, at = 0 } = {}) {
    if (!this.ensure()) return null;
    const ctx = this.ctx, t = ctx.currentTime;
    let T = this.tracks.get(name);
    if (!T) {
      const el = new Audio(url);
      el.loop = loop; el.preload = 'auto';
      const src = ctx.createMediaElementSource(el), g = ctx.createGain();
      g.gain.value = 0; src.connect(g); g.connect(this.musicDuck);
      T = { el, src, g, url };
      this.tracks.set(name, T);
      try { if (at) el.currentTime = at; } catch (e) { /* 元数据未到时再设 */ }
      el.play().catch((e) => { if (e?.name !== 'AbortError') console.warn('背景音乐未能播放', name, e?.message || e); });      // AbortError：刚开始播就被自己停掉（切曲），不必报
    }
    clearTimeout(T.stopT); T.stopT = null;
    T.g.gain.cancelScheduledValues(t); T.g.gain.setValueAtTime(T.g.gain.value, t); T.g.gain.linearRampToValueAtTime(gain, t + Math.max(0.05, fade));
    return T;
  }
  stopMusic(name = null, fade = 1.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [k, T] of [...this.tracks]) {
      if (name && k !== name) continue;
      this.tracks.delete(k);
      T.g.gain.cancelScheduledValues(t); T.g.gain.setValueAtTime(T.g.gain.value, t); T.g.gain.linearRampToValueAtTime(0, t + Math.max(0.05, fade));
      T.stopT = setTimeout(() => { try { T.el.pause(); T.el.removeAttribute('src'); T.el.load(); T.src.disconnect(); T.g.disconnect(); } catch (e) { /* 已停 */ } }, Math.max(0.05, fade) * 1000 + 100);
    }
  }
  duckMusic(k = 1, time = 0.6) {
    if (!this.musicDuck) return;
    const t = this.ctx.currentTime, g = this.musicDuck.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(k, t + Math.max(0.05, time));
  }
  playing(name) { return this.tracks.has(name); }

  // ---------- 第二十七轮：演出音乐（cue）——「墨里终焉」的演出音乐：从原曲 at 秒处放（不变速）、淡入；暂停时停住、恢复时由同一处接着放（不补算）；
  // 走单独的一路 cueBus（接在音乐音量之后、不经 musicDuck）：场景原有的音乐照常用 duckMusic 压低，演出音乐不受影响 ----------
  // 第二十九轮：改为整首取回、解码，只留原曲 at 秒起的一段（seg 秒）来放（AudioBuffer）。
  //   原来用 <audio> 定位到 at 秒；开发服务器（serve.py，Python 自带的 http.server）不支持分段请求（Range），浏览器定位不了，
  //   实际从原曲开头放（开头约 3 秒几乎无声），听着又短又轻。录像的配音是离线按文件混的，所以录像里是对的。
  //   现在与服务器无关；起止按声音时钟，精确到采样；播放速度恒为 1
  // 预载：取回、解码（还没有声音上下文时用离线的上下文解码）；首次放时不必等
  cuePreload(name, url, at = 0, seg = 24) {
    const C = (this.cues ||= new Map());
    let Q = C.get(name);
    if (Q && (Q.url !== url || Q.at !== at)) { this.cueHalt(Q); Q = null; }
    if (!Q) {
      Q = { url, at, seg, buf: null, err: null, src: null, g: null, state: 'idle', pos: 0, t0: 0, tok: 0 };
      Q.load = fetch(url).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
        .then((ab) => decodeClip(ab))
        .then((full) => { Q.buf = sliceClip(full, at, seg); Q.full = +full.duration.toFixed(3); })
        .catch((e) => { Q.err = String(e?.message || e); console.warn('演出音乐载入失败', url, Q.err); });
      C.set(name, Q);
    }
    return Q;
  }
  cue(name, url, { at = 0, gain = 1, fadeIn = 0.2 } = {}) {
    const Q = this.cuePreload(name, url, at);
    Q.gain = gain; Q.state = 'playing'; Q.pos = 0; Q.events = (Q.events || 0) + 1;
    if (!this.ensure()) return Q;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.cueBus) { this.cueBus = ctx.createGain(); this.cueBus.connect(this.musicBus); }
    if (!Q.g) { Q.g = ctx.createGain(); Q.g.gain.value = 0; Q.g.connect(this.cueBus); }
    clearTimeout(Q.stopT);
    Q.g.gain.cancelScheduledValues(t); Q.g.gain.setValueAtTime(0, t); Q.g.gain.linearRampToValueAtTime(gain, t + Math.max(0.02, fadeIn));
    if (ctx.state === 'suspended') ctx.resume();
    this.cueStart(Q, 0);
    return Q;
  }
  // 由段内 pos 秒处放（段内 0 秒 = 原曲 at 秒处）；还没解码完：解码完时按其间走过的声音时钟补上位置
  cueStart(Q, pos) {
    this.cueHalt(Q);
    const ctx = this.ctx, tok = ++Q.tok;
    if (!ctx || Q.state !== 'playing') return;
    if (!Q.buf) {
      const t1 = ctx.currentTime;
      Q.load?.then(() => { if (Q.tok === tok && Q.state === 'playing' && Q.buf) this.cueStart(Q, pos + (this.ctx.currentTime - t1)); });
      return;
    }
    const p = Math.max(0, pos);
    if (p >= Q.buf.duration - 0.02) return;
    const s = ctx.createBufferSource(); s.buffer = Q.buf; s.connect(Q.g);
    const t = ctx.currentTime;
    s.start(t, p);
    Q.src = s; Q.t0 = t - p;
  }
  cueHalt(Q) { const s = Q?.src; if (!s) return; Q.src = null; try { s.stop(); } catch (e) { /* 已停 */ } try { s.disconnect(); } catch (e) { /* 已断 */ } }
  // 此刻在段内的秒数
  cuePos(Q) { return Q.src && this.ctx ? this.ctx.currentTime - Q.t0 : Q.pos; }
  // 暂停（菜单、失焦、后台）：停在原处；恢复：由 pos 秒（原曲的秒数）处接着放——演出时钟也停着，两边对得上
  cuePause(name) {
    const Q = this.cues?.get(name);
    if (!Q || Q.state !== 'playing') return false;
    Q.pos = this.cuePos(Q); Q.state = 'paused'; Q.tok++;
    this.cueHalt(Q);
    return true;
  }
  cueResume(name, pos = null) {
    const Q = this.cues?.get(name);
    if (!Q || Q.state !== 'paused') return false;
    Q.state = 'playing';
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    this.cueStart(Q, pos != null ? pos - Q.at : Q.pos);
    return true;
  }
  cueStop(name, fade = 0.5) {
    const Q = this.cues?.get(name);
    if (!Q || Q.state === 'idle') return false;
    const was = Q.state; Q.state = 'stopping'; Q.tok++;
    clearTimeout(Q.stopT);
    if (!this.ctx || !Q.g || was === 'paused' || !Q.src) { this.cueHalt(Q); Q.state = 'idle'; Q.pos = 0; return true; }
    const t = this.ctx.currentTime, f = Math.max(0.02, fade);
    Q.g.gain.cancelScheduledValues(t); Q.g.gain.setValueAtTime(Q.g.gain.value, t); Q.g.gain.linearRampToValueAtTime(0, t + f);
    try { Q.src.stop(t + f + 0.02); } catch (e) { /* 已停 */ }
    Q.stopT = setTimeout(() => { if (Q.state !== 'stopping') return; this.cueHalt(Q); Q.state = 'idle'; Q.pos = 0; }, f * 1000 + 60);
    return true;
  }
  // 演出音乐临时压低 / 回升（k 相对 cue 时给的音量，time 秒线性过渡）：收刀合拢前后让收刀清响清清楚楚
  cueGain(name, k = 1, time = 0.1) {
    const Q = this.cues?.get(name);
    if (!Q || Q.state !== 'playing' || !this.ctx || !Q.g) return false;
    const t = this.ctx.currentTime, g = Q.g.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime((Q.gain ?? 1) * k, t + Math.max(0.02, time));
    return true;
  }
  // pos：此刻在原曲里的秒数；rate：播放速度；loaded：解码好了没有；seg：解码留下的一段有几秒
  cueState(name) {
    const Q = this.cues?.get(name);
    return Q ? { state: Q.state, pos: +(Q.at + this.cuePos(Q)).toFixed(3), at: Q.at, ready: Q.buf ? 4 : 0, loaded: !!Q.buf, err: Q.err, full: Q.full ?? null,
      seg: Q.buf ? +Q.buf.duration.toFixed(3) : null, playing: !!Q.src, gain: Q.g ? +Q.g.gain.value.toFixed(3) : null, rate: Q.src ? Q.src.playbackRate.value : 1 } : null;
  }
}
