# 第二十轮：FX_Ink slash 包的贴图 → 网页用的三张灰度图（只存覆盖度，颜色在着色器里给：浓墨、灰雾、白光）。
#   ink_sprites.png  粒子贴图集（4 × 3 格，每格 512²；小贴图 256² 一格四张）：
#       墨溅四帧（ink_03_all）、受击墨花（Hit by flash-1，2×2 帧）、墨圈（ink_06）、墨环（ink_ring01）、白光月牙（ring02_fire_03，2×2 帧）、
#       墨团（ink-1）、墨雾（fp-g14a）、墨点（circle00_sp2）、柔点（flare00_04）、白光细条（lb_20f_r）、白光拖痕（A35-C）、光晕（glow_ball3_grey）、星芒（flare04_01）
#   ink_strips.png   带子用的「展开」贴图（u 沿笔画、v 横过笔画）：
#       crescent0–5：ink_all 的六帧墨弧（一笔圆弧由浓到碎）按极坐标展开成长条——刀光带子顺着剑的轨迹贴这一条（头 = 剑刃所在、尾 = 起手处）；
#       stroke：ink_05 一笔墨（蓄力时墨笔沿弯带子扫进剑柄）；stroke0–8：ink_05-all 九帧（一笔由生到碎，突刺的墨痕用）
#   ink_noise.png    NoiseElectro01（Unity 溶解着色器 Blend_DisUV 的遮罩）转灰度：墨迹碎开时的溶解噪声
# 覆盖度：墨的贴图取 alpha（这些贴图的 RGB 本来就是黑的）；白光的贴图取 亮度 × alpha，再拉到最亮为 1。
# 原贴图不改动；贴图都按原尺寸放（没有缩小）。
# 用法：python -I tools/r20_build_ink.py "<Textures 目录>" <输出目录>
import json, math, os, sys

import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)


def rgba(name):
    return np.asarray(Image.open(os.path.join(SRC, name)).convert('RGBA')).astype(np.float32) / 255.0


def cover(a, kind):
    if kind == 'ink':
        return a[..., 3]
    v = a[..., :3].mean(-1) * a[..., 3]
    return v / max(1e-6, v.max())


