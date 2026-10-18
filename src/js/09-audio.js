// ───────────────────────────────────────────────────────────────
// 09 · 사운드 — SN76489 계열 PSG 흉내: 사각파 3채널 + 노이즈 1채널
// 드라이버는 1/60초마다 '레지스터'(주파수 N, 볼륨)를 쓴다
// ───────────────────────────────────────────────────────────────
const PSG_CLOCK = 3579545;                          // NTSC 마스터 시스템 클럭(Hz)
const psgN = (f) => clamp(Math.round(PSG_CLOCK / (32 * f)), 1, 1023);   // 10비트 톤 레지스터
const psgHz = (n) => PSG_CLOCK / (32 * n);
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const hzMidi = (f) => 69 + 12 * Math.log2(f / 440);
const volAmp = (v) => (v <= 0 ? 0 : Math.pow(10, (-2 * (15 - v)) / 20)); // 한 단계 = 2dB
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (m) => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const PSG_MIN_MIDI = 45;                            // A2(110Hz). 그 아래는 N이 1023을 넘는다
const NOISE_RATES = [16000, 7000, 3500, 1200];      // 노이즈 시프트 속도(Hz): 높음→낮음
const CH_AMP = 0.2;

function parseNote(s) {
  const m = /^([A-G])(#?)(-?\d)$/.exec(s);
  if (!m) return 0;
  return NOTE_NAMES.indexOf(m[1] + m[2]) + (parseInt(m[3], 10) + 1) * 12;
}

// 16비트 LFSR(탭: 0번·3번 비트)로 만든 노이즈. periodic이면 비트 하나가 도는 '버즈' 소리.
function lfsrBuffer(ctx, rate, periodic) {
  const sr = ctx.sampleRate, len = sr;
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let reg = 0x8000, acc = 0;
  const step = rate / sr;
  for (let i = 0; i < len; i++) {
    acc += step;
    while (acc >= 1) {
      acc -= 1;
      const fb = periodic ? (reg & 1) : ((reg & 1) ^ ((reg >> 3) & 1));
      reg = (reg >> 1) | (fb << 15);
    }
    d[i] = reg & 1 ? 0.85 : -0.85;
  }
  return buf;
}

class ToneChannel {
  constructor(sys, dest) {
    const ctx = sys.ctx;
    this.osc = ctx.createOscillator();
    this.osc.type = 'square';
    this.osc.frequency.value = 440;
    this.vol = ctx.createGain(); this.vol.gain.value = 0;
    this.steal = ctx.createGain(); this.steal.gain.value = 1;
    this.user = ctx.createGain(); this.user.gain.value = 1;
    this.osc.connect(this.vol); this.vol.connect(this.steal); this.steal.connect(this.user); this.user.connect(dest);
    this.osc.start();
  }
  write(t, n, v) {
    this.osc.frequency.setValueAtTime(psgHz(n), t);
    this.vol.gain.setValueAtTime(volAmp(v) * CH_AMP, t);
  }
  silence(t) { this.vol.gain.setValueAtTime(0, t); }
  cancel(t) { this.osc.frequency.cancelScheduledValues(t); this.vol.gain.cancelScheduledValues(t); }
}

class NoiseChannel {
  constructor(sys, dest) {
    const ctx = sys.ctx;
    this.vol = ctx.createGain(); this.vol.gain.value = 0;
    this.steal = ctx.createGain(); this.steal.gain.value = 1;
    this.user = ctx.createGain(); this.user.gain.value = 1;
    this.vol.connect(this.steal); this.steal.connect(this.user); this.user.connect(dest);
    this.sel = sys.noiseBuffers.map((buf) => {
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(g); g.connect(this.vol);
      src.start();
      return g;
    });
  }
  // rate: 0~3 백색 노이즈, 4~7 주기 노이즈
  write(t, rate, v) {
    this.sel.forEach((g, i) => g.gain.setValueAtTime(i === rate ? 1 : 0, t));
    this.vol.gain.setValueAtTime(volAmp(v) * CH_AMP * 0.9, t);
  }
  silence(t) { this.vol.gain.setValueAtTime(0, t); }
  cancel(t) { this.vol.gain.cancelScheduledValues(t); this.sel.forEach((g) => g.gain.cancelScheduledValues(t)); }
}

// ── 악기: 볼륨 매크로(프레임별 0~15), 아르페지오, 비브라토 ──────────
const INSTR = [
  { name: tr('리드', 'Lead'), vol: [11, 13, 13, 12, 12, 11, 11, 11, 10, 10, 10, 10, 9], release: 2, vibDelay: 14, vibDepth: 0.22, vibSpeed: 8 },
  { name: tr('화음', 'Harmony'), vol: [10, 10, 9, 9, 8, 8, 8, 7, 7, 7, 6, 6, 6, 5], release: 4, arp: 'diatonic' },
  { name: tr('베이스', 'Bass'), vol: [13, 13, 12, 11, 10, 9, 8, 8, 7, 7, 6, 6, 5], release: 4 },
  { name: tr('드럼', 'Drums') },
];
const DRUMS = {
  1: { name: tr('킥', 'Kick'), short: 'KK', rate: 3, vol: [15, 13, 11, 8, 5, 3, 1, 0] },
  2: { name: tr('스네어', 'Snare'), short: 'SN', rate: 1, vol: [14, 12, 10, 9, 7, 6, 4, 3, 2, 1, 0] },
  3: { name: tr('하이햇', 'Hi-hat'), short: 'HH', rate: 0, vol: [8, 5, 2, 0] },
  4: { name: tr('크래시', 'Crash'), short: 'CR', rate: 0, vol: [12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 0] },
};
// C장조 안에서 근음만 주면 장·단·감3화음을 고른다
function diatonicArp(note) {
  const pc = ((note % 12) + 12) % 12;
  if (pc === 0 || pc === 5 || pc === 7) return [0, 4, 7];
  if (pc === 2 || pc === 4 || pc === 9) return [0, 3, 7];
  if (pc === 11) return [0, 3, 6];
  return [0, 4, 7];
}

// ── 노래 데이터: 'C5:2'= C5 음을 2줄 동안, 'r:2'= 쉼(노트 오프) ──
const SONG_SRC = {
  speed: 7,
  order: ['A', 'B', 'A', 'C', 'D', 'E', 'A', 'C'],
  patterns: {
    A: ['E5:2 G5:2 C6:4 B5:2 C6:2 G5:4 | A5:3 G5:1 E5:4 C5:2 D5:2 E5:4',
        'r:2 C4:2 r:2 C4:2 r:2 C4:2 r:2 C4:2 | r:2 A3:2 r:2 A3:2 r:2 A3:2 r:2 A3:2',
        'C3:2 C4:2 C3:2 C4:2 C3:2 C4:2 G3:2 C4:2 | A2:2 A3:2 A2:2 A3:2 A2:2 A3:2 E3:2 A3:2',
        'K:2 H:2 S:2 H:2 K:2 K:2 S:2 H:2 | K:2 H:2 S:2 H:2 K:2 K:2 S:2 H:2'],
    B: ['F5:2 A5:2 C6:4 B5:2 A5:2 F5:4 | G5:3 F5:1 D5:4 G5:2 A5:2 B5:4',
        'r:2 F3:2 r:2 F3:2 r:2 F3:2 r:2 F3:2 | r:2 G3:2 r:2 G3:2 r:2 G3:2 r:2 G3:2',
        'F3:2 F4:2 F3:2 F4:2 F3:2 F4:2 C4:2 F4:2 | G3:2 G4:2 G3:2 G4:2 G3:2 G4:2 D4:2 G4:2',
        'K:2 H:2 S:2 H:2 K:2 K:2 S:2 H:2 | K:2 H:2 S:2 H:2 K:2 K:2 S:2 H:2'],
    C: ['A5:2 A5:2 G5:2 F5:2 G5:2 G5:2 A5:2 B5:2 | C6:4 G5:2 E5:2 C5:4 r:4',
        'r:2 F3:2 r:2 F3:2 r:2 G3:2 r:2 G3:2 | r:2 C4:2 r:2 C4:2 r:2 C4:2 r:2 C4:2',
        'F3:2 F4:2 F3:2 F4:2 G3:2 G4:2 G3:2 G4:2 | C3:2 C4:2 C3:2 C4:2 G3:2 C4:2 E3:2 G3:2',
        'K:2 H:2 S:2 H:2 K:2 K:2 S:2 H:2 | K:2 H:2 S:2 H:2 S:1 S:1 S:2 S:2 C:2'],
    D: ['C6:4 B5:2 A5:2 E5:4 A5:4 | B5:4 G5:2 E5:2 B4:6 r:2',
        'r:2 A3:2 r:2 A3:2 r:2 A3:2 r:2 A3:2 | r:2 E3:2 r:2 E3:2 r:2 E3:2 r:2 E3:2',
        'A2:2 A3:2 A2:2 A3:2 A2:2 A3:2 E3:2 A3:2 | E3:2 E4:2 E3:2 E4:2 E3:2 E4:2 B3:2 E4:2',
        'K:4 H:2 H:2 S:4 H:2 H:2 | K:4 H:2 H:2 S:4 H:2 K:2'],
    E: ['A5:4 C6:2 A5:2 F5:4 A5:4 | B5:4 D6:2 B5:2 G5:4 r:4',
        'r:2 F3:2 r:2 F3:2 r:2 F3:2 r:2 F3:2 | r:2 G3:2 r:2 G3:2 r:2 G3:2 r:2 G3:2',
        'F3:2 F4:2 F3:2 F4:2 F3:2 F4:2 C4:2 F4:2 | G3:2 G4:2 G3:2 G4:2 G3:2 A3:2 B3:2 D4:2',
        'K:4 H:2 H:2 S:4 H:2 H:2 | K:2 K:2 S:2 K:2 S:1 S:1 S:1 S:1 S:2 S:2'],
  },
};
const JINGLE_CLEAR_SRC = {
  speed: 5, loop: false, order: ['A'],
  patterns: { A: ['G5:2 C6:2 E6:2 G6:4 E6:2 G6:10 r:10', 'r:6 C4:4 r:2 C4:10 r:10', 'C3:2 E3:2 G3:2 C4:4 G3:2 C3:10 r:10', 'K:2 H:2 S:2 K:4 S:2 C:10 r:10'] },
};
const JINGLE_OVER_SRC = {
  speed: 9, loop: false, order: ['A'],
  patterns: { A: ['G5:4 E5:4 C5:4 D5:2 B4:2 C5:8 r:8', 'r:32', 'C4:4 G3:4 E3:4 G3:4 C3:8 r:8', 'r:32'] },
};
const DRUM_TOKENS = { K: 1, S: 2, H: 3, C: 4 };

function parseChannel(str, ch, len = 32) {
  const out = new Array(len).fill(0);
  let row = 0;
  for (const tok of str.split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const [name, l] = tok.split(':');
    const n = parseInt(l || '1', 10);
    if (row < len) {
      if (name === 'r') out[row] = -1;
      else if (ch === 3) out[row] = DRUM_TOKENS[name] || 0;
      else out[row] = parseNote(name);
    }
    row += n;
  }
  return out;
}
function buildSong(src) {
  const s = { speed: src.speed, loop: src.loop !== false, order: src.order.slice(), patterns: {} };
  for (const k of Object.keys(src.patterns)) s.patterns[k] = src.patterns[k].map((c, i) => parseChannel(c, i));
  return s;
}

// ── 음악 드라이버: 1/60초 틱마다 행을 넘기고 매크로를 돌린다 ──────────
class MusicDriver {
  constructor(sys) {
    this.sys = sys;
    this.ch = [new ToneChannel(sys, sys.musicBus), new ToneChannel(sys, sys.musicBus), new ToneChannel(sys, sys.musicBus), new NoiseChannel(sys, sys.musicBus)];
    this.playing = false;
    this.timeline = [];
    this.owner = null;
    this.userMute = [false, false, false, false];
  }
  play(song, o = {}) {
    const ctx = this.sys.ctx;
    if (!ctx) return;
    this.stop();
    this.song = song;
    this.owner = o.owner || null;
    this.loop = o.loop != null ? o.loop : song.loop !== false;
    this.onEnd = o.onEnd || null;
    this.pos = { order: o.startOrder || 0, row: 0, tick: 0 };
    this.st = [0, 1, 2, 3].map(() => ({ note: 0, frame: 0, on: false, rel: false, vol: 0 }));
    this.nextT = ctx.currentTime + 0.06;
    this.playing = true;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }
  stop() {
    clearInterval(this.timer);
    this.playing = false;
    this.timeline.length = 0;
    const ctx = this.sys.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const c of this.ch) { c.cancel(t); c.silence(t); }
  }
  setUserMute(i, m) {
    this.userMute[i] = m;
    const ctx = this.sys.ctx;
    if (ctx) this.ch[i].user.gain.setValueAtTime(m ? 0 : 1, ctx.currentTime);
  }
  schedule() {
    const ctx = this.sys.ctx;
    const until = ctx.currentTime + 0.12;                // 0.12초 앞까지 미리 예약
    while (this.playing && this.nextT < until) {
      this.frame(this.nextT);
      this.nextT += 1 / 60;
    }
  }
  frame(t) {
    if (this.pos.tick === 0) this.processRow();
    const regs = [];
    for (let c = 0; c < 4; c++) regs.push(this.voice(c, t));
    this.timeline.push({ t, order: this.pos.order, row: this.pos.row, regs });
    if (this.timeline.length > 90) this.timeline.shift();
    this.pos.tick++;
    if (this.pos.tick >= this.song.speed) { this.pos.tick = 0; this.advance(t); }
  }
  processRow() {
    const pat = this.song.patterns[this.song.order[this.pos.order]];
    for (let c = 0; c < 4; c++) {
      const v = pat[c][this.pos.row];
      const st = this.st[c];
      if (v > 0) { st.note = v; st.frame = 0; st.on = true; st.rel = false; }
      else if (v === -1) st.rel = true;
    }
  }
  advance(t) {
    const s = this.song;
    this.pos.row++;
    const len = s.patterns[s.order[this.pos.order]][0].length;
    if (this.pos.row >= len) {
      this.pos.row = 0;
      this.pos.order++;
      if (this.pos.order >= s.order.length) {
        if (this.loop) this.pos.order = 0;
        else {
          this.playing = false;
          clearInterval(this.timer);
          const endT = t + 1 / 60;
          for (const c of this.ch) c.silence(endT);
          const cb = this.onEnd;
          if (cb) setTimeout(cb, Math.max(0, (endT - this.sys.ctx.currentTime) * 1000));
        }
      }
    }
  }
  voice(c, t) {
    const st = this.st[c], ch = this.ch[c];
    if (!st.on) { ch.silence(t); return null; }
    if (c === 3) {
      const d = DRUMS[st.note];
      if (!d || st.frame >= d.vol.length || st.rel) { st.on = false; ch.silence(t); return null; }
      const v = d.vol[st.frame];
      ch.write(t, d.rate, v);
      st.frame++;
      return { rate: d.rate, v, drum: st.note };
    }
    const ins = INSTR[c];
    let v;
    if (st.rel) { st.vol = Math.max(0, st.vol - (ins.release || 3)); v = st.vol; if (v === 0) st.on = false; }
    else { v = ins.vol[Math.min(st.frame, ins.vol.length - 1)]; st.vol = v; }
    let m = st.note;
    if (ins.arp) { const offs = ins.arp === 'diatonic' ? diatonicArp(st.note) : ins.arp; m += offs[st.frame % offs.length]; }
    if (ins.vibDepth && st.frame >= ins.vibDelay) m += ins.vibDepth * Math.sin(((st.frame - ins.vibDelay) / ins.vibSpeed) * TAU);
    const n = psgN(midiHz(m));
    ch.write(t, n, v);
    st.frame++;
    return { n, v, m: st.note };
  }
  // 지금 '귀에 들리는' 프레임 (UI 동기화용)
  current() {
    const ctx = this.sys.ctx;
    if (!ctx || !this.timeline.length) return null;
    const now = ctx.currentTime;
    let best = null;
    for (const f of this.timeline) { if (f.t <= now) best = f; else break; }
    return best;
  }
}

