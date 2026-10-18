// ───────────────────────────────────────────────────────────────
// 5장 · 사운드
// ───────────────────────────────────────────────────────────────
function soundOffNote() {
  const n = el('div', { class: 'small', style: { color: 'var(--signal)' } });
  const sync = () => { n.textContent = AudioSys.enabled ? '' : tr('소리가 꺼져 있다. 왼쪽 아래(휴대폰은 목차 안)의 소리 스위치를 켜자.', 'Sound is off. Turn it on with the sound switch at the bottom left (inside Contents on a phone).'); n.hidden = AudioSys.enabled; };
  sync(); Bus.on('sound', sync);
  return n;
}

// ── 5.1 PSG 건반 ───────────────────────────────────────────────
function psgDemo(host) {
  const bench = el('div', { class: 'bench wide' });
  const scope = el('canvas', { class: 'vcanvas', style: { height: '90px' } });
  const piano = el('div', { class: 'piano' });
  const info = el('dl', { class: 'kv', style: { color: 'var(--bezel-ink)' } });
  let oct = 4, vol = 13, held = null, down = false;
  const octLabel = el('span', { class: 'readout' });
  const prevO = el('button', { class: 'btn small', type: 'button', text: tr('◀ 옥타브', '◀ Octave') });
  const nextO = el('button', { class: 'btn small', type: 'button', text: tr('옥타브 ▶', 'Octave ▶') });
  prevO.addEventListener('click', () => { oct = Math.max(2, oct - 1); build(); });
  nextO.addEventListener('click', () => { oct = Math.min(6, oct + 1); build(); });
  const vr = el('input', { type: 'range', min: '0', max: '15', step: '1', value: String(vol), id: 'psg-vol', 'aria-label': tr('볼륨', 'Volume') });
  const vv = el('span', { class: 'readout' });
  const syncVol = () => { vv.textContent = tr('볼륨 ', 'Volume ') + vol + tr(' · 감쇠 ', ' · attenuation ') + (15 - vol) + ' = ' + (vol ? '-' + (2 * (15 - vol)) + ' dB' : tr('무음', 'silent')); };
  vr.addEventListener('input', () => { vol = +vr.value; syncVol(); });
  syncVol();
  const noiseRow = el('div', { class: 'row', style: { gap: '6px' } }, el('span', { class: 'lbl', text: tr('노이즈 (누르는 동안)', 'Noise (while held)') }));
  [[tr('백색·높음', 'White · high'), 0], [tr('백색·중간', 'White · mid'), 1], [tr('백색·낮음', 'White · low'), 2], [tr('백색·아주 낮음', 'White · lowest'), 3], [tr('주기·중간', 'Periodic · mid'), 5], [tr('주기·낮음', 'Periodic · low'), 6]].forEach(([label, r]) => {
    const b = el('button', { class: 'btn small', type: 'button', text: label });
    const on = (e) => { e.preventDefault(); AudioSys.unlock(); if (!AudioSys.ctx) return; AudioSys.demoNoise.write(AudioSys.ctx.currentTime, r, vol); b.classList.add('on'); showNoise(r); };
    const off = () => { if (AudioSys.ctx) AudioSys.demoNoise.silence(AudioSys.ctx.currentTime); b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
    noiseRow.append(b);
  });
  bench.append(scope, el('div', { class: 'grid2', style: { marginTop: '10px' } }, el('div', { class: 'stack' }, piano, el('div', { class: 'row' }, prevO, octLabel, nextO)), info),
    el('div', { class: 'bench-bar' }, vr, vv), noiseRow, soundOffNote());
  host.append(bench);

  function showNote(m) {
    const target = midiHz(m), n = psgN(target), real = psgHz(n), cents = 1200 * Math.log2(real / target);
    info.innerHTML = '';
    const row = (k, v) => info.append(el('dt', { text: k, style: { color: 'var(--bezel-dim)' } }), el('dd', { text: v }));
    row(tr('음', 'Note'), noteName(m) + ' (MIDI ' + m + ')');
    row(tr('목표 주파수', 'Target frequency'), target.toFixed(2) + ' Hz');
    if (m < PSG_MIN_MIDI) { row('N', tr('1023을 넘는다 → 낼 수 없는 음', 'over 1023 → the chip can\'t play it')); return; }
    row(tr('N (10비트)', 'N (10-bit)'), n + ' = 0x' + n.toString(16).toUpperCase().padStart(3, '0') + ' = ' + n.toString(2).padStart(10, '0'));
    row(tr('실제 주파수', 'Actual frequency'), real.toFixed(2) + ' Hz');
    row(tr('오차', 'Error'), (cents >= 0 ? '+' : '') + cents.toFixed(1) + ' cents');
  }
  function showNoise(r) {
    info.innerHTML = '';
    const row = (k, v) => info.append(el('dt', { text: k, style: { color: 'var(--bezel-dim)' } }), el('dd', { text: v }));
    row(tr('채널', 'Channel'), tr('노이즈', 'Noise'));
    row(tr('방식', 'Mode'), r < 4 ? tr('백색: 비트0 XOR 비트3 되먹임', 'White: feeds back bit 0 XOR bit 3') : tr('주기: 비트0만 되먹임 (16칸마다 반복)', 'Periodic: feeds back bit 0 only (repeats every 16)'));
    row(tr('시프트 속도', 'Shift rate'), tr('약 ', 'about ') + NOISE_RATES[r % 4].toLocaleString() + ' Hz');
  }
  function play(m, keyEl) {
    if (m < PSG_MIN_MIDI) { showNote(m); return; }
    AudioSys.unlock();
    held = keyEl;
    $$('.on', piano).forEach((k) => k.classList.remove('on'));
    keyEl.classList.add('on');
    showNote(m);
    if (!AudioSys.ctx) return;
    const t = AudioSys.ctx.currentTime;
    AudioSys.demoTone.cancel(t);
    AudioSys.demoTone.write(t, psgN(midiHz(m)), vol);
  }
  function stop() {
    down = false;
    if (held) held.classList.remove('on');
    held = null;
    if (AudioSys.ctx) AudioSys.demoTone.silence(AudioSys.ctx.currentTime);
  }
  function build() {
    piano.innerHTML = '';
    octLabel.textContent = 'C' + oct + ' ~ B' + (oct + 1);
    const whites = [0, 2, 4, 5, 7, 9, 11], blacks = [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]];
    const nW = 14;
    const keyFor = (m, k) => {
      k.addEventListener('pointerdown', (e) => { e.preventDefault(); down = true; try { k.releasePointerCapture(e.pointerId); } catch (x) { /* 무시 */ } play(m, k); });
      k.addEventListener('pointerenter', () => { if (down) play(m, k); });
      if (m < PSG_MIN_MIDI) k.classList.add('na');
    };
    for (let o = 0; o < 2; o++) {
      whites.forEach((s) => {
        const m = (oct + o + 1) * 12 + s;
        const k = el('div', { class: 'wk', text: s === 0 ? 'C' + (oct + o) : s === 9 ? 'A' + (oct + o) : '' });
        keyFor(m, k); piano.append(k);
      });
    }
    for (let o = 0; o < 2; o++) {
      blacks.forEach(([s, wi]) => {
        const m = (oct + o + 1) * 12 + s;
        const k = el('div', { class: 'bk', style: { left: 'calc(' + ((o * 7 + wi + 1) * (100 / nW)) + '% - 2.1%)' } });
        keyFor(m, k); piano.append(k);
      });
    }
  }
  window.addEventListener('pointerup', () => { if (down) stop(); });
  window.addEventListener('pointercancel', () => { if (down) stop(); });
  build();
  showNote(69);
  let raf = 0;
  const tick = () => { raf = requestAnimationFrame(tick); drawScope(scope, '#F0A93A'); };
  whenVisible(bench, () => { raf = requestAnimationFrame(tick); }, () => { cancelAnimationFrame(raf); stop(); });
}

