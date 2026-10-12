# 第二十五轮：单手剑动作包（One Handed Sword Animation V5 FBX，IP / RM 两套）逐个导入实测 → JSON Lines（可断点续跑）
#   每个动作：fps（导入后场景帧率）、帧范围、时长、首尾帧姿态差（最大骨骼旋转差，度）、
#   根位移（RM：总位移 x/y/z 米 + 偏航变化；IP：根与骨盆的水平漂移）。
#   主测量用 Python FBX 导入器（与 r24 相同，automatic_bone_orientation=False），另用 C++ 导入器（wm.fbx_import）交叉核对 fps / 帧范围 / 根位移。
#   输出坐标约定（与 glTF / three.js 一致）：+Y 向上，+Z = 角色在该动作第一帧的朝向（前），+X = 角色的左侧。
#   朝向由骨架自身测得（静止姿态：左右大腿根连线 = 左右，脚跟→脚掌 = 前），不靠文件名。
#   资源目录只读：本脚本只读 FBX，输出写到命令行给的路径。
# 用法：blender -b --factory-startup --python tools/r25_inventory_sword.py -- <包目录（含 IP、RM）> <输出 .jsonl> [起始序号 结束序号]
import bpy, sys, os, json, math, time
import numpy as np
from mathutils import Vector, Matrix, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:]
PACK, OUT = argv[0], argv[1]
I0 = int(argv[2]) if len(argv) > 2 else 0
I1 = int(argv[3]) if len(argv) > 3 else 10 ** 9
PREFIX = 'A_OneHandedSwordAnimV5_'
SENTINEL_FPS = 7
scn = bpy.context.scene
HELPER = ('ik_', 'interaction', 'center_of_mass')


def clip_names():
    names = set()
    for sub, suf in (('IP', '_IP.fbx'), ('RM', '_RM.fbx')):
        for fn in os.listdir(os.path.join(PACK, sub)):
            if fn.startswith(PREFIX) and fn.endswith(suf):
                names.add(fn[len(PREFIX):-len(suf)])
    return sorted(names)


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    for d in list(bpy.data.armatures):
        bpy.data.armatures.remove(d)


def do_import(path, which):
    clear()
    scn.render.fps = SENTINEL_FPS
    scn.render.fps_base = 1.0
    if which == 'py':
        bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    else:
        bpy.ops.wm.fbx_import(filepath=path)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    return arm


def char_axes_local(arm):
    """Character axes in the armature object's local space, measured from the rest skeleton."""
    B = arm.data.bones
    left = B['thigh_l'].head_local - B['thigh_r'].head_local
    up = Vector((0, 0, 1))
    left = (left - up * left.dot(up)).normalized()
    fwd = left.cross(up).normalized()            # left x up = forward (right-handed, Z up)
    toe = ((B['ball_l'].head_local - B['foot_l'].head_local) + (B['ball_r'].head_local - B['foot_r'].head_local))
    toe = (toe - up * toe.dot(up)).normalized()
    return left, up, fwd, toe


def qangle_deg(q0, q1):
    d = abs(float(np.sum(q0 * q1, axis=-1))) if q0.ndim == 1 else np.abs(np.sum(q0 * q1, axis=-1))
    return np.degrees(2 * np.arccos(np.clip(d, -1.0, 1.0)))