// ── 효과음: 파라미터 → 프레임별 (음높이, 볼륨) 표 → 레지스터 쓰기 ──────
const SFX_DEFAULT = {
  jump:    { wave: 'square', freq: 330, slide: 0.7, slideAcc: -0.02, vibDepth: 0, vibSpeed: 4, arp: [0], arpRate: 0, arpLoop: false, vol: 11, attack: 0, sustain: 3, decay: 10, rate: 1 },
  throw:   { wave: 'square', freq: 1400, slide: -1.3, slideAcc: 0, vibDepth: 0, vibSpeed: 4, arp: [0], arpRate: 0, arpLoop: false, vol: 9, attack: 0, sustain: 1, decay: 6, rate: 1 },
  fruit:   { wave: 'square', freq: 988, slide: 0, slideAcc: 0, vibDepth: 0, vibSpeed: 4, arp: [0, 5], arpRate: 4, arpLoop: false, vol: 12, attack: 0, sustain: 6, decay: 10, rate: 1 },
  hit:     { wave: 'noise', freq: 440, slide: 0, slideAcc: 0, vibDepth: 0, vibSpeed: 4, arp: [0], arpRate: 0, arpLoop: false, vol: 14, attack: 0, sustain: 2, decay: 12, rate: 1 },
  stumble: { wave: 'square', freq: 200, slide: -0.5, slideAcc: 0, vibDepth: 0.7, vibSpeed: 3, arp: [0], arpRate: 0, arpLoop: false, vol: 13, attack: 0, sustain: 4, decay: 16, rate: 1 },
  bud:     { wave: 'square', freq: 440, slide: 0.25, slideAcc: 0, vibDepth: 0, vibSpeed: 4, arp: [0, 4, 7, 12], arpRate: 3, arpLoop: false, vol: 12, attack: 0, sustain: 10, decay: 10, rate: 1 },
  power:   { wave: 'square', freq: 523, slide: 0.08, slideAcc: 0, vibDepth: 0, vibSpeed: 4, arp: [0, 4, 7, 12], arpRate: 2, arpLoop: true, vol: 12, attack: 0, sustain: 24, decay: 12, rate: 1 },
  bad:     { wave: 'square', freq: 330, slide: -0.2, slideAcc: 0, vibDepth: 1.2, vibSpeed: 5, arp: [0], arpRate: 0, arpLoop: false, vol: 12, attack: 0, sustain: 14, decay: 12, rate: 1 },
  spring:  { wave: 'square', freq: 160, slide: 1.3, slideAcc: -0.04, vibDepth: 0.5, vibSpeed: 3, arp: [0], arpRate: 0, arpLoop: false, vol: 12, attack: 0, sustain: 6, decay: 16, rate: 1 },
  die:     { wave: 'square', freq: 880, slide: -0.32, slideAcc: 0, vibDepth: 0.4, vibSpeed: 6, arp: [0], arpRate: 0, arpLoop: false, vol: 13, attack: 0, sustain: 20, decay: 30, rate: 1 },
  warn:    { wave: 'square', freq: 1760, slide: 0, slideAcc: 0, vibDepth: 0, vibSpeed: 4, arp: [0], arpRate: 0, arpLoop: false, vol: 7, attack: 0, sustain: 3, decay: 2, rate: 1 },
  clink:   { wave: 'noise', freq: 440, slide: 0, slideAcc: 0, vibDepth: 0, vibSpeed: 4, arp: [0], arpRate: 0, arpLoop: false, vol: 10, attack: 0, sustain: 1, decay: 4, rate: 0 },
};
const SFX_LABELS = LANG === 'en'
  ? { jump: 'Jump', throw: 'Throw', fruit: 'Fruit', hit: 'Enemy hit', stumble: 'Stumble', bud: 'Bud', power: 'Power-up', bad: 'Poison', spring: 'Spring', die: 'Death', warn: 'Hunger alarm', clink: 'Clink' }
  : { jump: '점프', throw: '던지기', fruit: '열매', hit: '적 처치', stumble: '걸림', bud: '꽃봉오리', power: '아이템', bad: '독버섯', spring: '스프링', die: '죽음', warn: '배고픔 경고', clink: '팅' };
