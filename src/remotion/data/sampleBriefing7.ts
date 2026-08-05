// ============================================================================
// sampleBriefing7 — 연쇄 커리오시티 루프 대본
// ----------------------------------------------------------------------------
// 레퍼런스 대본 판독(부록 A)에서 가져온 구조. 다만 «똑같이»가 아니라 «더».
//
// 저쪽 리듬:  님들 → 시급성 → 손실회피 → 내가 정리해왔다 → 날짜 → 큰 숫자
//            → **근데 그날 주가는?** → 전환 → 긴장 → **또 미끼**
// 우리 리듬:  같은 골격에 재료만 «남들이 못 보는 것»으로 바꾼다.
//            공시 문장 대신 옵션 플로우·다크풀·감마·딜러 포지션.
//
// 자막은 두 층:
//   fact = 사실 한 문장 (먼저 뜬다)
//   ask  = **답하지 않는 질문** (0.9초 뒤에 뜬다) ← 다음 컷이 답한다
//
// ★ 모든 ask 의 답은 «바로 다음 컷»에 있다. 그래서 넘길 수가 없다.
//
// 전부 실측 (2026-08-04~05, 우리 API + 앱 실화면):
//   MU +6.23% $881.17 · 옵션 순방향 -$251.8M · 최대 단일체결 $12.6M(콜 $900, BE $930)
//   AI 판정 하방압력 -59 (확신도 92%) · P/C 1.43
//   맥스페인 $855 (+2.99% 갭) · 감마플립 $850 (주가 위 +3.59%)
//   총프리미엄 $126.4M 콜 우세 · 다크풀 1,004 · 고래 242
//
// 컴플라이언스: 관찰형만. 질문은 «사실에 대한 질문»이지 방향 예측이 아니다.
// ============================================================================

import type { Briefing7Props } from '../compositions/BriefingV7';

const MU = [
  843.2, 845.9, 851.4, 849.7, 856.2, 858.5, 861.0, 859.4, 864.8, 867.2,
  866.1, 869.9, 872.4, 870.8, 875.3, 878.1, 876.4, 880.2, 883.5, 881.0,
  884.9, 888.7, 886.2, 883.4, 879.8, 877.5, 880.1, 882.6, 880.5, 881.2,
];

export const SAMPLE_BRIEFING_7: Briefing7Props = {
  dateBadge: 'AUG 4 · US MARKET',
  hookBg: 'shorts/broll/v25_scene6_dashboard.png',
  hookLine: 'Micron closed\nup 6.23%.',
  hookSub: 'The options money went the other way.',
  loopLine: 'One session.\nTwo stories.',

  scenes: [
    // ── 01 사실 + 첫 미끼 ───────────────────────────────────────────────────
    {
      bg: 'shorts/wall_broll_v4_tall.png',
      pan: 'left',
      eyebrow: 'What the tape showed',
      head: 'Micron finished\nthe session +6.23%',
      caption: 'It closed at $881.17, near the top of the day range.',
      ask: 'So I pulled the options book. Guess what it said.',
      block: { kind: 'quote', label: 'MU · MICRON', price: '$881.17', pct: '+6.23%', up: true, series: MU },
    },

    // ── 02 앞 질문의 «답» + 새 미끼 ─────────────────────────────────────────
    {
      bg: 'shorts/broll/v25_scene2_darkpool.png',
      pan: 'in',
      eyebrow: 'The answer',
      head: 'Net option flow:\nminus $251.8M',
      caption: 'The stock went up. The money leaned the other way.',
      ask: 'But one trade broke the pattern. One.',
      block: {
        kind: 'rows',
        rows: [
          { t: 'PRICE', pct: '+6.23%', up: true, note: 'the tape' },
          { t: 'FLOW', pct: '-$251.8M', up: false, note: 'the money' },
          { t: 'P/C', pct: '1.43', up: false, note: 'puts over calls' },
        ],
      },
    },

    // ── 03 그 «하나» + 새 미끼 ──────────────────────────────────────────────
    {
      bg: 'shorts/broll/v25_scene4_squeeze.png',
      pan: 'out',
      eyebrow: 'The one that broke it',
      head: 'A single $12.6M\ncall print',
      caption: 'Strike $900. Breakeven $930. The stock sits at $881.',
      ask: 'Someone paid to be right above the price. Is it working?',
      block: {
        kind: 'rows',
        rows: [
          { t: 'PREMIUM', pct: '$12.6M', up: true, note: 'largest single print' },
          { t: 'STRIKE', pct: '$900', up: true, note: 'exp 08/07' },
          { t: 'BREAKEVEN', pct: '$930', up: true, note: '5.5% above spot' },
        ],
      },
    },

    // ── 3.5 그 베팅의 «현재 위치» — 앞 질문에 절반만 답하고 또 미룬다 ──────
    {
      bg: 'shorts/broll/v25_scene5_implode.png',
      pan: 'left',
      eyebrow: 'Still under water',
      head: 'That bet still\nneeds 5.5% more',
      caption: 'Breakeven $930 against a $881 spot. It has not paid yet.',
      ask: 'So where did the rest of the book sit?',
      block: {
        kind: 'rows',
        rows: [
          { t: 'SPOT', pct: '$881', up: true, note: 'where it closed' },
          { t: 'BREAKEVEN', pct: '$930', up: false, note: 'what the bet needs' },
          { t: 'GAP', pct: '5.5%', up: false, note: 'distance to pay off' },
        ],
      },
    },

    // ── 04 앱 화면 = 그 «어디» 의 답 + 새 미끼 ──────────────────────────────
    {
      bg: 'shorts/broll/hook_wall.png',
      pan: 'in',
      eyebrow: 'Where the book was pinned',
      head: 'Max pain $855.\nGamma flip $850.',
      caption: 'Price is 3.59% above the flip, 2.99% off max pain.',
      ask: 'And that is only the part you can see on the surface.',
      block: {
        kind: 'levels',
        src: 'shorts/appshots/mu-cmd.png',
        // 프리셋 사용 — 가격 헤더 + 옵션 타일이 한 화면에. 빨간 네모는 GAMMA FLIP 칸.
        // y=0.160 이 «카드 상단 경계»와 정확히 맞는다(후보 4개를 실제로 잘라 비교해 확정).
        // 0.185 는 회사명 줄 중간을 잘라 위가 잘려 보였다.
        focus: { x: 0.04, y: 0.158, w: 0.92 },
        box: { x: 0.355, y: 0.268, w: 0.285, h: 0.085 },
        // 화면 자체가 세 수치를 다 보여준다 -> 카드로 또 쓰면 중복. 비워서 화면을 키운다.
        items: [],
      },
    },

    // ── 05 마지막 층 — 우리만 있는 것 ───────────────────────────────────────
    {
      bg: 'shorts/broll/v25_scene3_reveal.png',
      pan: 'right',
      eyebrow: 'Not just one name',
      head: 'The whole memory shelf\nmoved together',
      caption: 'Micron, Nvidia and Sandisk all closed green on the same session.',
      ask: 'The chart showed one thing. The book showed another.',
      // 로고 스트립 — 티커 글자보다 로고가 즉시 읽힌다(대표 지적: 사람이 아는 것이 더 무섭다)
      block: {
        kind: 'logos',
        items: [
          { t: 'MU', pct: '+6.23%', up: true },
          { t: 'NVDA', pct: '+1.76%', up: true },
          { t: 'SNDK', pct: '+6.03%', up: true },
        ],
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    cta: 'FREE · iOS & Android',
    ask: 'Which one would you have trusted —\nthe chart, or the book?',
  },
};
