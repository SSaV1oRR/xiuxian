# 第十六轮：十二招联系表（每招两格：预警 / 出手），标注招式名
# 用法：python tools/r16_moves_sheet.py 输出.jpg
import sys, glob, os
from PIL import Image, ImageDraw, ImageFont

ORDER = [('claw1', '01 裂空龙爪'), ('claw2', '02 双爪追猎'), ('slam', '03 迟发碎岳'), ('tailsweep', '04 龙尾回扫'), ('combo3', '05 三段猎杀'),
         ('charge', '06 破阵冲撞'), ('jump', '07 跃空镇压'), ('breath', '08 紫焰吐息'), ('orbs', '09 龙息连珠'), ('thunder', '10 天罚落雷'),
         ('prison', '11 焚灵囚阵（二阶段）'), ('apocalypse', '12 灭世龙怒（二阶段）')]
w, h = 400, 225
cols = 4
cells = []
for key, name in ORDER:
    fs = sorted(glob.glob(f'docs/screenshots/r16_tmp_fin_{key}_*.jpg'))
    for i, f in enumerate(fs[:2]):
        cells.append((f, f'{name} · {"预警 / 前摇" if i == 0 else "出手"}'))
rows = (len(cells) + cols - 1) // cols
S = Image.new('RGB', (cols * w, rows * (h + 24)), (16, 14, 20))
d = ImageDraw.Draw(S)
try: font = ImageFont.truetype('msyh.ttc', 15)
except OSError: font = ImageFont.load_default()
for i, (f, cap) in enumerate(cells):
    x, y = (i % cols) * w, (i // cols) * (h + 24)
    S.paste(Image.open(f).convert('RGB').resize((w, h), Image.LANCZOS), (x, y))
    d.text((x + 6, y + h + 3), cap, fill=(232, 224, 255), font=font)
S.save(sys.argv[1], quality=86)
print(sys.argv[1], len(cells))
