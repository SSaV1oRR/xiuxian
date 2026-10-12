# 第二十轮：解包 .unitypackage（不依赖 Unity）。
# .unitypackage 是 gzip 的 tar：每个资源一个以 GUID 命名的目录，里面有
#   pathname   （资源在 Unity 工程里的路径，如 "Assets/FX_Ink slash/Textures/ink_05.png"）
#   asset      （资源本体；文件夹没有）
#   asset.meta （Unity 的导入设置：贴图的环绕 / 过滤 / 精灵切分，模型的缩放等）
#   preview.png（Unity 生成的缩略图，可选）
# 本脚本只用 tarfile.extractfile 逐个读出再写盘，不用 extractall；pathname 必须在 "Assets/" 下、
# 不能含 ".." 或盘符，否则跳过——包里的路径不会写到目标目录以外。原 .unitypackage 不改动。
# 输出（<目标目录> 下）：
#   <路径去掉开头的 "Assets/">        资源与 .meta，按包内原有的目录结构摆放
#   _previews/<资源文件名>.png         缩略图（如 ink_05.mat.png）
#   _package_index.json                GUID → 路径、大小（解析预制体、材质里按 GUID 的引用时用）
# 用法：python -I tools/r20_unpack_unitypackage.py "<包.unitypackage>" "<目标目录>"
import json, os, sys, tarfile

src, dest = sys.argv[1], sys.argv[2]
dest = os.path.abspath(dest)


def safe(rel):
    rel = rel.replace('\\', '/').strip()
    if not rel.startswith('Assets/'):
        return None
    rel = rel[len('Assets/'):]
    parts = [p for p in rel.split('/') if p]
    if not parts or any(p in ('.', '..') or ':' in p for p in parts):
        return None
    out = os.path.abspath(os.path.join(dest, *parts))
    return out if out.startswith(dest + os.sep) else None


index, skipped, n = {}, [], 0
with tarfile.open(src, 'r:gz') as t:
    entries = {}
    for m in t.getmembers():
        if not m.isfile():
            continue
        parts = m.name.replace('\\', '/').split('/')
        parts = [p for p in parts if p and p != '.']
        if len(parts) != 2:
            continue
        entries.setdefault(parts[0], {})[parts[1]] = m
    for guid, e in sorted(entries.items()):
        if 'pathname' not in e:
            continue
        rel = t.extractfile(e['pathname']).read().decode('utf-8', 'replace').split('\n')[0].strip()
        out = safe(rel)
        if out is None:
            skipped.append(rel)
            continue
        info = {'path': os.path.relpath(out, dest).replace('\\', '/'), 'folder': 'asset' not in e}
        if 'asset' in e:
            os.makedirs(os.path.dirname(out), exist_ok=True)
            data = t.extractfile(e['asset']).read()
            with open(out, 'wb') as f:
                f.write(data)
            info['size'] = len(data)
            n += 1
        else:
            os.makedirs(out, exist_ok=True)
        if 'asset.meta' in e:
            with open(out + '.meta', 'wb') as f:
                f.write(t.extractfile(e['asset.meta']).read())
        if 'preview.png' in e:
            pd = os.path.join(dest, '_previews')
            os.makedirs(pd, exist_ok=True)
            name = os.path.basename(out) + '.png'
            with open(os.path.join(pd, name), 'wb') as f:
                f.write(t.extractfile(e['preview.png']).read())
            info['preview'] = '_previews/' + name
        index[guid] = info

with open(os.path.join(dest, '_package_index.json'), 'w', encoding='utf-8') as f:
    json.dump({'source': os.path.basename(src), 'assets': index}, f, ensure_ascii=False, indent=1)
print('WROTE', n, 'assets,', len(index), 'entries ->', dest)
for s in skipped:
    print('SKIPPED unsafe path:', s)
