# 第二十四轮：烬狱剑尊（boss30 的灰烬之魂笔画模型）→ 可动画的人形：分出身体 / 黑剑 / 场景笔画，缩放、转向，
# 套上单手剑动作包的 UE5 Manny 骨架（按人物比例改骨长），在人物原本的姿势里算权重并绑定，再把网格烘回 A 字静止姿势重新绑定。
# 用法：blender -b --factory-startup --python rig_boss30.py -- <glb> <classes.json> <figure_sel.json> <骨架 fbx> <输出目录>
import bpy, sys, os, json, math
import bmesh
import numpy as np
from mathutils import Vector, Matrix, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, CLS, SEL, SKEL, OUT = argv[:5]
os.makedirs(OUT, exist_ok=True)
H_TARGET = 2.4                         # 头顶离地（米）
cls = json.load(open(CLS)); sel = json.load(open(SEL))
CX, CY = -8.7, -95.0                   # 人物中心（源单位）
SRC_TOP = 2060.0                       # 源：头盔顶（不算冠刺）
S = H_TARGET / SRC_TOP
# 源坐标里的关节（人物朝 +Y；转换后朝 −Y，与 Manny 一致）
J = {
    'pelvis': (0, -100, 1000), 'neck': (0, -140, 1770), 'headc': (0, -130, 1900), 'headtop': (0, -120, 2060),
    'sh_r': (225, -150, 1685), 'el_r': (466, -150, 1400), 'wr_r': (470, -110, 1650), 'fist_r': (468, -90, 1727),
    'sh_l': (-240, -150, 1685), 'el_l': (-412, -170, 1272), 'wr_l': (-390, -120, 990), 'fist_l': (-358, -100, 905),
    'hip_r': (120, -100, 1000), 'kn_r': (165, -80, 560), 'an_r': (190, -110, 100), 'toe_r': (195, 60, 20),
    'hip_l': (-120, -100, 1000), 'kn_l': (-165, -80, 560), 'an_l': (-190, -110, 100), 'toe_l': (-195, 60, 20),
}
ROT = Matrix.Rotation(math.pi, 4, 'Z')
def tf(p):                             # 源 → 米、居中、转 180°（朝 −Y）
    v = Vector(((p[0] - CX) * S, (p[1] - CY) * S, p[2] * S))
    return (ROT @ v.to_4d()).to_3d()
JW = {k: tf(v) for k, v in J.items()}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}
# 每个网格里：哪些顶点属于哪一类（按块的第一个顶点洪泛）
def flood(bm, v0):
    ids = {v0}; stack = [bm.verts[v0]]
    while stack:
        x = stack.pop()
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in ids: ids.add(y.index); stack.append(y)
    return ids
figure_v0 = {}
for name, v0, *_ in sel['sel']: figure_v0.setdefault(name, []).append(v0)
classes = {}
for k in ('body', 'black', 'great', 'stray'):
    for name, v0 in cls[k]: classes.setdefault((name, k), []).append(v0)
vclass = {}                            # mesh → {vertex: class}
for n, o in meshes.items():
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    lab = np.full(len(bm.verts), 'props', dtype=object)
    for k in ('body', 'black', 'great', 'stray'):
        for v0 in classes.get((n, k), []):
            for i in flood(bm, v0): lab[i] = k
    vclass[n] = lab
    bm.free()

def extract(kind, name):
    """把各网格里 kind 类的顶点复制成一个物体（世界坐标烘进顶点），合并"""
    parts = []
    for n, o in meshes.items():
        lab = vclass[n]
        if not (lab == kind).any(): continue
        c = o.copy(); c.data = o.data.copy(); bpy.context.collection.objects.link(c)
        c.parent = None; c.matrix_world = o.matrix_world.copy()
        bm = bmesh.new(); bm.from_mesh(c.data); bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if lab[v.index] != kind], context='VERTS')
        bm.to_mesh(c.data); bm.free()
        c.data.transform(c.matrix_world); c.matrix_world = Matrix.Identity(4)
        parts.append(c)
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = name; ob.data.name = name
    # 源 → 米、居中、转向
    M = ROT @ Matrix.Translation((-CX * S, -CY * S, 0)) @ Matrix.Scale(S, 4)
    ob.data.transform(M)
    return ob
