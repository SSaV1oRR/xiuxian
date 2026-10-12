# 宗门建筑模型（assets/buildings/01.fbx）的游戏用贴图（第十轮）
#   python tools/prepare_building_textures.py <原贴图目录> <输出目录> [边长]
# 原贴图目录：tools/convert_buildings.py --stage dump 从 FBX 内嵌贴图导出的 001.png … 021.png（原尺寸 2048，原文件不改动）
# 处理：
#   1. 招牌字（赌场、赌坊、欢乐坊、粮草站、校场）：抹去（周围底色向内扩散填补）；凌云阁正面的横匾改写为「凌云阁」
#      （这几处招牌所在的立牌构件由 convert_buildings.py 整件删除，贴图里也一并抹净）
#   2. 屋瓦：金黄瓦与深灰瓦统一为青灰瓦（#354957 起步、亮处 #526774），保留原瓦垄、瓦当的明暗与纹样
#   3. 朱红木：色相略向正红偏、略提亮（#7E342D 方向），木纹、描金不动
import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SRC, DST = sys.argv[1], sys.argv[2]
SIZE = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
os.makedirs(DST, exist_ok=True)

# 招牌字所在矩形（原 2048 像素坐标 x0, y0, x1, y1）
TEXT = {
    '001': [(515, 1532, 940, 1778), (760, 1336, 905, 1500)],
    '002': [(525, 575, 1215, 765)],
    '006': [(572, 1124, 688, 1378)],
    '008': [(1058, 562, 1252, 938)],
    '009': [(312, 802, 568, 1308)],
    '012': [(1522, 922, 1708, 1328)],
}
# 改写的匾字：贴图 → (矩形, 文字, 横 / 竖)。凌云阁（A）正面檐下的横匾；其余几处招牌都是院角立牌，模型里整件删掉
NEWTEXT = {
    '002': ((560, 588, 1180, 752), '凌云阁', 'h'),
}
# 屋瓦区域（原 2048 像素坐标）
TILES = {
    '002': [(1250, 150, 2048, 1125), (1250, 1255, 2048, 2048)],
    '005': [(0, 0, 2048, 1130)],
    '007': [(0, 0, 2048, 945)],
    '009': [(1290, 900, 1700, 1520)],
    '010': [(0, 0, 2048, 765)],
    '011': [(0, 0, 1030, 775)],
    '014': [(0, 940, 622, 2048)],
    '016': [(0, 60, 2048, 705), (0, 1560, 2048, 2048)],
    '017': [(0, 0, 2048, 1105)],
    '019': [(0, 0, 2048, 915)],
}
TILE_RGB = np.array([53, 73, 87], np.float32)          # #354957
TILE_CHROMA = TILE_RGB / (0.299 * TILE_RGB[0] + 0.587 * TILE_RGB[1] + 0.114 * TILE_RGB[2])

def lum(a): return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114

def inpaint(a, mask, iters=260):
    """被遮住的像素由四邻未遮像素的均值逐圈向内扩散（再加少许木纹噪声）"""
    a = a.copy(); m = mask.copy()
    for _ in range(iters):
        if not m.any(): break
        known = ~m
        acc = np.zeros_like(a); cnt = np.zeros(a.shape[:2], np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            sh = np.roll(np.roll(a, dy, 0), dx, 1); kn = np.roll(np.roll(known, dy, 0), dx, 1)
            acc += sh * kn[..., None]; cnt += kn
        fill = m & (cnt > 0)
        a[fill] = acc[fill] / cnt[fill][:, None]
        m = m & ~fill
    return a

def remove_text(a, box):
    x0, y0, x1, y1 = box
    sub = a[y0:y1, x0:x1]
    L = lum(sub)
    sat = sub.max(-1) - sub.min(-1)
    bg = np.median(L)
    # 金字：比底色亮得多、偏黄（R、G 高于 B），向外扩 3 像素
    mask = ((L > bg + 16) & (sat > 24)) | (L > bg + 45)
    img = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))
    mask = np.asarray(img) > 0
    filled = inpaint(sub, mask)
    # 填补处加一点与底色相近的颗粒，免得一片平涂
    noise = (np.random.default_rng(7).standard_normal(sub.shape[:2]) * 2.2)[..., None]
    filled[mask] += noise[mask]
    a[y0:y1, x0:x1] = filled

def clean_board(a, box, orient):
    """要改写的匾：整块匾心按木纹方向重铺（竖匾逐列、横匾逐行取未被字遮住像素的中位数，保留木纹与上下明暗），
    免得旧字的描边残留成斑"""
    x0, y0, x1, y1 = box
    sub = a[y0:y1, x0:x1].copy()
    L = lum(sub); rb = sub[..., 0] - sub[..., 2]
    mask = (L > np.median(L) + 8) | (rb > np.median(rb) + 12)
    mask = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(11))) > 0
    ax = 0 if orient == 'v' else 1                       # 竖匾木纹竖向：沿列取中位数
    keep = np.where(mask[..., None], np.nan, sub)
    with np.errstate(all='ignore'):
        import warnings; warnings.simplefilter('ignore', RuntimeWarning)
        prof = np.nanmedian(keep, axis=ax)               # 竖匾：每列一个颜色
        glob = np.nanmedian(keep.reshape(-1, 3), axis=0)
    prof = np.where(np.isnan(prof), glob, prof)
    base = np.broadcast_to(prof[None] if ax == 0 else prof[:, None], sub.shape).copy()
    # 顺纹方向的明暗（逐行 / 逐列亮度中位数，强平滑）
    with np.errstate(all='ignore'):
        import warnings; warnings.simplefilter('ignore', RuntimeWarning)
        tone = np.nanmedian(np.where(mask, np.nan, L), axis=1 - ax)
    ok = ~np.isnan(tone); idx = np.arange(len(tone))
    tone = np.interp(idx, idx[ok], tone[ok]) if ok.any() else np.ones(len(tone))     # 整列被字遮住的，按两侧插值
    k = np.ones(61) / 61; tone = np.convolve(np.pad(tone, 30, mode='edge'), k, 'valid')
    tone = 1 + np.clip(tone / max(np.median(tone), 1) - 1, -0.08, 0.08)
    base *= (tone[:, None, None] if ax == 0 else tone[None, :, None])
    rng = np.random.default_rng(11)
    grain = rng.standard_normal(sub.shape[1 - ax]) * 1.6
    base += (grain[None, :, None] if ax == 0 else grain[:, None, None])
    # 边缘 6 像素羽化回原图
    h, w = sub.shape[:2]
    yy = np.minimum(np.arange(h), np.arange(h)[::-1])[:, None]; xx = np.minimum(np.arange(w), np.arange(w)[::-1])[None, :]
    f = np.clip(np.minimum(yy, xx) / 6.0, 0, 1)[..., None]
    a[y0:y1, x0:x1] = sub * (1 - f) + base * f

