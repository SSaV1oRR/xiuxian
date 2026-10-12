# 第十五轮：金白修士（assets/figure/gold_cultivator_v1_model_only/gold_cultivator.glb，原文件只读不改）→ 游戏用的 glb
#
# 素材实情（逐项读文件核对过）：
#   · 一个蒙皮网格 output（121,480 顶点 / 184,994 三角形），一套烘焙材质 BakedMaterial（底色、法线、金属度-粗糙度三张 4096² PNG，
#     KHR_materials_specular 关掉了非金属的镜面反射），不透明、单面；人高 1.72 米，脚底在 y = 0，面朝 +Z，左手在 +X。
#   · 骨骼是 Mixamo 式的 28 根（无手指），绑定姿势即节点静止姿势（A 字，双臂下垂约 70°）。
#   · 自带 10 段动作：Running、Walking、Lean_Forward_Sprint、Male_Bend_Over_Pick_Up、Punch_Pose、Sit_Cross_Legged_on_Floor、
#     Standard_Forward_Charge、Thrust_Slash、Wall_Support_Jump_to_Ground、dying_backwards（30 帧/秒，线性插值）。
#     没有待机、格挡、受击，剑招只有 Thrust_Slash 一段。
#
# 本脚本：
#   1. 网格、蒙皮、骨骼原样保留；贴图缩到 2048（底色、金属度-粗糙度、法线都存 JPEG，4:4:4 不做色度抽样）；另出一份 1024 的给流畅画质。
#   2. 自带动作保留；根运动片段（Lean_Forward_Sprint、Standard_Forward_Charge）减去骨盆的匀速前移，改成原地；
#      除骨盆以外各骨的位移轨道在动作中不变（就是骨长），删掉。
#   3. 把第十四轮用的 UAL2 动作库（assets/fighting，CC0）重定向到这副骨骼：剑招、格挡、受击、起身、服丹、掷剑、跳跃、采摘等。
#      做法与 tools/convert_ual2.py 同理：源骨在动作中相对其静止姿势（T 字）的世界旋转变化 D(t) = Q(t)·Q静止⁻¹，
#      乘上「把目标骨的静止姿势（A 字）摆到源骨静止姿势」的对齐旋转 A，得到目标骨的世界旋转 D(t)·A·R静止，再换成相对父骨的本地旋转；
#      对齐旋转按「骨的走向 + 参考方向」建正交基求得（四肢、躯干参考朝前，脚参考朝上）。骨盆位移按两边髋高之比缩放。
#   4. 另做两段静态姿势：Idle（取 UAL2 收势动作末帧的站姿，叠一点呼吸起伏）与 Fly（御剑站姿），也写成动作。
# 输出：tools/_build/cultivator_full.glb、cultivator_lo.glb（再由 tools/convert_cultivator.mjs 量化、减面后写到 assets/converted/figure/）
# 用法：python -I tools/convert_cultivator.py
import json, os, struct, io, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIG = os.path.join(ROOT, 'assets', 'figure', 'gold_cultivator_v1_model_only', 'gold_cultivator.glb')
UAL = os.path.join(ROOT, 'assets', 'fighting', 'Universal Animation Library 2[Standard]', 'Universal Animation Library 2[Standard]', 'Unreal-Godot', 'UAL2_Standard.glb')
BUILD = os.path.join(ROOT, 'tools', '_build')
FPS = 30

