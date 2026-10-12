# 第十九轮：给录像配音——按录像时记下的音效（tools/r19_iai.js 的 recStart：时刻、名字、挑中的那一份、从录音第几秒放起、实际音高、音量、声像、混响、
# 半途停下的时刻），用游戏同一个音效库（assets/converted/sfx）离线混成一条立体声 WAV，再由 tools/r16_encode.py 合进 MP4。
# 混法照 src/core/audio.js：每个音效 → 音量（已含距离衰减）→ 立体声声像（StereoPanner 的等功率）→ 干声；另按 wet 送进混响
# （与游戏同样生成的 2.6 秒衰减噪声冲激响应，按 WebAudio ConvolverNode 的规则归一，混响总线 0.32）→ 总音量 0.7 → 压限（-14 dB、4:1、软拐点 10 dB）。
# 合成音（没有录音的，如闪身、受击）不在音效库里，配音里没有它们；脚本会列出来。
# 用法：blender -b --factory-startup --python tools/r19_mix_audio.py -- <events.json> <音效库目录> <输出.wav> [时长秒] [stem=合成音轨.wav]
# 第二十五轮：stem= 是在页面里用游戏同一段合成代码离线渲染的合成音（tools/r25_film.js synthStem：干声 + 同一条混响，未经总音量与压限），
# 在总音量、压限之前并进来——录像里就有了音效库之外的声音（终式的墨声、纸声、收刀清响、爆墨、八卦低鸣……）
# 第二十七轮：录像记录里的 music（演出音乐与场景音乐的起止、暂停、压低）按游戏的音乐总线并进来（musicVol= 音乐音量，默认 0.6）
import sys, os, json
import numpy as np
import aud

argv = sys.argv[sys.argv.index('--') + 1:]
opt = dict(a.split('=', 1) for a in argv if '=' in a)
argv = [a for a in argv if '=' not in a]
EV, BANK, OUT = argv[0], argv[1], argv[2]
SR = 44100
rec = json.load(open(EV, encoding='utf-8'))
man = json.load(open(os.path.join(BANK, 'sfx.json'), encoding='utf-8'))
secs = float(argv[3]) if len(argv) > 3 else rec['secs'] + 2.5
N = int(secs * SR)
dry = np.zeros((2, N), np.float32)
send = np.zeros(N, np.float32)
_cache = {}


def load(f):
    if f not in _cache:
        s = aud.Sound(os.path.join(BANK, f)).rechannel(1).resample(SR, True)
        a = np.asarray(s.data(), dtype=np.float32)
        _cache[f] = a[:, 0] if a.ndim == 2 else a
    return _cache[f]


missing = {}
for e in rec['events']:
    S = man.get(e['name'])
    if e.get('synth') or not S:
        missing[e['name']] = missing.get(e['name'], 0) + 1
        continue
    files = S['files']
    x = load(files[min(e.get('v', 0), len(files) - 1)]['file'])
    # 从录音第几秒放起；变调（播放速率）
    x = x[int(e.get('offset', 0) * SR):]
    rate = e.get('rate', 1) or 1
    if abs(rate - 1) > 1e-4:
        n = int(len(x) / rate)
        x = np.interp(np.arange(n) * rate, np.arange(len(x)), x).astype(np.float32)
    else:
        x = x.copy()
    # dur：末尾 0.25 秒淡出；半途停下：从停下的时刻淡出
    end = None
    if e.get('dur'):
        end = int(e['dur'] * SR); fo = int(0.25 * SR)
        x = x[:end]
        if len(x) > 0:
            k = np.ones(len(x), np.float32); a = max(0, len(x) - fo); k[a:] = np.linspace(1, 0, len(x) - a); x *= k
    if e.get('stopT') is not None:
        a = int(max(0, e['stopT'] - e['t']) * SR); b = a + int(max(0.005, e.get('fade', 0.12)) * SR)
        x = x[:b]
        if len(x) > a:
            x[a:] *= np.linspace(1, 0, len(x) - a).astype(np.float32)
    t0 = int(e['t'] * SR)
    if t0 >= N or len(x) == 0:
        continue
    x = x[:N - t0] * e.get('gain', 1)
    p = (e.get('pan', 0) + 1) / 2
    dry[0, t0:t0 + len(x)] += x * np.cos(p * np.pi / 2)
    dry[1, t0:t0 + len(x)] += x * np.sin(p * np.pi / 2)
    send[t0:t0 + len(x)] += x * e.get('wet', 0.4)

