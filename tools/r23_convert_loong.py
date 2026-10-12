# 第二十三轮：雷龙破虚的素材（assets/boss/chinese_dragon_loong，项目作者提供，只读）→ 网页用的 glb。原文件不改动。
#   source/RYUISM/8030/8030.fbx：游戏坐骑模型「F1_zuoqi24_jinlong」（金龙，无翼），10138 顶点、11196 面、一套材质、173 根骨骼，
#     骨架物体缩放 0.01、转 90°（整条龙约 0.25 米长，头朝 −Y、背朝 +Z；导出 glTF 后头朝 +Z、背朝 +Y），
#     自带动作 idle（102 帧）/ idle_UI（62）/ rest（152）/ run（92），每秒 30 帧；逐帧渲染核对过（tools 外的联系表）：
#     idle 身体伸直、尾略摆；idle_UI 盘成 S 形；rest 由远处飞入后盘卧；run 身体伸直、四肢划动、须鬃飘动。
#     FBX 里贴图名是 F1_zuoqi24_jinlong.png / _N.png（包里没有），实际是 TEXTURE1（底色 + 鬃毛镂空的 alpha）、TEXTURE2（法线）、TEXTURE3（G = 金甲金属遮罩，R = 1 − G，B = 灰度高光）。
#     这里：按名字改接贴图；由 TEXTURE3 生成 glTF 的金属 / 粗糙度贴图（B 通道金属 = TEXTURE3.G，G 通道粗糙度：金甲 0.42、其余 0.75）；
#     删去 26 个挂点空物体（guadian*、mount_point 等）；保留骨架、四段动作（运行时脊柱按路径程序化游动，四肢、须鬃、下颌取动作）。
#   skill/lighting_pack_2_forked_lightning.glb：5 条立体分叉的雷枝（Sketchfab / Fab 转换，带节点旋转）——
#     烘焙各自的节点变换，按主轴（最长的方向）摆成竖直（顶 y = 0、底 y = −1，长度归一），减面到约 40%，只留位置与法线。
# 用法：blender -b --factory-startup --python tools/r23_convert_loong.py -- <chinese_dragon_loong 目录> <输出目录（assets/converted/loong）>
import bpy, bmesh, sys, os, json, math
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
os.makedirs(OUT, exist_ok=True)
info = {'src': 'assets/boss/chinese_dragon_loong/source/RYUISM/8030/8030.fbx'}

# =====================================================================================
# 一、雷龙
# =====================================================================================
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.fbx_import(filepath=os.path.join(SRC, 'source', 'RYUISM', '8030', '8030.fbx'))
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
mesh = next(o for o in bpy.data.objects if o.type == 'MESH')
empties = [o for o in bpy.data.objects if o.type == 'EMPTY']
info['removedEmpties'] = len(empties)
for o in empties:
    bpy.data.objects.remove(o, do_unlink=True)

TEX = os.path.join(SRC, 'source', 'RYUISM', '8030')
img_d = bpy.data.images.load(os.path.join(TEX, 'TEXTURE1.png')); img_d.name = 'loong_d'
img_n = bpy.data.images.load(os.path.join(TEX, 'TEXTURE2.png')); img_n.name = 'loong_n'
img_n.colorspace_settings.name = 'Non-Color'
# 金属 / 粗糙度：glTF 约定 G = 粗糙度、B = 金属
t3 = bpy.data.images.load(os.path.join(TEX, 'TEXTURE3.png'))
w, h = t3.size
px = np.array(t3.pixels[:], dtype=np.float32).reshape(h, w, 4)
metal = px[..., 1]
mr = np.zeros_like(px)
mr[..., 0] = 1.0
mr[..., 1] = 0.75 - 0.33 * metal
mr[..., 2] = metal * 0.9
mr[..., 3] = 1.0
img_mr = bpy.data.images.new('loong_mr', w, h, alpha=False)
img_mr.colorspace_settings.name = 'Non-Color'
img_mr.pixels[:] = mr.ravel()
img_mr.filepath_raw = os.path.join(OUT, '_loong_mr.png'); img_mr.file_format = 'PNG'; img_mr.save()
info['textures'] = {'TEXTURE1': list(img_d.size), 'TEXTURE2': list(img_n.size), 'TEXTURE3': [w, h], 'metalCoverage': round(float(metal.mean()), 3)}

