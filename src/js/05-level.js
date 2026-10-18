// ───────────────────────────────────────────────────────────────
// 05 · 레벨 데이터 — 처음엔 텍스트 에디터로 그린 글자 지도에서 시작한다
// ───────────────────────────────────────────────────────────────
const LEVEL_CHUNKS = [
  [ // 0~31열: 출발, 첫 무기
    '................................', '................................', '................................',
    '................................', '................................', '................................',
    '...................a............',
    '................................',
    '.............a..........n.......',
    '..P...s..1.f.......r........S..b',
    '################################',
    '################################'],
  [ // 32~63열: 첫 구덩이와 언덕
    '................................', '................................', '................................',
    '................................', '................................', '................................',
    '......a.........................',
    '................................',
    '.........n.............g........',
    '............r.######..b..f..F...',
    '######..########################',
    '######..########################'],
  [ // 64~95열: 물 위의 통나무
    '................................', '................................', '................................',
    '................................', '................................', '................................',
    '...............n................',
    '.........a...........g..........',
    '............................Z...',
    '.2......===...===...===.........',
    '#####~~~~~~~~~~~~~~~~~~~~~######',
    '#####~~~~~~~~~~~~~~~~~~~~~######'],
  [ // 96~127열: 가시덤불, 스프링, 높은 발판
    '................................', '................................', '................................',
    '......................m.........',
    '.....................BBBB.......',
    '................................',
    '..............n.................',
    '.............BBB................',
    '................................',
    '......^^^..b.......J......r.4.F.',
    '################################',
    '################################'],
  [ // 128~159열: 구덩이 징검다리
    '................................', '................................', '................................',
    '................................', '................................', '................................',
    '.............Z..................',
    '......g...........a........n....',
    '................................',
    '..3..f...................S.b....',
    '########..####..###...######..##',
    '########..####..###...######..##'],
  [ // 160~191열: 마지막 물웅덩이와 골
    '................................', '................................', '................................',
    '................................', '................................', '................................',
    '........a.......................',
    '................................',
    '....BB......n...................',
    '......F............r..f.b..G....',
    '##########~~~###################',
    '##########~~~###################'],
];
const DEFAULT_LEVEL_TEXT = Array.from({ length: 12 }, (_, y) => LEVEL_CHUNKS.map((c) => c[y]).join('')).join('\n');

const ENT_DEFS = {
  P: { name: tr('시작 위치', 'Start'), kind: 'start', sheet: 'hero', key: 'idle' },
  a: { name: tr('사과', 'Apple'), kind: 'fruit', sheet: 'item', key: 'apple', vit: 12, pts: 50 },
  n: { name: tr('바나나', 'Banana'), kind: 'fruit', sheet: 'item', key: 'banana', vit: 16, pts: 100 },
  g: { name: tr('포도', 'Grapes'), kind: 'fruit', sheet: 'item', key: 'grape', vit: 20, pts: 200 },
  m: { name: tr('수박', 'Watermelon'), kind: 'fruit', sheet: 'item', key: 'melon', vit: 35, pts: 500 },
  1: { name: tr('꽃봉오리(도토리)', 'Bud (acorns)'), kind: 'bud', item: 'pouch', sheet: 'item', key: 'budClosed' },
  2: { name: tr('꽃봉오리(반딧불)', 'Bud (firefly)'), kind: 'bud', item: 'firefly', sheet: 'item', key: 'budClosed' },
  3: { name: tr('꽃봉오리(깃털 신발)', 'Bud (feather shoes)'), kind: 'bud', item: 'shoes', sheet: 'item', key: 'budClosed' },
  4: { name: tr('꽃봉오리(독버섯)', 'Bud (poison mushroom)'), kind: 'bud', item: 'mushroom', sheet: 'item', key: 'budClosed' },
  r: { name: tr('걸림돌', 'Rock'), kind: 'rock', sheet: 'prop', key: 'rock' },
  S: { name: tr('달팽이', 'Snail'), kind: 'snail', sheet: 'enemy', key: 'snail1' },
  F: { name: tr('개구리', 'Frog'), kind: 'frog', sheet: 'enemy', key: 'frog1' },
  Z: { name: tr('벌', 'Bee'), kind: 'bee', sheet: 'enemy', key: 'bee1' },
  J: { name: tr('스프링', 'Spring'), kind: 'spring', sheet: 'prop', key: 'spring' },
  G: { name: tr('골', 'Goal'), kind: 'goal', sheet: 'prop', key: 'goalBottom' },
};

