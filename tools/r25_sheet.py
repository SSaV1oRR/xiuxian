# 第二十五轮：把一组截图按文件名排序拼成一张联系表（每格左上角写上文件名里的标签）
# 用法：python -I tools/r25_sheet.py <目录> <前缀> <输出.jpg> [列数] [每格宽]
import sys, os, glob
from PIL import Image, ImageDraw

d, prefix, out = sys.argv[1], sys.argv[2], sys.argv[3]
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 6
cw = int(sys.argv[5]) if len(sys.argv) > 5 else 300
files = sorted(f for f in glob.glob(os.path.join(d, prefix + '*.jpg')) if not f.endswith('sheet.jpg'))
if not files:
    print('no files'); sys.exit(1)
ims = [Image.open(f).convert('RGB') for f in files]
w0, h0 = ims[0].size
ch = round(cw * h0 / w0)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cw, rows * ch), (20, 20, 24))
dr = ImageDraw.Draw(sheet)
for i, (f, im) in enumerate(zip(files, ims)):
    x, y = (i % cols) * cw, (i // cols) * ch
    sheet.paste(im.resize((cw, ch), Image.LANCZOS), (x, y))
    lab = os.path.basename(f)[len(prefix):-4]
    dr.rectangle([x, y, x + 8 * len(lab) + 8, y + 16], fill=(0, 0, 0))
    dr.text((x + 4, y + 2), lab, fill=(255, 220, 140))
sheet.save(out, quality=90)
print('saved', out, len(files), sheet.size)
