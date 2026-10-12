# 第二十轮：读 FX_Ink slash 包里的 Unity 预制体（.prefab，Unity YAML），把每个粒子系统的要点参数摘成 JSON。
# 网页引擎没有 Unity 的粒子系统，这份摘要是在 three.js 里重建时取参数的依据（寿命、速度、大小、颜色渐变、
# 发射时间 / 数量、形状、序列帧、渲染方式、材质 → 贴图与着色器参数、层级里的位置与朝向）。
# 用法：python -I tools/r20_ink_parse.py "<解包目录>" <输出.json> [预制体名 ...]
#   <解包目录> 即 tools/r20_unpack_unitypackage.py 的目标目录（里面有 _package_index.json）。
import json, math, os, re, sys

import yaml

try:
    Loader = yaml.CSafeLoader
except AttributeError:
    Loader = yaml.SafeLoader

ROOT, OUT = sys.argv[1], sys.argv[2]
ONLY = set(sys.argv[3:])
INDEX = json.load(open(os.path.join(ROOT, '_package_index.json'), encoding='utf-8'))['assets']


def load(path):
    txt = open(path, encoding='utf-8').read()
    parts = re.split(r'^--- !u!(\d+) &(-?\d+)(?: stripped)?[ \t]*$', txt, flags=re.M)
    objs = {}
    for i in range(1, len(parts), 3):
        d = yaml.load(parts[i + 2], Loader=Loader) or {}
        (kind, body), = d.items() if len(d) == 1 else (('?', d),)
        objs[int(parts[i + 1])] = (int(parts[i]), kind, body or {})
    return objs


def guid_path(ref):
    if not isinstance(ref, dict) or not ref.get('guid'):
        return None
    a = INDEX.get(ref['guid'])
    return a['path'] if a else 'builtin:' + str(ref.get('fileID'))


# ---------- 曲线、渐变 ----------
def curve(c):
    keys = (c or {}).get('m_Curve') or []
    return [[round(k['time'], 4), round(k['value'], 4), round(k.get('inSlope', 0), 3), round(k.get('outSlope', 0), 3)] for k in keys]


def flat(keys):
    return len(keys) <= 1 or all(abs(k[1] - keys[0][1]) < 1e-4 for k in keys)


def mmc(m):
    """MinMaxCurve → 常数 / [min,max] / {'curve': …, 'scale': …} / {'curves': [min,max], 'scale': …}"""
    if not isinstance(m, dict):
        return m
    st, s = m.get('minMaxState', 0), m.get('scalar', 0)
    if st == 0:
        return round(s, 4)
    if st == 3:
        return [round(m.get('minScalar', 0), 4), round(s, 4)]
    if st == 1:
        k = curve(m.get('maxCurve'))
        return round(s * k[0][1], 4) if flat(k) else {'curve': k, 'scale': round(s, 4)}
    if st == 2:
        return {'curves': [curve(m.get('minCurve')), curve(m.get('maxCurve'))], 'scale': round(s, 4)}
    return m


def col(c):
    return [round(c['r'], 3), round(c['g'], 3), round(c['b'], 3), round(c['a'], 3)]


def grad(g):
    nc, na = g.get('m_NumColorKeys', 2), g.get('m_NumAlphaKeys', 2)
    cs = [[round(g['ctime%d' % i] / 65535, 3)] + col(g['key%d' % i])[:3] for i in range(nc)]
    al = [[round(g['atime%d' % i] / 65535, 3), round(g['key%d' % i]['a'], 3)] for i in range(na)]
    return {'rgb': cs, 'a': al, 'mode': g.get('m_Mode', 0)}


def mmg(m):
    """MinMaxGradient：0 单色，1 渐变，2 两色随机，3 两渐变随机，4 随机色"""
    st = m.get('minMaxState', 0)
    if st == 0:
        return {'color': col(m['maxColor'])}
    if st == 1:
        return {'gradient': grad(m['maxGradient'])}
    if st == 2:
        return {'colors': [col(m['minColor']), col(m['maxColor'])]}
    if st == 3:
        return {'gradients': [grad(m['minGradient']), grad(m['maxGradient'])]}
    return {'random': grad(m['maxGradient'])}


