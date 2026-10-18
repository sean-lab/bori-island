// The 20-second promo video (1080×1080, 30 fps), drawn frame by frame with the game's own engine.
//
// scripts/promo/render.mjs injects this file into the built page (dist/index.html?lang=en), so it can
// use the page's globals: SHEETS, drawSprite, drawText, TileGfx, Parallax, Level, World, Input, SONG,
// MusicDriver, compileSfx, simulateJump and so on. renderFrame(f) is a pure function of the frame
// number: the scenes that run the real game are simulated once in init() with a seeded Math.random.
//
// The cut follows the music: one beat of the song (4 rows × 7 ticks at 60 Hz) is 14 video frames.
// The song plays A B A C (8 bars, frames 0–447), the stage-clear jingle starts the end card, and the
// theme comes back quietly under the title screen.
//
// Tuned to the default level and physics: ST.g0, PLAY.g0 and END.g0 are frame numbers in the
// self-playing demo's run (a run of jumps, the water and logs, the stage clear). If the level
// changes, pick new ones.
window.PROMO = (() => {
  const W = 1080, H = 1080, TOTAL = 600, FPS = 30, BEAT = 14;
  const SX = 28, SY = 200, K = 4;                       // the 256×192 screen at exactly 4×
  const C = {
    paper: '#EDF2E9', grid: 'rgba(46,104,80,0.075)', gridMajor: 'rgba(46,104,80,0.14)',
    ink: '#1B2624', ink3: '#6F807A', pencil: '#2346B5', redpen: '#BF3720',
    bezel: '#151A1B', bezel3: '#313B3B',
  };
  const F = {
    display: '"Do Hyeon", "IBM Plex Sans KR", sans-serif',
    hand: '"Gaegu", cursive',
    mono: '"Nanum Gothic Coding", monospace',
  };
  const COVER = 70;                // a still for platforms that let you pick a cover

  // ── timeline: one beat of the music = 14 video frames (129 BPM at 30 fps) ──────────
  const SCENES = [
    { id: 'hook', from: 0, to: 84, eyebrow: ['', 'BORI ISLAND DEV NOTES'], head: ['Build an 8-bit game', 'from an empty canvas'], note: '16 colors, one pixel at a time' },
    { id: 'tools', from: 84, to: 140, eyebrow: ['CHAPTER 4', 'AUTHORING TOOLS'], head: ['Build the tools first'], note: 'edit, test, play' },
    { id: 'sound', from: 140, to: 196, eyebrow: ['CHAPTER 5', 'CHIP SOUND'], head: ['Music from three square waves'], note: 'real chip register values' },
    { id: 'physics', from: 196, to: 252, eyebrow: ['CHAPTER 6', 'PHYSICS'], head: ['Tune how a jump feels'], note: 'same jump, less gravity' },
    { id: 'states', from: 252, to: 308, eyebrow: ['CHAPTER 7', 'STATE MACHINES'], head: ['State machines, made visible'], note: 'lit by the running game' },
    { id: 'hardware', from: 308, to: 364, eyebrow: ['CHAPTER 8', 'THEN AND NOW'], head: ['1986 hardware vs. today'], note: 'one layer, four scroll speeds' },
    { id: 'play', from: 364, to: 448, eyebrow: ['CHAPTER 9', 'PLAY'], head: ['Then play what you built'], note: 'every edit shows up here' },
    { id: 'end', from: 448, to: 600, eyebrow: ['10 INTERACTIVE CHAPTERS', 'ENGLISH & KOREAN'], head: ['Free, right in your browser'], note: null },
  ];
  const sceneAt = (f) => SCENES.find((s) => f >= s.from && f < s.to) || SCENES[SCENES.length - 1];
  const URL_TEXT = 'sanghyunpark.pages.dev/apps/bori-island';

  let canvas, ctx, bg, scr, sctx;
  const pre = {};                 // pre-rendered screens for the scenes that run the real game
  const sfxCues = [];             // [timeSeconds, name, gain]
  const musicLog = [];            // per 1/60 s: { order, row, tick, regs }

  const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const seed = (n) => { Math.random = mulberry32(n); };
  const shot = () => { const c = document.createElement('canvas'); c.width = SCREEN_W; c.height = SCREEN_H; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(scr, 0, 0); return c; };
  const g2v = (gameFrame, g0, v0) => v0 + (gameFrame - g0) / 2;     // game frame (60 Hz) → video frame (30 fps)

  // ── setup ─────────────────────────────────────────────────────
  async function init() {
    canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d');
    scr = document.createElement('canvas');
    scr.width = SCREEN_W; scr.height = SCREEN_H;
    sctx = scr.getContext('2d');
    sctx.imageSmoothingEnabled = false;
    await Promise.all([
      document.fonts.load(`64px ${F.display}`, 'Build an 8-bit game'),
      document.fonts.load(`700 40px ${F.hand}`, 'edit, test, play'),
      document.fonts.load(`700 26px ${F.mono}`, 'CHAPTER'),
      document.fonts.load(`400 26px ${F.mono}`, 'sanghyunpark'),
    ]);
    buildBackground();
    preTools();
    preStates();
    prePlay();
    preClear();
    logMusic();
    return { scenes: SCENES.length, cues: sfxCues.length };
  }

  function buildBackground() {
    bg = document.createElement('canvas');
    bg.width = W; bg.height = H;
    const b = bg.getContext('2d');
    b.fillStyle = C.paper; b.fillRect(0, 0, W, H);
    for (let i = 0; i <= W; i += 24) {
      const major = i % 120 === 0;
      b.fillStyle = major ? C.gridMajor : C.grid;
      b.fillRect(i, 0, 1, H); b.fillRect(0, i, W, 1);
    }
    // the screen's bezel, like the notebook's demo panels
    b.fillStyle = C.bezel;
    roundRect(b, 14, 186, 1052, 796, 22); b.fill();
    b.strokeStyle = C.bezel3; b.lineWidth = 2;
    roundRect(b, 15, 187, 1050, 794, 21); b.stroke();
  }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }

  // ── frame composition ────────────────────────────────────────
  function renderFrame(f) {
    const s = sceneAt(f);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(bg, 0, 0);
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalAlpha = 1;
    sctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
    const local = f - s.from;
    SCREENS[s.id](local, f);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scr, SX, SY, SCREEN_W * K, SCREEN_H * K);
    drawCaptions(s, local);
    return canvas;
  }

  function drawCaptions(s, t) {
    // first scene is fully set from frame 0 so the first frame works as a thumbnail
    const a = s.from === 0 ? 1 : ease(t / 6);
    const dy = (1 - a) * 18;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textBaseline = 'alphabetic';
    // eyebrow
    ctx.font = `700 26px ${F.mono}`;
    ctx.letterSpacing = '3px';
    let x = SX;
    const eyY = (s.head.length > 1 ? 44 : 66) + dy;
    if (s.eyebrow[0]) {
      ctx.fillStyle = C.pencil; ctx.fillText(s.eyebrow[0], x, eyY);
      x += ctx.measureText(s.eyebrow[0]).width + 14;
      ctx.fillStyle = C.ink3; ctx.fillText('·', x, eyY);
      x += ctx.measureText('·').width + 14;
    }
    ctx.fillStyle = C.ink3; ctx.fillText(s.eyebrow[1], x, eyY);
    ctx.letterSpacing = '0px';
    // headline
    ctx.fillStyle = C.ink;
    if (s.head.length > 1) {
      ctx.font = `62px ${F.display}`;
      ctx.fillText(s.head[0], SX - 2, 104 + dy);
      ctx.fillText(s.head[1], SX - 2, 162 + dy);
    } else {
      let size = 76;
      ctx.font = `${size}px ${F.display}`;
      while (ctx.measureText(s.head[0]).width > 1020 && size > 50) { size -= 2; ctx.font = `${size}px ${F.display}`; }
      ctx.fillText(s.head[0], SX - 3, 156 + dy);
    }
    ctx.restore();
    // red-pen note, written on from left to right
    if (s.note) {
      const nt = s.from === 0 ? Math.max(0, t - 4) : t - 8;
      if (nt > 0) {
        ctx.save();
        ctx.font = `700 42px ${F.hand}`;
        ctx.letterSpacing = '-1px';
        const w = ctx.measureText(s.note).width;
        ctx.beginPath(); ctx.rect(SX, 990, Math.min(1, nt / 12) * (w + 40), 80); ctx.clip();
        ctx.fillStyle = C.redpen;
        ctx.fillText(s.note, SX + 2, 1044);
        ctx.restore();
      }
      ctx.save();
      ctx.font = `400 22px ${F.mono}`;
      ctx.fillStyle = C.ink3; ctx.textAlign = 'right';
      ctx.fillText('sanghyunpark.pages.dev', 1052, 1042);
      ctx.restore();
    } else {
      drawEndUrl(t);
    }
  }

  function drawEndUrl(t) {
    const a = ease((t - 4) / 8);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `700 36px ${F.mono}`;
    ctx.fillStyle = C.pencil;
    ctx.fillText(URL_TEXT, SX, 1042);
    const w = ctx.measureText(URL_TEXT).width;
    ctx.restore();
    // hand-drawn red underline, drawn on after the address appears
    const u = clamp((t - 18) / 12, 0, 1);
    if (u > 0) {
      ctx.save();
      ctx.strokeStyle = C.redpen; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath();
      const steps = 60, x0 = SX - 4, x1 = SX + w + 6;
      for (let i = 0; i <= steps * u; i++) {
        const k = i / steps, x = x0 + (x1 - x0) * k, y = 1058 + Math.sin(k * 9.5) * 2.2 + k * 3;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── screens (each draws into the 256×192 canvas) ──────────────
  const SCREENS = {};

  // 1. Hook: Bori painted cell by cell in the pixel editor, then he runs
  const HOOK = { cell: 10, gx: 16, gy: 18, paintFrom: 3, paintTo: 49, pop: 52 };
  SCREENS.hook = (t) => {
    const S = SHEETS.hero, idle = S.data[S.index('idle')];
    const order = [];
    for (let i = 0; i < 256; i++) if (idle[i]) order.push(i);
    const painted = t < HOOK.paintFrom ? 0 : Math.min(order.length, Math.floor(((t - HOOK.paintFrom) / (HOOK.paintTo - HOOK.paintFrom)) * order.length));
    const alive = t >= HOOK.pop;
    const runKey = ['run1', 'run2', 'run3', 'run4'][Math.floor((t - HOOK.pop) / 3) % 4];
    const data = alive ? S.data[S.index(runKey)] : idle;
    sctx.fillStyle = '#1A2021'; sctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    drawText(sctx, 'SPRITE  HERO  16X16', HOOK.gx, 6, { color: '#7D8B85', shadow: false });
    drawText(sctx, 'PALETTE', 190, 6, { color: '#7D8B85', shadow: false });
    // canvas with transparency checker
    const { cell, gx, gy } = HOOK;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const i = y * 16 + x;
      const px = gx + x * cell, py = gy + y * cell;
      const show = alive ? data[i] : (order.indexOf(i) > -1 && order.indexOf(i) < painted ? idle[i] : 0);
      if (show) { sctx.fillStyle = SPR_PAL[show]; sctx.fillRect(px, py, cell, cell); }
      else {
        sctx.fillStyle = '#2A3233'; sctx.fillRect(px, py, cell, cell);
        sctx.fillStyle = '#323B3C'; sctx.fillRect(px, py, cell / 2, cell / 2); sctx.fillRect(px + cell / 2, py + cell / 2, cell / 2, cell / 2);
      }
    }
    sctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let k = 1; k < 16; k++) { sctx.fillRect(gx + k * cell, gy, 1, 160); sctx.fillRect(gx, gy + k * cell, 160, 1); }
    sctx.fillStyle = 'rgba(255,255,255,0.18)';
    sctx.fillRect(gx + 8 * cell, gy, 1, 160); sctx.fillRect(gx, gy + 8 * cell, 160, 1);
    // cursor on the cell being painted
    let activeColor = 0;
    if (!alive && painted > 0 && painted < order.length) {
      const i = order[painted - 1];
      activeColor = idle[i];
      const px = gx + (i % 16) * cell, py = gy + Math.floor(i / 16) * cell;
      sctx.strokeStyle = '#FFFFFF'; sctx.lineWidth = 1;
      sctx.strokeRect(px - 0.5, py - 0.5, cell + 1, cell + 1);
    }
    // palette swatches
    for (let k = 0; k < 16; k++) {
      const px = 190 + (k % 2) * 28, py = 18 + Math.floor(k / 2) * 14;
      if (k === 0) { sctx.fillStyle = '#323B3C'; sctx.fillRect(px, py, 24, 11); sctx.fillStyle = '#2A3233'; sctx.fillRect(px, py, 12, 5); sctx.fillRect(px + 12, py + 5, 12, 6); }
      else { sctx.fillStyle = SPR_PAL[k]; sctx.fillRect(px, py, 24, 11); }
      if (k === activeColor && activeColor) { sctx.strokeStyle = '#FFFFFF'; sctx.strokeRect(px - 1.5, py - 1.5, 27, 14); }
    }
    // live preview
    sctx.fillStyle = '#55AAFF'; sctx.fillRect(190, 136, 52, 42);
    sctx.fillStyle = '#00AA00'; sctx.fillRect(190, 170, 52, 3);
    sctx.fillStyle = '#AA5500'; sctx.fillRect(190, 173, 52, 5);
    if (painted > 0 || alive) {
      const mini = document.createElement('canvas'); mini.width = 16; mini.height = 16;
      const m = mini.getContext('2d'), img = m.createImageData(16, 16);
      for (let i = 0; i < 256; i++) {
        const v = alive ? data[i] : (order.indexOf(i) > -1 && order.indexOf(i) < painted ? idle[i] : 0);
        if (!v) continue;
        const rgb = hexToRgb(SPR_PAL[v]);
        img.data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
      }
      m.putImageData(img, 0, 0);
      const bob = alive ? ((t >> 1) & 1) : 0;
      sctx.drawImage(mini, 0, 0, 16, 16, 194, 154 - bob, 16, 16);
      sctx.drawImage(mini, 0, 0, 16, 16, 212, 138 - bob * 2, 32, 32);
    }
    drawText(sctx, alive ? 'RUN ' + (['run1', 'run2', 'run3', 'run4'].indexOf(runKey) + 1) + '/4' : 'IDLE', 190, 182, { color: alive ? '#F0A93A' : '#7D8B85', shadow: false });
    if (t >= HOOK.pop && t < HOOK.pop + 3) { sctx.fillStyle = `rgba(255,255,255,${0.7 - (t - HOOK.pop) * 0.25})`; sctx.fillRect(gx, gy, 160, 160); }
  };

  // 2. Tools: tiles placed in a level editor, then "test" runs the real game on it
  const TOOLS = {
    steps: [
      { t: 4, label: 'GROUND', cells: [[9, 9, T.GROUND]] },
      { t: 8, label: 'GROUND', cells: [[10, 9, T.GROUND]] },
      { t: 12, label: 'GROUND', cells: [[11, 9, T.GROUND]] },
      { t: 16, label: 'GROUND', cells: [[10, 8, T.GROUND]] },
      { t: 20, label: 'LOG', cells: [[4, 6, T.LOG]] },
      { t: 23, label: 'LOG', cells: [[5, 6, T.LOG]] },
      { t: 26, label: 'LOG', cells: [[6, 6, T.LOG]] },
      { t: 30, label: 'APPLE', ent: [5, 4, 'a'] },
      { t: 34, label: 'WATER', cells: [[13, 10, T.WATER], [14, 10, T.WATER], [13, 11, T.WATER], [14, 11, T.WATER]] },
      { t: 38, label: 'SPRING', ent: [2, 9, 'J'] },
    ],
    test: 42,
  };
  function toolsLevel(upTo) {
    const L = new Level(16, 12);
    for (let x = 0; x < 16; x++) { L.tiles[10 * 16 + x] = T.GROUND; L.tiles[11 * 16 + x] = T.GROUND; }
    L.ents.push({ c: 'P', x: 1, y: 9 });
    for (const st of TOOLS.steps) {
      if (st.t > upTo) break;
      if (st.cells) for (const [x, y, id] of st.cells) L.tiles[y * 16 + x] = id;
      if (st.ent) L.ents.push({ c: st.ent[2], x: st.ent[0], y: st.ent[1] });
    }
    return L;
  }
  function drawLevelPlain(L, frame) {
    Parallax.draw(sctx, 0, { time: frame });
    for (let ty = 0; ty < L.h; ty++) for (let tx = 0; tx < L.w; tx++) {
      const cv = TileGfx.forCell(L, tx, ty, frame);
      if (cv) sctx.drawImage(cv, tx * TILE, ty * TILE);
    }
    for (const e of L.ents) {
      const d = ENT_DEFS[e.c];
      if (!d || e.c === 'P') continue;
      drawSprite(sctx, SHEETS[d.sheet], d.key, e.x * TILE, e.y * TILE);
    }
  }
  function preTools() {
    seed(4);
    const L = toolsLevel(999);
    const cues = [];
    const w = new World({ mode: 'game', startScene: 'play', level: L, hud: false, sound: true, input: new Input(), noDrain: true });
    w.sfx = (name) => cues.push([w.frame, name]);
    const frames = [];
    const n = (140 - 84) - TOOLS.test;              // video frames left after "test"
    for (let v = 0; v < n; v++) {
      w.render(sctx, 1);
      frames.push(shot());
      for (let g = 0; g < 2; g++) {
        const gf = v * 2 + g;
        w.input.raw.right = true;
        w.input.raw.jump = gf >= 6 && gf < 26;
        w.update();
      }
    }
    pre.tools = frames;
    for (const [gf, name] of cues) sfxCues.push([(84 + TOOLS.test + gf / 2) / FPS, name, 0.9]);
    for (const st of TOOLS.steps) sfxCues.push([(84 + st.t) / FPS, 'clink', 0.45]);
  }
  SCREENS.tools = (t) => {
    if (t >= TOOLS.test) {
      sctx.drawImage(pre.tools[Math.min(pre.tools.length - 1, t - TOOLS.test)], 0, 0);
      const k = t - TOOLS.test;
      if (k < 6) gridOverlay(1 - k / 6);
      toolbar('TEST', true, k);
      return;
    }
    const L = toolsLevel(t);
    drawLevelPlain(L, t);
    gridOverlay(1);
    let cur = TOOLS.steps[0];
    for (const st of TOOLS.steps) if (st.t <= t) cur = st;
    const next = TOOLS.steps.find((st) => st.t > t) || cur;
    const tgt = t < TOOLS.steps[0].t ? TOOLS.steps[0] : cur;
    const [cx, cy] = tgt.cells ? tgt.cells[0] : tgt.ent;
    sctx.strokeStyle = '#FFFF55'; sctx.lineWidth = 1;
    sctx.strokeRect(cx * 16 - 0.5, cy * 16 - 0.5, 17, 17);
    if (tgt.cells && tgt.cells.length > 1) sctx.strokeRect(cx * 16 - 0.5, cy * 16 - 0.5, 33, 33);
    if (t - cur.t >= 0 && t - cur.t < 2 && t >= TOOLS.steps[0].t) {
      sctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (const [x, y] of cur.cells || [cur.ent]) sctx.fillRect(x * 16, y * 16, 16, 16);
    }
    toolbar(t >= TOOLS.steps[0].t ? cur.label : next.label, false, 0);
  };
  function gridOverlay(a) {
    sctx.fillStyle = `rgba(255,255,255,${0.16 * a})`;
    for (let x = 16; x < SCREEN_W; x += 16) sctx.fillRect(x, 0, 1, SCREEN_H);
    for (let y = 16; y < SCREEN_H; y += 16) sctx.fillRect(0, y, SCREEN_W, 1);
  }
  function toolbar(label, testing, k) {
    sctx.fillStyle = 'rgba(13,17,18,0.82)'; sctx.fillRect(0, 0, SCREEN_W, 14);
    drawText(sctx, testing ? 'PLAYTEST' : 'TILE: ' + label, 4, 4, { color: testing ? '#F0A93A' : '#FFFFFF', shadow: false });
    const bx = 206, on = testing && (k & 2) === 0;
    sctx.fillStyle = testing ? '#F0A93A' : '#313B3B'; sctx.fillRect(bx, 2, 46, 10);
    sctx.fillStyle = testing ? '#151A1B' : '#CAD5CF';
    sctx.beginPath(); sctx.moveTo(bx + 5, 4); sctx.lineTo(bx + 5, 10); sctx.lineTo(bx + 10, 7); sctx.fill();
    drawText(sctx, 'TEST', bx + 14, 4, { color: testing ? '#151A1B' : '#CAD5CF', shadow: false });
    if (testing && on) { sctx.strokeStyle = '#FFFF55'; sctx.strokeRect(bx - 0.5, 1.5, 47, 11); }
  }

  // 3. Sound: the tracker in sync with the soundtrack, with the values written to the chip
  function logMusic() {
    // drive the same music driver silently, frame by frame, and keep what it writes
    const fake = { ctx: { currentTime: 0 } };
    const stub = { write() {}, silence() {}, cancel() {}, steal: { gain: {} }, user: { gain: {} } };
    const d = Object.create(MusicDriver.prototype);
    d.sys = fake; d.ch = [stub, stub, stub, stub]; d.timeline = []; d.userMute = [false, false, false, false];
    d.song = SONG; d.loop = false; d.pos = { order: 0, row: 0, tick: 0 };
    d.st = [0, 1, 2, 3].map(() => ({ note: 0, frame: 0, on: false, rel: false, vol: 0 }));
    d.playing = true;
    for (let i = 0; i < 1200 && d.playing; i++) {
      const pos = { order: d.pos.order, row: d.pos.row, tick: d.pos.tick };
      d.frame(i / 60);
      const last = d.timeline[d.timeline.length - 1];
      musicLog.push({ ...pos, regs: last.regs });
    }
  }
  const CH_NAMES = ['LEAD', 'HARMONY', 'BASS', 'DRUMS'];
  const DRUM_NAMES = { 1: ['KK', 'KICK'], 2: ['SN', 'SNARE'], 3: ['HH', 'HI-HAT'], 4: ['CR', 'CRASH'] };
  SCREENS.sound = (t, f) => {
    const m = musicLog[Math.min(musicLog.length - 1, f * 2)];
    const patKey = SONG.order[m.order];
    const pat = SONG.patterns[patKey];
    sctx.fillStyle = '#0D1112'; sctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    drawText(sctx, 'PATTERN ' + patKey, 8, 6, { color: '#F0A93A', shadow: false });
    drawText(sctx, 'ROW ' + String(m.row + 1).padStart(2, '0') + '/32', 92, 6, { color: '#FFFFFF', shadow: false });
    drawText(sctx, '129 BPM', 248, 6, { align: 'right', color: '#7D8B85', shadow: false });
    // piano roll of the lead channel
    const x0 = 24, rw = 7, y0 = 22, top = 89, step = 4;
    sctx.fillStyle = '#121819'; sctx.fillRect(x0, y0, 32 * rw, 78);
    for (let r = 0; r <= 32; r += 4) { sctx.fillStyle = r % 16 === 0 ? '#3E4A4A' : '#232B2C'; sctx.fillRect(x0 + r * rw, y0, 1, 78); }
    for (const [label, midi] of [['C7', 96], ['C6', 84], ['C5', 72]]) {
      const y = y0 + (top - midi) * step + 1;
      if (y >= y0 && y < y0 + 78) { drawText(sctx, label, 4, y - 3, { color: '#7D8B85', shadow: false }); sctx.fillStyle = '#1C2324'; sctx.fillRect(x0, y, 32 * rw, 1); }
    }
    const lead = pat[0];
    for (let r = 0; r < 32; r++) {
      const v = lead[r];
      if (!(v > 0)) continue;
      let len = 1;
      while (r + len < 32 && lead[r + len] === 0) len++;
      const y = y0 + (top - v) * step;
      const playing = m.row >= r && m.row < r + len;
      sctx.fillStyle = playing ? '#FFFFFF' : '#FFFF55';
      sctx.fillRect(x0 + r * rw + 1, y, len * rw - 2, 3);
    }
    const px = x0 + (m.row + m.tick / SONG.speed) * rw;
    sctx.fillStyle = '#F0A93A'; sctx.fillRect(Math.round(px), y0 - 2, 1, 82);
    // the four channels, as the register monitor shows them
    for (let c = 0; c < 4; c++) {
      const bx = 6 + c * 62, by = 108, bw = 58, bh = 78;
      sctx.fillStyle = '#1A2122'; sctx.fillRect(bx, by, bw, bh);
      sctx.fillStyle = '#2C3536'; sctx.fillRect(bx, by, bw, 1); sctx.fillRect(bx, by + bh - 1, bw, 1); sctx.fillRect(bx, by, 1, bh); sctx.fillRect(bx + bw - 1, by, 1, bh);
      drawText(sctx, 'CH' + c, bx + 4, by + 5, { color: '#7D8B85', shadow: false });
      drawText(sctx, CH_NAMES[c].slice(0, 4), bx + bw - 4, by + 5, { align: 'right', color: '#7D8B85', shadow: false });
      const r = m.regs[c];
      if (!r) {
        drawText(sctx, '-', bx + 5, by + 20, { scale: 2, color: '#485955', shadow: false });
        drawText(sctx, 'REST', bx + 4, by + 46, { color: '#485955', shadow: false });
      } else if (c === 3) {
        const dn = DRUM_NAMES[r.drum] || ['--', ''];
        drawText(sctx, dn[0], bx + 5, by + 20, { scale: 2, color: '#FFFFFF', shadow: false });
        drawText(sctx, dn[1], bx + 4, by + 40, { color: '#CAD5CF', shadow: false });
        drawText(sctx, 'RATE ' + r.rate, bx + 4, by + 52, { color: '#7D8B85', shadow: false });
      } else {
        drawText(sctx, noteName(r.m), bx + 5, by + 20, { scale: 2, color: '#FFFFFF', shadow: false });
        drawText(sctx, 'N=' + r.n.toString(16).toUpperCase().padStart(3, '0'), bx + 4, by + 40, { color: '#CAD5CF', shadow: false });
        drawText(sctx, Math.round(psgHz(r.n)) + 'HZ', bx + 4, by + 52, { color: '#7D8B85', shadow: false });
      }
      const v = r ? r.v : 0;
      sctx.fillStyle = '#2C3536'; sctx.fillRect(bx + 4, by + bh - 10, bw - 8, 4);
      sctx.fillStyle = '#F0A93A'; sctx.fillRect(bx + 4, by + bh - 10, Math.round((bw - 8) * v / 15), 4);
    }
  };

  // 4. Physics: the jump arc lab, then the same jumps with less gravity
  const PHY = { scale: 1.6, x0: 22, ground: 172 };   // positions at 1.6×, Bori drawn at an exact 2×
  function arcs(gravity) {
    const P = Object.assign({}, PHYS_DEFAULT, { gravity });
    return [
      { color: '#F0A93A', label: 'HELD', sim: simulateJump(P, { holdFrames: 999 }) },
      { color: '#7FA6FF', label: '8 FRAMES', sim: simulateJump(P, { holdFrames: 8 }) },
      { color: '#FF6E5A', label: 'TAP', sim: simulateJump(P, { holdFrames: 2 }) },
    ];
  }
  SCREENS.physics = (t) => {
    const s = PHY.scale;
    sctx.fillStyle = '#0B0E0F'; sctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    const tile = 16 * s;
    for (let k = 1; PHY.ground - k * tile / 2 > 0; k++) { sctx.fillStyle = k % 2 === 0 ? '#1E2829' : '#141B1C'; sctx.fillRect(PHY.x0, Math.round(PHY.ground - k * tile / 2), SCREEN_W, 1); }
    for (let x = PHY.x0; x < SCREEN_W; x += tile / 2) { sctx.fillStyle = '#141B1C'; sctx.fillRect(Math.round(x), 0, 1, PHY.ground); }
    for (let k = 1; k <= 5; k++) drawText(sctx, k + 'T', 4, Math.round(PHY.ground - k * tile) - 3, { color: '#485955', shadow: false });
    sctx.fillStyle = '#55AA00'; sctx.fillRect(0, PHY.ground, SCREEN_W, 2);
    sctx.fillStyle = '#AA5500'; sctx.fillRect(0, PHY.ground + 2, SCREEN_W, SCREEN_H - PHY.ground - 2);
    const phaseB = t >= 28;
    const A = arcs(0.25), B = arcs(0.2);
    const gA = phaseB ? 999 : t * 2, gB = phaseB ? (t - 28) * 3 : -1;
    const plot = (set, upto, alpha) => {
      for (const a of set) {
        sctx.fillStyle = a.color; sctx.globalAlpha = alpha;
        a.sim.pts.forEach((p, i) => { if (i <= upto && i % 2 === 0) sctx.fillRect(Math.round(PHY.x0 + p.x * s) - 1, Math.round(PHY.ground + p.y * s) - 1, 2, 2); });
        sctx.globalAlpha = 1;
      }
    };
    plot(A, gA, phaseB ? 0.3 : 1);
    if (phaseB) plot(B, gB, 1);
    // Bori rides the held arc
    const run = phaseB ? B[0].sim : A[0].sim, gi = phaseB ? gB : gA;
    const pts = run.pts, i = Math.min(pts.length - 1, Math.max(0, gi));
    const p = pts[i], landed = i >= pts.length - 1;
    const key = landed ? 'idle' : (i < run.apexFrame ? 'jump' : 'fall');
    drawSprite(sctx, SHEETS.hero, key, PHY.x0 + p.x * s - 8, PHY.ground + p.y * s - 16, { sx: 2, sy: 2 });
    // labels
    let lx = 8;
    for (const a of A) {
      sctx.fillStyle = a.color; sctx.fillRect(lx, 8, 6, 6);
      drawText(sctx, a.label, lx + 9, 8, { color: '#CAD5CF', shadow: false });
      lx += 15 + textWidth(a.label) + 10;
    }
    const gText = phaseB ? '0.20' : '0.25';
    drawText(sctx, 'GRAVITY', 8, 179, { color: '#FFE0A8' });
    drawText(sctx, gText, 56, 177, { scale: 2, color: phaseB ? '#FFFF55' : '#FFFFFF' });
    const apex = (phaseB ? B : A)[0].sim.apex;
    drawText(sctx, 'PEAK ' + (apex / 16).toFixed(1) + ' TILES', 248, 179, { align: 'right', color: '#FFFFFF' });
    const y = Math.round(PHY.ground - apex * s);
    sctx.fillStyle = 'rgba(240,169,58,0.55)';
    for (let x = PHY.x0; x < 240; x += 4) sctx.fillRect(x, y, 2, 1);
  };

  // 5. State machines: Bori's six states, lit by the game as it runs
  const ST = { g0: 250, nodes: {
    idle: [8, 8], jump: [96, 8], stumble: [184, 8],
    run: [8, 36], fall: [96, 36], dead: [184, 36],
  } };
  function preStates() {
    seed(1);
    const w = new World({ mode: 'attract', input: new Input(), sound: true, hud: false });
    const cues = [];
    w.sfx = (name) => cues.push([w.frame, name]);
    while (w.frame < ST.g0) w.update();
    const frames = [];
    let prev = w.p.state, lastChange = -99, from = null;
    for (let v = 0; v < 56; v++) {
      w.render(sctx, 1);
      frames.push({ img: shot(), state: w.p.state, throwing: w.p.throwT > 0, from, since: v - lastChange });
      for (let g = 0; g < 2; g++) {
        w.update();
        if (w.p.state !== prev) { from = prev; prev = w.p.state; lastChange = v + 1; }
      }
    }
    pre.states = frames;
    for (const [gf, name] of cues) if (gf >= ST.g0) sfxCues.push([g2v(gf, ST.g0, 252) / FPS, name, 0.9]);
  }
  SCREENS.states = (t) => {
    const fr = pre.states[Math.min(pre.states.length - 1, t)];
    sctx.drawImage(fr.img, 0, 0);
    sctx.fillStyle = 'rgba(13,17,18,0.9)'; sctx.fillRect(0, 0, SCREEN_W, 62);
    sctx.fillStyle = '#313B3B'; sctx.fillRect(0, 62, SCREEN_W, 1);
    const N = ST.nodes, w = 64, h = 18;
    const mid = (k, side) => {
      const [x, y] = N[k];
      return side === 'r' ? [x + w, y + h / 2] : side === 'l' ? [x, y + h / 2] : side === 'b' ? [x + w / 2, y + h] : [x + w / 2, y];
    };
    const edge = (a, b, hot) => {
      sctx.strokeStyle = hot ? '#FF5555' : '#3E4A4A'; sctx.lineWidth = 1;
      sctx.beginPath(); sctx.moveTo(a[0] + 0.5, a[1] + 0.5); sctx.lineTo(b[0] + 0.5, b[1] + 0.5); sctx.stroke();
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      sctx.fillStyle = hot ? '#FF5555' : '#3E4A4A';
      sctx.beginPath(); sctx.moveTo(b[0] + 0.5, b[1] + 0.5);
      sctx.lineTo(b[0] + 0.5 - Math.cos(ang - 0.5) * 4, b[1] + 0.5 - Math.sin(ang - 0.5) * 4);
      sctx.lineTo(b[0] + 0.5 - Math.cos(ang + 0.5) * 4, b[1] + 0.5 - Math.sin(ang + 0.5) * 4);
      sctx.fill();
    };
    const hot = (a, b) => fr.from === a && fr.state === b && fr.since < 8;
    const [ix, iy] = mid('idle', 'b'), [rx, ry] = mid('run', 't');
    edge([ix - 8, iy], [rx - 8, ry], hot('idle', 'run'));
    edge([rx + 8, ry], [ix + 8, iy], hot('run', 'idle'));
    edge(mid('idle', 'r'), mid('jump', 'l'), hot('idle', 'jump'));
    edge([N.run[0] + w, N.run[1] + 4], [N.jump[0], N.jump[1] + 14], hot('run', 'jump'));
    edge(mid('jump', 'b'), mid('fall', 't'), hot('jump', 'fall'));
    edge([N.fall[0], N.fall[1] + 13], [N.run[0] + w, N.run[1] + 13], hot('fall', 'run') || hot('fall', 'idle'));
    edge([N.run[0] + w, N.run[1] + 5], [N.fall[0], N.fall[1] + 5], hot('run', 'fall'));
    edge(mid('jump', 'r'), mid('stumble', 'l'), false);
    edge(mid('fall', 'r'), mid('dead', 'l'), hot('fall', 'dead'));
    for (const k of Object.keys(N)) {
      const [x, y] = N[k], on = fr.state === k;
      sctx.fillStyle = on ? '#F0A93A' : '#1C2324'; sctx.fillRect(x, y, w, h);
      sctx.strokeStyle = on ? '#FFE0A8' : '#3E4A4A'; sctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      drawText(sctx, on && fr.throwing ? k + '+THROW' : k, x + w / 2, y + 6, { align: 'center', color: on ? '#151A1B' : '#7D8B85', shadow: false });
    }
  };

  // 6. Hardware: one background layer, a new scroll value at the start of each band
  SCREENS.hardware = (t) => {
    const camX = 30 + t * 7;
    Parallax.draw(sctx, camX, { time: 0 });
    // the ground band scrolls at full speed: draw it from the real level
    const L = ASSETS.level;
    const c0 = Math.floor(camX / TILE);
    for (let ty = 10; ty < 12; ty++) for (let tx = c0; tx <= c0 + 16; tx++) {
      const cv = TileGfx.forCell(L, tx, ty, t);
      if (cv) sctx.drawImage(cv, tx * TILE - camX, ty * TILE);
    }
    const bands = [[0, '×0.1'], [84, '×0.25'], [136, '×0.5'], [160, '×1']];
    for (const [y, label] of bands) {
      if (y > 0) { sctx.fillStyle = 'rgba(255,255,85,0.9)'; for (let x = 0; x < SCREEN_W; x += 6) sctx.fillRect(x, y, 3, 1); }
      drawText(sctx, label, 250, y + 4, { align: 'right', color: '#FFFF55' });
    }
    const chips = ['256×192 SCREEN', '16KB VRAM: 448 TILES', '8 SPRITES PER LINE', '3 SQUARE WAVES + NOISE'];
    chips.forEach((c, k) => {
      if (t < k * BEAT) return;
      const y = 6 + k * 13;
      sctx.fillStyle = 'rgba(13,17,18,0.86)'; sctx.fillRect(4, y - 3, textWidth(c) + 8, 12);
      drawText(sctx, c, 8, y, { color: k === Math.floor(t / BEAT) ? '#F0A93A' : '#FFFFFF', shadow: false });
    });
  };

  // 7. Play: the finished game, from the self-playing demo
  const PLAY = { g0: 652 };
  function prePlay() {
    seed(1);
    const w = new World({ mode: 'attract', input: new Input(), sound: true });
    const cues = [];
    w.sfx = (name) => cues.push([w.frame, name]);
    while (w.frame < PLAY.g0) w.update();
    const frames = [];
    for (let v = 0; v < 84; v++) { w.render(sctx, 1); frames.push(shot()); w.update(); w.update(); }
    pre.play = frames;
    for (const [gf, name] of cues) if (gf >= PLAY.g0) sfxCues.push([g2v(gf, PLAY.g0, 364) / FPS, name, 0.9]);
  }
  SCREENS.play = (t) => { sctx.drawImage(pre.play[Math.min(83, t)], 0, 0); };

  // 8. End: stage clear, then the title screen
  const END = { clearFor: 40, g0: 2905, hops: [56, 84] };
  const OUTRO_FRAME = 506;          // the theme returns softly after the stage-clear jingle
  function preClear() {
    seed(1);
    const w = new World({ mode: 'attract', input: new Input(), sound: false });
    while (w.frame < END.g0 - 2) w.update();
    const frames = [];
    for (let v = 0; v < END.clearFor; v++) { w.render(sctx, 1); frames.push(shot()); w.update(); w.update(); }
    pre.clear = frames;
  }
  SCREENS.end = (t) => {
    if (t < END.clearFor) { sctx.drawImage(pre.clear[t], 0, 0); return; }
    const k = t - END.clearFor;
    Parallax.draw(sctx, 600 + k * 0.5, { time: k });
    const L = ASSETS.level;
    for (let ty = 10; ty < 12; ty++) for (let tx = 0; tx < 16; tx++) {
      const cv = TileGfx.forCell(L, tx + 2, ty, k);
      if (cv) sctx.drawImage(cv, tx * TILE, ty * TILE);
    }
    if (k < 3) { sctx.fillStyle = `rgba(255,255,255,${0.8 - k * 0.3})`; sctx.fillRect(0, 0, SCREEN_W, SCREEN_H); }
    drawText(sctx, 'BORI ISLAND', SCREEN_W / 2, 34, { scale: 3, align: 'center', color: '#FFFF55', shadowColor: '#AA0000' });
    drawText(sctx, 'DEV NOTES', SCREEN_W / 2, 66, { scale: 2, align: 'center', color: '#FFFFFF' });
    // Bori runs in and stops at the center
    const stopAt = 120, x = Math.min(stopAt, -16 + k * 4);
    const moving = x < stopAt;
    let key = moving ? ['run1', 'run2', 'run3', 'run4'][Math.floor(k / 2) % 4] : animFrame('idle', (k - 34) * 2 + 140);
    let hop = 0;
    for (const h of END.hops) {
      const j = k - h;
      if (j >= 0 && j < 16) { const tt = j / 16; hop = Math.round(4 * 22 * tt * (1 - tt)); key = tt < 0.5 ? 'jump' : 'fall'; }
    }
    drawSprite(sctx, SHEETS.hero, key, x, 144 - hop);
    if (!moving && ((k >> 3) & 1) === 0) drawText(sctx, 'PRESS START', SCREEN_W / 2, 104, { align: 'center' });
  };

  // ── audio: the soundtrack, from the same chip emulation, rendered offline ─────────
  async function renderAudio() {
    const sr = 48000, seconds = TOTAL / FPS + 0.25;
    const actx = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
    const sys = { ctx: actx, noiseBuffers: [] };
    for (const r of NOISE_RATES) sys.noiseBuffers.push(lfsrBuffer(actx, r, false));
    for (const r of NOISE_RATES) sys.noiseBuffers.push(lfsrBuffer(actx, r, true));
    const master = actx.createGain(); master.gain.value = 1; master.connect(actx.destination);
    sys.musicBus = actx.createGain(); sys.musicBus.gain.value = 0.85; sys.musicBus.connect(master);
    sys.sfxBus = actx.createGain(); sys.sfxBus.gain.value = 1; sys.sfxBus.connect(master);
    const play = (song, t0, maxFrames, bus) => {
      const d = new MusicDriver(Object.assign({}, sys, bus ? { musicBus: bus } : {}));
      d.song = song; d.loop = false; d.onEnd = null;
      d.pos = { order: 0, row: 0, tick: 0 };
      d.st = [0, 1, 2, 3].map(() => ({ note: 0, frame: 0, on: false, rel: false, vol: 0 }));
      d.playing = true; d.nextT = t0;
      let n = 0;
      while (d.playing && n < maxFrames) { d.frame(d.nextT); d.nextT += 1 / 60; n++; }
      for (const c of d.ch) c.silence(d.nextT);
    };
    // the song plays A B A C (8 bars) under everything up to the end card, then the stage-clear jingle
    const musicFrames = SCENES.find((s) => s.id === 'end').from * 2;
    play(SONG, 0, musicFrames);
    play(JINGLE_CLEAR, musicFrames / 60, 400);
    const outro = actx.createGain(), tOut = OUTRO_FRAME / FPS, tEndAll = TOTAL / FPS;
    outro.gain.setValueAtTime(0.5, 0);
    outro.gain.setValueAtTime(0.5, tEndAll - 1.4);
    outro.gain.linearRampToValueAtTime(0, tEndAll - 0.05);
    outro.connect(master);
    play(SONG, tOut, Math.ceil((tEndAll - tOut) * 60) + 2, outro);
    // sound effects: one voice each, with the music ducked a little underneath
    const cues = sfxCues.slice().sort((a, b) => a[0] - b[0]);
    cues.push([52 / FPS, 'power', 0.8], [(448 + 22) / FPS, 'fruit', 0.7], [196 / FPS, 'jump', 0.9], [224 / FPS, 'jump', 0.9]);
    for (const h of END.hops) cues.push([(448 + END.clearFor + h) / FPS, 'jump', 0.6]);
    for (const [t0, name, gain] of cues) {
      const p = SFX_DEFAULT[name];
      if (!p || t0 >= TOTAL / FPS) continue;
      const frames = compileSfx(p);
      const g = actx.createGain(); g.gain.value = 0; g.connect(sys.sfxBus);
      let src;
      if (p.wave === 'noise') { src = actx.createBufferSource(); src.buffer = sys.noiseBuffers[(p.rate | 0) % 4]; src.loop = true; }
      else { src = actx.createOscillator(); src.type = 'square'; }
      src.connect(g);
      frames.forEach((fr, i) => {
        const t = t0 + i / 60;
        if (src.frequency) src.frequency.setValueAtTime(psgHz(psgN(midiHz(fr.m))), t);
        g.gain.setValueAtTime(volAmp(fr.v) * CH_AMP * gain, t);
      });
      const tEnd = t0 + frames.length / 60;
      g.gain.setValueAtTime(0, tEnd);
      src.start(t0); src.stop(tEnd + 0.05);
      const mb = sys.musicBus.gain;
      if (t0 < musicFrames / 60) { mb.setTargetAtTime(0.62, t0, 0.01); mb.setTargetAtTime(0.85, tEnd, 0.08); }
    }
    const buf = await actx.startRendering();
    // 16-bit PCM WAV
    const n = buf.length, ch = 2, out = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, sr, true);
    out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
    ws(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const L0 = buf.getChannelData(0), R0 = buf.getChannelData(1);
    let o = 44, peak = 0;
    for (let i = 0; i < n; i++) { peak = Math.max(peak, Math.abs(L0[i])); }
    const norm = peak > 0 ? Math.min(1 / peak * 0.89, 3) : 1;
    for (let i = 0; i < n; i++) {
      out.setInt16(o, clamp(L0[i] * norm, -1, 1) * 32767, true); o += 2;
      out.setInt16(o, clamp(R0[i] * norm, -1, 1) * 32767, true); o += 2;
    }
    const bytes = new Uint8Array(out.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { b64: btoa(bin), peak, cues: cues.length };
  }

  return {
    init, renderFrame, renderAudio, TOTAL, FPS, COVER,
    frameDataURL: (f) => renderFrame(f).toDataURL('image/png'),
  };
})();