class Level {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.tiles = new Uint8Array(w * h);
    this.ents = [];
    this.version = 0;
  }
  static fromText(text) {
    const rows = text.replace(/\r/g, '').split('\n').filter((r) => r.length > 0);
    const h = rows.length, w = Math.max(...rows.map((r) => r.length));
    const L = new Level(w, h);
    rows.forEach((row, y) => {
      for (let x = 0; x < w; x++) {
        const ch = row[x] || '.';
        if (ch in TILE_BY_CH) L.tiles[y * w + x] = TILE_BY_CH[ch];
        else if (ch in ENT_DEFS) L.ents.push({ c: ch, x, y });
      }
    });
    if (!L.ents.some((e) => e.c === 'P')) L.ents.push({ c: 'P', x: 1, y: Math.max(0, h - 3) });
    return L;
  }
  toText() {
    const grid = [];
    for (let y = 0; y < this.h; y++) {
      const row = [];
      for (let x = 0; x < this.w; x++) row.push(TILE_INFO[this.tiles[y * this.w + x]].ch);
      grid.push(row);
    }
    for (const e of this.ents) if (grid[e.y] && e.x < this.w) grid[e.y][e.x] = e.c;
    return grid.map((r) => r.join('')).join('\n');
  }
  clone() { return Level.fromText(this.toText()); }
  tile(tx, ty) { return (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) ? 0 : this.tiles[ty * this.w + tx]; }
  entAt(x, y) { return this.ents.find((e) => e.x === x && e.y === y); }
  start() { return this.ents.find((e) => e.c === 'P') || { x: 1, y: this.h - 3 }; }
  // 열 단위 RLE: 스크롤하며 새로 보이는 열만 풀면 되므로 횡스크롤 게임에 맞다
  rle() {
    const out = [];
    let prev = -1, run = 0;
    for (let x = 0; x < this.w; x++) for (let y = 0; y < this.h; y++) {
      const t = this.tiles[y * this.w + x];
      if (t === prev && run < 255) run++;
      else { if (run) out.push(run, prev); prev = t; run = 1; }
    }
    if (run) out.push(run, prev);
    return out;
  }
  toJSON() {
    return {
      width: this.w, height: this.h,
      tilesRLE: this.rle(),
      entities: this.ents.map((e) => ({ type: ENT_DEFS[e.c] ? ENT_DEFS[e.c].kind + (ENT_DEFS[e.c].item ? ':' + ENT_DEFS[e.c].item : '') : e.c, x: e.x, y: e.y })),
    };
  }
}

function rleDecodeColumns(rle, w, h) {
  const tiles = new Uint8Array(w * h);
  let i = 0;
  for (let k = 0; k < rle.length; k += 2) {
    for (let r = 0; r < rle[k]; r++, i++) {
      const x = Math.floor(i / h), y = i % h;
      if (x < w) tiles[y * w + x] = rle[k + 1];
    }
  }
  return tiles;
}

// 화면에 실제로 그리는 것은 공용 레벨 사본. 편집기가 바꾸면 버전이 오른다.
const ASSETS = {
  level: null,
  levelDefault: null,
  setLevel(L, save = true) {
    this.level = L;
    L.version = (L.version || 0) + 1;
    if (save) {
      const text = L.toText();
      if (text === DEFAULT_LEVEL_TEXT) Store.del('level'); else Store.set('level', text);
    }
    Bus.emit('level', L);
  },
};
