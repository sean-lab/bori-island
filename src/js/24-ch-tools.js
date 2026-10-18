// ───────────────────────────────────────────────────────────────
// 4장 · 리소스 저작 도구
// ───────────────────────────────────────────────────────────────
function segButtons(items, cur, onPick, cls = 'btn small') {
  const s = el('div', { class: 'seg' });
  items.forEach(([v, label]) => {
    const b = el('button', { class: cls, type: 'button', text: label, 'aria-pressed': String(v === cur) });
    b.addEventListener('click', () => { $$('button', s).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); onPick(v); });
    s.append(b);
  });
  return s;
}

// ── 4.2 픽셀 에디터 ─────────────────────────────────────────────
function pixelEditor(host) {
  const st = { sheet: 'hero', frame: 0, color: 6, tool: 'pen', mirror: false, onion: false, hover: null, drawing: false, last: null };
  const undo = [], redo = [];
  const sheet = () => SHEETS[st.sheet];
  const data = () => sheet().data[st.frame];

  const canvas = el('canvas', { class: 'editor-canvas', 'aria-label': tr('픽셀 편집 격자', 'Pixel editing grid') });
  const toolbar = el('div', { class: 'toolbar' });
  const toolBtns = {};
  [['pen', '✎', tr('연필', 'Pencil')], ['erase', '⌫', tr('지우개 (0번 = 투명)', 'Eraser (0 = transparent)')], ['fill', '▧', tr('채우기', 'Fill')], ['pick', '◉', tr('스포이드', 'Eyedropper')]].forEach(([k, ic, label]) => {
    const b = el('button', { class: 'tool', type: 'button', title: label, 'aria-label': label, 'aria-pressed': String(k === st.tool), text: ic });
    b.addEventListener('click', () => setTool(k));
    toolBtns[k] = b; toolbar.append(b);
  });
  toolbar.append(el('span', { style: { width: '8px' } }));
  const mirrorB = el('button', { class: 'tool', type: 'button', title: tr('좌우 대칭 그리기', 'Mirror drawing'), 'aria-label': tr('좌우 대칭 그리기', 'Mirror drawing'), 'aria-pressed': 'false', text: '⇋' });
  mirrorB.addEventListener('click', () => { st.mirror = !st.mirror; mirrorB.setAttribute('aria-pressed', String(st.mirror)); draw(); });
  const onionB = el('button', { class: 'tool', type: 'button', title: tr('이전 프레임 겹쳐 보기', 'Onion skin'), 'aria-label': tr('이전 프레임 겹쳐 보기', 'Onion skin'), 'aria-pressed': 'false', text: '◐' });
  onionB.addEventListener('click', () => { st.onion = !st.onion; onionB.setAttribute('aria-pressed', String(st.onion)); draw(); });
  const undoB = el('button', { class: 'tool', type: 'button', title: tr('되돌리기', 'Undo'), 'aria-label': tr('되돌리기', 'Undo'), text: '↶' });
  const redoB = el('button', { class: 'tool', type: 'button', title: tr('다시 하기', 'Redo'), 'aria-label': tr('다시 하기', 'Redo'), text: '↷' });
  undoB.addEventListener('click', () => history(undo, redo));
  redoB.addEventListener('click', () => history(redo, undo));
  toolbar.append(mirrorB, onionB, el('span', { style: { width: '8px' } }), undoB, redoB);

  const sheetSel = el('select', { id: 'px-sheet', 'aria-label': tr('시트 고르기', 'Choose a sheet') });
  Object.keys(SHEETS).forEach((k) => sheetSel.append(el('option', { value: k, text: SHEETS[k].label + ' (' + k + ')' })));
  sheetSel.addEventListener('change', () => { st.sheet = sheetSel.value; st.frame = 0; buildFrames(); draw(); });
  const frames = el('div', { class: 'frames' });
  const swatches = el('div', { class: 'swatches' });
  const colorInfo = el('div', { class: 'readout' });
  SPR_PAL.forEach((hx, i) => {
    const b = el('button', { class: 'swatch' + (hx ? '' : ' clear'), type: 'button', title: (HEX_CHARS[i] === '.' ? tr('0 투명', '0 transparent') : HEX_CHARS[i] + ' ' + hx), 'aria-label': tr('색 ', 'Color ') + i, style: hx ? { background: hx } : {} });
    b.addEventListener('click', () => { st.color = i; if (st.tool === 'erase' || st.tool === 'pick') setTool('pen'); syncSwatches(); });
    swatches.append(b);
  });
  const preview = el('canvas', { class: 'vcanvas' });
  const dataTA = el('textarea', { readonly: true, rows: '18', id: 'px-data', 'aria-label': tr('프레임 데이터', 'Frame data') });
  const copyB = el('button', { class: 'btn small', type: 'button', text: tr('복사', 'Copy') });
  copyB.addEventListener('click', () => copyText(dataTA.value, copyB));
  const dataPanel = el('div', { class: 'data-panel stack', hidden: true }, el('div', { class: 'row' }, el('span', { class: 'label', text: tr('이 프레임의 데이터 (소스 코드에 그대로 쓰는 형식)', 'This frame\'s data (in the same format as the source code)') }), copyB), dataTA);
  const dataB = el('button', { class: 'btn small', type: 'button', 'aria-pressed': 'false', text: tr('데이터 보기', 'Show data') });
  dataB.addEventListener('click', () => { dataPanel.hidden = !dataPanel.hidden; dataB.setAttribute('aria-pressed', String(!dataPanel.hidden)); syncData(); });
  const resetFrameB = confirmButton(tr('이 프레임 되돌리기', 'Reset this frame'), tr('한 번 더 누르기', 'Press again'), () => { pushUndo(); sheet().data[st.frame] = new Uint8Array(sheet().defaults[st.frame]); commit(); });
  const resetSheetB = confirmButton(tr('시트 전체 되돌리기', 'Reset the whole sheet'), tr('한 번 더 누르기', 'Press again'), () => { const s = sheet(); s.data = s.defaults.map((d) => new Uint8Array(d)); undo.length = 0; redo.length = 0; commit(); });

  const left = el('div', { class: 'stack' }, toolbar, canvas, el('div', { class: 'label', text: tr('프레임', 'Frames') }), frames);
  const right = el('div', { class: 'stack' },
    el('div', { class: 'ctl' }, el('span', { class: 'lbl', text: tr('시트', 'Sheet') }), sheetSel),
    el('div', { class: 'label', text: tr('팔레트 (스프라이트용 16색)', 'Palette (16 sprite colors)') }), swatches, colorInfo,
    el('div', { class: 'label', text: tr('움직임 미리보기', 'Animation preview') }), preview,
    el('div', { class: 'row' }, dataB, resetFrameB, resetSheetB));
  const panel = el('div', { class: 'panel stack' }, el('div', { class: 'tool-grid' }, left, right), dataPanel);
  host.append(panel);

  function setTool(k) { st.tool = k; for (const t in toolBtns) toolBtns[t].setAttribute('aria-pressed', String(t === k)); canvas.style.cursor = k === 'pick' ? 'copy' : 'crosshair'; }
  function syncSwatches() {
    $$('.swatch', swatches).forEach((b, i) => b.setAttribute('aria-pressed', String(i === st.color)));
    colorInfo.textContent = tr('고른 번호 ', 'Selected: ') + (st.color ? HEX_CHARS[st.color] : '0') + (SPR_PAL[st.color] ? ' · ' + SPR_PAL[st.color] : tr(' · 투명', ' · transparent'));
  }
  function buildFrames() {
    frames.innerHTML = '';
    const s = sheet();
    s.keys.forEach((k, i) => {
      const c = el('canvas', { width: 16, height: 16 });
      const b = el('button', { class: 'frame-btn' + (s.isModified(i) ? ' mod' : ''), type: 'button', title: k, 'aria-label': tr('프레임 ', 'Frame ') + k, 'aria-pressed': String(i === st.frame) }, c);
      b.addEventListener('click', () => { st.frame = i; buildFrames(); draw(); syncData(); });
      frames.append(b);
      const cx = c.getContext('2d'); cx.drawImage(s.canvas(i), 0, 0);
    });
  }
  function syncData() {
    if (dataPanel.hidden) return;
    const s = sheet();
    const rows = encodeRows(data());
    dataTA.value = '// ' + s.name + '.' + s.keys[st.frame] + tr(' — 16줄 × 16글자, \'.\' = 0번(투명), 1~f = 팔레트 번호\n', ' · 16 rows × 16 characters, \'.\' = 0 (transparent), 1–f = palette number\n') +
      s.keys[st.frame] + ': [\n' + rows.map((r) => "  '" + r + "',").join('\n') + '\n],\n' + tr('// 4비트 × 256칸 = 128바이트', '// 4 bits × 256 cells = 128 bytes');
  }
  function cellSize() {
    const avail = Math.max(200, (left.clientWidth || 400));
    return clamp(Math.floor(avail / 16), 12, 28);
  }
  function draw() {
    const cs = cellSize(), S = cs * 16;
    const ctx = fitCanvas(canvas, S, S);
    canvas.style.width = S + 'px';
    const d = data(), s = sheet();
    checker(ctx, 0, 0, S, S, cs / 2);
    if (st.onion) {
      const pi = (st.frame - 1 + s.keys.length) % s.keys.length, pd = s.data[pi];
      ctx.globalAlpha = 0.3;
      for (let i = 0; i < 256; i++) if (pd[i]) { ctx.fillStyle = SPR_PAL[pd[i]]; ctx.fillRect((i % 16) * cs, Math.floor(i / 16) * cs, cs, cs); }
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < 256; i++) if (d[i]) { ctx.fillStyle = SPR_PAL[d[i]]; ctx.fillRect((i % 16) * cs, Math.floor(i / 16) * cs, cs, cs); }
    ctx.strokeStyle = 'rgba(0,0,0,0.13)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 16; i++) { if (i === 8) continue; ctx.moveTo(i * cs + 0.5, 0); ctx.lineTo(i * cs + 0.5, S); ctx.moveTo(0, i * cs + 0.5); ctx.lineTo(S, i * cs + 0.5); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(8 * cs, 0); ctx.lineTo(8 * cs, S); ctx.moveTo(0, 8 * cs); ctx.lineTo(S, 8 * cs); ctx.stroke();
    if (st.mirror) { ctx.strokeStyle = 'rgba(191,55,32,0.8)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(8 * cs, 0); ctx.lineTo(8 * cs, S); ctx.stroke(); ctx.setLineDash([]); }
    if (st.hover) {
      const [x, y] = st.hover;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(x * cs + 1, y * cs + 1, cs - 2, cs - 2);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(x * cs + 2.5, y * cs + 2.5, cs - 5, cs - 5);
      if (st.mirror) { ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeRect((15 - x) * cs + 1, y * cs + 1, cs - 2, cs - 2); }
    }
  }
  function cellAt(e) {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * 16), y = Math.floor(((e.clientY - r.top) / r.height) * 16);
    return x >= 0 && x < 16 && y >= 0 && y < 16 ? [x, y] : null;
  }
  function pushUndo() { undo.push({ sheet: st.sheet, frame: st.frame, data: new Uint8Array(data()) }); if (undo.length > 80) undo.shift(); redo.length = 0; }
  function history(from, to) {
    const h = from.pop();
    if (!h) return;
    const s = SHEETS[h.sheet];
    to.push({ sheet: h.sheet, frame: h.frame, data: new Uint8Array(s.data[h.frame]) });
    s.data[h.frame] = h.data;
    if (st.sheet !== h.sheet) { st.sheet = h.sheet; sheetSel.value = h.sheet; }
    st.frame = h.frame;
    commit();
  }
  let pending = 0;
  function touchSoon() { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; sheet().touch(); }); }
  function commit() { sheet().touch(); buildFrames(); draw(); syncData(); saveSpritesSoon(); }
  function paint(x, y) {
    const d = data(), v = st.tool === 'erase' ? 0 : st.color;
    d[y * 16 + x] = v;
    if (st.mirror) d[y * 16 + (15 - x)] = v;
    touchSoon();
  }
  function line(a, b) {
    let [x0, y0] = a; const [x1, y1] = b;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) { paint(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  function flood(x, y) {
    const d = data(), from = d[y * 16 + x], to = st.color;
    if (from === to) return;
    const q = [[x, y]];
    while (q.length) {
      const [cx, cy] = q.pop();
      if (cx < 0 || cy < 0 || cx > 15 || cy > 15 || d[cy * 16 + cx] !== from) continue;
      d[cy * 16 + cx] = to;
      q.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }
  canvas.addEventListener('pointerdown', (e) => {
    const c = cellAt(e);
    if (!c) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ }
    if (st.tool === 'pick') { st.color = data()[c[1] * 16 + c[0]]; setTool('pen'); syncSwatches(); return; }
    pushUndo();
    if (st.tool === 'fill') { flood(c[0], c[1]); commit(); return; }
    st.drawing = true; st.last = c;
    paint(c[0], c[1]); draw();
  });
  canvas.addEventListener('pointermove', (e) => {
    const c = cellAt(e);
    st.hover = c;
    if (st.drawing && c) { line(st.last, c); st.last = c; }
    draw();
  });
  const end = () => { if (st.drawing) { st.drawing = false; commit(); } };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { st.hover = null; draw(); });

  // 움직임 미리보기
  let t = 0;
  function drawPreview() {
    const W = preview.clientWidth || 240, H = 110;
    const p = fitCanvas(preview, W, H);
    p.fillStyle = '#55AAFF'; p.fillRect(0, 0, W, H);
    p.fillStyle = '#AA5500'; p.fillRect(0, H - 18, W, 18);
    p.fillStyle = '#00AA00'; p.fillRect(0, H - 18, W, 4);
    p.imageSmoothingEnabled = false;
    const s = sheet(), k = s.keys[st.frame], sc = 4;
    let key = k;
    if (s.name === 'hero') key = animFrame(['run1', 'run2', 'run3', 'run4'].includes(k) ? 'run' : k === 'idle' || k === 'blink' ? 'idle' : 'run', t);
    else if (s.name === 'enemy') key = k.startsWith('snail') ? animFrame('snail', t) : k.startsWith('bee') ? animFrame('bee', t) : (t >> 5) & 1 ? 'frog2' : 'frog1';
    const bob = s.name === 'item' ? Math.round(Math.sin(t / 12) * 2) : 0;
    p.drawImage(s.canvas(key), 12, H - 18 - 16 * sc + bob, 16 * sc, 16 * sc);
    p.drawImage(s.canvas(k), W - 16 * 2 - 14, H - 18 - 32, 32, 32);
    p.font = '600 10px ' + cssVar('--font-mono'); p.fillStyle = '#000';
    p.fillText('1×', W - 34, 14); p.fillText(s.name === 'hero' ? tr('애니메이션', 'Animated') : tr('미리보기', 'Preview'), 12, 14);
  }
  const loop = new FixedLoop({ update: () => { t++; }, render: drawPreview });
  whenVisible(panel, () => loop.start(), () => loop.stop());
  new ResizeObserver(debounce(draw, 80)).observe(left);
  Bus.on('reset-all', () => { buildFrames(); draw(); syncData(); });
  setTool('pen'); syncSwatches(); buildFrames(); draw();
}

