// ───────────────────────────────────────────────────────────────
// 20 · 페이지 골격 — 장 이동, 목차, 바뀐 리소스 목록, 소리·언어 스위치
// ───────────────────────────────────────────────────────────────
const CHAPTERS = [
  { id: 'intro', n: '00', title: tr('시작하며', 'Introduction') },
  { id: 'loop', n: '01', title: tr('게임 루프', 'The game loop') },
  { id: 'sprites', n: '02', title: tr('스프라이트와 애니메이션', 'Sprites and animation') },
  { id: 'background', n: '03', title: tr('타일맵·패럴랙스·카메라', 'Tile maps, parallax, camera') },
  { id: 'tools', n: '04', title: tr('리소스 저작 도구', 'Authoring tools') },
  { id: 'sound', n: '05', title: tr('효과음과 배경음악', 'Sound effects and music') },
  { id: 'physics', n: '06', title: tr('게임 물리', 'Game physics') },
  { id: 'basics', n: '07', title: tr('입력·상태 기계·연출', 'Input, state machines, juice') },
  { id: 'hardware', n: '08', title: tr('하드웨어: 그때와 지금', 'Hardware, then and now') },
  { id: 'play', n: '09', title: tr('완성: 플레이', 'Play the game') },
];
const MOUNTS = {};
const mounted = {};

function saveSprites() {
  const out = {};
  for (const k of Object.keys(SHEETS)) { const s = SHEETS[k].serialize(); if (Object.keys(s).length) out[k] = s; }
  if (Object.keys(out).length) Store.set('sprites', out); else Store.del('sprites');
}
const saveSpritesSoon = debounce(saveSprites, 400);

function initAssets() {
  initSheets();
  const saved = Store.get('sprites', null);
  if (saved) for (const k of Object.keys(saved)) if (SHEETS[k]) SHEETS[k].restore(saved[k]);
  ASSETS.levelDefault = Level.fromText(DEFAULT_LEVEL_TEXT);
  let L = null;
  const savedLevel = Store.get('level', null);
  if (typeof savedLevel === 'string') { try { L = Level.fromText(savedLevel); } catch (e) { L = null; } }
  ASSETS.setLevel(L || Level.fromText(DEFAULT_LEVEL_TEXT), false);
}

// 장 번호를 게임의 비트맵 폰트로 그려 CSS 마스크로 쓴다 (테마 색을 그대로 따른다)
function pixelMask(text, scale = 8) {
  const c = document.createElement('canvas');
  c.width = textWidth(text) * scale + scale;
  c.height = 7 * scale + scale;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = false;
  drawText(cx, text, 0, 0, { scale, shadow: false, color: '#FFFFFF' });
  return c.toDataURL();
}

function modifiedSummary() {
  const items = [];
  let sprites = 0;
  for (const k of Object.keys(SHEETS)) sprites += SHEETS[k].keys.filter((_, i) => SHEETS[k].isModified(i)).length;
  if (sprites) items.push({ text: tr('스프라이트 ' + sprites + '프레임', 'Sprites (' + sprites + ' frames)'), href: '#tools' });
  if (ASSETS.level && ASSETS.level.toText() !== DEFAULT_LEVEL_TEXT) items.push({ text: tr('레벨', 'Level'), href: '#tools' });
  const sfx = Object.keys(SFX).filter((k) => JSON.stringify(SFX[k]) !== JSON.stringify(SFX_DEFAULT[k])).length;
  if (sfx) items.push({ text: tr('효과음 ' + sfx + '개', 'Sound effects (' + sfx + ')'), href: '#sound' });
  if (JSON.stringify(SONG) !== SONG_DEFAULT_JSON) items.push({ text: tr('배경음악', 'Music'), href: '#sound' });
  if (physModified()) items.push({ text: tr('물리 값', 'Physics values'), href: '#physics' });
  return items;
}

function resetAllAssets() {
  for (const k of Object.keys(SHEETS)) { const s = SHEETS[k]; s.data = s.defaults.map((d) => new Uint8Array(d)); s.touch(); }
  saveSprites();
  ASSETS.setLevel(Level.fromText(DEFAULT_LEVEL_TEXT));
  for (const k of Object.keys(SFX)) SFX[k] = JSON.parse(JSON.stringify(SFX_DEFAULT[k]));
  Store.del('sfx');
  const d = JSON.parse(SONG_DEFAULT_JSON);
  SONG.speed = d.speed; SONG.order = d.order; SONG.patterns = d.patterns;
  Store.del('song');
  Object.assign(PHYS, PHYS_DEFAULT);
  Store.del('phys');
  Bus.emit('reset-all');
  Bus.emit('phys', PHYS); Bus.emit('song', SONG); Bus.emit('sfx', SFX);
}

// 두 번 눌러야 실행되는 버튼 (확인 대화상자를 쓸 수 없는 환경)
function confirmButton(label, confirmLabel, onConfirm, cls = 'btn small') {
  const b = el('button', { class: cls, type: 'button', text: label });
  let armed = 0;
  b.addEventListener('click', () => {
    if (armed) { clearTimeout(armed); armed = 0; b.textContent = label; onConfirm(); return; }
    b.textContent = confirmLabel;
    armed = setTimeout(() => { armed = 0; b.textContent = label; }, 3000);
  });
  return b;
}

// 언어 바꾸기: 선택을 저장하고, 주소에 ?lang=이 있으면 그것도 바꾼 뒤 다시 연다
function switchLanguage(to) {
  Store.set('lang', to);
  try {
    const u = new URL(location.href);
    if (u.searchParams.has('lang')) { u.searchParams.set('lang', to); location.replace(u.toString()); return; }
  } catch (e) { /* 주소를 바꿀 수 없는 환경 */ }
  location.reload();
}

