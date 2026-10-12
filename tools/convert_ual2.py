# 第十四轮：Quaternius「Universal Animation Library 2 [Standard]」（CC0，assets/fighting）→ 程序化修士骨架可直接套用的动作数据。
#
# 做法（重定向，在这里一次算好，运行时只剩查表与插值）：
#   · 动作库的骨架是 UE 式的 65 根骨（T 字静止姿势，面朝 +Z，左侧在 +X）；修士与同门的骨架是程序化的
#     骨盆 / 胸 / 头 / 肩肘腕 / 髋膝踝（静止时双臂下垂，每个关节的静止旋转都是单位）。两边朝向、左右一致，比例相近。
#   · 每根目标骨取对应的源骨，算出源骨在动作中相对其静止姿势的世界旋转变化 D(t) = Q(t)·Q静止⁻¹，
#     再乘上「把目标骨的静止姿势摆成源骨静止姿势」的对齐旋转 A（手臂：由下垂抬成 T 字；手：掌心对掌心；
#     躯干、头、脚两边静止时都是直立、脚掌平放，A 取单位），得到目标骨在角色空间里的世界旋转 D(t)·A。
#   · 骨盆另存相对静止的位移（米）。
#   · 30 帧 / 秒，四元数与位移量化为 Int16（四元数 ×32767，位移按毫米），每帧 15 根骨 × 4 + 3 = 63 个数。
# 输出：assets/converted/anim/ual2_combat.json（骨名、父子、各动作的帧数与偏移、出手时刻提示、握剑方向）
#       assets/converted/anim/ual2_combat.bin（Int16）
# 用法：python -I tools/convert_ual2.py
import json, os, struct, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'fighting', 'Universal Animation Library 2[Standard]', 'Universal Animation Library 2[Standard]', 'Unreal-Godot', 'UAL2_Standard.glb')
OUT = os.path.join(ROOT, 'assets', 'converted', 'anim')

CLIPS = [
    # 玩家剑术（combatConfig.js 的 MOVES）
    'Sword_Regular_A', 'Sword_Regular_A_Rec', 'Sword_Regular_B', 'Sword_Regular_B_Rec', 'Sword_Regular_C',
    'Sword_Heavy_Combo', 'Sword_Dash', 'Sword_Block', 'OverhandThrow', 'Hit_Knockback', 'LayToIdle', 'Consume',
    # 魔修（combatConfig.js 的 ENEMIES[*].anim；术士、魔将也用上面的 OverhandThrow、Sword_Regular_B、Sword_Heavy_Combo）
    'Melee_Hook', 'Zombie_Scratch',
]
# 只转用得到的。库里另有可直接加进来的：Sword_Regular_Combo、NinjaJump_*（起跳 / 空中 / 落地）、Slide_*（滑步）、
# Shield_*、Idle_FoldArms_Loop、Yes、Idle_No_Loop 等，加名字重跑即可（运行时按名字取）。

# 目标骨（修士骨架）：名、父、对应源骨、对齐方式
#   kind 'body'：静止姿势两边相同（直立、脚平放），A = 单位
#   kind 'limb'：按骨的走向（到子骨）与参考方向对齐；'hand'：按骨的走向与掌心朝向对齐
BONES = [
    ('pelvis', -1, 'pelvis', 'body'),
    ('chest', 0, 'spine_03', 'body'),
    ('head', 1, 'Head', 'body'),
    ('sh_l', 1, 'upperarm_l', 'limb'), ('el_l', 3, 'lowerarm_l', 'limb'), ('wr_l', 4, 'hand_l', 'hand'),
    ('sh_r', 1, 'upperarm_r', 'limb'), ('el_r', 6, 'lowerarm_r', 'limb'), ('wr_r', 7, 'hand_r', 'hand'),
    ('hip_l', 0, 'thigh_l', 'limb'), ('knee_l', 9, 'calf_l', 'limb'), ('ankle_l', 10, 'foot_l', 'body'),
    ('hip_r', 0, 'thigh_r', 'limb'), ('knee_r', 12, 'calf_r', 'limb'), ('ankle_r', 13, 'foot_r', 'body'),
]
CHILD = {'upperarm_l': 'lowerarm_l', 'lowerarm_l': 'hand_l', 'hand_l': 'middle_01_l',
         'upperarm_r': 'lowerarm_r', 'lowerarm_r': 'hand_r', 'hand_r': 'middle_01_r',
         'thigh_l': 'calf_l', 'calf_l': 'foot_l', 'thigh_r': 'calf_r', 'calf_r': 'foot_r'}


