// ───────────────────────────────────────────────────────────────
// 8장 · 하드웨어: 그때와 지금 / Chapter 8 · Hardware, then and now
// ───────────────────────────────────────────────────────────────
const fmtInt = (n) => Math.round(n).toLocaleString(LANG === 'en' ? 'en-US' : 'ko-KR');
function fmtBytes(b) {
  if (b < 1024) return Math.round(b) + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

// 레벨의 한 칸을 16×16 팔레트 번호 배열로 (TileGfx.forCell과 같은 규칙)
const cellBufCache = new Map();
function cellBuf(level, tx, ty) {
  const id = level.tiles[ty * level.w + tx];
  let key, make;
  switch (id) {
    case T.GROUND: { const m = autoMask(level, tx, ty, T.GROUND), v = ((tx * 7 + ty * 13) >>> 0) % 3; key = 'g' + m + ':' + v; make = () => groundBuf(m, v); break; }
    case T.BLOCK: key = 'block'; make = blockBuf; break;
    case T.LOG: { const m = autoMask(level, tx, ty, T.LOG) & 10; key = 'log' + m; make = () => logBuf(m); break; }
    case T.WATER: { const s = ty === 0 || level.tiles[(ty - 1) * level.w + tx] !== T.WATER; key = 'w' + (s ? 1 : 0); make = () => waterBuf(s, 0); break; }
    case T.THORN: key = 'thorn'; make = thornBuf; break;
    case T.BUSH: key = 'bush'; make = bushBuf; break;
    case T.FLOWER: key = 'flower'; make = () => rowsToBuf(FLOWER_ROWS); break;
    case T.SIGN: key = 'sign'; make = () => rowsToBuf(SIGN_ROWS); break;
    default: return null;
  }
  let b = cellBufCache.get(key);
  if (!b) { b = make(); cellBufCache.set(key, b); }
  return b;
}
function levelBuffer(level) {
  const W = level.w * TILE, H = level.h * TILE, buf = new Uint8Array(W * H);
  for (let ty = 0; ty < level.h; ty++) for (let tx = 0; tx < level.w; tx++) {
    const b = cellBuf(level, tx, ty);
    if (!b) continue;
    for (let y = 0; y < 16; y++) buf.set(b.subarray(y * 16, y * 16 + 16), (ty * 16 + y) * W + tx * 16);
  }
  return { buf, w: W, h: H };
}
function spriteStrip() {
  const frames = [];
  for (const name of Object.keys(SHEETS)) {
    const s = SHEETS[name];
    s.data.forEach((d) => frames.push(d));
    if (name === 'hero') s.data.forEach((d) => {          // 스프라이트는 뒤집을 수 없으니 왼쪽 그림을 따로 둔다
      const m = new Uint8Array(256);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) m[y * 16 + x] = d[y * 16 + 15 - x];
      frames.push(m);
    });
  }
  const w = frames.length * 16, buf = new Uint8Array(w * 16);
  frames.forEach((d, i) => { for (let y = 0; y < 16; y++) buf.set(d.subarray(y * 16, y * 16 + 16), y * w + i * 16); });
  return { buf, w, h: 16 };
}

// 8×8 조각으로 잘라 서로 다른 조각을 센다. flips면 뒤집어서 같아지는 조각을 하나로 친다.
function uniquePieces(buf, w, h, flips) {
  const seen = new Map();
  const cell = new Uint8Array(64);
  const key = (fx, fy) => {
    let s = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) s += String.fromCharCode(65 + cell[(fy ? 7 - y : y) * 8 + (fx ? 7 - x : x)]);
    return s;
  };
  let total = 0;
  for (let by = 0; by + 8 <= h; by += 8) for (let bx = 0; bx + 8 <= w; bx += 8) {
    total++;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) cell[y * 8 + x] = buf[(by + y) * w + bx + x];
    let k = key(false, false);
    if (flips) for (const [fx, fy] of [[true, false], [false, true], [true, true]]) { const k2 = key(fx, fy); if (k2 < k) k = k2; }
    if (!seen.has(k)) seen.set(k, cell.slice());
  }
  return { total, unique: seen.size, tiles: [...seen.values()] };
}

