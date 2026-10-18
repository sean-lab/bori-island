// ───────────────────────────────────────────────────────────────
// 7장 · 입력, 상태 기계, 연출, 디버그, 폰트
// ───────────────────────────────────────────────────────────────
const BASICS_LEVEL = [
  '................................', '................................', '................................',
  '................................', '................................', '................................',
  '................................',
  '..........=====.................',
  '................................',
  '..P.......r..........J.....1....',
  '##############....##############',
  '##############~~~~##############',
].join('\n');

const FSM_NODES = {
  idle: { x: 30, y: 24, label: tr('서기', 'Idle'), en: 'idle' },
  run: { x: 30, y: 214, label: tr('달리기', 'Run'), en: 'run' },
  jump: { x: 290, y: 24, label: tr('점프', 'Jump'), en: 'jump' },
  fall: { x: 290, y: 214, label: tr('낙하', 'Fall'), en: 'fall' },
  stumble: { x: 550, y: 24, label: tr('비틀', 'Stumble'), en: 'stumble' },
  dead: { x: 550, y: 214, label: tr('죽음', 'Dead'), en: 'dead' },
};
const NW = 140, NH = 56;
const FSM_EDGES = [
  { id: 'idle-run', d: 'M80 80 L80 214', lx: 74, ly: 150, label: tr('좌우 입력', 'move'), anchor: 'end' },
  { id: 'run-idle', d: 'M120 214 L120 80', lx: 128, ly: 150, label: tr('멈춤', 'stop'), anchor: 'start' },
  { id: 'idle-jump', d: 'M170 44 L290 44', lx: 230, ly: 36, label: tr('점프 눌림', 'jump pressed'), anchor: 'middle' },
  { id: 'run-jump', d: 'M170 222 L290 72', lx: 214, ly: 170, label: tr('점프 눌림', 'jump pressed'), anchor: 'middle' },
  { id: 'jump-fall', d: 'M360 80 L360 214', lx: 368, ly: 150, label: 'vy ≥ 0', anchor: 'start' },
  { id: 'fall-run', d: 'M290 260 L170 260', lx: 230, ly: 280, label: tr('착지 (움직임)', 'land while moving'), anchor: 'middle' },
  { id: 'fall-idle', d: 'M290 230 Q 220 150 170 66', lx: 252, ly: 120, label: tr('착지', 'land'), anchor: 'middle' },
  { id: 'run-fall', d: 'M170 240 L290 240', lx: 230, ly: 232, label: tr('발판 벗어남', 'walk off edge'), anchor: 'middle' },
  { id: 'any-stumble', d: 'M430 44 L550 44', lx: 490, ly: 36, label: tr('돌에 걸림', 'hit a rock'), anchor: 'middle' },
  { id: 'stumble-idle', d: 'M620 24 Q 620 -2 330 4 Q 100 8 100 24', lx: 360, ly: 18, label: tr('24프레임 뒤', 'after 24 frames'), anchor: 'middle' },
  { id: 'any-dead', d: 'M430 242 L550 242', lx: 490, ly: 234, label: tr('위험에 닿음', 'touch a hazard'), anchor: 'middle' },
  { id: 'dead-idle', d: 'M620 270 Q 620 304 360 304 Q 60 304 60 270', lx: 360, ly: 298, label: tr('체크포인트에서 다시', 'respawn at checkpoint'), anchor: 'middle' },
];
function fsmEdgeKey(from, to) {
  if (to === 'stumble') return 'any-stumble';
  if (to === 'dead') return 'any-dead';
  if (from === 'dead') return 'dead-idle';
  if (from === 'stumble') return 'stumble-idle';
  if (from === 'jump' && (to === 'idle' || to === 'run')) return 'fall-' + to;
  if (from === 'idle' && to === 'fall') return 'run-fall';
  return from + '-' + to;
}