def measure(path, rm):
    t0 = time.time()
    arm = do_import(path, 'py')
    rec = {'file': os.path.relpath(path, PACK).replace('\\', '/')}
    rec['fps'] = scn.render.fps / scn.render.fps_base
    rec['fpsSetByImporter'] = not (scn.render.fps == SENTINEL_FPS and scn.render.fps_base == 1.0)
    act = arm.animation_data.action
    rec['action'] = act.name
    f0, f1 = act.frame_range
    rec['frameStart'], rec['frameEnd'] = round(f0, 4), round(f1, 4)
    rec['frameRangeIntegral'] = abs(f0 - round(f0)) < 1e-4 and abs(f1 - round(f1)) < 1e-4
    F0, F1 = int(round(f0)), int(round(f1))
    rec['frames'] = F1 - F0 + 1
    rec['duration'] = round((f1 - f0) / rec['fps'], 4)
    # key count on the pelvis rotation curve (baked per frame?)
    nk = set()
    for L in act.layers:
        for st in L.strips:
            for cb in st.channelbags:
                for fc in cb.fcurves:
                    nk.add(len(fc.keyframe_points))
    rec['keysPerCurve'] = sorted(nk)
    rec['bones'] = len(arm.data.bones)
    left_l, up_l, fwd_l, toe_l = char_axes_local(arm)
    rec['axesLocal'] = {'left': [round(v, 4) for v in left_l], 'fwd': [round(v, 4) for v in fwd_l], 'toeFwd': [round(v, 4) for v in toe_l]}
    pbs = arm.pose.bones
    body = [i for i, pb in enumerate(pbs) if not pb.name.startswith(HELPER)]
    names = [pb.name for pb in pbs]
    ip_pel = names.index('pelvis')
    nF = F1 - F0 + 1
    Q = np.zeros((nF, len(pbs), 4))
    H = np.zeros((nF, len(pbs), 3))        # bone heads in root (armature object) space, metres
    rootP = np.zeros((nF, 3)); rootF = np.zeros((nF, 3)); pelW = np.zeros((nF, 3))
    for k, f in enumerate(range(F0, F1 + 1)):
        scn.frame_set(f)
        mw = arm.matrix_world
        s = mw.to_scale()[0]
        R = mw.to_3x3().normalized()
        rootP[k] = mw.translation
        rootF[k] = R @ fwd_l
        for i, pb in enumerate(pbs):
            q = pb.matrix_basis.to_quaternion()
            Q[k, i] = (q.w, q.x, q.y, q.z)
            H[k, i] = pb.head * s
        pelW[k] = mw @ pbs['pelvis'].head
    rec['rootScaleToMetres'] = round(s, 6)
    # ---- first vs last pose ----
    if nF > 1:
        rd = qangle_deg(Q[0, body], Q[-1, body])
        pdist = np.linalg.norm(H[0, body] - H[-1, body], axis=1)
        steps = np.array([qangle_deg(Q[k, body], Q[k + 1, body]).max() for k in range(nF - 1)])
        psteps = np.array([np.linalg.norm(H[k, body] - H[k + 1, body], axis=1).max() for k in range(nF - 1)])
        ib = int(np.argmax(rd)); jb = int(np.argmax(pdist))
        rec['loop'] = {
            'maxRotDiffDeg': round(float(rd.max()), 3), 'maxRotBone': names[body[ib]],
            'meanRotDiffDeg': round(float(rd.mean()), 3),
            'maxPosDiffM': round(float(pdist.max()), 4), 'maxPosBone': names[body[jb]],
            'pelvisPosDiffM': round(float(np.linalg.norm(H[0, ip_pel] - H[-1, ip_pel])), 4),
            'medianStepDeg': round(float(np.median(steps)), 3), 'maxStepDeg': round(float(steps.max()), 3),
            'medianStepPosM': round(float(np.median(psteps)), 4),
        }
    # ---- root motion, in the character frame of the first frame ----
    up = np.array([0.0, 0.0, 1.0])
    fw0 = rootF[0] - up * rootF[0].dot(up); fw0 /= np.linalg.norm(fw0)
    lf0 = np.cross(up, fw0)
    def to_char(d):
        return [float(d.dot(lf0)), float(d.dot(up)), float(d.dot(fw0))]   # x = left, y = up, z = forward
    d = rootP[-1] - rootP[0]
    rel = rootP - rootP[0]
    horiz = rel - np.outer(rel.dot(up), up)
    steps_h = np.linalg.norm(np.diff(horiz, axis=0), axis=1) if nF > 1 else np.zeros(1)
    yaw = np.unwrap(np.arctan2(rootF[:, 1], rootF[:, 0]))
    yawd = np.degrees(yaw - yaw[0])
    yaw_world0 = math.degrees(math.atan2(fw0[1], fw0[0]))
    root = {
        'startBlenderM': [round(float(v), 4) for v in rootP[0]],
        'startYawVsFileDeg': round(math.degrees(math.atan2(fw0[0], -fw0[1])), 3),   # 0 = facing Blender -Y, + = turned left (CCW seen from above)
        'disp': [round(v, 4) for v in to_char(d)],
        'horizM': round(float(np.linalg.norm(horiz[-1])), 4),
        'pathM': round(float(steps_h.sum()), 4),
        'maxExcursionM': round(float(np.linalg.norm(horiz, axis=1).max()), 4),
        'vertRangeM': [round(float(rel.dot(up).min()), 4), round(float(rel.dot(up).max()), 4)],
        'yawChangeDeg': round(float(yawd[-1]), 3),
        'yawMaxAbsDeg': round(float(np.abs(yawd).max()), 3),
    }
    if rec['duration'] > 0:
        root['avgSpeedHMps'] = round(root['horizM'] / rec['duration'], 4)
    rec['root'] = root
    if rm:
        fps = rec['fps']
        rec['rootPath'] = [[round((k) / fps, 4)] + [round(v, 4) for v in to_char(rootP[k] - rootP[0])] + [round(float(yawd[k]), 2)] for k in range(nF)]
    # pelvis horizontal motion in world (includes root drift) and relative to the root
    pr = pelW - pelW[0]
    ph = pr - np.outer(pr.dot(up), up)
    pl = H[:, ip_pel] - H[0, ip_pel]
    plh = pl - np.outer(pl[:, 2], [0, 0, 1])
    rec['pelvis'] = {
        'worldDisp': [round(v, 4) for v in to_char(pr[-1])],
        'worldNetHorizM': round(float(np.linalg.norm(ph[-1])), 4),
        'worldMaxHorizM': round(float(np.linalg.norm(ph, axis=1).max()), 4),
        'relRootNetHorizM': round(float(np.linalg.norm(plh[-1])), 4),
        'relRootMaxHorizM': round(float(np.linalg.norm(plh, axis=1).max()), 4),
    }
    rec['tPy'] = round(time.time() - t0, 2)
    # ---- cross-check with the C++ importer ----
    t1 = time.time()
    try:
        arm2 = do_import(path, 'cpp')
        act2 = arm2.animation_data.action
        g0, g1 = act2.frame_range
        fps2 = scn.render.fps / scn.render.fps_base
        scn.frame_set(int(round(g0))); p0 = arm2.matrix_world.translation.copy()
        scn.frame_set(int(round(g1))); p1 = arm2.matrix_world.translation.copy()
        dd = np.array(p1 - p0)
        c = {'fps': fps2, 'frameStart': round(g0, 4), 'frameEnd': round(g1, 4), 'rootDisp': [round(v, 4) for v in to_char(dd)],
             'take': act2.name}
        rec['take'] = act2.name                       # FBX animation stack (take) name stored inside the file
        c['agree'] = (abs(fps2 - rec['fps']) < 1e-6 and abs(g0 - f0) < 1e-3 and abs(g1 - f1) < 1e-3
                      and float(np.abs(dd - d).max()) < 1e-3)
        rec['cpp'] = c
    except Exception as e:
        rec['cpp'] = {'error': repr(e)}
    rec['tCpp'] = round(time.time() - t1, 2)
    clear()
    return rec


