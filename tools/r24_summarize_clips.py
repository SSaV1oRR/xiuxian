# 汇总每段动作：时长、剑尖速度pk（出手段）、各段的方向（横 / 竖 / 刺）、起止姿势、根位移
import json, sys, math
import numpy as np
D = json.load(open(sys.argv[1]))
FPS = 30.0
def seg_dir(tip, a, b, pel):
    # 角色朝 −Y；右手在 −X。转成角色系：前 = −Y、右 = −X、上 = Z
    d = np.array(tip[b]) - np.array(tip[a])
    fwd, right, up = -d[1], -d[0], d[2]
    ax = max((abs(fwd), 'F'), (abs(right), 'R'), (abs(up), 'U'))[1]
    if ax == 'F': s = 'THRUST' if fwd > 0 else 'PULL'
    elif ax == 'R': s = 'H>R' if right > 0 else 'H>L'
    else: s = 'UP' if up > 0 else 'DOWN'
    return s, (round(float(fwd), 2), round(float(right), 2), round(float(up), 2))
def pose_desc(tip, hilt, i):
    t = np.array(tip[i]); h = np.array(hilt[i])
    side = 'R' if t[0] < -0.15 else 'L' if t[0] > 0.15 else 'C'
    hgt = 'hi' if t[2] > 1.9 else 'lo' if t[2] < 1.0 else 'C'
    front = 'F' if -t[1] > 0.5 else 'B' if -t[1] < -0.2 else ''
    return f'{side}{hgt}{front}'
rows = []
for nm, r in D.items():
    tip = np.array(r['tip']); n = len(tip)
    v = np.zeros(n); v[1:] = np.linalg.norm(np.diff(tip, axis=0), axis=1) * FPS
    vs = np.convolve(v, np.ones(3) / 3, mode='same')
    thr = max(6.0, 0.45 * vs.max())
    act = vs > thr
    segs = []; i = 0
    while i < n:
        if act[i]:
            j = i
            while j + 1 < n and act[j + 1]: j += 1
            if j - i >= 1: segs.append((i, j))
            i = j + 1
        else: i += 1
    # 合并相隔 ≤ 2 帧的段
    m = []
    for s in segs:
        if m and s[0] - m[-1][1] <= 2: m[-1] = (m[-1][0], s[1])
        else: m.append(s)
    desc = []
    for a, b in m:
        dn, vec = seg_dir(tip, max(0, a - 1), b, r['pelvis'])
        pk = a + int(np.argmax(vs[a:b + 1]))
        desc.append(f'{dn}[{a}-{b} pk{pk} {vs[pk]:.0f}m/s]')
    root = r.get('root')
    rt = ''
    if root:
        last = root[-1]; rt = f'root fwd {-last[2]:.2f} right {-last[1]:.2f}'
    rows.append((nm, n, round(n / FPS, 2), pose_desc(r['tip'], r['hilt'], 0), pose_desc(r['tip'], r['hilt'], n - 1), ' '.join(desc), rt))
rows.sort(key=lambda x: (int(''.join(c for c in x[0].split('_')[0] if c.isdigit()) or 0), x[0]))
for row in rows: print(' | '.join(str(x) for x in row))
# 手中剑的本地变换的稳定性
HL = np.array([np.array(m) for r in D.values() for m in r['handLocal']])
t = HL[:, :3, 3]; ax = HL[:, :3, 1]
print('handLocal grip pos mean', t.mean(0).round(4), 'std', t.std(0).round(4))
print('handLocal axis mean', ax.mean(0).round(3), 'angle std deg', np.degrees(np.arccos(np.clip(ax @ (ax.mean(0) / np.linalg.norm(ax.mean(0))), -1, 1))).std().round(2))
