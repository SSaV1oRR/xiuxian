# 第十八轮：镇塔龙君头部朝向的前后对照表——上排第十七轮、下排第十八轮，各取待机 0.5 / 3 / 6 / 9 秒（9 秒时玩家挪到左前方）的头部特写
# 截图来自 tools/r18_boss_motion.js 的 headShots('r17' / 'r18')（docs/screenshots/r18_tmp_headcmp_*.jpg）
# 用法：python tools/r18_head_sheet.py docs/screenshots/r18_head_compare.jpg
import sys, os
from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1]
SRC = 'docs/screenshots/r18_tmp_headcmp_{}_{}.jpg'
TIMES = ['0.5 秒', '3 秒', '6 秒', '9 秒（玩家移到左前方）']
BOX = (290, 110, 690, 410)          # 960×540 截图里头部附近的一块
W, H = 400, 300
try:
    font = ImageFont.truetype('msyh.ttc', 18)
    small = ImageFont.truetype('msyh.ttc', 15)
except OSError:
    font = small = ImageFont.load_default()
pad, top, left = 6, 30, 120
S = Image.new('RGB', (left + 4 * (W + pad), top + 2 * (H + pad)), (16, 14, 20))
d = ImageDraw.Draw(S)
for c, t in enumerate(TIMES):
    d.text((left + c * (W + pad) + 8, 5), t, fill=(232, 224, 255), font=font)
for r, (tag, label) in enumerate([('r17', '第十七轮\n（修复前）'), ('r18', '第十八轮\n（修复后）')]):
    d.multiline_text((10, top + r * (H + pad) + H // 2 - 22), label, fill=(232, 224, 255), font=font, spacing=4)
    for c in range(4):
        f = SRC.format(tag, c)
        if not os.path.exists(f):
            continue
        im = Image.open(f).convert('RGB').crop(BOX).resize((W, H), Image.LANCZOS)
        S.paste(im, (left + c * (W + pad), top + r * (H + pad)))
d.text((10, S.height - 22), '', fill=(200, 190, 230), font=small)
S.save(out, quality=88)
print(out, S.size)
