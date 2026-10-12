# 第十六轮：镇塔龙君的动作与成品 glb —— tools/_build/boss50_base.glb（boss50_blender.py 的输出）→ tools/_build/boss50_full.glb / boss50_lo.glb
#   python -I tools/convert_boss50.py
# 再由 tools/convert_boss50.mjs 量化、减面后写到 assets/converted/boss50/。
#
# 原素材只有一段原地展示动作（TempMotion，21.1 秒：站姿、振翅、甩尾、戒备站姿），没有行走、攻击、受击、倒地。补法分两部分：
#   1) 本脚本：把两套人形动作重定向到龙的躯干、头、双臂、双腿上——
#        · Quaternius「Universal Animation Library 2」（CC0，assets/fighting，第十四轮起已在用）：受击、倒地起身、跳跃、勾拳、双爪抓、
#          斩击、重斩连击（末式双手下砸）、掷出、盾冲、僵尸步……
#        · 金白修士素材自带的 Mixamo 动作（assets/figure/gold_cultivator_v1_model_only/gold_cultivator.glb）：走、跑、前冲、后倒死亡、跳下。
#      做法同 convert_cultivator.py：源骨在动作中相对其静止姿势的世界旋转变化 D(t)，乘「把目标骨静止姿势摆到源骨静止姿势」的对齐旋转，
#      得目标骨的世界旋转，再换成相对父骨的本地旋转；骨盆位移按两边髋高之比缩放；站立类动作逐帧着地校正。
#      源里没有的部位（尾 7 节、双翼、四指与拇指、扭转骨、胸骨）取 TempMotion 里一帧戒备站姿的样子，运行时再叠尾、翼、爪的动作层。
#   2) 龙特有的招式动作（尾扫、吐息、怒吼、跪地、召雷、囚阵、蓄力、处决……）在运行时按关键姿势生成（src/actors/boss50Pose.js、boss50Clips.js），
#      本脚本只负责重定向。
import json, os, sys, io, struct
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from convert_cultivator import load_glb, acc_read, qmul, qinv, qrot, qnorm, slerp, mat2quat, frame, Skel   # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, 'tools', '_build')
BASE = os.path.join(BUILD, 'boss50_base.glb')
TEX = os.path.join(BUILD, 'boss50_tex')
UAL = os.path.join(ROOT, 'assets', 'fighting', 'Universal Animation Library 2[Standard]', 'Universal Animation Library 2[Standard]', 'Unreal-Godot', 'UAL2_Standard.glb')
MIX = os.path.join(ROOT, 'assets', 'figure', 'gold_cultivator_v1_model_only', 'gold_cultivator.glb')
FPS = 30
REF_T = 9.3           # TempMotion 里取作「戒备站姿」的时刻（正面、两脚分开；尾、手指、扭转骨的参照姿势）
WING_REF_T = 14.0     # 翼的参照姿势：直立站姿、双翼收在背后的时刻
# 双翼骨链（shoulder_dupli_001_l / _r）在导出的层级里挂在静止不动的 root 骨下，原动作把翼根的移动直接烘成世界位置——
# 换成别的动作时身体动了翼还留在原处（倒地时翼膜被拉长）。这里把两条翼链改挂到胸骨 spine_03_x 下：
# 静止姿势换算成相对胸骨，原动作每一帧的翼根轨道也换算成相对胸骨（世界姿态不变）。
REPARENT = {'shoulder_dupli_001_l': 'spine_03_x', 'shoulder_dupli_001_r': 'spine_03_x'}

