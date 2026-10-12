# 第二十四轮：烬狱剑尊 → 网页用的 glb：骨架（25 根变形骨）、蒙皮身体、挂在右手的剑、动作（素材里的实际动作 + 用素材动作拼出 / 摆出的几段），
# 另出动作的根运动与出手标记（json）、场景笔画（场地装饰用，静态 glb）。
# 用法：blender -b --factory-startup --python export_boss30.py -- <boss30_rigged.blend> <动作包目录（含 IP、RM）> <输出目录> [只导出的动作名,…]
import bpy, bmesh, sys, os, json, math
import numpy as np
from mathutils import Vector, Matrix, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:]
BLEND, PACK, OUT = argv[:3]
ONLY = set(argv[3].split(',')) if len(argv) > 3 and argv[3] else None
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene
FPS = 30
scn.render.fps = FPS
arm = bpy.data.objects['boss30']; body = bpy.data.objects['boss30_body']; sword = bpy.data.objects['boss30_sword']; props = bpy.data.objects.get('boss30_props')
info = json.load(open(os.path.join(os.path.dirname(BLEND), 'rig_info.json')))
K = info['k']
DEF = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'spine_04', 'spine_05', 'neck_01', 'neck_02', 'head', 'clavicle_l', 'clavicle_r',
       'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r']
LOWER = {'pelvis', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r'}
REPORT = {}

# =====================================================================================
# 一、网格：双面笔画去重（Tilt Brush 把双面笔画导出成正反两份同位置的网格；留一份，网页里用双面材质）
# =====================================================================================
def components(me):
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    comp = np.full(len(bm.verts), -1); n = 0
    for v in bm.verts:
        if comp[v.index] >= 0: continue
        st = [v]; comp[v.index] = n
        while st:
            x = st.pop()
            for e in x.link_edges:
                y = e.other_vert(x)
                if comp[y.index] < 0: comp[y.index] = n; st.append(y)
        n += 1
    bm.free()
    return comp, n
def dedupe(ob):
    me = ob.data
    V = np.array([tuple(v.co) for v in me.vertices])
    comp, n = components(me)
    order = np.argsort(comp, kind='stable'); bounds = np.searchsorted(comp[order], np.arange(n + 1))
    seen = {}; drop = np.zeros(len(V), bool); dup = 0
    for c in range(n):
        ids = order[bounds[c]:bounds[c + 1]]
        P = np.round(V[ids] * 2000).astype(np.int64)          # 0.5 毫米
        P = P[np.lexsort(P.T[::-1])]
        key = (len(ids), hash(P.tobytes()))
        if key in seen: drop[ids] = True; dup += 1
        else: seen[key] = c
    if dup:
        bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.where(drop)[0]], context='VERTS')
        bm.to_mesh(me); bm.free()
    return {'components': int(n), 'duplicates': int(dup), 'verts': [int(len(V)), len(me.vertices)]}

# =====================================================================================
# 二、剑：拳里的握持（右手骨本地，各动作里恒定——手指不动）
# =====================================================================================
def grip_world():
    pb = arm.pose.bones
    w = lambda n: arm.matrix_world @ pb[n].head
    i1, p1, m1, h = w('index_01_r'), w('pinky_01_r'), w('middle_01_r'), w('hand_r')
    ax = (i1 - p1).normalized(); grip = (i1 + p1 + m1) / 3 * 0.6 + h * 0.4
    palm = (m1 - h).normalized(); wide = (palm - ax * palm.dot(ax)).normalized(); z = wide.cross(ax).normalized()
    M = Matrix((wide, ax, z)).transposed().to_4x4(); M.translation = grip
    return M
for pb in arm.pose.bones: pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()
HL = (arm.matrix_world @ arm.pose.bones['hand_r'].matrix).inverted() @ grip_world()
REPORT['grip_hand_local'] = [[round(x, 5) for x in r] for r in HL]

# =====================================================================================
# 三、动作：导入 FBX，只留变形骨的转动与骨盆位移（厘米 → Boss 米），根运动另存
# =====================================================================================
def fbx_path(nm):
    for sub, suf in (('RM', 'RM'), ('IP', 'IP')):
        p = os.path.join(PACK, sub, f'A_OneHandedSwordAnimV5_{nm}_{suf}.fbx')
        if os.path.exists(p): return p, suf
    raise FileNotFoundError(nm)