body = extract('body', 'boss30_body')
sword = extract('black', 'boss30_sword')
props = extract('props', 'boss30_props')
for o in list(meshes.values()): bpy.data.objects.remove(o, do_unlink=True)
for o in [o for o in bpy.data.objects if o.type == 'EMPTY']: bpy.data.objects.remove(o, do_unlink=True)
print('BODY', len(body.data.vertices), 'SWORD', len(sword.data.vertices), 'PROPS', len(props.data.vertices))

# ---------- 剑：握点、剑身方向（拳 → 剑尖）、刃宽方向 ----------
SP = np.array([tuple(v.co) for v in sword.data.vertices])
FIST = np.array(tuple(JW['fist_l']))
m = SP.mean(0); u, s_, vt = np.linalg.svd(SP - m, full_matrices=False)
ax = vt[0] if vt[0] @ (m - FIST) > 0 else -vt[0]
t = (SP - FIST) @ ax
grip = m + ax * float((FIST - m) @ ax)                              # 握点：拳心投到剑轴上（剑原点落在自己的轴线上）
t = (SP - grip) @ ax
wide = vt[1] - ax * (vt[1] @ ax); wide /= np.linalg.norm(wide)
info = {'swordLen': float(t.max() - min(0, t.min())), 'tipFromGrip': float(t.max()), 'pommelFromGrip': float(t.min()), 'axis': ax.tolist(), 'wide': wide.tolist(), 'grip': grip.tolist()}
print('SWORD', {k: (round(v, 3) if isinstance(v, float) else [round(x, 3) for x in v]) for k, v in info.items()})
# 剑放到自己的坐标里：原点在握点，+Y 指剑尖，+X 是刃宽方向
Ry = Vector(ax.tolist()); Rx = Vector(wide.tolist()); Rz = Rx.cross(Ry).normalized()
B = Matrix((Rx, Ry, Rz)).transposed().to_4x4(); B.translation = Vector(grip.tolist())
sword.data.transform(B.inverted())

# ---------- Manny 骨架 ----------
bpy.ops.import_scene.fbx(filepath=SKEL, automatic_bone_orientation=False)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in [o for o in bpy.data.objects if o.type == 'EMPTY']: bpy.data.objects.remove(o, do_unlink=True)
if arm.animation_data: arm.animation_data_clear()
# FBX 的 root 骨就是骨架物体本身，根运动在它的位置通道上（厘米，父空物体缩放 0.01）；删掉父物体后第 1 帧的位置会留下 → 归零
arm.location = (0, 0, 0); arm.rotation_euler = (0, 0, 0); arm.scale = (1, 1, 1)
print('BONES', [b.name for b in arm.data.bones])
arm.name = 'boss30'; arm.data.name = 'boss30'
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
# 统一缩放：Manny 骨盆高 → 人物骨盆高
bpy.ops.object.mode_set(mode='EDIT')
E = arm.data.edit_bones
k = JW['pelvis'].z / E['pelvis'].head.z
for b in E: b.head *= k; b.tail *= k
# 按人物比例改段长：把子树沿原方向平移（方向不变——动作的本地旋转照常适用）
def subtree(b):
    out = [b]
    for c in b.children: out += subtree(c)
    return out
def set_seg(parent_name, child_name, target_len):
    p, c = E[parent_name], E[child_name]
    d = c.head - p.head; L = d.length
    if L < 1e-6: return
    delta = d.normalized() * (target_len - L)
    for b in subtree(c): b.head += delta; b.tail += delta
