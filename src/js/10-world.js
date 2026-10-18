// ───────────────────────────────────────────────────────────────
// 10 · 월드 — 플레이어 상태 기계, 엔티티, 카메라, HUD, 장면 전환
// ───────────────────────────────────────────────────────────────
const JUICE_ALL = { shake: true, hitstop: true, particles: true, squash: true, flash: true, popups: true };
const ENEMY_PTS = { snail: 100, frog: 200, bee: 200 };
const ITEM_TEXT = { pouch: 'ACORNS!', firefly: 'SHIELD!', shoes: 'SPEED UP!', mushroom: 'POISON...' };
const ENEMY_KINDS = new Set(['snail', 'frog', 'bee']);

class World {
  constructor(o = {}) {
    this.o = Object.assign({
      mode: 'game', level: () => ASSETS.level, hud: true, lives: 3, sound: true, music: false,
      camOneWay: true, camDead: [88, 112], camSmooth: 1, camLook: 0,
      juice: Object.assign({}, JUICE_ALL), debug: {}, noDrain: false, startWeapon: false,
      respawnEnemies: 0, heroVariant: 'base', layers: null, factors: null, onEvent: null,
      startScene: null,
    }, o);
    this.j = this.o.juice;
    this.input = o.input || new Input();
    this.phys = o.phys || PHYS;
    this.frame = 0;
    this.paused = false;
    this.best = Store.get('best', 0);
    this.probe = [];
    this.levelSrc = typeof this.o.level === 'function' ? this.o.level : () => this.o.level;
    this.score = 0; this.lives = this.o.lives;
    this.reload();
    this.scene = this.o.startScene || (this.o.mode === 'game' ? 'title' : 'play');
    this.sceneT = 0;
  }

  emit(ev, data) { if (this.o.onEvent) this.o.onEvent(ev, data, this); }
  sfx(name) { if (this.o.sound && this.o.mode !== 'attract') AudioSys.sfx(name); }

  // ── 레벨 불러오기·스폰 ──────────────────────────────────────
  reload() {
    this.level = this.levelSrc();
    this.levelVersion = this.level.version;
    this.ents = [];
    for (const e of this.level.ents) { const m = this.mkEnt(e); if (m) this.ents.push(m); }
    this.acorns = []; this.particles = []; this.popups = [];
    const s = this.level.start();
    const fromCol = this.o.startCol != null ? this.findSpot(clamp(this.o.startCol, 0, this.level.w - 1), null) : null;
    this.checkpoint = fromCol || this.findSpot(s.x, s.y) || { col: s.x, row: s.y };
    // 새 판은 맨손으로 시작한다. 연습 화면은 다시 불러와도 무기를 들고 있게 둔다.
    this.spawnPlayer(this.checkpoint, this.o.mode !== 'game' && this.p ? this.p.weapon : false);
    this.cam = { x: 0, px: 0, minX: 0, look: 0, tx: 0, shake: 0 };
    this.cam.x = this.cam.px = clamp(this.p.x - this.o.camDead[0] + 5, 0, this.maxCamX());
    this.cam.minX = this.cam.x;
    this.hitstop = 0; this.flashT = 0; this.vitT = 0; this.clearDoneT = 0;
  }
  maxCamX() { return Math.max(0, this.level.w * TILE - SCREEN_W); }
  findSpot(col, row) {
    const L = this.level;
    for (let c = col; c < Math.min(L.w, col + 12); c++) {
      for (let r = Math.max(1, row != null && c === col ? row : 1); r < L.h; r++) {
        const t = L.tile(c, r), above = L.tile(c, r - 1);
        const standable = TILE_INFO[t].solid || TILE_INFO[t].oneWay;
        if (standable && !TILE_INFO[above].solid && !TILE_INFO[above].hazard) return { col: c, row: r - 1 };
      }
    }
    return null;
  }
  mkEnt(e) {
    const d = ENT_DEFS[e.c];
    if (!d) return null;
    const x = e.x * TILE, y = e.y * TILE;
    const base = { c: e.c, kind: d.kind, sheet: d.sheet, key: d.key, ox: e.x, oy: e.y, t: (e.x * 13) % 60, dead: false };
    switch (d.kind) {
      case 'start': return null;
      case 'fruit': return Object.assign(base, { x: x + 2, y: y + 2, w: 12, h: 12, dx: -2, dy: -2 });
      case 'bud': return Object.assign(base, { item: d.item, x: x + 1, y: y + 2, w: 14, h: 14, dx: -1, dy: -2, open: false, openT: 0 });
      case 'rock': return Object.assign(base, { x: x + 1, y: y + 8, w: 14, h: 8, dx: -1, dy: -8 });
      case 'snail': return Object.assign(base, { x: x + 1, y: y + 6, w: 14, h: 10, dx: -1, dy: -6, vx: 0, vy: 0, dir: -1, active: false });
      case 'frog': return Object.assign(base, { x: x + 1, y: y + 4, w: 14, h: 12, dx: -1, dy: -4, vx: 0, vy: 0, timer: 50, active: false, onGround: true });
      case 'bee': return Object.assign(base, { x: x + 2, y: y + 4, w: 12, h: 10, dx: -2, dy: -4, baseY: y + 4, active: false });
      case 'spring': return Object.assign(base, { x, y: y + 6, w: 16, h: 10, dx: 0, dy: -6, squash: 0 });
      case 'goal': return Object.assign(base, { x: x + 4, y: y - 16, w: 8, h: 32, dx: -4, dy: 0 });
      default: return null;
    }
  }
  spawnPlayer(cp, keepWeapon) {
    this.p = {
      x: cp.col * TILE + 3, y: cp.row * TILE + 2, w: 10, h: 14, vx: 0, vy: 0, px: 0, py: 0,
      facing: 1, onGround: false, coyote: 0, jumpBuf: 0, jumping: false, dropT: 0, dropThrough: false,
      state: 'idle', stateT: 0, animT: 0, throwT: 0, invuln: 0, stumbleT: 0,
      weapon: !!(this.o.startWeapon || keepWeapon),
      shield: 0, shoes: 0, poison: 0, vit: 100, sx: 1, sy: 1, dead: false,
    };
    this.p.px = this.p.x; this.p.py = this.p.y;
  }
  respawn() {
    this.spawnPlayer(this.checkpoint, this.p.weapon);   // 죽어도 도토리 주머니는 남는다
    this.cam.x = this.cam.px = clamp(this.p.x - this.o.camDead[0] + 5, 0, this.maxCamX());
    this.cam.minX = this.cam.x;
    this.acorns = [];
    this.emit('state', { from: 'dead', to: 'idle' });
  }