def channels(act):
    return [fc for l in act.layers for st in l.strips for cb in st.channelbags for fc in cb.fcurves]
def import_clip(nm):
    path, suf = fbx_path(nm)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    src = next(o for o in bpy.data.objects if o not in before and o.type == 'ARMATURE')
    act = src.animation_data.action
    for o in [o for o in bpy.data.objects if o not in before]: bpy.data.objects.remove(o, do_unlink=True)
    root = {}
    for l in act.layers:
        for st in l.strips:
            for cb in st.channelbags:
                for fc in list(cb.fcurves):
                    dp = fc.data_path
                    if not dp.startswith('pose.bones['):
                        root[(dp, fc.array_index)] = [(kp.co[0], kp.co[1]) for kp in fc.keyframe_points]
                        cb.fcurves.remove(fc); continue
                    bn = dp.split('"')[1]; prop = dp.rsplit('.', 1)[1]
                    keep = bn in DEF and (prop == 'rotation_quaternion' or (prop == 'location' and bn == 'pelvis'))
                    if not keep: cb.fcurves.remove(fc); continue
                    if prop == 'location':
                        for kp in fc.keyframe_points: kp.co[1] *= K; kp.handle_left[1] *= K; kp.handle_right[1] *= K
    f0, f1 = act.frame_range
    # 根运动（RM 的物体位置：厘米，父空物体缩放 0.01）→ three.js 的本地坐标（+Z 朝前、+X 是 Boss 的左手边），每帧一点
    rm = None
    rx, ry = root.get(('location', 0)), root.get(('location', 1))
    if suf == 'RM' and rx and ry:
        x0, y0 = rx[0][1], ry[0][1]
        rm = [[round((t - f0) / FPS, 4), round((x - x0) * K, 4), round(-(y - y0) * K, 4)] for (t, x), (_, y) in zip(rx, ry)]
    return act, (int(round(f0)), int(round(f1))), rm, suf

# 素材动作 → 游戏里的名字（都按素材的实际动作命名，见报告的映射表）
DIRECT = {
    'idle': 'Idle2', 'idle_flourish': 'Idle1', 'idle_sheathed': 'Idle3', 'unsheath': 'Unsheath', 'sheath': 'Sheath',
    'walk_f': 'Walk_Fw_Loopable', 'walk_b': 'Walk_Bw_Loopable', 'walk_l': 'Walk_L_Loopable', 'walk_r': 'Walk_R_Loopable', 'run_f': 'Run_Fw_Loopable',
    'hit_f': 'Hit_Fw', 'hit_b': 'Hit_Bw', 'hit_l': 'Hit_L', 'hit_r': 'Hit_R', 'dodge_b': 'Dodge_Bw', 'dash_f': 'Dash_Fw', 'death_f': 'Death_Fw',
    'jump': 'Jump', 'jump_start': 'Jump_Start', 'jump_air': 'Jump_OnAir', 'jump_land': 'Jump_Land',
    'a1': 'Attack1', 'a2s1': 'Attack2_Stage1', 'a2s2': 'Attack2_Stage2', 'a2s3': 'Attack2_Stage3',
    'a3s2': 'Attack3_Stage2', 'a4': 'Attack4', 'a5s1': 'Attack5_Stage1', 'a5s2': 'Attack5_Stage2',
    'a6s1': 'Attack6_Stage1', 'a6s1c': 'Attack6_Stage1_Complete', 'a6s2': 'Attack6_Stage2', 'a6s2b': 'Attack6_Stage2_Back', 'a6s3c': 'Attack6_Stage3_Complete',
    'a7s1': 'Attack7_Stage1', 'a7s1b': 'Attack7_Stage1_Back', 'a7s2': 'Attack7_Stage2', 'a7s2b': 'Attack7_Stage2_Back', 'a7s3': 'Attack7_Stage3',
    'a8s1': 'Attack8_Stage1', 'a8s1b': 'Attack8_Stage1_Back', 'a8s1c': 'Attack8_Stage1_Complete', 'a8s2c': 'Attack8_Stage2_Complete',
    'a9s1': 'Attack9_Stage1', 'a9s2': 'Attack9_Stage2', 'a9s2c': 'Attack9_Stage2_Complete',
    'a10s1': 'Attack10_Stage1', 'a10s2': 'Attack10_Stage2',
}
LOOP = {'idle', 'idle_sheathed', 'walk_f', 'walk_b', 'walk_l', 'walk_r', 'run_f', 'jump_air'}
CLIPS = {}            # 游戏名 → { action, frames, root, src, loop }
for gname, src in DIRECT.items():
    if ONLY and gname not in ONLY: continue
    act, fr, rm, suf = import_clip(src)
    act.name = 'b30_' + gname; act.use_fake_user = True
    CLIPS[gname] = {'action': act, 'frames': fr, 'root': rm, 'src': f'{src}_{suf}', 'loop': gname in LOOP}
    print('CLIP', gname, src, suf, fr, 'root' if rm else '')

