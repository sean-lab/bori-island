// ── 시작 ─────────────────────────────────────────────────────────
function boot() {
  try { App.init(); } catch (e) { console.error(e); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