const SFX_PRI = { die: 10, power: 7, bad: 7, stumble: 6, bud: 6, fruit: 5, hit: 5, spring: 4, jump: 3, throw: 2, warn: 1, clink: 1 };
const SFX = JSON.parse(JSON.stringify(SFX_DEFAULT));
(function restoreSfx() {
  const saved = Store.get('sfx', null);
  if (saved) for (const k of Object.keys(saved)) if (SFX[k]) Object.assign(SFX[k], saved[k]);
})();
const saveSfx = debounce(() => {
  const diff = {};
  for (const k of Object.keys(SFX)) if (JSON.stringify(SFX[k]) !== JSON.stringify(SFX_DEFAULT[k])) diff[k] = SFX[k];
  if (Object.keys(diff).length) Store.set('sfx', diff); else Store.del('sfx');
}, 300);

function compileSfx(p) {
  const frames = [];
  const total = Math.max(1, p.attack + p.sustain + p.decay);
  const base = hzMidi(p.freq);
  let semi = 0, slide = p.slide;
  for (let i = 0; i < total; i++) {
    let v;
    if (i < p.attack) v = p.vol * (i + 1) / (p.attack + 1);
    else if (i < p.attack + p.sustain) v = p.vol;
    else v = p.vol * (1 - (i - p.attack - p.sustain + 1) / (p.decay + 1));
    let arp = 0;
    if (p.arpRate > 0 && p.arp && p.arp.length) {
      const k = Math.floor(i / p.arpRate);
      arp = p.arpLoop ? p.arp[k % p.arp.length] : p.arp[Math.min(k, p.arp.length - 1)];
    }
    const vib = p.vibDepth ? p.vibDepth * Math.sin((i / Math.max(1, p.vibSpeed)) * TAU) : 0;
    const m = clamp(base + semi + arp + vib, PSG_MIN_MIDI, 120);
    frames.push({ m, v: Math.round(clamp(v, 0, 15)), rate: p.rate | 0 });
    semi += slide;
    slide += p.slideAcc;
  }
  return frames;
}

