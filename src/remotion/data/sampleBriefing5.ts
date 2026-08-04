// ============================================================================
// sampleBriefing5 — 뉴스 → 종목 → 파급 → 우리 데이터
// ----------------------------------------------------------------------------
// 대표 지적: "차트만 보는 것이 아닌 이슈가 되는 뉴스 역시 뉴스와 연관지어서
//            종목을 설명하고, 거기에 우리가 가진 고급 자원을 접목해야 한다."
//
// 오늘의 소재 (전부 우리 API 실측, 2026-08-04):
//   뉴스  : Apple, 부품 원가 «상당한 상승» 경고 (GlobeNewswire, 8/3 11:37 PM ET)
//   반응  : AAPL -1.78% (지수 SPY 는 +1.42%)
//   파급  : 그런데 «부품 쪽»은 반대로 올랐다 — SNDK +6.03% · NVDA +2.93% · MU +0.79%
//           → 원가 상승은 애플에겐 «비용», 부품사에겐 «매출». 같은 뉴스, 반대 방향.
//   우리만 : 그 순간 옵션시장은 이미 어디에 묶여 있었나
//           MAX PAIN $310 / GAMMA FLIP $312.50 (현재가보다 위, -2.91%) / TOTAL PREMIUM $4.0M Call dominant
//
// 자막만 읽어도 흐름이 성립한다:
//   훅   애플이 부품 원가 경고를 냈다. 그런데 부품사는 올랐다.
//   01   뉴스가 나온 시각과 출처
//   02   애플은 지수와 반대로 갔다
//   03   같은 뉴스인데 부품 쪽은 반대로 갔다        ← «왜»가 여기서 풀린다
//   04   그 순간 옵션시장은 이미 어디에 묶여 있었나  ← 우리만 보여주는 층
//   루프백  하나의 뉴스, 두 개의 방향
//
// 컴플라이언스: 인과 단정 금지. 뉴스와 가격은 «같은 시간대»로만 잇는다.
// ============================================================================

import type { Briefing5Props } from '../compositions/BriefingV5';

const AAPL = [
  308.66, 308.00, 307.99, 307.91, 310.00, 309.87, 310.56, 311.60, 311.33, 310.15,
  306.95, 305.57, 305.75, 305.42, 302.75, 304.82, 306.56, 307.31, 306.23, 305.79,
  305.44, 305.05, 303.50, 303.43, 303.72, 303.77, 303.59, 303.64, 303.85, 303.54,
];

export const SAMPLE_BRIEFING_5: Briefing5Props = {
  dateBadge: 'AUG 4 · US MARKET',
  hookBg: 'shorts/broll/v25_scene6_dashboard.png',
  hookLine: 'Apple warned costs\nare going up.',
  hookSub: 'So why did its suppliers rally?',
  loopLine: 'One headline.\nTwo directions.',

  scenes: [
    {
      bg: 'shorts/broll/hook_wall.png',
      pan: 'in',
      eyebrow: 'The headline',
      head: 'Apple flagged rising\ncomponent costs',
      caption: 'The warning landed overnight, before the US open.',
      block: {
        kind: 'news',
        source: 'GlobeNewswire',
        at: 'Aug 3 · 11:37 PM ET',
        headline: 'Apple Warns of Substantially Increasing Component Costs',
        body: 'Guidance flagged a step-up in component costs, pointing to pressure across its supply chain.',
      },
    },
    {
      bg: 'shorts/wall_broll_v4_tall.png',
      pan: 'left',
      eyebrow: 'How the stock took it',
      head: 'The index rose.\nApple did not.',
      caption: 'S&P 500 finished +1.42%. Apple closed -1.78%.',
      block: {
        kind: 'quote',
        label: 'AAPL · APPLE INC',
        price: '$303.42',
        pct: '-1.78%',
        up: false,
        series: AAPL,
      },
    },
    {
      bg: 'shorts/broll/product_reveal.png',
      pan: 'out',
      eyebrow: 'Now look at the other side',
      head: 'The component makers\nwent the other way',
      caption: 'Higher component prices are a cost to Apple — and revenue to them.',
      block: {
        kind: 'rows',
        rows: [
          { t: 'SNDK', pct: '+6.03%', up: true, note: 'Memory · Sandisk' },
          { t: 'NVDA', pct: '+2.93%', up: true, note: 'Accelerators · Nvidia' },
          { t: 'MU', pct: '+0.79%', up: true, note: 'Memory · Micron' },
        ],
      },
    },
    {
      bg: 'shorts/broll/v25_scene2_darkpool.png',
      pan: 'in',
      eyebrow: 'What our app showed',
      head: 'The options market\nwas already positioned',
      caption: 'Gamma flip sat above the price. Premium leaned to calls.',
      block: {
        kind: 'levels',
        src: 'shorts/appshots/signum-aapl.png',
        focus: { x: 0.05, y: 0.155, w: 0.90 },
        items: [
          { k: 'MAX PAIN', v: '$310', sub: '-2.12% gap' },
          { k: 'GAMMA FLIP', v: '$312.50', sub: 'above (-2.91%)' },
          { k: 'TOTAL PREMIUM', v: '$4.0M', sub: 'Call dominant' },
        ],
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    cta: 'FREE · iOS & Android',
  },
};