// ── 5.2 효과음 디자이너 ────────────────────────────────────────
function drawSfxGraph(canvas, p, colors) {
  const W = canvas.clientWidth || 500, H = 190;
  const ctx = fitCanvas(canvas, W, H);
  const fr = compileSfx(p);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const n = fr.length, x0 = 34, cw = (W - x0 - 8) / Math.max(1, n);
  const pitchH = 110, volTop = 128, volH = 52;
  ctx.strokeStyle = '#263030'; ctx.lineWidth = 1;
  for (let i = 0; i <= n; i += 10) { const x = x0 + i * cw; ctx.beginPath(); ctx.moveTo(x + 0.5, 6); ctx.lineTo(x + 0.5, H - 6); ctx.stroke(); }
  ctx.font = '500 10px ' + cssVar('--font-mono'); ctx.fillStyle = '#7D8B85';
  ctx.fillText(tr('음높이', 'Pitch'), 2, 16); ctx.fillText(tr('볼륨', 'Vol'), 2, volTop + 12);
  for (let i = 0; i <= n; i += 10) ctx.fillText(String(i), x0 + i * cw + 2, H - 2);
  if (p.wave === 'noise') {
    ctx.fillStyle = '#263030';
    for (let i = 0; i < n; i++) for (let k = 0; k < 18; k++) { if ((i * 7 + k * 13) % 3 === 0) ctx.fillRect(x0 + i * cw, 12 + k * 5.5, Math.max(1, cw - 1), 2); }
    ctx.fillStyle = '#CAD5CF'; ctx.fillText(tr('노이즈 속도 ', 'Noise rate ') + p.rate + tr(' (약 ', ' (about ') + NOISE_RATES[p.rate | 0] + ' Hz)', x0 + 6, 24);
  } else {
    let lo = Infinity, hi = -Infinity;
    fr.forEach((f) => { lo = Math.min(lo, f.m); hi = Math.max(hi, f.m); });
    lo -= 2; hi += 2;
    const yOf = (m) => 10 + (1 - (m - lo) / Math.max(1, hi - lo)) * (pitchH - 16);
    ctx.strokeStyle = colors.signal; ctx.lineWidth = 2; ctx.beginPath();
    fr.forEach((f, i) => { const x = x0 + (i + 0.5) * cw, y = yOf(f.m); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
    ctx.fillStyle = colors.signal;
    if (cw > 4) fr.forEach((f, i) => { ctx.beginPath(); ctx.arc(x0 + (i + 0.5) * cw, yOf(f.m), 2, 0, TAU); ctx.fill(); });
    ctx.fillStyle = '#CAD5CF';
    ctx.fillText(noteName(Math.round(fr[0].m)), x0 + 4, Math.max(18, yOf(fr[0].m) - 6));
    const last = fr[fr.length - 1];
    ctx.textAlign = 'right'; ctx.fillText(noteName(Math.round(last.m)), W - 10, Math.max(18, yOf(last.m) - 6)); ctx.textAlign = 'left';
  }
  fr.forEach((f, i) => {
    const h = (f.v / 15) * volH;
    ctx.fillStyle = f.v ? '#8CA6FF' : '#263030';
    ctx.fillRect(x0 + i * cw + 0.5, volTop + volH - h, Math.max(1, cw - 1), Math.max(1, h));
  });
  return fr;
}

function sfxDesigner(host) {
  let cur = 'jump';
  const panel = el('div', { class: 'bench wide' });
  const list = el('div', { class: 'row', style: { gap: '6px' } });
  const graph = el('canvas', { class: 'vcanvas' });
  const lenInfo = el('div', { class: 'readout' });
  const params = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '10px 18px' } });
  const ta = el('textarea', { rows: '3', readonly: true, id: 'sfx-json', 'aria-label': tr('효과음 파라미터 JSON', 'Sound-effect parameters as JSON') });
  const copyB = el('button', { class: 'btn small', type: 'button', text: tr('JSON 복사', 'Copy JSON') });
  copyB.addEventListener('click', () => copyText(ta.value, copyB));
  const schema = [
    ['freq', tr('시작 음높이', 'Start pitch'), 60, 2400, 1, (v) => Math.round(v) + 'Hz · ' + noteName(Math.round(hzMidi(v)))],
    ['slide', tr('미끄러짐 (반음/프레임)', 'Slide (semitones per frame)'), -3, 3, 0.05, (v) => (+v).toFixed(2)],
    ['slideAcc', tr('미끄러짐 가속', 'Slide acceleration'), -0.2, 0.2, 0.005, (v) => (+v).toFixed(3)],
    ['vibDepth', tr('비브라토 깊이 (반음)', 'Vibrato depth (semitones)'), 0, 3, 0.05, (v) => (+v).toFixed(2)],
    ['vibSpeed', tr('비브라토 주기 (프레임)', 'Vibrato period (frames)'), 1, 16, 1, (v) => v],
    ['arpRate', tr('아르페지오 간격 (프레임, 0=끔)', 'Arpeggio step (frames, 0 = off)'), 0, 8, 1, (v) => (v == 0 ? tr('끔', 'off') : v)],
    ['vol', tr('볼륨', 'Volume'), 0, 15, 1, (v) => v],
    ['attack', tr('어택 (프레임)', 'Attack (frames)'), 0, 20, 1, (v) => v],
    ['sustain', tr('유지 (프레임)', 'Sustain (frames)'), 0, 40, 1, (v) => v],
    ['decay', tr('감쇠 (프레임)', 'Decay (frames)'), 0, 60, 1, (v) => v],
    ['rate', tr('노이즈 속도 (0=높음)', 'Noise rate (0 = highest)'), 0, 3, 1, (v) => v],
  ];
  const inputs = {};
  const playSoon = debounce(() => AudioSys.sfx(cur), 140);
  for (const [k, label, min, max, step, f] of schema) {
    const r = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), id: 'sfx-' + k, 'aria-label': label, style: { width: '100%' } });
    const v = el('span', { class: 'readout' });
    r.addEventListener('input', () => { SFX[cur][k] = +r.value; v.textContent = f(r.value); changed(); });
    inputs[k] = { r, v, f };
    params.append(el('div', { class: 'stack', style: { gap: '2px' } }, el('div', { class: 'row', style: { justifyContent: 'space-between' } }, el('span', { class: 'lbl small', style: { color: 'var(--bezel-dim)' }, text: label }), v), r));
  }
  const waveSeg = el('div', { class: 'seg' });
  const waveBtns = [['square', tr('사각파', 'Square')], ['noise', tr('노이즈', 'Noise')]].map(([v, label]) => {
    const b = el('button', { class: 'btn small', type: 'button', text: label });
    b.addEventListener('click', () => { SFX[cur].wave = v; sync(); changed(); });
    waveSeg.append(b);
    return [v, b];
  });
  const arpIn = el('input', { type: 'text', id: 'sfx-arp', 'aria-label': tr('아르페지오 반음들', 'Arpeggio semitones'), style: { width: '120px', background: 'var(--bezel-2)', color: 'var(--bezel-ink)', borderColor: 'var(--bezel-3)' } });
  arpIn.addEventListener('input', () => {
    const vals = arpIn.value.split(/[\s,]+/).map(Number).filter((x) => Number.isFinite(x)).slice(0, 8);
    SFX[cur].arp = vals.length ? vals : [0]; changed();
  });
  const loopCb = el('input', { type: 'checkbox', id: 'sfx-arploop' });
  loopCb.addEventListener('change', () => { SFX[cur].arpLoop = loopCb.checked; changed(); });
  const playB = el('button', { class: 'btn primary', type: 'button', text: tr('▶ 재생', '▶ Play') });
  playB.addEventListener('click', () => { AudioSys.unlock(); setTimeout(() => AudioSys.sfx(cur), 30); });
  const rndB = el('button', { class: 'btn', type: 'button', text: tr('무작위', 'Randomize') });
  rndB.addEventListener('click', () => { randomize(SFX[cur], false); sync(); changed(); });
  const mutB = el('button', { class: 'btn', type: 'button', text: tr('살짝 바꾸기', 'Mutate') });
  mutB.addEventListener('click', () => { randomize(SFX[cur], true); sync(); changed(); });
  const defB = el('button', { class: 'btn', type: 'button', text: tr('이 효과음 기본값', 'Reset this effect') });
  defB.addEventListener('click', () => { SFX[cur] = JSON.parse(JSON.stringify(SFX_DEFAULT[cur])); sync(); changed(); });
  Object.keys(SFX).forEach((k) => {
    const b = el('button', { class: 'btn small', type: 'button', text: SFX_LABELS[k] || k, 'data-k': k });
    b.addEventListener('click', () => { cur = k; sync(); AudioSys.unlock(); setTimeout(() => AudioSys.sfx(cur), 30); });
    list.append(b);
  });
  panel.append(el('div', { class: 'label', text: tr('게임이 쓰는 효과음 · 누르면 재생', 'The game\'s sound effects · select one to play it') }), list,
    el('div', { style: { marginTop: '12px' } }, graph), lenInfo,
    el('div', { class: 'bench-bar' }, waveSeg, playB, rndB, mutB, defB),
    el('div', { style: { marginTop: '10px' } }, params),
    el('div', { class: 'bench-bar' }, el('span', { class: 'lbl', text: tr('아르페지오 (반음)', 'Arpeggio (semitones)') }), arpIn, el('label', { class: 'check', for: 'sfx-arploop' }, loopCb, tr('반복', 'Loop'))),
    el('div', { class: 'row', style: { marginTop: '10px' } }, el('span', { class: 'label', text: tr('파라미터 (게임은 이 JSON을 읽는다)', 'Parameters (the game reads this JSON)') }), copyB), ta, soundOffNote());
  host.append(panel);
  function randomize(p, small) {
    const r = Math.random;
    if (!small) {
      p.wave = r() < 0.8 ? 'square' : 'noise';
      p.freq = Math.round(110 * Math.pow(2, r() * 4));
      p.slide = +((r() - 0.5) * 2.4).toFixed(2);
      p.slideAcc = +((r() - 0.5) * 0.08).toFixed(3);
      p.vibDepth = r() < 0.4 ? +(r() * 1.2).toFixed(2) : 0;
      p.vibSpeed = 2 + Math.floor(r() * 8);
      const arps = [[0], [0, 5], [0, 4, 7], [0, 12], [0, 7, 12], [0, -5]];
      p.arp = arps[Math.floor(r() * arps.length)];
      p.arpRate = p.arp.length > 1 ? 2 + Math.floor(r() * 4) : 0;
      p.arpLoop = r() < 0.4;
      p.vol = 9 + Math.floor(r() * 6);
      p.attack = r() < 0.7 ? 0 : Math.floor(r() * 6);
      p.sustain = Math.floor(r() * 16);
      p.decay = 4 + Math.floor(r() * 24);
      p.rate = Math.floor(r() * 4);
    } else {
      p.freq = Math.round(clamp(p.freq * (1 + (r() - 0.5) * 0.3), 60, 2400));
      p.slide = +clamp(p.slide + (r() - 0.5) * 0.4, -3, 3).toFixed(2);
      p.vibDepth = +clamp(p.vibDepth + (r() - 0.5) * 0.2, 0, 3).toFixed(2);
      p.sustain = clamp(p.sustain + Math.round((r() - 0.5) * 6), 0, 40);
      p.decay = clamp(p.decay + Math.round((r() - 0.5) * 8), 0, 60);
    }
  }
  function changed() {
    saveSfx();
    drawIt();
    Bus.emit('sfx', SFX);
    playSoon();
  }
  function drawIt() {
    const p = SFX[cur];
    const fr = drawSfxGraph(graph, p, benchColors());
    const modern = AudioSys.mixMode === 'modern';
    lenInfo.textContent = SFX_LABELS[cur] + ' · ' + fr.length + tr('프레임 = ', ' frames = ') + (fr.length / 60).toFixed(2) + tr('초 · ', ' s · ') + (modern ? tr('새 목소리로 섞임 (음악은 덕킹)', 'mixed as a new voice (music ducks)') : p.wave === 'noise' ? tr('노이즈 채널 (음악의 드럼 채널을 빌림)', 'noise channel (borrows the music\'s drum channel)') : tr('사각파 (음악의 화음 채널을 빌림)', 'square wave (borrows the music\'s harmony channel)')) + tr(' · 우선순위 ', ' · priority ') + (SFX_PRI[cur] || 1);
    ta.value = JSON.stringify(Object.assign({ name: cur }, p));
  }
  function sync() {
    const p = SFX[cur];
    $$('button', list).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === cur)));
    for (const k of Object.keys(inputs)) { inputs[k].r.value = String(p[k]); inputs[k].v.textContent = inputs[k].f(p[k]); }
    waveBtns.forEach(([v, b]) => b.setAttribute('aria-pressed', String(p.wave === v)));
    arpIn.value = (p.arp || [0]).join(', ');
    loopCb.checked = !!p.arpLoop;
    inputs.rate.r.closest('.stack').style.opacity = p.wave === 'noise' ? '1' : '0.4';
    drawIt();
  }
  sync();
  new ResizeObserver(debounce(drawIt, 100)).observe(panel);
  Bus.on('reset-all', sync);
}

