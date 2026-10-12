# （已由 tools/r19_build_sfx.py 取代：第十九轮换了几样音效，整套音效库改由它生成；本文件留作第十八轮的记录）
# 第十八轮：把收集来的音效素材剪成游戏用的音效（Blender 后台运行，用它自带的 FFmpeg 解码 / 编码；处理用 numpy）
# 用法：blender -b --factory-startup --python tools/r18_build_sfx.py -- <下载素材目录> <用户素材目录> <输出目录>
#   下载素材目录：OpenGameArt / Kenney 的 CC0 包解压后的目录（见 docs/R18_REPORT.md 的来源表，原包不入库）
#   用户素材目录：assets/sound effect（项目自带，只读）
#   输出：<输出目录>/*.ogg（单声道 44.1 kHz Vorbis）与 sfx.json（每个音效的文件、基准音量、混响、音高随机、来源）
# 每个音效是一张「配方」：几层素材（文件、截取的起止秒、变调、增益、延时、淡入淡出）混在一起，
# 再按有效段的响度归一（RMS −16 dBFS，峰值不超过 −1 dBFS）；循环音（龙焰）首尾交叉淡化成无缝循环。
import sys, os, json
import numpy as np
import aud

argv = sys.argv[sys.argv.index('--') + 1:]
DL, USER, OUT = argv[0], argv[1], argv[2]
os.makedirs(OUT, exist_ok=True)
SR = 44100
_cache = {}


def load(path):
    if path not in _cache:
        s = aud.Sound(path).rechannel(1).resample(SR, True)
        a = np.asarray(s.data(), dtype=np.float32)
        _cache[path] = a[:, 0] if a.ndim == 2 else a
    return _cache[path]


def src(name):
    # 'u:' 开头为用户素材（assets/sound effect），其余为下载素材
    return os.path.join(USER, name[2:]) if name.startswith('u:') else os.path.join(DL, name)


def pitch(x, p):
    if abs(p - 1) < 1e-4:
        return x
    n = int(len(x) / p)
    t = np.arange(n) * p
    return np.interp(t, np.arange(len(x)), x).astype(np.float32)


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
    x = x[a:b]
    x = pitch(x, L.get('p', 1.0))
    x = fades(x, L.get('fi', 0.004), L.get('fo', 0.03))
    return np.concatenate([np.zeros(int(L.get('d', 0) * SR), np.float32), x * L.get('g', 1.0)])


def mix(layers):
    parts = [layer(L) for L in layers]
    n = max(len(p) for p in parts)
    y = np.zeros(n, np.float32)
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


def loopify(y, xf):
    # 无缝循环：末尾 xf 秒与开头交叉淡化，输出长度 len - xf
    n = int(xf * SR)
    head, body, tail = y[:n], y[n:-n] if n else y, y[-n:]
    w = np.linspace(0, 1, n, dtype=np.float32)
    seam = tail * (1 - w) + head * w
    return np.concatenate([body, seam]).astype(np.float32)


def segments(path, thr_db=-28, min_len=0.35):
    x = load(path)
    w = int(SR * 0.02)
    m = len(x) // w
    env = 20 * np.log10(np.sqrt(np.mean(x[: m * w].reshape(m, w) ** 2, axis=1)) + 1e-9)
    on = env > thr_db
    segs, i = [], 0
    while i < m:
        if on[i]:
            j = i
            while j < m and on[j]:
                j += 1
            if (j - i) * 0.02 >= min_len:
                segs.append((i * 0.02, j * 0.02, float(env[i:j].max())))
            i = j
        else:
            i += 1
    return segs


def write(name, y):
    path = os.path.join(OUT, name + '.ogg')
    snd = aud.Sound.buffer(y.reshape(-1, 1), SR)
    snd.write(path, SR, aud.CHANNELS_MONO, aud.FORMAT_FLOAT32, aud.CONTAINER_OGG, aud.CODEC_VORBIS, 96000, 4096)
    return name + '.ogg', round(len(y) / SR, 2)


