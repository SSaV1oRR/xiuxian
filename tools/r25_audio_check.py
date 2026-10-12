# 第二十五轮：检查录像音轨里终式各段声音的响度（混好的 16 位 WAV）——按事件时刻取窗口，算峰值与 RMS（dBFS），
# 看「收刀清响」是否清楚突出（与前后的鸣叫、撞击、八卦低鸣、爆墨相比）。
# 用法：python -I tools/r25_audio_check.py <mix.wav> <events.json>
import sys, json, wave
import numpy as np

wav, evp = sys.argv[1], sys.argv[2]
w = wave.open(wav, 'rb')
sr, n, ch = w.getframerate(), w.getnframes(), w.getnchannels()
x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32).reshape(-1, ch) / 32768.0
m = np.max(np.abs(x), axis=1)
rec = json.load(open(evp, encoding='utf-8'))
db = lambda v: round(20 * np.log10(max(1e-6, float(v))), 1)
seen = set()
rows = []
for e in rec['events'] + [dict(L, name='loop:' + L.get('kind', L.get('id', ''))) for L in rec.get('loops', []) if not L.get('stop')]:
    t = e['t'] + (e.get('o') or {}).get('delay', 0)
    key = (e['name'], round(t, 2))
    if key in seen:
        continue
    seen.add(key)
    a, b = int(t * sr), int((t + 0.35) * sr)
    seg = x[a:b]
    if len(seg) == 0:
        continue
    rows.append((t, e['name'], db(np.max(np.abs(seg))), db(np.sqrt(np.mean(seg ** 2)))))
for t, nme, pk, rms in sorted(rows):
    print(f'{t:7.3f}  {nme:14s} peak {pk:6.1f} dBFS   rms(0.35s) {rms:6.1f} dBFS')
print('whole: peak', db(np.max(m)), 'dBFS, rms', db(np.sqrt(np.mean(x ** 2))), 'dBFS, secs', round(n / sr, 2))
