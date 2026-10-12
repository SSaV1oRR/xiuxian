# 第十四轮：技能特效贴图集（Kenney「Particle Pack」1.1，CC0，assets/special effects/kenney_particle-pack）。
# 取黑底版本里的 48 张（光晕、光环、星芒、法阵、刀光、旋风弧、光痕、电光、焦痕、烟、尘、火），各缩到 256×256，
# 排成 8×6 的灰度图集（亮度即强度 / 不透明度，颜色在着色器里按招式上色）。
# 输出：assets/converted/vfx/atlas.png（2048×1536，单通道）与 atlas.json（名 → 格号）
# 用法：python -I tools/make_vfx_atlas.py
import json, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'special effects', 'kenney_particle-pack', 'PNG (Black background)')
OUT = os.path.join(ROOT, 'assets', 'converted', 'vfx')
TILES = [
    ('glow', 'circle_05'), ('ring', 'circle_02'), ('ring2', 'circle_03'), ('ringSoft', 'circle_04'),
    ('ringWide', 'circle_01'), ('flare', 'flare_01'), ('light', 'light_01'), ('light2', 'light_03'),
    ('star', 'star_01'), ('starRing', 'star_02'), ('starCross', 'star_03'), ('starSharp', 'star_06'),
    ('starSharp2', 'star_07'), ('star6', 'star_08'), ('starGlow', 'star_09'), ('magic5', 'magic_01'),
    ('magic7', 'magic_02'), ('magicCompass', 'magic_03'), ('magic4', 'magic_04'), ('magicGlow', 'magic_05'),
    ('slashLow', 'slash_01'), ('slashLow2', 'slash_02'), ('slashV', 'slash_03'), ('slashH', 'slash_04'),
    ('scratch', 'scratch_01'), ('twirl', 'twirl_01'), ('twirl2', 'twirl_02'), ('twirl3', 'twirl_03'),
    ('trace', 'trace_01'), ('trace2', 'trace_06'), ('trace3', 'trace_07'), ('bolt', 'spark_05'),
    ('bolt2', 'spark_06'), ('boltH', 'spark_07'), ('sparkBall', 'spark_01'), ('scorch', 'scorch_01'),
    ('scorch2', 'scorch_02'), ('scorch3', 'scorch_03'), ('smoke', 'smoke_01'), ('smoke2', 'smoke_04'),
    ('smoke3', 'smoke_07'), ('smokeRing', 'smoke_10'), ('dirt', 'dirt_01'), ('dirt2', 'dirt_02'),
    ('flame', 'flame_01'), ('flame2', 'flame_04'), ('fire', 'fire_01'), ('muzzle', 'muzzle_02'),
]
COLS, ROWS, T = 8, 6, 256


def main():
    assert len(TILES) == COLS * ROWS
    atlas = Image.new('L', (COLS * T, ROWS * T), 0)
    for i, (name, f) in enumerate(TILES):
        im = Image.open(os.path.join(SRC, f + '.png')).convert('RGB').convert('L').resize((T, T), Image.LANCZOS)
        # 格边留 2 像素黑边：缩小取样（mipmap）时不渗进相邻的格
        px = im.load()
        for k in range(T):
            for e in (0, 1, T - 2, T - 1):
                px[k, e] = 0; px[e, k] = 0
        atlas.paste(im, ((i % COLS) * T, (i // COLS) * T))
    os.makedirs(OUT, exist_ok=True)
    atlas.save(os.path.join(OUT, 'atlas.png'), optimize=True)
    meta = {'source': 'Kenney · Particle Pack 1.1 (CC0 1.0) · www.kenney.nl', 'cols': COLS, 'rows': ROWS,
            'tiles': {name: i for i, (name, f) in enumerate(TILES)}, 'files': {name: f for name, f in TILES}}
    with open(os.path.join(OUT, 'atlas.json'), 'w', encoding='utf-8') as fp:
        json.dump(meta, fp, ensure_ascii=False, indent=1)
    print('atlas', atlas.size, os.path.getsize(os.path.join(OUT, 'atlas.png')) // 1024, 'KB')


if __name__ == '__main__':
    main()