// ── 4.3 오토타일 ────────────────────────────────────────────────
function autotileDemo(host) {
  const rows = ['............', '.....##.....', '....####..#.', '.########.##', '###.########', '############'];
  const lv = Level.fromText(rows.join('\n'));
  lv.ents = [];
  const Z = 2, W = lv.w * TILE * Z, H = lv.h * TILE * Z;
  const bench = el('div', { class: 'bench wide' });
  const c = el('canvas', { width: W, height: H, class: 'pix' });
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const ref = el('canvas', { width: 16 * 18, height: 30, class: 'pix', style: { marginTop: '10px' } });
  const rctx = ref.getContext('2d'); rctx.imageSmoothingEnabled = false;
  const showNum = { v: true };
  const nb = el('button', { class: 'btn small', type: 'button', 'aria-pressed': 'true', text: tr('마스크 번호', 'Mask numbers') });
  nb.addEventListener('click', () => { showNum.v = !showNum.v; nb.setAttribute('aria-pressed', String(showNum.v)); render(); });
  const clr = el('button', { class: 'btn small', type: 'button', text: tr('모두 지우기', 'Clear all') });
  clr.addEventListener('click', () => { lv.tiles.fill(0); render(); });
  bench.append(el('div', { class: 'screen', style: { cursor: 'crosshair' } }, c),
    el('div', { class: 'bench-bar' }, el('span', { class: 'legend' }, el('span', { text: tr('위 = 1', 'up = 1') }), el('span', { text: tr('오른쪽 = 2', 'right = 2') }), el('span', { text: tr('아래 = 4', 'down = 4') }), el('span', { text: tr('왼쪽 = 8', 'left = 8') })), el('span', { class: 'sp' }), nb, clr),
    el('div', { class: 'label', style: { marginTop: '8px' }, text: tr('16가지 모양 (0~15)', 'The 16 shapes (0–15)') }), ref);
  host.append(bench);
  c.addEventListener('pointerdown', (e) => {
    const r = c.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * lv.w), y = Math.floor(((e.clientY - r.top) / r.height) * lv.h);
    if (x < 0 || y < 0 || x >= lv.w || y >= lv.h) return;
    lv.tiles[y * lv.w + x] = lv.tiles[y * lv.w + x] === T.GROUND ? 0 : T.GROUND;
    render();
  });
  function render() {
    ctx.fillStyle = '#55AAFF'; ctx.fillRect(0, 0, W, H);
    const S = TILE * Z;
    for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) {
      const cv = TileGfx.forCell(lv, x, y, 0);
      if (cv) ctx.drawImage(cv, x * S, y * S, S, S);
      if (showNum.v && lv.tiles[y * lv.w + x] === T.GROUND) {
        const m = autoMask(lv, x, y, T.GROUND);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x * S + 2, y * S + S - 12, m > 9 ? 14 : 8, 11);
        drawText(ctx, String(m), x * S + 3, y * S + S - 10, { color: '#FFFF55', shadow: false });
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    for (let x = 0; x <= W; x += S) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (let y = 0; y <= H; y += S) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();
    rctx.fillStyle = '#000'; rctx.fillRect(0, 0, ref.width, ref.height);
    for (let m = 0; m < 16; m++) {
      rctx.fillStyle = '#55AAFF'; rctx.fillRect(m * 18 + 1, 1, 16, 16);
      rctx.drawImage(TileGfx.get('g' + m + ':0', () => groundBuf(m, 0)), m * 18 + 1, 1);
      drawText(rctx, String(m), m * 18 + (m > 9 ? 3 : 6), 20, { color: '#CAD5CF', shadow: false });
    }
  }
  render();
}