def v3(v):
    return [round(v['x'], 4), round(v['y'], 4), round(v['z'], 4)]


def quat_euler(q):
    # Unity：左手系，欧拉顺序 ZXY（度）
    x, y, z, w = q['x'], q['y'], q['z'], q['w']
    sx = 2 * (w * x - y * z)
    ex = math.degrees(math.asin(max(-1, min(1, sx))))
    ey = math.degrees(math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y)))
    ez = math.degrees(math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z)))
    return [round(ex, 2), round(ey, 2), round(ez, 2)]


SHAPES = {0: 'sphere', 1: 'sphereShell', 2: 'hemisphere', 3: 'hemisphereShell', 4: 'cone', 5: 'box', 6: 'mesh', 7: 'coneShell',
          8: 'coneVolume', 9: 'coneVolumeShell', 10: 'circle', 11: 'circleEdge', 12: 'singleSidedEdge', 13: 'meshRenderer',
          14: 'skinnedMeshRenderer', 15: 'boxShell', 16: 'boxEdge', 17: 'donut', 18: 'rectangle', 19: 'sprite', 20: 'spriteRenderer'}
RENDER = {0: 'billboard', 1: 'stretched', 2: 'horizontal', 3: 'vertical', 4: 'mesh', 5: 'none'}
ALIGN = {0: 'view', 1: 'world', 2: 'local', 3: 'facing', 4: 'velocity'}


