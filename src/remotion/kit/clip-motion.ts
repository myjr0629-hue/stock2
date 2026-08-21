// ============================================================================
// clip-motion — 배경 클립마다 «동작이 가장 센 지점»(초)
// ----------------------------------------------------------------------------
// ⛔ 자동 생성. 고치지 말 것 —  node scripts/clip-motion.mjs  가 다시 만든다.
//
// 왜 (2026-08-21 조사)
//   쇼츠 배포의 단일 최대 신호는 VVSA(보고 남는가 vs 스와이프)다.
//   첫 프레임이 «정지»면 뇌가 «아무 일도 안 일어난다»고 읽고 손가락이 넘어간다.
//
//   ★ 우리는 영상을 «코드»로 만든다 — 클립의 어느 지점에서 시작할지 고를 수 있다.
//     실측: 우리 훅 클립들이 0초에서 거의 정지였다.
//       ani-dominoes    0초 동작 3.99 vs 최고 25.02  → 6.3배 손해
//       ani-bell-strike 0초 동작 3.27 vs 최고 32.35  → 9.9배 손해
//     ⇒ 훅 배경은 «최고 구간»에서 시작한다. 이 표가 그 지점이다.

/** 클립 이름 → 동작이 가장 센 5초 창의 시작 «초» */
export const CLIP_BEST_START: Record<string, number> = {
  "ani-ai-bubble": 1.5,
  "ani-armwrestle": 1.75,
  "ani-arrows-flow": 4.75,
  "ani-bag-vs-chip": 1.75,
  "ani-beach-sunrise": 4.25,
  "ani-bear-escalator": 3,
  "ani-bell-strike": 4.75,
  "ani-block-train": 2,
  "ani-btc-launch": 2.5,
  "ani-btc-react": 0.5,
  "ani-bull-bear": 1.5,
  "ani-bull-bear-fight": 4,
  "ani-bull-bell": 4.25,
  "ani-china-us": 4.25,
  "ani-chip-carry": 3,
  "ani-chip-conveyor": 0.5,
  "ani-chip-pull": 3.25,
  "ani-circuit-city": 1,
  "ani-coin-liquidation": 4.75,
  "ani-data-pillars": 4.75,
  "ani-dominoes": 1.25,
  "ani-door-open": 3.75,
  "ani-expression-flip": 4.5,
  "ani-fed-dial": 4.25,
  "ani-fed-gavel": 4,
  "ani-floor-fills": 3.5,
  "ani-geo-seesaw": 2,
  "ani-glass-corridor": 2.5,
  "ani-glass-heal": 4.5,
  "ani-house-stairs": 4,
  "ani-juggle-mm": 2,
  "ani-lights-out": 3.75,
  "ani-network": 4.5,
  "ani-office-fade": 4.5,
  "ani-oil-grows": 4,
  "ani-pipeline-pulse": 3.5,
  "ani-point-same": 4,
  "ani-point-shock": 3.25,
  "ani-rain-shelter": 3.75,
  "ani-rubber-band": 2,
  "ani-scale-tip": 4.25,
  "ani-servers-wake": 3,
  "ani-storm-part": 2.5,
  "ani-sunrise": 2,
  "ani-surf-megacap": 2.5,
  "ani-tanker": 1.75,
  "ani-tipping-balance": 4.25,
  "ani-two-smile": 3.75,
  "ani-us-bull": 1.5,
  "ani-vault-drain": 1.5,
  "ani-vault-open": 2,
  "ani-vault-through": 4.75,
  "ani-wafer-lift": 2.5,
  "c811-01-cleanroom": 1.5,
  "c811-03-energygrid": 1,
  "c811-04-papercrowd": 0.75,
  "chip-glow": 0.75,
  "copper-mine-dusk": 9.75,
  "device-assembly-bright": 7,
  "device-counter-bright": 3.75,
  "exchange-storm": 9.75,
  "fed-building": 0.75,
  "floor-empty-night": 4.75,
  "geo-corridor-light": 9.5,
  "geo-flare-stack-night": 3.75,
  "geo-port-fog-night": 4.25,
  "geo-radar-dusk": 3.25,
  "geo-refinery-day": 4.25,
  "geo-strait-day": 5.75,
  "gold-btc-race": 0.5,
  "gold-vault-bars": 2.25,
  "grid-heliostat": 1,
  "minicity-water": 4.5,
  "paper-crowd": 0.75,
  "rams-vs-block": 4.75,
  "retail-carts-dusk": 0.75,
  "retail-checkout-empty": 4.5,
  "retail-shutter-night": 4.25,
  "retail-warehouse-aisle": 0.25,
  "rise-stairs-light": 1.25,
  "server-assembly": 0.75,
  "steel-balls": 1.75,
  "steel-spheres": 0.25,
  "tape-wall-scroll": 4.75,
  "temple-storm": 9.75,
  "undercurrent-pull": 4.75,
  "wafer-arm": 1.5,
  "wafer-spin-clean": 1.5,
};

/** fps 를 받아 «프레임» 으로 준다. 없으면 0. */
export const bestStartFrame = (src: string, fps = 30): number => {
  const name = String(src).split("/").pop()?.replace(/.mp4$/, "") ?? "";
  return Math.round((CLIP_BEST_START[name] ?? 0) * fps);
};
