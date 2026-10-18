// ───────────────────────────────────────────────────────────────
// 04 · 타일과 배경 레이어
// ───────────────────────────────────────────────────────────────
const TILE = 16;
const SCREEN_W = 256, SCREEN_H = 192;
const T = { EMPTY: 0, GROUND: 1, BLOCK: 2, LOG: 3, WATER: 4, THORN: 5, BUSH: 6, FLOWER: 7, SIGN: 8 };
const TILE_INFO = [
  { id: 0, ch: '.', name: tr('빈칸', 'Empty'), solid: false },
  { id: 1, ch: '#', name: tr('땅', 'Ground'), solid: true, auto: true },
  { id: 2, ch: 'B', name: tr('돌 블록', 'Stone block'), solid: true },
  { id: 3, ch: '=', name: tr('통나무 발판', 'Log platform'), oneWay: true },
  { id: 4, ch: '~', name: tr('물', 'Water'), hazard: 'water' },
  { id: 5, ch: '^', name: tr('가시덤불', 'Thorns'), hazard: 'thorn' },
  { id: 6, ch: 'b', name: tr('풀숲', 'Bush'), deco: true },
  { id: 7, ch: 'f', name: tr('꽃', 'Flowers'), deco: true },
  { id: 8, ch: 's', name: tr('표지판', 'Sign'), deco: true },
];
const TILE_BY_CH = {};
TILE_INFO.forEach((t) => (TILE_BY_CH[t.ch] = t.id));

function idxCanvas(w, h, buf, pal = BG_PAL) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d');
  const img = cx.createImageData(w, h);
  const rgb = pal.map((p) => (p ? hexToRgb(p) : null));
  for (let i = 0; i < w * h; i++) {
    const col = rgb[buf[i]];
    if (!col) continue;
    img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  return c;
}
const BG_HEX = '.123456789abcdef';
function rowsToBuf(rows, w = 16) {
  const b = new Uint8Array(w * rows.length);
  rows.forEach((r, y) => { for (let x = 0; x < w; x++) b[y * w + x] = Math.max(0, BG_HEX.indexOf(r[x] || '.')); });
  return b;
}

// 흙 바탕 텍스처: 시드를 고정한 점찍기
function dirtBuf(variant) {
  const b = new Uint8Array(256).fill(9);
  const rnd = mulberry32(1234 + variant * 77);
  for (let i = 0; i < 256; i++) {
    const r = rnd();
    if (r < 0.07) b[i] = 10; else if (r < 0.11) b[i] = 11;
  }
  for (let k = 0; k < 2; k++) {
    const x = 1 + Math.floor(rnd() * 12), y = 8 + Math.floor(rnd() * 6);
    b[y * 16 + x] = 11; b[y * 16 + x + 1] = 11; b[(y + 1) * 16 + x] = 10; b[(y + 1) * 16 + x + 1] = 10;
  }
  return b;
}
const GRASS_ROWS = [
  '7777777777777777',
  '7677767776776767',
  '6666666666666666',
  '6686668666686666',
  '8888888888888888',
  '8.88.8..888.8.88',
  '......8.......8.',
];

// 땅 오토타일: 이웃 4칸이 같은 땅인지로 16가지 모양을 만든다 (위1 오른쪽2 아래4 왼쪽8)
function groundBuf(mask, variant) {
  const b = dirtBuf(variant);
  const set = (x, y, v) => { b[y * 16 + x] = v; };
  const top = !(mask & 1), right = !(mask & 2), bottom = !(mask & 4), left = !(mask & 8);
  if (top) GRASS_ROWS.forEach((r, y) => { for (let x = 0; x < 16; x++) if (r[x] !== '.') set(x, y, BG_HEX.indexOf(r[x])); });
  if (left) {
    for (let y = 0; y < 16; y++) set(0, y, top && y < 5 ? 8 : 10);
    for (let y = 0; y < 16; y += 3) set(1, y, top && y < 5 ? 8 : 10);
    if (top) { set(0, 0, 0); set(1, 0, 7); set(0, 1, 8); }
  }
  if (right) {
    for (let y = 0; y < 16; y++) set(15, y, top && y < 5 ? 8 : 10);
    for (let y = 1; y < 16; y += 3) set(14, y, top && y < 5 ? 8 : 10);
    if (top) { set(15, 0, 0); set(14, 0, 7); set(15, 1, 8); }
  }
  if (bottom) for (let x = 0; x < 16; x++) set(x, 15, 10);
  return b;
}

