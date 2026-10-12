# 第二十七轮：看一眼素材（Blender 后台导入 FBX、接上贴图，用 Workbench 拍几张预览图）。
# 用法：blender -b --factory-startup --python tools/r27_preview.py -- <fbx> <out_prefix> [tex_dir]
import bpy, sys, os, math
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
fbx, out = args[0], args[1]
tex_dir = args[2] if len(args) > 2 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
# 贴图：FBX 里没链接，按名字接上（Base / Rest 用整张黑白版，BrushStrokes 用笔触图）
if tex_dir:
    imgs = {}
    for f in os.listdir(tex_dir):
        imgs[f] = bpy.data.images.load(os.path.join(tex_dir, f))
    for o in meshes:
        for slot in o.material_slots:
            m = slot.material
            if not m: continue
            m.use_nodes = True
            nt = m.node_tree
            bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            key = 'BrushStrokes.png' if 'Brush' in o.name else 'BlackAndWhiteVersion.jpg'
            if bsdf and o.data.color_attributes and not ('Base' in o.name or 'Rest' in o.name or 'Brush' in o.name):
                an = nt.nodes.new('ShaderNodeVertexColor'); an.layer_name = o.data.color_attributes[0].name
                nt.links.new(an.outputs[0], bsdf.inputs['Base Color'])
            elif bsdf and key in imgs and o.data.uv_layers:
                tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = imgs[key]; nt.nodes.active = tn
                nt.links.new(tn.outputs[0], bsdf.inputs['Base Color'])
                if key.endswith('.png'): nt.links.new(tn.outputs[1], bsdf.inputs['Alpha'])
mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
for o in meshes:
    for c in o.bound_box:
        p = o.matrix_world @ Vector(c)
        mn = Vector(map(min, mn, p)); mx = Vector(map(max, mx, p))
ctr = (mn + mx) / 2; size = mx - mn
print('BBOX', [round(v, 2) for v in mn], [round(v, 2) for v in mx])
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.85, 0.82, 0.75, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 2.5; sun.rotation_euler = (0.7, 0.2, 0.6); sc.collection.objects.link(sun)
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
sc.render.film_transparent = False
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 35; cam.data.clip_end = 10000
R = max(size) * 1.1
views = {
    'top': (ctr + Vector((0, 0, R * 1.2)), ctr),
    'front': (ctr + Vector((0, -R, size.z * 0.6)), ctr),
    'side': (ctr + Vector((R, 0, size.z * 0.6)), ctr),
    'low': (Vector((float(a) for a in os.environ.get('R27_EYE', '0,-10,3').split(','))), Vector((float(a) for a in os.environ.get('R27_AT', '0,30,4').split(',')))),
    'low2': (Vector((float(a) for a in os.environ.get('R27_EYE2', '-10,0,3').split(','))), Vector((float(a) for a in os.environ.get('R27_AT2', '30,0,4').split(',')))),
}
for k, (p, at) in views.items():
    cam.location = p
    d = (at - p); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{out}_{k}.png'
    bpy.ops.render.render(write_still=True)
print('DONE')
