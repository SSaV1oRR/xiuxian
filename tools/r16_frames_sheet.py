# 第十六轮：从录下的帧里等距取若干帧拼成联系表（「实际运行的连续截图」）
# 用法：python tools/r16_frames_sheet.py 帧目录 前缀 输出.jpg 取帧数 [列数=4] [每帧宽=480] [帧率=20]（第十七轮的录像为 30 帧/秒）
import sys, glob, os
from PIL import Image, ImageDraw, ImageFont

src, prefix, out, n = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
cols = int(sys.argv[5]) if len(sys.argv) > 5 else 4
w = int(sys.argv[6]) if len(sys.argv) > 6 else 480
fps = float(sys.argv[7]) if len(sys.argv) > 7 else 20
fs = sorted(glob.glob(os.path.join(src, prefix + '*.jpg')))
pick = [fs[round(i * (len(fs) - 1) / max(1, n - 1))] for i in range(n)]
h = int(w * 9 / 16)
rows = (n + cols - 1) // cols
S = Image.new('RGB', (cols * w, rows * (h + 22)), (16, 14, 20))
d = ImageDraw.Draw(S)
try: font = ImageFont.truetype('msyh.ttc', 14)
except OSError: font = ImageFont.load_default()
for i, f in enumerate(pick):
    im = Image.open(f).convert('RGB').resize((w, h), Image.LANCZOS)
    x, y = (i % cols) * w, (i // cols) * (h + 22)
    S.paste(im, (x, y))
    k = int(os.path.basename(f)[len(prefix):-4])
    d.text((x + 6, y + h + 3), f'#{k:04d} · {k / fps:.1f}s', fill=(232, 224, 255), font=font)
S.save(out, quality=86)
print(out, len(fs), 'frames ->', n)
