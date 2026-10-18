// ───────────────────────────────────────────────────────────────
// 01 · 팔레트 — 세가 마스터 시스템(SMS) 기준 64색
// 채널당 2비트(0x00, 0x55, 0xAA, 0xFF) × R·G·B = 4³ = 64색
// ───────────────────────────────────────────────────────────────
const SMS_LEVELS = [0x00, 0x55, 0xAA, 0xFF];
const hex2 = (v) => v.toString(16).padStart(2, '0').toUpperCase();
const SMS64 = [];
for (let b = 0; b < 4; b++) for (let g = 0; g < 4; g++) for (let r = 0; r < 4; r++) {
  SMS64.push({ r, g, b, hex: '#' + hex2(SMS_LEVELS[r]) + hex2(SMS_LEVELS[g]) + hex2(SMS_LEVELS[b]) });
}

// 스프라이트 팔레트 16색 (0번은 투명)
const SPR_PAL = [
  null,      // 0 투명
  '#000000', // 1 외곽선
  '#FFFFFF', // 2 흰색
  '#FFAA55', // 3 피부
  '#AA5500', // 4 갈색
  '#550000', // 5 짙은 갈색
  '#FF5500', // 6 주황
  '#AA0000', // 7 진홍
  '#55AA00', // 8 초록
  '#005500', // 9 짙은 초록
  '#AAFF55', // a 연두
  '#FFFF00', // b 노랑
  '#FF55AA', // c 분홍
  '#AA55FF', // d 보라
  '#AAAAAA', // e 회색
  '#555555', // f 짙은 회색
];

// 배경 팔레트 16색 (0번은 투명 = 뒤 레이어가 보임)
const BG_PAL = [
  null,      // 0 투명
  '#000000', // 1 검정
  '#FFFFFF', // 2 흰색
  '#AAFFFF', // 3 옅은 하늘
  '#55AAFF', // 4 하늘
  '#0055AA', // 5 깊은 파랑
  '#00AA00', // 6 풀
  '#AAFF55', // 7 연두
  '#005500', // 8 짙은 초록
  '#AA5500', // 9 흙
  '#550000', // a 짙은 흙
  '#FFAA55', // b 모래
  '#555555', // c 짙은 회색
  '#AAAAAA', // d 회색
  '#FF55AA', // e 분홍
  '#FFFF55', // f 노랑
];

// 같은 픽셀 데이터에 다른 팔레트를 입히는 '팔레트 스왑' 변형
const PAL_VARIANTS = {
  base: {},
  '2p': { 6: '#0055FF', 7: '#0000AA' },
  poison: { 3: '#AAFFAA', 6: '#AA55FF', 7: '#5500AA' },
  glow: { 4: '#FFAA55', 6: '#FFFF55', 7: '#FFAA00' },
  white: 'all-white',
};

function paletteFor(base, variant) {
  const v = PAL_VARIANTS[variant] || {};
  if (v === 'all-white') return base.map((c) => (c ? '#FFFFFF' : null));
  return base.map((c, i) => (c && v[i] ? v[i] : c));
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