// ── 4.4 레벨 에디터 ─────────────────────────────────────────────
const saveLevelSoon = debounce(() => { const L = ASSETS.level; const text = L.toText(); if (text === DEFAULT_LEVEL_TEXT) Store.del('level'); else Store.set('level', text); }, 400);
function levelChanged() { ASSETS.level.version++; Bus.emit('level', ASSETS.level); saveLevelSoon(); }

function levelEditor(host) {
  const VW = 24;                                        // 편집 화면에 보이는 열 수
  const st = { brush: { type: 'tile', id: T.GROUND }, mode: 'paint', camX: 0, hover: null, down: false, lastCell: null, testing: false };
  const L = () => ASSETS.level;
  const bench = el('div', { class: 'bench wide' });
  const c = el('canvas', { width: VW * TILE, height: SCREEN_H, class: 'pix' });
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const screen = el('div', { class: 'screen', style: { cursor: 'crosshair' }, tabindex: '0', 'aria-label': tr('레벨 편집 화면', 'Level editing screen') }, c);
  const mini = el('canvas', { width: 192, height: 12, class: 'pix', style: { height: '34px', marginTop: '8px', cursor: 'pointer', borderRadius: '4px' } });
  const mctx = mini.getContext('2d');
  const info = el('span', { class: 'readout' });
  const testHost = el('div', { hidden: true });
  const pal = el('div', { class: 'tile-pal' });
  const palBtns = [];
  const addPal = (brush, canvasSrc, label) => {
    const cv = el('canvas', { width: 16, height: brush.c === 'G' ? 32 : 16 });
    const cx = cv.getContext('2d');
    if (brush.c === 'G') { cx.drawImage(SHEETS.prop.canvas('goalTop'), 0, 0); cx.drawImage(SHEETS.prop.canvas('goalBottom'), 0, 16); }
    else cx.drawImage(canvasSrc, 0, 0);
    const b = el('button', { type: 'button', title: label, 'aria-label': label, 'aria-pressed': 'false' }, cv, el('span', { class: 'tip', text: label }));
    b.addEventListener('click', () => { st.brush = brush; st.mode = 'paint'; modeSeg.querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-pressed', String(i === 0))); syncPal(); });
    palBtns.push({ b, brush });
    pal.append(b);
  };
  [T.GROUND, T.BLOCK, T.LOG, T.WATER, T.THORN, T.BUSH, T.FLOWER, T.SIGN].forEach((id) => addPal({ type: 'tile', id }, TileGfx.icon(id), TILE_INFO[id].name));
  Object.keys(ENT_DEFS).forEach((ch) => { const d = ENT_DEFS[ch]; addPal({ type: 'ent', c: ch }, SHEETS[d.sheet].canvas(d.kind === 'bud' ? 'budClosed' : d.key), d.name.replace('꽃봉오리', '봉오리')); });
  function syncPal() { palBtns.forEach(({ b, brush }) => b.setAttribute('aria-pressed', String(st.mode === 'paint' && brush.type === st.brush.type && brush.id === st.brush.id && brush.c === st.brush.c))); }
  const modeSeg = segButtons([['paint', tr('그리기', 'Paint')], ['erase', tr('지우기', 'Erase')]], 'paint', (v) => { st.mode = v; syncPal(); });
  const pos = el('input', { type: 'range', min: '0', max: String(L().w * TILE - VW * TILE), step: '16', value: '0', id: 'le-pos', 'aria-label': tr('편집 위치', 'Editing position') });
  pos.addEventListener('input', () => { st.camX = +pos.value; render(); });
  const testB = el('button', { class: 'btn primary', type: 'button', text: tr('▶ 여기서 테스트', '▶ Test from here') });
  const editB = el('button', { class: 'btn', type: 'button', text: tr('■ 편집으로', '■ Back to editing'), hidden: true });
  // 되돌리기: 칠하기 한 번(누르고 떼기까지)마다 레벨 전체를 글자 지도로 기억한다
  const hist = { undo: [], redo: [], pending: null };
  const undoB = el('button', { class: 'btn small', type: 'button', text: tr('↶ 되돌리기', '↶ Undo'), title: 'Ctrl+Z', disabled: true });
  const redoB = el('button', { class: 'btn small', type: 'button', text: tr('↷ 다시 하기', '↷ Redo'), title: 'Ctrl+Shift+Z', disabled: true });
  const saveInfo = el('span', { class: 'readout' });
  function syncHist() { undoB.disabled = !hist.undo.length; redoB.disabled = !hist.redo.length; }
  function remember(before) {
    if (before === L().toText()) return;
    hist.undo.push(before); if (hist.undo.length > 80) hist.undo.shift();
    hist.redo.length = 0; syncHist();
  }
  function travel(from, to) {
    const t = from.pop();
    if (t == null) return;
    to.push(L().toText());
    ASSETS.setLevel(Level.fromText(t));
    render(); syncHist();
  }
  undoB.addEventListener('click', () => travel(hist.undo, hist.redo));
  redoB.addEventListener('click', () => travel(hist.redo, hist.undo));
  function syncSaved() {
    const a = L().toText().replace(/\n/g, ''), b = DEFAULT_LEVEL_TEXT.replace(/\n/g, '');
    if (a === b) { saveInfo.textContent = tr('기본 레벨 그대로', 'Default level, unchanged'); saveInfo.style.color = ''; return; }
    let diff = 0;
    if (a.length === b.length) for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
    saveInfo.textContent = tr('이 브라우저에 자동 저장됨 · ', 'Saved in this browser automatically · ') + (a.length === b.length ? tr('기본과 다른 칸 ' + diff + '개', diff + ' cells differ from the default') : tr('기본과 크기가 다름', 'size differs from the default'));
    saveInfo.style.color = 'var(--signal)';
  }
  const resetB = confirmButton(tr('처음 레벨로 되돌리기', 'Reset to the original level'), tr('한 번 더 누르면 되돌림', 'Press again to reset'), () => { const before = L().toText(); ASSETS.setLevel(Level.fromText(DEFAULT_LEVEL_TEXT)); remember(before); render(); });
  const editPane = el('div', { class: 'stack' }, el('div', { class: 'row' }, modeSeg, undoB, redoB, el('span', { class: 'sp' }), info), screen, mini,
    el('div', { class: 'bench-bar' }, el('span', { class: 'lbl', text: tr('위치', 'Position') }), pos));
  bench.append(editPane, testHost,
    el('div', { class: 'bench-bar' }, testB, editB, el('span', { class: 'sp' }), saveInfo, resetB),
    el('div', { class: 'label', style: { marginTop: '10px' }, text: tr('지형 타일 · 물체', 'Terrain tiles · objects') }), pal);
  host.append(bench);
  syncPal();

  let testView = null;
  testB.addEventListener('click', () => {
    st.testing = true;
    const startCol = Math.floor(st.camX / TILE) + 2;
    if (!testView) testView = new GameView(testHost, { world: { mode: 'sandbox', hud: true, sound: true, startCol }, label: tr('레벨 테스트 화면', 'Level test screen') });
    else testView.rebuild({ startCol });
    editPane.hidden = true; testHost.hidden = false; testB.hidden = true; editB.hidden = false;
    testView.screen.focus({ preventScroll: true });
  });
  editB.addEventListener('click', () => {
    st.testing = false;
    if (testView) {
      st.camX = clamp(Math.floor((testView.world.cam.x - 64) / TILE) * TILE, 0, L().w * TILE - VW * TILE);
      pos.value = String(st.camX);
    }
    editPane.hidden = false; testHost.hidden = true; testB.hidden = false; editB.hidden = true;
    render();
  });

  function cellAt(e) {
    const r = c.getBoundingClientRect();
    const x = Math.floor((((e.clientX - r.left) / r.width) * VW * TILE + st.camX) / TILE), y = Math.floor(((e.clientY - r.top) / r.height) * SCREEN_H / TILE);
    const lv = L();
    return x >= 0 && y >= 0 && x < lv.w && y < lv.h ? { x, y } : null;
  }
  function apply(cell, first) {
    const lv = L();
    const i = cell.y * lv.w + cell.x;
    const ent = lv.entAt(cell.x, cell.y);
    if (st.mode === 'erase') {
      if (ent && ent.c !== 'P') lv.ents.splice(lv.ents.indexOf(ent), 1);
      else lv.tiles[i] = T.EMPTY;
    } else if (st.brush.type === 'tile') {
      const id = st.brush.id;
      if (lv.tiles[i] === id) return;
      if (ent && !TILE_INFO[id].deco && ent.c !== 'P') lv.ents.splice(lv.ents.indexOf(ent), 1);
      if (ent && ent.c === 'P' && !TILE_INFO[id].deco) return;
      lv.tiles[i] = id;
    } else {
      if (!first) return;
      const ch = st.brush.c;
      if (ent) lv.ents.splice(lv.ents.indexOf(ent), 1);
      if (ch === 'P' || ch === 'G') lv.ents = lv.ents.filter((e) => e.c !== ch);
      if (!TILE_INFO[lv.tiles[i]].deco) lv.tiles[i] = T.EMPTY;
      lv.ents.push({ c: ch, x: cell.x, y: cell.y });
    }
    levelChanged();
  }
  c.addEventListener('pointerdown', (e) => {
    const cell = cellAt(e);
    if (!cell) return;
    e.preventDefault();
    try { c.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ }
    st.down = true; st.lastCell = cell;
    hist.pending = L().toText();
    apply(cell, true); render();
  });
  c.addEventListener('pointermove', (e) => {
    const cell = cellAt(e);
    st.hover = cell;
    if (st.down && cell && (cell.x !== st.lastCell.x || cell.y !== st.lastCell.y)) { st.lastCell = cell; apply(cell, false); }
    render();
  });
  const up = () => { st.down = false; if (hist.pending != null) { remember(hist.pending); hist.pending = null; } };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  c.addEventListener('pointerleave', () => { st.hover = null; render(); });
  screen.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) {
      e.preventDefault();
      if (k === 'y' || e.shiftKey) travel(hist.redo, hist.undo); else travel(hist.undo, hist.redo);
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      st.camX = clamp(st.camX + (e.key === 'ArrowRight' ? 64 : -64), 0, L().w * TILE - VW * TILE);
      pos.value = String(st.camX); render();
    }
  });
  const miniPick = (e) => {
    const r = mini.getBoundingClientRect();
    const col = ((e.clientX - r.left) / r.width) * L().w;
    st.camX = clamp(Math.round((col - VW / 2)) * TILE, 0, L().w * TILE - VW * TILE);
    pos.value = String(st.camX); render();
  };
  let miniDown = false;
  mini.addEventListener('pointerdown', (e) => { miniDown = true; try { mini.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ } miniPick(e); });
  mini.addEventListener('pointermove', (e) => { if (miniDown) miniPick(e); });
  mini.addEventListener('pointerup', () => { miniDown = false; });

  function render() {
    const lv = L();
    pos.max = String(lv.w * TILE - VW * TILE);
    ctx.fillStyle = '#55AAFF'; ctx.fillRect(0, 0, c.width, c.height);
    drawLevelStatic(ctx, lv, st.camX, 0, { w: VW * TILE });
    const start = lv.start();
    drawText(ctx, 'START', start.x * TILE - st.camX + 8, start.y * TILE - 8, { align: 'center', color: '#FFFF55' });
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -(st.camX % TILE); x <= c.width; x += TILE) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, c.height); }
    for (let y = 0; y <= c.height; y += TILE) { ctx.moveTo(0, y + 0.5); ctx.lineTo(c.width, y + 0.5); }
    ctx.stroke();
    for (let x = Math.ceil(st.camX / 512) * 512; x < st.camX + c.width; x += 512) {
      ctx.fillStyle = 'rgba(255,255,85,0.5)'; ctx.fillRect(x - st.camX, 0, 1, c.height);
      drawText(ctx, 'CP', x - st.camX + 3, 3, { color: '#FFFF55' });
    }
    if (st.hover) {
      const hx = st.hover.x * TILE - st.camX, hy = st.hover.y * TILE;
      if (st.mode === 'paint') {
        ctx.globalAlpha = 0.55;
        if (st.brush.type === 'tile') ctx.drawImage(TileGfx.icon(st.brush.id), hx, hy);
        else { const d = ENT_DEFS[st.brush.c]; ctx.drawImage(SHEETS[d.sheet].canvas(d.kind === 'bud' ? 'budClosed' : d.key), hx, hy); }
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = st.mode === 'erase' ? '#FF5555' : '#FFFF55'; ctx.lineWidth = 2;
      ctx.strokeRect(hx + 1, hy + 1, TILE - 2, TILE - 2);
      const t = lv.tile(st.hover.x, st.hover.y), e = lv.entAt(st.hover.x, st.hover.y);
      info.textContent = tr('열 ', 'Column ') + st.hover.x + tr(' · 행 ', ' · row ') + st.hover.y + ' · ' + TILE_INFO[t].name + (e ? ' · ' + ENT_DEFS[e.c].name : '');
    } else info.textContent = tr('칸을 눌러 칠한다 · 화면 클릭 후 ←→로 이동 · Ctrl+Z로 되돌리기', 'Select cells to paint · click the screen, then ←→ to scroll · Ctrl+Z to undo');
    // 띠 지도
    const img = mctx.createImageData(lv.w, lv.h);
    const colors = { 0: [85, 170, 255], 1: [170, 85, 0], 2: [170, 170, 170], 3: [255, 170, 85], 4: [0, 85, 170], 5: [0, 85, 0], 6: [0, 170, 0], 7: [255, 85, 170], 8: [255, 170, 85] };
    for (let i = 0; i < lv.w * lv.h; i++) { const col = colors[lv.tiles[i]] || [0, 0, 0]; img.data.set([col[0], col[1], col[2], 255], i * 4); }
    for (const e of lv.ents) { const k = ENT_DEFS[e.c].kind; const col = k === 'fruit' ? [255, 255, 0] : ['snail', 'frog', 'bee'].includes(k) ? [255, 0, 0] : [255, 255, 255]; img.data.set([...col, 255], (e.y * lv.w + e.x) * 4); }
    if (mini.width !== lv.w) mini.width = lv.w;
    mctx.putImageData(img, 0, 0);
    mctx.strokeStyle = '#FFFF55'; mctx.lineWidth = 1;
    mctx.strokeRect(st.camX / TILE + 0.5, 0.5, VW - 1, lv.h - 1);
  }
  render();
  Bus.on('level', () => { syncSaved(); if (!st.testing) render(); });
  syncSaved();
  Bus.on('sheet', () => { if (!st.testing) render(); });
}

