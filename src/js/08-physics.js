// ───────────────────────────────────────────────────────────────
// 08 · 물리 — 프레임 단위 값(px/프레임), 축을 나눠 움직이는 AABB 타일 충돌
// ───────────────────────────────────────────────────────────────
const PHYS_DEFAULT = {
  gravity: 0.25,     // 매 프레임 vy에 더한다 (px/f²)
  jumpV: 5.0,        // 점프 순간 위쪽 속도 (px/f)
  speedJump: 0.4,    // 달리는 속도에 비례해 더해지는 점프력
  jumpCut: 1.6,      // 버튼을 떼면 상승 속도를 이 값으로 자른다 (가변 점프)
  varJump: true,
  maxFall: 5.0,      // 종단 속도
  accel: 0.09,       // 땅 위 가속
  airAccel: 0.07,    // 공중 가속
  decel: 0.12,       // 손을 떼면 감속
  turn: 0.25,        // 반대 방향으로 꺾을 때 감속
  maxSpeed: 2.0,     // 최고 달리기 속도
  coyote: 6,         // 발판을 벗어난 뒤에도 점프를 받아주는 프레임
  buffer: 6,         // 착지 전에 미리 누른 점프를 기억하는 프레임
  springV: 7.6,
};
const PHYS = Object.assign({}, PHYS_DEFAULT, Store.get('phys', {}));
const savePhys = debounce(() => {
  const diff = {};
  for (const k of Object.keys(PHYS_DEFAULT)) if (PHYS[k] !== PHYS_DEFAULT[k]) diff[k] = PHYS[k];
  if (Object.keys(diff).length) Store.set('phys', diff); else Store.del('phys');
  Bus.emit('phys', PHYS);
}, 200);
function physModified() { return Object.keys(PHYS_DEFAULT).some((k) => PHYS[k] !== PHYS_DEFAULT[k]); }

function solidAt(level, tx, ty) {
  if (tx < 0 || tx >= level.w) return true;      // 맵 양 끝은 보이지 않는 벽
  if (ty < 0 || ty >= level.h) return false;
  return !!TILE_INFO[level.tiles[ty * level.w + tx]].solid;
}
function oneWayAt(level, tx, ty) {
  if (tx < 0 || tx >= level.w || ty < 0 || ty >= level.h) return false;
  return !!TILE_INFO[level.tiles[ty * level.w + tx]].oneWay;
}

// x축 이동 → 겹친 벽 타일을 찾아 밀어낸다. probe 배열을 주면 시험한 칸을 기록한다.
function moveX(b, dx, level, probe) {
  b.x += dx;
  b.hitWall = 0;
  if (dx === 0) return;
  const y0 = Math.floor(b.y / TILE), y1 = Math.floor((b.y + b.h - 0.01) / TILE);
  const tx = dx > 0 ? Math.floor((b.x + b.w - 0.01) / TILE) : Math.floor(b.x / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    const hit = solidAt(level, tx, ty);
    if (probe) probe.push({ tx, ty, hit, axis: 'x' });
    if (hit) {
      if (dx > 0) { b.x = tx * TILE - b.w; b.hitWall = 1; }
      else { b.x = (tx + 1) * TILE; b.hitWall = -1; }
      b.vx = 0;
      return;
    }
  }
}

// y축 이동 → 바닥·천장 처리. 통나무(원웨이)는 '위에서 내려올 때만' 밟힌다.
function moveY(b, dy, level, probe) {
  const prevBottom = b.y + b.h;
  b.y += dy;
  b.onGround = false;
  b.hitCeil = false;
  if (dy === 0) return;
  const x0 = Math.floor(b.x / TILE), x1 = Math.floor((b.x + b.w - 0.01) / TILE);
  if (dy > 0) {
    const ty = Math.floor((b.y + b.h - 0.01) / TILE);
    const top = ty * TILE;
    for (let tx = x0; tx <= x1; tx++) {
      const solid = solidAt(level, tx, ty);
      const ow = !solid && oneWayAt(level, tx, ty);
      const land = solid || (ow && !b.dropThrough && prevBottom <= top + 0.01);
      if (probe) probe.push({ tx, ty, hit: land, oneWay: ow, axis: 'y' });
      if (land) { b.y = top - b.h; b.vy = 0; b.onGround = true; b.groundOneWay = ow; return; }
    }
  } else {
    const ty = Math.floor(b.y / TILE);
    for (let tx = x0; tx <= x1; tx++) {
      const hit = solidAt(level, tx, ty);
      if (probe) probe.push({ tx, ty, hit, axis: 'y' });
      if (hit) { b.y = (ty + 1) * TILE; b.vy = 0; b.hitCeil = true; return; }
    }
  }
}

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// 점프 궤적을 미리 계산 (실험실 그래프와 레벨 설계용)
function simulateJump(P, { holdFrames = 999, speed = P.maxSpeed, frames = 120 } = {}) {
  const pts = [];
  let x = 0, y = 0, vy = -(P.jumpV + P.speedJump * Math.abs(speed) / P.maxSpeed), jumping = true;
  pts.push({ x, y });
  for (let f = 1; f <= frames; f++) {
    const held = f <= holdFrames;
    if (jumping && P.varJump && !held && vy < -P.jumpCut) { vy = -P.jumpCut; jumping = false; }
    if (vy >= 0) jumping = false;
    vy = Math.min(vy + P.gravity, P.maxFall);
    x += speed; y += vy;
    if (y >= 0) { pts.push({ x: x - speed * (y / Math.max(vy, 0.0001)), y: 0, land: true }); break; }
    pts.push({ x, y });
  }
  let apex = 0, apexI = 0;
  pts.forEach((p, i) => { if (p.y < apex) { apex = p.y; apexI = i; } });
  return { pts, apex: -apex, apexFrame: apexI, air: pts.length - 1, dist: pts[pts.length - 1].x };
}
