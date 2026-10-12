# 第二十五轮：墨迹特效目录清单（只列文件与大小，不做深度解析；PNG 只读 24 字节文件头取像素尺寸）→ fx.json
#   只读：assets/special effects/FX_Ink_slash、assets/special effects/ink、assets/converted/fx/ink、assets/converted/fx/ink2
# 用法：python -I tools/r25_inventory_fx.py <assets 目录> <输出 json>
import os, sys, json, struct

ASSETS, OUT = sys.argv[1], sys.argv[2]
FOLDERS = ['special effects/FX_Ink_slash', 'special effects/ink', 'converted/fx/ink', 'converted/fx/ink2']
IMAGE_EXT = {'png', 'jpg', 'jpeg', 'tga', 'dds', 'psd', 'exr', 'hdr', 'bmp', 'gif', 'webp', 'tif', 'tiff', 'ktx', 'ktx2', 'basis', 'tex'}


def ext_of(name):
    base = os.path.basename(name)
    return base.rsplit('.', 1)[1].lower() if '.' in base[1:] else '(none)'


def png_size(path):
    with open(path, 'rb') as f:
        h = f.read(24)
    if h[:8] == b'\x89PNG\r\n\x1a\n' and h[12:16] == b'IHDR':
        return list(struct.unpack('>II', h[16:24]))
    return None


out = {'note': 'file listing only (sizes in bytes); PNG pixel sizes come from the 24-byte PNG header', 'folders': {}}
for rel in FOLDERS:
    root = os.path.join(ASSETS, rel)
    rec = {'path': 'assets/' + rel, 'exists': os.path.isdir(root)}
    if not rec['exists']:
        out['folders'][rel] = rec
        continue
    files = []
    for dp, dn, fn in os.walk(root):
        dn.sort()
        for f in sorted(fn):
            p = os.path.join(dp, f)
            e = {'path': os.path.relpath(p, root).replace('\\', '/'), 'bytes': os.path.getsize(p), 'ext': ext_of(f)}
            if e['ext'] == 'png':
                e['px'] = png_size(p)
            files.append(e)
    by_ext, img_ext = {}, {}
    for e in files:
        b = by_ext.setdefault(e['ext'], [0, 0]); b[0] += 1; b[1] += e['bytes']
        if e['ext'] in IMAGE_EXT:
            i = img_ext.setdefault(e['ext'], [0, 0]); i[0] += 1; i[1] += e['bytes']
    top = []
    for name in sorted(os.listdir(root)):
        p = os.path.join(root, name)
        if os.path.isdir(p):
            sub = [e for e in files if e['path'].startswith(name + '/')]
            top.append({'name': name + '/', 'files': len(sub), 'bytes': sum(e['bytes'] for e in sub),
                        'images': sum(1 for e in sub if e['ext'] in IMAGE_EXT),
                        'subdirs': sorted({e['path'].split('/')[1] + '/' for e in sub if e['path'].count('/') >= 2})})
        else:
            top.append({'name': name, 'bytes': os.path.getsize(p)})
    ndirs = sum(len(dn) for _, dn, _ in os.walk(root))
    rec.update({'files': len(files), 'dirs': ndirs, 'bytes': sum(e['bytes'] for e in files),
                'byExtension': {k: {'files': v[0], 'bytes': v[1]} for k, v in sorted(by_ext.items(), key=lambda kv: -kv[1][0])},
                'imagesByExtension': {k: {'files': v[0], 'bytes': v[1]} for k, v in sorted(img_ext.items(), key=lambda kv: -kv[1][0])},
                'imageFiles': sum(v[0] for v in img_ext.values()), 'topLevel': top, 'allFiles': files})
    out['folders'][rel] = rec
    print(rel, rec['files'], 'files', rec['dirs'], 'dirs', rec['bytes'], 'bytes; images', rec['imagesByExtension'])
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('WROTE', OUT)