# 目标骨 ← 源骨（UAL2 名 / Mixamo 名），kind：body / head / limb / foot
MAP = [
    ('root_x', 'pelvis', 'Hips', 'body'), ('spine_01_x', 'spine_01', 'Spine', 'body'), ('spine_02_x', 'spine_02', 'Spine1', 'body'),
    ('spine_03_x', 'spine_03', 'Spine2', 'body'), ('neck_x', 'neck_01', 'Neck', 'body'), ('head_x', 'Head', 'Head', 'head'),
    ('shoulder_l', 'clavicle_l', 'LeftShoulder', 'limb'), ('arm_stretch_l', 'upperarm_l', 'LeftArm', 'limb'),
    ('forearm_stretch_l', 'lowerarm_l', 'LeftForeArm', 'limb'), ('hand_l', 'hand_l', 'LeftHand', 'limb'),
    ('shoulder_r', 'clavicle_r', 'RightShoulder', 'limb'), ('arm_stretch_r', 'upperarm_r', 'RightArm', 'limb'),
    ('forearm_stretch_r', 'lowerarm_r', 'RightForeArm', 'limb'), ('hand_r', 'hand_r', 'RightHand', 'limb'),
    ('thigh_stretch_l', 'thigh_l', 'LeftUpLeg', 'limb'), ('leg_stretch_l', 'calf_l', 'LeftLeg', 'limb'),
    ('foot_l', 'foot_l', 'LeftFoot', 'foot'), ('toes_01_l', 'ball_l', 'LeftToeBase', 'foot'),
    ('thigh_stretch_r', 'thigh_r', 'RightUpLeg', 'limb'), ('leg_stretch_r', 'calf_r', 'RightLeg', 'limb'),
    ('foot_r', 'foot_r', 'RightFoot', 'foot'), ('toes_01_r', 'ball_r', 'RightToeBase', 'foot'),
]
# 求骨的走向用的子骨（目标 / 两种源）
T_CHILD = {'root_x': 'spine_01_x', 'spine_01_x': 'spine_02_x', 'spine_02_x': 'spine_03_x', 'spine_03_x': 'neck_x', 'neck_x': 'head_x',
           'shoulder_l': 'arm_stretch_l', 'arm_stretch_l': 'forearm_stretch_l', 'forearm_stretch_l': 'hand_l', 'hand_l': 'middle1_l',
           'shoulder_r': 'arm_stretch_r', 'arm_stretch_r': 'forearm_stretch_r', 'forearm_stretch_r': 'hand_r', 'hand_r': 'middle1_r',
           'thigh_stretch_l': 'leg_stretch_l', 'leg_stretch_l': 'foot_l', 'foot_l': 'toes_01_l', 'toes_01_l': None,
           'thigh_stretch_r': 'leg_stretch_r', 'leg_stretch_r': 'foot_r', 'foot_r': 'toes_01_r', 'toes_01_r': None}
U_CHILD = {'pelvis': 'spine_01', 'spine_01': 'spine_02', 'spine_02': 'spine_03', 'spine_03': 'neck_01', 'neck_01': 'Head',
           'clavicle_l': 'upperarm_l', 'upperarm_l': 'lowerarm_l', 'lowerarm_l': 'hand_l', 'hand_l': 'middle_01_l',
           'clavicle_r': 'upperarm_r', 'upperarm_r': 'lowerarm_r', 'lowerarm_r': 'hand_r', 'hand_r': 'middle_01_r',
           'thigh_l': 'calf_l', 'calf_l': 'foot_l', 'foot_l': 'ball_l', 'ball_l': 'ball_leaf_l',
           'thigh_r': 'calf_r', 'calf_r': 'foot_r', 'foot_r': 'ball_r', 'ball_r': 'ball_leaf_r'}
M_CHILD = {'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Head',
           'LeftShoulder': 'LeftArm', 'LeftArm': 'LeftForeArm', 'LeftForeArm': 'LeftHand', 'LeftHand': 'LeftHandMiddle4',
           'RightShoulder': 'RightArm', 'RightArm': 'RightForeArm', 'RightForeArm': 'RightHand', 'RightHand': 'RightHandMiddle4',
           'LeftUpLeg': 'LeftLeg', 'LeftLeg': 'LeftFoot', 'LeftFoot': 'LeftToeBase', 'LeftToeBase': 'LeftToe_End',
           'RightUpLeg': 'RightLeg', 'RightLeg': 'RightFoot', 'RightFoot': 'RightToeBase', 'RightToeBase': 'RightToe_End'}

