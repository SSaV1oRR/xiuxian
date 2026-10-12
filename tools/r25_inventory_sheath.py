# 第二十五轮：单手剑动作包的 Sheath / Unsheath（只有 IP 版）逐帧实测 → JSON
#   每帧（原生 30 fps）：右手 hand_r、左手 hand_l、左髋（thigh_l 骨头部 = 左髋关节）相对骨盆（pelvis 骨头部）的位置，
#   用角色坐标（与 glTF / three.js 一致）：x = 角色左侧，y = 上，z = 角色前方（由骨架测得：左右大腿根连线 = 左右）。
#   另记：右手速度（世界；中心差分 / 逐帧区间）、右手到左髋 / 到左手的距离、右手握拳轴（index_01_r − pinky_01_r 的方向，
#   约等于剑柄 → 剑身的方向）、右手沿握拳轴运动的程度（cos：+1 = 顺着剑尖方向推，−1 = 往回拔）、手腕转动角速度。
#   事件：右手离左髋最近的帧；右手在左髋附近停住（逐帧位移最小）的区间；沿剑轴的「插入 / 拔出」行程；
#   右手是否在结尾停住（速度 < 阈值并保持到最后一帧）。另核对 Unsheath 是否就是 Sheath 倒放。
#   资源目录只读；Python FBX 导入器（automatic_bone_orientation=False），与 r24 / r25_inventory_sword.py 相同。
# 用法：blender -b --factory-startup --python tools/r25_inventory_sheath.py -- <包目录（含 IP）> <输出 json>
import bpy, sys, os, json, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
PACK, OUT = argv[0], argv[1]
CLIPS = ['Sheath', 'Unsheath']
PREFIX = 'A_OneHandedSwordAnimV5_'
scn = bpy.context.scene
SETTLE_MPS = 0.10          # 「停住」阈值：右手世界速度 < 0.10 m/s
ALONG = 0.90               # 沿剑轴运动：|cos| > 0.90
STROKE_MIN_MPS = 1.0       # 行程中右手速度至少 1 m/s
HIP_SIDE_M = 0.15          # 另一种左髋点：骨盆向左 0.15 m（与骨盆同高）


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    for d in list(bpy.data.armatures):
        bpy.data.armatures.remove(d)


def r3(v, n=4):
    return [round(float(x), n) for x in v]


def qang(q0, q1):
    a = q0.rotation_difference(q1).angle
    return min(a, 2 * math.pi - a)          # shortest arc (quaternion double cover)


out = {'convention': 'positions in metres relative to the pelvis bone head (world-space difference), expressed in character axes measured from '
                     'the skeleton at each frame: x = character left, y = up, z = character forward (glTF / three.js style; for these IP clips '
                     'the root never yaws, so x = Blender +X, y = Blender +Z, z = Blender -Y). t = (frame - first frame) / fps.',
       'leftHipPoint': 'head of bone thigh_l (left hip joint); alternative point = pelvis head + %.2f m to the character left' % HIP_SIDE_M,
       'gripAxis': 'unit vector from the pinky_01_r head to the index_01_r head (knuckle line of the right fist = handle direction, '
                   'pointing to the thumb / blade side for a normal grip)',
       'alongBlade': 'cos of the angle between the right-hand motion (central difference) and the grip axis',
       'speeds': 'vHandRWorld = central difference (m/s); vHandRStep = displacement from this frame to the next * fps (m/s)',
       'thresholds': {'settleMps': SETTLE_MPS, 'alongBladeAbsCos': ALONG, 'strokeMinMps': STROKE_MIN_MPS, 'hipSideM': HIP_SIDE_M},
       'clips': {}}