const App = {
  current: null,
  init() {
    initAssets();
    $('#rail').setAttribute('aria-label', tr('장 목록', 'Chapters'));
    // 브랜드 아이콘: 보리
    $$('.brand-mark').forEach((c) => {
      const cx = c.getContext('2d');
      cx.imageSmoothingEnabled = false;
      const draw = () => { cx.clearRect(0, 0, 16, 16); cx.drawImage(SHEETS.hero.canvas('idle'), 0, 0); };
      draw();
      Bus.on('sheet', draw);
    });
    // 목차
    const toc = $('#toc');
    for (const ch of CHAPTERS) {
      toc.append(el('li', null, el('a', { href: '#' + ch.id, 'data-ch': ch.id }, el('span', { class: 'n', text: ch.n }), el('span', { class: 't', text: ch.title }))));
    }
    // 장 번호 마스크
    $$('.ch-num').forEach((d) => {
      const url = 'url(' + pixelMask(d.dataset.num) + ')';
      d.style.webkitMaskImage = url; d.style.maskImage = url;
    });
    // 장 끝의 이전·다음
    CHAPTERS.forEach((ch, i) => {
      const art = $('#ch-' + ch.id);
      const nav = el('nav', { class: 'ch-nav', 'aria-label': tr('장 이동', 'Chapter navigation') });
      if (i > 0) nav.append(el('a', { href: '#' + CHAPTERS[i - 1].id, class: 'prev' }, el('small', { text: tr('← 이전 장 ', '← Previous · ') + CHAPTERS[i - 1].n }), el('span', { text: CHAPTERS[i - 1].title })));
      if (i < CHAPTERS.length - 1) nav.append(el('a', { href: '#' + CHAPTERS[i + 1].id, class: 'next' }, el('small', { text: tr('다음 장 ', 'Next · ') + CHAPTERS[i + 1].n + ' →' }), el('span', { text: CHAPTERS[i + 1].title })));
      art.append(nav);
    });
    // 코드 강조 (JavaScript만)
    $$('pre code.js').forEach((c) => { c.innerHTML = highlightJS(c.textContent); });
    // 모바일 목차
    const menu = $('#tb-menu'), rail = $('#rail');
    menu.textContent = tr('목차', 'Contents');
    menu.addEventListener('click', () => {
      const open = !rail.classList.contains('open');
      rail.classList.toggle('open', open);
      menu.setAttribute('aria-expanded', String(open));
      menu.textContent = open ? tr('닫기', 'Close') : tr('목차', 'Contents');
    });
    // 소리 스위치
    const st = $('#sound-toggle');
    const syncSound = () => { st.setAttribute('aria-pressed', String(AudioSys.enabled)); st.textContent = AudioSys.enabled ? tr('소리 켜짐', 'Sound on') : tr('소리 꺼짐', 'Sound off'); };
    st.addEventListener('click', () => { AudioSys.setEnabled(!AudioSys.enabled); syncSound(); });
    Bus.on('sound', syncSound);
    syncSound();
    // 언어 스위치: 다른 언어의 이름을 그 언어로 보여 준다
    const lt = $('#lang-toggle');
    lt.textContent = LANG === 'en' ? '한국어' : 'English';
    lt.setAttribute('lang', LANG === 'en' ? 'ko' : 'en');
    lt.setAttribute('aria-label', tr('영어로 보기', 'View in Korean'));
    lt.addEventListener('click', () => switchLanguage(LANG === 'en' ? 'ko' : 'en'));
    // 바뀐 리소스 목록
    const renderChanges = () => {
      const box = $('#changes');
      box.innerHTML = '';
      const items = modifiedSummary();
      if (!items.length) { box.append(el('div', { text: tr('바뀐 리소스 없음. 모두 기본값이다.', 'No changes. Everything is at its default.') })); return; }
      box.append(el('b', { text: tr('내가 바꾼 리소스', 'Your changes') }));
      box.append(el('ul', null, items.map((it) => el('li', null, el('a', { href: it.href, text: it.text })))));
      box.append(el('div', { style: { marginTop: '8px' } }, confirmButton(tr('모두 기본값으로', 'Reset everything'), tr('한 번 더 누르면 되돌림', 'Press again to reset'), resetAllAssets)));
    };
    const rc = debounce(renderChanges, 250);
    ['sheet', 'level', 'phys', 'song', 'sfx', 'reset-all'].forEach((ev) => Bus.on(ev, rc));
    renderChanges();
    window.addEventListener('hashchange', () => this.route());
    this.route();
  },
  route() {
    const id = (location.hash || '').replace('#', '');
    const ch = CHAPTERS.find((c) => c.id === id) ? id : 'intro';
    this.show(ch);
  },
  show(id) {
    if (this.current === id) return;
    const first = this.current === null;
    this.current = id;
    for (const ch of CHAPTERS) $('#ch-' + ch.id).hidden = ch.id !== id;
    $$('#toc a').forEach((a) => { if (a.dataset.ch === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const info = CHAPTERS.find((c) => c.id === id);
    $('#tb-chapter').textContent = info.n + ' · ' + info.title;
    $('#rail').classList.remove('open');
    $('#tb-menu').setAttribute('aria-expanded', 'false');
    $('#tb-menu').textContent = tr('목차', 'Contents');
    if (!mounted[id] && MOUNTS[id]) {
      mounted[id] = true;
      try { MOUNTS[id]($('#ch-' + id)); } catch (e) { console.error('mount ' + id, e); }
    }
    if (!first) window.scrollTo(0, 0);
  },
};
