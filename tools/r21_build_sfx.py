# 第二十一轮：九霄凤焰与提升修为的音效——在现有音效库（assets/converted/sfx，tools/r19_build_sfx.py 生成）上追加，不改动已有的条目与文件。
# 素材：assets/boss/phoenix-bird/sound（项目作者提供，只读）：
#   386706__tommy_mooney__wings-flapping.wav —— Freesound「wings flapping.wav」，tommy_mooney，CC0
#   freesound_community-phoenixscreech1-107784.mp3 —— Pixabay「phoenixscreech1」，slugzilla（freesound_community），Pixabay 内容许可
#   Fire Magic Sound Effects by SampleKingdom (SFX)/*.wav —— itch.io「Fire Magic: Sound Effects Pack」，Sample Kingdom（付费素材，包里没有授权文件）
# 另用第十八轮收集的 JaggedStone「magic spell sfx」（OpenGameArt，CC0，assets/sfx_sources/magic）作聚气、突破的声音。
# 做法与 r19_build_sfx.py 相同：几层素材（截取、变调、增益、延时、淡入淡出）混在一起，按有效段响度归一（RMS −16 dBFS，峰值不超过 −1 dBFS），单声道 44.1 kHz Vorbis。
# 用法：blender -b --factory-startup --python tools/r21_build_sfx.py -- <phoenix-bird/sound 目录> <sfx_sources 目录> <输出目录（assets/converted/sfx）>
import sys, os, json
import numpy as np
import aud

argv = sys.argv[sys.argv.index('--') + 1:]
PH, DL, OUT = argv[0], argv[1], argv[2]
SR = 44100
_cache = {}


def load(path):
    if path not in _cache:
        s = aud.Sound(path).rechannel(1).resample(SR, True)
        a = np.asarray(s.data(), dtype=np.float32)
        _cache[path] = a[:, 0] if a.ndim == 2 else a
    return _cache[path]


def src(name):
    # p: 凤凰素材目录；k: 其中的 SampleKingdom 火系法术包；其余为 sfx_sources
    if name.startswith('p:'):
        return os.path.join(PH, name[2:])
    if name.startswith('k:'):
        return os.path.join(PH, 'Fire Magic Sound Effects by SampleKingdom (SFX)', name[2:])
    return os.path.join(DL, name)


def pitch(x, p):
    if abs(p - 1) < 1e-4:
        return x
    n = int(len(x) / p)
    return np.interp(np.arange(n) * p, np.arange(len(x)), x).astype(np.float32)


def fades(x, fi, fo):
    y = x.copy()
    a = int(fi * SR)
    if a > 1:
        y[:a] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))
    b = int(fo * SR)
    if b > 1:
        y[-b:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, b))
    return y


def layer(L):
    x = load(src(L['f']))
    a = int(L.get('s', 0) * SR)
    b = int(L['e'] * SR) if 'e' in L else len(x)
    x = fades(pitch(x[a:b], L.get('p', 1.0)), L.get('fi', 0.004), L.get('fo', 0.03))
    return np.concatenate([np.zeros(int(L.get('d', 0) * SR), np.float32), x * L.get('g', 1.0)])


def mix(layers):
    parts = [layer(L) for L in layers]
    y = np.zeros(max(len(p) for p in parts), np.float32)
    for p in parts:
        y[: len(p)] += p
    return y


def norm(y, rms_db=-16.0, peak_db=-1.0):
    env = np.abs(y)
    act = y[env > env.max() * 0.05] if env.max() > 0 else y
    rms = float(np.sqrt(np.mean(act ** 2))) if len(act) else 1e-6
    k = 10 ** (rms_db / 20) / max(rms, 1e-6)
    pk = float(np.max(np.abs(y))) * k
    lim = 10 ** (peak_db / 20)
    if pk > lim:
        k *= lim / pk
    return (y * k).astype(np.float32)


def loudest(path, win=1.6):
    # 凤鸣素材 8 秒里有几声：取最响的一声（以最响处为中心的 win 秒）
    x = load(path)
    w = int(SR * 0.05)
    m = len(x) // w
    env = np.sqrt(np.mean(x[: m * w].reshape(m, w) ** 2, axis=1))
    c = (int(np.argmax(env)) + 0.5) * 0.05
    return max(0.0, c - win * 0.45), min(len(x) / SR, c + win * 0.55)


def write(name, y):
    path = os.path.join(OUT, name + '.ogg')
    snd = aud.Sound.buffer(y.reshape(-1, 1), SR)
    snd.write(path, SR, aud.CHANNELS_MONO, aud.FORMAT_FLOAT32, aud.CONTAINER_OGG, aud.CODEC_VORBIS, 96000, 4096)
    return name + '.ogg', round(len(y) / SR, 2)