# =====================================================================================
# 四、摆姿势、拼动作的小工具（骨架空间：人物朝 −Y、+Z 向上；Boss 的右手边是 −X）
# =====================================================================================
P = arm.pose.bones
def upd(): bpy.context.view_layer.update()
def sample(act, frame):
    """动作在某一帧的各骨本地值：{骨: (四元数, 位移)}（fcurve 直接取值，不经依赖图）"""
    q = {}; loc = {}
    for fc in channels(act):
        bn = fc.data_path.split('"')[1]; prop = fc.data_path.rsplit('.', 1)[1]
        if prop == 'rotation_quaternion': q.setdefault(bn, [1, 0, 0, 0])[fc.array_index] = fc.evaluate(frame)
        elif prop == 'location': loc.setdefault(bn, [0, 0, 0])[fc.array_index] = fc.evaluate(frame)
    return {b: (Quaternion(q.get(b, (1, 0, 0, 0))).normalized(), Vector(loc.get(b, (0, 0, 0)))) for b in DEF}
def apply(pose):
    for b in DEF:
        qv, lv = pose[b]
        P[b].rotation_mode = 'QUATERNION'; P[b].rotation_quaternion = qv; P[b].location = lv if b == 'pelvis' else Vector((0, 0, 0)); P[b].scale = (1, 1, 1)
    upd()
def capture():
    return {b: (P[b].rotation_quaternion.copy(), P[b].location.copy()) for b in DEF}
def blend(a, b, u, bones=None):
    out = {}
    for n in DEF:
        if bones is not None and n not in bones: out[n] = a[n]; continue
        qa, la = a[n]; qb, lb = b[n]
        if qa.dot(qb) < 0: qb = -qb
        out[n] = (qa.slerp(qb, u), la.lerp(lb, u))
    return out
def mix(upper, lower):
    return {n: (lower[n] if n in LOWER else upper[n]) for n in DEF}
def aim(bn, cur_vec, tgt_vec):
    """绕骨根转，使骨架空间里的 cur_vec 对准 tgt_vec（最小转动）"""
    h = P[bn].head.copy()
    q = cur_vec.normalized().rotation_difference(tgt_vec.normalized())
    P[bn].matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ P[bn].matrix
    upd()
def two_bone(up, lo, end, target, pole):
    """两节 IK：up 的根固定，end 的根落到 target，中间关节朝 pole 一侧弯"""
    A = P[up].head.copy(); B = P[lo].head.copy(); C = P[end].head.copy()
    L1 = (B - A).length; L2 = (C - B).length
    d = max(abs(L1 - L2) + 1e-3, min(L1 + L2 - 1e-3, (target - A).length))
    u = (target - A).normalized()
    v = (pole - A) - u * (pole - A).dot(u); v.normalize()
    ca = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d); sa = math.sqrt(max(0, 1 - ca * ca))
    knee = A + u * (ca * L1) + v * (sa * L1)
    aim(up, P[lo].head - P[up].head, knee - A)
    aim(lo, P[end].head - P[lo].head, target - P[lo].head)
def set_world_rot(bn, R):
    h = P[bn].head.copy()
    M = R.to_4x4(); M.translation = h
    P[bn].matrix = M; upd()