m = bpy.data.materials.new('loong')
m.use_nodes = True
nt = m.node_tree
for n in list(nt.nodes):
    if n.type != 'OUTPUT_MATERIAL':
        nt.nodes.remove(n)
out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
td = nt.nodes.new('ShaderNodeTexImage'); td.image = img_d
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img_n
tm = nt.nodes.new('ShaderNodeTexImage'); tm.image = img_mr
nm = nt.nodes.new('ShaderNodeNormalMap')
sep = nt.nodes.new('ShaderNodeSeparateColor')
nt.links.new(td.outputs['Color'], bsdf.inputs['Base Color'])
nt.links.new(td.outputs['Alpha'], bsdf.inputs['Alpha'])
nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
nt.links.new(tm.outputs['Color'], sep.inputs['Color'])
nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
m.use_backface_culling = False
try:
    m.surface_render_method = 'DITHERED'
except Exception:
    pass
mesh.data.materials.clear()
mesh.data.materials.append(m)
info['mesh'] = {'verts': len(mesh.data.vertices), 'polys': len(mesh.data.polygons), 'groups': len(mesh.vertex_groups)}
info['bones'] = len(arm.data.bones)
info['actions'] = {a.name: [int(a.frame_range[0]), int(a.frame_range[1])] for a in bpy.data.actions}
info['fps'] = bpy.context.scene.render.fps

# 脊柱链（头 → 尾）：Bone318（头）← Skinbone049 … 044 ← Bone308 → Skinbone018 … 042（尾）
chain = ['Bone318'] + ['Skinbone%03d' % i for i in range(49, 43, -1)] + ['Skinbone%03d' % i for i in range(18, 43)]
bones = arm.data.bones
missing = [n for n in chain if n not in bones]
assert not missing, missing
M = arm.matrix_world
def g(v):            # Blender 世界 → glTF（Y 朝上）：(x, y, z) → (x, z, −y)
    return [round(v.x, 6), round(v.z, 6), round(-v.y, 6)]
spine = []
for n in chain:
    b = bones[n]
    spine.append({'name': n, 'head': g(M @ b.head_local), 'tail': g(M @ b.tail_local)})
pts = [M @ v.co for v in mesh.data.vertices] if False else None
# 网格的世界包围盒（静止姿势；网格物体自带的变换一并算上）
mw = mesh.matrix_world
co = np.array([list(mw @ v.co) for v in mesh.data.vertices], dtype=np.float64)
gl = np.stack([co[:, 0], co[:, 2], -co[:, 1]], axis=1)
info['bbox'] = [gl.min(0).round(5).tolist(), gl.max(0).round(5).tolist()]
info['spine'] = spine
info['jaw'] = 'Bone192'
info['whiskers'] = {'L': ['Bone%d' % i for i in range(222, 237)], 'R': ['Bone%d' % i for i in range(288, 303)]}
info['legs'] = {'FL': ['Bone128', 'Bone129', 'Bone130'], 'FR': ['Bone258', 'Bone259', 'Bone260'], 'RL': ['Bone113', 'Bone114', 'Bone115'], 'RR': ['Bone362', 'Bone363', 'Bone364']}
# 吻尖（头部最前的顶点）与头骨的距离
info['snout'] = [round(float(gl[:, 0][np.argmax(gl[:, 2])]), 5), round(float(gl[:, 1][np.argmax(gl[:, 2])]), 5), round(float(gl[:, 2].max()), 5)]

bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True); mesh.select_set(True)
bpy.context.view_layer.objects.active = arm
glb = os.path.join(OUT, 'loong.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='ACTIONS',
                          export_skins=True, export_morph=False, export_image_format='AUTO', export_yup=True, export_apply=False)
info['glbBytes'] = os.path.getsize(glb)
try:
    os.remove(os.path.join(OUT, '_loong_mr.png'))
except OSError:
    pass

# =====================================================================================
# 二、闪电
# =====================================================================================
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, 'skill', 'lighting_pack_2_forked_lightning.glb'))
bolts = []
objs = [o for o in bpy.data.objects if o.type == 'MESH']
objs.sort(key=lambda o: o.name)
for i, o in enumerate(objs):
    me = o.data
    bm = bmesh.new(); bm.from_mesh(me)
    bm.transform(o.matrix_world)
    vs = np.array([list(v.co) for v in bm.verts], dtype=np.float64)
    c = vs.mean(0)
    # 主轴：协方差的最大特征向量；朝下的一端定为底（顶点更稀、更散的一端是分叉的枝梢——按离中心最远的点所在一侧定为底）
    cov = np.cov((vs - c).T)
    ev, evec = np.linalg.eigh(cov)
    ax = evec[:, np.argmax(ev)]
    proj = (vs - c) @ ax
    # 分叉多的一端点数多、横向散：取两端 10% 的横向散布，散得大的一端朝下
    lo, hi = np.quantile(proj, [0.1, 0.9])
    def spread(sel):
        q = vs[sel] - c
        q = q - np.outer(q @ ax, ax)
        return float(np.sqrt((q ** 2).sum(1)).mean())
    if spread(proj >= hi) > spread(proj <= lo):
        ax = -ax; proj = -proj
    # 旋转：ax → −Y
    a = Vector(ax.tolist()).normalized(); target = Vector((0, 0, -1))         # Blender 里 Z 朝上；导出 glTF 后 −Z → −Y
    q = a.rotation_difference(target)
    R = q.to_matrix().to_4x4()
    bm.transform(Matrix.Translation(-Vector(c.tolist())))
    bm.transform(R)
    zs = np.array([v.co.z for v in bm.verts])
    top, bot = zs.max(), zs.min()
    L = top - bot
    bm.transform(Matrix.Translation(Vector((0, 0, -top))))
    bm.transform(Matrix.Scale(1.0 / L, 4))
    xs = np.array([[v.co.x, v.co.y] for v in bm.verts])
    nv0 = len(bm.verts)
    bm.to_mesh(me)
    bm.free()
    o.matrix_world = Matrix.Identity(4)
    o.name = 'bolt%d' % i; me.name = 'bolt%d' % i
    dec = o.modifiers.new('dec', 'DECIMATE'); dec.ratio = 0.4
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier='dec')
    for mat_slot in list(o.material_slots):
        pass
    o.data.materials.clear()
    bolts.append({'name': o.name, 'verts0': nv0, 'verts': len(o.data.vertices), 'len': round(float(L), 3), 'width': [round(float(np.ptp(xs[:, 0])), 4), round(float(np.ptp(xs[:, 1])), 4)]})
# 只留雷枝网格
for o in list(bpy.data.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='SELECT')
lg = os.path.join(OUT, 'lightning.glb')
bpy.ops.export_scene.gltf(filepath=lg, export_format='GLB', use_selection=True, export_animations=False, export_materials='NONE', export_texcoords=False, export_normals=True, export_yup=True)
info['lightning'] = {'src': 'assets/boss/chinese_dragon_loong/skill/lighting_pack_2_forked_lightning.glb', 'bolts': bolts, 'glbBytes': os.path.getsize(lg)}
json.dump(info, open(os.path.join(OUT, 'loong.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('LOONG', json.dumps({k: v for k, v in info.items() if k not in ('spine',)}, ensure_ascii=False))
