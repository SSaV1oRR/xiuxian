# 天空环境贴图修正：把 todRun 的四张截图（黎明、白天、黄昏、夜）拼成 2×2 联系表，每张下注时辰与环境贴图的平均亮度
# 用法：python tools/r27_skyenv_sheet.py 截图目录 前缀 输出.jpg 名=时辰=亮度 …（如 dawn=5.3=0.106）
import os, sys
from PIL import Image, ImageDraw, ImageFont

src, prefix, out = sys.argv[1], sys.argv[2], sys.argv[3]
items = [a.split('=') for a in sys.argv[4:]]
LABEL = {'dawn': '黎明', 'day': '白天', 'dusk': '黄昏', 'night': '夜'}
w, h, cols, pad = 960, 540, 2, 30
rows = (len(items) + cols - 1) // cols
S = Image.new('RGB', (cols * w, rows * (h + pad)), (16, 14, 20))
d = ImageDraw.Draw(S)
try: font = ImageFont.truetype('msyh.ttc', 18)
except OSError: font = ImageFont.load_default()
for i, (name, hour, lum) in enumerate(items):
    im = Image.open(os.path.join(src, f'{prefix}_{name}.jpg')).convert('RGB').resize((w, h), Image.LANCZOS)
    x, y = (i % cols) * w, (i // cols) * (h + pad)
    S.paste(im, (x, y))
    hh = float(hour)
    d.text((x + 8, y + h + 4), f'{LABEL.get(name, name)} {int(hh):02d}:{round(hh % 1 * 60):02d} · 调时辰后当帧重绘 · 环境贴图平均亮度 {lum}', fill=(232, 224, 255), font=font)
S.save(out, quality=88)
print(out, S.size)