# 目标骨 ← 源骨；kind：body（躯干，参考朝前）/ limb（四肢，参考朝前）/ foot（脚，参考朝上）
MAP = [
    ('Hips', 'pelvis', 'body'), ('Spine', 'spine_01', 'body'), ('Spine1', 'spine_02', 'body'), ('Spine2', 'spine_03', 'body'),
    ('Neck', 'neck_01', 'body'), ('Head', 'Head', 'head'),
    ('LeftShoulder', 'clavicle_l', 'limb'), ('LeftArm', 'upperarm_l', 'limb'), ('LeftForeArm', 'lowerarm_l', 'limb'), ('LeftHand', 'hand_l', 'limb'),
    ('RightShoulder', 'clavicle_r', 'limb'), ('RightArm', 'upperarm_r', 'limb'), ('RightForeArm', 'lowerarm_r', 'limb'), ('RightHand', 'hand_r', 'limb'),
    ('LeftUpLeg', 'thigh_l', 'limb'), ('LeftLeg', 'calf_l', 'limb'), ('LeftFoot', 'foot_l', 'foot'), ('LeftToeBase', 'ball_l', 'foot'),
    ('RightUpLeg', 'thigh_r', 'limb'), ('RightLeg', 'calf_r', 'limb'), ('RightFoot', 'foot_r', 'foot'), ('RightToeBase', 'ball_r', 'foot'),
]
# 求骨的走向用的子骨
T_CHILD = {'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Head', 'Head': 'HeadTop_End',
           'LeftShoulder': 'LeftArm', 'LeftArm': 'LeftForeArm', 'LeftForeArm': 'LeftHand', 'LeftHand': 'LeftHandMiddle4',
           'RightShoulder': 'RightArm', 'RightArm': 'RightForeArm', 'RightForeArm': 'RightHand', 'RightHand': 'RightHandMiddle4',
           'LeftUpLeg': 'LeftLeg', 'LeftLeg': 'LeftFoot', 'LeftFoot': 'LeftToeBase', 'LeftToeBase': 'LeftToe_End',
           'RightUpLeg': 'RightLeg', 'RightLeg': 'RightFoot', 'RightFoot': 'RightToeBase', 'RightToeBase': 'RightToe_End'}
S_CHILD = {'pelvis': 'spine_01', 'spine_01': 'spine_02', 'spine_02': 'spine_03', 'spine_03': 'neck_01', 'neck_01': 'Head', 'Head': None,
           'clavicle_l': 'upperarm_l', 'upperarm_l': 'lowerarm_l', 'lowerarm_l': 'hand_l', 'hand_l': 'middle_01_l',
           'clavicle_r': 'upperarm_r', 'upperarm_r': 'lowerarm_r', 'lowerarm_r': 'hand_r', 'hand_r': 'middle_01_r',
           'thigh_l': 'calf_l', 'calf_l': 'foot_l', 'foot_l': 'ball_l', 'ball_l': 'ball_leaf_l',
           'thigh_r': 'calf_r', 'calf_r': 'foot_r', 'foot_r': 'ball_r', 'ball_r': 'ball_leaf_r'}
PFX = 'mixamorig:'

# 重定向的 UAL2 动作（名字不变）：第十四轮剑招与受击，加上跳跃、采摘、失衡
UAL_CLIPS = ['Sword_Regular_A', 'Sword_Regular_A_Rec', 'Sword_Regular_B', 'Sword_Regular_B_Rec', 'Sword_Regular_C', 'Sword_Regular_Combo',
             'Sword_Heavy_Combo', 'Sword_Dash', 'Sword_Block', 'OverhandThrow', 'Hit_Knockback', 'LayToIdle', 'Consume',
             'NinjaJump_Start', 'NinjaJump_Idle_Loop', 'NinjaJump_Land', 'Idle_Shield_Break', 'Farm_Harvest', 'Idle_FoldArms_Loop', 'Yes']
INPLACE = {'Lean_Forward_Sprint', 'Standard_Forward_Charge'}       # 自带的根运动片段 → 原地

NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
CT = {5126: '<f4', 5123: '<u2', 5125: '<u4', 5121: 'u1', 5122: '<i2', 5120: 'i1'}


def load_glb(path):
    b = open(path, 'rb').read()
    off = 12; js = None; bin_ = None
    while off < len(b):
        cl, ct = struct.unpack_from('<II', b, off); off += 8
        if ct == 0x4E4F534A: js = json.loads(b[off:off + cl])
        elif ct == 0x004E4942: bin_ = b[off:off + cl]
        off += cl
    return js, bin_


def acc_read(js, bin_, i):
    a = js['accessors'][i]; bv = js['bufferViews'][a['bufferView']]
    n = NC[a['type']]; dt = np.dtype(CT[a['componentType']])
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', n * dt.itemsize)
    if stride == n * dt.itemsize:
        return np.frombuffer(bin_, dtype=dt, count=a['count'] * n, offset=off).reshape(a['count'], n)
    return np.stack([np.frombuffer(bin_, dtype=dt, count=n, offset=off + k * stride) for k in range(a['count'])])