  // ── 장면 ─────────────────────────────────────────────────────
  newGame() {
    this.score = 0; this.lives = this.o.lives;
    this.reload();
    this.toReady();
  }
  toReady() {
    this.scene = 'ready'; this.sceneT = 0;
    this.p.vit = 100;
    if (this.o.music) AudioSys.playMusic(SONG, { owner: this });
  }
  toTitle() {
    this.saveBest();
    this.reload();
    this.scene = 'title'; this.sceneT = 0;
  }
  toClear() {
    this.scene = 'clear'; this.sceneT = 0; this.clearDoneT = 0;
    this.score += 1000;
    if (this.o.music) AudioSys.playMusic(JINGLE_CLEAR, { owner: this, loop: false });
    this.emit('clear');
  }
  toGameOver() {
    this.scene = 'gameover'; this.sceneT = 0;
    this.saveBest();
    if (this.o.music) AudioSys.playMusic(JINGLE_OVER, { owner: this, loop: false });
  }
  saveBest() {
    if (this.o.mode === 'game' && this.score > this.best) { this.best = this.score; Store.set('best', this.best); }
  }

  // ── 한 프레임 ────────────────────────────────────────────────
  update() {
    if (this.o.mode === 'attract') this.input.ai = this.aiThink();
    this.input.poll();
    this.frame++;
    if (this.o.mode === 'game' && this.scene === 'play' && this.input.pressed('pause')) this.paused = !this.paused;
    if (this.paused) return;
    this.cam.px = this.cam.x;
    const p = this.p;
    p.px = p.x; p.py = p.y;
    for (const e of this.ents) { e.px = e.x; e.py = e.y; }
    if (this.hitstop > 0) { this.hitstop--; return; }        // 히트스톱: 몇 프레임 세상을 멈춘다
    if (this.level !== this.levelSrc() || this.level.version !== this.levelVersion) { this.reload(); }
    this.sceneT++;
    switch (this.scene) {
      case 'title':
        p.animT++;
        if (this.input.pressed('start') || this.input.pressed('jump')) this.newGame();
        break;
      case 'ready':
        this.updatePlayer(true);
        this.updateCamera();
        if (this.sceneT >= 70) this.scene = 'play';
        break;
      case 'play':
        this.updatePlayer(false);
        this.updateEntities();
        this.updateAcorns();
        this.collide();
        this.updateVitality();
        this.updateCamera();
        this.updateCheckpoint();
        break;
      case 'dying': this.updateDying(); break;
      case 'clear': this.updateClear(); break;
      case 'gameover':
        if (this.sceneT > 260 || (this.sceneT > 60 && (this.input.pressed('start') || this.input.pressed('jump')))) this.toTitle();
        break;
    }
    this.updateParticles();
    if (this.flashT > 0) this.flashT--;
    if (this.cam.shake > 0.2) this.cam.shake *= 0.86; else this.cam.shake = 0;
  }

  setState(ns) {
    const p = this.p;
    if (p.state === ns) return;
    this.emit('state', { from: p.state, to: ns });
    if (ns === 'idle' || ns === 'run' && p.state !== 'run') p.animT = 0;
    p.state = ns; p.stateT = 0;
  }

