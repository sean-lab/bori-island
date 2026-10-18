'use strict';
// ───────────────────────────────────────────────────────────────
// 00 · 공용 도구
// ───────────────────────────────────────────────────────────────
// 언어: 빌드가 넣은 부트 스크립트가 ?lang= 또는 저장해 둔 선택을 보고 정한다
const LANG = (typeof window !== 'undefined' && window.BORI_LANG) || (typeof document !== 'undefined' && document.documentElement && document.documentElement.getAttribute('data-lang')) || 'ko';
const tr = (ko, en) => (LANG === 'en' ? en : ko);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}

// 시드가 있는 난수 (같은 시드 → 같은 결과)
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 브라우저 저장소 (사적인 창 등에서는 실패할 수 있으니 항상 감싼다)
const Store = {
  get(k, def) {
    try { const v = localStorage.getItem('bori:' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
  },
  set(k, v) { try { localStorage.setItem('bori:' + k, JSON.stringify(v)); } catch (e) { /* 저장 불가 */ } },
  del(k) { try { localStorage.removeItem('bori:' + k); } catch (e) { /* 무시 */ } },
};

const Bus = {
  map: new Map(),
  on(ev, fn) { if (!this.map.has(ev)) this.map.set(ev, new Set()); this.map.get(ev).add(fn); return () => this.map.get(ev).delete(fn); },
  emit(ev, data) { const s = this.map.get(ev); if (s) for (const fn of [...s]) { try { fn(data); } catch (e) { console.error(e); } } },
};

function debounce(fn, ms) {
  let t = 0;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// 화면 밀도에 맞춘 캔버스 (선·글자를 또렷하게)
function fitCanvas(canvas, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = Math.max(1, Math.round(cssW * dpr)), h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function cssVar(name, root = document.documentElement) {
  return getComputedStyle(root).getPropertyValue(name).trim();
}

function fmt(n, d = 2) { return Number(n).toFixed(d).replace(/\.?0+$/, (m) => (m.startsWith('.') ? '' : m)); }

function copyText(text, btn) {
  const done = () => { if (btn) { const o = btn.textContent; btn.textContent = tr('복사됨', 'Copied'); setTimeout(() => (btn.textContent = o), 1200); } };
  try {
    navigator.clipboard.writeText(text).then(done, () => fallbackSelect());
  } catch (e) { fallbackSelect(); }
  function fallbackSelect() {
    const ta = btn && btn.closest('.data-panel') && btn.closest('.data-panel').querySelector('textarea');
    if (ta) { ta.focus(); ta.select(); }
    if (btn) { const o = btn.textContent; btn.textContent = tr('선택됨 · Ctrl+C로 복사', 'Selected · press Ctrl+C'); setTimeout(() => (btn.textContent = o), 1600); }
  }
}

// 아주 작은 자바스크립트 구문 강조기
const JS_KW = new Set('const let var function return if else for while do class new this true false null undefined of in break continue switch case default typeof extends constructor static async await'.split(' '));
function highlightJS(src) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const re = /(\/\/[^\n]*)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b|\b0x[0-9a-fA-F]+\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)/g;
  let out = '', last = 0, m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    if (m[1]) out += '<span class="tk-c">' + esc(m[1]) + '</span>';
    else if (m[2]) out += '<span class="tk-s">' + esc(m[2]) + '</span>';
    else if (m[3]) out += '<span class="tk-n">' + esc(m[3]) + '</span>';
    else if (m[4]) out += JS_KW.has(m[4]) ? '<span class="tk-k">' + m[4] + '</span>' : '<span class="tk-f">' + esc(m[4]) + '</span>';
    else if (m[5]) out += JS_KW.has(m[5]) ? '<span class="tk-k">' + m[5] + '</span>' : esc(m[5]);
    last = re.lastIndex;
  }
  return out + esc(src.slice(last));
}

// 화면에 보일 때만 돌아가게 하는 관찰자
function whenVisible(elem, onShow, onHide) {
  if (!('IntersectionObserver' in window)) { onShow(); return () => {}; }
  let shown = false;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && !shown) { shown = true; onShow(); }
      else if (!e.isIntersecting && shown) { shown = false; onHide(); }
    }
  }, { threshold: 0.05 });
  io.observe(elem);
  return () => { io.disconnect(); if (shown) onHide(); };
}

const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
