# 第十六轮：把自检截图（docs/screenshots/r16_tmp_*.jpg）按前缀拼成联系表
# 用法：python tools/r16_sheet.py 输出名 前缀1 [前缀2 ...] [--cols 4] [--w 480]
import sys, glob, os
from PIL import Image, ImageDraw, ImageFont

args = sys.argv[1:]
cols, w = 4, 480
if '--cols' in args: i = args.index('--cols'); cols = int(args[i + 1]); del args[i:i + 2]
if '--w' in args: i = args.index('--w'); w = int(args[i + 1]); del args[i:i + 2]
out, prefixes = args[0], args[1:]
files = []
for p in prefixes:
    fs = glob.glob(f'docs/screenshots/r16_tmp_{p}_*.jpg')
    def key(f):
        t = os.path.basename(f)[len(f'r16_tmp_{p}_'):-4].replace('_', '.')
        try: return float(t)
        except ValueError: return 1e9
    files += sorted(fs, key=key)
h = int(w * 9 / 16)
rows = (len(files) + cols - 1) // cols
S = Image.new('RGB', (cols * w, rows * (h + 24)), (18, 16, 22))
d = ImageDraw.Draw(S)
try: font = ImageFont.truetype('msyh.ttc', 15)
except OSError: font = ImageFont.load_default()
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((w, h), Image.LANCZOS)
    x, y = (i % cols) * w, (i // cols) * (h + 24)
    S.paste(im, (x, y))
    d.text((x + 6, y + h + 3), os.path.basename(f)[8:-4], fill=(232, 224, 255), font=font)
S.save(out, quality=88)
print(out, len(files))