class SfxPlayer {
  constructor(sys) {
    this.sys = sys;
    this.tone = new ToneChannel(sys, sys.sfxBus);
    this.noise = new NoiseChannel(sys, sys.sfxBus);
    this.busy = { tone: { until: 0, pri: 0, name: '' }, noise: { until: 0, pri: 0, name: '' } };
    this.voices = [];
    this.duckUntil = 0;
  }
  play(name, params) {
    const ctx = this.sys.ctx;
    const p = params || SFX[name];
    if (!ctx || !p) return;
    if (this.sys.mixMode === 'modern') { this.playModern(name, p); return; }
    const slot = p.wave === 'noise' ? 'noise' : 'tone';
    const now = ctx.currentTime, b = this.busy[slot];
    const pri = SFX_PRI[name] || 1;
    if (now < b.until && pri < b.pri) return;          // 더 중요한 소리가 나는 중이면 양보
    const frames = compileSfx(p);
    const t0 = now + 0.012;
    const ch = this[slot];
    ch.cancel(t0);
    frames.forEach((f, i) => {
      const t = t0 + i / 60;
      if (slot === 'noise') ch.write(t, f.rate, f.v);
      else ch.write(t, psgN(midiHz(f.m)), f.v);
    });
    const tEnd = t0 + frames.length / 60;
    ch.silence(tEnd);
    // 채널 훔치기: 효과음이 나는 동안 음악의 같은 종류 채널을 끈다
    const music = this.sys.music;
    const steal = music.ch[slot === 'noise' ? 3 : 1].steal.gain;
    steal.cancelScheduledValues(t0);
    steal.setValueAtTime(0, t0);
    steal.setValueAtTime(1, tEnd);
    b.until = tEnd; b.pri = pri; b.name = name;
  }
  // 요즘 방식: 효과음마다 새 목소리를 만들어 섞고, 그동안 음악 버스를 살짝 낮춘다(덕킹)
  playModern(name, p) {
    const sys = this.sys, ctx = sys.ctx;
    const frames = compileSfx(p);
    const t0 = ctx.currentTime + 0.01, tEnd = t0 + frames.length / 60;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(sys.sfxBus);
    let src;
    if (p.wave === 'noise') { src = ctx.createBufferSource(); src.buffer = sys.noiseBuffers[(p.rate | 0) % 4]; src.loop = true; }
    else { src = ctx.createOscillator(); src.type = 'square'; }
    src.connect(g);
    frames.forEach((f, i) => {
      const t = t0 + i / 60;
      if (src.frequency) src.frequency.setValueAtTime(midiHz(f.m), t);     // 레지스터가 없으니 음높이가 정확하다
      g.gain.setValueAtTime(volAmp(f.v) * CH_AMP, t);
    });
    g.gain.setValueAtTime(0, tEnd);
    src.start(t0);
    src.stop(tEnd + 0.05);
    src.onended = () => { try { g.disconnect(); } catch (e) { /* 이미 끊김 */ } };
    this.duckUntil = Math.max(this.duckUntil, tEnd);
    const mb = sys.musicBus.gain;
    mb.cancelScheduledValues(t0);
    mb.setTargetAtTime(0.45, t0, 0.015);
    mb.setTargetAtTime(0.85, this.duckUntil, 0.1);
    this.voices = this.voices.filter((v) => v.tEnd > ctx.currentTime);
    this.voices.push({ name, tEnd });
  }
  activeVoices() {
    const ctx = this.sys.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    if (this.sys.mixMode === 'modern') { this.voices = this.voices.filter((v) => v.tEnd > now); return this.voices.length; }
    return (this.busy.tone.until > now ? 1 : 0) + (this.busy.noise.until > now ? 1 : 0);
  }
  stolen(ch) {
    const ctx = this.sys.ctx;
    if (!ctx) return null;
    const slot = ch === 3 ? 'noise' : ch === 1 ? 'tone' : null;
    if (!slot) return null;
    const b = this.busy[slot];
    return ctx.currentTime < b.until ? b.name : null;
  }
}

