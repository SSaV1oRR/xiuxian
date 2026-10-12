# 第二十七轮：「墨里终焉」的书法贴图——不用界面字体：按 Make Me a Hanzi 的笔画轮廓与中线（tools/r27_hanzi_strokes.json，Arphic Public License）逐笔「写」出来，
# 做出墨色浓淡（起笔按压的积墨、行笔渐淡、交叠处更浓）、笔锋（轮廓本身的尖锋 + 边缘的纸纤维毛糙）、飞白（长笔画后段、顺着行笔方向的干笔丝缕）、洇墨（笔画外一圈淡墨、湿笔处更开）。
# 输出 assets/converted/molizhongyan/calligraphy.png（512 × 2048：竖排「墨 里 终 焉」各占 512²）：
#   R 墨色浓度（0 淡 … 1 浓）；G 书写时刻（该字内 0 … 1：笔顺逐笔、每笔由起笔到收笔；洇墨比所在笔画略晚）；B 湿度（起笔、短笔画、交叠处高——书写前沿的润墨）；A 覆盖（含洇墨）。
#   calligraphy.json：各字的格子、笔画数、各笔在该字里的时段。
# 用法：python -I tools/r27_calligraphy.py <tools/r27_hanzi_strokes.json> <输出目录> [预览图]
import sys, os, json, re, math
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

SRC, OUT = sys.argv[1], sys.argv[2]
PREVIEW = sys.argv[3] if len(sys.argv) > 3 else None
SS = 2048           # 每字的渲染分辨率（em 1024 单位 → 2 倍）
CELL = 512          # 贴图里每字的格子
K = SS / 1024.0
rs = np.random.RandomState(27)
data = json.load(open(SRC, encoding='utf-8'))['chars']
ORDER = list('墨里终焉')


def flatten(path):
    # SVG 路径（M L Q C Z，绝对坐标）→ 多边形点列（em 单位，y 已翻成向下：900 − y）
    tok = re.findall(r'[MLQCZ]|-?\d+(?:\.\d+)?', path)
    pts, i, cur, cmd = [], 0, (0.0, 0.0), None
    def P(x, y): return (float(x), 900.0 - float(y))
    while i < len(tok):
        t = tok[i]
        if t in 'MLQCZ':
            cmd = t; i += 1
            if cmd == 'Z': continue
        if cmd == 'M' or cmd == 'L':
            cur = P(tok[i], tok[i + 1]); pts.append(cur); i += 2
        elif cmd == 'Q':
            c1 = P(tok[i], tok[i + 1]); e = P(tok[i + 2], tok[i + 3]); i += 4
            for k in range(1, 9):
                u = k / 8; a = (1 - u) ** 2; b = 2 * (1 - u) * u; c = u * u
                pts.append((a * cur[0] + b * c1[0] + c * e[0], a * cur[1] + b * c1[1] + c * e[1]))
            cur = e
        elif cmd == 'C':
            c1 = P(tok[i], tok[i + 1]); c2 = P(tok[i + 2], tok[i + 3]); e = P(tok[i + 4], tok[i + 5]); i += 6
            for k in range(1, 11):
                u = k / 10; a = (1 - u) ** 3; b = 3 * (1 - u) ** 2 * u; c = 3 * (1 - u) * u * u; d = u ** 3
                pts.append((a * cur[0] + b * c1[0] + c * c2[0] + d * e[0], a * cur[1] + b * c1[1] + c * c2[1] + d * e[1]))
            cur = e
        else:
            i += 1
    return pts


