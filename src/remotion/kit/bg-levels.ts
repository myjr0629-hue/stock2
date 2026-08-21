// 자동 생성 — 배경 클립별 «원본 평균 밝기» (ffmpeg signalstats YAVG, 전구간 평균)
//   갱신: scripts/bg-levels.mjs
//
// 왜 필요한가 (2026-08-20)
//   밝기를 올리려고 «전 클립에 brightness(1.42)» 를 일괄로 걸었다.
//   어두운 클립(geo-flare-stack-night 41)은 살았지만
//   밝은 클립(paper-crowd 167)은 237 로 타서 자막이 안 읽혔다 — 대표 확인.
//   → 클립마다 «자기 밝기»로 나눠 목표값에 맞춘다. 일괄 배율은 쓰지 않는다.
//   잘 되어 있는 것은 건드리지 않고, 어긋난 것만 되돌린다.

// ⛔ 아래 4개는 scripts/declip.mjs 로 «워터마크 크롭 + 1080x1920 업스케일» 후의 값이다.
//   Flow 클립은 720x1280 + 우하단 ✦ 워터마크로 온다 — 반드시 declip 을 거친다.
export const BG_LEVEL: Record<string, number> = {
  // 애니 클립 — declip 처리 완료 (1080x1920, 워터마크 제거). 발주서 .agent/CLIP_ORDERS.md
  'ani-ai-bubble.mp4': 133,
  'ani-armwrestle.mp4': 95,
  'ani-bell-strike.mp4': 117,
  'ani-bull-bear.mp4': 91,
  'ani-china-us.mp4': 114,
  'ani-chip-carry.mp4': 100,
  'ani-circuit-city.mp4': 85,
  'ani-data-pillars.mp4': 81,
  'ani-dominoes.mp4': 137,
  'ani-door-open.mp4': 92,
  'ani-fed-dial.mp4': 98,
  'ani-fed-gavel.mp4': 110,
  'ani-geo-seesaw.mp4': 52,
  'ani-glass-heal.mp4': 106,
  'ani-juggle-mm.mp4': 104,
  'ani-network.mp4': 71,
  'ani-point-same.mp4': 117,
  'ani-scale-tip.mp4': 134,
  'ani-servers-wake.mp4': 80,
  'ani-storm-part.mp4': 103,
  'ani-sunrise.mp4': 115,
  'ani-surf-megacap.mp4': 119,
  'ani-tanker.mp4': 106,
  'ani-two-smile.mp4': 126,
  'ani-vault-open.mp4': 87,
  'ani-wafer-lift.mp4': 120,
  'gold-btc-race.mp4': 141,      // 2026-08-21 대표 제공 — 금괴 vs 비트코인 «경쟁→악수→동행»
  'gold-vault-bars.mp4': 85,     // 2026-08-21 대표 제공 — 금고 안 금괴
  'c811-00-exchange.mp4': 104,
  'c811-01-cleanroom.mp4': 158,
  'c811-02-mirrorcity.mp4': 138,
  'c811-03-energygrid.mp4': 121,
  'c811-04-papercrowd.mp4': 167,
  'c811-05-mirrorfield.mp4': 124,
  'c811-06-columns-tight.mp4': 114,
  'c811-07-wafer-tight.mp4': 153,
  'c811-hook-chip.mp4': 121,
  'calm-sea-dawn.mp4': 116,
  'chip-city.mp4': 108,
  'chip-glow.mp4': 94,
  'chip-macro-grey.mp4': 120,
  'chip-underside.mp4': 130,
  'columns-birds.mp4': 104,
  'columns-goldenhour.mp4': 75,
  'copper-mine-dusk.mp4': 64,
  'copper-mine-molten.mp4': 87,
  'crack-star.mp4': 130,
  'datacenter-aisle.mp4': 97,
  'desks-dawn.mp4': 144,
  'device-assembly-bright.mp4': 118,
  'device-counter-bright.mp4': 133,
  'euv-plasma-a.mp4': 66,
  'euv-plasma-b.mp4': 59,
  'exchange-flags.mp4': 98,
  'exchange-storm.mp4': 68,
  'fab-hall-bright.mp4': 139,
  'fed-building.mp4': 106,
  'fiber-one-lit.mp4': 157,
  'floor-empty-night.mp4': 76,
  'geo-corridor-light.mp4': 51,
  'geo-flare-stack-night.mp4': 41,
  'geo-port-day.mp4': 107,
  'geo-port-fog-night.mp4': 57,
  'geo-radar-dusk.mp4': 61,
  'geo-refinery-day.mp4': 107,
  'geo-strait-day.mp4': 111,
  'glass-tube-array.mp4': 93,
  'gold-bars.mp4': 81,
  'golden-bell.mp4': 147,
  'grid-heliostat.mp4': 121,
  'humanoid-robot.mp4': 159,
  'mini-construction.mp4': 168,
  'minicity-water.mp4': 131,
  'mirror-city.mp4': 138,
  'nyse-flags.mp4': 101,
  'paper-crowd.mp4': 167,
  'pcb-cyan-dark.mp4': 87,
  'pcb-one-chip-lit.mp4': 130,
  'pcb-traces-glow.mp4': 106,
  'quantum-fridge.mp4': 107,
  'rams-vs-block.mp4': 77,
  'refinery-stacks.mp4': 99,
  'retail-carts-dusk.mp4': 67,
  'retail-checkout-empty.mp4': 55,
  'retail-shutter-night.mp4': 69,
  'retail-warehouse-aisle.mp4': 77,
  'rise-glass-tower.mp4': 112,
  'rise-stairs-light.mp4': 123,
  'rocket-ignition.mp4': 116,
  'scale-few-vs-many.mp4': 162,
  'server-assembly.mp4': 114,
  'skyline-red-river.mp4': 98,
  'skyline-sunrise-fog.mp4': 101,
  'steel-balls.mp4': 145,
  'steel-spheres.mp4': 178,
  'supertanker.mp4': 93,
  'tankers-strait.mp4': 125,
  'tape-wall-scroll.mp4': 74,
  'tech-euv-litho.mp4': 56,
  'temple-storm.mp4': 71,
  'undercurrent-pull.mp4': 102,
  'vault-doors.mp4': 89,
  'wafer-arm.mp4': 157,
  'wafer-press.mp4': 75,
  'wafer-spin-clean.mp4': 122,
};

/** 목표 밝기 — «클립 자체» 기준이다.
 *  ⛔ 128 로 잡았더니 최종 프레임 평균이 79 로 떨어졌다 (실측).
 *     상하단 스크림·오버레이가 클립 밝기의 약 38% 를 먹기 때문이다.
 *     128 × 0.62 ≈ 79.  →  90 이상을 얻으려면 클립을 150 으로 맞춰야 한다. */
export const BG_TARGET = 163;

/** 클립 경로 → brightness 배율. 과도한 보정은 자른다 */
export function bgGain(src: string): number {
  const key = (src.split('/').pop() || '');
  const lv = BG_LEVEL[key];
  if (!lv) return 1.15;
  return Math.max(0.7, Math.min(2.2, BG_TARGET / lv));
}