UAL_CLIPS = ['Hit_Knockback', 'Idle_Shield_Break', 'LayToIdle', 'NinjaJump_Start', 'NinjaJump_Idle_Loop', 'NinjaJump_Land',
             'Melee_Hook', 'Melee_Hook_Rec', 'Zombie_Scratch', 'Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C', 'Sword_Regular_Combo',
             'Sword_Heavy_Combo', 'Sword_Dash', 'OverhandThrow', 'Shield_Dash', 'Shield_OneShot', 'Zombie_Walk_Fwd_Loop', 'Zombie_Idle_Loop',
             'Idle_No_Loop', 'Slide_Start', 'Slide_Loop', 'Slide_Exit']
MIX_CLIPS = ['Walking', 'Running', 'Standard_Forward_Charge', 'Lean_Forward_Sprint', 'dying_backwards', 'Wall_Support_Jump_to_Ground',
             'Punch_Pose', 'Thrust_Slash']
MIX_INPLACE = {'Lean_Forward_Sprint', 'Standard_Forward_Charge'}
# 不做着地校正的：倒地、起身、跳跃、滑铲、跳下
NO_GROUND = {'u_Hit_Knockback', 'u_LayToIdle', 'u_NinjaJump_Start', 'u_NinjaJump_Idle_Loop', 'u_NinjaJump_Land', 'u_Slide_Start', 'u_Slide_Loop',
             'u_Slide_Exit', 'm_dying_backwards', 'm_Wall_Support_Jump_to_Ground'}


def reparent_wings(tjs, tbin):
    """改挂翼根：返回新的 Skel，与改挂后 TempMotion 的翼根轨道 {node: (times, translation[], rotation[])}"""
    T0 = Skel(tjs, tbin)
    temp = next(a for a in tjs['animations'] if a['name'] == 'TempMotion')
    ch0, dur = T0.channels(temp)
    times = next(t for (n, p), (t, v) in ch0.items())
    new = {}
    rows = {c: ([], []) for c in REPARENT}
    for tt in times:
        W = T0.world(T0.sampler(ch0, tt))
        for c, np_ in REPARENT.items():
            ci, pi = T0.idx[c], T0.idx[np_]
            P, C = W[pi], W[ci]
            rows[c][0].append(qrot(qinv(P[1]), C[0] - P[0]))
            rows[c][1].append(qnorm(qmul(qinv(P[1]), C[1])))
    for c, np_ in REPARENT.items():
        ci, pi = T0.idx[c], T0.idx[np_]
        op = T0.parent[ci]
        tjs['nodes'][op]['children'].remove(ci)
        tjs['nodes'][pi].setdefault('children', []).append(ci)
        P, C = T0.rest[pi], T0.rest[ci]
        tjs['nodes'][ci]['translation'] = qrot(qinv(P[1]), C[0] - P[0]).tolist()
        tjs['nodes'][ci]['rotation'] = qnorm(qmul(qinv(P[1]), C[1])).tolist()
        q = np.array(rows[c][1])
        for f in range(1, len(q)):
            if np.dot(q[f], q[f - 1]) < 0: q[f] = -q[f]
        new[ci] = (times, np.array(rows[c][0]), q)
        print('reparent %s: %s -> %s' % (c, tjs['nodes'][op]['name'], np_))
    return Skel(tjs, tbin), new


def subtree(T, i):
    out = [i]
    for c in T.nodes[i].get('children', []): out += subtree(T, c)
    return out


def ref_pose(T, ch, t):
    """TempMotion 在 t 秒的本地姿势：{node: (translation, rotation)}"""
    loc = T.sampler(ch, t)
    return {i: (np.array(loc(i)[0], float), np.array(loc(i)[1], float)) for i in range(len(T.nodes))}


def align(T, S, src_name, src_child, mapping_col, FWD, UP):
    A = {}
    for row in MAP:
        tn, sn, kind = row[0], row[mapping_col], row[3]
        ti, si = T.idx[tn], S.idx[src_name(sn)]
        if kind == 'head' or T_CHILD.get(tn) is None and kind != 'foot':
            dT = dS = UP
        else:
            tc = T_CHILD[tn] or None
            if tc is None:                                  # 脚趾没有子骨：沿用脚的走向
                dT = T.rest[ti][0] - T.rest[T.idx[T.nodes[T.parent[ti]]['name']]][0]
            else:
                dT = T.rest[T.idx[tc]][0] - T.rest[ti][0]
            sc = src_child.get(sn)
            if sc and src_name(sc) in S.idx: dS = S.rest[S.idx[src_name(sc)]][0] - S.rest[si][0]
            else: dS = S.rest[si][0] - S.rest[S.parent[si]][0]
        ref = UP if kind == 'foot' else FWD
        A[tn] = mat2quat(frame(dS, ref) @ frame(dT, ref).T)
    return A


