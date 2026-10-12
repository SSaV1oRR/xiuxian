# 岩壁扫描素材转换（第十轮）：assets/mountain/mountainside_4k.blend（Poly Haven「Mountainside」，CC0，原文件不改动）
#   blender -b --factory-startup --python tools/convert_mountainside.py -- --tmp <临时目录>
#   python tools/prepare_mountainside_textures.py <临时目录>
# 本脚本：
#   1. 网格：LOD2（3.8 万面）、LOD3（1.9 万面）原样导出，另由 LOD3 减面得到约 5200、1600、580 面的三级远景网格；
#      统一平滑法线、不带材质，导出 assets/converted/mountainside/mountainside.glb（节点 ms_0 … ms_4，游戏坐标：Y 向上、岩面朝 +Z、
#      原点在底边中点、岩面平均位置为 z = 0）与 mountainside.json（尺寸、各级面数）
#   2. 贴图：法线（OpenGL）、粗糙度的 4K EXR 读成浮点数组并减半到 2K，存 <临时目录>/nor.npy、rough.npy（漫反射是 JPG，由处理脚本直接读）
#   3. 正投影烘焙：正交相机正对岩面，渲染漫反射（自发光、线性 EXR）与相机空间法线 → <临时目录>/front_albedo.npy、front_normal.npy、
#      front_alpha.npy（覆盖范围），供处理脚本裁成四方连续的岩面贴图（程序化崖壁与地形陡坡用，与扫描岩体同一种岩面）
import bpy, bmesh, os, sys, json, math
import numpy as np
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'assets', 'mountain', 'mountainside_4k.blend', 'mountainside_4k.blend')
OUT = os.path.join(ROOT, 'assets', 'converted', 'mountainside')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(k, d=None): return argv[argv.index(k) + 1] if k in argv else d
TMP = arg('--tmp')
os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=SRC)
sc = bpy.context.scene
src = {o.name: o for o in sc.objects if o.type == 'MESH'}
lod0 = src['mountainside_LOD0']

# ---------- 1. 网格 ----------
# 参考系：取 LOD0 的包围盒中线为 x 原点、最低点为 z 原点；岩面（朝 -y 的面，面积加权）的平均 y 为 y 原点
bm = bmesh.new(); bm.from_mesh(lod0.data)
xs = [v.co.x for v in bm.verts]; zs = [v.co.z for v in bm.verts]
cx = (min(xs) + max(xs)) / 2; z0 = min(zs)
acc = 0; aw = 0
for f in bm.faces:
    if f.normal.y < -0.3:
        a = f.calc_area(); acc += f.calc_center_median().y * a; aw += a
cy = acc / aw
bm.free()
print('ORIGIN', round(cx, 3), round(cy, 3), round(z0, 3))
T = Matrix.Translation((-cx, -cy, -z0))

def mesh_copy(name, srcobj, ratio=None):
    me = srcobj.data.copy(); me.name = name
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    me.transform(T)
    for p in me.polygons: p.use_smooth = True
    if ratio:
        mod = ob.modifiers.new('dec', 'DECIMATE'); mod.decimate_type = 'COLLAPSE'; mod.ratio = ratio; mod.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = ob
        for o in sc.objects: o.select_set(o == ob)
        bpy.ops.object.modifier_apply(modifier='dec')
    me.materials.clear()
    return ob

outs = [mesh_copy('ms_0', src['mountainside_LOD2']), mesh_copy('ms_1', src['mountainside_LOD3']),
        mesh_copy('ms_2', src['mountainside_LOD3'], 0.27), mesh_copy('ms_3', src['mountainside_LOD3'], 0.085),
        mesh_copy('ms_4', src['mountainside_LOD3'], 0.03)]
meta = {'source': 'assets/mountain/mountainside_4k.blend (Poly Haven Mountainside, CC0)', 'unit': 'm', 'up': '+Y', 'front': '+Z', 'lods': []}
for o in outs:
    vs = [v.co for v in o.data.vertices]
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    lo = [min(v[k] for v in vs) for k in range(3)]; hi = [max(v[k] for v in vs) for k in range(3)]
    # 游戏坐标：x = x，y = z，z = -y
    meta['lods'].append({'name': o.name, 'tris': tris, 'bbox': [round(lo[0], 3), round(lo[2], 3), round(-hi[1], 3), round(hi[0], 3), round(hi[2], 3), round(-lo[1], 3)]})
    print('LOD', o.name, tris, meta['lods'][-1]['bbox'])