def ps_summary(ps, rend):
    I = ps['InitialModule']
    o = {
        'duration': ps.get('lengthInSec'), 'looping': ps.get('looping'), 'delay': mmc(ps.get('startDelay')),
        'space': {0: 'local', 1: 'world', 2: 'custom'}.get(ps.get('moveWithTransform'), ps.get('moveWithTransform')),
        'scaling': {0: 'hierarchy', 1: 'local', 2: 'shape'}.get(ps.get('scalingMode'), ps.get('scalingMode')),
        'lifetime': mmc(I['startLifetime']), 'speed': mmc(I['startSpeed']), 'color': mmg(I['startColor']),
        'size': mmc(I['startSize']), 'max': I.get('maxNumParticles'), 'gravity': mmc(I.get('gravityModifier')),
    }
    if I.get('size3D'):
        o['size3D'] = [mmc(I['startSize']), mmc(I['startSizeY']), mmc(I['startSizeZ'])]
    rot = [mmc(I.get('startRotationX')), mmc(I.get('startRotationY')), mmc(I['startRotation'])]
    if I.get('rotation3D'):
        o['rotation3D'] = rot
    else:
        o['rotation'] = rot[2]
    if I.get('randomizeRotationDirection'):
        o['flipRotation'] = I['randomizeRotationDirection']
    E = ps.get('EmissionModule', {})
    if E.get('enabled'):
        e = {'rate': mmc(E.get('rateOverTime')), 'perMeter': mmc(E.get('rateOverDistance'))}
        bs = []
        for b in E.get('m_Bursts') or []:
            bs.append({'t': b.get('time'), 'count': mmc(b.get('countCurve')) if 'countCurve' in b else [b.get('minCount'), b.get('maxCount')],
                       'cycles': b.get('cycleCount'), 'every': b.get('repeatInterval'), 'p': b.get('probability', 1)})
        if bs:
            e['bursts'] = bs
        o['emission'] = e
    S = ps.get('ShapeModule', {})
    if S.get('enabled'):
        s = {'type': SHAPES.get(S.get('type'), S.get('type')), 'radius': mmc(S['radius']) if isinstance(S.get('radius'), dict) and 'value' not in S['radius'] else S.get('radius'),
             'angle': S.get('angle'), 'arc': S.get('arc'), 'thickness': S.get('radiusThickness'), 'pos': v3(S['m_Position']) if 'm_Position' in S else None,
             'rot': v3(S['m_Rotation']) if 'm_Rotation' in S else None, 'scale': v3(S['m_Scale']) if 'm_Scale' in S else None,
             'length': S.get('length'), 'boxThickness': v3(S['boxThickness']) if 'boxThickness' in S else None,
             'alignToDirection': S.get('alignToDirection'), 'randomDirection': S.get('randomDirectionAmount'), 'spherize': S.get('sphericalDirectionAmount')}
        if isinstance(S.get('radius'), dict) and 'value' in S['radius']:
            s['radius'] = S['radius']['value']
            s['radiusMode'] = S['radius'].get('mode')
        if isinstance(S.get('arc'), dict):
            s['arc'] = S['arc'].get('value')
            s['arcMode'] = S['arc'].get('mode')
            s['arcSpeed'] = mmc(S['arc'].get('speed'))
        if S.get('type') in (6, 13, 14):
            s['mesh'] = guid_path(S.get('m_Mesh'))
        o['shape'] = {k: v for k, v in s.items() if v is not None}
    M = ps.get('SizeModule', {})
    if M.get('enabled'):
        o['sizeOverLife'] = mmc(M['curve']) if not M.get('separateAxes') else [mmc(M['x']), mmc(M['y']), mmc(M['z'])]
    M = ps.get('ColorModule', {})
    if M.get('enabled'):
        o['colorOverLife'] = mmg(M['gradient'])
    M = ps.get('RotationModule', {})
    if M.get('enabled'):
        o['rotOverLife'] = mmc(M['curve']) if not M.get('separateAxes') else [mmc(M['x']), mmc(M['y']), mmc(M['curve'])]
    M = ps.get('VelocityModule', {})
    if M.get('enabled'):
        o['velOverLife'] = {'xyz': [mmc(M['x']), mmc(M['y']), mmc(M['z'])], 'space': 'world' if M.get('inWorldSpace') else 'local'}
        for k in ('orbitalX', 'orbitalY', 'orbitalZ', 'radial', 'speedModifier'):
            if k in M:
                o['velOverLife'][k] = mmc(M[k])
    M = ps.get('ClampVelocityModule', {})
    if M.get('enabled'):
        o['limitVel'] = {'speed': mmc(M.get('magnitude')), 'dampen': M.get('dampen'), 'drag': mmc(M.get('drag'))}
    M = ps.get('ForceModule', {})
    if M.get('enabled'):
        o['force'] = {'xyz': [mmc(M['x']), mmc(M['y']), mmc(M['z'])], 'space': 'world' if M.get('inWorldSpace') else 'local'}
    M = ps.get('UVModule', {})
    if M.get('enabled'):
        o['sheet'] = {'tiles': [M.get('tilesX'), M.get('tilesY')], 'type': {0: 'whole', 1: 'row'}.get(M.get('animationType'), M.get('animationType')),
                      'frame': mmc(M.get('frameOverTime')), 'start': mmc(M.get('startFrame')), 'cycles': M.get('cycles'), 'row': M.get('rowIndex'),
                      'randomRow': M.get('randomRow')}
    M = ps.get('NoiseModule', {})
    if M.get('enabled'):
        o['noise'] = {'strength': mmc(M.get('strength')), 'freq': M.get('frequency'), 'scroll': mmc(M.get('scrollSpeed')), 'damping': M.get('damping')}
    M = ps.get('CustomDataModule', {})
    if M.get('enabled'):
        cd = {}
        for n in (0, 1):
            mode = M.get('mode%d' % n)
            if mode == 1:
                cd['data%d' % n] = [mmc(M.get('vector%d_%d' % (n, j))) for j in range(M.get('vectorComponentCount%d' % n, 4))]
            elif mode == 2:
                cd['data%d' % n] = mmg(M.get('color%d' % n))
        o['custom'] = cd
    M = ps.get('TrailModule', {})
    if M.get('enabled'):
        o['trail'] = {'ratio': M.get('ratio'), 'lifetime': mmc(M.get('lifetime')), 'width': mmc(M.get('widthOverTrail')), 'color': mmg(M.get('colorOverTrail'))}
    M = ps.get('SubModule', {})
    if M.get('enabled'):
        o['sub'] = [{'type': s.get('type'), 'emitter': (s.get('emitter') or {}).get('fileID')} for s in M.get('subEmitters') or []]
    M = ps.get('CollisionModule', {})
    if M.get('enabled'):
        o['collision'] = True
    if rend:
        r = {'mode': RENDER.get(rend.get('m_RenderMode'), rend.get('m_RenderMode')), 'align': ALIGN.get(rend.get('m_RenderAlignment'), rend.get('m_RenderAlignment')),
             'materials': [guid_path(m) for m in rend.get('m_Materials') or []], 'enabled': rend.get('m_Enabled')}
        if rend.get('m_RenderMode') == 4:
            r['mesh'] = guid_path(rend.get('m_Mesh'))
        if rend.get('m_RenderMode') == 1:
            r['lengthScale'], r['velocityScale'], r['cameraScale'] = rend.get('m_LengthScale'), rend.get('m_VelocityScale'), rend.get('m_CameraVelocityScale')
        if rend.get('m_SortingFudge'):
            r['sortFudge'] = rend['m_SortingFudge']
        if rend.get('m_Pivot') and any(abs(v) > 1e-6 for v in rend['m_Pivot'].values()):
            r['pivot'] = v3(rend['m_Pivot'])
        if 'm_Flip' in rend and any(abs(v) > 1e-6 for v in rend['m_Flip'].values()):
            r['flip'] = v3(rend['m_Flip'])
        r['minSize'], r['maxSize'] = rend.get('m_MinParticleSize'), rend.get('m_MaxParticleSize')
        if rend.get('m_UseCustomVertexStreams'):
            r['streams'] = rend.get('m_VertexStreams')
        o['renderer'] = r
    return o