def retarget(T, S, anim, A, src_name, mapping_col, hip_src, k_hip, hipT, ref, jidx, name, inplace=False, jump=False):
    ch, dur = S.channels(anim)
    nf = int(round(dur * FPS)) + 1
    times = np.array([min(dur, f / FPS) for f in range(nf)])
    mapped = {T.idx[row[0]]: (S.idx[src_name(row[mapping_col])], row[0]) for row in MAP}
    hip_i = T.idx['root_x']
    hipS = S.rest[S.idx[src_name(hip_src)]][0]
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
                TW[i] = qnorm(qmul(TW[T.parent[i]], ref[i][1]))
            else:
                TW[i] = ref[i][1] if i not in T.parent else qnorm(qmul(T.rest[T.parent[i]][1], ref[i][1]))
        for j in jidx:
            p = T.parent.get(j)
            pw = TW[p] if p is not None else np.array([0, 0, 0, 1.0])
            rot[j].append(qnorm(qmul(qinv(pw), TW[j])))
        dp = (W[S.idx[src_name(hip_src)]][0] - hipS) * k_hip
        if jump: dp[1] = min(dp[1], 0.0)                     # 跳跃的上升由游戏里的抛物线给出
        hip_t.append(dp)
    hip_t = np.array(hip_t)
    if inplace:                                              # 减去匀速前移，保留起伏
        drift = (hip_t[-1] - hip_t[0]) * np.array([1, 0, 1])
        hip_t = hip_t - np.outer((times - times[0]) / max(1e-6, times[-1] - times[0]), drift)
    # 骨盆位移：世界 → 骨盆父骨（root）的本地（root、RL_BoneRoot 是单位变换时就是加到静止位置上）
    pw = T.rest[T.parent[hip_i]]
    hip_local = np.array([qrot(qinv(pw[1]), (hipT + d) - pw[0]) for d in hip_t])
    tracks = []
    for j in jidx:
        q = np.array(rot[j])
        for f in range(1, len(q)):
            if np.dot(q[f], q[f - 1]) < 0: q[f] = -q[f]
        tracks.append((j, 'rotation', q))
    tracks.append((hip_i, 'translation', hip_local))
    for c in REPARENT:                                         # 翼根相对胸骨的位置（参照姿势，常量）
        ci = T.idx[c]
        tracks.append((ci, 'translation', np.repeat(ref[ci][0][None, :], len(times), 0)))
    return {'name': name, 'times': times, 'tracks': tracks}


def ground_clip(T, c, bind_ankle):
    """逐帧量两踝最低高度，低于站姿踝高的帧抬起骨盆（三帧平滑）；整段都浮着则整体放下（与 convert_cultivator.py 同法，换成龙的骨名）"""
    hi = T.idx['root_x']
    tracks = {(tr[0], tr[1]): (c['times'], tr[2]) for tr in c['tracks']}
    low, hip = [], []
    for tt in c['times']:
        W = T.world(T.sampler(tracks, tt))
        low.append(min(W[T.idx['foot_l']][0][1], W[T.idx['foot_r']][0][1]))
        hip.append(W[hi][0].copy())
    low = np.array(low)
    lift = np.maximum(0.0, bind_ankle - low)
    if len(lift) > 2:
        mx = np.maximum(np.maximum(lift, np.r_[lift[1:], lift[-1]]), np.r_[lift[0], lift[:-1]])
        lift = np.convolve(np.r_[mx[0], mx, mx[-1]], np.ones(3) / 3, 'valid')
    float_off = max(0.0, float((low + lift).min() - bind_ankle))
    pw = T.rest[T.parent[hi]]
    up_local = qrot(qinv(pw[1]), np.array([0, 1.0, 0]))
    for k, tr in enumerate(c['tracks']):
        if tr[0] == hi and tr[1] == 'translation':
            c['tracks'][k] = (hi, 'translation', tr[2] + np.outer(lift - float_off, up_local))
    print('  ground %-28s lift max %+.1f cm, float %+.1f cm' % (c['name'], lift.max(), -float_off))