def dist(a, b): return (JW[a] - JW[b]).length
# 肩宽：锁骨根 → 上臂根
for side, sh in (('r', 'sh_r'), ('l', 'sh_l')):
    cl = E['clavicle_' + side]
    set_seg('clavicle_' + side, 'upperarm_' + side, (JW[sh] - cl.head).length)
    set_seg('upperarm_' + side, 'lowerarm_' + side, dist(sh, 'el_' + side))
    set_seg('lowerarm_' + side, 'hand_' + side, dist('el_' + side, 'wr_' + side))
    set_seg('thigh_' + side, 'calf_' + side, dist('hip_' + side, 'kn_' + side))
    set_seg('calf_' + side, 'foot_' + side, dist('kn_' + side, 'an_' + side))
# 躯干：骨盆 → 颈根（spine_05 → neck_01）按比例
pz = E['pelvis'].head.z; nz = E['neck_01'].head.z; want = JW['neck'].z - JW['pelvis'].z
f = want / (nz - pz)
for b in subtree(E['spine_01']):
    b.head.z = pz + (b.head.z - pz) * f; b.tail.z = pz + (b.tail.z - pz) * f
bpy.ops.object.mode_set(mode='OBJECT')
REST = {b.name: b.matrix_local.copy() for b in arm.data.bones}          # A 字静止（骨架空间）
json.dump({'k': k, 'S': S, 'joints': {a: list(v) for a, v in JW.items()}, 'sword': info, 'rest': {n: [list(r) for r in m] for n, m in REST.items()}}, open(os.path.join(OUT, 'rig_info.json'), 'w'))

# ---------- 摆成人物的姿势：每根骨绕自己的根转，让「根 → 子骨根」的实际方向对准人物的关节 ----------
# （UE 骨的本地 Y 并不沿肢体——不能用 Damped Track 的 Y 轴；这里直接用骨根到子骨根的方向）
aims = [('clavicle_r', 'upperarm_r', 'sh_r'), ('upperarm_r', 'lowerarm_r', 'el_r'), ('lowerarm_r', 'hand_r', 'wr_r'), ('hand_r', 'middle_01_r', 'fist_r'),
        ('clavicle_l', 'upperarm_l', 'sh_l'), ('upperarm_l', 'lowerarm_l', 'el_l'), ('lowerarm_l', 'hand_l', 'wr_l'), ('hand_l', 'middle_01_l', 'fist_l'),
        ('thigh_r', 'calf_r', 'kn_r'), ('calf_r', 'foot_r', 'an_r'), ('foot_r', 'ball_r', 'toe_r'),
        ('thigh_l', 'calf_l', 'kn_l'), ('calf_l', 'foot_l', 'an_l'), ('foot_l', 'ball_l', 'toe_l'),
        ('neck_01', 'head', 'headc'), ('head', None, 'headtop')]
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
P = arm.pose.bones
for pb in P: pb.matrix_basis = Matrix.Identity(4)     # 清掉导入时第 1 帧留下的姿势（清动画数据不会清姿势通道）
bpy.context.view_layer.update()
pw = arm.data.bones['pelvis'].matrix_local
P['pelvis'].location = (pw.inverted().to_3x3() @ (JW['pelvis'] - pw.translation))
bpy.context.view_layer.update()
UP_HEAD = arm.data.bones['head'].matrix_local.to_3x3().inverted() @ Vector((0, 0, 1))     # 头骨本地的「上」
fit_err = {}
for bn, ch, jn in sorted(aims, key=lambda x: len(arm.data.bones[x[0]].parent_recursive)):
    h = P[bn].head.copy()
    cur = (P[ch].head - h) if ch else (P[bn].matrix.to_3x3() @ UP_HEAD)
    tgt = JW[jn] - h
    q = cur.normalized().rotation_difference(tgt.normalized())
    P[bn].matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ P[bn].matrix
    bpy.context.view_layer.update()
    now = (P[ch].head - h) if ch else (P[bn].matrix.to_3x3() @ UP_HEAD)
    fit_err[bn] = round(math.degrees(now.angle(tgt)), 2)
print('FIT angle error (deg)', fit_err)
FIT = {pb.name: pb.matrix.copy() for pb in P}                     # 人物姿势（骨架空间）
FIT_JSON = {n: [list(r) for r in m] for n, m in FIT.items()}
bpy.ops.object.mode_set(mode='OBJECT')

