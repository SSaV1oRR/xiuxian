"""花树贴图集：assets/converted/trees/blossom.png（2048×1024，4×2 格，每格 512²，带透明通道）。

来源（都在项目 assets 里，原文件不改）：
  - 樱花簇：assets/temple/pagoda_and_cherry_blossom_game_scene_baked (1)/textures/sakura_a_diffuse-sakura_a_alpha_4.png
    （那棵樱花在原场景里只是一张公告板，这里从画好的树冠里截取花簇，作为三维枝条上的花簇卡片）；
    调成清淡的樱粉（原色偏灰紫）；
  - 淡紫花簇：同样的花簇转为淡紫（紫薇 / 丁香一类的花色）；
  - 金黄叶簇：项目叶片贴图集 assets/veg/foliage.webp 的银杏叶簇，提亮为两种金黄；
  - 树皮：同一贴图集的阔叶树皮（樱树皮略偏红褐）。
格序（u 从左到右、v 自下而上，与 vegetation.js 的 BLOSSOM_CELLS 一致）：
  下排：sakuraA sakuraB flowers（2×2：盛开 ×2、花苞、单瓣） bark
  上排：lilacA  lilacB  goldA   goldB
用法：python tools/make_blossom_atlas.py
"""
import colorsys
import json
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAKURA = os.path.join(ROOT, 'assets', 'temple', 'pagoda_and_cherry_blossom_game_scene_baked (1)', 'textures', 'sakura_a_diffuse-sakura_a_alpha_4.png')
FOLIAGE = os.path.join(ROOT, 'assets', 'veg', 'foliage.webp')
FOLIAGE_JSON = os.path.join(ROOT, 'assets', 'veg', 'foliage.json')
OUT = os.path.join(ROOT, 'assets', 'converted', 'trees', 'blossom.png')
CELL = 512

rng = np.random.default_rng(7)


def soft_mask(n, seed, inner=0.34, outer=0.5):
    """不规则的圆形淡出（花簇外缘参差，不露出方形卡片边）"""
    r = np.random.default_rng(seed)
    y, x = np.mgrid[0:n, 0:n] / (n - 1) - 0.5
    ang = np.arctan2(y, x)
    wob = sum(r.uniform(0.012, 0.03) * np.sin(k * ang + r.uniform(0, 6.28)) for k in (3, 5, 7, 11))
    d = np.hypot(x, y) + wob
    return np.clip((outer - d) / (outer - inner), 0, 1)


def recolor(rgb, hue, sat_mul, val_mul, keep_dark=True):
    """按 HSV 改色：只动有颜色的花瓣，深色的花心与枝条基本保留"""
    h, w, _ = rgb.shape
    flat = rgb.reshape(-1, 3)
    out = np.empty_like(flat)
    for i, (r, g, b) in enumerate(flat):
        hh, ss, vv = colorsys.rgb_to_hsv(r, g, b)
        k = 1.0 if not keep_dark else min(1.0, max(0.0, (vv - 0.18) / 0.25))
        hh = hh + (hue - hh) * k if hue is not None else hh
        ss = min(1.0, ss * (1 + (sat_mul - 1) * k))
        vv = min(1.0, vv * (1 + (val_mul - 1) * k))
        out[i] = colorsys.hsv_to_rgb(hh % 1.0, ss, vv)
    return out.reshape(h, w, 3)


def crop_cluster(img, box, seed):
    c = img.crop(box).resize((CELL, CELL), Image.LANCZOS)
    a = np.asarray(c).astype(np.float32) / 255
    a[..., 3] *= soft_mask(CELL, seed)
    # 去掉画里的枝条笔触（暗而偏褐 / 偏绿的细线）：卡片交叉时它们会显成一道道直线；去掉后花团之间也多出透光的空隙
    rgb = a[..., :3]
    v = rgb.max(-1)
    pinkness = rgb[..., 0] - rgb[..., 1]                  # 花瓣偏粉（红 > 绿）
    keep = np.clip((v - 0.30) / 0.12, 0, 1) * np.clip((pinkness + 0.02) / 0.06, 0, 1)
    keep = np.maximum(keep, np.clip((v - 0.55) / 0.1, 0, 1))   # 很亮的花瓣（近白）保留
    a[..., 3] *= keep
    return a


