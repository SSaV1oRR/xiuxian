# 第二十七轮：看一眼 molizhongyan/sound effect 下各段录音——时长、声道、采样率、每 0.1 秒的响度（dBFS），用来挑选截取的段落。
# 用法：blender -b --factory-startup --python tools/r27_audio_scan.py -- <目录> [文件名 起 止 …]
import sys, os
import numpy as np
import aud

argv = sys.argv[sys.argv.index('--') + 1:]
D = argv[0]
rng = {}
for i in range(1, len(argv) - 2, 3):
    rng[argv[i]] = (float(argv[i + 1]), float(argv[i + 2]))
for f in sorted(os.listdir(D)):
    if not f.lower().endswith(('.mp3', '.wav', '.ogg')):
        continue
    s = aud.Sound(os.path.join(D, f))
    sr = s.specs[0]; ch = s.specs[1]
    a = np.asarray(s.data(), dtype=np.float32)
    mono = a.mean(axis=1) if a.ndim == 2 else a
    dur = len(mono) / sr
    hop = int(0.1 * sr)
    n = len(mono) // hop
    rms = [20 * np.log10(np.sqrt(np.mean(mono[k * hop:(k + 1) * hop] ** 2)) + 1e-9) for k in range(n)]
    peak = 20 * np.log10(np.max(np.abs(mono)) + 1e-9)
    print(f'FILE {f} sr={sr} ch={ch} dur={dur:.2f}s peak={peak:.1f}dB')
    a0, a1 = rng.get(f, (0, min(dur, 60)))
    k0, k1 = int(a0 * 10), min(n, int(a1 * 10))
    line = ' '.join(f'{max(-60, r):.0f}' for r in rms[k0:k1])
    print(f'  rms[{a0}-{a1}s per 0.1s]:', line)