function blockBuf() {
  const b = new Uint8Array(256).fill(13);
  const rnd = mulberry32(99);
  for (let i = 0; i < 256; i++) { const r = rnd(); if (r < 0.06) b[i] = 12; else if (r < 0.09) b[i] = 2; }
  for (let i = 0; i < 16; i++) { b[i] = 2; b[i * 16] = 2; b[15 * 16 + i] = 12; b[i * 16 + 15] = 12; }
  b[0] = 2; b[15] = 12; b[240] = 12;
  for (let i = 2; i < 14; i++) { b[1 * 16 + i] = 3; }
  return b;
}

function logBuf(mask) {
  const rows = [
    '1111111111111111',
    'bbbbbbbbbbbbbbbb',
    '9b99999b9999b999',
    '9999a9999a999999',
    '99999999999999a9',
    'aaaaaaaaaaaaaaaa',
    '1111111111111111',
  ];
  const b = new Uint8Array(256);
  b.set(rowsToBuf(rows), 0);
  const cap = (x0, dir) => {
    for (let y = 1; y < 6; y++) b[y * 16 + x0] = 1;
    for (let y = 1; y < 6; y++) b[y * 16 + x0 + dir] = (y === 1 || y === 5) ? 9 : 11;
    b[3 * 16 + x0 + dir * 2] = 9;
    b[0 * 16 + x0] = 0; b[6 * 16 + x0] = 0;
  };
  if (!(mask & 8)) cap(0, 1);
  if (!(mask & 2)) cap(15, -1);
  return b;
}

// 물: 표면은 8픽셀 주기의 물결, 프레임마다 한 칸씩 민다
function waterBuf(surface, frame) {
  const b = new Uint8Array(256).fill(5);
  const rnd = mulberry32(7);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (rnd() < 0.05) b[y * 16 + x] = 4;
  }
  if (surface) {
    const s1 = '..22....', s2 = '.2332...', s3 = '23333222';
    for (let x = 0; x < 16; x++) {
      const k = (x + frame) & 7;
      b[0 * 16 + x] = 0;
      b[1 * 16 + x] = s1[k] === '.' ? 0 : BG_HEX.indexOf(s1[k]);
      b[2 * 16 + x] = s2[k] === '.' ? 0 : BG_HEX.indexOf(s2[k]);
      b[3 * 16 + x] = BG_HEX.indexOf(s3[k]);
      b[4 * 16 + x] = 4;
      b[5 * 16 + x] = ((x + frame * 2) % 11 === 0) ? 3 : 4;
    }
  }
  return b;
}

function thornBuf() {
  const b = new Uint8Array(256);
  for (let i = 0; i < 4; i++) {
    const cx = 2 + i * 4;
    for (let r = 0; r < 8; r++) {
      const y = 6 + r, hw = Math.floor(r / 3);
      for (let x = cx - hw; x <= cx + hw; x++) {
        if (x < 0 || x > 15) continue;
        b[y * 16 + x] = x === cx - hw ? 2 : x === cx + hw ? 12 : 13;
      }
      if (r === 0) b[y * 16 + cx] = 2;
    }
  }
  for (let y = 12; y < 16; y++) for (let x = 0; x < 16; x++) {
    b[y * 16 + x] = ((x * 3 + y * 5) % 7 < 2) ? 6 : 8;
  }
  return b;
}

function bushBuf() {
  const b = new Uint8Array(256);
  const blobs = [[5, 10, 5], [10, 9, 6], [8, 7, 4.5]];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    for (const [cx, cy, r] of blobs) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r && y <= 15) {
        const lit = (x - cx) + (y - cy) < -r * 0.4;
        const dark = (x - cx) + (y - cy) > r * 0.5;
        b[y * 16 + x] = lit ? 7 : dark ? 8 : 6;
        if (d > r - 1) b[y * 16 + x] = 8;
      }
    }
  }
  for (let x = 0; x < 16; x++) if (b[15 * 16 + x]) b[15 * 16 + x] = 8;
  return b;
}

const FLOWER_ROWS = [
  '................', '................', '................', '................', '................',
  '......e.........',
  '.....efe..e.....',
  '......e8.efe....',
  '.......8..e.....',
  '.......8.8......',
  '.......888......',
  '......8.8.......',
  '......8.8.......',
  '.....88.88......',
  '....8.8.8.8.....',
  '...8.8.8.8.8....',
];
const SIGN_ROWS = [
  '................', '................', '................',
  '..1111111111....',
  '..1bbbbbbbbb1...',
  '..1b999999999b1.',
  '..1b9999999999b1',
  '..1b999999999b1.',
  '..1bbbbbbbbb1...',
  '..1111111111....',
  '.....1b91.......',
  '.....1b91.......',
  '.....1b91.......',
  '.....1b91.......',
  '.....1b91.......',
  '....1b9991......',
];