def flower_sheet(seed=3):
    """一格 512² 里画 2×2 四朵：两种盛开的五瓣樱花、一簇花苞、一片单独的花瓣（落花用）。
    颜色近白（花心微粉），由顶点色染成樱粉或淡紫。先按 4 倍尺寸画再缩小，边缘平滑"""
    from PIL import ImageDraw
    rng = np.random.default_rng(seed)
    SS = 4
    sheet = np.zeros((CELL, CELL, 4), np.float32)
    def petal_poly(cx, cy, ang, L, W, notch=0.16, n=40):
        pts = []
        for i in range(n + 1):
            t = i / n                                    # 沿花瓣一侧从基部到尖端，再从另一侧回来
            side = -1 if t <= 0.5 else 1
            u = t * 2 if t <= 0.5 else (1 - t) * 2       # 0 基部 → 1 尖端
            w = W * np.sin(np.pi * min(1, u * 1.05)) ** 0.8 * (1 - 0.15 * u)
            r = L * u
            if u > 0.86:                                 # 尖端的 V 形缺口
                r -= notch * L * (1 - abs(side * (1 - u) / 0.14)) * 0.0
            pts.append((r, side * w * 0.5))
        # 缺口：尖端向内凹
        pts = [(x - (notch * L if abs(y) < W * 0.12 and x > L * 0.8 else 0), y) for (x, y) in pts]
        c, s_ = np.cos(ang), np.sin(ang)
        return [(cx + x * c - y * s_, cy + x * s_ + y * c) for (x, y) in pts]
    def draw_flower(size, petals=5, open_k=1.0, rot=0.0, cup=1.0):
        N = size * SS
        im = Image.new('L', (N, N), 0)
        d = ImageDraw.Draw(im)
        cx = cy = N / 2
        for k in range(petals):
            ang = rot + k * 2 * np.pi / petals + rng.uniform(-0.08, 0.08)
            L = N * 0.46 * open_k * rng.uniform(0.92, 1.0)
            Wd = N * 0.36 * open_k * rng.uniform(0.9, 1.05) * cup
            d.polygon(petal_poly(cx, cy, ang, L, Wd), fill=255)
        a = np.asarray(im.resize((size, size), Image.LANCZOS)).astype(np.float32) / 255
        yy, xx = np.mgrid[0:size, 0:size] / (size - 1) - 0.5
        r = np.hypot(xx, yy) / 0.46
        pink = np.array([0.93, 0.62, 0.72]); white = np.array([1.0, 0.95, 0.97])
        k = np.clip(r * 1.4 - 0.1, 0, 1)[..., None]
        rgb = pink * (1 - k) + white * k
        # 花瓣上的细脉（从中心放射的浅纹）
        ang = np.arctan2(yy, xx)
        vein = 0.5 + 0.5 * np.cos(ang * petals * 3)
        rgb = rgb * (1 - 0.06 * vein[..., None] * (1 - k))
        # 花心：深粉的一点与一圈花蕊（细线 + 黄点）
        core = np.clip(1 - r / 0.16, 0, 1)[..., None]
        rgb = rgb * (1 - core) + np.array([0.78, 0.32, 0.42]) * core
        out = np.dstack([rgb, a])
        sim = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), 'RGBA')
        d2 = ImageDraw.Draw(sim)
        for i in range(14):
            t = i / 14 * 2 * np.pi + rng.uniform(-0.1, 0.1)
            r0, r1 = size * 0.05, size * rng.uniform(0.15, 0.2)
            x1, y1 = size / 2 + np.cos(t) * r1, size / 2 + np.sin(t) * r1
            d2.line([(size / 2 + np.cos(t) * r0, size / 2 + np.sin(t) * r0), (x1, y1)], fill=(196, 92, 112, 255), width=max(1, size // 160))
            d2.ellipse([x1 - size * 0.012, y1 - size * 0.012, x1 + size * 0.012, y1 + size * 0.012], fill=(238, 196, 96, 255))
        return np.asarray(sim).astype(np.float32) / 255
    def draw_petal(size):
        N = size * SS
        im = Image.new('L', (N, N), 0)
        d = ImageDraw.Draw(im)
        d.polygon(petal_poly(N * 0.14, N * 0.5, 0.0, N * 0.74, N * 0.56, notch=0.12), fill=255)
        a = np.asarray(im.resize((size, size), Image.LANCZOS)).astype(np.float32) / 255
        yy, xx = np.mgrid[0:size, 0:size] / (size - 1)
        k = np.clip(xx * 1.3 - 0.1, 0, 1)[..., None]
        rgb = np.array([0.95, 0.7, 0.78]) * (1 - k) + np.array([1.0, 0.95, 0.97]) * k
        return np.dstack([rgb, a])
    H = CELL // 2
    sheet[0:H, 0:H] = draw_flower(H, rot=0.3)
    sheet[0:H, H:CELL] = draw_flower(H, rot=1.1, open_k=0.94)
    # 花苞：三个小苞
    buds = np.zeros((H, H, 4), np.float32)
    for (bx, by, bs) in [(0.32, 0.4, 0.42), (0.66, 0.36, 0.36), (0.5, 0.7, 0.4)]:
        f = draw_flower(int(H * bs), petals=5, open_k=0.62, rot=rng.uniform(0, 6), cup=0.75)
        sz = f.shape[0]; x0 = int(bx * H - sz / 2); y0 = int(by * H - sz / 2)
        reg = buds[y0:y0 + sz, x0:x0 + sz]
        a1 = f[..., 3:4]
        reg[..., :3] = reg[..., :3] * (1 - a1) + f[..., :3] * a1
        reg[..., 3:4] = np.maximum(reg[..., 3:4], a1)
    sheet[H:CELL, 0:H] = buds
    sheet[H:CELL, H:CELL] = draw_petal(H)
    return sheet


def main():
    sak = Image.open(SAKURA).convert('RGBA')
    S = sak.size[0] / 768            # 截取框按 768 预览图标定
    boxes = [(55, 380, 335, 560), (440, 280, 705, 470), (235, 470, 515, 650)]
    clusters = []
    for i, (x0, y0, x1, y1) in enumerate(boxes):
        cx, cy, h = (x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, y1 - y0) / 2
        clusters.append(crop_cluster(sak, (int((cx - h) * S), int((cy - h) * S), int((cx + h) * S), int((cy + h) * S)), 10 + i))

    atlas = np.zeros((2 * CELL, 4 * CELL, 4), np.float32)

    def put(col, row_from_bottom, cell):
        y0 = (1 - row_from_bottom) * CELL
        atlas[y0:y0 + CELL, col * CELL:(col + 1) * CELL] = cell

    # 下排：樱花簇（清淡樱粉）× 2、单朵花与花瓣（2×2，近白，由顶点色染色）、树皮
    for i, c in enumerate(clusters[:2]):
        rgb = recolor(c[..., :3], hue=0.955, sat_mul=1.35, val_mul=1.12)
        put(i, 0, np.dstack([rgb, c[..., 3]]))
    put(2, 0, flower_sheet())
    fol = Image.open(FOLIAGE).convert('RGBA')
    cells = json.load(open(FOLIAGE_JSON, encoding='utf-8'))
    W, H = fol.size

    def fol_cell(name):
        u, v, du, dv = cells[name]
        box = (int(u * W), int((1 - v - dv) * H), int((u + du) * W), int((1 - v) * H))
        return np.asarray(fol.crop(box).resize((CELL, CELL), Image.LANCZOS)).astype(np.float32) / 255

    bark = fol_cell('barkBroad')
    bark_rgb = bark[..., :3] * np.array([1.0, 0.9, 0.86])            # 樱树皮：略偏红褐
    put(3, 0, np.dstack([np.clip(bark_rgb, 0, 1), np.ones((CELL, CELL))]))
    # 上排：淡紫 × 2，金黄 × 2
    for i, c in enumerate(clusters[:2]):
        rgb = recolor(c[..., :3], hue=0.79, sat_mul=0.85, val_mul=1.2)
        put(i, 1, np.dstack([rgb, c[..., 3]]))
    gk = fol_cell('ginkgo')
    put(2, 1, np.dstack([recolor(gk[..., :3], hue=0.135, sat_mul=1.08, val_mul=1.12, keep_dark=False), gk[..., 3]]))
    put(3, 1, np.dstack([recolor(np.fliplr(gk[..., :3]), hue=0.115, sat_mul=1.12, val_mul=1.04, keep_dark=False), np.fliplr(gk[..., 3])]))

    # 透明处的颜色向外扩散（避免 mip 后卡片边缘出现黑边）
    rgb = atlas[..., :3].copy()
    a = atlas[..., 3]
    filled = a > 0.02
    img = Image.fromarray((rgb * 255).astype(np.uint8))
    for _ in range(6):
        blur = np.asarray(img.filter(ImageFilter.MaxFilter(5))).astype(np.float32) / 255
        rgb = np.where(filled[..., None], rgb, blur)
        filled = filled | (blur.sum(-1) > 0.02)
        img = Image.fromarray((rgb * 255).astype(np.uint8))
    out = np.dstack([rgb, a])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), 'RGBA').save(OUT, optimize=True)
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')


if __name__ == '__main__':
    main()
