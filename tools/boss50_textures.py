# 第十六轮：镇塔龙君（assets/boss/boss50）的贴图整理——原始文件只读不改。
#
# 素材实情（逐个读文件核对过）：
#   · FBX 引用 45 张外部贴图，名为 DRAGO_<格>_Diffuse.jpg / _Metallic.jpg（1001、1013 为 .png）/ _Normal.jpg，路径指向 source/ 旁边，
#     这 45 个文件都不存在；textures/ 里给的是同一套 UDIM 格的另一种命名：DRAGON_BAJA_BAJA5_<类>.<格>.jpg，全是 4096²：
#     BaseColor 15 张、Metallic 15、Normal 15、Roughness 14（缺 1043）、Emissive 3（1003 眼睛两点、1031 / 1041 胸口细纹，其余格没有）。
#     按格号一一对上即可：Diffuse → BaseColor、Metallic → Metallic、Normal → Normal；Roughness、Emissive 是 FBX 没引用的额外贴图。
#   · 15 个网格各用一个材质 DRAGO_<格>，各自的 UV 恰好落在自己那一格（UDIM）。
#   · 缺的 Roughness.1043（右翼上段）：1043 与左翼 1042 的 UV 摆法不同（底色逐像素相差均值 36/255），不能直接借用；
#     改用「底色亮度 → 粗糙度」的线性关系（在同为翼膜的 1042、1012、1013 上拟合）由 1043 自己的底色推出，见 rough_1043()。
#
# 本脚本：15 格拼成一张 4×4 的贴图集（每格四周留出边距、用边缘像素填满，免得远处 mip 串色），输出：
#   base_4096.jpg（每格 1024）/ base_2048.jpg（每格 512，流畅画质）
#   normal_2048.jpg / normal_1024.jpg（法线，4:4:4）
#   orm_2048.jpg / orm_1024.jpg（R = 自发光遮罩（取三通道最大值，先最大值缩小免得眼睛两点在缩小时被抹掉）、G = 粗糙度、B = 金属度，4:4:4）
#   atlas.json：每格在贴图集里的位置（供 boss50_blender.py 重排 UV）
# 用法：python -I tools/boss50_textures.py
import json, os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'boss', 'boss50', 'textures')
OUT = os.path.join(ROOT, 'tools', '_build', 'boss50_tex')
TILES = [1001, 1002, 1003, 1011, 1012, 1013, 1021, 1022, 1023, 1031, 1032, 1033, 1041, 1042, 1043]
GRID = 4
MARGIN = 1 / 32            # 每格四周的边距（占格宽的比例）


def path(kind, t): return os.path.join(SRC, f'DRAGON_BAJA_BAJA5_{kind}.{t}.jpg')


def cell_of(i):            # 第 i 格（按格号排序）在 4×4 贴图集里的位置（UV 坐标系：左下为原点）
    return i % GRID, i // GRID


def rough_1043(size):
    """缺失的 Roughness.1043：用翼膜三格上拟合的「底色亮度 → 粗糙度」关系，由 1043 的底色推出"""
    xs, ys = [], []
    for t in (1042, 1012, 1013):
        b = np.asarray(Image.open(path('BaseColor', t)).convert('L').resize((512, 512), Image.BILINEAR), np.float32).ravel()
        r = np.asarray(Image.open(path('Roughness', t)).convert('L').resize((512, 512), Image.BILINEAR), np.float32).ravel()
        xs.append(b); ys.append(r)
    b = np.concatenate(xs); r = np.concatenate(ys)
    A = np.vstack([b, np.ones_like(b)]).T
    k, c = np.linalg.lstsq(A, r, rcond=None)[0]
    lum = np.asarray(Image.open(path('BaseColor', 1043)).convert('L').resize((size, size), Image.LANCZOS), np.float32)
    out = np.clip(lum * k + c, 0, 255).astype(np.uint8)
    print(f'Roughness.1043 synthesized: rough = {k:.3f} * lum + {c:.1f}')
    return Image.fromarray(out, 'L')


def tile_image(kind, t, size):
    """一格的图（size×size）；mode：底色 / 法线 RGB，粗糙度 / 金属度 / 自发光遮罩 L"""
    if kind == 'Roughness' and t == 1043: return rough_1043(size)
    if kind == 'Emissive':
        p = path('Emissive', t)
        if not os.path.exists(p): return Image.new('L', (size, size), 0)
        e = Image.open(p).convert('RGB')
        m = Image.fromarray(np.asarray(e).max(axis=2), 'L')
        # 先放大亮点（最大值滤波）再缩小，眼睛那两点缩到 512 也还看得见
        k = max(3, (4096 // size) | 1)
        m = m.filter(ImageFilter.MaxFilter(min(k, 9)))
        return m.resize((size, size), Image.LANCZOS)
    im = Image.open(path(kind, t))
    im = im.convert('RGB' if kind in ('BaseColor', 'Normal') else 'L')
    return im.resize((size, size), Image.LANCZOS)


def build(kind, cell, mode):
    """拼 4×4 贴图集：每格 cell 像素，内容缩进边距、边距用边缘像素外推填满"""
    S = cell * GRID
    atlas = Image.new(mode, (S, S), 0 if mode == 'L' else (0, 0, 0))
    m = int(round(cell * MARGIN)); inner = cell - 2 * m
    for i, t in enumerate(TILES):
        cx, cy = cell_of(i)
        im = tile_image(kind, t, inner)
        a = np.asarray(im)
        pad = ((m, m), (m, m)) + (((0, 0),) if a.ndim == 3 else ())
        a = np.pad(a, pad, mode='edge')
        x0 = cx * cell; y0 = (GRID - 1 - cy) * cell              # 图像坐标：上为原点
        atlas.paste(Image.fromarray(a, mode), (x0, y0))
    return atlas


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [('base_4096.jpg', 'BaseColor', 1024, 'RGB', 90, 0), ('base_2048.jpg', 'BaseColor', 512, 'RGB', 90, 0),
            ('normal_2048.jpg', 'Normal', 512, 'RGB', 92, 0), ('normal_1024.jpg', 'Normal', 256, 'RGB', 92, 0)]
    for name, kind, cell, mode, q, sub in jobs:
        im = build(kind, cell, mode)
        im.save(os.path.join(OUT, name), quality=q, subsampling=sub, optimize=True)
        print(name, im.size, os.path.getsize(os.path.join(OUT, name)) // 1024, 'KB')
    for cell, name in ((512, 'orm_2048.jpg'), (256, 'orm_1024.jpg')):
        e = build('Emissive', cell, 'L'); r = build('Roughness', cell, 'L'); mt = build('Metallic', cell, 'L')
        im = Image.merge('RGB', (e, r, mt))
        im.save(os.path.join(OUT, name), quality=92, subsampling=0, optimize=True)
        print(name, im.size, os.path.getsize(os.path.join(OUT, name)) // 1024, 'KB')
    cells = {str(t): dict(cell=cell_of(i), margin=MARGIN) for i, t in enumerate(TILES)}
    json.dump(dict(grid=GRID, margin=MARGIN, tiles=cells), open(os.path.join(OUT, 'atlas.json'), 'w'), indent=1)
    print('atlas.json written')


if __name__ == '__main__':
    main()