  updatePlayer(noInput) {
    const p = this.p, P = this.phys, inp = this.input, L = this.level;
    const wasGround = p.onGround;
    p.stateT++;
    if (p.state === 'stumble') {
      p.stumbleT--;
      p.vx *= 0.92;
      if (p.stumbleT <= 0) this.setState('idle');
    } else {
      const dir = noInput ? 0 : (inp.held('right') ? 1 : 0) - (inp.held('left') ? 1 : 0);
      const max = P.maxSpeed * (p.shoes > 0 ? 1.35 : 1);
      if (dir !== 0) {
        if (p.vx * dir < 0) p.vx += dir * P.turn;                // 반대로 꺾으면 크게 감속 (미끄러짐)
        else p.vx += dir * (p.onGround ? P.accel : P.airAccel);
        if (Math.abs(p.vx) > max) p.vx = Math.sign(p.vx) * Math.max(max, Math.abs(p.vx) - P.decel);
        p.facing = dir;
      } else {
        const d = p.onGround ? P.decel : P.decel * 0.35;
        p.vx = Math.abs(p.vx) <= d ? 0 : p.vx - Math.sign(p.vx) * d;
      }
      if (!noInput && inp.pressed('jump')) p.jumpBuf = P.buffer + 1;   // 점프 버퍼
      if (p.jumpBuf > 0) p.jumpBuf--;
      if (p.onGround) p.coyote = P.coyote + 1; else if (p.coyote > 0) p.coyote--;  // 코요테 타임
      if (p.jumpBuf > 0 && p.onGround && p.groundOneWay && inp.held('down')) {
        p.dropT = 12; p.jumpBuf = 0; p.coyote = 0;                      // 아래+점프: 통나무 아래로 내려가기
      } else if (p.jumpBuf > 0 && p.coyote > 0) {
        const v = (P.jumpV + P.speedJump * Math.abs(p.vx) / P.maxSpeed) * (p.shoes > 0 ? 1.08 : 1);
        p.vy = -v;
        p.jumping = true; p.jumpBuf = 0; p.coyote = 0;
        this.sfx('jump');
        this.squash(0.75, 1.3);
        this.emit('jump', { coyote: !wasGround, buffered: !inp.pressed('jump') });
      }
      if (p.jumping && P.varJump && !inp.held('jump') && p.vy < -P.jumpCut) { p.vy = -P.jumpCut; p.jumping = false; }
      if (p.vy >= 0) p.jumping = false;
      if (!noInput && inp.pressed('throw') && p.weapon && this.acorns.length < 2) this.throwAcorn();
    }
    p.vy = Math.min(p.vy + P.gravity, P.maxFall);
    if (p.dropT > 0) p.dropT--;
    p.dropThrough = p.dropT > 0;
    this.probe.length = 0;
    moveX(p, p.vx, L, this.probe);
    if (this.o.camOneWay && p.x < this.cam.x) { p.x = this.cam.x; if (p.vx < 0) p.vx = 0; }
    moveY(p, p.vy, L, this.probe);
    if (p.onGround && !wasGround) {
      this.squash(1.3, 0.75);
      this.dust(p.x + 5, p.y + p.h, 3);
      this.emit('land');
    }
    p.sx += (1 - p.sx) * 0.25; p.sy += (1 - p.sy) * 0.25;
    if (p.state !== 'stumble') {
      this.setState(!p.onGround ? (p.vy < 0 ? 'jump' : 'fall') : Math.abs(p.vx) > 0.15 ? 'run' : 'idle');
    }
    p.animT += p.state === 'run' ? Math.max(0.5, Math.abs(p.vx) / P.maxSpeed) : 1;
    if (p.throwT > 0) p.throwT--;
    if (p.invuln > 0) p.invuln--;
    if (p.shield > 0) p.shield--;
    if (p.shoes > 0) { p.shoes--; if (this.j.particles && p.onGround && Math.abs(p.vx) > 2 && this.frame % 4 === 0) this.addParticle(p.x + 5 - p.facing * 6, p.y + 10, -p.facing * 0.5, 0, 0, 14, '#FFFFFF', 1); }
    if (p.poison > 0) { p.poison--; if (this.j.particles && this.frame % 14 === 0) this.addParticle(p.x + 5, p.y, (Math.random() - 0.5) * 0.4, -0.5, 0, 30, '#AA55FF', 2); }
    if (!noInput) this.checkHazards();
    if (p.y > L.h * TILE + 8 && !p.dead) this.killPlayer('pit');
  }

  squash(sx, sy) { if (this.j.squash) { this.p.sx = sx; this.p.sy = sy; } }

