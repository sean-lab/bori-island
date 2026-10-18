// ───────────────────────────────────────────────────────────────
// 3장 · 타일맵, 패럴랙스, 카메라
// ───────────────────────────────────────────────────────────────
function drawLevelStatic(ctx, L, camX, frame, o = {}) {
  const c0 = Math.max(0, Math.floor(camX / TILE)), c1 = Math.min(L.w - 1, Math.floor((camX + (o.w || SCREEN_W)) / TILE));
  for (let ty = 0; ty < L.h; ty++) for (let tx = c0; tx <= c1; tx++) {
    const cv = TileGfx.forCell(L, tx, ty, frame);
    if (cv) ctx.drawImage(cv, tx * TILE - camX, ty * TILE);
  }
  if (o.ents !== false) for (const e of L.ents) {
    if (e.x < c0 - 1 || e.x > c1 + 1) continue;
    const d = ENT_DEFS[e.c];
    if (!d) continue;
    const S = SHEETS[d.sheet];
    if (d.kind === 'goal') { drawSprite(ctx, S, 'goalTop', e.x * TILE - camX, e.y * TILE - 16); drawSprite(ctx, S, 'goalBottom', e.x * TILE - camX, e.y * TILE); }
    else drawSprite(ctx, S, d.key, e.x * TILE - camX, e.y * TILE);
  }
}

function bgTilemapDemo(host) {
  const L = () => ASSETS.level;
  const bench = el('div', { class: 'bench wide' });
  const c = el('canvas', { width: SCREEN_W, height: SCREEN_H, class: 'pix' });
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let camX = 0, sel = { x: 6, y: 10 }, ids = false;
  const pos = el('input', { type: 'range', min: '0', max: String(L().w * TILE - SCREEN_W), step: '16', value: '0', id: 'tm-pos', 'aria-label': tr('지도 위치', 'Map position') });
  pos.addEventListener('input', () => { camX = +pos.value; render(); });
  const ib = el('button', { class: 'btn small', type: 'button', 'aria-pressed': 'false', text: tr('타일 번호 보기', 'Show tile numbers') });
  ib.addEventListener('click', () => { ids = !ids; ib.setAttribute('aria-pressed', String(ids)); render(); });
  const info = el('dl', { class: 'kv' });
  const text = el('pre', { class: 'tracker-text', style: { height: 'auto', marginTop: '10px', fontSize: '12px' } });
  c.addEventListener('pointerdown', (e) => {
    const r = c.getBoundingClientRect();
    const x = Math.floor((((e.clientX - r.left) / r.width) * SCREEN_W + camX) / TILE), y = Math.floor(((e.clientY - r.top) / r.height) * SCREEN_H / TILE);
    sel = { x, y };
    render();
  });
  c.style.cursor = 'crosshair';
  const side = el('div', { class: 'stack' }, el('div', { class: 'label', text: tr('고른 칸', 'Selected cell') }), info);
  bench.append(el('div', { class: 'grid2' }, el('div', { class: 'screen', style: { cursor: 'crosshair' } }, c), side),
    el('div', { class: 'bench-bar' }, el('span', { class: 'lbl', text: tr('지도 위치', 'Map position') }), pos, ib),
    el('div', { class: 'label', style: { marginTop: '10px' }, text: tr('화면에 보이는 부분의 글자 지도 (고른 칸 강조)', 'Character map of the visible area (selected cell highlighted)') }), text);
  host.append(bench);
  function render() {
    const lv = L();
    pos.max = String(lv.w * TILE - SCREEN_W);
    Parallax.draw(ctx, camX, {});
    drawLevelStatic(ctx, lv, camX, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -(camX % TILE); x <= SCREEN_W; x += TILE) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, SCREEN_H); }
    for (let y = 0; y <= SCREEN_H; y += TILE) { ctx.moveTo(0, y + 0.5); ctx.lineTo(SCREEN_W, y + 0.5); }
    ctx.stroke();
    if (ids) {
      const c0 = Math.floor(camX / TILE);
      for (let ty = 0; ty < lv.h; ty++) for (let tx = c0; tx < c0 + 17 && tx < lv.w; tx++) {
        const t = lv.tile(tx, ty);
        if (t) drawText(ctx, String(t), tx * TILE - camX + 5, ty * TILE + 4, { color: '#FFFF55' });
      }
    }
    ctx.strokeStyle = '#FFFF55'; ctx.lineWidth = 2;
    ctx.strokeRect(sel.x * TILE - camX + 1, sel.y * TILE + 1, TILE - 2, TILE - 2);
    // 정보
    const t = lv.tile(sel.x, sel.y), ti = TILE_INFO[t], e = lv.entAt(sel.x, sel.y);
    const props = [ti.solid && tr('단단함', 'solid'), ti.oneWay && tr('위에서만 밟힘', 'one-way from above'), ti.hazard && tr('닿으면 위험', 'hazard'), ti.deco && tr('장식(통과)', 'decoration (pass-through)')].filter(Boolean).join(', ') || tr('없음', 'none');
    info.innerHTML = '';
    const row = (k, v) => info.append(el('dt', { text: k }), el('dd', { text: v }));
    row(tr('열·행', 'Column, row'), sel.x + ', ' + sel.y);
    row(tr('타일 번호', 'Tile number'), t + ' (' + ti.name + ')');
    row(tr('글자', 'Character'), JSON.stringify(ti.ch));
    row(tr('속성', 'Properties'), props);
    if (t === T.GROUND) {
      const m = autoMask(lv, sel.x, sel.y, T.GROUND);
      row(tr('오토타일', 'Autotile'), m + ' = ' + [tr('위', 'up'), tr('오른쪽', 'right'), tr('아래', 'down'), tr('왼쪽', 'left')].map((n, i) => n + (m & (1 << i) ? '○' : '×')).join(' '));
    }
    if (e) row(tr('물체', 'Object'), ENT_DEFS[e.c].name + ' (' + e.c + ')');
    // 글자 지도 조각
    const c0 = Math.floor(camX / TILE);
    const lines = lv.toText().split('\n');
    text.innerHTML = '';
    lines.forEach((ln, y) => {
      const seg = ln.slice(c0, c0 + 16);
      if (y === sel.y && sel.x >= c0 && sel.x < c0 + 16) {
        const k = sel.x - c0;
        text.append(seg.slice(0, k), el('span', { class: 'cur', text: seg[k] }), seg.slice(k + 1) + '\n');
      } else text.append(seg + '\n');
    });
  }
  render();
  Bus.on('level', () => render());
  Bus.on('sheet', () => render());
}

