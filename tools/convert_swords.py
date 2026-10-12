# 第十五轮：assets/sword 里适合游戏的剑器 → assets/converted/swords/<id>.glb 与 swords.json（原始文件只读不改）
#   blender -b --factory-startup --python tools/convert_swords.py
#
# 素材清点（逐个导入核对过）：
#   sword1/source/193_Weapon.fbx      三个网格（刀身 Sheet_17、刀柄与镡 Lofted.001/.002），1.43 万面；FBX 里材质没接贴图，
#                                     贴图在 sword1/textures（BaseColor / Metallic / Roughness / Normal，4096²）；
#                                     internal_ground_ao_texture.jpeg 是 Sketchfab 地面阴影图，不属于刀。单刃弯刀，刃上有血迹。
#   sword2/extracted/Fantasy_sword/sword.fbx   刀柄 Cylinder.007 + 剑身与护手 SurfCurve.010，2,308 面，没有材质；
#                                     贴图（albedo / metallic / roughness / Normal / emissive / AO，4096²）在 sword2/textures 与
#                                     sword2/extracted/.../textures 各有一份——逐像素比较完全相同（.jpeg / .jpg 之别），只算一份。
#                                     sword2/source/Fantasy_sword_alpha.rar 是同一模型的原始压缩包。符文护手、赤色渐变剑身、符文自发光。
#   sword3/Sword.fbx 与 SwordLODS.fbx  同一把荆棘巨剑（后者另含 LOD1 4,000 面、LOD2 2,000 面），取 Sword.fbx（1.6 万面）；
#                                     贴图 2048²（BaseColor / Metallic / Roughness / Normal，另有 ORM、Height、VariationMask 未用）。
#   fantasy_magic_weapons_potions_pack.blend   一个 41.7 万面的合并网格：5 把晶剑（4.3–7.2 万面）+ 8 只药瓶（药瓶第六轮已用）；
#                                     贴图打包在文件里（底色 / 法线 4096²，金属度-粗糙度 / 自发光 2048²），手绘描边风格。
#   katana.glb（Sketchfab「Katana」，saltyrecuirt，CC BY 4.0）  一个网格 1.2 万面（310 个散件：刀身、柄卷、目贯、镡），
#                                     底色 + 法线贴图 1024²；只有刀，没有鞘。细长的素面太刀。
#   dragon_katana_oni_koroshi.glb（Sketchfab「Dragon katana "Oni koroshi"」，Sky_Hunter，CC BY 4.0）  一个 8 万面的网格里
#                                     并排放着刀与刀鞘（364 个散件，刀鞘整个在刀的上方）：按散件的位置分开——刀进剑器清单，
#                                     刀鞘另存为这把刀的鞘（swords/panlong_saya.glb），收刀时挂在腰间代替程序生成的剑鞘。
#                                     底色、金属度-粗糙度、法线贴图 1024²。镡是一条盘绕的金龙。
#   除这把太刀外，这些文件里都没有剑鞘（其余各剑的鞘由 cultivator.js 按剑身截面生成）。
#
#   只转其中几把并并入现有清单：blender -b --factory-startup --python tools/convert_swords.py -- --only qiushui,panlong
#
# 每把剑统一成：剑柄握持处为原点，剑尖朝 +Y（glTF），剑面法线朝 ±Z，刃口（弯刀为外凸一侧）朝 +X；按设定的全长缩放（米）；
# 面数过多的减面；贴图缩到 1024（晶剑先从共用贴图集里裁出自己的那块）；导出 glb。
# swords.json 记录每把剑的尺寸（剑尖、护手、剑首的位置）、握持与背负的挂接参数（各剑各一组）。
import bpy, bmesh, sys, os, json, math
import numpy as np
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'assets', 'sword')
OUT = os.path.join(ROOT, 'assets', 'converted', 'swords')
TMP = os.path.join(ROOT, 'tools', '_build', 'swords')

