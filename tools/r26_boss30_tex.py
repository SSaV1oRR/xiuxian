# 第二十六轮：烬狱剑尊的笔刷贴图换回原素材的分辨率。
# 第二十四轮导出时（tools/r24_export_boss30.py）把笔刷贴图一律缩到 512 像素以内；剑尊放大到 2 倍多之后，画面上的笔触被拉糊。
# 这里不重跑绑定 / 导出流程：直接在转换好的 boss30.glb 里把五张笔刷贴图（粗毛刷、胶带、墨、油画、纸）换成原素材里的 1024 像素版本——
#   原素材是灰度 + 透明（LA）：不透明处一律纯白（颜色来自顶点色），只有透明度有用；新图的灰度通道全部写成 255（透明处也是白，
#   放大缩小时笔触边缘不会滤进黑边），透明度照原图。导出前已核对：原图缩到 512 后与现有的透明度一致（只是分辨率不同）。
# 其余数据（网格、骨架、动作，EXT_meshopt_compression 压缩流）原样保留，只整体后移：缓冲区 0 前面是贴图、后面是压缩流，
#   压缩流的 byteOffset（扩展里）按贴图区的增量平移（增量取 16 的倍数，原有的对齐不变）。
# 用法：python -I tools/r26_boss30_tex.py <转换好的 boss30.glb> <原素材 glb> <输出 glb>
import io, json, struct, sys
from PIL import Image

WANT = ['Coarse_BristlesLambert', 'Duct_TapeLambert', 'InkLambert', 'Oil_PaintLambert', 'PaperLambert']


def read_glb(p):
    b = open(p, 'rb').read()
    assert b[:4] == b'glTF', p
    n = struct.unpack('<I', b[12:16])[0]
    js = json.loads(b[20:20 + n])
    off = 20 + n
    bn = struct.unpack('<I', b[off:off + 4])[0]
    assert b[off + 4:off + 8] == b'BIN\x00'
    return js, bytearray(b[off + 8:off + 8 + bn])


def base_images(js):
    tex2img = {i: t.get('source') for i, t in enumerate(js['textures'])}
    out = {}
    for m in js['materials']:
        pb = m.get('pbrMetallicRoughness', {})
        if 'baseColorTexture' in pb:
            out[m['name']] = tex2img[pb['baseColorTexture']['index']]
    return out


def img_bytes(js, bin_, i):
    bv = js['bufferViews'][js['images'][i]['bufferView']]
    o = bv.get('byteOffset', 0)
    return bytes(bin_[o:o + bv['byteLength']])


def main(conv, src, dst):
    cj, cb = read_glb(conv)
    sj, sb = read_glb(src)
    cm, sm = base_images(cj), base_images(sj)
    new = {}
    for name in WANT:
        s = Image.open(io.BytesIO(img_bytes(sj, sb, sm[name]))).convert('LA')
        a = s.getchannel('A')
        old = Image.open(io.BytesIO(img_bytes(cj, cb, cm[name])))
        out = Image.merge('LA', (Image.new('L', a.size, 255), a))
        buf = io.BytesIO(); out.save(buf, 'PNG', optimize=True)
        new[cm[name]] = buf.getvalue()
        print(f'{name:24s} {old.size} → {out.size}  {len(img_bytes(cj, cb, cm[name])) // 1024} KB → {len(new[cm[name]]) // 1024} KB')
    # 缓冲区 0：贴图区（各图的 bufferView）在前，压缩流在后
    bvs = cj['bufferViews']
    img_bv = sorted({im['bufferView'] for im in cj['images']}, key=lambda k: bvs[k].get('byteOffset', 0))
    for k, bv in enumerate(bvs):
        if bv.get('buffer') == 0 and k not in img_bv:
            raise SystemExit('缓冲区 0 里还有非贴图的 bufferView：%d' % k)
    old_end = max(bvs[k].get('byteOffset', 0) + bvs[k]['byteLength'] for k in img_bv)
    refs = [bv['extensions']['EXT_meshopt_compression'] for bv in bvs if 'EXT_meshopt_compression' in bv.get('extensions', {})]
    first = min(r['byteOffset'] for r in refs if r['buffer'] == 0)
    assert first >= old_end, (first, old_end)
    data = bytearray()
    bv2img = {im['bufferView']: i for i, im in enumerate(cj['images'])}
    for k in img_bv:
        i = bv2img[k]
        blob = new.get(i) or img_bytes(cj, cb, i)
        while len(data) % 4: data.append(0)
        bvs[k]['byteOffset'] = len(data); bvs[k]['byteLength'] = len(blob)
        data += blob
    delta = len(data) - first
    pad = (-delta) % 16
    data += bytes(pad); delta += pad
    data += cb[first:]
    for r in refs:
        if r['buffer'] == 0: r['byteOffset'] += delta
    cj['buffers'][0]['byteLength'] = len(data)
    cj.setdefault('asset', {})['extras'] = {**cj['asset'].get('extras', {}), 'r26': 'brush textures restored to source resolution (tools/r26_boss30_tex.py)'}
    js = json.dumps(cj, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    js += b' ' * ((-len(js)) % 4)
    while len(data) % 4: data.append(0)
    total = 12 + 8 + len(js) + 8 + len(data)
    with open(dst, 'wb') as f:
        f.write(b'glTF' + struct.pack('<II', 2, total))
        f.write(struct.pack('<I', len(js)) + b'JSON' + js)
        f.write(struct.pack('<I', len(data)) + b'BIN\x00' + data)
    print('写出', dst, total // 1024, 'KB（原', (12 + 8 + len(json.dumps(read_glb(conv)[0])) + len(cb)) // 1024, 'KB）；压缩流平移', delta, '字节')


if __name__ == '__main__':
    main(*sys.argv[1:4])
