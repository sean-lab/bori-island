// ───────────────────────────────────────────────────────────────
// 07 · 게임 루프 — 고정 타임스텝 + 누산기 + 보간
// ───────────────────────────────────────────────────────────────
const LOOPS = new Set();

class FixedLoop {
  constructor({ update, render, hz = 60 }) {
    this.update = update;
    this.render = render;
    this.step = 1 / hz;
    this.acc = 0;
    this.running = false;
    this.timeScale = 1;
    this.paused = false;
    this.stepReq = 0;
    this.frameMs = [];
    this.updatesThisFrame = 0;
    this.tick = this.tick.bind(this);
  }
  setHz(hz) { this.step = 1 / hz; }
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.tick);
    LOOPS.add(this);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    LOOPS.delete(this);
  }
  stepOnce() { this.paused = true; this.stepReq++; }
  tick(now) {
    if (!this.running) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
    this.frameMs.push(dt * 1000);
    if (this.frameMs.length > 120) this.frameMs.shift();
    if (dt > 0.25) dt = 0.25;                 // 탭이 숨었다 돌아오면 dt가 거대해진다: 상한을 둔다
    if (!this.paused) this.acc += dt * this.timeScale;
    else if (this.stepReq > 0) { this.acc += this.step; this.stepReq--; }
    let n = 0;
    while (this.acc >= this.step) {
      if (n >= 6) { this.acc = 0; break; }     // '죽음의 나선' 방지: 한 번에 너무 많이 따라잡지 않는다
      this.update();
      this.acc -= this.step;
      n++;
    }
    this.updatesThisFrame = n;
    this.render(this.paused ? 1 : this.acc / this.step, dt);
    this.raf = requestAnimationFrame(this.tick);
  }
}

// 데모를 '화면에 보이는 동안만' 돌린다
function autoRun(loop, elem) {
  return whenVisible(elem, () => loop.start(), () => loop.stop());
}
