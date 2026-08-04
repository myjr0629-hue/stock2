// ============================================================================
// sampleBriefing2 — 이야기로 이어지는 대본
// ----------------------------------------------------------------------------
// V1은 수치 나열이었다. 「+1.01% / SMH -0.39% / SOXL -3.33%」— 전부 사실인데
// 보는 사람은 «그래서?»가 된다. 대표 지적: "이야기의 흐름이 이어져야 몰입이 된다."
//
// 그래서 6개 컷을 «질문 → 모순 → 증거 → 반전 → 답 → 여운»으로 짰다.
// 각 컷의 자막이 다음 컷을 궁금하게 만든다. 자막만 읽어도 이야기가 성립해야 한다:
//
//   1  오늘 시장은 올랐습니다.
//   2  그런데 반도체만 반대로 갔습니다.
//   3  지수를 끌어내린 건 이 세 종목이었습니다.
//   4  같은 하루, 정반대에 걸린 두 상품.
//   5  옵션 시장은 이미 어디에 묶여 있었는지 보여줍니다.
//   6  하나의 테이프, 두 개의 방향.
//
// 숫자는 전부 우리 API 실측(2026-08-03 장중). 지어낸 값 없음.
// 컴플라이언스: 관찰형만. 예측·매수매도·방향 암시 0.
// ============================================================================

import type { Briefing2Props } from '../compositions/BriefingV2';

// SOXL 8/3 장중 1분봉 → 30점 균등 다운샘플
const SOXL_INTRADAY = [
  117.54, 117.02, 112.79, 114.12, 115.54, 115.50, 115.21, 114.20, 113.67, 113.76,
  111.48, 109.46, 110.59, 111.17, 108.67, 109.05, 109.20, 107.60, 105.47, 106.60,
  106.60, 106.37, 106.37, 106.22, 107.19, 102.15, 102.54, 107.43, 107.79, 110.91,
];

export const SAMPLE_BRIEFING_2: Briefing2Props = {
  dateLine: 'AUG 3 · US MARKET',

  // 자막 = 이야기. 라벨이 아니라 문장. 무음으로 읽혀야 한다.
  cap: [
    'The market closed higher today.',
    'But semiconductors went the other way.',
    'These three did most of the damage.',
    'Same day. Opposite sides of the same trade.',
    'Our app showed where the options market was pinned.',
    'One tape. Two directions.',
  ],

  indexLabel: 'S&P 500',
  indexPct: '+1.01%',

  sectorLabel: 'SEMICONDUCTORS · SMH',
  sectorPct: '-0.39%',

  laggards: [
    { t: 'AVGO', pct: '-2.02%' },
    { t: 'MU', pct: '-1.73%' },
    { t: 'SMH', pct: '-0.39%' },
  ],

  bullLabel: 'SOXL · 3X SEMIS',
  bullPct: '-3.33%',
  bullSeries: SOXL_INTRADAY,

  bearLabel: 'SOXS · INVERSE',
  bearPct: '+3.06%',

  // 앱 캡처는 «확대»해서 보여준다. 통째로 줄이면 안 읽힌다(V1 실패).
  // focus = 원본 대비 비율. Command 화면의 옵션 레벨 타일 영역.
  appShot: 'shorts/appshots/signum-cmd.png',
  appFocus: { x: 0.04, y: 0.40, w: 0.92 },
  appNote: 'MAX PAIN · GAMMA FLIP · TOTAL PREMIUM',

  payoff: 'One tape.\nTwo directions.',
  outroApp: 'SIGNUM HQ',
  outroLine: 'The tape institutions leave behind',
};
