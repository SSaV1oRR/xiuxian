# 生成网页用的藏经阁塔模型（原始素材 chinese_tower/ 保持不动）：
#   1. 重写二进制 FBX，清空 Video 节点内嵌的贴图数据（75MB → 约 1MB），让加载器改用外部贴图；
#   2. 贴图降采样到最长边 1024：漫反射存 JPG（含有效透明通道的存 PNG），TGA 法线贴图转 PNG；
#   3. 输出 manifest.json：FBX 内引用的文件名 → 优化后的文件名。
# 用法（在项目根目录）：python tools/optimize_tower.py
import json
import os
import struct
import sys

from PIL import Image

SRC = os.path.join('chinese_tower', 'Chinese Tower')
DST = os.path.join('assets', 'chinese_tower')
FBX_IN = os.path.join(SRC, 'Chinese Tower.fbx')
FBX_OUT = os.path.join(DST, 'tower.fbx')
MAX = 1024


def parse(data, off, end_limit, big):
    hl = 24 if big else 12
    nodes = []
    while off < end_limit:
        if big:
            end, nprops, plen = struct.unpack_from('<QQQ', data, off)
        else:
            end, nprops, plen = struct.unpack_from('<III', data, off)
        if end == 0:                      # 空记录：本层结束
            return nodes, off + hl + 1
        nlen = data[off + hl]
        name = bytes(data[off + hl + 1: off + hl + 1 + nlen])
        p0 = off + hl + 1 + nlen
        props = bytes(data[p0: p0 + plen])
        c0 = p0 + plen
        children, has_null = [], False
        if c0 < end:
            children, _ = parse(data, c0, end, big)
            has_null = True
        nodes.append({'name': name, 'nprops': nprops, 'props': props, 'children': children, 'has_null': has_null})
        off = end
    return nodes, off


def serialize(nodes, big, base):
    hl = 24 if big else 12
    out = bytearray()
    for n in nodes:
        start = base + len(out)
        head = hl + 1 + len(n['name'])
        body = bytearray(n['props'])
        if n['children'] or n['has_null']:
            body += serialize(n['children'], big, start + head + len(n['props']))
            body += b'\x00' * (hl + 1)
        end = start + head + len(body)
        hdr = struct.pack('<QQQ', end, n['nprops'], len(n['props'])) if big else struct.pack('<III', end, n['nprops'], len(n['props']))
        out += hdr + bytes([len(n['name'])]) + n['name'] + body
    return out


def strip_media(nodes, parent=b''):
    count = 0
    for n in nodes:
        if parent == b'Video' and n['name'] == b'Content' and n['props'][:1] == b'R':
            n['props'] = b'R' + struct.pack('<I', 0)
            n['nprops'] = 1
            count += 1
        count += strip_media(n['children'], n['name'])
    return count


def optimize_fbx():
    data = open(FBX_IN, 'rb').read()
    version = struct.unpack_from('<I', data, 23)[0]
    big = version >= 7500
    nodes, after = parse(data, 27, len(data), big)
    stripped = strip_media(nodes)
    body = serialize(nodes, big, 27)
    out = bytearray(data[:27]) + body + b'\x00' * ((24 if big else 12) + 1)
    # 文件尾：footer id + 16 字节对齐填充 + 版本号 + 120 个 0 + 魔数
    footer_id = data[after: after + 16]
    tail = data[-(4 + 120 + 16):]
    out += footer_id
    out += b'\x00' * ((16 - len(out) % 16) % 16 or 16)
    out += tail
    open(FBX_OUT, 'wb').write(out)
    print(f'FBX v{version}: {len(data) / 1e6:.1f} MB -> {len(out) / 1e6:.2f} MB, stripped {stripped} embedded images')


def optimize_textures():
    manifest = {}
    for fn in sorted(os.listdir(SRC)):
        base, ext = os.path.splitext(fn)
        ext = ext.lower()
        if ext not in ('.png', '.tga', '.jpg', '.jpeg'):
            continue
        im = Image.open(os.path.join(SRC, fn))
        im.load()
        w, h = im.size
        k = min(1.0, MAX / max(w, h))
        if k < 1:
            im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
        normal = base.upper().endswith('N') and ext == '.tga'
        has_alpha = im.mode in ('RGBA', 'LA') and im.getchannel('A').getextrema()[0] < 250
        if normal or has_alpha:
            out = base + '.png'
            (im if has_alpha else im.convert('RGB')).save(os.path.join(DST, out), optimize=True)
        else:
            out = base + '.jpg'
            im.convert('RGB').save(os.path.join(DST, out), quality=86, optimize=True, progressive=True)
        manifest[fn] = out
        print(f'{fn} {w}x{h} -> {out} {im.size[0]}x{im.size[1]} {os.path.getsize(os.path.join(DST, out)) // 1024} KB')
    json.dump(manifest, open(os.path.join(DST, 'manifest.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    if not os.path.exists(FBX_IN):
        sys.exit('找不到 ' + FBX_IN)
    os.makedirs(DST, exist_ok=True)
    optimize_fbx()
    optimize_textures()