  checkHazards() {
    const p = this.p, L = this.level;
    const x0 = Math.floor((p.x + 2) / TILE), x1 = Math.floor((p.x + p.w - 3) / TILE);
    const y0 = Math.floor((p.y + 2) / TILE), y1 = Math.floor((p.y + p.h - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const t = L.tile(tx, ty);
      if (t === T.THORN && p.y + p.h > ty * TILE + 8) { this.killPlayer('thorn'); return; }
      if (t === T.WATER && p.y + p.h > ty * TILE + 6) { this.killPlayer('water'); return; }
    }
  }

  killPlayer(cause) {
    const p = this.p;
    if (p.dead || this.scene !== 'play') return;
    if (cause === 'enemy' && p.shield > 0) return;
    p.dead = true;
    this.emit('state', { from: p.state, to: 'dead' });
    p.state = 'dead';
    p.vy = cause === 'water' || cause === 'pit' ? -3.4 : -4.6;
    p.vx = 0;
    this.scene = 'dying'; this.sceneT = 0;
    if (this.o.music) AudioSys.stopMusic(this);
    this.sfx('die');
    if (this.j.shake) this.cam.shake = 5;
    if (this.j.flash) this.flashT = 6;
    if (cause === 'water' && this.j.particles) for (let i = 0; i < 14; i++) this.addParticle(p.x + 5, p.y + p.h, (Math.random() - 0.5) * 3, -Math.random() * 3.5, 0.2, 30, i & 1 ? '#FFFFFF' : '#AAFFFF', 2);
    this.emit('die', { cause });
  }
  updateDying() {
    const p = this.p;
    if (this.sceneT > 28) { p.vy = Math.min(p.vy + 0.22, 6); p.y += p.vy; }
    const wait = this.o.mode === 'game' ? 140 : 80;
    if (this.sceneT >= wait) {
      if (this.o.mode === 'game') {
        this.lives--;
        if (this.lives <= 0) { this.toGameOver(); return; }
        this.respawn();
        this.toReady();
      } else {
        this.respawn();
        this.scene = 'play'; this.sceneT = 0;
      }
    }
  }
  updateClear() {
    const p = this.p, P = this.phys;
    p.vx = 1.1; p.facing = 1;
    p.vy = Math.min(p.vy + P.gravity, P.maxFall);
    moveX(p, p.vx, this.level); moveY(p, p.vy, this.level);
    p.state = p.onGround ? 'run' : 'fall'; p.animT += 0.6;
    if (this.sceneT > 50 && p.vit > 0) {
      if (this.frame % 2 === 0) { p.vit = Math.max(0, p.vit - 1); this.score += 10; }
      if (this.frame % 8 === 0) this.sfx('warn');
    }
    if (this.sceneT > 50 && p.vit <= 0 && !this.clearDoneT) this.clearDoneT = this.sceneT;
    this.updateCamera();
    if (this.clearDoneT && this.sceneT > this.clearDoneT + 150) {
      if (this.o.mode === 'game') this.toTitle();
      else { this.reload(); this.scene = 'play'; this.sceneT = 0; }
    }
  }

  updateVitality() {
    const p = this.p;
    if (this.o.noDrain) return;
    this.vitT++;
    const rate = p.poison > 0 ? 7 : 24;                           // 독버섯이면 세 배 빠르게
    if (this.vitT >= rate) { this.vitT = 0; p.vit -= 1; }
    if (p.vit < 20 && this.frame % 45 === 0) this.sfx('warn');
    if (p.vit <= 0) { p.vit = 0; this.killPlayer('hunger'); }
  }

  updateCheckpoint() {
    const col = Math.floor(this.p.x / TILE);
    const cpCol = Math.floor(col / 32) * 32;
    if (cpCol > this.checkpoint.col) {
      const s = this.findSpot(cpCol, null);
      if (s && s.col <= col + 2) this.checkpoint = s;
    }
  }

  updateCamera() {
    const c = this.cam, p = this.p;
    const px = p.x + p.w / 2;
    const [dzL, dzR] = this.o.camDead;
    c.look += ((this.o.camLook * p.facing) - c.look) * 0.04;
    const sx = px - c.x - c.look;
    let target = c.x;
    if (sx > dzR) target = px - dzR - c.look;
    else if (sx < dzL) target = px - dzL - c.look;
    c.tx = target;
    c.x += (target - c.x) * this.o.camSmooth;
    if (this.o.camOneWay) c.x = Math.max(c.x, c.minX);
    c.x = clamp(c.x, 0, this.maxCamX());
    if (this.o.camOneWay) c.minX = Math.max(c.minX, c.x);
  }

  // ── 엔티티 ───────────────────────────────────────────────────
  updateEntities() {
    const L = this.level, P = this.phys, p = this.p;
    const left = this.cam.x - 40, right = this.cam.x + SCREEN_W + 24;
    for (const e of this.ents) {
      if (e.dead) {
        if (this.o.respawnEnemies && e.respawnT > 0 && --e.respawnT === 0) Object.assign(e, this.mkEnt({ c: e.c, x: e.ox, y: e.oy }), { px: e.ox * TILE, py: e.oy * TILE });
        continue;
      }
      e.t++;
      const onScreen = e.x + e.w > left && e.x < right;
      if (e.kind === 'corpse') {
        e.vy += 0.25; e.x += e.vx; e.y += e.vy;
        if (e.y > SCREEN_H + 40) e.dead = true;
        continue;
      }
      if (ENEMY_KINDS.has(e.kind)) {
        if (!e.active && onScreen && e.x < this.cam.x + SCREEN_W + 8) e.active = true;
        if (!e.active) continue;
        if (this.o.camOneWay && e.x + e.w < this.cam.x - 32) { e.dead = true; continue; }
      }
      switch (e.kind) {
        case 'snail': {
          e.vx = e.dir * 0.3;
          e.vy = Math.min(e.vy + P.gravity, P.maxFall);
          moveX(e, e.vx, L);
          if (e.hitWall) e.dir = -e.dir;
          moveY(e, e.vy, L);
          if (e.onGround) {
            const fx = e.dir < 0 ? e.x - 1 : e.x + e.w + 1;
            const below = L.tile(Math.floor(fx / TILE), Math.floor((e.y + e.h + 2) / TILE));
            if (!TILE_INFO[below].solid && !TILE_INFO[below].oneWay) e.dir = -e.dir;
          }
          break;
        }
        case 'frog': {
          e.vy = Math.min(e.vy + P.gravity, P.maxFall);
          if (e.onGround) {
            e.vx = 0;
            if (--e.timer <= 0) {
              e.vx = (p.x < e.x ? -1 : 1) * 1.1;
              e.vy = -3.8; e.timer = 80 + ((e.t * 37) % 40);
            }
          }
          moveX(e, e.vx, L);
          moveY(e, e.vy, L);
          break;
        }
        case 'bee':
          e.x -= 0.75;
          e.y = e.baseY + Math.sin((e.t / 90) * TAU) * 14;
          if (e.x < this.cam.x - 40) { e.dead = true; if (this.o.respawnEnemies) e.respawnT = this.o.respawnEnemies; }
          break;
        case 'bud':
          if (e.open && e.openT < 30) { e.openT++; if (e.openT === 6) this.spawnItem(e); }
          break;
        case 'item':
          e.vy = Math.min(e.vy + 0.2, 4);
          moveX(e, e.vx, L);
          moveY(e, e.vy, L);
          if (e.onGround) e.vx *= 0.8;
          if (e.t > 900) e.dead = true;
          break;
        case 'spring':
          if (e.squash > 0) e.squash--;
          break;
      }
    }
  }
  spawnItem(bud) {
    const dir = this.p.x + 5 < bud.x + 7 ? 1 : -1;
    this.ents.push({ kind: 'item', item: bud.item, sheet: 'item', key: bud.item, x: bud.x + 1, y: bud.y - 6, w: 12, h: 12, dx: -2, dy: -3, vy: -3.4, vx: dir * Math.min(1.6, 0.6 + Math.abs(this.p.vx) * 0.5), t: 0, dead: false, px: bud.x, py: bud.y });
  }
  openBud(e) {
    if (e.open) return;
    e.open = true; e.openT = 0;
    this.sfx('bud');
    this.sparkle(e.x + 7, e.y + 4, 8, '#FF55AA');
    this.emit('bud', { item: e.item });
  }
  applyItem(it) {
    const p = this.p;
    it.dead = true;
    if (it.item === 'pouch') { p.weapon = true; this.sfx('power'); this.score += 100; }
    if (it.item === 'firefly') { p.shield = 600; this.sfx('power'); this.score += 100; }
    if (it.item === 'shoes') { p.shoes = 900; this.sfx('power'); this.score += 100; }
    if (it.item === 'mushroom') { p.poison = 480; this.sfx('bad'); }
    this.popup(it.x + 6, it.y - 4, ITEM_TEXT[it.item], it.item === 'mushroom' ? '#AA55FF' : '#FFFF55');
    this.emit('item', { item: it.item });
  }
  killEnemy(e, byX) {
    e.dead = true;
    const pts = ENEMY_PTS[e.kind] || 100;
    this.score += pts;
    this.popup(e.x + e.w / 2, e.y - 4, String(pts));
    const key = e.kind === 'snail' ? 'snail1' : e.kind === 'frog' ? 'frog1' : 'bee1';
    this.ents.push({ kind: 'corpse', sheet: 'enemy', key, x: e.x, y: e.y, dx: e.dx, dy: e.dy, w: e.w, h: e.h, vx: (e.x > byX ? 1 : -1) * 1.2, vy: -3.2, t: 0, dead: false, px: e.x, py: e.y });
    if (this.o.respawnEnemies) e.respawnT = this.o.respawnEnemies;
    if (this.j.hitstop) this.hitstop = 4;
    if (this.j.shake) this.cam.shake = Math.max(this.cam.shake, 2.5);
    this.sparkle(e.x + e.w / 2, e.y + e.h / 2, 10, '#FFFFFF');
    this.sfx('hit');
    this.emit('kill', { kind: e.kind });
  }

  collide() {
    const p = this.p, P = this.phys;
    if (p.dead) return;
    for (const e of this.ents) {
      if (e.dead || e.kind === 'corpse' || !overlap(p, e)) continue;
      switch (e.kind) {
        case 'fruit': {
          const d = ENT_DEFS[e.c];
          e.dead = true;
          p.vit = Math.min(100, p.vit + d.vit);
          this.score += d.pts;
          this.popup(e.x + 6, e.y - 2, String(d.pts));
          this.sparkle(e.x + 6, e.y + 6, 6, '#FFFF55');
          this.sfx('fruit');
          this.emit('fruit', { name: d.name });
          break;
        }
        case 'bud': this.openBud(e); break;
        case 'item': if (e.t > 6) this.applyItem(e); break;
        case 'rock':
          if (p.invuln <= 0 && p.state !== 'stumble') {
            this.emit('state', { from: p.state, to: 'stumble' });
            p.state = 'stumble'; p.stumbleT = 24; p.invuln = 60;
            p.vx = p.facing * 0.6; p.vy = Math.min(p.vy, -1.6); p.jumping = false;
            p.vit = Math.max(0, p.vit - 8);
            this.sfx('stumble');
            if (this.j.shake) this.cam.shake = 3;
            this.dust(e.x + 7, e.y + 6, 5);
          }
          break;
        case 'snail': case 'frog': case 'bee':
          if (p.shield > 0) this.killEnemy(e, p.x);
          else this.killPlayer('enemy');
          break;
        case 'spring':
          if (p.vy > 0 && p.py + p.h <= e.y + 4) {
            p.y = e.y - p.h;
            p.vy = -P.springV * (this.input.held('jump') ? 1.1 : 1);
            p.jumping = false;
            e.squash = 10;
            this.squash(0.7, 1.35);
            this.sfx('spring');
            this.emit('spring');
          }
          break;
        case 'goal':
          if (this.scene === 'play') this.toClear();
          break;
      }
    }
  }

  throwAcorn() {
    const p = this.p;
    this.acorns.push({ x: p.x + (p.facing > 0 ? p.w - 2 : -4), y: p.y + 2, w: 6, h: 6, vx: p.facing * 3.4 + p.vx * 0.5, vy: -2.2, bounces: 0, life: 75, rot: 0 });
    p.throwT = 12;
    this.sfx('throw');
    this.emit('throw');
  }
  updateAcorns() {
    const L = this.level;
    for (const a of this.acorns) {
      a.vy = Math.min(a.vy + 0.16, 5);
      a.rot += a.vx > 0 ? 1 : -1;
      moveX(a, a.vx, L);
      if (a.hitWall) { a.life = 0; this.sfx('clink'); this.sparkle(a.x + 3, a.y + 3, 3, '#FFFFFF'); continue; }
      moveY(a, a.vy, L);
      if (a.onGround) {
        a.bounces++;
        if (a.bounces > 1) a.life = 0; else a.vy = -2.0;
      }
      if (--a.life <= 0) continue;
      for (const e of this.ents) {
        if (e.dead || !overlap(a, e)) continue;
        if (ENEMY_KINDS.has(e.kind)) { this.killEnemy(e, a.x); a.life = 0; break; }
        if (e.kind === 'bud' && !e.open) { this.openBud(e); a.life = 0; break; }
        if (e.kind === 'rock') { a.life = 0; this.sfx('clink'); this.sparkle(a.x + 3, a.y + 3, 3, '#FFFFFF'); break; }
      }
      if (a.x < this.cam.x - 16 || a.x > this.cam.x + SCREEN_W + 16) a.life = 0;
    }
    this.acorns = this.acorns.filter((a) => a.life > 0);
  }

  // ── 파티클과 점수 팝업 ─────────────────────────────────────────
  addParticle(x, y, vx, vy, g, life, color, size) {
    if (!this.j.particles) return;
    if (this.particles.length > 160) this.particles.shift();
    this.particles.push({ x, y, vx, vy, g, life, max: life, color, size: size || 1 });
  }
  dust(x, y, n) { for (let i = 0; i < n; i++) this.addParticle(x + (Math.random() - 0.5) * 8, y - 1, (Math.random() - 0.5) * 1.2, -Math.random() * 0.8, 0.03, 16 + Math.random() * 8, i & 1 ? '#FFAA55' : '#FFFFFF', 1); }
  sparkle(x, y, n, color) { for (let i = 0; i < n; i++) { const a = (i / n) * TAU; this.addParticle(x, y, Math.cos(a) * 1.6, Math.sin(a) * 1.6, 0.05, 18, i & 1 ? color : '#FFFFFF', 1); } }
  popup(x, y, text, color) { if (this.j.popups) this.popups.push({ x, y, text, t: 0, color: color || '#FFFFFF' }); }
  updateParticles() {
    for (const q of this.particles) { q.vy += q.g; q.x += q.vx; q.y += q.vy; q.life--; }
    this.particles = this.particles.filter((q) => q.life > 0);
    for (const q of this.popups) { q.t++; q.y -= q.t < 20 ? 0.6 : 0.15; }
    this.popups = this.popups.filter((q) => q.t < 50);
  }

  // ── 데모 화면용 자동 플레이 (아주 단순한 규칙 몇 개) ───────────────
  aiThink() {
    const p = this.p, L = this.level;
    const ai = { right: true, jump: false, throw: false, left: false, down: false, start: this.scene === 'title' };
    if (p.dead || this.scene !== 'play') return ai;
    if (this.aiHold > 0) { this.aiHold--; ai.jump = true; return ai; }
    if (!p.onGround) return ai;
    for (const e of this.ents) {
      if (e.dead || e.kind !== 'item' || e.item === 'mushroom') continue;
      const dx = e.x + 6 - (p.x + 5);
      if (Math.abs(dx) < 70 && Math.abs(e.y - p.y) < 30) { ai.right = dx > 2; ai.left = dx < -2; return ai; }
    }
    const fx = p.x + p.w, foot = Math.floor((p.y + p.h + 1) / TILE);
    let jump = false;
    for (let d = 2; d <= 26; d += 4) {
      const tx = Math.floor((fx + d) / TILE);
      const below = TILE_INFO[L.tile(tx, foot)], at = TILE_INFO[L.tile(tx, foot - 1)];
      if (!(below.solid || below.oneWay) || below.hazard || at.hazard) { jump = d <= 14; break; }
      if (at.solid) { jump = d <= 6; break; }
    }
    for (const e of this.ents) {
      if (e.dead || e.kind === 'corpse') continue;
      const dx = e.x - fx;
      if (dx < -6 || dx > 70) continue;
      if (Math.abs(e.y + e.h - (p.y + p.h)) > 30) continue;
      if (ENEMY_KINDS.has(e.kind)) {
        if (p.weapon && dx > 6) ai.throw = this.frame % 10 === 0 && this.acorns.length === 0;
        else if (dx < 24) jump = true;
      }
      if ((e.kind === 'rock') && dx < 12 && dx > -4) jump = true;
    }
    if (jump) { ai.jump = true; this.aiHold = 22; }
    return ai;
  }

  // ── 그리기 ───────────────────────────────────────────────────
  render(ctx, alpha = 1) {
    const L = this.level;
    let shx = 0, shy = 0;
    if (this.cam.shake > 0.2) { shx = Math.round((Math.random() - 0.5) * 2 * this.cam.shake); shy = Math.round((Math.random() - 0.5) * 2 * this.cam.shake); }
    const camX = Math.round(lerp(this.cam.px, this.cam.x, alpha)) + shx, camY = shy;
    this.lastCamX = camX;
    Parallax.draw(ctx, camX - shx, { time: this.frame, show: this.o.layers || undefined, factors: this.o.factors || undefined });
    const c0 = Math.max(0, Math.floor(camX / TILE)), c1 = Math.min(L.w - 1, Math.floor((camX + SCREEN_W) / TILE));
    for (let ty = 0; ty < L.h; ty++) for (let tx = c0; tx <= c1; tx++) {
      const cv = TileGfx.forCell(L, tx, ty, this.frame);
      if (cv) ctx.drawImage(cv, tx * TILE - camX, ty * TILE + camY);
    }
    for (const e of this.ents) if (!e.dead) this.drawEnt(ctx, e, camX, camY, alpha);
    if (this.scene !== 'title') this.drawPlayer(ctx, camX, camY, alpha);
    for (const a of this.acorns) drawSprite(ctx, SHEETS.item, 'acorn', a.x - 5 - camX, a.y - 6 + camY, { flipX: (a.rot >> 3) & 1 });
    for (const q of this.particles) {
      ctx.globalAlpha = q.life < 6 ? q.life / 6 : 1;
      ctx.fillStyle = q.color;
      ctx.fillRect(Math.round(q.x - camX), Math.round(q.y + camY), q.size, q.size);
    }
    ctx.globalAlpha = 1;
    for (const q of this.popups) if (q.t < 46 || (q.t & 2)) drawText(ctx, q.text, q.x - camX, q.y + camY, { align: 'center', color: q.color });
    if (this.o.debug && Object.keys(this.o.debug).some((k) => this.o.debug[k])) this.drawDebug(ctx, camX, camY, alpha);
    if (this.o.hud) this.drawHUD(ctx);
    this.drawOverlay(ctx);
    if (this.flashT > 0 && this.j.flash) { ctx.fillStyle = 'rgba(255,255,255,' + (this.flashT / 10) + ')'; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H); }
  }