const TileGfx = {
  cache: new Map(),
  get(key, make) {
    let c = this.cache.get(key);
    if (!c) { c = idxCanvas(16, 16, make()); this.cache.set(key, c); }
    return c;
  },
  // 레벨의 (tx,ty) 칸을 그릴 캔버스 고르기 — 오토타일 마스크 계산 포함
  forCell(level, tx, ty, frame) {
    const id = level.tiles[ty * level.w + tx];
    switch (id) {
      case T.GROUND: {
        const m = autoMask(level, tx, ty, T.GROUND);
        const v = ((tx * 7 + ty * 13) >>> 0) % 3;
        return this.get('g' + m + ':' + v, () => groundBuf(m, v));
      }
      case T.BLOCK: return this.get('block', blockBuf);
      case T.LOG: {
        const m = autoMask(level, tx, ty, T.LOG) & 10;
        return this.get('log' + m, () => logBuf(m));
      }
      case T.WATER: {
        const surf = ty === 0 || level.tiles[(ty - 1) * level.w + tx] !== T.WATER;
        const f = (frame >> 3) & 7;
        return this.get('w' + (surf ? 1 : 0) + ':' + (surf ? f : 0), () => waterBuf(surf, f));
      }
      case T.THORN: return this.get('thorn', thornBuf);
      case T.BUSH: return this.get('bush', bushBuf);
      case T.FLOWER: return this.get('flower', () => rowsToBuf(FLOWER_ROWS));
      case T.SIGN: return this.get('sign', () => rowsToBuf(SIGN_ROWS));
      default: return null;
    }
  },
  // 팔레트·편집기에서 쓰는 대표 그림
  icon(id) {
    switch (id) {
      case T.GROUND: return this.get('g0:0', () => groundBuf(0, 0));
      case T.LOG: return this.get('log0', () => logBuf(0));
      case T.WATER: return this.get('w1:0', () => waterBuf(true, 0));
      default: return this.forCell({ w: 1, h: 1, tiles: [id] }, 0, 0, 0);
    }
  },
};

function autoMask(level, tx, ty, id) {
  const same = (x, y) => {
    if (x < 0 || x >= level.w || y >= level.h) return true;
    if (y < 0) return false;
    return level.tiles[y * level.w + x] === id;
  };
  return (same(tx, ty - 1) ? 1 : 0) | (same(tx + 1, ty) ? 2 : 0) | (same(tx, ty + 1) ? 4 : 0) | (same(tx - 1, ty) ? 8 : 0);
}

