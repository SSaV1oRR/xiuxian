// 界面：地名、小地图、任务追踪、提示、对话、面板、横幅与吐司
// 界面元素拦截指针事件，不会与镜头拖动冲突；对话与面板打开时角色停步
const $ = (s, r = document) => r.querySelector(s);

export class UI {
  constructor() {
    this.dlg = null;
    this.panelOpen = false;
    this.onPanelClose = null;
    this.prompt = $('#prompt');
    this.channel = $('#channel');
    this.typeSpeed = 42;
    $('#panel .close').addEventListener('click', () => this.closePanel());
    $('#panel').addEventListener('pointerdown', (e) => { if (e.target.id === 'panel') this.closePanel(); });
    $('#dialog').addEventListener('click', (e) => { if (!e.target.closest('button')) this.advance(); });
    for (const el of ['#dialog', '#panel', '#menu-btns', '#tracker', '#minimap', '#touch']) {
      const n = $(el);
      n && n.addEventListener('wheel', (e) => e.stopPropagation());
    }
  }

  get busy() { return !!this.dlg || this.panelOpen; }

  setPlace(name, tier) {
    const n = $('#place-name'), t = $('#place-tier');
    if (n.textContent !== name) {
      n.textContent = name;
      n.parentElement.animate([{ opacity: 0.2, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: 'ease-out' });
    }
    t.textContent = tier;
  }

  toast(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    $('#toasts').appendChild(d);
    setTimeout(() => d.remove(), 3500);
  }

  banner(t1, t2) {
    const b = $('#banner');
    $('.t1', b).textContent = t1;
    $('.t2', b).textContent = t2;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  setTracker(list) {
    const el = $('#tracker');
    el.innerHTML = list.map((q) => `<div class="q${q.flash ? ' flash' : ''}"><h4>${q.title}<small>${q.tag || ''}</small></h4>${q.lines.map((l) => `<p class="${l.done ? 'done' : ''}">${l.done ? '✓ ' : '· '}${l.text}</p>`).join('')}${q.progress != null ? `<div class="pbar"><i style="width:${Math.round(q.progress * 100)}%"></i></div>` : ''}</div>`).join('');
  }

  showPrompt(x, y, label, sub = '') {
    this.prompt.classList.remove('hidden');
    this.prompt.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
    const html = `${label}${sub ? `<small>${sub}</small>` : ''}`;
    if (this._pl !== html) { $('span', this.prompt).innerHTML = html; this._pl = html; }
  }
  hidePrompt() { this.prompt.classList.add('hidden'); }
  showChannel(x, y, p, text) {
    this.channel.classList.remove('hidden');
    this.channel.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
    $('.ring', this.channel).style.setProperty('--p', Math.round(p * 100));
    $('span', this.channel).textContent = text;
  }
  hideChannel() { this.channel.classList.add('hidden'); }

  // ---------- 对话 ----------
  // speaker: { name, title }；steps: [{ who?, text, opts?: [{ label, main, fn, then }] }]，text/opts 可为函数
  talk(speaker, steps, { onEnd } = {}) {
    if (this.dlg) this.endTalk(true);
    this.dlg = { speaker, steps: steps.slice(), i: -1, onEnd, typing: false, full: '', sel: 0 };
    $('#dialog').classList.remove('hidden');
    document.body.classList.add('talking');
    this.next();
  }
  next() {
    const D = this.dlg;
    if (!D) return;
    D.i++;
    if (D.i >= D.steps.length) { this.endTalk(); return; }
    const st = D.steps[D.i];
    if (st.do) { st.do(); }
    if (st.text == null && !st.opts) { this.next(); return; }
    const who = st.who === 'narr' ? { name: '旁白', title: '' } : st.who === 'me' ? { name: '你', title: '' } : st.who || D.speaker;
    $('#dialog .who b').textContent = who.name;
    const em = $('#dialog .who em');
    em.textContent = who.title || (st.who === 'narr' ? '所见' : '');
    em.className = st.who === 'narr' ? 'narr' : '';
    em.style.display = em.textContent ? '' : 'none';
    const text = typeof st.text === 'function' ? st.text() : (st.text ?? '');
    D.full = text;
    D.opts = typeof st.opts === 'function' ? st.opts() : st.opts || null;
    D.sel = 0;
    $('#dialog .opts').innerHTML = '';
    this.type(text);
  }
  type(text) {
    const D = this.dlg, el = $('#dialog .text');
    D.typing = true;
    let n = 0;
    clearInterval(D.timer);
    const plain = text.replace(/<[^>]+>/g, '');
    const total = plain.length;
    const render = (k) => {
      // 按可见字符截断（保留标签）
      let out = '', c = 0, i = 0;
      while (i < text.length && c < k) {
        if (text[i] === '<') { const j = text.indexOf('>', i); out += text.slice(i, j + 1); i = j + 1; continue; }
        out += text[i++]; c++;
      }
      if (k >= total) out = text;
      el.innerHTML = out;
    };
    render(0);
    D.timer = setInterval(() => {
      n += 2;
      render(n);
      if (n >= total) { clearInterval(D.timer); D.typing = false; this.showOpts(); }
    }, 2000 / this.typeSpeed);
  }
  showOpts() {
    const D = this.dlg;
    if (!D || !D.opts) return;
    const box = $('#dialog .opts');
    box.innerHTML = '';
    D.opts.forEach((o, k) => {
      const b = document.createElement('button');
      b.innerHTML = `<kbd>${k + 1}</kbd>${o.label}`;
      if (o.main) b.classList.add('main');
      b.addEventListener('click', (e) => { e.stopPropagation(); this.choose(k); });
      box.appendChild(b);
    });
    this.highlight();
  }
  highlight() {
    const bs = [...document.querySelectorAll('#dialog .opts button')];
    bs.forEach((b, i) => b.classList.toggle('sel', i === this.dlg.sel));
  }
  choose(k) {
    const D = this.dlg;
    if (!D || !D.opts || !D.opts[k]) return;
    const o = D.opts[k];
    D.opts = null;
    const r = o.fn ? o.fn() : null;
    if (o.then === 'end' || r === 'end') { this.endTalk(); return; }
    const then = typeof o.then === 'function' ? o.then() : o.then;
    if (Array.isArray(then)) D.steps.splice(D.i + 1, D.steps.length, ...then);
    if (this.dlg === D) this.next();
  }
  advance() {
    const D = this.dlg;
    if (!D) return;
    if (D.typing) {
      clearInterval(D.timer); D.typing = false;
      $('#dialog .text').innerHTML = D.full;
      this.showOpts();
      return;
    }
    if (D.opts) { this.choose(D.sel); return; }
    this.next();
  }
  key(code) {
    const D = this.dlg;
    if (!D) return false;
    if (code === 'KeyE' || code === 'Space' || code === 'Enter') { this.advance(); return true; }
    if (code === 'Escape') { this.endTalk(); return true; }
    if (D.opts && !D.typing) {
      const m = /^Digit(\d)$/.exec(code);
      if (m) { this.choose(+m[1] - 1); return true; }
      if (code === 'ArrowDown' || code === 'KeyS') { D.sel = (D.sel + 1) % D.opts.length; this.highlight(); return true; }
      if (code === 'ArrowUp' || code === 'KeyW') { D.sel = (D.sel - 1 + D.opts.length) % D.opts.length; this.highlight(); return true; }
    }
    return true;
  }
  endTalk(silent = false) {
    const D = this.dlg;
    if (!D) return;
    clearInterval(D.timer);
    this.dlg = null;
    $('#dialog').classList.add('hidden');
    document.body.classList.remove('talking');
    if (!silent && D.onEnd) D.onEnd();
  }

  // ---------- 面板 ----------
  openPanel(title, sub, body, { onClose, width } = {}) {
    if (this.dlg) this.endTalk(true);
    const p = $('#panel');
    $('h2', p).innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    const b = $('.body', p);
    b.innerHTML = '';
    if (typeof body === 'string') b.innerHTML = body; else b.appendChild(body);
    $('.sheet', p).style.width = width ? `min(${width}px, calc(100vw - 40px))` : '';
    p.classList.remove('hidden');
    this.panelOpen = true;
    this.onPanelClose = onClose || null;
    return b;
  }
  closePanel() {
    if (!this.panelOpen) return;
    $('#panel').classList.add('hidden');
    this.panelOpen = false;
    const f = this.onPanelClose;
    this.onPanelClose = null;
    f && f();
  }
}