  drawEnt(ctx, e, camX, camY, alpha) {
    const ex = lerp(e.px == null ? e.x : e.px, e.x, alpha), ey = lerp(e.py == null ? e.y : e.py, e.y, alpha);
    const x = ex + e.dx - camX, y = ey + e.dy + camY;
    if (x < -20 || x > SCREEN_W + 4) return;
    const S = SHEETS[e.sheet];
    switch (e.kind) {
      case 'fruit': drawSprite(ctx, S, e.key, x, y + Math.round(Math.sin(e.t / 12) * 1.5)); break;
      case 'bud': drawSprite(ctx, S, e.open ? 'budOpen' : 'budClosed', x, y); break;
      case 'item': if (e.t < 780 || (e.t & 4)) drawSprite(ctx, S, e.key, x, y, { variant: e.item === 'firefly' && (e.t & 4) ? 'white' : 'base' }); break;
      case 'snail': drawSprite(ctx, S, animFrame('snail', e.t), x, y, { flipX: e.dir > 0 }); break;
      case 'frog': drawSprite(ctx, S, e.onGround ? 'frog1' : 'frog2', x, y); break;
      case 'bee': drawSprite(ctx, S, animFrame('bee', e.t), x, y); break;
      case 'spring': drawSprite(ctx, S, e.squash > 0 ? 'springDown' : 'spring', x, y); break;
      case 'goal':
        drawSprite(ctx, S, 'goalTop', x, y);
        drawSprite(ctx, S, 'goalBottom', x, y + 16);
        break;
      case 'corpse': drawSprite(ctx, S, e.key, x, y, { flipY: true, variant: e.t < 6 && this.j.flash ? 'white' : 'base' }); break;
      default: drawSprite(ctx, S, e.key, x, y);
    }
  }

