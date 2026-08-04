// ============================================================================
// sampleBriefing3 — 레퍼런스 구조 + 리텐션 조사 반영 대본
// ----------------------------------------------------------------------------
// 조사(2026-08-04, 숏폼 리텐션):
//   · 시청자는 **1.5~3초**에 결정. 3초 통과율 60%+ 라야 알고리즘이 밀어준다
//   · «인내를 요구하는 오프닝»(로고·인사·긴 맥락·**타이틀 카드**)이 리텐션을 죽인다
//   · 훅은 10~14단어로 «뭘 얻는지» 즉시
//   · 85%가 무음 시청 → 굵은 자막이 완주율 40% 상승
//   · 차트는 하나면 충분. 한 각도 · 쉬운 말 · 강한 시각 하나
//
// ⇒ 레퍼런스(TIGER ETF)는 「01 알파벳 어닝 서프라이즈」 타이틀 카드로 연다.
//   그건 **이미 구독자가 있는 브랜드 채널**이라 가능한 것. 우리는 구독자 0이다.
//   → 시각 언어(풀블리드 실사·거대 앰버 헤드라인·리서치 차트)는 가져오되
//     **첫 컷은 번호 없이 헤드라인부터** 때린다.
//
// 배경은 그림이 내용을 말하도록 짝지었다:
//   반도체 → 회로기판 / «정반대» → 빨강↔청록 대비 / 시장 → 트레이딩 플로어
//
// 숫자는 전부 우리 API 실측(2026-08-03 장중). 컴플라이언스: 관찰형만.
// ============================================================================

import type { Briefing3Props } from '../compositions/BriefingV3';

const SOXL = [
  117.5, 117.0, 112.8, 114.1, 115.5, 115.5, 115.2, 114.2, 113.7, 113.8,
  111.5, 109.5, 110.6, 111.2, 108.7, 109.1, 109.2, 107.6, 105.5, 106.6,
  106.6, 106.4, 106.4, 106.2, 107.2, 102.2, 102.5, 107.4, 107.8, 110.9,
];

export const SAMPLE_BRIEFING_3: Briefing3Props = {
  kicker: 'SIGNUM BRIEFING',

  scenes: [
    // ── 훅 (0~5s) — 번호·아이브로 없이 바로. 13단어. 모순을 즉시 던진다 ──
    {
      hook: true,
      bg: 'shorts/broll/v25_scene6_dashboard.png',   // 트레이딩 플로어
      pan: 'in',
      eyebrow: '',
      head: 'The market went up.\nSemis went down.',
      subline: 'Aug 3 · US market · one tape, two stories',
    },

    // ── 01 지수는 올랐다 ──
    {
      bg: 'shorts/wall_broll_v4_tall.png',           // 캔들차트 네온 (세로 소재)
      pan: 'left',
      eyebrow: 'What the index did',
      head: 'S&P 500 closed\n+1.01%',
      subline: 'Broad market finished the session higher',
      block: {
        kind: 'chart',
        title: 'SOXL intraday · Aug 3',
        unit: 'USD',
        series: SOXL,
        color: '#5FA8FF',
        marks: [{ i: 0, text: '117.5' }, { i: 25, text: '102.2' }, { i: 29, text: '110.9' }],
      },
      source: '*Source: SIGNUM HQ market data · intraday, 1-minute bars',
    },

    // ── 02 그런데 반도체는 반대 — 배경: 회로기판 ──
    {
      bg: 'shorts/broll/product_reveal.png',
      pan: 'out',
      eyebrow: 'Where the drag came from',
      head: 'Semiconductors\nwent the other way',
      subline: 'Three names did most of the damage',
      block: {
        kind: 'stat',
        rows: [
          { label: 'AVGO', value: '-2.02%', up: false },
          { label: 'MU', value: '-1.73%', up: false },
          { label: 'SMH', value: '-0.39%', up: false },
        ],
      },
      source: '*Source: SIGNUM HQ market data · Aug 3, intraday',
    },

    // ── 03 같은 하루, 정반대 — 배경: 빨강↔청록 대비 이미지 ──
    {
      bg: 'shorts/broll/pressure_compression.png',
      pan: 'right',
      eyebrow: 'Same tape, opposite bets',
      head: 'One fell 3.33%.\nIts mirror rose 3.06%.',
      subline: 'Leveraged and inverse, on the same session',
      block: {
        kind: 'mirror',
        aLabel: 'SOXL · 3X SEMIS', aValue: '-3.33%',
        bLabel: 'SOXS · INVERSE', bValue: '+3.06%',
        series: SOXL,
      },
      source: '*Leveraged & inverse ETFs · daily-reset products',
    },

    // ── 04 우리 앱이 본 것 — 배경: 데이터 벽 앞 사람 ──
    {
      bg: 'shorts/broll/hook_wall.png',
      pan: 'in',
      eyebrow: 'What our app showed',
      head: 'The options market\nwas already pinned',
      subline: 'Max pain, gamma flip and dealer premium in one screen',
      block: {
        kind: 'app',
        src: 'shorts/appshots/signum-cmd.png',
        focus: { x: 0.04, y: 0.40, w: 0.92 },
        note: 'MAX PAIN · GAMMA FLIP · TOTAL PREMIUM',
      },
      source: '*SIGNUM HQ · live screen, Aug 3',
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    cta: 'FREE · iOS & Android',
  },
};
