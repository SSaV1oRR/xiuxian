# 第二十四轮：烬狱剑尊的火焰特效贴图（素材：assets/special effects/fire 的两个 unitypackage，先用 r20_unpack_unitypackage.py 解包到项目外的目录）。
# 原包里的贴图多是带色的火焰序列帧、光晕、火花、地面焦痕与法阵；网页里统一按第二十四轮的火焰配色在着色器里上色
# （核心 #FFF1C1、金橙 #FFB247、主火 #F05A28、深红 #8D241D、炭黑 #171416），所以这里一律转成单通道的「强度」（亮度与透明度合成），
# 按用途拼成两张贴图集，另出几张单独用的大图：
#   fire_flip.png   2048×2048，128 像素一格（16×16）：火焰与爆炸、浓烟的序列帧（各段的起始格、帧数、行列见 fire.json 的 flip）
#   fire_tiles.png  2048×2048，256 像素一格（8×8）：光晕、火花、火线、光环、冲击波、地面焦痕、烟团、噪声……（fire.json 的 tiles）
#   fire_circle1.png / fire_circle3.png（1024）：火焰法阵（焚天断界的地纹、焚环裂地的环纹）
#   lava.png（512，可平铺）：熔岩裂纹（残留的地火、二阶段地面的裂缝）
# Pillow 打不开 LargeFlame02.tif、MediumFlame03.tif（会原生崩溃），这两张不用。
# 用法：python -I tools/r24_build_fire.py <解包目录（含 elemental/、fxskill/）> [输出目录，默认 assets/converted/boss30/fx]
import json, os, sys
from PIL import Image, ImageChops, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.abspath(sys.argv[1])
OUT = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(ROOT, 'assets', 'converted', 'boss30', 'fx')
os.makedirs(OUT, exist_ok=True)
FX = os.path.join(SRC, 'fxskill', 'FX_FireSkill', 'Textures')
EL = os.path.join(SRC, 'elemental', 'FlexUnit', 'FireSpell', 'Textures')


def load(path):
    im = Image.open(path)
    im.load()
    return im


def intensity(im):
    """单通道强度：有透明度的按 亮度 × alpha；黑底不透明的按亮度（RGB 取最大值，暗红的火也不至于太弱）"""
    im = im.convert('RGBA')
    r, g, b, a = im.split()
    mx = ImageChops.lighter(ImageChops.lighter(r, g), b)
    lo, hi = a.getextrema()
    if lo < 250:
        return ImageChops.multiply(mx, a)
    return mx