# ---------------------------------------------------------------------------------------------
# 配方。f 文件（u: 为用户素材）、s / e 截取的起止秒、p 变调（<1 更低更慢）、g 增益、d 延时、fi / fo 淡入淡出
# ---------------------------------------------------------------------------------------------
UR = 'u:boss/audiopapkin-monster-roar-ps-o13-311139.mp3'
UF = 'u:dragon/dragon-studio-dragon-breathing-fire-364475.mp3'
UC = 'u:sword/dragon-studio-sword-clashhit-393837.mp3'
US = 'u:sword/dragon-studio-sword-slice-393847.mp3'
SN = 'snarls/monster-snarl-attack.ogg'
KI = 'kn_impact/Audio/'
R = {
    # —— 龙君的声音 ——
    'roar': [[dict(f=UR, s=0.0, e=3.3, p=0.92, fi=0.02, fo=0.9)], [dict(f=UR, s=4.4, e=7.6, p=0.88, fi=0.05, fo=0.9)]],
    'growl': [[dict(f='rd_creature1/monster_04.ogg', p=0.8, fo=0.15)], [dict(f='rd_creature1/monster_07.ogg', p=0.75, fo=0.15)],
              [dict(f='rd_rpg/creature_roar_02.ogg', p=0.7, fo=0.2)], [dict(f='rd_creature2/grunt_07.ogg', p=0.78, fo=0.12)]],
    'claw': [[dict(f='rd_100b/sfx100v2_air_03.ogg', p=0.6, fo=0.08), dict(f='rd_rpg/blade_01.ogg', p=0.55, g=0.35, d=0.03)],
             [dict(f='rd_100b/sfx100v2_air_02.ogg', s=0.0, e=0.45, p=0.62, fo=0.12), dict(f='rd_rpg/blade_03.ogg', p=0.55, g=0.3, d=0.05)]],
    'whoosh': [[dict(f='rd_100b/sfx100v2_air_02.ogg', s=0.0, e=0.85, p=0.58, fi=0.03, fo=0.25)]],
    'step': [[dict(f='rd_creature2/stomp_01.ogg', p=0.85), dict(f=KI + 'impactSoft_heavy_002.ogg', p=0.9, g=0.6)],
             [dict(f='rd_creature2/stomp_01.ogg', p=0.78), dict(f=KI + 'impactSoft_heavy_004.ogg', p=0.85, g=0.6)]],
    'thump': [[dict(f=KI + 'impactSoft_heavy_000.ogg', p=0.8), dict(f=KI + 'impactPunch_heavy_000.ogg', p=0.7, g=0.5)]],
    'slam': [[dict(f=KI + 'impactSoft_heavy_003.ogg', p=0.7), dict(f=KI + 'impactMining_000.ogg', p=0.75, g=0.8),
              dict(f='rd_break/bfh1_rock_falling_03.ogg', p=0.9, g=0.5, d=0.03), dict(f='rd_break/bfh1_rock_breaking_01.ogg', p=0.9, g=0.35, d=0.05)],
             [dict(f=KI + 'impactSoft_heavy_001.ogg', p=0.68), dict(f=KI + 'impactMining_002.ogg', p=0.72, g=0.8),
              dict(f='rd_break/bfh1_rock_falling_09.ogg', p=0.85, g=0.5, d=0.04), dict(f='rd_100a/slam_03.ogg', p=0.7, g=0.4, d=0.01)]],
    'boom': [[dict(f=KI + 'impactSoft_heavy_001.ogg', p=0.6), dict(f='rd_100a/explosion.ogg', p=0.7, g=0.8),
              dict(f='rd_100b/sfx100v2_thunder_01.ogg', s=1.3, e=3.6, p=0.9, g=0.6, fi=0.05, fo=0.8, d=0.02)]],
    'thunder': [[dict(f='rd_100b/sfx100v2_thunder_01.ogg', s=0.75, e=5.0, fi=0.01, fo=0.8)],
                [dict(f='rd_100b/sfx100v2_thunder_01.ogg', s=0.75, e=5.0, p=0.85, fi=0.01, fo=0.8)]],
    'charge': [[dict(f='magic/magical_4.ogg', p=0.8, fi=0.2, fo=0.3)]],
    'flameBurst': [[dict(f=UF, s=0.30, e=1.75, fi=0.01, fo=0.6)]],
    'orb': [[dict(f='rd_rpg/spell_01.ogg', p=0.75), dict(f='rd_100b/sfx100v2_air_03.ogg', p=1.0, g=0.4)]],
    'pop': [[dict(f='rd_100a/explosion.ogg', p=1.15, g=0.8, fo=0.15), dict(f='rd_rpg/spell_02.ogg', p=0.9, g=0.5)]],
    'stagger': [[dict(f='rd_rpg/creature_roar_03.ogg', p=0.7, fo=0.25), dict(f=KI + 'impactSoft_heavy_001.ogg', p=0.8, g=0.7, d=0.2)]],
    'defeat': [[dict(f=UR, s=9.0, e=15.6, p=0.85, fi=0.1, fo=2.4), dict(f=KI + 'impactSoft_heavy_003.ogg', p=0.65, g=0.8, d=4.2)]],
    'chains': [[dict(f='rd_rpg/chain_01.ogg', p=0.85)], [dict(f='rd_rpg/chain_02.ogg', p=0.85)], [dict(f='rd_rpg/chain_03.ogg', p=0.85)]],
    'gong': [[dict(f='rd_100a/gong_02.ogg', p=0.7, fo=0.3)]],
    'seal': [[dict(f='magic/magical_2.ogg', p=0.8, fi=0.05, fo=0.4), dict(f='rd_100a/gong_02.ogg', p=0.6, g=0.4)]],
    'wing': [[dict(f='vj_dragonflap.wav', fo=0.4)], [dict(f='ad_wings/wings_flap_large.ogg', s=0.0, e=0.75, p=0.8, fo=0.2)]],
    'snarl': 'SNARL',
    # —— 剑（项目自带的两段 + 冲击层）——
    'hit': [[dict(f=US, s=0.03, e=0.62, fo=0.12), dict(f=KI + 'impactPunch_heavy_002.ogg', p=1.2, g=0.5)],
            [dict(f=US, s=0.03, e=0.62, p=1.08, fo=0.12), dict(f=KI + 'impactPunch_heavy_004.ogg', p=1.15, g=0.5)]],
    'hitHeavy': [[dict(f=US, s=0.03, e=0.7, p=0.85, fo=0.15), dict(f=KI + 'impactPunch_heavy_000.ogg', p=0.9, g=0.8), dict(f=KI + 'impactSoft_heavy_002.ogg', g=0.4)]],
    'parry': [[dict(f=UC, s=0.02, e=1.1, fo=0.3)]],
    'block': [[dict(f=UC, s=0.02, e=0.62, p=0.82, fo=0.25)]],
    'guardBreak': [[dict(f=UC, s=0.02, e=0.9, p=0.7, fo=0.3), dict(f=KI + 'impactMetal_heavy_000.ogg', p=0.8, g=0.7), dict(f=KI + 'impactPlate_heavy_000.ogg', g=0.5, d=0.02)]],
    'swing': [[dict(f='rd_rpg/blade_01.ogg', fo=0.06)], [dict(f='rd_rpg/blade_02.ogg', fo=0.06)], [dict(f='rd_rpg/blade_03.ogg', fo=0.06)]],
}
# 运行时的基准音量、混响送量、音高随机（±）、距离衰减参照（米）、循环
META = {
    'roar': dict(gain=0.8, wet=0.55, pv=0.03, ref=30), 'growl': dict(gain=0.75, wet=0.45, pv=0.05, ref=22), 'claw': dict(gain=0.75, wet=0.25, pv=0.06),
    'whoosh': dict(gain=0.7, wet=0.3, pv=0.06), 'step': dict(gain=0.45, wet=0.3, pv=0.07, ref=16), 'thump': dict(gain=0.75, wet=0.35, pv=0.05),
    'slam': dict(gain=1.0, wet=0.55, pv=0.05, ref=24), 'boom': dict(gain=0.95, wet=0.65, pv=0.03, ref=30), 'thunder': dict(gain=1.0, wet=0.7, pv=0.04, ref=40),
    'charge': dict(gain=0.6, wet=0.5, pv=0.02), 'flameBurst': dict(gain=0.85, wet=0.45, pv=0.05), 'orb': dict(gain=0.6, wet=0.45, pv=0.06),
    'pop': dict(gain=0.6, wet=0.4, pv=0.08), 'stagger': dict(gain=0.85, wet=0.5, pv=0.03), 'defeat': dict(gain=0.9, wet=0.7, pv=0, ref=40),
    'chains': dict(gain=0.6, wet=0.55, pv=0.05), 'gong': dict(gain=0.75, wet=0.8, pv=0.01), 'seal': dict(gain=0.6, wet=0.8, pv=0.02),
    'wing': dict(gain=0.7, wet=0.35, pv=0.05), 'snarl': dict(gain=0.7, wet=0.35, pv=0.05, ref=22),
    'hit': dict(gain=0.6, wet=0.3, pv=0.06), 'hitHeavy': dict(gain=0.8, wet=0.35, pv=0.04), 'parry': dict(gain=0.75, wet=0.6, pv=0.03),
    'block': dict(gain=0.55, wet=0.45, pv=0.05), 'guardBreak': dict(gain=0.8, wet=0.4, pv=0.02), 'swing': dict(gain=0.4, wet=0.2, pv=0.06),
    'flameLoop': dict(gain=0.6, wet=0.4, pv=0, loop=True),
}
SRC_NOTE = {
    'u:': '项目自带（assets/sound effect，Pixabay）', 'rd_': 'rubberduck（OpenGameArt，CC0）', 'kn_': 'Kenney（CC0）', 'snarls/': 'Darsycho「monster snarls」（OpenGameArt，CC0）',
    'magic/': 'JaggedStone「magic spell sfx」（OpenGameArt，CC0）', 'vj_': 'VishwaJai「Dragon Flap」（OpenGameArt，CC0）', 'ad_': 'AntumDeluge「Large Wings Flap」（OpenGameArt，CC0）',
}