# 混响：与游戏同样生成的冲激响应（2.6 秒、衰减指数 2.2、开头 400 个采样淡入），按 ConvolverNode 的规则归一
rng = np.random.default_rng(19)
n = int(SR * 2.6)
env = np.power(1 - np.arange(n) / n, 2.2) * np.minimum(1, np.arange(n) / 400)
ir = (rng.random((2, n)) * 2 - 1) * env
power = np.sqrt(np.sum(ir ** 2) / (2 * n))
ir *= (1 / power) * 10 ** (-58 / 20) * (44100 / SR)
L = N + n
F = 1 << int(np.ceil(np.log2(L)))
S_ = np.fft.rfft(send, F)
wet = np.stack([np.fft.irfft(S_ * np.fft.rfft(ir[c], F), F)[:N] for c in range(2)]).astype(np.float32)
mix = dry + wet * 0.32
stemInfo = None
if opt.get('stem'):
    st = aud.Sound(opt['stem']).resample(SR, True)
    a = np.asarray(st.data(), dtype=np.float32)
    a = a if a.ndim == 2 else a[:, None]
    if a.shape[1] == 1:
        a = np.repeat(a, 2, axis=1)
    m = min(N, a.shape[0])
    mix[:, :m] += a[:m, :2].T
    stemInfo = (round(a.shape[0] / SR, 2), round(float(np.max(np.abs(a))), 3))
    # 合成音已由 stem 补上：不再列为「缺」
    missing = {k: v for k, v in missing.items() if k not in set(rec.get('stemNames', []))}
