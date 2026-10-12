# 第二十三轮：雷龙破虚的音效——在现有音效库（assets/converted/sfx）上追加，不改动已有的条目与文件。
# 素材：assets/boss/chinese_dragon_loong/sound（项目作者提供，只读）：
#   145729__frasbr__dragon-roar.wav —— Freesound「Dragon Roar」，frasbr，CC0（7.1 秒，0.5–2 秒最响）
#   347853__cognito-perceptu__thunder-crack.wav —— Freesound「thunder crack.wav」，cognito perceptu，CC0（19 秒：1.0–1.4 秒一声炸雷，之后 2–10 秒滚雷）
#   634365__eminyildirim__magic-whoosh-air-fire-earth.wav —— Freesound「Magic Whoosh ( Air, Fire, Earth )」，EminYILDIRIM，CC BY 4.0（19 秒里五段呼啸：约 0.5、4.5、8.6、12.5、16.2 秒）
# 另用第十八轮收集的 rubberduck「100 CC0 SFX」的 explosion（OpenGameArt，CC0，assets/sfx_sources/rd_100a）垫在俯冲爆雷的低频。
# 做法与 r21_build_sfx.py 相同：几层素材（截取、变调、增益、延时、淡入淡出）混在一起，按有效段响度归一（RMS −16 dBFS，峰值不超过 −1 dBFS），单声道 44.1 kHz Vorbis。
# 用法：blender -b --factory-startup --python tools/r23_build_sfx.py -- <chinese_dragon_loong/sound 目录> <sfx_sources 目录> <输出目录（assets/converted/sfx）>
import sys, os, json
import numpy as np
import aud

argv = sys.argv[sys.argv.index('--') + 1:]
LS, DL, OUT = argv[0], argv[1], argv[2]
SR = 44100
_cache = {}


def load(path):
    if path not in _cache:
        s = aud.Sound(path).rechannel(1).resample(SR, True)
        a = np.asarray(s.data(), dtype=np.float32)
        _cache[path] = a[:, 0] if a.ndim == 2 else a
    return _cache[path]


def src(name):
    if name.startswith('l:'):
        return os.path.join(LS, name[2:])
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


ROAR = 'l:145729__frasbr__dragon-roar.wav'
THU = 'l:347853__cognito-perceptu__thunder-crack.wav'
WH = 'l:634365__eminyildirim__magic-whoosh-air-fire-earth.wav'
BOOM = 'rd_100a/explosion.ogg'
R = {
    # 空间撕裂：一段低沉的呼啸（变调到 0.72）叠一点闷雷——裂隙由细缝撑开
    'riftTear': [[dict(f=WH, s=0.35, e=1.75, p=0.72, fo=0.4), dict(f=THU, s=2.0, e=3.6, p=0.75, g=0.35, lp=900, fi=0.25, fo=0.5, d=0.15)]],
    # 龙鸣：龙从裂隙探出时一声长吟
    'dragonRoar': [[dict(f=ROAR, s=0.38, e=3.1, p=0.94, fi=0.02, fo=0.6)]],
    # 落雷：炸雷的头 1.1 秒（三种音高）
    'thunderStrike': [[dict(f=THU, s=0.92, e=2.05, p=1.0, fo=0.35)], [dict(f=THU, s=0.92, e=2.0, p=1.14, fo=0.35)], [dict(f=THU, s=0.95, e=2.1, p=0.9, fo=0.35)]],
    # 雷云里的滚雷（攻击窗口里每隔几秒一段，不连续铺满）
    'stormRumble': [[dict(f=THU, s=2.2, e=5.6, p=0.8, lp=700, fi=0.3, fo=0.9)], [dict(f=THU, s=5.6, e=9.0, p=0.85, lp=700, fi=0.3, fo=0.9)]],
    # 俯冲的风声
    'dragonDive': [[dict(f=WH, s=8.35, e=9.7, p=0.82, fo=0.3), dict(f=WH, s=4.3, e=5.2, p=0.65, g=0.5, fo=0.25, d=0.2)]],
    # 撞击爆雷：炸雷 + 低频爆响
    'thunderBlast': [[dict(f=THU, s=0.9, e=3.6, p=0.86, fo=0.8), dict(f=BOOM, e=1.6, p=0.8, g=0.7, lp=1200, fo=0.5)]],
}
META = {
    'riftTear': dict(gain=0.8, wet=0.5, pv=0.02, ref=30), 'dragonRoar': dict(gain=0.85, wet=0.5, pv=0.02, ref=34),
    'thunderStrike': dict(gain=0.62, wet=0.45, pv=0.05, ref=30), 'stormRumble': dict(gain=0.42, wet=0.6, pv=0.04, ref=40),
    'dragonDive': dict(gain=0.7, wet=0.35, pv=0.02, ref=30), 'thunderBlast': dict(gain=1.0, wet=0.5, pv=0.02, ref=34),
}
NOTE = {
    ROAR: 'frasbr「Dragon Roar」（Freesound 145729，CC0）：assets/boss/chinese_dragon_loong/sound',
    THU: 'cognito perceptu「thunder crack.wav」（Freesound 347853，CC0）：assets/boss/chinese_dragon_loong/sound',
    WH: 'EminYILDIRIM「Magic Whoosh ( Air, Fire, Earth )」（Freesound 634365，CC BY 4.0）：assets/boss/chinese_dragon_loong/sound',
    BOOM: 'rubberduck「100 CC0 SFX」（OpenGameArt，CC0）：rd_100a/explosion.ogg',
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
manifest['_'] = '第十九轮 tools/r19_build_sfx.py 生成；第二十一轮 tools/r21_build_sfx.py 追加九霄凤焰与提升修为（phoenix*、ascend*）；第二十三轮 tools/r23_build_sfx.py 追加雷龙破虚（riftTear、dragonRoar、thunderStrike、stormRumble、dragonDive、thunderBlast）；来源见 docs/R18_REPORT.md、docs/R19_REPORT.md、docs/R21_REPORT.md、docs/R23_REPORT.md'
with open(mpath, 'w', encoding='utf-8') as fh:
    json.dump(manifest, fh, ensure_ascii=False, indent=1)
print('MANIFEST', len(manifest) - 1)
