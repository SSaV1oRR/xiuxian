# 第二十三轮：第二组水墨素材（assets/special effects/ink，项目作者提供，只读）→ 贴图集 assets/converted/fx/ink2/ink2.png + ink2.json。
# 素材实际是《只狼：影逝二度》（FromSoftware，内部代号 NTC）的一个水墨风格模组的四个封包，都是 DCX（DFLT，即 zlib 压缩）：
#   mods/sfx/sfxbnd_commoneffects.ffxbnd.dcx  BND4 特效包（211 MB 解压后）：1860 个 FXR（特效定义）、375 个 TPF（贴图，各含一张 DDS：BC1 / BC3 / BC4 / BC7）、112 个 FLVER（模型）、3 个 anibnd；
#   mods/menu/hi|low/01_common.tpf.dcx          界面贴图（48 张 BC7：菜单墨刷底、图标、按键、字效……hi 与 low 是同一套的两种分辨率）；
#   mods/chr/c0000.anibnd.dcx                    主角的动作事件（65 个 TAE、一个骨架 hkx、43 个内部说明 txt）——没有可直接用的画面素材。
# 包里没有模型或完整特效可以直接搬：FXR 是游戏引擎的粒子图，网页里没有对应的运行时。这里只取贴图（形状用 alpha 通道；运行时按水墨色板着色）：
#   特效包：s26041 干笔飞白（两条带溅点的横刷）、s16001 甩墨细丝（4×4）、s11630 墨团由聚到散（8×7 序列帧）、s11640 浓墨团（8×5 序列帧）、
#           s11621 墨雾（8×5 序列帧）、s04116 笔锋（8×8，一笔弧形的各个角度）、s11436 晕墨四团（2×2）、s04013 墨痕（4×2）、s19001 细笔（4×1）；
#   界面包（low）：MENU_BG_KeyGuide1 / 2 宽墨刷（2048×256，毛边与溅点）、SB_Operating 由浓到淡收尾的长笔触与笔刷圆环、SB_Dialog 一条细长的收锋笔线。
#   （s04123、s04100、s04092 看起来像墨，逐张看过实际是枫叶、纸片与蜈蚣，不用。）
# 用法：python -I tools/r23_extract_ink.py "<assets/special effects/ink>" <输出目录（assets/converted/fx/ink2）>
import sys, os, io, json, struct, zlib
from PIL import Image
import numpy as np


def dcx(data):
    assert data[:4] == b'DCX\0'
    usize, csize = struct.unpack('>II', data[0x1C:0x24])
    assert data[0x28:0x2C] == b'DFLT'
    off = struct.unpack('>I', data[0x14:0x18])[0]
    raw = zlib.decompress(data[off:off + csize])
    assert len(raw) == usize
    return raw


def rev8(b):
    return int('{:08b}'.format(b)[::-1], 2)


def bnd4(raw):
    assert raw[:4] == b'BND4'
    big, bitbig = raw[9] == 1, raw[0xA] == 1
    E = '>' if big else '<'
    count = struct.unpack(E + 'i', raw[0xC:0x10])[0]
    hsize = struct.unpack(E + 'q', raw[0x10:0x18])[0]
    fhs = struct.unpack(E + 'q', raw[0x20:0x28])[0]
    unicode_, fmt = raw[0x30], raw[0x31]
    if bitbig:
        fmt = rev8(fmt)          # 位序反着存（0x74 实为 0x2E：IDs | Names1 | Names2 | Compression）
    files, p = {}, hsize
    for _ in range(count):
        h = raw[p:p + fhs]; q = 8
        cs = struct.unpack(E + 'q', h[q:q + 8])[0]; q += 8
        if fmt & 0x20: q += 8
        if fmt & 0x10: do = struct.unpack(E + 'q', h[q:q + 8])[0]; q += 8
        else: do = struct.unpack(E + 'I', h[q:q + 4])[0]; q += 4
        if fmt & 0x02: q += 4
        no = struct.unpack(E + 'I', h[q:q + 4])[0]
        e = no
        if unicode_:
            while raw[e:e + 2] != b'\0\0': e += 2
            name = raw[no:e].decode('utf-16-le')
        else:
            e = raw.index(b'\0', no); name = raw[no:e].decode('shift_jis', 'replace')
        files[name.split('\\')[-1]] = raw[do:do + cs]
        p += fhs
    return files


def tpf(raw):
    assert raw[:4] == b'TPF\0'
    count = struct.unpack('<i', raw[8:12])[0]
    enc = raw[14]
    out, p = {}, 16
    for _ in range(count):
        fo, fs = struct.unpack('<Ii', raw[p:p + 8])
        no = struct.unpack('<I', raw[p + 12:p + 16])[0]
        p += 20
        e = no
        if enc == 1:
            while raw[e:e + 2] != b'\0\0': e += 2
            name = raw[no:e].decode('utf-16-le')
        else:
            e = raw.index(b'\0', no); name = raw[no:e].decode('shift_jis', 'replace')
        out[name] = raw[fo:fo + fs]
    return out


def dds(d):
    d = bytearray(d)
    if d[84:88] == b'DX10':
        fx = int.from_bytes(d[128:132], 'little')
        if fx in (72, 78, 99): d[128:132] = (fx - 1).to_bytes(4, 'little')      # sRGB 变体：块排列相同，PIL 只认非 sRGB 的编号
    im = Image.open(io.BytesIO(bytes(d))); im.load()
    return im.convert('RGBA')