W = 'p:386706__tommy_mooney__wings-flapping.wav'
CRY = 'p:freesound_community-phoenixscreech1-107784.mp3'
cs, ce = loudest(src(CRY), 1.7)
R = {
    'phoenixCry': [[dict(f=CRY, s=cs, e=ce, p=0.92, fi=0.03, fo=0.35), dict(f=W, s=0.1, e=1.0, p=0.8, g=0.45, d=0.05)]],     # 召出：一声凤鸣 + 展翼
    'phoenixWing': [[dict(f=W, s=0.1, e=1.05, p=0.82, fo=0.12)], [dict(f=W, s=0.45, e=1.4, p=0.76, fo=0.15)]],
    'phoenixBlast': [[dict(f='k:Fire_Explosion_1.wav', e=1.7, fo=0.5), dict(f='k:Fireblast_1.wav', e=0.8, g=0.55, fo=0.2)],
                     [dict(f='k:Fire_Explosion_2.wav', e=1.5, fo=0.45), dict(f='k:Fireblast_2.wav', e=0.8, g=0.5, fo=0.2)]],
    'phoenixParry': [[dict(f='k:Fireblast_2.wav', e=0.85, p=1.12, fo=0.25), dict(f='k:Fire_Swirl_1.wav', s=0.9, e=1.6, p=1.2, g=0.4, fo=0.3)]],
    'phoenixBolt': [[dict(f='k:Fireball_1.wav', e=0.55, fo=0.12)], [dict(f='k:Fireball_2.wav', e=0.55, fo=0.12)]],
    'phoenixBoltHit': [[dict(f='k:Fireball_Hit_1.wav', e=0.6, fo=0.2)], [dict(f='k:Fireball_Hit_2.wav', e=0.6, fo=0.2)], [dict(f='k:Fireball_Hit_3.wav', e=0.6, fo=0.2)]],
    'phoenixBreath': [[dict(f='k:Fire_Cast_1.wav', e=0.6, g=0.6, fo=0.2), dict(f='k:Flames_(Loop).wav', s=1.0, e=2.5, fi=0.12, fo=0.4, d=0.1)]],
    'phoenixSwoop': [[dict(f='k:Firebolt_1.wav', s=0.1, e=0.95, fo=0.25), dict(f=W, s=0.5, e=1.2, p=0.85, g=0.6, fo=0.15)]],
    'ascendGather': [[dict(f='magic/magical_4.ogg', p=0.85, fi=0.2, fo=0.5)]],
    'ascendDone': [[dict(f='magic/magical_2.ogg', p=0.9, fo=0.4), dict(f='k:Fire_Swirl_1.wav', s=1.0, e=2.2, p=1.35, g=0.25, fo=0.5)]],
}
META = {
    'phoenixCry': dict(gain=0.8, wet=0.4, pv=0.03, ref=24), 'phoenixWing': dict(gain=0.5, wet=0.2, pv=0.06),
    'phoenixBlast': dict(gain=0.95, wet=0.4, pv=0.04, ref=24), 'phoenixParry': dict(gain=0.85, wet=0.3, pv=0.03),
    'phoenixBolt': dict(gain=0.5, wet=0.2, pv=0.06), 'phoenixBoltHit': dict(gain=0.55, wet=0.2, pv=0.06),
    'phoenixBreath': dict(gain=0.6, wet=0.3, pv=0.03), 'phoenixSwoop': dict(gain=0.55, wet=0.25, pv=0.05),
    'ascendGather': dict(gain=0.55, wet=0.45, pv=0), 'ascendDone': dict(gain=0.8, wet=0.5, pv=0),
}
NOTE = {
    W: 'tommy_mooney「wings flapping.wav」（Freesound 386706，CC0）：assets/boss/phoenix-bird/sound',
    CRY: 'slugzilla「phoenixscreech1」（Pixabay 107784，Pixabay 内容许可）：assets/boss/phoenix-bird/sound',
    'k:': 'Sample Kingdom「Fire Magic: Sound Effects Pack」（itch.io，付费素材，包里没有授权文件）：assets/boss/phoenix-bird/sound',
    'magic/': 'JaggedStone「magic spell sfx」（OpenGameArt，CC0）',
}


def note(f):
    for k, v in NOTE.items():
        if f == k or f.startswith(k):
            return v + '：' + f.split(':', 1)[-1]
    return f


mpath = os.path.join(OUT, 'sfx.json')
manifest = json.load(open(mpath, encoding='utf-8'))
for name, recipes in R.items():
    files, used = [], set()
    for i, layers in enumerate(recipes):
        y = norm(mix(layers))
        fn, dur = write(f'{name}_{i + 1}' if len(recipes) > 1 else name, y)
        files.append({'file': fn, 'dur': dur})
        for L in layers:
            used.add(note(L['f']))
    manifest[name] = {**META[name], 'files': files, 'src': sorted(used)}
    print('SFX', name, [f['file'] + f"({f['dur']}s)" for f in files])
manifest['_'] = '第十九轮 tools/r19_build_sfx.py 生成；第二十一轮 tools/r21_build_sfx.py 追加九霄凤焰与提升修为（phoenix*、ascend*）；来源见 docs/R18_REPORT.md、docs/R19_REPORT.md、docs/R21_REPORT.md'
with open(mpath, 'w', encoding='utf-8') as fh:
    json.dump(manifest, fh, ensure_ascii=False, indent=1)
print('MANIFEST', len(manifest) - 1, 'cry', round(cs, 2), round(ce, 2))