done = set()
if os.path.exists(OUT):
    for line in open(OUT, encoding='utf-8'):
        line = line.strip()
        if line:
            done.add(json.loads(line)['name'])
names = clip_names()
print('CLIPS', len(names), 'already done', len(done))
with open(OUT, 'a', encoding='utf-8') as fo:
    for idx, nm in enumerate(names):
        if idx < I0 or idx >= I1 or nm in done:
            continue
        rec = {'name': nm, 'index': idx, 'nameHasLoopable': 'Loopable' in nm}
        for sub, rm in (('IP', False), ('RM', True)):
            p = os.path.join(PACK, sub, f'{PREFIX}{nm}_{sub}.fbx')
            if os.path.exists(p):
                try:
                    rec[sub] = measure(p, rm)
                except Exception as e:
                    import traceback
                    rec[sub] = {'file': os.path.relpath(p, PACK).replace('\\', '/'), 'error': repr(e), 'trace': traceback.format_exc()}
            else:
                rec[sub] = None
        fo.write(json.dumps(rec, ensure_ascii=False) + '\n')
        fo.flush()
        ip, rmr = rec.get('IP') or {}, rec.get('RM') or {}
        print('DONE', idx, nm, 'IP', ip.get('frames'), ip.get('duration'), 'RM', rmr.get('frames'), (rmr.get('root') or {}).get('disp'),
              'loopDeg', (ip.get('loop') or rmr.get('loop') or {}).get('maxRotDiffDeg'), 't', ip.get('tPy'), rmr.get('tPy'))
print('ALL DONE')