const AudioSys = {
  ctx: null,
  enabled: Store.get('sound', true),
  mixMode: Store.get('mix', 'chip'),            // 'chip' = 음악 채널을 빌림, 'modern' = 따로 섞고 덕킹
  setMixMode(m) {
    this.mixMode = m;
    Store.set('mix', m);
    if (this.ctx && this.musicBus) {
      const t = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setTargetAtTime(0.85, t, 0.02);
      for (const c of this.music.ch) { c.steal.gain.cancelScheduledValues(t); c.steal.gain.setValueAtTime(1, t); }
      this.sfxPlayer.duckUntil = 0;
    }
    Bus.emit('mix', m);
  },
  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { this.ctx = new AC(); } catch (e) { return null; }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.75 : 0;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.master.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.85; this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 1; this.sfxBus.connect(this.master);
    this.noiseBuffers = [];
    for (const r of NOISE_RATES) this.noiseBuffers.push(lfsrBuffer(ctx, r, false));
    for (const r of NOISE_RATES) this.noiseBuffers.push(lfsrBuffer(ctx, r, true));
    this.music = new MusicDriver(this);
    this.sfxPlayer = new SfxPlayer(this);
    this.demoTone = new ToneChannel(this, this.master);
    this.demoNoise = new NoiseChannel(this, this.master);
    return ctx;
  },
  unlock() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return !!this.ctx;
  },
  ready() { return !!(this.ctx && this.ctx.state === 'running'); },
  setEnabled(on) {
    this.enabled = on;
    Store.set('sound', on);
    if (on) this.unlock();
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.75 : 0, this.ctx.currentTime, 0.02);
    if (!on && this.music) this.music.stop();
    Bus.emit('sound', on);
  },
  sfx(name, params) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    this.sfxPlayer.play(name, params);
  },
  playMusic(song, o) {
    if (!this.enabled) return;
    this.unlock();
    if (this.music) this.music.play(song, o);
  },
  stopMusic(owner) {
    if (this.music && (!owner || this.music.owner === owner)) this.music.stop();
  },
};

