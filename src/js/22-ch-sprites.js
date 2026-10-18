// ───────────────────────────────────────────────────────────────
// 2장 · 스프라이트와 애니메이션
// ───────────────────────────────────────────────────────────────
function checker(ctx, x, y, w, h, s = 6) {
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#D6DDD8';
  for (let yy = 0; yy < h; yy += s) for (let xx = (yy / s) % 2 ? s : 0; xx < w; xx += s * 2) ctx.fillRect(x + xx, y + yy, Math.min(s, w - xx), Math.min(s, h - yy));
}
function contrastText(hex) {
  if (!hex) return '#333';
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#000' : '#FFF';
}

function sprPaletteDemo(host) {
  const wrap = el('div', { class: 'grid2' });
  // 왼쪽: 번호로 된 보리
  const big = el('canvas', { class: 'vcanvas', style: { maxWidth: '360px' } });
  let frame = 'idle', showNum = true;
  const fsel = el('div', { class: 'seg' });
  ['idle', 'run1', 'jump', 'throw'].forEach((k) => {
    const b = el('button', { class: 'btn small', type: 'button', text: k, 'aria-pressed': String(k === frame) });
    b.addEventListener('click', () => { frame = k; $$('button', fsel).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawBig(); });
    fsel.append(b);
  });
  const nb = el('button', { class: 'btn small', type: 'button', 'aria-pressed': 'true', text: tr('번호 보기', 'Show numbers') });
  nb.addEventListener('click', () => { showNum = !showNum; nb.setAttribute('aria-pressed', String(showNum)); drawBig(); });
  const left = el('div', { class: 'panel stack' },
    el('div', { class: 'label', text: tr('보리 16×16 · 칸마다 팔레트 번호', 'Bori, 16×16 · a palette number in every cell') }), big,
    el('div', { class: 'row' }, fsel, nb),
    el('div', { class: 'small', text: tr('256칸 × 4비트 = 128바이트. 0번 칸(체크무늬)은 투명이다.', '256 cells × 4 bits = 128 bytes. Cells numbered 0 (checkerboard) are transparent.') }));
  function drawBig() {
    const W = Math.min(360, big.parentElement ? big.parentElement.clientWidth - 32 : 320);
    const cell = Math.floor(W / 16), S = cell * 16;
    const ctx = fitCanvas(big, S, S);
    big.style.width = S + 'px';
    const sh = SHEETS.hero, d = sh.data[sh.index(frame)];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = d[y * 16 + x];
      if (!v) checker(ctx, x * cell, y * cell, cell, cell, cell / 2);
      else { ctx.fillStyle = SPR_PAL[v]; ctx.fillRect(x * cell, y * cell, cell, cell); }
      if (showNum) {
        ctx.fillStyle = v ? contrastText(SPR_PAL[v]) : '#9AA49F';
        ctx.font = '700 ' + Math.max(8, Math.floor(cell * 0.55)) + 'px ' + cssVar('--font-mono');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(HEX_CHARS[v] === '.' ? '0' : HEX_CHARS[v], x * cell + cell / 2, y * cell + cell / 2 + 0.5);
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 16; i++) { ctx.beginPath(); ctx.moveTo(i * cell + 0.5, 0); ctx.lineTo(i * cell + 0.5, S); ctx.moveTo(0, i * cell + 0.5); ctx.lineTo(S, i * cell + 0.5); ctx.stroke(); }
  }
  // 오른쪽: 64색과 두 팔레트
  const info = el('div', { class: 'readout', text: tr('색을 눌러 보자.', 'Select a color.') });
  const grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', gap: '3px' } });
  const usedS = new Set(SPR_PAL.filter(Boolean)), usedB = new Set(BG_PAL.filter(Boolean));
  SMS64.forEach((c, i) => {
    const tag = (usedS.has(c.hex) ? 'S' : '') + (usedB.has(c.hex) ? 'B' : '');
    const b = el('button', { class: 'swatch', type: 'button', title: c.hex, 'aria-label': c.hex, style: { background: c.hex, borderColor: tag ? 'var(--ink)' : 'var(--rule)' } });
    if (tag) b.append(el('span', { text: tag, style: { position: 'absolute', inset: '0', display: 'grid', placeItems: 'center', font: '700 9px var(--font-mono)', color: contrastText(c.hex) } }));
    b.addEventListener('click', () => {
      info.textContent = '#' + i + '  R=' + c.r + ' G=' + c.g + ' B=' + c.b + '  →  ' + c.hex + (tag.includes('S') ? tr('  · 스프라이트 팔레트', '  · sprite palette') : '') + (tag.includes('B') ? tr('  · 배경 팔레트', '  · background palette') : '');
    });
    grid.append(b);
  });
  const strip = (pal, title) => {
    const row = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', gap: '3px' } });
    pal.forEach((hx, i) => {
      const s = el('div', { class: 'swatch' + (hx ? '' : ' clear'), title: i + (hx ? ' ' + hx : tr(' 투명', ' transparent')), style: hx ? { background: hx } : {} },
        el('span', { text: HEX_CHARS[i] === '.' ? '0' : HEX_CHARS[i], style: { position: 'absolute', inset: '0', display: 'grid', placeItems: 'center', font: '700 10px var(--font-mono)', color: contrastText(hx) } }));
      row.append(s);
    });
    return el('div', { class: 'stack', style: { gap: '6px' } }, el('div', { class: 'label', text: title }), row);
  };
  const right = el('div', { class: 'panel stack' },
    el('div', { class: 'label', text: tr('SMS 64색 · S=스프라이트, B=배경에 쓴 색', 'The SMS 64 colors · S = used by sprites, B = used by backgrounds') }), grid, info,
    strip(SPR_PAL, tr('스프라이트 팔레트 (번호 0~F)', 'Sprite palette (0–F)')), strip(BG_PAL, tr('배경 팔레트 (번호 0~F)', 'Background palette (0–F)')));
  wrap.append(left, right);
  host.append(wrap);
  drawBig();
  Bus.on('sheet', (s) => { if (s.name === 'hero') drawBig(); });
  new ResizeObserver(debounce(drawBig, 100)).observe(left);
}

