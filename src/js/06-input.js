// ───────────────────────────────────────────────────────────────
// 06 · 입력 — 키를 '행동'으로 바꾸고, 프레임마다 눌림/뗌을 계산한다
// ───────────────────────────────────────────────────────────────
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowDown: 'down', KeyS: 'down',
  ArrowUp: 'jump', KeyW: 'jump', KeyZ: 'jump', Space: 'jump', KeyK: 'jump',
  KeyX: 'throw', KeyJ: 'throw', KeyC: 'throw',
  Enter: 'start', KeyP: 'pause',
};
const ACTIONS = ['left', 'right', 'down', 'jump', 'throw', 'start', 'pause'];

class Input {
  constructor() {
    this.raw = {}; this.virtual = {}; this.latch = {}; this.cur = {}; this.prev = {};
    this.ai = null;
    this.history = []; this.historyMax = 0;
    ACTIONS.forEach((a) => { this.raw[a] = this.virtual[a] = this.latch[a] = this.cur[a] = this.prev[a] = false; });
  }
  key(code, down) {
    const a = KEYMAP[code];
    if (!a) return false;
    if (down && !this.raw[a]) this.latch[a] = true;   // 아주 짧은 탭도 한 번은 잡히게
    this.raw[a] = down;
    return true;
  }
  setVirtual(a, down) {
    if (down && !this.virtual[a]) this.latch[a] = true;
    this.virtual[a] = down;
  }
  releaseAll() { ACTIONS.forEach((a) => { this.raw[a] = false; this.virtual[a] = false; }); }
  // 고정 업데이트 한 번마다 호출: 지난 프레임 상태를 보관하고 새 상태를 만든다
  poll() {
    for (const a of ACTIONS) {
      this.prev[a] = this.cur[a];
      this.cur[a] = !!(this.raw[a] || this.virtual[a] || this.latch[a] || (this.ai && this.ai[a]));
      this.latch[a] = false;
    }
    if (this.historyMax) {
      const snap = {};
      for (const a of ACTIONS) snap[a] = (this.cur[a] ? 1 : 0) | (this.pressed(a) ? 2 : 0) | (this.released(a) ? 4 : 0);
      this.history.push(snap);
      if (this.history.length > this.historyMax) this.history.shift();
    }
  }
  held(a) { return this.cur[a]; }
  pressed(a) { return this.cur[a] && !this.prev[a]; }
  released(a) { return !this.cur[a] && this.prev[a]; }
}

// 포커스를 가진 화면에만 키 입력이 가도록 연결한다 (페이지 스크롤과 충돌 방지)
function bindKeys(elem, input, hooks = {}) {
  const down = (e) => {
    if (e.target !== elem && !elem.contains(e.target)) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
    if (input.key(e.code, true)) { e.preventDefault(); if (hooks.onKey) hooks.onKey(e.code, true); }
  };
  const up = (e) => { if (input.key(e.code, false)) { e.preventDefault(); if (hooks.onKey) hooks.onKey(e.code, false); } };
  elem.addEventListener('keydown', down);
  elem.addEventListener('keyup', up);
  elem.addEventListener('blur', () => { input.releaseAll(); if (hooks.onBlur) hooks.onBlur(); });
  elem.addEventListener('focus', () => { if (hooks.onFocus) hooks.onFocus(); });
}

// 터치 버튼: 손가락이 버튼 위에 있는 동안 '누름'
function touchPad(input, opts = {}) {
  const pad = el('div', { class: 'touchpad', 'aria-hidden': 'true' });
  const mk = (a, label, cls) => {
    const b = el('button', { class: 'tp-btn ' + (cls || ''), type: 'button', tabindex: '-1', text: label });
    const on = (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ } input.setVirtual(a, true); b.classList.add('on'); if (opts.onPress) opts.onPress(a); };
    const off = () => { input.setVirtual(a, false); b.classList.remove('on'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('lostpointercapture', off);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  };
  const dpad = el('div', { class: 'tp-dpad' }, mk('left', '◀'), mk('down', '▼', 'small'), mk('right', '▶'));
  const ab = el('div', { class: 'tp-ab' }, mk('throw', tr('던지기', 'Throw'), 'b'), mk('jump', tr('점프', 'Jump'), 'a'));
  pad.append(dpad, ab);
  if (opts.start) pad.append(mk('start', tr('시작', 'Start'), 'start'));
  return pad;
}