def load_glb(path):
    b = open(path, 'rb').read()
    off = 12; js = None; bin_ = None
    while off < len(b):
        cl, ct = struct.unpack_from('<II', b, off); off += 8
        chunk = b[off:off + cl]; off += cl
        if ct == 0x4E4F534A: js = json.loads(chunk)
        elif ct == 0x004E4942: bin_ = chunk
    return js, bin_


NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def accessor(js, bin_, i):
    a = js['accessors'][i]; bv = js['bufferViews'][a['bufferView']]
    assert a['componentType'] == 5126, '只处理浮点数据'
    n = NC[a['type']]; off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', n * 4)
    if stride == n * 4:
        return np.frombuffer(bin_, dtype='<f4', count=a['count'] * n, offset=off).reshape(a['count'], n).astype(np.float64)
    return np.stack([np.frombuffer(bin_, dtype='<f4', count=n, offset=off + k * stride) for k in range(a['count'])]).astype(np.float64)


def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return np.array([aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz])


def qinv(q): return np.array([-q[0], -q[1], -q[2], q[3]])


def qrot(q, v): return qmul(qmul(q, np.array([v[0], v[1], v[2], 0.0])), qinv(q))[:3]


def slerp(a, b, t):
    d = float(np.dot(a, b))
    if d < 0: b = -b; d = -d
    if d > 0.9995: q = a * (1 - t) + b * t
    else:
        th = np.arccos(d); s = np.sin(th)
        q = a * np.sin((1 - t) * th) / s + b * np.sin(t * th) / s
    return q / np.linalg.norm(q)


