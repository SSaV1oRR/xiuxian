# 第二十四轮：动作的接触表——每段动作取若干帧（含出手峰值帧），3/4 正面渲染，并把整段剑尖轨迹投影到画面（JSON，之后用 PIL 叠画）
# 用法：blender -b --factory-startup --python clip_sheets.py -- <rigged.blend> <输出目录> <IP 目录> <frames.json> 名字…
import bpy, sys, os, json, math
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view
argv = sys.argv[sys.argv.index('--') + 1:]
BLEND, OUT, IPD, FJ, names = argv[0], argv[1], argv[2], argv[3], argv[4:]
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=BLEND)
arm = bpy.data.objects['boss30']; body = bpy.data.objects['boss30_body']; sword = bpy.data.objects['boss30_sword']
if 'boss30_props' in bpy.data.objects: bpy.data.objects['boss30_props'].hide_render = True
info = json.load(open(os.path.join(os.path.dirname(BLEND), 'rig_info.json')))
k = info['k']; tipL = info['sword']['tipFromGrip']
want = json.load(open(FJ))
scn = bpy.context.scene
scn.render.engine = 'BLENDER_WORKBENCH'; scn.display.shading.light = 'STUDIO'; scn.display.shading.color_type = 'VERTEX'
scn.render.resolution_x = 300; scn.render.resolution_y = 360
w = bpy.data.worlds.new('w'); scn.world = w; w.color = (0.62, 0.64, 0.67)
cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); scn.collection.objects.link(cam); scn.camera = cam
cd.type = 'ORTHO'; cd.ortho_scale = 4.4; cd.clip_start = 0.1; cd.clip_end = 100
c = Vector((0, -0.45, 1.15)); d = Vector((-0.5, -0.86, 0.22)).normalized()
cam.location = c + d * 12; cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
sword.parent = None
def place_sword():
    pb = arm.pose.bones
    W = lambda n: arm.matrix_world @ pb[n].head
    i1, p1, m1, h = W('index_01_r'), W('pinky_01_r'), W('middle_01_r'), W('hand_r')
    ax = (i1 - p1).normalized(); grip = (i1 + p1 + m1) / 3 * 0.6 + h * 0.4
    palm = (m1 - h).normalized(); wide = (palm - ax * palm.dot(ax)).normalized(); z = wide.cross(ax).normalized()
    M = Matrix((wide, ax, z)).transposed().to_4x4(); M.translation = grip
    sword.matrix_world = M
    return M
proj = {}
for nm in names:
    fbx = os.path.join(IPD, f'A_OneHandedSwordAnimV5_{nm}_IP.fbx')
    if not os.path.exists(fbx): fbx = os.path.join(os.path.dirname(os.path.normpath(IPD)), 'RM', f'A_OneHandedSwordAnimV5_{nm}_RM.fbx')
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=fbx, automatic_bone_orientation=False)
    src = next(o for o in bpy.data.objects if o not in before and o.type == 'ARMATURE')
    act = src.animation_data.action
    for o in [o for o in bpy.data.objects if o not in before]: bpy.data.objects.remove(o, do_unlink=True)
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                for fc in list(cb.fcurves):
                    if not fc.data_path.startswith('pose.bones['): cb.fcurves.remove(fc)
                    elif fc.data_path.endswith('.location'):
                        for kp in fc.keyframe_points: kp.co[1] *= k; kp.handle_left[1] *= k; kp.handle_right[1] *= k
    arm.animation_data_create(); arm.animation_data.action = act
    if act.slots: arm.animation_data.action_slot = act.slots[0]
    f0, f1 = [int(round(x)) for x in act.frame_range]
    pts = []
    for f in range(f0, f1 + 1):
        scn.frame_set(f); M = place_sword()
        tip = M @ Vector((0, tipL, 0))
        q = world_to_camera_view(scn, cam, tip); pts.append([q.x, 1 - q.y])
    proj[nm] = {'f0': f0, 'f1': f1, 'tip': pts}
    fl = want.get(nm, [])
    if fl == '__auto__': fl = sorted(set(round(f0 + (f1 - f0) * i / 7) for i in range(8)))
    for f in fl:
        scn.frame_set(f); place_sword()
        scn.render.filepath = os.path.join(OUT, f'{nm}__{f:03d}.png')
        bpy.ops.render.render(write_still=True)
    print('SHEET', nm, f0, f1, fl)
json.dump(proj, open(os.path.join(OUT, 'proj.json'), 'w'))
print('DONE')