// ── 8.2 VRAM 계산기 ─────────────────────────────────────────────
function hwVram(host) {
  const LIMIT = 448;
  const layers = [
    { id: 'sky', name: tr('하늘', 'Sky'), pal: BG_PAL, bg: true, get: () => ({ buf: Parallax.bufs.sky, w: SCREEN_W, h: SCREEN_H }) },
    { id: 'clouds', name: tr('구름', 'Clouds'), pal: BG_PAL, bg: true, get: () => ({ buf: Parallax.bufs.clouds, w: LAYER_W, h: SCREEN_H }) },
    { id: 'mountains', name: tr('먼 산', 'Mountains'), pal: BG_PAL, bg: true, get: () => ({ buf: Parallax.bufs.mountains, w: LAYER_W, h: SCREEN_H }) },
    { id: 'hills', name: tr('언덕과 나무', 'Hills and trees'), pal: BG_PAL, bg: true, get: () => ({ buf: Parallax.bufs.hills, w: LAYER_W, h: SCREEN_H }) },
    { id: 'level', name: tr('레벨 타일', 'Level tiles'), pal: BG_PAL, bg: true, get: () => levelBuffer(ASSETS.level) },
    { id: 'sprites', name: tr('스프라이트', 'Sprites'), pal: SPR_PAL, bg: false, get: spriteStrip },
  ];
  let flips = true, sel = 'clouds', results = null, limitAt = 0;
  const positionLimit = () => {
    const t0 = chart.querySelector('.track'), lim = chart.querySelector('.limit');
    if (t0 && lim) lim.style.left = (t0.offsetLeft + t0.offsetWidth * limitAt) + 'px';
  };
  const panel = el('div', { class: 'panel stack' });
  const chart = el('div', { class: 'vchart', role: 'list' });
  const detail = el('div', { class: 'readout', style: { minHeight: '1.5em' } });
  const summary = el('div', { class: 'small' });
  const cb = el('input', { type: 'checkbox', checked: true, id: 'vram-flips' });
  cb.addEventListener('change', () => { flips = cb.checked; compute(); });
  const mosaic = el('canvas', { class: 'pix', style: { width: '100%', height: 'auto', borderRadius: '6px', background: 'var(--bezel)' } });
  const mosaicLabel = el('div', { class: 'label' });
  panel.append(
    el('div', { class: 'row' }, el('span', { class: 'label', text: tr('8×8 조각 수 · 막대를 누르면 그 레이어의 조각을 본다', 'Distinct 8×8 pieces · select a bar to see that layer\'s pieces') }), el('span', { class: 'sp', style: { flex: '1' } }),
      el('label', { class: 'check small', for: 'vram-flips' }, cb, tr('뒤집으면 같은 조각은 하나로 (배경만)', 'Count flipped matches once (background only)'))),
    chart, detail, summary, mosaicLabel, mosaic);
  host.append(panel);

  function compute() {
    Parallax.build();
    results = layers.map((L) => {
      const { buf, w, h } = L.get();
      const r = uniquePieces(buf, w, h, flips && L.bg);
      return Object.assign({ L }, r);
    });
    render();
  }
  function render() {
    chart.innerHTML = '';
    const total = results.reduce((s, r) => s + r.unique, 0);
    const axisMax = Math.max(total, LIMIT) * 1.06;
    const row = (label, value, sub, id, isSum) => {
      const fill = el('i', { class: 'fill', style: { width: Math.max(0.4, (value / axisMax) * 100) + '%' } });
      const track = el('div', { class: 'track' + (isSum ? ' sum' : '') + (id === sel ? ' sel' : ''), tabindex: '0', role: 'listitem', 'aria-label': label + ' ' + value }, fill);
      const show = () => { detail.textContent = sub; };
      track.addEventListener('pointerenter', show);
      track.addEventListener('focus', show);
      if (id) track.addEventListener('click', () => { sel = id; render(); });
      if (id) track.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel = id; render(); } });
      chart.append(el('span', { class: 'lab' + (isSum ? ' sum' : ''), text: label }), track, el('span', { class: 'val' + (isSum ? ' sum' : ''), text: fmtInt(value) }));
    };
    for (const r of results) {
      row(r.L.name, r.unique, r.L.name + ': ' + tr(fmtInt(r.total) + '조각 중 서로 다른 조각 ' + fmtInt(r.unique) + '장 · ' + fmtBytes(r.unique * 32), fmtInt(r.unique) + ' distinct out of ' + fmtInt(r.total) + ' pieces · ' + fmtBytes(r.unique * 32)), r.L.id, false);
    }
    row(tr('합계', 'Total'), total, tr('합계 ' + fmtInt(total) + '장 · 타일 자리는 448장 (14KB)', 'Total ' + fmtInt(total) + ' · room for 448 tiles (14 KB)'), null, true);
    const lim = el('div', { class: 'limit', 'aria-hidden': 'true' }, el('b', { text: tr('VRAM 한도 448', 'VRAM limit 448') }));
    chart.append(lim);
    limitAt = LIMIT / axisMax;
    positionLimit();
    detail.textContent = tr('막대에 포인터를 올리거나 눌러 자세히 본다.', 'Hover over or select a bar for details.');
    const over = total / LIMIT;
    summary.textContent = tr(
      '모두 합치면 ' + fmtInt(total) + '장, 마스터 시스템 VRAM에 들어가는 448장의 ' + over.toFixed(1) + '배다. 서로 다른 조각 하나가 32바이트(8×8×4비트)이니 ' + fmtBytes(total * 32) + '가 필요하다.',
      'Altogether ' + fmtInt(total) + ' pieces, ' + over.toFixed(1) + ' times the 448 that fit in the Master System\'s VRAM. Each distinct piece takes 32 bytes (8×8×4 bits), so this needs ' + fmtBytes(total * 32) + '.');
    drawMosaic();
  }
  function drawMosaic() {
    const r = results.find((x) => x.L.id === sel) || results[0];
    const z = 2, cellW = 8 * z + 2;
    const W = Math.max(240, Math.floor((mosaic.parentElement ? mosaic.parentElement.clientWidth - 32 : 600)));
    const cols = Math.max(8, Math.floor(W / cellW));
    const maxShow = cols * 14;
    const shown = r.tiles.slice(0, maxShow);
    const rows = Math.max(1, Math.ceil(shown.length / cols));
    mosaic.width = cols * cellW + 2; mosaic.height = rows * cellW + 2;
    const ctx = mosaic.getContext('2d');
    const img = ctx.createImageData(mosaic.width, mosaic.height);
    const rgb = r.L.pal.map((h) => (h ? hexToRgb(h) : null));
    for (let i = 0; i < img.data.length; i += 4) { img.data[i] = 21; img.data[i + 1] = 26; img.data[i + 2] = 27; img.data[i + 3] = 255; }
    shown.forEach((t, n) => {
      const ox = 2 + (n % cols) * cellW, oy = 2 + Math.floor(n / cols) * cellW;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const v = t[y * 8 + x];
        const c = rgb[v] || (((x + y) & 1) ? [70, 80, 80] : [52, 60, 60]);
        for (let yy = 0; yy < z; yy++) for (let xx = 0; xx < z; xx++) {
          const p = ((oy + y * z + yy) * mosaic.width + ox + x * z + xx) * 4;
          img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2];
        }
      }
    });
    ctx.putImageData(img, 0, 0);
    mosaic.style.width = Math.min(100, (mosaic.width / W) * 100 * 1.6) + '%';
    mosaicLabel.textContent = tr(r.L.name + '의 서로 다른 조각 ' + fmtInt(r.unique) + '장' + (r.tiles.length > maxShow ? ' (앞의 ' + maxShow + '장만 표시)' : '') + ' · 체크무늬는 투명',
      r.L.name + ': ' + fmtInt(r.unique) + ' distinct pieces' + (r.tiles.length > maxShow ? ' (first ' + maxShow + ' shown)' : '') + ' · checkerboard = transparent');
  }
  const recompute = debounce(() => { if (results) compute(); }, 400);
  Bus.on('level', recompute);
  Bus.on('sheet', recompute);
  whenVisible(panel, () => { if (!results) { detail.textContent = tr('계산 중…', 'Counting…'); setTimeout(compute, 30); } }, () => {});
  new ResizeObserver(debounce(() => { if (results) { drawMosaic(); positionLimit(); } }, 120)).observe(panel);
}