def write_glb(js0, bin0, clips, out, base_tex, nrm_tex, orm_tex):
    js = json.loads(json.dumps(js0))
    chunks = []; bviews = []; accs = []

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

    remap = {}
    def copy_acc(i, target=None):
        if i in remap: return remap[i]
        a = js0['accessors'][i]
        k = add_acc(acc_read(js0, bin0, i), a['type'], a['componentType'], minmax='min' in a, target=target, normalized=a.get('normalized', False))
        remap[i] = k
        return k
    for m in js['meshes']:
        for p in m['primitives']:
            p['attributes'] = {k: copy_acc(v, 34962) for k, v in p['attributes'].items()}
            if 'indices' in p: p['indices'] = copy_acc(p['indices'], 34963)
            p['material'] = 0
    for s in js['skins']:
        s['inverseBindMatrices'] = copy_acc(s['inverseBindMatrices'])
    imgs = []
    for nm, path in (('boss50_base', base_tex), ('boss50_normal', nrm_tex), ('boss50_orm', orm_tex)):
        imgs.append({'name': nm, 'mimeType': 'image/jpeg', 'bufferView': add_view(open(path, 'rb').read())})
    js['images'] = imgs
    js['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}]
    js['textures'] = [{'source': i, 'sampler': 0} for i in range(3)]
    # ORM 的 R 通道放的是自发光遮罩（不是环境光遮蔽），所以不设 occlusionTexture；运行时的材质会读它
    js['materials'] = [{'name': 'boss50', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicRoughnessTexture': {'index': 2},
                                                                    'metallicFactor': 1.0, 'roughnessFactor': 1.0},
                        'normalTexture': {'index': 1}}]
    anims = []
    for c in clips:
        samplers = []; channels = []; tcache = {}
        def time_acc(t):
            key = (len(t), round(float(t[-1]), 5))
            if key not in tcache: tcache[key] = add_acc(np.asarray(t, np.float32).reshape(-1, 1), 'SCALAR', minmax=True)
            return tcache[key]
        for tr in c['tracks']:
            node, path, v = tr[0], tr[1], tr[2]
            t = tr[3] if len(tr) > 3 else c['times']
            samplers.append({'input': time_acc(t), 'output': add_acc(np.asarray(v, np.float32), 'VEC4' if path == 'rotation' else 'VEC3'), 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': int(node), 'path': path}})
        anims.append({'name': c['name'], 'samplers': samplers, 'channels': channels})
    js['animations'] = anims
    js['accessors'] = accs; js['bufferViews'] = bviews
    blob = b''.join(chunks)
    while len(blob) % 4: blob += b'\x00'
    js['buffers'] = [{'byteLength': len(blob)}]
    js['asset'] = {'version': '2.0', 'generator': 'xiuxian tools/convert_boss50.py (from Khronos glTF Blender I/O export)'}
    jb = json.dumps(js, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    while len(jb) % 4: jb += b' '
    with open(out, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(blob)))
        f.write(struct.pack('<II', len(jb), 0x4E4F534A)); f.write(jb)
        f.write(struct.pack('<II', len(blob), 0x004E4942)); f.write(blob)
    print('wrote', out, round(os.path.getsize(out) / 1e6, 2), 'MB,', len(anims), 'clips')


def main():
    tjs, tbin = load_glb(BASE)
    T, wing_tracks = reparent_wings(tjs, tbin)
    FWD, UP = np.array([0, 0, 1.0]), np.array([0, 1.0, 0])
    joints = [T.nodes[j]['name'] for j in tjs['skins'][0]['joints']]
    jidx = [T.idx[n] for n in joints]
    temp = next(a for a in tjs['animations'] if a['name'] == 'TempMotion')
    tch, tdur = T.channels(temp)
    for ci, (tt, tr, rr) in wing_tracks.items():                # 改挂后的翼根轨道
        tch[(ci, 'translation')] = (tt, tr); tch[(ci, 'rotation')] = (tt, rr)
    ref = ref_pose(T, tch, REF_T)
    wref = ref_pose(T, tch, WING_REF_T)
    wing_nodes = set()
    for c in REPARENT: wing_nodes.update(subtree(T, T.idx[c]))
    for i in wing_nodes: ref[i] = wref[i]                       # 重定向动作里双翼收在背后
    hip_i = T.idx['root_x']
    hipT_rest = T.rest[hip_i][0]
    # 戒备站姿下骨盆的世界位置（重定向动作以它为基准）、踝高（着地校正的地面）
    Wref = T.world(lambda i: ref[i])
    hipT = Wref[hip_i][0]
    bind_ankle = min(Wref[T.idx['foot_l']][0][1], Wref[T.idx['foot_r']][0][1])
    print('dragon hips rest %s  stance %s  ankle %.1f  (units: cm, Y up)' % (np.round(hipT_rest, 1), np.round(hipT, 1), bind_ankle))
    print('head', np.round(Wref[T.idx['head_x']][0], 1), 'hand_l', np.round(Wref[T.idx['hand_l']][0], 1), 'tail tip', np.round(Wref[T.idx['c_tail_06_x']][0], 1))
    clips = [{'name': 'TempMotion', 'times': None, 'tracks': [(node, path, v, t) for (node, path), (t, v) in tch.items() if path != 'scale']}]

    # ---------- UAL2 ----------
    ujs, ubin = load_glb(UAL)
    S = Skel(ujs, ubin)
    un = lambda n: n
    A = align(T, S, un, U_CHILD, 1, FWD, UP)
    k_hip = hipT[1] / S.rest[S.idx['pelvis']][0][1]
    print('UAL2 hip scale %.2f' % k_hip)
    ua = {a['name']: a for a in ujs['animations']}
    for nm in UAL_CLIPS:
        c = retarget(T, S, ua[nm], A, un, 1, 'pelvis', k_hip, hipT, ref, jidx, 'u_' + nm, jump=nm.startswith('NinjaJump'))
        clips.append(c); print('retarget', c['name'], len(c['times']), 'frames')
    # ---------- Mixamo（金白修士自带）----------
    mjs, mbin = load_glb(MIX)
    M = Skel(mjs, mbin)
    mn = lambda n: 'mixamorig:' + n
    A = align(T, M, mn, M_CHILD, 2, FWD, UP)
    k_hip = hipT[1] / M.rest[M.idx[mn('Hips')]][0][1]
    print('Mixamo hip scale %.2f' % k_hip)
    ma = {a['name']: a for a in mjs['animations']}
    for nm in MIX_CLIPS:
        c = retarget(T, M, ma[nm], A, mn, 2, 'Hips', k_hip, hipT, ref, jidx, 'm_' + nm, inplace=nm in MIX_INPLACE)
        clips.append(c); print('retarget', c['name'], len(c['times']), 'frames')
    for c in clips[1:]:
        if c['name'] not in NO_GROUND: ground_clip(T, c, bind_ankle)
    write_glb(tjs, tbin, clips, os.path.join(BUILD, 'boss50_full.glb'), os.path.join(TEX, 'base_4096.jpg'), os.path.join(TEX, 'normal_2048.jpg'), os.path.join(TEX, 'orm_2048.jpg'))
    write_glb(tjs, tbin, clips, os.path.join(BUILD, 'boss50_lo.glb'), os.path.join(TEX, 'base_2048.jpg'), os.path.join(TEX, 'normal_1024.jpg'), os.path.join(TEX, 'orm_1024.jpg'))
    meta = {'source': 'assets/boss/boss50/source/Dragon Character 3d by Oscar Creativo.fbx', 'units': 'cm (Armature node scale 0.01)',
            'stanceRef': REF_T, 'hipStance': np.round(hipT, 3).tolist(), 'ankle': round(float(bind_ankle), 3),
            'clips': {c['name']: round(float((c['times'] if c['times'] is not None else c['tracks'][0][3])[-1]), 4) for c in clips}}
    json.dump(meta, open(os.path.join(BUILD, 'boss50_meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
