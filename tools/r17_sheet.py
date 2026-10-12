# 第十七轮：把若干截图按给定顺序拼成联系表（每格下方标注文件名里的时刻）
# 用法：python tools/r17_sheet.py 输出.jpg 列数 每格宽 图1 图2 …（也可用通配符：docs/screenshots/r17_tmp_Sword_Regular_A_*.jpg）
import sys, glob, os
from PIL import Image, ImageDraw, ImageFont

out, cols, w = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
files = []
for a in sys.argv[4:]:
    g = sorted(glob.glob(a))
    files += g if g else [a]
im0 = Image.open(files[0])
h = int(w * im0.height / im0.width)
rows = (len(files) + cols - 1) // cols
S = Image.new('RGB', (cols * w, rows * (h + 22)), (16, 14, 20))
d = ImageDraw.Draw(S)
try: font = ImageFont.truetype('msyh.ttc', 14)
except OSError: font = ImageFont.load_default()
for i, f in enumerate(files):
    x, y = (i % cols) * w, (i // cols) * (h + 22)
    S.paste(Image.open(f).convert('RGB').resize((w, h), Image.LANCZOS), (x, y))
    d.text((x + 6, y + h + 3), os.path.basename(f).replace('r17_tmp_', '')[:-4], fill=(232, 224, 255), font=font)
S.save(out, quality=86)
print(out, len(files))
