# 第二十七轮：把一组截图（docs/screenshots/<prefix>_<时刻 × 100>.jpg）拼成带时刻标注的联图（每张 9 格）
# 用法：python -I tools/r27_sheet.py <截图目录> <prefix> <输出前缀> [每格宽 480]
import sys, glob, os
from PIL import Image, ImageDraw, ImageFont

d, prefix, out = sys.argv[1], sys.argv[2], sys.argv[3]
w = int(sys.argv[4]) if len(sys.argv) > 4 else 480
h = w * 9 // 16
fs = sorted(glob.glob(os.path.join(d, prefix + '_*.jpg')))
try:
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 18)
except Exception:
    font = None
cols = 3
for part in range(0, len(fs), 9):
    sub = fs[part:part + 9]
    rows = (len(sub) + cols - 1) // cols
    sheet = Image.new('RGB', (w * cols, h * rows), (20, 20, 20))
    g = ImageDraw.Draw(sheet)
    for i, f in enumerate(sub):
        x, y = (i % cols) * w, (i // cols) * h
        sheet.paste(Image.open(f).convert('RGB').resize((w, h)), (x, y))
        t = os.path.basename(f)[len(prefix) + 1:-4]
        label = f'{int(t) / 100:.2f}s'
        g.rectangle((x + 4, y + 4, x + 74, y + 28), fill=(0, 0, 0))
        g.text((x + 8, y + 6), label, fill=(255, 210, 120), font=font)
    sheet.save(f'{out}_{part // 9 + 1}.jpg', quality=88)
print(len(fs))
