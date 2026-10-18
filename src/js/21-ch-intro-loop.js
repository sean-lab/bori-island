// ───────────────────────────────────────────────────────────────
// 0장 · 1장
// ───────────────────────────────────────────────────────────────
MOUNTS.intro = (root) => {
  const bar = el('div', { class: 'bench-bar' });
  const view = new GameView($('#intro-attract', root), {
    world: { mode: 'attract', hud: true, sound: false, music: false },
    label: tr('자동 플레이 데모 화면', 'Self-playing demo'), touch: false, hint: tr('자동 플레이 데모 · 누르면 9장으로', 'Self-playing demo · click to go to Chapter 9'), cls: 'wide', below: bar,
  });
  view.screen.addEventListener('click', () => { location.hash = '#play'; });
  bar.append(
    el('span', { class: 'lamp on', text: tr('데모 플레이', 'Demo play') }),
    el('span', { class: 'readout dim', text: '256×192 · 60Hz' }),
    el('span', { class: 'sp' }),
    el('a', { class: 'btn primary', href: '#play', text: tr('직접 플레이하기 →', 'Play it yourself →') }),
  );
};

function benchColors() {
  return { ink: cssVar('--bezel-ink'), dim: cssVar('--bezel-dim'), line: cssVar('--bezel-3'), signal: cssVar('--signal'), blue: '#8CA6FF', red: '#FF6B57' };
}