def note_of(f):
    for k, v in SRC_NOTE.items():
        if f.startswith(k):
            return v
    return '?'


manifest = {'_': '第十八轮 tools/r18_build_sfx.py 生成；来源见 docs/R18_REPORT.md'}
for name, recipes in R.items():
    if recipes == 'SNARL':
        segs = sorted(segments(src(SN)), key=lambda s: -s[2])[:4]
        recipes = [[dict(f=SN, s=max(0, a - 0.03), e=b + 0.05, p=0.72, fo=0.12)] for a, b, _ in sorted(segs)]
    files, used = [], set()
    for i, layers in enumerate(recipes):
        y = norm(mix(layers))
        fn, dur = write(f'{name}_{i + 1}' if len(recipes) > 1 else name, y)
        files.append({'file': fn, 'dur': dur})
        for L in layers:
            used.add(note_of(L['f']) + '：' + L['f'].replace('u:', ''))
    manifest[name] = {**META.get(name, {}), 'files': files, 'src': sorted(used)}
    print('SFX', name, [f['file'] + f"({f['dur']}s)" for f in files])

# 龙焰的持续音：用户素材 1.6–4.8 秒的平稳段，首尾 0.45 秒交叉淡化成无缝循环
y = load(src(UF))[int(1.6 * SR): int(4.8 * SR)]
y = norm(loopify(y, 0.45))
fn, dur = write('flameLoop', y)
manifest['flameLoop'] = {**META['flameLoop'], 'files': [{'file': fn, 'dur': dur}], 'src': [note_of(UF) + '：' + UF[2:]]}
print('SFX flameLoop', fn, dur)

with open(os.path.join(OUT, 'sfx.json'), 'w', encoding='utf-8') as fh:
    json.dump(manifest, fh, ensure_ascii=False, indent=1)
print('MANIFEST', len(manifest) - 1)