for o in sc.objects: o.select_set(o in outs)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'mountainside.glb'), export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_texcoords=True, export_normals=True, export_materials='NONE', export_animations=False)
json.dump(meta, open(os.path.join(OUT, 'mountainside.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('GLB', os.path.getsize(os.path.join(OUT, 'mountainside.glb')) // 1024, 'KB')

# ---------- 2. 法线、粗糙度 EXR → 2K 浮点数组 ----------
def dump(img, name):
    w, h = img.size
    buf = np.empty(w * h * 4, np.float32); img.pixels.foreach_get(buf)
    a = buf.reshape(h, w, 4)[::-1, :, :3]                       # Blender 像素自下而上
    a = a.reshape(h // 2, 2, w // 2, 2, 3).mean(axis=(1, 3))
    np.save(os.path.join(TMP, name), a.astype(np.float32))
    print('DUMP', name, a.shape, float(a.min()), float(a.max()))
for im in bpy.data.images:
    if 'nor_gl' in im.name: dump(im, 'nor.npy')
    elif 'rough' in im.name: dump(im, 'rough.npy')

# ---------- 3. 正投影烘焙 ----------
mat = bpy.data.materials['mountainside']
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
base_src = bsdf.inputs['Base Color'].links[0].from_socket
nrm_src = bsdf.inputs['Normal'].links[0].from_socket if bsdf.inputs['Normal'].links else None
emit = nt.nodes.new('ShaderNodeEmission')
for o in sc.objects:
    o.hide_render = (o != lod0)
lod0.data.materials[0] = mat if lod0.data.materials else None
cam = bpy.data.objects.new('bakecam', bpy.data.cameras.new('bakecam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'
bbx = [v.co.x for v in lod0.data.vertices]; bbz = [v.co.z for v in lod0.data.vertices]
S = max(max(bbx) - min(bbx), max(bbz) - min(bbz)) + 0.1
ccx, ccz = (max(bbx) + min(bbx)) / 2, (max(bbz) + min(bbz)) / 2
cam.data.ortho_scale = S
cam.location = (ccx, -30, ccz); cam.rotation_euler = (math.radians(90), 0, 0)
cam.data.clip_end = 100
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = sc.render.resolution_y = 2048
sc.render.film_transparent = True
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = 0; sc.view_settings.gamma = 1
sc.render.image_settings.file_format = 'OPEN_EXR'; sc.render.image_settings.color_depth = '32'
if sc.world is None: sc.world = bpy.data.worlds.new('w')
sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.0
meta_bake = {'ortho': S, 'cx': ccx - cx, 'cz': ccz - z0}
def render(name):
    p = os.path.join(TMP, name + '.exr')
    sc.render.filepath = p; bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(p)
    w, h = im.size
    buf = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(buf)
    a = buf.reshape(h, w, 4)[::-1]
    np.save(os.path.join(TMP, name + '.npy'), a.astype(np.float32))
    bpy.data.images.remove(im)
    print('BAKE', name, a.shape)
# 漫反射：自发光 = 贴图颜色（线性）
for l in list(out.inputs['Surface'].links): nt.links.remove(l)
nt.links.new(base_src, emit.inputs['Color']); nt.links.new(emit.outputs['Emission'], out.inputs['Surface'])
render('front_albedo')
# 法线：带法线贴图的着色法线 → 相机空间 → 0..1
vt = nt.nodes.new('ShaderNodeVectorTransform'); vt.vector_type = 'NORMAL'; vt.convert_from = 'WORLD'; vt.convert_to = 'CAMERA'
if nrm_src is not None: nt.links.new(nrm_src, vt.inputs['Vector'])
else:
    geo = nt.nodes.new('ShaderNodeNewGeometry'); nt.links.new(geo.outputs['Normal'], vt.inputs['Vector'])
mm = nt.nodes.new('ShaderNodeVectorMath'); mm.operation = 'MULTIPLY_ADD'
mm.inputs[1].default_value = (0.5, 0.5, 0.5); mm.inputs[2].default_value = (0.5, 0.5, 0.5)
nt.links.new(vt.outputs['Vector'], mm.inputs[0])
for l in list(emit.inputs['Color'].links): nt.links.remove(l)
nt.links.new(mm.outputs['Vector'], emit.inputs['Color'])
render('front_normal')
json.dump(meta_bake, open(os.path.join(TMP, 'bake.json'), 'w'))
print('DONE')
