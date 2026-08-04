// ============================================================================
// sampleBriefing4 — 커리오시티 루프 대본
// ----------------------------------------------------------------------------
// 자막만 읽어도 «질문 → 추적 → 답 → 여운»이 성립해야 한다.
//   훅   지수는 올랐다. 그런데 이건 3.33% 빠졌다.   ← 답을 주지 않는다(루프 열림)
//   01   같은 하루인데 방향이 갈렸다
//   02   끌어내린 건 반도체 세 종목이었다
//   03   같은 테이프 위에서 정반대에 걸린 두 상품
//   04   옵션 시장은 이미 어디에 묶여 있었다        ← 답(루프 닫힘)
//   루프백  하나의 테이프, 두 개의 방향             ← 첫 컷 배경으로 되돌아간다
//
// 배경은 «그림이 내용을 말하도록» 짝지었다:
//   훅/루프백 = 트레이딩 플로어(같은 이미지로 루프)
//   반도체    = 회로기판 / 정반대 = 빨강↔청록 대비 / 답 = 데이터 벽
//
// 숫자는 전부 우리 API 실측(2026-08-03 장중). 관찰형만, 예측 0.
// ============================================================================

import type { Briefing4Props } from '../compositions/BriefingV4';

const SOXL = [
  117.5, 117.0, 112.8, 114.1, 115.5, 115.5, 115.2, 114.2, 113.7, 113.8,
  111.5, 109.5, 110.6, 111.2, 108.7, 109.1, 109.2, 107.6, 105.5, 106.6,
  106.6, 106.4, 106.4, 106.2, 107.2, 102.2, 102.5, 107.4, 107.8, 110.9,
];

export const SAMPLE_BRIEFING_4: Briefing4Props = {
  hookBg: 'shorts/broll/v25_scene6_dashboard.png',
  hookLine: 'The market\nclosed higher.',
  hookSub: 'So why did this fall 3.33%?',
  loopLine: 'One tape.\nTwo directions.',

  scenes: [
    {
      bg: 'shorts/wall_broll_v4_tall.png',
      pan: 'left',
      eyebrow: 'Same session',
      head: 'The index and the chips\nsplit apart',
      caption: 'Same day. The index rose, semiconductors did not.',
      block: { kind: 'pair', aLabel: 'S&P 500', aVal: '+1.01%', bLabel: 'SMH · SEMIS', bVal: '-0.39%' },
    },
    {
      bg: 'shorts/broll/product_reveal.png',
      pan: 'out',
      eyebrow: 'Where the drag came from',
      head: 'Three names did\nmost of the damage',
      caption: 'AVGO, MU and SMH pulled the sector down all session.',
      block: {
        kind: 'chart',
        title: 'SOXL intraday · Aug 3',
        unit: 'USD',
        series: SOXL,
        marks: [{ i: 0, text: '117.5' }, { i: 25, text: '102.2' }, { i: 29, text: '110.9' }],
        source: '*Source: SIGNUM HQ market data · 1-minute bars',
      },
    },
    {
      bg: 'shorts/broll/pressure_compression.png',
      pan: 'right',
      eyebrow: 'Same tape, opposite bets',
      head: 'One fell 3.33%.\nIts mirror rose 3.06%.',
      caption: 'Leveraged and inverse — both settled on the same session.',
      block: {
        kind: 'mirror',
        aLabel: 'SOXL · 3X SEMIS', aVal: '-3.33%',
        bLabel: 'SOXS · INVERSE', bVal: '+3.06%',
        series: SOXL,
      },
    },
    {
      bg: 'shorts/broll/hook_wall.png',
      pan: 'in',
      eyebrow: 'What our app showed',
      head: 'The options market\nwas already pinned',
      caption: 'Max pain, gamma flip and dealer premium — on one screen.',
      block: {
        kind: 'app',
        src: 'shorts/appshots/signum-cmd.png',
        focus: { x: 0.05, y: 0.46, w: 0.90 },
        note: 'MAX PAIN · GAMMA FLIP · TOTAL PREMIUM',
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    cta: 'FREE · iOS & Android',
  },
};
