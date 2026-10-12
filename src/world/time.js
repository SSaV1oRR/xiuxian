// 游戏时钟：游戏时间流速为现实的 100 倍（游戏 1 分钟 = 现实 0.6 秒，一昼夜约现实 14.4 分钟）
// 太阳按纬度 30°、赤纬 +12°（暮春）计算方位与高度；月亮取相对的时角（望月），夜里由它投影
import * as THREE from 'three';

export const TIME = {
  scale: 100,         // 游戏秒 / 现实秒
  hour: 7.3,          // 当日时刻（0~24），入山时为辰时初
  day: 1,
  paused: false,
};

const LAT = THREE.MathUtils.degToRad(30), DEC = THREE.MathUtils.degToRad(12);

export function advanceTime(dt) {
  if (TIME.paused) return;
  TIME.hour += (dt * TIME.scale) / 3600;
  while (TIME.hour >= 24) { TIME.hour -= 24; TIME.day++; }
}

// 太阳（或月亮）在给定时刻的方向：az 自正北顺时针，el 为仰角（弧度）；返回指向天体的单位向量（+X 东，-Z 北）
function celestial(hour, dec, out) {
  const H = ((hour - 12) / 12) * Math.PI;
  const sinEl = Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(H);
  const el = Math.asin(THREE.MathUtils.clamp(sinEl, -1, 1));
  const cosAz = (Math.sin(dec) - Math.sin(el) * Math.sin(LAT)) / (Math.cos(el) * Math.cos(LAT) + 1e-6);
  let az = Math.acos(THREE.MathUtils.clamp(cosAz, -1, 1));
  if (H > 0) az = 2 * Math.PI - az;
  out.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
  return { el, az };
}

const _s = new THREE.Vector3(), _m = new THREE.Vector3();
// 月亮：入夜自东方升起，子夜时悬在北天（云顶主峰之上约 32°），拂晓沉入西方——沿中轴北望时月在峰上。
// （仙境的月轨：取南纬 60° 处所见的视运动，不按真实天文计算）
function moonDir(hour, out) {
  const H = (((hour + 12) % 24) - 12) / 12 * Math.PI;           // 子夜为 0
  const lat = THREE.MathUtils.degToRad(-60), dec = THREE.MathUtils.degToRad(-2);
  const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
  const el = Math.asin(THREE.MathUtils.clamp(sinEl, -1, 1));
  const cosAz = (Math.sin(dec) - Math.sin(el) * Math.sin(lat)) / (Math.cos(el) * Math.cos(lat) + 1e-6);
  let az = Math.acos(THREE.MathUtils.clamp(cosAz, -1, 1));
  if (H > 0) az = 2 * Math.PI - az;
  out.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
  return { el, az };
}
// 当前天光状态：太阳 / 月亮方向与高度、昼夜系数
export function skyState(hour = TIME.hour) {
  const sun = celestial(hour, DEC, _s);
  const moon = moonDir(hour, _m);
  const sinS = Math.sin(sun.el);
  const day = THREE.MathUtils.smoothstep(sinS, -0.1, 0.12);          // 0 夜 → 1 昼（含晨昏过渡）
  return { sunDir: _s, sunEl: sun.el, sunAz: sun.az, moonDir: _m, moonEl: moon.el, moonAz: moon.az, day, night: 1 - day };
}

// 十二时辰与刻：子时 23–1 点……每个时辰八刻
const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const KE = ['初', '一', '二', '三', '四', '五', '六', '七'];
export function shichen(hour = TIME.hour) {
  const h = (hour + 1) % 24;
  const i = Math.floor(h / 2), ke = Math.floor(((h % 2) / 2) * 8);
  return { name: SHICHEN[i] + '时', ke: KE[ke] + '刻', index: i, text: `${SHICHEN[i]}时${ke ? KE[ke] + '刻' : '初'}` };
}