# Unity 内置着色器（guid 0000000000000000f000000000000000）按 fileID 的名字——只列本包用到的
BUILTIN = {46: 'Standard', 200: 'Legacy Particles/Additive', 202: 'Legacy Particles/Alpha Blended Premultiply', 203: 'Legacy Particles/Alpha Blended', 10720: 'Mobile/Particles/Additive',
           10721: 'Mobile/Particles/Alpha Blended', 10722: 'Mobile/Particles/VertexLit Blended'}
NUM = r'[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?'


def material(path):
    txt = open(os.path.join(ROOT, path), encoding='utf-8').read()
    objs = load(os.path.join(ROOT, path))
    (cls, kind, m), = [v for v in objs.values() if v[1] == 'Material']
    props = m.get('m_SavedProperties', {})
    tex, floats, colors = {}, {}, {}
    if isinstance(props.get('m_TexEnvs'), list):
        for t in props.get('m_TexEnvs') or []:
            (name, v), = t.items()
            p = guid_path(v.get('m_Texture'))
            if p:
                tex[name] = {'tex': p, 'scale': [v['m_Scale']['x'], v['m_Scale']['y']], 'offset': [v['m_Offset']['x'], v['m_Offset']['y']]}
        for f in props.get('m_Floats') or []:
            (name, v), = f.items()
            floats[name] = v
        for c in props.get('m_Colors') or []:
            (name, v), = c.items()
            colors[name] = col(v)
    else:
        # 老格式（Unity 5 以前）：重复的 "data:" 键，YAML 解析会丢，直接用正则读
        for g in re.finditer(r'name: (\S+)\s+second:\s+m_Texture: \{fileID: \d+(?:, guid: (\w+))?[^}]*\}\s+m_Scale: \{x: (%s), y: (%s)\}\s+m_Offset: \{x: (%s), y: (%s)\}' % (NUM, NUM, NUM, NUM), txt):
            p = guid_path({'guid': g.group(2)}) if g.group(2) else None
            if p:
                tex[g.group(1)] = {'tex': p, 'scale': [float(g.group(3)), float(g.group(4))], 'offset': [float(g.group(5)), float(g.group(6))]}
        for g in re.finditer(r'name: (\S+)\s+second: (%s)\s*$' % NUM, txt, flags=re.M):
            floats[g.group(1)] = float(g.group(2))
        for g in re.finditer(r'name: (\S+)\s+second: \{r: (%s), g: (%s), b: (%s), a: (%s)\}' % (NUM, NUM, NUM, NUM), txt):
            colors[g.group(1)] = [round(float(g.group(i)), 3) for i in range(2, 6)]
    shader = m.get('m_Shader') or {}
    if shader.get('guid') and shader.get('guid') != '0000000000000000f000000000000000':
        sh = guid_path(shader)
    else:
        sh = 'builtin:%s %s' % (shader.get('fileID'), BUILTIN.get(shader.get('fileID'), '?'))
    return {'shader': sh, 'keywords': m.get('m_ShaderKeywords'), 'queue': m.get('m_CustomRenderQueue'), 'tex': tex, 'floats': floats, 'colors': colors}