def noise2(shape, scale, seed):
    # 平滑噪声（低频网格双线性放大）0 … 1
    r = np.random.RandomState(seed)
    gh, gw = max(2, int(shape[0] / scale) + 2), max(2, int(shape[1] / scale) + 2)
    g = r.rand(gh, gw).astype(np.float32)
    return ndimage.zoom(g, (shape[0] / (gh - 1), shape[1] / (gw - 1)), order=3)[:shape[0], :shape[1]].clip(0, 1)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def render_char(ch, seed):
    S = data[ch]
    n = len(S['strokes'])
    H = W = SS
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cover = np.zeros((H, W), np.float32)     # 笔画覆盖
    dens = np.zeros((H, W), np.float32)      # 墨色浓度
    wet = np.zeros((H, W), np.float32)       # 湿度
    tmap = np.full((H, W), 9.0, np.float32)  # 书写时刻
    # 笔顺时段：每笔时长 ∝ 中线长度^0.7，笔与笔之间留一点提笔的空
    lens = []
    for med in S['medians']:
        m = np.array([(p[0], 900 - p[1]) for p in med], np.float32)
        lens.append(float(np.sum(np.linalg.norm(np.diff(m, axis=0), axis=1))) if len(m) > 1 else 10.0)
    dur = np.array([max(30.0, L) ** 0.7 for L in lens]); gap = 0.18 * dur.mean()
    total = dur.sum() + gap * (n - 1)
    sched, t = [], 0.0
    for i in range(n):
        sched.append((t / total, (t + dur[i]) / total)); t += dur[i] + gap
    fiber = noise2((H, W), 6, seed + 1) * 0.6 + noise2((H, W), 2.2, seed + 2) * 0.4      # 纸纤维
    tone = noise2((H, W), 160, seed + 3)                                                  # 墨色的大块浓淡
    for i, (path, med) in enumerate(zip(S['strokes'], S['medians'])):
        poly = [(x * K, y * K) for x, y in flatten(path)]
        im = Image.new('L', (W, H), 0); ImageDraw.Draw(im).polygon(poly, fill=255)
        mask = np.asarray(im, np.float32) / 255.0
        ys, xs = np.nonzero(mask > 0)
        if not len(xs):
            continue
        pad = 40
        y0, y1, x0, x1 = max(0, ys.min() - pad), min(H, ys.max() + pad), max(0, xs.min() - pad), min(W, xs.max() + pad)
        X, Y = xx[y0:y1, x0:x1], yy[y0:y1, x0:x1]
        m = np.array([(p[0] * K, (900 - p[1]) * K) for p in med], np.float32)
        if len(m) < 2:
            m = np.vstack([m, m + 1])
        seg = np.diff(m, axis=0); sl = np.linalg.norm(seg, axis=1) + 1e-6; cum = np.concatenate([[0], np.cumsum(sl)]); L = cum[-1]
        best = np.full(X.shape, 1e9, np.float32); s = np.zeros(X.shape, np.float32); off = np.zeros(X.shape, np.float32)
        for k in range(len(seg)):
            ax, ay = m[k]; dx, dy = seg[k] / sl[k]
            u = np.clip((X - ax) * dx + (Y - ay) * dy, 0, sl[k])
            px, py = ax + dx * u, ay + dy * u
            d = (X - px) ** 2 + (Y - py) ** 2
            sel = d < best
            best[sel] = d[sel]; s[sel] = ((cum[k] + u) / L)[sel]
            off[sel] = ((X - ax) * (-dy) + (Y - ay) * dx)[sel]
        mk = mask[y0:y1, x0:x1]
        # 局部半宽：笔画内的距离场在中线附近的值（按 s 分段取最大）
        dist_in = ndimage.distance_transform_edt(mk > 0.5)
        hw = np.zeros(X.shape, np.float32)
        bins = np.clip((s * 24).astype(int), 0, 23)
        for b in range(24):
            sel = (bins == b) & (mk > 0.5)
            if sel.any():
                hw[bins == b] = max(2.0, float(dist_in[sel].max()))
        across = np.clip(np.abs(off) / np.maximum(hw, 1), 0, 1.5)
        # 边缘的纸纤维毛糙：有符号距离 + 噪声
        sdf = ndimage.distance_transform_edt(mk > 0.5) - ndimage.distance_transform_edt(mk <= 0.5)
        fb = fiber[y0:y1, x0:x1]
        edge = smooth(-1.2, 1.2, sdf + (fb - 0.5) * 3.2)
        # 飞白：只在最后一段长的行笔里（折、钩之后的那一段；折角处是顿笔，墨足不飞白），由那一段的 45% 起渐干；短笔画（点）不飞白。
        # 丝缕顺着行笔方向：横向按随机宽度分成一条条「毛」，每条毛沿行笔方向时断时续，笔画边缘先干
        ang = np.arctan2(seg[:, 1], seg[:, 0])
        turns = [k for k in range(1, len(seg)) if abs((ang[k] - ang[k - 1] + np.pi) % (2 * np.pi) - np.pi) > 0.8]
        r0 = cum[turns[-1]] / L if turns else 0.0
        run = (1 - r0) * L / K
        long_k = smooth(200, 520, run)
        sr = np.clip((s - r0) / max(1e-3, 1 - r0), 0, 1) * (s >= r0)
        dry = smooth(0.45, 1.0, sr) * long_k
        streak_r = np.random.RandomState(seed * 31 + i)
        widths = streak_r.uniform(2.5, 9.0, 256); edges = np.concatenate([[0], np.cumsum(widths)]); edges -= edges[-1] / 2
        lane = np.clip(np.searchsorted(edges, off) - 1, 0, 255)
        lv = streak_r.rand(256).astype(np.float32); lph = streak_r.rand(256).astype(np.float32) * 50
        along = s * L / K
        brk = 0.5 + 0.5 * np.sin(along / (18 + 30 * lv[lane]) + lph[lane]) * np.sin(along / 7.3 + lph[lane] * 1.7)
        streak = lv[lane] * 0.55 + brk * 0.45
        gapk = dry * (0.5 + 0.5 * across)
        white = smooth(gapk - 0.1, gapk + 0.04, streak)
        c = edge * np.where(dry > 0.02, white, 1.0)
        c = np.clip(c, 0, 1)
        # 浓度：起笔积墨、行笔渐淡、收笔一点回锋；中段略带水（中心淡一点）
        D = 0.84 - 0.16 * s + 0.16 * (1 - smooth(0.0, 0.14, s)) + 0.06 * smooth(0.92, 1.0, s) - 0.12 * dry
        D = D - 0.08 * (1 - across) * smooth(0.2, 0.8, s) + 0.05 * smooth(0.6, 1.0, across) + (tone[y0:y1, x0:x1] - 0.5) * 0.16
        Wt = (1 - smooth(0.0, 0.3, s)) * 0.8 + (1 - long_k) * 0.4
        # 合进整字：覆盖取 1 − Π(1 − c)；浓度在交叠处叠深；时刻取早的
        T = sched[i][0] + (sched[i][1] - sched[i][0]) * s
        cv = cover[y0:y1, x0:x1]; dv = dens[y0:y1, x0:x1]; wv = wet[y0:y1, x0:x1]; tv = tmap[y0:y1, x0:x1]
        both = (cv > 0.05) & (c > 0.05)
        dn = np.where(c > 0.02, np.clip(D, 0.3, 1.0), 0)
        dv[:] = np.where(both, np.minimum(1.0, np.maximum(dv, dn) + 0.06), np.where(c > cv, dn, dv))
        wv[:] = np.maximum(wv, np.where(c > 0.05, np.clip(Wt, 0, 1), 0) + np.where(both, 0.25, 0))
        tv[:] = np.where(c > 0.08, np.minimum(tv, T), tv)
        cv[:] = 1 - (1 - cv) * (1 - c)
    # 洇墨：笔画外一圈淡墨（湿处更开），纸纤维把边缘打散
    core = cover > 0.35
    d_out, (iy, ix) = ndimage.distance_transform_edt(~core, return_indices=True)
    wet_near = wet[iy, ix]
    R = 8 + 14 * np.clip(wet_near, 0, 1)
    bleed = (1 - smooth(0, 1, d_out / R)) * (0.3 + 0.55 * fiber) * (d_out > 0)
    bleed = np.clip(bleed - 0.1, 0, 1) * 0.6
    A = np.clip(np.maximum(cover, bleed), 0, 1)
    Dn = np.where(cover > bleed, dens, 0.32 + 0.1 * fiber)
    Tm = np.where(tmap < 8, tmap, np.minimum(1.0, tmap[iy, ix] + 0.025))
    Tm = np.where(A > 0.01, Tm, 0)
    return A, np.clip(Dn, 0, 1), np.clip(wet, 0, 1), np.clip(Tm, 0, 1), sched