function buildFsmSvg() {
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const svg = mk('svg', { class: 'fsm', viewBox: '-10 -10 736 330', role: 'img', 'aria-label': tr('보리의 상태 기계 그림', 'Diagram of Bori\'s state machine') });
  const defs = mk('defs', {});
  for (const [id, cls] of [['ah', 'arrowhead'], ['ahHot', 'arrowhead hot']]) {
    const m = mk('marker', { id: 'fsm-' + id, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    const p = mk('path', { d: 'M0 0 L10 5 L0 10 z', class: cls });
    if (id === 'ahHot') p.setAttribute('style', 'fill: var(--redpen)');
    m.append(p); defs.append(m);
  }
  svg.append(defs);
  const edges = {};
  for (const e of FSM_EDGES) {
    const path = mk('path', { d: e.d, class: 'edge', 'marker-end': 'url(#fsm-ah)' });
    const t = mk('text', { x: e.lx, y: e.ly, class: 'elabel', 'text-anchor': e.anchor });
    t.textContent = e.label;
    svg.append(path, t);
    edges[e.id] = path;
  }
  const nodes = {};
  for (const [k, n] of Object.entries(FSM_NODES)) {
    const g = mk('g', { class: 'node' });
    g.append(mk('rect', { x: n.x, y: n.y, width: NW, height: NH, rx: 10 }));
    const t = mk('text', { x: n.x + NW / 2, y: n.y + 28, 'text-anchor': 'middle' }); t.textContent = n.label;
    const en = mk('text', { x: n.x + NW / 2, y: n.y + 45, 'text-anchor': 'middle', class: 'en' }); en.textContent = n.en;
    g.append(t, en);
    svg.append(g);
    nodes[k] = g;
  }
  return { svg, nodes, edges };
}

// 7.1 입력 실험
function basicsInput(host) {
  const lv = Level.fromText(BASICS_LEVEL);
  const strip = el('canvas', { class: 'vcanvas', style: { marginTop: '10px' } });
  const lamps = el('div', { class: 'row', style: { gap: '14px' } });
  const L = { held: el('span', { class: 'lamp', text: tr('유지', 'held') }), pressed: el('span', { class: 'lamp', text: tr('눌림', 'pressed') }), released: el('span', { class: 'lamp red', text: tr('뗌', 'released') }) };
  lamps.append(el('span', { class: 'lbl', text: tr('점프 버튼, 이번 프레임:', 'Jump button this frame:') }), L.pressed, L.held, L.released);
  const rows = [['left', '←'], ['right', '→'], ['down', '↓'], ['jump', tr('점프', 'Jump')], ['throw', tr('던지기', 'Throw')]];
  function drawStrip(hist) {
    const W = strip.clientWidth || 600, H = 16 + rows.length * 18;
    const ctx = fitCanvas(strip, W, H);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const x0 = 56, cw = (W - x0 - 4) / 140;
    ctx.font = '500 11px ' + cssVar('--font-body');
    rows.forEach(([a, label], r) => {
      const y = 8 + r * 18;
      ctx.fillStyle = '#7D8B85'; ctx.fillText(label, 6, y + 11);
      ctx.fillStyle = '#151B1B'; ctx.fillRect(x0, y, W - x0, 14);
      hist.forEach((h, i) => {
        const v = h[a], x = x0 + i * cw;
        if (v & 1) { ctx.fillStyle = '#5E6B66'; ctx.fillRect(x, y + 2, Math.max(1, cw), 10); }
        if (v & 2) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x, y, Math.max(2, cw), 14); }
        if (v & 4) { ctx.fillStyle = '#FF5B4A'; ctx.fillRect(x, y, Math.max(2, cw), 14); }
      });
    });
    ctx.fillStyle = '#7D8B85'; ctx.fillText(tr('← 140프레임 전', '← 140 frames ago'), x0, H - 1); ctx.textAlign = 'right'; ctx.fillText(tr('지금 →', 'now →'), W - 4, H - 1); ctx.textAlign = 'left';
  }
  const view = new GameView(host, {
    world: { mode: 'sandbox', level: lv, hud: false, noDrain: true, camOneWay: false, sound: true },
    historyMax: 140, label: tr('입력 실험 화면', 'Input test screen'), cls: 'wide', below: el('div', null, strip, el('div', { class: 'bench-bar' }, lamps)),
    onUpdate: (w) => {
      const inp = w.input;
      L.held.classList.toggle('on', inp.held('jump'));
      L.pressed.classList.toggle('on', inp.pressed('jump'));
      L.released.classList.toggle('on', inp.released('jump'));
    },
    onRender: (ctx, w) => drawStrip(w.input.history),
  });
  view.input.historyMax = 140;
}

