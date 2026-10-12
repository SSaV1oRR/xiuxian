# 第二十四轮：逐帧取样单手剑动作包的剑尖 / 剑柄轨迹（剑按拳轴挂在右手），并读 RM 版本的根位移 → JSON
# 用法：blender -b --factory-startup --python analyze_clips.py -- <boss30_rigged.blend> <输出 json> <IP 目录> <RM 目录> <名字…>
import bpy, sys, os, json, math
import numpy as np
from mathutils import Vector, Matrix
argv = sys.argv[sys.argv.index('--') + 1:]
BLEND, OUTJ, IPD, RMD, names = argv[0], argv[1], argv[2], argv[3], argv[4:]
bpy.ops.wm.open_mainfile(filepath=BLEND)
arm = bpy.data.objects['boss30']
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.hide_viewport = True; o.hide_render = True
        for m in o.modifiers: m.show_viewport = False
info = json.load(open(os.path.join(os.path.dirname(BLEND), 'rig_info.json')))
k = info['k']; tipL = info['sword']['tipFromGrip']; pomL = info['sword']['pommelFromGrip']
scn = bpy.context.scene
def grip_frame():
    pb = arm.pose.bones
    w = lambda n: arm.matrix_world @ pb[n].head
    i1, p1, m1, h = w('index_01_r'), w('pinky_01_r'), w('middle_01_r'), w('hand_r')
    ax = (i1 - p1).normalized()
    grip = (i1 + p1 + m1) / 3 * 0.6 + h * 0.4
    palm = (m1 - h).normalized()
    wide = (palm - ax * palm.dot(ax)).normalized()
    z = wide.cross(ax).normalized()
    M = Matrix((wide, ax, z)).transposed().to_4x4(); M.translation = grip
    return M
def load(fbx):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=fbx, automatic_bone_orientation=False)
    src = next(o for o in bpy.data.objects if o not in before and o.type == 'ARMATURE')
    act = src.animation_data.action
    for o in [o for o in bpy.data.objects if o not in before]: bpy.data.objects.remove(o, do_unlink=True)
    root = {}
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                for fc in list(cb.fcurves):
                    if not fc.data_path.startswith('pose.bones['):
                        root[(fc.data_path, fc.array_index)] = [(kp.co[0], kp.co[1]) for kp in fc.keyframe_points]
                        cb.fcurves.remove(fc)
                    elif fc.data_path.endswith('.location'):
                        for kp in fc.keyframe_points: kp.co[1] *= k; kp.handle_left[1] *= k; kp.handle_right[1] *= k
    return act, root
out = {}
for nm in names:
    ip = os.path.join(IPD, f'A_OneHandedSwordAnimV5_{nm}_IP.fbx')
    rm = os.path.join(RMD, f'A_OneHandedSwordAnimV5_{nm}_RM.fbx')
    if not os.path.exists(ip): print('MISSING', nm); continue
    act, _ = load(ip)
    f0, f1 = [int(round(x)) for x in act.frame_range]
    arm.animation_data_create(); arm.animation_data.action = act
    if act.slots: arm.animation_data.action_slot = act.slots[0]
    rec = {'f0': f0, 'f1': f1, 'tip': [], 'hilt': [], 'pom': [], 'pelvis': [], 'head': [], 'hand': [], 'handLocal': []}
    for f in range(f0, f1 + 1):
        scn.frame_set(f)
        M = grip_frame()
        tip = M @ Vector((0, tipL, 0)); pom = M @ Vector((0, pomL, 0))
        pb = arm.pose.bones
        hw = arm.matrix_world @ pb['hand_r'].matrix
        rec['tip'].append(list(tip)); rec['hilt'].append(list(M.translation)); rec['pom'].append(list(pom))
        rec['pelvis'].append(list(arm.matrix_world @ pb['pelvis'].head)); rec['head'].append(list(arm.matrix_world @ pb['head'].head))
        rec['hand'].append(list(hw.translation))
        HL = hw.inverted() @ M
        rec['handLocal'].append([list(r) for r in HL])
    # 根位移（RM 版本的物体位置通道，厘米 → Boss 米）
    if os.path.exists(rm):
        _, root = load(rm)
        rx = root.get(('location', 0)); ry = root.get(('location', 1)); rz = root.get(('rotation_euler', 2))
        if rx and ry:
            rec['root'] = [[t, (x - rx[0][1]) * k, (y - ry[0][1]) * k] for (t, x), (_, y) in zip(rx, ry)]
        if rz: rec['rootYaw'] = [[t, v] for t, v in rz]
        bpy.data.actions.remove(_ if False else bpy.data.actions[-1]) if False else None
    out[nm] = rec
    print('DONE', nm, f0, f1)
json.dump(out, open(OUTJ, 'w'))
print('ALL DONE', len(out))