// 1.2 가변 Δt vs 고정 Δt
function loopDtDemo(host) {
  const G = 900, V0 = 300, VMAX = 300, PLAT = 62, THICK = 6, FLOOR = 94, SCALE = 2;
  const bench = el('div', { class: 'bench wide' });
  const panes = el('div', { class: 'grid2' });
  const mkPane = (title, fixed) => {
    const c = el('canvas', { class: 'vcanvas' });
    const ro = el('div', { class: 'readout' });
    panes.append(el('div', { class: 'stack' }, el('div', { class: 'label', text: title }), c, ro));
    return { c, ro, fixed, y: PLAT, vy: 0, ground: 'plat', rest: 0, minY: PLAT, apexes: [], through: 0, maxStep: 0, trail: [], acc: 0, msg: '', msgT: 0 };
  };
  const A = mkPane(tr('가변 Δt · y += vy × dt', 'Variable Δt · y += vy × dt'), false);
  const B = mkPane(tr('고정 Δt · 1/60초씩 잘라서', 'Fixed Δt · sliced into 1/60 s steps'), true);
  let hz = 60, spike = 0;
  const hzSeg = el('div', { class: 'seg' });
  [15, 30, 60, 144].forEach((v) => {
    const b = el('button', { class: 'btn small', type: 'button', text: v + 'Hz', 'aria-pressed': String(v === hz) });
    b.addEventListener('click', () => { hz = v; $$('button', hzSeg).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
    hzSeg.append(b);
  });
  const lag = el('button', { class: 'btn small', type: 'button', text: tr('렉 한 번 (0.2초 멈춤)', 'One lag spike (0.2 s freeze)') });
  lag.addEventListener('click', () => { spike = 0.2; });
  const reset = el('button', { class: 'btn small', type: 'button', text: tr('기록 지우기', 'Clear stats') });
  reset.addEventListener('click', () => { for (const s of [A, B]) { s.apexes = []; s.through = 0; s.maxStep = 0; } });
  bench.append(panes, el('div', { class: 'bench-bar' }, el('span', { class: 'lbl', text: tr('화면 갱신률', 'Refresh rate') }), hzSeg, lag, reset));
  host.append(bench);

  function step(s, dt) {
    if (s.ground === 'plat' || s.ground === 'floor') {
      s.rest += dt;
      if (s.ground === 'plat' && s.rest > 0.25) { s.vy = -V0; s.ground = null; s.minY = s.y; s.rest = 0; }
      if (s.ground === 'floor' && s.rest > 0.8) { s.y = PLAT; s.vy = 0; s.ground = 'plat'; s.rest = 0; }
      s.trail.push(s.y); if (s.trail.length > 40) s.trail.shift();
      return;
    }
    const prev = s.y;
    s.vy = Math.min(s.vy + G * dt, VMAX);
    s.y += s.vy * dt;
    s.maxStep = Math.max(s.maxStep, Math.abs(s.y - prev));
    s.minY = Math.min(s.minY, s.y);
    // 두 화면 모두 같은 '겹침' 검사: 발이 발판 두께 안에 들어와 있으면 착지
    if (s.vy > 0 && s.y >= PLAT && s.y <= PLAT + THICK) {
      s.y = PLAT; s.vy = 0; s.ground = 'plat'; s.rest = 0;
      s.apexes.push(PLAT - s.minY); if (s.apexes.length > 4) s.apexes.shift();
    } else if (s.y >= FLOOR) {
      s.y = FLOOR; s.vy = 0; s.ground = 'floor'; s.rest = 0; s.through++;
      s.apexes.push(PLAT - s.minY); if (s.apexes.length > 4) s.apexes.shift();
      s.msg = tr('발판을 뚫고 떨어짐', 'Fell through the platform'); s.msgT = 1.2;
    }
    s.trail.push(s.y); if (s.trail.length > 40) s.trail.shift();
  }
  function draw(s) {
    const W = s.c.clientWidth || 300, H = 220;
    const ctx = fitCanvas(s.c, W, H);
    const C = benchColors();
    ctx.fillStyle = '#55AAFF'; ctx.fillRect(0, 0, W, H);
    const yy = (y) => (y + 6) * SCALE;
    ctx.fillStyle = '#AA5500'; ctx.fillRect(0, yy(FLOOR), W, H - yy(FLOOR));
    ctx.fillStyle = '#00AA00'; ctx.fillRect(0, yy(FLOOR), W, 4);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(W * 0.2, yy(PLAT), W * 0.6, THICK * SCALE);
    ctx.fillStyle = '#000'; ctx.fillRect(W * 0.2, yy(PLAT) + THICK * SCALE - 2, W * 0.6, 2);
    ctx.font = '600 11px ' + cssVar('--font-mono');
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillText(tr('발판 두께 6px', 'Platform 6 px thick'), W * 0.2 + 4, yy(PLAT) + THICK * SCALE + 13);
    const cx = W / 2;
    ctx.fillStyle = 'rgba(255,255,85,0.95)';
    s.trail.forEach((y, i) => { ctx.globalAlpha = 0.2 + 0.8 * (i / s.trail.length); ctx.fillRect(cx + 26, yy(y) - 2, 8, 3); });
    ctx.globalAlpha = 1;
    if (s.apexes.length) {
      const top = PLAT - s.apexes[s.apexes.length - 1];
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(W * 0.2, yy(top)); ctx.lineTo(W * 0.8, yy(top)); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.imageSmoothingEnabled = false;
    const key = s.ground ? 'idle' : s.vy < 0 ? 'jump' : 'fall';
    ctx.drawImage(SHEETS.hero.canvas(key), cx - 16, yy(s.y) - 32, 32, 32);
    if (s.msgT > 0) {
      ctx.font = '700 14px ' + cssVar('--font-body');
      ctx.fillStyle = '#BF3720'; ctx.fillText(s.msg, 10, 22);
    }
    const ap = s.apexes.map((a) => a.toFixed(0)).join(' · ') || '—';
    s.ro.innerHTML = '';
    s.ro.append(
      el('div', null, tr('최근 최고 높이 ', 'Recent peak heights '), el('b', { text: ap }), ' px'),
      el('div', null, tr('업데이트 한 번에 최대 ', 'Largest move in one update: '), el('b', { text: s.maxStep.toFixed(1) }), tr('px 이동', ' px')),
      el('div', { style: { color: s.through ? '#FF6B57' : 'inherit' } }, tr('발판을 뚫은 횟수 ', 'Times it fell through: '), el('b', { text: String(s.through) })),
    );
  }
  let acc = 0, last = 0, raf = 0;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const real = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    acc += real;
    const period = 1 / hz;
    if (acc < period) return;
    // 실제 기기처럼: 화면이 느리면 프레임 간격이 들쭉날쭉하다 (16.7ms의 배수로 떨어진다)
    const frames = [];
    if (period < 1 / 50) { let n = Math.floor(acc / period); acc -= n * period; while (n--) frames.push(period); }
    else { frames.push(acc); acc = 0; }
    frames[0] += spike;
    spike = 0;
    for (const dt of frames) {
      step(A, dt);
      B.acc += dt;
      let n = 0;
      while (B.acc >= 1 / 60 && n < 40) { step(B, 1 / 60); B.acc -= 1 / 60; n++; }
      for (const s of [A, B]) if (s.msgT > 0) s.msgT -= dt;
    }
    draw(A); draw(B);
  }
  draw(A); draw(B);
  whenVisible(bench, () => { last = 0; raf = requestAnimationFrame(tick); }, () => cancelAnimationFrame(raf));
}

// 1.3 누산기 타임라인과 보간
function loopTimelineDemo(host) {
  const bench = el('div', { class: 'bench wide' });
  const tl = el('canvas', { class: 'vcanvas' });
  const mv = el('canvas', { class: 'vcanvas', style: { marginTop: '10px' } });
  let monHz = 60, physHz = 10, interp = true;
  const seg = (vals, cur, fmtv, set) => {
    const s = el('div', { class: 'seg' });
    vals.forEach((v) => {
      const b = el('button', { class: 'btn small', type: 'button', text: fmtv(v), 'aria-pressed': String(v === cur) });
      b.addEventListener('click', () => { set(v); $$('button', s).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
      s.append(b);
    });
    return s;
  };
  const ib = el('button', { class: 'btn small', type: 'button', 'aria-pressed': 'true', text: tr('보간 켜짐', 'Interpolation on') });
  ib.addEventListener('click', () => { interp = !interp; ib.setAttribute('aria-pressed', String(interp)); ib.textContent = interp ? tr('보간 켜짐', 'Interpolation on') : tr('보간 꺼짐', 'Interpolation off'); });
  const ro = el('span', { class: 'readout' });
  bench.append(tl, mv,
    el('div', { class: 'bench-bar' },
      el('span', { class: 'lbl', text: tr('화면', 'Display') }), seg([30, 60, 0], monHz, (v) => (v ? v + 'Hz' : tr('기기 그대로', 'Native')), (v) => { monHz = v; }),
      el('span', { class: 'lbl', text: tr('물리', 'Physics') }), seg([10, 20, 60], physHz, (v) => v + 'Hz', (v) => { physHz = v; acc = 0; }),
      ib, el('span', { class: 'sp' }), ro));
  host.append(bench);
  let acc = 0, last = 0, monAcc = 0, raf = 0, t = 0;
  let x = 40, px = 40, vx = 150;
  const renders = [], updates = [], accs = [];
  function update() {
    px = x;
    x += vx / physHz;
    const W = mv.clientWidth || 600;
    if (x > W - 40) { x = W - 40; vx = -Math.abs(vx); }
    if (x < 40) { x = 40; vx = Math.abs(vx); }
  }
  function drawMotion(alpha) {
    const W = mv.clientWidth || 600, H = 84;
    const ctx = fitCanvas(mv, W, H);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#263030';
    for (let gx = 0; gx < W; gx += 20) { ctx.beginPath(); ctx.moveTo(gx + 0.5, 0); ctx.lineTo(gx + 0.5, H); ctx.stroke(); }
    const dx = interp ? lerp(px, x, alpha) : x;
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(dx, 26);
    if (vx < 0) ctx.scale(-1, 1);
    ctx.drawImage(SHEETS.hero.canvas(animFrame('run', Math.floor(t * 60))), -16, 0, 32, 32);
    ctx.restore();
    ctx.font = '600 12px ' + cssVar('--font-mono');
    ctx.fillStyle = '#7D8B85';
    ctx.fillText(interp ? tr('α로 섞어서 그림', 'Drawn blended by α') : tr('마지막 업데이트 위치 그대로', 'Drawn at the last update position'), 10, H - 10);
  }
  function drawTimeline(now) {
    const W = tl.clientWidth || 600, H = 150;
    const ctx = fitCanvas(tl, W, H);
    const C = benchColors();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const span = 0.6, x0 = 92, sx = (tt) => x0 + (W - x0 - 8) * (1 - (now - tt) / span);
    ctx.font = '500 12px ' + cssVar('--font-body');
    ctx.fillStyle = C.dim;
    ctx.fillText(tr('그리기', 'Render'), 10, 32); ctx.fillText(tr('업데이트', 'Update'), 10, 72); ctx.fillText(tr('누산기', 'Accumulator'), 10, 122);
    ctx.strokeStyle = C.line;
    for (const y of [48, 90]) { ctx.beginPath(); ctx.moveTo(x0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
    for (const r of renders) { if (now - r > span) continue; const X = sx(r); ctx.beginPath(); ctx.moveTo(X, 16); ctx.lineTo(X, 42); ctx.stroke(); }
    ctx.fillStyle = C.signal;
    let prevT = -1, stack = 0;
    for (const u of updates) {
      if (now - u > span) continue;
      stack = Math.abs(u - prevT) < 0.0005 ? stack + 1 : 0; prevT = u;
      ctx.beginPath(); ctx.arc(sx(u), 68 - stack * 8, 4, 0, TAU); ctx.fill();
    }
    const yAcc = (v) => 140 - Math.min(1.3, v) * 36;
    ctx.setLineDash([3, 4]); ctx.strokeStyle = C.dim; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, yAcc(1)); ctx.lineTo(W, yAcc(1)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.dim; ctx.font = '500 10px ' + cssVar('--font-mono'); ctx.fillText(tr('1스텝', '1 step'), W - 40, yAcc(1) - 4);
    ctx.strokeStyle = C.blue; ctx.lineWidth = 2; ctx.beginPath();
    let started = false, lastY = 0;
    for (const a of accs) {
      if (now - a.t > span) continue;
      const X = sx(a.t), Y = yAcc(a.v);
      if (!started) { ctx.moveTo(X, Y); started = true; } else { ctx.lineTo(X, lastY); ctx.lineTo(X, Y); }
      lastY = Y;
    }
    if (started) ctx.lineTo(W, lastY);
    ctx.stroke();
  }
  function tick(nowMs) {
    raf = requestAnimationFrame(tick);
    const now = nowMs / 1000;
    const real = last ? Math.min(0.1, now - last) : 0;
    last = now; t += real;
    let render = true;
    if (monHz) { monAcc += real; if (monAcc >= 1 / monHz - 0.002) monAcc = Math.max(0, monAcc - 1 / monHz); else render = false; }
    if (render) {
      const sinceLast = renders.length ? now - renders[renders.length - 1] : 0;
      acc += sinceLast;
      let n = 0;
      while (acc >= 1 / physHz && n < 10) { update(); updates.push(now); acc -= 1 / physHz; n++; }
      renders.push(now);
      accs.push({ t: now, v: acc * physHz });
      drawMotion(acc * physHz);
      ro.textContent = 'α = ' + (acc * physHz).toFixed(2);
    }
    while (renders.length && now - renders[0] > 1) renders.shift();
    while (updates.length && now - updates[0] > 1) updates.shift();
    while (accs.length && now - accs[0].t > 1) accs.shift();
    drawTimeline(now);
  }
  drawMotion(0); drawTimeline(0);
  whenVisible(bench, () => { last = 0; raf = requestAnimationFrame(tick); }, () => cancelAnimationFrame(raf));
}

MOUNTS.loop = (root) => {
  loopDtDemo($('#loop-dt', root));
  loopTimelineDemo($('#loop-timeline', root));
};
