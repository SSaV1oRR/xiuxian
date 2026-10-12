# 第二十轮：FX_Ink slash 包里的两个 FBX 网格 → 网页用的 glb（只要几何：位置、法线、uv、顶点色；材质在 three.js 里重建）。
#   Eric_Cylinder002_Smooth.FBX  刀光用的月牙带：一段 240° 的弧，外沿（v = 0.5）半径约 0.99、内沿（v = 0 / 1）约 0.565，
#                                 截面是向内收的楔形（上下两面在外沿相交，厚 ±0.176）。Unity 里把它当网格粒子，
#                                 贴 ink_all（墨弧六帧）或 A35-C（白光），绕自身的轴快转一下就是一道挥出去的刀光。
#   Ink_Plane001.FBX             蓄力用的弯带子（约 1.08 米长，两端顶点色透明）：Unity 的 FX_InkSlash_04_Charge
#                                 摆四条在人周围，贴 ink_05（一笔墨），0.3 秒里把贴图偏移从 -1 推到 1——墨笔顺着带子扫向一端。
# 规整成（glb 里 Y 朝上）：
#   inkBand   圆心在原点、平放在 XZ 平面、弧顶朝 +Z，外沿半径 1（运行时按判定距离缩放），u 0 → 1 对应 -120° → +120°（从 +Z 量，向 +X 为正）
#   inkSwirl  u = 0 一端（墨笔扫到的那一端）的中线在原点，两端连线朝 +X、长度 1
# 用法：blender -b --factory-startup --python tools/r20_convert_ink_meshes.py -- <Mesh 目录> <输出 glb> <输出 json>
import bpy, sys, json, math, mathutils

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT, OUT_JSON = argv[0], argv[1], argv[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
info = {}


def load(fn, name):
    before = set(bpy.data.objects)
    bpy.ops.wm.fbx_import(filepath=SRC + '/' + fn)
    ob = [o for o in bpy.data.objects if o not in before and o.type == 'MESH'][0]
    for o in [o for o in bpy.data.objects if o not in before and o is not ob]:
        bpy.data.objects.remove(o, do_unlink=True)
    ob.name = name; ob.data.name = name
    # 把物体变换写进网格（之后只在网格上做规整）
    ob.data.transform(ob.matrix_world)
    ob.matrix_world = mathutils.Matrix.Identity(4)
    return ob


def uv_of(me):
    uv = me.uv_layers.active.data
    out = {}
    for li, l in enumerate(me.loops):
        out.setdefault(l.vertex_index, tuple(uv[li].uv))
    return out


# ---------- 月牙带 ----------
band = load('Eric_Cylinder002_Smooth.FBX', 'inkBand')
me = band.data
U = uv_of(me)
mid = [(U[i][0], me.vertices[i].co.copy()) for i in U if abs(U[i][1] - 0.5) < 0.01]
edge = [(U[i][0], me.vertices[i].co.copy()) for i in U if U[i][1] < 0.01]
# 外沿（v = 0.5）拟合圆：代数最小二乘（只看 XY）
import numpy as np
P = np.array([[p.x, p.y] for _, p in mid])
A = np.c_[2 * P[:, 0], 2 * P[:, 1], np.ones(len(P))]
b = (P ** 2).sum(1)
cx, cy, c0 = np.linalg.lstsq(A, b, rcond=None)[0]
R = math.sqrt(c0 + cx * cx + cy * cy)
r_in = float(np.mean([math.hypot(p.x - cx, p.y - cy) for _, p in edge]))
th = float(max(abs(p.z) for _, p in edge))
ang = sorted((u, math.degrees(math.atan2(p.x - cx, p.y - cy))) for u, p in mid)
print('BAND center', round(cx, 4), round(cy, 4), 'R', round(R, 4), 'inner', round(r_in, 4), 'half thickness', round(th, 4), 'angle u0', round(ang[0][1], 1), 'u1', round(ang[-1][1], 1))
# 圆心挪到原点、外沿半径 1；弧顶（Blender +Y）转到 -Y（导出 Y 朝上后即 +Z）
me.transform(mathutils.Matrix.Translation((-cx, -cy, 0)))
me.transform(mathutils.Matrix.Scale(1 / R, 4))
me.transform(mathutils.Matrix.Rotation(math.pi, 4, 'Z'))
me.update()
# 转过半圈后 u 0 → 1 的走向：量一下（导出后 +Z 是弧顶；从 +Z 量、向 +X 为正）
U = uv_of(me)
def gl(p): return (p.x, p.z, -p.y)          # Blender → glTF（Y 朝上）
pts = sorted((U[i][0], gl(me.vertices[i].co)) for i in U if abs(U[i][1] - 0.5) < 0.01)
a0 = math.degrees(math.atan2(pts[0][1][0], pts[0][1][2])); a1 = math.degrees(math.atan2(pts[-1][1][0], pts[-1][1][2]))
info['inkBand'] = {'outer': 1.0, 'inner': round(r_in / R, 4), 'halfThickness': round(th / R, 4), 'uAngle': [round(a0, 2), round(a1, 2)],
                   'verts': len(me.vertices), 'tris': sum(len(p.vertices) - 2 for p in me.polygons),
                   'note': 'v=0.5 外沿；v=0、1 内沿（上、下两面）；u 沿弧'}
print('BAND u0 angle', round(a0, 1), 'u1 angle', round(a1, 1))

# ---------- 弯带子 ----------
sw = load('Ink_Plane001.FBX', 'inkSwirl')
me = sw.data
U = uv_of(me)
vmid = sorted(set(round(U[i][1], 3) for i in U))
vc = vmid[len(vmid) // 2]
center = sorted((U[i][0], me.vertices[i].co.copy()) for i in U if abs(U[i][1] - vc) < 0.004)
p0, p1 = center[0][1], center[-1][1]
L = (p1 - p0).length
print('SWIRL u0', tuple(round(x, 3) for x in p0), 'u1', tuple(round(x, 3) for x in p1), 'len', round(L, 4))
me.transform(mathutils.Matrix.Translation(-p0))
d = (p1 - p0).normalized()
# 两端连线转到 Blender +X（导出后仍是 +X）；带面大致在 Blender XZ 平面 → 导出后在 XY 平面
rot = d.rotation_difference(mathutils.Vector((1, 0, 0))).to_matrix().to_4x4()
me.transform(rot)
me.transform(mathutils.Matrix.Scale(1 / L, 4))
me.update()
cols = me.color_attributes
info['inkSwirl'] = {'length': 1.0, 'srcLength': round(L, 4), 'verts': len(me.vertices), 'tris': sum(len(p.vertices) - 2 for p in me.polygons),
                    'vertexColor': [c.name for c in cols], 'note': 'u=0 一端在原点（墨笔扫向这一端）；顶点色 alpha 两端为 0'}

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_materials='NONE', export_vertex_color='ACTIVE', export_normals=True, export_texcoords=True)
json.dump(info, open(OUT_JSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('WROTE', OUT, OUT_JSON)