# ---------- 权重（在人物姿势里算）----------
DEF = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'spine_04', 'spine_05', 'neck_01', 'neck_02', 'head', 'clavicle_l', 'clavicle_r',
       'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r']
seg = {}
for n in DEF:
    m_ = FIT[n]; L = arm.data.bones[n].length
    h = m_.translation.copy(); t_ = h + m_.to_3x3() @ Vector((0, L, 0))
    seg[n] = (np.array(tuple(h)), np.array(tuple(t_)))
# 段的末端：用子骨的根（手、脚等末端骨用自己的长度）
child_of = {'pelvis': 'spine_01', 'spine_01': 'spine_02', 'spine_02': 'spine_03', 'spine_03': 'spine_04', 'spine_04': 'spine_05', 'spine_05': 'neck_01', 'neck_01': 'neck_02', 'neck_02': 'head',
            'clavicle_l': 'upperarm_l', 'upperarm_l': 'lowerarm_l', 'lowerarm_l': 'hand_l', 'clavicle_r': 'upperarm_r', 'upperarm_r': 'lowerarm_r', 'lowerarm_r': 'hand_r',
            'thigh_l': 'calf_l', 'calf_l': 'foot_l', 'foot_l': 'ball_l', 'thigh_r': 'calf_r', 'calf_r': 'foot_r', 'foot_r': 'ball_r'}
for n, c in child_of.items(): seg[n] = (seg[n][0], np.array(tuple(FIT[c].translation)))
seg['head'] = (seg['head'][0], np.array(tuple(JW['headtop'])))
seg['hand_r'] = (seg['hand_r'][0], np.array(tuple(JW['fist_r'])) + (np.array(tuple(JW['fist_r'])) - seg['hand_r'][0]) * 0.6)
seg['hand_l'] = (seg['hand_l'][0], np.array(tuple(JW['fist_l'])) + (np.array(tuple(JW['fist_l'])) - seg['hand_l'][0]) * 0.6)
# 各骨的「粗细」：越粗越能吸到远处的笔画（躯干粗、四肢细）
RAD = {n: 0.10 for n in DEF}
for n in ('pelvis', 'spine_01', 'spine_02', 'spine_03', 'spine_04', 'spine_05'): RAD[n] = 0.22
for n in ('thigh_l', 'thigh_r'): RAD[n] = 0.14
for n in ('head', 'neck_01', 'neck_02'): RAD[n] = 0.12

def seg_dist(P_, a, b):
    ab = b - a; L2 = max(ab @ ab, 1e-9)
    t_ = np.clip((P_ - a) @ ab / L2, 0, 1)
    q = a + np.outer(t_, ab)
    return np.linalg.norm(P_ - q, axis=1), t_

me = body.data
V = np.array([tuple(v.co) for v in me.vertices])
# 连通块（一笔）
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
comp = np.full(len(V), -1); nc = 0
for v in bm.verts:
    if comp[v.index] >= 0: continue
    stack = [v]; comp[v.index] = nc
    while stack:
        x = stack.pop()
        for e in x.link_edges:
            y = e.other_vert(x)
            if comp[y.index] < 0: comp[y.index] = nc; stack.append(y)
    nc += 1
bm.free()
# 顶点颜色（披风：暗红）
col = None
ca = me.color_attributes.active_color
if ca is not None:
    if ca.domain == 'POINT': col = np.array([tuple(d.color) for d in ca.data])[:, :3]
    else:
        col = np.zeros((len(V), 3)); cnt = np.zeros(len(V))
        for li, l in enumerate(me.loops): col[l.vertex_index] += tuple(ca.data[li].color)[:3]; cnt[l.vertex_index] += 1
        col /= np.maximum(cnt, 1)[:, None]