function bgParallaxDemo(host) {
  const bench = el('div', { class: 'bench wide' });
  const box = el('div', { class: 'explode' });
  const names = [['sky', tr('하늘', 'Sky'), 0], ['clouds', tr('구름', 'Clouds'), 0.1], ['mountains', tr('먼 산', 'Mountains'), 0.25], ['hills', tr('언덕', 'Hills'), 0.5], ['tiles', tr('타일·보리', 'Tiles and Bori'), 1]];
  const layers = names.map(([k, label, f], i) => {
    const cv = el('canvas', { width: SCREEN_W, height: SCREEN_H });
    const cx = cv.getContext('2d'); cx.imageSmoothingEnabled = false;
    const tag = el('span', { class: 'tag', text: label + ' ×' + f });
    const ly = el('div', { class: 'ly' }, cv, tag);
    box.append(ly);
    return { k, label, f, cv, cx, ly, tag, show: true, i };
  });
  const factors = Object.assign({}, Parallax.defaults);
  let camX = 0, dir = 1, speed = 1.5, open = false, t = 0;
  const ctrls = el('div', { class: 'stack' });
  for (const L of layers) {
    const cb = el('input', { type: 'checkbox', checked: true, id: 'px-show-' + L.k });
    cb.addEventListener('change', () => { L.show = cb.checked; L.ly.style.opacity = L.show ? '1' : '0'; });
    const lab = el('label', { class: 'check', for: 'px-show-' + L.k }, cb, L.label);
    const rowEl = el('div', { class: 'row', style: { gap: '10px' } }, lab);
    if (L.k in factors) {
      const r = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(factors[L.k]), id: 'px-f-' + L.k, 'aria-label': L.label + tr(' 배율', ' factor') });
      const v = el('span', { class: 'readout', text: '×' + factors[L.k] });
      r.addEventListener('input', () => { factors[L.k] = +r.value; v.textContent = '×' + r.value; L.tag.textContent = L.label + ' ×' + r.value; });
      rowEl.append(r, v);
    } else rowEl.append(el('span', { class: 'readout dim', text: L.k === 'sky' ? tr('고정', 'Fixed') : tr('×1 (카메라와 같이)', '×1 (moves with the camera)') }));
    ctrls.append(rowEl);
  }
  const ob = el('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', text: tr('레이어 펼쳐 보기', 'Spread out the layers') });
  ob.addEventListener('click', () => { open = !open; ob.setAttribute('aria-pressed', String(open)); layout(); });
  const sp = el('input', { type: 'range', min: '0', max: '4', step: '0.25', value: String(speed), id: 'px-speed', 'aria-label': tr('스크롤 속도', 'Scroll speed') });
  sp.addEventListener('input', () => { speed = +sp.value; });
  bench.append(el('div', { class: 'grid2' }, box, el('div', { class: 'stack' }, ctrls,
    el('div', { class: 'ctl' }, el('span', { class: 'lbl', text: tr('스크롤 속도', 'Scroll speed') }), sp), el('div', null, ob))));
  host.append(bench);
  function layout() {
    for (const L of layers) {
      L.ly.style.transform = open ? 'translateY(8%) rotateX(56deg) rotateZ(-30deg) scale(0.5) translateZ(' + ((L.i - 2) * 42) + 'px)' : 'none';
      L.tag.style.opacity = open ? '1' : '0';
    }
  }
  layout();
  function render() {
    const P = Parallax.build(), lv = ASSETS.level;
    for (const L of layers) {
      const cx = L.cx;
      cx.clearRect(0, 0, SCREEN_W, SCREEN_H);
      if (L.k === 'sky') cx.drawImage(P.sky, 0, 0);
      else if (L.k === 'tiles') {
        drawLevelStatic(cx, lv, Math.round(camX), t);
        const hx = Math.round(camX) + 100, col = Math.floor((hx + 8) / TILE);
        let row = lv.h - 1;
        for (let r = 1; r < lv.h; r++) { if (TILE_INFO[lv.tile(col, r)].solid || TILE_INFO[lv.tile(col, r)].oneWay) { row = r; break; } }
        drawSprite(cx, SHEETS.hero, speed > 0 ? animFrame('run', t) : 'idle', 100, row * TILE - 16, { flipX: dir < 0 });
      } else {
        const off = Math.floor(((camX * factors[L.k] + (L.k === 'clouds' ? t * 0.05 : 0)) % LAYER_W + LAYER_W) % LAYER_W);
        cx.drawImage(P[L.k], -off, 0); cx.drawImage(P[L.k], LAYER_W - off, 0);
      }
    }
  }
  const loop = new FixedLoop({
    update: () => {
      t++;
      const max = ASSETS.level.w * TILE - SCREEN_W;
      camX += dir * speed;
      if (camX > max) { camX = max; dir = -1; }
      if (camX < 0) { camX = 0; dir = 1; }
    },
    render,
  });
  render();
  whenVisible(bench, () => loop.start(), () => loop.stop());
}

