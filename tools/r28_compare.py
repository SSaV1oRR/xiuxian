# 第二十八轮：龙凤砸入的改前改后对照——同一份录像脚本录下的两段帧（第二十七轮的定稿、本轮）。
# 两段录像的时间线逐帧对得上（同样的输入、同样的演出时间线），同一帧号就是同一个演出时刻（第 k 帧 ≈ 演出 k / 30 − 4.167 秒）。
# 用法：
#   录像：python -I tools/r28_compare.py video <改前帧目录> <改前前缀> <改后帧目录> <改后前缀> <改后配音.wav> <输出目录> <起帧> <止帧> [帧率=30]
#     输出 <输出目录>/cmp_00000.jpg …（1920×540：左改前、右改后，下角标注）与 <输出目录>/cmp_audio.wav（改后配音的同一段），再用 Blender 编码：
#     blender -b --factory-startup --python tools/r16_encode.py -- <输出目录> cmp_ <输出.mp4> 30 1920 540 audio=<输出目录>/cmp_audio.wav
#   截图：python -I tools/r28_compare.py still <改前帧目录> <改前前缀> <改后帧目录> <改后前缀> <输出.jpg> <演出时刻,…> [偏移=4.167]
#     上一行改前、下一行改后，每列一个演出时刻
#   多行：python -I tools/r28_compare.py rows <输出.jpg> <演出时刻,…> <偏移> <标注1> <帧目录1> <前缀1> [<标注2> <帧目录2> <前缀2> …]
#     每行一段录像（左边写标注），每列一个演出时刻——例如第二十七轮、本轮第一版、本轮定稿
import sys, os, wave
from PIL import Image, ImageDraw, ImageFont


def font(n):
    try:
        return ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', n)
    except OSError:
        return ImageFont.load_default()


LABELS = (('改前 · 第二十七轮', (200, 200, 200)), ('改后 · 第二十八轮：墨震', (255, 210, 120)))


def frame(d, pre, k):
    f = os.path.join(d, f'{pre}{k:05d}.jpg')
    return Image.open(f).convert('RGB') if os.path.exists(f) else None


def tag(g, x0, y0, txt, col, fnt):
    tw = g.textlength(txt, font=fnt)
    g.rectangle((x0 - 8, y0 - 5, x0 + tw + 8, y0 + fnt.size + 9), fill=(0, 0, 0, 150))
    g.text((x0, y0), txt, fill=col, font=fnt)


def video(bdir, bpre, adir, apre, awav, out, a, b, fps=30):
    os.makedirs(out, exist_ok=True)
    W, H, fnt, n = 960, 540, font(22), 0
    for k in range(a, b + 1):
        ims = (frame(bdir, bpre, k), frame(adir, apre, k))
        if not all(ims):
            print('missing frame', k); break
        S = Image.new('RGB', (W * 2, H), (10, 8, 14))
        for i, im in enumerate(ims):
            S.paste(im if im.size == (W, H) else im.resize((W, H), Image.LANCZOS), (i * W, 0))
        g = ImageDraw.Draw(S, 'RGBA')
        g.rectangle((W - 1, 0, W, H), fill=(10, 8, 14, 255))                 # 中缝
        for i, (txt, col) in enumerate(LABELS):
            tag(g, i * W + 14, H - 42, txt, col, fnt)
        S.save(os.path.join(out, f'cmp_{n:05d}.jpg'), quality=92)
        n += 1
    # 声音：改后配音里与这段帧同一段（第 a 帧的开头到第 b 帧的末尾）
    with wave.open(awav, 'rb') as src:
        sr, ch, sw = src.getframerate(), src.getnchannels(), src.getsampwidth()
        s0, s1 = round(a / fps * sr), round((b + 1) / fps * sr)
        src.setpos(min(s0, src.getnframes()))
        data = src.readframes(max(0, min(s1, src.getnframes()) - s0))
    with wave.open(os.path.join(out, 'cmp_audio.wav'), 'wb') as dst:
        dst.setnchannels(ch); dst.setsampwidth(sw); dst.setframerate(sr); dst.writeframes(data)
    print(out, n, 'frames', (W * 2, H), 'audio', round(len(data) / (sw * ch) / sr, 3), 's')


def still(bdir, bpre, adir, apre, outp, times, off=4.167):
    W, H, top, side = 480, 270, 30, 30
    f1, f2 = font(17), font(15)
    G = Image.new('RGB', (side + W * len(times), top + H * 2), (12, 10, 14))
    g = ImageDraw.Draw(G, 'RGBA')
    for i, t in enumerate(times):
        k = round((t + off) * 30)
        g.text((side + i * W + 8, 5), f'演出 {t:.2f} 秒', fill=(255, 220, 150), font=f1)
        for r, (d, p) in enumerate(((bdir, bpre), (adir, apre))):
            im = frame(d, p, k)
            if im:
                G.paste(im.resize((W, H), Image.LANCZOS), (side + i * W, top + r * H))
    for r, (txt, col) in enumerate(LABELS):                                  # 左边竖排：改前 / 改后
        y = top + r * H + 10
        for j, ch in enumerate(txt.split(' · ')[0]):
            g.text((7, y + j * 20), ch, fill=col, font=f2)
    G.save(outp, quality=90)
    print(outp, G.size, 'times', times)


def rows(outp, times, off, specs):
    W, H, top, side = 480, 270, 30, 30
    f1, f2 = font(17), font(15)
    G = Image.new('RGB', (side + W * len(times), top + H * len(specs)), (12, 10, 14))
    g = ImageDraw.Draw(G, 'RGBA')
    for i, t in enumerate(times):
        k = round((t + off) * 30)
        g.text((side + i * W + 8, 5), f'演出 {t:.2f} 秒', fill=(255, 220, 150), font=f1)
        for r, (lab, d, p) in enumerate(specs):
            im = frame(d, p, k)
            if im:
                G.paste(im.resize((W, H), Image.LANCZOS), (side + i * W, top + r * H))
    for r, (lab, d, p) in enumerate(specs):
        for j, ch in enumerate(lab):
            g.text((7, top + r * H + 10 + j * 20), ch, fill=(255, 210, 120) if r == len(specs) - 1 else (200, 200, 200), font=f2)
    G.save(outp, quality=90)
    print(outp, G.size, 'rows', len(specs), 'times', times)


if __name__ == '__main__':
    mode, A = sys.argv[1], sys.argv[2:]
    if mode == 'video':
        video(*A[:6], int(A[6]), int(A[7]), int(A[8]) if len(A) > 8 else 30)
    elif mode == 'still':
        still(*A[:5], [float(x) for x in A[5].split(',')], float(A[6]) if len(A) > 6 else 4.167)
    elif mode == 'rows':
        rest = A[3:]
        rows(A[0], [float(x) for x in A[1].split(',')], float(A[2]), [tuple(rest[i:i + 3]) for i in range(0, len(rest) - 2, 3)])
    else:
        sys.exit('mode: video | still | rows')