SW_AX = HL.to_3x3() @ Vector((0, 1, 0)); SW_WIDE = HL.to_3x3() @ Vector((1, 0, 0))      # 剑轴、刃宽方向（右手骨本地）
def orient_sword(axis_tgt, wide_hint):
    """转右手，使剑尖方向 = axis_tgt，刃宽方向尽量贴近 wide_hint（骨架空间）"""
    R = P['hand_r'].matrix.to_3x3()
    a = (R @ SW_AX).normalized()
    R = (a.rotation_difference(axis_tgt.normalized()).to_matrix()) @ R
    w = (R @ SW_WIDE); t = axis_tgt.normalized()
    w = (w - t * w.dot(t)).normalized(); wh = (wide_hint - t * wide_hint.dot(t)).normalized()
    ang = math.atan2(t.dot(w.cross(wh)), w.dot(wh))
    R = Matrix.Rotation(ang, 3, t) @ R
    set_world_rot('hand_r', R)
def grip_now():
    return (P['hand_r'].matrix @ HL).translation
def new_action(name):
    act = bpy.data.actions.new('b30_' + name); act.use_fake_user = True
    arm.animation_data_create(); arm.animation_data.action = act
    return act
def key_pose(pose, frame):
    apply(pose)
    for b in DEF:
        P[b].keyframe_insert('rotation_quaternion', frame=frame, group=b)
        if b == 'pelvis': P[b].keyframe_insert('location', frame=frame, group=b)
def bake(name, n, fn, loop=False, root=None):
    """逐帧 fn(i) → 姿势，烘成一段动作（帧 1 … n）"""
    act = new_action(name)
    for i in range(n):
        key_pose(fn(i), i + 1)
    if act.slots: arm.animation_data.action_slot = act.slots[0]
    arm.animation_data.action = None
    CLIPS[name] = {'action': act, 'frames': (1, n), 'root': root, 'src': 'authored', 'loop': loop}
    return act
def wobble(pose, t, k=1.0):
    """呼吸 / 蓄势的微动：脊柱、颈、右臂几根骨各加一点慢正弦（弧度很小）"""
    out = dict(pose)
    for bn, ax, amp, fr, ph in (('spine_03', (1, 0, 0), 0.018, 0.55, 0), ('spine_05', (1, 0, 0), 0.012, 0.55, 0.6), ('neck_01', (0, 0, 1), 0.01, 0.3, 1.1),
                                ('upperarm_r', (1, 0, 0), 0.012, 0.8, 0.3), ('lowerarm_r', (0, 0, 1), 0.01, 1.3, 0.9)):
        q, l = out[bn]
        out[bn] = (q @ Quaternion(Vector(ax), amp * k * math.sin(t * fr * math.tau + ph)), l)
    return out

# 底姿势：待机第 1 帧
IDLE = sample(CLIPS['idle']['action'], CLIPS['idle']['frames'][0]) if 'idle' in CLIPS else None

# ---------- 截锋架势（格挡姿势）：沉胯，右手持剑斜立于身前（剑尖向左上，刃口朝前），左手护在胸侧 ----------
def pose_guard():
    apply(IDLE)
    pw = P['pelvis']
    pw.location = pw.location + (pw.bone.matrix_local.inverted().to_3x3() @ Vector((0, 0, -0.09))); upd()
    # 腿：脚掌不动，膝盖朝前弯（骨盆降了 9 厘米）
    feet = {s: (P['foot_' + s].head.copy(), P['foot_' + s].matrix.to_3x3().copy(), P['ball_' + s].matrix.to_3x3().copy()) for s in 'lr'}
    for s in 'lr':
        fh, fr, br = feet[s]
        two_bone('thigh_' + s, 'calf_' + s, 'foot_' + s, fh, P['calf_' + s].head + Vector((0, -0.6, 0.05)))
        set_world_rot('foot_' + s, fr); set_world_rot('ball_' + s, br)
    # 上身：右肩略向后拧、前倾一点
    for bn, ang, ax in (('spine_02', 0.06, (1, 0, 0)), ('spine_03', -0.16, (0, 0, 1)), ('spine_04', -0.1, (0, 0, 1))):
        q, l = P[bn].rotation_quaternion.copy(), P[bn].location.copy()
        P[bn].rotation_quaternion = q @ Quaternion(Vector(ax), ang); upd()
    sh = P['upperarm_r'].head.copy()
    wrist = sh + Vector((0.30, -0.42, -0.30))                       # 右手腕在胸前偏右
    two_bone('upperarm_r', 'lowerarm_r', 'hand_r', wrist, sh + Vector((-0.5, 0.1, -0.6)))
    orient_sword(Vector((0.55, -0.25, 0.80)), Vector((0, -1, 0)))  # 剑尖朝左上；刃宽朝前后（刃口对着来招）
    shl = P['upperarm_l'].head.copy()
    two_bone('upperarm_l', 'lowerarm_l', 'hand_l', shl + Vector((-0.12, -0.32, -0.38)), shl + Vector((0.5, 0.2, -0.5)))
    # 头：看向前方
    aim('head', P['head'].matrix.to_3x3() @ (P['head'].bone.matrix_local.to_3x3().inverted() @ Vector((0, -1, 0))), Vector((0, -1, 0.05)))
    return capture()