// ── 8.3 래스터 스크롤 ───────────────────────────────────────────
function hwRaster(host) {
  const BANDS = [
    { y0: 0, y1: 84, f: 0.1, name: tr('구름', 'Clouds') },
    { y0: 84, y1: 136, f: 0.25, name: tr('먼 산', 'Mountains') },
    { y0: 136, y1: 160, f: 0.5, name: tr('언덕', 'Hills') },
    { y0: 160, y1: 192, f: 1, name: tr('땅', 'Ground') },
  ];
  const st = { raster: true, wave: false, beam: false, bands: true, camX: 0, speed: 1.5, t: 0, beamY: 0, irq: -1, irqT: 0 };
  const bench = el('div', { class: 'bench wide' });
  const c = el('canvas', { width: SCREEN_W, height: SCREEN_H, class: 'pix' });
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const fb = document.createElement('canvas'); fb.width = SCREEN_W; fb.height = SCREEN_H;
  const fctx = fb.getContext('2d'); fctx.imageSmoothingEnabled = false;
  const src = document.createElement('canvas'); src.width = LAYER_W; src.height = SCREEN_H;
  const table = el('table', { class: 'regtable' });
  const tog = (label, key, after) => {
    const b = el('button', { class: 'btn small', type: 'button', 'aria-pressed': String(st[key]), text: label });
    b.addEventListener('click', () => { st[key] = !st[key]; b.setAttribute('aria-pressed', String(st[key])); if (after) after(); });
    return b;
  };
  const sp = el('input', { type: 'range', min: '0', max: '4', step: '0.25', value: String(st.speed), id: 'raster-speed', 'aria-label': tr('스크롤 속도', 'Scroll speed') });
  sp.addEventListener('input', () => { st.speed = +sp.value; });
  bench.append(el('div', { class: 'grid2' },
    el('div', { class: 'screen', style: { cursor: 'default' } }, c),
    el('div', { class: 'stack' }, el('div', { class: 'label', text: tr('줄별 스크롤 레지스터 (라인 인터럽트가 바꾸는 값)', 'Scroll register per band (set by line interrupts)') }), table,
      el('div', { class: 'small', style: { color: 'var(--bezel-dim)' }, text: tr('배경 레이어는 한 장. 띠가 시작되는 줄에서 스크롤 값만 바꾼다.', 'One background layer. Only the scroll value changes where each band begins.') }))),
  el('div', { class: 'bench-bar' },
    tog(tr('줄마다 스크롤 값 바꾸기', 'Change scroll per line'), 'raster'),
    tog(tr('물결', 'Ripple'), 'wave'),
    tog(tr('주사선 보기 (느리게)', 'Show the beam (slow)'), 'beam', () => { st.beamY = 0; }),
    tog(tr('띠 경계 표시', 'Mark the bands'), 'bands'),
    el('span', { class: 'ctl' }, el('span', { class: 'lbl', text: tr('속도', 'Speed') }), sp)));
  host.append(bench);

  function buildSrc() {
    const P = Parallax.build(), s = src.getContext('2d');
    s.imageSmoothingEnabled = false;
    s.clearRect(0, 0, LAYER_W, SCREEN_H);
    const band = (y0, y1, draw) => { s.save(); s.beginPath(); s.rect(0, y0, LAYER_W, y1 - y0); s.clip(); draw(); s.restore(); };
    band(0, 84, () => { s.drawImage(P.sky, 0, 0); s.drawImage(P.sky, 256, 0); s.drawImage(P.clouds, 0, 0); });
    band(84, 136, () => { s.drawImage(P.sky, 0, 0); s.drawImage(P.sky, 256, 0); s.drawImage(P.mountains, 0, 0); });
    band(136, 160, () => { s.fillStyle = BG_PAL[5]; s.fillRect(0, 136, LAYER_W, 24); s.drawImage(P.hillsBare, 0, 0); });
    band(160, 192, () => {
      s.fillStyle = BG_PAL[4]; s.fillRect(0, 160, LAYER_W, 32);
      const L = ASSETS.level;
      for (let ty = 10; ty < 12; ty++) for (let tx = 0; tx < LAYER_W / TILE; tx++) { const cv = TileGfx.forCell(L, tx, ty, 0); if (cv) s.drawImage(cv, tx * TILE, ty * TILE); }
    });
  }
  const bandOf = (y) => BANDS.find((b) => y >= b.y0 && y < b.y1);
  function scrollFor(y) {
    const b = bandOf(y);
    let x = st.raster ? st.camX * b.f : st.camX;
    if (st.wave) x += Math.sin(y * 0.3 + st.t * 0.12) * 3;
    return ((Math.round(x) % LAYER_W) + LAYER_W) % LAYER_W;
  }
  function drawLine(g, y) {
    const sx = scrollFor(y), w1 = Math.min(SCREEN_W, LAYER_W - sx);
    g.drawImage(src, sx, y, w1, 1, 0, y, w1, 1);
    if (w1 < SCREEN_W) g.drawImage(src, 0, y, SCREEN_W - w1, 1, w1, y, SCREEN_W - w1, 1);
  }
  const cells = BANDS.map((b) => {
    const v = el('td', { class: 'mono' });
    const tr_ = el('tr', null, el('td', { class: 'mono', text: (LANG === 'en' ? 'line ' : '') + b.y0 + (LANG === 'en' ? '' : '번 줄') }), el('td', { text: b.name }), el('td', { class: 'mono', text: '×' + b.f }), v);
    table.append(tr_);
    return { tr: tr_, v, b };
  });
  table.prepend(el('tr', null, el('th', { text: tr('시작', 'From') }), el('th', { text: tr('띠', 'Band') }), el('th', { text: tr('배율', 'Factor') }), el('th', { text: tr('스크롤 값', 'Scroll') })));
  function syncTable() {
    for (const x of cells) {
      x.v.textContent = String(scrollFor(x.b.y0));
      const hot = st.beam ? st.beamY >= x.b.y0 && st.beamY < x.b.y1 : false;
      x.tr.classList.toggle('hot', hot);
    }
  }
  function overlay() {
    if (st.bands) {
      for (const b of BANDS) {
        if (b.y0 === 0) continue;
        ctx.fillStyle = 'rgba(255,255,85,0.55)';
        for (let x = 0; x < SCREEN_W; x += 4) ctx.fillRect(x, b.y0, 2, 1);
      }
      for (const b of BANDS) drawText(ctx, '×' + b.f, SCREEN_W - 4, b.y0 + 3, { align: 'right', color: '#FFFF55' });
    }
  }
  const loop = new FixedLoop({
    update() {
      st.t++;
      if (st.beam) {
        for (let i = 0; i < 2; i++) {
          if (BANDS.some((b) => b.y0 === st.beamY)) { st.irq = st.beamY; st.irqT = 24; }
          drawLine(fctx, st.beamY);
          st.beamY++;
          if (st.beamY >= SCREEN_H) { st.beamY = 0; st.camX += st.speed * 6; }
        }
      } else {
        st.camX += st.speed;
        for (let y = 0; y < SCREEN_H; y++) drawLine(fctx, y);
      }
      if (st.irqT > 0) st.irqT--;
    },
    render() {
      ctx.drawImage(fb, 0, 0);
      if (st.beam) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(0, st.beamY, SCREEN_W, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, st.beamY + 1, SCREEN_W, SCREEN_H - st.beamY - 1);
        if (st.irqT > 0) drawText(ctx, 'LINE ' + st.irq + ' IRQ: SCROLL=' + scrollFor(st.irq), 4, Math.min(SCREEN_H - 10, st.irq + 3), { color: '#FF5555' });
      }
      overlay();
      syncTable();
    },
  });
  buildSrc();
  for (let y = 0; y < SCREEN_H; y++) drawLine(fctx, y);
  ctx.drawImage(fb, 0, 0); overlay(); syncTable();
  Bus.on('level', debounce(buildSrc, 300));
  whenVisible(bench, () => loop.start(), () => loop.stop());
}