def resize(m, w, h):
    im = Image.fromarray((np.clip(m, 0, 1) * 255 + 0.5).astype(np.uint8), 'L')
    return np.asarray(im.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255.0


# ---------- 粒子贴图集 ----------
CELL = 512
COLS, ROWS = 4, 3
atlas = np.zeros((ROWS * CELL, COLS * CELL), np.float32)
tiles = {}


def put(name, m, cell, sub=None, grid=(1, 1), kind='ink', src=''):
    cx, cy = (cell % COLS) * CELL, (cell // COLS) * CELL
    size = CELL
    if sub is not None:
        cx += (sub % 2) * 256; cy += (sub // 2) * 256; size = 256
    if m.shape != (size, size):
        m = resize(m, size, size)
    m = m.copy()
    m[:2, :] = 0; m[-2:, :] = 0; m[:, :2] = 0; m[:, -2:] = 0      # 边上两像素清空：缩小的层级不会渗进隔壁
    atlas[cy:cy + size, cx:cx + size] = m
    tiles[name] = {'rect': [cx, cy, size, size], 'grid': list(grid), 'frames': grid[0] * grid[1], 'kind': kind, 'src': src}


a = rgba('ink_03_all.png')
for k in range(4):                                     # Unity 的序列帧：左上 → 右上 → 左下 → 右下
    r, c = divmod(k, 2)
    put('splash%d' % k, cover(a[r * 512:(r + 1) * 512, c * 512:(c + 1) * 512], 'ink'), k, src='ink_03_all.png #%d' % k)
put('hit', cover(rgba('Hit by flash-1.png'), 'ink'), 4, grid=(2, 2), src='Hit by flash-1.png')
put('enso', cover(rgba('ink_06.png'), 'ink'), 5, src='ink_06.png')
put('inkRing', cover(rgba('ink_ring01.png'), 'ink'), 6, src='ink_ring01.png')
put('arcLight', cover(rgba('ring02_fire_03.png'), 'light'), 7, grid=(2, 2), kind='light', src='ring02_fire_03.png')
put('splat', cover(rgba('ink-1.png'), 'ink'), 8, 0, src='ink-1.png')
put('mist', cover(rgba('fp-g14a.png'), 'ink'), 8, 1, src='fp-g14a.png')
put('dot', cover(rgba('circle00_sp2.png'), 'ink'), 8, 2, src='circle00_sp2.png')
put('soft', cover(rgba('flare00_04.png'), 'ink'), 8, 3, src='flare00_04.png')
put('streak', cover(rgba('lb_20f_r.png'), 'light'), 9, 0, kind='light', src='lb_20f_r.png')
put('smear', cover(rgba('A35-C.png'), 'light'), 9, 1, kind='light', src='A35-C.png')
g = rgba('glow_ball3_grey.png'); put('glow', g[..., :3].mean(-1) / max(1e-6, g[..., :3].mean(-1).max()), 9, 2, kind='light', src='glow_ball3_grey.png')
f = rgba('flare04_01.png'); put('star', f[..., :3].mean(-1) / max(1e-6, f[..., :3].mean(-1).max()), 9, 3, kind='light', src='flare04_01.png')
Image.fromarray((atlas * 255 + 0.5).astype(np.uint8), 'L').save(os.path.join(OUT, 'ink_sprites.png'), optimize=True)

# ---------- 带子贴图 ----------
SW = 1280
rows, strips = [], {}
y = 0


def add_row(name, m, src):
    global y
    h, w = m.shape
    rows.append((y, m))
    strips[name] = {'rect': [0, y, w, h], 'src': src}
    y += h + 8                                         # 行间留 8 像素空白


# ink_all：3 × 2 帧墨弧，绕各帧的圆心按极坐标展开。phi 从笔头（左，图像里 θ = 180°）沿顺时针（经下、右、上）量到 316°；
# 半径 108 → 290 像素（墨在 112 → 284 之间）。展开后 u = phi / 316°（0 笔头 → 1 笔尾），v = (r - 108) / 182（0 内沿 → 1 外沿）
inkall = rgba('ink_all.png')[..., 3]
FW, FH = 2048 / 3, 1365 / 2
CX, CY, R0, R1, PHI = 320.0, 290.0, 108.0, 290.0, 316.0
SH = 176
uu, vv = np.meshgrid((np.arange(SW) + 0.5) / SW, (np.arange(SH) + 0.5) / SH)
phi = np.radians(uu * PHI)
theta = math.pi - phi
rad = R0 + vv * (R1 - R0)
for k in range(6):
    r, c = divmod(k, 3)
    X = c * FW + CX + rad * np.cos(theta)
    Y = r * FH + CY + rad * np.sin(theta)
    x0 = np.clip(np.floor(X).astype(int), 0, 2047); y0 = np.clip(np.floor(Y).astype(int), 0, 1364)
    x1 = np.clip(x0 + 1, 0, 2047); y1 = np.clip(y0 + 1, 0, 1364)
    fx, fy = X - np.floor(X), Y - np.floor(Y)
    m = (inkall[y0, x0] * (1 - fx) * (1 - fy) + inkall[y0, x1] * fx * (1 - fy) + inkall[y1, x0] * (1 - fx) * fy + inkall[y1, x1] * fx * fy)
    # 只取这一帧自己的格子（展开时不越界读到隔壁帧）
    inside = (X >= c * FW) & (X < (c + 1) * FW - 1) & (Y >= r * FH) & (Y < (r + 1) * FH - 1)
    add_row('crescent%d' % k, (m * inside)[::-1, :], 'ink_all.png #%d（极坐标展开）' % k)      # 行序翻过来：v = 0（内沿）在下
st = rgba('ink_05.png')[128:236, :, 3]
add_row('stroke', st[::-1, :], 'ink_05.png（第 128–235 行）')
s9 = rgba('ink_05-all.png')[..., 3]
fw9, fh9 = 1024 / 3, 728 / 3
for k in range(9):
    r, c = divmod(k, 3)
    x0, y0 = int(round(c * fw9)), int(round(r * fh9))
    add_row('stroke%d' % k, s9[y0 + 88:y0 + 156, x0:x0 + 341][::-1, :], 'ink_05-all.png #%d' % k)
H = y
strip_img = np.zeros((H, SW), np.float32)
for yy, m in rows:
    strip_img[yy:yy + m.shape[0], :m.shape[1]] = m
# 存图时第 0 行在最上面；着色器里按「图像坐标」取（rect 的 y 向下），见 src/game/inkFx.js
Image.fromarray((strip_img * 255 + 0.5).astype(np.uint8), 'L').save(os.path.join(OUT, 'ink_strips.png'), optimize=True)

# ---------- 溶解噪声 ----------
n = np.asarray(Image.open(os.path.join(SRC, 'NoiseElectro01.png')).convert('L'))
Image.fromarray(n, 'L').save(os.path.join(OUT, 'ink_noise.png'), optimize=True)

meta = {
    'source': 'assets/special effects/FX_Ink_slash/FX_Ink slash.unitypackage → FX_Ink slash/Textures（tools/r20_unpack_unitypackage.py 解包）',
    'sprites': {'file': 'ink_sprites.png', 'size': [COLS * CELL, ROWS * CELL], 'tiles': tiles},
    'strips': {'file': 'ink_strips.png', 'size': [SW, H], 'rows': strips,
               'unwrap': {'from': 'ink_all.png', 'center': [CX, CY], 'radius': [R0, R1], 'phi': PHI, 'note': 'u = 0 笔头（浓）→ 1 笔尾（枯），v = 0 内沿 → 1 外沿；行已上下翻转（v 向上）'}},
    'noise': {'file': 'ink_noise.png', 'size': list(n.shape[::-1]), 'src': 'NoiseElectro01.png'},
}
json.dump(meta, open(os.path.join(OUT, 'ink_atlas.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for fn in ('ink_sprites.png', 'ink_strips.png', 'ink_noise.png'):
    p = os.path.join(OUT, fn)
    print(fn, Image.open(p).size, os.path.getsize(p), 'bytes')