# ---------- 单膝跪地（失衡、转阶段、击败）：右膝着地，左脚在前；右手握剑拄地（剑尖点地），左手搭在左膝；低头 ----------
def pose_kneel(slump=False):
    apply(IDLE)
    pw = P['pelvis']
    cur = pw.head.copy()
    want = Vector((cur.x, cur.y - 0.05, 0.66))
    pw.location = pw.location + (pw.bone.matrix_local.inverted().to_3x3() @ (want - cur)); upd()
    # 骨盆前倾
    pw.rotation_quaternion = pw.rotation_quaternion @ Quaternion(Vector((1, 0, 0)), 0.12); upd()
    hipL = P['thigh_l'].head.copy(); hipR = P['thigh_r'].head.copy()
    # 左腿：脚在前方踩地，膝盖抬起
    ankL = Vector((hipL.x + 0.05, hipL.y - 0.52, 0.10))
    two_bone('thigh_l', 'calf_l', 'foot_l', ankL, hipL + Vector((0, -1.0, 0.4)))
    aim('foot_l', P['ball_l'].head - P['foot_l'].head, Vector((0, -1, -0.12)))
    # 右腿：膝盖着地在骨盆下稍后，脚尖向后点地
    ankR = Vector((hipR.x - 0.02, hipR.y + 0.42, 0.13))
    two_bone('thigh_r', 'calf_r', 'foot_r', ankR, hipR + Vector((0, -1.2, -0.75)))
    aim('foot_r', P['ball_r'].head - P['foot_r'].head, Vector((0, 0.45, -1)))
    # 上身前俯、低头
    for bn, ang in (('spine_02', 0.12), ('spine_03', 0.14), ('spine_05', 0.08), ('neck_01', 0.2 if slump else 0.12), ('head', 0.25 if slump else 0.15)):
        P[bn].rotation_quaternion = P[bn].rotation_quaternion @ Quaternion(Vector((1, 0, 0)), -ang if bn in ('neck_01', 'head') else ang); upd()
    # 右手：握剑拄地（剑尖点在右膝前方的地上，剑身略向前斜）
    tip = Vector((hipR.x - 0.12, hipR.y - 0.58, 0.02))
    axis = Vector((0.02, 0.22, 1.0)).normalized()                       # 剑尖 → 剑柄（向上、略向后）
    grip = tip + axis * info['sword']['tipFromGrip']
    sh = P['upperarm_r'].head.copy()
    # 手腕的目标：握点往手里退一点（握点在手骨根前约 8 厘米）
    for it in range(3):
        g = grip_now(); w = P['hand_r'].head.copy()
        two_bone('upperarm_r', 'lowerarm_r', 'hand_r', w + (grip - g), sh + Vector((-0.6, 0.2, -0.3)))
        orient_sword(-axis, Vector((0, -1, 0)))
    if slump:
        # 击败：右臂垂下（剑由程序脱手掉落）
        two_bone('upperarm_r', 'lowerarm_r', 'hand_r', sh + Vector((-0.05, -0.12, -0.58)), sh + Vector((-0.5, 0.3, -0.3)))
    shl = P['upperarm_l'].head.copy()
    kneeL = P['calf_l'].head.copy()
    two_bone('upperarm_l', 'lowerarm_l', 'hand_l', kneeL + Vector((0.02, -0.04, 0.10)), shl + Vector((0.6, 0.3, -0.4)))
    return capture()

if IDLE is not None and (not ONLY or 'guard' in ONLY):
    G = pose_guard()
    bake('guard', 60, lambda i: wobble(G, i / FPS, 1.0), loop=True)
    KN = pose_kneel(False)
    bake('kneel', 60, lambda i: wobble(KN, i / FPS, 1.4), loop=True)
    KS = pose_kneel(True)
    bake('kneel_slump', 45, lambda i: wobble(KS, i / FPS, 0.6), loop=True)
    print('AUTHORED guard / kneel / kneel_slump')