  playerFrame() {
    const p = this.p;
    if (p.state === 'dead' || p.state === 'stumble') return 'hurt';
    if (p.throwT > 0) return 'throw';
    return animFrame(p.state === 'run' ? 'run' : p.state === 'jump' ? 'jump' : p.state === 'fall' ? 'fall' : 'idle', Math.floor(p.animT));
  }

  drawPlayer(ctx, camX, camY, alpha) {
    const p = this.p;
    const x = lerp(p.px, p.x, alpha) - 3 - camX, y = lerp(p.py, p.y, alpha) - 2 + camY;
    if (p.invuln > 0 && p.state !== 'stumble' && !p.dead && (this.frame & 2)) return;
    let variant = this.o.heroVariant;
    if (p.shield > 0) variant = (this.frame >> 2) & 1 ? 'glow' : variant;
    else if (p.poison > 0) variant = 'poison';
    drawSprite(ctx, SHEETS.hero, this.playerFrame(), x, y, {
      flipX: p.facing < 0, flipY: p.state === 'dead' && p.vy > 0 && this.sceneT > 28,
      sx: this.j.squash ? p.sx : 1, sy: this.j.squash ? p.sy : 1, variant,
    });
    if (p.shield > 0 && (p.shield > 120 || (this.frame & 4))) {
      const a = this.frame / 8;
      drawSprite(ctx, SHEETS.item, 'firefly', x + Math.cos(a) * 13, y + Math.sin(a) * 9 - 2);
    }
  }

