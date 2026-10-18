// ───────────────────────────────────────────────────────────────
// 6장 · 게임 물리
// ───────────────────────────────────────────────────────────────
function physSlider(key, label, min, max, step, onChange) {
  const r = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(PHYS[key]), id: 'phys-' + key, 'aria-label': label, style: { width: '100%' } });
  const v = el('span', { class: 'readout', text: String(PHYS[key]) });
  r.addEventListener('input', () => { PHYS[key] = +r.value; v.textContent = r.value; savePhys(); if (onChange) onChange(); });
  const sync = () => { r.value = String(PHYS[key]); v.textContent = String(PHYS[key]); };
  Bus.on('phys', sync);
  return el('div', { class: 'stack', style: { gap: '2px' } }, el('div', { class: 'row', style: { justifyContent: 'space-between' } }, el('span', { class: 'small', style: { color: 'var(--bezel-dim)' }, text: label }), v), r);
}

function physArcLab(host) {
  const bench = el('div', { class: 'bench wide' });
  const c = el('canvas', { class: 'vcanvas' });
  const table = el('div', { class: 'readout', style: { display: 'grid', gridTemplateColumns: 'auto repeat(3, minmax(0, 1fr))', gap: '4px 14px', marginTop: '10px' } });
  const sliders = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: '10px 18px' } },
    physSlider('gravity', tr('중력 (px/프레임²)', 'Gravity (px/frame²)'), 0.08, 0.6, 0.01, draw),
    physSlider('jumpV', tr('점프 초속 (px/프레임)', 'Jump speed (px/frame)'), 2, 9, 0.1, draw),
    physSlider('speedJump', tr('달리기 보너스', 'Running bonus'), 0, 1.5, 0.05, draw),
    physSlider('jumpCut', tr('점프 컷 속도', 'Jump cut speed'), 0.5, 4, 0.1, draw),
    physSlider('maxFall', tr('최대 낙하 속도', 'Max fall speed'), 2, 10, 0.25, draw),
    physSlider('maxSpeed', tr('최고 달리기 속도', 'Max run speed'), 0.5, 4, 0.1, draw));
  const vj = el('input', { type: 'checkbox', checked: PHYS.varJump, id: 'phys-varjump' });
  vj.addEventListener('change', () => { PHYS.varJump = vj.checked; savePhys(); draw(); });
  const def = el('button', { class: 'btn small', type: 'button', text: tr('물리 값 기본으로', 'Reset physics') });
  def.addEventListener('click', () => { Object.assign(PHYS, PHYS_DEFAULT); vj.checked = PHYS.varJump; savePhys(); Bus.emit('phys', PHYS); draw(); });
  bench.append(c, table, el('div', { style: { marginTop: '14px' } }, sliders),
    el('div', { class: 'bench-bar' }, el('label', { class: 'check', for: 'phys-varjump' }, vj, tr('가변 점프 (버튼을 떼면 상승을 자른다)', 'Variable jump (releasing the button cuts the rise)')), el('span', { class: 'sp' }), def));
  host.append(bench);
  Bus.on('phys', () => { vj.checked = PHYS.varJump; draw(); });
  function draw() {
    const W = c.clientWidth || 700, H = 300;
    const ctx = fitCanvas(c, W, H);
    const runs = [
      { label: tr('끝까지 누름', 'Held all the way'), hold: 999, color: '#F0A93A' },
      { label: tr('8프레임 누름', 'Held 8 frames'), hold: 8, color: '#8CA6FF' },
      { label: tr('톡 (2프레임)', 'Tap (2 frames)'), hold: 2, color: '#FF6B57' },
    ].map((r) => Object.assign(r, simulateJump(PHYS, { holdFrames: r.hold })));
    const maxD = Math.max(...runs.map((r) => r.dist), 64), maxA = Math.max(...runs.map((r) => r.apex), 32);
    const x0 = 46, y0 = H - 30;
    const sc = Math.min((W - x0 - 20) / (maxD + 20), (y0 - 24) / (maxA + 10));
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.font = '500 11px ' + cssVar('--font-mono');
    for (let tx = 0; tx * 16 <= (W - x0) / sc; tx++) {
      const X = x0 + tx * 16 * sc;
      ctx.fillStyle = tx % 4 === 0 ? '#2F3A3A' : '#182020'; ctx.fillRect(X, 10, 1, y0 - 10);
      if (tx && tx % 2 === 0) { ctx.fillStyle = '#7D8B85'; ctx.fillText(tx + tr('칸', ' tiles'), X - 10, H - 10); }
    }
    for (let ty = 0; ty * 16 * sc <= y0 - 10; ty++) {
      const Y = y0 - ty * 16 * sc;
      ctx.fillStyle = '#182020'; ctx.fillRect(x0, Y, W - x0, 1);
      if (ty) { ctx.fillStyle = '#7D8B85'; ctx.fillText(ty + tr('칸', ' tiles'), 6, Y + 4); }
    }
    ctx.fillStyle = '#AA5500'; ctx.fillRect(x0, y0, W - x0, H - y0);
    ctx.fillStyle = '#00AA00'; ctx.fillRect(x0, y0, W - x0, 3);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(SHEETS.hero.canvas('run1'), x0 - 3 * sc, y0 - 16 * sc, 16 * sc, 16 * sc);
    for (const r of runs.slice().reverse()) {
      ctx.strokeStyle = r.color; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5; ctx.beginPath();
      r.pts.forEach((p, i) => { const X = x0 + 5 * sc + p.x * sc, Y = y0 + p.y * sc; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
      ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = r.color;
      r.pts.forEach((p) => { ctx.beginPath(); ctx.arc(x0 + 5 * sc + p.x * sc, y0 + p.y * sc, 2.2, 0, TAU); ctx.fill(); });
      const ap = r.pts[r.apexFrame];
      const AX = x0 + 5 * sc + ap.x * sc, AY = y0 - r.apex * sc;
      ctx.setLineDash([3, 4]); ctx.strokeStyle = r.color; ctx.beginPath(); ctx.moveTo(x0, AY); ctx.lineTo(AX, AY); ctx.stroke(); ctx.setLineDash([]);
    }
    const full = runs[0];
    ctx.drawImage(SHEETS.hero.canvas('jump'), x0 + 5 * sc + full.pts[full.apexFrame].x * sc - 8 * sc, y0 - full.apex * sc - 16 * sc + 2 * sc, 16 * sc, 16 * sc);
    table.innerHTML = '';
    const cell = (t, s) => table.append(el('span', { text: t, style: s || {} }));
    cell(''); runs.forEach((r) => cell(r.label, { color: r.color, fontWeight: '700' }));
    cell(tr('최고 높이', 'Peak height')); runs.forEach((r) => cell(r.apex.toFixed(1) + ' px · ' + (r.apex / 16).toFixed(2) + tr('칸', ' tiles')));
    cell(tr('체공', 'Airtime')); runs.forEach((r) => cell(r.air + tr('프레임 · ', ' frames · ') + (r.air / 60).toFixed(2) + tr('초', ' s')));
    cell(tr('최대 거리', 'Max distance')); runs.forEach((r) => cell(r.dist.toFixed(0) + ' px · ' + (r.dist / 16).toFixed(1) + tr('칸', ' tiles')));
  }
  draw();
  new ResizeObserver(debounce(draw, 100)).observe(bench);
  Bus.on('sheet', draw);
}

// ── 6.2 충돌 단계 실험실 ────────────────────────────────────────
function physCollideLab(host) {
  const lv = Level.fromText(['##############', '#............#', '#............#', '#.......BB...#', '#............#', '#...===......#', '#............#', '##############'].join('\n').replace(/B/g, '#'));
  const bench = el('div', { class: 'bench wide' });
  const c = el('canvas', { class: 'vcanvas', style: { touchAction: 'none' } });
  const say = el('div', { class: 'readout', style: { minHeight: '64px', marginTop: '10px', lineHeight: '1.6', whiteSpace: 'pre-wrap' } });
  const start = () => ({ x: 104, y: 22, w: 10, h: 14, vx: 5, vy: 6 });
  let box = start(), phase = 0, probe = [], pend = null, gravity = true, auto = 0, drag = null, scale = 1;
  const stepB = el('button', { class: 'btn primary', type: 'button', text: tr('한 단계', 'One step') });
  const frameB = el('button', { class: 'btn', type: 'button', text: tr('한 프레임 전체', 'A whole frame') });
  const autoB = el('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', text: tr('자동 재생', 'Autoplay') });
  const resetB = el('button', { class: 'btn small', type: 'button', text: tr('처음 위치', 'Reset position') });
  const gcb = el('input', { type: 'checkbox', checked: true, id: 'col-grav' });
  gcb.addEventListener('change', () => { gravity = gcb.checked; });
  stepB.addEventListener('click', () => { stepPhase(); draw(); });
  frameB.addEventListener('click', () => { do stepPhase(); while (phase !== 0); draw(); });
  autoB.addEventListener('click', () => {
    if (auto) { clearInterval(auto); auto = 0; } else auto = setInterval(() => { stepPhase(); draw(); }, 280);
    autoB.setAttribute('aria-pressed', String(!!auto));
  });
  resetB.addEventListener('click', () => { box = start(); phase = 0; probe = []; pend = null; say.textContent = describe(); draw(); });
  bench.append(c, say, el('div', { class: 'bench-bar' }, stepB, frameB, autoB, resetB, el('label', { class: 'check', for: 'col-grav' }, gcb, tr('중력 적용', 'Apply gravity'))));
  host.append(bench);
  const PH = LANG === 'en' ? ['⓪ Ready', '① Move along x', '② Push out on x', '③ Move along y', '④ Push out on y'] : ['⓪ 준비', '① x로 이동', '② x 밀어내기', '③ y로 이동', '④ y 밀어내기'];
  function describe() {
    return PH[phase] + tr(' · 위치 (', ' · position (') + box.x.toFixed(1) + ', ' + box.y.toFixed(1) + tr(') · 속도 (', ') · velocity (') + box.vx.toFixed(2) + ', ' + box.vy.toFixed(2) + ')\n' +
      tr('상자를 끌어 옮기고, 노란 화살표 끝을 끌어 속도를 바꾼다. 빈 칸을 누르면 블록을 놓거나 지운다.', 'Drag the box to move it and drag the tip of the yellow arrow to change its velocity. Select an empty cell to place or remove a block.');
  }
  function stepPhase() {
    if (phase === 0) {
      probe = []; pend = Object.assign({}, box); moveX(pend, box.vx, lv, probe);
      phase = 1;
      const hits = probe.filter((p) => p.hit).length;
      say.textContent = PH[1] + ' · x ' + box.x.toFixed(1) + ' → ' + (box.x + box.vx).toFixed(1) + ' (Δ ' + box.vx.toFixed(2) + ')\n' +
        (box.vx === 0 ? tr('x 속도가 0이라 검사할 것이 없다.', 'The x velocity is 0, so there is nothing to check.') : tr('앞쪽 가장자리가 닿는 열의 칸 ' + probe.length + '개를 검사했다 → 벽 ' + hits + '개와 겹침', 'Checked ' + probe.length + ' cells in the column the leading edge reaches → overlaps ' + hits + ' wall cells'));
    } else if (phase === 1) {
      const moved = box.x + box.vx;
      box.x = pend.x; box.vx = pend.vx;
      phase = 2;
      say.textContent = PH[2] + ' · ' + (pend.hitWall ? tr('벽과 겹쳐서 벽 ' + (pend.hitWall > 0 ? '왼쪽' : '오른쪽') + ' 면에 붙였다. x = ' + box.x.toFixed(1) + ' (' + (moved - box.x).toFixed(1) + 'px 밀어냄), vx = 0', 'It overlapped a wall, so it was pushed against the wall\'s ' + (pend.hitWall > 0 ? 'left' : 'right') + ' face. x = ' + box.x.toFixed(1) + ' (pushed back ' + (moved - box.x).toFixed(1) + ' px), vx = 0') : tr('겹친 벽이 없으니 그대로 둔다. x = ', 'No wall overlaps, so it stays. x = ') + box.x.toFixed(1));
    } else if (phase === 2) {
      probe = []; pend = Object.assign({}, box); moveY(pend, box.vy, lv, probe);
      phase = 3;
      const hits = probe.filter((p) => p.hit).length;
      say.textContent = PH[3] + ' · y ' + box.y.toFixed(1) + ' → ' + (box.y + box.vy).toFixed(1) + ' (Δ ' + box.vy.toFixed(2) + ')\n' +
        (box.vy === 0 ? tr('y 속도가 0이라 검사할 것이 없다.', 'The y velocity is 0, so there is nothing to check.') : tr((box.vy > 0 ? '아래' : '위') + '쪽 가장자리가 닿는 행의 칸 ' + probe.length + '개를 검사했다 → ' + hits + '개와 겹침', 'Checked ' + probe.length + ' cells in the row the ' + (box.vy > 0 ? 'bottom' : 'top') + ' edge reaches → overlaps ' + hits) + (probe.some((p) => p.oneWay) ? tr(' (통나무는 위에서 내려올 때만)', ' (logs count only when landing from above)') : ''));
    } else if (phase === 3) {
      box.y = pend.y; box.vy = pend.vy;
      phase = 4;
      say.textContent = PH[4] + ' · ' + (pend.onGround ? tr('바닥 위로 올려 붙였다. 땅에 닿음 = true, vy = 0', 'Placed on top of the floor. onGround = true, vy = 0') : pend.hitCeil ? tr('천장 아래로 붙였다. vy = 0', 'Pushed below the ceiling. vy = 0') : tr('겹친 칸이 없다. y = ', 'Nothing overlaps. y = ') + box.y.toFixed(1));
    } else {
      if (gravity) box.vy = Math.min(box.vy + 0.25, 5);
      if (box.y > 8 * TILE) box = start();
      phase = 0; probe = [];
      say.textContent = PH[0] + tr(' · 새 프레임', ' · new frame') + (gravity ? tr(': 중력으로 vy += 0.25 → ', ': gravity adds 0.25 to vy → ') + box.vy.toFixed(2) : '') + '\n' + tr('다시 x부터 처리한다.', 'Start again with x.');
    }
  }
  function draw() {
    const W = c.clientWidth || 640;
    scale = W / (lv.w * TILE);
    const H = lv.h * TILE * scale;
    const ctx = fitCanvas(c, W, H);
    const s = scale;
    ctx.fillStyle = '#0B0F0F'; ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) {
      const t = lv.tile(x, y);
      if (t === T.GROUND) { ctx.fillStyle = '#334040'; ctx.fillRect(x * 16 * s + 1, y * 16 * s + 1, 16 * s - 2, 16 * s - 2); }
      if (t === T.LOG) { ctx.fillStyle = '#AA5500'; ctx.fillRect(x * 16 * s + 1, y * 16 * s + 1, 16 * s - 2, 5 * s); ctx.fillStyle = '#FFAA55'; ctx.fillRect(x * 16 * s + 1, y * 16 * s + 1, 16 * s - 2, 1.5 * s); }
    }
    ctx.strokeStyle = '#182020'; ctx.lineWidth = 1;
    for (let x = 0; x <= lv.w; x++) { ctx.beginPath(); ctx.moveTo(x * 16 * s + 0.5, 0); ctx.lineTo(x * 16 * s + 0.5, H); ctx.stroke(); }
    for (let y = 0; y <= lv.h; y++) { ctx.beginPath(); ctx.moveTo(0, y * 16 * s + 0.5); ctx.lineTo(W, y * 16 * s + 0.5); ctx.stroke(); }
    for (const p of probe) {
      ctx.fillStyle = p.hit ? 'rgba(255,91,74,0.45)' : 'rgba(240,169,58,0.18)';
      ctx.fillRect(p.tx * 16 * s, p.ty * 16 * s, 16 * s, 16 * s);
      ctx.strokeStyle = p.hit ? '#FF5B4A' : '#F0A93A'; ctx.lineWidth = 2;
      ctx.strokeRect(p.tx * 16 * s + 1, p.ty * 16 * s + 1, 16 * s - 2, 16 * s - 2);
    }
    const rect = (b, stroke, fill, dash) => {
      ctx.setLineDash(dash || []);
      if (fill) { ctx.fillStyle = fill; ctx.fillRect(b.x * s, b.y * s, b.w * s, b.h * s); }
      ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.strokeRect(b.x * s + 1, b.y * s + 1, b.w * s - 2, b.h * s - 2);
      ctx.setLineDash([]);
    };
    if (phase === 0) rect({ x: box.x + box.vx, y: box.y + box.vy, w: box.w, h: box.h }, 'rgba(255,255,255,0.45)', null, [4, 4]);
    if (phase === 1) rect({ x: box.x + box.vx, y: box.y, w: box.w, h: box.h }, '#FFFF55', 'rgba(255,255,85,0.25)', [5, 3]);
    if (phase === 3) rect({ x: box.x, y: box.y + box.vy, w: box.w, h: box.h }, '#FFFF55', 'rgba(255,255,85,0.25)', [5, 3]);
    rect(box, '#FFFF55', phase === 1 || phase === 3 ? null : 'rgba(255,255,85,0.3)', phase === 1 || phase === 3 ? [2, 3] : null);
    const cx = (box.x + box.w / 2) * s, cy = (box.y + box.h / 2) * s, k = 3;
    const hx = cx + box.vx * s * k, hy = cy + box.vy * s * k;
    ctx.strokeStyle = '#F0A93A'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = '#F0A93A'; ctx.beginPath(); ctx.arc(hx, hy, 7, 0, TAU); ctx.fill();
    ctx.font = '600 11px ' + cssVar('--font-mono'); ctx.fillStyle = '#F0A93A';
    ctx.fillText(tr('속도 ×3', 'velocity ×3'), hx + 10, hy + 4);
  }
  const toWorld = (e) => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale, px: e.clientX - r.left, py: e.clientY - r.top }; };
  c.addEventListener('pointerdown', (e) => {
    const p = toWorld(e);
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const hx = (cx + box.vx * 3) * scale, hy = (cy + box.vy * 3) * scale;
    if (Math.hypot(p.px - hx, p.py - hy) < 16) drag = { type: 'vel' };
    else if (p.x >= box.x - 2 && p.x <= box.x + box.w + 2 && p.y >= box.y - 2 && p.y <= box.y + box.h + 2) drag = { type: 'box', ox: p.x - box.x, oy: p.y - box.y };
    else {
      const tx = Math.floor(p.x / 16), ty = Math.floor(p.y / 16);
      if (tx > 0 && ty > 0 && tx < lv.w - 1 && ty < lv.h - 1) { lv.tiles[ty * lv.w + tx] = lv.tiles[ty * lv.w + tx] ? 0 : T.GROUND; phase = 0; probe = []; draw(); }
      return;
    }
    e.preventDefault();
    try { c.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ }
  });
  c.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = toWorld(e);
    if (drag.type === 'vel') {
      box.vx = clamp(Math.round(((p.x - (box.x + box.w / 2)) / 3) * 4) / 4, -14, 14);
      box.vy = clamp(Math.round(((p.y - (box.y + box.h / 2)) / 3) * 4) / 4, -14, 14);
    } else {
      box.x = clamp(Math.round((p.x - drag.ox) * 2) / 2, 0, lv.w * 16 - box.w);
      box.y = clamp(Math.round((p.y - drag.oy) * 2) / 2, 0, lv.h * 16 - box.h);
    }
    phase = 0; probe = []; say.textContent = describe(); draw();
  });
  const up = () => { drag = null; };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  say.textContent = describe();
  draw();
  new ResizeObserver(debounce(draw, 100)).observe(bench);
  whenVisible(bench, () => {}, () => { if (auto) { clearInterval(auto); auto = 0; autoB.setAttribute('aria-pressed', 'false'); } });
}