// ── 4.5 저장 형식 ──────────────────────────────────────────────
function formatPanel(host) {
  let tab = 'text';
  const stats = el('div', { class: 'row', style: { gap: '22px' } });
  const ta = el('textarea', { rows: '14', id: 'fmt-data', spellcheck: 'false', 'aria-label': tr('레벨 데이터', 'Level data'), style: { whiteSpace: 'pre', overflowX: 'auto' } });
  const msg = el('span', { class: 'small' });
  const copyB = el('button', { class: 'btn small', type: 'button', text: tr('복사', 'Copy') });
  copyB.addEventListener('click', () => copyText(ta.value, copyB));
  const loadB = el('button', { class: 'btn small primary', type: 'button', text: tr('이 글자 지도로 불러오기', 'Load this character map') });
  loadB.addEventListener('click', () => {
    try {
      const rows = ta.value.replace(/\r/g, '').split('\n').filter((r) => r.length);
      if (rows.length !== 12) throw new Error(tr('줄이 ' + rows.length + '개다. 12줄이어야 화면 높이에 맞는다.', 'There are ' + rows.length + ' rows. It needs 12 rows to match the screen height.'));
      if (rows.some((r) => r.length < 16)) throw new Error(tr('한 줄이 16글자보다 짧다. 화면 너비만큼은 있어야 한다.', 'A row is shorter than 16 characters. Each row needs at least one screen width.'));
      const bad = [...new Set(rows.join('').split('').filter((ch) => !(ch in TILE_BY_CH) && !(ch in ENT_DEFS)))];
      if (bad.length) throw new Error(tr('모르는 글자: ', 'Unknown characters: ') + bad.join(' ') + tr(' · 쓸 수 있는 글자는 아래 범례 참고', ' · see the legend below for valid characters'));
      ASSETS.setLevel(Level.fromText(rows.join('\n')));
      msg.textContent = tr('불러왔다. 4.4 에디터와 모든 게임 화면에 반영됐다.', 'Loaded. The 4.4 editor and every game screen now use it.');
      msg.style.color = 'var(--ok)';
    } catch (e) { msg.textContent = e.message; msg.style.color = 'var(--bad)'; }
  });
  const tabs = segButtons([['text', tr('글자 지도', 'Character map')], ['rle', tr('RLE 숫자열', 'RLE numbers')], ['json', 'JSON']], tab, (v) => { tab = v; sync(); });
  const legend = el('div', { class: 'small mono', style: { lineHeight: '1.7' } });
  legend.textContent = tr('타일: ', 'Tiles: ') + TILE_INFO.map((t) => t.ch + ' ' + t.name).join(' · ') + tr('\n물체: ', '\nObjects: ') + Object.keys(ENT_DEFS).map((k) => k + ' ' + ENT_DEFS[k].name).join(' · ');
  legend.style.whiteSpace = 'pre-wrap';
  const panel = el('div', { class: 'panel stack' }, stats, el('div', { class: 'row' }, tabs, el('span', { style: { flex: '1' } }), copyB, loadB), ta, msg, legend);
  host.append(panel);
  function stat(n, label) { return el('div', null, el('div', { style: { font: '400 28px var(--font-display)', lineHeight: '1.1' }, text: n }), el('div', { class: 'small', text: label })); }
  function sync() {
    const L = ASSETS.level, rle = L.rle(), raw = L.w * L.h;
    stats.innerHTML = '';
    stats.append(stat(raw.toLocaleString() + 'B', tr('타일 원본 (칸당 1바이트)', 'Raw tiles (1 byte per cell)')), stat(rle.length.toLocaleString() + 'B', 'RLE (' + Math.round((rle.length / raw) * 100) + '%)'), stat(String(L.ents.length), tr('물체 수', 'Objects')), stat(L.w + '×' + L.h, tr('칸', 'Cells')));
    loadB.hidden = tab !== 'text';
    ta.readOnly = tab !== 'text';
    if (tab === 'text') ta.value = L.toText();
    else if (tab === 'rle') {
      const pairs = [];
      for (let i = 0; i < rle.length; i += 2) pairs.push(rle[i] + '×' + rle[i + 1]);
      ta.value = tr('// (개수×타일번호) 쌍, 세로 열 순서. 12칸이 한 열이다.\n', '// (count × tile number) pairs in column order. Each column is 12 cells.\n') + pairs.join(' ');
    } else ta.value = JSON.stringify(L.toJSON(), (k, v) => (k === 'tilesRLE' ? v.join(',') : v), 2);
  }
  sync();
  Bus.on('level', () => { if (document.activeElement !== ta) sync(); });
}

MOUNTS.tools = (root) => {
  pixelEditor($('#tool-pixel', root));
  autotileDemo($('#tool-autotile', root));
  levelEditor($('#tool-level', root));
  formatPanel($('#tool-format', root));
};