  drawHUD(ctx) {
    const p = this.p;
    if (this.scene === 'title') return;
    drawText(ctx, 'SCORE', 8, 6, { color: '#FFFF55' });
    drawText(ctx, String(this.score).padStart(6, '0'), 42, 6);
    drawText(ctx, '♥', 8, 17, { color: '#FF55AA' });
    const low = p.vit < 20, blink = (this.frame >> 3) & 1;
    for (let i = 0; i < 20; i++) {
      const filled = p.vit > i * 5;
      ctx.fillStyle = '#000000';
      ctx.fillRect(18 + i * 5, 17, 5, 8);
      ctx.fillStyle = !filled ? '#555555' : low ? (blink ? '#FF5500' : '#AA0000') : p.vit < 40 ? '#FFFF55' : '#55FF55';
      ctx.fillRect(19 + i * 5, 18, 3, 6);
    }
    if (this.o.mode === 'game') {
      drawSprite(ctx, SHEETS.hero, 'idle', SCREEN_W - 46, 1, {});
      drawText(ctx, '×' + Math.max(0, this.lives), SCREEN_W - 28, 8);
    }
    let ix = SCREEN_W - 22;
    if (p.weapon) drawSprite(ctx, SHEETS.item, 'acorn', ix, 12);
    if (p.shield > 0) { ix -= 14; drawSprite(ctx, SHEETS.item, 'firefly', ix, 12); }
    if (p.shoes > 0) { ix -= 14; drawSprite(ctx, SHEETS.item, 'shoes', ix, 10); }
  }