T1 = os.path.join(A, 'sword1', 'textures')
T2 = os.path.join(A, 'sword2', 'extracted', 'Fantasy_sword', 'textures')
SPECS = [
    # id、名、来源、全长（米）、减面目标、贴图
    dict(grip={"along": 0.075, "inward": 0.02, "dy": 0.0, "roll": 0, "scale": 1}, hip={"pos": [0.19, 0.04, 0.1], "dir": [0.07, -0.62, -0.78]}, id='chixiao', name='赤霄', desc='符文护手、赤色渐变的剑身，护手上的符文微微发光。', src=('fbx', os.path.join(A, 'sword2', 'extracted', 'Fantasy_sword', 'sword.fbx')), length=1.02,
         tex=dict(base=f'{T2}/DefaultMaterial_albedo.jpg', metal=f'{T2}/DefaultMaterial_metallic.jpg', rough=f'{T2}/DefaultMaterial_roughness.jpg',
                  normal=f'{T2}/DefaultMaterial_Normal.png', emissive=f'{T2}/DefaultMaterial_emissive.jpg')),
    dict(grip={"along": 0.075, "inward": 0.02, "dy": 0.0, "roll": 0, "scale": 1}, hip={"pos": [0.19, 0.06, 0.12], "dir": [0.06, -0.7, -0.71]}, id='zhanyao', name='斩妖', desc='单刃长刀，刀身微弯，刃上留着斩妖时的血痕。', src=('fbx', os.path.join(A, 'sword1', 'source', '193_Weapon.fbx')), length=1.12, curved=True,
         tex=dict(base=f'{T1}/193_Weapon_Material_BaseColor.png', metal=f'{T1}/193_Weapon_Material_Metallic.png', rough=f'{T1}/193_Weapon_Material_Roughness.png',
                  normal=f'{T1}/193_Weapon_Material_Normal.png')),
    dict(grip={"along": 0.075, "inward": 0.024, "dy": -0.03, "roll": 0, "scale": 1}, hip={"pos": [0.24, 0.05, 0.1], "dir": [0.12, -0.74, -0.66]}, id='jingji', name='荆棘', desc='缴自魔修的重剑，剑脊生满倒刺，沉重凶戾。', src=('fbx', os.path.join(A, 'sword3', 'Sword.fbx')), length=1.24, tex=None),
    dict(grip={"along": 0.075, "inward": 0.024, "dy": -0.01, "roll": 0, "scale": 1}, hip={"pos": [0.21, 0.04, 0.1], "dir": [0.08, -0.64, -0.76]}, id='zijing', name='紫晶', desc='紫色晶石磨成的灵剑，剑柄缠赤绳。', src=('pack', 0), length=0.98, tex='pack'),
    dict(grip={"along": 0.072, "inward": 0.03, "dy": -0.015, "roll": 0, "scale": 1}, hip={"pos": [0.21, 0.04, 0.1], "dir": [0.08, -0.64, -0.76]}, id='biluo', name='碧萝', desc='翠绿晶刃，护手镶紫晶，剑身缠着藤绳。', src=('pack', 1), length=0.98, tex='pack'),
    dict(grip={"along": 0.073, "inward": 0.028, "dy": -0.012, "roll": 0, "scale": 1}, hip={"pos": [0.215, 0.04, 0.1], "dir": [0.08, -0.64, -0.76]}, id='bingpo', name='冰魄', desc='冰蓝晶刃，剑柄系着赤羽。', src=('pack', 2), length=0.98, tex='pack'),
    dict(grip={"along": 0.074, "inward": 0.026, "dy": -0.01, "roll": 0, "scale": 1}, hip={"pos": [0.21, 0.04, 0.1], "dir": [0.08, -0.64, -0.76]}, id='qingyu', name='青玉', desc='青玉晶刃，护手垂着流苏。', src=('pack', 3), length=0.98, tex='pack'),
    dict(grip={"along": 0.075, "inward": 0.024, "dy": 0.0, "roll": 0, "scale": 1}, hip={"pos": [0.2, 0.04, 0.1], "dir": [0.08, -0.64, -0.76]}, id='jiangxia', name='绛霞', desc='绛紫晶刃，护手嵌一枚碧玉。', src=('pack', 4), length=0.98, tex='pack'),
    # 第十五轮补：assets/sword 根目录下的两把太刀（CC BY 4.0，署名见 README）
    dict(grip={"along": 0.075, "inward": 0.02, "dy": 0.0, "roll": 0, "scale": 1}, hip={"pos": [0.19, 0.06, 0.12], "dir": [0.06, -0.7, -0.71]}, id='qiushui', name='秋水', desc='素面长太刀，刀身细长、弧度舒缓，一泓秋水般清冷；柄缠褐绳，金色鞘口。', src=('glb', os.path.join(A, 'katana.glb')), length=1.05, curved=True, tex=None, guard_frac=(0.203, 0.222), kind='太刀'),
    dict(grip={"along": 0.075, "inward": 0.02, "dy": 0.0, "roll": 0, "scale": 1}, hip={"pos": [0.19, 0.06, 0.12], "dir": [0.06, -0.7, -0.71]}, id='panlong', name='蟠龙', desc='镡铸成一条盘绕的金龙，黑柄缠绳；配一只黑漆朱绳、金色鞘尾的原装刀鞘。', src=('glb', os.path.join(A, 'dragon_katana_oni_koroshi.glb')), length=1.03, curved=True, tex=None, saya=True, kind='太刀'),
]
MAX_FACES = 14000


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def tex_node(nt, path, non_color=False, size=1024):
    n = nt.nodes.new('ShaderNodeTexImage')
    im = bpy.data.images.load(path, check_existing=True)
    if non_color: im.colorspace_settings.name = 'Non-Color'
    if im.size[0] > size: im.scale(size, size)
    n.image = im
    return n


