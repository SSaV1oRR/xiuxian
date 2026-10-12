# 第二十一轮：凤凰素材（assets/boss/phoenix-bird/source/fly.fbx）→ 网页用的 glb。原文件不改动。
#   - FBX 里贴图写的是旧的绝对路径（…/phoenix-bird/source\Tex_Ride_FengHuang_01x_*.tga），实际文件在 textures/ 下、名为 *.tga.png：按名字改接
#   - 两套材质：01a（身、头、腿）、01b（翅、尾羽）；D_A = 底色 + alpha（羽毛镂空），E = 自发光
#   - 骨骼 88 根、动作「Take 001」（第 1–101 帧，每秒 30 帧，3.33 秒）原样保留；导出后动作改名 fly
#   - 尺度：原模型约 0.9 米长（骨架物体缩放 0.001、转 90°）——glb 里保留原样，运行时按 combatConfig.js 的 PHOENIX.scale 放大
#   - 另渲染动作的逐帧联系表（侧面、正面、俯视），看清这段动作实际是什么
# 用法：blender -b --factory-startup --python tools/r21_convert_phoenix.py -- <phoenix-bird 目录> <输出 glb> <输出 json> [<联系表 png 目录>]
import bpy, sys, os, json, math, mathutils

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT, OUT_JSON = argv[0], argv[1], argv[2]
SHEET = argv[3] if len(argv) > 3 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.fbx_import(filepath=os.path.join(SRC, 'source', 'fly.fbx'))
info = {'src': 'assets/boss/phoenix-bird/source/fly.fbx', 'textures': {}, 'bones': 0}

# ---------- 贴图改接 ----------
TEX = os.path.join(SRC, 'textures')
for im in bpy.data.images:
    base = os.path.basename(im.filepath.replace('\\', '/'))          # Tex_Ride_FengHuang_01a_D_A.tga
    cand = os.path.join(TEX, base + '.png')
    if os.path.exists(cand):
        old = im.filepath
        im.filepath = cand
        im.reload()
        im.name = base.replace('.tga', '')
        info['textures'][im.name] = {'from': old, 'to': 'textures/' + base + '.png', 'size': list(im.size)}
    else:
        info['textures'][base] = {'from': im.filepath, 'missing': True}

# 材质：底色接 D_A 的颜色与 alpha（镂空，glb 里 MASK），自发光接 E；双面
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    texD = next((n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image and '_D_A' in n.image.name), None)
    texE = next((n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image and n.image.name.endswith('_E')), None)
    for l in list(nt.links):
        if l.to_node == bsdf:
            nt.links.remove(l)
    if texD:
        nt.links.new(texD.outputs['Color'], bsdf.inputs['Base Color'])
        nt.links.new(texD.outputs['Alpha'], bsdf.inputs['Alpha'])
    if texE:
        nt.links.new(texE.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.0
    bsdf.inputs['Roughness'].default_value = 0.7
    bsdf.inputs['Metallic'].default_value = 0.0
    m.use_backface_culling = False
    try:
        m.surface_render_method = 'DITHERED'
    except Exception:
        pass
    m['alpha_mode'] = 'MASK'

arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
mesh = next(o for o in bpy.data.objects if o.type == 'MESH')
info['bones'] = len(arm.data.bones)
info['mesh'] = {'verts': len(mesh.data.vertices), 'polys': len(mesh.data.polygons), 'materials': [m.name for m in mesh.data.materials]}
act = arm.animation_data.action if arm.animation_data else None
if act:
    info['action'] = {'name': act.name, 'frames': list(act.frame_range), 'fps': bpy.context.scene.render.fps}
    act.name = 'fly'
sc = bpy.context.scene
sc.frame_start, sc.frame_end = 1, 101
sc.render.fps = 30

# 世界尺寸（骨架物体缩放后）：包围盒、翼展（左右翼尖骨骼末端的距离）
dg = bpy.context.evaluated_depsgraph_get()
def world_bbox(frame):
    sc.frame_set(frame)
    dg2 = bpy.context.evaluated_depsgraph_get()
    me = mesh.evaluated_get(dg2).to_mesh()
    pts = [mesh.matrix_world @ v.co for v in me.vertices]
    mesh.evaluated_get(dg2).to_mesh_clear()
    mn = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx
spans = []
for f in range(1, 102, 4):
    mn, mx = world_bbox(f)
    spans.append({'frame': f, 'size': [round(mx.x - mn.x, 3), round(mx.y - mn.y, 3), round(mx.z - mn.z, 3)], 'min': [round(v, 3) for v in mn], 'max': [round(v, 3) for v in mx]})
info['bbox_by_frame'] = spans

# 翼尖骨骼末端的世界位置（逐帧）：看翅膀是上下扇动还是收展
tips = {}
for side in ('Left', 'Right'):
    pb = arm.pose.bones.get(f'B_{side}_Wing_8')
    tr = []
    for f in range(1, 102, 2):
        sc.frame_set(f)
        p = arm.matrix_world @ pb.tail
        tr.append([f, round(p.x, 3), round(p.y, 3), round(p.z, 3)])
    tips[side] = tr
info['wingtip'] = tips
head = arm.pose.bones.get('b_Head'); tail5 = arm.pose.bones.get('B_Tail_5')
sc.frame_set(1)
info['rest_axes'] = {'head': [round(v, 3) for v in arm.matrix_world @ head.head], 'tail_end': [round(v, 3) for v in arm.matrix_world @ tail5.tail]}

# ---------- 导出 glb ----------
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True, export_skins=True,
                          export_image_format='AUTO', export_yup=True, export_apply=False, export_animation_mode='ACTIONS',
                          export_force_sampling=True, export_frame_range=False)
info['glb_bytes'] = os.path.getsize(OUT)
json.dump(info, open(OUT_JSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('exported', OUT, info['glb_bytes'])

# ---------- 逐帧联系表：侧面、正面、俯视（工作台渲染，显示贴图）----------
if SHEET:
    os.makedirs(SHEET, exist_ok=True)
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'; sh.show_backface_culling = False
    sc.render.resolution_x = sc.render.resolution_y = 360
    sc.render.film_transparent = False
    sc.world = bpy.data.worlds.new('w') if not sc.world else sc.world
    cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'; cam_data.ortho_scale = 1.3
    cam = bpy.data.objects.new('cam', cam_data); sc.collection.objects.link(cam); sc.camera = cam
    mn, mx = world_bbox(1)
    c = (mn + mx) / 2
    views = {'side': (mathutils.Vector((3, 0, 0)), 'Z'), 'front': (mathutils.Vector((0, -3, 0)), 'Z'), 'top': (mathutils.Vector((0, 0, 3)), 'Y')}
    for vname, (off, up) in views.items():
        cam.location = c + off
        d = (c - cam.location).normalized()
        cam.rotation_euler = d.to_track_quat('-Z', up).to_euler()
        for f in range(1, 102, 6):
            sc.frame_set(f)
            sc.render.filepath = os.path.join(SHEET, f'{vname}_{f:03d}.png')
            bpy.ops.render.render(write_still=True)
    print('sheet frames done')
