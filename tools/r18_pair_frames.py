# 第十八轮：把前后两版的录像帧左右拼成一帧（左第十七轮、右第十八轮），写到单独的帧目录（Blender 从 docs/screenshots 直接编码会崩）
# 用法：python tools/r18_pair_frames.py 左帧前缀 右帧前缀 输出目录 [每格宽=960]
#   例：python tools/r18_pair_frames.py docs/screenshots/r18_tmp_mv_r17_ docs/screenshots/r18_tmp_mv_r18_ <scratch>/pair 960
import sys, glob, os
from PIL import Image

left, right, out = sys.argv[1], sys.argv[2], sys.argv[3]
W = int(sys.argv[4]) if len(sys.argv) > 4 else 960
L = sorted(glob.glob(left + '*.jpg'))
R = sorted(glob.glob(right + '*.jpg'))
assert L and R, 'no frames'
os.makedirs(out, exist_ok=True)
n = max(len(L), len(R))
im0 = Image.open(L[0])
H = int(W * im0.height / im0.width)
for i in range(n):
    S = Image.new('RGB', (W * 2 + 4, H), (10, 8, 14))
    for k, src in enumerate((L, R)):
        f = src[min(i, len(src) - 1)]
        S.paste(Image.open(f).convert('RGB').resize((W, H), Image.LANCZOS), (k * (W + 4), 0))
    S.save(os.path.join(out, f'pair_{i:04d}.jpg'), quality=90)
print(out, n, 'frames', S.size, 'left', len(L), 'right', len(R))