def fit(im, w, h):
    """等比缩放进 w×h，居中，四周黑"""
    im = im.copy()
    im.thumbnail((w, h), Image.LANCZOS)
    c = Image.new('L', (w, h), 0)
    c.paste(im, ((w - im.width) // 2, (h - im.height) // 2))
    return c


# ---------------- 序列帧贴图集（128 像素一格）----------------
FLIP = [
    # 名字、文件、列、行、帧数
    ('flameA', os.path.join(FX, 'fire_loop_sheet.png'), 4, 4, 16),            # 卡通火团（翻卷）
    ('flameB', os.path.join(FX, 'Fire_real_red.png'), 4, 4, 16),             # 写实火舌
    ('flameUp', os.path.join(FX, 'Fire_00002.png'), 4, 3, 12),               # 竖起的火苗（火盆、剑上的火）
    ('ember', os.path.join(FX, 'fire_particles_4_sheet.png'), 4, 4, 16),     # 小火团（由小到大再散）
    ('blast', os.path.join(FX, 'explosion_smoke_1.png'), 4, 4, 16),          # 爆开 → 浓烟
    ('burst', os.path.join(FX, 'fire_burst.png'), 4, 4, 16),                 # 细长的火焰喷涌（窄条）
    ('flare', os.path.join(FX, 'fire_glow.png'), 3, 2, 6),                   # 火光星芒
    ('smoke', os.path.join(FX, 'uPlayerNero_165-1.png'), 6, 6, 36),          # 灰烟
]
CELL, GRID = 128, 16
flip = Image.new('L', (CELL * GRID, CELL * GRID), 0)
fmeta, idx = {}, 0
for name, path, cols, rows, n in FLIP:
    src = load(path)
    I = intensity(src)
    fw, fh = src.width / cols, src.height / rows
    fmeta[name] = {'start': idx, 'frames': n, 'src': os.path.relpath(path, SRC).replace('\\', '/')}
    for k in range(n):
        cx, cy = k % cols, k // cols
        fr = I.crop((round(cx * fw), round(cy * fh), round((cx + 1) * fw), round((cy + 1) * fh)))
        # 窄条（fire_burst 每帧 32×128）放大后居中；其余等比缩进 128
        tile = fit(fr.resize((round(fr.width * CELL / fr.height), CELL), Image.LANCZOS) if fr.width < fr.height else fr, CELL, CELL)
        flip.paste(tile, ((idx % GRID) * CELL, (idx // GRID) * CELL))
        idx += 1
flip.save(os.path.join(OUT, 'fire_flip.png'), optimize=True)

# ---------------- 单张贴图集（256 像素一格）----------------
TILES = [
    ('glowFire', 'glow_fire_01.png'), ('glowHot', 'glowa_hot_grey.png'), ('glowSoft', 'M_Glow_01B.tga'), ('star', 'Fx_Glow_004.png'),
    ('spark', os.path.join(EL, 'Spark.png')), ('drop', 'particle_sprite_01.png'), ('dot', 'dot_01.png'), ('sparks', 'lizi_gq_001.png'),
    ('ring', 'ring02_00_2.png'), ('ringFire', 'ring_orange.png'), ('shock', 'Glow_ShockWave_005.tga'), ('ringSoft', 'Ring_002.tga'),
    ('fireLine', 'FireLine_01.tga'), ('rays', 'M_Ray_01A.tga'), ('beam', 'Gradient_Beam_007.tga'), ('streaks', 'grad10_07.png'),
    ('crack', 'decal_fire.png'), ('crack2', 'decal_fire2.png'), ('crack3', 'decal_fire10.png'), ('scorch', 'FlameDecal03.png'),
    ('scorch2', 'FlameDecal04.png'), ('cells', 'pd_45e_1.png'), ('lavaCells', 'monk_waveofLight_trailDiff_damage.tga'), ('caustic', 'NoiseCaustic02.png'),
    ('smokeA', 'FX_smoke_02.png'), ('smokeB', 'M_Smoke_02.tga'), ('dust', 'dust_02.png'), ('smokeRing', 'Pulse_Smoke 1.png'),
    ('spikes', 'dkjEff_s2007.png'), ('rayRing', 'dk_effect_008b.png'), ('range', 'fanwei_00001.png'), ('impact', 'impact_base.png'),
    ('flameNoise', 'FlameNoise_01.png'), ('noise', 'Noise_02.png'), ('electro', 'NoiseElectro01.png'), ('ball', 'alpha_ball2.png'),
]
T, G2 = 256, 8
tiles = Image.new('L', (T * G2, T * G2), 0)
tmeta = {}
for i, (name, f) in enumerate(TILES):
    path = f if os.path.isabs(f) else os.path.join(FX, f)
    im = intensity(load(path))
    if name in ('caustic', 'flameNoise', 'noise', 'electro', 'cells', 'lavaCells'):
        tile = im.resize((T, T), Image.LANCZOS)        # 可平铺的噪声 / 纹理：铺满一格
    elif name in ('fireLine', 'beam', 'streaks'):
        tile = im.resize((T, T), Image.LANCZOS)        # 条带：拉满一格（着色器里按长宽比用）
    else:
        tile = fit(im, T, T)
    tiles.paste(tile, ((i % G2) * T, (i // G2) * T))
    tmeta[name] = i
tiles.save(os.path.join(OUT, 'fire_tiles.png'), optimize=True)

# ---------------- 单独的大图 ----------------
for name, f, size in (('fire_circle1', 'FireCircle1.png', 1024), ('fire_circle3', 'FireCircle3.png', 1024)):
    im = intensity(load(os.path.join(EL, f))).resize((size, size), Image.LANCZOS)
    im = ImageOps.autocontrast(im, cutoff=0.5)
    im.save(os.path.join(OUT, name + '.png'), optimize=True)
lava = intensity(load(os.path.join(FX, 'firerock.png'))).resize((512, 512), Image.LANCZOS)
ImageOps.autocontrast(lava, cutoff=1).save(os.path.join(OUT, 'lava.png'), optimize=True)

meta = {'flip': {'cell': CELL, 'grid': GRID, 'seq': fmeta}, 'tiles': {'cell': T, 'grid': G2, 'names': tmeta},
        'single': ['fire_circle1.png', 'fire_circle3.png', 'lava.png'],
        'palette': {'core': '#FFF1C1', 'gold': '#FFB247', 'main': '#F05A28', 'deep': '#8D241D', 'char': '#171416'},
        'source': 'assets/special effects/fire/FX_FireSkill.unitypackage + ElementalFireSpellVFX.unitypackage（解包后取贴图，转成单通道强度）'}
json.dump(meta, open(os.path.join(OUT, 'fire.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for fn in sorted(os.listdir(OUT)):
    print(fn, os.path.getsize(os.path.join(OUT, fn)))