// ── 8.4 정수 배율 ───────────────────────────────────────────────
function hwScale(host) {
  const st = { s: 5.625, smooth: false, moving: true, par: false, off: 0, t: 0 };
  const panel = el('div', { class: 'bench wide' });
  const view = el('canvas', { class: 'vcanvas', style: { height: '260px', background: '#000', borderRadius: '6px' } });
  const strip = el('canvas', { class: 'vcanvas', style: { height: '34px', marginTop: '6px' } });
  const info = el('div', { class: 'readout' });
  const r = el('input', { type: 'range', min: '1', max: '8', step: '0.125', value: String(st.s), id: 'scale-s', 'aria-label': tr('배율', 'Scale') });
  const rv = el('span', { class: 'readout' });
  r.addEventListener('input', () => { st.s = +r.value; sync(); });
  const presets = el('div', { class: 'seg' });
  [[3, '3×'], [4, '4×'], [5, '5×'], [5.625, '5.625×']].forEach(([v, label]) => {
    const b = el('button', { class: 'btn small', type: 'button', text: label });
    b.addEventListener('click', () => { st.s = v; r.value = String(v); sync(); });
    presets.append(b);
  });
  const method = segButtons([[false, tr('가장 가까운 픽셀', 'Nearest neighbor')], [true, tr('부드럽게 보간', 'Smooth interpolation')]], false, (v) => { st.smooth = v; sync(); });
  const mv = el('button', { class: 'btn small', type: 'button', 'aria-pressed': 'true', text: tr('천천히 스크롤', 'Scroll slowly') });
  mv.addEventListener('click', () => { st.moving = !st.moving; mv.setAttribute('aria-pressed', String(st.moving)); });
  const par = el('button', { class: 'btn small', type: 'button', 'aria-pressed': 'false', text: tr('8:7 픽셀 (그 시절 TV)', '8:7 pixels (period TV)') });
  par.addEventListener('click', () => { st.par = !st.par; par.setAttribute('aria-pressed', String(st.par)); sync(); });
  const table = el('table', { class: 'spec' });
  panel.append(view, strip, info,
    el('div', { class: 'bench-bar' }, el('span', { class: 'lbl', text: tr('배율', 'Scale') }), r, rv, presets),
    el('div', { class: 'bench-bar' }, method, mv, par));
  host.append(panel, el('div', { class: 'scroll-x', style: { marginTop: '14px' } }, table));

  // 원본: 게임 화면 한 장을 그려 둔다
  const srcC = document.createElement('canvas'); srcC.width = SCREEN_W; srcC.height = SCREEN_H;
  function buildSrc() {
    const s = srcC.getContext('2d'); s.imageSmoothingEnabled = false;
    Parallax.draw(s, 0, {});
    drawLevelStatic(s, ASSETS.level, 0, 0);
  }
  let srcData = null;
  function grab() { buildSrc(); srcData = srcC.getContext('2d').getImageData(0, 0, SCREEN_W, SCREEN_H).data; }

  // 표: 흔한 화면 크기마다 정수 배율과 남는 띠
  const DISPLAYS = [[1280, 720, 'HD 720p'], [1280, 800, 'Steam Deck'], [1920, 1080, 'Full HD 1080p'], [2560, 1440, 'QHD 1440p'], [3840, 2160, '4K 2160p']];
  table.append(el('thead', null, el('tr', null, ...[tr('화면', 'Display'), tr('꽉 채우는 배율', 'Fill scale'), tr('정수 배율', 'Integer scale'), tr('게임 화면', 'Game image'), tr('남는 띠 (좌우 · 위아래)', 'Bars (sides · top/bottom)')].map((h) => el('th', { text: h })))));
  const tb = el('tbody');
  for (const [W, H, name] of DISPLAYS) {
    const fit = Math.min(W / 256, H / 192), n = Math.floor(fit);
    tb.append(el('tr', null, el('td', { text: name + ' (' + W + '×' + H + ')' }), el('td', { class: 'mono', text: fit.toFixed(3).replace(/\.?0+$/, '') + '×' }),
      el('td', { class: 'mono', text: n + '×' }), el('td', { class: 'mono', text: 256 * n + '×' + 192 * n }), el('td', { class: 'mono', text: (W - 256 * n) / 2 + ' · ' + (H - 192 * n) / 2 + ' px' })));
  }
  table.append(tb);

  function sync() {
    const sx = st.s * (st.par ? 8 / 7 : 1);
    rv.textContent = st.s.toFixed(3).replace(/\.?0+$/, '') + '×';
    const intX = Math.abs(sx - Math.round(sx)) < 1e-9, intY = Math.abs(st.s - Math.round(st.s)) < 1e-9;
    if (st.smooth) info.textContent = tr('보간: 이웃 픽셀의 색을 섞어서 칠한다. 흔들림은 없지만 테두리가 번진다.', 'Interpolation blends neighboring colors. No shimmer, but edges blur.');
    else if (intX && intY) info.textContent = tr('정수 배율: 원래 픽셀 하나가 정확히 ' + Math.round(sx) + '×' + Math.round(st.s) + ' 화면 픽셀이 된다. 스크롤해도 모양이 그대로다.', 'Integer scale: every original pixel becomes exactly ' + Math.round(sx) + '×' + Math.round(st.s) + ' screen pixels. Scrolling keeps the shapes intact.');
    else info.textContent = tr('정수가 아닌 배율: 원래 픽셀 하나가 화면 픽셀 ' + Math.floor(sx) + '개가 되기도 하고 ' + Math.ceil(sx) + '개가 되기도 한다. 위 띠에서 주황 칸이 ' + Math.ceil(sx) + '픽셀 폭, 회색 칸이 ' + Math.floor(sx) + '픽셀 폭인 열이다.', 'Non-integer scale: an original pixel becomes ' + Math.floor(sx) + ' screen pixels in some columns and ' + Math.ceil(sx) + ' in others. In the strip above, orange columns are ' + Math.ceil(sx) + ' pixels wide and gray ones ' + Math.floor(sx) + '.');
  }
  function draw() {
    if (!srcData) grab();
    const dpr = window.devicePixelRatio || 1;
    const cssW = view.clientWidth || 600, cssH = 260;
    const W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
    if (view.width !== W || view.height !== H) { view.width = W; view.height = H; }
    const ctx = view.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const sx = st.s * (st.par ? 8 / 7 : 1), sy = st.s;
    const cw = Math.min(SCREEN_W - 1, Math.ceil(W / sx)), ch = Math.min(SCREEN_H, Math.ceil(H / sy));
    const y0 = clamp(150 - Math.floor(ch * 0.62), 0, SCREEN_H - ch);
    const ox = Math.floor(st.off) % Math.max(1, SCREEN_W - cw);
    if (st.smooth) {
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(srcC, ox + (st.off % 1), y0, cw, ch, 0, 0, cw * sx, ch * sy);
    } else {
      // 가장 가까운 픽셀: 원래 픽셀 (i, j)가 덮는 화면 픽셀 범위를 직접 계산해서 칠한다
      const sub = (st.off % 1) * sx;
      for (let j = 0; j < ch; j++) {
        const dy0 = Math.floor(j * sy), dy1 = Math.floor((j + 1) * sy);
        for (let i = 0; i <= cw; i++) {
          const dx0 = Math.floor(i * sx - sub), dx1 = Math.floor((i + 1) * sx - sub);
          if (dx1 <= 0 || dx0 >= W) continue;
          const p = ((y0 + j) * SCREEN_W + Math.min(SCREEN_W - 1, ox + i)) * 4;
          ctx.fillStyle = 'rgb(' + srcData[p] + ',' + srcData[p + 1] + ',' + srcData[p + 2] + ')';
          ctx.fillRect(dx0, dy0, dx1 - dx0, dy1 - dy0);
        }
      }
    }
    // 열마다 화면 픽셀 몇 개를 차지하는지
    const sW = Math.round((strip.clientWidth || 600) * dpr), sH = Math.round(34 * dpr);
    if (strip.width !== sW || strip.height !== sH) { strip.width = sW; strip.height = sH; }
    const g = strip.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = cssVar('--bezel'); g.fillRect(0, 0, sW, sH);
    if (!st.smooth) {
      const sub = (st.off % 1) * sx;
      g.font = '600 ' + Math.round(11 * dpr) + 'px ' + cssVar('--font-mono');
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i <= cw; i++) {
        const dx0 = Math.floor(i * sx - sub), dx1 = Math.floor((i + 1) * sx - sub), w = dx1 - dx0;
        if (dx1 <= 0 || dx0 >= sW) continue;
        const wide = w > Math.floor(sx);
        g.fillStyle = wide ? '#F0A93A' : (i & 1 ? '#3A4646' : '#5E6B66');
        g.fillRect(dx0, 4 * dpr, w - (w > 2 ? 1 : 0), sH - 8 * dpr);
        if (w >= 9 * dpr) { g.fillStyle = wide ? '#1a1405' : '#E8EEE9'; g.fillText(String(w), dx0 + w / 2, sH / 2); }
      }
    } else {
      g.fillStyle = '#7D8B85'; g.font = Math.round(12 * dpr) + 'px ' + cssVar('--font-body'); g.textBaseline = 'middle';
      g.fillText(tr('보간에는 열 경계가 없다', 'Interpolation has no column edges'), 8 * dpr, sH / 2);
    }
  }
  const loop = new FixedLoop({ update() { st.t++; if (st.moving) st.off = (st.off + 0.125) % 4096; }, render: draw });
  sync();
  Bus.on('level', () => { srcData = null; });
  Bus.on('sheet', () => { srcData = null; });
  whenVisible(panel, () => loop.start(), () => loop.stop());
}