def prefab(path):
    objs = load(path)
    by_go = {}
    for fid, (cls, kind, b) in objs.items():
        go = (b.get('m_GameObject') or {}).get('fileID')
        if go:
            by_go.setdefault(go, {})[kind] = (fid, b)
    tf_of = {}
    for go, comps in by_go.items():
        if 'Transform' in comps:
            tf_of[comps['Transform'][0]] = go
    out = []

    def walk(tf_id, depth, path_names):
        cls, kind, t = objs[tf_id]
        go = t['m_GameObject']['fileID']
        gname = str(objs[go][2].get('m_Name'))
        comps = by_go.get(go, {})
        node = {'name': gname, 'path': '/'.join(path_names + [gname]), 'active': objs[go][2].get('m_IsActive'),
                'pos': v3(t['m_LocalPosition']), 'rot': quat_euler(t['m_LocalRotation']), 'quat': [round(t['m_LocalRotation'][k], 5) for k in 'xyzw'],
                'scale': v3(t['m_LocalScale'])}
        if 'ParticleSystem' in comps:
            node['ps'] = ps_summary(comps['ParticleSystem'][1], comps.get('ParticleSystemRenderer', (0, None))[1])
        if 'MeshFilter' in comps:
            node['meshFilter'] = guid_path(comps['MeshFilter'][1].get('m_Mesh'))
        if 'MeshRenderer' in comps:
            node['meshRenderer'] = [guid_path(m) for m in comps['MeshRenderer'][1].get('m_Materials') or []]
        if 'Animator' in comps:
            node['animator'] = guid_path(comps['Animator'][1].get('m_Controller'))
        out.append(node)
        for ch in t.get('m_Children') or []:
            walk(ch['fileID'], depth + 1, path_names + [gname])

    roots = [fid for fid, (cls, kind, b) in objs.items() if kind == 'Transform' and not (b.get('m_Father') or {}).get('fileID')]
    for r in roots:
        walk(r, 0, [])
    return out


result = {'prefabs': {}, 'materials': {}}
pdir = os.path.join(ROOT, 'FX_Ink slash', 'Prefab')
for f in sorted(os.listdir(pdir)):
    if not f.endswith('.prefab') or (ONLY and os.path.splitext(f)[0] not in ONLY):
        continue
    print('parsing', f, flush=True)
    nodes = prefab(os.path.join(pdir, f))
    result['prefabs'][f] = nodes
    for n in nodes:
        mats = (n.get('ps', {}).get('renderer', {}).get('materials') or []) + (n.get('meshRenderer') or [])
        for m in mats:
            if m and not m.startswith('builtin') and m not in result['materials']:
                result['materials'][m] = material(m)
json.dump(result, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('WROTE', OUT)
