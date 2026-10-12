# 新素材贴图处理（系统 Python：Pillow + numpy + scipy），原始贴图不改动，输出到 assets/converted/
#   python tools/prepare_textures.py
# 护宗双龙：由飞龙原始 4K 贴图生成冰龙 / 火龙两套底色与发光遮罩（按鳞片、翼膜与腹甲、角爪三类区域分别着色，保留明暗与鳞片细节），
# 以及共用的法线、粗糙度与眼睛贴图（缩到 2048 / 1024）。
import os
import numpy as np
from PIL import Image
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'assets/dragon/wyvern_animated/textures')
OUT = os.path.join(ROOT, 'assets/converted/dragon')
os.makedirs(OUT, exist_ok=True)
N = 2048


def load(name, size=N, mode='RGB'):
    return np.asarray(Image.open(os.path.join(SRC, name)).convert(mode).resize((size, size), Image.LANCZOS)).astype(np.float32) / 255


def save(a, name, q=90):
    Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, name), quality=q, optimize=True)
    print('saved', name)


def ramp(t, stops):
    # stops: [(t, (r,g,b)), ...]，t 升序
    t = np.clip(t, 0, 1)[..., None]
    out = np.zeros(t.shape[:-1] + (3,), np.float32)
    for (t0, c0), (t1, c1) in zip(stops[:-1], stops[1:]):
        k = np.clip((t - t0) / max(t1 - t0, 1e-6), 0, 1)
        seg = (np.array(c0) * (1 - k) + np.array(c1) * k)
        m = (t >= t0) & (t <= t1)
        out = np.where(m, seg, out)
    return out


base = load('Material.002_BaseColor.png')
r, g, b = base[..., 0], base[..., 1], base[..., 2]
mx, mn = base.max(-1), base.min(-1)
sat = (mx - mn) / np.maximum(mx, 1e-4)
L = 0.299 * r + 0.587 * g + 0.114 * b
hue = np.zeros_like(L)
d = np.maximum(mx - mn, 1e-5)
hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
# 区域：鳞片（红、饱和）/ 翼膜与腹甲（米黄）/ 角爪尖刺（低饱和的浅色）
# 以色相为主分区（边缘柔和过渡）：红色 → 鳞片；橙黄 → 翼膜与腹甲；低饱和的浅色 → 角爪尖刺
hr = np.where(hue > 300, hue - 360, hue)                                    # 红色连续到负角度
red_w = np.clip((20 - hr) / 6, 0, 1) * np.clip((hr + 40) / 10, 0, 1)
tan_w = np.clip((hr - 14) / 6, 0, 1) * np.clip((72 - hr) / 10, 0, 1)
horn_m = np.clip((0.24 - sat) / 0.1, 0, 1) * np.clip((L - 0.28) / 0.18, 0, 1)
colored = np.clip((sat - 0.14) / 0.1, 0, 1) * (1 - horn_m)
scale_m = red_w * colored
beige_m = tan_w * colored
for m in (scale_m, beige_m, horn_m): m[...] = ndimage.gaussian_filter(m, 1.2)
rest = np.clip(1 - scale_m - beige_m - horn_m, 0, 1)
Ls = np.clip(L / np.percentile(L[scale_m > 0.5], 92), 0, 1.2)       # 鳞片明暗归一
Lb = np.clip(L / np.percentile(L[beige_m > 0.5], 90), 0, 1.2)
Lh = np.clip(L / np.percentile(L[horn_m > 0.5], 95), 0, 1.2)
# 鳞片缝（局部偏暗处）：用于发光
blurL = ndimage.gaussian_filter(L, 3.0)
crevice = np.clip((blurL - L) * 9, 0, 1) * scale_m
emis = load('wyvernlow_Material.002_BaseColor.png1.png', mode='RGB').max(-1)   # 原模型的发光斑纹


def build(kind):
    if kind == 'ice':
        sc = ramp(Ls, [(0, (0.03, 0.06, 0.12)), (0.35, (0.10, 0.22, 0.36)), (0.7, (0.38, 0.60, 0.76)), (1.0, (0.80, 0.91, 0.97))])
        mem = ramp(Lb, [(0, (0.22, 0.32, 0.42)), (0.6, (0.56, 0.70, 0.82)), (1.0, (0.82, 0.90, 0.96))])
        hor = ramp(Lh, [(0, (0.40, 0.48, 0.56)), (1.0, (0.90, 0.95, 0.99))])
        glow = np.clip(crevice * 0.55 + emis * 0.8 + horn_m * 0.12 * Lh, 0, 1)
    else:
        sc = ramp(Ls, [(0, (0.035, 0.007, 0.004)), (0.4, (0.17, 0.025, 0.013)), (0.75, (0.40, 0.075, 0.032)), (1.0, (0.72, 0.31, 0.12))])
        mem = ramp(Lb, [(0, (0.12, 0.03, 0.015)), (0.6, (0.40, 0.11, 0.045)), (1.0, (0.64, 0.27, 0.10))])
        hor = ramp(Lh, [(0, (0.12, 0.09, 0.06)), (1.0, (0.55, 0.42, 0.24))])
        glow = np.clip(crevice * 1.0 + emis * 1.0 + beige_m * 0.10 * Lb, 0, 1)
    gray = np.repeat((L * 0.9)[..., None], 3, -1)
    col = sc * scale_m[..., None] + mem * beige_m[..., None] + hor * horn_m[..., None] + gray * rest[..., None]
    save(col, f'dragon_{kind}.jpg', 90)
    gl = ndimage.gaussian_filter(glow, 0.8)
    Image.fromarray((np.clip(gl, 0, 1) * 255).astype(np.uint8), 'L').resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, f'dragon_glow_{kind}.jpg'), quality=88)
    print('saved', f'dragon_glow_{kind}.jpg')


build('ice')
build('fire')
save(load('Material.002_Normal.png'), 'dragon_n.jpg', 93)
save(load('Material.002_Roughness.png', 1024), 'dragon_r.jpg', 88)
save(load('eyeball_Base_Color2222.png', 512), 'dragon_eye.jpg', 90)
print('TEXTURES_DONE')