const SONG = buildSong(SONG_SRC);
const SONG_DEFAULT_JSON = JSON.stringify(SONG);
(function restoreSong() {
  const saved = Store.get('song', null);
  if (saved && saved.patterns && saved.order) {
    try {
      SONG.speed = saved.speed || SONG.speed;
      SONG.order = saved.order;
      for (const k of Object.keys(saved.patterns)) SONG.patterns[k] = saved.patterns[k];
    } catch (e) { /* 저장본이 깨졌으면 기본곡 */ }
  }
})();
const saveSong = debounce(() => {
  const j = JSON.stringify(SONG);
  if (j === SONG_DEFAULT_JSON) Store.del('song'); else Store.set('song', JSON.parse(j));
  Bus.emit('song', SONG);
}, 300);
const JINGLE_CLEAR = buildSong(JINGLE_CLEAR_SRC);
const JINGLE_OVER = buildSong(JINGLE_OVER_SRC);

// 같은 드라이버로 곡 전체를 '녹음 파일'로 굽는다 (8장)
async function renderSongOffline(song) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) throw new Error(tr('이 브라우저는 오프라인 렌더링을 지원하지 않는다.', 'This browser does not support offline rendering.'));
  const sr = 44100;
  const frames = song.order.reduce((n, k) => n + song.patterns[k][0].length, 0) * song.speed;
  const ctx = new OAC(1, Math.ceil(sr * (frames / 60 + 0.4)), sr);
  const sys = { ctx, noiseBuffers: [] };
  for (const r of NOISE_RATES) sys.noiseBuffers.push(lfsrBuffer(ctx, r, false));
  for (const r of NOISE_RATES) sys.noiseBuffers.push(lfsrBuffer(ctx, r, true));
  sys.musicBus = ctx.createGain();
  sys.musicBus.gain.value = 0.85;
  sys.musicBus.connect(ctx.destination);
  const d = new MusicDriver(sys);
  d.song = song; d.loop = false; d.onEnd = null;
  d.pos = { order: 0, row: 0, tick: 0 };
  d.st = [0, 1, 2, 3].map(() => ({ note: 0, frame: 0, on: false, rel: false, vol: 0 }));
  d.playing = true; d.nextT = 0.02;
  let guard = 0;
  while (d.playing && guard++ < frames + 10) { d.frame(d.nextT); d.nextT += 1 / 60; }
  const buffer = await ctx.startRendering();
  return { buffer, seconds: frames / 60 };
}

// 오실로스코프: 마스터 출력의 파형을 그린다
function drawScope(canvas, color) {
  const W = canvas.clientWidth || 300, H = canvas.clientHeight || 80;
  const ctx = fitCanvas(canvas, W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = color; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
  ctx.globalAlpha = 1;
  if (!AudioSys.analyser) return;
  const a = AudioSys.analyser, n = a.fftSize, buf = new Float32Array(n);
  a.getFloatTimeDomainData(buf);
  let start = 0;
  for (let i = 1; i < n / 2; i++) if (buf[i - 1] < 0 && buf[i] >= 0) { start = i; break; }   // 상승 영점에서 시작해 화면을 고정
  ctx.lineWidth = 1.5; ctx.strokeStyle = color; ctx.beginPath();
  const span = Math.min(n - start, 1024);
  for (let i = 0; i < span; i++) {
    const x = (i / span) * W, y = H / 2 - buf[start + i] * H * 1.4;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.stroke();
}

// 첫 사용자 입력에서 오디오를 깨운다 (브라우저 자동재생 정책)
['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { if (AudioSys.enabled) AudioSys.unlock(); }, { capture: true, passive: true }));