function bgCameraDemo(host) {
  const bar = el('div', { class: 'bench-bar' });
  const view = new GameView(host, {
    world: { mode: 'sandbox', hud: false, noDrain: true, debug: { cam: true }, camDead: [88, 112], camSmooth: 1, camLook: 0, camOneWay: true, sound: true },
    label: tr('카메라 실험 화면', 'Camera test screen'), cls: 'wide', below: bar,
  });
  const w = () => view.world;
  let width = 24, center = 100;
  const apply = () => { w().o.camDead = [center - width / 2, center + width / 2]; };
  const slider = (label, min, max, step, val, fn, fmtv, key) => {
    const r = el('input', { type: 'range', min, max, step, value: String(val), id: 'cam-' + key, 'aria-label': label });
    const v = el('span', { class: 'readout', text: fmtv(val) });
    r.addEventListener('input', () => { fn(+r.value); v.textContent = fmtv(+r.value); });
    return el('span', { class: 'ctl' }, el('span', { class: 'lbl', text: label }), r, v);
  };
  const ow = el('button', { class: 'btn small', type: 'button', 'aria-pressed': 'true', text: tr('뒤로 못 감', 'No going back') });
  ow.addEventListener('click', () => { w().o.camOneWay = !w().o.camOneWay; ow.setAttribute('aria-pressed', String(w().o.camOneWay)); w().cam.minX = w().cam.x; });
  const rs = el('button', { class: 'btn small', type: 'button', text: tr('처음으로', 'Restart') });
  rs.addEventListener('click', () => { w().reload(); w().scene = 'play'; });
  bar.append(
    slider(tr('데드존 폭', 'Dead zone width'), 0, 140, 4, width, (v) => { width = v; apply(); }, (v) => v + 'px', 'dead'),
    slider(tr('따라가는 속도', 'Follow speed'), 0.04, 1, 0.02, 1, (v) => { w().o.camSmooth = v; }, (v) => v >= 1 ? tr('즉시', 'instant') : v.toFixed(2), 'smooth'),
    slider(tr('앞쪽 보기', 'Look-ahead'), 0, 64, 4, 0, (v) => { w().o.camLook = v; }, (v) => v + 'px', 'look'),
    ow, rs);
}

MOUNTS.background = (root) => {
  bgTilemapDemo($('#bg-tilemap', root));
  bgParallaxDemo($('#bg-parallax', root));
  bgCameraDemo($('#bg-camera', root));
};