# ---------- 拼出来的几段 ----------
def frames_of(nm): return CLIPS[nm]['frames']
def at(nm, f): return sample(CLIPS[nm]['action'], f)
if all(n in CLIPS for n in ('dash_f', 'idle')) and IDLE is not None and (not ONLY or 'thrust_dash' in ONLY):
    # 留锋突刺：动作包里没有直刺（逐段量过剑尖轨迹：Attack2_Stage3 是齐头高的横扫，Attack5_Stage1 是向下的斜劈，剑尖落到地面）。
    # 下身用冲刺（Dash_Fw）的真实步子；上身「拉剑蓄刺 → 直刺」用两节 IK 摆（制作的动作，见报告的清单）。
    # 0–0.8 秒沉身拉剑（0.35 秒摆到位，之后蓄势微动）→ 0.8–1.1 冲刺，其中 0.8–1.0 右臂直刺出去、剑尖平指前方齐胸高 →
    # 1.1–2.0 收势 0.9 秒（刺姿停 0.12 秒，再回到待机）。冲刺的位移由程序给（距离按预判的翻滚落点）
    def thrust_pose(lower, ext):
        """ext=0：拉剑蓄刺（右手收在右胯后、剑平指前方）；ext=1：直刺（右臂伸直、剑尖略向下）。下身取给定的姿势"""
        apply(mix(IDLE, lower))
        for bn, ax, a0, a1 in (('spine_02', (1, 0, 0), 0.10, 0.16), ('spine_03', (0, 0, 1), -0.24, 0.22), ('spine_04', (0, 0, 1), -0.12, 0.10)):
            P[bn].rotation_quaternion = P[bn].rotation_quaternion @ Quaternion(Vector(ax), a0 + (a1 - a0) * ext); upd()
        sh = P['upperarm_r'].head.copy()
        wrist = (sh + Vector((-0.06, 0.24, -0.46))).lerp(sh + Vector((0.10, -0.66, -0.20)), ext)
        pole = (sh + Vector((-0.6, 0.5, -0.2))).lerp(sh + Vector((-0.6, 0.0, -0.5)), ext)
        two_bone('upperarm_r', 'lowerarm_r', 'hand_r', wrist, pole)
        orient_sword(Vector((0.06, -1, 0.10)).lerp(Vector((0.03, -1, -0.10)), ext), Vector((1, 0, 0)))     # 刃面朝上下（平刺）
        shl = P['upperarm_l'].head.copy()
        two_bone('upperarm_l', 'lowerarm_l', 'hand_l', (shl + Vector((-0.05, -0.42, -0.18))).lerp(shl + Vector((0.16, 0.22, -0.40)), ext), shl + Vector((0.6, 0.1, -0.4)))
        aim('head', P['head'].matrix.to_3x3() @ (P['head'].bone.matrix_local.to_3x3().inverted() @ Vector((0, -1, 0))), Vector((0, -1, -0.05)))
        return capture()
    A0 = IDLE; CH = thrust_pose(at('dash_f', 3), 0.0); EX = thrust_pose(at('dash_f', 14), 1.0)
    def td(i):
        t = i / FPS
        if t < 0.8:
            u = min(1, t / 0.35); u = u * u * (3 - 2 * u)
            return wobble(blend(A0, CH, u), t, 0.8 * u * min(1, (0.8 - t) / 0.1))
        if t < 1.1:
            v = (t - 0.8) / 0.3
            e = min(1, (t - 0.8) / 0.2); e = 1 - (1 - e) ** 3
            return thrust_pose(at('dash_f', 4 + 10 * v), e)
        if t < 1.22: return EX
        v = (t - 1.22) / 0.78; v = v * v * (3 - 2 * v)
        return blend(EX, A0, v)
    bake('thrust_dash', int(2.0 * FPS) + 1, td)
    print('COMPOSED thrust_dash')
