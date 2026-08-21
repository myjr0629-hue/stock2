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
  "ani-ai-bubble": 1.5,   // 0초 18.58 → 최고 23.32
  "ani-armwrestle": 1.75,   // 0초 13.31 → 최고 34.05
  "ani-arrows-flow": 4.75,   // 0초 37.94 → 최고 51.89
  "ani-beach-sunrise": 4.25,   // 0초 4.13 → 최고 15.76
  "ani-bear-escalator": 3,   // 0초 18.4 → 최고 30.72
  "ani-bell-strike": 4.75,   // 0초 3.27 → 최고 32.35
  "ani-btc-launch": 2.5,   // 0초 16.5 → 최고 32.49
  "ani-bull-bear": 1.5,   // 0초 8.27 → 최고 26.22
  "ani-bull-bear-fight": 4,   // 0초 32.63 → 최고 39.98
  "ani-bull-bell": 4.25,   // 0초 7.9 → 최고 31.71
  "ani-china-us": 4.25,   // 0초 4.01 → 최고 39.08
  "ani-chip-carry": 3,   // 0초 15.83 → 최고 23.12
  "ani-chip-conveyor": 0.5,   // 0초 25.98 → 최고 26.44
  "ani-chip-pull": 3.25,   // 0초 3.73 → 최고 27.54
  "ani-circuit-city": 1,   // 0초 26.03 → 최고 33.82
  "ani-data-pillars": 4.75,   // 0초 5.59 → 최고 22.77
  "ani-dominoes": 1.25,   // 0초 3.99 → 최고 25.02
  "ani-door-open": 3.75,   // 0초 2.19 → 최고 9.16
  "ani-expression-flip": 4.5,   // 0초 4.19 → 최고 30.05
  "ani-fed-dial": 4.25,   // 0초 4.01 → 최고 21.43
  "ani-fed-gavel": 4,   // 0초 7.4 → 최고 30.69
  "ani-floor-fills": 3.5,   // 0초 4.98 → 최고 31.34
  "ani-geo-seesaw": 2,   // 0초 0.4 → 최고 2.71
  "ani-glass-corridor": 2.5,   // 0초 10.49 → 최고 18.67
  "ani-glass-heal": 4.5,   // 0초 15.66 → 최고 23.6
  "ani-house-stairs": 4,   // 0초 32.27 → 최고 29.63
  "ani-juggle-mm": 2,   // 0초 27.26 → 최고 45.48
  "ani-lights-out": 3.75,   // 0초 9.6 → 최고 23
  "ani-network": 4.5,   // 0초 14.36 → 최고 32.13
  "ani-office-fade": 4.5,   // 0초 6.48 → 최고 24.75
  "ani-pipeline-pulse": 3.5,   // 0초 10.78 → 최고 22.34
  "ani-point-same": 4,   // 0초 3.64 → 최고 25.96
  "ani-point-shock": 3.25,   // 0초 19.19 → 최고 31.02
  "ani-rain-shelter": 3.75,   // 0초 14.69 → 최고 18.2
  "ani-rubber-band": 2,   // 0초 16.29 → 최고 24.58
  "ani-scale-tip": 4.25,   // 0초 2.71 → 최고 14.93
  "ani-servers-wake": 3,   // 0초 4.78 → 최고 31.39
  "ani-storm-part": 2.5,   // 0초 8.18 → 최고 16.31
  "ani-sunrise": 2,   // 0초 9.3 → 최고 23.04
  "ani-surf-megacap": 2.5,   // 0초 32.22 → 최고 44.13
  "ani-tanker": 1.75,   // 0초 11.35 → 최고 25.18
  "ani-tipping-balance": 4.25,   // 0초 4.81 → 최고 17.67
  "ani-two-smile": 3.75,   // 0초 3.9 → 최고 22.41
  "ani-us-bull": 1.5,   // 0초 19.38 → 최고 30.56
  "ani-vault-open": 2,   // 0초 4.54 → 최고 22.16
  "ani-vault-through": 4.75,   // 0초 11.03 → 최고 16.68
  "ani-wafer-lift": 2.5,   // 0초 15.35 → 최고 31.49
  "c811-01-cleanroom": 1.5,   // 0초 5.02 → 최고 23.6
  "c811-03-energygrid": 1,   // 0초 8.49 → 최고 8.9
  "c811-04-papercrowd": 0.75,   // 0초 0.78 → 최고 8.26
  "chip-glow": 0.75,   // 0초 6.17 → 최고 35.62
  "copper-mine-dusk": 9.75,   // 0초 2.88 → 최고 16.33
  "device-assembly-bright": 7,   // 0초 2.68 → 최고 15.76
  "device-counter-bright": 3.75,   // 0초 1.31 → 최고 5.65
  "exchange-storm": 9.75,   // 0초 5.35 → 최고 10.59
  "fed-building": 0.75,   // 0초 8.87 → 최고 21.61
  "floor-empty-night": 4.75,   // 0초 10.82 → 최고 18.46
  "geo-corridor-light": 9.5,   // 0초 1.45 → 최고 4.53
  "geo-flare-stack-night": 3.75,   // 0초 5.39 → 최고 8.39
  "geo-port-fog-night": 4.25,   // 0초 3.7 → 최고 7.87
  "geo-radar-dusk": 3.25,   // 0초 0.75 → 최고 1.09
  "geo-refinery-day": 4.25,   // 0초 21.11 → 최고 30.7
  "geo-strait-day": 5.75,   // 0초 3.86 → 최고 13.02
  "gold-btc-race": 0.5,   // 0초 34.13 → 최고 34.27
  "gold-vault-bars": 2.25,   // 0초 5.21 → 최고 30.56
  "grid-heliostat": 1,   // 0초 8.46 → 최고 8.95
  "minicity-water": 4.5,   // 0초 16.97 → 최고 21.55
  "paper-crowd": 0.75,   // 0초 0.79 → 최고 8.44
  "rams-vs-block": 4.75,   // 0초 14.6 → 최고 12.49
  "retail-carts-dusk": 0.75,   // 0초 10.75 → 최고 14.23
  "retail-checkout-empty": 4.5,   // 0초 3.98 → 최고 10.55
  "retail-shutter-night": 4.25,   // 0초 0.87 → 최고 28.14
  "retail-warehouse-aisle": 0.25,   // 0초 12.34 → 최고 13.21
  "rise-stairs-light": 1.25,   // 0초 11.58 → 최고 25.2
  "server-assembly": 0.75,   // 0초 22.28 → 최고 29.2
  "steel-balls": 1.75,   // 0초 5.01 → 최고 53.7
  "steel-spheres": 0.25,   // 0초 5.5 → 최고 10.42
  "tape-wall-scroll": 4.75,   // 0초 12.67 → 최고 24.81
  "temple-storm": 9.75,   // 0초 1.23 → 최고 6.09
  "undercurrent-pull": 4.75,   // 0초 17.63 → 최고 31.06
  "wafer-arm": 1.5,   // 0초 5.14 → 최고 24.25
  "wafer-spin-clean": 1.5,   // 0초 14.82 → 최고 15.75
};

/** fps 를 받아 «프레임» 으로 준다. 없으면 0. */
export const bestStartFrame = (src: string, fps = 30): number => {
  const name = String(src).split("/").pop()?.replace(/.mp4$/, "") ?? "";
  return Math.round((CLIP_BEST_START[name] ?? 0) * fps);
};