// ── 패럴랙스 레이어 ────────────────────────────────────────────
const LAYER_W = 512;
const Parallax = {
  layers: null,
  build() {
    if (this.layers) return this.layers;
    const sky = new Uint8Array(SCREEN_W * SCREEN_H);
    for (let y = 0; y < SCREEN_H; y++) for (let x = 0; x < SCREEN_W; x++) {
      let c = 4;
      if (y > 84) {
        const t = (y - 84) / 22;                       // 0→1 사이를 디더링으로 섞는다
        const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]][y & 3][x & 3] / 16;
        c = t > bayer ? 3 : 4;
      }
      sky[y * SCREEN_W + x] = c;
    }
    const clouds = new Uint8Array(LAYER_W * SCREEN_H);
    const rnd = mulberry32(42);
    const cloudDefs = [[40, 34], [150, 22], [250, 48], [345, 30], [440, 56]];
    for (const [cx0, cy0] of cloudDefs) {
      const puffs = [];
      const n = 4 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) puffs.push([cx0 + (i - n / 2) * 9 + rnd() * 4, cy0 - Math.sin((i / (n - 1)) * Math.PI) * 7 + rnd() * 3, 7 + rnd() * 5]);
      for (let y = cy0 - 22; y < cy0 + 14; y++) for (let x = cx0 - 50; x < cx0 + 50; x++) {
        let inside = false, low = false;
        for (const [px, py, r] of puffs) {
          const d = Math.hypot(x - px, y - py);
          if (d < r) { inside = true; if (y > py + r * 0.35) low = true; }
        }
        if (inside && y < cy0 + 9) {
          const xx = ((x % LAYER_W) + LAYER_W) % LAYER_W;
          clouds[y * LAYER_W + xx] = low ? 3 : 2;
        }
      }
    }
    const mountains = new Uint8Array(LAYER_W * SCREEN_H);
    const mh = (x) => 116 - 16 * Math.sin((x / LAYER_W) * TAU * 2 + 0.8) - 9 * Math.sin((x / LAYER_W) * TAU * 5 + 2.1) - 4 * Math.sin((x / LAYER_W) * TAU * 11 + 0.3);
    for (let x = 0; x < LAYER_W; x++) {
      const top = Math.round(mh(x));
      const slope = mh(x + 1) - mh(x - 1);
      for (let y = top; y < SCREEN_H; y++) {
        let c = 5;
        if (y < top + 3 && slope > 0.2) c = 4;
        if (top < 98 && y < top + 4 && y < 100) c = 2;
        mountains[y * LAYER_W + x] = c;
      }
    }
    const hills = new Uint8Array(LAYER_W * SCREEN_H);
    const hh = (x) => 150 - 9 * Math.sin((x / LAYER_W) * TAU * 3 + 1.3) - 5 * Math.sin((x / LAYER_W) * TAU * 7 + 0.5);
    const trnd = mulberry32(7);
    const trees = [];
    for (let x = 12; x < LAYER_W; x += 34 + Math.floor(trnd() * 30)) trees.push({ x, r: 7 + Math.floor(trnd() * 5), palm: trnd() < 0.4 });
    const setH = (x, y, c) => { const xx = ((x % LAYER_W) + LAYER_W) % LAYER_W; if (y >= 0 && y < SCREEN_H) hills[y * LAYER_W + xx] = c; };
    for (const t of trees) {
      const base = Math.round(hh(t.x)) + 2;
      if (t.palm) {
        const height = 30 + t.r * 2;
        for (let i = 0; i < height; i++) {
          const x = t.x + Math.round(Math.sin(i / height * 1.4) * 5);
          setH(x, base - i, i % 4 === 0 ? 11 : 9); setH(x + 1, base - i, 10);
        }
        const tx = t.x + Math.round(Math.sin(1.4) * 5), ty = base - height;
        for (const [dx, dir] of [[-1, -1], [1, 1], [-1, -0.5], [1, 0.5]]) {
          for (let i = 0; i < 14; i++) {
            const x = tx + Math.round(dir * i), y = ty + Math.round(i * i / 18) - (Math.abs(dir) < 1 ? 2 : 0);
            setH(x, y, 6); setH(x, y + 1, 8); if (i % 3 === 1) setH(x, y + 2, 8);
          }
        }
        setH(tx, ty, 9); setH(tx + 1, ty, 9);
      } else {
        const cy = base - 10 - t.r;
        for (let y = cy - t.r; y <= base; y++) for (let x = t.x - t.r; x <= t.x + t.r; x++) {
          const d = Math.hypot(x - t.x, y - cy);
          if (d <= t.r) {
            const lit = (x - t.x) + (y - cy) < -t.r * 0.5;
            setH(x, y, lit ? 7 : (x - t.x) + (y - cy) > t.r * 0.4 ? 8 : 6);
          } else if (y > cy && Math.abs(x - t.x) <= 1) setH(x, y, 9);
        }
      }
    }
    const hillsBare = new Uint8Array(LAYER_W * SCREEN_H);   // 나무 없는 언덕 (8장 래스터 스크롤 데모)
    for (let x = 0; x < LAYER_W; x++) {
      const top = Math.round(hh(x));
      for (let y = top; y < SCREEN_H; y++) {
        const c = y === top ? 6 : ((x + y) % 9 === 0 ? 6 : 8);
        hills[y * LAYER_W + x] = c;
        hillsBare[y * LAYER_W + x] = c;
      }
    }
    this.bufs = { sky, clouds, mountains, hills };     // 8장의 VRAM 계산에서 쓴다
    this.layers = {
      sky: idxCanvas(SCREEN_W, SCREEN_H, sky),
      clouds: idxCanvas(LAYER_W, SCREEN_H, clouds),
      mountains: idxCanvas(LAYER_W, SCREEN_H, mountains),
      hills: idxCanvas(LAYER_W, SCREEN_H, hills),
      hillsBare: idxCanvas(LAYER_W, SCREEN_H, hillsBare),
    };
    return this.layers;
  },
  // 기본 속도 배율: 멀수록 느리게
  defaults: { clouds: 0.1, mountains: 0.25, hills: 0.5 },
  draw(ctx, camX, o = {}) {
    const L = this.build();
    const f = Object.assign({}, this.defaults, o.factors || {});
    const show = o.show || {};
    if (show.sky !== false) ctx.drawImage(L.sky, 0, 0);
    else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H); }
    for (const name of ['clouds', 'mountains', 'hills']) {
      if (show[name] === false) continue;
      const off = Math.floor(((camX * f[name] + (name === 'clouds' ? (o.time || 0) * 0.05 : 0)) % LAYER_W + LAYER_W) % LAYER_W);
      ctx.drawImage(L[name], -off, (o.yOff || 0));
      ctx.drawImage(L[name], LAYER_W - off, (o.yOff || 0));
    }
  },
};