def mat2quat(m):
    t = m[0, 0] + m[1, 1] + m[2, 2]
    if t > 0:
        s = np.sqrt(t + 1.0) * 2
        return np.array([(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, 0.25 * s])
    if m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        return np.array([0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s])
    if m[1, 1] > m[2, 2]:
        s = np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        return np.array([(m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s])
    s = np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
    return np.array([(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s, (m[1, 0] - m[0, 1]) / s])


def frame(d, r):
    """以骨的走向 d 为 y 轴、参考方向 r 去掉沿 d 的分量为 z 轴的正交基（列向量）"""
    y = d / np.linalg.norm(d)
    z = r - np.dot(r, y) * y; z /= np.linalg.norm(z)
    x = np.cross(y, z)
    return np.stack([x, y, z], 1)


def main():
    js, B = load_glb(SRC)
    nodes = js['nodes']
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []): parent[c] = i
    idx = {n.get('name'): i for i, n in enumerate(nodes)}
    anims = {a['name']: a for a in js['animations']}

    def rest_local(i):
        n = nodes[i]
        return np.array(n.get('translation', [0, 0, 0]), float), np.array(n.get('rotation', [0, 0, 0, 1]), float)

    def world_pose(local):          # local(i) → (t, r)；返回所有节点的世界 (t, r)
        W = {}
        def w(i):
            if i in W: return W[i]
            t, r = local(i)
            if i in parent:
                pt, pr = w(parent[i]); W[i] = (pt + qrot(pr, t), qmul(pr, r))
            else: W[i] = (t, r)
            return W[i]
        for i in range(len(nodes)): w(i)
        return W

    REST = world_pose(rest_local)

    # 对齐旋转 A（目标静止 → 源静止）
    A = {}
    T_DOWN, FWD, UP = np.array([0, -1.0, 0]), np.array([0, 0, 1.0]), np.array([0, 1.0, 0])
    for tn, tp, sn, kind in BONES:
        if kind == 'body': A[tn] = np.array([0, 0, 0, 1.0]); continue
        si = idx[sn]
        dS = REST[idx[CHILD[sn]]][0] - REST[si][0]
        if kind == 'limb':
            M = frame(dS, FWD) @ frame(T_DOWN, FWD).T
        else:   # 手：源掌心朝下（T 字静止），修士的手指朝 -Z 一侧蜷（掌心朝后）
            M = frame(dS, -UP) @ frame(T_DOWN, -FWD).T
        A[tn] = mat2quat(M)
    # 握剑方向：源手握剑时剑身从拇指一侧伸出，静止（T 字、掌心朝下）时朝 +Z；换到修士腕部的本地方向
    blade = {s: qrot(qinv(A['wr_' + s]), FWD).round(4).tolist() for s in 'lr'}

    meta = {'source': 'Quaternius · Universal Animation Library 2 [Standard] (CC0 1.0)', 'fps': 30,
            'bones': [b[0] for b in BONES], 'parents': [b[1] for b in BONES], 'src': [b[2] for b in BONES],
            'blade': blade, 'pelvisRest': REST[idx['pelvis']][0].round(4).tolist(), 'clips': {}}
    data = []
    offset = 0
    for nm in CLIPS:
        a = anims[nm]
        ch = {}
        dur = 0.0
        for c in a['channels']:
            s = a['samplers'][c['sampler']]
            t = accessor(js, B, s['input'])[:, 0]; v = accessor(js, B, s['output'])
            assert s.get('interpolation', 'LINEAR') == 'LINEAR'
            ch[(c['target']['node'], c['target']['path'])] = (t, v)
            dur = max(dur, float(t[-1]))
        nf = int(round(dur * 30)) + 1
        hand_r = []
        for f in range(nf):
            tt = min(dur, f / 30)

            def local(i):
                t0, r0 = rest_local(i)
                out = []
                for path, dflt in (('translation', t0), ('rotation', r0)):
                    k = (i, path)
                    if k not in ch: out.append(dflt); continue
                    t, v = ch[k]
                    if tt <= t[0]: out.append(v[0]); continue
                    if tt >= t[-1]: out.append(v[-1]); continue
                    j = int(np.searchsorted(t, tt)) - 1; u = (tt - t[j]) / (t[j + 1] - t[j])
                    out.append(slerp(v[j], v[j + 1], u) if path == 'rotation' else v[j] * (1 - u) + v[j + 1] * u)
                return out
            W = world_pose(local)
            row = []
            for tn, tp, sn, kind in BONES:
                si = idx[sn]
                D = qmul(W[si][1], qinv(REST[si][1]))
                q = qmul(D, A[tn]); q /= np.linalg.norm(q)
                if q[3] < 0: q = -q
                row.extend(np.round(q * 32767).astype(int).tolist())
            dp = W[idx['pelvis']][0] - REST[idx['pelvis']][0]
            row.extend(np.round(dp * 1000).astype(int).tolist())
            data.append(row)
            hand_r.append(W[idx['hand_r']][0])
        # 出手时刻提示：右手速度的峰值（> 12 米/秒）
        hr = np.array(hand_r)
        sp = np.linalg.norm(np.diff(hr, axis=0), axis=1) * 30
        peaks = [round((i + 0.5) / 30, 3) for i in range(1, len(sp) - 1) if sp[i] > sp[i - 1] and sp[i] >= sp[i + 1] and sp[i] > 12]
        meta['clips'][nm] = {'frames': nf, 'offset': offset, 'dur': round(dur, 4), 'peaks': peaks}
        offset += nf
    arr = np.array(data, dtype=np.int16)
    os.makedirs(OUT, exist_ok=True)
    arr.tofile(os.path.join(OUT, 'ual2_combat.bin'))
    meta['stride'] = int(arr.shape[1]); meta['totalFrames'] = int(arr.shape[0])
    with open(os.path.join(OUT, 'ual2_combat.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print('clips', len(CLIPS), 'frames', arr.shape, 'bytes', arr.nbytes, 'blade', blade)


if __name__ == '__main__':
    main()