if all(n in CLIPS for n in ('jump_start', 'jump_air', 'jump_land', 'a8s1', 'a8s1c')) and (not ONLY or 'leap_chop' in ONLY):
    # 炎刃重坠 / 焚天断界的跃起：起跳（全身 jump_start）→ 空中（下身 jump_air 的收腿；上身把剑举过头顶：重劈 13→26 帧）→
    # 落地斩：全身重劈（完整版 Attack8_Stage1_Complete）第 26 帧起按原速放到最后一帧（劈下 + 收势回到持剑，0.1 秒从空中姿势接过来）。
    # 落地这段不再拼 jump_land 的下身——骨盆一换，重劈的上身跟着拧开，剑从身后劈到脚边、够不着身前的人（量过：剑尖最远只到身前 0.33 米）；
    # 全身照原样放，剑尖劈到身前 1.9 米。（原先取的 Attack8_Stage1 只有 31 帧，40 帧之前就停在最后一帧不动了。）空中段 0.6 秒，程序按跃起的距离放慢 / 加快
    n_c = frames_of('a8s1c')[1]
    def lc(i):
        t = i / FPS
        if t < 0.4: return at('jump_start', 1 + 13 * t / 0.4)
        if t < 1.0:
            v = (t - 0.4) / 0.6; up = at('a8s1', 13 + 13 * min(1, v / 0.8))
            pose = mix(up, at('jump_air', 1 + 3 * v))
            if t < 0.5: pose = blend(at('jump_start', 14), pose, (t - 0.4) / 0.1)
            return pose
        full = at('a8s1c', min(n_c, 26 + (t - 1.0) * FPS))
        u = min(1, (t - 1.0) / 0.1); u = u * u * (3 - 2 * u)
        return blend(mix(at('a8s1', 26), at('jump_air', 4)), full, u) if u < 1 else full
    bake('leap_chop', int(1.0 * FPS) + (n_c - 26) + 1, lc)
    def lp(i):
        t = i / FPS
        if t < 0.4: return at('jump_start', 1 + 13 * t / 0.4)
        if t < 1.0:
            v = (t - 0.4) / 0.6
            pose = at('jump_air', 1 + 3 * v)
            if t < 0.5: pose = blend(at('jump_start', 14), pose, (t - 0.4) / 0.1)
            return pose
        return at('jump_land', 1 + 14 * (t - 1.0) / 0.5)
    bake('leap', int(1.5 * FPS) + 1, lp)
    print('COMPOSED leap_chop / leap')
if all(n in CLIPS for n in ('dodge_b', 'hit_f')) and (not ONLY or 'parry_recoil' in ONLY):
    # 被弹反的收势：受击（上身）+ 后跃一步（下身）；前 0.5 秒右臂被震开——剑被磕得向外、向后上方扬起（两节 IK 摆出峰值姿势，按正弦权重混入），末了回到持剑姿势
    def base_pr(t):
        return mix(at('hit_f', 1 + min(19, 19 * t / 0.7)), at('dodge_b', 1 + min(17, 17 * t / 0.6)))
    def pr(i):
        t = i / FPS
        pose = base_pr(t)
        k = math.sin(min(1, t / 0.5) * math.pi) if t < 0.5 else 0
        if k > 0.001:
            apply(pose)
            sh = P['upperarm_r'].head.copy()
            two_bone('upperarm_r', 'lowerarm_r', 'hand_r', sh + Vector((-0.28, 0.22, 0.30)), sh + Vector((-0.6, -0.1, -0.5)))
            orient_sword(Vector((-0.35, 0.55, 0.75)), Vector((0, -1, 0)))
            for bn, ang in (('spine_03', -0.12), ('spine_05', -0.08)):
                P[bn].rotation_quaternion = P[bn].rotation_quaternion @ Quaternion(Vector((1, 0, 0)), ang); upd()
            pose = blend(pose, capture(), k)
        return pose
    bake('parry_recoil', int(1.0 * FPS) + 1, pr)
    print('COMPOSED parry_recoil')