// ── 8.6 악보 대 녹음 ────────────────────────────────────────────
function hwRecord(host) {
  const panel = el('div', { class: 'panel stack' });
  const chart = el('div', { class: 'vchart log' });
  const wave = el('canvas', { class: 'vcanvas', style: { height: '84px' } });
  const status = el('div', { class: 'small' });
  const bakeB = el('button', { class: 'btn primary', type: 'button', text: tr('곡 굽기 (오프라인 렌더링)', 'Bake the song (offline render)') });
  const recB = el('button', { class: 'btn', type: 'button', text: tr('▶ 녹음본 재생', '▶ Play the recording'), disabled: true });
  const scoreB = el('button', { class: 'btn', type: 'button', text: tr('▶ 악보로 재생', '▶ Play from the score') });
  const stopB = el('button', { class: 'btn', type: 'button', text: tr('■ 정지', '■ Stop') });
  let baked = null, srcNode = null;
  panel.append(el('div', { class: 'label', text: tr('같은 곡을 저장하는 데 드는 크기 (로그 눈금: 한 칸이 10배)', 'Bytes needed to store the same song (log scale: each step is 10×)') }), chart, status,
    el('div', { class: 'row' }, bakeB, recB, scoreB, stopB), wave, soundOffNote());
  host.append(panel);

  function songStats() {
    const rows = SONG.order.reduce((n, k) => n + SONG.patterns[k][0].length, 0);
    const seconds = (rows * SONG.speed) / 60;
    const pats = Object.keys(SONG.patterns).length;
    const score = pats * 4 * 32 + SONG.order.length + 1;
    return { seconds, pats, score };
  }
  function render() {
    const { seconds, pats, score } = songStats();
    const items = [
      { label: tr('악보 (패턴 ' + pats + '개 × 4채널 × 32행)', 'Score (' + pats + ' patterns × 4 channels × 32 rows)'), bytes: score, hl: true },
      { label: tr('OGG, 128kbps (대략)', 'OGG at 128 kbps (approx.)'), bytes: seconds * 16000 },
      { label: tr('WAV, 44.1kHz 16비트 모노', 'WAV, 44.1 kHz 16-bit mono'), bytes: seconds * 44100 * 2 },
      { label: tr('WAV, 48kHz 16비트 스테레오', 'WAV, 48 kHz 16-bit stereo'), bytes: seconds * 48000 * 4 },
    ];
    const lo = 100, hi = 1e7, pos = (b) => (Math.log10(Math.max(lo, b)) - 2) / (Math.log10(hi) - 2);
    chart.innerHTML = '';
    for (const it of items) {
      const track = el('div', { class: 'track', tabindex: '0', title: it.label + ': ' + fmtInt(it.bytes) + ' B' }, el('i', { class: 'fill', style: { width: Math.max(0.6, pos(it.bytes) * 100) + '%' } }));
      chart.append(el('span', { class: 'lab', text: it.label }), track, el('span', { class: 'val', text: fmtBytes(it.bytes) }));
    }
    const axis = el('div', { class: 'vaxis', 'aria-hidden': 'true' });
    ['100 B', '1 KB', '10 KB', '100 KB', '1 MB', '10 MB'].forEach((t, i) => axis.append(el('span', { style: { left: (i / 5) * 100 + '%' }, text: t })));
    chart.append(el('span'), axis, el('span'));
    const ratio = (seconds * 48000 * 4) / score;
    status.textContent = tr('곡 길이 ' + seconds.toFixed(1) + '초. 48kHz 스테레오 녹음은 악보보다 약 ' + fmtInt(ratio) + '배 크다.', 'The song is ' + seconds.toFixed(1) + ' s long. A 48 kHz stereo recording is about ' + fmtInt(ratio) + ' times larger than the score.');
  }
  function drawWave() {
    const W = wave.clientWidth || 600, H = 84;
    const g = fitCanvas(wave, W, H);
    g.fillStyle = cssVar('--bezel'); g.fillRect(0, 0, W, H);
    g.fillStyle = '#7D8B85'; g.font = '500 12px ' + cssVar('--font-body');
    if (!baked) { g.fillText(tr('굽기 전에는 파형이 없다', 'No waveform until the song is baked'), 10, H / 2 + 4); return; }
    const d = baked.buffer.getChannelData(0), per = Math.max(1, Math.floor(d.length / W));
    g.fillStyle = '#8CA6FF';
    for (let x = 0; x < W; x++) {
      let mn = 1, mx = -1;
      for (let i = x * per; i < Math.min(d.length, (x + 1) * per); i++) { const v = d[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
      const y0 = H / 2 - mx * H * 0.9, y1 = H / 2 - mn * H * 0.9;
      g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
    g.fillStyle = '#CAD5CF';
    g.fillText(tr('녹음본 ' + baked.seconds.toFixed(1) + '초 · 샘플 ' + fmtInt(baked.buffer.length) + '개 (44.1kHz 모노)', 'Recording ' + baked.seconds.toFixed(1) + ' s · ' + fmtInt(baked.buffer.length) + ' samples (44.1 kHz mono)'), 10, 16);
  }
  const stopAll = () => {
    if (srcNode) { try { srcNode.stop(); } catch (e) { /* 이미 멈춤 */ } srcNode = null; }
    AudioSys.stopMusic('hw-record');
  };
  bakeB.addEventListener('click', async () => {
    bakeB.disabled = true;
    const was = bakeB.textContent;
    bakeB.textContent = tr('굽는 중…', 'Baking…');
    try {
      const t0 = performance.now();
      baked = await renderSongOffline(SONG);
      const ms = performance.now() - t0;
      recB.disabled = false;
      bakeB.textContent = tr('다시 굽기', 'Bake again');
      status.textContent = tr(baked.seconds.toFixed(1) + '초짜리 곡을 ' + Math.round(ms) + 'ms 만에 구웠다. 같은 드라이버가 같은 레지스터 값을 써서 만든 소리다.', 'Baked ' + baked.seconds.toFixed(1) + ' s of music in ' + Math.round(ms) + ' ms, with the same driver writing the same register values.');
    } catch (e) {
      bakeB.textContent = was;
      status.textContent = tr('굽지 못했다: ', 'Could not bake: ') + e.message;
    }
    bakeB.disabled = false;
    drawWave();
  });
  recB.addEventListener('click', () => {
    if (!baked || !AudioSys.unlock()) return;
    stopAll();
    srcNode = AudioSys.ctx.createBufferSource();
    srcNode.buffer = baked.buffer;
    srcNode.connect(AudioSys.master);
    srcNode.start();
  });
  scoreB.addEventListener('click', () => { stopAll(); AudioSys.unlock(); setTimeout(() => AudioSys.playMusic(SONG, { owner: 'hw-record' }), 30); });
  stopB.addEventListener('click', stopAll);
  render(); drawWave();
  Bus.on('song', () => { render(); });
  new ResizeObserver(debounce(drawWave, 120)).observe(panel);
  whenVisible(panel, () => {}, stopAll);
}

// ── 8.7 믹싱과 덕킹 ─────────────────────────────────────────────
function hwMix(host) {
  const bench = el('div', { class: 'bench wide' });
  const tl = el('canvas', { class: 'vcanvas' });
  const stats = el('div', { class: 'readout' });
  const events = [];
  const gains = [];
  const SPAN = 5;
  const modeSeg = segButtons([['chip', tr('칩 방식: 음악 채널 빌리기', 'Chip: borrow a music channel')], ['modern', tr('요즘 방식: 믹싱과 덕킹', 'Modern: mix and duck')]], AudioSys.mixMode, (v) => { AudioSys.setMixMode(v); events.length = 0; });
  Bus.on('mix', (m) => { $$('button', modeSeg).forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0 ? 'chip' : 'modern') === m))); });
  const playB = el('button', { class: 'btn primary', type: 'button', text: tr('▶ 음악', '▶ Music') });
  const stopB = el('button', { class: 'btn', type: 'button', text: tr('■ 정지', '■ Stop') });
  playB.addEventListener('click', () => { AudioSys.unlock(); setTimeout(() => AudioSys.playMusic(SONG, { owner: 'hw-mix' }), 30); });
  stopB.addEventListener('click', () => AudioSys.stopMusic('hw-mix'));
  function fire(name) {
    if (!AudioSys.unlock() || !AudioSys.enabled) return;
    const ctx = AudioSys.ctx, now = ctx.currentTime;
    const p = SFX[name], slot = p.wave === 'noise' ? 'noise' : 'tone', len = compileSfx(p).length / 60;
    let outcome = 'play';
    if (AudioSys.mixMode === 'chip') {
      const b = AudioSys.sfxPlayer.busy[slot], pri = SFX_PRI[name] || 1;
      if (now < b.until && pri < b.pri) outcome = 'ignored';
      else if (now < b.until) {
        const prev = events.slice().reverse().find((e) => e.slot === slot && e.outcome !== 'ignored' && e.t1 > now);
        if (prev) { prev.t1 = now; prev.cut = true; }
      }
    }
    events.push({ name, slot, t0: now, t1: outcome === 'ignored' ? now : now + len, outcome, mode: AudioSys.mixMode });
    AudioSys.sfx(name);
  }
  const sfxRow = el('div', { class: 'row', style: { gap: '6px' } });
  ['jump', 'throw', 'fruit', 'hit', 'bud', 'power', 'stumble'].forEach((k) => {
    const b = el('button', { class: 'btn small', type: 'button', text: SFX_LABELS[k] });
    b.addEventListener('click', () => fire(k));
    sfxRow.append(b);
  });
  const burst = el('button', { class: 'btn small', type: 'button', text: tr('한꺼번에 6개', 'Six at once') });
  burst.addEventListener('click', () => { ['jump', 'hit', 'fruit', 'throw', 'bud', 'clink'].forEach((k, i) => setTimeout(() => fire(k), i * 70)); });
  sfxRow.append(burst);
  bench.append(el('div', { class: 'bench-bar', style: { paddingTop: '0' } }, modeSeg, playB, stopB), el('div', { class: 'bench-bar' }, sfxRow), tl, stats, soundOffNote());
  host.append(bench);

  function draw() {
    const W = tl.clientWidth || 700, H = 196;
    const g = fitCanvas(tl, W, H);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const ctx = AudioSys.ctx;
    const now = ctx ? ctx.currentTime : 0;
    const x0 = 118, xs = (t) => x0 + (W - x0 - 8) * (1 - (now - t) / SPAN);
    const lanes = [
      { y: 12, h: 46, label: tr('음악 볼륨', 'Music volume') },
      { y: 72, h: 52, label: tr('사각파 효과음', 'Square-wave SFX'), sub: tr('칩: 화음 채널', 'chip: harmony ch.') },
      { y: 136, h: 52, label: tr('노이즈 효과음', 'Noise SFX'), sub: tr('칩: 드럼 채널', 'chip: drum ch.') },
    ];
    g.font = '500 12px ' + cssVar('--font-body');
    for (const L of lanes) {
      g.fillStyle = '#151B1B'; g.fillRect(x0, L.y, W - x0 - 8, L.h);
      g.fillStyle = '#CAD5CF'; g.fillText(L.label, 8, L.y + 16);
      if (L.sub) { g.fillStyle = '#7D8B85'; g.font = '500 11px ' + cssVar('--font-body'); g.fillText(L.sub, 8, L.y + 32); g.font = '500 12px ' + cssVar('--font-body'); }
    }
    for (let s = 0; s <= SPAN; s++) { const x = xs(now - s); g.fillStyle = '#263030'; g.fillRect(x, 8, 1, H - 12); }
    // 음악 볼륨 선
    if (ctx && AudioSys.musicBus) gains.push({ t: now, v: AudioSys.musicBus.gain.value });
    while (gains.length && now - gains[0].t > SPAN + 0.2) gains.shift();
    const L0 = lanes[0];
    g.strokeStyle = '#8CA6FF'; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath();
    gains.forEach((p, i) => { const x = xs(p.t), y = L0.y + L0.h - (p.v / 1) * (L0.h - 6) - 3; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
    // 효과음 막대: 칩 방식은 겹치지 않고, 요즘 방식은 쌓인다
    while (events.length && now - events[0].t1 > SPAN) events.shift();
    for (const [i, slot] of [[1, 'tone'], [2, 'noise']]) {
      const L = lanes[i];
      const evs = events.filter((e) => e.slot === slot);
      const levels = [];
      for (const e of evs) {
        let lvl = 0;
        if (e.mode === 'modern') { while (levels[lvl] && levels[lvl] > e.t0) lvl++; levels[lvl] = e.t1; }
        const bh = e.mode === 'modern' ? 13 : 22, y = L.y + 4 + lvl * (bh + 2);
        if (y + bh > L.y + L.h) continue;
        const xa = Math.max(x0, xs(e.t0)), xb = Math.max(xa + 2, xs(Math.min(e.t1, now)));
        if (e.outcome === 'ignored') {
          g.fillStyle = '#FF6B57'; g.fillText('×', xa, L.y + L.h - 6);
          g.fillStyle = '#CAD5CF'; g.fillText(SFX_LABELS[e.name], xa + 12, L.y + L.h - 6);
          continue;
        }
        g.fillStyle = '#F0A93A';
        g.fillRect(xa, y, Math.max(2, xb - xa), bh);
        const lab = SFX_LABELS[e.name] + (e.cut ? ' ✂' : '');
        if (g.measureText(lab).width + 8 <= xb - xa && bh >= 12) { g.fillStyle = '#1a1405'; g.fillText(lab, xa + 4, y + bh - (bh > 14 ? 6 : 2)); }
      }
    }
    const recent = events.filter((e) => now - e.t0 < SPAN);
    const ignored = recent.filter((e) => e.outcome === 'ignored').length, cut = recent.filter((e) => e.cut).length;
    let maxTogether = 0;
    for (const e of recent) { if (e.outcome === 'ignored') continue; const n = recent.filter((o) => o.outcome !== 'ignored' && o.t0 <= e.t0 && o.t1 > e.t0).length; maxTogether = Math.max(maxTogether, n); }
    stats.textContent = tr('최근 5초: 동시에 울린 효과음 최대 ' + maxTogether + '개 · 다른 효과음에 끊긴 것 ' + cut + '개 (✂) · 우선순위에 밀려 무시된 것 ' + ignored + '개 (×)',
      'Last 5 s: up to ' + maxTogether + ' effects at once · ' + cut + ' cut off by another effect (✂) · ' + ignored + ' dropped for lower priority (×)');
  }
  let raf = 0;
  const tick = () => { raf = requestAnimationFrame(tick); draw(); };
  draw();
  whenVisible(bench, () => { raf = requestAnimationFrame(tick); }, () => { cancelAnimationFrame(raf); AudioSys.stopMusic('hw-mix'); });
}

// ── 8.8 프레임 예산과 처리 지연 ─────────────────────────────────
function hwSlowdown(host) {
  const BASE = 30000, PER = 2400;                       // 설명을 위한 예시 값 (사이클)
  const CPU = { ntsc: 3579545, pal: 3546893 };
  const st = { n: 6, std: 'ntsc', vb: 0 };
  const bench = el('div', { class: 'bench wide' });
  const mk = () => { const c = el('canvas', { width: SCREEN_W, height: 56, class: 'pix' }); const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return { c, g }; };
  const A = Object.assign(mk(), { label: el('div', { class: 'readout' }) });
  const B = Object.assign(mk(), { label: el('div', { class: 'readout' }) });
  const meter = el('div', { class: 'budget' });
  const verdict = el('div', { class: 'small' });
  const nR = el('input', { type: 'range', min: '0', max: '30', step: '1', value: String(st.n), id: 'slow-n', 'aria-label': tr('적의 수', 'Enemies') });
  const nV = el('span', { class: 'readout' });
  nR.addEventListener('input', () => { st.n = +nR.value; reset(); });
  const stdSeg = segButtons([['ntsc', 'NTSC 60Hz'], ['pal', tr('PAL 50Hz (유럽)', 'PAL 50 Hz (Europe)')]], st.std, (v) => { st.std = v; loop.setHz(v === 'pal' ? 50 : 60); reset(); });
  bench.append(
    el('div', { class: 'label', text: tr('그때: 업데이트 한 번 = 화면 한 장 (프레임 단위로 이동)', 'Then: one update per finished frame (moves per frame)') }), el('div', { class: 'screen', style: { cursor: 'default' } }, A.c), A.label,
    el('div', { class: 'label', style: { marginTop: '10px' }, text: tr('지금: 고정 스텝 루프 (실제 시간 기준)', 'Now: fixed-step loop (driven by real time)') }), el('div', { class: 'screen', style: { cursor: 'default' } }, B.c), B.label,
    el('div', { class: 'label', style: { marginTop: '12px' }, text: tr('한 프레임에 할 일 (사이클)', 'Work per frame (cycles)') }), meter, verdict,
    el('div', { class: 'bench-bar' }, el('span', { class: 'lbl', text: tr('적', 'Enemies') }), nR, nV, stdSeg));
  host.append(bench);

  const worldA = { hx: 0, t: 0, bees: [] }, worldB = { hx: 0, t: 0, bees: [] };
  let snapB = null, accB = 0;
  const hz = () => (st.std === 'pal' ? 50 : 60);
  const budget = () => CPU[st.std] / hz();
  const work = () => BASE + PER * st.n;
  const k = () => Math.max(1, Math.ceil(work() / budget()));
  function seed(w) {
    w.hx = 0; w.t = 0;
    w.bees = Array.from({ length: st.n }, (_, i) => ({ x: (i * 61 + 90) % 300, y: 6 + ((i * 23) % 26), ph: i * 7 }));
  }
  function step(w) {
    w.t++; w.hx = (w.hx + 1.25) % (SCREEN_W + 32);
    for (const b of w.bees) { b.x -= 0.9; if (b.x < -20) b.x += SCREEN_W + 40; }
  }
  const snapshot = (w) => ({ hx: w.hx, t: w.t, bees: w.bees.map((b) => ({ x: b.x, y: b.y, ph: b.ph })) });
  function reset() {
    seed(worldA); seed(worldB); snapB = snapshot(worldB); accB = 0; st.vb = 0;
    nV.textContent = String(st.n);
    renderMeter();
  }
  function renderMeter() {
    const bud = budget(), w = work(), kk = k(), span = Math.max(3, kk + 1) * bud;
    meter.innerHTML = '';
    const seg = (v, cls, label) => el('i', { class: cls, style: { width: (v / span) * 100 + '%' }, title: label });
    const bar = el('div', { class: 'budget-bar' }, seg(BASE, 'b1', tr('기본 일 ', 'Base work ') + fmtInt(BASE)), seg(PER * st.n, 'b2', tr('적 ', 'Enemies ') + fmtInt(PER * st.n)));
    for (let i = 1; i * bud <= span + 1; i++) {
      const at = ((i * bud) / span) * 100;
      bar.append(el('b', { class: at > 85 ? 'end' : '', style: { left: at + '%' } }, el('span', { text: tr('화면 ' + i + '장', i + (i === 1 ? ' frame' : ' frames')) })));
    }
    meter.append(bar, el('div', { class: 'legend' },
      el('span', null, el('i', { style: { background: 'var(--viz-1)' } }), tr('기본 일 ', 'Base work ') + fmtInt(BASE)),
      el('span', null, el('i', { style: { background: 'var(--viz-2)' } }), tr('적 ' + st.n + '마리 × ' + fmtInt(PER), st.n + ' enemies × ' + fmtInt(PER))),
      el('span', null, tr('한 화면 예산 ', 'Budget per frame ') + fmtInt(bud) + ' (' + (CPU[st.std] / 1e6).toFixed(2) + ' MHz ÷ ' + hz() + ')')));
    const fps = hz() / kk, speed = Math.round((fps / 60) * 100);
    verdict.innerHTML = '';
    verdict.append(kk === 1
      ? el('span', { class: 'status good' }, '✓ ', tr('예산 안: 화면마다 한 번씩 갱신한다.', 'Within budget: one update per frame.'))
      : el('span', { class: 'status bad' }, '⚠ ', tr('예산 초과: 화면 ' + kk + '장에 한 번만 갱신한다.', 'Over budget: one update every ' + kk + ' frames.')));
    A.label.textContent = tr('업데이트 ' + Math.round(fps) + '회/초 · 게임 속도 ' + speed + '%', Math.round(fps) + ' updates/s · game speed ' + speed + '%');
    B.label.textContent = tr('화면 ' + Math.round(fps) + 'fps · 게임 속도 100%', Math.round(fps) + ' fps on screen · game speed 100%');
  }
  function drawLane(g, w) {
    g.fillStyle = '#55AAFF'; g.fillRect(0, 0, SCREEN_W, 56);
    g.fillStyle = '#AA5500'; g.fillRect(0, 46, SCREEN_W, 10);
    g.fillStyle = '#00AA00'; g.fillRect(0, 44, SCREEN_W, 3);
    for (const b of w.bees) drawSprite(g, SHEETS.enemy, animFrame('bee', w.t + b.ph), b.x, b.y + Math.round(Math.sin((w.t + b.ph * 5) / 14) * 3) - 4);
    drawSprite(g, SHEETS.hero, animFrame('run', w.t), w.hx - 16, 30);
  }
  const loop = new FixedLoop({
    hz: 60,
    update() {
      st.vb++;
      const kk = k();
      if (st.vb % kk === 0) step(worldA);
      accB += 1 / hz();
      while (accB >= 1 / 60) { step(worldB); accB -= 1 / 60; }
      if (st.vb % kk === 0) snapB = snapshot(worldB);
    },
    render() { drawLane(A.g, worldA); drawLane(B.g, snapB || worldB); },
  });
  reset();
  drawLane(A.g, worldA); drawLane(B.g, worldB);
  whenVisible(bench, () => loop.start(), () => loop.stop());
}

MOUNTS.hardware = (root) => {
  hwVram($('#hw-vram', root));
  hwRaster($('#hw-raster', root));
  hwScale($('#hw-scale', root));
  hwRecord($('#hw-record', root));
  hwMix($('#hw-mix', root));
  hwSlowdown($('#hw-slow', root));
};