// ── 6.3 손맛 실험장 ────────────────────────────────────────────
const FEEL_LEVEL = [
  '........................................', '........................................', '........................................',
  '..............................BBBB......',
  '........................................', '........................................', '........................................',
  '..............=====.....................',
  '........................................',
  '..P.....................J...............',
  '########...#########################...#',
  '########...#########################...#',
].join('\n');

function physFeel(host) {
  const strip = el('canvas', { class: 'vcanvas', style: { marginTop: '10px' } });
  const bar = el('div', { class: 'bench-bar' });
  const lv = Level.fromText(FEEL_LEVEL);
  const hist = [];
  let lastEv = null;
  const view = new GameView(host, {
    world: { mode: 'sandbox', level: lv, hud: false, noDrain: true, camOneWay: false, debug: { hitbox: false }, sound: true, onEvent: (ev, d) => { if (ev === 'jump') lastEv = d.coyote ? 'C' : d.buffered ? 'B' : 'J'; } },
    label: tr('점프 손맛 실험 화면', 'Jump feel test screen'), cls: 'wide', below: el('div', null, strip, bar),
    onUpdate: (w) => {
      hist.push({ held: w.input.held('jump'), pressed: w.input.pressed('jump'), ground: w.p.onGround, ev: lastEv });
      lastEv = null;
      if (hist.length > 150) hist.shift();
    },
    onRender: () => drawStrip(),
  });
  function drawStrip() {
    const W = strip.clientWidth || 600, H = 64;
    const ctx = fitCanvas(strip, W, H);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const x0 = 70, cw = (W - x0 - 4) / 150;
    ctx.font = '500 11px ' + cssVar('--font-body'); ctx.fillStyle = '#7D8B85';
    ctx.fillText(tr('점프 버튼', 'Jump button'), 6, 20); ctx.fillText(tr('땅에 닿음', 'On ground'), 6, 46);
    hist.forEach((h, i) => {
      const x = x0 + i * cw;
      if (h.held) { ctx.fillStyle = h.pressed ? '#FFFFFF' : '#5E6B66'; ctx.fillRect(x, 10, Math.max(1, cw), h.pressed ? 16 : 12); }
      if (h.ground) { ctx.fillStyle = '#2F8452'; ctx.fillRect(x, 38, Math.max(1, cw), 12); }
      if (h.ev) {
        ctx.fillStyle = h.ev === 'C' ? '#F0A93A' : h.ev === 'B' ? '#8CA6FF' : '#CAD5CF';
        ctx.fillRect(x, 4, Math.max(2, cw), 52);
        if (h.ev !== 'J') { ctx.font = '700 11px ' + cssVar('--font-body'); ctx.fillText(h.ev === 'C' ? tr('코요테', 'coyote') : tr('버퍼', 'buffer'), x + 4, 62); }
      }
    });
  }
  const w = () => view.world;
  const mk = (k, label, max) => {
    const r = el('input', { type: 'range', min: '0', max: String(max), step: '1', value: String(PHYS[k]), id: 'feel-' + k, 'aria-label': label });
    const v = el('span', { class: 'readout', text: PHYS[k] + 'f' });
    r.addEventListener('input', () => { PHYS[k] = +r.value; v.textContent = r.value + 'f'; savePhys(); });
    Bus.on('phys', () => { r.value = String(PHYS[k]); v.textContent = PHYS[k] + 'f'; });
    return el('span', { class: 'ctl' }, el('span', { class: 'lbl', text: label }), r, v);
  };
  const tog = (label, get, set) => {
    const b = el('button', { class: 'btn small', type: 'button', 'aria-pressed': String(get()), text: label });
    b.addEventListener('click', () => { set(!get()); b.setAttribute('aria-pressed', String(get())); });
    return b;
  };
  bar.append(mk('coyote', tr('코요테 타임', 'Coyote time'), 12), mk('buffer', tr('점프 버퍼', 'Jump buffer'), 12),
    tog(tr('가변 점프', 'Variable jump'), () => PHYS.varJump, (v) => { PHYS.varJump = v; savePhys(); }),
    tog(tr('히트박스', 'Hitboxes'), () => !!w().o.debug.hitbox, (v) => { w().o.debug.hitbox = v; }),
    tog(tr('0.25배 느리게', 'Quarter speed'), () => view.loop.timeScale < 1, (v) => { view.loop.timeScale = v ? 0.25 : 1; }));
}