function sprAnimDemo(host) {
  const bench = el('div', { class: 'bench wide' });
  const sheetC = el('canvas', { class: 'vcanvas' });
  const prev = el('canvas', { class: 'vcanvas' });
  const ro = el('div', { class: 'readout' });
  let anim = 'run', speed = 1, flip = false, box = true, t = 0;
  const states = [['idle', tr('서기', 'Idle')], ['run', tr('달리기', 'Run')], ['jump', tr('점프', 'Jump')], ['fall', tr('낙하', 'Fall')], ['throw', tr('던지기', 'Throw')], ['hurt', tr('아픔', 'Hurt')]];
  const seg = el('div', { class: 'seg' });
  states.forEach(([k, label]) => {
    const b = el('button', { class: 'btn small', type: 'button', text: label, 'aria-pressed': String(k === anim) });
    b.addEventListener('click', () => { anim = k; t = 0; $$('button', seg).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
    seg.append(b);
  });
  const sp = el('input', { type: 'range', min: '0.25', max: '2', step: '0.25', value: '1', id: 'anim-speed', 'aria-label': tr('재생 속도', 'Playback speed') });
  const spv = el('span', { class: 'readout', text: '1×' });
  sp.addEventListener('input', () => { speed = +sp.value; spv.textContent = speed + '×'; });
  const fb = el('button', { class: 'btn small', type: 'button', 'aria-pressed': 'false', text: tr('좌우 뒤집기', 'Flip horizontally') });
  fb.addEventListener('click', () => { flip = !flip; fb.setAttribute('aria-pressed', String(flip)); });
  const hb = el('button', { class: 'btn small', type: 'button', 'aria-pressed': 'true', text: tr('히트박스', 'Hitbox') });
  hb.addEventListener('click', () => { box = !box; hb.setAttribute('aria-pressed', String(box)); });
  bench.append(
    el('div', { class: 'label', text: tr('스프라이트 시트 · hero (프레임 10장)', 'Sprite sheet · hero (10 frames)') }), sheetC,
    el('div', { class: 'grid2', style: { marginTop: '12px' } }, prev, el('div', { class: 'stack' }, seg,
      el('div', { class: 'ctl' }, el('span', { class: 'lbl', text: tr('속도', 'Speed') }), sp, spv),
      el('div', { class: 'row' }, fb, hb), ro)));
  host.append(bench);
  const keys = SHEETS.hero.keys;
  function cur() {
    const a = ANIMS[anim];
    const total = a.seq.reduce((s, f) => s + f[1], 0);
    const tt = Math.floor(t);
    if (!a.loop) return { key: animFrame(anim, tt % (total + 40)), a, total };
    return { key: animFrame(anim, tt), a, total };
  }
  function draw() {
    const { key, a } = cur();
    const W = sheetC.clientWidth || 600;
    const n = keys.length, cell = Math.min(64, Math.floor((W - 8) / n)), S = cell - 6;
    const ctx = fitCanvas(sheetC, W, cell + 18);
    ctx.clearRect(0, 0, W, cell + 18);
    ctx.imageSmoothingEnabled = false;
    keys.forEach((k, i) => {
      const x = i * cell + 3;
      ctx.fillStyle = '#55AAFF'; ctx.fillRect(x, 3, S, S);
      ctx.drawImage(SHEETS.hero.canvas(k), x, 3, S, S);
      if (k === key) { ctx.strokeStyle = cssVar('--signal'); ctx.lineWidth = 3; ctx.strokeRect(x - 1.5, 1.5, S + 3, S + 3); }
      ctx.fillStyle = k === key ? cssVar('--signal') : cssVar('--bezel-dim');
      ctx.font = '600 10px ' + cssVar('--font-mono'); ctx.textAlign = 'center';
      ctx.fillText(k, x + S / 2, cell + 14);
    });
    const PW = prev.clientWidth || 300, PH = Math.min(260, PW * 0.75);
    const p = fitCanvas(prev, PW, PH);
    p.fillStyle = '#55AAFF'; p.fillRect(0, 0, PW, PH);
    p.fillStyle = '#AA5500'; p.fillRect(0, PH - 30, PW, 30);
    p.fillStyle = '#00AA00'; p.fillRect(0, PH - 30, PW, 6);
    const sc = Math.floor(Math.min((PH - 40) / 16, PW / 20));
    const x = Math.round(PW / 2 - 8 * sc), y = PH - 30 - 16 * sc;
    p.imageSmoothingEnabled = false;
    p.save();
    if (flip) { p.translate(x + 16 * sc, y); p.scale(-1, 1); p.drawImage(SHEETS.hero.canvas(key), 0, 0, 16 * sc, 16 * sc); }
    else p.drawImage(SHEETS.hero.canvas(key), x, y, 16 * sc, 16 * sc);
    p.restore();
    if (box) {
      p.strokeStyle = '#FFFF55'; p.lineWidth = 2;
      p.strokeRect(x + 3 * sc + 1, y + 2 * sc + 1, 10 * sc - 2, 14 * sc - 2);
      p.fillStyle = '#FF55AA'; p.fillRect(x + 8 * sc - 3, y + 16 * sc - 3, 6, 6);
      p.font = '600 11px ' + cssVar('--font-mono'); p.fillStyle = '#000'; p.textAlign = 'left';
      p.fillText(tr('히트박스 10×14', 'Hitbox 10×14'), 8, 18); p.fillText(tr('기준점(발)', 'Origin (feet)'), 8, 34);
    }
    const seqTxt = a.seq.map((s) => s[0] + '×' + s[1]).join(' → ');
    ro.textContent = tr('표: ', 'Table: ') + seqTxt + (a.loop ? tr(' (반복)', ' (loops)') : tr(' (한 번)', ' (once)')) + tr('\n지금: ', '\nNow: ') + key;
    ro.style.whiteSpace = 'pre-wrap';
  }
  const loop = new FixedLoop({ update: () => { t += speed; }, render: draw });
  draw();
  whenVisible(bench, () => loop.start(), () => loop.stop());
}

function sprSwapDemo(host) {
  const bench = el('div', { class: 'bench wide' });
  const c = el('canvas', { class: 'vcanvas' });
  const variants = [['base', tr('기본', 'Base')], ['2p', '2P'], ['poison', tr('독버섯', 'Poisoned')], ['glow', tr('반딧불 무적', 'Firefly shield')], ['white', tr('피격 번쩍임', 'Hit flash')]];
  let sel = '2p', t = 0;
  const strip = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', gap: '3px', marginTop: '10px' } });
  const note = el('div', { class: 'readout', style: { marginTop: '8px' } });
  function drawStrip() {
    strip.innerHTML = '';
    const pal = paletteFor(SPR_PAL, sel);
    pal.forEach((hx, i) => {
      const changed = hx !== SPR_PAL[i];
      strip.append(el('div', { class: 'swatch' + (hx ? '' : ' clear'), style: Object.assign(hx ? { background: hx } : {}, changed ? { outline: '2.5px solid var(--signal)', outlineOffset: '1px' } : {}) },
        el('span', { text: HEX_CHARS[i] === '.' ? '0' : HEX_CHARS[i], style: { position: 'absolute', inset: '0', display: 'grid', placeItems: 'center', font: '700 10px var(--font-mono)', color: contrastText(hx) } })));
    });
    const changed = pal.map((hx, i) => (hx !== SPR_PAL[i] ? HEX_CHARS[i] : null)).filter(Boolean);
    note.textContent = sel === 'base' ? tr('원래 팔레트', 'The original palette') : tr('바뀐 번호: ', 'Changed entries: ') + changed.join(', ') + tr(' · 그림 데이터는 그대로', ' · the pixel data is untouched');
  }
  function draw() {
    const W = c.clientWidth || 600, H = Math.round(Math.min(200, W * 0.3));
    const ctx = fitCanvas(c, W, H);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const n = variants.length, cw = W / n, sc = Math.max(2, Math.floor(Math.min(cw / 20, (H - 30) / 16)));
    ctx.imageSmoothingEnabled = false;
    variants.forEach(([v, label], i) => {
      const x = i * cw + cw / 2 - 8 * sc, y = 8;
      if (v === sel) { ctx.fillStyle = '#263030'; ctx.fillRect(i * cw + 2, 2, cw - 4, H - 4); }
      const vv = v === 'glow' ? ((t >> 2) & 1 ? 'glow' : 'base') : v;
      ctx.drawImage(SHEETS.hero.canvas(animFrame('run', t), vv), x, y, 16 * sc, 16 * sc);
      ctx.fillStyle = v === sel ? cssVar('--signal') : '#CAD5CF';
      ctx.font = '600 12px ' + cssVar('--font-body'); ctx.textAlign = 'center';
      ctx.fillText(label, i * cw + cw / 2, H - 9);
    });
  }
  c.addEventListener('click', (e) => {
    const r = c.getBoundingClientRect();
    const i = Math.floor(((e.clientX - r.left) / r.width) * variants.length);
    if (variants[i]) { sel = variants[i][0]; drawStrip(); }
  });
  c.style.cursor = 'pointer';
  bench.append(c, el('div', { class: 'label', style: { marginTop: '10px' }, text: tr('선택한 팔레트 (화면을 눌러 고른다) · 테두리 = 바뀐 색', 'Selected palette (select one on the screen) · outlined = changed color') }), strip, note);
  host.append(bench);
  drawStrip();
  const loop = new FixedLoop({ update: () => { t++; }, render: draw });
  draw();
  whenVisible(bench, () => loop.start(), () => loop.stop());
}

// 2.4 스캔라인당 스프라이트 8개 제한
function sprScanDemo(host) {
  const bench = el('div', { class: 'bench wide' });
  const c = el('canvas', { width: 256, height: 112, class: 'pix' });
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let count = 6, limit = true, rotate = true, align = true, t = 0;
  const n = el('input', { type: 'range', min: '1', max: '12', step: '1', value: String(count), id: 'scan-count', 'aria-label': tr('벌의 수', 'Number of bees') });
  const nv = el('span', { class: 'readout', text: count + tr('마리', ' bees') });
  n.addEventListener('input', () => { count = +n.value; nv.textContent = count + tr('마리', ' bees'); });
  const tog = (label, get, set) => {
    const b = el('button', { class: 'btn small', type: 'button', 'aria-pressed': String(get()), text: label });
    b.addEventListener('click', () => { set(!get()); b.setAttribute('aria-pressed', String(get())); });
    return b;
  };
  bench.append(el('div', { class: 'screen', style: { cursor: 'default' } }, c), el('div', { class: 'bench-bar' },
    el('span', { class: 'lbl', text: tr('벌', 'Bees') }), n, nv,
    tog(tr('한 줄 8개 제한', '8 per line limit'), () => limit, (v) => { limit = v; }),
    tog(tr('그리는 순서 돌리기', 'Rotate draw order'), () => rotate, (v) => { rotate = v; }),
    tog(tr('같은 높이로 모으기', 'Line them up'), () => align, (v) => { align = v; })));
  host.append(bench);
  function render() {
    ctx.fillStyle = '#55AAFF'; ctx.fillRect(0, 0, 256, 112);
    ctx.fillStyle = '#AAFFFF'; ctx.fillRect(0, 84, 256, 28);
    const hw = [];
    for (let i = 0; i < count; i++) {
      const x = Math.round(12 + i * 18 + Math.sin(t / 40 + i) * 3);
      const y = Math.round(align ? 44 + Math.sin(t / 30) * 6 : 14 + ((i * 23) % 64) + Math.sin(t / 30 + i) * 6);
      const src = SHEETS.enemy.canvas(animFrame('bee', t + i * 2));
      hw.push({ x, y, src, sx: 0 }, { x: x + 8, y, src, sx: 8 });
    }
    const counts = new Array(112).fill(0);
    const order = hw.map((_, i) => i);
    for (let y = 0; y < 112; y++) {
      const on = order.filter((i) => y >= hw[i].y && y < hw[i].y + 16);
      counts[y] = on.length;
      let list = on;
      if (rotate && on.length) { const k = t % on.length; list = on.slice(k).concat(on.slice(0, k)); }
      const drawN = limit ? Math.min(8, list.length) : list.length;
      for (let j = 0; j < drawN; j++) {
        const s = hw[list[j]];
        ctx.drawImage(s.src, s.sx, y - s.y, 8, 1, s.x, y, 8, 1);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(226, 0, 30, 112);
    for (let y = 0; y < 112; y++) {
      if (!counts[y]) continue;
      ctx.fillStyle = counts[y] > 8 ? '#FF5555' : '#55FF55';
      ctx.fillRect(228, y, Math.min(26, counts[y] * 1.1), 1);
    }
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(228 + 8 * 1.1, 0, 1, 112);
    drawText(ctx, '8', 236, 2, { color: '#FFFFFF' });
    const maxC = Math.max(...counts);
    drawText(ctx, 'MAX ' + maxC + ' PER LINE', 4, 100, { color: maxC > 8 ? '#FF5555' : '#FFFFFF' });
  }
  const loop = new FixedLoop({ update: () => { t++; }, render });
  render();
  whenVisible(bench, () => loop.start(), () => loop.stop());
}

MOUNTS.sprites = (root) => {
  sprPaletteDemo($('#spr-palette', root));
  sprAnimDemo($('#spr-anim', root));
  sprSwapDemo($('#spr-swap', root));
  sprScanDemo($('#spr-scan', root));
};
