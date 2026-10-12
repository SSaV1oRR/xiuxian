# 第二十七轮：「墨里终焉」的音效——在现有音效库（assets/converted/sfx）上追加，不改动已有的条目与文件（凤凰、雷龙原技能的音效照旧，演出用这几份独立的）。
# 素材：assets/skill/molizhongyan/sound effect（项目作者提供，只读；Pixabay 内容许可）：
#   dragon-studio-epic-dragon-roar-364481.mp3（3.45 秒，0.3–2.5 秒最响）—— 龙吟
#   freesound_community-phoenixscreech1-107784.mp3（8.3 秒，连续几声鸣叫，24 kHz）—— 凤鸣
#   kontraa-gong-cinematic-fx-178830.mp3（7.25 秒，一击长尾）—— 八卦阵的共鸣
#   unfold.mp3（10.9 秒，几次展开纸卷的声音；1.15–2.6 秒最清楚）—— 画卷展开
# 背景音乐 tunetank-china-epic-background-music-349892.mp3 不进音效库：游戏里用 <audio> 直接放原文件（从配置的 33 秒处起），见 core/audio.js 的 cue()。
# 做法与 r23_build_sfx.py 相同：截取、变调、淡入淡出，按有效段响度归一（RMS −16 dBFS，峰值不超过 −1 dBFS），单声道 44.1 kHz Vorbis。
# 用法：blender -b --factory-startup --python tools/r27_build_sfx.py -- <molizhongyan/sound effect 目录> <输出目录（assets/converted/sfx）>
import sys, os, json
import numpy as np
import aud

argv = sys.argv[sys.argv.index('--') + 1:]
LS, OUT = argv[0], argv[1]
DL = LS
SR = 44100
_cache = {}


def load(path):
    if path not in _cache:
        s = aud.Sound(path).rechannel(1).resample(SR, True)
        a = np.asarray(s.data(), dtype=np.float32)
        _cache[path] = a[:, 0] if a.ndim == 2 else a
    return _cache[path]


def src(name):
    return os.path.join(LS, name[2:] if name.startswith('l:') else name)


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


def lowpass(x, fc):
    # 一阶低通（滚雷、垫底的闷响用）
    if not fc:
        return x
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def layer(L):
    x = load(src(L['f']))
    a = int(L.get('s', 0) * SR)
    b = int(L['e'] * SR) if 'e' in L else len(x)
    x = pitch(x[a:b], L.get('p', 1.0))
    if L.get('lp'):
        x = lowpass(x, L['lp'])
    x = fades(x, L.get('fi', 0.004), L.get('fo', 0.03))
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


def write(name, y):
    path = os.path.join(OUT, name + '.ogg')
    snd = aud.Sound.buffer(y.reshape(-1, 1), SR)
    snd.write(path, SR, aud.CHANNELS_MONO, aud.FORMAT_FLOAT32, aud.CONTAINER_OGG, aud.CODEC_VORBIS, 96000, 4096)
    return name + '.ogg', round(len(y) / SR, 2)


ROAR = 'l:dragon-studio-epic-dragon-roar-364481.mp3'
CRY = 'l:freesound_community-phoenixscreech1-107784.mp3'
GONG = 'l:kontraa-gong-cinematic-fx-178830.mp3'
UNF = 'l:unfold.mp3'
R = {
    # 龙吟：整段（略压低一点音高，更沉）
    'mlRoar': [[dict(f=ROAR, s=0.0, e=3.4, p=0.96, fi=0.01, fo=0.6)]],
    # 凤鸣：前两声
    'mlCry': [[dict(f=CRY, s=0.1, e=2.35, p=1.0, fi=0.02, fo=0.45)]],
    # 八卦共鸣：锣的一击与长尾（4.6 秒）
    'mlGong': [[dict(f=GONG, s=0.0, e=4.6, p=1.0, fi=0.005, fo=1.4)]],
    # 画卷展开：两份（主要那一次、末尾一次）
    'mlUnfold': [[dict(f=UNF, s=1.15, e=2.6, p=1.0, fi=0.01, fo=0.3)], [dict(f=UNF, s=9.45, e=10.84, p=1.0, fi=0.01, fo=0.3)]],
}
META = {
    'mlRoar': dict(gain=0.82, wet=0.5, pv=0.0, ref=34), 'mlCry': dict(gain=0.78, wet=0.45, pv=0.0, ref=30),
    'mlGong': dict(gain=0.62, wet=0.55, pv=0.0, ref=40), 'mlUnfold': dict(gain=0.9, wet=0.3, pv=0.02, ref=22),
}
NOTE = {
    ROAR: 'Dragon Studio「Epic Dragon Roar」（Pixabay 364481，Pixabay 内容许可）：assets/skill/molizhongyan/sound effect',
    CRY: 'freesound_community「phoenix screech 1」（Pixabay 107784，Pixabay 内容许可）：assets/skill/molizhongyan/sound effect',
    GONG: 'kontraa「Gong Cinematic FX」（Pixabay 178830，Pixabay 内容许可）：assets/skill/molizhongyan/sound effect',
    UNF: 'unfold.mp3（项目作者提供）：assets/skill/molizhongyan/sound effect',
}

mpath = os.path.join(OUT, 'sfx.json')
manifest = json.load(open(mpath, encoding='utf-8'))
for name, recipes in R.items():
    files, used = [], set()
    for i, layers in enumerate(recipes):
        y = norm(mix(layers))
        fn, dur = write(f'{name}_{i + 1}' if len(recipes) > 1 else name, y)
        files.append({'file': fn, 'dur': dur})
        for L in layers:
            used.add(NOTE.get(L['f'], L['f']))
    manifest[name] = {**META[name], 'files': files, 'src': sorted(used)}
    print('SFX', name, [f['file'] + f"({f['dur']}s)" for f in files])
manifest['_'] = '第十九轮 tools/r19_build_sfx.py 生成；第二十一轮 tools/r21_build_sfx.py 追加九霄凤焰与提升修为（phoenix*、ascend*）；第二十三轮 tools/r23_build_sfx.py 追加雷龙破虚（riftTear、dragonRoar、thunderStrike、stormRumble、dragonDive、thunderBlast）；第二十七轮 tools/r27_build_sfx.py 追加「墨里终焉」（mlRoar、mlCry、mlGong、mlUnfold）；来源见 docs/R18_REPORT.md、docs/R19_REPORT.md、docs/R21_REPORT.md、docs/R23_REPORT.md、docs/R27_REPORT.md'
with open(mpath, 'w', encoding='utf-8') as fh:
    json.dump(manifest, fh, ensure_ascii=False, indent=1)
print('MANIFEST', len(manifest) - 1)
