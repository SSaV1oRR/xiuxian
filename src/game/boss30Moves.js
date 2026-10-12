// 第二十四轮：烬狱剑尊的招式表（由 boss30Config.js 的数据拼成可执行的「段」），以及火焰招式、焚天断界的时间轴。
// 每一招是一串段（seg），由 boss30Fight 的同一个执行器推进：放动作（含举剑停顿的区段速度）→ 出手段里沿剑的真实轨迹判定 → 段末接下一段。
// 段上的 events：[动作时刻, (F, M) => …]——火浪、火纹、火柱在动作的某一刻放出（之后由危险物各自推进，与刀身分别判定）。
import { COMBOS30, SPECIAL30, FIRE30, CONFIG30 } from './boss30Config.js';
import * as THREE from 'three';

const CFG = CONFIG30;
const deep = (s) => ({ ...s, hits: (s.hits || []).map((h) => ({ ...h })), events: (s.events || []).slice() });

// 一套剑式连招 → 招
export function comboMove(id) {
  const D = COMBOS30[id];
  return { kind: 'combo', id, name: D.name, no: id, def: D, parry: D.parry, segs: D.segs.map(deep) };
}
export function specialMove(key) {
  const D = SPECIAL30[key];
  return { kind: 'special', id: key, name: D.name, no: key === 'counter' ? '截锋' : '留锋', def: D, parry: 'last', segs: D.segs.map(deep) };
}

// 火焰招式 → 招（events 里放出危险物；刀身照样按剑的轨迹判定）
export function fireMove(id, F) {
  const D = FIRE30[id], FC = CFG.fire;
  const M = { kind: 'fire', id, name: D.name, no: id, def: D, parry: 'last', segs: [] };
  const aimAt = () => F.aimDir();
  if (id === 'F01') {
    M.segs.push({ clip: D.clip, from: 0, fade: 0.15, hold: D.hold.slice(), hits: [{ key: D.blade.key, t: D.blade.t.slice(), dmg: 'heavy', def: 'heavy', lean: D.blade.lean || 0 }],
      events: [[D.launch, (F2) => { F2.launchWave(F2.root.clone(), aimAt(), { prep: FC.F01.prep, w: FC.F01.width, speed: FC.F01.speed, len: FC.F01.len }); F2.sfx('flameBurst', { at: F2.root, gain: 0.7 }); }]] });
  } else if (id === 'F02') {
    M.segs.push({ clip: D.clip, from: 0, fade: 0.15, events: [[D.land, (F2) => { F2.stomp(F2.root.clone(), FC.F02.r, FC.F02.delay); }]] });
  } else if (id === 'F04') {
    D.segs.forEach((s, i) => {
      M.segs.push({ clip: s.clip, from: s.from, to: s.to, fade: s.fade, hold: s.hold ? s.hold.slice() : null,
        events: [[s.launch, (F2) => { F2.launchWave(F2.root.clone(), aimAt(), { prep: FC.F04.preps[i], w: FC.F04.width, speed: FC.F04.speed, len: FC.F04.len, tag: 'w' + i }); F2.sfx('b30Wave', { at: F2.root, gain: 0.8 }, 'flameBurst'); }]] });
    });
  } else if (id === 'F05') {
    M.segs.push({ clip: D.clip, from: 0, fade: 0.15, events: [[D.plant, (F2) => { F2.ringBurst(F2.root.clone(), FC.F05.r0, FC.F05.r1, FC.F05.delay); }]] });
  } else if (id === 'F06') {
    M.segs.push({ clip: D.clip, from: 0, fade: 0.15, hold: D.hold.slice(), hits: [{ key: D.blade.key, t: D.blade.t.slice(), dmg: 'heavy', def: 'heavy', lean: D.blade.lean || 0 }],
      events: [[D.call, (F2) => { F2.pillars(FC.F06); }]] });
  } else if (id === 'F07') {
    M.segs.push({ clip: D.clip, from: 0, fade: 0.12, leap: { air: D.air.slice(), h: FC.F07.h, max: FC.F07.maxDist }, noInterruptAir: true,
      hits: [{ key: D.blade.key, t: D.blade.t.slice(), dmg: 'heavy', def: 'heavy', lean: D.blade.lean || 0 }],
      events: [[D.impact, (F2) => { F2.impact(F2.root.clone(), FC.F07.r); }]] });
  }
  return M;
}

// 焚天断界：跃至场心 → 蓄力 5.5 秒（举剑、地纹、火聚、增强、最终前摇）→ 爆发一次 → 恢复 4 秒（冷却在恢复结束后才开始计）
export function ultMove() {
  const U = CFG.ult;
  return { kind: 'ult', id: 'ult', name: '焚天断界', no: '断界', parry: 'none', segs: [
    { clip: 'leap', from: 0, fade: 0.15, leap: { air: [0.4, 1.0], h: U.leapH, center: true, airTime: U.leap * 0.55 }, noInterruptAir: true, to: 1.5 },
  ], charge: U.charge };
}

export const _tmp = new THREE.Vector3();