# =====================================================================================
# 五、骨架只留变形骨；剑挂到右手骨
# =====================================================================================
for pb in P: pb.matrix_basis = Matrix.Identity(4)
arm.animation_data.action = None
upd()
target = arm.matrix_world @ P['hand_r'].matrix @ HL
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
E = arm.data.edit_bones
gone = [b.name for b in E if b.name not in DEF]
for n in gone: E.remove(E[n])
bpy.ops.object.mode_set(mode='OBJECT')
REPORT['bones'] = {'kept': len(arm.data.bones), 'removed': len(gone)}
sword.parent = arm; sword.parent_type = 'BONE'; sword.parent_bone = 'hand_r'
sword.matrix_parent_inverse = Matrix.Identity(4)
upd()
sword.matrix_world = target
upd()
REPORT['sword_check'] = round((sword.matrix_world.translation - target.translation).length, 6)
# 去掉动作里已删的骨（拼的动作只有变形骨，不受影响）
for c in CLIPS.values():
    for l in c['action'].layers:
        for st in l.strips:
            for cb in st.channelbags:
                for fc in list(cb.fcurves):
                    if fc.data_path.split('"')[1] not in DEF: cb.fcurves.remove(fc)

# =====================================================================================
# 六、网格去重、导出
# =====================================================================================
for im in bpy.data.images:
    w, h = im.size
    if w == 0: continue
    px = list(im.pixels[:64]) if w * h >= 16 else []
    flat = im.channels == 1 or (min(w, h) >= 64 and all(abs(v - px[0]) < 1e-3 for v in px[::4]))
    m = 16 if flat and max(w, h) > 16 and all(abs(x - 1) < 1e-3 for x in im.pixels[:256]) else 512
    if max(w, h) > m:
        k = m / max(w, h); im.scale(max(1, round(w * k)), max(1, round(h * k)))
        REPORT.setdefault('textures', []).append([im.name, [w, h], list(im.size)])
REPORT['dedupe'] = {'body': dedupe(body), 'sword': dedupe(sword)}
if props: REPORT['dedupe']['props'] = dedupe(props)
print('DEDUPE', REPORT['dedupe'])
# 动作排进 NLA（每段一条轨道，导出成各自的动画）
arm.animation_data_create()
for t in list(arm.animation_data.nla_tracks): arm.animation_data.nla_tracks.remove(t)
for gname, c in CLIPS.items():
    tr = arm.animation_data.nla_tracks.new(); tr.name = gname
    st = tr.strips.new(gname, int(c['frames'][0]), c['action'])
    st.name = gname
    tr.mute = True
arm.animation_data.action = None
for pb in P: pb.matrix_basis = Matrix.Identity(4)
upd()
bpy.ops.object.select_all(action='DESELECT')
for o in (arm, body, sword): o.select_set(True)
bpy.context.view_layer.objects.active = arm
glb = os.path.join(OUT, 'boss30_full.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_yup=True,
    export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_frame_step=1, export_anim_slide_to_zero=True,
    export_nla_strips_merged_animation_name='', export_optimize_animation_size=False, export_reset_pose_bones=True,
    export_skins=True, export_def_bones=False, export_all_influences=False, export_morph=False,
    export_texcoords=True, export_normals=True, export_vertex_color='MATERIAL', export_materials='EXPORT', export_image_format='AUTO', export_apply=False)
REPORT['glb'] = {'file': glb, 'bytes': os.path.getsize(glb)}
if props:
    bpy.ops.object.select_all(action='DESELECT'); props.select_set(True); bpy.context.view_layer.objects.active = props
    pglb = os.path.join(OUT, 'boss30_props_full.glb')
    bpy.ops.export_scene.gltf(filepath=pglb, export_format='GLB', use_selection=True, export_yup=True, export_animations=False, export_skins=False,
        export_texcoords=True, export_normals=True, export_vertex_color='MATERIAL', export_materials='EXPORT', export_image_format='AUTO')
    REPORT['props_glb'] = {'file': pglb, 'bytes': os.path.getsize(pglb)}
# 动作信息：时长、是否循环、来源、根运动（每帧 [秒, x, z]）
meta = {'fps': FPS, 'k': K, 'sword': info['sword'], 'clips': {}}
for gname, c in CLIPS.items():
    f0, f1 = c['frames']
    meta['clips'][gname] = {'dur': round((f1 - f0) / FPS, 4), 'loop': c['loop'], 'src': c['src'], 'root': c['root']}
json.dump(meta, open(os.path.join(OUT, 'boss30_anim.json'), 'w'), ensure_ascii=False)
json.dump(REPORT, open(os.path.join(OUT, 'export_report.json'), 'w'), ensure_ascii=False, indent=1)
print('REPORT', json.dumps({k: v for k, v in REPORT.items() if k != 'grip_hand_local'}, ensure_ascii=True))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'boss30_export.blend'))
print('DONE')
