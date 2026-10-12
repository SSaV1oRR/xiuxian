# 导出用的 blend 里：逐个动作在指定帧渲染正面 / 侧面（剑已挂在右手骨上）
# 用法：blender -b --factory-startup --python render_actions.py -- <boss30_export.blend> <输出目录> 动作名:帧,帧 …
import bpy, sys, os, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
ONE = '--one' in argv
BLEND, OUT, items = argv[0], argv[1], [a for a in argv[2:] if a != '--one']
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=BLEND)
arm = bpy.data.objects['boss30']
for o in bpy.data.objects:
    if o.name == 'boss30_props': o.hide_render = True
scn = bpy.context.scene
scn.render.engine = 'BLENDER_WORKBENCH'; scn.display.shading.light = 'STUDIO'; scn.display.shading.color_type = 'VERTEX'
scn.render.resolution_x = 300; scn.render.resolution_y = 360
w = bpy.data.worlds.new('w'); scn.world = w; w.color = (0.62, 0.64, 0.67)
cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); scn.collection.objects.link(cam); scn.camera = cam
cd.type = 'ORTHO'; cd.ortho_scale = 3.4; cd.clip_start = 0.1; cd.clip_end = 100
for t in arm.animation_data.nla_tracks: t.mute = True
for it in items:
    nm, frames = it.rsplit(':', 1)
    act = bpy.data.actions['b30_' + nm]
    arm.animation_data.action = act
    if act.slots: arm.animation_data.action_slot = act.slots[0]
    for f in [int(x) for x in frames.split(',')]:
        scn.frame_set(f)
        VIEWS = [('q', Vector((-0.75, -1, 0.15)))] if ONE else [('front', Vector((-0.35, -1, 0.12))), ('side', Vector((1, -0.15, 0.1)))]
        for vn, d in VIEWS:
            c = Vector((0, -0.2, 1.05))
            cam.location = c + d.normalized() * 10; cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
            scn.render.filepath = os.path.join(OUT, f'{nm}_{f:03d}_{vn}.png')
            bpy.ops.render.render(write_still=True)
    print('RENDERED', nm)