# 第二十七轮：音乐（rec['music']，老录像没有这一项）——按 src/core/audio.js：场景音乐（<audio>）→ 压低（duckMusic）→ 音乐音量 → 总音量；
# 演出音乐（cue）→ cueBus → 音乐音量 → 总音量（不经压低）。每段：从文件第 at 秒放起（不变速），记下的起止、淡入淡出、暂停（停在原处、恢复后接着放，不补算）、循环
musicInfo = []
if rec.get('music'):
    ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(BANK))))
    MV = float(opt.get('musicVol', rec.get('musicVol', 0.6)))
    _mc = {}

    def mload(url):
        if url not in _mc:
            s_ = aud.Sound(os.path.join(ROOT, url)).rechannel(2).resample(SR, True)
            a_ = np.asarray(s_.data(), dtype=np.float32)
            _mc[url] = a_ if a_.ndim == 2 else np.repeat(a_[:, None], 2, axis=1)
        return _mc[url]

    # 场景音乐的压低：分段线性（起点值 1）
    duck = np.ones(N, np.float32)
    dv, dt0 = 1.0, 0
    for (tt, k, tm) in sorted(rec.get('duck', []), key=lambda d: d[0]):
        i0 = min(N, int(tt * SR)); i1 = min(N, int((tt + max(0.05, tm)) * SR))
        duck[dt0:i0] = dv
        if i1 > i0:
            duck[i0:i1] = np.linspace(dv, k, i1 - i0)
        dv, dt0 = k, i1
    duck[dt0:] = dv
    for tr in rec['music']:
        x = mload(tr['url'])
        t0 = int(tr['t'] * SR)
        if t0 >= N:
            continue
        end = N if tr.get('stopT') is None else min(N, int((tr['stopT'] + max(0.02, tr.get('stopFade', 0.5))) * SR))
        n = end - t0
        if n <= 0:
            continue
        # 源文件里的位置：按经过的时间（扣掉暂停）
        tau = np.arange(n, dtype=np.float64) / SR
        paused = np.zeros(n, bool); shift = np.zeros(n)
        for (p0, p1) in tr.get('pauses', []):
            a0, a1 = int((p0 - tr['t']) * SR), int((p1 - tr['t']) * SR) if p1 is not None else n
            a0, a1 = max(0, a0), min(n, a1)
            if a1 > a0:
                paused[a0:a1] = True
                shift[a1:] += (a1 - a0) / SR
        pos = (tr.get('at', 0) + tau - shift) * SR
        L = len(x)
        if tr.get('loop'):
            pos = np.mod(pos, L - 1)
        ok = (pos < L - 1) & ~paused
        pi = np.clip(pos.astype(np.int64), 0, L - 2); fr = (pos - pi)[:, None]
        y = (x[pi] * (1 - fr) + x[pi + 1] * fr) * ok[:, None]
        g = np.full(n, tr.get('gain', 1.0), np.float32)
        fi = int(max(0.02, tr.get('fadeIn', 0.2)) * SR)
        g[:fi] *= np.linspace(0, 1, min(fi, n))[:min(fi, n)] if fi else 1
        if tr.get('stopT') is not None:
            s0 = int((tr['stopT'] - tr['t']) * SR)
            if s0 < n:
                g[s0:] *= np.linspace(1, 0, n - s0)
        # 演出音乐的临时压低 / 回升（cueGain：记下的 [时刻, 相对音量, 过渡秒]，分段线性，起点值 1）
        if tr.get('gains'):
            env = np.ones(n, np.float32); gv, j0 = 1.0, 0
            for (tt, k, tm) in sorted(tr['gains'], key=lambda d: d[0]):
                i0 = max(0, min(n, int((tt - tr['t']) * SR))); i1 = max(0, min(n, int((tt - tr['t'] + max(0.02, tm)) * SR)))
                env[j0:i0] = gv
                if i1 > i0:
                    env[i0:i1] = np.linspace(gv, k, i1 - i0)
                gv, j0 = k, i1
            env[j0:] = gv
            g *= env
        if tr.get('kind') != 'cue':
            g *= duck[t0:end]
        mix[:, t0:end] += (y * (g * MV)[:, None]).T
        musicInfo.append((tr.get('name'), round(tr['t'], 2), tr.get('at', 0), round(n / SR, 2), len(tr.get('pauses', []))))
mix = mix * 0.7

# 压限：阈值 -14 dB、4:1、软拐点 10 dB、起 4 毫秒、放 250 毫秒（按两声道的峰值包络）
thr, ratio, knee = -14.0, 4.0, 10.0
lvl = np.max(np.abs(mix), axis=0)
aA, aR = np.exp(-1 / (0.004 * SR)), np.exp(-1 / (0.25 * SR))
envl = np.empty(N, np.float32)
e_ = 0.0
for i in range(N):
    v = lvl[i]
    e_ = aA * e_ + (1 - aA) * v if v > e_ else aR * e_ + (1 - aR) * v
    envl[i] = e_
db = 20 * np.log10(np.maximum(envl, 1e-6))
over = db - thr
gr = np.where(over <= -knee / 2, 0.0, np.where(over >= knee / 2, over * (1 - 1 / ratio), (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee)))
mix *= 10 ** (-gr / 20)
mix = np.clip(mix, -1, 1)
peak = float(np.max(np.abs(mix)))

snd = aud.Sound.buffer(mix.T.copy(), SR)
snd.write(OUT, SR, aud.CHANNELS_STEREO, aud.FORMAT_S16, aud.CONTAINER_WAV, aud.CODEC_PCM)
print('MIXED', OUT, f'{secs:.2f}s', 'events', len(rec['events']), 'peak', round(peak, 3), 'stem (secs, peak):', stemInfo, 'music (name, t, at, secs, pauses):', musicInfo, 'not in bank or stem:', missing)