def alpha(im):
    return np.asarray(im)[..., 3].astype(np.float32) / 255.0


def tight(a, pad=2, thr=0.02):
    ys, xs = np.where(a > thr)
    y0, y1, x0, x1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + pad + 1), max(0, xs.min() - pad), min(a.shape[1], xs.max() + pad + 1)
    return a[y0:y1, x0:x1], [int(x0), int(y0), int(x1 - x0), int(y1 - y0)]


if __name__ == '__main__':
    SRC, OUT = sys.argv[1], sys.argv[2]
    os.makedirs(OUT, exist_ok=True)
    fx = bnd4(dcx(open(os.path.join(SRC, 'mods', 'sfx', 'sfxbnd_commoneffects.ffxbnd.dcx'), 'rb').read()))
    menu = tpf(dcx(open(os.path.join(SRC, 'mods', 'menu', 'low', '01_common.tpf.dcx'), 'rb').read()))
    def fxtex(n):
        t = tpf(fx[n + '.tpf'])
        return dds(t[n])
    W, H = 2048, 1792
    atlas = np.zeros((H, W), np.float32)
    meta = {'source': 'assets/special effects/ink/mods（《只狼》水墨模组的 DCX 封包；tools/r23_extract_ink.py 解出 alpha 通道）', 'size': [W, H], 'strips': {}, 'sprites': {}}

    def put(a, x, y, w=None, h=None):
        if w and h and (a.shape[1] != w or a.shape[0] != h):
            a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)).astype(np.float32) / 255.0
        hh, ww = a.shape
        atlas[y:y + hh, x:x + ww] = np.maximum(atlas[y:y + hh, x:x + ww], a)
        return [x, y, ww, hh]

    # ---------- 长条（沿笔触方向铺：u 顺着笔势，v 横跨笔宽）----------
    kg1 = alpha(dds(menu['MENU_BG_KeyGuide1'])); kg2 = alpha(dds(menu['MENU_BG_KeyGuide2']))
    meta['strips']['brush'] = {'rect': put(kg1, 0, 0), 'src': '界面包 MENU_BG_KeyGuide1（宽墨刷，毛边与溅点）'}
    meta['strips']['wash'] = {'rect': put(kg2, 0, 256), 'src': '界面包 MENU_BG_KeyGuide2（淡墨刷，下沿浓）'}
    dry = alpha(fxtex('s26041'))
    meta['strips']['dry0'] = {'rect': put(dry[6:240], 0, 512), 'src': '特效包 s26041 上半（干笔飞白）'}
    meta['strips']['dry1'] = {'rect': put(dry[262:496], 512, 512), 'src': '特效包 s26041 下半（干笔飞白）'}
    op = alpha(dds(menu['SB_Operating']))
    # 连通域逐块量过：SB_Operating 左上 (6, 0) 起 596×51 是一条由浓到淡收尾的长笔触，(418, 58) 起 160×160 是笔刷圆环；
    # SB_Dialog 左上 (0, 0) 起 1629×74 是一条细长的收锋笔线
    meta['strips']['taper'] = {'rect': put(op[0:51, 6:602], 1024, 512, 1000, 64), 'src': '界面包 SB_Operating (6, 0, 596×51)（由浓到淡收尾的长笔触）'}
    dl = alpha(dds(menu['SB_Dialog']))
    meta['strips']['line'] = {'rect': put(dl[0:74, 0:1629], 1024, 584, 1000, 46), 'src': '界面包 SB_Dialog (0, 0, 1629×74)（细长的收锋笔线）'}
    meta['sprites']['ring'] = {'rect': put(op[58:218, 418:578], 1024, 640, 128, 128), 'grid': [1, 1], 'src': '界面包 SB_Operating (418, 58, 160×160)（笔刷圆环）'}

    # ---------- 序列帧 / 一组小图（格子：列 × 行）----------
    def sheet(name, n, x, y, w, h, grid, note):
        a = alpha(fxtex(n))
        meta['sprites'][name] = {'rect': put(a, x, y, w, h), 'grid': grid, 'src': f'特效包 {n}（{note}）'}
    sheet('flick', 's04116', 0, 768, 512, 512, [8, 8], '笔锋：一笔弧形，各格转过不同角度')
    sheet('burst', 's11630', 512, 768, 512, 512, [8, 7], '墨团由聚到散，56 帧')
    sheet('tendril', 's16001', 1024, 768, 512, 512, [4, 4], '甩墨细丝')
    sheet('wisp', 's11621', 1536, 768, 512, 256, [8, 5], '墨雾，40 帧')
    sheet('blot', 's11436', 1536, 1024, 256, 256, [2, 2], '晕墨四团')
    sheet('daub', 's04013', 1792, 1024, 256, 128, [4, 2], '墨痕')
    sheet('fine', 's19001', 1792, 1152, 256, 64, [4, 1], '细笔')
    sheet('burstD', 's11640', 0, 1280, 1024, 512, [8, 5], '浓墨团，40 帧')

    img = Image.fromarray(np.clip(atlas * 255 + 0.5, 0, 255).astype(np.uint8), 'L')
    img.save(os.path.join(OUT, 'ink2.png'), optimize=True)
    json.dump(meta, open(os.path.join(OUT, 'ink2.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('INK2', os.path.getsize(os.path.join(OUT, 'ink2.png')), json.dumps({k: v['rect'] for k, v in {**meta['strips'], **meta['sprites']}.items()}))