def down(a, n=CELL, resample=Image.LANCZOS):
    im = Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8))
    return np.asarray(im.resize((n, n), resample), np.float32) / 255.0


cells, meta = [], {'cell': CELL, 'order': ORDER, 'chars': []}
for k, ch in enumerate(ORDER):
    A, D, Wt, T, sched = render_char(ch, 100 + k * 17)
    # 下采样：覆盖、浓度、湿度用 Lanczos；书写时刻按覆盖加权平均（不让空白处的 0 把边缘的时刻拉早）
    a = down(A); d = down(D * A); wt = down(Wt * A); tA = down(T * A)
    eps = 1e-4
    d = np.where(a > eps, d / np.maximum(a, eps), 0); wt = np.where(a > eps, wt / np.maximum(a, eps), 0); t = np.where(a > eps, tA / np.maximum(a, eps), 0)
    cells.append(np.dstack([d, t, wt, a]))
    meta['chars'].append({'ch': ch, 'strokes': len(sched), 'sched': [[round(x, 4), round(y, 4)] for x, y in sched]})
    print('CHAR', ch.encode('unicode_escape').decode(), len(sched), 'cover', round(float(a.mean()), 3))
img = np.vstack(cells)
out = Image.fromarray(np.clip(img * 255 + 0.5, 0, 255).astype(np.uint8), 'RGBA')
os.makedirs(OUT, exist_ok=True)
out.save(os.path.join(OUT, 'calligraphy.png'), optimize=True)
json.dump(meta, open(os.path.join(OUT, 'calligraphy.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if PREVIEW:
    # 预览：宣纸色上按浓度着墨（书写到一半、写完两张并排）
    paper = np.array([216, 208, 190], np.float32) / 255; ink = np.array([16, 21, 27], np.float32) / 255; gray = np.array([70, 80, 90], np.float32) / 255
    def comp(prog):
        a = img[..., 3] * (img[..., 1] <= prog); d = img[..., 0]
        col = gray[None, None, :] * (1 - d[..., None]) + ink[None, None, :] * d[..., None]
        return paper[None, None, :] * (1 - a[..., None]) + col * a[..., None]
    pv = np.hstack([comp(0.55), comp(1.01)])
    Image.fromarray(np.clip(pv * 255, 0, 255).astype(np.uint8)).save(PREVIEW)
print('DONE')