// ── 5.3 트래커 ─────────────────────────────────────────────────
const CH_INFO = [
  { name: tr('리드', 'Lead'), color: '#FFFF55', lo: 72, hi: 96 },
  { name: tr('화음', 'Harmony'), color: '#55FFFF', lo: 52, hi: 72 },
  { name: tr('베이스', 'Bass'), color: '#FF9955', lo: 45, hi: 69 },
  { name: tr('드럼', 'Drums'), color: '#FF55AA', lo: 1, hi: 4 },
];
function trackerCell(ch, v) {
  if (v === -1) return ch === 3 ? '==' : '===';
  if (!v) return ch === 3 ? '··' : '···';
  if (ch === 3) return DRUMS[v] ? DRUMS[v].short : '??';
  const nm = noteName(v);
  return nm.length === 2 ? nm[0] + '-' + nm[1] : nm;
}

function trackerDemo(host) {
  const st = { pat: 'A', ch: 0, tool: 'note', hover: null, lastRowKey: '' };
  const bench = el('div', { class: 'bench wide' });
  const roll = el('canvas', { class: 'vcanvas', style: { touchAction: 'none', cursor: 'crosshair' } });
  const text = el('div', { class: 'tracker-text' });
  const regmon = el('div', { class: 'regmon' });
  const orderBox = el('div', { class: 'row', style: { gap: '4px' } });
  const playB = el('button', { class: 'btn primary', type: 'button', text: tr('▶ 재생', '▶ Play') });
  const stopB = el('button', { class: 'btn', type: 'button', text: tr('■ 정지', '■ Stop') });
  const fromB = el('button', { class: 'btn small', type: 'button', text: tr('이 패턴만 반복', 'Loop this pattern') });
  const speedR = el('input', { type: 'range', min: '3', max: '12', step: '1', value: String(SONG.speed), id: 'trk-speed', 'aria-label': tr('속도', 'Speed') });
  const speedV = el('span', { class: 'readout' });
  let soloSong = null;
  const syncSpeed = () => { speedV.textContent = tr('한 행 ' + SONG.speed + '프레임 ≈ ', SONG.speed + ' frames per row ≈ ') + Math.round(900 / SONG.speed) + ' BPM'; };
  speedR.addEventListener('input', () => { SONG.speed = +speedR.value; if (soloSong) soloSong.speed = SONG.speed; syncSpeed(); saveSong(); });
  playB.addEventListener('click', () => { AudioSys.unlock(); soloSong = null; setTimeout(() => AudioSys.playMusic(SONG, { owner: 'tracker' }), 30); });
  fromB.addEventListener('click', () => {
    AudioSys.unlock();
    soloSong = { speed: SONG.speed, loop: true, order: [st.pat], patterns: SONG.patterns };
    setTimeout(() => AudioSys.playMusic(soloSong, { owner: 'tracker' }), 30);
  });
  stopB.addEventListener('click', () => AudioSys.stopMusic());
  const patSeg = segButtons(Object.keys(SONG.patterns).map((k) => [k, tr('패턴 ', 'Pattern ') + k]), st.pat, (v) => { st.pat = v; st.lastRowKey = ''; drawRoll(); drawTrackerText(); });
  const chSeg = segButtons(CH_INFO.map((c, i) => [i, c.name]), st.ch, (v) => { st.ch = v; drawRoll(); });
  const toolSeg = segButtons([['note', tr('음표', 'Note')], ['off', tr('쉼표 (노트 오프)', 'Rest (note off)')], ['erase', tr('지우기', 'Erase')]], st.tool, (v) => { st.tool = v; });
  const resetB = confirmButton(tr('기본곡으로 되돌리기', 'Reset to the original song'), tr('한 번 더 누르기', 'Press again'), () => {
    const d = JSON.parse(SONG_DEFAULT_JSON);
    SONG.speed = d.speed; SONG.order = d.order; SONG.patterns = d.patterns;
    speedR.value = String(SONG.speed); syncSpeed(); saveSong(); drawOrder(); drawRoll(); drawTrackerText();
  });
  const sfxRow = el('div', { class: 'row', style: { gap: '6px' } }, el('span', { class: 'lbl', text: tr('채널 빌리기 실험', 'Channel borrowing test') }));
  [['jump', SFX_LABELS.jump], ['fruit', SFX_LABELS.fruit], ['power', SFX_LABELS.power], ['hit', SFX_LABELS.hit], ['die', SFX_LABELS.die]].forEach(([k, label]) => {
    const b = el('button', { class: 'btn small', type: 'button', text: label });
    b.addEventListener('click', () => { AudioSys.unlock(); AudioSys.sfx(k); });
    sfxRow.append(b);
  });
  const regs = CH_INFO.map((c, i) => {
    const big = el('div', { class: 'big', text: '—' }), det = el('div', { class: 'dim', text: ' ' }), bar = el('i'), steal = el('div', { class: 'steal', text: ' ' });
    const box = el('button', { class: 'reg', type: 'button', title: tr('눌러서 이 채널 끄기/켜기', 'Select to mute or unmute this channel'), style: { textAlign: 'left', cursor: 'pointer' } },
      el('div', { class: 'nm', text: 'CH' + i + ' · ' + c.name }), big, det, el('div', { class: 'vbar' }, bar), steal);
    box.addEventListener('click', () => {
      AudioSys.unlock();
      if (!AudioSys.music) return;
      const m = !AudioSys.music.userMute[i];
      AudioSys.music.setUserMute(i, m);
      box.style.opacity = m ? '0.45' : '1';
    });
    regmon.append(box);
    return { box, big, det, bar, steal };
  });
  bench.append(
    el('div', { class: 'bench-bar', style: { paddingTop: '0' } }, playB, stopB, fromB, speedR, speedV),
    el('div', { class: 'bench-bar' }, el('span', { class: 'lbl', text: tr('순서표', 'Order') }), orderBox),
    el('div', { class: 'bench-bar' }, patSeg, chSeg), el('div', { class: 'bench-bar', style: { paddingBottom: '10px' } }, toolSeg, el('span', { class: 'sp' }), resetB),
    roll,
    el('div', { class: 'label', style: { marginTop: '12px' }, text: tr('레지스터 모니터 · 지금 칩에 쓰이는 값 (눌러서 채널 끄기)', 'Register monitor · values being written to the chip (select to mute a channel)') }), regmon,
    el('div', { class: 'bench-bar' }, sfxRow),
    el('div', { class: 'label', style: { marginTop: '10px' }, text: tr('트래커 화면 · 같은 패턴을 글자로 (행 │ 리드 │ 화음 │ 베이스 │ 드럼)', 'Tracker view · the same pattern as text (row │ lead │ harmony │ bass │ drums)') }), text, soundOffNote());
  host.append(bench);
  syncSpeed();

  function drawOrder() {
    orderBox.innerHTML = '';
    const playingOrder = AudioSys.music && AudioSys.music.playing && AudioSys.music.owner === 'tracker' && !soloSong ? (AudioSys.music.current() || {}).order : -1;
    SONG.order.forEach((p, i) => {
      const b = el('button', { class: 'btn small', type: 'button', text: p, title: tr('눌러서 다른 패턴으로 바꾸기', 'Select to switch to another pattern'), 'aria-pressed': String(i === playingOrder) });
      b.addEventListener('click', () => { const keys = Object.keys(SONG.patterns); SONG.order[i] = keys[(keys.indexOf(p) + 1) % keys.length]; saveSong(); drawOrder(); });
      orderBox.append(b);
    });
    const add = el('button', { class: 'btn small', type: 'button', text: '+', 'aria-label': tr('순서 추가', 'Add to order') });
    add.addEventListener('click', () => { if (SONG.order.length < 16) { SONG.order.push('A'); saveSong(); drawOrder(); } });
    const rem = el('button', { class: 'btn small', type: 'button', text: '−', 'aria-label': tr('마지막 순서 지우기', 'Remove the last entry') });
    rem.addEventListener('click', () => { if (SONG.order.length > 1) { SONG.order.pop(); saveSong(); drawOrder(); } });
    orderBox.append(add, rem);
  }
  const rowsFor = (ch) => (ch === 3 ? [4, 3, 2, 1] : Array.from({ length: CH_INFO[ch].hi - CH_INFO[ch].lo + 1 }, (_, i) => CH_INFO[ch].hi - i));
  let geo = null;
  function drawRoll(playPos) {
    const W = roll.clientWidth || 700;
    const rows = rowsFor(st.ch), rh = st.ch === 3 ? 26 : 12, x0 = 48, top = 14;
    const H = top + rows.length * rh + 4;
    const ctx = fitCanvas(roll, W, H);
    const cw = (W - x0 - 4) / 32;
    geo = { x0, top, rh, cw, rows };
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.font = '500 10px ' + cssVar('--font-mono');
    rows.forEach((m, r) => {
      const y = top + r * rh;
      const sharp = st.ch !== 3 && [1, 3, 6, 8, 10].includes(m % 12);
      ctx.fillStyle = sharp ? '#0B0F0F' : '#151B1B';
      ctx.fillRect(x0, y, W - x0, rh - 1);
      ctx.fillStyle = sharp ? '#5E6B66' : '#9AA6A1';
      const label = st.ch === 3 ? DRUMS[m].name : (m % 12 === 0 || r === 0 || r === rows.length - 1 || !sharp && rh >= 12 && m % 12 === 9 ? noteName(m) : '');
      if (label) ctx.fillText(label, 4, y + rh - 3);
    });
    for (let s = 0; s <= 32; s++) {
      ctx.fillStyle = s % 16 === 0 ? '#7D8B85' : s % 4 === 0 ? '#3A4646' : '#202828';
      ctx.fillRect(x0 + s * cw, top, 1, rows.length * rh);
    }
    const pat = SONG.patterns[st.pat][st.ch];
    for (let s = 0; s < 32; s++) {
      const v = pat[s];
      if (v === -1) { ctx.fillStyle = '#FF5B4A'; ctx.fillRect(x0 + s * cw + 1, 2, Math.max(2, cw - 2), 9); continue; }
      if (v <= 0) continue;
      let e = s + 1;
      while (e < 32 && pat[e] === 0) e++;
      if (st.ch === 3) e = s + 1;
      const r = rows.indexOf(v);
      if (r < 0) continue;
      ctx.fillStyle = CH_INFO[st.ch].color;
      ctx.fillRect(x0 + s * cw + 1, top + r * rh + 1, (e - s) * cw - 2, rh - 3);
      ctx.fillStyle = '#000';
      ctx.fillRect(x0 + s * cw + 1, top + r * rh + 1, 2, rh - 3);
    }
    if (st.hover) {
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1;
      ctx.strokeRect(x0 + st.hover.s * cw + 0.5, top + st.hover.r * rh + 0.5, cw - 1, rh - 1);
    }
    if (playPos && playPos.pat === st.pat) {
      const x = x0 + (playPos.row + playPos.frac) * cw;
      ctx.fillStyle = cssVar('--signal'); ctx.fillRect(x, 0, 2, H);
    }
  }
  function drawTrackerText(curRow) {
    const pat = SONG.patterns[st.pat];
    const key = st.pat + ':' + curRow + ':' + JSON.stringify(pat).length + SONG.order.join('');
    if (key === st.lastRowKey) return;
    st.lastRowKey = key;
    text.innerHTML = '';
    for (let r = 0; r < 32; r++) {
      const line = String(r).padStart(2, '0') + ' │ ' + [0, 1, 2, 3].map((c) => trackerCell(c, pat[c][r])).join(' │ ');
      const span = el('span', { class: r === curRow ? 'cur' : r % 4 === 0 ? 'beat' : '', text: line });
      text.append(span, '\n');
      if (r === curRow) setTimeout(() => { const top = span.offsetTop - text.clientHeight / 2; text.scrollTop = Math.max(0, top); }, 0);
    }
  }
  function cellAt(e) {
    if (!geo) return null;
    const r = roll.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const s = Math.floor((x - geo.x0) / geo.cw), row = Math.floor((y - geo.top) / geo.rh);
    if (s < 0 || s >= 32 || row < 0 || row >= geo.rows.length) return null;
    return { s, r: row, v: geo.rows[row] };
  }
  function preview(ch, v) {
    if (!AudioSys.ctx || !AudioSys.enabled) return;
    const t = AudioSys.ctx.currentTime;
    if (ch === 3) {
      const d = DRUMS[v];
      AudioSys.demoNoise.cancel(t);
      d.vol.forEach((vv, i) => AudioSys.demoNoise.write(t + i / 60, d.rate, vv));
      AudioSys.demoNoise.silence(t + d.vol.length / 60);
    } else {
      AudioSys.demoTone.cancel(t);
      const offs = ch === 1 ? diatonicArp(v) : [0];
      for (let i = 0; i < 12; i++) AudioSys.demoTone.write(t + i / 60, psgN(midiHz(v + offs[i % offs.length])), 11 - Math.floor(i / 3));
      AudioSys.demoTone.silence(t + 12 / 60);
    }
  }
  roll.addEventListener('pointerdown', (e) => {
    const c = cellAt(e);
    if (!c) return;
    e.preventDefault();
    AudioSys.unlock();
    const pat = SONG.patterns[st.pat][st.ch];
    if (st.tool === 'erase') pat[c.s] = 0;
    else if (st.tool === 'off') pat[c.s] = pat[c.s] === -1 ? 0 : -1;
    else if (pat[c.s] === c.v) pat[c.s] = 0;
    else { pat[c.s] = c.v; preview(st.ch, c.v); }
    saveSong(); st.lastRowKey = ''; drawRoll(); drawTrackerText();
  });
  roll.addEventListener('pointermove', (e) => { st.hover = cellAt(e); drawRoll(lastPos); });
  roll.addEventListener('pointerleave', () => { st.hover = null; drawRoll(lastPos); });

  let raf = 0, lastPos = null, lastOrder = -2;
  function tick() {
    raf = requestAnimationFrame(tick);
    const mus = AudioSys.music;
    const f = mus && mus.playing && mus.owner === 'tracker' ? mus.current() : null;
    if (f) {
      const song = mus.song;
      const patName = song.order[f.order];
      const next = mus.timeline.find((x) => x.t > f.t && (x.row !== f.row || x.order !== f.order));
      const frac = next ? clamp((AudioSys.ctx.currentTime - f.t) / (next.t - f.t), 0, 0.99) : 0;
      lastPos = { pat: patName, row: f.row, frac };
      drawRoll(lastPos);
      drawTrackerText(patName === st.pat ? f.row : -1);
      if (f.order !== lastOrder) { lastOrder = f.order; drawOrder(); }
      f.regs.forEach((rg, i) => {
        const R = regs[i];
        if (!rg) { R.big.textContent = '—'; R.det.textContent = tr('쉼', 'rest'); R.bar.style.width = '0'; }
        else if (i === 3) { R.big.textContent = DRUMS[rg.drum] ? DRUMS[rg.drum].name : tr('노이즈', 'Noise'); R.det.textContent = tr('속도 ', 'rate ') + rg.rate; R.bar.style.width = (rg.v / 15) * 100 + '%'; }
        else { R.big.textContent = noteName(rg.m); R.det.textContent = 'N=0x' + rg.n.toString(16).toUpperCase().padStart(3, '0') + ' ' + psgHz(rg.n).toFixed(1) + 'Hz'; R.bar.style.width = (rg.v / 15) * 100 + '%'; }
      });
    } else if (lastPos) {
      lastPos = null; drawRoll(); drawTrackerText(-1); drawOrder(); lastOrder = -2;
      regs.forEach((R) => { R.big.textContent = '—'; R.det.textContent = ' '; R.bar.style.width = '0'; });
    }
    regs.forEach((R, i) => {
      const s = AudioSys.sfxPlayer ? AudioSys.sfxPlayer.stolen(i) : null;
      R.box.classList.toggle('stolen', !!s);
      R.steal.textContent = s ? tr('효과음 \'' + (SFX_LABELS[s] || s) + '\'이 빌려 씀', 'Borrowed by \'' + (SFX_LABELS[s] || s) + '\'') : ' ';
    });
  }
  drawOrder(); drawRoll(); drawTrackerText(-1);
  whenVisible(bench, () => { raf = requestAnimationFrame(tick); }, () => { cancelAnimationFrame(raf); AudioSys.stopMusic('tracker'); });
  new ResizeObserver(debounce(() => drawRoll(lastPos), 100)).observe(bench);
  Bus.on('reset-all', () => { speedR.value = String(SONG.speed); syncSpeed(); drawOrder(); drawRoll(); st.lastRowKey = ''; drawTrackerText(-1); });
}

MOUNTS.sound = (root) => {
  psgDemo($('#snd-psg', root));
  sfxDesigner($('#snd-sfx', root));
  trackerDemo($('#snd-tracker', root));
};