# ---------- 四元数 ----------
def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return np.array([aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz])


def qinv(q): return np.array([-q[0], -q[1], -q[2], q[3]])
def qrot(q, v): return qmul(qmul(q, np.array([v[0], v[1], v[2], 0.0])), qinv(q))[:3]


def qnorm(q):
    q = q / np.linalg.norm(q)
    return -q if q[3] < 0 else q


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


class Skel:
    """glTF 节点层级：静止姿势、按动作取样后的世界变换"""
    def __init__(self, js, bin_):
        self.js, self.bin = js, bin_
        self.nodes = js['nodes']
        self.parent = {}
        for i, n in enumerate(self.nodes):
            for c in n.get('children', []): self.parent[c] = i
        self.idx = {n.get('name'): i for i, n in enumerate(self.nodes)}
        self.order = []
        seen = set()
        def visit(i):
            if i in seen: return
            if i in self.parent: visit(self.parent[i])
            seen.add(i); self.order.append(i)
        for i in range(len(self.nodes)): visit(i)
        self.rest = self.world(self.rest_local)

    def rest_local(self, i):
        n = self.nodes[i]
        return np.array(n.get('translation', [0, 0, 0]), float), np.array(n.get('rotation', [0, 0, 0, 1]), float)

    def world(self, local):
        W = {}
        for i in self.order:
            t, r = local(i)
            if i in self.parent:
                pt, pr = W[self.parent[i]]
                W[i] = (pt + qrot(pr, t), qmul(pr, r))
            else:
                W[i] = (t, r)
        return W

    def channels(self, anim):
        ch = {}; dur = 0.0
        for c in anim['channels']:
            s = anim['samplers'][c['sampler']]
            t = acc_read(self.js, self.bin, s['input'])[:, 0].astype(float)
            v = acc_read(self.js, self.bin, s['output']).astype(float)
            ch[(c['target']['node'], c['target']['path'])] = (t, v)
            dur = max(dur, float(t[-1]))
        return ch, dur

    def sampler(self, ch, tt):
        def local(i):
            t0, r0 = self.rest_local(i)
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
        return local


