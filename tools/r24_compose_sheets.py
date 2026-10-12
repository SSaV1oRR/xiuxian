# 把每段动作的帧拼成一行，叠画剑尖轨迹（灰：整段；橙：到这一帧为止；红点：这一帧的剑尖）；每张图放几段动作
import json, sys, os, glob
import numpy as np
from PIL import Image, ImageDraw, ImageFont
D, CL, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
per = int(sys.argv[4]) if len(sys.argv) > 4 else 4
proj = json.load(open(os.path.join(D, 'proj.json')))
clips = json.load(open(CL))
F = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 13)
names = list(proj.keys())
os.makedirs(OUT, exist_ok=True)
pages = [names[i:i + per] for i in range(0, len(names), per)]
for pi, page in enumerate(pages):
    rows = []
    for nm in page:
        files = sorted(glob.glob(os.path.join(D, f'{nm}__*.png')))
        if not files: continue
        P = proj[nm]; tip = np.array(P['tip']); f0 = P['f0']
        if nm in clips: r = clips[nm]; t3 = np.array(r['tip']); v = np.zeros(len(t3)); v[1:] = np.linalg.norm(np.diff(t3, axis=0), axis=1) * 30
        else: v = np.zeros(len(tip))
        ims = []
        for fp in files:
            f = int(os.path.basename(fp).split('__')[1][:3]); i = f - f0
            im = Image.open(fp).convert('RGB'); W, H = im.size; g = ImageDraw.Draw(im)
            xy = [(x * W, y * H) for x, y in tip]
            g.line(xy, fill=(150, 150, 150), width=1)
            for j in range(1, min(i + 1, len(xy))):
                col = (230, 40, 30) if v[j] > 18 else (240, 150, 40)
                g.line([xy[j - 1], xy[j]], fill=col, width=3 if v[j] > 18 else 2)
            if 0 <= i < len(xy): g.ellipse([xy[i][0] - 4, xy[i][1] - 4, xy[i][0] + 4, xy[i][1] + 4], fill=(255, 255, 0), outline=(0, 0, 0))
            g.rectangle([0, 0, W, 18], fill=(20, 20, 20))
            g.text((4, 1), f'{nm}  f{f}  {(f - f0) / 30:.2f}s  v{v[i]:.0f}', fill=(255, 230, 120), font=F)
            ims.append(im)
        row = Image.new('RGB', (sum(i.width for i in ims), ims[0].height), (0, 0, 0)); x = 0
        for im in ims: row.paste(im, (x, 0)); x += im.width
        rows.append(row)
    Wm = max(r.width for r in rows); sheet = Image.new('RGB', (Wm, sum(r.height for r in rows)), (0, 0, 0)); y = 0
    for r in rows: sheet.paste(r, (0, y)); y += r.height
    sheet.save(os.path.join(OUT, f'clips_{pi:02d}.jpg'), quality=88)
    print('PAGE', pi, page)