def pbr_material(name, base=None, metal=None, rough=None, normal=None, emissive=None, size=1024):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    if base: nt.links.new(tex_node(nt, base, size=size).outputs['Color'], b.inputs['Base Color'])
    if metal: nt.links.new(tex_node(nt, metal, True, size).outputs['Color'], b.inputs['Metallic'])
    if rough: nt.links.new(tex_node(nt, rough, True, size).outputs['Color'], b.inputs['Roughness'])
    if normal:
        t = tex_node(nt, normal, True, size); nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if emissive:
        nt.links.new(tex_node(nt, emissive, size=size).outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = 1.0
    return m


def join_meshes():
    ms = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in bpy.context.scene.objects: o.select_set(o in ms)
    bpy.context.view_layer.objects.active = ms[0]
    # 先把父级（骨架 0.01 缩放等）烘进网格
    for o in ms:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(ms) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    for x in list(bpy.context.scene.objects):
        if x is not o: bpy.data.objects.remove(x, do_unlink=True)
    return o


def verts_np(o):
    co = np.zeros(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def analyse(P, curved=False, guard_frac=None):
    """返回把剑摆正的旋转（列：x 刃口、y 剑尖、z 剑面法线）与沿剑身的分段（米制前的原始单位）"""
    c = P.mean(0); Q = P - c
    w, v = np.linalg.eigh(np.cov(Q.T))
    ax = v[:, np.argmax(w)]                                  # 长轴
    s = Q @ ax
    smin, smax = s.min(), s.max()
    nb = 120
    edges = np.linspace(smin, smax, nb + 1)
    width = np.zeros(nb)
    perp = Q - np.outer(s, ax)
    for i in range(nb):
        m = (s >= edges[i]) & (s <= edges[i + 1])
        if m.sum() < 3: continue
        pp = perp[m]
        d = np.linalg.norm(pp[:, None, :] - pp[None, ::max(1, len(pp) // 60), :], axis=2).max() if len(pp) < 4000 else np.ptp(pp, axis=0).max()
        width[i] = d
    gi = int(np.argmax(width))                               # 护手：最宽的一段
    sg = (edges[gi] + edges[gi + 1]) / 2
    if (smax - sg) < (sg - smin):                            # 剑尖在较远的一端
        ax = -ax; s = -s; smin, smax = -smax, -smin; sg = -sg
        width = width[::-1]; edges = -edges[::-1]
        gi = nb - 1 - gi
    # 护手下沿：从护手往剑首方向，宽度降到护手宽度的 55% 以下的位置
    gw = width[gi]; lo_i = gi
    while lo_i > 0 and width[lo_i - 1] > gw * 0.55: lo_i -= 1
    guard_lo = edges[lo_i]
    hi_i = gi
    while hi_i < nb - 1 and width[hi_i + 1] > gw * 0.55: hi_i += 1
    guard_hi = edges[hi_i + 1]
    if guard_frac:                             # 镡与柄卷差不多宽（太刀）认不出：按设定的位置（自剑首量起占全长的比例）
        guard_lo = smin + guard_frac[0] * (smax - smin); guard_hi = smin + guard_frac[1] * (smax - smin)
        lo_i = max(0, int(np.searchsorted(edges, guard_lo)) - 1); hi_i = min(nb - 1, int(np.searchsorted(edges, guard_hi)) - 1)
        gw = float(width[lo_i:hi_i + 1].max())
    # 剑面法线：剑身段（护手以上 10% 到剑尖前 10%）垂直截面里最薄的方向
    L = smax - smin
    mb = (s > guard_hi + 0.1 * (smax - guard_hi)) & (s < smax - 0.1 * (smax - guard_hi))
    B = perp[mb]
    w2, v2 = np.linalg.eigh(np.cov(B.T))                     # 特征值从小到大；最小的（≈0）是长轴本身（截面里没有这个方向的分量）
    nz = v2[:, 1]; nz = nz - ax * np.dot(nz, ax); nz /= np.linalg.norm(nz)   # 中间那个：截面最薄的方向 = 剑面法线
    nx = np.cross(ax, nz)
    if curved:
        # 刃口在外凸一侧：剑身中段相对「护手—剑尖」连线的偏移方向
        mid = (s > guard_hi + 0.35 * (smax - guard_hi)) & (s < guard_hi + 0.65 * (smax - guard_hi))
        base = (s > guard_hi) & (s < guard_hi + 0.08 * (smax - guard_hi))
        tip = s > smax - 0.08 * (smax - guard_hi)
        line = (Q[base].mean(0) + Q[tip].mean(0)) / 2
        if np.dot(Q[mid].mean(0) - line, nx) < 0: nx = -nx; nz = -nz
    R = np.stack([nx, ax, nz], 1)                             # 原始坐标 → 剑的本地（列为本地轴在原始坐标里的方向）
    return dict(c=c, R=R, smin=smin, smax=smax, guard_lo=guard_lo, guard_hi=guard_hi, guard_w=float(gw), L=L,
                blade_w=float(np.percentile(width[hi_i + 2:][width[hi_i + 2:] > 0], 80)) if (width[hi_i + 2:] > 0).any() else float(gw))   # 只算有顶点的切片（低模刀身沿途顶点稀）


SAYA_FACES = 9000


def split_saya(o):
    """刀与刀鞘在同一个网格里（散件）：按散件中心在「次长轴」上的位置分成两组——刀鞘整个在刀的一侧。
    两组之间要有空隙才算分得开；镡（沿刀身最宽的那段）所在的一组是刀。返回 (刀, 刀鞘)。"""
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.scene.objects: x.select_set(x is o)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
    parts = [x for x in bpy.context.scene.objects if x.type == 'MESH']
    C = np.array([verts_np(p).mean(0) for p in parts])
    allP = np.vstack([verts_np(p) for p in parts])
    ext = allP.max(0) - allP.min(0)
    order = np.argsort(ext)                    # 最长的是刀身方向，其次是两件并排的方向
    ax = int(order[1]); long_ax = int(order[2])
    mid = (allP[:, ax].min() + allP[:, ax].max()) / 2
    A_ = [p for p, c in zip(parts, C) if c[ax] < mid]
    B_ = [p for p, c in zip(parts, C) if c[ax] >= mid]
    PA = np.vstack([verts_np(p) for p in A_]); PB = np.vstack([verts_np(p) for p in B_])
    a0, a1, b0, b1 = PA[:, ax].min(), PA[:, ax].max(), PB[:, ax].min(), PB[:, ax].max()
    print('SPLIT axis', ax, 'parts', len(A_), len(B_), 'spans', round(a0, 3), round(a1, 3), round(b0, 3), round(b1, 3))
    assert a1 < b0 or b1 < a0, '刀与刀鞘在这个方向上有重叠，分不开'
    others = [i for i in range(3) if i != long_ax]
    def widest(P):
        s = P[:, long_ax]; e = np.linspace(s.min(), s.max(), 61); w = 0.0
        for i in range(60):
            m = (s >= e[i]) & (s <= e[i + 1])
            if m.sum() > 3: w = max(w, float(np.ptp(P[m][:, others], axis=0).max()))
        return w
    sword, saya = (A_, B_) if widest(PA) > widest(PB) else (B_, A_)
    def join(ps, name):
        for x in bpy.context.scene.objects: x.select_set(x in ps)
        bpy.context.view_layer.objects.active = ps[0]
        if len(ps) > 1: bpy.ops.object.join()
        j = bpy.context.view_layer.objects.active; j.name = name
        return j
    s_o = join(sword, 'sword'); y_o = join(saya, 'saya')
    print('SPLIT sword faces', len(s_o.data.polygons), 'saya faces', len(y_o.data.polygons))
    return s_o, y_o


def align_saya(o, saya, an, grip_s, k, G2B):
    """刀鞘已按刀的变换摆进刀的本地坐标（原本并排放着，有偏移）：平移使鞘口中心对上刀身根部（护手上沿），
    再绕剑面法线（z）转一个小角，让鞘尾一段对上刀尖一带——刀身整个收在鞘里。只平移、绕 z 旋转，不改形状。"""
    P = verts_np(o) @ G2B; S = verts_np(saya) @ G2B
    g1 = (an['guard_hi'] - grip_s) * k
    tip = float(P[:, 1].max())
    def center(Q, y0, y1):
        m = (Q[:, 1] >= y0) & (Q[:, 1] <= y1)
        return Q[m].mean(0) if m.sum() > 3 else None
    root = center(P, g1 + 0.01, g1 + 0.05)
    s0 = float(S[:, 1].min())
    mouth = center(S, s0, s0 + 0.03)
    t = np.array([root[0] - mouth[0], g1 + 0.004 - s0, root[2] - mouth[2]])
    S = S + t
    bt = center(P, tip - 0.12, tip - 0.05); st = center(S, tip - 0.12, tip - 0.05)
    piv = np.array([root[0], g1 + 0.004, root[2]])
    ang = math.atan2(bt[0] - piv[0], bt[1] - piv[1]) - math.atan2(st[0] - piv[0], st[1] - piv[1])
    c, s_ = math.cos(ang), math.sin(ang)
    R = np.array([[c, s_, 0], [-s_, c, 0], [0, 0, 1.0]])
    S = (S - piv) @ R.T + piv
    worst = 0.0
    for y in np.linspace(g1 + 0.05, tip - 0.03, 12):
        cb = center(P, y - 0.01, y + 0.01); cs = center(S, y - 0.015, y + 0.015)
        if cb is not None and cs is not None: worst = max(worst, float(np.hypot(cb[0] - cs[0], cb[2] - cs[2])))
    print('SAYA align t', np.round(t, 4).tolist(), 'rot', round(math.degrees(ang), 3), 'deg; worst centerline offset', round(worst, 4),
          'm; saya y', round(float(S[:, 1].min()), 3), round(float(S[:, 1].max()), 3), 'tip', round(tip, 3))
    Sb = S @ G2B.T
    saya.data.vertices.foreach_set('co', Sb.reshape(-1))
    saya.data.update()


def render_thumb(o, Pg, path):
    """佩剑面板的缩略图：剑身竖直、正对剑面，透明底 160×400"""
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = 160, 400
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('thumb_w'); sc.world = w
    w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.57, 0.6, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    for nm, en, rot in (('key', 3.2, (math.radians(55), math.radians(15), math.radians(-25))), ('rim', 1.4, (math.radians(-60), 0, math.radians(160)))):
        L = bpy.data.objects.new(nm, bpy.data.lights.new(nm, 'SUN')); sc.collection.objects.link(L)
        L.data.energy = en; L.rotation_euler = rot
    cam = bpy.data.objects.new('thumb_cam', bpy.data.cameras.new('thumb_cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'
    y0, y1 = float(Pg[:, 1].min()), float(Pg[:, 1].max())
    cam.data.ortho_scale = (y1 - y0) * 1.06
    # 剑面法线是 glTF 的 +Z，即 Blender 的 -Y：镜头在 -Y 一侧往 +Y 看；剑身沿 Blender +Z
    cam.location = (0, -3, (y0 + y1) / 2); cam.rotation_euler = (math.radians(90), 0, 0)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)
    pack_src = os.path.join(A, 'fantasy_magic_weapons_potions_pack.blend')
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    only = set(argv[argv.index('--only') + 1].split(',')) if '--only' in argv else None
    meta = []
    for sp in SPECS:
        if only and sp['id'] not in only: continue
        clear()
        kind, src = sp['src']
        if kind == 'fbx':
            bpy.ops.import_scene.fbx(filepath=src)
            o = join_meshes()
            if sp['tex']:
                m = pbr_material(sp['id'], **sp['tex'])
                o.data.materials.clear(); o.data.materials.append(m)
            else:
                for mat in o.data.materials:
                    for n in mat.node_tree.nodes:
                        if n.type == 'TEX_IMAGE' and n.image and n.image.size[0] > 1024: n.image.scale(1024, 1024)
        elif kind == 'glb':
            bpy.ops.import_scene.gltf(filepath=src)
            o = join_meshes()
            for mat in o.data.materials:
                for n in mat.node_tree.nodes:
                    if n.type == 'TEX_IMAGE' and n.image and n.image.size[0] > 1024: n.image.scale(1024, 1024)
            if sp.get('saya'): o, saya = split_saya(o)
        else:
            bpy.ops.wm.open_mainfile(filepath=pack_src)
            src_o = [x for x in bpy.context.scene.objects if x.type == 'MESH'][0]
            bpy.context.view_layer.objects.active = src_o
            for x in bpy.context.scene.objects: x.select_set(x is src_o)
            bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
            parts = [x for x in bpy.context.scene.objects if x.type == 'MESH']
            # 与 preview_pack 同样的归并：上排五把剑按 x 排序
            boxes = []
            for p in parts:
                P = verts_np(p) @ np.array(p.matrix_world)[:3, :3].T + np.array(p.matrix_world)[:3, 3]
                boxes.append((p, P.min(0), P.max(0)))
            tall = [b for b in boxes if b[2][2] - b[1][2] > 1.0]
            tall.sort(key=lambda b: b[1][0])
            keep = tall[src][0]
            # 同一把剑上的散件（绳、穗）：包围盒在 x 上与之重叠、上下相接
            k_mn, k_mx = tall[src][1], tall[src][2]
            group = [b[0] for b in boxes if b[1][0] < k_mx[0] - 0.002 and b[2][0] > k_mn[0] + 0.002 and b[1][2] > k_mn[2] - 0.05]
            for x in list(bpy.context.scene.objects):
                if x.type == 'MESH' and x not in group: bpy.data.objects.remove(x, do_unlink=True)
            o = join_meshes()
        if kind != 'glb' or not sp.get('saya'): saya = None
        me = o.data
        nf0 = len(me.polygons)
        # 贴图：晶剑从共用贴图集里裁出本剑用到的区域，重排 UV
        if sp['tex'] == 'pack':
            uv = me.uv_layers.active.data
            U = np.zeros(len(uv) * 2); uv.foreach_get('uv', U); U = U.reshape(-1, 2)
            u0, v0 = np.floor(U.min(0) * 64) / 64; u1, v1 = np.ceil(U.max(0) * 64) / 64
            u0, v0 = max(0, u0), max(0, v0); u1, v1 = min(1, u1), min(1, v1)
            mat = me.materials[0]
            for n in mat.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image:
                    im = n.image
                    W, H = im.size
                    px = np.empty(W * H * 4, np.float32); im.pixels.foreach_get(px); px = px.reshape(H, W, 4)
                    x0, x1 = int(u0 * W), int(u1 * W); y0, y1 = int(v0 * H), int(v1 * H)
                    crop = np.ascontiguousarray(px[y0:y1, x0:x1])
                    side = 1024
                    new = bpy.data.images.new(f"{sp['id']}_{im.name}", width=x1 - x0, height=y1 - y0, alpha=True)
                    new.colorspace_settings.name = im.colorspace_settings.name
                    new.pixels.foreach_set(crop.reshape(-1))
                    if max(new.size) > side:
                        k = side / max(new.size); new.scale(max(1, int(new.size[0] * k)), max(1, int(new.size[1] * k)))
                    n.image = new
            U[:, 0] = (U[:, 0] - u0) / (u1 - u0); U[:, 1] = (U[:, 1] - v0) / (v1 - v0)
            uv.foreach_set('uv', U.reshape(-1))
            mat.name = sp['id']
        # 减面
        if nf0 > MAX_FACES:
            mod = o.modifiers.new('dec', 'DECIMATE'); mod.ratio = MAX_FACES / nf0; mod.use_collapse_triangulate = True
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier='dec')
        if saya and len(saya.data.polygons) > SAYA_FACES:
            mod = saya.modifiers.new('dec', 'DECIMATE'); mod.ratio = SAYA_FACES / len(saya.data.polygons); mod.use_collapse_triangulate = True
            bpy.context.view_layer.objects.active = saya
            bpy.ops.object.modifier_apply(modifier='dec')
        # 摆正：分析 → 旋转、缩放、平移（Blender 世界 Z 朝上；导出 glTF 时 +Z → +Y、-Y → +Z）
        P = verts_np(o)
        an = analyse(P, sp.get('curved', False), sp.get('guard_frac'))
        k = sp['length'] / an['L']
        # 握持点：护手下沿再往剑首 5.5 厘米（一掌宽的一半）
        grip_s = an['guard_lo'] - 0.055 / k
        to_local = an['R'].T                                    # 原始 → 剑本地（x 刃口、y 剑尖、z 剑面法线）
        # 剑本地（glTF 约定）→ Blender 世界：glTF x→x，y→z，z→-y
        G2B = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float)
        M3 = G2B @ to_local * k
        org = an['c'] + an['R'][:, 1] * grip_s
        M = Matrix(np.vstack([np.hstack([M3, (-M3 @ org).reshape(3, 1)]), [0, 0, 0, 1]]).tolist())
        me.transform(M)
        me.update()
        o.matrix_world = Matrix.Identity(4)
        if saya:
            saya.data.transform(M); saya.data.update(); saya.matrix_world = Matrix.Identity(4)
            align_saya(o, saya, an, grip_s, k, G2B)
        # 用摆正后的顶点复核尺寸（glTF 约定：y 沿剑身）
        P2 = verts_np(o); Pg = P2 @ G2B           # Blender → glTF：x=x, y=z, z=-y（G2B 正交，转置即逆；行向量右乘 G2B 等于左乘其转置）
        info = dict(id=sp['id'], name=sp['name'], desc=sp['desc'], file=f"swords/{sp['id']}.glb",
                    faces=len(o.data.polygons), facesSrc=nf0,
                    length=round(float(Pg[:, 1].max() - Pg[:, 1].min()), 3),
                    tip=round(float(Pg[:, 1].max()), 3), pommel=round(float(Pg[:, 1].min()), 3),
                    guard=[round(float((an['guard_lo'] - grip_s) * k), 3), round(float((an['guard_hi'] - grip_s) * k), 3)],
                    guardWidth=round(an['guard_w'] * k, 3), bladeWidth=round(an['blade_w'] * k, 3),
                    thick=round(float(Pg[:, 2].max() - Pg[:, 2].min()), 3), curved=bool(sp.get('curved', False)))
        if saya:
            saya.name = sp['id'] + '_saya'
            for x in bpy.context.scene.objects: x.select_set(x is saya)
            sout = os.path.join(OUT, sp['id'] + '_saya.glb')
            bpy.ops.export_scene.gltf(filepath=sout, export_format='GLB', use_selection=True, export_apply=True,
                                      export_image_format='JPEG', export_image_quality=90, export_yup=True,
                                      export_animations=False, export_skins=False, export_morph=False)
            Ps = verts_np(saya) @ G2B
            info['sheath'] = dict(file=f"swords/{sp['id']}_saya.glb", faces=len(saya.data.polygons), bytes=os.path.getsize(sout),
                                  y0=round(float(Ps[:, 1].min()), 3), y1=round(float(Ps[:, 1].max()), 3))
            saya.hide_render = True
        out = os.path.join(OUT, sp['id'] + '.glb')
        for x in bpy.context.scene.objects: x.select_set(x is o)
        o.name = sp['id']
        bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True,
                                  export_image_format='JPEG', export_image_quality=90, export_yup=True,
                                  export_animations=False, export_skins=False, export_morph=False)
        info['bytes'] = os.path.getsize(out)
        info['thumb'] = f"swords/{sp['id']}.png"
        render_thumb(o, Pg, os.path.join(OUT, sp['id'] + '.png'))
        meta.append(info)
        print('SWORD', json.dumps(info, ensure_ascii=False))
    if only:                                   # 只转了几把：并入现有的清单（其余各剑的条目原样保留）
        old = os.path.join(TMP, 'swords_meta.json')
        prev = json.load(open(old, encoding='utf-8')) if os.path.exists(old) else []
        ids = [m['id'] for m in meta]
        meta = [m for m in prev if m['id'] not in ids] + meta
        meta.sort(key=lambda m: [s['id'] for s in SPECS].index(m['id']))
    with open(os.path.join(TMP, 'swords_meta.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    # 剑器清单：尺寸来自上面的实测；握持（grip：沿手指 along、朝掌心 inward、沿剑身 dy、绕剑身 roll、scale）与
    # 腰间挂接（hip：骨盆本地的挂点 pos、剑尖方向 dir）各剑一组，取 SPECS 里的设定（没写的用默认值）
    out = {'version': 1, 'default': 'chixiao', 'stats': {'note': '第一版所有剑器共用同一套基础战斗数值'}, 'swords': []}
    for info in meta:
        sp = next(s for s in SPECS if s['id'] == info['id'])
        info = dict(info)
        info['grip'] = sp.get('grip', {'along': 0.075, 'inward': 0.022, 'dy': 0, 'roll': 0, 'scale': 1})
        info['hip'] = sp.get('hip', {'pos': [0.19, 0.04, 0.1], 'dir': [0.07, -0.62, -0.78]})
        info['flight'] = {'length': 2.1}
        if sp.get('kind'): info['kind'] = sp['kind']          # 面板上的类别（缺省按弯刀 / 直剑判断）
        out['swords'].append(info)
    with open(os.path.join(OUT, 'swords.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


main()