raw = {}
for nm in CLIPS:
    path = os.path.join(PACK, 'IP', f'{PREFIX}{nm}_IP.fbx')
    clear()
    scn.render.fps = 7; scn.render.fps_base = 1.0
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    fps = scn.render.fps / scn.render.fps_base
    act = arm.animation_data.action
    f0, f1 = [int(round(x)) for x in act.frame_range]
    B = arm.data.bones
    up_l = Vector((0, 0, 1))
    left_l = B['thigh_l'].head_local - B['thigh_r'].head_local
    left_l = (left_l - up_l * left_l.dot(up_l)).normalized()
    fwd_l = left_l.cross(up_l).normalized()
    pb = arm.pose.bones
    names = [p.name for p in pb]
    W = {k: [] for k in ('hand_r', 'hand_l', 'pelvis', 'thigh_l', 'index_01_r', 'pinky_01_r')}
    Rhand, axes, Qall, rootW, yaw = [], [], [], [], []
    for f in range(f0, f1 + 1):
        scn.frame_set(f)
        mw = arm.matrix_world
        R = mw.to_3x3().normalized()
        U = Vector((0, 0, 1))
        L = (R @ left_l); Fw = (R @ fwd_l)
        L = (L - U * L.dot(U)).normalized(); Fw = (Fw - U * Fw.dot(U)).normalized()
        axes.append((np.array(L), np.array(U), np.array(Fw)))
        yaw.append(math.degrees(math.atan2(Fw.y, Fw.x)))
        for k in W:
            W[k].append(np.array(mw @ pb[k].head))
        Rhand.append((mw @ pb['hand_r'].matrix).to_quaternion())
        Qall.append([tuple(p.matrix_basis.to_quaternion()) for p in pb])
        rootW.append(np.array(mw.translation))
    n = f1 - f0 + 1
    for k in W:
        W[k] = np.array(W[k])
    raw[nm] = {'Q': np.array(Qall), 'root': np.array(rootW), 'names': names}

    def to_char(v, i):
        L, U, Fw = axes[i]
        return np.array([v.dot(L), v.dot(U), v.dot(Fw)])
    rel = {k: np.array([to_char(W[k][i] - W['pelvis'][i], i) for i in range(n)]) for k in ('hand_r', 'hand_l', 'thigh_l')}
    hipAlt = np.array([HIP_SIDE_M, 0.0, 0.0])
    grip = np.array([to_char(W['index_01_r'][i] - W['pinky_01_r'][i], i) for i in range(n)])
    grip = grip / np.linalg.norm(grip, axis=1, keepdims=True)
    P = rel['hand_r']

    def central(X):
        v = np.zeros(n); d = np.zeros((n, 3))
        for i in range(n):
            a, b = max(0, i - 1), min(n - 1, i + 1)
            d[i] = (X[b] - X[a]) / ((b - a) / fps)
            v[i] = np.linalg.norm(d[i])
        return v, d
    v_world, d_world = central(W['hand_r'])
    v_rel, d_rel = central(P)
    v_l, _ = central(W['hand_l'])
    step = np.array([np.linalg.norm(W['hand_r'][i + 1] - W['hand_r'][i]) * fps for i in range(n - 1)] + [float('nan')])
    wr = np.zeros(n)
    for i in range(n):
        a, b = max(0, i - 1), min(n - 1, i + 1)
        wr[i] = math.degrees(qang(Rhand[a], Rhand[b])) / ((b - a) / fps)
    along = np.array([float(np.dot(d_rel[i], grip[i]) / (np.linalg.norm(d_rel[i]) + 1e-12)) for i in range(n)])
    d_hip = np.linalg.norm(P - rel['thigh_l'], axis=1)
    d_hip2 = np.linalg.norm(P - hipAlt, axis=1)
    d_hands = np.linalg.norm(W['hand_r'] - W['hand_l'], axis=1)
    l_hip = np.linalg.norm(rel['hand_l'] - rel['thigh_l'], axis=1)
    rows = []
    for i in range(n):
        rows.append({'frame': f0 + i, 't': round(i / fps, 4),
                     'hand_r': r3(P[i]), 'hand_l': r3(rel['hand_l'][i]), 'leftHip': r3(rel['thigh_l'][i]),
                     'dHandRLeftHip': round(float(d_hip[i]), 4), 'dHandRHipSide': round(float(d_hip2[i]), 4),
                     'dHandRHandL': round(float(d_hands[i]), 4), 'dHandLLeftHip': round(float(l_hip[i]), 4),
                     'vHandRWorld': round(float(v_world[i]), 3), 'vHandRStep': (None if i == n - 1 else round(float(step[i]), 3)),
                     'vHandRRelPelvis': round(float(v_rel[i]), 3), 'vHandLWorld': round(float(v_l[i]), 3),
                     'wristAngVelDegPs': round(float(wr[i]), 1), 'gripAxis': r3(grip[i], 3), 'alongBlade': round(along[i], 3)})
    i_hip = int(np.argmin(d_hip)); i_hip2 = int(np.argmin(d_hip2))
    # the stop at the hip: the frame interval with the smallest per-frame displacement within +-3 frames of the closest approach
    win = [i for i in range(max(0, i_hip - 3), min(n - 1, i_hip + 4))]
    i_stop = min(win, key=lambda i: step[i])
    # stroke along the blade axis that ends / starts at the hip
    strong = [abs(along[i]) > ALONG and v_rel[i] > STROKE_MIN_MPS for i in range(n)]
    # contiguous run nearest to i_hip
    runs, cur = [], []
    for i in range(n):
        if strong[i]:
            cur.append(i)
        elif cur:
            runs.append(cur); cur = []
    if cur:
        runs.append(cur)
    runs.sort(key=lambda r: min(abs(i - i_hip) for i in r))
    stroke = runs[0] if runs else None
    stroke_rec = None
    if stroke:
        a, b = stroke[0], stroke[-1]
        a0 = max(0, a - 1); b0 = min(n - 1, b + 1)       # central differences: the stroke spans the neighbouring frames
        disp = P[b0] - P[a0]
        stroke_rec = {'frames': [f0 + a0, f0 + b0], 't': [round(a0 / fps, 4), round(b0 / fps, 4)],
                      'sign': 'along grip axis (toward blade tip)' if np.mean(along[a:b + 1]) > 0 else 'against grip axis (hilt-first)',
                      'lengthM': round(float(np.linalg.norm(disp)), 4),
                      'meanAbsCos': round(float(np.mean(np.abs(along[a:b + 1]))), 3),
                      'gripAxisAtHip': r3(grip[i_hip], 3), 'handRStart': r3(P[a0]), 'handREnd': r3(P[b0])}
    i_top = int(np.argmax(P[:, 1]))
    peak = float(v_world.max()); i_peak = int(np.argmax(v_world))
    i_settle = None
    for i in range(n):
        if all(v_world[j] < SETTLE_MPS for j in range(i, n)):
            i_settle = i
            break
    i_lhip = int(np.argmin(l_hip))
    ev = {
        'handRClosestToLeftHip': {'frame': f0 + i_hip, 't': round(i_hip / fps, 4), 'distM': round(float(d_hip[i_hip]), 4),
                                  'handR': r3(P[i_hip]), 'gripAxis': r3(grip[i_hip], 3)},
        'handRClosestToHipSidePoint': {'frame': f0 + i_hip2, 't': round(i_hip2 / fps, 4), 'distM': round(float(d_hip2[i_hip2]), 4)},
        'handRStopAtHip': {'frames': [f0 + i_stop, f0 + i_stop + 1], 't': [round(i_stop / fps, 4), round((i_stop + 1) / fps, 4)],
                           'stepMps': round(float(step[i_stop]), 3), 'stepM': round(float(step[i_stop] / fps), 4)},
        'bladeAxisStroke': stroke_rec,
        'handRHighest': {'frame': f0 + i_top, 't': round(i_top / fps, 4), 'handR': r3(P[i_top])},
        'handRPeakSpeed': {'frame': f0 + i_peak, 't': round(i_peak / fps, 4), 'mps': round(peak, 3)},
        'handRSettleAtEnd': ({'frame': f0 + i_settle, 't': round(i_settle / fps, 4)} if i_settle is not None else None),
        'handRSpeedLastFrame': {'centralMps': round(float(v_world[-1]), 3), 'lastStepMps': round(float(step[n - 2]), 3)},
        'handRSpeedFirstFrame': {'centralMps': round(float(v_world[0]), 3), 'firstStepMps': round(float(step[0]), 3)},
        'handLClosestToLeftHip': {'frame': f0 + i_lhip, 't': round(i_lhip / fps, 4), 'distM': round(float(l_hip[i_lhip]), 4),
                                  'handL': r3(rel['hand_l'][i_lhip])},
        'handsClosest': {'frame': f0 + int(np.argmin(d_hands)), 't': round(int(np.argmin(d_hands)) / fps, 4),
                         'distM': round(float(d_hands.min()), 4)},
    }
    # which bones differ between the first and the last frame, and how curled the right fingers are (angle of each finger bone's
    # local rotation away from the rest pose, averaged over the 15 finger + 5 metacarpal bones of the right hand)
    Qa = np.array(Qall)
    dfl = np.degrees(2 * np.arccos(np.clip(np.abs(np.sum(Qa[0] * Qa[-1], axis=-1)), -1, 1)))
    over = sorted(((names[i], round(float(dfl[i]), 1)) for i in range(len(names)) if dfl[i] > 5 and not names[i].startswith(('ik_', 'interaction', 'center_of_mass'))),
                  key=lambda t: -t[1])
    fing = [i for i, nm_ in enumerate(names) if nm_.endswith('_r') and nm_.split('_')[0] in ('index', 'middle', 'ring', 'pinky', 'thumb')]
    curl = [round(float(np.degrees(2 * np.arccos(np.clip(np.abs(Qa[k, fing, 0]), -1, 1))).mean()), 2) for k in range(n)]
    rec = {'file': os.path.relpath(path, PACK).replace('\\', '/'), 'fps': fps, 'frameStart': f0, 'frameEnd': f1, 'frames': n,
           'duration': round((f1 - f0) / fps, 4), 'rootYawRangeDeg': round(max(yaw) - min(yaw), 3),
           'firstLastHandRDiffM': round(float(np.linalg.norm(P[0] - P[-1])), 4),
           'firstLastBonesOver5Deg': over,
           'rightFingerCurlDeg': {'note': 'mean angle of the right-hand finger bones away from their rest rotation (larger = more bent)',
                                  'first': curl[0], 'last': curl[-1], 'atHipStop': curl[i_stop], 'atHipStopNext': curl[i_stop + 1],
                                  'perFrame': curl},
           'events': ev, 'perFrame': rows}
    out['clips'][nm] = rec
    print('CLIP', nm, 'frames', f0, f1, 'fps', fps, 'yawRange', rec['rootYawRangeDeg'])
    for r in rows:
        print('  f%3d t=%.3f R=%s L=%s dHip=%.3f dSide=%.3f dLhip=%.3f vR=%.2f step=%s w=%.0f along=%.2f grip=%s' % (
            r['frame'], r['t'], r['hand_r'], r['hand_l'], r['dHandRLeftHip'], r['dHandRHipSide'], r['dHandLLeftHip'], r['vHandRWorld'],
            r['vHandRStep'], r['wristAngVelDegPs'], r['alongBlade'], r['gripAxis']))
    print('  EVENTS', json.dumps(ev))
    clear()
