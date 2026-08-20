// ============================================================================
// kit/phonead-signum — 「공중 폰 + 살아 움직이는 차트 + FREE」 광고 대본
// ----------------------------------------------------------------------------
// 대본 원칙 (대표 지시 2026-08-19):
//   · 지표 «이름»만 던지지 않는다. 「그게 무엇인지」 한 줄을 반드시 붙인다.
//     시청자가 「아, 이 앱 쓰면 free 로 저걸 볼 수 있구나」가 되어야 광고다.
//   · 앞에 붙던 분위기 컷(고래·트레이더·폰글로우)은 «전부 뺐다» — 기여가 0이었다.
//   · 밝은 판. 어두운 게 고급이라는 편견은 버린다.
//
// 배경 시계열 = AMD 2026 일봉 종가 64점 (Yahoo, 2026-01-02 ~ 08-18)
//   저점 190.9 → 고점 580.9 → 종가 484.4. «진짜 궤적»이 흐른다.
//
// focus 좌표는 ad-cmd.png / ad-flow.png (1206x2622) 기준 «비율».
//   x,y = 좌상단, w = 폭. 세로는 비율로 따라온다.
// ============================================================================

import type { PhoneAdProps } from './PhoneAd';

export const AMD_SERIES = [
  223.5, 214.4, 204.7, 207.7, 223.6, 231.8, 249.8, 259.7, 252.0, 252.2, 246.3, 200.2,
  208.4, 213.6, 205.9, 203.1, 203.4, 196.6, 210.9, 200.2, 190.9, 199.4, 202.7, 204.8,
  193.4, 196.3, 205.3, 202.7, 220.3, 202.0, 203.4, 217.5, 221.5, 236.6, 246.8, 258.1,
  278.4, 284.5, 305.3, 334.6, 337.1, 360.5, 355.3, 408.5, 458.8, 445.5, 424.1, 414.0,
  449.6, 503.9, 518.1, 510.1, 542.5, 466.4, 475.5, 488.5, 547.3, 512.5, 551.6, 519.7,
  521.6, 580.9, 517.8, 484.4,
];

export const PHONEAD_SIGNUM: PhoneAdProps = {
  series: AMD_SERIES,
  scenes: [
    // 1) 전체 화면 — 「이런 게 한 화면에 다 있다」
    {
      shot: 'shorts/appshots/ad-cmd.png',
      term: 'ONE SCREEN',
      define: 'Every options signal on one stock, in one place.',
      sec: 3.4,
    },
    // 2) MAX PAIN — 이름 + 정의
    {
      shot: 'shorts/appshots/ad-cmd.png',
      focus: { x: 0.02, y: 0.24, w: 0.52 },
      term: 'MAX PAIN',
      define: 'The price where the most option contracts expire worthless.',
      sec: 3.4,
    },
    // 3) GAMMA FLIP
    {
      shot: 'shorts/appshots/ad-cmd.png',
      focus: { x: 0.30, y: 0.24, w: 0.52 },
      term: 'GAMMA FLIP',
      define: 'Where dealers stop cushioning the move and start amplifying it.',
      sec: 3.6,
    },
    // 4) AI 판정 — 「한 줄로 결론」
    {
      shot: 'shorts/appshots/ad-flow.png',
      focus: { x: 0.04, y: 0.455, w: 0.86 },
      term: 'THE VERDICT',
      define: 'The whole options book, read down to one line.',
      sec: 3.6,
    },
  ],
  ctaSec: 3.4,
  storeLine: 'iOS & Android',
  disclaimer: 'Informational only. Not investment advice.',
};