// ── 6.4 터널링 ─────────────────────────────────────────────────
function physTunnel(host) {
  const bench = el('div', { class: 'bench wide' });
  const c = el('canvas', { class: 'vcanvas' });
  let speed = 18, mode = 'naive', x = 0, trail = [], result = '', t = 0, hold = 0;
  const WALL_X = 300, WALL_W = 6, BW = 8;
  const r = el('input', { type: 'range', min: '1', max: '40', step: '1', value: String(speed), id: 'tun-speed', 'aria-label': tr('탄환 속도', 'Bullet speed') });
  const rv = el('span', { class: 'readout', text: speed + tr('px/프레임', ' px/frame') });
  r.addEventListener('input', () => { speed = +r.value; rv.textContent = speed + tr('px/프레임', ' px/frame'); reset(); });
  const seg = segButtons([['naive', tr('그냥 이동', 'Plain move')], ['sub', tr('서브스텝 (4px씩)', 'Substeps (4 px each)')], ['sweep', tr('스윕 (선분 검사)', 'Sweep (segment test)')]], mode, (v) => { mode = v; reset(); });
  bench.append(c, el('div', { class: 'bench-bar' }, el('span', { class: 'lbl', text: tr('속도', 'Speed') }), r, rv, seg));
  host.append(bench);
  function reset() { x = 20; trail = [x]; result = ''; hold = 0; }
  function stepOnce() {
    const hitWall = (px) => px + BW > WALL_X && px < WALL_X + WALL_W;
    if (mode === 'naive') {
      x += speed;
      if (hitWall(x)) { x = WALL_X - BW; result = 'stop'; }
    } else if (mode === 'sub') {
      const n = Math.ceil(speed / 4);
      for (let i = 0; i < n; i++) { x += speed / n; if (hitWall(x)) { x = WALL_X - BW; result = 'stop'; break; } }
    } else {
      const nx = x + speed;
      if (x + BW <= WALL_X && nx + BW > WALL_X) { x = WALL_X - BW; result = 'stop'; } else x = nx;
    }
    trail.push(x);
    if (!result && x > WALL_X + WALL_W) result = 'through';
  }
  function draw() {
    const W = c.clientWidth || 640, H = 120;
    const ctx = fitCanvas(c, W, H);
    const s = W / 520;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#334040'; ctx.fillRect(WALL_X * s, 18, WALL_W * s, H - 40);
    ctx.font = '500 11px ' + cssVar('--font-mono'); ctx.fillStyle = '#7D8B85'; ctx.fillText(tr('벽 두께 6px', 'Wall 6 px thick'), WALL_X * s - 20, 13);
    trail.forEach((tx, i) => {
      ctx.globalAlpha = i === trail.length - 1 ? 1 : 0.35;
      ctx.fillStyle = result === 'through' && tx > WALL_X ? '#FF5B4A' : '#FFFF55';
      ctx.fillRect(tx * s, 54, BW * s, BW * s);
      ctx.globalAlpha = 1;
      if (i) { ctx.fillStyle = '#5E6B66'; ctx.fillText(String(i), tx * s, 86); }
    });
    ctx.font = '700 14px ' + cssVar('--font-body');
    if (result === 'through') { ctx.fillStyle = '#FF5B4A'; ctx.fillText(tr('벽을 그냥 통과했다 · 겹친 프레임이 없었다', 'Went straight through · no frame ever overlapped the wall'), 10, H - 8); }
    else if (result === 'stop') { ctx.fillStyle = '#63C68F'; ctx.fillText(tr('벽에서 멈췄다', 'Stopped at the wall'), 10, H - 8); }
    else { ctx.fillStyle = '#CAD5CF'; ctx.font = '500 12px ' + cssVar('--font-body'); ctx.fillText(tr('숫자 = 프레임. 한 프레임마다 ' + speed + 'px씩 순간이동한다.', 'Numbers = frames. Each frame it teleports ' + speed + ' px.'), 10, H - 8); }
  }
  reset();
  const loop = new FixedLoop({
    update: () => {
      t++;
      if (result) { if (++hold > 70) reset(); return; }
      if (t % 14 === 0) stepOnce();
      if (x > 520) reset();
    },
    render: draw,
  });
  draw();
  whenVisible(bench, () => loop.start(), () => loop.stop());
}

MOUNTS.physics = (root) => {
  physArcLab($('#phy-arc', root));
  physCollideLab($('#phy-collide', root));
  physFeel($('#phy-feel', root));
  physTunnel($('#phy-tunnel', root));
};
