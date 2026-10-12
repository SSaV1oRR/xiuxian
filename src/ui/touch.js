// 触屏：左下虚拟摇杆移动；在画面上单指拖动转镜头、双指捏合缩放；右下「交互」键
export function setupTouch(input, cam, game, ui) {
  const box = document.querySelector('#touch');
  box.classList.remove('hidden');
  document.body.classList.add('touch');          // 战斗界面据此换成触屏布局（style.css）
  document.querySelector('#keys-hint')?.classList.add('hidden');
  const stick = box.querySelector('.stick'), knob = stick.querySelector('i');
  let sid = null, c = null;
  stick.addEventListener('pointerdown', (e) => {
    sid = e.pointerId; stick.setPointerCapture(sid);
    const r = stick.getBoundingClientRect();
    c = { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width / 2 };
    move(e);
  });
  const move = (e) => {
    if (e.pointerId !== sid) return;
    let dx = (e.clientX - c.x) / c.R, dy = (e.clientY - c.y) / c.R;
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    input.touch = { x: dx, y: -dy, active: true };
    knob.style.transform = `translate(${dx * c.R * 0.6}px, ${dy * c.R * 0.6}px)`;
  };
  stick.addEventListener('pointermove', move);
  const end = (e) => { if (e.pointerId !== sid) return; sid = null; input.touch = { x: 0, y: 0, active: false }; knob.style.transform = ''; };
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);
  // 画面拖动转镜头 / 捏合缩放
  const canvas = document.querySelector('#app canvas');
  const touches = new Map();
  let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return;
    const p = touches.get(e.pointerId);
    if (touches.size === 1) cam.rotate((e.clientX - p.x) * 1.2, (e.clientY - p.y) * 1.2);
    else if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      const d0 = Math.hypot(a.x - b.x, a.y - b.y);
      p.x = e.clientX; p.y = e.clientY;
      const [a2, b2] = [...touches.values()];
      const d1 = Math.hypot(a2.x - b2.x, a2.y - b2.y);
      if (pinch) cam.zoom((d0 - d1) * 4);
      pinch = 1;
      return;
    }
    p.x = e.clientX; p.y = e.clientY;
  });
  const tend = (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch = 0; };
  canvas.addEventListener('pointerup', tend);
  canvas.addEventListener('pointercancel', tend);
  // 跳跃键
  box.querySelector('.jump')?.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!ui.busy) game.player.jump(); });
  // 御剑（第十三轮）：起飞 / 落地；御剑时按住「升」「降」
  box.querySelector('.fly')?.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!ui.busy && !game.lock) game.toggleFlight(); });
  const hold = (el, key) => {
    if (!el) return;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); input[key] = true; });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => { input[key] = false; });
  };
  hold(box.querySelector('.up'), 'touchUp');
  hold(box.querySelector('.down'), 'touchDown');
}
