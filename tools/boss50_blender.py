# 第十六轮：镇塔龙君（assets/boss/boss50/source/Dragon Character 3d by Oscar Creativo.fbx，只读）→ tools/_build/boss50_base.glb
#   blender -b --factory-startup --python tools/boss50_blender.py
#
# 素材实情（逐项读文件核对过，详见 docs/R16_REPORT.md）：
#   · 骨架 Armature：99 根骨（Auto-Rig Pro 命名，经 Reallusion 导出；物体缩放 0.01，即厘米）：
#       躯干 root_x（骨盆）→ spine_01/02/03_x → neck_x → head_x（没有下颌骨、眼骨）；胸 c_breast_01/02_l/r；
#       双臂 shoulder → arm_stretch（+ arm_twist）→ forearm_stretch（+ forearm_twist）→ hand → 四指各三节（index / middle / ring / pinky，
#       另有 *_base）与拇指三节；双腿 thigh_stretch（+ thigh_twist）→ leg_stretch（+ leg_twist）→ foot → toes_01；
#       尾 c_tail_00_x … c_tail_06_x（7 节）；双翼是第二条手臂链 shoulder_dupli_001 → arm_stretch_dupli_001 → forearm_stretch_dupli_001
#       → hand_dupli_001，外加三根羽骨 c_arm / forearm / hand_feather_*（翼在背后向下收拢）。
#   · 15 个网格（BAJA5、BAJA5_2 … BAJA5_15），各一个材质 DRAGO_<格>、各自的 UV 落在自己那一 UDIM 格；共 167,300 三角形；
#     每个网格带一个形状键 V_None（检查过：与 Basis 完全相同，没有变形）。
#   · 一段动作 Armature|3677379169280_TempMotion，第 1–633 帧，30 帧/秒（21.07 秒），原地站立的展示动作：
#     放松站姿与振翅、伸展翅膀、甩尾（0–7 秒），降低重心的戒备站姿（8.5–13、15–20 秒），没有行走、攻击、受击、倒地。
#
# 本脚本：贴图路径按格号改接到 textures/（只为在 Blender 里检查；导出的贴图集由 boss50_textures.py 生成）；各网格 UV 从自己的 UDIM 格
# 移到 4×4 贴图集里对应的格（同 boss50_textures.py 的 atlas.json）；去掉空的形状键；15 个网格合成一个、一个材质；
# 骨架、蒙皮、原动作原样导出（只导出 Armature 的那一段动作）。
import bpy, os, sys, json, math
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FBX = os.path.join(ROOT, 'assets', 'boss', 'boss50', 'source', 'Dragon Character 3d by Oscar Creativo.fbx')
BUILD = os.path.join(ROOT, 'tools', '_build')
ATLAS = json.load(open(os.path.join(BUILD, 'boss50_tex', 'atlas.json')))
OUT = os.path.join(BUILD, 'boss50_base.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX, use_anim=True, ignore_leaf_bones=False, automatic_bone_orientation=False)
sc = bpy.context.scene
arm = next(o for o in sc.objects if o.type == 'ARMATURE')
meshes = [o for o in sc.objects if o.type == 'MESH']
print('ARMATURE', arm.name, 'scale', tuple(arm.scale), 'meshes', len(meshes))

G = ATLAS['grid']; MARGIN = ATLAS['margin']
for o in meshes:
    me = o.data
    tile = int(me.materials[0].name.split('_')[1])
    u0 = (tile - 1001) % 10; v0 = (tile - 1001) // 10
    cx, cy = ATLAS['tiles'][str(tile)]['cell']
    uv = me.uv_layers.active.data
    U = np.zeros(len(uv) * 2); uv.foreach_get('uv', U); U = U.reshape(-1, 2)
    lu = np.clip(U[:, 0] - u0, 0, 1); lv = np.clip(U[:, 1] - v0, 0, 1)
    U[:, 0] = (cx + MARGIN + lu * (1 - 2 * MARGIN)) / G
    U[:, 1] = (cy + MARGIN + lv * (1 - 2 * MARGIN)) / G
    uv.foreach_set('uv', U.reshape(-1))
    # 形状键：核对 V_None 与 Basis 相同，然后去掉
    if me.shape_keys:
        kb = me.shape_keys.key_blocks
        a = np.zeros(len(me.vertices) * 3); b = np.zeros(len(me.vertices) * 3)
        kb[0].data.foreach_get('co', a)
        for k in kb[1:]:
            k.data.foreach_get('co', b)
            print('  shape key', o.name, k.name, 'max delta', float(np.abs(a - b).max()))
        o.shape_key_clear()
# 一个材质（贴图由 convert_boss50.py 换成贴图集）
mat = bpy.data.materials.new('boss50')
mat.use_nodes = True
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
img = bpy.data.images.load(os.path.join(BUILD, 'boss50_tex', 'base_2048.jpg'))
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img
nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
for o in meshes:
    o.data.materials.clear(); o.data.materials.append(mat)
# 合成一个网格（各网格都挂在同一副骨架上）
for o in sc.objects: o.select_set(o in meshes)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.name = 'dragon'
me = body.data
me.calc_loop_triangles()
print('JOINED', body.name, 'verts', len(me.vertices), 'tris', len(me.loop_triangles), 'groups', len(body.vertex_groups))
# 只导出骨架的那一段动作
act = arm.animation_data.action
act.name = 'TempMotion'
for a in list(bpy.data.actions):
    if a is not act: bpy.data.actions.remove(a)
for o in sc.objects: o.select_set(o in (arm, body))
bpy.context.view_layer.objects.active = arm
sc.frame_start, sc.frame_end = 1, 633
sc.render.fps = 30
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=False, export_yup=True,
                          export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True, export_frame_range=False,
                          export_skins=True, export_all_influences=False, export_morph=False, export_def_bones=False,
                          export_texcoords=True, export_normals=True, export_tangents=False, export_materials='EXPORT', export_image_format='JPEG')
print('WROTE', OUT, os.path.getsize(OUT) // 1024, 'KB')