// 7.2 상태 기계의 기본: 개찰구(회전문)
function fsmTurnstile(host) {
  const RULES = {
    locked: { coin: ['unlocked', tr('잠금을 푼다', 'unlocks')], push: ['locked', tr('막혀서 못 지나간다', 'blocked, nobody passes')] },
    unlocked: { coin: ['unlocked', tr('동전만 들어간다', 'the coin is just taken')], push: ['locked', tr('한 명이 지나가고 다시 잠근다', 'one person passes, then it locks')] },
  };
  const NAME = { locked: tr('잠김', 'Locked'), unlocked: tr('열림', 'Unlocked') }, INPUT = { coin: tr('동전 넣기', 'Insert coin'), push: tr('밀기', 'Push') };
  let state = 'locked', passed = 0, coins = 0, hot = null;
  const log = [];
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text) e.textContent = text; return e; };
  const svg = mk('svg', { class: 'fsm', viewBox: '0 0 480 214', role: 'img', 'aria-label': tr('개찰구 상태 전이도', 'Turnstile state diagram') });
  const defs = mk('defs', {});
  for (const [id, hotStyle] of [['ts-ah', ''], ['ts-ahHot', 'fill: var(--redpen)']]) {
    const m = mk('marker', { id, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    const p = mk('path', { d: 'M0 0 L10 5 L0 10 z', class: 'arrowhead' });
    if (hotStyle) p.setAttribute('style', hotStyle);
    m.append(p); defs.append(m);
  }
  svg.append(defs);
  const EDGES = [
    ['start', 'M2 116 L40 116', 6, 106, tr('시작', 'start'), 'start'],
    ['locked-coin', 'M190 100 C 228 58, 252 58, 290 100', 240, 62, tr('동전', 'coin'), 'middle'],
    ['unlocked-push', 'M290 132 C 252 174, 228 174, 190 132', 240, 186, tr('밀기 (통과)', 'push (pass through)'), 'middle'],
    ['locked-push', 'M92 86 C 70 34, 138 34, 118 86', 105, 30, tr('밀기', 'push'), 'middle'],
    ['unlocked-coin', 'M342 86 C 320 34, 388 34, 368 86', 355, 30, tr('동전', 'coin'), 'middle'],
  ];
  const edges = {};
  for (const [id, d, lx, ly, label, anchor] of EDGES) {
    const path = mk('path', { d, class: 'edge', 'marker-end': 'url(#ts-ah)' });
    svg.append(path, mk('text', { x: lx, y: ly, class: 'elabel', 'text-anchor': anchor }, label));
    edges[id] = path;
  }
  const nodes = {};
  for (const [k, x] of [['locked', 40], ['unlocked', 290]]) {
    const g = mk('g', { class: 'node' });
    g.append(mk('rect', { x, y: 86, width: 150, height: 60, rx: 10 }), mk('text', { x: x + 75, y: 116, 'text-anchor': 'middle' }, NAME[k]), mk('text', { x: x + 75, y: 134, 'text-anchor': 'middle', class: 'en' }, k.toUpperCase()));
    svg.append(g); nodes[k] = g;
  }
  const table = el('table', { class: 'spec' });
  table.append(el('thead', null, el('tr', null, el('th', { text: tr('지금 상태', 'Current state') }), el('th', { text: tr('입력', 'Input') }), el('th', { text: tr('다음 상태', 'Next state') }), el('th', { text: tr('하는 일', 'What happens') }))));
  const tbody = el('tbody');
  const rowsEl = {};
  for (const s of ['locked', 'unlocked']) for (const i of ['coin', 'push']) {
    const tr = el('tr', null, el('td', { text: NAME[s] }), el('td', { text: INPUT[i] }), el('td', { text: NAME[RULES[s][i][0]] }), el('td', { text: RULES[s][i][1] }));
    rowsEl[s + '-' + i] = tr; tbody.append(tr);
  }
  table.append(tbody);
  const status = el('div', { class: 'readout' });
  const logEl = el('ol', { class: 'small mono', style: { margin: '0', paddingLeft: '20px', minHeight: '6.5em' } });
  const send = (input) => {
    const [next, what] = RULES[state][input];
    const key = state + '-' + input;
    if (state === 'unlocked' && input === 'push') passed++;
    if (input === 'coin') coins++;
    log.unshift(NAME[state] + ' + ' + INPUT[input] + ' → ' + NAME[next] + ' (' + what + ')');
    if (log.length > 5) log.pop();
    state = next; hot = key;
    sync();
  };
  const coinB = el('button', { class: 'btn primary', type: 'button', text: INPUT.coin });
  const pushB = el('button', { class: 'btn', type: 'button', text: INPUT.push });
  const resetB = el('button', { class: 'btn small', type: 'button', text: tr('처음으로', 'Reset') });
  coinB.addEventListener('click', () => send('coin'));
  pushB.addEventListener('click', () => send('push'));
  resetB.addEventListener('click', () => { state = 'locked'; passed = 0; coins = 0; hot = null; log.length = 0; sync(); });
  function sync() {
    for (const k in nodes) nodes[k].classList.toggle('on', k === state);
    for (const id in edges) {
      const isHot = id === hot;
      edges[id].classList.toggle('hot', isHot);
      edges[id].setAttribute('marker-end', isHot ? 'url(#ts-ahHot)' : 'url(#ts-ah)');
    }
    for (const k in rowsEl) rowsEl[k].style.background = k === hot ? 'var(--marker)' : '';
    status.textContent = tr('지금 상태: ' + NAME[state] + ' · 지나간 사람 ' + passed + '명 · 받은 동전 ' + coins + '개', 'State: ' + NAME[state] + ' · ' + passed + ' passed · ' + coins + ' coins taken');
    logEl.innerHTML = '';
    if (!log.length) logEl.append(el('li', { text: tr('버튼을 눌러 입력을 보내 보자.', 'Press a button to send an input.'), style: { listStyle: 'none', marginLeft: '-20px' } }));
    else log.forEach((t) => logEl.append(el('li', { text: t })));
  }
  host.append(el('div', { class: 'panel stack' },
    el('div', { class: 'grid2' },
      el('div', { class: 'stack' }, el('div', { class: 'label', text: tr('상태 전이도', 'State diagram') }), svg),
      el('div', { class: 'stack' }, el('div', { class: 'row' }, coinB, pushB, resetB), status, el('div', { class: 'label', text: tr('최근 전이', 'Recent transitions') }), logEl)),
    el('div', { class: 'label', text: tr('상태 전이표 · 같은 규칙을 표로 쓴 것', 'Transition table · the same rules as a table') }), el('div', { class: 'scroll-x' }, table)));
  sync();
}

// 7.2 플래그 넷 vs 상태 하나
function fsmFlags(host) {
  const FL = [['jumping', tr('점프 중', 'jumping'), 'jump'], ['falling', tr('낙하 중', 'falling'), 'fall'], ['stumbling', tr('비틀거림', 'stumbling'), 'stumble'], ['dead', tr('죽음', 'dead'), 'dead']];
  const cur = { jumping: false, falling: false, stumbling: false, dead: false };
  const boxes = el('div', { class: 'row', style: { gap: '16px' } });
  for (const [k, label] of FL) {
    const cb = el('input', { type: 'checkbox', id: 'flag-' + k });
    cb.addEventListener('change', () => { cur[k] = cb.checked; sync(); });
    boxes.append(el('label', { class: 'check mono', for: 'flag-' + k }, cb, 'is' + k[0].toUpperCase() + k.slice(1)));
  }
  const grid = el('div', { class: 'flaggrid' });
  const verdict = el('div', { class: 'prose', style: { maxWidth: 'none' } });
  const short = (f) => { const on = FL.filter(([k]) => f[k]).map(([, l]) => l); return on.length ? on.join(' + ') : tr('모두 거짓', 'all false'); };
  const cells = [];
  grid.append(el('div', { class: 'hd', text: 'J F \\ S D' }));
  const colKeys = [[false, false], [false, true], [true, false], [true, true]];
  const b01 = (v) => (v ? '1' : '0');
  colKeys.forEach(([s, d]) => grid.append(el('div', { class: 'hd', text: 'S' + b01(s) + ' D' + b01(d) })));
  [[false, false], [false, true], [true, false], [true, true]].forEach(([j, f]) => {
    grid.append(el('div', { class: 'hd', text: 'J' + b01(j) + ' F' + b01(f) }));
    colKeys.forEach(([s, d]) => {
      const f4 = { jumping: j, falling: f, stumbling: s, dead: d };
      const n = j + f + s + d;
      const cell = el('button', { type: 'button', class: 'flagcell ' + (n <= 1 ? 'ok' : 'bad'), text: short(f4), title: n <= 1 ? tr('말이 되는 조합', 'A valid combination') : tr('있을 수 없는 조합', 'An impossible combination') });
      cell.addEventListener('click', () => { Object.assign(cur, f4); FL.forEach(([k]) => { $('#flag-' + k).checked = cur[k]; }); sync(); });
      cells.push({ cell, f4 });
      grid.append(cell);
    });
  });
  function explain(f) {
    const on = FL.filter(([k]) => f[k]);
    if (on.length === 0) return ['ok', tr('모든 플래그가 거짓이다. 땅 위에 서 있거나 달리는 중이다.', 'Every flag is false: standing or running on the ground.'), tr("state = 'idle' 또는 'run'", "state = 'idle' or 'run'")];
    if (on.length === 1) return ['ok', tr(on[0][1] + ' 하나만 참이다. 말이 된다.', 'Only ' + on[0][1] + ' is true. That makes sense.'), "state = '" + on[0][2] + "'"];
    if (f.dead) return ['bad', tr('죽었는데 ' + on.filter(([k]) => k !== 'dead').map(([, l]) => l).join('·') + '이기도 하다. 죽음 처리와 다른 처리가 같은 프레임에 함께 돌아서, 죽은 보리가 점프하는 식의 버그가 난다.', 'Dead, yet also ' + on.filter(([k]) => k !== 'dead').map(([, l]) => l).join(' and ') + '. The death code and other code run in the same frame, and you get bugs like a dead Bori jumping.'), tr('표현할 수 없다', 'can\'t be written')];
    if (f.jumping && f.falling) return ['bad', tr('올라가는 중이면서 동시에 떨어지는 중일 수는 없다. 어느 애니메이션을 보여 줄지도 코드마다 다르게 판단하게 된다.', 'He can\'t be rising and falling at once. Different parts of the code will even disagree about which animation to show.'), tr('표현할 수 없다', 'can\'t be written')];
    return ['bad', tr('비틀거리는 동안에는 조작을 막아 두었는데 다른 동작 플래그도 켜져 있다. 어느 규칙이 이길지는 if문 순서에 달려 버린다.', 'Controls are locked while stumbling, yet another movement flag is on. Which rule wins now depends on the order of the if statements.'), tr('표현할 수 없다', 'can\'t be written')];
  }
  function sync() {
    for (const { cell, f4 } of cells) cell.classList.toggle('sel', FL.every(([k]) => f4[k] === cur[k]));
    const [kind, text, asState] = explain(cur);
    verdict.innerHTML = '';
    verdict.append(el('p', null, el('b', { text: kind === 'ok' ? tr('말이 된다. ', 'Valid. ') : tr('있을 수 없는 상태. ', 'Impossible state. '), style: { color: kind === 'ok' ? 'var(--ok)' : 'var(--bad)' } }), text),
      el('p', { class: 'small' }, tr('상태 변수 하나로 쓰면: ', 'With one state variable: '), el('code', { text: asState })));
  }
  host.append(el('div', { class: 'panel stack' },
    el('div', { class: 'label', text: tr('플래그 네 개를 켜고 꺼 보자 · 칸을 눌러도 된다', 'Toggle the four flags · or select a cell') }), boxes,
    el('div', { class: 'scroll-x' }, grid),
    el('div', { class: 'small mono', text: 'J = isJumping · F = isFalling · S = isStumbling · D = isDead · 1 = true' }),
    el('div', { class: 'small', text: tr('16가지 조합 중 테두리가 초록인 5칸만 말이 된다. 빗금 친 11칸은 코드 어딘가에서 실수로 만들어질 수 있는 버그 상태다.', 'Of the 16 combinations, only the 5 with green borders make sense. The 11 hatched ones are bug states that a slip somewhere in the code can produce.') }),
    verdict));
  sync();
}

// 7.3 보리의 상태 기계 (실시간 그림)
function basicsFsm(host) {
  const lv = Level.fromText(BASICS_LEVEL);
  const fsm = buildFsmSvg();
  const throwChip = el('span', { class: 'chip', text: tr('던지기 · 다른 상태에 겹쳐서 12프레임', 'Throw · a 12-frame overlay on any state') });
  let hotEdge = null, hotT = 0, throwT = 0;
  const clearHot = () => { if (hotEdge) { hotEdge.classList.remove('hot'); hotEdge.setAttribute('marker-end', 'url(#fsm-ah)'); hotEdge = null; } };
  new GameView(host, {
    world: {
      mode: 'sandbox', level: lv, hud: false, noDrain: true, camOneWay: false, sound: true,
      onEvent: (ev, d) => {
        if (ev === 'state') {
          clearHot();
          hotEdge = fsm.edges[fsmEdgeKey(d.from, d.to)] || null;
          if (hotEdge) { hotEdge.classList.add('hot'); hotEdge.setAttribute('marker-end', 'url(#fsm-ahHot)'); hotT = 50; }
        }
        if (ev === 'throw') throwT = 12;
      },
    },
    label: tr('상태 기계 실험 화면', 'State machine test screen'), cls: 'wide',
    onUpdate: (w) => {
      const st = w.p.state;
      for (const k in fsm.nodes) fsm.nodes[k].classList.toggle('on', k === st);
      if (hotT > 0 && --hotT === 0) clearHot();
      if (throwT > 0) throwT--;
      throwChip.classList.toggle('mod', throwT > 0);
    },
  });
  host.append(el('div', { class: 'panel stack', style: { marginTop: '12px' } }, el('div', { class: 'scroll-x' }, el('div', { style: { minWidth: '520px' } }, fsm.svg)),
    el('div', { class: 'row' }, el('span', { class: 'legend' }, el('span', null, el('i', { style: { background: 'var(--ink)' } }), tr('지금 상태', 'Current state')), el('span', null, el('i', { style: { background: 'var(--redpen)' } }), tr('방금 지난 화살표', 'Transition just taken'))), throwChip)));
}

function basicsJuice(host) {
  const lv = Level.fromText([
    '....................', '....................', '....................', '....................', '....................',
    '.................Z..',
    '........====........',
    '....................', '....................',
    '..P.......S..F....S.',
    '####################',
    '####################'].join('\n'));
  const bar1 = el('div', { class: 'bench-bar' }), bar2 = el('div', { class: 'bench-bar' }), bar3 = el('div', { class: 'bench-bar' });
  const juice = Object.assign({}, JUICE_ALL);
  const debug = { hitbox: false, grid: false, probes: false, vel: false, info: false };
  const view = new GameView(host, {
    world: { mode: 'sandbox', level: lv, hud: true, noDrain: true, camOneWay: false, startWeapon: true, respawnEnemies: 120, juice, debug, sound: true },
    label: tr('연출 실험 화면 · X로 도토리를 던진다', 'Juice test screen · X throws acorns'), hint: tr('클릭하고 X로 도토리를 던지자', 'Click, then press X to throw acorns'), cls: 'wide', below: el('div', null, bar1, bar2, bar3),
  });
  const tog = (obj, k, label, bars) => {
    const b = el('button', { class: 'btn small', type: 'button', 'aria-pressed': String(obj[k]), text: label });
    b.addEventListener('click', () => { obj[k] = !obj[k]; b.setAttribute('aria-pressed', String(obj[k])); if (obj === juice && k === 'squash' && !juice.squash) { view.world.p.sx = 1; view.world.p.sy = 1; } });
    b._sync = () => b.setAttribute('aria-pressed', String(obj[k]));
    bars.push(b);
    return b;
  };
  const jb = [];
  const sndObj = { on: true };
  bar1.append(el('span', { class: 'lbl', text: tr('연출', 'Juice') }),
    tog(juice, 'hitstop', tr('히트스톱', 'Hitstop'), jb), tog(juice, 'shake', tr('흔들림', 'Shake'), jb), tog(juice, 'particles', tr('파편', 'Particles'), jb),
    tog(juice, 'squash', tr('찌그러짐', 'Squash'), jb), tog(juice, 'flash', tr('번쩍임', 'Flash'), jb), tog(juice, 'popups', tr('점수 팝업', 'Score pop-ups'), jb));
  const sndB = el('button', { class: 'btn small', type: 'button', 'aria-pressed': 'true', text: tr('효과음', 'Sound') });
  sndB.addEventListener('click', () => { sndObj.on = !sndObj.on; view.world.o.sound = sndObj.on; sndB.setAttribute('aria-pressed', String(sndObj.on)); });
  const allOff = el('button', { class: 'btn small', type: 'button', text: tr('모두 끄기', 'All off') });
  allOff.addEventListener('click', () => { for (const k in juice) juice[k] = false; jb.forEach((b) => b._sync()); view.world.p.sx = view.world.p.sy = 1; });
  const allOn = el('button', { class: 'btn small', type: 'button', text: tr('모두 켜기', 'All on') });
  allOn.addEventListener('click', () => { for (const k in juice) juice[k] = true; jb.forEach((b) => b._sync()); });
  bar1.append(sndB, allOff, allOn);
  const db = [];
  bar2.append(el('span', { class: 'lbl', text: tr('디버그', 'Debug') }), tog(debug, 'hitbox', tr('히트박스', 'Hitboxes'), db), tog(debug, 'grid', tr('타일 격자', 'Tile grid'), db), tog(debug, 'probes', tr('충돌 검사 칸', 'Collision probes'), db), tog(debug, 'vel', tr('속도', 'Velocity'), db), tog(debug, 'info', tr('상태 정보', 'State info'), db));
  const timeSeg = segButtons([[1, '1×'], [0.25, '0.25×'], [0, tr('일시정지', 'Pause')]], 1, (v) => {
    if (v === 0) view.loop.paused = true; else { view.loop.paused = false; view.loop.timeScale = v; }
  });
  const stepB = el('button', { class: 'btn small', type: 'button', text: tr('한 프레임 ▷', 'Step one frame ▷') });
  stepB.addEventListener('click', () => {
    view.loop.stepOnce();
    $$('button', timeSeg).forEach((b, i) => b.setAttribute('aria-pressed', String(i === 2)));
  });
  const fps = el('span', { class: 'readout dim' });
  bar3.append(el('span', { class: 'lbl', text: tr('시간', 'Time') }), timeSeg, stepB, el('span', { class: 'sp' }), fps);
  setInterval(() => {
    const f = view.loop.frameMs;
    if (!f.length || !view.loop.running) return;
    const avg = f.reduce((a, b) => a + b, 0) / f.length;
    fps.textContent = tr('화면 ', 'Display ') + Math.round(1000 / avg) + tr('fps · 프레임 ', ' fps · frame ') + avg.toFixed(1) + ' ms';
  }, 500);
}

function basicsFont(host) {
  const bench = el('div', { class: 'bench wide' });
  const atlas = el('canvas', { class: 'pix' });
  const out = el('canvas', { class: 'pix', style: { marginTop: '10px' } });
  const input = el('input', { type: 'text', value: 'HELLO BORI! SCORE 012300', maxlength: '40', id: 'font-text', 'aria-label': tr('렌더링할 글자', 'Text to render'), style: { flex: '1', minWidth: '0', background: 'var(--bezel-2)', color: 'var(--bezel-ink)', borderColor: 'var(--bezel-3)', fontFamily: 'var(--font-mono)' } });
  const info = el('span', { class: 'readout' });
  let scale = 2;
  const seg = segButtons([[1, '1×'], [2, '2×'], [3, '3×']], scale, (v) => { scale = v; render(); });
  bench.append(el('div', { class: 'label', text: tr('아틀라스 · 글자마다 5×7 칸 (' + FONT_CHARS.length + '글자)', 'Atlas · 5×7 cells per glyph (' + FONT_CHARS.length + ' glyphs)') }), el('div', { class: 'screen', style: { cursor: 'default' } }, atlas),
    el('div', { class: 'bench-bar' }, input, seg), el('div', { class: 'screen', style: { cursor: 'default' } }, out), el('div', { class: 'bench-bar' }, info));
  host.append(bench);
  input.addEventListener('input', render);
  function render() {
    const per = 20, cell = 8;
    const rowsN = Math.ceil(FONT_CHARS.length / per);
    atlas.width = per * cell + 2; atlas.height = rowsN * (cell + 2) + 2;
    const a = atlas.getContext('2d'); a.imageSmoothingEnabled = false;
    a.fillStyle = '#0055AA'; a.fillRect(0, 0, atlas.width, atlas.height);
    FONT_CHARS.forEach((ch, i) => {
      const x = (i % per) * cell + 2, y = Math.floor(i / per) * (cell + 2) + 2;
      a.fillStyle = '#003070'; a.fillRect(x, y, 6, 8);
      drawText(a, ch, x + 0.5, y + 0.5, { shadow: false, color: '#FFFFFF' });
    });
    const s = input.value.toUpperCase();
    const w = Math.max(64, textWidth(s, scale) + 12), h = 7 * scale + 14;
    out.width = w; out.height = h;
    const o = out.getContext('2d'); o.imageSmoothingEnabled = false;
    o.fillStyle = '#000'; o.fillRect(0, 0, w, h);
    drawText(o, s, 6, 6, { scale, color: '#FFFF55' });
    const missing = [...new Set(s.split('').filter((ch) => ch !== ' ' && !FONT_SRC[ch]))];
    info.textContent = s.length + tr('글자 × 6px × ', ' characters × 6 px × ') + scale + ' = ' + textWidth(s, scale) + tr('px 폭', ' px wide') + (missing.length ? tr(' · 아틀라스에 없는 글자는 건너뜀: ', ' · glyphs missing from the atlas are skipped: ') + missing.join(' ') : '');
    out.style.maxWidth = Math.min(100, (w / 520) * 100 * 1.6) + '%';
  }
  render();
}

MOUNTS.basics = (root) => {
  basicsInput($('#bas-input', root));
  fsmTurnstile($('#bas-fsm-intro', root));
  fsmFlags($('#bas-fsm-flags', root));
  basicsFsm($('#bas-fsm', root));
  basicsJuice($('#bas-juice', root));
  basicsFont($('#bas-font', root));
};
