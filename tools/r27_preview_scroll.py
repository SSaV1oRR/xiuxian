# 第二十七轮：看一眼画卷素材的动画（形态键 frame_XXXX 逐帧、轴的动作、绳结解开），按几个帧号各拍一张，并打印各帧纸面的包围盒。
# 用法：blender -b --factory-startup --python tools/r27_preview_scroll.py -- <fbx> <out_prefix>
import bpy, sys
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
fbx, out = args[0], args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx)
sc = bpy.context.scene
objs = {o.name: o for o in bpy.data.objects}
print('OBJECTS', [(o.name, o.type, o.parent.name if o.parent else None) for o in bpy.data.objects])
for o in bpy.data.objects:
    if o.type == 'MESH' and o.data.shape_keys:
        kb = o.data.shape_keys.key_blocks
        ad = o.data.shape_keys.animation_data
        print('SHAPES', o.name, len(kb), kb[0].name, kb[-1].name, 'use_relative', o.data.shape_keys.use_relative, 'action', ad.action.name if ad and ad.action else None)
    if o.animation_data and o.animation_data.action:
        print('ACTION', o.name, o.animation_data.action.name, list(o.animation_data.action.frame_range))
print('FRAMES', sc.frame_start, sc.frame_end, sc.render.fps)

def bbox(o):
    dg = bpy.context.evaluated_depsgraph_get()
    oe = o.evaluated_get(dg)
    me = oe.to_mesh()
    ps = [oe.matrix_world @ v.co for v in me.vertices]
    oe.to_mesh_clear()
    mn = [min(p[i] for p in ps) for i in range(3)]; mx = [max(p[i] for p in ps) for i in range(3)]
    return [round(v, 3) for v in mn], [round(v, 3) for v in mx]

sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.render.resolution_x, sc.render.resolution_y = 960, 540
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 35
for f in [1, 10, 20, 30, 50, 80, 118, 160, 220, 281]:
    sc.frame_set(f)
    info = {n: bbox(o) for n, o in objs.items() if o.type == 'MESH'}
    print('FRAME', f, info)
    # 机位：看着当前全部网格
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
    for n, (a, b) in info.items():
        mn = Vector(map(min, mn, Vector(a))); mx = Vector(map(max, mx, Vector(b)))
    c = (mn + mx) / 2; R = max(mx - mn) * 1.3 + 0.5
    cam.location = c + Vector((R * 0.8, -R, R * 0.5))
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{out}_{f:03d}.png'
    bpy.ops.render.render(write_still=True)
print('DONE')