  drawOverlay(ctx) {
    const W = SCREEN_W;
    if (this.scene === 'title') {
      ctx.fillStyle = 'rgba(0,0,85,0.45)';
      ctx.fillRect(0, 32, W, 74);
      drawText(ctx, 'BORI ISLAND', W / 2, 44, { scale: 3, align: 'center', color: '#FFFF55', shadowColor: '#AA0000' });
      drawText(ctx, 'A TINY 8-BIT ADVENTURE', W / 2, 76, { align: 'center', color: '#AAFFFF' });
      drawText(ctx, 'BEST ' + String(this.best).padStart(6, '0'), W / 2, 90, { align: 'center' });
      const gy = this.p ? Math.round(this.p.y - 2) : 144;
      drawSprite(ctx, SHEETS.hero, animFrame('idle', this.frame), Math.round(this.p.x - 3 - this.cam.x), gy);
      if ((this.frame >> 5) & 1) drawText(ctx, 'PRESS START', W / 2, 116, { align: 'center' });
    } else if (this.scene === 'ready') {
      if ((this.sceneT >> 3) & 1 || this.sceneT > 50) drawText(ctx, 'READY!', W / 2, 80, { scale: 2, align: 'center', color: '#FFFF55' });
    } else if (this.scene === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 70, W, 40);
      drawText(ctx, 'GAME OVER', W / 2, 82, { scale: 2, align: 'center', color: '#FF5555' });
    } else if (this.scene === 'clear') {
      drawText(ctx, 'STAGE CLEAR!', W / 2, 64, { scale: 2, align: 'center', color: '#FFFF55' });
      if (this.sceneT > 50) drawText(ctx, 'VITALITY BONUS', W / 2, 92, { align: 'center' });
    }
    if (this.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, SCREEN_H);
      drawText(ctx, 'PAUSE', W / 2, 88, { scale: 2, align: 'center' });
    }
  }

  drawDebug(ctx, camX, camY, alpha) {
    const D = this.o.debug, p = this.p, L = this.level;
    ctx.save();
    ctx.lineWidth = 1;
    if (D.grid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      for (let x = -((camX % TILE) + TILE) % TILE; x <= SCREEN_W; x += TILE) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, SCREEN_H); }
      for (let y = 0; y <= SCREEN_H; y += TILE) { ctx.moveTo(0, y + 0.5); ctx.lineTo(SCREEN_W, y + 0.5); }
      ctx.stroke();
    }
    if (D.probes) {
      for (const q of this.probe) {
        ctx.fillStyle = q.hit ? 'rgba(255,60,40,0.45)' : 'rgba(255,255,85,0.22)';
        ctx.fillRect(q.tx * TILE - camX, q.ty * TILE + camY, TILE, TILE);
      }
    }
    if (D.hitbox) {
      const box = (b, color, ix, iy) => { ctx.strokeStyle = color; ctx.strokeRect(Math.round(ix - camX) + 0.5, Math.round(iy + camY) + 0.5, b.w - 1, b.h - 1); };
      for (const e of this.ents) {
        if (e.dead || e.kind === 'corpse') continue;
        const col = ENEMY_KINDS.has(e.kind) ? '#FF5555' : e.kind === 'rock' ? '#FFAA00' : e.kind === 'spring' || e.kind === 'goal' ? '#55FFFF' : '#55FF55';
        box(e, col, lerp(e.px == null ? e.x : e.px, e.x, alpha), lerp(e.py == null ? e.y : e.py, e.y, alpha));
      }
      for (const a of this.acorns) box(a, '#FFFFFF', a.x, a.y);
      box(p, '#FFFF55', lerp(p.px, p.x, alpha), lerp(p.py, p.y, alpha));
    }
    if (D.vel) {
      const cx = p.x + p.w / 2 - camX, cy = p.y + p.h / 2 + camY;
      ctx.strokeStyle = '#FF55FF';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + p.vx * 8, cy + p.vy * 8); ctx.stroke();
    }
    if (D.cam) {
      const [l, r] = this.o.camDead;
      ctx.fillStyle = 'rgba(85,255,255,0.10)';
      ctx.fillRect(l - this.cam.look, 0, r - l, SCREEN_H);
      ctx.strokeStyle = '#55FFFF';
      ctx.beginPath();
      ctx.moveTo(l - this.cam.look + 0.5, 0); ctx.lineTo(l - this.cam.look + 0.5, SCREEN_H);
      ctx.moveTo(r - this.cam.look + 0.5, 0); ctx.lineTo(r - this.cam.look + 0.5, SCREEN_H);
      ctx.stroke();
      drawText(ctx, 'DEAD ZONE', (l + r) / 2 - this.cam.look, SCREEN_H - 12, { align: 'center', color: '#55FFFF' });
      if (this.o.camOneWay) drawText(ctx, 'NO BACK', 4, SCREEN_H - 12, { color: '#FF5555' });
    }
    if (D.info) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, SCREEN_H - 40, 116, 40);
      drawText(ctx, 'X ' + p.x.toFixed(1) + ' Y ' + p.y.toFixed(1), 3, SCREEN_H - 37, { shadow: false });
      drawText(ctx, 'VX ' + p.vx.toFixed(2) + ' VY ' + p.vy.toFixed(2), 3, SCREEN_H - 27, { shadow: false });
      drawText(ctx, (p.onGround ? 'GROUND ' : 'AIR ') + p.state.toUpperCase(), 3, SCREEN_H - 17, { shadow: false, color: '#FFFF55' });
      drawText(ctx, 'ENT ' + this.ents.filter((e) => !e.dead).length + ' FX ' + this.particles.length, 3, SCREEN_H - 8, { shadow: false, color: '#AAFFFF' });
    }
    ctx.restore();
  }
}

// ── 게임 화면 부품: 캔버스 + 베젤 + 포커스 + 터치 버튼 + 루프 ─────────
class GameView {
  constructor(host, o = {}) {
    this.o = o;
    this.input = new Input();
    if (o.historyMax) this.input.historyMax = o.historyMax;
    this.canvas = el('canvas', { width: SCREEN_W, height: SCREEN_H, class: 'pix' });
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.screen = el('div', { class: 'screen', tabindex: '0', role: 'application', 'aria-label': o.label || tr('게임 화면', 'Game screen') }, this.canvas);
    this.hint = el('div', { class: 'screen-hint' }, el('span', { text: o.hint || tr('클릭하면 키보드로 조작합니다', 'Click to control with the keyboard') }));
    this.screen.append(this.hint);
    this.root = el('div', { class: 'bench' + (o.cls ? ' ' + o.cls : '') }, this.screen);
    this.world = new World(Object.assign({ input: this.input }, o.world || {}));
    this.loop = new FixedLoop({
      update: () => { this.world.update(); if (o.onUpdate) o.onUpdate(this.world); },
      render: (a, dt) => { this.world.render(this.ctx, a); if (o.onRender) o.onRender(this.ctx, this.world, a, dt); },
    });
    bindKeys(this.screen, this.input, {
      onFocus: () => this.root.classList.add('focused'),
      onBlur: () => this.root.classList.remove('focused'),
    });
    this.screen.addEventListener('pointerdown', () => { if (document.activeElement !== this.screen) this.screen.focus({ preventScroll: true }); });
    if (o.touch !== false) this.root.append(touchPad(this.input, {}));
    if (o.below) this.root.append(o.below);
    host.append(this.root);
    this.world.render(this.ctx, 1);
    // 디버깅과 테스트용: 개발자 도구에서 BoriDebug.views로 이 페이지의 게임 화면들을 볼 수 있다
    if (!window.BoriDebug) window.BoriDebug = { views: [] };
    window.BoriDebug.views.push(this);
    this.unwatch = whenVisible(this.root, () => this.loop.start(), () => { this.loop.stop(); AudioSys.stopMusic(this.world); this.input.releaseAll(); });
  }
  rebuild(worldOpts) {
    AudioSys.stopMusic(this.world);
    this.world = new World(Object.assign({ input: this.input }, this.o.world || {}, worldOpts || {}));
    this.world.render(this.ctx, 1);
  }
}
