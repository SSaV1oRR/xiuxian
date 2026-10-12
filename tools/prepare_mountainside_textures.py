# 岩壁扫描素材的游戏用贴图（第十轮）：python tools/prepare_mountainside_textures.py <convert_mountainside.py 的临时目录>
# 输出：
#   assets/converted/mountainside/ms_d.jpg（2K 漫反射，颜色拉向宗门岩色：主体 #92968B、裂隙 #606962，保留原图约 15% 的冷暖起伏）
#   assets/converted/mountainside/ms_n.jpg（2K 法线，OpenGL 约定）、ms_r.jpg（1K 粗糙度，存于 G 通道）
#   assets/tex/mside_d.jpg、mside_n.jpg（1K 四方连续岩面：由正投影烘焙裁出岩面中部约 6.5 米见方，十字错位叠接成无缝贴图；
#     程序化崖壁与地形陡坡共用，与扫描岩体同一种岩面）
import sys, os, json
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
TMP = sys.argv[1]
SRC_D = os.path.join(ROOT, 'assets', 'mountain', 'mountainside_4k.blend', 'textures', 'mountainside_diff_4k.jpg')
OUT = os.path.join(ROOT, 'assets', 'converted', 'mountainside')
TEX = os.path.join(ROOT, 'assets', 'tex')
os.makedirs(OUT, exist_ok=True)

MAIN = np.array([0x92, 0x96, 0x8B], np.float32)
CRACK = np.array([0x60, 0x69, 0x62], np.float32)
def lum(a): return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114
def smooth(e0, e1, x): t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def grade(a, mask=None):
    """sRGB 0..255 → 宗门岩色：亮度按全图均值归一，均值处为主体色，暗处（裂隙、背光的岩槽）偏向裂隙色；保留 15% 原有色差"""
    L = lum(a)
    m = L[mask] if mask is not None else L
    Ln = L / max(float(np.median(m)), 1)
    Ln = 1 + (Ln - 1) * 0.85                                 # 略收对比
    hi = np.maximum(Ln - 1, 0)
    Ln = np.where(Ln > 1, 1 + hi / (1 + hi * 1.6), Ln)       # 亮部软压（不出白斑）
    s = smooth(0.55, 1.05, Ln)[..., None]
    tint = CRACK / lum(CRACK) * (1 - s) + MAIN / lum(MAIN) * s
    out = tint * (lum(MAIN) * Ln)[..., None]
    out += 0.15 * (a - L[..., None])
    return np.clip(out, 0, 255)

def tileable(img, p=2.0):
    """先横后竖两次错位叠接：每次与半幅错位的副本按 sin^p 窗口过渡（原图在中、副本在两边）；
    副本的接缝只在中线、原图的接缝只在两边，任一处总有一张无缝，结果左右、上下都能无缝相接"""
    def one(a, axis):
        n = a.shape[axis]
        rolled = np.roll(a, n // 2, axis)
        w = np.clip(np.sin((np.arange(n) + 0.5) / n * np.pi) ** p * 1.25, 0, 1)
        sh = [1] * a.ndim; sh[axis] = n
        w = w.reshape(sh)
        return a * w + rolled * (1 - w)
    return one(one(img, 1), 0)
def highpass_normal(nrm, sigma=48):
    """只留局部起伏：法线的 xy 减去大尺度（高斯模糊）的部分，免得整片岩面的朝向混进细节法线"""
    from scipy.ndimage import gaussian_filter
    out = nrm.copy()
    for c in (0, 1):
        out[..., c] = nrm[..., c] - gaussian_filter(nrm[..., c], sigma, mode='wrap')
    out[..., 2] = np.sqrt(np.clip(1 - out[..., 0] ** 2 - out[..., 1] ** 2, 0.05, 1))
    return out
# ---------- 扫描岩体贴图 ----------
d = np.asarray(Image.open(SRC_D).convert('RGB').resize((2048, 2048), Image.LANCZOS), np.float32)
Image.fromarray(grade(d).astype(np.uint8)).save(os.path.join(OUT, 'ms_d.jpg'), quality=90)
n = np.load(os.path.join(TMP, 'nor.npy'))
Image.fromarray(np.clip(n * 255 + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'ms_n.jpg'), quality=92)
r = np.load(os.path.join(TMP, 'rough.npy'))[..., 0]
r = np.asarray(Image.fromarray(np.clip(r * 255 + 0.5, 0, 255).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS), np.float32)
rgb = np.stack([r * 0 + 255, r, r * 0], -1)               # three.js 从 G 通道读粗糙度
Image.fromarray(rgb.astype(np.uint8)).save(os.path.join(OUT, 'ms_r.jpg'), quality=92)
print('MS textures', os.path.getsize(os.path.join(OUT, 'ms_d.jpg')) // 1024, os.path.getsize(os.path.join(OUT, 'ms_n.jpg')) // 1024, os.path.getsize(os.path.join(OUT, 'ms_r.jpg')) // 1024, 'KB')

# ---------- 四方连续岩面（正投影烘焙）----------
bake = json.load(open(os.path.join(TMP, 'bake.json')))
A = np.load(os.path.join(TMP, 'front_albedo.npy'))       # 线性 RGBA
N = np.load(os.path.join(TMP, 'front_normal.npy'))
S = A.shape[0]; ppm = S / bake['ortho']                  # 每米像素
cov = A[..., 3] > 0.99
# 覆盖范围内最大的正方形（以覆盖区中心为准，逐步缩小直到全覆盖）
ys, xs = np.nonzero(cov); cy0, cx0 = int(ys.mean()), int(xs.mean())
side = int(7.5 * ppm)
while side > 200:
    y0, x0 = cy0 - side // 2, cx0 - side // 2
    if y0 >= 0 and x0 >= 0 and y0 + side <= S and x0 + side <= S and cov[y0:y0 + side, x0:x0 + side].all(): break
    side -= 8
print('TILE crop', side, 'px =', round(side / ppm, 2), 'm')
alb = A[y0:y0 + side, x0:x0 + side, :3]
alb = np.where(alb <= 0.0031308, alb * 12.92, 1.055 * np.power(np.clip(alb, 0, None), 1 / 2.4) - 0.055) * 255   # 线性 → sRGB
nrm = highpass_normal(N[y0:y0 + side, x0:x0 + side, :3] * 2 - 1)
tile_a = tileable(alb)
tile_n = tileable(nrm)
tile_n /= np.linalg.norm(tile_n, axis=-1, keepdims=True) + 1e-6
tile_a = grade(tile_a)
Image.fromarray(tile_a.astype(np.uint8)).resize((1024, 1024), Image.LANCZOS).save(os.path.join(TEX, 'mside_d.jpg'), quality=90)
Image.fromarray(np.clip((tile_n * 0.5 + 0.5) * 255 + 0.5, 0, 255).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS).save(os.path.join(TEX, 'mside_n.jpg'), quality=92)
json.dump({'tile_m': round(side / ppm, 3)}, open(os.path.join(OUT, 'tile.json'), 'w'))
print('TILE saved, metres per tile', round(side / ppm, 2))
