// ───────────────────────────────────────────────────────────────
// 9장 · 완성 / Chapter 9 · The finished game
// ───────────────────────────────────────────────────────────────
MOUNTS.play = (root) => {
  const bar = el('div', { class: 'bench-bar' });
  const debug = { hitbox: false, info: false };
  const view = new GameView($('#play-game', root), {
    world: { mode: 'game', hud: true, music: true, sound: true, debug },
    label: tr('보리 섬 게임 화면', 'Bori Island game screen'), hint: tr('클릭하고 Enter나 Z로 시작', 'Click, then press Enter or Z to start'), cls: 'wide', below: bar,
  });
  const tog = (label, get, set) => {
    const b = el('button', { class: 'btn small', type: 'button', 'aria-pressed': String(get()), text: label });
    b.addEventListener('click', () => { set(!get()); b.setAttribute('aria-pressed', String(get())); });
    return b;
  };
  // 정수 배율: 기기 픽셀 기준으로 256의 정수배가 되도록 캔버스 폭을 정한다 (8.4)
  let intScale = false;
  const applyScale = () => {
    const c = view.canvas;
    if (!intScale) { c.style.width = ''; c.style.margin = ''; return; }
    const dpr = window.devicePixelRatio || 1;
    const n = Math.max(1, Math.floor((view.screen.clientWidth * dpr) / SCREEN_W));
    c.style.width = (n * SCREEN_W) / dpr + 'px';
    c.style.margin = '0 auto';
  };
  new ResizeObserver(debounce(applyScale, 80)).observe(view.screen);
  const restart = el('button', { class: 'btn small', type: 'button', text: tr('타이틀로', 'Back to title') });
  restart.addEventListener('click', () => { AudioSys.stopMusic(view.world); view.world.toTitle(); view.screen.focus({ preventScroll: true }); });
  const startB = el('button', { class: 'btn primary', type: 'button', text: tr('▶ 시작', '▶ Start') });
  startB.addEventListener('click', () => { AudioSys.unlock(); view.screen.focus({ preventScroll: true }); if (view.world.scene === 'title') setTimeout(() => view.world.newGame(), 40); });
  bar.append(startB,
    tog(tr('히트박스', 'Hitboxes'), () => debug.hitbox, (v) => { debug.hitbox = v; }),
    tog(tr('상태 정보', 'State info'), () => debug.info, (v) => { debug.info = v; }),
    tog(tr('0.5배 느리게', 'Half speed'), () => view.loop.timeScale < 1, (v) => { view.loop.timeScale = v ? 0.5 : 1; }),
    tog(tr('정수 배율', 'Integer scale'), () => intScale, (v) => { intScale = v; applyScale(); }),
    tog(tr('2P 색', '2P colors'), () => view.world.o.heroVariant === '2p', (v) => { view.world.o.heroVariant = v ? '2p' : 'base'; }),
    restart, el('span', { class: 'sp' }), el('span', { class: 'readout dim', text: tr('←→ 이동 · Z 점프 · X 던지기 · P 일시정지', '←→ move · Z jump · X throw · P pause') }));
  const status = $('#play-status', root);
  const render = () => {
    status.innerHTML = '';
    const items = modifiedSummary();
    const wrap = el('div', { class: 'panel row', style: { gap: '10px' } }, el('span', { class: 'label', text: tr('이 게임에 들어간 리소스', 'Resources in this game') }));
    if (!items.length) wrap.append(el('span', { class: 'chip', text: tr('모두 기본값', 'All defaults') }), el('span', { class: 'small', text: tr('4~6장에서 바꾸면 여기 표시된다.', 'Changes you make in Chapters 4–6 show up here.') }));
    else items.forEach((it) => wrap.append(el('a', { class: 'chip mod', href: it.href, text: tr('바꾼 ', 'Changed: ') + it.text })));
    const best = Store.get('best', 0);
    wrap.append(el('span', { class: 'sp', style: { flex: '1' } }), el('span', { class: 'readout', text: tr('최고 점수 ', 'Best score ') + String(best).padStart(6, '0') }));
    status.append(wrap);
  };
  render();
  const rr = debounce(render, 200);
  ['sheet', 'level', 'phys', 'song', 'sfx', 'reset-all'].forEach((ev) => Bus.on(ev, rr));
  view.screen.addEventListener('blur', render);
};