def draw_text(a, box, text, orient):
    x0, y0, x1, y1 = box
    W, H = x1 - x0, y1 - y0
    font_path = 'C:/Windows/Fonts/STKAITI.TTF' if os.path.exists('C:/Windows/Fonts/STKAITI.TTF') else 'C:/Windows/Fonts/simkai.ttf'
    n = len(text)
    fs = int(min(H * 0.78, W / n * 0.86)) if orient == 'h' else int(min(W * 0.8, H / n * 0.86))
    font = ImageFont.truetype(font_path, fs)
    layer = Image.new('L', (W, H), 0); d = ImageDraw.Draw(layer)
    for i, ch in enumerate(text):
        if orient == 'h': cx, cy = W * (i + 0.5) / n, H / 2
        else: cx, cy = W / 2, H * (i + 0.5) / n
        d.text((cx, cy), ch, font=font, fill=255, anchor='mm')
    m = np.asarray(layer, np.float32) / 255
    shadow = np.asarray(layer.filter(ImageFilter.GaussianBlur(3)), np.float32) / 255
    sub = a[y0:y1, x0:x1]
    sub *= (1 - 0.45 * np.roll(np.roll(shadow, 3, 0), 3, 1))[..., None]          # 字口的阴影
    gold = np.array([196, 160, 92], np.float32)                                  # 旧金
    shade = 0.82 + 0.3 * np.linspace(1, 0, H)[:, None]                           # 上亮下暗
    sub[:] = sub * (1 - m[..., None]) + (gold * shade[..., None]) * m[..., None]
    a[y0:y1, x0:x1] = sub

def recolor_tiles(a, box):
    x0, y0, x1, y1 = box
    sub = a[y0:y1, x0:x1]
    Y = lum(sub)
    Yc = np.where(Y > 120, 120 + (Y - 120) * 0.45, Y)                          # 高光压一压，免得发白发蓝
    Yn = Yc * 1.08 + 3
    # 暗处青灰浓、亮处偏中性灰（瓦面高光不发蓝）
    k = np.clip(1.0 - (Yn - 60) / 160, 0.5, 1.0)[..., None]
    out = Yn[..., None] * (1 + (TILE_CHROMA[None, None, :] - 1) * k)
    a[y0:y1, x0:x1] = out * 0.92 + sub * 0.08                                   # 留一点原色的冷暖起伏

def grade_red(a):
    """朱红木：红色色相的像素色相略偏正红、略提亮"""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(-1); mn = a.min(-1); sat = (mx - mn) / np.maximum(mx, 1)
    red = (r >= g) & (r >= b) & (sat > 0.32) & (mx > 30) & (g - b < 30)
    w = np.clip((sat - 0.32) / 0.15, 0, 1) * red
    # 偏橙的红（G 相对 B 偏高）向正红收：G 往 B 靠一点
    g2 = g - (g - b) * 0.35
    out = a.copy()
    out[..., 1] = g * (1 - w) + g2 * w
    out *= (1 + 0.1 * w)[..., None]
    return out

# 004 与 003、021 与 015 是同一张图（逐像素差 ≤ 7，压缩噪点），只处理前者，convert_buildings.py 里把后者的面并过去
DUP = {'004': '003', '021': '015'}
# 未用到的：007、008（B 栋「军机处」，与 F 同一几何、贴图带字，用 F）、020（律师招牌）
UNUSED = {'007', '008', '020'}
# 各栋共用的门窗、白墙、木作图集 003 保留 2048（近处看得最多），其余 1024
SIZES = {'003': 2048}
for f in sorted(os.listdir(SRC)):
    if not f.endswith('.png'): continue
    key = f[:3]
    if key in DUP or key in UNUSED: continue
    im = Image.open(os.path.join(SRC, f)).convert('RGB')
    a = np.asarray(im, np.float32).copy()
    for box in TEXT.get(key, []): remove_text(a, box)
    if key in NEWTEXT:
        clean_board(a, TEXT[key][0], NEWTEXT[key][2])
        draw_text(a, *NEWTEXT[key])
    a = grade_red(a)
    for box in TILES.get(key, []): recolor_tiles(a, box)
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    size = SIZES.get(key, SIZE)
    if out.size[0] != size: out = out.resize((size, size), Image.LANCZOS)
    out.save(os.path.join(DST, key + '.jpg'), quality=88)
    print('TEX', key, out.size)