# is Unsheath = Sheath played backwards?
if 'Sheath' in raw and 'Unsheath' in raw:
    A, Bq = raw['Sheath'], raw['Unsheath']
    if A['Q'].shape == Bq['Q'].shape and A['names'] == Bq['names']:
        Qa, Qb = A['Q'], Bq['Q'][::-1]
        d = np.abs(np.sum(Qa * Qb, axis=-1))
        ang = np.degrees(2 * np.arccos(np.clip(d, -1, 1)))
        rootd = np.linalg.norm(A['root'] - Bq['root'][::-1], axis=1)
        out['unsheathIsReversedSheath'] = {'maxBoneRotDiffDeg': round(float(ang.max()), 4), 'meanBoneRotDiffDeg': round(float(ang.mean()), 5),
                                           'maxRootPosDiffM': round(float(rootd.max()), 5),
                                           'note': 'compares Sheath frame i with Unsheath frame (last - i) for all 88 bones (local rotations) and the root'}
        # and the same comparison without reversing, for scale
        if Qa.shape[0] == Qb.shape[0]:
            d2 = np.abs(np.sum(Qa * Bq['Q'], axis=-1))
            out['unsheathIsReversedSheath']['forwardOrderMaxRotDiffDeg'] = round(float(np.degrees(2 * np.arccos(np.clip(d2, -1, 1))).max()), 3)
        print('REVERSE CHECK', out['unsheathIsReversedSheath'])
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('WROTE', OUT)