def main():
    fjs, fbin = load_glb(FIG)
    ujs, ubin = load_glb(UAL)
    T = Skel(fjs, fbin)
    S = Skel(ujs, ubin)
    FWD, UP = np.array([0, 0, 1.0]), np.array([0, 1.0, 0])

    # ---------- 对齐旋转 ----------
    A = {}
    for tn, sn, kind in MAP:
        ti, si = T.idx[PFX + tn], S.idx[sn]
        if kind == 'head':
            dT = dS = UP
        else:
            dT = T.rest[T.idx[PFX + T_CHILD[tn]]][0] - T.rest[ti][0]
            dS = S.rest[S.idx[S_CHILD[sn]]][0] - S.rest[si][0]
        ref = UP if kind == 'foot' else FWD
        A[tn] = mat2quat(frame(dS, ref) @ frame(dT, ref).T)
    hipT = T.rest[T.idx[PFX + 'Hips']][0]
    hipS = S.rest[S.idx['pelvis']][0]
    k_hip = hipT[1] / hipS[1]
    print('hip height target %.3f source %.3f scale %.3f' % (hipT[1], hipS[1], k_hip))

    joints = [T.nodes[j]['name'] for j in fjs['skins'][0]['joints']]
    jidx = [T.idx[n] for n in joints]
    mapped = {T.idx[PFX + tn]: (S.idx[sn], tn) for tn, sn, kind in MAP}

    clips = []          # {name, times, tracks: [(node, path, values)]}

    # ---------- UAL2 重定向 ----------
    uanims = {a['name']: a for a in ujs['animations']}
    for nm in UAL_CLIPS:
        ch, dur = S.channels(uanims[nm])
        nf = int(round(dur * FPS)) + 1
        times = np.array([min(dur, f / FPS) for f in range(nf)])
        rot = {j: [] for j in jidx}; hip_t = []
        for tt in times:
            W = S.world(S.sampler(ch, tt))
            TW = {}
            for i in T.order:
                if i in mapped:
                    si, tn = mapped[i]
                    D = qmul(W[si][1], qinv(S.rest[si][1]))
                    TW[i] = qnorm(qmul(D, qmul(A[tn], T.rest[i][1])))
                elif i in T.parent and T.parent[i] in TW:
                    TW[i] = qnorm(qmul(TW[T.parent[i]], T.rest_local(i)[1]))
                else:
                    TW[i] = T.rest[i][1]
            for j in jidx:
                p = T.parent.get(j)
                pw = TW[p] if p is not None else np.array([0, 0, 0, 1.0])
                rot[j].append(qnorm(qmul(qinv(pw), TW[j])))
            dp = (W[S.idx['pelvis']][0] - hipS) * k_hip
            if nm.startswith('NinjaJump'):
                dp[1] = min(dp[1], 0.0)      # 跳跃：骨盆只保留下蹲，向上的位移由游戏里的起跳物理给出（免得叠加成两倍高）
            hip_t.append(hipT + dp)          # 骨盆的父节点（target_character）是单位变换
        # 四元数连续（相邻帧取同半球），免得插值绕远路
        tracks = []
        for j in jidx:
            q = np.array(rot[j])
            for f in range(1, len(q)):
                if np.dot(q[f], q[f - 1]) < 0: q[f] = -q[f]
            tracks.append((j, 'rotation', q))
        tracks.append((T.idx[PFX + 'Hips'], 'translation', np.array(hip_t)))
        clips.append({'name': nm, 'times': times, 'tracks': tracks, 'src': 'UAL2'})
        print('retarget', nm, nf, 'frames')

    # ---------- 自带动作 ----------
    for an in fjs['animations']:
        ch, dur = T.channels(an)
        tracks = []
        times = None
        for (node, path), (t, v) in ch.items():
            name = T.nodes[node]['name']
            if path == 'translation' and name != PFX + 'Hips':
                rest = T.rest_local(node)[0]
                if np.abs(v - rest).max() < 1e-4: continue          # 骨长不变的位移轨道
            v = v.copy()
            if path == 'translation' and name == PFX + 'Hips' and an['name'] in INPLACE:
                # 减去匀速前移（首末帧连线），保留起伏
                drift = (v[-1] - v[0]) * np.array([1, 0, 1])
                v = v - np.outer((t - t[0]) / (t[-1] - t[0]), drift)
            if path == 'rotation':
                for f in range(1, len(v)):
                    if np.dot(v[f], v[f - 1]) < 0: v[f] = -v[f]
            tracks.append((node, path, v, t))
        clips.append({'name': an['name'], 'times': None, 'tracks': tracks, 'src': 'own'})
        print('own', an['name'], len(tracks), 'tracks')

    # ---------- 着地校正：站立类动作按全段最低的踝高对齐绑定姿势（重定向后腿长比例不同，脚会略陷或略浮）----------
    for c in clips:
        if c['name'] in GROUND:
            ground_clip(T, c)
            clamp_toes(T, c)

    # ---------- 站姿（Idle）与御剑站姿（Fly）----------
    # 站姿：Sword_Regular_A_Rec 的末帧（UAL 收势回到的标准站姿）
    rec = next(c for c in clips if c['name'] == 'Sword_Regular_A_Rec')
    pose = {tr[0]: tr[2][-1] for tr in rec['tracks'] if tr[1] == 'rotation'}
    hip_pose = next(tr[2][-1] for tr in rec['tracks'] if tr[1] == 'translation')
    clips.append(make_idle('Idle', T, jidx, pose, hip_pose))
    clips.append(make_fly('Fly', T, jidx, pose, hip_pose))
    for c in clips[-2:]: ground_clip(T, c)

    write_glb(fjs, fbin, T, clips, jidx, os.path.join(BUILD, 'cultivator_full.glb'), tex=2048)
    write_glb(fjs, fbin, T, clips, jidx, os.path.join(BUILD, 'cultivator_lo.glb'), tex=1024)

    # ---------- 运行时要用的数据：手骨本地的握剑方向、各移动动作的自然速度 ----------
    hands = {}
    for side, tn, sn in (('r', 'RightHand', 'hand_r'), ('l', 'LeftHand', 'hand_l')):
        ti = T.idx[PFX + tn]
        W0 = qmul(A[tn], T.rest[ti][1])          # 源（动作库）T 字静止时这只手的世界朝向
        hands[side] = {
            'blade': qrot(qinv(W0), FWD).round(4).tolist(),        # 剑从拇指一侧伸出（源手静止时朝 +Z）
            'palm': qrot(qinv(W0), -UP).round(4).tolist(),         # 掌心（源手静止时朝下）
            'fingers': [0, 1, 0], 'length': round(float(np.linalg.norm(T.rest[T.idx[PFX + T_CHILD[tn]]][0] - T.rest[ti][0])), 4),
        }
    speeds = {}
    for c in clips:
        if c['name'] in ('Walking', 'Running', 'Lean_Forward_Sprint', 'Standard_Forward_Charge'):
            speeds[c['name']] = clip_speed(T, c)
    meta = {
        'source': 'assets/figure/gold_cultivator_v1_model_only/gold_cultivator.glb', 'retarget': 'Quaternius · Universal Animation Library 2 [Standard] (CC0 1.0)',
        'height': 1.72, 'hipHeight': round(float(hipT[1]), 4), 'hands': hands, 'speeds': speeds,
        'clips': {c['name']: {'src': c['src'], 'dur': round(float(max((tr[3] if len(tr) > 3 else c['times'])[-1] for tr in c['tracks'])), 4)} for c in clips},
    }
    os.makedirs(os.path.join(ROOT, 'assets', 'converted', 'figure'), exist_ok=True)
    with open(os.path.join(ROOT, 'assets', 'converted', 'figure', 'cultivator.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print('hands', hands, 'speeds', speeds)


def clip_speed(T, c):
    """原地移动动作的自然速度：支撑脚（最低时）相对骨盆向后滑的速度（米/秒）"""
    tracks = {(tr[0], tr[1]): (tr[3] if len(tr) > 3 else c['times'], tr[2]) for tr in c['tracks']}
    dur = max(t[-1] for t, v in tracks.values())
    ts = np.arange(0, dur + 1e-6, 1 / 60)
    vals = []
    for side in ('Left', 'Right'):
        fi = T.idx[PFX + side + 'Foot']; hi = T.idx[PFX + 'Hips']
        zs, ys = [], []
        for tt in ts:
            W = T.world(T.sampler(tracks, tt))
            zs.append(W[fi][0][2] - W[hi][0][2]); ys.append(W[fi][0][1])
        zs, ys = np.array(zs), np.array(ys)
        low = ys < ys.min() + 0.025
        vals.append(float(-np.median(np.gradient(zs, ts)[low])))
    return round(float(np.mean(vals)), 3)


# 做着地校正的动作：站着的（倒地、起身、跳跃、打坐、弯腰拾物不做）
GROUND = {'Sword_Regular_A', 'Sword_Regular_A_Rec', 'Sword_Regular_B', 'Sword_Regular_B_Rec', 'Sword_Regular_C', 'Sword_Regular_Combo',
          'Sword_Heavy_Combo', 'Sword_Dash', 'Sword_Block', 'OverhandThrow', 'Consume', 'Idle_Shield_Break', 'Farm_Harvest',
          'Idle_FoldArms_Loop', 'Yes', 'Running', 'Walking', 'Lean_Forward_Sprint', 'Standard_Forward_Charge', 'Thrust_Slash', 'Punch_Pose'}


def ground_clip(T, c):
    """着地：逐帧量两踝的最低高度，低于绑定姿势踝高（脚陷进地里）的帧把骨盆抬起相应高度（三帧平滑）；
    整段最低的那一帧正好贴地——整段都浮着的动作则整体往下放。骨盆位移轨道按 30 帧/秒重采样后改写。"""
    hi = T.idx[PFX + 'Hips']
    tracks = {(tr[0], tr[1]): (tr[3] if len(tr) > 3 else c['times'], tr[2]) for tr in c['tracks']}
    dur = max(t[-1] for t, v in tracks.values())
    bind = min(T.rest[T.idx[PFX + 'LeftFoot']][0][1], T.rest[T.idx[PFX + 'RightFoot']][0][1])
    times = np.array([min(dur, f / 30) for f in range(int(round(dur * 30)) + 1)])
    low, hip = [], []
    for tt in times:
        W = T.world(T.sampler(tracks, tt))
        low.append(min(W[T.idx[PFX + 'LeftFoot']][0][1], W[T.idx[PFX + 'RightFoot']][0][1]))
        hip.append(W[hi][0].copy())
    low = np.array(low); hip = np.array(hip)
    lift = np.maximum(0.0, bind - low)
    if len(lift) > 2:                                           # 三帧滑动最大值再平均：抬起提前一点、不抖
        mx = np.maximum(np.maximum(lift, np.r_[lift[1:], lift[-1]]), np.r_[lift[0], lift[:-1]])
        lift = np.convolve(np.r_[mx[0], mx, mx[-1]], np.ones(3) / 3, 'valid')
    float_off = max(0.0, float((low + lift).min() - bind))      # 整段都浮着：往下放
    hip[:, 1] += lift - float_off
    for k, tr in enumerate(c['tracks']):
        if tr[0] == hi and tr[1] == 'translation':
            c['tracks'][k] = (tr[0], tr[1], hip, times)
    c['ground'] = [round(float(lift.max()), 4), round(-float_off, 4)]
    print('  ground %-26s lift max %+.3f, float %+.3f' % (c['name'], lift.max(), -float_off))


def clamp_toes(T, c):
    """脚尖不入地：逐帧看两只脚的脚尖（Toe_End）高度，低于绑定姿势的脚尖高度时把整只脚（Foot）绕水平轴向上翻，
    翻到脚尖刚好贴地为止——腿与身体不动（只抬骨盆会让踩实的脚跟悬空）。改写 Foot 的旋转轨道（30 帧/秒）。"""
    tracks = {(tr[0], tr[1]): (tr[3] if len(tr) > 3 else c['times'], tr[2]) for tr in c['tracks']}
    dur = max(t[-1] for t, v in tracks.values())
    times = np.array([min(dur, f / 30) for f in range(int(round(dur * 30)) + 1)])
    UPV = np.array([0, 1.0, 0])
    fixed = 0
    for side in ('Left', 'Right'):
        fi, ti = T.idx[PFX + side + 'Foot'], T.idx[PFX + side + 'Toe_End']
        bind_toe = T.rest[ti][0][1]
        rows = []
        for tt in times:
            loc = T.sampler(tracks, tt)
            W = T.world(loc)
            a, toe = W[fi][0], W[ti][0]
            q_local = loc(fi)[1]
            if toe[1] < bind_toe - 0.003:
                v = toe - a; L = np.linalg.norm(v)
                hz = v - UPV * v[1]; hl = np.linalg.norm(hz)
                if hl > 1e-4 and L > 1e-4:
                    e_now = np.arcsin(np.clip(v[1] / L, -1, 1))
                    e_tgt = np.arcsin(np.clip((bind_toe - a[1]) / L, -1, 1))
                    axis = np.cross(hz / hl, UPV)                     # 绕「脚尖水平方向 × 上」转，正角度把脚尖往上抬
                    d = axis_q(axis, e_tgt - e_now)
                    # 世界里的转动换到 Foot 的本地：W' = d · W  →  L' = Wp⁻¹ · d · Wp · L
                    pw = W[T.parent[fi]][1]
                    q_local = qnorm(qmul(qinv(pw), qmul(d, qmul(pw, q_local))))
                    fixed += 1
            rows.append(q_local)
        q = np.array(rows)
        for f in range(1, len(q)):
            if np.dot(q[f], q[f - 1]) < 0: q[f] = -q[f]
        replaced = False
        for k, tr in enumerate(c['tracks']):
            if tr[0] == fi and tr[1] == 'rotation':
                c['tracks'][k] = (fi, 'rotation', q, times); replaced = True
        if not replaced: c['tracks'].append((fi, 'rotation', q, times))
        tracks[(fi, 'rotation')] = (times, q)
    if fixed: print('  toes  %-26s %d frames lifted' % (c['name'], fixed))


def axis_q(axis, ang):
    axis = np.asarray(axis, float); axis = axis / np.linalg.norm(axis)
    s = np.sin(ang / 2)
    return np.array([axis[0] * s, axis[1] * s, axis[2] * s, np.cos(ang / 2)])


def make_idle(name, T, jidx, pose, hip):
    """待机：在站姿上叠呼吸（胸、颈轻微前后）与重心的微小起伏，3 秒一循环"""
    times = np.arange(0, 3.0 + 1e-6, 1 / FPS)
    tracks = []
    for j in jidx:
        nm = T.nodes[j]['name'].replace(PFX, '')
        base = pose.get(j, T.rest_local(j)[1])
        qs = []
        for t in times:
            w = 2 * np.pi * t / 3.0
            q = base
            if nm == 'Spine1': q = qmul(base, axis_q([1, 0, 0], 0.018 * np.sin(w)))
            elif nm == 'Spine2': q = qmul(base, axis_q([1, 0, 0], 0.022 * np.sin(w - 0.4)))
            elif nm == 'Neck': q = qmul(base, axis_q([1, 0, 0], -0.05 - 0.02 * np.sin(w - 0.4)))    # 收势站姿略低头：抬起一点
            elif nm == 'Head': q = qmul(base, axis_q([1, 0, 0], -0.07))
            elif nm in ('LeftArm', 'RightArm'): q = qmul(base, axis_q([0, 0, 1], (0.02 if nm == 'LeftArm' else -0.02) * np.sin(w - 0.8)))
            qs.append(qnorm(q))
        q = np.array(qs)
        for f in range(1, len(q)):
            if np.dot(q[f], q[f - 1]) < 0: q[f] = -q[f]
        tracks.append((j, 'rotation', q))
    ht = np.array([hip + np.array([0, -0.006 * (1 - np.cos(2 * np.pi * t / 3.0)) / 2, 0]) for t in times])
    tracks.append((T.idx[PFX + 'Hips'], 'translation', ht))
    return {'name': name, 'times': times, 'tracks': tracks, 'src': 'pose'}


def make_fly(name, T, jidx, pose, hip):
    """御剑站姿：两脚前后错开、膝微屈，身体略前倾；右手剑指当胸（前臂抬起），左手负于身后（静态，循环 2 秒）"""
    W = T.rest   # 静止世界姿势
    adj = {
        'Hips': axis_q([0, 1, 0], -0.30),                          # 骨盆略转，侧身立于剑上
        'Spine1': axis_q([0, 1, 0], 0.16), 'Spine2': axis_q([0, 1, 0], 0.12),
        'LeftUpLeg': axis_q([1, 0, 0], -0.18), 'LeftLeg': axis_q([1, 0, 0], 0.30),     # 两腿前后错开、膝同样微屈，双脚都踏在剑上
        'RightUpLeg': axis_q([1, 0, 0], 0.14), 'RightLeg': axis_q([1, 0, 0], 0.30),
        'RightArm': axis_q([1, 0, 0], -0.95), 'RightForeArm': axis_q([1, 0, 0], -1.15),
        'LeftArm': axis_q([1, 0, 0], 0.55), 'LeftForeArm': axis_q([1, 0, 0], -1.25),
    }
    times = np.array([0.0, 2.0])
    tracks = []
    for j in jidx:
        nm = T.nodes[j]['name'].replace(PFX, '')
        base = pose.get(j, T.rest_local(j)[1])
        q = qnorm(qmul(base, adj[nm])) if nm in adj else base
        tracks.append((j, 'rotation', np.array([q, q])))
    tracks.append((T.idx[PFX + 'Hips'], 'translation', np.array([hip + [0, -0.05, 0], hip + [0, -0.05, 0]])))
    return {'name': name, 'times': times, 'tracks': tracks, 'src': 'pose'}


def write_glb(fjs, fbin, T, clips, jidx, out, tex=2048):
    js = json.loads(json.dumps(fjs))
    chunks = []
    bviews = []; accs = []

    def add_view(data, target=None):
        while sum(len(c) for c in chunks) % 4: chunks.append(b'\x00')
        off = sum(len(c) for c in chunks)
        chunks.append(data)
        bv = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target: bv['target'] = target
        bviews.append(bv)
        return len(bviews) - 1

    def add_acc(arr, typ, comp=5126, minmax=False, target=None, normalized=False):
        arr = np.ascontiguousarray(arr)
        bv = add_view(arr.tobytes(), target)
        a = {'bufferView': bv, 'componentType': comp, 'count': int(arr.shape[0]), 'type': typ}
        if normalized: a['normalized'] = True
        if minmax:
            a['min'] = np.asarray(arr.min(0)).reshape(-1).astype(float).tolist()
            a['max'] = np.asarray(arr.max(0)).reshape(-1).astype(float).tolist()
        accs.append(a)
        return len(accs) - 1

    # 网格与蒙皮的原始数据照搬
    remap = {}
    def copy_acc(i, target=None):
        if i in remap: return remap[i]
        a = fjs['accessors'][i]
        arr = acc_read(fjs, fbin, i)
        typ = a['type']
        mm = 'min' in a
        k = add_acc(arr, typ, a['componentType'], minmax=mm, target=target, normalized=a.get('normalized', False))
        remap[i] = k
        return k
    for m in js['meshes']:
        for p in m['primitives']:
            p['attributes'] = {k: copy_acc(v, 34962) for k, v in p['attributes'].items()}
            if 'indices' in p: p['indices'] = copy_acc(p['indices'], 34963)
    for s in js['skins']:
        s['inverseBindMatrices'] = copy_acc(s['inverseBindMatrices'])

    # 贴图：缩小、存 JPEG
    imgs = []
    for i, im in enumerate(fjs['images']):
        bv = fjs['bufferViews'][im['bufferView']]
        raw = fbin[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
        pil = Image.open(io.BytesIO(raw)).convert('RGB')
        if pil.size[0] > tex: pil = pil.resize((tex, tex), Image.LANCZOS)
        buf = io.BytesIO()
        is_color = im['name'] == 'texture_0'
        pil.save(buf, 'JPEG', quality=90 if is_color else 94, subsampling=2 if is_color else 0, optimize=True)
        imgs.append({'name': im['name'], 'mimeType': 'image/jpeg', 'bufferView': add_view(buf.getvalue())})
        print('  image', im['name'], pil.size, len(buf.getvalue()) // 1024, 'KB')
    js['images'] = imgs

    # 动作
    anims = []
    for c in clips:
        samplers = []; channels = []
        tcache = {}
        def time_acc(t):
            key = (len(t), round(float(t[-1]), 5))
            if key not in tcache:
                tcache[key] = add_acc(np.asarray(t, np.float32).reshape(-1, 1), 'SCALAR', minmax=True)
            return tcache[key]
        for tr in c['tracks']:
            node, path, v = tr[0], tr[1], tr[2]
            t = tr[3] if len(tr) > 3 else c['times']
            ti = time_acc(t)
            vi = add_acc(np.asarray(v, np.float32), 'VEC4' if path == 'rotation' else 'VEC3')
            samplers.append({'input': ti, 'output': vi, 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': int(node), 'path': path}})
        anims.append({'name': c['name'], 'samplers': samplers, 'channels': channels})
    js['animations'] = anims
    js['accessors'] = accs
    js['bufferViews'] = bviews
    blob = b''.join(chunks)
    while len(blob) % 4: blob += b'\x00'
    js['buffers'] = [{'byteLength': len(blob)}]
    js['asset'] = {'version': '2.0', 'generator': 'xiuxian tools/convert_cultivator.py (from Khronos glTF Blender I/O export)'}
    jb = json.dumps(js, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    while len(jb) % 4: jb += b' '
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(blob)))
        f.write(struct.pack('<II', len(jb), 0x4E4F534A)); f.write(jb)
        f.write(struct.pack('<II', len(blob), 0x004E4942)); f.write(blob)
    print('wrote', out, round(os.path.getsize(out) / 1e6, 2), 'MB,', len(anims), 'clips')


if __name__ == '__main__':
    main()