D = np.stack([seg_dist(V, *seg[n])[0] - RAD[n] for n in DEF], 1)          # 顶点到各骨（减去粗细）
W = np.exp(-np.maximum(D, 0) / 0.045)
W[D > 0.35] = 0
# 手：拳甲只跟手（不跟手指）；离拳心 0.16 米内的顶点全给手
for side in ('r', 'l'):
    fist = np.array(tuple(JW['fist_' + side])); near = np.linalg.norm(V - fist, axis=1) < 0.16
    hi = DEF.index('hand_' + side); W[near] = 0; W[near, hi] = 1
# 披风：暗红、在身后或左侧外飘的大笔画 → 只跟 spine_03…05 与左锁骨（按高度分）
cloak = np.zeros(len(V), bool)
if col is not None:
    red = (col[:, 0] > 0.18) & (col[:, 1] < 0.12) & (col[:, 2] < 0.12) & (col[:, 0] > 2.2 * col[:, 1])
    for ci in range(nc):
        m_ = comp == ci
        if red[m_].mean() > 0.6 and np.ptp(V[m_], 0).max() > 0.25: cloak |= m_
for i in np.where(cloak)[0]:
    z = V[i, 2]
    W[i] = 0
    if z > JW['sh_l'].z - 0.05: W[i, DEF.index('spine_05')] = 0.6; W[i, DEF.index('clavicle_l')] = 0.4
    elif z > JW['pelvis'].z + 0.35: W[i, DEF.index('spine_04')] = 0.7; W[i, DEF.index('spine_05')] = 0.3
    else: W[i, DEF.index('spine_03')] = 0.6; W[i, DEF.index('pelvis')] = 0.4
# 没有任何骨吸到的：给最近的骨
none_ = W.sum(1) < 1e-6
W[none_, np.argmin(D[none_], 1)] = 1
# 小笔画（最长边 < 0.12 米）整块刚性：用块内平均权重
for ci in range(nc):
    m_ = comp == ci
    if np.ptp(V[m_], 0).max() < 0.12: W[m_] = W[m_].mean(0)
# 每个顶点只留最大的 4 个，归一
idx = np.argsort(-W, 1)[:, 4:]
np.put_along_axis(W, idx, 0, 1)
W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
groups = {n: body.vertex_groups.new(name=n) for n in DEF}
for j, n in enumerate(DEF):
    vs = np.where(W[:, j] > 1e-4)[0]
    for i in vs: groups[n].add([int(i)], float(W[i, j]), 'REPLACE')
print('WEIGHTS done; cloak verts', int(cloak.sum()), 'components', nc)

# ---------- 在人物姿势里绑定 → 摆回 A 字 → 烘进网格 → A 字为静止 → 重新绑定 ----------
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
bpy.ops.pose.select_all(action='SELECT')
bpy.ops.pose.armature_apply(selected=False)            # 静止 = 人物姿势
bpy.ops.object.mode_set(mode='OBJECT')
mod = body.modifiers.new('arm', 'ARMATURE'); mod.object = arm
body.parent = arm
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
order = sorted(arm.pose.bones, key=lambda pb: len(pb.parent_recursive))
for pb in order:
    pb.matrix = REST[pb.name]
    bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode='OBJECT')
bpy.context.view_layer.objects.active = body
bpy.ops.object.modifier_apply(modifier='arm')          # 网格烘成 A 字姿势
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
bpy.ops.pose.select_all(action='SELECT')
bpy.ops.pose.armature_apply(selected=False)            # 静止 = A 字（与 Manny 同朝向）
for pb in arm.pose.bones: pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
bpy.ops.object.mode_set(mode='OBJECT')
mod = body.modifiers.new('arm', 'ARMATURE'); mod.object = arm
# 静止姿势与原 A 字的偏差（应接近 0）
dev = max((arm.data.bones[n].matrix_local.translation - REST[n].translation).length for n in DEF)
print('REST deviation', round(dev, 5))
inf = json.load(open(os.path.join(OUT, 'rig_info.json'))); inf['fit'] = FIT_JSON; json.dump(inf, open(os.path.join(OUT, 'rig_info.json'), 'w'))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'boss30_rigged.blend'))
print('SAVED')
