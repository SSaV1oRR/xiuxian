# 第二十八轮：录像配音里龙凤砸入与收刀清响的响度——听感（A 计权的短时响度）、采样峰值、各频段的能量（报告第五节的数字）。
# A 计权按人耳对各频率的灵敏度加权（100 赫兹约 −19 dB、50 赫兹约 −30 dB、1–4 千赫约 0），每 2048 点（约 46 毫秒）一段、半段步进，取段内最大。
# 用法：python -I tools/r28_audio_check.py [--off=秒] <mix.wav>…（16 位 WAV，tools/r19_mix_audio.py 混出的；--off 录像第 0 秒到演出 0 秒的偏移，默认 4.167 秒——
#   第二十七、二十八轮的录像；第二十九轮的录像各不相同，按录像记录里演出音乐进来的时刻 − 0.5 秒算）
import sys, os, wave
import numpy as np

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
OFF = 4.167
WIN = {'crash': (10.45, 10.95), 'noto': (13.13, 13.58)}                     # 砸入（凤、龙、第一次余震）；收刀清响（13.2）
BAND_WIN = (('phoenix', 10.45, 10.70), ('dragon', 10.69, 11.13), ('after', 10.83, 11.73), ('noto', 13.16, 13.53))
BANDS = ((20, 80), (80, 250), (250, 2000), (2000, 12000))


def aw(f):
    f2 = f * f
    ra = (12194.0 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * np.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194.0 ** 2) + 1e-30)
    return ra * 10 ** (2.0 / 20)


def a_levels(x, sr, N=2048):
    hop, win = N // 2, np.hanning(N)
    W = aw(np.fft.rfftfreq(N, 1 / sr)) ** 2
    out = []
    for i in range(0, len(x) - N, hop):
        S = np.fft.rfft(x[i:i + N] * win)
        out.append(((i + N / 2) / sr, 10 * np.log10(np.sum(np.abs(S) ** 2 * W) / (np.sum(win ** 2) * N / 2) + 1e-12)))
    return np.array(out)


def band(sr, x, t0, t1, lo, hi):
    s = x[int(t0 * sr):int(t1 * sr)]
    F = np.fft.rfft(s * np.hanning(len(s))); f = np.fft.rfftfreq(len(s), 1 / sr)
    return 10 * np.log10(np.sum(np.abs(F[(f >= lo) & (f < hi)]) ** 2) / len(s) ** 2 * 2 / 0.375 + 1e-12)


args = [a for a in sys.argv[1:] if not a.startswith('--off=')]
for a in sys.argv[1:]:
    if a.startswith('--off='): OFF = float(a[6:])
for p in args:
    w = wave.open(p, 'rb'); sr, n, ch = w.getframerate(), w.getnframes(), w.getnchannels()
    x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32).reshape(-1, ch) / 32768.0
    m = x.mean(axis=1)
    L = a_levels(m, sr)
    res = {}
    for k, (a, b) in WIN.items():
        s = L[(L[:, 0] >= a + OFF) & (L[:, 0] < b + OFF)]
        j = int(np.argmax(s[:, 1]))
        pk = 20 * np.log10(float(np.max(np.abs(x[int((a + OFF) * sr):int((b + OFF) * sr)]))) + 1e-9)
        res[k] = (s[j, 1], s[j, 0] - OFF, pk)
    c, q = res['crash'], res['noto']
    print(f'== {p}')
    print(f'  A 计权：砸入 {c[0]:6.1f} dB（演出 {c[1]:5.2f}）  收刀清响 {q[0]:6.1f} dB（{q[1]:5.2f}）  收刀比砸入响 {q[0] - c[0]:4.1f} dB')
    print(f'  采样峰值：砸入 {c[2]:6.2f} dBFS  收刀清响 {q[2]:6.2f} dBFS  差 {q[2] - c[2]:5.2f} dB')
    for tag, a, b in BAND_WIN:
        print(f'  {tag:8s}', '  '.join(f'{lo}–{hi} 赫兹 {band(sr, m, a + OFF, b + OFF, lo, hi):6.1f}' for lo, hi in BANDS))
